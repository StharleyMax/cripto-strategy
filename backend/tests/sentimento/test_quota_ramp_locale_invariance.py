"""`SPEC-001` §3.8 / plan `04` item 4.12, on a caller that carries an actual FLOAT numeral.

`test_ingest_record_durability.py::test_the_cli_projection_is_byte_identical_under_pt_br_and_
c_locales` already runs `LANG=pt_BR.UTF-8` against `LANG=C` for the ingest-health projection,
but its own docstring names the gap: every column there is `int`, `str` or `null`, and none
of those has ever been locale-sensitive in JSON. This file closes exactly that gap for
`quota_ramp_cli.emit()`, the production caller that DOES serialize floats (`recoil_seconds`,
`weight_per_blind_request`, and the rest of what `command_ramp` builds).

The reference hash is computed IN-PROCESS from a direct call to `emit()`, so the two
subprocess runs are compared against a THIRD, independent computation — two subprocesses
that were both wrong in the same way would still agree with each other.
"""

from __future__ import annotations

import hashlib
import os
import subprocess
import sys
from pathlib import Path

import pytest

from src.modules.sentimento.infra.quota_ramp_cli import emit
from tests.helpers.quota_ramp_emit_driver import PAYLOAD

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DRIVER = BACKEND_ROOT / "tests" / "helpers" / "quota_ramp_emit_driver.py"


@pytest.mark.parametrize("locale", ["pt_BR.UTF-8", "C"])
def test_emit_of_a_float_payload_is_byte_identical_under_pt_br_and_c_locales(locale: str) -> None:
    """Export the same float-bearing payload under two locales; `sha256` has to agree.

    THE UNIVERSE IS REAL AND WAS CHECKED BEFORE THIS TEST WAS TRUSTED, same measurement
    `test_ingest_record_durability.py` already recorded on this machine: `pt_BR.UTF-8` is
    installed and reaches the subprocess as an effective locale rather than silently falling
    back to `C` (which would make this test compare two identical runs while claiming to
    compare two locales).
    """
    expected = hashlib.sha256((emit(PAYLOAD) + "\n").encode("utf-8")).hexdigest()

    environment = dict(os.environ, PYTHONPATH=str(BACKEND_ROOT), LANG=locale, LC_ALL=locale)
    completed = subprocess.run(
        [sys.executable, str(DRIVER)],
        cwd=str(BACKEND_ROOT),
        env=environment,
        capture_output=True,
        text=True,
        check=True,
    )
    assert hashlib.sha256(completed.stdout.encode("utf-8")).hexdigest() == expected
