# ADR-050 — Indicador é um módulo isolado em `app/symbol/indicators/<kind>/`; o gráfico tem um núcleo que não é indicador; o host monta o que o catálogo e a seleção ativam

**Data:** 2026-10-02 · **Status:** `proposta` (aceitar é gate do **owner**) · **Autor:** `frontend-architect`
**Feature:** `estrutura-do-front` (ledger `INIT`) · **Julgamento completo:** [`gates/FRONTEND-ARCH-estudo.md`](../context/estrutura-do-front/gates/FRONTEND-ARCH-estudo.md)
**Componente alvo:** `web`. A geometria nova (a faixa reservada por overlay) é de `charts` (`ADR-003/FR-2`).
**Não reabre:** `ADR-003` (fronteira), `ADR-034/D8` (o barrel, herdado pelas subpastas), `ADR-044` D1/D2/D2′ (um gráfico, grade
canônica, portadora), `ADR-005/D1` + `A4` (FastAPI é a única porta).
**Emenda proposta (não editada aqui):** `ADR-048/D3` e as Consequências dela; `SPEC-010` §6.1 e §8 (estudo, §8).
**Não decide:** a aparência do seletor nem o limiar de "piscar" do remonte (`ui-designer` + `ux-ui-mastery`); a organização interna
de `src/charts/` (`quant-architect`); o conjunto ligado por padrão (**owner**, `O-1`).

---

## Contexto — o pedido e o que o impede

O owner, literal `[PREMISSA-OWNER: 2026-10-02]`: *"Cada um deveria ser um item isolado que posso mexer sem gerar impactos e são
carregados a partir dos indicadores selecionados."*

Os quatro fatos que decidem a forma, todos medidos na `wave/paineis-f05` em `4b255da` (o estudo, §1, tem os comandos):

1. **`SymbolClient.tsx` tem 4.527 linhas**, e os 5 indicadores ocupam 2.561 delas. **52 dos 118 commits de front** desde 2026-09-01
   mexeram nele.
2. **O host fixa os panes no mount.** O número vem de `PANE_STACK`, o índice de `F1_PANE_ORDER`, e o registrar é um
   `Map<paneIndex>` sem `unmount`. A biblioteca suporta pane dinâmico (`addPane`/`removePane`, `typings.d.ts:1773-1792`). O limite
   está no host.
3. **A derivação por indicador existe duas vezes**, em `[symbol]/page.tsx` (SSR) e em `panel-assembly.ts` (pager): 39 linhas de
   código iguais depois de normalizar.
4. **Sem portão de isolamento.** Numa sonda de ESLint, um indicador importando outro **cala**, e um arquivo em `src/indicators/`
   importando o `charts` profundo **também cala**: o diretório escapa da `ADR-003/FR-2`.

O acoplamento **real** entre indicadores é 1 par em 5: o volume montado dentro do binding do `PricePane`. Os outros quatro são um alias
de tipo (`VolumeSlot`) e um formatador (`formatSpan`), ambos genéricos.

## Decisão

### D1 · Núcleo e indicador são duas coisas, em duas pastas

- **Núcleo** (`app/symbol/chart/`): a vela e o pane 0, que leva a portadora da grade; a `TimeAxis` e o `AxisSync`; o pager; o host e
  o registrar; o crosshair e o `LegendFrame`; as marcas de ausência e cobertura. **Não se desliga.**
- **Indicador** (`app/symbol/indicators/<kind>/`): volume, OI, CVD, liquidação, long/short e, depois, SMA, EMA e SMC. Cada pasta tem
  `definition.ts`, `data.ts`, o componente e os próprios testes.
- **`indicators/catalog.ts` é o único arquivo que importa as pastas de indicador.** A ordem do array é a ordem dos panes, e o catálogo
  substitui `F1_PANE_ORDER` e absorve `pane-registry.ts`: as invariantes (i)–(v) passam a valer sobre o catálogo **ativo**.
- `SymbolClient.tsx` só compõe o chrome, o host e `active.map(View)`, com teto de **350 linhas**. O chrome (`TimeframeBar`,
  `LiveRow`, `ChromeModeStamp`) vai para `app/symbol/chrome/`.

### D2 · Um contrato só, `IndicatorDefinition`, para os panes de hoje e para os overlays de amanhã

`kind` · `category` (`indicator` | `strategy`) · `cardinality` (`single` | `multi`) · `defaultParams` + `parseParams` · `placement`
(`pane` com `paneId` e `stretch` | `overlay` sobre o preço, com pedido de faixa opcional) · `data` (`series-history` com `series` +
`derive` **puro** | `indicator-endpoint` com `useData`, que é a `ADR-048/D5`) · `View`. A forma em TS está no estudo, §2.2.

- O `derive` puro é chamado **pelo SSR e pelo pager**. A duplicação do fato 3 deixa de poder existir.
- **A faixa reservada do overlay** é um pedido que o pane de preço soma, e a conta de margem é de `charts`. Hoje a vela reserva 22% do
  fundo para um volume que talvez nem esteja ligado.

### D3 · O host tem uma espécie de binding: chave de string, `placement` e `unmount` obrigatório

`IndicatorBinding = { mount, apply, unmount, measure?, scales?, layout? }`, registrado por `instanceKey`. O índice do pane é derivado
no mount: `0` para overlay no preço, e para os outros, `1 +` a posição entre os panes **ativos**, na ordem do catálogo. **O host
continua com o único laço de `setData`** (`T-01.10`). Isto **substitui** a "segunda espécie de binding" da `ADR-048/D3`, porque os panes
fixos e os overlays passam pelo mesmo registrar.

### D4 · A seleção vive no *store* da `ADR-048/D1`, e a mudança de conjunto de panes remonta só o host

- O *store* de `app/symbol/layout.tsx`, acima do `key` que remonta `SymbolClient`, guarda a lista de instâncias com os embutidos
  incluídos. O layout não remonta na navegação `[DOC: next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md:43]`.
- **Se o conjunto de panes muda, só o host remonta** (`key={paneSetSignature(active)}` no `<ChartHost>`), e o pager e o
  `AxisSyncProvider` sobrevivem. **O mount lê `store.currentRange` quando ele existe**, e não `initialLogicalRange`.
- **Se só um overlay muda, há `mount`/`unmount` no lugar.**
- **Durante a migração, o padrão é "todos ligados"**, que é a condição de tela idêntica. O padrão final é do owner (`O-1`).

### D5 · Sem lazy import por indicador

O maior indicador tem **3.973 B gzip**, ~4,7% do chunk da rota (**85.169 B gzip**). Os cinco somam ~15%, e a `lightweight-charts`
sozinha dá **60.617 B gzip** (~71%) `[MEDIDO: next build + terser/gzip por bloco, estudo §3.4]`. Adiar o código economizaria até
~4 KB e quebraria a ordem de registro antes do mount de que o host depende. **"Carregar o que está selecionado" significa montar e
buscar só o ativo, não dividir o bundle.** Hoje, **6 dos 10 fetches** por página são de indicador. **Gatilho para reabrir:** um módulo
de indicador acima de 20 KB gzip, ou indicadores desligados somando ≥ 25% do chunk da rota.

### D6 · O isolamento é portão: `local/indicator-isolation`, mais um teste de diretório de topo

- A regra local resolve o caminho de `import`, `export … from`, `import()` e `require`, e reprova estes casos:
  - `indicators/<a>/**` importando `indicators/<b>/**`, `catalog.ts` ou `selection/**`;
  - `chart/**` ou `chrome/**` importando `indicators/**`.
- **Não é `no-restricted-imports`.** Aquela regra casa a string e não o caminho, e no flat config **o último bloco substitui as opções**
  (`eslint.config.mjs:242`): um bloco por pasta apagaria em silêncio os padrões do barrel da `ADR-034/D8`.
- **Teste de cobertura:** todo diretório de topo de `src/` tem de estar em `{app, charts, components, features}`.
- Se dois indicadores precisam da mesma coisa, ela é núcleo (`chart/…`) ou geometria (`charts/`). **Não existe `indicators/_shared/`.**

### D7 · A migração vai em 12 fatias, movendo código como está, e os varredores se alargam antes

- **F0** (trilhos: contrato, regra, teste de diretório e alargamento de `bucket-arithmetic-boundary.test.ts` e de
  `data-fact-ascii-key-contract.test.ts`) **pode começar já**, porque não toca arquivo da wave.
- **F1** (núcleo para fora) → **F2** (registrar) → **F3** (dado por tabela) correm em série, depois que a fase `05` de
  `paineis-de-fluxo` chegar a `origin/master`.
- **F4** (CVD) é a piloto. **F5–F8** (OI, liquidação, long/short, volume como overlay) correm até 3 por vez.
- **F9** traz a seleção e o remonte.
- **F10** (fetch por seleção) depende da `ADR-048/D8`. **F11** é o seletor (gate de design e `O-2`).
- Toda fatia passa por `make verify` com o e2e inteiro, e a tabela do estudo (§5) nomeia as specs que medem cada uma.

## Alternativas recusadas, com o custo

| alternativa | por que não |
|---|---|
| `src/indicators/` (topo) | **cala** na fronteira `web`→`charts` (sonda, fato 4): os blocos do ESLint casam só `src/app/**` e `src/features/**` |
| `features/indicators/` | o ESLint reprova import de `charts` ali (`ADR-034/D8`, `P-3` da `ADR-048`) |
| pane no lugar (`addPane`/`removePane`) já na F9 | `removePane(i)` desloca todos os índices abaixo, e o host teria de re-chavear bindings, âncoras de portal e o `ResizeObserver` no código mais frágil do arquivo. **Fica de reserva**, se o `design_gate` recusar o remonte medido |
| remontar `SymbolClient` inteiro (seleção no `key` da rota) | o pager perde as páginas acumuladas e refaz o fetch de tudo, e a seleção teria de chegar ao servidor (URL ou cookie, que a `ADR-048/D2` recusa) |
| lazy import por indicador | D5: economiza ≤ ~4 KB gzip e quebra o registro antes do mount |
| `no-restricted-imports` por pasta | D6: substitui as opções do barrel em silêncio |
| `indicators/_shared/` | uma pasta sem dono, e o próximo arquivo de 4.000 linhas |
| duas espécies de binding (`ADR-048/D3` como está) | dois caminhos de mount e unmount no host, e o caminho do overlay só seria provado pela SMA, dentro de outra feature |
| refatorar e mover na mesma fatia | os 26 testes que leem o fonte por regex deixariam de distinguir "mudou o lugar" de "mudou o comportamento" |

## Falsificadores (morde / cala)

- **F-1 (D6).** Sonda `indicators/oi/probe.ts` importando `../cvd/x.ts`, por `import`, `import()` e `require` → `local/indicator-isolation`
  **morde** nos três. Importando `../../chart/marks/absence.ts` e `../contract.ts` → **cala**. Sonda `chart/host/probe.ts` importando
  `../../indicators/oi/definition.ts` → **morde**. Sonda `src/indicators/x.ts` → o teste de diretório de topo **morde**.
- **F-2 (D7).** Na F0, plantar uma aritmética proibida em `app/symbol/indicators/oi/probe.ts` → `bucket-arithmetic-boundary.test.ts`
  **morde**. Hoje ele **cala**: com a mesma linha `Math.floor(ms / step) * step` plantada na raiz e na subpasta, ele acusa só a
  da raiz, e com a da subpasta sozinha dá `pass 5, fail 0` (`readdirSync` sem recursão, `:40`) `[MEDIDO 2026-10-02, cópia da wave]`. Depois da F8, o
  `data-fact-ascii-key-contract.test.ts` continua contando **47** fatos na árvore da rota. **Morde:** apagar um `data-fact` de um pane
  movido faz a contagem cair para 46.
- **F-3 (D3).** Unitário do registrar: registrar e desregistrar um overlay 5 vezes deixa `chart.panes()[0].getSeries().length` igual ao
  inicial. **Morde:** um `unmount` vazio faz a contagem subir 5. É o F-3 da `ADR-048`, agora sobre o registrar único.
- **F-4 (D4).** e2e novo (F9): arrastar a vista, desligar o OI e religar. O número de panes cai 1 e volta, a lista de camadas do
  `e2e/23` volta à ordem atual, e `data-visible-logical-from`/`-to` ficam a ±1 barra do valor de antes. **Morde:** o mount aplicar
  `initialLogicalRange` faz a vista voltar ao enquadramento inicial.
- **F-5 (D2).** Unitário por indicador: o `derive` dá o mesmo resultado sobre as mesmas linhas, chamado como SSR e como página do
  pager. **Morde:** reintroduzir uma derivação local em `page.tsx`. O `grep` do estudo, §1.3, volta a dar > 0 linha comum.
- **F-6 (D1).** `wc -l frontend/src/app/symbol/SymbolClient.tsx` ≤ 350 ao fim da F9, e
  `grep -rlE "from \"\.\./indicators/[a-z-]+/|from \"\./[a-z-]+/definition" frontend/src/app/symbol --include='*.ts*'` lista só
  `indicators/catalog.ts`. **Morde:** um `import` direto de `indicators/oi/` em `SymbolClient.tsx`.
- **F-7 (D7, tela idêntica).** Em F1–F9, com a seleção padrão, o `make e2e` inteiro (39 specs) fica verde **sem editar nenhuma spec
  existente**. **Morde:** qualquer fatia que precise mudar uma asserção de spec antiga mudou a tela, e tem de declarar isso como mudança
  de comportamento.
- **F-8 (D7, movimento como está).** Nas fatias de movimento (F1, F4–F7), o multiconjunto de linhas de código, tirando
  `import`/`export`, se conserva entre a base e a fatia (receita no estudo, §5). **Morde:** qualquer edição de lógica escondida no
  movimento.

## Consequências

- A `indicadores-smc` passa a custar **0 linha** em `SymbolClient.tsx`. Cada indicador novo é uma pasta mais 1 linha em `catalog.ts`.
  O orçamento de ~60–80 linhas da `ADR-048` e a regra *"um editor de `SymbolClient.tsx` por vez"* (`SPEC-010 §8.3`) viram *"um
  editor de `chart/**` por vez"*.
- Dos 55 arquivos de teste de `app/symbol/`, **26 leem o fonte de `SymbolClient.tsx`** e mudam de caminho, na mesma fatia que move o
  bloco. **16 leem o fonte de `page.tsx`**, e a regex do predicado vira teste de valor sobre `definition.series`, o que é mais forte.
  Ninguém sai do portão: o `test:app` roda subpastas (sonda medida).
- **Fica aberto e não é meu:** se o corpo hasheado do `indicator_set` (`ADR-047`) inclui a visibilidade dos embutidos. Incluir faz o
  `setup_hash` mudar quando o OI é desligado.
- A F10 herda a dependência da `ADR-048/D8` (*proxy* de mesma origem). Sem ela, um indicador ligado depois do SSR não consegue buscar
  do navegador fora da VPS.
