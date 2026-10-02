# SPEC-011 — Estrutura do front: núcleo do gráfico, indicadores isolados por portão, e o host guiado pela seleção

**Status:** `DRAFT` — a identidade do estado é o ledger (`harness pipeline state estrutura-do-front`), não esta linha. `SPEC_APPROVED` é gate do
**owner**, e depende de ele aceitar a `ADR-050` (§13, `OWN-1`).
**Feature:** `estrutura-do-front` · **PRD:** [`PRD-011`](PRD-011-estrutura-do-front.md) · **Gap Analysis:**
[`gates/PRD-011-gap-analysis.md`](../context/estrutura-do-front/gates/PRD-011-gap-analysis.md) (`[READY FOR SPEC]`, 18 gaps, 0 bloqueantes)
**ADR:** [`ADR-050`](../adr/ADR-050-indicador-como-modulo-isolado-nucleo-do-grafico-e-catalogo-por-selecao.md) (**proposta**, com as emendas
`E-1`..`E-4` desta SPEC anexadas ao fim dela) · **Plano:** [`plans/SPEC-011-estrutura-do-front/`](../plans/SPEC-011-estrutura-do-front/index.md)
**Componentes:** `web` (primário) · `charts` (só a conta da faixa reservada, F8, `ADR-003/FR-2`) · `docs`
`[MEDIDO 2026-10-02: harness policy --key components → 7 elementos]`
**Autor:** `/architect` · **Data:** 2026-10-02 · **Base:** `docs/estrutura-do-front` em `975621a`, código de `frontend/` = `master` `eda7520`

---

## 0. Como ler

Esta SPEC não tem código. Ela fixa **contratos, formas de dado, limites de camada e comportamento de borda** de uma refatoração **sem
mudança visível**. O desenho é o da `ADR-050`, e esta SPEC não o repete. Ela fecha o que a ADR e o PRD deixaram aberto e corrige os 6 defeitos
que a Gap Analysis achou (`G-A`..`G-E`, `G-R`).

Rótulos como no `CLAUDE.md`. Os números de base mudam com o merge da fase `05` de `paineis-de-fluxo`. Por isso a SPEC fixa a **receita** de
cada número, e o número em si é medido no commit-base da F1 (§8).

**Escopo: F0–F9, 10 fatias.** A F10 do PRD saiu (§6.5, `G-G`), e a F11 do estudo já tinha saído pelo `O-2`.

---

## 1. Veredito do Gap Analysis — `[READY FOR SPEC]`

Nenhum gap bloqueante para o PRD. Os 6 defeitos têm resolução nesta SPEC: `G-A` → §5.3, `G-B` → §4.1, `G-C` → §7.2, `G-D` → §7.3,
`G-E` → §4.2, `G-R` → §3 e §4.2 (achado ao escrever a SPEC, depois do `approve prd`; o evento do ledger conta 17 gaps e 5 defeitos). As 3 perguntas que o PRD passou ao `/architect` estão decididas: `Q-1` → §6.4, `Q-2` → §6.5, `I-3` → §7.4.
**Ciclos com o `/pm`: 0.**

## 2. O que esta SPEC fixa, e o que não reabre

| não reabre | por quê |
|---|---|
| `O-1` (os 5 ligados) e `O-2` (o seletor nasce na F1 de `indicadores-smc`) | `[DECISÃO-OWNER: 2026-10-02, escolha entre alternativas apresentadas]` e `[PREMISSA-OWNER: 2026-10-02]` |
| `ADR-003/FR-2`, `ADR-034/D8`, `ADR-044` D1/D2/D2′, `ADR-005/D1` + `A4` | `PRD-011 §3` |
| o desenho da `ADR-050` (D1–D6) | é a proposta que o owner aceita ou recusa. Esta SPEC só a emenda onde a Gap Analysis achou defeito (§11) |

---

## 3. A árvore e quem é dono de cada camada

A árvore-alvo é a do estudo §4.1 `[DOC]`, com três ajustes desta SPEC: não existe `selection/IndicatorSelector.tsx` (é da F1 de
`indicadores-smc`); existe `selection/e2e-handle.ts` (§6.4); e a união `IndicatorKind` mora em `catalog.ts`, não em `contract.ts` (§4.1).

| camada | caminho | componente | quem pode importá-la |
|---|---|---|---|
| núcleo | `frontend/src/app/symbol/chart/**` | `web` | todos em `app/symbol/` |
| chrome | `frontend/src/app/symbol/chrome/**` | `web` | `SymbolClient.tsx`, `page.tsx`, `layout.tsx` |
| contrato | `frontend/src/app/symbol/indicators/contract.ts` | `web` | todos em `app/symbol/`, **menos** `chart/**` e `chrome/**` |
| indicador | `frontend/src/app/symbol/indicators/<kind>/**` | `web` | **só** `indicators/catalog.ts` e a própria pasta |
| catálogo | `frontend/src/app/symbol/indicators/catalog.ts` | `web` | `SymbolClient.tsx`, `page.tsx`, `layout.tsx`, `selection/**` |
| seleção | `frontend/src/app/symbol/indicators/selection/**` | `web` | `layout.tsx`, `SymbolClient.tsx` |
| geometria | `frontend/src/charts/` (pelo barrel) | `charts` | todos em `app/symbol/` (`ADR-034/D8`) |

**O núcleo não conhece indicador, e recebe a tabela por parâmetro (`G-R`).** A P2 (§5.3) proíbe `chart/**` de importar `indicators/**`, inclusive
`contract.ts` e `catalog.ts`. Por isso: (1) os tipos que o núcleo consome são **do núcleo**: o binding mora em `chart/host/` e o requisito de série em
`chart/history/`, e `contract.ts` os reusa; (2) o pager e o host recebem as definições como **argumento**, de quem pode importar o catálogo
(`SymbolClient.tsx`, `page.tsx`). Nenhum arquivo de `chart/**` cita o catálogo.

`[symbol]/page.tsx` continua o Server Component da rota e passa a pedir ao catálogo as séries e o `derive` de cada indicador (F3–F8).
`app/symbol/layout.tsx` nasce na F9 e é a **primeira** layout do segmento `[DOC: ADR-048, Consequências]`.

---

## 4. Contratos

### 4.1 `IndicatorDefinition` — os campos, e de onde vem a união de `kind` (`G-B`)

A forma é a da `ADR-050/D2` e do estudo §2.2. Os nomes ficam **finais na F0**, e esta tabela é o que a F0 não pode mudar.

| campo | forma | invariante |
|---|---|---|
| `kind` | literal de string, parâmetro de tipo `K extends string` | único no catálogo. É chave de `data-testid` e de e2e, e por isso `long_short` fica com `_` |
| `category` | `indicator` · `strategy` | os 5 embutidos são `indicator` |
| `cardinality` | `single` · `multi` | os 5 embutidos são `single` (`RN-3`) |
| `defaultParams` + `parseParams` | `parseParams(raw)` devolve os parâmetros ou um erro de parâmetro, e **não lança** | nos embutidos, aceita só `{}` |
| `placement` | `pane` (com `paneId` e `stretch`) · `overlay` sobre o preço (com pedido de faixa opcional, §4.3) | o `paneId` de um embutido é o `PaneId` de hoje |
| `data` | `series-history` (`series` + `derive` puro) · `indicator-endpoint` (`useData`) | os 5 embutidos são `series-history`. O `derive` é **um** por indicador, chamado pelo SSR e pelo pager (`RN-7`) |
| `View` | componente que declara as séries ao host pelo binding (§4.2) | ausência pelas marcas do núcleo (`chart/marks/*`), nunca texto local |

**A união `IndicatorKind` é derivada do catálogo**, em `catalog.ts`: o tipo do `kind` de cada entrada de `INDICATOR_CATALOG`. `contract.ts` não
enumera `kind`. Acrescentar uma linha ao catálogo estende a união, e é isso que torna o `CA-7 (b)` possível. **Falsificador:** o ensaio do
`CA-7 (b)` lista `indicators/contract.ts` no `git diff --name-only` ⇒ a união voltou para o contrato ⇒ reprova.

### 4.2 `IndicatorBinding` e o registrar — com `refeed` (`G-E`)

A forma é a da `ADR-050/D3`, mais um campo do host. **O tipo mora em `chart/host/`**, não em `contract.ts` (`G-R`): o registrar é núcleo, e a P2 o
proíbe de importar `indicators/**`. O `RF-1` do PRD, que põe `IndicatorBinding` em `contract.ts`, fica ajustado assim. O tipo nasce na F0, num arquivo só
de tipos em `chart/host/`, e `contract.ts` o reusa.

| parte | forma | invariante |
|---|---|---|
| chave | `instanceKey`, string. Nos embutidos, é o próprio `kind` | um binding por chave. Registrar uma chave já registrada substitui o anterior e desmonta o dele |
| `mount(chart, paneIndex)` | devolve os *handles* | o `paneIndex` é 0 para `overlay` e `1 +` a posição do `paneId` entre os indicadores de pane **ativos**, na ordem do catálogo |
| `apply(handles)` | devolve os *feeds* | **o host tem o único laço de `setData`** (`T-01.10`). O binding nunca chama `setData` |
| `unmount(chart, handles)` | **obrigatório** | depois dele, o pane 0 tem o mesmo número de séries que antes do `mount` (`CA-11`) |
| `measure?`, `scales?`, `layout?` | como `HostedPaneBinding` hoje | inalterados |
| `refeed(instanceKey)` | **do host**, não do binding | pede ao host que rode `apply` daquela chave fora de uma página de história. É o caminho de `indicator-endpoint` (`ADR-048/D3`, `D5`). Nenhum embutido usa. Prova: unitário com indicador sintético na F2 |

### 4.3 `OverlayBandRequest` — a faixa reservada (F8)

| parte | forma | invariante |
|---|---|---|
| pedido | fração da altura do pane 0 que o overlay quer no fundo | o pedido do volume é o valor que a vela reserva hoje (22%) `[DOC: ADR-050/D2]`. Com os 5 ligados, a geometria fica **idêntica** |
| soma | `chart/price/` soma os pedidos dos overlays **ativos** | a soma vazia é 0 |
| conta | a margem de escala sai de `charts/pane-stack-layout.ts` (`paneScaleMargins`, `:212`), pelo barrel | `ADR-003/FR-2`: a conta é geometria. `chart/price/` não calcula margem |
| volume desligado | **fora do escopo** | o volume nunca é desligado nesta feature. O efeito na tela é do `ui-designer` (`Q-6`) |

### 4.4 `IndicatorInstance` e o estado da seleção (F9)

| campo | forma | invariante |
|---|---|---|
| `instanceId` | string | nos embutidos, igual ao `kind` (`single`) |
| `kind` | um `IndicatorKind` do catálogo | `kind` fora do catálogo é recusado (§6.2) |
| `params` | o que `parseParams` devolve | `{}` nos embutidos |

O estado é **a lista de instâncias**. A seleção padrão (*seed*) são as 5, na ordem do catálogo (`RN-4`, `O-1`). **Esta forma é um subconjunto da
`SPEC-010 §6.1`**: a `indicadores-smc` acrescenta `style` e `visible` sem quebrar nada daqui (emenda `A-6`, §10). Sem persistência (`NG-3`).

### 4.5 `paneSetSignature(active)`

String com os `instanceKey` dos indicadores de **pane** ativos, na ordem do catálogo, separados por `|`. Overlay **não** entra. Com a seleção padrão:
`liquidation|oi|long_short|cvd`. É a `key` do `<ChartHost>` (§6.3).

---

## 5. O portão de isolamento

### 5.1 A tabela de dependências

É a do estudo §4.2 `[DOC]`, com a linha de `SymbolClient.tsx`/`page.tsx`/`layout.tsx` **dentro** da regra (§5.3), e não num grep.

### 5.2 `local/indicator-isolation`

Regra local de ESLint em `frontend/eslint-rules/`, com o precedente de `use-client-fingerprint-boundary.mjs`. Resolve o **caminho** de `import`,
`export … from`, `import()` e `require`, nunca a string. Não é `no-restricted-imports`, pelo motivo da `ADR-050/D6`: no flat config, o último bloco
substitui as opções (`eslint.config.mjs:242`) e apagaria o barrel da `ADR-034/D8`.

### 5.3 As três proibições (`G-A`)

| # | de | para | sonda que morde | sonda que cala |
|---|---|---|---|---|
| P1 | `indicators/<a>/**` | `indicators/<b>/**`, `indicators/catalog.ts`, `indicators/selection/**` | `indicators/oi/probe.ts` → `../cvd/x.ts`, por `import`, `import()` e `require` | `indicators/oi/probe.ts` → `../../chart/marks/absence.ts` e `../contract.ts` |
| P2 | `chart/**`, `chrome/**` | `indicators/**` (incluindo `contract.ts`) | `chart/host/probe.ts` → `../../indicators/oi/definition.ts` | `chart/host/probe.ts` → `../marks/absence.ts` |
| P3 | qualquer arquivo **fora** de `indicators/<kind>/` que não seja `indicators/catalog.ts` | `indicators/<kind>/**` | `app/symbol/probe.ts` → `./indicators/oi/definition.ts` | `indicators/catalog.ts` → `./oi/definition.ts` |

**"Pasta de indicador"** é todo subdiretório de `indicators/` **menos `selection/`**, que é infraestrutura da seleção e importa o catálogo. A regra
carrega essa exceção pelo nome, e o teste da regra tem a sonda: `indicators/selection/probe.ts` → `../catalog.ts` **cala**.

A P3 é o `CA-6` como portão. O grep do `PRD-011 §10` **cala** sobre a ablação dele (`G-A`) e sai do critério. Os testes de um indicador moram na
pasta dele, e por isso a P3 não os alcança.

### 5.4 O teste de diretório de topo

Todo **diretório** imediatamente abaixo de `frontend/src/` está em `{app, charts, components, features}`, uma lista **fixa** no teste e não lida do
disco (`CA-4`). Arquivo no topo de `src/` fica fora do universo: a `ADR-048/D8` cria `frontend/src/proxy.ts`, que é convenção do Next (`G-J`). Hoje: 4
diretórios e 0 arquivos `[MEDIDO 2026-10-02: ls frontend/src]`.

### 5.5 Os dois varredores, alargados na F0

| teste | hoje | depois da F0 | sonda |
|---|---|---|---|
| `bucket-arithmetic-boundary.test.ts` | `readdirSync` sem recursão (`:40`); `[symbol]/page.tsx` está **fora** | `app/symbol/**` com recursão, testes fora | a linha `Math.floor(ms / step) * step` em `indicators/oi/probe.ts` reprova. `page.tsx` entra no universo com 0 ofensores em 5 dos 6 padrões (`G-N`) |
| `data-fact-ascii-key-contract.test.ts` | lê só `SymbolClient.tsx`, prende **47** (`:99`) | lê a árvore `app/symbol/**` sem testes, e prende `N_fact` (§8) | apagar um `data-fact` de um pane movido baixa a contagem em 1 e reprova |

---

## 6. A seleção

### 6.1 O catálogo e a ordem (`G-P`)

`INDICATOR_CATALOG` é um array. A ordem das entradas de `placement: pane` é a de `F1_PANE_ORDER` sem o `price`: **`liquidation`, `oi`, `long_short`,
`cvd`** `[DOC: frontend/src/app/symbol/pane-registry.ts:73]`. O `volume` é a única entrada `overlay`. O catálogo **substitui** `F1_PANE_ORDER` e absorve
as invariantes (i)–(v) de `pane-registry.ts`, que passam a valer sobre o conjunto **ativo** (`ADR-050/D1`).

### 6.2 O reducer — puro, e o que ele recusa (`G-O`)

| ação | efeito | recusa (devolve o **mesmo** estado, mesma referência, sem lançar) |
|---|---|---|
| `add(kind, params?)` | acrescenta uma instância. O `instanceId` de `single` é o `kind` | `kind` fora do catálogo; segunda instância de um `single` (`RN-3`); `parseParams` devolver erro |
| `remove(instanceId)` | tira a instância | `instanceId` inexistente |
| `reset` | volta ao *seed* (os 5) | — |

**Ativo** = para cada entrada do catálogo, na ordem dele, as instâncias dela no estado (`RN-2`). A lista vazia é válida: sobra o núcleo (`RN-1`).

### 6.3 O host diante de uma mudança de seleção

| mudança | mecanismo | invariante |
|---|---|---|
| o conjunto de **panes** muda | só o `<ChartHost>` remonta (`key = paneSetSignature`). O pager e o `AxisSyncProvider` ficam acima e sobrevivem | **o primeiro mount** de um `AxisSyncStore` aplica `initialLogicalRange`; **todo mount seguinte** sobre o mesmo store aplica `currentRange` (milissegundos, independente do eixo `[DOC: axis-sync.ts:64-66]`) convertido pelo eixo corrente (`RN-10`). O host desmontado chama o `unregister` de `registerPanel` antes de sair |
| só um **overlay** muda | `mount`/`unmount` no lugar | o conjunto de panes não muda e nenhum índice se desloca |
| o custo do remonte | `performance.mark` em volta do mount, publicado em `data-host-mount-ms` na raiz do host | **só medido** (`RNF-5`). O limiar é do `design_gate` (`Q-5`) |

### 6.4 `Q-1` — o handle de e2e, ligado por parâmetro de URL

**Decisão.** O provider da seleção (`indicators/selection/`) lê, no mount e só no navegador, o parâmetro **`?e2eIndicatorSelection=1`**. Com ele
presente, publica em `window.__e2eIndicatorSelection` um objeto com três operações: `active()` (os `instanceId` ativos, na ordem do catálogo), `add(kind)` e
`remove(instanceId)`, que devolvem `true` se o estado mudou e `false` se o reducer recusou. As duas últimas **despacham as ações do reducer** de §6.2. Não
há caminho que mude o host sem passar pelo reducer. Sem o parâmetro, `window.__e2eIndicatorSelection` é `undefined`.

**Por quê.** É o precedente do repositório: 7 parâmetros `?e2e…` lidos em tempo de execução, no mesmo build de produção (`G-F`). O `CA-12` precisa mudar a
seleção **no meio da sessão**, e um parâmetro lido só no mount não basta. Despachar no reducer faz o e2e exercitar o mesmo caminho que o seletor vai
usar, e a F1 de `indicadores-smc` só acrescenta o botão.

**Alternativas recusadas, com o custo:**

| alternativa | custo |
|---|---|
| (b) do PRD: só unitário, e o e2e vai para a F1 de `indicadores-smc` | o `RN-10` fica sem prova em pixel por 10 fatias, e o defeito do `F-4` da `ADR-050` (o mount aplicar `initialLogicalRange`) só aparece em outra feature |
| build separado de e2e (`NEXT_PUBLIC_*`) | o e2e mede um artefato que não vai para produção |
| um parâmetro de URL que fixa o *seed* (`?e2eIndicators=volume,cvd`) | não muda a seleção no meio da sessão. O remonte por mudança de conjunto, que é o que o `CA-12` mede, não acontece |

**Custo declarado:** o handle vai no bundle de produção (~25 linhas, dentro do teto de §7.4). Ele não dá nada que o seletor não vá dar, porque a seleção
não persiste (`NG-3`).

**Falsificador.** (a) e2e sem o parâmetro: `window.__e2eIndicatorSelection === undefined`. **Morde:** tirar a checagem do parâmetro ⇒ o objeto existe ⇒
reprova. (b) Unitário: `add("oi")` com o OI já ativo devolve `false` e o estado tem a mesma referência. **Morde:** o handle mudar o estado sem o reducer.

### 6.5 `Q-2` — a F10 sai do escopo, e a F9 busca o catálogo inteiro

**Decisão.** A F10 (o pager pedir só as séries ativas, `RF-11`, `CA-14`) **não entra nesta feature.** Até o seletor existir, a F9 tem esta regra:
**o pager busca as séries de todo o catálogo, ativo ou não.** Os mesmos 10 pedidos por página de hoje `[DOC: ADR-050/D5]`.

**Por quê.**
1. Com a seleção sempre igual aos 5, a F10 economiza **0 pedido** `[DOC: PRD-011 §14 Q-2]`.
2. O único caminho novo dela (buscar do navegador a janela de um indicador religado) depende da `ADR-048/D8`, que é proposta, de outra feature, e corrige um
   defeito de origem cruzada que existe hoje `[DOC: ADR-048/D8, a medida de http://api:8000]`.
3. **Com o fetch do catálogo inteiro, religar é só `mount`.** O dado do indicador desligado continua chegando com cada página. Não há janela a buscar, e a F9
   fica correta sem rede nova.

**Custo declarado:** quando o seletor existir, desligar um indicador não economiza rede até a `indicadores-smc` fazer o corte. O corte vai como emenda
proposta à `SPEC-010` (`A-7`, §10), junto do seletor e da `D8`.

**Falsificador da regra.** e2e da F9 com o handle: tirar o OI da seleção e passar uma página de história ⇒ os pedidos por página continuam **10**. Religar o
OI ⇒ o pane volta com pontos na mesma página, **sem pedido novo**. **Morde:** um pager que filtra pela seleção sem o corte inteiro (meia F10) ⇒ o OI religado
volta sem pontos na janela já carregada.

---

## 7. Critérios: o que muda frente ao `PRD-011 §10`

### 7.1 `DoD-VERTICAL` como não-regressão (`G-L`)

Mantido como o PRD escreveu: nenhuma fase cria dado nem pixel, e o portão é o `make e2e` inteiro verde **sem editar spec existente** (`CA-1`). Precedente:
*"Nas fases que não criam dado, é não-regressão"* `[DOC: docs/plans/SPEC-009-paineis-de-fluxo/index.md, DoD-1]`.

### 7.2 `CA-8` — o universo do "movimento como está" (`G-C`)

- **Base:** `SymbolClient.tsx`, `view-model.ts`, `panel-assembly.ts` e os auxiliares que a fatia move inteiros, em `$BASE`.
- **Fatia:** os mesmos caminhos mais todo arquivo novo, **menos** `definition.ts`, que é código novo e tem teste de valor próprio.
- **Fora:** `[symbol]/page.tsx`, que é coberto pelo `CA-10`.
- **Receita:** a do estudo §5 (`norm` sem `import`/`export`, `sort`, `diff`), sobre esses dois conjuntos. O `diff` fica **vazio** em F1, F4, F5, F6 e F7.
  F2, F3, F8 e F9 **declaram** o diff na PR.

### 7.3 `CA-10` e `CA-11`, por fatia (`G-D`, `G-Q`)

| critério | F2 | F3 | F4–F8 | F9 |
|---|---|---|---|---|
| `CA-10` por indicador | — | **caracterização**: a derivação do SSR e a do pager, sobre as mesmas linhas, dão o mesmo resultado, para os 5. Se diferirem, é defeito de hoje e vai ao owner | o `derive` único dá o mesmo resultado chamado como SSR e como pager | — |
| `CA-10` global (o grep do estudo §1.3) | — | registrado (`D_3`) | **não sobe** de uma fatia para a seguinte | **0** ao fim da F8, mantido |
| `CA-11` | unitário sob `jsdom`, gráfico real, overlay **sintético**: 5 ciclos de `mount`/`unmount` deixam `panes()[0].getSeries().length` no valor inicial | — | F8: o mesmo unitário com o volume | e2e com o handle: 5 ciclos de `remove("volume")`/`add("volume")` deixam `data-pane0-series-count` no valor inicial |

### 7.4 `CA-15` — o bundle (`I-3`, `G-H`)

- **Receita:** `rm -rf .next && npx next build` em `frontend/`. O chunk da rota é o **maior** arquivo de `.next/static/chunks/*.js` que contém `data-fact`, e o
  tamanho é `gzip -c <chunk> | wc -c` (nível padrão).
- **Base `B0`:** medida no commit-base da F1 (§8). Em `master` `eda7520` é **84.577 B** `[MEDIDO 2026-10-02: n=2 builds, mesmos bytes]`.
- **Teto:** `B ≤ B0 × 1,04` ao fim da F8 e ao fim da F9. **Só para cima:** encolher não reprova.
- **Toda PR registra `B`.** Uma fatia de movimento (F1, F4–F7) com `|ΔB| > 1%` é sinal de lógica escondida no movimento e pede explicação na PR
  `[INFERRED: o chunk é um módulo só, 1 "use strict" para 31 arquivos, e mover código não deveria mudar bytes]`.
- **Não é o gatilho da `ADR-050/D5`.** Aquele (20 KB por indicador, ou 25% desligado) continua valendo e reabre o *lazy import*. Este só diz que a refatoração
  não incha.
- **Falsificador da tolerância:** se a F9 passar de +4% com o diff inteiro explicado por código novo de §4, o teto estava errado e é a estimativa de
  ~35 B por linha que cai. Volta ao `/architect`, não se ajusta o número na PR.

### 7.5 Os critérios, por fatia, no estado final

| fatia | critérios |
|---|---|
| F0 | `CA-2` (P1), `CA-3` (P2), `CA-6` (P3), `CA-4`, `CA-9` |
| F1 | `CA-1`, `CA-8`, `CA-9` (`N_fact` mantido) |
| F2 | `CA-1`, `CA-11` (sintético), `refeed` (§4.2) |
| F3 | `CA-1`, `CA-10` (caracterização) |
| F4–F7 | `CA-1`, `CA-2` sobre a pasta nova, `CA-8`, `CA-9`, `CA-10` |
| F8 | `CA-1`, `CA-10` (global = 0), `CA-11` (volume), `CA-15` |
| F9 | `CA-1`, `CA-5`, `CA-7`, `CA-12`, `CA-13`, `CA-15`, §6.4 (a)(b), §6.5 |

`CA-14` sai com a F10. `CA-6` passa de grep a lint e vai para a F0.

---

## 8. Os números de base, re-medidos no início da F1 (`G-I`)

A PR da F1 grava, no commit-base dela (o `origin/master` depois do merge da fase `05`), estes números. As fatias seguintes comparam com eles.

| nome | receita | em `master` `eda7520` hoje |
|---|---|---|
| `L0` | `wc -l frontend/src/app/symbol/SymbolClient.tsx` | 4.490 `[MEDIDO 2026-10-02]` |
| `N_spec` | `ls frontend/e2e/*.spec.ts \| wc -l` | 38 `[MEDIDO 2026-10-02]`; a wave acrescenta a `39` |
| `N_fact` | o total do `data-fact-ascii-key-contract.test.ts` | 47 `[DOC: o teste, :99]` |
| `B0` | §7.4 | 84.577 B `[MEDIDO 2026-10-02]` |
| `D_3` | o grep de duplicação do estudo §1.3, rodado na F3 | 39 na wave `[DOC: estudo §1.3]` |

---

## 9. A sequência, frente à `wave/paineis-f05` e à `indicadores-smc`

**O que a wave é hoje** `[MEDIDO 2026-10-02, por git show e git diff, sem checkout]`: 29 commits à frente de `master`; 47 arquivos de `frontend/` mudados, entre
eles `SymbolClient.tsx`, `[symbol]/page.tsx`, `use-history-pager.ts`, `panel-assembly.ts`, `view-model.ts`, `charts/index.ts` e 8 specs de e2e (`20`, `22`,
`29`, `33`, `35`, `37`, `38` e a nova `39`). Fora de `src/` e `e2e/`, só `frontend/README.md`. O `tasks.toml` da wave marca as 5 tasks da fase `05` como `todo`,
com `T-05.1` e `T-05.2` já mergeadas na wave.

| ordem | fatia | quando pode começar | paralelo com |
|---|---|---|---|
| 1 | **F0** | **já**. Não toca nenhum dos 47 arquivos da wave nem `frontend/README.md` (`G-M`). Toca `eslint.config.mjs`, `eslint-rules/`, os 2 varredores e arquivos novos (contrato, tipos do núcleo, testes), nenhum deles no diff da wave `[MEDIDO: git diff --name-only master...wave/paineis-f05 -- frontend]` | a fase `05` inteira |
| 2 | **F1** | quando a PR da `wave/paineis-f05` estiver mergeada em `origin/master` **e** `T-05.1`, `T-05.4` e `T-05.5` estiverem com `status = "done"` no `tasks.toml` de `origin/master` (`G-K`) | nada |
| 3 | F2 → F3 → F4 | em série, cada uma depois da anterior mergeada | nada (núcleo) |
| 4 | F5, F6, F7, F8 | depois da F4. **No máximo 3 por vez** `[DOC: MEMORY orquestracao-3-paralelas-worktree]` | entre si. A F8 é a única que edita `chart/**`: *um editor de `chart/**` por vez* |
| 5 | F9 | depois de F5–F8 | nada |

**Frente à `indicadores-smc`:**
- **O backend e a parte `charts` dela podem correr já**, como a `SPEC-010 §8.2` diz. O único arquivo que as duas tocam é o barrel `charts/index.ts` (o item `1.6`
  dela e a F8 daqui). O conflito é de uma linha de `export`, e o `git` funde sozinho `[INFERRED: os dois acrescentam linhas distintas]`.
- **O front dela começa depois da F9 daqui mergeada** (emenda `A-4`). A F9 entrega o *store*, o catálogo, o handle e o caminho de overlay que a F8 provou.

---

## 10. Emendas propostas à `ADR-048` e à `SPEC-010` — **não editadas aqui**

Elas vivem na branch `docs/indicadores-smc-refinamento`, de outra sessão, e esta SPEC **não** as edita. Quem consolida é o `/architect` de `indicadores-smc`, e
quem aceita é o owner, no gate da `SPEC-010`. A base é a tabela do estudo §8 `[DOC]`, com as correções da Gap Analysis.

| id | onde | hoje | proposta | por quê |
|---|---|---|---|---|
| `A-1` | `ADR-048/D1` | *store* de SMA/EMA/SMC em `app/symbol/layout.tsx` | **mantém**. A lista passa a conter os embutidos, e a `layout.tsx` **nasce na F9 desta feature**, não na F1 de `indicadores-smc` | um *store* só para tudo o que o seletor liga e desliga |
| `A-2` | `ADR-048/D3` | segunda espécie de binding, de overlay, em `app/symbol/chart-host-overlay.ts`, com `refeed(key)` | **uma espécie só**, `IndicatorBinding`, em `app/symbol/chart/host/registrar.ts`, entregue pela F2. O `refeed(instanceKey)` **é do host e entra na F2** (`G-E`) | os panes e as médias passam pelo mesmo registrar, e o volume o prova antes (F8) |
| `A-3` | `ADR-048`, Consequências | *"`SymbolClient.tsx` muda ~60–80 linhas na F1"* | **0 linha** em `SymbolClient.tsx` e **0** em `chart/**`. Cada indicador novo é uma pasta mais 1 linha em `catalog.ts` | o `refeed` já existe (`A-2`), e o seletor monta pela `View` |
| `A-4` | `SPEC-010 §8.1` | front só depois da fase `05` mergeada | front só depois da **F9 desta feature** mergeada (que já exige a fase `05`) | a F9 entrega o *store*, o catálogo e o overlay |
| `A-5` | `SPEC-010 §8.3` e `§8.4` | *"um editor de `SymbolClient.tsx` por vez"*; orçamento de ~60–80 linhas | *"um editor de `chart/**` por vez; pastas de indicador em paralelo, até 3"*; orçamento de 0 em `SymbolClient.tsx` e em `chart/**` | o gargalo muda de arquivo para camada |
| `A-6` | `SPEC-010 §6.1` | `kind ∈ {sma, ema, smc}` | `kind ∈ {volume, oi, cvd, liquidation, long_short, sma, ema, smc}`, `params = {}` nos embutidos; `style` e `visible` acrescentados sobre a forma de §4.4 | ⚠️ **aberto, e não é meu** (`Q-3`): se o corpo hasheado do `indicator_set` (`ADR-047`) inclui a visibilidade dos embutidos |
| `A-7` | `SPEC-010`, plano da F1 (`01_seletor_e_sma.md`) | — | **recebe a F10 daqui**: `RF-11` e `CA-14` (o pager pede só as séries ativas; religar busca a janela carregada; com os 5 ligados, 10 pedidos). Depende da `ADR-048/D8` | é o primeiro momento em que algum indicador fica desligado (§6.5) |
| `A-8` | `SPEC-010`, plano da F1 | o seletor despacha no *store* | o seletor despacha **as mesmas ações** do reducer de §6.2, e o e2e dele pode usar o handle de §6.4 para preparar o estado | um caminho só, e o handle já provado |

---

## 11. Emendas à `ADR-050` (anexadas ao fim dela, sem mudar o status)

| id | onde | emenda |
|---|---|---|
| `E-1` | `D3` | o registrar expõe `refeed(instanceKey)` (§4.2, `G-E`) |
| `E-2` | `D6` | a regra tem a terceira proibição, P3 (§5.3, `G-A`) |
| `E-3` | `D7` | **10 fatias, F0–F9.** A F10 vai para a `SPEC-010` (`A-7`), e a F11 para a F1 de `indicadores-smc` (`O-2`) |
| `E-4` | `D2` | a união `IndicatorKind` é derivada do catálogo, não declarada no contrato (§4.1, `G-B`); os tipos que o núcleo consome moram no núcleo, e ele recebe as definições por parâmetro (§3, §4.2, `G-R`) |

---

## 12. Perguntas em Aberto

| id | pergunta | classe | dono |
|---|---|---|---|
| `Q-3` | o corpo hasheado do `indicator_set` inclui a visibilidade dos embutidos? | não-bloqueante aqui (esta feature não grava `indicator_set`) | `/architect` de `indicadores-smc` |
| `Q-5` | o limiar aceitável do "piscar" no remonte | não-bloqueante aqui: a F9 só mede (`data-host-mount-ms`) | `ui-designer` + `ux-ui-mastery` |
| `Q-6` | com o volume desligado, a vela desce para a faixa? | não-bloqueante aqui | `ui-designer` |
| `Q-7` | consolidar `A-1`..`A-8` na `ADR-048` e na `SPEC-010` | não-bloqueante aqui; bloqueia o front de `indicadores-smc` | `/architect` de `indicadores-smc` |
| `Q-8` | a caracterização da F3 achar diferença entre a derivação do SSR e a do pager | **condicional**: só existe se a F3 achar. Se achar, é mudança de comportamento, fora do `RN-9` | owner, com o caso medido na mão |

Suposições registradas (`[INFERRED]`), o owner pode vetar qualquer uma no gate: teto de +4% (§7.4); `|ΔB| > 1%` como sinal em fatia de movimento (§7.4);
recusa do reducer como no-op (§6.2); o conflito no barrel de `charts` ser só de uma linha (§9); a leitura de `O-2` (`PRD-011 I-1`, do orquestrador).

---

## 13. O gate do owner

**Esta SPEC nasce `DRAFT`.** O `approve spec` é do owner, e ele só faz sentido com a `ADR-050` aceita. Uma pergunta:

### `OWN-1` — aceitar a `ADR-050`?

| opção | o que acontece | custo |
|---|---|---|
| **(a) aceitar, com as emendas `E-1`..`E-4`** | a `ADR-050` passa a aceita, a `SPEC-011` pode ir a `SPEC_APPROVED`, e a F0 pode começar já | 10 fatias. O corte de rede (F10) passa para a `indicadores-smc` (`A-7`): até lá, desligar um indicador não economiza pedido. O handle de e2e entra no bundle de produção (~25 linhas, §6.4) |
| (b) aceitar, mas manter a F10 nesta feature | a `SPEC-011` volta ao `/architect` para reescrever §6.5 e o plano com 11 fatias | a F10 fica **bloqueada pela `ADR-048/D8`**, que é proposta de outra feature, e esta feature **não fecha `DONE`** antes dela. O código novo da F10 economiza 0 pedido até o seletor existir |
| (c) recusar | a feature volta ao `frontend-architect` | a `indicadores-smc` começa o front sobre o `SymbolClient.tsx` de hoje (4.490 linhas em `master`), com o orçamento de ~60–80 linhas da `ADR-048` e a regra *"um editor de `SymbolClient.tsx` por vez"*. É o contrário da fala do owner: *"esse ajuste de agora será puxado antes da feature de indicadores-smc"* `[PREMISSA-OWNER: 2026-10-02]` |

Recomendação técnica: **(a)**.

---

## 14. Rastreabilidade — requisito → onde fecha

| requisito | fatia | onde |
|---|---|---|
| `RF-1` | F0 | §4.1 (`kind` derivado do catálogo, `E-4`); o binding fica em `chart/host/` (§4.2, `G-R`) |
| `RF-2` | F1 | §3 |
| `RF-3` | F2 | §4.2 (+ `refeed`, `E-1`) |
| `RF-4`, `RN-7` | F3–F8 | §7.3 |
| `RF-5` | F4–F8 | §3 |
| `RF-6` | F0 | §5.2, §5.3 (P1, P2 **e P3**) |
| `RF-7` | F0 | §5.4 |
| `RF-8`, `RN-2` | F9 | §6.1 |
| `RF-9`, `RN-4` | F9 | §4.4, §6.2 |
| `RF-10`, `RN-10` | F9 | §6.3 |
| `RF-11` | **sai** | §6.5 → `A-7` |
| `RF-12` | F8 | §4.3 |
| `RNF-1`, `RN-9` | F1–F9 | §7.1, `CA-1` |
| `RNF-2`, `RN-8` | — | `ADR-050/D5`, mantido |
| `RNF-3` | F8, F9 | §7.4 |
| `RNF-4` | F1–F9 | as specs `17` e `20` dentro do `make e2e` |
| `RNF-5` | F9 | §6.3 |
| `RNF-6` | todas | `make verify` |
| `RN-1` | F9 | §6.2 (lista vazia válida) |
| `RN-3` | F9 | §6.2 |
| `RN-5` | F0 | §5.3 |
| `RN-6`, `RN-12` | F1, F4–F7 | §7.2 |
| `RN-11` | F1 | §9 |

## 15. Próximo passo

`harness pipeline advance estrutura-do-front SPEC_DRAFT`. Depois, o owner decide `OWN-1` e roda `approve spec`. Com a SPEC aprovada, o `/tech-lead` quebra o plano
em tasks. A F0 pode ser a primeira wave, em paralelo com a fase `05`.
