# ADR-026 — Regras de renderização de painel: habilitação por múltiplo de grade, colisão de disco em px, bucket em formação nunca lido como final, e eixo Y único por construção de tipo

**Status:** `proposto` · **Data:** 2026-09-04 · **Componente:** `charts` (motor Python, `backend/src/modules/charts/domain/`) — fronteira com `web`/`frontend/src/charts/` (renderizador TS, fora de escopo, ver "Não fecha")
**Feature:** `plataforma-dados` (`T-08.12`, `CST-80`) · **Autor:** `quant-architect`
**Rev de ancoragem:** worktree `tasks/T-08.12-regras-renderizacao-painel`, base `master`/`1b12cd8`. `T-08.2` (spike de eixo, `D8.19`) e `T-08.6` (`S4` bancada, `ADR-020`) já mergeados — dependências declaradas em `tasks.toml:1358`. `find frontend/src/charts -maxdepth 2 -type f | wc -l` → 46 arquivos (24 fora de `*.test.ts`): existe montagem de dado/série (`s2-panels.ts`, `s2-scalar-grid.ts`, `canonical-grid.ts`), **mas nenhum arquivo desenha disco, decide downsample no título, ou monta eixo** — a camada de geometria-para-pixel que este ADR regula não existe ainda, o que é o motivo de expressar as 4 regras como predicados/tipos Python (`backend/src/modules/charts/domain/`), testáveis sem o renderizador — precedente: `T-08.13`/`ADR-024`.

**Mandato citado no despacho:** os DoD `D8.11`–`D8.14` (`docs/plans/SPEC-001-plataforma-dados/08_superficie_e_reprodutibilidade.md:36-39`) e `CA-F4-4`/`CA-F4-5`/`CA-F4-13`/`CA-F4-19` (`docs/specs/PRD-001-plataforma-dados.md:651-652,660,666`).

**Fecha:** os 4 predicados nomeados no título, formalizados no TIPO onde a regra é uma restrição estrutural ("nunca dois eixos Y"), e como função pura de verdicto onde a regra é uma classificação sobre parâmetros numéricos (múltiplo de grade, colisão de disco). Nenhum dos quatro decide COMO desenhar — todos decidem **o que o renderizador tem permissão de fazer**, do mesmo jeito que `ADR-020` fechou o contrato do motor de `S4` sem desenhar um pixel.
**Não fecha:** o renderizador TS em si (`frontend/src/charts/`, componente `web`/`charts`, sem task nomeada nesta fase — o ponto de consumo mais próximo é `T-08.6`/`s2-panels.ts`, que hoje monta série mas não desenha); a rota HTTP que serve o payload (`infra`, `T-01.8` sem juiz); a escolha de paleta de cor do disco (`ADR-010`, já fechada, não reaberta aqui); a regra de honestidade de leitura da bancada `S4` (`ADR-024`, D8.15-D8.20 — este ADR cobre `D8.11`-`D8.14`, que são de **painel S2/tela**, não de `S4`).

---

## Contexto

### Os quatro números que este ADR tem que formalizar, com a origem exata

| DoD | fonte | medição | consequência arquitetural |
|---|---|---|---|
| `D8.11` (`CA-F4-4`) | `PRD-001:651` | TF=60m sobre grade nativa de OI (5m) → **719/720 fechos com ponto**, habilitado. Cobertura: 1m **20,0%** · 5m/15m **100%** · 60m **99,9%** · 240m **99,4%** · 1440m **100%** | habilitação não pode ser "toda opção de timeframe aparece no seletor" — upsampling (1m sobre grade de 5m) e grade não-múltipla têm de ser **estados distintos e nomeados**, não os dois colapsados em "desabilitado" |
| `D8.12` (`CA-F4-5`) | `PRD-001:652` | `espaçamento_px = largura × grade_nativa / janela`; `min(gap_px) > 0`; **compacto do DoD diz `2r+2 <= espaçamento_px`**; worked example diz "disco r=4 com anel de 2px = **12px**" e "acima de **~8,33h** em 1200px declara downsample" | **achado abaixo (§Achado)**: as duas frases do PRD não reconciliam sob a mesma leitura de "r" — a fórmula tem de ser escolhida, não copiada literalmente, e a escolha é rastreável |
| `D8.13` (`CA-F4-19`) | `PRD-001:666` | aos 4 min de um bucket de 5 min, high definitivo conhecido em **77,4%**, low **78,8%**, ambos **56,6%**, **90,0%** do range já aconteceu; `h`/`l`/`c` do bucket corrente **nunca** lidos como finais | "nunca lido como final" não é convenção de nome de variável — sem um tipo que **não tenha** campo `high`/`low`/`close` no estado em formação, um consumidor futuro vai ler o campo errado por engano, exatamente o defeito que `SPEC-001:148` já nomeou como a origem de `R-2` |
| `D8.14` (`CA-F4-13`) | `PRD-001:660` | `p99\|Δ15m\|` do taker é **824,6%** contra **0,75%** do OI (**1.100×**) | a diferença de escala não é "grande" — é grande o bastante para que uma leitura visual de correlação entre as duas curvas seja **fabricada pelo alinhamento arbitrário dos dois eixos**, não pelo dado |

### O que já existe e este ADR reusa

- `HistogramResult`/`FieldIdentity` (`ADR-020/D1`, `backend/src/modules/charts/domain/field_identity.py`) já fixam `denom` como termo verbatim, nunca reescalado — este ADR **reusa o vocabulário** (`"base_contracts"`/`"notional_usd"` são os mesmos dois literais que `S4` já trata como `denom` de campo), sem reabrir `FieldIdentity` em si: o tipo de `D4` abaixo é um tipo **de painel S2** (série temporal única), não de bancada `S4` (histograma cross-symbol), e por isso não herda `FieldIdentity` inteiro — herdaria `metric`/`unit`/`denom` como 3 termos de identidade cross-symbol que um painel de UM símbolo não precisa.
- `canonical-grid.ts`/`buildCanonicalGrid` (TS, `ADR-003/FR-3`) já é a função única que decide QUAIS instantes existem numa janela — este ADR não reimplementa isso; a habilitação por múltiplo de grade (`D1` abaixo) é uma pergunta **anterior**: dado que a grade existe, o painel tem permissão de desenhar um ponto por instante dela, ou está fazendo upsampling?
- `ADR-003/FR-1`/`FR-2`: `charts` não faz I/O, `web` não calcula geometria. Os 4 predicados abaixo são puros — nenhum lê relógio, arquivo ou rede — pela mesma razão que `histogram.py` é puro: um predicado de renderização testável sem servidor é testável **antes** do renderizador existir, que é literalmente o mandato desta task.
- `ADR-024/D1` (idade nunca em tipo agregado, ausência por omissão de campo, não por `None`) é o precedente direto de `D3` abaixo: o mesmo "o tipo não tem o campo" em vez de "o campo existe e vale `None`/`False`".

---

## Achado — a fórmula compacta de `D8.12`/`CA-F4-5` não reconcile com o próprio limiar que ela cita

`[ACHADO: quant-architect, 2026-09-04]`. Duas leituras possíveis do parágrafo de origem
(`docs/plataforma-superficies-e-faseamento.md:90`, repetido em `PRD-001:652`):

- **Leitura A — literal da desigualdade compacta:** `2r + 2 <= espaçamento_px`, com `r = 4` (o raio citado no exemplo) ⇒ limiar em `espaçamento_px = 10`. Resolvendo `espaçamento_px = 1200 × 300.000 / janela_ms = 10` para `janela_ms` dá **`janela = 36.000.000 ms = 10 h`**.
- **Leitura B — reconstruída do exemplo numérico do mesmo parágrafo:** "disco r=4 com anel de 2px = **12px**" é `2×(r + anel) = 2×(4+2) = 12`. Resolvendo `espaçamento_px = 12` para `janela_ms` dá **`janela = 30.000.000 ms = 8,3333 h`**.

**Leitura B é a que bate com o número que o próprio parágrafo publica como limiar** ("acima de **~8,33h**") — `[MEDIDO: 1200 × 300.000 / 30.000.000 = 12, exatamente o "12px" do mesmo parágrafo]`. Leitura A produz 10h, não 8,33h — uma divergência de **20%** na janela em que o painel muda de comportamento, que não é arredondamento.

**Decisão:** implemento a Leitura B — `2 × (radius_px + ring_px) <= espaçamento_px` —, com `radius_px` e `ring_px` como parâmetros nomeados da função (nunca constantes internas), porque é a que reproduz o número que o DoD já publicou como o limiar citável (`~8,33h`), e cito esta reconciliação em vez de copiar a desigualdade compacta sem verificar. **Isto não corrige `PRD-001`/o plano `08`** — a nomenclatura "`2r+2`" continua lá, textualmente ambígua sobre se "`2`" quer dizer "`+2px`" fixo ou "`+2×anel`" — e essa correção de redação é do dono daqueles documentos, não desta ADR. `[OPINIÃO: quant-architect, 2026-09-04]` — a escolha entre as duas leituras é julgamento de arquitetura tomado para poder implementar algo; a medição em si (10h ≠ 8,33h sob leituras diferentes) não é opinião.

---

## Decisão

### D1 — habilitação por múltiplo de grade é uma função pura de dois inteiros, com 3 estados nomeados (nunca 2)

```python
class GridMultipleReason(Enum):
    MULTIPLE_OF_NATIVE = "multiple_of_native"   # panel_grid_ms >= native_grid_ms and % == 0
    UPSAMPLING = "upsampling"                    # panel_grid_ms < native_grid_ms
    NON_MULTIPLE = "non_multiple"                # panel_grid_ms >= native_grid_ms, but not a multiple

@dataclass(frozen=True)
class GridMultipleVerdict:
    panel_grid_ms: int
    native_grid_ms: int
    enabled: bool
    reason: GridMultipleReason
    multiple: int | None   # panel_grid_ms // native_grid_ms quando enabled, senão None

def classify_grid_multiple(panel_grid_ms: int, native_grid_ms: int) -> GridMultipleVerdict: ...
```

`CA-F4-4`, literal: "Habilita quando `grade_painel >= grade_nativa` **e** `grade_painel mod grade_nativa == 0`; desabilita **apenas** em upsampling ... ou grade não-múltipla." **Por que 3 estados e não um booleano `enabled`:** um booleano sozinho colapsaria "TF=1m sobre grade de 5m" (upsampling — não existe dado, o painel INVENTARIA 80% dos pontos) e "TF=7m sobre grade de 5m" (grade não-múltipla — existe dado, mas o alinhamento de bucket não bate) na mesma resposta `False`, e são dois defeitos de naturezas diferentes que um operador de UI precisa poder distinguir na mensagem (um é "escolha um TF maior", o outro é "escolha um múltiplo"). O falsificador: `classify_grid_multiple(60min, 5min)` → `enabled=True, reason=MULTIPLE_OF_NATIVE, multiple=12`; `classify_grid_multiple(1min, 5min)` → `enabled=False, reason=UPSAMPLING` — os dois casos que `CA-F4-4` já mediu (**99,9%/719 de 720** e **20,0%**).

### D2 — colisão de disco é geometria pura de 4 números, nunca um booleano solto de "cabe"

```python
@dataclass(frozen=True)
class DiscLayout:
    spacing_px: float          # largura_px * native_grid_ms / window_ms
    radius_px: float
    ring_px: float
    min_required_px: float     # 2 * (radius_px + ring_px)  -- ver "Achado" acima
    fuses: bool                 # min_required_px > spacing_px
    downsample_declared: bool   # == fuses; nome próprio porque é o que o título do painel lê

def classify_disc_layout(
    width_px: float, native_grid_ms: int, window_ms: int, radius_px: float, ring_px: float,
) -> DiscLayout: ...
```

Guarda de construção (`__post_init__`): `width_px > 0`, `native_grid_ms > 0`, `window_ms > 0`, `radius_px > 0`, `ring_px >= 0` — todos recusados por exceção, mesma postura de `FieldIdentity.__post_init__`. **Por que `radius_px`/`ring_px` são parâmetros e não constantes dentro da função:** o mesmo motivo de `HistogramRecipe` não fixar `quantiles` — um raio hardcoded dentro de `panel_disc_layout.py` seria o mesmo "limiar absoluto disfarçado" que `ADR-020` já recusou para bordas de bin, uma superfície acima. O falsificador, com os números já publicados: `classify_disc_layout(1200, 300_000, 86_400_000, 4, 2)` → `spacing_px == 4.1667`, `min_required_px == 12`, `fuses == True` (**65,3% de sobreposição**, `[MEDIDO: (12-4.1667)/12 = 0.6528]`); no limiar, `classify_disc_layout(1200, 300_000, 30_000_000, 4, 2)` → `spacing_px == 12.0 == min_required_px`, `fuses == False` (limite inclusive, `<=`).

### D3 — o bucket em formação é um tipo-soma sem campo `high`/`low`/`close`, nunca um booleano ao lado dos mesmos três campos

```python
@dataclass(frozen=True)
class FinalBar:
    open: float
    high: float
    low: float
    close: float

@dataclass(frozen=True)
class InProgressBar:
    open: float
    high_so_far: float   # NUNCA "high" -- o nome é a barreira
    low_so_far: float    # NUNCA "low"
    last: float           # NUNCA "close"

Bar = FinalBar | InProgressBar

def is_final(bar: Bar) -> bool:
    return isinstance(bar, FinalBar)
```

**Por que não é `Bar(is_final: bool, open, high, low, close)` com um booleano ao lado:** essa forma deixa `is_final=False` e `high=…` coexistirem no MESMO objeto, e é exatamente essa coexistência que `CA-F4-19` proíbe ("`h`/`l`/`c` do bucket corrente NUNCA são lidos como finais") — um `if bar.is_final: ...` esquecido em um caminho de código ainda compilaria e ainda leria `bar.high` como se fosse definitivo. Com `Bar` como união, **não existe `.high` para esquecer de guardar** em `InProgressBar` — um consumidor que tente `bar.high` sobre uma variável tipada `InProgressBar` falha em tempo de checagem de tipo, não em tempo de execução sob um caso raro. **Visibilidade** (a outra metade de `D8.13`, "não é escondido"): não existe um terceiro variante `HiddenBar`, nem um `Optional[Bar]` no ponto de renderização — `Bar` é sempre um dos dois casos, nunca ausente; esconder o bucket em formação exigiria uma modificação estrutural (acrescentar um variante ou tornar o tipo opcional), nunca um `if` que algum caminho de código deixe de escrever. **Escopo, explícito:** este tipo é de RENDERIZAÇÃO, não de decisão de entrada — `CA-F4-19` já distingue os dois usos ("`bar_policy = intrabar` vale para renderização e simulação de execução e **nunca** para avaliação de condição de entrada"); `Bar`/`InProgressBar` não são consumidos por `convergencia` nem por gatilho de sinal, e esta ADR não decide nada sobre esse consumidor.

### D4 — um painel carrega exatamente um `denom`, e a restrição é a FORMA do tipo, não uma validação

```python
@dataclass(frozen=True)
class SingleAxisSeries:
    denom: str    # "base_contracts" | "notional_usd" -- vocabulário verbatim de ADR-020/D1, reusado, nunca reescalado
    slots: tuple[ScalarSlot, ...]

def switch_denom(current: SingleAxisSeries, new_denom: str, slots_by_denom: Mapping[str, tuple[ScalarSlot, ...]]) -> SingleAxisSeries:
    """Troca de denom SUBSTITUI a série; nunca soma um segundo eixo ao lado do primeiro."""
    return SingleAxisSeries(denom=new_denom, slots=slots_by_denom[new_denom])
```

**Por que isto é a restrição estrutural que o despacho pediu, e não uma validação:** `SingleAxisSeries` tem UM campo `denom: str` — não `denom: str | tuple[str, str]`, não `denoms: list[str]`, não dois campos `left_denom`/`right_denom`. Não existe combinação de valores desse tipo que represente dois eixos Y simultâneos: a pergunta "e se alguém passar os dois?" não tem uma chamada de construtor correspondente para fazer, o que é uma classe de garantia mais forte que "o construtor recusa quando os dois vêm preenchidos" (uma validação, que só dispara se alguém lembrar de chamá-la). `switch_denom` não FUNDE duas séries — ele descarta a anterior e devolve uma nova `SingleAxisSeries` com o `denom` escolhido, que é a leitura literal do "toggle" de `CA-F4-13`.

---

## Alternativas recusadas

| alternativa | por que recusada |
|---|---|
| `D1`/`D2` como validação em runtime dentro do renderizador TS (`if (!enabled) throw`) | move a regra para o único lugar que ainda não existe nesta fase (`frontend/src/charts` não desenha geometria hoje) e a deixa não-testável até lá — o mesmo argumento que `ADR-024` já usou para `charts.domain` em vez de "texto de tela" |
| `D2` com `radius_px`/`ring_px` fixos dentro da função (`r=4` hardcoded) | é a mesma classe de "limiar absoluto disfarçado" que `ADR-020` recusou para bordas de bin — um raio fixo que funciona para o layout de hoje quebra silenciosamente no dia em que o design de disco mudar |
| `D3` como `Bar(is_final: bool, open, high, low, close)` — um único tipo com campo booleano | é exatamente o formato que `CA-F4-19` já identificou como o modo de falha: nada impede `bar.high` de ser lido com `is_final=False` ao lado, porque o campo `high` sempre existe |
| `D3`/`D4` resolvidos só documentando a convenção de nome (`current_high` em vez de `high`, sem união de tipo) | convenção de nome é grep, não tipo — o precedente de `ADR-013/D2` já mediu que detector de nome por convenção morde em identificador legítimo e cala pouco; a proteção real está na FORMA do tipo, não no texto do identificador |
| `D4` como `SingleAxisSeries` com dois campos opcionais (`primary_denom`, `secondary_denom: str \| None`) | ainda representa o estado proibido (`secondary_denom` preenchido) — é uma validação disfarçada de tipo, porque o par `(str, str)` continua construível; a forma que fecha a pergunta é a que não tem onde colocar o segundo valor |

---

## Falsificador desta ADR

**Um `Bar` com campo `high`/`low`/`close` em um estado que representa um bucket ainda não fechado** — quebra `D3` diretamente, é a regressão que `CA-F4-19` já mede (77,4%/78,8%/56,6%/90,0%).
**Um `classify_grid_multiple` que devolva `enabled=True` para `panel_grid_ms < native_grid_ms`** (upsampling classificado como habilitado) — quebra `D1`, e é o caso "1m sobre grade de 5m: 20,0% de cobertura" que `CA-F4-4` já mede.
**Um `classify_disc_layout` cujo limiar não bata com `~8,33h`/`12px` sobre `(1200, 300_000ms, radius=4, ring=2)`** — quebra o Achado acima; um teste de regressão fixando exatamente esses 4 números é o falsificador de `D2`.
**Um tipo em `charts/domain` que consiga representar dois `denom` simultaneamente para o mesmo painel** (dois campos, uma tupla, um `Optional` de segundo denom) — quebra `D4` por construção, não por teste que precise ser lembrado de rodar.

---

## Consequência

- O builder desta mesma task (`T-08.12`) implementa `backend/src/modules/charts/domain/{panel_grid_enablement,panel_disc_layout,panel_bar_progress,panel_single_axis}.py` — um arquivo por predicado, mesma granularidade de `field_identity.py`/`histogram_recipe.py`/`histogram.py`/`firing_rate.py` já em `charts/domain/`. **Não implementa** o renderizador TS que consome estes tipos (fora de escopo desta fase — o consumo mais próximo hoje é `s2-panels.ts`, que monta série, não geometria) nem a rota HTTP (`infra`).
- O teste de regressão que fixa o falsificador de `D2` (os 4 números: `1200`, `300_000`, `4`, `2` → `spacing_px=4.1667`, `min_required_px=12`, `fuses=True`, e o par no limiar `window_ms=30_000_000` → `fuses=False`) é o que prova a reconciliação do "Achado" acima, não uma alegação em prosa.
- Quando o renderizador de `frontend/src/charts` nascer, ele consome `GridMultipleVerdict`/`DiscLayout`/`Bar`/`SingleAxisSeries` — a MESMA relação que `ADR-020` já estabeleceu entre `HistogramResult` (Python) e a geometria de barras (TS): o motor decide o quê, o renderizador decide o pixel.

## Como o owner confere isto sem confiar no arquiteto

Decisão pré-implementação — não há código rodando ainda para este ADR (o builder desta task o escreve a seguir). A verificação fica em três camadas:

1. **Contra os números já publicados** (`CA-F4-4`/`CA-F4-5`/`CA-F4-13`/`CA-F4-19`, `PRD-001:651-666`, e o plano `08_superficie_e_reprodutibilidade.md:36-39`): confira que os números citados aqui (`719/720`, `20,0%`, `4,1667px`, `12px`, `65%`, `824,6%`, `0,75%`, `77,4%`, `90,0%`) são a MESMA medição, citada, não recalculada `[DOC]`.
2. **A reconciliação aritmética do "Achado"** é verificável com uma calculadora: `1200 × 300.000 / 30.000.000 = 12` e `2 × (4+2) = 12` batem; `2×4+2 = 10` não bate com `8,33h`. Qualquer pessoa confere isso sem ler Python.
3. **Quando o builder existir:** o falsificador de cada `D` acima é o teste de regressão que prova esta ADR — fixture numérico, não fixture de mercado (estes 4 predicados são geometria/classificação, não detecção sobre candle real), e é o formato "backtest com universo declarado" que este projeto aceita quando o universo é "estes 4 números publicados", não um dataset.

Rotulado explicitamente como **opinião de arquitetura**: a escolha de 3 estados nomeados em `D1` em vez de 2, e a granularidade de um arquivo por predicado em `D7`/Consequência, são julgamento de domínio sem medição que as fixe como única forma correta — `[OPINIÃO: quant-architect, 2026-09-04]`. O que É medido e não-opinião: os 4 números da tabela de contexto, e a divergência aritmética do Achado.
