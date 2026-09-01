"""Offline bench for the `T-03.2` collector: `!forceOrder@arr`, raw, enveloped, connectivity-only.

ZERO REDE, like the rest of this suite (`backend/scripts/test.sh`). The central property under
test is the one that makes this collector DIFFERENT from `T-03.1`'s `nq` probe: a whole-market
liquidation stream is sparse, so an open handshake with ZERO messages in the window must be
reported as `CONNECTED` (an honest quiet market), never collapsed with a transport failure the
way `T-03.1` collapses "zero `aggTrade` frames" into `NOT_MEASURED`. Every control below that
touches that boundary is a two-sided check: connected+quiet is one outcome, handshake-failed is
a DIFFERENT one, and the two must never be confused by the same code path.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

import pytest

from src.modules.sentimento.domain.force_order_capture_outcome import (
    ForceOrderConnected,
    ForceOrderNotConnected,
)
from src.modules.sentimento.domain.force_order_envelope import (
    DOC_SNAPSHOT_DATE,
    FORCE_ORDER_ENVELOPE_COLUMNS,
    STREAM_NAME,
    SUBSAMPLING_SEMANTICS_LABEL,
    ForceOrderEnvelope,
)
from src.modules.sentimento.domain.stream_probe_outcome import ProbeStage, WindowEnd
from src.modules.sentimento.infra.binance_stream_probe import WebSocketMessageSource
from src.modules.sentimento.infra.force_order_collector_cli import (
    _report_lines,
    _summary,
    build_parser,
    main,
)
from src.modules.sentimento.infra.force_order_raw_recorder import (
    ForceOrderRawRecorder,
    force_order_stream_path,
)
from src.modules.sentimento.infra.rfc6455_client import expected_accept
from src.modules.sentimento.use_cases.capture_force_order_stream import (
    capture_force_order_connectivity,
)
from src.modules.sentimento.use_cases.probe_stream_quantity_fields import StreamTransportError

# ── A raw !forceOrder@arr frame, shaped per Binance docs, kept as a plain string ─────────────
# This collector NEVER parses this shape — it is here only to prove `raw` survives verbatim.
RAW_FORCE_ORDER_FRAME = (
    '{"e":"forceOrder","E":1788015474886,"o":{"s":"BTCUSDT","S":"SELL","o":"LIMIT",'
    '"f":"IOC","q":"0.010","p":"78000.00","ap":"78006.30","X":"FILLED","l":"0.010",'
    '"z":"0.010","T":1788015474886}}'
)


class FakeSource:
    """A `MessageSource` that replays scripted frames, or fails at a chosen stage."""

    def __init__(self, frames: list[str], fail_at: ProbeStage | None = None) -> None:
        """Script the frames to replay and, optionally, the stage to fail at on `open`."""
        self._frames = frames
        self._fail_at = fail_at
        self.closed = False

    def open(self) -> None:
        """Fail at the scripted stage, if one was given."""
        if self._fail_at is not None:
            raise StreamTransportError(self._fail_at, "falha injetada pela bancada")

    def close(self) -> None:
        """Record that the source was released."""
        self.closed = True

    def messages(self) -> Iterator[str]:
        """Replay the scripted frames."""
        yield from self._frames


class _Clock:
    """A deterministic `now()` that advances through `ticks`, holding the last value past them.

    Holding the last tick (instead of raising `StopIteration`) means a test only has to declare
    the ticks that matter to the assertion — any extra `now()` call the implementation happens
    to make afterward reads as "still past the threshold", never as a bench artifact.
    """

    def __init__(self, *ticks: float) -> None:
        """Script the sequence of clock reads."""
        self._ticks = list(ticks)
        self._at = 0

    def __call__(self) -> float:
        """Return the next scripted tick, or the last one if the script ran out."""
        value = self._ticks[min(self._at, len(self._ticks) - 1)]
        self._at += 1
        return value


class ExplodingSource(FakeSource):
    """A source that yields some frames, then fails mid-stream."""

    def __init__(self, frames: list[str], stage: ProbeStage) -> None:
        """Script the frames to yield before failing at `stage`."""
        super().__init__(frames)
        self._stage = stage

    def messages(self) -> Iterator[str]:
        """Yield the scripted frames, then raise."""
        yield from self._frames
        raise StreamTransportError(self._stage, "conexao caiu no meio")


# ── Domain: the envelope carries the four columns, in the fixed order ───────────────────────


def test_the_envelope_defaults_carry_the_declared_provenance() -> None:
    """A bare envelope still carries stream, doc snapshot and the unresolved-semantics label."""
    envelope = ForceOrderEnvelope(raw=RAW_FORCE_ORDER_FRAME, received_at="2026-08-29T00:00:00Z")
    assert envelope.stream == STREAM_NAME == "!forceOrder@arr"
    assert envelope.doc_snapshot_date == DOC_SNAPSHOT_DATE
    assert envelope.subsampling_semantics_label == SUBSAMPLING_SEMANTICS_LABEL
    assert "NAO_RESOLVIDA" in SUBSAMPLING_SEMANTICS_LABEL
    assert "latest" in SUBSAMPLING_SEMANTICS_LABEL and "largest" in SUBSAMPLING_SEMANTICS_LABEL


def test_as_dict_projects_the_five_columns_in_the_fixed_order() -> None:
    """`as_dict()` returns exactly `FORCE_ORDER_ENVELOPE_COLUMNS`, in that order, raw untouched."""
    envelope = ForceOrderEnvelope(raw=RAW_FORCE_ORDER_FRAME, received_at="2026-08-29T00:00:01Z")
    projected = envelope.as_dict()
    assert list(projected.keys()) == list(FORCE_ORDER_ENVELOPE_COLUMNS)
    assert projected["raw"] == RAW_FORCE_ORDER_FRAME
    assert projected["received_at"] == "2026-08-29T00:00:01Z"
    assert projected["subsampling_semantics_label"] == SUBSAMPLING_SEMANTICS_LABEL


# ── Domain: `window_complete` is true only for a DECLARED end ───────────────────────────────


@pytest.mark.parametrize(
    ("window_end", "complete"),
    [
        (WindowEnd.WINDOW_ELAPSED, True),
        (WindowEnd.MESSAGE_CAP, True),
        (WindowEnd.STREAM_ENDED, False),
        (WindowEnd.INTERRUPTED, False),
    ],
)
def test_window_complete_is_true_only_for_a_declared_end(
    window_end: WindowEnd, complete: bool
) -> None:
    """Only a time-elapsed or cap-hit window counts as complete; the other two do not."""
    outcome = ForceOrderConnected(messages_captured=0, window_end=window_end, observed_seconds=1.0)
    assert outcome.window_complete is complete


# ── Use case: connected-but-quiet is NOT a failure — the central property of this task ───────


def test_zero_messages_in_the_window_is_connected_not_unmeasured() -> None:
    """An open handshake with nothing to liquidate is `ForceOrderConnected`, n=0.

    THE control that distinguishes this collector from `T-03.1`'s `nq` probe: there, an empty
    window is `NOT_MEASURED` (a stream that should always speak went silent). Here, silence IS
    the expected shape of a whole-market liquidation stream over a short window, and reporting
    it as a transport failure would poison `T-03.3`'s reconnect-collision counting with false
    disconnects.
    """
    outcome = capture_force_order_connectivity(
        FakeSource([]), window_seconds=5.0, max_messages=50, now=_Clock(0.0, 5.0)
    )
    assert isinstance(outcome, ForceOrderConnected)
    assert outcome.messages_captured == 0
    assert outcome.window_end is WindowEnd.STREAM_ENDED
    assert outcome.observed_seconds == 5.0


def test_the_window_stops_the_collection_once_the_clock_passes_it() -> None:
    """A window that elapses mid-stream ends at `WINDOW_ELAPSED`, keeping what arrived."""
    outcome = capture_force_order_connectivity(
        FakeSource([RAW_FORCE_ORDER_FRAME, RAW_FORCE_ORDER_FRAME]),
        window_seconds=5.0,
        max_messages=50,
        now=_Clock(0.0, 0.0, 6.0),
    )
    assert isinstance(outcome, ForceOrderConnected)
    assert outcome.messages_captured == 2
    assert outcome.window_end is WindowEnd.WINDOW_ELAPSED


def test_the_message_cap_stops_the_collection_before_the_window() -> None:
    """Hitting `max_messages` ends the window at `MESSAGE_CAP`, not `WINDOW_ELAPSED`."""
    outcome = capture_force_order_connectivity(
        FakeSource([RAW_FORCE_ORDER_FRAME, RAW_FORCE_ORDER_FRAME, RAW_FORCE_ORDER_FRAME]),
        window_seconds=999.0,
        max_messages=2,
        now=lambda: 0.0,
    )
    assert isinstance(outcome, ForceOrderConnected)
    assert outcome.messages_captured == 2
    assert outcome.window_end is WindowEnd.MESSAGE_CAP


@pytest.mark.parametrize("stage", list(ProbeStage))
def test_a_handshake_failure_at_any_stage_is_not_connected(stage: ProbeStage) -> None:
    """Every stage the handshake can fail at is reported, never silently swallowed."""
    outcome = capture_force_order_connectivity(
        FakeSource([], fail_at=stage), window_seconds=5.0, max_messages=10, now=lambda: 0.0
    )
    assert isinstance(outcome, ForceOrderNotConnected)
    assert outcome.failed_stage is stage


def test_the_source_is_closed_even_when_the_handshake_failed() -> None:
    """A failed `open` must not leak the channel."""
    source = FakeSource([], fail_at=ProbeStage.TLS)
    capture_force_order_connectivity(source, window_seconds=5.0, max_messages=10, now=lambda: 0.0)
    assert source.closed


def test_a_connection_lost_after_messages_keeps_what_was_captured() -> None:
    """A transport failure mid-window is `INTERRUPTED`, and the raw count survives it."""
    source = ExplodingSource([RAW_FORCE_ORDER_FRAME], ProbeStage.FRAME)
    outcome = capture_force_order_connectivity(
        source, window_seconds=999.0, max_messages=999, now=lambda: 0.0
    )
    assert isinstance(outcome, ForceOrderConnected)
    assert outcome.messages_captured == 1
    assert outcome.window_end is WindowEnd.INTERRUPTED
    assert outcome.interrupted_at_stage is ProbeStage.FRAME
    assert outcome.window_complete is False
    assert source.closed


# ── Infra: the path is single-stream, whole-market, no symbol to enumerate ───────────────────


def test_the_stream_path_names_the_whole_market_stream_with_no_symbol() -> None:
    """Unlike `combined_stream_path` (`T-03.1`), there is no symbol list to build."""
    assert force_order_stream_path() == "/ws/!forceOrder@arr"
    assert force_order_stream_path("bookTicker") == "/ws/bookTicker"


# ── Infra: the recorder writes the envelope, verbatim raw, correct order ────────────────────


def test_the_recorder_writes_every_raw_message_enveloped(tmp_path: Path) -> None:
    """Each line is the envelope's 5 columns, `raw` kept byte-for-byte."""
    evidence = tmp_path / "amostra" / "raw.jsonl"
    clock = iter(["2026-08-29T00:00:00+00:00", "2026-08-29T00:00:01+00:00"])
    recorder = ForceOrderRawRecorder(
        FakeSource([RAW_FORCE_ORDER_FRAME, RAW_FORCE_ORDER_FRAME]), evidence, lambda: next(clock)
    )
    recorder.open()
    assert list(recorder.messages()) == [RAW_FORCE_ORDER_FRAME, RAW_FORCE_ORDER_FRAME]
    recorder.close()
    lines = [json.loads(line) for line in evidence.read_text(encoding="utf-8").splitlines()]
    assert len(lines) == 2
    assert list(lines[0].keys()) == list(FORCE_ORDER_ENVELOPE_COLUMNS)
    assert lines[0]["received_at"] == "2026-08-29T00:00:00+00:00"
    assert lines[1]["received_at"] == "2026-08-29T00:00:01+00:00"
    assert lines[0]["raw"] == RAW_FORCE_ORDER_FRAME
    assert lines[0]["stream"] == "!forceOrder@arr"
    assert lines[0]["doc_snapshot_date"] == DOC_SNAPSHOT_DATE
    assert lines[0]["subsampling_semantics_label"] == SUBSAMPLING_SEMANTICS_LABEL


def test_zero_messages_writes_no_file_at_all(tmp_path: Path) -> None:
    """A quiet window never even creates the evidence file — nothing to append."""
    evidence = tmp_path / "amostra" / "raw.jsonl"
    recorder = ForceOrderRawRecorder(FakeSource([]), evidence, lambda: "x")
    recorder.open()
    assert not list(recorder.messages())
    recorder.close()
    assert not evidence.exists()


# ── Control: the live transport, driven over a fake channel (same discipline as `T-03.1`) ───


class FakeChannel:
    """A channel that answers the handshake correctly, then serves scripted frames."""

    def __init__(self, frames: bytes = b"", *, answer_handshake: bool = True) -> None:
        """Script the frames to serve after a successful upgrade."""
        self._frames = frames
        self._answer = answer_handshake
        self.script = bytearray()
        self.sent = b""
        self.closed = False

    def sendall(self, data: bytes, /) -> None:
        """Answer the upgrade request in the SAME buffer as the first frame."""
        self.sent += data
        if not self._answer:
            return
        key = data.decode().split("Sec-WebSocket-Key: ")[1].split("\r\n")[0]
        head = (
            f"HTTP/1.1 101 Switching Protocols\r\n"
            f"Sec-WebSocket-Accept: {expected_accept(key)}\r\n\r\n"
        ).encode()
        self.script.extend(head + self._frames)

    def recv(self, size: int, /) -> bytes:
        """Hand back the next slice of the script."""
        chunk = bytes(self.script[:size])
        del self.script[:size]
        return chunk

    def close(self) -> None:
        """Mark the channel closed."""
        self.closed = True


def _server_frame(payload: bytes, opcode: int = 0x1, fin: bool = True) -> bytes:
    """Build an UNMASKED server frame, choosing the length encoding by size."""
    head = bytes([(0x80 if fin else 0x00) | opcode])
    if len(payload) < 126:
        return head + bytes([len(payload)]) + payload
    if len(payload) < 1 << 16:
        return head + bytes([126]) + len(payload).to_bytes(2, "big") + payload
    return head + bytes([127]) + len(payload).to_bytes(8, "big") + payload


def test_the_live_source_sends_a_well_formed_upgrade_request_for_the_whole_market_stream() -> None:
    """The upgrade request targets `/ws/!forceOrder@arr`, not a per-symbol path."""
    channel = FakeChannel(_server_frame(RAW_FORCE_ORDER_FRAME.encode()))
    source = WebSocketMessageSource("exemplo.com", force_order_stream_path(), lambda: channel)
    source.open()
    assert channel.sent.decode().startswith("GET /ws/!forceOrder@arr HTTP/1.1\r\n")
    assert next(source.messages()) == RAW_FORCE_ORDER_FRAME
    source.close()


# ── CLI: the report and summary carry the label and the universe ────────────────────────────


def test_the_parser_defaults_name_the_declared_stream_and_a_short_window(tmp_path: Path) -> None:
    """Defaults ARE the declared universe: the whole-market stream, a short window."""
    args = build_parser().parse_args(["--evidence", str(tmp_path / "x.jsonl")])
    assert args.stream == "!forceOrder@arr"
    assert args.seconds == 20.0
    assert args.max_messages == 50


def test_report_of_a_connected_but_quiet_run_explains_that_zero_is_not_a_failure(
    tmp_path: Path,
) -> None:
    """The report of `n=0` explicitly says this is not a transport problem."""
    args = build_parser().parse_args(["--evidence", str(tmp_path / "x.jsonl")])
    outcome = ForceOrderConnected(
        messages_captured=0, window_end=WindowEnd.WINDOW_ELAPSED, observed_seconds=20.0
    )
    lines = _report_lines(outcome, args)
    assert any("CONECTADO" in line for line in lines)
    assert any("NAO e falha de conectividade" in line for line in lines)
    assert any(SUBSAMPLING_SEMANTICS_LABEL in line for line in lines)
    assert any(DOC_SNAPSHOT_DATE in line for line in lines)


def test_report_of_a_failed_handshake_names_the_stage(tmp_path: Path) -> None:
    """A `NOT_CONECTADO` report names the failing stage and never claims a quiet market."""
    args = build_parser().parse_args(["--evidence", str(tmp_path / "x.jsonl")])
    outcome = ForceOrderNotConnected(failed_stage=ProbeStage.TLS, detail="timeout")
    lines = _report_lines(outcome, args)
    assert any("NAO_CONECTADO" in line for line in lines)
    assert any("TLS" in line for line in lines)
    assert not any("NAO e falha de conectividade" in line for line in lines)


def test_summary_of_a_connected_run_carries_the_envelope_columns(tmp_path: Path) -> None:
    """The machine summary carries the label and snapshot date next to the connectivity facts."""
    args = build_parser().parse_args(["--evidence", str(tmp_path / "x.jsonl")])
    outcome = ForceOrderConnected(
        messages_captured=3, window_end=WindowEnd.MESSAGE_CAP, observed_seconds=1.5
    )
    summary = _summary(outcome, args)
    assert summary["connected"] is True
    assert summary["messages_captured"] == 3
    assert summary["subsampling_semantics_label"] == SUBSAMPLING_SEMANTICS_LABEL
    assert summary["doc_snapshot_date"] == DOC_SNAPSHOT_DATE


def test_summary_of_a_failed_run_carries_the_stage_instead_of_counts(tmp_path: Path) -> None:
    """A failure summary names the stage and holds no message count to be misread."""
    args = build_parser().parse_args(["--evidence", str(tmp_path / "x.jsonl")])
    summary = _summary(ForceOrderNotConnected(ProbeStage.DNS, "sem resolucao"), args)
    assert summary["connected"] is False
    assert summary["failed_stage"] == "DNS"
    assert "messages_captured" not in summary


# ── CLI: end-to-end, OFFLINE, both outcomes ──────────────────────────────────────────────────


def test_the_cli_writes_evidence_and_exits_zero_when_connected_with_a_message(
    tmp_path: Path,
) -> None:
    """END TO END, OFFLINE: a connected run with one frame writes evidence and exits `rc=0`."""
    evidence, summary = tmp_path / "raw.jsonl", tmp_path / "sum.json"
    frame = _server_frame(RAW_FORCE_ORDER_FRAME.encode())
    code = main(
        [
            "--seconds",
            "1",
            "--max-messages",
            "1",
            "--evidence",
            str(evidence),
            "--summary",
            str(summary),
        ],
        lambda host: lambda: FakeChannel(frame),
    )
    assert code == 0
    written_summary = json.loads(summary.read_text())
    assert written_summary["connected"] is True
    assert written_summary["messages_captured"] == 1
    recorded = json.loads(evidence.read_text().splitlines()[0])
    assert recorded["raw"] == RAW_FORCE_ORDER_FRAME
    assert recorded["stream"] == "!forceOrder@arr"


def test_the_cli_exits_zero_and_writes_no_evidence_when_connected_but_quiet(
    tmp_path: Path,
) -> None:
    """A connected run that sees nothing within the window is STILL `rc=0` — connectivity held."""
    evidence, summary = tmp_path / "raw.jsonl", tmp_path / "sum.json"
    code = main(
        ["--seconds", "0", "--evidence", str(evidence), "--summary", str(summary)],
        lambda host: lambda: FakeChannel(b""),
    )
    assert code == 0
    assert json.loads(summary.read_text())["messages_captured"] == 0
    assert not evidence.exists()


def test_the_cli_exits_three_when_the_handshake_never_completes(tmp_path: Path) -> None:
    """`rc=3` means the handshake failed — never "the market is quiet"."""
    code = main(
        ["--evidence", str(tmp_path / "r.jsonl")],
        lambda host: lambda: FakeChannel(b"", answer_handshake=False),
    )
    assert code == 3
