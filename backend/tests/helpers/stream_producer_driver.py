"""Subprocess driver for `T-01.7`'s `D1.7`: a REAL producer process, killed mid-publish.

`B3`/`CA-F1-3` needs a producer that a parent test can `kill -9` — an in-process fake cannot
reproduce what a real process death does to a live connection. This driver runs as a separate OS
process and publishes entries one at a time through `RedisStreamPublisher`, the same production
class `redis_stream_series_sink.py` wraps, over a real loopback TCP connection to whatever
`(host, port)` the parent's `fakeredis.TcpFakeServer` (or a real `redis:7-alpine`) is listening on.

The lockstep protocol removes the timing race that a plain `sleep`-and-kill would carry: after
publishing entry N and writing `N` to stdout, this process BLOCKS on one line of stdin before
publishing entry N+1. The parent writes that line only for entries it wants to let through; to
stop the producer after the Nth entry it simply withholds the line and sends `SIGKILL` instead —
at that instant the driver is provably parked on the blocking read, never mid-publish, so the
count of entries actually written to the stream is exact, never racy.
"""

from __future__ import annotations

import sys

from src.modules.sentimento.infra.redis_resp_client import connect_resp2, open_tcp_socket
from src.modules.sentimento.infra.redis_stream_bus import RedisStreamPublisher


def main(argv: list[str]) -> int:
    """Publish `count` entries to `stream` at `host:port`, pausing on stdin between each one."""
    host, port_text, stream, count_text = argv
    port = int(port_text)
    count = int(count_text)

    connection = connect_resp2(open_tcp_socket(host, port))
    publisher = RedisStreamPublisher(connection, stream)

    for sequence in range(1, count + 1):
        publisher.publish({"sequence": str(sequence)})
        sys.stdout.write(f"{sequence}\n")
        sys.stdout.flush()
        go_ahead = sys.stdin.readline()
        if not go_ahead:
            # stdin closed instead of a go-ahead line: the parent is done with this driver:
            # stop publishing rather than guess at what it wants next.
            return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
