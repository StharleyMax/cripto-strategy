# QA Gate (Front) — RE-VALIDAÇÃO da wave `03` (`cinco-metricas-do-core`)

Branch `wave/03-producao-e-janela-deslizante`, HEAD `ff15921` ("tema claro vivo no CSS e e2e
comparando duas APIs"). Checkout principal. Antecessor: `gates/QA-wave-03-d13.md` (NEEDS_FIX, 2
blockers). **Nada foi aceito por alegação — cada blocker foi re-quebrado por mutação.**

⛔ Nenhuma escrita no ledger · ⛔ `backend/` intocado (`git status --porcelain backend/` vazio ao
fim) · ⛔ nada semeado em Postgres (só `GET` read-only contra `:8000`) · toda mutação revertida,
`git status --porcelain frontend/` vazio ao fim.

---

## BLOCKER-1 — CONFIRMADO-CONSERTADO (a cegueira de grafia não voltou)

Baseline: `npm --prefix frontend run test:charts` → **189/189** (era 187).

**8 mutações em `frontend/src/app/globals.css`**, cada uma seguida de
`node --test src/charts/color-contrast.test.ts`, cada uma revertida:

| # | grafia reintroduzida | resultado |
|---|---|---|
| 1 | `@media (prefers-color-scheme: light)` com **tabulação** | **fail 2** ✅ |
| 2 | idem, **6 espaços** de indentação | **fail 2** ✅ |
| 3 | `@media(prefers-color-scheme:light){…}` **sem espaço nenhum** | **fail 2** ✅ |
| 4 | `@media (prefers-color-scheme: LIGHT)` + `#FFFFFF` **maiúsculo** | **fail 2** ✅ |
| 5 | **bloco original verbatim** (`git show d480dcc:…globals.css`, linhas 75–93) | **fail 2** ✅ |
| 6 | remoção de `:root { color-scheme: dark; }` | **fail 1** ✅ |
| 7 | `.light-theme { --color-surface-base: #fff; }` (**hex de 3 dígitos, fora de media query**) | **fail 0** ⚠️ |
| 8 | `[data-theme="light"] { --color-surface-base: rgb(255 255 255); }` (**fora de media query**) | **fail 0** ⚠️ |

⇒ as três grafias que o gate pediu (tabulação, 6 espaços, sem espaço) **reprovam**, com a mensagem
literal `globals.css declares --color-surface-base 2x (#131722, #ffffff)…`. A âncora de 2 espaços
morreu: o regex agora é `/--color-surface-base:\s*(#[0-9a-fA-F]{6})\s*;/g` sobre o arquivo **sem
comentários**, e a asserção é `deepEqual(declarations, [SURFACE_BASE])` — conta, não "existe".

**E o falsificador CALA corretamente:** o próprio `globals.css` hoje tem um parágrafo de comentário
citando `@media (prefers-color-scheme: light)` e a string `color-scheme: dark`, e o gate passa —
`cssWithoutComments()` é o que impede o gate de disparar sobre a própria explicação.

⚠️ **WARNING-1 — o buraco que sobrou, e é estreito:** a asserção de contagem só enxerga hex de **6
dígitos**. Uma segunda superfície declarada com `#fff` ou `rgb()` **e fora de um bloco
`prefers-color-scheme`** passa (mutações 7 e 8, `fail 0`). Escapar exige as duas coisas ao mesmo
tempo — dentro de media query, a asserção 2 pega qualquer notação. Não reabre o `BLOCKER-1`
(o defeito real era o bloco de media query, e ele reprova em toda grafia testada), mas o portão
afirma mais do que mede. Correção de uma linha: aceitar `#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})|rgba?\(`
no mesmo `matchAll`.

Universo: `find frontend/src -name '*.css'` → **1 arquivo** (`globals.css`), então a leitura de um
arquivo só é total hoje.

---

## BLOCKER-2 — CONFIRMADO-CONSERTADO (rodado por mim, do checkout, 3 execuções)

```
make e2e  → rc=0 · 24 passed (38,5s)      [run 1]
make e2e  → rc=0 · 24 passed (40,3s)      [run 2]
```
Determinístico em 2 execuções limpas (a 3ª, com mutação, ver abaixo).

**A ponta que o parecer anterior mediu como causa está fechada.** `sentimentoApiBaseUrl()` **lança**,
provado com a variável desdeclarada e com ela vazia:

```
env -u E2E_SENTIMENTO_API_BASE_URL node … → LANCOU: "E2E_SENTIMENTO_API_BASE_URL is not set — …"
E2E_SENTIMENTO_API_BASE_URL=       node … → LANCOU (idem)
grep -rn 'localhost:8000' frontend/e2e/ → 2 linhas, AMBAS em comentário (helpers.ts:101, 08-…:73)
```
Nenhum default vivo. A origem é uma só: `scripts/e2e-env.sh:114-118` escreve
`$STATE_DIR/api_base_url` = `http://127.0.0.1:$api_port` + `${API_PREFIX:-/api/v1}`, e o
`Makefile:324` exporta essa string como `E2E_SENTIMENTO_API_BASE_URL` ao lado de `E2E_BASE_URL`.

**Universo forte verificado por mim, independente do builder, read-only e SEM semear:**
`next build` limpo + `next start -p 4399` com `INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8000`
(a API de produção, só `GET`), Playwright só no spec `08`:

```
series_window_reader_present=true · volume_series_history_status=200
volume_api_rows_with_value=960  ==  volume_dom_present_points=960
volume_last_reading_text="Leitura atual: 1290.136"  ==  volume_api_last_instant_value="1290.136"
volume_readable_horizon:960/5760 · klines_last/sum_open_interest → "SEM_PONTO"   → 3 passed
```
O `940 == 940` do commit **se reproduz** (960 agora; o número cresce com o relógio porque o coletor
de volume está vivo — mesma ordem, mesma propriedade).

**Os 2 defeitos de ambiente NÃO mascaram falha real — testei os dois:**

```
make e2e E2E_NEXT_PORT=3000 → rc=2 "RECUSA: porta 3000 (next start) ja tem algo escutando"
make e2e E2E_API_PORT=8000  → rc=2 "RECUSA: porta 8811→8000 (API) ja tem algo escutando"
```
Recusa **alta e com rc≠0**, nunca verde silencioso. `QUARANTINE_STORE_PATH` agora aponta para o
`$STATE_DIR` efêmero (`e2e-env.sh:136`), com o motivo escrito no próprio script — o default
`data/md/series_quarantine.sqlite3` (`main/__init__.py:67`) não é mais tocado por `make e2e`.

---

## 🔴 BLOCKER-3 (NOVO) — `24 passed` NÃO distingue `SEM_PONTO` correto de página que não publica nada

Foi a pergunta do despacho, e a resposta é medida, não opinada.

Sob `make e2e` o harness compõe **sqlite**, `ADR-034/D9` não dá reader de `md.series`, e
`/series-history` responde **500** ⇒ os fatos do run canônico são:

```
series_window_reader_present=false · volume_api_rows_with_value=0 · volume_dom_present_points=0
volume_readable_horizon:0/0 · volume_last_reading_text="Leitura atual: SEM_PONTO"
```

A asserção carro-chefe é `expect(domPresentPoints).toBe(apiPresent.length)` — aqui, `0 === 0`.

**MUTAÇÃO (a prova):** apaguei `data-volume-present-points={volume.presentPoints}` de
`SymbolClient.tsx:256` — a página deixa de publicar o número que o gate lê.

| universo | comando | resultado |
|---|---|---|
| **fraco (canônico)** | `make e2e` | **rc=0 · 24 passed** ⛔ — `volume_dom_present_points=0`, idêntico ao run limpo |
| **forte** (`:4399` × API de produção) | `playwright test e2e/08-…` | **1 failed** ✅ `Expected: 965 · Received: 0` |

`Number(await subAxis.getAttribute("data-volume-present-points"))` ⇒ `Number(null) === 0`, e no
universo fraco a API também vale 0 ⇒ **a asserção passa com o contrato inteiramente ausente do DOM.**
O elemento ainda é exigido (`toHaveCount(1)`), então "página que não renderiza nada" reprova; mas
"página que renderiza e não publica o número" **não reprova** — e essa é exatamente a classe do
defeito que a fase `04` de `pagina-de-grafico-s2` teve de achar **na produção, na mão**.

O portão canônico, portanto, **é verde sobre um universo vazio**. Isso não é desonestidade do spec —
ele publica `series_window_reader_present=false` em todo run, e o acoplamento que impede o universo
forte no harness é `backend/` e já foi escalado. Mas o remédio está num **arquivo de teste** e custa
uma linha:

```ts
const rawPoints = await subAxis.getAttribute("data-volume-present-points");
expect(rawPoints, "a página parou de publicar data-volume-present-points").not.toBeNull();
const domPresentPoints = Number(rawPoints);
```

Com ela, MUT-A reprova **também** em `make e2e` — o par morde/cala volta a existir no universo que o
portão consegue rodar.

---

## Demais medições

```
bash scripts/verify.sh → VERDE 6/6 (lint-backend, lint-frontend, test 2120 passed/96,96%,
                          boundaries 7 kept, regras 0 bloqueio/66 aviso, política)  rc=0
harness rules --mode sweep --changed-only → rc=0
npm --prefix frontend run test:charts → 189/189 · test:app → 156/156 · test:s3 → 111/111
npm --prefix frontend run test:s1 → 105 testes, 97 pass, 8 FAIL
```

⚠️ **Uma execução de `verify.sh` às 18:06:35Z reprovou em `lint-frontend`** por
`frontend/src/app/symbol/_ephemeral-morde-symbol-deep-import.ts` — arquivo de mutação **de outro
agente ativo neste mesmo checkout**, não do wave. Re-rodado com a árvore limpa às 18:18:43Z:
**VERDE 6/6**. Registrado porque mede contenção de checkout, não código.

**`test:s1` — 8 falhas, AMBIENTAL, não regressão desta wave** (idêntico ao parecer anterior):
`server process exited early with code 1: store_parent_missing`; `ls -d backend/data/md` →
inexistente; `git diff --name-only master..wave/03 | grep -c s1-console` → **0**. O conserto de
`QUARANTINE_STORE_PATH` cobriu `scripts/e2e-env.sh`, **não** o spawn de servidor do helper de `s1` —
vale um achado próprio, fora do escopo destes 2 blockers.

**Doc delta:** `git show ff15921 -- docs/INDEX.md` → **0 linhas removidas, 1 acrescentada**
(append-only respeitado). `DESIGN_SYSTEM.md` §1.2 ganhou a tabela com comando e `n` e **nomeia** a
sobrevivência da paleta clara no CSS (linhas 423–433); `DECISOES-OWNER.md:280` corrige o universo do
`D13` — o qualificador *"sem media query"* continua na tabela da linha 269 mas é desmentido
explicitamente 11 linhas abaixo. Ação 5 do parecer anterior: **paga**.

⚠️ **Ressalva de força, inalterada:** `grep -rn 'node --test' scripts/verify.sh Makefile
.git/hooks/pre-push` → **0 linhas**. As 5 suítes de front (`charts`/`app`/`s1`/`s3` + Playwright)
**não estão em portão nenhum** — nem o portão de contraste que esta wave construiu. Ele protege
contra quem lembrar de rodá-lo.

**Artefatos:** `make e2e` reescreve os PNGs versionados em
`docs/context/camada-de-leitura-do-painel/gates/e2e-shots/`. Os 4 modificados pelas MINHAS execuções
foram restaurados (`git checkout --`) e o `01-console-1280-padrao.png` que elas criaram, removido —
qualquer run do gate o regenera.

---

## Veredito

```
- [OK]   BLOCKER-1 consertado — 5 grafias de @media reprovam (tab/6sp/sem-espaço/maiúsculo/verbatim), fail 2
- [OK]   color-scheme: dark é asserido e morde quando removido (fail 1)
- [WARN] gate cego a `#fff`/`rgb()` FORA de media query (2 de 8 mutações, fail 0)
- [OK]   BLOCKER-2 consertado — make e2e rc=0, 24 passed, determinístico em 2 execuções
- [OK]   sentimentoApiBaseUrl() LANÇA sem a variável e com ela vazia; 0 default de produção vivo
- [OK]   universo forte reproduzido por mim, read-only: 960 == 960, readout == API
- [OK]   recusa de porta ocupada é rc=2 alto, não mascara nada; QUARANTINE_STORE_PATH efêmero
- [FAIL] o verde de `make e2e` é sobre universo VAZIO: mutação que apaga o contrato do DOM → 24 passed
- [OK]   a MESMA mutação reprova no universo forte (Expected 965 · Received 0) — a asserção é real
- [OK]   make verify VERDE 6/6 · harness rules sweep rc=0
- [OK]   test:charts 189/189 · test:app 156/156 · test:s3 111/111
- [OK]   test:s1 8 fail AMBIENTAL (store_parent_missing; 0 arquivo s1 no diff da wave)
- [OK]   docs/INDEX.md append-only (0 removidas / 1 acrescentada); doc delta da ação 5 pago
```

**Veredito: NEEDS_FIX** — os **dois blockers do parecer anterior estão CONFIRMADOS CONSERTADOS**; o
que reprova é um **achado novo**, e é o que o despacho mandou procurar.

### Ações
1. `frontend/e2e/08-symbol-dado-real.spec.ts:342` — exigir que
   `data-volume-present-points` **exista** antes de `Number()`. Hoje `Number(null) === 0` faz a
   asserção passar com o contrato ausente do DOM sob `make e2e`. (arquivo de teste)
2. `frontend/src/charts/color-contrast.test.ts:107` — aceitar hex de 3 dígitos e `rgb()/rgba()` na
   contagem de `--color-surface-base`. (arquivo de teste)
3. Achado à parte, fora destes blockers: o helper que sobe a API nas suítes `s1` precisa de
   `QUARANTINE_STORE_PATH` efêmero, como `scripts/e2e-env.sh` já faz — 8 testes reprovam em clone
   limpo por `data/md` inexistente.

---

# ADENDO — CICLO DE CORREÇÃO (2026-09-11, 18:4x UTC, mesmo autor)

Despacho: consertar o `BLOCKER-3` e os 2 avisos, **só em arquivo de teste**, e **re-rodar a minha
própria mutação no portão canônico**. Diff total: **2 arquivos, ambos de teste**
(`git --no-pager diff --numstat -- frontend/` → `frontend/e2e/08-symbol-dado-real.spec.ts` **+19/−1** ·
`frontend/src/charts/color-contrast.test.ts` **+65/−4**). `backend/` intocado, nada semeado em Postgres,
nenhuma escrita no ledger, os 4 PNGs de `e2e-shots/` restaurados e o `01-console-…png` gerado pelas
minhas execuções removido.

## BLOCKER-3 — FECHADO, e a prova é a mutação reprovando NO PORTÃO CANÔNICO

`frontend/e2e/08-symbol-dado-real.spec.ts:342-360` — o atributo é exigido **antes** de virar número:

```ts
const rawPresentPoints = await subAxis.getAttribute("data-volume-present-points");
expect(rawPresentPoints, "a página parou de publicar `data-volume-present-points` …").not.toBeNull();
expect(rawPresentPoints ?? "", "… vazio vira 0 em `Number()`").toMatch(/^\d+$/);
const domPresentPoints = Number(rawPresentPoints);
```

A segunda asserção fecha o mesmo buraco pela outra porta: `Number("")` também é `0`, então
`not.toBeNull()` sozinho ainda deixaria `data-volume-present-points=""` passar.

**MUT-A re-rodada, idêntica à do parecer** (apagar `data-volume-present-points={volume.presentPoints}`
de `SymbolClient.tsx:256`), **no portão canônico `make e2e`**:

| universo | antes do conserto | DEPOIS |
|---|---|---|
| **canônico** `make e2e` | rc=0 · **24 passed** ⛔ | **rc=2 · 1 failed · 23 passed** ✅ |

Saída literal do run mutado:

```
1) [chromium] › frontend/e2e/08-symbol-dado-real.spec.ts:316:1 › o número na tela é o número da API …
   Error: a página parou de publicar `data-volume-present-points` — sem o atributo não há o que
   comparar com a API, e `Number(null) === 0` faria esta asserção passar sobre um DOM sem contrato
   expect(received).not.toBeNull()
   Received: null
  1 failed / 23 passed (34.9s)
```

`SymbolClient.tsx` restaurado do backup imediatamente após (`git status --porcelain frontend/src`
devolve só o arquivo de teste). **CALA:** com a árvore limpa, `make e2e` → **rc=0 · 24 passed**
(`volume_dom_present_points=0`, o universo vazio do harness) — a asserção nova não reprova o run
legítimo, ela só distingue *"a janela não tem ponto"* de *"a página não publica nada"*.

## AVISO-1 — FECHADO, as 2 grafias que davam `fail 0` agora reprovam

`frontend/src/charts/color-contrast.test.ts` — o valor deixa de ser lido por padrão de hex-6 e passa
a ser lido **inteiro** (`--color-surface-base:\s*([^;{}]+);`) e depois **normalizado**
(`normalizeCssColor`: `#fff`/`#FFF`/`rgb(255 255 255)`/`rgba(255,255,255,1)` → `#ffffff`; notação
ilegível volta verbatim e reprova alto).

| mutação (fora de media query) | antes | DEPOIS |
|---|---|---|
| `.light-theme { --color-surface-base: #fff; }` | `fail 0` ⚠️ | **`fail 1`** ✅ |
| `[data-theme="light"] { --color-surface-base: rgb(255 255 255); }` | `fail 0` ⚠️ | **`fail 1`** ✅ |

Mensagem idêntica nas duas, provando que a normalização funcionou e não só o alargamento do regex:
`globals.css declares --color-surface-base 2x (#131722, #ffffff), and this gate can only measure ONE
surface …`. `globals.css` restaurado do backup nas duas.

**E o par morde/cala virou teste versionado, não só linha de relatório** (+2 testes, `charts`
189 → **191**):
- **MORDE:** `#fff`, `#FFF`, `rgb(255 255 255)`, `rgba(255, 255, 255, 1)`, `RGB(255,255,255)` como
  segunda declaração ⇒ contagem 2;
- **CALA:** `#131722`, `#131722  `, `#131722\n`, `rgb(19 23 34)`, `RGB(19, 23, 34)` como declaração
  **única** ⇒ contagem 1. Sem esta metade o conserto seria só um regex mais estrito, e um portão que
  dispara sobre CSS correto é um portão que alguém desliga.

## AVISO-2 — NÃO CONSERTADO POR MIM, POR MANDATO; diagnóstico entregue

O conserto toca `scripts/verify.sh`/`Makefile`, que não são arquivo de teste. Diagnóstico, patch
proposto na forma rc=3 que o próprio `verify.sh` já usa, custo medido (**42 s**: charts 31 + app 2 +
s3 1 + s1 8) e **falsificador** (replantar `.light-theme` tem de reprovar; árvore limpa tem de ficar
verde) em
[`handoff/ACHADO-SUITE-DE-FRONT-FORA-DE-PORTAO.md`](../handoff/ACHADO-SUITE-DE-FRONT-FORA-DE-PORTAO.md).
⚠️ Ele carrega o aviso que muda a ordem de aplicação: ligar `test:s1` hoje pinta `verify` de vermelho
por `store_parent_missing` (helper sem `QUARANTINE_STORE_PATH` efêmero), defeito de helper e não de
produto. **Quem aplica é o owner.**

## Portões ao fim do ciclo

```
bash scripts/verify.sh → rc=0 · VERDE 6/6 (lint-backend 413 arquivos · lint-frontend ESLint+tsc ·
                          test 2120 passed/96,96% · boundaries 7 kept · regras 0 bloqueio/66 aviso ·
                          política)                                        [18:41:52Z]
make e2e               → rc=0 · 24 passed (36,0s)                          [árvore limpa]
npm --prefix frontend run test:charts → 191/191 (era 189) · test:app 156/156 · test:s3 111/111
npm --prefix frontend run test:s1     → 105 testes, 97 pass, 8 FAIL — AMBIENTAL, inalterado, §AVISO-2
```

**Veredito do adendo: `BLOCKER-3` e `AVISO-1` FECHADOS com mutação reprovando no portão canônico.
`AVISO-2` permanece ABERTO por mandato** — é a única coisa que sobra, e o conserto está escrito.
