"""`bundle_hash` determinism and sensitivity — `ADR-021`/D3, falsifier G3."""

from __future__ import annotations

from src.modules.backtest.domain.bundle_hash import bundle_hash


def test_the_same_bundle_built_twice_hashes_identically() -> None:
    """Two independently-constructed but field-identical bundles must hash the same (G3, cala)."""
    first = {"universe": ["BTCUSDT"], "window_days": 30, "fee_bps": 4}
    second = {"universe": ["BTCUSDT"], "window_days": 30, "fee_bps": 4}
    assert bundle_hash(first) == bundle_hash(second)


def test_a_changed_field_changes_the_hash() -> None:
    """A single differing value must not collide — proves the function is not vacuous."""
    base = {"universe": ["BTCUSDT"], "window_days": 30, "fee_bps": 4}
    changed = {"universe": ["BTCUSDT"], "window_days": 31, "fee_bps": 4}
    assert bundle_hash(base) != bundle_hash(changed)


def test_field_order_does_not_change_the_hash() -> None:
    """`ADR-021` G3, verbatim: same logical bundle, different insertion order, same hash.

    An earlier version of this test asserted the OPPOSITE and dismissed it in a comment as
    "not a defect" — but two orderings of the same fields hashing differently is exactly the
    scenario `ADR-021`'s own G3 row names as falsifying `D3` ("o serializador canônico não
    está sendo reusado, ou não é determinístico"). `bundle_hash` now sorts dict keys
    recursively (`_canonicalize_dict`, this module's schema-free stand-in for
    `threshold-spec-bundle.ts`'s fixed `PARAM_ORDER`) before delegating to `canonical_json`,
    so the caller's insertion order can no longer affect the digest. See the "Emenda" at the
    end of `docs/adr/ADR-021-run-registry-reprodutibilidade-de-backtest.md` for the record of
    this correction, and `test_bundle_hash_determinism_qa.py` for the QA-authored proof that
    used to fail against the old implementation.
    """
    ordered_one_way: dict[str, object] = {"a": 1, "b": 2}
    ordered_the_other_way: dict[str, object] = {"b": 2, "a": 1}
    assert bundle_hash(ordered_one_way) == bundle_hash(ordered_the_other_way)


def test_nested_dict_field_order_does_not_change_the_hash() -> None:
    """The sort in `_canonicalize_dict` is RECURSIVE, not top-level-only.

    A bundle built from a `ThresholdSpec`-shaped nested dict must be as order-independent at
    depth 2 as `test_field_order_does_not_change_the_hash` proves at depth 1 — otherwise the
    fix would only cover the shallow case QA happened to write.
    """
    nested_one_way: dict[str, object] = {
        "universe": ["BTCUSDT"],
        "spec": {"op": "gte", "threshold": 0.5},
    }
    nested_the_other_way: dict[str, object] = {
        "spec": {"threshold": 0.5, "op": "gte"},
        "universe": ["BTCUSDT"],
    }
    assert bundle_hash(nested_one_way) == bundle_hash(nested_the_other_way)


def test_list_element_order_still_changes_the_hash() -> None:
    """List order is DATA, not field order — `_canonicalize_dict` must not sort it away.

    This is the falsifier for an over-eager fix: a canonicalizer that also sorted list
    elements would silently equate `["BTCUSDT", "ETHUSDT"]` with `["ETHUSDT", "BTCUSDT"]`,
    which are not the same logical bundle (e.g. a `universe` list feeding a priority-ordered
    execution engine).
    """
    first_order: dict[str, object] = {"universe": ["BTCUSDT", "ETHUSDT"]}
    reversed_order: dict[str, object] = {"universe": ["ETHUSDT", "BTCUSDT"]}
    assert bundle_hash(first_order) != bundle_hash(reversed_order)


def test_dicts_nested_inside_a_list_are_still_order_independent() -> None:
    """`_canonicalize_value` must descend into dicts that sit INSIDE a list, not just top-level.

    `_canonicalize_dict`'s recursion for a bare nested dict is covered by
    `test_nested_dict_field_order_does_not_change_the_hash`, but a `ThresholdSpec`-shaped bundle
    plausibly carries a LIST of such dicts (e.g. multiple legs/conditions). If `_canonicalize_value`
    only unwrapped the outer list without canonicalizing each dict element, this would regress
    to G3 one level deeper than QA's original probe reached.
    """
    one_way: dict[str, object] = {
        "legs": [{"op": "gte", "threshold": 0.5}, {"op": "lte", "threshold": 1.0}],
    }
    other_way: dict[str, object] = {
        "legs": [{"threshold": 0.5, "op": "gte"}, {"threshold": 1.0, "op": "lte"}],
    }
    assert bundle_hash(one_way) == bundle_hash(other_way)


def test_none_valued_fields_do_not_break_order_independence() -> None:
    """A bundle field legitimately absent (`cvd_anchor: None`) must not upset canonicalisation.

    `json.dumps` serialises `None` as `null` without help, but this pins the combination with
    `_canonicalize_dict`'s key sort: a `None` value must survive reordering unchanged, and a
    bundle with the field explicitly `None` must still hash differently from one where the key
    is absent entirely (`None` is a value, not the same thing as "no such field").
    """
    built_one_way: dict[str, object] = {"cvd_anchor": None, "universe": ["BTCUSDT"]}
    built_the_other_way: dict[str, object] = {"universe": ["BTCUSDT"], "cvd_anchor": None}
    assert bundle_hash(built_one_way) == bundle_hash(built_the_other_way)

    field_absent: dict[str, object] = {"universe": ["BTCUSDT"]}
    assert bundle_hash(built_one_way) != bundle_hash(field_absent)


def test_the_hash_is_64_character_lowercase_hex() -> None:
    """`bundle_hash` produces exactly the shape `RunRegistryEntry` requires for `bundle_hash`."""
    digest = bundle_hash({"universe": ["ETHUSDT"]})
    assert len(digest) == 64
    assert digest == digest.lower()
    int(digest, 16)  # raises ValueError if it is not hex
