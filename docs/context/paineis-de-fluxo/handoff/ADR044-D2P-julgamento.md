# ADR-044/D2′ — julgamento do achado §3.1 do builder da T-01.10 (o controle "portadora filtrada")

**Data:** 2026-09-25 · **Autor:** `frontend-architect` (`web.architect`, `A6`) · **Base:** `wave/paineis-f01` em `332f8d6`
**Entrada:** `gates/T-01.10-builder.md` §3.1 (commit `f16673d`, branch `worktree-wf_820bac26-f99-1`, ainda fora da wave)
**Escopo:** só o falsificador de `D2′` e a coluna "morde" de `F-D` em `handoff/T-01.10-desenho.md` §4. Nenhum código
de produção é tocado, e a `D2′` não é editada aqui: o texto de emenda da §4 abaixo está pronto para quem tiver a
ADR na mão.

## 1. Veredito

**O achado procede. É defeito do falsificador, não do conserto.** A `D2′` (a)+(b) fica como está. O que muda é
a frase "**Morde:** filtrar também a portadora colapsa as lacunas". No gráfico que a própria frase descreve
("com lacuna, bucket isolado e zeros", ou seja, o gráfico com as marcas de ausência e de zero), esse controle
dá **0 byte**. Um controle que dá 0 onde se diz que morde é o modo de falha que `ADR-012` nomeia: não dá para
distinguir "a portadora funciona" de "o instrumento não enxerga a portadora".

## 2. Por que procede, e com que força

1. **É assim por construção, não por acaso da fixture.** `positiveValueSeriesLossless`, `absenceMarkSeries` e
   `zeroMarkSeries` (`frontend/src/charts/s2-lightweight-adapter.ts:145-216`) repartem o domínio do slot:
   `null` vai para a ausência, `0` vai para o zero, `>0` vai para o positivo, e um valor `<0` lança `RangeError`
   (`:153-157`). Quando alimentadas pelos mesmos `slots`, a união dos itens de plot das três **é** a grade.
2. **Medido, em vez de só argumentado:** 1.000 conjuntos de slots aleatórios (n entre 50 e 449, 15% `null`,
   10% `0`), todos passados pelos adaptadores REAIS. A tríade cobre a grade em **1000/1000**. Uma linha sozinha,
   sem marcas, cobre a grade em **0/1000**, e os 1000 conjuntos têm lacuna `[MEDIDO 2026-09-25, n=1000;
   script em scratchpad, não versionado: importa s2-lightweight-adapter.ts e usa como "item de plot" o
   predicado `"value" in item || "open" in item`, que aproxima o isWhitespaceData da lib]`.
3. **O app de hoje tem duas tríades completas:** volume (`SymbolClient.tsx@f16673d:1882-1884`, `volume.slots`)
   e liquidação (`:2573-2575`, `data.slots`). A invariante (v) do registry
   (`pane-registry.test.ts:425`, `validateSetDataOnCanonicalGrid`) exige que a saída lossless de toda série caia
   **exatamente** na grade. Então, com qualquer um desses dois panes montado, a união das séries esparsas já é
   a grade inteira `[INFERRED: partição (item 2) + invariante (v); o braço (ii) do e2e/25 não isolou a portadora]`.
4. **Consequência que o builder não escreveu e que aqui fica escrita:** **no app real, apagar a portadora não
   muda nenhum pixel hoje.** O braço (ii) do `e2e/25` compara esparso com denso e mantém a portadora nos dois
   lados. O mutante dele (`items.slice(0, -1)` no ramo denso, 7.742 bytes `[DOC: gates/T-01.10-builder.md §3]`)
   prova que o braço enxerga diferença entre (b)-esparso e (b)-denso. **Não prova nada sobre (a).** Na
   composição de produção, o único guarda de (a) é o unitário `F-E`.

## 3. Decisão

**D-1: a portadora continua obrigatória, como DONA da invariante de grade.** Hoje ela não é quem segura a grade
na prática, e isso vai escrito na ADR. A alternativa "tirar a portadora porque as marcas já cobrem" foi
recusada. Ela transformaria a correção da `timeScale` em efeito colateral de uma decisão de **design**
(`D3`/`D3′`, as marcas de `RN-4`), que tem outro dono e outro motivo para mudar. Três caminhos já nomeados
produzem um conjunto de panes sem tríade completa: a fusão da fase `04`, um pane removido ou condicional, e o
degrau 3 de `T-01.10-desenho.md` §6. Nenhum deles teria qualquer razão para olhar a `timeScale`.

**D-2: o falsificador de `D2′` se parte em três, cada um com o próprio par morde/cala e o universo onde vale.**
(texto na §4). Resumo:

| alvo | instrumento | cala (passa) | morde (reprova) | onde vale |
|---|---|---|---|---|
| **(b)** esparso ≡ lossless | `e2e/25` braço (i), gráfico **com** marcas · braço (ii), app real | 0 byte nos dois | mutante de valor 6.061 · ramo denso `slice(0,-1)` 7.742 | qualquer composição |
| **(a) eficácia**: a portadora sozinha segura a lacuna | `e2e/25` braço (i), gráfico **sem** marcas (linha + vela) | `design_no_marks` 0 byte | portadora filtrada **58.018** | só onde nenhuma série de pane cobre a grade, e por isso o braço é sem marcas |
| **(a) estrutura**: a portadora existe, vem primeiro, com a grade inteira | `host-series-feed.test.ts` (`F-E`) | ordem e contagem `axis.slotCount` | portadora por `plotItemsOnly` reprova · portadora depois dos panes reprova | **qualquer composição, inclusive a de produção**, porque não depende de pixel |

Os números da tabela são do builder: `[DOC: gates/T-01.10-builder.md §3–§4, n=1 render cada]`. Não os rodei de
novo.

**D-3: o "portadora filtrada **com** marcas = 0 byte" NÃO vira asserção.** Fica registrado como fato, para
explicar por que o braço de eficácia é sem marcas. Afirmá-lo acoplaria o falsificador de `D2′` à forma das
marcas de `D3`: uma mudança legítima nas marcas (por exemplo, não marcar ausência antes da cobertura) quebraria
um teste de grade sem que a grade tivesse mudado.

**D-4: gatilho de reabertura, literal.** Quando uma task entregar uma composição de panes em que **nenhum** pane
montado tem tríade positivo+ausência+zero sobre a grade inteira (a fusão da fase `04`, o pane de volume ou de
liquidação removido ou condicional, o degrau 3 de §6), o braço (ii) do `e2e/25` passa a precisar de uma ablação
da portadora no app real, e ela **tem de morder** ali. A partir desse momento o pixel do app passa a enxergar
(a), e a cobertura deixa de depender só do unitário.

## 4. Texto de emenda, pronto para aplicar

### 4.1 `docs/adr/ADR-044-…md`: substituir o parágrafo "**Falsificador de D2′:**" (hoje nas linhas 86-89)

> **Falsificador de D2′**, em três partes, e cada uma diz onde vale:
>
> - **(b), o esparso não muda nenhum pixel.** Comparar o canvas lossless sem portadora com o canvas do desenho
>   (portadora + `plotItemsOnly`) sobre a mesma entrada, com lacuna, bucket isolado, zeros e as marcas de
>   ausência e zero, tem de dar **0 byte** de diferença. No app real, esparso contra `?e2eDenseSeries=1`,
>   também **0 byte**. **Morde:** um valor trocado reprova (3.952 bytes no harness do desenho, 6.061 no
>   `e2e/25`), e o ramo denso com `items.slice(0, -1)` reprova no app (7.742)
>   `[MEDIDO 2026-09-25, n=1 render cada; handoff/T-01.10-desenho.md §4, gates/T-01.10-builder.md §3]`.
> - **(a) eficácia, a portadora sozinha segura a lacuna.** Num gráfico **sem** marcas (linha + vela), o desenho
>   contra o lossless dá **0 byte**. **Morde:** com a portadora também filtrada, as lacunas colapsam (58.018
>   bytes) `[MEDIDO 2026-09-25, n=1 render]`. ⚠️ **Esse controle só existe num gráfico sem marcas.**
>   Positivo + ausência + zero repartem todo slot (`s2-lightweight-adapter.ts:145-216`, e um negativo lança
>   exceção), então com as marcas a união das séries esparsas já é a grade. Ali, filtrar a portadora dá
>   **0 byte**, e isso é esperado, não é falha do controle `[MEDIDO 2026-09-25: a tríade cobre a grade em
>   1000/1000 conjuntos aleatórios de slots; uma linha sozinha em 0/1000]`.
> - **(a) estrutura, que vale em qualquer composição.** O host alimenta a portadora **primeiro**, com
>   `axis.slotCount` itens, e nunca a filtra (`host-series-feed.test.ts`, `F-E`). **Morde:** a portadora
>   passada por `plotItemsOnly` reprova, e a portadora depois dos panes reprova.
>
> **O que isto implica em produção, dito com todas as letras:** com o pane de volume ou o de liquidação
> montado, apagar a portadora **não muda nenhum pixel**. Nessa composição, o único guarda de (a) é o unitário.
> A portadora fica porque ela é a **dona** da invariante: a grade não pode depender da forma das marcas de
> `D3`. **Gatilho:** a composição que deixar de ter uma tríade completa sobre a grade (a fusão da fase `04`, o
> pane de volume ou de liquidação removido ou condicional, o degrau 3 de `T-01.10-desenho.md` §6) obriga o
> `e2e/25` braço (ii) a ganhar uma ablação da portadora que **morda** no app real.
> `[handoff/ADR044-D2P-julgamento.md]`

### 4.2 `handoff/T-01.10-desenho.md` §4, linha `F-D`, coluna "morde"

Substituir "· a portadora também filtrada ⇒ as lacunas colapsam e os bytes diferem" por:

> · a portadora também filtrada, **num gráfico sem marcas** ⇒ as lacunas colapsam (58.018 bytes). Com as
> marcas de ausência e zero, esse controle dá 0 byte por construção (a tríade reparte todo slot), e o que
> guarda (a) nessa composição é o `F-E` (ver `handoff/ADR044-D2P-julgamento.md`)

## 5. O que este julgamento NÃO decide

- **Se as marcas estão certas** (`D3`/`D3′`, `RN-4`). Isso é `quant-architect` + `design_gate`. Aqui elas são
  só um fato sobre a cobertura da grade.
- **Custo de latência da portadora com as marcas presentes.** A portadora é o que põe todo `setData` seguinte
  em `firstChangedPointIndex = -1`. Se isso ainda paga alguma coisa quando a tríade já cobre a grade é
  `[NÃO MEDIDO]`: o `F-B` (denso contra esparso, 2,05–2,23×) manteve a portadora nos dois braços. Não é
  motivo para removê-la (D-1), e não é pergunta que bloqueie algo.
- **O ledger.** Nenhum `gate-record` nem `approve`. Aplicar a §4.1 à ADR é ato de quem integrar
  `f16673d`/`eed2844` na wave.

## 6. Falsificador deste julgamento

Ele cai se aparecer, na composição de produção de hoje, um slot da grade que nenhuma série esparsa de pane
cubra: um slot onde volume e liquidação são ambos whitespace depois de `plotItemsOnly`. Isso exigiria uma
saída lossless fora da grade (e a invariante (v) reprovaria) ou um adaptador da tríade que devolva whitespace
para um valor finito ≥ 0. Nos dois casos, a §2.3 está errada e a portadora voltou a ser necessária em
produção, o que só reforça D-1.
