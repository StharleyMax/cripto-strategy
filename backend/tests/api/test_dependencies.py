"""`src.api.dependencies` stubs raise LOUD when nobody has wired the composition root.

`get_ingest_record_source` is never called directly in production — `src.main.create_app`
always overrides it via `app.dependency_overrides` before the app serves a request. This test
is the falsifier for the docstring's claim: it calls the stub directly, the one way the raise
is ever reachable, and proves the app was never silently served without an adapter.
"""

from __future__ import annotations

import pytest

from src.api.dependencies import get_ingest_record_source


def test_get_ingest_record_source_raises_when_never_overridden() -> None:
    """The stub is unreachable in a correctly wired app — calling it directly must fail loud."""
    with pytest.raises(NotImplementedError):
        get_ingest_record_source()
