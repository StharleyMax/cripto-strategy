# PRD-007 — Cinco métricas do CORE: uma fase = uma métrica ponta a ponta, com ponto visível na tela

> Feature: `cinco-metricas-do-core` (filha de `plataforma-dados`).
> Componentes tocados: `sentimento` · `infra` · `web` (`harness policy --key components`).
> Estado no ledger ao escrever este documento: `INIT` (`harness pipeline state cinco-metricas-do-core` → `INIT`, `[MEDIDO 2026-09-10]`).
> Árvore de referência: `8dc8941` (`git rev-parse --short HEAD`).

## 0. Como ler este documento

Todo número carrega o comando que o produziu, o universo (`n`) e um rótulo de força, conforme
`CLAUDE.md` §*"Nenhum número sem o comando que o produziu"*. As três decisões do owner
(**D1**, **D2**, **D3**) estão em
[`docs/context/cinco-metricas-do-core/handoff/DECISOES-OWNER.md`](../context/cinco-metricas-do-core/handoff/DECISOES-OWNER.md)
e **não são reabertas aqui** — este PRD as consome, não as discute. Os números do estado atual estão em
[`DIAGNOSTICO.md`](../context/cinco-metricas-do-core/handoff/DIAGNOSTICO.md); os que este PRD mediu por
conta própria estão marcados com o comando na própria linha.

Este PRD **não** contém SPEC, ADR, plano de fases nem tasks — isso é `/architect` e `/tech-lead`.
Ele também **não** decide a ordem das fatias 2–5 (D1 devolve isso ao `/architect`).

---

## 1. Contexto e problema

### 1.1 A queixa que abriu a feature — citação literal do owner

> *"Estou sentindo que estamos rodando em circulo nessa aplicação e não estamos conseguindo evoluir.
> Contruimos um painel que entrega nada, um monte de CLI q se comunica com nada. Sendo que desde o
> começo foi falado que essa fase de fundação era extração mais o gráfico … porém a entrega sempre foi
> ter um gráfico com os dados de volume, open interes, long short ration, liguidação e cvd. Esse é o
> CORE a proposta de desenvolvimento deveria convergir para isso desde o momento 0 … Cada fase deve ter
> uma entrega de valor, mesmo que mínima."*

`[PREMISSA-OWNER: 2026-09-10]` — literal, na grafia do owner.

### 1.2 O CORE, enumerado

O CORE são **5 métricas**, e a lista é fechada por esta feature:

| # | métrica | nome na fala do owner |
|---|---|---|
| M1 | **volume** | *"volume"* |
| M2 | **open interest** | *"open interes"* |
| M3 | **long/short ratio** | *"long short ration"* |
| M4 | **liquidações** | *"liguidação"* |
| M5 | **CVD** (cumulative volume delta) | *"cvd"* |

### 1.3 O estado medido: as 5 têm ZERO linha

`[MEDIDO 2026-09-10, n=23.512 linhas em `md.series`; DOC: DIAGNOSTICO.md §*"O que md.series contém"*]`

```
docker exec deploy-api-1 python -c "... select series_key_id,symbol,source,count(*) from md.series group by 1,2,3"
```

| source | series keys | linhas |
|---|---|---|
| `/fapi/v1/premiumIndex` | 8 | 23.512 |
| **todo o resto** | **0** | **0** |

`premiumIndex` é funding/mark price — **não é nenhuma das 5**. Portanto: **M1..M5 = 0 linha cada**.

Corolário medido na camada de coleta: só existem **2 séries de coletor declaradas**, e nenhuma das duas
é do CORE — `[MEDIDO 2026-09-10, n=2 linhas]`:

```
docker exec deploy-api-1 python -c "import json,urllib.request; d=json.load(urllib.request.urlopen('http://localhost:8000/api/v1/collector-status')); print(d['n_rows'], [r['endpoint'] for r in d['rows']])"
# 2  ['/fapi/v1/premiumIndex', '/stream?streams=btcusdt@forceOrder/...']
```

### 1.4 Por que a tela está vazia — e não é bug de render

A página `/symbol` tem **3 painéis**: Preço (`klines_last`), Open Interest, CVD
`[MEDIDO 2026-09-10: `grep -c 'function .*Pane(' frontend/src/app/symbol/SymbolClient.tsx` → **3**
(`PricePane`, `OiPane`, `CvdPane`)]`. Nenhum dos 3 tem dado ⇒ os 3 exibem `SEM_PONTO`. A honestidade do dado funciona; o
que falta é o dado.

### 1.5 A causa estrutural

`plataforma-dados` foi decomposta **horizontalmente** (fase = camada: contrato, retenção, catálogo,
painel, observabilidade). **9 fases `QA=APPROVED` e nenhuma jamais precisou de um ponto na tela para
passar** `[DOC: DIAGNOSTICO.md §*"Causa estrutural"*]`. É a definição operacional de "andar em círculo":
o critério de aceite nunca tocou a entrega que o owner comprou.

---

## 2. Objetivo

Fazer o CORE **existir na tela**, uma métrica por vez, com o critério de aceite ancorado no ponto
renderizado — não na camada construída.

**Objetivo mensurável, e ele é o falsificador desta feature:** ao final de cada fase, o painel da
métrica daquela fase exibe `N > 0` pontos no DOM da aplicação real, e a mesma métrica tem `count(*) > 0`
em `md.series`. Hoje esse número é **0/5 métricas** `[MEDIDO 2026-09-10, §1.3]`.

---

## 3. Decisões já tomadas que este PRD NÃO reabre

| id | decisão | força |
|---|---|---|
| **D1** | Uma fase = **uma fatia vertical**: `coletor → writer → md.series → /api/v1/series-history → painel com ponto visível` | `[DECISÃO-OWNER: 2026-09-10, escolha entre 4 alternativas apresentadas]` |
| **D1.b** | **Fatia 1 = volume (klines)**, via REST `/fapi/v1/klines`, sem WebSocket e sem agregação de tick | `[DECISÃO-OWNER: 2026-09-10]` — custo declarado no menu e aceito |
| **D2** | **DoD-VERTICAL de 4 itens** é o gate de **toda** fase; qualquer item em 0 reprova | `[DECISÃO-OWNER: 2026-09-10, escolha entre 2 alternativas apresentadas]` |
| **D3** | `pagina-de-grafico-s2` → owner roda `advance DONE`; `coinalyze-fora-da-quarentena` **congelada** em `SPEC_DRAFT`; esta feature é **filha de `plataforma-dados`** | `[DECISÃO-OWNER: 2026-09-10, escolha entre 3 alternativas apresentadas]` |
| **P-infra** | VPS compartilhada, R2 free tier, só Postgres — **veta gigas de aggTrades** | `[PREMISSA-OWNER, registrada em memória de projeto]`, reiterada em `DECISOES-OWNER.md` §*"O que esta feature NÃO decide"* |
| **P-seed** | Nunca seedar dado de teste no Postgres compartilhado — e2e usa valor óbvio e limpa no mesmo gate | `[DOC: DECISOES-OWNER.md, aviso no D2]` |

**A alternativa que o owner recusou, e o número que a recusou:** o DoD só-de-API (SQL + HTTP, sem assert
de DOM) foi recusado porque **a fase 02 de `pagina-de-grafico-s2` passou exatamente assim e o dado não
chegava na tela** — quem achou o bug de wiring foi a fase 04, em uso ao vivo pelo owner
`[DOC: DECISOES-OWNER.md/D2]`.

---

## 4. Escopo

### 4.1 O que é uma fatia vertical (a unidade de fase)

Uma fatia entrega **uma** métrica atravessando **os cinco elos**:

1. **coletor** — a fonte da métrica é lida da exchange e publicada;
2. **writer** — o que foi publicado é persistido, **e contado** (ver `RF-4`);
3. **`md.series`** — a métrica tem linhas, com `series_key` registrada no catálogo;
4. **`/api/v1/series-history`** — a rota já existe (`backend/src/api/routes/series_history.py:47`,
   `[MEDIDO 2026-09-10]`) e devolve `n_points > 0` para a métrica;
5. **painel** — o ponto aparece no DOM da aplicação real.

**Elo ausente ⇒ fase incompleta**, mesmo que os outros quatro estejam verdes. É exatamente essa
conjunção que o DoD-VERTICAL (§6) transforma em comando.

### 4.2 Fatia 1 — volume (klines)

Decidida pelo owner (`D1.b`). REST `/fapi/v1/klines`. O painel *Preço* já existe na tela e o eixo de
preço é o que os outros dois painéis penduram — por isso volume é a fatia de menor risco de wiring.

**Coletores hoje declarados em `infra/`:** `collectors_cli.py` e `force_order_collector_cli.py`
`[MEDIDO 2026-09-10: `ls backend/src/modules/sentimento/infra/ | grep -i collect`, n=2]`. **Nenhum de
klines** ⇒ a fatia 1 cria o primeiro coletor de uma métrica do CORE.

### 4.3 Fatias 2–5 — as outras quatro métricas

Cada uma é uma fase, com o **mesmo** DoD-VERTICAL. **A ordem NÃO é decidida por este PRD** — é ato do
`/architect` (`D1`, última linha). Ver `[Q1]`.

O domínio de várias delas já existe e não precisa ser reescrito `[DOC: DIAGNOSTICO.md §*"O domínio
existe; o cano não"*]`: `aggtrade_bucket_aggregate.py`, `long_short_ratio_series.py`,
`cvd_source_catalog.py`, `binance_aggtrade_payload.py` em `backend/src/modules/sentimento/domain/`.
**O que falta é o cano, não a matemática.**

---

## 5. User stories — uma por fatia, fronteira explícita

Todas as stories têm o mesmo formato porque **a fatia é a unidade**; o que muda é a métrica.

- **US-1 (fatia 1, volume — decidida):** como operador, quero abrir `/symbol` e **ver volume plotado
  sobre dado real de produção**, para deixar de olhar uma tela que diz `SEM_PONTO` em tudo.
- **US-2..US-5 (fatias 2–5, ordem por `/architect`):** idem para **open interest**, **long/short
  ratio**, **liquidações** e **CVD**, uma métrica por fase.
- **US-6 (transversal, dentro da fatia 1):** como operador, quero que o painel de contabilidade diga a
  verdade sobre quantas linhas foram escritas, para conseguir distinguir *"não escreveu"* de
  *"não mede"* quando a próxima métrica falhar. (Origem: `D2`, item 4 — ver §7.1/`RF-4` e §8/`DEF-1`.)

**Fronteira — cada story cabe numa fase:** uma story = uma métrica = os 5 elos do §4.1. Nenhuma story
depende de outra métrica estar pronta; a única dependência transversal é `US-6`, que a fatia 1 paga uma
vez para todas.

---

## 6. O DoD-VERTICAL (D2) — critério de aceite de TODA fase, escrito de forma testável

**Vale para as 5 fatias, sem exceção. Qualquer item em 0 reprova a fase.**
`<M>` = a métrica da fase; `<key>` = a `series_key` dela (nome canônico é `[Q2]`, do `/architect`).

| id | item | comando (o que faz **calar**) | **morde** |
|---|---|---|---|
| **DoD-1** | Dado existe no Postgres real | `docker exec deploy-api-1 python -c "... select count(*) from md.series s join md.series_key k on ... where k.<discriminador> = '<key>'"` → **> 0** | `0` ⇒ o coletor/writer não fecharam o cano. Hoje **0 para as 5** `[MEDIDO 2026-09-10, §1.3]` |
| **DoD-2** | A API serve o dado | `GET /api/v1/series-history?<params de <key>>` → `n_points` **> 0** | `n_points = 0` com `DoD-1 > 0` ⇒ defeito de catálogo/parâmetro, não de coleta |
| **DoD-3** | **O ponto está na tela** — Playwright contra o app real | e2e abre a rota real, seleciona o painel de `<M>`, asserta **`N > 0` pontos no DOM** **e** que o painel **não** exibe `SEM_PONTO` | painel vazio ou `SEM_PONTO` ⇒ reprova mesmo com `DoD-1` e `DoD-2` verdes. É o item que a fase 02 de `pagina-de-grafico-s2` não tinha |
| **DoD-4** | A contabilidade do run é verdadeira | `GET /api/v1/ingest-health` → existe **≥ 1 run** da fonte de `<M>` com `n_written` **> 0** | `n_written = 0` com `DoD-1 > 0` ⇒ o campo mente. Hoje **100% dos runs têm `n_written=0`** `[MEDIDO 2026-09-10, n=2.910 runs; DOC: DIAGNOSTICO.md]` |

**Restrições de execução do `DoD-3`, herdadas e não negociáveis:**

- `[P-seed]` **Nunca seedar dado de teste no Postgres compartilhado.** O e2e usa valor óbvio e limpa no
  mesmo gate. Origem: dado sintético de e2e já vazou para a tela real do owner.
- O assert é de **dado no DOM**, nunca só status HTTP — lição registrada de `pagina-de-grafico-s2`.
- Executar contra o **app real**, não contra mock/fixture.

⚠️ **`DoD-3` sem `[P-seed]` é uma armadilha conhecida:** a forma mais fácil de fazer `DoD-3` calar é
plantar linha no Postgres compartilhado. Isso **reprova**, não aprova. Ver `[Q7]` (quantos dias de
backfill a fatia 1 precisa para ter ponto legítimo).

---

## 7. Requisitos

### 7.1 Funcionais

| id | requisito | fase |
|---|---|---|
| **RF-1** | Cada métrica do CORE tem um **coletor** que lê a fonte declarada e publica para o writer | uma por fatia |
| **RF-2** | Cada métrica tem **`series_key` registrada no catálogo**, de forma que `/api/v1/series-catalog` a liste e `/api/v1/series-history` a sirva | uma por fatia |
| **RF-3** | Cada métrica tem **painel** na página real, com a semântica de ausência já existente (`SEM_PONTO` quando não há dado — ausência **nunca** renderizada como zero) | uma por fatia |
| **RF-4** | O `n_written` de um run reflete **linhas efetivamente persistidas**, não um literal | **fatia 1** (paga uma vez para todas) |
| **RF-5** | Nenhum contrato já servido (`/collector-status`, `/ingest-health`, `/series-catalog`, `/series-history`, `/series-live`, `/series-quarantine`) muda de **forma**; `RF-4` muda o **valor** de um campo existente, e isso é declarado | fatia 1 |
| **RF-6** | O veredito de um coletor `REJECTED` registra o **motivo** (`api_code` e/ou `notes` não-nulos) | fatia de **liquidações** — ver `DEF-2` |

### 7.2 Não-funcionais

| id | requisito | limite |
|---|---|---|
| **RNF-1** | Pegada de disco por métrica compatível com `[P-infra]` (VPS compartilhada, só Postgres) | o `/architect` declara bytes/dia por métrica **antes** de a fatia abrir; **veta** qualquer desenho que exija gigas de aggTrades |
| **RNF-2** | Frescor: o painel de uma métrica coletada não pode exibir dado mais velho que a periodicidade declarada do coletor sem dizer que é velho | reusa a marcação de as-of/`liveness` já existente (`collector-status` já expõe `liveness.stale_after_s`) |
| **RNF-3** | Rate limit da exchange respeitado — `weight_used` continua contabilizado no `IngestRun` | não estourar a cota declarada; o `/architect` diz qual é por endpoint |
| **RNF-4** | Nenhuma chave/segredo em documento ou código; a key vive em `.env` | `CLAUDE.md` §*"Dado bruto não é versionado"* |

---

## 8. Os 3 defeitos do DIAGNOSTICO — dentro ou fora, com o custo de cada escolha

### DEF-1 · `n_written = 0` em 100% dos runs → **DENTRO, na fatia 1**

**O que está medido.** `sum n_returned = 2.616.300`, `sum n_written = 0`, runs com `n_written > 0` = **0**
`[MEDIDO 2026-09-10, n=2.910 runs; DOC: DIAGNOSTICO.md]` — enquanto `md.series` tem 23.512 linhas.

**A causa, localizada por este PRD** `[MEDIDO 2026-09-10: `grep -rn 'n_written' backend/src --include='*.py' | wc -l` → n=17 ocorrências]`:
o campo é **literal `0` nos dois sítios que constroem o `IngestRun` dos coletores vivos** —
`backend/src/modules/sentimento/use_cases/collector_run_mapping.py:94` (forceOrder) e `:131`
(premiumIndex). Não é perda de dado: é campo nunca preenchido.

**O dano já é visível num contrato servido, não só no log:** `collector_status.py:119-121` calcula
`uptime_percent = 100 * sum(n_written) / sum(n_expected)`. Com `n_written` literal `0`, o número é
estruturalmente `0.0` — e é o que a API devolve hoje:

```
docker exec deploy-api-1 python -c "...urlopen('http://localhost:8000/api/v1/collector-status')..."
# premiumIndex: status ATIVO · last_verdict ACCEPTED · n_runs_in_window 1429 · uptimePercent 0.0
```
`[MEDIDO 2026-09-10T20:10Z, n=1 série]` — um coletor **ATIVO, aceitando, com 1.429 runs na janela**,
reportando **0% de uptime**.

**Decisão: requisito desta feature (`RF-4`), pago na fatia 1.**
**Por que não é escolha livre:** `D2` item 4 já elege `n_written > 0` como gate de **toda** fase. Sem
`RF-4`, `DoD-4` é insatisfazível por construção e o DoD-VERTICAL degrada para 3 itens em silêncio.

| escolha | custo |
|---|---|
| **dentro, na fatia 1** (adotada) | a fatia 1 cresce por um item **horizontal** — a única concessão a `D1` neste PRD, e ela é declarada. Toca caminho compartilhado ⇒ o valor de `uptimePercent` do `premiumIndex` **muda** (de `0.0` para o real): mudança de valor num contrato servido, que `RF-5` obriga a declarar |
| dentro, mas na última fatia | as 4 primeiras fases reprovariam em `DoD-4`, ou o gate seria dispensado 4 vezes — e gate dispensado por conveniência deixa de ser gate |
| fora | `DoD-4` nunca cala; o `rc=0` de `ADR-012` permanece: indistinguível entre *"não escreveu"* e *"não mede"*, exatamente o modo de falha que o owner chama de andar em círculo |

### DEF-2 · forceOrder `REJECTED` há ~46h sem motivo registrado → **DENTRO, atado à fatia de liquidações**

**O que está medido.** forceOrder: 2 runs, ambos `REJECTED`, `n_returned = 0`, `api_code = None`,
`notes = None`; janela do 2º run `2026-09-08T22:08 → 2026-09-10T19:53`
`[MEDIDO 2026-09-10, n=2 runs; DOC: DIAGNOSTICO.md]`. Confirmado no contrato servido: a série aparece
como `status: "PARADO"`, `statusDetail: null`, `uptimePercent: null`, `last_verdict: "REJECTED"`
`[MEDIDO 2026-09-10T20:10Z]`. **Zero liquidação capturada, e o painel não sabe dizer por quê.**

**Decisão: requisito desta feature, mas dentro da fatia de liquidações — não antes dela.**
Liquidações é **M4**, uma das 5. Consertar o coletor **é** a fatia; o `RF-6` (registrar o motivo do
`REJECTED`) é parte do mesmo elo.

| escolha | custo |
|---|---|
| **dentro, na fatia de liquidações** (adotada) | liquidações continuam em zero até aquela fatia chegar, e o coletor segue queimando conexão e gravando `REJECTED`. **Aceito** porque `D1` proíbe fase que não entregue valor na tela: consertar o coletor sem o painel é precisamente a fase horizontal que a feature existe para eliminar |
| dentro, agora, fora de qualquer fatia | contradiz `D1` no primeiro ato da feature que `D1` criou |
| fora | a fatia de liquidações abriria cega: `DoD-1` reprovaria sem diagnóstico, e o tempo de diagnóstico entraria escondido no custo daquela fase |

⚠️ **O risco de sequenciamento que isto cria, e ele é do `/architect`:** o custo da fatia de liquidações
é **desconhecido** enquanto o motivo do `REJECTED` não for conhecido — pode ser 1 hora ou pode ser uma
fonte indisponível. Custo desconhecido **é entrada da ordenação das fatias 2–5**. Ver `[Q3]`.

### DEF-3 · Log sem `extra={}` (sem contador) → **FORA, com uma exceção nomeada**

**O que está medido.** `writer_batch_acked` e `collector_cycle_completed` são emitidos sem `extra={}`
⇒ nenhum contador ⇒ não há como medir vazão pelo log `[DOC: DIAGNOSTICO.md §*"Log sem número"*]`.

**Decisão: fora do escopo desta feature, como programa.** Nenhum item do DoD-VERTICAL lê o log:
`DoD-4` lê `n_written` via `/api/v1/ingest-health`, que é banco, não log. Instrumentar log é
observabilidade **horizontal** — a mesma classe de fase que `D1` acabou de rejeitar.

| escolha | custo |
|---|---|
| **fora** (adotada) | medir vazão pelo log continua impossível; o próximo incidente da classe *"coletor morto há 46h"* volta a exigir SQL manual para ser visto. **Mitigado, não eliminado**, por `RF-6` + `DEF-1`: com `n_written` real e motivo de `REJECTED` registrado, `/collector-status` passa a mostrar o que hoje só o log mostraria |
| dentro | fase horizontal sem ponto na tela, ou inchaço da fatia 1 com trabalho que nenhum `DoD` cobra |

**A exceção nomeada, e ela é pergunta, não requisito:** `RF-4` obriga a existir um contador de linhas
escritas no caminho do writer. Emitir **esse mesmo contador** em `extra={}` do evento que já é emitido
custa ~1 linha. Isso é `[Q5]` — decisão do `/architect`, não deste PRD. Se for adotado, o evento e as
chaves nascem **em inglês** (`CLAUDE.md`, linha 10 da tabela de fronteira: prospectivo, sem renomear os
4 eventos PT existentes).

---

## 9. Regras de negócio

| id | regra |
|---|---|
| **RN-1** | **Ausência nunca é zero.** Métrica sem dado exibe `SEM_PONTO`; renderizar `0` para ausência reprova a fase (herda a semântica já testada em `panel-status.ts`) |
| **RN-2** | **Nenhum header/erro de exchange vaza para a resposta da API.** O consumidor fala com o contrato, não com a Binance |
| **RN-3** | **Fase não fecha com elo faltando.** Os 4 itens do DoD-VERTICAL são conjunção, não pontuação |
| **RN-4** | **Nenhuma `[[rules.own]]`, alvo de `make` ou allowlist de idioma** — declarar uma reprova a fase (`PRD-002`/`RN-4`, `ADR-011/D1.10`) |
| **RN-5** | **Dado de teste não entra no Postgres compartilhado.** Se entrar por necessidade do gate, usa valor óbvio e é removido no mesmo gate |
| **RN-6** | **Escrita é do writer único.** Nenhum coletor novo escreve direto em `md.series` fora da topologia de escritor único já em vigor |

---

## 10. Regras bloqueantes em vigor — endereçáveis por esta feature

`harness rules list --severity block` → **8 regras** `[MEDIDO 2026-09-10, n=8]`. As que esta feature
tem superfície para violar, e onde:

| regra | superfície desta feature |
|---|---|
| `core.relative-import` | todo módulo novo de coletor/writer em `backend/src/modules/sentimento/` |
| `core.silent-except` | o caminho de erro do coletor novo — e é justamente o que produziu `DEF-2` (`REJECTED` sem motivo) |
| `core.print-statement` | CLI de coletor novo |
| `core.hardcoded-secret` | nenhuma nova chave; `[P-infra]`/`RNF-4` |
| `web-fullstack.browser-imports-server` | painel novo em `frontend/src/app/symbol/` |
| `web-fullstack.tenant-from-request` | rotas de leitura — sem inquilino neste produto, mas a regra está em vigor |
| `web-fullstack.server-test-directory-present` | `backend/tests/` já existe; não regredir |
| `own.compose-hardcoded-secret` | se a fatia exigir variável nova em `deploy/compose.yml` |

Nenhuma delas é obstáculo de desenho — todas são endereçáveis escrevendo o código do jeito que o
repositório já escreve.

---

## 11. Tipos e contratos críticos

| item | estado | dono | quando |
|---|---|---|---|
| Nome canônico da `series_key` de cada uma das 5 métricas | **`TBD`** | `/architect` (`quant-architect`) | antes da fatia 1 |
| Grade nativa (intervalo) de cada métrica | **`TBD`** | `/architect` | por fatia |
| Semântica de `n_written` — linhas persistidas pelo writer vs. itens publicados pelo coletor | **`TBD`** | `/architect` + `infra-architect` | fatia 1 (`RF-4`, `[Q5]`) |
| Fonte de CVD compatível com `[P-infra]` (o veto a gigas de aggTrades restringe o desenho) | **`TBD`** | `quant-architect` | quando a fatia de CVD for ordenada |
| Parâmetros de `/api/v1/series-history` para cada `series_key` nova | **existe** — `backend/src/api/routes/series_history.py:47` `[MEDIDO 2026-09-10]` | — | reuso, não construção |
| Contrato `IngestRun` (15 colunas, `sha256` da projeção canônica, `ADR-008/D3`) | **congelado** | `ADR-008` | `RF-4` muda **valor**, nunca nome nem ordem de coluna |

⚠️ **`RF-4` não é licença para tocar `INGEST_HEALTH_RUN_COLUMNS`.** A ordem da tupla alimenta o `sha256`
da projeção canônica (`ADR-008/DoD-2`, `CLAUDE.md` linha 11). Preencher um campo é permitido;
renomear/reordenar é mudança de contrato com plano de migração de fingerprint, e não é esta feature.

---

## 12. Non-goals — fora, com o motivo

| id | fora | motivo |
|---|---|---|
| **NG-1** | Decidir a **ordem das fatias 2–5** | `D1` devolve explicitamente ao `/architect` |
| **NG-2** | Reabrir `D1`, `D2` ou `D3` | decisões do owner de 2026-09-10 |
| **NG-3** | Programa de observabilidade por log (`extra={}` em todo evento) | `DEF-3`, fora com custo declarado |
| **NG-4** | Descongelar `coinalyze-fora-da-quarentena` | `D3`: congelada em `SPEC_DRAFT` até o CORE existir; não entrega nenhuma das 5 |
| **NG-5** | Renomear os 4 eventos de log em português existentes | `CLAUDE.md` linha 10: regra é prospectiva; renomear quebra consulta em silêncio |
| **NG-6** | Renomear `janela_de_perda` ou qualquer coluna de contrato | dona é `ADR-008/D3`, com gatilho de reabertura próprio (`T-07.12`/`T-07.13`) |
| **NG-7** | Painel novo de métrica **fora** das 5 do CORE | a lista de §1.2 é fechada por esta feature |
| **NG-8** | Backtest, matriz de convergência, detecção SMC | componentes `backtest`/`convergencia`, fora do CORE de extração+gráfico |
| **NG-9** | Autenticação / multiusuário | não reaberto (`SPEC-001` item `5.11`) |
| **NG-10** | Escrever SPEC, ADR, plano de fases ou tasks | `/architect` e `/tech-lead` |

---

## 13. `[INFERRED]` — leituras deste PRD, com motivo e custo de reversão

| id | inferência | motivo | custo se errada |
|---|---|---|---|
| **INF-1** | "volume" na fala do owner = volume negociado por barra (campo de kline), não volume de book | `D1.b` já amarra a fonte a `/fapi/v1/klines`, e volume é campo nativo dessa resposta | baixo — troca a coluna lida, não o cano |
| **INF-2** | `DoD-3` roda sobre a rota `/symbol` já existente, não sobre página nova por métrica | a página existe com 3 painéis e a semântica de ausência testada; criar página por métrica multiplicaria o wiring que `DEF-2` de `pagina-de-grafico-s2` mostrou ser frágil | médio — se o `/architect` decidir página por métrica, `DoD-3` muda de alvo, não de forma |
| **INF-3** | A ausência de coletor de klines/aggTrades/long-short significa "nunca construído", não "removido" | `ls` de `infra/` devolve 2 CLIs, e o `git log` não mostra remoção | baixo |
| **INF-4** | `RF-4` é satisfazível sem mudar o schema de `ingest_health` — o campo já existe e é `NOT NULL` (`postgres_ingest_record_store.py:79`) | o defeito é o literal `0` no mapeamento, não a coluna | baixo |

Nenhum unknown **crítico** virou `[INFERRED]`: os quatro acima são reversíveis dentro de uma fase. Os
críticos estão em §15 como Perguntas em Aberto, com dono.

---

## 14. GAPs desta rodada, classificados

| id | gap | classe | encaminhamento |
|---|---|---|---|
| **G-1** | Ordem das fatias 2–5 indefinida | **não-bloqueante** — a fatia 1 está decidida e não depende da ordem das outras | `[Q1]` para `/architect` |
| **G-2** | Motivo do `REJECTED` do forceOrder desconhecido | **não-bloqueante para a fatia 1**, **bloqueante para estimar** a fatia de liquidações | `[Q3]` |
| **G-3** | Fonte de CVD sob o veto a aggTrades | **não-bloqueante agora**, bloqueante quando a fatia de CVD for ordenada | `[Q4]` |
| **G-4** | Semântica exata de `n_written` | **não-bloqueante** — `DoD-4` só exige `> 0` e verdadeiro | `[Q5]` |
| **G-5** | `glossary_doc` continua vazio (`harness policy --key glossary_doc` → 1 byte; `grep -n 'glossary' harness.toml` → `rc=1`) `[MEDIDO 2026-09-10]` | **não-bloqueante** — dívida com dono, herdada de `ADR-013/D4` | fora desta feature; não reaberto |

**Nenhum gap bloqueante ⇒ nenhum `feedback_to_pm.md`.** O PRD segue para `/architect`.

---

## 15. Perguntas em Aberto — classificadas, com dono

| id | pergunta | dono | quando trava |
|---|---|---|---|
| **[Q1]** | Qual a **ordem das fatias 2–5**, e qual o critério (risco? custo? dependência de dado)? | `/architect` | ao fechar a fatia 1 |
| **[Q2]** | Qual o **nome canônico da `series_key`** e a **grade nativa** de cada uma das 5 métricas? | `/architect` (`quant-architect`) | antes da fatia 1 abrir |
| **[Q3]** | O **diagnóstico do forceOrder** (`DEF-2`) deve ser um spike curto **antes** de `[Q1]` ser respondida? Sem ele, o custo da fatia de liquidações é desconhecido e a ordenação é feita às cegas | `/architect` | antes de `[Q1]` |
| **[Q4]** | Sob `[P-infra]` (veto a gigas de aggTrades), qual a **fonte e a agregação de CVD** que cabe em Postgres numa VPS compartilhada? | `quant-architect` | quando a fatia de CVD for ordenada |
| **[Q5]** | `n_written` conta **linhas persistidas pelo writer** ou **itens publicados pelo coletor**? E o contador criado por `RF-4` deve ser emitido em `extra={}` (custo ~1 linha; ver `DEF-3`)? | `/architect` + `infra-architect` | dentro da fatia 1 |
| **[Q6]** | O **volume** ganha painel próprio ou entra como sub-eixo do painel *Preço* já existente? | `frontend-architect` + `design_gate` (`docs/gate-de-design.md`) | dentro da fatia 1 |
| **[Q7]** | Quantos **dias de backfill** a fatia 1 precisa para `DoD-3` ter ponto legítimo sem violar `[P-seed]`? | `/architect` | dentro da fatia 1 |

Nenhuma dessas é pergunta ao **owner**: todas são decisões técnicas que `D1`/`D2`/`D3` já delegaram.
Se o `/architect` concluir que `[Q4]` exige escolha de custo pelo owner, ele escala — não este PRD.

---

## 16. Registro da varredura de discovery

Cada dimensão contra os artefatos lidos (`DECISOES-OWNER.md`, `DIAGNOSTICO.md`, `CLAUDE.md`, o código
em `8dc8941`, e a stack de produção de pé).

| dimensão | resultado |
|---|---|
| **stakeholders e consumidores** | `[COBERTO: DECISOES-OWNER.md]` — consumidor único é o owner, operando o painel ao vivo; foi ele quem achou o bug de wiring da fase 04 de `pagina-de-grafico-s2` |
| **volumetria e escala** | `[COBERTO parcialmente: P-infra]` — VPS compartilhada, R2 free tier, só Postgres; **`[GAP]`** bytes/dia por métrica ⇒ `RNF-1` obriga o `/architect` a declarar antes de cada fatia; `[Q4]` para CVD |
| **requisitos não-funcionais (latência, frescor)** | `[COBERTO: código]` — `liveness.stale_after_s` já existe em `/collector-status` (`[MEDIDO 2026-09-10]`: `period_s: 60`, `stale_after_s: 181` para premiumIndex) ⇒ `RNF-2` reusa, não inventa |
| **estados e casos de borda** | `[COBERTO: RN-1]` ausência ≠ zero (`panel-status.ts` já testado); `[COBERTO: DEF-2]` coletor parado sem motivo; **`[GAP]`** fora de ordem / duplicado / parcial por métrica ⇒ do `/architect`, por fatia, porque a resposta depende da fonte |
| **contrato e dependências** | `[COBERTO]` — 6 rotas já servidas, `series_history` e `series_live` existem (`ls backend/src/api/routes/*.py | wc -l`, n=8); `RF-5` congela a forma; `ADR-008/D3` congela `IngestRun` |
| **métricas e observabilidade** | `[COBERTO com defeito nomeado]` — `DEF-1` (contabilidade), `DEF-2` (motivo do veredito), `DEF-3` (log sem número), cada um com decisão e custo em §8 |
| **escopo e non-goals** | `[COBERTO]` — §12, 10 non-goals; a lista das 5 métricas é fechada por §1.2 |

**Grill de logística:** dispensado por suficiência do handoff — feature, componentes e âncora
(`DECISOES-OWNER.md` + `DIAGNOSTICO.md`) vieram declarados, e nenhum PRD existente cobre o CORE
(`ls docs/specs/PRD-*.md` → PRD-001..006, n=6 antes deste, nenhum sobre as 5 métricas). Nada foi inferido no lugar de
perguntar: o que não estava decidido virou `[Q1]`..`[Q7]`, com dono.

---

## 17. Unidades de valor candidatas (tracker) — **ainda não criadas**

`harness policy --key tracker` → `{"kind": "jira", "project": "CST", "board_id": "36", "parent_kind": "Epic", "child_kind": "Tarefa"}` `[MEDIDO 2026-09-10]`.

Como `tracker.kind != none`, há unidade de valor a criar — **mas só depois da validação do
`/architect`**, conforme o fluxo. Candidatas, uma por fatia:

| candidata | métrica | ordem |
|---|---|---|
| UV-1 | **volume** ponta a ponta (inclui `RF-4`/`DEF-1`) | decidida (`D1.b`) |
| UV-2..UV-5 | open interest · long/short ratio · liquidações (inclui `RF-6`/`DEF-2`) · CVD | `[Q1]`, `/architect` |

**Registrado, não pendente:** nenhuma issue foi criada nesta rodada, por decisão de fluxo, não por
esquecimento.

---

## 18. Gate de handoff — conferido

- [x] **cada story tem fronteira clara e cabe numa fase** — story = métrica = os 5 elos do §4.1;
      a única transversal (`US-6`) está atada à fatia 1, e isso está declarado como concessão a `D1`.
- [x] **as regras bloqueantes em vigor são endereçáveis** — as 8 mapeadas em §10, nenhuma obstáculo de
      desenho (`harness rules list --severity block`, n=8, `[MEDIDO 2026-09-10]`).
- [x] **tipos e contratos críticos definidos, ou `TBD` com dono e data** — §11, 6 itens, 4 `TBD` com
      dono nomeado e momento declarado.
- [x] **non-goals escritos** — §12, 10 itens com motivo.
- [x] **gaps classificados** — §14; **nenhum bloqueante**, logo sem `feedback_to_pm.md`.

**Próximo passo:** `/architect` — Gap Analysis deste PRD, e depois SPEC + plano de fases. As perguntas
que ele precisa fechar estão em §15.
