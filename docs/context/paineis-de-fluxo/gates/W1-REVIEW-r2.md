# W1 — review arquitetural r2 sobre `master...wave/paineis-f01`

Data: 2026-09-26. Alvo: `wave/paineis-f01` em `a4663b2` (código até `4a17e35`, o W1-FIX; `a4663b2` só acrescenta o
laudo `W1-QA-r2.md`). Referência: `SPEC-009`, `ADR-044` (D1, D2, D2′, D3, D3′, §Consequências), o julgamento
`handoff/ADR044-D2P-julgamento.md`, `ADR-045`, `SPEC-008` §`D-C3.5` e as regras bloqueantes em vigor. Revisor
read-only: nenhum código foi editado (as mutações rodaram numa cópia em scratchpad), nenhum `gate-record` foi gravado.

## 0. Veredito: **NON_COMPLIANT** (1 BLOCKER, 4 WARNING, 1 INFO)

O BLOCKER-1 do r1 está **fechado, com mutação que morde**. A reprovação agora vem de um achado novo da segunda
camada: a legenda do volume lê `param.logical` contra um vetor que **não** é a grade canônica, contra a `ADR-044/D2`.
É a causa do BLOCKER-1 do `W1-QA-r2.md`, e o r1 deixou passar.

## 1. Denominador

| camada | universo | comando | resultado |
|---|---|---|---|
| regras bloqueantes | **8** em vigor, **8** avaliadas | `harness rules list --severity block` | — |
| por arquivo | **64** arquivos (50 de `frontend/src` + 14 de `frontend/e2e`), de **143** no diff (o resto é `docs/`) | `harness rules --mode file --path <f> --format ndjson`, um por arquivo | **0 block**, 1 warn |
| varredura | árvore inteira | `harness rules --mode sweep --format ndjson` | rc=0, **0 block**, 77 warn (as mesmas do r1) |
| suítes | `test:app` + `test:charts` | `npm run -s test:app` / `test:charts` | **552/552** e **312/312** verdes |
| arquitetura | D1, D2, D2′, D3′ (itens 1–4), FR-2, direção `charts`→`web`, `D-C3.5`, ADR-045 | leitura + `grep` + 3 mutações, comandos na §5 | 1 BLOCKER, 2 WARNING (+2 herdados) |

`[MEDIDO 2026-09-26]`, todos.

## 2. O que o r1 pediu, revalidado por mutação

| r1 | estado | prova |
|---|---|---|
| **BLOCKER-1** (a (iii) antiga no registry) | **FECHADO** | cópia de `frontend/` em scratchpad, `node --test pane-registry.test.ts` (29 testes). **M1** tirar a guarda `kind === "line"` (volta a (iii) antiga): **14 falham**, entre eles *"(iii) PASSES: today's CVD pane"*. **M2** pular todo `kind` (desliga a (iii)): **5 falham**, entre eles *"(iii-a) FAILS … 4 violações"* e os de volume/marca de outra série (D3′ item 4). **M3** tirar o ramo `candlestick`: **1 falha** (*"FLOW candlestick is refused"*, a *falha alta* da D3′). Sem mutação: 29/29 |
| WARNING-1 (premissa da D3′ refutada) | fechado | nota de CORREÇÃO em `ADR-044:161-174`, com fonte, o que cai e os donos. O falsificador da D3′ segue declarado `[NÃO MEDIDO]` |
| WARNING-2 (falsificador da D2′) | fechado | §4.1 aplicada em `ADR-044:94-117` com nota de CORREÇÃO; `T-01.10-desenho.md:98` com a §4.2 (a frase antiga dá 0 ocorrências) |
| WARNING-3 (`SPEC-009` §3) | fechado | §3 emendada para D2′, com a nota de origem |
| WARNING-4, WARNING-5, WARNING-6, INFO-1 | **abertos** | ver §3.3–§3.5. Nada mudou no código deles |

Conformes, remedidos: **D1** (um único `createChart` em produção, `SymbolClient.tsx:1040`). **FR-2** não cresce
(**14** em `master`, **14** em `HEAD`). **Direção**: `charts/legend-reading.ts` só importa de `charts/`, e nenhum
arquivo de `charts/` importa de `app/`, `react` ou `next`. **ADR-045**: fora do diff (fase `03`).

## 3. Achados

### [BLOCKER-2] A legenda do volume lê `param.logical` contra slots que não são a grade canônica

- **Onde:** `frontend/src/app/symbol/[symbol]/page.tsx:706`: `nonNegativeFlowSlotsFromHistoryRows(volumeResult.rows)`,
  **sem** a janela, ou seja, um slot por linha nativa. Os vizinhos passam a janela e saem na grade: liquidação
  (`:814`) e long/short (`:880`), com `routeWindow.window`. Esse vetor vai para
  `<LegendValue seriesId="volume" … slots={volume.slots} />` (`SymbolClient.tsx:1781`, entrou nesta wave em `1dbb50e`,
  T-01.7), cujo contrato é *"The slots on the canonical grid — slot `i` IS logical index `i`"* (`SymbolClient.tsx:888`;
  e `charts/legend-reading.ts:98`).
- **Contra:** `ADR-044` §D2: *"O valor da legenda de cada pane … é resolvido a partir de `param.logical` sobre os slots
  da grade canônica"*. O próprio `view-model.ts:440-446` nomeia o risco (*"index `i` means a different instant in
  different panels"*) e isenta o volume porque ele *"is not one of the six panes"* da invariante de grade única. A
  T-01.7 desta wave fez do volume um consumidor da legenda, e a isenção deixou de valer. Ninguém a revogou.
- **Medida:** em `1m` as linhas coincidem com a grade e a leitura sai certa por acaso. Em `4h` o volume lê o
  **slot 23** (de 24 barras nativas) e em `15m` o **slot 383** (de 384), enquanto o preço lê `5520`/`5745` na
  grade de 5.760. Resultado: `ausente` em **24 de 24** posições de crosshair, com a barra desenhada e servida pela
  API `[DOC: gates/W1-QA-r2.md §3, MEDIDO no app real]`. A causa por índice é minha, pela leitura de
  `page.tsx:706` contra `:814`/`:880` e do contrato citado acima. O `bucketMs` do W1-FIX não conserta isso porque
  ele encaixa um índice que já está no espaço errado. ⚠️ Se a API omitir linhas em `1m` (minuto sem linha), o índice
  também desliza e a legenda mostra **valor de outro minuto** em vez de `ausente` `[NÃO MEDIDO]`.
- **Correção:** a legenda do volume tem de ler slots da grade. Dois caminhos: passar `routeWindow.window` em
  `page.tsx:706` (e na página, em `panel-assembly.ts:204`), como liquidação e long/short fazem; ou dar ao
  `LegendValue` uma cópia gradeada e manter o vetor nativo só para o `setData`. Nos dois casos a isenção de
  `view-model.ts:440-446` precisa ser revogada no texto. Quem escolher o primeiro caminho tem de provar que o pixel
  das barras, `presentPoints` e `firstPresentMs` não mudam (braço de identidade de pixel, como o `e2e/25`).
  **Teste que falta:** legenda do volume em `4h` lendo a barra no slot de abertura. **Mutação a pedir:** tirar a
  janela na chamada tem de reprovar esse teste.

### [WARNING-7] O teto de `D-C3.5` mudou de número sem emenda no documento dono

- **Onde:** `frontend/src/app/symbol/history-page-window.ts` (`effectiveMaxAccumulatedSlots`), ligado em
  `use-history-pager.ts:205-211`. O teto efetivo virou `max(5.000, seed + 1 página)`, que dá **6.260** em todo TF
  `[DOC: gates/W1-QA-r2.md §4]`.
- **Contra:** `docs/specs/SPEC-008-candle-real-e-eixo-unico.md:494`: *"`D-C3.5` `web` pagina serial, teto ~**5.000
  slots** … o custo é quadrático"*. `grep -rn 'effectiveMaxAccumulatedSlots\|6.260\|6260' docs/specs docs/adr` dá 0
  linhas. A docstring do código cita o `D-C3.5` e justifica o desvio (o seed de 5.760 já passava do teto antes da
  wave `[INFERRED: docstring de history-page-window.ts]`), mas o número não chegou ao documento.
- **Por que não é BLOCKER:** o `D-C3.5` diz *"~"*, e os tetos exigíveis são os de latência
  (`[DECISÃO-OWNER: 2026-09-22]` 160 ms e `[DECISÃO-OWNER: 2026-09-19]` 400 ms, `SPEC-009` A-3), que continuam
  dentro. Mesmo assim, o p95 da página do `e2e/20` subiu de ~72 para 89,7/114,3 ms `[DOC: W1-QA-r2 §4, n=2]`.
- **Correção:** o dono de `D-C3.5` registra uma nota de CORREÇÃO em `SPEC-008:494` (ou uma emenda na `SPEC-009` que
  a cite), com a regra `max(teto, seed + 1 página)`, o 6.260 e a tendência de latência.

### [WARNING-4, herdado] Bandas de marca ainda em `CHART_HEIGHT_PX = 220`

`markBandGeometry*` segue sem chamador em produção (`grep` só acha `charts/`). A T-01.3 (`tasks.toml:103`) tem o
título, mas ninguém ligou o helper no host. `ADR-044` §D1 e §Consequências. Precisa de decisão de escopo
(orquestrador ou owner), como no r1.

### [WARNING-5, herdado] O `series[]` do registry não governa a produção

`SymbolClient.tsx:128` importa do registry só ordem, stretch e tipos. O BLOCKER-2 é um segundo sintoma disso: se as
panes fossem declaradas no registry de produção, a (v) (*"todo `time` … pertence à grade"*) teria pedido o vetor do
volume. `ADR-044` §D3, `SPEC-009` §3/§5.

### [WARNING-6, regra do runner, herdado] `web-fullstack.hardcoded-url`, `frontend/src/app/symbol/chart-options.ts:77`

É a URL de atribuição da biblioteca. Allowlist (ato de política) ou aviso conhecido. Não reprova.

### [INFO-1, herdado] Cabeçalhos em português em `frontend/src/charts/index.ts:203,209`

`CLAUDE.md` tabela, linha 5. Idioma é convenção, não portão.

## 4. Revalidação

Peça a **mutação**, não este laudo: para o BLOCKER-2, tirar a janela da chamada do volume tem de reprovar um teste de
legenda do volume em `TF ≠ 1m`. O WARNING-7 é emenda de documento com dono. O 4 e o 5 esperam decisão de escopo.

## 5. Comandos (literais, no diretório da wave)

```
harness rules list --severity block                                                   # 8
git diff --name-only --diff-filter=AMR master...HEAD | wc -l                          # 143
grep -E '^(frontend/src|frontend/e2e|backend|deploy)/' <lista> | wc -l                # 64 (50 src + 14 e2e)
for f in <64>; do harness rules --mode file --path "$f" --format ndjson; done         # 0 block, 1 warn
harness rules --mode sweep --format ndjson                                            # rc=0, 0 block, 77 warn
npm --prefix frontend run -s test:app ; npm --prefix frontend run -s test:charts       # 552/552, 312/312
# mutações, numa cópia de frontend/ em scratchpad (node_modules por symlink), sobre pane-registry.ts:
#   M1 remove `if (series.kind === "line") { return; }`        -> 14 fail (inclui o PASSES do CVD)
#   M2 `if (series.kind === "line")` -> `if (true)`            -> 5 fail (inclui o (iii-a))
#   M3 `if (series.kind === "candlestick")` -> `if (false)`    -> 1 fail
grep -n 'nonNegativeFlowSlotsFromHistoryRows' 'frontend/src/app/symbol/[symbol]/page.tsx'   # :706 sem janela; :814, :880 com
grep -n 'The slots on the canonical grid' frontend/src/app/symbol/SymbolClient.tsx            # :888
grep -nE '^const [A-Z_]*(_PX|_SCALE_MARGINS|_LOG_BASE|_HEIGHT_PX)\s*=' frontend/src/app/symbol/SymbolClient.tsx | wc -l   # 14 (master 14)
grep -rn 'createChart(' frontend/src/app frontend/src/charts | grep -v '\.test\.'
grep -rn 'markBandGeometry' frontend/src --include='*.ts*' | grep -v '\.test\.'        # só charts/
```
