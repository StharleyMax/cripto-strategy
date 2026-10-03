# Gap Analysis do `PRD-011` · `estrutura-do-front` — `/architect`, ciclo 1

**Data:** 2026-10-02 · **Base:** worktree `estrutura-do-front`, branch `docs/estrutura-do-front` em `975621a` (árvore limpa; o código
de `frontend/` é o de `master` `eda7520`)
**Ledger ao começar:** `PRD_DRAFT`, `dispatch architect` às 18:50:47Z `[MEDIDO 2026-10-02: harness pipeline show estrutura-do-front]`
**Entrada lida:** `PRD-011` (409 linhas), `handoff_to_architect.md`, `handoff/DECISOES-OWNER.md`, `ADR-050` (proposta),
`gates/FRONTEND-ARCH-estudo.md` §2–§9. Da branch `docs/indicadores-smc-refinamento` (só leitura, `git show`): `ADR-048` D1/D3/D8 e
Consequências, `SPEC-010` §6.1 e §8, `plans/SPEC-010-indicadores-smc/01_seletor_e_sma.md`. Da `wave/paineis-f05` (só leitura): o diff
contra `master` e o `tasks.toml` da fase `05`.

## Veredito: `[READY FOR SPEC]`

**Nenhum gap bloqueante para o PRD.** Achei **18** gaps. **6 são defeitos ou contradições reais** que o PRD não nomeou (`G-A` a
`G-E` e `G-R`), e um deles é um critério que **cala sobre a ablação que ele mesmo descreve** (`G-A`). Os seis têm resolução de
arquitetura que não muda requisito do owner, e por isso não voltam ao `/pm`. As três perguntas que o PRD me passou (`Q-1`, `Q-2`, `I-3`)
estão decididas em `G-F`, `G-G` e `G-H`. Os outros 9 são inferíveis ou não-bloqueantes, e cada um tem a suposição registrada na
`SPEC-011`.

O que bloqueia **não é o PRD**: é o gate `spec`, que depende de o owner aceitar a `ADR-050` (`Q-4`, `SPEC-011 §13`), e a F1, que espera a
fase `05` de `paineis-de-fluxo` em `origin/master` (`G-K`).

---

## 1. Defeitos e contradições (os que o PRD não viu)

### `G-A` · O `CA-6` cala sobre a ablação que ele nomeia

- O `CA-6` mede com `grep -rlE "from \"\.\./indicators/[a-z-]+/|from \"\./[a-z-]+/definition"`, e diz que **morde** quando houver
  *"um `import` direto de `indicators/oi/` em `SymbolClient.tsx`"*.
- `SymbolClient.tsx` mora em `app/symbol/`, ao lado de `indicators/`. O import dele é `./indicators/oi/…`, que a primeira alternativa
  não casa (pede `../`) e a segunda também não (pede **um** segmento antes de `/definition`).
  `[MEDIDO 2026-10-02: as linhas 'from "./indicators/oi/definition"' e 'from "./indicators/oi/OiPane"' num arquivo de sonda no
  scratchpad → o grep do CA-6 casa 0 de 2; casa só 'from "./oi/definition"', que é o próprio catalog.ts]`.
- A causa de fundo: a tabela de dependências do estudo (§4.2) proíbe `SymbolClient.tsx`, `page.tsx` e `layout.tsx` → `indicators/<kind>/**`,
  mas o `RF-6` só leva para a regra as linhas `indicators → indicators` e `chart/chrome → indicators`. A linha que falta foi para um grep, e o
  grep é cego para ela.
- **Classe: não-bloqueante, decisão do `/architect`.** **Resolução** (`SPEC-011 §5.3`): a `local/indicator-isolation` ganha a terceira linha,
  *"fora de `indicators/<kind>/`, só `indicators/catalog.ts` importa `indicators/<kind>/**`"*. O `CA-6` vira sonda de lint, entregue já na
  F0: `app/symbol/probe.ts` importando `./indicators/oi/definition` **morde**; `indicators/catalog.ts` importando `./oi/definition` **cala**.

### `G-B` · `IndicatorKind` fechado em `contract.ts` contradiz o `CA-7` ("adicionar = uma pasta e uma linha")

- `PRD §9` declara `IndicatorKind = volume | oi | cvd | liquidation | long_short` como união, no contrato. O `CA-7 (b)` exige que criar
  `indicators/probe/` e acrescentar uma linha em `catalog.ts` dê um `git diff --name-only` com **só** esses dois caminhos.
- Com a união em `contract.ts`, o `kind: "probe"` não compila sem editar `contract.ts`. **O `CA-7 (b)` reprova por construção.**
- **Classe: não-bloqueante.** **Resolução** (`SPEC-011 §4.1`): `IndicatorDefinition` é genérico em `K extends string`, e a união
  `IndicatorKind` é **derivada do catálogo** (`(typeof INDICATOR_CATALOG)[number]["kind"]`), em `catalog.ts`. A linha nova no catálogo
  estende a união sozinha.

### `G-C` · A F4 une a derivação do CVD, e o `RN-6`/`CA-8` dizem que a F4 não edita lógica

- A story F4 diz *"mais o `derive` que une `page.tsx` e `panel-assembly.ts` para o CVD"*. O `RN-6` diz que F1 e F4–F7 só ganham
  `export`, `import` e caminho de teste, e o `CA-8` exige que o multiconjunto de linhas se conserve. Apagar a cópia de `page.tsx` tira linhas
  do multiconjunto, e o `diff` do `CA-8` não fica vazio. Além disso, a `definition.ts` é código novo, não movido.
- E as duas cópias **não são iguais em texto**: o estudo conta 39 linhas iguais *"depois de normalizar"* (`janela→W, rows→R, instante→T`)
  `[DOC: estudo §1.3]`. Escolher uma e apagar a outra pode mudar o SSR, se elas diferirem em semântica.
- **Classe: não-bloqueante.** **Resolução** (`SPEC-011 §7.2`): o universo do `CA-8` fica fixado. Na base: `SymbolClient.tsx`, `view-model.ts`,
  `panel-assembly.ts` e os auxiliares movidos inteiros. Na fatia: os mesmos mais os arquivos novos, **menos `definition.ts`**. `page.tsx` fica
  **fora** do `CA-8` e é coberto pelo `CA-10`. E a F3 escreve, antes de qualquer unificação, um **teste de caracterização** por indicador: a
  derivação do SSR e a do pager, chamadas sobre as mesmas linhas, dão o mesmo resultado. Se derem diferente, é defeito de hoje, e vai
  para o owner como mudança de comportamento. Não se unifica em silêncio.

### `G-D` · O `CA-10` pede "grep = 0 linha comum" desde a F3, e a unificação só acontece de F4 a F8

- O `CA-10` lista as fatias F3–F8 com *"o `grep` de duplicação do estudo §1.3 dá **0**"*. Na F3 nenhum indicador foi unificado ainda (a
  unificação é por indicador, F4–F8). **O critério reprova a F3 por construção.**
- **Resolução** (`SPEC-011 §7.3`): o `CA-10` passa a ter duas partes. **Por indicador**, na fatia que o move: o unitário SSR = pager. **Global**:
  a contagem de linhas comuns do grep do estudo **não sobe** de uma fatia para a seguinte e chega a **0 ao fim da F8**.

### `G-E` · `ADR-048/D3` tem `refeed(key)`, e o `IndicatorBinding` da `ADR-050/D3` não tem

- `ADR-048/D3`: o binding de overlay tem *"um `refeed(key)` para dado que chega fora de página"*. É o caminho da média, que a `R-1` busca fora do
  `Promise.all` do pager (`ADR-048/D5`). `ADR-050/D3`: `{ mount, apply, unmount, measure?, scales?, layout? }`, **sem `refeed`**.
- **Por que importa.** A emenda proposta pelo estudo §8 promete à `indicadores-smc` um orçamento de **0 linha em `chart/**`**. Sem `refeed` no
  registrar, a primeira média (`data.from = "indicator-endpoint"`) obriga a editar o host, e a promessa é falsa.
- **Classe: não-bloqueante.** **Resolução** (`SPEC-011 §4.2`): o registrar da F2 expõe `refeed(instanceKey)`, provado por um unitário com um
  indicador sintético de `indicator-endpoint`. Nenhum dos 5 embutidos o usa.

### `G-R` · O `RF-1` põe `IndicatorBinding` em `contract.ts`, e a tabela de dependências proíbe o núcleo de importar `contract.ts`

> ⚠️ **Achado ao escrever a `SPEC-011`, depois do `approve prd`.** O evento do ledger (19:00:13Z) diz *"17 gaps, 5 defeitos"*; o número certo é
> **18 e 6**. O evento é append-only e fica como está; esta nota é a correção. Não muda o veredito: o gap é não-bloqueante.

- `RF-1`: *"`contract.ts` com `IndicatorDefinition`, `Placement`, `DataSource` e `IndicatorBinding`"*. O estudo §4.2 e a P2 da regra: `chart/**` → `indicators/**`
  (inclusive `contract.ts`) é **proibido**. O registrar mora em `chart/host/` e precisa do tipo do binding. O pager mora em `chart/history/` e precisa da lista de
  séries por indicador, que no desenho do estudo §3.1 sai do catálogo.
- **Como está escrito, o núcleo não tem como tipar o que recebe, nem de onde ler a tabela, sem violar a P2.** O estudo já punha o binding em
  `chart/host/registrar.ts` (§2.3); o PRD o moveu para o contrato.
- **Classe: não-bloqueante.** **Resolução** (`SPEC-011 §3`, `§4.2`): os tipos que o núcleo consome são do núcleo (`chart/host/`, `chart/history/`), e
  `contract.ts` os reusa. O núcleo recebe as definições **por parâmetro**, de `SymbolClient.tsx` e `page.tsx`, que podem importar o catálogo. A P2 é quem prova.

---

## 2. As três perguntas que o PRD passou ao `/architect`

### `G-F` · `Q-1` — como o e2e muda a seleção sem UI: **handle de teste em tempo de execução, ligado por parâmetro de URL**

Decisão em `SPEC-011 §6.4`. Em resumo:
- **Precedente medido:** o código de produção já lê **7** parâmetros de ablação `?e2e…` em **3** arquivos (`e2eAxisSyncDisabled`, `e2eDenseSeries`,
  `e2eLiquidationLogScale`, `e2eOiLine`, `e2eOiRegimeMarks`, `e2ePageApplyBusyMs`, `e2eSwapLiquidationSides`)
  `[MEDIDO 2026-10-02: grep -rhoE '"e2e[A-Za-z]+"' frontend/src --include='*.ts*' | grep -v test | sort -u]`. São lidos em tempo de execução, no
  **mesmo build** que vai para produção. Não existe "build de e2e".
- O `CA-12` precisa mudar a seleção **no meio da sessão** (arrastar, tirar o OI, devolver). Um parâmetro lido só no mount não basta. Por isso a
  forma é a de um **handle**: com `?e2eIndicatorSelection=1` na carga, o provider da seleção publica um objeto em `window` que **despacha as mesmas
  ações do reducer** que o seletor vai despachar. Sem o parâmetro, o objeto não existe.
- **Recusei a opção (b)** do PRD (só unitário, e o e2e vai para a F1 de `indicadores-smc`). O custo dela é o `RN-10` (o remonte preserva a vista)
  ficar sem prova em pixel durante 10 fatias, e o defeito que o `F-4` da `ADR-050` descreve (o mount aplicar `initialLogicalRange`) só aparecer em
  outra feature. É a lição de `qa-frontend-exige-playwright-contra-app-real` e de `assert-de-dom-nao-prova-pixel` `[DOC: MEMORY]`.
- **Recusei** um build separado de e2e (`NEXT_PUBLIC_*`): o e2e passaria a medir um artefato que não é o de produção.

### `G-G` · `Q-2` — a F10 **não se justifica sem o seletor**: sai do escopo

Decisão em `SPEC-011 §6.5`. Em resumo:
- Com a seleção sempre igual aos 5, a F10 economiza **0 pedido** (`CA-14` com o padrão dá 10, como hoje) `[DOC: PRD-011 §14 Q-2]`.
- O único caminho novo que ela cria, buscar do navegador a janela de um indicador religado, **depende da `ADR-048/D8`** (o proxy), que é de outra
  feature e ainda é proposta.
- **E não precisa existir para a F9 ser correta.** Se o pager continua buscando as séries de **todo o catálogo**, ativo ou não, um indicador
  religado encontra o dado já carregado, e o religamento é só `mount`. A F9 fica correta, sem rede nova e sem depender da `D8`.
- **Escopo reduzido: F0–F9, 10 fatias.** `RF-11` e `CA-14` vão como emenda proposta à `SPEC-010` (§10 da SPEC), para entrar junto do seletor,
  que é o primeiro momento em que algum indicador fica desligado. **O owner pode vetar** (menu `OWN-1 (b)`).

### `G-H` · `I-3` — a tolerância do bundle: **teto unilateral de +4%, sobre a base re-medida no início da F1**

Decisão em `SPEC-011 §7.4`. Os números:
- O build é **determinístico**: duas compilações da mesma árvore dão o mesmo nome de chunk e os mesmos bytes
  `[MEDIDO 2026-10-02 em eda7520: rm -rf .next && npx next build, n=2 → 3-xbgfken_tpm.js, 268.929 B, 84.577 B com gzip -c]`. **O ruído é 0 B.**
  A tolerância não precisa absorver ruído, só o código novo.
- O chunk da rota é **um módulo só**: `"use strict"` aparece **1** vez nele, contra **31** arquivos de produção em `app/symbol/`
  `[MEDIDO 2026-10-02: grep -o '"use strict"' <chunk> | wc -l; ls frontend/src/app/symbol/*.ts* | grep -v test | wc -l]`. O empacotador junta os
  módulos, então **dividir em arquivos custa ~0 B**. O que cresce é o código novo (catálogo, 5 definições, reducer, provider, handle, assinatura,
  registrar por chave, pedido de faixa).
- **Estimativa do crescimento:** ~230 linhas de código executável novo × ~35 B minificado × 0,314 de razão gzip (84.577 / 268.929, medida)
  ≈ **2,5 KB gzip, ~3,0%** `[INFERRED: contagem de linhas pelo §4.1 do estudo; o B/linha é estimativa, NÃO MEDIDO]`. O `±2%` do PRD reprovaria uma
  refatoração correta. O teto fica em **+4%** (a estimativa mais ~1/3 de folga) e é **só para cima**: encolher não é regressão.
- **A base não é a do PRD.** Os 85.169 B são da `wave/paineis-f05` `[DOC: estudo §3.4]`, e `master` dá 84.577 B. A base `B0` é medida no commit em
  que a F1 começa, depois do merge da fase `05`.

---

## 3. Inferíveis e não-bloqueantes, com a suposição registrada

| id | gap | classe | resolução | onde |
|---|---|---|---|---|
| `G-I` | Os números de base mudam com a fase `05`: `SymbolClient.tsx` 4.490 → 4.527, specs 38 → 39, o bundle e possivelmente os 47 `data-fact` | inferível | a SPEC fixa a **receita**, não o número. `N_fact`, `N_spec`, `B0` e `L0` são medidos no commit-base da F1 e gravados na PR da F1 | `SPEC-011 §8` |
| `G-J` | O `RF-7` (diretório de topo de `src/`) e o `frontend/src/proxy.ts` que a `ADR-048/D8` cria | inferível | o teste cobre **diretórios**. Arquivo no topo de `src/` fica fora do universo. Hoje `ls frontend/src` = 4 diretórios, 0 arquivos `[MEDIDO 2026-10-02]` | `SPEC-011 §5.4` |
| `G-K` | O `RN-11` diz *"fase `05` em `origin/master`"* sem dizer como se mede | inferível | a condição da `SPEC-010 §8.1`, mais a `T-05.5`: a PR da wave mergeada **e** `T-05.1`, `T-05.4` e `T-05.5` com `status = "done"` no `tasks.toml` de `origin/master`. Hoje as 5 tasks da fase estão `todo` no `tasks.toml` da wave, que está 29 commits à frente de `master` `[MEDIDO 2026-10-02: git log --oneline master..wave/paineis-f05 \| wc -l]` | `SPEC-011 §9` |
| `G-L` | O `DoD-VERTICAL` vira não-regressão | inferível, com precedente | *"Nas fases que não criam dado, é não-regressão"* `[DOC: docs/plans/SPEC-009-paineis-de-fluxo/index.md, DoD-1]`. Mantido | `SPEC-011 §7.1` |
| `G-M` | A F0 *"não toca arquivo da wave"*, e a wave edita `frontend/README.md`, onde caberia documentar a regra | inferível | a F0 não edita `frontend/README.md`. A regra se documenta no docstring dela. A F1 atualiza o README | `plano 00` |
| `G-N` | Alargar o `bucket-arithmetic-boundary.test.ts` põe `[symbol]/page.tsx` no universo pela primeira vez | não-bloqueante | `page.tsx` tem **0** linhas que casam 5 dos 6 padrões, em `master` e na wave `[MEDIDO 2026-10-02: grep -cE sobre os padrões das linhas 97–112 do teste]`. O sexto (divisor de 6 dígitos) não foi reproduzido em grep. O DoD da F0 roda o teste inteiro | `plano 00` |
| `G-O` | O `RN-3` diz que o reducer **recusa** a segunda instância de um `single`, mas não diz o que a recusa devolve | inferível | a recusa é **no-op**: o reducer devolve o **mesmo** estado (mesma referência) e não lança. O handle de e2e devolve `false` | `SPEC-011 §6.2` |
| `G-P` | O `RN-2` (ordem = catálogo) não amarra o catálogo à ordem de hoje | inferível | as entradas de `placement: pane` seguem `F1_PANE_ORDER` sem o `price`: `liquidation, oi, long_short, cvd` `[DOC: pane-registry.ts:73]`. O volume é o único overlay | `SPEC-011 §6.1` |
| `G-Q` | O `CA-11` pede `chart.panes()[0].getSeries().length` num **unitário**, e na F2 ainda não existe overlay | não-bloqueante | o unitário cria o gráfico real sob `jsdom`, como já fazem **8** arquivos de teste `[MEDIDO 2026-10-02: grep -rlE 'createChart\(' frontend/src --include='*.test.ts' \| wc -l]`, com um overlay **sintético**. Na F9, o handle permite repetir o ciclo no e2e, com o volume | `SPEC-011 §7.3` |

E dois registros sem gap: o `I-2` (teto **duro** de 350 linhas no `CA-5`) fica aceito, porque é o número da `ADR-050/D1` e o estudo põe o que
sobra (cabeçalho 209 + composição) abaixo dele `[DOC: estudo Apêndice A]`. E o `RN-10` tem base no código: `currentRange` é um `TimeRange` em
milissegundos, independente do eixo `[DOC: frontend/src/app/symbol/axis-sync.ts:64-66]`, e por isso sobrevive ao remonte do host.

---

## 4. Regras em vigor

`harness rules list` → **11** regras, nenhuma alcança o desenho de um jeito que conflite. A `web-fullstack.hardcoded-url` (aviso) é a que o handle de
e2e poderia acordar, e ele não carrega URL. O idioma segue a tabela do `CLAUDE.md`: pastas e arquivos novos em inglês, o parâmetro de URL
`e2eIndicatorSelection` em inglês (linha 12), e `long_short` fica como chave de `data-testid` (o estudo §4.1 já registra).

## 5. Ciclos com o `/pm`

**0.** Nenhum gap volta ao produto. Os `[INFERRED]` estão na `SPEC-011` com o motivo, e o owner os vê no gate `spec`.

## 6. Próximo passo

`approve prd` e `advance PRD_VALIDATED` no ledger, depois a `SPEC-011` (`DRAFT`). O gate `spec` é do owner, e depende de ele aceitar a `ADR-050`
com as emendas (`SPEC-011 §13`, `OWN-1`).
