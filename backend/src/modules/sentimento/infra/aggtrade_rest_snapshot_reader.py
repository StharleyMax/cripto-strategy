"""Read a Binance REST `aggTrades` snapshot (`GET /fapi/v1/aggTrades`) into `QnqTrade` rows."""
#
# The shape read here is the one `ADR-001` measured directly: a JSON array of objects with keys
# `['T','a','f','l','m','nq','p','q']` — eight fields, `T` the transact time in epoch ms. The
# fixtures this reader targets (`data/binance/rest/nq_{BTC,ETH,SOL,XRP,DOGE}USDT.json`,
# `data/MANIFEST.md`) are exactly that response, one file per symbol, 1000 trades each.
#
# `symbol` and `day` are CALLER-SUPPLIED rather than read from the payload: the REST object
# carries neither (no `"s"` key, unlike the WS event `binance_aggtrade_payload.py` reads), and
# `day` is a calendar label this infra module derives from `T` using `datetime` — legitimate
# HERE, because "Natureza" (`backend/pyproject.toml`) only forbids that import in `domain`/
# `use_cases`, not in `infra`, which is where a clock-shaped computation belongs.

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from src.modules.sentimento.domain.qnq_divergence import QnqTrade


class InvalidRestSnapshotError(Exception):
    """One entry of the snapshot is missing `q`, `nq`, or `T`.

    Refused, never skipped in silence.
    """


def read_qnq_trades_from_rest_snapshot(path: Path, *, symbol: str) -> tuple[QnqTrade, ...]:
    """Read one REST `aggTrades` snapshot file into `QnqTrade`, `day` derived from each `T`.

    Deliberately does NOT accept `day` as a parameter: a snapshot can span a UTC midnight, and
    a caller-supplied single label would silently mis-file whichever trades landed on the other
    side of it. Every entry gets ITS OWN day, read from its own `T` — the grouping in
    `qnq_divergence.measure_qnq_divergence` is what turns that into `QF-6`'s per-day rows.
    """
    entries = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(entries, list):
        raise InvalidRestSnapshotError(f"{path}: root is not a JSON array")

    trades: list[QnqTrade] = []
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            raise InvalidRestSnapshotError(f"{path}[{index}]: entry is not a JSON object")
        raw_q = entry.get("q")
        raw_nq = entry.get("nq")
        transact_time_ms = entry.get("T")
        if not isinstance(raw_q, str) or not isinstance(raw_nq, str):
            raise InvalidRestSnapshotError(
                f"{path}[{index}]: 'q' and 'nq' must both be strings — got "
                f"q={raw_q!r} nq={raw_nq!r}"
            )
        if not isinstance(transact_time_ms, int):
            raise InvalidRestSnapshotError(
                f"{path}[{index}]: 'T' must be an int, got {transact_time_ms!r}"
            )
        trades.append(
            QnqTrade(
                symbol=symbol,
                day=_calendar_day_utc(transact_time_ms),
                raw_q=raw_q,
                raw_nq=raw_nq,
            )
        )
    return tuple(trades)


def _calendar_day_utc(transact_time_ms: int) -> str:
    """Return the UTC calendar day of `transact_time_ms`, as `YYYY-MM-DD`."""
    return datetime.fromtimestamp(transact_time_ms / 1000, tz=UTC).strftime("%Y-%m-%d")
