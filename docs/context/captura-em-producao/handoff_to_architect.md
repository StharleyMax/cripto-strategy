# Handoff PM → Architect — `captura-em-producao`

**PRD:** [`docs/specs/PRD-004-captura-em-producao.md`](../../specs/PRD-004-captura-em-producao.md) (383 linhas) · **Ledger:** `PRD_DRAFT` (advance em 2026-09-07; `harness pipeline show captura-em-producao`) · **Feature filha de `plataforma-dados`** (`relate` no ledger) · **Rev de medição:** `master@0acf947` · **Owner indisponível nesta sessão** — nada foi perguntado a ele; o que precisa dele está em §14 (menu) e §15 (perguntas).

## O que este PRD pede ao `/architect` — em ordem

1. **Gap Analysis do PRD** (peer review). `[NÃO SEI]` aparece 7 vezes; `[Q1]`–`[Q10]` em §15; os 5 `[INFERRED]` estão em §12 com custo de reversão. Nenhum unknown virou `[INFERRED]` silencioso.
2. **Decidir `RN-3` — motor do registro `md.ingest_run` em produção** (`M2`). Os gatilhos `G-A` (`psycopg` em `backend/pyproject.toml:64`) e `G-B` (segundo processo lendo o registro — o escritor e a API em dois containers) de `ADR-014/D1e` disparam; `ADR-014/D1f` já chamava isso de dívida órfã sem foro. Emenda de `ADR-014` ou ADR nova; a proposta `M2(a)` (adaptador Postgres de `IngestRecordSource`) é `[INFERRED]`, não decisão.
3. **Resolver `[Q5]`**: `postgres:16-alpine` (compose) × `postgres:15` (`ADR-002`, 5×) × *"TimescaleDB/postgres:15"* (`T-07.16`) — nenhuma imagem TimescaleDB declarada; o sink de F2 precisa saber onde a extensão existe.
4. **Fixar dono e data de `[Q3]`** (o que é "um run" para stream contínuo e para ciclo) — sem isso `RF-4` não fecha e `CA-E2E-1` é inalcançável.
5. **Decidir a forma dos dois alvos de compose** (`[Q7]`: override / profiles / arquivo local) — o PRD exige só o efeito (`CA-F3-3`: local sem `caddy`, deploy com).
6. **SPEC + plano em 3 fases** na ordem obrigatória `F1` (produtor + run) → `F2` (escritor + registro) → `F3` (compose em dois alvos), com `CA-E2E-1..3` fechando F3.

## O que NÃO reabrir (§3 do PRD, com rótulo)

`ADR-027/D1` 3 processos de vida longa e `D2` Redis dedicado `[DECISÃO-OWNER 2026-09-04]` · `ADR-009/D2` Streams · `ADR-002` motor (série em candidato 4; registro em Postgres como destino) · `ADR-029/D1` Caddy estruturado, não implantado (salvo `M3`) · `ADR-030/D5` envelope de `/collector-status` intocado · premissas de recurso · fila da API de leitura e canal de alarme ficam fora (`ADR-027` §NÃO decide).

## Onde o PRD diverge dos insumos — para você conferir, não aceitar

- **`[GAP G1]`:** `deploy/compose.yml` declara `build:` para `api`/`web` e **não existe nenhum Dockerfile** (`ls backend/Dockerfile frontend/Dockerfile` → ambos ausentes). O compose de `ADR-029` valida por `config -q` mas nunca construiu — e "build em deploy e local" é o requisito literal do owner.
- **`[GAP G2]`:** os dois coletores 24/7 **não gravam `IngestRun`** (`grep -nE 'IngestRun|ingest_run'` nos 3 módulos → 0). A linha única de `/collector-status` vem do probe NTP. `T-07.15/16/17` ligam coletor→fila→Postgres e **deixam o painel igual**; `RF-4`/`US-3` é acréscimo deste PRD.
- **§4.2:** DoD 2 de `T-07.17` (*"`find deploy -type f | wc -l` > 1"*) **já está satisfeito** (hoje 2); "NÃO decide TLS" foi superado por `ADR-029`.
- **`[GAP G5]`:** PR #159 cita `CST-112` (Epic da irmã, confirmado por `jira_get_issue`) para `T-07.17`; o correto é `CST-109` (`tasks.toml:1252`).
- **`RNF-1`** usa 88 MB como teto de referência somando `ADR-027:59-65` — projeção, não medição; `CA-F3-8` mede.

## Menu do owner (§14) — não decidir por ele

`M1` destino de `T-07.15/16/17` na mãe (superseded × mover × referenciar) · `M2` motor do registro (Postgres adaptador × SQLite em volume) — **bloqueia a SPEC de F2** · `M3` implantar na VPS ao fim de F3 (não × sim) · `M4` teto da fila Redis · `M5` gravação local crua após o Stream. Se o owner não responder, a SPEC pode nascer com as propostas `[INFERRED]` declaradas como provisórias, com o custo de reversão de §12/§14.

## Regras bloqueantes endereçadas

`harness rules list --severity block` → 8; mapeamento em §17. As que mordem aqui: `own.compose-hardcoded-secret` + `core.hardcoded-secret` (`CA-F3-6`, todo `compose*.yml`/Dockerfile por `${VAR}`), `core.print-statement`/`silent-except`/`relative-import` no Python novo. As duas `web-fullstack.*` de browser caem por vacuidade — declarado.

## Tracker

MCP `atlassian` local **autenticado** — usado só para leitura (`CST-109`, `CST-112`). Nada criado. Unidades de valor candidatas em §6; criação após o seu `approve prd`; tasks são do `/tech-lead`.

## Critério de aceite do seu retorno

Veredito `APPROVED`/`NEEDS_FIX` em ≤ 15 linhas, relatório completo em `docs/context/captura-em-producao/gates/PRD-004-architect.md`. Máximo 3 ciclos antes de escalar ao owner.
