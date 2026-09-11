# Fase 06 — as duas correções de código de `D9`/`D12`, fora da fatia `01`

**Componentes:** `infra` (handler de log) · `sentimento` (fórmula de `uptimePercent`) · **Depende
de:** `01` no que já está mergeado (`T-01.4` deu `writer_accounted_at`; `T-01.5` deu
`ExtraRenderingFormatter`) · **Bloqueia:** `T-01.10` — e é por isso que ela existe.
**Origem:** `[DECISÃO-OWNER: 2026-09-11, escolha entre alternativas apresentadas]` §D9 e §D12 em
[`handoff/DECISOES-OWNER.md`](../../context/cinco-metricas-do-core/handoff/DECISOES-OWNER.md);
emendas de documento já executadas em
[`gates/EMENDAS-B1-B4-architect.md`](../../context/cinco-metricas-do-core/gates/EMENDAS-B1-B4-architect.md).

## Por que uma fase própria, e não itens da fatia `01`

⛔ **`harness tasks resolve` é tudo-ou-nada por fase (`CA-4`)** — medido, com a recusa real em
[`PENDENCIAS.md`](../../context/cinco-metricas-do-core/PENDENCIAS.md) §D1. Pôr estas duas na `01`
faria **13** tasks terem de ter desfecho na mesma chamada, e amarraria o registro de duas correções
de instrumentação ao fechamento de uma fatia vertical inteira — inclusive ao veredito de design
(`T-01.8`) e ao e2e de Playwright (`T-01.9`), que nada têm a ver com elas.

⚠️ **Esta fase NÃO é fatia vertical, e a exceção é declarada, não silenciosa.** `D1` (owner) fixou
fase = fatia vertical até o pixel. Uma correção de instrumentação não tem pixel: ela conserta o que
a fatia `01` MEDE. O precedente é
[`SPEC-006`/`04_correcao_composicao.md`](../SPEC-006-pagina-de-grafico-s2/04_correcao_composicao.md)
— fast-follow de correção aberto depois de `F0`–`F3` mergeadas, mesma forma.

⚠️ **`06` é identidade de resolve, não posição na fila.** `PHASE_RE` do validador exige `NN` de dois
dígitos e `V-24` exige `NN_*.md` neste diretório — `01b` é inexprimível. Quem ordena é o DAG de
`depends_on`: esta fase roda **antes** de `02`, porque `T-01.10` depende dela.

## Itens

| item | entrega | requisito | componente |
|---|---|---|---|
| 6.1 | `build_service_stdout_handler` (com `ExtraRenderingFormatter`) instalado pelos 2 processos de serviço; `build_stdout_handler`/`build_stream_handler` voltam a `logging.Formatter` puro; a varredura AST **fica** e passa a enxergar o nome novo | `ADR-035/D3` emenda `2026-09-11`, `D9` | `infra` |
| 6.2 | `uptime_percent` = % dos runs **fechados** da janela com `n_written > 0`; `n_expected` intocado; denominador zero com forma declarada e desambiguada | `ADR-035/D1` emenda `2026-09-11`, `D12` | `sentimento` |

## Non-goals desta fase

Não toca `n_expected` nem `collector_run_mapping.py` (`D12` recusou a alternativa `A`). Não toca
`INGEST_HEALTH_RUN_COLUMNS` nem a projeção canônica (`RS-2`, `NG-6`, `CLAUDE.md` linha 11 — o
`sha256` de `ADR-008/DoD-2`). Não renomeia os 4 eventos de log em português (`NG-5`). Não versiona
`/api/v1/collector-status` nem acrescenta campo (`D7`, owner). Não conserta o cálculo paralelo de
`uptimePercent` do front em `ingest-health-query.ts:709` — **achado escalado**, ver §DoD.

## DoD

| id | critério | comando | morde |
|---|---|---|---|
| CA-F6-1 | os 2 processos de serviço instalam o handler de serviço, e **nenhuma** CLI de projeção instala | `grep -n 'build_service_stdout_handler' backend/src --include='*.py' -r` → exatamente 3 arquivos (o definidor + `single_writer_cli` + `collectors_cli`) | um 4º arquivo ⇒ reprova, salvo se entrar em `DECLARED_SERVICE_PROCESSES` no mesmo diff (`ADR-035/D3` regra **c**) |
| CA-F6-2 | a varredura AST continua vendo o universo inteiro | `SHARED_HANDLER_BUILDERS` contém `build_service_stdout_handler`, e `test_the_universe_of_importers_is_the_one_this_guard_believes_it_is` segue `==` | um módulo que importe só o builder novo e fique fora do universo ⇒ a guarda virou allowlist |
| CA-F6-3 | o `stdout` de projeção é `%(message)s` puro **por construção** | teste que empurra um registro com `extra=` pelo handler de projeção e afirma que a saída é idêntica à de `logging.Formatter` | qualquer par `k=v` na saída ⇒ reprova |
| CA-F6-4 | `uptimePercent` do `premiumIndex` e do `klines` sob a fórmula nova | o SQL de `ADR-035/D1` (emenda) contra a stack viva, **antes e depois**, no gate | `klines` que dependa do run de backfill (`n_expected = 40.320`, sai da janela em `2026-09-12T01:40:39Z`) ⇒ o número não é o da fórmula nova |
| CA-F6-5 | denominador zero tem forma declarada e **distinguível** | `curl …/api/v1/collector-status \| jq '.rows[] \| select(.endpoint\|test("forceOrder"))'` → `uptimePercent: null` **com** `statusDetail` não-nulo dizendo o motivo, e `n_runs_in_window` separando "há runs, nenhum fechado" de "nenhum run" | `null` mudo nos dois casos ⇒ trocou um `rc=0` ambíguo por outro (`ADR-012`) |
| CA-F6-6 | `make verify` verde | `make verify` | — |

## Falsificador da fase

Um módulo que instale `build_service_stdout_handler` **e** cuja saída seja projeção consumida por
outro programa (hash, `jq`, diff de bytes) — é o falsificador que a própria emenda de `ADR-035/D3`
escreveu, e ele diria que a garantia foi pendurada no eixo errado (lista de processo, quando devia
ser destino do `stdout`).

E, para `6.2`: um coletor **saudável** que, depois desta fase, apareça com `uptimePercent` abaixo de
100% sem que exista run fechado com `n_written = 0` — significaria que "fechado" foi lido de outro
lugar que não `writer_accounted_at`.
