# Opções para `D16` — a estatística do carimbo `MODELED` contra a grade de 60 s

**Nada é decidido aqui.** Mesmo modo deliberativo de [`OPCOES-E1-E5.md`](OPCOES-E1-E5.md) e
[`OPCOES-B1-B4.md`](OPCOES-B1-B4.md). Este documento **não emenda ADR nem SPEC, não escreve ADR
nova, não cria task, não altera código e não escreveu nada no Postgres** (só leitura). Ele levanta
as opções, declara o custo de cada uma, nomeia **o que cada escolha fecha e não volta atrás**, e
diz **qual delas emenda `SPEC-001` §5.2** — porque uma delas emenda, e em dois eixos.

**Por que ele existe:** o owner decidiu `D16` (`E1` opção 2) com a pré-condição *"atraso medido por
endpoint"*. A medição foi feita (`handoff/MEDICAO-ATRASO-DE-PUBLICACAO.md`), o QA a reexaminou
(`gates/QA-D16-atraso-de-publicacao.md`) e achou que **a folga de 638 ms era artefato do filtro**.
Com a população ao vivo não censurada, `p99 = 60.936 ms > 60.000 ms` ⇒ sob a fórmula de
`SPEC-001` §5.2 o carimbo `MODELED` **pula para o segundo ponto da grade**. A decisão volta ao
owner com o número na mão.

---

## 0 · O que eu medi hoje, com o comando — e são três fatos que o menu anterior não tinha

`[MEDIDO 2026-09-11, contra `deploy-postgres-1` (up 49 min), SOMENTE LEITURA, nenhum
`insert`/`update`/`delete`, nenhum seed]`. Mesma janela congelada do QA
(`bucket_end < 1789155360000`), mesmo separador de fan-out não circular, população ao vivo
**não censurada** (`nb <= 2`), endpoint `/fapi/v1/klines`.

### F0 · A curva de percentis inteira, para a escolha não ser às cegas

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c "
with g as (select series_key_id, available_at, count(*) nb from md.series group by 1,2),
     live as (select s.* from md.series s
                join g on g.series_key_id=s.series_key_id and g.available_at=s.available_at
                      and g.nb<=2
               where s.bucket_end < 1789155360000 and s.source='/fapi/v1/klines')
select count(*) n,
 percentile_disc(0.50)   within group (order by available_at-bucket_end) p50,
 percentile_disc(0.90)   within group (order by available_at-bucket_end) p90,
 percentile_disc(0.95)   within group (order by available_at-bucket_end) p95,
 percentile_disc(0.96)   within group (order by available_at-bucket_end) p96,
 percentile_disc(0.97)   within group (order by available_at-bucket_end) p97,
 percentile_disc(0.9750) within group (order by available_at-bucket_end) p975,
 percentile_disc(0.9755) within group (order by available_at-bucket_end) p9755,
 percentile_disc(0.98)   within group (order by available_at-bucket_end) p98,
 percentile_disc(0.99)   within group (order by available_at-bucket_end) p99,
 max(available_at-bucket_end) mx,
 count(*) filter (where available_at-bucket_end >= 60000) ge60k from live;"
# 4289|30979|55271|58403|58951|59622|59972|59999|60340|60936|87855|105
```

| estatística | valor (ms) | **margem que sobra** contra a grade de `60.000` | carimbo resultante |
|---|---:|---:|---|
| `p50` | 30.979 | 29.021 | `bucket_end + 60.000` |
| `p90` | 55.271 | **4.729** | `bucket_end + 60.000` |
| `p95` | 58.403 | 1.597 | `bucket_end + 60.000` |
| `p96` | 58.951 | 1.049 | `bucket_end + 60.000` |
| `p97` | 59.622 | 378 | `bucket_end + 60.000` |
| `p97,5` | 59.972 | **28** | `bucket_end + 60.000` |
| `p97,55` | 59.999 | **1** | `bucket_end + 60.000` |
| **`p98`** | 60.340 | **−340** | `bucket_end + 120.000` |
| **`p99`** (o da SPEC) | **60.936** | **−936** | **`bucket_end + 120.000`** |
| `max` | 87.855 | −27.855 | `bucket_end + 120.000` |

**A resposta literal a *"meça qual percentil cabe"*: o teto é `p97,55`** — a fração de leituras
abaixo de `60.000` é `(4289−105)/4289 = 0,975519` `[MEDIDO]`. **`p97,5` cabe com 28 ms de folga;
`p98` já não cabe.**

### F1 · ⚠️ Arredondar para a grade **COLAPSA a escolha de percentil** — ela não é um dial de lookahead

`SPEC-001` §5.2 (`docs/specs/SPEC-001-plataforma-dados.md:405-407`) arredonda **sempre para cima**
até o próximo ponto da grade nativa. Com grade de `60.000` ms, **`p50`, `p90`, `p95`, `p97` e
`p97,5` produzem o carimbo IDÊNTICO: `bucket_end + 60.000`.** Só `p98`/`p99`/`max` mudam o
resultado, e mudam para `bucket_end + 120.000`.

⇒ **a pergunta *"quanto da cauda vira lookahead inventado"* não tem resposta por percentil.**
Ela tem uma resposta só, e ela é a mesma para `p50` e para `p97,5`:

> **`105` de `4.289` buckets = `2,448%`** têm atraso real **acima** de `60.000` ms. Para esses — e
> **só** para esses — um carimbo em `bucket_end + 60.000` **afirma conhecimento que não tivemos**,
> por até **`87.855 − 60.000 = 27.855 ms`**. Para os outros `97,552%` o carimbo é **pessimista**,
> por até `60.000 − 1.353 = 58.647 ms` (mediana: `29.021 ms`).

A escolha real é **binária**: carimbo em **+1 grade** (lookahead de 1 passo em 2,448% dos buckets)
ou em **+2 grades** (pessimismo de 1 passo em 97,552% dos buckets). Escolher `p90` "para ser
conservador" não compra conservadorismo nenhum — compra o mesmo carimbo de `p97,5`, com outro
nome. **Isto reformula o item 2 do despacho: ele pressupõe um dial que o arredondamento não tem.**

### F2 · Os 105 polls atrasados **não são incidente** — são regime, e batem nos 4 símbolos igual

```bash
# distribuição horária dos 105 atrasos >= 60.000 ms e nº de instantes distintos de available_at
# (mesma CTE de F0)  ... where available_at-bucket_end >= 60000 group by hora
# 09-11 01|4  02|4  03|8  04|4  05|8  06|4  07|8  08|4  09|8  10|4  11|8  12|4
#       13|8  14|8  15|4  16|8  17|4  18|4  19|1      -> 18 horas, 4..8 por hora
# late_instants|105|2026-09-11 01:54:00+00|2026-09-11 19:09:11+00
# por símbolo (mesma CTE): BTCUSDT 27 | ETHUSDT 26 | LINKUSDT 26 | SOLUSDT 26   (n≈1.072 cada)
```

Não é um restart, não é uma janela ruim da Binance, não é um símbolo. É **taxa constante**:
`105 / 17,9 h ≈ 5,9/h`, `~1,47/h/símbolo` sobre `60` polls/h ⇒ **~2,4% dos ciclos**, de hora em
hora, nas 18 horas medidas.

### F3 · 🔴 O atraso do ENDPOINT klines é **≤ 12 ms** — quase 100% do `p99` é a fase do NOSSO poll

As 12 menores leituras da população ao vivo não censurada (`n = 4.289`), em ms:

```
12 · 15 · 40 · 46 · 83 · 105 · 129 · 143 · 151 · 152 · 170 · 183
```

e `332` de `4.289` leituras abaixo de `5.000 ms` contra **`357` esperadas** sob fase uniforme
(`4.289 × 5.000/60.000`), `663` abaixo de `10.000` contra `715` esperadas `[MEDIDO]`. A fase da
nossa poll é **uniforme sobre o minuto** — a mesma assinatura que `MEDICAO-ATRASO-DE-PUBLICACAO.md`
§3 já tinha nomeado (`σ = 16.687` contra `60.000/√12 = 17.321`), **mas com o mínimo agora medido em
`12 ms`, não em `1.353 ms`**: o `1.353` era o mínimo do subconjunto **censurado** `nb = 1`.

Sob fase uniforme com `n = 4.289`, o mínimo esperado é `60.000/4.289 ≈ 14 ms`. O mínimo observado é
`12 ms`. ⇒ **o atraso de publicação do `/fapi/v1/klines` é indistinguível de zero na resolução desta
amostra.** Os `30.979 ms` de mediana e os `60.936 ms` de `p99` são **a fase e a deriva do nosso
escalonador**, não um fato sobre a Binance.

**E a causa está em uma linha de código, legível:**
`backend/src/modules/sentimento/infra/collectors_cli.py:1026` fecha o laço do coletor de klines com

```python
        stop_event.wait(interval_s)
```

— sono **fixo depois do trabalho**, não alinhamento à grade. O período efetivo do ciclo é
`interval_s + tempo_de_trabalho`, então a fase **deriva monotonicamente** sobre a grade de 60 s e, a
cada volta completa, **pula um bucket** — que é exatamente o `nb = 2` com `span = 60.000 ms` e
`lag_old = lag_new + 60.000` que o QA mediu. `26` voltas por símbolo em `17,9 h` ⇒ uma volta a cada
`~41 min` ⇒ deriva de `~1,4 s` por ciclo, compatível com o tempo de trabalho de um ciclo de 4
símbolos. `[INFERRED: a aritmética fecha; não instrumentei o processo para medir o período do ciclo
diretamente — ver §4, item de verificação]`

⚠️ **Isto não é só um problema do carimbo `MODELED`.** Hoje, **ao vivo e em produção**, `2,448%`
dos buckets de klines de 1 min chegam ao banco com `available_at` **um minuto inteiro** depois do
fechamento. O `available_at` deles é `OBSERVED` e está **correto** — a plataforma soube tarde
mesmo. O defeito não é do carimbo; é do escalonador.

---

## As opções

### O1 · Aceitar `p99 = 60.936` ⇒ carimbo em `bucket_end + 120.000` (klines legível 1 grade depois)

| | |
|---|---|
| **vantagem** | **emenda ZERO.** É literalmente o que `SPEC-001` §5.2 manda: `p99`, arredondado **para cima**, *"o erro é sempre pessimista"*. É a única opção que não precisa de caneta em SPEC nenhuma. Uniforme (um carimbo para todo bucket de klines), honesta, e **nunca** afirma conhecimento que não tivemos |
| **desvantagem** | o backtest fica **1 minuto mais lento que a produção**, sistematicamente e por construção: o caminho ao vivo lê o bucket com `available_at` OBSERVED (97,552% dentro de uma grade), o backtest lê a mesma série com `available_at` MODELED (sempre duas). ⇒ **o backtest deixa de ser simulação e vira limite inferior** |
| **custo ao gráfico de 1 m** | só a parte **history/backfill** do gráfico atrasa uma barra; a parte ao vivo não muda (continua `OBSERVED`). Na borda direita, a barra mais recente do trecho MODELED aparece 1 min depois da do trecho ao vivo ⇒ **descontinuidade visível exatamente na fronteira backfill↔ao-vivo** |
| **custo ao backtest** | **quantificado pelo timeframe de decisão, e é pequeno onde `ADR-036` decide:** `ADR-036/D5` escreve *"quem decide continua sendo o timeframe: 15 buckets por candle de 15 min, 240 por candle de 4 h"* (`docs/adr/ADR-036-…:158-159`). 1 bucket de atraso = **1/15 = 6,7%** de um candle de 15 m e **1/240 = 0,4%** de um de 4 h. A `1 m` o custo é **100% da barra** — mas `1 m` já não é timeframe de decisão desta plataforma: `SPEC-001:505` mede **`0,2` pontos de OI por barra de 1 m**, ou seja **4 em cada 5 barras de 1 m não têm OI nenhum**, e sem OI não há matriz de convergência |
| **o que fecha irreversivelmente** | **nada em SPEC/ADR**, e essa é a propriedade cara desta opção. O que fecha é de dado: cada linha de backfill escrita com `+120.000` carrega esse número; reverter depois é `UPDATE` em `80.592` linhas (a migração que `E1` opção 2 já declarou em aberto). **Mitigável por `O6`** |
| **emenda?** | **não emenda nada.** `SPEC-001` §5.2 intacta, `ADR-036/D5` intacta |

### O2 · Trocar a estatística por um percentil que caiba (`p90` … `p97,5`) ⇒ carimbo em `+60.000`

| | |
|---|---|
| **vantagem** | o carimbo MODELED bate o comportamento ao vivo em **97,552%** dos buckets; backtest e produção ficam alinhados; sem descontinuidade na fronteira; sem custo no gráfico de 1 m |
| **desvantagem** | **`2,448%` dos buckets (`105/4.289`) passam a afirmar conhecimento que não tivemos**, por até `27.855 ms`. E — ver **F1** — **qualquer** percentil de `p50` a `p97,5` dá **exatamente esse mesmo** número: escolher `p90` em vez de `p97,5` não reduz o lookahead em uma linha sequer, só troca a margem nominal (`4.729 ms` contra `28 ms`) |
| **custo declarado** | **emenda `SPEC-001` §5.2 em DOIS eixos, não um.** (a) a **estatística**: `p99_lag(endpoint, observer_region)` está escrito por extenso na fórmula (`SPEC-001:405-407`) e `LAG_STAT_NAME = "p99"` é constante nomeada em `backend/src/modules/sentimento/domain/availability_lag_stats.py`; (b) — e esta é a cara — a **garantia de pessimismo**: *"Arredondamento sempre PARA CIMA ⇒ o erro é sempre pessimista: a plataforma diz que soube mais tarde do que soube, **nunca mais cedo**"*. Com `p97,5` a plataforma diz que soube **mais cedo** em 2,448% dos buckets. A SPEC justifica essa garantia com número: errar o rótulo por um bucket **inverte o sinal do ΔOI de 15 min em 21,96% das janelas (`n = 8.629`)** `[DOC: SPEC-001 §5.2]` |
| **o que fecha irreversivelmente** | **abre o precedente de que a estatística do carimbo é negociável quando o número medido não cabe.** Depois desta, todo endpoint cujo `p99` estourar a grade tem um caminho pronto para baixar o percentil — e o próximo estouro será mais barato de aprovar que este. É a mesma classe de erosão que `CLAUDE.md` nomeia para allowlist |
| **emenda?** | **SIM — `SPEC-001` §5.2, dois eixos.** `ADR-036/D5` intacta |

### O3 · Declarar que a grade legível efetiva de klines é 2 min

| | |
|---|---|
| **vantagem** | torna explícito na documentação o que `O1` produz na prática, em vez de deixá-lo como consequência não escrita de uma fórmula |
| **desvantagem** | ⚠️ **como enunciado no despacho, a frase é FALSA.** A grade legível de **2 min** vale só para linhas **`MODELED`**. As linhas ao vivo são `OBSERVED` e `97,552%` delas são legíveis em **1 grade** (`105/4.289` em 2). Escrever *"a grade legível efetiva de klines é 2 min"* sem o qualificador `MODELED` declara sobre a série ao vivo uma propriedade que **a medição refuta** |
| **custo declarado** | é **consequência de `O1`, não alternativa a ele**: `O3` sem `O1` não decide nada (não diz qual estatística usar) e `O1` sem `O3` já produz o efeito. Se adotada, tem de ser escrita como *"a grade legível de uma linha **MODELED** de klines é `bucket_end + 2` grades"* — e aí é redação, não decisão |
| **contradiz alguma ADR?** | **Não contradiz `ADR-036/D5`** — `D5` decide **fonte** (`/fapi/v1/klines`, `delta = 2·takerBuyBaseVol − volume`) e **profundidade** (desde `2019-09-08`), nunca latência de leitura; e `D5` explicitamente devolve a decisão de granularidade ao timeframe (`:158-159`). **Não contradiz `SPEC-001` §5.2** — é o resultado dela. **Contradiz, sim, qualquer leitura de que a plataforma decide a 1 m** — que é leitura que `SPEC-001:505` (OI a `0,2` ponto por barra de 1 m) já não sustentava |
| **o que fecha irreversivelmente** | se escrita **sem** o qualificador `MODELED`, cria uma segunda verdade sobre a mesma série — a classe de defeito que `E4` existe para fechar. Com o qualificador, não fecha nada |
| **emenda?** | **não emenda; documenta.** Mas exige o qualificador, senão é afirmação falsa |

### O4 · ⭐ Consertar a CAUSA — alinhar o poll à grade —, remedir, e só então fixar a estatística

| | |
|---|---|
| **o que é** | trocar o sono fixo pós-trabalho (`collectors_cli.py:1026`) por agendamento **alinhado ao ponto da grade** (disparar em `bucket_end + offset`, com `offset` medido). Com o atraso do endpoint **≤ 12 ms** (F3), o `p99` do atraso observado cairia de `60.936 ms` para a ordem do `offset` + jitter — folga contra a grade da ordem de **57–59 s**, não de **28 ms** |
| **vantagem** | **é a única opção que remove o dilema em vez de escolher um lado dele.** Com folga de dezenas de segundos, `p99` (a estatística da SPEC, sem emenda) cabe na grade com margem confortável, o carimbo `MODELED` cai em `+60.000` **sem** lookahead, e backtest e produção passam a concordar em ~100% dos buckets. **E conserta um defeito de produção que existe independentemente de `D16`:** hoje `2,448%` dos buckets ao vivo chegam 1 min atrasados, e isso degrada a decisão ao vivo, não só o backtest |
| **desvantagem** | **invalida a medição atual como base de contrato.** O `p99` de klines da `publication_lag_table.py` passa a descrever um regime que deixou de existir ⇒ **é preciso remedir depois do deploy**, e a janela de klines volta a **zero horas**. `D16` fica bloqueado pelo tempo da nova coleta |
| **custo declarado** | 1 task em `sentimento` (escalonador + teste que prove alinhamento), 1 deploy, e **espera de coleta**. Risco a declarar: polling perto demais de `bucket_end` pode pegar o bucket **antes** de fechar — o `offset` tem de ser medido, não chutado, e o invariante `is_final` tem de ser testado. **⛔ Eu não decido o `offset`, nem o desenho do escalonador — isso é `/architect` + builder** |
| **o que fecha irreversivelmente** | **nada em SPEC/ADR.** Fecha a janela de medição atual — o `n = 4.289` de hoje vira histórico de um regime morto, e qualquer número derivado dele (a tabela versionada, os testes de cauda) tem de ser reescrito com a nova medição. Isso é custo, não irreversibilidade |
| **emenda?** | **não emenda nada.** Nem `SPEC-001` §5.2 nem `ADR-036/D5` |

### O5 · Modelar o atraso do ENDPOINT, não o do observador (tirar a fase do nosso poll do termo)

| | |
|---|---|
| **o que é** | `p99_lag` passa a medir **publicação** (`≤ 12 ms` em klines, F3), não `publicação + fase da nossa poll`. Carimbo em `bucket_end + 60.000` por arredondamento, com margem de ~60 s |
| **vantagem** | é o número **verdadeiro sobre o mundo**: o backfill não tem fase de poll nenhuma — ele não foi colhido por poll. Modelar a fase de um escalonador que **não participou** daquela linha é importar um artefato nosso para dentro do dado histórico, **permanentemente** |
| **desvantagem** | **contraria o argumento escrito** em `MEDICAO-ATRASO-DE-PUBLICACAO.md` §3: *"uma linha MODELED de backfill tem de afirmar exatamente o que o nosso caminho ao vivo teria sabido no mesmo bucket — senão ela fica mais otimista que a nossa própria captura"*. Sob `O5`, o backtest lê history **mais rápido** do que a produção de hoje lê ao vivo ⇒ lookahead medido contra nós mesmos, em **97,552%** dos buckets (todos os que hoje chegam com fase) |
| **custo declarado** | exige **definir e medir** o termo "atraso de publicação do endpoint" separado da fase — hoje a evidência é o **mínimo** sob fase uniforme (`12 ms`, `n = 4.289`), que é estimador de mínimo, **não** de `p99`. Para um `p99` de publicação é preciso instrumentação diferente (ex.: poll denso alinhado, ou usar o `premiumIndex` como referência — `p99 = 1.758 ms`, `n = 34.752`, coletor **alinhado à grade**, `min = −100 ms`). ⚠️ E note: **`O5` é `O4` sem o conserto** — mede o que `O4` construiria, mas deixa a produção torta |
| **o que fecha irreversivelmente** | fecha a interpretação de `available_at` como *"quando a NOSSA plataforma pôde saber"* (`SPEC-001` §2.2) para *"quando o dado era sabível"*, **e as duas coexistiriam na mesma coluna** (OBSERVED com um sentido, MODELED com outro). Isso é duas verdades numa coluna só — a classe que `E4` fecha |
| **emenda?** | **não troca a estatística** (`p99` permanece), mas **muda a população** sobre a qual ela é medida, e `SPEC-001` §5.2 escreve `p99_lag(endpoint, **observer_region**)` — o qualificador `observer_region` é a parte que `O5` esvazia. ⇒ exige, no mínimo, **nota normativa em `SPEC-001` §5.2** dizendo qual termo é medido. **`ADR-036/D5` intacta** |

### O6 · (ortogonal, hedge de reversibilidade) não congelar o número **na linha**

| | |
|---|---|
| **o que é** | a linha `MODELED` guarda `availability_model_id` (ou versão da tabela de atraso) junto do `available_at` calculado, de modo que remedir o atraso seja **recarimbar por modelo**, não arqueologia |
| **vantagem** | **é a única coisa neste menu que reduz o que qualquer outra escolha fecha.** Qualquer das opções acima pode ser revista se a linha souber de qual modelo veio. Sem isso, a escolha de hoje fica soldada em `80.592` linhas mais tudo que for importado |
| **desvantagem / custo** | 1 coluna nova + migração de schema, e um vocabulário a mais no contrato de `md.series`; ⚠️ **e mexer em `md.series` toca `ADR-008` (projeção canônica / `sha256`)** — não é mudança de estilo. **Não decido isto**: é `/architect` + dono de `ADR-008` |
| **o que fecha** | nada; é o oposto — existe para não fechar |

---

## 1 · A tabela de "quem emenda o quê", que o despacho pediu explicitamente

| opção | emenda `SPEC-001` §5.2? | contradiz `ADR-036/D5`? |
|---|---|---|
| **O1** aceitar `p99 = 60.936` | **não** — é o cumprimento literal dela | **não** |
| **O2** percentil menor (`p90`…`p97,5`) | **SIM, em 2 eixos**: a estatística (`p99` escrita na fórmula, `:405-407`) **e** a garantia *"nunca mais cedo"* | **não** |
| **O3** declarar grade legível de 2 min | **não** (documenta o efeito) — **mas é falsa sem o qualificador `MODELED`** | **não** — `D5` decide fonte e profundidade, nunca latência |
| **O4** consertar o escalonador | **não** | **não** |
| **O5** modelar atraso do endpoint | não troca a estatística, mas **esvazia `observer_region`** ⇒ exige nota normativa em §5.2 | **não** |
| **O6** `availability_model_id` | **não** — mas toca `ADR-008` (projeção canônica) | **não** |

**Nenhuma das seis contradiz `ADR-036/D5`.** `D5` fixa **fonte** (`/fapi/v1/klines`, `2·takerBuyBaseVol − volume`)
e **profundidade** (`2019-09-08`, weight 1 por 1.500 velas); latência de leitura não é objeto dela, e
`D5` devolve a granularidade ao timeframe explicitamente (`:158-159`). O que `O1`/`O3` **erodem**, sem
contradizer, é o **valor prático** da profundidade de `D5` a `1 m` — e a `15 m`/`4 h`, que é onde `D5`
diz que se decide, a erosão é `6,7%` / `0,4%` de um candle.

---

## 2 · ⚠️ Veredito sobre a suficiência da amostra — o despacho perguntou, e a resposta é NÃO

**`n = 4.289` em `17,9 h` é suficiente para REFUTAR e para DIAGNOSTICAR; é insuficiente para FIXAR
CONTRATO.** Os três motivos, com número:

1. **A janela não contém nenhum dos eventos que produzem cauda.** `17,9 h` de um único dia útil
   (2026-09-11), num único deploy: **zero** fim de semana, **zero** janela de manutenção da Binance,
   **zero** restart de coletor, **zero** virada de funding de 8 h sob carga. Um `p99` é uma afirmação
   sobre a cauda, e a cauda é feita justamente desses eventos.
2. **Não há medição dia-a-dia para klines — a própria medição já declarava isso**
   (`MEDICAO-ATRASO-DE-PUBLICACAO.md:120-122`). O contraste é o `premiumIndex`: com `n = 34.752` em
   `72,9 h`, os `p99` diários são `1.793 / 1.753 / 1.740 / 1.809` ms — **3,9% de amplitude**
   `[DOC: MEDICAO §Q2]`. Para klines esse teste **ainda não é computável**.
3. **🔴 O motivo decisivo: a amostra mede o ESCALONADOR, não o endpoint (F3).** Fixar contrato sobre
   `p99 = 60.936` é fixar contrato sobre um número que **uma mudança de uma linha de código
   (`collectors_cli.py:1026`) faz cair ~60×**. Contrato que muda quando se conserta um bug não é
   contrato — é a fotografia de um defeito.

**Recomendação sobre a espera, separada da recomendação de opção:** a decisão **não deve ser tomada
sobre esta amostra**. Se o owner quiser destravar `D16` hoje mesmo, **`O1` é a única escolha que não
custa nada se a remedição mudar o número** (é a direção pessimista, e `O6` a torna revisável). Já
**`O2` tomada hoje** grava uma emenda de SPEC baseada num percentil do nosso próprio jitter.

⚠️ **O que eu NÃO consigo verificar, e digo em vez de esconder** `[NÃO MEDIDO]`: (a) o período real
do ciclo do coletor — inferi `~61,4 s` da aritmética de `26` voltas/símbolo em `17,9 h`, sem
instrumentar o processo; (b) qual `offset` seguro `O4` exigiria — depende de quando a Binance fecha o
kline, e `12 ms` é mínimo amostral, **não** `p99` de publicação; (c) se o mesmo defeito de
escalonamento atinge outros coletores — o `premiumIndex` claramente **não** (`min = −100 ms`, alinhado
à grade), mas os endpoints ainda sem atraso medido não foram olhados.

---

## 3 · Recomendação do `/quant-architect` — e ela é composta, com um "se"

> **`O4` (consertar o escalonador) + remedir + então `O1` (manter `p99`, sem emenda nenhuma).
> Se o owner precisar carimbar antes da remedição: `O1` sozinho, nunca `O2`, com `O6` para não soldar.**

**Motivo, em três linhas:** (i) `O2` é a única que emenda SPEC — e emenda **a garantia de que o erro
é sempre pessimista**, que é o instrumento anti-lookahead desta plataforma, comprado com um número
(`21,96%` de inversão de sinal do ΔOI, `n = 8.629`) — **em troca de nada**, porque F1 mostra que o
percentil escolhido não muda o carimbo; (ii) o lookahead que `O2` compraria é `2,448%` dos buckets, e
esses `2,448%` **são defeito nosso, não do mundo** (F3) — pagar em lookahead por um bug de
escalonador é pagar duas vezes; (iii) `O1` custa `6,7%` de um candle de 15 m **no backtest apenas**,
erra sempre para o lado seguro, e o custo desaparece sozinho quando `O4` entrar.

**O que a recomendação NÃO é:** não é decisão. `D16` é do owner, e a escolha entre "destravar hoje
com `O1`" e "esperar `O4` + remedição" é dele — é troca de **tempo de calendário** por **fidelidade do
backtest**, e o tamanho da espera depende de quantos dias de nova coleta ele aceita.

---

## 4 · Como o owner verifica isto sem confiar em mim

1. **A curva de percentis e o `105/4.289`**: rode o bloco `bash` de §F0 tal como está — é somente
   leitura, a janela é congelada (`bucket_end < 1789155360000`) e reproduz depois do coletor andar.
2. **F1 (o colapso do percentil)**: aritmética de uma linha — `ceil(x/60000)*60000` é `60000` para
   todo `x` em `(0, 60000]` e `120000` para todo `x` em `(60000, 120000]`. Confira contra a fórmula
   em `docs/specs/SPEC-001-plataforma-dados.md:405-407`.
3. **F2 (regime, não incidente)**: o segundo bloco de §F2 devolve a contagem por hora e por símbolo.
4. **F3 (o endpoint não atrasa)**: `... order by 1 limit 12` na mesma CTE devolve os 12 mínimos; e
   `collectors_cli.py:1026` é uma linha, legível sem contexto.
5. **A garantia de pessimismo que `O2` gastaria**: `SPEC-001` §5.2, o parágrafo *"Arredondamento
   sempre PARA CIMA"*.
6. **O que `ADR-036/D5` decide de fato**: `docs/adr/ADR-036-…:116-159`, e `:158-159` para a frase do
   timeframe.

**Rótulo de força deste documento:** §F0–F3 e a tabela de percentis são `[MEDIDO 2026-09-11]` com o
comando ao lado. O período de ciclo de `~61,4 s` é `[INFERRED: aritmética de 26 voltas/símbolo em
17,9 h]`. As leituras de `SPEC-001` §5.2 / `ADR-036/D5` são `[DOC]` com linha citada. A recomendação
de §3 é **opinião de arquitetura**, rotulada como tal, e **não é decisão**.
