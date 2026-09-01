# `/build` — `codigo-em-ingles` fase `04` · `T-04.1` (`CST-97`) + `T-04.2` (`CST-98`)

**Componente:** `docs` · **Branch:** `tasks/ci-T-04x-superficies-de-contrato` · **Base:** `master@aac3442`
· **Data:** 2026-08-29

**Veredito: ENTREGUE.** `make verify` → **VERDE, 6 portões**. Os 4 critérios de `T-04.1` medidos, o de
`T-04.2` entregue, `CA-F1-1` re-medida e **continua 12**. **Zero linha de código.**

---

## 1. Arquivos alterados — 3, e nenhum deles é código

| arquivo | estado | o quê |
|---|---|---|
| `CLAUDE.md` | modified | +22 linhas: a **prosa adjacente da linha 11** com o gatilho de reabertura |
| `docs/context/codigo-em-ingles/resposta-owner-consumidor-externo-de-log.md` | **new** | `CA-F4-6` — a resposta do owner sai do ledger e ganha casa |
| `docs/INDEX.md` | modified | **+1 linha, append**, zero removidas |

```bash
# os TRES entregaveis — e o filtro de caminho faz parte do comando, nao e implicito
git diff --stat master... -- CLAUDE.md \
    docs/context/codigo-em-ingles/resposta-owner-consumidor-externo-de-log.md \
    docs/INDEX.md
# -> 3 files changed, 154 insertions(+)   [0 deletions]

# o comando SEM filtro NAO TEM NUMERO PUBLICAVEL, e o motivo esta abaixo
git diff --stat master...
# -> conta tambem os arquivos de processo, INCLUINDO ESTE RELATORIO
```

**Os arquivos da diferenca sao registro de processo, nao entregavel:** o
`handoff/T-04x.md` (registro de despacho, `R2`) e este proprio relatorio de gate.

> ⛔ **POR QUE O COMANDO SEM FILTRO NAO CARREGA NUMERO — e a razao e estrutural, nao
> preguica:** o `--stat` sem filtro **conta este arquivo**, e este arquivo e onde o numero
> seria escrito. **Todo valor publicado ali se invalida no ato de ser escrito.** Um numero
> assim so existe ancorado a um commit: em `72b4ad5` era `5 files / 432`
> `[MEDIDO 2026-08-29 em 72b4ad5: git diff --stat master...72b4ad5]`, e no commit seguinte
> ja era outro. O numero que **nao** se auto-invalida e o do comando COM filtro, porque o
> filtro exclui o relatorio.

> ⚠️ **CORRECAO, ciclo 2 — dois ciclos, e o segundo achou o conserto do primeiro:**
> **(a)** achado pelo `/qa`: a versao original publicava `3 files changed, 154 insertions(+)`
> ao lado de `git diff --stat master...` **sem o filtro de caminho**. Numero verdadeiro,
> comando errado. **(b)** achado pelo `/review` em `b5ab958`: o conserto de (a) publicou
> `5 / 432` **sem ancora de commit**, e naquele commit o comando ja devolvia `6 / 734` —
> **a mesma familia reintroduzida dentro do commit que a consertava**. Por isso agora nao ha
> numero sem filtro: nao e que falte medir, e que **a medida nao existe sem ancora**.

## 2. DoD — critério a critério, com o comando literal

Todos os comandos abaixo rodaram em `/tmp/claude-1002/wt/ci-T-04x`, universo = a árvore do worktree
após a entrega.

| critério | comando literal | antes | depois | veredito |
|---|---|---|---|---|
| **`CA-F4-1`** | `grep -c '^\| 10 \| .*\[INFERRED:' CLAUDE.md` | `1` | **`1`** | ✅ intacto |
| | `grep -c '^\| 10 \| .*NÃO DECIDIDO' CLAUDE.md` | `0` | **`0`** | ✅ intacto |
| **`CA-F4-2`** | `grep -cF 'janela_de_perda' CLAUDE.md` | `2` | **`3`** | ✅ |
| | `grep -cF 'ADR-008/D3' CLAUDE.md` | `1` | **`4`** | ✅ |
| | `grep -cF 'T-07.13' CLAUDE.md` | **`0`** ⛔ | **`2`** | ✅ **o trabalho da fase** |
| **`CA-F4-3`** | `grep -c '^\| 12 \| .*⏸ NÃO DECIDIDO' CLAUDE.md` | `1` | **`1`** | ✅ intacto |
| | `grep -c '^\| 12 \| .*owner' CLAUDE.md` | `1` | **`1`** | ✅ intacto |
| **`CA-F4-4`** | `git diff --name-only master... -- backend frontend \| wc -l` | `0` | **`0`** | ✅ zero código |
| **`CA-F4-5`** | `grep -rF '<evento>' backend/src \| wc -l`, os 4 PT | `1` cada | **`1` cada** | ✅ intactos — **§4** |
| **`CA-F4-6`** | o documento existe em `docs/context/codigo-em-ingles/` | **não existia** ⛔ | **131 linhas** | ✅ |
| **`CA-F4-7`** | linhas de `master:docs/INDEX.md` ausentes do conjunto novo | — | **`0`** (93 → 94) | ✅ cresce, não muda |
| **`CA-F1-1`** | `grep -c '^\| [0-9]* \| \*\*' CLAUDE.md` | `12` | **`12`** | ✅ **não mudou** |

**`CA-F4-7` foi medido POR CONJUNTO, não por `git diff \| grep '^-'`** — linha movida conta como
removida num diff e não foi removida:

```bash
python3 -c "import subprocess;old=subprocess.run(['git','show','master:docs/INDEX.md'],capture_output=True,text=True).stdout.splitlines();new=open('docs/INDEX.md',encoding='utf-8').read().splitlines();print(len([l for l in old if l not in set(new)]))"
# → 0
```

**E `[[rules.own]]` de idioma: NENHUMA declarada** (`ADR-011/D1.10` reprovaria a fase) —
`git diff --name-only master... -- harness.toml` → **`0`**, o arquivo não foi tocado.

## 3. Os portões — uma chamada, `R7`

```bash
HARNESS_MECHANISM=…/harness-plugin/0.13.0/bin/harness make verify
```

```
[OK] lint-backend    rc=0  52 source files
[OK] lint-frontend   rc=0  ESLint do projeto sobre frontend/src
[OK] test            rc=0  325 passed · Total coverage: 99.16%
[OK] boundaries      rc=0  3 kept, 0 broken
[OK] regras          rc=0  0 bloqueio(s), 1 aviso(s)
[OK] política        rc=0
veredito: VERDE — 6 portões mediram e passaram
```

Log bruto: `/tmp/verify-ci-T-04x-20260829T183055Z.log` (32K). **O único aviso é pré-existente e alheio a
esta entrega:** `[web-fullstack.browser-test-file-present]` sobre `frontend/src/**/*.test.*` — esta fase
não tocou em `frontend/`.

⚠️ **Nota de ambiente, e ela custou 2 medições falsas antes de virar verde:** o worktree não tem
`backend/.venv` nem `frontend/node_modules`, e **`$HARNESS_MECHANISM` tem de apontar para o EXECUTÁVEL,
não para o diretório** — apontado para o diretório, `regras` e `política` saem **`rc=126`** (`FALHA`,
"mediu e reprovou") quando na verdade **nada foi medido**. `rc=3` e `rc=126` contam histórias
diferentes e **as duas são falsas aqui**. Os symlinks foram **apagados antes do commit**: o
`.gitignore` usa `.venv/` e `node_modules/` com barra final, e symlink não casa padrão de diretório.

`harness rules --mode sweep --changed-only`, com os 3 arquivos **em `git add` antes do sweep** (o
sweep é cego a `untracked`, `[DOC: gate T-03.10]`) → **0 bloqueio, rc=0**.

## 4. ⚠️ `CA-F4-5` — o comando publicado é CEGO, e o critério NÃO foi reescrito

**Critério de aceite é ato do `/tech-lead`.** Registro a divergência; não a corrijo.

`CA-F4-5` manda medir com `grep -rnE 'logger\.(info|warning|debug|error)\("' backend/src | wc -l`
esperando **9**. **Medido: `7`.** E **a afirmação `9 eventos, 4 PT + 5 EN` está CERTA** — quem erra é o
instrumento, **nos dois sentidos**, e reproduzi cada metade:

- **perde 3** cuja chamada está quebrada em duas linhas (a regex exige `logger.info("` **na mesma
  linha**) — `drain_etl_backlog.py:62-63` (`etl_drenagem_concluida`), `ingest_health.py:65-66`
  (`ingest_health_query_read`), `ingest_verified_payload.py:161-162` (`ingestion_verified`);
- **conta 1** que não é evento — `probe_bucket_coupling.py:75`,
  `logger.debug("leitura do contador de %s falhou: %s", …)`, mensagem formatada.

`9 − 3 + 1 = 7`. Medição correta, por **AST**:

```bash
python3 <script de ast.walk sobre 100% dos .py de backend/src>
# TOTAL chamadas de logger: 13 · EVENTOS (1o arg = str literal): 10, dos quais 1 é mensagem %s → 9
```

**Os 9, com call site e idioma, estão tabelados** em
`docs/context/codigo-em-ingles/resposta-owner-consumidor-externo-de-log.md` §3. **4 PT / 5 EN**,
`[MEDIDO 2026-08-29 em aac3442, universo: 100% dos `.py` de `backend/src`]`.

**`7` NÃO é reprovação desta entrega** — nenhuma task desta fase renomeia evento algum. **A metade do
critério que funciona** passa:

```bash
for e in etl_item_publicado etl_item_concluido etl_drenagem_concluida checkpoint_cauda_truncada; do
  grep -rF "$e" backend/src | wc -l ; done      # → 1 · 1 · 1 · 1
```

> ⚠️ **`CA-F4-5` como escrito reprova hoje e reprovaria qualquer builder correto.** Quem decide é o
> `/tech-lead`. **Bloqueio nomeado, não silenciado.**

## 5. ⚠️ Um documento citado no handoff **não existe**

O handoff manda ler `docs/context/codigo-em-ingles/gates/CA-F4-5-instrumento-cego.md`.
`ls` → **arquivo inexistente**, tanto no worktree quanto no repositório principal. **Reproduzi a
análise do zero** (§4) e o resultado **confere número a número** com o resumo do handoff — mas o
ponteiro está quebrado, e quem vier depois vai bater na mesma porta. Registrado, não contornado.

## 6. Verde não prova nada até uma mutação reprovar — 2 mutantes, 2 reprovações

Executadas **em cópia**, árvore intocada:

| # | mutação | critério | resultado |
|---|---|---|---|
| **M1** | a prosa da linha 11 vira uma **13ª linha de tabela** | `CA-F1-1` | `grep -c '^\| [0-9]* \| \*\*'` → **`13`** ⇒ **REPROVA** ✅ |
| **M2** | o gatilho `T-07.13` some do `CLAUDE.md` | `CA-F4-2` | `grep -cF 'T-07.13'` → **`0`** ⇒ **REPROVA** ✅ |

**M1 é o mutante que importa**, e é a razão de a fronteira do `/tech-lead` (`tasks_review.md` §6.2)
existir: escrever a coluna de contrato como 13ª linha da tabela satisfaria `CA-F4-2` **e reprovaria
`CA-F1-1` sobre um `CLAUDE.md` correto**. A entrega escolheu **prosa adjacente**, e M1 prova que a
escolha é observável, não estética.

## 7. Doc delta

- **`CLAUDE.md`**: **atualizado** — novo bloco de prosa *"Linha 11 — o que faltava não era a exceção,
  era o MOMENTO DE REABRIR"*, entre os blocos das linhas 10 e 12. Motivo: `CA-F4-2`.
- **`docs/INDEX.md`**: **atualizado** — 1 linha **acrescentada** (append-only, `CLAUDE.md`).
- **`docs/context/codigo-em-ingles/resposta-owner-consumidor-externo-de-log.md`**: **criado** —
  `CA-F4-6`.
- **`SPEC-002` / `PRD-002` / plano `04`**: **sem mudança** — esta task **transcreve** a fronteira que
  eles decidiram (`SPEC-002` §8 é a origem literal do gatilho); reescrevê-los criaria duas verdades.
- **`tasks.toml`**: **sem mudança** — `status` é ato do coordenador, não do builder.
- **ADR**: **não necessário** — nenhuma decisão nova. O gatilho é `SPEC-002` §8 transcrito, e quem
  decide a reabertura é `ADR-008/D3`, explicitamente **não** esta feature.

## 8. Bloqueado — 2, nomeados

1. **`CA-F4-5` mede `7` onde o critério publica `9`** (§4). Não é defeito da entrega; é do instrumento.
   Dono: **`/tech-lead`**. A metade que funciona (`grep -F` dos 4 nomes) **passa**.
2. **`gates/CA-F4-5-instrumento-cego.md` não existe** (§5). Ponteiro quebrado no handoff. Dono:
   **coordenador do loop**.

**Nada além disso ficou aberto.** Ledger **intocado** (`BUILD_AUTHORIZED` antes e depois; nenhum
`gate-record`, `approve` ou `advance` — não é ato do builder). Nenhuma task criada ou editada no
tracker. Nenhum veredito de QA emitido.
