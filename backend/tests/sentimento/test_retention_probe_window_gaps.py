"""`G1` at the seam: the neighbour rule is only as wide as the WINDOW that carries it.

`domain/retention_probe.py` decides `SUSPECT_LAST_BEFORE_ABSENT` from the IMMEDIATE successor,
and `infra/head_probe_log.outcomes_for` SKIPS every partition nobody probed. Each half is right
on its own; **composed, "immediate successor" stops meaning "the next period" and starts meaning
"the next probed period that happens to be inside this window"**. Two consequences, both measured
by the `/qa` of 2026-08-29 with `n = 1` scenario each:

  * **A miss, and it is the case `G1` was written for.** A window that ends on the last month the
    publisher actually served never sees the `404` that follows it, so the short month is drained
    and recorded `PRESENT` — a positive claim of health about an object that covers **0,942 %** of
    what its name declares `[MEDIDO, ADR-014, n = 1 objeto de 37.761.761 B]`. The evidence was in
    the probe log the run had already read.
  * **A false alarm.** With a hole in the probe log, the oldest probed period is marked suspect
    because a `404` three steps away became its neighbour after the skip.

Both are `xfail(strict=True)`: they state the contract the module's own docstring claims (*"the
boundary is one step wide"*), they fail today, and the day the seam is fixed they XPASS instead of
the defect disappearing without a trace.

**Nada de `data/`**: every object and every sidecar below is fabricated here.
"""

from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path

import pytest

from src.modules.sentimento.domain.dump_window import (
    AGG_TRADES,
    DumpPartition,
    enumerate_window,
)
from src.modules.sentimento.domain.retention_probe import (
    PRESENT,
    SUSPECT_LAST_BEFORE_ABSENT,
    classify,
    probe_targets,
)
from src.modules.sentimento.infra.dump_etl_cli import FINDINGS_FILE, MIRROR_DIR, PROBE_FILE, run
from src.modules.sentimento.infra.head_probe_log import outcomes_for

SYMBOL = "BTCUSDT"
BODY = b"1700000000000,42.5,0.01,111,222,false\n"

# The measured `HEAD` table of `ADR-014`/`A7`, verbatim: March is whole, April is 0,942 % of its
# month and still verifies, May is gone.
MARCH_BYTES = 6_712_517_585
APRIL_BYTES = 37_761_761


def _seed(workdir: Path, partitions: tuple[DumpPartition, ...]) -> None:
    """Fabricate every object of the window with a correct `.CHECKSUM` beside it.

    Correct on purpose: the whole point of `G1` is that the sidecar of the short month CONFERE.
    """
    for partition in partitions:
        target = workdir / MIRROR_DIR / partition.object_key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(BODY)
        digest = hashlib.sha256(BODY).hexdigest()
        target.with_name(target.name + ".CHECKSUM").write_text(
            f"{digest}  {target.name}\n", encoding="utf-8"
        )


def _write_probe(workdir: Path, rows: list[dict[str, object]]) -> None:
    """Write the probe log the operator's monthly `curl -sI` job would have produced."""
    workdir.mkdir(parents=True, exist_ok=True)
    (workdir / PROBE_FILE).write_text(
        "".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8"
    )


def _findings_by_key(workdir: Path) -> dict[str, str]:
    """Read the durable findings the run wrote, keyed by object."""
    path = workdir / FINDINGS_FILE
    if not path.exists():
        return {}
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
    return {str(row["object_key"]): str(row["finding"]) for row in rows}


@pytest.mark.xfail(
    strict=True,
    reason=(
        "DEFECT MEASURED 2026-08-29 by /qa, and it is the case that motivated `G1`: with the "
        "window ending on 2024-04 — the last month the publisher served — the `404` of 2024-05 "
        "sits in the probe log but OUTSIDE the window, `assess_window` only looks records up for "
        "partitions IN the window, and April is drained with `finding = PRESENT` and 0 warnings. "
        "The build report claims *'a fila NAO aceita um mes curto por o checksum ter batido'*; "
        "measured, it accepts it and records that it is healthy."
    ),
)
def test_a_month_whose_successor_is_a_404_outside_the_window_is_not_called_present(
    tmp_path: Path,
) -> None:
    """The `A7` boundary does not stop existing because the window stopped one month earlier.

    An operator backfilling *up to the last month that exists* is not doing anything unusual —
    it is the natural shape of a backfill, and it is exactly the shape that silences P2.
    """
    end = date(2024, 4, 30)
    window = enumerate_window(AGG_TRADES, SYMBOL, end, 60, "monthly")
    may = enumerate_window(AGG_TRADES, SYMBOL, date(2024, 5, 31), 1, "monthly")[0]
    _seed(tmp_path, window)
    _write_probe(
        tmp_path,
        [
            {"object_key": window[0].object_key, "status": 200, "content_length": MARCH_BYTES},
            {"object_key": window[1].object_key, "status": 200, "content_length": APRIL_BYTES},
            {"object_key": may.object_key, "status": 404, "content_length": None},
        ],
    )

    processed = run(tmp_path, SYMBOL, AGG_TRADES.name, end, 60, "monthly")

    assert window[1].object_key in processed, "the short month IS data and still enters"
    assert _findings_by_key(tmp_path).get(window[1].object_key) != PRESENT, (
        "the run read the 404 of the next period and still certified the short month as present"
    )


@pytest.mark.xfail(
    strict=True,
    reason=(
        "DEFECT MEASURED 2026-08-29 by /qa: `outcomes_for` skips unprobed partitions and "
        "`classify` reads `outcomes[index + 1]` as *the* successor, so a hole in the probe log "
        "makes 2024-03 the neighbour of 2024-06. Measured: findings = "
        "[('2024-03', SUSPECT_LAST_BEFORE_ABSENT), ('2024-06', ABSENT)] while 2024-04 and "
        "2024-05 are present. `classify` documents the opposite: *'the boundary is one step "
        "wide'*."
    ),
)
def test_a_hole_in_the_probe_log_does_not_manufacture_an_adjacency() -> None:
    """Suspicion has to come from the calendar, never from which rows the cron happened to write.

    A false `SUSPECT` is not harmless: `ADR-014/D3b` makes every suspect object warn and be
    recorded, and an alarm that fires on healthy months is how an alarm gets switched off.
    """
    window = enumerate_window(AGG_TRADES, SYMBOL, date(2024, 6, 30), 120, "monthly")
    partial_log = (
        {"object_key": window[0].object_key, "status": 200, "content_length": MARCH_BYTES},
        {"object_key": window[-1].object_key, "status": 404, "content_length": None},
    )

    findings = classify(outcomes_for(window, partial_log))

    by_label = {f.partition.period_label: f.finding for f in findings}
    assert by_label.get("2024-03") != SUSPECT_LAST_BEFORE_ABSENT, (
        "2024-03 was called suspect because of a 404 three periods away"
    )


def test_the_probe_of_section_5_8_and_the_default_window_do_not_intersect() -> None:
    """MEASURED FACT, pinned so it cannot drift silently — it is the reach of P2, not a defect.

    `probe_targets` enumerates an OLD and a RECENT period per dataset, `aggTrades` monthly; the
    queue's declared default is a 30-day DAILY window. The two key sets are disjoint
    `[MEDIDO 2026-08-29: alvos=4, janela=30, intersecao=0]`, so on a default run there is no
    observation to classify and P2 is structurally silent. It fires only when an operator drains
    a MONTHLY window that contains both the suspect month and the probed `404` after it.

    This test exists so that a future edit which makes the two meet — or which widens the probe —
    shows up as a change of a measured number instead of as a surprise in production.
    """
    targets = probe_targets(SYMBOL, date(2023, 1, 1), date(2026, 8, 1))
    default_window = enumerate_window(AGG_TRADES, SYMBOL, date(2026, 8, 29), 30, "daily")

    assert len(targets) == 4
    assert len(default_window) == 30
    assert {p.object_key for p in targets} & {p.object_key for p in default_window} == set()
