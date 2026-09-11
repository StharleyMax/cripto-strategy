# QA Gate — wave `03` (`wave/03-producao-e-janela-deslizante`) · `web`+`charts`+`infra`

**Veredito: NEEDS_FIX** — 1 bloqueio, e ele é invisível a `make verify` por construção.
Data: 2026-09-11. Escopo lido: `git diff --stat master...wave/03-...` (18 arquivos, 1.198+/96−).
⛔ Nada foi semeado; toda medição contra produção é `GET` por `curl`/leitura.

## 1. ⛔ BLOQUEIO — a wave zera a suíte Playwright inteira, e nenhum portão vê

`s2-panels.ts` deixou de exportar `RANGE_START_MS`/`RANGE_END_MS_EXCLUSIVE` (correto — é o defeito
que a wave fecha), mas `frontend/e2e/08-symbol-dado-real.spec.ts:12` **ainda os importa**:

```ts
import { RANGE_END_MS_EXCLUSIVE, RANGE_START_MS, S2_PRICE_USE, SYMBOL } from "../src/charts/s2-panels.ts";
```

```
$ cd frontend && npx playwright test --list
SyntaxError: The requested module '../src/charts/s2-panels.ts' does not provide an export named 'RANGE_END_MS_EXCLUSIVE'
Total: 0 tests in 0 files
$ npx playwright test --list e2e/0[1-7]*.spec.ts
Total: 21 tests in 7 files
```

⇒ **um spec que não carrega derruba a COLETA da suíte inteira**: 21 testes que passavam ficam
inalcançáveis, e o veredito é `0 tests in 0 files` — o sinal indistinguível que `ADR-012` nomeia
para o `rc=0` ("nada a rodar" ≡ "tudo quebrado"). No `master` os dois `export const` existem
(`git show master:frontend/src/charts/s2-panels.ts:44-45`) ⇒ **regressão desta wave**, não passivo.

**Por que `make verify` VERDE não contradiz isto** (medido por mim, não citado do builder):
`lint-frontend` é `eslint src` + `tsc -p tsconfig.json`, e `tsconfig.json:"include"` é
`["next-env.d.ts","src/**/*.ts","src/**/*.tsx",".next/types/**"]` — **`frontend/e2e/` está fora dos
dois**. O portão não mente: ele nunca olhou para lá.

**Agrava:** `tasks.toml:227` manda `T-01.9` escrever `09-volume-dado-real.spec.ts` *"no padrão de
`08-symbol-dado-real.spec.ts`"* — o molde do `DoD-3` é justamente o arquivo quebrado.

**Ação (arquivo de teste; NÃO a corrigi de propósito — a escolha da janela e do dado é do builder):**
reapontar `e2e/08` para a janela derivada (`resolveRouteWindow`) ou para `S2_FIXTURE_WINDOW`, e
`npx playwright test --list` voltar a ≥ 21+N. **Observação de projeto, não decidida aqui:**
`e2e/08:161` chama `seedSeriesRow` no Postgres compartilhado, que `tasks.toml:226` (`[P-seed]`,
`T-01.9`) proíbe em voz alta.

## 2. Janela deslizante — mutação morre nos DOIS módulos (builder CONFIRMADO)

Baseline antes de qualquer mutação: `npm --prefix frontend run test:charts` → **176/176**;
`test:app` → **148/148**.

| mutação (literal replantado) | comando | resultado |
|---|---|---|
| `request-window.ts`: `resolveRouteWindow` ignora `nowMs` (`FROZEN_NOW = 1787529600000`) | `test:app` | **145 pass / 3 fail** — `REPRO: the frozen window misses the data…`, `…TRACKS the clock…`, `the day list… not a literal` |
| `s2-window.ts`: borda direita fixa (`alignToTimeframeStart(1787529600000 - lagMs, …)`) | `test:charts` | **173 pass / 3 fail** — `…ends near the clock reading…`, `…CONTAINS the recent past…`, `…TRACKS the clock…` |

As duas foram revertidas por `cp` de backup; `git status --porcelain` vazio depois. **3 falhas cada,
exatamente como o builder declarou** — verde aqui não é verde de coincidência.

## 3. A fronteira `charts` ↔ `web` — estrutural, medida

- **`web` não computa geometria:** `grep -n "alignToTimeframeStart\|Math.floor\|floor(" src/app/symbol/*.ts *.tsx`
  (excluindo `*.test.*`) → **`rc=1`, nenhuma linha**. O único relógio é
  `page.tsx:173  resolveRouteWindow(Date.now())`.
- **`s2-fixture-window.ts` fora do barril:** `charts/index.ts:64` declara a exclusão em voz alta e
  `grep -rn s2-fixture-window src/` mostra **só 3 `*.test.ts` de `charts/`** importando-o.
- **E o portão MORDE, não só documenta** — probe temporário (criado e apagado):
  ```
  $ echo 'import { S2_FIXTURE_WINDOW } from "../../charts/s2-fixture-window.ts";' > src/app/symbol/qa-probe-deep-import.ts
  $ npx eslint src/app/symbol/qa-probe-deep-import.ts
  error  '../../charts/s2-fixture-window.ts' import is restricted … ADR-034/D8 … no-restricted-imports
  ✖ 1 problem (1 error, 0 warnings)
  ```
  ⇒ a rota **não consegue** reler a janela congelada nem por acidente.

## 4. `RN-1` — ausência é `SEM_PONTO`, nunca zero, e ninguém anda para trás

- `s2-absence-policy.ts:172` resolve por `findSlotAt(nativeSlots, nativeTimeframeMs, queryBucketStartMs)`
  — **lookup no instante exato**; `:174` devolve `{kind:"absent", value:null}`. Sem `find`
  decrescente, sem `while`, sem carry-forward.
- `view-model.ts:219` `resolveVolumeReading` devolve `absent/null` para grade vazia (não lança, não
  vira `0`); `:177` manda ausência para `{time}` sem `value`.
- `grep -rn "lastKnown\|carryForward\|lastPresent\|forwardFill\|ffill"` em `src/charts` + `src/app/symbol`
  (fora de teste) → **nenhuma ocorrência**. ⇒ **nada no código fabrica continuidade `FLOW`**, e a
  escalada do builder (`DoD-3` tem de contar `N ≥ 30` distintos, nunca "readout ≠ `SEM_PONTO`") não
  encontra contradição no código. `T-01.9` está `status="todo"` — `DoD-3` não é reivindicado aqui.

## 5. `T-01.10` — números de produção reconferidos contra a stack viva, SÓ LEITURA

```
$ curl -s http://127.0.0.1:8000/api/v1/collector-status   # nenhum INSERT, nenhum seed
/fapi/v1/klines        | uptimePercent=100.0 | statusDetail=None
/fapi/v1/premiumIndex  | uptimePercent=100.0 | statusDetail=None
/stream?…@forceOrder   | uptimePercent=None  | statusDetail='4 run(s) na janela, nenhum fechado pelo escritor: uptime não medível.'
n_rows=3 · 15 campos
```
✅ Bate com o gate `T-01.10-infra.md` §4 campo a campo: `100,0`/`100,0`, e `forceOrder` **`null` com
`statusDetail`** — indefinido **distinguido** de zero, que era o requisito de contrato da emenda.

## 6. Portões

| portão | resultado (medido por mim) |
|---|---|
| `make verify` | **VERDE, 6 portões** — `lint-backend rc=0` (413 arquivos) · `lint-frontend rc=0` · `test rc=0` **2.120 passed, cobertura total 96,96%** · `boundaries rc=0` (7 kept, 0 broken) · `regras rc=0` (**0 bloqueio**, 66 avisos) · `política rc=0`. Log: `/tmp/verify-cripto-strategy-20260911T151004Z.log` |
| 8 regras bloqueantes (`harness rules list --severity block`) | **0 bloqueio** no sweep; os 66 avisos são `web-fullstack.hardcoded-url` em `*.test.ts` pré-existentes |
| `npx playwright test --list` | ⛔ **`Total: 0 tests in 0 files`** — §1 |
| cobertura | **96,96%** total; o piso por camada é cobrado dentro de `make test` (`check-coverage-layers.sh`), que devolveu `rc=0`. Não há chave `coverage` na política (`harness policy --key coverage` → *campo ausente*) ⇒ o alvo declarado é o piso do script, e ele passou |

## 7. Anomalia (não é `OK` nem `FAIL` de regra)

Baseline do `playwright --list` no `master` **não foi medível**: worktree temporário com
`node_modules` por symlink morre em `Error: module is not linked` (jsdom, dupla instância ESM/CJS)
antes de coletar. Contornado por medição equivalente **na própria branch** (`e2e/0[1-7]` → 21 testes)
e pela prova de que os dois `export const` existem no `master`. Registrado porque medição que não
produziu veredito não vira `OK`.

## 8. Veredito

**NEEDS_FIX** — §2 a §6 estão pagos e a janela deslizante é melhoria real e bem falsificada; a wave
reprova por **um** item, e é um item que nenhum portão desta branch conseguiria mostrar sozinho.
