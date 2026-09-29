"""The `T-03.10` bench: one JSON line per verdict, and an exit status that never reads `0` short."""

from __future__ import annotations

import dataclasses
import json
import logging
from pathlib import Path
from typing import Any

import pytest

from src.modules.sentimento.domain.oi_candle_falsifiers import PropertyDivergence
from src.modules.sentimento.infra import oi_candle_falsifier_cli
from src.modules.sentimento.infra.csv_series_window_reader import CsvSeriesWindowReader
from src.modules.sentimento.use_cases.measure_oi_candle_falsifiers import (
    OiFalsifierMeasurement,
    measure_oi_candle_falsifiers,
)
from tests.helpers.oi_market_export import at, two_regime_records, write_export

CAPTURE_MINUTE = 1445
LAST_MINUTE = 2890


def _export(tmp_path: Path, **overrides: object) -> str:
    records = two_regime_records(
        last_minute=LAST_MINUTE,
        capture_minute=CAPTURE_MINUTE,
        **overrides,  # type: ignore[arg-type]
    )
    return str(write_export(tmp_path / "export.csv", records))


def _argv(export: str, *, last_minute: int = LAST_MINUTE) -> list[str]:
    return [export, "BTCUSDT", str(at(0)), str(at(last_minute)), str(at(last_minute + 10))]


def _lines(caplog: pytest.LogCaptureFixture) -> list[dict[str, object]]:
    return [json.loads(record.getMessage()) for record in caplog.records]


def test_a_consistent_market_exits_zero_with_every_verdict_held(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """Exit `0` only when all 13 verdicts held."""
    with caplog.at_level(logging.INFO, logger=oi_candle_falsifier_cli.logger.name):
        code = oi_candle_falsifier_cli.dispatch(
            _argv(_export(tmp_path)), CsvSeriesWindowReader.from_path
        )

    lines = _lines(caplog)
    assert code == 0
    assert [line["command"] for line in lines] == [
        *["oi_candle_regime"] * 4,
        "oi_candle_spread",
        "oi_candle_falsifiers_summary",
    ]
    assert lines[-1]["worst"] == "held"
    assert lines[-1]["verdicts"] == 13


def test_a_flat_market_exits_one_and_names_the_failed_power(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """A failed falsifier exits `1` and prints its numbers."""
    export = _export(tmp_path, hist_value=lambda _: 1.0, poll_value=lambda _: 1.0)

    with caplog.at_level(logging.INFO, logger=oi_candle_falsifier_cli.logger.name):
        code = oi_candle_falsifier_cli.dispatch(_argv(export), CsvSeriesWindowReader.from_path)

    lines = _lines(caplog)
    assert code == 1
    assert lines[0]["power"] == {"outcome": "failed", "n": 1445, "flat": 1445, "flat_share": 1.0}
    assert lines[-1]["worst"] == "failed"


def test_a_close_divergence_is_printed_with_the_bucket_and_fails(
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """One divergence exits `1` and prints the bucket it happened at."""
    real = measure_oi_candle_falsifiers
    divergence = PropertyDivergence(bucket_end_ms=at(7), expected=None, observed=2.0)

    def _one_divergence(*args: Any, **kwargs: Any) -> OiFalsifierMeasurement:
        measurement = real(*args, **kwargs)
        first = measurement.regimes[0]
        broken = dataclasses.replace(
            first, close=dataclasses.replace(first.close, divergences=(divergence,))
        )
        return dataclasses.replace(measurement, regimes=(broken, *measurement.regimes[1:]))

    monkeypatch.setattr(oi_candle_falsifier_cli, "measure_oi_candle_falsifiers", _one_divergence)
    with caplog.at_level(logging.INFO, logger=oi_candle_falsifier_cli.logger.name):
        code = oi_candle_falsifier_cli.dispatch(
            _argv(_export(tmp_path)), CsvSeriesWindowReader.from_path
        )

    first_line = _lines(caplog)[0]
    assert code == 1
    assert first_line["close"] == {
        "outcome": "failed",
        "n": 1445,
        "divergences": 1,
        "first_divergences": [{"bucket_end_ms": at(7), "expected": None, "observed": 2.0}],
    }


def test_a_window_short_of_the_floors_exits_two_never_zero(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """A short universe with no failure exits `2`, never `0`."""
    with caplog.at_level(logging.INFO, logger=oi_candle_falsifier_cli.logger.name):
        code = oi_candle_falsifier_cli.dispatch(
            _argv(_export(tmp_path), last_minute=CAPTURE_MINUTE + 60),
            CsvSeriesWindowReader.from_path,
        )

    assert code == 2
    assert _lines(caplog)[-1]["worst"] == "inconclusive"


@pytest.mark.parametrize(
    "argv", [["only-one"], ["x.csv", "BTCUSDT", "1", "2", "not-an-int"]], ids=["arity", "ints"]
)
def test_a_malformed_command_line_is_refused(argv: list[str]) -> None:
    """Wrong arity or a non-integer instant is refused before anything is read."""
    with pytest.raises(SystemExit):
        oi_candle_falsifier_cli.dispatch(argv, CsvSeriesWindowReader.from_path)


def test_main_writes_the_record_alone_on_stdout(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """`main` wires the product stream: the JSON lines, and only them, go to `stdout`."""
    code = oi_candle_falsifier_cli.main(_argv(_export(tmp_path)))

    out = capsys.readouterr().out.splitlines()
    assert code == 0
    assert json.loads(out[-1])["command"] == "oi_candle_falsifiers_summary"
