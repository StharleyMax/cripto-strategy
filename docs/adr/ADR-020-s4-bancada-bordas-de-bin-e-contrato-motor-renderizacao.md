# ADR-020 — `S4` bancada: bordas de bin **derivadas por `(field, nature)`**, overflow como bin de primeira classe, e o contrato motor⇄renderização de `distribution`/`scan`/`firing_rate`

**Status:** `proposto` · **Data:** 2026-09-04 · **Componente:** `charts` (motor) + `charts` (render) — ver §"Fronteira de módulo", nada aqui decide `infra` nem `web`
**Feature:** `plataforma-dados` (`T-08.6`, `CST-74`) · **Autor:** `quant-architect`
**Rev de ancoragem:** `master` na worktree `T-08.6` (branch `tasks/T-08.6-s4-bancada-distribuicao`), sem código de produção de `S4`/`charts`-backend ainda — `find backend/src/modules -maxdepth 1` lista só `sentimento`.
**Mandato citado no despacho, literal:** *"entregue a distribuição; o limiar é parâmetro. Limiar absoluto é um filtro 'não-BTC' disfarçado de sinal."*

**Fecha:** como as bordas de um histograma de `S4` são calculadas para um `(field, nature)` qualquer sem virar constante hardcoded — a falha que `D8.6` já mediu (11 bordas fixas, teto 50%, erram 47,2% do taker) — como o bin de overflow é contado e exposto, e o formato do contrato de dado entre o motor de cálculo (Python, novo módulo `charts`) e a camada de renderização (TS, `frontend/src/charts/`, já existente por `ADR-003`).
**Não fecha:** a rota HTTP que serve isto (componente `infra`, `T-01.8` ainda sem juiz — `harness.toml:76-80`); a honestidade de `firing_rate` in-sample vs walk-forward (`T-08.8`, `D8.2`); `min_obs`/`n_obs` efetivo por ponto e dispersão do `z` como telemetria (`T-08.7`, `D8.4`/`D8.5`). A decisão de armazenamento **já está fechada** — `ADR-002/D4` (`T-08.1`, 2026-09-04): **TimescaleDB em `postgres:15`**, candidato vencedor sobre Parquet/DuckDB nos 5 critérios de `D8.21` — este ADR assume essa base para a PORTA (protocolo) que `use_cases/` vai consumir, sem reabri-la. Este ADR **reserva o campo do contrato** para `firing_rate`/`min_obs`, para que `T-08.7`/`T-08.8` não precisem quebrar tipo depois.

---

## Contexto

### O que já existe e este ADR reusa, não reinventa

- `Nature` já é tipo canônico — `backend/src/modules/sentimento/domain/series_key.py:85-101`: `STOCK | FLOW | RATIO | EVENT | TICK`, com o comentário de cada membro já carregando a regra de ausência (`FLOW`: *"LOCF over it is a type error, never UX"*).
- A política de ausência POR `nature` já está fixada em **`SPEC-001` §5.11** (tabela `nature` → renderização → proibido) e parcialmente executável em `as_of_accessor.py:112-117` (`CARRY_FORWARD_BY_NATURE`). O motor de histograma **consome** essa política como pré-filtro; não a reescreve.
- O padrão de "bundle versionado, hasheável, sem default em nenhum eixo" já está construído para `ThresholdSpec` em `frontend/src/app/threshold-spec-bundle.ts` (`T-08.5`, `Absolute|Percentile|RobustZ` + `specVersion`, `Custom` desabilitado). Este ADR **estende essa família de contrato**, não cria uma segunda filosofia.
- A fronteira `charts` ⇄ `web` já está decidida (`ADR-003`): `charts` não faz I/O (`FR-1`), `web` não calcula geometria (`FR-2`), a grade canônica é uma função só, dona de `charts`, importada por quem precisar (`FR-3` — o precedente que autoriza `backtest` a importar de `charts`, e que este ADR usa para autorizar o motor de `charts` a importar `Nature`/`SeriesKey` de `sentimento`).
- `backend/src/api/` **não é mais `sentimento` nem `charts`** — é o componente `infra`, acrescentado em 2026-09-03 (`harness.toml:32-84`), ainda sem arquiteto declarado (`[agents.by_component.infra]` é `T-01.8`). A rota HTTP de `S4` cai lá, fora do meu escopo de decisão.

### Os três números que este ADR tem que responder, com o comando que os produziu

| DoD | medição | consequência arquitetural |
|---|---|---|
| `D8.6` | 11 bordas propostas (teto 50%) aplicadas ao taker: **951/2013 = 47,2%** caem fora à direita, **máx 2055,3%** | uma tabela de bordas fixa por metric **não escala** — o taker tem ordens de grandeza diferentes da OI. As bordas têm que **se auto-escalar pela distribuição observada do próprio field**, não por uma constante |
| `D8.7` | funding: **`p90 = p99`** (mesmo número); `>` vs `>=` muda o disparo de **9/1500 para 184/1500 (20×)**; massa pontual em `interestRate(símbolo,data)`: **0,0001 em 665 símbolos, 0 em 208, 0,00005 em 2** | um histograma que só bina por quantil **esconde** a massa pontual atrás de `p90=p99`; a detecção de massa pontual tem que ser **um passo genérico**, não um caso especial de funding — outros fields têm massa pontual também (ex.: razões L/S com poucos valores possíveis) |
| `D8.1` | `scan` com `Absolute{5.0}` sobre BTC/30d → **0 linhas**, `distribution` mostra **`max = 2,4017`**, conferido por **dois caminhos independentes** | o resultado do motor tem que ser **verificável por recontagem sobre a tabela crua**, não só pela mesma view — isso deriva requisito de contrato: o motor expõe `n_total` e a contagem por bin de um jeito que um segundo cálculo, feito por outra rota, possa bater byte a byte |

---

## Decisão

### D1 — `field` é formalizado como `(metric, unit, denom)`, um subconjunto de 3 dos 15 termos de `SeriesKey`

`(field, nature)` é a nomenclatura literal de `CA-F4-6`/`D8.6`. Este ADR fixa `field`:

```
FieldIdentity = (metric: str, unit: str, denom: str)
```

**Por que só estes 3, e não os 15 termos inteiros de `SeriesKey`:** `S4` é uma bancada
**cross-symbol** por desenho (§6, job de `S4`: *"que taxa de disparo um limiar produziria — antes de
escolher o limiar"*, sobre um universo, não sobre um símbolo). Se as bordas de bin fossem chaveadas por
`instrument_id`/`venue`/`cohort` também, cada símbolo teria seu próprio histograma incomparável, e
`scan` deixaria de fazer sentido (não haveria bin comum para contar "quantos símbolos cruzaram"). `unit`
e `denom` entram porque `CA-F4-13` já mediu que a MESMA métrica (OI) muda de escala por `denom`
(`base_contracts` vs `notional_usd`) — chavear só por `metric` reintroduziria o erro que `D8.6` mediu,
uma superfície acima.

`nature` continua **termo irmão**, não parte de `field`: ela não carrega escala nova — governa a
política de ausência (§5.11) e o despacho do pré-passo de massa pontual (`D3` abaixo). É por isso que a
nomenclatura da SPEC já os separa: `(field, nature)`, dois eixos, não um.

`interval`/`window`/`universo` **não são parte da identidade de campo** — são parâmetros de
INVOCAÇÃO da derivação (abaixo), porque as bordas são recalculadas a cada leitura, nunca cacheadas por
`field` sozinho (ver `D6`).

### D2 — bordas de bin são **quantis da distribuição observada do próprio field**, nunca cortes absolutos fixos

```
derive_edges(field, nature, universe, window, knowledge_time, recipe) -> BinEdges
```

Passos, nesta ordem:

1. **Elegibilidade (reusa §5.11, não reimplementa):** de todas as observações de `field` sobre
   `universe`/`window`, lidas `as of knowledge_time`, mantém só as que a política de ausência de
   `nature` classifica como valor real — nunca um `LOCF` de `FLOW`, nunca uma observação além do
   trilho de vigência de `STOCK`. Resultado: conjunto `X`.
2. **Massa pontual (D3, abaixo) remove de `X` os valores em `M`, sobra `R = X \ M`.**
3. **Quantis sobre `R`:** dado `recipe.quantiles = (q_1 < … < q_k) ⊂ (0,100)` e
   `recipe.interpolation` (mesmo vocabulário de `Interpolation` já fixado em
   `threshold-spec-bundle.ts:55` — `linear|lower|higher|nearest|midpoint`, porque "percentil sem
   estimador mente", `SPEC-001:305`), calcula `e_j = percentile(R, q_j, interpolation)`.
4. Bins finitos: `[e_j, e_{j+1})` para `j = 1..k-1`. **Dois bins de overflow, sempre presentes:**
   `(-inf, e_1)` e `[e_k, +inf)`.

**Por que isto conserta `D8.6` por construção, não por ajuste manual:** o corte não é "50%" — é "o
percentil 1 e o percentil 99 (ou o que a receita pedir) **da distribuição que este field realmente
tem** nesta janela". Um field com cauda de 2000% e um field com cauda de 3% recebem bordas
proporcionalmente corretas ao próprio field, sem precisar de uma tabela por metric mantida à mão.

### D3 — detecção de massa pontual é **um passo genérico do motor**, não um caso especial de `funding`

```
share(v) = |{x em X : x == v}| / |X|
M = { v : share(v) >= recipe.point_mass_min_share }
```

Cada `v ∈ M` vira um bin degenerado `[v, v]` com a contagem exata, **antes** do passo de quantis
(`D2`). Isso resolve `D8.7` (`p90 = p99` deixa de ser um número mudo: a massa em `0,0001` aparece como
pico próprio, com contagem) **sem** hardcodar `interestRate` nem "funding" em lugar nenhum do motor —
qualquer field com concentração de valores (ex.: razões L/S com poucos valores possíveis) ganha o
mesmo tratamento de graça. `recipe.point_mass_min_share` é parâmetro (ver `D6`), não constante.

### D4 — overflow é bin de primeira classe: sempre computado, sempre exposto, nunca descartado

```
Bin = { lo: number, hi: number, count: number }
Overflow = { count: number, share: number, extreme: number | null }
HistogramResult = {
  field: FieldIdentity, nature: Nature,
  pointMasses: { value: number, count: number }[],
  bins: Bin[],
  overflowLeft: Overflow, overflowRight: Overflow,
  nTotal: number,               # D8.8: toda métrica transversal carrega n
  universe: { declared: string, nResolved: number },
}
```

**Invariante que um teste de regressão tem de fixar, no formato exato que `D8.6` já mediu**
(`951 de 2013 (47,2%) … máx 2055,3%`): `sum(bin.count) + overflowLeft.count + overflowRight.count +
sum(pointMass.count) == nTotal`, e `overflowRight = { count: 951, share: 0.472, extreme: 2055.3 }`
sobre o fixture do taker é o falsificador desta ADR (§ abaixo).

Por que overflow nunca é "pequeno o bastante para ignorar" mesmo com quantis auto-escaláveis: (a) a
`recipe` pode pedir uma janela de quantis deliberadamente estreita (ex.: `q=[10,…,90]`, sobrando 20%
fora de propósito, para foco visual no corpo da distribuição); (b) sob replay bitemporal (`D8.9`), uma
observação atrasada dentro da janela já avaliada pode empurrar um valor para além da borda calculada
antes — expor a contagem real de overflow é o que torna esse desvio **visível** em vez de absorvido em
silêncio.

### D5 — `firing_rate`: o contrato reserva o eixo de honestidade que `T-08.8` vai preencher

```
FiringRateResult =
    { mode: "in_sample", calibWindow: Window, evalWindow: Window, rate: null }
  | { mode: "walk_forward", calibWindow: Window, evalWindow: Window, nWindows: number, rate: number }
```

**Por tipo**, `rate` só existe quando `mode = "walk_forward"`. Quando `calibWindow == evalWindow`
(`D8.2`: forçar `eval == calib`), o motor DEVE emitir `mode = "in_sample"` com `rate: null` — a
renderização não tem como construir a célula `1,04%` a partir deste tipo, só a legenda textual
`tautológico — janelas idênticas` que `D8.2` já exige literalmente. Isto não implementa a regra de
walk-forward (`T-08.8`, que decide `n=23`/OOS/`12,847%`); só impede que o tipo do motor permita, por
construção, a armadilha que `D8.2` nomeia — mesmo padrão que `min_obs` (`T-08.7`) já vai aplicar a
`n_obs`: ausência devolve `—`/`null`, nunca um número emprestado.

### D6 — o que entra no bundle versionado é a **receita**, não os números derivados

```
HistogramRecipe = {
  specVersion: number,
  quantiles: number[],           # (q_1 < … < q_k) ⊂ (0,100)
  interpolation: Interpolation,  # reuso do tipo já fixado em T-08.5
  pointMassMinShare: number,     # (0, 1]
}
```

**Por que a receita e não `e_1..e_k` já calculados:** `SPEC-001` §7 fixa
`reproduzir(run) = (bundle_hash, window, knowledge_time)` — as bordas NÃO precisam estar congeladas
no bundle para reproduzir, porque a derivação (`D2`) é uma função pura de
`(field, nature, universe, window, knowledge_time, recipe)`. Pinar `knowledge_time` (que já é um dos
três eixos declarados) já torna a leitura subjacente determinística; recalcular a receita sobre os
mesmos três eixos tem que devolver os mesmos números, sempre — e isso é literalmente o teste que
`D8.9` já exige ("roda de novo com o mesmo bundle e a mesma janela → idêntico, OU RECUSA"). Congelar
números seria um SEGUNDO mecanismo de reprodutibilidade competindo com o que a SPEC já declarou global
(`F-4`); a receita é o mecanismo que **reusa** `F-4` em vez de duplicá-lo.

Consequência prática: **o operador nunca digita uma borda de bin.** Ele escolhe (ou aceita o default
de) `quantiles`/`interpolation`/`pointMassMinShare` — parâmetro, não limiar absoluto, que é exatamente
o mandato citado no despacho aplicado ao eixo de exibição, não só ao de disparo.

### D7 — fronteira de módulo: motor (Python, `charts` novo) ⇄ render (TS, `charts` existente) ⇄ o que não é meu

```
backend/src/modules/charts/domain/       # puro, sem I/O — Nature/SeriesKey IMPORTADOS de sentimento
    field_identity.py                    #   FieldIdentity, igualdade/hash
    histogram_recipe.py                  #   HistogramRecipe, validação (mesmo padrão de
                                          #     assertValidThresholdSpec: nenhum eixo com default)
    histogram.py                         #   derive_edges/point-mass/HistogramResult (D2-D4)
    firing_rate.py                       #   FiringRateResult, o tipo de D5 (não a regra de honestidade)
backend/src/modules/charts/use_cases/    # lê via PORTA (protocolo), não concretiza store
    compute_distribution.py
    run_scan.py                          # reusa ThresholdSpec — não reimplementa union type
    compute_firing_rate.py
backend/src/modules/charts/infra/        # implementação da porta sobre o TimescaleDB de ADR-002/D4
    (fora de escopo aqui — a PORTA é decisão deste ADR, a query SQL é do builder)

backend/src/api/routes/                  # componente infra, T-01.8, NÃO decidido por este ADR
    (screener/distribution|scan|firing_rate — adaptador HTTP fino, chama use_cases, serializa)

frontend/src/app/                        # componente web
    histogram-recipe-bundle.ts           # encode/decode/hash — irmão de threshold-spec-bundle.ts,
                                          #   MESMO módulo de família, não union type novo dentro dele
frontend/src/charts/                     # componente charts, já existe (s2-swing-point.ts,
                                          #   s2-asof-frame.ts) — entra HistogramResult TIPADO,
                                          #   sai geometria (barras, incl. overflow com marca visual
                                          #   distinta — nunca fundido nem cortado da escala)
```

**Por que o motor de cálculo é Python e não TypeScript no browser:** `ADR-003/FR-1` já proíbe `charts`
(frontend) de fazer I/O — e um `scan` sobre um universo de até 570 símbolos × 30 dias é, por definição,
uma leitura de armazenamento que o browser não tem. O precedente que autoriza um módulo `charts` em
Python **importar de `sentimento`** (em vez de duplicar `Nature`/`SeriesKey`) é o mesmo que já autoriza
`backtest` a importar a grade canônica de `charts` (`ADR-003/FR-3`): vocabulário compartilhado entre
componentes de domínio é o padrão já em vigor, não uma exceção que este ADR inventa.

---

## Alternativas recusadas

| alternativa | por que recusada |
|---|---|
| **Tabela de bordas fixa por `metric`, mantida à mão** (a origem do bug de `D8.6`) | é exatamente o que `D8.6` mediu quebrado: 47,2% fora à direita no taker com bordas calibradas para outro field. Manutenção manual por metric é o "limiar absoluto disfarçado" que o mandato do despacho proíbe, uma superfície acima do `ThresholdSpec` |
| **Bordas por percentual fixo do range observado** (ex.: `min + k*(max-min)/10`) | sensível a UM outlier: um único valor de `2055,3%` no taker distorceria todas as bordas, não só a última. Quantil é robusto a isso por construção — é literalmente o motivo de `D8.7` exigir estimador de percentil declarado |
| **Congelar os números de borda no bundle** (em vez da receita) | funciona, mas duplica o mecanismo de reprodutibilidade que `F-4`/`D8.9` já declara global (`bundle_hash + window + knowledge_time`), criando dois caminhos para a mesma garantia — um dos quais pode divergir do outro silenciosamente. E impede o operador de comparar duas janelas com a MESMA receita de forma natural (bordas recalculadas automaticamente por janela) |
| **Detecção de massa pontual só para `funding`** (`interestRate`) | é o caso especial que a `PRD-001:440` mede primeiro, mas generalizar por `share(v)` custa zero a mais e evita reescrever o motor no dia em que outro field (ex.: `sum_taker_long_short_vol_ratio`, autocorrelação 0,99+ segundo `series_key.py:60`) mostrar a mesma concentração |
| **`field` = os 15 termos inteiros de `SeriesKey`** | fragmenta o histograma por símbolo, o que inviabiliza `scan` cross-symbol — o próprio job de `S4` (`SPEC-001` §6, linha `S4`) |
| **Overflow implícito (não contado, só "o que sobrou fora do gráfico")** | é a segunda metade exata do defeito que `D8.6` mediu: sem contagem exposta, os 47,2% fora da faixa desaparecem sem rastro. `D8.8` já proíbe métrica sem `n`/universo declarado; overflow sem contagem é a mesma falta, uma camada abaixo |

---

## Falsificador desta ADR

**Um histograma cujos bins + overflow + massas pontuais não somem `nTotal`** — quebra `D4` diretamente.
**Um segundo cálculo (recontagem sobre a tabela crua, via caminho independente) que discorde do
resultado do motor sob o mesmo `(field, nature, universe, window, knowledge_time)`** — é exatamente o
teste que `D8.1` já exige ("dois caminhos independentes … não pela mesma tabela duas vezes").
**Uma borda numérica hardcoded em `histogram.py`** (qualquer literal de corte que não venha de
`recipe.quantiles` calculado sobre `R`) — mesma classe de falsificador que `D8.1` aplica ao limiar de
`scan` ("o limiar sai do código"), estendida às bordas de exibição.
**O teste de regressão obrigatório para `T-08.6` fechar, com o número que `D8.6` já publicou:** fixture
do taker (mesmo dataset da medição), `recipe.quantiles = [1, 99]` (ou o que a implementação escolher
como default, DECLARADO), `pointMassMinShare` fora do alcance da massa do taker (que não tem massa
pontual relevante) → `overflowRight.count / nTotal` tem que reproduzir uma cauda **proporcional aos 1%
pedidos**, nunca os 47,2% que a tabela fixa antiga produzia — e o `extreme` do overflow direito tem que
bater com `2055,3%` no dataset medido.

---

## Consequência

- `T-08.6` (builder) implementa `backend/src/modules/charts/domain/{field_identity,histogram_recipe,histogram,firing_rate}.py` + `use_cases/{compute_distribution,run_scan,compute_firing_rate}.py`, mais `frontend/src/app/histogram-recipe-bundle.ts` (irmão de `threshold-spec-bundle.ts`) e o renderizador em `frontend/src/charts/`. **Não implementa** rota HTTP (`infra`, fora de `[agents.by_component]` até `T-01.8`) nem a regra de honestidade de `firing_rate` (`T-08.8`) nem `min_obs`/telemetria de `z` (`T-08.7`) — só os tipos que os recebem sem quebra.
- `T-08.7` preenche `n_obs` efetivo por ponto e dispersão do `z` **dentro** do `HistogramResult`/pipeline aqui definido, não como um contrato paralelo.
- `T-08.8` preenche a regra de `mode` de `FiringRateResult` (`D5`) — o tipo já impede a armadilha tautológica por construção; a task decide os NÚMEROS (`n=23`, OOS, `12,847%`), não a forma.
- `T-08.12` (regras de renderização de painel) consome `HistogramResult`/geometria daqui como um dos dados que popula o grid da bancada.

## Como o owner confere isto sem confiar no arquiteto

Isto é uma decisão de arquitetura pré-implementação — **não há código para rodar ainda**. A verificação
fica em duas camadas:

1. **Contra os números já medidos e citados nesta ADR** (`D8.1`/`D8.6`/`D8.7`, na tabela de DoD do plano
   `08`, `docs/plans/SPEC-001-plataforma-dados/08_superficie_e_reprodutibilidade.md`): confira que os
   números que este ADR cita (`951/2013`, `47,2%`, `2055,3%`, `p90=p99`, `9/1500→184/1500`) batem com os
   da tabela de DoD — são a MESMA medição, citada, não recalculada aqui `[DOC]`.
2. **Quando `T-08.6` (builder) existir:** o falsificador acima (fixture do taker + `overflowRight`
   reproduzindo `2055,3%`) é o teste de regressão que prova esta ADR, e é exatamente o formato "fixture
   de mercado conhecido" que este projeto aceita como verificação — o owner confere o número no fixture,
   não a lógica Python.

Rotulado explicitamente como **opinião de arquitetura, não medição nova**: a escolha de `(quantiles,
interpolation, pointMassMinShare)` como os três eixos da `HistogramRecipe` (`D6`) é julgamento de
domínio deste agente, sem um documento público ou medição que a fixe como a ÚNICA forma correta —
`[OPINIÃO: quant-architect, 2026-09-04]`. O que É medido e não-opinião: que bordas fixas quebram
(`D8.6`), que percentil sem estimador mente (`SPEC-001:305`), e que massa pontual existe e muda p90/p99
(`D8.7`/`PRD-001:440`).
