# Handoff `/pm` → `/architect` — `plataforma-dados`

**Data:** 2026-08-25 · **Revisão R2 — terceira e ÚLTIMA emissão antes de escalar (ciclo 3 de 3)** · **PRD:** [`docs/specs/PRD-001-plataforma-dados.md`](../../specs/PRD-001-plataforma-dados.md)
**Estado do ledger:** **`PRD_DRAFT`, inalterado por R1 e por R2** (nenhum `advance`, nenhum `approve`, nada no Jira). O `advance INIT → PRD_DRAFT` foi registrado na rodada original, em 2026-08-25T11:39:33Z.
**Veredito do gate de PM:** **NÃO BLOQUEADO.** Não há `feedback_to_pm.md` — nada trava a produção da spec.

---

## ⭐ R2 em cinco linhas, se você só ler isto

1. **A dívida de §0.1 está QUITADA.** `docs/medicao-coinalyze.md` está **absorvido** no PRD — não mais anotado como dívida. **Q4 respondida.** O mapa `mudança → onde foi aplicada` é **PRD §0.3**, e ele **separa o que mudou de FASE (7 itens, `E-01`..`E-07`) do que mudou de CITAÇÃO (8 itens, `C-1`..`C-8`)**, porque foi essa distinção que exigiu uma rodada inteira.
2. **Chegou um insumo NOVO que R1 não conhecia:** [`docs/direcionamento-operacional.md`](../../direcionamento-operacional.md) — **intenção declarada do owner**, rotulada `[PREMISSA-OWNER: 2026-08-25]`, **não achado de medição**. Não é HFT · prazos **15m/1h/4h** · **decisão no fechamento do bucket** · tese em três camadas (estrutura com pivôs e Fibonacci · sentimento com OI e funding · order flow com CVD) · autonomia delegada em bruto-vs-agregado, motor de banco (**+Parquet/DuckDB**) e terceiros (**+Coinglass**).
3. **A estrutura F0–F5 e as fronteiras de valor continuam INTACTAS — SEIS Epics, e há UMA contingência para um sétimo.** A verificação item por item está em **PRD §13.5**. O sétimo nasce **se `Q2` = "exposto"**, e a menção a **nuvem** tornou esse cenário mais vivo, não menos.
4. **O registro de perguntas foi CONSOLIDADO, e havia colisão de numeração real.** [`docs/decisoes-do-owner.md`](../../decisoes-do-owner.md) é agora a **FONTE ÚNICA** de número e de **estado**: **20 perguntas**, `Q4` e `Q17` **`RESPONDIDA COM RESÍDUO`**, **`Q9` MORTA com o motivo escrito**, **`Q20` nova**. O PRD §8 **classifica e referencia; não renumera.**
5. **Cinco correções que me foram passadas e com as quais eu DISCORDEI estão em PRD §0.3.3, com o argumento, aplicadas na forma que eu defendo.** A mais consequente: **`CL-4` não morre** — encolhe **~110×** e continua capture-or-lose, porque **eu medi uma opção (c) que ninguém tinha considerado**. Ver §8 deste handoff.

---

## 0. Leia isto primeiro: este handoff é a **terceira** emissão — R1 respondeu a um gate reprovado, R2 quitou a dívida que R1 declarou

**Histórico das três, para você saber o que já foi validado e o que não foi:** emissão 1 (rodada original) → **gate REPROVADO** por 6 bloqueantes de domínio → emissão 2 (**R1**, a resposta a eles, que fechou declarando uma dívida) → **emissão 3 (R2, esta), que quita a dívida e absorve um insumo novo do owner.** **R2 não passou por validador ainda — é o que você vai fazer, e é o ciclo 3 de 3** (§8).

**O que aconteceu entre a primeira emissão e a segunda.** O PRD passou por **dois validadores em paralelo**:

| validador | veredito | consequência |
|---|---|---|
| **protocolo** (`harness-plugin:architect`) | **`[READY FOR SPEC]`, 0 bloqueantes** | 13 correções de forma, prazo e citação — **todas aplicadas** |
| **domínio** (`quant-architect`, apontado pela política via `[agents.by_component]` para `sentimento`) | **`DOMÍNIO OK COM CORREÇÕES`**, com **6 itens marcados "não deixe passar o gate sem eles"** | **o orquestrador reconciliou: O GATE NÃO PASSOU** |

**Os dois vereditos não se contradizem** — eles medem coisas diferentes. O de protocolo pergunta *"este documento é especificável?"* (sim). O de domínio pergunta *"o que está especificado produz o número certo?"* (não, em seis lugares). **Um PRD pode ser perfeitamente estruturado em torno de uma regra invertida**, e era.

**O que os 6 bloqueantes tinham em comum, e é a razão de eles serem gate:** nenhum deles era ambiguidade. **Todos os seis eram mecanismo ausente ou invertido em torno de lookahead e reprodutibilidade** — a exata classe de defeito que esta fase inteira existe para impedir. Um deles (**D-01**) tinha o **sinal invertido**: o documento proibia o operador `ASOF` **seguro** e, com isso, **ensinava o implementador a plantar lookahead**.

**O mapa completo `defeito → onde foi corrigido` está em PRD §0.1.** Este handoff traz só o que muda o **seu** trabalho.

**O que NÃO mudou, e é resultado e não omissão:** **a estrutura F0–F5 e as fronteiras de valor entre as fases sobreviveram inteiras.** Nenhuma fase nasceu, morreu ou trocou de lugar. **As seis unidades continuam candidatas a seis Epics em CST.** Duas fronteiras **internas** se moveram e uma fase ganhou entregas — está em §3.5 abaixo.

### 0.1 ✅ A dívida de R1 está QUITADA — e o que ela exigia mudar era, de fato, FASE

**R1 fechou dizendo: *"peça uma R2 de PM antes da tech spec se a spec de F0 ou F2 depender de qualquer linha da tabela de PRD §0.2"*. Dependia.** R2 absorveu os **dois** insumos, e o mapa está em **PRD §0.3** com `E-nn` para fase e `C-n` para citação.

**As sete mudanças de FASE, para você conferir contra a spec que vai escrever:**

| id | o que mudou | fase |
|---|---|---|
| **E-01** | **`CL-1` muda de forma:** o **agregado diário** de liquidação volta **730 dias**; capture-or-lose é a **liquidação INTRADAY** (evento, ms, cascata de segundos — **onde o gatilho da proposta vive**). **A urgência de F0 NÃO cai; o argumento muda** — e argumento errado num documento que outros implementam é defeito | **F0** |
| **E-02** | **F0 ganha 2 entregas e perde 1 non-goal.** One-shot da Coinalyze `daily` (OI **2.409 d**, liquidação **730 d**; **1.140 chamadas ≈ 28,5 min UMA VEZ**) e **reconciliação diária** do stream capturado contra o agregado. ⇒ **o non-goal *"F0 não chama Coinalyze"* foi RETIRADO** | **F0** |
| **E-03** | **`bv` É volume de compra agressora, provado** (mediana **0,0000 bp**, 150/699 buckets exatos; hipótese maker refutada a **2.584,87 bp**; cauda p99 **29,34 bp**, máx **1.955,80 bp**, **causa não diagnosticada**) ⇒ `cvd_source` ganha um quinto valor **com erro publicado por fonte**. **⚠️ E LEIA ESTA PARTE: a quarentena NÃO se abre.** O predicado tem três termos; a medição resolveu **`unit`** e **`label_shift`** e **não** resolveu **`available_at IS NULL`** ⇒ **a Coinalyze continua fisicamente isolada de toda leitura de `backtest`**. Sair de lá exige incluí-la no `availability_probe_set` (**Q19**) | **F2** |
| **E-04** | **MUDANÇA DE TIPO, e R1 não a tinha nomeado.** O OI da Coinalyze é **OHLC do bucket** (`{t,o,h,l,c}`); o da Binance é **ponto na borda direita**. A `SeriesKey` de R1 **não tinha nenhum termo que distinguisse os quatro campos** ⇒ **quatro séries com a MESMA identidade**. ⇒ `SeriesKey += reduction`, `ts_convention += OHLC_OVER_BUCKET`. **Corrigir depois é migração de IDENTIDADE, não coluna nova** | **F1/F2** |
| **E-05** | **`bar_policy = final_only` deixa de ser dedução sua e passa a ser premissa do owner.** *"A decisão ocorre no fechamento ou na consolidação de buckets"* `[PREMISSA-OWNER]` ⇒ **R-2 não é mais uma regra a discutir contra o custo de implementá-la** | **F1** |
| **E-06** | **`bookTicker` sai do escopo (não é HFT) e o número estava errado por 4,8×** — 340–420 GB/ano, não 1,76 TB. **Mas `CL-4` NÃO morre**: R2 mediu uma **opção (c)** ~110× mais barata que produz spread **medido** — ver §8/discordância 1 | **F0** (coletor contingente) |
| **E-07** | **`aggTrade` cru sai do requisito de CAPTURA — e o argumento publicado para isso estava ERRADO.** Quem dispensa capturar é **o dump ser re-baixável desde 2019-12-31**; o 98,44% dispensa **computar**. Ver §8/discordância 2 | **F0/F3** + `Q9` |

**Os dois defeitos de plataforma que são requisito seu, e um deles ficou MAIOR do que R1 supôs:** a resposta `200` da Coinalyze **não traz nenhum header de cota** ⇒ **broker cego, contagem local, conservador**. **⚠️ E eu medi que a cegueira é o CASO GERAL, não a exceção:** `/futures/data/openInterestHist` devolve `200` com **zero headers `x-mbx-*`** (só CloudFront e segurança) enquanto `/fapi/v1/depth` devolve `x-mbx-used-weight-1m`. ⇒ **dois dos três canais são cegos, e o cego que importa é o do screener** (`avaliacao:A3`, reproduzido). `CA-F0-4` — a rampa até o primeiro 429 — é a única forma de conhecer **dois** deles.

---

## 1. O que entra pronto

| item | onde | estado |
|---|---|---|
| PRD com 6 unidades de valor (F0–F5), fronteira e aceite por fase | `docs/specs/PRD-001-plataforma-dados.md` §6 | **pronto**, **~99** critérios de aceite conferíveis por comando (~80 na rodada original + 15 em R1 + **4 em R2**: `CA-F0-13`, `CA-F0-14`, `CA-F2-16`, `CA-F2-17`). **Estrutura F0–F5 e fronteiras de valor INALTERADAS em R1 e em R2 — SEIS Epics, com um sétimo contingente a `Q2` = "exposto"** (§3.4) |
| Tipos e contratos críticos (três relógios, `SeriesKey`, `nature`, procedência, as duas portas tipadas, os tipos-soma) | PRD §5 | **pronto**, nenhum `TBD` — onde o **valor** é decisão pendente, o **tipo** já está fixado para que a decisão não seja migração |
| Regras de negócio transversais (o selo, política de ausência por `nature`, os 25 anti-padrões, as 21+9 portas abertas) | PRD §7 | **pronto** |
| Classificação das decisões do owner — **20 em R2**, era 19 em R1 e 16 na original | PRD §8 **classifica** · [`docs/decisoes-do-owner.md`](../../decisoes-do-owner.md) é a **FONTE ÚNICA** de número e estado | **0 bloqueantes.** **13 `ABERTA` · 3 `INFERÍVEL` · 2 `RESPONDIDA COM RESÍDUO` (Q4, Q17) · 1 `MORTA` com o motivo escrito (Q9) · 1 nova (Q20)**. As três de R1 nasceram de **fato medido**; **Q20 nasceu de contradição entre dois documentos do owner** e é a única que eu me recusei a inferir |
| 3 `[INFERRED]` com motivo e custo de reversão | PRD §9 | **pronto** — nenhum é unknown crítico, os três revertem sem migração |
| GAPs nomeados por rodada de PM — **8 em R1**, era 6 | PRD §10 | **para o arquiteto adjudicar** — nenhum é pergunta de owner. **G7** (RTT/região do observador) e **G8** (rastreabilidade + colisão de namespace) são novos; **G2** virou pré-requisito de **F0** e **G6** virou **`CA-F0-8`** |
| **Os 6 bloqueantes de domínio, corrigidos** | PRD §0.1 + §5 | **aplicados no lugar**, com o comando de procedência onde um número mudou |
| **A dívida de R1 (medição da Coinalyze), QUITADA** | PRD §0.2 + **§0.3** | **absorvida**, com **7 mudanças de FASE (`E-01`..`E-07`)** e **8 de CITAÇÃO (`C-1`..`C-8`)** separadas de propósito |
| **O direcionamento operacional do owner, absorvido** | PRD §0.3, §5.1, §13.5, §8 | **`[PREMISSA-OWNER: 2026-08-25]`** — **rótulo novo, introduzido em R2**, porque premissa do owner **não é falsificável por medição** e um achado de medição é o contrário. Misturar as duas classes é como o *"spike de OI > 5%"* entrou na proposta |
| **As 5 correções em que este PM DISCORDOU do que lhe foi passado em R2** | PRD §0.3.3 + §9 deste handoff | aplicadas **na forma que eu defendo**, com o argumento — e uma delas (**a opção (c) de spread**) **é medição nova desta rodada** |
| **Identificadores estáveis e a contagem auditada** | PRD §18 | fecha `G8`: esquema de ID, namespace qualificado, e o **"89 achados" que não reconcilia** (89 por classe de verificação, 87 por veredito, 68 por inventário de rótulos) |
| Non-goals | PRD §12 | **pronto**, com o motivo medido de cada superfície adiada |
| Priorização | PRD §15 | **pronto**, com a tensão F1↔F3 exposta em vez de dissolvida |

**Histórias: não existem, de propósito.** O owner pediu épicos por fase de entrega para esta rodada; as histórias saem do **seu** refinamento. Cada F é uma unidade com fronteira e aceite próprios exatamente para virar um Epic em CST — **e nada foi criado, editado ou comentado no tracker.**

---

## 2. O que você precisa saber antes de ler o resto

### 2.1 Este PRD nasce aqui, e a fonte de verdade é local

`harness policy --key docs.external_prd_repo` está **vazio**. Não é referência nem extração de fonte externa. O dashboard do harness imprime, no estado `INIT`, um texto genérico sobre "ingerir PRD externo" — **ignore-o, a política manda.**

### 2.2 O discovery já aconteceu, e é grande: três rodadas, 33 agentes

Leia na ordem, e note que **o mais recente manda**:

1. `docs/plataforma-superficies-e-faseamento.md` — superfícies S1–S5, as 4 decisões de tela, o sistema de honestidade do dado, e a ordem F0–F5 consolidada. **É o documento que manda.**
2. `docs/recorte-plataforma.md` — o contrato de dados (4 definições, todas `SOLIDA_COM_CORRECOES`), o recorte 68/21, §4 as portas abertas, §5 o que o `/pm` recebe.
3. `docs/decisoes-do-owner.md` — as 16, já consolidadas e deduplicadas, com a medição ao lado. **As três de R1 (Q17, Q18, Q19) vivem só no PRD §8** — este PM não editou o documento de decisões, que é artefato de outra rodada.
4. `docs/avaliacao-discovery.md` — os achados; **e o §Anexo é a origem de 4 dos 6 GAPs originais**, porque levantou dimensões que nenhuma fase absorveu. **Cuidado com duas coisas ao citá-lo (PRD §18):** o total **"89" não reconcilia** (89 por classe de verificação, 87 por veredito, 68 por inventário de rótulos) e **`A3` colide** com o `A3` do documento de superfícies, que significa outra coisa. **Cite sempre qualificado: `avaliacao:A3` ou `faseamento:A3`.**

**Nada disso é opinião não medida.** Quatro desenhos de superfície passaram por validação adversarial e **os quatro voltaram `SUSTENTADO_COM_CORRECOES` — nenhum passou intacto**. Catorze desenhos específicos foram **derrubados por medição** e estão registrados como derrubados, não como acordo (PRD §11).

### 2.3 A coisa mais importante deste handoff: **QUATRO** fatos capture-or-lose reordenam tudo

Eram três. **R1 acrescentou um quarto, medido, e ele é o mais caro se o owner responder "medir".** F0 existe por causa deles, e é por isso que a ordem técnica (`contrato → semântica → aquisição → superfície`) foi invertida na ponta.

- **CL-1 · Liquidação da Binance é stream-only.** Não existe `liquidation*` em `data.binance.vision`. O arquivo de captura local tem **0 bytes** hoje. **Histórico anterior ao dia em que o coletor ligar é inexistente por fonte nenhuma — e nem pagando volta.**
- **CL-2 · Coinalyze apaga diariamente:** ~24 h de série de 1 min. `[DOC-ONLY]`, e o rótulo importa: pode ser teto de resposta, não retenção.
- **CL-3 · Snapshot de `exchangeInfo` tem zero dias capturados** *(atualizado)*, e `deliveryDate` mostra `ICXUSDT`/`STORJUSDT`/`SCRTUSDT` **TRADING com delisting em 2026-08-26**. **Prazo, dito como prazo: "amanhã, 09:00 UTC", não uma data solta** — é isso que o snapshot tem de atravessar para provar que serve. **Nota factual:** o owner **capturou manualmente** o snapshot de hoje (`data/snapshots/2026-08-25_exchangeInfo.json` + `_fundingInfo.json`, `serverTime 2026-08-25T11:52:40Z`, **877 símbolos / 570 `PERPETUAL`+`TRADING`**, os três símbolos preservados). **Foi captura manual única, NÃO o coletor de F0 — Q1 continua aberta e `CA-F0-1` continua não atendido.** Registre como **dia 1 da série**, e note o que ele já prova: a distribuição de funding é **`{4h: 433, 8h: 136, 1h: 1}`** hoje contra **`{4h: 432, 8h: 136, 1h: 2}`** três dias antes, e `TRADIFI_PERPETUAL` foi de **170 para 175**. **O universo derivou em três dias — é a prova de que o snapshot precisa ser datado e diário.**
- **CL-4 · `bookTicker` saiu do dump em 2024-03 ⇒ SPREAD é capture-or-lose desde hoje** *(novo em R1, **números e opções REESCRITOS em R2**)*. Medido: `daily/bookTicker/BTCUSDT/` → **200 em 2024-03-25, 404 em 2024-03-31** e em toda data posterior; `monthly/` → **200 em 2024-04, 404 em 2024-06**. `bookDepth` continua publicado **mas não tem bid/ask** (colunas `timestamp,percentage,depth,notional`) ⇒ **ele serve slippage por profundidade e NÃO serve spread**. **Um backtest sem slippage é fantasia, e o insumo de spread para o período que este produto vai cobrir não existe em fonte nenhuma a partir de hoje.**
  **R2 corrige um número e acrescenta uma opção. São TRÊS:** **(a)** `bookTicker` ao vivo = **340–420 GB/ano a 20 símbolos** — **o 1,76 TB/ano de R1 está DERRUBADO, errado por 4,8×** (multiplicava o símbolo mais pesado por 20; medido por `HEAD` em 8 símbolos dá 0,713 GB/dia para os 8 maiores) · **(b)** premissa de spread **declarada** · **(c) NOVA, medida por mim nesta rodada:** `GET /fapi/v1/depth?limit=5` a 1/min → **peso 2/chamada** (`x-mbx-used-weight-1m` observado subir de 0 para 2), **295 B de corpo** ⇒ 20 símbolos = **1,67% do `REQUEST_WEIGHT`** e **~3,1 GB/ano**, **~110× mais barato que (a)**, produzindo spread **medido** em vez de assumido.
  **O direcionamento operacional (*"não é HFT, sem leitura de milissegundo no livro"*) elimina (a).** **⚠️ E NÃO elimina CL-4** — em (b) e em (c) o spread de hoje só existe se for capturado ou declarado hoje. **É Q17, o resíduo é (b) ou (c), e é decisão do owner. O PRD apresenta os três números e para.** Ver §8/discordância 1.

**O argumento que sustenta a inversão:** gravar payload bruto imutável com `received_at` **não exige** o contrato temporal correto. **Reprocessar é barato (0,86 s/arquivo, n=11 medido); recapturar é impossível.**

**⚠️ Correção R1 ao ALCANCE dessa frase, e ela muda a sua leitura de F0:** *"recapturar é impossível"* vale para **CL-1..CL-4**, para o **`available_at` OBSERVED** e para o **átomo de `interestRate` datado**. **NÃO vale para o dump `metrics`** — a premissa de §1 (*"nenhuma fonte gratuita tem histórico intraday profundo de OI"*) **era falsa**: o dump tem **2.183 dias, grade 5 min, 570/570**. Consequência prática para a spec: **`CA-F0-5` escopava o ETL em "570 × 30 dias" de um arquivo de 2.183 dias, e o `30` era a janela do REST** aplicada por inércia. **F0 não pode chamar esse backfill de capture-or-lose**, e a profundidade passa a ser escolha explícita (**Q18**: 4,1 h contra 297 h sequenciais).

### 2.4 A Coinalyze está MEDIDA — e continua em quarentena, por um termo específico

**Isto substitui a seção de R1, que dizia *"toda a Coinalyze é `[DOC-ONLY]`, zero endpoints chamados, não há API key"*. Está tudo falsificado:** 11 endpoints chamados, todos `200`, chave real (plano free, `.env`, perms 600, no `.gitignore` desde o primeiro commit).

**⚠️ E aqui está a parte que mais importa para você, porque a leitura otimista é errada: a quarentena NÃO se abre.** O predicado tem três termos, e a medição resolveu **dois**:

| termo | estado | por quê |
|---|---|---|
| `unit IS NULL` | **RESOLVIDO** | o catálogo **declara** `oi_lq_vol_denominated_in` — **744 `BASE_ASSET` / 20 `QUOTE_ASSET`** nos 764 perpétuos `[MEDIDO]` |
| `label_shift IS NULL` | **RESOLÚVEL, e para `bv` já resolvido** | `2·bv − v` bate o delta do dump a **2,6e-14 BTC** de mediana, 150/699 buckets exatos |
| **`available_at IS NULL`** | **NÃO RESOLVIDO** | **nenhuma medição de defasagem de publicação da Coinalyze foi feita** — a resposta `200` não traz nem header de cota, muito menos carimbo de disponibilidade |

⇒ **a Coinalyze continua fisicamente isolada de toda leitura de `backtest`, apesar de `bv` estar provado.** **Um mecanismo de três termos que se abre quando dois passam não é um mecanismo de três termos** — e a saída é `Q19` (incluir endpoints dela no `availability_probe_set`), não F2.

**A `janela_de_perda` dela deixa de ser constante e passa a ser FÓRMULA:** `pontos_de_retenção × intervalo`, por série — OI 1 min **~1,5 d**, OI 5 min **~7,0 d**, OHLCV 1 min **1,0 d**, liquidação 1 min **~8 d** (**esparsa**), `daily` **sem apagamento por doc**. O *"~24 h a 1 min"* de R1 está **derrubado**. A gaveta continua dizendo **`fonte não verificada`, nunca `ok`** — e agora **por um motivo nomeado**, em vez de por ausência de medição.

**E o que a medição NÃO mediu, porque rótulo novo não é licença para generalizar:** a **causa da cauda do `bv`** (p99 29,34 bp, máx 1.955,80 bp) · o **limite real de cota** (nenhum `429` provocado) · retenção de `funding-rate-history` e `long-short-ratio-history` · **se `daily` realmente nunca é apagado** (`[DOC-ONLY]`, medido uma vez) · a **divergência numérica de OI Coinalyze × Binance** (E-04 explica por que exige escolher `reduction` primeiro) · e **a defasagem dela**, que é o termo que a mantém na gaveta.

### 2.5 Não use `harness doctor` CONFORME como evidência

O pack `core` são **4 regras bloqueantes em vigor** de higiene de Python (`harness rules list --severity block`) e **não enxerga `frontend/`** — que é exatamente onde todo o sistema de honestidade do dado desta especificação vai morar. O PRD não cita `doctor` como qualidade em lugar nenhum, e o handoff pede o mesmo de você.

**R1 mediu isso por comportamento, e a medição derruba a solução mais óbvia.** Escrevi `frontend/src/Probe.tsx` violando duas regras **por construção** (`const x: any = 1;` e `console.log(x)`) e rodei `harness rules --mode file --path frontend/src/Probe.tsx` → **saída VAZIA, zero regras avaliadas**, porque as regras de `web-fullstack` têm **`scope = "code"`** e o classificador **não considera `frontend/` código**. ⇒ **adotar um pack sozinho não resolve nada**; o fecho tem **duas partes obrigatórias** (`CA-F5-4`, reescrito para ser falsificável): prefixo + globs TS/TSX **e** um pack cujos `paths` casem o layout.

**E `grep` não é aprovação** (anti-padrão 25): **R-1 e R-2** se verificam por fixture envenenada com resultado bit-idêntico.

---

## 3. As decisões de arquitetura que este PRD deixa explicitamente para você

Estão em PRD §13. **A3 da primeira emissão está FECHADA — eu a fiz. A4 é nova, e nasceu de fechá-la.**

**A1 · O registro cru de F0 é browser ou CLI?** O `faseamento` declara componente `sentimento` para F0 e no mesmo parágrafo descreve o registro como "tabela crua, ordenável por clique" — **e clique é browser**. Se for browser, `web` entra em F0 e o prazo de **Q16** (dono de `charts`/`web` + regra em `frontend/`) é **antes de F0**. O PM acha (a) — relatório de texto/CLI sobre as tabelas persistidas — mais barato e suficiente, porque a fila de 14 h precisa de **observabilidade**, não de ordenação por clique. **Julgamento de arquitetura, não medição. É seu.**

**A2 · F5 não pode ser inteira a última fase.** Dois itens dela vencem antes: a decisão de cobertura de `frontend/` (antes do primeiro `.tsx`) e `[test_cmd]` (junto com o primeiro teste) — **porque todas as condições de pronto de F0 e F1 são testes, e não existe runner** (`[GAP G2]`). Proposta: a parte gateante de F5 sobe para pré-requisito de F1; a consolidação de ADRs fica onde está.

**A3 · FECHADA — a verificação urgente foi feita, e o resultado desbloqueia F0.** Existe **`!forceOrder@arr`** (*All Market Liquidation Order Streams*, update speed 1000 ms `[DOC]`). ⇒ **`Q5` (universo) NÃO trava nada em F0**, e saiu da coluna `trava o início de`. Somando ao que já estava medido (`exchangeInfo` cobre o endpoint inteiro; `premiumIndex` sem `symbol` devolve **875 símbolos por peso 10** contra `REQUEST_WEIGHT 2400/min`), **nenhum dos três coletores originais depende do universo declarado**. **Não repita esta leitura; ela está feita.**

**A4 · NOVA, e nasceu de fechar A3: a SEMÂNTICA de `!forceOrder@arr` é `[NÃO VERIFICÁVEL HOJE]`, e o que fazer sob essa incerteza é seu.** A página USDⓈ-M diz que o stream empurra o **`latest`** de cada janela de 1000 ms; **a COIN-M e o changelog dizem `largest`**. **Se for `largest`, a série é distribuição de MÁXIMOS por segundo por símbolo, não de liquidações** — e **todo percentil de tamanho calculado sobre ela estima máximo de bloco**, que é outra grandeza com o mesmo nome. **Isso é P1/P2 de §1 acontecendo de novo, na série mais irreversível do projeto.**
**Não se resolve lendo mais doc** (a doc é que se contradiz) **nem medindo hoje** (não há série de referência independente). **A proposta do PRD é gravar nome do stream + data do snapshot da doc junto do payload cru** — a única forma de pinar a semântica depois. **Uma coluna hoje; impossível retroativamente. E não adia a captura:** o payload cru é o mesmo nas duas semânticas; muda como ele se lê. **PRD §13.4 e `CA-F0-2`.**

**Duas notas de arquitetura que R1 acrescenta a A1, e nenhuma das duas é grátis:**
- **`core.print-statement` colide com o registro de CLI da saída (a) de A1**, e a colisão é medida: `harness rules --mode file --path backend/src/cli/report.py` com `print(rows)` → `{"decision": "block", ...core.print-statement...}`. **Um relatório de CLI cuja saída É o produto viola a regra na implementação ingênua**, e §14 dizia que a regra *"reforça `CA-F0-6`"* sem notar isso. **Resolução barata (registrador nomeado escrevendo em `stdout`, que é o que a mensagem da regra pede) — mas tem de ser DECIDIDA**, não descoberta no pre-push. **Isto empurra a decisão na direção de (a), não a favor dela:** em (b) a regra simplesmente não morde, porque `frontend/` não é código para o classificador.
- **O registro de F0 lê das tabelas persistidas por uma CONSULTA NOMEADA E COMPARTILHADA — a mesma que S1 usará em F3.** Sem isso, **F3 reimplementa o mesmo registro** e passam a existir **duas implementações da mesma verdade**, que divergem no primeiro `verdict` novo. Vale em (a) e em (b).

**A5 · NOVA em R2: o motor de armazenamento tem TRÊS candidatos, e o terceiro veio do owner.** **Parquet/DuckDB** `[PREMISSA-OWNER: 2026-08-25]`. **Ele se encaixa na tese declarada por quatro razões que vêm do próprio direcionamento** — dado **em bucket** (a decisão ocorre no fechamento), **append-only**, leitura de backtest **pesada e sequencial**, e **custo de nuvem** proporcional a objeto frio e não a servidor de pé — **mais uma que vem do PRD e não do owner: o DuckDB tem `ASOF JOIN` nativo**, o que importa por causa de **D-01** (o operador seguro é `>=`, mais recente **no passado**; um motor que oferece a primitiva reduz a superfície onde a inversão pode voltar). **E a aritmética de PRD §7.4 aponta na mesma direção: ~87 GB para o histórico inteiro em bucket, do universo inteiro, UMA VEZ** — volume que não exige servidor de série temporal para leitura sequencial.
**⚠️ Não decida por gravidade: nenhum dos TRÊS foi instalado nem medido.** *"A ordem de preferência mudou com a tese"* é **declaração de preferência**, não resultado. **O falsificador que eu nomeio para o candidato novo, porque é onde ele é mais frágil: atualização de linha e unicidade.** O contrato é append-only e bitemporal, o que favorece Parquet — **mas `CA-F3-12` proíbe que backfill MODELADO sobrescreva captura OBSERVADA e `CA-F4-25` exige RECUSAR sob divergência de `knowledge_time`**, e as duas exigem **ler o que já está lá**. Num store de arquivos isso é responsabilidade da aplicação, não do motor. **Quem propuser Parquet/DuckDB tem de dizer onde vive essa lógica.**

**A6 · NOVA em R2: `Q20` decide o que a fase SEGUINTE detecta, e há uma decisão de arquitetura HOJE que não espera a resposta.** A `proposta-discovery` §Módulo B nomeia **SMC** (OB, FVG, BSL/SSL, BOS/CHoCH); o direcionamento nomeia **pivôs, Fibonacci e volume** e **não menciona SMC**. **Eu me recusei a inferir** (nenhuma direção tem custo de reversão baixo — é o teste de PRD §9 e ela reprova).
**O que É decisão sua hoje, e ela é barata:** os dois vocabulários se apoiam no **mesmo primitivo** — **pivô é definição de swing · âncora de Fibonacci é par de swings · BOS/CHoCH é rompimento de swing · BSL/SSL é extremo de swing** — e **fixada a definição de swing, os níveis de Fibonacci são aritmética pura, sem parâmetro novo**. ⇒ **o primeiro primitivo de `<Anotacao>` é `swing_point`, não `zone`**, e **a primeira tranche de horas de marcação de `Q11` é swing** — o único trabalho de marcação que **sobrevive a qualquer resposta de `Q20`** e portanto **não é desperdiçado em nenhum cenário**. *(Me foi passado que "o corpus não se reaproveita". **Isso é verdade para um corpus de ZONAS e falso para um corpus de SWINGS** — ver §8/discordância 5.)*
**E a consequência que amarra isto a `[GAP G3]`:** a escolha de `price_source` **decide ONDE O SWING ESTÁ** — a ordenação de highs entre buckets vizinhos **inverte em 2,09%** entre mark e last, a de lows em **5,57%**, e o bucket que contém o high do dia **é diferente nas duas séries**. ⇒ `price_source` **por uso** é requisito sob **as duas** respostas de `Q20`.

E os ADRs que o PRD nomeia e não escreve: **motor de armazenamento** (TimescaleDB vs ClickHouse — nenhum instalado, nenhum medido, o contrato é portável — **e leia `CA-F4-24` com a inversão de `ASOF` já corrigida, porque o ADR de motor era exatamente onde a proibição invertida fazia dano**) · **transporte de leitura** (**`faseamento:A3`**, qualificado — não confunda com `avaliacao:A3`, que é telemetria de cota; regra já fixável: **o browser nunca recebe tick**) · **`max_staleness` por série, com o default de tela declaradamente diferente do default de `as_of`** · **`price_source` POR USO** (`[GAP G3]`, e R1 o especificou: PRD §5.5 traz a tabela `price_use → price_source`).

---

### 3.4 R2 — a estrutura F0–F5 sobrevive, e a resposta é SEIS Epics com UMA contingência

**Esta é a pergunta que o owner está esperando, e a verificação item por item está em PRD §13.5. O veredito:**

> **Seis Epics, como estava. F0–F5 na mesma ordem, com as MESMAS fronteiras de valor entre si. Nenhuma fase nasceu, morreu ou trocou de lugar em R2. Um sétimo Epic é CONTINGENTE a `Q2` = "exposto".**

**O que mudou foi DENTRO das fases:** F0 ganhou **2 entregas + 2 critérios**, teve **`CA-F0-12` reescrito** e **1 non-goal retirado**, e ganha **1 coletor contingente** se `Q17` = (c) · F1 ganhou **termo de tipo** (`reduction`) e teve **R-2 promovida a premissa do owner** · F2 ganhou **2 critérios** · F3 teve **`CA-F3-9` e `CA-F3-10` reescritos** (broker cego, agregação nossa, janela como fórmula) · F4 ganhou **um terceiro candidato de motor** · F5 não mudou.

**Verifiquei cada mudança contra a possibilidade de criar fase, porque a pergunta merece a verificação e não só a conclusão:** `CL-1` mudar de forma **altera o argumento de F0, não o propósito** · o `bv` provado **acrescenta linha de catálogo em F2** · a inversão de profundidade em `daily` **é backfill de fonte, que é F3** (com o one-shot antecipado a F0 por custar 28,5 min) · o OI como OHLC **é termo de tipo em F1/F2** · Parquet/DuckDB **é candidato dentro de um ADR que já existia** · os prazos 15m/1h/4h **restringem escolhas dentro de F1 e F4** · `Q20` **decide a fase SEGUINTE**.

**⚠️ A contingência, e ela ficou MAIS provável em R2, não menos.** O direcionamento fala de **"custos de armazenamento e processamento em NUVEM"**, e `Q2` estava registrada com a premissa *"host alimentado e conectado 24/7, single-user, **não exposto**"*. **Nuvem e não-exposto são compatíveis** (uma VM sem porta pública é as duas coisas) — o que a menção faz é tornar **"exposto" um cenário vivo**. Se `Q2` = exposto, **auth/TLS/multi-sessão entra como FASE NOVA, não como retrofit** (em não-exposto a tela de login é **código morto com superfície de ataque**; em exposto é **estrutura**) ⇒ **7 Epics.** O PRD **não desenha as duas**, por declaração.

**E duas consequências de nuvem que valem sob QUALQUER resposta de `Q2`, porque são de schema e a janela fecha em F0:** **(i)** `observer_id` + `observer_region` como **colunas** ao lado de todo `available_at` (`CA-F0-10`, `[GAP G7]`); **(ii) e o que a coluna sozinha NÃO resolve, novo em R2: a tabela de defasagem é chaveada por `(endpoint, observer_region)`, não por `endpoint`.** `lag_stat`, `lag_n`, `lag_resolution_s`, `lag_window` descrevem **um observador**; mudar de região **invalida a calibração MODELED** para a região nova, e carimbo MODELED mal calibrado é **otimista em silêncio** — a direção exata que §5.1 proíbe. *(Evidência colateral medida em R2: o `curl` a `/futures/data/*` voltou com `x-amz-cf-pop: GRU1` — borda de São Paulo. **O caminho de rede do observador é visível na própria resposta.**)*

---

### 3.5 O que R1 mudou na estrutura — leia antes de fatiar os Epics

**Nada mudou no nível que vira Epic.** F0–F5 continuam seis, na mesma ordem, com as mesmas fronteiras de valor entre si. O que mudou:

| mudança | classe | efeito no Jira |
|---|---|---|
| **F0 ganhou 2 entregas** (probe de disponibilidade contínuo; snapshot com as duas testemunhas do universo) e **5 critérios** (`CA-F0-8` a `CA-F0-12`, mais `CA-F0-1b`) | **dentro** de F0 | **Epic F0 fica maior. Não vira Epic novo** — o propósito é o mesmo: capturar o que não se recaptura |
| **a parte gateante de F5 passa a preceder F0**, não F1 | fronteira **interna**, já proposta em §13.2 | **é dependência entre Epics**, não Epic novo. `[test_cmd]` vence antes de F0 porque **`CA-F0-3`, `CA-F0-4` e `CA-F0-5` são testes** |
| **`clock_skew` sai de F3 e nasce em F0** (`CA-F3-13` → `CA-F0-8`, com F3 mantendo só a **calibração**) | um critério troca de Epic | move **um** item de aceite de F3 para F0 |
| **`web` entra na linha de componentes de F1** | rótulo de componente | a S2-mínima é página Next.js; §13.1 já raciocinava assim e F1 declarava só `charts` |
| **`G2` → pré-requisito de F0; `G6` → `CA-F0-8`** | prazo de GAP | dependência, não escopo novo |
| **3 perguntas novas de owner (Q17, Q18, Q19)** | decisão, não trabalho | **nenhuma cria Epic.** Q17 pode **acrescentar um coletor a F0** se a resposta for (a) — e é a única das três com esse potencial |

**Conclusão para o fatiamento:** **seis Epics, como estava.** O que R1 mudou é **o tamanho de F0** e **a ordem de duas dependências**.

---

## 4. Perguntas em aberto — **20 em R2**, era 19 em R1 e 13 na original

**⚠️ Primeiro, o que mudou de PROCESSO, e importa para você não citar o registro errado.** Havia **colisão de numeração real**: R1 renumerou para 19 **só dentro do PRD** (`Q17`/`Q18`/`Q19`), e em paralelo o owner editou `docs/decisoes-do-owner.md` criando um **`Q17`** e referenciando **`Q20`** em `direcionamento-operacional.md` — **sem que `Q18` e `Q19` existissem lá**. **Sorte, não acerto: os dois `Q17` eram o mesmo item**, logo não houve conflito de significado.

**R2 consolidou: [`docs/decisoes-do-owner.md`](../../decisoes-do-owner.md) é a FONTE ÚNICA de número e de ESTADO.** O PRD §8 **classifica e referencia; não renumera.** Vocabulário de estado: `ABERTA` · `RESPONDIDA` · **`RESPONDIDA COM RESÍDUO`** (fechada por medição ou declaração, com uma decisão menor **nomeada**) · **`MORTA`** (com o motivo escrito, nunca apagada) · `INFERÍVEL`.

**As quatro mudanças de estado em R2:**

| Q | estado novo | o que resta |
|---|---|---|
| **Q4** (Coinalyze) | **`RESPONDIDA COM RESÍDUO`** | a key existe, 11 chamadas `200`. **Resíduo: manter o plano free, assinar o pago, ou descartar?** E descartar depois **não é migração** — é apagar uma gaveta isolada |
| **Q17** (spread) | **`RESPONDIDA COM RESÍDUO`** | *"não é HFT"* elimina **(a)** `bookTicker`. **Resíduo: (b) assumir ou (c) medir a 1/min por 1,67% do balde?** |
| **Q9** (retenção de tick) | **`MORTA`, com o motivo escrito** | **morta por aritmética**: ~87 GB **uma vez** para o histórico inteiro em bucket. **O resíduo MIGROU para `Q20`** — `aggTrade` cru só volta se a fase seguinte introduzir absorção por tamanho de trade, sweep intrabarra ou avaliação sub-minuto |
| **Q20** (SMC × pivôs+Fibonacci) | **`ABERTA`, NOVA** | **a única das 20 que eu me recusei a inferir.** Ver A6 |

A tabela completa está em PRD §8, com a coluna que mais importa: **o requisito que torna a resposta tardia barata**. O resumo por urgência:

**Travam o início de F0 (e só o início — não a spec):**
- **Q1 · autoriza ligar os coletores hoje (4 em R1, com o probe).** **É autorização, não incógnita** — o desenho está completo, e **R1 o completou mais** (A3 fechada). **É o único item deste PRD cujo custo de atraso não tem mitigação de engenharia.** **E R1 AUMENTOU esse custo além do que o PRD contabilizava:** além de ~1 dia/dia de série e da liquidação que nem pagando volta, perde-se **(a)** o `available_at` **OBSERVED das séries que a plataforma existe para servir** — latência de campo **não é derivável retroativamente** — **(b)** o **átomo de `interestRate` datado**, e **(c)**, se Q17 for (a), **spread**.
- **Q2 · onde roda e quem acessa.** **Premissa REESCRITA em R1: "host alimentado e conectado 24/7, single-user, não exposto".** A formulação antiga — *"localhost single-user"* — **se falsificava duas linhas depois no próprio PRD** (*"um laptop que dorme perde exatamente o que dormiu"*): **"localhost" não diz nada sobre alimentação nem uptime**, que é precisamente o que F0 precisa. **As três propriedades são independentes e a premissa nomeia as três.** Se a resposta for "exposto", auth entra como **fase nova**, não como retrofit. **Trate como premissa a confirmar, não decisão tomada.**
- **⚠️ E o gate de F0 agora é declarado POR COLETOR, não por fase** (correção R1). O **snapshot diário de `exchangeInfo` NÃO precisa de host 24/7** — é um `GET` mais `gzip`, e um `cron` num host que dorme perde no máximo o dia em que dormiu. Dizer *"sem Q2, F0 não começa"* **bloqueava a captura mais barata e de prazo mais curto por uma decisão de que ela não precisa**. A tabela por coletor está em PRD §6/F0.

**As três novas de R1 — e as três nasceram de fato medido, não de pergunta:**
- **Q17 · spread — `RESPONDIDA COM RESÍDUO` em R2.** `bookTicker` **404 no dump desde 2024-03**. **Números corrigidos: (a) 340–420 GB/ano, não 1,76 TB** (erro de 4,8×). *"Não é HFT"* elimina (a). **Resíduo: (b) premissa declarada ou (c) `/fapi/v1/depth?limit=5` a 1/min — peso 2/chamada, 1,67% do `REQUEST_WEIGHT`, ~3,1 GB/ano, ~110× mais barato que (a)** `[MEDIDO em R2]`. **Continua capture-or-lose nas duas** (§8/discordância 1). Regra que vale sob as três (`CA-F0-12`): **nenhum resultado de backtest omite a premissa OU a medição de spread, e ela nunca se dissolve no número.**
- **Q20 · SMC, pivôs+Fibonacci, ou os dois? — NOVA em R2, e é a única que eu me recusei a inferir.** Não trava nada em F0–F4. **Decide o primitivo de `<Anotacao>`, o corpus de zonas, a estimativa da fase seguinte, e — indiretamente — se `aggTrade` cru volta a ser requisito.** **O que fica fixado hoje sob qualquer resposta:** `swing_point` como primitivo, `price_source` por uso, `tick_size`/`price_precision` datados, e **a primeira tranche de marcação de `Q11` sendo swing** (ver A6).
- **Q18 · profundidade do backfill do dump `metrics`: 30 d ou 2.183 d?** **4,1 h** contra **297 h** sequenciais (`0,86 s/arquivo`). **É o oposto de urgente** — o dump é re-baixável — e a fila é retomável, logo começar por 30 dias e estender **não é retrabalho**.
- **Q19 · `availability_probe_set`:** quais símbolos e endpoints ganham `available_at` **OBSERVED**. **Aritmeticamente restrito**: balde próprio de `/futures/data/*` é **1000 req/5 min = 200/min** ⇒ **6 símbolos a 10 s** ou **20 a 30 s**; **a 60 s a resolução é mais grossa que a dispersão medida (99,6–200,8 s), logo não informa**. **Decide quais séries têm defasagem real PARA SEMPRE.**

**Com relógio:** Q3 (canal de alarme — é o que impede Q1/Q4/Q19 de perderem em silêncio) · Q4 (key Coinalyze) · **Q17** e **Q19** (junto com Q1) · Q7 (Bybit). **Q5 SAIU do gate de F0** (A3 fechada).

**Sem relógio de dado, mas custam remarcação ou reescrita:** Q9 (retenção de tick — **e a correção importa: não é relógio de dado, o dump S3 existe desde 2019-12-31 e é re-baixável; quem devolve só 48 h é o REST**) · Q10 (ordem dos três produtos — decide qual superfície ganha teclado) · Q11 (owner marca o corpus? **trava a fase seguinte, não esta**) · Q12 (alias) · Q13 (cor do candle) · Q15 (ToS — **zero evidência, ninguém leu, e a restrição incide retroativamente sobre o que Q1 manda acumular hoje: tensão real com R1, e o PRD não a esconde**) · Q16 (prazo corrigido, ver A2).

**Três continuam classificadas como inferíveis** (PRD §9) — **e R1 corrigiu duas delas:**
- **Q6** (universo cripto-perp). **A frase *"custo de reversão: um filtro"* era FALSA na perna de CAPTURA** — filtro reverte série armazenada, não reverte captura. **Com A3 fechada o conserto é definitivo:** `!forceOrder@arr` desnuda **Q5 e Q6** de poder sobre a captura, e **só então** a inferência é, de fato, um filtro de leitura. Persistir **`underlyingSubType`**, não só `contractType` (ele distingue `TradFi` 175, `Pre-IPO` 2, `ETF` 1). **Objeção que o validador levantou e DERRUBOU com medição — não reabra:** TradFi perpétuo negocia **24/7** (em 2026-08-23, domingo, `TSLAUSDT` e `XAUUSDT` têm **288 buckets, 288 klines, zero volume 0, OI mudando em 287/287**) ⇒ **não há consequência de calendário de sessão**.
- **Q8** (exibição UTC). **Nada a corrigir** — e fica registrado o que o validador testou: a hipótese de que `cvd_anchor = DiaUTC` seguisse o fuso de exibição e **invertesse o sinal do CVD** **não procede** (`DiaUTC` está travado no nome do construtor do tipo-soma; `nextFundingTime % (h·3600000) == 0` em 570/570). **Não reabra.**
- **Q14** (pt-BR). **R1 achou a consequência de domínio que a inferência não nomeava: o separador decimal num CAMINHO DE DADO.** A porta 7 exige fixture *"byte-idêntica ao que o gráfico exibiu"*; se locale entrar em export, payload, hash, CSV de reprodução ou `run_registry`, **o fixture deixa de ser byte-estável entre `LANG=pt_BR.UTF-8` e `LANG=C`** — e um fixture que não é byte-estável **não é fixture**. **Requisito de uma linha:** serialização de numeral em qualquer caminho de dado é **invariante de locale** (ponto decimal, sem separador de milhar); pt-BR fica **exclusivamente** em microcopy e rótulo de eixo. **Teste:** exportar com os dois `LANG` e comparar `sha256sum`.

---

## 5. Fatos que faltam e que ninguém deve inventar

Se você precisar de um destes para decidir, **a resposta é medir ou declarar a lacuna — não estimar**:

- **`lag_ms` real por endpoint.** Hoje **n=2** transições, 1 símbolo, 1 janela de 10 min, com dispersão de **55% sobre n=2** no OI. Fecha com M-1, **90 min de script** — **e R1 acrescenta que M-1 não basta**: ele é uma medição **única**, e `available_at` OBSERVED em regime exige o **probe contínuo** (`CA-F0-9`), que **no universo inteiro é aritmeticamente impossível** (200 req/min ⇒ 6 símbolos a 10 s, 20 a 30 s). **Enquanto não rodar, toda idade exibida em painel ao vivo é constante adivinhada e a tela escreve `idade ?`.** **E R1 fecha o outro lado, que estava aberto:** `idade ?` resolve **exibição** e **não decide armazenamento** ⇒ endpoint sem `lag_ms` medido grava **`available_at = NULL`**, `availability_source = MODELED`, **série em quarentena**. **Nunca `event_time`, nunca `event_time + interval`** — esses são o default **361× otimista** gravado nas linhas do go-forward, as que não se recapturam. **Prevê-lo não é medi-lo.**
- **A estatística do carimbo MODELED, quando ele existir.** A rodada original fixou que **existe** tabela de defasagem e que **`p99` vai na tela com o `n`** — e **não** fixou **qual estatística entra no carimbo gravado** nem a **direção de arredondamento**. **Média ou mediana são otimistas em metade dos casos**, e **errar o rótulo por um bucket inverte o sinal do ΔOI de 15 min em 21,96% das janelas (n=8.629)**. **R1 fixou: conservador por construção** — `available_at_MODELED = próximo ponto da grade nativa >= (bucket_end + p99_lag + margem)`, **arredondando para CIMA até a próxima borda de grade**, e a tabela grava `lag_stat`, `lag_n`, `lag_resolution_s`, `lag_window` **como colunas, não rodapé**.
- **A região e a identidade do observador.** **`available_at` OBSERVED não é propriedade do mercado — é propriedade de `(mercado, local do observador, caminho de rede)`.** Os dumps vivem em **`ap-northeast-1`**; um host em São Paulo e um em Tóquio produzem carimbos **sistematicamente diferentes**, e a tabela de defasagem **não é portável se o host mudar** — cenário aberto, porque Q2 não foi respondida. **É uma coluna hoje e é impossível retroativamente** (`[GAP G7]`, `CA-F0-10`).
- **Topologia do balde de rate limit:** 2,85 min/varredura se por endpoint, **14,25 min se compartilhado**. **CONTESTADA e não testada.** Decide se S4 ao vivo existe **e** se o guard anti-lookahead do `scope: CrossSection` vale. **Não é diferível.**
- **Throughput de TimescaleDB vs ClickHouse.** **Nenhum dos dois foi instalado. Não há número e não se vai inventar um.**
- **Lightweight Charts com 288 pontos + 1.440 candles no mesmo eixo em tempo de parede.** **Declarado no discovery como o maior risco técnico desta especificação, e não medido.** O teste é conferir se as coordenadas X batem com os `event_time` originais com tolerância de 0,5 px.
- **Retenção do bucket S3** — o dump é `re-baixável (retenção não medida)`, **nunca "infinito"**.
- **Os ToS de Binance, Bybit e Coinalyze** — não lidos por ninguém.
- **A direção do acúmulo do funding** (a taxa liquidada em `T` cobre o intervalo que termina ou o que começa nele) — doc não lida. **O anti-padrão da escada para frente não depende dela:** os 18,01% de troca de sinal tornam qualquer projeção para frente uma afirmação sobre intervalo não observado.
- **A unidade do taker.** Evidência favorece quote em **601/864 buckets (69,6%)** e **não fecha** — por isso a série nasce em quarentena, com shift 0 verificado e unidade não resolvida.

### As armadilhas de citação — e R1 achou que o PRD caía em duas delas

**Herdadas e já registradas:** os valores de CVD do `awk` (`−1265,978 / +399,746`) **reprovam uma implementação correta** — os canônicos são os do `Decimal`.

**Achadas em R1, dentro deste PRD** (PRD §11, D-15a–f). Leia estas antes de citar qualquer número deste corpus:

1. **Os números de amplitude/range de §11(b) eram do `awk` — dentro do parágrafo que declara o `awk` reprovado.** Canônicos em `Decimal`: amplitude **2864,490** (não 2864,486); range 1 min **6450,412**, 5 min **6174,218**, 15 min **5904,183**.
2. **E o enunciado estava errado, o que é pior que os dígitos:** as três âncoras (**−1265,982 / +399,745 / +1598,508**) são **INVARIANTES AO BUCKET** — 00:00/12:00/20:00 são pontos das três grades. O qualificador *"em buckets de 1 min"* de `CA-F1-8` **sugere que dependem, e não dependem**. **O que depende do bucket é o range da curva e o p90 do delta.**
3. **As razões `×p90` não são citáveis sem o estimador.** `numpy.percentile(|Δ|,90)` → 104,0/25,0/**10,3**×; `statistics.quantiles` → 103,6/24,2/**9,0**×; com sinal → 173,4/56,3/16,4×. **No bucket de 15 min (n=96) a escolha move 9,0 → 10,3, ou 14%.** E a ironia é estrutural: **PRD §5.5 EXIGE `interpolation` explícito em `Percentile{...}` porque percentil sem estimador mente** — a regra valeu para o produto e não valeu para a citação. **⇒ o teste de regressão de §16 TEM DE FIXAR O ESTIMADOR, ou falha por motivo errado.**
4. **`CA-F4-12` era 432 e é 434 de 570 (76,14%)** — 432 é a contagem de 4h; símbolos em que uma constante de 8h **erra** = 432 + 2 (os de 1h). **E a taxa depende do universo:** no combinado com TradFi é **446/740 = 60,3%**. **Métrica transversal sem universo, dentro do documento cujo `CA-F4-8` proíbe exatamente isso.**
5. **A frase do multiplicador misturava dois universos.** No de **570** perp `TRADING`: `^1000 = 15`, `^\d = 20`, **4** falsos positivos, e "o correto é 18" vira **16**. No de **877/698**: 17, 23, 5 falsos positivos, correto 18. (`42USDT` só existe fora do `TRADING`.) **A conclusão sobrevive: a regex erra `1MBABYDOGEUSDT` por 10⁶, e a tabela tem de ser curada.**
6. **Os `2,85 / 14,25 min` aparecem 5 vezes e o limite que os produz NUNCA aparecia:** *"IP rate limit 1000 requests/5min"* da doc de *Open Interest Statistics*. O PRD só citava `REQUEST_WEIGHT 2400/min`, que é **outro balde** (o de `/fapi/v1/*`, onde vive o `premiumIndex`). **Declare os dois baldes separados — e note a consequência FAVORÁVEL que o PRD estava perdendo: `premiumIndex` e `/futures/data/*` NÃO COMPETEM**, logo **o coletor de funding estimado de F0 não consome nada do balde do backfill de OI**.
7. **`premiumIndex.lastFundingRate` não é a taxa liquidada — e agora está MEDIDO** (sai de `[NÃO MEDIDO]`): snapshot em `time = 1787606060000` com `lastFundingRate = 0.00007078`, tirado **depois** do settlement `1787587200000`, cuja taxa foi `0.00010000`. **É a estimativa corrente do intervalo em curso.** Vira fixture.

---

## 6. Classificação dos gaps

| classe | quantidade | consequência |
|---|---|---|
| **bloqueante** | **0** | Não há `feedback_to_pm.md`. Nenhuma das 19 perguntas nem dos 8 GAPs impede fronteira de fase clara, regras endereçáveis, tipos definidos ou non-goals escritos. **As respostas mudam quando o trabalho começa, o tamanho do universo e quanto disco custa a honestidade — não qual é o requisito**, e a estrutura F0–F5 sobrevive a qualquer resposta. **E R1 é a prova de que o gate de PM e o gate de domínio são coisas diferentes:** os 6 bloqueantes de domínio **não eram ambiguidade de requisito** — eram **mecanismo ausente ou invertido**, e nenhum deles apareceu como bloqueante nesta coluna |
| **não-bloqueante** | **16** perguntas de owner (PRD §8) + **8** GAPs de time (PRD §10) | Perguntas em Aberto, cada uma com prazo derivado e com o requisito que torna a resposta tardia barata |
| **inferível** | **3** (PRD §9) | `[INFERRED]` com motivo e custo de reversão declarados |

### Os 6 GAPs, por severidade — e o pedido concreto a você

Nenhum é pergunta de owner. **Quatro vêm do §Anexo da avaliação, que os levantou e que nenhuma das cinco fases do recorte absorveu** — é exatamente o tipo de item que se perde entre rodadas.

| id | gap | sev. | por que ele ameaça a tese de F0 |
|---|---|---|---|
| **G6** | **NTP e relógio do host como dependência de runtime** — **R1: promovido a `CA-F0-8`** | **alta** | `available_at` OBSERVED é o ativo mais precioso desta fase **e é carimbado pelo relógio local**. Estava endereçado a **F3**, e **o ativo que ele protege nasce em F0**. Correção que o torna atendível: **`clock_skew_tolerance_ms` NÃO é medível antes de o coletor rodar** ⇒ **F0 persiste o skew por `ingest_run`**, **F3 calibra**. Exigir o valor medido em F3 sem F0 persistir nada era **impossível de atender** |
| **G7** *(novo em R1)* | **RTT e região do observador como dimensão de schema** | **alta, e a janela fecha em F0** | `available_at` é propriedade de `(mercado, observador, caminho de rede)`. `avaliacao` §Anexo 10 nomeou "região/RTT" e **nenhuma fase absorveu**. Fecha com **`CA-F0-10`**: `observer_id` + `observer_region` como **colunas**. **Uma coluna hoje; impossível retroativamente** |
| **G8** *(novo em R1)* | **Rastreabilidade: nenhum ID estável por achado, e colisão de namespace** | média, custo de esquecer alto | `A3` significa **duas coisas diferentes** em dois documentos (transporte de tempo real vs telemetria de cota), e **este PRD citava "achado A3" sem qualificar**. O `"89 achados"` **não reconcilia**. Fechado por **PRD §18**. *Ressalva:* o validador atribuiu a colisão a `insumo-para-ux.md` — **esse arquivo não existe neste repositório**; é `plataforma-superficies-e-faseamento.md`. **A colisão é real; o arquivo apontado não era** |
| **G1** | **`.CHECKSUM` na ingestão + backup com teste de restauração** | **alta** | **Download truncado é silencioso e produz série curta, não erro.** E liquidação, funding estimado, `available_at` OBSERVED e snapshot datado **não são re-deriváveis de dump nenhum** — perder o volume perde isso para sempre, e nenhum achado falava de backup |
| **G2** | **Não existe runner de teste; `[test_cmd]` ausente e sem CI** — **R1: pré-requisito de F0, era F1** | **alta** | **~99 critérios de aceite e 54 medições que devem virar regressão, e nada que as rode.** A mais barata (ordenar o CSV) é a que, esquecida, **envenena o screener em silêncio**: 19 disparos falsos contra 0 reais. Métrica honesta hoje: **0/54**, e `harness policy --key test_cmd` → **`{}`** (reconferido em R2). **Composição das 54:** 34 na original + 6 em R1 + **9** da medição da Coinalyze + **3** medidas por mim em R2 (peso e tamanho de `/fapi/v1/depth`; ausência de `x-mbx-*` em `/futures/data/*`; `Content-Length` dos zips do dump) + **2** do direcionamento (o 98,44% e a aritmética de pontos de OI por barra). **As outras 4 linhas de `direcionamento-operacional.md` §4 já estavam contadas** — e uma delas **corrige** um número que R1 publicava errado por 4,8×. **Por que F0 e não F1: `CA-F0-3`, `CA-F0-4` e `CA-F0-5` JÁ SÃO TESTES** — sem runner, F0 termina com sete afirmações e nenhuma conferível por comando, na fase cujo dado não se recaptura |
| **G3** | **Série canônica de preço por uso** — **R1: maior do que dizia, e MAIS BARATO de fechar** | **alta** | **Maior:** a divergência **não é de precisão** — o **bucket que contém o high do dia é DIFERENTE** nas duas séries (last **78057,60** às 20:05Z, mark **78017,83** às 20:10Z), e a **ordenação de highs entre buckets vizinhos inverte em 2,09%**, a de lows em **5,57%**. **Ordenação de high/low vizinho é a primitiva de swing, BOS/CHoCH e sweep ⇒ a escolha da série decide ONDE O SWING ESTÁ**, e a divergência mediana (22–37 ticks a `tickSize=0.10`) é **maior que qualquer tolerância plausível de "igual"**. **Mais barato:** `sum_open_interest_value / sum_open_interest` **É o `markPriceKlines.close` do mesmo bucket, exato a 8 casas, 288/288** ⇒ o dump `metrics` **que a plataforma já ingere** carrega mark price em grade de 5 min, **2.183 dias, 570/570, de graça**. **Consequência obrigatória: `implied_avg_price` está RENOMEADO para `price_mark_close`** — *"preço médio implícito"* **ensina errado e o catálogo é o veículo de propagação**. R1 já especificou a tabela `price_use → price_source` (PRD §5.5) e a invariante de candle fechado é **R-2** |
| **G5** | **Stakeholders: operação de um só com SLO P1 de 24 h** | **média** | Q3 pergunta o **canal**; ninguém perguntou **quem recebe quando o owner está indisponível**. Alarme de perda permanente que dispara para uma pessoa que pode estar num voo. Fecha com uma linha de declaração + runbook de uma página |
| **G4** | **Atribuição obrigatória do Lightweight Charts** | baixa (custo de esquecer alto) | Apache-2.0 **e a doc exige creditar a TradingView numa página pública**. Nasce na primeira tela (F1), em `frontend/` — **a área sem regra**. Item de aceite a criar em F1 |

**R2 acrescenta QUATRO dimensões varridas, e nenhuma delas gera GAP novo com ID — três fecham dentro do PRD e uma é `Q20`:**

| dimensão (R2) | veredito |
|---|---|
| **identidade de série sob fonte com semântica OHLC** | era **`[COBERTO]` por engano** → **E-04**. `SeriesKey` tinha `ts_convention` com **dois** valores e **zero termo de `reduction`** ⇒ as quatro séries de OI da Coinalyze e a uma da Binance **colapsavam na mesma identidade**. **Fechado** em PRD §5.2 + `CA-F2-17`. **Classe: identidade insuficiente — e a correção depois é migração de IDENTIDADE, não coluna nova** |
| **granularidade declarada pelo consumidor** | era **`[GAP]` implícito**, fechado por **premissa**. Antes do direcionamento, **toda decisão de grade neste PRD era escolha do time vestida de requisito** — inclusive o *"80% das barras de 1 min sem OI"* que reorganizou a rodada de UX. **Todos os prazos declarados (15m/1h/4h) e todas as cadências (1m/5m/15m) são múltiplos inteiros de 1 min** ⇒ 1 min é a grade canônica suficiente, e custa **~72 GB uma vez** para universo e profundidade inteiros |
| **escopo de detecção da fase seguinte** | **`[GAP]` que NÃO é do time** → **`Q20`**. Não inferível |
| **fonte com ZERO medição** | **`[GAP]`** → **Coinglass**. Nomeada pelo owner como candidata a par da Coinalyze; **nem doc lida, nem endpoint chamado, nem key.** ⇒ **nenhum requisito do PRD depende dela, de propósito**, e **nenhum pode passar a depender antes de o mesmo protocolo rodar.** É a lacuna mais barata de todas, e a única cujo custo de **não** fechar é **zero hoje** — o que a Coinalyze acabou de demonstrar é o motivo para fechá-la antes: **11 chamadas derrubaram cinco afirmações que três documentos repetiam** |

**Pedido:** adjudique os **oito** no Gap Analysis. **G1, G2, G3, G6 e G7 pedem entregável em F0 ou F1** — os cinco têm em comum que o dano é **silencioso e permanente**, que é a classe de defeito que esta fase inteira existe para impedir. **G5** é uma frase de declaração de risco. **G4** virou item de aceite: **R1 criou o `CA-F1-15`** que a rodada original deixou como *"a criar"*. **G8** está fechado por PRD §18.

---

## 7. Nota de ambiente

- **Tracker:** `kind = jira`, projeto **CST**, board 36, `parent_kind = Epic`, `child_kind = Tarefa`. **Nada foi criado, editado ou comentado.** As 6 unidades de valor viram Epics **depois** da sua validação — e é ato do owner/encadeamento, não deste PM.
- **Incerteza herdada e ainda não medida** (`harness.toml`): `"Tarefa"` é o `name` traduzido do tipo 10054, cujo `untranslated_name` é `"Task"`. **Qual literal a integração aceita em `jira_create_issue` só se mede criando uma issue real.** A primeira issue criada neste board fecha a questão — e ninguém a criou ainda.
- **Regras em vigor:** **4 bloqueantes**, todas `core`, todas endereçáveis (PRD §14). **Reconferido em R2:** `harness rules list --severity block` → `core.relative-import`, `core.silent-except`, `core.print-statement`, `core.hardcoded-secret`, *"total: 4 regra(s) em vigor"*; `harness policy --key packs` → `["core"]`; `harness policy --key test_cmd` → `{}`. **Nada mudou desde R1.** Duas são **requisito de domínio e não só higiene**: `core.silent-except` (exceção engolida na borda de ingestão produz `verdict` ausente e lacuna não registrada — o modo de falha que `md.ingest_gap` existe para impedir) e `core.print-statement` (`md.ingest_run` é **persistido, nunca log** — e `print` não é nem log). **⚠️ R1 mediu uma colisão que o PRD não notava:** `core.print-statement` **bloqueia o registro de CLI de F0 na implementação ingênua** — `harness rules --mode file --path backend/src/cli/report.py` com `print(rows)` → `{"decision": "block", ...}`. **Resolução barata, mas tem de ser DECIDIDA** (ver §3, notas de A1).
- **`frontend/` é área declaradamente não coberta**, e o `doctor` diz CONFORME sobre um universo sem um único `.tsx`. **R1 mediu por comportamento:** um `.tsx` violando duas regras por construção devolve **saída vazia, zero regras avaliadas** (`scope = "code"`, e `frontend/` não é código para o classificador) ⇒ **o fecho tem duas partes obrigatórias**, não uma. É Q16 + `CA-F5-4` (reescrito para ser falsificável) + A2.
- **Não há código neste repositório.** Zero linhas. `backend/src/` não existe, e o aviso V-12 do validador é **esperado hoje**. **Nota de higiene de R1:** as duas medições de enforcement acima exigiram criar `backend/src/cli/report.py` e `frontend/src/Probe.tsx` como sondas — **os dois foram removidos**; `git status` continua sem código.
- **Ponteiro de arquiteto de domínio:** `[agents.by_component]` mapeia `sentimento`, `convergencia` e `backtest` para `.claude/agents/quant-architect.md`. **`charts` e `web` não têm dono** — e são os dois componentes que a rodada de UX produziu.

---

## 8. Ciclos — **este é o ciclo 3 de 3**

**Ciclo 1** terminou com **gate reprovado** (6 bloqueantes de domínio). **Ciclo 2 (R1)** foi a incorporação, e fechou **declarando uma dívida** em vez de a esconder. **Ciclo 3 (R2, esta emissão)** quita a dívida e absorve o direcionamento operacional.

**⚠️ Não sobra ciclo depois deste.** Se o Gap Analysis reprovar, o retorno vem em `docs/context/plataforma-dados/feedback_to_pm.md` **e a próxima parada é o owner, não outra rodada de PM.** ⇒ **se você for reprovar, reprove com o mecanismo que falta nomeado**, como o validador de domínio fez em R1 (os 6 bloqueantes dele **não eram ambiguidade** — eram **mecanismo ausente ou invertido**), porque é isso que torna a escalada útil em vez de um pedido de mais tempo.

**Onde eu espero que você discorde, e onde a discordância é bem-vinda:** A1 (browser vs CLI no registro de F0, agora com a colisão de `core.print-statement` pesando na conta) · A2 (dividir F5, **e o prazo que R1 antecipou de F1 para F0**) · **A4 (o que fazer sob a incerteza `latest|largest`)** · e a decisão de classificar Q1 e Q2 como **não-bloqueantes** em vez de PARAR. **O argumento para não parar sobreviveu à validação de domínio, que o reforçou:** Q1 é **autorização** sobre um desenho completo — e **R1 o completou mais**, fechando A3 — não uma incógnita de requisito; e Q2 está registrada como **premissa declarada com a consequência de falsificação escrita**, agora **reescrita para não se autofalsificar**. Se você julgar que uma premissa dessa magnitude tem de bloquear, essa é uma correção legítima e eu a aceito.

**Onde eu espero que você discorde em R2:** **A5** (Parquet/DuckDB como candidato — e onde vive a lógica de unicidade) · **A6** (o primitivo `swing_point` antes de `Q20` ser respondida) · a **opção (c) de `Q17`** (é spread amostrado, não tick — se você julgar que amostra a 1/min é pior que premissa declarada por ser *falsamente precisa*, esse é um argumento legítimo e eu quero ouvi-lo) · e **`Q9` declarada MORTA** (se você achar que uma pergunta fechada por aritmética própria do PM deveria ter voltado ao owner em vez de morrer, corrija).

---

## 9. Onde eu DISCORDEI do que me foi passado em R2 — cinco, com o argumento

**Aplicar por obediência o que se acha errado é exatamente como a inversão de `ASOF` entrou neste PRD.** As cinco estão aplicadas **na forma que eu defendo**, não na forma em que chegaram. O texto completo é **PRD §0.3.3**; aqui vai o que muda o **seu** trabalho.

1. **`CL-4` NÃO morre — encolhe ~110× e continua capture-or-lose. E existe uma opção (c) que eu medi.** Me foi passado: *"`bookDepth` continua publicado e é re-baixável, logo nada se perde esperando"*. **A primeira metade é verdadeira e a conclusão não segue.** **(i)** `bookDepth` **não tem bid/ask** ⇒ serve slippage por profundidade, **não** serve spread; escolher (b) entrega spread **assumido**. **(ii)** Medido em R2: `GET /fapi/v1/depth?symbol=BTCUSDT&limit=5` → **200, 295 B, peso 2** ⇒ 20 símbolos a 1/min = **1,67% do `REQUEST_WEIGHT`** e **~3,1 GB/ano**, **~110× mais barato** que (a) — **e em baldes distintos do backfill de OI, confirmado por observação dos headers**. **Ressalva que eu mesmo faço: 1/min é AMOSTRA, não tick** — a distribuição intra-minuto fica invisível e o spread alarga exatamente no instante do fill. **(c) não é (a).** Mas é spread **medido, com `n` e percentil**, no instante que o owner declarou como o de decisão. **E há uma ressalva na direção oposta que também é minha:** `bookDepth` é re-baixável **enquanto o dump continuar publicando** — e **`bookTicker` desapareceu do mesmo dump, em silêncio, em 2024-03**, com a retenção do bucket S3 `[NÃO MEDIDO]`. ⇒ **precedente medido de que "é re-baixável" pode falhar sem aviso**, e a mitigação custa **um `curl -sI` mensal**: descobre a perda em um mês em vez de em dois anos.
2. **`aggTrade` cru: concordo com a conclusão, discordo do argumento — e o argumento é o que fica no documento.** Me foi passado que o **98,44%** de desempate SL-vs-TP por 1m dispensa o tick. **Ele dispensa COMPUTAR sobre tick; quem dispensa CAPTURAR é o dump ser re-baixável desde 2019-12-31.** **A distinção não é retórica:** se o dump **não** fosse re-baixável, 98,44% **não bastaria**, porque **absorção está na tese do owner** — o direcionamento diz *"agressão e **absorção** via CVD"* e a `proposta-discovery` §Módulo C diz *"Divergência / **Absorção** de Volume (CVD)"*. **Absorção por bucket** (CVD sobe, preço não) lê-se de kline; **absorção por TAMANHO DE TRADE exige tick.** **A tese nomeia a camada e não desambigua qual das duas** ⇒ escrever *"`aggTrade` deixa de ser requisito"* sem a ressalva **entrega à fase de estratégia uma camada que o owner pediu e um insumo que ela não tem.** **Forma que fica: sai do requisito de CAPTURA, permanece porta aberta com gatilho NOMEADO, e o gatilho é `Q20`.**
   **E duas ressalvas sobre o 98,44% que ninguém declarou:** **(a) procedência estreita** — um símbolo, 8 dias, um regime; um alt ilíquido **tende a baixar o número**, e medir num alt custa **46.746 B/dia** (medi o `klines 1m` de ADAUSDT em R2). **(b) a convenção pessimista não é neutra** — assumir o stop primeiro enviesa **para baixo**, o que é certo para o capital, mas numa estratégia de borda fina **1,56% de barras sistematicamente pessimistas pode virar lucro marginal em prejuízo, e não haveria como saber se o culpado é a estratégia ou a convenção**. ⇒ **requisito: o `run_registry` grava a convenção E A CONTAGEM de trades que ela decidiu**, para que a influência dela seja **medível em vez de embutida**. *(E o 1,56% é fração de BARRAS; a fração de TRADES afetados é menor e é `[NÃO MEDIDO]`.)*
3. **"Nos prazos declarados toda barra tem OI" é FALSO a 5m — e 5m é uma das cadências de avaliação declaradas.** `5m → 1,0 ponto/barra` é **média, não garantia**: com **3 buckets ausentes em 8.640 medidos**, algumas barras de 5m têm **zero**. A 15m (3,0/barra) um bucket ausente deixa 2 ⇒ degrada para **cobertura parcial**, que é outra coisa que ausência. ⇒ **a política de renderização de ausência continua requisito de PRIMEIRA CLASSE a 5m** e vira tratamento de exceção **a partir de 15m**. **O carimbo de idade continua obrigatório em TODOS os prazos**, por razão independente do timeframe: a defasagem de publicação do OI (**99,6–200,8 s**).
4. **A retenção por contagem de pontos tem duas consequências operacionais não ditas, e uma é ADVERSA.** **(i) Favorável:** a janela de reparo de um coletor parado é `pontos × intervalo` ⇒ **trilhar a série de 5 min em vez da de 1 min multiplica o orçamento do SLO P1 por ~4,7** (~7,0 d contra ~1,5 d). Isso muda `CA-F3-10` de constante para **fórmula por série**, e a escolha do trilho vai **escrita**. **(ii) Adversa:** série **esparsa** retém mais relógio **porque só existe bucket onde houve evento** ⇒ **a janela da liquidação ENCOLHE exatamente durante uma cascata**, que é o único regime em que ela importa. **Retenção e necessidade são anticorrelacionadas nessa série** ⇒ **a Coinalyze NÃO é rede de segurança do coletor de liquidação**, e isso é **argumento adicional a favor de `Q1`**, não substituto (PRD §17/**R12**, novo).
5. **`medicao-coinalyze` §3.1 exagera o contraste com a Binance, e o exagero aponta para o lugar errado.** O texto diz que a ausência de header de cota é *"o oposto do que a Binance oferece (`X-MBX-USED-WEIGHT-*` em toda resposta)"*. **Medi: `/futures/data/openInterestHist` devolve `200` com zero headers `x-mbx-*`** — só CloudFront e segurança. ⇒ **o balde onde o screener vive é tão cego quanto o da Coinalyze** (`avaliacao:A3`, reproduzido). **A conclusão de desenho fica MAIS forte, não mais fraca:** contagem local conservadora **não é adaptação a um fornecedor pior — é o caso geral.**
   **E na sexta, sobre o corpus, eu discordo de uma frase e concordo com a conclusão:** me foi passado que *"o corpus não se reaproveita"* entre OB e pivô/Fib. **Verdade para um corpus de ZONAS, falso para um corpus de SWINGS** — e a distinção é acionável hoje: **swing é o primitivo dos dois vocabulários**, logo **marcar swings é a única marcação que sobrevive a qualquer resposta de `Q20`** (A6).

---

## 10. Onde eu DISCORDEI em R1 — mantido, porque os quatro foram confirmados pelo owner

*(O owner registrou em R2 que os quatro apontamentos abaixo estavam certos. Ficam escritos porque o padrão importa mais que o placar.)*

1. **`web-fullstack.server-test-directory-present` "dispara mesmo agora" — não dispara.** A regra existe, é `path-presence`, `severity = block`, `target = "backend/tests/**"` e **de fato não tem `scope`** (logo não passa pelo classificador). **Mas ela declara `modes = ["sweep"]`**: dispara em **varredura de repositório, não por arquivo**, e **só depois de o pack ser adotado** — `harness policy --key packs` → `["core"]`. **Registrei a regra com a ressalva** (`CA-F5-5`), em vez de afirmar um enforcement que hoje não roda. Adotar o pack é decisão de F5, não fato consumado.
2. **A colisão de namespace foi atribuída a `insumo-para-ux.md`, e esse arquivo não existe neste repositório.** A colisão é **real e a documentei** — mas o documento que colide é `plataforma-superficies-e-faseamento.md` (`faseamento:A3` = transporte de tempo real; `avaliacao:A3` = telemetria de cota). **Corrigi o apontamento em vez de citar um arquivo inexistente**, e deixei a ressalva escrita em `[GAP G8]` e em PRD §18.2.
3. **O "83 rotulados" não reproduz.** Reproduzi as duas aritméticas do documento de origem (**87** = 52 REFORMULADO + 35 CONFIRMADO; **89** = 49+23+16+1 por classe de verificação) e **contei o inventário de rótulos com comando publicado: 68** (26 numerados + 31 letrados + 11 de Anexo). **Não achei 83 sob nenhuma contagem, e não vou publicar um número que não sei reproduzir** — foi exatamente esse hábito que produziu os seis defeitos de citação de D-15. **PRD §18.3 publica os três números com o comando de cada, e diz qual é auditável.**
4. **`fundingInfo` tem 765 entradas hoje, não 760.** Os **20 COIN-M** batem exatamente com o que me foi passado. Usei **o número do snapshot em disco**, com o comando ao lado, porque é o que qualquer pessoa pode reproduzir — e a diferença é, ela mesma, mais uma instância da deriva de universo que `CA-F0-11` existe para capturar.

**✅ O owner registrou em 2026-08-25 que os quatro estavam certos**, e acrescentou a correção que eu não tinha: **`insumo-para-ux.md` é arquivo de scratchpad, não documento do repositório** — o documento que colide em `A3` é **`plataforma-superficies-e-faseamento.md`**, como eu havia apontado (`faseamento:A3` = transporte de tempo real · `avaliacao:A3` = telemetria de cota). **`avaliacao:A3` foi REPRODUZIDO em R2:** `/futures/data/openInterestHist` devolve `200` com **zero headers `x-mbx-*`**.

**Por que isto fica escrito em vez de ser apagado por ter dado certo:** o padrão importa mais que o placar. **Duas das quatro discordâncias eram sobre números que eu não consegui reproduzir** (*"83 rotulados"*, `fundingInfo` 760) e **duas eram sobre enforcement afirmado que não existe** (`web-fullstack.server-test-directory-present` com `modes = ["sweep"]` e pack não adotado; um arquivo que não existe no repositório). **As quatro classes reaparecem em R2**, e é por isso que R2 publica `Content-Length` e headers observados em vez de repassar estimativas.
