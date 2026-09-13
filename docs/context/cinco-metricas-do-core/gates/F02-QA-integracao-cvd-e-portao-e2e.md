# QA Gate (Front) — PR #220 (`74d59a4`), fase `02`: CVD na tela + conserto do portão `make e2e`

**Agente:** `frontend-qa` · **Data:** 2026-09-12 · **Escopo do diff:** `git diff --stat 1528e52..HEAD`
→ **13 arquivos, 0 em `backend/`** (PR #219 intocada) · **Veredito: APPROVED**

Tudo abaixo foi **remedido por mim**, não lido do relatório do autor.

## 1 · DoD-3 / item 3 do `DoD-VERTICAL` — ponto na tela, contra app real

`backend/.venv/bin/python scripts/cvd-klines-falsifier/measure_cvd_dom.py` (klines REAIS da Binance →
Postgres **descartável** → `src.main` → `next build`+`next start` → Playwright; ⛔ nunca o Postgres
compartilhado — `docker ps` confirma que o contêiner criado foi destruído):

| fato | minha corrida | o que o autor afirmou |
|---|---|---|
| `series_window_reader_present` | `true` (universo FORTE) | idem |
| `cvd_dom_present_points` | **293** | 290 |
| `cvd_api_rows_with_value` | **293** — igual, exato | 290 |
| `cvd_series_history_rows` / grade | 5.760 / 5.760 | idem |
| `cvd_readable_horizon_fact` | `cvd_readable_horizon:293/5760` | `290/5760` |
| `cvd_last_reading_text` | `Delta atual: -0.452` — **sem** `SEM_PONTO` | `Delta atual: 1.439` |
| `rc` | **0, 2 passed (2,9 s)** | idem |

A diferença 290 vs 293 é a cauda de publicação (`bucket_end + 58 s`) sobre relógios diferentes, não
divergência: `n_written = 2400` (4 símbolos × 300 barras) nas duas. **N=293 ≥ 30**, `n=1` execução.

**O assert MORDE quando o dado some** — cópia do script FORA da árvore
(`scratchpad/mutant_tailbars10.py`, `TAIL_BARS 300→10`), repositório não tocado:
`rc=1`, `Error: DoD-3 pede N >= 30 pontos distintos no CvdPane; a tela declara 1` ·
`Expected: >= 30 · Received: 1` (`10-cvd-dado-real.spec.ts:340`). Não é decoração.

## 2 · `RN-1` — ausência é `SEM_PONTO`, nunca `0`

- **CALA:** `npm --prefix frontend run test:app` → **168 pass / 0 fail** (`n=168`).
- **MORDE:** `SymbolClient.tsx:238` `ABSENCE_TOKEN "SEM_PONTO"→"0"` → **163 pass / 5 fail**, com
  `AssertionError: absence is SEM_PONTO — for a FLOW series a number here is an error of TYPE`.
  Mutação revertida com `git checkout --`; `git status --porcelain` vazio.
- **No browser, universo FRACO** (`make e2e`, sqlite): `cvd_series_history_status=500`,
  `cvd_dom_present_points=0` **com o atributo publicado**, `cvd_last_reading_text="Delta atual:
  SEM_PONTO"` — e o spec assere `not.toMatch(/\d/)`. A armadilha `Number(null)===0` está paga na
  ordem certa (exige atributo não-nulo e `/^\d+$/` ANTES de converter).

⚠️ O `rc=2` citado no despacho eu **não encontrei** em nenhum dos dois relatórios do autor
(`grep -n 'rc=2'` → 0 linhas); o que ele afirma é `rc=1`/`160 pass, 0 fail`, e é o que se reproduz.
`[NÃO MEDIDO: rc=2]`.

## 3 · O conserto do `make e2e` é honesto

- **Sem literal sobrando:** em `04-interacoes.spec.ts` os únicos números literais são `0` (filtro que
  não casa) e `0` (botão `abrir` removido). Nem `5`, nem `20` — o subtotal vem de
  `helpers.ts::seriesCatalogMetricRowCount("sum_open_interest")`, contado por `key.metric` no MESMO
  envelope que a página renderiza, e a prova do filtro virou `0 < casadas < total`.
- `fetchSeriesCatalog` valida **`entries` como array**, não só `n_entries` — sem isso um envelope
  mutilado responderia `0` e leria como medição.
- **MORDE reproduzido por mim**, ambiente de pé uma vez (`scripts/e2e-env.sh up 1 8821 4321`):

| mutação | `rc` | saída |
|---|---|---|
| intacto (CALA) | **0** | 2 passed |
| `toBe(expectedMatches)` → `toBe(5)` | **1** | `Expected: 5 · Received: 20` |
| métrica inexistente (universo casante vazio) | **1** | `Expected: > 0 · Received: 0` |

Mutações revertidas; árvore limpa ao final.

## 4 · Portões

- `make e2e` → **`rc=0`, 26 passed (33,2 s)**, 9 specs. Fatos: `series_catalog_n_entries=48`,
  `series_catalog_n_sum_open_interest=20`, `catalog_rows_after_matching_filter=20`,
  `catalog_rows_after_nonmatching_filter=0`.
- `make verify` → **VERDE, 6/6**: `lint-backend rc=0 (426 arquivos)`, `lint-frontend rc=0`
  (**inclui `tsc --noEmit --strict`**), `test rc=0 — 2213 passed · 96,85%`, `boundaries 7 kept /
  0 broken`, `regras 0 bloqueio(s) / 69 aviso(s)`, `política rc=0`. Log:
  `/tmp/verify-agent-ace6f301f8e58e53d-20260912T200002Z.log`.

## 5 · Doc delta e rótulos

- `docs/INDEX.md`: `git diff 1528e52..HEAD -- docs/INDEX.md` → **2 linhas `+`, 0 linhas `-`**.
  Append-only respeitado.
- `PENDENCIAS-PARA-AVALIAR-DEPOIS.md`: `C5` marcado RESOLVIDO com números e mutações.
- ADR: nenhuma decisão estrutural nova — concordo. `STITCH_CONTEXT.md`: o painel veio de `9ab9fe0`
  e a microcopy nova está declarada como **proposta ao `ui-designer`**, não decisão de builder.
- Números do relatório carregam comando e universo; `[NÃO MEDIDO]` aparece onde cabe (§4.4 do
  relatório do autor: horizonte e âncora não têm mutação no nível de browser — confirmo, e não é
  bloqueante: o MORDE delas existe em `node --test`).

## 6 · Achados

1. `[WARNING]` **A suíte e2e suja artefatos versionados.** Rodar `make e2e` reescreve 4 PNGs em
   `docs/context/camada-de-leitura-do-painel/gates/e2e-shots/` e cria 1 novo — `git status` nunca
   fica limpo depois do portão. **Pré-existente**, não causado por esta PR; restaurei a árvore.
2. `[WARNING]` **Nenhuma suíte de front está em portão** (`C1`): `test:app`/`charts`/`s1`/`s3` não
   entram em `make verify`. Os 168 testes de `test:app` — inclusive os 2 novos de CVD — só protegem
   quem lembrar de rodá-los. `make e2e` é o único portão de front, e é separado de `make verify`.
3. `[WARNING]` **Worktree sem `data/`** faz `test:app` dar `rc=1` por `ENOENT` — ambiental. Confirmei
   ligando `data/` do checkout principal por symlink, removido depois.

**Veredito: APPROVED.**
