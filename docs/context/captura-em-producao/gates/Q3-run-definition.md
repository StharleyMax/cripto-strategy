# Gate `quant-architect` sobre `[Q3]` — definição de run (`captura-em-producao`, `F1`)

**Assina:** `quant-architect`. **Data:** 2026-09-07. **Fecha:** `SPEC-004 §3.3` (a)–(i), `§8 [Q1]/[Q2]/[Q3]/[Q11]`, cabeçalho `P7`/`P9` de `docs/context/captura-em-producao/tasks_review.md` §1. **Pré-condição de fechamento de `F1`** (`plano 01` item 1.6, `D1.6`). **Co-assina** `ADR-031/D3` — ver §7.

**Não reabre** `ADR-030` (fórmulas de `collector-status` sobre runs já existentes) nem decide `[Q10]` (`md.ingest_gap` por reconexão; destino de mensagem envenenada) — aquilo é `T-02.1`, `F2`.

---

## 1. O que é "um run" — stream e ciclo, sem hedge

`ADR-031/D3`, literal: *"O coletor registra a sessão/ciclo através do mesmo adaptador de `D1`, no fechamento dela"*. `SPEC-004 §3.1` fixa os três gatilhos de fechamento: fechamento limpo, reconexão, `SIGTERM`. Esta seção fixa o que cada um produz.

### 1.1 `!forceOrder@arr` (stream) — um run = uma **sessão** de conexão

Uma **sessão** é o intervalo `[abertura, fechamento]` de **uma** conexão WebSocket ao endpoint. `reconnect_and_key`/`perform_overlap_handoff` (`use_cases/reconnect_force_order_stream.py:46-72`) já fecham a conexão antiga **depois** de a nova provar a primeira mensagem (`B1`, `ADR-004`); o instante `old_source_closed_at` **é** o `ended_at` da sessão que está fechando. Três gatilhos de fechamento, três runs distintos:

1. **Reconexão** (`B1`): a sessão antiga fecha em `old_source_closed_at`; a nova sessão abre em `new_first_message_at` (o mesmo timestamp que a antiga registra como fim é o `started_at` — aproximado — da que segue; `window` de cada uma usa o seu próprio par).
2. **Falha do Redis em regime** (`B2`): `XADD` falhou ⇒ a sessão fecha ali, `verdict=REJECTED`, e o processo sai `rc ≠ 0` (`restart: unless-stopped` abre uma sessão nova).
3. **`SIGTERM`** (`B14`): a sessão corrente fecha, `verdict` do conjunto de `KNOWN_VERDICTS` conforme o que ela publicou, `rc=0`.

**Uma sessão nunca é maior que uma conexão.** Isto significa que um coletor rodando 24 h sem cair produz **um** run só se a conexão nunca cair — o caso comum, dado que `!forceOrder@arr` não tem código de reposição e a única razão documentada para reconectar é a rotação de `listenKey`/rede (`ADR-004`).

### 1.2 `premiumIndex` (ciclo) — um run = **um** poll

Um ciclo é **uma** chamada `GET /fapi/v1/premiumIndex`, disparada a cada `PREMIUM_INDEX_CYCLE_INTERVAL_S` (`collect_premium_index_once`, já existente). `started_at`/`ended_at` são o instante do disparo e o instante em que a resposta foi parseada e publicada (sucesso) ou em que a falha foi decidida (`RawPremiumIndexFetch.transport_error` setado, ou `parse_premium_index_batch` rejeitou o corpo). **Um poll = um run**, sempre — não há agregação de vários polls num único registro; isso preservaria a granularidade que `CA-F1-5` (vazão) precisa para medir por hora.

---

## 2. Os literais — `source` e `endpoint`

### 2.1 `endpoint` — fixado, sem ambiguidade

| coletor | `endpoint` |
|---|---|
| `!forceOrder@arr` | `"!forceOrder@arr"` — já é o literal usado em `domain/liquidation_reconciliation.py`, `domain/force_order_natural_key.py` em toda a árvore de domínio; não invento um segundo nome para a mesma coisa |
| `premiumIndex` | `"/fapi/v1/premiumIndex"` — já é `PREMIUM_INDEX_ENDPOINT` em `domain/premium_index_batch.py:46`, `[DOC]` |

Os dois são **distintos por construção** (item (d) de `§3.3`), então `select source,endpoint,count(*) from ingest_run group by 1,2` (`D1.5`) sempre separa os dois coletores mesmo com o mesmo `source`.

### 2.2 `source` — `[Q11]` fica **`[NÃO SEI]`**, com o motivo escrito, não escondido

A pergunta pede o literal que **os runs existentes** usam, lido do `select distinct source from ingest_run` no store do owner. **Não há esse store nesta árvore**: `[MEDIDO 2026-09-07]` —

```
find . -iname '*.sqlite3' -o -iname 'ingest_health*'
# -> só código (rotas, use case, CLI); nenhum arquivo .sqlite3 na árvore ou em `data/` local
```

`data/` é gitignored e não versionado (`CLAUDE.md` §"Dado bruto não é versionado"); se o owner tem um store de produção fora desta árvore, esta gate não o alcança. **`[Q11]` permanece `[NÃO SEI]`** — exatamente a saída que a `SPEC` e a task autorizam ("com o store do owner **ou** `[NÃO SEI]` declarado").

**O que esta gate FIXA apesar disso:** o literal que os **dois coletores novos** (`forceOrder`, `premiumIndex`) usam a partir de `F1` é

```
source = "binance-futures"
```

pelo precedente já em produção — `use_cases/persist_ntp_skew_run.py:20`, `SOURCE: Final[str] = "binance-futures"`, para o mesmo provedor (Binance USDT-M Futures). Reutilizar o mesmo literal em vez de inventar um por coletor é o que faz o `ADR-031/F1` (equivalência de `fingerprint()` entre motores) ter alguma chance de comparar runs do mesmo provedor sob a mesma chave.

**Risco explícito, não escondido:** se o store real do owner (fora desta árvore) usa um literal diferente para runs de Binance Futures, os runs novos e os antigos **não** agrupam pela mesma `source` em `select … group by 1,2`, e alguém vai precisar migrar um dos dois lados. Isto não bloqueia `F1` (a `SPEC` já diz que nada em `§8` bloqueia `SPEC_DRAFT`), mas é uma reabertura esperada, não uma surpresa: **gatilho de reabertura de `[Q11]`** — o dia em que o owner apontar para um store de produção pré-existente com um `source` diferente de `"binance-futures"` para Binance Futures.

---

## 3. Os campos restantes de `IngestRun` (16 colunas, `ingest_record.py:99-117`)

| campo | stream (`!forceOrder@arr`) | ciclo (`premiumIndex`) | por quê |
|---|---|---|---|
| `window` | `f"{started_at}/{ended_at}"` da sessão | `f"{started_at}/{ended_at}"` do poll | mesma convenção ISO-8601 já em uso (`persist_ntp_skew_run.py:70`); nunca um número solto |
| `n_expected` | `= n_returned` | `= n_returned` | não há oráculo independente de "quantas liquidações/quantas leituras DEVERIAM ter ocorrido" — inventar um violaria "nenhum número sem o comando que o produziu". A `SPEC` já propõe isto para stream (item (g)); esta gate **estende** a mesma regra ao ciclo pelo mesmo argumento (o tamanho do lote `premiumIndex` reflete quantos símbolos a Binance decidiu listar naquele instante, `[DOC: docs/decisoes-do-owner.md:305]` — não é um alvo que o coletor calcula) |
| `n_returned` | mensagens publicadas na sessão (`RF-1`) | linhas do lote parseadas e publicadas naquele poll | item (f) da `SPEC`, verbatim |
| `n_written` | `0` | `0` | item (f): quem escreve a série é o escritor (`F2`), não o coletor — o campo não mente |
| `verdict` | `ACCEPTED` \| `ACCEPTED_WITH_WARNING` \| `REJECTED` conforme `B1–B3`/`B8`/`B14` | idem, conforme sucesso/falha do poll | `KNOWN_VERDICTS`, sem quarto valor |
| `api_code` | `None` | HTTP status do poll (`RawPremiumIndexFetch.status`) | item (h), verbatim |
| `src_sha256` | `sha256` **incremental**: `hashlib.sha256()` atualizado com os bytes UTF-8 de cada mensagem crua conforme ela chega; `hexdigest()` tirado no fechamento da sessão | `sha256` do corpo bruto da resposta HTTP daquele poll (mesma convenção de `observation.body_sha256`, `persist_ntp_skew_run.py:76`) | uma sessão de stream pode durar horas — guardar todas as mensagens em memória só para hashear no fechamento é o custo que `ADR-031/F3` audita (RSS); o hash incremental dá o mesmo determinismo (mesma sequência de bytes ⇒ mesmo digest) sem reter o histórico |
| `weight_used` | `0` | `_read_weight(fetch, weight_header)` já existente em `collect_premium_index.py`; se o header vier ausente **nesta chamada específica**, grava `-1` (sentinela documentado abaixo) em vez de abortar o processo | WebSocket não consome `x-mbx-used-weight-1m` — `0` é um fato (zero peso REST gasto), não um chute. Para o ciclo, a rota já mede o header 2/2 vezes (`premium_index_batch.py`, comentário `[MEDIDO 2026-09-01]`); a ausência é o caso de borda que `persist_ntp_skew_run.py` trata abortando — mas aquilo é um probe **manual, uma chamada**; um coletor 24/7 não pode encerrar o processo a cada poll por falta de UM header de metadado quando a publicação em si teve sucesso. `-1` é **impossível** como peso real (peso é sempre ≥ 0) e greppável — nunca confundível com um peso medido |
| `observer_id` | `"forceorder-collector"` | `"premiumindex-collector"` | nomeiam o coletor de produção, distinto do probe de diagnóstico (mesmo cuidado de `persist_ntp_skew_run.py:16-19`: não reusar o nome de um probe para reivindicar uma proveniência que ele não tem) |
| `observer_region` | `UNKNOWN_OBSERVER_REGION` (`"unknown"`, `domain/provenance.py:53`) | idem | reusa o sentinela já contratado por `SPEC-001 §2.2` — "um valor, nunca ausente" — em vez de inventar um segundo |
| `clock_skew_ms` | `CLOCK_SKEW_NOT_MEASURED_MS = -2_147_483_648` (sentinela, ver nota) | idem | os coletores de produção **não** fazem uma medição de skew por sessão/ciclo — isso é o trabalho de `ntp_skew_probe_cli`, rodado fora de banda com o seu próprio agendamento; fazer um round-trip NTP-like a cada ciclo de `premiumIndex` (potencialmente a cada 60 s, §4) ou a cada mensagem de sessão duplicaria trabalho sem necessidade. Nenhum inteiro é "impossível" para um skew real em ms (mesmo `0` ou `-1` são fisicamente plausíveis), então o sentinela usa um valor **fisicamente absurdo** (relógio 24+ dias errado), documentado por nome, para nunca ser confundido com uma medição |

**Nota sobre os dois sentinelas (`weight_used=-1`, `clock_skew_ms=CLOCK_SKEW_NOT_MEASURED_MS`):** ambos são valores **fisicamente impossíveis** para a grandeza que a coluna representa, escolhidos deliberadamente para nunca colidir com um valor medido — o mesmo princípio que `janela_de_perda = None` já aplica (`ingest_record.py:81-91`, "a value, never absent, never a guess"), adaptado às duas colunas que aqui são `NOT NULL int` e não podem usar `None`. Implementação (nomear as constantes, testá-las) é `T-01.5`/`T-01.6`, não desta gate.

---

## 4. `[Q2]` — `PREMIUM_INDEX_CYCLE_INTERVAL_S = 60`

**Decisão: 60 segundos.** Razões, nenhuma um número solto:

- **Peso:** `GET /fapi/v1/premiumIndex` sem `symbol` custa peso `10` (`[MEDIDO 2026-09-01]`, `premium_index_batch.py:19-22`) contra o teto `REQUEST_WEIGHT 2400/min` (`docs/decisoes-do-owner.md:256`). A 60 s, o coletor gasta `10/min` — **0,4 %** do teto — deixando quase toda a cota livre para outros consumidores da mesma chave (probes, futuros coletores).
- **Granularidade:** `lastFundingRate`/`markPrice` mudam continuamente entre as janelas de liquidação de funding de 8 h (`funding_settlement.py`); 60 s é uma amostragem padrão para dados de premium/funding em uso de pesquisa, sem sobre-coletar a ponto de cada poll ser redundante com o anterior.
- **Efeito colateral explícito e monitorado, não escondido:** cada poll publica ~875–888 linhas (uma por símbolo, `[DOC: docs/decisoes-do-owner.md:305,321,440]`). A 60 s isso é **até ~1,3 M linhas/dia só de `premiumIndex`**, disputando o mesmo `REDIS_STREAM_MAXLEN=100000` (`P5`) com `!forceOrder@arr`. **Esta gate não fecha essa conta sozinha** — `T-01.8` (`D1.9`, `CA-F1-5`) mede a vazão real por 24 h e, pelo próprio desenho de `P5` (`tasks_review.md` linha 36), **pode mandar trocar os dois números** (`ADR-032/F6`) se o Stream encher rápido demais. `60 s` é o ponto de partida desta gate, não uma promessa de que o MAXLEN aguenta — a medição empírica é quem confirma ou derruba.

---

## 5. `P9` — gravação local crua: **decisão = NÃO grava**

**Decisão do `quant-architect`: os coletores de `F1`/`F2` não escrevem uma cópia crua adicional em disco local.** Razões:

1. **A VPS é premissa de recurso escasso** — `[PREMISSA-OWNER, reafirmada 2026-09-03]`, citada em `.claude/agents/infra-architect.md:39-50`: *"o que está MORTO: 'gigas e gigas de aggTrades'"*. Uma terceira cópia bruta (além do Stream e do Postgres de `F2`) num disco compartilhado é exatamente o padrão de custo que essa premissa recusa, mesmo que o volume de `!forceOrder@arr`/`premiumIndex` seja bem menor que `aggTrade` tick-a-tick.
2. **O Stream já é a evidência crua para triagem** — `B7` fixa que mensagem que não decodifica **fica na `PEL`**, nunca é `ack`ada e descartada; `writer_message_rejected` loga o `entry_id`. Isso significa que o próprio Redis Stream retém o payload cru de qualquer mensagem que falhou no `decode`, disponível via `XRANGE`/`XCLAIM` até o consumidor tratá-la — não há necessidade de um segundo canal para o caso que "gravação crua" existiria para socorrer (investigar por que uma mensagem não decodificou).
3. **Sem consumidor identificado.** Nenhum requisito de `SPEC-004`/`PRD-004` lê um arquivo cru local; adicionar um sem consumidor é o tipo de escopo que `ADR-027` (constução especulativa) recusa.

**Gatilho de reabertura, nomeado:** se uma investigação de produção precisar de evidência crua que **já** saiu da `PEL` (por `MAXLEN` ter reciclado a entrada antes de alguém investigar, ou por o produtor já ter dado `ack` num caso que não deveria), isso é o sinal de que a retenção do Stream não basta como evidência — reabrir `P9` nesse momento, com o incidente como argumento novo.

---

## 6. `[Q1]` — vazão do `!forceOrder@arr`: não medida aqui, e não precisa ser

`[Q1]` pergunta a vazão **real** do stream de liquidações — isso só existe como medição empírica (`CA-F1-5`, `T-01.8`, 24 h de produção real), e nenhuma decisão de arquitetura substitui essa medição. O que esta gate fixa, e que `[Q1]` não bloqueia, é a regra estrutural: `n_expected = n_returned` (§3) independe de quanto o stream realmente produzir — a fórmula não muda quando o número chegar. `[Q1]` continua `[NÃO MEDIDO]` até `T-01.8` publicar `medicoes/CA-F1-5-vazao-24h.md`.

---

## 7. Co-assinatura de `ADR-031`

`ADR-031/D3` decide **quem** grava o run (o coletor, direto, não via Stream); esta gate decide **o que** ele grava. As duas são consistentes: nada aqui reabre `D1` (motor Postgres) ou `D2` (imagem). O `quant-architect` co-assina `ADR-031` nos termos do cabeçalho daquela ADR (*"Co-assinatura recomendada: `quant-architect`"*) — a mudança formal de `Status: proposta` para `aceita` é ato de `T-01.9` (`docs`, fase `01`), que cita esta gate como a co-assinatura satisfeita; esta gate não antecipa esse ato porque `T-01.9` também depende do `approve spec` do owner ter corrido, não só desta assinatura.

---

## 8. O que fica para outra task, deliberadamente

- Implementação dos sentinelas e das constantes de `observer_id` — `T-01.5` (boot/threads), `T-01.6` (mapeamento para `IngestRun`).
- `[Q10]` (`md.ingest_gap` por reconexão, destino de mensagem envenenada) — `T-02.1`, `F2`.
- Medição real de `[Q1]` e validação empírica de `[Q2]`/`P5` — `T-01.8`.
- Flip de `ADR-031` para `aceita` e resíduo textual — `T-01.9`.
