"""Proof that `as_of` is the ONLY path by which a stored series turns into a number.

"Acessor UNICO" is the half of this task that is lost first, and losing it is silent: two read
paths do not fail, they DIVERGE — one of them applies R-2 and the other does not, and the two
answers are both plausible. So this file does not assert "I looked and found nothing". It scans
`backend/src` and pins the exact, measured set of places that touch a read-path column, so a
second reader appearing anywhere in the tree turns a green suite red.

⚠️ WHAT THIS FILE DOES NOT PROVE, SAID OUT LOUD BECAUSE `ADR-012` NAMES THE TRAP. Until `T-01.2`
(`pagina-de-grafico-s2`) there was no store in this repository and no consumer of this module, so
the "nobody else imports it" half was VACUOUS — `rc=0` over an empty universe is indistinguishable
from `rc=0` over a universe that was checked. `T-01.2` ends the vacuity: `DECLARED_IMPORTERS` now
pins a non-empty, measured set (`use_cases/series_history.py` calling `as_of()`, plus three
type-only importers), so a fifth importer turns a green suite red the same way a second toucher
already does. The `morde` side of the column scan carries the same weight it always did:
`backend/src` has 116 modules, FOUR of which legitimately touch a
read-path column (`as_of_accessor.py`, `provenance.py`, `sqlite_series_quarantine_store.py` and
`write_series_row.py`, all named in `DECLARED_TOUCHERS` below), and the scan finds exactly those
four — no more, no fewer.

    python3 -c "from pathlib import Path; print(len(list(Path('backend/src').rglob('*.py'))))"
    # 116                                       [MEASURED 2026-09-02, T-07.5]

The previous version of this sentence said `36` and `TWO`, and both were already stale by the
time `T-07.5` read them: `DECLARED_TOUCHERS` already carried a third entry
(`sqlite_series_quarantine_store.py`, added by `T-02.2`) that this docstring never mentioned, and
the module count had grown along with the rest of `backend/src`. The `116` matters beyond
bookkeeping: it is the floor of the anti-vacuity guard below, so a stale, lower number puts the
reader further from believing the guard has slack it does not have. The `36` measurement's own
history is in `docs/context/plataforma-dados/gates/T-04.4-builder.md`.

`T-06.4` adds a FIFTH toucher (`funding_settlement.py`, a different aggregate — see its entry
in `DECLARED_TOUCHERS` for why it is not a second reader) and the module count has grown past
`116` again, same drift this docstring already names above rather than hides:

    python3 -c "from pathlib import Path; print(len(list(Path('backend/src').rglob('*.py'))))"
    # 123                                       [MEASURED 2026-09-03, T-06.4]

`T-02.2` (`captura-em-producao`) adds a SIXTH toucher (`postgres_series_sink.py` — see its entry
in `DECLARED_TOUCHERS` for why neither of its two functions is a second reader) and the module
count has grown again, same drift named above rather than hidden:

    python3 -c "from pathlib import Path; print(len(list(Path('backend/src').rglob('*.py'))))"
    # 185                                       [MEASURED 2026-09-08, T-02.2 captura-em-producao]

`T-01.2` (`pagina-de-grafico-s2`) adds a SEVENTH toucher (`series_history_report.py` — see its
entry in `DECLARED_TOUCHERS` for why `SeriesHistoryRow.to_wire` is not a second reader) and is
also the FIRST real importer of this module (`DECLARED_IMPORTERS` below), same drift named above
rather than hidden:

    python3 -c "from pathlib import Path; print(len(list(Path('backend/src').rglob('*.py'))))"
    # 196                                       [MEASURED 2026-09-08, T-01.2 pagina-de-grafico-s2]

`ADR-038`/`D1` (`cinco-metricas-do-core`) adds a FIFTH importer
(`domain/modeled_availability.py`) and it is the first one on the WRITE path — see its entry in
`DECLARED_IMPORTERS` for why importing `CARRY_FORWARD_BY_NATURE` is the point rather than a
concession, and why it is still not a second reader. So "a fifth importer turns a green suite
red" above now reads "a SIXTH", which is the same drift this docstring names rather than hides:

    python3 -c "from pathlib import Path; print(len(list(Path('backend/src').rglob('*.py'))))"
    # 208                                       [MEASURED 2026-09-12, ADR-038/D1]
"""

from __future__ import annotations

import ast
import inspect
from pathlib import Path

from src.modules.sentimento.domain import as_of_accessor
from src.modules.sentimento.domain.as_of_accessor import AsOfReading

SRC_ROOT = Path(__file__).resolve().parents[2] / "src"
"""`backend/src` — the production tree, resolved from this file so it does not depend on cwd."""

READ_PATH_COLUMNS = frozenset({"observed_at", "available_at", "bucket_end"})
"""The three columns a series read has to consult, and the three a second reader would need.

They are the terms of R-1, R-2 and the knowledge horizon. A module that touches none of them
cannot be reducing a series to a value at a decision instant; a module that touches any of them
is either this accessor or a second read path.
"""

# ── THE DECLARED SET, AND EVERY ENTRY CARRIES ITS REASON ───────────────────────────────────
#
# This is a PIN over a MEASURED set, not an allowlist that absolves. Each entry names the
# enclosing functions permitted to touch the columns, so a new function inside an
# already-listed module is caught too — which is where a second reader would most naturally be
# born, next to code that already has the row in its hands.
DECLARED_TOUCHERS: dict[str, frozenset[str]] = {
    # The accessor itself. `as_of` and its private helpers are ONE read path split for `C90`
    # (max-complexity 10); `AsOfReading.projection` reads the winning row back out.
    #
    # `ADR-039` adds `as_of_batch` — the SECOND DOOR of this same accessor, never a second
    # accessor (its four conditions `C1`-`C4` are argued in the function's own docstring and
    # pinned by `DECLARED_PRODUCERS` below) — and, with it, four private helpers. Three of the
    # four exist precisely so the two doors do NOT hold two copies of the same truth, which is
    # the divergence this whole file is about:
    #
    #   `_admits`             the admission conjunction, moved out of `as_of`'s comprehension
    #                         into ONE named place that BOTH doors call. It is the same five
    #                         terms, not a rewrite of them (`ADR-039`/`D1`/`C2`).
    #   `_reading_for`        the two `O(1)` post-filters plus the reading, likewise shared.
    #   `_absorb`             the running minimum per `bucket_end` (`ADR-039`/`D3`) — batch-only,
    #                         because `as_of` has no pointer to fold rows into.
    #   `_activation_instant` the ONE thing that is genuinely NEW: the earliest `t` at which
    #                         `_admits` can hold. It is DELIBERATELY NOT called by `as_of` —
    #                         sharing it would move both sides of `ADR-039`/`C3`'s differential
    #                         together and blind it to exactly the defect the `748`
    #                         `available_at < bucket_end` rows exist to catch.
    #
    # None of the four is a second READ: none is reachable from outside this module, none takes
    # a store, and the ONE question "what was this series worth at `t`" is still answered by the
    # two public doors alone, which `C3` holds bit-identical to each other.
    #
    # ⚠️ `as_of_batch` IS ABSENT FROM THIS SET, AND THAT ABSENCE IS THE MEASUREMENT, NOT AN
    # OVERSIGHT: this scan finds `ast.Attribute` reads of the three read-path columns, and
    # `as_of_batch` has NONE. It never spells `.observed_at`, `.available_at` or `.bucket_end`
    # itself — every one of them is reached through `_admits`, `_activation_instant`, `_absorb`
    # and `_reading_for`, the shared helpers `as_of` reaches them through too. That is
    # `ADR-039`/`D1`/`C2` ("a semantics that stays written in one place") turned from a claim
    # into something an AST can check: a batch door that had rewritten the conjunction would
    # have had to name those columns, and naming them would have put it in this set. Adding it
    # here anyway would make this registry lie in the safe-looking direction — it would reserve
    # a permission the function does not use, and the day it starts using it nothing would move.
    "modules/sentimento/domain/as_of_accessor.py": frozenset(
        {
            "as_of",
            "_admits",
            "_activation_instant",
            "_absorb",
            "_reading_for",
            "_r2_admits",
            "_first_observation_order",
            "projection",
        }
    ),
    # WRITE path, not read path, and the distinction is the whole point: `reject_clock_skew`
    # compares a row against ITSELF (`event_time` against `available_at`) to decide whether it
    # may be STORED. It never sees a decision instant, so it cannot answer "what was the value
    # at `t`" — which is what a second reader would be.
    "modules/sentimento/domain/provenance.py": frozenset({"reject_clock_skew"}),
    # `T-02.2`: ANOTHER write path, same category as `provenance.py` above. `record()` persists
    # `entry.available_at` (always `None` in F0 — `domain/quarantine_terms.py`'s
    # `COINALYZE_ONE_SHOT_TERMS` never sets it) and never compares it against a decision instant
    # `t`. `read_promoted()` in the SAME module does not appear here on purpose: it filters
    # `available_at IS NOT NULL` in a SQL STRING (a presence check, "has this row been
    # promoted", never "what was the value at t") and never touches `.available_at` as a Python
    # attribute — `ast.Attribute` cannot see inside a string, and there is nothing to declare.
    "modules/sentimento/infra/sqlite_series_quarantine_store.py": frozenset({"record"}),
    # `T-07.5`: a THIRD write path, same category as the two above. `write_series_row` reads
    # `row.bucket_end` only to put it in a `logger.info` `extra={}` dict, identifying WHICH
    # bucket a write outcome was about — never comparing it against a decision instant `t`, and
    # never returning a value "as of" anything. `D7.16`'s own comparison
    # (`modeled_write_overwrites_observed`, `domain/provenance.py`) does not touch a read-path
    # column at all: it takes the caller's already-computed `observed_already_present: bool`,
    # which is exactly why it needs no entry here.
    "modules/sentimento/use_cases/write_series_row.py": frozenset({"write_series_row"}),
    # `T-06.4`: a DIFFERENT AGGREGATE, not a second read path. `FundingRecord.observed_at`
    # (`PRD-001` §5.6's own PK spelling: `(instrument_id, settle_bucket, source, observed_at)`)
    # names WHEN a funding row was observed — never a series' value AT a decision instant `t`.
    # `__post_init__` checks `settle_bucket` is the grid slot its OWN `observed_at` implies
    # (`D6.11`), `settlement_residual_ms` returns the jitter past that slot, and `primary_key`
    # projects it into the PK tuple — none of the three ever consult a second row or a `t` to
    # answer "what was this series worth", which is the one question `as_of` alone may answer.
    "modules/sentimento/domain/funding_settlement.py": frozenset(
        {"__post_init__", "settlement_residual_ms", "primary_key"}
    ),
    # `T-01.2`: SERIALIZATION, same category as `write_series_row.py` above. `encode()` projects
    # an already-built `SeriesRow` into the flat `str -> str` wire mapping that
    # `RedisStreamPublisher.publish` sends (`SPEC-004` §3.2) — it reads `row.bucket_end`,
    # `row.available_at` and `row.observed_at` only to `str()` them into that mapping, never
    # comparing any of the three against a decision instant `t`. `decode()` does not appear here:
    # it builds the field mapping by KEYWORD NAME (`bucket_end=_decode_int("bucket_end", ...)`),
    # never as `.attr` on a `SeriesRow` instance, so `ast.Attribute` has nothing to see there.
    "modules/sentimento/infra/series_row_wire.py": frozenset({"encode"}),
    # `T-02.2` (`captura-em-producao`, not the `plataforma-dados` task of the same id cited
    # above): a write path, same category as `sqlite_series_quarantine_store.record` and
    # `series_row_wire.encode` above. `observed_already_present` reads `row.bucket_end` only
    # to key `D7.16`'s presence predicate ("does this BUCKET already have an OBSERVADO row"),
    # never against a decision instant `t`; `accept` persists an already-cleared `SeriesRow` into
    # `md.series` (`row.bucket_end`/`row.available_at`/`row.observed_at` all travel into the
    # `INSERT` tuple), the same "write it down" category as the two precedents above, never a
    # value read back out "as of" anything.
    "modules/sentimento/infra/postgres_series_sink.py": frozenset(
        {"observed_already_present", "accept"}
    ),
    # `T-01.3` (`cinco-metricas-do-core`): PRODUCER BOOKKEEPING, and it is the same category as
    # `write_series_row.py` above rather than a new one. `_publish_klines_page` reads
    # `row.bucket_end` off the rows it JUST BUILT, to advance the klines collector's in-process
    # watermark ("the newest bar already published for this symbol") so the next cycle's
    # overlapping page does not republish it. Three properties make it not a second reader, and
    # each is checkable rather than asserted: (a) there is no decision instant `t` in the
    # function — the only other timestamp it has is `_epoch_ms()`, the collector's own clock at
    # publication, not an `as_of` argument; (b) it never consults a SECOND row to choose a
    # winner, it takes a `max()` over rows it is publishing in the same breath; (c) it returns a
    # COUNT, never a value, so no caller can mistake its answer for "what was this series worth
    # at `t`". The alternative — advancing the watermark off `row.event_time`, which is the same
    # instant for these rows and is NOT in `READ_PATH_COLUMNS` — was rejected on purpose: it
    # would have kept this file out of this registry by picking a synonym, which is a bypass of
    # the gate, not a compliance with it.
    #
    # `T-03.3` (`cinco-metricas-do-core`, phase `03`) adds `_publish_open_interest_page` to the
    # SAME entry, for the SAME three reasons and with one extra: it reads `row.bucket_end` off
    # rows it just built (to advance the open-interest watermark) AND calls
    # `open_interest_bucket_end(point)` on RAW PAYLOAD POINTS — mappings straight off the wire,
    # not `SeriesRow` instances — to compare them against that watermark. Neither touch is a
    # read "as of" a decision instant: (a) there is no `t` in the function, only `_epoch_ms()`;
    # (b) the comparison is against this process's own high-water mark, never a second row
    # competing to be the answer; (c) it returns a COUNT. The anti-lookahead comparison that
    # DOES involve an instant lives in `use_cases/collector_series_mapping`, and it compares
    # against the collector's observation clock rather than against a caller's `t`.
    #
    # `T-04.3` (phase `04`) adds `_collect_long_short_for_symbol` — the THIRD function of this
    # same file, and the SAME category as the two above rather than a new one: producer
    # bookkeeping, not a second reader. It reads `row.bucket_end` off the rows the mapping JUST
    # BUILT, to advance the long/short collector's in-process watermark ("the newest bucket
    # already published for this symbol") so the next cycle's overlapping page does not
    # republish it. The three checkable properties hold unchanged: (a) there is no decision
    # instant `t` in the function — its only other timestamp is `_epoch_ms()`, the collector's
    # own clock at publication, not an `as_of` argument; (b) it never consults a SECOND row to
    # choose a winner, it takes a `max()` over rows it is publishing in the same breath; (c) it
    # returns totals, never a value. And the same alternative was rejected for the same reason:
    # `row.event_time` is the SAME instant for these rows (`label_shift = 0`) and is NOT in
    # `READ_PATH_COLUMNS`, so keying the watermark off it would have kept this function out of
    # this registry by picking a synonym — a bypass of the gate, not a compliance with it.
    #
    # `T-03.4` (`paineis-de-fluxo`, track `03a`) adds `_run_open_interest_poll_collector` — the
    # FOURTH function of this file, and again producer bookkeeping, not a second reader. It
    # reads `row.bucket_end` off the rows `settle_open_interest_poll_cycle` JUST BUILT and the
    # sink JUST ACCEPTED, to advance the poll collector's in-process watermark (`{symbol: newest
    # T written}`) so the same minute is never published twice. The three checkable properties
    # hold: (a) there is no decision instant `t` in the function — its only timestamps are
    # `wall_clock_s()`, the collector's own clock around each call, and the ticker's target,
    # which decides WHEN to call and is never compared against a stored row; (b) it never
    # consults a SECOND stored row to choose a winner — it takes a `max()` over rows it published
    # in the same cycle against its own high-water mark; (c) it returns nothing — the watermark
    # never leaves the thread, so no caller can mistake it for "what was this series worth at
    # `t`". Same refusal as above: keying the watermark off `row.event_time` (the same instant
    # for these rows, and not in `READ_PATH_COLUMNS`) would have kept it out of this registry by
    # picking a synonym.
    "modules/sentimento/infra/collectors_cli.py": frozenset(
        {
            "_publish_klines_page",
            "_publish_open_interest_page",
            "_collect_long_short_for_symbol",
            "_run_open_interest_poll_collector",
        }
    ),
    # `T-01.5` (`SPEC-008`): PRODUCER BOOKKEEPING, the same category as the three
    # `collectors_cli.py` functions above and for the same three checkable reasons.
    # `_publish_page` of the ONE-SHOT backfill reads `row.bucket_end` off the rows the mapping
    # JUST BUILT, to count DISTINCT buckets — because since `T-01.3` one bar is six rows, and
    # `len(rows)` would report six times the bars and make `n_returned - n_published` (the size
    # of the anti-lookahead cut) negative. (a) There is no decision instant `t` in the function;
    # its only timestamp is the caller's `now_ms()`, the job's own clock at publication. (b) It
    # never consults a SECOND row to pick a winner — it takes the CARDINALITY of a set over rows
    # it is publishing in the same breath. (c) It returns two counts, never a value.
    #
    # ⚠️ The cheap way out was available and was REFUSED for the reason the `collectors_cli.py`
    # entry already names: `row.event_time` is the SAME instant for these rows (`label_shift =
    # 0`) and is NOT in `READ_PATH_COLUMNS`, so counting on it would have kept this function out
    # of this registry by picking a synonym — a bypass of the gate wearing compliance.
    "modules/sentimento/infra/klines_backfill_cli.py": frozenset({"_publish_page"}),
    # `T-01.2` (`pagina-de-grafico-s2`): SERIALIZATION, same category as `write_series_row.py`
    # and `series_row_wire.py` above — `SeriesHistoryRow` is a NEW dataclass (its OWN
    # `available_at`, not `SeriesRow`'s), and `to_wire()` only projects an already-computed
    # field into the `SPEC-006 §5.2` row mapping. It never compares against a decision instant
    # `t` — the ONE comparison against `t` in this whole feature happens inside `as_of()`
    # itself, in `use_cases/series_history.py`, which reads the answer back out through
    # `AsOfReading.projection()` (a dict, not an attribute) precisely so it never needs an
    # entry here.
    "modules/sentimento/domain/series_history_report.py": frozenset({"to_wire"}),
    # `T-01.7` (`CST-203`, `candle-real-e-eixo-unico`): the candle-fidelity harness, and it is
    # an EIGHTH toucher that is not an eighth reader — the distinction this whole file exists
    # to police, applied to a module that never opens a store at all.
    #
    # It consumes rows `/api/v1/series-history` ALREADY answered (`as_of`, one door, upstream)
    # and asks a question no reader asks: "which kind of write put this cell here, and does it
    # equal what the venue published for that minute". `available_at` is read for PROVENANCE
    # — `available_at - event_time`, a publication LAG — and never as half of the admission
    # conjunction. There is no decision instant `t` anywhere in the module, no `Observation`,
    # no `SeriesRow`, no `bucket_end` of a stored row: the three functions below see only what
    # the wire already served.
    #
    #   `publication_lag_ms`  the subtraction itself. A NEGATIVE result is the module's proof
    #                         that a cell was carried (`WriterTrace.CARRIED`), which is a
    #                         statement about `LOCF` having happened — never a decision to
    #                         perform it.
    #   `_repeat_runs_of`     folds consecutive grid instants that share `(value, available_at)`
    #                         into ONE observation answering several instants. It compares two
    #                         served cells with each other, never a cell with a `t`.
    #   `compare_candles`     the comparison against the origin, which routes through the two
    #                         above. It takes no store handle and no clock.
    #
    # ⚠️ `infra/candle_fidelity_cli.py` IS ABSENT HERE, AND THE ABSENCE IS THE MEASUREMENT,
    # exactly as it is for `as_of_batch` at the top of this registry: the CLI reaches the same
    # column as `row.get("available_at")`, a STRING KEY on a wire dict, and `ast.Attribute`
    # cannot see inside a string. Declaring it anyway would reserve a permission it does not
    # use, and the day it starts using one nothing would move.
    "modules/sentimento/domain/candle_fidelity.py": frozenset(
        {"publication_lag_ms", "_repeat_runs_of", "compare_candles"}
    ),
}


class _ColumnToucherVisitor(ast.NodeVisitor):
    """Collect the names of the functions that reference a read-path column, per module.

    A class rather than a closure because `ruff`'s `B023` is right about the closure: a nested
    function that reads a loop variable is a real hazard, and the scan is over a loop of files.
    """

    def __init__(self) -> None:
        """Start with an empty scope stack and an empty hit set."""
        self.scope: list[str] = []
        self.hits: set[str] = set()

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:  # noqa: N802
        """Push the function name, walk its body, pop it."""
        self._in_scope(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:  # noqa: N802
        """Push the coroutine name, walk its body, pop it."""
        self._in_scope(node)

    def visit_Attribute(self, node: ast.Attribute) -> None:  # noqa: N802
        """Record the enclosing function when the attribute is a read-path column."""
        if node.attr in READ_PATH_COLUMNS:
            self.hits.add(self.scope[-1] if self.scope else "<module>")
        self.generic_visit(node)

    def _in_scope(self, node: ast.FunctionDef | ast.AsyncFunctionDef) -> None:
        self.scope.append(node.name)
        self.generic_visit(node)
        self.scope.pop()


def _touchers() -> dict[str, set[str]]:
    """Return, per production module, the functions that reference a read-path column."""
    found: dict[str, set[str]] = {}
    for path in sorted(SRC_ROOT.rglob("*.py")):
        visitor = _ColumnToucherVisitor()
        visitor.visit(ast.parse(path.read_text(encoding="utf-8")))
        if visitor.hits:
            found[path.relative_to(SRC_ROOT).as_posix()] = visitor.hits
    return found


def test_the_set_of_modules_touching_a_read_path_column_is_exactly_the_declared_one() -> None:
    """A new module reading `observed_at`/`available_at`/`bucket_end` fails here."""
    assert set(_touchers()) == set(DECLARED_TOUCHERS)


def test_inside_those_modules_the_set_of_functions_is_exactly_the_declared_one() -> None:
    """A new FUNCTION next to the existing ones fails here — the likelier way a fork is born."""
    measured = _touchers()
    for module, functions in DECLARED_TOUCHERS.items():
        assert measured[module] == set(functions), module


def test_the_scan_has_a_non_empty_universe_so_a_green_result_means_something() -> None:
    """`ADR-012`: `rc=0` over an empty universe cannot tell "clean" from "never looked"."""
    modules = list(SRC_ROOT.rglob("*.py"))
    assert len(modules) >= 116, f"only {len(modules)} modules scanned — the universe collapsed"


# Every public callable of `as_of_accessor` allowed to produce an `AsOfReading`, each with the
# reason it is NOT a second reading track — same format as `DECLARED_TOUCHERS` above, and for the
# same reason: a registry whose entries carry no argument is a list, not a gate.
DECLARED_PRODUCERS = [
    # The DEFINITION of the read (`ADR-039/D1`, `C2`). Every other entry here owes a
    # bit-for-bit differential against THIS one over `projection()`, never an argument.
    "as_of",
    # `ADR-039`/`D1`: the SECOND DOOR of this same accessor, and the four cumulative conditions
    # that admit it are checkable rather than asserted — which is the whole point of writing the
    # reason here instead of a name:
    #
    # `C1` it lives in `as_of_accessor.py`, beside the definition, inside the SAME
    #      `DECLARED_TOUCHERS` entry above. In `use_cases/` the column scan would accuse it, and
    #      would be right — a reader born next to its caller is how the fork starts.
    # `C2` `as_of` is NOT removed and is NOT re-expressed as `as_of_batch(t)[0]`. The inversion
    #      is the tempting form and it is refused: the day the definition becomes the optimised
    #      code, nobody can prove equivalence against anything. And the admission conjunction is
    #      NOT rewritten either — `_admits` is the one place it is written and both doors call
    #      it, so what `as_of_batch` reformulates is the ALGORITHM (`O(n log n + m)` against
    #      `O(n * m)`), never the semantics.
    # `C3` the gate is DIFFERENTIAL, not argumentative, and it runs on a REAL slice of
    #      `md.series`: `test_as_of_batch_differential.py` asserts
    #      `as_of_batch(...)[i].projection() == as_of(t=instants[i], ...).projection()` bit for
    #      bit over `571` real rows that carry the `D2` defect a synthetic fixture does not
    #      have — `2` of the `748` rows with `available_at < bucket_end` (`ADR-039`/`D2`),
    #      INCLUDING THE WORST (`-3.481.439 ms`), plus `23` multi-row buckets re-minimised
    #      backwards (`D3`).
    #      ⛔ The three numbers in the previous version of these lines (`1.282` rows, `5` of
    #      the 748, `53` buckets) were WRONG — none matched what the differential asserts, and
    #      `/review` of this branch caught them against `CLAUDE.md`'s "nenhum número sem o
    #      comando que o produziu". These are the asserted ones:
    #      `test_as_of_batch_differential.py:238` (`len(early) == 2`), `:261`
    #      (`re_minimised == 23`), and `len(_observations()) == 571`.
    #      ⚠️ `D3` is carried but NOT observable at the reading on today's data (`0` of `5.624`
    #      — see that file's universe section), so its falsifier runs on a LABELLED synthetic
    #      pair. `D2`'s runs on the real rows.
    # `C4` this entry, and the tightened `_mentions_a_reading` below that made the guard able to
    #      see a `-> tuple[AsOfReading, ...]` at all. Before `ADR-039` it could not, and would
    #      have passed this change WITHOUT A LINE ALTERED.
    #
    # ⛔ It is not a second reading TRACK because it produces no answer of its own: every
    # reading it returns is the reading `as_of` returns for the same instant, and that claim is
    # a test that runs, not a sentence in this comment.
    "as_of_batch",
]


def _mentions_a_reading(annotation: object) -> bool:
    """Return whether this annotation produces an `AsOfReading`, under ANY spelling.

    ⛔ Asking `annotation in {AsOfReading, "AsOfReading"}` — what this test did until
    `ADR-039` — is a gate that does not look. `as_of_accessor` carries
    `from __future__ import annotations`, so every annotation arrives as a STRING: a new
    public `-> tuple[AsOfReading, ...]` spells `"tuple[AsOfReading, ...]"`, which is not in
    that set, and the old assert passed **without a single line changed**
    `[MEDIDO 2026-09-16: regressao plantada, suite VERDE 5 passed]`.

    That is the exact act `DECLARED_TOUCHERS`'s `collectors_cli.py` entry already names and
    rejects — "it would have kept this file out of this registry by picking a synonym, which
    is a bypass of the gate, not a compliance with it". Matching the MENTION instead of the
    whole annotation closes it: a container of readings is still a producer of readings.
    """
    if annotation is inspect.Signature.empty:
        return False
    if annotation is AsOfReading:
        return True
    return AsOfReading.__name__ in str(annotation)


def test_exactly_one_public_callable_in_the_module_produces_a_reading() -> None:
    """The uniqueness stated inside the module: one function returns `AsOfReading`.

    `reject_delay_threshold_above_staleness` is public and is NOT an accessor — it returns
    `None` and only refuses. The distinction is the return type, so this test asks for it
    directly instead of trusting the naming.

    ⚠️ The distinction is the return type, NOT the spelling of it — see `_mentions_a_reading`.
    """
    producers = [
        name
        for name, member in vars(as_of_accessor).items()
        if not name.startswith("_")
        and inspect.isfunction(member)
        and member.__module__ == as_of_accessor.__name__
        and _mentions_a_reading(inspect.signature(member).return_annotation)
    ]
    assert producers == DECLARED_PRODUCERS, (
        f"public callables producing an AsOfReading changed: {producers} != "
        f"{DECLARED_PRODUCERS}. A new one is a SECOND TRACK unless ADR-039/D1's C1-C4 hold; "
        f"declare it in DECLARED_PRODUCERS with the reason, never by renaming its return type."
    )


DECLARED_IMPORTERS = frozenset(
    {
        # `T-01.2` (`pagina-de-grafico-s2`): the FIRST real consumer this test's docstring
        # predicted — `build_series_history_report` calls `as_of()` once per grid instant.
        "modules/sentimento/use_cases/series_history.py",
        # The three modules below import only TYPES from `as_of_accessor`
        # (`BarPolicy`/`Observation`/`DecisionReadRefusedError`) to speak the same vocabulary
        # as the use case above — none of them calls `as_of()` itself, so none becomes a
        # second reader; that claim is what `DECLARED_TOUCHERS` above still polices.
        "modules/sentimento/domain/series_history_report.py",
        "modules/sentimento/infra/postgres_series_window_reader.py",
        "api/routes/series_history.py",
        # `ADR-038`/`D1`: imports ONE CONSTANT — `CARRY_FORWARD_BY_NATURE` — and never calls
        # `as_of()`, never sees an `Observation`, never touches a row. It is on the WRITE path
        # (`use_cases/collector_series_mapping.py` imports it to stamp `available_at`), and it
        # needs that table because whether a nature carries forward is precisely what decides
        # whether a MODELED stamp of one native grid is readable at all: `as_of` vetoes
        # `age_ms >= bucket_interval_ms` for a nature that does not, and a stamp of exactly one
        # grid makes that condition hold at every readable instant (`0/61` measured for
        # `Nature.RATIO`, against `61/61` for `Nature.STOCK` —
        # `docs/context/cinco-metricas-do-core/gates/ADR-038-D1-builder.md` §2).
        #
        # ⚠️ IMPORTING IS THE POINT, NOT A CONCESSION. Re-declaring the carry-forward table on
        # the write side would be two truths about one fact, and they would diverge silently:
        # the writer would keep stamping rows the reader had started vetoing, and both files
        # would still read correctly alone. `DECLARED_TOUCHERS` above is what still polices the
        # claim that this module is not a second reader — it touches none of the three
        # read-path columns of anything it did not itself construct.
        "modules/sentimento/domain/modeled_availability.py",
    }
)


def test_the_set_of_modules_importing_this_accessor_is_exactly_the_declared_one() -> None:
    """The importer set is no longer empty — `T-01.2` is the first real consumer.

    A new importer outside `DECLARED_IMPORTERS` fails here, same "notice and extend" contract
    the previous, vacuous version of this test named: nobody becomes importer number five
    quietly.
    """
    importers = set()
    for path in SRC_ROOT.rglob("*.py"):
        if path.name == "as_of_accessor.py":
            continue
        if "as_of_accessor" in path.read_text(encoding="utf-8"):
            importers.add(path.relative_to(SRC_ROOT).as_posix())
    assert importers == set(DECLARED_IMPORTERS)
