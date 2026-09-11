"""CLI report of the raw F0 record: a NAMED logger writing `stdout`, never `print`."""

from __future__ import annotations

import logging
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Final, TextIO

from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from src.modules.sentimento.use_cases.ingest_health import ingest_health_query

# ── `ADR-008/D2`, DECIDED BEFORE THE FIRST LINE AND NOT DISCOVERED AT THE PRE-PUSH ─────────
#
# `core.print-statement` is a BLOCKING rule of this repository and its message asks literally
# for "use um registrador nomeado pelo modulo em vez de imprimir"
# `[MEDIDO 2026-08-29: `harness rules list --severity block` -> the rule is in force; and the
#  measurement recorded in `ADR-008` shows `{"decision":"block"}` for a `report.py` holding
#  `print(rows)`]`. The named logger below is NOT a way around the rule: the report IS product
# output, and what the rule forbids is product output made of `print`, which is not even a log
# and has no module name, no level and no configurable destination.
#
# ⚠️ AND THE RECORD ITSELF STAYS PERSISTED, NEVER A LOG. This module READS `md.ingest_run` and
# `md.ingest_gap` from the store and writes them out; it is nobody's memory. `D2.9` kills the
# process and rereads — if the truth lived here, it would die with the process.
logger = logging.getLogger(__name__)

# `%(message)s` is the STABLE format `ADR-008/D2` asks for, and stability is the requirement:
# `ADR-008/DoD-2` compares the `sha256` of what leaves here against the `sha256` of what feeds
# S1. A formatter carrying a timestamp would make the two fingerprints diverge every second,
# and the falsifier of the whole ADR would become clock noise.
#
# `ADR-035/D3` did NOT relax that: the format string is untouched, and since the amendment of
# `2026-09-11` the PROJECTION handler cannot render `extra` at all — `ExtraRenderingFormatter`
# below reaches `stdout` only through `build_service_stdout_handler`, which no projection CLI
# installs. See the block above that formatter for the hierarchy between the two layers.
_STABLE_FORMAT: Final[str] = "%(message)s"

# Diagnostics get the OPPOSITE treatment on purpose: they are for a human reading a terminal,
# so they carry the logger name and the level. Nothing hashes them.
_DIAGNOSTIC_FORMAT: Final[str] = "%(levelname)s %(name)s %(message)s"

# The root package of this application — `src`. Derived instead of typed so that a rename of
# the package cannot leave a string behind pointing at a logger nobody uses.
_APPLICATION_LOGGER: Final[str] = __name__.split(".")[0]

# `uso: …` STAYS IN PORTUGUESE, and it is a decision rather than an oversight: `SPEC-001` §3.8
# reserves pt-BR EXCLUSIVELY for microcopy, and an operator-facing usage line is microcopy.
# Every identifier, docstring and comment around it is English, per the owner's rule.
_USAGE: Final[str] = "uso: ingest_health_cli <caminho-do-store>"


# ── `ADR-035/D3`: THE COUNTERS ALREADY EXISTED AND THE FORMATTER ATE THEM ──────────────────
#
# `logging` puts every key of `extra={}` straight onto the `LogRecord` as an attribute and then
# renders the record through the handler's format string. `"%(message)s"` names none of those
# attributes, so `extra={"n_accepted": 3}` was ATTACHED and NEVER PRINTED: the writer's
# `writer_batch_acked` (`single_writer_cli.py`) and the collector's `collector_cycle_completed`
# (`collectors_cli.py`) have carried counters since before this change, and `docker logs` showed
# the bare event string `[MEDIDO 2026-09-10: `docker logs deploy-collector-1 --since 2h |
# grep -v collector_cycle_completed` -> 0 linhas]`. `PRD-007`/`DEF-3` read that output and
# concluded the counters did not exist; `ADR-035/D3` read the code and found they did. Both
# observations were true — the instrumentation was there, the rendering was not.
#
# ⚠️ TWO LAYERS SINCE THE `2026-09-11` AMENDMENT OF `ADR-035/D3` (`D9`, owner), AND THE
#    HIERARCHY BETWEEN THEM IS DECLARED RATHER THAN LEFT TO BE GUESSED:
#
# `T-01.5` was forbidden to edit `single_writer_cli.py` / `collectors_cli.py`, so it drew the
# projection/service line on the RECORD (pairs render only when the CALLER passed `extra=`)
# instead of on the handler `ADR-035/D3` literally asked for, and declared the deviation here.
# The amendment closes it WITHOUT deleting the guard that deviation bought:
#
#   GUARANTEE = THE HANDLER. `build_service_stdout_handler` (this formatter) is installed by the
#     declared service processes and by nobody else; `build_stdout_handler` and
#     `build_stream_handler` are `logging.Formatter` and nothing more. A projection CLI is now
#     STRUCTURALLY unable to put a pair on the hashed `stdout` — even if somebody writes
#     `extra=` in it — because its handler holds no code that could render one.
#
#   FALSIFIER = THE AST SWEEP, AND IT STAYS. `test_ingest_health_extra_rendering.py` walks every
#     module importing these builders, subtracts the DECLARED service processes, and fails if
#     any of the rest hands `extra=` to its module logger. It answers what the handler cannot:
#     "is the separation still the REASON the projection is clean, or did somebody start
#     emitting `extra` from the wrong side?" Its universe assertion is `==`, never `>=`, so a
#     tenth module cannot be born outside the question — the allowlist erosion `CLAUDE.md`
#     names. Deleting or loosening EITHER layer is a failure, not a simplification.
#
#   WHEN THEY DISAGREE (amendment item 3): (a) a divergence is ALWAYS a rejection — one layer
#     green never excuses the other red; (b) about BEHAVIOUR the handler decides, because the
#     bytes on `stdout` are what `ADR-008/DoD-2` hashes; (c) about the FIX the handler decides
#     too, inverted — a projection CLI that genuinely needs `extra` is PROMOTED to a service
#     process, entering `DECLARED_SERVICE_PROCESSES` *and* installing
#     `build_service_stdout_handler`. Adding a name to the exemption list without switching that
#     module's handler is forbidden: it is a bypass wearing the clothes of maintenance.
#
# THE AXIS IS THE DESTINATION OF `stdout`, NOT THE NAME OF THE PROCESS — and `T-06.1` had to
# make the `stderr` half of that choice EXPLICIT instead of leaving it implicit (`plano 06`
# item 6.1). CHOSEN: `route_diagnostics_away_from_the_product_stream` keeps rendering `extra`,
# because `stderr` feeds no projection, is hashed by nobody, and is read by the operator this
# whole decision exists to inform. What may never render a pair is a `stdout` whose bytes feed
# the `sha256` of `ADR-008/DoD-2`.
_EXTRA_SEPARATOR: Final[str] = " "

# The attribute names `logging` itself owns, DERIVED from a throwaway record instead of typed
# out, for the same reason `_APPLICATION_LOGGER` is derived: a hand-copied list rots silently
# against the standard library (`taskName` only exists from Python 3.12), and a rotted list here
# would print an internal field as if the caller had asked for it. `message` and `asctime` are
# added because `logging.Formatter.format` writes them ONTO the record while rendering it, so
# they are absent from a fresh record and present by the time this code looks at one.
_RESERVED_RECORD_ATTRIBUTES: Final[frozenset[str]] = frozenset(
    logging.LogRecord("", logging.NOTSET, "", 0, "", None, None).__dict__
) | {"message", "asctime", "taskName"}


class ExtraRenderingFormatter(logging.Formatter):
    """Render `log_format`, then append the caller's `extra={}` — and nothing else.

    A record carrying no caller-supplied attribute comes back IDENTICAL to what
    `logging.Formatter` produces. That is the entire safety argument of `ADR-035/D3` as it is
    implemented here, and it is why the canonical projection of `ADR-008/DoD-2` keeps its
    `sha256`: the projection never passes `extra=`.
    """

    def format(self, record: logging.LogRecord) -> str:
        """Append ` key=value` pairs, ordered by key, for every attribute the caller added."""
        rendered = super().format(record)
        extra = {
            name: value
            for name, value in record.__dict__.items()
            if name not in _RESERVED_RECORD_ATTRIBUTES
        }
        if not extra:
            return rendered
        # Sorted, because `docker logs` is read by a human comparing two lines and by a `grep`
        # written once: an order following dict insertion would render the same event
        # differently depending on which branch happened to build the `extra={}`.
        pairs = _EXTRA_SEPARATOR.join(f"{name}={extra[name]}" for name in sorted(extra))
        return f"{rendered}{_EXTRA_SEPARATOR}{pairs}"


def build_stream_handler(stream: TextIO, log_format: str) -> logging.StreamHandler[TextIO]:
    """Build a PURE handler on `stream` with an explicit format — no global state touched.

    Pure means `logging.Formatter` and nothing else: a record the caller decorated with
    `extra={}` renders here EXACTLY as it did before `ExtraRenderingFormatter` was written. That
    is the structural half of `ADR-035/D3`'s `2026-09-11` amendment — the projection side cannot
    leak a pair into hashed bytes because it holds no code that could produce one.
    """
    handler: logging.StreamHandler[TextIO] = logging.StreamHandler(stream)
    handler.setFormatter(logging.Formatter(log_format))
    return handler


def build_service_stream_handler(stream: TextIO, log_format: str) -> logging.StreamHandler[TextIO]:
    """Build a handler on `stream` that RENDERS the caller's `extra={}` — the service side.

    Used for the two destinations that feed no projection: the `stdout` of a declared service
    process (through `build_service_stdout_handler`) and the `stderr` of diagnostics.
    """
    handler: logging.StreamHandler[TextIO] = logging.StreamHandler(stream)
    handler.setFormatter(ExtraRenderingFormatter(log_format))
    return handler


def build_stdout_handler(stream: TextIO | None = None) -> logging.StreamHandler[TextIO]:
    """Build the PROJECTION handler: the stable format on `stdout`, `extra` never rendered."""
    return build_stream_handler(stream or sys.stdout, _STABLE_FORMAT)


def build_service_stdout_handler(stream: TextIO | None = None) -> logging.StreamHandler[TextIO]:
    """Build the SERVICE handler: the same stable format on `stdout`, with `extra` rendered.

    ⛔ INSTALLING THIS IS WHAT MAKES A MODULE A SERVICE PROCESS — the two acts are one act.
    A module that installs it must also be listed in `DECLARED_SERVICE_PROCESSES`
    (`test_ingest_health_extra_rendering.py`), and a module listed there must install it; the
    sweep checks both directions, because a list only one side looks at is a list that only
    grows. Nothing whose `stdout` is consumed by another program — hashed, `jq`-ed, diffed —
    may install it: that module is a projection CLI whatever its process lifetime looks like.
    """
    return build_service_stream_handler(stream or sys.stdout, _STABLE_FORMAT)


def route_diagnostics_away_from_the_product_stream() -> None:
    """Send this application's diagnostics to `stderr`, so `stdout` is the projection ALONE.

    ── THE DEFECT THIS EXISTS FOR, MEASURED BY THE `/qa` OF 2026-08-29 ────────────────────

    `logger.propagate = False` protected the CLI's own logger AND ONLY IT. The diagnostic
    loggers of `use_cases/ingest_health.py` and of `infra/sqlite_ingest_record_store.py` sit
    in the SAME call path and reach whatever handler the HOST installed. A `cron` wrapper, a
    scheduler or a supervisor calls `logging.basicConfig(stream=sys.stdout, level=INFO)`
    before calling anything, and from then on the FIRST line of `stdout` was a diagnostic
    record `[MEDIDO 2026-08-29 by the /qa]`.

    That broke two properties this code states in writing: `IngestHealthReport.canonical_lines`
    promises that EVERY line is valid JSON on its own, and `ADR-008/DoD-2` compares the
    `sha256` of this output against the one feeding S1. The consumer of `T-07.13` would have
    received garbage on the first line — and silently, because nothing looked at it.

    ── WHY THE STREAM SPLIT, AND WHY IT IS NOT THE ONLY HALF OF THE FIX ───────────────────

    The other half lives in the layers themselves: their diagnostics moved from INFO to DEBUG,
    which is the level whose contract is "off unless somebody asks". That alone fixes every
    host that configures INFO — including hosts that never run this CLI, which is why it
    belongs in the layers and not here.

    It is NOT sufficient on its own: a host that asks for DEBUG on `stdout` would bring the
    contamination back. This function closes that, and it closes it AT ANY LEVEL, because it
    changes the DESTINATION rather than the volume. Product on `stdout`, diagnostics on
    `stderr` is the ordinary contract of a CLI, and the composition root is the only layer
    entitled to decide destinations — a store that wrote to `stderr` by itself would be an
    infrastructure module choosing the operator's terminal.

    THE COST, NAMED: while this CLI runs, records under `src.*` stop reaching handlers the
    host installed on the root logger. A host that wanted to capture our diagnostics into its
    own file handler cannot, and would have to attach to the `src` logger instead. That is the
    price of a `stdout` whose bytes are a contract, and it is only paid by `main` — importing
    this module changes no logger at all.
    """
    application = logging.getLogger(_APPLICATION_LOGGER)
    application.addHandler(build_service_stream_handler(sys.stderr, _DIAGNOSTIC_FORMAT))
    application.propagate = False


def report(store_path: Path) -> str:
    """Emit the canonical projection line by line and return it, so it can be hashed.

    RETURNING WHAT IT EMITTED IS NOT CONVENIENCE — it is what makes `ADR-008/DoD-2` runnable
    without rereading the terminal: the caller hashes the SAME string the logger wrote, and
    the test compares it against `IngestHealthReport.fingerprint()`. A report whose output
    could only be inspected by capturing a stream would be a report nobody can falsify.
    """
    health = ingest_health_query(SqliteIngestRecordStore(store_path))
    for line in health.canonical_lines():
        logger.info(line)
    return health.canonical_projection()


def main(argv: Sequence[str]) -> int:
    """Wire the streams and report the record of the store named in `argv`.

    This is the composition root, and the order matters: diagnostics are pushed off `stdout`
    BEFORE anything can log, and only then does the product logger take `stdout` over.
    """
    if len(argv) != 1:
        raise SystemExit(_USAGE)
    route_diagnostics_away_from_the_product_stream()
    logger.setLevel(logging.INFO)
    logger.addHandler(build_stdout_handler())
    # Without this the root logger would re-emit every line, and the output would stop being
    # the exact canonical projection — duplicated, it matches no `sha256` at all.
    logger.propagate = False
    report(Path(argv[0]))
    return 0


if __name__ == "__main__":  # pragma: no cover - composition root, exercised by subprocess
    raise SystemExit(main(sys.argv[1:]))
