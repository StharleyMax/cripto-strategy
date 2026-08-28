"""Drena o backlog de ETL de forma retomavel: registra DEPOIS de o item estar publicado."""

from __future__ import annotations

import logging
from typing import Protocol

from src.modules.sentimento.domain.etl_backlog import EtlBacklog

logger = logging.getLogger(__name__)


class ItemWorker(Protocol):
    """Porta de trabalho. Contrato: `process` publica de forma ATOMICA e e IDEMPOTENTE."""

    def process(self, key: str) -> None: ...


class Checkpoint(Protocol):
    """Porta de checkpoint DURAVEL — em memoria nao serve, e ha teste que mostra por que."""

    def done(self) -> frozenset[str]: ...

    def record(self, key: str) -> None: ...


def drain(backlog: EtlBacklog, worker: ItemWorker, checkpoint: Checkpoint) -> tuple[str, ...]:
    """Processa o pendente na ordem declarada; devolve o que ESTA execucao processou.

    A ordem `process` -> `record` e o que compra "nao perde": morrer entre os dois deixa o
    item pendente e ele e refeito na retomada. "Nao duplica" nao vem daqui — vem do contrato
    de idempotencia de `ItemWorker`, e e por isso que ele esta escrito na porta.
    """
    processed: list[str] = []
    for key in backlog.pending(checkpoint.done()):
        worker.process(key)
        checkpoint.record(key)
        processed.append(key)
        logger.info("etl_item_concluido", extra={"etl_key": key})
    logger.info(
        "etl_drenagem_concluida",
        extra={"processados": len(processed), "janela": len(backlog)},
    )
    return tuple(processed)
