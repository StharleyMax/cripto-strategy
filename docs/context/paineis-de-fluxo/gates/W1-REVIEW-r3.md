# W1 — review arquitetural r3 sobre `master...wave/paineis-f01`

Data: 2026-09-26. Alvo: `wave/paineis-f01` em `9866c0e`. O código vai até `1ebee50` (W1-FIX2); de `493cd66` a
`9866c0e` só entram laudos e duas linhas do `docs/INDEX.md`. Referência: `SPEC-009`, `ADR-044` (D1, D2, D2′, D3, D3′,
§Consequências), o julgamento `handoff/ADR044-D2P-julgamento.md`, `ADR-045`, `SPEC-008` §`D-C3.5` e as regras
bloqueantes em vigor. Revisor read-only: nenhum código foi editado (as mutações rodaram numa cópia de `frontend/`
em scratchpad) e nenhum `gate-record` foi gravado.

## 0. Veredito: **COMPLIANT** (0 BLOCKER, 3 WARNING herdados, 1 INFO herdado)

O BLOCKER-2 do r2 está **fechado, e as 3 mutações que o cobrem mordem**. O WARNING-7 do r2 está **fechado** por
emenda no documento dono. Nenhum achado novo na segunda camada. O resíduo é o mesmo do r1/r2: WARNING-4 e
WARNING-5 esperam decisão de escopo, o WARNING-6 é aviso do runner e o INFO-1 é convenção. Nenhum deles é regra
bloqueante.

## 1. Denominador

| camada | universo | comando | resultado |
|---|---|---|---|
| regras bloqueantes | **8** em vigor, **8** avaliadas | `harness rules list --severity block` | — |
| por arquivo | **69** arquivos (55 de `frontend/src` + 14 de `frontend/e2e`), de **154** no diff (o resto é `docs/`) | `harness rules --mode file --path <f> --format ndjson`, um por arquivo | **0 block**, 1 warn |
| varredura | árvore inteira | `harness rules --mode sweep --format ndjson` | rc=0, **0 block**, 77 warn (mesmo número do r1/r2) |
| suítes | `test:app` + `test:charts` | `npm --prefix frontend run -s test:app` / `test:charts` | **561/561** e **314/314** verdes (r2: 552 e 312) |
| arquitetura | D1, D2, D2′, D3′, FR-2, direção `charts`→`web`, `D-C3.5`, ADR-045 | leitura, `grep` e 5 mutações (comandos na §5) | 0 BLOCKER, 0 achado novo |

`[MEDIDO 2026-09-26]`, todos.

## 2. O que o r2 pediu, revalidado por mutação

| r2 | estado | prova |
|---|---|---|
| **BLOCKER-2** (legenda do volume fora da grade canônica, `ADR-044/D2`) | **FECHADO** | O volume ganhou `legendSlots`, montado **com** a janela nos dois call sites: `[symbol]/page.tsx:712` (`routeWindow.window`) e `panel-assembly.ts:217` (`s2Window`). A `<LegendValue seriesId="volume">` lê esse vetor (`SymbolClient.tsx:1801`). As barras continuam no vetor nativo, então `presentPoints` e `firstPresentMs` não mudam. A isenção de `view-model.ts:440-453` foi revogada no texto, para a legenda. **M1**: tirar a janela no SSR faz `volume-legend-grid-contract.test.ts` falhar em 1 teste. **M2**: tirar a janela no paginador faz `panel-assembly.test.ts` falhar em 1 teste, o comportamental *"MORDE MF-B′: on 4h the volume legend reads the served bar … never ausente"*. **M3**: apontar a legenda para `volume.slots` faz 2 testes falharem. No app real: `ausente` em 0 posições em `4h`/`15m`, e a ablação volta a dar 24 de 24 `[DOC: gates/W1-QA-r3.md §0 item 1, §3]` |
| **WARNING-7** (teto de `D-C3.5` sem emenda) | **FECHADO** | Nota de CORREÇÃO em `SPEC-008:497-512` com a regra `max(5.000, seed + 1 página)`, o 6.260, a origem (`4a17e35`), o rótulo de quem escolheu (`[INFERRED]`, escolha de agente e não do owner, como deve ser), o custo medido (n=2) e o resíduo conhecido. É o que o r2 pediu |
| WARNING-4, WARNING-5, WARNING-6, INFO-1 | **abertos** | Nada mudou no código deles. `W1-FIX2-builder.md:41` os registra como dependentes de decisão de escopo (§3) |

Mudanças do W1-FIX2 fora do BLOCKER-2, conferidas contra a arquitetura:

- **`keepFloor`** (`charts/pane-stack-layout.ts:232`, `PaneScaleRole` em `charts/`, consumido pelo binding da
  liquidação em `SymbolClient.tsx:2669`). O papel mora em `charts/`, o uso fica em `app/`, e a direção
  `charts`→`web` se mantém. O binding chega a `paneScaleMargins` sem tradução (`SymbolClient.tsx:1213`).
  **M4**: tirar `keepFloor: true` do binding faz 1 teste falhar (*"C-2: on the APPLIED margins …"*). **M5**:
  fazer o layout ignorar `keepFloor` faz 2 testes falharem.
- **`blur` encerra o gesto** (`SymbolClient.tsx:1149`, com remoção simétrica no cleanup). O listener fica no host
  único e não cria um segundo chart. D1 está intacto.
- **7 mensagens de `Error` em português, nos e2e 22/23/25, foram traduzidas.** Isso segue `CLAUDE.md` §*Mensagem de
  exceção*. No diff do FIX2 não entra nenhuma mensagem nova de `Error` em `frontend/src`.

Remedidos e conformes: **D1** (um único `createChart` em `app/`, `SymbolClient.tsx:1049`; os de `charts/` são o
harness headless, como no r2). **FR-2** não cresce: **14** em `master` e **14** em `HEAD`. **Direção**: nenhum
arquivo não-teste de `charts/` importa de `@/app`, `react` ou `next` (`grep` rc=1). **ADR-045** está fora do diff
(fase `03`). **D2′ e o julgamento `ADR044-D2P`**: o FIX2 não toca a portadora nem o falsificador partido em
três, e continua valendo o que o r2 conferiu.

## 3. Achados (nenhum reprova)

### [WARNING-4, herdado] Bandas de marca ainda em `CHART_HEIGHT_PX = 220`

`markBandGeometry*` continua sem chamador em produção (só `charts/index.ts` e `charts/mark-band-geometry.ts`). Isso
contraria `ADR-044` §D1 e §Consequências. A decisão de escopo é do orquestrador ou do owner.

### [WARNING-5, herdado] O `series[]` do registry não governa a produção

`ADR-044` §D3, `SPEC-009` §3/§5. O BLOCKER-2 foi corrigido no call site, não pela declaração no registry. Então
a causa estrutural que o r2 apontou continua: se um pane futuro não estiver declarado no registry, a (v) não o vê.

### [WARNING-6, regra do runner, herdado] `web-fullstack.hardcoded-url` — `frontend/src/app/symbol/chart-options.ts:77`

É a URL de atribuição da biblioteca. Resolve-se por allowlist (ato de política) ou como aviso conhecido.

### [INFO-1, herdado] Cabeçalhos em português em `frontend/src/charts/index.ts:203,209`

`CLAUDE.md`, tabela, linha 5. Idioma é convenção, não portão.

Uma nota que não entra no veredito: o FIX2 acrescenta `import … from "../../charts/index.ts"` em
`panel-assembly.test.ts`. A regra `core.relative-import` é bloqueante, mas o runner dá **0** nesse arquivo, e a
árvore tem **408** imports relativos em TS sem nenhum disparo. A regra, como está no runner, não alcança TS.
Declarar o contrário seria opinião, sem medição que a sustente.

## 4. Revalidação

As 5 mutações da §2 são o instrumento. Se o código de `legendSlots`, do `keepFloor` ou dos dois call sites mudar,
rode de novo M1–M5. Este laudo não é o instrumento.

## 5. Comandos (literais, no diretório da wave)

```
harness rules list --severity block                                                   # 8
git diff --name-only --diff-filter=AMR master...HEAD | wc -l                          # 154
grep -E '^(frontend/src|frontend/e2e|backend|deploy)/' <lista> | wc -l                # 69 (55 src + 14 e2e)
for f in <69>; do harness rules --mode file --path "$f" --format ndjson; done         # 0 block, 1 warn
harness rules --mode sweep --format ndjson                                            # rc=0, 0 block, 77 warn
npm --prefix frontend run -s test:app ; npm --prefix frontend run -s test:charts       # 561/561, 314/314
# mutações numa cópia de frontend/ em scratchpad (node_modules por symlink), node --conditions=react-server --test:
#   M1 page.tsx: legendSlots sem routeWindow.window        -> volume-legend-grid-contract: 1 fail
#   M2 panel-assembly.ts: legendSlots sem s2Window         -> panel-assembly.test: 1 fail (MORDE MF-B′ em 4h)
#   M3 SymbolClient: slots={volume.slots} na legenda       -> volume-legend-grid-contract: 2 fail
#   M4 SymbolClient: binding da liquidação sem keepFloor   -> liquidation-geometry: 1 fail (C-2)
#   M5 pane-stack-layout: ignora keepFloor                 -> pane-stack-layout + liquidation-geometry: 2 fail
#   linha de base dos arquivos tocados: 28/28 e 43/43 verdes
for r in master HEAD; do git show "${r}:frontend/src/app/symbol/SymbolClient.tsx" \
  | grep -cE '^const [A-Z_]*(_PX|_SCALE_MARGINS|_LOG_BASE|_HEIGHT_PX)\s*='; done       # 14, 14
grep -rn 'createChart(' frontend/src/app frontend/src/charts | grep -v '\.test\.'
grep -rlE "from ['\"](@/app|react|next)" frontend/src/charts --include='*.ts' | grep -v '\.test\.'   # rc=1
grep -rn 'markBandGeometry' frontend/src --include='*.ts*' | grep -v '\.test\.'        # só charts/
grep -rhoE 'from "\.\.?/' frontend/src --include='*.ts' --include='*.tsx' | wc -l     # 408
```
