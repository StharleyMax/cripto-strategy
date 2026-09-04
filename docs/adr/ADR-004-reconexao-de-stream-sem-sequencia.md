# ADR-004 — Reconexão de stream sem identificador de sequência

**Data:** 2026-08-25 · **Status:** proposto · **⚠️ Esta decisão é GATE DE F0** · **SPEC:** [`SPEC-001`](../specs/SPEC-001-plataforma-dados.md) §5.4
**Fase/Epic:** decisão precede F0 (`CST-2`); registro consolidado em F5b (`CST-7`) · **Componente alvo:** `sentimento`
**Origem:** correção que o gate mandou carregar

## Contexto

O WebSocket da Binance **desconecta a cada 24 h por doc** `[DOC]` ⇒ **reconexão é rotina diária, não exceção**. E as duas classes de stream que F0 liga **não têm o mesmo instrumento de reparo**:

| stream | identificador de sequência | dump repõe? | subamostragem |
|---|---|---|---|
| `<symbol>@aggTrade` | **`agg_id`**, contíguo: `a[i+1] == a[i]+1`, **0 saltos em 8.873.078 linhas** `[MEDIDO]` | **sim**, desde 2019-12-31 | não |
| **`!forceOrder@arr`** | **NENHUM** | **não existe `liquidation*` no dump** `[MEDIDO]` | *"only the latest one liquidation order within 1000ms will be pushed"* `[DOC]` |

**Uma regra única para as duas é um defeito**, e o motivo é assimétrico: em `aggTrade` a sobreposição é **detectável e descartável** e o buraco é **reparável**; em `!forceOrder@arr` a sobreposição **duplica sem detecção** e o buraco **não volta de fonte nenhuma**.

**E há uma incerteza de semântica em cima:** a doc se contradiz entre `latest` e `largest` (`SPEC-001` §5.10) — `[NÃO VERIFICÁVEL HOJE]`.

## Decisão

**Uma política POR CLASSE de stream. Três classes, e a terceira existe porque a segunda não tem instrumento.**

### Classe A — stream com identificador de sequência contíguo (`aggTrade`)

| regra | conteúdo |
|---|---|
| A1 | Reconecta com **sobreposição deliberada**; dedupe por **`agg_id`**, que é exato |
| A2 | Buraco detectado por **contiguidade**, nunca por taxa — a vazão do mesmo símbolo variou **3,66×** entre dois dias da mesma semana (55,6 vs 15,2 msg/s) e **o pico não escala com o volume** (3.468 msg/s num dia com 43% menos trades) `[MEDIDO]` |
| A3 | Buraco vira **linha em `md.ingest_gap`** e é **reparado do dump** quando ele publicar; até então a série carrega a descontinuidade **visível**, não costurada |
| A4 | **Nunca** `first/last trade_id` como invariante: **11.327 descontinuidades de `f/l` (0,862%) contra 0 de `agg_id`** no mesmo arquivo `[MEDIDO]` |

### Classe B — stream SEM identificador de sequência e SEM reposição (`!forceOrder@arr`)

| regra | conteúdo |
|---|---|
| B1 | **Sobreposição é obrigatória, não tolerada.** Duas conexões ativas durante a janela de troca, com fechamento da antiga **depois** de a nova receber a primeira mensagem. Buraco é irreversível; duplicata é reparável |
| B2 | **Chave natural de dedupe declarada e publicada:** `( symbol, side, price, orig_qty, trade_time )` do payload de ordem forçada, **mais `received_at` do observador** como desempate de gravação. **A chave é declarada, não presumida** |
| B3 | **A taxa de colisão da chave natural é PUBLICADA**, por símbolo e por dia, e a **direção do viés residual é escrita**: colisão não resolvida ⇒ **subcontagem**. ⇒ toda soma sobre essa série é **limite inferior**, e a tela escreve isso ao lado do número |
| B4 | O payload cru grava **nome do stream + data do snapshot da doc**, porque a semântica `latest\|largest` é a única forma de ser pinada depois |
| B5 | **Toda estatística de tamanho sobre essa série carrega, na PRÓPRIA SAÍDA, o rótulo `semântica de subamostragem NÃO RESOLVIDA (latest\|largest)`** — não só no payload. Acréscimo desta ADR ao que o handoff propôs: rótulo em coluna de payload **não chega ao consumidor de máquina**, e é consumidor de máquina que calcula percentil |

### Classe C — polling (`premiumIndex`, snapshot, probe, spread contingente)

| regra | conteúdo |
|---|---|
| C1 | Sem reconexão: **janela fechada e enumerada a priori** (`SPEC-001` §5.7). Falha é `verdict` em `md.ingest_run`, com `api_code` |
| C2 | **Nunca** cursor derivado da resposta: `openInterestHist` com `startTime` sozinho devolve **a cauda de hoje, HTTP 200, sem aviso** — comportamento **não documentado** `[MEDIDO]` |

## Alternativas recusadas

| alternativa | por que |
|---|---|
| **Reconexão sem sobreposição** (fecha, abre) | em Classe B produz buraco **irreversível** a cada 24 h, na única série cujo histórico não volta por preço nenhum. Custo: um buraco por dia, para sempre |
| **Dedupe por hash do payload cru** | o payload de duas mensagens idênticas de liquidações **realmente distintas** (mesmo símbolo, mesmo preço, mesmo tamanho, mesmo ms) é idêntico ⇒ **subcontaria eventos reais sem registrar que subcontou**. B2+B3 fazem a mesma coisa **medindo e publicando o viés** |
| **Uma regra única para as duas classes** | ou aplica a Classe A à B (dedupe por sequência que não existe), ou aplica a B à A (sobreposição e chave natural onde há `agg_id` exato) — **e a segunda descarta o único detector exato que este projeto tem** |
| **Esperar a doc ser corrigida para ligar o coletor** | *"não se resolve lendo mais doc — a doc é que se contradiz"*. E esperar custa **liquidação intraday que não volta** |

## Falsificador

**Se, sobre ≥ 30 dias de captura, a taxa de colisão da chave natural de B2 for maior que a taxa de reconexão** (isto é, se a chave colidir mais entre eventos genuinamente distintos do que entre duplicatas de sobreposição), **então B2 está subcontando mais do que B1 está protegendo**, e a política de Classe B está errada — o caminho passa a ser **gravar tudo sem dedupe** e resolver a duplicata na leitura, com a contagem bruta preservada.

**Segundo falsificador:** se a razão `Σ(capturado_dia) / agregado_diário_Coinalyze` (`CA-F0-14`) ficar **acima de 1** por símbolo e por lado, há **duplicata não removida** — e B1+B2 não estão fazendo o que esta ADR diz. **Ressalva que vai junto, sem ela o teste engana:** não se sabe se a Coinalyze constrói o agregado dela a partir do **mesmo** stream subamostrado. Se sim, a razão tende a 1 e **não prova nada**; se não, ela mede a perda. **As duas saídas informam sobre em qual caso estamos.**

## Consequência

- **B3 torna a subcontagem um número publicado em vez de uma ressalva de rodapé.** Isso é o que permite `CA-F0-14` ser um critério e não uma curiosidade.
- O registro consolidado desta decisão é `CST-7` (F5b); **a decisão em si precede a primeira linha do coletor de F0** — e é por isso que ela é gate.

---

## ✅ Registro consolidado — fase 09 (`T-09.3`/`CST-85`), 2026-09-04

**Acréscimo, nada acima foi reescrito.** Este é o registro que o parágrafo anterior prometia
(*"o registro consolidado desta decisão é `CST-7`"*) e que o item `9.4` do plano `09` pede: **o
que das três classes desta ADR está implementado hoje, com arquivo e comando — não com
preferência.** Componente desta task é `docs`; nenhuma linha de código foi escrita para produzir
este registro, só lida e contada.

### Classe B (`!forceOrder@arr`) — **completa**

B1–B4 têm implementação e teste, todos citando `ADR-004` pelo nome no próprio código:

| regra | arquivo |
|---|---|
| B1 (sobreposição obrigatória) | `backend/src/modules/sentimento/domain/force_order_reconnection_overlap.py` (`require_overlap`) + `backend/src/modules/sentimento/use_cases/reconnect_force_order_stream.py` (`perform_overlap_handoff`) |
| B2 (chave natural declarada) | `backend/src/modules/sentimento/domain/force_order_natural_key.py` |
| B3 (taxa de colisão publicada, viés escrito) | `backend/src/modules/sentimento/domain/force_order_collision_accounting.py` + `backend/src/modules/sentimento/infra/force_order_collision_report_cli.py` |
| B4 (payload cru com nome do stream + data da doc) | `backend/src/modules/sentimento/infra/` (`T-03.2`, recorder citado pelo report CLI acima) |

`grep -c "ADR-004" backend/tests/sentimento/test_force_order_reconnection.py` → **5** ocorrências
sobre **25** funções de teste (`grep -c "def test_"`) `[MEDIDO 2026-09-04]`. `T-03.3` (`backend/README.md`
§"Política de reconexão POR CLASSE de stream, Classe B") registra `bash backend/scripts/test.sh`:
**897 passed**, cobertura **98,06%** `[DOC: backend/README.md:2234-2238]`. **Não construído: um
daemon contínuo de reconexão** — decisão explícita do owner, deploy fora de escopo
(`docs/decisoes-do-owner.md` §Q1; `backend/README.md:2246-2248`, *"ligar isso 24/7 é decisão de
deploy"*).

### Classe C (polling) — **satisfeita funcionalmente, sem citar esta ADR pelo nome**

| regra | arquivo | evidência |
|---|---|---|
| C1 (janela fechada, enumerada a priori) | `backend/src/modules/sentimento/domain/oi_history_paginator.py` (`ClosedWindow`, `T-07.1`) | enumera `[start, end]` da aritmética, nunca do cursor da resposta |
| C2 (nunca cursor derivado da resposta) | `backend/src/modules/sentimento/infra/binance_oi_history_client.py` | *"always with BOTH `startTime` and `endTime` set"* (docstring do arquivo) |

**Observação, não bloqueio:** `grep -c "ADR-004" backend/src/modules/sentimento/domain/oi_history_paginator.py
backend/src/modules/sentimento/infra/binance_oi_history_client.py` → **0 nos dois arquivos**
`[MEDIDO 2026-09-04]`. A implementação chegou à mesma regra por rota independente — o docstring
cita `SPEC-001 §5.7` e `D7.3`/`D7.4` (`T-07.1`), não esta ADR. Substância satisfeita; rastro
textual entre as duas fontes da mesma regra, não.

### Classe A (`aggTrade`) — **parcial: A2/A4 construídos e testados; A1/A3 sem implementação**

| regra | status | evidência |
|---|---|---|
| A2 (buraco por contiguidade, nunca taxa) | **construído** | `backend/src/modules/sentimento/domain/aggtrade_contiguity.py` (`AggTradeTick`, `require_unique_agg_ids`), consumido por `infra/aggtrade_csv_reader.py` e `domain/aggtrade_bucket_aggregate.py` |
| A4 (nunca `first`/`last trade_id` como invariante) | **construído** | mesmo módulo — `AggTradeTick` não carrega os dois campos, por desenho de tipo, não por convenção lida |
| A1 (sobreposição deliberada na reconexão) | **NÃO construído** | `grep -rniE "reconnect.*aggtrade\|aggtrade.*reconnect" backend/src backend/tests` → **0 ocorrências reais** (a única linha que casa a regex é um comentário de teste sobre unicidade entre arquivos de dump, não reconexão ao vivo) `[MEDIDO 2026-09-04]` |
| A3 (buraco vira linha em `md.ingest_gap`, reparado do dump) | **NÃO construído para `aggTrade`** | `md.ingest_gap` existe e é escrito por outros fluxos (`dump_survivorship.py`/`T-07.2`, símbolo ausente do universo — motivo diferente de A3), mas nenhum módulo liga a contiguidade de `agg_id` a uma escrita em `md.ingest_gap` |

`grep -c "def test_" backend/tests/sentimento/test_aggtrade_contiguity.py
backend/tests/sentimento/test_aggtrade_contiguity_fixtures.py` → **18 + 9 = 27** testes, contra
dump real (`data/binance/aggtrades/BTCUSDT-aggTrades-2026-08-20.csv`) `[MEDIDO 2026-09-04]`.
`grep -n "Classe A" docs/context/plataforma-dados/tasks.toml` → **0 ocorrências** fora deste
registro `[MEDIDO 2026-09-04]`: **nenhuma task do plano constrói A1/A3.**

### O que fica bloqueado, nomeado

**A1 e A3 de Classe A não têm task no plano `03`–`08`.** Isto não é defeito desta task —
componente `docs`, "não escreve código de produção" é a fronteira explícita da fase `09` — e é
nomeado aqui para não virar dívida silenciosa: se o owner quiser fechar a reconexão ao vivo de
`aggTrade`, é item de fase novo, sem dono hoje. **Isto não invalida o gate de `03`**: o gate era a
*decisão* (a política por classe), não a integração contínua de nenhuma classe — nenhuma das três
roda como daemon, por decisão do owner (`Q1`).

### Conclusão do registro

`ADR-004` está **registrada como decisão vigente desde a fase `03`**, com Classe B completa,
Classe C funcionalmente satisfeita (rastro textual solto) e Classe A parcial (identidade/contiguidade
sim, reconexão com sobreposição e reparo de buraco não). O header desta ADR (`Status: proposto`)
não foi alterado — mesmo padrão que `ADR-002` mantém após seu `D4` ser decidido: o cabeçalho é
`append-only` por convenção deste repositório, a atualização de estado vive nas emendas.
