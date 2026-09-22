"""`resolve_source_floor_ms(key, knowledge_time_ms)` — the upstream API's own historical wall.

`D8`/`D-C3.7` (`SPEC-008` §7.3, `JULGAMENTO-FRONTEND-ARCHITECT.md` §"`D-C3.7`"): `panel.coverage`
on the `/series-history` envelope needs `source_floor_ms`, "a parede da API" — a DIFFERENT
grandeza from `earliest_bucket_ms`/`latest_bucket_ms` (those are OUR OWN STORE's bounds,
resolved by `use_cases/series_history.py` against `SeriesStoreBoundsReader`/`md.series`; this
module never touches a store or a clock — `knowledge_time_ms` arrives as a PARAMETER, the same
`time`-out-of-`domain` contract `backend/pyproject.toml` already enforces for every other pure
function in this package).

── WHY `knowledge_time_ms`, NEVER A FRESH WALL-CLOCK READ ──────────────────────────────────

The ROLLING branch below needs *some* notion of "now" to subtract 30 days from. The route
already reads the wall clock once, into `knowledge_time_ms` — the SAME instant `as_of_batch`
already treats as "what does the world look like as of this request" for every other value in
the row. Re-reading `time.time_ns()` a second time (`session.server_now_ms`, `src.api.routes.
series_history._now_ms`) for THIS field would make `panel.coverage.source_floor_ms` drift
between two otherwise-identical requests by however many milliseconds elapse between them —
breaking `CA-F1-2` (`test_series_history_route.py::
test_two_identical_requests_produce_byte_identical_bodies`), which the `session.server_now_ms`
field is the ONE deliberate, well-known exception to. `knowledge_time_ms` is already part of
the request's own KEY (the caller supplies it), so reusing it keeps `source_floor_ms` a pure
function of the request, exactly like every other field this route serves.

── WHY THE DOMAIN COVERED HERE IS TWO CASES, NEVER FIFTEEN ─────────────────────────────────

`D-C3.7`'s own text names exactly two measured walls, and this module answers ONLY those two —
`None` for every `SeriesKey` outside them, never a guess, never a percentage. It is the same
"no number without a measurement" discipline `BucketCoverage` (`series_history_report.py`)
already applies one level down, and the same shape `series_reduction_gate.py`'s allowlist uses
for `(RATIO, POINT)`: a closed set, grown only by a NEW measurement, never inferred from the
set's own existence.

  * **`/fapi/v1/klines`** — a FIXED epoch, `2019-09-08T00:00:00Z` = `1_567_900_800_000` ms
    `[MEDIDO 2026-09-10, SPEC-007 §9.2, infra/binance_klines_client.py:33: "the source is deep,
    serving BTCUSDT since 2019-09-08"]`. Every series this route can serve that is READ off that
    endpoint shares the wall: `klines_last` (`price_source_catalog.py`), `klines_volume`
    (`klines_volume_catalog.KLINES_VOLUME_METRIC`), `klines_ohlc`
    (`klines_ohlc_catalog.KLINES_OHLC_METRIC`), and `cvd_source`'s `kline_takerbuy` row —
    `provider="binance"`, `quantity_field=NA`, the ONE `cvd_source` variant actually backed by
    `/fapi/v1/klines` (`cvd_source_catalog.build_kline_takerbuy_entry`'s own docstring: "CVD read
    off `/fapi/v1/klines`").
  * **`/futures/data/*`** — a ROLLING wall, `~30 days` behind `knowledge_time_ms`
    `[MEDIDO 2026-09-12: startTime de -30d -> HTTP 200 com 12 pontos; -35d e -60d -> HTTP 400
    {"msg":"parameter 'startTime' is invalid.","code":-1130}, infra/collectors_cli.py:344]`.
    `sum_open_interest` (`provider="binance"` — the Coinalyze row of the SAME metric name reads
    a different origin, gated out below by the `provider` check first) and
    `count_long_short_ratio` read this family (`ADR-038` §3, literal: "`D1` vale para
    `/futures/data/openInterestHist` e para `/futures/data/globalLongShortAccountRatio`").

── EVERYTHING ELSE RETURNS `None`, AND THAT IS THE ANSWER, NOT A GAP TO FILL HERE ───────────

`provider="coinalyze"` (the OI/liquidation/CVD-reconstruction rows Coinalyze publishes) has NO
measured retention anywhere in this tree — inventing one would be exactly the fabricated number
`CLAUDE.md`'s "nenhum número sem o comando" forbids. `price_mark_close` (`/fapi/v1/premiumIndex`)
has no REST *history* endpoint the way `klines`/`futures/data` do — it is polled live, so its
own wall is `earliest_bucket_ms` (our first capture), not a source wall this module can name.
`cvd_source`'s `aggtrade_q`/`aggtrade_nq` rows (`quantity_field=Q`/`NQ`) are CAPTURE-OR-LOSE
(`CL-5`) — read live off the trade WebSocket, never a pageable REST history, so they have no
source floor either. Extending this table to any of those is a FUTURE task with its own
measurement, not a judgement call this module gets to make silently — the same precedent
`T-03.4-builder.md` set for `sum_liquidation`'s denominator.
"""

from __future__ import annotations

from typing import Final

from src.modules.sentimento.domain.cvd_source_catalog import CVD_SOURCE_METRIC
from src.modules.sentimento.domain.klines_ohlc_catalog import KLINES_OHLC_METRIC
from src.modules.sentimento.domain.klines_volume_catalog import KLINES_VOLUME_METRIC
from src.modules.sentimento.domain.long_short_ratio_series import COUNT_LONG_SHORT_RATIO
from src.modules.sentimento.domain.series_key import QuantityField, SeriesKey

# `2019-09-08T00:00:00Z`, transcribed — never re-derived from a `datetime` here, this module
# reads no clock — from `infra/binance_klines_client.py:33`'s own measurement
# `[MEDIDO 2026-09-10, SPEC-007 §9.2]`.
KLINES_HISTORY_FLOOR_MS: Final[int] = 1_567_900_800_000

# `[MEDIDO 2026-09-12, infra/collectors_cli.py:344]`. A ROLLING wall, not a fixed epoch —
# resolved against the CALLER's `knowledge_time_ms` in `resolve_source_floor_ms` below, never
# against a clock this module reads itself (`backend/pyproject.toml` keeps `time` out of
# `domain`) — see the module docstring for why `knowledge_time_ms`, never a second wall-clock
# read.
_FUTURES_DATA_RETENTION_MS: Final[int] = 30 * 24 * 60 * 60 * 1000

# The `klines`-backed metrics. `klines_volume_catalog.py`/`klines_ohlc_catalog.py` each declare
# a `Final` constant this module imports rather than respells; `price_source_catalog.py` writes
# `"klines_last"` inline (no `Final` constant exists for it there either), so the same literal
# is written inline here — matched against the real catalog rows by `test_source_floor.py`
# (`test_klines_last_resolves_…`/`test_klines_volume_resolves_…`/`test_klines_ohlc_resolves_…`,
# each built through the production key-builder function, never a hand-rolled `SeriesKey`).
_KLINES_METRICS: Final[frozenset[str]] = frozenset(
    {"klines_last", KLINES_VOLUME_METRIC, KLINES_OHLC_METRIC}
)

# The `/futures/data/*`-backed metrics. `open_interest_catalog.py`'s binance row has no `Final`
# constant either (`"sum_open_interest"` is written inline there), so the same literal is used
# here, matched by the same kind of test as `_KLINES_METRICS` above; `COUNT_LONG_SHORT_RATIO` IS
# a `Final` constant (`long_short_ratio_series.py`) and is imported rather than respelled — the
# same precedent `series_reduction_gate.RATIO_POINT_METRIC_ALLOWLIST` already set.
_FUTURES_DATA_METRICS: Final[frozenset[str]] = frozenset(
    {"sum_open_interest", COUNT_LONG_SHORT_RATIO}
)


def resolve_source_floor_ms(key: SeriesKey, *, knowledge_time_ms: int) -> int | None:
    """Return the upstream API's own historical wall for `key`, or `None` if unmeasured.

    `knowledge_time_ms` feeds ONLY the `/futures/data/*` rolling branch — never a fresh wall-
    clock read, so the result stays a pure function of the request (see the module docstring's
    `CA-F1-2` argument). `None` is not "not yet implemented" — it is the honest answer for
    `provider="coinalyze"`, for `price_mark_close`, and for the `cvd_source` rows read live off
    the trade stream (`aggtrade_q`/`aggtrade_nq`). See the module docstring for the measurement
    each branch below carries, and for why extending this table is a future task's decision,
    never this function's.
    """
    if key.provider != "binance":
        return None
    if key.metric in _KLINES_METRICS:
        return KLINES_HISTORY_FLOOR_MS
    if key.metric == CVD_SOURCE_METRIC:
        # Only `kline_takerbuy` (`quantity_field=NA`) is read off `/fapi/v1/klines` — the
        # `aggtrade_q`/`aggtrade_nq` siblings (`Q`/`NQ`) are the live-captured rows the module
        # docstring names as having no source floor at all.
        return KLINES_HISTORY_FLOOR_MS if key.quantity_field is QuantityField.NA else None
    if key.metric in _FUTURES_DATA_METRICS:
        return knowledge_time_ms - _FUTURES_DATA_RETENTION_MS
    return None
