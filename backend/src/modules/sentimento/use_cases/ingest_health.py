"""`ingest_health_query`: the ONE named query of `ADR-008/D3`, with two consumers."""

from __future__ import annotations

import logging
from typing import Final, Protocol

from src.modules.sentimento.domain.ingest_record import (
    KNOWN_VERDICTS,
    IngestGap,
    IngestHealthReport,
    IngestRun,
    UnknownVerdictError,
)

logger = logging.getLogger(__name__)

# O nome e ESTAVEL e vive num lugar so: `ADR-008/D3` fixa o nome antes de fixar as colunas,
# porque e por ele que o segundo consumidor (S1, `T-07.13`/`CST-67`) encontra esta funcao em
# vez de escrever a dele.
INGEST_HEALTH_QUERY_NAME: Final[str] = "ingest_health_query"


class IngestRecordSource(Protocol):
    """Read port over the PERSISTED `md.ingest_run` / `md.ingest_gap` — never over a log."""

    def runs(self) -> tuple[IngestRun, ...]: ...  # noqa: D102

    def gaps(self) -> tuple[IngestGap, ...]: ...  # noqa: D102


def ingest_health_query(source: IngestRecordSource) -> IngestHealthReport:
    """Read the persisted record and return it in the shape both consumers share.

    ── POR QUE A RECUSA DE `verdict` DESCONHECIDO MORA AQUI, E NAO NO DATACLASS ──────────

    `IngestRun` e o registro CRU: o plano da fase 02 manda "grava cru + `received_at`", e um
    dataclass que recusasse valores no construtor tornaria IMPOSSIVEL persistir o que a borda
    de ingestao de fato observou. O que nao pode acontecer e um consumidor EXIBIR uma execucao
    cujo `verdict` ele nao entende como se entendesse.

    Entao a recusa fica exatamente onde `ADR-008/DoD-3` a quer: no caminho COMPARTILHADO de
    leitura. Um `verdict` inedito injetado no store faz os DOIS consumidores reprovarem juntos,
    porque so existe um lugar onde a decisao e tomada. Se um dia um passar e o outro nao,
    isso prova que alguem escreveu a segunda implementacao — que e o unico defeito que
    `ADR-008` inteira existe para impedir, e ele e SILENCIOSO por natureza.
    """
    runs = source.runs()
    unknown = sorted({run.verdict for run in runs} - KNOWN_VERDICTS)
    if unknown:
        raise UnknownVerdictError(
            f"{INGEST_HEALTH_QUERY_NAME} nao conhece o(s) verdict(s) {unknown}; "
            f"conhecidos: {sorted(KNOWN_VERDICTS)}. Os dois consumidores mudam juntos "
            f"(ADR-008/DoD-3) — esconder a execucao seria a duplicacao silenciosa."
        )
    gaps = source.gaps()
    logger.info(
        "ingest_health_query_lida",
        extra={"runs": len(runs), "gaps": len(gaps)},
    )
    return IngestHealthReport(runs=runs, gaps=gaps)
