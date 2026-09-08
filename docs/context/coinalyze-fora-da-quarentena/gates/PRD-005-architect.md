# Gate `/architect` sobre `PRD-005-coinalyze-fora-da-quarentena` — `APPROVED`

**Data:** 2026-09-08 · **Rev de ancoragem:** `master@4605767` · **Ciclo:** 1/3

## Veredito

**Gap Analysis: APPROVED, sem achado bloqueante.** `[READY FOR SPEC]` emitido; SPEC/ADR/plano produzidos nesta mesma sessão.

## O que foi conferido

- **Contradições de regra:** nenhuma entre `RN-1..6`. Uma **tensão real** entre `RF-3`/`CA-F1-4` (acréscimo entre rodadas) e `RNF-1` (store sem crescimento sem teto) — não bloqueante porque é exatamente o tipo de `TBD` de mecanismo que cabe ao `/architect` fechar, não ao `/pm`. Resolvida por regra de mesclagem conservadora (`max(p99)`, soma de `n`), registrada em `ADR-033 D2`.
- **Critérios testáveis:** todos os `CA-*` do PRD têm comando + coluna "morde". Um deles (`CA-F1-2`, duração de relógio) foi **substituído** nesta SPEC por um critério de limiar de contagem (`CA-F1-2'`), porque a arquitetura escolhida ("em regime" = `lag_n` acumulado, não duração de uma única rodada) tornou a métrica original não-mensurável do jeito como o PRD a formulou.
- **Tipos definidos:** os 6 `TBD` de `PRD-005 §9` foram fechados nesta rodada (`observer_region="sa-east-1"`, motor do store = mesmo padrão de `ADR-031`, `margem = 2×lag_resolution_s`, assinatura da função MODELED, forma do adaptador de leitura = sob demanda) — exceto cadência do `coinalyze_one_shot_cli` (`[Q4]`), que continua do owner por desenho do próprio PRD.
- **Casos de borda:** cobertos em `SPEC-005 §5`, incluindo o caso novo que a decisão de limiar por contagem introduziu (endpoint medido mas abaixo de `REGIME_N_MIN`).
- **Regras bloqueantes em vigor:** `harness rules list --severity block` → 8 `[MEDIDO 2026-09-08]`, endereçáveis pelo código novo (nenhuma delas reprova por vacuidade — há domain/infra novo).

## Artefatos produzidos

- [`docs/specs/SPEC-005-coinalyze-fora-da-quarentena.md`](../../../specs/SPEC-005-coinalyze-fora-da-quarentena.md)
- [`docs/adr/ADR-033-store-de-defasagem-motor-compartilhado-e-mesclagem-conservadora.md`](../../../adr/ADR-033-store-de-defasagem-motor-compartilhado-e-mesclagem-conservadora.md) (proposta; co-assinatura `quant-architect`)
- [`docs/plans/SPEC-005-coinalyze-fora-da-quarentena/index.md`](../../../plans/SPEC-005-coinalyze-fora-da-quarentena/index.md) + `01_probe_em_regime_e_persistencia.md` + `02_formula_modeled_e_promocao.md` (fase `03` não detalhada — condicional a `[Q4]` do owner)

## Perguntas que continuam abertas para o owner antes de `approve spec`

Nenhuma bloqueia `SPEC_DRAFT`. Para `SPEC_APPROVED`:

- **`[Q4]`** — `coinalyze_one_shot_cli` precisa de agendamento formal (cron/systemd timer)? Decide só se a fase `03` existe; **owner**.
- **`M1`** — destino de `T-03.9` (`CST-25`) na mãe: mover para esta filha × fechar `superseded`. Não bloqueia arquitetura; **`/tech-lead`**.
- **Co-assinatura `quant-architect`** (não é pergunta ao owner, é gate interno como `ADR-031` usou): `REGIME_N_MIN=200`, `margin_ms=2×lag_resolution_s`, nome do membro de `AvailabilitySource` a usar no ramo medido.

## Ledger

`harness pipeline advance coinalyze-fora-da-quarentena PRD_VALIDATED` executado antes de escrever a SPEC (gate-enforce exige). `harness pipeline advance coinalyze-fora-da-quarentena SPEC_DRAFT` executado após gravar SPEC/ADR/plano.
