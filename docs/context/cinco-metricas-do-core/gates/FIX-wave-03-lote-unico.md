# Lote único de conserto do gate da wave `03` — 2 blockers + 1 aviso

**Autor:** `frontend-builder` · **Data:** 2026-09-11 · **Branch:** `wave/03-producao-e-janela-deslizante`
**Pareceres atendidos:** [`QA-wave-03-d13.md`](QA-wave-03-d13.md) · [`DESIGN-REVIEW-wave-03-revalidacao.md`](DESIGN-REVIEW-wave-03-revalidacao.md)

⛔ Nada em `backend/` (`git diff --name-only HEAD -- backend/` → **0 arquivos**). ⛔ Nada semeado em
Postgres — todo contato com a API de produção foi `GET`. ⛔ Nenhuma escrita no ledger.

---

## BLOCKER-1 — a paleta clara sobrevivia no CSS, e o portão era cego a ela

### O que mudou

| arquivo | o quê |
|---|---|
| `frontend/src/app/globals.css` | bloco `@media (prefers-color-scheme: light)` (13 tokens, `--color-surface-base: #ffffff`) **removido**; `:root { color-scheme: dark; }` **acrescentado** |
| `frontend/src/charts/color-contrast.test.ts` | o teste de superfície foi **reescrito em 3**, e o regex ancorado em 2 espaços morreu |

`color-scheme: dark` não é enfeite: sem ele o user agent em modo claro ainda pinta scrollbar,
`<select>`, controle de formulário e o canvas pré-pintura com a paleta clara do sistema, por cima
de uma página `#131722`. É a única declaração que alcança o que o CSS não pinta.

### O portão deixou de ser cego — 3 asserções, universo total

1. `--color-surface-base` declarado **exatamente 1 vez**, **com qualquer indentação**, e igual a
   `SURFACE_BASE`. O regex antigo (`/^ {2}--color-surface-base:/m`) excluía **por construção** a
   segunda declaração, que tinha 4 espaços — o gate lia 1 superfície enquanto o app pintava 2.
2. **Nenhum** bloco `prefers-color-scheme` no arquivo.
3. `:root` declara `color-scheme: dark`.

Os três leem o CSS **sem comentários** (`cssWithoutComments`): prosa sobre o bloco deletado não é
declaração, e um gate que dispara com a própria explicação é um gate que alguém desliga.

### Falsificador RODADO — mensagens literais

Mutação: os 5 linhas do `@media` reintroduzidas no fim de `globals.css`.

```
node --test --experimental-strip-types frontend/src/charts/color-contrast.test.ts
✖ globals.css declares --color-surface-base EXACTLY ONCE, and it is SURFACE_BASE
  AssertionError: globals.css declares --color-surface-base 2x (#131722, #ffffff), and this gate
  can only measure ONE surface (SURFACE_BASE = #131722). A second declaration is a second surface
  the app really paints and the contrast floor never sees — exactly how the light palette
  survived D13.
✖ globals.css carries NO prefers-color-scheme block — D13 left one palette, not a default
  AssertionError: globals.css reintroduced a color-scheme media query (@media
  (prefers-color-scheme: light)). D13 deleted the theme PARAMETER from charts/; a media query is
  the same parameter re-expressed in CSS, and it repaints the very surface every ratio below is
  measured against.
ℹ pass 8 · fail 2
```

Mutação revertida (`cp` do backup), arquivo restaurado, `test:charts` **189/189** (era 187: −1
teste antigo, +3 novos).

### A aritmética que motivou

`[MEDIDO 2026-09-11: `contrastRatio` de `frontend/src/charts/contrast.ts` sobre os **6** papéis de
`colorTokens()`, n=6]` — contra `#ffffff`: `provenanceStrong` **1,22:1**, `dataBrokenInk`
**1,85:1**, `provenanceWeak` 3,08, `directionUpFill` 3,57 (piso 3,0). Contra `#131722`: nenhum
abaixo do piso.

---

## BLOCKER-2 — o e2e carro-chefe comparava duas APIs; e havia um segundo sequestro, não relatado

### A origem agora é UMA, e mora em `scripts/e2e-env.sh`

| arquivo | o quê |
|---|---|
| `scripts/e2e-env.sh` | `api_base_url` declarado UMA vez, usado no `next build`/`next start` e escrito em `$STATE_DIR/api_base_url` já com `${API_PREFIX:-/api/v1}` |
| `Makefile` (alvo `e2e`) | exporta `E2E_SENTIMENTO_API_BASE_URL="$(cat "$STATE_DIR/api_base_url")" ` ao lado de `E2E_BASE_URL` — as duas pontas do mesmo `STATE_DIR` |
| `frontend/e2e/helpers.ts` | `sentimentoApiBaseUrl()` (LANÇA se indeclarada — **sem default**) + `seriesCatalogEntryCount()` |
| `frontend/e2e/08-symbol-dado-real.spec.ts` | usa o resolvedor comum; `?? "http://localhost:8000/api/v1"` **apagado** |

### Dois defeitos de ambiente que impediam o alvo de medir qualquer coisa

**(a) `make e2e` não subia** — `RECUSA: API de teste nao respondeu em 45s` +
`StoreParentDirectoryMissingError: series quarantine store parent directory does not exist:
data/md` (`data/` é gitignored). `scripts/e2e-env.sh` passa `QUARANTINE_STORE_PATH` para o
`$STATE_DIR`, como já fazia com o store de ingest health.

**(b) 🔴 um `next start` ÓRFÃO na porta 3111 sequestrava a suíte inteira, e o QA mediu através
dele.** PID `3528580`, de 2026-09-11 12:59, apontado para a API de **produção**. `next start` do
harness batia em `EADDRINUSE` e escrevia só no `next.log`; `_espera` recebia `307` do intruso e
declarava "pronto". Evidência: `/symbol` devolvia `data-volume-present-points="926"` enquanto o
`api.log` da API efêmera tinha **1** request de `series-history` — e era o meu `curl`. Isto
explica também os `catalog_rows:11` que o QA leu nos specs `01`/`04`. `e2e-env.sh` agora aplica à
porta do Next o mesmo `_porta_livre` que já aplicava à da API, com `RECUSA` explícita.

### O que o alvo canônico pode e o que NÃO pode medir — declarado, não escondido

A API efêmera do harness compõe o engine **sqlite**, e `ADR-034/D9` não dá fallback sqlite a
`md.series`: `create_app` só constrói `PostgresSeriesWindowReader` quando o store composto é
Postgres (`backend/src/main/__init__.py:238-247`). Logo `/series-history` responde **500
NotImplementedError** sob `make e2e` — asseverar `200` ali mediria o **harness**, não o app.

O spec pergunta isso **à própria API** (`GET /ready` → `store.path`, sqlite ⇒ sem reader), nunca a
uma variável de ambiente (variável seria allowlist disfarçada), publica o universo como
`E2E-FACT … series_window_reader_present=<bool>` e assere nos **dois**:

- **sem reader:** a rota tem de **recusar** (500) em vez de responder 200 com grade inventada, e a
  tela tem de imprimir `SEM_PONTO` — `0` pontos, `0/0` grades, `volume_readable_since_ms=""`;
- **com reader:** a comparação exata de sempre (contagem, readout, horizonte, painéis).

### As duas medições, com o comando literal

**1. Alvo canônico** (universo fraco, uma origem só):

```
make e2e   →   RC=0 · 24 passed (32,3s)
E2E-FACT 08-symbol-dado-real series_window_reader_present=false
E2E-FACT 08-symbol-dado-real volume_series_history_status=500
E2E-FACT 08-symbol-dado-real volume_dom_present_points=0
E2E-FACT 08-symbol-dado-real volume_last_reading_text="Leitura atual: SEM_PONTO"
E2E-FACT 08-symbol-dado-real klines_last_dom_reading_text="Leitura atual: SEM_PONTO"
E2E-FACT 08-symbol-dado-real sum_open_interest_dom_reading_text="Leitura atual: SEM_PONTO"
```

⇒ **`SEM_PONTO` no DOM está MEDIDO** (item 3 do `DoD-VERTICAL`), e agora contra a MESMA API que a
página lê.

**2. Pilha real, uma origem só** — `next start -p 3222` com
`INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8000` e o teste em `http://127.0.0.1:8000/api/v1`
(**só leitura**, nada semeado):

```
cd frontend && E2E_BASE_URL=http://127.0.0.1:3222 \
  E2E_SENTIMENTO_API_BASE_URL=http://127.0.0.1:8000/api/v1 npx playwright test e2e/08-*.spec.ts
→ 3 passed (45,6s)
series_window_reader_present=true
volume_api_rows_with_value=940   ==   volume_dom_present_points=940
volume_api_last_instant_value="103.013"  ==  volume_last_reading_text="Leitura atual: 103.013"
volume_readable_horizon_fact="volume_readable_horizon:940/5760"
klines_last / sum_open_interest: API sem valor → DOM "SEM_PONTO"
```

⇒ **o número REAL na tela é o número da API**, medido com os dois lados na mesma origem.

**Falsificador do wiring, rodado:** página na fixture (`:3111`) contra API de produção
(`:8000`) — a configuração exata do `BLOCKER-2`:

```
✘ o número na tela é o número da API — e a ausência é SEM_PONTO, nunca 0
  Expected: 940 · Received: 0
```

⇒ a asserção tem dentes; ela reprova precisamente o defeito relatado.

### Specs `01`/`04`: o literal `10` saiu, o total vem da API

`catalog_rows:10` foi escrito por `T-03.3` e `T-01.6` acrescentou a 11ª linha (`klines_volume`,
`series_catalog.py:128`) ⇒ dois specs vermelhos sem que nada do que eles medem mudasse.
`[MEDIDO 2026-09-11: `GET /api/v1/series-catalog` → `n_entries=11`; `git diff --name-only
master..HEAD -- backend/src` → **0 arquivos**, ou seja o 11º já estava em `master` — não é
regressão desta wave]`. Ambos passam a ler `seriesCatalogEntryCount()` da mesma origem: a asserção
fica mais forte (tela == API) e não envelhece na próxima métrica. O subtotal `5` do filtro de
`sum_open_interest` continua literal de propósito — é a prova de que o filtro REDUZ.

---

## AVISO — número sem o comando, pago nos dois documentos

- `docs/product/DESIGN_SYSTEM.md` §1.2, tarja de `D13`: tabela nova com **comando literal e `n`**
  para cada número (`npm --prefix frontend run test:charts` → 189/189, n=6 papéis;
  `git grep -n 'colorTokens("light")' master -- frontend/src` → 6 ocorrências / 3 arquivos;
  `grep -c -- '--color-surface-base:' …` → 1). Acrescentado o que a tarja **omitia**: a
  sobrevivência da paleta clara no CSS e o conserto.
- `docs/context/cinco-metricas-do-core/handoff/DECISOES-OWNER.md` `D13`: seção de correção — o
  qualificador *"sem media query"* **viciava o universo** (eram **2** superfícies, não 1), e o
  número `4` de chamadas de produção **não se reproduz**: são **3** (`SymbolClient.tsx:226,264,290`),
  provavelmente somado ao contract test. A decisão não muda; o número fica corrigido.

---

## Portões

```
bash scripts/verify.sh                → ver §Veredito
make e2e                              → RC=0 · 24 passed
npm --prefix frontend run test:charts → 189/189   (era 187)
npm --prefix frontend run test:app    → 156/156
npm --prefix frontend run test:s3     → 111/111
npx eslint e2e/0{1,4,8}-*.spec.ts     → 0 erro  (o `no-console` de `e2e/helpers.ts:28` é
                                         PRÉ-EXISTENTE: com a mudança em stash, ele aparece igual)
```

⚠️ **Universo declarado, de novo:** `grep -rn 'node --test' scripts/verify.sh Makefile
.git/hooks/pre-push` → **0 linhas** ⇒ a suíte do front continua **fora de portão**. `make e2e`
também está fora de `verify` (por decisão `M5`). O portão de contraste protege quem o roda.

## Não tocado, de propósito

- `charts/index.ts` (comentário PT herdado de `master`) e `page.tsx:239`/`CA-F2-3` — fora do diff
  desta wave, por instrução do despacho.
- `backend/` — builder ativo. O acoplamento "engine de ingest health ⇒ existência do reader de
  `md.series`" (`main/__init__.py:238-247`) é o que impede `make e2e` de medir o universo forte;
  **escalado, não consertado** — dono é `sentimento`/`ADR-034`.
