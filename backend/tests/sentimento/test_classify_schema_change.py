"""`classify_and_alarm`: the alarm event fires exactly when the payload is additive.

`T-07.11` (the external alarm channel) is `blocked` on `Q3` as of this task, so the only
observable "alarm" this use case can produce is the structured log event — these tests pin
that it fires for the additive case, stays silent for an exact match, and never fires at all
on a reject (the alarm and the reject are different reactions, `SPEC-001` §5.5).
"""

from __future__ import annotations

import logging

import pytest

from src.modules.sentimento.domain.schema_change import SchemaChangeRejectedError
from src.modules.sentimento.use_cases import classify_schema_change as use_case_module
from src.modules.sentimento.use_cases.classify_schema_change import classify_and_alarm

AGGTRADE_DUMP_CONTRACT: frozenset[str] = frozenset({"T", "a", "f", "l", "m", "p", "q"})
AGGTRADE_REST_WITH_NQ: frozenset[str] = frozenset({"T", "a", "f", "l", "m", "nq", "p", "q"})


def test_additive_field_logs_exactly_one_warning_naming_the_field(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """The additive case is the alarm — one `WARNING` record, naming the unknown field."""
    with caplog.at_level(logging.WARNING, logger=use_case_module.logger.name):
        verdict = classify_and_alarm(
            subject="aggTrade:BTCUSDT",
            expected_fields=AGGTRADE_DUMP_CONTRACT,
            received_fields=AGGTRADE_REST_WITH_NQ,
        )

    assert verdict.unknown_fields == frozenset({"nq"})
    assert len(caplog.records) == 1
    record = caplog.records[0]
    assert record.message == "schema_change_additive_unknown"
    assert record.subject == "aggTrade:BTCUSDT"  # type: ignore[attr-defined]
    assert record.unknown_fields == ["nq"]  # type: ignore[attr-defined]


def test_exact_match_never_alarms(caplog: pytest.LogCaptureFixture) -> None:
    """A payload that matches the contract exactly never produces a log record."""
    with caplog.at_level(logging.WARNING, logger=use_case_module.logger.name):
        verdict = classify_and_alarm(
            subject="aggTrade:BTCUSDT",
            expected_fields=AGGTRADE_DUMP_CONTRACT,
            received_fields=AGGTRADE_DUMP_CONTRACT,
        )

    assert verdict.should_alarm is False
    assert caplog.records == []


def test_missing_field_rejects_without_ever_logging_an_alarm(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """The reject branch propagates unlogged: it is a refusal, not an alarm condition."""
    received = AGGTRADE_DUMP_CONTRACT - {"p"}

    with caplog.at_level(logging.WARNING, logger=use_case_module.logger.name):
        with pytest.raises(SchemaChangeRejectedError):
            classify_and_alarm(
                subject="aggTrade:BTCUSDT",
                expected_fields=AGGTRADE_DUMP_CONTRACT,
                received_fields=received,
            )

    assert caplog.records == []
