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

from src.modules.sentimento.domain.ingest_record import KNOWN_VERDICTS, IngestRun
from src.modules.sentimento.domain.premium_index_batch import PREMIUM_INDEX_ENDPOINT
from src.modules.sentimento.domain.provenance import UNKNOWN_OBSERVER_REGION
from src.modules.sentimento.use_cases.collector_run_mapping import (
    CLOCK_SKEW_NOT_MEASURED_MS,
    FORCE_ORDER_ENDPOINT,
    FORCE_ORDER_OBSERVER_ID,
    FORCE_ORDER_WEIGHT_USED,
    KLINES_ENDPOINT,
    KLINES_OBSERVER_ID,
    KLINES_WEIGHT_PER_CALL,
    KNOWN_VERDICT_LITERALS,
    LONG_SHORT_DATA_ENDPOINT,
    LONG_SHORT_ENDPOINT,
    LONG_SHORT_OBSERVER_ID,
    N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS,
    OPEN_INTEREST_HIST_ENDPOINT,
    OPEN_INTEREST_OBSERVER_ID,
    PREMIUM_INDEX_OBSERVER_ID,
    WEIGHT_NOT_READABLE,
    KnownVerdict,
    build_force_order_run,
    build_klines_run,
    build_long_short_run,
    build_open_interest_run,
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


def test_both_builders_accept_the_run_id_the_collector_opened_the_cycle_with() -> None:
    """`ADR-035/D2`: minting the id at CLOSE makes it impossible for the rows to carry it."""
    opened = "9f1c1f8e-0a4b-4c2e-8f2a-1b3c4d5e6f70"
    force_order = build_force_order_run(
        started_at="2026-09-10T20:00:00Z",
        ended_at="2026-09-10T20:01:00Z",
        n_published=3,
        verdict="ACCEPTED",
        digest=hashlib.sha256(b"raw"),
        run_id=opened,
    )
    premium_index = build_premium_index_run(
        started_at="2026-09-10T20:00:00Z",
        ended_at="2026-09-10T20:01:00Z",
        n_symbols=3,
        status=200,
        weight_used=1,
        verdict="ACCEPTED",
        src_sha256="d" * 64,
        run_id=opened,
    )
    assert force_order.run_id == premium_index.run_id == opened


def test_omitting_the_run_id_still_mints_a_distinct_one_per_call() -> None:
    """Every caller that predates `ADR-035/D2` keeps the exact behaviour it had."""
    first = build_premium_index_run(
        started_at="2026-09-10T20:00:00Z",
        ended_at="2026-09-10T20:01:00Z",
        n_symbols=1,
        status=200,
        weight_used=1,
        verdict="ACCEPTED",
        src_sha256="d" * 64,
    )
    second = build_premium_index_run(
        started_at="2026-09-10T20:00:00Z",
        ended_at="2026-09-10T20:01:00Z",
        n_symbols=1,
        status=200,
        weight_used=1,
        verdict="ACCEPTED",
        src_sha256="d" * 64,
    )
    assert first.run_id != second.run_id


def test_the_opening_n_written_is_zero_and_that_zero_is_named() -> None:
    """`ADR-035/D2`: `0` here means "not accounted yet", and a NEGATIVE sentinel is refused.

    The value has to stay `0` — `collector_status.uptime_percent` sums `n_written` over the
    window (`collector_status.py:119-121`), so a `-1` sentinel would serve a NEGATIVE percentage
    on a route that already exists (`RS-1`). The distinction the number cannot express lives in
    `writer_accounted_at` instead, and that is what this constant's name says out loud.
    """
    assert N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS == 0


# ── `T-01.3`: THE THIRD BUILDER, `/fapi/v1/klines` ─────────────────────────────────────────


def _klines_run(**overrides: object) -> IngestRun:
    """One klines run with the fields every test below starts from."""
    fields: dict[str, object] = {
        "started_at": "2026-09-10T20:00:00Z",
        "ended_at": "2026-09-10T20:00:04Z",
        "n_returned": 10_080,
        "n_calls": 7,
        "api_code": None,
        "verdict": "ACCEPTED",
        "src_sha256": "e" * 64,
    }
    fields.update(overrides)
    return build_klines_run(**fields)  # type: ignore[arg-type]


def test_the_klines_endpoint_literal_matches_the_client_path() -> None:
    """The `use_cases` spelling and the `infra` client's own path are the SAME string.

    They are two literals because `use_cases` may not import `infra` (`[tool.importlinter]`'s
    `layers` contract) — so the drift that duplication risks is made executable here rather
    than trusted. Morde: change either spelling and this fails, naming both.

    A drift would be SILENT in the worst way: `IngestRun.endpoint` is what
    `/api/v1/ingest-health` and `collector_status.py`'s dashboard group by, so the runs would
    file themselves under a producer name that matches nothing the client ever called.
    """
    from src.modules.sentimento.infra.binance_klines_client import KLINES_PATH

    assert KLINES_ENDPOINT == KLINES_PATH


def test_the_long_short_endpoint_literal_matches_the_client_path() -> None:
    """The FULL path this run files itself under is the prefix + the name the client is given.

    Same argument as the klines test above, one layer more specific: the infra client is GENERIC
    over `/futures/data/*`, so what crosses the boundary is the endpoint NAME
    (`LONG_SHORT_DATA_ENDPOINT`) and the client composes the path from its own
    `FUTURES_DATA_PATH_PREFIX`. This asserts the composition, so a change to either half fails
    here instead of filing runs under a producer name no HTTP call ever used.
    """
    from src.modules.sentimento.infra.binance_futures_data_client import (
        FUTURES_DATA_PATH_PREFIX,
    )

    assert LONG_SHORT_ENDPOINT == f"{FUTURES_DATA_PATH_PREFIX}{LONG_SHORT_DATA_ENDPOINT}"
    assert LONG_SHORT_ENDPOINT == "/futures/data/globalLongShortAccountRatio"


def test_the_long_short_run_prices_no_weight_because_the_endpoint_publishes_none() -> None:
    """`WEIGHT_NOT_READABLE`, and it is MEASURED — `/futures/data/*` sends no `x-mbx-*` header.

    MORDE: a derived weight here (the shape `build_klines_run` legitimately uses) would be a
    number with no command behind it, and `collector_status.py` would report a quota spend this
    repository never measured. `domain/clock_skew.py` (`T-03.7`) is where the zero-header fact
    is recorded.
    """
    run = build_long_short_run(
        started_at="2026-09-12T00:00:00Z",
        ended_at="2026-09-12T00:00:01Z",
        n_returned=500,
        n_calls=4,
        api_code=None,
        verdict="ACCEPTED",
        src_sha256="0" * 64,
    )

    assert run.weight_used == WEIGHT_NOT_READABLE
    assert run.endpoint == LONG_SHORT_ENDPOINT
    assert run.observer_id == LONG_SHORT_OBSERVER_ID
    assert run.n_expected == run.n_returned == 500
    assert run.n_written == N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS


def test_a_klines_run_names_the_endpoint_and_the_observer_of_its_own_producer() -> None:
    """Distinct `endpoint`/`observer_id` from the other two producers, by construction."""
    run = _klines_run()
    assert run.endpoint == KLINES_ENDPOINT
    assert run.observer_id == KLINES_OBSERVER_ID
    assert run.observer_id not in {FORCE_ORDER_OBSERVER_ID, PREMIUM_INDEX_OBSERVER_ID}
    assert run.source == SOURCE
    assert run.observer_region == UNKNOWN_OBSERVER_REGION
    assert run.clock_skew_ms == CLOCK_SKEW_NOT_MEASURED_MS


def test_the_weight_is_derived_from_the_calls_and_is_never_the_unreadable_sentinel() -> None:
    """`weight_used = KLINES_WEIGHT_PER_CALL * n_calls` — measured, not guessed, not absent.

    `WEIGHT_NOT_READABLE` (`-1`) means "the provider answered without a readable header on a
    call this collector had no other way to price". `/fapi/v1/klines` IS priceable — weight 1
    per call `[MEDIDO 2026-09-10: sequencia 31->32->33]` — so recording `-1` here would throw
    away a fact. Morde: substitute the sentinel and this fails on both assertions.
    """
    assert _klines_run(n_calls=7).weight_used == 7 * KLINES_WEIGHT_PER_CALL
    assert _klines_run(n_calls=7).weight_used != WEIGHT_NOT_READABLE
    assert _klines_run(n_calls=1).weight_used == KLINES_WEIGHT_PER_CALL


def test_n_expected_equals_n_returned_because_there_is_no_independent_oracle() -> None:
    """No invented `backfill_days * 1440`: a symbol listed mid-window has fewer bars, legally.

    Morde: compute `n_expected` from the window and every young symbol reports a permanent
    shortfall in `/api/v1/ingest-health` that no data loss ever caused.
    """
    run = _klines_run(n_returned=9_999)
    assert run.n_expected == run.n_returned == 9_999


def test_the_klines_run_leaves_n_written_for_the_writer() -> None:
    """`ADR-035/D2` again: the collector opens, the writer closes."""
    assert _klines_run().n_written == N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS


def test_the_run_id_is_a_parameter_so_the_rows_can_carry_it() -> None:
    """A caller that opened the pass with an id passes that SAME id here."""
    assert _klines_run(run_id="the-pass-id").run_id == "the-pass-id"


def test_two_klines_runs_without_an_explicit_id_do_not_collide() -> None:
    """Omitting `run_id` still mints a fresh one — `md.ingest_run`'s key would collide."""
    assert _klines_run().run_id != _klines_run().run_id


def test_the_window_is_the_started_ended_pair_the_caller_measured() -> None:
    """`window` is built from the two instants, never from a clock this module reads."""
    run = _klines_run(started_at="2026-09-10T20:00:00Z", ended_at="2026-09-10T20:00:04Z")
    assert run.window == "2026-09-10T20:00:00Z/2026-09-10T20:00:04Z"


@pytest.mark.parametrize("verdict", KNOWN_VERDICT_LITERALS)
def test_the_klines_builder_accepts_every_known_verdict_and_only_those(
    verdict: KnownVerdict,
) -> None:
    """The three spellings the closed set fixes, and the api code travels when there is one."""
    run = _klines_run(verdict=verdict, api_code=-1121)
    assert run.verdict in KNOWN_VERDICTS
    assert run.api_code == -1121


# ── `T-03.3`: THE FOURTH PRODUCER'S RUN ─────────────────────────────────────────────────────


def _open_interest_run(
    *,
    n_returned: int = 288,
    n_calls: int = 5,
    api_code: int | None = None,
    verdict: KnownVerdict = "ACCEPTED",
) -> IngestRun:
    """Build one open-interest pass run with the arguments a real pass would supply."""
    return build_open_interest_run(
        started_at=_STARTED_AT,
        ended_at=_ENDED_AT,
        n_returned=n_returned,
        n_calls=n_calls,
        api_code=api_code,
        verdict=verdict,
        src_sha256="0" * 64,
    )


def test_the_open_interest_endpoint_literal_matches_the_client_path() -> None:
    """The `use_cases` spelling and the `infra` client's own path are the SAME string.

    Same reasoning as the klines twin above, and the same silent failure it prevents: a drift
    would file every open-interest run under a producer name matching nothing the client ever
    called, on the route `/api/v1/ingest-health` groups by.
    """
    from src.modules.sentimento.infra.binance_oi_history_client import OPEN_INTEREST_HIST_PATH

    assert OPEN_INTEREST_HIST_ENDPOINT == OPEN_INTEREST_HIST_PATH


def test_an_open_interest_run_names_the_endpoint_and_the_observer_of_its_own_producer() -> None:
    """Distinct `endpoint`/`observer_id` from the other three producers, by construction."""
    run = _open_interest_run()

    assert run.endpoint == OPEN_INTEREST_HIST_ENDPOINT
    assert run.observer_id == OPEN_INTEREST_OBSERVER_ID
    assert run.observer_id not in {
        FORCE_ORDER_OBSERVER_ID,
        PREMIUM_INDEX_OBSERVER_ID,
        KLINES_OBSERVER_ID,
    }


def test_the_open_interest_weight_is_the_sentinel_and_never_a_derived_number() -> None:
    """⛔ `/futures/data/` PUBLISHES NO `x-mbx-*` HEADER, so no weight can honestly be derived.

    `[MEDIDO 2026-09-12: GET /futures/data/openInterestHist?symbol=BTCUSDT&period=5m -> HTTP 200
    com ZERO header casando `weight`/`used`; n=1 resposta, todos os headers inspecionados]`.

    Morde: the obvious "improvement" here is to copy `build_klines_run` and write
    `KLINES_WEIGHT_PER_CALL * n_calls` (or any `k * n_calls`), which would be a weight with no
    command behind it. This asserts the value is the SENTINEL and that it does NOT move with
    `n_calls`, so any per-call derivation fails.
    """
    assert _open_interest_run(n_calls=5).weight_used == WEIGHT_NOT_READABLE
    assert _open_interest_run(n_calls=1).weight_used == WEIGHT_NOT_READABLE
    assert _open_interest_run(n_calls=500).weight_used == WEIGHT_NOT_READABLE
    assert _open_interest_run(n_calls=5).weight_used != KLINES_WEIGHT_PER_CALL * 5


def test_the_open_interest_run_opens_with_n_written_zero_for_the_writer_to_close() -> None:
    """`ADR-035/D2`: the collector OPENS the run, the single writer CLOSES it."""
    assert _open_interest_run().n_written == N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS


def test_the_open_interest_run_refuses_to_invent_an_expectation() -> None:
    """`n_expected == n_returned` — there is no oracle for how many points SHOULD have come."""
    run = _open_interest_run(n_returned=137)
    assert (run.n_expected, run.n_returned) == (137, 137)


def test_an_open_interest_run_carries_the_api_code_it_was_given() -> None:
    """`-1130` (END OF HISTORY, ~30 days) reaches `/api/v1/ingest-health` instead of vanishing."""
    run = _open_interest_run(api_code=-1130, verdict="ACCEPTED_WITH_WARNING")
    assert run.api_code == -1130
    assert run.verdict == "ACCEPTED_WITH_WARNING"
    assert run.source == SOURCE
