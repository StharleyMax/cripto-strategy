"""`GET /series-catalog` over a REAL loopback socket — same idiom as `test_ready_route.py`.

`D3.1` (plan `03`): `curl -s $API$PREFIX/series-catalog | python3 -c '...print(d["n_entries"],
len(d["entries"]))'` must show the SAME number twice, and `grep -rn 'SELECT' backend/src/api |
wc -l` must be `0` (checked as a static grep in this task's QA gate report, not here — a pytest
cannot assert the ABSENCE of a SQL statement the handler never had a chance to write).

The number itself is `10`, not the `7` `SPEC-003`/`tasks.toml` write — see
`use_cases/series_catalog.py`'s own docstring and `test_series_catalog_use_case.py`'s
`test_the_real_catalog_has_ten_rows_not_seven` for the measured reason. This suite asserts `10`
(the REAL total), not `7`, because a route that quietly served 7 by dropping three real
Coinalyze rows would be the regression, not the fix.
"""

from __future__ import annotations

import http.client
import json
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import pytest
import uvicorn
from fastapi import FastAPI

from src.api.dependencies import get_series_catalog_source
from src.main import create_app
from src.modules.sentimento.domain.klines_ohlc_catalog import (
    KLINES_OHLC_INTERVAL,
    KLINES_OHLC_METRIC,
    KLINES_OHLC_NATIVE_GRID,
    KLINES_OHLC_REDUCTIONS,
    build_klines_ohlc_key,
)
from src.modules.sentimento.domain.series_catalog import SeriesCatalog, SeriesCatalogEntry
from src.modules.sentimento.domain.series_key import (
    Nature,
    QuantityField,
    Reduction,
    SeriesKey,
    TsConvention,
)

_STARTUP_POLL_S = 0.005
_JOIN_TIMEOUT_S = 5.0


@contextmanager
def _served(app: FastAPI) -> Iterator[int]:
    """Run `app` on a real loopback socket, in-thread, and yield the port it bound."""
    config = uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    while not server.started:
        time.sleep(_STARTUP_POLL_S)
    port = server.servers[0].sockets[0].getsockname()[1]
    try:
        yield port
    finally:
        server.should_exit = True
        thread.join(timeout=_JOIN_TIMEOUT_S)


def _get_series_catalog(port: int) -> tuple[int, dict[str, object]]:
    """`GET /api/v1/series-catalog`, returning `(status, parsed body)`."""
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    connection.request("GET", "/api/v1/series-catalog")
    response = connection.getresponse()
    body = json.loads(response.read())
    connection.close()
    return response.status, body


# The fifteen terms `_series_key_to_wire` publishes, camelCase, as `series-catalog.ts:67-83`
# names them. Written out here and compared as a SET so that a term the route stops publishing
# — or one it starts publishing — fails a test instead of reaching the front as a shape change.
# `verifiedBy` is the fifteenth term of the key, so it enters the `sha256` that
# `/api/v1/series-history` looks rows up by. It is compared against the NAME OF THE FILE ON
# DISK that `T-01.1` wrote — never against a literal this file also owns, which would be a copy
# of itself and would stay green for two sides that drifted together by one character.
_KLINES_OHLC_VERIFIER = (
    Path(__file__).resolve().parents[1] / "sentimento" / "test_klines_ohlc_catalog.py"
)


_SERIES_KEY_WIRE_FIELDS = {
    "provider",
    "venue",
    "instrumentId",
    "metric",
    "cohort",
    "interval",
    "unit",
    "denom",
    "nature",
    "tsConvention",
    "reduction",
    "quantityField",
    "labelShift",
    "aggregationScope",
    "verifiedBy",
}


def _key_from_wire(wire: dict[str, Any]) -> SeriesKey:
    """Rebuild a `SeriesKey` from the fifteen terms the ROUTE published.

    The inverse of `series_catalog._series_key_to_wire`, written out by hand rather than
    imported: importing a decoder written by the encoder's own author would let a matched pair
    of mistakes cancel out. Every term is named, so a term the route stopped publishing raises
    `KeyError` instead of quietly defaulting to something plausible.
    """
    return SeriesKey(
        provider=wire["provider"],
        venue=wire["venue"],
        instrument_id=wire["instrumentId"],
        metric=wire["metric"],
        cohort=wire["cohort"],
        interval=wire["interval"],
        unit=wire["unit"],
        denom=wire["denom"],
        nature=Nature(wire["nature"]),
        ts_convention=TsConvention(wire["tsConvention"]),
        reduction=Reduction(wire["reduction"]),
        quantity_field=QuantityField(wire["quantityField"]),
        label_shift=wire["labelShift"],
        aggregation_scope=wire["aggregationScope"],
        verified_by=wire["verifiedBy"],
    )


def test_get_series_catalog_serves_the_whole_pilot_universe_when_the_process_is_up(
    tmp_path: Path,
) -> None:
    """CALA: process up -> `200`, `n_entries == len(entries) == 76` — the REAL total.

    `store_path` here is `/ingest-health`'s dependency, irrelevant to this route (`0` SQL in the
    handler, `D5.13c`'s sibling restriction) — a fresh, uninitialised store still serves this
    route correctly, proving the catalog carries no coupling to the ingest-health store.

    Was `10` until `T-01.6` registered `klines_volume`, then `11`, then `11 x 4 = 44` when the
    pilot universe landed, `13 x 4 = 52` after `T-02.4`/`T-04.4`, `15 x 4 = 60` after `T-05.8`
    registered BOTH `sum_liquidation` cohorts (`SPEC-007` §4.5, row M4 — two rows per
    instrument, because their sum would erase which leg was flushed), and is now `19 x 4 = 76`
    after `T-01.6` of `SPEC-008` registered the four `klines_ohlc` rows (`RF-2`):
    `create_app` wires `list_pilot_series_catalog()`, covering the four instruments the
    collector actually writes `md.series` rows for. Serving one of them was the finding — the
    other three answered `422 UnknownSeriesKeyIdError` with their rows already on disk
    `[MEDIDO 2026-09-11: 12 series_key_id distintos em md.series, 4 deles de klines; o
    catalogo servido resolvia 1]`.

    This is the HTTP-level half of that DoD — "`GET /api/v1/series-catalog` lista a entrada" —
    asserted over a real socket against the real `create_app`, not against the use case
    directly, because the composition in `src/main/__init__.py` is itself a place the wiring
    could be lost.

    `RS-1` is checked in the same breath: the three top-level fields and the entry field names
    below are unchanged, and the fifteen `BTCUSDT` rows that already had indices keep them —
    this moved CONTENT (more rows, appended) and not FORM.
    """
    store_path = tmp_path / "ih.sqlite3"

    with _served(create_app(store_path=store_path)) as port:
        status, body = _get_series_catalog(port)

    assert status == 200
    assert set(body) == {"query", "n_entries", "entries"}
    assert body["query"] == "series_catalog"
    assert body["n_entries"] == 76
    entries = body["entries"]
    assert isinstance(entries, list)
    assert len(entries) == 76

    served_metrics = [e["key"]["metric"] for e in entries]
    assert served_metrics.count("klines_volume") == 4
    # `T-02.4` appends the klines-borne `cvd_source` row AFTER `klines_volume`, so within each
    # instrument's block of NINETEEN the volume row is at offset 10, the CVD row at 11, the
    # long/short row at 12, the two `sum_liquidation` cohorts at 13 (`long`) and 14 (`short`)
    # — `T-05.8` — and the four `klines_ohlc` readings at 15..18 (`T-01.6` of `SPEC-008`).
    # Asserting the OFFSETS, not only the counts, is what makes a reordering fail here.
    assert served_metrics[10] == "klines_volume"
    assert served_metrics[11] == "cvd_source"
    assert served_metrics[12] == "count_long_short_ratio"
    assert served_metrics[13] == served_metrics[14] == "sum_liquidation"
    # The TAIL is now `klines_ohlc`'s `CLOSE` — `T-01.6` of `SPEC-008` appended four rows
    # after the two liquidation cohorts, so the last row of the last instrument's block is the
    # fourth candle reading and no longer `sum_liquidation`.
    assert served_metrics[-1] == KLINES_OHLC_METRIC
    assert entries[-1]["key"]["reduction"] == KLINES_OHLC_REDUCTIONS[-1].value
    assert served_metrics.count("count_long_short_ratio") == 4
    assert served_metrics.count("sum_liquidation") == 8
    assert [index % 19 for index, m in enumerate(served_metrics) if m == "klines_volume"] == [
        10,
        10,
        10,
        10,
    ]
    # `T-01.6` of `SPEC-008`: the four candle readings are the TAIL of every instrument's
    # block, in `OPEN`/`HIGH`/`LOW`/`CLOSE` order. Pinning the offsets AND the reductions is
    # what makes a permutation bite — all four carry the same `metric`, so a metric-only
    # assertion would stay green while `HIGH` and `LOW` swapped places on the wire.
    assert served_metrics[15:19] == [KLINES_OHLC_METRIC] * 4
    assert [index % 19 for index, m in enumerate(served_metrics) if m == KLINES_OHLC_METRIC] == [
        15,
        16,
        17,
        18,
    ] * 4
    assert served_metrics.count(KLINES_OHLC_METRIC) == 16
    # `T-05.8`: the TWO cohorts are served per instrument, never one netted row — the
    # discrimination `RF-2` exists for, asserted over the real HTTP response.
    served_liquidation_cohorts = [
        (e["key"]["instrumentId"], e["key"]["cohort"])
        for e in entries
        if e["key"]["metric"] == "sum_liquidation"
    ]
    assert sorted(served_liquidation_cohorts) == sorted(
        (instrument, cohort)
        for instrument in ("BTCUSDT", "ETHUSDT", "LINKUSDT", "SOLUSDT")
        for cohort in ("long", "short")
    )

    served_instruments = [e["key"]["instrumentId"] for e in entries]
    assert set(served_instruments) == {"BTCUSDT", "ETHUSDT", "LINKUSDT", "SOLUSDT"}
    assert set(served_instruments[:19]) == {"BTCUSDT"}

    # A1 at the wire: a `denom="base"` row carries the INSTRUMENT's base asset, so the served
    # `ETHUSDT` volume is `ETH` and never the `"BTC"` the old module-level literal published.
    eth_base_units = {
        e["key"]["unit"]
        for e in entries
        if e["key"]["instrumentId"] == "ETHUSDT" and e["key"]["denom"] == "base"
    }
    assert eth_base_units == {"ETH"}

    entry = entries[0]
    assert set(entry) == {
        "key",
        "nativeGrid",
        "maxStalenessMs",
        "priceUse",
        "reconstructedFrom",
        "publishedError",
    }
    key = entry["key"]
    assert set(key) == {
        "provider",
        "venue",
        "instrumentId",
        "metric",
        "cohort",
        "interval",
        "unit",
        "denom",
        "nature",
        "tsConvention",
        "reduction",
        "quantityField",
        "labelShift",
        "aggregationScope",
        "verifiedBy",
    }
    assert "completeness" not in body
    assert "completeness" not in entry


def test_get_series_catalog_serves_the_four_klines_ohlc_rows_with_the_complete_key(
    tmp_path: Path,
) -> None:
    """⛔ THE DoD OF `T-01.6` (`SPEC-008`): REGISTERED IS NOT SERVED, AND ONLY THIS MEASURES SERVED.

    A test over `list_series_catalog()` would pass with the route broken — `T-05.8` already
    paid for that distinction once, with a correct catalog behind a route answering `422`. So
    this goes through `create_app` over a REAL loopback socket and reads the bytes the wire
    carries.

    The assertion rebuilds a `SeriesKey` from the fifteen terms the ROUTE published and demands
    that its `series_key_id` be the one `build_klines_ohlc_key` produces. That is stronger than
    comparing field by field in two ways: a term the route STOPPED publishing raises `KeyError`
    here instead of defaulting, and a term the route published WRONG moves the `sha256` — which
    is the number `/api/v1/series-history` looks rows up by. Comparing the `metric` string alone
    would have stayed green for a row carrying the wrong `interval`, `unit` or `verifiedBy`,
    and every one of those is a series nothing writes to.

    Measured before this task, at `307c099`: `n_entries=60`, `klines_ohlc=0`
    `[MEDIDO 2026-09-19]`.
    """
    store_path = tmp_path / "ih.sqlite3"

    with _served(create_app(store_path=store_path)) as port:
        status, body = _get_series_catalog(port)

    assert status == 200
    entries = body["entries"]
    assert isinstance(entries, list)
    ohlc = [e for e in entries if e["key"]["metric"] == KLINES_OHLC_METRIC]

    assert len(ohlc) == 16
    for entry in ohlc:
        key_wire = entry["key"]
        assert set(key_wire) == _SERIES_KEY_WIRE_FIELDS
        canonical = build_klines_ohlc_key(
            Reduction(key_wire["reduction"]),
            instrument_id=key_wire["instrumentId"],
            verified_by=key_wire["verifiedBy"],
        )
        assert _key_from_wire(key_wire).series_key_id() == canonical.series_key_id()
        assert _KLINES_OHLC_VERIFIER.is_file()
        assert key_wire["verifiedBy"] == _KLINES_OHLC_VERIFIER.name
        assert key_wire["interval"] == KLINES_OHLC_INTERVAL
        assert entry["nativeGrid"] == KLINES_OHLC_NATIVE_GRID
        # `priceUse` stays `null`: `PRICE_SOURCES` is a closed set of five names and routing a
        # decision-path price question is `klines_last`'s job (`ADR-007`, `SPEC-008` §2.1). A
        # row that claimed one here would reopen `PS-1` through a side door.
        assert entry["priceUse"] is None

    # FOUR readings per instrument, in `OPEN`/`HIGH`/`LOW`/`CLOSE` order — the collapse
    # falsifier, at the wire. All sixteen rows carry the same `metric`, so a permutation or a
    # missing leg is invisible to any metric-only assertion.
    served_by_instrument: dict[str, list[str]] = {}
    for entry in ohlc:
        key_wire = entry["key"]
        served_by_instrument.setdefault(key_wire["instrumentId"], []).append(key_wire["reduction"])
    expected_reductions = [reduction.value for reduction in KLINES_OHLC_REDUCTIONS]
    assert set(served_by_instrument) == {"BTCUSDT", "ETHUSDT", "LINKUSDT", "SOLUSDT"}
    assert all(reductions == expected_reductions for reductions in served_by_instrument.values())
    # Sixteen DISTINCT addresses: `/api/v1/series-history` looks rows up by this id, so two
    # rows sharing one would make a reading unaddressable while the count stayed right.
    assert len({_key_from_wire(e["key"]).series_key_id() for e in ohlc}) == 16


def test_get_series_catalog_refuses_the_connection_when_the_process_is_down(
    tmp_path: Path,
) -> None:
    """MORDE: the SAME port, after the process is torn down, refuses — no payload assertion."""
    store_path = tmp_path / "ih.sqlite3"

    with _served(create_app(store_path=store_path)) as port:
        pass  # the block exits here, tearing the server down before the request below

    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    with pytest.raises(ConnectionRefusedError):
        connection.request("GET", "/series-catalog")


def test_the_dependency_override_is_genuinely_substitutable(tmp_path: Path) -> None:
    """A test-injected catalog reaches the wire — proves this is real DI, not decorative.

    Overrides `get_series_catalog_source` with a ONE-row fixture catalog on the SAME app the
    other tests serve unmodified: if the route imported `list_series_catalog()` directly instead
    of reading the injected value, this override would have no effect and `n_entries` would
    still read `10` — the exact regression this test exists to catch.
    """
    store_path = tmp_path / "ih.sqlite3"
    app = create_app(store_path=store_path)
    key = SeriesKey(
        provider="binance",
        venue="usdm_futures",
        instrument_id="ETHUSDT",
        metric="klines_last",
        cohort="all",
        interval="5m",
        unit="USDT",
        denom="quote",
        nature=Nature.STOCK,
        ts_convention=TsConvention.POINT_AT_BUCKET_END,
        reduction=Reduction.LAST,
        quantity_field=QuantityField.NA,
        label_shift=0,
        aggregation_scope="Symbol",
        verified_by="test_series_catalog_route.py",
    )
    fixture_catalog = SeriesCatalog(
        (
            SeriesCatalogEntry(
                key=key, native_grid="5min", native_grid_ms=300_000, max_staleness_ms=600_000
            ),
        )
    )
    app.dependency_overrides[get_series_catalog_source] = lambda: fixture_catalog

    with _served(app) as port:
        status, body = _get_series_catalog(port)

    assert status == 200
    assert body["n_entries"] == 1
    assert body["entries"][0]["key"]["instrumentId"] == "ETHUSDT"  # type: ignore[index]
