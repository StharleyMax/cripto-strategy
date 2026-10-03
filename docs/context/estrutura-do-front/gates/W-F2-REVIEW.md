# Review da fase 02 — `estrutura-do-front` (wave `estrutura-f02`, T-02.1 · T-02.2 · T-02.3)

**Auditor:** `harness-plugin:reviewer`, 2026-10-03, sobre `19326b6e` (`git diff origin/master...HEAD`, 12 arquivos, +1109/−131).
Somente leitura: **nada gravado no ledger, nada commitado** (o `gate-record` é do orquestrador).
**Veredito: COMPLIANT** — 0 BLOCKER, 1 WARNING, 2 INFO.

## Denominador `[MEDIDO]`

- `harness rules list --severity block` → **8** regras bloqueantes; `harness rules --mode file --surface ci --path <f>` sobre os **12** arquivos de
  `git diff --diff-filter=AMR --name-only origin/master...HEAD` → **0 achados, rc=0 nos 12** (8/8 avaliadas por arquivo).
- `npx eslint -f json src/app/symbol` (em `frontend/`) → **113 arquivos, 0 mensagens, 0 erros** (inclui `local/indicator-isolation`,
  `eslint.config.mjs:365`).
- Grafo de imports: os **34** arquivos de `chart/**`, **104** imports relativos resolvidos → **nenhum** destino em `indicators/**`, `chrome/**` ou
  `SymbolClient.tsx`. Os destinos fora de `chart/` são `charts/index.ts` (barrel, `ADR-034/D8`), `features/s1-console`, `features/s3-inspector` e módulos
  da raiz de `app/symbol/` (já listados como transição em `W-F1-REVIEW` I-1). O arquivo novo `chart/host/binding-table.ts` importa só `lightweight-charts`,
  `react` (tipo), o barrel, `pane-registry.ts` e `./indicator-binding.ts`.
- Contrato (`SPEC-011 §4.2`, `ADR-050/D3`, plano `02` itens 2.1–2.4) conferido no código:
  chave `instanceKey` string (`binding-table.ts:68`; embutidos usam o `paneId`, igual ao `kind` — `pane-registry.ts:66`); chave repetida desmonta a
  anterior (`binding-table.ts:175-178`); `paneIndex` derivado no mount sobre o conjunto ativo, `0` para overlay e para o pane do núcleo
  (`binding-table.ts:112-126,158-162`); `unmount` obrigatório no tipo (`indicator-binding.ts:71`), chamado no unregister e no `detach` antes de
  `chart.remove()` (`ChartHost.tsx:324-326`); `refeed` do host, só a chave pedida, pelo `feedOutsidePage` → `feedSeries` (o único laço de `setData`,
  `T-01.10`) — a tabela não chama `setData` (`binding-table.ts:216-222`).
- `npx tsc --noEmit -p .` → rc=0, 0 linhas (o `@ts-expect-error` de `binding-table.test.ts:440` está usado ⇒ `unmount` segue obrigatório).
  `node --conditions=react-server --test src/app/symbol/chart/host/binding-table.test.ts` → **13 pass / 0 fail**.
- Idioma (tabela do `CLAUDE.md`): 2 arquivos novos (`binding-table.ts`, `binding-table.test.ts`) em inglês; nenhum segmento de diretório novo em
  `frontend/src` (diff de `awk` dos segmentos `origin/master` × `HEAD`, rc=0); identificadores, nomes de teste, docstrings e a mensagem de
  `throw new Error` (`binding-table.ts:117`) em inglês. O português nas linhas acrescentadas é só o nome da feature citado (`estrutura-do-front`).
- `docs/INDEX.md`: +3/−0 (append-only). `wc -l SymbolClient.tsx` = **3.443**. README `§app/symbol` atualizado com `binding-table.ts`.

## Achados

**[WARNING] W-1 — a fase passa da fronteira que o próprio plano declara.** `02_registrar_por_chave.md:6` diz *"Fronteira: só `chart/host/`"*, e o
diff toca `frontend/src/app/symbol/SymbolClient.tsx` (+36/−3: `unmount` nos 5 bindings, `:1094`, `:1686`, `:1913`, `:2472`, `:3094`, e
`OiPaneHandles` ganha `primitive`/`paneIndex`, `:1345-1347`) e `frontend/src/app/symbol/pane-scale-isolation.test.ts` (+4/−2, âncora
`binding.mount(` → `table.attach({`). É consequência obrigatória do item 2.3 (`unmount` obrigatório no tipo ⇒ os 5 bindings, que vivem em
`SymbolClient.tsx` até F3–F8, têm de implementá-lo) e está **declarada** em `gates/T-02.1-build.md` §1.5 e §2. Não é movimento oculto: `SPEC-011
§7.2` manda F2 *declarar* o diff, e declarou. Correção: registrar a exceção na PR da wave, ou emendar a linha de fronteira do plano 02 para
"`chart/host/` + o `unmount` de cada binding onde ele mora".

**[INFO] I-1 — o índice de um mount tardio não reordena os panes já montados.** `binding-table.ts:181-184` deriva o índice de quem chega depois do
`attach` sobre o conjunto ativo, mas os já montados mantêm o seu; um pane tardio no meio da ordem colidiria com um índice existente. Hoje não
ocorre (os 5 panes registram no primeiro commit, `ChartHost.tsx` docstring do `registrar`), e o contrato já resolve na F9: mudança de conjunto de
panes **remonta o host** por `key={paneSetSignature(active)}` (`ADR-050/D4`, `SPEC-011 §6.3`). Sugestão: a F9 manter um teste que prove que um pane
tardio nunca chega sem remonte.

**[INFO] I-2 — o núcleo segue lendo a ordem de `pane-registry.ts` na raiz** (`binding-table.ts:5`, `registrar.ts:2`, via `F1_HOST_PANE_ORDER`).
É o que o item 2.2 pede (*"na ordem de `F1_PANE_ORDER` — o catálogo só chega na F9"*) e continua o I-1 de `W-F1-REVIEW`; o `PaneOrder` recebido por
parâmetro (`derivePaneIndex(…, order)`) já é a forma de `SPEC-011 §3` (`G-R`, tabela por parâmetro) para a F9 trocar sem tocar a tabela.
