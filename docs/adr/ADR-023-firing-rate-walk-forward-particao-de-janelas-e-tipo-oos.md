# ADR-023 — `firing_rate` walk-forward: partição rolante calib/eval, calibração congelada via `AbsoluteSpec`, e `WalkForwardFiringRate` estendido para carregar dispersão

**Status:** `proposto` · **Data:** 2026-09-04 · **Componente:** `charts` (motor, `backend/src/modules/charts/`)
**Feature:** `plataforma-dados` (`T-08.8`, `CST-76`) · **Autor:** `quant-architect`
**Rev de ancoragem:** `origin/master` em `bc19f80` (`T-08.6`/`ADR-020` e `T-08.4`/`ADR-021` já mergeados; `T-08.7`/min_obs ainda `todo`, não bloqueia esta ADR — ver §"O que não fecha").
**Mandato citado no despacho, literal:** *"firing_rate in-sample declarado TAUTOLÓGICO na própria célula; OOS walk-forward"* — `D8.2`: forçar `eval == calib` → a célula lê `tautológico — janelas idênticas`, nunca `1,04%`. OOS walk-forward (calibra 7 d, avalia o dia seguinte, n=23): média **1,404%**, máx **12,847% = 12,8× o alvo**; com q=99,9, **52×** `[DOC: docs/plans/SPEC-001-plataforma-dados/08_superficie_e_reprodutibilidade.md:27, docs/specs/PRD-001-plataforma-dados.md:649]`.

**Fecha:** a estrutura de partição do walk-forward (como o dado vira N pares calib/eval), como a calibração de um `ThresholdSpec` é congelada para não vazar para o lado eval, e como `FiringRateResult` (`ADR-020/D5`) se estende para carregar um resultado OOS sem virar comparável ao número in-sample por acidente de tipo.
**Não fecha:** `min_obs`/`n_obs` por ponto e telemetria de dispersão do `z` cross-symbol (`T-08.7`, `D8.4`/`D8.5` — ortogonal: aquela é dispersão ENTRE símbolos numa leitura, esta é dispersão ENTRE janelas temporais); a rota HTTP (`infra`, `T-01.8`); calibração walk-forward para `RobustZSpec` (nomeado, não decidido — ver `D-WF3`); qualquer noção de "otimizar" a receita de calibração — isto mede honestidade de UM limiar já escolhido, não escolhe o melhor.

---

## Contexto

### O que já existe e esta ADR reusa, não reinventa

- `FiringRateResult = InSampleFiringRate | WalkForwardFiringRate`, já implementado em
  `backend/src/modules/charts/domain/firing_rate.py` (`ADR-020/D5`, `T-08.6`). `InSampleFiringRate.rate`
  é `None` por CAMPO do dataclass — nenhum construtor põe um número ali. `WalkForwardFiringRate` já
  existe como CASCA (`calib_window`, `eval_window`, `n_windows`, `rate`) mas **nenhuma função a
  constrói** — `use_cases/compute_firing_rate.py` levanta `WalkForwardRuleNotDecidedError` por nome
  sempre que `calib_window != eval_window`, citando esta task literalmente.
- `evaluate_scan` (`backend/src/modules/charts/domain/scan.py`) já sabe testar um `ThresholdSpec`
  contra uma população e devolver `fired_share = n_fired/n_total`. Para `AbsoluteSpec`, o teste é
  **puramente aritmético sobre o valor literal `pct`** — a população só entra para contar, nunca para
  recalibrar o corte. Para `PercentileSpec`/`RobustZSpec`, o corte é **recalculado a partir da MESMA
  população que está sendo testada** — é exatamente essa recalculação in-place que faz `D8.2` tautológico
  quando `eval == calib`.
- `percentile()` (`backend/src/modules/charts/domain/histogram.py`) já é a função pura que
  `PercentileSpec` usa por baixo. Está exportada, sem I/O, pronta para ser chamada duas vezes com
  populações diferentes.
- `ObservationSource` (porta em `use_cases/compute_distribution.py`) já aceita `(field, nature, universe,
  window, knowledge_time_ms)` e devolve a população elegível — **já é genérica o bastante para ser
  chamada uma vez por fold**, sem mudança de assinatura.
- `Window` (meia-aberta, `[start_ms, end_ms)`, epoch ms) e a disciplina "hora chega como parâmetro,
  este módulo nunca lê relógio" (`as_of_accessor.py`, citada por `ADR-021/D4`) já são o vocabulário
  desta ADR.

### O número que esta ADR tem que reproduzir, com a conta batendo

`D8.2` mede **n=23** folds sobre calibração de **7 dias**, avaliação do **dia seguinte** (1 dia). Isso só
bate com uma janela total de **30 dias** sob partição **rolante, não sobreposta entre calib e eval,
passo = comprimento do eval**: `N = floor((30 − 7 − 1)/1) + 1 = 23`. Este é o mesmo universo "BTC/30d"
que `ADR-020` já usa como fixture (`scan` com `Absolute{5.0}`, `D8.1`) — **não é coincidência**, é o
mesmo dataset sendo reaproveitado para os dois falsificadores. Esta aritmética é o falsificador
estrutural desta ADR (§ abaixo), não uma medição nova.

---

## Decisão

### D-WF1 — Partição: janelas rolantes, não sobrepostas ENTRE calib e eval, passo = comprimento do eval

```
WalkForwardRecipe = {
  specVersion: number,
  calibLengthMs: number,     # ex.: 7 dias, em ms — NUNCA contagem de barras (ver D-WF3, por quê)
  evalLengthMs: number,      # ex.: 1 dia, em ms
  stepMs: number,            # default = evalLengthMs — folds contíguos, cobrindo o eval sem buraco
  minObsEval: number,        # floor no tamanho da fatia eval; abaixo disso, o fold é EXCLUÍDO
}

fold(i).calib = [window.start + i*stepMs,                    window.start + i*stepMs + calibLengthMs)
fold(i).eval  = [window.start + i*stepMs + calibLengthMs,     window.start + i*stepMs + calibLengthMs + evalLengthMs)

para i = 0, 1, 2, … enquanto fold(i).eval.end_ms <= window.end_ms
```

**Por que `stepMs` default é `evalLengthMs` e não `calibLengthMs` nem um valor livre:** com
`step = evalLength`, os folds cobrem o eval-span **inteiro, sem buraco e sem sobreposição entre evals
consecutivos** — cada instante de tempo dentro de `[window.start + calibLengthMs, window.end)` cai em
EXATAMENTE um `eval` de EXATAMENTE um fold. Um `step` maior deixaria trechos do histórico nunca avaliados
OOS (uma lacuna silenciosa no que já é uma medida de honestidade); um `step` menor faria dois folds
avaliarem o MESMO ponto duas vezes, inflando `n_windows` sem adicionar informação independente. **Os
`calib` de folds consecutivos SE SOBREPÕEM** (fold 1 calib=`[0,7d)`, fold 2 calib=`[1d,8d)`) — isso é
esperado e correto: é a definição de "rolling calibration", não um defeito. `stepMs` é parâmetro (não
fixo em `evalLengthMs`) só para permitir um caller pedir passos maiores de propósito (ex.: amostragem
mais esparsa por custo de leitura) — **o `builder` de `T-08.8` fixa `stepMs = evalLengthMs` como o
DEFAULT declarado**, mesmo padrão de "recipe com default nomeado" que `DEFAULT_HISTOGRAM_RECIPE` já
usa (`ADR-020/D6`).

**Por que não "expanding window" (calib cresce, sempre desde o início do histórico):** o número medido
(`n=23`, calib=7d fixo) só é reproduzível com calib de comprimento CONSTANTE — expanding produziria uma
sequência de folds com populações de calibração de tamanhos crescentes, um parâmetro a mais
(tamanho mínimo/máximo do expanding) que nenhuma medição desta SPEC fixa. **Fica de fora, nomeado, não
escondido**: se o owner um dia quiser expanding, é uma extensão de `WalkForwardRecipe`, não uma reinterpretação
silenciosa do `calibLengthMs` atual.

**Guarda de entrada:** se `window.end_ms − window.start_ms < calibLengthMs + evalLengthMs`, a função
RECUSA antes do fold 0 (`InsufficientWindowForWalkForwardError`) — não há como produzir `n_windows >= 1`,
e `WalkForwardFiringRate.__post_init__` já exige `n_windows > 0` (`ADR-020/D5`).

### D-WF2 — `knowledge_time` é POR FOLD, pinado no limite calib→eval — nunca um valor global para a chamada inteira

Esta é a decisão anti-lookahead central desta ADR, e é o motivo pelo qual "walk-forward" não é só
"chamar `compute_distribution` várias vezes com a mesma configuração": **cada fold usa um
`knowledge_time_ms` PRÓPRIO**, derivado da própria partição, não herdado de um parâmetro único da
chamada:

```
knowledge_time(fold_i, lado="calib") = fold_i.calib.end_ms    # = fold_i.eval.start_ms
knowledge_time(fold_i, lado="eval")  = fold_i.eval.end_ms
```

Isto simula exatamente a pergunta que `D8.2` faz: *"se eu tivesse calibrado o limiar só com o que era
sabido até o início do dia seguinte, quantas vezes ele teria disparado NAQUELE dia?"* — nunca *"com tudo
que sei hoje, quantas vezes um limiar calibrado sobre um pedaço do passado dispararia sobre outro
pedaço do passado"* (essa segunda pergunta reintroduz lookahead pela porta de trás: dado de `FLOW`/`STOCK`
que só ficou observável DEPOIS do fim do fold ainda assim entraria na população se `knowledge_time` fosse
fixo em "agora"). Ambos os lados (`calib` e `eval`) continuam passando pela mesma política de
elegibilidade §5.11 já em vigor em `ObservationSource` (`ADR-020/D2` passo 1) — este ADR não a reescreve,
só multiplica o número de vezes que ela é invocada com argumentos diferentes.

**Consequência de arquitetura, respondendo direto à pergunta do despacho ("há necessidade de estado
adicional no motor?"): NÃO.** Nenhuma classe de estado mutável, nenhum cache entre folds, nenhuma
dependência de um fold sobre o resultado do fold anterior. Cada fold é uma chamada independente e
paralelizável a `ObservationSource.observed_values`/`resolved_universe_size` com um `(window,
knowledge_time_ms)` diferente — a MESMA porta que `ADR-020/D7` já decidiu, chamada `2×N` vezes em vez de
uma. "Estado" apareceria se a calibração de um fold pudesse influenciar a leitura de outro (ex.:
expanding window acumulando estatística) — e é exatamente por isso que `D-WF1` recusou expanding acima.
A implicação de performance (`2×N` leituras, algumas se sobrepondo entre folds vizinhos) é observação de
`infra`/otimização de query, não decisão de domínio — nomeada aqui como **opinião não-bloqueante**: o
`builder` de `T-01.8` pode decidir buscar a união dos ranges numa query só e fatiar em memória, sem que
isto mude o contrato desta ADR.

### D-WF3 — Calibração congela em `AbsoluteSpec`; só `PercentileSpec` é suportado, `RobustZSpec` fica nomeado e fora

O `ThresholdSpec` a calibrar entra como um tipo NOVO, dedicado — não o `PercentileSpec` de `T-08.5`:

```
WalkForwardThresholdRecipe = { q: float, interpolation: Interpolation, op: Operator }
```

**Por que não reusar `PercentileSpec` diretamente:** `PercentileSpec.window`/`.min_obs` já têm um
significado fixado por `T-08.5` — o tamanho da população de UMA leitura rolante de cross-section (unidade
não declarada em `SPEC-001` §3.7, mas usada como contagem de barras no exemplo canônico
`rolling(2016, min_periods=576)`). `calibLengthMs` desta ADR é comprimento de TEMPO da janela de
calibração de UM fold — um eixo diferente, e reusar `PercentileSpec.window` para os dois papéis deixaria
um campo do objeto **presente mas ignorado** sempre que o caller passasse um `PercentileSpec` completo
para o walk-forward — a mesma classe de armadilha que este projeto já rejeitou noutro lugar (nenhum eixo
com default silencioso, `ADR-020/D6`). `WalkForwardThresholdRecipe` fica deliberadamente menor: só os
três campos que a calibração POR QUANTIL realmente usa.

Por fold:

```
calib_values = source.observed_values(field, nature, universe, fold.calib,  knowledge_time = fold.calib.end_ms)
if len(calib_values) < min_obs_calib:  fold é EXCLUÍDO (ver D-WF4)
threshold_value = percentile(calib_values, wf_threshold.q, wf_threshold.interpolation)   # reusa histogram.percentile, sem mudança
frozen = AbsoluteSpec(pct=threshold_value, op=wf_threshold.op)                            # o limiar vira LITERAL

eval_values = source.observed_values(field, nature, universe, fold.eval, knowledge_time = fold.eval.end_ms)
if len(eval_values) < recipe.minObsEval:  fold é EXCLUÍDO (ver D-WF4)
fold_result = evaluate_scan(eval_values, field=field, nature=nature, spec=frozen, ...)    # reusa scan.py, sem mudança
fold_rate = fold_result.fired_share
```

**Por que degradar para `AbsoluteSpec` em vez de inventar uma segunda função `_fires`:** `evaluate_scan`
já trata `AbsoluteSpec` como "número literal, população só conta, nunca recalibra" (`scan.py`,
`_resolve_min_obs` devolve `None` para `Absolute` pelo motivo exato inverso — lá, porque um literal não
tem população para se ajustar; aqui, porque o literal FOI calculado sobre uma população DIFERENTE da que
está sendo testada, e não deve ser recalculado sobre a de teste). Isto faz a garantia anti-tautologia
valer **por construção de tipo**, não por disciplina de quem escreve a chamada: não existe caminho de
código em que `frozen.pct` seja recalculado a partir de `eval_values` — `AbsoluteSpec.__post_init__` só
valida `op`/finitude, nunca lê população nenhuma.

**Por que `RobustZSpec` fica fora, nomeado:** calibrar um `RobustZSpec` exigiria congelar DOIS números
(mediana e MAD do calib), não um, e testar cada ponto do eval como `(valor − mediana_congelada) /
(1.4826×mad_congelado)` — uma função de congelamento diferente de "vira `AbsoluteSpec`". Nenhuma medição
desta SPEC valida esse caminho (`D8.2` só mede `q=99`/`q=99,9`, ambos percentil), e generalizar sem
fixture seria exatamente o "curve fitting com cerimônia" que este projeto recusa. `AbsoluteSpec` também
não entra como alvo de calibração — ele não tem parâmetro derivado da população, então "walk-forward"
não faz sentido para ele (não há nada para vazar entre calib e eval). Uma chamada com `RobustZSpec` ou
`AbsoluteSpec` como `wf_threshold` RECUSA (`NonCalibratableSpecError`), citando por nome que só `q`
percentílico está decidido.

### D-WF4 — Fold com população insuficiente é EXCLUÍDO, nunca zerado nem interpolado, e a exclusão é visível

Um fold cujo `calib_values` ou `eval_values` não atinge o piso declarado (`min_obs_calib` reusa o
princípio de `SPEC-001:304`, mesmo texto que já governa `min_obs` em `PercentileSpec`; `minObsEval` é
campo próprio de `WalkForwardRecipe`) **não entra no cômputo** — `n_windows` conta só os folds
efetivamente calculados, e um contador `excludedWindows: int` (não uma lista de motivos, para não
inflar o contrato — a CONTAGEM já é suficiente para o operador notar "faltou dado", investigar é tarefa
de `S3`/inspetor de série) fica no resultado. Se **todos** os folds forem excluídos, a função recusa
(`InsufficientWindowForWalkForwardError`, mesmo tipo do guard de `D-WF1` — população vazia é o mesmo
fato, medido depois em vez de antes). **Nunca**: substituir a taxa de um fold ausente por `0`, pela
média dos outros folds, ou por qualquer forma de preenchimento — isso inventaria uma observação que
não existe, a mesma classe de defeito que `SPEC-001` §2.4 já nomeia para interpolação de série temporal,
uma superfície acima.

### D-WF5 — `WalkForwardFiringRate` estendido: dispersão é campo obrigatório, não median/mean escondendo o pior fold

**Emenda a `ADR-020/D5`.** A casca atual (`n_windows`, `rate: float` único) **esconde exatamente o
número que `D8.2` chama de alarmante**: a média OOS (1,404%) e o máximo (12,847% = 12,8× o alvo) são
DUAS afirmações diferentes, e publicar só a média repete, uma camada acima, o erro que `D8.5` já nomeou
para dispersão cross-symbol ("dispersão anômala é a assinatura de janelas de tamanhos diferentes com o
mesmo rótulo" — aqui, o análogo temporal é "um fold de 12,8× escondido dentro de uma média de 1,4×").

```
WalkForwardFiringRate = {
  mode: "walk_forward",
  totalWindow: Window,              # SUBSTITUI calibWindow/evalWindow — ver justificativa abaixo
  recipe: WalkForwardRecipe,        # ecoa a partição usada — reprodutibilidade sem duplicar mecanismo
  threshold: WalkForwardThresholdRecipe,
  nWindows: int,                    # folds EFETIVAMENTE computados (pós-exclusão)
  excludedWindows: int,             # D-WF4 — nunca escondido, sempre ao lado de nWindows
  rates: tuple[float, ...],         # NOVO — uma por fold incluído, len(rates) == nWindows
  rate: float,                      # mean(rates) — mantido como número PRINCIPAL renderizado
  maxRate: float,                   # NOVO — max(rates), o número que D8.2 chama "12,8× o alvo"
}
```

**Por que `totalWindow` substitui `calibWindow`/`evalWindow` no ramo `walk_forward` (o ramo `in_sample`
NÃO muda — ele continua com exatamente um par calib/eval, porque são literalmente o mesmo intervalo):**
um par único de janelas não descreve N=23 folds — mostrar só o PRIMEIRO ou o ÚLTIMO fold seria arbitrário
e enganoso (pareceria que só uma calibração aconteceu), e duplicar `calibWindow`/`evalWindow` como listas
de N elementos é redundante com `recipe` (que já determina os N pares, dado `totalWindow`). `totalWindow`
(o span inteiro varrido) + `recipe` (comprimentos/passo) é a MESMA disciplina de `ADR-020/D6`: o que
entra no contrato é a RECEITA que gera os números, não os números derivados congelados.

**Invariante que um teste de regressão tem de fixar:** `len(rates) == nWindows`, `rate ==
statistics.mean(rates)`, `maxRate == max(rates)`, e sobre o fixture de `D8.2` (BTC/30d, `calibLengthMs`
= 7 dias, `evalLengthMs` = 1 dia, `q=99`): `nWindows == 23`, `rate` reproduzindo **1,404%** (tolerância
de arredondamento a definir pelo builder) e `maxRate` reproduzindo **12,847%**.

### D-WF6 — Dois pontos de entrada em `use_cases/`, nunca um só ramificando por tipo de argumento

```
compute_firing_rate(calib_window, eval_window) -> FiringRateResult          # inalterado (ADR-020/D5,T-08.6)
                                                                              #   só constrói in_sample;
                                                                              #   recusa qualquer par
                                                                              #   calib!=eval AD-HOC que
                                                                              #   não venha da receita abaixo
compute_walk_forward_firing_rate(source, *, field, nature, universe,
                                  window, threshold, recipe) -> WalkForwardFiringRate   # NOVO, T-08.8
```

**Por que dois pontos de entrada e não um `compute_firing_rate` que aceita `recipe: WalkForwardRecipe |
None`:** a assinatura de `compute_firing_rate` hoje é `(calib_window, eval_window)` — sem `source`, sem
`field`, porque o ramo `in_sample` não lê nada (é um espelho de igualdade de janelas). Fazer a MESMA
função também orquestrar leitura via porta, multiplicar por N folds e calcular percentil mudaria a
assinatura para todo caller existente por causa de um ramo que NENHUM caller hoje exercita — o mesmo
argumento que já justifica `ScanResult`/`HistogramResult` serem tipos irmãos, não uma união dentro de
uma função só. `FiringRateResult` continua sendo o tipo de RETORNO comum (é isso que faz a UI tratar os
dois de forma uniforme por `mode`); as duas FUNÇÕES que o produzem podem ter formas de entrada diferentes
sem quebrar esse contrato.

---

## Alternativas recusadas

| alternativa | por que recusada |
|---|---|
| **Expanding window** (calib cresce desde o início do histórico) | nenhuma medição desta SPEC a valida; introduz um parâmetro a mais (piso/teto do expanding) sem fixture — `D-WF1` |
| **`step` livre por padrão, sem amarrar a `evalLengthMs`** | produz lacunas (step maior) ou dupla-contagem (step menor) no eval-span coberto — `D-WF1` |
| **`knowledge_time` único para a chamada inteira** (não por fold) | reabre lookahead: um fold "veria" dado que só ficou observável depois do próprio fim do fold, se `knowledge_time` for fixo em "agora" — exatamente a classe de erro que `SPEC-001` §2.4 já mede como a inversão histórica deste projeto — `D-WF2` |
| **Reusar `PercentileSpec` inteiro como a receita de calibração** | `.window`/`.min_obs` têm significado de OUTRO eixo (população de uma leitura de cross-section), ficariam presentes e ignorados no caminho walk-forward — `D-WF3` |
| **Generalizar calibração para `RobustZSpec` já nesta ADR** | exige congelar `(mediana, MAD)`, não um escalar; nenhuma medição de `D8.2` cobre esse caminho — fica nomeado, não decidido — `D-WF3` |
| **Fold com população insuficiente vira `rate=0` ou é preenchido pela média dos outros** | inventaria uma observação inexistente — mesma classe de defeito que a proibição de interpolação em série temporal (`SPEC-001` §2.4) — `D-WF4` |
| **`WalkForwardFiringRate.rate` como único número (sem `maxRate`/`rates`)** | esconde o fold de 12,8×, repetindo o erro que `D8.5` já nomeou para dispersão cross-symbol, uma superfície acima — `D-WF5` |
| **Uma função `compute_firing_rate` só, ramificando por tipo de argumento** | muda a assinatura de um caller já em produção (`T-08.6`) por causa de um ramo que ele não exercita — `D-WF6` |

---

## Falsificador desta ADR

**Estrutural (aritmético, sem precisar do builder existir):** dado `window` de 30 dias, `calibLengthMs`
= 7 dias, `evalLengthMs` = 1 dia, `stepMs` = 1 dia (default), o número de folds gerados por `D-WF1` tem
que ser **exatamente 23** — `floor((30−7−1)/1)+1`. Se a fórmula de partição implementada não produzir 23
sobre esses três números, ela não é a partição que `D8.2` mediu.

**De comportamento (quando o builder existir):** um fold cujo `eval` inclui um ponto cujo `available_at`
(ou `bucket_end`, conforme `nature`) é POSTERIOR a `fold.eval.end_ms` não pode aparecer em `eval_values`
— testável plantando um ponto assim num fixture sintético e conferindo que `evaluate_scan` nunca o vê.

**De regressão obrigatória, com o número que `D8.2` já publicou:** fixture BTC/30d, `q=99`,
`calibLengthMs=7d`, `evalLengthMs=1d` → `nWindows=23`, `rate≈1,404%`, `maxRate≈12,847%`. Com `q=99,9`
sobre o mesmo fixture → `maxRate≈52×` o alvo (`docs/plans/.../08_superficie_e_reprodutibilidade.md:27`).
Um `rate`/`maxRate` que não reproduza estes números sobre o MESMO dataset é falsificador direto desta
ADR — **não um número novo a aceitar**, porque `D8.2` já é medição fechada, não hipótese.

**Um `WalkForwardFiringRate` cujo `rate` foi computado recalibrando o limiar sobre `eval_values`** (em
vez de `calib_values` congelado via `AbsoluteSpec`) é o mesmo `D8.2` reencarnado dentro do próprio código
que existe para consertá-lo — falsificador de `D-WF3`.

---

## Consequência

- `T-08.8` (builder) implementa `backend/src/modules/charts/domain/walk_forward.py`
  (`WalkForwardRecipe`, `WalkForwardThresholdRecipe`, `InsufficientWindowForWalkForwardError`,
  `NonCalibratableSpecError`, a função de partição de `D-WF1`) e estende
  `backend/src/modules/charts/domain/firing_rate.py::WalkForwardFiringRate` conforme `D-WF5`
  (mudança de shape — `calib_window`/`eval_window` saem do ramo `walk_forward`, entram
  `total_window`/`recipe`/`threshold`/`excluded_windows`/`rates`/`max_rate`; o ramo `in_sample`
  não muda um campo). Implementa `use_cases/compute_walk_forward_firing_rate.py` (`D-WF6`),
  reusando `ObservationSource` sem alterar a porta, `histogram.percentile` e `scan.evaluate_scan`
  sem alterar nenhum dos dois.
- `use_cases/compute_firing_rate.py` **não muda** — continua só o ramo `in_sample`, e continua
  recusando qualquer par `calib_window != eval_window` que não passe pela receita desta ADR.
- `T-08.7` (min_obs/dispersão de `z` cross-symbol) permanece ortogonal — quando fechar, o
  `min_obs_calib`/`min_obs_eval` que hoje são campos soltos de `WalkForwardRecipe` podem ganhar
  o mesmo tratamento de ausência tipada que `T-08.7` decidir para o resto do motor, sem
  reabrir `D-WF1`/`D-WF4`.
- `frontend/src/charts/` (renderização) ganha o consumo do ramo `walk_forward` estendido — fora
  de escopo desta ADR (`ADR-020/D7` já reserva render para `charts`/`web`, TS); a legenda que
  `D8.2` exige (`tautológico — janelas idênticas` no `in_sample`, e algo como `OOS · N=23 folds
  · máx 12,8×` no `walk_forward`) é decisão de UI, gate `ux-ui-mastery`, não desta ADR.

## Como o owner confere isto sem confiar no arquiteto

Isto é decisão de arquitetura pré-implementação — os números de `D8.2` já são medição fechada
(`[DOC]`, citada com arquivo e linha acima), não recalculada por esta ADR. Duas camadas:

1. **Contra os documentos já citados**: `D8.2`, `docs/plans/.../08_superficie_e_reprodutibilidade.md:27`
   e `PRD-001:649` têm que bater exatamente com os números repetidos aqui (`n=23`, `1,404%`,
   `12,847%`, `52×`) — são a MESMA medição, citada três vezes, nunca recalculada.
2. **Quando `T-08.8` (builder) existir**: os dois falsificadores acima (a fórmula de partição
   reproduzindo `23` a partir de `30/7/1`, e o fixture de regressão reproduzindo `1,404%`/`12,847%`
   sobre o MESMO dataset BTC/30d que `ADR-020` já usa) são o teste de regressão — "fixture de
   mercado conhecido" no sentido que este projeto aceita: o owner confere o número contra o
   documento que já o publicou, não a lógica Python linha a linha.

Rotulado explicitamente como **opinião de arquitetura, não medição nova**: a escolha de
`WalkForwardThresholdRecipe` como tipo dedicado em vez de reusar `PercentileSpec` (`D-WF3`), o
default `stepMs = evalLengthMs` (`D-WF1`), e a divisão em dois pontos de entrada (`D-WF6`) são
julgamento de domínio deste agente sobre COMO estruturar o motor — `[OPINIÃO: quant-architect,
2026-09-04]`. O que É medido e não-opinião: os números de `D8.2` citados acima, e que
`AbsoluteSpec`/`evaluate_scan` já existem com a semântica exata que `D-WF3` reusa (`scan.py`,
código em produção desde `T-08.6`).
