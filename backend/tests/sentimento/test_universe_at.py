"""`D7.7` (`SPEC-001` §3.7, `CA-F3-4`): `universe_at(ts, filtro)`, `s3_inferred` barred BY TYPE.

Two witnesses feed `universe_at`: the `exchangeInfo` snapshot (`T-02.1`) and the S3-derived
witness (`T-07.2`'s vocabulary). `T-02.1`'s daily snapshot series only started on `2026-08-25`
(`PRD-001` `CA-F0-1`, one manual capture; the cron is still `Q1`-blocked) — every `ts` this
suite asks about is BEFORE that date, so the snapshot witness is honestly `None` for all of
them, and `2026-09-01`'s real `exchangeInfo` capture (reused from `test_instrument_universe_
snapshot.py`/`test_dump_survivorship.py`) is used only to exercise the DECISIVE-PATH mechanism
(filtering, divergence marking) — not to claim it is the true universe on any date this suite
names, which would be exactly the retrospective mistake this module exists to prevent.
"""

from __future__ import annotations

import ast
import inspect
import json
from pathlib import Path
from typing import Any, get_args

from src.modules.sentimento.domain.instrument_universe_snapshot import (
    MARKET_COIN_M,
    MARKET_USDS_M,
    build_instrument_rows,
)
from src.modules.sentimento.domain.universe_at import (
    NO_FILTER,
    PREMIUM_INDEX_WITNESS,
    RETROSPECTIVE_LABEL,
    S3_INFERRED,
    SNAPSHOT,
    DecisiveUniverseSource,
    UniverseFilter,
    UniverseSource,
    decide_universe_membership,
    universe_at,
)
from tests.helpers.data_fixtures import require_fixture

_EI_0824 = "binance/rest/ei.json"
_EI_0824_MD5 = "dbdba08fa871dab3341a15b4c3e3abc4"
_FI_0824 = "binance/rest/fi.json"
_FI_0824_MD5 = "708ad49f70069d725477b1b7a5c02510"
_PI_0824 = "binance/rest/pi.json"
_PI_0824_MD5 = "f8ab44575844421c2603eb71466dcb4d"


def _load(relative: str, expected_md5: str) -> Any:  # noqa: ANN401 - raw JSON, shaped by callers
    path: Path = require_fixture(relative, expected_md5=expected_md5)
    return json.loads(path.read_text(encoding="utf-8"))


def _rows_0824() -> tuple[Any, ...]:
    """Build the joined rows of the real `2026-08-24` capture, the fixture `T-02.1` pins."""
    return build_instrument_rows(
        _load(_EI_0824, _EI_0824_MD5), _load(_FI_0824, _FI_0824_MD5), _load(_PI_0824, _PI_0824_MD5)
    )


# ── D7.7 — the falsifier, literal: `universe_at('2025-08-01')` includes `ICXUSDT`, excludes
# `DOSUSDT` (onboard `2026-08-11`, `[MEDIDO]`, `CA-F3-4`) ──────────────────────────────────
#
# `2025-08-01` predates `T-02.1`'s FIRST snapshot (`2026-08-25`) by more than a year — there is
# no `exchangeInfo` capture from that date anywhere in this repository, honestly (`CA-F0-1`).
# The only available evidence for that `ts` is S3-derived (`s3_inferred`): the constructed
# witness below stands for "the S3 dump has files for `ICXUSDT` covering `2025-08-01`, and has
# none for `DOSUSDT`" — true by construction because `DOSUSDT` would not onboard for another
# year. Per this module's central rule, that witness can NEVER be the decisive answer; it can
# only be reported, which is exactly what `RETROSPECTIVE_LABEL` says on the result below.


def _s3_witness_symbols_2025_08_01() -> frozenset[str]:
    """Build the S3 witness for `2025-08-01`: has `ICXUSDT`, lacks `DOSUSDT`."""
    return frozenset({"BTCUSDT", "ETHUSDT", "ICXUSDT"})


def test_d7_7_includes_icxusdt_and_excludes_dosusdt_with_no_snapshot_available() -> None:
    """`D7.7`, literal: no snapshot existed on `2025-08-01`, so only the S3 witness answers."""
    result = universe_at(
        "2025-08-01", s3_witness_symbols=_s3_witness_symbols_2025_08_01(), snapshot_rows=None
    )
    assert "ICXUSDT" in result.symbols
    assert "DOSUSDT" not in result.symbols
    # Never decided: no admissible witness existed for this `ts`.
    assert result.decided_symbols == frozenset()
    assert result.label == RETROSPECTIVE_LABEL


def test_retrospective_result_carries_the_s3_witness_as_the_whole_union() -> None:
    """When `snapshot_rows` is `None`, `symbols` is carried ENTIRELY by the `s3_inferred` side."""
    witness = _s3_witness_symbols_2025_08_01()
    result = universe_at("2025-08-01", s3_witness_symbols=witness, snapshot_rows=None)
    assert result.symbols == witness
    assert result.s3_witness_symbols == witness
    assert result.divergence.only_in_second == tuple(sorted(witness))
    assert not result.divergence.only_in_first


# ── the decisive path: a snapshot witness IS available ─────────────────────────────────────


def test_a_snapshot_witness_makes_the_result_decided_and_unlabeled() -> None:
    """With `snapshot_rows` supplied, `label` is `None` — the decision is confirmed, not guessed."""
    rows = _rows_0824()
    result = universe_at("2026-08-24", snapshot_rows=rows, s3_witness_symbols=frozenset())
    assert result.label is None
    assert "BTCUSDT" in result.decided_symbols
    assert result.decided_symbols == result.symbols


def test_maticusdt_absent_from_snapshot_but_present_in_s3_witness_is_a_marked_divergence() -> None:
    """`MATICUSDT` is really absent from `ei.json` (`test_dump_survivorship.py`, same fixture).

    The union still includes it (the S3 witness attests it), but it is NOT decided — this is
    `SPEC-001` §3.7's "divergencia marcada", not a silent merge.
    """
    rows = _rows_0824()
    s3_witness = frozenset({"MATICUSDT"})
    result = universe_at("2026-08-24", snapshot_rows=rows, s3_witness_symbols=s3_witness)
    assert "MATICUSDT" not in result.decided_symbols
    assert "MATICUSDT" in result.symbols
    assert result.divergence.only_in_second == ("MATICUSDT",)
    assert result.label is None  # the snapshot IS available; the divergence is data, not a guess


def test_filtro_market_restricts_the_decided_symbols_to_one_market() -> None:
    """`SPEC-001` §6/Q5: "universo e filtro na LEITURA" — `market` is one of the persisted axes."""
    rows = _rows_0824()
    coin_m_only = universe_at(
        "2026-08-24", UniverseFilter(market=MARKET_COIN_M), snapshot_rows=rows
    )
    usds_m_only = universe_at(
        "2026-08-24", UniverseFilter(market=MARKET_USDS_M), snapshot_rows=rows
    )
    assert coin_m_only.decided_symbols
    assert usds_m_only.decided_symbols
    assert coin_m_only.decided_symbols.isdisjoint(usds_m_only.decided_symbols)
    assert coin_m_only.decided_symbols | usds_m_only.decided_symbols == frozenset(
        row.symbol for row in rows
    )


def test_no_filter_is_the_default_and_is_equivalent_to_explicit_no_filter() -> None:
    """Omitting `filtro` and passing `NO_FILTER` explicitly must decide the same symbols."""
    rows = _rows_0824()
    implicit = universe_at("2026-08-24", snapshot_rows=rows)
    explicit = universe_at("2026-08-24", NO_FILTER, snapshot_rows=rows)
    assert implicit.decided_symbols == explicit.decided_symbols


# ── the structural falsifier: `s3_inferred` cannot even TYPE as a decisive source ──────────
#
# `mypy --strict` proves this at the call site, MEASURED directly (not paraphrased):
#
#   $ cd backend && .venv/bin/python -m mypy --strict <scratch file assigning
#     `bad: DecisiveUniverseSource = "s3_inferred"`>
#   error: Incompatible types in assignment (expression has type "Literal['s3_inferred']",
#   variable has type "Literal['snapshot', 'premium_index_witness']")  [assignment]
#   Found 1 error in 1 file
#
# `[MEDIDO 2026-09-02]`. That is exercised by hand once (mypy is not invoked from inside this
# suite — `bash backend/scripts/lint.sh` is the portao that runs it on every push, the same
# division `test_provenance_columns.py` already uses for its own `comparison-overlap` claim).
# What THIS test proves, on every run, is the shape the mypy error depends on: the two Literal
# types' member sets, and that `decide_universe_membership`'s own signature is the one that
# carries the narrow type.


def test_decisive_universe_source_excludes_s3_inferred_by_member_set() -> None:
    """`DecisiveUniverseSource` has two members; `UniverseSource` has the SPEC's full three."""
    assert get_args(DecisiveUniverseSource) == ("snapshot", "premium_index_witness")
    assert get_args(UniverseSource) == ("snapshot", "s3_inferred", "premium_index_witness")
    assert S3_INFERRED not in get_args(DecisiveUniverseSource)
    assert SNAPSHOT in get_args(DecisiveUniverseSource)
    assert PREMIUM_INDEX_WITNESS in get_args(DecisiveUniverseSource)


def test_decide_universe_membership_signature_is_keyed_by_the_narrow_type() -> None:
    """The decision function's own annotation names `DecisiveUniverseSource` — not `UniverseSource`.

    This is the "assinatura da funcao de decisao" the DoD names: it is the parameter's
    declared type mypy checks every call site against, not a runtime `if`.
    """
    signature = inspect.signature(decide_universe_membership)
    (parameter,) = signature.parameters.values()
    assert parameter.name == "witnesses"
    assert "DecisiveUniverseSource" in str(parameter.annotation)
    assert "UniverseSource" not in str(parameter.annotation).replace("DecisiveUniverseSource", "")


def test_structural_falsifier_decide_universe_membership_cannot_spell_s3_inferred() -> None:
    """Prove the function body cannot spell the excluded source as a string constant.

    Same defence `test_dump_survivorship.py` applies to `classify_symbol_survivorship`, applied
    here to the axis this module exists to close: an `s3_inferred` key can never reach
    `decide_universe_membership`'s body as a literal, because nothing here ever needs to name
    it (the function only ever iterates `witnesses.values()`).
    """
    source = inspect.getsource(decide_universe_membership)
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
    assert "s3_inferred" not in string_constants
    # And the falsifier actually bites: a mutant that DOES reach for the excluded string would
    # be caught by this scan (it just could never also satisfy `mypy --strict`, which is the
    # whole point — the mutant below is unreachable in real code, only in this scanner's input).
    mutant_source = source.replace(
        "decided: frozenset[str] = frozenset()",
        'decided: frozenset[str] = frozenset({"s3_inferred"})',
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
    assert "s3_inferred" in mutant_constants
