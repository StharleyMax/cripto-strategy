"""Shift of `daily/metrics` labels: one `event_time` per row, and the mandatory total order."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Final

# ── WHAT LIVES HERE, AND WHY IT IS ONE MODULE ──────────────────────────────────────────────
#
# `plano 04` (`docs/plans/SPEC-001-plataforma-dados/04_contrato_temporal.md`) items 4.1, 4.2 and
# 4.4. Three things live here, and they are ONE module because they are one decision applied to
# one row at a time:
#
#   4.1  `event_time = create_time + 300000`, computed ONCE per row and carried alongside
#        `src_label_raw` — never recomputed per metric column.
#   4.2  the file does NOT arrive sorted (`D4.1`/`CA-F1-1`: 13 of 30 days, 0 until 2026-08-10,
#        13/13 from 2026-08-11 on, max displacement 275 of 288 positions) — so sorting the WHOLE
#        file before anything is emitted is not an optimization, it is the contract.
#   4.4  a missing grid step is COUNTED, never FILLED — this module has no function whose return
#        type could carry a manufactured value for an absent bucket.

# `SPEC-001` §2.2, measured MAE 0,000000 against `openInterestHist` (288/288) —
# `tests/sentimento/test_series_identity.py::test_label_shift_is_a_term_with_a_witness` pins
# the same constant on the `SeriesKey` side (`label_shift`). This module is the OTHER half:
# the ETL that actually produces the labeled row, not just the identity that names the shift.
LABEL_SHIFT_MS: Final[int] = 300_000

# The eight raw columns of `daily/metrics`, transcribed from the CSV header shipped in
# `data/binance/metrics/btcusdt/*.csv` (catalogued in `data/MANIFEST.md`). `create_time` and
# `symbol` are not metrics, but `plano 04` item 4.1 is explicit that the shift is "aplicado
# UMA vez às oito colunas" — one `event_time`/`src_label_raw` pair rides all eight.
RAW_METRICS_COLUMNS: Final[tuple[str, ...]] = (
    "create_time",
    "symbol",
    "sum_open_interest",
    "sum_open_interest_value",
    "count_toptrader_long_short_ratio",
    "sum_toptrader_long_short_ratio",
    "count_long_short_ratio",
    "sum_taker_long_short_vol_ratio",
)


@dataclass(frozen=True)
class RawMetricsRow:
    """One row of `daily/metrics`, as the file states it — before the shift.

    `create_time_ms` is an INJECTED epoch value: `infra` parses the wall-clock string and hands
    the number in, because `domain` may not import `datetime` (`Natureza`,
    `backend/pyproject.toml [tool.importlinter]`). `create_time_raw` is the EXACT string the
    file carried; `src_label_raw` below is a copy of it and never a re-derivation from the
    parsed number, so a row that changed shape between read and label would show up as two
    different strings instead of silently agreeing.
    """

    create_time_ms: int
    create_time_raw: str
    symbol: str
    sum_open_interest: Decimal
    sum_open_interest_value: Decimal
    count_toptrader_long_short_ratio: Decimal
    sum_toptrader_long_short_ratio: Decimal
    count_long_short_ratio: Decimal
    sum_taker_long_short_vol_ratio: Decimal


@dataclass(frozen=True)
class LabeledMetricsRow:
    """One row after the canonical shift: `event_time` and `src_label_raw`, then the six metrics.

    `event_time` names the CLOSE of the 5-minute bucket (`D4.3`); `create_time` named the OPEN.
    `+300000` ms is exactly the width of the grid this source publishes on, never a guess.
    """

    event_time: int
    src_label_raw: str
    symbol: str
    sum_open_interest: Decimal
    sum_open_interest_value: Decimal
    count_toptrader_long_short_ratio: Decimal
    sum_toptrader_long_short_ratio: Decimal
    count_long_short_ratio: Decimal
    sum_taker_long_short_vol_ratio: Decimal


def shift_to_event_time(create_time_ms: int) -> int:
    """Return `create_time + 300000` — the ONE shift, applied uniformly (`plano 04` item 4.1).

    `sum_taker_long_short_vol_ratio` is KNOWN to carry a DIFFERENT, undocumented convention:
    `D4.10` measures it correlating with the return of the bucket it is shifted INTO (r well
    above the correlation with the past or the following bucket) rather than describing the
    bucket that just closed — the canonical signature of a mislabeled flow column. This
    function does not special-case it. Correcting that column HERE would be a second, silent
    shift living beside the declared one, invisible to anything that reads `LABEL_SHIFT_MS`;
    the anti-lookahead defense for a live decision is `available_at` (`plano 04` item 4.6,
    `SPEC-001` §2.3), decided by a LATER task, never a per-column label hack in this one.
    """
    return create_time_ms + LABEL_SHIFT_MS


def label_metrics_row(raw: RawMetricsRow) -> LabeledMetricsRow:
    """Apply the shift once and carry `src_label_raw` alongside — the whole row, one instant.

    Exposed on its own (rather than only inside `label_and_sort_metrics_rows`) because the
    regression test for `plano 04` item 4.2 needs to construct the UNSORTED case on purpose:
    calling this function once per row, in file order, is exactly the mutant "bypass the sort"
    that `D4.1` says must reprove.
    """
    return LabeledMetricsRow(
        event_time=shift_to_event_time(raw.create_time_ms),
        src_label_raw=raw.create_time_raw,
        symbol=raw.symbol,
        sum_open_interest=raw.sum_open_interest,
        sum_open_interest_value=raw.sum_open_interest_value,
        count_toptrader_long_short_ratio=raw.count_toptrader_long_short_ratio,
        sum_toptrader_long_short_ratio=raw.sum_toptrader_long_short_ratio,
        count_long_short_ratio=raw.count_long_short_ratio,
        sum_taker_long_short_vol_ratio=raw.sum_taker_long_short_vol_ratio,
    )


def label_and_sort_metrics_rows(
    raw_rows: Sequence[RawMetricsRow],
) -> tuple[LabeledMetricsRow, ...]:
    """Label every row and return them in `event_time` order — the ONLY sanctioned exit here.

    `plano 04` item 4.2, literal: "ordenação obrigatória do arquivo inteiro antes de emitir
    evento — bypassar o sort REPROVA". There is deliberately no parameter to skip the `sorted`
    below and no second function that returns labeled rows unsorted: the file NOT arriving
    ordered is a MEASURED property of the source, not a caller's mistake to guard against
    (`D4.1`/`CA-F1-1`: 13 of 30 days out of order, 0 until 2026-08-10, all 13 from 2026-08-11
    on, one file with 275-of-288 positions displaced). A caller that wants "the file, labeled"
    has exactly one way to ask for it, and this is it.

    The sort is by `event_time`, which is a strictly increasing function of `create_time`
    (`shift_to_event_time` adds a constant), so ordering by one orders by the other — sorting
    after the shift rather than before costs nothing and keeps the pipeline to one pass.
    """
    labeled = [label_metrics_row(raw) for raw in raw_rows]
    return tuple(sorted(labeled, key=lambda row: row.event_time))


@dataclass(frozen=True)
class MetricsGap:
    """One absence in the shifted grid: `[from_event_time, to_event_time]`, with the count between.

    `SPEC-001` §3.5 / `md.ingest_gap` fixes the persisted shape as `(source, symbol,
    series_key_id, from_ts, to_ts, n_missing, class, detected_at)`
    (`src/modules/sentimento/domain/ingest_record.py::IngestGap`). This type carries only the
    THREE fields this layer can compute without an identity or a clock — `infra` attaches the
    rest, because formatting `from_ts`/`to_ts` as ISO strings needs `datetime`, which `domain`
    may not import (`Natureza` contract).
    """

    from_event_time: int
    to_event_time: int
    n_missing: int


def detect_gaps(
    sorted_rows: Sequence[LabeledMetricsRow], *, grid_ms: int
) -> tuple[MetricsGap, ...]:
    """Find every missing grid step between consecutive rows — NEVER filled, only counted.

    `plano 04` item 4.4: "`md.ingest_gap` persistido, lacuna nunca preenchida por
    interpolação". This function does not — and structurally cannot — invent a row: its return
    type has no slot for a value, only for a boundary and a count. `D4.2` is the fixture this
    repository ships for it: `data/binance/metrics/btcusdt/2026-08-12.csv` has three
    CONSECUTIVE missing 5-minute buckets between raw `create_time` 11:40 and 12:00
    (11:45/11:50/11:55 absent), which is `n_missing=3` in ONE gap — not three gaps of
    `n_missing=1` (`CA-F1-2` records that the fixture used to claim three gaps and that the
    test as originally written would have REPROVED a correct implementation for merging them).

    RAISES if `sorted_rows` is not already in non-decreasing `event_time` order: this function
    trusts the caller exactly as far as `label_and_sort_metrics_rows` extends that trust, and
    checking it here is what makes "detect gaps on an accidentally-unsorted sequence" fail
    loudly instead of reporting a gap count that depends on file order.
    """
    if grid_ms <= 0:
        raise ValueError(f"grid_ms = {grid_ms} must be positive")
    gaps: list[MetricsGap] = []
    for previous, current in zip(sorted_rows, sorted_rows[1:], strict=False):
        if current.event_time < previous.event_time:
            raise ValueError(
                f"rows are not sorted by event_time: {previous.event_time} then "
                f"{current.event_time} — detect_gaps only reads an already-ordered sequence"
            )
        delta = current.event_time - previous.event_time
        if delta > grid_ms:
            gaps.append(
                MetricsGap(
                    from_event_time=previous.event_time,
                    to_event_time=current.event_time,
                    n_missing=delta // grid_ms - 1,
                )
            )
    return tuple(gaps)
