"""`candle-fidelity` — the harness that puts the STORED candle beside the ORIGIN's own kline."""
#
#
# `T-01.7` (`CST-203`). The judgement lives in `domain/candle_fidelity.py`, pure and offline;
# this file is the only part that talks to a network, which is what keeps the whole assert
# verifiable by `backend/scripts/test.sh` under its amputated socket ("ZERO REDE"): both ports
# below are `Protocol`s the suite substitutes fakes into, the same shape every other collector in
# this package already uses.
#
# Two sources, one comparison:
#
#   * the ORIGIN — `GET /fapi/v1/klines` through `infra/binance_klines_client.BinanceKlinesClient`,
#     the SAME client the collector and the backfill read production through. Deliberately the
#     same one: a second HTTP client here could disagree with the producer about what the venue
#     said, and then the harness would be measuring the difference between two readers instead of
#     the fidelity of one writer;
#   * OURS — `GET /api/v1/series-history`, the served read path, at `bar_policy=final_only`. Also
#     deliberate: comparing against the DATABASE would exonerate a read path that the screen
#     actually goes through, and `RF-3`'s candle is drawn from this endpoint's rows, not from
#     `md.series` directly.
#
# ── THE EXIT CODES, AND `rc=3` IS THE ONE THAT MATTERS ───────────────────────────────────────
#
#   `0` FAITHFUL  — every stored reading equalled the origin, over a universe the report names.
#   `1` REJECTED  — at least one divergence, or a `LOCF` run longer than the declared bound.
#   `3` NOT MEASURED — the window held no stored point (or the comparison was refused).
#
# ⛔ `rc=3` EXISTS BECAUSE OF `ADR-012`, AND IT IS THE WHOLE REASON THIS HARNESS CAN BE TRUSTED
# WHEN IT IS GREEN. At the moment `T-01.7` was written the assert's own window
# (`2026-09-18 12:00 -> 16:00 UTC`) held `0/240` points in all four reductions, with a 90-day
# backfill still in flight. A tool that answered `rc=0` over that window would be reporting
# "nothing diverged" for a universe it never looked at — the exact `rc=0` ambiguity `ADR-012`
# names, and the exact way a falsifier stops falsifying anything without a single line changing.
# An empty comparison is NOT a small comparison; it is the absence of one.

from __future__ import annotations

import argparse
import http.client
import json
import logging
import sys
from collections.abc import Callable, Mapping, Sequence
from decimal import Decimal, InvalidOperation
from typing import Final, Protocol, TextIO, cast
from urllib.parse import urlencode

from src.modules.sentimento.domain.candle_fidelity import (
    MAX_LOCF_RUN_LENGTH,
    CandleFidelityError,
    CandleFidelityReport,
    FidelityVerdict,
    OriginCandle,
    StoredReading,
    compare_candles,
)
from src.modules.sentimento.domain.klines_ohlc_catalog import (
    KLINES_OHLC_INTERVAL,
    KLINES_OHLC_METRIC,
    KLINES_OHLC_NATIVE_GRID_MS,
    KLINES_OHLC_REDUCTIONS,
)
from src.modules.sentimento.domain.series_key import Reduction
from src.modules.sentimento.infra.binance_klines_client import (
    MAX_LIMIT,
    BinanceKlinesClient,
    KlineRow,
    KlinesPageResponse,
)
from src.modules.sentimento.use_cases.series_catalog import list_series_catalog

# A NAMED LOGGER, NEVER `print` — `core.print-statement`, and the rule is right about this
# file even though its output IS the product: `ingest_health_cli.py` took the same position for
# the same reason, and its docstring states it in one line ("a NAMED logger writing `stdout`,
# never `print`"). The report is what an operator and a gate read, so it goes to `stdout` with
# a bare `%(message)s` format; the refusal goes to `stderr` at `ERROR`, so a shell that pipes
# the report never swallows the reason it is empty.
logger = logging.getLogger(__name__)

EXIT_FAITHFUL: Final[int] = 0
EXIT_REJECTED: Final[int] = 1
EXIT_NOT_MEASURED: Final[int] = 3

SERIES_HISTORY_PATH: Final[str] = "/api/v1/series-history"

# `final_only`, never `intrabar`, and the choice is the assert itself rather than a parameter:
# `[M-9]`'s hypothesis is that an INTRABAR SNAPSHOT is being stored AS final. Reading back under
# `intrabar` would admit exactly the rows whose finality is in question and hide the defect
# behind the policy that tolerates it.
BAR_POLICY: Final[str] = "final_only"

# How many diverging buckets a unilateral-bias claim needs before it is a signature rather than
# a coin flip. FOUR, which is the `n` `[M-9]` itself reported (`pos=0` in `4/4`): under a fair
# coin, four same-sign draws is `2 * 0,5**4 = 12,5%` — already uncomfortable — while three is
# `25%` and two is `50%`, which is not evidence of anything.
MINIMUM_BIAS_N: Final[int] = 4


class SeriesHistoryFetcher(Protocol):
    """The one call this harness makes against our own API."""

    def rows(
        self,
        *,
        series_key_id: str,
        symbol: str,
        window_start_ms: int,
        window_end_ms: int,
        knowledge_time_ms: int,
    ) -> Sequence[Mapping[str, object]]:
        """Return the `rows` array of one `/series-history` response, unprojected."""
        ...


class HistoryResponseLike(Protocol):
    """The two things this fetcher needs from a response — the sibling client's own shape."""

    @property
    def status(self) -> int:
        """Return the HTTP status line's code."""
        ...

    def read(self) -> bytes:
        """Drain the body, which MUST happen before the connection can be released."""
        ...


class HistoryConnectionLike(Protocol):
    """A connection to our own API.

    Declared as a `Protocol` rather than as `http.client.HTTPConnection` for the reason
    `infra/binance_klines_client.py` already declares its own: the substitution the offline
    suite performs has to be a TYPED one. A concrete class here would force every test to
    silence `mypy` at the call site, and a silenced error also silences the day a FOURTH method
    starts being called on this object.
    """

    def request(self, method: str, url: str) -> None:
        """Send one request."""
        ...

    def getresponse(self) -> HistoryResponseLike:
        """Read the response off the wire."""
        ...

    def close(self) -> None:
        """Release the connection."""
        ...


class HttpSeriesHistoryFetcher:
    """`SeriesHistoryFetcher` over plain HTTP, one connection per call.

    `http.client` and not `urllib.request`, the same choice every network client in this
    package made and for the same reason: one object, no global opener state, and a connection
    factory a test can substitute.
    """

    def __init__(
        self,
        host: str,
        port: int,
        *,
        connection_factory: Callable[[str, int], HistoryConnectionLike] | None = None,
    ) -> None:
        """Wire the fetcher to a host and port; nothing is sent here."""
        self._host = host
        self._port = port
        self._connection_factory = connection_factory or _open_http_connection

    def rows(
        self,
        *,
        series_key_id: str,
        symbol: str,
        window_start_ms: int,
        window_end_ms: int,
        knowledge_time_ms: int,
    ) -> Sequence[Mapping[str, object]]:
        """`GET /api/v1/series-history` for one series and one window."""
        query = urlencode(
            {
                "series_key_id": series_key_id,
                "symbol": symbol,
                "interval": KLINES_OHLC_INTERVAL,
                "window_start_ms": window_start_ms,
                "window_end_ms": window_end_ms,
                "knowledge_time_ms": knowledge_time_ms,
                "bar_policy": BAR_POLICY,
            }
        )
        connection = self._connection_factory(self._host, self._port)
        try:
            connection.request("GET", f"{SERIES_HISTORY_PATH}?{query}")
            response = connection.getresponse()
            body = response.read()
            if response.status != 200:
                raise CandleFidelityError(
                    f"{SERIES_HISTORY_PATH} answered HTTP {response.status} for "
                    f"series_key_id={series_key_id}: a comparison cannot be drawn from a "
                    f"response the read path itself refused"
                )
        finally:
            connection.close()
        payload = json.loads(body)
        if not isinstance(payload, dict) or "rows" not in payload:
            raise CandleFidelityError(
                f"{SERIES_HISTORY_PATH} answered a body with no `rows` array, so there is "
                f"nothing to compare: {body[:200]!r}"
            )
        return cast(Sequence[Mapping[str, object]], payload["rows"])


def _open_http_connection(host: str, port: int) -> HistoryConnectionLike:
    """Open one plain-HTTP connection — the API is reached over the host's own loopback."""
    return http.client.HTTPConnection(host, port, timeout=30)


def klines_ohlc_key_ids(symbol: str) -> Mapping[Reduction, str]:
    """Return the four SERVED `series_key_id`s, read off the catalog the API itself serves.

    ⛔ THEY ARE NOT REBUILT HERE, AND THAT IS THE POINT. `series_key_id()` is a `sha256` over
    fifteen terms including `verified_by`, so a harness that constructed its own keys would
    address four ids that no row was ever written under, read `422 UnknownSeriesKeyIdError` or
    an empty series, and report `NOT MEASURED` for a series that is in fact full — a false
    negative that looks exactly like the true one this task expects to see. Asking
    `list_series_catalog` is asking the same function `/series-history` resolves ids through.
    """
    entries = {
        entry.key.reduction: entry.key.series_key_id()
        for entry in list_series_catalog(symbol).entries
        if entry.key.metric == KLINES_OHLC_METRIC
    }
    missing = [r.value for r in KLINES_OHLC_REDUCTIONS if r not in entries]
    if missing:
        raise CandleFidelityError(
            f"the served catalog has no `{KLINES_OHLC_METRIC}` row for {missing} on {symbol}, "
            f"so those readings are unaddressable on the wire and cannot be compared"
        )
    return {reduction: entries[reduction] for reduction in KLINES_OHLC_REDUCTIONS}


def origin_candles(
    client_klines: Callable[..., KlinesPageResponse],
    *,
    symbol: str,
    window_start_ms: int,
    window_end_ms: int,
) -> tuple[OriginCandle, ...]:
    """Walk `/fapi/v1/klines` over the window, keeping only buckets that lie INSIDE it.

    The endpoint answers at most `MAX_LIMIT` bars per call, so a window wider than that is
    walked forward by `startTime` — the same four real stopping conditions the backfill uses
    (a short page, an empty page, an error envelope, the cursor passing the window's end), and
    never a loop guard.
    """
    collected: dict[int, OriginCandle] = {}
    cursor = window_start_ms
    while cursor < window_end_ms:
        page = client_klines(
            symbol,
            KLINES_OHLC_INTERVAL,
            MAX_LIMIT,
            start_time_ms=cursor,
            end_time_ms=window_end_ms,
        )
        if page.api_code is not None:
            raise CandleFidelityError(
                f"/fapi/v1/klines refused the origin page with code {page.api_code}: the "
                f"GROUND TRUTH of this comparison is missing, which is NOT MEASURED"
            )
        if not page.rows:
            break
        for row in page.rows:
            if window_start_ms <= row.open_time_ms < window_end_ms:
                collected[row.open_time_ms] = origin_candle_of(row)
        if len(page.rows) < MAX_LIMIT:
            break
        cursor = page.rows[-1].open_time_ms + KLINES_OHLC_NATIVE_GRID_MS
    return tuple(collected[key] for key in sorted(collected))


def origin_candle_of(row: KlineRow) -> OriginCandle:
    """Read one `KlineRow`'s four prices BY NAME — never by index, never by position."""
    return OriginCandle(
        open_time_ms=row.open_time_ms,
        open=_decimal_of(row.open_price, "open"),
        high=_decimal_of(row.high_price, "high"),
        low=_decimal_of(row.low_price, "low"),
        close=_decimal_of(row.close_price, "close"),
    )


def stored_readings(
    fetcher: SeriesHistoryFetcher,
    *,
    symbol: str,
    window_start_ms: int,
    window_end_ms: int,
    knowledge_time_ms: int,
) -> tuple[StoredReading, ...]:
    """Read the four served series over the window and project them onto `StoredReading`."""
    key_ids = klines_ohlc_key_ids(symbol)
    readings: list[StoredReading] = []
    for reduction in KLINES_OHLC_REDUCTIONS:
        for row in fetcher.rows(
            series_key_id=key_ids[reduction],
            symbol=symbol,
            window_start_ms=window_start_ms,
            window_end_ms=window_end_ms,
            knowledge_time_ms=knowledge_time_ms,
        ):
            readings.append(stored_reading_of(reduction, row))
    return tuple(readings)


def stored_reading_of(reduction: Reduction, row: Mapping[str, object]) -> StoredReading:
    """Project one wire row onto a `StoredReading`, carrying the value as `Decimal`.

    ⛔ `Decimal(str(...))` AND NEVER `float(...)`. The endpoint serves `value` as the source's
    own decimal string precisely so nothing on the way to the screen re-quantises it, and
    `float("80960.00")` is the nearest binary double to that number, not that number. A
    comparison against the origin at ZERO tolerance would then fail on the arithmetic of the
    harness itself and blame the writer.
    """
    raw_value = row.get("value")
    absence = row.get("absence")
    available_at = row.get("available_at")
    return StoredReading(
        reduction=reduction,
        event_time=int(cast(int, row["event_time"])),
        value=None if raw_value is None else _decimal_of(str(raw_value), "value"),
        available_at=None if available_at is None else int(cast(int, available_at)),
        absence=None if raw_value is not None else str(absence or "SEM_PONTO"),
    )


def _decimal_of(text: str, field: str) -> Decimal:
    """Parse one decimal string, refusing anything the venue could not have quoted."""
    try:
        return Decimal(text)
    except InvalidOperation as failure:
        raise CandleFidelityError(
            f"`{field}` came back as {text!r}, which is not a decimal number: this harness "
            f"compares at ZERO tolerance and cannot guess what was meant"
        ) from failure


def format_report(report: CandleFidelityReport) -> str:
    """Render the report as the lines a human (and a gate log) reads — numbers WITH the universe.

    Every count is printed beside what it was drawn from, because a divergence count without
    the number of comparisons behind it is not a measurement: `0 divergences` over `0`
    comparisons and `0` over `960` are opposite facts that print identically otherwise.
    """
    lines = [
        f"symbol={report.symbol} verdict={report.verdict.value}",
        f"window: [{report.window_start_ms}, {report.window_end_ms}) "
        f"bar_policy={BAR_POLICY} minimum_bias_n={report.minimum_bias_n}",
        f"universe: origin_buckets={report.n_origin_buckets} compared={report.n_compared} "
        f"absent={report.n_absent} carried={report.n_carried} "
        f"divergences={len(report.divergences)}",
    ]
    for reduction in KLINES_OHLC_REDUCTIONS:
        counts = report.sign_counts[reduction]
        lines.append(
            f"  {reduction.value:<5} n={counts.n} pos={counts.positive} neg={counts.negative} "
            f"zero={counts.zero}"
        )
    for reduction in report.biased_reductions:
        counts = report.sign_counts[reduction]
        lines.append(
            f"  ⛔ UNILATERAL BIAS on {reduction.value}: pos={counts.positive} "
            f"neg={counts.negative} over n={counts.n_diverging} diverging buckets "
            f"(minimum_n={report.minimum_bias_n}) — the `[M-9]` signature, not noise"
        )
    for run in report.runs_exceeding_locf_bound:
        lines.append(
            f"  ⛔ LOCF RUN of {run.length} on {run.reduction.value} from "
            f"event_time={run.first_event_time} value={run.value} — longer than the "
            f"{MAX_LOCF_RUN_LENGTH} grid instants one stored bar is allowed to answer"
        )
    if report.divergences:
        traces = ", ".join(trace.value for trace in report.writer_traces)
        lines.append(f"  writer traces behind the divergences: {traces}")
        for divergence in report.divergences[:10]:
            lines.append(
                f"    {divergence.reduction.value:<5} t={divergence.event_time} "
                f"origin={divergence.origin_value} stored={divergence.stored_value} "
                f"delta={divergence.delta} trace={divergence.writer_trace.value} "
                f"lag_ms={divergence.publication_lag_ms}"
            )
    if report.carried_divergences:
        lines.append(
            f"  ⚠️ {len(report.carried_divergences)} of the {report.n_carried} CARRIED cells "
            f"disagreed with the origin bucket they were drawn on. This is `LOCF` over a HOLE "
            f"in the collection, not a write defect — see `WriterTrace.CARRIED`. It does not "
            f"move the verdict, and it does mean those minutes have no observation of their own:"
        )
        for divergence in report.carried_divergences[:5]:
            lines.append(
                f"    {divergence.reduction.value:<5} t={divergence.event_time} "
                f"origin={divergence.origin_value} carried={divergence.stored_value} "
                f"delta={divergence.delta} lag_ms={divergence.publication_lag_ms}"
            )
    if report.verdict is FidelityVerdict.NOT_MEASURED:
        lines.append(
            "  ⛔ NOT MEASURED: no stored point fell inside this window, so nothing was "
            "compared. This is rc=3 and never rc=0 — see this module's docstring on `ADR-012`."
        )
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    """Declare the arguments; every one of them is required except the API location."""
    parser = argparse.ArgumentParser(
        prog="candle-fidelity",
        description="Compare the stored klines_ohlc candle against the origin's own kline.",
    )
    parser.add_argument("--symbol", required=True)
    parser.add_argument("--window-start-ms", type=int, required=True)
    parser.add_argument("--window-end-ms", type=int, required=True)
    parser.add_argument("--knowledge-time-ms", type=int, required=True)
    parser.add_argument("--api-host", default="127.0.0.1")
    parser.add_argument("--api-port", type=int, default=8000)
    return parser


def run(
    *,
    symbol: str,
    window_start_ms: int,
    window_end_ms: int,
    knowledge_time_ms: int,
    klines: Callable[..., KlinesPageResponse],
    fetcher: SeriesHistoryFetcher,
) -> CandleFidelityReport:
    """Fetch both sides and hand them to the pure comparison — no judgement lives here."""
    if window_end_ms <= window_start_ms:
        raise CandleFidelityError(
            f"window [{window_start_ms}, {window_end_ms}) is empty or inverted, so the "
            f"universe of this comparison would be empty by construction"
        )
    return compare_candles(
        symbol=symbol,
        window_start_ms=window_start_ms,
        window_end_ms=window_end_ms,
        origin=origin_candles(
            klines,
            symbol=symbol,
            window_start_ms=window_start_ms,
            window_end_ms=window_end_ms,
        ),
        stored=stored_readings(
            fetcher,
            symbol=symbol,
            window_start_ms=window_start_ms,
            window_end_ms=window_end_ms,
            knowledge_time_ms=knowledge_time_ms,
        ),
        minimum_bias_n=MINIMUM_BIAS_N,
    )


def configure_output(out: TextIO | None = None, err: TextIO | None = None) -> None:
    """Send the report to `stdout` and the refusal to `stderr`, both through the named logger.

    It REPLACES whatever handlers this logger already had rather than adding to them, and the
    two obvious alternatives are both worse: adding would duplicate every line on a second call
    (a duplicated report matches no hash and no eye), and returning early would leave the
    handlers bound to a stream that is no longer the process's `stdout` — which is exactly the
    state a second run inside one interpreter is in. `propagate = False` keeps the root logger
    from re-emitting every line, the same reason `ingest_health_cli.py` sets it.
    """
    for existing in tuple(logger.handlers):
        logger.removeHandler(existing)
    report_handler = logging.StreamHandler(sys.stdout if out is None else out)
    report_handler.setLevel(logging.INFO)
    report_handler.addFilter(lambda record: record.levelno < logging.WARNING)
    refusal_handler = logging.StreamHandler(sys.stderr if err is None else err)
    refusal_handler.setLevel(logging.WARNING)
    for handler in (report_handler, refusal_handler):
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False


def main(
    argv: Sequence[str],
    *,
    klines: Callable[..., KlinesPageResponse] | None = None,
    fetcher: SeriesHistoryFetcher | None = None,
) -> int:
    """Run one comparison and map its verdict onto the three exit codes.

    The two ports are parameters with production defaults for the reason every collector in
    this package takes the same shape: the offline suite runs under an amputated socket, and
    the MAPPING FROM VERDICT TO EXIT CODE is what a gate actually reads. Leaving it reachable
    only through a real network call would make the one line a gate depends on the one line no
    test ever executes.
    """
    args = build_parser().parse_args(list(argv))
    configure_output()
    try:
        report = run(
            symbol=args.symbol,
            window_start_ms=args.window_start_ms,
            window_end_ms=args.window_end_ms,
            knowledge_time_ms=args.knowledge_time_ms,
            klines=BinanceKlinesClient().klines if klines is None else klines,
            fetcher=HttpSeriesHistoryFetcher(args.api_host, args.api_port)
            if fetcher is None
            else fetcher,
        )
    except CandleFidelityError as refusal:
        logger.error("RECUSA: %s", refusal)
        return EXIT_NOT_MEASURED
    for line in format_report(report).splitlines():
        logger.info(line)
    return {
        FidelityVerdict.FAITHFUL: EXIT_FAITHFUL,
        FidelityVerdict.REJECTED: EXIT_REJECTED,
        FidelityVerdict.NOT_MEASURED: EXIT_NOT_MEASURED,
    }[report.verdict]


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main(sys.argv[1:]))
