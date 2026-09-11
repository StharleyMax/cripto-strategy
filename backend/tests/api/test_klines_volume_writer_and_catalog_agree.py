"""The elo of the `SPEC-007` phase `01` slice: the WRITER and the CATALOG name one series.

⛔ THIS IS THE GATE FOR A BREAK THAT NO OTHER GATE CATCHES, AND THE SYMPTOM IS A `200`.

`verified_by` is the fifteenth term of `SeriesKey`, and `series_key_id()` is the `sha256` of
the canonical projection of all fifteen (`series_key.py:226-234`). Two production modules
independently name that term for `klines_volume`:

  * `use_cases/series_catalog.py` (`T-01.6`), which SERVES the row at `/api/v1/series-catalog`;
  * `use_cases/collector_series_mapping.py` (`T-01.3`), which WRITES the rows to `md.series`.

They are two literals because the module that owns the identity
(`domain/klines_volume_catalog.py`, `T-01.1`) exports the builder but not the `verified_by`
string, so neither side can read it off a single constant today. If the two ever diverge by one
character, EVERY OTHER GATE STAYS GREEN: the collector writes rows, `md.series` fills up,
`/api/v1/series-catalog` lists the entry, and `/api/v1/series-history` answers **`200` with
`n_points = 0`** — not a `422`, not an exception, not a log line. It is the `rc=0` ambiguity
`ADR-012` names, in its most expensive form: a successful, empty answer that is
indistinguishable from "this series genuinely has no data yet".

So the assertion below does not compare two constants. It goes through the REAL app over a
REAL loopback socket, takes the fifteen terms the route actually PUBLISHES, rebuilds the
`SeriesKey` from them, and demands that its `series_key_id` be the one the collector's mapping
stamps on the rows it publishes. Nothing in the chain is stubbed, and no literal is compared
with a copy of itself.
"""

from __future__ import annotations

import http.client
import json
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any, cast

import uvicorn
from fastapi import FastAPI

from src.main import create_app
from src.modules.sentimento.domain.klines_volume_catalog import KLINES_VOLUME_METRIC
from src.modules.sentimento.domain.series_key import (
    Nature,
    QuantityField,
    Reduction,
    SeriesKey,
    TsConvention,
)
from src.modules.sentimento.infra.binance_klines_client import KlineRow
from src.modules.sentimento.use_cases.collector_series_mapping import (
    KLINES_BUCKET_WIDTH_MS,
    build_klines_to_rows,
)

_STARTUP_POLL_S = 0.005
_JOIN_TIMEOUT_S = 5.0

# `use_cases/series_catalog.list_series_catalog` serves ONE instrument today (`_INSTRUMENT_ID`),
# and it is this one — so this is the symbol on which the two sides can be compared at all.
_SERVED_INSTRUMENT = "BTCUSDT"

_T0 = 1_788_000_000_000


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


def _published_entries(port: int) -> list[dict[str, Any]]:
    """`GET /api/v1/series-catalog` and return its `entries`, parsed."""
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    connection.request("GET", "/api/v1/series-catalog")
    response = connection.getresponse()
    body = json.loads(response.read())
    connection.close()
    assert response.status == 200, f"the catalog route answered {response.status}"
    return cast("list[dict[str, Any]]", body["entries"])


def _key_from_wire(wire: dict[str, Any]) -> SeriesKey:
    """Rebuild a `SeriesKey` from the fifteen terms the ROUTE published.

    The inverse of `series_catalog._series_key_to_wire`, written out by hand rather than
    imported: importing a decoder that the encoder's author also wrote would let a matched pair
    of mistakes cancel out. Every term is named here, so a term the route stopped publishing
    raises `KeyError` instead of quietly defaulting.
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


def _one_written_row_series_key_id() -> str:
    """Return the `series_key_id` the COLLECTOR stamps on a `klines_volume` row it publishes.

    Produced by running the real mapping over a real, long-settled `KlineRow` — not by calling
    `build_klines_volume_entry` with arguments this test chose, which would test this test.
    """
    settled = KlineRow(
        raw=(
            _T0,
            "60000.0",
            "60010.0",
            "59990.0",
            "60005.0",
            "12.345",
            _T0 + KLINES_BUCKET_WIDTH_MS - 1,
            "740000.0",
            11,
            "6.0",
            "360000.0",
            "0",
        )
    )
    rows = build_klines_to_rows()(_T0 + 10 * KLINES_BUCKET_WIDTH_MS, _SERVED_INSTRUMENT, (settled,))
    assert len(rows) == 1, "the fixture bar is long settled, so the mapping must publish it"
    return rows[0].series_key_id


def test_the_id_the_collector_writes_is_the_id_the_catalog_route_publishes() -> None:
    """`series-catalog`'s `klines_volume` row and `md.series`' rows are ONE series.

    Morde: change `_KLINES_VOLUME_VERIFIED_BY` on EITHER side (or the `unit`, or the
    `instrument_id`) and this fails with the two ids side by side. Without it, that same
    change ships green and `/api/v1/series-history` starts answering `200`/`n_points = 0` for
    a series whose rows are in the table under an id nobody is asking for.
    """
    with _served(create_app()) as port:
        entries = _published_entries(port)
    klines_rows = [entry for entry in entries if entry["key"]["metric"] == KLINES_VOLUME_METRIC]
    assert len(klines_rows) == 1, (
        f"the served catalog must publish exactly one {KLINES_VOLUME_METRIC!r} row "
        f"(`T-01.6`), found {len(klines_rows)}"
    )
    served_id = _key_from_wire(klines_rows[0]["key"]).series_key_id()
    written_id = _one_written_row_series_key_id()
    assert written_id == served_id, (
        "the klines collector writes md.series rows under a series_key_id the served catalog "
        f"does not publish: written={written_id!r} served={served_id!r}. The two sides name "
        "`verified_by` independently (`collector_series_mapping.py` and `series_catalog.py`) "
        "and one of them has drifted — /api/v1/series-history will answer 200 with n_points=0."
    )


def test_the_served_row_is_the_instrument_and_unit_the_collector_publishes_for() -> None:
    """The agreement is on the WHOLE identity, not only on `verified_by`.

    `unit` is the other term the two sides derive separately — the catalog hardcodes the base
    asset for its single instrument, the collector reads it off the symbol name — so it is
    named here explicitly rather than left to the `sha256` to summarise.
    """
    with _served(create_app()) as port:
        entries = _published_entries(port)
    served = next(
        entry["key"] for entry in entries if entry["key"]["metric"] == KLINES_VOLUME_METRIC
    )
    assert served["instrumentId"] == _SERVED_INSTRUMENT
    assert served["unit"] == "BTC"
    assert served["denom"] == "base"
    assert served["interval"] == "1m"
    assert served["nature"] == Nature.FLOW.value
