# ACHADO — as suítes de front não estão em portão nenhum (`AVISO-2` da wave `03`)

**Origem:** `gates/QA-wave-03-revalidacao.md`, ressalva de força. **Autor:** `frontend-qa`, 2026-09-11,
branch `wave/03-producao-e-janela-deslizante`, checkout principal.

⛔ **Nada foi editado aqui.** O conserto toca `scripts/verify.sh` e/ou `Makefile`, que **não são
arquivo de teste** — fora do meu mandato (`frontend-qa`, restrição 1). Isto é diagnóstico + patch
proposto + falsificador. **Quem aplica é decisão do owner.**

---

## 1. O fato, com o comando e o `n`

```bash
grep -rn 'node --test' scripts/verify.sh Makefile .git/hooks/pre-push   # rc=1, 0 linhas
grep -n 'portao ' scripts/verify.sh                                     # 8 linhas: 6 portões + 2 de diff
grep -n 'npm ' scripts/verify.sh                                        # 2 linhas, AMBAS lint (eslint, tsc)
find frontend/src -name '*.test.ts' | wc -l                             # 48
ls frontend/e2e/*.spec.ts | wc -l                                       # 8
ls .github/workflows/ 2>/dev/null                                       # nada — não há CI
```
`[MEDIDO 2026-09-11, HEAD da wave `03`]`

**As 48 unidades de teste do front + os 8 specs de Playwright não são executados por nenhum portão:**
nem `make verify` (6 portões: `lint-backend`, `lint-frontend`, `test` — que é `backend/scripts/test.sh` —,
`boundaries`, `regras`, `validate`), nem o `pre-push` (`.git/hooks/pre-push` roda só
`mechanism require-push` + `rules --mode sweep`), nem CI (não existe).

**O que `lint-frontend` alcança, e é a origem do falso conforto:** ESLint + `tsc --noEmit --strict`
sobre `frontend/src` (`scripts/verify.sh:86,88`). Isso prova que o front **compila**, não que ele
**funciona**. O portão de contraste que a wave `03` acabou de construir — o que impede o `D13` de
voltar — está exatamente nessa faixa: existe, morde quando testado à mão, e **nenhum portão o roda.**

**Universo por suíte** `[MEDIDO 2026-09-11]`:

| script npm | testes | resultado hoje |
|---|---|---|
| `test:charts` | 191 | 191 pass |
| `test:app` | 156 | 156 pass |
| `test:s3` | 111 | 111 pass |
| `test:s1` | 105 | **97 pass / 8 FAIL — ambiental, ver §3** |
| `test:e2e` (`make e2e`) | 24 | 24 pass, rc=0 |
| **total unitário** | **563** | 555 pass / 8 fail |

Nenhum arquivo de teste do front fica **órfão dos globs**: `find frontend/src -name '*.test.ts'` = 48 e
a união dos 4 globs dos scripts = 48 (`comm -23` → vazio). O buraco não é de cobertura de arquivo — é
que **nada chama os 4 scripts**.

## 2. Por que isto importa mais do que um número baixo de cobertura

Suíte fora de portão não protege contra regressão: protege contra **quem lembrar de rodá-la**. E este
repositório já mediu que prosa sem portão tem **0% de adesão** (`agents/qa.md`, citado no `CLAUDE.md`).
Duas evidências desta mesma wave:

1. o `BLOCKER-1` (paleta clara sobrevivendo em `@media (prefers-color-scheme: light)`) passou pelos
   **6 portões verdes** e só foi visto quando um humano olhou a tela;
2. o `BLOCKER-3` (asserção de e2e verde sobre universo vazio) só apareceu porque alguém rodou uma
   mutação **à mão**. Nenhum instrumento a roda sozinha.

## 3. O que reprova HOJE se o conserto for aplicado sem cuidado — leia antes de aplicar

`test:s1` tem **8 falhas em clone limpo**, e elas **não são regressão desta wave**:

```
Error: server process (mode=original) exited early with code 1: store_parent_missing
ls -d backend/data/md                                    # inexistente
git diff --name-only master..wave/03 | grep -c s1-console  # 0
```
O helper de `s1-console` sobe a API real com o `QUARANTINE_STORE_PATH` **default**
(`data/md/series_quarantine.sqlite3`, `main/__init__.py:67`) e o processo recusa subir porque o
diretório-pai não existe. `scripts/e2e-env.sh:136` já resolveu isto para o `make e2e` apontando a
variável para o `$STATE_DIR` efêmero; **o helper de `s1` não recebeu o mesmo tratamento.**

⇒ **Colocar `test:s1` no portão hoje pinta `make verify` de vermelho por defeito de helper de teste,
não de produto.** Duas ordens possíveis, e a escolha é do owner:
(a) consertar o helper de `s1` primeiro (é arquivo de teste — cabe num `frontend-builder`), depois
ligar as 4 suítes de uma vez; ou (b) ligar `charts`/`app`/`s3` agora e `s1` no commit que conserta o
helper. ⛔ O que **não** pode acontecer é ligar com uma allowlist de teste a pular: *"entrada de
allowlist é indistinguível de bypass"* (`CLAUDE.md`).

## 4. Conserto proposto — `scripts/verify.sh`, um portão novo, na forma que o arquivo já usa

Inserir depois do bloco `lint-frontend` (linha ~99), espelhando **exatamente** o idioma de rc=3 que o
próprio arquivo já criou para `node_modules` ausente — sem `node_modules/` a resposta é **"NÃO MEDIU"**,
nunca verde, porque `node_modules/` é gitignored e clone limpo não o tem:

```sh
# ── 1c. suítes de teste do frontend ────────────────────────────────────────────────────
# `[QA wave 03, AVISO-2]`: 563 testes de front existiam e NENHUM portão os rodava — inclusive o
# portão de contraste que a wave 03 construiu para impedir o `D13` de voltar. `lint-frontend`
# prova que o front COMPILA, não que ele funciona.
if [ -d frontend/node_modules ]; then
    RC_FT=0
    for suite in charts app s3 s1; do
        portao "test-frontend-$suite" npm --prefix frontend run "test:$suite" || RC_FT=1
    done
else
    { echo; echo "########## test-frontend :: RECUSA (frontend/node_modules ausente) ##########"; } >> "$LOG"
    RC_FT=3
fi
falhou $RC_FT
N_FT="$(extrai '(pass|fail) [0-9]+')"   # o reporter do node --test imprime `ℹ pass 191`
printf '[%-9s] test-frontend   rc=%s  %s\n' "$(rotulo $RC_FT)" "$RC_FT" "${N_FT:-(n não extraído)}"
```

**Custo medido:** `charts` **31 s** + `app` **2 s** + `s3` **1 s** + `s1` **8 s** = **42 s** somados
à `verify` `[MEDIDO 2026-09-11, 1 execução de cada, relógio de parede]`. Quase tudo é `charts`, que
roda contraste sobre a paleta inteira.

**E o `Makefile`:** um alvo `test-frontend` espelhando essas 4 linhas, como `lint-frontend` já espelha
o que `verify.sh` chama — `verify.sh` chama `npm` direto, e não `make`, de propósito: `make` colapsa
qualquer falha em rc=2 e apagaria a distinção rc=1 (reprovou) × rc=3 (não mediu) que o script promete
(comentário em `scripts/verify.sh:80-84`).

**⚠️ O que este achado NÃO propõe: mover `make e2e` para dentro de `verify`.** Isso é `D1.11`/`M5`,
decisão declarada — *"**fora** de `verify`"* (`docs/plans/SPEC-003-camada-de-leitura-do-painel/01_pagina_diz_a_verdade.md:17`).
Reabrir é ato do owner, com o custo de `next build` + subir API em cada `verify`. As **suítes
unitárias** são outra classe: não sobem servidor, não tocam porta, não escrevem PNG versionado.

## 5. Falsificador do conserto — sem isto o patch é alegação

Aplicado o patch, **plante um defeito real e prove que `verify` reprova**:

```bash
# MORDE: replanta a paleta clara que o D13 matou — o defeito que os 6 portões deixaram passar.
printf '\n.light-theme { --color-surface-base: #fff; }\n' >> frontend/src/app/globals.css
bash scripts/verify.sh; echo "rc=$?"     # TEM de reprovar em test-frontend-charts (rc!=0)
git checkout -- frontend/src/app/globals.css

# CALA: árvore limpa, o mesmo comando fica verde — senão o portão nasce disparado e ninguém o olha.
bash scripts/verify.sh; echo "rc=$?"     # rc=0
```

Um portão que nasce vermelho é lido como *"já estava assim"* e para de ser olhado — é o modo de falha
que `ADR-012` nomeia. Por isso o §3 vem **antes** deste §5 na ordem de execução.
