# Decisões do owner — **fonte única** de numeração e estado

**Criado:** 2026-08-24 · **Consolidado em R2:** 2026-08-25 · **Fase:** PLATAFORMA E DADOS · **Destino:** `/pm` → PRD → `/architect`
**Fontes consolidadas:** `docs/recorte-plataforma.md` §5 (8 perguntas) · `docs/plataforma-superficies-e-faseamento.md` (as 4 decisões de tela) · o que os 4 desenhos e as 4 validações revelaram · **R1 do PRD** (Q17, Q18, Q19) · **`docs/medicao-coinalyze.md`** (11 chamadas, responde Q4) · **`docs/direcionamento-operacional.md`** (`[PREMISSA-OWNER: 2026-08-25]`, responde Q17 e abre Q20).

---

## ⚠️ Por que este arquivo foi reescrito em R2: havia COLISÃO DE NUMERAÇÃO

**Duas edições paralelas criaram dois registros que discordavam.** R1 renumerou para **19** dentro do PRD (`Q17` spread · `Q18` profundidade do backfill de `metrics` · `Q19` `availability_probe_set`); em paralelo, o owner editou **este** arquivo criando um **`Q17` (CL-4 / spread)** e referenciou **`Q20` (Fibonacci)** em `direcionamento-operacional.md`, **sem que `Q18` e `Q19` existissem aqui**.

**Sorte, não acerto: os dois `Q17` eram o MESMO item** (spread: medir ou assumir), logo não houve conflito de significado — só de origem. **`Q18` e `Q19` existiam apenas no PRD**, e uma referência a `Q20` apontava para um registro que não tinha 18 nem 19.

**Resolução, e ela vale de agora em diante:** **este arquivo é a fonte única** de número e de **estado**. O PRD §8 **classifica** (bloqueante / não-bloqueante / inferível) e **referencia**; ele não renumera. Quem acrescentar pergunta acrescenta **aqui primeiro**.

### Vocabulário de estado — existe porque "aberta" e "respondida" não bastavam

| estado | significa |
|---|---|
| `ABERTA` | continua sendo decisão do owner, sem resposta |
| `RESPONDIDA` | fechada; nada resta |
| `RESPONDIDA COM RESÍDUO` | a pergunta original está fechada **por medição ou por declaração**, e resta uma decisão menor **NOMEADA** |
| `MORTA` | deixou de ser pergunta, **com o motivo escrito** — nunca apagada em silêncio |
| `INFERÍVEL` | o time infere, com motivo e custo de reversão declarados (PRD §9) |

Convenção de **(d)**: **RELÓGIO = dado que se perde a cada dia de espera.** Retrabalho de código não conta como relógio; onde existe, digo separado.

---

## Mapa de estado — as 20, numa tela

| Q | assunto | estado | relógio |
|---|---|---|---|
| **Q1** | autoriza ligar os coletores hoje | **`RESPONDIDA`** 2026-09-01 | **SIM — capture-or-lose** — relógio parou |
| **Q2** | onde roda, quem acessa, orçamento | **`RESPONDIDA`** | resolvida — ver §Q2 |
| **Q3** | canal de alarme fora do browser | `ABERTA` | SIM (condicional) |
| **Q4** | Coinalyze | **`RESPONDIDA COM RESÍDUO`** | resíduo sem relógio no `daily` |
| **Q5** | universo inicial (N, nomes, cadência) | `ABERTA` | SIM, herdado — **mas já não trava F0** |
| **Q6** | TradFi entra | `INFERÍVEL` | SIM, fraco |
| **Q7** | Bybit entra nesta fase | `ABERTA` | SIM **se** a resposta for sim |
| **Q8** | fuso de exibição e fronteira do dia | `INFERÍVEL` (F0–F2) / `ABERTA` (F4) | NÃO |
| **Q9** | retenção de tick × disco | **`MORTA`** — ver o motivo | NÃO |
| **Q10** | ordem: monitorar / pesquisar / executar | `ABERTA` | NÃO |
| **Q11** | owner marca o corpus? quantas horas | **`RESPONDIDA`** 2026-09-03 — *"pode aceitar o default"*; ver §Q11 | NÃO |
| **Q12** | `MATIC→POL` / `RNDR→RENDER` | `ABERTA` | NÃO |
| **Q13** | cor do candle | **`RESPONDIDA`** | NÃO — ver §Q13 (reconciliada com `SPEC-001:649` em 2026-08-28) |
| **Q14** | idioma da UI | `INFERÍVEL` | NÃO |
| **Q15** | ToS dos fornecedores | `ABERTA` | NÃO por si |
| **Q16** | dono de `charts`/`web` + regra em `frontend/` | **`RESPONDIDA`** 2026-08-28 | NÃO (de dado) — o relógio de retrabalho **parou** |
| **Q17** | spread: medir ou assumir | **`RESPONDIDA COM RESÍDUO`** | **SIM — capture-or-lose** |
| **Q18** | profundidade do backfill de `metrics` | `ABERTA` | NÃO |
| **Q19** | `availability_probe_set` | **`RESPONDIDA`** 2026-09-02 | **SIM — capture-or-lose, ver §Q19** |
| **Q20** | SMC, pivôs+Fibonacci, ou os dois | **`RESPONDIDA`** 2026-09-03 — *"coexistem"*; ver §Q20 | NÃO |

**Contagem: 20 · 7 `ABERTA` · 3 `INFERÍVEL` · 7 `RESPONDIDA` · 2 `RESPONDIDA COM RESÍDUO` · 1 `MORTA`.**
*(Atualizada em 2026-09-03: `Q11` e `Q20` respondidas pelo owner na sessão do piloto de swing — ver as duas seções e
[`ADR-017`](adr/ADR-017-deteccao-autonoma-com-auditoria-por-excecao.md), rascunho.)*
*(Atualizada em 2026-09-02: `Q19` respondida pelo owner — destrava `T-03.6`; `T-03.9` segue `blocked` por
`observer_region`/VPS, decisão explícita do owner de deixar a VPS fora por enquanto. Atualizada em
2026-09-01: `Q1` respondida pelo owner — 8 tasks destravadas nas fases 02/03 de `plataforma-dados`.
Atualizada em 2026-08-28: `Q16` respondida pelo owner; `Q13` reconciliada contra `SPEC-001:649`, que já a
registrava `RESPONDIDA` desde 2026-08-25 — a divergência era deste arquivo.)*
**Capture-or-lose: `Q2` (herdado), `Q17`, `Q19`** — `Q1` saiu dessa classe ao ser respondida (2026-09-01); `Q5` saiu quando `!forceOrder@arr` foi confirmado.

---

## ⛔ CAPTURE-OR-LOSE — histórico que nenhuma fonte devolve depois

### Q1 · **`RESPONDIDA` em 2026-09-01** · Autoriza ligar HOJE os coletores que não precisam de estratégia nem de tela?

**(a)** Ligo hoje `!forceOrder@arr` (liquidação de mercado inteiro), `premiumIndex` (funding estimado), o snapshot diário de `exchangeInfo`+`fundingInfo` e o **probe de disponibilidade** — sim ou não?

**(b) Medido:** liquidação intraday da Binance é **stream-only**, subamostrada por doc (*"only the latest one liquidation order within 1000ms will be pushed"* — e a página COIN-M diz **`largest`**, divergência **não resolvida**: se for `largest`, a série é distribuição de máximos por segundo, não de liquidações), e **não existe `liquidation*` em `data.binance.vision`**. Funding **estimado** não tem endpoint de histórico em fonte nenhuma. Snapshot diário: **1,16 MB/dia bruto, 54,6 KB gzip** (medido no arquivo real, `ls -la data/snapshots/`).

**Correções acumuladas, e elas reduzem o escopo de Q1 sem eliminá-lo:**
- **O universo deixou de gatear** (R1). O stream de **mercado inteiro** existe: `!forceOrder@arr` (*All Market Liquidation Order Streams*, 1000 ms). **Nenhum dos coletores depende de Q5.**
- **O snapshot diário não depende de Q2** — é um `GET` mais `gzip`. E o **dia 1 da série já existe**: captura manual em 2026-08-25T11:52:40Z (877 símbolos, 570 `PERPETUAL`+`TRADING`), preservando `ICXUSDT`/`STORJUSDT`/`SCRTUSDT` com `deliveryDate = 2026-08-26T09:00:00Z`. **Foi captura MANUAL única, não o coletor** — a série diária continua dependendo de Q1.
- **Prova de que o snapshot precisa ser diário e datado:** `{4h: 433, 8h: 136, 1h: 1}` em 2026-08-25 contra `{4h: 432, 8h: 136, 1h: 2}` três dias antes, e `TRADIFI_PERPETUAL` de **170 para 175**. **O universo derivou em três dias.**
- **⭐ R2 · o custo de atraso mudou de FORMA na liquidação, e não de tamanho.** `/liquidation-history?interval=daily` da Coinalyze devolve **730 dias** (2024-08-26 →, campos `{t,l,s}`) `[MEDIDO]`. ⇒ **o que não volta é a liquidação INTRADAY** — o evento individual, o ms, **a cascata de segundos, que é onde o gatilho "picos de liquidação" da proposta vive**; o **agregado diário é recuperável 2 anos**. **A urgência não cai: o coletor continua tendo de ligar hoje.**
- **⭐ R2 · e o agregado diário dá um GANHO que não existia:** ele é a **primeira série de referência independente** para medir quanto a subamostragem custa. Comparar `Σ(liquidação capturada no dia)` contra o agregado dela é `CA-F0-14`. **Ressalva obrigatória: não se sabe se a Coinalyze constrói o agregado a partir do MESMO stream subamostrado** — se sim, a razão tende a 1 e não prova nada; se não, mede a perda. **As duas saídas informam em qual caso estamos**, e custa 1 chamada/dia/símbolo.

**(c) Trava:** o painel de liquidação (1 dos 3 gatilhos que a proposta nomeia) nasce vazio; `universe_at(ts)` fica preso em `s3_inferred`, **que é inadmissível no caminho de decisão** ⇒ **todo resultado transversal do passado é retrospectivo por construção**; `tick_size`/`price_precision`/`funding_interval` **com data de vigência** — base de toda tolerância de estrutura futura, que é expressa em ticks — não existem para nenhuma data passada; e o `available_at` **OBSERVED** das séries que a plataforma existe para servir, que **não é derivável retroativamente**.

**(d) RELÓGIO: SIM — capture-or-lose.** ~1 dia perdido por dia. **É o único item deste registro cujo custo de atraso não tem mitigação de engenharia.**

**✅ RESPOSTA DO OWNER (2026-09-01). Declaração literal:**

> **"pode ligar o q1 e ligar os coletores"**

`[PREMISSA-OWNER: 2026-09-01]`

**A resposta é SIM às quatro capturas nomeadas em (a):** `!forceOrder@arr` (liquidação de mercado
inteiro), `premiumIndex` (funding estimado), o snapshot diário de `exchangeInfo`+`fundingInfo`, e o
probe de disponibilidade. **O relógio de capture-or-lose parou** — cada dia que passava sem isso era
um dia de `nq` (janela de 48h) e de liquidação intraday perdidos para sempre; não voltam mais.

**O que isto DESTRAVA — as 8 tasks nomeadas em `tasks_review.md` §"Mapa de rastreamento" (linha do
`Q1`), e apenas estas:** `T-02.1` (snapshot diário datado), `T-02.2` (one-shot Coinalyze),
`T-03.2` (`!forceOrder@arr`), `T-03.3` (política de reconexão por classe de stream, `ADR-004`),
`T-03.4` (agregado `q`/`nq` do `aggTrade`, a de maior prioridade de relógio — janela de 48h),
`T-03.5` (`premiumIndex`), `T-03.8` (rampa até o primeiro 429), `T-03.11` (scanner do relógio,
`T-03.12`'s vizinha — reconciliação Coinalyze). `docs/context/plataforma-dados/tasks.toml` passa o
`status` das 8 de `blocked` para `todo` no mesmo commit desta resposta — nenhuma delas está
`done`, a resposta só remove o bloqueio de **poder começar**.

**O que isto NÃO destrava, e por quê:** `T-02.4b` e `T-03.9` dependem de `T-02.1`/`T-03.2`
respectivamente — ficam `blocked` até a dependência fechar, não por `Q1` diretamente. `T-03.9`
carrega um segundo bloqueio que `Q1` não resolve: `observer_region` da VPS é `[NÃO MEDIDO]`
(comando: `curl -s ipinfo.io` de dentro da VPS) — coluna de F0, impossível retroativamente
(`SPEC-001` §9.2). `T-03.6` (`availability_probe_set`) segue travada por `Q19`, pergunta distinta.
`T-15/Q15` (ToS de Binance/Bybit/Coinalyze) segue `ABERTA` e **incide retroativamente** sobre o que
esta resposta manda acumular — não bloqueia o início, mas é dívida que não desaparece com `Q1`.

**Nenhuma chave de API foi escrita neste documento** — `$COINALYZE_API_KEY` vive em `.env`,
conforme `CLAUDE.md`.

---

### Q2 · **`RESPONDIDA` em 2026-08-25** · Onde isso roda, e quem acessa?

**(a)** Host **não exposto** ou **serviço exposto** — e com qual orçamento de disco? **R2 acrescenta o eixo que faltava: localhost, VPS ou NUVEM?**

**(b) Medido:** o WebSocket da Binance **desconecta a cada 24 h por doc** — reconexão é **rotina diária, não exceção**, e um coletor stream-only num laptop que dorme perde exatamente o que dormiu. **Premissa declarada em R1, e ela nomeia três propriedades independentes: "host alimentado e conectado 24/7, single-user, não exposto"** — *"localhost"* não diz nada sobre alimentação nem uptime, que é precisamente o que os coletores precisam.

**⭐ R2 · o orçamento de disco encolheu por ordem de magnitude, e isso muda a forma da pergunta.** Medido nesta rodada (`curl -sI` em `data.binance.vision`, arquivos de 2026-08-18, `Content-Length` zipado): `metrics` **11.531 B/dia/símbolo** · `klines 1m` **58.262 B/dia/símbolo** (BTCUSDT; ADAUSDT **46.746 B**, logo BTC é **teto**) · `aggTrades` **6.930.298 B/dia** no mesmo dia — **119× o `klines 1m`**. ⇒ **o histórico inteiro em bucket — universo inteiro (570), profundidade medida (2.183 dias), OI a 5 min mais preço/volume/taker a 1 min — cabe em ~87 GB UMA VEZ.** Contra **~240 GB/ano** de tick para 20 símbolos.
**A pergunta de disco portanto deixa de ser sobre quanto cabe e passa a ser sobre onde roda**, que é a outra metade de Q2 e continua sem resposta.

**⭐ R2 · "nuvem" torna concreta uma decisão que estava abstrata.** O direcionamento operacional fala de *"custos de armazenamento e processamento em nuvem"* `[PREMISSA-OWNER]`. Duas consequências medidas passam a valer:
- **`available_at` OBSERVED não é propriedade do mercado — é propriedade de `(mercado, local do observador, caminho de rede)`.** Os dumps vivem em **`ap-northeast-1`**; um host em São Paulo e um em Tóquio produzem carimbos **sistematicamente diferentes**. ⇒ **`observer_id` e `observer_region` são COLUNAS hoje, e são impossíveis retroativamente**. E a **tabela de defasagem é chaveada por `(endpoint, observer_region)`**, não por endpoint: mudar de região **invalida a calibração MODELED** da região nova, e carimbo MODELED mal calibrado é **otimista em silêncio**. *(Evidência colateral medida em R2: o `curl` a `/futures/data/*` voltou com `x-amz-cf-pop: GRU1` — borda de São Paulo. **O caminho de rede do observador é visível na resposta.**)*
- **Nuvem exposta muda a decisão de auth/TLS de "código morto" para "estrutura"** — e **se a resposta for "exposto", auth entra como FASE NOVA, não como retrofit** (⇒ **um sétimo Epic**, PRD §13.5). **Nuvem e não-exposto são compatíveis** (uma VM sem porta pública é as duas coisas); o que a menção a nuvem faz é tornar "exposto" um cenário mais vivo.

**(c) Trava:** os coletores **contínuos** de Q1 (o snapshot diário e o one-shot da Coinalyze **não**); a decisão auth/TLS/multi-sessão, que é **estrutura de UI e não detalhe**; e a região do observador, que é **coluna de F0**.

**(d) RELÓGIO: SIM, herdado de Q1** — e **parcialmente**, porque o gate de F0 é **por coletor**.

**✅ RESPOSTA DO OWNER (2026-08-25), e ela fecha as DUAS metades — o registro completo, com a medição que ela
disparou, está em [`premissas-de-infra-e-stack.md`](premissas-de-infra-e-stack.md):**

> *"vai estar em uma VPS[, a] mesma que roda o anything_monorepo, então n temos tanto recurso assim"* ·
> *"Por hora podemos ter o menor escopo possível de auth, considerando um único user, daí o isolamento de users,
> keys e afins entra em outro momento, somente precisamos garantir que seja extensível sem grande complicações"*

| a metade | o que a resposta fixa |
|---|---|
| **onde roda** | **VPS**, compartilhada com um stack de **6 serviços já medidos** (`postgres:15`, `redis:7`, `evolution`, `backend`, `frontend`, `caddy` com TLS público) e **sob pressão de disco documentada** — o runbook `KAN-86` do vizinho move mídia para Cloudflare R2 com o passo *"liberar disco"*. ⇒ **restrição de vizinhança, não de benchmark**, e ela restringe o ADR de motor mais que qualquer medição de performance |
| **quem acessa** | **exposto** (a VPS tem Caddy/TLS público) + **auth mínima, single-user, obrigatoriamente extensível**. ⇒ o non-goal *"login/autenticação: indefinido — não construir especulativamente"* (PRD §12) **está respondido e sai da lista**; e a condição de PRD §13.5 para um Epic novo (*"exposto ⇒ auth entra como FASE NOVA"*) **NÃO se realiza**, porque o pedido é escopo mínimo com extensibilidade, não isolamento multi-tenant ⇒ **continuam 7 Epics** |

**O requisito que fica, e é falsificável:** identidade é **dimensão desde a primeira linha** — nunca constante
implícita nem `NULL`. Mesmo princípio já aplicado a `env` e a `provider`.

**⚠️ RESÍDUO — e é ele que impede o ADR de motor de fechar:** *"n temos tanto recurso assim"* é qualitativo. **RAM
livre, disco livre e a região da VPS não estão medidos, e eu não tenho acesso a ela.** Os dois primeiros são teto
declarável no falsificador do ADR; **o terceiro é `observer_region`, que é COLUNA DE F0 e impossível
retroativamente** (`[GAP G7]`). Obtenção: `free -m` · `df -h` · `curl -s ipinfo.io` — dentro da VPS.

**⚠️ E uma premissa técnica do owner foi CORRIGIDA, porque não corrigida ela elimina o candidato preferido por
motivo errado:** *"um banco relacional ta totalmente fora de contexto, certo?"* — **não.** **Os três candidatos são
relacionais e falam SQL** (TimescaleDB **é** uma extensão do PostgreSQL; DuckDB é SQL embarcado). O eixo que decide
é **row-store OLTP × column-store OLAP** e **daemon × embarcado**. Ver
[`premissas-de-infra-e-stack.md` §3.1](premissas-de-infra-e-stack.md).

**⭐ E a medição do vizinho acrescentou DOIS candidatos ao ADR de motor que não existiam:** **(4) TimescaleDB na
instância `postgres:15` que já está de pé** — sem daemon novo, ao custo de acoplar a um banco de produção alheio; e
**(5) Parquet particionado no Cloudflare R2 já provisionado, lido por DuckDB embarcado via `httpfs`** — que tira os
~87 GB do disco da VPS e cujo *egress zero* é o que torna varredura de backtest viável (em S3, não seria).

---

### Q17 · **`RESPONDIDA COM RESÍDUO`** · Spread é capture-or-lose. Medir ou assumir?

*(É o mesmo item que este arquivo e o PRD §8 criaram em paralelo — **unificado em R2**, sem conflito de significado.)*

**(a) — reescrito em R2: são TRÊS opções, não duas.**
- **(a1)** capturar `<symbol>@bookTicker` ao vivo desde o dia 1;
- **(a2)** modelar slippage de `bookDepth` **mais premissa de spread declarada**;
- **(a3) NOVA:** amostrar topo de livro por **`GET /fapi/v1/depth?limit=5` a 1/min**.

**(b) Medido, em três etapas.**

**Primeiro, que o dado sumiu:** `daily/bookTicker/BTCUSDT` devolve `200` em **2024-03-25** e **`404` em 2024-03-31** e em toda data posterior; `monthly/bookTicker` devolve `200` em **2024-04** e `404` de **2024-06** em diante. `bookDepth` **continua** publicado (561 KB/dia, 34.560 linhas = snapshot de 1 min × 24 níveis percentuais, colunas `timestamp,percentage,depth,notional`) — **e não tem bid/ask**. ⇒ profundidade a ±1..5% é re-baixável; **topo de livro não é, para nenhuma data depois de 2024-04**.

**Segundo, quanto custa (a1) — e o número que circulava estava ERRADO por 4,8×.** A estimativa anterior (**1,76 TB/ano**) multiplicou o símbolo mais pesado por 20. Medido por `HEAD` em **8 símbolos na mesma data (2024-03-25)**, zipado:

| símbolo | `bookTicker`/dia | `aggTrades`/dia | razão |
|---|---|---|---|
| BTCUSDT | 185,3 MB | 28,8 MB | 6,4× |
| ETHUSDT | 142,2 MB | 20,4 MB | 7,0× |
| SOLUSDT | 104,2 MB | 15,9 MB | 6,6× |
| DOGEUSDT | 105,5 MB | 10,2 MB | 10,3× |
| XRPUSDT | 85,6 MB | 3,4 MB | 25,1× |
| BNBUSDT | 54,0 MB | 5,9 MB | 9,2× |
| ADAUSDT | 49,8 MB | 1,9 MB | 26,1× |
| LINKUSDT | 39,1 MB | 2,6 MB | 14,8× |
| **8 símbolos** | **0,713 GB/dia** | 0,083 GB/dia | **8,6×** |

⇒ **260 GB/ano para os 8 maiores**; extrapolando a cauda **medida** em vez de assumida, **340–420 GB/ano para 20 símbolos. Não 1,76 TB.**
**Ressalva de procedência, e é real:** são volumes de **2024-03**, a última data em que o dump existiu. É **proxy medido, não custo de hoje**, e captura ao vivo tem overhead próprio.

**⭐ Terceiro, R2 mediu a opção (a3), e ela é a que faltava.** `GET /fapi/v1/depth?symbol=BTCUSDT&limit=5` → **HTTP 200, 295 B de corpo, peso 2** (`x-mbx-used-weight-1m` observado subir de **0 para 2**; com `limit=20`, 925 B e também peso 2). ⇒ **20 símbolos a 1/min = 40 de peso/min contra `REQUEST_WEIGHT 2400/min` = 1,67% do balde**, e **8,5 MB/dia de JSON bruto** (`295 × 20 × 1440`) ⇒ **~3,1 GB/ano antes de comprimir**, contra 340–420 GB/ano de (a1): **~110× mais barato**. **E não compete com o backfill de OI:** medido em R2, `/futures/data/openInterestHist` devolve `200` com **zero headers `x-mbx-*`** enquanto `/fapi/v1/depth` devolve `x-mbx-used-weight-1m` ⇒ **baldes distintos, confirmado por observação**.
**Ressalva que este registro faz sobre a própria opção que propõe:** **1/min é AMOSTRA, não tick.** A distribuição intra-minuto fica invisível, e o spread alarga exatamente no instante do movimento, que é quando o fill acontece. **(a3) não é (a1).** É spread **medido, com `n` e percentil publicados**, em vez de constante — e a amostra **no fechamento do bucket** é o instante que o owner declarou como o de decisão.

**(b2) O que RESPONDE a pergunta, e é declaração e não medição.** *"O foco não é alta frequência (HFT) nem leitura de milissegundo no livro"* `[PREMISSA-OWNER: 2026-08-25]`. ⇒ **(a1) sai do escopo desta fase.** `bookTicker` não volta à mesa a menos que a tese mude.

**(c) Trava:** um backtest sem slippage é fantasia, e o insumo de spread **para o período que este produto vai cobrir** não existe em fonte nenhuma a partir de hoje. **Sob qualquer das três respostas, a regra é a mesma e é dura:** a premissa (ou a medição) de spread é **parâmetro nomeado, versionado e carimbado no resultado — nunca constante dissolvida no número**.

**(d) RELÓGIO: SIM — e R2 DISCORDA de que ele tenha parado.** Me foi passado que *"`bookDepth` continua publicado e é re-baixável, logo nada se perde esperando"*. **A primeira metade é verdadeira e a conclusão não segue**, por dois motivos: **(i)** `bookDepth` **não tem bid/ask** — ele serve slippage por profundidade e **não** serve spread, logo escolher (a2) entrega spread **assumido**, não medido; **(ii)** em (a2) e em (a3) **o spread de hoje só existe se for capturado ou declarado hoje**. **⇒ CL-4 não morre: encolhe ~110× e continua capture-or-lose.**
**Ressalva honesta na direção oposta, porque ela também existe:** `bookDepth` é re-baixável **enquanto o dump continuar publicando** — e **`bookTicker` desapareceu do mesmo dump, em silêncio, em 2024-03**. A retenção do bucket S3 é **`[NÃO MEDIDO]`**. ⇒ **precedente medido de que a premissa "é re-baixável" pode falhar sem aviso**, e a mitigação é ridiculamente barata: um `curl -sI` mensal em `bookDepth`, que descobre a perda em um mês em vez de em dois anos.

**⇒ RESÍDUO NOMEADO, e é do owner: (a2) ou (a3)?** Assumir spread, ou medi-lo a 1/min por 1,67% de um balde com folga. **Este registro apresenta os três números e para.**
**O que não julgo:** se a premissa de (a2) é aceitável para o capital do owner.

---

### Q19 · **`RESPONDIDA` em 2026-09-02** · `availability_probe_set`: quais símbolos e endpoints ganham `available_at` OBSERVED?

**(a)** Declare o conjunto: símbolos, endpoints, período e resolução.

**(b) Medido:** no universo inteiro é **aritmeticamente impossível**. `/futures/data/*` tem balde **próprio** de **1000 req/5 min = 200 req/min** `[DOC]`. Um probe de **5 endpoints × S símbolos a cada 10 s** custa `30·S` chamadas/min ⇒ **cabem 6 símbolos**; a **30 s**, **20 símbolos**; a **60 s** a resolução é **mais grossa que a própria dispersão medida da defasagem** (99,6–200,8 s) ⇒ **custa cota e não informa**.

**⭐ R2 amplia o conjunto candidato, por razão de mecanismo, não de zelo:** os **endpoints da Coinalyze têm de entrar**. Provar que `bv` é volume de compra agressora **resolveu dois dos três termos** do predicado de quarentena (`unit`, `label_shift`) e **não resolveu o terceiro** (`available_at IS NULL`) — **é ele que mantém a Coinalyze fisicamente isolada de toda leitura de `backtest`**, e medir a defasagem dela é o único jeito de sair dessa condição. **Restrição a declarar junto: o balde dela é 40 chamadas/min E é CEGO** (zero header de cota no `200`) ⇒ o probe consome de um orçamento que **não se audita pela resposta**.

**(c) Trava:** só o probe de F0. **Decide quais séries têm defasagem real PARA SEMPRE** — latência de campo **não é derivável retroativamente**, e o que ficar fora é **MODELED permanentemente para o período em que ficou fora**.

**(d) RELÓGIO: SIM.** O que não se recupera é a medição do período em que o símbolo ficou fora.

**✅ RESPOSTA DO OWNER (2026-09-02). Declaração literal:**

> **"podemos deixar a vps de fora por enquanto, vamos fazer toda a execução local primeiro antes de
> enviar para lá. Então, a menos que ela trave algum desenvolvimento e teste que n seja relacionado a
> deploy e ambiente, podemos deixar como blocked por enquanto. sobre q19, vamos inicar com btc/usdt,
> eth/usdt, link/usdt, sol/usdt. podemos começar com esses."**

`[PREMISSA-OWNER: 2026-09-02]`

**Símbolos declarados — 4, não o universo inteiro:** `BTCUSDT`, `ETHUSDT`, `LINKUSDT`, `SOLUSDT`. Isto
muda a aritmética de (b): o cálculo original (6 símbolos a 10s, 20 a 30s) era para o universo cheio;
com só 4, **qualquer uma das duas resoluções medidas cabe folgadamente** no balde Binance de 200 req/min.

**Endpoints + resolução — `[DECISÃO-OWNER: 2026-09-02, escolha entre alternativas apresentadas]`:**
apresentadas as opções de resolução (10s vs. 30s, com o custo em chamadas/min de cada) e de escopo
(só Binance vs. incluir Coinalyze), o owner escolheu:
- **Resolução 10s** nos 5 endpoints `/futures/data/*` da Binance — `5 × 4 símbolos × 6/min = 120
  chamadas/min` (60% da cota de 200/min, a resolução mais fina já medida neste registro).
- **Incluir os endpoints da Coinalyze na mesma rodada** — resolve `T-03.6` **e** tira a série Coinalyze
  da quarentena (`available_at IS NULL`, o terceiro termo do predicado que `bv` não fechou) na mesma
  via. Orçamento próprio e cego (40 chamadas/min), **não compete** com o balde Binance.

**Período — `[INFERRED: consistente com o escopo já usado em toda task destravada por Q1 nesta sessão,
e com a frase do owner nesta mesma resposta — "execução local primeiro antes de enviar para lá"]`:**
`T-03.6` constrói o MECANISMO do probe contínuo (a task já pede isso, não um one-shot) e prova a lógica
com uma rodada de proof curta, local — não um deploy 24/7 em VPS. A VPS está deliberadamente fora
(ver decisão abaixo sobre `T-03.9`); rodar o probe continuamente em produção fica para quando a VPS
entrar.

**O que isto DESTRAVA:** `T-03.6` (`availability_probe_set`, fase 03) passa de `blocked` para `todo` —
código do probe (5 endpoints Binance + endpoints Coinalyze, 4 símbolos, 10s) + prova local curta.

**O que isto NÃO destrava, e por quê — decisão explícita, não efeito colateral de Q19:** `T-03.9`
(`observer_region` ao lado de `available_at`) continua `blocked`. Antes desta resposta, `T-03.9` tinha
DOIS bloqueios (`observer_region` da VPS `[NÃO MEDIDO]` **e** dependência de `T-03.6`/`Q19`). Q19
resolve só o segundo. O primeiro — `observer_region` exige `curl -s ipinfo.io` **de dentro da VPS**,
que o owner decidiu deixar fora por enquanto ("podemos deixar como blocked por enquanto") — permanece,
e é o único bloqueio restante de `T-03.9`. **Vale a ressalva que o próprio owner nomeou:** se algo em
desenvolvimento/teste (não deploy/ambiente) travar por causa disso, isso volta à mesa — não é bloqueio
absoluto, é adiamento deliberado.

**Nenhuma chave de API foi escrita neste documento.**

---

## ⏱ Com relógio, não capture-or-lose absoluto

### Q4 · **`RESPONDIDA COM RESÍDUO`** · Coinalyze

*(funde `recorte` §5.1 "key" + §5.6 "pagar fornecedor de histórico" + insumo C1)*

**A pergunta original — *"obter a key esta semana?"* — está RESPONDIDA.** O owner forneceu key temporária (plano free) em 2026-08-25 e o protocolo rodou: **11 chamadas, todas `200`** ([`medicao-coinalyze.md`](medicao-coinalyze.md)).

**O que caiu, e é bastante:**
- **"Agregado multi-exchange"** — **não existe.** 28 exchanges, 5.127 mercados, `exchange` **obrigatório** em cada. Sobra *N chamadas e uma agregação nossa* ⇒ muda o **orçamento de cota**, não a viabilidade.
- **"1 min ≈ 24 h, 5 min ≈ 5,2 d"** — era intervalo **declarado pelo fornecedor**. Medido: o teto é de **PONTOS, não de tempo** ⇒ OI a 1 min **~1,5 dia**, a 5 min **~7,0 dias**; e **série esparsa retém mais tempo de relógio** (liquidação a 1 min alcança **~8 dias com 3.052 pontos**, porque só existe bucket onde houve liquidação).
- **"o valor da Coinalyze encolheu"** — **inverte por granularidade.** Em `daily` ela é a fonte **mais profunda que este projeto conhece**: OI diário **2.409 dias** (até **2020-01-21**), contra 2.183 do dump S3 e 30 do REST.
- **"não há telemetria de cota só no `429`"** — a resposta **`200` não traz NENHUM header de cota** ⇒ o broker é **cego** e conta localmente.
- **`MATICUSDT` não está na Coinalyze** (e `ICXUSDT`, que sai em 2026-08-26, **está**) ⇒ **terceira testemunha independente de que ela não é rota de fuga para survivorship**.

**O que foi ganho, e muda decisão:**
- ⭐ **liquidação diária recuperável 2 anos** (730 dias, até 2024-08-26) ⇒ reformula CL-1 e dá **série de referência independente** (`CA-F0-14`);
- ⭐ **`bv` é volume de compra agressora, PROVADO** contra o dump canônico de 2026-08-24 (2.443.262 linhas, `Decimal` sobre a string crua, 699 buckets em comum): erro mediano **0,0000 bp**, **150/699 buckets exatamente iguais**, hipótese maker **refutada** (mediana 2.584,87 bp). **Cauda NÃO é zero:** p99 **29,34 bp**, máx **1.955,80 bp**, **causa não diagnosticada** (candidata **não medida**: o filtro de fundo de seguro/ADL que a Binance declara excluir do `aggTrade`);
- **OI da Coinalyze vem como OHLC do bucket** (`{t,o,h,l,c}`), não como ponto ⇒ **mudança de TIPO** no PRD (`SeriesKey` ganha `reduction`);
- `has_buy_sell_data` e `has_long_short_ratio_data` = **`true` nos 764 perpétuos** da Binance, com `oi_lq_vol_denominated_in` variando (**744 `BASE_ASSET`, 20 `QUOTE_ASSET`**) ⇒ **confirma `unit`/`denom` obrigatórios como requisito, não zelo.**

**⇒ RESÍDUO NOMEADO, e é do owner: manter o plano free, assinar o pago, ou descartar a Coinalyze do desenho?** O que o free entrega está **medido**: 40 chamadas/min · **zero telemetria de cota no `200`** · retenção intraday rasa e **por contagem de pontos** · `daily` **profundo** · `bv` provado **com cauda não diagnosticada**.

**(c) Trava:** nada em F0/F1. **E R2 acrescenta o oposto:** Q4 respondida **desbloqueou duas entregas em F0** — o one-shot `daily` (**1.140 chamadas, ~28,5 min uma vez**) e a reconciliação diária de liquidação. **O non-goal *"F0 não chama Coinalyze"* foi RETIRADO.**
**E a série continua em quarentena** — pelo **terceiro** termo do predicado, não por ausência de medição. ⇒ **descartá-la depois não é migração: é apagar uma gaveta isolada.**

**(d) RELÓGIO: SIM no intraday** (~1 dia de série de 1 min por dia, com **~1,5 dia de folga real, não 24 h**). **NÃO no `daily`** — que não é apagado **por doc**, e essa permanência é `[DOC-ONLY]`, **medida uma vez**.

---

### Q5 · `ABERTA` · Universo inicial: quais símbolos, quantos, em que cadência?

**(a)** Declare a lista (N e nomes) e a cadência aceitável para a perna de sentimento.

**(b) Medido:** **570** perpétuos TRADING / **527** USDT. OI é **1 símbolo por chamada, sem batch** (funding tem: `premiumIndex` sem `symbol` = **875 símbolos por peso 10** contra `REQUEST_WEIGHT 2400/min`). 570 × 5 séries = **2,85 min/varredura se o balde for por endpoint** e **14,25 min se for compartilhado** — topologia **CONTESTADA e não testada**. A tela comporta **19 / 25 / 36 linhas** a 32 px em 1440 / 1920 / 2560 px.

**Correção de R1, que retirou o poder de gate desta pergunta:** `!forceOrder@arr` cobre **mercado inteiro** ⇒ **nenhum coletor de F0 depende de Q5**, e a frase *"símbolo fora da lista hoje = liquidação daquele símbolo perdida para sempre"* **deixou de valer**. O que ainda escolhe símbolos é o **probe**, e isso é **Q19**.

**R2:** o direcionamento operacional (prazos **15m/1h/4h**, decisão no fechamento do bucket) **encolhe a exigência de cadência**: a varredura transversal deixa de precisar de resolução sub-minuto, e a topologia do balde **deixa de ser impedimento para 1h e 4h** — continua sendo para 5m e 15m transversais.

**(c) Trava:** a forma da tela (watchlist de 20 contra screener de 570 — **layouts incompatíveis**), o orçamento de rate limit, o fan-out de WS, e o dimensionamento de Q2.

**(d) RELÓGIO: SIM, fraco e herdado.** Já **não** há perda de liquidação por símbolo de fora.

---

### Q6 · `INFERÍVEL` · TradFi entra no universo?

**(a)** Os `TRADIFI_PERPETUAL` (equities, commodities) entram, ou o universo é cripto-perp?

**(b) Medido:** **175 `TRADIFI_PERPETUAL`** no snapshot de 2026-08-25 (eram **170** três dias antes), com distribuição de funding **invertida** (`{8h: 158, 4h: 12}`) contra os cripto-perp (`{4h: 433, 8h: 136, 1h: 1}`). O denominador muda todo percentil transversal: o mesmo BTCUSDT sai de **p69,47** (570 perp TRADING) a **p76,00** (875 símbolos de `premiumIndex`) em `|lastFundingRate|`. E `underlyingSubType` distingue **`TradFi` 172 · `('TradFi','ETF')` 1 · `('Pre-IPO','TradFi')` 2** — **`contractType` sozinho não separa**.
**Hipótese testada e DERRUBADA por medição, registrada para não ser reaberta:** que TradFi perpétuo tivesse **calendário de sessão**. **Não tem** — negocia 24/7: em **2026-08-23 (domingo)**, `TSLAUSDT` e `XAUUSDT` têm **288 buckets de `metrics`, 288 `klines`, zero buckets com volume 0, e OI mudando em 287/287**.

**(c)** Sem critério explícito o screener varre uma classe de ativo que o owner não sabe que entrou, e todo número transversal fica **sem universo declarado**.

**(d) RELÓGIO: SIM, fraco, herdado de Q5.** `[INFERRED]` no PRD §9: **cripto-perpétuo; TradFi fora por default** — **uma frase do owner encerra.**

---

### Q7 · `ABERTA` · Bybit entra como fonte de dado nesta fase?

**(a)** Sim/não — e se sim, com quais séries?

**(b) Medido:** `bybit-v5` está no enum do schema com **zero linhas especificadas**. A Bybit publica `fundingInterval` em **minutos** (`{240:408, 480:383, 60:2}` em 793 LinearPerpetual) e **33 de 464** strings comuns divergem no intervalo (**7,1%**). E **não existe `md.instrument` cross-venue**: juntar `cz.open_interest` com `bn.open_interest` — propósito literal do módulo `convergencia` — **não tem chave hoje**.
**R2:** a Coinalyze **também** tem namespace próprio (`BTCUSDT_PERP.A`, códigos medidos: Binance `A`, Bybit `6`, OKX `3`, …) ⇒ **`md.instrument` cross-venue é requisito sob qualquer resposta**, e agora com **três** namespaces em jogo, não dois.

**(c) Trava:** seletor de venue em todas as telas, normalização de unidade **antes da primeira linha gravada**, a convenção de OI (um lado contra dois), e `md.instrument`.

**(d) RELÓGIO: SIM se a resposta for sim.** **Magnitude não medida.**
**Não julgo:** se a Bybit deve ser a *corretora*. Decisão financeira.

---

## 🕐 Sem relógio de dado — mas cada uma, respondida tarde, custa remarcação ou reescrita

### Q8 · `INFERÍVEL` (F0–F2) / `ABERTA` (F4) · Fuso de exibição e fronteira do dia

**(a)** A UI exibe UTC ou `America/Sao_Paulo`, e onde fica a fronteira do bucket diário?

**(b) Medido:** toda a plataforma é UTC por construção (grade do dump, buckets, funding: `nextFundingTime % (h·3600000) == 0` em **570/570**). O CVD acumulado **inverte de sinal** conforme a âncora: mesmo dia, **−1265,982 / +399,745 / +1598,508 BTC** (âncoras 00:00 / 12:00 / 20:00 UTC, via `Decimal`; **as três são invariantes ao bucket** — o que depende do bucket é o *range* da curva).
**Hipótese testada e DERRUBADA, registrada para não ser reaberta:** que `cvd_anchor = DiaUTC` seguisse o **fuso de exibição** e invertesse o sinal. **Não procede** — `DiaUTC` está travado **no nome do construtor do tipo-soma**, não é parâmetro de tela.

**(c) Trava:** rótulo do eixo X, a âncora default do CVD, a fronteira do bucket diário do screener, e **todo teste de fixture**.

**(d) RELÓGIO: NÃO.** Mas fixture marcada antes da resposta vira remarcação ⇒ o prazo é **F4**, não hoje. **Regra fixada independentemente da resposta: armazenamento é sempre UTC.**

---

### Q9 · **`MORTA`** · Retenção de tick: quantos símbolos × quantos dias, e quanto disco?

**⚠️ Esta pergunta MORREU em R2, e não está sendo apagada — está sendo declarada morta com o motivo, porque a próxima pessoa tem o direito de saber que ela existiu e por que não existe mais.**

**Por que morreu, e é aritmética publicada, não opinião.** Medido em R2 (`curl -sI` em `data.binance.vision`, 2026-08-18, `Content-Length` zipado): `metrics` **11.531 B/dia/símbolo**, `klines 1m` **58.262 B/dia/símbolo** (BTCUSDT, que é **teto**: ADAUSDT é 46.746 B). ⇒ **570 símbolos × 2.183 dias = ~14,3 GB de OI a 5 min + ~72,5 GB de `klines` a 1 min = ~87 GB UMA VEZ, para o universo inteiro e a profundidade inteira.** **A resposta é "guarde 1 min de tudo", e custa menos que um terço de UM ANO dos 240 GB de tick que a pergunta orçava.**

**As duas medições que a esvaziaram antes disso:**
1. **CVD por bucket não precisa de tick.** `kline(2·taker_buy − volume)` reproduz o delta do `aggTrade` com **somas idênticas** (corr 1,000000; MAE 0,0443 BTC; drift máx 2,55 BTC que **reverte**) — a **540×/2.412×** menos disco.
2. **A resolução intrabarra que o backtest precisa é entregue por 1m.** Desempate SL-vs-TP: medido em **768 barras de 15m sobre 8 dias** (BTCUSDT, 2026-08-16..23), **756/768 = 98,44%** têm high e low em **barras de 1m diferentes** ⇒ ordem resolvida sem tick; resíduo **12/768 = 1,56%**, com tratamento declarado (convenção **pessimista**: assume-se o stop primeiro, registrada no `run_registry`).

**⚠️ Correção de ARGUMENTO que R2 registra, porque o argumento importa mais que a conclusão:** **quem dispensa CAPTURAR tick é o dump `aggTrades` ser re-baixável desde 2019-12-31**, não o 98,44%. **O 98,44% dispensa COMPUTAR sobre tick.** São dois argumentos para duas decisões diferentes, e conflacioná-los é defeito — porque **se o dump não fosse re-baixável, 98,44% não bastaria**: **absorção está na tese do owner** (*"agressão e absorção via CVD"*, e a `proposta-discovery` §Módulo C nomeia *"Divergência / Absorção de Volume"*), e **absorção por TAMANHO DE TRADE exige tick** enquanto absorção por bucket não.

**⚠️ E duas ressalvas sobre o 98,44% e o 1,56%, que ninguém declarou e que valem escritas:**
- **Procedência estreita:** **um símbolo, 8 dias, um regime de mercado.** Um alt ilíquido tem menos trades por minuto e **o número tende a cair**. Medir num alt custa **46.746 B/dia** (medido em R2 no `klines 1m` de ADAUSDT) e está nomeado como pendência, não estimado.
- **A convenção pessimista não é neutra, e o requisito não é só declará-la.** Assumir o stop primeiro enviesa o resultado **para baixo** — o que é a escolha certa para o capital — mas numa estratégia de borda fina, 1,56% de barras sistematicamente pessimistas pode **virar um resultado marginalmente lucrativo em prejuízo**, e não haveria como saber se o culpado é a estratégia ou a convenção. ⇒ **requisito: o `run_registry` grava a convenção E a CONTAGEM de trades que ela decidiu**, para que a influência dela no número seja **medível em vez de embutida**. *(Nota de denominador: o 1,56% é fração de BARRAS; a fração de TRADES afetados é menor — um trade só é ambíguo se o stop **e** o alvo foram tocados na mesma barra — e é **`[NÃO MEDIDO]`**.)*

**⇒ O resíduo não desaparece: ele MIGRA para `Q20`.** `aggTrade` cru volta a ser necessário **se, e só se**, a fase de estratégia introduzir **absorção por tamanho de trade**, **sweep intrabarra** ou **avaliação sub-minuto** — e **é `Q20` que decide isso**. **A porta a deixar aberta é o gatilho nomeado, não o disco.**

---

### Q10 · `ABERTA` · Ordem dos três produtos: monitorar, pesquisar, executar

**(a)** Ranqueie os três.

**(b) Medido:** só **"pesquisar"** é construível hoje. "Executar" depende de regra de estratégia — **diferida por declaração do próprio owner**. "Monitorar" ao vivo dependia da topologia do balde **não testada** (2,85 vs 14,25 min) e do transporte de leitura, que **não tem ADR**.
**R2 encolhe o obstáculo sem responder a pergunta:** *"não é HFT, decisão no fechamento do bucket, prazos 15m/1h/4h"* `[PREMISSA-OWNER]` ⇒ **"monitorar" não precisa de transporte sub-minuto**, e **fica construível para 1h e 4h** mesmo com a topologia do balde sem teste. **O ranking continua sendo do owner.**

**(c) Trava:** o faseamento na ponta — e decide **qual superfície ganha teclado, densidade e atalhos aprendidos** (as outras são otimizadas para reconhecimento, não recall).

**(d) RELÓGIO: NÃO.**

---

### Q11 · **`RESPONDIDA` em 2026-09-03** · O owner vai marcar o corpus de fixtures à mão? Quantas horas por semana?

**✅ RESPOSTA DO OWNER (2026-09-03). Declaração literal, na grafia dele:**

> **"q11: pode aceitar o default, mas te passo o json caso ele seja importante"**

`[PREMISSA-OWNER: 2026-09-03]`. **Leitura adotada (rótulo próprio):** nenhum compromisso de horas de marcação nem de
auditoria recorrente. A pergunta mudou de forma antes de ser respondida — `ADR-017` (rascunho) separou **detecção**
(sempre autônoma) de **verificação**, e a calibração humana virou sessão pontual por aceite/rejeição de candidatos. O que
essa sessão produziu está em
[`context/plataforma-dados/fixtures/swing-review-BTCUSDT-1b96c671-2026-09-03.json`](context/plataforma-dados/fixtures/swing-review-BTCUSDT-1b96c671-2026-09-03.json):
15m/N=5 e 1h/N=10 escolhidos a olho `[PREMISSA-OWNER: 2026-09-02 — "15 + 5 e 1h + 10 funcinou legal"]`; 15 de 16 OBs não
recusados em 7 s `[NÃO CALIBRADO: passagem de tecla, não julgamento]`. A pilha de verificação fica em invariantes, mutação,
concordância cruzada com o Pine e backtest com walk-forward (`ADR-017/D3`, D3.3 opcional). `T-08.9` deixa de estar
bloqueada por esta pergunta; o modo `review` de `pointer_mode` continua requisito de arquitetura, agora sem horas prometidas.

**O texto abaixo é o estado ANTERIOR à resposta, mantido para rastreio.**

**(a)** Compromisso declarado de tempo do owner para marcar estrutura sobre candles reais.

**(b) Medido/derivado:** **nenhum detector de estrutura é verificável sem esse corpus** — é a única peça de UI cuja ausência **trava a fase seguinte inteira**, e a única saída da plataforma que **só um humano produz**. É trabalho de sessão longa e repetitiva (daí o modo de marcação especificado com **teclado obrigatório**, não mouse).

**⭐ R2 muda a forma desta pergunta, e a mudança a de-risca sem antecipar `Q20`.** Me foi passado que *"o corpus não se reaproveita"* entre marcar Order Blocks e marcar pivôs/Fibonacci. **Isso é verdade para um corpus de ZONAS e falso para um corpus de SWINGS.** Os dois vocabulários se apoiam no **mesmo primitivo**: **pivô é definição de swing · âncora de Fibonacci é par de swings · BOS/CHoCH é rompimento de swing · BSL/SSL é extremo de swing** — e **fixada a definição de swing, os níveis de Fibonacci são aritmética pura, sem parâmetro novo**. ⇒ **duas consequências, as duas de hoje e as duas baratas:**
- **a primeira tranche de horas do owner deve ser MARCAÇÃO DE SWING** — o único trabalho de marcação que **sobrevive a qualquer resposta de `Q20`** e portanto **não é desperdiçado em nenhum cenário**;
- **o primeiro primitivo de `<Anotacao>` é `swing_point`, não `zone`** — zona é OB/FVG/Fib e **depende** de `Q20`; ponto de swing não.

**(c) Trava:** toda a fase de estratégia. Se a resposta for "não vou marcar", **o modo de anotação sai do escopo desta fase e a fase seguinte precisa de outro plano de verificação — que não existe hoje.**

**(d) RELÓGIO: NÃO** — mas é **serial com Q8** (fixture marcada antes do fuso decidido é fixture remarcada) e **serial com a escolha de `price_source`** (a ordenação de highs vizinhos **inverte em 2,09%** entre mark e last ⇒ **a série escolhida decide ONDE O SWING ESTÁ**, e marcação feita sobre uma não vale para a outra).

---

### Q12 · `ABERTA` · `MATICUSDT→POLUSDT` e `RNDRUSDT→RENDERUSDT` são série contínua?

**(a)** Renome = continuidade econômica, ou dois instrumentos?

**(b) Medido:** os dois **não foram deslistados, foram renomeados**, e a API **não expõe a continuidade**. **21,6%** do universo cripto-perp com histórico não existe mais no `exchangeInfo` de hoje (727 → 570). Custo da curadoria: **~5 linhas por ano num YAML**, com `evidence_url` obrigatório — **sem tela**.
**R2 · terceira testemunha independente:** **`MATICUSDT` não está na Coinalyze**, e `ICXUSDT` (que sai da Binance em 2026-08-26) **está** ⇒ **nenhuma fonte deste projeto é rota de fuga para o survivorship.** *(E `premiumIndex` **discorda** do `exchangeInfo` no mesmo instante: 875 contra 872, e um dos 3 extras é justamente `MATICUSDT` — o caso-âncora desta pergunta.)*

**(c) Trava:** `instrument_alias`, e todo backtest futuro que atravesse a data do renome (**série cortada no meio, silenciosamente**).

**(d) RELÓGIO: NÃO.** **Não julgo:** é decisão de significado econômico, não técnica.

---

### Q13 · **`RESPONDIDA` em 2026-08-25** (registrada aqui em 2026-08-28) · Esquema de cor do candle: convencional (verde/vermelho) ou divergente (azul/laranja)?

**(a)** Qual dos dois, sabendo que o convencional exige **codificação secundária obrigatória**?

**(b) Medido** (`validate_palette.js`, executado nos dois modos): azul `#2a78d6` ↔ laranja `#eb6834` → **ΔE protan 24,7** (claro) / **26,8** (escuro), **PASS** em todos os checks. Verde `#008300` ↔ vermelho `#e34948` → **ΔE protan 7,2 / 8,6**, banda **WARN**. O convencional é **3,4× pior sob protanopia em modo claro**. Contra: **Jakob's Law é forte neste domínio** — o owner vem de plataformas verde/vermelho. **E em qualquer um dos dois:** a paleta completa com `critical #d03b3b` **reprova** (`#d03b3b ↔ #eb6834`, ΔE normal **10,8**, abaixo do piso 15) ⇒ **cor de status nunca pode ser marca de gráfico**, e saúde do dado precisa de outro canal (hachura + rótulo).

**(c) Trava:** a alocação de cor da plataforma inteira, e como "dado quebrado" é sinalizado sem colidir com "preço caiu".

**(d) RELÓGIO: NÃO.** **Requisito que torna a resposta tardia barata: cor é token nomeado POR PAPEL desde a primeira linha de CSS** ⇒ trocar o esquema é trocar tokens, não CSS espalhado. **⚠️ O "2 tokens" que esta linha dizia estava ERRADO e foi corrigido em 2026-08-28:** o custo medido é **25 tokens · 4 valores com `hue` · 361 medições** (`SPEC-001:548`, `ADR-010` §5/`E-2`). `[MEDIDO]`

**✅ RESPOSTA DO OWNER (2026-08-25) — registrada AQUI só em 2026-08-28, e o atraso é o defeito:**
**convenção ocidental (verde/vermelho)**, com a codificação secundária obrigatória que `(b)` exige.
Consolidada em [`ADR-010`](adr/ADR-010-governanca-de-cor-por-tipo-de-marca.md) (**`ACEITO pelo owner em
2026-08-25`**, supersede `SPEC-001` §6.2) e já refletida em `SPEC-001:649`.

> **Por que este bloco existe.** Entre 2026-08-25 e 2026-08-28 a `SPEC` dizia **`RESPONDIDA`** e este
> arquivo — que se declara **fonte única de estado** — dizia **`ABERTA`**. Duas superfícies discordando
> sobre o estado de uma decisão do owner é exatamente o defeito que o §"colisão de numeração" deste
> arquivo existe para não repetir. **A divergência era daqui, não da SPEC.** Encontrada por
> `grep -n Q13` nas duas superfícies durante a orquestração de `/workflow` em 2026-08-28.
> `SPEC-001` §12/`ADR-010` seguem valendo: `critical` **fora do canal de cor**.

---

### Q14 · `INFERÍVEL` · Idioma da UI

**(a)** pt-BR ou en?

**(b) Medido: nada.** Toda a microcopy foi escrita em pt-BR **por consistência — escolha default, não decisão**. Fixado independentemente da resposta: `funding`, `open interest`/`OI`, `taker`, `aggTrade`, `CVD` **não se traduzem** — são **identificadores de série**.

**(c) Trava:** toda a microcopy, e os testes de comportamento que afirmam texto de tela.

**(d) RELÓGIO: NÃO.** **Consequência de domínio que a inferência original não nomeava:** **serialização de numeral em QUALQUER caminho de dado (fixture, export, API, hash, `run_registry`) é INVARIANTE DE LOCALE** — ponto decimal, sem separador de milhar — senão o fixture *"byte-idêntico ao que o gráfico exibiu"* **deixa de ser byte-estável** entre `LANG=pt_BR.UTF-8` e `LANG=C`, e **fixture que não é byte-estável não é fixture**. pt-BR aplica-se **exclusivamente** a microcopy e rótulo de eixo. **Teste:** exportar com os dois `LANG` e comparar `sha256sum`.

---

### Q15 · `ABERTA` · Termos de uso e redistribuição de Binance, Bybit e Coinalyze

**(a)** Alguém lê os ToS dos três antes de a acumulação começar?

**(b) Medido: nada — os ToS dos três não foram lidos por ninguém.** Rótulo honesto: **zero evidência.**
**R2 acrescenta urgência de contexto, não de relógio:** a chave da Coinalyze **já foi usada** (11 chamadas) e F0 ganhou um **one-shot de 1.140 chamadas** mais uma **reconciliação diária**. ⇒ **o volume que a restrição alcançaria retroativamente acabou de crescer**, e a pergunta continua sem dono.

**(c) Trava:** nada tecnicamente. Mas qualquer restrição de armazenamento ou redistribuição incide **retroativamente** sobre exatamente o ativo que Q1, Q4 e Q5 mandam acumular a partir de hoje.

**(d) RELÓGIO: NÃO por si.** Mas o custo de descobrir tarde é **proporcional ao que Q1 já acumulou** — **tensão real com Q1, e este registro não a esconde.**
**Não julgo:** jurisdição e regulação.

---

### Q16 · **`RESPONDIDA` em 2026-08-28** · `charts` e `web` têm dono de julgamento, e `frontend/` ganha regra?

**(a)** Escrever a entrada em `[agents.by_component]` para `charts`/`web`, e decidir se `frontend/` recebe globs TS + pack — ou **re-declarar a lacuna explicitamente**.

**(b) Medido no próprio repositório:** `[agents.by_component]` mapeia `sentimento`, `convergencia` e `backtest` e **não tem entrada para `charts` nem `web`** — os dois componentes que a rodada de UX produz. `include_prefixes=["backend/src/"]` + `include_globs=["*.py"]` + `packs=["core"]` ⇒ o `harness doctor` dirá **CONFORME** sobre um universo que **não contém um único `.tsx`**. As 4 regras bloqueantes em vigor do pack `core` são **higiene de Python**.
**E a medição por comportamento derruba a solução mais óbvia:** um `frontend/src/Probe.tsx` violando duas regras **por construção** devolve **saída VAZIA, zero regras avaliadas** — as regras de `web-fullstack` têm `scope = "code"` e **o classificador não considera `frontend/` código**. ⇒ **adotar um pack sozinho não resolve nada**; o fecho tem **duas partes obrigatórias**: prefixo + globs TS/TSX **e** um pack cujos `paths` casem o layout.

**(c) Trava:** nada de dado. Trava **a revisão da primeira linha de frontend** — e é exatamente lá que **todo o sistema de honestidade do dado especificado nesta rodada vai morar**.

**(d) RELÓGIO: NÃO** (de dado). **Relógio de retrabalho: antes do primeiro `.tsx`.** Descobrir depois de 3.000 linhas de Next.js é o cenário caro.

**✅ RESPOSTA DO OWNER (2026-08-28), escolhida de um conjunto enumerado durante a orquestração de
`/workflow`. Declaração literal da opção selecionada:**

> **`charts` → `quant-architect` · `web` → `ui-designer`**

`[PREMISSA-OWNER: 2026-08-28]`

**O critério que a resposta aplica é CLASSE DE RISCO, não camada.** `charts` carrega a honestidade do
dado — o selo de quatro campos, a política de ausência por `nature`, `LOCF` sobre `FLOW` como **erro de
tipo**, a âncora obrigatória de `cvd_cum` — e errar ali produz um gráfico que **mente sem avisar**. Isso
é julgamento quantitativo. `web` carrega transporte, `knowledge_time` na URL, auth mínima e o bundle
endereçável por conteúdo — julgamento de superfície e interação.

**⚠️ Esta resposta NÃO revoga a delegação de design do `CLAUDE.md`.** O `ui-designer` continua decidindo
UI/UX sem pedir permissão, com `ux-ui-mastery` como gate. O que `[agents.by_component]` nomeia é **dono
de julgamento no harness** — quem responde pela revisão do componente —, e para `charts` o owner
declarou que essa responsabilidade é do arquiteto quantitativo. **Consequência operacional a registrar
em `T-01.3`:** toda tela de `charts` passa a ter **dois** julgamentos independentes — `quant-architect`
sobre a fidelidade do dado, `ux-ui-mastery` sobre a interação. **Nenhum dos dois aprova o trabalho do
outro.**

**O que isto DESTRAVA:** `T-01.2` (`CST-9`) e `T-01.3` (`CST-10`), as duas únicas tasks bloqueadas por
`Q16`. **O relógio de retrabalho parou** — a resposta chegou antes do primeiro `.tsx`, que é a condição
que `(d)` nomeava.

**O que isto NÃO resolve, e continua sendo trabalho de `T-01.2`:** o fecho de `frontend/` tem **duas
partes obrigatórias** (`(b)`), e nomear o dono é **zero** delas. Medido em 2026-08-28, inalterado:
`harness policy --key code_paths` → `include_prefixes=["backend/src/"]`, `include_globs=["*.py"]`
⇒ `harness rules --mode file --path frontend/src/<violador>.tsx` **continua devolvendo saída vazia**
até `D1.3` fechar.

---

### Q18 · `ABERTA` · Profundidade do backfill do dump `metrics`: 30 dias ou 2.183 dias?

**(a)** Qual profundidade a fila de ETL persegue?

**(b) Medido:** o `30` que circulava era **a janela do REST**, aplicada por inércia a um arquivo de **2.183 dias** (grade de 5 min, 570/570 símbolos cobertos, desde 2020-09-01). Custo de ETL: **0,86 s/arquivo (n=11)** ⇒ **570 × 30 ≈ 17.100 arquivos ≈ 4,1 h sequenciais** contra **570 × 2.183 ≈ 1,24 M arquivos ≈ 297 h sequenciais**.

**⭐ R2 reformula: NÃO é pergunta de disco, é pergunta de RELÓGIO e PARALELISMO.** Medido nesta rodada: o zip de `metrics` de um dia de um símbolo é **11.531 B** ⇒ **a profundidade inteira do universo inteiro é ~14,3 GB.** **Disco não decide nada aqui.** O que decide é o relógio: **297 h sequenciais** por série (e **~594 h** se `klines 1m` entrar junto, que é o que a aritmética de Q9 recomenda), **paralelizáveis numa fila retomável**.

**(c) Trava:** nada. **É o oposto de urgente** — o dump é re-baixável.

**(d) RELÓGIO: NÃO.** **Requisito que torna a resposta tardia barata: a fila é retomável e a profundidade é PARÂMETRO dela** ⇒ começar por 30 dias e estender depois **não é retrabalho**, é a mesma fila com outro limite.

---

### Q20 · **`RESPONDIDA` em 2026-09-03** · A fase de estratégia detecta SMC, detecta pivôs + Fibonacci, ou os dois?

**✅ RESPOSTA DO OWNER (2026-09-03). Declaração literal:**

> **"q20; coexistem"**

`[PREMISSA-OWNER: 2026-09-03]`. **Os dois vocabulários entram.** O que já estava fixado sob qualquer resposta continua: o
primitivo compartilhado é o **swing** (`ADR-017/D7`), os níveis de Fibonacci são aritmética sobre pares de swings, e o corpus
de **zonas** (OB/FVG × retração/extensão) não se reaproveita entre os dois — o de swings, sim. Sinal anterior à resposta,
mesma sessão: o owner nomeou *"OB, chock, bms"* e pediu BMS/CHoCH e OB no piloto `[PREMISSA-OWNER: 2026-09-02]`. Definições
paramétricas de v1 e a divisão classe A (definição) / classe B (operação) estão em
[`context/plataforma-dados/gates/Q11-v1-validacao-quant-architect.md`](context/plataforma-dados/gates/Q11-v1-validacao-quant-architect.md).
**Resíduo, e é do time, não do owner:** absorção por tamanho de trade (que reabriria `aggTrade` cru, `Q9`) segue não decidida
— `dinheiro preso` é evento de `convergencia` e depende de OI, não de tick.

**O texto abaixo é o estado ANTERIOR à resposta, mantido para rastreio.**

**(a)** Escolha: **(i)** SMC (OB, FVG, BSL/SSL, BOS/CHoCH) · **(ii)** pivôs + retração/extensão de Fibonacci + volume · **(iii)** os dois.

**(b) De onde vem a ambiguidade, e ela é entre dois documentos do owner.** A `proposta-discovery` **§Módulo B** nomeia **Order Blocks, FVG, BSL/SSL, BOS/CHoCH** — vocabulário SMC — e **§Módulo C** nomeia *"Divergência / Absorção de Volume (CVD)"*. O `direcionamento-operacional` de 2026-08-25 nomeia **pivôs de alta/baixa, regiões de retração/extensão de Fibonacci, e volume negociado** `[PREMISSA-OWNER]` — **e não menciona SMC.** São vocabulários diferentes, e **este registro NÃO infere qual vale**, porque **nenhuma das direções tem custo de reversão baixo**: inferir "os dois" **dobra a estimativa** da fase seguinte; inferir "só Fibonacci" faz o **corpus de OB nunca ser marcado**.

**⭐ (b2) A observação que vale sob QUALQUER resposta, e é mais útil que a resposta.** Os dois vocabulários se apoiam no **mesmo primitivo**:

| construto | é, operacionalmente |
|---|---|
| pivô de alta/baixa | **uma definição de swing** |
| âncora de retração/extensão de Fibonacci | **um par de swings** |
| BOS / CHoCH | **rompimento de swing** |
| BSL / SSL | **extremo de swing** |

E **fixada a definição de swing, os níveis de Fibonacci são aritmética pura — sem parâmetro novo.** ⇒ isto confirma **por um segundo caminho independente** o que a skill do repositório já dizia (*"definição de swing — TODA a detecção de estrutura depende desta escolha; é a primeira a fixar"*): **a definição de swing é o parâmetro de maior alavancagem do projeto inteiro.**

**(c) Trava, em três lugares:** **(i)** o que a fase seguinte detecta; **(ii) o que o owner marca à mão** — marcar Order Block e marcar pivô/Fib são trabalhos distintos, **e o corpus de ZONAS não se reaproveita** (o de **swings** se reaproveita — ver Q11); **(iii)** a estimativa da fase seguinte. **E um quarto, indireto: decide se `aggTrade` cru volta a ser requisito** — absorção **por tamanho de trade** exige tick, absorção **por bucket** não (ver Q9).

**(d) RELÓGIO: NÃO.** **O que fica fixado hoje, independentemente da resposta, e portanto de-risca a espera:** o primitivo de `<Anotacao>` é **`swing_point`** · `price_source` é declarado **por uso** (`structure_detection` → `klines_last`, porque a ordenação de highs vizinhos **inverte em 2,09%** entre mark e last) · `tick_size`/`price_precision` são **fatos datados** (toda tolerância de estrutura é expressa em ticks) · e **a primeira tranche de horas de marcação de `Q11` é swing**, que não é desperdiçada em nenhum cenário.

---

## Mapa de deduplicação e de origem (para rastrear)

| origem | virou |
|---|---|
| `recorte` §5.1 (key Coinalyze) + §5.6 (pagar fornecedor) + C1 | **Q4** |
| `recorte` §5.2 (universo) + C2 (símbolos/cadência) + "N da watchlist" (3 telas) | **Q5** |
| `recorte` §5.3 (retenção de tick) + parte de C3 (orçamento de disco) | **Q9** → **MORTA em R2**, resíduo em **Q20** |
| C3 (onde roda / para quem) + "login: indefinido, não construir especulativamente" | **Q2** |
| `recorte` §5.4 (TradFi) → **Q6** · §5.5 (alias) → **Q12** · §5.7 (Bybit) + C6 → **Q7** · §5.8 (ToS) → **Q15** |  |
| C4 (fuso) → **Q8** · C5 (ordem dos produtos) → **Q10** |  |
| B6 (liquidação capture-or-lose) + D2 (snapshot diário) + "funding estimado sem histórico" | **Q1** |
| A1 + A2 (harness sem dono / `frontend/` sem regra) | **Q16** |
| novas da rodada de superfícies | **Q3** (canal de alarme) · **Q11** (compromisso de marcação) · **Q13** (esquema de cor) · **Q14** (idioma) |
| **novas em R1, as três de FATO MEDIDO** | **Q17** (`bookTicker` 404 no dump desde 2024-03) · **Q18** (dump com 2.183 dias, o `30` era do REST) · **Q19** (balde de 200 req/min torna o probe de universo inteiro impossível) |
| **nova em R2** | **Q20** (`proposta-discovery` §Módulo B nomeia SMC; `direcionamento-operacional` nomeia pivôs+Fibonacci e não menciona SMC) |

---

## O que NÃO é pergunta do owner — não transformar em item de PRD

Estas são **medição ou decisão do time**, não decisão humana de negócio. Colocá-las na lista do owner é passar para ele uma conta que é nossa:

- **`lag_ms` real por endpoint** (hoje `n=2` transições, 1 símbolo, 1 janela de 10 min). Fecha com o teste M-1, **90 min de script** — **e M-1 não basta**: `available_at` OBSERVED em regime exige o **probe contínuo**, cujo *conjunto* é **Q19**.
- **Topologia do balde de rate limit** (2,85 vs 14,25 min/varredura). Fecha com **rampa até o primeiro 429** e recuo. **Não é diferível.** **E R2 mediu que a cegueira é o caso geral:** `/futures/data/openInterestHist` devolve `200` com **zero headers `x-mbx-*`** (só CloudFront e segurança), enquanto `/fapi/v1/depth` devolve `x-mbx-used-weight-1m` ⇒ **dois dos três canais são cegos**, e o cego que importa é **o do screener**.
- **Motor de armazenamento.** **Três candidatos em R2** — TimescaleDB, ClickHouse e **Parquet/DuckDB** (acrescentado pelo owner). **Nenhum dos três foi instalado nem medido**; o contrato temporal desta fase é portável entre eles. ADR separado, **com falsificador**.
- **Transporte de leitura** (WS / SSE / polling) e `max_staleness_ms` por série. Precisa de ADR (`faseamento:A3`), não de resposta do owner. Regra já fixável: **o browser nunca recebe tick.**
- **`field` canônico (`base_contracts` vs `notional_usd`), `reduction` de OI cross-fonte, limiar de sinal, matriz de convergência, detectores de estrutura.** Esta fase entrega a **distribuição**; o limiar é **parâmetro**.
- **Coinglass.** Nomeada pelo owner como candidata a par da Coinalyze. **Zero medição: nem doc lida, nem endpoint chamado, nem key.** ⇒ **medi-la é trabalho do time, não pergunta ao owner** — e **nenhum requisito depende dela hoje, de propósito**. O que a Coinalyze acabou de demonstrar é o motivo: **11 chamadas derrubaram cinco afirmações que três documentos repetiam.**

**Fora do meu julgamento, por declaração:** escolha de exchange/corretora como decisão financeira · tamanho de posição e gestão de risco do capital · jurisdição e regulação · se `MATIC→POL` deve ser série contínua para efeito de capital · se pagar assinatura de histórico vale o preço · **e qual tese de estrutura de preço o produto persegue (`Q20`) — é escolha do owner sobre o próprio método.**

---

## Q3 · `ABERTA` · Por qual canal fora do browser o owner é avisado que um coletor parou?

*(Fica no fim por ordem de leitura, não de urgência: ela tem relógio.)*

**(a)** Push, e-mail, Telegram — qual, e para qual endereço? **E quem recebe quando o owner está indisponível?** (`[GAP G5]` — operação de um só com SLO P1 de 24 h.)

**(b) Medido:** o SLO "coletor parado" é **P1**, e **R2 corrige o orçamento dele, que era uma constante errada.** A janela de reparo não é "24 h de retenção na Coinalyze" — é **`pontos_de_retenção × intervalo`, por série**: OI a 1 min dá **~1,5 dia**, a 5 min dá **~7,0 dias**. ⇒ **trilhar a série de 5 min em vez da de 1 min multiplica o orçamento do SLO por ~4,7**, e essa escolha tem de ir **escrita**.
**⚠️ E há um caso adverso que ninguém tinha dito:** a série de **liquidação é ESPARSA** — só existe bucket onde houve liquidação — logo **a janela de retenção dela ENCOLHE exatamente durante uma cascata**, que é o único regime em que ela importa. **Retenção e necessidade são anticorrelacionadas nessa série.** ⇒ a Coinalyze **não é rede de segurança** do coletor de liquidação, e isso é **argumento adicional a favor de Q1**, não substituto dele.
O alarme **não pode** ser por taxa de mensagens: a vazão de `aggTrade` do mesmo símbolo variou **3,66×** entre dois dias da mesma semana (55,6 msg/s em 08-21 contra 15,2 em 08-23; picos 3.224 e 2.861, e o pico de 08-20 foi **3.468** num dia com 43% menos trades). **O detector correto é contiguidade: 0 saltos de `agg_id` em 8.873.078 linhas** em 3 dias.

**(c) Trava:** o console de coleta é ferramenta de **diagnóstico**, não de alarme — **uma aba fechada não avisa ninguém**. Sem canal externo, Q1, Q4 e Q19 **morrem em silêncio** e a perda é permanente.

**(d) RELÓGIO: SIM (condicional).** Ele não perde dado por si; **é o que impede os outros de perderem.**

---

**Nada foi escrito, editado ou comentado no tracker por este documento.** Ledger em **`PRD_DRAFT`**, intocado. Arquivos lidos nesta consolidação: `docs/specs/PRD-001-plataforma-dados.md`, `docs/context/plataforma-dados/handoff_to_architect.md`, `docs/medicao-coinalyze.md`, `docs/direcionamento-operacional.md`, `docs/plataforma-superficies-e-faseamento.md`, `docs/recorte-plataforma.md`, `docs/avaliacao-discovery.md`, `docs/proposta-discovery.md`, `harness.toml`, `data/snapshots/`. **E `harness doctor` CONFORME não é evidência de nada acima.**

---

## ✅ 2026-09-03 · `A4`/`A6`/`A7` — a fronteira de processo do `web`, RESPONDIDAS

**Estas três não são `Q` da rodada de discovery acima.** Elas nascem do parecer de fronteira
[`gates/consulta-fronteira-web-2026-09-03.md`](context/plataforma-dados/gates/consulta-fronteira-web-2026-09-03.md)
(pendências `A1`–`A7`), pedido pelo owner na mesma data. Ficam neste arquivo porque **as três eram
gates de owner** e este é o registro único de decisão humana.

**⚠️ O rótulo das três é `[DECISÃO-OWNER: 2026-09-03, escolha entre alternativas apresentadas]`, NÃO
`[PREMISSA-OWNER]`** — o owner escolheu opções de um menu que um agente redigiu, com o custo de cada
uma declarado. Nenhuma das frases abaixo é fala dele. `CLAUDE.md` §*"os dois rótulos de owner não são
o mesmo ato"*.

### A pergunta que originou as três, e ela É citação literal

> *"Dono da verdade é o back, então por isso da procupação. A menos que arquiteto me explique que cli
> consultar direto é melhor do lado do front, n gostaria que isso ficasse ali, dentro do contexto que
> sou acostumado, os dados sempre vem do backend. … Já havia sido pontuado antes que o back subiria um
> servidor com fastapi. Do lado do next, precisamos de um especialista"*

`[PREMISSA-OWNER: 2026-09-03]` — **e o arquiteto NÃO defendeu o CLI direto.** Ele mediu que o caminho
é indefensável por três razões independentes: contradiz a aresta `API --> WEB --> CH` de
[`arquitetura-fluxos.md:78`](arquitetura-fluxos.md); `spawnSync` não existe em browser, logo aquele
caminho nunca viraria produção; e `ADR-005/D1` já fixou as duas rotas de leitura, nenhuma delas
subprocess.

### `A4` — **FastAPI é a única porta de leitura.** `Next` não é segunda verdade

**Escolhido:** o backend serve as duas rotas de `ADR-005/D1` (HTTP endereçável por conteúdo para
histórico, SSE para a borda direita). O `Next` renderiza e, se precisar, **proxia sessão/auth apenas —
zero SQL, zero regra de domínio, zero subprocess.**

**Recusadas, com o custo que estava no menu:** *BFF no Route Handler* — *"reabre a porta de segunda
verdade que o `M3` está fechando, e o schema passa a existir em dois lugares"*; *serviço Python
separado* — *"força o componente `infra` (`ADR-009/D5`) e um container novo numa VPS já com 6 serviços
sob pressão de disco"*.

⇒ **O componente `infra` NÃO nasce por esta decisão.** `ADR-009/D5` continua aberto e é ato do owner.
⇒ **`ADR-005` precisa de emenda:** ela decidiu o PROTOCOLO e é **omissa na fronteira de processo**.
Dono da emenda: `quant-architect`. **`A5` (o schema da RESPOSTA) continua `[NÃO SEI]`** e decide se
~250 linhas de TS vivem.

### `A6` — `web` ganha arquiteto de front próprio; o `ui-designer` volta a julgar só design

**Escolhido:** criar o **arquiteto de front** e portar do `anything` a dupla **builder/QA de front**
([`frontend_builder.agent.md`](/home/stharley/Documentos/projects/anything_monorepo/.github/agents/frontend_builder.agent.md),
[`frontend_qa.agent.md`](/home/stharley/Documentos/projects/anything_monorepo/.github/agents/frontend_qa.agent.md)).
O `ui-designer` **mantém o `design_gate`** e deixa de ser `architect` de `web`.

**O defeito que isto corrige, medido:** [`harness.toml:643-645`](../harness.toml) põe
`web.architect = ".claude/agents/ui-designer.md"` — um operador de Stitch como dono de julgamento do
**schema de transporte SSE**, do bundle-URL e de 7 módulos de domínio portado.

**O que a decisão NÃO invalida:** a resposta de `Q16` (2026-08-28, `[PREMISSA-OWNER]`, §Q16 acima)
foi *"charts → quant-architect · web → ui-designer"*. Ela **não é apagada** — era correta para o
universo de 2026-08-28, quando `web` não tinha módulo de domínio portado nem transporte. **`A6`
sucede `Q16` na chave `web.architect`; `charts` fica intocado.**

**Viabilidade já medida:** o conjunto de papéis de `[agents.by_component]` é **ABERTO** —
`lib/policy.py:549-550` itera `for papel, valor in mapa.items()` ([`harness.toml:594-595`](../harness.toml))
⇒ `web.builder` e `web.qa` são declaráveis **sem mudar o plugin**.

**Ganho colateral, e é a resposta à outra metade da pergunta do owner:** o `frontend_qa` traz
**Vitest + Testing Library + Playwright**. Hoje `frontend/` prova com `node --test` sem `tsconfig.json`,
e os 3 `.tsx` **não importam `react`** (`grep -rn 'from "react"' frontend/src | wc -l` → **0**,
`[MEDIDO 2026-09-03]`).

**Duas correções de fato ao que o owner lembrou, registradas para a proposta não nascer torta:**
**não existe `frontend_architect` no `anything`** (`find anything_monorepo -path '*/agents/*.md'` →
**12 arquivos**, dos quais 3 de front; o `architect.agent.md` de lá é único e genérico), e o
`ui_designer` daquele repo **é o que este repositório já tem**.

### `A7` — a fase `05` é REABERTA para receber o item de scaffold

**Escolhido:** reabrir [`05_fatia_visivel.md`](plans/SPEC-001-plataforma-dados/05_fatia_visivel.md).
É onde `Q16` e a fatia visível já moram, e onde `T-05.8`/`T-05.9` deixaram **a metade cliente** de um
transporte sem servidor.

**Custo aceito, como estava no menu:** *"mexer numa fase com tasks `done` — ato de owner no ledger"*.
**Recusadas:** fase nova depois da `08` (*"o front continua provando por `node --test` até lá, e as
~250 linhas reféns envelhecem mais"*) e SPEC nova só para a superfície servida.

### Ordem de execução que estas três impõem, e ela não é preferência

`A4`→`A5` **antes** de `A1`–`A3`: o schema da resposta decide quanto dos 9 ports Python→TS sobrevive.
Mexer nos ports antes disso é reescrever duas vezes.

### O que continua ABERTO depois destas três

| # | pergunta | dono |
|---|---|---|
| `A1` | qual lado é fonte de verdade do domínio portado, e como a paridade é provada sem `import` cross-language | `quant-architect` (gatilho de `ADR-003/D2` **já disparou**) |
| `A2` | *delisting badge* é regra de exibição (`web`) ou predicado de domínio (`sentimento`)? | `quant-architect` |
| `A3` | `bigint` de `s2-cvd.ts` × `Decimal` de `cvd.py` — divergência tolerável no universo real? | `quant-architect` |
| `A5` | schema da RESPOSTA da rota de histórico — linhas canônicas do CLI ou rows? | `ADR-005` (omissa) + `ADR-008` para o efeito em `DoD-2` |
| `ADR-009/D5` | o componente `infra` é adotado ou recusado? | **⛔ owner** — `A4` apenas **não o exige**; não o resolve |

**Nada foi escrito no ledger, no `harness.toml`, no `tasks.toml` ou no Jira por este registro.**
Materializar `A6` em `[agents.by_component]` e `A7` no ledger são atos subsequentes — `A6` tem
precedente de forma em `T-01.3`, que foi a task que gravou a resposta de `Q16`.

### ⚠️ 2026-09-03, MESMO DIA, MAIS TARDE — o owner CORRIGE a forma de `5.13`: a camada de API não pertence ao bounded context

**Declaração literal, e o rótulo é `[PREMISSA-OWNER: 2026-09-03]` porque é fala dele:**

> *"se é outro bounded context deve ser isolado dentro do que conversamos: sentimento, charts,
> convergencia na minha visão deveria ser bounded-context. Até pq já me parece que sentimento ta
> virando enorme.*
>
> *e sim, precisa ser exposto uma camada de API, daí a camada de api n pertence ao bounded-context, é
> o consumidor, usando de injeção de dependencias dos módulos. works tendem a ser a mesma coisa."*

**O que isto REVOGA:** o item `5.13` do plano `05`, escrito horas antes, declara a rota como **camada
`infra` do contexto `sentimento`**. **Essa forma está recusada pelo owner.** A camada de API é
**consumidora** dos módulos por injeção de dependência, e **worker é a mesma classe de coisa.**

### As três medições que sustentam a correção — e elas mostram que o `/architect` divergiu do próprio `ADR-009`

`[MEDIDO 2026-09-03 em 8c002e4]`:

```bash
# 1. o tamanho do unico bounded context deste repositorio
for d in domain use_cases infra; do
  find backend/src/modules/sentimento/$d -name '*.py' | wc -l
  find backend/src/modules/sentimento/$d -name '*.py' -exec cat {} + | wc -l
done
# domain 61 modulos / 10.319 linhas · use_cases 20 / 2.034 · infra 49 / 6.593
# => sentimento = 130 modulos, 18.946 linhas, e e o UNICO contexto

# 2. o maior contexto do anything, para escala
for d in anything_monorepo/backend/src/modules/*/; do ...; done | sort -rn
# messages 50 modulos / 9.313 linhas, de 12 contextos

# 3. ONDE a API vive no anything
find anything_monorepo/backend/src -maxdepth 2 -type d
# backend/src/{api,api/routes,jobs,main,core,infra,config,modules}
grep -rln 'FastAPI(' anything_monorepo/backend/src   # -> src/main/__init__.py
# api  = 34 modulos / 10.854 linhas  FORA de modules/
# jobs =  3 modulos /    186 linhas  FORA de modules/
```

**`sentimento` é 2,6× o maior contexto do `anything`, sendo o único.** A observação do owner
(*"ta virando enorme"*) **não é impressão — é 130 contra 50.**

**E a forma que ele descreveu é a que o `anything` já roda.** ⇒ pôr a rota como `infra/` de
`sentimento` **divergia de `ADR-009`**, cuja razão de existir é *"reuso da forma do `anything`"`. O
`/architect` fundamentou a escolha em `backend/pyproject.toml:202-207` (`layers`/`containers` do
`import-linter`) — que é verdade sobre o **contrato existente** e **não** sobre a forma do vizinho.
**Nenhum dos dois agentes mediu `anything_monorepo/backend/src/api/` antes de escrever `5.13`.**

### O que esta premissa RESOLVE de `ADR-009/D5`, e o que ela deixa em aberto

**RESOLVE a substância:** a camada de API **não** é parte de bounded context. **`5.13` tem de ser
reescrito** — e reescrever item que **nasceu hoje e nunca teve task** não é reabrir trabalho feito.

**DEIXA EM ABERTO, e é decisão de owner porque mexe no vocabulário fechado:** *qual rótulo de
componente* a camada de API recebe — `infra` (o nome que `ADR-009/D5` propôs), `api`, ou nenhum. Isso
é `harness policy --key components`, com efeito em `[agents.by_component]`, `[code_paths]` e
`require-code`. **Um menu com o custo de cada opção é ato do `/architect`; a escolha é do owner.**

### ⏸ PERGUNTA NOVA, com relógio, que esta premissa abre e NINGUÉM tinha feito

**`sentimento` deve ser PARTIDO em mais de um bounded context?** O owner nomeou três
(*"sentimento, charts, convergencia"*), mas `charts` e `convergencia` são hoje **componentes de
front/domínio**, não módulos de `backend/src/modules/`. A pergunta é **de partição de contexto, não de
rótulo**, e ela **não bloqueia** a correção de `5.13`.

**O relógio é de retrabalho, não de dado:** partir contexto depois de `import-linter` ter contrato
`containers=["src.modules.sentimento"]` e depois de a camada de API injetar dos módulos custa
migração de contrato + reescrita de import. **Hoje: 130 módulos.** Dono: **owner**, assessorado pelo
`quant-architect`. **NÃO decidida aqui, e não decidi por omissão.**

> **✅ CORREÇÃO MEDIDA a esta seção, 2026-09-03, mesmo dia — e o defeito é meu, não do owner.** Duas
> linhas acima eu escrevi que o rótulo de componente tem efeito em *"`[agents.by_component]`,
> `[code_paths]` e `require-code`"*. **A parte de `[code_paths]` e `require-code` é falsa, e eu a
> publiquei sem comando** — exatamente o que `CLAUDE.md` §*"Nenhum número sem o comando que o
> produziu"* existe para impedir. Medição do `/architect`: `harness code-paths classify` de
> `backend/src/api/...` **já devolve `producao`** independentemente de rótulo, e `require-code`
> responde *"código permitido — scope"* porque `backend/src` é **1 dos 19 prefixos**
> `[MEDIDO 2026-09-03]`. **O rótulo afeta SÓ `components` + `[agents.by_component]`** (`V-16`,
> `lib/policy.py:539-543`) — ou seja, **quem julga**, e nada mais. A frase original fica onde está,
> porque apagá-la esconderia que a decisão do owner foi apresentada com um custo inflado.

### ✅ 2026-09-03 — o rótulo da camada de API: **`infra`**, e o vocabulário fechado vai de 6 para 7

`[DECISÃO-OWNER: 2026-09-03, escolha entre alternativas apresentadas]` — **não é fala do owner.** Ele
escolheu a **opção A** de um menu de três que o `/architect` redigiu, com o custo de cada uma medido.

**Escolhido:** a camada de API **e os workers** recebem o rótulo **`infra`**.
`harness policy --key components` passa de **6** (`sentimento · charts · convergencia · backtest ·
web · docs`) para **7**.

**O custo que ele aceitou, na redação do menu:** *"põe o schema HTTP e o TLS/compose sob o mesmo
juiz — duas classes de risco diferentes com um só dono"*.

**Recusadas, com o custo declarado:** **`api`** — *"nome preciso para a API, mas **mente para o
worker** (`jobs/` não é API) e deixa `ADR-009/D5` aberto para `deploy/`/backup ⇒ duas decisões em vez
de uma"*; **nenhum rótulo** — *"zero ato de política, mas cai em `ADR-003:11-13` (componente sem dono
de julgamento) e faria `sentimento` rotular código que não é dele — falso por construção"*.

**⚠️ O que o rótulo faz, MEDIDO, e é menos do que a primeira redação desta seção afirmava:** ele
afeta **só** `components` + `[agents.by_component]` (`V-16`, `lib/policy.py:539-543`) — ou seja,
**quem julga**. Ver a correção acima: `[code_paths]` e `require-code` **não** dependem dele.

**Pendência que a escolha ABRE, e é do owner:** `[agents.by_component.infra]` precisa de um
`architect`, e **nenhum dos agentes existentes é obviamente o juiz** — o próprio custo aceito
(*"schema HTTP e TLS/compose sob o mesmo juiz"*) é o argumento de que talvez seja um novo. Menu a
cargo do `/architect`; escolha do owner.

### ✅ 2026-09-03 — partição de `sentimento`: o owner pediu **ESTUDO**, não decidiu partir

`[DECISÃO-OWNER: 2026-09-03, escolha entre alternativas apresentadas]`.

**Escolhido:** encomendar ao `quant-architect` a **proposta de fronteiras com custo de migração
medido**, em vez de partir agora ou de manter com gatilho. Razão que estava no menu:
*"decidir com proposta na mão custa menos que decidir no escuro"*.

**Recusadas:** *manter um contexto com gatilho declarado* (*"cada módulo novo torna a partição mais
cara, e o `import-linter` já aponta para `src.modules.sentimento`"*); *partir agora, antes do
scaffold* (*"o momento mais barato possível, mas atrasa `5.13`–`5.17` e mexe em 130 módulos com 8
fases de task já `done` em cima deles"*).

**A hipótese que o estudo testa NÃO é invenção de agente:** `docs/arquitetura-fluxos.md:48-56` já
desenha **três** subgrafos dentro de `BACK` como contextos separados — `ingestion`, `catalog`
(`series_catalog`) e `registry` (`ingest_run`/`ingest_gap`/`run_registry`). O estudo mede se o
**grafo de import real** sustenta ou contradiz essa fronteira, por `grimp`/`import-linter`, não por
regex.

**⛔ O estudo NÃO decide.** Destino: `docs/context/plataforma-dados/gates/estudo-particao-sentimento-2026-09-03.md`.
A partição continua sendo ato do owner, e ela **não bloqueia** `5.13`–`5.17`.

### ✅ 2026-09-03 — como o vocabulário vira 7, e quem julga `infra`

`[DECISÃO-OWNER: 2026-09-03, escolha entre alternativas apresentadas]` nas duas.

**(1) O ato acontece pela `T-09.4`/`CST-86`, ANTECIPADA — nenhum item de plano novo.** O `/architect`
mediu que o item **já existia e estava aberto**: item `9.6` da fase `09` (*"Decisão sobre o componente
`infra` registrada — adotada ou recusada, com o motivo escrito"*, `ADR-009/D5`, componente `docs`),
DoD `D9.6`, task `T-09.4`/`CST-86`, `status = "todo"`
`[MEDIDO 2026-09-03: grep -n -A6 '^id = "T-09.4"' tasks.toml]`.

**Custo aceito, na redação do menu:** *"ela vive na fase `09`, que depende de `04`/`06`/`07`/`08`,
então roda fora da ordem de fase — antecipação explícita, não acidente"*.

**Recusada, e o motivo é o que importa:** *task na fase `01` junto do `A6`* — criaria **segunda
verdade** sobre `infra`, com a `T-09.4` continuando `todo` a dizer que a decisão precisa ser
registrada **depois** de registrada em outro lugar.

**(2) O juiz de `infra` é um agent NOVO: `infra-architect`.** Universo medido: `ls .claude/agents/`
→ **2 agents** (`quant-architect.md`, `ui-designer.md`), e **nenhum dos 12 do `anything` é de infra**
`[MEDIDO 2026-09-03]`.

**Custo aceito:** *"é **criação, não porte** — o agent nasce aqui e sem precedente medido"*.

**Recusadas:** *acumular no `quant-architect`* (*"ele não é dono de TLS, `compose` nem fila — é o
custo aceito realizado na pessoa errada"*); *declarar `infra` sem `architect`* (*"componente sem dono
de julgamento, `ADR-003:11-13`; e é a omissão de hoje com uma camada extra de silêncio"*, falsificador
`F-D6-6`); *owner por documento como o `design_gate`* (*"honesto, mas `checa_ponteiro` exige que o
caminho exista"*).

**⛔ A ORDEM ENTRE AS DUAS NÃO É PREFERÊNCIA:** `V-16` **reprova componente fora do enum**
(`lib/policy.py:539-543`) ⇒ **`components` de 6 para 7 primeiro, o juiz depois.** Inverter faz o
validador reprovar a política no meio do caminho.

### `ADR-009/D5` — FECHADA por identidade, e o que sobra dela NÃO era pergunta de vocabulário

`D5` perguntava *"o componente `infra` é adotado?"* e **propôs esse nome exato** ⇒ **ADOTADO**, e a
escolha do rótulo a fecha. Registrado em `ADR-009` §`D6.5` (append, `D1`–`D5` intocados), com a
instrução que **caduca** (camada consumidora) e a que **continua** (deploy/backup/topologia), mais
`F-D6-5` e `F-D6-6` — os falsificadores novos, porque o da proposta perdeu objeto.

**⏸ O QUE SOBRA, e é lacuna nova com dono:** **`deploy/` está fora de TODA regra** —
`code_paths.include_prefixes` tem **3** entradas e `ls -d deploy` → **inexistente**
`[MEDIDO 2026-09-03]`. **Rótulo não é cobertura**: `infra` no enum não faz `deploy/` ser medido por
nada. Falta **item de fase**, do mesmo jeito que `T-01.2` fez por `frontend/src/`. **Não decidida
aqui**, e não bloqueia `5.13`–`5.17`.

### ✅ 2026-09-03 — partição de `sentimento`: **NÃO PARTIR**, com três gatilhos declarados

`[DECISÃO-OWNER: 2026-09-03, escolha entre alternativas apresentadas]`, tomada **com o estudo na mão**
(`docs/context/plataforma-dados/gates/estudo-particao-sentimento-2026-09-03.md`, 858 linhas, 51
`[MEDIDO]`) — que é o que a decisão anterior de encomendar o estudo existia para permitir.

**O que o estudo mediu, e é o que sustenta a escolha:** `sentimento` é **ilha fechada** (0 arestas
entrando, 0 saindo), **DAG, 0 ciclos, profundidade 6, fan-in máximo 10, 207 arestas / 127 módulos**.
**Nenhuma partição abaixo de 10 contextos põe o maior sob os 50 módulos do `messages`** — `A` (3
contextos) deixa o maior com **104** e `B` (5) com **85**. ⇒ **partir reduz governança, não tamanho.**

**Custo aceito, na redação do menu:** *"a invariante do CVD segue sem portão"*.

**Recusadas, com o custo medido:** **A** (3 contextos, **0** aresta cruzando — a única limpa por
grafo — mas 23 módulos movidos / 102 imports / 42 arquivos, e o maior ainda com 104); **B** (5
contextos, maior 85, mas **39 arestas cruzando**, 42 módulos / 236 imports / 131 arquivos, e **+4**
nomes no vocabulário fechado, **cada um precisando de juiz**); **decidir depois do scaffold** (*"é
exatamente o gatilho `G3` disparando — a migração passa a ter a camada de API injetando dos módulos,
o cenário mais caro"*).

**⚠️ E a hipótese do diagrama foi CONTRADITA como topologia:** `arquitetura-fluxos.md:48-56` desenha
`ingestion`/`catalog`/`registry` com **0** aresta entre si; o grafo real tem **33**. Como três irmãos,
**32 cruzam e os 3 pares são mutuamente cíclicos**. Como **pilha de 3 níveis**, **0 ciclos e 0
subindo** — `catalog` e `registry` são **núcleo compartilhado ABAIXO** de `ingestion`, não vizinhos.
O desenho não é fronteira de contexto; é nome de camada.

**⛔ OS TRÊS GATILHOS — a decisão é revogável por eles, não por opinião:**

| # | gatilho | valor hoje |
|---|---|---|
| `G1` | surgir componente fortemente conexo (`SCC > 1`) no grafo | **0 ciclos** |
| `G2` | fan-in passar de **15** | **10** |
| `G3` | **`src/api/` nascer** | **0 módulos — e esta é a janela que a fase `05` fecha** |

**`G3` dispara pela própria task de `5.13`.** Isso é declarado aqui para que a reabertura, quando
vier, seja lida como **o gatilho funcionando** e não como decisão mal tomada.

**O ganho que vem de qualquer forma, e não dependia de partir:** o **wildcard** nos contratos de
`import-linter` (`src.modules.*.infra`), que o estudo provou morder e calar. Ver `ADR-009` §`D6.6`.

### ✅ 2026-09-03 — a narrativa de review APROVADA: 9 tasks, as 3 divergências aceitas, escopo ampliado

`[DECISÃO-OWNER: 2026-09-03, escolha entre alternativas apresentadas]` nas três.

**(1) As 9 tasks aprovadas como o `/tech-lead` as propôs**, narrativa em
`docs/context/plataforma-dados/tasks_review-superficie-servida-2026-09-03.md` (649 linhas). Ordem:
`T-09.4` (antecipada) → `T-01.8` → `T-01.9` → `T-05.11` → `T-05.12` → `T-05.13` → `T-05.14` →
`T-05.15` → `T-05.16`.

**As 3 divergências do esboço, TODAS aceitas na recomendação dele:** `D-1` duas tasks para o `A6`
(atribuição e congelamento são atos distintos, e o arquivo dourado nasce **uma vez** sobre a
atribuição final); `D-2` o item `5.13` em duas (camada e contrato têm naturezas diferentes —
precedente medido: a fase `01` cortou igual em `T-01.1`/`T-01.5`); `D-3` o portão de tipo **antes**
do transporte (*"portão que chega depois do código é portão que negocia com o que já está escrito"*).

**(2) Escopo de escrita ampliado de 19 para 21 prefixos** — executado nesta data com autorização
explícita do owner, **e o `/tech-lead` deliberadamente NÃO o rodou sozinho** (*"fazê-lo antes da
aprovação seria materializar metade da decisão pela porta dos fundos"*):

```bash
harness pipeline scope plataforma-dados add .claude/agents   # rc=0
harness pipeline scope plataforma-dados add docs/INDEX.md    # rc=0
```

Sem eles, `T-01.8`/`T-01.9` eram recusadas **antes do primeiro byte** — `require-code` de
`.claude/agents/infra-architect.md` devolvia *"nenhuma feature autorizada reivindica o path"*
`[MEDIDO 2026-09-03]`.

**(3) O item de fase para `deploy/` foi despachado AGORA, em paralelo** — para que `F-D6-5` encontre
as duas naturezas que exige e **não dispare**. Recusadas: aceitar o disparo (*"falsificador disparado
e não consertado vira 'já estava assim'"*) e não criar o item (*"seria evidência de que `infra`
comprou ambiguidade de juiz sem cobrir nada além da camada de API — ou seja, `api` era o nome certo"*).

### Três achados do `/tech-lead` que mudaram a execução, e nenhum era conhecido antes

1. **`V-16` tem DOIS sítios.** Sonda em `scripts/tasks.sh:777-778`: `components = ["infra"]` **antes**
   do enum é **ERROR e faz o arquivo inteiro falhar** — não `WARN`. A ordem *components → juiz →
   tasks* deixa de ser disciplina e vira **quebra total** se invertida.
2. **O scaffold tem de nascer em `frontend/src/app/`.** `harness code-paths classify
   frontend/app/page.tsx` → **`nao-producao`** ⇒ App Router na raiz do pacote cairia **fora do
   universo de regra, em silêncio** — que é exatamente o argumento que `frontend/src/app/routes.ts`
   já carregava no cabeçalho.
3. **`ADR-009/F-D6-5` disparará ao fim da fase `05`** na quebra aprovada, e o `/tech-lead` **previu o
   disparo com o número em vez de deixá-lo ser descoberto**. É a lacuna do `deploy/`, não defeito da
   quebra — e o item (3) acima é o conserto.

### ✅ 2026-09-03 — a fase `01` REABERTA para `deploy/`, e um único ato cobre `A6` + `deploy/`

`[DECISÃO-OWNER: 2026-09-03, escolha entre alternativas apresentadas]`. Termos idênticos aos da `05`:
**só item novo, nada em `done` é tocado** — e a `01` tem **7 de 7 tasks `done`**.

**Por que a `01` e não outra, medido pelo `/architect`:** precedente **literal** do item `1.4`
(*"Cobertura de `frontend/` fechada, em três partes que só valem juntas"*, DoD `D1.3`/`D1.4`,
componente `docs`) — `deploy/` é o mesmo ato para outro diretório. **Não é a `05`:** fechar `deploy/`
ali contradiria o próprio `5.11` (*"vps n é problema agora, vai rodar muito local até lá"* +
`PRD-001` §12 contra construção especulativa). **Não é a `09`:** os 8 itens dela são **registro**, e
ela depende de `04`/`06`/`07`/`08` ⇒ `deploy/` ficaria fora de toda regra **o projeto inteiro**.

**⚠️ E a lacuna é MAIOR que "falta um prefixo" — isto não é sobre um diretório futuro**
`[MEDIDO 2026-09-03]`:

```bash
harness code-paths classify deploy/docker-compose.yml   # nao-producao, rc=1 (nenhum include_prefixes casa)
harness code-paths classify backend/src/config.yml      # nao-producao, rc=1 (nenhum include_globs casa)  <- HOJE
grep -hE '^(paths|target) *=' packs/*/rules.toml | sort -u
# **/*.py · backend/**/*.py · frontend/src/**   => 10 de 10 regras, 4 packs, NAO alcancam *.yml
```

⇒ **`core.hardcoded-secret` declara `paths = ["**/*.py"]`** (`packs/core/rules.toml:50`) e **não veria
uma senha num `docker-compose.yml`.**

**Três partes que só valem juntas:** (a) `include_prefixes += "deploy/"` · (b) `include_globs +=
"*.yml","*.yaml"` · (c) uma `[[rules.own]]` com corpus que alcance YAML. **Sem (c), (a)+(b) dão
`classify → producao` com ZERO mordida** — o defeito que `D1.4` existe para nomear.

**O DoD não pode ser `classify`, e a razão é vacuidade medida:** `classify` **não confere
existência** — `classify backend/src/api/routes/ingest_health.py` devolve **`producao`** para arquivo
**inexistente**. O DoD é `D1.3` verbatim: `harness rules --mode file` **BLOQUEIA nomeando a regra
(`exit=2`) sobre arquivo que existe**, e cala (`exit=0`) sobre arquivo legítimo.

**`F-D6-5` foi RE-MIRADO, não afrouxado:** o relógio *"ao fim da fase `05`"* media o escopo da fase e
não a largura do rótulo — `grep -niE 'deploy|vps|compose|systemd|TLS'` nas **8** fases fora da `05` →
**0 linhas**, logo nenhuma segunda natureza **podia** aparecer ali. Novo marco: o fechamento de
`9.6`/`T-09.4`, e é **mais duro**. Mover o relógio **sem** especificar o item teria sido lavar o
falsificador.

### 📌 ESTADO EM QUE ESTE DIA TERMINA — `tasks.toml` VERMELHO, e o vermelho é PREVISTO

**8 tasks criadas** (`T-01.8`/`CST-100`, `T-01.9`/`CST-101`, `T-05.11`–`T-05.16`/`CST-102`–`CST-107`)
e **`T-09.4`/`CST-86` atualizada, não duplicada**. **Zero task `done` reaberta** — 64 antes, 64
depois.

```
harness tasks validate plataforma-dados
# FALHOU: 2 ERROR, 4 WARN   (baseline: 85 tasks, 0 ERROR, 4 WARN; agora 93 tasks)
# ERROR T-05.12 V-16 componente fora do enum: infra
# ERROR T-05.13 V-16 componente fora do enum: infra
```

**Os 2 ERROR são a sonda de `V-16` do `/tech-lead` realizada no arquivo real, e o ÚNICO ato que os
zera é executar `T-09.4`** (enum 6→7) — **`/build` é gate de owner.** O `/tech-lead` **recusou o
contorno óbvio**: rebaixar as duas para `docs` as poria sob componente sem `architect`
(`ADR-003:11-13`) — **verde por mentir sobre quem julga**. E não tocou `harness.toml`, porque alterar
o vocabulário fechado é ato do owner.

**Não gateia `make verify` nem o `pre-push`** `[MEDIDO]` — mas todo agente que validar verá `FALHOU`
até lá.
