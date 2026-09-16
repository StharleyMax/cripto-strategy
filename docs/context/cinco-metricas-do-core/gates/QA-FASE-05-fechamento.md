# QA — Fase `05` de `cinco-metricas-do-core` (liquidações via Coinalyze), revalidação de fechamento

> `qa`, 2026-09-16, checkout principal em `master` `86c364c`, árvore limpa, `__pycache__` purgado
> (116 diretórios removidos) e `PYTHONDONTWRITEBYTECODE=1` exportado.
> Entrada: `harness status` (`f05·QA=NEEDS_FIX | f05·REVIEW=COMPLIANT`), `tasks.toml` §fase 05,
> `gates/T-05.5-T-05.6-T-05.7-qa.md` (o `NEEDS_FIX` em registro) e
> `gates/T-05.5-T-05.6-T-05.7-correcao-qa.md` (o conserto que declara, literal, *"Não fez deploy,
> e não emitiu veredito de QA"*).
>
> ⛔ **Postgres SOMENTE LEITURA** (`set transaction read only` em toda consulta), **nada semeado**,
> **sem deploy**. A chave da Coinalyze aparece aqui só como `$COINALYZE_API_KEY`.

## Veredito

**`NEEDS_FIX`** — e a razão é **uma só, e não é backend**: o `DoD-VERTICAL` exige a métrica **até o
pixel**, e **não existe painel de liquidações**. O backend está inteiro, em produção, com dado real
servido pela rota; a tela nunca recebeu a fatia.

**O conserto do `NEEDS_FIX` anterior está em `master` e está certo** — os 5 achados de
`T-05.5-T-05.6-T-05.7-qa.md` §7 foram verificados um a um abaixo, com mutação própria. O que
reprova agora é outra coisa: **5 das 14 tasks nunca foram feitas**, e 4 delas são a metade `web`
da fatia.

## 1. As 14 tasks, medidas por código em `master` e por PR mergeada — não pelo `tasks.toml`

⚠️ O `tasks.toml` marca **as 14 como `todo`** e isso não é evidência de nada: `T-05.8` mergeou na
PR #224 e `T-05.5`/`T-05.6`/`T-05.7` na PR #221. O `status` do arquivo está desatualizado, o
escritor único (`harness tasks resolve`) nunca foi chamado para esta fase.

| # | task | está em `master`? | evidência |
|---|---|---|---|
| `T-05.1` | falsificador de `denom` | ✅ **sim** | `gates/falsificador-denom-liquidacao.md`: `denom="quote"` **com a condição** `convert_to_usd=true`, que o plano não tinha. A condição é honrada em produção: `git grep -n 'convert_to_usd' backend/src` → `domain/liquidation_collection.py:111` (`f"&convert_to_usd={convert}"`) |
| `T-05.2` | retenção real | ✅ **sim** | `gates/retencao-liquidation-history.md`: **9,96 dias** em `1min` `[MEDIDO 2026-09-12, n=5 chamadas]`, contra ~1,5 d documentado. **O falsificador de `ADR-036/D4` NÃO dispara** — a retenção é MAIOR, então a recuperabilidade que comprou a decisão do owner é real, não teórica |
| `T-05.3` | identidade com 2 coortes | ✅ **sim** | `domain/liquidation_catalog.py:95` `COHORTS=(LONG, SHORT)`, commit `70ef76a`; `verified_by` gravado na identidade (`:98`) |
| `T-05.4` | chave só como `$COINALYZE_API_KEY` | ✅ **sim** | `domain/secret_leak_scan.py` + `tests/sentimento/test_coinalyze_key_never_versioned.py` (**13 testes**). `git grep -nIE 'COINALYZE_API_KEY[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9_-]{12,}'` → **5 linhas, todas dentro do próprio teste do detector** (fixtures de MORDE), **zero em arquivo de produção ou documento** |
| `T-05.5` | coletor de produção | ✅ **sim** | PR #221 (`e4b91cb`) + correção `c60e05d`; `use_cases/collect_liquidation_history.py` (159 linhas cobertas, **97%**) |
| `T-05.6` | `REJECTED` com motivo | ✅ **sim** | ver §3, item DoD-5: **0 `REJECTED` em 955 runs** da fonte desta fase, e os 235 `ACCEPTED_WITH_WARNING` trazem `notes` com o motivo literal |
| `T-05.7` | liveness por contiguidade | ✅ **sim** | ligado em produção: `infra/collectors_cli.py:2007` (`assess_liquidation_liveness`) chamado de `_assess_and_report_liveness`, e o log ao vivo confirma: `docker logs deploy-collector-1 --since 30m \| grep liveness` → `collector_liveness_assessed endpoint=/v1/liquidation-history liveness=NOT_JUDGED n_cycles=1 …` |
| `T-05.8` | 2 coortes no catálogo servido | ✅ **sim** | PR #224 (`169442c`), QA `APPROVED` em `gates/T-05.8-qa.md`; `md.series_catalog` é código, não tabela — a rota serve as duas (§3, DoD-2) |
| `T-05.9` | **painel de liquidações** | ⛔ **NÃO** | `S2Panels` tem **3 campos**: `price`, `oi`, `cvd` (`frontend/src/charts/s2-panels.ts:93-108`). `grep -rn 'sum_liquidation' frontend/src frontend/e2e` → **rc=1, 0 linhas** |
| `T-05.10` | design + `ux-ui-mastery` | ⛔ **NÃO** | `ls docs/context/cinco-metricas-do-core/gates/design-05.md` → **no matches found**. Nenhum veredito do validador sobre painel nenhum desta fase |
| `T-05.11` | e2e Playwright | ⛔ **NÃO** | `ls frontend/e2e/13*` → **no matches found**; `grep -rn 'liquidation\|liquidacoes' frontend/e2e/*.ts` → **0 linhas**. O portão `e2e` roda **12 specs / 33 testes**, nenhum sobre liquidação |
| `T-05.12` | coletor em PRODUÇÃO | ⚠️ **parcial** | o coletor **está vivo e escrevendo** (§3), mas a **N=4** (`N_piloto`), não a **N=10** (`N_alvo`), e o `DoD-6b` pede consumo **medido a N=10**. Sem gate registrado (`ls gates/T-05.12*` → no matches) |
| `T-05.13` | escalonamento ao `quant-architect` | ⛔ **NÃO** | nenhum arquivo de gate; o `DoD-6c` continua descoberto, como o próprio QA anterior já registrara (§6: *"não feita, e não é ato de builder — segue como `T-05.13`"*) |
| `T-05.14` | fechamento vertical | ⛔ **NÃO** | é a conjunção dos 8 itens; 3 deles reprovam (§3) |

**Placar: 8 completas · 1 parcial · 5 ausentes.**

## 2. O conserto do `NEEDS_FIX` anterior — verificado, e com mutação MINHA

Os testes que já existiam rodaram **antes** de qualquer mutação:

```
cd backend && PYTHONPATH="$PWD/scripts/nonet:$PWD" .venv/bin/python -m pytest -q \
  tests/sentimento/test_liquidation_collector_gate_findings.py \
  tests/sentimento/test_collectors_cli_liquidation_thread.py \
  tests/sentimento/test_liquidation_liveness.py \
  tests/sentimento/test_liquidation_catalog.py \
  tests/sentimento/test_series_history_sparse_liquidation.py
-> 39 passed in 0,77s
```

⚠️ **As mutações foram aplicadas numa CÓPIA da árvore** (`scratchpad/mut/`), nunca em
`backend/src` — o `make verify` estava rodando na árvore real, e mutar código de produção sob um
portão em curso mediria duas coisas ao mesmo tempo. `diff -rq mut/src backend/src` ao fim →
**idêntico**; `git status --porcelain` → **vazio**.

| # | mutação (o defeito que ela reintroduz) | quem reprovou |
|---|---|---|
| **M1** | `_pause_served` vira `return True` — a guarda do espalhamento para de olhar o relógio, e o `SIGTERM` volta a virar rajada (achado ⛔1 do QA anterior) | `test_a_sigterm_mid_cycle_does_not_turn_the_remaining_calls_into_a_burst` — **1 failed, 8 passed** |
| **M2** | `_assess_and_report_liveness` devolve `None` sempre — o veredito de liveness existe mas não chega ao registro durável (achado ⛔2: *"`T-05.7` com 0 chamador de produção"*) | `test_two_cycles_the_provider_never_answered_are_named_silent_in_the_run_record` — **1 failed, 6 passed** |
| **M3** | o ramo `NO_POINT` de `FLOW` sai de `as_of_accessor.py:328-329` — o buraco passa a arrastar o último valor, e **ausência vira número** (`RN-1`) | `test_a_bucket_without_a_liquidation_is_sem_ponto_and_never_zero[long,short]` + `..._makes_every_instant_sem_ponto[long,short]` — **4 failed, 2 passed** |

**3 mutações, 3 reprovas.** O verde da fase 05 não é verde de teste ausente.

## 3. O `DoD` da fase, item a item — os 8 de `T-05.14`

Consultas ao Postgres de produção, **todas em transação somente-leitura**, via
`docker exec deploy-api-1 python -c "… set transaction read only …"`.

| # | item | veredito | número e comando |
|---|---|---|---|
| 1 | as duas coortes em `md.series`, `count(*) > 0` | ✅ **OK** | `select series_key_id, symbol, count(*) … where source='/v1/liquidation-history' group by 1,2` → **8 séries** (4 símbolos × 2 coortes), **193.405 linhas**. BTCUSDT: `23e4332…` (cohort `long`) **33.055** e `bc0b8a7…` (cohort `short`) **33.038** — e os dois `series_key_id` são **exatamente** os que `coinalyze_liquidation_key('long'/'short').series_key_id()` produz. Era `0` em 2026-09-10 |
| 2 | `series-history` com `n_points > 0` para **cada** coorte | ✅ **OK** | `GET /api/v1/series-history?series_key_id=…&interval=1m&window=24h&bar_policy=final_only` → `long`: 1.440 linhas, **77 com ponto**; `short`: 1.440, **77 com ponto**. Esparsidão coerente com os 20,2% medidos em `retencao-liquidation-history.md` |
| 3 | Playwright, `N ≥ 30` pontos distintos em janela com liquidação | ⛔ **FAIL** | o arquivo `frontend/e2e/13-liquidacoes-dado-real.spec.ts` **não existe**; `make e2e` roda **33 testes em 12 specs**, nenhum de liquidação |
| 4 | run fechado com `n_written > 0` | ✅ **OK** | `select count(*), sum((n_written>0)::int) from md.ingest_run where source='coinalyze'` → **955 runs, 725 com `n_written > 0`**, de `2026-09-12T23:41Z` a `2026-09-16T10:44Z` |
| 5 | **zero** `REJECTED` com `api_code` E `notes` ambos nulos, na fonte desta fase | ✅ **OK** | `select verdict, count(*) … group by 1` → `ACCEPTED` **720**, `ACCEPTED_WITH_WARNING` **235**, `REJECTED` **0**. E o motivo está escrito: o `notes` mais frequente é literal — *"BTCUSDT: transport: gaierror: Temporary failure in name resolution; cycle stopped after 1 of 4 symbols…"* (227×). Era **2 de 2 violando** em 2026-09-10 |
| 6 | retenção medida | ✅ **OK** | `9,96 d` a `1min` `[MEDIDO 2026-09-12, gates/retencao-liquidation-history.md]`, e o falsificador de `ADR-036/D4` **não dispara** |
| 6b | cota: **teste** recusa > 40 u/60 s **e** **medição** em produção ≤ 5% do teto **a N=10** | ⚠️ **METADE** | a metade de teste passa (§2 do QA anterior + suíte verde). A medição existe mas é **a N=4**: `select count(*), sum(weight_used) … interval '6 hours'` → **75 ciclos, 293 unidades em 360 min = 0,814 u/min = 2,03% do teto de 40 u/min**. **`N=10` nunca rodou** — e subir de 4 para 10 é deploy, que este gate não faz |
| 6c | escalonamento de fidelidade ao `quant-architect` | ⛔ **FAIL** | `T-05.13` não foi feita; nenhum gate |
| 7 | veredito `APPROVED` do `ux-ui-mastery` | ⛔ **FAIL** | não há painel para validar, nem `design-05.md` |
| 8 | `make verify` verde | ✅ **OK** | ver §4 |

## 4. `DoD-VERTICAL` — a métrica até o pixel, e é aqui que a fase não fecha

⛔ **Medido contra a aplicação REAL que está de pé**, não contra o código:

```
curl -s http://localhost:3000/symbol | grep -oE 'data-testid="[^"]+"' | sort -u
-> data-testid="cvd-pane"
-> data-testid="oi-pane"
-> data-testid="price-pane-volume-subaxis"
```

**3 painéis na tela, nenhum de liquidação.** O dado existe, está fresco (último `event_time`
`1789554420000`, ~17 min atrás numa série cuja cadência é 5 min e cujo bucket em curso é
deliberadamente descartado por `RS-3.4`), e a rota o serve com 77 pontos por coorte em 24 h — e
**o operador não o vê**. É exatamente a queixa que abriu a feature: *"um painel que entrega nada"*.

Isto não é rigor formal sobre uma task de web faltante: sem o painel, `RS-5` (o rótulo de série de
TERCEIRO) **não existe em lugar nenhum**, e `M4` é a única série de terceiro da feature depois de
`GA-7`. O dado de terceiro chegaria à tela sem dizer que é de terceiro — se chegasse.

## 5. `make verify` — 8 portões, VERDE

```
make verify   (saída bruta: /tmp/verify-cripto-strategy-20260916T104319Z.log, 148K)
[OK] lint-backend    rc=0  452 source files
[OK] lint-frontend   rc=0  ESLint + tsc --noEmit --strict
[OK] test-frontend   rc=0  628 pass, 0 fail em 4 suítes
[OK] test            rc=0  2482 passed · Total coverage: 96,65%
[OK] boundaries      rc=0  7 kept, 0 broken
[OK] regras          rc=0  0 bloqueio(s), 73 aviso(s)
[OK] política        rc=0
[OK] e2e             rc=0  33 passed (34,7s)
veredito: VERDE — 8 portões mediram e passaram
```

**Piso por camada (o portão `test` o cobra depois da suíte):**
`domain` **99,8%** (meta 90%) · `use_cases` **99,7%** (meta 80%) · `infra` **93,0%** (meta 70%).

**Os módulos desta fase, um a um:** `liquidation_catalog` 100% · `liquidation_liveness` 100% ·
`liquidation_zero_legitimacy` 100% · `liquidation_reconciliation` 100% · `liquidation_collection`
98% · `collect_liquidation_history` 97% · `coinalyze_history_client` 86%.

## 6. As 8 regras bloqueantes em vigor — todas avaliadas

`harness rules list --severity block` → **8 regras**. O portão `regras` do `make verify` as roda
todas e devolveu **0 bloqueio(s)** (73 avisos, nenhum bloqueante). Verificação extra da que mais
importa a esta fase, por ser a única integração de terceiro:

- `core.hardcoded-secret` (escopo `production`) e `own.compose-hardcoded-secret` — além do portão,
  o `git grep` de literal com valor devolveu **apenas fixtures do próprio detector**
  (`test_coinalyze_key_never_versioned.py:114,120,174,175,179`), **0 em produção, 0 em documento**.
  `.env.example:76` carrega `COINALYZE_API_KEY=` — **o nome, sem valor**.

## 7. Anomalias

- **`tasks.toml` não é evidência e continua divergente:** as 14 tasks da fase `05` estão `todo`
  com 9 delas em `master`. `harness tasks validate` devolve `OK — 52 task(s), 0 ERROR, 0 WARN`,
  o que confirma que **o validador não mede desfecho**, só forma. O resolve é do orquestrador.
- **A suíte com cobertura levou ~18 min de relógio** contra os `37,5s` que o `CLAUDE.md` declara
  `[MEDIDO 2026-09-07]`. Não reprova nada (rc=0, 2.482 testes) e **não foi diagnosticado aqui** —
  `[NÃO SEI]` a causa; hipótese barata e não testada: testes com pausa real (`wchan` do processo
  lido durante a espera = `hrtimer_nanosleep`) somados à instrumentação do `coverage`.

## 8. Ações — na ordem, e a primeira é a única que muda o veredito

1. ⛔ **`T-05.9` — construir o painel de liquidações** (`web`): as **duas coortes**, ausência como
   `SEM_PONTO` e **nunca** zero (o backend já garante isso — M3 prova), e o rótulo de `RS-5`
   (`published_error`) porque é a única série de terceiro da feature. `data-testid` estável para o
   e2e. Toca `SymbolClient.tsx` e o tipo `S2Panels` (`s2-panels.ts:93-108`, hoje com 3 campos).
2. ⛔ **`T-05.10`** — `ui-designer` desenha (⛔ **Stitch, nunca Figma**) e o **`ux-ui-mastery`
   emite veredito**, registrado em `gates/design-05.md`. O desafio específico está escrito na task:
   *"sem liquidação neste minuto"* tem de ser **visualmente distinto** de *"sem dado"*.
3. ⛔ **`T-05.11`** — `frontend/e2e/13-liquidacoes-dado-real.spec.ts`, **N ≥ 30 pontos distintos**
   contra o app real, **as duas coortes**, numa janela em que **houve** liquidação. ⛔ **NUNCA
   semear o Postgres compartilhado** para forçar a janela — a série tem 77 pontos por coorte nas
   últimas 24 h, a janela existe no dado real.
4. ⛔ **`T-05.13`** — escalonamento ao `quant-architect` com as duas entradas que a task nomeia
   (a cauda de `p99 = 29 bp / max = 1.956 bp` e o `volume` divergindo mais que o `takerBuy`).
   Fecha o `DoD-6c`. **Não bloqueia a tela**, mas bloqueia o `T-05.14`.
5. ⚠️ **`T-05.12`, a metade que falta** — subir `N` de 4 para 10 e **medir** o consumo em produção
   (`DoD-6b`). Hoje: **2,03% do teto a N=4**; a projeção linear dá ~5,1% a N=10, **e projeção não
   é medição**. É ato de deploy, com dono `[AMBIENTE]`.
6. Depois de 1–5: **`T-05.14`**, o fechamento vertical, que é a conjunção dos 8 itens.
7. **`harness tasks resolve`** para a fase inteira (as 14 numa chamada só, `resolve` é atômico
   por fase), pelo escritor único — nunca editando o `tasks.toml` à mão.

---

**`NEEDS_FIX`.** O backend desta fase é sólido: está em produção há 4 dias, escreveu 193.405
linhas em 8 séries, fecha 725 runs com dado, **nunca** rejeitou sem motivo, e três mutações minhas
reprovaram onde deviam. O que falta é a metade que o `DoD-VERTICAL` existe para cobrar — **a
liquidação não está na tela**, e uma métrica que o operador não vê é uma métrica que não foi
entregue.
