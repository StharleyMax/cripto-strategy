# W1 — review arquitetural sobre `master...wave/paineis-f01`

Data: 2026-09-25. Alvo: `wave/paineis-f01` em `c3e2c66` (código até `c06d420`; `c3e2c66` só acrescenta o laudo
`W1-CODE-REVIEW.md`). Referência: `SPEC-009`, `ADR-044` (D1, D2, D2′, D3, D3′, §Consequências), o julgamento
`handoff/ADR044-D2P-julgamento.md`, `ADR-045` e as regras bloqueantes em vigor. Revisor read-only: nenhum código
foi editado, nenhum `gate-record` foi gravado.

## 0. Veredito: **NON_COMPLIANT** (1 BLOCKER, 5 WARNING, 1 INFO)

A regra mecânica está limpa. A reprovação vem da segunda camada: o registry contradiz a invariante (iii′) que
esta mesma wave escreveu na `SPEC-009` §5.

## 1. Denominador

| camada | universo | comando | resultado |
|---|---|---|---|
| regras bloqueantes | **8** em vigor, **8** avaliadas | `harness rules list --severity block` | — |
| por arquivo | **58** arquivos (46 de código em `code_paths` + 12 de `frontend/e2e/`), de 132 no diff (o resto é `docs/`) | `harness rules --mode file --path <f> --format ndjson`, um por arquivo | **0 block**, 1 warn |
| varredura | árvore inteira | `harness rules --mode sweep --format ndjson` | rc=0, **0 block**, 77 warn (pré-existentes) |
| arquitetura | ADR-044 D1, D2, D2′(a)(b), D3/D3′, §Consequências (FR-2), SPEC-009 §3/§5, direção `charts`→`web`, ADR-045, idioma | leitura + `grep`, comandos na §4 | 1 BLOCKER, 4 WARNING, 1 INFO |

`[MEDIDO 2026-09-25]`, todos.

## 2. Conformes (o que foi medido e passa)

- **D1**: um único `createChart` em produção (`SymbolClient.tsx:1035`; os outros dois estão no harness headless
  de `charts`). `PANEL_COUNT = 6` saiu. `SINGLE_CHART_PANEL_COUNT = 1` (`axis-sync.ts:49`) chega ao provider
  (`axis-sync-provider.tsx:63`). A store ficou.
- **D2**: nenhuma leitura de `seriesData` em produção. A legenda lê `param.logical` e não filtra por `paneIndex`
  (`pane-legend.ts:16,163`). A leitura por `nature` fica em `charts/legend-reading.ts`.
- **D2′(a)(b)**, conforme o julgamento: a portadora fica no pane 0 (`SymbolClient.tsx:655,1041`) e é alimentada
  **primeiro** com `gridCarrierItems(axis)`, sem filtro (`host-series-feed.ts:84`). Os panes passam por
  `plotItemsOnly` de `charts` (`:73`), no mount e na página (`SymbolClient.tsx:1076,1258`). A estrutura tem os
  2 mutantes (`host-series-feed.test.ts:87,93`), e a eficácia sem marcas tem o braço `carrier_filtered_no_marks`
  (`e2e/25:97,174`), como pede a D-2 do julgamento.
- **FR-2 não cresce**: `grep -nE '^const [A-Z_]*(_PX|_SCALE_MARGINS|_LOG_BASE|_HEIGHT_PX)\s*=' SymbolClient.tsx | wc -l`
  dá 14 em `master` e 14 em `HEAD`. Nenhuma constante nova com esse padrão em outro arquivo de `app/symbol/`.
- **Direção de dependência**: `charts/` não importa de `app/` (a única ocorrência é uma string de teste em
  `eslint-boundary.test.ts:239`) nem de `react`/`next`. `app/symbol` não importa de `backend`/`sentimento`.
- **ADR-045**: não se aplica. O diff não toca `backend/`, `OiCandle` nem nenhuma rota. É a fase `03`.
- **Idioma**: os 21 arquivos novos de `frontend/src` têm nome em inglês. Os `pane_id` são ASCII em inglês
  (`pane-registry.ts:55`).

## 3. Achados

### [BLOCKER-1] O registry implementa a (iii) antiga e o teste declara como recusado o CVD que a D3′ aceita

- **Onde:** `frontend/src/app/symbol/pane-registry.ts:282-305` (a (iii) dispara para toda série `FLOW`, sem olhar
  `kind`). `pane-registry.test.ts:267-276`: *"(iii) FAILS: today's CVD pane — two FLOW lines, no marks — is
  refused"*, que ainda afirma **4 violações**. `pane-registry.test.ts:146`: o fixture `validRegistry()` dá
  **marcas** ao CVD (`...marks("cvd", "cvd_marks")`).
- **Contra:** `ADR-044` §D3′, *"A (iii′), normativa"*, e *"O ajuste que a `T-01.5` precisa fazer"*, itens 1–3:
  a (iii) só dispara quando `kind === "histogram"`, o teste `:240` vira **PASSES**, e entra um teste (iii-a) FAILS
  com 4 violações. Contra também a `SPEC-009` §5 (iii), **emendada nesta wave** para *"toda série `FLOW` com
  `kind = histogram` …"*, e a D3′ *"o CVD não ganha marca"* (`NG-5`).
- **Medida:** `git log master..HEAD -- frontend/src/app/symbol/pane-registry.ts` mostra só `88d48a1` (T-01.2) e
  `e2596fb` (T-01.6), e nenhum dos dois toca a (iii). O CVD de produção são 2 `LineSeries` lossless, sem marca
  (`SymbolClient.tsx:2270-2296`). Por isso a suíte chama de *válido* um CVD que a ADR proíbe, e de *inválido* o que
  está no ar.
- **Correção:** aplicar os 3 itens da D3′ em `pane-registry.ts`/`.test.ts`, e tirar `marks("cvd", …)` de
  `validRegistry()`. Mutação que o orquestrador deve pedir: tirar a guarda `kind === "histogram"` tem de reprovar
  o novo teste (iii-a) **e** o *PASSES* do CVD.

### [WARNING-1] A premissa da D3′ foi medida falsa e a ADR não registra isso

- **Onde:** `ADR-044` §D3′ (*"o bucket ausente é whitespace e **interrompe a linha**"*).
  `handoff/T-01.10-desenho.md` §7 mediu que, na 5.2.1, o `walkLine` liga itens consecutivos: **169 px** pintados
  dentro da lacuna `[DOC: T-01.10-desenho.md §7, n=1 render]`. O `T-01.11-design-review-r2.md` §5 E-1 vê o
  mesmo no pixel real, com OI e CVD atravessando a lacuna.
- **Contra:** a regra `CLAUDE.md` §*"Nenhum número sem o comando"* e o padrão de CORREÇÃO das ADRs deste repo
  (ex.: a nota de 2026-09-24 na `ADR-043`). Uma decisão normativa segue apoiada num fato refutado, e o
  falsificador próprio da D3′ (bucket isolado ≥ 1 px) nunca rodou (`T-01.10-builder.md:100`: *"não rodados"*).
- **Correção:** uma nota de CORREÇÃO na D3′ que aponte o `T-01.10-desenho.md` §7 e o dono (`quant-architect` +
  `design_gate`), e rodar o falsificador da D3′. Não bloqueia a F1: o DoD 6 congela a forma.

### [WARNING-2] O falsificador da D2′ na ADR continua com a frase que o julgamento declarou defeituosa

- **Onde:** `ADR-044` linhas 86-89: *"**Morde:** filtrar também a portadora colapsa as lacunas"*.
  `handoff/T-01.10-desenho.md:98`, coluna "morde" da `F-D`, com a mesma frase.
- **Contra:** `handoff/ADR044-D2P-julgamento.md` §1, §4.1 e §4.2 (o texto de substituição está pronto), e §5:
  *"Aplicar a §4.1 à ADR é ato de quem integrar `f16673d`/`eed2844` na wave"*. A integração aconteceu (`ceec6ef`),
  mas a emenda não.
- **Correção:** aplicar a §4.1 à `ADR-044` e a §4.2 ao `T-01.10-desenho.md`, literalmente.

### [WARNING-3] A `SPEC-009` §3 ainda diz "exatamente com os `time` da grade" para toda série de pane

- **Onde:** `docs/specs/SPEC-009-paineis-de-fluxo.md:71-72`.
- **Contra:** a `ADR-044` §D2′(b) (as séries de pane recebem um **subconjunto**) e o código
  (`host-series-feed.ts:73`). Esta wave emendou a §5 (iii) e o `CA-11′` da SPEC, mas não a §3. A §5 (v)
  ("pertence à grade") continua correta.
- **Correção:** emendar a §3:71 para *"a portadora recebe exatamente a grade; toda série de pane recebe um
  subconjunto dela (`ADR-044/D2′`)"*.

### [WARNING-4] As bandas de marca não foram ancoradas em `getHeight()`, e a tarefa ficou sem dono

- **Onde:** `SymbolClient.tsx:554` (`CHART_HEIGHT_PX = 220`), `:1539`/`:1641` (banda `= 220 × (1 − top)`),
  `:1898`/`:2613` (o autoscale das marcas fixado nessa banda nominal). `charts/mark-band-geometry.ts`
  (`markBandGeometry`, `markBandGeometryOfPane`) é exportado em `charts/index.ts:196-197` e **nenhum código de
  produção o chama**.
- **Contra:** `ADR-044` §D1 (*"As bandas de marca presas a `CHART_HEIGHT_PX = 220` … passam a ser ancoradas em
  `IPaneApi.getHeight()`"*), §Consequências (*"As que F1 re-ancora (bandas de marca) migram para `charts`"*) e o
  item 1.4 do plano `01_*.md`. A `T-01.6-builder.md` §7 declarou o adiamento (*"trabalho de outra task"*), mas
  nenhuma task T-01.x seguinte o assume (`grep -n 'getHeight\|mark-band' tasks.toml` só acha o título da T-01.3).
- **O que não é:** não é regressão. A razão marca/banda se mantém e a contagem de FR-2 não cresce.
- **Correção:** ligar `markBandGeometryOfPane` no efeito de layout do host (onde `pane.getHeight()` já é lido,
  `SymbolClient.tsx:1189`) e aposentar `VOLUME_MARKS_BAND_PX`/`LIQUIDATION_MARKS_BAND_PX`. Se isso sair da F1, o
  owner registra uma task com dono, antes da fase `04`.

### [WARNING-5] O `series[]` do registry não governa a composição de produção

- **Onde:** `SymbolClient.tsx:128` importa do registry só `F1_PANE_ORDER`, `F1_PANE_STRETCH` e tipos. Nenhum
  `PaneRegistry` de produção é construído, e `validatePaneRegistry`/`assertValidPaneRegistry` só rodam sobre o
  fixture de teste. O BLOCKER-1 mostra o fixture já divergindo da produção no CVD.
- **Contra:** `ADR-044` §D3 (*"`RN-4` passa a ser propriedade do registry … Com isso a fusão da fase `04` não
  consegue 'esquecer' a marca"*), `SPEC-009` §3 (*"`web` é dono do registry (composição)"*) e §5.
- **Correção:** declarar em produção o registry das 6 panes (o mesmo `series[]` que os bindings montam) e validar
  esse objeto no teste. Ou então emendar a D3 para dizer que a garantia é só de fixture. O gatilho é a fase `04`,
  que funde as pernas justamente contando com essa garantia.

### [WARNING-6, regra do runner] `web-fullstack.hardcoded-url` — `frontend/src/app/symbol/chart-options.ts:77`

- `CHART_ATTRIBUTION_URL = "https://www.tradingview.com/"`, novo nesta wave (T-01.11-FIX, `SF-1`). É o link de
  atribuição da biblioteca e não depende de ambiente, então é provável que seja legítimo. **Correção:** registrar
  a exceção na allowlist da regra (ato de política) ou aceitar como aviso conhecido. Não reprova.

### [INFO-1] Dois cabeçalhos de seção novos em português em `frontend/src/charts/index.ts:203,209`

- `CLAUDE.md` tabela, linha 5 (*comentário = inglês*). Seguem o estilo local do arquivo (as seções 1–6 já estão
  em português). Idioma é convenção, não portão.

## 4. Comandos (literais, no diretório da wave)

```
harness rules list --severity block                                    # 8
git diff --name-only --diff-filter=AMR master...wave/paineis-f01       # 132
for f in <46 de code_paths + 12 de e2e>; do harness rules --mode file --path "$f" --format ndjson; done   # 0 block, 1 warn
harness rules --mode sweep --format ndjson                             # rc=0, 0 block, 77 warn
grep -rn 'createChart(' frontend/src/app frontend/src/charts | grep -v '\.test\.'
grep -rn 'seriesData\|param\.paneIndex' frontend/src/app frontend/src/charts | grep -v '\.test\.'
grep -rnE 'from "[^"]*app/' frontend/src/charts
grep -nE '^const [A-Z_]*(_PX|_SCALE_MARGINS|_LOG_BASE|_HEIGHT_PX)\s*=' frontend/src/app/symbol/SymbolClient.tsx | wc -l   # 14 (master: 14)
git log --oneline master..HEAD -- frontend/src/app/symbol/pane-registry.ts   # 88d48a1, e2596fb
grep -rn 'markBandGeometry' frontend/src --include='*.ts*' | grep -v '\.test\.'  # só charts/
```

## 5. Revalidação

Peça a **mutação**, não este relatório. Para o BLOCKER-1: remover a guarda `kind === "histogram"` tem de
reprovar o teste (iii-a) e o *PASSES* do CVD. Os WARNINGs 1–3 são emendas de documento com o texto já
escrito; o 4 e o 5 precisam de decisão de escopo do orquestrador ou do owner.
