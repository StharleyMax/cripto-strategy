"""Drain the ETL backlog resumably: record only AFTER the item is published."""

from __future__ import annotations

import logging
from typing import Protocol

from src.modules.sentimento.domain.etl_backlog import EtlBacklog

logger = logging.getLogger(__name__)

# ── OS TRES `noqa` DE `D102` ABAIXO SAO NOMEADOS, E A ALTERNATIVA FOI MEDIDA ──────────────────
#
# Dar docstring a um stub de `Protocol` OBRIGA a trocar o corpo `...` por ela — as duas coisas
# juntas poem o `...` numa linha propria e ACRESCENTAM statement. E o `...` de uma linha e
# EXCLUIDO da cobertura pelo regex PADRAO do coverage.py, nao por escolha deste repositorio
# [MEDIDO 2026-08-28: `CoverageConfig().exclude_list[1]` e um regex que casa exatamente
#  `def ...: ...` numa unica linha — o proprio `...` como corpo, com ou sem comentario atras].
#
# A troca foi FEITA e MEDIDA antes de ser desfeita: `use_cases` vai de 16 para 19 statements e
# o total de 107 para 110 `[MEDIDO 2026-08-28: bash backend/scripts/test.sh, as duas formas]`.
# 100% continua 100%, mas o falsificador declarado de `T-01.7` e "OS MESMOS NUMEROS" — e um
# falsificador que se explica em vez de passar ja foi derrotado.
#
# O contrato de cada porta esta na docstring da CLASSE, logo acima do stub: nada se perde.
# Se algum dia estes stubs ganharem corpo de verdade, o `noqa` sai junto com o `...`.
#
# E ELES SUPRIMEM ACHADO REAL, o que ate 2026-08-29 nao era verdade: `D` so entrou em
# `[tool.ruff.lint] select` com este mesmo commit, e antes disso `lint.sh` nao media docstring
# nenhuma — estes tres `noqa` eram INERTES. Falsificador, e ele foi RODADO: remover UM deles
# faz `bash backend/scripts/lint.sh` sair `rc=1` com `D102` [MEDIDO 2026-08-29, em copia
# restaurada e conferida por sha256].


class ItemWorker(Protocol):
    """Work port. Contract: `process` publishes ATOMICALLY and is IDEMPOTENT."""

    def process(self, key: str) -> None: ...  # noqa: D102


class Checkpoint(Protocol):
    """Durable checkpoint port — in-memory will not do, and a test shows why."""

    def done(self) -> frozenset[str]: ...  # noqa: D102

    def record(self, key: str) -> None: ...  # noqa: D102


def drain(backlog: EtlBacklog, worker: ItemWorker, checkpoint: Checkpoint) -> tuple[str, ...]:
    """Process what is pending, in declared order; return what THIS run processed.

    The order `process` -> `record` is what buys "never loses": dying between the two leaves
    the item pending and it is redone on resume. "Never duplicates" does not come from here —
    it comes from the idempotence contract of `ItemWorker`, which is why it is written on the
    port itself.
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
