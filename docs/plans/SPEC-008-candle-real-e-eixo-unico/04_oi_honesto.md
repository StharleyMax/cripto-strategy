# Fase `04` — O OI honesto: o rótulo soletra o que o número mede, e a chave de máquina para de nascer da microcopy

> **Pixel:** `P4` — o número do OI e o **rótulo** dizem a mesma grandeza, universo e coorte que a fonte declara
> **Componentes:** `web`
> **Requisitos cobertos:** `RF-8` · `RN-5` `RN-7` · `[Q6]`/`G-4` · `C-4`
> **Decide:** `SPEC-008` `D7` (§8) · **independente das demais fases — pode ir em paralelo com `01`**

## Por que esta fase existe mesmo com `[Q1]` resolvida para "fica na origem"

Porque o defeito que o owner circulou em vermelho **não some** quando a fonte fica onde está. A tela
mostra `108.135,34` sob o rótulo *"Open Interest (5m)"* e o print do Coinalyze mostra `27,656 B`.
**Os dois estão certos e medem coisas diferentes** — contratos em BTC na Binance USDT-M contra
nocional em USD agregado multi-exchange sobre coorte STABLECOIN+COIN-margined
`[MEDIDO 2026-09-19, n=15 entradas BTCUSDT]`.

**O rótulo honesto é o que impede a comparação errada.** É a fase que entrega valor mesmo que o
owner venha a mudar a decisão de `[Q1]` — que em 2026-09-19 ele **tomou**, mantendo a origem
(`[DECISÃO-OWNER, escolha entre alternativas apresentadas]`, `SPEC-008` §8.1), e **não** apenas
deixou de vetar uma dedução (`[M-2]`).

## Itens

| # | item | componente | requisito |
|---|---|---|---|
| 4.1 | O rótulo do painel de OI soletra **grandeza · universo · coorte**, lidos do `SeriesKey` servido — **nunca escritos à mão** (`RN-5`) | `web` | `RF-8` |
| 4.2 | O envelope de proveniência (`C-4`) é contrato próprio, derivado do `SeriesKey`, e **a unidade permanece contratos (BTC)**, não nocional USD — nocional apaga justamente a leitura que o owner declarou querer (`SPEC-008` §8.1) | `web` | `C-4` |
| 4.3 | ⛔ **A chave de máquina deixa de nascer da microcopy.** `SymbolClient.tsx:2192` monta `data-fact={\`live_${label}:…\`}` a partir da string visível, e a página publica `data-fact="live_preço:attempted"` — **com acento** `[MEDIDO 2026-09-19]`. A chave passa a ser **ASCII, derivada do `SeriesKey`**; a microcopy continua em **pt-BR** (linha 8 do `CLAUDE.md`) — o conserto é justamente **separar as duas strings** | `web` | `[Q6]`, `G-4`, `M10` |
| 4.4 | Os demais painéis herdam 4.3 — o defeito é da fábrica de chave, não do painel de preço | `web` | `G-4` |
| 4.5 | **Veredito do `ux-ui-mastery`** sobre o rótulo de proveniência | `web` | `CLAUDE.md` §Design |

## DoD verificável — comando e universo

1. **O rótulo soletra os três termos** (`CA-9`).
   `curl -s http://127.0.0.1:3000/symbol | grep -o 'data-fact="oi_provenance:[^"]*"'`
   → presente **e** contendo grandeza + universo + coorte.
   **Morde** ausente, ou com menos de três termos. **Hoje: a chave não existe** `[MEDIDO 2026-09-19]`.

2. ⛔ **Ablação de derivação** (`CA-10`). Trocada a chave da série no catálogo de teste, **o rótulo
   muda sem tocar no componente**. **Morde** se o rótulo não mudar — está hard-coded, e `RN-5` caiu.

3. **Zero chave de máquina não-ASCII.**
   ```bash
   curl -s http://127.0.0.1:3000/symbol | grep -o 'data-fact="[^"]*"' | grep -P '[^\x00-\x7F]' | wc -l
   ```
   → **`0`**. **Hoje morde**: `data-fact="live_preço:attempted"` `[MEDIDO 2026-09-19]`.
   ⚠️ Este comando mede a **chave**, não a microcopy — a microcopy segue em pt-BR por decisão da
   linha 8 da tabela de fronteira, e reprovar acento nela seria reprovar um `/symbol` correto.

4. **O pixel está na tela.** Playwright contra o **app real**: o rótulo é **visível**, com assert de
   posição. Atributo presente com elemento fora da tela é verde falso
   `[DOC: MEMORY.md, "Assert de DOM não prova pixel"]`.

5. **Nada de fonte mudou.** `ADR-036/D2` intocada: o provider do OI continua `binance`,
   `unit=BTC`, `denom=base`, `aggregationScope=Symbol`. **Morde** com qualquer entrada nova de
   catálogo — isso seria `F5`, que está fora deste plano.

6. `make verify` verde, `__pycache__` purgado antes.
