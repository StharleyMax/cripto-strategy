"""Durable `md.ingest_run` / `md.ingest_gap` in SQLite: one commit per row, reread after a kill."""

from __future__ import annotations

import logging
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Final, cast

from src.modules.sentimento.domain.ingest_record import IngestGap, IngestRun

logger = logging.getLogger(__name__)

# A FRONTEIRA COM O BANCO E UNTYPED POR NATUREZA — `sqlite3` devolve `Any`, e nenhum
# `--strict` conserta isso lendo o driver. As duas tuplas abaixo sao a forma que este modulo
# AFIRMA que o `SELECT` logo abaixo produz, e o `cast` unico por linha faz o `mypy` conferir
# a ARIDADE e a ordem contra o construtor do dataclass. Vinte e quatro `cast` por campo
# fariam a mesma coisa pior: cada um seria uma afirmacao separada e nenhuma delas contaria as
# colunas. Se o `SELECT` mudar de forma sem que estas tuplas mudem, o `mypy` reprova.
_RunRow = tuple[
    str, str, str, str, int, int, int, str, int | None, str, int, str, str, int, str, str
]
_GapRow = tuple[str, str, str, str, str, int, str, str]

# ── O MOTOR E SQLite, E `ADR-002/D1` DIZ PostgreSQL — a divergencia vai ESCRITA ────────────
#
# `ADR-002/D1` poe `md.ingest_run` e `md.ingest_gap` no PostgreSQL "que ja esta de pe", e essa
# ADR e de F4, esta com status `proposto` e tem o finalista de motor PENDENTE DE SPIKE (`D4`).
# Este repositorio HOJE declara `dependencies = []` em `backend/pyproject.toml` e a suite e
# offline por construcao (`backend/scripts/test.sh`, "ZERO REDE"): nao ha driver de Postgres,
# nao ha daemon e `Q2` nao e requisito desta fase — o plano 02 existe separado do 03
# exatamente porque F0 nao depende de host.
#
# O que este modulo escolhe e o ADAPTADOR, nao a decisao: quem decide o motor e `ADR-002`, e
# a troca custa UM arquivo porque o contrato de leitura e o `Protocol` `IngestRecordSource`
# em `use_cases/ingest_health.py` — nenhum consumidor importa `sqlite3`. A PERGUNTA ("F0
# persiste em SQLite ate o spike de `ADR-002/D4`, ou espera o Postgres?") esta ABERTA e
# nomeada para o `quant-architect`; ela nao foi respondida aqui.
#
# SQLite NAO TEM SCHEMA NOMEADO, entao `md.ingest_run` vira a tabela `md_ingest_run`. O ponto
# do nome logico esta preservado no prefixo, e a projecao que os dois consumidores comparam
# nao cita nome de tabela nenhum — ela cita as 15 colunas de `ADR-008/D3`.

_DDL: Final[tuple[str, ...]] = (
    """
    CREATE TABLE IF NOT EXISTS md_ingest_run (
        run_id          TEXT PRIMARY KEY,
        source          TEXT NOT NULL,
        endpoint        TEXT NOT NULL,
        "window"        TEXT NOT NULL,
        n_expected      INTEGER NOT NULL,
        n_returned      INTEGER NOT NULL,
        n_written       INTEGER NOT NULL,
        verdict         TEXT NOT NULL,
        api_code        INTEGER,
        src_sha256      TEXT NOT NULL,
        weight_used     INTEGER NOT NULL,
        observer_id     TEXT NOT NULL,
        observer_region TEXT NOT NULL,
        clock_skew_ms   INTEGER NOT NULL,
        started_at      TEXT NOT NULL,
        ended_at        TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS md_ingest_gap (
        source        TEXT NOT NULL,
        symbol        TEXT NOT NULL,
        series_key_id TEXT NOT NULL,
        from_ts       TEXT NOT NULL,
        to_ts         TEXT NOT NULL,
        n_missing     INTEGER NOT NULL,
        gap_class     TEXT NOT NULL,
        detected_at   TEXT NOT NULL,
        PRIMARY KEY (source, symbol, series_key_id, from_ts, to_ts)
    )
    """,
)

_INSERT_RUN: Final[str] = (
    "INSERT OR REPLACE INTO md_ingest_run "
    '(run_id, source, endpoint, "window", n_expected, n_returned, n_written, verdict, '
    " api_code, src_sha256, weight_used, observer_id, observer_region, clock_skew_ms, "
    " started_at, ended_at) "
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
)

_INSERT_GAP: Final[str] = (
    "INSERT OR REPLACE INTO md_ingest_gap "
    "(source, symbol, series_key_id, from_ts, to_ts, n_missing, gap_class, detected_at) "
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
)

# A ORDENACAO E PARTE DA IMPRESSAO DIGITAL. `ADR-008/DoD-2` compara `sha256` de projecoes, e
# duas leituras do MESMO estado que devolvessem ordens diferentes dariam hashes diferentes
# sem que nada estivesse errado — o falsificador viraria ruido. Por isso o `ORDER BY` e
# TOTAL: ele termina numa chave unica em cada tabela, e nao num campo que empata.
_SELECT_RUNS: Final[str] = (
    'SELECT run_id, source, endpoint, "window", n_expected, n_returned, n_written, verdict, '
    "       api_code, src_sha256, weight_used, observer_id, observer_region, clock_skew_ms, "
    "       started_at, ended_at "
    "FROM md_ingest_run ORDER BY started_at, run_id"
)

_SELECT_GAPS: Final[str] = (
    "SELECT source, symbol, series_key_id, from_ts, to_ts, n_missing, gap_class, detected_at "
    "FROM md_ingest_gap ORDER BY detected_at, source, symbol, series_key_id, from_ts, to_ts"
)


class SqliteIngestRecordStore:
    """Persisted record — never a log — read back by `ingest_health_query`.

    WHAT `D2.9` MEASURES HERE, AND IT IS MEASURED AND NOT ASSERTED IN PROSE: a `SIGKILL` in
    the middle of a recording run leaves every COMMITTED row readable by a process that never
    shared memory with the dead one (`tests/sentimento/test_ingest_record_durability.py`).
    The falsifier lives in the same file: swapping this store for an in-memory one makes the
    restart come back EMPTY.

    WHAT IT DOES NOT MEASURE, said out loud for the same reason `JsonlCheckpoint` says it:
    POWER LOSS. `SIGKILL` kills the process and the kernel survives, so a committed page in
    the page cache survives with it. What buys survival across a power cut is SQLite's default
    `synchronous=FULL` on the rollback journal, and that is `[NAO MEDIDO]` — no test in this
    suite cuts power or inspects the block device.

    ONE CONNECTION PER CALL, opened and closed. It costs an `open(2)` per operation, which at
    the volume of an ingestion record is noise, and it buys two things that matter more:
    a reader in another process sees every committed row with no cache to invalidate, and a
    `SIGKILL` never leaves this object holding a handle whose state nobody can reason about.
    """

    def __init__(self, path: Path) -> None:
        """Bind the store to `path`; nothing is created or read until a method is called."""
        self._path = path

    @property
    def path(self) -> Path:
        """Return the database file this store reads and writes."""
        return self._path

    def initialise(self) -> None:
        """Create both tables if they are absent — idempotent, and safe to call on every run."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self._path)) as connection:
            for statement in _DDL:
                connection.execute(statement)
            connection.commit()

    def record_run(self, run: IngestRun) -> None:
        """Persist one `md.ingest_run` row and COMMIT before returning."""
        with closing(sqlite3.connect(self._path)) as connection:
            connection.execute(
                _INSERT_RUN,
                (
                    run.run_id,
                    run.source,
                    run.endpoint,
                    run.window,
                    run.n_expected,
                    run.n_returned,
                    run.n_written,
                    run.verdict,
                    run.api_code,
                    run.src_sha256,
                    run.weight_used,
                    run.observer_id,
                    run.observer_region,
                    run.clock_skew_ms,
                    run.started_at,
                    run.ended_at,
                ),
            )
            connection.commit()
        logger.info("ingest_run_persistido", extra={"run_id": run.run_id})

    def record_gap(self, gap: IngestGap) -> None:
        """Persist one `md.ingest_gap` row and COMMIT before returning."""
        with closing(sqlite3.connect(self._path)) as connection:
            connection.execute(
                _INSERT_GAP,
                (
                    gap.source,
                    gap.symbol,
                    gap.series_key_id,
                    gap.from_ts,
                    gap.to_ts,
                    gap.n_missing,
                    gap.gap_class,
                    gap.detected_at,
                ),
            )
            connection.commit()
        logger.info("ingest_gap_persistido", extra={"source": gap.source, "symbol": gap.symbol})

    def runs(self) -> tuple[IngestRun, ...]:
        """Return every persisted run, in a total and therefore reproducible order."""
        return tuple(IngestRun(*cast(_RunRow, row)) for row in self._fetch(_SELECT_RUNS))

    def gaps(self) -> tuple[IngestGap, ...]:
        """Return every persisted gap, in a total and therefore reproducible order."""
        return tuple(IngestGap(*cast(_GapRow, row)) for row in self._fetch(_SELECT_GAPS))

    def _fetch(self, statement: str) -> list[tuple[object, ...]]:
        """Run a read statement against the file, returning nothing when the file is absent.

        An ABSENT file is an empty record, not an error: the CLI report of a collector that
        has never run has to say "zero runs" instead of blowing up, or the first thing the
        F0 record does is hide the very state it exists to show.
        """
        if not self._path.exists():
            return []
        with closing(sqlite3.connect(self._path)) as connection:
            return list(connection.execute(statement).fetchall())
