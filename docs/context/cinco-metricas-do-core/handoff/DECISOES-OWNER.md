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

---

## D9–D12 · As quatro pendências de arquitetura, escolhidas em 2026-09-11

Menu, custos e alternativas recusadas: [`OPCOES-B1-B4.md`](../OPCOES-B1-B4.md). As quatro são
`[DECISÃO-OWNER: 2026-09-11, escolha entre alternativas apresentadas]` — o owner escolheu de um
menu que o `/architect` redigiu, com o custo de cada opção declarado. **Não são fala do owner.**

### D9 · `B1` — o handler de serviço E a varredura AST, com hierarquia declarada

Instalar `build_service_stdout_handler` **e manter** a varredura AST. `ADR-035/D3` é emendada para
**acrescentar**, não para relaxar: o handler é a **garantia**, a varredura é o **falsificador dela**,
e a emenda tem de dizer **qual manda** se divergirem.

**Recusadas:** a opção 1 pura (apagaria uma guarda com 4 mutantes mortos para instalar outra sem
histórico); a opção 2 (fecharia o precedente *"não negociável = negociável se der trabalho"* por uma
causa que já não existe — `single_writer_cli.py` está livre desde `696707c`).

### D10 · `B2` — emendar o texto do mecanismo, mantendo a decisão

A **decisão** de `ADR-035/D2` está provada em produção (557/558 runs de klines fechados); só o
**mecanismo escrito** está errado. Emendar `ADR-035/D2` **e** `SPEC-007`/`GA-4` registrando os dois
números que falsificaram o texto anterior. Zero código.

⚠️ **Os dois números que eu escrevi aqui primeiro estavam errados; estes são os medidos**
`[MEDIDO 2026-09-11, contando as cláusulas de `postgres_ingest_record_store.py:147-170`]`:

| eu escrevi | o medido | por quê |
|---|---|---|
| "16 campos sobrescritos" | **16 carregados, 15 sobrescritos** | `run_id` é a chave do `ON CONFLICT` ⇒ não entra no `SET` |
| "run de 10.080" | **run de 40.320** | 10.080 é a contagem **por símbolo** (7 d × 1440); o run é dos 4 |

⇒ contra `_DEFAULT_WRITER_BATCH_SIZE = 100` (`single_writer_cli.py:141`), são **≥404 lotes** contra
um run. As conclusões não mudam — **ficam mais fortes**.

A emenda **tem de admitir que a economia declarada em `GA-4` não se realizou, e dizer por quê.**
Coluna TABLE-only não é precedente novo: `domain/ingest_record.py:16-19` já documenta o mesmo split.

### D11 · `B3` — invariante + remissão, em vez da contagem

`SPEC-004` §3.1 passa a declarar o **invariante** — *um processo, uma thread por superfície de coleta
declarada* — e **remete a contagem** ao catálogo de séries de `SPEC-007`. **Recusada** a troca de
"duas" por "três": `ADR-036/D2,D3,D5` trazem coletores novos nas fatias `03`–`05` ⇒ seria a mesma
emenda três vezes, numa SPEC de outra feature.

### D12 · `B4` — `uptimePercent` mede RUNS FECHADOS, não linhas

`n_expected` **fica como está** (preserva a legibilidade do corte anti-lookahead, argumento já
medido em `collector_run_mapping.py:221-228`). `uptimePercent` passa a medir **% dos runs FECHADOS
da janela com `n_written > 0`**. Medido em 2026-09-11: klines **563/563**, premiumIndex **574/574**.

⛔ **Vai como TASK PRÓPRIA, não como resíduo da fatia `01`:** o defeito é anterior à fatia (o
`premiumIndex` sempre teve `n_expected = 900` símbolos contra 8 linhas) e as fatias `02`–`05`
herdam o mesmo em cada coletor novo ⇒ **consertar agora custa 1; depois, 5.**

⚠️ **Urgência medida:** o item 4 do `DoD-VERTICAL` está verde por causa de **um** run — o backfill,
`n_expected = 40.320`, que **sai da janela de 24 h em `2026-09-12T01:40:39Z`**. Sem ele os outros 563
runs dão **34,22%**. `T-01.11` não pode fechar a fatia sobre esse número.

#### A objeção do `forceOrder` foi levantada e RETIRADA — e o motivo fica registrado

Eu objetei que, sob `D12`, o `forceOrder` (3 runs, **0 fechados**) daria denominador zero ⇒ resultado
**indefinido** em vez de `0%`, e o socket morto deixaria de gritar. **O owner apontou que isso já
estava decidido:** `ADR-036/D4` tirou o `!forceOrder@arr` do caminho crítico e `D6` põe liquidações
na Coinalyze. **A objeção pesava sobre um coletor que já foi decidido remover — não é insumo desta
decisão.** Registrado para que não volte à mesa uma terceira vez.

---

## D13 · Tema único e escuro; o parâmetro de tema é APAGADO

`[DECISÃO-OWNER: 2026-09-11, escolha entre alternativas apresentadas]` — literal do owner:
*"pode registar a oção b"*, sobre um menu de 3 opções com custo declarado. **Não é fala dele**;
a frase que É fala dele está no `D14`.

**O que foi escolhido:** `colorTokens()` perde o parâmetro `mode`; `ColorMode` e a paleta clara
são **deletados**. O app fica com **um** tema, o escuro.

**O número que decidiu** `[MEDIDO 2026-09-11]`:

| | tema claro | tema escuro |
|---|---:|---:|
| tokens em `frontend/src/app/globals.css` (`@theme`, sem media query) | **0** | **10** |
| chamadas no código de produção do gráfico | 4 | 0 |

⇒ o app **já era** escuro-apenas; só as 4 chamadas do gráfico pediam claro. Escuro custa 4 sítios;
claro custaria reescrever a paleta inteira e a aparência de toda página.

### ⚠️ Correção de 2026-09-11 — a tabela acima tem um universo VICIADO e um número que não se reproduz

Pago pelo lote de conserto do gate da wave `03`, sobre o achado `BLOCKER-1` do QA. Duas coisas,
e a primeira é a que importa:

**1. O qualificador *"sem media query"* removia do universo justamente o contraexemplo.** Contado
sem ele, `globals.css` tinha **2** declarações de `--color-surface-base` — `#131722` no `@theme` e
`#ffffff` dentro de `@media (prefers-color-scheme: light)` (linhas 75-93 daquela versão) ⇒ a
conclusão *"o app já era escuro-apenas"* valia para o TypeScript e **não** para o CSS, que é o que
o browser pinta. Sobre `#ffffff` a linha de OI dava **1,22:1** e `--dado-quebrado-ink` **1,85:1**,
abaixo do piso 3,0 desta wave. O bloco foi removido, `:root` ganhou `color-scheme: dark`, e o teste
passou a exigir declaração única + zero `prefers-color-scheme`.

```bash
grep -c -- '--color-surface-base:' frontend/src/app/globals.css   # antes: 2 · hoje: 1
grep -c 'prefers-color-scheme' frontend/src/app/globals.css       # hoje: 1, e é PROSA (o teste ignora comentário)
npm --prefix frontend run test:charts                             # 189/189 (n=6 papéis medidos)
```

**2. As `4` chamadas em produção não se reproduzem; o número verificável é `3`.**

```bash
git grep -n 'colorTokens("light")' master -- frontend/src        # 6 ocorrências / 3 arquivos
#   SymbolClient.tsx:226,264,290  (produção)  -> 3
#   volume-subaxis-dom-contract.test.ts:1 + color-tokens.test.ts:2 (teste) -> 3
```

⇒ **3 sítios de produção, todos em `SymbolClient.tsx`** (o `4` provavelmente somou o contract
test). A DECISÃO não muda — 3 ou 4 sítios contra "reescrever a paleta inteira" dá o mesmo
veredito —, mas o número registrado fica corrigido em vez de propagado.

`[MEDIDO 2026-09-11: os três comandos acima, nesta árvore, branch `wave/03-producao-e-janela-deslizante`]`

**O que a troca conserta, medido contra `--color-surface-base = #131722`:**

| série | com `"light"` (hoje) | com a paleta escura |
|---|---:|---:|
| volume (`provenanceWeak`) | **2,80:1** ⛔ reprova WCAG 1.4.11 | **5,82:1** |
| linha de OI (`provenanceStrong`) | **1,00:1** — *invisível, igual ao fundo* | **14,72:1** |

**Alternativas recusadas:** (A) trocar `"light"`→`"dark"` nos 4 sítios — deixa a armadilha armada,
e ela **já disparou duas vezes no mesmo arquivo** (`SymbolClient.tsx:296` e `:334`); (C) derivar
das CSS custom properties em runtime — faria `charts` depender do DOM, contra a pureza que
`ADR-003` exige.

⛔ **Acompanha um PORTÃO, e ele não é opcional:** nenhum token de série pode ficar abaixo de
**3,0:1** contra `--color-surface-base`. Sem ele isto volta — e a prova é que a linha de OI está
invisível em produção **agora**, sem que nenhum dos 6 portões do `make verify` tenha visto.

⚠️ **Correção de uma afirmação minha:** na revisão de design marquei `directionOn` (`#131722`,
`1,00:1` contra o fundo) como defeito. **Não é** — é a cor desenhada **sobre o corpo da vela**,
onde dá `5,01:1` e `4,59:1`. Medi contra a referência errada. A paleta escura está inteira sã.

## D14 · Mobile fica FORA do piloto

`[PREMISSA-OWNER: 2026-09-11]` — literal: *"sem mobile no piloto"*.

⇒ o domínio **Mobile Experience** sai do universo da revisão de design enquanto durar o piloto;
uma nota baixa ali **não reprova** e não deve ser reportada como dívida. O alvo é desktop.
Reabre quando o owner declarar, não por iniciativa de agente.
