"""`D2.2`-`D2.5` (`SPEC-001` §3.4, plan `02` items 2.1+2.2), run against REAL Binance captures.

Every number asserted below was measured on these exact fixtures by this test's own logic
`[MEDIDO 2026-09-01]`, command:
`bash backend/scripts/test.sh -k test_instrument_universe_snapshot`
over the files `data/MANIFEST.md` catalogs under "fixtures de `T-02.1`". No fixture here is
synthetic: `handoff/T-02.1.md` is explicit that `D2.3`/`D2.4` exist to prove that real
`exchangeInfo`/`premiumIndex`/`fundingInfo` data changes between calls, which a hand-written
fixture cannot demonstrate by construction.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast

from src.modules.sentimento.domain.instrument_universe_snapshot import (
    MARKET_COIN_M,
    MARKET_USDS_M,
    FundingInfoEntry,
    InstrumentUniverseSnapshot,
    PremiumIndexEntry,
    build_instrument_rows,
    compare_symbol_sets,
    exchange_info_fingerprint,
    exchange_info_symbols,
    funding_info_symbols,
    funding_interval_hours_distribution,
    premium_index_symbols,
)
from tests.helpers.data_fixtures import require_fixture

_EI_0824 = "binance/rest/ei.json"
_EI_0824_MD5 = "dbdba08fa871dab3341a15b4c3e3abc4"
_EI2_0824 = "binance/rest/ei2.json"
_EI2_0824_MD5 = "9cab1cbc1df29227acffbd8d82d834aa"
_FI_0824 = "binance/rest/fi.json"
_FI_0824_MD5 = "708ad49f70069d725477b1b7a5c02510"
_PI_0824 = "binance/rest/pi.json"
_PI_0824_MD5 = "f8ab44575844421c2603eb71466dcb4d"

_EI_0901 = "snapshots/2026-09-01_exchangeInfo.json"
_EI_0901_MD5 = "d8f752bd53a7573a70d49d88a3e983e5"
_FI_0901 = "snapshots/2026-09-01_fundingInfo.json"
_FI_0901_MD5 = "23f0cfdc0d4db5f91c3486f149b4c578"
_PI_0901 = "snapshots/2026-09-01_premiumIndex.json"
_PI_0901_MD5 = "a936ee911f3a7700f1ed5761969bf8df"


def _load(relative: str, expected_md5: str) -> Any:  # noqa: ANN401 - raw JSON, shaped by callers
    """Read one cataloged fixture, pinned by `md5`, and decode it as JSON."""
    path: Path = require_fixture(relative, expected_md5=expected_md5)
    return json.loads(path.read_text(encoding="utf-8"))


def _rows_0824() -> tuple[Any, ...]:
    """Build the joined rows of the 2026-08-24 capture — the fixture most tests share."""
    return build_instrument_rows(
        _load(_EI_0824, _EI_0824_MD5), _load(_FI_0824, _FI_0824_MD5), _load(_PI_0824, _PI_0824_MD5)
    )


def _rows_0901() -> tuple[Any, ...]:
    """Build the joined rows of the 2026-09-01 capture."""
    return build_instrument_rows(
        _load(_EI_0901, _EI_0901_MD5), _load(_FI_0901, _FI_0901_MD5), _load(_PI_0901, _PI_0901_MD5)
    )


# ── D2.5 — payload_hash bruto NAO detecta mudanca; a projecao canonica SIM confirma ────────


def test_d2_5_two_reads_3ms_apart_have_different_raw_bytes_but_equal_fingerprint() -> None:
    """`ei.json`/`ei2.json`: `serverTime` moves 3 ms, the raw dict changes, the hash does not."""
    first = _load(_EI_0824, _EI_0824_MD5)
    second = _load(_EI2_0824, _EI2_0824_MD5)

    assert first["serverTime"] != second["serverTime"]
    assert second["serverTime"] - first["serverTime"] == 3
    assert first != second  # the raw payloads genuinely differ
    assert len(first["symbols"]) == len(second["symbols"]) == 872

    assert exchange_info_fingerprint(first) == exchange_info_fingerprint(second)


def test_d2_5_fingerprint_reacts_to_a_real_change_in_underlying_sub_type() -> None:
    """The narrow projection is not a constant: mutating one symbol's tag moves the hash."""
    payload = _load(_EI_0824, _EI_0824_MD5)
    mutated = json.loads(json.dumps(payload))
    mutated["symbols"][0]["underlyingSubType"] = ["MUTATED"]

    assert exchange_info_fingerprint(payload) != exchange_info_fingerprint(mutated)


# ── D2.3 — exchangeInfo x premiumIndex: a segunda testemunha do universo ───────────────────


def test_d2_3_premium_index_names_three_symbols_exchange_info_does_not() -> None:
    """`pi.json` (875) over `ei.json` (872): three extras, and it is DATA, not an error."""
    ei_symbols = exchange_info_symbols(_load(_EI_0824, _EI_0824_MD5))
    pi_symbols = premium_index_symbols(_load(_PI_0824, _PI_0824_MD5))

    assert len(ei_symbols) == 872
    assert len(pi_symbols) == 875

    divergence = compare_symbol_sets(ei_symbols, pi_symbols)
    assert divergence.only_in_second == ("EOSUSDT", "FRONTUSDT", "MATICUSDT")
    assert divergence.only_in_first == ()


# ── D2.4 — exchangeInfo x fundingInfo: `market` impede colisao de string ───────────────────


def test_d2_4_funding_info_carries_twenty_coin_m_symbols_outside_exchange_info() -> None:
    """`fi.json` names 20 symbols `ei.json` does not — the COIN-M stowaways of `SPEC-001` §3.4."""
    ei_symbols = exchange_info_symbols(_load(_EI_0824, _EI_0824_MD5))
    fi_symbols = funding_info_symbols(_load(_FI_0824, _FI_0824_MD5))

    divergence = compare_symbol_sets(ei_symbols, fi_symbols)
    assert len(divergence.only_in_second) == 20
    assert all(symbol.endswith("_PERP") for symbol in divergence.only_in_second)
    assert divergence.only_in_first != ()  # exchangeInfo also has symbols fundingInfo lacks


# ── D2.2 — a distribuicao de fundingIntervalHours difere entre capturas ────────────────────


def test_d2_2_funding_interval_hours_distribution_differs_eight_days_apart() -> None:
    """08-24 vs 09-01 (8 days): both universe size and interval mix moved — real drift."""
    rows_0824 = _rows_0824()
    rows_0901 = _rows_0901()

    dist_0824 = funding_interval_hours_distribution(rows_0824)
    dist_0901 = funding_interval_hours_distribution(rows_0901)

    assert dist_0824 == {8: 314, 4: 444, 1: 2}
    assert dist_0901 == {8: 324, 4: 443, 1: 3}
    assert dist_0824 != dist_0901

    snapshot_0824 = InstrumentUniverseSnapshot(captured_on="2026-08-24", rows=rows_0824)
    snapshot_0901 = InstrumentUniverseSnapshot(captured_on="2026-09-01", rows=rows_0901)
    assert snapshot_0824.fingerprint() != snapshot_0901.fingerprint()


# ── `build_instrument_rows` — o join, testado por caso, nao so por contagem ────────────────


def test_build_instrument_rows_assigns_market_by_exchange_info_membership() -> None:
    """A USDⓈ-M symbol (`BTCUSDT`) and a COIN-M one (`BTCUSD_PERP`) land on opposite markets."""
    rows = _rows_0824()
    by_symbol = {row.symbol: row for row in rows}

    assert by_symbol["BTCUSDT"].market == MARKET_USDS_M
    assert by_symbol["BTCUSDT"].underlying_sub_type == ("PoW",)
    assert by_symbol["BTCUSD_PERP"].market == MARKET_COIN_M
    # A COIN-M row has no exchangeInfo entry to read a tag from: absence of OBSERVATION.
    assert by_symbol["BTCUSD_PERP"].underlying_sub_type is None


def test_build_instrument_rows_distinguishes_no_tag_observed_from_tag_observed_empty() -> None:
    """`USDCUSDT` HAS an `exchangeInfo` row whose `underlyingSubType` is `[]`, not missing."""
    rows = _rows_0824()
    by_symbol = {row.symbol: row for row in rows}

    observed_empty = by_symbol["USDCUSDT"].underlying_sub_type
    not_observed = by_symbol["BTCUSD_PERP"].underlying_sub_type
    assert observed_empty == ()
    assert not_observed is None
    assert observed_empty != not_observed


def test_build_instrument_rows_reads_interest_rate_from_premium_index_only() -> None:
    """A symbol premium_index has no row for gets `interest_rate = None`, not a guessed zero."""
    ei = _load(_EI_0824, _EI_0824_MD5)
    fi = _load(_FI_0824, _FI_0824_MD5)
    pi = cast("list[PremiumIndexEntry]", _load(_PI_0824, _PI_0824_MD5))
    pi_without_btc = [entry for entry in pi if entry["symbol"] != "BTCUSDT"]

    rows = build_instrument_rows(ei, fi, pi_without_btc)
    by_symbol = {row.symbol: row for row in rows}

    assert by_symbol["BTCUSDT"].interest_rate is None
    assert by_symbol["ETHUSDT"].interest_rate is not None


def test_build_instrument_rows_leaves_funding_interval_hours_none_without_a_funding_entry() -> None:
    """A symbol only `exchangeInfo` names (no `fundingInfo` row) carries no funding interval."""
    ei = _load(_EI_0824, _EI_0824_MD5)
    fi = cast("list[FundingInfoEntry]", _load(_FI_0824, _FI_0824_MD5))
    fi_without_btc = [entry for entry in fi if entry["symbol"] != "BTCUSDT"]
    pi = _load(_PI_0824, _PI_0824_MD5)

    rows = build_instrument_rows(ei, fi_without_btc, pi)
    by_symbol = {row.symbol: row for row in rows}

    assert by_symbol["BTCUSDT"].funding_interval_hours is None
    assert by_symbol["ETHUSDT"].funding_interval_hours is not None


def test_build_instrument_rows_is_sorted_by_symbol() -> None:
    """`InstrumentUniverseSnapshot.canonical_lines` trusts this order instead of re-sorting."""
    rows = _rows_0824()
    assert [row.symbol for row in rows] == sorted(row.symbol for row in rows)


# ── `InstrumentUniverseSnapshot` — a projecao e o hash de identidade ───────────────────────


def test_canonical_projection_is_one_json_line_per_row_plus_a_header() -> None:
    """The header names the query and the count; one canonical line follows per row."""
    rows = _rows_0824()
    snapshot = InstrumentUniverseSnapshot(captured_on="2026-08-24", rows=rows)
    lines = snapshot.canonical_lines()

    header = json.loads(lines[0])
    assert header == {
        "snapshot": "instrument_universe_snapshot",
        "captured_on": "2026-08-24",
        "n_rows": len(rows),
    }
    assert len(lines) == len(rows) + 1
    assert snapshot.canonical_projection() == "\n".join(lines)


def test_fingerprint_is_a_stable_sha256_hex_digest() -> None:
    """`fingerprint()` is a pure function of the rows: rebuilding them reproduces it exactly."""
    snapshot = InstrumentUniverseSnapshot(captured_on="2026-08-24", rows=_rows_0824())
    fingerprint = snapshot.fingerprint()

    assert len(fingerprint) == 64
    assert all(char in "0123456789abcdef" for char in fingerprint)
    rebuilt = InstrumentUniverseSnapshot(captured_on="2026-08-24", rows=_rows_0824())
    assert rebuilt.fingerprint() == fingerprint


def test_fingerprint_differs_when_captured_on_differs_even_with_identical_rows() -> None:
    """The header carries `captured_on` INTO the hash — two days never collide by accident."""
    rows = _rows_0824()
    same_day = InstrumentUniverseSnapshot(captured_on="2026-08-24", rows=rows)
    other_day = InstrumentUniverseSnapshot(captured_on="2026-08-25", rows=rows)
    assert same_day.fingerprint() != other_day.fingerprint()
