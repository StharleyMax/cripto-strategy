# ADR-021 — `run_registry`: schema, captura de `bundle_hash`/`knowledge_time`, e por que `intrabar_decided_count` é campo separado

**Data:** 2026-09-04 · **Status:** proposto · **SPEC:** [`SPEC-001`](../specs/SPEC-001-plataforma-dados.md) §2.5, §3.5, §7
**Fase/Epic:** 08 · `CST-72` · **Componente alvo:** `backtest` (escreve) — decisão registrada em `docs`
**Requisito de origem:** `CA-F4-25`, falsificador global `F-4`, `DoD D8.9`
**Task:** `T-08.4` — depende de `T-04.4` (`as_of()`, done) e `T-08.1` (spike de motor, done — `ADR-002/D4`)

## Contexto — o que já estava decidido antes desta ADR, e o que faltava

`SPEC-001` §3.5 já fixa a TUPLA de `run_registry`, sem tipo:

```
run_registry ( run_id, bundle_hash, window, knowledge_time,
               partitions_content_hash, commit, created_at,
               intrabar_convention, intrabar_decided_count )
```

`ADR-002/D1` já decide ONDE: `run_registry` está na linha "catálogo, registro e instrumento" →
**PostgreSQL, a instância que já está de pé** (candidato 4, decidido pelo spike `T-08.1` em
`ADR-002` — emenda 2026-09-04). `ADR-002/D6` já decide a regra de `partitions_content_hash` ×
`compaction_epoch`. **Nenhuma dessas três coisas é reaberta aqui.**

O que faltava, e é o escopo desta ADR: **schema com tipo por coluna, o schema (namespace) SQL
que hospeda a tabela, o mecanismo de captura de `bundle_hash` e `knowledge_time` em tempo de
execução, e a semântica exata de `intrabar_decided_count`.** Isto é reprodutibilidade da
PLATAFORMA — nenhuma linha aqui decide regra de entrada, SL/TP, ou matriz de convergência
(`tasks.toml` `T-08.4.refs`: *"única task de backtest: reprodutibilidade é requisito da
plataforma, não do motor de estratégia"*).

## Decisão

### D1 · Schema SQL: `backtest.run_registry`, dentro da mesma instância de `ADR-002/D1`

`ADR-002` nomeia a mitigação ("schema próprio, usuário próprio") sem nomear o schema. Decido
aqui: **`backtest.run_registry`**, não `md.run_registry`.

- `md` (`md.ingest_run`, `md.ingest_gap`) é o schema de **auditoria de ingestão de F0**,
  escrito pelo escritor único de `sentimento` (`ADR-002/D1`, `SPEC-001` §3.5). `run_registry`
  não é ingestão — é o log de reprodutibilidade de uma EXECUÇÃO de `backtest`, e `SPEC-001`
  §4.1 já atribui `run_registry` como a única tabela que `backtest` **escreve**. Um schema por
  bounded context (`backtest.*`) torna a fronteira legível em `\dn`/`information_schema` sem
  precisar abrir código, e mantém `md.*` fechado ao que F0 já usa.
- **Não** reabro a divergência temporária de `ADR-014/D1` (SQLite durante F0 para
  `md.ingest_run`/`md.ingest_gap`): aquela emenda nomeia **duas** tabelas, explicitamente, e
  por esta altura (fase `08`) `ADR-002/D4` já está decidido — não há motivo para nascer
  `run_registry` em SQLite e herdar uma migração que `ADR-014` não cobre.

### D2 · Colunas e tipos — estendendo a tupla de `SPEC-001` §3.5 com tipo, e UMA coluna a mais

| coluna | tipo | por quê este tipo |
|---|---|---|
| `run_id` | `TEXT` (PK) | mesmo tipo de `ingest_record.py:run_id` (`str`) — nenhuma razão para introduzir `UUID` binário onde o resto do repositório já usa string opaca gerada pelo escritor |
| `bundle_hash` | `CHAR(64)` NOT NULL | sha256 hex — ver D3 |
| `window_from_ms`, `window_to_ms` | `BIGINT` NOT NULL cada | `window` decomposto em dois limites, **epoch ms UTC**, nunca `TIMESTAMPTZ`. Seguindo o contrato já escrito em `as_of_accessor.py:13-26`: "time arrives as a NUMBER; this module never asks what time it is" — `t` e `knowledge_time` são `int` para ficarem totalmente ordenáveis, sem parse, sem timezone. Um `TIMESTAMPTZ` aqui reintroduziria exatamente a ambiguidade que aquele módulo argumenta contra |
| `knowledge_time` | `BIGINT` NOT NULL | mesmo motivo — epoch ms, o "terceiro termo" de `reproduzir(run)`. Ver D4 para como é CAPTURADO, não só tipado |
| `partitions_content_hash` | `CHAR(64)` NOT NULL | sha256 hex, forma já decidida por `ADR-002/D6` — hash da lista ordenada `(partition_id, compaction_epoch, hash_de_conteúdo)` das partições tocadas pelo run |
| `commit` | `TEXT` NOT NULL | sha do commit do motor que produziu o run — `git rev-parse HEAD` no momento da execução, nunca uma versão de pacote solta |
| `created_at` | `TIMESTAMPTZ` NOT NULL DEFAULT `now()` | **auditoria, nunca caminho de decisão** — é o único carimbo desta tabela que pode ser relógio de parede, porque nada relê `created_at` para decidir o quê o run leu |
| `intrabar_convention` | `TEXT` NOT NULL, `CHECK IN (...)` | enum textual (não inteiro) — mesma escolha já feita para `availability_source`/`Procedencia` em `SPEC-001` §3.1/§2.2: quem olhar a linha em `psql` lê a palavra, não um código. Hoje um único membro existe: `pessimistic_stop_first` (`docs/decisoes-do-owner.md:367`) |
| `intrabar_decided_count` | `INTEGER` NOT NULL, `CHECK >= 0` | ver D5 |
| `principal_id` | `TEXT` NOT NULL | **não é invenção desta ADR** — `SPEC-001` §4.4, literal: *"`principal_id` é coluna em toda linha que registre ato humano (`<Anotacao>`, `run_registry`, edição de bundle)"*. `SPEC-001` §3.5 esqueceu de listá-la na tupla; §4.4 já a exige nominalmente para esta tabela exata |

**O que fica de fora, com o motivo dito em voz alta:** `env` (`SPEC-001` §3.7) não entra como
coluna própria. Nenhum documento nomeia `run_registry` como superfície de `env` do jeito que
§4.4 nomeia `principal_id`, e inventar a coluna aqui seria decisão de escopo não pedida por
nenhuma fonte — fica **opinião, rotulada**: se um backtest algum dia puder ler dado de
`testnet`/`demo` misturado com `mainnet` no mesmo bundle, `env` devia amarrar-se ao `bundle_hash`
(através da própria definição da série lida), não a uma coluna solta em `run_registry` que
ninguém teria como validar contra o que o motor realmente leu. **Dono: quem definir a forma do
bundle de estratégia — fora do escopo desta task.**

### D3 · `bundle_hash` é OPACO para `run_registry` — a forma do bundle não é decidida aqui

`run_registry` **não define o que é "o bundle"**. Isto é deliberado: a forma do bundle de uma
estratégia de backtest (universo, `ThresholdSpec`, `fee_schedule`, `cvd_anchor`, `price_source`
por uso, ...) é motor de estratégia — fora do escopo desta task por `refs` do próprio
`tasks.toml`, e "gerenciador de presets é produto prematuro" (`SPEC-001` §7) argumenta na mesma
direção: não fixar forma antes de haver consumidor.

**O que esta ADR fixa é o CONTRATO de quem produz `bundle_hash`, não a forma:**

1. `bundle_hash = sha256(canonical_json(bundle)).hexdigest()` — reusa
   `src.modules.sentimento.domain.canonical_json` (já existe, já é o serializador único de
   `SPEC-001` §3.8: sem locale, ordem de chave estável). `backtest` importar de `sentimento`
   **é a direção permitida** pelo contrato de `import-linter` (`backend/pyproject.toml`, "Fronteira
   de contexto": a lista `forbidden` bloqueia `sentimento → {charts, convergencia, backtest}`,
   nunca o inverso — e `SPEC-001` §4.1 já declara que `backtest` **lê** `as_of`, que mora em
   `sentimento.domain`). Reimplementar um segundo serializador canônico em `backtest` seria o
   mesmo modo de falha que `SPEC-001` §7 nomeia para a grade: **duas implementações discordando
   é o defeito**, não a exceção.
2. O precedente do lado TypeScript já existe e é o modelo a seguir:
   `frontend/src/app/threshold-spec-bundle.ts:369` (`bundleHash`) hasheia a **string canônica**
   (não um `JSON.stringify` ad hoc) exatamente para que dois bundles que produzem a mesma URL
   produzam o mesmo hash. O lado Python de `backtest` segue a mesma disciplina.
3. `run_registry.bundle_hash` é **CHAR(64)**, e a tabela nunca valida a forma por dentro — ela
   confia na disciplina de (1)+(2) do mesmo jeito que `ADR-019/D3` confia que `fingerprint()` é
   sempre recomputado pelo consumidor, nunca aceito de terceiro sem recomputar.

**Consequência prática:** quando a task que definir o bundle de estratégia existir, ela
implementa `bundle_hash(bundle) -> str` em `backend/src/modules/backtest/domain/`, sobre
`canonical_json`, e `run_registry` não muda uma linha.

### D4 · `knowledge_time` é um FATO ALCANÇADO pelo run, nunca um relógio confiado

`SPEC-001` §2.5: `knowledge_time = o observed_at MÁXIMO admitido pela leitura`. Isto não é
"a hora em que o run rodou" — é uma propriedade dos DADOS que o run efetivamente leu. Dois modos:

- **`AO VIVO`** (sem `knowledgeTime` pinado — `LiveBundle` no lado web): o motor NÃO pede a hora
  ao relógio para gravar em `run_registry`. Ele computa `knowledge_time` **depois** do run
  terminar, como `max(observed_at)` sobre todo `as_of()` efetivamente consultado durante a
  execução. Isto resolve o problema que o próprio `as_of_accessor.py:23-26` nomeia — *"a
  function that reads now() is not reproducible by construction"* — sem tocar relógio: o
  ACHIEVED bound é reproduzível porque é derivado do dado, não do instante do processo.
- **`COMO EM T`** (`AsOfBundle.knowledgeTime` pinado): o chamador informa `knowledge_time` antes
  de rodar. O escritor grava esse valor E confere a invariante `max(observed_at) lido) <=
  knowledge_time pinado` — se a leitura real ultrapassar o teto pedido, isso é bug de `as_of()`,
  não estado válido para `run_registry`.

**A reprodução de `D8.9` funciona porque "rodar de novo com o mesmo bundle" fixa os TRÊS termos,
inclusive `knowledge_time`:** reproduzir não é "rodar `AO VIVO` duas vezes" (isso produz duas
linhas com `knowledge_time` diferente por construção, nunca uma colisão silenciosa — dado novo
sob o mesmo `bundle_hash`+`window` sempre grava um `knowledge_time` novo, então o `F-4`
"mesmo hash devolvendo número diferente" nunca se aplica a duas execuções `AO VIVO`
distintas). Reproduzir é pedir explicitamente a MESMA tripla `(bundle_hash, window,
knowledge_time)` de uma linha já gravada — o que converte o replay em um run `COMO EM T` pinado
no valor antigo. Sob append-only, ler com o mesmo `knowledge_time` e a mesma `window` tem de
devolver o mesmo `partitions_content_hash`; se não devolver, o motor **RECUSA antes de publicar
número**, citando qual `partitions_content_hash` divergiu — e a primeira pergunta que a recusa
resolve, usando `ADR-002/D6`, é se a divergência é `compaction_epoch` (legítima, mesmo
`knowledge_time`) ou dado realmente diferente sob a mesma tripla (nunca deveria acontecer em um
store append-only; se acontecer, é corrupção e a recusa é a resposta certa).

### D5 · `intrabar_convention` e `intrabar_decided_count` são dois campos porque respondem duas perguntas diferentes

Origem, citada com número: `docs/decisoes-do-owner.md:367-373`. Desempate SL-vs-TP dentro da
mesma barra: medido em 768 barras de 15m/8 dias, **756/768 = 98,44%** resolvem sem ambiguidade
(high e low em barras de 1m diferentes); o resíduo **12/768 = 1,56%** (fração de BARRAS, não de
TRADES — a fração de trades é `[NÃO MEDIDO]`, porque um trade só é ambíguo se o stop **e** o
alvo foram tocados na mesma barra) recebe convenção **pessimista**: assume-se o stop primeiro.

- `intrabar_convention` (`TEXT`, enum) é **método** — fixo por versão do motor, não varia entre
  trades de um mesmo run. Responde "qual regra foi aplicada".
- `intrabar_decided_count` (`INTEGER`) é **medida** — quantos trades DESTE run tiveram o
  desfecho decidido pela convenção porque stop e alvo caíram na mesma barra. Responde "quanto
  isso pesou neste resultado específico".

**Por que os dois são campos separados, e não um só:** gravar só a convenção deixa a
influência dela **embutida, não medível** — dois runs com a mesma convenção podem ter 0% ou 40%
dos trades afetados, e o número publicado (PnL, win rate) não distingue os dois casos.
`docs/decisoes-do-owner.md:373`, literal: *"numa estratégia de borda fina, 1,56% de barras
sistematicamente pessimistas pode virar um resultado marginalmente lucrativo em prejuízo, e não
haveria como saber se o culpado é a estratégia ou a convenção"*. Gravar só a contagem sem a
convenção perde a DIREÇÃO do viés (pessimista sempre enviesa para baixo; se a convenção mudar
um dia, o mesmo número de trades afetados poderia enviesar para cima). As duas colunas juntas
tornam a pergunta "quanto do resultado é convenção, quanto é estratégia" respondível por quem lê
a linha, sem reabrir o motor.

## Falsificadores

| # | observação que derruba | o que ela derruba |
|---|---|---|
| **G1** = `F-4`/`D8.9` | o mesmo `(bundle_hash, window, knowledge_time)` devolvendo `partitions_content_hash` diferente sem o motor recusar | `D4` inteira — a garantia de reprodutibilidade que esta ADR existe para fechar |
| **G2** | uma compactação (mesma `knowledge_time`, `compaction_epoch` incrementado) sendo tratada como dado novo e disparando recusa indevida | `D4`, na direção oposta — falso positivo de recusa é tão defeito quanto falso silêncio |
| **G3** | dois valores de `bundle_hash` diferentes para o MESMO bundle (mesmos bytes lógicos, ordem de campo diferente) | `D3` — o serializador canônico não está sendo reusado, ou não é determinístico |
| **G4** | `intrabar_decided_count > 0` num run cujo `intrabar_convention` está `NULL` (ou vice-versa: convenção gravada, contagem ausente) | `D5` — as duas colunas são um par, nunca uma sem a outra |
| **G5** | uma linha de `run_registry` sem `principal_id` | `D2` — a coluna existe porque `SPEC-001` §4.4 a exige nominalmente, não é opcional |

## Consequência para quem implementar

- `backend/src/modules/backtest/` nasce nesta task ou na que primeiro escrever código de
  produção deste componente — e nesse momento `backend/pyproject.toml`
  `[tool.importlinter] containers` (hoje só `src.modules.sentimento`) ganha a linha
  `src.modules.backtest`, senão o contrato de camadas `infra > use_cases > domain` não é
  aplicado dentro dele (mesma observação que `ADR-011/D3a` já fez para `sentimento`).
- Migração SQL do schema `backtest` e da tabela `run_registry` é trabalho de `/build`, não
  desta ADR — esta ADR fixa colunas, tipos e a regra de captura; não escreve DDL.

## ✅ Emenda 2026-09-04 — `D3` corrigida: `bundle_hash` precisa ser independente de ORDEM DE CAMPO, não só reusar `canonical_json`

`D3` (item 1) dizia "reusa `canonical_json`" e (item 2) apontava o precedente TypeScript
(`bundleHash` sobre `encodeBundle()`, que itera um `PARAM_ORDER` fixo) sem nomear
explicitamente que a PROPRIEDADE que importa replicar do precedente é independência de ordem
de campo, não só "usar o mesmo serializador". A implementação de `T-08.4` leu o item 1 ao pé
da letra — `bundle_hash(bundle) = sha256(canonical_json(bundle))`, sem pré-processamento — e
`canonical_json` não ordena chaves por design (`sort_keys=False`, correto para os OUTROS
call-sites dela em `sentimento`, onde ordem de inserção É ordem de coluna de contrato). O
resultado: `bundle_hash({"a":1,"b":2}) != bundle_hash({"b":2,"a":1})` — o cenário que a
própria linha **G3** desta tabela nomeia como falsificador de `D3`. QA achou isto por teste
formal (`backend/tests/backtest/test_bundle_hash_determinism_qa.py`), depois de uma rodada
anterior do builder já ter reproduzido o sintoma em
`test_bundle_hash.py::test_field_order_changes_the_hash` e o ter rotulado, em comentário,
"não é defeito" — sem emendar esta ADR. Essa reclassificação estava errada: G3 é literal.

**Correção, sem reabrir a decisão de reusar `canonical_json`:** `bundle_hash` agora
pré-processa `bundle` com `_canonicalize_dict` (`backend/src/modules/backtest/domain/
bundle_hash.py`) — reconstrói recursivamente todo dict com as chaves ordenadas por valor de
string — ANTES de chamar `canonical_json`. É o equivalente desta função ao `PARAM_ORDER` fixo
de `threshold-spec-bundle.ts:369`, generalizado para uma forma de bundle ainda não decidida
(D3 continua sem fixar a forma): como não há um schema para declarar "a" ordem certa,
ordenação por chave é o substituto estável e livre de schema. Ordem de LISTA não é tocada —
lista é dado (ex.: `universe`), não ordem de campo, e `test_list_element_order_still_changes_
the_hash` prova que a correção não apagou essa distinção.

`canonical_json` (em `sentimento.domain`) **não muda** — os call-sites que dependem de ordem
de inserção como contrato (`ingest_record.py` e afins) continuam corretos como estão; a
correção é local a `backtest.domain.bundle_hash`, a única chamadora que recebe um dict de
forma não fixada.

G3 está fechada por teste que a PROVA sob reordenação de topo E aninhada
(`test_field_order_does_not_change_the_hash`,
`test_nested_dict_field_order_does_not_change_the_hash`), reexecutando também o teste
originalmente vermelho de QA (`test_bundle_hash_determinism_qa.py`) — agora verde.
