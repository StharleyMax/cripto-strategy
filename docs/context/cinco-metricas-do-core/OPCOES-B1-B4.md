# Opções para `B1`..`B4` — menu para o owner, **nada decidido aqui**

**Modo deliberativo, a pedido do owner** (*"ponderar as opções viáveis e ponderar vantagens e
desvantagem de cada abordagem, somente depois de avaliar seguir com a melhor opção"*)
`[PREMISSA-OWNER: 2026-09-11]`. Este documento **não emenda ADR nem SPEC, não escreve ADR nova e
não altera código.** Ele levanta as opções, declara o custo de cada uma, dá a recomendação do
`/architect` **com o motivo**, e nomeia o que cada escolha fecha e não volta atrás.

⛔ **Leia `§B4` antes de qualquer outra coisa: a pendência `B4` está mal diagnosticada, e a
medição de hoje a desmente.** O achado muda o que `PENDENCIAS.md` §A2 registra como pago.

---

## 0 · O que foi medido hoje, e com qual comando

Todos os números abaixo são `[MEDIDO 2026-09-11T11:1xZ]`, contra a **stack de produção viva**
(`deploy-*`, up 10 h, rodando o código da fatia `01`). Nenhuma escrita — só leitura.

```bash
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
docker exec deploy-collector-1 grep -c 'RedisPremiumIndexSink(sink, to_rows, run_id)' \
    /app/src/modules/sentimento/infra/collectors_cli.py          # → 1  (o wiring ESTÁ deployado)
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c \
  "select endpoint, count(*), sum(n_written), sum(n_expected),
          count(*) filter (where writer_accounted_at is not null)
   from md.ingest_run group by 1 order by 1;"
docker exec deploy-api-1 python -c "import urllib.request,json; \
  print(json.load(urllib.request.urlopen('http://localhost:8000/api/v1/collector-status')))"
docker logs deploy-writer-1 --tail 3 ; docker logs deploy-collector-1 --tail 3
```

| endpoint | runs (total) | Σ `n_written` | Σ `n_expected` | runs com `writer_accounted_at` | `uptimePercent` agora |
|---|---:|---:|---:|---:|---:|
| `/fapi/v1/klines` | 558 | 42.600 | 46.992 | 557 | **90,65** |
| `/fapi/v1/premiumIndex` | 3.814 | 4.536 | 3.430.800 | 567 | **0,35** |
| `…forceOrder` | 4 | 0 | 0 | 0 | — |

Runs recentes, individualmente:

| endpoint | `n_returned` | `n_expected` | `n_written` | `writer_accounted_at` |
|---|---:|---:|---:|---|
| `premiumIndex` (6 ciclos seguidos) | 900 | 900 | **8** | preenchido |
| `klines` (5 ciclos seguidos) | 12 | 12 | **4** | preenchido |
| `klines` (o run de backfill, 01:40Z) | 40.320 | 40.320 | 40.316 | preenchido |

E o log de produção, que fecha `ADR-035/DoD-3` **em produção, não só em teste**:

```
deploy-writer-1    → writer_batch_acked n_accepted=2 n_rejected=0
deploy-collector-1 → collector_cycle_completed backfill=False endpoint=/fapi/v1/klines
                     n_published=4 n_returned=12 run_id=2b57f04e-… verdict=ACCEPTED
```

---

## B1 · Desvio de `ADR-035/D3` — handler de serviço × distinção no registro

### O estado real, medido

`build_stdout_handler` é **uma função só**, usada pelos **9** módulos — as 7 CLIs de projeção
(`ingest_health_cli.py:205`) e os 2 processos de serviço (`single_writer_cli.py:514`,
`collectors_cli.py:1186`) `[MEDIDO: grep -n 'build_stdout_handler' sobre os 3 arquivos]`.
A separação que `D3` pede *no handler* virou separação *no registro*: `ExtraRenderingFormatter`
só acrescenta pares **quando o registro carrega `extra=`**, e uma varredura AST prova que
nenhuma CLI de projeção passa `extra=` (**0 infratores em 9 módulos**, `T-01.5-builder.md` §5/§8).
`single_writer_cli.py` — o arquivo que o lote `1B` proibia tocar — **está livre desde `696707c`**.

### As opções

| # | opção | vantagem | desvantagem / custo declarado |
|---|---|---|---|
| **1** | **Instalar o handler de serviço** (`build_service_stdout_handler` com `ExtraRenderingFormatter`; `build_stdout_handler` volta a ser `logging.Formatter` puro), em task de acompanhamento — e **remover** a varredura AST, que passa a ser redundante | cumpre a letra de `D3`; a garantia vira **estrutural**: uma CLI de projeção nova nasce **incapaz** de imprimir `extra`, mesmo que alguém escreva `extra=` nela | +1 task tocando **dois** arquivos que acabaram de mudar (`T-01.3`/`T-01.4`); e **troca uma guarda medida por uma guarda declarada** — a varredura tem 4 mutantes plantados e mortos, o handler novo nasceria sem histórico. Exige reconstruir os containers para reverificar o `DoD-3` que hoje está **verde medido** |
| **2** | **Emendar `D3`** aceitando a distinção por registro | custo zero de código; o mecanismo está **verde em produção** (log do writer acima) | uma restrição marcada **"não negociável"** passa a ser negociada, e o motivo é **conveniência de agendamento de lote** — o pior motivo possível. E a garantia passa a depender de uma **enumeração de 9 módulos**: um 10º módulo de projeção nasce fora dela a menos que alguém lembre. É a classe de allowlist que `CLAUDE.md` nomeia como erosão |
| **3** | **As duas camadas, com hierarquia declarada**: instalar o handler de serviço **e manter** a varredura AST, emendando `D3` para dizer que o handler é a **garantia** e a varredura é o **falsificador dela** | ganha a garantia estrutural **sem** abrir mão de um portão já medido; o custo marginal sobre a opção 1 é ≈ zero, porque a varredura já existe e já é verde | dois mecanismos para um invariante ⇒ é preciso dizer **qual manda** quando divergirem (é isso que a hierarquia declarada resolve); e `D3` é emendada de qualquer jeito, só que para **acrescentar**, não para relaxar |

### Recomendação: **3**, degradando para **1** se o owner quiser menos superfície

**Motivo:** a opção 1 pura propõe **apagar** uma guarda com 4 mutantes mortos para instalar outra
sem histórico — é o inverso exato da disciplina deste repositório. A opção 2 paga o precedente
("*não negociável* passa a significar *negociável se der trabalho*") por uma causa **que já não
existe** — o arquivo está livre. A opção 3 é a única em que nenhuma garantia é perdida.

**O que a escolha fecha:** escolher **2** fecha o precedente e ele não volta atrás — toda restrição
futura marcada não-negociável passa a ter este caso como referência. **1** e **3** não fecham nada
irreversível.

**Interação:** `B1` é **independente** de `B2`/`B3`/`B4` — arquivos e decisões disjuntos.

---

## B2 · O mecanismo de `ADR-035/D2` foi falsificado com número

### O estado real

A **decisão** de `D2` (*o escritor fecha o run que o coletor abriu, por `run_id`*) está honrada e
**provada em produção**: 557 de 558 runs de klines e 567 runs de premiumIndex têm
`writer_accounted_at` preenchido. O que foi falsificado é o **mecanismo** que o texto descreve:

- *"chama `record_run`, o `ON CONFLICT` faz o resto"* ⇒ o `DO UPDATE` sobrescreve **16 campos**
  (`postgres_ingest_record_store.py`, antes de `T-01.4`) ⇒ o próprio **`DoD-4` de `ADR-035`**
  (*"teste que prova que o escritor não sobrescreve `weight_used`"*) é **insatisfazível por aquela
  porta**;
- o crédito precisa ser **aditivo**: lote de 100 contra run de 10.080 ⇒ `SET n_written = EXCLUDED…`
  guardaria só o último lote.

A solução entregue: `credit_written` (UPDATE que nomeia **2** colunas e é incapaz de nomear uma
terceira) + coluna `writer_accounted_at` **TABLE-only**, fora de `INGEST_HEALTH_RUN_COLUMNS` ⇒ o
`sha256` de `ADR-008/DoD-2` é byte-idêntico. Isso contraria `SPEC-007`/`GA-4` (*"não exige schema
novo, método novo, nem tocar `INGEST_HEALTH_RUN_COLUMNS`"*) nos dois primeiros itens, **não no
terceiro**.

### As opções

| # | opção | vantagem | desvantagem / custo declarado |
|---|---|---|---|
| **1** | **Emendar o texto do mecanismo** em `ADR-035/D2` **e** em `SPEC-007`/`GA-4`, registrando os dois números que falsificaram o anterior (16 campos; lote 100 × run 10.080), mantendo a decisão intacta | o documento passa a descrever o que existe; o **falsificador** da ADR continua válido e agora é **observável** (`writer_accounted_at` distingue run aberto de run que escreveu zero); **zero** código | a emenda precisa admitir que a economia declarada em `GA-4` **não se realizou**, e dizer por quê. Custo: 2 documentos, 0 arquivos de código |
| **2** | **Reverter para `record_run`/`ON CONFLICT`** como a ADR escreveu | o texto volta a ser verdadeiro sem emenda | **perde o `DoD-4` da própria ADR** (insatisfazível por aquela porta) e perde todo lote menos o último. Custo: reverter `T-01.4` inteira. **Nenhuma vantagem medida** — está no menu por honestidade, não como candidata |
| **3** | **Não emendar** — deixar o desvio só no gate `T-01.4-build.md` | zero trabalho agora | `ADR-035/D2` e `GA-4` passam a descrever um mecanismo inexistente, e as **fatias 02–05 reusam este caminho** ⇒ quem ler vai orçar "nenhuma coluna nova". É exatamente o defeito que `CLAUDE.md` registra como já ocorrido aqui: **regra invertida propagada por dois documentos**. Custo: juros em cada fatia seguinte |

### Recomendação: **1**

**Motivo:** a decisão está certa e medida; só o texto do mecanismo está errado. E a coluna
TABLE-only **não é precedente novo** — `domain/ingest_record.py:16-19` já documenta esse mesmo
split para `started_at`/`ended_at`.

**O que a escolha fecha:** **1** fecha "coluna TABLE-only é caminho legítimo quando a projeção
canônica não pode mudar" — e isso é desejável, porque a alternativa é mexer em
`INGEST_HEALTH_RUN_COLUMNS` e no `sha256` de `ADR-008/DoD-2`. **3** não fecha nada, mas garante
que a próxima fatia repita o erro.

**Interação:** `B2` ↔ `B4` — **as duas emendam `ADR-035`** (`D2` aqui, `D1` lá) e a `B4` toca
`collector_run_mapping.py`, o mesmo módulo de `B2`. ⇒ **emendar as duas numa passada só.**

---

## B3 · `SPEC-004` §3.1 diz "duas threads" — são três

### O estado real

`collectors_cli.py:1108,1122,1136` ⇒ **3 threads** (`forceOrder`, `premiumIndex`, `klines`)
`[MEDIDO: grep -n 'threading.Thread' backend/src/modules/sentimento/infra/collectors_cli.py]`.
O código **já declara a extensão** em comentário (`collectors_cli.py:17-21`: *"`T-01.3` adds
`_run_klines_collector`, so the sentence above reads TWO … extends rather than violates"*).

⚠️ **E o número volta a mudar:** `ADR-036/D2`, `D3` e `D5` colocam coletores novos nas fatias
`02`–`05` (OI por `/futures/data/*`, long/short, liquidações pela Coinalyze).

### As opções

| # | opção | vantagem | desvantagem / custo declarado |
|---|---|---|---|
| **1** | Emenda mínima: "duas" → "três", nomeando a thread de klines | 1 linha; o documento fica verdadeiro **hoje** | fica falso de novo na fatia `03`, e depois na `04` e na `05` ⇒ **a mesma emenda 3 vezes**, numa SPEC de **outra feature** (`captura-em-producao`) |
| **2** | Emenda estrutural: §3.1 passa a declarar o **invariante** — *um processo, uma thread por superfície de coleta declarada* — e remete a **contagem** ao catálogo de séries de `SPEC-007` | não envelhece; a fatia `03` não reabre `SPEC-004`; custo idêntico ao da opção 1 (uma edição) | `SPEC-004` deixa de ser a fonte do número — quem quiser "quantas threads hoje" vai a `SPEC-007`/código. É **remissão**, o mesmo padrão que a linha 8 da tabela de `CLAUDE.md` usa para não criar duas verdades |
| **3** | Não emendar `SPEC-004`; registrar só em `SPEC-007` que ela estende §3.1 | zero mudança em documento de feature alheia; o comentário no código já declara | `SPEC-004` §3.1 continua com **uma frase falsa**, e é o documento que o operador lê primeiro ⇒ **duas verdades sobre a mesma superfície**, que é o que a remissão existe para evitar |

### Recomendação: **2**

**Motivo:** é a única que não volta à mesa nas fatias `03`/`04`/`05`, e custa a mesma edição que a
opção 1. **O que a escolha fecha:** `SPEC-004` deixa de carregar a contagem — decisão barata de
reverter, mas se ficar como está, a dívida cresce uma linha por fatia.

**Interação:** `B3` ↔ `B4` — o **mesmo parágrafo** de `SPEC-004` §3.1 (linha *"registro: …
`n_returned` = eventos/leituras **publicados** na sessão/ciclo"*) é onde a invariante que `B4`
questiona está escrita. ⇒ **se `B4` for resolvido, `B3` cai na mesma edição.**

---

## B4 · ⛔ `premiumIndex` a `0,0%` — a pendência está **mal diagnosticada**

### O que `PENDENCIAS.md` §B4 afirma, e o que a medição de hoje mostra

| afirmação em `PENDENCIAS.md` | medição de 2026-09-11T11:1xZ | veredito |
|---|---|---|
| *"o conserto de `n_written` é por caminho, e só o de klines foi ligado"* | o wiring de `premiumIndex` **está no código deployado** (`grep -c` no container → **1**) e o escritor **credita**: **567 runs** com `writer_accounted_at`, `n_written = 8` por ciclo | **FALSO** |
| *"`premiumIndex` segue com `uptimePercent: 0,0%`"* | `uptimePercent = **0,35**` | **desatualizado** — era `0,0` porque a janela de 24 h era dominada por runs **pré-deploy** |
| `PENDENCIAS.md` §A2: *"item 4 ✅ — 40.324 creditadas, `uptimePercent` 99,95%"* | klines está em **90,65%** e **caindo** | **verde que expira** — ver abaixo |

### A causa real: **numerador e denominador estão em unidades diferentes**

| endpoint | `n_expected` é… | `n_written` é… | teto estrutural |
|---|---|---|---:|
| `premiumIndex` | `n_symbols` = **900** (todo símbolo que a Binance devolve) `collector_run_mapping.py:186` | **8** linhas persistidas (4 símbolos × 2 séries) | **0,89%** |
| `klines` | `n_returned` = **12** barras (3 por símbolo, com sobreposição deliberada de re-leitura) `:242` | **4** linhas (as 8 repetidas são deduplicadas pelo escritor) | **33,3%** |
| `forceOrder` | `n_published` `:144` — **já é a unidade de linha** | linhas persistidas | 100% |

⚠️ **O `90,65%` de klines é o run de backfill (`n_expected` 40.320 / `n_written` 40.316) ainda
dentro da janela de 24 h. Ele sai por volta de `2026-09-12T01:40Z` e o número cai para ~33%.**
⇒ **o item 4 do `DoD-VERTICAL`, que `PENDENCIAS.md` §A2 marca ✅, está verde numa medição que
expira em ~14 h.** Se `T-01.11` fechar a fatia sobre esse número, fecha sobre um número morto.

⇒ `ADR-035/DoD-2` (*"`uptimePercent` do `premiumIndex` deixa de ser `0.0`"*) está **literalmente
satisfeito** (`0,35`) e **substantivamente não**: o painel mostra `0,35%` e `33%` para coletores
**saudáveis**. É a classe de sinal ambíguo que `ADR-012` nomeia, e é a mentira que `D7` do owner
mandou trocar por verdade — trocada por outra.

### As opções

| # | opção | vantagem | desvantagem / custo declarado |
|---|---|---|---|
| **A** | **`n_expected` passa à unidade de linha** nos três caminhos (o que o ciclo publicou), alinhando `klines`/`premiumIndex` ao que `forceOrder` já faz | `uptimePercent` volta a significar *"do que tentei escrever, quanto entrou"*: klines **100%**, premiumIndex **100%**; nenhuma rota muda de FORMA; nenhuma coluna nova | contraria um argumento **já escrito e deliberado**: `collector_run_mapping.py:221-228` guarda `n_expected = n_returned` **para que o tamanho do corte anti-lookahead fique legível**. Perder isso mexe justamente na superfície onde `CLAUDE.md` registra um defeito real (regra anti-lookahead invertida). Exige emendar `ADR-035/D1`; e a janela de 24 h **mistura duas semânticas** durante a transição |
| **B** | **`n_expected` fica como está; `uptimePercent` passa a medir RUNS, não linhas**: *% de runs **fechados** na janela com `n_written > 0`* | é o que o **nome do campo** diz. Medido hoje: klines **560/561 = 99,8%**, premiumIndex **571/571 = 100%** dos runs fechados (e 1.530 dos 2.101 da janela são pré-deploy, ainda abertos), forceOrder **0/3 = 0%** — o socket morto continua denunciado. **Não perde o corte anti-lookahead.** `writer_accounted_at`, que `T-01.4` criou, é exatamente o que torna "fechado" observável | muda a **fórmula** sob o mesmo nome de campo. Só é legítimo porque `D7` já autorizou esse ato uma vez (*"trocar mentira por verdade não é quebra de contrato"*) — mas é preciso o owner **reafirmar**, não presumir. Custo: `collector_status.py` (um arquivo), emenda em `ADR-035`, e a métrica deixa de dizer *quanto do dado* entrou |
| **C** | **Nada muda no código**: declara-se a semântica atual e o `DoD-4` passa a ler `n_written > 0` em run fechado — que é o que `ADR-035/DoD-1` **já** pede | zero código; defensável no papel | o painel continua mostrando `0,35%` e `33%` para coletor saudável, e o owner lê isso como coletor quebrado. **Aceita que o painel minta em troca de um teste verde** — o oposto do que a feature existe para fazer |

### Recomendação: **B**, e como **task própria, não resíduo da fatia `01`**

**Motivo, em três:** (i) `B` conserta o significado **sem** sacrificar a legibilidade do corte
anti-lookahead, que é um argumento já medido e escrito no código; (ii) `A` e `B` dão o mesmo
alívio no painel, mas `A` paga com a superfície onde este repositório já se queimou; (iii) é
**task própria** porque toca `ADR-035/D1` (decisão, não ajuste), porque o defeito é **anterior à
fatia `01`** (`premiumIndex` sempre teve `n_expected = 900`), e porque as fatias `02`–`05`
herdam o mesmo defeito em cada coletor novo ⇒ **consertar agora custa 1; depois, 5.**

**O que a escolha fecha:**
- **B** fecha `uptimePercent` como métrica de **disponibilidade de ciclo**, e ela deixa de poder
  responder *"quanto do dado da fonte virou linha"* — essa pergunta passa a exigir
  `n_returned` × `n_written`, que continuam na projeção;
- **A** fecha `n_expected` como *"o que este ciclo mandou persistir"* e **não volta atrás** sem
  quebrar a comparabilidade com todo run já gravado;
- **C** não fecha nada e transfere o custo para o owner, toda vez que ele abrir o painel.

### Interações de `B4`

1. **`B4` ↔ `PENDENCIAS.md` §A2** — o ✅ do item 4 do `DoD-VERTICAL` depende de um run de backfill
   que sai da janela em ~14 h. **Independentemente da opção escolhida**, `§A2` e `§B4` de
   `PENDENCIAS.md` carregam números falsificados hoje e precisam de correção.
2. **`B4` ↔ `B2`** — as duas emendam `ADR-035` (`D1` e `D2`) e tocam `collector_run_mapping.py`.
3. **`B4` ↔ `B3`** — a invariante de `n_returned` está escrita em `SPEC-004` §3.1, o mesmo
   parágrafo de `B3`.
4. **`B4` ↔ `T-01.11`** — a task que fecha a fatia `01` afere o `DoD-VERTICAL`. Se `B4` não for
   resolvido antes, `T-01.11` fecha sobre `uptimePercent` ≈ 33%.

---

## Resumo do menu

| pendência | opções | recomendação do `/architect` | é resíduo da fatia `01`? |
|---|---|---|---|
| `B1` handler × registro | 1 handler · 2 emendar `D3` · 3 **as duas camadas** | **3** (degradando para 1) | task de acompanhamento na fatia `01` |
| `B2` mecanismo de `D2` | 1 **emendar texto** · 2 reverter · 3 não emendar | **1** | não é código — é emenda de documento |
| `B3` "duas threads" | 1 "três" · 2 **invariante + remissão** · 3 não emendar | **2** | não é código |
| `B4` `uptimePercent` | A `n_expected` em linhas · **B `uptimePercent` por run** · C declarar e aceitar | **B** | **não** — é defeito anterior, **task própria** |

**Nada acima foi executado.** O `/architect` aguarda a escolha do owner para emendar `ADR-035`
(`D1`, `D2`, `D3`), `SPEC-004` §3.1 e `SPEC-007`/`GA-4`, e para abrir as tasks que a escolha
implicar.
