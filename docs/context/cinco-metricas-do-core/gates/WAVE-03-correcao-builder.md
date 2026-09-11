# Correção da wave `03` — bloqueio do QA + `C1`–`C4` do `quant-architect`

`frontend-builder`, 2026-09-11, sobre `wave/03-producao-e-janela-deslizante`.
Entradas: [`QA-wave-03.md`](QA-wave-03.md) (`NEEDS_FIX`, 1 bloqueio) e
[`WAVE-03-janela-deslizante-quant-architect.md`](WAVE-03-janela-deslizante-quant-architect.md)
(`APROVADO COM CONDIÇÃO`, `C1`–`C4`). ⛔ **Nada foi semeado** — toda medição contra a stack viva é
`GET` por `curl`/`fetch`; o `psql` de percentis foi **recusado pelo ambiente** e está declarado em §2.

---

## 1. ⛔ O BLOQUEIO — Playwright volta de `0` para `24`, e sem semear o Postgres

```
ANTES  $ cd frontend && npx playwright test --list   →  Total: 0 tests in 0 files
                                                        (SyntaxError: … does not provide an
                                                         export named 'RANGE_END_MS_EXCLUSIVE')
DEPOIS $ cd frontend && npx playwright test --list   →  Total: 24 tests in 8 files
```

`24`, não `21+3`: os `21` de `e2e/0[1-7]` voltaram a ser alcançáveis **e** `08` colabora com `3`.

**O que mudou em `e2e/08-symbol-dado-real.spec.ts`, e não foi só trocar o import:**

1. **A janela deixou de ser importada e passou a ser LIDA DA PÁGINA.** `SymbolClient.tsx` publica
   no elemento raiz `data-window-start-ms` / `data-window-end-ms-inclusive` /
   `data-knowledge-time-ms` — os três instantes do request que o **servidor** usou naquele render.
   É mais forte do que importar a constante: não há corrida de relógio entre os dois processos e
   não há constante para envelhecer uma segunda vez.
2. **⛔ `seedSeriesRow` DELETADO — zero `INSERT`, zero `psql`, zero `docker` no arquivo.**
   `tasks.toml:226` (`[P-seed]`) proíbe, e o motivo já aconteceu (dado sintético vazou para a tela
   real do owner). O arquivo inteiro não contém mais a palavra `INSERT`.
3. **O que ele assere agora, e por que não é mais fraco.** O falsificador vira **concordância
   DOM ↔ API sobre a MESMA janela** — que é exatamente o defeito que a fase `04` de
   `pagina-de-grafico-s2` teve de achar EM USO AO VIVO porque nenhum teste comparava as duas
   superfícies. Não precisa de linha plantada; precisa das duas superfícies confrontadas.

**E ele foi RODADO VERDE contra um app real desta wave** — não só coletado:

```
$ npx next build && npx next start -p 3111        # INGEST_HEALTH_API_BASE_URL=http://localhost:8000
$ E2E_BASE_URL=http://localhost:3111 npx playwright test e2e/08-symbol-dado-real.spec.ts
  3 passed (41.7s)

  volume_dom_present_points   = 833   ==  volume_api_rows_with_value = 833
  volume_last_reading_text    = "Leitura atual: 1121.506"  ==  API no último instante de grade
  volume_readable_horizon_fact= "volume_readable_horizon:833/5760"
  klines_last_api_has_value   = false  →  DOM: "Leitura atual: SEM_PONTO"   (RN-1, não `0`)
  sum_open_interest_api…      = false  →  DOM: "Leitura atual: SEM_PONTO"
```

⚠️ **Contra o `deploy-web-1` de hoje os 3 REPROVAM, e isso é correto:** aquele container serve um
build **anterior a `T-01.7`** (`curl http://localhost:3000/symbol | grep price-pane-volume-subaxis`
→ nada). O spec **não** foi transformado em `skip` nesse caso — um spec que pula em silêncio
quando o deploy está velho é o sinal `0 tests` com outra roupa. Ele falha com a mensagem
*"a página não declara o próprio request … build anterior a esta wave?"*.

⚠️ **Um módulo novo, e ele existe por causa do `jsdom`:** `src/app/symbol/series-key-id.ts`.
`computeSeriesKeyId` estava em `view-model.ts`, que importa o barril de `charts` → `s2-headless-run`
→ `jsdom`, e **isso derruba a coleta inteira do Playwright** (`Error: module is not linked`,
medido). Extraído para um módulo que importa `node:crypto` e um TIPO, nada mais; `view-model.ts`
**reexporta**, então nenhum chamador mudou. A alternativa (re-hashear a chave dentro do spec) foi
recusada: um id errado responde `200` com grade toda ausente, ou seja, **falha em silêncio**.

## 2. `C2` — a alegação falsa saiu, e a margem foi redimensionada contra `n=804`

**(a) A alegação de `R-1` foi REMOVIDA** de `request-window.ts` e de `s2-window.ts`, com o motivo
escrito no lugar dela: `R-1` é `available_at <= t` com `t` = **instante de grade**
(`as_of_accessor.py:37,311`), logo recuar a borda move `t` e a barra juntos e **nenhum valor** de
`RIGHT_EDGE_LAG_MS` transforma um `SEM_PONTO` em número. O que ele compra está escrito em três
itens (`422`, `knowledgeTimeMs < now`, skew), e **nenhum** deles se dimensiona pelo atraso.

**(b) `KNOWLEDGE_TIME_LAG_MS`: `1 min` → `4 min`.** Tolerância de **120 s → 300 s** contra o
**máximo medido de 267 s** (`n=804`, classe *ao vivo*) ⇒ margem **`0,45× → 1,12×`**.

⛔ **NÃO os `>= 300_000` que o gate sugeriu, e o motivo é aritmético:**
`knowledgeTimeMs = endMsExclusive + K` com `endMsExclusive <= nowMs − RIGHT_EDGE_LAG_MS`, então
`K >= RIGHT_EDGE_LAG_MS` produz `knowledgeTimeMs === nowMs` **exatamente** quando a leitura do
relógio já está alinhada a 5 min — pedir sobre o instante presente, que é o `422` que o próprio
recuo existe para evitar. `4 min` é o maior valor redondo que mantém **60 s** de folga de skew, e o
custo está declarado: a folga cai de 4 min para 1 min. Há um teste `MORDE` sobre o instante
**alinhado**, que é o único que uma escolha aleatória de `nowMs` não veria.

**(c) `MEASURED_PUBLICATION_LAG_MS = 14_000` morreu.** O teste importa
`LIVE_PUBLICATION_LAG_MAX_MS = 267_000` do módulo sob teste — o número deixou de ser uma **cópia da
mesma amostra** que dimensionou o código, que é a definição de um teste que passa por construção.

**Falsificador, rodado:** `KNOWLEDGE_TIME_LAG_MS` de volta para `ONE_MINUTE_MS` ⇒
`npm --prefix frontend run test:app` → **155 pass / 1 fail** (*"the as-of margin covers the LIVE
publication tail (n=804)…"*). Revertido; 156/156.

⚠️ **`[NÃO MEDIDO nesta sessão]`, e registrado em vez de maquiado:** os percentis `p50`/`p99` da
classe ao vivo. O `docker exec … psql` do gate foi **recusado pelo ambiente desta sessão**, então o
dimensionamento usa o **máximo** (`267 s`), que é a ponta conservadora. Os dois números (`n=804`,
`máx 267 s`) vêm do SQL citado em `ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md`, transcrito na docstring.

⚠️ **E uma discordância declarada, não escondida:** o gate calcula a tolerância como `180 s`
(contando de `bucket_end` dois minutos antes da borda); a docstring e o teste contam do **instante
do readout**, um passo de grade mais apertado, dando `120 s`. Fica o **mais apertado**. Ainda mais
fundo, e escrito no código: para a barra do último instante de grade **`R-1` morde antes** de
`observed_at <= knowledge_time`, e `R-1` é invariante sob as duas constantes ⇒ uma linha com atraso
maior que um passo de grade **não é escondida pelo request**, ela simplesmente ainda não era
sabível — ausência REAL (`RN-1`), e o readout imprime `SEM_PONTO` com razão.

## 3. `C3` — `lastGridInstant` em `charts`, e o falsificador do gate virou PORTÃO

`frontend/src/charts/s2-window.ts` ganhou `lastGridInstant(window, gridMs)`, reexportado pelo
barril (`ADR-034/D8`), com a guarda `(endMsExclusive − startMs) % gridMs !== 0 → RangeError`.
⛔ **Nenhum campo `endMsInclusive` em `S2Window`** — recusado pelo motivo do gate, e o teste
mostra o erro que ele teria: `lastGridInstant(w, FIVE_MINUTES_MS) + 4min === lastGridInstant(w, 1m)`,
os **4 minutos** que um campo derivado de `alignmentMs` teria comido em silêncio.

**O segundo call-site foi eliminado por CONSTRUÇÃO, não por disciplina:** `S2Panels` deixou de
carregar `rangeStartMs`/`rangeEndMsExclusive` soltos e passa a carregar `window: S2Window`
(sugestão do próprio gate) ⇒ `SymbolClient.tsx` chama `lastGridInstant(panels.window, ONE_MINUTE_MS)`.

**Falsificador do gate, literal:**

```
$ grep -rn -- "- ONE_MINUTE_MS" frontend/src/app | grep -v test                       # 2 → 0
$ grep -rn -- "- ONE_MINUTE_MS\|rangeEndMsExclusive -\|endMsExclusive -" \
    frontend/src/app | grep -v '\.test\.'                                             # 2 → 0 (rc=1)
```

E ele **deixou de ser prosa**: `frontend/src/app/symbol/bucket-arithmetic-boundary.test.ts` roda
essa varredura sobre todo módulo de produção do diretório (mais `Math.floor(` e
`alignToTimeframeStart`), com `MORDE` (as duas linhas originais replantadas), `CALA` (a forma
sancionada não dispara) e uma companheira contra a prova-de-ausência vazia (*"um diretório vazio
passaria"*).

**Falsificador rodado:** `windowEndMsInclusive: window.endMsExclusive - ONE_MINUTE_MS` replantado ⇒
`test:app` → **154 pass / 2 fail**. Revertido; 156/156.

## 4. `C1` — o alinhamento está registrado onde a decisão é tomada

`request-window.ts`, no argumento `alignmentMs` da chamada: uma borda alinhada a 5 min cai na grade
de **15m em 33,3%** das leituras de relógio, **1h em 8,3%**, **4h em 2,1%** (`n=1440`), com a
consequência nomeada — *a janela continua válida, quem fica cortado são os extremos*, que é
justamente o erro silencioso.

## 5. `C4` — horizonte declarado na tela, citação corrigida, e o vão INTOCADO

- **Citação:** `s2-window.ts:33/55` e `s2-window.test.ts` deixam de atribuir os 4 dias a
  `ADR-034/D8` (que é a **fronteira** `charts`↔`web`, `ADR-034:177`) e passam a citar
  **`PRD-006 §2`/item `5.1`**, como está em `ADR-034:127` (*"4 dias, painéis Preço+OI+CVD"*).
- **Horizonte na tela:** `firstPresentSlotMs` (`view-model.ts`) + `ReadableHorizon`
  (`SymbolClient.tsx`) imprimem **"Dado legível desde `YYYY-MM-DD HH:MM UTC` — `N/M` grades de 1
  min na janela"**, com `data-fact="volume_readable_horizon:N/M"` e `data-readable-since-ms`.
  Ao vivo, agora: **`833/5760`, desde `1789090800000`**.
- ⛔ **O vão NÃO encolheu** — `S2_WINDOW_SPAN_MS` continua 4 dias, e há assert de que a camada de
  render sequer **nomeia** a constante do vão.
- ⚠️ **A REDAÇÃO e o lugar da frase são FORM**, portanto do `ui-designer` com o veredito do
  `ux-ui-mastery` (`T-01.8`). O que um builder decidiu aqui é que o **fato** está na tela e é
  legível por máquina; a frase é placeholder sóbrio e está marcada como tal no código.
- **Falsificador rodado:** `data-readable-since-ms` removido ⇒ `test:app` **155/1 fail**. Revertido.

## 6. Avaliação pedida — levar `frontend/e2e/` para dentro de `lint-frontend`

**Recomendo SIM para o `tsc`, com número; e SIM com ressalva para o ESLint. ⛔ Não decidi — não é
meu componente (`Makefile`/`scripts/verify.sh`), e vai como proposta.**

| medição | comando | resultado |
|---|---|---|
| custo de incluir `e2e` no `tsc` **hoje** | `tsconfig` com `"e2e/**/*.ts"` no `include` → `npx tsc -p … --noEmit --strict` | **0 erro** |
| ele teria pego ESTE bloqueio? | mesmo `tsc`, com o import antigo replantado | **`error TS2305: Module '"../src/charts/s2-panels.ts"' has no exported member 'RANGE_END_MS_EXCLUSIVE'`** |
| custo de `eslint src e2e` hoje | `npx eslint e2e` | **1 erro** — `no-console` em `e2e/helpers.ts:28` (pré-existente) |

⇒ o `tsc` custa **uma linha de `include` e zero erro novo**, e transforma exatamente a classe de
quebra que hoje é **invisível ao portão** (`lint-frontend` nunca olhou para `frontend/e2e/`) em
reprova. O ESLint exige antes uma decisão sobre `helpers.ts:28` (consertar ou dar `override` ao
diretório de e2e) — e `override` de regra é a classe de coisa que **não** é minha para decidir.

## 7. Portões

| portão | resultado |
|---|---|
| `make verify` | **VERDE, 6/6** — `lint-backend rc=0` (413) · `lint-frontend rc=0` · `test rc=0` **2.120 passed, 96,96%** · `boundaries rc=0` (7 kept/0 broken) · `regras rc=0` (**0 bloqueio**, 66 avisos — mesmos 66 do QA) · `política rc=0`. Log: `/tmp/verify-agent-aef5c396ac36ef9f0-20260911T154844Z.log` |
| `harness rules --mode sweep --changed-only` | `rc=0`, **nenhum achado** nos arquivos alterados |
| `npm --prefix frontend run test:charts` | **179/179** (era 176 — `+3` de `lastGridInstant`) |
| `npm --prefix frontend run test:app` | **156/156** (era 148 — `+8`: `C2`, `C3`, `C4`, horizonte) |
| `npm --prefix frontend run test:s3` | **111/111** |
| `npx playwright test --list` | **24 tests in 8 files** (era `0 in 0`) |
| `npx playwright test e2e/08…` contra app real desta wave | **3 passed** (§1) |

⚠️ **`npm --prefix frontend run test:s1` → 97 pass / 8 fail, e as 8 são AMBIENTAIS, não minhas.**
Causa medida: o servidor Python de fixture aborta com
`StoreParentDirectoryMissingError: series quarantine store parent directory does not exist: data/md`
— e `data/md` **não existe nem no checkout principal** (`ls /…/cripto-strategy/data/md` → não
existe). Diff meu não toca `src/features/s1-console/`. Registrado porque medição que não produziu
veredito não vira `OK`. ⚠️ Esta suíte **não está em portão nenhum** (`grep -rn 'node --test'
scripts/verify.sh Makefile .git/hooks/pre-push` → 0 linhas), o que continua sendo verdade e
continua sendo o motivo de o bloqueio do `--list` ter passado batido.

## 8. Arquivos

```
M frontend/e2e/08-symbol-dado-real.spec.ts              (reescrito: sem seed, janela lida da página)
M frontend/src/app/symbol/SymbolClient.tsx              (C3 call-site, C4 horizonte, data-attrs)
M frontend/src/app/symbol/page.tsx                      (firstPresentMs, knowledgeTimeMs)
M frontend/src/app/symbol/request-window.ts             (C1, C2, C3)
M frontend/src/app/symbol/request-window.test.ts        (C2)
M frontend/src/app/symbol/view-model.ts                 (firstPresentSlotMs; reexporta series-key-id)
M frontend/src/app/symbol/view-model.test.ts            (firstPresentSlotMs)
M frontend/src/app/symbol/volume-subaxis-dom-contract.test.ts  (C4)
M frontend/src/charts/index.ts                          (barril: lastGridInstant)
M frontend/src/charts/s2-panels.ts                      (S2Panels carrega window)
M frontend/src/charts/s2-window.ts                      (lastGridInstant, C2/C4 nas docstrings)
M frontend/src/charts/s2-window.test.ts                 (C3, C4)
A frontend/src/app/symbol/bucket-arithmetic-boundary.test.ts   (falsificador de C3 como portão)
A frontend/src/app/symbol/series-key-id.ts              (extraído p/ o spec não puxar jsdom)
```

⛔ Nenhuma escrita no ledger (`gate-record`/`approve`/`advance` são atos de owner), nenhuma task
tocada, nenhum arquivo de backend.
