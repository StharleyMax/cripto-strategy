# Gate `QA` — conserto do crash-loop real de `!forceOrder@arr` (`8ad9f89`)

**Assina:** `/qa`. **Data:** 2026-09-08. **Avalia:**
`docs/context/captura-em-producao/gates/forceorder-fix-quant-architect.md` (builder) contra
`docs/context/captura-em-producao/handoff/forceorder-arr-crash-loop.md` (origin/master@534df5c —
não presente nesta worktree, que forkou de `adf6537` antes desse commit; conteúdo lido via
`git show 534df5c:...`). **Branch:** `fix/forceorder-combined-stream`, commit `8ad9f89`.

## 1. O que foi verificado, e como

- **Mecanismo do crash-loop:** confirmado por leitura de código, não apenas pela prosa do
  builder. `_default_force_order_source` (`collectors_cli.py:579-590`) conecta em
  `combined_stream_path(sorted(INITIAL_SYMBOLS), stream="forceOrder")` — **nunca** mais em
  `/ws/!forceOrder@arr` — com `connect_tls(..., timeout=_FORCE_ORDER_READ_TIMEOUT_S)`
  (`=900.0`, `collectors_cli.py:186`). `connect_tls` (`binance_stream_probe.py:66-81`) aplica
  esse `timeout` tanto ao handshake TCP quanto a `secure.settimeout(timeout)` — o valor realmente
  governa o read subsequente, não só a conexão inicial. O envelope `{"stream","data"}` do endpoint
  combinado é desembrulhado por `payload.get("data", payload)` em
  `extract_force_order_natural_key` (`force_order_natural_key.py:82`), com guarda `isinstance`
  para não vazar `AttributeError`/`TypeError` de fora do conjunto de exceções declarado.
- **A alegação empírica de produção** ("`!forceOrder@arr` mediu 0 eventos em >300s, per-symbol
  entregou de imediato") **não é verificável por este QA** — é medição ao vivo contra a Binance,
  fora do que a suíte offline prova ou pode provar (`ZERO REDE`, contrato do próprio
  `backend/scripts/test.sh`). Aceita como `[DOC: handoff citado pelo builder]`, não `[MEDIDO]`
  por este gate.
- **Testes que já existiam, rodados antes de escrever qualquer teste novo:**
  `bash backend/scripts/test.sh -k "force_order or collectors_cli" --no-cov` → **98 passed**
  (o gate do builder declarou 96 — 91 pré-existentes + 5 novos; a contagem real hoje, com os 5
  novos do builder E os 2 novos deste gate, é 98; nenhuma divergência de comportamento, só de
  aritmética do relatório do builder).
- **Suíte completa, reproduzida de forma independente** (`nohup make test`, 478,72s,
  `[MEDIDO 2026-09-08]`, rodada ANTES do teste novo deste gate existir em disco, portanto mede
  exatamente o estado que o builder herdou): **1903 passed**, cobertura total **96,94%**,
  `Required test coverage of 70.0% reached`. Pisos por camada (`check-coverage-layers.sh`):
  domain **99,8%** (meta 90%) · use_cases **100,0%** (meta 80%) · infra **93,1%** (meta 70%) —
  os três `[OK]`. **Confirma a alegação do builder, número por número.**
- `bash backend/scripts/lint.sh` → `ruff check` limpo, `ruff format --check` limpo (386 arquivos),
  `mypy --strict` limpo (386 arquivos) — rodado TAMBÉM sobre o teste novo deste gate (2 erros
  `D205` e 1 erro `mypy` de tipo achados e corrigidos no próprio teste antes deste veredito).

## 2. Achado: `NEEDS_FIX` — provenance do `endpoint` divorciada da fonte real

**O defeito, provado por teste que falha, não por opinião:**
`backend/tests/sentimento/test_collectors_cli_endpoint_provenance_after_combined_stream_switch.py`
usa a composição REAL (`_default_force_order_source`, com `WebSocketMessageSource` trocado por um
fake que nunca abre socket) como `open_source` de `_run_force_order_collector`, e falha:

```
E       AssertionError: IngestRun.endpoint == '!forceOrder@arr' (FORCE_ORDER_ENDPOINT) even
        though the source actually opened was the combined per-symbol stream at
        '/stream?streams=btcusdt@forceOrder/ethusdt@forceOrder/linkusdt@forceOrder/solusdt@forceOrder'
```

**Por que isto é defeito, não estilo:** `FORCE_ORDER_ENDPOINT = "!forceOrder@arr"`
(`collector_run_mapping.py:34`) é um literal de módulo, nunca derivado de `open_source` — o
builder trocou a CONEXÃO real sem tocar a PROVENANCE que descreve essa conexão. Três superfícies
ficam com o valor velho, hoje:

1. `IngestRun.endpoint` persistido (`collector_run_mapping.py:80`, escrito via
   `postgres_ingest_record_store.py`/`sqlite_ingest_record_store.py`) — dado durável.
2. `collector_status.py:63,130` agrupa runs por `(source, endpoint)` no rótulo de série
   (`f"{series_source}{SEP}{endpoint}"`, `ADR-030`) que um operador lê num dashboard para
   confirmar que o conserto está no ar — continuará dizendo `!forceOrder@arr`.
3. O PRÓPRIO log que diagnosticou este incidente —
   `logger.error("collector_session_closed %s: %s", FORCE_ORDER_ENDPOINT, failure, ...)`
   (`collectors_cli.py:550-556`) — segue nomeando `!forceOrder@arr` numa FALHA futura do stream
   combinado, obscurecendo exatamente o diagnóstico que este fix existe para permitir.

**Evidência de que a suíte já teria pego isto, se alguém tivesse olhado:** dois testes
PRÉ-EXISTENTES (não tocados por `8ad9f89`) fixam o valor agora falso diretamente —
`test_collectors_cli_publish_failure.py:184`
(`assert recorded[0].endpoint == FORCE_ORDER_ENDPOINT`) e
`test_collectors_cli_log_run_id.py:173` (idem, no log estruturado). Verde nos dois não prova nada
aqui: eles nunca exercitam `_default_force_order_source`, só o `open_source` fabricado de cada
teste — por isso passam sem notar a divergência entre o literal e a conexão real.

## 3. Regras bloqueantes

Nenhuma das 8 regras (`harness rules list --severity block`) tem escopo sobre o achado acima —
não é import relativo, exceção engolida, `print`, segredo ou diretório de teste ausente. Achado é
de correção funcional/observabilidade, fora do que a máquina de regras expressa.

## 4. `gate-record`

**Não gravado.** Esta correção segue o mesmo padrão dos 3 fixes diretos anteriores desta feature
(`docs/INDEX.md` 2026-09-08T12:17Z/12:20Z/12:40Z): "correção direta autorizada pelo owner", sem
task nova em `tasks.toml`, sem `fase` para `harness gate-record <feature> <fase> QA ...` referir.
`tasks.toml`, ledger e Jira **INTOCADOS**; nenhum `gate-record`/`approve`/`advance` — o veredito é
do `/qa`, registrado aqui e na resposta do agente.

## 5. Veredito

Ver corpo da resposta do `/qa` para o veredito formal e as ações. Este documento é o relatório
completo citado por ele — não repetir aqui.
