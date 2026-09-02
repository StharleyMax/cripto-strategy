"""`D7.2` (`SPEC-001` §5.6, `CA-F3-14`): symbol absent from CURRENT `exchangeInfo` never rejects.

`MATICUSDT` is not a synthetic example: it is the real, measured absence
`test_instrument_universe_snapshot.py`'s
`test_d2_3_premium_index_names_three_symbols_exchange_info_does_not` already pins on the SAME
fixture (`data/binance/rest/ei.json`, `[MEDIDO 2026-09-01]`) — this suite reuses that exact
`exchangeInfo` capture instead of inventing a second one, per the handoff's instruction to
reuse `T-02.1`'s vocabulary of "`exchangeInfo` corrente".
"""

from __future__ import annotations

import ast
import inspect
import json
from dataclasses import replace
from pathlib import Path

from src.modules.sentimento.domain.dump_survivorship import (
    ACCEPTED,
    ACCEPTED_WITH_WARNING,
    REASON_ABSENT_FROM_CURRENT_EXCHANGE_INFO,
    SURVIVORSHIP_GAP_CLASS,
    build_survivorship_gap,
    classify_symbol_survivorship,
)
from src.modules.sentimento.domain.ingest_record import KNOWN_VERDICTS, VERDICTS_SPELLED_IN_THE_SPEC
from src.modules.sentimento.domain.instrument_universe_snapshot import exchange_info_symbols
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from tests.helpers.data_fixtures import require_fixture
from tests.helpers.ingest_record_driver import build_run

_EI_0824 = "binance/rest/ei.json"
_EI_0824_MD5 = "dbdba08fa871dab3341a15b4c3e3abc4"


def _current_exchange_info_symbols() -> frozenset[str]:
    """Load the real, cataloged `exchangeInfo` capture `T-02.1` already fixtured."""
    path = require_fixture(_EI_0824, expected_md5=_EI_0824_MD5)
    payload = json.loads(path.read_text(encoding="utf-8"))
    return exchange_info_symbols(payload)


# ── D7.2 — the falsifier: MATICUSDT, real and absent, GRAVOU com aviso ─────────────────────


def test_d7_2_maticusdt_absent_from_the_real_exchange_info_capture() -> None:
    """Ground the test in a MEASURED fact before classifying it: `MATICUSDT` really is absent.

    Same fixture, same fact `test_d2_3_premium_index_names_three_symbols_exchange_info_does_not`
    already measures (`ei.json`, 872 symbols) — this is not invented for this task.
    """
    current = _current_exchange_info_symbols()
    assert len(current) == 872
    assert "MATICUSDT" not in current


def test_d7_2_maticusdt_is_accepted_with_warning_never_rejected() -> None:
    """`SPEC-001` §5.6, literal: absent from `exchangeInfo` CORRENTE -> `ACCEPTED_WITH_WARNING`."""
    current = _current_exchange_info_symbols()
    decision = classify_symbol_survivorship("MATICUSDT", current)
    assert decision.verdict == ACCEPTED_WITH_WARNING
    assert decision.reason == REASON_ABSENT_FROM_CURRENT_EXCHANGE_INFO


def test_d7_2_a_symbol_the_current_universe_still_lists_is_accepted_without_warning() -> None:
    """`BTCUSDT` is in `ei.json` — the ordinary case carries no warning and no reason."""
    current = _current_exchange_info_symbols()
    assert "BTCUSDT" in current
    decision = classify_symbol_survivorship("BTCUSDT", current)
    assert decision.verdict == ACCEPTED
    assert decision.reason is None


def test_d7_2_maticusdt_dump_is_persisted_with_warning_through_the_real_store(
    tmp_path: Path,
) -> None:
    """`GRAVOU, com aviso`: round-tripped through the real store, never `REJECTED`.

    The same `SqliteIngestRecordStore` `T-02.3`/`T-04.2` already prove durable —
    `n_written > 0`, `verdict='ACCEPTED_WITH_WARNING'`, and the matching `md.ingest_gap` row.
    """
    current = _current_exchange_info_symbols()
    decision = classify_symbol_survivorship("MATICUSDT", current)
    assert decision.verdict == ACCEPTED_WITH_WARNING

    run = replace(
        build_run(0),
        run_id="run-maticusdt-dump",
        endpoint="s3:data.binance.vision/data/futures/um/daily/aggTrades/MATICUSDT",
        verdict=decision.verdict,
        n_expected=288,
        n_returned=288,
        n_written=288,
    )
    gap = build_survivorship_gap(
        "MATICUSDT",
        source="binance-futures-dump",
        series_key_id="maticusdt-aggtrades",
        window_from_ts="2026-08-01T00:00:00Z",
        window_to_ts="2026-08-01T23:59:59Z",
        detected_at="2026-09-02T00:00:00Z",
    )

    store = SqliteIngestRecordStore(tmp_path / "ingest.sqlite3")
    store.initialise()
    store.record_run(run)
    store.record_gap(gap)

    persisted_runs = store.runs()
    persisted_gaps = store.gaps()
    assert len(persisted_runs) == 1
    assert persisted_runs[0].verdict == "ACCEPTED_WITH_WARNING"
    assert persisted_runs[0].n_written == 288  # never zero linhas gravadas
    assert len(persisted_gaps) == 1
    assert persisted_gaps[0].symbol == "MATICUSDT"
    assert persisted_gaps[0].gap_class == SURVIVORSHIP_GAP_CLASS
    assert persisted_gaps[0].n_missing == 0  # not a data hole — a universe-membership warning


# ── the boundary that does NOT generalize (SPEC-001 §5.6, last paragraph) ──────────────────


def test_the_verdict_vocabulary_matches_ingest_record_s_and_is_not_a_second_one() -> None:
    """Spells `ACCEPTED`/`ACCEPTED_WITH_WARNING` identically to `ingest_record.py`.

    Guards against the exact drift `test_ingest_health_contract_guards.py` already hunts one
    constant over: a second copy of the same two words that silently stops matching the first.
    """
    assert ACCEPTED in KNOWN_VERDICTS
    assert ACCEPTED_WITH_WARNING in KNOWN_VERDICTS
    assert ACCEPTED_WITH_WARNING in VERDICTS_SPELLED_IN_THE_SPEC


def test_structural_falsifier_classify_symbol_survivorship_cannot_spell_rejected() -> None:
    """Prove the function body cannot spell the excluded third `verdict` as a string constant.

    `SurvivorshipVerdict` has two members; this is the same defence `ClosedWindow` uses against
    `D7.3`, applied here to the axis `SPEC-001` §5.6 says does NOT generalize from `-1130`.
    Docstring excluded on purpose (it quotes SPEC prose that names the excluded word); only
    `ast.Constant` string nodes in the EXECUTABLE body are checked.
    """
    source = inspect.getsource(classify_symbol_survivorship)
    module_tree = ast.parse(source)
    (function_def,) = module_tree.body
    assert isinstance(function_def, ast.FunctionDef)
    body_without_docstring = function_def.body[1:]
    executable = ast.Module(body=body_without_docstring, type_ignores=[])
    string_constants = {
        node.value
        for node in ast.walk(executable)
        if isinstance(node, ast.Constant) and isinstance(node.value, str)
    }
    assert "REJECTED" not in string_constants
    # And the falsifier actually bites: a mutant that DOES generalize fail-closed would spell
    # the word somewhere reachable. Prove the scanner sees it when it is really there.
    mutant_source = source.replace(
        "return SurvivorshipDecision(verdict=ACCEPTED, reason=None)",
        'return SurvivorshipDecision(verdict="REJECTED", reason=None)',
    )
    mutant_tree = ast.parse(mutant_source)
    (mutant_def,) = mutant_tree.body
    assert isinstance(mutant_def, ast.FunctionDef)
    mutant_executable = ast.Module(body=mutant_def.body[1:], type_ignores=[])
    mutant_constants = {
        node.value
        for node in ast.walk(mutant_executable)
        if isinstance(node, ast.Constant) and isinstance(node.value, str)
    }
    assert "REJECTED" in mutant_constants
