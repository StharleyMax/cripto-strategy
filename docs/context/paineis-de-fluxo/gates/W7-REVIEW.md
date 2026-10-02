# W7-REVIEW — auditoria arquitetural da fase 05 (`harness-plugin:reviewer`)

**Veredito: COMPLIANT** @ `782291f` (base `eda7520`). Transcrito pelo orquestrador do retorno do reviewer
(read-only).

- **Denominador:** 8/8 regras `block` (`harness rules list --severity block`) [MEDIDO]; 112 arquivos A/M de
  `git diff eda7520..782291f` varridos com `harness rules --mode file --path` → 0 bloqueio [MEDIDO]; sweep
  completo → 0 bloqueio. As 3 rc=2 são `[AVISO] core.module-docstring-single-line` na linha 1 de
  `liquidation_collection.py`, `collectors_cli.py`, `collect_liquidation_history.py` — anteriores à wave
  (os hunks começam em 21/174/40).
- **[WARNING] idioma (convenção, não portão):** comentário novo em português em `deploy/compose.yml:259-268`
  (CLAUDE.md, fronteira linha 5). Correção: traduzir, mantendo números e `[MEDIDO 2026-10-02,
  gates/T-05.3-build.md]`.
- **Sem violação:** adendo ADR-040/D1–D4 (answered explícito; merge e não sort antes de
  `classify_side_points`; `series_history.py`/`as_of_accessor.py`/`liquidation_zero_legitimacy.py`/
  `collector_run_mapping.py` fora do diff); camadas (domain puro; `redis_stream_backpressure.py` evita ciclo;
  front só `app/symbol → charts`); ADR-027/D1 (sem serviço novo); identificadores, eventos de log
  (`backfill_waiting_for_writer`, `backfill_drain_probe_unanswered`) e mensagens de exceção em inglês;
  falsificador de segmentos 23 = 23 [MEDIDO]; chave Coinalyze 0 ocorrências no diff [MEDIDO]; `factKey` do
  T-05.4 §5 intactos.
- **INFO:** (1) o diff carrega docs da fase 06, sem código; a emenda de ADR-002/ADR-041 citada em `9288f33`
  ainda não existe em `docs/adr` (é ato da T-06.4). (2) `StreamDrainGate._probe` trata qualquer
  `RedisCommandError` como "ainda não existe" e espera sem teto — erro permanente (auth) vira espera
  infinita, logada como `lag=None`.
