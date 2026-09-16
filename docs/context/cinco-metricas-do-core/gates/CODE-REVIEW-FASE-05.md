# Code-review — fase `05` (liquidações) · **COMPLIANT**

**Data:** 2026-09-16 · **Auditor:** `harness-plugin:reviewer` (read-only) · **Persistido pelo:** loop principal

⚠️ **Por que este arquivo foi escrito pelo orquestrador e não pelo auditor:** o `reviewer` é read-only
**por desenho** — não tem ferramenta de escrita e não grava `gate-record`. Ele devolveu o laudo em
texto e pediu a persistência. O conteúdo abaixo é dele; a transcrição é minha.

⚠️ **Por que este review existe:** em `2026-09-15` deixei código de produção entrar na `master` ao
"fechar fase", **sem PR e sem code-review**, e só apareceu porque o owner perguntou se estava tudo
mergeado. Sem PR não há momento óbvio em que o gate é cobrado. Este rodou **antes** do push.

## Veredito

**`COMPLIANT`** — **0** regras bloqueantes violadas.

**Denominador:** 8 regras bloqueantes em vigor (`harness rules list --severity block`);
`harness rules --mode file` rodado nos **10 de 10** arquivos do universo que caem em `[code_paths]`
→ todos `rc=0` vazio. `make verify` → 8 portões verdes (`0 bloqueio`, 73 avisos, **nenhum** nestes 11
arquivos), `e2e 36 passed`.

⛔ **`frontend/e2e/13-*.spec.ts` (766 linhas) está FORA de `code_paths` e foi lido À MÃO** — o `rc=0`
que a varredura devolve para ele **não foi contado como aprovação**.

Universo: `git diff 4e98d89..60178e7 -- frontend/src backend/src frontend/e2e`, commits de código
`2239ec4` (painel), `affc254` (`M-1` + `S-3`/`m-5`), `60178e7` (e2e).

## Os 4 pontos auditados com rigor

1. **A garantia do `M-1` é ESTRUTURAL, confirmado.** `1 − 0,15 < 0,88` é asserido sobre as constantes
   **lidas da fonte** (`liquidation-geometry.test.ts:74-92,497-509`), mais `productionBarScaleIsAutoscaled`
   (`:117-124`) e 4 MORDEs. O auditor mediu **o regime que o teste não cobre** — toda barra *acima* da
   base, que é o dado real: baseline `y=162,20` contra piso da faixa `162,35`, dentro da faixa.
   **Não é premissa sobre dado disfarçada.**
2. **Fronteira `charts`↔`web` íntegra:** `npx tsx --test src/charts/eslint-boundary.test.ts` → **5/5
   pass**, incluindo `ADR-034/D8`; imports novos passam só pelo barril. ⚠️ Registrado de novo que
   **`make boundaries` não mede isto** (import-linter/Python, `ADR-003:75`).
3. **A dívida de idioma de ontem NÃO se repetiu nos testes:** as 3 suítes novas em `frontend/src` são
   inglês (`0–4` linhas PT, todas **citação literal** de `SPEC-007`).
4. **Nenhuma semeadura no Postgres:** zero `INSERT`/`psql`/`docker` fora de cabeçalho — o `SELECT`
   citado é evidência. Nenhuma chave em lugar nenhum.

## Os 2 `[WARNING]` — nenhum bloqueia

| # | achado | endereço | destino |
|---|---|---|---|
| `W-1` | **87 de 204** linhas de comentário acrescentadas em produção estão em **pt-BR** (`CLAUDE.md` tabela, **linha 5**: comentário → inglês). Microcopy de UI segue pt-BR e está **correta** (linha 8) | `frontend/src/app/symbol/SymbolClient.tsx:458-1380` | **pago no mesmo ciclo** — ver o commit de tradução |
| `W-2` | `page.tsx:305` passou de **4 para 6** leituras concorrentes, e o próprio spec mede **2 de 6** renders degradando (`connection_refused`, varredura serializada de `81,1 s`) | `frontend/src/app/symbol/page.tsx:296-311` | **task própria**, antes de virar erro de tela — mesma classe do `M-2` |

⛔ `W-2` **não é defeito desta fase e não foi causado por ela** — é a rota crescendo contra uma API que
serializa (`ACHADO-API-VAZA-IDLE-IN-TRANSACTION`). Mas cada painel novo piora, e o número já é
observável em teste: está declarado aqui para não ser redescoberto como surpresa.
