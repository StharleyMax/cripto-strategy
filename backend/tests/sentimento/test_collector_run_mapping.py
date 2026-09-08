"""`collector_run_mapping`: the extracted `Q3` builders, hardened on their own (`T-01.6`).

`infra/collectors_cli.py`'s own docstring named this extraction as `T-01.6`'s job — a dedicated,
tested module the composition root calls, instead of the two builders living inline where only
`collectors_cli.py`'s own process/thread tests could reach them. These tests exercise the two
builders DIRECTLY, with no thread, no signal and no fake Redis: everything `collectors_cli.py`'s
own suite already covers at the process level.
"""

from __future__ import annotations

import hashlib

import pytest

from src.modules.sentimento.domain.ingest_record import KNOWN_VERDICTS
from src.modules.sentimento.domain.premium_index_batch import PREMIUM_INDEX_ENDPOINT
from src.modules.sentimento.domain.provenance import UNKNOWN_OBSERVER_REGION
from src.modules.sentimento.use_cases.collector_run_mapping import (
    CLOCK_SKEW_NOT_MEASURED_MS,
    FORCE_ORDER_ENDPOINT,
    FORCE_ORDER_OBSERVER_ID,
    FORCE_ORDER_WEIGHT_USED,
    KNOWN_VERDICT_LITERALS,
    PREMIUM_INDEX_OBSERVER_ID,
    WEIGHT_NOT_READABLE,
    KnownVerdict,
    build_force_order_run,
    build_premium_index_run,
)
from src.modules.sentimento.use_cases.persist_ntp_skew_run import SOURCE

_STARTED_AT = "2026-09-07T00:00:00.000Z"
_ENDED_AT = "2026-09-07T00:00:05.000Z"


def _digest(*messages: str) -> hashlib._Hash:
    digest = hashlib.sha256()
    for message in messages:
        digest.update(message.encode("utf-8"))
    return digest


# ── THE TYPE-LEVEL CLOSED SET NEVER DRIFTS FROM THE DOMAIN'S RUNTIME ONE ───────────────────


def test_known_verdict_literals_are_exactly_known_verdicts() -> None:
    """The mapping module's typed closed set and the domain's runtime one never drift apart.

    `KNOWN_VERDICT_LITERALS` (the `Literal` this module types `verdict` with) and
    `domain.ingest_record.KNOWN_VERDICTS` (the runtime set the read path consults) name the
    SAME three spellings. A fourth verdict added to one without the other is exactly the silent
    drift `ADR-008/DoD-3` exists to prevent — this test makes it fail loud instead.
    """
    assert set(KNOWN_VERDICT_LITERALS) == KNOWN_VERDICTS
    assert len(KNOWN_VERDICT_LITERALS) == 3


# ── `!forceOrder@arr` SESSION — `Q3` §1.1, §3 ──────────────────────────────────────────────


@pytest.mark.parametrize("verdict", sorted(KNOWN_VERDICT_LITERALS))
def test_force_order_run_verdict_is_always_a_known_one(verdict: KnownVerdict) -> None:
    """Every verdict this builder can be asked to record is a member of `KNOWN_VERDICTS`.

    Parametrised over the SAME closed set the builder's own type restricts callers to — the
    falsifier this guards against is someone widening the `Literal` (or the call site) to accept
    a fourth spelling without this test's parametrisation growing to catch it.
    """
    run = build_force_order_run(
        _STARTED_AT,
        _ENDED_AT,
        n_published=3,
        verdict=verdict,
        digest=_digest("a", "b", "c"),
    )
    assert run.verdict in KNOWN_VERDICTS


def test_force_order_run_maps_every_one_of_the_sixteen_q3_fields() -> None:
    """`Q3` §1.1/§3, field by field — nothing here is a bare literal without a citation."""
    digest = _digest("frame-1", "frame-2")
    run = build_force_order_run(
        _STARTED_AT, _ENDED_AT, n_published=2, verdict="ACCEPTED", digest=digest
    )

    assert run.source == SOURCE == "binance-futures"  # `Q3` §2.2
    assert run.endpoint == FORCE_ORDER_ENDPOINT == "!forceOrder@arr"  # `Q3` §2.1
    assert run.window == f"{_STARTED_AT}/{_ENDED_AT}"  # `Q3` §3
    # `n_expected = n_returned = n_published`: no independent oracle exists (`Q3` §3 (c)).
    assert run.n_expected == run.n_returned == 2
    assert run.n_written == 0  # the writer (F2), not the collector, writes the series
    assert run.verdict == "ACCEPTED"
    assert run.api_code is None  # WS carries no HTTP status
    assert run.src_sha256 == digest.hexdigest()
    assert run.weight_used == FORCE_ORDER_WEIGHT_USED == 0  # WS spends no REST weight, a fact
    assert run.observer_id == FORCE_ORDER_OBSERVER_ID
    assert run.observer_region == UNKNOWN_OBSERVER_REGION
    assert run.clock_skew_ms == CLOCK_SKEW_NOT_MEASURED_MS
    assert run.started_at == _STARTED_AT
    assert run.ended_at == _ENDED_AT
    assert len(run.run_id) == 36 and run.run_id.count("-") == 4  # `uuid4()` shape


def test_force_order_run_id_is_a_fresh_uuid4_every_call() -> None:
    """Two sessions closing back to back never collide on `run_id` — never a caller-supplied one.

    Morde: a regression that made `run_id` a constant (or derived from `started_at`) would make
    two same-second sessions collide, and `D1.5`'s `group by` would undercount pairs silently.
    """
    digest = _digest("x")
    first = build_force_order_run(_STARTED_AT, _ENDED_AT, 1, "ACCEPTED", digest)
    second = build_force_order_run(_STARTED_AT, _ENDED_AT, 1, "ACCEPTED", digest)
    assert first.run_id != second.run_id


def test_force_order_run_src_sha256_is_the_incremental_digest_of_every_message() -> None:
    """`Q3` §3: the hash is incremental over EVERY raw message, not just the last one.

    Morde: hashing only the final message (or a fixed string) would make two sessions with the
    same message COUNT but different CONTENT share a `src_sha256` — this pins the digest against
    the exact same computation `hashlib.sha256().update(...)` over both messages would produce.
    """
    expected = hashlib.sha256()
    expected.update(b"frame-1")
    expected.update(b"frame-2")
    run = build_force_order_run(
        _STARTED_AT, _ENDED_AT, 2, "ACCEPTED", _digest("frame-1", "frame-2")
    )
    assert run.src_sha256 == expected.hexdigest()


# ── `premiumIndex` CYCLE — `Q3` §1.2, §3 ───────────────────────────────────────────────────


@pytest.mark.parametrize("verdict", sorted(KNOWN_VERDICT_LITERALS))
def test_premium_index_run_verdict_is_always_a_known_one(verdict: KnownVerdict) -> None:
    """Same property as the session builder, for the cycle builder."""
    run = build_premium_index_run(
        _STARTED_AT,
        _ENDED_AT,
        n_symbols=1,
        status=200,
        weight_used=10,
        verdict=verdict,
        src_sha256="a" * 64,
    )
    assert run.verdict in KNOWN_VERDICTS


def test_premium_index_run_maps_every_one_of_the_sixteen_q3_fields() -> None:
    """`Q3` §1.2/§3, field by field."""
    run = build_premium_index_run(
        _STARTED_AT,
        _ENDED_AT,
        n_symbols=888,
        status=200,
        weight_used=10,
        verdict="ACCEPTED",
        src_sha256="b" * 64,
    )

    assert run.source == SOURCE == "binance-futures"
    assert run.endpoint == PREMIUM_INDEX_ENDPOINT
    assert run.window == f"{_STARTED_AT}/{_ENDED_AT}"
    assert run.n_expected == run.n_returned == 888  # `Q3` §3: no independent oracle either
    assert run.n_written == 0
    assert run.verdict == "ACCEPTED"
    assert run.api_code == 200
    assert run.src_sha256 == "b" * 64
    assert run.weight_used == 10
    assert run.observer_id == PREMIUM_INDEX_OBSERVER_ID
    assert run.observer_region == UNKNOWN_OBSERVER_REGION
    assert run.clock_skew_ms == CLOCK_SKEW_NOT_MEASURED_MS
    assert run.started_at == _STARTED_AT
    assert run.ended_at == _ENDED_AT
    assert len(run.run_id) == 36 and run.run_id.count("-") == 4


def test_premium_index_run_uses_the_weight_not_readable_sentinel_when_the_header_is_absent() -> (
    None
):
    """`Q3` §3 (i): a missing `x-mbx-used-weight-1m` on ONE poll becomes `-1`, never an abort.

    Morde: silently defaulting the missing header to `0` would be indistinguishable from a REST
    call that genuinely spent zero weight — `WEIGHT_NOT_READABLE` is chosen because no real
    weight is ever negative.
    """
    run = build_premium_index_run(
        _STARTED_AT,
        _ENDED_AT,
        n_symbols=0,
        status=200,
        weight_used=None,
        verdict="ACCEPTED_WITH_WARNING",
        src_sha256="c" * 64,
    )
    assert run.weight_used == WEIGHT_NOT_READABLE == -1
    assert run.weight_used >= -1  # never confusable with a measured (always >= 0) weight


def test_premium_index_run_id_is_a_fresh_uuid4_every_call() -> None:
    """Two cycles polled back to back never collide on `run_id`."""
    first = build_premium_index_run(_STARTED_AT, _ENDED_AT, 1, 200, 10, "ACCEPTED", "d" * 64)
    second = build_premium_index_run(_STARTED_AT, _ENDED_AT, 1, 200, 10, "ACCEPTED", "d" * 64)
    assert first.run_id != second.run_id
