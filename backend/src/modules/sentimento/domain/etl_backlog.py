"""ETL backlog: the CLOSED window of work, and what is still missing from it."""

from __future__ import annotations

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
                f"checkpoint declara {len(outside)} chave(s) fora da janela: {outside[:5]}"
            )
        return tuple(key for key in self.keys if key not in done_set)
