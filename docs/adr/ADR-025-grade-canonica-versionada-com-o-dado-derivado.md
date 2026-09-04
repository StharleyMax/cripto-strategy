# ADR-025 — Grade canônica versionada junto com o dado derivado: `grid_version` como quarto termo, distinto de `commit`, na reprodutibilidade de `run_registry`

**Status:** proposto · **Data:** 2026-09-04 · **Componente:** `charts` (dona da grade, `ADR-003`/FR-3) + `backtest` (consumidora via `run_registry`, `ADR-021`) — decisão registrada em `docs`
**Feature:** `plataforma-dados` (`T-08.14`, `CST-82`) · **Autor:** `quant-architect`
**Rev de ancoragem:** worktree `T-08.14` sobre `origin/master` `9e9bf9a` (inclui `T-08.4`/`ADR-021` e `T-08.7`/`ADR-022` já mergeados).
**Requisito de origem:** `ADR-003`/FR-3, `docs/plans/SPEC-001-plataforma-dados/08_superficie_e_reprodutibilidade.md` item 8.9 ("Grade canônica versionada junto com o dado derivado"), falsificador global `F-4`.

**Fecha:** se `bundle_hash + window + knowledge_time` (`D8.9`, `ADR-021`/D4) já garante que mudar a
grade canônica não reinterpreta dado antigo em silêncio — resposta medida: **não garante** — e o
campo que fecha o buraco.
**Não fecha:** o port Python de `buildCanonicalGrid` (continua `[NÃO SEI]`, dono `quant-architect`,
gatilho de `ADR-003`/D2 inalterado); a regra de `firing_rate` walk-forward (`T-08.8`, ADR ainda sem
número — não colido com ela, só nomeio a obrigação que ela herda, ver `D5`); qualquer schema/DDL
(trabalho de `/build`, mesma postura de `ADR-021`).

---

## Contexto — o que já existe e o que esta ADR usa sem reabrir

- `ADR-003`/FR-3: a grade canônica é **uma função, dona de `charts`**, e o motor de backtest a
  importa — nunca reimplementa. Implementada hoje só do lado TS:
  `frontend/src/charts/canonical-grid.ts` (`buildCanonicalGrid`/`alignToTimeframeStart`/
  `alignCandlesToGrid`/`aggregateCandles`), pura, sem I/O, função de
  `(rangeStartMs, rangeEndMsExclusive, timeframeMs)` — floor por múltiplo de `timeframeMs` desde o
  epoch. `[DOC: frontend/src/charts/canonical-grid.ts:62-96]`.
- `ADR-021`/D4 já declara a reprodutibilidade da plataforma como a tripla
  `(bundle_hash, window, knowledge_time)`: pedir de volta a mesma tripla tem que devolver o mesmo
  `partitions_content_hash`, ou o motor **recusa** (falsificador G1). `ADR-021`/D2 também grava
  `commit` (`git rev-parse HEAD` do motor que produziu o run) como coluna de auditoria.
- Implementado (`T-08.4`/`T-08.6`/`T-08.7`, mergeados): `backend/src/modules/backtest/use_cases/
  record_run.py` e `backend/src/modules/charts/{domain,use_cases}/`. Nenhum dos dois lados tem,
  hoje, uma grade de tempo em Python — `find backend/src/modules/charts/domain -name '*.py'`
  lista `field_identity.py`, `histogram_recipe.py`, `histogram.py`, `threshold_spec.py`, `scan.py`,
  `firing_rate.py`, `observation.py`; nenhum bucketing de tempo `[MEDIDO 2026-09-04]`.

## O número que decide esta ADR

`[MEDIDO 2026-09-04, backend/src/modules/backtest/use_cases/record_run.py:82-96]`: a única
comparação de divergência que existe hoje é

```python
if existing is not None and existing.partitions_content_hash != partitions_content_hash:
    raise RunRegistryDivergenceError(...)
```

`commit` é recebido como parâmetro (`record_run.py:63`), gravado em `RunRegistryEntry`
(`run_registry_entry.py:60`), **e nunca comparado** contra o `commit` de uma linha já existente
para a mesma tripla. Não há nenhuma outra checagem de versão de código nesse caminho
`[MEDIDO: grep -n "commit" backend/src/modules/backtest/use_cases/record_run.py`
`backend/src/modules/backtest/domain/run_registry_entry.py → 3 ocorrências, todas atribuição/campo,
zero comparação]`.

**Consequência:** dois runs com a MESMA `(bundle_hash, window, knowledge_time)` e o MESMO
`partitions_content_hash` (os mesmos bytes de dado bruto), mas produzidos por duas versões do
motor em que a grade canônica mudou de semântica (ex.: `alignToTimeframeStart` passa de
epoch-aligned para calendar-aligned, ou a enumeração de timeframes ganha um múltiplo novo),
**passam pelo único portão de recusa que existe hoje sem disparar nada.** A segunda execução
grava uma segunda linha com `commit` diferente — auditável só por quem for olhar essa coluna à
mão — e nenhum dos falsificadores G1–G5 de `ADR-021` é sensível a essa classe de mudança, porque
nenhum deles compara `commit` nem qualquer coisa derivada da grade. **Isto é exatamente o cenário
que `T-08.14`/`ADR-003`/FR-3 pergunta se está coberto, e a resposta medida é não.**

## Decisão

### D1 — `bundle_hash + window + knowledge_time` (`D8.9`) cobre DADO, não ALGORITMO

A tripla de `ADR-021` prova que os BYTES lidos não mudaram (`partitions_content_hash`) sob a mesma
identidade de estratégia (`bundle_hash`) e o mesmo teto de conhecimento (`knowledge_time`). Ela não
prova, e não foi desenhada para provar, que a função que TRANSFORMA esses bytes em barras/bins
(a grade canônica) é a mesma entre duas execuções. São propriedades ortogonais: dado idêntico sob
algoritmo diferente produz número diferente com a mesma legitimidade lógica que dado diferente sob
o mesmo algoritmo — e só a segunda tem hoje um portão.

### D2 — `commit` não é o instrumento certo para fechar isto, mesmo mudando toda vez que a grade muda

`commit` é sensível A MAIS do que precisa: muda em qualquer edição do repositório, não só numa
mudança de semântica da grade. "A grade mudou entre o run A e o run B?" não é respondível
comparando dois hashes de commit sem um `git diff` manual guiado por alguém que saiba o que
procurar — e `record_run.py` não compara `commit` de jeito nenhum hoje, então nem esse sinal
grosseiro está em uso. Este é o MESMO argumento que `ADR-021`/D5 já usou para separar
`intrabar_convention` de ficar implícito em `commit`: uma pergunta que precisa ser respondida por
uma linha de banco, não por arqueologia de git, precisa de coluna própria.

### D3 — `grid_version`: inteiro monotônico, dono de `charts`, bumped só em mudança de semântica de fronteira de bucket

```
CANONICAL_GRID_VERSION: int   # frontend/src/charts/canonical-grid.ts (hoje: 1, implícito —
                               # esta ADR pede que ele passe a ser EXPLÍCITO, ver Consequência)
```

Reusa o padrão já em produção no mesmo repositório, não inventa um novo: `specVersion` em
`frontend/src/app/threshold-spec-bundle.ts` (`CURRENT_THRESHOLD_SPEC_VERSION`) já é exatamente
"inteiro pequeno, bumped quando o contrato semântico muda, comparado por igualdade, decode recusa
valor desconhecido em vez de adivinhar" (`threshold-spec-bundle.ts:336-345`). `grid_version` é a
mesma ideia aplicada ao eixo de tempo em vez de ao eixo de valor.

**Bump-worthy** (exemplos, não exaustivo): trocar epoch-aligned por calendar-aligned; mudar a regra
de arredondamento de `floor` para outra; mudar a definição de "múltiplo válido de timeframe" que
`aggregateCandles` aceita. **Não é bump-worthy**: passar um `timeframeMs` diferente (já é parâmetro
de invocação, `D6` de `ADR-020` já cobre esse raciocínio para a receita de histograma); refatoração
que não muda o valor de saída para nenhuma entrada já testada (o `sha256`-proof de `T-05.1` é o
teste que teria que continuar batendo).

### D4 — `run_registry` ganha a coluna, e a recusa (`ADR-021`/D4) ganha uma SEGUNDA causa distinta de G1

Emenda a `ADR-021`/D2 (coluna) e `ADR-021`/D4 (regra de recusa) — não reabre nada mais daquela ADR:

| coluna | tipo | por quê |
|---|---|---|
| `grid_version` | `INTEGER NOT NULL` | valor de `CANONICAL_GRID_VERSION` no momento do run — mesma disciplina de tipo de `intrabar_decided_count` (`ADR-021`/D2): inteiro simples, sem `CHECK IN (...)` porque não é enum fechado, é contador monotônico |

Nova checagem em `record_run` (falsificador novo, **G6**, numeração seguinte à tabela de `ADR-021`):
mesma tripla `(bundle_hash, window, knowledge_time)`, mesmo `partitions_content_hash` (dado
idêntico — G1 não dispara), mas `grid_version` da linha nova **diferente** do `grid_version` da
linha existente ⇒ **recusa antes de publicar**, com uma exceção própria
(`GridVersionDivergenceError`, distinta de `RunRegistryDivergenceError`) que cita os dois valores
de `grid_version` — nunca a mesma mensagem de G1, porque a causa é outra: dado igual, régua
diferente, e confundir as duas mensagens tira do owner exatamente a distinção que este ADR existe
para criar (mesmo motivo de `ADR-002`/D6 distinguir compactação de dado novo, citado por
`ADR-021`/D4).

**O que este ADR não decide:** se existe um caminho para o operador ACEITAR explicitamente uma
mudança de `grid_version` sobre uma tripla antiga (ex.: um "rebaseline" deliberado, gravando uma
segunda linha com o mesmo triple e `grid_version` novo, sob um `run_id` novo, sem apagar a linha
velha). Isso é política de operação do motor, não reprodutibilidade — fica para quem escrever o
motor de backtest de fato (`T-08.14` não cria esse motor, mesma fronteira que `ADR-021` já
declarou para si mesma).

### D5 — `charts` (S4) não tem dado derivado persistido hoje; a obrigação é prospectiva, com gatilho nomeado

`ADR-020`/D7 e as duas implementações mergeadas (`T-08.6`, `T-08.7`) confirmam: `distribution`/
`scan`/`firing_rate` são computados **ao vivo**, sobre uma porta (`ObservationSource`), sem tabela
de cache/resultado persistido. Não há hoje nenhum "dado derivado antigo" do lado `charts` que uma
mudança de grade possa reinterpretar em silêncio — o risco medido nesta ADR é inteiramente do lado
`run_registry`/`backtest`, que já persiste (D1–D4 acima).

**Gatilho de reabertura, nomeado para não virar exceção permanente por omissão** (mesmo padrão que
`CLAUDE.md` já usa para a coluna de contrato, linha 11 da tabela de idioma): no dia em que `charts`
ganhar qualquer artefato derivado persistido — cache de histograma, relatório de `scan`, o store de
dobras de `T-08.8` walk-forward (que particiona por calendário, logo depende da MESMA grade) — a
chave de persistência daquele artefato **tem que incluir `grid_version`**, ao lado do que já
identifica a receita (`HistogramRecipe`/`specVersion` de `ADR-020`/D6, ou o que `T-08.8` decidir
para dobras). Dono da implementação: quem escrever aquele cache, quando ele nascer. Dono da
obrigação: esta ADR.

### D6 — fronteira explícita: o que continua fora, e por quê

- **Port Python da grade** continua `[NÃO SEI]`, exatamente como `ADR-003`/D2 deixou (dono
  `quant-architect`, gatilho: "o dia em que uma task real precisar de bucketing de tempo em AMBAS
  as linguagens para o mesmo propósito" — hoje nenhuma precisa, `backend/src/modules/charts/domain`
  não tem grade de tempo). `grid_version` como CONCEITO é linguagem-agnóstico (é só um inteiro
  gravado em `run_registry`, que é Python/Postgres); o dia em que o port existir, ele nasce já
  exportando a mesma constante nomeada, para as duas linguagens concordarem por igualdade de
  inteiro, não por reimplementação de lógica.
- **Regra de dobra de walk-forward** (`T-08.8`) não é decidida aqui. O que esta ADR fixa é que,
  quando aquela ADR nascer (ainda sem número — `T-08.8` depende de `ADR-025`/`ADR-022` mas seu
  próprio ADR não existe nesta rev), ela herda `grid_version` como termo da própria chave de
  reprodutibilidade dela, pela mesma razão de `D5`: dobras de calendário são geometria de grade.
- **Migração SQL** (a coluna nova em `backtest.run_registry`) é trabalho de `/build` — esta ADR
  fixa coluna, tipo e regra de recusa, não escreve DDL, mesma postura de `ADR-021`.

## Alternativas recusadas

| alternativa | por que |
|---|---|
| **Comparar `commit` em vez de criar `grid_version`** | `commit` já existe e muda com a grade — mas muda com QUALQUER coisa, então uma comparação de igualdade de `commit` teria falso-positivo em toda mudança de código não relacionada à grade (ex.: um `docstring` corrigido invalidaria toda reprodução). Precisaria de uma allowlist de commits "equivalentes para fins de grade", que é mais complexo e mais frágil que um inteiro dedicado |
| **Congelar a grade calculada (as próprias `bucket-start instants`) dentro do `bundle`** | mesma alternativa que `ADR-020`/D6 já recusou para a receita de histograma, pelo mesmo motivo: duplica o mecanismo de reprodutibilidade que `F-4` já declara global, em vez de reusá-lo, e a grade é recomputável deterministicamente a partir de `(window, timeframeMs, grid_version)` — não precisa ser congelada byte a byte |
| **Não fazer nada — confiar que ninguém muda a grade sem reprocessar tudo manualmente** | é exatamente o "reinterpreta silenciosamente" que `ADR-003`/FR-3 e o item 8.9 do plano existem para proibir; e o número medido acima (`record_run.py:82-96`) mostra que hoje NADA impede o caso |
| **Bump de `grid_version` a cada commit que toque `canonical-grid.ts`** (automatizado, ex.: hash do arquivo) | reintroduz o problema de `commit`: um comentário editado no arquivo mudaria o hash sem mudar semântica, disparando recusa espúria (falsificador H2 abaixo). `specVersion`-style (bump manual, deliberado, documentado no commit que o faz) é o padrão já aceito neste repositório e o único que separa "o arquivo mudou" de "o contrato mudou" |

## Falsificadores

| # | observação que derruba | o que ela derruba |
|---|---|---|
| **H1** | dois `record_run` com a mesma tripla e o mesmo `partitions_content_hash`, mas `grid_version` diferente, e a segunda chamada **não** levanta `GridVersionDivergenceError` | `D4` inteira |
| **H2** | `CANONICAL_GRID_VERSION` bumped por uma mudança que não altera a saída de `buildCanonicalGrid`/`alignToTimeframeStart`/`aggregateCandles` para nenhuma entrada já coberta pelo `sha256`-proof de `T-05.1` | `D3` — o contrato de "bump só em mudança de semântica" quebrou |
| **H3** | um cache/relatório persistido nasce em `charts` (histograma, scan, dobra de walk-forward) sem `grid_version` na chave | `D5` — o gatilho disparou e ninguém respondeu |
| **H4** | `grid_version` divergente sendo relatado com a MESMA mensagem/exceção de G1 (`RunRegistryDivergenceError`), em vez de uma causa distinta e nomeada | `D4` — a distinção entre "dado mudou" e "régua mudou" é o valor que este ADR entrega; misturá-las apaga o valor |

## Como o owner confere isto sem confiar no arquiteto

1. **O número que motiva a ADR é grepável, não recalculado por mim**: `grep -n "partitions_content_hash\|commit" backend/src/modules/backtest/use_cases/record_run.py` mostra a comparação existente (linha 88) e a ausência de qualquer comparação de `commit` — o owner roda o mesmo grep `[MEDIDO 2026-09-04]`.
2. **`grid_version`/`specVersion` é precedente, não invenção**: `grep -n "CURRENT_THRESHOLD_SPEC_VERSION\|specVersion" frontend/src/app/threshold-spec-bundle.ts` mostra o padrão já em produção que esta ADR propõe reusar para o eixo de tempo.
3. **Quando implementado** (`/build`): o falsificador H1 é o teste de regressão que prova esta ADR — duas chamadas de `record_run` com a mesma tripla e `partitions_content_hash` idêntico, `grid_version` diferente, asserindo `GridVersionDivergenceError` e citando os dois valores — mesmo formato que os testes G1–G5 de `ADR-021` já usam (fixture fabricada, não dataset real).

Rotulado explicitamente como **opinião de arquitetura**: a escolha de tratar `grid_version` como
recusa obrigatória (em vez de, por exemplo, um aviso não-bloqueante) é julgamento deste agente,
seguindo a doutrina já estabelecida por `ADR-021`/D4 para G1/G2 — não há medição que prove que
recusa é estritamente melhor que aviso; é a mesma postura de risco já adotada pelo resto da ADR
que esta emenda. `[OPINIÃO: quant-architect, 2026-09-04]`. O que é medido e não-opinião: a ausência
atual de qualquer comparação de `commit`/versão em `record_run.py` (`D1`/seção "O número que decide
esta ADR").

## Consequência para quem implementar

- `backend/src/modules/backtest/domain/run_registry_entry.py`: `RunRegistryEntry` ganha o campo
  `grid_version: int`, validado não-negativo no `__post_init__` (mesmo padrão dos outros campos
  numéricos da classe).
- `backend/src/modules/backtest/use_cases/record_run.py`: `record_run` ganha o parâmetro
  `grid_version: int`; a checagem de `existing` ganha o segundo `if`, com `GridVersionDivergenceError`
  como classe nova ao lado de `RunRegistryDivergenceError`.
- `frontend/src/charts/canonical-grid.ts`: ganha `export const CANONICAL_GRID_VERSION = 1;`
  explícito no topo do arquivo (hoje o valor "1" é implícito — não há constante nomeada) — o bump
  dessa constante, quando acontecer, é o evento que este ADR versiona.
- Migração SQL de `backtest.run_registry` (coluna nova): trabalho de `/build`, não desta ADR.
- Quando `T-08.8` (walk-forward) e o eventual port Python da grade nascerem, ambos leem `D5`/`D6`
  desta ADR antes de decidir sua própria chave de reprodutibilidade.
