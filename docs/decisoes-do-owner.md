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
| **Q11** | owner marca o corpus? quantas horas | `ABERTA` | NÃO |
| **Q12** | `MATIC→POL` / `RNDR→RENDER` | `ABERTA` | NÃO |
| **Q13** | cor do candle | **`RESPONDIDA`** | NÃO — ver §Q13 (reconciliada com `SPEC-001:649` em 2026-08-28) |
| **Q14** | idioma da UI | `INFERÍVEL` | NÃO |
| **Q15** | ToS dos fornecedores | `ABERTA` | NÃO por si |
| **Q16** | dono de `charts`/`web` + regra em `frontend/` | **`RESPONDIDA`** 2026-08-28 | NÃO (de dado) — o relógio de retrabalho **parou** |
| **Q17** | spread: medir ou assumir | **`RESPONDIDA COM RESÍDUO`** | **SIM — capture-or-lose** |
| **Q18** | profundidade do backfill de `metrics` | `ABERTA` | NÃO |
| **Q19** | `availability_probe_set` | `ABERTA` | **SIM** |
| **Q20** | SMC, pivôs+Fibonacci, ou os dois | **`ABERTA` (nova em R2)** | NÃO |

**Contagem: 20 · 10 `ABERTA` · 3 `INFERÍVEL` · 4 `RESPONDIDA` · 2 `RESPONDIDA COM RESÍDUO` · 1 `MORTA`.**
*(Atualizada em 2026-09-01: `Q1` respondida pelo owner — 8 tasks destravadas nas fases 02/03 de `plataforma-dados`. Atualizada em 2026-08-28: `Q16` respondida pelo owner; `Q13` reconciliada contra `SPEC-001:649`, que já a registrava `RESPONDIDA` desde 2026-08-25 — a divergência era deste arquivo.)*
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

### Q19 · `ABERTA` · `availability_probe_set`: quais símbolos e endpoints ganham `available_at` OBSERVED?

**(a)** Declare o conjunto: símbolos, endpoints, período e resolução.

**(b) Medido:** no universo inteiro é **aritmeticamente impossível**. `/futures/data/*` tem balde **próprio** de **1000 req/5 min = 200 req/min** `[DOC]`. Um probe de **5 endpoints × S símbolos a cada 10 s** custa `30·S` chamadas/min ⇒ **cabem 6 símbolos**; a **30 s**, **20 símbolos**; a **60 s** a resolução é **mais grossa que a própria dispersão medida da defasagem** (99,6–200,8 s) ⇒ **custa cota e não informa**.

**⭐ R2 amplia o conjunto candidato, por razão de mecanismo, não de zelo:** os **endpoints da Coinalyze têm de entrar**. Provar que `bv` é volume de compra agressora **resolveu dois dos três termos** do predicado de quarentena (`unit`, `label_shift`) e **não resolveu o terceiro** (`available_at IS NULL`) — **é ele que mantém a Coinalyze fisicamente isolada de toda leitura de `backtest`**, e medir a defasagem dela é o único jeito de sair dessa condição. **Restrição a declarar junto: o balde dela é 40 chamadas/min E é CEGO** (zero header de cota no `200`) ⇒ o probe consome de um orçamento que **não se audita pela resposta**.

**(c) Trava:** só o probe de F0. **Decide quais séries têm defasagem real PARA SEMPRE** — latência de campo **não é derivável retroativamente**, e o que ficar fora é **MODELED permanentemente para o período em que ficou fora**.

**(d) RELÓGIO: SIM.** O que não se recupera é a medição do período em que o símbolo ficou fora.

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

### Q11 · `ABERTA` · O owner vai marcar o corpus de fixtures à mão? Quantas horas por semana?

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

### Q20 · **`ABERTA` — NOVA em R2** · A fase de estratégia detecta SMC, detecta pivôs + Fibonacci, ou os dois?

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
