"""`resolve_source_floor_ms` — `D8`/`D-C3.7`, `SPEC-008` §7.3 (`T-03.6`).

Builds every `SeriesKey` through the SAME production key-builder functions the real catalog
uses (`open_interest_catalog.py`, `cvd_source_catalog.py`, etc.) rather than hand-rolling
`SeriesKey(...)` literals — a hand-rolled key could silently drift from what the catalog
actually serves, and this module's whole domain is "which KEY resolves to which wall", so the
key itself has to be the real one.
"""

from __future__ import annotations

from src.modules.sentimento.domain.cvd_source_catalog import (
    build_aggtrade_nq_entry,
    build_aggtrade_q_entry,
    build_coinalyze_bv_entry,
    build_kline_takerbuy_entry,
)
from src.modules.sentimento.domain.klines_ohlc_catalog import build_klines_ohlc_key
from src.modules.sentimento.domain.klines_volume_catalog import build_klines_volume_entry
from src.modules.sentimento.domain.liquidation_catalog import coinalyze_liquidation_key
from src.modules.sentimento.domain.long_short_catalog import count_long_short_ratio_key
from src.modules.sentimento.domain.open_interest_catalog import (
    binance_open_interest_key,
    coinalyze_open_interest_key,
)
from src.modules.sentimento.domain.price_source_catalog import (
    build_klines_last_entry,
    build_price_mark_close_entry,
)
from src.modules.sentimento.domain.series_key import Reduction
from src.modules.sentimento.domain.source_floor import (
    KLINES_HISTORY_FLOOR_MS,
    resolve_source_floor_ms,
)

INSTRUMENT_ID = "BTCUSDT"
KNOWLEDGE_TIME_MS = 1_700_000_000_000
_THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000


def test_klines_last_resolves_the_fixed_2019_09_08_epoch() -> None:
    """`price_source_catalog.build_klines_last_entry` — read off `/fapi/v1/klines`."""
    entry = build_klines_last_entry(INSTRUMENT_ID, verified_by="test_source_floor.py")

    assert (
        resolve_source_floor_ms(entry.key, knowledge_time_ms=KNOWLEDGE_TIME_MS)
        == KLINES_HISTORY_FLOOR_MS
    )
    assert KLINES_HISTORY_FLOOR_MS == 1_567_900_800_000  # 2019-09-08T00:00:00Z, transcribed


def test_klines_volume_resolves_the_same_klines_epoch() -> None:
    """`klines_volume` — the same `/fapi/v1/klines` array, a different field."""
    entry = build_klines_volume_entry(INSTRUMENT_ID, unit="BTC", verified_by="test_source_floor.py")

    assert (
        resolve_source_floor_ms(entry.key, knowledge_time_ms=KNOWLEDGE_TIME_MS)
        == KLINES_HISTORY_FLOOR_MS
    )


def test_klines_ohlc_resolves_the_klines_epoch_for_every_reduction() -> None:
    """All four `OPEN`/`HIGH`/`LOW`/`CLOSE` rows share one origin — `/fapi/v1/klines`."""
    for reduction in (Reduction.OPEN, Reduction.HIGH, Reduction.LOW, Reduction.CLOSE):
        key = build_klines_ohlc_key(
            reduction, instrument_id=INSTRUMENT_ID, verified_by="test_source_floor.py"
        )
        assert (
            resolve_source_floor_ms(key, knowledge_time_ms=KNOWLEDGE_TIME_MS)
            == KLINES_HISTORY_FLOOR_MS
        )


def test_kline_takerbuy_cvd_source_resolves_the_klines_epoch() -> None:
    """The ONE `cvd_source` row actually read off `/fapi/v1/klines` (`quantity_field=NA`)."""
    entry = build_kline_takerbuy_entry(INSTRUMENT_ID, unit="BTC")

    assert (
        resolve_source_floor_ms(entry.key, knowledge_time_ms=KNOWLEDGE_TIME_MS)
        == KLINES_HISTORY_FLOOR_MS
    )


def test_aggtrade_q_and_nq_cvd_source_have_no_source_floor() -> None:
    """`CL-5`, capture-or-lose: read live off the trade WS, never a pageable REST history.

    `MORDE` target: a resolver keyed on `metric` alone (never `quantity_field`) would wrongly
    return `KLINES_HISTORY_FLOOR_MS` here, because `aggtrade_q`/`aggtrade_nq` share
    `metric="cvd_source"`/`provider="binance"` with `kline_takerbuy` above.
    """
    q_entry = build_aggtrade_q_entry(INSTRUMENT_ID, unit="BTC", verified_by="test_source_floor.py")
    nq_entry = build_aggtrade_nq_entry(
        INSTRUMENT_ID, unit="BTC", verified_by="test_source_floor.py"
    )

    assert resolve_source_floor_ms(q_entry.key, knowledge_time_ms=KNOWLEDGE_TIME_MS) is None
    assert resolve_source_floor_ms(nq_entry.key, knowledge_time_ms=KNOWLEDGE_TIME_MS) is None


def test_coinalyze_bv_cvd_source_has_no_source_floor() -> None:
    """`provider="coinalyze"` — no measured retention anywhere in this tree."""
    entry = build_coinalyze_bv_entry(INSTRUMENT_ID, unit="BTC", verified_by="test_source_floor.py")

    assert resolve_source_floor_ms(entry.key, knowledge_time_ms=KNOWLEDGE_TIME_MS) is None


def test_binance_open_interest_resolves_30_days_behind_knowledge_time() -> None:
    """`/futures/data/openInterestHist` — the ROLLING wall, `[MEDIDO 2026-09-12]`."""
    key = binance_open_interest_key(instrument_id=INSTRUMENT_ID)

    resolved = resolve_source_floor_ms(key, knowledge_time_ms=KNOWLEDGE_TIME_MS)

    assert resolved == KNOWLEDGE_TIME_MS - _THIRTY_DAYS_MS


def test_coinalyze_open_interest_has_no_source_floor() -> None:
    """The SAME `metric="sum_open_interest"` as the binance row above — `provider` disambiguates.

    `MORDE` target: a resolver keyed on `metric` alone (never `provider`) would wrongly return
    the `/futures/data/*` rolling wall here — this Coinalyze row reads a DIFFERENT, unmeasured
    origin.
    """
    key = coinalyze_open_interest_key(Reduction.CLOSE, instrument_id=INSTRUMENT_ID)

    assert resolve_source_floor_ms(key, knowledge_time_ms=KNOWLEDGE_TIME_MS) is None


def test_count_long_short_ratio_resolves_30_days_behind_knowledge_time() -> None:
    """`/futures/data/globalLongShortAccountRatio` — `ADR-038` §3 extends `D1` to this endpoint."""
    key = count_long_short_ratio_key(INSTRUMENT_ID)

    resolved = resolve_source_floor_ms(key, knowledge_time_ms=KNOWLEDGE_TIME_MS)

    assert resolved == KNOWLEDGE_TIME_MS - _THIRTY_DAYS_MS


def test_price_mark_close_has_no_source_floor() -> None:
    """`/fapi/v1/premiumIndex` — no REST *history* endpoint the way `klines`/`futures/data` do."""
    entry = build_price_mark_close_entry(INSTRUMENT_ID, verified_by="test_source_floor.py")

    assert resolve_source_floor_ms(entry.key, knowledge_time_ms=KNOWLEDGE_TIME_MS) is None


def test_coinalyze_liquidation_has_no_source_floor() -> None:
    """`provider="coinalyze"` — Binance has no REST liquidation endpoint at all."""
    key = coinalyze_liquidation_key("long", instrument_id=INSTRUMENT_ID)

    assert resolve_source_floor_ms(key, knowledge_time_ms=KNOWLEDGE_TIME_MS) is None


def test_the_rolling_wall_moves_with_knowledge_time_ms_never_a_fixed_constant() -> None:
    """`CA-F1-2`: the same key resolves DIFFERENT floors for different `knowledge_time_ms`.

    It is a function of the request, never a cached "now" (which would also break byte-identity
    across two requests issued at different wall-clock instants — see `domain/source_floor.py`'s
    own `CA-F1-2` argument for why this is `knowledge_time_ms`, never a live clock read).
    """
    key = binance_open_interest_key(instrument_id=INSTRUMENT_ID)
    later = KNOWLEDGE_TIME_MS + 86_400_000

    assert resolve_source_floor_ms(key, knowledge_time_ms=later) == later - _THIRTY_DAYS_MS
