# Emendas `B1`–`B4` executadas — `/architect`, 2026-09-11

**Insumo vinculante:** [`handoff/DECISOES-OWNER.md`](../handoff/DECISOES-OWNER.md) §D9–D12
(`[DECISÃO-OWNER: 2026-09-11, escolha entre alternativas apresentadas]`) · menu em
[`OPCOES-B1-B4.md`](../OPCOES-B1-B4.md).
**Escopo executado:** **só documento. Zero código, zero task criada, nenhum gate de owner tocado**
(`spec`, `build`, `advance DONE` intactos) e **nenhuma escrita no ledger** — o estado da feature segue
sendo `harness pipeline state cinco-metricas-do-core`, não este texto.

## 1 · O que foi emendado, arquivo por arquivo

| # | arquivo:linha | o que entrou |
|---|---|---|
| `D9`/`B1` | `docs/adr/ADR-035-…md:260` | emenda a `D3` — **acrescenta**: `build_service_stdout_handler` = **garantia**, varredura AST = **falsificador dela**, e a hierarquia em 3 regras (divergência é sempre reprovação; sobre comportamento manda o handler; sobre conserto manda o handler — promover a CLI a processo de serviço, **nunca** só acrescentar nome à lista de isenção) |
| `D10`/`B2` | `docs/adr/ADR-035-…md:156` + `:129` (aviso no topo de `D2`) | emenda a `D2` — a **decisão** fica, o **mecanismo** cai, com os 2 números; e o mecanismo real (`credit_written`, 2 colunas, aditivo, no-op por `rowcount`) |
| `D10`/`B2` | `docs/specs/SPEC-007-…md:101` | emenda a `GA-4` — tabela dos 3 itens da economia: **2 caíram, 1 de pé** |
| `D11`/`B3` | `docs/specs/SPEC-004-…md:64` (nota) e a linha `entrypoint` da tabela `§3.1` | *"duas threads"* → **invariante** (*um processo, uma thread por superfície de coleta declarada*) + **remissão** da contagem ao catálogo de `SPEC-007` §4 |
| `D12`/`B4` | `docs/adr/ADR-035-…md:48` e `:350` | emenda a `D1` — `uptimePercent` = **% dos runs FECHADOS da janela com `n_written > 0`**; `n_expected` **não muda**; e a nota de consequência ao `DoD-2` |
| `D12`/`B4` | `docs/specs/SPEC-007-…md` (`RS-1`/`RS-1.a`) | nota de remissão: a previsão *"sai de `0.0` para o valor real"* foi falsificada (saiu para `0,36`); `RS-1.a` continua valendo **sob a fórmula nova** |
| — | `docs/adr/ADR-035-…md:7` | cabeçalho: **EMENDADA em 2026-09-11**, dizendo quais leituras mudam |
| — | `docs/context/cinco-metricas-do-core/PENDENCIAS.md:66` | `B1`–`B4` marcadas **decididas**, com o que restou de código |
| — | `docs/INDEX.md` | linha nova (append-only, nenhuma linha reescrita) |

## 2 · Medições desta sessão — comando, universo, rótulo

Tudo contra a **stack de produção viva** (`deploy-*`, up 10 h) e a árvore de `master`. **Só leitura.**

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c \
"select endpoint, count(*), count(*) filter (where writer_accounted_at is not null),
        count(*) filter (where writer_accounted_at is not null and n_written > 0),
        round(100.0*sum(n_written)/nullif(sum(n_expected),0),2)
   from md.ingest_run where ended_at::timestamptz > now() - interval '24 hours' group by 1;"
```

| endpoint | runs (24 h) | fechados | fechados com `n_written>0` | `uptimePercent` **emendado** | fórmula de hoje |
|---|---:|---:|---:|---:|---:|
| `/fapi/v1/klines` | 572 | 571 | 571 | **100,00** | 90,45 |
| `/fapi/v1/premiumIndex` | 1.431 | 582 | 582 | **100,00** | 0,36 |
| `…forceOrder` | 3 | 0 | 0 | **indefinido** | — |

`[MEDIDO 2026-09-11T11:26Z, n = 2.006 runs na janela de 24 h]`

- **klines sem o run de backfill: 34,21%** `[MEDIDO 2026-09-11T11:26Z, mesmo SQL com `n_expected < 1000`, n=571]`.
  O backfill é `run_id 932c37fc…`, `n_expected 40.320` / `n_written 40.316`, `ended_at 2026-09-11T01:40:39Z`
  ⇒ **sai da janela em `2026-09-12T01:40:39Z`**.
- `_UPSERT_RUN` sobrescreve **15** colunas; `IngestRun` tem **16** campos
  `[MEDIDO 2026-09-11: `sed -n '/^_UPSERT_RUN = /,/^"""$/p' … | grep -c '= EXCLUDED\.'` → 15; AST sobre o dataclass → 16]`.
- `WRITER_BATCH_SIZE` default **100** (`single_writer_cli.py:141`) × run de **40.320** linhas ⇒ **≥ 404 lotes**.
- **3** threads em `collectors_cli.py:1108,1122,1136`
  `[MEDIDO 2026-09-11: `grep -c 'threading.Thread(' …/collectors_cli.py` → 3]`.
- **9** módulos no universo do handler compartilhado — 8 importadores + o próprio
  `[MEDIDO 2026-09-11: `grep -rl 'from src.modules.sentimento.infra.ingest_health_cli import' backend/src --include='*.py' | wc -l` → 8]`;
  **0 infratores** na varredura AST, **4 mutantes mortos** `[DOC: T-01.5-builder.md §7]`.
- `696707c` = *"merge(T-01.4): run_id viaja com o lote e o escritor fecha o run"*
  `[MEDIDO 2026-09-11: `git log --oneline -1 696707c`]` — confirma que `single_writer_cli.py` está livre.

## 3 · Dois números do próprio menu que a medição corrigiu — declarados, não escondidos

1. **`OPCOES-B1-B4.md` §B2 e `DECISOES-OWNER.md` §D10 dizem *"16 campos sobrescritos"*.** Medido: **16
   carregados, 15 sobrescritos** (`run_id` é a chave do conflito). A conclusão **não muda** — os 4 campos
   que o escritor não pode inventar estão entre os 15.
2. **O menu diz *"lote 100 × run 10.080"*.** O 10.080 é **por símbolo**; o run real medido é **40.320**
   (4 símbolos do piloto). O argumento fica **mais forte**, não mais fraco: ≥ 404 lotes, não ~101.

## 4 · `[NÃO MEDIDO]` — o que esta sessão não conseguiu medir

- **Que forma `collector_status` dá hoje ao caso de denominador zero** (`forceOrder`, 0 runs fechados).
  Sob a fórmula nova o resultado é **indefinido**, não `0%`, e o contrato servido tem de distinguir os
  dois — senão troca um `rc=0` ambíguo por outro (`ADR-012`). **É item da task, não desta emenda.**
- **O custo de reconstruir os containers** para reverificar o `DoD-3` depois de instalar o handler de
  serviço — não foi cronometrado.

## 5 · O que NÃO foi feito, deliberadamente

- **Nenhum código.** `D9` (instalar `build_service_stdout_handler`) e `D12` (fórmula em
  `collector_status.py`) viram **task do `/tech-lead`** — `D12` explicitamente **task própria**, não
  resíduo da fatia `01`.
- **Nenhuma task criada**, nenhuma unidade de valor no tracker, nenhum `harness pipeline approve/advance`.
- **`ADR-035` continua com `Status: proposta`** — mudança de status é ato de ledger, não de texto.
- **`SPEC-004` permanece `SPEC_APPROVED`**: a emenda corrige uma frase falsificada, não reabre decisão.

## 6 · Falsificador deste gate

Se algum dos números acima não reproduzir com o comando ao lado, sobre a mesma stack e a mesma janela,
este relatório está errado — e a emenda que o cita herda o erro. O item mais perecível é o `90,45%` de
klines: ele **muda sozinho** em `2026-09-12T01:40:39Z`, por construção, e é por isso que a fórmula mudou.
