# ADR-005 — Transporte de leitura

**Data:** 2026-08-25 · **Status:** proposto · **SPEC:** [`SPEC-001`](../specs/SPEC-001-plataforma-dados.md) §4.3
**Fase/Epic:** F1 (mínimo) e F4 (completo) · `CST-3`, `CST-6` · **Componente alvo:** `web`
**Origem:** `faseamento:A3` — **qualificado de propósito.** Não confundir com `avaliacao:A3`, que é **telemetria de cota** e é outro item, também requisito

## Contexto

**Regra já fixa antes desta ADR: o browser NUNCA recebe tick.** Medido: **4.802.005 aggTrades/dia** num símbolo, pico de **3.468 msg/s** `[MEDIDO]`, e a vazão do mesmo símbolo variou **3,66×** entre dois dias da mesma semana.

E o direcionamento do owner restringe o problema: **não é HFT**, prazos **15m/1h/4h**, cadências **1m/5m/15m**, **decisão no fechamento do bucket** `[PREMISSA-OWNER: 2026-08-25]`. **Todos são múltiplos inteiros de 1 min** ⇒ a grade de 1 min é a mais fina que qualquer consumidor de decisão precisa.

Custo de envelope, medido: envelope completo por célula custa **519 B contra 54 B (9,6×)** ⇒ na tela de 570×6 células, **1.733 KB contra 180 KB** `[MEDIDO]`.

## Decisão

**A unidade de transporte é o ENVELOPE DE BUCKET. Nunca o tick, nunca a célula com envelope completo.**

### D1 · Duas rotas, por classe de tempo — e nenhuma delas é do fornecedor

| classe | transporte | por quê |
|---|---|---|
| **histórico** (viewport fechado, `COMO EM T`, replay) | **HTTP, resposta endereçável por conteúdo** — chave `(series_key_id, symbol, interval, janela, knowledge_time, bar_policy)` | é imutável por construção: `knowledge_time` fixo ⇒ a resposta é cacheável para sempre, e o cache **é** o `knowledge_time` |
| **borda direita do tempo** (`AO VIVO`) | **SSE**, um fluxo por sessão, carregando **envelope de bucket** | unidirecional, reconecta sozinho, atravessa proxy. **Não precisamos de canal do browser para o servidor** — a superfície não age (S4 não tem um botão com verbo por linha) |

**`nenhuma superfície chama endpoint de exchange direto`**, inclusive `OI (agora)`, que é série ingerida como qualquer outra — senão os quatro campos do selo ficam impreenchíveis.

### D2 · O envelope de bucket parcial, e a cláusula que o desambigua

```
( bucket_open_ts, cvd_delta_parcial, last_price, n_trades, seq )   a   max(1 Hz, 1/TF)
```

**E a resolução EXIBIDA da idade nunca é mais fina que `1/f`.** Sem essa cláusula, *"barra parcial a 40% de opacidade"* é ambíguo entre 1 msg/s e 3.468 msg/s de pico — e a tela estaria afirmando uma precisão que o transporte não entrega.

`seq` é **monotônico por fluxo** e existe para o cliente detectar lacuna de transporte **sem** inferir do relógio.

### D3 · O içamento é o mecanismo de custo, e ele é contratual

| nível | carrega | frequência |
|---|---|---|
| **sessão** | fuso, `agora`, modo `AO VIVO`/`COMO EM T`, versão do bundle, `env`, `principal_id` | 1× por tela |
| **painel** | `SeriesKey`, `source`, `unit`, `denom`, `provenance`, `label_shift`, universo, `n lido / n esperado` | 1× por painel |
| **célula** | `( valor \| ausência, event_time, available_at )` + referência à coluna | por ponto |

**O invariante de tipo se preserva porque a célula continua sem construtor a partir de `number`** — o barateamento não abre a porta única que `SPEC-001` §3.6 fechou.

### D4 · `bar_policy` é declarado pelo CONSUMIDOR, na requisição

O transporte **não escolhe**. Um cliente que peça `final_only` **não recebe** o bucket em formação; um que peça `intrabar` recebe com `is_final = false`. **`intrabar` nunca é default**, e o servidor **não** infere de "é a borda direita".

## Alternativas recusadas

| alternativa | por que |
|---|---|
| **WebSocket de tick para o browser** | 3.468 msg/s de pico num símbolo. Não é decisão de conforto: a tese declarada **não usa micro-tick**, logo o custo compraria uma capacidade que o produto não exerce |
| **WebSocket bidirecional em vez de SSE** | não há mensagem do browser para o servidor no escopo desta fase — as superfícies são de **leitura e marcação**, e marcação é HTTP com corpo. Um canal bidirecional é superfície de ataque e complexidade de reconexão sem consumidor |
| **Polling do gráfico** (o cliente pergunta a cada N s) | a cadência honesta é a do **fechamento do bucket**, que o servidor conhece e o cliente não. Polling faz o cliente **adivinhar** o instante em que o dado nasce, e adivinhar errado é exatamente `idade` errada |
| **Envelope completo por célula** | **9,6×** medido, 1.733 KB contra 180 KB numa tela. E o envelope repetido por célula é a forma de o mesmo `SeriesKey` ser afirmado 3.420 vezes por tela, o que não é informação |
| **Empurrar tick e agregar no cliente** | duas implementações da agregação (cliente e motor) ⇒ **tela e motor discordam sobre o que aconteceu**, que é o modo de falha que a grade compartilhada existe para impedir |

## Falsificador

**Se a taxa de mensagens que chega ao browser exceder `max(1 Hz, 1/TF)` por série, ou se qualquer payload de transporte contiver campo de nível de tick** (`agg_id`, `price` por trade, `quantity` por trade), **esta ADR está violada** — e a violação é observável no próprio browser, sem instrumentação especial.

**Segundo falsificador, e ele derruba D1 e não a ADR toda:** se o eixo do Lightweight Charts **não sustentar 288 pontos + 1.440 candles no mesmo eixo em tempo de parede** (`[NÃO MEDIDO]`, declarado o **maior risco técnico desta especificação**), o problema deixa de ser transporte e passa a ser **quanto o servidor tem de reduzir antes de enviar** — o que muda o contrato de D3, não a rota de D1. **Teste: as coordenadas X batem com os `event_time` originais com tolerância de 0,5 px.**

## Consequência

- Idade só na **borda direita do tempo**: se `viewport_fim < agora − cadência_nativa`, o chip de idade é substituído pelo rótulo absoluto da janela. **Um gráfico de 3 dias tem zero carimbos de idade, e isso está certo.**
- **`avaliacao:A3` continua requisito e é outro item:** `/futures/data/*` responde `200` com **zero headers `x-mbx-*`** e a Coinalyze **também não traz header de cota** ⇒ **dois dos três baldes são cegos**, e o cego que importa é o do screener. **Contagem local conservadora não é adaptação a um fornecedor pior — é o caso geral**, e a rampa até o primeiro 429 é a única forma de conhecer dois deles.

---

# ⚠️ Emenda de 2026-09-03 — `quant-architect` · fecha `A4` (fronteira de PROCESSO) e decide `A5` (schema da RESPOSTA)

**Nenhuma linha acima foi apagada.** `D1`–`D4` decidiram o **PROTOCOLO** (HTTP endereçável por conteúdo
para histórico, SSE para a borda direita, envelope de bucket, `bar_policy` do consumidor) e são **omissas
em duas coisas que o protocolo não determina**: **onde o handler roda** e **qual é a forma da resposta**.
As duas omissões foram medidas pelo parecer
[`gates/consulta-fronteira-web-2026-09-03.md`](../context/plataforma-dados/gates/consulta-fronteira-web-2026-09-03.md)
(§`P2`(b), §`P3`) e enumeradas ali como `A4` e `A5`.

> ⚠️ **Namespace:** `ADR-005/D5` e `ADR-005/D6` **não são** `D5.8`/`D5.12` — aqueles são **DoD da fase
> `05`** do plano (`docs/plans/SPEC-001-plataforma-dados/05_fatia_visivel.md`), outro espaço de nomes.
> Onde a ambiguidade importar, escreva `ADR-005/D5` com o prefixo.

## D5 · A porta de leitura é o backend. `Next` não é segunda verdade

`[DECISÃO-OWNER: 2026-09-03, escolha entre alternativas apresentadas]` — registrada em
[`docs/decisoes-do-owner.md` §`2026-09-03 · A4/A6/A7`](../decisoes-do-owner.md). **Esta ADR não decidiu
`A4`; ela a registra.** O rótulo **não** é `[PREMISSA-OWNER]`: o owner escolheu uma opção de um menu que
um agente redigiu, com o custo de cada uma declarado, e nenhuma frase desta seção é fala dele.

**O que foi escolhido:** o **backend** (FastAPI) serve as **duas** rotas de `D1`. O `Next` **renderiza**
e, se precisar, **proxia sessão/auth apenas — zero SQL, zero regra de domínio, zero subprocess.**

**E "zero subprocess" tem um caso concreto a que ela se aplica hoje**, para a regra não nascer abstrata:
`frontend/src/features/s1-console/ingest-health-query.ts:343-347` **hospeda um programa Python de 3
linhas dentro de um módulo TypeScript de produção** (`HOSTED_SCRIPT`), invocado por `spawnSync` (:369).
Sob `D5` isso não tem futuro de produção — não porque é feio, mas porque `spawnSync` não existe em
browser e o handler deixou de ser do lado `Next`.

**Alternativas recusadas, com o custo que estava no menu do owner** (citado do registro dele):

| recusada | custo declarado |
|---|---|
| **BFF em Next Route Handler** | *"reabre a porta de segunda verdade que o `M3` está fechando, e o schema passa a existir em dois lugares"* |
| **serviço Python separado** (container próprio) | *"força o componente `infra` (`ADR-009/D5`) e um container novo numa VPS já com 6 serviços sob pressão de disco"* |
| **CLI por `spawnSync` do lado do front** (o caminho vivo hoje) | contradiz a aresta `API --> WEB --> CH` de [`arquitetura-fluxos.md:78`](../arquitetura-fluxos.md); `spawnSync` não existe em browser ⇒ **aquele caminho nunca viraria produção** |

⇒ **O componente `infra` NÃO nasce por esta emenda.** `ADR-009/D5` continua **aberto e é ato do owner** —
`D5` apenas **não o exige**; não o resolve.

**Estado da porta no dia da emenda, medido:**

```bash
grep -rniE 'fastapi|uvicorn|flask|APIRouter' backend/pyproject.toml backend/src --include='*.py' --include='*.toml' | wc -l   # 0
```

`[MEDIDO 2026-09-03 em 8c002e4, n=0 ocorrências]` — a porta que `D5` declara **ainda não existe em
código**. `D5` é a decisão de **onde ela nasce**, não o atestado de que nasceu.

## D6 · O schema da RESPOSTA: **LINHAS OBJETO (rows) em envelope JSON tipado. A projeção canônica NUNCA é formato de transporte**

**Esta é decisão de arquiteto, não do owner** — `A5` estava `[NÃO SEI]` e o parecer nomeou `ADR-005` como
dona por omissão. Decidida aqui.

### D6.0 · A regra geral, e é a resposta direta a `A5`

**Nenhuma rota de leitura serve TEXTO canônico.** Toda resposta é **JSON estruturado**. A *projeção
canônica* (`JSONL` com linha de cabeçalho, marcadores de seção e `ensure_ascii=True`) continua existindo
e continua sendo o contrato de bytes de `ADR-008` — mas ela é **função DERIVADA das linhas, calculada nas
duas pontas**, e **não** o corpo da resposta.

### D6.1 · `A5` fala de DUAS famílias de rota, e conflatá-las é o erro que esta cláusula evita

| família | consumidor | envelope |
|---|---|---|
| **registro de F0** — `ingest_health_query` | console **S1** (`web`) | `{ query, n_runs, n_gaps, runs[], gaps[] }`, onde cada `run` carrega **exatamente as 15 colunas de `ADR-008/D3`** e cada `gap` as **8 colunas de `md.ingest_gap`**, nome de fio `class` (nunca `gap_class`) |
| **histórico de SÉRIE** — a rota de `D1` | `charts` | **já decidido por `D3`**: o içamento sessão/painel/célula. `D6` acrescenta só *"rows, não texto"* e `D6.3` |

**Colunas de mais NÃO cruzam o fio.** `IngestRun` tem 17 campos
(`backend/src/modules/sentimento/domain/ingest_record.py:100-117`); a projeção de `ADR-008/D3` fixa **15**
— `started_at`/`ended_at` são **colunas de tabela, não de projeção**, e o lado TS já registra isso
(`ingest-health-query.ts:463-466`). Servir a linha crua de 17 campos serviria campos que **nenhuma ADR
fixou** e tornaria o `sha256` não-derivável do payload sem um passo de descarte que nada declara.

### D6.2 · A ordem das chaves NO FIO é irrelevante para o `sha256`, e isso é a propriedade, não um efeito colateral

Os dois lados **re-projetam** as linhas sobre a tupla de colunas antes de hashear —
`_project_run`/`_project_gap` (`ingest_record.py:181-200`) e `projectRun`/`projectGap`
(`ingest-health-query.ts:200-234`), que **iteram a ordem do contrato, não a ordem do objeto recebido**.
⇒ o contrato de bytes fica **na projeção** (onde `ADR-008/D3` o pôs) e **não no transporte**. Um
serializador HTTP, um proxy ou um framework que re-emita o JSON **não move a impressão digital**.

### D6.3 · A impressão digital viaja FORA da região hasheada — `ETag`, nunca dentro de `runs[]`

Um hash dentro da própria entrada **não pode ser reproduzido por ninguém**. Logo: `fingerprint` vai no
`ETag` HTTP (ou em campo do envelope), e a **região hasheada é exatamente `runs[]` + `gaps[]`** mais o
cabeçalho/marcadores que a canonicalização gera. Ganho concreto: torna barata a recusa byte-a-byte que
`HistoryResponseCache.set` já implementa (`frontend/src/app/history-transport.ts:225-240`) — *"duas
respostas distintas para a MESMA chave são a evidência de que essa premissa quebrou"*.

### D6.4 · **A canonicalização e o `fingerprint` são código de Python e de Node — NUNCA do caminho de render do browser.** É esta cláusula que mantém o falsificador de `DoD-2` SÍNCRONO

**O achado, que nenhum documento, gate ou handoff registrava antes de 2026-09-03:**

> `createHash("sha256")` de `node:crypto` é **SÍNCRONO** (`ingest-health-query.ts:73,262-264` —
> `export function fingerprint(…): string`). O equivalente de browser, `crypto.subtle.digest`, é
> **ASSÍNCRONO** `[DOC: Web Crypto API — `SubtleCrypto.digest()` devolve `Promise<ArrayBuffer>`]`.
> ⇒ no browser, `fingerprint` vira `Promise<string>`, e com ele `canonicalProjection`, os `fetch*`, e a
> cadeia até `buildS1ViewModelFromIngestHealthProjection` (:488) e `S1Console.tsx`. **O falsificador de
> `ADR-008/DoD-2` ficaria ASSÍNCRONO** — não é troca de import, é **mudança de forma no instrumento que
> prova a ADR**.

`D6.4` **remove o gatilho em vez de pagar o custo**, e hoje isso custa **zero refatoração** — medido:

```bash
# importadores de ingest-health-query.ts FORA do proprio modulo e fora de teste:
grep -rn 'from "\(\.\.\/s1-console\/\|\.\/\)ingest-health-query\.ts"' frontend/src \
  --include='*.ts' --include='*.tsx' | grep -v '\.test\.' | wc -l                    # 3
# quantos desses sao `import type` (apagado em tempo de compilacao, zero aresta em runtime):
grep -rB1 'from "\(\.\.\/s1-console\/\|\.\/\)ingest-health-query\.ts"' frontend/src \
  --include='*.ts' --include='*.tsx' | grep -c 'import type'                          # 3
```

`[MEDIDO 2026-09-03 em 8c002e4, n=3 importadores]` — **3 de 3 são `import type`** (`s3-inspector/
{fixtures,domain,view-model}.ts`, e `S1Console.tsx` importa só `S1ViewModel`) ⇒ **hoje não existe
nenhuma aresta de runtime do bundle de browser para dentro deste módulo.** Declarar a fronteira agora é
grátis, e o preço é monotonicamente crescente depois.

⚠️ **`[NÃO SEI]`, e o dono não sou eu:** se o owner quiser a impressão digital **EXIBIDA/verificada na
tela** (um selo de integridade que o operador vê), `crypto.subtle` é inevitável e o falsificador **fica
assíncrono**. Isso é decisão de **produto** (*o operador vê o selo?*) — **dona: owner**, e esta emenda
não a antecipa. O segundo caso de `createHash` no front, `frontend/src/app/threshold-spec-bundle.ts:36,371`,
é **outra dona** (o bundle-URL de `SPEC-001` §7), fica declarado e não decidido aqui.

## O efeito em `ADR-008/DoD-2` — o critério NÃO é reescrito, e passa a falsificar o que o texto dele afirma

`DoD-2` pede *"`sha256` da projeção canônica da saída do CLI **igual** ao `sha256` da projeção da
**resposta que alimenta S1**"* (`ADR-008/D4`). **Nada nessa frase precisa mudar** — e o universo dela
(*"mesmo `md.ingest_run` congelado como fixture, ≥ 1 run de cada `verdict` existente"*) fica intacto. O
que muda é **de onde vem a projeção do lado S1**: hoje é o `stdout` do CLI por `spawnSync` (:399); sob
`D5`+`D6` é o **envelope HTTP**. *"A resposta que alimenta S1"* **sempre foi a resposta HTTP** — o
`stdout` era o substituto, porque rota não existia.

**E o critério fica MAIS FORTE, o que é o argumento dirimente de `D6` sobre a alternativa recusada:** o
parecer corrigiu o enunciado de `DoD-2` em §`P1(a)` — hoje há *"uma leitura e uma reconstrução"*, porque a
entrada do lado TS **já é o `stdout` canonicalizado do CLI**, e os dois fluxos de bytes têm **ancestral
comum**. Sob `D6` a entrada do lado TS é um envelope produzido por um **serializador diferente**
(`json` de Python / FastAPI) a partir das mesmas linhas do store, e o TS re-projeta e re-hasheia ⇒ os dois
fluxos passam a compartilhar **só o ESTADO, não a serialização**. **É a primeira vez que o `sha256` de
`DoD-2` compara duas serializações independentes** — que é o que o texto dele sempre afirmou.

⚠️ **O que `D6` OBRIGA `ADR-008` a olhar, e não é ato desta ADR:** `DoD-1` (*"existe exatamente UMA
definição de `ingest_health_query`"*, por `forbidden-regex` **com corpus**) ganha um **candidato novo a
"segunda definição": o handler FastAPI.** Se o handler fizer SQL próprio em vez de chamar
`ingest_health_query(source)` (`backend/src/modules/sentimento/use_cases/ingest_health.py:32`), `D3` é
violada **na forma exata que a ADR nomeia** — *"F3 reimplementa o mesmo registro"*. Se a regra própria e o
corpus de `DoD-1` alcançam um *route handler* Python é decisão de **`ADR-008`** e item de plano da fase
`05`. `[NÃO SEI]` — **dona: `ADR-008/D4`**, não esta emenda.

## Alternativas recusadas em `D6` — e a contagem de linha NÃO decide, o que é preciso dizer

**Universo:** `wc -l frontend/src/features/s1-console/ingest-health-query.ts` → **500 linhas**; a região
que o parecer chamou de *"~250 linhas reféns"* é **92-312 (221) + 471-500 (30) = 251**
`[MEDIDO 2026-09-03: awk 'NR>=92 && NR<=312' … | wc -l → 221; awk 'NR>=471 && NR<=500' … | wc -l → 30]`.

| alternativa | linhas TS que vivem | custo que a recusa evita |
|---|---|---|
| **`D6` — rows em envelope JSON** (escolhida) | **92-265 (174) + 471-500 (30) = 204 de 251 (81,3%)**; morrem 266-312 (**47**: `SectionMarker`, `isHeaderLine`, `parseCanonicalProjection`). **Sobrevivem também as 50 linhas de `history-transport.ts:247-296`** (`TICK_LEVEL_FIELD_NAMES` + `assertNoTickLevelFields`), que só operam sobre payload decodificado ⇒ **204 + 50 = 254** | — |
| **projeção canônica como corpo `text/plain`** (recusada) | **251 de 251** naquele arquivo (**+47**), mas as **50** linhas do falsificador de `ADR-005` no cliente passam a **depender de um parser de texto rodar primeiro** ⇒ **251 + 0** | (i) o `sha256` passa a ser dos **bytes do fio** — qualquer re-serialização no caminho o move **em silêncio**, e o hash falha **sem nada apontar o transporte como causa**; (ii) `assertNoTickLevelFields`, cuja própria docstring diz *"percorre QUALQUER payload JSON decodificado… deliberadamente agnóstico de schema"*, deixa de se aplicar à resposta **direto**, e o parser de que ela passa a depender **não valida nada em runtime** (`parsed as IngestHealthRunRow`, :308-311, é *cast* de tempo de compilação); (iii) a rota vira **subprocess com URL** — *"resposta endereçável por conteúdo"* degrada para *"`stdout` endereçável"* |
| **linha crua do store (17 campos)** (recusada) | — | campos que `ADR-008/D3` nunca fixou cruzam o fio; o `fingerprint` deixa de ser derivável do payload sem um descarte que nada declara; **duas formas para um contrato** |
| **servidor manda o `fingerprint` e o cliente confia** (recusada) | — | é exatamente a **vacuidade** que o parecer nomeou em §`P1(a)`: `DoD-2` compararia **um número consigo mesmo** |

**⚠️ Leia a coluna do meio com desconfiança: 254 contra 251 é EMPATE dentro do ruído.** A decisão **não se
apoia** em contagem de linha — se apoiasse, seria arbitrária. Ela se apoia em **três** coisas: (1) `DoD-2`
passa a comparar duas serializações independentes; (2) o contrato de bytes fica na projeção, não no fio,
onde um proxy não o alcança; (3) `D6.4` mantém o falsificador **síncrono**.

## Falsificador da emenda — `D5` e `D6`, com baseline medido hoje

| # | falsifica | comando | hoje | tem de ser |
|---|---|---|---|---|
| **F-D5-1** | `D5` (*zero subprocess no front*) | `grep -rn 'node:child_process\|spawnSync' frontend/src --include='*.ts' --include='*.tsx' \| grep -v '\.test\.' \| wc -l` | **2** (1 arquivo: `ingest-health-query.ts`) `[MEDIDO 2026-09-03]` | **0** depois de a rota de `D5` servir. Se continuar ≥ 1 com a rota de pé, **`D5` está violada** |
| **F-D5-2** | `D5` (*zero SQL no front*) | `grep -rniE 'better-sqlite3\|sqlite3\|psycopg\|SELECT [^;]*FROM ' frontend/src --include='*.ts' --include='*.tsx' \| grep -v '\.test\.' \| wc -l` | **0** `[MEDIDO 2026-09-03]` | **0**, e este é o único dos quatro que já nasce satisfeito — logo ele mede **erosão**, não conquista |
| **F-D6-1** | `D6` inteira, e **é o teste de `DoD-2`** | sobre o MESMO fixture: `IngestHealthReport.fingerprint()` (Python) `==` `fingerprint(rows do envelope servido)` (TS), com **controle negativo obrigatório** — reordenar as 15 colunas na rota **tem de** mover o `sha256` e reprovar. Mesmo par positivo/negativo que `ingest-health-query.test.ts:166,192` já faz | `[NÃO MEDIDO]` — a rota não existe | **igual no positivo, DIFERENTE no negativo.** Igual nos dois é `DoD-2` vacuoso de novo |
| **F-D6-2** | `D6.3` (*região hasheada definida*) | acrescentar um campo **no envelope** e um campo **dentro de `runs[]`**, sobre o mesmo fixture | `[NÃO MEDIDO]` | o do envelope **NÃO** move o `sha256`; o de dentro de `runs[]` **MOVE**. Se os dois se comportarem igual, **a região hasheada não está definida e `D6.3` está violada** |
| **F-D6-3** | o **escopo** de `D6` | se a rota precisar servir algo que a projeção de 15 colunas não expressa — paginação, cursor, ou série de bucket que não é `ingest_run` | — | então `D6.1` foi declarada para a **família errada** de rota, e a linha certa da tabela de `D6.1` é a de **`charts`**, cujo envelope é o içamento de `D3` — não uma terceira forma inventada no handler |

## Consequência da emenda

- **`A5` deixa de bloquear `A1`–`A3`.** A ordem que o owner registrou (*"`A4`→`A5` **antes** de
  `A1`–`A3`"*) está cumprida do lado da decisão. **`D6` NÃO decide `A1`–`A3`** e não os condiciona mais:
  a paridade Python⇄TS dos **9 ports sem testemunha cruzada** (`A1`), o *delisting badge* (`A2`) e
  `bigint`×`Decimal` (`A3`) seguem abertos, dono `quant-architect`, gatilho de `ADR-003/D2` **já
  disparado**. O que `D6` faz é **fixar o padrão que `A1` vai ter de generalizar**: paridade se prova por
  **re-projeção independente + `sha256` sobre fixture congelada**, que é a única das 10 pontes que hoje
  tem testemunha executável (**1 de 10** `[MEDIDO 2026-09-03, parecer §P1(b)]`).
- **`D5.8` da fase `05`** (*"nenhum tick chega ao browser"*) continua um DoD **negativo** — o parecer
  mediu que ele é satisfazível sobre payload que ninguém serve, e foi assim que `5.12` fechou sem
  servidor. `D6` dá **sujeito** ao predicado: com envelope estruturado, `assertNoTickLevelFields` opera
  sobre a resposta real, e o DoD deixa de passar no vácuo. **Corrigir o enunciado de `D5.8` é ato do
  plano `05`**, não desta ADR.
- **Governança:** `D6` fixa **schema de transporte**, e schema de transporte **não é decisão de UI** — o
  que só é seguro porque `A6` já tirou `web.architect` do `ui-designer`
  `[DECISÃO-OWNER: 2026-09-03]`. **Materializar `A6` em `[agents.by_component]` é ato subsequente**, não
  desta emenda.
