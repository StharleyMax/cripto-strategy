"""`T-01.7` / `D1.7`: a REAL producer process, `kill -9`ed after its 5th of 10 entries.

`B3`/`CA-F1-3`: the producer dies mid-run, having published only 5 of the 10 entries it intended
— the Stream must hold exactly those 5, nothing lost and nothing extra, and a consumer that comes
up afterwards must be able to recover all 5 through `read_pending` even though it never `ack`ed
them. `ADR-027/F3` is why this lives as its own process-crossing test, out of `make verify` until
the owner opts it in (`docs/plans/SPEC-004-captura-em-producao/index.md` `R-G`): unlike
`test_redis_stream_bus.py` (same module, in-process fakes), the producer here is a SEPARATE OS
process this test actually signals, matching what `B3` means by "the producer dies" — an
in-process object going out of scope is not a producer crash.

`test_plain_xread_without_a_group_never_populates_the_pending_entries_list` is the morde
companion the `D1.7` row names ("`XREAD` sem grupo ⇒ 0 na `PEL`"): it proves the main test's "5 na
PEL" assertion is not vacuous by showing the one thing that WOULD make it read 0 — reading the
same entries through plain `XREAD` instead of a consumer group.
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import threading
from collections.abc import Iterator
from pathlib import Path

import pytest
from fakeredis import TcpFakeServer

from src.modules.sentimento.infra.redis_resp_client import (
    RespConnection,
    connect_resp2,
    open_tcp_socket,
)
from src.modules.sentimento.infra.redis_stream_bus import (
    RedisStreamConsumerGroup,
    RedisStreamPublisher,
)

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DRIVER = BACKEND_ROOT / "tests" / "helpers" / "stream_producer_driver.py"

STREAM = "md.series.write.t01-7"
GROUP = "single_writer"
CONSUMER = "writer-1"
TOTAL_ENTRIES = 10
KILLED_AFTER = 5


@pytest.fixture
def redis_address() -> Iterator[tuple[str, int]]:
    """Start a real, loopback-only `fakeredis` Streams server and stop it after the test.

    It runs in THIS process (a background thread) so both the killed producer subprocess and
    this test's own consumer connections can reach it over the same real loopback socket —
    the same server, same convention `test_redis_stream_bus.py` already uses.
    """
    server = TcpFakeServer(("127.0.0.1", 0), server_type="redis")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server.socket.getsockname()
    finally:
        server.shutdown()
        thread.join(timeout=2.0)


def _connection(address: tuple[str, int]) -> RespConnection:
    host, port = address
    return connect_resp2(open_tcp_socket(host, port))


def test_producer_killed_mid_publish_leaves_five_pending_and_nothing_lost(
    redis_address: tuple[str, int],
) -> None:
    """`kill -9` after the 5th of 10 entries: exactly 5 land, and all 5 are recoverable."""
    host, port = redis_address

    # The consumer group is provisioned before the producer ever runs, mirroring a real deploy
    # where the writer boots ahead of the collector.
    RedisStreamConsumerGroup(_connection(redis_address), STREAM, GROUP, CONSUMER).ensure_group()

    environment = dict(os.environ, PYTHONPATH=str(BACKEND_ROOT))
    process = subprocess.Popen(
        [sys.executable, str(DRIVER), host, str(port), STREAM, str(TOTAL_ENTRIES)],
        cwd=str(BACKEND_ROOT),
        env=environment,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
    )
    try:
        assert process.stdout is not None
        assert process.stdin is not None
        for sequence in range(1, KILLED_AFTER):
            line = process.stdout.readline()
            assert int(line) == sequence, f"expected entry {sequence}, driver said {line!r}"
            process.stdin.write("go\n")
            process.stdin.flush()

        last_before_kill = process.stdout.readline()
        assert int(last_before_kill) == KILLED_AFTER

        # The driver is now blocked on `sys.stdin.readline()`, never mid-publish: this is the
        # exact instant `B3` calls "the producer dies after the 5th of 10 messages".
        process.send_signal(signal.SIGKILL)
    finally:
        if process.stdin is not None:
            process.stdin.close()
        process.wait(timeout=10)

    assert process.returncode is not None and process.returncode < 0, (
        f"expected the driver to die by signal (negative returncode), got {process.returncode}"
    )

    inspection = _connection(redis_address)
    stream_length = inspection.command("XLEN", STREAM)
    assert isinstance(stream_length, int), f"XLEN answered a non-integer reply: {stream_length!r}"
    assert stream_length == KILLED_AFTER, (
        f"expected exactly {KILLED_AFTER} entries in the Stream, found {stream_length}"
    )

    # "Subir consumidor": a BRAND NEW connection under the same (stream, group, consumer)
    # identity — the shape a restarted writer process takes.
    consumer = RedisStreamConsumerGroup(_connection(redis_address), STREAM, GROUP, CONSUMER)
    delivered = consumer.read_new(count=TOTAL_ENTRIES)
    delivered_sequences = [int(message.fields[b"sequence"]) for message in delivered]
    assert delivered_sequences == list(range(1, KILLED_AFTER + 1))

    # None of the 5 were `ack`ed, so they must still show up as pending — the literal `D1.7`
    # assertion: "read_pending -> 5 na PEL, 0 perdidas".
    recovered = consumer.read_pending(count=TOTAL_ENTRIES)
    assert len(recovered) == KILLED_AFTER, (
        f"expected {KILLED_AFTER} in the PEL, got {len(recovered)}"
    )
    assert {message.entry_id for message in recovered} == {
        message.entry_id for message in delivered
    }

    # And nothing beyond the 5 ever existed: the crash truncated the run, it did not corrupt it.
    assert consumer.read_new(count=TOTAL_ENTRIES) == ()


def test_plain_xread_without_a_group_never_populates_the_pending_entries_list(
    redis_address: tuple[str, int],
) -> None:
    """Morde for `D1.7`: reading via plain `XREAD` (no group) leaves the PEL at 0.

    This is the case the main test's "5 na PEL" assertion is required to reject: had this
    repository's consumer used `XREAD` instead of `XREADGROUP` (`redis_stream_bus.py`'s `_read`
    always sends `XREADGROUP`, never plain `XREAD`), the entries would still be readable but the
    PEL this test's sibling depends on would be permanently empty — proving that assertion
    exercises real consumer-group behaviour, not a vacuous truth.
    """
    publisher = RedisStreamPublisher(_connection(redis_address), STREAM)
    for sequence in range(1, 4):
        publisher.publish({"sequence": str(sequence)})

    raw = _connection(redis_address)
    plain_reply = raw.command("XREAD", "COUNT", 10, "STREAMS", STREAM, "0")
    assert plain_reply is not None, "plain XREAD must still see the entries that were published"

    RedisStreamConsumerGroup(_connection(redis_address), STREAM, GROUP, CONSUMER).ensure_group()
    pending_summary = raw.command("XPENDING", STREAM, GROUP)
    assert isinstance(pending_summary, list)
    assert pending_summary[0] == 0, "plain XREAD must never register entries in any group's PEL"
