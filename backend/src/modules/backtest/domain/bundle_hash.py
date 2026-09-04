"""`bundle_hash = sha256(canonical_json(bundle))` — `ADR-021`/D3, opaque to `run_registry`.

`run_registry` does not define the shape of "the bundle" (universe, `ThresholdSpec`,
`fee_schedule`, `cvd_anchor`, `price_source` per use, ...) — that is strategy-engine work, out
of `T-08.4`'s scope by the task's own `refs`. What this module fixes is the CONTRACT of
whoever produces the hash: reuse `sentimento.domain.canonical_json`, the one serializer
`SPEC-001` §3.8 already declares, rather than writing a second one that could disagree with
it. The precedent on the TypeScript side is `frontend/src/app/threshold-spec-bundle.ts:369`
(`bundleHash`): hash the canonical string of a STABLE field order (`encodeBundle`'s fixed
`PARAM_ORDER`), never an ad hoc `JSON.stringify` sensitive to how the caller built the object.

Importing FROM `sentimento` here is the permitted direction: `backend/pyproject.toml`'s
"Fronteira de contexto" contracts block `sentimento -> {charts, convergencia, backtest}`,
never the inverse.

`canonical_json` itself does NOT sort keys (`sort_keys=False`, by its own docstring:
"insertion order IS the field order") — that is correct for its OTHER call sites in
`sentimento` (e.g. `ingest_record.py`'s row projection), where insertion order IS a declared
contract column order and must be preserved verbatim, not sorted away. `bundle_hash` cannot
rely on that same discipline: `run_registry` deliberately leaves the bundle's shape
undecided (see module docstring above), so there is no fixed `PARAM_ORDER` to build the dict
in — the caller's insertion order is genuinely arbitrary. `_canonicalize` below is this
module's own `PARAM_ORDER` equivalent: it recursively rebuilds every dict with keys sorted by
string value BEFORE handing the structure to `canonical_json`, so two field orderings of the
same logical bundle produce byte-identical input and therefore the same hash. This was a
real defect (`ADR-021`/G3, found by QA in `test_bundle_hash_determinism_qa.py`) — a previous
version of this module forwarded straight to `canonical_json(bundle)` and a comment on
`test_field_order_changes_the_hash` wrongly reclassified the resulting order-sensitivity as
"not a defect". See `docs/adr/ADR-021-run-registry-reprodutibilidade-de-backtest.md`,
"Emenda" at the end, for the record of that correction.
"""

from __future__ import annotations

import hashlib

from src.modules.sentimento.domain.canonical_json import canonical_json


def bundle_hash(bundle: dict[str, object]) -> str:
    """Hash `bundle` with the one canonical serializer, over a key-order-independent structure.

    `ADR-021` falsifier G3 is exactly the failure mode this function exists to avoid: two
    logically identical bundles producing two different hashes because two different code
    paths built the same fields in a different order (e.g. a web-layer bundle vs one
    reconstructed from `run_registry` storage). `_canonicalize` removes dict-key-order as a
    source of variance before the bytes ever reach `canonical_json`; list/tuple element order
    is left untouched because it is not "field order" — it is data (e.g. `universe`), and
    reordering a list can be a logically different bundle.
    """
    return hashlib.sha256(canonical_json(_canonicalize_dict(bundle)).encode("ascii")).hexdigest()


def _canonicalize_dict(payload: dict[str, object]) -> dict[str, object]:
    """Recursively rebuild `payload` with keys sorted, so field ORDER cannot vary the digest.

    This module's equivalent of `threshold-spec-bundle.ts`'s fixed `PARAM_ORDER`, generalised
    to an undecided bundle shape: sorting is a stable, schema-free stand-in for "the one true
    field order" that `PARAM_ORDER` gets to declare literally once the bundle's shape exists.
    """
    return {key: _canonicalize_value(payload[key]) for key in sorted(payload)}


def _canonicalize_value(value: object) -> object:
    """Descend into dicts (sorted) and lists/tuples (order kept — it is data, not field order)."""
    if isinstance(value, dict):
        return _canonicalize_dict(value)
    if isinstance(value, (list, tuple)):
        return [_canonicalize_value(item) for item in value]
    return value
