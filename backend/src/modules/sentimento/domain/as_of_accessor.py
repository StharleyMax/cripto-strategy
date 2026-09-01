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
# character. Every admission predicate below reaches BACKWARDS from the decision instant:
#
#     available_at <= t       the fact was knowable AT t          (R-1)
#     bucket_end   <= t       the bucket had closed AT t          (R-2, `final_only`)
#     observed_at  <= knowledge_time   we had observed it by then (`CA-F4-25`)
#
# The `<=` here is CORRECT for the same reason `SPEC-001` §2.4 says the emulated form
# `WHERE t2.ts <= t1.ts ORDER BY t2.ts DESC LIMIT 1` is correct: the predicate is on the
# OBSERVATION against the DECISION INSTANT, and the `max(bucket_end)` in `_pick_bucket_end`
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
    """Return the value of `series` for `symbol` as it was knowable at `t` — the ONE accessor.

    `SPEC-001` §2.5, transcribed:

        as_of( serie, symbol, t, max_staleness_ms )
           = argmin( observed_at )  entre as observacoes com  available_at <= t
             -- a PRIMEIRA, nunca a ultima, nunca a definitiva

    THE STEPS, IN ORDER, EACH WITH THE RULE IT SERVES:

    1. refuse a malformed read (`ADR-006`/D3 and `SPEC-001` §2.3);
    2. keep only rows of THIS identity and symbol — the `q`/`nq` weld guard, because
       `quantity_field` is a term of the key (`ADR-001`), so the two are different `series_key_id`
       and this filter is what makes `SPEC-001` §5.1 class (c) impossible rather than merely
       discouraged;
    3. R-1 (`available_at <= t`), R-2 (`bucket_end <= t` under `final_only`) and the knowledge
       horizon (`observed_at <= knowledge_time`) — a CONJUNCTION, `SPEC-001` §2.3: "Um bucket
       parcial responde SIM a R-1 e NAO a R-2 — e ai que o lookahead entrava";
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
    """
    staleness_ms = _require_decision_staleness(policy)
    _refuse_intrabar_for_entry(bar_policy=bar_policy, purpose=purpose)

    series_key_id = series.series_key_id()
    admitted = [
        observation
        for observation in observations
        if observation.row.series_key_id == series_key_id
        and observation.row.symbol == symbol
        and observation.row.observed_at <= knowledge_time
        and observation.row.available_at <= t
        and _r2_admits(observation.row, t=t, bar_policy=bar_policy)
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
    age_ms = t - winner.row.bucket_end

    if age_ms >= policy.bucket_interval_ms and not CARRY_FORWARD_BY_NATURE[series.nature]:
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
            f"not assume the native cadence, and does not assume infinite: ausencia e erro, "
            f"nao default"
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
