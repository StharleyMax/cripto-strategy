# Fase `04` — As superfícies de contrato e de consulta: **decisão escrita, renomeação nenhuma**

**Componente:** `docs` · **Classe:** fronteira · **Depende de:** `01` · **Paraleliza com:** `02`, `03` · **Cobre:** `PRD-002`/`U4`, `[GAP G1]`, `[GAP G2]`
**Rev de ancoragem:** `master@5f4ece0` · **Esta fase entrega TEXTO. Zero linha de código.**

> **Como** dono deste repositório,
> **quero** que as três superfícies que não são identificador nem documento — evento de log, coluna de contrato, segmento de URL — tenham fronteira escrita,
> **para que** a próxima task não decida por hábito, como as duas de hoje decidiram.

---

## O que esta fase fecha, e por que ela não é cerimônia

A superfície de **evento de log** tem **9 eventos nomeados: 4 em português, 5 em inglês**, nascidos **no mesmo mês**, e o próprio repositório registra a causa:

> *"o código novo é **todo em inglês** … o que cria um **segundo vocabulário de observabilidade** … **Nada existente foi renomeado.** A divergência é **decisão de leitura do agente**, não citação do owner"* `[DOC: docs/INDEX.md:68]`

**⇒ A divergência nasceu de a superfície não ter dono declarado.** Esta fase dá dono às três.

---

## Itens

| # | item | requisito | alvo |
|---|---|---|---|
| `4.1` | **Evento de log e chave de `extra={}`** — a linha 10 da tabela de fronteira deixa de ser `⏸ NÃO DECIDIDO`. **Novos nascem em inglês** (já escrito em `01`/`1.4`); esta fase acrescenta **a regra condicional de migração dos 4 existentes** | `[Q1]`, `SPEC-002` §6.3 | `CLAUDE.md` |
| `4.2` | **Coluna de contrato** — exceção **com dono** e **com gatilho de reabertura nomeado** | `[GAP G1]`, `SPEC-002` §8 | `CLAUDE.md` |
| `4.3` | **Segmento de URL** — permanece `⏸ NÃO DECIDIDO`, com o dono (**owner**) e o custo de adiar escritos | `[Q2]`, `SPEC-002` §7 | `CLAUDE.md` |
| `4.4` | A pergunta **factual** ao owner sobre consumidor de log, escrita como fato e não como escolha | `[GAP G2]` | `docs/context/codigo-em-ingles/` |

**`4.1`, o texto normativo, e as três metades são obrigatórias:**

1. **Prospectivo:** todo evento de log e chave de `extra={}` **novo** nasce em inglês.
2. **Retroativo:** os **4 existentes em português** (`etl_item_publicado`, `etl_item_concluido`, `etl_drenagem_concluida`, `checkpoint_cauda_truncada`) e as **4 chaves** (`destino`, `processados`, `janela`, `bytes_descartados`) **NÃO são renomeados por esta SPEC.**
3. **A regra condicional**, escrita agora para que a resposta do owner não precise de mais um round:

| resposta do owner | o que acontece |
|---|---|
| **não há consumidor** | migração numa fase própria e futura, rename direto |
| **há consumidor**, ou **não sabe** | migração com **emissão dupla** por janela declarada: o nome novo passa a ser emitido **ao lado** do antigo, e o antigo só sai depois de o owner confirmar que a consulta migrou |
| **sem resposta** | **nada acontece com os 4, e nada trava.** A superfície passa a ter dono e a divergência **para de crescer** mesmo que não encolha |

> **Por que a migração é unidade PRÓPRIA e futura, e não entra em `02` nem em `03`:** ela tem um risco que nenhuma renomeação de identificador tem. É classe **D** de `PRD-002` §5.1 — **o consumidor vive fora deste repositório e a quebra é SILENCIOSA**: renomear um identificador Python quebra um import e o import reprova; renomear um evento de log quebra uma consulta, **e a consulta continua devolvendo `rc=0` com zero linhas.**

**`4.2`, o gatilho, literal:** `janela_de_perda` é uma das **15 colunas** que `ADR-008/D3` fixou, e a ordem alimenta o `sha256` da projeção canônica (`ADR-008/DoD-2`). A exceção **já está escrita em código de produção, em inglês, com o motivo** (`ingest_record.py:87-89`). **A reabertura acontece quando `T-07.12`/`T-07.13` escrever o consumidor da projeção, e quem decide é `ADR-008/D3` — não esta feature.** Renomear muda a impressão digital de **todo** relatório já emitido: **é mudança de contrato, não de estilo.**

---

## DoD

| # | critério | comando | esperado |
|---|---|---|---|
| `CA-F4-1` *(c)* | a linha 10 tem decisão **e** rótulo de força | `grep -n 'evento de log' CLAUDE.md` | `rc=0`; a linha contém `[INFERRED:` e **não** contém `⏸` |
| `CA-F4-2` *(c)* | a coluna de contrato é exceção **com dono e gatilho** | `grep -F 'janela_de_perda' CLAUDE.md`; **e** `grep -F 'ADR-008/D3' CLAUDE.md`; **e** `grep -F 'T-07.13' CLAUDE.md` | `rc=0` nos **três** |
| `CA-F4-3` *(c)* | a linha 12 continua **aberta**, com dono | `grep -n 'segmento de URL' CLAUDE.md` | `rc=0`; a linha contém `⏸` **e** `owner` |
| `CA-F4-4` *(c, dois lados)* | **zero renomeação** | `git diff --name-only master... -- backend frontend` | **vazio.** É o lado que prova que a fase entregou texto |
| `CA-F4-5` *(c)* | os 9 eventos **intactos** | `grep -rnE 'logger\.(info\|warning\|debug\|error)\("' backend/src \| wc -l` | **9**, com os **4 portugueses** presentes por `grep -F` de cada um |
| `CA-F4-6` *(c)* | a pergunta ao owner é **factual**, não uma escolha de idioma | leitura de `docs/context/codigo-em-ingles/` | a pergunta é *"alguma query, alerta, dashboard ou script fora deste repositório consulta estes nomes?"* — **sim ou não** |
| `CA-F4-7` *(c)* | `docs/INDEX.md` cresce, não muda | `git diff --numstat master... -- docs/INDEX.md` | **zero linhas removidas** |

---

## O que esta fase mede e NÃO sabe, dito

**`[NÃO MEDIDO]` se existe consumidor dos 4 eventos em português.** O que **foi** medido:

```
$ git ls-files | grep -icE 'dashboard|alert|grafana|prometheus|loki|logql'
0
```

`[MEDIDO 2026-08-29 em 5f4ece0]` · **Zero dashboards, alertas ou coletores versionados.** **Isso NÃO prova ausência de consumidor** — `backend/src/modules/sentimento/infra/ingest_health_cli.py:69` diz, em docstring, que *"a scheduler or a supervisor calls `logging.basicConfig(stream=sys.stdout, level=INFO)`"*: **o desenho antecipa um hospedeiro externo**, e o que roda na VPS do owner está fora do meu alcance. **É exatamente isso que torna a pergunta barata de responder e cara de errar.**

---

## Falsificador desta fase

**Se, duas fases adiante, um evento de log novo nascer em português tendo o `CLAUDE.md` no contexto**, a decisão prospectiva não pegou e a superfície precisa de mecanismo, não de doutrina. **O sintoma é observável e barato:**

```
$ grep -rnE 'logger\.(info|warning|debug|error)\("' backend/src   # e conte os portugueses
```

**Hoje são 4 de 9, e o número de portugueses NÃO PODE SUBIR.** Se subir, `ADR-013/D2e` volta à mesa com um caso concreto — e é a primeira vez nesta trilha que ele teria um.
