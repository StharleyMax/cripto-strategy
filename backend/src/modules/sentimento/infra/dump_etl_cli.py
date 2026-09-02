"""THE COMPOSITION ROOT of the dump ETL queue — achado `H` of `backend/README.md`, closed here."""

from __future__ import annotations

import json
import logging
import os
import sys
from collections.abc import Sequence
from datetime import date
from pathlib import Path
from typing import Final, TextIO

from src.modules.sentimento.domain.dump_window import (
    DumpPartition,
    Granularity,
    backlog_of,
    dataset_by_name,
    enumerate_window,
)
from src.modules.sentimento.domain.retention_probe import (
    ABSENT,
    SUSPECT_FINDINGS,
    RetentionFinding,
    classify,
    probe_targets_for_window,
)
from src.modules.sentimento.infra.dump_ingest_worker import DumpIngestWorker
from src.modules.sentimento.infra.head_probe_log import outcomes_for, read_probe_log
from src.modules.sentimento.infra.jsonl_checkpoint import JsonlCheckpoint
from src.modules.sentimento.use_cases.drain_etl_backlog import drain

logger = logging.getLogger(__name__)


# ── THE FINDING, AND WHY IT WAS NOT A FALSE ALARM ────────────────────────────────────────────
#
# `backend/README.md`, finding `H`: *"nao existe raiz de composicao — todo o fio de ligacao vive em
# `backend/tests/`"*. Measured there: of the 13 versioned `.py` under `backend/`, exactly **2**
# cite three or more of the four pieces (`EtlBacklog`, `FileEtlWorker`, `JsonlCheckpoint`,
# `drain`), and **both are tests**. Its falsifier is written literally:
#
#     se `T-03.10` puder ligar as quatro pecas SEM NENHUM MODULO NOVO e sem `use_cases` ou
#     `infra` importar para o lado errado, o achado era falso alarme.
#
# **The first half fails and the second half holds, so the finding stands.** A new module WAS
# needed — this one. What did NOT happen is the inversion the finding feared: it named two candidate
# homes and said both *"invertem a direcao"* (`use_cases` would come to know `infra`; `infra` would
# come to orchestrate `use_cases`). Only the second is a real inversion, and only under a layering
# where `infra` is the bottom. **In THIS repository `infra` is the TOP layer** —
# `[tool.importlinter]`, contract 1: `layers = ["infra", "use_cases", "domain"]`, first is highest
# — so a composition root in `infra` importing `use_cases` and `domain` runs WITH the declared
# direction, not against it. `backend/scripts/boundaries.sh` is the proof, and it is a gate.
#
# The precedent is already in the tree and this module follows it rather than inventing a shape:
# `infra/ingest_health_cli.py` is described in the README as *"a raiz de composicao — compor e
# exatamente o trabalho dele, entao isso nao e acoplamento indevido"*.
#
# ── THE ORDER OF THE TWO HALVES, AND IT IS DELIBERATE ────────────────────────────────────────
#
# The retention findings are classified and **written durably BEFORE the first object is drained**.
# Not after, and not as the queue goes: a run killed halfway would otherwise take the knowledge
# that a period is suspect down with it, and the resumed run — which skips every recorded key —
# would never revisit it. The finding is about the WINDOW, so it is recorded when the window is
# decided.
#
# ── WHAT THIS ROOT DOES NOT DO, NAMED ────────────────────────────────────────────────────────
#
#   * **It downloads nothing.** The bucket mirror under `<workdir>/mirror/` is fed by whoever
#   fetches;
#     `T-07.1` owns the correct paginator and the S3 listing by `NextContinuationToken`. This queue
#     consumes an enumerated window, which is precisely the shape `T-07.1` mandates — see the
#     ordering note in the PR body.
#   * **It does not write `md.ingest_run` / `md.ingest_gap`.** The durable home of a class-O
#   finding IS
#     `md.ingest_gap`, and its production writer arrives with `T-03.8` (`backend/README.md` names
#     that owner). Until then the finding is durable in `findings.jsonl` — a second-best that is
#     written down as such rather than presented as the design.
#   * **It does not read the object's content.** Coverage measured against the object's own
#   timestamps needs
#     unzip + CSV parsing, which is a different task. At `HEAD` resolution the class-O witness is
#     the neighbour rule, and that is what is implemented.

MIRROR_DIR: Final[str] = "mirror"
OUTPUT_DIR: Final[str] = "out"
CHECKPOINT_FILE: Final[str] = "checkpoint.jsonl"
FINDINGS_FILE: Final[str] = "findings.jsonl"
PROBE_FILE: Final[str] = "probe.jsonl"

_STABLE_FORMAT: Final[str] = "%(message)s"
_DIAGNOSTIC_FORMAT: Final[str] = "%(levelname)s %(name)s %(message)s"
# ⚠️ DERIVED FROM AN IMPORTED CLASS, NOT FROM `__name__`, AND THAT IS A FIX. It used to be
# `__name__.split(".")[0]`, which is `"src"` when this module is IMPORTED and `"__main__"` when
# it is RUN AS A SCRIPT — the only way an operator invokes it. Collapsed onto `"__main__"`, the
# application logger and this module's own logger became the SAME logger, both handlers landed
# on it, and every record left on BOTH streams: the keys appeared on `stderr` too, so `2>&1`
# doubled every key `[MEDIDO 2026-08-29 by the /qa]`. `DumpIngestWorker.__module__` is always
# `src.modules.sentimento.infra.dump_ingest_worker`, however THIS file was entered.
_APPLICATION_LOGGER: Final[str] = DumpIngestWorker.__module__.split(".")[0]

# The product stream has a logger of its OWN, deliberately OUTSIDE the `src` hierarchy so that
# routing `src` diagnostics to `stderr` can never reach it and it can never inherit a handler
# meant for diagnostics. `stdout` carries bucket keys and nothing else — a shell `while read KEY`
# downstream acts on whatever word arrives, so one diagnostic line makes it act on a non-key.
_PRODUCT_LOGGER_NAME: Final[str] = "dump_etl_cli.keys"
product = logging.getLogger(_PRODUCT_LOGGER_NAME)

# `uso: ...` STAYS IN PORTUGUESE and it is a decision: `SPEC-001` §3.8 reserves pt-BR EXCLUSIVELY
# for microcopy, and an operator-facing usage line is microcopy. Everything else here is English.
_USAGE: Final[str] = (
    "uso: dump_etl_cli <workdir> <simbolo> <dataset> <fim:AAAA-MM-DD> <profundidade-dias> "
    "<granularidade:monthly|daily>"
)
_ARGUMENT_COUNT: Final[int] = 6

# NO DEFAULT IS APPLIED AT THE COMMAND LINE, and that is the opposite of `Q18`(d) being a default
# in the LIBRARY. `enumerate_window` defaults to 30 days because a caller that says nothing means
# "the declared default". An operator who omits an argument means nothing of the sort — they
# mistyped — and a composition root that fills a depth in for them silently changes how much
# history is fetched. The default is DECLARED in one place; it is not GUESSED in two.


def _write_findings(path: Path, findings: tuple[RetentionFinding, ...]) -> None:
    """Append every finding as one JSON line, with `flush` + `fsync` before returning.

    `fsync` for the same reason `JsonlCheckpoint` has one: the whole point of writing this
    BEFORE the drain is that it survives the death the drain is designed around. Bytes sitting
    in the page cache survive `SIGKILL` and not a power loss, which is the honest scope of the
    guarantee — stated here rather than implied.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        for finding in findings:
            handle.write(
                json.dumps(
                    {
                        "object_key": finding.partition.object_key,
                        "finding": finding.finding,
                        "reason": finding.reason,
                        "declared_hours": finding.partition.declared_hours(),
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
        handle.flush()
        os.fsync(handle.fileno())


def assess_window(
    workdir: Path,
    partitions: tuple[DumpPartition, ...],
) -> tuple[RetentionFinding, ...]:
    """Classify the probe observations that exist for this window, and record them durably.

    Returns EVERY finding, including `PRESENT`, because a probe log that recorded a period as
    present is evidence with a date on it — and §5.8's value comes from comparing this month's
    evidence with an older month's. Keeping only the alarming rows would leave nothing to
    compare against.
    """
    records = read_probe_log(workdir / PROBE_FILE)
    # THE SUCCESSOR OF THE NEWEST PARTITION IS RESOLVED TOO, and this one line is the fix for the
    # defect that motivated `G1` in the first place. `/qa` measured it: with the window ending on
    # 2024-04 — the LAST month the publisher served — the `404` of 2024-05 sat in the probe log
    # but OUTSIDE the window, so nothing looked it up and April was drained and recorded
    # `PRESENT`. Not merely silent: a positive certificate of health over a month holding
    # **0,942 %** of what its name declares. `probe_targets_for_window` enumerates exactly this
    # set, so what the operator probes and what this reads are the same list by construction.
    findings = classify(outcomes_for(probe_targets_for_window(partitions), records))
    if findings:
        _write_findings(workdir / FINDINGS_FILE, findings)
    return findings


def run(
    workdir: Path,
    symbol: str,
    dataset_name: str,
    end_date: date,
    depth_days: int,
    granularity: Granularity,
) -> tuple[str, ...]:
    """Wire the window, the checkpoint and the verified edge, then drain; return what THIS run did.

    Returning the processed keys is what makes the run falsifiable without rereading a terminal:
    a test kills the process, resumes, and compares the union of two runs against the enumerated
    window. A drain whose result could only be inspected by parsing logs would be a drain nobody
    can falsify.
    """
    dataset = dataset_by_name(dataset_name)
    partitions = enumerate_window(dataset, symbol, end_date, depth_days, granularity)
    findings = assess_window(workdir, partitions)

    absent = {f.partition.object_key for f in findings if f.finding == ABSENT}
    suspect = frozenset(f.partition.object_key for f in findings if f.finding in SUSPECT_FINDINGS)
    # An ABSENT period is removed from the WINDOW rather than skipped inside the worker. The
    # difference is not stylistic: `EtlBacklog.pending` raises `CheckpointOutsideWindowError` on
    # a checkpoint key the window does not contain, so a key that is silently skipped every run
    # would keep the backlog permanently non-empty and the queue would never report itself done.
    workable = tuple(p for p in partitions if p.object_key not in absent)

    logger.info(
        "dump_window_enumerated",
        extra={
            "symbol": symbol,
            "dataset": dataset.name,
            "granularity": granularity,
            "depth_days": depth_days,
            "declared": len(partitions),
            "absent": len(absent),
            "suspect": len(suspect),
        },
    )
    if not workable:
        return ()

    processed = drain(
        backlog_of(workable),
        DumpIngestWorker(workdir / MIRROR_DIR, workdir / OUTPUT_DIR, suspect_keys=suspect),
        JsonlCheckpoint(workdir / CHECKPOINT_FILE),
    )
    for key in processed:
        product.info(key)
    return processed


def _granularity_of(text: str) -> Granularity:
    """Narrow an operator-supplied string to the closed set of prefixes, or refuse.

    Refusing beats defaulting to `daily`: an operator who typed `montly` asked for monthly data
    and would get a daily window that drains cleanly, reports success, and holds a thirtieth of
    what they wanted. Silence about a typo is how a short series is born.
    """
    if text == "monthly":
        return "monthly"
    if text == "daily":
        return "daily"
    raise SystemExit(_USAGE)


def build_stream_handler(stream: TextIO, log_format: str) -> logging.StreamHandler[TextIO]:
    """Build a handler on `stream` with an explicit format — no global state touched."""
    handler: logging.StreamHandler[TextIO] = logging.StreamHandler(stream)
    handler.setFormatter(logging.Formatter(log_format))
    return handler


def route_diagnostics_away_from_the_product_stream() -> None:
    """Send this application's diagnostics to `stderr`, so `stdout` carries the keys ALONE.

    The defect this exists for was measured on the sibling CLI by the `/qa` of 2026-08-29: a host
    that called `logging.basicConfig(stream=sys.stdout)` before invoking anything turned the
    FIRST line of `stdout` into a diagnostic record. Here `stdout` is the list of keys this run
    processed, which a shell pipeline is expected to read; one diagnostic line in front of it
    makes the pipeline act on a key that does not exist.
    """
    diagnostic = build_stream_handler(sys.stderr, _DIAGNOSTIC_FORMAT)
    application = logging.getLogger(_APPLICATION_LOGGER)
    application.addHandler(diagnostic)
    application.propagate = False
    # THIS MODULE'S OWN LOGGER IS FITTED SEPARATELY, and that is not belt-and-braces: run as a
    # script its name is `__main__`, which is NOT under `src`, so the handler above would never
    # reach it and `dump_window_enumerated` would fall through to `logging.lastResort` — whose
    # level is WARNING, so an INFO diagnostic would be DROPPED IN SILENCE. Fitted here, the
    # diagnostic reaches `stderr` whichever way this file was entered.
    logger.setLevel(logging.INFO)
    logger.addHandler(diagnostic)
    logger.propagate = False


def main(argv: Sequence[str]) -> int:
    """Parse the six arguments, wire the streams, and drain the window they describe."""
    if len(argv) != _ARGUMENT_COUNT:
        raise SystemExit(_USAGE)
    workdir, symbol, dataset_name, end_text, depth_text, granularity_text = argv
    granularity = _granularity_of(granularity_text)
    route_diagnostics_away_from_the_product_stream()
    product.setLevel(logging.INFO)
    product.addHandler(build_stream_handler(sys.stdout, _STABLE_FORMAT))
    # `product` lives outside the `src` hierarchy on purpose, so this only stops the ROOT logger
    # from re-emitting each key — duplicated, the output matches no pipeline and no `sha256`.
    product.propagate = False
    run(
        Path(workdir),
        symbol,
        dataset_name,
        date.fromisoformat(end_text),
        int(depth_text),
        granularity,
    )
    return 0


if __name__ == "__main__":  # pragma: no cover - composition root, exercised by subprocess
    raise SystemExit(main(sys.argv[1:]))
