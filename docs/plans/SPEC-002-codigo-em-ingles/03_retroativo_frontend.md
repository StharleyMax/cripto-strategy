# Fase `03` — O retroativo de `frontend/src`, com a prova de dois lados re-executada **DEPOIS**

**Componente:** `web` · **Classe:** retroativo · **Depende de:** `01` · **Paraleliza com:** `02` · **Cobre:** `PRD-002`/`U3`
**Rev de ancoragem:** `master@5f4ece0`
**Fronteira:** 4 arquivos + 1 diretório + as citações **vivas** enumeradas abaixo. **`backend/` não é tocado, exceto `backend/README.md`, que cita o diretório.**

---

## Itens

| # | item | requisito | alvo |
|---|---|---|---|
| `3.1` | `git mv` dos 4 arquivos e do diretório, conforme o mapa **normativo** de `SPEC-002` §3.2 | `U3` | `web` |
| `3.2` | Os **9 identificadores** renomeados conforme o mesmo mapa | `U3` | `web` |
| `3.3` | As citações **VIVAS** atualizadas, **atômico com o `git mv`** (`RN-1`) | `RN-1` | `web` |
| `3.4` | A **sonda documentada** de `harness.toml` (`:238-252`) passa a `Filter.test.tsx`, **e a medição que a acompanha é re-executada e o `rc` republicado** | `RN-5` | `web` |
| `3.5` | A prova de dois lados de `ADR-011/D4` re-executada **depois** do rename, nos **quatro** casos | `PRD-002` §5.1 classe C | `web` |

**⛔ TRÊS coisas que NÃO mudam — omitir qualquer uma reprova a fase:**

1. **`<p>Filtro: any resultado serve</p>` fica literal.** A palavra `Filtro` **sobrevive dentro da string e isso é correto** — a evidência é a posição sintática de `any`, não o nome do arquivo.
2. **`{ retry: 3, any: true }` fica literal** — a outra metade da bancada `D1.3b`.
3. **O valor `"/painel"` fica em português** (`[Q2]` é do owner). ⇒ o arquivo conterá `panel: "/panel"`? **NÃO** — conterá **`panel: "/painel"`**, mista **de propósito**. Um builder que "arrumar" isso reprova a fase.

**As citações VIVAS (5 arquivos) — é para copiar, não para resumir:**

| arquivo | o que | por quê é VIVA |
|---|---|---|
| `harness.toml` | **5 linhas** com `features/painel`, **incluindo as 4 de `serie.tsx`** (caminho hipotético, que **continua** sendo hipotético) | `CA-F3-3` manda re-executar a prova que elas documentam |
| `frontend/README.md` | **4 lugares** — o protocolo de reprodução (`:33`, `:85-86`, `:118-121`, `:379-383`) | é a receita com `printf`/`rm` que `CA-F3-3` executa |
| `backend/README.md` | `:455`, `:457` | instrui trabalho corrente |
| `docs/context/plataforma-dados/tasks.toml` | — | instrui trabalho corrente |
| `docs/context/plataforma-dados/handoff_to_builder.md` | — | instrui trabalho corrente |

**As HISTÓRICAS (6 arquivos) — NÃO se tocam:** `docs/INDEX.md` · `docs/adr/ADR-003` · `ADR-011` · `ADR-012` · **`ADR-013`** · `docs/plans/SPEC-001-plataforma-dados/01_governanca_gateante.md`.

> **⚠️ O plano `01` é HISTÓRICA, e isto CORRIGE a `ADR-013`, que o classificava como VIVA.** Decidido em `ADR-015/D3`, com o argumento que nenhum dos dois documentos tinha: a linha `:36` (`D1.3b`) nomeia uma bancada de **três** arquivos, e **`tipos.ts` NUNCA existiu** — ele é plantado por `printf` e removido por `rm`. `[MEDIDO 2026-08-29 em 5f4ece0: tipos.ts NÃO EXISTE · serie.tsx NÃO EXISTE · config.ts EXISTE · Filtro.tsx EXISTE]` ⇒ **se *"receita que nomeia arquivo inexistente é âncora morta"* fosse o teste, o plano `01` já seria âncora morta hoje, sem rename nenhum.** Não é. **A receita viva mora em `frontend/README.md`, que está em VIVA nos dois inventários** — atualizá-la mantém a receita; deixar a linha do plano preserva o registro de um DoD já cumprido, cujos vereditos de `/qa` e `/review` **não foram dados sobre `Filter.tsx`.**

**`docs/proposta-discovery.md` e `docs/specs/PRD-001-plataforma-dados.md`** casam a **palavra** `Filtro`, não o caminho: **fora do universo do verificador** (`ADR-015/D1`) e HISTÓRICOS de qualquer modo.

---

## DoD — cada critério nomeia o comando e o universo

| # | critério | comando | esperado |
|---|---|---|---|
| `CA-F3-1` *(a)* | 4 arquivos, todos com nome-base inglês, **nenhum segmento de caminho em português** | `find frontend/src -type f` | **4 arquivos**; e `CA-F1-6` devolve **13 segmentos, zero português** |
| `CA-F3-2` *(f — evidência)* | **o texto JSX não muda** | `grep -F 'Filtro: any resultado serve' frontend/src/features/panel/Filter.tsx`; **e** `grep -F 'any: true' frontend/src/features/panel/config.ts` | **1 linha, `rc=0`** em cada. **A palavra `Filtro` DENTRO da string é o resultado correto** |
| `CA-F3-3` *(d — a prova de dois lados, re-executada DEPOIS)* | os **quatro** casos de `ADR-011/D4`, na ordem, com o `rc` de cada | `printf … > frontend/src/features/panel/tipos.ts`; `npm --prefix frontend run lint`; `rm …/tipos.ts`; `npm --prefix frontend run lint`; `test -f …/Filter.tsx` **e** `harness code-paths classify …/Filter.tsx` **e** `harness rules --mode file --path …/Filter.tsx --surface ci`; `harness rules --mode sweep` | **MORDE:** 2 erros `@typescript-eslint/no-explicit-any`, `rc=1` · **CALA:** 0 erro, `rc=0` · **CALA:** saída de 0 byte, `rc=0` · **sweep:** **1 `[AVISO]`** (`browser-test-file-present`), **0 `[BLOQUEIO]`**, `rc=0` |
| `CA-F3-4` *(c, por token — `RN-8`)* | nenhum nome antigo sobrevive em citação viva | verificador de âncora, **tipado** (`ADR-015/D1`), token a token | **CAMINHO, escopo integral:** `Filtro.tsx` MORDE **8**→**0** · `painel/` **17**→**0** · `rotas.ts` **1**→**0** · `formatar-percentual.ts` **1**→**0**. **IDENTIFICADOR, escopo só-código:** `configPainel` **1**→**0** · `ROTAS` **2**→**0** · `formatarPercentual` **1**→**0** · `razao` **3**→**0** · `casas` **2**→**0** · `sinal` **2**→**0**. **Um `n=0` no lado MORDE reprova no ato da declaração** |
| `CA-F3-5` *(c)* | a sonda documentada é atualizada **e re-medida** | `grep -c 'Filtro' harness.toml`; **e** `harness code-paths classify frontend/src/__sonda__/Filter.test.tsx` | **`0`**; e `producao`, `rc=0` — **o mesmo veredito de hoje sobre o caminho antigo** `[MEDIDO 2026-08-29]`. **`classify` não exige que o arquivo exista** (`SPEC-002` §0.4), e é por isso que esta sonda hipotética é re-mensurável |
| `CA-F3-6` *(c, TRÊS lados — reescrita, `SPEC-002` §4.4)* | o rename não tirou `frontend/src` do universo de regra **em silêncio** | **(1)** `test -f` nos **4 caminhos NOVOS**; **(2)** `test -f` nos **4 caminhos ANTIGOS**; **(3)** `harness code-paths classify` nos 4 novos | **(1)** `rc=0` ×4 · **(2)** **`rc=1` ×4** · **(3)** `producao` ×4. **Sem o passo (2) o critério é VÁCUO** — `classify` devolve `producao`/`rc=0` para caminho inexistente `[MEDIDO 2026-08-29, n=3]` |
| `CA-F3-7` *(c)* | **nenhuma HISTÓRICA tocada** | `git diff --numstat master... -- docs/INDEX.md docs/adr docs/plans docs/proposta-discovery.md docs/specs/PRD-001-plataforma-dados.md` | **vazio** |
| `CA-F3-8` *(c)* | `"/painel"` **sobreviveu** | `grep -F '"/painel"' frontend/src/app/routes.ts` | **1 linha, `rc=0`.** `[Q2]` é do owner |
| `CA-F3-9` *(d)* | a árvore continua verde | `make lint`; `make test` | `rc=0` nos dois. **`rc=3` reprova.** `make test` inalterado: **107 passed, 370 statements** |

---

## Falsificador desta fase

**Se `CA-F3-3` for medido ANTES do rename, ou se qualquer `rc` for citado sem o `test -f` que o precede, a fase NÃO passou — mesmo com todos os comandos verdes.** O verde sem o passo (1) é o falso-verde que `ADR-012` nomeia como *"barato de cometer e caro de detectar"*, e `SPEC-002` §0.4 mediu que o passo (2) **não é rede do passo (1)**.

**E o falsificador que a `ADR-013` obriga e que quase ninguém lembra:** renomear `features/painel/` invalida **as DUAS metades** da prova de dois lados, não só a `CALA`. `harness.toml` cita `features/painel` em **5 linhas**, e **4 delas são a metade MORDE** (`serie.tsx`, o violador plantado). **É por isso que `CA-F3-3` manda re-executar os QUATRO casos depois do rename, e não só o do `Filtro.tsx`.**
