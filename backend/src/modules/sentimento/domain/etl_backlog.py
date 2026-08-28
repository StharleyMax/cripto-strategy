"""Backlog de ETL: a janela FECHADA de trabalho e o que dela ainda falta."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass


class InvalidBacklogError(Exception):
    """Janela de trabalho malformada: chave vazia ou repetida."""


class CheckpointOutsideWindowError(Exception):
    """O checkpoint carrega chave que a janela declarada nao contem."""


@dataclass(frozen=True)
class EtlBacklog:
    """Janela enumerada a priori (`SPEC-001` §5.7) — a ordem declarada e a ordem de trabalho."""

    keys: tuple[str, ...]

    def __post_init__(self) -> None:
        if any(not key for key in self.keys):
            raise InvalidBacklogError("chave vazia na janela declarada")
        # DIVIDA NOMEADA — `self.keys.count(key)` DENTRO da comprehension e O(n^2). Medido nesta
        # arvore `[MEDIDO 2026-08-28: timeit, 3 repeticoes por n, backend/.venv/bin/python]`:
        #   n=120 -> 0,26 ms · n=1.200 -> 22,90 ms · n=12.000 -> 2.345,81 ms
        # 100x no n custa ~9.000x no tempo: quadratico, confirmado por medicao e nao por leitura.
        # Em 120 (a janela desta suite) e irrelevante. A profundidade PARAMETRIZADA da fila de
        # `T-03.10` (CST-26 — `Q18` e "profundidade como parametro" estao no titulo e nos
        # refs DELA, nao de `T-03.11`) pode nao ser — e la que a troca para uma contagem
        # linear (`Counter`) tem dono. Nao trocado aqui: seria mudanca sem numero que a exija.
        repeated = sorted({key for key in self.keys if self.keys.count(key) > 1})
        if repeated:
            raise InvalidBacklogError(f"chave repetida na janela declarada: {repeated}")

    @classmethod
    def of(cls, keys: Iterable[str]) -> EtlBacklog:
        """Constroi a janela a partir de qualquer iteravel, preservando a ordem recebida."""
        return cls(tuple(keys))

    def __len__(self) -> int:
        return len(self.keys)

    def pending(self, done: Iterable[str]) -> tuple[str, ...]:
        """O que falta, na ordem declarada. Chave concluida fora da janela e ERRO, nao ruido."""
        done_set = frozenset(done)
        outside = sorted(done_set - set(self.keys))
        if outside:
            raise CheckpointOutsideWindowError(
                f"checkpoint declara {len(outside)} chave(s) fora da janela: {outside[:5]}"
            )
        return tuple(key for key in self.keys if key not in done_set)
