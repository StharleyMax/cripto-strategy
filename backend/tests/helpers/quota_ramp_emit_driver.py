"""Subprocess driver: call the REAL `quota_ramp_cli.emit()` with a payload that carries floats.

`T-04.6` (plan `04` item 4.12, `SPEC-001` §3.8) needs a `LANG=pt_BR.UTF-8` vs `LANG=C`
byte-comparison over a caller that actually serializes a FLOAT numeral. `test_ingest_record_
durability.py`'s own docstring names the gap: every column of `IngestHealthReport`'s
projection is `int`/`str`/`null` today, so ITS test proves nothing about a `float` column.
`quota_ramp_cli.emit()` is a production caller that does carry floats in the real payload
(`command_ramp` feeds it `recoil_seconds`, `weight_per_blind_request`, and friends), so this
driver calls `emit()` directly with a synthetic payload built from the same field names.

Driving `quota_ramp_cli.main()` needs a live network probe (`HttpsQuotaProbe`), and
`backend/scripts/test.sh` runs with `socket` amputated ("ZERO REDE" — see the module's own
header comment). Calling `emit()` directly sidesteps the probe entirely: it is the exact
function `command_ramp` calls, zero socket, and its return value is already "the bytes are
the record" (`test_emit_writes_one_stable_line_and_returns_exactly_what_it_wrote`).
"""

from __future__ import annotations

import sys

from src.modules.sentimento.infra.quota_ramp_cli import emit

# Values chosen to be ADVERSARIAL under `pt_BR`: a magnitude that would gain a thousands
# separator (`.`) and a decimal comma if anything on this path used `locale.format_string`
# or `f"{x:n}"` instead of `json.dumps`. `-0.0` is included because `pt_BR` and `C` disagree
# about the SIGN glyph of some locale-aware formatters even at zero.
PAYLOAD: dict[str, object] = {
    "command": "ramp",
    "bucket": "binance-fapi",
    "max_requests": 1234567,
    "recoil_seconds": 1234567.891011,
    "weight_per_blind_request": 0.5,
    "recoil_unmet_seconds": -1000000.25,
    "observed_weights": [0.0, -0.0, 3.14159265],
    "publishes_a_ceiling": True,
    "recoil_source": None,
}


def main() -> int:
    """Print exactly the bytes `emit()` returns — nothing else touches `stdout`."""
    sys.stdout.write(emit(PAYLOAD) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
