# Pendências — avaliar DEPOIS de tudo no ar

`[PREMISSA-OWNER: 2026-09-12]` — literal: *"vamos registrar as pendencias q depois de tudo no ar
vamos avaliar cada item"*.

⛔ **Nada aqui bloqueia as fases `02`–`05`.** Esta lista existe para que nenhum item seja perdido
**nem** vire motivo de descida recursiva antes das 5 métricas estarem fluindo (`D17`).
Cada item traz o endereço e o comando que o reproduz — quem for avaliar não deve ter de redescobrir.

## A · Decisões de contrato esperando o owner

| # | item | endereço | por que não pode ser decidido por agente |
|---|---|---|---|
| A1 | os **4 campos** do catálogo `premiumIndex` (`native_grid`, `max_staleness_ms`, `price_use`, `verified_by`) | [`OPCOES-CATALOGO-PREMIUM-INDEX.md`](OPCOES-CATALOGO-PREMIUM-INDEX.md) | `verified_by` entra em `series_key_id`; a janela é o `TRUNCATE` de `D15` |
| A2 | `E3` — `ADR-030/F-5` morto pela emenda `D12` | [`OPCOES-E1-E5.md`](OPCOES-E1-E5.md) §E3 | marcar ADR como SUPERSEDED é ato de quem a governa |
| A3 | `E4` — duas superfícies calculam `uptimePercent`, e uma **não pode** calcular a nova | `OPCOES-E1-E5.md` §E4 | escolher qual superfície mente é decisão de produto |
| A4 | `E5` — universo do `DoD-4` (`n_written` × `count(*)`) | `OPCOES-E1-E5.md` §E5 | ⚠️ a premissa original **não se reproduz**; a divergência real é premiumIndex com 1.797 de 5.050 runs nunca fechados |
| A5 | `D16` **suspenso** — `p99` de klines (60.936 ms) excede a grade | [`OPCOES-D16-ESTATISTICA-CONTRA-A-GRADE.md`](OPCOES-D16-ESTATISTICA-CONTRA-A-GRADE.md) | depende de **remedir** com o escalonador consertado; amostra atual é insuficiente para fixar contrato |

## B · Defeitos localizados, não consertados

| # | item | endereço exato | risco |
|---|---|---|---|
| B1 | `interval` da `SeriesKey` vem de **variável de ambiente** | `use_cases/collector_series_mapping.py:255-260`, fechando sobre `config.premium_index_cycle_interval_s` | mudar `PREMIUM_INDEX_CYCLE_INTERVAL_S` **re-órfã 8 séries sem PR**. klines é imune: `domain/klines_volume_catalog.py:121` crava `interval="1m"` |
| B2 | `build_series_row` tem **0 chamador** | — | a invariante de `SPEC-001` §3.2 nunca é aplicada ⇒ **424 de 34.760** linhas com `available_at < bucket_end` (mín. **−100 ms**) |
| B3 | `_PUBLISH_FAILURE_EXCEPTIONS` **nunca conferida** contra o que o bloco levanta | `infra/collectors_cli.py:581-611` vs `:640` | `OverflowError` escapava e matava a thread **sem** `failure_event.set()` ⇒ processo vivo, `rc=0`, coletor morto. Foi consertado **um** caso; ninguém contou os outros |
| B4 | `_run_premium_index_collector` tem a **mesma** deriva de escalonador | `infra/collectors_cli.py:636` | medida: **60,441 s/ciclo** contra 60,0 declarados (`34.752÷8=4.344` ciclos em `262.496 s`). Não aparece na coluna porque `bucket_end = source_time` torna a fase **algebricamente ausente** |
| B5 | `page.tsx:239` chama `volumeSlotsFromHistoryRows` **fora** de try/catch | `frontend/src/app/symbol/page.tsx:239` | `CA-F2-3`; lança via `view-model.ts:184,191` |
| B6 | `S3Inspector.tsx:60-70` descreve um seletor de tema que **não existe mais** | — | prosa de produção que virou mentira após `ff15921` |
| B7 | `inf` na cadência — falsificador **[NÃO MEDIDO]** | PR #217 | o conserto está aplicado e 42 testes passam, mas o mutante nunca foi rodado |
| B8 | `gates/O4-correcoes-pos-qa-builder.md:130` ainda diz *"falha na direção segura"* | — | frase **provada falsa** pelo commit seguinte |
| B9 | `deploy/compose.yml:160` sem a restrição de boot de `PREMIUM_INDEX_CYCLE_INTERVAL_S` | — | o irmão `KLINES_CYCLE_OFFSET_S` documenta a dele no mesmo bloco; a convenção existe e esta linha não a seguiu |

## C · Portões que pararam de medir

| # | item | comando que mostra | efeito |
|---|---|---|---|
| C1 | **nenhuma suíte de front está em portão** | `grep -rn 'node --test' scripts/verify.sh Makefile .git/hooks/pre-push` → **0 linhas** | 189+156+111 testes rodam só quando alguém pede. Custo de ligar: **42 s**. ⚠️ ordem obrigatória — ligar `test:s1` hoje pinta `verify` de vermelho por `data/md` ausente |
| C2 | piso de cobertura **por camada** não é medido | `test.sh` só o roda **depois** da suíte, que reprova no teste do `D16` | desconhecido enquanto o vermelho declarado durar |
| C3 | suíte levou **532 s** contra os ~37,5 s da doutrina | — | 14×, **sem explicação medida**. Não causado por nenhum commit identificado |
| C4 | `test:s1` com **8 falhas ambientais** | `store_parent_missing: data/md` | idêntico em `master`; `data/md` não existe nem no checkout principal |

## D · Higiene

| # | item |
|---|---|
| D1 | **61 branches locais** recusadas por `git branch -d` (provavelmente squash-merged) — lista em `/tmp/claude-1002/branches-recusadas.txt` |
| D2 | worktrees de agente acumuladas em `.claude/worktrees/` ⚠️ **conferir commit antes de remover**, e conferir se algum processo aponta para o caminho (produção já foi ancorada numa worktree apagada) |
| D3 | `.env.example` é **rastreado** (`git ls-files` → 1). Se valor real foi commitado, é **rotação de segredo**, não `git revert` |
| D4 | container órfão `t-01-1-series-window-reader-test-*` |

## E · O que NÃO está aqui, e por quê

`E1`/`E2` (backfill invisível ao `as_of`; `FLOW` com atraso ≥ grade) **não** são pendência: são
**caminho crítico** de `D15`/`D16`, a executar **uma vez só sobre as 5 métricas** depois da
largura (`D17`), nunca 4× em descida.
