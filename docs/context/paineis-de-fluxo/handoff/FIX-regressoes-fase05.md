# FIX — as 3 regressões da fase 05 de `candle-real-e-eixo-unico`, corrigidas dentro da F1

**Autor:** `frontend-architect` (`web.architect` desde `A6`) · **Data:** 2026-09-24 · **Base:** `d1f8984` (`wave/paineis-f01`)
**Origem:** `handoff/DECISOES-DO-OWNER-2026-09-24.md` **D-1** `[DECISÃO-OWNER: 2026-09-24, escolha entre alternativas
apresentadas]` · diagnóstico: `gates/DIAG-e2e-master.md` §2–§5 (bisect, `n` e comando de cada número estão lá).
**Não julga:** interação, legibilidade e motion (`design_gate`), nem a fidelidade do dado (`quant-architect`).

## 0. Veredito

| e2e | defeito (DIAG) | escolha | vira | falsificador |
|---|---|---|---|---|
| `18:107`, `18:153` | TF bar inerte: o pager lê o seed uma vez só (`use-history-pager.ts:199-200`), e `<SymbolClient>` não tem `key` (`[symbol]/page.tsx:967`). Desde `718cb1a` | **opção 1 do DIAG §5.1: `key` com a identidade do seed** | task **`T-01.F1`** (independente da F1) | `e2e/18` verde, **e** a mutação que tira `interval` da chave o reprova |
| `16:204` | eco atrasado de painel não-origem reescreve o Preço no meio do arrasto dele. Desde `48d47e5` | **nenhum conserto sobre o código de 6 charts.** Fica obsoleto por construção com a `T-01.5` | critério de aceite da **`T-01.5`** (unitário) e da **`T-01.8`** (e2e) | `e2e/16` re-ancorado verde, **e** a ablação "o dispatcher escreve na origem" o reprova |
| `20:383` | **(a)** instrumento soma a pausa do driver entre gestos · **(b)** o remonte por página descarta o resto do arrasto (24/24 gestos) | (a) só teste, **opção do DIAG §5.3**. (b) **host sobrevive à página** (opção A, §4.2) | (a) task **`T-01.F2`** · (b) critério de aceite da **`T-01.5`**, provado na **`T-01.8`** | (a) a asserção nova reprova **hoje** (24/24) · (b) a mesma asserção verde depois da `T-01.8`, **e** a ablação que devolve `axisSync` às deps do host a reprova |

## 1. A pergunta obrigatória: a `T-01.5` torna `16` e/ou `20` obsoletos por construção?

**`16`: SIM, por construção.** O defeito exige um **painel não-origem** que a store tenha escrito e cujo eco
chegue atrasado (`range-dispatch.ts:178-186` escreve em `index !== originIndex`, e o eco volta pelo
`subscribeVisibleLogicalRangeChange` do painel escrito). Com um `createChart` e `panelCount = 1`
(plano 01 item 1.3; `ADR-044/D1`), o laço de `range-dispatch.ts:179` **não tem índice para escrever**: os 6 panes
dividem **uma** `timeScale` da biblioteca e se movem juntos sem despacho nenhum. Sem escrita, não há eco. E sem eco
não há candidato atrasado. O que sobrevive da classe de defeito (*"eco atrasado tomado por candidato novo"*) passa
para o caminho da **página**, e é coberto pelo `rebase` de §4.3. Por isso não vira task: consertar o guard de
contador (`48d47e5`) sobre 6 charts seria escrever código que a própria `T-01.5` apaga.

**`20`: NÃO por construção, e é esta a resposta que importa.** O remonte não vem de haver 6 charts. Ele vem de o
ciclo de vida do chart estar amarrado à identidade do `axis`: `AxisSyncProvider` recria a store em `useMemo([axis])`
(`axis-sync-provider.tsx:86`), e o host depende dela (`SymbolClient.tsx:640`, deps `[containerRef, panelIndex,
axisSync]`). Cada página alarga a janela, o que gera um `axis` novo, uma store nova, `chart.remove()` e um
`createChart` novo. **Um chart único com as mesmas deps remonta igual e descarta o arrasto igual**: é 1 chart em vez
de 6, e o gesto morre do mesmo jeito. O spike confirma que o remonte por página continuou lá
(`gates/T-01.0-spike.md` §6.2: *"o gráfico remonta a cada página de história"*).

**E ainda assim vira critério da `T-01.5`, não task separada**, pelos motivos abaixo:
1. o conserto é **o mesmo efeito que a `T-01.5` reescreve** (o hook vira host, plano 01 item 1.3). Uma task
   separada reescreveria o host duas vezes, que é o mesmo argumento de `ARQ-1-julgamento` §8 (c): *"se F1 fixar o
   ciclo de vida 'axis novo ⇒ `setData` no chart existente, sem remontar', a Perna 2 herda o contrato pronto"*;
2. as duas seriam **editoras de `SymbolClient.tsx`**, e a R-D já as serializa. Separar não compra paralelismo.

## 2. `18` — `key` com a identidade do seed (`T-01.F1`)

**Escolha: opção 1 do DIAG §5.1.** A chave é `symbol · interval · knowledgeTimeMs`, e sai de uma função pura
num módulo `.ts` com teste `node --test`. **Recusada: opção 2 (resetar o estado dentro de `useHistoryPager`).**

| | opção 1: `key` | opção 2: reset no hook |
|---|---|---|
| estado que precisa voltar ao zero | todo, por construção (o React descarta a instância) | 5 `useState` + 6 refs + `inFlightRef` enumerados à mão. Esquecer um é o próximo `718cb1a` |
| **página em voo do TF antigo** | resolve sobre a instância desmontada. O `setState` vira no-op, e **as refs são de outra instância** | resolve **depois** do reset e funde linhas do TF antigo na janela do TF novo (o `fetchPage` capturou o `seed.interval` velho) `[INFERRED: leitura de use-history-pager.ts:227-347]` |
| arquivos | `[symbol]/page.tsx` + módulo puro novo | `use-history-pager.ts`, que a `T-01.5` também edita (conflito no mesmo lote) |
| custo | a troca de TF remonta o gráfico. É o custo da carga direta de `?interval=4h`, que o usuário já paga hoje | nenhum remonte |

**Por que `knowledgeTimeMs` entra na chave:** `ADR-005/D1`, *"o cache É o knowledge_time"*. O seed documenta que o
instante é **fixo pela vida inteira do mount** (`use-history-pager.ts:118-122`). Um render de servidor com instante
novo é outro seed, e o pager não pode fundir páginas de dois `knowledge_time`. **Por que `symbol` entra:** a
mesma rota dinâmica reaproveita o componente entre `/symbol/A` e `/symbol/B` `[INFERRED: semântica de reconciliação
do React para o mesmo tipo na mesma posição]`.

**Escopo fechado:** a `T-01.F1` **não edita** `SymbolClient.tsx` nem `use-history-pager.ts`. Isso é o que a deixa
correr no mesmo lote da `T-01.5` sem violar a R-D.

**Falsificador:** (i) `e2e/18:107` e `18:153` verdes. (ii) `DIAG-e2e-master-tf-stale.spec.ts.txt` mostra **24**
velas depois do clique em `4h`, igual à carga direta (hoje mostra 4583). (iii) **Morde:** tirar `interval` da chave
reprova `18:107`, e o teste unitário da função reprova quando dois seeds de TF diferente dão a mesma chave. (iv)
**Cala:** dois renders com o mesmo `symbol`, `interval` e `knowledgeTimeMs` dão a mesma chave.

**Relação com `ADR-043` Perna 2:** ela troca **quem produz** o seed (`pushState` no cliente em vez de ida e volta
RSC). A chave continua sendo a identidade do seed. A Perna 2 herda a chave, não a desfaz.

## 3. `16` — obsoleto por construção (critério da `T-01.5` e da `T-01.8`)

- **`T-01.5`:** `range-dispatch.test.ts` ganha dois casos. (a) Com `panelCount = 1`, nenhum gesto produz escrita.
  (b) A origem nunca é escrita. **Morde:** tirar o `continue` de `index === originIndex`
  (`range-dispatch.ts:180-184`) faz (b) reprovar, e essa é a forma do defeito de `16`, reproduzida sem 6 charts.
- **`T-01.8`:** o `e2e/16` re-ancorado prova que o **Preço não recebe escrita do dispatcher durante o próprio
  arrasto** (`data-axis-sync-write-count` do host continua em 0 no gesto), com a mesma ablação. O *lockstep* de 6
  `data-visible-logical-from` perde o sentido, porque passa a ser uma `timeScale` só. O que prova "um eixo" é o
  `CA-2′` por pixel, na `T-01.9`.
- **Por que não consertar antes, no código de 6 charts:** o `master` só recebe a W1 inteira, no fim da fase
  (`PLANO-DE-PARALELISMO.md` §4). Um conserto intermediário nunca chegaria ao usuário antes de a `T-01.5` o apagar.

## 4. `20` — o instrumento (`T-01.F2`) e o código (critério da `T-01.5`)

### 4.1 O instrumento, só teste (`T-01.F2`)

1. O intervalo entre aplicações de eixo passa a ser medido **só dentro de `[moveStart, moveEnd]` de cada gesto**,
   como em `DIAG-e2e-master-20-intra-inter.spec.ts.txt`. O teto continua **160 ms**. O DIAG mediu **0** intervalos
   intra-gesto acima de 160 em 3/3 rodadas (max 66,5–82,6 ms, `n = 243` por rodada) e **10** entre gestos.
2. **Asserção nova, que tem de reprovar hoje:** em todo gesto que teve página desenhada **enquanto o mouse ainda se
   movia**, o range do Preço, **em tempo** (`data-window-start-ms` + `data-visible-logical-from` × passo da grade,
   lidos no mesmo callback), assume **≥ 2 valores distintos depois da página**. Hoje dá **24/24 gestos parados**
   (DIAG §4). O vermelho que resulta é o honesto. Tem de ser em tempo, e não em índice lógico, porque, sem
   remonte, uma página que acrescenta `k` barras à esquerda desloca o índice lógico em `+k` sem mover a vista.
3. O salto de tempo **na fronteira da página** (a última amostra antes contra a primeira depois) fica registrado
   como `fact`, **sem asserção**. O limiar depende do código que ainda não existe, e quem o calibra e o transforma
   em asserção com ablação é a `T-01.8`.
4. **A baseline de `e2e/20` da `T-01.1` é inválida para a composição**: `axis_max_interval_during_paging_ms`
   550,4–583,9 ms mediu a pausa do driver (`gates/T-01.1-baseline.md` §3). A latência borda→desenho (`≤ 400 ms`)
   não é afetada. **A `T-01.10` refaz a baseline com o instrumento da `T-01.F2`** sobre o código de 6 charts
   (merge-base da W1 + o spec da `T-01.F2`, 5 rodadas, lote solo), antes de medir o `HEAD`.

### 4.2 O código: as três saídas, e a escolhida

| | saída | custo | veredito |
|---|---|---|---|
| **A** | **o host sobrevive à página**: a página vira `setData` nas séries existentes mais o `rebase` da store (§4.3), sem `chart.remove()` | mexe no contrato de ciclo de vida que `T-05.2` desenhou (`D-C3.5`: *"o range sobrevive ao remonte"* deixa de precisar de remonte) | **escolhida** |
| B | religar o gesto no chart novo | a captura de ponteiro morre com o canvas removido, e a biblioteca não expõe API para injetar um arrasto em curso `[INFERRED: superfície pública de lightweight-charts v5]` | recusada |
| C | adiar a aplicação da página até o `pointerup` | a latência borda→desenho cresce o que faltar do gesto (147–616 ms no DIAG §4), e o teto de 400 ms (`DECISÃO-OWNER 2026-09-19`) provavelmente cai | **reserva**: só se A reprovar no falsificador, e com escalonamento ao owner pelo teto |

**Premissa de A, rotulada:** a `timeScale` da biblioteca ancora a vista na **borda direita** (`rightOffset` a partir
da última barra), então acrescentar barras **à esquerda** não move a vista nem um arrasto em curso
`[INFERRED: modelo da timeScale da lib + exemplo oficial "Infinite history"; NÃO MEDIDO neste repositório]`.
**O risco nomeado (`[NÃO SEI]`):** `widenAndCapWindow` corta a **borda direita** quando a janela passa de
`DEFAULT_MAX_ACCUMULATED_SLOTS = 5_000` (`history-page-window.ts:37,78-86`), e a carga inicial de `1m` já tem
**5.760** slots (`gates/DIAG-e2e-master.md` §2). Então **a primeira página já corta a direita**, e a última barra
muda. Com âncora à direita, isso **move a vista**, e o próximo `scrollTo` do arrasto parte do estado do início do
gesto. Se o falsificador morder aqui, o remédio é **adiar o corte da borda direita até o fim do gesto**, prependendo
já e cortando no `pointerup`. A escolha do mecanismo é do builder. **O falsificador é o mesmo.**

### 4.3 O contrato que a `T-01.5` implementa

1. **Uma store por mount**, e não por `axis`. `AxisSyncProvider` deixa de recriar a store em `useMemo([axis])`. A
   store ganha `rebase(axis)`, que troca o eixo das conversões **e preserva `state` em milissegundos**. O estado já
   é `TimeRange`, independente de eixo (`axis-sync.ts:186-191`).
2. **O host monta uma vez por identidade de seed.** A troca de identidade é a `key` da `T-01.F1`. O efeito de
   montagem **não** depende da identidade da store nem do `axis`. Em `data-chart-mount-count`, na raiz do host, o
   contador sobe a cada `createChart`.
3. **Chegada de página:** `holdApplying()`, depois `setData` em todas as séries sobre a grade nova, depois
   `rebase(axis novo)`, e a liberação no próximo rAF. É o mesmo padrão de liberação de `T-05-FIX`
   (`SymbolClient.tsx:583-587`). O host **não escreve** `initialRange`/`preservedRange` na `timeScale` no caminho
   de página, porque o range de quando a página foi pedida já está velho quando ela chega: é o *re-enquadramento
   `-15 → 507`* do DIAG §4. Se `preservedRange` ficar sem consumidor, a `T-01.5` o remove.
4. **O eco da página não pagina de novo.** Depois do `rebase`, o eco da própria página (`from + k` no eixo novo)
   converte para os mesmos ms e dá `changed = false`, então não aciona `onCandidateRange`. Teste em
   `axis-sync.test.ts`. **Morde:** um `rebase` que mantém o eixo velho faz o eco acionar `onCandidateRange`, que é a
   cascata de páginas sem gesto que `T-05-FIX` fechou.

**Falsificador de §4.2/§4.3:** (i) na `T-01.5`, um spec novo em arquivo novo, `frontend/e2e/22-single-host-survives-paging.spec.ts`,
com o nome em inglês pela linha 3 da tabela do `CLAUDE.md`. Ele fica em arquivo novo para não conflitar com a
`T-01.F2` em `e2e/20`. O spec verifica `data-chart-mount-count == 1` depois de ≥ 2 páginas disparadas por arrasto.
**Morde:** devolver `axisSync` às deps do host faz a contagem virar `1 + páginas`. (ii) Na `T-01.8`, a asserção nova
da `T-01.F2` fica verde no `e2e/20` re-ancorado, **com a mesma ablação**, o salto de fronteira vira asserção com
limiar medido, e o `e2e/21` (parede, sem cascata) fica verde.

## 5. A premissa de `ADR-043:95` é falsa desde `718cb1a`

`ADR-043:95` diz: *"o comportamento de `T-03.11` está em produção, testado e correto"*. **É falso desde
`718cb1a`** (`T-05.2`, que cria o `useHistoryPager`). O bisect do DIAG §2(c) dá `0c9cb43` verde 2/2 e **`718cb1a`
vermelho 2/2**, e a tela mostra 4583 velas de `1m` depois do clique em `4h`. O **argumento** da ADR, de que a Perna 2
espera para não arriscar uma superfície já aprovada, **perde a premissa**: a superfície não estava correta. A
**ordem** não muda, porque as pernas entram depois de `DONE` desta feature (`[DECISÃO-OWNER: 2026-09-23, escolha
entre alternativas apresentadas]`) e a `T-01.F1` devolve a correção antes disso. A nota de correção foi acrescentada
em `docs/adr/ADR-043-…md` logo abaixo da linha 95. O texto original fica.

## 6. O que muda no DAG, e o vermelho esperado por marco

- **Tasks novas:** `T-01.F1` (`depends_on = []`) e `T-01.F2` (`depends_on = []`). Nenhuma das duas edita
  `SymbolClient.tsx`, então as duas cabem no lote da `T-01.5`.
- **`T-01.8`** passa a depender de `T-01.F1` e `T-01.F2`: re-ancora o `e2e/20` **na versão da `T-01.F2`**, e o DoD
  dela exige o `e2e/18` verde.
- **`T-01.10`** passa a depender de `T-01.F2` explicitamente: não mede composição sobre o instrumento inflado.
- **`T-01.5`** não muda de deps. Ganha os critérios de §3 e §4.3.

| marco (merge na W1) | `e2e` vermelho **esperado** (fora desta lista é culpa da task) |
|---|---|
| base `d1f8984` | `16:204` · `18:107` · `18:153` · `20:383` (`REGRAS-DE-DESPACHO…` §2) |
| + `T-01.F1` | saem `18:107` e `18:153` |
| + `T-01.F2` | `20:383` sai e entra a asserção nova da `T-01.F2` no `e2e/20`, vermelha até a `T-01.8` |
| + `T-01.5` … `T-01.7` | `16`, `20` e `21` com seletor ou contagem de 6 charts, e os ~7 contratos de DOM acoplados à construção (`ARQ-1` §6): **re-ancoragem pendente na `T-01.8`**. O builder classifica cada um |
| + `T-01.8` | **nenhum.** A partir daqui, qualquer vermelho é regressão |

## 7. O que este documento NÃO decide

- O `DEFAULT_MAX_ACCUMULATED_SLOTS` contra a carga inicial de 5.760 slots (§4.2): a política de teto é `D-C3.5`.
  Aqui ela só aparece como risco para o mecanismo, com remédio local.
- O limiar numérico do salto de fronteira, que a `T-01.8` mede.
- A ordem das pernas da `ADR-043`, que continua como o owner decidiu em 2026-09-23.
