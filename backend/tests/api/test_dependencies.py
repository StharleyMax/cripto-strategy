"""`src.api.dependencies` stubs raise LOUD when nobody has wired the composition root.

`get_ingest_record_source` and `get_store_readiness_source` are never called directly in
production — `src.main.create_app` always overrides both via `app.dependency_overrides` before
the app serves a request. These tests are the falsifier for each docstring's claim: they call
the stub directly, the one way the raise is ever reachable, and prove the app was never silently
served without an adapter.
"""

from __future__ import annotations

import pytest

from src.api.dependencies import get_ingest_record_source, get_store_readiness_source


def test_get_ingest_record_source_raises_when_never_overridden() -> None:
    """The stub is unreachable in a correctly wired app — calling it directly must fail loud."""
    with pytest.raises(NotImplementedError):
        get_ingest_record_source()


def test_get_store_readiness_source_raises_when_never_overridden() -> None:
    """Same falsifier, for `/ready`'s port: unreachable in a correctly wired app."""
    with pytest.raises(NotImplementedError):
        get_store_readiness_source()
