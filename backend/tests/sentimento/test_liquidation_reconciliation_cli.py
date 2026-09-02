"""`dispatch` wired end to end against REAL files under `tmp_path` — zero fake, zero network."""

from __future__ import annotations

import json
import logging
from collections.abc import Mapping
from pathlib import Path

import pytest

from src.modules.sentimento.domain.coinalyze_daily_series import (
    LIQUIDATION_REQUIREMENT,
    DailyPoint,
    SeriesKind,
    evaluate_series_requirement,
)
from src.modules.sentimento.domain.quarantine_terms import COINALYZE_ONE_SHOT_TERMS
from src.modules.sentimento.domain.quarantined_series_entry import QuarantinedSeriesEntry
from src.modules.sentimento.infra import liquidation_reconciliation_cli
from src.modules.sentimento.infra.sqlite_series_quarantine_store import (
    SqliteSeriesQuarantineStore,
)

_DAY_EPOCH_SECONDS = 1_756_684_800  # 2025-09-01T00:00:00Z, day-aligned


def _capture_emitted(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Redirect `emit` to a list — same pattern `coinalyze_one_shot_cli`'s own tests use."""
    lines: list[str] = []

    def capture(payload: Mapping[str, object]) -> str:
        line = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        lines.append(line)
        return line

    monkeypatch.setattr(liquidation_reconciliation_cli, "emit", capture)
    return lines


def _seed_quarantine(db_path: Path, symbol: str, points: tuple[DailyPoint, ...]) -> None:
    """Write ONE quarantined `LIQUIDATION` row for `symbol`, same shape `T-02.2` writes."""
    store = SqliteSeriesQuarantineStore(db_path)
    store.initialise()
    entry = QuarantinedSeriesEntry(
        source="coinalyze",
        series_kind=SeriesKind.LIQUIDATION,
        binance_symbol=symbol,
        coinalyze_symbol=f"{symbol}_PERP.A",
        points=points,
        requirement_verdict=evaluate_series_requirement(LIQUIDATION_REQUIREMENT, points),
        quarantine=COINALYZE_ONE_SHOT_TERMS,
        received_at="2026-09-01T12:00:00Z",
        run_id="run-t-03.11-test",
    )
    store.record(entry)


def _write_evidence(path: Path, raw_messages: list[str]) -> None:
    """Write one `ForceOrderEnvelope`-shaped JSONL line per `raw_messages` entry."""
    with path.open("w", encoding="utf-8") as handle:
        for raw in raw_messages:
            handle.write(json.dumps({"received_at": "2026-09-01T00:00:01Z", "raw": raw}) + "\n")


def _raw_force_order(quantity: str, transact_time_ms: int, symbol: str = "BTCUSDT") -> str:
    """Build a minimal, valid `!forceOrder@arr` raw text for `symbol`."""
    return (
        '{"e":"forceOrder","E":1,"o":{"s":"'
        + symbol
        + '","S":"SELL","o":"LIMIT","f":"IOC","q":"'
        + quantity
        + '","p":"1","ap":"1","X":"FILLED","l":"'
        + quantity
        + '","z":"'
        + quantity
        + '","T":'
        + str(transact_time_ms)
        + "}}"
    )


def test_dispatch_reads_quarantine_and_evidence_and_emits_one_line_per_day_plus_summary(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Real SQLite file + real JSONL file, `dispatch` runs against both, unmocked."""
    lines = _capture_emitted(monkeypatch)
    db_path = tmp_path / "quarantine.sqlite3"
    point = DailyPoint(_DAY_EPOCH_SECONDS, {"t": _DAY_EPOCH_SECONDS, "l": "2.0", "s": "0"})
    _seed_quarantine(db_path, "BTCUSDT", (point,))
    evidence_path = tmp_path / "force_order.jsonl"
    _write_evidence(
        evidence_path,
        [_raw_force_order("1.0", _DAY_EPOCH_SECONDS * 1000 + 1_000)],
    )

    code = liquidation_reconciliation_cli.dispatch(
        [str(db_path), "BTCUSDT", "0.4", "1.2", str(evidence_path)],
        liquidation_reconciliation_cli._real_store_factory,
    )

    assert code == 0
    assert len(lines) == 2
    payloads = [json.loads(line) for line in lines]
    assert payloads[0]["command"] == "reconcile"
    assert payloads[0]["symbol"] == "BTCUSDT"
    assert payloads[0]["captured_quantity"] == "1.0"
    assert payloads[0]["coinalyze_quantity"] == "2.0"
    assert payloads[0]["ratio"] == "0.5"
    assert payloads[0]["hypothesis"] == "same_stream_inconclusive"
    assert "Nao se sabe se a Coinalyze" in payloads[0]["caveat"]
    assert payloads[1] == {
        "command": "reconcile_summary",
        "symbol": "BTCUSDT",
        "n_days": 1,
        "n_captured_messages": 1,
        "skipped_malformed_messages": 0,
    }


def test_dispatch_reads_more_than_one_evidence_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The CLI accepts multiple `evidencia.jsonl` arguments — one collector run per file."""
    lines = _capture_emitted(monkeypatch)
    db_path = tmp_path / "quarantine.sqlite3"
    point = DailyPoint(_DAY_EPOCH_SECONDS, {"t": _DAY_EPOCH_SECONDS, "l": "2.0", "s": "0"})
    _seed_quarantine(db_path, "BTCUSDT", (point,))
    evidence_a = tmp_path / "a.jsonl"
    evidence_b = tmp_path / "b.jsonl"
    _write_evidence(evidence_a, [_raw_force_order("1.0", _DAY_EPOCH_SECONDS * 1000 + 1_000)])
    _write_evidence(evidence_b, [_raw_force_order("1.0", _DAY_EPOCH_SECONDS * 1000 + 2_000)])

    liquidation_reconciliation_cli.dispatch(
        [str(db_path), "BTCUSDT", "0.8", "1.2", str(evidence_a), str(evidence_b)],
        liquidation_reconciliation_cli._real_store_factory,
    )

    summary = json.loads(lines[-1])
    assert summary["n_captured_messages"] == 2


def test_dispatch_skips_a_torn_evidence_line_and_counts_it(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A torn JSONL line (no trailing `}`) is skipped before it ever reaches the message parser."""
    lines = _capture_emitted(monkeypatch)
    db_path = tmp_path / "quarantine.sqlite3"
    point = DailyPoint(_DAY_EPOCH_SECONDS, {"t": _DAY_EPOCH_SECONDS, "l": "0", "s": "0"})
    _seed_quarantine(db_path, "BTCUSDT", (point,))
    evidence_path = tmp_path / "force_order.jsonl"
    evidence_path.write_text('{"received_at": "x", "raw": "{torn\n', encoding="utf-8")

    liquidation_reconciliation_cli.dispatch(
        [str(db_path), "BTCUSDT", "0.8", "1.2", str(evidence_path)],
        liquidation_reconciliation_cli._real_store_factory,
    )

    summary = json.loads(lines[-1])
    assert summary["n_captured_messages"] == 0


def test_dispatch_refuses_when_no_quarantined_series_exists(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`T-02.2` must run before `T-03.11` can reconcile — refuse with a named reason, no crash."""
    _capture_emitted(monkeypatch)
    db_path = tmp_path / "quarantine.sqlite3"
    evidence_path = tmp_path / "force_order.jsonl"
    _write_evidence(evidence_path, [])

    with pytest.raises(SystemExit, match="nenhuma serie LIQUIDATION em quarentena"):
        liquidation_reconciliation_cli.dispatch(
            [str(db_path), "BTCUSDT", "0.8", "1.2", str(evidence_path)],
            liquidation_reconciliation_cli._real_store_factory,
        )


def test_dispatch_refuses_a_non_decimal_bound() -> None:
    """A `near_one` bound that does not read as `Decimal` is refused before any file is opened."""
    with pytest.raises(SystemExit, match="nao leem como Decimal"):
        liquidation_reconciliation_cli.dispatch(
            ["db.sqlite3", "BTCUSDT", "nao-e-decimal", "1.2", "ev.jsonl"],
            liquidation_reconciliation_cli._real_store_factory,
        )


def test_dispatch_refuses_too_few_arguments() -> None:
    """Fewer than 5 tokens prints the usage line instead of guessing what was meant."""
    with pytest.raises(SystemExit, match="uso:"):
        liquidation_reconciliation_cli.dispatch(
            ["db.sqlite3", "BTCUSDT"],
            liquidation_reconciliation_cli._real_store_factory,
        )


def test_read_captured_raw_messages_skips_lines_with_no_string_raw_field(tmp_path: Path) -> None:
    """A JSON line missing `raw` (or non-string), and a truly blank line, are both skipped."""
    path = tmp_path / "mixed.jsonl"
    path.write_text(
        "\n".join(
            [
                json.dumps({"received_at": "x", "raw": "ok"}),
                "",  # a genuinely blank line between two real ones, not just trailing whitespace
                json.dumps({"received_at": "x"}),
                json.dumps({"received_at": "x", "raw": 123}),
                "",
            ]
        ),
        encoding="utf-8",
    )

    messages = liquidation_reconciliation_cli.read_captured_raw_messages((path,))

    assert messages == ("ok",)


def test_emit_writes_one_stable_line_and_returns_exactly_what_it_wrote(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Same contract `coinalyze_one_shot_cli.emit` proves: the bytes are what the logger wrote."""
    with caplog.at_level(logging.INFO, logger=liquidation_reconciliation_cli.logger.name):
        line = liquidation_reconciliation_cli.emit({"b": 2, "a": 1})

    assert line == '{"a": 1, "b": 2}'
    assert caplog.messages == [line]


def test_the_product_logger_is_never_the_same_logger_as_the_diagnostics_one() -> None:
    """Same measured defect `quota_ramp_cli.py` fixed: `__name__` under `-m` collapses loggers."""
    assert (
        liquidation_reconciliation_cli.logger.name
        != liquidation_reconciliation_cli._APPLICATION_LOGGER
    )
    assert liquidation_reconciliation_cli._APPLICATION_LOGGER == "src"
    assert liquidation_reconciliation_cli.logger.name.startswith(
        f"{liquidation_reconciliation_cli._APPLICATION_LOGGER}."
    )


def test_the_stream_wiring_keeps_diagnostics_off_the_product_stream() -> None:
    """A host that configured INFO on `stdout` must not contaminate the first JSON line."""
    application = logging.getLogger("src")
    before = list(application.handlers)
    propagate_before = application.propagate
    try:
        liquidation_reconciliation_cli.route_diagnostics_away_from_the_product_stream()
        assert application.propagate is False
        assert len(application.handlers) == len(before) + 1
    finally:
        application.handlers = before
        application.propagate = propagate_before


def test_configure_product_stream_gives_the_product_logger_stdout() -> None:
    """The product logger gets its own `stdout` handler and stops propagating."""
    handlers_before = list(liquidation_reconciliation_cli.logger.handlers)
    propagate_before = liquidation_reconciliation_cli.logger.propagate
    try:
        liquidation_reconciliation_cli._configure_product_stream()
        assert liquidation_reconciliation_cli.logger.propagate is False
        assert len(liquidation_reconciliation_cli.logger.handlers) == len(handlers_before) + 1
    finally:
        liquidation_reconciliation_cli.logger.handlers = handlers_before
        liquidation_reconciliation_cli.logger.propagate = propagate_before


def test_main_wires_the_streams_and_refuses_too_few_arguments_offline() -> None:
    """`main` is reachable offline — it opens no socket, so a usage failure needs no fixture."""
    application = logging.getLogger("src")
    handlers_before = list(application.handlers)
    propagate_before = application.propagate
    product_handlers_before = list(liquidation_reconciliation_cli.logger.handlers)
    product_propagate_before = liquidation_reconciliation_cli.logger.propagate
    try:
        with pytest.raises(SystemExit, match="uso:"):
            liquidation_reconciliation_cli.main(["so-um-arg"])
        assert application.propagate is False
        assert liquidation_reconciliation_cli.logger.propagate is False
    finally:
        application.handlers = handlers_before
        application.propagate = propagate_before
        liquidation_reconciliation_cli.logger.handlers = product_handlers_before
        liquidation_reconciliation_cli.logger.propagate = product_propagate_before
