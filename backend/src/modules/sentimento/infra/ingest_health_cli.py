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
# `ADR-035/D3` did NOT relax that: the format string is untouched and a record with no `extra=`
# still renders to exactly `%(message)s`. What changed is `ExtraRenderingFormatter` below, and
# only for records the CALLER decorated — see the block above it for why the distinction lives
# on the record rather than on a second handler.
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
# ⚠️ WHY THIS IS A PER-RECORD RULE AND NOT A SECOND HANDLER — a deviation from the LITERAL
#    wording of `ADR-035/D3`, declared here instead of being quiet about it:
#
# `ADR-035/D3` says "a troca e no handler do processo de servico (escritor, coletor), nunca no
# handler de projecao". A SEPARATE handler only helps if the service processes are edited to
# install it, and `single_writer_cli.py` / `collectors_cli.py` are owned by sibling tasks
# running in parallel — the one thing `T-01.5` is forbidden to touch. So the distinction is
# drawn where it CAN be drawn from here: on the RECORD, not on the handler.
#
# It is the same distinction seen from the other side. A projection line is
# `logger.info(canonical_json_line)` with NO `extra=`; a service event is
# `logger.info("event_name", extra={...})`. For a record with no caller-supplied attribute this
# formatter returns EXACTLY what `logging.Formatter` returned, byte for byte, so the `sha256`
# that `ADR-008/DoD-2` compares on both sides CANNOT move. The projection is not "probably
# unaffected" — it is unaffected by construction.
#
# THE RISK THIS TRADES FOR, NAMED RATHER THAN HIDDEN: a separate handler would keep a PROJECTION
# CLI silent even if it later grew an `extra=`; this one would print it and corrupt the hashed
# bytes. That is a real regression path, so it gets a real guard —
# `backend/tests/sentimento/test_ingest_health_extra_rendering.py` walks the AST of every module
# importing these builders, subtracts the DECLARED service processes, and fails if any of the
# rest hands `extra=` to its module logger.
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
    """Build a handler on `stream` with an explicit format — no global state touched."""
    handler: logging.StreamHandler[TextIO] = logging.StreamHandler(stream)
    handler.setFormatter(ExtraRenderingFormatter(log_format))
    return handler


def build_stdout_handler(stream: TextIO | None = None) -> logging.StreamHandler[TextIO]:
    """Build the handler that puts the product output on `stdout` with the stable format."""
    return build_stream_handler(stream or sys.stdout, _STABLE_FORMAT)


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
    application.addHandler(build_stream_handler(sys.stderr, _DIAGNOSTIC_FORMAT))
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
