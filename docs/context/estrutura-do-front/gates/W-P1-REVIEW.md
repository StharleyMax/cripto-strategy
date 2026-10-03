# Review da wave 1 da fase 10 (pirâmide de testes) — `estrutura-do-front`, wave `piramide-w1`

**Auditor:** `harness-plugin:reviewer`, 2026-10-03, sobre `f730b8b0` (base `origin/master` = `f6d21ec6`), worktree
`.claude/worktrees/wave-piramide-w1`. Tasks: `T-10.5`, `T-10.6`, `T-10.7`. Revisão só de leitura: não gravei no ledger e não commitei.
**Veredito: COMPLIANT**: 0 BLOCKER, 0 WARNING, 5 INFO.

## Denominador `[MEDIDO]`

- `harness rules list --severity block` → **8 regras bloqueantes**. Avaliei as 8 pelo runner, em 8 de 8 arquivos de
  `git diff --name-only origin/master...HEAD`, uma chamada por arquivo:
  `harness rules --mode file --surface ci --path <arquivo> --format ndjson` → **0 achados** em todos, rc=0.
- **Controle positivo do runner**, porque um rc=0 com saída vazia é ambíguo: o mesmo comando sobre `backend/src/api/dependencies.py` devolve 1
  achado (`core.module-docstring-single-line`, warn). Ou seja, o modo file morde.
- `harness rules --mode sweep --surface ci --format ndjson` → 77 achados na árvore inteira, todos `warn` (72 `core.module-docstring-single-line`,
  5 `web-fullstack.hardcoded-url`). **Nenhum** deles cai num arquivo do diff.
- `git diff --name-status origin/master...HEAD` → 8 arquivos:
  - 3 de teste do front: `frontend/src/charts/eslint-boundary.test.ts`, `frontend/src/charts/s2-cvd.test.ts` e
    `frontend/src/features/s1-console/fingerprint-sync-boundary.test.ts`;
  - 1 de teste do backend: `backend/tests/sentimento/test_oi_candles_route_invariants.py`;
  - 3 relatórios de build e `docs/INDEX.md`.
  **Nenhum arquivo de produção mudou em `src/`**: os três de `frontend/src` são `*.test.ts`, e no backend só `backend/tests/` mudou.
- Escopo: `harness pipeline require-code <arquivo>` → **"código permitido — feature 'estrutura-do-front' (scope)"** para os 4 arquivos de código.
  O teste de backend e o `fingerprint-sync-boundary` aparecem literais em `harness pipeline scope estrutura-do-front list`, como manda a narrativa §10.5.
- Escopo por task (`tasks.toml`, `refs` "ESCOPO"):
  - `T-10.5` mexeu nos 2 arquivos que a task nomeia;
  - `T-10.6` mexeu só em `s2-cvd.test.ts`, com a fixture em memória e sem arquivo novo, o que fica dentro do escopo;
  - `T-10.7` mexeu só em `test_oi_candles_route_invariants.py`.
  Nenhuma task toca arquivo de outra.
- `docs/INDEX.md`: 2 linhas `+` e 0 linhas `-`, então o arquivo segue append-only (`CLAUDE.md` §"Registro de artefatos").
- Idioma (`CLAUDE.md`, tabela, linhas 1, 2, 3 e 5): identificadores, nomes de arquivo, comentários e mensagens de `assert` e de `Error` acrescentados
  estão em inglês. O grep de acento e de palavra portuguesa sobre as linhas `+` de `frontend/` e `backend/` devolveu 0 linhas. O português que resta,
  em `eslint-boundary.test.ts:1-2`, é a citação de `D5.12` que já existia em `origin/master`.

## Conformidade com a DoD, sob a ótica de arquitetura

- **T-10.5:**
  - cada arquivo planta todos os seus probes antes, numa rodada só: `eslint-boundary.test.ts:183-197` no `before` e
    `fingerprint-sync-boundary.test.ts:121-155`;
  - o `spawnSync` recebe só os caminhos plantados;
  - os nomes são únicos por execução: `RUN_ID` com pid e `randomUUID` (`eslint-boundary.test.ts:43`, `fingerprint-sync-boundary.test.ts:56`);
  - a remoção fica num `finally`;
  - a contraprova de vacuidade continua lá: o teste exige que o JSON do eslint traga exatamente o conjunto plantado.
  O CALA da árvore real saiu do teste e passou para `scripts/verify.sh:225` (`portao "lint-frontend"`), citado em `gates/T-10.5-build.md:29`.
- **T-10.6:**
  - o teste 7 não lê mais aggTrades, porque a fixture sintética em memória fica em `s2-cvd.test.ts:86-157`;
  - a leitura real virou o teste 8, que só roda com `S2_CVD_REAL_AGGTRADES=1` e aparece como SKIP visível no TAP;
  - nenhum arquivo de produção mudou.
- **T-10.7:**
  - `first_anchor` saiu do gerador (`:283-284`);
  - todo cache usa `functools.cache` com chave `seed` ou sem argumento, sem nenhum `id()`;
  - os valores cacheados são imutáveis (`MappingProxyType`, tuplas);
  - as asserções e o universo de seeds não mudaram.

## Achados

**[INFO] I-1: a DoD (2) da `T-10.7` nomeia `_observations` cacheado, mas o código cacheia `_seeded_observations(seed)`.**
`backend/tests/sentimento/test_oi_candles_route_invariants.py:212-216` é um invólucro chaveado por seed. A forma diverge da DoD; a intenção é a mesma
(chave = seed, nunca `id`). O desvio está declarado em `gates/T-10.7-build.md:19-21`, e a tentativa por `id` está medida como vermelho falso em
`:100`. Não exige correção. O QA confere a DoD (3) (99 casos coletados) e a ablação D-1.

**[INFO] I-2: um número de `3.453` num comentário em inglês.** Em `backend/tests/sentimento/test_oi_candles_route_invariants.py:282`, o ponto é
separador de milhar pt-BR, e em inglês se lê "três vírgula quatro". O `CLAUDE.md`, linha 5 da tabela, pede comentário em inglês. Correção opcional:
escrever `3,453` ou `3453`.

**[INFO] I-3: um `catch {}` sem binding em `frontend/src/charts/s2-cvd.test.ts:175`.** Ele engole qualquer erro de leitura, não só o ENOENT do dia
faltante. Não foi introduzido pela wave: o bloco foi movido de `:92` em `origin/master` para o teste opt-in. O runner (`core.silent-except`) não o acusa.
Fica como sugestão para uma task futura: checar `code === "ENOENT"` e relançar o resto.

**[INFO] I-4: a `T-10.6` permitia "fixture sintética nova ao lado", e a fixture veio em memória.** O diff ficou mais estreito que o escopo, o que é aceitável.
O teste 8 opt-in foi acrescentado no mesmo arquivo, dentro do escopo.

**[INFO] I-5: o `require-code` responde "nenhuma feature reivindica" para os `.md` do diff.** O motivo é que `docs/` não está em `code_paths.include_prefixes`
nem `*.md` em `include_globs` (`harness policy --key code_paths`). O portão de escopo não se aplica a esses arquivos, então isto não é violação.

## Fora deste review

- O `make verify-scope` VERDE-ESCOPO de cada task fica com o orquestrador, conforme `gates/T-10.6-build.md:104` e `gates/T-10.7-build.md:115`.
  Não o rodei, porque sou read-only e porque, pelo `CLAUDE.md`, dois verifies em paralelo colidem.
- Medições de tempo (`REGRA-T`) e ablações: são do QA.
