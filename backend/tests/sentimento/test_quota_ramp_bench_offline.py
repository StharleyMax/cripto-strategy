"""The bench wired end to end with a FAKE connection — proving it needs no socket to be tested.

The probe that runs the live measurement is the same object exercised here; only the
connection factory differs. That is the whole reason `infra/https_quota_probe.py` takes one.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Mapping, Sequence

import pytest

from src.modules.sentimento.domain.bucket_coupling import CouplingVerdict
from src.modules.sentimento.domain.quota_bucket import (
    BINANCE_FAPI,
    BINANCE_FUTURES_DATA,
    COINALYZE,
    USED_WEIGHT_HEADER,
    QuotaBucket,
)
from src.modules.sentimento.domain.ramp_ledger import ProbeObservation
from src.modules.sentimento.infra import quota_ramp_cli
from src.modules.sentimento.infra.https_quota_probe import (
    COINALYZE_KEY_VARIABLE,
    HttpsQuotaProbe,
    authentication_headers,
    flatten_headers,
)
from src.modules.sentimento.infra.system_ramp_clock import SystemRampClock
from src.modules.sentimento.use_cases.probe_bucket_coupling import (
    CouplingPlan,
    _read_counter,
    probe_bucket_coupling,
)
from tests.helpers.quota_ramp_doubles import RecordingClock, ScriptedProbe, accepted


class FakeResponse:
    """A canned response, which must be `read()` before the connection is reused."""

    def __init__(self, status: int, headers: Sequence[tuple[str, str]]) -> None:
        """Take the status line and the header pairs to hand back."""
        self.status = status
        self._headers = list(headers)
        self.drained = False

    def getheaders(self) -> list[tuple[str, str]]:
        """Return the header pairs, repeats included."""
        return list(self._headers)

    def read(self) -> bytes:
        """Drain the body and record that it happened."""
        self.drained = True
        return b"{}"


class FakeConnection:
    """Never opens a socket, and records every request it was given."""

    def __init__(self, host: str, responses: Sequence[FakeResponse | OSError]) -> None:
        """Take the host it pretends to serve and the responses to replay."""
        self.host = host
        self._responses = list(responses)
        self.requests: list[tuple[str, str, Mapping[str, str]]] = []
        self.closed = False
        self._pending: FakeResponse | None = None

    def request(
        self, method: str, url: str, body: None = None, headers: Mapping[str, str] | None = None
    ) -> None:
        """Record the request, raising a scripted transport failure at send time."""
        self.requests.append((method, url, dict(headers or {})))
        step = self._responses.pop(0)
        if isinstance(step, OSError):
            raise step
        self._pending = step

    def getresponse(self) -> FakeResponse:
        """Hand back the response for the request just recorded."""
        assert self._pending is not None
        return self._pending

    def close(self) -> None:
        """Mark the connection closed."""
        self.closed = True


def _probe_with(
    responses: Sequence[FakeResponse | OSError],
) -> tuple[HttpsQuotaProbe, list[FakeConnection]]:
    """Build a probe whose connections are fakes, and hand back the fakes for assertions."""
    opened: list[FakeConnection] = []

    def factory(host: str) -> FakeConnection:
        connection = FakeConnection(host, responses)
        opened.append(connection)
        return connection

    return HttpsQuotaProbe(environment={}, connection_factory=factory), opened


def test_the_probe_reports_a_429_as_a_status_and_never_as_an_exception() -> None:
    """The reason for `http.client` over `urlopen`: the status this task hunts must be DATA."""
    probe, _ = _probe_with([FakeResponse(429, [("Retry-After", "30")])])

    observation = probe.probe(BINANCE_FUTURES_DATA, "/futures/data/openInterestHist")

    assert observation.status == 429
    assert observation.transport_error is None
    assert observation.header("retry-after") == "30"


def test_a_transport_failure_becomes_an_observation_and_drops_the_connection() -> None:
    """The control, at the layer where the socket lives: a dead send is not a quiet success."""
    probe, opened = _probe_with([ConnectionResetError("reset")])

    observation = probe.probe(BINANCE_FAPI, "/fapi/v1/depth")

    assert observation.status is None
    assert observation.transport_error is not None
    assert "ConnectionResetError" in observation.transport_error
    assert opened[0].closed is True


def test_the_connection_is_reused_across_requests_to_the_same_host() -> None:
    """Fewer TLS handshakes is gentler on the provider and keeps the ramp's cadence honest."""
    probe, opened = _probe_with([FakeResponse(200, []), FakeResponse(200, [])])

    probe.probe(BINANCE_FAPI, "/fapi/v1/depth")
    probe.probe(BINANCE_FUTURES_DATA, "/futures/data/openInterestHist")

    assert len(opened) == 1
    assert len(opened[0].requests) == 2
    probe.close()
    assert opened[0].closed is True


def test_the_body_is_drained_so_the_next_request_can_reuse_the_connection() -> None:
    """An undrained response would desynchronise keep-alive and fake a transport failure."""
    response = FakeResponse(200, [(USED_WEIGHT_HEADER, "12")])
    probe, _ = _probe_with([response])

    probe.probe(BINANCE_FAPI, "/fapi/v1/depth")

    assert response.drained is True


def test_repeated_headers_are_joined_and_never_dropped() -> None:
    """Keeping only the last occurrence would discard evidence from a response we came to read."""
    assert flatten_headers([("Vary", "Accept"), ("vary", "Origin"), ("X-A", "1")]) == {
        "vary": "Accept, Origin",
        "x-a": "1",
    }


def test_no_key_in_the_environment_means_no_header_and_no_crash() -> None:
    """A `401` in the ledger is honest; a `KeyError` at composition time loses the whole pass."""
    assert authentication_headers(COINALYZE, {}) == {}
    assert authentication_headers(COINALYZE, {COINALYZE_KEY_VARIABLE: "   "}) == {}
    with_key = authentication_headers(COINALYZE, {COINALYZE_KEY_VARIABLE: "abc"})
    assert with_key == {"api_key": "abc"}


def test_the_binance_buckets_never_receive_an_api_key_header() -> None:
    """A credential sent to the wrong provider is a leak, not a no-op."""
    environment = {COINALYZE_KEY_VARIABLE: "abc"}

    assert authentication_headers(BINANCE_FAPI, environment) == {}
    assert authentication_headers(BINANCE_FUTURES_DATA, environment) == {}


def test_the_coupling_orchestration_spends_exactly_two_observed_reads_per_half() -> None:
    """Unequal read counts would make the two deltas unsubtractable — the control's one axiom."""
    weights = ["10", "12", "14", "26"]
    script = [accepted({USED_WEIGHT_HEADER: weight}) for weight in weights[:2]]
    script.append(accepted({USED_WEIGHT_HEADER: weights[2]}))
    script.extend(accepted() for _ in range(10))
    script.append(accepted({USED_WEIGHT_HEADER: weights[3]}))
    probe = ScriptedProbe(script)
    plan = CouplingPlan(
        observed_bucket=BINANCE_FAPI,
        observed_path="/fapi/v1/depth",
        blind_bucket=BINANCE_FUTURES_DATA,
        blind_path="/futures/data/openInterestHist",
        blind_requests=10,
        interval_seconds=0.25,
    )

    run = probe_bucket_coupling(plan, probe, RecordingClock())

    observed_calls = [call for call in probe.calls if call[0] == BINANCE_FAPI.identifier]
    assert len(observed_calls) == 4
    assert run.readings == (10, 12, 14, 26)
    assert run.result.verdict is CouplingVerdict.SHARED
    assert run.result.weight_per_blind_request == 1.0
    assert run.load.delivered == 10


def test_the_coupling_divides_by_the_load_delivered_and_never_by_the_load_planned() -> None:
    """A denominator that did not happen would understate the weight of every blind call."""
    script: list[ProbeObservation | OSError] = [
        accepted({USED_WEIGHT_HEADER: "10"}),
        accepted({USED_WEIGHT_HEADER: "12"}),
        accepted({USED_WEIGHT_HEADER: "14"}),
        accepted(),
        accepted(),
        ConnectionResetError("reset"),
        ConnectionResetError("reset"),
        accepted({USED_WEIGHT_HEADER: "18"}),
    ]
    probe = ScriptedProbe(script)
    plan = CouplingPlan(
        observed_bucket=BINANCE_FAPI,
        observed_path="/fapi/v1/depth",
        blind_bucket=BINANCE_FUTURES_DATA,
        blind_path="/futures/data/openInterestHist",
        blind_requests=4,
        interval_seconds=0.25,
    )

    run = probe_bucket_coupling(plan, probe, RecordingClock())

    assert run.load.delivered == 2
    assert len(run.load.failures) == 2
    assert run.result.blind_requests == 2
    assert run.result.weight_per_blind_request == 1.0


def test_a_coupling_run_with_zero_delivered_load_refuses_a_verdict() -> None:
    """Nothing was spent, so nothing was measured — and it must not read as SEPARATE."""
    script: list[ProbeObservation | OSError] = [
        accepted({USED_WEIGHT_HEADER: "10"}),
        accepted({USED_WEIGHT_HEADER: "12"}),
        accepted({USED_WEIGHT_HEADER: "14"}),
        ConnectionResetError("reset"),
        ConnectionResetError("reset"),
        accepted({USED_WEIGHT_HEADER: "16"}),
    ]
    probe = ScriptedProbe(script)
    plan = CouplingPlan(
        observed_bucket=BINANCE_FAPI,
        observed_path="/fapi/v1/depth",
        blind_bucket=BINANCE_FUTURES_DATA,
        blind_path="/futures/data/openInterestHist",
        blind_requests=2,
        interval_seconds=0.25,
    )

    run = probe_bucket_coupling(plan, probe, RecordingClock())

    assert run.result.verdict is CouplingVerdict.INCONCLUSIVE
    assert run.load.delivered == 0


def test_the_coupling_refuses_to_infer_a_bucket_that_can_simply_be_read() -> None:
    """Inferring what is printed on the response would be a worse measurement of a known thing."""
    plan = CouplingPlan(
        observed_bucket=BINANCE_FAPI,
        observed_path="/fapi/v1/depth",
        blind_bucket=BINANCE_FAPI,
        blind_path="/fapi/v1/time",
        blind_requests=4,
        interval_seconds=0.25,
    )

    with pytest.raises(ValueError, match="nao e cego"):
        probe_bucket_coupling(plan, ScriptedProbe([]), RecordingClock())


def test_the_cli_emits_one_json_object_per_bucket_for_the_headers_command() -> None:
    """`D3.12` as the bench produces it: the counter's presence is a FIELD, not a paragraph."""
    lines: list[str] = []

    def capture(payload: Mapping[str, object]) -> str:
        line = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
        lines.append(line)
        return line

    script = [
        accepted({USED_WEIGHT_HEADER: "4", "server": "nginx"}),
        accepted({"server": "nginx", "x-amz-cf-pop": "GRU1-P6"}),
        accepted({"server": "nginx"}),
    ]
    original = quota_ramp_cli.emit
    quota_ramp_cli.emit = capture
    try:
        assert quota_ramp_cli.dispatch(["headers"], ScriptedProbe(script), RecordingClock()) == 0
    finally:
        quota_ramp_cli.emit = original

    payloads = [json.loads(line) for line in lines]
    assert [payload["bucket"] for payload in payloads] == [
        "binance-fapi",
        "binance-futures-data",
        "coinalyze",
    ]
    assert [payload["counter_header_present"] for payload in payloads] == [True, False, False]
    assert payloads[1]["quota_headers_seen"] == []
    assert payloads[0]["quota_headers_seen"] == [USED_WEIGHT_HEADER]


def test_the_cli_refuses_a_command_it_does_not_declare() -> None:
    """An unknown verb prints the usage line instead of doing something adjacent."""
    for argv in ([], ["ramp"], ["coupling"], ["nope"], ["headers", "extra"]):
        with pytest.raises(SystemExit):
            quota_ramp_cli.dispatch(argv, ScriptedProbe([]), RecordingClock())


def test_the_cli_ramp_command_reports_the_verdict_and_the_blind_weights() -> None:
    """A live-shaped run, offline: three blind rungs, a 429, a recoil, and no ceiling forged."""
    lines: list[str] = []

    def capture(payload: Mapping[str, object]) -> str:
        line = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
        lines.append(line)
        return line

    from tests.helpers.quota_ramp_doubles import throttled

    probe = ScriptedProbe([accepted(), accepted(), throttled({"retry-after": "15"})])
    original = quota_ramp_cli.emit
    quota_ramp_cli.emit = capture
    try:
        code = quota_ramp_cli.dispatch(
            ["ramp", "binance-futures-data", "8"], probe, RecordingClock()
        )
    finally:
        quota_ramp_cli.emit = original

    payload = json.loads(lines[0])
    assert code == 0
    assert payload["conclusion"] == "THROTTLED"
    assert payload["publishes_a_ceiling"] is True
    assert payload["throttled_at_request"] == 3
    assert payload["accepted_before_throttle"] == 2
    assert payload["observed_weights"] == [None, None, None]
    assert payload["retry_after_present"] is True
    assert payload["recoil_seconds"] == 60.0


def test_the_cli_coupling_command_reports_the_verdict_with_both_deltas() -> None:
    """The reader must be able to redo the subtraction from the emitted line alone."""
    lines: list[str] = []

    def capture(payload: Mapping[str, object]) -> str:
        line = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
        lines.append(line)
        return line

    script = [
        accepted({USED_WEIGHT_HEADER: "10"}),
        accepted({USED_WEIGHT_HEADER: "12"}),
        accepted({USED_WEIGHT_HEADER: "14"}),
        accepted(),
        accepted(),
        accepted({USED_WEIGHT_HEADER: "18"}),
    ]
    original = quota_ramp_cli.emit
    quota_ramp_cli.emit = capture
    try:
        assert (
            quota_ramp_cli.dispatch(["coupling", "2"], ScriptedProbe(script), RecordingClock()) == 0
        )
    finally:
        quota_ramp_cli.emit = original

    payload = json.loads(lines[0])
    assert payload["verdict"] == "SHARED"
    assert payload["baseline_delta"] == 2
    assert payload["loaded_delta"] == 4
    assert payload["weight_per_blind_request"] == 1.0


def test_emit_writes_one_stable_line_and_returns_exactly_what_it_wrote(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """The bytes are the record, so what the caller can hash IS what the logger emitted."""
    with caplog.at_level(logging.INFO, logger=quota_ramp_cli.logger.name):
        line = quota_ramp_cli.emit({"b": 2, "a": 1})

    assert line == '{"a": 1, "b": 2}'
    assert caplog.messages == [line]


def test_the_product_logger_is_never_the_same_logger_as_the_diagnostics_one() -> None:
    """Run as `python -m`, `__name__` is `"__main__"` and deriving from it collapses the two.

    Measured on the first live pass of `T-03.7`: with the application logger derived from
    `__name__`, the `stderr` handler landed on the PRODUCT logger and every canonical JSON line
    was emitted twice, once per stream. `ADR-008/DoD-2` hashes those bytes, and a duplicated
    line matches no `sha256`.
    """
    assert quota_ramp_cli.logger.name != quota_ramp_cli._APPLICATION_LOGGER
    assert quota_ramp_cli._APPLICATION_LOGGER == "src"
    assert quota_ramp_cli.logger.name.startswith(f"{quota_ramp_cli._APPLICATION_LOGGER}.")


def test_the_stream_wiring_keeps_diagnostics_off_the_product_stream() -> None:
    """A host that configured INFO on `stdout` must not contaminate the first JSON line."""
    application = logging.getLogger("src")
    before = list(application.handlers)
    propagate_before = application.propagate
    try:
        quota_ramp_cli.route_diagnostics_away_from_the_product_stream()
        assert application.propagate is False
        assert len(application.handlers) == len(before) + 1
    finally:
        application.handlers = before
        application.propagate = propagate_before


def test_the_real_clock_refuses_a_negative_pause() -> None:
    """A clock skew must produce a refusal, never an instant return that fakes a recoil."""
    with pytest.raises(ValueError, match="negativa"):
        SystemRampClock().sleep(-1.0)


def test_the_real_clock_separates_monotonic_from_wall_clock() -> None:
    """Two sources on purpose: durations cannot use a clock NTP is allowed to step."""
    clock = SystemRampClock()

    assert clock.monotonic() != clock.epoch()
    assert clock.epoch() > 1_700_000_000.0
    clock.sleep(0.0)


def test_the_declared_probe_path_of_every_bucket_stays_inside_its_own_family() -> None:
    """A path that wandered into another family would spend the wrong bucket, silently."""
    for bucket in (BINANCE_FAPI, BINANCE_FUTURES_DATA, COINALYZE):
        assert isinstance(bucket, QuotaBucket)
        assert quota_ramp_cli._PROBE_PATHS[bucket.identifier].startswith(bucket.path_prefix)


def test_a_factory_that_cannot_even_open_is_reported_as_a_transport_failure() -> None:
    """`_drop` must survive a host that never made it into the connection table."""

    def refusing_factory(host: str) -> FakeConnection:
        raise ConnectionRefusedError(f"connection refused: {host}")

    probe = HttpsQuotaProbe(environment={}, connection_factory=refusing_factory)

    observation = probe.probe(BINANCE_FAPI, "/fapi/v1/depth")

    assert observation.status is None
    assert observation.transport_error is not None
    assert "ConnectionRefusedError" in observation.transport_error
    probe.close()


def test_the_coupling_reading_is_absent_when_the_transport_dies() -> None:
    """A dead read is `None`, which the domain turns into INCONCLUSIVE — never into a zero."""
    probe = ScriptedProbe([ConnectionResetError("reset")])

    assert _read_counter(probe, BINANCE_FAPI, "/fapi/v1/depth") is None


def test_the_coupling_reading_is_absent_when_the_counter_header_is_missing() -> None:
    """A `200` with no counter is exactly what a BLIND bucket looks like."""
    probe = ScriptedProbe([accepted({"server": "nginx"})])

    assert _read_counter(probe, BINANCE_FAPI, "/fapi/v1/depth") is None


def test_the_coupling_reading_is_absent_when_the_counter_is_not_a_number() -> None:
    """Junk in the counter is no reading; reading it as zero would fake a window reset."""
    probe = ScriptedProbe([accepted({USED_WEIGHT_HEADER: "muitos"})])

    assert _read_counter(probe, BINANCE_FAPI, "/fapi/v1/depth") is None


def test_main_wires_the_streams_and_refuses_an_unknown_command_offline() -> None:
    """`main` is reachable offline because the connection is opened LAZILY, on the first probe."""
    application = logging.getLogger("src")
    handlers_before = list(application.handlers)
    propagate_before = application.propagate
    product_handlers_before = list(quota_ramp_cli.logger.handlers)
    product_propagate_before = quota_ramp_cli.logger.propagate
    try:
        with pytest.raises(SystemExit):
            quota_ramp_cli.main(["nao-existe"])
        assert application.propagate is False
        assert quota_ramp_cli.logger.propagate is False
    finally:
        application.handlers = handlers_before
        application.propagate = propagate_before
        quota_ramp_cli.logger.handlers = product_handlers_before
        quota_ramp_cli.logger.propagate = product_propagate_before
