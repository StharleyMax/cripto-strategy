# Gate `quant-architect` — wave 03, `frontend/src/charts/` (janela deslizante)

`[roteamento tardio]` — o dono de julgamento de `charts` (`agents.by_component`) não foi roteado
quando a wave 03 alterou 6 arquivos sob `frontend/src/charts/`. Julgado aqui, antes do merge.
Branch: `wave/03-producao-e-janela-deslizante`. Universo: `git diff master -- frontend/src/charts`
(6 arquivos) + os 4 call-sites em `frontend/src/app/symbol/`.

## Veredito: **APROVADO COM CONDIÇÃO** (4 condições, C1–C4)

A troca de janela literal por janela deslizante é **melhoria real e a forma certa**. As condições
são sobre **justificativas medidas com `n=3` quando existe `n=804` no mesmo diretório de handoff**,
e sobre **aritmética de bucket que vazou para `web`**. Nenhuma delas reabre `ADR-006`/`SPEC-001`
§5.11 — essas eu explicitamente **não julgo** (ver §6).

---

## 1. A forma da janela é a certa para este domínio? → **SIM**

**Aprovado.** `frontend/src/charts/s2-window.ts:107-134` (`resolveTrailingWindow`).

Uma janela **trailing** é a forma correta para um operador discricionário: ele lê "as últimas N
barras", não um intervalo de calendário. Uma janela literal é **falsificável só nos 4 dias que
alguém digitou**; uma trailing é falsificável **em todo instante** — e essa é a propriedade que
faltava, não uma preferência. A pureza (`nowMs` como argumento, `Date.now()` fora do módulo) é o
que torna o teste de `s2-window.test.ts:42-56` possível sem congelar o relógio.

**A alternativa recusada está recusada com medição, não com gosto** (`s2-window.ts:19-31`): não há
superfície de leitura que publique a cobertura da série (`SeriesCatalogEntry` não carrega
primeiro/último `event_time`), então derivar a janela "do que a série oferece" exigiria campo novo
em `sentimento` ou uma requisição-sonda sobre janela chutada — que é o mesmo literal, um nível mais
fundo. **Concordo com a recusa e com o motivo dela.**

### ⚠️ O que o span de 4 dias entrega no timeframe de operação do owner `[MEDIDO 2026-09-11]`

`[PREMISSA-OWNER]` — operação em **15min a 4h**. O span de 4 dias dá, por aritmética:

```
node -e 'const D=864e5,M=6e4;for(const[n,tf]of Object.entries({"15m":15*M,"1h":60*M,"4h":240*M}))console.log(n, 4*D/tf, "barras")'
# 15m 384 barras | 1h 96 barras | 4h 24 barras
```

**384 barras de 15m é confortável; 24 barras de 4h não é contexto suficiente** para leitura de
estrutura (OB/BOS/CHoCH pedem ordem de 100+ barras). **Isto NÃO é motivo para reprovar** — o span
de 4 dias é de `PRD-006 §2`/item `5.1` (ver C4 sobre a citação) e a página S2 é de densidade de
1 minuto, diagnóstica, não a tela de operação. Fica **registrado como limite conhecido** para o dia
em que entrar seletor de timeframe.

### ⚠️ Alinhamento das bordas — `[MEDIDO 2026-09-11, n=1440 leituras de relógio]`

`resolveTrailingWindow` é chamada com `alignmentMs = FIVE_MINUTES_MS`
(`frontend/src/app/symbol/request-window.ts:80`), e a própria docstring do parâmetro diz que ele é
"the COARSEST grid the caller will place on this window". Hoje isso é verdade (1m/5m). No dia em
que um agregado de 15m/1h/4h for desenhado sobre esta mesma janela, as bordas **não caem** na grade:

```bash
node -e 'const M=6e4,D=864e5,f=(x,t)=>Math.floor(x/t)*t,b=Date.UTC(2026,8,11);
for(const[n,tf]of Object.entries({"15m":15*M,"1h":60*M,"4h":240*M})){let ok=0;
for(let i=0;i<1440;i++){const e=f(b+i*M-5*M,5*M);if(e%tf===0&&(e-4*D)%tf===0)ok++}
console.log(n,ok+"/1440",(100*ok/1440).toFixed(1)+"%")}'
# 15m 480/1440 33.3% | 1h 120/1440 8.3% | 4h 30/1440 2.1%
```

O contrato do parâmetro já é o certo (o chamador declara o grid mais grosso). **Condição C1:** que
a docstring de `RIGHT_EDGE_LAG_MS`/da chamada em `request-window.ts:80` registre **em uma linha**
que `alignmentMs` sobe para o TF mais grosso no dia em que um painel de 15m+ entrar, senão o
alinhamento quebra **silenciosamente** (a janela continua válida, as barras é que ficam cortadas).

## 2. O recuo de 5 min esconde o atraso real de publicação? → **SIM, a JUSTIFICATIVA esconde.
   O número sobrevive por 33 s.**

**`frontend/src/app/symbol/request-window.ts:37-45` (`RIGHT_EDGE_LAG_MS`) e `:47-58`
(`KNOWLEDGE_TIME_LAG_MS`) são justificados com `n=3`.** As duas docstrings citam
`10.434s / 12.034s / 13.591s` de `ACHADO-SERIES-HISTORY-SEM-PONTO.md`. No **mesmo diretório de
handoff** existe medição de `n=804` linhas ao vivo, e ela diz outra coisa
(`ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md`, tabela: *ao vivo, 804 linhas, atraso mín 0 s, máx 267 s*;
e `ACHADO-FLOW-COM-ATRASO-MAIOR-QUE-A-GRADE.md`: *mediana 31.050 ms, máx 60.936 ms* em `n=181`).

| afirmação em `request-window.ts` | contra `n=3` | contra `n=804` (`[MEDIDO 2026-09-11]`) |
|---|---|---|
| `:44` *"Five minutes is ~22× the worst measured lag"* | 300/13,6 = **22,1×** ✔ | 300/267 = **1,12×** — margem de **33 s** |
| `:53` *"One minute covers the measured lag with ~4× margin"* | 60/14 = **4,3×** ✔ | 60/267 = **0,22×** — **não cobre** |

### E há um erro de MECANISMO, não só de número — este é o achado mais forte

A docstring `:40-44` justifica `RIGHT_EDGE_LAG_MS` dizendo que sem ele *"the panel's 'leitura
atual' … would print `SEM_PONTO` for a bar that exists"*. **`RIGHT_EDGE_LAG_MS` não pode influenciar
isso.** `R-1` é `available_at <= t` com `t` = **o instante de grade**, não o relógio
(`backend/src/modules/sentimento/domain/as_of_accessor.py:37,311`). A relação entre `bucket_end` de
uma barra e o `available_at` dela **é invariante sob o recuo da borda direita** — recuar a janela
move `t` no relógio de parede e move a barra junto. Ou seja: **o recuo de 5 min compra zero de
`R-1`.**

O que ele **de fato** compra, e é legítimo: (a) não pedir janela no futuro contra o `server_now_ms`
do backend (`422`), (b) manter `knowledge_time_ms < now` — que é exatamente o que
`request-window.test.ts:58-66` assere, e (c) folga de skew de relógio entre o servidor Next e o
banco. **Nenhum desses três se dimensiona pelo atraso de publicação.**

Quem **de fato** depende do atraso de publicação é o **outro** número, `KNOWLEDGE_TIME_LAG_MS`, via
`observed_at <= knowledge_time` (`as_of_accessor.py:310`). Para a barra lida no último instante de
grade (`bucket_end = endMsExclusive − 2min`, lida em `t = endMsExclusive − 1min`):

```
observed_at ≈ bucket_end + atraso ≤ knowledge_time = endMsExclusive + 60s
⟺ atraso ≤ 180 s        # tolerância real de hoje
atraso máximo medido ao vivo = 267 s  (n=804)   ⇒ a cauda ESTOURA a tolerância
```

**Condição C2** (`request-window.ts:37-58`) — e ela é de docstring + constante, não de arquitetura:

1. Reescrever a justificativa de `RIGHT_EDGE_LAG_MS` sobre o que ele realmente protege (`422` /
   skew), **removendo** a alegação de `R-1`/`SEM_PONTO`, que é falsa.
2. Redimensionar **`KNOWLEDGE_TIME_LAG_MS`** contra a distribuição de `n=804`, não contra `n=3`.
   Com máx 267 s, `1 min` deixa a cauda de fora; `KNOWLEDGE_TIME_LAG_MS ≥ 300_000` a cobre com
   folga e continua `< RIGHT_EDGE_LAG_MS + spanMs` (não pede futuro). **O número é do builder; a
   condição é que ele venha com `n` e com o comando.**
3. `MEASURED_PUBLICATION_LAG_MS = 14_000` em `request-window.test.ts:31` é o mesmo `n=3` virado
   asserção — o teste `:69-80` **passa por construção** e não morde a cauda real. Trocar por um
   valor derivado da mesma medição de `n=804`.

**Como o owner verifica sem confiar em mim** — SQL de uma linha contra a stack viva, só leitura:

```sql
SELECT count(*) AS n,
       percentile_disc(0.50) WITHIN GROUP (ORDER BY available_at-bucket_end) AS p50,
       percentile_disc(0.99) WITHIN GROUP (ORDER BY available_at-bucket_end) AS p99,
       max(available_at-bucket_end) AS pior
FROM md.series
WHERE series_key_id='ef3033e6…4e42' AND available_at-bucket_end <= 300000;  -- só ao vivo
```

Se `p99` couber em `KNOWLEDGE_TIME_LAG_MS`, a constante está dimensionada. Se não couber, a tela
fabrica `SEM_PONTO` na borda direita — e `RN-1` é sobre ausência **real**.

## 3. `ADR-003` FR-2 — `endMsExclusive − ONE_MINUTE_MS` em `web`: concordo com o `/review`?
   → **CONCORDO COM O DIAGNÓSTICO, DISCORDO DA FORMA PROPOSTA.**

**O diagnóstico está certo, e é minha fronteira.** Hoje a mesma aritmética de bucket existe
**duas vezes, em `web`**:

```
frontend/src/app/symbol/request-window.ts:85   windowEndMsInclusive: window.endMsExclusive - ONE_MINUTE_MS
frontend/src/app/symbol/SymbolClient.tsx:112   return panels.rangeEndMsExclusive - ONE_MINUTE_MS
```

`ADR-003` FR-2 (`docs/adr/ADR-003-fronteira-charts-web.md:37`): *"`web` não calcula geometria …
impede a segunda implementação da grade canônica, que é o modo de falha em que a tela e o motor
discordam sobre o que aconteceu"*. **Duas cópias da mesma conversão meia-aberta→inclusiva é
literalmente a segunda implementação que FR-2 nomeia** — e as duas já se referenciam por comentário
(`page.tsx:242-243`, `SymbolClient.tsx:104-110`), que é o sintoma clássico: um comentário fazendo
o trabalho que um tipo deveria fazer.

### Por que a forma proposta (`S2Window.endMsInclusive` como campo derivado) está errada

**O fim inclusivo não é propriedade da janela — é propriedade do par (janela, grade).**
`resolveTrailingWindow` é chamada com `alignmentMs = FIVE_MINUTES_MS` (a grade **mais grossa**,
`request-window.ts:80`), enquanto o que `web` precisa é o último instante da grade **mais fina**
(`interval: "1m"`, `page.tsx:135`). Um campo `endMsInclusive` derivado dentro de
`resolveTrailingWindow` só pode ser derivado de `alignmentMs` ⇒ devolveria `endMsExclusive − 5min`,
que é **o instante errado**, e erraria em silêncio: a requisição continuaria válida, só 4 minutos
mais curta. Trocar um literal por um campo com a grade errada não é progresso — é o mesmo defeito
com melhor reputação.

### A forma que eu decido, e ela fecha a fronteira sem mentir sobre a grade

Exportar de `charts` uma **função do par**, não um campo:

```ts
// frontend/src/charts/s2-window.ts — nova export, reexportada pelo barril (ADR-034/D8)
/** O último instante de grade de `[startMs, endMsExclusive)` em passo `gridMs` — a conversão
 *  meia-aberta→inclusiva que `window_end_ms` de `HistoryRequestKey` pede. Recusa uma grade que
 *  não divide a janela: um "último instante" fora da grade é a discordância que FR-2 proíbe. */
export function lastGridInstant(window: S2Window, gridMs: number): number;
```

- `request-window.ts:85` → `lastGridInstant(window, ONE_MINUTE_MS)`;
- `SymbolClient.tsx:112` → `lastGridInstant(windowOf(panels), ONE_MINUTE_MS)`, ou — melhor —
  `S2Panels` passa a carregar o `S2Window` inteiro em vez de `rangeStartMs`/`rangeEndMsExclusive`
  soltos (`s2-panels.ts:183-210` já recebe `window: S2Window` em `S2RawInputs`; expor o mesmo
  objeto na saída elimina o segundo call-site **por construção**, sem precisar de disciplina).
- guarda: `if (endMsExclusive - startMs) % gridMs !== 0 → RangeError` — mesma disciplina do
  `spanMs % alignmentMs` que `s2-window.ts:128-133` já aplica, e pelo mesmo motivo escrito lá.

**Falsificador, e o owner roda sem me consultar** — depois da mudança, zero ocorrências:

```bash
grep -rn -- "- ONE_MINUTE_MS\|rangeEndMsExclusive -\|endMsExclusive -" frontend/src/app | grep -v '\.test\.'
# hoje: 2 linhas (request-window.ts:85, SymbolClient.tsx:112). Depois: 0.
```

**Condição C3:** implementar `lastGridInstant` em `charts` e zerar esse `grep`. **Não** aceitar
`S2Window.endMsInclusive` como campo.

## 4. O backfill invisível ao `as_of` muda o julgamento sobre o vão de 4 dias? → **NÃO muda a
   FORMA. Muda o que a tela é obrigada a DECLARAR.**

`handoff/ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md`: `769` de `5.761` grades têm valor (**13,3%**),
e o primeiro índice com valor é o **4.971 de 5.761** ⇒ os primeiros **86%** da janela são
estruturalmente vazios, porque `available_at` do backfill é a hora em que **buscamos**, não a hora
em que era sabível — e `R-1` (corretamente) recusa a linha no seu próprio instante de grade.

**O que NÃO muda:** a janela deslizante continua certa e é melhoria medida — `0 → 769` grades com
valor. Uma janela literal em 2026-08 daria `0/5761` para sempre; esta dá `769` e **cresce sozinha a
cada minuto de coleta ao vivo**. O defeito que ela conserta é dela; o teto que ela revela não é.

**O que muda, e é decisão minha porque é de `charts`/apresentação:** 4 dias de janela sobre ~12,8 h
de dado legível (769 grades × 1 min) produz um gráfico cujos 86% à esquerda são **indistinguíveis,
para o operador, de "o mercado não teve dado"**. Na `as_of` a ausência é **real** (não sabíamos
naquele `t`) — então **não é mentira**, e por isso **não reprovo**. Mas é **ausência de uma classe
que a tela não distingue da outra**, e este projeto tem regra sobre isso (`RN-1`: ausência é real,
nunca zero fabricado). Levado ao TF do owner: **24 barras de 4h, ~3 com dado.**

**Condição C4** — e é a mais barata das quatro:

1. A rota já sabe o suficiente para declarar o horizonte: `presentPoints` por painel já é contado
   (`page.tsx:238`). Exibir, junto ao eixo, **"dado legível desde `<primeiro instante com valor>`;
   `N/5761` grades"** — um fato medido, não um aviso. Isso transforma "86% vazio" de *aparência de
   mercado morto* em *fato declarado sobre a coleta*, que é a distinção que `RN-1` protege.
2. **Não** encolher o span para "caber no dado": o span é de `PRD-006 §2`/`5.1`, não meu, e uma
   janela que encolhe para esconder o próprio buraco é pior que uma que o declara.
3. **Citação errada, e ela importa porque é a trilha de auditoria:** `s2-window.ts:34`
   (*"the `ADR-034/D8` 'four days'"*) e `s2-window.test.ts:109` atribuem o span de 4 dias a
   `ADR-034/D8`. **`D8` é a fronteira `charts`↔`web` (barril + bloco de ESLint)**
   — `docs/adr/ADR-034-…:177`. O span de 4 dias é de **`PRD-006 §2`/item `5.1`**, citado dentro da
   ADR em `:127` (*"4 dias, painéis Preço+OI+CVD"*). Corrigir as duas citações.

```bash
sed -n '177p;127p' docs/adr/ADR-034-rotas-de-serie-nome-schema-e-a-coluna-de-valor-que-faltava.md
```

## 5. O que está BEM feito e eu não quero que se perca no ruído das condições

- **`s2-fixture-window.ts` fora do barril é a metade estrutural da correção, e é a melhor decisão
  do diff.** Regra + ESLint (`ADR-034/D8`) tornam **impossível** uma rota voltar a ler janela
  congelada, mesmo por acidente. Disciplina, aqui, foi substituída por impossibilidade — que é o
  único conserto que não erode.
- **`window` como parâmetro obrigatório sem default** em `buildPricePanel`/`buildOiPanel`/
  `buildCvdPanel` (`s2-panels.ts:109,121,140`) é a disciplina `PS-1` certa: *"a silent default
  window is exactly how the frozen one survived four tasks"* — e é verdade, sobreviveu.
- **`spanMs % alignmentMs !== 0` recusado em vez de re-arredondado** (`s2-window.ts:128-133`):
  recusar em vez de corrigir em silêncio é a escolha certa numa fronteira de grade.
- **Pureza com `nowMs` como argumento** (`ADR-003` FR-1): é o que torna a janela falsificável em
  todo instante, e é a diferença entre este módulo e o literal que ele substitui.

## 6. ⛔ O que eu NÃO julgo — declarado, não omitido

1. **Semântica de `available_at` para backfill** (`available_at` = instante da busca vs.
   reconstruído). **Dono: `ADR-006` / `SPEC-001` §5.11**, já escalado pelos dois handoffs. As duas
   saídas têm custo assimétrico e a segunda é lookahead com outro nome — **não é decisão de
   `charts`** e eu não a tomo nem por tabela.
2. **`D4.11` / `CARRY_FORWARD_BY_NATURE[FLOW]` para bucket com atraso > grade**
   (`ACHADO-FLOW-COM-ATRASO-MAIOR-QUE-A-GRADE.md`, teto medido 2,8%, `n=181`). Mesmo dono.
3. **Se o backfill profundo de `ADR-036` herda este teto** — consequência direta do item 1, e
   portanto do mesmo dono. Registro só que **o caminho de backtest herda o mesmo teto**, o que faz
   o item 1 deixar de ser questão de pixel.
4. **`[NÃO MEDIDO]`: o custo de transporte.** `4 painéis × 5.761 grades = 23.044 linhas` por render
   (o backend emite uma linha **por instante de grade**, inclusive `SEM_PONTO` —
   `use_cases/series_history.py:193`). Contra a premissa de infra deste projeto (VPS compartilhada),
   isso merece um número; eu não o tenho. Comando para obtê-lo:
   `curl -s '<url>/series-history?…' | wc -c`. **Não bloqueia esta wave** — é o mesmo volume que a
   janela literal pediria; só nunca foi medido.
5. **Escolha de corretora, tamanho de posição, risco de capital, jurisdição** — fora do meu escopo
   por definição do papel.

## 7. Resumo das condições

| # | arquivo:linha | condição | quem verifica, e como |
|---|---|---|---|
| **C1** | `frontend/src/app/symbol/request-window.ts:80` | 1 linha registrando que `alignmentMs` sobe com o TF mais grosso | `[MEDIDO]` acima: 15m alinha em 33,3% das leituras, 4h em 2,1% (`n=1440`) |
| **C2** | `frontend/src/app/symbol/request-window.ts:37-58`, `request-window.test.ts:31` | tirar a alegação falsa de `R-1`; redimensionar `KNOWLEDGE_TIME_LAG_MS` contra `n=804`, não `n=3` | o SQL de percentis do §2, contra a stack viva |
| **C3** | `frontend/src/charts/s2-window.ts` (novo `lastGridInstant`), `request-window.ts:85`, `SymbolClient.tsx:112` | aritmética de bucket volta para `charts` — **função do par (janela, grade)**, não campo | `grep` do §3 tem de ir de **2 linhas para 0** |
| **C4** | `frontend/src/charts/s2-window.ts:34`, `s2-window.test.ts:109`, `page.tsx` (horizonte na tela) | corrigir a citação `D8`→`PRD-006 §2/5.1`; declarar o horizonte de dado legível | `sed -n '127p;177p'` na ADR; e a tela mostrar `N/5761` |

**C3 é a única que muda arquitetura.** C1/C2/C4 são docstring, constante e uma string de UI —
e as três existem porque **a justificativa escrita não sobrevive à medição que o próprio projeto
já tinha em disco**, que é exatamente a classe de defeito que a disciplina de "nenhum número sem o
comando" existe para pegar.
