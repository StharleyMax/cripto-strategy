# ADR-014 — O motor de F0, a enumeração de `verdict`, e a testemunha de integridade POR FONTE

**Data:** 2026-08-29 · **Status:** proposto · **SPEC:** [`SPEC-001`](../specs/SPEC-001-plataforma-dados.md) §3.5, §5.2, §5.6, §5.7, §5.8
**Fase/Epic:** F0 · `CST-2` · **Componente alvo:** `sentimento` (o que executa) / `docs` (a decisão)
**Origem:** três perguntas levantadas por dois builders da fase `02` — `T-02.3` (PR #17, `task/T-02.3-ingest-run-e-gap`) e `T-02.4a` (PR #16, `task/T-02.4a-checksum-na-borda`). **Nenhum dos dois inventou premissa: os dois pararam e nomearam a pergunta.**

**Fecha três perguntas e abre quatro achados. Um dos achados derruba uma inferência da própria `SPEC-001`, e ele está MEDIDO.**

| # | pergunta que chegou | decisão |
|---|---|---|
| 1 | F0 persiste `md.ingest_run`/`md.ingest_gap` em SQLite até o spike, ou espera o Postgres? | **`D1`** — SQLite fica, **por outro argumento**, com escopo travado por contrato e três gatilhos nomeados |
| 2 | Quem é dono da enumeração de `verdict`, e qual é ela? | **`D2`** — a SPEC é dona; a enumeração é de **TRÊS** membros, com **predicado escrito** e **invariante falsificável por `SQL`** |
| 3 | Quais fontes são obrigadas a carregar `.CHECKSUM`? | **`D3`** — **nenhuma é dispensada de testemunha; o que varia é QUAL.** E o `.CHECKSUM` **não pega** o caso que o motivou |

---

## O achado que reordena a pergunta 3 — e ele é medição, não leitura

`SPEC-001` §5.8 escreve, e o plano `02`/`D2.8` repete, que o caso do `monthly/bookTicker` de 2024-04 (`200` com 37,7 MB contra 6,7 GB do mês anterior) é a razão de **`.CHECKSUM` ser obrigatório na ingestão**. A frase literal é *"daí `G1` (verificação de `.CHECKSUM`) ser obrigatória na ingestão"*.

**Baixei o objeto e conferi contra o `.CHECKSUM` que a própria Binance publica ao lado dele. Ele confere.**

```
$ curl -sS 'https://data.binance.vision/data/futures/um/monthly/bookTicker/BTCUSDT/BTCUSDT-bookTicker-2024-04.zip.CHECKSUM'
7403cdf0b48f7c3dea1e3c3bdcf035e94b8cc9ac9578d1ff6e6ee11da3ee215d  BTCUSDT-bookTicker-2024-04.zip

$ curl -sS -o BTCUSDT-bookTicker-2024-04.zip 'https://data.binance.vision/.../BTCUSDT-bookTicker-2024-04.zip'
$ ls -l BTCUSDT-bookTicker-2024-04.zip      # 37761761 B
$ sha256sum -c cksum-2024-04.txt
BTCUSDT-bookTicker-2024-04.zip: SUCESSO      # rc=0
$ unzip -t BTCUSDT-bookTicker-2024-04.zip
No errors detected in compressed data.       # rc=0
```

`[MEDIDO 2026-08-29, n = 1 objeto, 37.761.761 B baixados de fato e hasheados nesta máquina]`

E o que há dentro dele:

| o que | valor | `[força]` |
|---|---|---|
| CSV descompactado | **303.835.669 B**, `wc -l` = **3.223.965** linhas (inclui cabeçalho) | `[MEDIDO]` |
| primeiro `event_time` | **2024-04-01T00:00:00.012Z** | `[MEDIDO]` |
| último `event_time` | **2024-04-01T06:46:50.142Z** | `[MEDIDO]` |
| janela coberta | **6,781 h** de **720 h** ⇒ **0,942 % do mês declarado** | `[MEDIDO]` |
| déficit | **713,219 h** de abril de 2024 que o arquivo diz conter e não contém | `[MEDIDO]` |

**Cinco portões passam sobre um arquivo que é 0,942 % do que o nome dele declara:**

| portão | veredito sobre o objeto de 2024-04 |
|---|---|
| `HTTP 200` | **passa** |
| `content-length` (37.761.761) × bytes recebidos | **passa** |
| **`.CHECKSUM` publicado pela Binance** | **passa** — `sha256sum -c` → `rc=0` |
| integridade estrutural do zip (`unzip -t`) | **passa** |
| invariante de janela de `SPEC-001` §5.7 (*"nenhum timestamp gravado fora da janela requisitada"*) | **passa** — todos os timestamps **estão** dentro de abril |

**Só uma coisa morde: a cobertura da janela declarada.** E ela não é nenhum dos cinco.

**Por que era previsível, e é o que generaliza:** existem **duas classes de falha**, e toda testemunha só serve a uma.

| classe | o que aconteceu | quem testemunha |
|---|---|---|
| **T · transporte** | os bytes se perderam **entre o publicador e nós** | qualquer digest ou comprimento **computado pelo publicador**: `.CHECKSUM`, `content-length`, diretório central do zip, gramática do JSON |
| **O · origem** | **o objeto do publicador já é curto** | **nenhuma testemunha de classe T** — todas são computadas **sobre o mesmo objeto curto**, então todas concordam entre si e todas estão erradas juntas |

**`.CHECKSUM` é testemunha de classe T. O caso que a `SPEC` usa para justificá-lo é de classe O.** A conclusão (`.CHECKSUM` obrigatório) continua **certa**; a **premissa que a sustenta no documento é um non sequitur**, e quem a lê conclui que a borda de `T-02.4a` cobre o caso do `bookTicker`. **Ela não cobre.** É a família *"método de busca que não vê o que afirma ver"* — desta vez dentro de um documento de contrato, não de um instrumento.

**E o caso não é corrupção: é descontinuação do dataset no meio do mês.**

```
$ for SYM in BTCUSDT ETHUSDT SOLUSDT; do for M in 2024-03 2024-04 2024-05; do curl -sSI ".../$SYM-bookTicker-$M.zip"; done; done
BTCUSDT 2024-03 200 6712517585 | 2024-04 200   37761761 | 2024-05 404
ETHUSDT 2024-03 200 5384737931 | 2024-04 200   31343866 | 2024-05 404
SOLUSDT 2024-03 200 3952724227 | 2024-04 200   24390426 | 2024-05 404
```

`[MEDIDO 2026-08-29, n = 3 símbolos × 3 meses = 9 requisições `HEAD`]`

⇒ **o `curl -sI` mensal que `SPEC-001` §5.8 já manda fazer pega o `404` de maio e NÃO pega o abril parcial** — e abril parcial é o mês em que os dados existem pela metade, que é o que envenena a série. **O último mês antes de um `404` é sistematicamente suspeito**, e essa é a regra que faltava.

**Cuidado com a testemunha fácil, e eu a medi antes de recusá-la:** a razão de tamanho contra o mês vizinho é **177,8×**, enquanto o déficit temporal real é **106,2×** (720/6,781). ⇒ **razão de tamanho dá ordem de grandeza e NÃO dá o número** — compressão e atividade de mercado variam entre meses. Serve de alarme; **não serve de `n_missing`.**

---

## `D1` · O motor de `md.ingest_run`/`md.ingest_gap` em F0 é SQLite — e o argumento não é o que chegou

### D1a · O veredito

**F0 persiste em SQLite. Não espera o Postgres.**

### D1b · Mas a justificativa que veio na PR não sustenta a decisão, e isso é achado `A3`

O builder escreveu, no cabeçalho de `sqlite_ingest_record_store.py`, que `ADR-002` *"está com status `proposto` e tem o finalista de motor **PENDENTE DE SPIKE (`D4`)**"*. **`D4` não é o parágrafo que decide esta tabela.**

| parágrafo de `ADR-002` | o que ele decide | está pendente? |
|---|---|---|
| **`D1`** | **catálogo, registro e instrumento — incluindo `md.ingest_run` e `md.ingest_gap` — no `postgres:15` que já está de pé** | **NÃO.** `D1` é decidido, com argumento (OLTP, SCD-2, FK, zero container novo) |
| `D4` | o **finalista da SÉRIE DE MERCADO**: candidato 4 (TimescaleDB) × candidato 5 (Parquet/R2 + DuckDB) | **sim**, e é `T-08.1` |

E o universo declarado do spike confirma: *"as 8.637 linhas de `metrics` de BTCUSDT + 1 dia de `aggTrades`"* — **série**, não registro. `T-08.1` é `components = ["docs"]`, `refs = ["ADR-002/D4", …]`, e enumera como finalistas *"(4) TimescaleDB no `postgres:15` já de pé × (5) Parquet no R2 + DuckDB `httpfs`"* `[MEDIDO: `grep -A12 '^id = "T-08.1"' docs/context/plataforma-dados/tasks.toml`]`. **SQLite não é candidato em nenhuma das duas listas.**

⇒ *"o finalista está pendente de spike"* **não licencia SQLite para o registro.** O que licencia é outra coisa, e é `D1c`.

### D1c · O argumento que de fato sustenta, e ele tem precedente escrito neste repositório

**Três razões, em ordem de peso:**

1. **O registro é, ele próprio, capture-or-lose — e esperar o Postgres é rodar F0 sem registro.** `md.ingest_run` carrega `clock_skew_ms`, `observer_id` e `observer_region`. `SPEC-001` §5.9 é explícita: *"`clock_skew_tolerance_ms` NÃO é medível antes de o coletor rodar ⇒ **F0 persiste o skew observado por `ingest_run`**; F3 CALIBRA a tolerância"*. E `observer_region` é *"coluna de F0, impossível retroativamente"* (`ADR-002`). **Adiar o registro para depois do Postgres não adia o registro: perde a distribuição de skew da qual F3 depende, e perde a região das linhas do go-forward.** Este argumento não foi feito por ninguém até aqui, e é o que decide.

2. **O gate de F0 é declarado POR COLETOR, e exigir Postgres reintroduz um gate de host que R1 removeu de propósito.** É literalmente o argumento de `ADR-008/D1` para manter `web` fora de F0: *"colocar `web` em F0 reintroduz um gate de fase que R1 removeu de propósito"*. Exigir daemon para o registro faz o mesmo pela outra porta. O plano `02` existe separado do `03` exatamente por isso.

3. **O custo do daemon hoje é uma dependência que o repositório não tem.** `[MEDIDO 2026-08-29: `grep -n '^dependencies' backend/pyproject.toml` → `dependencies = []`, linha 49]`. `sqlite3` é `stdlib`; qualquer driver de Postgres é a **primeira** dependência de runtime do backend, numa suíte declarada offline.

### D1d · O que impede a escolha provisória de virar permanente — e não é boa intenção

**A inércia não é perigosa por a escolha existir; é perigosa por o custo de trocá-la crescer.** Então a decisão trava o custo, em vez de confiar na memória de alguém.

**O contrato: o motor não sai de `infra`, e isso é verificado por ferramenta que já roda no `pre-push`.** `import-linter 2.14` já está instalado e já avalia dois contratos (`ADR-011/D3a`, `T-01.5`). O terceiro contrato é este:

```toml
[tool.importlinter]
root_package = "src"
include_external_packages = true          # ← necessário: os módulos proibidos são externos a `src`

[[tool.importlinter.contracts]]
name = "O motor de armazenamento nao vaza para fora de infra (ADR-014/D1)"
type = "forbidden"
source_modules = ["src.modules.sentimento.domain", "src.modules.sentimento.use_cases"]
forbidden_modules = ["sqlite3", "psycopg", "psycopg2", "asyncpg", "duckdb", "sqlalchemy"]
```

**Rodado nas duas metades antes de esta decisão ser escrita** — cópia da árvore em scratchpad com o `src/` das DUAS branches (`T-02.3` + `T-02.4a`), `backend/` **intocado**:

| metade | comando | resultado | `[força]` |
|---|---|---|---|
| **cala** | `lint-imports --config pyproject.toml` | `rc=0` · `Analyzed 30 files, 54 dependencies` · **3 kept, 0 broken** | `[MEDIDO, n = 17 arquivos `.py`]` |
| **morde** | mesmo comando, com `import sqlite3` plantado em `use_cases/ingest_health.py` | `rc=1` · *"`src.modules.sentimento.use_cases` is not allowed to import `sqlite3`: `…ingest_health -> sqlite3 (l.6)`"* | `[MEDIDO, 1 mutante]` |
| **reverte** | mutante revertido, `sha256sum` do arquivo reconferido | `rc=0` | `[MEDIDO]` |
| **linha de base** | os 2 contratos de hoje, sem o flag e sem o contrato novo | `rc=0` · `Analyzed 17 files, 6 dependencies` · 2 kept | `[MEDIDO]` |

**Custo medido do flag:** `0,32 s` → `0,33 s` de relógio, e os dois contratos existentes continuam `KEPT` — o flag alarga o grafo (**17 → 30** nós, **6 → 54** arestas) sem mudar o veredito deles. **`[NÃO MEDIDO]`: o custo desse alargamento numa árvore de tamanho F5.** n=17 é pequeno demais para extrapolar, e quem adotar mede de novo.

**Por que ISTO e não uma `[[rules.own]]`:** o repositório declara **zero** `[[rules.own]]` hoje e a política é que *"toda `[[rules.own]]` que esta fase declarar nasce com corpus"* (`harness.toml`, item 1.8). O `import-linter` já está no `make`, já morde no `pre-push`, e a propriedade é **exatamente** a que ele existe para expressar. `ADR-012/D4` manda o portão para onde ele alcança; aqui ele alcança.

> **O que este contrato NÃO faz, dito antes que alguém o cite errado:** ele não afirma que a troca custa um arquivo. Ele afirma que `domain` e `use_cases` não conhecem o motor — que é a **condição** de a troca custar um arquivo, não a prova. **A verificação da afirmação do builder é do `/review`, e esta ADR assume que ela virá.** O contrato torna a propriedade **permanente**, que é outra coisa e é a que interessa aqui.

### D1e · Os três gatilhos, cada um com o comando que os observa

| # | disparador | comando que o observa | dono | por que É o momento |
|---|---|---|---|---|
| **G-A** | uma dependência de Postgres entra no backend | `grep -nE 'psycopg\|asyncpg\|sqlalchemy' backend/pyproject.toml` devolve linha | quem abrir a PR que a introduz | o custo do adaptador caiu a ~zero ⇒ manter SQLite passa a ser **escolha**, não restrição, e escolha precisa de argumento novo |
| **G-B** | um **segundo processo** passa a ler o registro | `T-07.13` (S1 lê pela `ingest_health_query`) sai de `todo` | owner / loop de coordenação | arquivo local deixa de ser endereçável por dois processos ou dois hosts. **É a data mais concreta que existe, e `T-07.13` já `depends_on = ["T-02.3"]`** |
| **G-C** | `T-08.1` entra em pauta | status da task sai de `blocked` | owner | **é a única mesa de motor que existe neste plano** — e ela **não cobre `D1`** (ver `A4`) |

### D1f · `A4` — o achado que ninguém perguntou: a escolha de F0 contamina `T-08.1`?

**Não contamina os critérios declarados de `T-08.1`** — universo diferente (série `metrics`/`aggTrades`), candidatos diferentes (4 × 5), e SQLite não é nenhum deles. Os cinco critérios de `ADR-002/D4` (espaço, leitura de backtest, `as_of` correto, vizinhança, rede) **medem coisas que o registro de F0 não toca**. O spike continua neutro para a pergunta que ele faz.

**E esse "não" é a má notícia, não a boa.**

> Se `T-08.1` não decide `D1`, então a divergência entre o que roda (SQLite) e o que `ADR-002/D1` decide (Postgres) **não tem foro marcado em lugar nenhum do plano de 9 fases.** Ela não expira, não aparece em DoD, e não tem task. **É dívida órfã por construção** — e este repositório já teve dívida órfã, e a cura foi sempre nomear dono e falsificador.

⇒ `G-C` existe justamente para isso: **se `D1` não entrar na pauta de `T-08.1`, ele não entra em pauta nenhuma.** A emenda `E-4` (abaixo) põe a linha em `T-08.1`, e o dono dela é o owner, porque `tasks.toml` não é editável por agente.

---

## `D2` · A enumeração de `verdict` tem TRÊS membros, a SPEC é dona, e a fronteira é um `JOIN`

### D2a · Dono

**A enumeração é contrato publicado de `SPEC-001` §3.5**, e mudá-la é emenda de SPEC — cujo gate é do **owner**. Não é decisão de builder, e não é decisão minha: eu **proponho o texto** (`E-1`), ele ratifica.

**O motivo não é hierarquia, é `ADR-008/DoD-3`.** Aquele DoD constrói o teste que expõe duplicação silenciosa a partir de *"um `verdict` inédito"*. Se um valor de `verdict` pode nascer por inferência de builder, **o conceito de "inédito" deixa de ter fronteira** e o DoD perde o referencial contra o qual mede. A enumeração precisa de um lugar único e citável — e ele é a SPEC.

**O rótulo `[INFERRED]` que o builder pôs no código está CERTO e fica até a ratificação.** Ele fez exatamente o que este repositório pede: adotou o mínimo necessário, marcou a força da afirmação, e nomeou a pergunta em vez de fechá-la. E a separação que ele escreveu — `VERDICTS_SPELLED_IN_THE_SPEC` como tupla, `KNOWN_VERDICTS` como o `frozenset` que acrescenta o terceiro — é **a forma correta** de carregar a diferença entre medido e inferido dentro do código, e ela deve sobreviver à ratificação em vez de ser fundida numa constante só.

### D2b · A enumeração, e o argumento de que ela é de três e não de dois

`ACCEPTED` existe. **Sem ele a função `run → verdict` é parcial**, e uma coluna `NOT NULL` de uma função parcial é preenchida por acidente — o que é pior que estar vazia. O argumento do builder está certo; o que faltava era a **fronteira escrita**, porque `ACCEPTED_WITH_WARNING` é o valor que `SPEC-001` §5.6 e `T-07.2` usam para *"entrou, com ressalva"*, e sem predicado a escolha entre os dois vira gosto do chamador.

```
ressalva(run_id)  :=  ∃ linha em md.ingest_gap com esse run_id

REJECTED               :=  a borda RECUSOU o lote
ACCEPTED_WITH_WARNING  :=  a borda ACEITOU o lote  ∧    ressalva(run_id)
ACCEPTED               :=  a borda ACEITOU o lote  ∧  ¬ ressalva(run_id)
```

**As definições acima seriam circulares sozinhas.** O que as torna falsificáveis são as invariantes, e todas as cinco são conferíveis por `SQL` sobre as duas tabelas — **nenhuma delas depende de ler o código que escreveu a linha:**

| # | invariante | derruba |
|---|---|---|
| **I-1** | `verdict = 'REJECTED'` ⟹ `n_written = 0` | `CA-F3-1` já exige; agora é invariante permanente e não um caso |
| **I-2** | `verdict = 'ACCEPTED'` ⟹ `count(md.ingest_gap WHERE run_id = este) = 0` | **é ESTA que tira a distinção do gosto do chamador** |
| **I-3** | `verdict = 'ACCEPTED_WITH_WARNING'` ⟹ `count(md.ingest_gap WHERE run_id = este) >= 1` | idem, do outro lado |
| **I-4** | nenhuma linha de `md.ingest_gap` é órfã: todo `run_id` dela existe em `md.ingest_run` | a ressalva sem execução, que é ressalva de ninguém |
| **I-5** | todo `run_id` de `md.ingest_run` tem **exatamente um** `verdict`, e ele está na enumeração | a função total, que é o que `ACCEPTED` existe para completar |

**`I-2` e `I-3` juntas dizem: `ACCEPTED_WITH_WARNING` NÃO é um adjetivo — é a projeção de um `JOIN`.** Quem escreve `ACCEPTED` tendo gravado gap reprova; quem escreve `ACCEPTED_WITH_WARNING` sem gap reprova. **É o falsificador da fronteira, e ele é uma consulta.**

### D2c · O buraco de schema que isso expõe — e é achado `A5`

**`I-2`, `I-3` e `I-4` não são computáveis hoje.** `SPEC-001` §3.5 declara

```
md.ingest_gap ( source, symbol, series_key_id, from_ts, to_ts, n_missing, class, detected_at )
```

— **e não há `run_id`.** A ressalva não sabe de qual execução ela é. ⇒ o predicado que tira a distinção do gosto do chamador **exige** a emenda `E-2`: `run_id` entra em `md.ingest_gap`. É uma coluna, e sem ela `D2b` é prosa.

### D2d · `ACCEPTED` e quarentena são a mesma coisa? **Não. São dois eixos, e o plano já prova isso.**

| eixo | granularidade | pergunta que responde | onde vive |
|---|---|---|---|
| **`verdict`** | **uma EXECUÇÃO** (`run_id`) | *este lote entrou, e com que ressalva?* | `md.ingest_run` |
| **quarentena** | **uma SÉRIE** (`SeriesKey`) | *esta série pode ser lida por caminho de decisão?* | `series_catalog`, predicado de três termos (§5.2) |

**A prova está escrita no plano `02` e não precisa de mim:** `D2.6` manda o one-shot da Coinalyze **nascer em quarentena** e exige que a leitura de `backtest` devolva **ZERO linhas** — enquanto a ingestão em si **funcionou**, gravou em disco, e não foi recusada. ⇒ **execução aceita, série em quarentena, simultaneamente.** Se fossem um eixo só, `D2.6` seria contraditório.

E o outro lado: `T-07.2`/`D7.2` manda o dump de `MATICUSDT` gravar com `ACCEPTED_WITH_WARNING` numa série que **não** está em quarentena — os três termos (`label_shift`, `unit`, `available_at`) estão preenchidos. **Execução com ressalva, série limpa.**

⇒ **os quatro quadrantes existem, e nenhum é vazio.** Colapsar os eixos faria a Coinalyze sair da gaveta pelo motivo errado — que é exatamente o defeito que §5.2 registra como *"um mecanismo de três termos que se abre quando dois passam não é um mecanismo de três termos"*.

### D2e · O que fica ABERTO, com dono

`SPEC-001` §5.5 manda *"campo ADITIVO desconhecido → quarentena + alarme"*. **Isso é uma ressalva que NÃO é uma ausência**, e `md.ingest_gap.class` tira valores da enumeração `Ausencia = SEM_PONTO | NAO_LIDO | QUARENTENA | SEM_FONTE`. ⇒ um campo aditivo desconhecido produziria `ACCEPTED_WITH_WARNING` **cuja ressalva não tem onde morar**, e `I-3` reprovaria por falta de tabela, não por defeito.

**Não decido isto, e digo por quê:** as duas saídas baratas são (a) uma tabela `md.ingest_warning ( run_id, kind, detail, detected_at )` da qual `md.ingest_gap` passa a ser a especialização de ausência, ou (b) estender a taxonomia de `class`. **O que decide entre as duas é quantas espécies de ressalva-não-ausência existem de fato, e isso é `[NÃO MEDIDO]` até F3 rodar.** Escolher agora é inventar o esquema geral a partir de um caso.

**Dono:** o `/architect` da fase que primeiro encontrar o segundo caso — hoje o candidato é `T-03.x` (schema de fonte ao vivo). **Enquanto houver exatamente UM caso conhecido, `md.ingest_gap` é a única materialização de ressalva, `I-2`/`I-3` valem como bicondicional, e este parágrafo é a data de validade dessa afirmação.**

---

## `D3` · Testemunha de integridade POR FONTE — e a inversão que salva o tráfego legítimo

### D3a · A regra que decide, e ela não é sobre `.CHECKSUM`

> **Nenhuma fonte é dispensada de testemunha. O que varia é QUAL — e o que falha fechado é a AUSÊNCIA DE TESTEMUNHA DECLARADA, não a ausência de `.CHECKSUM`.**

Isto inverte o portão de `T-02.4a` **sem enfraquecê-lo**:

| formulação | o que ela recusa |
|---|---|
| como está hoje: *"sidecar ausente ⇒ recusa"* | **100 % do tráfego legítimo de `T-02.1` e `T-02.2`**, que nunca têm sidecar — e o builder acertou em não aplicá-la a eles |
| como fica: *"fonte sem testemunha DECLARADA ⇒ não ingere"* | a fonte que ninguém parou para pensar. Continua fail-closed, e agora fecha pelo motivo certo |

**Para o dump S3, as duas formulações coincidem** — a testemunha declarada dele **é** o `.CHECKSUM`, e sidecar ausente onde o publicador publica sidecar significa que algo deu errado. **O código de `T-02.4a` não precisa mudar; ele precisa de escopo declarado.**

### D3b · Dois portões, e eles estão em momentos diferentes por construção

A testemunha de cobertura **não pode** rodar antes da primeira linha: a cobertura de uma janela só existe depois do último registro. Isso parece colidir com o contrato de `T-02.4a` (*"rejeita truncamento ANTES de qualquer linha entrar"*). **Não colide — são dois portões, e cada um protege contra outra coisa.**

| portão | quando | testemunha | veredito quando morde | protege contra |
|---|---|---|---|---|
| **P1** | **antes da primeira linha** | classe **T**: `.CHECKSUM` · gramática do JSON · `content-length` | **`REJECTED`**, zero linhas gravadas | gravar **lixo** |
| **P2** | **depois da última linha, antes do commit** | classe **O**: cobertura da janela declarada · contagem esperada a priori · segunda fonte | **`ACCEPTED_WITH_WARNING` + linha em `md.ingest_gap`** — **nunca `REJECTED`** | gravar uma série **curta em silêncio** |

**`P2` não recusa, e a razão é `SPEC-001` §5.6.** As 6,781 h de abril de 2024 são **dado real**; recusá-las plantaria a mesma generalização de fail-closed que §5.6 existe para impedir — *"quem lê `CA-F3-1` sem `CA-F3-14` generaliza fail-closed e planta survivorship"*. **O objetivo de `P2` não é impedir a escrita: é impedir o SILÊNCIO.**

⇒ **o caso do `bookTicker` de 2024-04 é, precisamente, um `ACCEPTED_WITH_WARNING` com uma linha de `md.ingest_gap` de 713,219 h.** E `2024-05` (`404`) é `class = SEM_FONTE`. **`D2` e `D3` fecham no mesmo ponto**, e isso não foi arranjado: é o que a enumeração de três membros serve para expressar.

### D3c · A tabela — por fonte, o que testemunha, o que ela pega e o que ela NÃO pega

| fonte (task) | formato | testemunha **T** (portão P1) | testemunha **O** (portão P2) | o que **NÃO** é pego |
|---|---|---|---|---|
| **dump S3** `data.binance.vision` (`T-07.x`, e a borda de `T-02.4a`) | zip de CSV | **`.CHECKSUM`** publicado ao lado `[DOC + MEDIDO]` | **cobertura temporal da janela declarada** pelo nome do objeto; **e o último mês antes de um `404` é sempre suspeito** | erro de valor **dentro** de um registro presente |
| **REST snapshot** `exchangeInfo` + `fundingInfo` (`T-02.1`) | **documento JSON único** | **a gramática do JSON** — truncar um documento único **sempre** quebra o parse: **99/99** `[MEDIDO]`; mais `content-length`, presente em **3/3** capturas de header em disco — `fundingInfo` **129.901 B**, `premiumIndex` **194.072 B**, `openInterestHist` **69 B** `[MEDIDO: `data/binance/rest/h_fi.txt`, `h_pi.txt`, `h_oi.txt`; **`exchangeInfo` não tem header salvo, e é `[NÃO MEDIDO]` por extrapolação dos vizinhos do mesmo host**]` | **as DUAS testemunhas de universo que `D2.3` já usa**: `exchangeInfo` × `premiumIndex` = **872 × 875** `[MEDIDO]`, e a divergência é **dado, não erro** | um universo que encolheu **de verdade** — mas `D2.3` o converte em dado datado, que é o tratamento certo |
| **one-shot Coinalyze `daily`** (`T-02.2`) | **documento JSON único (array)** | gramática do JSON (mesmo **99/99**) + `content-length` exato `[MEDIDO: `43895` B = tamanho do arquivo em disco]` | **`n_expected` declarado A PRIORI, e ele já está no plano**: OI **≥ 2.400** pontos e 1ª data **≤ 2020-01-21**; liquidação **≥ 700** e 1ª **≤ 2024-08-26`. Reconferido em disco nesta rodada: **`n=2409`, 1ª `2020-01-21`** e **`n=730`, 1ª `2024-08-26`** `[MEDIDO]` | valor errado dentro do ponto. **Mitigado por outro eixo:** a série **nasce em quarentena** por `available_at IS NULL` (§5.2) e não chega a caminho de decisão |
| **WS `<symbol>@aggTrade`** (`T-03.x`) | stream | — | **`agg_id` contíguo** — **0 saltos em 8.873.078 linhas** `[MEDIDO, `SPEC-001` §5.4]` | — |
| **WS `!forceOrder@arr`** (`T-03.x`) | stream | — | **NENHUMA. Esta fonte não tem testemunha de integridade hoje, e isso é `[NÃO SEI]` declarado, não lacuna esquecida.** `SPEC-001` §5.4 já mediu: *"identificador de sequência: **NENHUM**; dump repõe: **não**"* | **tudo.** `ADR-004` decide sobreposição + chave natural + taxa de colisão publicada — isso é **mitigação de perda**, não testemunha de integridade, e chamá-la de testemunha seria inventar uma que não morde |

**A linha do `!forceOrder@arr` é a resposta que o enunciado pediu que eu preferisse a inventar uma.** E a consequência dela é arquitetural, não cosmética: **uma fonte sem testemunha de classe O nunca produz `ACCEPTED`** — o melhor veredito que ela alcança é `ACCEPTED_WITH_WARNING`, porque a plataforma não tem como afirmar que o lote está completo. **Isso não a bloqueia; carimba o que ela é.**

### D3d · O que eu recusei propor, e por quê

| testemunha proposta na pergunta | veredito | motivo |
|---|---|---|
| **`Content-Length` conferido contra bytes recebidos** | **ACEITA como classe T, RECUSADA como classe O** | o enunciado já suspeitava, e agora está medido: no caso de 2024-04 o `content-length` é **37.761.761** e os bytes recebidos são **37.761.761**. **Ele confere.** É um bom detector de conexão cortada e **zero** detector de objeto curto |
| **contagem de registros contra um campo declarado na resposta** | **RECUSADA para as fontes de F0** | **nenhuma das três declara contagem.** Coinalyze devolve array nu; `exchangeInfo` devolve objeto com `symbols[]`; o CSV do dump não tem cabeçalho de contagem. O campo não existe, e um campo inventado é testemunha que não morde. **O substituto que EXISTE é `n_expected` vindo de medição anterior — que é a coluna que `md.ingest_run` já tem** |
| **razão de tamanho contra o mês vizinho** | **ACEITA como alarme, RECUSADA como `n_missing`** | **177,8× contra déficit real de 106,2×** `[MEDIDO]`. Dá ordem de grandeza; não dá o número |

---

## Achados, numerados — o que fica no repositório mesmo se as três decisões forem recusadas

| # | achado | onde | `[força]` |
|---|---|---|---|
| **`A1`** | **`SPEC-001` §5.8 infere `.CHECKSUM` obrigatório A PARTIR do caso do `bookTicker`, e o `.CHECKSUM` publicado desse objeto CONFERE.** A conclusão sobrevive; a premissa não. Quem lê o documento conclui que a borda de `T-02.4a` cobre o caso — não cobre | `SPEC-001` §5.8; plano `02` `D2.8` | **`[MEDIDO]`**, `sha256sum -c` → `rc=0` |
| **`A2`** | **`D2.8`, como escrito, passa enquanto o caso real escapa.** *"Corromper um byte e exigir rejeição"* testa classe T; o caso de `200`-truncado citado na MESMA célula é classe O. **O DoD e o exemplo que o justifica testam coisas diferentes** — mesma forma do defeito que `SPEC-001` §5.1 registra sobre a classe (b) (*"o teste, como o PRD o escrevia, passava nos dois valores de `bar_policy`"*) | plano `02` `D2.8`; `tasks_review.md` `T-02.4a` | `[MEDIDO]` |
| **`A3`** | a justificativa de SQLite invoca `ADR-002/D4` (**série**, pendente) onde vale `ADR-002/D1` (**registro**, decidido). A decisão sobrevive por outro argumento (`D1c`); **a justificativa escrita no código não** | `sqlite_ingest_record_store.py`, cabeçalho, branch `T-02.3` | `[MEDIDO]`: leitura do arquivo + `ADR-002/D1` |
| **`A4`** | **`T-08.1` não é foro de `ADR-002/D1`** ⇒ a divergência SQLite×Postgres **não tem foro em nenhuma das 9 fases**. Dívida órfã por construção | `ADR-002/D4`; `tasks.toml` `T-08.1` | `[MEDIDO]` |
| **`A5`** | **`md.ingest_gap` não tem `run_id`** ⇒ o predicado que separa `ACCEPTED` de `ACCEPTED_WITH_WARNING` não é computável hoje | `SPEC-001` §3.5 | `[MEDIDO]` |
| **`A6`** | **a invariante de janela de §5.7 é de CONTENÇÃO, não de COBERTURA** (*"nenhum timestamp gravado fora da janela requisitada"*). Ela passa sobre 0,942 % do mês. Contenção e cobertura são duas invariantes, e só uma está escrita | `SPEC-001` §5.7 | `[MEDIDO]` |
| **`A7`** | **o `curl -sI` mensal de §5.8 pega o `404` e não pega o mês parcial que o antecede** — e o mês parcial é o que envenena a série. O `404` é honesto; o `200` curto não | `SPEC-001` §5.8 | `[MEDIDO, n = 3 símbolos × 3 meses]` |

---

## Emendas propostas — o texto, e onde ele entra

**Nada aqui está aplicado a `SPEC-001`, `docs/plans/**` ou `tasks.toml`. É proposta, e o gate de SPEC é do owner.**

### `E-1` · `SPEC-001` §3.5 — a enumeração fechada de `verdict`

> **Acrescentar após o bloco de schema de §3.5:**
>
> **`verdict` é enumeração FECHADA de três membros. Acrescentar um quarto é emenda desta SPEC — `ADR-008/DoD-3` mede "um `verdict` inédito" contra esta lista, e sem lugar único a palavra "inédito" perde fronteira.**
>
> ```
> ressalva(run_id)  :=  ∃ linha em md.ingest_gap com esse run_id
>
> REJECTED               :=  a borda RECUSOU o lote
> ACCEPTED_WITH_WARNING  :=  a borda ACEITOU o lote  ∧    ressalva(run_id)
> ACCEPTED               :=  a borda ACEITOU o lote  ∧  ¬ ressalva(run_id)
> ```
>
> **Invariantes, conferíveis por `SQL` sobre as duas tabelas e sem ler o código que gravou a linha:** `I-1` `REJECTED ⟹ n_written = 0` · `I-2` `ACCEPTED ⟹ count(gap WHERE run_id) = 0` · `I-3` `ACCEPTED_WITH_WARNING ⟹ count(gap WHERE run_id) >= 1` · `I-4` nenhuma linha de `md.ingest_gap` é órfã · `I-5` todo `run_id` tem exatamente um `verdict`, e ele está na enumeração.
>
> **`verdict` e quarentena são EIXOS DIFERENTES.** `verdict` qualifica uma **execução**; quarentena qualifica uma **série** (§5.2, predicado de três termos). Os quatro quadrantes existem: o one-shot da Coinalyze é execução aceita em série em quarentena (`D2.6`); `MATICUSDT` é execução com ressalva em série limpa (`D7.2`). **Colapsá-los abre a gaveta pelo motivo errado.**

### `E-2` · `SPEC-001` §3.5 — `run_id` em `md.ingest_gap`

> **Substituir a linha de schema por:**
>
> ```
> md.ingest_gap  ( run_id, source, symbol, series_key_id, from_ts, to_ts, n_missing, class, detected_at )
> ```
>
> **`run_id` não é conveniência: sem ele `I-2`, `I-3` e `I-4` não são computáveis, e a fronteira entre `ACCEPTED` e `ACCEPTED_WITH_WARNING` volta a ser gosto do chamador.**

### `E-3` · `SPEC-001` §5.8 — as duas classes de falha, e o que o `.CHECKSUM` não pega

> **Substituir a frase *"daí `G1` (verificação de `.CHECKSUM`) ser obrigatória na ingestão, com fixture que corrompe um byte e exige rejeição"* por:**
>
> **Há DUAS classes de falha, e toda testemunha só serve a uma.** **Classe T (transporte):** os bytes se perderam entre o publicador e nós — testemunha é qualquer digest ou comprimento computado pelo publicador. **Classe O (origem):** o objeto do publicador já é curto — e **nenhuma testemunha de classe T morde**, porque todas são computadas sobre o mesmo objeto curto.
>
> **`.CHECKSUM` é testemunha de classe T, e o caso de `monthly/bookTicker` 2024-04 é de classe O.** Medido em 2026-08-29: o `.CHECKSUM` publicado pela Binance para esse objeto **CONFERE** (`sha256sum -c` → `rc=0`), `unzip -t` não acusa erro, `content-length` bate com os bytes recebidos, e o arquivo cobre **6,781 h de 720 h = 0,942 %** do mês que o nome dele declara (`2024-04-01T00:00:00.012Z` a `2024-04-01T06:46:50.142Z`, `wc -l` = 3.223.965).
>
> **`.CHECKSUM` continua obrigatório onde o publicador o publica** — ele é o portão P1 e pega corrupção em trânsito. **O que pega classe O é a COBERTURA da janela declarada, e ela é o portão P2**, que roda **depois** da última linha e cujo veredito é **`ACCEPTED_WITH_WARNING` + linha em `md.ingest_gap`**, nunca `REJECTED` (§5.6: recusar dado real planta survivorship).
>
> **E o `curl -sI` mensal pega o `404` e NÃO pega o mês parcial que o antecede.** Medido em 3 símbolos: `2024-03` → `200` na casa dos GB, `2024-04` → `200` na casa das dezenas de MB, `2024-05` → `404`. ⇒ **o último mês antes de um `404` é sistematicamente suspeito e exige cobertura conferida.**

### `E-4` · `docs/context/plataforma-dados/tasks.toml`, `T-08.1` — **é do OWNER, agente não edita**

> **Acrescentar a `refs`:**
>
> `"ADR-014/D1f: o registro de F0 roda em SQLite e ADR-002/D1 diz PostgreSQL. Esta divergencia NAO e coberta pelos 5 criterios de D4 (universo: serie, candidatos 4x5). Se ela nao entrar na pauta AQUI, ela nao tem foro em nenhuma das 9 fases. Gatilhos G-A/G-B em ADR-014/D1e."`

### `E-5` · plano `02`, `D2.8` — a segunda metade do DoD, que é a que pega o caso real

> **Acrescentar linha à tabela de DoD da fase `02`:**
>
> | **D2.10** | **cobertura da janela declarada, e é ela que pega o caso de `200`-truncado** | fixture **byte-exata e com `.CHECKSUM` VÁLIDO** cobrindo **0,942 %** da janela que o nome declara ⇒ **`ACCEPTED_WITH_WARNING` + linha em `md.ingest_gap` de 713,219 h.** Um resultado `REJECTED` **também reprova** (§5.6) | **1 objeto real: `BTCUSDT-bookTicker-2024-04.zip`**, `sha256` `7403cdf0…215d`, catalogado em `data/MANIFEST.md` |
>
> **E a nota que impede `D2.8` de ser lido como cobertura:** `D2.8` (corromper um byte) testa **classe T**; o caso de `200`-truncado citado na mesma célula é **classe O** e `D2.8` **não o pega**. As duas metades são obrigatórias e não se substituem.

### `E-6` · plano `02`, item 2.5 / escopo de `T-02.4a` — a inversão do fail-closed

> **Acrescentar ao item 2.5:**
>
> **A borda de `.CHECKSUM` aplica-se às fontes que publicam sidecar — hoje, o dump `data.binance.vision`.** Ela **não** se aplica a `T-02.1` nem a `T-02.2`, que são respostas HTTP sem sidecar; aplicá-la ali recusaria **100 % do tráfego legítimo**. **O que falha fechado é a ausência de TESTEMUNHA DECLARADA, não a ausência de `.CHECKSUM`:** fonte sem linha na tabela de testemunhas de `ADR-014/D3c` não ingere.

---

## Falsificadores

| # | observação que derruba | o que ela derruba |
|---|---|---|
| **FA-1** | `lint-imports` com o contrato de `D1d` **passando** sobre uma árvore em que `domain` ou `use_cases` conhece o motor — ou **reprovando** sobre a árvore limpa | **`D1d`**. O contrato foi rodado nas duas metades (`rc=0` / `rc=1` / `rc=0` após reverter); se alguém reproduzir e obter outra coisa, a medição é minha e está errada |
| **FA-2** | um `verdict` gravado com `n_written > 0`, **zero** linhas de `md.ingest_gap` para o `run_id`, e valor `ACCEPTED_WITH_WARNING` — **sem que nenhum teste reprove** | **`D2b`**. Prova que `I-3` não foi implementada e que a fronteira continua sendo gosto do chamador |
| **FA-3** | um caso de ressalva-não-ausência aparecendo **antes** de `T-03.x` | **`D2e`**. O deferimento se apoia em haver exatamente um caso conhecido; o segundo caso vence a espera |
| **FA-4** | qualquer objeto do dump em que o `.CHECKSUM` publicado **reprove** um objeto curto na origem | **`A1`**, e com ele metade de `D3`. Seria a prova de que a Binance recomputa o sidecar contra o conteúdo esperado, e não contra o objeto publicado |
| **FA-5** | uma fonte de F0 que **declare contagem na própria resposta** | **`D3d`**, linha 2. Eu afirmei que nenhuma das três declara; um campo de contagem que eu não vi derruba a recusa |
| **FA-6** | `T-08.1` rodando e **decidindo** o motor do registro | **`A4`**. Se o spike de fato cobrir `D1`, a dívida tem foro e `G-C` é redundante |
| **FA-7** | `md.ingest_run` sendo escrito por **dois processos** em F0 | **`D1a`**. `ADR-002/D5` promete escritor único; SQLite sobrevive a escritor único e não a dois. Dois escritores derrubam a decisão **hoje**, não em `G-B` |

---

## O que esta ADR NÃO julga, e é declarado

- **Se o owner quer ou não pagar um daemon de Postgres agora.** Isso é custo de infra sobre uma VPS cujo `free -m` e `df -h` continuam **`[NÃO MEDIDO]`** desde `ADR-002` — e eu **não tenho acesso a ela**. Apresento o trade-off e paro.
- **A afirmação do builder de que "a troca custa um arquivo".** É verificação de código, está com o `/review`, e esta ADR **assume que a resposta virá**. `D1d` torna a propriedade permanente **se** ela for verdadeira hoje; **não** a prova.
- **`[NÃO SEI]` — qual é a retenção real do bucket `data.binance.vision`.** `SPEC-001` §5.8 já a marca como `NÃO MEDIDA` e eu não a medi. O que medi é que **`bookTicker` parou de ser publicado em 2024-04**, o que é descontinuação de dataset e **não** é o mesmo que retenção.
- **`[NÃO SEI]` — se o mês parcial de 2024-04 é a totalidade do que a Binance capturou ou o resultado de uma falha do lado dela.** As duas hipóteses produzem o mesmo objeto e o mesmo `.CHECKSUM`. **A distinção não muda a arquitetura** — em ambas, a testemunha que morde é a cobertura — mas ela muda o que a tela deve dizer ao usuário, e isso fica aberto.
- **`[NÃO SEI]` — o limiar de cobertura que deve gerar ALARME** (distinto de gerar linha de gap). Qualquer déficit gera linha de gap; o limiar de alarme depende da distribuição de déficits legítimos, que é `[NÃO MEDIDO]` até F3 acumular. **Não invento o número.** Dono: quem calibrar em F3, junto de `clock_skew_tolerance_ms` (§5.9), que tem exatamente a mesma forma de deferimento.

---

## Notas de método — porque o instrumento é a primeira coisa a duvidar

1. **Baixei os 37,7 MB e hasheei de fato.** Não conferi *"o `.CHECKSUM` existe"*: `sha256sum -c` sobre o arquivo em disco, contra a linha publicada, sem edição. Um `curl -sI` teria me dado o mesmo número que já estava no plano e **nenhuma informação nova**.
2. **A medição de truncamento de JSON foi feita nos dois sentidos, sobre o mesmo conteúdo.** `n = 99` pontos de corte (1 %..99 %): documento JSON único falha o parse em **99/99**; o **mesmo conteúdo** reformatado como NDJSON falha em **0/99** — e no caso NDJSON eu **descarto a linha parcial**, que é o que um leitor de linha faz, para não creditar ao formato uma detecção que ele não teria. **É a assimetria que decide qual formato precisa de testemunha externa.**
3. **O contrato de `import-linter` foi rodado nas DUAS metades, e revertido com `sha256sum` reconferido.** Um contrato que só foi visto passar é contrato que não se sabe se morde — e a bancada dos dois builders desta fase falhou exatamente aí. **O `.pyc` não é vetor aqui** (`grimp` lê AST do fonte, e o mutante mudava o tamanho do arquivo), mas a metade `morde` foi rodada assim mesmo, porque *"não é vetor"* é raciocínio e `rc=1` é medição.
4. **`backend/` e `frontend/` intocados.** A cópia usada em (3) vive no scratchpad da sessão e foi montada por `git show` das duas branches — quatro agentes rodam em worktrees paralelos.
5. **O que eu não consigo verificar sozinho está rotulado `[NÃO SEI]` acima, e não foi convertido em recomendação.**
