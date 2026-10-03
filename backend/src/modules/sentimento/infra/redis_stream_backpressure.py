"""How far behind the single writer is — and a gate that waits for it before a bulk publish."""
#
# `T-05.3` of `paineis-de-fluxo` (`SPEC-009` phase `05`, defect `D-C`).
#
# ── WHY THIS MODULE EXISTS: THE BOOT BACKFILL WAS PUBLISHING INTO A TRIMMER ─────────────────
#
# Every producer publishes onto ONE Redis Stream capped by `XADD ... MAXLEN ~ N` (`ADR-032/D4`,
# default `100.000`). `MAXLEN` does not care whether the writer has READ an entry: past the cap
# it drops the oldest, read or not, and nothing errors. `klines_backfill_cli` (`T-01.5`) knew
# this and waits for the writer's consumer group to drain between pages. The collector's own
# BOOT backfill did not — and it publishes `7 x 1440 x 4 symbols x 6 identities = 241.920`
# entries in ~26 s, `2,4x` the cap, against a writer that drains ~175 rows/s.
#
# Measured on the local stack at the collector boot of `2026-10-01T20:11:25Z`
# `[MEDIDO 2026-10-02, docs/context/paineis-de-fluxo/gates/T-05.3-build.md]`: the collector
# logged `n_published=40317` bars (`= 241.902` rows), the writer acked `105.334` rows in the ten
# minutes that followed, and the survivors were ordered by symbol exactly as a front-trim
# predicts — `SOLUSDT` (published LAST) kept `60.414` of `60.480` rows, `BTCUSDT` (published
# FIRST) kept `1.248`. So every restart re-read seven days of `BTCUSDT` and threw ~98% of it
# away, and the minutes the process was down for stayed holes.
#
# The two functions below used to live in `klines_backfill_cli`; they moved here because the
# collector needs them too and `klines_backfill_cli` already imports `collectors_cli`, so the
# collector could not import them back without a cycle.

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from typing import Final

from src.modules.sentimento.infra.redis_resp_client import (
    RedisCommandError,
    RespConnection,
    RespValue,
)

logger = logging.getLogger(__name__)

# The group `single_writer_cli` joins when `REDIS_STREAM_GROUP` is unset. A gate probing a group
# nobody consumes would read "missing" forever, so every prober defaults to the same name.
DEFAULT_STREAM_GROUP: Final[str] = "single_writer"

# How long to sleep between two `XINFO GROUPS` probes while waiting for a drain. One second is
# short against the ~9.000 rows one `MAX_LIMIT` page of klines produces and long enough that the
# probe itself is not a load.
DEFAULT_DRAIN_POLL_INTERVAL_S: Final[float] = 1.0

# The fraction of the stream cap a bulk publisher may leave unread before it waits: one fifth.
# At the default `100.000` cap that is `20.000`, the same number `klines_backfill_cli` has
# always used, and it leaves `80.000` of headroom for one page in flight (`1.500 x 6 = 9.000`
# rows) plus every OTHER producer's boot burst (`openInterestHist` publishes `8.064` points).
_LAG_CEILING_DIVISOR: Final[int] = 5

# `XINFO GROUPS` answers RESP2 as an array of flat `field value field value ...` arrays, one per
# group. These are the two fields this module reads off that reply.
_XINFO_GROUP_NAME_FIELD: Final[bytes] = b"name"
_XINFO_GROUP_LAG_FIELD: Final[bytes] = b"lag"


class StreamGroupMissingError(RuntimeError):
    """`XINFO GROUPS` did not list the consumer group the single writer is supposed to hold."""


def lag_ceiling_for(stream_maxlen: int) -> int:
    """Return how many unread entries a bulk publisher may leave before it waits.

    Derived from the CONFIGURED cap rather than fixed: an operator who lowers
    `REDIS_STREAM_MAXLEN` to `10.000` must not keep a `20.000` ceiling that is above the cap
    itself — that ceiling would never make the publisher wait, and the trim would be back.
    """
    return max(1, stream_maxlen // _LAG_CEILING_DIVISOR)


def read_group_lag(connection: RespConnection, stream: str, group: str) -> int:
    """Return how many entries of `stream` the consumer `group` has not been delivered yet.

    Read from `XINFO GROUPS`'s `lag` field, which is the only number here that means "work the
    writer still owes". `XLEN` would be the wrong probe and the mistake is worth naming: a Redis
    Stream does NOT drop an entry when it is acknowledged, so `XLEN` sits pinned at the `MAXLEN`
    cap whether the writer is idle or hours behind — a backpressure loop reading it would either
    never publish or never wait.

    A missing group is an ERROR, not a zero: it means nothing is draining this stream, and
    publishing a backfill into it would be publishing it into a trimmer.
    """
    reply = connection.command("XINFO", "GROUPS", stream)
    if not isinstance(reply, list):
        raise StreamGroupMissingError(
            f"XINFO GROUPS {stream!r} answered {reply!r}, not the array of groups RESP2 promises"
        )
    for entry in reply:
        fields = _flat_map(entry)
        if fields.get(_XINFO_GROUP_NAME_FIELD) == group.encode("utf-8"):
            lag = fields.get(_XINFO_GROUP_LAG_FIELD)
            if not isinstance(lag, int):
                raise StreamGroupMissingError(
                    f"group {group!r} on {stream!r} reported lag={lag!r}, not an integer; the "
                    f"server is older than the Redis 7 reply this backpressure depends on"
                )
            return lag
    raise StreamGroupMissingError(
        f"no consumer group named {group!r} on stream {stream!r}: nothing is draining it, so "
        f"every entry this backfill publishes would be trimmed by MAXLEN unread"
    )


def _flat_map(entry: RespValue) -> dict[bytes, RespValue]:
    """Turn one `field value field value ...` RESP2 array into a mapping keyed by field name."""
    if not isinstance(entry, list):
        return {}
    pairs: dict[bytes, RespValue] = {}
    for index in range(0, len(entry) - 1, 2):
        name = entry[index]
        if isinstance(name, bytes):
            pairs[name] = entry[index + 1]
    return pairs


class StreamDrainGate:
    """Block a bulk publisher until the writer's group is at most `max_lag` entries behind.

    ⛔ THE CONNECTION IS ITS OWN, NOT THE ONE THE SINK PUBLISHES ON. `collectors_cli` shares one
    `RespConnection` between seven threads and `RespConnection` holds no lock, so a reply can in
    principle be read by the wrong thread. Between two `XADD`s that mix-up is invisible (both
    replies are an entry id); an `XINFO GROUPS` array read by an `XADD` caller would be a crash.
    A dedicated connection, used only by the one thread that walks the backfill, keeps the probe
    out of that race instead of betting on it.

    The connection is opened LAZILY, on the first `wait`, by `open_connection`. A collector boot
    whose backfill finds nothing to publish never needs the probe, and an eager second socket
    would be one more thing that can fail at boot for no row at all.

    It waits without a timeout, like `klines_backfill_cli.wait_for_drain`, and for the same
    reason: giving up would publish into the trimmer, which is the defect. Two things end the
    wait — the lag falls to the ceiling, or `stop_event` is set (`SIGTERM`), so a shutdown never
    waits out a stalled writer. A group that does not exist YET (the writer creates it with
    `MKSTREAM` and the compose file does not order the collector after it) is a reason to wait,
    not to crash: the probe answers again a second later.
    """

    def __init__(
        self,
        *,
        open_connection: Callable[[], RespConnection],
        stream: str,
        group: str,
        max_lag: int,
        endpoint: str,
        poll_interval_s: float = DEFAULT_DRAIN_POLL_INTERVAL_S,
        log: logging.Logger = logger,
    ) -> None:
        """Bind the probe; no socket is opened and nothing is sent until the first `wait`.

        `log` is the CALLER's logger on purpose: `collectors_cli.main` attaches the service's
        stdout handler to its own logger only (`propagate = False`), so a wait logged under this
        module's name would never reach `docker logs` — and a wait an operator cannot see is
        indistinguishable from a hang.
        """
        self._open_connection = open_connection
        self._connection: RespConnection | None = None
        self._stream = stream
        self._group = group
        self._max_lag = max_lag
        self._endpoint = endpoint
        self._poll_interval_s = poll_interval_s
        self._log = log

    def wait(self, stop_event: threading.Event) -> int | None:
        """Return the lag once it is at or below `max_lag`, or `None` if `stop_event` fired."""
        while not stop_event.is_set():
            lag = self._probe()
            if lag is not None and lag <= self._max_lag:
                return lag
            self._log.info(
                "backfill_waiting_for_writer",
                extra={
                    "endpoint": self._endpoint,
                    "stream": self._stream,
                    "group": self._group,
                    "lag": lag,
                    "max_lag": self._max_lag,
                },
            )
            stop_event.wait(self._poll_interval_s)
        return None

    def _probe(self) -> int | None:
        """Read the lag; `None` when the group (or the stream itself) does not exist yet."""
        if self._connection is None:
            self._connection = self._open_connection()
        try:
            return read_group_lag(self._connection, self._stream, self._group)
        except (StreamGroupMissingError, RedisCommandError) as missing:
            # Not swallowed: the caller logs `lag=None` on this very turn and probes again.
            self._log.debug("backfill_drain_probe_unanswered", extra={"reason": str(missing)})
            return None
