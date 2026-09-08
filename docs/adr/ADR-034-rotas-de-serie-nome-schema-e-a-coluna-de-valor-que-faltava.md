# ADR-034 — Rotas de série: nome, schema de linha, `bar_policy`, fronteira `charts`↔`web`, e a coluna de valor que faltava em `md.series`

**Data:** 2026-09-08 · **Status:** proposta · **SPEC:** [`SPEC-006`](../specs/SPEC-006-pagina-de-grafico-s2.md)
**Fase:** `F0`/`F1`/`F2` · **Componentes alvo:** `sentimento` (F0/F1), `web` (F1/F2), `charts` (nenhuma linha nova — só a superfície exportada em F2)
**Co-assinatura:** `quant-architect` (F0, `bar_policy`, schema de linha, ponto de leitura) · `frontend-architect` (nomes de rota, bookmark, exceção ESLint)
**Origem:** `ADR-005/D1-D6` decidiu o PROTOCOLO (histórico HTTP endereçável por conteúdo, SSE, envelope de bucket, `bar_policy` do consumidor, porta no backend, rows-não-texto). Esta ADR fecha o que `D1-D6` deixaram como `TBD`: os NOMES exatos, o schema de linha exato, e — achado nesta rodada, não antecipado por `ADR-005` — uma coluna que nunca existiu.

## Contexto

`PRD-006` pede as duas rotas que `ADR-005/D1` exige e que nunca foram construídas. O Gap Analysis
do `/architect` (`docs/context/pagina-de-grafico-s2/gates/PRD-006-architect.md`) aprovou o PRD e
despachou `frontend-architect` (nomes, bookmark, boundary `charts`↔`web`) e `quant-architect`
(`bar_policy`, schema de linha, ponto de leitura) — relatórios completos em
`docs/context/pagina-de-grafico-s2/gates/F1-F2-frontend-architect.md` e `.../F1-quant-architect.md`.
O segundo devolveu um achado que precede todas as três perguntas que lhe foram feitas: **`md.series`
não tem coluna de valor.**

---

## D1 · Nomes das duas rotas de backend: **`/series-history`** (HTTP) e **`/series-live`** (SSE)

Decidido por `/architect`, por simetria com o vocabulário já em produção (`/series-catalog`,
`/series-quarantine`, `/collector-status`, `/ingest-health` — todos `<domínio>-<substantivo>`,
hífen, sem verbo). Nenhuma das duas nomeia o formato de transporte (não é `/series-sse`) porque o
transporte é detalhe de implementação, não de identidade do recurso — mesmo argumento que já vale
para as 4 rotas existentes.

**Alternativas recusadas:** `/series/history` + `/series/live` (aninhamento por barra) — recusada
por divergir do padrão FLAT já estabelecido nas 4 rotas existentes, sem ganho declarado. `/candles`
— recusada por nomear a REPRESENTAÇÃO visual (candle) em vez do RECURSO (série), e o payload não é
exclusivamente candle (carrega OI/CVD também).

**Falsificador:** uma 5ª rota nova que precise do mesmo padrão e escolha nome divergente sem
justificar o desvio é a evidência de que o padrão não pegou.

## D2 · Nome do segmento de página Next: **`symbol`**; sucessor de `/painel`: **`console`**

Decisão de `frontend-architect`, adotada integralmente — `docs/context/pagina-de-grafico-s2/gates/
F1-F2-frontend-architect.md`. Âncoras medidas: `symbol` casa com o nome canônico aprovado no Stitch
(*"S2 Símbolo — Operacional Core Rev. B"*, `STITCH_CONTEXT.md:5,130,145,197`) e com o campo
dominante já presente em `history-transport.ts`/`live-transport.ts`; `console` casa com o nome
canônico da tela atual (*"S1 Console — Diagnóstico Operacional (Rev. B)"*, `STITCH_CONTEXT.md:
6,131,409,415`) e com o diretório de código já existente (`frontend/src/features/s1-console/`).

**Alternativas recusadas, com custo:** `chart`/`market` para a rota nova (zero âncora, introduzem
sinônimo) · `dashboard`/`panel`/`overview` para o sucessor de `/painel` (zero âncora, ou colidem
com o vocabulário de "panels" que `RF-4` já usa para os blocos Preço/OI/CVD da própria página nova).

**Consequência declarada, não pedida por `[Q1]`/`[Q2]` mas decorrente:** `/` continua redirecionando
para o sucessor de `/painel` (agora `/console`), não para `/symbol` — mudar o alvo de `/` é decisão
de produto fora do gatilho desta rodada (`PRD-006 NG-8`).

## D3 · Bookmark antigo de `/painel`: **redirect 308 permanente, sem middleware novo**

Decisão de `frontend-architect`. `frontend/next.config.ts` já tem um array `redirects()` (é o
mecanismo que hoje resolve `/` → `/painel`); a entrada nova é `{ source: "/painel", destination:
"/console", permanent: true }`, no mesmo array. O `/` → `/painel` existente nasceu `permanent:
false` porque o nome do destino ainda não estava decidido (`CLAUDE.md` linha 12) — esta ADR fecha
esse nome, então o motivo do 307 deixa de existir e o redirect de `/painel` nasce 308.

**Alternativa recusada:** `404` com link — descartada porque o custo real do redirect (medido
depois de ler `next.config.ts`) é **uma linha em array já existente**, não infraestrutura nova; o
menu `M2` do PRD estimava esse custo como maior do que é.

**Falsificador:** `curl -sD - <base>/painel` depois de F3 sem header `Location: /console` e status
`308` ⇒ `CA-F3-4` reprova.

## D4 · `bar_policy`: **dois valores, os que já existem em código — `final_only` e `intrabar`. Sem 3º valor**

Decisão de `quant-architect`, reusando `BarPolicy` já declarada e testada em
`as_of_accessor.py:54-70`. A rota `/series-history` aceita exatamente esses dois valores de fio,
mapeados 1:1; `intrabar` nunca é default — requisição que omita `bar_policy` recebe `422`.
`/series-live` (SSE) não recebe `bar_policy`: `D2` de `ADR-005` já fixa o envelope de bucket
parcial com 5 campos fechados, estruturalmente sempre "em formação, ao vivo".

**Alternativa recusada:** um 3º valor para "bucket fechado, ao vivo, sem replay" — recusada porque
essa semântica já é o papel da SEPARAÇÃO POR ROTA (`D1` de `ADR-005`: histórico vs. borda direita),
não um modo do parâmetro; inventar um 3º valor duplicaria uma distinção que já existe em outro eixo.

**Falsificador:** uma requisição a `/series-history` com `bar_policy=intrabar` e
`purpose=ENTRY_CONDITION` (se algum consumidor futuro tentar) tem de ser recusada por
`_refuse_intrabar_for_entry` (`as_of_accessor.py:398-406`) — `F1` chama sempre com
`purpose=RENDERING`, nunca `ENTRY_CONDITION`, e se algum caller futuro violar isso, o mecanismo já
existente é quem barra, não uma regra nova.

## D5 · Schema de linha: **par discriminado `(value, absence)`, nunca `null` isolado nem `0`**

Decisão de `quant-architect`, reusando a forma que `AsOfReading.projection()`
(`as_of_accessor.py:240-257`) já prova em teste — exatamente um de `value`/`absence` é não-nulo:

```json
{ "event_time": 1700000000000, "available_at": 1700000012000, "value": "1234.56", "absence": null }
{ "event_time": 1700000060000, "available_at": null,            "value": null,      "absence": "SEM_PONTO" }
```

`absence` usa os 4 valores fechados de `Absence` (`SEM_PONTO`/`NAO_LIDO`/`QUARENTENA`/`SEM_FONTE`,
`provenance.py:97-118`) — nunca um booleano. `SPEC-001 §5.11` dá painéis diferentes para `SEM_PONTO`
(grade tem bucket, fonte não publicou) e `SEM_FONTE` (nenhuma fonte jamais teria) — um bit colapsa
essa distinção.

**Alternativa recusada:** omitir o campo quando ausente — ambíguo com "linha não existe" e é
exatamente o defeito que `CA-F2-3`/`D5.2`/`D5.3` existem para proibir. **Alternativa recusada:**
`value: 0` — colapsa "zero legítimo" (ex. CVD delta plano) com "não há número".

**Falsificador:** uma linha com `value` e `absence` ambos não-nulos, ou ambos nulos, é `AsOfReading`
mal-formado — o mesmo invariante que `__post_init__` (linha 227-238) já recusa em teste; a rota
tem de recusar (erro 500 nomeado, nunca servir) se algum caminho novo o produzir.

## D6 · Escopo de F1: **grade nativa de 1 minuto, sem reagregação de `interval`**

**Achado de `quant-architect`, decidido aqui:** `CVD_BUCKET_WIDTH_MS = 60_000` é fixo por
declaração do próprio módulo (`cvd.py:27-30`, *"NOT a parameter"*), e agregar para uma grade mais
grossa (5m/15m/1h/4h — o `interval` que a CHAVE da rota carrega, por `ADR-005/D1`) é *"job do
CALLER"*, que **não existe em nenhum lugar do código** hoje
(`grep -rn 'cvd_delta_by_bucket\|cvd_cum' backend/src/modules/sentimento | grep -v test | grep -v
domain/cvd.py` → 0 chamadores reais). Chamar `as_of()` ingenuamente sobre um `interval` mais
grosso que a grade nativa **subestima silenciosamente** o `cvd_delta` (devolve só o último fato de
1 min dentro do bucket pedido, não a soma).

**Decisão:** `F1`/`F2` desta SPEC servem e renderizam **exclusivamente a grade nativa de 1
minuto** (`interval=1m`). Uma requisição a `/series-history` com outro `interval` recebe `422` —
recusar, nunca servir número subestimado. Preço e OI seguem `as_of()` normalmente (não têm o
problema de soma — `as_of` já faz carry-forward por `nature` via `asof_max_staleness_ms`, `ADR-006`);
só CVD delta/acumulado tem a restrição de grade.

**Alternativa recusada:** construir a função de reagregação de CVD nesta SPEC — recusada porque
amplia F1 além do que `PRD-006 §2`/item `5.1` pede ("4 dias, painéis Preço+OI+CVD", sem seletor de
timeframe nas user stories) e introduz uma peça de domínio nova (política de cobertura parcial: 5
de 5 minutos presentes vs. 3 de 5) que nenhum documento desta feature especificou. Fica nomeado
como trabalho futuro, dono `quant-architect`, gatilho: o dia em que um seletor de timeframe entrar
no escopo de alguma feature.

**Falsificador:** se `/series-history?interval=5m` (ou qualquer não-1m) devolver `200` com um
`cvd_delta` que não seja a soma dos fatos de 1 min contidos no bucket, `D6` foi violada por
implementação que ignorou a recusa.

## D7 · **A coluna de valor que faltava — `md.series` ganha `value_raw TEXT NOT NULL`**

**O achado que precede D1-D6, medido por `quant-architect` e reconferido por `/architect` em 3
fontes independentes** (`docs/context/pagina-de-grafico-s2/gates/F1-quant-architect.md`;
verificação em `docs/context/pagina-de-grafico-s2/gates/PRD-006-architect.md`, addendum):
`md.series` (`postgres_series_sink.py:40-58`) tem 15 colunas — identidade, bucket, procedência —
**nenhuma numérica**. `SeriesRow` (`provenance.py:144-178`) documenta a omissão como intencional
("the shape of what makes a row VALID", não o número). `series_row_wire.py` transcreve os mesmos
15 nomes. `ADR-002/D6c` já presumia "colunas de valor" que nunca chegaram a existir.

**Decisão:** acrescentar **uma** coluna, `value_raw TEXT NOT NULL`, guardando a STRING CRUA da
fonte — nunca `float`, mesma disciplina de `SPEC-001 §2.6`/:190 ("`Decimal` sobre a string crua do
campo de quantidade... sem serialização intermediária"). Nome espelha o padrão já existente de
`src_label_raw` na mesma tabela (raw = a forma como chega, decodificação é do consumidor). **Uma
coluna, não quatro (OHLC)**: cada `series_key_id` já identifica o QUE está sendo medido (preço,
OI, CVD) — a tabela grava OBSERVAÇÕES pontuais na grade nativa de 1 min, não candles agregados;
OHLC é derivado por quem lê (o `charts`), não gravado na origem.

**Onde muda:** `md.series` (`CREATE TABLE`, `postgres_series_sink.py`), `SeriesRow`
(`provenance.py`, campo novo + `__post_init__` recusando string vazia como já faz para as outras
colunas de texto), `series_row_wire.py` (`FIELD_NAMES`, round-trip de 15→16 campos, testado para
os 4 `Provenance` como já é feito hoje). **F0**, antes de F1.

**Alternativas recusadas:**

| alternativa | custo que a recusa evita |
|---|---|
| 4 colunas OHLC (`value_open/high/low/close`) | presume que toda linha é um candle agregado; a tabela grava observações na grade nativa, e o `charts`/`as_of()` é quem decide a janela de agregação — gravar OHLC na origem duplicaria essa decisão em dois lugares |
| coluna `NUMERIC`/`DOUBLE PRECISION` nativa do Postgres | reabre exatamente o risco que `SPEC-001 §2.6` já mediu contra `float` (arredondamento silencioso); `NUMERIC` do Postgres resolveria precisão mas trocaria a disciplina "Decimal sobre string crua, sem serialização intermediária" por "Decimal sobre tipo do banco", um contrato novo não pedido por nenhum documento |
| adicionar a coluna como `NULL`-ável para não quebrar linhas já gravadas | esconde silenciosamente a mesma ambiguidade que `D5` (par `value`/`absence`) existe para proibir — uma linha com `value_raw IS NULL` seria indistinguível entre "ainda não migrada" e "fonte não publicou" |

**Custo operacional, nomeado e não resolvido aqui — dono: owner:** se `captura-em-producao` já
gravou dado em produção sem esta coluna, toda linha existente precisa de re-ingestão (a coluna é
`NOT NULL`, não há valor retroativo a inferir). `[NÃO MEDIDO: se há dado de produção já gravado —
`captura-em-producao` está `BUILD_AUTHORIZED`, não `DONE`]`. Ver `SPEC-006 §14` (menu do owner).

**Falsificador:** round-trip de `SeriesRow` por `series_row_wire.py` com os 4 `Provenance` × agora
**16** campos (era 15) — mesmo padrão de teste que já existe para os 15. Se o wire aceitar uma
linha sem `value_raw` sem erro, `D7` não está implementada, só declarada.

## D8 · Fronteira `charts`↔`web`: exceção estreita, um barrel, um bloco de ESLint escopado ao diretório novo

Decisão de `frontend-architect`. `frontend/eslint.config.mjs:181-197` proíbe hoje TODA importação
`web→charts` — `T-05.2` fechou sem carvar a exceção que o próprio comentário do arquivo já
antecipava (`:94-96`). `CA-F2-1` exige import de `charts` na página `symbol`; sem a exceção, F2
reprova lint no primeiro import.

**Forma decidida — dois elementos:**

1. **`frontend/src/charts/index.ts`** — barrel novo, único ponto de saída sancionado (execução
   headless S2, composição de painéis, adaptador lightweight, tokens de cor, tipos de política de
   ausência). Construído por F2, não antes.
2. **Bloco de ESLint novo**, mais específico, adicionado DEPOIS do bloco `web` existente (flat
   config: o último bloco que casa arquivo+regra vence) — `files: ["src/app/symbol/**/*.{ts,tsx,
   mts,cts}"]` (só o diretório da rota nova). Dentro dele, `no-restricted-imports.patterns[].group`
   ganha 3 negações (`!**/charts/index`, `!**/charts/index.ts`, `!**/charts/index.tsx`); os 3
   seletores de `no-restricted-syntax` (dinâmico, template literal, `require`) trocam o regex de
   `/(^|\/)charts(\/|$)/` para `/(^|\/)charts\/(?!index(\.tsx?)?$)/`.

**O que NÃO muda:** o bloco `web` original continua intacto para todo o resto — inclusive
`console` (sucessor de `/painel`). Import profundo (`charts/s2-cvd`, por exemplo) continua proibido
mesmo dentro de `symbol/`; só o barrel é liberado.

**Alternativa recusada:** afrouxar o bloco `group` existente para todo `src/app/**` — recusada
porque vazaria a exceção para `console`/`s3-inspector`, que não têm motivo para importar `charts`.

**Falsificador — 3 casos, todos têm de rodar juntos** (`frontend/src/charts/eslint-boundary.test.ts`,
estendido):

| caso | import plantado | onde | esperado |
|---|---|---|---|
| morde-1 (import profundo, dentro da rota liberada) | `from "../../charts/s2-cvd"` | `src/app/symbol/page.tsx` | `eslint` → `rc≠0` |
| morde-2 (contenção de escopo) | `from "../../charts/index"` | `src/app/console/**` | `eslint` → `rc≠0` |
| cala (caminho sancionado) | `from "../../charts/index"` | `src/app/symbol/page.tsx` | `eslint` → `rc=0` |

## D9 · Ponto de leitura de F1: dois componentes novos, nenhum reuso puro

**Achado de `quant-architect`, decidido aqui:** `as_of()` é função PURA sobre observações já
carregadas em memória — não consulta banco. `postgres_series_sink.py` é write-only (nenhum `SELECT`
de janela). F1 precisa de:

1. **leitor de janela** (`infra`, novo — `psycopg` só em `infra`, `ADR-031/F5`): `SELECT` sobre
   `md.series` por `(series_key_id, symbol)` com `bucket_end` cobrindo `[janela.start −
   lookback_ms, janela.end]`; `lookback_ms ≥ max(bucket_interval_ms, asof_max_staleness_ms)` para
   o carry-forward de `STOCK` (`D4.11`) ter matéria-prima;
2. **use-case novo** (`use_cases`): para cada instante de grade na janela, chama `as_of(t=grade,
   purpose=RENDERING, bar_policy=<request>, knowledge_time=<request>, observations=<do leitor>)` e
   projeta pela forma de `D5`.

Nenhum dos dois existe hoje — não é reuso de use-case pronto, é construção nova sobre acessores
existentes. Ambos entram no DoD de F1.

## Consequência

- `SPEC-006` nasce com **F0** (schema) antes de **F1** (rotas) — dependência real, não cerimônia.
- `ADR-005` não é reescrita: `D1-D6` continuam de pé; esta ADR fecha o que era `TBD` e nomeia uma
  lacuna que `ADR-005` não podia ver (schema de escrita é de outra ADR/feature).
- `ADR-002/D6c` ganha um remendo textual pendente (a frase "colunas de valor" deixa de ser
  presunção e passa a apontar para `value_raw`) — ato de quem for revisar `ADR-002`, não desta ADR.

## Falsificador geral desta ADR

Se, depois de F0-F2 implementadas, `/series-history` servir um valor que não veio de `value_raw`
(por exemplo, um `MOCK`/fixture escondido atrás de uma flag), ou se `md.series` continuar sem a
coluna e F1 "funcionar" servindo só metadados sem ninguém notar, esta ADR falhou silenciosamente —
o mesmo modo de falha que a doutrina de `CLAUDE.md`/`RN-5` (sem fixture em produção) já nomeia.
