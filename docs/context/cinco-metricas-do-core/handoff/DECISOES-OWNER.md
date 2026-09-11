# Decisões do owner que enquadram esta feature (2026-09-10)

## A queixa que abriu a feature — citação literal

> *"Estou sentindo que estamos rodando em circulo nessa aplicação e não estamos conseguindo
> evoluir. Contruimos um painel que entrega nada, um monte de CLI q se comunica com nada.
> Sendo que desde o começo foi falado que essa fase de fundação era extração mais o gráfico
> … porém a entrega sempre foi ter um gráfico com os dados de volume, open interes, long
> short ration, liguidação e cvd. Esse é o CORE a proposta de desenvolvimento deveria
> convergir para isso desde o momento 0 … Cada fase deve ter uma entrega de valor, mesmo
> que mínima."*

`[PREMISSA-OWNER: 2026-09-10]`

## D1 — a unidade de fase deixa de ser camada e passa a ser FATIA VERTICAL

`[DECISÃO-OWNER: 2026-09-10, escolha entre 4 alternativas apresentadas]`

Uma fase = **uma métrica atravessando o cano inteiro**:
`coletor → writer → md.series → /api/v1/series-history → painel com ponto visível`.

**Motivo medido:** `plataforma-dados` tem 9 fases `QA=APPROVED` e **nenhuma jamais precisou
de um ponto na tela para passar** — decomposição horizontal (fase = camada). Ver
[`DIAGNOSTICO.md`](DIAGNOSTICO.md).

**Fatia 1 = volume (klines).** Custo declarado no menu e aceito: REST simples
(`/fapi/v1/klines`), sem WebSocket e sem agregação de tick; o painel *Preço* já existe na
tela e o eixo de preço é o que os outros dois painéis penduram.

Ordem das demais **não** está decidida por esta decisão — é ato do `/architect`.

## D2 — DoD-VERTICAL: o gate que faltava

`[DECISÃO-OWNER: 2026-09-10, escolha entre 2 alternativas apresentadas]`

**Toda fase** paga os 4, e reprova se qualquer um der 0:

1. `select count(*) from md.series where <métrica> …` **> 0** — SQL contra o Postgres real
2. `/api/v1/series-history` devolve `n_points > 0`
3. **Playwright contra o app real**: o painel da métrica tem `N>0` pontos no DOM e **não**
   diz `SEM_PONTO`
4. `n_written` do run **> 0** — fecha o furo de contabilidade do `DIAGNOSTICO.md`

**Alternativa recusada e por quê:** o DoD só-de-API (SQL + HTTP, sem assert de DOM) foi
recusado com número — a fase 02 de `pagina-de-grafico-s2` passou exatamente assim e o dado
não chegava na tela; quem achou o bug de wiring foi a fase 04, **em uso ao vivo pelo owner**.

⚠️ Item 3 herda a regra já registrada: *nunca seedar dado de teste no Postgres
compartilhado* — o e2e usa valor óbvio e limpa no mesmo gate.

## D3 — o ledger antes de abrir esta feature

`[DECISÃO-OWNER: 2026-09-10, escolha entre 3 alternativas apresentadas]`

- `pagina-de-grafico-s2` → **owner roda `advance DONE`** (5/5 fases com QA=APPROVED)
- `coinalyze-fora-da-quarentena` → **congelada em `SPEC_DRAFT`**, sem `approve spec`, até o
  CORE existir. Não entrega nenhuma das 5 métricas.
- esta feature → **filha de `plataforma-dados`** (`harness pipeline relate`)

## O que esta feature NÃO decide

O nome exato das métricas no catálogo, a grade nativa de cada uma, a ordem das fatias 2–5, e
o plano de retenção. Tudo isso é `/architect` — e a premissa de infra em vigor (VPS
compartilhada, R2 free tier, só Postgres) **veta gigas de aggTrades**, o que restringe a
fatia de CVD e precisa de decisão explícita quando ela chegar.

---

## D4 — o universo de símbolos (2026-09-10, durante a execução do `/architect`)

`[PREMISSA-OWNER: 2026-09-10]` — citação literal:

> *"no piloto estamos rodando 4 symbols, quando virar n vamos chegar a 10"*

**Parâmetro de projeto: `N=10`. Parâmetro do piloto: `N=4`.**

Isto **fecha** uma pergunta que estava sendo formulada como decisão em aberto do owner: contra a
cota medida da Coinalyze (40 unidades de `símbolo×endpoint` por 60 s, peso **linear**), 10
símbolos com as 4 métricas a 1 min custam **32 u/min = 80% da cota**, com 20% de sobra. **Cabe.**

Aritmética e medição em
[`MEDICAO-COINALYZE-TEMPO-REAL.md`](MEDICAO-COINALYZE-TEMPO-REAL.md) §4.2.2 — não a repita aqui.

⚠️ **Duas restrições que D4 impõe, e são requisito:** (1) retentativa é **por símbolo-endpoint
que falhou**, nunca do ciclo inteiro — refazer o ciclo custa 32 u e estoura; (2) uma **5ª
métrica** a 1 min sobre 10 símbolos custaria 42 u/min e **não cabe** na Coinalyze.

---

## D5 — o timeframe de operação (2026-09-10)

`[PREMISSA-OWNER: 2026-09-10]` — citação literal:

> *"Nossa operações serão no time de 15min a 4h."*

**Menor unidade de decisão de operação: 15 minutos.**

### O que D5 RESOLVE

| pergunta que estava aberta | resolução |
|---|---|
| CVD de bucket 1min serve para SMC, ou perde micro-estrutura? | **Serve.** 15 buckets de 1min por candle de 15min; 240 por candle de 4h. A micro-estrutura intra-minuto está 15 níveis abaixo da menor decisão. |
| Long/short só existe a 5min — é concessão aceitável? | **Não é concessão.** 3 pontos por candle de 15min, 48 por candle de 4h. |
| Defasagem de 58 s–134 s do ponto mais novo é aceitável? | **Sim, com folga.** A menor barra leva 15 min para fechar; 2 min de defasagem é 13% dela. |

⇒ Nenhuma das três é mais motivo para escalar ao `quant-architect`.

### O que D5 NÃO resolve — e é preciso dizer, porque a tentação é achar que resolveu tudo

- **A divergência de cauda do `bv`** (p99 29 bp, máx 1.956 bp — `docs/medicao-coinalyze.md` §4)
  segue **não diagnosticada**. É risco de **fidelidade**, não de granularidade: o timeframe não
  a toca. **Se algo for escalado ao `quant-architect`, é isto.**
- **Backfill.** A 15min–4h, um backtest exige meses de história. A Coinalyze tem retenção
  intraday **rasa** (teto por contagem de pontos: ~1,5 dia a 1min, ~7 dias a 5min). Ela serve
  **tempo real, não história profunda.** A fonte de backfill é outra e precisa ser declarada.
- **A grade de armazenamento.** Operar a 15min não implica **guardar** a 15min: guardar a 1min e
  agregar na leitura preserva a opção de mudar de timeframe sem recoletar. É decisão do
  `/architect`, e D5 não a toma.

---

## D6 — liquidações vêm da Coinalyze; o `!forceOrder@arr` sai do caminho crítico

`[DECISÃO-OWNER: 2026-09-10, escolha entre 3 alternativas apresentadas]`

**`ADR-036/D4` ACEITO na forma que o `/architect` propôs**, incluindo o que ele declarou como
custo: o conserto do `!forceOrder@arr` **fica sem data nesta feature**.

Alternativas recusadas, e o que o owner abriu mão ao recusá-las:
- *"Aceitar, mas exigir data para o forceOrder"* — recusada ⇒ **não** haverá task datada de
  conserto do socket mudo nesta feature.
- *"Recusar: consertar o forceOrder"* (o que `PRD-007`/`DEF-2` previa) — recusada ⇒ **esta
  decisão SUPERA `DEF-2` do `PRD-007`.** Quem ler o PRD sem ler isto vai orçar trabalho que
  o owner cancelou.

**Custo aceito, declarado no menu:** 4 das 5 métricas do CORE passam a depender da Coinalyze, e
o bug de ~46h de silêncio ([`ACHADO-FORCEORDER.md`](ACHADO-FORCEORDER.md)) **fica aberto no
repositório**.

**Argumento que sustentou a escolha:** a janela grátis da Coinalyze (§4.2.5 de
[`MEDICAO-COINALYZE-TEMPO-REAL.md`](MEDICAO-COINALYZE-TEMPO-REAL.md)) torna queda de coletor um
**atraso recuperável**; o WebSocket perdeu ~46 h **para sempre**.

⚠️ **O falsificador de `D4` continua valendo e é da fase `05`** (`ADR-036:158-160`): se a
retenção da Coinalyze para liquidação for menor que a janela de indisponibilidade típica, a
recuperabilidade que justificou esta decisão é **teórica**. A fase `05` mede.

## D7 — `n_written` é consertado sem versionar o contrato

`[DECISÃO-OWNER: 2026-09-10, escolha entre 2 alternativas apresentadas]`

**`ADR-035/D1-D3` aplicado direto.** `/api/v1/collector-status` passa de `uptimePercent: 0.0`
para o valor real, **sem** campo novo e **sem** versão de rota.

Motivo aceito: o `0.0` de hoje é **falso** — o coletor tem 1.429 runs na janela e aparece com 0%
de uptime `[MEDIDO 2026-09-10T20:10Z]`. Não há consumidor conhecido além do painel deste
repositório. **Trocar mentira por verdade não é quebra de contrato.**

Alternativa recusada: versionar (`uptimePercentReal` ao lado do antigo) — custo que o owner
recusou: campo morto permanente que sempre valeu `0.0`, e o painel tendo de escolher qual ler.

---

## D8 — teto de paralelismo na execução: 2 tasks simultâneas

`[PREMISSA-OWNER: 2026-09-10]` — citação literal:

> *"Faça o tl montar uma plano de paralelismo e exectamos a partir desse plano com no máximo
> 2 execuções simultaneas"*

**Teto: 2.** Vale mesmo quando o DAG de `depends_on` liberar mais de 2 tasks na mesma onda —
nesse caso o lote é quebrado em grupos de ≤2 e processado sequencialmente.

⚠️ **O teto anterior era 3** (declarado em 2026-09-07). Script ou plano que use lote de 3 está
desatualizado a partir desta data.

**O que o `/tech-lead` tem de produzir:** além das tasks, um **plano de paralelismo** — as ondas
do DAG, e dentro de cada onda os lotes de ≤2. O plano é o que a execução segue; não é para o
orquestrador improvisar o agrupamento na hora.

⚠️ **A ordem das fatias é sequencial por construção e isso limita o ganho:** `01 volume` produz
o cliente REST de `/fapi/v1/klines` que `02 CVD` reusa; `05 liquidações` é integração Coinalyze
do zero. O paralelismo real está **dentro** de cada fatia (tasks independentes da mesma fase),
não entre fatias. Se o `/tech-lead` achar que fatias podem correr em paralelo, precisa
justificar contra essa dependência — não assumir.
