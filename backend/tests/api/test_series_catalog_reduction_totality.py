r"""`T-03.2` — the totality test, FUSÃO of plan `03` item 3.2 + DoD 4.

`ADR-040/D2`, literal: "métrica que acrescente par novo falha alto em vez de cair num padrão".
`T-03.1` (`series_reduction.py`) already builds that refusal — `reduce_bucket` raises
`UncoveredReductionPairError` for any `(nature, reduction)` outside `REDUCTION_TABLE`, never a
default branch (`test_series_reduction.py` proves the PURE function in isolation).

What `T-03.1`'s own suite explicitly leaves to this task (`test_series_reduction.py`'s module
docstring): the CATALOG-level half of the same guarantee — "falha alto em par não coberto" and
"teste de totalidade sobre os 8 pares" are, per the task's own `refs`, **the same guarantee seen
from inside and from outside**. Inside: the table has exactly 8 entries (`T-03.1`). Outside: the
LIVE `/series-catalog` — the thing a metric addition would actually touch — serves ONLY pairs
this table covers, and every one of the 8 it declares is actually present on the wire.

The DoD's own command (plan `03`, DoD item 4):

    curl -s http://127.0.0.1:8000/api/v1/series-catalog \\
      | python3 -c "import sys,json;print(sorted({(x['key']['nature'],x['key']['reduction']) \\
                                                    for x in json.load(sys.stdin)['entries']}))"

`n = 8` pairs, each with a function declared. This suite exercises that same query two ways:
over a real loopback socket via `http.client` (the idiom every route test in this directory
uses — `test_series_catalog_route.py`, `test_series_history_route.py`), AND, once, by shelling
out to the LITERAL `curl | python3` pipeline above against the ephemeral port this suite binds
— so the DoD's own command, not a paraphrase of it, runs green here.

MORDE: a synthetic 9th pair reaching the wire (dependency-injected catalog, the same override
idiom `test_series_catalog_route.py::test_the_dependency_override_is_genuinely_substitutable`
uses) is NOT silently swallowed — `reduce_bucket` over that entry's `(nature, reduction)` raises
`UncoveredReductionPairError`, naming the exact pair, instead of the count quietly rising with
no one having decided a function for it.
"""

from __future__ import annotations

import ast
import http.client
import json
import subprocess
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
from src.modules.sentimento.domain.series_catalog import SeriesCatalog, SeriesCatalogEntry
from src.modules.sentimento.domain.series_key import (
    Nature,
    QuantityField,
    Reduction,
    SeriesKey,
    TsConvention,
)
from src.modules.sentimento.domain.series_reduction import (
    REDUCTION_TABLE,
    UncoveredReductionPairError,
    reduce_bucket,
)

_STARTUP_POLL_S = 0.005
_JOIN_TIMEOUT_S = 5.0

# The same 8 pairs `test_series_reduction.py::SPEC_008_5_1_PAIRS` transcribes by hand from
# `SPEC-008` §5.1 — imported from `REDUCTION_TABLE` here on purpose: THIS suite's job is to
# prove the LIVE catalog agrees with the table, not to re-transcribe the spec a third time.
_DECLARED_PAIRS: frozenset[tuple[Nature, Reduction]] = frozenset(REDUCTION_TABLE.keys())


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


def _get_series_catalog(port: int) -> tuple[int, dict[str, Any]]:
    """`GET /api/v1/series-catalog`, returning `(status, parsed body)`."""
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    connection.request("GET", "/api/v1/series-catalog")
    response = connection.getresponse()
    body = json.loads(response.read())
    connection.close()
    return response.status, body


def _pairs_on_the_wire(entries: list[dict[str, Any]]) -> frozenset[tuple[str, str]]:
    """Return the `(nature, reduction)` string pairs the wire carries — the DoD's own query."""
    return frozenset((entry["key"]["nature"], entry["key"]["reduction"]) for entry in entries)


def test_the_live_catalog_serves_exactly_the_8_declared_pairs_no_more_no_less(
    tmp_path: Path,
) -> None:
    """CALA: `GET /api/v1/series-catalog` over a real process, `n = 8` distinct pairs.

    This is the OUTSIDE half of `ADR-040/D2`'s guarantee: `test_series_reduction.py` already
    proves `REDUCTION_TABLE` itself has exactly 8 entries; this proves the thing a metric
    addition would actually touch — the served catalog — carries no pair the table does not
    cover, and no declared pair silently drops off the wire.
    """
    store_path = tmp_path / "ih.sqlite3"

    with _served(create_app(store_path=store_path)) as port:
        status, body = _get_series_catalog(port)

    assert status == 200
    entries = body["entries"]
    assert isinstance(entries, list)
    assert len(entries) > 0

    wire_pairs = _pairs_on_the_wire(entries)
    declared_pairs = {(nature.value, reduction.value) for nature, reduction in _DECLARED_PAIRS}

    assert wire_pairs == declared_pairs
    assert len(wire_pairs) == 8


def test_every_pair_the_catalog_serves_has_a_real_function_not_just_a_dict_key(
    tmp_path: Path,
) -> None:
    """Every `(nature, reduction)` on the wire reduces a real bucket — CATALOG-level, not table.

    `test_series_reduction.py::test_every_covered_pair_has_a_callable_and_answers_a_single_fact`
    already proves this for the 8 pairs TRANSCRIBED BY HAND from the spec. This proves the same
    fact for the 8 pairs the LIVE ROUTE actually serves — comparing the table against an import
    of itself proves nothing (`test_series_reduction.py`'s own stated discipline); comparing it
    against the wire is the totality check this task owns.
    """
    store_path = tmp_path / "ih.sqlite3"

    with _served(create_app(store_path=store_path)) as port:
        status, body = _get_series_catalog(port)

    assert status == 200
    wire_pairs = _pairs_on_the_wire(body["entries"])
    assert len(wire_pairs) == 8

    for nature_value, reduction_value in wire_pairs:
        nature = Nature(nature_value)
        reduction = Reduction(reduction_value)
        # Does not raise `UncoveredReductionPairError` — a pair served on the wire without a
        # declared function would be exactly `ADR-034/D6`'s silent-default defect, one layer up.
        assert reduce_bucket(nature, reduction, [42.0]) == 42.0


def test_the_literal_dod_command_runs_against_the_live_process_and_reports_8(
    tmp_path: Path,
) -> None:
    """Run the DoD's OWN `curl | python3` pipeline (plan `03`, DoD item 4), not a paraphrase.

    `http.client` in the two tests above is the idiom this directory's other route tests use,
    but it is still a Python re-implementation of the DoD command. This test runs the literal
    two programs the DoD names — `curl -s .../series-catalog` piped into
    `python3 -c '...sorted({...})'` — against the same ephemeral loopback port this suite binds
    (the DoD's own `127.0.0.1:8000` is a manual dev-server address; the port here plays the same
    role for an automated, hermetic process). `subprocess.run` chains the two WITHOUT
    `shell=True` — `curl`'s stdout feeds `python3`'s stdin directly, the same data flow a shell
    `|` would give, without a shell interpreting a string.
    """
    store_path = tmp_path / "ih.sqlite3"
    script = (
        "import sys,json;print(sorted({(x['key']['nature'],x['key']['reduction']) "
        "for x in json.load(sys.stdin)['entries']}))"
    )

    with _served(create_app(store_path=store_path)) as port:
        url = f"http://127.0.0.1:{port}/api/v1/series-catalog"
        curl_result = subprocess.run(
            ["curl", "-s", url], capture_output=True, timeout=10, check=True
        )
        python_result = subprocess.run(
            ["python3", "-c", script],
            input=curl_result.stdout.decode("utf-8"),
            capture_output=True,
            text=True,
            timeout=10,
            check=True,
        )

    # `ast.literal_eval`, never `eval`: the DoD's own command prints a Python `repr`
    # (`sorted({...})` over tuples), not JSON — safe to parse because it is a literal, not code.
    reported_pairs = ast.literal_eval(python_result.stdout.strip())
    assert len(reported_pairs) == 8
    assert reported_pairs == sorted(
        (nature.value, reduction.value) for nature, reduction in _DECLARED_PAIRS
    )


def test_a_9th_pair_reaching_the_wire_bites_instead_of_rising_silently(tmp_path: Path) -> None:
    """MORDE: a synthetic 9th `(nature, reduction)` on the wire raises when reduced, names the pair.

    `ADR-040/D2`, literal: "morde se a contagem subir sem alguém decidir a função nova". This
    injects a catalog (same `dependency_overrides` idiom as
    `test_series_catalog_route.py::test_the_dependency_override_is_genuinely_substitutable`)
    whose one entry carries `(EVENT, POINT)` — a pair that exists in `Nature`/`Reduction` but has
    NO entry in `REDUCTION_TABLE`. The count on the wire rises to `1` distinct pair, same as any
    real 9th pair would; `reduce_bucket` over it must fail HIGH, never guess.
    """
    store_path = tmp_path / "ih.sqlite3"
    app = create_app(store_path=store_path)

    uncovered_key = SeriesKey(
        provider="binance",
        venue="usdm_futures",
        instrument_id="ETHUSDT",
        metric="synthetic_uncovered_metric",
        cohort="all",
        interval="5m",
        unit="USDT",
        denom="quote",
        nature=Nature.EVENT,
        ts_convention=TsConvention.POINT_AT_BUCKET_END,
        reduction=Reduction.POINT,
        quantity_field=QuantityField.NA,
        label_shift=0,
        aggregation_scope="Symbol",
        verified_by="test_series_catalog_reduction_totality.py",
    )
    fixture_catalog = SeriesCatalog(
        (
            SeriesCatalogEntry(
                key=uncovered_key,
                native_grid="5min",
                native_grid_ms=300_000,
                max_staleness_ms=600_000,
            ),
        )
    )
    app.dependency_overrides[get_series_catalog_source] = lambda: fixture_catalog

    with _served(app) as port:
        status, body = _get_series_catalog(port)

    assert status == 200
    wire_pairs = _pairs_on_the_wire(body["entries"])
    assert wire_pairs == {("EVENT", "POINT")}
    assert ("EVENT", "POINT") not in {
        (nature.value, reduction.value) for nature, reduction in _DECLARED_PAIRS
    }

    with pytest.raises(UncoveredReductionPairError) as excinfo:
        reduce_bucket(Nature.EVENT, Reduction.POINT, [1.0])
    assert "EVENT" in str(excinfo.value)
    assert "POINT" in str(excinfo.value)
