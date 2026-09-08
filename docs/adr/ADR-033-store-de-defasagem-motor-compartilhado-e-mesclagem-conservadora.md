# ADR-033 — Store de defasagem (`LagSummaryRow`): motor compartilhado com `ADR-031` e mesclagem conservadora, não sobrescrita

**Data:** 2026-09-08 · **Status:** **aceita** — co-assinatura `quant-architect` satisfeita em 2026-09-08 (`§Co-assinatura` abaixo), mesmo padrão de `ADR-031`/`gates/Q3-run-definition.md`. `D2` confirmado sem alteração; os três parâmetros de `SPEC-005` nomeados pelo gate (`REGIME_N_MIN`, `margem`, membro de `AvailabilitySource`) — dois confirmados, um **ajustado com justificativa**.
**Feature:** `coinalyze-fora-da-quarentena` (filha de `plataforma-dados`) · **Fecha:** `PRD-005 [Q2]`, `[GAP G1]` · **Estende:** `ADR-031/D1` (não reabre) · **Rev de ancoragem:** `master@4605767`.
**Componentes:** `sentimento` (adaptador), `infra` (composição, motor).

## Contexto

`PRD-005` nomeia dois requisitos para o store novo de `LagSummaryRow` que, lidos ao pé da letra, competem:

- `RF-3`/`CA-F1-4`: uma segunda rodada do probe **acrescenta** amostra ao `(endpoint, observer_region)` já existente — `lag_n` da segunda leitura nunca é menor que o da primeira.
- `RNF-1`: a persistência **não cresce sem teto** — "é uma tabela por `(endpoint, observer_region)`, atualizada, não uma linha por amostra bruta acumulada para sempre".

Acrescentar uma amostra a um `p99` já calculado **corretamente** normalmente exige as amostras brutas (`p99` não é uma estatística que se combina de duas rodadas por uma fórmula fechada sem os dados originais). `RNF-1` proíbe guardar as amostras brutas para sempre. Nenhum documento lido (`PRD-005`, `SPEC-001 §5.2`, `T-03.6-builder.md`) resolve essa tensão — é `[GAP]` novo desta rodada de arquitetura, não um ponto que o PM ignorou por descuido (o PRD nomeia as duas exigências lado a lado, sem reconciliá-las).

**O motor (SQLite × Postgres) já tem precedente direto e recente:** `ADR-031` decidiu, para `md.ingest_run`/`md.ingest_gap`, exatamente esta forma — um adaptador por porta, `sqlite` default (dev/teste), `postgres` em produção, seleção por `INGEST_RECORD_BACKEND`, conexão injetada pelo composition root. `ADR-014/D1e` já havia armado os gatilhos de reabertura (`G-A`/`G-B`), e `ADR-031` mediu os dois **disparados** (`psycopg` entrou por `T-08.4`; um segundo processo passou a ler o registro). Não há motivo para o store de defasagem reabrir essa escolha com um terceiro motor ou uma segunda variável de configuração — o mesmo par de fatos (custo do adaptador Postgres ~zero, múltiplos processos already tocando o registro) vale aqui.

## Decisão

### D1 · Motor: o MESMO padrão de `ADR-031/D1`, mesma variável de seleção

`LagSummaryStore` é uma porta nova (não uma extensão de `IngestRecordSource` — schema e ciclo de vida diferentes), com dois adaptadores:

- `SqliteLagSummaryStore` — tabela `lag_summary` (arquivo local, mesmo `INGEST_HEALTH_STORE_PATH` ou um sidecar nomeado — decisão de nome de arquivo é implementação, não arquitetura).
- `PostgresLagSummaryStore` — tabela `md.lag_summary`, mesmo schema `md` de `md.ingest_run`/`md.ingest_gap`.

Seleção por `INGEST_RECORD_BACKEND` ∈ {`sqlite`, `postgres`} — a **mesma** variável de `ADR-031`, não uma nova. Motivo: é a mesma decisão de composição (qual motor este processo fala), não uma segunda pergunta — introduzir `LAG_SUMMARY_BACKEND` separado permitiria configurações inconsistentes (registro em Postgres, defasagem em SQLite) sem nenhum benefício nomeado. Conexão injetada pelo composition root, nunca aberta pelo adaptador (mesma forma de `PostgresIngestRecordStore.__init__(connection)`).

**Schema, 8 colunas — uma por campo de `LagSummaryRow`** (`dataclasses.fields` → `endpoint`, `observer_region`, `lag_stat`, `lag_p99_ms`, `lag_n`, `lag_resolution_s`, `lag_window_s`, `total_polls`), chave primária composta `(endpoint, observer_region)` — uma linha por chave, nunca uma linha por amostra bruta, satisfazendo `RNF-1` literalmente.

### D2 · Mesclagem conservadora — a peça que resolve a tensão `RF-3` × `RNF-1`

`record_batch` não faz `INSERT` simples nem substitui a linha — para cada `LagSummaryRow` recebida, faz um `UPSERT` que combina com a linha existente (se houver) por:

```
lag_n_novo        = lag_n_existente + lag_n_recebido
lag_p99_ms_novo   = max(lag_p99_ms_existente, lag_p99_ms_recebido)   # None trata como -infinito
total_polls_novo  = total_polls_existente + total_polls_recebido
lag_resolution_s, lag_window_s, lag_stat, endpoint, observer_region: inalterados (são identidade da chave, não medição)
```

**Por que `max`, não uma média ponderada nem recálculo exato:** um `p99` exato de duas amostras só é recomputável com os dados brutos das duas — que `RNF-1` proíbe guardar. `max(p99_a, p99_b)` é a única combinação que preserva a doutrina que `SPEC-001 §5.2` já fixa para esta feição do sistema inteira: **"o erro é sempre pessimista: a plataforma diz que soube mais tarde do que soube, nunca mais cedo"**. Tomar o maior `p99` já observado entre todas as rodadas é exatamente essa doutrina aplicada à mesclagem — nunca promove uma série com um número mais otimista que uma rodada anterior já mediu. É **monotônico não-decrescente** por construção: o `p99` armazenado só sobe ou empata, nunca cai, o que também é o que `CA-F1-4` do PRD pede para `lag_n` (aqui generalizado para `p99`).

**O que isto NÃO é:** não é a mediana nem a média de dois `p99`s (`RN-3` do PRD proíbe média/mediana **no cálculo do carimbo**; esta regra é sobre como o *insumo* do carimbo — o `p99` armazenado — se atualiza entre rodadas, e `max` não é média nem mediana, é o mesmo espírito de "nunca subestimar" um passo antes).

**Custo da aproximação, declarado:** `max(p99_a, p99_b)` é enviesado para cima com o tempo — cada rodada nova só pode aumentar o `p99` guardado, nunca corrigir para baixo mesmo que a distribuição real tenha mudado (ex.: a Coinalyze melhora a latência do endpoint). Isso é aceitável aqui porque a consequência de errar para cima é "a série demora mais para sair da quarentena", nunca "promove cedo demais com dado que ainda não devia ser lido" — o mesmo viés que `SPEC-001 §5.2` já escolhe deliberadamente. Se a Coinalyze de fato melhorar a latência de um endpoint de forma permanente, o `p99` travado alto é dívida a resolver com um mecanismo de expiração/reset — **fora do escopo desta ADR**, nomeado como `[GAP futuro]` abaixo.

### D3 · A porta, mínima

```
record_batch(rows: Sequence[LagSummaryRow]) -> None   # grava OU mescla (D2), nunca substitui
read(endpoint: str, observer_region: str) -> LagSummaryRow | None
read_all() -> Sequence[LagSummaryRow]
```

Sem método de "reset"/"delete" — apagar uma linha de defasagem é ato manual fora desta porta (mesmo nível de proteção que o registro de `md.ingest_run` já tem: nada no código apaga um run).

## Alternativas recusadas — com o custo

| alternativa | custo | por que perde |
|---|---|---|
| Guardar toda amostra bruta (`AvailabilityLagSample.lag_ms`), recalcular `p99` exato a cada leitura | store cresce ~linear com o tempo de vida do probe, sem teto — viola `RNF-1` literalmente | `RNF-1` é requisito explícito do PRD, não uma preferência |
| Janela rolante (guardar só as últimas `K` amostras brutas por chave, `p99` recalculado sobre a janela) | teto real (não cresce sem limite), `p99` mais fiel à distribuição atual (corrige melhorias de latência) | mais um parâmetro (`K`) para justificar e testar; mais uma tabela (amostras) além da tabela de resumo; nenhum requisito do PRD pede recálculo fiel a mudanças de latência — a doutrina vigente já prefere pessimismo sobre precisão. Fica nomeada como candidata se `[GAP futuro]` (abaixo) precisar de resposta |
| Média ponderada dos dois `p99`s por `n` | ainda "estimador central" — exatamente o que `PRD-001`/`SPEC-001` já mediram como **otimista em metade dos casos** e proibiram (`RN-3`) | reabre uma decisão que este mesmo domínio já fechou com número (`21,96%` das janelas invertem sinal) |
| Terceiro motor de armazenamento só para este store | nenhum ganho nomeado sobre reusar o motor de `ADR-031` | viola `[PREMISSA-OWNER]` "só o Postgres" e adiciona superfície sem justificar |
| Segunda variável de config (`LAG_SUMMARY_BACKEND`) independente de `INGEST_RECORD_BACKEND` | permite configuração inconsistente entre registro e defasagem, sem benefício nomeado | mesma decisão de composição duplicada por acidente |

## Falsificadores

| # | observação que derruba | o que derruba |
|---|---|---|
| **F1** | duas rodadas do mesmo `(endpoint, observer_region)` produzem `p99` armazenado **menor** que uma rodada anterior | **D2** — a mesclagem não é `max`, ou tem bug de comparação com `None` |
| **F2** | `lag_n` armazenado após duas rodadas é diferente da soma das duas rodadas | **D2** — a mesclagem de `lag_n` está errada |
| **F3** | tamanho do store cresce por amostra em vez de por chave `(endpoint, observer_region)` — mais de 1 linha por chave depois de N rodadas | **D1**/`RNF-1` — o schema não é "uma linha por chave, atualizada" |
| **F4** | equivalência de fingerprint entre os dois adaptadores (mesmo teste de `ADR-031/F1`, aplicado a este store) reprova | **D1** — o adaptador Postgres altera o dado que o SQLite não altera |
| **F5** | `lint-imports` acusa `psycopg`/`sqlite3` fora de `infra` | **D1** — vazamento de motor, mesmo portão de `ADR-031/F5` |

## Co-assinatura `quant-architect` (2026-09-08)

Pendência nomeada por `gates/PRD-005-architect.md` §"Perguntas... para o owner", item "Co-assinatura `quant-architect`". Três itens; dois confirmados, um ajustado.

### C1 · `D2` (mesclagem `max`/soma) — **confirmado, sem alteração**

`max(p99_a, p99_b)` é monotônico não-decrescente por construção e implementa literalmente a doutrina de `SPEC-001 §5.2` ("o erro é sempre pessimista"). `lag_n`/`total_polls` somados é contagem simples, sem violar suposição distribucional nenhuma. Nenhuma alternativa da tabela de "Alternativas recusadas" bate esse custo sem reabrir `RN-3` (proibição de média/mediana) ou `RNF-1` (amostra bruta sem teto) — confirmo `D2` como correto do ponto de vista estatístico, nos termos que o cabeçalho desta ADR pedia.

### C2 · `REGIME_N_MIN = 200` (`SPEC-005 §3.2`) — **confirmado, com a ressalva escrita**

Por método de posto mais próximo (`p99`, `availability_lag_stats.py:35-48`), `rank = ceil(0.99·n)`. Para uma rodada isolada de `n=200`, isso é o 3º maior valor da amostra — estimativa de cauda instável (poucos pontos informam o percentil) se fosse computada uma única vez sobre um lote de 200. **Mas não é assim que o sistema usa o número**: cada rodada calcula seu próprio `p99` sobre o lote que colheu (`n` tipicamente bem menor, `n=36`/`n=7` por `SPEC-005 §3.2`), e `D2` funde por `max` entre rodadas — o valor armazenado tende ao **maior lag já visto** em qualquer rodada, não a uma média de posto fixo sobre 200 amostras agrupadas. Isso é **a favor** da doutrina pessimista (converge para cima, nunca subestima), não contra ela. `REGIME_N_MIN=200` como piso de "amostra total acumulada suficiente para confiar nesse `max` acumulado" é portanto um limiar de engenharia razoável — duas ordens de grandeza acima do `n=36/n=7` de rodada única, alcançável dentro do orçamento (`RNF-2`) — mas **não é uma garantia estatística de estabilidade do `p99`** e devo dizer isso explicitamente: `[OPINIÃO, quant-architect]`, não `[MEDIDO]` — nenhuma variância real de `p99` entre duas janelas independentes foi medida ainda (o próprio falsificador de `§3.2` já pede exatamente essa medição). Confirmo `200` como ponto de partida aceitável **porque** o falsificador nomeado em `SPEC-005 §3.2` já existe e é a forma correta de revisar o número quando o dado real chegar — não decido isso "no papel" contra dado nenhum.

### C3 · Nome do membro de `AvailabilitySource` (`SPEC-005 §3.3`) — **ajustado, com justificativa**

`SPEC-005 §3.3` propõe `AvailabilitySource.OBSERVED` para o retorno do ramo medido, com a opção de eu nomear um terceiro membro se `OBSERVED` for semanticamente errado. **`OBSERVED` está errado, e um terceiro membro também está errado — a resposta é reusar `AvailabilitySource.MODELED`, sem criar membro novo:**

- `SPEC-001 §2.2` (`docs/specs/SPEC-001-plataforma-dados.md:126`), literal: `availability_source ∈ { OBSERVED, MODELED }` — conjunto fechado de **dois** valores, não três. `SPEC-005 §2` declara explicitamente que não reabre `SPEC-001 §5.2` — logo não pode alargar esse enum sem reabrir a ADR que o fecha.
- `SPEC-001 §5.2` (linhas 402-407), literal: *"Carimbo MODELED, conservador por construção: `available_at_MODELED = próximo ponto da grade nativa >= (bucket_end + p99_lag(endpoint, observer_region) + margem)`"* — **esta é, termo a termo, a mesma fórmula** que `SPEC-005 §3.3` está implementando (`próximo ponto de native_grid >= bucket_end_ms + lag_p99_ms + margin_ms`). `SPEC-001` já nomeou este exato cálculo "carimbo MODELED" com `availability_source = MODELED`, antes de `SPEC-005` existir.
- O código já em produção corrobora, escrito antes desta feature: `domain/live_availability_write.py:35`, docstring do módulo irmão (o ramo não-medido, `T-06.6`) — *"`SPEC-001` §5.2's **other branch** (**the MODELED formula** rounded to the native grid) is a different computation..."* — o próprio módulo que `SPEC-005 §3.3` cita como vizinho ("ao lado de `live_availability_write.py`") já chama o ramo medido de "the MODELED formula", não "the OBSERVED formula".
- `docs/specs/SPEC-001-plataforma-dados.md:532` (contrato de exibição do painel) trata os dois ramos — nulo (não medido) e calculado (medido) — como a **mesma** categoria de exibição (`MODELED` em tinta fraca com `~`, com `idade ?` só quando `available_at` é nulo) — reforça que a distinção entre "nunca medido" e "medido e calculado" já vive em `available_at IS NULL`, não em `availability_source`.

**Ajuste:** `resolve_measured_endpoint_availability` devolve `(available_at_ms, AvailabilitySource.MODELED)`, não `OBSERVED`. `AvailabilitySource.OBSERVED` fica reservado para um consumidor futuro que de fato observe o evento ao vivo (nenhum existe nesta feature). Nenhum terceiro membro nasce — o enum de dois valores de `SPEC-001 §2.2` continua fechado. Editado em `SPEC-005 §3.3` para manter os dois documentos consistentes (ver diff desta mesma sessão).

## `[GAP futuro]` — nomeado, não resolvido aqui

Se a Coinalyze melhorar a latência de um endpoint de forma permanente e o `p99` travado por `D2` impedir uma promoção que deveria acontecer, a resposta é um mecanismo de expiração/reset do `p99` acumulado (ex.: janela rolante por tempo, ou reset manual documentado) — dono: quem abrir esse achado, quando o achado existir. Não é `TBD` desta feature porque não há evidência hoje de que a latência da Coinalyze tenha melhorado — é hipótese, não fato medido.
