"""The ONE canonical-JSON serializer for `sentimento`/domain — `SPEC-001` §3.8, no locale, ever."""

# ── WHY THIS MODULE EXISTS: A NAMED DEBT, PAID ─────────────────────────────────────────────
#
# `T-04.6` (plan `04` item 4.12): `series_key.py` and `ingest_record.py` each carried a
# byte-identical private copy of this function — same body, same docstring, two places to
# keep in sync. The duplication was named as debt at the site (`series_key.py`'s old
# `_canonical_json` docstring: *"Unifying them is `T-04.6`'s job … and doing it here would
# edit a module this task has no business touching"*), and this module is that unification:
# ONE function, imported by both call sites, so there is exactly one place left to audit.
#
# ── LOCALE INVARIANCE IS INHERITED FROM JSON'S OWN GRAMMAR, NOT CLAIMED BY HAND ────────────
#
# `json.dumps` never consults `LC_NUMERIC`: a `float` is written through `float.__repr__`
# (always a dot, never a thousands separator) and an `int` has no decimal point to begin
# with — the module does not call `locale.format_string`, `f"{x:n}"`, or anything else that
# would. `separators=(",", ":")` removes the only other locale-shaped knob (whitespace), and
# `ensure_ascii=True` keeps the byte string ASCII regardless of the platform's default
# encoding. `backend/tests/sentimento/test_ingest_record_durability.py::
# test_the_cli_projection_is_byte_identical_under_pt_br_and_c_locales` and
# `test_quota_ramp_locale_invariance.py::
# test_emit_of_a_float_payload_is_byte_identical_under_pt_br_and_c_locales` run `SPEC-001`
# §3.8 literally (`LANG=pt_BR.UTF-8` against `LANG=C`, `sha256` compared) instead of trusting
# this comment.

from __future__ import annotations

import json


def canonical_json(payload: dict[str, object]) -> str:
    """Serialize with no whitespace slack and no locale — insertion order IS the field order."""
    return json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=False)
