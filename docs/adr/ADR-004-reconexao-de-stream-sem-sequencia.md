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

---

## ✅ Emenda D5/D6 — pong real, morte por SILÊNCIO DE QUALQUER FRAME (não por mensagem de
## domínio) e B1 sem bloqueio para produtor esparso (2026-09-08)

**Fecha:** `docs/context/captura-em-producao/handoff/forceorder-arr-crash-loop.md` +
`docs/context/captura-em-producao/gates/forceorder-fix-quant-architect.md` §2 (que nomeou isto
"NÃO feito, e é decisão deliberada" e citou o achado colateral de `pong`, sem decidir os dois).
**Gatilho:** `[MEDIDO 2026-09-08 em produção local, docker inspect deploy-collector-1]` — o
container reiniciou de novo às 15:52:19, ~900s de silêncio real em `forceOrder`, o teto que o
remendo anterior escolheu "confortavelmente acima do SLA da Binance" continua sendo o ÚNICO
instrumento de detecção de vida, e ele erra pelo lado caro: espera o pior caso inteiro antes de
agir.

**Isto NÃO reabre a Decisão (1)/Classe B em si** (B1–B4 continuam válidas em substância — sobreposição
obrigatória, chave natural B2, colisão publicada B3, payload cru com data da doc B4). O que muda é
**qual evento conta como "prova de vida" e qual evento conta como "a nova conexão provou-se"** — os
dois pontos que o remendo anterior deixou presos a "recebeu uma MENSAGEM de domínio", presunção que
nunca foi verdadeira para um produtor esparso e que este projeto não tinha, até agora, nomeado como
o defeito raiz.

### O raciocínio, com o documento da Binance citado

*"the websocket server will send a ping frame every 3 minutes"*; *"When you receive a ping, you
must send a pong with a copy of ping's payload as soon as possible"*; *"if the ... server does not
receive a pong frame back ... within a 10 minute period, the connection will be disconnected"*
(Binance Developer Docs, USDⓈ-M Futures WebSocket API General Info,
`https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-api-general-info`,
lido 2026-09-08) `[DOC]`.

`rfc6455_client.py:149-150`'s `iter_text_messages` faz `continue` em `OPCODE_PING`/`OPCODE_PONG` —
**nunca responde**. Isso não é neutro: pela própria doc, o cliente **deve** responder, e um cliente
que não responde é, do ponto de vista do servidor, indistinguível de um cliente morto — a Binance
vai fechar a conexão por conta própria, algures entre o primeiro `ping` (~3 min) e a janela de
`pong` (~10 min), **mesmo que a rede e o mercado estejam perfeitamente saudáveis**. Isso é
autopunição: o coletor se desconecta pelas próprias mãos, com uma cadência que o próprio protocolo
documenta, e o remendo anterior (900s) só tornou o SINTOMA mais lento, não removeu a CAUSA.

**E há uma segunda causa, distinta, que responder `pong` não resolve:** um caminho de rede
genuinamente morto (NAT/LB que derruba conexão ociosa, RST engolido, meio-termo silencioso) não
entrega nem `ping` nem `pong` — nada chega, de nenhum tipo. Contra ISSO, a única defesa é medir
**silêncio de QUALQUER frame**, não silêncio de mensagem de domínio: `forceOrder` combinado (4
símbolos) é esparso mesmo saudável — `docs/context/captura-em-producao/handoff/forceorder-arr-crash-loop.md`
já mediu **>300s sem uma única liquidação, incluindo um controle garantido de 1 msg/s** — mas um
`ping` a cada 3 min chega de qualquer forma, **se** a conexão está viva. Um limiar de silêncio
calibrado no ciclo de `ping` da própria Binance separa as duas hipóteses que o timeout de 900s
confundia: "mercado quieto" (chegam `ping`s, nunca chega `forceOrder`) e "conexão morta de verdade"
(não chega nem `ping`).

### D5 — dois timeouts com papéis diferentes, nunca um só fazendo os dois trabalhos

| papel | valor proposto | por quê |
|---|---|---|
| granularidade de leitura (`recv()` por chamada) | **pequeno**, ordem de dezenas de segundos (proposta: 20s) | não é veredito de morte — só devolve o controle ao loop de leitura com frequência, para o contador de silêncio avançar e para o `SIGTERM` (`B14`) não ficar preso atrás de um timeout gigante |
| morte declarada por silêncio de QUALQUER frame | **~300s (5 min)**, acumulado em `recv()`s sucessivos | `[INFERRED: 2× o ciclo de `ping` documentado (3 min) + margem para jitter, folgado abaixo da janela de 10 min em que a própria Binance mataria a conexão — o coletor NUNCA é mais lento que a Binance para perceber a própria morte]` |

Os dois valores acima são **proposta de arquitetura, não medição** — rotulados `[INFERRED]` de
propósito. `infra-architect`/builder confirmam com um soak test real antes de fixar em código; o
falsificador abaixo é o critério de aceite.

**O `pong` deve ser real**, não um `continue`: ecoar o payload do `ping` recebido, moldado
(`masked`) como todo frame cliente→servidor exige (RFC 6455 §5.1) — a doc da Binance pede
explicitamente *"a copy of ping's payload"*, não um pong vazio.

### D6 — B1 redesenhado: "a nova conexão provou-se" deixa de exigir uma MENSAGEM

**O defeito nomeado no gate anterior:** `perform_overlap_handoff` bloqueia em
`next(new_source.messages())` — a primeira MENSAGEM DE DOMÍNIO da nova conexão — antes de fechar a
antiga. Isso foi desenhado (o comentário do próprio módulo diz) pensando num produtor de alta
frequência; em `forceOrder`, mesmo combinado, a próxima liquidação pode não vir por minutos, e
bloquear nisso é reintroduzir o mesmo travamento que este documento existe para eliminar — **para
as DUAS causas de reconexão**: o `StopIteration` de hoje (fechamento limpo) E o novo timeout de
ociosidade de D5.

**A correção:** o critério de "a nova conexão provou-se" passa de *"recebeu uma mensagem"* para
*"completou o handshake RFC 6455"* (`new_source.open()` sem erro). Isto não enfraquece a garantia
de B1 — **fortalece a leitura dela**: o handshake completo já é o instante a partir do qual a nova
conexão está tão viva quanto a antiga (Binance começa a empurrar frames pelo endpoint combinado
assim que o upgrade termina, sem `SUBSCRIBE` explícito); exigir também uma mensagem de domínio não
fecha gap nenhum a mais — só adiciona um bloqueio proporcional à raridade do stream, que para
`forceOrder` pode ser arbitrariamente longo.

**Efeito colateral que simplifica, não que arrisca:** com o critério mudando para handshake, a
"primeira mensagem" deixa de precisar ser capturada dentro da função de handoff — ela é lida
normalmente pelo laço principal, no próximo `next(messages)`, e passa pelo MESMO caminho de
publicação/keying B2 que qualquer outra mensagem (`_publish_raw_force_order_message`). Isto elimina
a necessidade de `reconnect_and_key` manter um caminho de keying especial paralelo ao caminho
normal — os dois caminhos colapsam em um.

**O que fica genuinamente em aberto, e é nomeado para não virar dívida silenciosa:** trocar a prova
de "mensagem" por "handshake" resolve o bloqueio, mas reabre uma pergunta que B1 original respondia
por construção: no caminho de `StopIteration` a conexão antiga está CONFIRMADA morta (recebeu
`OPCODE_CLOSE`), então parar de lê-la não perde nada; no caminho NOVO (timeout de ociosidade de D5)
a conexão antiga está apenas **suspeita**, nunca confirmada — abandonar a leitura dela sem
confirmação é, em espírito, o "buraco irreversível" que B1 chama de inaceitável ("duplicata é
reparável" — mas B1 nunca disse "buraco é aceitável"). **Mitigação recomendada, não implementada
aqui:** o próprio acúmulo de silêncio em `recv()`s curtos (20s) já funciona como uma re-checagem
natural — a morte só é declarada no primeiro tick de 20s que cruza os 300s acumulados, então o
"benefício da dúvida" já está embutido na granularidade pequena, sem precisar de um segundo
temporizador dedicado. Isto é suficiente para reduzir o risco a um nível comparável ao que B1 já
tolera (a Binance também poderia, em teoria, atrasar um `ping` além do próprio SLA documentado) —
não elimina o risco a zero. Se o `infra-architect` quiser zero, a alternativa é um `select()`/leitura
não bloqueante de curtíssima duração sobre a conexão antiga IMEDIATAMENTE antes de fechá-la, como
último cheque; isto NÃO está decidido aqui — é opção nomeada, dono é quem implementa.

### Reclassificação de exceção — o que continua fatal, o que passa a reconectar

| evento | hoje | depois desta emenda |
|---|---|---|
| `StopIteration` (fechamento limpo, `OPCODE_CLOSE`) | reconecta (`reconnect_and_key`) | **sem mudança** |
| timeout de leitura numa conexão JÁ ABERTA, acumulado ≥ D5 (~300s sem QUALQUER frame) | fatal, `StreamTransportError` em `_PUBLISH_FAILURE_EXCEPTIONS` → `REJECTED` | **reconecta pela MESMA rota de `StopIteration`** — precisa de um sinal distinguível (novo tipo de exceção ou retorno, não o `StreamTransportError(FRAME, "timeout: ...")` genérico de hoje, que colide com falhas reais de socket) |
| falha ao ABRIR a conexão substituta (DNS/TCP/TLS/`HTTP_UPGRADE`) | fatal | **sem mudança — continua fatal.** Se nem a substituta consegue conectar, isso é incapacidade real de coletar, não uma política de timeout errada; `REJECTED` continua sendo o veredito certo |

`_FORCE_ORDER_READ_TIMEOUT_S = 900.0` (o remendo anterior) fica **superado, não deletado por
decreto**: o soquete continua precisando de ALGUM `settimeout()`, só que pequeno (papel de
granularidade, tabela acima) — o número 900 não governa mais nenhuma decisão de vida ou morte.

### Falsificador desta emenda — como o owner confere sem confiar no arquiteto

**Fixture offline (regressão, roda em `backend/scripts/test.sh`, zero rede):**
1. Um `ByteChannel` fake que entrega **um `OPCODE_PING` com payload arbitrário e nunca mais nada**
   por um tempo simulado > D5 (via injeção de relógio, não `sleep` real) — assert: o cliente envia
   de volta um frame `OPCODE_PONG`, **mascarado**, com o MESMO payload do `ping`; assert:
   **nenhuma** reconexão/erro é disparada só por causa disso (mercado quieto ≠ morte).
2. O mesmo fake, agora **sem nenhum frame de nenhum tipo** por > D5 simulado — assert: dispara a
   MESMA rota de reconexão que `StopIteration` dispara hoje (não `_PUBLISH_FAILURE_EXCEPTIONS`).
3. Um `new_source` fake cujo `.open()` retorna imediatamente mas cujo `.messages()` nunca produz
   nada (bloquearia para sempre no design antigo) — assert: o handoff completa e `old_source.close()`
   é chamado, sem esperar por `next(new_source.messages())`.

**Produção, pós-deploy (o critério que faz esta decisão errada se estiver errada):** soak de 24h
(a janela de reconexão mandatória que a própria ADR já documenta no topo deste arquivo) sem NENHUM
restart do `deploy-collector-1` atribuível a `forceOrder`/`FRAME: timeout` — restarts pela
reconexão diária mandatória da Binance são esperados e não contam contra este critério.
`docker inspect deploy-collector-1 --format '{{.RestartCount}}'` antes/depois da janela, cruzado
com `docker logs --since <início> | grep -c 'FRAME: timeout'`. **Se restart por este motivo
continuar ocorrendo, esta emenda está incompleta ou os valores de D5 estão errados — volta à mesa,
não se aumenta o timeout de novo.**

### O que esta emenda NÃO decide

Os arquivos concretos a editar (`rfc6455_client.py`, `binance_stream_probe.py`,
`reconnect_force_order_stream.py`, `force_order_reconnection_overlap.py`, `collectors_cli.py`) e os
valores finais de D5 são **plano de implementação**, dono `infra-architect`/builder — ver
`docs/context/captura-em-producao/gates/forceorder-liveness-quant-architect.md`.
