"""`ADR-024` — S4 reading honesty: `D1`-`D5`'s falsifiers, pinned as CI assertions.

`ADR-024` decided (pre-implementation) that `D1`-`D5` are already satisfied by the existing
design (`ADR-020`, `ADR-022`) plus the explicit reuse of `sentimento.domain.as_of_accessor` — no
production line changes for `T-08.13`. Its own "Consequência" section names the builder's job
precisely: "um teste de regressão que fixa os falsificadores acima (grep/`inspect.signature` como
asserção de CI), não código de produção novo." This file is that regression suite, one section
per decision, each gate test paired with a positive-fire proof that the scanner it is built on
is not blind (this repo's own doctrine: verde não prova nada até uma mutação reprovar).

Falsifiers pinned here, one per `ADR-024` decision:
- `D1` — no pooled/aggregate type carries an `age`/`age_ms`/`idade` field.
- `D2` — no `staleness`/`atraso` literal lives inside `backend/src/modules/charts/`.
- `D3` — no `baseAsset`/`re.match`/`re.fullmatch` denom heuristic lives inside `charts/`, and the
  scan/histogram entry points key on exactly one `FieldIdentity` (never a collection), which is
  what makes cross-symbol comparison structurally impossible for a differing `denom`.
- `D4` — the read port never accepts a `spec`/`ThresholdSpec` parameter, and no `S4` use_case
  calls another use_case by name (no self-conditioned retry).
- `D5` — no `S4` use_case accepts a `live` flag or an optional `end_ms`, and none of
  `charts/use_cases/` contains a polling construct (`while`, `asyncio`, `time.sleep`).
"""

from __future__ import annotations

import ast
import dataclasses
import inspect
import re
from pathlib import Path
from typing import Protocol

from src.modules.charts.domain.field_identity import FieldIdentity
from src.modules.charts.domain.firing_rate import Window
from src.modules.charts.domain.histogram import (
    Bin,
    HistogramResult,
    Overflow,
    PointMass,
    compute_histogram,
)
from src.modules.charts.domain.observation import Fired, Insufficient, NotFired, Observation
from src.modules.charts.domain.scan import ScanResult, evaluate_scan
from src.modules.charts.domain.threshold_spec import ThresholdSpec
from src.modules.charts.use_cases import compute_distribution as compute_distribution_module
from src.modules.charts.use_cases import compute_firing_rate as compute_firing_rate_module
from src.modules.charts.use_cases import run_scan as run_scan_module
from src.modules.charts.use_cases.compute_distribution import (
    ObservationSource,
    compute_distribution,
)
from src.modules.charts.use_cases.compute_firing_rate import compute_firing_rate
from src.modules.charts.use_cases.run_scan import run_scan

CHARTS_SRC_ROOT = Path(__file__).resolve().parents[2] / "src" / "modules" / "charts"
USE_CASE_FUNCTION_NAMES = ("compute_distribution", "run_scan", "compute_firing_rate")
_USE_CASE_MODULES = {
    "compute_distribution": compute_distribution_module,
    "run_scan": run_scan_module,
    "compute_firing_rate": compute_firing_rate_module,
}


def test_the_charts_source_tree_the_scanners_below_walk_is_not_empty() -> None:
    """`ADR-012`'s own `rc=0` doctrine: an empty universe cannot tell "clean" from "never ran"."""
    modules = list(CHARTS_SRC_ROOT.rglob("*.py"))
    assert CHARTS_SRC_ROOT.is_dir(), CHARTS_SRC_ROOT
    assert len(modules) >= 13, f"scanned {len(modules)} modules under charts/ — the root is wrong"


# ── `D1` — age is never a field of a pooled/aggregate type ──────────────────────────────────

POOLED_OR_AGGREGATE_TYPES = (
    Observation,
    Fired,
    NotFired,
    Insufficient,
    PointMass,
    Bin,
    Overflow,
    HistogramResult,
    ScanResult,
)
FORBIDDEN_AGE_FIELD_NAMES = frozenset({"age", "age_ms", "idade"})


def test_d1_no_pooled_or_aggregate_type_carries_an_age_field() -> None:
    """`ADR-024/D1`: absence is by OMISSION of the field, never a `None`-by-default value.

    Every type a population or a window-aggregate resolves to — `Observation` through
    `ScanResult` — is checked here; `CurrentReading`/`EdgeAge` (`D1`'s named future type) is
    deliberately NOT on this list, because it is the one place idade is allowed to exist and it
    does not exist in this codebase today.
    """
    offenders = {
        cls.__name__: hit
        for cls in POOLED_OR_AGGREGATE_TYPES
        for hit in ({f.name for f in dataclasses.fields(cls)} & FORBIDDEN_AGE_FIELD_NAMES,)
        if hit
    }
    assert not offenders, f"pooled/aggregate type(s) carry a forbidden age field: {offenders}"


def test_d1_falsifier_catches_a_planted_age_field() -> None:
    """Positive-fire proof: a type that DOES carry `age_ms` must trip the check above."""

    @dataclasses.dataclass(frozen=True)
    class _PlantedAggregate:
        count: int
        age_ms: int  # the exact shape ADR-024/D1 forbids

    hit = {f.name for f in dataclasses.fields(_PlantedAggregate)} & FORBIDDEN_AGE_FIELD_NAMES
    assert hit == {"age_ms"}, "the age-field vocabulary itself missed a planted age_ms field"


# ── `D2` — the delay invariant is reused from `sentimento`, never duplicated in `charts` ────

_STALENESS_PATTERN = re.compile(r"staleness|atraso", re.IGNORECASE)


def _pattern_hits(pattern: re.Pattern[str], text: str) -> list[str]:
    return [match.group(0) for match in pattern.finditer(text)]


def test_d2_no_staleness_literal_inside_charts() -> None:
    """`ADR-024/D2`: `charts` imports `sentimento.domain.as_of_accessor`, never a local constant.

    `reject_delay_threshold_above_staleness` (`as_of_accessor.py:343-369`) already owns
    `limiar_atraso <= asof_max_staleness_ms`, by series — this pins that `charts` never grows a
    second, competing owner of that number.
    """
    offenders = {
        str(path.relative_to(CHARTS_SRC_ROOT)): hits
        for path in sorted(CHARTS_SRC_ROOT.rglob("*.py"))
        for hits in (_pattern_hits(_STALENESS_PATTERN, path.read_text(encoding="utf-8")),)
        if hits
    }
    assert not offenders, f"literal staleness/atraso reference(s) inside charts/: {offenders}"


def test_d2_falsifier_catches_a_planted_staleness_constant() -> None:
    """Positive-fire proof: a planted local staleness constant must trip the pattern above."""
    planted_source = "ASOF_MAX_STALENESS_MS: Final[int] = 5000\n"
    assert _pattern_hits(_STALENESS_PATTERN, planted_source), (
        "the staleness scanner missed a planted literal"
    )


# ── `D3` — `denom` is always verbatim; no `baseAsset` heuristic inside `charts` ─────────────

_DENOM_HEURISTIC_PATTERN = re.compile(r"baseAsset|re\.match|re\.fullmatch")


def test_d3_no_denom_heuristic_inside_charts() -> None:
    """`ADR-024/D3`: the sentinel for an unresolved multiplier is published by `sentimento`.

    `charts` only ever reads `FieldIdentity.denom` verbatim, never infers a third value from
    `baseAsset` by regex (`PRD-001`'s own measured defect: the regex misses `1MBABYDOGEUSDT`).
    """
    offenders = {
        str(path.relative_to(CHARTS_SRC_ROOT)): hits
        for path in sorted(CHARTS_SRC_ROOT.rglob("*.py"))
        for hits in (_pattern_hits(_DENOM_HEURISTIC_PATTERN, path.read_text(encoding="utf-8")),)
        if hits
    }
    assert not offenders, f"denom-inference heuristic found inside charts/: {offenders}"


def test_d3_falsifier_catches_a_planted_denom_heuristic() -> None:
    """Positive-fire proof: a planted `baseAsset` regex heuristic must trip the pattern above."""
    planted_source = "if re.match(r'^\\d', base_asset):\n    denom = 'contracts_x1000'\n"
    assert _pattern_hits(_DENOM_HEURISTIC_PATTERN, planted_source), (
        "the denom-heuristic scanner missed a planted baseAsset regex"
    )


def test_d3_scan_and_histogram_key_on_exactly_one_field_identity() -> None:
    """`evaluate_scan`/`compute_histogram` take ONE `FieldIdentity`, never a collection.

    This is the structural reason `D8.18`'s cross-symbol refusal falls out of `ADR-020/D1`
    for free: two symbols under a different `denom` are two different `FieldIdentity` keys, and
    neither entry point has a parameter shape that could pool observations across two of them
    into a single call.
    """
    for func in (compute_histogram, evaluate_scan):
        parameters = inspect.signature(func).parameters
        assert "field" in parameters, f"{func.__name__} lost its field= parameter"
        assert str(parameters["field"].annotation) == "FieldIdentity", (
            f"{func.__name__}.field is annotated {parameters['field'].annotation!r}, not a "
            f"single FieldIdentity"
        )


# ── `D4` — zero selection is information ─────────────────────────────────────────────────────

_FORBIDDEN_SPEC_ANNOTATION_MARKERS = (
    "ThresholdSpec",
    "AbsoluteSpec",
    "PercentileSpec",
    "RobustZSpec",
)


def test_d4_the_read_port_never_accepts_a_threshold_or_spec_parameter() -> None:
    """`ADR-024/D4` mechanism 1: the population is fixed BEFORE any limiar is applied to it.

    `inspect.signature`, not a promise in prose — the same falsifier shape
    `ADR-022/D4`'s own `test_no_decision_function_accepts_z_dispersion_as_input` already uses.
    """
    parameters = inspect.signature(ObservationSource.observed_values).parameters
    for name, parameter in parameters.items():
        assert name not in {"spec", "threshold", "threshold_spec"}, (
            f"observed_values gained a parameter named {name!r}"
        )
        annotation = str(parameter.annotation)
        assert not any(marker in annotation for marker in _FORBIDDEN_SPEC_ANNOTATION_MARKERS), (
            f"observed_values parameter {name!r} is annotated {annotation!r}: the read port must "
            f"never see the threshold that will be applied to what it reads"
        )


def test_d4_falsifier_catches_a_planted_spec_parameter() -> None:
    """Positive-fire proof: a read port that DOES take a spec must trip the check above."""

    class _PlantedSource(Protocol):
        def observed_values(self, field: FieldIdentity, spec: ThresholdSpec) -> None: ...

    parameters = inspect.signature(_PlantedSource.observed_values).parameters
    assert "spec" in parameters
    assert any(
        marker in str(parameters["spec"].annotation)
        for marker in _FORBIDDEN_SPEC_ANNOTATION_MARKERS
    )


def _called_names(tree: ast.AST) -> set[str]:
    """Every name a `Call` node in `tree` invokes, direct or attribute form."""
    names: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        target = node.func
        if isinstance(target, ast.Name):
            names.add(target.id)
        elif isinstance(target, ast.Attribute):
            names.add(target.attr)
    return names


def test_d4_no_use_case_calls_another_use_case_by_name() -> None:
    """`ADR-024/D4` mechanism 2: no `S4` use_case chains on its own (or a sibling's) result.

    `ScanResult{n_fired: 0}`, `EmptyScanInputError`, `MinObsNotMetError` are terminal answers —
    never a condition that triggers a second call with a relaxed parameter.
    """
    for label, module in _USE_CASE_MODULES.items():
        tree = ast.parse(inspect.getsource(module))
        overlap = _called_names(tree) & (set(USE_CASE_FUNCTION_NAMES) - {label})
        assert not overlap, f"{label}.py calls {overlap}: use_cases must not chain on each other"


def test_d4_falsifier_catches_a_planted_use_case_chain() -> None:
    """Positive-fire proof: a planted self-retry chain must trip the scanner above."""
    planted_source = "def run_scan():\n    return compute_distribution()\n"
    tree = ast.parse(planted_source)
    assert "compute_distribution" in _called_names(tree), (
        "the use-case-chain scanner missed a planted call"
    )


# ── `D5` — `S4` is retrospective by signature, never by screen text ─────────────────────────


def test_d5_no_use_case_accepts_a_live_flag_or_an_optional_end_ms() -> None:
    """`ADR-024/D5`: every `S4` use_case takes a closed `Window`/explicit `knowledge_time_ms`.

    Never a `live: bool`, never an `end_ms` that can default to `None` ("agora").
    """
    for func in (compute_distribution, run_scan, compute_firing_rate):
        parameters = inspect.signature(func).parameters
        assert "live" not in parameters, f"{func.__name__} accepts a 'live' parameter"
        if "end_ms" in parameters:
            annotation = str(parameters["end_ms"].annotation)
            assert "None" not in annotation, (
                f"{func.__name__}.end_ms is optional ({annotation!r}): 'None' meaning 'agora' "
                f"is exactly the D5 defect"
            )


def test_d5_window_end_ms_is_a_required_int_never_optional() -> None:
    """`Window.end_ms` is a plain `int` field — no `| None` branch a caller could default to."""
    end_ms_field = next(field for field in dataclasses.fields(Window) if field.name == "end_ms")
    assert end_ms_field.type == "int", end_ms_field.type


_POLLING_LIBRARY_MARKERS = ("asyncio", "time.sleep", "websocket")


def test_d5_no_polling_construct_inside_use_cases() -> None:
    """`ADR-024/D5`: no `while`/`asyncio`/sleep/websocket lives inside `charts/use_cases/`.

    A `use_case` reamostrando com `end_ms` = agora a cada chamada é a mesma classe de defeito
    que um `while True` explícito — ambos produzem uma varredura "ao vivo" `D8.17` measures as
    `[NÃO SUSTENTADO hoje]` (2,85-14,25 min/varredura).
    """
    use_cases_root = CHARTS_SRC_ROOT / "use_cases"
    offenders: dict[str, dict[str, object]] = {}
    for path in sorted(use_cases_root.glob("*.py")):
        text = path.read_text(encoding="utf-8")
        tree = ast.parse(text)
        has_while_loop = any(isinstance(node, ast.While) for node in ast.walk(tree))
        marker_hits = [marker for marker in _POLLING_LIBRARY_MARKERS if marker in text]
        if has_while_loop or marker_hits:
            offenders[path.name] = {"while": has_while_loop, "markers": marker_hits}
    assert not offenders, f"polling construct found inside charts/use_cases/: {offenders}"


def test_d5_falsifier_catches_a_planted_while_loop() -> None:
    """Positive-fire proof: a planted `while True` must trip the `ast.While` scan above."""
    planted_source = "def f():\n    while True:\n        pass\n"
    tree = ast.parse(planted_source)
    assert any(isinstance(node, ast.While) for node in ast.walk(tree)), (
        "the polling scanner missed a planted while loop"
    )
