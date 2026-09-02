"""ETL backlog: the CLOSED window of work, and what is still missing from it."""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass


class InvalidBacklogError(Exception):
    """Malformed work window: an empty key, or a key declared twice."""


class CheckpointOutsideWindowError(Exception):
    """The checkpoint carries a key that the declared window does not contain."""


@dataclass(frozen=True)
class EtlBacklog:
    """Window enumerated up front (`SPEC-001` §5.7) — declared order IS the work order."""

    keys: tuple[str, ...]

    def __post_init__(self) -> None:
        """Reject an empty or repeated key at construction time."""
        if any(not key for key in self.keys):
            raise InvalidBacklogError("empty key in declared window")
        # DIVIDA FECHADA POR `T-03.10`, E O NUMERO QUE A EXIGIA AGORA EXISTE.
        #
        # A forma anterior era `self.keys.count(key)` DENTRO da comprehension — O(n^2) — e ela
        # ficou de proposito, com o dono escrito: *"a profundidade PARAMETRIZADA da fila de
        # `T-03.10` pode nao ser [irrelevante] — e la que a troca para uma contagem linear
        # (`Counter`) tem dono. Nao trocado aqui: seria mudanca sem numero que a exija."*
        #
        # O NUMERO CHEGOU COM A PROFUNDIDADE. `Q18` nomeia DUAS — 30 d (o default) e 2.183 d (o
        # historico inteiro, "4,1 h contra 297 h") — e a raiz de composicao pode concatenar
        # janelas de varios simbolos. AS DUAS FORMAS MEDIDAS NA MESMA RODADA, com a igualdade
        # da saida conferida a cada n `[MEDIDO 2026-08-29: timeit, MINIMO de 5 repeticoes por n
        # e por forma, backend/.venv/bin/python -B com PYTHONDONTWRITEBYTECODE=1]`:
        #
        #   n                                 `.count` (antes)   `Counter` (agora)   fator
        #      30  (30 d, 1 simbolo)                  0,01 ms            0,00 ms        3x
        #   2.183  (2.183 d, 1 simbolo)              78,42 ms            0,17 ms      454x
        #  12.000                                 2.363,86 ms            1,30 ms    1.817x
        #  43.660  (2.183 d x 20 simbolos)       37.227,38 ms            5,40 ms    6.898x
        #
        # 37,2 s para CONSTRUIR o backlog — antes de um unico byte ser lido — contra 5,4 ms.
        # O MINIMO de 5 e nao a media de 3 porque a medicao anterior oscilou ~20 % entre
        # rodadas nesta maquina, e citar duas casas decimais de um numero instavel e inventar
        # precisao: o minimo e a estimativa menos contaminada por ruido de escalonador.
        # Em 30 dias a troca nao paga nada, e e por isso que ela nao foi feita antes; e feita
        # agora porque a profundidade e parametro e o parametro alcanca 43.660.
        #
        # `Counter` conta em UMA passada, e a saida e IDENTICA — as chaves repetidas em ordem
        # alfabetica —, entao nenhum teste existente muda de expectativa.
        repeated = sorted(key for key, times in Counter(self.keys).items() if times > 1)
        if repeated:
            raise InvalidBacklogError(f"repeated key in declared window: {repeated}")

    @classmethod
    def of(cls, keys: Iterable[str]) -> EtlBacklog:
        """Build the window from any iterable, preserving the order received."""
        return cls(tuple(keys))

    def __len__(self) -> int:
        """Return how many keys the declared window holds."""
        return len(self.keys)

    def pending(self, done: Iterable[str]) -> tuple[str, ...]:
        """Return what is still missing, in the declared order.

        A completed key that falls outside the declared window is an ERROR, not noise.
        """
        done_set = frozenset(done)
        outside = sorted(done_set - set(self.keys))
        if outside:
            raise CheckpointOutsideWindowError(
                f"checkpoint declares {len(outside)} key(s) outside the window: {outside[:5]}"
            )
        return tuple(key for key in self.keys if key not in done_set)
