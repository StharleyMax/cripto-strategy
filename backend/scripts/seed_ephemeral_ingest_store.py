"""Semeia um `SqliteIngestRecordStore` EFEMERO para `make e2e` (`T-01.8`).

Chamado por `scripts/e2e-env.sh` (nunca pelo `Makefile` direto — `ADR-011/D2`: o `Makefile`
chama `.sh`, e o `.sh` chama este `.py` no venv, mesma cadeia que `boundaries.sh`/`natureza.sh`
ja usam). Fica em `backend/scripts/`, a MESMA lacuna declarada de `code_paths` que
`natureza.py`/`check-coverage-layers.sh` ja ocupam (`frontend/README.md` s2-bis) — nao e
"codigo de producao" no sentido que `harness code-paths classify` mede, e por isso os
identificadores aqui seguem a convencao ja em vigor NESTE diretorio (`natureza.py`), nao a de
`backend/src`.

O QUE ELE GARANTE, e por que isso satisfaz "nao usa data/ (nao versionado)": nenhum caminho
sob `data/` e lido. Os `IngestRun`/`IngestGap` sao construidos EM MEMORIA, deterministicos por
indice (mesma forma de `tests/helpers/ingest_record_driver.py:build_run`, mas este arquivo NAO
importa de `backend/tests/` — um script de infraestrutura que dependesse de codigo de teste
seria a mesma inversao de camada que `ADR-009/D6.3` proibe para `src.main`/`src.api`) — o
store efemero e sempre um arquivo NOVO, num diretorio que `scripts/e2e-env.sh` cria com
`mktemp -d` e apaga ao final.
"""

from __future__ import annotations

import sys
from pathlib import Path

from src.modules.sentimento.domain.ingest_record import IngestGap, IngestRun
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore

_USO = "uso: seed_ephemeral_ingest_store.py <caminho-do-store> [n_runs=1] [n_gaps=0]"


def _uma_run(indice: int) -> IngestRun:
    """Constroi a run numero `indice` — deterministica, sem ler `data/` nem o relogio."""
    return IngestRun(
        run_id=f"e2e-run-{indice:04d}",
        source="binance-futures",
        endpoint="/fapi/v1/openInterestHist",
        window=f"2026-08-{(indice % 28) + 1:02d}T00:00:00Z/2026-08-{(indice % 28) + 1:02d}T01:00:00Z",
        n_expected=12,
        n_returned=12,
        n_written=12,
        verdict="ACCEPTED",
        api_code=None,
        src_sha256=f"{indice:064x}",
        weight_used=1,
        observer_id="observer-e2e",
        observer_region="sa-east-1",
        clock_skew_ms=indice,
        started_at=f"2026-08-29T00:{indice // 60:02d}:{indice % 60:02d}Z",
        ended_at=f"2026-08-29T00:{indice // 60:02d}:{indice % 60:02d}Z",
    )


def _um_gap(indice: int) -> IngestGap:
    """Constroi o gap numero `indice` — mesmo espirito deterministico de `_uma_run`."""
    return IngestGap(
        source="binance-futures",
        symbol="BTCUSDT",
        series_key_id="binance-futures:BTCUSDT:openInterest",
        from_ts=f"2026-08-{(indice % 28) + 1:02d}T00:00:00Z",
        to_ts=f"2026-08-{(indice % 28) + 1:02d}T00:05:00Z",
        n_missing=5,
        gap_class="MISSING",
        detected_at=f"2026-08-{(indice % 28) + 1:02d}T00:06:00Z",
    )


def semear(store_path: Path, n_runs: int, n_gaps: int) -> None:
    """Cria (ou reaproveita) o store em `store_path` e grava `n_runs` runs e `n_gaps` gaps."""
    store = SqliteIngestRecordStore(store_path)
    store.initialise()
    for indice in range(n_runs):
        store.record_run(_uma_run(indice))
    for indice in range(n_gaps):
        store.record_gap(_um_gap(indice))


def main(argv: list[str]) -> int:
    """Ponto de entrada do CLI: valida argv e chama `semear`."""
    if not 1 <= len(argv) <= 3:
        raise SystemExit(_USO)
    store_path = Path(argv[0])
    n_runs = int(argv[1]) if len(argv) >= 2 else 1
    n_gaps = int(argv[2]) if len(argv) >= 3 else 0
    if n_runs < 1:
        raise SystemExit(f"RECUSA: n_runs deve ser >= 1 (DoD D1.10 do plano 01) — recebido {n_runs}.")
    if n_gaps < 0:
        raise SystemExit(f"RECUSA: n_gaps deve ser >= 0 — recebido {n_gaps}.")
    semear(store_path, n_runs, n_gaps)
    return 0


if __name__ == "__main__":  # pragma: no cover - script de infraestrutura, exercitado via subprocess
    raise SystemExit(main(sys.argv[1:]))
