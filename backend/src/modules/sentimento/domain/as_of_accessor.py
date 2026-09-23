"""The single read accessor for a decision: `as_of` = `argmin(observed_at)` with LOCF."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from enum import Enum
from typing import Final

from src.modules.sentimento.domain.provenance import Absence, SeriesRow
from src.modules.sentimento.domain.series_key import Nature, SeriesKey

# ── TIME ARRIVES AS A NUMBER; THIS MODULE NEVER ASKS WHAT TIME IT IS ───────────────────────
#
# `backend/pyproject.toml`, contract "Natureza": `domain` and `use_cases` may not import
# `socket`, `ssl`, `time` or `datetime`. THIS TASK IS ABOUT TIME, so the boundary has to be
# stated rather than worked around: `t` (the decision instant) and `knowledge_time` are
# PARAMETERS — epoch milliseconds, UTC — handed in by whoever owns a clock. Nothing here reads
# one, and `int` is what makes `argmin(observed_at)` exact: totally ordered, no parse, no
# locale, no timezone (the argument `provenance.py` already wrote for the column type).
#
# That is not a workaround, it is the correct shape: a decision read is REPRODUCIBLE, and a
# function that reads `now()` is not reproducible by construction. `SPEC-001` §2.5 writes
# `reproduzir(run) = (bundle_hash, window, knowledge_time)` — three declared values, none of
# them a clock.

# ── THE DIRECTION OF TIME, WHICH IS THE WHOLE POINT ────────────────────────────────────────
#
# `SPEC-001` §2.4, literal: "A regra e sobre QUAL LADO DO TEMPO o operador alcanca, e isso nao
# se le em regex. Lint sobre o literal do operador e o que produziu a inversao `D-01`,
# propagada por dois documentos."
#
# So this module states the direction in prose and PINS IT BY BEHAVIOUR, never by forbidding a
# character. Every admission predicate below reaches BACKWARDS from ITS OWN reference instant:
#
#     available_at <= knowledge_time   the fact was knowable BY the declared horizon  (R-1)
#     bucket_end   <= t                the bucket had closed AT the decision slice    (R-2)
#     observed_at  <= knowledge_time   we had observed it by then                (`CA-F4-25`)
#
# `ADR-042`/`D1` is why R-1 reaches for `knowledge_time` and not `t`: `t` is the SLICE being
# answered (valid time — when the fact happened), `knowledge_time` is the HORIZON the caller
# declares (transaction time — when the fact became knowable). Before `ADR-042` the two
# predicates that "reach backwards" both reached from `t`, which made a chart of REVISED
# history impossible to express — R-1 refused any row this store learned about after the slice
# it answers, even for `RENDERING`, where "what do we know TODAY about that slice" is exactly
# the legitimate question. `D2` is why this is not a loosening: with `knowledge_time = t` in
# every call, `available_at <= knowledge_time` **is** `available_at <= t` — the old rule is the
# `K = t` case of the new one, not a revoked one. `D3` is the other half: `ENTRY_CONDITION` and
# `EXECUTION_SIMULATION` REFUSE outright when `knowledge_time > t` (`_refuse_lookahead_for_a_
# decision`, below) — the one purpose allowed to reach past `t` is `RENDERING`, and only because
# nothing is decided by a pixel.
#
# The `<=` here is CORRECT for the same reason `SPEC-001` §2.4 says the emulated form
# `WHERE t2.ts <= t1.ts ORDER BY t2.ts DESC LIMIT 1` is correct: the predicate is on the
# OBSERVATION against its reference instant, and the `max(bucket_end)` in `_pick_bucket_end`
# closes the sense — most recent IN THE PAST.
#
# AND THERE IS NO INTERPOLATION HERE, WHICH IS THE OTHER HALF. Interpolating between two
# points uses the LATER point to produce the present value: lookahead by construction
# (`SPEC-001` §2.4 marks `time_bucket_gapfill` + `interpolate` PROIBIDO for exactly this).
# `LOCF` carries the last observation FORWARD and never consults the next one. Nothing in this
# module ever looks at an observation with `bucket_end` greater than the one it picked — if a
# change here ever needs "the next point", that change is the defect this task exists to stop.


class BarPolicy(Enum):
    """`bar_policy` — declared by the CONSUMER, never defaulted (`SPEC-001` §2.3).

    There is no default value anywhere in this module, and that is `D4.6`'s class (b) stated
    as a type: the DoD records that the test, as the PRD wrote it, "passava nos dois valores de
    `bar_policy`" — that is, it was not testing `bar_policy` at all. A default here would put
    that back, because the caller that never thought about the question would silently get one.
    """

    FINAL_ONLY = "final_only"
    """R-2 applies: only buckets that had CLOSED at `t`, and never one the source calls
    non-final. This is the only policy admissible for an entry condition."""

    INTRABAR = "intrabar"
    """R-2 does not apply: a bucket still open at `t` is admissible. `SPEC-001` §2.3 scopes it
    to RENDERING and EXECUTION SIMULATION and says "NUNCA para avaliacao de condicao de
    ENTRADA" — which `ReadPurpose` below turns from a sentence into a refusal."""


class ReadPurpose(Enum):
    """What the caller is going to DO with the number (`SPEC-001` §2.3, third line).

    The SPEC states the restriction on `intrabar` as a sentence about purpose, and a sentence
    is not a mechanism. Making purpose a required argument is what lets `as_of` refuse the one
    combination the SPEC forbids instead of trusting the caller to have read §2.3.
    """

    ENTRY_CONDITION = "ENTRY_CONDITION"
    """Evaluating whether to open a position. `intrabar` is REFUSED here: at 4 min of a 5 min
    bucket, 77,4% of the definitive highs are already known and 90,0% of the range has already
    happened `[MEDIDO, SPEC-001 §2.3]` — that is the lookahead, quantified."""

    RENDERING = "RENDERING"
    """Drawing a chart. `intrabar` is legitimate: nothing is decided by a pixel."""

    EXECUTION_SIMULATION = "EXECUTION_SIMULATION"
    """Simulating a fill of a decision ALREADY taken. `intrabar` is legitimate because the
    decision is upstream of it; the fill happens inside the bar by definition."""


# ── WHICH NATURES MAY BE CARRIED FORWARD, TRANSCRIBED FROM `SPEC-001` §5.11 ────────────────
#
# `LOCF` on `FLOW` is A TYPE ERROR, not a UX choice (`SPEC-001` §3.2 and §5.11, and `D4.11`:
# a crosshair on an absent `cvd_delta` bucket shows "—", never the previous value). A flow is a
# quantity accumulated OVER a window; there is no sense in which last window's accumulation is
# still true now. A stock is a level, and a level persists until it is next observed.
#
# ⚠️ `RATIO` IS CONSERVATIVE HERE, AND IT IS A `[NAO SEI]` WITH AN OWNER. `SPEC-001` §5.11
# splits ratios in two — "RATIO de estoque" (behaves like `STOCK`, `last()` on the edge is
# legitimate) and "RATIO de fluxo" (the taker series; the panel DISABLES itself) — but
# `SeriesKey.nature` has ONE `RATIO` member, so the key cannot express which one a series is.
# Carrying forward a flow ratio is the dangerous direction: summing 3 buckets of 5 min of
# `sum_taker_long_short_vol_ratio` gives p50 = 3,1809 where the true 15 min ratio is ~0,9707
# `[MEDIDO, SPEC-001 §5.11]` — 3,3x inflated under an honest title. So `RATIO` gets NO CARRY
# until the key can tell the two apart: under-serving returns a VISIBLE absence, over-serving
# returns an invisible stale number, and only one of those two costs capital.
# Owner of the question "does `nature` need a sixth member, or does §5.11 need a second term?":
# `/architect`. This task transcribes the table; it does not amend `SPEC-001` §2.1.
CARRY_FORWARD_BY_NATURE: Final[dict[Nature, bool]] = {
    Nature.STOCK: True,
    Nature.FLOW: False,
    Nature.RATIO: False,
    Nature.EVENT: False,
    Nature.TICK: False,
}


class DecisionReadRefusedError(Exception):
    """The read cannot be performed at all, so it returns nothing rather than a number.

    THE `Error` SUFFIX IS `ruff`'s `N818`, NOT A CLAIM THAT THIS IS A BUG. The word that
    matters is `Refused`: the repository already spells refusal apart from failure everywhere
    (`rc=3` against `rc=1`; "nao mediu" against "mediu e reprovou"), and this is the same
    distinction one layer down.

    REFUSING IS NOT THE SAME AS RETURNING AN ABSENCE. An `Absence` says "this series has no
    point you may use at `t`" — a fact about the data. This exception says "this READ is not
    well formed" — a fact about the call: a missing `asof_max_staleness_ms` (`ADR-006`/D3), or
    an entry condition asking for `intrabar` (`SPEC-001` §2.3). Collapsing the two would let a
    malformed read look like an empty series, which is the silent direction.
    """


@dataclass(frozen=True)
class SeriesReadPolicy:
    """The per-series values a decision read needs, and NONE of them has a default.

    `ADR-006`/D1 is the reason the two staleness fields have different names: the ADR records
    that a `max_staleness = 600 s` chosen through a UX lens became, by proximity, the constant
    another section cited. "Nao existe um campo chamado `max_staleness`... porque foi o NOME
    que permitiu a confusao, nao a constante."

    `ADR-006`/D3 is why `asof_max_staleness_ms` is `int | None` and the refusal lives in
    `as_of` rather than in this constructor: a `charts` consumer legitimately holds a policy
    with only `render_max_staleness_ms`, and a quarantined series legitimately holds neither
    (`ADR-006`/D5). It is the DECISION read that refuses, at the moment it is asked.
    """

    asof_max_staleness_ms: int | None
    """`ADR-006`/D1 — the decision-read lens. Owner: `sentimento`. Absent => the read REFUSES;
    it never inherits the render value, never assumes the native cadence, never assumes
    infinite (`ADR-006`/D3). Ausencia e erro, nao default."""

    render_max_staleness_ms: int | None
    """`ADR-006`/D1 — the screen lens. Owner: `charts`. THIS MODULE NEVER READS IT except to
    name it in the refusal message, and `test_as_of_accessor.py` pins that changing it does not
    move the output by one bit — the mirrored test `ADR-006`'s falsifier asks for."""

    bucket_interval_ms: int
    """The native grid of this series, in milliseconds — the width of one bucket.

    IT IS INJECTED AND NEVER PARSED FROM `SeriesKey.interval`. The key carries `"5m"`, a string
    in the source's spelling, and turning a grid label into milliseconds is the CANONICAL GRID —
    "UMA funcao, dona de `charts`" (`T-05.1`, plano 05 item 5.1, `ADR-003`/FR-3). A second
    parser here would be the second implementation that item exists to forbid.

    It is required because `D4.11` cannot be expressed without it: "`LOCF` sobre `FLOW` e erro de
    tipo" means a flow value stops being the answer once a WHOLE BUCKET has gone by, and "a whole
    bucket" is not derivable from `bucket_end` and `t` alone. Publication lag is why `age_ms > 0`
    is not a substitute: a bucket becomes readable one lag AFTER it closes, so under `age_ms > 0`
    a flow series would be unreadable for ever."""

    first_capture_at: int | None
    """The first instant this series can EVER have a point, or `None` for "no declared bound".

    This is the `QF-4` mechanism (`SPEC-001` §1.3, §5.1 class (c)): `quantity_field = nq` is
    capture-or-lose — the S3 dump never publishes it and the REST window is 48 h — so a read of
    a window that precedes the first live capture can never be satisfied by any source. That is
    `Absence.NO_SOURCE`, and it is a DIFFERENT answer from `NO_POINT`: one says nobody will ever
    have it, the other says this bucket was empty. Explicit `None` is a declaration, not a
    default — the same shape `SeriesRow.is_final` already uses."""


@dataclass(frozen=True)
class Observation:
    """One stored observation: the row's provenance plus the number the row carries.

    `SeriesRow` (`T-04.2`, `SPEC-001` §3.1/§3.2) carries the seven provenance columns and the
    key, and deliberately not the value: it is the shape of what makes a row VALID. The read
    path needs the value alongside it, and pairing them here keeps `provenance.py` — another
    task's module — untouched.

    `Decimal` and not `float`: `SPEC-001` §2.6 makes decimal arithmetic over the source's RAW
    STRING part of the contract, and a `float` round-trip here would silently undo it at the
    last step of the path it protects.
    """

    row: SeriesRow
    value: Decimal


@dataclass(frozen=True)
class AsOfReading:
    """What a decision read returns: EITHER a number with its provenance, OR a named absence.

    Never a bare `None`. `Absence` is a closed set of four reasons (`SPEC-001` §3.1) and the
    consumer is required to face which one it got — `SEM_PONTO` and `SEM_FONTE` lead to
    different panels (`SPEC-001` §5.11) and a bare `None` erases the difference.

    `knowledge_time` and `bar_policy` are ECHOED, and that is plan item 4.10 rather than
    politeness: `reproduzir(run) = (bundle_hash, window, knowledge_time)`, and a read that does
    not report the knowledge horizon it used cannot be compared against another run. `F-4` is
    the falsifier — the same `bundle_hash` + `window` returning a different number WITHOUT a
    refusal means `knowledge_time` is not in the read path.
    """

    value: Decimal | None
    absence: Absence | None
    observation: Observation | None
    knowledge_time: int
    bar_policy: BarPolicy
    age_ms: int | None

    def __post_init__(self) -> None:
        """Refuse a reading that is both a value and an absence, or neither."""
        if (self.value is None) == (self.absence is None):
            raise DecisionReadRefusedError(
                "a reading is EITHER a value or a named absence, never both and never "
                "neither: a bare absent number erases which of the four reasons applied"
            )
        if (self.value is None) != (self.observation is None):
            raise DecisionReadRefusedError(
                "a reading with a value carries the observation it came from, and one with "
                "an absence carries none: provenance travels with the number or not at all"
            )

    def projection(self) -> dict[str, object]:
        """Project the reading onto the wire shape, for byte-comparison between two datasets.

        `D4.6` classes (a) and (b) are stated as BIT-IDENTITY against a dataset with the
        poisoned lines removed, so the comparison needs a canonical shape rather than a Python
        repr. `Decimal` projects as its own string — the digits the source published, not a
        float that would depend on the platform.
        """
        return {
            "value": None if self.value is None else str(self.value),
            "absence": None if self.absence is None else self.absence.value,
            "knowledge_time": self.knowledge_time,
            "bar_policy": self.bar_policy.value,
            "age_ms": self.age_ms,
            "observed_at": None if self.observation is None else self.observation.row.observed_at,
            "available_at": None if self.observation is None else self.observation.row.available_at,
            "bucket_end": None if self.observation is None else self.observation.row.bucket_end,
        }


def as_of(
    *,
    series: SeriesKey,
    symbol: str,
    t: int,
    observations: Sequence[Observation],
    policy: SeriesReadPolicy,
    bar_policy: BarPolicy,
    purpose: ReadPurpose,
    knowledge_time: int,
) -> AsOfReading:
    """Return the value of `series` for `symbol` as it was knowable BY `knowledge_time`.

    `SPEC-001` §2.5, transcribed, AND AMENDED BY `ADR-042`/`D1` (`SPEC-001` §2.3 itself still
    reads the pre-`ADR-042` formula until the ADR leaves `proposta` — this docstring is the
    executable truth in the meantime, not a second, silently-diverging spec):

        as_of( serie, symbol, t, knowledge_time, max_staleness_ms )
           = argmin( observed_at )  entre as observacoes com  available_at <= knowledge_time
             -- a PRIMEIRA, nunca a ultima, nunca a definitiva

    Before `ADR-042` the right-hand side read `available_at <= t`. `D2` is why this is not a
    silent widening: with `knowledge_time = t` (what every decision read passes, `D5`) the two
    formulas are IDENTICAL, byte for byte — the old rule is the `knowledge_time = t` case of the
    new one, never a revoked one.

    THE STEPS, IN ORDER, EACH WITH THE RULE IT SERVES:

    1. refuse a malformed read (`ADR-006`/D3, `SPEC-001` §2.3, and `ADR-042`/D3 — a decision
       purpose asking `knowledge_time` to reach past `t`);
    2. keep only rows of THIS identity and symbol — the `q`/`nq` weld guard, because
       `quantity_field` is a term of the key (`ADR-001`), so the two are different `series_key_id`
       and this filter is what makes `SPEC-001` §5.1 class (c) impossible rather than merely
       discouraged;
    3. R-1 (`available_at <= knowledge_time`, `ADR-042`/D1), R-2 (`bucket_end <= t` under
       `final_only`) and the knowledge horizon (`observed_at <= knowledge_time`) — a
       CONJUNCTION, `SPEC-001` §2.3: "Um bucket parcial responde SIM a R-1 e NAO a R-2 — e ai
       que o lookahead entrava";
    4. pick the LATEST bucket that survived — most recent in the past;
    5. inside it, `argmin(observed_at)` — the FIRST observation of that bucket, never the last
       and never the definitive one (`D4.13`);
    6. refuse to carry it forward when a WHOLE BUCKET has gone by and the nature forbids
       carrying (`D4.11`), or when it is older than the series' own declared
       `asof_max_staleness_ms` (`ADR-006`). The two limits are independent and the tighter one
       wins; neither has a default.

    `observations` is a `Sequence` and not a store handle ON PURPOSE: this function is pure, so
    the poisoned fixture of `SPEC-001` §5.1 is a list literal in a test rather than a database
    that has to be stood up, and the whole anti-lookahead mechanism is verifiable offline.

    ⚠️ STEPS 2-3 LIVE IN `_admits` AND STEP 6 IN `_reading_for` SINCE `ADR-039`, and the move is
    not tidying. `as_of_batch` — the second door of this same accessor — has to apply the very
    same predicates and the very same post-filters, and a second copy of either is the failure
    `test_as_of_is_the_single_reader.py` exists to stop: two read paths do not fail, they
    DIVERGE. `as_of` is still THE DEFINITION (`ADR-039`/`D1`/`C2`); what changed is that the
    definition is now reachable by name from the one other function allowed to need it.
    """
    staleness_ms = _require_decision_staleness(policy)
    _refuse_intrabar_for_entry(bar_policy=bar_policy, purpose=purpose)
    _refuse_lookahead_for_a_decision(t=t, purpose=purpose, knowledge_time=knowledge_time)

    series_key_id = series.series_key_id()
    admitted = [
        observation
        for observation in observations
        if _admits(
            observation,
            series_key_id=series_key_id,
            symbol=symbol,
            t=t,
            bar_policy=bar_policy,
            knowledge_time=knowledge_time,
        )
    ]
    if not admitted:
        return _absent(
            _absence_for_empty(policy=policy, t=t),
            knowledge_time=knowledge_time,
            bar_policy=bar_policy,
        )

    latest_bucket_end = max(observation.row.bucket_end for observation in admitted)
    winner = min(
        (o for o in admitted if o.row.bucket_end == latest_bucket_end),
        key=_first_observation_order,
    )
    return _reading_for(
        winner,
        t=t,
        nature=series.nature,
        policy=policy,
        staleness_ms=staleness_ms,
        knowledge_time=knowledge_time,
        bar_policy=bar_policy,
    )


def as_of_batch(
    *,
    series: SeriesKey,
    symbol: str,
    instants: Sequence[int],
    observations: Sequence[Observation],
    policy: SeriesReadPolicy,
    bar_policy: BarPolicy,
    purpose: ReadPurpose,
    knowledge_time: int,
) -> tuple[AsOfReading, ...]:
    """Answer a whole NON-DECREASING grid of instants in ONE ordered pass (`ADR-039`/`D1`).

    ⛔ THIS IS NOT A SECOND ACCESSOR, AND THE FOUR CONDITIONS OF `ADR-039`/`D1` SAY WHY.

    * `C1` — it lives HERE, beside `as_of`, on the same review surface and inside the same
      `DECLARED_TOUCHERS` entry. In `use_cases/` the AST scan of
      `test_as_of_is_the_single_reader.py` would accuse it, and it would be right.
    * `C2` — `as_of` is NOT removed and is NOT re-expressed as `as_of_batch(t)[0]`. It stays
      THE DEFINITION; this function is an ALGORITHMIC reformulation of it.
    * `C3` — the gate is DIFFERENTIAL, never argumentative:
      `as_of_batch(...)[i].projection() == as_of(t=instants[i], ...).projection()`, bit for bit,
      over a REAL slice of `md.series` (`tests/sentimento/test_as_of_batch_differential.py`).
    * `C4` — `DECLARED_PRODUCERS` in that same file names this function, with its reason.

    AND IT DOES NOT REWRITE THE ADMISSION CONJUNCTION, which is the other half of `C2`
    ("uma semantica que segue escrita num lugar so"). `_admits` below is the ONE place the five
    terms are written, and BOTH functions call it. What this function adds — and the only thing
    it adds — is WHEN each row enters:

        THE THEOREM (`ADR-039`/`D2`, the monotonicity of admission)

        `_admits(o, t=...)` is monotone in `t`: since `ADR-042`/`D1`, exactly ONE of its terms
        reaches BACKWARDS from `t` — `bucket_end <= t` under `final_only` (R-2); `available_at`
        moved to `knowledge_time`, constant for the whole call, so it no longer depends on `t`
        at all (a constant term is trivially monotone). Under `intrabar`, R-2 does not apply
        either, so NO term depends on `t` — such a row is admitted for every `t` at once
        (`_ADMITTED_FROM_THE_START`). Either way, once a row is admitted it stays admitted for
        every later `t`. The instant at which it FIRST becomes admitted is `_activation_instant`
        — and evaluating `_admits` AT that instant leaves exactly the terms that do not depend
        on `t` at all. So

            admitted(t) == { o : _admits(o, t=activation(o)) and activation(o) <= t }

        which a sorted list plus one forward cursor answers for the whole grid in one pass.

    ⛔ THE NAIVE ACTIVATION KEY — `available_at` — IS LOOKAHEAD, AND THE DATA PROVES IT
    (`ADR-039`/`D2`): `748` rows of `1.452.975` in `md.series` carry `available_at < bucket_end`,
    the worst by `-3.481.439 ms` — about 58 grid steps. Ordering by `available_at` would let
    such a row become admissible BEFORE its own bucket closed, changing which row wins.

    Cost: `O(n log n + m)` against `as_of`-per-instant's `O(n * m)` — `n` rows, `m` instants.
    `ADR-039` §1 measures the `n * m` this replaces: `208.391.040` predicate evaluations for
    ONE series of one four-day panel.

    Raises:
        DecisionReadRefusedError: `instants` is not non-decreasing (the cursor is one-way, so a
            grid that goes backwards would silently answer with a future pointer state), or any
            refusal `as_of` itself raises for the same arguments.

    """
    staleness_ms = _require_decision_staleness(policy)
    _refuse_intrabar_for_entry(bar_policy=bar_policy, purpose=purpose)
    _refuse_a_grid_that_goes_backwards(instants)
    if instants:
        # `D3` (`ADR-042`) on a GRID: `knowledge_time` is the ONE horizon `D5` allows for the
        # whole call (no default, no per-instant value), so refusing against the EARLIEST slice
        # in the grid is refusing against every slice — a decision purpose may never reach past
        # ANY `t` it is asked to answer, and the earliest one is the tightest bound.
        _refuse_lookahead_for_a_decision(
            t=min(instants), purpose=purpose, knowledge_time=knowledge_time
        )

    activated = _activated_in_order(
        observations,
        series_key_id=series.series_key_id(),
        symbol=symbol,
        bar_policy=bar_policy,
        knowledge_time=knowledge_time,
    )

    best_by_bucket_end: dict[int, Observation] = {}
    latest_bucket_end: int | None = None
    cursor = 0
    readings: list[AsOfReading] = []
    for t in instants:
        while cursor < len(activated) and activated[cursor][0] <= t:
            latest_bucket_end = _absorb(
                activated[cursor][1],
                best_by_bucket_end=best_by_bucket_end,
                latest_bucket_end=latest_bucket_end,
            )
            cursor += 1
        if latest_bucket_end is None:
            readings.append(
                _absent(
                    _absence_for_empty(policy=policy, t=t),
                    knowledge_time=knowledge_time,
                    bar_policy=bar_policy,
                )
            )
            continue
        readings.append(
            _reading_for(
                best_by_bucket_end[latest_bucket_end],
                t=t,
                nature=series.nature,
                policy=policy,
                staleness_ms=staleness_ms,
                knowledge_time=knowledge_time,
                bar_policy=bar_policy,
            )
        )
    return tuple(readings)


def reject_delay_threshold_above_staleness(
    *,
    series_key_id: str,
    delay_threshold_ms: int,
    policy: SeriesReadPolicy,
) -> None:
    """Refuse a series whose delay threshold outlives its own `asof_max_staleness_ms`.

    `ADR-006`/D4, transcribed: `limiar_atraso <= asof_max_staleness_ms`. Otherwise the panel
    "declara ausencia antes de declarar atraso", which is the wrong order of two warnings — the
    reader is told the number is gone before being told it is late.

    THE MESSAGE NAMES THE TWO NUMBERS OF THE SERIES UNDER TEST AND NEVER A GLOBAL CONSTANT.
    `ADR-006`/D4 says so in as many words, and the ADR's own context records why: it was an
    illustration written with a global constant that the `faseamento` had to strike down.
    """
    asof_ms = policy.asof_max_staleness_ms
    if asof_ms is None:
        raise DecisionReadRefusedError(
            f"series '{series_key_id}' has no asof_max_staleness_ms, so `ADR-006`/D4 has "
            f"nothing to compare its delay threshold of {delay_threshold_ms} ms against"
        )
    if delay_threshold_ms > asof_ms:
        raise DecisionReadRefusedError(
            f"series '{series_key_id}': delay threshold {delay_threshold_ms} ms is greater "
            f"than its asof_max_staleness_ms of {asof_ms} ms, so the panel would declare "
            f"absence before declaring lateness (`ADR-006`/D4)"
        )


def _require_decision_staleness(policy: SeriesReadPolicy) -> int:
    """Return `asof_max_staleness_ms`, refusing when it is absent or negative (`ADR-006`/D3)."""
    asof_ms = policy.asof_max_staleness_ms
    if asof_ms is None:
        render_ms = policy.render_max_staleness_ms
        raise DecisionReadRefusedError(
            f"asof_max_staleness_ms is absent, so this decision read REFUSES (`ADR-006`/D3). "
            f"It does not fall back to render_max_staleness_ms (which is {render_ms}), does "
            f"not assume the native cadence, and does not assume infinite: absence is an error, "
            f"not a default"
        )
    if asof_ms < 0:
        raise DecisionReadRefusedError(
            f"asof_max_staleness_ms = {asof_ms} is negative, which would make every "
            f"observation stale on arrival instead of bounding how long one stays usable"
        )
    if policy.bucket_interval_ms <= 0:
        raise DecisionReadRefusedError(
            f"bucket_interval_ms = {policy.bucket_interval_ms} is not a positive width, so "
            f"'one whole bucket has gone by' — the `D4.11` rule for a non-carryable nature — "
            f"has no meaning for this series"
        )
    return asof_ms


def _refuse_intrabar_for_entry(*, bar_policy: BarPolicy, purpose: ReadPurpose) -> None:
    """Refuse `intrabar` for an entry condition — `SPEC-001` §2.3, third line, as a mechanism."""
    if bar_policy is BarPolicy.INTRABAR and purpose is ReadPurpose.ENTRY_CONDITION:
        raise DecisionReadRefusedError(
            "bar_policy = intrabar is for RENDERING and EXECUTION SIMULATION and never for "
            "evaluating an ENTRY condition (`SPEC-001` §2.3): at 4 min of a 5 min bucket, "
            "77,4% of the definitive highs are already known and 90,0% of the range has "
            "already happened"
        )


def _refuse_lookahead_for_a_decision(*, t: int, purpose: ReadPurpose, knowledge_time: int) -> None:
    """`ADR-042`/`D3`: refuse `knowledge_time > t` under `ENTRY_CONDITION`/`EXECUTION_SIMULATION`.

    The sibling of `_refuse_intrabar_for_entry`, same shape, same reason: `D1` moved R-1's
    operand from `t` to `knowledge_time`, which is what lets `RENDERING` read a slice REVISED
    after the fact — but that same widening, left unguarded, would let a decision read the
    future too. `ENTRY_CONDITION` with `K > t` is lookahead BY DEFINITION: deciding the entry at
    `t` with a fact that only arrived after. `EXECUTION_SIMULATION` with `K > t` is the same
    defect one step later — an optimistic fill that never happens with what was knowable at the
    moment of the fill. `RENDERING` is untouched: `nothing is decided by a pixel` is the same
    line `_refuse_intrabar_for_entry` already leans on, and it is the ONLY purpose `D3` lets
    reach past `t`.

    `D2` is why this never fires for a well-formed backtest: `resolve_knowledge_time` hands the
    decision read `K = t`, and `K > t` is false by construction. This refusal only ever catches
    a CALL that broke that discipline — which is the point of making it a mechanism instead of
    a sentence in `SPEC-001`.
    """
    if purpose is ReadPurpose.RENDERING:
        return
    if knowledge_time > t:
        raise DecisionReadRefusedError(
            f"knowledge_time ({knowledge_time}) is after t ({t}) under purpose={purpose.value}: "
            f"`ADR-042`/`D3` refuses a decision read that would know more than was knowable at "
            f"the instant it is deciding — that is the definition of lookahead. Only "
            f"`RENDERING` may set knowledge_time past t"
        )


def _admits(
    observation: Observation,
    *,
    series_key_id: str,
    symbol: str,
    t: int,
    bar_policy: BarPolicy,
    knowledge_time: int,
) -> bool:
    """Decide THE admission conjunction — steps 2 and 3 of `as_of`, in ONE place.

    It was inlined in `as_of`'s comprehension until `ADR-039`. It is a named function now for
    one reason and not for tidiness: `as_of_batch` has to evaluate the SAME five terms, and a
    second copy of them is what `test_as_of_is_the_single_reader.py`'s own docstring calls the
    failure that "does not fail, it DIVERGES" — one copy applying R-2 and the other not, both
    answers plausible. `ADR-039`/`D1`/`C2` states it as a requirement: the semantics stays
    written in one place, and only the ALGORITHM is reformulated.

    The five terms, each with the rule it serves:

    * `series_key_id` and `symbol` — the `q`/`nq` weld guard (`SPEC-001` §5.1 class (c)).
      ⛔ `ADR-039`/`D6` VETOES removing these two because "the SQL already filtered them": they
      are a GUARD, not a performance term, and the coupling reader<->accessor that removing
      them would create is invisible to the AST guard.
    * `observed_at <= knowledge_time` — the knowledge horizon (`CA-F4-25`).
    * `available_at <= knowledge_time` — R-1, `ADR-042`/`D1`: the fact was knowable BY the
      declared horizon. It reached for `t` before `ADR-042`; `D2` is why that is not a silent
      change — with `knowledge_time = t` this term IS `available_at <= t`, the old rule as the
      one case of the new one where the two horizons coincide. `D3` (`_refuse_lookahead_for_a_
      decision`, called before this function ever runs) is what stops this widening from
      admitting lookahead under a decision purpose.
    * `_r2_admits` — R-2, the bucket had closed at `t` and the source did not call it partial.

    R-1 no longer depends on `t` at all — it depends on `knowledge_time`, which is CONSTANT for
    the whole call (`D5`: one call, one declared horizon, never a default). R-2 is the only
    remaining term that depends on `t`, and it still reaches BACKWARDS from it. A term that does
    not depend on `t` is trivially monotone in `t`, so admission STAYS monotone in `t` — the
    theorem `as_of_batch` rests on survives `D1` unchanged (`ADR-042`, "Por que `ADR-039` nao
    quebra"); only WHICH term carries the `t`-dependence moved.
    """
    row = observation.row
    return (
        row.series_key_id == series_key_id
        and row.symbol == symbol
        and row.observed_at <= knowledge_time
        and row.available_at <= knowledge_time
        and _r2_admits(row, t=t, bar_policy=bar_policy)
    )


_ADMITTED_FROM_THE_START: Final[int] = -(2**62)
"""`ADR-042`/`D1`'s consequence for `intrabar`, stated as a value: under `intrabar` R-2 is
`True` unconditionally (`_r2_admits`) and, since `D1`, R-1 no longer depends on `t` either — it
depends on `knowledge_time`, constant for the whole call. So an `intrabar` row that passes the
constant gates (`available_at <= knowledge_time`, `observed_at <= knowledge_time`, identity) is
admitted for EVERY `t`, not from some computable instant onward. The true earliest `t` is
`-infinity`; this sentinel stands in for it — it is `<=` every real grid instant this codebase
ever produces (epoch milliseconds, always positive), so `activation <= t` holds trivially and
the row is absorbed in the cursor's very first pass, exactly like the true per-instant `as_of`
would answer at its own first `t`."""


def _activation_instant(row: SeriesRow, *, bar_policy: BarPolicy) -> int:
    """Return the EARLIEST `t` at which `_admits` can hold for this row — `ADR-039`/`D2`.

    ⚠️ `ADR-042`/`D1` MOVED WHICH TERM CARRIES THE `t`-DEPENDENCE, AND THIS FUNCTION HAS TO
    MOVE WITH IT — not because the theorem changed, but because it is a DERIVED form of
    `_admits`, and a derived form that still reflects the OLD admits is simply wrong for the new
    one. `_admits` now reads `available_at <= knowledge_time` (constant across the whole call,
    `D5`) instead of `available_at <= t`. Under `final_only`, the CONJUNCTION had two
    backwards-reaching terms before `D1`; now only one does: `bucket_end <= t` (R-2).
    `available_at <= knowledge_time` still gates whether the row is EVER admitted (checked once,
    inside `_activated_in_order`'s filter), but it no longer says WHEN — so the activation
    instant is `bucket_end` alone, not `max(available_at, bucket_end)`.

    The `748` rows of `1.452.975` in `md.series` with `available_at < bucket_end`
    (`/fapi/v1/premiumIndex`, worst `-3.481.439 ms`, `[MEDIDO 2026-09-16, ADR-039/D2, `BEGIN
    READ ONLY`]`) are why `available_at` could never stand ALONE as the key even before `D1` —
    admitting such a row before ITS OWN bucket closed would be lookahead. Under `D1` that
    concern moves into `_admits`'s filter rather than into the activation arithmetic: a snapshot
    row can never activate before `bucket_end` now, full stop, because `bucket_end` IS the key.

    Under `intrabar`, R-2 never applied (`_r2_admits` returns `True` unconditionally), so
    `available_at <= t` was the LAST backwards-reaching term standing. `D1` retires it too — see
    `_ADMITTED_FROM_THE_START`. The key therefore still DEPENDS ON `bar_policy`, which is why it
    stays a parameter and never a default.

    ⚠️ THIS FUNCTION IS DELIBERATELY NOT CALLED BY `as_of`. If it were, a wrong key here would
    move both sides of `ADR-039`/`C3`'s differential by the same amount and the comparison
    would go blind — the one defect the `748` rows exist to catch would become invisible. `as_of`
    keeps stating `bucket_end <= t` literally; this is the derived form, and the differential is
    what holds the two together.
    """
    if bar_policy is BarPolicy.INTRABAR:
        return _ADMITTED_FROM_THE_START
    return row.bucket_end


def _activated_in_order(
    observations: Sequence[Observation],
    *,
    series_key_id: str,
    symbol: str,
    bar_policy: BarPolicy,
    knowledge_time: int,
) -> list[tuple[int, Observation]]:
    """Step 1 of `ADR-039` §3: the admissible rows, paired with their activation, sorted by it.

    `_admits` is evaluated ONCE PER ROW, at that row's own activation instant — never once per
    row per grid instant. At `t = activation(o)` the (at most one, since `ADR-042`/`D1`)
    `t`-dependent term holds by construction, so what the call actually decides is the part that
    does not depend on `t` at all: identity, symbol, the knowledge horizon (`available_at` and
    `observed_at`, both against `knowledge_time` now) and the source's own `is_final`. That is
    `ADR-039`/`D6`'s form `2A` — the constant-in-`t` predicates applied once, outside the loop —
    realised INSIDE the accessor, where the weld guard lives, rather than in a caller.

    ⛔ THE ORDERING LIVES HERE, IN `domain`, AND `ADR-039`/`D5` VETOES getting it from an
    `ORDER BY`: `postgres_series_window_reader.py` has no `ORDER BY` and does not get one for
    this. A `domain` function whose correctness depended on the order a SQL STRING in `infra`
    produced would put the premise exactly where the AST guard structurally cannot see it.

    The sort key is the activation alone — `Observation` is not orderable, and it must not be:
    ties inside one bucket are broken by `_first_observation_order` when the row is ABSORBED
    (`ADR-039`/`D3`), never by where the sort happened to leave it.
    """
    activated = [
        (_activation_instant(observation.row, bar_policy=bar_policy), observation)
        for observation in observations
        if _admits(
            observation,
            series_key_id=series_key_id,
            symbol=symbol,
            t=_activation_instant(observation.row, bar_policy=bar_policy),
            bar_policy=bar_policy,
            knowledge_time=knowledge_time,
        )
    ]
    activated.sort(key=lambda pair: pair[0])
    return activated


def _absorb(
    observation: Observation,
    *,
    best_by_bucket_end: dict[int, Observation],
    latest_bucket_end: int | None,
) -> int:
    """Step 3 of `ADR-039` §3: fold one newly activated row in, and return the latest bucket.

    ⛔ THE RUNNING MINIMUM IS RE-MINIMISED, NEVER "THE FIRST ONE THAT ACTIVATED" (`ADR-039`/`D3`).
    The winner INSIDE a bucket can be revised BACKWARDS: in `7.600` of `147.802` multi-row
    buckets a row that activates LATER wins by `_first_observation_order`, because that key is
    `observed_at` and `observed_at` is not ordered by `available_at`. Keeping the first arrival
    would answer with a row `as_of` never picks. `[MEDIDO: ADR-039/D3; reconfirmado 2026-09-16
    sobre md.series em `BEGIN READ ONLY`, 5.624 de 147.860 buckets multi-linha]`
    """
    bucket_end = observation.row.bucket_end
    incumbent = best_by_bucket_end.get(bucket_end)
    if incumbent is None or _first_observation_order(observation) < _first_observation_order(
        incumbent
    ):
        best_by_bucket_end[bucket_end] = observation
    if latest_bucket_end is None:
        return bucket_end
    return max(latest_bucket_end, bucket_end)


def _reading_for(
    winner: Observation,
    *,
    t: int,
    nature: Nature,
    policy: SeriesReadPolicy,
    staleness_ms: int,
    knowledge_time: int,
    bar_policy: BarPolicy,
) -> AsOfReading:
    """Step 6 of `as_of`: the two `O(1)` post-filters, then the reading — one place, two callers.

    ⛔ `ADR-039`/`D4`: NEITHER FILTER MAY SHORT-CIRCUIT THE SCAN. They are not monotone in `t` —
    a series can be stale at one instant and fresh at the next, because a newer bucket activates
    in between — so they may not prune the pointer's advance. They apply PER INSTANT, after the
    winner is already chosen, which is exactly where this function sits.

    The two limits are independent and the tighter one wins; neither has a default
    (`D4.11` and `ADR-006`).
    """
    age_ms = t - winner.row.bucket_end
    if age_ms >= policy.bucket_interval_ms and not CARRY_FORWARD_BY_NATURE[nature]:
        return _absent(Absence.NO_POINT, knowledge_time=knowledge_time, bar_policy=bar_policy)
    if age_ms > staleness_ms:
        return _absent(Absence.NO_POINT, knowledge_time=knowledge_time, bar_policy=bar_policy)
    return AsOfReading(
        value=winner.value,
        absence=None,
        observation=winner,
        knowledge_time=knowledge_time,
        bar_policy=bar_policy,
        age_ms=age_ms,
    )


def _refuse_a_grid_that_goes_backwards(instants: Sequence[int]) -> None:
    """Refuse a grid that is not non-decreasing — the cursor of `as_of_batch` is one-way.

    A single forward pointer cannot answer an instant EARLIER than one it has already passed:
    rows absorbed for the later instant would still be in `best_by_bucket_end`, and the reading
    would carry a row that was not yet knowable — lookahead, produced by an argument rather than
    by a predicate. Refusing is the only honest answer, and refusing LOUDLY is the point:
    silently sorting the caller's grid would return readings in an order the caller did not ask
    for, which is the same defect wearing a different hat.
    """
    for earlier, later in zip(instants, instants[1:], strict=False):
        if later < earlier:
            raise DecisionReadRefusedError(
                f"instants must be non-decreasing, and {later} follows {earlier}: the single "
                f"forward cursor of `as_of_batch` cannot answer an instant it has already "
                f"passed without carrying rows that were not knowable then (`ADR-039` §3)"
            )


def _r2_admits(row: SeriesRow, *, t: int, bar_policy: BarPolicy) -> bool:
    """Apply R-2, which only exists under `final_only` (`SPEC-001` §2.3).

    Two conditions, and the SPEC writes them as one: the bucket had closed at `t`, AND the
    source did not declare it non-final. `is_final is None` means the source does not declare
    finality at all — `SPEC-001` §3.1 lists the column as "quando a fonte o declara" — so the
    closed bucket stands on `bucket_end` alone. `is_final is False` is the source SAYING the
    bucket is partial, and no amount of `bucket_end` arithmetic overrides that.
    """
    if bar_policy is BarPolicy.INTRABAR:
        return True
    return row.bucket_end <= t and row.is_final is not False


def _first_observation_order(observation: Observation) -> tuple[int, str, int]:
    """Order observations of one bucket so `min` is the FIRST one, deterministically (`D4.13`).

    `observed_at` decides. The other two terms only break a tie, and a tie is possible because
    the row key is `(series_key_id, symbol, source, bucket_end, observed_at)` — two SOURCES can
    carry the same instant. Without a total order, `min` would return whichever the input
    sequence happened to put first, and a read that depends on input order is not reproducible.
    """
    return (observation.row.observed_at, observation.row.source, observation.row.ingested_at)


def _absence_for_empty(*, policy: SeriesReadPolicy, t: int) -> Absence:
    """Name WHY nothing was admitted: `SEM_FONTE` when no source could ever have it.

    `SPEC-001` §5.1 class (c) / `QF-4`: a read under `quantity_field = nq` of a window that
    precedes the first live capture returns `SEM_FONTE` and NEVER welds with `q`. The weld is
    already impossible upstream — `q` and `nq` are different `series_key_id` — so what is left
    for this function is to give the right REASON, which is a different panel.
    """
    if policy.first_capture_at is not None and t < policy.first_capture_at:
        return Absence.NO_SOURCE
    return Absence.NO_POINT


def _absent(absence: Absence, *, knowledge_time: int, bar_policy: BarPolicy) -> AsOfReading:
    """Build a reading that carries a named absence and no number."""
    return AsOfReading(
        value=None,
        absence=absence,
        observation=None,
        knowledge_time=knowledge_time,
        bar_policy=bar_policy,
        age_ms=None,
    )
