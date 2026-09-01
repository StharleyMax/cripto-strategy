"""`daily_instrument_universe_snapshot_cli`: fetch, confirm, store, report — once a day."""

# `T-02.1`/`CST-12` (plan `02`, items 2.1+2.2). Composition root: it is the ONLY module of this
# task that opens a socket (via `BinanceFuturesSnapshotClient`) or reads the wall clock. Product
# output is one canonical-JSON line on `stdout`, same contract as `infra/ingest_health_cli.py`
# and `infra/quota_ramp_cli.py` (`ADR-008/D2`) — diagnostics go to `stderr`, so a host that
# configured `INFO` on `stdout` before calling this cannot contaminate the record.
#
# `Q1` (owner, 2026-09-01, `docs/decisoes-do-owner.md`): this is code plus an offline/short-probe
# proof, NOT a continuous deploy — nothing here schedules itself. An operator (or, later, a
# scheduler) runs this once a day; `data(ultimo snapshot) == hoje` over 7 consecutive days
# (`D2.1`) is an operational measurement this CLI makes trivial, not one it performs by running.

from __future__ import annotations

import logging
import sys
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Final, Protocol

from src.modules.sentimento.domain.canonical_json import canonical_json
from src.modules.sentimento.domain.instrument_universe_snapshot import (
    ExchangeInfoPayload,
    FundingInfoEntry,
    PremiumIndexEntry,
    compare_symbol_sets,
    exchange_info_symbols,
    funding_info_symbols,
    funding_interval_hours_distribution,
    premium_index_symbols,
)
from src.modules.sentimento.infra.binance_futures_snapshot_client import (
    BinanceFuturesSnapshotClient,
)
from src.modules.sentimento.infra.instrument_universe_snapshot_store import (
    RawInstrumentUniverseCapture,
    write_snapshot,
)
from src.modules.sentimento.use_cases.capture_instrument_universe_snapshot import (
    UnstableExchangeInfoReadError,
    capture_instrument_universe_snapshot,
)

# `__spec__.name`, not `__name__` — same reasoning, and the same defect being avoided, as
# `infra/quota_ramp_cli.py:_MODULE`: under `-m`, `__name__` is `"__main__"`, which would make
# the diagnostic handler attach to the PRODUCT logger and duplicate every line onto both
# streams. `infra/ingest_health_cli.py` still carries that latent shape; not fixed here
# because it belongs to a different task (named debt, same precedent as `quota_ramp_cli.py`).
_MODULE: Final[str] = __spec__.name if __spec__ is not None else __name__
logger = logging.getLogger(_MODULE)

_STABLE_FORMAT: Final[str] = "%(message)s"
_DIAGNOSTIC_FORMAT: Final[str] = "%(levelname)s %(name)s %(message)s"
_APPLICATION_LOGGER: Final[str] = _MODULE.split(".")[0]

_USAGE: Final[str] = "uso: daily_instrument_universe_snapshot_cli <diretorio-de-snapshots>"


class SnapshotClient(Protocol):
    """The three calls `run` needs — `BinanceFuturesSnapshotClient`'s public surface.

    A `Protocol` and not the concrete class, so a test can hand `run` a fake that returns
    frozen real captures without touching a socket — the same shape `use_cases/
    run_quota_ramp.py`'s `QuotaProbe` gives `infra/quota_ramp_cli.py`.
    """

    def exchange_info(self) -> ExchangeInfoPayload:  # noqa: D102
        ...

    def funding_info(self) -> list[FundingInfoEntry]:  # noqa: D102
        ...

    def premium_index(self) -> list[PremiumIndexEntry]:  # noqa: D102
        ...


def emit(payload: dict[str, object]) -> str:
    """Write one canonical-JSON line and return it, so a caller can hash what was written."""
    line = canonical_json(payload)
    logger.info(line)
    return line


def run(
    directory: Path,
    client: SnapshotClient,
    captured_on: str,
    received_at: str,
) -> str:
    """Fetch the three sources (twice for `exchangeInfo`), store, and report the outcome.

    `exchangeInfo` is fetched TWICE, back to back — the "confirmacao em duas leituras" of
    `SPEC-001` §3.4 (`D2.5`) — and `capture_instrument_universe_snapshot` refuses to proceed if
    the two disagree on `symbol`/`underlyingSubType`. `fundingInfo`/`premiumIndex` are read
    once each; nothing in the plan or the DoD asks for a second confirmation of those.
    """
    exchange_info_first = client.exchange_info()
    exchange_info_second = client.exchange_info()
    funding_info = client.funding_info()
    premium_index = client.premium_index()

    snapshot = capture_instrument_universe_snapshot(
        exchange_info_first,
        exchange_info_second,
        funding_info,
        premium_index,
        captured_on,
    )

    capture: RawInstrumentUniverseCapture = {
        "captured_on": captured_on,
        "received_at": received_at,
        "exchange_info": exchange_info_second,
        "funding_info": list(funding_info),
        "premium_index": list(premium_index),
    }
    path = write_snapshot(directory, capture)

    ei_symbols = exchange_info_symbols(exchange_info_second)
    fi_symbols = funding_info_symbols(funding_info)
    pi_symbols = premium_index_symbols(premium_index)
    ei_vs_pi = compare_symbol_sets(ei_symbols, pi_symbols)
    ei_vs_fi = compare_symbol_sets(ei_symbols, fi_symbols)

    return emit(
        {
            "report": "instrument_universe_snapshot_captured",
            "captured_on": captured_on,
            "path": str(path),
            "size_bytes_gzip": path.stat().st_size,
            "n_rows": len(snapshot.rows),
            "fingerprint": snapshot.fingerprint(),
            "funding_interval_hours_distribution": funding_interval_hours_distribution(
                snapshot.rows
            ),
            "exchange_info_n_symbols": len(ei_symbols),
            "funding_info_n_symbols": len(fi_symbols),
            "premium_index_n_symbols": len(pi_symbols),
            # D2.3 — SPEC-001 §3.4: a divergencia entre exchangeInfo e premiumIndex e DADO.
            "premium_index_extra_symbols": list(ei_vs_pi.only_in_second),
            # D2.4 — as entradas de fundingInfo que NAO estao em exchangeInfo sao COIN-M.
            "funding_info_coin_m_symbols": list(ei_vs_fi.only_in_second),
        }
    )


def route_diagnostics_away_from_the_product_stream() -> None:
    """Send this application's diagnostics to `stderr`, so `stdout` is the report ALONE."""
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter(_DIAGNOSTIC_FORMAT))
    application = logging.getLogger(_APPLICATION_LOGGER)
    application.addHandler(handler)
    application.propagate = False


def _configure_product_stream() -> None:
    """Give the product logger `stdout` with the stable format, and stop it propagating."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(_STABLE_FORMAT))
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)
    logger.propagate = False


def main(argv: Sequence[str]) -> int:
    """Compose the real client and the real clock, then run once.

    An `UnstableExchangeInfoReadError` (`D2.5`'s refusal path) is reported as a `stdout` line
    carrying `verdict: "unstable_read"` rather than a bare traceback — a caller scripting this
    CLI reads the SAME stream either way, and a non-zero exit still tells a shell script it
    failed.
    """
    if len(argv) != 1:
        raise SystemExit(_USAGE)
    route_diagnostics_away_from_the_product_stream()
    _configure_product_stream()
    now = datetime.now(UTC)
    captured_on = now.date().isoformat()
    received_at = now.isoformat()
    client = BinanceFuturesSnapshotClient()
    try:
        run(Path(argv[0]), client, captured_on, received_at)
    except UnstableExchangeInfoReadError as unstable:
        emit(
            {
                "report": "instrument_universe_snapshot_captured",
                "captured_on": captured_on,
                "verdict": "unstable_read",
                "reason": str(unstable),
            }
        )
        return 1
    return 0


if __name__ == "__main__":  # pragma: no cover - composition root, run by hand and never by a gate
    raise SystemExit(main(sys.argv[1:]))
