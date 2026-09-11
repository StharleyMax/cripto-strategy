# Opções para `E1`..`E5` — menu para o owner, **nada decidido aqui**

Mesmo modo deliberativo de [`OPCOES-B1-B4.md`](OPCOES-B1-B4.md), a pedido do owner
(*"ponderar as opções viáveis e ponderar vantagens e desvantagem de cada abordagem, somente
depois de avaliar seguir com a melhor opção"*) `[PREMISSA-OWNER: 2026-09-11]`. Este documento
**não emenda ADR nem SPEC, não escreve ADR nova, não cria task e não altera código** — em
particular **não toca `frontend/src/` nem `frontend/e2e/`**, onde há builder ativo.

Ele levanta as opções, declara o custo de cada uma, dá a recomendação do `/architect` **com o
motivo**, e nomeia o que cada escolha fecha e não volta atrás.

⛔ **Leia `§E5` antes de decidir qualquer coisa: a premissa do achado NÃO se reproduz na
medição de hoje**, e a divergência que existe tem **outra causa**. Decidir `E5` pelo enunciado
conserta a causa errada.

---

## 0 · O que foi medido hoje, e com qual comando

Todos `[MEDIDO 2026-09-11T~17Z]`, contra a **stack de produção viva** (`deploy-*`, `postgres`
up 2 d), **só leitura, nenhuma escrita, nenhum seed**.

```bash
docker ps --format '{{.Names}}\t{{.Status}}'
# (1) rotulagem de procedência em md.series
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c \
 "select availability_source, count(*), min(available_at-bucket_end)/1000,
         max(available_at-bucket_end)/1000 from md.series group by 1;"
# → OBSERVED|117740|0|604715     (uma classe só; MODELED = 0 linhas)
# (2) separação backfill × ao vivo pelo mesmo heurístico do achado (>300 s)
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c \
 "select case when available_at-bucket_end > 300000 then 'backfill' else 'ao_vivo' end,
         count(*), count(distinct series_key_id) from md.series group by 1;"
# → ao_vivo|37148|12   backfill|80592|4
# (3) contabilidade de n_written contra as linhas que existem
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c \
 "select e.endpoint, e.sw, e.rf, s.n from
   (select endpoint, sum(n_written) filter (where writer_accounted_at is not null) sw,
           count(*) filter (where writer_accounted_at is not null) rf
      from md.ingest_run group by 1) e
   left join (select source, count(*) n from md.series group by 1) s on s.source=e.endpoint;"
# → klines|84288|893|84288     premiumIndex|7272|909|33480     forceOrder||0|
# (4) a chave única de md.series
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -c \
 "select indexdef from pg_indexes where schemaname='md' and tablename='series';"
# → UNIQUE (series_key_id, symbol, source, bucket_end, observed_at)
# (5) controle de runs fechados com n_written = 0
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c \
 "select count(*) filter (where writer_accounted_at is not null),
         count(*) filter (where writer_accounted_at is not null and n_written=0), count(*)
    from md.ingest_run;"
# → 1797|0|5050
```

| fato medido | valor | universo |
|---|---:|---|
| linhas de `md.series` com `availability_source = 'OBSERVED'` | **117.740 (100%)** | toda a tabela |
| linhas com `availability_source = 'MODELED'` | **0** | toda a tabela |
| atraso máx. `available_at − bucket_end` | **604.715 s ≈ 7,0 d** | `n = 117.740` |
| linhas classificáveis como backfill (`> 300 s`) | **80.592 (68,4%)**, em **4** séries | `n = 117.740` |
| `Σ n_written` (runs fechados) × `count(*)` de `md.series` — **klines** | **84.288 × 84.288 (igual)** | `n = 893` runs fechados |
| `Σ n_written` (runs fechados) × `count(*)` — **premiumIndex** | **7.272 × 33.480 (4,6× menor)** | `n = 909` runs fechados |
| runs **fechados** com `n_written = 0` | **0** de 1.797 | `n = 5.050` runs |

---

## E1 · `available_at` do backfill é a hora da busca ⇒ history importada é invisível ao `as_of`

**Fonte:** [`handoff/ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md`](handoff/ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md)
(`20.148` linhas de backfill na série `ef3033e6…`, atraso até `604.703 s`; `769` de `5.761`
grades legíveis `[MEDIDO 2026-09-11T14:4xZ]`). **Dono: `ADR-006` / `SPEC-001` §5.11.**

**O que a medição de hoje acrescenta ao achado, e muda o menu:** a coluna
`availability_source ∈ {OBSERVED, MODELED}` **já existe** no schema
(`postgres_series_sink.py:47`, com `CHECK`), **já é vocabulário normativo** de `SPEC-001` §5.2
(*"endpoint sem `lag_ms` medido grava `available_at = NULL`, `availability_source = MODELED`, e
a série nasce isolada"*) e **`CA-F3-12`** já proíbe backfill `MODELADO` sobrescrever captura
`OBSERVADA`. ⇒ **o mecanismo da opção 2 já está construído e hoje não é usado por ninguém:**
`MODELED` tem **0 linhas** de `117.740`. O caminho de backfill carimba
`availability_source = OBSERVED` em código (`use_cases/collector_series_mapping.py:473`) para
um `available_at` que é o **instante da nossa requisição**, não o instante em que o dado era
sabível. ⇒ a coluna que existe para separar *visto* de *calibrado* diz **"visto" em 100% das
linhas** e por isso **não carrega informação nenhuma hoje**.

### As opções

| # | opção | vantagem | desvantagem / custo declarado |
|---|---|---|---|
| **1** | **Não mexer.** `available_at` = instante da busca, `OBSERVED`, como hoje | honesto sobre o que sabíamos; zero código; `as_of` intacto no caminho de decisão | **history importada nunca é legível no passado** ⇒ `ADR-036` prevê `klines` desde **2019-09-08** para alimentar backtest (`ADR-036` §Contraste medido) e **o backtest herda o teto**: ele só pode ser rodado sobre o que coletamos ao vivo — **37.148** linhas em **12** séries, contra **80.592** em 4 séries de backfill. Custo: a profundidade de `ADR-036/D5` vira inalcançável **sem que nada reprove**, que é a classe de `rc=0` ambíguo que `ADR-012` nomeia |
| **2** | **Reconstruir `available_at` do backfill** = `bucket_end` + atraso de publicação **medido** daquele endpoint, carimbando `availability_source = MODELED` e mantendo o instante da busca em `ingested_at`/`observed_at` (que já o guardam) | é a única opção que entrega a `ADR-036` o que ela pede; **usa mecanismo já declarado** (`MODELED` + `CA-F3-12` + `provenance`), não inventa vocabulário; o insumo do atraso **existe medido** para `klines` (ao vivo: `min 0 s`, `max 279 s`, `n = 37.148`) | **afirma conhecimento que não tivemos** — é lookahead controlado, e o controle é a etiqueta. Custo: (a) exige atraso **medido por endpoint** antes de qualquer linha (`SPEC-001` §5.2 proíbe `event_time + interval`, o default **361× otimista**), o que amarra `E1` ao `availability_probe_set`/`Q19`; (b) todo número de backtest passa a ser **condicional ao modelo de atraso**, e isso tem de aparecer no relatório, não só na coluna; (c) reescrever as **80.592** linhas já gravadas é migração de dado — ou elas ficam como estão e a fronteira é uma data |
| **3** | **Separar a pergunta:** `as_of` (knowledge-time) fica **intacto**, e o desenho de history passa a usar um leitor **event-time** para janela cujo bordo direito já passou, restrito a `ReadPurpose.RENDERING` | a tela ganha os 7 dias imediatamente, sem tocar em dado nem afirmar conhecimento; o caminho de decisão fica **bit-idêntico** | **não resolve `ADR-036`**: backtest é caminho de decisão e continua com o teto da opção 1. E cria **dois leitores** para a mesma série — a mesma classe de "duas superfícies, dois valores" que `E4` está aqui para fechar. Custo: 1 leitor novo em `sentimento` + a regra escrita de quem pode chamá-lo, e um falsificador que prove que o caminho de decisão não o alcança |

### Recomendação: **2**, com a medição de atraso como pré-condição declarada

**Motivo:** a opção 1 aceita que `ADR-036` fique inalcançável sem nada reprovar — e a
`ADR-036/D5` já foi decidida com o argumento de que `klines` serve desde **2019-09-08**; matar
esse argumento por omissão é pagar o custo da decisão sem receber o benefício. A opção 3 entrega
o pixel e **não** entrega o backtest, que é a metade cara. A opção 2 é a única que serve as duas,
e o repositório **já construiu** o instrumento de honestidade que ela exige (`MODELED`,
`CA-F3-12`, `provenance`) — instrumento que hoje tem **0 linhas** e portanto nunca foi exercido.

**O que a escolha fecha:** **2** fecha, e não volta atrás, que `md.series` passa a conter linhas
cujo `available_at` é **calculado**; a partir daí **todo** consumidor tem de ler
`availability_source`, e todo relatório de backtest tem de declarar o modelo de atraso. **1**
fecha o inverso, e também não volta atrás de graça: a janela ao vivo é a única fonte de história,
então **cada dia não coletado é um dia perdido para sempre** — o custo de 1 cresce com o relógio.
**3** não fecha nada irreversível, mas gasta a decisão sem resolver `ADR-036`.

---

## E2 · Bucket `FLOW` com atraso ≥ grade tem janela de legibilidade **vazia**

**Fonte:** [`handoff/ACHADO-FLOW-COM-ATRASO-MAIOR-QUE-A-GRADE.md`](handoff/ACHADO-FLOW-COM-ATRASO-MAIOR-QUE-A-GRADE.md)
(`5` de `181` grades, correspondência exata com as 5 linhas de `lag ≥ 60.000 ms`; teto de perda
**2,8%** `[MEDIDO 2026-09-11]`). **Dono: `ADR-006` / `SPEC-001` §5.11 (`D4.11`).**

**O que a leitura do código acrescenta:** `as_of()` **já recebe `purpose: ReadPurpose`** como
argumento **obrigatório** (`domain/as_of_accessor.py:73,268`), com `RENDERING` e
`ENTRY_CONDITION`, e `SeriesReadPolicy` **já carrega os dois relógios separados** —
`asof_max_staleness_ms` (decisão) e `render_max_staleness_ms` (desenho), `:152,:157`. Mas o
corte que produz a ausência **não consulta nenhum dos dois**: `:301` faz
`staleness_ms = _require_decision_staleness(policy)` **sempre**, e `:328` aplica
`age_ms >= policy.bucket_interval_ms and not CARRY_FORWARD_BY_NATURE[nature]`
**incondicionalmente**. ⇒ a distinção que o achado diz faltar **já é vocabulário do módulo**;
o que falta é o ponto do fluxo onde ela é usada.

### As opções

| # | opção | vantagem | desvantagem / custo declarado |
|---|---|---|---|
| **1** | **Não mexer.** `SEM_PONTO` continua sendo a resposta | a ausência é **visível** e o caminho de decisão continua recusando o que não é mais verdade — que é o comportamento **correto** ali, não uma limitação | perde-se **2,8%** das grades (`5/181`) num painel, e **nada na tela distingue** "não havia dado" de "havia e a regra não o alcança". Custo: a tela continua mentindo por omissão numa fração pequena, e a fração **cresce com o atraso do fornecedor**, que não controlamos |
| **2** | **Ramificar por `purpose`, no ponto `:328`:** sob `ENTRY_CONDITION` nada muda; sob `RENDERING` o bucket é entregue **com `age_ms` preenchido**, e a borda direita já desenha idade por `SPEC-001` §5.2 (*"`idade = tempo_de_referência − available_at`"*) | usa mecanismo **já existente e já obrigatório** (`ReadPurpose`), sem vocabulário novo; o caminho de decisão fica **provadamente** intacto porque a ramificação é explícita e testável nos dois lados | `as_of` é **o leitor único** — qualquer mudança nele exige fixture envenenada nos dois `purpose` e prova de bit-identidade do lado da decisão (`SPEC-001` §5.1, falsificador `F-1`). Custo: 1 task em `sentimento`, com teste **vermelho antes de verde** nos dois ramos e ≥ 1 mutante plantado por ramo. **E abre precedente**: a partir dela, `purpose` vira eixo legítimo de divergência de comportamento em `as_of`, e a próxima diferença será mais barata de propor |
| **3** | **Usar `render_max_staleness_ms`** como o segundo relógio já previsto, em vez de ramificar no corte de `bucket_interval_ms`: a política de desenho declara explicitamente até onde estica | o parâmetro **já existe** e hoje é **inerte**; a decisão fica com o **consumidor**, declarada na política, não escondida num `if` do acessor | não resolve o caso por si: o corte que derruba a linha é `age_ms >= bucket_interval_ms` (`:328`), que roda **antes** e **não lê** staleness nenhum — então 3 só funciona **junto** de 2. Custo: é 2 + a fiação do parâmetro; e uma política de desenho mal declarada vira o *default por gravidade* que `ADR-006` recusou com número (**361×**) |

### Recomendação: **2**, com a política de desenho (opção 3) como fiação subsequente

**Motivo:** a opção 1 preserva a integridade ao preço de um erro que **não é do dado nem do
código** — é da regra encontrando um atraso maior que a largura do bucket, e o repositório tem o
instrumento para separar os dois usos. A opção 3 sozinha não morde, porque o corte que derruba a
linha não consulta staleness. A 2 é a única que ataca a linha exata onde o comportamento nasce,
e é a única em que a prova de que o caminho de decisão não mudou pode ser **bit-idêntica**.

**O que a escolha fecha:** **2** fecha que `as_of` passa a ter **comportamento diferente por
`purpose` no corpo do resultado** — hoje `purpose` só **recusa** (`:398`, `intrabar` para
entrada), nunca **muda o valor devolvido**. Depois de 2, muda; e a próxima proposta de divergir
por `purpose` cita este caso. **1** não fecha nada, mas o teto de perda é uma função do atraso do
fornecedor e **ninguém o mede continuamente hoje** `[NÃO MEDIDO]`.

### `E1` e `E2` resolvem-se juntas? **Não. Mesmo dono, mesma cláusula, decisões independentes.**

- **`E1` é do lado da ESCRITA** (o que `available_at` significa numa linha importada);
  **`E2` é do lado da LEITURA** (o que `D4.11` faz quando o atraso passa da grade).
- **`E2` não resolve `E1`:** a linha de backfill é rejeitada por **`R-1`** (`available_at <= t`)
  **antes** de qualquer regra de idade rodar — nenhuma ramificação em `:328` a alcança.
- **`E1` não resolve `E2`:** reconstruído, o `available_at` do backfill teria atraso pequeno
  (`< 60.000 ms`) e sairia do caso — mas as **5** linhas do achado são **ao vivo**, e continuam.
- ⇒ **é um único ATO de emenda** a `SPEC-001` §5.11 / `ADR-006` (as duas mexem na mesma
  cláusula e no mesmo vocabulário `OBSERVED`/`MODELED`/`ReadPurpose`), com **duas decisões
  separadas dentro dele**. Decidir uma e adiar a outra é possível e não deixa resíduo.

---

## E3 · `ADR-030/F-5` morreu com a emenda `D12` — e um falsificador que nasce DISPARADO não mede nada

**O fato, verificável no texto:** `ADR-030` §Falsificadores, `F-5` diz que a decisão cai se
`uptimePercent ≠ SELECT 100.0*SUM(n_written)/SUM(n_expected) FROM md_ingest_run …`. A emenda
`2026-09-11` de `ADR-035/D1` (`[DECISÃO-OWNER]`, opção `B` de `B4`) trocou a fórmula por
**"% dos runs FECHADOS da janela com `n_written > 0`"**. ⇒ **as duas divergem por desenho**:
klines **100,00 × 90,45**, premiumIndex **100,00 × 0,36**
`[MEDIDO 2026-09-11T11:26Z, n = 2.006 runs; DOC: ADR-035/D1]`. `F-5` passa a disparar **no
commit que o mantém**, que é exatamente o modo de falha nomeado em `CLAUDE.md`: *"o próximo
leitor o roda, vê que dispara, conclui 'já estava assim' e para de olhar"*.

### As opções

| # | opção | vantagem | desvantagem / custo declarado |
|---|---|---|---|
| **1** | **Reescrever `F-5` em `ADR-030`** com o SQL da fórmula emendada; `D2` de `ADR-030` ganha nota de remissão a `ADR-035/D1` | mínimo: 1 falsificador, 1 SQL; preserva a intenção original de `F-5` (*"o número servido é o número declarado"*) intacta | `uptimePercent` passa a ter a **fórmula escrita em duas ADRs** — `ADR-030/D2` (texto velho + nota) e `ADR-035/D1` (emenda). Custo: quem lê `ADR-030` sozinha lê a fórmula errada até a nota; **a ambiguidade não some, só ganha rodapé** |
| **2** | **Aposentar `F-5`** e deixar o falsificador de `ADR-035` cobrir a grandeza | zero duplicação; um dono | `ADR-030/D2` fica com uma fórmula **sem nenhum** falsificador próprio (`F-6` prova outra coisa: que o valor não voltou a ser "do último run"). Custo: uma decisão publicada deixa de ter como ser derrubada — é o oposto da disciplina que este repositório usa como tese |
| **3** | **Transferir a decisão inteira:** marcar `ADR-030/D2` como **SUPERSEDED por `ADR-035/D1` (emenda 2026-09-11)**, mover fórmula **e** falsificador para `ADR-035`, e reescrever `F-5` lá contra o SQL novo | `uptimePercent` passa a ter **um só lugar onde a fórmula mora e um só falsificador**; e isso é **pré-condição de `E4`** — não dá para exigir uma fonte única de valor enquanto há duas fontes de definição | mexe em **duas** ADRs, e `ADR-030` perde uma decisão que era dela. Custo: 1 ato de emenda em cada; e `ADR-030` fica com `D2` como ponteiro, o que **só é honesto se o ponteiro for explícito** — `SUPERSEDED`, com data e destino, nunca silêncio |

### Recomendação: **3**

**Motivo:** `E3` e `E4` são **o mesmo problema em duas camadas** — a métrica tem mais de uma
definição (E3) e mais de um produtor (E4). A opção 1 conserta o falsificador e **deixa a
definição duplicada**, que é a raiz; a opção 2 remove a rede. A 3 é a única que deixa
`uptimePercent` com **um dono**, e é o que torna `E4` decidível sem reabrir `E3` depois.

**O que a escolha fecha:** **3** fecha que `ADR-030` **deixa de ser o lugar onde se lê a fórmula
de `uptimePercent`** — qualquer leitor futuro de `ADR-030` sozinha obtém um ponteiro, não um
número. **2** fecha irreversivelmente a capacidade de derrubar `D2` com uma query só.

---

## E4 · Duas superfícies calculam `uptimePercent`, e uma delas **não pode** calcular a nova

**Fonte:** [`PENDENCIAS.md`](PENDENCIAS.md) §G1. O console S1, ao ler `/ingest-health`,
recalcula a fórmula antiga no browser —
`frontend/src/features/s1-console/ingest-health-query.ts:709`:

```ts
uptimePercent: run.n_expected > 0 ? (run.n_written / run.n_expected) * 100 : null,
```

**Por que ele é estruturalmente incapaz da nova:** a fórmula emendada exige
`writer_accounted_at`, que é **TABLE-only** — não está entre as **15** colunas de
`INGEST_HEALTH_RUN_COLUMNS` (`domain/ingest_record.py:23-39`, verificado: `n_written` está,
`writer_accounted_at` não), e mexer nessa tupla move o `sha256` de `ADR-008/DoD-2` em **todo
relatório já emitido**. ⇒ nenhuma quantidade de trabalho em `web` faz o browser chegar ao número
novo a partir dessa rota. **⛔ Nada foi editado neste arquivo — há builder ativo em `frontend/`.**

### As opções

| # | opção | vantagem | desvantagem / custo declarado |
|---|---|---|---|
| **a** | **O console S1 deixa de calcular** e passa a ler `uptimePercent` do envelope de `/api/v1/collector-status` | **uma definição, um produtor, um valor.** É a única em que a mesma métrica não pode divergir por rota | o console ganha **dependência dura** de uma segunda rota: `/ingest-health` deixa de bastar para renderizar a linha S1, e uma indisponibilidade de `collector-status` passa a esvaziar um campo que hoje sempre aparece. Custo: task de `web`, colidindo com os hot files da fatia `01` (`T-01.7`) ⇒ **agendamento, não desenho** — e agendamento foi exatamente o motivo errado que produziu `B1` |
| **b** | **Renomear o campo local** para o que ele mede (ex.: *completude de escrita do último run*) e mantê-lo ao lado do outro | barato, só `web`, sem acoplar rota; e **dois nomes para duas grandezas é honesto** — é a mesma saída que `ADR-030` já nomeia como *"renomear `uptimePercent` para o que ele mede"* (dono: `frontend-architect`) | mantém na tela do operador um número com **teto estrutural de 0,89%** (`premiumIndex`) e **33,3%** (`klines`) para coletor **saudável** `[DOC: ADR-035/D1]` — a mentira que `D7` do owner mandou trocar por verdade, agora com nome melhor. Custo: microcopy nova (linha 8 da tabela de idioma ⇒ gate `ux-ui-mastery`) |
| **c** | **O campo derivado de `/ingest-health` declara `unmeasured`/`null`** (a rota não tem insumo para a fórmula vigente), e `uptimePercent` só existe em `collector-status` | nenhum acoplamento novo, nenhum segundo valor, e **é a tese do repositório**: *"o que aparece é o que foi medido"* — mesmo tratamento que `retention`/`resilience` já recebem nessa linha (`ADR-030` §Consequências) | a linha S1 servida por `/ingest-health` **perde o número** até alguém ligar a outra rota ⇒ regressão visível de informação. Custo: task de `web` pequena + a decisão de UX sobre como a ausência aparece |

### Recomendação: **c** agora, **a** como alvo — e **nunca b sozinha**

**Motivo:** `b` é a única que **legitima** dois números para a mesma pergunta e os mantém os dois
na tela; o custo dela não é código, é o operador decidindo com um número cujo teto é `0,89%`.
Entre `a` e `c`, as duas chegam ao mesmo lugar; `c` é reversível, não acopla rota e pode entrar
**sem esperar** o fim da fatia `01`, enquanto `a` colide com hot file — e "agendamento de lote"
já foi, em `B1`, o pior motivo possível para decidir desenho. ⇒ `c` remove o segundo valor hoje;
`a` devolve o número quando a colisão passar.

**O que a escolha fecha:** **a** fecha que `/ingest-health` **deixa de ser fonte suficiente** para
a linha do console S1 — e isso não volta atrás sem reabrir `ADR-008/D3`. **b** fecha o
precedente de que a mesma grandeza pode ter dois valores publicados desde que tenham nomes
diferentes. **c** não fecha nada irreversível.

---

## E5 · ⛔ `n_written` — a premissa do achado **NÃO se reproduz**, e a divergência real tem outra causa

**Fonte:** [`gates/T-01.10-infra.md`](gates/T-01.10-infra.md) §6.2 — *"`n_written` conta linhas
OFERECIDAS ao `INSERT`, não linhas INSERIDAS"*, porque `md.series` insere com
`ON CONFLICT … DO NOTHING`. **Dono: `ADR-035`.**

**O mecanismo, verificado:** `n_written` é `count(WriteOutcome.ACCEPTED)`
(`single_writer_cli.py:471`) e o `INSERT` é `… DO NOTHING` (`postgres_series_sink.py:75`). Até
aqui o achado está certo.

**O que a medição de hoje mostra — e é o contrário do esperado:**

| endpoint | `Σ n_written` (runs fechados) | `count(*)` em `md.series` | veredito |
|---|---:|---:|---|
| `/fapi/v1/klines` | **84.288** | **84.288** | **igualdade exata**, `n = 893` runs fechados |
| `/fapi/v1/premiumIndex` | **7.272** | **33.480** | `n_written` é **4,6× MENOR** que as linhas |

**A causa da igualdade, e ela é estrutural:** a chave única de `md.series` é
`(series_key_id, symbol, source, bucket_end, observed_at)` — **`observed_at` faz parte dela**.
⇒ uma **re-leitura do mesmo bucket num instante diferente é uma LINHA NOVA**, não um
`DO NOTHING` engolido; `as_of` já resolve a duplicata na leitura por `argmin(observed_at)`
(`SPEC-001` §2.5). O `DO NOTHING` só dispara para uma duplicata **exata nas 5 colunas**, e a
igualdade `84.288 = 84.288` sobre `n = 893` runs (incluindo os **dois** runs de backfill de
`n_written = 40.316` cada) mostra que isso **não está acontecendo**.

⚠️ **E o número que `T-01.10` §6.2 usou para afirmar a divergência compara grandezas diferentes:**
*"`n_written = 40.316` enquanto `md.series` ganhou ~10.092 linhas **por símbolo**"* — o run cobre
**4** símbolos, e `40.316 / 4 = 10.079`. **Total de run contra contagem de um símbolo.** O achado
descreve um mecanismo real; a evidência que o acompanha não o demonstra.

**A divergência que EXISTE é outra:** `premiumIndex` tem `7.272` creditadas contra `33.480`
linhas porque **os runs anteriores ao deploy de `T-01.4` nunca foram fechados** — `1.797` runs
fechados de `5.050` no total `[MEDIDO: comando (5) acima]`. ⇒ **o `DoD-4` só é aferível sobre uma
janela em que TODO run está fechado**, e isso hoje não está escrito em lugar nenhum.

### As opções

| # | opção | vantagem | desvantagem / custo declarado |
|---|---|---|---|
| **1** | **Apertar o código à letra de `D1`:** `n_written` passa a ser o `rowcount` real do `INSERT … DO NOTHING` | `n_written` significa literalmente *"linhas persistidas"*, como `D1` já diz; fecha o buraco teórico | **paga código e redeploy por uma divergência cuja medição é ZERO hoje** (`84.288 = 84.288`, `n = 893`). E `n_written` **está entre as 15 colunas canônicas** (`ingest_record.py:30`) ⇒ o **número muda** enquanto o `sha256` de `ADR-008/DoD-2` continua **idêntico em forma**: todo relatório já emitido fica incomparável **sem que a impressão digital avise** — exatamente o sinal ambíguo de `ADR-012`. **Custo mais alto do menu, pelo benefício menos medido** |
| **2** | **Emendar `D1` para dizer o que é contado** (linhas oferecidas a um `INSERT` cuja chave única inclui `observed_at`, logo re-leitura em instante diferente **é** linha nova) **e declarar o universo do `DoD-4`**: só vale sobre janela onde **todo** run está fechado | conserta a **causa medida** (`7.272 × 33.480` = runs não fechados), custa **documento**, e torna o `DoD-4` verificável em vez de ambíguo | o caminho `DO NOTHING` continua **sem instrumento**: se um dia começar a morder, nada avisa. Custo: 1 emenda a `ADR-035/D1` + nota ao `DoD-4` |
| **3** | **`2` + falsificador:** o sink devolve `rowcount`, o escritor compara **oferecidas × persistidas** e **grita** se divergirem, sem mudar o que `n_written` armazena | mantém o número servido **estável** (nada muda na projeção canônica) e converte o buraco teórico em **buraco medido**; é a disciplina do repositório aplicada ao próprio achado | dois contadores no processo, um só publicado ⇒ é preciso dizer qual manda (o publicado). Custo: `rowcount` no sink + 1 par de chaves em `extra={}` do `writer_batch_acked` + 1 teste com duplicata exata plantada. **Nota:** a chave de `extra` nasce **em inglês** (linha 10 da tabela de idioma) |

### Recomendação: **3**

**Motivo:** a premissa do achado **não se reproduz na medição**, e a opção 1 conserta a causa que
não foi observada — ao preço de mover, em silêncio, um número que vive dentro do contrato de 15
colunas. A opção 2 conserta a causa que **foi** observada e custa documento. A 3 é a 2 mais a
rede que falta: em vez de decidir hoje se o `DO NOTHING` morde, ela faz o sistema **avisar**
quando morder. É o mesmo padrão que o owner já escolheu em `B1` (garantia + falsificador dela).

**O que a escolha fecha:** **1** fecha irreversivelmente a comparabilidade de `n_written` com
todo relatório emitido antes dela — e o `sha256` **não** registra a quebra, então a perda é
silenciosa por construção. **2** e **3** não fecham nada; **3** ainda deixa a porta aberta para
`1` no dia em que o falsificador disparar **com número**.

---

## Interações — o que se resolve na mesma passada, e o que NÃO

| par | resolvem juntas? | por quê |
|---|---|---|
| **`E1` + `E2`** | **um ATO, duas decisões** | mesma cláusula (`SPEC-001` §5.11 / `ADR-006`) e mesmo vocabulário (`OBSERVED`/`MODELED`, `ReadPurpose`), mas `E1` é escrita e `E2` é leitura. **Nenhuma resolve a outra:** o backfill morre em `R-1`, antes de `D4.11`; as 5 linhas de `E2` são **ao vivo**, e sobreviveriam a qualquer conserto de `E1`. Decidir uma e adiar a outra **não deixa resíduo** |
| **`E3` + `E4`** | **SIM, e na ordem `E3 → E4`** | são a mesma métrica em duas camadas: `E3` é *"a fórmula tem dois lugares onde mora"*, `E4` é *"o número tem dois produtores"*. **Fechar `E4` antes de `E3` é escolher fonte única de valor enquanto ainda há duas fontes de definição** — a divergência voltaria pela porta do documento |
| **`E5` → `E3`/`E4`** | **precedência, não fusão** | a fórmula emendada de `D12` lê **`n_written > 0`**. Se `E5` escolher a opção **1**, o significado de `n_written` muda e **o `uptimePercent` novo se move junto**. ⇒ `E5` tem de ser decidida **antes** de a task da fórmula nova (`D12`) mergear, senão ela nasce sobre um contador que pode ser redefinido |
| **`E1`/`E2` × `E3`/`E4`/`E5`** | **independentes** | módulos, arquivos e ADRs disjuntos: `as_of`/`md.series` de um lado, `md.ingest_run`/`collector_status` do outro |

## O que este documento NÃO faz

Não decide, não emenda `ADR-006`/`ADR-008`/`ADR-030`/`ADR-035`/`SPEC-001`, não escreve ADR nova,
não cria task, não altera código e **não tocou `frontend/`**. Nenhum gate de owner foi executado:
a SPEC desta feature continua onde o ledger diz que está (`harness pipeline state
cinco-metricas-do-core` → `BUILD_AUTHORIZED`).

---

# `E6` · Marco zero — limpar `md.series` e reingerir, e o que isso muda no custo de `E1`

**Levantado em 2026-09-11 a pedido do owner**, literal:

> *"antes da virada para essa feature estávamos capturando alguns dados pelo WS e ele n tinha
> todos os dados que precisaria para os candles e talz. Ele foram importados muito antes de
> várias definições. limpar essa base inteira e ter esse marco zero ou que já tinha na base n
> gera impacto?"* `[PREMISSA-OWNER: 2026-09-11]`

⛔ **Nada decidido aqui.** Este bloco existe porque a resposta medida **muda o custo de `E1`**, e
decidir `E1` sem ela é decidir com o preço errado.

## 0 · O que foi medido, e com qual comando

Todos `[MEDIDO 2026-09-11T~19:20Z]`, contra a stack de produção viva, **só leitura, nenhuma
escrita, nenhum seed**.

```bash
# (1) existe alguma linha da era do WebSocket?
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -c \
 "select count(*) from md.series
   where src_label_raw ilike '%stream%' or src_label_raw ilike '%forceorder%'
      or source ilike '%stream%';"
# → 0

# (2) o inventario inteiro, por serie
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c \
 "select src_label_raw, count(*),
         to_char(to_timestamp(min(ingested_at)/1000),'MM-DD HH24:MI'),
         to_char(to_timestamp(max(ingested_at)/1000),'MM-DD HH24:MI')
    from md.series group by 1;"
# → /fapi/v1/klines       |125156| escrito 09-11 01:40 -> 09-11 19:14
# → /fapi/v1/premiumIndex | 34592| escrito 09-08 18:40 -> 09-11 19:14

# (3) quanto da base e LEGIVEL ao as_of (available_at no proprio instante de grade)
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c \
 "select src_label_raw, count(*),
         count(*) filter (where available_at - bucket_end <= 60000),
         round(100.0*count(*) filter (where available_at - bucket_end <= 60000)/count(*),1)
    from md.series group by 1;"
# → klines       |125160|4116 | 3.3%
# → premiumIndex | 34592|34592|100.0%

# (4) o historico de runs — a era do WS deixou o que?
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c \
 "select endpoint, count(*), min(started_at), max(started_at),
         count(*) filter (where writer_accounted_at is null)
    from md.ingest_run group by 1 order by 2 desc;"
# → premiumIndex |4295| 09-08 -> 09-11 | 3247 nunca fechados
# → klines       |1030| 09-11 -> 09-11 |    1 nunca fechado
# → /stream?…forceOrder | 5 | 09-08 -> 09-11 | 5 nunca fechados

# (5) o dado e re-obtenivel? (REST publico, so leitura)
curl -s "https://fapi.binance.com/fapi/v1/premiumIndexKlines?symbol=BTCUSDT&interval=1m&startTime=1757289600000&limit=3"
# → devolve 1m de ~1 ano atras
curl -s "https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1d&startTime=1568000000000&limit=2"
# → devolve 2019-09-09
```

## 1 · A premissa da pergunta não se sustenta — e isso é a favor do owner

**Não há uma única linha da era do WebSocket em `md.series`** (`n=0`, comando `(1)`). O stream
aparece em `md.ingest_run` com **5 runs, os 5 nunca fechados**, e nenhum produziu linha.

⇒ **O "marco zero" que a pergunta propõe já aconteceu**, involuntariamente. Não existe passivo
pré-definições para limpar: o que a pergunta teme já não está lá.

E o resto da base é **novo, não histórico**: as 125.156 linhas de klines foram **escritas hoje**
(`ingested_at` 09-11 01:40→19:14, comando `(2)`). É um backfill de algumas horas, não acervo.

## 2 · O custo de limpar é ZERO em dado permanente — verificado, não presumido

Comando `(5)`: `klines` responde 2019 e `premiumIndexKlines` responde 1m de um ano atrás. **Toda
linha da base é re-obtenível do REST da Binance.** Os 842 MB de `data/` são de terceiro,
gitignored e catalogados em `data/MANIFEST.md` — não são a base e não estão em risco.

⚠️ **O que se perde é TEMPO de reingestão, não dado.** Isto é o que tira a limpeza da classe
"decisão de risco" e a põe na classe "decisão de quando".

## 3 · Por que limpar sozinho NÃO conserta nada

Comando `(3)`: **96,7% de klines é invisível ao leitor** (4.116 legíveis de 125.160). A causa é
`E1` — `available_at` é a hora da busca. **Limpar não toca nessa causa:** o próximo backfill
reproduz os mesmos 3,3% no dia seguinte, e o owner terá pago a limpeza para ter a mesma base
quebrada, só mais nova.

⇒ **Limpeza antes de `E1` é reset cosmético.** Limpeza depois de `E1` é marco zero de verdade.

## 4 · E o que isso muda no custo de `E1`, que é o motivo deste bloco existir

A opção 2 de `E1` (reconstruir `available_at` com `availability_source = MODELED`) foi orçada
**com 121.044 linhas legadas a migrar**. Com base limpa, essa metade do custo **deixa de existir**:
não há retrofit, não há duas classes de linha convivendo, não há janela em que o consumidor vê
`OBSERVED` e `MODELED` misturados sem saber por quê.

| | `E1` sobre a base atual | `E1` depois de `E6` |
|---|---|---|
| linhas a reescrever | **121.044** | 0 |
| classes de `availability_source` convivendo | 2 | 1 desde a 1ª linha |
| risco de migração parcial | real (falha no meio ⇒ base mista) | inexistente |
| custo que sobra | reingestão + código | **só código** |

## 5 · As opções

**Opção A — limpar agora, decidir `E1` depois.** ⛔ **Não recomendada.** Paga a reingestão e
reproduz os 3,3% em ~24 h. É o único caminho que gasta sem comprar nada.

**Opção B — decidir `E1` (+ as 8 órfãs), depois limpar e reingerir. ✅ RECOMENDADA.**
Sequência: `E1` → catálogo das 8 órfãs → `TRUNCATE` → reingestão com o carimbo certo desde a
primeira linha. **O que ela fecha:** a base passa a ter uma só proveniência e nenhuma linha
anterior às definições — e isso **não volta atrás**, porque reingerir de novo depois custa o
mesmo tempo outra vez.

**Opção C — não limpar; migrar `available_at` no lugar.** Mantém a base, paga os 121.044 de
retrofit. **Vantagem:** não há janela sem dado. **Desvantagem:** compra o risco de migração
parcial para preservar linhas que, medidas, ninguém consegue ler hoje (3,3%).

## 6 · A interação que o owner precisa ver antes de escolher

As **8 séries de `premiumIndex` são 100% legíveis** (comando `(3)`) **e são exatamente as 8
órfãs** que `handoff/ACHADO-CATALOGO-SEM-MARK-PRICE-E-FUNDING.md` escalou: nenhum catálogo as
serve. ⇒ **é o único dado perfeito da base, e ninguém consegue lê-lo.** Limpar sem decidir o
catálogo delas destrói dado legível para recriá-lo igualmente ilegível.

⇒ **`E6` opção B exige a decisão das 8 órfãs junto**, não depois. As duas são um ato só.

## 7 · Falsificador de `E6`

Se, depois de `E1` + reingestão, o comando `(3)` **não** subir de **3,3%** para perto de 100% em
klines, então a causa diagnosticada estava errada e `E1` não era o conserto — e a limpeza terá
sido gasto puro. **Rode o comando `(3)` antes e depois; ele é o mesmo número, medido igual.**
