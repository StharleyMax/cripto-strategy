# ADR-035 — Contabilidade de `n_written`: o escritor fecha o run que o coletor abriu

**Data:** 2026-09-10 · **Status:** proposta · **SPEC:** [`SPEC-007`](../specs/SPEC-007-cinco-metricas-do-core.md)
**Fase:** `01` (volume) · **Componentes alvo:** `sentimento` (mapeamento e transporte do `run_id`), `infra` (o escritor e o formatador de log)
**Co-assinatura necessária:** `infra-architect` (topologia do escritor único, `D2`) — despachada pelo `/tech-lead` na abertura da fase `01`
**Origem:** `PRD-007`/`RF-4` e `DEF-1`; achados `GA-4`, `GA-5` e `GA-6` do Gap Analysis (`SPEC-007` §1)
**⚠️ EMENDADA em `2026-09-11`** — `[DECISÃO-OWNER: 2026-09-11, escolha entre alternativas apresentadas]`, menu em [`OPCOES-B1-B4.md`](../context/cinco-metricas-do-core/OPCOES-B1-B4.md), escolhas em [`DECISOES-OWNER.md`](../context/cinco-metricas-do-core/handoff/DECISOES-OWNER.md) §D9–D12. **Quatro emendas, e três delas mudam o que se lê aqui:** `D1` ganha a fórmula de `uptimePercent` (runs FECHADOS, não linhas); **o mecanismo escrito em `D2` foi falsificado com número — o título *“pelo upsert que já existe”* NÃO descreve o que existe**; `D3` ganha a hierarquia declarada entre handler e varredura AST; e o `DoD-2` passa a ser aferido pela fórmula nova. **As três DECISÕES seguem de pé — o que mudou é mecanismo, fórmula e hierarquia, nunca a escolha.**

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

### Emenda `2026-09-11` (`D12`/`B4`) — `uptimePercent` mede **runs FECHADOS**; `n_expected` **não muda**

`[DECISÃO-OWNER: 2026-09-11, escolha entre 3 alternativas apresentadas]` — opção `B`. Menu, custos e
recusadas em [`OPCOES-B1-B4.md`](../context/cinco-metricas-do-core/OPCOES-B1-B4.md) §B4; a escolha em
[`DECISOES-OWNER.md`](../context/cinco-metricas-do-core/handoff/DECISOES-OWNER.md) §D12.
**`D1` acima fica como está** — `n_written` continua significando *linhas persistidas pelo escritor*, e
`n_expected` **não é tocado**. Esta emenda ACRESCENTA a fórmula que os consome.

**O defeito que a fatia `01` revelou: numerador e denominador estão em unidades diferentes.**
`use_cases/collector_status.py:118-121` calcula `uptime_percent = 100 · Σ n_written / Σ n_expected`
sobre a janela de `UPTIME_WINDOW_HOURS = 24` (`domain/collector_status.py:30`) — mas `n_expected`
**não é linha**: é `n_symbols` (900) no `premiumIndex` (`collector_run_mapping.py:186`) e `n_returned`
(12 barras, com sobreposição deliberada de re-leitura) no `klines` (`:242`), contra 8 e 4 linhas
persistidas. ⇒ tetos estruturais de **0,89%** e **33,3%** para coletores **saudáveis**
`[DOC: OPCOES-B1-B4.md §B4]`.

**A emenda, normativa:** `uptimePercent` passa a ser **o percentual dos runs FECHADOS da janela cujo
`n_written > 0`**. *Fechado* é observável desde `T-01.4`: `writer_accounted_at IS NOT NULL`
(coluna TABLE-only, `postgres_ingest_record_store.py`). Run **aberto não entra em nenhum dos dois
lados** — nem no numerador, nem no denominador.

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c \
"select endpoint, count(*), count(*) filter (where writer_accounted_at is not null),
        count(*) filter (where writer_accounted_at is not null and n_written > 0),
        round(100.0*sum(n_written)/nullif(sum(n_expected),0),2)
   from md.ingest_run where ended_at::timestamptz > now() - interval '24 hours' group by 1;"
```

| endpoint | runs na janela | fechados | fechados com `n_written > 0` | **`uptimePercent` emendado** | fórmula de hoje |
|---|---:|---:|---:|---:|---:|
| `/fapi/v1/klines` | 572 | 571 | 571 | **100,00** | 90,45 |
| `/fapi/v1/premiumIndex` | 1.431 | 582 | 582 | **100,00** | 0,36 |
| `…forceOrder` | 3 | 0 | 0 | **indefinido** (denominador 0) | — |

`[MEDIDO 2026-09-11T11:26Z contra a stack de produção viva, n = 2.006 runs na janela de 24 h; só
leitura]`. A medição que instruiu a escolha do owner (klines **563/563**, premiumIndex **574/574**) é de
~1 h antes `[DOC: DECISOES-OWNER.md §D12]` — a janela desliza, e os dois números concordam no veredito
**100%**. Os 849 runs de `premiumIndex` da janela que **não** estão fechados são
`[INFERRED: runs anteriores ao deploy de T-01.4 nunca são creditados — nenhum escritor com `run_id` no
lote os alcançou]`.

**Por que `n_expected` NÃO muda — a alternativa `A` recusada:** `collector_run_mapping.py:221-228`
guarda `n_expected = n_returned` **para que o tamanho do corte anti-lookahead fique legível**. É
argumento já escrito e deliberado, e é exatamente a superfície onde este repositório já se queimou (uma
regra anti-lookahead **invertida** e propagada por dois documentos, `CLAUDE.md`). Custo adicional que a
recusa evita: durante a transição, a janela de 24 h misturaria **duas semânticas** de `n_expected`.

**Alternativa `C` recusada** (declarar a semântica atual e não mexer): aceita que o painel mostre
`0,36%` e `34%` para coletor **saudável** — o oposto de `D7` do owner (*"trocar mentira por verdade não
é quebra de contrato"*), que é o mesmo ato que legitima **esta** emenda.

**O que esta escolha FECHA:** `uptimePercent` vira métrica de **disponibilidade de ciclo** e **deixa de
poder responder** *"quanto do dado da fonte virou linha"* — essa pergunta passa a exigir `n_returned` ×
`n_written`, que continuam na projeção canônica e não mudam de forma.

**`forceOrder` e o denominador zero — objeção levantada e RETIRADA, registrada para não voltar:** sob
esta fórmula o socket mudo (3 runs, **0 fechados**) dá **indefinido**, não `0%`. `ADR-036/D4` já tirou o
`!forceOrder@arr` do caminho crítico e `D6` do owner pôs liquidações na Coinalyze ⇒ a objeção pesa sobre
um coletor **já decidido remover** `[DOC: DECISOES-OWNER.md §D12]`. **O requisito que sobra:** o contrato
servido tem de distinguir *indefinido* de `0`, senão troca um `rc=0` ambíguo por outro (`ADR-012`).
`[NÃO MEDIDO]` que forma `collector_status` dá hoje a esse caso — é item da task, não desta emenda.

**Urgência, e ela tem data:** o `90,45%` de klines é **um** run — o backfill `932c37fc…`,
`n_expected = 40.320`, `n_written = 40.316`, `ended_at = 2026-09-11T01:40:39Z` ⇒ **sai da janela de 24 h
em `2026-09-12T01:40:39Z`**. Sem ele a fórmula de hoje cai para **34,21%**
`[MEDIDO 2026-09-11T11:26Z: mesmo SQL com `n_expected < 1000`, n=571 runs]`. Fechar a fatia `01` sobre o
`90,45%` é fechar sobre um número morto.

**Dono e forma: TASK PRÓPRIA do `/tech-lead`, não resíduo da fatia `01`.** O defeito é **anterior** à
fatia (o `premiumIndex` sempre teve `n_expected = 900` símbolos contra 8 linhas) e as fatias `02`–`05`
herdam o mesmo em cada coletor novo ⇒ **consertar agora custa 1; depois, 5.** **Zero código nesta
emenda.**

**Falsificador desta emenda:** um coletor **quebrado** — nenhuma linha nova em `md.series` para o
`series_key_id` dele na janela — aparecendo com `uptimePercent = 100`. Se isso ocorrer, o crédito está
sendo dado sem persistência e o defeito é de `credit_written`, não da fórmula; quem denuncia é a mesma
medida do falsificador desta ADR (Σ `n_written` dos fechados × `count(*)` de `md.series` no intervalo).

## D2 · O **`run_id` viaja com o lote**, e o escritor fecha o run pelo upsert que já existe

> ⛔ **Leia a emenda de `2026-09-11` ao fim desta seção ANTES de orçar trabalho sobre este parágrafo.** O mecanismo descrito abaixo (*“chama `record_run`, o `ON CONFLICT` faz o resto”*) está **falsificado com número**: a porta real é `credit_written`, e há **coluna nova** e **método novo**. A **decisão** — o escritor fecha o run que o coletor abriu, por `run_id` — está intacta e medida.

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

### Emenda `2026-09-11` (`D10`/`B2`) — a **decisão** fica; o **mecanismo** escrito acima foi falsificado com número

`[DECISÃO-OWNER: 2026-09-11, escolha entre 3 alternativas apresentadas]` — opção 1. Menu e recusadas em
[`OPCOES-B1-B4.md`](../context/cinco-metricas-do-core/OPCOES-B1-B4.md) §B2; a escolha em
[`DECISOES-OWNER.md`](../context/cinco-metricas-do-core/handoff/DECISOES-OWNER.md) §D10. **Zero código.**

**A decisão de `D2` — *o escritor fecha o run que o coletor abriu, por `run_id`* — está honrada e
provada em produção:** **571 dos 572** runs de `/fapi/v1/klines` da janela de 24 h e **582** runs de
`/fapi/v1/premiumIndex` têm `writer_accounted_at` preenchido
`[MEDIDO 2026-09-11T11:26Z, n = 2.006 runs na janela; SQL na emenda de `D1`]`. O que foi falsificado é a
frase **"o `ON CONFLICT` faz o resto"**, e são **dois números**.

**1 · A porta é de registro INTEIRO e SUBSTITUTIVA.** `_UPSERT_RUN` insere os **16** campos de
`IngestRun` e seu `ON CONFLICT (run_id) DO UPDATE SET` sobrescreve **15** deles — todos menos `run_id`,
que é a chave do conflito.

```bash
sed -n '/^_UPSERT_RUN = /,/^"""$/p' \
  backend/src/modules/sentimento/infra/postgres_ingest_record_store.py | grep -c '= EXCLUDED\.'   # 15
python3 -c "import ast;t=ast.parse(open('backend/src/modules/sentimento/domain/ingest_record.py').read());\
print([len([s for s in n.body if isinstance(s,ast.AnnAssign)]) for n in ast.walk(t) if isinstance(n,ast.ClassDef) and n.name=='IngestRun'])"  # [16]
```

`[MEDIDO 2026-09-11 em `master`, n = 1 statement / 1 dataclass]`. ⚠️ **Isto corrige um número do próprio
menu:** `OPCOES-B1-B4.md` §B2 e `DECISOES-OWNER.md` §D10 dizem *"16 campos sobrescritos"*; a medição diz
**16 carregados, 15 sobrescritos**. A conclusão **não muda** — entre os 15 estão `window`, `src_sha256`,
`weight_used` e `observer_id`, os **4** campos que a tabela de alternativas recusadas desta mesma `D2`
declara que um escritor **não pode inventar com honestidade** ⇒ o **`DoD-4` desta ADR** (*"teste que
prova que o escritor não sobrescreve `weight_used`"*) é **insatisfazível por aquela porta**.

**2 · O crédito precisa ser ADITIVO, e `SET` não é.** `WRITER_BATCH_SIZE` tem default **100**
(`single_writer_cli.py:141`) contra um run de backfill de **40.320** linhas publicadas — `run_id
932c37fc…`, `n_returned = 40.320`, `n_written = 40.316` `[MEDIDO 2026-09-11T11:26Z em `md.ingest_run`,
n=1 run]` ⇒ **≥ 404 lotes para um único run**, e `SET n_written = EXCLUDED.n_written` guardaria **só o
último**. O número citado no menu (*lote 100 × run 10.080*) é o **por símbolo** (7 dias × 1.440 min); o
run real é **4×** isso, com os 4 símbolos do piloto.

**O mecanismo que vale, e que SUBSTITUI o parágrafo de `D2` acima:** o escritor **não** chama
`record_run`. Ele chama **`credit_written`**, um `UPDATE` que nomeia **2** colunas —
`n_written = n_written + %s` (aditivo) e `writer_accounted_at` — e é **estruturalmente incapaz de nomear
uma terceira** (`postgres_ingest_record_store.py`, `_CREDIT_RUN_WRITTEN`). É assim que `DoD-4` passa a
ser satisfeito **por construção**, não por boa vontade de teste. O `UPDATE` é **no-op reportado pelo
`rowcount`** quando o coletor ainda não gravou o run — o escritor costuma alcançar as linhas **antes** do
fechamento do ciclo — para que o chamador **retente** em vez de INSERIR um run que ninguém abriu.

**A economia declarada em `GA-4` NÃO se realizou — 2 dos 3 itens caíram:**

| item de `GA-4`/`SPEC-007` | veredito | o que existe |
|---|---|---|
| *"não exige schema novo"* | ❌ **caiu** | coluna nova `writer_accounted_at`, **TABLE-only** |
| *"não exige método novo"* | ❌ **caiu** | método novo na porta: `credit_written` |
| *"não exige tocar `INGEST_HEALTH_RUN_COLUMNS`"* | ✅ **de pé** | intocada ⇒ o `sha256` da projeção canônica (`ADR-008/DoD-2`) é byte-idêntico e nenhuma rota servida muda de forma |

**Por que não se realizou, em uma frase:** `GA-4` leu *"`record_run` já é upsert"* como *"já é a porta do
escritor"*, e não é — o upsert é **de registro inteiro e substitutivo**, e o escritor precisa de
**parcial e aditivo**. As duas propriedades que faltavam são exatamente os dois números acima.

**Coluna TABLE-only não é precedente novo:** `domain/ingest_record.py:16-19` já documenta o mesmo split
TABLE-only / QUERY-only para `started_at`/`ended_at`; `writer_accounted_at` entra do lado TABLE.
**O que a escolha fecha:** *"coluna TABLE-only é caminho legítimo quando a projeção canônica não pode
mudar"* — e isso é desejável, porque a alternativa é mexer em `INGEST_HEALTH_RUN_COLUMNS` e no `sha256`
de `ADR-008/DoD-2`.

**O que a emenda COMPRA além de honestidade:** o falsificador desta ADR passa a ser **observável**.
`writer_accounted_at NULL` = run **aberto**; timestamp com `n_written = 0` = o escritor contabilizou e
persistiu **nada**. Sem a coluna, os dois colapsam no mesmo `0` — trocar um `rc=0` ambíguo por outro é
precisamente o modo de falha que `ADR-012` nomeia.

**Alternativas recusadas nesta emenda:** (2) **reverter** para `record_run`/`ON CONFLICT` — perde o
`DoD-4` da própria ADR e perde todo lote menos o último; **nenhuma vantagem medida**. (3) **não emendar**
— `D2` e `GA-4` passariam a descrever um mecanismo inexistente enquanto as fatias `02`–`05` **reusam este
caminho**, que é o defeito já registrado neste repositório: regra propagada por dois documentos
(`CLAUDE.md`, §*"Nenhum número sem o comando que o produziu"*).

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

### Emenda `2026-09-11` (`D9`/`B1`) — **duas camadas**, e a hierarquia entre elas é declarada

`[DECISÃO-OWNER: 2026-09-11, escolha entre 3 alternativas apresentadas]` — opção 3. Menu e recusadas em
[`OPCOES-B1-B4.md`](../context/cinco-metricas-do-core/OPCOES-B1-B4.md) §B1; a escolha em
[`DECISOES-OWNER.md`](../context/cinco-metricas-do-core/handoff/DECISOES-OWNER.md) §D9.
⛔ **Esta emenda ACRESCENTA. Nenhuma restrição de `D3` é relaxada** — em particular, a restrição marcada
*não negociável* acima continua não negociável.

**O que a fatia `01` entregou, e onde diverge da letra de `D3`:** `D3` pede a separação **no handler**; o
que existe hoje é separação **no registro**. `build_stdout_handler` é **uma função só**, e os **9**
módulos do universo a instalam — 8 importadores mais o próprio `ingest_health_cli`:

```bash
grep -rl 'from src.modules.sentimento.infra.ingest_health_cli import' backend/src --include='*.py' | wc -l   # 8  (+1 = o próprio módulo)
```

`[MEDIDO 2026-09-11]`. ⚠️ O grep de **uma linha** por `import build_stdout_handler` devolve **0** — todo
importador escreve o import parentizado em várias linhas; por isso a guarda abaixo é **AST, não regex**.

A separação vive no registro: `ExtraRenderingFormatter` só acrescenta pares **quando o registro carrega
`extra=`**, e **nenhuma CLI de projeção passa `extra=`** — **0 infratores** sobre os 9 módulos menos os
**2** declarados de serviço (`single_writer_cli.py`, `collectors_cli.py`), medido por varredura AST em
`backend/tests/sentimento/test_ingest_health_extra_rendering.py:283`, com **4 mutantes plantados e 4
mortos** `[DOC: docs/context/cinco-metricas-do-core/gates/T-01.5-builder.md §7]`.

#### A emenda, em três itens

1. **GARANTIA = o handler de serviço.** `build_service_stdout_handler` (com `ExtraRenderingFormatter`)
   passa a ser instalado pelos processos de serviço, e `build_stdout_handler` volta a ser
   `logging.Formatter` puro para as CLIs de projeção. É garantia **estrutural**: uma CLI de projeção nova
   nasce **incapaz** de imprimir `extra` no `stdout` da projeção, mesmo que alguém escreva `extra=` nela.
   **Isto é task de acompanhamento do `/tech-lead`** — esta emenda é documento, **zero código**.
2. **FALSIFICADOR = a varredura AST**, que **fica**. Ela não é redundante: responde a pergunta que o
   handler não responde — *"a separação continua sendo a razão do verde, ou alguém começou a emitir
   `extra` de um lado errado?"*. O teste de universo é `==`, não `>=`
   (`test_the_universe_of_importers_is_the_one_this_guard_believes_it_is`), e é isso que impede um **10º**
   módulo de nascer fora da pergunta — a classe de allowlist que `CLAUDE.md` nomeia como erosão.
3. **QUAL MANDA quando divergirem — e a resposta tem três regras, porque a pergunta tem três formas:**
   - **(a) divergência é sempre REPROVAÇÃO.** O verde de uma camada **nunca** dispensa o vermelho da
     outra. Não existe *"o handler está certo, então a varredura pode ficar vermelha"*, nem o inverso.
   - **(b) sobre o COMPORTAMENTO, manda o handler.** Se o handler de projeção deixar de ser
     `%(message)s` puro, o `stdout` da projeção muda **mesmo com a varredura verde** — e quem morde é o
     teste de identidade de bytes e o `sha256` da projeção canônica (`ADR-008/DoD-2`), não a varredura.
   - **(c) sobre o CONSERTO, manda o handler também — no sentido inverso.** Se a varredura acusar uma CLI
     de projeção que **precisa** emitir `extra`, a correção é **promovê-la a processo de serviço**:
     entrar em `DECLARED_SERVICE_PROCESSES` **e** passar a instalar `build_service_stdout_handler`.
     ⛔ **Acrescentar nome à lista de isenção sem trocar o handler daquele módulo é proibido** — é
     bypass com aparência de manutenção, e é o que transforma a guarda em allowlist.

**Por que as duas, e não uma** (o que a escolha recusou): a opção 1 pura **apagaria** uma guarda com 4
mutantes mortos para instalar outra **sem histórico**; a opção 2 negociaria uma restrição marcada *não
negociável* por **conveniência de agendamento de lote**, e por uma causa que **já não existe** —
`single_writer_cli.py`, o arquivo que o lote `1B` proibia tocar, está livre desde `696707c`
`[MEDIDO 2026-09-11: `git log --oneline -1 696707c` → *"merge(T-01.4): run_id viaja com o lote…"*]`.

**Custo aceito, declarado:** dois mecanismos para um invariante, e a troca de handler **exige reconstruir
os containers** para reverificar o `DoD-3`, que hoje está **verde medido em produção**.
`[NÃO MEDIDO]` quanto custa esse rebuild — não foi cronometrado.

**Falsificador desta emenda:** um módulo que instale `build_service_stdout_handler` **e** cuja saída seja
projeção consumida por outro programa (hash, `jq`, diff de bytes). Se ele aparecer, a hierarquia acima
escolheu o dono errado da garantia: a camada estrutural teria de discriminar por **destino do `stdout`**,
não por **lista de processo**, e `DECLARED_SERVICE_PROCESSES` deixaria de ser o eixo certo.

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

### Emenda `2026-09-11` ao `DoD-2` — consequência de `D12`/`B4`, e ela reprova a leitura literal

`DoD-2` pede que o `uptimePercent` do `premiumIndex` **deixe de ser `0.0`**. Ele está **literalmente
satisfeito e substantivamente não**: hoje vale **`0,36`**
`[MEDIDO 2026-09-11T11:26Z, n = 1.431 runs de `premiumIndex` na janela de 24 h]` — deixou de ser `0.0` e
continua mentindo sobre um coletor **saudável** (`582/582` runs fechados escreveram linha). ⇒ **`DoD-2`
passa a ser aferido sob a fórmula emendada em `D1`** (*% dos runs FECHADOS da janela com
`n_written > 0`*), e o valor **antes e depois** continua tendo de ser registrado no gate da fase
(`RS-1.a`). Um `DoD-2` aferido pela fórmula antiga é a classe de sinal ambíguo que `ADR-012` nomeia:
verde indistinguível entre *"consertou"* e *"o instrumento nunca foi capaz de distinguir"*.
