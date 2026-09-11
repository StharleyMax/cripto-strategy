# ADR-035 — Contabilidade de `n_written`: o escritor fecha o run que o coletor abriu

**Data:** 2026-09-10 · **Status:** proposta · **SPEC:** [`SPEC-007`](../specs/SPEC-007-cinco-metricas-do-core.md)
**Fase:** `01` (volume) · **Componentes alvo:** `sentimento` (mapeamento e transporte do `run_id`), `infra` (o escritor e o formatador de log)
**Co-assinatura necessária:** `infra-architect` (topologia do escritor único, `D2`) — despachada pelo `/tech-lead` na abertura da fase `01`
**Origem:** `PRD-007`/`RF-4` e `DEF-1`; achados `GA-4`, `GA-5` e `GA-6` do Gap Analysis (`SPEC-007` §1)

## Contexto

`n_written = 0` em **100% dos runs** — `Σ n_returned = 2.616.300`, `Σ n_written = 0`, runs com
`n_written > 0` = **0** `[MEDIDO 2026-09-10, n=2.910 runs; DOC: DIAGNOSTICO.md]` — enquanto `md.series`
tem **23.512 linhas**. O dano já é servido num contrato: `collector_status.py:119-121` calcula
`uptime_percent = 100 · Σn_written / Σn_expected`, e o `premiumIndex` reporta **`uptimePercent 0.0`**
com veredito `ACCEPTED` e **1.429 runs** na janela `[MEDIDO 2026-09-10T20:10Z]`.

`D2` do owner elege `n_written > 0` como item **4 de 4** do DoD-VERTICAL de **toda** fase. Sem esta
decisão, `DoD-4` é insatisfazível por construção e o gate degrada para 3 itens **em silêncio** — que é
a classe de falha que a feature inteira existe para eliminar.

### Três coisas que o Gap Analysis mediu e que mudam o problema

1. **O coletor não pode saber o número.** `IngestRun` é montado no fechamento do ciclo do coletor
   (`use_cases/collector_run_mapping.py:87-103`, `:117-137`), com `n_written=0` literal em `:94` e
   `:131`. O escritor é **outro processo** (`infra/single_writer_cli.py`), consumindo da fila Redis.
2. **O número já é calculado — e é descartado.** `single_writer_cli.py:355-356`:
   `n_accepted = sum(1 for outcome in outcomes if outcome is WriteOutcome.ACCEPTED)`. É exatamente
   *"linhas efetivamente persistidas"*.
3. **A porta já é upsert.** `PostgresIngestRecordStore.record_run` usa
   `INSERT … ON CONFLICT (run_id) DO UPDATE SET … n_written = EXCLUDED.n_written`
   (`postgres_ingest_record_store.py:106-128`). ⇒ **fechar o run depois não exige coluna nova, método
   novo, nem tocar `INGEST_HEALTH_RUN_COLUMNS`.**

---

## D1 · `n_written` significa **linhas persistidas pelo escritor** — nunca "itens publicados pelo coletor"

**O argumento é de falsificabilidade.** `n_returned` **já** carrega "publicados":
`collector_run_mapping.py:91-93` faz `n_expected = n_returned = n_published`, e o docstring diz por quê
(*"there is no independent oracle for how many liquidations SHOULD have arrived"*). Definir `n_written`
como a mesma coisa tornaria `DoD-4` **tautológico**: ele passaria com `md.series` vazia — que é
**exatamente o estado de hoje** (2,6 milhões devolvidos, zero linha do CORE persistida). Um gate que
passa no estado que ele existe para reprovar não é gate.

**Alternativa recusada:** `n_written = n_published`. Custo: `DoD-4` vira ruído, `uptimePercent` passa a
reportar **100%** para um coletor cuja escrita nunca chegou ao banco, e o `rc=0` de `ADR-012` fica
**pior** que hoje — hoje o `0.0` ao menos denuncia; um `100.0` falso não denuncia nada.

## D2 · O **`run_id` viaja com o lote**, e o escritor fecha o run pelo upsert que já existe

O coletor grava o run no fechamento do ciclo (como hoje), com `n_written = 0` — que passa a significar
*"ainda não fechado"*, não *"nada escrito"*. Cada item publicado carrega o `run_id` do ciclo que o
produziu. Ao persistir um lote, o escritor agrega por `run_id` e chama `record_run` com o mesmo
`run_id` e o `n_written` real. O `ON CONFLICT` faz o resto.

**Por que é a menor mudança que resolve:** nenhuma coluna nova, nenhum método novo na porta, nenhuma
mudança de forma em nenhum dos 6 contratos servidos (`SPEC-007`/`RS-1`), e
`INGEST_HEALTH_RUN_COLUMNS` intocada (`ADR-008/D3`, `RS-2`).

**Alternativas recusadas, com custo:**

| alternativa | custo que a recusou |
|---|---|
| **o escritor emite `IngestRun` próprio** | dois runs para um ciclo. `collector_status` agrega por `source`/`endpoint` e passaria a contar o dobro; e um run que **nenhum coletor abriu** não tem janela, `src_sha256` nem `observer_id` honestos — inventaria quatro campos para preencher um |
| **o coletor pergunta ao banco quantas linhas entraram** | o coletor passaria a **ler `md.series`**, atravessando o limite de camada que `RN-6` (escritor único) existe para manter, e a resposta seria uma corrida contra o escritor |
| **novo método `update_run_written` na porta** | funciona, mas acrescenta superfície onde o upsert **já** faz o trabalho (`GA-4`). Mais porta para manter, mesmo resultado |
| **deixar `n_written` como está e afrouxar `DoD-4`** | é dispensar o gate por conveniência — e `D2` é decisão do owner, não desta ADR |

**Custo aceito, declarado:** existe uma **janela** entre o coletor gravar o run e o escritor fechá-lo.
Durante ela, um run legítimo tem `n_written = 0`. ⇒ `DoD-4` é avaliado sobre runs **fechados**, e o
painel precisa distinguir *"aberto"* de *"escreveu zero"*. Sem essa distinção, trocamos um `rc=0`
ambíguo por outro. **Isto é item de fase, não detalhe** (`SPEC-007` §8.3).

⚠️ **`weight_used` continua sendo do coletor** (`RNF-3`) — só `n_written` é do escritor. Misturar os
dois donos num mesmo upsert é como se perde um campo sem ninguém notar: o escritor **não** pode
sobrescrever campo que ele não mediu, e o teste que prova isso é DoD.

## D3 · O formatador de log passa a imprimir `extra` — e isto **substitui** o `DEF-3` do PRD

`PRD-007`/`DEF-3` e `DIAGNOSTICO.md` afirmam que `writer_batch_acked` e `collector_cycle_completed` são
emitidos **sem** `extra={}`. **Em `0f4ee55`, os dois têm `extra={}` com contador**
(`single_writer_cli.py:357-360`; `collectors_cli.py:477-480`)
`[MEDIDO 2026-09-10: grep -rn 'writer_batch_acked\|collector_cycle_completed' backend/src --include='*.py' -A 3]`.

**O que os apaga é uma linha:** `_STABLE_FORMAT: Final[str] = "%(message)s"`
(`ingest_health_cli.py:33`), usado por `build_stdout_handler` (`:56-58`), que `single_writer_cli.main`
instala. Um formatador de `%(message)s` **anexa `extra` ao `LogRecord` e nunca o imprime**. As duas
observações se reconciliam sem nenhuma estar errada: o código instrumenta, a saída não mostra.

**Decisão: trocar o formatador dentro da fase `01`.** Não é o "programa de observabilidade" que `NG-3`
recusa — é a correção de um defeito de renderização, no mesmo ciclo que mediu o número, pelo mesmo
princípio que `CLAUDE.md` aplica às 50 mensagens de exceção em português.

**Restrições, e elas não são negociáveis:**

- `ingest_health_cli.py:61-64` roteia diagnóstico para `stderr` para que **`stdout` seja a projeção
  sozinha** — defeito real, achado pelo `/qa` de 2026-08-29. **A troca de formatador não pode
  contaminar `stdout` de nenhuma CLI cuja saída é projeção consumida por outro programa.** ⇒ a troca é
  **no handler do processo de serviço** (escritor, coletor), nunca no handler de projeção.
- Evento e chave **novos** nascem em inglês (`CLAUDE.md`, linha 10 — prospectivo). Os **4 eventos em
  português existentes não são renomeados** (`NG-5`): renomear um evento de log quebra consulta **em
  silêncio**, com consumidor fora deste repositório.

**Alternativa recusada:** ficar fora e abrir programa depois. Custo: o número que `RF-4` cria continua
invisível no log, e a próxima ocorrência da classe *"coletor mudo há 46 h"* volta a exigir SQL manual —
com o agravante de que agora sabemos que o dado **estava lá**.

---

## Falsificador desta ADR

**A observação que, se aparecer, mostra que a decisão estava errada:** um run **fechado** (o escritor já
processou todo o lote daquele `run_id`) com `n_written = 0` **enquanto** `md.series` ganhou linhas
daquele `series_key_id` na mesma janela. Isso significaria que o `run_id` não sobreviveu ao transporte —
e então `D2` escolheu o caminho errado, e a alternativa a reabrir é o run próprio do escritor.

**Como medir, e o universo:** sobre os runs da fonte da fase `01`, comparar `Σ n_written` dos runs
fechados contra `count(*)` de `md.series` no mesmo intervalo. **Hoje o lado esquerdo é `0` e o direito é
`23.512`** `[MEDIDO 2026-09-10, n=2.910 runs]`. A ADR só está certa se, depois da fase `01`, os dois
concordarem dentro da janela de runs ainda abertos.

## DoD desta ADR (verificável, com comando e universo)

1. `GET /api/v1/ingest-health` → **≥ 1 run** da fonte da fase `01` com `n_written > 0`, e
   `Σ n_written` dos runs **fechados** igual a `count(*)` de `md.series` daquele `series_key_id` no
   mesmo intervalo. Hoje: **0 runs** satisfazem `[MEDIDO 2026-09-10, n=2.910]`.
2. `GET /api/v1/collector-status` → `uptimePercent` do `premiumIndex` **deixa de ser `0.0`**, e o valor
   **antes e depois** está registrado no gate da fase (`RS-1.a`).
3. `docker logs` do escritor → a linha de `writer_batch_acked` **mostra** `n_accepted`/`n_rejected`.
   Hoje mostra a string nua `[DOC: DIAGNOSTICO.md; causa em D3]`.
4. Teste que prova que o escritor **não** sobrescreve `weight_used` nem nenhum campo que ele não mediu.
5. `make verify` verde.
