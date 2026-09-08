# Fase 01 — Probe com região conhecida + store que sobrevive

**Componente:** `sentimento` (+ `infra` na composição) · **Depende de:** nada · **SPEC:** [`SPEC-005 §3.1-3.2, §3.5, §6`](../../specs/SPEC-005-coinalyze-fora-da-quarentena.md) · **ADR:** [`ADR-033`](../../adr/ADR-033-store-de-defasagem-motor-compartilhado-e-mesclagem-conservadora.md)

## O que entra

1. `observer_region = "sa-east-1"` passa a ser o valor usado nas invocações de `availability_probe_cli` para o probe Coinalyze/Binance desta feature (`--observer-region sa-east-1`) — `UNKNOWN_OBSERVER_REGION` deixa de ser o valor gravado a partir daqui (continua default do argumento CLI para quem não passar a flag, `infra/availability_probe_cli.py:154`, intocado).
2. `LagSummaryStore` — porta nova (`record_batch`, `read`, `read_all`) com dois adaptadores: `SqliteLagSummaryStore` (default) e `PostgresLagSummaryStore`, seleção por `INGEST_RECORD_BACKEND` (a mesma variável de `ADR-031`, não uma nova).
3. Mesclagem conservadora em `record_batch` (`ADR-033 D2`): `lag_n` soma, `total_polls` soma, `lag_p99_ms` toma o `max` entre o existente e o recebido (`None` como `-infinito`).
4. `REGIME_N_MIN = 200`, constante nomeada em `domain`, ao lado da fórmula MODELED (que só entra na fase `02`, mas a constante é lida por esta fase para decidir quando parar de rodar o probe).
5. Composição: `src.main`/CLI de composição injeta o adaptador escolhido, mesma forma de `PostgresIngestRecordStore` hoje.

## O que NÃO entra (fica para `02`)

Fórmula MODELED, `build_available_at_present_by_key`, qualquer mudança em `quarantine_terms.py`/`live_availability_write.py`.

## DoD — verificável, com comando e universo

| id | critério | comando (cala) | **morde** |
|---|---|---|---|
| `D1.1` (`CA-F1-1`) | `observer_region` gravado como valor conhecido | rodar `availability_probe_cli --observer-region sa-east-1 ...` sobre os 2 endpoints Coinalyze, ler o `stdout`/store → `observer_region == "sa-east-1"` em toda linha | rodar sem a flag ⇒ ainda grava `unknown` — reprova |
| `D1.2` (`CA-F1-2'`) | Store acumula até o limiar de regime | rodar o probe repetidamente (cron simulado ou invocações manuais em sequência) até `LagSummaryStore.read("open_interest", "sa-east-1").lag_n >= 200` **e** o mesmo para `liquidation` | uma única rodada curta (`lag_n < 200`) ⇒ não conta como "em regime", teste reprova |
| `D1.3` (`CA-F1-3`) | Lag summary sobrevive ao fim do processo | rodar probe, matar processo, reabrir store (novo processo Python), `read("open_interest", "sa-east-1")` → linha presente | sem persistência ⇒ leitura pós-restart vazia (estado de hoje) |
| `D1.4` (`CA-F1-4`) | Segunda rodada acrescenta, nunca apaga | `record_batch([row_a])`, ler `lag_n_a`; `record_batch([row_b])` mesma chave, ler `lag_n_a + lag_n_b`; nunca reseta a `lag_n_b` sozinho | sobrescrita ⇒ `lag_n` da 2ª leitura = só a 2ª amostra — reprova |
| `D1.5` (`ADR-033 F1`) | Mesclagem nunca reduz `p99` armazenado | `record_batch` com `lag_p99_ms=500`, depois `record_batch` mesma chave com `lag_p99_ms=300` → `read(...).lag_p99_ms == 500` | `p99` armazenado cai para `300` ⇒ reprova, doutrina "erro sempre pessimista" quebrada |
| `D1.6` (`ADR-033 F3`) | Uma linha por chave, não uma por amostra | após N `record_batch` da mesma chave, `read_all()` tem exatamente 1 linha para `("open_interest", "sa-east-1")` | mais de 1 linha ⇒ `RNF-1` violado |
| `D1.7` (`ADR-033 F4`) | Equivalência SQLite × Postgres | mesmo conjunto de `LagSummaryRow` gravado nos dois adaptadores → `read_all()` idêntico (mesmos valores, campo a campo) | qualquer divergência ⇒ adaptador Postgres altera o dado |
| `D1.8` | `lint-imports` limpo para o motor novo | `bash backend/scripts/lint.sh` (inclui `lint-imports`) → `rc=0`, nenhuma ocorrência de `psycopg`/`sqlite3` fora de `infra` | vazamento ⇒ reprova, mesmo portão de `ADR-031/F5` |

## Verificação

`make verify` (os seis portões) + os comandos acima, saída em `docs/context/coinalyze-fora-da-quarentena/gates/T-01-builder.md` (ou task-id equivalente do `/tech-lead`).
