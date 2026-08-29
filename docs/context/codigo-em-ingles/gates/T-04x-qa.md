# `/qa` — QA Gate · `codigo-em-ingles` fase `04` · `T-04.1` (`CST-97`) + `T-04.2` (`CST-98`)

**Commit:** `72b4ad5` · **PR** #40 · **Branch:** `tasks/ci-T-04x-superficies-de-contrato` ·
**Worktree:** `/tmp/claude-1002/wt/ci-T-04x` · **Base:** `master@aac3442` · **Data:** 2026-08-29

**Veredito: `NEEDS_FIX`** — e a razão **não é o DoD**. Todos os critérios com instrumento válido
passam, `make verify` está **VERDE nos 6 portões**, e **4 mutantes reprovaram** (2 do builder,
reproduzidos, + 2 meus). O que reprova são **dois defeitos de citação provados**, ambos de **um token**,
ambos em texto que **esta fase escreveu** — e um deles está **dentro do deliverable de `CA-F4-6`**, o
documento que existe justamente para ser o endereço citável da resposta do owner.

---

## 1. Os 7 bloqueios em vigor — `harness rules list --severity block` → **7 regras**

```bash
HARNESS_MECHANISM=…/harness-plugin/0.13.0/bin/harness harness rules --mode sweep
# → 0 bloqueio(s), 1 aviso(s)
```

**Os 7, avaliados em bloco pelo sweep, `rc=0`:** `core.relative-import` · `core.silent-except` ·
`core.print-statement` · `core.hardcoded-secret` · `web-fullstack.browser-imports-server` ·
`web-fullstack.tenant-from-request` · `web-fullstack.server-test-directory-present`.

**O único aviso é pré-existente e alheio a esta entrega, e isso é PROVADO, não afirmado:**
`[AVISO] [web-fullstack.browser-test-file-present] frontend/src/**/*.test.*`
(`/tmp/verify-ci-T-04x-20260829T183725Z.log:88`). Severidade `warn`, **não** está entre as 7. E
`git diff --name-only master... -- backend frontend` → **0 arquivos**: esta fase não pôde tê-lo
introduzido.

## 2. `make verify` — uma chamada, `R7`

```bash
HARNESS_MECHANISM=/home/stharley/.claude/plugins/cache/harness/harness-plugin/0.13.0/bin/harness make verify
```

```
[OK] lint-backend    rc=0  52 source files
[OK] lint-frontend   rc=0  ESLint do projeto sobre frontend/src
[OK] test            rc=0  325 passed · Total coverage: 99.16%
[OK] boundaries      rc=0  3 kept, 0 broken
[OK] regras          rc=0  0 bloqueio(s), 1 aviso(s)
[OK] política        rc=0
[----] diff          sem mudança não-commitada
veredito: VERDE — 6 portões mediram e passaram
```

Log bruto: `/tmp/verify-ci-T-04x-20260829T183725Z.log` (8,0K). **Medição independente da do builder**
(carimbo `20260829T183725Z`, dele `20260829T183055Z`) — mesmos números.

**Cobertura: `99,16%` medida contra alvo `harness policy --key coverage_target` → `campo ausente na
politica`.** Não há alvo declarado ⇒ **não reprovo por cobertura**, e digo o motivo em vez de inventar
um número de referência. `[NÃO MEDIDO: alvo]`. Os 325 testes são os de `master` — esta fase não
adicionou nem removeu teste, o que é a consequência esperada de `CA-F4-4`.

**Ambiente, e ele importa para o veredito valer:** o worktree não tem `backend/.venv` nem
`frontend/node_modules`; linkei os dois do repositório principal e `$HARNESS_MECHANISM` apontou para o
**executável**. Sem isso os portões dariam `rc=3`/`rc=126` = *"não mediu"*, que **não** é *"passou"*.
**Symlinks apagados ao fim** — `git status --short` mostrava `?? frontend/node_modules`, confirmando a
nota do handoff (o `.gitignore` usa `node_modules/` com barra, e symlink não casa padrão de diretório).

## 3. DoD, critério a critério — reproduzido, não aceito

Todos os números abaixo são **meus**, medidos no worktree em `72b4ad5`. Baseline tirada de
`git show master:CLAUDE.md`.

| critério | comando literal | master | `72b4ad5` | veredito |
|---|---|---|---|---|
| `CA-F4-1` | `grep -c '^\| 10 \| .*\[INFERRED:' CLAUDE.md` | `1` | **`1`** | ✅ intacto |
| | `grep -c '^\| 10 \| .*NÃO DECIDIDO' CLAUDE.md` | `0` | **`0`** | ✅ intacto |
| `CA-F4-2` | `grep -cF 'janela_de_perda' CLAUDE.md` | `2` | **`3`** | ✅ |
| | `grep -cF 'ADR-008/D3' CLAUDE.md` | `1` | **`4`** | ✅ |
| | `grep -cF 'T-07.13' CLAUDE.md` | **`0`** | **`2`** | ✅ **o trabalho da fase** |
| `CA-F4-3` | `grep -c '^\| 12 \| .*⏸ NÃO DECIDIDO' CLAUDE.md` | `1` | **`1`** | ✅ intacto |
| | `grep -c '^\| 12 \| .*owner' CLAUDE.md` | `1` | **`1`** | ✅ intacto |
| `CA-F4-4` | `git diff --name-only master... -- backend frontend \| wc -l` | — | **`0`** | ✅ zero código |
| `CA-F4-5` | ver **§4** — instrumento inválido | — | **`7`** ≠ `9` | ⚠️ **anomalia** |
| `CA-F4-6` | o documento existe, com as 5 partes obrigatórias | não existia | **131 linhas** | ✅ |
| `CA-F4-7` | linhas de `master:docs/INDEX.md` ausentes do conjunto novo | — | **`0`** (93→94) | ✅ |
| `CA-F1-1` | `grep -c '^\| [0-9]* \| \*\*' CLAUDE.md` | `12` | **`12`** | ✅ **não mudou** |

**As três afirmações do despacho batem exatamente:** `T-07.13` 0→**2**, `janela_de_perda` 2→**3**,
`ADR-008/D3` 1→**4**.

**`CA-F1-1` — a fronteira do `/tech-lead` foi respeitada, e é observável:** o bloco novo do `CLAUDE.md`
(`+22 linhas`, entre os blocos das linhas 10 e 12) é **prosa adjacente**, não uma 13ª linha. Ele até
declara isso por escrito: *"Isto é PROSA ADJACENTE, não uma 13ª linha da tabela … `CA-F1-1` congela a
tabela em 12"*.

**`CA-F4-6` — as 5 partes exigidas, todas presentes e todas conferidas contra a fonte:**

| parte | onde | conferida contra |
|---|---|---|
| pergunta literal | §1 | `tasks.toml:284` (⚠️ o doc cita `:279` — **defeito D2**, §6) |
| resposta + data | §2 | **ledger, literal**: `harness pipeline show codigo-em-ingles \| grep -F '15:07:17Z'` contém, palavra por palavra, *"PERGUNTA T-04.2 JA RESPONDIDA pelo owner no mesmo ato: nao existe consumidor externo dos 4 eventos de log em portugues…"* ✅ |
| rótulo | §2 | `[DECISÃO-OWNER: 2026-08-29, escolha entre alternativas apresentadas]` — **correto**: o ledger registra *"escolhendo 'Sim — aprovar build e despachar' entre alternativas apresentadas"*, que é **escolha de menu**, não citação. `[PREMISSA-OWNER]` aqui inventaria uma frase ✅ |
| o que **foi** medido | §3 | `git ls-files \| grep -icE 'dashboard\|alert\|grafana\|prometheus\|loki\|logql'` → `0` ✅ |
| o que **NÃO** prova | §4 | `ingest_health_cli.py:69` — verifiquei o trecho: *"A `cron` wrapper, a scheduler or a supervisor calls `logging.basicConfig(stream=sys.stdout, level=INFO)`"* ✅ literal |

**Citações do bloco novo do `CLAUDE.md`, todas verificadas:**
`ingest_record.py:88-89` cita *"The NAME stays Portuguese because it is a CONTRACT COLUMN NAME quoted
from `ADR-008/D3`, like `window` — renaming it here would break the consumer of `T-07.13`."` —
**literal, byte a byte** (`sed -n '84,92p'`). `T-07.12`/`T-07.13` estão em
`docs/context/plataforma-dados/tasks.toml:940,950` — **exato**, com `CST-66`/`CST-67`.

**`CA-F4-7` medido POR CONJUNTO**, e o instrumento **morde** (mutante **M3**, §5):

```bash
python3 -c "import subprocess;old=subprocess.run(['git','show','master:docs/INDEX.md'],capture_output=True,text=True).stdout.splitlines();new=open('docs/INDEX.md',encoding='utf-8').read().splitlines();print(len([l for l in old if l not in set(new)]))"
# → 0     ·  93 → 94 linhas  ·  git diff … | grep -c '^-[^-]' → 0
```

**`[[rules.own]]` de idioma: NENHUMA** (`ADR-011/D1.10` reprovaria a fase) —
`git diff --name-only master... -- harness.toml` → **`0`**, e `grep -niE 'idioma|language|english'
harness.toml` não devolve nenhuma declaração de regra.

`harness tasks validate codigo-em-ingles` → **`7 task(s), 0 ERROR, 0 WARN`**.

## 4. ⚠️ `CA-F4-5` — **anomalia**, e as duas derivações independentes CONCORDAM

**Isto não é `OK` e não é `FAIL` de regra: é um instrumento que não produz veredito.** O `grep`
publicado devolve `7` onde o critério publica `9`, e eu **não reescrevi o critério** — é ato do
`/tech-lead`.

**Derivei do zero, sem ler a análise do builder antes de medir.** Meu `ast.walk` sobre 100% dos 33
`.py` de `backend/src`: **13 chamadas de `logger.*`**, **10** com 1º argumento string literal, **1**
delas é mensagem `%s` ⇒ **9 eventos nomeados**. Os 9, com call site:

| # | evento | idioma | call site |
|---|---|---|---|
| 1 | `etl_item_publicado` | **PT** | `infra/file_etl_worker.py:41` |
| 2 | `etl_item_concluido` | **PT** | `use_cases/drain_etl_backlog.py:62` |
| 3 | `etl_drenagem_concluida` | **PT** | `use_cases/drain_etl_backlog.py:63` |
| 4 | `checkpoint_cauda_truncada` | **PT** | `infra/jsonl_checkpoint.py:76` |
| 5 | `checksum_sidecar_absent` | EN | `infra/checksummed_file_payload.py:78` |
| 6 | `ingest_run_persisted` | EN | `infra/sqlite_ingest_record_store.py:218` |
| 7 | `ingest_gap_persisted` | EN | `infra/sqlite_ingest_record_store.py:237` |
| 8 | `ingest_health_query_read` | EN | `use_cases/ingest_health.py:66` |
| 9 | `ingestion_verified` | EN | `use_cases/ingest_verified_payload.py:162` |

`[MEDIDO 2026-08-29 em 72b4ad5 por `ast.walk`; universo: 100% dos `.py` de `backend/src`, n=33
arquivos]` — **4 PT + 5 EN = 9**.

**As duas derivações batem número a número E call site a call site.** A do builder e a minha
concordam em: o total `13`, os literais `10`, o `%s` em `probe_bucket_coupling.py:75`, os 9 nomes, a
divisão 4/5, e **quais 3** o `grep` perde. **Divergência única, e é cosmética:** o builder cita
`drain_etl_backlog.py:62-63` para `etl_drenagem_concluida`; por AST a linha `62` é
`etl_item_concluido` (essa o `grep` **pega**) e a chamada de `etl_drenagem_concluida` começa em `63`.
O **conjunto** dos 3 perdidos é idêntico. Confirmei com `sed`:

```
drain_etl_backlog.py:62   logger.info("etl_item_concluido", extra={"etl_key": key})   ← grep PEGA
drain_etl_backlog.py:63   logger.info(                                                 ← grep PERDE
                    64        "etl_drenagem_concluida",
```

`9 − 3 + 1 = 7`. **O instrumento erra nos dois sentidos**, e a afirmação `9 eventos, 4 PT + 5 EN`
está **certa**.

### A metade que funciona passa — e ela **basta**, pelo argumento abaixo

```bash
for e in etl_item_publicado etl_item_concluido etl_drenagem_concluida checkpoint_cauda_truncada; do
  grep -rF "$e" backend/src | wc -l ; done      # → 1 · 1 · 1 · 1
```

**Sim, basta — e não por indulgência, por um instrumento MAIS FORTE que o publicado.** A propriedade
que `CA-F4-5` quer asseverar é *"os 9 eventos estão INTACTOS"*. Ela é provada aqui de forma **total**,
não amostral: `git diff --name-only master... -- backend frontend` → **`0` arquivos**. Nenhum byte de
`backend/` mudou ⇒ **os 9 eventos são byte-idênticos a `master` por construção**, e nenhuma contagem
poderia dizer mais. O `grep -F` dos 4 nomes é a confirmação positiva; o `git diff` vazio é a prova.

E a metade que funciona **morde** — mutante **M4**, §5: renomear um dos 4 leva o `grep -F` dele a `0`.

> ⛔ **A armadilha que fica, e ela tem dono:** `CA-F4-5` **como escrito reprova qualquer árvore
> correta**, hoje e no futuro. A `T-04.1` manda re-medi-lo; quem o re-medir sem ler isto vai concluir
> que a fase quebrou algo. **Dono: `/tech-lead`.** Nem builder nem QA reescrevem critério de aceite.

## 5. Verde não prova nada até uma mutação reprovar — **4 mutantes, 4 reprovações**

Executados **em cópia**, em
`/tmp/claude-1002/-home-stharley-Documentos-projects-cripto-strategy/…/scratchpad/mut/`. Árvore
entregue **intocada**.

| # | mutação | critério | instrumento | resultado |
|---|---|---|---|---|
| **M1** | a prosa da linha 11 vira uma **13ª linha de tabela** | `CA-F1-1` | `grep -c '^\| [0-9]* \| \*\*'` | **`13`** ⇒ **REPROVA** ✅ |
| **M2** | `T-07.13` → `T-07.XX` no `CLAUDE.md` | `CA-F4-2` | `grep -cF 'T-07.13'` | **`0`** ⇒ **REPROVA** ✅ |
| **M3** | uma linha **pré-existente** some do `docs/INDEX.md` | `CA-F4-7` | o `python3` por conjunto | **`1`** ⇒ **REPROVA** ✅ |
| **M4** | `etl_item_publicado` → `etl_item_published` | `CA-F4-5`, metade boa | `grep -rF` por nome | **`0`** ⇒ **REPROVA** ✅ |

**M1 e M2 são os do builder, e eu os reproduzi** — não aceitei o resultado dele. **M3 e M4 são meus, e
são os que faltavam:** M3 é o único que prova que o instrumento **por conjunto** de `CA-F4-7` não está
devolvendo `0` **por vacuidade**; sem ele, `0` é indistinguível entre *"nada foi removido"* e *"o
instrumento nunca foi capaz de detectar remoção"* — o modo de falha que `ADR-012` nomeia para o
`rc=0`. M4 faz o mesmo pela metade viva de `CA-F4-5`.

## 6. Os dois defeitos — provados, e é por eles que o veredito é `NEEDS_FIX`

Nenhum dos dois contradiz o plano nem quebra um critério. Os dois são **defeitos de citação**, a
disciplina que o `CLAUDE.md` diz ter achado 3 defeitos reais deste projeto.

### D1 — o comando publicado no relatório de build **não produz o número publicado**

`gates/T-04x-build.md` §1:

```bash
git diff --stat master...            # → 3 files changed, 154 insertions(+)   [0 deletions]
```

**Medido agora, com o comando LITERAL:**

```bash
git diff --stat master... | tail -1
# → 5 files changed, 432 insertions(+)
```

O `3 / 154` é **correto** — mas só para os **3 arquivos de conteúdo**, e exige o filtro de caminho que
a linha publicada **não tem**:

```bash
git diff --stat master... -- CLAUDE.md docs/INDEX.md docs/context/codigo-em-ingles/resposta-owner-consumidor-externo-de-log.md | tail -1
# → 3 files changed, 154 insertions(+)
```

Os outros 2 são o próprio relatório e o handoff. **Severidade: baixa; classe: a que este repositório
trata como não-negociável** (*"Nenhum número sem o comando que o produziu"*). **Correção: acrescentar
o `--` com os 3 caminhos.**

### D2 — o deliverable de `CA-F4-6` **erra a linha da própria fonte**

`resposta-owner-consumidor-externo-de-log.md` §1 cita a pergunta literal como:

```
[DOC: docs/context/codigo-em-ingles/tasks.toml:279, bloco `T-04.2`]
```

**Medido:**

```bash
grep -nF 'alguma query, alerta, dashboard ou script' docs/context/codigo-em-ingles/tasks.toml
# → 284:    "A PERGUNTA, E ELA E UM FATO E NAO UMA ESCOLHA DE IDIOMA — sim ou nao: 'alguma query…
```

A pergunta está em **`:284`**. E `:279` **não é** nem o início do bloco (que é `:272`) — é a terceira
linha de um comentário sobre `depends_on`: *"# outra task. O plano poe a fase 04 dependendo da 01…"*.

**Por que este, e não o outro, é o que faz o veredito virar:** o documento existe **exatamente** porque
a resposta do owner morava só onde ninguém procuraria. Um documento criado para consertar um ponteiro
ruim, que erra o próprio ponteiro, reproduz em miniatura o defeito que ele conserta — e quem grepar
`:279` acha um comentário sobre `depends_on` e conclui que a citação foi inventada. **Correção:
`279` → `284`.** Um token.

## 7. O ponteiro quebrado do handoff — **confirmado, e o coordenador já o declarou**

```bash
ls docs/context/codigo-em-ingles/gates/CA-F4-5-instrumento-cego.md   # → inexistente
```

Inexistente **nesta árvore e no repositório principal** (vive na PR #38, não mergeada). O builder
**reproduziu a análise do zero** e eu a reproduzi **de novo, independentemente** — as **três**
derivações concordam (§4). O ponteiro não custou correção; custou trabalho repetido **duas** vezes.
**Dono: coordenador do loop.** Registrado porque quem vier depois bate na mesma porta.

## 8. Escopo e limites deste gate

- **Zero linha de produção alterada por mim.** Escrevi este arquivo e mutei **cópias** em scratchpad.
- **Não avancei estado, não aprovei gate.** `harness pipeline state codigo-em-ingles` →
  `BUILD_AUTHORIZED`, antes e depois.
- **Não reescrevi critério de aceite** — `CA-F4-5` continua como o `/tech-lead` o escreveu.
- **Symlinks de ambiente apagados** antes de encerrar; nenhum `git add` foi executado.

## 9. Veredito

**`NEEDS_FIX`** — DoD **cumprido**, portões **verdes**, 4 mutantes **reprovam**, e **2 defeitos de
citação provados**, ambos de um token, um deles dentro do deliverable de `CA-F4-6`.

**Ações:**

1. `resposta-owner-consumidor-externo-de-log.md` §1: `tasks.toml:279` → **`tasks.toml:284`** (**D2**).
2. `gates/T-04x-build.md` §1: acrescentar o filtro `-- CLAUDE.md docs/INDEX.md docs/context/codigo-em-ingles/resposta-owner-consumidor-externo-de-log.md` ao `git diff --stat`, ou trocar o número por `5 / 432` (**D1**).
3. **Escalar ao `/tech-lead`, e isto NÃO bloqueia a fase 04:** `CA-F4-5` publica um comando cego que
   reprova qualquer árvore correta. Ele precisa de instrumento por **AST**, ou de ser reescrito para
   medir a propriedade que interessa (*os 4 nomes PT presentes por `grep -F`* + *`git diff` de
   `backend/` vazio*). **Não é defeito desta entrega.**

**Nenhuma das 3 ações toca código.** Re-gate = re-medir `CA-F4-2`/`CA-F1-1` e um `harness rules
--mode sweep`; `make verify` não precisa rodar de novo se só estes 2 arquivos `.md` mudarem.
