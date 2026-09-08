# Handoff PM → Architect — `coinalyze-fora-da-quarentena`

**PRD:** [`docs/specs/PRD-005-coinalyze-fora-da-quarentena.md`](../../specs/PRD-005-coinalyze-fora-da-quarentena.md) · **Ledger:** `PRD_DRAFT` (advance em 2026-09-08; `harness pipeline show coinalyze-fora-da-quarentena`) · **Feature filha de `plataforma-dados`, irmã de `captura-em-producao`** (`relate` no ledger) · **Rev de medição:** `master@4605767` · **Owner respondeu 2 das 2 perguntas de logística nesta sessão** (quarentena, `observer_region`); o resto está em §14 (menu) e §15 (perguntas).

## O que este PRD pede ao `/architect` — em ordem

1. **Gap Analysis do PRD** (peer review). 5 `[Q]` em §15, 5 `[GAP]` em §13, 2 `[INFERRED]` em §12 com custo de reversão.
2. **Decidir `[Q2]` — motor de persistência do `LagSummaryRow`**: hoje não existe store nenhum (`grep -rln 'promo\|reclassif\|requarant' backend/src/modules/sentimento` → 0). Mesma lógica de `ADR-014/D1e` (SQLite provisório vs. Postgres) se aplica aqui; decidir se é o MESMO store de `md.ingest_run` ou um novo.
3. **Fixar `[Q1]`**: grafia exata de `observer_region` (owner já decidiu a região — São Paulo, `[PREMISSA-OWNER 2026-09-08]` — falta só a string) e a duração-alvo do probe "em regime" (hoje só há 1 rodada de 9m20s, `n=36`/`n=7`).
4. **Fixar `[Q3]`**: valor de `margem` na fórmula `bucket_end + p99_lag + margem` (`SPEC-001 §5.2`, citada íntegra no PRD §7.2) — nenhum documento lido propõe um número.
5. **Decidir onde a função MODELED mora** — ao lado de `live_availability_write.py` (que documenta explicitamente só cobrir o ramo não-medido) ou em módulo próprio; `quant-architect` decide a forma, mas a fronteira `Natureza`/`ADR-016` (domain puro) já está fixada.
6. **Confirmar a leitura de §1.4**: este PRD conclui que a Coinalyze **não** precisa de coletor de produção contínuo (equivalente a `collectors_cli.py`), porque `ADR-027/D1` já classifica `coinalyze_one_shot_cli` como one-shot/cron e a janela de retenção fina (~7-8 dias, `medicao-coinalyze.md:39-54`) cabe num agendamento periódico. Se você discordar dessa leitura, é `[GAP]` a levantar no seu veredito, não algo que este PRD decidiu sozinho sem base.
7. **SPEC + plano em fases** F1 (probe em regime + persistência) → F2 (fórmula MODELED + promoção) → F3 condicional (cadência de produção do coletor, só se `[Q4]` vier "sim" do owner).

## O que NÃO reabrir (§3 do PRD, com rótulo)

Predicado de quarentena de 3 termos e a proibição de aproximar `available_at` (`SPEC-001 §5.2`) · `ADR-027/D1` (coletores one-shot nunca viram container de vida longa) · símbolos/endpoints do `availability_probe_set` já fechados por `[PREMISSA-OWNER 2026-09-02]`/`[DECISÃO-OWNER 2026-09-02]` · motor de armazenamento de série/catálogo (`ADR-002`) · envelope de `/collector-status`/`ingest-health` (`ADR-030/D5`, `ADR-008/D3`).

## Onde o PRD diverge dos insumos — para você conferir, não aceitar

- **`[GAP G1]`:** nenhum store persiste `LagSummaryRow` — toda medição de `T-03.6` já rodada morreu com o processo do CLI. Bloqueia F1 inteira até `[Q2]` decidir o motor.
- **`[GAP G2]`:** a fórmula MODELED está especificada em prosa há dias (`SPEC-001 §5.2`) e tem zero linha de código — `T-06.6` recusou-a de propósito (`MeasuredLagCannotUseUnmeasuredPathError`), nomeando-a fora do seu DoD.
- **§1.4:** a resposta a "precisa de coletor contínuo?" é NÃO, com evidência de mecanismo (janela de retenção por resolução) e de decisão prévia (`ADR-027/D1`) — não é `[NÃO SEI]`, é conclusão com fonte; se você tiver informação que a contradiga, este é o ponto a marcar.
- **Nenhuma task da mãe** nomeia a promoção ou a fórmula MODELED — `/tech-lead` escreve DoD do zero para F1/F2, não herda de `plano 03`/`06`.

## Menu do owner (§14) — não decidir por ele

`M1` destino de `T-03.9` (`CST-25`) na mãe (mover para a filha × fechar como superseded) · `M2` cron/systemd timer para `coinalyze_one_shot_cli` — **condicional a `[Q4]` do owner**, não decida por antecipação.

## Regras bloqueantes endereçadas

`harness rules list --severity block` → 8 `[MEDIDO 2026-09-08]`. As que mordem: `core.print-statement`/`silent-except`/`relative-import` no domain/infra novo (função MODELED, adaptador, store); `core.hardcoded-secret` se o store novo for Postgres com credencial. As duas `web-fullstack.*` de browser não se aplicam (nenhum código de `web` nesta feature).

## Tracker

MCP `atlassian` **não verificado nesta sessão** (autenticação de MCP pendente no ambiente atual). Nada criado — não é bloqueio: unidades de valor são ato posterior ao seu `approve prd`, e a criação pode esperar uma sessão com o MCP autenticado. Candidatas em §6 do PRD.

## Critério de aceite do seu retorno

Veredito `APPROVED`/`NEEDS_FIX` em ≤ 15 linhas, relatório completo em `docs/context/coinalyze-fora-da-quarentena/gates/PRD-005-architect.md`. Máximo 3 ciclos antes de escalar ao owner.
