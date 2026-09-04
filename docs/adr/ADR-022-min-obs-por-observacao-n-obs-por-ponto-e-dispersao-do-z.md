# ADR-022 — `min_obs` é propriedade da OBSERVAÇÃO (não do agregado), `n_obs` efetivo por ponto entra no tipo, dispersão do `z` é telemetria — nunca decisão

**Status:** `proposto` · **Data:** 2026-09-04 · **Componente:** `charts` (motor, só o caminho `scan`/`ThresholdSpec`) — não decide `infra` nem `web`, não reabre `distribution`/`firing_rate` além do que `D5`/`D6` nomeiam
**Feature:** `plataforma-dados` (`T-08.7`, `CST-75`) · **Autor:** `quant-architect`
**Rev de ancoragem:** worktree `tasks/T-08.7-anti-overfit-min-obs`, base `master`/`0d02596` — `T-08.6` já mergeado (`backend/src/modules/charts/{domain,use_cases}/`, `ADR-020` implementado); `find backend/src/modules/charts -name '*.py'` lista `field_identity.py`, `histogram_recipe.py`, `histogram.py`, `threshold_spec.py`, `scan.py`, `firing_rate.py`, `compute_distribution.py`, `run_scan.py`, `compute_firing_rate.py`.
**Estende:** [`ADR-020`](ADR-020-s4-bancada-bordas-de-bin-e-contrato-motor-renderizacao.md) — que reservou o campo e nomeou esta ADR, literal: *"T-08.7 preenche `n_obs` efetivo por ponto e dispersão do `z` **dentro** do `HistogramResult`/pipeline aqui definido, não como um contrato paralelo."* Esta ADR é **nova** (não emenda `ADR-020`) porque carrega falsificador e alternativas próprios, e porque `ADR-020` listou esta decisão explicitamente em seu **"Não fecha"** — mesmo padrão que `T-08.8` vai receber para a honestidade de `firing_rate`.

**Mandato citado no despacho, literal:** *"Anti-overfit: `min_obs` devolve ausência, `n_obs` efetivo POR PONTO, dispersão do `z` como telemetria."* Caso concreto nomeado: `rolling(2016, min_periods=576)` **nunca preencheu a janela nos alts** e a conclusão publicada caiu — uma métrica calculada sobre poucas observações pareceu válida e era ruído.

**Fecha:** onde `min_obs` é verificado (por observação, não pelo tamanho agregado da população), o que "devolver ausência" é NO TIPO (união discriminada, não `None` solto), como `n_obs` efetivo é calculado e exposto por ponto, e como a dispersão do `z` vira telemetria sem virar um segundo filtro.
**Não fecha:** a regra de `firing_rate` walk-forward (`T-08.8`, `D8.2` — o tipo já existe, `ADR-020/D5`); a rota HTTP (`infra`, `T-01.8`); a query SQL concreta do adaptador `ObservationSource` sobre o TimescaleDB de `ADR-002/D4` (continua "do builder", `ADR-020/D7`); nenhuma borda de bin nem massa pontual de `distribution`/`histogram.py` é reaberta — `D5` abaixo explica por quê.

---

## Contexto

### O que `T-08.6` já entregou, e onde ele já é insuficiente por tipo — não por bug

`evaluate_scan` (`backend/src/modules/charts/domain/scan.py:137-178`) já tem um `MinObsNotMetError`
(linha 40-49) que dispara quando `n_total = len(values) < min_obs`. Isto **é correto e fica** — é a
defesa contra uma população *inteira* pequena demais (poucos símbolos resolvidos no universo, ou janela
sem dado nenhum). **Mas `values: Sequence[float]` já perdeu, antes de chegar aqui, exatamente a
informação que o caso concreto do despacho precisa**: `float` não carrega (a) QUEM produziu aquele
número (`instrument_id`) nem (b) QUANTAS observações reais alimentaram aquele número específico
(`n_obs`). Um agregado de 2000 números pode passar tranquilamente em `n_total >= min_obs` mesmo que
metade deles tenha sido calculada sobre uma janela que nunca encheu — **é precisamente essa mistura que
derrubou a conclusão publicada**: BTC contribuiu números de janela cheia (2016 barras reais), os alts
contribuíram números de janela quase-vazia (perto de `min_periods=576`), e o agregado, olhado como um
todo, não denuncia nada — o defeito só aparece **por ponto**, e só aparece **por símbolo**.

`compute_distribution.py:36-48` (`ObservationSource.observed_values`) já declara o contrato de leitura:
"toda observação §5.11-elegível de `field` sobre `universe`/`window`, as of `knowledge_time`" — isso é
POOLING (todo par `(símbolo, barra)` dentro da janela, achatado em uma lista de `float`). Este ADR não
reabre esse pooling para `distribution`/`histogram.py` (`D5` abaixo) — reabre APENAS o caminho `scan`,
que é o único que carrega `min_obs`/`window` em `ThresholdSpec` (`threshold_spec.py:67-134`,
`PercentileSpec`/`RobustZSpec`; `histogram_recipe.py` não tem esses eixos — confirmado por leitura, não
suposição).

### Os três números que este ADR tem que responder, com o comando que os produziu

| DoD | medição | consequência arquitetural |
|---|---|---|
| `D8.4` | `rolling(2016, min_periods=576)` nunca encheu a janela nos alts; BTC rodou `rolling` verdadeiro, os alts rodaram `expanding` — mesmo rótulo, estimador diferente `[DOC: PRD-001:389, SPEC-001:304]` | `n_obs` tem que viajar **junto com cada valor individual**, não como um escalar único por chamada de `scan` — senão o agregado nunca denuncia a mistura |
| `D8.5` | dispersão anômala do `z` cross-símbolo é a assinatura de "janelas de tamanhos diferentes com o mesmo rótulo" `[DOC: docs/plans/SPEC-001-plataforma-dados/08_superficie_e_reprodutibilidade.md:30]` | a dispersão só é calculável se cada `z` estiver amarrado a um `instrument_id` — **identidade é pré-requisito de telemetria**, não luxo |
| `D8.8` | toda métrica transversal carrega `n` e o universo derivado do dado (já em vigor: `HistogramResult.n_total`/`ScanResult.n_total`, `UniverseInfo`) | a EXCLUSÃO por `min_obs` tem que ser um número declarado (`n_excluded_min_obs`), não um encolhimento silencioso de `n_total` — a mesma disciplina, uma camada abaixo |

---

## Decisão

### D1 — `Observation` substitui o `float` nu no caminho `scan`: identidade + valor + `n_obs`

```python
@dataclass(frozen=True)
class Observation:
    instrument_id: str   # SERIES_KEY_TERMS já usa este nome — sentimento/domain/series_key.py:41
    value: float
    n_obs: int            # contagem de observações REAIS (§5.11-elegíveis) que alimentaram `value`
                           # dentro de `spec.window`; para um field que já é atômico (uma leitura
                           # pontual, sem agregação), n_obs = 1 — nunca inventado, nunca "= window".
```

`n_obs` não é recalculado dentro de `charts/domain` (que continua sem I/O, `ADR-003/FR-1`): é o
adaptador de `ObservationSource` — a query SQL contra `TimescaleDB` (`ADR-002/D4`), "do builder [de uma
task futura]" por `ADR-020/D7` — quem sabe quantas barras reais existiram para aquele `instrument_id`
dentro daquela janela. Este ADR fixa o **contrato**, não a query: `ObservationSource.observed_values`
(`compute_distribution.py:36-48`) passa a devolver `Sequence[Observation]` em vez de `Sequence[float]`
**só na chamada que `run_scan.py` faz** — `compute_distribution.py` (o caminho de `distribution`/
`histogram.py`) projeta `[o.value for o in observations]` antes de chamar `compute_histogram`, então
`histogram.py`/`HistogramResult` (`ADR-020/D2-D4`, já fechado e testado) **não muda uma linha**. Isto é
literalmente "não como um contrato paralelo" (`ADR-020`'s própria frase): mesma porta, mesmo método,
tipo de retorno mais rico, dois consumidores fazendo o que já faziam.

**Por que `instrument_id` e não um `Sequence[int]` paralelo a `Sequence[float]`:** um segundo array
paralelo é o modo de falha que este projeto já nomeou para outra dupla de sequências (`README`/`ADR-008`:
colunas paralelas dessincronizam por reordenação). `Observation` amarra `(id, valor, n_obs)` num único
registro — reordenar, filtrar ou embaralhar a lista nunca separa um `n_obs` do valor a que ele pertence.

### D2 — `min_obs` filtra POR OBSERVAÇÃO, antes de `_fires`; o `MinObsNotMetError` de `T-08.6` vira a segunda camada, sobre o REMANESCENTE

```
X = { obs em observations : obs.n_obs >= spec.min_obs }     # NOVO — filtro por ponto, D8.4
R = X                                                          # população elegível para _fires/_robust_z
se |R| < min_obs_agregado_declarado_pela_task_que_chama:      # o MinObsNotMetError JÁ EXISTENTE
    raise MinObsNotMetError(...)                               # continua vivo, sobre |R|, não sobre |observations|
```

O `test_percentile_spec_below_min_obs_refuses` (`backend/tests/charts/test_scan.py:59-81`) que `T-08.6`
já escreveu **continua passando sem alteração**: ele testa uma população cujo TAMANHO TOTAL é menor que
`min_obs` — isso é o caso degenerado de `D2` (`|X| == 0` ou `|X| < min_obs` mesmo depois do filtro por
ponto), e continua correto. O que `D2` ACRESCENTA é o filtro que roda ANTES desse: uma população com
`len(observations) = 2000` pode ter `|X| = 1200` depois de excluir as observações com `n_obs` insuficiente
— e SÓ ENTÃO o segundo teste (agregado) roda sobre os 1200 remanescentes, não sobre os 2000 originais.
Isto é a correção direta do caso concreto: **o defeito nunca aparecia no agregado porque o agregado
olhava para 2000, não para os 1200 que de fato tinham sustentação estatística**.

`ScanResult` ganha um campo declarado, não uma subtração silenciosa (`D8.8`, mesma disciplina de
`UniverseInfo`):

```python
@dataclass(frozen=True)
class ScanResult:
    ...
    n_total: int              # já existe — agora é |X|, a população QUE SOBREVIVEU ao filtro por ponto
    n_excluded_min_obs: int   # NOVO — quantas observações de entrada foram descartadas por n_obs < min_obs
```

`Absolute` continua isento (`_resolve_min_obs` já devolve `None` para ele — `scan.py:116-122`, sem
mudança): um limiar literal não tem população a subamostrar.

### D3 — ausência é TIPO, não sentinela: cada observação recebe um veredito discriminado

Mesmo idioma que `ADR-020/D5` já fixou para `FiringRateResult` (`rate: null` só existe por tipo no ramo
`in_sample`) — este ADR aplica o MESMO padrão à observação individual, não a uma constante emprestada:

```python
@dataclass(frozen=True)
class Fired:
    instrument_id: str
    z_or_percentile_value: float
    n_obs: int

@dataclass(frozen=True)
class NotFired:
    instrument_id: str
    z_or_percentile_value: float
    n_obs: int

@dataclass(frozen=True)
class Insufficient:
    instrument_id: str
    n_obs: int
    min_obs_required: int
    # SEM campo de valor: por construção, não existe número aqui para vazar num hover/export.

ObservationVerdict = Fired | NotFired | Insufficient
```

`ScanResult.per_observation: tuple[ObservationVerdict, ...]` é o que uma UI que precisa de uma LINHA por
símbolo (ex.: uma tabela de `scan` em `S4`) percorre: uma linha `Insufficient` renderiza `—` porque o
TIPO não tem outro caminho a percorrer — é exatamente "`min_obs` não atendido ⇒ AUSÊNCIA (`—`), nunca
`expanding` em silêncio" (`SPEC-001:304`) na forma que o Python já usa em `firing_rate.py:48-63`
(`InSampleFiringRate.rate: None = None`, fixado pelo próprio campo do dataclass).

### D4 — dispersão do `z` é telemetria: campo irmão, nunca lido por `_fires`/decisão de disparo

```python
@dataclass(frozen=True)
class ZDispersionTelemetry:
    n_symbols: int
    dispersion: float | None   # IQR do z entre símbolos sobreviventes ao filtro de D2
    reason_null: str | None    # "n_symbols < 4" (D8.5) quando dispersion é None

@dataclass(frozen=True)
class ScanResult:
    ...
    z_dispersion: ZDispersionTelemetry | None   # None para Absolute/Percentile — só RobustZ tem `z`
```

**Como isto NÃO vira overfitting de segunda ordem, por construção, não por promessa em prosa:**
`z_dispersion` é calculado DEPOIS de `n_fired`/`per_observation` já estarem prontos, a partir do MESMO
`R` que os produziu, e nenhuma função em `scan.py` (`_fires`, `_compare`, `_robust_z`, `evaluate_scan`)
recebe `ScanResult` de volta como entrada — não há import circular possível, não há parâmetro por onde
`z_dispersion` poderia influenciar `_fires` na MESMA chamada nem numa chamada seguinte (`evaluate_scan`
não tem estado entre chamadas). `IQR` (não desvio-padrão) porque a mesma razão de `D2`/robustez a
outliers de `ADR-020` (percentil > estatística sensível a um único ponto extremo) se aplica aqui: um
único símbolo com `z` absurdo não pode dominar o número que diz "os outros estão dispersos". `n_symbols
< 4` devolve `dispersion: null` com o motivo escrito (`D8.5`, literal: "**≥ 4 símbolos**") — nunca um
IQR calculado sobre 2 ou 3 pontos fingindo ser uma dispersão informativa.

### D5 — `distribution`/`histogram.py` NÃO ganham `min_obs` — é decisão de escopo, não esquecimento

`HistogramRecipe` (`histogram_recipe.py`, já fechado por `T-08.6`) não tem `window` nem `min_obs` — só
`quantiles`/`interpolation`/`point_mass_min_share`. Um `Bin.count` é uma CONTAGEM EXATA do que caiu
naquele intervalo, não uma estatística resolvida a partir de uma população pequena demais para ser
confiável — "3 observações caíram neste bin" não é o mesmo tipo de falha que "este percentil foi
calculado sobre 3 observações e afirma-se calculado sobre 2016". `min_obs` protege contra o SEGUNDO
problema; `distribution` só tem o primeiro. Reabrir `histogram.py` para aceitar `Observation` em vez de
`float` quebraria o contrato que `ADR-020/D4` já fixou e testou (o invariante de soma), sem nenhum DoD
deste ADR pedindo isso — `D8.4`/`D8.5` citam **percentil/`z`** (produtos de `ThresholdSpec`), nunca
"histograma".

### D6 — fronteira de módulo: o que muda, arquivo por arquivo

```
backend/src/modules/charts/domain/
    observation.py            # NOVO — Observation, ObservationVerdict (Fired|NotFired|Insufficient)
    scan.py                   # MODIFICADO — evaluate_scan recebe Sequence[Observation]; D2 (filtro por
                               #   ponto) roda antes do MinObsNotMetError já existente (agora sobre |X|);
                               #   ScanResult ganha n_excluded_min_obs, per_observation, z_dispersion
    histogram.py               # INTOCADO — D5
    threshold_spec.py          # INTOCADO — min_obs/window já existiam nos três dataclasses
backend/src/modules/charts/use_cases/
    compute_distribution.py    # MODIFICADO só na projeção: observed_values() -> Observation,
                                #   [o.value for o in observations] antes de compute_histogram
    run_scan.py                 # MODIFICADO — passa Sequence[Observation] direto para evaluate_scan
    compute_firing_rate.py      # INTOCADO por esta ADR — herda n_excluded_min_obs por composição
                                 #   quando T-08.8 decidir a regra walk-forward, sem mudança de tipo aqui
```

`ObservationSource.observed_values` (o Protocol/porta) muda de assinatura de retorno
(`Sequence[float]` → `Sequence[Observation]`). Isto é uma mudança SEM CUSTO de migração: `ADR-020/D7` já
declarou "nenhum adaptador concreto" implementado (`T-08.6-builder.md:37-38`) — não existe código de
produção que implemente esta porta ainda para quebrar.

---

## Alternativas recusadas

| alternativa | por que recusada |
|---|---|
| **Manter `Sequence[float]` e acrescentar um segundo `Sequence[int]` de `n_obs` em paralelo** | dessincroniza sob qualquer reordenação/filtragem — a mesma classe de defeito que arrays paralelos já produziram neste repositório (colunas dessincronizadas); `Observation` amarra os dois campos num registro |
| **`min_obs` continuar só agregado (`n_total < min_obs`), sem filtro por ponto** | é exatamente o que `T-08.6` já tinha, e é exatamente o que NÃO teria pegado o caso concreto do despacho — um agregado de 2000 pontos mistos nunca denuncia que 800 deles vieram de janela quase vazia |
| **Usar `z_dispersion` para vetar automaticamente o `scan` quando a dispersão for "alta"** | é overfitting de segunda ordem: substitui um limiar arbitrário (`min_obs`) por outro limiar arbitrário e não declarado ("dispersão alta demais") escolhido post-hoc; `D8.5` pede telemetria, não uma segunda régua de corte. O owner decide o que fazer ao VER a dispersão — a tela não decide por ele (mesmo princípio de `SPEC-001` §6.3, "zero seleção é informação") |
| **Aplicar `min_obs`/`n_obs` também a `distribution`/`histogram.py`** | `D5` — confunde duas perguntas diferentes ("quantos pontos caíram aqui" vs "este percentil tem sustentação"); `HistogramRecipe` nunca teve esses eixos, e nenhum DoD desta task pede histograma |
| **`Insufficient` carregar o valor calculado mesmo assim, com uma flag `low_confidence: true`** | é a "expanding em silêncio" disfarçada de metadado — qualquer consumidor que ignore a flag (um export, um `sum()` feito por engano) lê um número que `SPEC-001:304` proíbe explicitamente. Ausência de campo de valor é a única forma que não depende de disciplina do chamador |

---

## Falsificador desta ADR

**Uma população com observações de `n_obs` misto** (ex.: metade com `n_obs=2016`, metade com
`n_obs=600`, `min_obs=576`) onde o agregado `n_total >= min_obs` mas o teste teria que mostrar
`n_excluded_min_obs == 0` (nada é excluído, porque 600 >= 576 também) — **isto é esperado e correto**: o
falsificador real é o caso em que `n_obs` está **abaixo** de `min_obs` (ex.: `n_obs=300 < min_obs=576`)
e o resultado ainda assim participa de `_fires`/`n_fired`. Regressão obrigatória:
`evaluate_scan([Observation("BTCUSDT", 1.2, 2016), Observation("ALTUSDT", 0.9, 300)], spec=RobustZSpec(
min_obs=576, ...))` tem que devolver `n_total == 1`, `n_excluded_min_obs == 1`, e
`per_observation` contendo um `Insufficient(instrument_id="ALTUSDT", n_obs=300, min_obs_required=576)`
— nunca um `Fired`/`NotFired` para `ALTUSDT`.

**Uma chamada que instrumenta `_fires`/`_robust_z`/`_compare` recebendo `z_dispersion` como argumento**
quebra `D4` diretamente — nenhuma função de decisão pode aceitar telemetria como entrada, por assinatura.

**Um `HistogramRecipe`/`compute_histogram` que ganhe um parâmetro `min_obs`** quebra `D5` — é o sinal de
que a fronteira desta ADR foi cruzada sem decisão nova.

---

## Consequência

- `T-08.7` (builder) implementa `observation.py`, edita `scan.py` (filtro por ponto + `ScanResult`
  estendido), `compute_distribution.py` (projeção `.value`) e `run_scan.py` (passa `Observation` direto).
  **Não implementa** a query SQL do adaptador `ObservationSource` (continua "do builder de uma task
  futura", herdado de `ADR-020/D7`) nem a regra de `firing_rate` walk-forward (`T-08.8`).
- `T-08.8` herda `n_excluded_min_obs`/`per_observation` por composição — cada janela de calibração de um
  walk-forward é, ela mesma, uma chamada a `evaluate_scan`, então a exclusão por ponto já se aplica
  window a window sem `T-08.8` precisar reimplementar nada; `T-08.8` decide os NÚMEROS do split, não a
  forma.
- `T-08.12` (regras de renderização de painel) e a rota HTTP (`infra`, quando `T-01.8` tiver dono)
  consomem `ScanResult.per_observation`/`z_dispersion` como dados que populam a tabela e o rótulo de
  telemetria de `S4` — nenhuma decisão de layout é tomada aqui.

## Como o owner confere isto sem confiar no arquiteto

Decisão pré-implementação, sem código novo desta sessão — a verificação também tem duas camadas:

1. **Contra o que já está no repositório, hoje, lido e citado, não recalculado:**
   `backend/src/modules/charts/domain/scan.py:40-49,116-134` (o `MinObsNotMetError` e o `_resolve_min_obs`
   que este ADR estende, não substitui) e `backend/src/modules/charts/use_cases/compute_distribution.py:23-55`
   (`ObservationSource`, a porta que muda de tipo de retorno). Rode
   `sed -n '55,70p' backend/src/modules/charts/domain/histogram_recipe.py` — o `@dataclass` de
   `HistogramRecipe` (linhas 66-69) lista `spec_version, quantiles, interpolation,
   point_mass_min_share` e nada mais: **nenhum campo `min_obs` nem `window`**, confirmando `D5` por
   observação direta do código, não por afirmação desta ADR. (`grep -n "window"` no arquivo INTEIRO
   devolve 2 linhas de PROSA de docstring — `reproduzir(run) = (bundle_hash, window,
   knowledge_time)`, citando `ADR-020/D6` — não um campo da classe; o que importa é a lista de campos
   do `@dataclass`, não a ausência do token no arquivo inteiro.)
2. **Quando `T-08.7` (builder) existir:** o falsificador acima (população de `n_obs` misto, `min_obs=576`)
   é um teste de regressão comparável ao fixture do taker que `ADR-020` já usa — o owner confere o
   número (`n_excluded_min_obs == 1`, o símbolo certo em `Insufficient`), não a lógica Python.

Rotulado explicitamente como **opinião de arquitetura, não medição nova**: a escolha de `Observation`
como o tipo atômico (em vez de, por exemplo, um `dict` posicional, ou estender `PercentileSpec`/
`RobustZSpec` com um campo de população embutido) e a escolha de `IQR` como estimador de dispersão do
`z` são julgamento de domínio deste agente, sem documento público que as fixe como a única forma correta
— `[OPINIÃO: quant-architect, 2026-09-04]`. O que É medido e não-opinião: que `rolling(2016,
min_periods=576)` nunca encheu a janela nos alts (`PRD-001:389`), e que `Sequence[float]` (o tipo que
`T-08.6` shippou) estruturalmente não consegue expressar identidade nem `n_obs` por ponto — isso é fato
de leitura de código, verificável por `grep -n "class Observation" backend/src/modules/charts/domain/scan.py`
devolvendo **zero linhas** antes desta ADR.
