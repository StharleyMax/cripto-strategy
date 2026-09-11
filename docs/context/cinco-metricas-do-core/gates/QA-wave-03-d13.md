# QA Gate (Front) — wave `03` / aplicação de `D13`

**Escopo medido por mim** (não por resumo): `git diff --stat master..wave/03-producao-e-janela-deslizante`
→ **34 arquivos, +3297/-399**. HEAD `d480dcc`. Worktree de QA: `agent-a8faed18a42b7b7c8`.

⛔ Nenhuma escrita no ledger. ⛔ Nenhum arquivo de `frontend/src/` alterado (mutações revertidas,
`git diff --stat HEAD -- frontend/src/` vazio). ⛔ Nada semeado em Postgres.

---

## 1. O portão de contraste é REAL — as duas provas que pedi passaram

**(a) token novo sem backdrop é ERRO DE TIPO.** Mutação: acrescentei `"newBogusInk"` ao union
`ColorRole` e ao literal `TOKENS`, sem linha em `CONTRAST_BACKDROP`.

```
npm --prefix frontend run typecheck
src/charts/color-tokens.ts(161,14): error TS2741: Property 'newBogusInk' is missing in type
  '{...}' but required in type 'Readonly<Record<ColorRole, ContrastBackdrop>>'.
```

E o `typecheck` **está em portão**: `scripts/verify.sh:88` roda `portao "lint-frontend-typecheck"`.
⇒ a exceção de `directionOn` é **estrutural**, não allowlist: ela é `kind:"roles"`, medida contra os
fills, e o controle negativo permanente a faz **reprovar** quando o fill escurece.

**(b) papel replantado REPROVA com mensagem literal.** Mutação: `provenanceStrong: "#131722"`.

```
npm --prefix frontend run test:charts
✖ D13's floor: no token sits below the contrast floor of the surface it is drawn on
  provenanceStrong (#131722) vs surface #131722: 1.00:1 < 3.0:1
```

Ambas revertidas. `test:charts` limpo: **187/187**.

⚠️ **Ressalva de força:** a suíte do front **não está em portão nenhum** —
`grep -rn 'test:charts|test:app|test:s1|test:s3|node --test' scripts/verify.sh Makefile` → `rc=1`,
0 linhas; `grep -c 'portao "' scripts/verify.sh` → **9**, nenhum de teste de front. O portão de
contraste protege contra quem lembrar de rodá-lo, não contra regressão.

---

## 2. 🔴 BLOCKER-1 — a paleta clara NÃO morreu: ela sobreviveu em `globals.css`

`ColorMode`/`TOKENS_BY_MODE` de fato sumiram de `frontend/src/` (só restam prosa e um teste que
assere a ausência). **Mas `frontend/src/app/globals.css:75-93` mantém um bloco vivo:**

```css
@media (prefers-color-scheme: light) {
  :root {
    --color-provenance-strong: #131722;
    --color-provenance-weak:   #57606a;
    --color-surface-base:      #ffffff;   /* :84 */
```

Num navegador em modo claro — o padrão de muito SO — a superfície real é `#ffffff`, e não o
`#131722` que `SURFACE_BASE` afirma. Medido com a **própria aritmética do portão** (`contrast.ts`):

| papel | vs `#131722` (o que o portão mede) | vs `#ffffff` (o que o browser pinta) | piso |
|---|---:|---:|---:|
| `provenanceStrong` (linha de OI) | 14,72:1 | **1,22:1** ⛔ | 3,0 |
| `dataBrokenInk` | 9,68:1 | **1,85:1** ⛔ | 3,0 |
| `provenanceWeak` (volume) | 5,82:1 | 3,08:1 | 3,0 |
| `directionUpFill` | 5,01:1 | 3,57:1 | 3,0 |

⇒ **a linha de OI volta a ser praticamente invisível (1,22:1)** — a mesma classe de defeito que
`D13` existe para matar, reintroduzida por CSS em vez de por parâmetro de tema.

**E o portão foi escrito para não ver isso.** `color-contrast.test.ts` usa
`/^ {2}--color-surface-base:\s*(#[0-9a-fA-F]{6});/m` com o comentário *"NOT one nested in a media
query"*. As duas declarações reais têm indentação **2** (linha 28) e **4** (linha 84):

```
regex do gate captura: #131722
declaracoes REAIS no arquivo: #131722, #ffffff (n=2)
```

O regex ancorado em 2 espaços **exclui por construção** a declaração que o falsifica. Isso é a
allowlist disfarçada que eu procurava — não no eixo dos papéis (esse é honesto), mas no eixo da
**superfície**: o app pinta 2 superfícies e o portão declara 1.

**E a medição de `D13` herda o mesmo vício de universo.** `DECISOES-OWNER.md:269` conta
*"tokens em `globals.css` (`@theme`, **sem media query**) | claro **0** | escuro 10"* e conclui *"o
app já era escuro-apenas"*. O qualificador *"sem media query"* remove do universo exatamente o
contraexemplo. `[MEDIDO 2026-09-11: n=2 declarações de `--color-surface-base`]`.

---

## 3. 🔴 BLOCKER-2 — o e2e carro-chefe da wave compara DUAS APIs DIFERENTES e é vermelho

`make e2e` (o harness canônico, que constrói o próprio servidor) — **determinístico em 2 execuções**:

```
make e2e  → rc=2 · 3 failed, 21 passed (58,3s / 52,8s)
E2E-FACT 08-symbol-dado-real volume_api_rows_with_value=916
E2E-FACT 08-symbol-dado-real volume_dom_present_points=0
✘ o número na tela é o número da API — e a ausência é SEM_PONTO, nunca 0
  expect(domPresentPoints).toBe(apiPresent.length)  Expected: 916  Received: 0
```

**Causa-raiz, e não é o app:** o spec aponta para um backend que o harness nunca configura —

```
frontend/e2e/08-symbol-dado-real.spec.ts:69
const API_BASE_URL = process.env.E2E_SENTIMENTO_API_BASE_URL ?? "http://localhost:8000/api/v1";

grep -c 'E2E_SENTIMENTO_API_BASE_URL' scripts/e2e-env.sh Makefile  →  0  e  0
scripts/e2e-env.sh só exporta: INGEST_HEALTH_API_BASE_URL="http://127.0.0.1:$api_port"
```

⇒ sob `make e2e`, **a PÁGINA** fala com a API efêmera de fixture em `$api_port`, e **o TESTE** fala
com `localhost:8000`, que é a **API de PRODUÇÃO do owner** (`curl` → `"n_entries":11`, catálogo
real). O teste confronta o DOM de uma página servida por fixture contra os números da produção: os
dois lados **nunca podem concordar**, e `916 vs 0` é isso, não um bug de wiring do `/symbol`.

Consequências, todas ruins: (i) o teste anti-regressão da fatia é **garantidamente vermelho** no
harness canônico; (ii) ele **lê da produção** durante o e2e; (iii) num ambiente limpo sem nada na
`:8000` ele erra em vez de asserir. O verde que o builder registrou (`INDEX.md`: *"3 passed,
volume_dom_present_points=833 == 833"*) veio de um arranjo **não-canônico** (`next start -p 3111`
apontado para produção) onde os dois lados coincidiam na mesma API — coincidência, não fixação.

**As outras 2 falhas de `make e2e` são pré-existentes**, não desta wave: `01-console-carrega` e
`04-interacoes` esperam `catalog_rows:10` e recebem `11`; `git diff --stat master..wave/03 --
frontend/e2e/01-*.spec.ts frontend/e2e/04-*.spec.ts` → **vazio**.

---

## 4. `SEM_PONTO` nunca vira zero — coberto em unidade, NÃO provado no DOM

`view-model.test.ts:70` (*"a SEM_PONTO row becomes a bare WhitespaceItem, never {value: 0}"*) passa,
e `test:app` está **156/156**. O spec e2e tem as asserções certas (`expect(readingText).toContain
(ABSENCE_TOKEN)` + `.not.toMatch(/\d/)`), **mas elas nunca chegam a rodar** — o teste morre na
asserção (a) de contagem, por `BLOCKER-2`. ⇒ **no DOM, isto está NÃO MEDIDO.**

## 5. `npx --prefix frontend` é falso-negativo — confirmado

```
npx --prefix frontend playwright test --list  → Error: module is not linked · Total: 0 tests in 0 files
cd frontend && npx playwright test --list     → Total: 24 tests in 8 files
```

## 6. Ressalva do builder sobre `test:s1` — PROCEDE

| | wave `d480dcc` | `master` |
|---|---|---|
| `npm --prefix frontend run test:s1` | 105 testes, 97 pass, **8 fail** | 105 testes, 97 pass, **8 fail** |

Causa idêntica nos dois: `StoreParentDirectoryMissingError: … does not exist: data/md`
(`store_parent_missing`). `git diff --name-only master..wave/03 | grep -c s1-console` → **0**.
⇒ **ambiental, não regressão.** Nota útil: `scripts/e2e-env.sh` sobe a API com `cd backend` e nunca
define `QUARANTINE_STORE_PATH`, cujo default é `data/md/series_quarantine.sqlite3`
(`backend/src/main/__init__.py:67,72`) ⇒ `mkdir -p backend/data/md` é o que destrava o `make e2e`.
Como `data/` é gitignored, **num clone limpo `make e2e` não sobe** — vale um alvo de `make`.

## 7. `make verify` — VERDE

```
bash scripts/verify.sh  → VERIFY_RC=0 · veredito: VERDE — 6 portões mediram e passaram
[OK] lint-backend rc=0 413 source files
[OK] lint-frontend rc=0 ESLint + tsc --noEmit --strict
[OK] test rc=0 2120 passed · Total coverage: 96.96%
[OK] boundaries rc=0 7 kept, 0 broken
[OK] regras rc=0 0 bloqueio(s), 66 aviso(s)
[OK] política rc=0
```

## 8. Doc delta

`docs/INDEX.md` **append-only respeitado**: linhas removidas = **0**, acrescentadas = **4**.
`DESIGN_SYSTEM.md` ganhou tarja correta sobre `D13`. ⚠️ **Incompleto no ponto que importa:** nem a
tarja nem `D13` mencionam o bloco `@media (prefers-color-scheme: light)` de `globals.css`, que é a
única superfície onde a paleta clara continua viva e onde o piso de contraste é violado.

---

## Veredito

```
- [OK]   Portão de contraste é estrutural (TS2741) e morde (mensagem literal)
- [FAIL] Paleta clara morta — globals.css:75-93 viva; OI a 1,22:1 sob prefers-color-scheme: light
- [FAIL] Portão afere 1 superfície; o app pinta 2 (regex do gate exclui a 2ª por construção)
- [NÃO MEDIDO] SEM_PONTO no DOM — asserção não alcançada (bloqueada por BLOCKER-2)
- [FAIL] Playwright: make e2e rc=2, 3 failed/21 passed, determinístico em 2 execuções
- [FAIL] e2e 08 compara página(fixture) contra API(produção) — E2E_SENTIMENTO_API_BASE_URL nunca setada
- [OK]   test:charts 187/187 · test:app 156/156 · test:s3 111/111
- [OK]   test:s1 8 fail é AMBIENTAL (idêntico em master, 0 arquivo s1-console no diff)
- [OK]   make verify VERDE 6/6 · regras 0 bloqueio
- [OK]   docs/INDEX.md append-only (0 removidas / 4 acrescentadas)
- [FAIL] Doc delta omite a sobrevivência da paleta clara em globals.css
```

**Veredito: NEEDS_FIX**

### Ações
1. `frontend/src/app/globals.css:75-93` — remover o bloco `@media (prefers-color-scheme: light)`
   (é o que `D13` diz ter feito), **ou** declarar as 2 superfícies e estender `ContrastBackdrop`
   para aferir contra ambas. Enquanto houver 2 superfícies e 1 constante, o portão é parcial.
2. `frontend/src/charts/color-contrast.test.ts` — trocar o regex ancorado em 2 espaços por uma
   leitura **total** das declarações de `--color-surface-base`, falhando se `n != 1`. Hoje ele
   passa justamente por não olhar.
3. `frontend/e2e/08-symbol-dado-real.spec.ts:69` — o spec não pode cair em `localhost:8000` por
   default. Fixar no mesmo backend da página (o `api_port` de `e2e-env.sh`), e `scripts/e2e-env.sh`
   exportar a variável. Sem isso o teste não mede o app sob teste.
4. `scripts/e2e-env.sh` — criar/exportar `QUARANTINE_STORE_PATH` para que `make e2e` suba em clone
   limpo (`data/` é gitignored).
5. `docs/product/DESIGN_SYSTEM.md` + `handoff/DECISOES-OWNER.md` `D13` — corrigir a afirmação de
   universo: a contagem *"claro 0"* exclui a media query, onde a paleta clara está viva.
