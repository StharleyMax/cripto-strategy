"""`D6.16`: `nextFundingTime % (interval_hours * 3_600_000) == 0`, over the real TRADING universe.

`docs/context/plataforma-dados/handoff/T-06.4.md` and `docs/context/plataforma-dados/
tasks_review.md:319` cite this invariant measured `570/570` on the `2026-08-25` snapshot — but
`data/MANIFEST.md:144` records, in its own words, that `2026-08-25_fundingInfo.json` has "sem
`premiumIndex` companheiro (não capturado nesta rodada)": no `exchangeInfo`+`fundingInfo`+
`premiumIndex` TRIPLE exists for that date, only `fundingInfo` alone. The nearest matched
triple `MANIFEST.md:143-148` documents by construction ("usado com fi/pi do mesmo dia para o
join completo") is `2026-09-01`, so this test RE-MEASURES the invariant on that date rather than
transcribing the `2026-08-25` figure it cannot reproduce from a fixture that does not exist —
`[MEDIDO 2026-09-01]`, not copied from the plan.

**4h is still the rule, not 8h**, which is the qualitative claim `D6.16` exists to pin: this
snapshot's own distribution keeps 4h as the plurality.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, TypedDict

from src.modules.sentimento.domain.funding_settlement import settlement_residual_ms
from tests.helpers.data_fixtures import require_fixture

_SNAPSHOT_DATE = "2026-09-01"

_EXCHANGE_INFO = "snapshots/2026-09-01_exchangeInfo.json"
_EXCHANGE_INFO_MD5 = "d8f752bd53a7573a70d49d88a3e983e5"

_FUNDING_INFO = "snapshots/2026-09-01_fundingInfo.json"
_FUNDING_INFO_MD5 = "23f0cfdc0d4db5f91c3486f149b4c578"

_PREMIUM_INDEX = "snapshots/2026-09-01_premiumIndex.json"
_PREMIUM_INDEX_MD5 = "a936ee911f3a7700f1ed5761969bf8df"


class _TradingPerpetualUniverse(TypedDict):
    """The three per-symbol facts this test joins — nothing else of the three payloads."""

    funding_interval_hours: int
    next_funding_time: int


def _load_json(relative_path: str, *, expected_md5: str) -> Any:  # noqa: ANN401 — raw JSON payload
    path: Path = require_fixture(relative_path, expected_md5=expected_md5)
    result: Any = json.loads(path.read_text(encoding="utf-8"))
    return result


def _trading_perpetual_symbols(exchange_info: dict[str, Any]) -> frozenset[str]:
    """`status == TRADING` and `contractType == PERPETUAL` — the 570-ish universe `D6.16` names."""
    symbols: list[dict[str, Any]] = exchange_info["symbols"]
    return frozenset(
        entry["symbol"]
        for entry in symbols
        if entry["status"] == "TRADING" and entry["contractType"] == "PERPETUAL"
    )


def _joined_universe() -> dict[str, _TradingPerpetualUniverse]:
    """Join the three sources on `symbol`, restricted to TRADING perpetuals present in all three."""
    exchange_info: dict[str, Any] = _load_json(_EXCHANGE_INFO, expected_md5=_EXCHANGE_INFO_MD5)
    funding_info: list[dict[str, Any]] = _load_json(_FUNDING_INFO, expected_md5=_FUNDING_INFO_MD5)
    premium_index: list[dict[str, Any]] = _load_json(
        _PREMIUM_INDEX, expected_md5=_PREMIUM_INDEX_MD5
    )

    trading = _trading_perpetual_symbols(exchange_info)
    interval_by_symbol = {entry["symbol"]: entry["fundingIntervalHours"] for entry in funding_info}
    next_funding_by_symbol = {entry["symbol"]: entry["nextFundingTime"] for entry in premium_index}

    common = trading & interval_by_symbol.keys() & next_funding_by_symbol.keys()
    return {
        symbol: {
            "funding_interval_hours": interval_by_symbol[symbol],
            "next_funding_time": next_funding_by_symbol[symbol],
        }
        for symbol in common
    }


def test_d6_16_the_matched_triple_has_569_common_trading_perpetual_symbols() -> None:
    """`[MEDIDO {date}]`: universe size, so the count below travels with its own provenance."""
    universe = _joined_universe()
    assert len(universe) == 569, (
        f"expected 569 TRADING PERPETUAL symbols common to all three {_SNAPSHOT_DATE} "
        f"snapshots, got {len(universe)} — the universe drifted since this test was written"
    )


def test_d6_16_nextfundingtime_divides_evenly_by_its_own_interval_for_every_symbol() -> None:
    """The falsifier itself: `569/569`, zero exceptions, snapshot date attached to the number.

    `[MEDIDO {date}]` command: this test, over the three md5-pinned snapshot files above.
    `settlement_residual_ms` is the SAME domain function `D6.11` uses on past settlements —
    here every residual must be exactly `0`, because `nextFundingTime` is a SCHEDULED future
    instant with no processing jitter to absorb.
    """
    universe = _joined_universe()
    violations = [
        symbol
        for symbol, facts in universe.items()
        if settlement_residual_ms(facts["next_funding_time"], facts["funding_interval_hours"]) != 0
    ]
    assert violations == [], (
        f"{len(violations)} of {len(universe)} symbols have a nextFundingTime off their own "
        f"interval grid on the {_SNAPSHOT_DATE} snapshot: {violations[:10]}"
    )


def test_d6_16_4h_is_the_rule_not_8h_with_the_snapshot_date_attached() -> None:
    """`[MEDIDO {date}]`: `{4h: 430, 8h: 136, 1h: 3}` — 4h is the plurality, never assume 8h.

    The `2026-08-25` figure the plan cites (`433/136/1` of `570`) cannot be reproduced from a
    fixture that does not exist (see module docstring) — this is the SAME invariant, measured
    on the nearest date a matched triple actually exists for, with its own date named beside
    the number rather than presented as if it reproduced the plan's.
    """
    universe = _joined_universe()
    distribution: dict[int, int] = {}
    for facts in universe.values():
        hours = facts["funding_interval_hours"]
        distribution[hours] = distribution.get(hours, 0) + 1

    assert distribution == {4: 430, 8: 136, 1: 3}
    assert distribution[4] > distribution[8], "4h must be the plurality, not 8h"
