# PRD-011 — Estrutura do front: o núcleo do gráfico e os indicadores como módulos isolados, carregados pela seleção

**Feature:** `estrutura-do-front` · **sem mãe declarada** `[INFERRED: o handoff não nomeia mãe; o owner pode relacionar com `harness pipeline relate`]`
**Componente primário:** `web` · **toca:** `charts` (só a geometria da faixa reservada do overlay, F8, pela `ADR-003/FR-2`)
**Estado do ledger ao escrever:** `INIT`, 2 eventos (`init` 18:22:27Z, `dispatch pm` 18:45:19Z)
`[MEDIDO 2026-10-02: harness pipeline show estrutura-do-front]`
**Entrada:** [`handoff/FRONTEND-ARCH-estudo.md`](../context/estrutura-do-front/handoff/FRONTEND-ARCH-estudo.md) (a fala do owner) ·
[`handoff/DECISOES-OWNER.md`](../context/estrutura-do-front/handoff/DECISOES-OWNER.md) (`O-1`, `O-2`) ·
[`gates/FRONTEND-ARCH-estudo.md`](../context/estrutura-do-front/gates/FRONTEND-ARCH-estudo.md) (o estudo, E-1..E-6) ·
[`ADR-050`](../adr/ADR-050-indicador-como-modulo-isolado-nucleo-do-grafico-e-catalogo-por-selecao.md) (**proposta**)
**Fonte do PRD:** local. `harness policy --key docs.external_prd_repo` devolve vazio `[MEDIDO 2026-10-02]`.

---

## 0. Como ler este documento

Esta feature é uma **refatoração sem mudança visível**. Toda fase termina com a tela igual, e o que se mede é a estrutura: linhas,
imports, quem importa quem e o e2e inteiro verde sem editar spec. Por isso o `DoD-VERTICAL` muda de forma aqui (§10, cabeçalho).

Toda afirmação quantitativa carrega o comando ou o rótulo (`CLAUDE.md`). A maior parte dos números vem do estudo do
`frontend-architect`, medido na `wave/paineis-f05` em `4b255da`, e leva `[DOC: estudo §x]`. O que este `/pm` re-rodou em `master`
leva `[MEDIDO 2026-10-02]`.

O `/pm` não decide arquitetura. O desenho (pastas, contrato, host, seleção) é da `ADR-050`, e este PRD só o transforma em
fronteira de fase e critério de aceite. Onde a ADR ainda é proposta, a dependência está em §14.

---

## 1. Contexto e problema

### 1.1 A fala do owner, literal

`[PREMISSA-OWNER: 2026-10-02]`, copiada de `handoff/FRONTEND-ARCH-estudo.md` §1:

> *"hoje praticamente 100% do que temos de valor está em um único arquivo, então trabalhar em multi tasks está quase impossível."*
>
> *"uma das necessidades é a criação de uma aba de seleção de indicadores/estratégias. volume, OI, cvd e outros é tudo indicadores. Então vamos fazer essa estruturação no projeto, inclusive olhar como e quais responsabiliades, pois n faz sentido ficar tudo da forma como está. Cada um deveria ser um item isolado que posso mexer sem gerar impactos e são carregados a partir dos indicadores selecionados."*
>
> *"Vale estudar como aplicar isso nas pastas e em arquivos, o que deveria ser componentes, pq claramente não estamos seguindo boas práticas."*
>
> *"esse ajuste de agora será puxado antes da feature de indicadores-smc pq daí já conseguimos ter algo estruturado lá"*

E sobre onde nasce o seletor, também literal `[PREMISSA-OWNER: 2026-10-02]` (`DECISOES-OWNER.md`, `O-2`):

> *"seleção pode ser da F1, daí aqui nasce como tudo sendo injetado já como se tivesse selecionado até que a f1 do smc seja desenvolvida."*

### 1.2 O que está medido

| # | fato | número | fonte |
|---|---|---|---|
| M1 | tamanho de `SymbolClient.tsx` | **4.490** linhas em `master` (`eda7520`), **4.527** na `wave/paineis-f05` | `[MEDIDO 2026-10-02: wc -l frontend/src/app/symbol/SymbolClient.tsx]` em `master`; a wave, `[DOC: handoff §2]` |
| M2 | quanto do arquivo são os 5 indicadores | **2.561** linhas: long/short 709 · liquidação 705 · OI 649 · CVD 255 · volume 243 | `[DOC: estudo §1.1 e Apêndice A, inv.py sobre a wave 4b255da]` |
| M3 | concentração de edição | **52 de 118** commits de front desde 2026-09-01 tocaram o arquivo (44%) | `[DOC: estudo §1.4, git log --no-merges --since=2026-09-01 … \| wc -l]` |
| M4 | o host fixa os panes no mount | número de panes por `PANE_STACK`, índice por `F1_PANE_ORDER`, registrar em `Map<paneIndex>` sem `unmount` | `[DOC: estudo §1.2]` |
| M5 | derivação duplicada SSR × pager | **39** linhas de código iguais entre `[symbol]/page.tsx` e `panel-assembly.ts`, depois de normalizar | `[DOC: estudo §1.3]` |
| M6 | sem portão de isolamento | numa sonda de ESLint, um indicador importando outro **cala**, e `src/indicators/` importando `charts` profundo **também cala** | `[DOC: estudo §4.3 e Apêndice A]` |
| M7 | acoplamento real entre indicadores | **5 pares**, só 1 não trivial (preço ↔ volume, 12 símbolos); os outros são `VolumeSlot` e `formatSpan` | `[DOC: estudo §1.1]` |
| M8 | o portão de tela que existe | **38** specs em `frontend/e2e/` em `master`; o estudo conta **39** na wave, 32 delas na rota `/symbol` | `[MEDIDO 2026-10-02: ls frontend/e2e/*.spec.ts \| wc -l]`; a wave, `[DOC: estudo §5]` |
| M9 | testes de `app/symbol/` | **55** arquivos e **533** casos; **26** leem o fonte de `SymbolClient.tsx` por regex, e **16** o de `page.tsx` | `[DOC: estudo §6.1]` |
| M10 | dois varredores que perderiam o universo em silêncio | `bucket-arithmetic-boundary.test.ts` usa `readdirSync` sem recursão e dá `pass 5, fail 0` com a sonda numa subpasta; `data-fact-ascii-key-contract.test.ts` só lê `SymbolClient.tsx` e prende **47** fatos | `[DOC: estudo §6.2, MEDIDO 2026-10-02 numa cópia da wave]` |
| M11 | peso do código de indicador no bundle | o maior indicador tem **3.973 B** gzip, cerca de 4,7% dos **85.169 B** gzip do chunk da rota; a `lightweight-charts` tem **60.617 B** | `[DOC: ADR-050/D5, next build + terser/gzip]` |

### 1.3 O diagnóstico

O problema não é a qualidade de cada pane. Cada um já se declara ao host por `useHostedPane` e pinta a própria camada
`[DOC: estudo §0]`. O problema é de **lugar e de portão**:

1. **Lugar.** Tudo mora num arquivo, e duas tarefas paralelas no front editam o mesmo arquivo (M1, M3). A `SPEC-010 §8.3` precisou da
   regra *"um editor de `SymbolClient.tsx` por vez"* `[DOC: estudo §1.4]`.
2. **Host.** O conjunto de panes é fixo no mount (M4). Sem isso resolvido, *"carregados a partir dos indicadores selecionados"* não tem
   onde se apoiar.
3. **Portão.** Nada impede um indicador de importar outro (M6). Separar em pastas sem portão volta ao estado de hoje na primeira
   pressa.

---

## 2. Objetivo

Ao fim da F10:

- `SymbolClient.tsx` só compõe o chrome, o host e os indicadores ativos, e tem **no máximo 350 linhas** `[DOC: ADR-050/D1]`.
- Cada um dos 5 indicadores atuais (volume, OI, CVD, liquidação, long/short) mora numa pasta própria, com definição, dado,
  componente e testes.
- Um indicador **não consegue** importar outro: o lint reprova.
- Adicionar um indicador é **uma pasta nova e uma linha no catálogo**, e não edita o núcleo.
- O host monta só o que está na seleção, e o pager busca só as séries dos ativos. A seleção padrão tem os 5, sem controle na tela
  (`O-1`, `O-2`).
- **A tela do operador fica idêntica** em toda fase.

O ganho para o owner é poder despachar tarefas de indicador em paralelo (até 3 `[DOC: MEMORY orquestracao-3-paralelas-worktree]`)
sem colisão de arquivo, e a `indicadores-smc` começar o front sobre essa estrutura (fala 4 de §1.1).

---

## 3. Decisões já tomadas que este PRD NÃO reabre

| decisão | onde | efeito aqui |
|---|---|---|
| os 5 indicadores ligados na primeira visita | `O-1` `[DECISÃO-OWNER: 2026-10-02, escolha entre alternativas apresentadas]` | o *seed* da seleção tem os 5 (RN-4). É a condição de tela idêntica |
| o seletor (tela A) nasce na F1 de `indicadores-smc` | `O-2`, a fala literal em §1.1 e a leitura `[INFERRED: do orquestrador, DECISOES-OWNER.md]` | esta feature é **F0–F10**. Não há UI para ligar ou desligar (NG-1) |
| fronteira `web` ↔ `charts` | `ADR-003/FR-2` | geometria nova (faixa do overlay) mora em `charts` |
| barrel de `charts` e `features/**` sem `charts` | `ADR-034/D8` | a regra nova (RF-6) não substitui as opções dessa (ADR-050/D6) |
| um gráfico, grade canônica, portadora no pane 0 | `ADR-044` D1/D2/D2′ | o pane 0 é núcleo e não se desliga (RN-1) |
| FastAPI é a única porta | `ADR-005/D1` + `A4` | nenhuma fatia cria rota nova de dado; a F10 depende do *proxy* da `ADR-048/D8` (§14 `Q-2`) |
| idioma | `CLAUDE.md`, tabela de fronteira | pastas e arquivos novos em inglês (`indicators/`, `chart/`, `chrome/`, `catalog.ts`) |

---

## 4. Escopo

### 4.1 Dentro

- As **11 fatias F0–F10** da `ADR-050/D7` e do estudo §5, nesta ordem e com estas dependências.
- O contrato `IndicatorDefinition` e o `IndicatorBinding` (ADR-050 D2, D3), com nomes finais na F0.
- A regra `local/indicator-isolation` e o teste de diretório de topo (ADR-050/D6).
- O alargamento dos dois varredores de M10, **antes** de qualquer movimento.
- O *store* da seleção em `app/symbol/layout.tsx`, o catálogo e o render guiado por ele, com os 5 injetados como selecionados.
- O fetch por seleção (F10), condicionado a `Q-2`.

### 4.2 O que esta feature assume das irmãs

| de quem | o quê | consequência |
|---|---|---|
| `paineis-de-fluxo`, fase `05` (`wave/paineis-f05`, ativa) | toca **47** arquivos do front, entre eles `SymbolClient.tsx`, `page.tsx`, `use-history-pager.ts` e `panel-assembly.ts` `[DOC: estudo §5, git diff --numstat]` | **só a F0 corre antes.** F1 em diante espera a fase `05` em `origin/master` (RN-11) |
| `indicadores-smc` (`ADR-048`, `SPEC-010`, outra sessão) | o *store* da `ADR-048/D1`; o *proxy* da `ADR-048/D8`; a forma de `IndicatorInstance` (`SPEC-010 §6.1`) | o estudo §8 propõe emendas a `ADR-048/D3` e `SPEC-010` §6.1 e §8. **Este PRD não as edita**; quem consolida é o `/architect` de `indicadores-smc` |

---

## 5. User stories — uma por fatia

O "usuário" desta feature tem duas caras: o **operador** do `/symbol`, que não pode perceber nada, e o **mantenedor** (o owner e os
agentes que ele despacha), para quem a estrutura existe.

### F0 · Os trilhos antes do movimento

> **Como** mantenedor, **quero** que o lint reprove um indicador importando outro e que os varredores de teste olhem as subpastas
> **antes** de qualquer código mudar de lugar, **para** que a separação não nasça já furada.

- **Fronteira:** `contract.ts` (só tipos), `local/indicator-isolation` com sonda morde/cala, teste de diretório de topo, os dois
  varredores de M10 alargados. **Nenhum** arquivo da wave é tocado. Pode correr já, junto da fase `05` `[DOC: estudo §5]`.
- **Pronto quando:** CA-2, CA-3, CA-4 e CA-9 verdes; a tela não é tocada.

### F1 · O núcleo sai do arquivo

> **Como** mantenedor, **quero** o host, o registrar, a legenda, as marcas e o chrome fora de `SymbolClient.tsx`, **para** que mexer
> num indicador deixe de ser editar o mesmo arquivo do núcleo.

- **Fronteira:** movimento **como está** para `chart/` e `chrome/` (RN-6). Nenhuma lógica muda.
- **Pronto quando:** CA-1 e CA-8 verdes.

### F2 · O registrar por chave, com `unmount`

> **Como** mantenedor, **quero** que o host registre panes e overlays pelo mesmo caminho, com chave de string e `unmount`
> obrigatório, **para** que um indicador possa entrar e sair sem o host conhecê-lo.

- **Fronteira:** registrar por `instanceKey`, índice derivado do conjunto ativo, `placement`. O host continua com o único laço de
  `setData` `[DOC: ADR-050/D3]`.
- **Pronto quando:** CA-1 e CA-11 verdes.

### F3 · O dado por tabela

> **Como** mantenedor, **quero** que o SSR e o pager iterem a mesma lista de séries por indicador, **para** que a derivação exista
> uma vez só.

- **Fronteira:** `page.tsx`, o pager e `panel-assembly.ts` iteram `series` + `derive`. **Os mesmos 10 fetches** de hoje
  `[DOC: ADR-050/D5, "6 dos 10 fetches por página são de indicador"]`.
- **Pronto quando:** CA-1 e CA-10 verdes.

### F4 · O CVD como piloto

> **Como** mantenedor, **quero** o CVD numa pasta própria com definição, dado, componente e testes, **para** validar o molde antes
> de repeti-lo em mais três.

- **Fronteira:** movimento como está, mais o `derive` que une `page.tsx` e `panel-assembly.ts` para o CVD. Os testes do CVD vão
  para a pasta dele.
- **Pronto quando:** CA-1, CA-8 e CA-10 (para o CVD) verdes.

### F5 · O OI · F6 · A liquidação · F7 · O long/short

> **Como** mantenedor, **quero** cada um desses indicadores na sua pasta, **para** despachá-los em paralelo sem colisão.

Três stories, uma por fatia, com a mesma forma da F4. Cada uma leva os módulos auxiliares do seu indicador (`oi-candle-pane.ts` e
`oi-regime-*`; `liquidation-pane-form.ts` e `liquidation-legend-swatch.ts`; `long-short-band.ts` e `ratio-format.ts`)
`[DOC: estudo §5]`.

- **Fronteira:** um indicador por fatia. Correm **no máximo 3 por vez** entre F5–F8. O conflito esperado é uma linha cada em
  `catalog.ts` `[DOC: estudo §5]`.
- **Pronto quando:** CA-1, CA-2 (sobre a pasta nova), CA-8 e CA-10 verdes.

### F8 · O volume vira overlay do preço

> **Como** mantenedor, **quero** o volume fora do binding do `PricePane`, como overlay que pede a sua faixa, **para** que o único
> acoplamento real entre indicadores (M7) deixe de existir e o caminho de overlay fique provado antes da `indicadores-smc`.

- **Fronteira:** o volume sai do `PricePane`, o `PricePane` vai para `chart/price/`, e a faixa reservada passa a ser **pedido** do
  overlay, com a conta em `charts`. É a única fatia de F5–F8 que edita o núcleo `[DOC: estudo §5]`, e por isso **não** é fatia de
  movimento puro: declara o diff.
- **Pronto quando:** CA-1 (com atenção às specs 09, 15, 28, 29, 30 e 08) e CA-11 verdes.

### F9 · A seleção

> **Como** mantenedor, **quero** que o host monte só os indicadores da seleção, lidos de um catálogo, com a seleção num *store*
> que sobrevive ao remonte da rota, **para** que *"carregados a partir dos indicadores selecionados"* (§1.1) seja verdade no código
> antes de existir o seletor.

- **Fronteira:** `layout.tsx` + reducer + `catalog.ts`; render guiado pelo catálogo; mudança de conjunto de panes remonta só o
  host e preserva a faixa visível (RN-10). Seleção padrão = os 5 (RN-4). **Sem controle na tela** (NG-1).
- **Pronto quando:** CA-1, CA-5, CA-6, CA-7, CA-12 e CA-13 verdes.

### F10 · O fetch por seleção

> **Como** mantenedor, **quero** que o pager busque só as séries dos indicadores ativos, e que um indicador religado busque a janela
> já carregada, **para** que desligar um indicador economize rede quando o seletor existir.

- **Fronteira:** pager e religamento. Com a seleção padrão, o número de pedidos por página fica igual ao de hoje (CA-14).
- **Depende de:** `ADR-048/D8` (*proxy* de mesma origem), que é de `indicadores-smc` (§14 `Q-2`).
- **Pronto quando:** CA-1 e CA-14 verdes.

---

## 6. Unidades de valor candidatas — **não criadas**

`harness policy --key tracker` devolve `kind = jira`, projeto `CST`, `parent_kind = Epic` `[MEDIDO 2026-10-02]`. Elas só nascem
**depois** de o `/architect` validar este PRD.

| candidata | cobre |
|---|---|
| Epic *"Estrutura do front: núcleo e indicadores isolados"* | F0–F10 |

As tasks são do `/tech-lead`, não deste PRD.

---

## 7. Requisitos

### 7.1 Funcionais

| id | requisito | fatia |
|---|---|---|
| RF-1 | Existe `app/symbol/indicators/contract.ts` com `IndicatorDefinition`, `Placement`, `DataSource` e `IndicatorBinding`, só com tipos | F0 |
| RF-2 | O núcleo (vela e pane 0, `TimeAxis`, `AxisSync`, pager, host, registrar, crosshair, `LegendFrame`, marcas de ausência e cobertura) mora em `app/symbol/chart/`; o chrome (`TimeframeBar`, `LiveRow`, `ChromeModeStamp`) em `app/symbol/chrome/` | F1 |
| RF-3 | O registrar aceita bindings por `instanceKey`, com `mount`, `apply` e `unmount` obrigatórios, e deriva o índice do pane do conjunto ativo | F2 |
| RF-4 | O SSR (`[symbol]/page.tsx`) e o pager chamam a **mesma** função `derive` de cada indicador | F3–F8 |
| RF-5 | Cada indicador mora em `app/symbol/indicators/<kind>/` com `definition.ts`, `data.ts`, o componente e os testes dele | F4–F8 |
| RF-6 | `local/indicator-isolation` reprova `import`, `export … from`, `import()` e `require` de `indicators/<a>/**` para `indicators/<b>/**`, `catalog.ts` ou `selection/**`, e de `chart/**` ou `chrome/**` para `indicators/**` | F0 |
| RF-7 | Todo diretório de topo de `frontend/src/` está em `{app, charts, components, features}`, e um teste reprova o que não estiver | F0 |
| RF-8 | `indicators/catalog.ts` é o único arquivo que importa pastas de indicador; a ordem do array é a ordem dos panes; o catálogo substitui `F1_PANE_ORDER` e absorve as invariantes de `pane-registry.ts` | F9 |
| RF-9 | A seleção mora no *store* de `app/symbol/layout.tsx`, acima do `key` que remonta `SymbolClient` | F9 |
| RF-10 | O host monta só as instâncias ativas; mudança no conjunto de panes remonta só o `<ChartHost>`; mudança só de overlay faz `mount`/`unmount` no lugar | F9 |
| RF-11 | O pager pede só as séries dos indicadores ativos; um indicador religado busca a janela já carregada | F10 |
| RF-12 | O volume é overlay do preço e pede a faixa reservada; a conta de margem é de `charts` | F8 |

### 7.2 Não-funcionais

| id | requisito | número | rótulo |
|---|---|---|---|
| RNF-1 | **Tela idêntica** em F1–F10 com a seleção padrão | o `make e2e` inteiro verde sem editar spec existente | `[DOC: ADR-050 F-7]` |
| RNF-2 | Sem lazy import por indicador | — | `[DOC: ADR-050/D5]`; reabre se um módulo passar de 20 KB gzip ou os desligados somarem ≥ 25% do chunk |
| RNF-3 | O chunk de cliente da rota não cresce por causa da refatoração | ±2% de **85.169 B** gzip, medido com a receita do estudo §3.4 | o número de base é `[DOC: ADR-050/D5]`; a tolerância é `[INFERRED: mover código não deveria mudar o bundle; 2% absorve o custo do catálogo e das definições]`. Dono: `/architect` |
| RNF-4 | Latência sem regressão | as specs 17 e 20 (tetos de latência) dentro do `make e2e` | `[DOC: frontend/e2e/17-*, 20-*]` |
| RNF-5 | O custo do remonte do host é **medido** na F9 | `performance.mark` em volta do mount, publicado em `data-*` | `[NÃO MEDIDO]` hoje `[DOC: estudo §3.3]`. O limiar é do `design_gate`, e só pesa quando o seletor existir (§14 `Q-5`) |
| RNF-6 | Toda fatia passa por `make verify` | os oito portões | `[DOC: CLAUDE.md, make verify]` |

---

## 8. Regras de negócio

| id | regra |
|---|---|
| RN-1 | **O núcleo não se desliga.** Vela, pane 0 (portadora da grade), eixo de tempo, crosshair e marcas de ausência existem com qualquer seleção, inclusive a vazia |
| RN-2 | **A ordem dos panes é a do catálogo**, e não a ordem em que os indicadores foram selecionados |
| RN-3 | **Um `kind` com `cardinality: "single"` tem no máximo uma instância.** O reducer recusa a segunda. Os 5 embutidos são `single`; `multi` existe para a SMA/EMA de `indicadores-smc` |
| RN-4 | **A seleção padrão tem os 5** (volume, OI, CVD, liquidação, long/short) — `O-1`. Mudar o padrão depois é trocar o *seed* do reducer |
| RN-5 | **Nenhum indicador importa outro.** O que dois precisam é núcleo (`chart/…`) ou geometria (`charts/`). **Não existe `indicators/_shared/`** `[DOC: ADR-050/D6]` |
| RN-6 | **Fatia de movimento não edita lógica.** Em F1 e F4–F7, o código movido só ganha `export`, linhas de `import` e o caminho que os testes leem |
| RN-7 | **`derive` é puro e tem uma implementação por indicador**, chamada pelo SSR e pelo pager |
| RN-8 | **"Carregar o selecionado" é montar e buscar só o ativo**, não dividir o bundle (RNF-2) |
| RN-9 | **Nenhuma spec de e2e existente é editada em F1–F10.** Spec nova pode entrar. Uma fatia que precise mudar asserção antiga mudou a tela e tem de declarar isso como mudança de comportamento, fora do escopo desta feature |
| RN-10 | **Remonte do host preserva a vista.** O mount lê `store.currentRange` quando ela existe, e não `initialLogicalRange` |
| RN-11 | **F1 em diante só depois da fase `05` de `paineis-de-fluxo` em `origin/master`.** Só a F0 corre antes |
| RN-12 | **O teste que lê o fonte muda de caminho na mesma fatia que move o bloco**, e vai para a pasta do dono do bloco |

---

## 9. Tipos e contratos críticos

| tipo | estado | dono |
|---|---|---|
| `IndicatorDefinition<Params, Data>` (`kind`, `category`, `cardinality`, `defaultParams`, `parseParams`, `placement`, `data`, `View`) | forma proposta em `ADR-050/D2` e estudo §2.2. **Nomes finais: `TBD` na F0** | `frontend-architect`, na F0 |
| `IndicatorBinding` (`mount`, `apply`, `unmount`, `measure?`, `scales?`, `layout?`) | forma em `ADR-050/D3`. Nomes finais `TBD` na F2 | `frontend-architect`, na F2 |
| `IndicatorKind` | `volume \| oi \| cvd \| liquidation \| long_short` nesta feature; `sma \| ema \| smc` entram por `indicadores-smc` | `frontend-architect` |
| `IndicatorInstance` e a lista do *store* | a forma é a da `SPEC-010 §6.1`, com `kind` estendido aos embutidos e `params = {}` neles. **A emenda é proposta, não feita** (estudo §8) | `/architect` de `indicadores-smc` |
| `OverlayBandRequest` (faixa reservada) | conta de margem em `charts`, junto de `paneScaleMargins`. `TBD` na F8 | `frontend-architect` (contrato) + `quant-architect` (`charts`, `Q16`) |
| `paneSetSignature(active)` | a chave do remonte do host. `TBD` na F9 | `frontend-architect` |

Todos os `TBD` têm a fatia como data. Nenhum bloqueia a F0 além do primeiro.

---

## 10. Critérios de aceite — testáveis, com a coluna "morde"

**O `DoD-VERTICAL` desta feature.** Ele pede, desde 2026-09-10, que cada fase chegue a um ponto na tela
`[DOC: MEMORY fatia-vertical-e-dod-vertical]`. Aqui nenhuma fase cria dado nem pixel novo, então os quatro itens viram
**não-regressão**: o e2e inteiro, em que **16 das 38** specs leem pixel ou screenshot (`11`, `15`, `23`–`25`, `28`–`38`)
`[MEDIDO 2026-10-02: grep -lE 'screenshot|getImageData|readPixels|toHaveScreenshot' frontend/e2e/*.spec.ts | wc -l]`, fica verde sem
que nenhuma spec seja editada. É o portão que o owner pediu.

| id | critério | como mede | morde (a ablação que tem de reprovar) | fatia |
|---|---|---|---|---|
| **CA-1** | **Tela idêntica** | `make verify` verde, com o `make e2e` inteiro, e `git diff --name-status <base>..<fatia> -- frontend/e2e/` sem nenhuma linha `M` nem `D` em spec que já existia na base | editar uma asserção antiga para passar ⇒ a linha `M` aparece ⇒ reprova. Mover um bloco e esquecer um `data-testid` ⇒ o e2e da coluna "e2e que mais mede" do estudo §5 cai | F1–F10 |
| **CA-2** | **Um indicador não importa outro** | sonda `indicators/oi/probe.ts` importando `../cvd/x.ts` por `import`, `import()` e `require` ⇒ `local/indicator-isolation` reprova nos três, no `make lint-frontend`. A mesma sonda importando `../../chart/marks/absence.ts` e `../contract.ts` ⇒ cala | apagar o caso de `require` da regra ⇒ a sonda por `require` passa ⇒ reprova. Trocar a regra por `no-restricted-imports` por pasta ⇒ as opções do barrel da `ADR-034/D8` somem (`eslint.config.mjs:242`) e a sonda do barrel deixa de morder ⇒ reprova | F0, e de novo em F4–F8 sobre a pasta nova |
| **CA-3** | **O núcleo não importa indicador** | sonda `chart/host/probe.ts` importando `../../indicators/oi/definition.ts` ⇒ a regra reprova | tirar `chart/**` do escopo da regra ⇒ cala ⇒ reprova | F0 |
| **CA-4** | **Nenhum diretório de topo fora do conjunto** | sonda `frontend/src/indicators/x.ts` ⇒ o teste de diretório de topo reprova | o teste comparar com uma lista lida do disco em vez da lista fixa ⇒ cala ⇒ reprova | F0 |
| **CA-5** | **`SymbolClient.tsx` com no máximo 350 linhas** | `wc -l frontend/src/app/symbol/SymbolClient.tsx` ≤ 350 ao fim da F9 (de 4.490 em `master` hoje) | — (número, medido no fim da F9; nas fatias anteriores é só registrado na PR) | F9 |
| **CA-6** | **O catálogo é o único importador das pastas de indicador** | `grep -rlE "from \"\.\./indicators/[a-z-]+/\|from \"\./[a-z-]+/definition" frontend/src/app/symbol --include='*.ts*'` lista **só** `indicators/catalog.ts` `[DOC: ADR-050 F-6]` | um `import` direto de `indicators/oi/` em `SymbolClient.tsx` ⇒ o grep lista dois arquivos ⇒ reprova | F9 |
| **CA-7** | **Adicionar um indicador não edita o núcleo** | (a) teste unitário: um `IndicatorDefinition` sintético, declarado no próprio arquivo de teste e passado num catálogo de teste, é montado e desmontado pelo host sem nenhum arquivo de `chart/**` mudar. (b) ensaio na F9, numa branch descartável: criar `indicators/probe/` com `definition.ts` e uma `View` mínima e acrescentar uma linha em `catalog.ts`; `git diff --name-only` lista só `indicators/probe/**` e `indicators/catalog.ts`, e `make lint-frontend` mais `make test-frontend` ficam verdes | o host ter um `switch` ou `if` sobre `kind` ⇒ o sintético não monta ⇒ (a) reprova. Um registro manual exigido em `chart/**` ⇒ o diff de (b) lista um arquivo do núcleo ⇒ reprova | F9 |
| **CA-8** | **O movimento é como está** | a receita do estudo §5: o multiconjunto de linhas de código, tirando `import`/`export`, é igual entre a base e a fatia (`diff` vazio) | qualquer edição de lógica escondida no movimento ⇒ o `diff` mostra a linha ⇒ reprova | F1, F4–F7 |
| **CA-9** | **Os varredores olham as subpastas** | `bucket-arithmetic-boundary.test.ts` varre `app/symbol/**` com recursão: a linha `Math.floor(ms / step) * step` plantada em `indicators/oi/probe.ts` ⇒ reprova. `data-fact-ascii-key-contract.test.ts` lê a árvore da rota e o total continua **47** em toda fatia | voltar o `readdirSync` sem recursão ⇒ a sonda dá `pass 5, fail 0` ⇒ reprova. Apagar um `data-fact` de um pane movido ⇒ a contagem cai para 46 ⇒ reprova | F0, e o 47 de novo em F1–F8 |
| **CA-10** | **`derive` único, SSR igual ao pager** | unitário por indicador: o `derive` dá o mesmo resultado sobre as mesmas linhas, chamado como SSR e como página do pager. O `grep` de duplicação do estudo §1.3 dá **0** linha comum entre `page.tsx` e `panel-assembly.ts` | reintroduzir uma derivação local em `page.tsx` ⇒ o grep volta a dar > 0 ⇒ reprova | F3–F8 |
| **CA-11** | **`unmount` limpa o que montou** | unitário do registrar: montar e desmontar um overlay 5 vezes deixa `chart.panes()[0].getSeries().length` igual ao inicial `[DOC: ADR-050 F-3]` | um `unmount` vazio ⇒ a contagem sobe 5 ⇒ reprova | F2, F8 |
| **CA-12** | **A seleção sobrevive ao remonte, e o host remonta sem perder a vista** | arrastar a vista, tirar o OI da seleção e devolvê-lo: o número de panes cai 1 e volta, a lista de camadas do `e2e/23` volta à ordem atual, e `data-visible-logical-from`/`-to` ficam a ±1 barra do valor de antes `[DOC: ADR-050 F-4]`. **Como a seleção é mudada sem UI está em aberto (§14 `Q-1`)** | o mount aplicar `initialLogicalRange` ⇒ a vista volta ao enquadramento inicial ⇒ reprova | F9 |
| **CA-13** | **A seleção padrão tem os 5** | unitário do reducer: o estado inicial tem exatamente as 5 instâncias embutidas, na ordem do catálogo. O `e2e/23` verde com a lista de camadas de hoje | tirar um do *seed* ⇒ o unitário e o `e2e/23` reprovam | F9 |
| **CA-14** | **O pager pede só o ativo** | spec nova: pedidos de história por página = séries dos ativos; com a seleção padrão, **10**, como hoje `[DOC: ADR-050/D5]`. Tirar o OI da seleção ⇒ o número cai na quantidade de séries do OI | o pager ignorar a seleção ⇒ continua 10 com o OI fora ⇒ reprova | F10 |
| **CA-15** | **Bundle sem regressão** | o chunk de cliente da rota, medido pela receita do estudo §3.4, fica a ±2% de 85.169 B gzip (RNF-3) | — (número; a tolerância é `[INFERRED]`, §12 `I-3`) | F9, F10 |

---

## 11. Non-goals — fora, com o motivo

| id | fora | motivo |
|---|---|---|
| **NG-1** | **A UI do seletor (tela A)** e qualquer controle na tela que ligue ou desligue um indicador | `O-2`: nasce na F1 de `indicadores-smc`. Aqui os 5 vêm injetados como selecionados |
| **NG-2** | Mudar o padrão de "os 5 ligados" | `O-1`. Trocar depois é uma constante |
| **NG-3** | Persistir a seleção (`localStorage`, cookie, servidor) | a `ADR-048` recusa a terceira fonte de verdade; no servidor ela é o conjunto ativo da F3 de `indicadores-smc` `[DOC: estudo §9, O-1 (c)]` |
| **NG-4** | SMA, EMA, SMC ou qualquer indicador novo | é `indicadores-smc`. Esta feature só deixa o caminho pronto |
| **NG-5** | Mudar forma, cor, escala ou legenda de qualquer pane | é refatoração sem mudança visível (RN-9) |
| **NG-6** | Lazy import por indicador | `ADR-050/D5`: economiza até ~4 KB gzip e quebra o registro antes do mount |
| **NG-7** | Reorganizar `src/charts/` (71 arquivos, prefixo `s2-`) | é do `quant-architect` (`Q16`) `[DOC: estudo §7]` |
| **NG-8** | `LiveRow` por indicador | o SSE não tem produtor (`ADR-048/D6`) `[DOC: estudo §7]` |
| **NG-9** | Pane dinâmico no lugar (`addPane`/`removePane`) | fica de reserva, se o `design_gate` recusar o remonte medido `[DOC: ADR-050, alternativas]` |
| **NG-10** | A F11 do estudo | é a UI do seletor (NG-1) |
| **NG-11** | Editar `ADR-048` ou `SPEC-010` | são de outra branch e outra sessão; o estudo §8 só propõe a emenda |

---

## 12. `[INFERRED]` e GAPs nomeados

| id | item | classe | dono |
|---|---|---|---|
| I-1 | `O-2` lido como "a UI sai desta feature; o mecanismo fica" | inferível, e a leitura é do orquestrador, não deste `/pm` (`DECISOES-OWNER.md`). A fala literal está em §1.1 para o owner conferir | owner (veta se a leitura estiver errada) |
| I-2 | O "~350" do despacho virou teto duro de **350** (CA-5) | inferível: é o número da `ADR-050/D1` | `/architect` |
| I-3 | Tolerância de ±2% no bundle (RNF-3, CA-15) | inferível, e o número não tem precedente no repositório | `/architect` propõe; owner ratifica |
| I-4 | A regra `core.relative-import` não alcança `.ts`/`.tsx` | `[MEDIDO 2026-10-02: harness rules --mode file --path frontend/src/app/symbol/SymbolClient.tsx → rc=0, com 190 imports relativos em app/symbol]`. As pastas novas podem usar import relativo, e é o que a regra de isolamento resolve | — |
| G-1 | **`ADR-050` está `proposta`.** Aceitar é gate do owner | **bloqueante do gate `spec`**, não deste PRD (§14 `Q-4`) | owner |
| G-2 | **A fase `05` de `paineis-de-fluxo` ainda não está em `origin/master`** e toca os mesmos arquivos | **bloqueante de F1+**, não de F0 (RN-11). Risco: quanto mais a fase `05` demorar, mais a F0 fica sozinha | orquestrador |

---

## 13. Menus

Nenhum menu novo. Os dois que a feature tinha (`O-1`, `O-2`) foram respondidos pelo owner em 2026-10-02 (§3).

---

## 14. Perguntas em Aberto — classificadas

| id | pergunta | classe | dono |
|---|---|---|---|
| **Q-1** | **Como o CA-12 (e o CA-14) muda a seleção sem UI?** `O-2` tira o seletor desta feature. Opções: (a) um *handle* de teste, ligado só no build de e2e, que despacha no reducer (há precedente: os parâmetros de ablação de e2e dentro de `SymbolClient.tsx`, `[DOC: handoff §2]`); (b) só unitário do reducer mais o host, e o e2e de desligar e religar passa para a F1 de `indicadores-smc`, junto do seletor. (b) deixa o remonte sem prova de pixel até lá | **BLOQUEANTE de F9** (só do critério) | `/architect` + `frontend-architect` |
| **Q-2** | **A F10 depende do *proxy* da `ADR-048/D8`**, que é de `indicadores-smc`. Se ele não estiver em vigor quando a F9 fechar, a F10 espera, ou passa para `indicadores-smc`? Com a seleção sempre igual aos 5, a F10 não economiza nenhum pedido até o seletor existir (CA-14 com o padrão = 10, como hoje) | **BLOQUEANTE de F10** | `/architect` desta feature com o de `indicadores-smc`; owner se mudar o escopo |
| **Q-3** | O corpo hasheado do `indicator_set` (`ADR-047`) inclui a visibilidade dos embutidos? Incluir faz o `setup_hash` mudar quando o OI é desligado | **NÃO-BLOQUEANTE aqui**: esta feature não grava `indicator_set`. Pesa em `indicadores-smc` | `/architect` de `indicadores-smc` |
| **Q-4** | `ADR-050` passa de `proposta` a aceita? | **BLOQUEANTE do gate `spec`** (a SPEC não se apoia em ADR proposta) | **owner** |
| **Q-5** | Qual o limiar aceitável do "piscar" no remonte do host? | **NÃO-BLOQUEANTE aqui**: sem seletor, o operador nunca dispara o remonte. A F9 só mede (RNF-5). O limiar é julgado quando o seletor nascer | `ui-designer` + `ux-ui-mastery` |
| **Q-6** | Quando o volume estiver desligado, a vela desce para ocupar a faixa reservada, ou não? | **NÃO-BLOQUEANTE aqui**: o volume nunca é desligado nesta feature | `ui-designer` `[DOC: estudo §2.2]` |
| **Q-7** | As emendas a `ADR-048/D3` e `SPEC-010` §6.1 e §8 propostas no estudo §8 | **NÃO-BLOQUEANTE aqui**; bloqueia o front de `indicadores-smc`, que começa depois da F9 | `/architect` de `indicadores-smc` |

---

## 15. Registro da varredura de discovery

| dimensão | estado | onde |
|---|---|---|
| stakeholders e consumidores | `[COBERTO: owner como mantenedor e operador; os agentes despachados em paralelo; indicadores-smc como consumidora da estrutura — §1.1, §4.2]` | §5 |
| volumetria e escala | `[COBERTO: M1–M3, M9, M11 — linhas, commits, testes, bundle]`. Dado de mercado não muda | §1.2 |
| não-funcionais (latência, frescor) | `[COBERTO: RNF-4 pelas specs 17 e 20]`; `[GAP: custo do remonte NÃO MEDIDO, medido na F9 — RNF-5, Q-5]`; `[GAP: tolerância do bundle INFERRED — I-3]` | §7.2 |
| estados e bordas (fora de ordem, duplicado, remoção, parcial, vazio) | `[COBERTO]`: fora de ordem (RN-2, a ordem é do catálogo); duplicado (RN-3, `single`); remoção (RF-10, CA-11, CA-12); vazio (RN-1, o núcleo fica); parcial = fatia no meio da migração, com a tela igual (RN-9, CA-1) | §8, §10 |
| contrato e dependências | `[COBERTO com TBD datado — §9]`; dependências da fase `05` (G-2) e da `ADR-048/D8` (Q-2) | §4.2, §9, §14 |
| métricas e observabilidade | `[COBERTO: CA-5 (wc -l), CA-6 (grep), CA-8 (diff), CA-15 (bundle)]`; o remonte publica `data-*` (RNF-5) | §10 |
| escopo e non-goals | `[COBERTO: F0–F10, 11 non-goals]` | §4, §11 |

**Perguntas levadas ao owner nesta rodada:** nenhuma diretamente. O `/pm` roda sem canal com o owner, e as duas perguntas do owner
(`O-1`, `O-2`) já estavam respondidas. **Nada crítico virou `[INFERRED]` silencioso:** a leitura de `O-2` (I-1) está nomeada com a
fala ao lado, e `Q-1`/`Q-2` saem classificadas como bloqueantes de fase.

---

## 16. Gate de handoff — conferido

- [x] cada story tem fronteira clara e cabe numa fase: 11 stories, uma por fatia (F0–F10), com as três de F5–F7 numa seção
- [x] regras bloqueantes endereçáveis: **8** regras `block` `[MEDIDO 2026-10-02: harness rules list --severity block → "total: 8"]`.
  Nenhuma conflita. `web-fullstack.browser-imports-server` já é a prática; `core.relative-import` não alcança o front (I-4)
- [x] tipos e contratos críticos definidos ou `TBD` com dono e fatia (§9)
- [x] non-goals escritos (§11)

**Gaps bloqueantes do PRD:** nenhum. Bloqueantes **de fase ou de gate:** `spec` (`Q-4`), F1+ (`G-2`), F9 (`Q-1`, só do critério),
F10 (`Q-2`).

**Próximo passo:** `/architect` (Gap Analysis) — handoff em
[`docs/context/estrutura-do-front/handoff_to_architect.md`](../context/estrutura-do-front/handoff_to_architect.md).
