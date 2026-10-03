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

## 10. Adendo 2026-10-03: fase `10`, a pirâmide de testes (28 tasks)

> O §9 (a `T-00.4`) vive só na branch `origin/task/T-00.E2E` até o merge dela. Este §10 foi escrito na branch `docs/piramide-de-testes`, e os dois
> acrescentam texto no fim deste arquivo: **o merge das duas branches vai dar conflito textual aqui**, que se resolve mantendo §9 antes de §10.

### 10.1 Origem e gate de entrada

`[PREMISSA-OWNER: 2026-10-03]`, depois da análise: *"apos a analise já pode iniciar os ajustes e melhorias, daí pode entrar nessa memsa feature atual"*.
A feature atual é `estrutura-do-front`, e a fase entra pelo mesmo caminho da `T-00.4`.

- **Estado:** `harness pipeline state estrutura-do-front` → `BUILD_AUTHORIZED` `[MEDIDO 2026-10-03]`, e não `SPEC_APPROVED`. É adendo a uma quebra já
  aprovada, como o §9. **A fala do owner autoriza começar; ela não aprova estas 28 tasks**, que ele não viu. Leitura minha `[INFERRED]`: o owner intervém por
  exceção, e esta narrativa é o lugar onde ele pode vetar.
- **Fontes:** `docs/context/piramide-de-testes/gates/{E2E,UNIT-FRONT,BACKEND}-analise.md`, no commit `5bc99643`. As tasks citam arquivo e seção, sem colar.
- **Plano:** o validador exige `docs/plans/SPEC-011-estrutura-do-front/10_*.md` (`V-24`, 28 ERROR sem ele `[MEDIDO]`). Escrevi
  [`10_piramide_de_testes.md`](../../../plans/SPEC-011-estrutura-do-front/10_piramide_de_testes.md) como **plano-índice**: aponta para as três análises e
  não decide nada. Plano é artefato do `/architect`. Se ele quiser reescrevê-lo, as tasks não mudam. Não acrescentei a fase `10` ao `index.md` do plano.

### 10.2 A quebra

| grupo | tasks | o quê |
|---|---|---|
| **A**, mecânico, sem mexer em asserção | `T-10.1` sonos fixos · `T-10.2` skip antes da montagem (15, 21, 30, 39) · `T-10.3` instrumento do 38 · `T-10.4` instrumento do 35 · `T-10.5` lint só dos probes plantados · `T-10.6` fixture sintética do `s2-cvd` · `T-10.7` cache do oráculo do `oi_candles` | 7 |
| **P**, as pendências das análises PARCIAIS (só medição) | `T-10.8` rodada 2 do front: os 41 MORDE em memória, R01–R04 por teste e o par `axis-fidelity` · `T-10.9` as 195 funções de backend com 0 linha, e os 2 pares de BACKEND §7.4 | 2 |
| **B**, fusões e descidas | front unitário: `T-10.10` constantes, `ABSENCE_TOKEN` e `MOVED_OUT_FILES` · `T-10.11` padrão de render e piloto · `T-10.12` CVD · `T-10.13` OI · `T-10.14` liquidação e long/short · `T-10.15` os 9 restantes · `T-10.16` `s2-axis-integration` × `axis-fidelity`. e2e: `T-10.17` /console → 01 · `T-10.18` /symbol → 09 · `T-10.19` liquidação → 35/23 · `T-10.20` 17 e 22 → 20 · `T-10.21` 26 → 18 · `T-10.22` 16 → 27 · `T-10.23` montagem compartilhada em 24/41/42 · `T-10.24` descidas parciais 28/34/37/40. backend: `T-10.25` G6–G8 · `T-10.26` G5 | 17 |
| **C**, cortes | `T-10.27` e2e 31, 36, 33 (d)+(e) · `T-10.28` backend G1–G4 | 2 |

Total: 28. Com as 32 deste branch, o validador conta 60 `[MEDIDO: harness tasks validate estrutura-do-front → 60 task(s), 0 ERROR, 0 WARN]`. Com a
`T-00.4` depois do merge, serão 61.

**Toda task carrega DoD, ablação e e2e, no formato da `T-00.4`, mais três regras fixadas no cabeçalho da fase no `tasks.toml`:** `REGRA-M` (a mordida
de cada teste que sai, provada depois da mudança; sem mordida ele fica), `REGRA-T` (tempo antes e depois do mesmo comando, sozinho na máquina; ganho não
medido não fecha a task) e `REGRA-X` (exceção ao `DoD-2`, só nos specs que a task nomeia).

### 10.3 Dependências críticas

1. **F3 a F8 passam a esperar a reescrita dos contratos de fonte.** Cada fatia de movimento quebrou 15, 20 e 13 arquivos desses (`T-01.2/3/4`, UNIT-FRONT
   §4). Acrescentei ao `depends_on`: `T-03.1` ← `T-10.10` + `T-10.11`; `T-04.2` ← `T-10.12`; `T-05.1` ← `T-10.13`; `T-06.1` e `T-07.1` ← `T-10.14`;
   `T-08.3` ← `T-10.15`. **O caminho crítico da feature cresce:** a F3 agora espera `T-10.8` → `T-10.10` → `T-10.11`, além da F2.
2. **A reescrita espera a F2.** `T-10.10` depende de `T-02.3`, porque as constantes que ela exporta moram em `chart/host/pane-stack.ts` e em
   `SymbolClient.tsx`, que a F2 edita. Nenhuma task da fase `10` toca `chart/host/` antes disso. Conferi contra os `refs` de `T-02.1`..`T-02.3`.
3. **`T-00.4` está em outra branch.** `T-10.20` (o 20) e `T-10.21` (o 18) dependem dela, mas o validador recusa a dependência:
   `V-13 dependencia orfa: 'T-00.4' nao existe neste arquivo` `[MEDIDO 2026-10-03, com o depends_on posto e retirado]`. A dependência ficou nos `refs`
   das duas, com ⛔, e o `depends_on` ganha `"T-00.4"` no merge. Quem despacha confere antes.
4. **O e2e é uma cadeia serial**, porque só roda um e2e por vez (`e2e.lock`). `T-10.1` abre a cadeia, e as de e2e que mexem nos mesmos specs dependem dela.
   A `T-10.21` (18 e 26, sem sono fixo) não depende. O unitário do front e o backend correm ao lado.
5. **Os cortes vêm depois das fusões da mesma camada** (`T-10.27` ← `T-10.3`, `T-10.19`, `T-10.24`; `T-10.28` ← `T-10.25`, `T-10.26`). A mordida de um
   corte é provada contra a suíte já fundida. Se fosse antes, a prova valeria para uma suíte que vai deixar de existir.

Pode começar já, ao lado da F2: `T-10.1`, `T-10.5`, `T-10.6`, `T-10.7`, `T-10.8`, `T-10.9`, `T-10.25`, `T-10.26`, respeitando o teto de 3 simultâneas.

### 10.4 Decisões do tech-lead (o owner pode vetar qualquer uma)

- **`D-TL-10.1`, a F8 também espera (`T-08.3` ← `T-10.15`).** O handoff pedia F3–F7. A F8 move o volume, e `volume-subaxis-dom-contract` quebraria do
  mesmo jeito. Alternativa: não declarar. Custo: a F8 re-aponta regex, como as fatias da F1 fizeram.
- **`D-TL-10.2`, os 20 contratos de âncora em 5 tasks, uma por pane que a fatia move**, para que cada fase espere só a sua. Alternativa: uma task só.
  Custo: a F3 esperaria os 20.
- **`D-TL-10.3`, o padrão de render é decidido pelo `frontend-architect`, numa consulta obrigatória dentro de `T-10.11`.** O agente da task continua sendo
  o `frontend-builder`, como pedido. Motivo: é padrão novo de teste (UNIT-FRONT §6 item 5), e o builder não decide estrutura.
- **`D-TL-10.4`, o 21 entra na `T-10.2` (skip), e não numa task de descida.** A descida dele é decidir `readerPresent` antes dos arrastos, que é o mesmo
  mecanismo de E2E §6.1.
- **`D-TL-10.5`, a instância Next secundária como fixture de worker (E2E §6.3, item 3) NÃO virou task.** O custo por boot não foi medido (`≤ ~40 s`
  `[NÃO MEDIDO por boot]`), e ela toca 21 specs que as fusões estão mudando. Volta a ser candidata depois do grupo B, quando sobram ~21 chamadas.
- **`D-TL-10.6`, o laço do 33 (`:423-427`) não adota o instrumento novo nesta fase.** O ganho não foi somado (E2E §6.4), e o 33 perde (d)+(e) em `T-10.27`.
- **O que muda nas tasks já aprovadas, e quem muda.** As fusões removem specs que o `DoD-1` do cabeçalho (`08`–`14`) e o "Medem primeiro" de
  `T-01.2`..`T-09.5` citam. Cada task de fusão entrega o de-para spec antigo → spec novo. **O re-apontamento é do `/tech-lead`, depois do merge**, e não do
  builder.
- **Discrepância no handoff:** ele cita "UNIT-FRONT §8" para os contratos-âncora. A análise não tem §8. O conteúdo está em §4 (classes) e §6 item 5, e é
  isso que as tasks citam.

### 10.5 Escopo: o que o orquestrador acrescenta

Os 10 prefixos de hoje não cobrem o teste de backend nem o `fingerprint-sync-boundary`. Hoje nenhuma feature **viva** reivindica esses caminhos:
`harness pipeline require-code <caminho>` responde *"nenhuma feature VIVA reivindica"* para os cinco que testei, e só citou features encerradas
`[MEDIDO 2026-10-03]`. `plataforma-dados` é a outra feature autorizada, e o escopo dela é só `docs/context/plataforma-dados` `[MEDIDO]`. Os caminhos
exatos, um por arquivo, para não reivindicar diretório inteiro:

```
harness pipeline scope estrutura-do-front add \
  frontend/src/features/s1-console/fingerprint-sync-boundary.test.ts \
  backend/tests/sentimento/test_oi_candles_route_invariants.py \
  backend/tests/sentimento/test_series_catalog_use_case.py \
  backend/tests/sentimento/test_series_row_wire_run_id_envelope.py \
  backend/tests/sentimento/test_clock_skew.py \
  backend/tests/api/test_series_history_route.py \
  backend/tests/backtest/test_bundle_hash_determinism_qa.py \
  backend/tests/backtest/test_bundle_hash.py \
  backend/tests/charts/test_panel_bar_progress.py \
  backend/tests/charts/test_field_identity.py
```

`T-10.8` e `T-10.9` não escrevem no repositório fora do relatório, então não precisam de prefixo. Se `T-10.9` propuser cortes, a task nova traz o
prefixo dela.

### 10.6 Tracker

Igual ao §6: as 28 ficam **sem `tracker` e sem `local_only`**, no âmbar. Ninguém decidiu não cardar. Não mexi no `untracked_note` porque a branch
`task/T-00.E2E` muda a mesma linha, e os dois merges dariam conflito. **Quem fizer o segundo merge reescreve a nota com o total (61) e a data.**

### 10.7 Pendências do owner, fora da fase 10

| # | pendência | custo de cada lado |
|---|---|---|
| `P-1` | **`workers > 1` no Playwright** (E2E §1.3) | **ligar:** hipótese de ~305 s contra 551 s `[NÃO MEDIDO]`, com um projeto serial para {01, 02, 20, 21, 25, 40}. Com o swap a ~94 %, a inflação por contenção é provável, os specs de teto de latência reprovam sob carga (o 20 deu 917,5 ms contra ≤ 100 ms) e 01/02 contam incrementos num `api.log` compartilhado. **Não ligar:** o e2e fica serial, e o ganho desta fase (~247–272 s `[INFERIDO]`) é o único |
| `P-2` | **o código de `charts/` e `backtest/` do backend que a produção não importa** (BACKEND §3 G11) | **aposentar:** saem 24 arquivos e 183 testes, que inflam a cobertura de 96,92 % com código que nada executa em produção. Perde-se o motor de backtest e o S4 (T-08.x, CST-72..80). **Manter:** custo de suíte e de leitura, e regras de render que o front implementa por conta própria em TS. A decisão é sobre o código, não sobre os testes |
| `P-3` | **os loaders de CSV do front que só teste usa** (UNIT-FRONT §3: `s2-klines-loader`, `s2-oi-loader`, `s2-fixture-window` e o parse de aggTrades de `s2-cvd`) | **aposentar:** ~25 s de CPU de teste sobre código fora do produto. `T-10.6` e `T-10.16` se fecham pelo corte. **Manter:** como harness de dado real, e as duas tasks seguem |

### 10.8 Ganho esperado, e o que ele ainda não é

e2e ~247–272 s de 550,9 s `[INFERIDO, E2E §4.2]`; unitário do front ~45–50 s de 86,6 s `[INFERRED, UNIT-FRONT §1]`; backend ~50 s do portão
`[MEDIDO no protótipo, INFERRED na versão final, BACKEND §2]`. **Nenhum desses números fecha task.** Fecha a medição antes/depois que a `REGRA-T` manda
fazer em cada uma.
