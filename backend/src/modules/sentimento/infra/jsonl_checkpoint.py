"""Checkpoint duravel em JSONL append-only: `fsync` por linha e cauda truncada descartada."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)


class CorruptedCheckpointError(Exception):
    """Linha COMPLETA e ilegivel: corrupcao. Cauda sem `\\n` e outra coisa, e e tolerada."""


class JsonlCheckpoint:
    """Uma linha por item concluido, com `flush` + `fsync` ANTES de `record` retornar.

    O QUE ESTA SUITE MEDE `[MEDIDO 2026-08-28: bash backend/scripts/test.sh -> 14 passed, rc=0]`:
    que `os.fsync` e chamado uma vez por linha e que a linha JA esta no arquivo nesse instante
    (`tests/sentimento/test_durabilidade_da_infra.py`, 2 testes; apagar `flush`+`fsync` dos dois
    modulos de `infra` faz os dois REPROVAREM `[MEDIDO 2026-08-28: 2 failed, 12 passed]`).

    O QUE O `SIGKILL` DO TESTE DE `D3.1` NAO EXERCITA: depois do `close()` do `with`, os bytes
    estao no page cache do KERNEL; `SIGKILL` mata o processo e o kernel sobrevive, logo o page
    cache tambem — `D3.1` passaria sem `fsync` nenhum. O que o `fsync` compra e sobreviver a
    QUEDA DE ENERGIA / PANICO DE KERNEL, e isso e `[NAO MEDIDO]`: nenhum teste desta suite corta
    energia, derruba o kernel ou inspeciona o dispositivo de bloco. A garantia contra power-loss
    e reivindicada pelo contrato do `fsync(2)`, nao por medicao deste repositorio.
    """

    def __init__(self, path: Path) -> None:
        self._path = path

    @property
    def path(self) -> Path:
        return self._path

    def entries(self) -> tuple[str, ...]:
        """Todas as chaves gravadas, na ordem — repeticao inclusa, para que ela seja mensuravel.

        DIVIDA NOMEADA — a classificacao de erro esta INCOMPLETA e o `CorruptedCheckpointError`
        so cobre o JSON ilegivel. Payload legivel com forma errada escapa da classe declarada
        `[MEDIDO 2026-08-28, universo 4 payloads, backend/.venv/bin/python contra este modulo]`:
          `{"chave": "a.csv"}` -> `KeyError: 'key'`
          `5`                  -> `TypeError: 'int' object is not subscriptable`
          `["a.csv"]`          -> `TypeError: list indices must be integers or slices, not str`
          `{"key": null}`      -> NAO levanta nada: devolve `('None',)`, porque `str(None)` coage.
        O ultimo e o pior: uma chave chamada `None` seria marcada concluida EM SILENCIO, e isso
        derrota a invariante "nao perde" por coercao.

        POR QUE NAO E CONSERTADO AQUI: hoje so um escritor EXTERNO produz esses payloads — nesta
        arvore o unico escritor e `record()`, que so emite `{"key": <str>}`. A fila que expoe o
        arquivo a um escritor de fora e `T-03.10` (CST-26, "fila de ETL do dump retomavel");
        e la que a validacao de forma tem dono. NAO e `T-03.11`, que e a reconciliacao
        diaria de liquidacao e esta `blocked` por `Q1` — divida pendurada la nao chega em
        quem escreve a fila.
        """
        if not self._path.exists():
            return ()
        raw = self._path.read_bytes()
        if not raw:
            return ()
        lines = raw.split(b"\n")
        tail = lines.pop()
        if tail:
            logger.warning("checkpoint_cauda_truncada", extra={"bytes_descartados": len(tail)})
        keys: list[str] = []
        for numero, line in enumerate(lines, start=1):
            if not line.strip():
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError as exc:
                raise CorruptedCheckpointError(f"linha {numero} ilegivel em {self._path}") from exc
            keys.append(str(payload["key"]))
        return tuple(keys)

    def done(self) -> frozenset[str]:
        return frozenset(self.entries())

    def record(self, key: str) -> None:
        """Append + `flush` + `fsync`. Sem o `fsync` a linha vive so no cache da pagina."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps({"key": key}, ensure_ascii=False) + "\n"
        with self._path.open("a", encoding="utf-8") as handle:
            handle.write(line)
            handle.flush()
            os.fsync(handle.fileno())
