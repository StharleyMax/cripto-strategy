# STITCH_CONTEXT.md — cripto-strategy

**Data:** 2026-09-02 (**7ª** revisão — `S1` nasce e é aprovada pelo gate independente) · **Projeto Stitch:** `projects/9264019151773162472` ("crypto", `TEXT_TO_UI_PRO`, PRIVATE, DESKTOP)
**Telas no Stitch hoje:** **7** `[MEDIDO: list_screens, 2026-09-02]` — 3 de `S2` (ver §4.1.0) + 4 de `S1` (ver §4.2.0)
**A `S2` CANÔNICA É `8174234965cd4ffbacfb7b2a0a61a427`** — `S2 Símbolo - Operacional Core Rev. B` · **APROVADO, 0 reprovações** `[MEDIDO: python3 scripts/verify_screen.py revB.html ⇒ exit 0]`. As outras duas estão **REVOGADAS**. Ver §4.1.0.
**A `S1` CANÔNICA É `c0fc0210272f42a1ae29b6364e68d2e4`** — `S1 Console — Diagnóstico Operacional (Rev. B)` · **APROVADO COM CONDIÇÃO pelo gate independente `ux-ui-mastery`, condição fechada** `[MEDIDO: docs/context/plataforma-dados/gates/T-07.12-design.md + T-07.12-ux-critique.md, greps no HTML baixado]`. As outras três estão **REVOGADAS**. Ver §4.2.0.
**Design systems:** **4** `[MEDIDO: list_design_systems]` — ver §5.1 · **e um quinto tema que não é asset: `project.designTheme`**

> ### ⛔ TARJA de 2026-08-28 (6ª revisão): a linha de telas dizia **2**, e nomeava como únicas duas telas que hoje estão as DUAS revogadas
>
> ~~**Telas no Stitch hoje:** **2** — `S2 Símbolo - Operacional Core` (`f233…`) e **`S2 Símbolo - Operacional Core Rev. A`** (`7c81…`)~~
>
> **São 3.** A terceira é a canônica, e apareceu porque `edit_screens` **bifurcou de novo** (§5.3).
> **O número não estava errado quando foi escrito — envelheceu.** Registro porque a linha 4 deste
> arquivo já errou a contagem de telas em **duas** revisões consecutivas (0, depois 2), sempre pelo
> mesmo motivo: **contagem é estado, e estado escrito em prosa envelhece em silêncio.**
> ⇒ **é por isso que a linha nova não carrega só a contagem: carrega o `screenId` canônico.**
> Um id não envelhece; uma contagem sim.

> ### ⛔ TARJA de 2026-08-25 (5ª revisão): as DUAS linhas acima estavam erradas, pelo MESMO método
>
> ~~**Telas no Stitch hoje:** **1** · **Design systems:** **3**~~
>
> **São 2 telas e 4 design systems.** E a tarja logo abaixo — escrita na 4ª revisão, sobre
> `list_screens` — **nomeia com precisão o erro que a 4ª revisão cometeu em seguida, duas vezes.**
> `edit_screens` **bifurca** em vez de editar no lugar (§5.3), e `update_design_system` **persistiu**
> (§5.1). Em ambos os casos a leitura estava no recurso errado ou cedo demais, e o **negativo foi
> publicado como fato**.
>
> **Uma regra derivada corretamente e não aplicada ao caso seguinte não é uma regra: é uma frase.**

> ### ⛔ TARJA de 2026-08-25 (4ª revisão): a linha acima dizia **"Telas no Stitch hoje: 0"**, e era FALSO
>
> ~~**Telas no Stitch hoje:** **0** `[MEDIDO: list_screens → {}]` · **Design systems:** 0~~
>
> **Havia 1 tela e 1 design system, e os dois materializavam a paleta que o owner REVOGOU.**
> O erro não foi de leitura: foi de **método**. `list_screens` devolveu `{}` no momento em que
> aquela linha foi escrita, e eu tratei uma resposta vazia de **um** endpoint como prova de
> ausência — sem cruzar com `get_project`, que **sempre** trouxe a tela em `screenInstances`.
>
> **A regra que sai disto, e ela é operacional:** `get_project.screenInstances` é a fonte de
> verdade sobre o que existe no canvas. `list_screens` é **corroboração**, nunca prova de
> ausência. `[MEDIDO: na 4ª revisão `list_screens` devolveu a tela normalmente — ou seja, o
> `{}` era transitório, e um resultado transitório publicado como fato é pior que um `[NÃO
> MEDIDO]`, porque parece medição.]`

**Mantido por:** `/design` · **Lido por:** quem for implementar UI, **antes** de escrever `.tsx`
**Modelo do Stitch:** **`GEMINI_3_1_PRO`** em toda geração e edição `[PREMISSA-OWNER: 2026-08-25]` · **`deviceType: DESKTOP`**

> **Por que este arquivo existe: o Stitch não tem memória.** Cada conversa começa do zero, e por isso o
> design oscila — o modelo renegocia navegação, paleta e escopo a cada prompt. Este documento é o estado
> persistido, e a **§9** é o que se cola no Stitch para que a iteração continue em vez de recomeçar.

---

## 1. Visão geral do produto

**Plataforma pessoal, single-user, de análise quantitativa de cripto-derivativos.** Confirmação cruzada de
três camadas — **estrutura de preço** (pivôs, Fibonacci, volume) · **sentimento e derivativos** (Open
Interest, Funding, Long/Short) · **order flow** (CVD) — em prazos operacionais de **15m / 1h / 4h**, com
decisão **no fechamento do bucket**.

**Não é HFT.** Não há leitura de milissegundo de livro, e **nenhum tick chega ao browser**.

**O problema que a plataforma resolve não é "mostrar gráfico".** É impedir que um número **sem procedência**
chegue a uma decisão que gasta capital. Três modos de falha, e cada um é contrato: **lookahead** ·
**número sem procedência** · **lacuna preenchida em silêncio**.

### Fase atual — e o que ela NÃO é

A fase é **plataforma e dados**. São **non-goals explícitos**: detectores SMC · detectores de pivô e níveis
de Fibonacci · limiar de sinal · matriz de convergência · regra de entrada/SL/TP · métricas de performance
· walk-forward · paper trading · **execução de ordem**.

⚠️ **Isto tem consequência direta no design: a tela NÃO mostra sinal, NÃO mostra "compra/venda", NÃO tem
score de confluência e NÃO tem placar de performance.** Uma tela que mostre qualquer dessas coisas está
fora de escopo, por mais natural que pareça num produto de trading.

---

## 2. Estrutura do sistema

### Vocabulário obrigatório da interface

| termo | o que é | erro a evitar |
|---|---|---|
| **`SeriesKey`** | identidade de série com **15 termos** | não existe "o OI". Existe `OI · grade 5m · BTC · bn-dump · reduction=CLOSE` |
| **selo** | os 4 campos que acompanham todo numeral | série · idade · procedência · completude |
| **procedência** | `OBSERVADO` · `DERIVADO` · `MODELADO` · `HUMANO` | `DERIVADO` **não é** `MODELADO` |
| **`available_at`** | o mais cedo em que um consumidor ao vivo poderia saber | é o que gera a **idade**; não confundir com `event_time` |
| **`COMO EM T`** | modo de leitura point-in-time | oposto de `AO VIVO`. Ver §7 |
| **`bundle`** | o conjunto de parâmetros versionado e hasheável — **ele É a URL** | **não é um CRUD de presets** |
| **quarentena** | série com `label_shift`, `unit` ou `available_at` nulos | **não sincroniza painel** |

### Fronteira de componente (afeta o que pode viver em cada tela)

`charts` transforma série tipada em **geometria** — não faz I/O, não conhece rota nem sessão.
`web` transforma intenção em **leitura tipada** — não calcula geometria, nenhum `px`.

---

## 3. Mapa de navegação

**Desktop-first.** Operação de **um só usuário**.

> ### ⛔ TARJA de 2026-08-25 (4ª revisão) — a premissa de host mudou, por declaração do owner
>
> ~~**Desktop-first.** Operação de **um só usuário**, em VPS exposta, com **auth mínima single-user**.~~
>
> O owner declarou: *"vps n é problema agora, vai rodar muito local até lá"*
> ⇒ **a VPS é DESTINO, não presente.** Roda **local** por bastante tempo.
>
> **Consequência para o design, e é UMA só:** o chip de ambiente e o desenho de sessão **não
> podem assumir host exposto**, e **auth não é superfície visível** ⇒ **não se desenha tela de
> login, nem avatar, nem menu de conta.** `principal_id` **continua** dimensão obrigatória
> (`D5.10`: preenchido, nunca `NULL`) — o que mudou é que ele é **dado**, não **tela**.
>
> **Falsificador:** no dia em que o serviço passar a escutar em interface pública, `auth` volta
> a ser superfície e esta tarja expira. Não é "auth foi cancelada"; é "auth foi **adiada**, e a
> condição de reabrir está escrita".

**`observer_region = GRU1` (São Paulo)** `[MEDIDO 2026-08-25, sem SSH, pelo caminho de rede até a
Binance: `x-amz-cf-pop: GRU1-P6` no REST e `GRU1-P9` nos dumps]`. Resolve a pendência de região
**para o host local**. ⚠️ **Não transporta para a VPS futura:** quando o host mudar, a região tem
de ser **medida de novo pelo mesmo caminho** — `observer_region` é propriedade do observador, não
do projeto. **Isto não é elemento de tela:** é dimensão de dado, e não recebe pixel na `S2`.

```
shell autenticado
├── S2  símbolo            ← NÚCLEO OPERACIONAL. multi-painel, replay as-of, marcação
├── S1  console de coleta   o que está sendo gravado, o que parou, quanto é perda permanente
├── S3  inspetor de série   o que este número é, e quais linhas exatas o produziram
└── S4  bancada             que taxa de disparo um limiar produziria — ANTES de escolher o limiar
```

**`S5` NÃO é tela.** É `universe_at(ts, filtro)` atrás de **todo** seletor de símbolo.

**Chrome global, sempre visível:** chip de `env ∈ {mainnet, testnet, demo, replay}` · modo
`AO VIVO`/`COMO EM T` · versão do bundle · fuso.

---

## 4. Inventário detalhado das telas

### 4.1 S2 — símbolo · **NÚCLEO OPERACIONAL** · **EXISTE NO STITCH** `[MEDIDO 2026-08-25]`

#### 4.1.0 QUAL DAS TRÊS TELAS É A `S2` — leia isto antes de qualquer coisa `[MEDIDO 2026-08-28]`

**A `S2` é `8174234965cd4ffbacfb7b2a0a61a427`.** As outras duas existem, não podem ser apagadas,
e estão revogadas.

| `screenId` | título no canvas | `x` no canvas | desvios corrigidos | gate | estado |
|---|---|---|---|---|---|
| **`8174234965cd4ffbacfb7b2a0a61a427`** | `S2 Símbolo - Operacional Core Rev. B` | 4736 | **13 de 13** | **APROVADO · 0 reprovações** | ✅ **CANÔNICA** |
| `7c81c2672b944f8a88c06ae436b19274` | `S2 Símbolo - Operacional Core Rev. A` | 3392 | 12 de 13 | REPROVADO · **4** reprovações | ⛔ REVOGADA — superada |
| `f233baf87e12403797d1c867f69ab53d` | `S2 Símbolo - Operacional Core` | 1024 | **0 de 13** | REPROVADO · **24** reprovações | ⛔ REVOGADA — é a tela dos 13 desvios |

```
python3 scripts/verify_screen.py revB.html   =>  APROVADO   ( 0 reprovacoes)  exit 0
python3 scripts/verify_screen.py revA.html   =>  REPROVADO  ( 4 reprovacoes)  exit 1
python3 scripts/verify_screen.py orig.html   =>  REPROVADO  (24 reprovacoes)  exit 1
```

##### ⚠️ A REGRA DE IDENTIDADE, e ela vale mais que esta tabela

**A identidade da `S2` é o `screenId` escrito nesta seção. O TÍTULO NO CANVAS NÃO É IDENTIDADE.**
Três fatos medidos sustentam isso, e o terceiro é o que fecha:

1. **Os títulos são escritos pela FERRAMENTA, não por mim.** `edit_screens` derivou
   `"… Rev. A"` do título base e `"… Rev. B"` de `"… Rev. A"` — **auto-incremento de letra**.
   `[MEDIDO: list_screens antes e depois de cada chamada, 2026-08-25 e 2026-08-28]`
2. **Não existe operação de renomear.** O MCP expõe, para tela: `generate_screen_from_text`,
   `edit_screens`, `generate_variants`, `apply_design_system`. **Nenhuma toca título.**
3. **A LETRA INCREMENTA POR TENTATIVA, NÃO POR MÉRITO.** Se esta rodada tivesse regredido, a
   saída ainda se chamaria `Rev. B`. ⇒ **"a letra mais alta" não é "a melhor", e nunca será.**
   Quem escolher a `S2` pelo título vai acertar hoje e errar na primeira revisão reprovada.

⇒ **O discriminante executável não é o nome, é a propriedade:** a `S2` canônica é a única das três
para a qual `verify_screen.py` **sai com exit 0**. Isso é verificável sem este documento.
Discriminante de emergência, se alguém tiver só os arquivos: **`grep -l 'lang="pt-BR"'`** acerta a
canônica entre as três hoje `[MEDIDO]` — mas é **frágil por acidente** (nada garante que uma
revisão futura reprovada não tenha `pt-BR` também), então serve para desempate manual, **nunca
como gate**.

> ### ⛔ TARJA de 2026-08-25 (4ª revisão): esta seção dizia `[NÃO EXISTE NO STITCH AINDA]`
>
> ~~### 4.1 S2 — símbolo · **NÚCLEO OPERACIONAL** · `[NÃO EXISTE NO STITCH AINDA]`~~
>
> **Existe, e existia quando a frase foi escrita.** Ver a tarja do cabeçalho para o defeito de
> método que produziu o erro.

**Identidade medida — da tela CANÔNICA** `[MEDIDO 2026-08-28]`:

| campo | valor |
|---|---|
| `screenId` | **`8174234965cd4ffbacfb7b2a0a61a427`** |
| título | `S2 Símbolo - Operacional Core Rev. B` (escolhido pela ferramenta) |
| `deviceType` | `DESKTOP` |
| render | `2560 × 2048` (canvas: `1280 × 1024` em `x=4736`) |
| arquivo | `projects/…/files/6a64ce20577a4b9f9117949a7dec119c` |
| gate | `verify_screen.py` **exit 0**, 0 reprovações, 1 aviso (`P5b`), 1 não-aplicável (`E3b`) |

> ### ⛔ TARJA de 2026-08-28 (6ª revisão): esta tabela descrevia a tela `f233…` como "a" `S2`
>
> ~~| `screenId` | `f233baf87e12403797d1c867f69ab53d` | · | título | `S2 Símbolo - Operacional Core` | · | render em `x=1024` |~~
>
> `f233…` **continua existindo, intacta, com os 13 desvios e 24 reprovações**, e não pode ser
> apagada (§4.1.4). Ela é **histórico**, não a `S2`. Tudo o que as seções 4.1.1 a 4.1.3 dizem
> sobre "a tela materializada" **é sobre `f233…`** — e continua verdadeiro **sobre ela**.

#### 4.1.1 O que a tela materializada ACERTOU — medido no HTML, não estimado

**Isto é o ativo desta tela, e é o motivo pelo qual ela foi EDITADA em vez de descartada.**

| acerto | evidência no HTML |
|---|---|
| os 4 painéis, na ordem, empilhados com crosshair vertical compartilhado | `Panel 1: PREÇO` … `Panel 4: CVD ACUMULADO` + `Global Vertical Crosshair` |
| cabeçalho de painel com identidade completa, **sempre visível**, nunca em tooltip | 4 blocos `Panel Header` inline no fluxo |
| **`price_source` E `price_use` declarados** — as duas coisas, e são diferentes | `klines_last` + `uso: structure_detection` |
| rótulo completo do OI, sem a string `OI` sozinha | `OI · grade 5m · BTC · bn-dump · reduction=CLOSE` |
| `DERIVADO` mostrando **a expressão** que o gerou | `DERIVADO (2*taker_buy - volume)` |
| **`D5.2` satisfeito em geometria** — linha-guia tracejada apontando **para trás** + marca no fim | `stroke-dasharray="4,2"` de `x1=400` a `x2=600` + `<circle cx="600">` |
| **`D5.3` satisfeito** — lacuna de `FLOW` como traço na linha de base | `Gap represented as dash on 0 line`, `h-px` |
| JetBrains Mono em todo numeral · ponto decimal · sem separador de milhar | `font-data-sm/md/lg`, `66000.00`, `65241.50` |
| rail 48px · chrome 40px · rodapé 20px · bordas 1px · zero sombra | `w-sidebar_width`, `h-header_height`, `h-5` |
| atribuição da TradingView **com link**, no rodapé | `Lightweight Charts — TradingView` em `<a>` |
| `pointer_mode` em **pt-BR** | `LER` / `MARCAR` |
| vocabulário de ambiente **correto na tela** | chip `MAINNET` |
| escopo respeitado | zero sinal, zero score, zero placar, zero ordem |

⚠️ **Nota sobre o chip de ambiente:** o `designMd` do tema antigo prescrevia literalmente
`"PROD v2.4"`, e **a tela não obedeceu** — ela renderizou `MAINNET` + `v2.4` separados, que é o
vocabulário certo. **Registro porque contraria a expectativa:** o drift não foi uniforme, e
neste ponto o gerador ficou **mais correto que o próprio design system** que o alimentava.

#### 4.1.2 O que a tela materializada ERROU — 13 desvios, medidos

**Todos com a paleta REVOGADA embutida.** `[MEDIDO: extração de hex do HTML + `min3` sob Brettel 1997]`

| # | desvio | medição |
|---|---|---|
| 1 | direção = `chart-up: #2a78d6` / `chart-down: #eb6834` | **os dois REVOGADOS**, e vivem na *config do Tailwind* + 12 referências por nome |
| 2 | **redundância de forma AUSENTE** — todo candle e toda barra é bloco **sólido** | direção carregada **só por hue** ⇒ **reprova SC 1.4.1**. Zero vazado, zero cruz |
| 3 | **numeral tingido de vermelho**: `1149/1152` e `1 lacuna` em `text-error` `#ffb4ab` | **o pior defeito.** Severidade tingindo numeral — viola D14 **e** o item 5 do §9 |
| 4 | **selo em 3 de 4 campos: falta `idade`** | zero carimbo de idade na tela — e `idade` é o campo do defeito que `D5.1` reprova |
| 5 | **canal de integridade inexistente** | zero violeta, zero losango, zero `QUARENTENA` em toda a tela |
| 6 | procedência como **tint de cor**: `OBSERVADO` azul `#4b91f1`, `DERIVADO` laranja `#a53600` | viola `ADR-010` D-4. E os tints do `designMd` medem **0,5** entre si ⇒ **FAIL** |
| 7 | **ação é azul**: `#a8c8ff` em 7 usos + `#4b91f1` no rail ativo | `#a8c8ff × #e0aaff` = **0,9** sob deutan ⇒ **FAIL**, são a MESMA cor |
| 8 | superfícies `#121315` / `#16181d` / `#0d0e10` / `#2a2e39` | **nenhuma** é nossa. `#16181d × #131722` = **1,008** — quase idêntica, e ainda assim errada |
| 9 | **glassmorphism** nos 4 cabeçalhos de painel | `backdrop-blur-sm` + `bg-…/80` — proibido pelo próprio `designMd` que o gerou |
| 10 | microcopy em inglês no chrome e no rodapé | `LIVE`, `AS AT T`, `Documentation`, `API Status`, `lang="en"` |
| 11 | **sino de notificação** no chrome | afordância que promete um canal de aviso que **não existe** (`Q3`) |
| 12 | **scroll vertical** nos painéis: `h-[1200px]` + `overflow-y-auto` | dois painéis que exigem rolagem **não compartilham crosshair** |
| 13 | acentuação transliterada | `preco`, `ancora`, `Graficos` |

⚠️ **Um número que eu NÃO vou usar para reforçar o item 3, porque ele não reforça:**
`#ffb4ab × #f23645` mede **21,1 ⇒ PASS**, e o contraste de `#ffb4ab` sobre a superfície é
**10,46**. **O vermelho do numeral não é uma colisão de dicromacia nem de contraste — é
legível e é separável.** O defeito é **categórico**: severidade não tem canal de cor, e numeral
tem um único eixo de tinta. Dizer que "colide" seria inventar apoio aritmético para uma
conclusão que se sustenta sozinha, e é exatamente o defeito que `§1.4-quater` do
`DESIGN_SYSTEM.md` existe para não repetir.

##### ⇒ OS 13 DESVIOS, FECHADOS: a conta por desvio, com o comando `[MEDIDO 2026-08-28]`

| # | desvio | `f233…` | `Rev. A` | `Rev. B` |
|---|---|---|---|---|
| 1 | direção em `chart-up`/`chart-down` (azul/laranja revogados) | **11** aplicados **por nome** + 2 na config | 0 | 0 |
| 2 | redundância de forma ausente (bloco sólido) | presente | 0 | 0 |
| 3 | numeral tingido — `text-error` | 2 | 0 | 0 |
| 4 | selo sem o campo `idade` | ausente | 0 | 0 |
| 5 | canal de integridade inexistente | ausente | 0 | 0 |
| 6 | procedência como tint de cor (`*-container`) | **10** aplicados **por nome** | 0 | 0 |
| 7 | ação é azul (`#a8c8ff` / `#4b91f1`) | 4 | 0 | 0 |
| 8 | superfícies inventadas | 18 | 0 | 0 |
| 9 | glassmorphism (`backdrop-blur`) | 4 | 0 | 0 |
| 10 | **microcopy em inglês** — `LIVE`, `AS AT T`, `Documentation`, `API Status`, `lang="en"` | 5 | **3** ⛔ | **0** ✅ |
| 11 | sino de notificação | 2 | 0 | 0 |
| 12 | scroll vertical em painel | 1 | 0 | 0 |
| 13 | acentuação transliterada | 3 | 0 | 0 |
| | **desvios com contagem 0** | **0 de 13** | **12 de 13** | **13 de 13** |

⚠️ **CORREÇÃO A UM NÚMERO QUE ME FOI REPASSADO, e é minha obrigação medir em vez de adotar:**
a instrução desta rodada dizia *"os **11** de 13 desvios corrigidos"*. **É 12, não 11**
`[MEDIDO: o script acima, n=13 desvios × 3 arquivos]`. O único desvio que a `Rev. A` **não**
fechou foi o **10**, e ela o fechou **parcialmente** — matou `LIVE` e `AS AT T`, deixou
`Documentation`, `API Status` e `lang="en"`. Não corrijo por pedantismo: **"11 de 13" implica dois
desvios abertos, e um deles seria invisível** — quem fosse conferir procuraria um segundo defeito
que não existe, e a busca terminaria em "não achei", que é indistinguível de "não olhei".

⚠️ **E um `[MEDIDO]` deste arquivo que NÃO reproduz exatamente:** §4.1.3 diz *"12 referências POR
NOME"* de `chart-up`/`chart-down`. **Medi 11** aplicadas + 2 na config
(`grep -o 'chart-up\|chart-down'` fora do bloco `tailwind.config`). Diferença de **1**, o
argumento é **idêntico** (a paleta está centralizada, trocar 2 valores corrige N marcas) e a
decisão que ele sustentou está certa. Registro porque **número publicado que não reproduz já é
defeito conhecido deste repositório**, mesmo quando é inócuo.

#### 4.1.3 EDITAR ou GERAR NOVA — a decisão, e a medição que a decidiu

**Decisão: EDITAR.** `edit_screens` sobre `f233baf87e12403797d1c867f69ab53d`, com o §9 verbatim
seguido de uma lista de 13 correções nomeadas e uma lista de 13 preservações explícitas.

**A hipótese que motivava GERAR NOVA era:** *"a paleta rejeitada está embutida na geometria, e
editar a arrasta."* **Medi, e a hipótese é FALSA:**

```
grep -c 'chart-up\|chart-down'   =>  a paleta de direção vive em 2 LINHAS da config do Tailwind
                                      + 12 referências POR NOME nos elementos
```

A paleta está **centralizada num bloco de configuração**, não espalhada na geometria. Trocar
dois valores nomeados corrige 12 marcas de uma vez. **Isto favorece editar, não gerar.**

**O que gerar nova custaria, e é o que decidiu:** re-rolar estrutura que é **específica e difícil
de re-derivar** —

| ativo em risco numa geração nova | por que é difícil de recuperar |
|---|---|
| a linha-guia tracejada **apontando para trás** com marca no fim (`D5.2`) | é geometria derivada de `available_at`, não um padrão que um gerador produz por default |
| `price_source` **E** `price_use` declarados juntos | é `ADR-007`, e o default de qualquer gerador é declarar **uma** fonte de preço |
| o traço na linha de base para lacuna de `FLOW` (`D5.3`) | o default é interpolar ou zerar — os dois são o defeito |
| `DERIVADO` **com a expressão** | o default é um badge com a palavra, sem a expressão |
| o chip `MAINNET` (contra o `"PROD v2.4"` que o `designMd` mandava) | o gerador **desobedeceu para o lado certo** — isso não se pede, acontece |

**Contra-argumento, e ele é real:** o que a edição **não** pode fazer é o que exige *acrescentar*
— o campo `idade` (o selo estava em 3/4) e o canal de integridade inteiro (violeta + losango +
palavra, ausentes). Esses dois não são correção, são **inclusão**, e uma edição pode falhar em
inclusão de um jeito que uma geração nova não falharia.

**Ficou registrado como o falsificador desta decisão:** se a edição voltar sem o campo `idade` e
sem o losango, **editar foi a escolha errada** para estes dois itens, e o remédio é uma segunda
passada dirigida **só** a eles — não uma geração nova, porque a estrutura correta continuaria
valendo.

**E `R7` pesa aqui:** `S2` é núcleo operacional. Descartar uma `S2` materializada que acerta 13
coisas para consertar 13 outras é uma mudança maior do que consertar — e mudança em `S2` é
BLOCKER por default.

#### 4.1.4 O QUE "PROMOVER" VIROU MECANICAMENTE — e por que não foi um rename `[MEDIDO 2026-08-28]`

`R7` foi liberado pelo owner (*"ok, pode seguir com as sugestões, considere aprovado"*). A
pergunta que sobrou é **o que promover SIGNIFICA nesta ferramenta**, e a resposta é medida:

**A promoção NÃO É um ato no Stitch, porque o Stitch não expõe nenhuma operação de identidade de
tela.** O inventário completo de tools que tocam tela é:

| tool | o que faz | toca identidade? |
|---|---|---|
| `generate_screen_from_text` | **cria** tela nova | não (título é derivado) |
| `edit_screens` | edita — e **bifurca**, criando tela nova (§5.3) | não |
| `generate_variants` | **cria** variantes | não |
| `apply_design_system` | reaplica tokens em instâncias | não |

⇒ **não há `delete_screen`, não há `rename_screen`, não há `update_screen`.** As duas ações que a
palavra "promover" sugere — **renomear a boa** e **apagar a velha** — são **as duas inexecutáveis**.
`[MEDIDO: o schema do MCP, 15 tools, nenhuma com verbo de mutação de título ou de remoção de tela]`

**Portanto a promoção é DOCUMENTAL, e foi desenhada para ser mais forte do que um rename seria:**

1. **§4.1.0 nomeia o `screenId` canônico**, com a tabela das três e o número de reprovações de cada.
2. **A linha 4 do cabeçalho carrega o id**, não só a contagem — primazia. É o mesmo argumento de
   posição que moveu o item 16 do §9 para o topo na 5ª revisão: o leitor futuro lê o cabeçalho,
   não a seção 4.
3. **A `f233…` e a `Rev. A` ficam rotuladas como REVOGADAS, com o número** (24 e 4 contra 0), em
   tarja — `R11`: erro se tarja, não se apaga. Aqui a tarja é literalmente a única opção, porque
   apagar é impossível.
4. **A identidade passou a ser uma REGRA, não um retrato** (§4.1.0): identidade é o `screenId`;
   título é ruído gerado pela ferramenta; e o discriminante executável é `verify_screen.py` → exit 0.

**Por que isso é melhor que o rename que o owner supôs, e não só um substituto:** um rename
deixaria três títulos separados por **6 caracteres** (`""`, `" Rev. A"`, `" Rev. B"`) — que é
exatamente a armadilha de confusão que já custou reler o id errado. A regra de identidade **remove
a autoridade do título**, então a armadilha deixa de existir mesmo com os títulos parecidos.

⚠️ **O que a promoção NÃO conseguiu, e fica declarado:** **o canvas do Stitch continua ambíguo
para quem o abrir sem este documento.** As três telas ficam lado a lado, e a **defeituosa é a
primeira em ordem de leitura** (`x`: `f233…` 1024 → `Rev. A` 3392 → `Rev. B` 4736)
`[MEDIDO: get_project.screenInstances]`. Não há como marcar a canônica **dentro** do Stitch.
**Falsificador / condição de expirar:** se o MCP ganhar `delete_screen` ou um campo de título
gravável, esta seção expira e a limpeza passa a ser executável em um comando.

⚠️ **Uma opção que EU RECUSEI, e o motivo:** pedir ao gerador, no prompt, que escrevesse um título
canônico. **Não fiz, e não é timidez:** o título do *screen* não é um campo que o prompt endereça
(prova: pedi `<title>` do **documento** e obtive; o título do *screen* saiu `Rev. B` de qualquer
forma), e instruir um gerador de UI a "nomear a tela" tem risco real de virar **texto renderizado
na tela** — que seria uma regressão de conteúdo contra uma linha de base de 0 reprovações.
Custo de tentar: uma regressão possível num artefato aprovado. Benefício: cosmético no canvas.

**Job:** *olhar uma série contra o preço e afirmar o que ela significa.*

**S2-mínima é a primeira fatia de valor visível** (fase `05`), e a honestidade sobre que valor é este está
escrita: é valor **de verificação**, não operacional. **Não mostra o mercado agora** — o painel de OI vem
do dump com **~30,3 h de idade** e cobre 4 dias **com um buraco real**.

| conteúdo da S2-mínima | |
|---|---|
| símbolo | 1 (BTCUSDT), 4 dias |
| painéis | **Preço** · **OI** · **CVD delta** · **CVD acumulado** |
| painel de Preço | declara **`price_source` E `price_use`** na linha do painel |
| selo | 4 campos, **visível sem hover** |
| içamento | 3 níveis (sessão / painel / número) |
| `knowledge_time` | **na URL** |
| `pointer_mode` | `read` / `annotate`, overlay acima do plot e abaixo do crosshair |
| atribuição | notice do `NOTICE` + **TradingView** creditada com link |

**Não faz:** zero algoritmo, zero limiar, zero "sinal". A caixa que o owner desenha é **entrada** da fase
seguinte, não saída desta.

### 4.2 S1 — console de coleta e retenção · **EXISTE NO STITCH** `[MEDIDO 2026-09-02]` · fase `07`

**Job:** *o que está sendo gravado, o que parou, quanto disso é perda permanente.*
**⚠️ S1 NÃO é canal de alarme.** É onde se **diagnostica depois de ser avisado** — "coletor parado" é P1
com orçamento de 24 h e **não pode depender de uma aba aberta**.

#### 4.2.0 QUAL DAS QUATRO TELAS É A `S1` — leia isto antes de qualquer coisa `[MEDIDO 2026-09-02]`

**A `S1` é `c0fc0210272f42a1ae29b6364e68d2e4`.** As outras três existem, não podem ser apagadas
(mesmo motivo de §4.1.4 — o MCP não expõe `delete_screen` nem `rename_screen`), e estão revogadas.

| `screenId` | título no canvas | rodada | gate | estado |
|---|---|---|---|---|
| **`c0fc0210272f42a1ae29b6364e68d2e4`** | `S1 Console — Diagnóstico Operacional (Rev. B)` | 3ª edição | `/design-critique` **APROVADO COM CONDIÇÃO → condição fechada** (2 Must-Fix + 1 Should-Fix verificados por `grep`) | ✅ **CANÔNICA** |
| `a0bea398e8794689b87452cb2626d3d5` | `S1 Console — Diagnóstico Operacional (Rev. A)` | 2ª edição | `/design-critique` — 2 Must-Fix, 1 Should-Fix | ⛔ REVOGADA — superada pela `Rev. B` |
| `8d8d58da6472459abb0aba4143d1bf82` | `S1 Console — Diagnóstico Operacional` | geração inicial, tentativa 1 | autoavaliação `ui-designer` (sem sino, pt-BR) — não fechava `D7.14` nem tinha o seletor removido | ⛔ REVOGADA — base da `Rev. A` |
| `f950d52a464c45cbac39d8a56c39122c` | `S1 Console — Diagnóstico Operacional` | geração inicial, tentativa 2 | autoavaliação `ui-designer` — **desqualificada**: sino de notificação real + microcopy em inglês (`LIVE`, `AS AT T`, `Documentation`, `API Status`) | ⛔ REVOGADA — nunca editada |

**Por que existem duas gerações iniciais:** `generate_screen_from_text` retornou `"operation timed
out"` no client **duas vezes seguidas**, mas **ambas completaram no servidor** — `list_screens`
revelou as duas telas depois. A tentativa 1 é a que não tem sino nem microcopy em inglês; a
tentativa 2 tem os dois, e por isso nunca foi editada. Histórico completo, com todos os `grep`
que decidiram cada corte: `docs/context/plataforma-dados/gates/T-07.12-design.md`.

##### ⇒ A REGRA DE IDENTIDADE — a mesma de §4.1.0, e vale aqui pelo mesmo motivo

**A identidade da `S1` é o `screenId`, não o título.** `edit_screens` auto-incrementou o título de
`"S1 Console — Diagnóstico Operacional"` para `"(Rev. A)"` e depois `"(Rev. B)"` — a mesma mecânica
de auto-incremento por tentativa (não por mérito) que §4.1.0 já mediu para `S2`. O discriminante
executável aqui **não é** `verify_screen.py` (calibrado para candles/painéis de preço — ver a nota
de escopo abaixo) — é o par de relatórios em `docs/context/plataforma-dados/gates/`, com o `grep`
exato que cada achado usou.

**Identidade medida — da tela CANÔNICA** `[MEDIDO 2026-09-02]`:

| campo | valor |
|---|---|
| `screenId` | **`c0fc0210272f42a1ae29b6364e68d2e4`** |
| título | `S1 Console — Diagnóstico Operacional (Rev. B)` (escolhido pela ferramenta) |
| `deviceType` | `DESKTOP` |
| render | `2560 × 2048` |
| arquivo | `projects/…/files/65ff7b0f690240c588fd6a2536084c84` |
| design system | `assets/0334450534074a98ba400e46f5b69dc7` (`Quant-Precision Core` — o mesmo que governou a `S2` canônica) |
| gate | `/design-critique` independente: **APROVADO COM CONDIÇÃO** → 2 Must-Fix + 1 Should-Fix fechados na `Rev. B`, verificados por `grep` no HTML baixado (não por autoavaliação) |

#### 4.2.1 O que a tela materializada ACERTOU — medido no HTML, não estimado

| acerto | evidência no HTML |
|---|---|
| **`D17` / item 5 do §9 (severidade sem cor) de verdade** | 4 badges de status (`PARADO`/`ATIVO`/`ARQUIVO`/`PENDENTE`) usam o MESMO token neutro `bg-surface-border text-provenance-strong` — nenhum vermelho, nenhuma cor de alerta |
| **linha "parou" no TOPO por posição, não por cor** | `<!-- Stopped (TOP) -->` no código + linha `/futures/data/*` fisicamente primeira na tabela, com glifo `stop_circle`, badge idêntico ao `ATIVO` |
| **`D7.12` — `janela_de_perda` como fórmula, com o produto visível** | `"2.206 pts × 1m ≈ 1,5 dia"`, `"~2.000 pts × 5m ≈ 7,0 dias"`, `"3.052 pts × 1m ≈ 8 dias"` — não é resultado seco, é `pontos × intervalo` |
| **`D7.12` — tags de exceção sem inventar número** | `[DOC-ONLY]` para a série `daily`, `"NÃO MEDIDA"` para o dump S3 |
| **`D7.13` — trilho de resiliência escrito com o multiplicador** | `"T1m / SLO ~4.7x"`, `"T5m / SLO ~4.7x"` em toda linha ativa, inclusive a de liquidação (fechado na `Rev. B`) |
| **`D7.14` — retenção anticorrelacionada, texto quase literal** | `"janela válida no regime atual, não garantida em cascata"`, dentro da célula de `JANELA_DE_PERDA` (posição corrigida na `Rev. B`) |
| **`D7.15` — reconexão como rotina, não como erro** | painel "Reconexões e Rotina": log monoespaçado em `text-provenance-weak`, `WS drop`/`WS resume` cronometrados, sem badge de erro, sem ícone de alerta |
| **ausência do sino de notificação, com o motivo registrado no próprio código** | `<!-- No trailing icons as per constraints, removing settings/notifications -->` |
| **microcopy 100% pt-BR, `lang="pt-BR"`** | zero ocorrência de `LIVE`/`AS AT T`/`Documentation`/`API Status` nas quatro rodadas a partir da tentativa 1 |
| **`aria-label` nos 6 links da side nav, espelhando `title`** | fechado na `Rev. B` — 6 pares `title="X"`/`aria-label="X"` idênticos |
| **figuras tabulares, `JetBrains Mono` em todo numeral** | `tabular-nums` em toda célula de dado |
| **chrome global correto para o escopo da tela** | seletor de símbolo/timeframe (`BTCUSDT`/`15m`, herdado da `S2`) foi **removido** na `Rev. A` — `S1` não é escopada por símbolo; `AO VIVO`/`COMO EM T`/`MAINNET`/`v2.4`/`UTC` preservados |

#### 4.2.2 O que ainda NÃO está resolvido — registrado, não escondido

| item | estado |
|---|---|
| ambiguidade do multiplicador `~4.7x` idêntico em `T1m` e `T5m` | achado 4 do `/design-critique`, **não bloqueante por decisão do coordenador** — pergunta para a fonte de dado antes de promover além desta rodada, não resolvida aqui |
| selo de 4 campos (série/idade/procedência/completude) aplicado a numerais operacionais | `[NÃO SEI]`, aberto desde a 1ª geração — os números de `S1` (janela em dias, GB/dia, fila) são operacionais, não leituras de mercado, e é uma leitura razoável que o selo estrito não se aplica, mas não foi confirmada pelo gate |
| console sem nenhuma ação por linha (restart, ver log bruto) | fora do escopo de `D7.12`–`D7.15` (nenhum DoD pede ação) — achado "Could-Improve" do `/design-critique`, não bloqueia |
| superfície herdada fora das três canônicas (`#10131a`/`#0b0e15`, contraste **1,038** contra `#131722`) | **não é defeito novo desta tela** — é o mesmo drift já registrado em §5.2 para o asset `0334…` inteiro (`background` a 1,02–1,04 de `#131722`); corrigir é ato sobre o design system, fora do escopo de `T-07.12` |
| `verify_screen.py` não cobre `S1` | o script mede candle/direção/selo de mercado — calibrado para `S2`. A maioria das reprovações que ele produz contra `S1` (`E2`/`E3a`/`E4` de candle, `P-preservacao` de features de `S2`) são **falsos negativos estruturais**, não achados. O gate real desta tela foi `/design-critique`, registrado em `docs/context/plataforma-dados/gates/T-07.12-ux-critique.md` |

**Histórico completo da iteração** (as 4 rodadas, cada `grep` que decidiu cada corte, o texto
integral do `/design-critique`): `docs/context/plataforma-dados/gates/T-07.12-design.md` e
`docs/context/plataforma-dados/gates/T-07.12-ux-critique.md`.

### 4.3 S3 — inspetor de série · `[NÃO EXISTE]` · fase `06`

**Job:** *o que este número é, e quais linhas exatas o produziram.* Inclui a **gaveta de quarentena**.

### 4.4 S4 — bancada de distribuição · `[NÃO EXISTE]` · fase `08`

**Job:** *que taxa de disparo um limiar produziria — antes de escolher o limiar.*
**Sem botão com verbo por linha** — a superfície não age. E **nenhum nudge** para baixar o limiar.

---

## 5. Design system

Fonte única: [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) · decisão em [`ADR-010`](../adr/ADR-010-governanca-de-cor-por-tipo-de-marca.md).
Comando de verificação: `node scripts/validate_palette.js` — **361 medições, exit 0, nos dois modos, sob
as TRÊS dicromacias.** Estimador: **Brettel 1997**, planos derivados em execução.

> ### ⛔ MUDANÇA ESTRUTURAL de 2026-08-25 (2ª revisão)
>
> ~~"Vermelho significa 'o dado quebrou', não 'o preço caiu'. Vela de baixa não é vermelha."~~
> **REVOGADO.** O owner declarou que usa TradingView todo dia e que a ausência de vermelho ficou
> "super estranha" — o que **realiza o falsificador que a auditoria já havia nomeado** (Jakob's Law
> morde quando os dois monitores ficam lado a lado). Ver `DESIGN_SYSTEM.md` §0.
>
> **O novo eixo é o TIPO DE MARCA**, não o significado. E a medição fechou o caso por um segundo
> caminho: o par da TradingView `#089981 ↔ #f23645` mede **18,0** sob `min(protan, deutan, tritan)` e
> **PASSA** — o verde/vermelho *genérico* mede 12,2 e é WARN. ~~**Não havia trade-off a pagar.**~~
>
> ⛔ **TARJA de 2026-08-25 (5ª revisão): "não havia trade-off a pagar" é FALSO, e sobreviveu aqui
> por 24h depois de já ter sido tarjado em outro arquivo.** `[MEDIDO: bash scripts/measure_stitch_drift.sh,
> BLOCO D2]` — o par **REVOGADO** mede **51,1**, o adotado mede **18,0** ⇒ a troca **custou 33,1 ΔE**
> de separação sob dicromacia, e o custo foi **ACEITO** (os dois passam o piso de 15; o que se exige
> do par de direção é *passar*, não *maximizar*, porque a direção é coberta por **forma**).
> **A decisão não muda. A prestação de contas muda:** uma decisão com custo declarado é auditável,
> uma anunciada como grátis não é.
>
> **E o modo de falha é o que importa registrar:** `DESIGN_SYSTEM.md` §0.2 tarjou isto na **4ª**
> revisão, `STITCH_CONTEXT.md` e `ADR-010` **não** — e `measure_stitch_drift.sh` imprime a
> contradição **a cada execução** desde então. É exatamente a divergência de terceiro lugar que o
> §5 deste arquivo avisa, ocorrendo **entre três documentos e um script ao mesmo tempo**. A regra
> que sai disto: **tarjar um número obriga a `grep` do número nos outros arquivos, no mesmo commit.**
> *(Tarja anterior, mantida: a 2ª revisão publicou `18,2` sob Viénot 1999; sob Brettel 1997 é `18,0`. Veredito idêntico.)*
>
> ### ⛔ SEGUNDA MUDANÇA ESTRUTURAL, de 2026-08-25 (3ª revisão)
>
> **Tritanopia foi MEDIDA e REPROVOU o violeta.** `--dado-quebrado-ink` mudou nos **dois** modos:
> ~~`#6d28d9`~~ → **`#581c87`** (claro) e ~~`#c084fc`~~ → **`#e0aaff`** (escuro). O par
> `dado-quebrado × proc-fraca` media **5,3** em tritan no claro — abaixo até do piso de WARN. Ver
> `DESIGN_SYSTEM.md` §1.4-bis e [`ADR-010`](../adr/ADR-010-governanca-de-cor-por-tipo-de-marca.md).

O que **nenhum** prompt de Stitch pode contrariar:

1. **Direção de preço é verde/vermelho da TradingView, e vive SÓ em preenchimento de forma.**
   Nenhum numeral, rótulo, sinal de delta ou texto é tingido de verde ou vermelho. **Não existe token
   de texto de direção** — a guarda é a ausência do token, não uma regra a lembrar.
2. **Redundância de forma obrigatória, com TRÊS estados:** corpo **vazado** = `close > open`, corpo
   **cheio** = `close < open`, **cruz** = `close == open` ⇒ **direção não afirmada**. Medido: a razão de
   luminância entre os dois fills é **1,09** ⇒ em escala de cinza são a mesma cor, e **nenhum** par de
   hue resolve isso (o azul/laranja anterior colapsava igual, em 1,38). **Não force altura mínima de
   corpo** — ver `DESIGN_SYSTEM.md` §1.9.
3. **"Dado quebrado" é VIOLETA** — `#581c87` claro / `#e0aaff` escuro — e o violeta é o **terceiro**
   canal: **losango vazado** + **palavra** + cor. Nunca vermelho, nunca preenche área, **nunca tinge
   numeral**. ⚠️ **Os valores anteriores (`#6d28d9` / `#c084fc`) REPROVAVAM sob tritanopia** (5,3 e 14,7).
4. **Só três hues existem na interface:** verde-teal, vermelho, violeta. **Ação e procedência vivem no
   canal de luminância** — ação **não é azul**, porque azul × violeta mede **0,3** sob deuteranopia.
5. **O numeral tem UM eixo de tinta**, o de procedência, e ele **não tem hue**. O sinal de um delta é
   lido pelo caractere `+`/`−` em coluna tabular fixa, pela geometria do plot, e opcionalmente por
   mini-barra (que é forma).
6. **ALERTA E SEVERIDADE FICAM FORA DO CANAL DE COR** (`CA-F4-10`), e **a regra é genérica** — vale para
   toda afirmação de estado grave, **não só** para integridade de dado. `coletor PAROU` (`S1`) é
   **severidade operacional**, não integridade, e **não herda o violeta**: vive em palavra + glifo +
   posição + contagem. Quatro argumentos independentes: escassez de canal · `forced-colors` (e a
   premissa dele **estava invertida** — item 10) · contraste medido · **tritanopia, agora MEDIDA e que
   reprovou** o violeta na primeira posição em que ele foi posto.
7. **4 papéis mutuamente exclusivos**: direção · integridade · procedência · marca. Não cruzam. E
   **severidade não é um quinto papel de cor** — é um papel **sem** cor.
8. **Nenhum numeral sem selo, visível sem hover. Tooltip não conta.**
9. Numeral com **ponto decimal, invariante de locale**; pt-BR só em microcopy e rótulo de eixo.
10. **`forced-colors` (HCM do Windows) trata as duas metades da tela de forma OPOSTA:** sobrescreve o
    chrome (CSS) e **não** afeta o plot (`<canvas>`) ⇒ **híbrido descasado**, não degradação graciosa.
    Toda cor do plot tem de poder **chegar como argumento** (`FR-1`, `ADR-003:36`). `[NÃO SEI]` se o
    owner usa Windows/HCM — é uma pergunta de uma linha e está aberta.
11. **O anel de foco é DESLOCADO** (`outline-offset > 0`), e isso é **requisito de acessibilidade**:
    `--foco` é **byte-idêntico** ao token que ele encosta (contraste **1,00**). Com o vão de superfície
    o pior caso é **4,89**; colado, **reprova**.
12. **Os dois modos são validados.** O modo de geração é **ESCURO** (`#131722` / `#0d1017` /
    `#222634`) — é o default da TradingView, e o `--dado-quebrado` mede **8,15** no escuro contra
    **9,54** no claro. O ramp claro existe, passa, e **não** é o que se gera.

Os valores exatos vivem **só** em [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) §1.2 e no §9 deste arquivo —
repeti-los em terceiro lugar **já produziu divergência** entre documentos uma vez.

---

### 5.1 Os design systems que existem DENTRO do Stitch `[MEDIDO 2026-08-25, 5ª revisão]`

> ### ⛔ TARJA de 2026-08-25 (5ª revisão): a tabela desta seção dizia **3** design systems, e são **4**
>
> ~~3 design systems: `95d1…` (v1, paleta revogada) · `483322…` (criado nesta rodada) · `15706…` (sonda)~~
>
> **São QUATRO**, `95d1…` está em **`version: 2`**, e o quarto — `0334…` — **é o que de fato governou
> a geração**. `[MEDIDO: list_design_systems + get_project, 2026-08-25]`

| asset | nome | estado `[MEDIDO: list_design_systems, 5ª revisão]` |
|---|---|---|
| **`assets/0334450534074a98ba400e46f5b69dc7`** | `Quant-Precision Core` | ✅ **É O TEMA QUE GOVERNOU A GERAÇÃO DA `Rev. A`.** `version: 1`. Os 54 `namedColors` são **idênticos, token por token, ao `tailwind.config` do HTML da `Rev. A`** — é assim que se sabe. Carrega os **6 tokens de papel governado** (`direction-up`, `direction-down`, `integrity-ink`, `provenance-strong`, `provenance-weak`, `focus-stroke`) + `surface-border`, tem `labelFont: JETBRAINS_MONO` e **nenhum campo `roundness`** (⇒ cantos retos sobrevivem). ⚠️ **A ORIGEM DELE É `[NÃO SEI]`: nenhuma chamada registrada no §8.2 o explica.** Seu mapeamento de slot (`primary #131722` · `secondary #333846` · `neutral #0d1017`) é um **terceiro** mapeamento, diferente do que o §5.1 diz ter enviado |
| `assets/95d106376b754a1b96ff2496b0630432` | `Quant-Precision Core` | ⛔ **`version: 2`. A ESCRITA PERSISTIU** — ver a tarja do "achado de API" abaixo. E a v2 é **pior** que o alvo em três eixos: `labelFont: PUBLIC_SANS` (numerais saíram da monoespaçada, contra §9 item 13), `roundness: ROUND_FOUR`, e **7 tokens de violeta** derivados de **um** override. **Não é o tema que gerou a `Rev. A`** |
| `assets/483322114126186925` | `Procedencia-Core (ADR-010, 3a revisao)` | ⚠️ criado na 4ª rodada. `version: 1`, e **não tem `namedColors`, `typography`, `spacing`, `styleGuidelines` nem `labelFont`** — é um registro de tema **NÃO DERIVADO**. ⇒ **o falsificador que o §5.1 declarou ("reler `namedColors.primary`") é INEXECUTÁVEL neste asset: não há `namedColors` para ler.** Não governou geração nenhuma |
| `assets/15706151352078452366` | ~~`PROBE-persistencia`~~ → **`Slate & Steel`** (nome **escolhido pela ferramenta**, não por mim) | 🧹 sonda descartável, **reusada na 5ª revisão** e agora em `version: 2`. **É a prova de que `update_design_system` REGENERA em vez de atualizar** — ver §5.2. Entrega o tema **100% acromático** que a condição G1 pede: **43 de 47 tokens abaixo do teto C* 9,95, zero violeta, zero bege**; o único resíduo é a escada de `error`. **Não há tool de delete**; fica para limpeza manual |

⚠️ **E há um QUINTO tema, que não é asset: `project.designTheme`.** Ele continua sendo a paleta
**integralmente revogada** (`customColor #2a78d6` · `overrideSecondary #eb6834` · `overrideTertiary
#f23645` · `namedColors.primary #a8c8ff` · `primary_container #4b91f1` · `surface #121315`) —
`[MEDIDO: get_project, 5ª revisão]`. **É uma cópia desnormalizada, e ela NÃO seguiu `95d1…` de v1
para v2.** Consequências, e as duas importam:

1. **Ler `get_project.designTheme` nunca poderia ter mostrado a mudança do asset.** Aquela leitura
   não é uma leitura tardia do recurso certo — é a leitura de **outro objeto**. Ver §5.3, degrau 1.
2. **Nenhum tool deste MCP escreve `project.designTheme`.** `update_design_system` endereça
   `assets/{id}`. ⇒ se `designTheme` fosse o que governa a geração, a paleta revogada seria
   **inconsertável por este MCP**. **Ela não é o que governa:** a `Rev. A` saiu de `0334…`, com as
   três superfícies corretas e zero azul. `[NÃO SEI]` **para que serve** `project.designTheme`, e a
   pergunta baixou de prioridade porque deixou de bloquear.

#### O que o `Quant-Precision Core` prescrevia, e é o que a tela obedeceu

`"Bullish (Up): #2a78d6 (Blue)"` · `"Bearish (Down): #eb6834 (Orange)"` ·
`"System Alert/Error: #f23645 (Red)"` · superfícies `#0a0b0d` / `#16181d` ·
`"Provenance Badges: soft, desaturated tints (#93c5fd, #c4b5fd, #99f6e4)"` ·
chip `"PROD v2.4"` · `"AS AT T" / "LIVE"`.

⇒ **a tela não era um desvio do design system: era obediência a um design system errado.** Essa
distinção importa para escolher o remédio — não se conserta por prompt melhor, conserta-se
trocando a fonte.

#### ⛔ POR QUE NÃO SUBI O `DESIGN_SYSTEM.md` COMO FONTE — e a medição que decidiu

`upload_design_md` + `create_design_system_from_design_md` existe, e a tentação é óbvia: o
`DESIGN_SYSTEM.md` **é** a fonte de verdade. **Medi antes de subir:**

```
ocorrências de hex REVOGADO em DESIGN_SYSTEM.md:  51
  #eb6834 14 · #2a78d6 8 · #d03b3b 8 · #c084fc 5 · #6d28d9 4 · #f5f5f5 4 · #e34948 4 · #008300 4
ocorrências de hex EM VIGOR:                      67
linhas dentro do §0 (o bloco REVOGADO, preservado por R11): 257 de 962  ⇒  27% do arquivo
```

**`#eb6834` (14) aparece MAIS vezes que `#089981` (8).** Um gerador **sem memória**, lendo este
arquivo, encontra o laranja de baixa revogado com **mais frequência** que o teal de alta em
vigor — porque `R11` manda **tarjar, não apagar**, e a tarja é texto que o modelo lê como
qualquer outro.

⇒ **`DESIGN_SYSTEM.md` e o `designMd` do Stitch são artefatos com jobs OPOSTOS, e conflatá-los
é o defeito:**

| artefato | job | forma |
|---|---|---|
| `DESIGN_SYSTEM.md` | **registro de decisão** — precisa do erro tarjado para ser auditável | argumento, com histórico |
| `designMd` do Stitch | **brief de gerador** — precisa de **zero** menção ao revogado | prescrição, sem histórico |

**A propriedade que torna `DESIGN_SYSTEM.md` bom como registro (não apaga o erro) é exatamente
a que o torna perigoso como brief.** O brief novo foi escrito à mão e **verificado por comando**:
`grep` de todos os 8 hexes revogados ⇒ **zero ocorrências**.

#### O caminho escolhido, e por quê

**`create_design_system` com tema explícito.** Não `apply_design_system` (aplicaria o sistema
**errado**, que é o único que existia). Não `create_design_system_from_design_md` (deriva os
*slots* de tema a partir da prosa — e é justamente o mapeamento de slot que eu precisava
controlar, ver abaixo).

#### ⚠️ O desencontro de esquema que eu declaro em vez de esconder

**O modelo de tema do Stitch tem um slot chamado `primary`, e o usa para ação: botão, link,
estado ativo, rail. Este design system NÃO TEM hue de ação** (`ADR-010` D-4: ação vive em
luminância). O `customColor` `#2a78d6` do tema antigo gerou `namedColors.primary: #a8c8ff` — e
é **esse** azul derivado que apareceu 7× na tela. **O drift de ação-é-azul não foi invenção do
gerador de tela: foi o sistema de cor dinâmica cumprindo o seu papel a partir de uma semente
azul.**

Resolução adotada, e é uma escolha entre males:

| slot | valor | razão |
|---|---|---|
| `colorVariant` | `MONOCHROME` | faz a paleta derivada nascer **neutra** ⇒ o gerador não fabrica um azul |
| `customColor` (semente) | `#8b949e` | `--acao-borda`. Semente acromática, para não haver hue a derivar |
| `overridePrimaryColor` | `#8b949e` | "primary" é **deliberadamente acromático** |
| `overrideSecondaryColor` | `#e0aaff` | integridade é o **único** hue que precisa viver em INK/chrome |
| `overrideTertiaryColor` | `#8b949e` | **starvation deliberada:** o orçamento de hue tem 3 vagas e 3 ocupantes ⇒ não há hue para um terceiro papel de acento |
| `overrideNeutralColor` | `#131722` | `--sup-base` |

**Direção (`#089981` / `#f23645`) NÃO entrou em slot nenhum de tema, e isso é intencional.**
Direção é `fill`, vive no plot, e por `D19`/`FR-1` chega a `charts` **como argumento**, nunca de
CSS. Pôr direção num slot de tema é o que produziu os tokens `chart-up` / `chart-down` no
Tailwind da tela antiga. Direção é prescrita **só na prosa do `designMd`**.

⚠️ **`[NÃO SEI]` se `MONOCHROME` + estes overrides produz a paleta derivada que eu espero.**
Não li de volta os `namedColors` do asset novo. **Falsificador executável, uma chamada:**
`get_project` depois de o tema novo ficar ativo — se `namedColors.primary` voltar a ser um azul,
a starvation não funcionou e o remédio passa a ser prescrever os `namedColors` um por um.

#### ⛔ O "ACHADO DE API" DESTA SEÇÃO ESTAVA ERRADO, E O ERRO ERA PIOR QUE O DEFEITO QUE ELE ALEGAVA

> ### ⛔ TARJA de 2026-08-25 (5ª revisão): **`update_design_system` PERSISTIU.**
>
> ~~**ACHADO DE API: resposta de sucesso não é prova de escrita.** `update_design_system` sobre
> `assets/95d1…` retornou 200 com o tema novo ecoado inteiro — e **não persistiu**. `create_*`
> devolve `name` + `version` de um asset ⇒ persistiu. `update_design_system` devolve
> `sessions/...` ⇒ **não confie**.~~
>
> **`assets/95d106376b754a1b96ff2496b0630432` está em `version: "2"`, e o payload gravado é
> exatamente o que esta seção diz ter enviado** `[MEDIDO: list_design_systems, 5ª revisão]`:
>
> ```
> customColor            #8b949e   (migrou de #2a78d6)
> overridePrimaryColor   #8b949e
> overrideSecondaryColor #e0aaff
> overrideTertiaryColor  #8b949e
> overrideNeutralColor   #131722
> ```
>
> **A escrita landou. As duas leituras que a declararam ausente falharam por motivos DIFERENTES,
> e essa distinção é o achado real:**
>
> | leitura | por que falhou |
> |---|---|
> | `list_design_systems → version: 1` | **cedo demais.** Reproduzido ao vivo na 5ª revisão: um `update_design_system` retornou 200 e a releitura **imediata** mostrou `version: 1` inalterado. Uma leitura única que devolve a versão antiga **não é** "não persistiu" — é **"ainda não visível"** |
> | `get_project.designTheme → INALTERADO` | **nunca poderia ter mostrado a mudança.** `designTheme` é **cópia desnormalizada no projeto** e **não seguiu o asset de v1 para v2**. Ler a cópia não é ler o recurso. Isto não é latência: é **objeto errado** |
>
> **E a consequência é pior que o erro, porque uma escrita bem-sucedida e NÃO PERCEBIDA é mais
> perigosa que uma falha.** A escrita que passou desapercebida degradou o asset em três eixos e
> promoveu um hue a papel que ele não tem:
>
> - **`labelFont: PUBLIC_SANS`** — os numerais **saíram do JetBrains Mono**, e de propósito: o
>   `designMd` regenerado chama Public Sans de *"alternative to traditional monospaced fonts"*.
>   Contra §9 item 13 (`tabular-nums` **em monoespaçada**).
> - **`roundness: ROUND_FOUR`** + prosa *"Soft (4px) corners for all primary containers"* — contra
>   cantos retos. ⚠️ **Mas ver §5.2: `roundness` é campo OBRIGATÓRIO do schema e não existe valor
>   "0px". Isto é limitação de esquema, não descuido de payload.**
> - **o violeta de integridade promovido a ESTADO ATIVO**: *"used sparingly … to highlight active
>   states"*, e o Sidebar *"`#e0aaff` when active"*. **Cruzamento de papel — `ADR-010` D-3 × D-4.**
>
> **E o vazamento é MAIOR do que "um slot":** `overrideSecondaryColor: #e0aaff` não acrescentou
> **um** hue, acrescentou uma **escada tonal de sete**. `[MEDIDO: audit de croma Lab, estimador
> extraído de validate_palette.js linhas 1..185]`
>
> ```
> teto acromático derivado dos tokens SEM HUE do próprio DS  = C* 9,95  (#222634)
> 95d1… v2:  12 de 47 tokens ACIMA do teto, e nenhum deles é hue governado
>   on_secondary               #481965  C* 50,57
>   secondary_container        #633480  C* 49,60
>   on_secondary_fixed_variant #60327d  C* 49,12
>   on_secondary_container     #d9a4f8  C* 48,66   <== mede 1,6 contra #e0aaff nas TRÊS dicromacias
>   secondary                  #e5b5ff  C* 42,65   <== mede 2,2 contra #e0aaff  ⇒ MESMA COR
>   secondary_fixed_dim        #e5b5ff  C* 42,65
>   secondary_fixed            #f4d9ff  C* 21,94   <== 9,4 contra #e0aaff (WARN)
>   + a escada de error: #93000a 66,31 · #690005 50,73 · #ffb4ab 30,39 · #ffdad6 13,94
> ```
>
> **O pior deles é `on_secondary_container #d9a4f8`, e não é o mais cromático: é o de PAPEL
> errado.** Um token `on_*` é **tinta desenhada sobre um container** — isto é, **texto**. ⇒ o tema
> passou a oferecer ao gerador o violeta de integridade como **cor de texto genérica**, que é a
> violação exata de `ADR-010` D-3 (integridade só em INK do losango e da régua) e do §9 item 4
> (*"integridade nunca tinge numeral"*).
>
> **⇒ O erro NÃO era "200 mentindo".** A família de defeito é: **"li o recurso errado, ou cedo
> demais, e publiquei o negativo como fato."** E a regra que faltava **está escrita neste mesmo
> arquivo, ~270 linhas antes** — a tarja do cabeçalho: *"um resultado transitório publicado como
> fato é pior que um `[NÃO MEDIDO]`, porque parece medição"*. Ela foi derivada corretamente ali e
> **não foi aplicada ao caso seguinte**. Ver §5.3.

⚠️ **O que fica de pendência, reformulado:** `[NÃO SEI]` **o que `apply_design_system` faz** —
e a pergunta **deixou de bloquear**, porque a `Rev. A` provou que **`edit_screens` já carrega o
tema sem nenhum `apply`**. A recusa do `apply` cego, registrada na 4ª revisão, estava certa **por
razão melhor do que a que foi dada**: a doc do tool diz que ele aplica *"colors, **fonts,
shapes**, etc."* ⇒ um `apply` de `95d1…` v2 teria empurrado **Public Sans** e **ROUND_FOUR** para
a tela. **Criaria dois defeitos novos enquanto consertava cor.**

---

### 5.2 O ESQUEMA do tema do Stitch — o que ele pode e o que ele NÃO pode expressar `[MEDIDO 2026-08-25, 5ª revisão]`

Medido com sondas, não inferido da doc. A sonda é `assets/15706151352078452366`, que já era
descartável.

#### `roundness` é OBRIGATÓRIO, e o esquema NÃO TEM valor para "canto reto"

**Duas chamadas idênticas exceto por um campo** — o desenho de uma variável do §5.3 degrau 5:

```
update_design_system(…, theme SEM roundness)   =>  "Request contains an invalid argument."
update_design_system(…, theme COM roundness)   =>  200
```

⇒ `roundness` é obrigatório **de fato**, não só no texto do schema. E o enum é
`ROUND_TWO` (**deprecado**) · `ROUND_FOUR` · `ROUND_EIGHT` · `ROUND_TWELVE` · `ROUND_FULL`.
**O menor valor não-deprecado é 4px. Não existe 0px.**

⚠️ **CONSEQUÊNCIA OPERACIONAL, e ela é um BLOCKER de ferramenta, não de design:** `ADR-010`/§9
exigem **cantos retos**, e `update_design_system` **não consegue escrever isso**. Qualquer
`update_design_system` sobre `assets/0334…` — o único asset hoje **sem** campo `roundness`, e
portanto o único com cantos retos — **estamparia `ROUND_FOUR` nele**. ⇒ **consertar cor via
`update_design_system` custa a forma.** É a mesma classe de troca que a 4ª revisão recusou ao não
fazer `apply` cego, e a resposta é a mesma: **não se paga.**

**O que sobra, e é o que a `Rev. A` demonstrou funcionar:** a forma chega pela **prosa** do
`designMd`. `0334…` diz *"Cantos Retos (0px) para todos os elementos"* e a `Rev. A` obedeceu —
`rounded-sm` (2px) **só** no chip de `QUARENTENA`, que é exatamente a licença que o próprio
`designMd` concede (*"Chip e badge podem usar 2px"*). **Um `borderRadius.DEFAULT: 0.25rem` ficou
declarado no `tailwind.config` e não foi aplicado a container nenhum.**

#### ⛔ `update_design_system` NÃO ATUALIZA: ele REGENERA, e descarta a sua prosa

> ### ⛔ TARJA, escrita ~20 min depois do texto que ela tarja (5ª revisão)
>
> ~~**`namedColors` é o frontmatter YAML do `designMd`, não os `override*Color`.** Nos dois assets
> derivados o bloco `colors:` e o mapa `namedColors` são o mesmo conjunto ⇒ **o frontmatter é que
> NOMEIA.**~~
>
> **A causalidade estava INVERTIDA.** Os dois concordam **porque são as duas saídas da mesma
> geração**, não porque um controla o outro. `[MEDIDO: sonda com sentinela, 5ª revisão]`

**A sonda, e ela é o degrau 4 da §5.3 executado:** enviei a `assets/15706…` um `designMd` curto
em português com frontmatter carregando **`sonda-frontmatter: '#ab12cd'`** — valor que não ocorre
por acidente — mais `direction-up`, `direction-down`, `integrity-ink`, e `labelFont:
JETBRAINS_MONO`. Releitura:

```
version:      1 -> 2                                    (persistiu, degrau 2)
displayName:  "PROBE-2 esquema…"  ->  "Slate & Steel"   <== NÃO é o que eu enviei
designMd:     o meu texto em pt   ->  brief inteiro em INGLÊS que eu nunca escrevi
namedColors:  #ab12cd             ->  AUSENTE
              direction-up / direction-down / integrity-ink  ->  AUSENTES
labelFont:    JETBRAINS_MONO      ->  PUBLIC_SANS         <== NÃO honrado
os slots de tema que eu enviei    ->  TODOS gravados (MONOCHROME, os 3 overrides, o neutral)
```

⇒ **`update_design_system` aceita os SLOTS DE TEMA e joga fora `displayName`, `designMd` e
`labelFont`, regenerando os três a partir dos slots.** Ele batizou um tema cinza de *"Slate &
Steel"* e escreveu sozinho um brief que prescreve **Public Sans** para numerais e *"Soft (0.25rem)
roundedness"*.

**Isto explica, de uma vez, tudo o que parecia inexplicável em `95d1…` v2:** o `designMd` em
inglês *"Monochrome Technical"* que ninguém escreveu · o `labelFont: PUBLIC_SANS` · a ausência de
`direction-up`/`integrity-ink`. **Nada disso foi degradação de payload. Foi o regenerador
trabalhando.** ⇒ a leitura de que *"a escrita degradou três decisões governadas"* é verdadeira no
efeito e **errada na causa**, e a causa muda o remédio.

> ⚠️ **CORREÇÃO a uma leitura que me foi repassada, e ela é minha responsabilidade verificar:**
> *"`direction-up` e `direction-down` DESAPARECERAM"* de `95d1…` **pressupõe que eles estavam lá.**
> **Não estavam.** `[MEDIDO: get_project.designTheme, que espelha o `Quant-Precision Core`
> pré-update]` — o `namedColors` daquele tema **não tem** `direction-up`, `direction-down`,
> `integrity-ink`, `provenance-*` nem `focus-stroke`. Esses tokens existem **só em `0334…`**.
> ⇒ não foram destruídos: **nunca estiveram em `95d1…`.** A distinção importa porque "a escrita
> destrói tokens custom" seria motivo para nunca escrever; o que de fato ocorre é mais estreito e
> mais acionável: **a escrita não os PRESERVA, porque regenera o documento que os declara.**

#### ⇒ CONSEQUÊNCIA OPERACIONAL: **`update_design_system` NÃO PODE ser usado para consertar `0334…`**

`0334…` é o asset que **governa a geração** (§5.1), e é o único que tem: os 7 tokens de papel
governado com **os nomes e os valores certos** · a prosa em **português** com a governança inteira
· `labelFont: JETBRAINS_MONO` · **nenhum `roundness`** (cantos retos).

**Um `update_design_system` sobre ele destruiria os quatro ao mesmo tempo** — regeneraria a prosa,
perderia os tokens, escolheria a fonte e estamparia `ROUND_FOUR`. ⇒ **a condição G1 do gate
("consertar o asset antes de gerar") NÃO É EXECUTÁVEL com esta ferramenta sobre ESTE asset.**
Não é recusa de julgamento: é medição. O caminho que resta é **`create_design_system`**, que
**armazena** o que se escreve — é o que `assets/483322114126186925` prova, com o `designMd` em
português **verbatim** e nenhum `namedColors` inventado.

#### E ISTO REABILITA A DECISÃO DA 4ª REVISÃO, que estava certa e foi lida como falha

`0334…` carrega `direction-up: #089981`, `direction-down: #f23645`, `integrity-ink: #e0aaff`,
`provenance-strong: #e6e9ef`, `provenance-weak: #8b949e`, `focus-stroke: #8b949e`,
`surface-border: #222634` — **os nomes que eu escrevi, com os valores que eu escrevi**, e prosa em
português que preserva a governança inteira. **Nenhum regenerador inventa isso.**

⇒ **hipótese forte, com falsificador nomeado:** `0334…` é a **derivação de `483322…`** feita pelo
`edit_screens` para poder gerar a tela — a prosa que a 4ª revisão escreveu à mão virou
`namedColors`, com os nomes certos, e daí foi para o `tailwind.config` da `Rev. A`. **Ou seja: o
caminho "criar asset novo com a governança em prosa, em vez de dar `update` no antigo" FUNCIONOU,
ponta a ponta.** O que falhou foi exclusivamente a **leitura** (§5.3).
**Falsificador:** um `create_design_system` novo com prosa igualmente específica deve produzir,
após um `edit_screens`, um asset derivado com os tokens **nomeados por mim**. Se produzir nomes de
Material genéricos, a hipótese cai.
⚠️ **Continua `[NÃO SEI]` o mecanismo exato**, e o mapeamento de slot de `0334…`
(`primary #131722` · `secondary #333846` · `neutral #0d1017`) **não é** o que foi enviado a
`483322…` (`#8b949e` / `#e0aaff` / `#131722`). Essa discrepância **não está explicada**.

#### O TEMA 100% ACROMÁTICO É ALCANÇÁVEL, e foi MEDIDO — o resíduo é UM, e não é o violeta

A mesma sonda entrega o alvo da condição G1. `MONOCHROME` + os três `override*Color` acromáticos
(`#8b949e`) + `overrideNeutralColor #131722`:

```
teto acromático derivado dos tokens SEM HUE do DS = C* 9,95
43 dos 47 tokens ficam ABAIXO do teto.  ZERO violeta.  ZERO bege.
primary #ffffff (C* 0,00) · secondary #bec7d2 (6,61) · tertiary #dae3ee (3,04)
os 4 acima do teto sao TODOS da escada de error:
   #93000a 66,31 · #690005 50,73 · #ffb4ab 30,39 · #ffdad6 13,94
```

⇒ **a starvation funciona, e funciona nos três slots de acento ao mesmo tempo.** A condição
mecânica é: **sobrescrever com valor acromático.** `0334…` falhou em `tertiary` porque **não
setou** `overrideTertiaryColor` e deixou o slot à derivação, que produziu bege `#d9c3ae` (C*
14,09, 1,4× o teto) — e esse bege **colide com o violeta de integridade em 1,8 sob tritanopia.**

⇒ **e o violeta NÃO deve entrar em slot nenhum.** Pô-lo em `overrideSecondaryColor` (o que a 4ª
revisão fez em `95d1…` e em `483322…`) não acrescenta **um** hue: acrescenta **sete**, porque o
sistema deriva uma escada tonal por slot. **A ferramenta não desobedeceu — ela obedeceu ao slot.**
`secondary` num tema derivado de Material é o slot de **acento de ação**, e pôr ali o hue
exclusivo de integridade faz `ADR-010` **D-3 e D-4 colidirem dentro de um slot**. Os três hues
governados são **Tier 3** (`fill`, `ink` de glifo, `on`) num esquema que só tem **Tier 2** (slots
de acento), e o Stitch **deriva** em vez de aliasar. **Direção já vivia fora do tema por `D19`/
`FR-1`; integridade tem de sair também, e chegar pelo mesmo caminho: prosa + argumento.**

#### A escada de `error` NÃO É SUPRIMÍVEL pelo esquema — e a defesa que funcionou foi a prosa

`error: #ffb4ab` (C* **30,39**), `error_container: #93000a` (66,31), `on_error: #690005` (50,73),
`on_error_container: #ffdad6` (13,94) existem **nos dois assets derivados** e no
`project.designTheme`. **Não há campo para omiti-los**, e o §9 item 5 diz *"não existe token de cor
de severidade"* enquanto no esquema do tema **ele existe sempre**.

**Mas o desenlace foi medido e é favorável, e o número que importa é a diferença entre DECLARAR e
APLICAR:**

```
tela original  (f233…)  'text-error' APLICADO 2x   |  'ffb4ab' fora do tailwind.config: 0
tela Rev. A    (7c81…)  'text-error' APLICADO 0x   |  'ffb4ab' fora do tailwind.config: 0
```

⇒ **a prosa do `designMd` derrotou o token do esquema.** O token continua declarado no
`tailwind.config` da `Rev. A` e **não é usado em nenhum elemento**. A regra que sai: **um token de
cor que o esquema impõe não é um defeito; é uma munição. O defeito é o USO.** ⇒ toda verificação
de severidade tem de medir **uso aplicado**, nunca presença do literal. Ver §8.2.

---

#### AS TRÊS LIMITAÇÕES DE FERRAMENTA, juntas — porque a terceira só apareceu na 6ª revisão

| # | limitação | medição | mitigação que FUNCIONA |
|---|---|---|---|
| 1 | **`roundness` é obrigatório e não tem valor `0px`** | `update_design_system` sem o campo ⇒ `"invalid argument"`; menor enum não-deprecado = `ROUND_FOUR` | **prosa** do `designMd`: `0334…` diz *"Cantos Retos (0px)"* e a tela obedeceu |
| 2 | **a escada de `error` é inexpurgável** | ver o bloco abaixo | **prosa**: `text-error` aplicado caiu de **2 → 0** |
| 3 | **não existe operação de identidade de tela** — nem apagar, nem renomear | os 15 tools do MCP; nenhum verbo de remoção ou de título (§4.1.4) | **documento**: a identidade é o `screenId` em §4.1.0, e o título perde autoridade |

**O padrão das três é o mesmo, e vale mais que as três:** o esquema do Stitch **impõe** decisões que
esta governança proíbe, e **a prosa vence o esquema em duas de três**. A terceira não tem mitigação
técnica nenhuma — só documental. ⇒ **a régua para julgar a ferramenta não é "ela obedece?", é "o
que ela impõe é reversível por prosa?"**

#### ⇒ FECHADO: `error: #ffb4ab` NÃO É OMISSÍVEL, e a pergunta estava mal-posta `[MEDIDO 2026-08-28]`

Ficava `[NÃO SEI]` *"se o esquema permite omitir"* o token de `error`, com a instrução de **sondar
num asset descartável**. **A sonda não foi feita, e a razão é que ela não discrimina nada — o que
faltava era ler o esquema:**

**1. Não há campo de entrada para omitir.** `DesignTheme` aceita: `colorMode` · `colorVariant` ·
`customColor` · `designMd` · `headlineFont` · `bodyFont` · `labelFont` ·
`overrideNeutral/Primary/Secondary/TertiaryColor` · `roundness` · `spacing` · `typography`.
**Não existe `error`, não existe `overrideErrorColor`.** ⇒ *"omitir `error`"* não é uma operação
mal-sucedida: **não é uma operação.** `error` é **saída** do sistema de cor dinâmica, não entrada.

**2. E ele é INVARIANTE sob toda entrada que o esquema expõe** `[MEDIDO: list_design_systems,
n=3 assets derivados]`:

```
asset      semente / variante                    escada de error
0334…      #131722  FIDELITY                     #ffb4ab · #690005 · #93000a · #ffdad6
95d1… v2   #8b949e  FIDELITY                     #ffb4ab · #690005 · #93000a · #ffdad6
15706… v2  #8b949e  MONOCHROME + 3 overrides     #ffb4ab · #690005 · #93000a · #ffdad6
                    acromáticos + neutral        <== IDÊNTICA, com starvation total
```

**Três sementes diferentes, duas variantes diferentes, starvation completa dos três slots de
acento — e os quatro valores de `error` são byte-idênticos nos três.** Nenhuma entrada disponível
o move.

**3. O único asset SEM a escada é `483322…`** — e ele não tem `namedColors` nenhum, porque **nunca
foi derivado**. ⇒ **"sem `error`" e "governa uma geração" são mutuamente exclusivos** com esta
ferramenta: a derivação é o que produz os tokens, e é também o que produz o `error`.

**4. E a prosa NÃO suprime, ao contrário das limitações 1 e 2 da tabela acima.** `483322…` diz
literalmente *"Nao existe token de severidade"* — e o asset derivado `0334…` **tem a escada
completa**. `[MEDIDO]` ⚠️ **A força desta afirmação depende da hipótese de §5.2 de que `0334…` é a
derivação de `483322…`, que continua `[NÃO SEI]` no mecanismo.** Independente da hipótese, o item 2
(invariância sob n=3) se sustenta sozinho.

⇒ **É limitação de ferramenta, ao lado de `roundness`, e a defesa é a mesma e é medida: o token
declarado não é defeito; o defeito é o USO, e o uso está em 0.** `[MEDIDO: 'text-error' aplicado —
`f233…` 2 · `Rev. A` 0 · `Rev. B` 0]`
**Falsificador:** se uma versão futura do MCP expuser `overrideErrorColor`, ou se aparecer um asset
derivado sem a escada, este bloco expira.

---

### 5.3 A ESCADA DE LEITURA — cinco degraus, e ela substitui a regra que estava errada `[5ª revisão]`

A regra antiga (*"`create_*` devolve asset ⇒ persistiu; `update_*` devolve `sessions/…` ⇒ não
confie"*) diagnosticava a ferramenta. **O defeito era no método de leitura.** Substituída por:

| # | degrau | por que |
|---|---|---|
| **1** | **NOMEIE O RECURSO.** Releia o **mesmo `name`** que você escreveu. | `get_project.designTheme` é **outro objeto** que a escrita em `assets/{id}`. Ler a cópia desnormalizada não é ler o recurso, e nenhuma espera conserta isso |
| **2** | **LEIA A `version` E EXIJA MONOTONIA.** | *"`version` igual"* numa leitura **única** não é "não persistiu": é **"ainda não visível"**. Reproduzido ao vivo na 5ª revisão |
| **3** | **RESPEITE O HORIZONTE QUE A FERRAMENTA DECLARA PARA SI.** | `generate_screen_from_text` declara *"every 30 seconds for up to 10 times"* ⇒ ~5 min. A 4ª revisão aplicou isto **corretamente** ao `edit_screens` (esperou 10× o horizonte) e **não aplicou** ao `update_design_system`, cuja releitura foi **imediata**. **Mesma régua, dois casos, um uso** |
| **4** | **LEITURA AMBÍGUA ⇒ NÃO REESCREVA, SONDE** — com valor que não ocorre por acidente. | A sonda `PROBE-persistencia` **era esse instinto e estava certa**; só não foi usada para discriminar *aquele* write. Sondar custa uma chamada; reescrever custa um asset |
| **5** | **`[NÃO SEI]` É ESTADO TERMINAL LEGÍTIMO.** | *"não persistiu"* é **conclusão**; a evidência suportava **"não observei"**. Publicar a conclusão fechou a investigação por 24h |

> ⚠️ **E o degrau que faltava para o `edit_screens`, que é a mesma falha num objeto diferente:**
> `edit_screens` **NÃO edita no lugar — ele BIFURCA.** `[MEDIDO: list_screens, 5ª revisão]` O
> original `f233…` continua **byte-idêntico** (`files/9933b6…`, o mesmo id que a 4ª revisão
> registrou) e apareceu uma tela **nova**, `7c81…`, intitulada **`"S2 Símbolo - Operacional Core
> Rev. A"`** (`files/3e5b80…`). ⇒ as **9 leituras** que a 4ª revisão fez estavam todas no recurso
> **certo para a pergunta errada**: elas provaram que o original não mudou, o que é **verdadeiro e
> irrelevante**. O degrau 1 pega isto: *o `name` que você escreveu não é necessariamente o `name`
> onde o resultado aparece* — quando a ferramenta bifurca, **é `get_project.screenInstances` que
> tem de ser lido**, e a tarja do cabeçalho deste arquivo **já dizia exatamente isso** sobre
> `list_screens`.

---

### 5.3-bis `edit_screens` TEM DOIS MODOS, e um deles NÃO PERSISTE `[MEDIDO 2026-08-28]`

A 5ª revisão concluiu *"`edit_screens` NÃO edita no lugar — ele BIFURCA"*. **Está certo, mas é
estreito demais: a ferramenta tem dois comportamentos observados, e eles se distinguem pela
resposta.**

| | **modo A — operação de DOM** | **modo B — regeneração** |
|---|---|---|
| resposta | **rápida** (segundos), `sessionEvent` com `payload_type: DomOperationEvent` e uma lista de `dom_operations` (`set_attribute`, `replace_content`, `remove_element`), cada uma com `selector` e `verified_html_context` | **timeout do tool** (a chamada estoura antes de responder) |
| `screen_id` na resposta | o **mesmo** que eu enviei (`7c81…`) | — |
| tela nova criada | **nenhuma** | **sim** — `8174…`, título `Rev. B` (auto-incremento) |
| **persistiu?** | **NÃO** | **SIM** |

**A medição do modo A, e ela é o ponto:** a resposta descreveu três operações corretas, com
`verified_html_context` citando o HTML real (`<html class="dark" lang="en">`) — ou seja, **leu a
tela certa e calculou o patch certo**. E então:

```
t+1min   list_screens          => 2 telas, mesmos ids, mesmo files/3e5b80ce…
t+1min   curl do HTML          => md5 2efd7fdf… == IDENTICO ao pre-edicao
t+1..5m  9 leituras a cada 30s => md5 INALTERADO nas nove
t+7min   list_screens (novo)   => mesmo content-id html_9646397a…
t+7min   get_screen (o `name` que eu escrevi) => mesmo arquivo
t+7min   screenshot renderizado no servidor   => rodape AINDA com os dois links
t+11min  segunda chamada       => bifurcou e persistiu (modo B)
```

⇒ **três recursos independentes** (bytes do HTML, ponteiro do arquivo, screenshot renderizado
server-side), **~11 minutos**, **>2× o horizonte que a ferramenta declara para si** (~5 min).
**A conclusão sustentada é: o modo A relatou operações que não chegaram ao arquivo da tela.**

⚠️ **E o que NÃO está provado, porque o degrau 5 existe:** `[NÃO SEI]` **para onde** as operações
do modo A foram. A resposta trouxe `sessionId` e as operações vieram embrulhadas num
`sessionEvent` ⇒ **hipótese:** existem num rascunho de sessão que **nenhum tool deste MCP lê**
(não há `get_session`). Se for isso, não é "a escrita falhou": é **"a escrita foi para um objeto
que eu não consigo ler"** — que é a **mesma família** do `get_project.designTheme` do degrau 1,
num objeto novo. **Não afirmo qual das duas, porque não tenho leitura que discrimine.**

#### O DEGRAU 6, e ele é o único que faltava

> **6 — DUAS RESPOSTAS DIFERENTES PARA A MESMA CHAMADA SÃO DOIS MODOS, NÃO RUÍDO.**
> Quando o tool responde **rápido e descrevendo o que fez**, desconfie mais, não menos: no modo A
> a resposta era *mais informativa* que no modo B (que só deu timeout) **e era a que não valia**.
> **Riqueza de resposta não é evidência de efeito.** É a mesma lição do "200 ecoando o tema
> inteiro" da 4ª revisão — e ela reapareceu num tool diferente, com uma roupa diferente, 3 dias
> depois. ⇒ o predicado operacional é **um só**: *o artefato mudou?* Nada além disso conta.

**Consequência prática, e é uma regra de operação:** depois de `edit_screens`, **se a resposta
vier rápida com `DomOperationEvent`, trate como NÃO APLICADO** e re-emita a chamada pedindo
explicitamente a reescrita do arquivo. Foi o que funcionou: a segunda chamada carregava
*"Uma tentativa anterior desta MESMA correcao relatou tres operacoes de DOM e o arquivo da tela
permaneceu BYTE-IDENTICO … REESCREVA O ARQUIVO DA TELA por completo, em vez de emitir operacoes
pontuais de DOM"* — e ela regenerou e persistiu.
⚠️ **`[NÃO SEI]` se foi ESSA frase que mudou o modo** ou se o modo é não-determinístico. **Duas
variáveis mudaram entre as chamadas** (o texto e a tentativa), então não atribuo causa. **O
experimento de uma variável está desenhado e não foi feito:** repetir uma edição trivial **sem** a
frase e ver se o modo A volta.

---

## 6. Jornada do usuário

```
1. abre S2 num símbolo          → escolhe janela e TF; o seletor passa por universe_at
2. lê preço + OI + CVD juntos   → cada painel declara sua própria identidade e idade
3. desconfia de um número       → vai à S3 e vê as linhas exatas que o produziram
4. volta e MARCA um swing       → a marcação amarra à série de preço usada, não ao símbolo
5. quer saber se um limiar vale → S4 mostra a distribuição ANTES de ele escolher
6. quer reproduzir o que viu    → bundle_hash + window + knowledge_time. A URL basta
7. algo parou de ser gravado    → é AVISADO fora do browser, e diagnostica na S1
```

O passo 7 tem um buraco declarado: **o canal de aviso não existe** (`Q3`).

---

## 7. Decisões de UX já tomadas — **imutáveis sem pedido explícito**

| # | decisão | origem |
|---|---|---|
| D1 | **`AO VIVO` × `COMO EM T` são modos de primeira classe**, no chrome, não em menu | `SPEC-001` §6.1 |
| D2 | voltar de `COMO EM T` para `AGORA` **tem sintoma visível** — sem sintoma, **reprova** | D5.4, teste negativo |
| D3 | idade **só na borda direita do tempo**; gráfico de 3 dias tem **zero** carimbos de idade | `ADR-005` |
| D4 | a idade carimba o **FECHO** da janela, nunca o rótulo cru da fonte | D5.1 — **três dos quatro desenhos de UX erraram isto** |
| D5 | ausência de OI aparece com **linha-guia apontando para trás** até a marca real | D5.2 |
| D6 | `FLOW` ausente é **`—`**, nunca interpolado | D5.3 |
| D7 | o **bundle é a URL**; gerenciador de presets é produto prematuro | `SPEC-001` §7 |
| D8 | **zero seleção é informação** — nenhum nudge para mais disparos | `SPEC-001` §6.3 |
| D9 | marcação amarra à `price_source` usada; reabrir sob outra série **não a reexibe como se fosse a mesma** | D5.5 |
| D10 | **atribuição da TradingView na primeira tela**, não na última | `CA-F1-15` |
| **D11** | **direção de preço segue a convenção ocidental (verde/vermelho da TradingView)** e vive **só em `fill`** | [`ADR-010`](../adr/ADR-010-governanca-de-cor-por-tipo-de-marca.md) D-1 — declaração do owner + `validate_palette.js` (**18,0** PASS sob min3) |
| **D12** | **vazado = `close > open`, cheio = `close < open`, cruz = `close == open` (não afirma).** Redundância de forma **obrigatória**, e o **terceiro estado não é opcional** | `ADR-010` D-2 · §0.3 (cinza **1,09**) · §1.9 (o doji) |
| **D13** | **integridade do dado é VIOLETA** — `#581c87` / `#e0aaff` — no eixo do cone S | §1.4 · §1.4-ter — âmbar rejeitado por medição; azul rejeitado por **0,3** contra violeta; **magenta saturado rejeitado por 12,2** contra o vermelho de baixa |
| **D14** | **o numeral nunca é tingido por direção nem por integridade.** Um único eixo de tinta: procedência, sem hue | §1.5 — `#089981` dá **3,57** contra branco e **3,13** contra a listra: legal p/ forma, **ilegal p/ texto** nos dois casos |
| **D15** | **ação e procedência não consomem hue.** Ambas no canal de luminância | §1.1 — orçamento de hue tem 3 vagas e 3 ocupantes |
| **D16** | **o veredito de dicromacia é `min(protan, deutan, TRITAN)`**, sob Brettel 1997 com planos derivados em execução | §1.4-bis — Viénot 1999 **superestima tritan** e teria aprovado o par que reprova (42,6 contra 14,7) |
| **D17** | **severidade operacional não tem token de cor.** `coletor PAROU` é palavra + glifo + posição + contagem | §9 item 5 — e é a **restauração** de um escopo que a 2ª revisão encolheu |
| **D18** | **o anel de foco é deslocado** (`outline-offset > 0`); o vão é cor de superfície | §1.8 — `--foco` é **byte-idêntico** ao token que encosta ⇒ **1,00** sem o vão |
| **D19** | **toda cor do plot chega como argumento**, nunca lida de CSS dentro do canvas | §8 — `forced-colors` não afeta canvas ⇒ híbrido descasado. Gancho: `FR-1` (`ADR-003:36`) |

---

## 8. Pendências e dúvidas abertas

**São 14 perguntas do owner em aberto.** As que tocam tela:

| # | pergunta | efeito no design |
|---|---|---|
| `Q10` | qual é a "primeira tela": verificação ou operação? | decide se S2-mínima ou outra abre o app |
| `Q11` | — | fase `08` |
| `Q13` | esquema de cor | **RESPONDIDO pelo owner em 2026-08-25** (verde/vermelho, convenção ocidental); formalizado em [`ADR-010`](../adr/ADR-010-governanca-de-cor-por-tipo-de-marca.md). Continua não gateando, mas o motivo mudou: **não** porque a troca é trivial — são **25 tokens, 4 com hue, 361 medições** — e sim porque ela é **mecânica e verificável por comando** |
| **novo** | **o owner usa Windows com modo de alto contraste?** | decide se o híbrido descasado do `<canvas>` (§8 do `DESIGN_SYSTEM`) é **defeito ativo** ou **dívida futura**. **Pergunta de uma linha, `[NÃO SEI]`** |
| **novo** | **`#e0aaff` lê como violeta ou como rosa?** | é o único resíduo não-aritmético da troca de `--dado-quebrado-ink`. Matiz e ΔE não decidem nomeação de cor |
| `Q16` | — | **gate da fase `05`** |
| `Q3` | canal de alarme fora do browser | o passo 7 da jornada não fecha sem ela |
| `Q20` | SMC × pivôs+Fibonacci | decide o que a **fase seguinte** detecta; aqui só `swing_point` |

### 8.1 O que a 4ª revisão RESOLVEU, e o que ela ABRIU

| item | estado |
|---|---|
| ~~região do observador~~ | **RESOLVIDA para o host local: `GRU1` (São Paulo).** Medida sem SSH, por `x-amz-cf-pop`. Ver §3. **Não transporta** para a VPS futura |
| ~~VPS exposta / auth como superfície~~ | **ADIADA por declaração do owner.** Roda local; **não se desenha login**. `principal_id` continua dimensão. Ver §3 |
| ~~"Telas no Stitch: 0"~~ | **CORRIGIDO com tarja.** Havia 1, e ela materializava a paleta revogada |
| ~~**`apply_design_system` promove o tema a ativo?**~~ | **DESBLOQUEADA, e não por resposta: por irrelevância.** `[MEDIDO 5ª rev.]` A `Rev. A` foi gerada a partir de `0334…` **sem nenhum `apply`** ⇒ `edit_screens` já carrega o tema. `[NÃO SEI]` o que `apply` faz, e **deixou de bloquear** |
| ~~**`MONOCHROME` + overrides starva o azul derivado?**~~ | **RESPONDIDA, e o mecanismo não é o `colorVariant`.** `[MEDIDO 5ª rev.]` A starvation **funciona quando o slot é sobrescrito com valor acromático** (`95d1…` v2: `tertiary #bec7d2`, C* **6,61**) e **falha quando é deixado à derivação** (`0334…`: `tertiary #d9c3ae` bege, C* **14,09**). O `colorVariant` de `95d1…` v2 é **`FIDELITY`, não `MONOCHROME`** — e a starvation funcionou de todo modo. Ver §5.2 |
| ~~**a edição consegue ACRESCENTAR (`idade`, losango)?**~~ | **RESPONDIDA: SIM, e num único passe.** `[MEDIDO 5ª rev.]` `Rev. A` trouxe `idade 30h18m`, o **losango vazado** (`rotate-45`, só borda) e a palavra `QUARENTENA` — as três inclusões **juntas**. Era o falsificador da decisão de editar, e ele **não se realizou** |
| ~~**o `designMd` de 12,3 KB cabe no contexto do gerador?**~~ | **CONSISTENTE COM "sim", n=1.** O prompt de ≈29 KB completou e a tela obedeceu inclusive o `Fora de escopo` (zero login, zero sino). **Não é prova:** uma execução bem-sucedida não estabelece um limite, só não o exibe |
| **novo — `roundness` é obrigatório e não tem valor 0px** | ⛔ **MEDIDO, e é `BLOCKER` de ferramenta.** Duas chamadas idênticas exceto por esse campo: sem ele, `invalid argument`. ⇒ **consertar cor via `update_design_system` custa a forma.** Ver §5.2 |
| **novo — a escada de `error` é suprimível?** | **NÃO pelo esquema** — `error`/`#ffb4ab` existe nos dois assets derivados e no `designTheme`, sem campo para omitir. **Mas a prosa do `designMd` derrotou o token:** `text-error` aplicado **2 → 0**. ⇒ verificar **uso**, nunca presença |
| **novo — de onde veio `assets/0334…`?** | ⛔ **`[NÃO SEI]`, e é a pendência aberta mais incômoda,** porque **é ele que governou a geração**. Nenhuma chamada registrada no §8.2 o explica, e o mapeamento de slot dele é um terceiro, diferente do que foi enviado |
| **novo — as três superfícies são expressáveis no tema?** | **NÃO.** Os assets derivam escada de ~7 superfícies e **todo `background` fica a 1,02–1,04 de `#131722`** (`95d1…` 1,036 · `0334…` 1,038) `[MEDIDO]`. Uma superfície a 1,008 da correta ainda está errada — §9 item 16(h) **⇒ o item 16(h) acusa o TEMA, não só o gerador** |

**Não medido e é o maior risco técnico:** o eixo do Lightweight Charts aguenta **288 pontos + 1.440
candles** no mesmo eixo? Tolerância de **0,5 px** entre coordenada X e `event_time` original.

---

## 8.2 Registro da iteração de 2026-08-25 (4ª revisão) — o que foi enviado ao Stitch

| ação | resultado medido |
|---|---|
| `get_project` | tema ativo = `Quant-Precision Core` **revogado** · `screenInstances` = **1 tela + 1 DESIGN_SYSTEM_INSTANCE** |
| `get_screen` + download do HTML | **22.612 bytes**. Base de toda a medição de §4.1 |
| `list_screens` | devolveu a tela **normalmente** ⇒ o `{}` da 3ª revisão era **transitório** |
| `node scripts/validate_palette.js` | **exit 0 · 361 medições** — os tokens em vigor reproduzem |
| medição do drift (estimador **extraído** de `validate_palette.js` linhas 1–185, não reimplementado) | os números de §4.1.2 |
| discovery `@shadcn` | registries **vazio** ⇒ nada instalável. Reconfirmado |
| `update_design_system` | ⛔ **200 mas NÃO persistiu** — escreveu numa `sessions/...`. Ver §5.1 |
| `create_design_system` (global, sem `projectId`) | ⛔ `invalid argument` ⇒ **modo global não é suportado** neste projeto |
| `create_design_system` (com `projectId`) | ✅ `assets/483322114126186925` · `version: 1` |
| `edit_screens` (`GEMINI_3_1_PRO`, `DESKTOP`) | **timeout** — esperado, **não repetido** (`R1`/`R2` respeitadas) |

**O prompt enviado:** §9 **verbatim** (229 linhas, extraídas por `awk` do próprio arquivo, não
transcritas de memória) + **13 preservações explícitas** + **13 correções nomeadas com o hex
errado e o hex certo em cada uma**.

**Por que as preservações vão no prompt, e isto é o aprendizado de método desta rodada:** um
prompt que só lista o que está errado convida o gerador a refazer a tela. A tela acertava 13
coisas, e **algumas delas são difíceis de re-derivar** (`D5.2`, `price_use`, a expressão do
`DERIVADO`). Nomear o acerto é tão necessário quanto nomear o erro — **e nenhuma rodada anterior
fez isso**, porque nenhuma rodada anterior sabia que existia uma tela para preservar.

### ⛔ A EDIÇÃO MATERIALIZOU. Esta seção dizia o contrário, e o contrário era falso

> ### ⛔ TARJA de 2026-08-25 (5ª revisão) — **`edit_screens` PRODUZIU UMA TELA**
>
> ~~**A EDIÇÃO NÃO MATERIALIZOU.** `edit_screens` deu timeout e não produziu efeito observável.
> `htmlCode` em todas as 9 leituras: `files/9933b6…` INALTERADO. Telas no projeto: 1 (nenhuma tela
> nova foi criada). A tela no Stitch continua sendo exatamente a que §4.1.2 descreve — com os 13
> desvios. `[NÃO SEI]` a causa, e sobram duas hipóteses: (1) o prompt de ≈29 KB excedeu um limite
> de entrada — reenviar em DUAS PASSADAS; (2) falha transitória do serviço.~~
>
> `[MEDIDO: list_screens + get_project + download do HTML, 2026-08-25 5ª revisão]`
>
> ```
> projects/9264019151773162472/screens/f233baf87e12403797d1c867f69ab53d
>     "S2 Símbolo - Operacional Core"          files/9933b6…   22.612 bytes   INALTERADO
> projects/9264019151773162472/screens/7c81c2672b944f8a88c06ae436b19274
>     "S2 Símbolo - Operacional Core Rev. A"   files/3e5b80…   22.766 bytes   <== NOVA
> ```
>
> **`edit_screens` NÃO edita no lugar: ele BIFURCA**, criando `"<título> Rev. A"` e deixando o
> original byte-idêntico. ⇒ as 9 leituras de `get_screen` e as 3 de `list_screens` estavam no
> **recurso certo para a pergunta errada**: provaram que o original não mudou — verdadeiro e
> irrelevante. Ver §5.3.
>
> **O argumento do "10× o horizonte" estava aritmeticamente certo e logicamente inválido:** ele
> media o relógio correto contra o **objeto errado**. Nenhuma quantidade de espera faz um recurso
> não-modificado revelar uma modificação que aconteceu **em outro recurso**.
>
> ⚠️ **E a HIPÓTESE 1 CAIU.** O prompt de ≈29 KB **completou e produziu tela**. ⇒ **não há
> problema de tamanho a testar, e o plano de DUAS PASSADAS não tem mais objeto.** Ele foi
> projetado para falsificar uma hipótese que a medição já falsificou.
>
> ⚠️ **Correção de FORMA, e é o mesmo defeito que o `DESIGN_SYSTEM.md` §0.2 tarjou em si mesmo:**
> a frase *"se uma passada de ~15 KB completar, a hipótese está confirmada"* comparava o resultado
> **contra o piso** e não **contra a alternativa**. Uma chamada menor completando (n=1) é
> **igualmente consistente** com "transitório". O predicado correto nunca é *"confirmada"* — é
> **"é consistente com"**, e só um desenho de **duas chamadas com uma variável cada** discrimina.
> **Piso e alternativa respondem perguntas diferentes, e a 4ª revisão trocou uma pela outra pela
> segunda vez no mesmo dia.**

### O QUE A `Rev. A` DE FATO ENTREGOU — a tabela de aceitação, executada `[MEDIDO]`

**11 dos 13 desvios corrigidos · 1 parcial · 1 falso positivo de grep · ZERO regressão nos 4
testes negativos · e um ganho que não estava na lista.**

| desvio | antes (`f233…`) | `Rev. A` (`7c81…`) | veredito |
|---|---|---|---|
| **(a)** direção azul/laranja | `2a78d6`×1 `eb6834`×1 | **0 / 0**; `089981`×6 `f23645`×5 | ✅ |
| **(b)** candle como bloco sólido | `bg-transparent`×0 | `bg-transparent`×**4**, `rotate-45`×1 | ✅ ver ablação abaixo |
| **(c)** completude tingida de erro | `text-error`×**2** | `text-error`×**0**; `1 lacuna` em `text-[#8b949e]` | ✅ |
| **(d)** selo com 3 de 4 campos | `idade`×0 | **`idade 30h18m`**, 1 ocorrência, na borda direita | ✅ |
| **(e)** canal de integridade ausente | `e0aaff`×0 | `e0aaff`×**4** + losango vazado + `QUARENTENA` | ✅ **os três canais juntos** |
| **(f)** procedência como chip colorido | tints `93c5fd/c4b5fd/99f6e4`: **0** nos dois | `OBSERVADO`×2 `DERIVADO`×2, sem tint | ✅ com ressalva¹ |
| **(g)** ação em azul | `a8c8ff`×**7** `4b91f1`×1 | **0 / 0** | ✅ |
| **(h)** superfícies inventadas | `121315`×3 `16181d`×9 `0d0e10`×1 `2a2e39`×9 | **0/0/0/0**; `131722`×6 `0d1017`×11 `222634`×58 | ✅ |
| **(i)** `backdrop-blur` | ×**4** | ×**0** | ✅ |
| **(j)** microcopy em inglês | `AS AT T`×1 `LIVE`×1 | **0/0**; `AO VIVO`×1 `COMO EM T`×1 — **mas `Documentation`×1 e `API Status`×1 SOBREVIVERAM** | ⚠️ **PARCIAL** |
| **(k)** sino de notificação | `notifications`×**2** | ×**0** | ✅ |
| **(l)** painéis com `overflow-y-auto` | ×1 | ×**0** | ✅ |
| **(m)** acentuação transliterada | `Graficos` `ancora` `preco`×3 | `Gráficos` `âncora` `preço`; os 2 `preco` restantes são **`rel="preconnect"`** | ✅ **falso positivo do grep** |
| **GANHO** não listado | `tabular-nums`×**0** | ×**1**, como regra CSS global sobre `.font-data-*` | ✅ fecha o §9 item 13, que a tela original violava |
| `P1` `klines_last` · `structure_detection` | 1 · 1 | **1 · 1** | ✅ preservado |
| `P2` `stroke-dasharray` | 1 | **1** | ✅ preservado |
| `P3` `taker_buy` | 1 | **1** | ✅ preservado |
| `P4` `MAINNET` presente · `PROD` ausente | 1 · 0 | **1 · 0** | ✅ preservado |

¹ **Ressalva honesta:** os três tints que §4.1.2 (f) acusa **não existem no HTML original** — são
0 nos dois arquivos. Eles estão na **prosa do `designMd` revogado**, não na tela. ⇒ `[NÃO SEI]`
**por qual mecanismo** o chip de procedência era "colorido" na tela original, e o desvio (f) pode
ser uma leitura do design system atribuída à tela. **Fica marcado, não corrigido em silêncio.**

#### A ABLAÇÃO DE CINZA — o teste que não pode ser fingido, e a `Rev. A` passa

```
sed 's/089981/808080/g; s/f23645/808080/g'   e reclassificar
        partição de corpos que usam hue de direção:  CHEIO 5 · VAZADO 4 · AMBÍGUO 0
        marcador de CRUZ/doji no markup:             1
        'bloco sólido pintado' (bg E border do mesmo direcional):  0
        classes distintas ANTES da ablação:  3
        classes distintas DEPOIS da ablação: 3     => PASSA
```

E a forma é literal no markup, não inferida:

```html
<!-- Vazado (Up)   -->  border border-[#089981] bg-transparent
<!-- Cheio (Down)  -->  bg-[#f23645]
<!-- Doji (Cross)  -->  bg-[#8b949e]        <= NEUTRO, sem hue de direção
```

⇒ **o doji veio em tinta neutra**, que é **melhor** do que o §9 item 2 exigia (*"o hue do corpo de
1 px de um doji não carrega informação nenhuma"*). E a redundância vazado/cheio foi carregada
também para o **histograma de CVD delta**, que ninguém pediu.

### ⛔ A TABELA DE VERIFICAÇÃO ANTERIOR TINHA TRÊS CHEQUES QUE PRODUZEM VEREDITO FALSO — e agora está MEDIDO

> ~~| 2 | `grep -c '089981.*f23645\|direcao-alta-fill'` | reprova se **== 0** |~~
> ~~| 5 | `grep -ci 'text-error\|ffb4ab'` | reprova se **> 0** |~~
> ~~| 7 | `grep -c 'e0aaff'` **e** existe glifo de losango | reprova se **== 0** |~~
>
> **Executados contra a `Rev. A`, que é conformante nos três pontos:**
>
> | # | resultado | por que é veredito falso |
> |---|---|---|
> | **#2** | **0** ⇒ *reprovaria* | é regex de **mesma linha**. Os dois hexes existem (6 e 5 usos) e nunca aparecem na mesma linha. ⇒ **FALSO FAIL numa edição conformante** |
> | **#5** | **1 nas DUAS telas** ⇒ *reprovaria as duas* | `#ffb4ab` está no `tailwind.config` de ambas. O que mudou foi `text-error` **APLICADO: 2 → 0**. ⇒ **o cheque devolve o MESMO número para a tela defeituosa e para a corrigida. É cego exatamente à mudança que existe para detectar** |
> | **#7** | **4** ⇒ passaria | mas 1 das 4 é a **declaração do token** no `tailwind.config`. Um tema que declarasse `e0aaff` sem nenhum uso **passaria**. E o cheque **nomeia o hex, não o papel** — sob `95d1…` v2 o tema pinta `#e5b5ff`, que mede **2,2** contra `#e0aaff` (⇒ **é a mesma cor**) e o cheque **reprovaria** |
>
> **O padrão, e ele é o achado de método:** das 13 verificações, **9 eram `grep` negativo** ("este
> literal não deve existir") e são **robustas**; as **4 que exigiam estrutura POSITIVA** (#3, #4,
> #6, #7) eram **existenciais e sem comando** — e são exatamente as 4 que cobrem as **duas
> inclusões** (idade, losango) e os **dois canais de `SC 1.4.1`** (forma da vela, forma do doji).
> **A tabela era forte onde o risco era baixo e fraca onde o risco era alto.**

**A regra de construção que sai disto, e ela vale para toda verificação futura:**

| princípio | por quê |
|---|---|
| **Medir USO APLICADO, nunca presença do literal** | o esquema do tema **impõe** `error`/`#ffb4ab` e não há campo para omiti-lo (§5.2). Presença do token é munição; **o defeito é o uso** |
| **Nomear o PAPEL, não o hex** | `#e0aaff` e `#e5b5ff` medem 2,2 ⇒ **são a mesma cor**, e um cheque por hex reprova a cor certa vinda por derivação |
| **Verificação estrutural é RELACIONAL e EXAUSTIVA, nunca existencial** | *"existe corpo vazado"* passa com **1 vazado entre 199 sólidos**. O correto é **particionar TODO corpo** em CHEIO/VAZADO/CRUZ, reprovar se qualquer classe tem count 0, reprovar corpo cujo `fill` **e** `stroke` são o mesmo direcional, e reprovar se a partição **não cobre o total** |
| **A ablação de cinza carrega o peso** | uma linha de `sed`, e **não pode ser fingida**, porque testa a propriedade que o sistema realmente alega: que a forma sobrevive sem cor |
| **`idade` é CONTAGEM, não presença** | *"a string aparece"* passa com rótulo de coluna sem valor **e** com carimbo em **toda** barra — que viola `D3`/§9 item 10 (*"um gráfico de 3 dias tem ZERO carimbos"*). O correto é **exatamente um na borda direita do tempo, zero em qualquer outro ponto**. A `Rev. A` mede **1** ✅ |
| **A cruz do doji tem de separar CÓDIGO de FIXTURE** | *"existe a cruz"* testa o **fixture**, não o design: a cruz só existe se o dado tiver `open == close`, e §1.9 diz que o predicado real é `\|close − open\| < tick_size` **datado**, com a fração `[NÃO SEI]`. Separe: **4a** existe um **terceiro ramo** (verificável sem dado) · **4b** contar no fixture, e se 0 declarar **`[NÃO APLICÁVEL NESTE FIXTURE]`** em vez de reprovar por ausência de dado · **4c** cada barra dessas é CRUZ · **4d** **reprovar corpo ≥2 px numa barra doji** (é a altura mínima proibida entrando por trás) |
| **Os testes negativos precisam ser DERIVADOS da lista de acertos, não escolhidos** | `P1` nomeou `klines_last`/`structure_detection`, e `price_use`/`price_source` medem **0 nas DUAS telas** ⇒ `P1` **nunca poderia** ter detectado uma regressão de `price_use`. §4.1.1 lista `price_use` entre os acertos e o literal **não está no HTML**: `[NÃO SEI]` se §4.1.1 está errado ou se o acerto era expresso em prosa |

### A VERIFICAÇÃO AGORA É UM COMANDO, não uma tabela em prosa

`scripts/verify_screen.py <arquivo.html>` · exit **0** passa, **1** reprova, `[NÃO APLICÁVEL]`
**não** reprova. **Prosa não é verificação** — a tabela anterior tinha três cheques que só se
descobriu estarem errados quando alguém os executou à mão, 24h depois.

Ele implementa os três princípios como código: **uso aplicado** (separa o `tailwind.config` do
resto e mede fora dele) · **partição relacional e exaustiva** dos corpos (`CHEIO`/`VAZADO`/
`AMBÍGUO`/`PINTADO`, e `AMBÍGUO > 0` reprova) · **ablação de cinza** · **`idade` por contagem** ·
**doji em 4 sub-cheques** (`a` terceiro ramo no código, verificável sem dado · `b` fixture, com
`[NÃO APLICÁVEL]` em vez de reprovar por ausência de dado · `c` classificação · `d` corpo ≥2 px
reprova) · **integridade por PAPEL**, aceitando qualquer violeta derivado e reprovando-o por
**não ser** o governado, além de reprovar **violeta sem glifo**, que é a ordem invertida dos canais.

`[MEDIDO — o discriminante que a tabela antiga não tinha:]`

```
python3 scripts/verify_screen.py orig.html   =>  REPROVADO, 22 reprovações   (exit 1)
python3 scripts/verify_screen.py revA.html   =>  REPROVADO,  2 reprovações   (exit 1)
                                                 e as 2 são 'Documentation' e 'API Status'
```

⇒ **22 contra 2.** A tabela antiga devolvia números **indistinguíveis** para estes dois arquivos
em três dos seus cheques. **Um gate que não separa a tela defeituosa da corrigida não é gate.**

⚠️ **`price_use` / `price_source` entram como AVISO, não como reprovação, e isto é deliberado:**
eles medem **0 nas duas telas**. Reprovar por eles seria reprovar por uma ausência que **nunca
esteve presente** — e reprovar por um critério que o artefato de referência também viola é a
receita de um gate que se ignora. Fica `[NÃO SEI]` se §4.1.1 erra ao listá-los entre os acertos.

### ⛔ O CORTE DAS DUAS PASSADAS ERA ERRADO EM ESPÉCIE, e vale registrar mesmo tendo perdido o objeto

O plano recortava **passada 1 = cor, superfície e forma** · **passada 2 = selo, integridade e
microcopy**. **Esse corte separa a COR da integridade do seu GLIFO e da sua PALAVRA** — e o §9
item 4 diz que a cor é o **terceiro** canal, **nunca o primeiro**. O estado intermediário
(violeta na tela, sem losango, sem `QUARENTENA`) **é literalmente a violação que a regra existe
para impedir: o corte FABRICA o defeito.** E o desvio (e) não é corrigível na passada 1, que não
tem glifo nem palavra.

Se algum dia houver motivo para partir uma edição, **o corte é SUBSTITUIÇÃO × INCLUSÃO**, não
cor × selo: substituir valores errados é reversível e local; **acrescentar estrutura que não
existe** é o que pode falhar. A costura certa já estava identificada em §4.1.3 e o corte foi
feito em outro lugar.

⚠️ **E a `Rev. A` fechou a questão empiricamente: `#e0aaff` + losango vazado + `QUARENTENA`
chegaram JUNTOS, numa ÚNICA passada de ≈29 KB.** A costura nunca precisou ser cortada.

### O que a `Rev. A` NÃO resolveu — a lista curta e completa

1. **`Documentation` + `API Status` no rodapé** (desvio **j**, parcial). É o **único** desvio de
   conteúdo remanescente. O rodapé tem a atribuição correta e com link
   (`Gráficos por Lightweight Charts — TradingView`), e **dois links inventados ao lado dela** —
   contra o `designMd`, que diz *"Não invente outros links de rodapé"*.
2. **`#d9c3ae` (bege) e a escada de `error` declarados no `tailwind.config`** e **não aplicados**
   a elemento nenhum. Vêm de `0334…`. Munição, não defeito — mas é munição a remover na origem
   (§5.2), **e a remoção na origem custa `ROUND_FOUR`**, o que a torna um `BLOCKER` de ferramenta.
3. **`borderRadius.DEFAULT: 0.25rem`** declarado e não aplicado a container.

> ### ⛔ TARJA de 2026-08-28 (6ª revisão): os itens 1 e 3 desta lista mudaram de estado
>
> **Item 1 (`Documentation` + `API Status`) está FECHADO** — e não na `Rev. A`: numa tela nova,
> `Rev. B` (`8174…`), porque `edit_screens` bifurcou (§5.3-bis).
> **Item 3 (`borderRadius.DEFAULT: 0.25rem` declarado e não aplicado) continua** — declarado no
> `tailwind.config` da `Rev. B` e aplicado a container nenhum. Munição, não defeito.
> **Item 2 (bege + escada de `error`) continua, e agora está EXPLICADO e fechado como limitação de
> ferramenta**, não como pendência de design — ver §5.2.
>
> ~~⇒ **`Rev. A` NÃO é um redesenho e NÃO é a `S2` do canvas.** A `S2` original (`f233…`) segue
> intacta, com os 13 desvios. **Nada foi decidido sobre promover a `Rev. A` — é `R7`, é BLOCKER, e
> escala ao owner.**~~
>
> **Escalou, e o owner liberou** (*"ok, pode seguir com as sugestões, considere aprovado"*,
> 2026-08-28). A `S2` do canvas passa a ser `8174…` — **`Rev. A` também não é a `S2`**, e por um
> motivo que não estava previsto aqui: ela foi **superada**, não promovida. Ver §4.1.0 e §4.1.4.

⇒ **`Rev. A` NÃO é um redesenho.** A `S2` original (`f233…`) segue intacta, com os 13 desvios, e a
`Rev. A` segue intacta com 4 reprovações. **As duas são histórico inapagável** (§4.1.4).

---

## 8.3 Registro da 6ª rodada (2026-08-28) — o rodapé, o idioma e a promoção

**Autorização:** o owner liberou `R7` — *"ok, pode seguir com as sugestões, considere aprovado"*
`[PREMISSA-OWNER: 2026-08-28, citação literal]`.

### Os critérios foram PRÉ-REGISTRADOS, antes da chamada

Escritos em arquivo antes de tocar o Stitch, para que "passou" não fosse decidido depois de ver o
resultado:

| # | critério | resultado |
|---|---|---|
| `C1` | `verify_screen.py` na saída ⇒ exit 0, **zero** reprovações | ✅ **0 reprovações, exit 0** |
| `C2` | reprovações da saída ⊆ {`Documentation`, `API Status`} ⇒ **qualquer reprovação NOVA é regressão** | ✅ conjunto vazio |
| `C3` | preservações intactas: `klines_last` · `structure_detection` · `taker_buy` · `stroke-dasharray` · `MAINNET` · `P5` | ✅ nenhuma virou reprovação |
| `C4` | `E2` CHEIO>0, VAZADO>0, AMBÍGUO==0, PINTADO==0 · `E4` ≥3 · `E5` glifo≥1, palavra≥1, violeta governado · `E6` idade==1 | ✅ 5 · 4 · 0 · 0 · 3 · 1 · 1 · 1 |
| `C5` | **observação, não gate:** `lang`/`<title>` são controláveis pelo prompt? | ✅ **SÃO** ⇒ promovidos a reprovação |
| `C6` | bifurcação esperada ⇒ ler `screenInstances`, não reler o id antigo | ✅ **bifurcou**; id novo detectado sem reler o antigo esperando mudança |

### O que foi pedido, e é UMA classe de desvio, não três

O desvio **10** do §4.1.2 (*"microcopy em inglês"*) nomeia cinco coisas. A `Rev. A` fechou duas.
As três restantes eram `Documentation`, `API Status` e `lang="en"` — **e o `<title>` em inglês, que
o desvio 10 não nomeava porque ninguém tinha olhado a aba do navegador.** Pedi as quatro numa
chamada, e a justificativa de juntar é que **são o mesmo desvio**, não uma lista de tarefas:

- `lang="en"` num documento cujo microcopy é todo pt-BR é **falha de WCAG 3.1.1 (nível A)** — o
  leitor de tela pronuncia português com fonemas de inglês. Isto está **dentro** da autonomia
  delegada de UI/UX, e é acessibilidade, não gosto.
- **Custo declarado:** juntar aumentou o diff. **Falsificador nomeado antes:** se a saída
  regredisse em qualquer preservação, o escopo extra seria o primeiro suspeito e o remédio seria
  re-rodar só o rodapé. **Não regrediu.**

### O resultado, com o diff medido

```
diff normalizado  Rev. A -> Rev. B   =  4 linhas, e são exatamente as 4 pedidas
   <html … lang="en">                 ->  lang="pt-BR"
   <title>… - Symbol (BTCUSDT)</title> ->  <title>cripto-strategy — Símbolo (BTCUSDT)</title>
   -<span …>Documentation</span>
   -<span …>API Status</span>
```

⚠️ **E isto é o achado que eu não esperava: `edit_screens` REGENEROU o arquivo inteiro e o diff
ficou em 4 linhas.** A hipótese natural — *"regeneração re-rola a tela e arrasta drift"* — **é
falsa neste caso**, e o que a torna falsa é falsificável: o prompt levava **15 preservações
nomeadas** que são exatamente o que `verify_screen.py` gateia. ⇒ **a lista de preservação não é
burocracia: é o que faz uma regeneração se comportar como um patch.**

### O gate, nos três artefatos, com o comando

```
python3 scripts/verify_screen.py orig.html   =>  REPROVADO  (24 reprovacoes)   f233…
python3 scripts/verify_screen.py revA.html   =>  REPROVADO  ( 4 reprovacoes)   7c81…
python3 scripts/verify_screen.py revB.html   =>  APROVADO   ( 0 reprovacoes)   8174…  <== CANONICA
```

⚠️ **Os números 22 e 2 da 5ª revisão viraram 24 e 4, e não é regressão:** o verificador ganhou
dois cheques (`N12-lang`, `N13-title`). **A extensão foi medida contra a linha de base antes de
ser usada como gate** — `orig` e `revA` receberam **os mesmos 3 avisos**, ou seja, a extensão
**não move o discriminante**; ela só passou a ver um defeito que os dois já tinham.

### Duas correções ao próprio verificador, e uma delas era um cheque CEGO

| cheque | o que estava errado | agora |
|---|---|---|
| `price_use` / `price_source` | procurava os **nomes de campo do `ADR-007`**, que são identificadores de esquema e **nunca foram copy de interface**. Mediam 0 nas duas telas porque **nunca deveriam medir 1** | virou `P5`: mede os literais que **de fato** carregam os dois fatos |
| o `[NÃO SEI]` que o acompanhava | dizia *"P1 nunca poderá detectar regressão dele"* e *"`[NÃO SEI]` se §4.1.1 erra"*. **As duas falsas** | ver abaixo |

**§4.1.1 NÃO erra, e o acerto não é fantasma** `[MEDIDO: cabeçalho do painel de preço, nas três telas]`:

```
candles 15m · BTCUSDT · klines_last · fonte bn-dump · uso: structure_detection · OBSERVADO
                        ^^^^^^^^^^^                   ^^^^^^^^^^^^^^^^^^^^^^^^
                        a FONTE do preco              o USO do preco
```

**Os dois fatos estão na tela.** E `P1` **sempre** pôde detectar regressão dos dois, porque já
checava `klines_last` e `structure_detection`. ⇒ **era bug de verificador, não acerto fantasma** —
das duas possibilidades acionáveis, a que se realizou foi a primeira.

⚠️ **Mas apareceu uma terceira coisa, que nenhuma das duas hipóteses previa, e ela é de design:**
o **uso** tem rótulo (`uso:`) e a **fonte não tem** — `klines_last` entra cru numa sequência
separada por `·`, ao lado de `BTCUSDT` e de `fonte bn-dump`. **Quem não sabe que `klines_last` é um
endpoint de kline não lê aquele token como "fonte do preço"** — e pior, o vizinho `fonte bn-dump`
usa a palavra "fonte" para outra coisa. Entrou como **aviso `P5b`**, não reprovação: não houve
regressão, e consertar é mudança de copy, que é variável nova. **Candidata a rodada futura, sob
gate.**

### O item 16 do §9 — a condição que destrava a deduplicação

O deferimento da dedup está mantido, e o owner concordou. **A condição que o destrava, registrada
aqui para não se perder:**

> **O experimento de *tamanho × posição* PERDEU O OBJETO.** Ele exigia duas chamadas de uma
> variável cada: (A) §9 **sem** o item 16 ⇒ isola tamanho; (B) §9 **com** o item 16 no topo ⇒
> isola posição. **A hipótese de limite de tamanho está morta em n=3:** prompts de ≈29 KB (`Rev. A`)
> e **24,4 KB** (`Rev. B`, medido: `wc -c` do arquivo montado) completaram e produziram tela, e a
> `Rev. B` obedeceu **15 de 15** preservações.
> ⇒ **a dedup do item 16 passou a ser mudança de UMA variável só** (comprimento), porque não há
> mais experimento de tamanho a preservar. **Ela está DESTRAVADA e não foi feita** — fica para
> quem mexer no §9 com o gate de `ux-ui-mastery` na mesa, porque §9 é o artefato mais copiado
> deste repositório e encurtá-lo é `R8`, não prompt.

### O que continua divergente entre `docs/product/` e o Stitch

| # | divergência | quem consegue consertar |
|---|---|---|
| 1 | **§9 não prescreve `lang="pt-BR"` nem `<title>` em português.** Uma tela gerada **do zero** vai reincidir — foi assim que `f233…` e `Rev. A` nasceram com `lang="en"`. **PROPOSTA, não aplicada:** uma linha no item 16(j) e uma no item 11 | é edição do §9 ⇒ **proponho e aguardo**, não escrevo |
| 2 | `project.designTheme` continua com a paleta **integralmente revogada** (`#2a78d6`, `#eb6834`, `#a8c8ff`, `#121315`) `[MEDIDO: get_project, 2026-08-28]` | **nenhum tool escreve esse objeto.** Não bloqueia: a geração sai de `0334…` |
| 3 | `95d1…` v2 e `15706…` v2 seguem com `PUBLIC_SANS` e `ROUND_FOUR` | consertar custa a forma (§5.2) ⇒ **não se paga** |
| 4 | três telas no canvas, a defeituosa primeiro na ordem de leitura | **inexecutável** — não há `delete_screen` (§4.1.4) |
| 5 | `#d9c3ae` (bege), escada de `error` e `borderRadius.DEFAULT` **declarados e não aplicados** na `Rev. B` | munição, não defeito. Uso medido = 0 |
| 6 | **`flat no shadows` como classes literais** no `<footer>`, nas **três** telas (3 ocorrências cada) — palavras de prosa que vazaram para o atributo `class` | inertes (não existem no Tailwind). **Achado novo desta rodada**, herdado de `f233…`; candidato a limpeza, uma variável |

⚠️ **E uma divergência que não é do Stitch, é MINHA:** a definição do agente
[`ui-designer.md`](../../.claude/agents/ui-designer.md) ainda carrega, como "guarda de domínio",
que *"vermelho significa 'o dado quebrou', não 'o preço caiu'"*. **Essa regra foi REVOGADA pelo
owner na 2ª revisão de 2026-08-25** (§5) — hoje direção **é** verde/vermelho da TradingView e
integridade é violeta. **Um agente cuja guarda mais enfática está revogada é um risco ativo**: se
eu tivesse parafraseado a minha própria definição em vez de colar o §9 verbatim, teria reinjetado
a regra revogada no prompt. **`R3` (§9 verbatim) foi o que impediu.** ⇒ correção de
`.claude/agents/ui-designer.md` é **proposta**, e está fora do que o owner aprovou nesta rodada.

---

## 9. Prompt de continuidade

> **Cole isto no início de QUALQUER nova conversa do Stitch sobre este projeto.** Ele carrega o contexto,
> as decisões travadas e as guardas. Sem ele, o modelo renegocia o produto.
>
> **Reescrito em 2026-08-25 (3ª revisão do dia)** para fechar as 8 condições do gate `ux-ui-mastery`.
> **As correções das revisões 1 e 2 estão todas preservadas.** O que mudou nesta revisão:
>
> | item | mudança | condição |
> |---|---|---|
> | 1 | `3.13:1` era atribuído ao **branco**; é da **listra**. Contra branco são **3,57** | `C5` |
> | 2 | `VAZADO = ALTA` → `VAZADO = close > open`, e **terceiro estado: cruz/doji** | `C7`, `P2` |
> | 3 | violetas **trocados**: `#c084fc`→`#e0aaff`, `#6d28d9`→`#581c87`, por **tritanopia** | `C1` |
> | **5** | **RESTAURADO o escopo genérico.** Era *"alerta crítico fica FORA DO CANAL DE COR"* e a 2ª revisão o **estreitou** para integridade de dado — deixando a `S1` (*"o que parou"*) **sem regra** | `C4` |
> | 6 | `0.4` → **`0.3`** (azul × violeta em deutan) | `C6` |
> | 7 | **novo:** `--foco` é byte-idêntico ao token que encosta ⇒ `outline-offset` é requisito | `C2` |
> | 15 | **novo:** `forced-colors` afeta CSS e **não** afeta canvas ⇒ híbrido descasado | `C8` |
>
> ### 4ª revisão (2026-08-25) — `--sync` contra o Stitch real
>
> | item | mudança | motivo |
> |---|---|---|
> | **16** | **NOVO BLOCO: `DRIFT MEDIDO`** — os **13 erros que um gerador com este mesmo §9 já cometeu**, extraídos do HTML e medidos | o §9 era todo **prescritivo**; passa a ter uma seção **descritiva do erro observado**. Prescrição não impediu o drift; a lista do erro concreto é o canal que faltava |
> | FORA DE ESCOPO | **+ tela de login / auth / avatar** e **+ sino de notificação** | declaração do owner (roda local) e `Q3` (o canal de aviso não existe) |
>
> ⚠️ **O que esta revisão NÃO fez, e é deliberado:** não mexeu em nenhum dos 15 itens de
> governança de cor. O drift medido **não desmentiu nenhuma regra** — ele mostrou que as regras
> estavam certas e **não foram lidas como operacionais**. O remédio para uma regra correta que
> não pega não é reescrever a regra: é **nomear a saída errada que ela deveria ter barrado**.
>
> ⚠️ **E há um custo que declaro:** o §9 cresceu ~35 linhas, e ele já é o artefato mais copiado
> deste repositório. **`[NÃO MEDIDO]` se existe um comprimento a partir do qual acrescentar
> guarda passa a diluir as guardas que já existiam.** Se uma rodada futura mostrar o gerador
> obedecendo o item 16 e regredindo num item de 1 a 15, esse é o sintoma — e a resposta seria
> mover o item 16 para um anexo, não apagá-lo.
>
> ⚠️ **`C4` é a regressão que EU introduzi**, e vale registrar como ela aconteceu: a 2ª revisão
> reescreveu o item **melhor operacionalmente** (nomeou glifo, palavra e ordem dos canais) e **pior em
> escopo** — trocou "alerta crítico" por "integridade do dado". Sob o texto estreito, o gerador **não
> tinha regra** para `coletor PAROU`, e a saída provável era **barra vermelha preenchida**: satisfaz a
> letra do item 1 e **destrói a intenção**. Melhorar a redação de uma regra e encolher o seu domínio no
> mesmo movimento é um modo de falha silencioso, porque o diff parece um upgrade.
>
> ### 5ª revisão (2026-08-25) — POSIÇÃO, não conteúdo
>
> | item | mudança | motivo |
> |---|---|---|
> | **16** | **MOVIDO PARA O TOPO do prompt.** Conteúdo **inalterado**; delta de **+155 bytes** (só o cabeçalho de 2 linhas que explica a renumeração) | o bloco ocupava **~70% do caminho**: sem **primazia** e sem **recência** — as duas únicas posições de serial position que um prompt tem. O `LEMBRETE FINAL` é o slot de recência e já está ocupado; sobrava a primazia |
> | numeração | **o número 16 foi PRESERVADO**, apesar de agora vir antes do item 1 | `STITCH_CONTEXT.md` cita *"§9 item 16"* em vários lugares. Renumerar para "0" ou "A" quebraria **toda** citação existente, e este repositório já pagou o preço de uma divergência de terceiro lugar |
>
> ⚠️ **O remédio que a 4ª revisão pré-comprometeu ("mover o item 16 para um anexo") ia na DIREÇÃO
> ERRADA**, e vale registrar porque o raciocínio parecia certo: anexo é **menos** proeminente que
> 70% do caminho, não mais. O problema nunca foi "o bloco está muito presente" — era "o bloco está
> no único lugar em que ninguém lê com atenção".
>
> ⚠️ **DUPLICAÇÃO NOMEADA E NÃO RESOLVIDA, deliberadamente.** O item 16 reafirma, em registro
> negado, os itens **1, 2, 3, 4, 5, 6, 8, 9 e 15** — custo de comprimento sem ganho de canal. O
> conteúdo **unicamente** novo dele é o conjunto de **literais proibidos** (os hexes revogados, as
> superfícies inventadas, `backdrop-blur`, o microcopy em inglês, o sino, o `overflow`, a
> transliteração) e o **acerto a não regredir** (`MAINNET`).
>
> **Por que a deduplicação NÃO foi feita agora, e é uma tensão real entre duas condições do gate:**
> o desenho experimental que discrimina *tamanho* de *posição* exige **duas chamadas com uma
> variável cada** — (A) §9 **sem** o item 16, menor ⇒ isola tamanho; (B) §9 **com** o item 16 no
> topo, **tamanho idêntico** ⇒ isola posição. **Encurtar o item 16 agora mexeria nas duas
> variáveis ao mesmo tempo e anularia o experimento.** A variante (B) **é exatamente este §9**; a
> variante (A) se constrói **por deleção, no momento da chamada**, e não vive no arquivo.
>
> ⚠️ **E há um fato novo que rebaixa a urgência do experimento:** o prompt de ≈29 KB **completou e
> produziu tela** (`Rev. A`, §8.2). ⇒ **não existe hipótese de limite de tamanho a testar.** O
> experimento passa a medir uma pergunta legítima mas **não bloqueante**: *o item 16 no topo
> produz obediência melhor que no meio?* Isso se responde comparando saídas, não completude.
>
> ### 6ª revisão (2026-08-28) — o §9 NÃO MUDOU, e a dedup do item 16 está DESTRAVADA
>
> **Nenhuma linha deste prompt foi alterada nesta rodada.** Ele foi colado **verbatim** (`R3`) e a
> saída passou o gate com **0 reprovações** ⇒ não há evidência para mexer nele.
>
> **A condição que destrava a deduplicação do item 16 está em §8.3, e em resumo:** o experimento de
> *tamanho × posição* **perdeu o objeto** — a hipótese de limite de tamanho está morta em **n=3**
> (≈29 KB e **24,4 KB** completaram e produziram tela), então encurtar o item 16 deixou de mexer em
> duas variáveis e passou a mexer em **uma**. ⇒ **destravado, e deliberadamente não feito**: §9 é o
> artefato mais copiado deste repositório e encurtá-lo é `R8` (`ADR`), não prompt.
>
> ⚠️ **PROPOSTA NÃO APLICADA, e é a lacuna que mais provavelmente reincide:** o §9 **não prescreve
> `lang="pt-BR"` nem `<title>` em português**. As duas telas nascidas do zero saíram com
> `lang="en"` e `<title>` em inglês — foi preciso pedir explicitamente. **Uma tela nova gerada
> amanhã vai reincidir.** O conserto é uma linha no item 16(j) e uma no item 11; **não escrevi,
> porque é edição do §9 e não estava no que o owner aprovou.**

```text
 16. DRIFT MEDIDO — LEIA ESTE BLOCO PRIMEIRO. Ele conserva o numero 16 porque
     STITCH_CONTEXT.md cita "item 16" em varios lugares: a POSICAO mudou, a referencia nao.
     ESTES TREZE ERROS JA FORAM COMETIDOS NESTA TELA, POR UM GERADOR QUE
     TINHA ESTE MESMO CONTEXTO. Nao sao hipoteses: foram extraidos do HTML gerado em
     2026-08-25 e medidos. Verifique cada um contra a sua saida ANTES de responder.
       (a)  direcao desenhada em azul #2a78d6 / laranja #eb6834. Os dois estao REVOGADOS.
            Nenhum dos dois pode aparecer em lugar nenhum. Direcao e #089981 / #f23645.
       (b)  candle e barra desenhados como BLOCO SOLIDO, sem vazado/cheio/cruz. E o defeito
            mais facil de cometer, porque bloco solido e o default de todo gerador, e
            reprova SC 1.4.1 sozinho.
       (c)  numeral de completude ("1149/1152", "1 lacuna") tingido de vermelho de erro.
            Completude incompleta e SEVERIDADE OPERACIONAL e nao tem cor. Tinta neutra.
       (d)  selo entregue com 3 de 4 campos — faltou a IDADE. Conte os campos.
       (e)  canal de integridade AUSENTE: zero violeta, zero losango, zero palavra.
            Ausencia nao e conformidade: se ha lacuna na tela, ha afirmacao de integridade.
       (f)  procedencia como CHIP COLORIDO (azul para OBSERVADO, laranja para DERIVADO).
            Procedencia nao consome hue. Medido: dois tints pastel de procedencia medem 0.5
            de separacao entre si sob dicromacia — sao a MESMA cor — e um deles mede 0.6
            contra o violeta de integridade.
       (g)  acao em azul claro #a8c8ff (7 usos) e #4b91f1 no rail ativo. Medido: #a8c8ff
            contra #e0aaff da 0.9 sob deuteranopia. Sao a MESMA COR. Acao e luminancia.
       (h)  superficies inventadas: #121315, #16181d, #0d0e10, #2a2e39. Sao TRES e sao
            #131722 / #0d1017 / #222634. Uma superficie a 1.008 de contraste da correta
            ainda esta errada.
       (i)  backdrop-blur com fundo translucido no cabecalho de painel. Sem blur, sem alpha.
       (j)  microcopy em ingles: "LIVE", "AS AT T", "Documentation", "API Status". E
            AO VIVO, COMO EM T, e o rodape so tem a atribuicao da TradingView.
       (k)  sino de notificacao no chrome.
       (l)  paineis num container de altura fixa com overflow-y-auto, exigindo SCROLL para
            ver os quatro. Dois paineis que precisam de rolagem para serem vistos juntos NAO
            compartilham crosshair, e crosshair compartilhado e o motivo da tela existir.
       (m)  acentuacao transliterada: "preco", "ancora", "Graficos". E preço, âncora, Gráficos.

     E UM ACERTO PARA NAO REGREDIR: aquele gerador escreveu o chip de ambiente como MAINNET
     mesmo com um design system que mandava escrever "PROD v2.4". Ele desobedeceu para o lado
     certo. Nao regrida isso: PROD nao existe neste sistema.

CONTEXTO DO PROJETO — cripto-strategy

Plataforma pessoal, single-user, desktop-first, de analise quantitativa de cripto-derivativos.
Cruza tres camadas de dado — estrutura de preco, sentimento (Open Interest / Funding / Long-Short)
e order flow (CVD) — em prazos de 15m, 1h e 4h, com decisao no fechamento do bucket.
NAO e HFT: nenhum dado de tick chega ao navegador.

O PROBLEMA QUE O PRODUTO RESOLVE nao e "mostrar grafico". E impedir que um numero SEM PROCEDENCIA
chegue a uma decisao que gasta capital do usuario. Toda a interface se organiza em torno disso.

TELAS (4 com tela, 1 que e dado):
  S2 simbolo    NUCLEO OPERACIONAL. multi-painel (Preco, OI, CVD delta, CVD acumulado),
                replay point-in-time, marcacao de swing.
  S1 console    o que esta sendo gravado, o que parou, quanto disso e perda permanente.
                NAO e canal de alarme — e onde se diagnostica depois de ser avisado.
  S3 inspetor   o que este numero e, e quais linhas exatas o produziram. Inclui quarentena.
  S4 bancada    que taxa de disparo um limiar produziria, ANTES de escolher o limiar.
  S5 nao e tela: e uma funcao point-in-time atras de todo seletor de simbolo.

GOVERNANCA DE COR — O EIXO E O TIPO DE MARCA, NAO O SIGNIFICADO. NAO ALTERE NADA DISTO:

  Existem TRES tipos de marca, e cada um tem uma regra diferente:
    FILL  interior de forma geometrica (corpo e pavio de vela, area, barra). Piso 3:1.
    INK   glifo de texto e traco de icone — qualquer coisa que se LE. Piso 4.5:1.
    ON    tinta desenhada EM CIMA de um fill (etiqueta de eixo, badge de crosshair). Piso 4.5:1.

  1. DIRECAO DE PRECO usa a convencao ocidental, e usa os valores exatos da TradingView:
       alta  #089981   baixa  #f23645     (os DOIS valores servem os dois modos)
     Estes valores sao FILL e SOMENTE FILL: corpo de vela, pavio, area, barra.
     NAO EXISTE cor de texto de direcao. Numeral NUNCA e tingido por direcao.
     Isto foi medido, e a superficie importa: #089981 da 3.57:1 contra o BRANCO,
     3.36:1 contra o chrome claro e 3.13:1 contra a listra clara. Os TRES sao legais
     para FORMA (piso 3:1) e ILEGAIS para TEXTO (piso 4.5:1). Nao e escolha de estilo,
     e o que a norma permite.
     A tinta desenhada SOBRE esses fills (etiqueta do eixo de preco, badge do crosshair)
     e #131722 — tinta ESCURA sobre o fill, nunca branca. Medido: #131722 sobre o verde
     da 5.01:1 e sobre o vermelho da 4.59:1. Branco sobre #089981 daria 3.57:1 e reprova.

  2. REDUNDANCIA DE FORMA OBRIGATORIA na direcao, e ela tem TRES estados, nao dois.
     A forma codifica o PREDICADO, nao a palavra "alta":
       corpo VAZADO  =  close > open      (fechou acima da propria abertura)
       corpo CHEIO   =  close < open      (fechou abaixo da propria abertura)
       CRUZ (doji)   =  close == open     DIRECAO NAO AFIRMADA
     Motivo medido: a razao de luminancia entre os dois fills e 1.09, ou seja, em escala
     de cinza os dois sao a MESMA cor. Nenhum par de cores resolve isso — o par
     azul/laranja anterior tambem colapsava (1.38) e o verde/vermelho generico tambem
     (1.25). Vela vazada e a convencao japonesa original, anterior a cor.
     O TERCEIRO ESTADO NAO E DETALHE: quando open == close o corpo tem ~1 px e nao ha
     interior para esvaziar. Um doji e uma CRUZ — sem corpo, so pavio — e a cruz e
     inconfundivel contra vazado E contra cheio, em escala de cinza, sem cor nenhuma.
     NAO force altura minima de corpo para "salvar" o vazado/cheio: um corpo de 2-3 px
     AFIRMA uma direcao que o dado nao sustenta, e isto e a mesma classe de defeito que
     LOCF em serie FLOW e denominador inventado para serie de tick.
     O hue do corpo de 1 px de um doji nao carrega informacao nenhuma, porque a forma
     ja afirmou "nao houve direcao".

  3. INTEGRIDADE DO DADO — "este numero quebrou" — usa VIOLETA, nao vermelho:
       #e0aaff no modo escuro   (#581c87 no modo claro, que NAO e o que voce vai gerar)
     Motivo, e ele e uma ARQUITETURA DE DOIS EIXOS, nao uma preferencia:
       direcao vive no eixo L/M      morre em protanopia e deuteranopia (18.0 e 22.8),
                                     sobrevive em tritanopia (61.4),
                                     e e coberta por FORMA (vazado/cheio/cruz).
       integridade vive no eixo S    sobrevive em protanopia e deuteranopia (19.5),
                                     morre em tritanopia,
                                     e e coberta por GLIFO + PALAVRA.
     Os dois canais de hue falham sob dicromacias DISJUNTAS, e cada um e coberto por um
     canal NAO-CROMATICO DIFERENTE. Nenhuma dicromacia derruba os dois ao mesmo tempo.
     Ambar foi REJEITADO: sob dicromacia o vermelho colapsa para o amarelo-marrom.
     Violeta contra o vermelho de baixa mede 29.5, contra o verde de alta mede 26.9,
     contra a tinta fraca de procedencia mede 19.5. Passa o piso 15 nos tres.
     ATENCAO: estes valores de violeta foram TROCADOS em 2026-08-25. Os anteriores
     (#6d28d9 claro / #c084fc escuro) REPROVAVAM sob tritanopia — 5.3 e 14.7 contra a
     tinta fraca. Nao volte aos valores antigos.

  4. A COR E O TERCEIRO CANAL DA INTEGRIDADE, NUNCA O PRIMEIRO. A afirmacao chega por:
       GLIFO   um LOSANGO VAZADO, sempre o mesmo, e NAO e triangulo nem circulo — essas
               duas formas pertencem a severidade de dashboard e trariam vermelho de volta
               por habito. A FORMA SOZINHA tem de bastar em escala de cinza, sem cor nenhuma.
       TEXTO   a palavra: QUARENTENA, "idade ?", "sem procedencia".
       COR     violeta apenas no TRACO do losango e na regua vertical do selo. Acompanha.
     O losango NUNCA e vermelho e NUNCA preenche area. Integridade nunca tinge numeral.

  5. ALERTA E SEVERIDADE FICAM FORA DO CANAL DE COR. ESTA REGRA E GENERICA E VALE PARA
     TODA AFIRMACAO DE ESTADO GRAVE, NAO SO PARA INTEGRIDADE DE DADO.
     Nao existe token de cor de severidade. Nao existe --severidade-critico, nao existe
     vermelho de erro, nao existe ambar de aviso, nao existe barra vermelha preenchida.
     Isto inclui, e este e o caso que mais escapa:
       "coletor PAROU"        severidade OPERACIONAL. NAO e integridade de dado, e NAO
                              herda o violeta. A S1 e um console cujo job e "o que parou,
                              quanto disso e perda permanente" — e a saida errada seria
                              uma barra vermelha preenchida, que satisfaz a letra do
                              item 1 e destroi a intencao.
       "perda permanente"     idem. Vive em PALAVRA + GLIFO + luminancia de tinta.
       "backfill atrasado"    idem.
     COMO SE DESENHA severidade sem cor: pela PALAVRA explicita, pelo GLIFO estavel, pela
     POSICAO (o que parou vai para o topo da lista, nao fica colorido no meio dela), pela
     CONTAGEM (o numeral de quantos buckets se perderam) e pela luminancia da tinta de
     procedencia. Ordenar por gravidade e um canal; tingir por gravidade nao e.
     Quatro argumentos independentes sustentam isto: escassez de canal de hue (so ha tres
     vagas e as tres estao ocupadas) · forced-colors (item 13) · o contraste medido ·
     e tritanopia, que reprovou o violeta na primeira posicao em que ele foi posto.

  6. QUATRO PAPEIS DE COR MUTUAMENTE EXCLUSIVOS, que nunca se cruzam:
       direcao de preco   verde/vermelho, so em FILL, mais forma vazado/cheio/cruz
       integridade        violeta, so em INK, mais losango, mais palavra
       procedencia        SEM HUE. E luminancia de tinta neutra, mais halo, mais o caractere ~
       marca e acao       SEM HUE. E luminancia, mais borda
     So existem TRES hues nesta interface: verde-teal, vermelho, violeta. Nada mais.
     ACAO NAO E AZUL. Medido: azul de acao contra violeta de integridade da 0.3 sob
     deuteranopia, ou seja, sao a MESMA cor. Botao e selo quebrado dividem o cabecalho de
     painel, entao essa colisao seria real. Botao usa fill #333846 com borda #8b949e e
     texto #e6e9ef. A BORDA e que carrega a fronteira, porque o fill sozinho da 1.32:1.

  7. O ANEL DE FOCO E DESLOCADO, E ISSO E REQUISITO, NAO ESTILO.
     O anel de foco usa #8b949e no escuro (#131722 no claro) — os MESMOS valores da borda
     e do fill do botao. Encostados, o contraste entre eles e 1.00 e A FRONTEIRA NAO
     EXISTE. Portanto: outline-offset MAIOR QUE ZERO, sempre, e o vao entre o anel e a
     borda do botao e COR DE SUPERFICIE. Le-se como TRES faixas: borda, vao, anel.
     Medido: no pior caso o anel contra o vao da 4.89:1, contra piso 3:1. Passa.
     Com outline-offset: 0 o valor real e 1.00 e REPROVA.
     Nao troque o anel por um hue "de foco": nao ha vaga no orcamento de hue.

  8. O NUMERAL TEM UM UNICO EIXO DE TINTA: o de procedencia, e ele NAO TEM HUE.
       tinta forte  #e6e9ef    tinta fraca  #8b949e
     "Tinta fraca" NAO pode ser cinza claro nem opacity 0.6: tem de passar 4.5:1 porque e
     TEXTO. #8b949e da 4.89:1 contra a superficie mais clara e e o PISO do que "fraca" pode ser.
     O SINAL de um delta e lido por TRES canais, nenhum deles cor:
       (a) o caractere de sinal, SEMPRE presente: "+1.234" e "-1.234". O "+" nao e opcional.
           Em figuras tabulares o sinal ocupa COLUNA FIXA e a coluna se le de relance.
       (b) a geometria do plot: posicao em relacao a linha de base zero.
       (c) opcionalmente uma mini-barra na celula. Barra e FORMA, entao pode usar o fill
           de direcao. E o unico lugar em que hue de direcao entra numa tabela.

  9. SUPERFICIES. Gere no MODO ESCURO, com exatamente estas tres:
       #131722  fundo do plot e do painel — e onde os fills de direcao sao desenhados
       #0d1017  chrome global e cabecalho de painel
       #222634  listra de tabela e linha em hover
     NENHUM fill colorido pode ser desenhado sobre superficie fora deste conjunto.
     Nao invente uma quarta superficie, nao use gradiente, nao use vidro nem blur.

 10. NENHUM numeral de mercado aparece sem um SELO de quatro campos, VISIVEL SEM HOVER.
     Tooltip nao conta. Os campos sao:
       serie      rotulo completo lido do catalogo, com unidade. Ex: "OI · grade 5m · BTC · bn-dump".
                  As palavras OI, funding, L/S e CVD SOZINHAS nao existem nesta interface.
       idade      (tempo de referencia da LEITURA) menos available_at. NUNCA "agora menos
                  available_at". Em COMO EM T o tempo de referencia e T, NUNCA o relogio de
                  parede. O carimbo e do FECHO da janela, nunca do rotulo cru da fonte.
                  So aparece na borda direita do tempo.
                  Quando o atraso do endpoint nao foi medido, a idade NAO e exibida: a
                  afirmacao "nao sabemos a idade" pertence ao canal de INTEGRIDADE
                  (losango mais palavra), nao ao campo idade.
       procedencia  OBSERVADO (tinta forte), DERIVADO (tinta forte, mostrando a expressao
                    que o gerou), MODELADO (tinta fraca, com um til antes do valor),
                    HUMANO (HALO, isto e, contorno adicionado POR FORA e deslocado, ao redor
                    da marca de anotacao; e o unico conteudo que o usuario criou).
                    O halo do HUMANO e coisa diferente do corpo vazado da vela em que
                    close > open: halo se ADICIONA por fora de uma marca de anotacao;
                    vazado ESVAZIA o interior de um corpo de vela. Vela nunca e anotacao.
       completude   "285/288 · 1 lacuna" para serie de grade. Para serie de tick, escreva
                    "contiguidade (N saltos)": serie de tick NAO TEM denominador esperado,
                    e inventar um denominador ali e defeito.

 11. Numeral usa PONTO decimal, sem separador de milhar. Portugues do Brasil aparece
     apenas em microcopy e rotulo de eixo, nunca no numeral.

 12. Contexto e ICADO, nao repetido: sessao carrega fuso/modo/versao uma vez por tela;
     painel carrega identidade/fonte/unidade/procedencia uma vez por painel, SEMPRE VISIVEL
     e nunca em tooltip; o numero carrega apenas a idade.

 13. TODO numeral usa figuras TABULARES (font-variant-numeric: tabular-nums), em fonte
     monoespacada. Coluna de numeral que desalinha ao atualizar e defeito, nao estilo.
     Isto nao e cosmetico: o item 6(a) depende do sinal ocupar coluna fixa.

 14. Densidade ANALITICA, nao densidade de marketing: linha de tabela ~32px, texto
     secundario 12-13px, padding minimo, sem card espacado e sem sombra. O leitor e um
     analista em sessao longa, nao um visitante.

 15. MODO DE ALTO CONTRASTE DO SISTEMA (forced-colors). Duas metades da tela se comportam
     de forma OPOSTA, e assumir o contrario e o defeito:
       o CHROME e CSS      => o sistema SOBRESCREVE as cores. O que sobrevive e glifo e texto.
       o PLOT e <canvas>   => o sistema NAO afeta bitmap de canvas. As velas MANTEM
                              verde/vermelho enquanto tudo em volta vira cor de sistema.
     Consequencia: nao existe "degradacao graciosa" aqui, existe HIBRIDO DESCASADO. E e
     por isso que severidade e integridade nao podem depender de hue: um canal de cor que
     funciona em METADE da superficie e pior que um que nao funciona.
     Regra de desenho: toda cor que o plot usa tem de poder CHEGAR COMO ARGUMENTO, nunca
     ser lida de CSS dentro do canvas. Nao desenhe nada cuja unica leitura seja a cor.

DECISOES DE UX TRAVADAS:
  - "AO VIVO" e "COMO EM T" sao modos de primeira classe, no chrome global, nunca escondidos em menu.
  - Um grafico de tres dias tem ZERO carimbos de idade, e isso esta correto.
  - Ausencia de dado nunca e interpolada em silencio. Serie de fluxo ausente mostra um travessao.
    Serie de estoque mostra o ultimo valor em tinta fraca, com a hora real e uma
    linha-guia apontando PARA TRAS ate a medida verdadeira.
  - Zero legitimo do fornecedor e uma MARCA desenhada na linha de base, distinguivel de
    ausencia. "Nao houve liquidacao" e "nao sabemos" nao sao a mesma afirmacao.
  - O conjunto de parametros E a URL. NAO existe gerenciador de presets, nao existe CRUD de layout.
  - Chrome global mostra sempre: ambiente (mainnet/testnet/demo/replay), modo, versao do conjunto.
  - A TradingView e creditada com link na primeira tela publica, nao na ultima. E obrigacao
    de licenca do lightweight-charts, nao rodape opcional.

FORA DE ESCOPO — NAO DESENHE, por mais natural que pareca num produto de trading:
  - sinal de compra/venda, score de confluencia, recomendacao
  - placar de performance (win rate, profit factor, drawdown, sharpe)
  - entrada de ordem, carteira, saldo, posicao, execucao
  - detectores de padrao nomeados (order block, FVG, BOS, CHoCH, Fibonacci)
  - watchlist multi-simbolo ao vivo, painel de liquidacao, gerenciador de layouts
  - TELA DE LOGIN, autenticacao, avatar de usuario, menu de conta. A plataforma roda LOCAL
    neste momento (declaracao do owner, 2026-08-25: "vps n e problema agora, vai rodar muito
    local ate la") e auth NAO e superficie visivel. principal_id continua sendo dimensao
    OBRIGATORIA de dado — mas dado nao e tela.
  - icone de sino, badge de notificacao, central de alertas. O canal de aviso deste sistema
    NAO vive no browser. Uma afordancia que promete o que nao existe e defeito.
  - qualquer elemento que EMPURRE o usuario a mais operacoes. Zero selecao e informacao valida,
    e a ausencia dessa afordancia e deliberada.

REGRAS DESTA CONVERSA:
  - Nao redesenhe nenhuma tela agora.
  - Nao simplifique este resumo e nao o reescreva.
  - Nao transforme isto em terminal de corretora, bot de sinais, rede social de traders,
    plataforma de copy trade ou dashboard generico de cripto.
  - Preserve a S2 como nucleo operacional do produto.
  - Preserve desktop-first e usuario unico. Nao invente equipe, permissao por papel ou multi-tenant.
  - Diferencie sempre: serie, painel, simbolo, bucket e observacao sao coisas distintas.

LEMBRETE FINAL, e sao as quatro restricoes mais violadas:
  1. NENHUM numeral de mercado aparece sem o selo de quatro campos visivel sem hover.
  2. Vermelho e verde vivem SO no preenchimento de forma. Nenhum numeral, rotulo, sinal
     de delta ou texto e tingido de verde nem de vermelho, em lugar nenhum da tela.
  3. "Dado quebrado" e VIOLETA mais LOSANGO VAZADO mais PALAVRA. Nunca vermelho.
  4. ALERTA E SEVERIDADE NAO TEM COR. "Coletor PAROU" nao e barra vermelha e nao e
     violeta: e palavra, glifo, posicao e contagem. Isto vale para TODA afirmacao de
     estado grave, nao so para integridade de dado.

PROXIMA TAREFA: aguarde a instrucao especifica.
```
