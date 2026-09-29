# WI — leitura pós-deploy (2026-09-28)

**O que subiu:** `master` @ `2fdabe8`, o merge da PR #238 (`83e7a78` + laudos). **Comando:** `make compose-local
ARGS="up -d --build --no-deps api"`, a condição 1 de `WI-INFRA` §4: a API primeiro e sozinha. Writer e coletor
não foram recriados. `deploy-api-1` `StartedAt = 2026-09-28T14:34:17Z`.

**Antes do deploy, às 13:52Z:** 3ª trava. O coletor estava parado desde 2026-09-27T23:07:39Z (`RestartCount=2`), e
o `ALTER TABLE md.ingest_run` estava na fila atrás de 2 sessões `idle in transaction` da API velha. Destravei com
`make compose-local ARGS="restart api"` (código velho), e isso deixou `0|0` (idle in tx | bloqueados).

**Por que o coletor reinicia:** o WS de `forceOrder` cai com `OSError: [Errno 9] Bad file descriptor`, e o
`collector_session_closed … verdict=REJECTED` vem em seguida (`docker logs deploy-collector-1`, 2026-09-27T23:05–23:08Z).
O processo sai com `exit=0` e `oom=false`. `[NÃO SEI]` se esse reinício é o desenho pretendido para queda de WS.
Seja qual for a resposta, é ele que dispara o ALTER de boot.

## Portão §5.3 do desenho — verde `[MEDIDO 2026-09-28T14:3xZ]`

| verificação | resultado |
|---|---|
| `/proc/1/environ` da API | `PGOPTIONS=-c idle_in_transaction_session_timeout=30s`, `PGAPPNAME=cripto-api` |
| `PGOPTIONS` em writer / collector | `0` / `0` linhas (`grep -c`) |
| `pg_settings.idle_in_transaction_session_timeout` (padrão do servidor, que writer e coletor herdam) | `0` |
| `show …` numa sessão aberta com o mesmo `PGOPTIONS` | `30s` |
| `application_name='cripto-api'`: sessões / idle in tx | **`2|0`**, as 2 com `backend_start` < 10 min (API nova), `state=idle` |
| sessões bloqueadas | `0` |
| `/api/v1/ready`, `/api/v1/ingest-health` | `200`, `200` |
| 6 fontes de `md.series` às 14:35Z | todas com último bucket entre 14:30Z e 14:35Z |

**Falsificador §5.4:** ≥ 2 dias de `cripto-api|2|0`, e o próximo reinício do coletor passar sem fila no ALTER. A
janela t3 da T-03.7, `[2026-09-28T14:35Z, 2026-09-29T14:35Z)`, é a primeira medição que o exercita.

**Disco do host:** `df -h /` → **100%, 2,2 GB livres** (233 G / 219 G usados). `docker image prune -f` (61
imagens sem tag, nenhuma usada por container) recuperou só **91,21 MB**. O Docker ocupa ~12 GB (`docker system
df`), e o resto do disco não é da stack. Isto fica **sem dono** e volta ao owner.
