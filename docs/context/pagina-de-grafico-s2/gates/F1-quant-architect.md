# Gate de domínio — F1 (`pagina-de-grafico-s2`), as duas rotas de backend — `quant-architect`

**Executor:** `quant-architect` · **Data:** 2026-09-08
**Mandato:** decidir `[Q5]` (enum de `bar_policy`), confirmar/corrigir o ponto de leitura do
envelope de histórico, e como expressar ausência de OI/CVD no schema de linha. **Não implemento
nada** — decisão de contrato para uma SPEC ainda não escrita.

**Fontes lidas por inteiro:** `docs/adr/ADR-005-transporte-de-leitura.md` (D1-D6 e a emenda
2026-09-03) · `docs/specs/PRD-006-pagina-de-grafico-s2.md` §5/§9/§10 · `docs/specs/SPEC-001-
plataforma-dados.md` §2.3-2.6, §3.1-3.2, §5.11-5.12 · `docs/adr/ADR-002-motor-de-armazenamento.md`
D6c-D6d · `backend/src/modules/sentimento/domain/{as_of_accessor,cvd,series_key,provenance,
cvd_source_catalog}.py` · `backend/src/modules/sentimento/{infra/postgres_series_sink,infra/
series_row_wire,use_cases/write_series_row}.py` · `docs/context/captura-em-producao/gates/F2-
series-ddl.md`.

---

## ⚠️ Achado que precede as três perguntas — BLOQUEANTE para F1, não nomeado pelo PRD nem pelo
## Gap Analysis do `/architect`

**`md.series` — a tabela que `captura-em-producao` grava e que F1 se propõe a ler — NÃO TEM
COLUNA DE VALOR.** Não existe hoje nenhum lugar no caminho de escrita onde o número (nível de OI,
`cvd_delta`, preço) é persistido. Evidência, quatro fontes independentes, todas concordando:

```
$ sed -n '40,59p' backend/src/modules/sentimento/infra/postgres_series_sink.py   # CREATE TABLE md.series
# 15 colunas: series_key_id, symbol, source, bucket_end, event_time, available_at,
# availability_source, ingested_at, observed_at, provenance, src_label_raw, observer_id,
# observer_region, is_final, principal_id — NENHUMA é numérica de mercado
```

- `SeriesRow` (`domain/provenance.py:164-178`) tem exatamente os mesmos 15 campos — a identidade,
  o bucket e as sete colunas de procedência de `SPEC-001` §3.1. Nenhum campo `value`.
- `series_row_wire.py` (`FIELD_NAMES`, o único `encode`/`decode` do wire Redis, `D1.1`) transcreve
  os mesmos 15 nomes — o valor nunca atravessa a fila.
- `SPEC-001` §3.2 ("Série de mercado") lista chave e regra de invalidez sobre as sete colunas de
  procedência e não nomeia coluna de valor nessa tabela de contrato.
- **E o próprio `ADR-002/D6c` já esperava o contrário**: ao definir `content_hash` de
  `md.partition_registry`, escreve literalmente *"sha256 sobre a projeção canônica das linhas da
  partição (**as sete colunas de procedência + colunas de valor**)"* (`ADR-002-motor-de-
  armazenamento.md:261-262`) — a ADR presume um "colunas de valor" que nunca chegou a existir no
  `SeriesRow` real.

`as_of_accessor.Observation` (linha 187-202) já **sabe disso e contorna**: pareia
`row: SeriesRow` com `value: Decimal` à parte, "keeps `provenance.py` untouched" — mas isso só
funciona hoje porque `Observation` é construído à mão em teste (`test_as_of_accessor.py:129`,
`Observation(row=row, value=Decimal(value))`). **Não existe nenhum caminho de produção que
produza esse `value` a partir do que está gravado**, porque o que está gravado não o carrega.

**Consequência direta para F1:** a US-1 diz *"lê o registro que `captura-em-producao` já grava"*
— e ele grava procedência, não o número. A rota de histórico não tem hoje nada para servir além
de metadados de proveniência. Isto não é um detalhe de "novo ponto de leitura" (a pergunta que o
handoff fez) — é um **gap de escrita** anterior a qualquer leitura, e um column de valor (`Decimal`
serializado como texto, mesma disciplina de `SPEC-001` §2.6 sobre string bruta da fonte — nunca
`float`) precisa ser adicionado a `md.series`/`SeriesRow`/`series_row_wire.py` antes de F1 poder
servir dado real. **Dono: `/architect` + `quant-architect` juntos** (é schema do módulo
`sentimento`, e a forma da coluna — uma vs. até quatro para OHLC, `Reduction` — é decisão de
domínio). Se `captura-em-producao` já está gravando em produção sem essa coluna, todo dado já
capturado terá de ser re-ingerido depois que a coluna existir — custo operacional que precisa
entrar na decisão do owner sobre `advance DONE` daquela feature, não só desta.

Registro isto primeiro porque as três respostas abaixo pressupõem que essa coluna vai existir —
elas descrevem a FORMA da leitura assumindo que há algo para ler.

---

## `[Q5]` — Enum de `bar_policy`: **2 valores, reusar o que já existe em código, sem 3º valor**

`backend/src/modules/sentimento/domain/as_of_accessor.py:54-70` já declara e testa o enum:

```python
class BarPolicy(Enum):
    FINAL_ONLY = "final_only"   # R-2 aplica: só bucket fechado, is_final != False
    INTRABAR   = "intrabar"     # R-2 não aplica: bucket em formação é admissível
```

**Decisão: a rota HTTP de histórico (`/series-history`) aceita exatamente esses dois valores de
fio, `"final_only"` e `"intrabar"`, mapeados 1:1 para `BarPolicy` — nenhum terceiro valor.**

Por quê o "bucket fechado sem replay" que o handoff cogitou **não** é um terceiro estado:
- A separação por CLASSE DE TEMPO já é o papel de `D1` — duas rotas, não um terceiro `bar_policy`.
  "Bucket fechado, ao vivo, sem replay" é exatamente o que `/series-live` (SSE) serve; não é um
  modo do histórico.
- No histórico, `intrabar` não é vestigial: `knowledge_time` de um replay pode cair NO MEIO de um
  bucket ainda não fechado a esse instante (ex.: reconstruir "como estava a tela 3 minutos atrás"
  quando o bucket de 5m corrente só tinha 3 min). `final_only` corta esse bucket fora;
  `intrabar` o admite com `is_final=false`. As duas leituras são respostas legítimas e DIFERENTES
  à mesma pergunta "que barra existia em T", e é exactly a distinção que `_r2_admits`
  (`as_of_accessor.py:409-420`) já implementa e testa.
- `ReadPurpose` (mesmo módulo, linha 73-91) já fecha o único caso perigoso: `intrabar` é RECUSADO
  quando `purpose=ENTRY_CONDITION` (`_refuse_intrabar_for_entry`, linha 398-406). **F1 chama
  sempre com `purpose=RENDERING`** — nunca `ENTRY_CONDITION` — porque a rota serve gráfico, não
  decisão de entrada; isso é o mecanismo que já existe, não uma regra nova a escrever.
- `intrabar` NUNCA é default em lugar nenhum do módulo (`BarPolicy`'s próprio docstring, linha
  54-61) — a rota tem de recusar (`422`) uma requisição que omita `bar_policy`, não assumir
  `final_only`.

**`/series-live` (SSE) não recebe `bar_policy` como parâmetro** — `D2` já fixa o envelope de
bucket parcial com 5 campos fechados (`bucket_open_ts, cvd_delta_parcial, last_price, n_trades,
seq`), e ele é estruturalmente sempre "o bucket em formação, ao vivo"; não há uma segunda opção a
declarar nesse canal. Se isso estiver errado, é `D2` que muda, não este enum.

---

## Ponto de leitura do envelope de histórico — confirmado em parte, corrigido em parte

**Confirmado:** `as_of_accessor.as_of()` é o acessor correto e ÚNICO para o ponto de decisão
anti-lookahead (R-1/R-2/`knowledge_time`/LOCF-por-`nature`) — a rota não deve reimplementar nada
disso. `cvd.py` e `series_key.py` também são as peças certas para, respectivamente, o fato
`cvd_delta` por bucket nativo de 1 min e a resolução de `SeriesKey`/`series_key_id`.

**Corrigido — não existe hoje nenhum use-case que a rota possa simplesmente chamar.**
`as_of()` é uma função PURA sobre `Sequence[Observation]` já carregada em memória; ela não
consulta o banco. `postgres_series_sink.py` só tem `accept`/`observed_already_present` — **é
write-only, sem nenhum `SELECT` de janela** (`grep -rln SELECT backend/src/modules/sentimento/
infra/*.py` não inclui um leitor de `md.series` por intervalo). F1 precisa construir DOIS
componentes novos, nenhum reuso puro:

1. **um leitor de janela** (`infra`, novo — `psycopg` só é permitido em `infra`, `ADR-031/F5`):
   `SELECT` sobre `md.series` por `(series_key_id, symbol)` com `bucket_end` cobrindo
   `[janela.start − lookback_ms, janela.end]`. `lookback_ms` tem de ser `>= max(bucket_interval_ms,
   asof_max_staleness_ms)` para o carry-forward de `STOCK` (`D4.11`) ter matéria-prima — sem essa
   margem, o primeiro ponto da janela nasce `SEM_PONTO` mesmo quando um valor observável existe
   fora da janela pedida;
2. **um use-case novo** (`use_cases`, novo — o "novo ponto de leitura" que o handoff perguntou se
   seria necessário: **sim**) que, para cada instante de grade dentro da janela, chama
   `as_of(t=grade, purpose=ReadPurpose.RENDERING, bar_policy=<do request>, knowledge_time=<do
   request>, observations=<lidas pelo leitor de janela>)` e projeta o resultado na célula de `D3`.

**Achado adicional, fora do escopo estrito da pergunta mas que o mesmo `cvd.py` obriga a nomear:**
`CVD_BUCKET_WIDTH_MS = 60_000` é fixo — "NOT a parameter" (`cvd.py:27-30`) — e o próprio módulo
declara que agregar para uma grade mais grossa (5m/15m, que é exatamente o `interval` que a chave
da rota carrega) **é job do CALLER**, que hoje **não existe em lugar nenhum do código**
(`grep -rn 'cvd_delta_by_bucket\|cvd_cum' backend/src/modules/sentimento --include='*.py' | grep
-v test | grep -v domain/cvd.py` só acha citações em comentário, zero chamador real). Chamar
`as_of()` ingenuamente com `bucket_interval_ms=300_000` sobre fatos gravados em grade de 1 min
NÃO soma os cinco minutos — devolve só o último fato de 1 min dentro da janela, o que **subestima
silenciosamente** o `cvd_delta` de 5m/15m sempre que o painel não estiver na grade nativa. Isso é
exatamente a classe de defeito que este papel existe para barrar (número inventado por omissão de
soma). **`[NÃO SEI]` com dono**: se a S2-mínima serve CVD só na grade nativa de 1 min (contorna o
problema) ou precisa de uma função nova de reagregação — não decido aqui porque não está no
escopo desta pergunta, mas a SPEC de F1 **precisa** responder isso explicitamente antes de
implementar, com a política de cobertura parcial (5 de 5 minutos presentes vs. 3 de 5) declarada,
não implícita.

---

## Ausência de OI/CVD no schema de linha

**Não omitir o campo — carregar um par discriminado, espelhando o invariante que
`AsOfReading.__post_init__` (linha 227-238) já prova em teste**: exatamente um de `value`/
`absence` é não-nulo, nunca os dois, nunca nenhum. `AsOfReading.projection()` (linha 240-257) já
é a forma de fio candidata — reusar, não reinventar:

```json
{ "event_time": 1700000000000, "available_at": 1700000012000,
  "value": "1234.56", "absence": null }
{ "event_time": 1700000060000, "available_at": null,
  "value": null, "absence": "SEM_PONTO" }
```

`absence` usa os quatro valores fechados de `Absence` (`provenance.py:97-118`:
`SEM_PONTO`/`NAO_LIDO`/`QUARENTENA`/`SEM_FONTE`) — nunca um booleano `is_absent`, porque `SPEC-001`
§5.11 dá painéis DIFERENTES para `SEM_PONTO` (grade tem bucket, fonte não publicou) e `SEM_FONTE`
(nenhuma fonte jamais teria, ex. `nq` antes da primeira captura viva) — colapsar os dois num bit
apaga a distinção que motiva o gap `[GAP G5]`/`CA-F1-6`. `value:null` sozinho (sem o par `absence`)
é exatamente a ambiguidade que `CA-F2-3`/`D5.2`/`D5.3` existem para proibir: "zero legítimo" (FLOW)
tem de ser distinguível de "não há número" — omitir o campo, ou usar `0`, colapsa os dois.

**Preço não segue este caminho hoje** por estar fora do escopo desta pergunta (o handoff pediu
OI/CVD) — mas se Preço também for lido via `as_of()` (mesma forma de leitura, `nature` diferente),
a mesma forma discriminada se aplica sem alteração; não decido aqui se Preço tem uma política de
ausência distinta.

---

## O que não decido aqui

Nome exato dos campos JSON (camelCase vs. `snake_case` no fio) e a forma do envelope
sessão/painel/célula completo — isso é `D3`/`D6`, já decidido, e a SPEC que vier decide a
serialização; eu decido a FORMA lógica (par discriminado, enum fechado), não o nome de chave.
Tamanho de `lookback_ms` exato por `nature`/timeframe — depende de medição real sobre o dado que
`captura-em-producao` gravar, `[NÃO MEDIDO]`.
