"""`infra` wired end to end with a FAKE connection — zero socket, per `backend/scripts/test.sh`."""

from __future__ import annotations

import argparse
import json
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path

import pytest

from src.modules.sentimento.domain.premium_index_batch import (
    PREMIUM_INDEX_ENDPOINT,
    parse_premium_index_batch,
)
from src.modules.sentimento.infra.premium_index_http_client import (
    PREMIUM_INDEX_HOST,
    PremiumIndexHttpClient,
)
from src.modules.sentimento.infra.premium_index_jsonl_sink import PremiumIndexJsonlSink
from src.modules.sentimento.infra.premium_index_probe_cli import build_parser, main, run
from src.modules.sentimento.use_cases.collect_premium_index import (
    PremiumIndexCycleStage,
    RawPremiumIndexFetch,
)

_ONE_SYMBOL_BODY = (
    b'[{"symbol":"BTCUSDT","markPrice":"1","indexPrice":"1","estimatedSettlePrice":"1",'
    b'"lastFundingRate":"0.0001","interestRate":"0.0001","nextFundingTime":1,"time":1}]'
)


# ── Fakes, matching the shape `test_quota_ramp_bench_offline.py` already established ────────


class FakeResponse:
    """A canned response; must be `read()` before the connection is considered done."""

    def __init__(self, status: int, headers: Sequence[tuple[str, str]], body: bytes) -> None:
        """Take the status line, header pairs and body to hand back."""
        self.status = status
        self._headers = list(headers)
        self._body = body

    def getheaders(self) -> list[tuple[str, str]]:
        """Return the header pairs, repeats included."""
        return list(self._headers)

    def read(self) -> bytes:
        """Return the canned body."""
        return self._body


class FakeConnection:
    """Never opens a socket; replays scripted responses or raises scripted `OSError`s."""

    def __init__(self, host: str, responses: Sequence[FakeResponse | OSError]) -> None:
        """Take the host it pretends to serve and the responses to replay, in order."""
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


# ── `PremiumIndexHttpClient` ─────────────────────────────────────────────────────────────────


def test_fetch_requests_the_bare_endpoint_with_no_query_string() -> None:
    """The batch call never carries `symbol`, `startTime` or `endTime` — none exist to send."""
    connections: list[FakeConnection] = []

    def factory(host: str) -> FakeConnection:
        connection = FakeConnection(host, [FakeResponse(200, [], _ONE_SYMBOL_BODY)])
        connections.append(connection)
        return connection

    client = PremiumIndexHttpClient(connection_factory=factory)
    client.fetch()

    assert connections[0].host == PREMIUM_INDEX_HOST
    method, url, headers = connections[0].requests[0]
    assert method == "GET"
    assert url == PREMIUM_INDEX_ENDPOINT
    assert "?" not in url
    assert headers["Accept"] == "application/json"


def test_fetch_returns_status_headers_and_body_on_success() -> None:
    """A successful fetch carries everything `collect_premium_index_once` needs to parse it."""
    client = PremiumIndexHttpClient(
        connection_factory=lambda host: FakeConnection(
            host, [FakeResponse(200, [("x-mbx-used-weight-1m", "10")], _ONE_SYMBOL_BODY)]
        )
    )

    fetch = client.fetch()

    assert fetch.status == 200
    assert fetch.body == _ONE_SYMBOL_BODY
    assert fetch.header("x-mbx-used-weight-1m") == "10"
    assert fetch.transport_error is None


def test_fetch_converts_oserror_to_a_transport_error_and_drops_the_connection() -> None:
    """A dead socket becomes a `transport_error`, never an uncaught exception."""
    connection = FakeConnection("fapi.binance.com", [ConnectionResetError("peer closed")])
    client = PremiumIndexHttpClient(connection_factory=lambda host: connection)

    fetch = client.fetch()

    assert fetch.status is None
    assert fetch.transport_error is not None and "ConnectionResetError" in fetch.transport_error
    assert connection.closed is True


def test_fetch_reopens_a_fresh_connection_after_a_transport_failure() -> None:
    """The client must not keep retrying a connection it already dropped."""
    made: list[FakeConnection] = []

    def factory(host: str) -> FakeConnection:
        if not made:
            made.append(FakeConnection(host, [OSError("first call dies")]))
        else:
            made.append(FakeConnection(host, [FakeResponse(200, [], _ONE_SYMBOL_BODY)]))
        return made[-1]

    client = PremiumIndexHttpClient(connection_factory=factory)
    first = client.fetch()
    second = client.fetch()

    assert first.transport_error is not None
    assert second.status == 200
    assert len(made) == 2, "a segunda chamada tem de abrir uma conexao NOVA"


# ── `PremiumIndexJsonlSink` — content only; durability lives in `test_infrastructure_durability` ──


def test_sink_writes_one_line_per_symbol_with_received_at_attached(tmp_path: Path) -> None:
    """Each symbol of a batch becomes its own line, independently readable."""
    sink = PremiumIndexJsonlSink(tmp_path / "premium_index.jsonl")
    readings = parse_premium_index_batch(json.loads(_ONE_SYMBOL_BODY))

    sink.write(1_700_000_000_000, readings)

    lines = sink.path.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1
    row = json.loads(lines[0])
    assert row["received_at"] == 1_700_000_000_000
    assert row["symbol"] == "BTCUSDT"
    assert row["last_funding_rate_raw"] == "0.0001"


def test_sink_appends_across_cycles_without_truncating(tmp_path: Path) -> None:
    """A second `write()` call appends; it does not overwrite the first cycle's rows."""
    sink = PremiumIndexJsonlSink(tmp_path / "premium_index.jsonl")
    readings = parse_premium_index_batch(json.loads(_ONE_SYMBOL_BODY))

    sink.write(1_000, readings)
    sink.write(2_000, readings)

    lines = sink.path.read_text(encoding="utf-8").splitlines()
    assert [json.loads(line)["received_at"] for line in lines] == [1_000, 2_000]


# ── `premium_index_probe_cli` — the reproducible weight-delta measurement, offline ──────────


class _ScriptedFetcher:
    """Replays scripted `RawPremiumIndexFetch` results in order, one per `fetch()` call."""

    def __init__(self, fetches: Sequence[RawPremiumIndexFetch]) -> None:
        """Bind the scripted sequence."""
        self._fetches = list(fetches)
        self.closed = False

    def fetch(self) -> RawPremiumIndexFetch:
        """Pop and return the next scripted fetch."""
        return self._fetches.pop(0)

    def close(self) -> None:
        """Record that the CLI closed this fetcher."""
        self.closed = True


class _InMemorySink:
    """Discards nothing to disk; the probe CLI's evidence path is not under test here."""

    def __init__(self, path: Path) -> None:
        """Accept and ignore the path — a real sink needs it, this fake does not."""
        self.path = path
        self.calls: list[int] = []

    def write(self, received_at: int, readings: object) -> None:
        """Record that a write happened."""
        self.calls.append(received_at)


def _args(tmp_path: Path, cycles: int = 2) -> argparse.Namespace:
    return build_parser().parse_args(
        ["--cycles", str(cycles), "--evidence", str(tmp_path / "evidence.jsonl")]
    )


def _clock() -> Callable[[], int]:
    ticks = iter([1_000, 2_000, 3_000, 4_000])
    return lambda: next(ticks)


def test_probe_cli_confirms_a_weight_delta_of_ten(tmp_path: Path) -> None:
    """Two consecutive weight readings 10 apart CONFIRM `CA-F0-1b`."""
    fetcher = _ScriptedFetcher(
        [
            RawPremiumIndexFetch(
                status=200, body=_ONE_SYMBOL_BODY, headers={"x-mbx-used-weight-1m": "31"}
            ),
            RawPremiumIndexFetch(
                status=200, body=_ONE_SYMBOL_BODY, headers={"x-mbx-used-weight-1m": "41"}
            ),
        ]
    )
    args = _args(tmp_path)

    results = run(
        args,
        fetcher_factory=lambda: fetcher,
        sink_factory=_InMemorySink,
        clock=_clock(),
        sleep=lambda seconds: None,
    )

    assert [r.weight_used for r in results] == [31, 41]
    assert fetcher.closed is True


def test_probe_cli_main_returns_zero_when_confirmed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`main()` maps a confirmed delta onto `rc=0`."""
    fetches = [
        RawPremiumIndexFetch(
            status=200, body=_ONE_SYMBOL_BODY, headers={"x-mbx-used-weight-1m": "31"}
        ),
        RawPremiumIndexFetch(
            status=200, body=_ONE_SYMBOL_BODY, headers={"x-mbx-used-weight-1m": "41"}
        ),
    ]
    monkeypatch.setattr(
        "src.modules.sentimento.infra.premium_index_probe_cli.PremiumIndexHttpClient",
        lambda: _ScriptedFetcher(fetches),
    )
    monkeypatch.setattr(
        "src.modules.sentimento.infra.premium_index_probe_cli.PremiumIndexJsonlSink",
        _InMemorySink,
    )
    monkeypatch.setattr("time.sleep", lambda seconds: None)

    rc = main(["--cycles", "2", "--evidence", str(tmp_path / "evidence.jsonl")])

    assert rc == 0


def test_probe_cli_main_returns_one_when_delta_diverges(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A delta that is NOT 10 is the falsifier this probe exists to be able to report."""
    fetches = [
        RawPremiumIndexFetch(
            status=200, body=_ONE_SYMBOL_BODY, headers={"x-mbx-used-weight-1m": "31"}
        ),
        RawPremiumIndexFetch(
            status=200, body=_ONE_SYMBOL_BODY, headers={"x-mbx-used-weight-1m": "55"}
        ),
    ]
    monkeypatch.setattr(
        "src.modules.sentimento.infra.premium_index_probe_cli.PremiumIndexHttpClient",
        lambda: _ScriptedFetcher(fetches),
    )
    monkeypatch.setattr(
        "src.modules.sentimento.infra.premium_index_probe_cli.PremiumIndexJsonlSink",
        _InMemorySink,
    )
    monkeypatch.setattr("time.sleep", lambda seconds: None)

    rc = main(["--cycles", "2", "--evidence", str(tmp_path / "evidence.jsonl")])

    assert rc == 1


def test_probe_cli_main_returns_three_when_every_cycle_fails_to_dispatch(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Silence about the network is `rc=3`, never conflated with a measured mismatch."""
    fetches = [
        RawPremiumIndexFetch(transport_error="TimeoutError: a"),
        RawPremiumIndexFetch(transport_error="TimeoutError: b"),
    ]
    monkeypatch.setattr(
        "src.modules.sentimento.infra.premium_index_probe_cli.PremiumIndexHttpClient",
        lambda: _ScriptedFetcher(fetches),
    )
    monkeypatch.setattr(
        "src.modules.sentimento.infra.premium_index_probe_cli.PremiumIndexJsonlSink",
        _InMemorySink,
    )
    monkeypatch.setattr("time.sleep", lambda seconds: None)

    rc = main(["--cycles", "2", "--evidence", str(tmp_path / "evidence.jsonl")])

    assert rc == 3


def test_probe_cli_writes_a_summary_with_the_measured_delta(tmp_path: Path) -> None:
    """`--summary` carries the delta and the declared expectation side by side, machine-readable."""
    fetcher = _ScriptedFetcher(
        [
            RawPremiumIndexFetch(
                status=200, body=_ONE_SYMBOL_BODY, headers={"x-mbx-used-weight-1m": "31"}
            ),
            RawPremiumIndexFetch(
                status=200, body=_ONE_SYMBOL_BODY, headers={"x-mbx-used-weight-1m": "41"}
            ),
        ]
    )
    args = build_parser().parse_args(
        [
            "--cycles",
            "2",
            "--evidence",
            str(tmp_path / "evidence.jsonl"),
            "--summary",
            str(tmp_path / "summary.json"),
        ]
    )

    run(
        args,
        fetcher_factory=lambda: fetcher,
        sink_factory=_InMemorySink,
        clock=_clock(),
        sleep=lambda seconds: None,
    )

    summary = json.loads((tmp_path / "summary.json").read_text(encoding="utf-8"))
    assert summary["weight_deltas"] == [10]
    assert summary["declared_weight_per_call"] == 10
    assert summary["weight_confirmed"] is True


def test_a_single_cycle_cannot_compute_a_delta_and_is_not_read_as_zero(tmp_path: Path) -> None:
    """One cycle has no PAIR to compute a delta from — that is `NOT comparable`, not `0`."""
    fetcher = _ScriptedFetcher(
        [
            RawPremiumIndexFetch(
                status=200, body=_ONE_SYMBOL_BODY, headers={"x-mbx-used-weight-1m": "31"}
            )
        ]
    )
    args = _args(tmp_path, cycles=1)

    results = run(
        args,
        fetcher_factory=lambda: fetcher,
        sink_factory=_InMemorySink,
        clock=_clock(),
        sleep=lambda seconds: None,
    )

    assert len(results) == 1
    assert results[0].stage == PremiumIndexCycleStage.WRITTEN
