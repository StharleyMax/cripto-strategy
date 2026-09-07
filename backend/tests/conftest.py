"""Suite-wide `pytest` setup, loaded before any test module in this tree is imported.

`INGEST_HEALTH_STORE_PATH` needs a value whose PARENT directory exists before `src.main` is
first imported: its module-level `app = create_app(...)` now refuses to build when the
parent is absent (`T-02.1`, `ADR-029/D3`), and the DEFAULT path (`data/md/...`) has no parent
in a fresh checkout — `data/` is generated/re-obtainable state, gitignored, never created by
`bootstrap.sh` (`CLAUDE.md`, "Dado bruto nao e versionado"). Every test that needs a specific
store builds its OWN app via `create_app(store_path=...)` (see
`backend/tests/api/test_ingest_health_route_over_the_network.py`); nothing reads the
module-level `app` this only unblocks, so it just needs to point somewhere real.

`QUARANTINE_STORE_PATH` is the SECOND store `create_app` now wires (`T-03.4`, `SPEC-003`
s3.5) — same rule (`_require_parent_directory`, `src/main/__init__.py`), same reason: absent
this, importing `src.main` in ANY test process would refuse before a single test runs,
because `create_app`'s quarantine fallback resolves the SAME env var this file sets and the
default path's parent (`data/md/`) does not exist here either. `create_app(store_path=...)`
callers that never pass `quarantine_store_path` explicitly (every test written before
`T-03.4`) fall back to reading this env var inside `create_app` itself — this scratch
directory is what keeps that fallback pointed at something real for the whole suite.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

if "INGEST_HEALTH_STORE_PATH" not in os.environ:
    _scratch_dir = Path(tempfile.mkdtemp(prefix="ingest-health-store-"))
    os.environ["INGEST_HEALTH_STORE_PATH"] = str(_scratch_dir / "ingest_health.sqlite3")

if "QUARANTINE_STORE_PATH" not in os.environ:
    _quarantine_scratch_dir = Path(tempfile.mkdtemp(prefix="series-quarantine-store-"))
    os.environ["QUARANTINE_STORE_PATH"] = str(_quarantine_scratch_dir / "series_quarantine.sqlite3")
