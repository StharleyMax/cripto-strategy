# W6-REVIEW-r2 — revalidação arquitetural da wave W6 (`03b`, `T-03.8`…`T-03.14`, mais os laudos da `T-03.7`)

**Feature:** `paineis-de-fluxo` · **Cabeça:** `1c95f62` (`wave/paineis-f03b`), diff `master...wave/paineis-f03b`
(merge-base `68e6d50`, **114** arquivos, **45** de código) · **Data:** 2026-09-28T01:02Z · **Revisor:** `/review`
(read-only no código; não roda `gate-record`) · **Anterior:** `gates/W6-REVIEW.md` (r1, `ef2ff95`, COMPLIANT)
**Contra:** plano `03_oi_candle.md` §03b (3b.1–3b.5, DoD 1–7), `tasks.toml` `T-03.8`…`T-03.14`, `SPEC-009` §5 e §6.2–§6.7,
`ADR-044` (D2, D3′), `ADR-045` (D1, D2, **D2-bis**, D3), `ADR-034/D8`, `docs/arquitetura-do-codigo.md` §2, `CLAUDE.md`,
`handoff/REGRAS-DE-DESPACHO-WORKFLOW-2026-09-24.md` §4-§5.

## 0. Veredito: **NON_COMPLIANT**

A camada mecânica está limpa: **0 de 8** regras bloqueantes violadas, `lint-imports` 7/0, 0 leitura de relógio. O veredito
cai na **camada declarada**: o código de produção em `1c95f62` viola **`ADR-045/D2-bis`**, que é o DoD literal de `T-03.9`
(`tasks.toml:641`) e o item 3b.2 do plano (`03_oi_candle.md:54`). O defeito foi achado pelo `W6-QA-BACK-r2` (D-1) e
**reproduzido por esta revisão** (§3). **Isto corrige o r1**, que deu `D2-bis` como "conforme" (`W6-REVIEW.md` §2, linha
do `D2-bis`): o r1 leu o domínio (`oi_candle_regimes.py`), que está certo, e não viu que a rota entrega ao domínio um universo
de polling mais curto que o do histórico.

## 1. Denominador

| camada | comando | universo | resultado |
|---|---|---|---|
| regras bloqueantes | `harness rules list --severity block` | **8** (`core` ×4, `web-fullstack` ×3, `own` ×1) | 8 avaliadas pelo runner |
| por arquivo | `git diff --name-only master...HEAD \| grep -E '^(backend/src\|backend/tests\|frontend/src\|frontend/e2e\|deploy)/'` + `harness rules --mode file --path <f>` | **45** (44 do r1 + `test_oi_candles_route_invariants.py`) | **43** rc=0; **2** rc=2, os dois `[AVISO] core.module-docstring-single-line`, herdados (§4) `[MEDIDO]` |
| varredura | `harness rules --mode sweep` | árvore inteira | rc=0, **0 `[BLOQUEIO]`**, 77 `[AVISO]` (igual ao r1) `[MEDIDO]` |
| camadas (backend) | `cd backend && .venv/bin/lint-imports` | 7 contratos | **7 kept, 0 broken** `[MEDIDO]` |
| natureza | `bash backend/scripts/natureza.sh` | 140 arquivos de `domain`/`use_cases` | **0 leitura de relógio** `[MEDIDO]` |
| fronteira `charts`↔`web` | `npx eslint --no-warn-ignored <arquivos de frontend/src e frontend/e2e do diff>` | 26 | **rc=0** `[MEDIDO]` |
| append-only | `git diff master...HEAD -- docs ':!docs/context/paineis-de-fluxo/gates' \| grep -cE '^-[^-]'` | INDEX, DESIGN_SYSTEM, handoffs | **0** linhas removidas `[MEDIDO]` |
| autoria | `git log --format='%an <%ae>\|%cn <%ce>' master..HEAD \| sort \| uniq -c` ; `git log --format=%B master..HEAD \| grep -ci co-authored-by` | 46 commits | 46 do owner, **0** trailer `[MEDIDO]` |
| delta desde o r1 | `git diff --stat ef2ff95..HEAD` | 11 arquivos | **nenhum arquivo de produção** mudou (`e369418` tocou só `e2e/38` e `oi-candle-pane.test.ts`; `37e12a9` e `41f1555` são testes) `[MEDIDO]` |

## 2. Camada declarada — o que muda em relação ao r1

Os 16 pontos da tabela do r1 (`W6-REVIEW.md` §2) seguem valendo, **menos a linha do `D2-bis`**, porque o código de produção
é o mesmo byte a byte (`git diff ef2ff95..HEAD -- backend/src frontend/src ':!*.test.ts'` vazio `[MEDIDO]`). Os arquivos novos
desde o r1 são testes: `backend/tests/sentimento/test_oi_candles_route_invariants.py` (imports absolutos, rc=0 no runner),
os pinos U2/U9/U15 em `oi-candle-pane.test.ts` e `oi-regime-marks.test.ts`, e a fase da ablação e a vista de reentrada no
`e2e/38`. Nenhum deles cruza fronteira de camada ou de componente (ESLint rc=0; os `e2e` já importavam
`../src/charts/color-tokens.ts` direto, como em `master`).

## 3. Achados

- **[BLOCKER] `ADR-045/D2-bis` violado na borda esquerda de uma janela `1m`** —
  `backend/src/modules/sentimento/use_cases/series_history.py:506-551` (cada regime lê o próprio universo com o próprio
  bucket efetivo: o polling a partir de `_oi_fact_instants` com `g = 1 min`, `:523` / `:560-579`), julgado em
  `backend/src/modules/sentimento/domain/oi_candle_regimes.py:196-199,235-254` — **`ADR-045` §D2-bis** (*"Se o bucket do TF
  tem ponto de polling em `T0`, ele é montado **só** com a série de polling … Nunca se mistura"*), = DoD de `T-03.9`
  (`tasks.toml:641`) e plano 3b.2 (`03_oi_candle.md:54`).
  **Mecanismo:** em TF `1m` o histórico serve bucket de 5 min, cujo primeiro `T0` é `ceil(ws, 5 min) − 5 min`; o polling
  só é lido a partir de `ceil(ws, 1 min) − 1 min`, até 4 min depois. Um `p_poll(T0)` nesse intervalo não chega a
  `poll_instants`, e `_polling_anchors_inside` devolve `False` para um bucket que o próprio domínio dá ao polling.
  **Prova, reproduzida aqui:** `cd backend && .venv/bin/pytest -q --no-cov --runxfail
  tests/sentimento/test_oi_candles_route_invariants.py -k left_of_the_window` → **1 failed**,
  `Left contains one more item: ('binance_point_5m', 1789171500000)` (minuto 5 = `T0` com ponto de polling). Sem
  `--runxfail`: 92 passed, 1 xfailed `[MEDIDO 2026-09-28T01:00Z, cache purgado]`. A mesma consulta com a janela começando no
  minuto 4 devolve nada para `bucket_end = 10`, e no minuto 7 devolve o candle do histórico: **a resposta da rota depende de
  onde a página começa**, o que também contraria a invariante 3 do mesmo arquivo de teste e o princípio que a própria rota
  declara para `rows` (`series_history.py:360-363`).
  **Alcance:** latente, **0 ocorrências no dado real** do export de 23:04Z (`W6-QA-BACK-r2.md` §2) `[DOC]`; só TF `1m`;
  alcançável pela UI porque o passo do eixo é 1 min (`charts/s2-panels.ts:73`). A severidade é BLOCKER porque é o contrato
  da ADR aceita e o DoD da própria task, e não pela frequência.
  **Nota de escopo:** o módulo rotula a aplicação de `D2-bis` a larguras desiguais como `[INFERRED]`
  (`oi_candle_regimes.py:43-45`, dono `[Q-DG-3]`). Isso não salva o caso: o defeito não está na leitura inferida, e sim em a
  rota não aplicar ao dado a leitura que o próprio domínio adotou (o teste de domínio
  `test_in_1m_a_5_minute_history_candle_yields_to_any_polled_anchor_inside_it` passa; o de rota não).
  **Correção concreta** (do builder `sentimento`): em `_oi_candle_report`, ler o polling a partir do **menor** `T0` entre os
  primeiros buckets efetivos dos dois regimes (o do histórico, em `1m`), e não do seu próprio; **ou**, no domínio, recusar
  servir candle de histórico cujo `T0` fique antes do primeiro instante de polling lido. Depois, retirar o
  `xfail(strict=True)` de `test_in_1m_a_polled_anchor_left_of_the_window_still_owns_the_history_bucket` (vira XPASS e reprova
  sozinho se o marcador ficar). Revalidação: pedir a **mutação** (REGRAS §4), não este laudo.

- **[WARNING] (herdado, fora da wave)** `core.module-docstring-single-line` em
  `backend/src/modules/sentimento/domain/series_history_report.py:1` e `backend/src/modules/sentimento/use_cases/series_history.py:1`.
  Igual ao r1: a 1ª linha é idêntica em `master`. **Correção:** fechar o `"""` na 1ª linha, numa task própria (há mais 70 na árvore).

## 4. Condição de merge (não é regra, não entra no veredito)

`handoff/DECISOES-DO-OWNER-2026-09-27.md` **D-3** `[DECISÃO-OWNER: 2026-09-27, escolha entre alternativas apresentadas]`:
o merge da W6 só depois de a `T-03.7` passar. Em `1c95f62` existem só `gates/T-03.7-t0.md` e `T-03.7-t1.md`
(`ls gates | grep T-03.7`); a janela nova fecha em 2026-09-28T11:39Z e **não tem veredito** `[MEDIDO 2026-09-28T01:02Z]`.
Mesmo com o BLOCKER corrigido, esta condição continua.

## 5. Fora do escopo

- `make verify`, mutação e o sobrevivente E5 (`use-history-pager.ts:319`, `handoff/W6-QA-FRONT-r2.md`) são do QA.
- O veredito do `ux-ui-mastery` (`gates/W6-DESIGN-REVIEW.md`, APPROVED WITH CONDITIONS 64/100) não foi reavaliado.

## 6. Falsificador deste laudo

Se `pytest --runxfail -k left_of_the_window` passar em `1c95f62` com cache purgado, o BLOCKER é falso e o veredito volta a
COMPLIANT. Se, depois da correção, `harness rules --mode sweep` mostrar `[BLOQUEIO]` ou `lint-imports` um contrato quebrado,
o COMPLIANT que vier também cai.
