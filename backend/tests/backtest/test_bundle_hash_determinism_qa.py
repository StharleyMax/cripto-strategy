"""QA probe for `ADR-021` falsifier G3 — written by QA, not by the builder.

`ADR-021`'s own table: G3 = "dois valores de `bundle_hash` diferentes para o MESMO bundle
(mesmos bytes lógicos, ordem de campo diferente)" derrubaria D3 ("o serializador canônico não
está sendo reusado, ou não é determinístico"). This is the literal criterion the ADR wrote for
itself — not a QA invention.

`backend/src/modules/backtest/domain/bundle_hash.py` ships `test_field_order_changes_the_hash`
which *demonstrates* exactly the G3 scenario (same key/value pairs, different insertion order,
different hash) and then labels it "not a defect" in a comment, without any change to `ADR-021`
recording that reinterpretation. This test asserts the behaviour `ADR-021`'s own G3 row
requires (same logical bundle ⇒ same hash, regardless of field order) so the contradiction is
a red test, not a comment someone has to notice.
"""

from __future__ import annotations

from src.modules.backtest.domain.bundle_hash import bundle_hash


def test_g3_same_logical_bundle_different_field_order_must_hash_identically() -> None:
    """`ADR-021` G3, verbatim: same logical bytes, different field order, must not diverge.

    `bundle_hash` currently forwards straight to `canonical_json(sort_keys=False)`, so this is
    expected to FAIL against the current implementation — that failure IS the proof `ADR-021`
    G3 asks for, not a QA authoring mistake.
    """
    built_one_way = {"universe": ["BTCUSDT"], "window_days": 30, "fee_bps": 4}
    built_the_other_way = {"fee_bps": 4, "universe": ["BTCUSDT"], "window_days": 30}

    assert bundle_hash(built_one_way) == bundle_hash(built_the_other_way), (
        "ADR-021 falsifier G3: the same logical bundle produced two different bundle_hash "
        "values because canonical_json(sort_keys=False) makes the hash sensitive to caller "
        "insertion order — D3's determinism claim does not hold for any dict built by two "
        "different code paths (e.g. a web-layer bundle vs one reconstructed from storage)."
    )
