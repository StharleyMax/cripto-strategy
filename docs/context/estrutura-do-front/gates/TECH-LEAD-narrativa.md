# `/tech-lead` — narrativa de review das tasks de `estrutura-do-front`

> **Estado:** aguardando aprovação do **owner**. Nada foi cardado no tracker (`jira`, `CST`), e o ledger **não** tem `approve tasks`.
> **Entrada:** [`SPEC-011`](../../../specs/SPEC-011-estrutura-do-front.md) · [plano `index.md` + `00_`..`09_`](../../../plans/SPEC-011-estrutura-do-front/index.md) ·
> [`ADR-050`](../../../adr/ADR-050-indicador-como-modulo-isolado-nucleo-do-grafico-e-catalogo-por-selecao.md) (aceita, `OWN-1 = (a)`) ·
> [`handoff/DECISOES-OWNER.md`](../handoff/DECISOES-OWNER.md)
> **Dado de máquina:** [`tasks.toml`](../tasks.toml). Este arquivo argumenta; aquele não.

## 1. Gate de entrada

| condição | medida | rótulo |
|---|---|---|
| estado do ledger | `harness pipeline state estrutura-do-front` → `SPEC_APPROVED`; último evento `dispatch tech-lead` (`2026-10-02T19:10:39Z`) | `[MEDIDO 2026-10-02]` |
| plano existe | `docs/plans/SPEC-011-estrutura-do-front/index.md` + 10 arquivos de fase | `[MEDIDO]` |
| tracker identificado | `harness policy --key tracker` → `{kind=jira, project=CST, board_id=36, parent_kind=Epic, child_kind=Tarefa}` | `[MEDIDO]` |
| componentes | `harness policy --key components` → 7 (`sentimento`, `charts`, `convergencia`, `backtest`, `web`, `docs`, `infra`) | `[MEDIDO]` |
| builder de `web` | `harness policy --key agents` → `by_component.web.builder = .claude/agents/frontend-builder.md` | `[MEDIDO]` |
| a wave que bloqueia F1+ (`G-2`) | `git log --oneline master..wave/paineis-f05 \| wc -l` → **30** commits à frente; `git merge-base --is-ancestor wave/paineis-f05 origin/master` → `rc=1` (não mergeada); `git diff --name-only master...wave/paineis-f05 -- frontend \| wc -l` → **47** | `[MEDIDO 2026-10-02 em eda7520]` |

A SPEC dizia 29 commits; hoje são 30. A wave andou, e a conclusão continua a mesma: só a F0 pode correr.

## 2. A quebra: 32 tasks em 10 fases

| fase | tasks | o que cada uma entrega | ordem dentro da fase |
|---|---|---|---|
| `00` trilhos | **3** | `T-00.1` contrato e tipos do núcleo (0.1, 0.1b) · `T-00.2` regra `local/indicator-isolation` com as 9 sondas + sonda do barrel (0.2) · `T-00.3` teste de diretório de topo + os 2 varredores alargados (0.3–0.5) | **as 3 em paralelo**: arquivos disjuntos |
| `01` núcleo para fora | **4** | `T-01.1` entrada (`G-2`) + números de base `L0`/`N_spec`/`N_fact`/`B0` (1.0) · `T-01.2` host, registrar, `PaneLayer`, `pane-stack`, `axis` → `chart/host/` e `chart/axis/` · `T-01.3` legenda, marcas, história → `chart/legend/`, `chart/marks/`, `chart/history/` · `T-01.4` chrome → `app/symbol/chrome/` + `frontend/README.md` (1.2, 1.4) | série: as três editam `SymbolClient.tsx` |
| `02` registrar por chave | **3** | `T-02.1` chave `instanceKey` + `unmount` obrigatório (`CA-11` sintético) · `T-02.2` `paneIndex` derivado · `T-02.3` `refeed` | série: todas em `chart/host/` |
| `03` dado por tabela | **3** | `T-03.1` caracterização SSR = pager, os 5 (**portão**: se diferir, para e vai ao owner, `Q-8`) · `T-03.2` `catalog.ts` como tabela + `page.tsx` lendo dela + testes de regex viram teste de valor · `T-03.3` pager e `panel-assembly.ts` recebem a tabela por parâmetro + `Record` por slot + spec nova dos 10 pedidos + `D_3` | série |
| `04` CVD piloto | **3** | `T-04.1` os genéricos compartilhados sobem ao núcleo (`formatSpan`, `VolumeSlot`) · `T-04.2` CVD para `indicators/cvd/` (movimento) · `T-04.3` `definition.ts` do CVD + `derive` único | série |
| `05` OI | **2** | `T-05.1` movimento · `T-05.2` `definition.ts` + `derive` único + ablações `?e2eOiLine`/`?e2eOiRegimeMarks` | série; fase paralela a 06–08 |
| `06` liquidação | **2** | `T-06.1` movimento · `T-06.2` `definition.ts` + `derive` (2 séries) + ablações | idem |
| `07` long/short | **2** | `T-07.1` movimento (pasta `long-short/`, `kind = long_short`) · `T-07.2` `definition.ts` + `derive` | idem |
| `08` volume overlay | **4** | `T-08.1` margem do pane 0 pela soma dos pedidos, em `charts/` · `T-08.2` `PricePane`/`ohlc.ts` → `chart/price/` e o pane 0 soma os pedidos · `T-08.3` `indicators/volume/` + `definition.ts` · `T-08.4` volume entra pelo registrar + `CA-11` com volume + `CA-10` global = 0 + `CA-15` | série; a **única** de 05–08 que edita `chart/**` |
| `09` seleção | **6** | `T-09.1` catálogo completo + `IndicatorKind` derivado · `T-09.2` reducer + provider (`CA-13`) · `T-09.3` `layout.tsx` + `SymbolClient` compõe por `active.map(View)` (`CA-5`) · `T-09.4` mount com `currentRange` + `data-host-mount-ms` + `data-pane0-series-count` · `T-09.5` handle de e2e + spec nova (`CA-12`, §6.5, `CA-11` real) · `T-09.6` ensaio `CA-7(b)` + números finais | `T-09.1` → {`T-09.2` → `T-09.3`} ∥ `T-09.4` → `T-09.5` → `T-09.6` |

Soma: 3 + 4 + 3 + 3 + 3 + 2 + 2 + 2 + 4 + 6 = **32** `[MEDIDO: harness tasks validate estrutura-do-front, §8]`.

**Tamanho.** O critério foi um builder fechar a task em menos de 150 turnos, contando a rodada de `make verify` (~354 s, em background). Por isso a regra da
casa é **uma fatia de movimento OU uma mudança de lógica por task, nunca as duas**. É o que separa `T-0N.1` (movimento) de `T-0N.2` (definição + `derive`) em
F4–F7. O `CA-8` só é limpo se o movimento não carrega lógica, e uma task que fizesse as duas coisas teria um `diff` do multiconjunto que ninguém lê.
`[INFERRED: o teto é do CLAUDE.md, R6; a estimativa de turnos por task NÃO foi medida]`.

## 3. Decisões do tech-lead (o owner pode vetar qualquer uma)

**D-TL-1 · Os genéricos compartilhados sobem ao núcleo na F4 (`T-04.1`), não "na fatia que chegar primeiro".** O plano 07 item 7.2 deixa `formatSpan` para
"a fatia que chegar primeiro entre F5 e F7", e o item 8.4 move `VolumeSlot` na F8. Com F5–F8 em paralelo, isso dá três problemas:
1. *quem chega primeiro* é uma corrida, e não dá para escrever DoD sobre corrida;
2. a regra do plano é **um editor de `chart/**` por vez**, e a F8 já o é. Uma subida para `chart/legend/` dentro de F5 ou F7 seria um segundo editor;
3. `VolumeSlot` é tipo de `SymbolClient.tsx:213` usado por **6** linhas do arquivo `[MEDIDO: grep -n 'VolumeSlot\b' frontend/src/app/symbol/SymbolClient.tsx]`,
   e os panes de CVD, OI, liquidação e long/short o consomem. Sem ele no núcleo antes da F4, a `T-04.2` não tem de onde importá-lo sem cair na P3.

`T-04.1` é movimento puro (`CA-8` vazio), em fase serial, antes da fan-out. As tasks `T-07.1` e `T-08.4` só **verificam** que o import já vem do núcleo.
Se a F1 já tiver levado `formatSpan` junto da legenda (ele mora em `SymbolClient.tsx:2234`, ao lado do texto de frescor), a `T-04.1` registra isso e fecha só
com `VolumeSlot`.

**D-TL-2 · Os componentes seguem o plano, e não "só `web`".** O despacho pediu `web`. Mantive `web` em 30 das 32 e segui o plano nas duas que ele marca diferente:
- `T-01.4` = `[web][docs]`: leva o `frontend/README.md` (plano 01, 1.4, componente `docs`), que a F0 não podia tocar;
- `T-08.1` = `[charts]`: edita só `frontend/src/charts/pane-stack-layout.ts` (plano 08, 8.1, `ADR-003/FR-2`). Tirar `charts` daí apagaria o `design_gate` e o
  `architect` (`quant-architect`) que a política liga a esse caminho (`harness policy --key agents`), e quem perderia o sinal seria o portão de design.

O builder é o `frontend-builder` nas 32, `charts` inclusive: `by_component.charts` não declara builder, e o arquivo está sob `frontend/`, que é o escopo dele.

**D-TL-3 · A dependência de `G-2` vai em `refs`, não em `depends_on`.** `depends_on` liga ids **deste** documento. A condição de `G-2`/`G-K` é de outra feature e
de outro arquivo: a PR da `wave/paineis-f05` em `origin/master` **e** `T-05.1`, `T-05.4`, `T-05.5` com `status = "done"` no `tasks.toml` de `paineis-de-fluxo`
em `origin/master`. Toda task de F1 a F9 carrega a linha `G-2` em `refs`, e a `T-01.1` a **mede** como primeiro ato (comando no DoD dela). Como F2–F9
dependem transitivamente da `T-01.1`, nenhuma começa antes. A linha está nas 29 mesmo assim, para quem despachar uma task fora de ordem.

**D-TL-4 · Paralelismo dentro da F9.** `T-09.4` (mount do host) toca `chart/host/` e não depende do reducer, então corre ao lado de `T-09.2`/`T-09.3`.
`T-09.5` espera as duas pontas, porque a spec nova usa o handle **e** os atributos de mount.

**D-TL-5 · F0 em três tasks paralelas.** Arquivos disjuntos: `T-00.1` só cria arquivos de tipo, `T-00.2` mexe em `eslint-rules/` e `eslint.config.mjs`,
`T-00.3` mexe nos 2 varredores e cria um teste. Nenhuma das três toca os 47 arquivos da wave. É a wave que pode começar já.

## 4. A ordem, e o teto de 3 simultâneas

```
F0:  T-00.1 ∥ T-00.2 ∥ T-00.3                         ← JÁ (paralela à fase 05 de paineis-de-fluxo)
         │  ── G-2: merge de wave/paineis-f05 + T-05.1/.4/.5 done ──
F1:  T-01.1 → T-01.2 → T-01.3 → T-01.4
F2:  T-02.1 → T-02.2 → T-02.3
F3:  T-03.1 (⛔ Q-8) → T-03.2 → T-03.3
F4:  T-04.1 → T-04.2 → T-04.3
F5–F8 (no máximo 3 cadeias ao mesmo tempo):
     C5 T-05.1 → T-05.2      C6 T-06.1 → T-06.2
     C7 T-07.1 → T-07.2      C8 T-08.1 → T-08.2 → T-08.3 → T-08.4   (único editor de chart/**)
F9:  T-09.1 → {T-09.2 → T-09.3} ∥ T-09.4 → T-09.5 → T-09.6
```

**Recomendação de despacho da fan-out:** C8 + C5 + C6 primeiro, porque a C8 é a mais longa (4 tasks) e começá-la cedo encurta o caminho crítico. A C7 entra
quando a primeira das outras fechar. O teto é 3 `[DOC: MEMORY orquestracao-3-paralelas-worktree]`, e ele vale **por task simultânea**, não por fase. Conflito
esperado entre as irmãs: 1 linha cada em `catalog.ts` e blocos disjuntos de `SymbolClient.tsx` (plano 05, Fronteira), que o `git` funde.

Wave = fase, com uma exceção: F5–F8 são **quatro fases numa wave**, que fecha quando as quatro cadeias fecham.

## 5. O que toda task declara (e o validador não confere: quem confere é o QA)

| campo em `refs` | conteúdo |
|---|---|
| `agente:` | `frontend-builder` |
| `e2e:` | `make e2e` inteiro verde, dentro de `make verify`, **e** `git diff --name-status $BASE..HEAD -- frontend/e2e/` sem `M` nem `D` em spec que existia em `$BASE` (`DoD-2`, `RN-9`); mais as specs que medem primeiro, da fase |
| `numstat:` | `git diff --numstat $BASE..HEAD -- frontend/` gravado no relatório da task e na PR, com o que se espera dele: em movimento, cada arquivo movido aparece com `+N` do lado novo e `−N` do lado velho, e o portão é o `CA-8` vazio; em diff declarado, cada linha do numstat é explicada |
| `ablação:` | a mutação que tem de reprovar o critério da task (`DoD-3`) |
| `G-2:` | de F1 a F9 |
| `paralelo:` | só onde existe |

`$BASE` é `git merge-base HEAD origin/master` no início da task. Os números `L0`, `N_spec`, `N_fact` e `B0` são os da `T-01.1`, e toda task de F1 a F9 registra
`wc -l frontend/src/app/symbol/SymbolClient.tsx` e `B` (receita `SPEC-011 §7.4`). Em fatia de movimento, `|ΔB| > 1%` pede explicação na PR.

## 6. Tracker: nada cardado, e isso é âmbar, não decisão

`tracker.kind = jira`. **Nenhuma das 32 tasks tem `tracker` nem `local_only`.** O motivo é a ordem do fluxo: card só nasce **depois** da aprovação desta
narrativa, e quem me despachou é um agente, cuja mensagem não é aprovação do owner. `local_only` seria errado, porque ninguém decidiu **não** cardar. O
`untracked_note` do `tasks.toml` diz isto.

Depois do `approve tasks`: 10 Epics (um por fase) e 32 Tarefas filhas em `CST` (board 36), com `tracker` inline em cada task. Se o conector Atlassian estiver
fora nessa hora, as tasks ficam sem marcação e o cadastro é manual, registrado no `untracked_note` com data.

## 7. O que o owner aprova

1. As **32 tasks** e o corte movimento/lógica (§2).
2. `D-TL-1`: `formatSpan` e `VolumeSlot` sobem na F4 (`T-04.1`), e não "na fatia que chegar primeiro". Alternativa: manter o plano. Custo: corrida entre F5
   e F7 e um segundo editor de `chart/**` durante a fan-out.
3. `D-TL-2`: `T-08.1` como `[charts]` e `T-01.4` como `[web][docs]`. Alternativa: tudo `[web]`. Custo: o `design_gate` de `charts` não vê a mudança da margem.
4. A fan-out com C8 + C5 + C6 primeiro (§4).

Com a aprovação: `harness pipeline approve estrutura-do-front tasks "<motivo>"`, os cards no Jira, `advance TASKS_APPROVED`, e então o gate **`build`, do owner**.

## 8. Riscos que a quebra não remove

- **`Q-8` na `T-03.1`.** Se a caracterização achar a derivação do SSR diferente da do pager, a F3 para e o caso vai ao owner. É mudança de comportamento, fora
  do `RN-9`. F4–F9 ficam bloqueadas até a resposta.
- **F1 é a maior.** `SymbolClient.tsx` tem 4.490 linhas `[MEDIDO 2026-10-02 em eda7520, SPEC-011 §8]` e mais depois da wave. Se a `T-01.2` ou a `T-01.3`
  passar de 150 turnos, o builder escreve o handoff em `docs/context/estrutura-do-front/handoff/<TASK>.md` e devolve. Não se divide a task no meio do caminho.
- **Escopo compartilhado com `paineis-de-fluxo`.** Declarei 10 prefixos (`harness pipeline scope estrutura-do-front list`), entre eles os novos
  `app/symbol/indicators`, `app/symbol/chart` e `app/symbol/chrome`, e os compartilhados `app/symbol`, `charts` e `e2e`. Hoje
  `harness pipeline require-code frontend/src/app/symbol/indicators/contract.ts` responde *"permitido — feature `paineis-de-fluxo` (scope)"* `[MEDIDO
  2026-10-02]`, porque só feature autorizada conta e esta ainda não está em `BUILD_AUTHORIZED`. Depois do gate `build`, as duas features vivas disputam o
  prefixo `frontend/src/app/symbol`. **Como o portão decide essa disputa entre duas vivas, eu não medi** `[NÃO MEDIDO]`. Quem despachar a F0 confere com o mesmo
  comando antes.

## 9. Adendo 2026-10-03: `T-00.4`, os dois specs e2e instáveis

`[DECISÃO-OWNER: 2026-10-03, escolha entre alternativas apresentadas]`: no menu do orquestrador, o owner escolheu a opção **"Task curta antes da F1"**.
Os specs instáveis `e2e/18` e `e2e/20` são consertados **nesta** feature, embora nenhum dos dois tenha nascido nela (`e2e/18` veio de `T-03.11`,
`e2e/20` de `T-05.9` de `candle-real-e-eixo-unico`, conforme `gates/W-F0-e2e-instavel.md`). O rótulo é este, e não `[PREMISSA-OWNER]`, porque o owner
escolheu uma opção e não ditou a frase.

A task é a **`T-00.4`**, componente `web`, `frontend-builder`, sem dependência e sem bloquear a F1. É a única task da feature com exceção declarada ao
`DoD-2`: ela tem `M` em duas specs que já existiam (`18` e `20`) e em nenhuma outra. O DoD separa os dois achados porque eles são diferentes:

- **A2** (`e2e/18:232`) é uma corrida contra a grade de 5 min do `knowledgeTimeMs`. Fica provada por um teste que força a travessia da fronteira e passa.
- **A1** (`e2e/20:728`) é o outlier de 1.053 ms com a suíte rodando sozinha. O diagnóstico vem **antes** de qualquer mexida no teto, e o teto só sobe com
  número e motivo.
- **N = 10** rodadas sequenciais de `make e2e` inteiro sem vermelho nos dois specs. O motivo do 10 está nos `refs` da task.

Tracker: a `T-00.4` fica **sem `tracker` e sem `local_only`**, no mesmo âmbar das outras 32 (§6). Ninguém decidiu não cardar.
