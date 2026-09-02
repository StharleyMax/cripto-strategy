"""Offline bench for the `D3.9` probe: the instrument must DISCRIMINATE, not merely run.

ZERO REDE, like the rest of this suite. Every byte here was captured live on 2026-08-29 and is
reproduced verbatim, so the parser is exercised against what Binance actually sent rather than
against what this repository imagines it sends.

WHAT THIS BENCH IS FOR. A probe that answers "no `nq`" is worthless unless it can be shown to
answer something ELSE under a different input. Each block below is a two-sided control: the same
code path, two inputs, two different verdicts. A control that returned the same value on both
sides would prove nothing, which is the failure this repository has paid for twelve times.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

import pytest

from src.modules.sentimento.domain.binance_aggtrade_payload import (
    FieldPresence,
    QuantityRelation,
    read_quantity_fields,
)
from src.modules.sentimento.domain.stream_probe_outcome import (
    DeclaredUniverse,
    NqVerdict,
    ProbeMeasured,
    ProbeNotMeasured,
    ProbeStage,
    SymbolBreakdown,
    WindowEnd,
)
from src.modules.sentimento.infra.aggtrade_nq_probe_cli import (
    _report_lines,
    _summary,
    build_parser,
    main,
)
from src.modules.sentimento.infra.binance_stream_probe import (
    RecordingMessageSource,
    WebSocketMessageSource,
    combined_stream_path,
)
from src.modules.sentimento.infra.rfc6455_client import (
    build_handshake_request,
    expected_accept,
    iter_text_messages,
    new_client_key,
    read_frame,
    verify_handshake_response,
)
from src.modules.sentimento.use_cases.probe_stream_quantity_fields import (
    StreamTransportError,
    probe_stream_quantity_fields,
)

# ── Bytes captured live on 2026-08-29, kept VERBATIM ────────────────────────────────────────
# REST futures aggTrade, the shape `ADR-001` measured: eight fields, `nq` among them.
REST_FUTURES_WITH_NQ = (
    '{"a":3432664892,"p":"78006.30","q":"0.128","nq":"0.128","f":8032009843,'
    '"l":8032009843,"T":1788015474886,"m":false}'
)
# WS SPOT aggTrade, wrapped in the combined-stream envelope. No `nq` in the spot product.
WS_SPOT_AGGTRADE = (
    '{"stream":"ethusdt@aggTrade","data":{"e":"aggTrade","E":1788016126179,"s":"ETHUSDT",'
    '"a":2068780794,"p":"2443.67000000","q":"0.35870000","f":4317068264,"l":4317068278,'
    '"T":1788016126178,"m":false,"M":true}}'
)
# WS futures bookTicker — the live NEGATIVE CONTROL: a real connection carrying no `nq`.
WS_FUTURES_BOOKTICKER = (
    '{"stream":"btcusdt@bookTicker","data":{"e":"bookTicker","u":11421925127663,'
    '"s":"BTCUSDT","ps":"BTCUSDT","b":"77960.50","B":"1.814","a":"77960.60","A":"8.994",'
    '"T":1788015199004,"E":1788015199004,"st":1}}'
)


def _aggtrade(symbol: str, quantity: str, nq: str | None, *, omit_nq: bool = False) -> str:
    """Build one combined-stream `aggTrade` frame, optionally without the `nq` key at all."""
    event: dict[str, object] = {
        "e": "aggTrade",
        "s": symbol,
        "a": 1,
        "p": "1.0",
        "q": quantity,
        "m": False,
    }
    if not omit_nq:
        event["nq"] = nq
    return json.dumps({"stream": f"{symbol.lower()}@aggTrade", "data": event})


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


def _universe(
    symbols: tuple[str, ...] = ("BTCUSDT",), event_type: str = "aggTrade"
) -> DeclaredUniverse:
    """Build a declared universe for the bench."""
    return DeclaredUniverse(
        symbols=symbols,
        window_seconds=5.0,
        max_messages=100,
        endpoint="wss://exemplo/stream",
        event_type=event_type,
    )


def _universe_cap(cap: int) -> DeclaredUniverse:
    """Build a universe whose message cap is the binding limit."""
    return DeclaredUniverse(
        symbols=("BTCUSDT",),
        window_seconds=5.0,
        max_messages=cap,
        endpoint="wss://exemplo/stream",
    )


def _run(
    frames: list[str], universe: DeclaredUniverse | None = None
) -> ProbeMeasured | ProbeNotMeasured:
    """Drive the probe over scripted frames with a frozen clock."""
    return probe_stream_quantity_fields(FakeSource(frames), universe or _universe(), lambda: 0.0)


# ── Control 1: the three states are distinguished, and NULL is not ABSENT ────────────────────


def test_nq_carrying_a_value_is_read_as_valued() -> None:
    """A field holding a quantity reads as `VALUED`."""
    reading = read_quantity_fields(json.loads(REST_FUTURES_WITH_NQ))
    assert reading.nq_presence is FieldPresence.VALUED
    assert reading.raw_nq == "0.128"
    assert reading.carries_nq_value


def test_nq_key_missing_is_read_as_absent() -> None:
    """A missing key reads as `ABSENT` — the spot payload, captured live."""
    reading = read_quantity_fields(json.loads(WS_SPOT_AGGTRADE))
    assert reading.nq_presence is FieldPresence.ABSENT
    assert reading.q_presence is FieldPresence.VALUED


def test_nq_present_but_null_is_not_reported_as_absent() -> None:
    """THE MUTATION THAT MUST BE REJECTED: `null` is a delivered field, not a missing one.

    "the field exists but always comes back null" is one of the three answers this task was
    told to keep separate. A classifier collapsing it into `ABSENT` would report the collector
    of `T-03.4` that it must fall back to REST, when in truth the field IS being delivered.
    """
    reading = read_quantity_fields(json.loads(_aggtrade("BTCUSDT", "1.0", None)))
    assert reading.nq_presence is FieldPresence.NULL
    assert not reading.carries_nq_value


# ── Control 2: transport failure NEVER becomes a field verdict ───────────────────────────────


@pytest.mark.parametrize(
    "stage",
    [ProbeStage.DNS, ProbeStage.TCP, ProbeStage.TLS, ProbeStage.HTTP_UPGRADE, ProbeStage.FRAME],
)
def test_a_failure_at_any_stage_is_not_measured_and_never_absent(stage: ProbeStage) -> None:
    """Every transport stage yields `NOT_MEASURED`, carrying the stage that failed."""
    outcome = probe_stream_quantity_fields(FakeSource([], stage), _universe(), lambda: 0.0)
    assert isinstance(outcome, ProbeNotMeasured)
    assert outcome.failed_stage is stage
    assert outcome.verdict is NqVerdict.NOT_MEASURED


def test_an_empty_window_is_not_measured_rather_than_absent() -> None:
    """Zero frames is silence, not evidence: the verdict must not be `ABSENT_IN_ALL`.

    This is the case that actually happened live on 2026-08-29 against the FUTURES stream: the
    socket was open and answering pings, and no `aggTrade` event ever arrived.
    """
    outcome = _run([])
    assert isinstance(outcome, ProbeNotMeasured)
    assert outcome.failed_stage is ProbeStage.FRAME
    assert outcome.verdict is NqVerdict.NOT_MEASURED


def test_a_connected_stream_without_nq_reports_absent_not_unmeasured() -> None:
    """THE OTHER SIDE OF THE CONTROL: connected and truly missing the field reads `ABSENT`.

    Together with the test above this is what makes the instrument a measurement: silence and
    absence produce DIFFERENT verdicts through the same code path. Reproduces the live
    `bookTicker` control.
    """
    outcome = _run(
        [WS_FUTURES_BOOKTICKER], universe=_universe(("BTCUSDT",), event_type="bookTicker")
    )
    assert isinstance(outcome, ProbeMeasured)
    assert outcome.verdict is NqVerdict.ABSENT_IN_ALL
    assert outcome.messages == 1


def test_the_source_is_closed_even_when_the_handshake_failed() -> None:
    """A failed `open` must still release the channel."""
    source = FakeSource([], ProbeStage.TLS)
    probe_stream_quantity_fields(source, _universe(), lambda: 0.0)
    assert source.closed


# ── Control 3: a per-symbol split, because the answer can differ BETWEEN symbols ─────────────


def test_symbols_that_disagree_produce_a_mixed_verdict() -> None:
    """A yes for one symbol and a no for another must not collapse into one answer."""
    outcome = _run(
        [
            _aggtrade("BTCUSDT", "1.0", "1.0"),
            _aggtrade("DOGEUSDT", "5.0", None, omit_nq=True),
        ],
        universe=_universe(("BTCUSDT", "DOGEUSDT")),
    )
    assert isinstance(outcome, ProbeMeasured)
    assert outcome.verdict is NqVerdict.MIXED
    per_symbol = {b.symbol: b.verdict for b in outcome.by_symbol()}
    assert per_symbol == {
        "BTCUSDT": NqVerdict.VALUED_IN_ALL,
        "DOGEUSDT": NqVerdict.ABSENT_IN_ALL,
    }


def test_a_requested_symbol_that_never_spoke_is_reported_as_silent() -> None:
    """A symbol asked for and never heard is named, not rounded away."""
    universe = _universe(("BTCUSDT", "XRPUSDT"))
    outcome = _run([_aggtrade("BTCUSDT", "1.0", "1.0")], universe=universe)
    assert isinstance(outcome, ProbeMeasured)
    assert universe.silent_symbols(b.symbol for b in outcome.by_symbol()) == ("XRPUSDT",)


# ── Control 4: the SECOND falsifier of `ADR-001` is representable, therefore countable ───────


def test_nq_above_q_is_representable_and_counted() -> None:
    """`ADR-001` says `nq > q` never happened in 1000 REST trades. One hit must be COUNTABLE."""
    outcome = _run([_aggtrade("BTCUSDT", "1.0", "2.0")])
    assert isinstance(outcome, ProbeMeasured)
    assert outcome.readings[0].relation is QuantityRelation.NQ_ABOVE_Q
    assert outcome.nq_above_q_count == 1


def test_quantities_are_compared_without_binary_rounding() -> None:
    """Decimal strings compare exactly; a float path would call these two equal."""
    reading = read_quantity_fields(json.loads(_aggtrade("BTCUSDT", "0.1", "0.1000000000000000055")))
    assert reading.relation is QuantityRelation.NQ_ABOVE_Q


def test_an_unreadable_quantity_is_uncomparable_rather_than_zero() -> None:
    """A missing side yields `UNCOMPARABLE`; treating it as zero would invent a deficit."""
    reading = read_quantity_fields(json.loads(_aggtrade("BTCUSDT", "1.0", None, omit_nq=True)))
    assert reading.relation is QuantityRelation.UNCOMPARABLE


def test_the_combined_stream_envelope_is_unwrapped_before_judging() -> None:
    """Reading the envelope as the event would report every field ABSENT — a transport artefact.

    The mutation: the same bytes judged WITHOUT unwrapping. `q` would look missing on a message
    that plainly carries it, and the probe would report absence caused by its own parsing.
    """
    wrapped = json.loads(_aggtrade("BTCUSDT", "1.0", "1.0"))
    assert read_quantity_fields(wrapped).q_presence is FieldPresence.VALUED
    assert "q" not in wrapped  # the envelope itself has no quantity field


def test_frames_that_are_not_the_declared_event_are_skipped() -> None:
    """A subscription acknowledgement must not count as a message with no `nq`."""
    outcome = _run(['{"result":null,"id":1}', "nao-e-json", _aggtrade("BTCUSDT", "1.0", "1.0")])
    assert isinstance(outcome, ProbeMeasured)
    assert outcome.messages == 1


# ── Control 5: the RFC 6455 layer, including the bug this bench caught ───────────────────────


def test_the_handshake_accept_matches_the_published_rfc_vector() -> None:
    """RFC 6455 §1.3 publishes one key/accept pair. This test exists because it FAILED once.

    The magic GUID was first written with its trailing `C` transposed
    (`...-95CA-5AB0DC85B11C` instead of `...-95CA-C5AB0DC85B11`). Binance answered `101` and
    the probe rejected the handshake. Without a published vector pinned here, the next
    transposition is found against the live exchange again, or not at all.
    """
    assert expected_accept("dGhlIHNhbXBsZSBub25jZQ==") == "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="


def test_a_matching_accept_is_admitted() -> None:
    """A well-formed 101 whose token matches passes."""
    key = new_client_key()
    response = (
        f"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n"
        f"Sec-WebSocket-Accept: {expected_accept(key)}\r\n\r\n"
    ).encode()
    verify_handshake_response(response, key)


@pytest.mark.parametrize(
    ("response", "reason"),
    [
        (b"HTTP/1.1 403 Forbidden\r\n\r\n", "non-101 status"),
        (b"HTTP/1.1 101 Switching Protocols\r\n\r\n", "missing Sec-WebSocket-Accept"),
        (
            b"HTTP/1.1 101 Switching Protocols\r\nSec-WebSocket-Accept: errado=\r\n\r\n",
            "does not match",
        ),
    ],
)
def test_a_bad_handshake_fails_at_http_upgrade(response: bytes, reason: str) -> None:
    """Each malformed handshake is refused at `HTTP_UPGRADE`, naming which way it was wrong."""
    with pytest.raises(StreamTransportError) as raised:
        verify_handshake_response(response, new_client_key())
    assert raised.value.stage is ProbeStage.HTTP_UPGRADE
    assert reason in raised.value.detail


def test_the_handshake_request_carries_the_required_headers() -> None:
    """The upgrade request names the host, the key and version 13."""
    request = build_handshake_request("exemplo.com", "/ws/x@aggTrade", "chave==").decode()
    assert request.startswith("GET /ws/x@aggTrade HTTP/1.1\r\n")
    assert "Host: exemplo.com\r\n" in request
    assert "Sec-WebSocket-Key: chave==\r\n" in request
    assert "Sec-WebSocket-Version: 13\r\n" in request


def _server_frame(payload: bytes, opcode: int = 0x1, fin: bool = True) -> bytes:
    """Build an UNMASKED server frame, choosing the length encoding by size."""
    head = bytes([(0x80 if fin else 0x00) | opcode])
    if len(payload) < 126:
        return head + bytes([len(payload)]) + payload
    if len(payload) < 1 << 16:
        return head + bytes([126]) + len(payload).to_bytes(2, "big") + payload
    return head + bytes([127]) + len(payload).to_bytes(8, "big") + payload


def _reader(data: bytes) -> object:
    """Return a `read_exact` over a fixed buffer."""
    state = {"at": 0}

    def read_exact(size: int) -> bytes:
        start = state["at"]
        state["at"] = start + size
        return data[start : start + size]

    return read_exact


@pytest.mark.parametrize("size", [10, 200, 70000])
def test_every_payload_length_encoding_is_read(size: int) -> None:
    """7-bit, 16-bit and 64-bit lengths all round-trip."""
    payload = b"x" * size
    _, opcode, body = read_frame(_reader(_server_frame(payload)))  # type: ignore[arg-type]
    assert opcode == 0x1
    assert body == payload


def test_a_masked_server_frame_is_refused() -> None:
    """RFC 6455 §5.1 forbids a masked server frame; it is reported, not silently unmasked."""
    with pytest.raises(StreamTransportError) as raised:
        read_frame(_reader(b"\x81\x81\x00\x00\x00\x00A"))  # type: ignore[arg-type]
    assert raised.value.stage is ProbeStage.FRAME


def test_a_message_split_across_continuation_frames_is_reassembled() -> None:
    """A fragmented text message arrives as one string."""
    data = _server_frame(b'{"a":', fin=False) + _server_frame(b"1}", opcode=0x0)
    assert next(iter_text_messages(_reader(data))) == '{"a":1}'  # type: ignore[arg-type]


def test_control_frames_are_skipped_and_close_ends_the_stream() -> None:
    """A ping does not become a message, and a close ends iteration.

    This is what the live futures probe saw: pings and nothing else. Counting a ping as a
    message would have turned an empty stream into a false `ABSENT` verdict.
    """
    data = _server_frame(b"1788015862624", opcode=0x9) + _server_frame(b"", opcode=0x8)
    assert list(iter_text_messages(_reader(data))) == []  # type: ignore[arg-type]


# ── Control 6: the live transport, driven over a fake channel ────────────────────────────────


class FakeChannel:
    """A channel that answers the handshake correctly, then serves scripted frames.

    It replies using the key the client actually sent, so the accept token is computed the same
    way the live server computes it — a fake that skipped that check would never have caught the
    transposed GUID.
    """

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


def test_the_first_frame_is_not_lost_when_it_shares_a_packet_with_the_handshake() -> None:
    """REGRESSION: the handshake read must not swallow the bytes of the first frame.

    `recv` does not respect message boundaries, so the end of the HTTP head and the start of the
    first frame can arrive together. Discarding that remainder loses the FIRST message — and for
    a probe asking "did the field arrive?", the first message is the whole evidence. The live
    runs never showed this: Binance happened to send the head in its own packet.
    """
    channel = FakeChannel(_server_frame(b'{"e":"aggTrade","nq":"1.0"}'))
    source = WebSocketMessageSource("exemplo.com", "/ws/x@aggTrade", lambda: channel)
    source.open()
    assert next(source.messages()) == '{"e":"aggTrade","nq":"1.0"}'
    source.close()
    assert channel.closed


def test_the_live_source_sends_a_well_formed_upgrade_request() -> None:
    """The bytes the client wrote are a valid RFC 6455 upgrade for the requested path."""
    channel = FakeChannel(_server_frame(b"{}"))
    WebSocketMessageSource("exemplo.com", "/ws/btcusdt@aggTrade", lambda: channel).open()
    assert channel.sent.decode().startswith("GET /ws/btcusdt@aggTrade HTTP/1.1\r\n")


def test_the_live_source_fails_at_http_upgrade_when_the_peer_hangs_up() -> None:
    """A channel that closes mid-handshake fails at `HTTP_UPGRADE`, not at `FRAME`."""
    source = WebSocketMessageSource(
        "exemplo.com", "/ws/x", lambda: FakeChannel(b"", answer_handshake=False)
    )
    with pytest.raises(StreamTransportError) as raised:
        source.open()
    assert raised.value.stage is ProbeStage.HTTP_UPGRADE


def test_reading_a_frame_before_opening_fails_at_frame() -> None:
    """Reading with no channel is a `FRAME` failure, never a field verdict."""
    source = WebSocketMessageSource("exemplo.com", "/ws/x", lambda: FakeChannel(b""))
    with pytest.raises(StreamTransportError) as raised:
        next(source.messages())
    assert raised.value.stage is ProbeStage.FRAME


def test_closing_a_source_that_never_opened_is_safe() -> None:
    """`close` after a failed `open` must not raise."""
    WebSocketMessageSource("exemplo.com", "/ws/x", lambda: FakeChannel(b"")).close()


def test_the_recorder_writes_every_raw_message_with_a_timestamp(tmp_path: Path) -> None:
    """The evidence file keeps the bytes VERBATIM, stamped, one JSON object per line."""
    evidence = tmp_path / "amostra" / "raw.jsonl"
    recorder = RecordingMessageSource(
        FakeSource([WS_SPOT_AGGTRADE]), evidence, lambda: "2026-08-29T00:00:00+00:00"
    )
    recorder.open()
    assert list(recorder.messages()) == [WS_SPOT_AGGTRADE]
    recorder.close()
    line = json.loads(evidence.read_text(encoding="utf-8").splitlines()[0])
    assert line["captured_at"] == "2026-08-29T00:00:00+00:00"
    assert line["raw"] == WS_SPOT_AGGTRADE


def test_the_combined_path_names_every_symbol_and_the_chosen_stream() -> None:
    """The path is built from the declared symbols, lowercased, on the named stream."""
    assert combined_stream_path(("BTCUSDT", "ETHUSDT")) == (
        "/stream?streams=btcusdt@aggTrade/ethusdt@aggTrade"
    )
    assert combined_stream_path(("BTCUSDT",), "bookTicker") == (
        "/stream?streams=btcusdt@bookTicker"
    )


# ── Control 7: the report itself, because the REPORT is the product of this task ─────────────


def test_the_report_of_a_failure_says_in_words_that_it_is_not_absence() -> None:
    """A `NOT_MEASURED` report must warn, in the output, against reading it as absence.

    The instruction of this task is explicit that an ambiguous result is inherited by `T-03.4`.
    The warning is part of the product, so it is asserted like any other output.
    """
    lines = _report_lines(
        ProbeNotMeasured(failed_stage=ProbeStage.FRAME, detail="timeout"), _universe()
    )
    assert any("NOT_MEASURED" in line for line in lines)
    assert any("estagio que falhou: FRAME" in line for line in lines)
    assert any("NAO e ausencia do campo nq" in line for line in lines)


def test_every_report_carries_the_universe_it_rests_on() -> None:
    """No verdict is rendered without the symbol count, the window and the message cap."""
    universe = _universe(("BTCUSDT", "ETHUSDT"))
    header = _report_lines(ProbeNotMeasured(ProbeStage.DNS, "x"), universe)[0]
    assert "2 simbolo(s)" in header
    assert "janela 5.0s" in header
    assert "teto 100 msg" in header


def test_the_summary_of_a_measured_run_carries_the_per_symbol_counts() -> None:
    """The machine-readable summary keeps `n`, the per-symbol split and the silent symbols."""
    outcome = _run([_aggtrade("BTCUSDT", "1.0", "0.5")], universe=_universe(("BTCUSDT", "XRPUSDT")))
    summary = _summary(outcome, _universe(("BTCUSDT", "XRPUSDT")))
    assert summary["verdict"] == "VALUED_IN_ALL"
    assert summary["messages"] == 1
    assert summary["silent_symbols"] == ["XRPUSDT"]
    by_symbol = summary["by_symbol"]
    assert isinstance(by_symbol, list)
    assert by_symbol[0]["nq_valued"] == 1


def test_the_summary_of_a_failed_run_carries_the_stage_instead_of_counts() -> None:
    """A failure summary names the stage and holds NO field counts to be misread."""
    summary = _summary(ProbeNotMeasured(ProbeStage.TLS, "handshake"), _universe())
    assert summary["verdict"] == "NOT_MEASURED"
    assert summary["failed_stage"] == "TLS"
    assert "by_symbol" not in summary


def test_the_parser_defaults_declare_the_universe_of_the_measurement(tmp_path: Path) -> None:
    """The defaults ARE the declared universe, so the command reproduces the run."""
    args = build_parser().parse_args(["--evidence", str(tmp_path / "x.jsonl")])
    assert args.symbols == "BTCUSDT,ETHUSDT,SOLUSDT,XRPUSDT,DOGEUSDT"
    assert args.stream == "aggTrade"
    assert args.event_type == "aggTrade"


# ── Control 8: the remaining branches, so the floor is met by tests and not by omission ──────


def test_a_quantity_that_is_not_a_number_is_uncomparable() -> None:
    """An unparseable quantity yields `UNCOMPARABLE`, never a silent zero."""
    reading = read_quantity_fields(json.loads(_aggtrade("BTCUSDT", "1.0", "nao-e-numero")))
    assert reading.relation is QuantityRelation.UNCOMPARABLE


def test_a_stream_delivering_only_nulls_is_reported_as_null_in_all() -> None:
    """The "field exists but always arrives null" answer has its OWN verdict."""
    outcome = _run([_aggtrade("BTCUSDT", "1.0", None), _aggtrade("BTCUSDT", "2.0", None)])
    assert isinstance(outcome, ProbeMeasured)
    assert outcome.verdict is NqVerdict.NULL_IN_ALL


def test_a_breakdown_with_no_message_is_not_measured() -> None:
    """A symbol with zero messages cannot carry a field verdict."""
    assert SymbolBreakdown("BTCUSDT", 0, 0, 0, 0, 0, 0).verdict is NqVerdict.NOT_MEASURED


def test_the_report_of_a_measured_run_lists_every_symbol_and_the_falsifier_count() -> None:
    """A measured report shows `n`, the per-symbol split and the `nq > q` count."""
    outcome = _run([_aggtrade("BTCUSDT", "1.0", "0.5")])
    lines = _report_lines(outcome, _universe())
    assert any("VALUED_IN_ALL" in line and "n = 1" in line for line in lines)
    assert any("nq > q (2o falsificador de ADR-001): 0 de 1" in line for line in lines)
    assert any("BTCUSDT: n=1 nq_valued=1" in line for line in lines)


def test_a_frame_cut_in_half_fails_at_frame_not_as_a_missing_field() -> None:
    """A connection dropped mid-frame is a transport failure, with its stage named."""
    channel = FakeChannel(b"\x81\x20only-part")
    source = WebSocketMessageSource("exemplo.com", "/ws/x", lambda: channel)
    source.open()
    with pytest.raises(StreamTransportError) as raised:
        next(source.messages())
    assert raised.value.stage is ProbeStage.FRAME


def test_a_read_timeout_is_a_frame_failure() -> None:
    """A socket timeout is reported at `FRAME`, never as an empty payload."""

    class TimingOutChannel(FakeChannel):
        def recv(self, size: int, /) -> bytes:
            if self.script:
                return super().recv(size)
            raise TimeoutError("the read operation timed out")

    source = WebSocketMessageSource("exemplo.com", "/ws/x", lambda: TimingOutChannel(b""))
    source.open()
    with pytest.raises(StreamTransportError) as raised:
        next(source.messages())
    assert raised.value.stage is ProbeStage.FRAME


def test_a_binary_frame_is_reassembled_but_not_yielded_as_text() -> None:
    """A binary message is consumed without being reported as a text payload."""
    data = _server_frame(b"\x00\x01", opcode=0x2) + _server_frame(b"depois")
    stream = iter_text_messages(_reader(data))  # type: ignore[arg-type]
    assert next(stream) == "depois"


def test_the_cli_writes_evidence_and_summary_and_exits_zero_when_measured(
    tmp_path: Path,
) -> None:
    """END TO END, OFFLINE: the command produces the raw sample, the summary and `rc=0`."""
    evidence, summary = tmp_path / "raw.jsonl", tmp_path / "sum.json"
    frame = _server_frame(_aggtrade("BTCUSDT", "1.0", "0.5").encode())
    code = main(
        [
            "--symbols",
            "BTCUSDT",
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
    assert json.loads(summary.read_text())["verdict"] == "VALUED_IN_ALL"
    recorded = json.loads(evidence.read_text().splitlines()[0])
    assert json.loads(recorded["raw"])["data"]["nq"] == "0.5"


def test_the_cli_exits_three_when_it_did_not_measure(tmp_path: Path) -> None:
    """`rc=3` is "did not measure", matching the refusal convention of the gate scripts.

    It must NOT be read as "the field is not there" — the same distinction the verdict makes,
    carried into the exit code so a caller in a shell sees it too.
    """
    code = main(
        ["--symbols", "BTCUSDT", "--seconds", "1", "--evidence", str(tmp_path / "r.jsonl")],
        lambda host: lambda: FakeChannel(b"", answer_handshake=False),
    )
    assert code == 3


def test_a_truncated_frame_is_refused_at_frame_instead_of_crashing() -> None:
    """REGRESSION: a short read must raise `StreamTransportError`, never `IndexError`.

    An unhandled exception would abandon the run with NO verdict, which is worse than
    `NOT_MEASURED`: the caller cannot even tell the stream from the instrument.
    """
    for truncated in (b"", b"\x81", b"\x81\x7e", b"\x81\x05ab"):
        with pytest.raises(StreamTransportError) as raised:
            read_frame(_reader(truncated))  # type: ignore[arg-type]
        assert raised.value.stage is ProbeStage.FRAME


class ExplodingSource(FakeSource):
    """A source that yields some frames and then loses the connection."""

    def __init__(self, frames: list[str], stage: ProbeStage) -> None:
        """Replay `frames`, then fail at `stage`."""
        super().__init__(frames)
        self._stage = stage

    def messages(self) -> Iterator[str]:
        """Yield the scripted frames, then raise."""
        yield from self._frames
        raise StreamTransportError(self._stage, "conexao perdida no meio da janela")


def test_a_connection_lost_before_any_message_is_not_measured() -> None:
    """Losing the stream with nothing collected yields `NOT_MEASURED`, with the stage kept."""
    outcome = probe_stream_quantity_fields(
        ExplodingSource([], ProbeStage.FRAME), _universe(), lambda: 0.0
    )
    assert isinstance(outcome, ProbeNotMeasured)
    assert outcome.failed_stage is ProbeStage.FRAME


def test_a_connection_lost_after_messages_keeps_what_was_measured() -> None:
    """THE WINDOW NORMALLY ENDS IN A TIMEOUT. Messages already read must survive it.

    Discarding them would make the probe fail exactly when it succeeded — the run that collected
    evidence would report the same `NOT_MEASURED` as the run that collected none.
    """
    outcome = probe_stream_quantity_fields(
        ExplodingSource([_aggtrade("BTCUSDT", "1.0", "0.5")], ProbeStage.FRAME),
        _universe(),
        lambda: 0.0,
    )
    assert isinstance(outcome, ProbeMeasured)
    assert outcome.messages == 1
    assert outcome.verdict is NqVerdict.VALUED_IN_ALL


def test_json_that_is_not_an_object_is_skipped() -> None:
    """A JSON array or scalar is not an event and must not be counted as a message."""
    outcome = _run(["[1,2,3]", "42", _aggtrade("BTCUSDT", "1.0", "0.5")])
    assert isinstance(outcome, ProbeMeasured)
    assert outcome.messages == 1


def test_the_window_stops_the_collection_once_the_clock_passes_it() -> None:
    """The declared window bounds the run even when frames keep arriving."""
    ticks = iter([0.0, 99.0, 99.0, 99.0])
    outcome = probe_stream_quantity_fields(
        FakeSource([_aggtrade("BTCUSDT", "1.0", "0.5")] * 5),
        _universe(),
        lambda: next(ticks),
    )
    assert isinstance(outcome, ProbeMeasured)
    assert outcome.messages == 1


class ChunkedChannel(FakeChannel):
    """A channel that hands back ONE scripted chunk per `recv`, never coalescing them."""

    def __init__(self, frames: bytes) -> None:
        """Serve the handshake on one `recv` and the frames on the next."""
        super().__init__(b"")
        self._frames = frames
        self._chunks: list[bytes] = []

    def sendall(self, data: bytes, /) -> None:
        """Queue the handshake and the frames as SEPARATE chunks."""
        self.sent += data
        key = data.decode().split("Sec-WebSocket-Key: ")[1].split("\r\n")[0]
        head = (
            f"HTTP/1.1 101 Switching Protocols\r\n"
            f"Sec-WebSocket-Accept: {expected_accept(key)}\r\n\r\n"
        ).encode()
        self._chunks = [head, *[bytes([b]) for b in self._frames]]

    def recv(self, size: int, /) -> bytes:
        """Return the next queued chunk, or empty when they run out."""
        return self._chunks.pop(0) if self._chunks else b""


def test_a_frame_arriving_after_the_handshake_is_read_across_several_recvs() -> None:
    """`recv` may hand back one byte at a time; the reader must accumulate until complete.

    The happy path where the whole frame arrives in the handshake packet is already pinned. This
    is the OTHER packing, and it exercises the accumulation loop that packing never reaches.
    """
    channel = ChunkedChannel(_server_frame(b'{"e":"aggTrade","nq":"7"}'))
    source = WebSocketMessageSource("exemplo.com", "/ws/x", lambda: channel)
    source.open()
    assert next(source.messages()) == '{"e":"aggTrade","nq":"7"}'


def test_a_socket_error_during_the_handshake_fails_at_http_upgrade() -> None:
    """An `OSError` while writing the upgrade is reported at `HTTP_UPGRADE`."""

    class RefusingChannel(FakeChannel):
        def sendall(self, data: bytes, /) -> None:
            raise OSError("broken pipe")

    source = WebSocketMessageSource("exemplo.com", "/ws/x", lambda: RefusingChannel(b""))
    with pytest.raises(StreamTransportError) as raised:
        source.open()
    assert raised.value.stage is ProbeStage.HTTP_UPGRADE


def test_consecutive_text_messages_are_yielded_one_after_the_other() -> None:
    """The reader resets its buffer between messages instead of concatenating them."""
    data = _server_frame(b'{"n":1}') + _server_frame(b'{"n":2}')
    stream = iter_text_messages(_reader(data))  # type: ignore[arg-type]
    assert [next(stream), next(stream)] == ['{"n":1}', '{"n":2}']


# ── Control 9: o universo RELATADO tem de ser o universo OBSERVADO (defeitos do /qa) ─────────


def test_a_window_cut_short_by_transport_says_so_in_the_result() -> None:
    """DEFEITO 1 do `/qa`: uma janela interrompida saia indistinguivel de uma janela completa.

    Uma corrida que entrega 1 mensagem e cai aos 2 s de uma janela DECLARADA de 120 s publicava
    `window_seconds: 120.0`, `VALUED_IN_ALL` e `rc=0`, sem nenhuma chave dizendo que fora
    interrompida. E a trajetoria em que `D3.9` FECHA — o DoD pede "1 simbolo, 1 mensagem" — logo
    o defeito mora no caminho feliz minimo do criterio, nao numa borda exotica.
    """
    universe = DeclaredUniverse(
        symbols=("BTCUSDT",),
        window_seconds=120.0,
        max_messages=300,
        endpoint="wss://exemplo/stream",
    )
    relogio = iter([0.0, 2.0, 2.0, 2.0])
    outcome = probe_stream_quantity_fields(
        ExplodingSource([_aggtrade("BTCUSDT", "1.0", "0.5")], ProbeStage.FRAME),
        universe,
        lambda: next(relogio),
    )
    assert isinstance(outcome, ProbeMeasured)
    assert outcome.verdict is NqVerdict.VALUED_IN_ALL  # o veredito NAO muda de valor
    assert outcome.window_end is WindowEnd.INTERRUPTED
    assert outcome.interrupted_at_stage is ProbeStage.FRAME
    assert not outcome.window_complete

    resumo = _summary(outcome, universe)
    assert resumo["window_complete"] is False
    assert resumo["window_end"] == "INTERRUPTED"
    assert resumo["interrupted_at_stage"] == "FRAME"
    assert resumo["observed_seconds"] == 2.0
    assert resumo["universe"]["window_seconds"] == 120.0  # type: ignore[index]

    assert any("INTERROMPIDA" in linha for linha in _report_lines(outcome, universe))


def test_a_window_that_closed_on_its_own_terms_is_marked_complete() -> None:
    """O outro lado do controle: fechar por TETO ou por TEMPO nao e interrupcao."""
    por_teto = _run([_aggtrade("BTCUSDT", "1.0", "0.5")] * 3, universe=_universe_cap(1))
    assert isinstance(por_teto, ProbeMeasured)
    assert por_teto.window_end is WindowEnd.MESSAGE_CAP
    assert por_teto.window_complete
    assert _summary(por_teto, _universe_cap(1))["window_complete"] is True

    fim_de_fonte = _run([_aggtrade("BTCUSDT", "1.0", "0.5")])
    assert isinstance(fim_de_fonte, ProbeMeasured)
    assert fim_de_fonte.window_end is WindowEnd.STREAM_ENDED


def test_a_reserved_opcode_does_not_deliver_half_a_message() -> None:
    """DEFEITO 2 do `/qa`: opcode reservado entregava meia mensagem como mensagem inteira.

    RFC 6455 5.2 manda FALHAR a conexao diante de opcode reservado. Sem o ramo, um texto com
    `FIN=0` seguido de um frame `0xB` com `FIN=1` publicava `'{"e":"agg'` como se fosse uma
    mensagem completa. E o ramo `153->155`, o unico descoberto do arquivo.
    """
    data = _server_frame(b'{"e":"agg', fin=False) + _server_frame(b"", opcode=0xB)
    with pytest.raises(StreamTransportError) as raised:
        next(iter_text_messages(_reader(data)))  # type: ignore[arg-type]
    assert raised.value.stage is ProbeStage.FRAME
    assert "reserved opcode" in raised.value.detail
