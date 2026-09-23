# Handoff — QA da fase 05 (história sob demanda)

12 tasks (`T-05.0`–`T-05.11`) + 2 fixes escalados (`T-05-FIX` auto-retrigger, 3 rodadas; `T-05.9`
fix de concorrência + CVD precision) mergeados em `wave/candle-f05`. Plano:
`docs/plans/SPEC-008-candle-real-e-eixo-unico/05_historia_sob_demanda.md`. Pré-requisito
`ADR-042`/`T-05.0` também mergeado.

## `make verify`: VERMELHO, 52 passed / 4 failed — todos entendidos, nenhum novo sem explicação

Log: `/tmp/verify-candle-f05-20260923T183815Z.log` (grep, não leia inteiro). Os 4:

1. **`16-eixo-unico-pan-e-ablacao.spec.ts:204`** e **2-3. `18-tf-refetch-e-ablacao.spec.ts:107,153`**
   — PRÉ-EXISTENTES de fase 02/03, reproduzidos idênticos num worktree detached em `ef608ec`
   (commit anterior a qualquer fix desta fase). Laudo completo com os comandos exatos:
   [`gates/ACHADOS-orquestrador-pre-existentes-fase-05.md`](../gates/ACHADOS-orquestrador-pre-existentes-fase-05.md).
2. **`20-teto-latencia-historia-sob-demanda.spec.ts:383`** — DoD-7 da fase. A ceiling NOMEADA
   (`p95<=400ms`) PASSA (`101.7ms` medido, reconfirmado por mim). O que reprova é a checagem de
   COMPOSIÇÃO (intervalo de eixo `<=160ms`, teto irmão de `T-02.7`) — mede honestamente agora
   (`579.8ms`), depois de 3 achados em cadeia (`T-05-FIX` fechou o auto-disparo, `T-05.9` fechou a
   corrida que ele escondia, e só aí esta medição ficou possível). Causa: remontar os 6 `IChartApi`
   a cada página excede o teto de pan-frame — arquitetural, não desta fase (dona provável: fase
   `02`, mecanismo de remonte). Docstring completo do achado no próprio arquivo do spec, topo.

## O que verificar como QA (além do de sempre)

- Confirme os 3 achados pré-existentes rodando você mesmo pelo menos 1 dos comandos do laudo —
  não aceite minha palavra.
- Julgue se DoD-7 conta como cumprido (ceiling nomeada passa) com a composição como débito
  ESCALADO, ou se bloqueia a fase — é seu veredito, não decidi por você.
- `CVD`: crash de precisão real contra Postgres (13-14 dígitos, resíduo de float) foi corrigido em
  `series_reduction.py` (`Decimal`) + rede de segurança em `page.tsx`. Reproduza ao vivo (`npm run
  dev`, TF `1h`/`4h`, arrastar história) se conseguir acesso ao Postgres real.
- Achado não-bloqueante de `T-05.10` (dois badges empilhando em long/short quando não há
  observação E já passou o floor) — não corrigido, ação sugerida no próprio gate
  (`gates/T-05.10-ux-ui-mastery.md`).

## Onde trabalhar

Worktree de integração: `/home/stharley/Documentos/projects/cripto-strategy-worktrees/candle-f05`,
branch `wave/candle-f05`. Trabalhe direto nela (árvore limpa, nenhum outro agente ativo agora).
