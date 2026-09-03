# Estudo de partição do bounded context `sentimento` — 2026-09-03

> **⛔ Isto é um ESTUDO. Nada foi partido, nada foi movido, nada foi decidido.**
> Autor: `quant-architect`. Ato solicitado pelo owner em 2026-09-03, como terceira opção
> entre *"partir agora"* e *"manter"* — ver `docs/decisoes-do-owner.md`, seção
> *"⏸ PERGUNTA NOVA, com relógio"*.
> **A escolha é do owner.** Este documento apresenta fronteiras, custo medido e o gatilho.
>
> **Read-only sobre código.** Nenhum arquivo de `backend/src`, `backend/tests`,
> `tasks.toml`, ledger, `harness.toml`, `ADR-005`, `ADR-009` ou do plano `05` foi tocado.
> Os experimentos com `import-linter` rodaram com `--config` apontando para arquivos
> descartáveis em `$SCRATCH`, **nunca** contra `backend/pyproject.toml`.

## Sumário executivo — 6 achados, na ordem em que mudam a decisão

| # | achado | força |
|---|---|---|
| **A1** | O grafo de import de `sentimento` é um **DAG** (0 ciclos), profundidade máxima 6, **207 arestas** internas sobre 127 módulos-folha — densidade 1,63. Grafo **esparso**. | `[MEDIDO]` §2 |
| **A2** | Ele já se decompõe em **11 componentes fracamente conexos**, um gigante de 96 e dez de ≤15. **Duas fronteiras custam ZERO aresta cruzada hoje.** | `[MEDIDO]` §2 |
| **A3** | A hipótese de `arquitetura-fluxos.md:48-56` **é contradita como topologia e sustentada como nomes.** Como três contextos-pares que só se falam pelo Postgres: **33 arestas de import que o diagrama não desenha**. Como pilha de 3 níveis: **0 ciclos, 0 arestas subindo**. | `[MEDIDO]` §3 |
| **A4** | Partir **não resolve sozinho** o *"ta virando enorme"*: a partição de 5 contextos deixa o maior com **85 módulos**, ainda **1,7× o `messages`(50)** do vizinho. Chegar a ≤50 exige **10 contextos**, e aí **34,8% das arestas cruzam** e **2 ciclos** aparecem. | `[MEDIDO]` §5 |
| **A5** | **O custo em CONTRATO é quase zero e pagável ANTES de mover arquivo.** `import-linter` 2.14 aceita **wildcard** em `source_modules` **e** em `containers`, e eu provei as **duas metades** (morde e cala). `src.modules.*.infra` reprova nomeando `binance_stream_probe -> socket (l.14)`. | `[MEDIDO]` §7.3 |
| **A6** | **O que a partição quebra em silêncio é um portão que nasceu ontem**: `ADR-009/D6.3` contrato (4) enumera `forbidden_modules = ["src.modules.sentimento.infra"]`, e `forbidden_modules` apontando para módulo inexistente devolve **`KEPT`, `0 broken`, `rc=0`**. 11 módulos de `infra` sairiam da cobertura **sem nada avisar**. | `[MEDIDO]` §7.1 |

---

## 1. O fato motivador, conferido por mim e não aceito de segunda mão

O despacho me deu `130 módulos / 18.946 linhas`. **Confiro e corrijo em 1 módulo:**

```bash
for d in domain use_cases infra; do
  n=$(find backend/src/modules/sentimento/$d -name '*.py' | wc -l)
  l=$(find backend/src/modules/sentimento/$d -name '*.py' -exec cat {} + | wc -l)
  echo "$d $n $l"
done
# domain 61 10319 · use_cases 20 2034 · infra 49 6593
find backend/src/modules/sentimento -name '*.py' | wc -l   # 131
find backend/src/modules/sentimento -name '*.py' -exec cat {} + | wc -l   # 18947
ls backend/src/modules/   # __init__.py  __pycache__  sentimento
```

`[MEDIDO 2026-09-03 em 8c002e4, n=131]`

**A diferença é o `__init__.py` da raiz do contexto**, que a soma das três camadas não conta.
`130` é o número das camadas; `131` é o número de arquivos `.py` do contexto. Ambos estão
certos sobre coisas diferentes, e este estudo usa **131** (arquivos) e **127** (módulos-folha:
131 menos os 4 `__init__.py` de pacote, que o grafo trata como nós próprios).
O `18.946` do despacho é `18.947` — divergência de 1 linha, mesma causa.

**`sentimento` é o único contexto** — a afirmação se sustenta: `ls backend/src/modules/` devolve
só `__init__.py` e `sentimento`.

### O relógio: a taxa de crescimento, que é o que um gatilho precisa

```bash
for c in $(git log --format=%H --reverse --first-parent | awk 'NR%25==1') HEAD; do
  echo "$(git log -1 --format=%ad --date=short $c) \
$(git ls-tree -r --name-only $c | grep -c '^backend/src/modules/sentimento/.*\.py$')"
done
```

| data | módulos `.py` em `sentimento` |
|---|---|
| 2026-08-25 | 0 |
| 2026-08-29 | 15 |
| 2026-09-01 | 41 |
| 2026-09-02 | 86 |
| 2026-09-02 | 112 |
| 2026-09-03 (HEAD) | **131** |

`[MEDIDO 2026-09-03, n=7 pontos do primeiro-pai]`

**De 0 a 131 em 9 dias.** O contexto cruzou os 50 módulos do `messages` por volta de
2026-09-01/09-02 — ou seja, **há dois dias**.

**Projeção, e ela é `[INFERRED]`, não medida:**

```bash
grep -oE '^status = "[a-z]+"' docs/context/plataforma-dados/tasks.toml | sort | uniq -c
# 64 done · 14 todo · 7 blocked   (85 tasks)
```

`131 módulos / 64 tasks done ≈ 2,05 módulos por task`. Com **21 tasks restantes** (14 todo +
7 blocked), a projeção é **+43 módulos ⇒ ~174 ao fim do plano**.
`[INFERRED: extrapolação linear de módulos-por-task-concluída; o método é declarado para poder
ser recusado. A taxa NÃO é estado estacionário — ela é execução de fase, e uma fase de
documentação produziria 0 módulos]`

---

## 2. A estrutura real do grafo — e ela é o achado que mais restringe a decisão

Grafo construído com `grimp` 3.16 (a mesma biblioteca que `import-linter` 2.14 usa por baixo),
**não** com regex.

```bash
cd backend && PYTHONPATH=$PWD ./.venv/bin/python - <<'PY'
import grimp
g = grimp.build_graph("src", include_external_packages=False)
mods = sorted(m for m in g.modules if m.startswith("src.modules.sentimento"))
print("modulos:", len(mods))
E = [(m,d) for m in mods for d in g.find_modules_directly_imported_by(m)
     if d.startswith("src.modules.sentimento")]
print("arestas internas:", len(E))
print("saindo:", sum(1 for m in mods for d in g.find_modules_directly_imported_by(m)
                     if not d.startswith("src.modules.sentimento")))
print("entrando:", sum(1 for m in g.modules if not m.startswith("src.modules.sentimento")
                       for d in g.find_modules_directly_imported_by(m)
                       if d.startswith("src.modules.sentimento")))
PY
# modulos: 131 · arestas internas: 207 · saindo: 0 · entrando: 0
```

`[MEDIDO 2026-09-03, grimp 3.16, n=131 módulos / 207 arestas]`

### 2.1 `sentimento` é uma ilha fechada — 0 arestas para fora, 0 de fora

Isto é a **primeira boa notícia** e ela é estrutural: partir `sentimento` **não pode quebrar
nenhum consumidor**, porque hoje não existe consumidor nenhum sob `src/`. A camada de API que
`ADR-009/D6` acabou de decidir **ainda não existe** (`F-D6-1` mede exatamente isso e devolve 0).
⇒ **a janela em que a partição é mais barata é agora, e ela fecha quando `src/api/` nascer.**

### 2.2 O grafo é um DAG — 0 ciclos de import

```bash
# Tarjan SCC sobre as 207 arestas (script em $SCRATCH/dag.py, reproduzido no apêndice A)
# SCCs com >1 modulo (ciclo de import): 0
# => grafo de modulos e DAG? SIM
# profundidade maxima da cadeia de import: 6
# distribuicao de profundidade: {0: 37, 1: 29, 2: 24, 3: 19, 4: 10, 5: 6, 6: 2}
```

`[MEDIDO 2026-09-03, n=127 módulos-folha / 207 arestas]`

**Por que isto decide muito:** num DAG, **todo conjunto fechado para baixo é uma fronteira
válida com zero arestas subindo.** Não existe "ciclo intrínseco" que impeça a partição. Todo
ciclo que aparecer numa proposta é **artefato da atribuição**, não do código — e isso é o que
separa "a fronteira está errada" de "o código está emaranhado". **O código não está emaranhado.**

### 2.3 Onze componentes fracamente conexos — o contexto já está partido, sem rótulo

```bash
# script em $SCRATCH/wcc.py (apêndice A); universo: 127 modulos-folha, 207 arestas
# weakly connected components: 11
# sizes: [96, 15, 4, 2, 2, 2, 2, 1, 1, 1, 1]
```

| WCC | n | módulos | invariante que os une |
|---|---|---|---|
| `WCC0` | **96** | o miolo: captura ao vivo, quota, clock, catálogo, proveniência, disponibilidade | — (é o que sobra; ver §4) |
| `WCC1` | **15** | `checksum_manifest`, `content_dedupe`, `dump_window`, `etl_backlog`, `retention_probe`, `checksummed_file_payload`, `content_dedupe_store`, `content_deduping_worker`, `dump_etl_cli`, `dump_ingest_worker`, `file_etl_worker`, `head_probe_log`, `jsonl_checkpoint`, `drain_etl_backlog`, `ingest_verified_payload` | **byte só entra depois de o checksum bater; backlog é drenado exatamente-uma-vez e retomável** |
| `WCC2` | **4** | `aggtrade_bucket_aggregate`, `aggtrade_contiguity`, `cvd`, `aggtrade_csv_reader` | **CVD vem do lado agressor de `aggTrade`, e o bucket só fecha com a cadeia de `aggId` contígua** |
| `WCC3` | 2 | `instrument_alias`, `instrument_alias_reader` | identidade de instrumento sobrevive a rename |
| `WCC4` | 2 | `oi_history_paginator`, `binance_oi_history_client` | paginação de OI histórico |
| `WCC5` | 2 | `qnq_divergence`, `aggtrade_rest_snapshot_reader` | `q` × `nq` divergem ⇒ o campo de quantidade é ambíguo |
| `WCC6` | 2 | `s3_bucket_listing`, `binance_dump_bucket_listing_client` | listagem paginada de bucket |
| `WCC7..10` | 1 cada | `endpoint_shift_table`, `fee_schedule`, `funding_settlement`, `long_short_ratio_series` | — (folhas puras, nenhum import interno) |

**`WCC1` e `WCC2` são fronteiras que custam ZERO aresta cruzada.** Ninguém as propôs.

---

## 3. A hipótese de `arquitetura-fluxos.md:48-56` — testada, e o veredito tem duas metades

O documento desenha, dentro do subgrafo `BACK`:

```
ING["bounded context: ingestion / componente sentimento"]
CAT["bounded context: catalog / series_catalog"]
REG["bounded context: registry / ingest_run, ingest_gap, run_registry"]
```

E as arestas que ele desenha entre eles, conferidas linha a linha:

```bash
sed -n '44,80p' docs/arquitetura-fluxos.md | grep -E 'ING|CAT|REG|-->'
# BD --> ING · BR --> ING · BW --> ING · CZ -.-> ING
# ING --> Q --> W · W --> PG · W --> COL
# CAT --- PG · REG --- PG · PG --> API · COL --> API
```

`[MEDIDO 2026-09-03, n=11 arestas do mermaid]`

**O diagrama desenha ZERO aresta entre `ING`, `CAT` e `REG`.** Os três se ligam só ao Postgres,
e `CAT`/`REG` com `---` (não-direcionado). A leitura é inequívoca: **três contextos-pares que
não se importam, integrados por banco compartilhado.**

### 3.1 Metade um: como topologia de pares, o grafo CONTRADIZ o diagrama

Atribuí cada módulo ao contexto do diagrama pelo tema (a atribuição completa está no apêndice B)
e medi:

```bash
./backend/.venv/bin/python $SCRATCH/part.py   # apêndice A
### H1 = ingestion/catalog/registry (doc arquitetura-fluxos:48-56)
#   tamanho: {'ingestion': 87, 'catalog': 18, 'registry': 22}
#   arestas que CRUZAM: 32 de 207
#     ingestion -> registry: 19 · ingestion -> catalog: 5 · catalog -> ingestion: 3
#     registry -> ingestion: 3 · catalog -> registry: 1 · registry -> catalog: 1
#   CICLOS entre contextos: [('catalog','ingestion'), ('catalog','registry'), ('ingestion','registry')]
```

`[MEDIDO 2026-09-03, n=207 arestas]`

**32 arestas cruzam onde o diagrama desenha 0, e os TRÊS pares são mutuamente cíclicos.**
Um ciclo entre contextos não é custo — é a prova de que a fronteira, como desenhada, **não é
fronteira**: nenhum par de contratos `forbidden` nas duas direções pode ser satisfeito.

As duas arestas que fecham o ciclo `catalog ↔ registry` são pequenas e nomeáveis:

```
domain.as_of_accessor  -> domain.provenance      [catalog -> registry]
domain.ingest_record   -> domain.canonical_json  [registry -> catalog]
```

### 3.2 Metade dois: como PILHA de níveis, o grafo SUSTENTA os nomes — 0 ciclos, 0 subindo

Tomei o **fecho descendente** de uma semente de "linguagem publicada" (os tipos que os outros
citam) e medi a direção:

```bash
./backend/.venv/bin/python $SCRATCH/comps.py   # apêndice A
# == KERNEL (fecho descendente do seed de linguagem publicada): n=17
#   as_of_accessor, canonical_json, coinalyze_daily_series, cvd_source_catalog, ingest_record,
#   instrument_alias, instrument_universe_snapshot, metrics_shift, open_interest_catalog,
#   price_source_catalog, provenance, quarantine_terms, quarantined_series_entry,
#   schema_change, series_catalog, series_key, universe_at
#   arrastados pelo fecho: []          <- o fecho NAO puxou nada de fora do seed
#   arestas SUBINDO (kernel -> fora): 0
#   arestas ENTRANDO (fora -> kernel): 34
```

`[MEDIDO 2026-09-03, n=17 módulos no fecho]`

**17 módulos de `domain` puro, fechados para baixo, com 0 arestas subindo e 34 entrando.**
O fecho **não arrastou nenhum módulo extra** — a semente já era fechada, o que é evidência de
que esses 17 tipos são, de fato, a linguagem publicada do contexto.

**⇒ O veredito, em uma linha:** `catalog` e `registry` **não são contextos-pares de
`ingestion`; são um núcleo compartilhado ABAIXO dele.** Os nomes do documento estão certos; a
topologia dele está errada. E `catalog`/`registry` podem virar dois níveis distintos se, e só
se, `canonical_json` (pura serialização, profundidade 0) descer para o nível de `registry` —
senão as duas arestas de §3.1 fecham ciclo.

> **⚠️ Consequência para `docs/arquitetura-fluxos.md`, e ela NÃO é ato meu:** o diagrama afirma
> uma propriedade — *"`catalog` e `registry` se integram ao `ingestion` por banco, não por
> import"* — que o código **viola 33 vezes** (17 + 16, ver §5). Corrigir o diagrama, ou aceitar
> que ele descreve um alvo e não o presente, é ato de quem possui aquele documento.
> `[NÃO SEI]` quem é — não achei dono declarado. **Dono da pergunta: owner.**

---

## 4. Fronteiras propostas — **por invariante, não por pasta**

O critério que separa cada fronteira é **uma invariante que pode ser violada por um import**.
Isso é deliberado: fronteira cujo critério é "as coisas de arquivo parecido" não sobrevive à
próxima task, e não dá para transformar em contrato.

### `OPÇÃO A` — 3 contextos, os cortes livres · **maior contexto: 104**

| contexto | n | invariante — o que um import errado destruiria | verificação pelo owner |
|---|---|---|---|
| **`cvd`** (`WCC2` + `WCC5`) | **6** | **CVD se calcula do lado agressor de `aggTrade`, nunca de candle OHLCV.** Um import de fonte de candle para dentro deste contexto é a definição mecânica do erro. E a contiguidade de `aggId` é o que impede o bucket de fechar com trade faltando. | contrato `forbidden` de `src.modules.cvd` para toda fonte de OHLCV, com **par morde/cala**: plantar o import e ver `BROKEN` nomeando a linha |
| **`batch_etl`** (`WCC1` + `WCC6`) | **17** | **nenhum byte entra sem o checksum bater, e o backlog é retomável exatamente-uma-vez.** | fixture de dump real com checksum corrompido ⇒ recusa; regressão já existente em `test_checksum_at_the_ingestion_edge.py` |
| **`sentimento`** (o resto) | **104** | — (é o que sobra; **não** é uma invariante, e isto está declarado) | — |

**Arestas que cruzam: `0`.** É o corte que o disco já fez — `WCC1`, `WCC2`, `WCC5` e `WCC6` são
componentes fracamente conexos **inteiros**, e por definição não têm aresta para fora.

**⚠️ Correção a uma versão anterior desta seção, registrada porque o erro era do tipo que este
estudo existe para pegar:** eu havia escrito `cvd`=7 e `batch_etl`=18, acrescentando
`binance_aggtrade_payload` e `dump_survivorship` — **e afirmado `0` arestas cruzando junto.**
As duas coisas não podem ser verdade ao mesmo tempo. Medido:

```bash
# A-minima  (WCC2 | WCC1):                    cvd=4  batch_etl=15  sentimento=108  cruzam=0
# A-ampliada (WCC2+WCC5 | WCC1+WCC6):         cvd=6  batch_etl=17  sentimento=104  cruzam=0
# A-maxima  (+binance_aggtrade_payload, +dump_survivorship):
#                                             cvd=7  batch_etl=18  sentimento=102  cruzam=3
#     domain.dump_survivorship          -> domain.ingest_record          [batch_etl->sentimento]
#     domain.stream_probe_outcome       -> domain.binance_aggtrade_payload [sentimento->cvd]
#     use_cases.probe_stream_quantity_fields -> domain.binance_aggtrade_payload [sentimento->cvd]
```

`[MEDIDO 2026-09-03, n=207 arestas]` — **a tabela acima é a `A-ampliada`**, que é o maior corte
que ainda custa `0`. A `A-máxima` custa **3 arestas** e não tem ciclo; é defensável, mas então o
`0` tem de sair da frase. Os dois módulos extras só ficam livres na `OPÇÃO B`, onde `registry`
já é contexto próprio e `dump_survivorship → ingest_record` passa a descer a pilha.

### `OPÇÃO B` — 5 contextos, a pilha em camadas · **maior contexto: 85** · *a que eu apresentaria primeiro*

Empilhados: `registry` (mais baixo) → `catalog` → `cvd` ∥ `batch_etl` → `ingestion`.

| # | contexto | n | invariante | módulos |
|---|---|---|---|---|
| 1 | **`registry`** | 5 | **toda linha escrita carrega de onde veio e quando ficou disponível; `modeled` nunca sobrescreve `observed`.** É a invariante anti-lookahead na sua forma de tipo. | `provenance`, `ingest_record`, `metrics_shift`, `schema_change`, `canonical_json` |
| 2 | **`catalog`** | 12 | **uma série tem UMA identidade e UMA fonte canônica; instrumento renomeado/delistado continua identificável; série em quarentena não é série.** | `series_key`, `series_catalog`, `cvd_source_catalog`, `price_source_catalog`, `open_interest_catalog`, `as_of_accessor`, `instrument_alias`, `instrument_universe_snapshot`, `universe_at`, `quarantine_terms`, `quarantined_series_entry`, `coinalyze_daily_series` |
| 3 | **`cvd`** | 7 | como na `OPÇÃO A` | `cvd`, `aggtrade_bucket_aggregate`, `aggtrade_contiguity`, `qnq_divergence`, `binance_aggtrade_payload`, `aggtrade_csv_reader`, `aggtrade_rest_snapshot_reader` |
| 4 | **`batch_etl`** | 18 | como na `OPÇÃO A` | `WCC1` (15) + `dump_survivorship`, `s3_bucket_listing`, `binance_dump_bucket_listing_client` |
| 5 | **`ingestion`** | 85 | **nenhuma superfície chama exchange direto; o escritor é único e lê-antes-de-escrever; a quota do fornecedor nunca é excedida.** | o resto |

```bash
./backend/.venv/bin/python $SCRATCH/h3.py   # apêndice A
# tamanhos: {'1_registry': 5, '2_catalog': 12, '3_cvd': 7, '4_batch_etl': 18, '5_ingestion': 85}
# arestas que CRUZAM: 39 de 207
#   2_catalog -> 1_registry: 3 · 4_batch_etl -> 1_registry: 1
#   5_ingestion -> 1_registry: 16 · 5_ingestion -> 2_catalog: 17 · 5_ingestion -> 3_cvd: 2
# CICLOS entre contextos: nenhum
# violacoes de camada (aresta que sobe na pilha): total subindo: 0
```

`[MEDIDO 2026-09-03, n=207 arestas]`

**39 arestas cruzam (18,8%), 0 ciclos, 0 subindo.** Todas as 39 descem a pilha ⇒ um único
contrato `layers` com 5 níveis as expressa, e nenhuma delas precisa de exceção.

### `OPÇÃO C` — 10 contextos, para chegar a ≤50 · **maior contexto: 30**

Acrescenta à `OPÇÃO B`: `quota` (14), `clock` (11), `liquidation` (14), `availability` (8),
`transport` (8), `capture` (30).

```bash
./backend/.venv/bin/python $SCRATCH/h4.py   # apêndice A
# tamanhos: {1_registry:5, 2_catalog:12, 3_cvd:7, 4_batch_etl:18, 6_quota:14,
#            7_clock:11, 8_liquidation:14, 9_availability:8, A_transport:8, B_capture:30}
# arestas que CRUZAM: 72 de 207 (34%)
# CICLOS entre contextos: [('7_clock','9_availability'), ('A_transport','B_capture')]
```

`[MEDIDO 2026-09-03, n=207 arestas]`

**72 arestas (34,8%) e 2 ciclos.** Os ciclos são rasos (2 e 6 arestas) e por atribuição, não por
código (§2.2) — mas o número de arestas cruzadas **dobrou** para tirar 55 módulos do maior
contexto. É o ponto em que a fronteira começa a cobrar mais do que entrega.

### A curva de custo, que é o que a decisão realmente pesa

| opção | contextos | maior contexto | arestas cruzando | ciclos | `[MEDIDO]` |
|---|---|---|---|---|---|
| hoje | 1 | **127** | 0 (0%) | 0 | §2 |
| `A` (ampliada) | 3 | **104** | **0** (0%) | 0 | §4 |
| `B` | 5 | **85** | **39** (18,8%) | 0 | §4 |
| `C` | 10 | **30** | **72** (34,8%) | **2** | §4 |

Referência do vizinho: `messages` = **50 módulos / 9.313 linhas**, de 12 contextos
`[DOC: docs/decisoes-do-owner.md, medição de 2026-09-03]`.

**⇒ Nenhuma opção abaixo de 10 contextos põe o maior contexto sob os 50 do vizinho.**
Isto é o achado que eu preciso entregar sem enfeitar: **`A` e `B` reduzem o problema; não o
resolvem.** `A` tira 15%; `B` tira 33%; só `C` tira 76%, e cobra 34,8% das arestas.

---

## 5. As arestas que cruzariam a fronteira — número e comando

O comando canônico, que produz todos os números deste estudo a partir do grafo real:

```bash
cd backend && PYTHONPATH=$PWD ./.venv/bin/python - <<'PY'
import grimp, collections
g = grimp.build_graph("src", include_external_packages=False)
P = "src.modules.sentimento."
mods = [m[len(P):] for m in g.modules if m.startswith(P)]
E = [(a, b[len(P):]) for a in mods for b in g.find_modules_directly_imported_by(P+a)
     if b.startswith(P)]
LABEL = {}   # <- a atribuicao da opcao escolhida (apendice B)
cross = [(a,b) for a,b in E if LABEL[a] != LABEL[b]]
print(len(cross), "de", len(E))
print(collections.Counter((LABEL[a], LABEL[b]) for a,b in cross))
PY
```

`[MEDIDO 2026-09-03, grimp 3.16]` — os scripts completos e executáveis estão no apêndice A.

### 5.1 As 39 arestas da `OPÇÃO B`, por par de contextos

| de → para | n | natureza |
|---|---|---|
| `ingestion` → `catalog` | **17** | consulta de identidade de série / universo de instrumento |
| `ingestion` → `registry` | **16** | escrita carimbada com proveniência |
| `catalog` → `registry` | **3** | `as_of_accessor` → `provenance`; `series_key` → `canonical_json`; `instrument_universe_snapshot` → `canonical_json` |
| `ingestion` → `cvd` | **2** | `stream_probe_outcome` → `binance_aggtrade_payload`; `probe_stream_quantity_fields` → `binance_aggtrade_payload` |
| `batch_etl` → `registry` | **1** | `dump_survivorship` → `ingest_record` |

**Todas descem.** Nenhuma exceção, nenhum `ignore_imports`.

### 5.2 O módulo mais compartilhado, e por que ele não é um contexto

```bash
# fan-in interno, top 5 (script $SCRATCH/an.py, apêndice A)
#  10 domain.provenance · 10 domain.quota_bucket · 9 domain.coinalyze_daily_series
#   6 domain.stream_probe_outcome · 6 domain.instrument_universe_snapshot
```

`[MEDIDO 2026-09-03, n=207 arestas]`

**O fan-in máximo é 10.** Não existe um "deus-módulo" — a maior dependência compartilhada é
importada por 10 dos 127. Agrupando `provenance` com seus vizinhos temáticos:

```bash
# $SCRATCH/cut.py: grupo 'provenance' (9 modulos)
# sai=1  entra=21  corte=22
```

**1 aresta saindo contra 21 entrando.** Essa assimetria é a assinatura de **núcleo compartilhado
/ linguagem publicada**, não de contexto-par. É o mesmo achado de §3.2 por outro caminho.

---

## 6. Custo de migração

### 6.1 Imports reescritos — medido por `grep` sobre o nome qualificado

O estilo de import deste repositório é 100% qualificado
(`from src.modules.sentimento.<camada>.<módulo> import X`), o que torna a contagem exata:

```bash
grep -rhoE 'from src\.modules\.sentimento[a-z_.]* import' backend/src backend/tests \
  --include='*.py' | sort | uniq -c | sort -rn | head -3
#  23 from src.modules.sentimento.domain.provenance import
#  20 from src.modules.sentimento.domain.coinalyze_daily_series import
#  16 from src.modules.sentimento.domain.quota_bucket import
```

Cada módulo que muda de contexto tem **todas** as suas referências reescritas:

```bash
# $SCRATCH/cost.py — para cada modulo movido, conta as linhas que o nomeiam
```

| opção | módulos que mudam de caminho | imports em `src` | imports em `tests` | **total** | arquivos tocados |
|---|---|---|---|---|---|
| `A` (3 contextos, ampliada) | 23 | 30 | 72 | **102** | **42** |
| `B` (5 contextos) | 42 | 84 | 152 | **236** | **131** |

`[MEDIDO 2026-09-03, n=42 módulos / 236 linhas]`

Decomposto por contexto, na `OPÇÃO B`:

| contexto | n módulos | imports (src / tests) | arquivos |
|---|---|---|---|
| `registry` | 5 | 47 (22 / 25) | 42 |
| `catalog` | 12 | 83 (30 / 53) | 52 |
| `cvd` | 7 | 19 (7 / 12) | 14 |
| `batch_etl` | 18 | 87 (25 / 62) | 32 |

**Observação sobre a natureza do trabalho, e ela reduz o susto:** os 236 são reescrita de
**prefixo de caminho**, mecânica e verificável por `mypy --strict` + `pytest` — não é
redesenho. **1,8 imports por módulo movido** é reflexo direto da esparsidade de §2.

**A verificação pelo owner é o próprio portão:** `make verify` depois da reescrita. Import
errado quebra a importação, e a importação reprova. **Esta é a classe de mudança em que os
portões existentes bastam** — ao contrário do que §7 descreve.

### 6.2 Os 9 caminhos em STRING literal, que `sed` de import não alcança

```bash
grep -rnE '"src\.modules\.sentimento' backend/tests backend/src --include='*.py'
# test_ingest_health_query.py:377   assert ...logger.name == "src.modules.sentimento.infra.ingest_health_cli"
# test_ingest_health_contract_guards.py:37   CLI_MODULE = "src.modules.sentimento.infra.ingest_health_cli"
# test_ingest_record_durability.py:26        CLI_MODULE = "src.modules.sentimento.infra.ingest_health_cli"
# test_premium_index_infra.py  (6x)  "src.modules.sentimento.infra.premium_index_probe_cli.<Classe>"
```

`[MEDIDO 2026-09-03, n=9 linhas em 4 arquivos]`

**Nenhum dos 9 está em módulo que `A` ou `B` movem** (`ingest_health_cli` e
`premium_index_probe_cli` ficam em `ingestion` nas duas opções) `[MEDIDO]`. **E se estivessem,
falhariam ALTO** — asserção de teste e `monkeypatch.setattr` com caminho inexistente levantam.
São custo conhecido e ruidoso, não risco silencioso. Na `OPÇÃO C` isto precisa ser remedido.

### 6.3 O efeito em `containers = ["src.modules.sentimento"]`

**Contrato 1** (`backend/pyproject.toml:202-207`, `layers`, `infra > use_cases > domain`).
O comentário do próprio arquivo já antecipa: *"Quem criar o segundo contexto ACRESCENTA a linha
aqui — e o contrato NAO o cobre ate que ela exista, porque `exhaustive = false` nao inventa
container"* `[DOC: backend/pyproject.toml:197-200]`.

**Medi o modo de falha, e ele é ALTO — o que é a boa notícia:**

```bash
# $SCRATCH/il_ghost2.toml: containers = ["src.modules.sentimento", "src.modules.catalog"]
cd backend && PYTHONPATH=$PWD ./.venv/bin/lint-imports --config $SCRATCH/il_ghost2.toml
# Missing layer in container 'src.modules.catalog': module src.modules.catalog.infra does not exist.
# rc != 0
```

`[MEDIDO 2026-09-03, import-linter 2.14]`

⇒ **contrato `layers` com container inexistente REPROVA nomeando o container.** Não há
janela silenciosa: se o nome entra e a pasta não existe, o portão para. Idem para
`source_modules`:

```bash
# $SCRATCH/il_ghost.toml: source_modules = ["src.modules.catalog.domain", "src.modules.registry.domain"]
# Module 'src.modules.registry.domain' does not exist.   rc=1
```

`[MEDIDO 2026-09-03]`

### 6.4 O efeito em `[code_paths]` e `[agents.by_component]` — e aqui eu confirmo a correção do `/architect`

`docs/decisoes-do-owner.md` traz uma **autocorreção** do `/architect`: o rótulo de componente
afeta **só** `components` + `[agents.by_component]`, e **não** `[code_paths]`/`require-code`.
**Confirmo, com meu próprio comando, sobre um caminho de contexto que não existe:**

```bash
harness code-paths classify backend/src/modules/catalog/domain/series_key.py
# producao: backend/src/modules/catalog/domain/series_key.py — include_prefixes + include_globs
#           casam e nada exclui
```

`[MEDIDO 2026-09-03, V-16]`

⇒ **`[code_paths]` é indiferente ao nome do contexto.** `include_prefixes` é
`["backend/src/", "backend/tests/", "frontend/src/"]` e o prefixo casa qualquer contexto novo.
**Custo da partição em `code_paths`: zero.**

O efeito real, e ele é ato de owner:

```bash
harness policy --key components
# ["sentimento", "charts", "convergencia", "backtest", "web", "docs"]
harness policy --key agents.by_component
# {"backtest": {...}, "charts": {...}, "convergencia": {...}, "sentimento": {...}, "web": {...}}
harness policy --key agents
# {"by_component": {...}, "roles": {"dispatch_protocol": "..."}}   <- NAO existe architect de topo
```

`[MEDIDO 2026-09-03, V-16]`

**Não existe `architect` no nível de topo.** ⇒ contexto novo cujo nome **não** entre em
`components` + `[agents.by_component]` é **componente sem dono de julgamento** — exatamente o
modo de falha que `ADR-003:11-13` nomeia, e `ADR-009/F-D6-6` já registra a variante ainda pior
(*"o rótulo existe, então ninguém procura o dono"*).

**⇒ Partir `sentimento` exige editar o vocabulário fechado, que é ato do owner** (`CLAUDE.md`
§*"Vocabulário fechado de componentes"*): **+2 nomes** na `OPÇÃO A`, **+4** na `B`, **+9** na `C`.
E cada nome precisa de linha em `[agents.by_component]` — `quant-architect` para todos os que
este estudo propõe, porque todos são domínio quantitativo.

---

## 7. O que a partição QUEBRA que hoje funciona — **achei 2, e uma delas é silenciosa**

### 7.1 ⛔ QUEBRA SILENCIOSA — `ADR-009/D6.3` contrato (4), o portão que nasceu ontem

`ADR-009/D6.3` declara, para a camada de API que `D6` acabou de pôr fora do contexto:

```toml
# (4) PROFUNDIDADE: o consumidor fala com use_cases/domain, nunca com a infra de um contexto.
[[tool.importlinter.contracts]]
name = "Consumidor nao importa infra de contexto: o adaptador vem por injecao"
type = "forbidden"
source_modules = ["src.api", "src.jobs"]
forbidden_modules = ["src.modules.sentimento.infra"]
```

`[DOC: docs/adr/ADR-009*.md §D6.3]`

**`forbidden_modules` apontando para módulo inexistente devolve `KEPT`, `0 broken`, `rc=0`.**
Medido por mim, não citado do comentário:

```bash
# $SCRATCH/il_ghost3.toml:
#   source_modules   = ["src.modules.sentimento.domain"]
#   forbidden_modules = ["src.modules.catalog.infra", "src.modules.batch_etl.infra"]
cd backend && PYTHONPATH=$PWD ./.venv/bin/lint-imports --config $SCRATCH/il_ghost3.toml
# GHOST forbidden_modules: infra de contexto que NAO existe no disco   KEPT
# Contracts: 1 kept, 0 broken.
```

`[MEDIDO 2026-09-03, import-linter 2.14]`

E a partição move `infra` para fora daquele caminho:

```bash
# $SCRATCH/cost.py, sobre a atribuicao da OPCAO B
# infra que MOVE: 11  -> {'4_batch_etl': 9, '3_cvd': 2}
#   aggtrade_csv_reader, aggtrade_rest_snapshot_reader, binance_dump_bucket_listing_client,
#   checksummed_file_payload, content_dedupe_store, content_deduping_worker, dump_etl_cli,
#   dump_ingest_worker, file_etl_worker, head_probe_log, jsonl_checkpoint
# infra total hoje: 48 -> fica em sentimento: 37
```

`[MEDIDO 2026-09-03, n=48 módulos de infra]`

**O defeito, montado:** se a partição acontecer **depois** de o contrato (4) existir,
`src.modules.sentimento.infra` **continua existindo** (37 módulos ficam) ⇒ nenhum erro de
módulo-inexistente ⇒ o contrato segue `KEPT`. Mas `src/api/` passa a poder importar
`src.modules.batch_etl.infra` e `src.modules.cvd.infra` — **11 módulos** — e o portão **diz que
está tudo bem**. É a ambiguidade de `rc=0` que `ADR-012` nomeia: *sinal indistinguível entre
"nada violou" e "o instrumento não é capaz de ver"*.

**⇒ Isto é um argumento de ORDEM, não de mérito:** partir **antes** de o contrato (4) ser
escrito faz o defeito não existir, porque (4) nasce com todos os nomes. Partir **depois** abre
o buraco. E `F-D6-1` mede que a camada **ainda não existe** (`0`) `[DOC: ADR-009 §Falsificador]`
⇒ **a janela está aberta hoje.**

**Como o owner verifica** `[NÃO MEDIDO — receita, porque exige mover arquivo]`: depois da
partição, plantar `from src.modules.batch_etl.infra.dump_etl_cli import X` em `src/api/` e
rodar `make boundaries`. **`KEPT` = o portão perdeu os 11 módulos.**

### 7.2 ⛔ QUEBRA SILENCIOSA — contrato 3 (`natureza`) perde 39% do universo · **e o gêmeo dele NÃO quebra**

`backend/pyproject.toml:274-281`, contrato 3, `forbidden`:

```toml
source_modules = ["src.modules.sentimento.domain", "src.modules.sentimento.use_cases"]
forbidden_modules = ["socket", "ssl"]
```

Os dois pacotes-fonte **continuam existindo** depois da partição ⇒ nenhum erro. Mas o universo
encolhe:

```bash
# $SCRATCH (arquivos de domain/ e use_cases/ que trocam de contexto na OPCAO B)
# universo do contrato 3 hoje: 79 modulos -> depois da particao: 48 (60%)
# os 31 que saem: {'2_catalog': 12, '4_batch_etl': 9, '1_registry': 5, '3_cvd': 5}
```

`[MEDIDO 2026-09-03, n=79 módulos de domain/ + use_cases/]`

**39% do universo do contrato sai da cobertura, e o veredito continua `rc=0`.**

**E o achado que salva metade do problema:** o portão *gêmeo* — `make natureza`, o scanner de
AST que guarda a mesma classe de propriedade por USO (`ADR-016/D4`) — **é imune, por
construção**:

```bash
sed -n '17,19p' backend/scripts/natureza.sh
# DIRS=()
# for d in "$BACKEND"/src/modules/*/domain "$BACKEND"/src/modules/*/use_cases; do
#     [ -d "$d" ] && DIRS+=("$d")
```

`[MEDIDO 2026-09-03: backend/scripts/natureza.sh:17-19]`

**`natureza.sh` usa GLOB (`src/modules/*/domain`) ⇒ cobre todo contexto novo automaticamente,
sem edição.** Dois portões guardando propriedades vizinhas, um por glob e um por enumeração: o
glob sobrevive à partição, o enumerado encolhe em silêncio. **O custo da partição está
concentrado exatamente nos contratos enumerados** — e §7.3 mostra que ele é evitável.

### 7.3 ✅ A MITIGAÇÃO, e ela é o achado mais acionável deste estudo

**`import-linter` 2.14 aceita wildcard `*` em `source_modules` E em `containers`.** Provei as
**duas metades**, porque `KEPT` com wildcard poderia significar *"não casou com nada"* — que
seria a mesma armadilha de §7.1 em roupa nova:

```bash
# CALA — src.modules.*.domain nao fala socket/ssl (verdade hoje)
# $SCRATCH/il_wild.toml   -> "WILDCARD em source_modules  KEPT" · 1 kept, 0 broken

# MORDE — src.modules.*.infra nao fala socket/ssl (FALSO hoje: infra fala)
# $SCRATCH/il_wild2.toml  -> BROKEN · 0 kept, 1 broken
#   src.modules.sentimento.infra is not allowed to import socket:
#   -   src.modules.sentimento.infra.binance_stream_probe -> socket (l.14)
#   -   src.modules.sentimento.infra.redis_resp_client    -> socket (l.20)

# MORDE — containers = ["src.modules.*"] com as camadas INVERTIDAS
# $SCRATCH/il_wild4.toml  -> BROKEN · 0 kept, 1 broken
#   src.modules.sentimento.infra is not allowed to import ...
#   - src.modules.sentimento.infra.dump_etl_cli -> ...
```

`[MEDIDO 2026-09-03, import-linter 2.14; a sintaxe está em
backend/.venv/lib/python3.13/site-packages/importlinter/domain/imports.py:91,104-105 —
"Sets of modules are notated using * or ** wildcards"]`

**⇒ A migração de contrato da partição é trocar `sentimento` por `*` em 3 lugares, e ela pode
ser paga ANTES de qualquer arquivo se mover:**

| contrato | hoje | com wildcard |
|---|---|---|
| 1 (`layers` por contexto) | `containers = ["src.modules.sentimento"]` | `containers = ["src.modules.*"]` |
| 3 (`natureza`) | `source_modules = ["src.modules.sentimento.domain", "…use_cases"]` | `source_modules = ["src.modules.*.domain", "src.modules.*.use_cases"]` |
| 4 (`ADR-009/D6.3`) | `forbidden_modules = ["src.modules.sentimento.infra"]` | `forbidden_modules = ["src.modules.*.infra"]` |

**Feito nessa ordem, as duas quebras de §7.1 e §7.2 deixam de existir** — e a troca é
**verificável hoje, sem partir nada**: aplicar o wildcard na árvore como está e observar que o
veredito de `make boundaries` **não muda** (o wildcard casa exatamente um contexto hoje).
`[NÃO MEDIDO contra backend/pyproject.toml — eu sou read-only sobre ele; medido contra config
equivalente em $SCRATCH]`

> ⚠️ **A troca no contrato 2 NÃO é wildcard, e a diferença importa.** O contrato 2
> (`forbidden`: `sentimento` não importa `charts`/`convergencia`/`backtest`) é o único cuja
> lista de proibidos **precisa** crescer nome a nome — `src.modules.*` proibiria o contexto de
> importar a si mesmo. `[INFERRED: da semântica de `forbidden` medida em §7.1; NÃO testei este
> caso específico]`. E o comentário do arquivo já registra que aquele contrato está **dormente
> e armado**, com o lado "cala" **vácuo** `[DOC: backend/pyproject.toml:216-222]` — a partição
> é o evento que o **desvacua**, porque os contextos irmãos passam a existir no disco. **Isso é
> um ganho da partição, não um custo.**

### 7.4 ✅ O que eu procurei e **NÃO** quebra — declarado, porque ausência sem busca não é evidência

| instrumento | por que sobrevive | força |
|---|---|---|
| `[code_paths]` / `require-code` | prefixo, não nome de contexto: `classify …/catalog/…` → `producao` | `[MEDIDO]` §6.4 |
| `make natureza` (`ADR-016/D4`) | glob `src/modules/*/domain` | `[MEDIDO]` §7.2 |
| `check-coverage-layers.sh` (metas 90/80/70) | casa `"/domain/"`, `"/use_cases/"`, `"/infra/"` — indiferente ao contexto, **desde que cada contexto novo mantenha os 3 nomes de camada** | `[MEDIDO: backend/scripts/check-coverage-layers.sh:51-53,59]` |
| `test.sh` / `lint.sh` | `pytest --cov=src`, sem caminho de contexto | `[MEDIDO: backend/scripts/test.sh]` |
| contrato 1 e `source_modules` em geral | reprovam **alto** com módulo inexistente | `[MEDIDO]` §6.3 |
| os 9 caminhos em string | nenhum em módulo movido por `A`/`B`; e falhariam alto | `[MEDIDO]` §6.2 |
| falsificador de idioma do `CLAUDE.md` | ele mede **segmento em português**. `catalog`, `registry`, `cvd`, `batch_etl` são inglês ⇒ o veredito não muda | `[MEDIDO]` abaixo |

> **📌 Achado colateral, e eu o registro porque é a disciplina de `CLAUDE.md`, não porque é meu
> escopo:** o falsificador de idioma do `CLAUDE.md` declara *"Hoje: 14 segmentos, e exatamente 1
> em português — `painel`"* `[DOC: CLAUDE.md, medido em 77cf178]`. **Hoje ele devolve 18
> segmentos e ZERO em português** — `painel` já é `panel`:
>
> ```bash
> git ls-tree -r --name-only HEAD | grep -E '^(backend/src|backend/tests|frontend/src)/' \
>   | awk -F/ '{for(i=1;i<NF;i++) print $i}' | sort -u | wc -l    # 18
> # e a lista nao-casante: app backend components domain features frontend helpers infra
> #   modules panel s1-console s3-inspector src tests ui use_cases   <- 'panel', em ingles
> ```
>
> `[MEDIDO 2026-09-03 em 8c002e4, n=18 segmentos]` — o baseline do `CLAUDE.md` está **vencido**
> (a fase `03` já rodou). **Não é ato meu corrigir `CLAUDE.md`.** Dono: **owner**.

---

## 8. A alternativa de NÃO PARTIR — o custo dela, e o gatilho que a reabre

**Ela é defensável hoje, e eu não a apresento como palha.** Os argumentos a favor, todos medidos:

1. **O grafo não está doente.** DAG, 0 ciclos, fan-in máximo 10, densidade 1,63. Contexto grande
   **não é** contexto emaranhado, e a métrica que mediria emaranhamento diz que ele não existe
   `[MEDIDO]` §2.
2. **`sentimento` é ilha fechada** — 0 arestas para fora, 0 de fora. Nenhum consumidor sofre com
   o tamanho, porque não há consumidor `[MEDIDO]` §2.1.
3. **Os portões que importam não são cegos ao tamanho.** `natureza` (glob), `check-coverage-layers`
   (por camada) e o contrato 1 (por camada dentro do container) funcionam igual com 131 ou 300
   módulos `[MEDIDO]` §7.4.
4. **`A` e `B` não resolvem o problema declarado.** Se o critério é *"≤ 50, como o vizinho"*, só
   `C` (10 contextos, 34,8% das arestas cruzando, 2 ciclos) chega lá `[MEDIDO]` §4.
5. **21 tasks restantes** no plano. Partir agora reescreve 236 imports que 21 tasks vão continuar
   escrevendo — e o rebase de task em vôo é custo não contabilizado nos 236 `[MEDIDO]` §1.

### O custo de não partir, declarado

| custo | força |
|---|---|
| **A invariante do CVD continua sem portão.** *"CVD do lado agressor de `aggTrade`, nunca de OHLCV"* é hoje **disciplina**, não mecanismo — e disciplina não é mecanismo é o argumento exato com que o contrato 3 nasceu (`backend/pyproject.toml:245-247`). Contexto separado transforma a invariante em `forbidden` com par morde/cala. **Este é, na minha leitura, o único ganho de PRODUTO da partição; os outros são de manutenção.** | `[INFERRED: da razão declarada do contrato 3 + a medição de 0 arestas cruzando `WCC2` em §2.3]` |
| **O custo cresce monotonicamente e o gatilho de fechamento é datado:** quando `src/api/` nascer (fase `05`), a partição passa a mover também os imports do consumidor, e §7.1 vira buraco real em vez de hipótese. | `[MEDIDO: F-D6-1 = 0 hoje]` |
| **A projeção é ~174 módulos ao fim do plano** — 3,5× o vizinho. | `[INFERRED]` §1 |
| **`arquitetura-fluxos.md` continua afirmando 3 contextos que o código não tem**, com 33 arestas que o diagrama não desenha. Documento e código divergindo é o defeito que `CLAUDE.md` diz que esta disciplina existe para pegar. | `[MEDIDO]` §3.1 |

### O GATILHO que reabre a decisão — três, e qualquer um basta

Escritos para serem **rodados**, não interpretados. Nenhum deles é opinião sobre tamanho.

| # | gatilho | comando | limiar |
|---|---|---|---|
| **G1** | **um ciclo de import aparece** — o grafo deixa de ser DAG. É o sinal de que a fronteira interna sumiu, e a partir dele partir custa **redesenho**, não `sed`. | `$SCRATCH/dag.py` (apêndice A) | **`SCCs com >1 modulo` ≥ 1** ⇒ reabrir imediatamente |
| **G2** | **o fan-in de um módulo passa de 15** — nasceu um deus-módulo, e ele não tem corte barato. Hoje o máximo é **10** `[MEDIDO]`. | `$SCRATCH/an.py` (apêndice A) | **`max(fan-in) > 15`** |
| **G3** | **`src/api/` nasce** — a janela barata fecha. | `find backend/src/api backend/src/jobs -name '*.py' \| wc -l` | **`≥ 1`** ⇒ decidir **antes** que o contrato (4) de `ADR-009/D6.3` seja escrito com nome enumerado, **ou** escrevê-lo já com wildcard (§7.3) |

> **`G3` é o único com relógio de calendário, e ele é curto:** a fase `05` é a que constrói a
> fatia visível, e `ADR-009/D6` foi emendada **ontem** para pôr a API fora do contexto.
> `[MEDIDO: F-D6-1 → 0, a camada não existe]`

### O caminho intermediário, que eu apresento porque é o mais barato dos três

**Aplicar só o wildcard de §7.3, hoje, sem mover arquivo nenhum.** Custo: 3 linhas de
`backend/pyproject.toml`. Ganho: as duas quebras de §7.1/§7.2 deixam de ser possíveis, e a
decisão de partir fica **reversível e sem relógio** — `G3` para de ser gatilho de urgência.
**Isto não é partir nem manter; é remover o custo de irreversibilidade da escolha.**
`[OPINIÃO do quant-architect, rotulada: a medição de §7.3 é `[MEDIDO]`, mas "é o melhor primeiro
passo" é julgamento meu]`

---

## 9. `ADR-009 §D6` — a partição a afeta? **Sim, em 3 pontos, e um deles é ordem**

`D6` decidiu (2026-09-03) que a camada de API/worker vive **fora** de bounded context e consome
os contextos por injeção `[DOC: ADR-009 §D6.2]`.

| ponto | efeito da partição | força |
|---|---|---|
| **`D6.2` — a DECISÃO** | **não é afetada.** *"A camada de API não é parte de bounded context"* é indiferente ao número de contextos; ela fica igualmente fora de 1 ou de 5. A partição **reforça** `D6.2`: quanto mais contextos, mais a injeção por raiz de composição paga por si. | `[INFERRED: da leitura de D6.2; nenhuma cláusula dela cita a cardinalidade dos contextos]` |
| **`D6.3` contrato (3)** — `layers = ["main", "api \| jobs", "modules"]`, `containers = ["src"]` | **não é afetado.** O nível é `modules` (o pacote inteiro), não `modules.sentimento`. Contexto novo entra debaixo dele **automaticamente**. É o mesmo padrão de glob de §7.2 que salva o `natureza`. | `[MEDIDO: a leitura do contrato + o teste de wildcard em containers, §7.3]` |
| **`D6.3` contrato (4)** — `forbidden_modules = ["src.modules.sentimento.infra"]` | **⛔ É AFETADO, e em silêncio.** §7.1: 11 módulos de `infra` saem da cobertura e o portão devolve `KEPT`. **Mitigação de uma palavra:** `["src.modules.*.infra"]`, provado morde+cala em §7.3. | `[MEDIDO]` §7.1, §7.3 |
| **`F-D6-2`** — o par morde/cala do contrato (4), hoje `[NÃO MEDIDO]` na ADR | **é afetado no ENUNCIADO.** O falsificador manda plantar um import `src.api → src.modules.sentimento.infra`. Com a partição e sem wildcard, esse par **passa** e o portão continua cego para os outros contextos ⇒ o falsificador **calaria enquanto a propriedade está violada**. | `[INFERRED: da composição de F-D6-2 com a medição de §7.1]` |
| **`D6.4`** — a tabela do que `D6` não decide | **já nomeia esta pergunta**, com dono **owner** assessorado pelo `quant-architect`, e com o relógio de retrabalho *"contrato + imports"*. Este estudo é o assessoramento. **`D6.4` continua não decidindo, e eu também não.** | `[DOC: ADR-009 §D6.4]` |

**⇒ A recomendação de ORDEM, que é o único ponto em que eu sou assertivo:** se a `OPÇÃO A`, `B`
ou `C` for escolhida algum dia, **o contrato (4) de `D6.3` deve nascer com wildcard**, não com
`sentimento` enumerado. Custo hoje: uma palavra. Custo depois: um portão que diz `KEPT` sobre
uma propriedade violada — e `ADR-012` já nomeia essa classe como a pior.
**Como o owner verifica:** §7.3, os três `--config` de `$SCRATCH`, reproduzíveis do apêndice A.

---

## 10. `[NÃO SEI]` — explícito, com dono

| # | o que eu não sei | por que não medi | dono |
|---|---|---|---|
| `N1` | Se `ingestion` (85 módulos na `OPÇÃO B`) tem uma fronteira interna **de invariante** que eu não vi. Eu testei 5 recortes temáticos (`quota`, `clock`, `liquidation`, `availability`, `transport`) e todos cortam **11–13 arestas** — nenhum é o corte livre que `WCC1`/`WCC2` são. | Achar corte mínimo em grafo é NP-difícil no geral; eu testei hipóteses nomeadas, não busquei exaustivamente. **Não afirmo que não existe.** | `quant-architect` — reabrir se `G1`/`G2` disparar |
| `N2` | Se `catalog` e `registry` devem ser **dois** contextos ou **um** núcleo compartilhado. Medi que como dois eles são separáveis **se** `canonical_json` descer (§3.2) — mas *"dois níveis contra um"* é escolha de granularidade, não fato do grafo. | O grafo permite as duas; a diferença é de custo de governança (+1 nome no vocabulário fechado), não de import. | **owner** (é edição do vocabulário fechado) |
| `N3` | O custo de **rebase das 21 tasks restantes** se a partição acontecer no meio do plano. Os 236 imports de §6.1 são a árvore de HOJE. | Exigiria ler as 21 tasks e projetar os módulos que elas criam — e `tasks.toml` é leitura, mas a projeção seria `[INFERRED]` sobre `[INFERRED]`. | `tech-lead` / **owner** |
| `N4` | Se o contrato 2 (`forbidden` entre contextos irmãos) precisa de **uma entrada por par** (`O(n²)`) ou se `src.modules.*` com exclusão funciona. Registrei em §7.3 como `[INFERRED]` e **não testei**. | Testável em ~5 min com um `--config` de `$SCRATCH`; ficou fora porque não altera nenhuma das 3 opções. | `quant-architect` — antes de qualquer partição |
| `N5` | Quem possui `docs/arquitetura-fluxos.md` e portanto quem corrige a divergência de §3.1. | Procurei dono declarado no documento e não achei. | **owner** |
| `N6` | Se a escolha entre `A`, `B` e `C` deve ser feita por *"número de módulos"* — o critério que o vizinho sugere. Eu **não julgo** se 50 é o número certo; entreguei a curva. | É preferência de manutenção do owner, não propriedade do código. | **owner** |

---

## Apêndice A — os scripts, reproduzíveis

Todos rodam com `cd backend && PYTHONPATH=$PWD ./.venv/bin/python <script>` e leem um JSON do
grafo produzido por `graph.py`. Eles viveram em
`$SCRATCH = /tmp/claude-1002/<sessão>/scratchpad/` e **não** foram versionados (dado
intermediário, `CLAUDE.md` §*"Dado bruto não é versionado"*). Reconstrução, em ordem:

| script | o que produz | seção |
|---|---|---|
| `graph.py` | `g.json` — 131 módulos, 207 arestas, 0 entrando, 0 saindo | §2 |
| `an.py` | fan-in/fan-out, top 20 | §5.2 |
| `wcc.py` | os 11 componentes fracamente conexos | §2.3 |
| `dag.py` | Tarjan SCC + profundidade — **é o `G1`** | §2.2, §8 |
| `part.py` | `H1` (a hipótese do doc): 32 arestas, 3 ciclos | §3.1 |
| `comps.py` | fecho descendente do núcleo: 17 módulos, 0 subindo | §3.2 |
| `cut.py` | corte de cada recorte temático (11–13 arestas) | §10 `N1` |
| `h3.py` | `OPÇÃO B`: 39 arestas, 0 ciclos, 0 subindo | §4 |
| `h4.py` | `OPÇÃO C`: 72 arestas, 2 ciclos | §4 |
| `cost.py` | imports reescritos: 96 (`A`) / 236 (`B`) | §6.1 |
| `il_ghost.toml`, `il_ghost2.toml`, `il_ghost3.toml` | modo de falha de `source_modules` (alto) × `forbidden_modules` (**silencioso**) | §6.3, §7.1 |
| `il_wild.toml`, `il_wild2.toml`, `il_wild4.toml` | wildcard: **cala** e **morde**, nas duas posições | §7.3 |

O núcleo de todos eles é o bloco de `grimp` de §5, mais um dicionário de atribuição.

## Apêndice B — a atribuição módulo → contexto

`OPÇÃO B`, os 42 módulos que mudam de caminho. Os 85 restantes ficam em `sentimento`.

**`registry` (5)** — `domain/`: `provenance`, `ingest_record`, `metrics_shift`, `schema_change`,
`canonical_json`

**`catalog` (12)** — `domain/`: `series_key`, `series_catalog`, `cvd_source_catalog`,
`price_source_catalog`, `open_interest_catalog`, `as_of_accessor`, `instrument_alias`,
`instrument_universe_snapshot`, `universe_at`, `quarantine_terms`, `quarantined_series_entry`,
`coinalyze_daily_series`

**`cvd` (7)** — `domain/`: `cvd`, `aggtrade_bucket_aggregate`, `aggtrade_contiguity`,
`qnq_divergence`, `binance_aggtrade_payload` · `infra/`: `aggtrade_csv_reader`,
`aggtrade_rest_snapshot_reader`

**`batch_etl` (18)** — `domain/`: `checksum_manifest`, `content_dedupe`, `dump_window`,
`etl_backlog`, `retention_probe`, `dump_survivorship`, `s3_bucket_listing` · `use_cases/`:
`drain_etl_backlog`, `ingest_verified_payload` · `infra/`: `checksummed_file_payload`,
`content_dedupe_store`, `content_deduping_worker`, `dump_etl_cli`, `dump_ingest_worker`,
`file_etl_worker`, `head_probe_log`, `jsonl_checkpoint`, `binance_dump_bucket_listing_client`

**Na `OPÇÃO A` (ampliada), 23 módulos saem** — `cvd` (6) e `batch_etl` (17) desta tabela
**menos** `binance_aggtrade_payload` e `dump_survivorship`, que na `A` ficam em `sentimento`
porque cada um deles custaria aresta cruzada (§4): `stream_probe_outcome →
binance_aggtrade_payload` e `dump_survivorship → ingest_record`. Daí os **23** de §6.1.
