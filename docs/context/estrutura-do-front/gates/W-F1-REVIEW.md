# Review da fase 01 — `estrutura-do-front` (wave `estrutura-f01`)

**Auditor:** `harness-plugin:reviewer`, 2026-10-03, sobre `cc812713`. Corpo gravado pelo orquestrador; o gate foi gravado pelo próprio
reviewer (`gates.jsonl`, `2026-10-03T15:17:38Z`, fase 01, REVIEW COMPLIANT).
**Veredito: COMPLIANT** — 0 BLOCKER, 1 WARNING, 3 INFO.

## Denominador `[MEDIDO]`

- `harness rules list --severity block` → 8; `harness rules --mode file --surface ci` sobre os 63 arquivos de
  `git diff --diff-filter=AMR origin/master..HEAD -- frontend` → 0 achados, rc=0.
- `npx eslint -f json src/app/symbol` → 111 arquivos, 0 mensagens (inclui `local/indicator-isolation`).
- Grafo de imports relativos de `frontend/src`: nenhum `chart/**`/`chrome/**` importa `indicators/**` nem `SymbolClient.tsx`; nenhum ciclo de
  produção passa por `chart/` ou `chrome/`; só `SymbolClient.tsx:122-126` importa `chrome/**`; fora de `app/symbol/` ninguém importa `chart/`
  ou `chrome/`.
- Desvios aceitos: `CrosshairSlotContext` em `chart/host/registrar.ts:105` (núcleo, ADR-050/D1, evita ciclo); `VolumeSlot` em
  `chart/legend/LegendValue.tsx:20` (destino permitido pela T-04.1, só antecipado).
- Idioma: 7 diretórios e todos os arquivos novos em inglês; português nas linhas acrescentadas = string de UI (tabela linha 8) ou citação
  de documento movida.
- README §26 confere (4 diretórios de topo; `features` = panel, s1-console, s3-inspector; 5 `test(` no teste da regra).

## Achados

**[WARNING] W-1 — o critério de movimento da F1 não fica vazio.** 5 linhas não-lógicas (`function AttributionFooter() {` · `return (` ·
`);` · `}` · `<AttributionFooter />`) em `frontend/src/app/symbol/chrome/AttributionFooter.tsx:4-13` e no ponto de montagem em
`SymbolClient.tsx`. Regra: `SPEC-011 §7.2` ("o diff fica vazio em F1") e DoD-2 de `01_nucleo_para_fora.md`. Declarado em
`gates/T-01.4-build.md` §2. Conflito entre o item 1.2 do plano e a DoD-2: JSX solto não muda de pasta sem componente. Correção: registrar a
exceção na PR, ou emendar §7.2 para F1 declarar resíduo como F2/F3/F8/F9 já fazem.

**[INFO] I-1 — o núcleo ainda conhece módulos de indicador na raiz:** `chart/history/use-history-pager.ts:87` (`panel-assembly.ts`), `:94`
(`oi-candle-pane.ts`); `chart/host/registrar.ts:5`, `pane-stack.ts:2`, `pane-layer.tsx:3`, `chart/legend/legend-frame.ts:4`
(`pane-registry.ts`). Estado de transição; a P2 força o conserto quando esses arquivos entrarem em `indicators/` (F3–F7).

**[INFO] I-2 — docstrings desatualizadas** (declarado em T-01.4 §1): `useLiveReadout` em `chrome/LiveRow.tsx` cita `../live-transport.ts`;
`chrome/TimeframeBar.tsx` diz "wired by SymbolClient below". Corrigir na próxima fatia que tocar esses arquivos.

**[INFO] I-3 —** `frontend/README.md:1927` lista `axis-sync*.ts`, mas há `axis-sync-provider.tsx` → `axis-sync*.ts(x)`.
