# Fase `03` — O timeframe único: a função que não pode trocar `OPEN` por `CLOSE`

> **Pixel:** `P3` — trocar o TF na barra reagrega **todos** os painéis para o mesmo TF
> **Componentes:** `sentimento` (a função, na rota) · `web` (a barra)
> **Requisitos cobertos:** `RF-6` `RF-7` · `RN-3` `RN-4` · `[Q2]` `[Q8]`
> **Decide:** [`ADR-040`](../../adr/ADR-040-reagregacao-na-rota-supported-interval-vira-conjunto-e-a-funcao-e-de-nature-e-reduction.md)
> ✅ **`[M-3]` FECHADO 2026-09-19** —
> [`JULGAMENTO-QUANT-ARCHITECT.md`](../../context/candle-real-e-eixo-unico/handoff/JULGAMENTO-QUANT-ARCHITECT.md)
> (328 linhas). Esta fase está **desbloqueada**, com a tabela e a política já normativas.

## A tabela `reduce(nature, reduction)` — total, sem ramo `default`

`(FLOW,SUM)`=**Σ** · `(STOCK,OPEN)`=**first** · `(STOCK,HIGH)`=**max, da própria `HIGH`** ·
`(STOCK,LOW)`=**min, da própria `LOW`** · `(STOCK,CLOSE)`=**last** · `(STOCK,LAST)`=**last** ·
`(STOCK,POINT)`=**last** · `(RATIO,POINT)`=**last sob allowlist de 1 elemento**.

`ts_convention` **não entra na chave**: a única colisão (`(STOCK,CLOSE)` = `price_mark_close` +
`sum_open_interest`) pede a **mesma** função. ⛔ **Um 9º par quebra o build.**

## ⛔ A política de cobertura parcial é `P-B`: SERVIR SEMPRE — "recusar" foi DERRUBADO com número

`ADR-040/D3` deixou as três saídas em aberto. O `quant-architect` **fechou em `P-B`** e matou as
outras com três medições `[MEDIDO 2026-09-19]`:

1. a completude **piora com o TF**: `klines_volume` **93,0%** (`5m`) → 90,7% → 84,7% → **78,3%**
   (`4h`), `n=4.604/1.532/380/92` buckets fechados ⇒ *"recusar se < 100%"* apagaria **21,7%** das
   barras de `4h`;
2. 1 minuto faltando é **80%** em `5m` e **99,6%** em `4h` ⇒ **percentual não é unidade
   transportável**;
3. ⛔ `sum_liquidation` tem **0,0% de buckets completos em TODO TF** (301 valores / 5.460
   `SEM_PONTO`, `n=5.761`) ⇒ **qualquer limiar apaga o painel inteiro**.

⇒ serve **sempre**, com `{"present": 81, "expected": 240}` — **par de inteiros, nunca bool, nunca
percentual** — e **nunca extrapola**. Magnitude do que hoje é invisível: bucket fechado de
2026-09-16 00:00, 81/240, `Σ = 4.246,891 BTC`, **subestima ~66,2%** sem a tela dizer nada.

## A baseline, medida

`SUPPORTED_INTERVAL = "1m"` (`series_history.py:48`), com recusa em `:180-183`. A página publica
`data-oi-wire-points="5760"` para `data-oi-native-bars="1152"` — **cada barra nativa repetida 5×**
`[MEDIDO 2026-09-19]`. Não há barra de TF.

TFs do owner: **`5m · 15m · 1h · 4h`** `[PREMISSA-OWNER: 2026-09-19]`.

## Itens

| # | item | componente | requisito |
|---|---|---|---|
| 3.1 | A função de reagregação como **função pura de `(nature, reduction)`**, num lugar só, com o domínio dos **8 pares** medidos — **nunca** tabela por `metric` (`ADR-040/D2`) | `sentimento` | `RF-7`, `RN-3` |
| 3.2 | A função **falha alto** em par não coberto, em vez de cair num padrão | `sentimento` | `ADR-040/D2` |
| 3.3 | `SUPPORTED_INTERVAL` vira o conjunto `{1m, 5m, 15m, 1h, 4h}`; **tudo fora continua `422`** — a cláusula de `D6` é estendida, não diluída | `sentimento` | `ADR-040/D1` |
| 3.4 | **`P-B`**: servir sempre com o par de inteiros `{present, expected}` no envelope; **nunca recusar, nunca limiar, nunca extrapolar**. Default por **regime de erro**: regime A (`Σ`/`max`/`min` — viés unilateral) serve parcial **com marca visível**; regime B (`first`/`last`) usa `maxStalenessMs`, que já existe (`ADR-006`) | `sentimento` | `ADR-040/D3` |
| 3.5 | `(RATIO, POINT)` = **`last`**, rotulado *"razão no fechamento do bucket"*, habilitado por **allowlist de `metric` com 1 elemento** (`count_long_short_ratio`) — **não por `nature`**, porque `SeriesKey` tem **um** membro `RATIO` para **dois** comportamentos e razão de **fluxo** somada infla **3,3×** (p50 `3,1809` vs `0,9707`) `[MEDIDO 2026-09-19]`. ⚠️ Ingerir os componentes **não resolveria**: `longAccount`/`shortAccount` são **frações que somam 1**, não contagens | `sentimento` | `ADR-040/D4` |
| 3.5b | O envelope de `/series-history` ganha `coverage {earliest_bucket_ms, latest_bucket_ms, source_floor_ms}` (`D8`/`D-C3.7`) — sem isso `beyond-coverage` é indistinguível de `absent` por construção, e a fase `05` fica irrealizável | `sentimento` | `D8` |
| 3.6 | A barra de TF lê o conjunto **servido pelo backend**, nunca escrito à mão no front — senão o front oferece TF que a rota recusa e o `422` vira defeito de tela | `web` | `RF-6` |
| 3.7 | A escala `log10` do volume sob TF variável (`[Q8]`/`[M-6]`) — **continua até prova em contrário**; veredito do `design_gate` | `web` | `[Q8]` |
| 3.8 | **Veredito do `ux-ui-mastery`** sobre a barra de TF | `web` | `CLAUDE.md` §Design |

## DoD verificável — comando e universo

1. ⛔ **`CA-8′` — e o `CA-8` do `PRD-008` foi RETIRADO porque morde 1 de 20 trocas e passa verde
   sobre a vela degenerada** que `RN-2` mede existir `[MEDIDO 2026-09-19]`. Quatro camadas:

   **(a) guarda de não-degenerescência PRIMEIRO** — sem ela o resto mede uma vela plana.

   **(b) fixture de mercado real, colhida da BINANCE, não do nosso banco** (`[P-seed]` respeitado:
   é leitura da origem, não semeadura). BTCUSDT, bucket fechado **2026-09-18 12:00→16:00 UTC**,
   240/240 minutos — e cada número traz o **contrafactual que a troca produziria**:

   | função | valor certo | o que a troca daria |
   |---|---|---|
   | `Σ` volume | **93.465,237** | — |
   | `first(open)` | **78.031,00** | `first(close)` = 77.984,40 |
   | `max(high)` | **81.156,80** | `max(close)` = 81.062,60 (**−11,7 bp**) |
   | `min(low)` | **77.923,50** | `min(close)` = 77.944,80 |
   | `last(close)` | **80.688,70** | `first(close)` = 77.984,40 (**−3,35%**) |

   ⇒ idênticos à vela `4h` da própria Binance, logo **auto-verificáveis pelo owner no gráfico**.

   **(c) matriz exaustiva `8 pares × 5 funções = 20 asserções`** — cada célula errada reprova.

   **(d) ablação de cobertura** (81/240): exigir que **`mean × 240` NÃO apareça** — é a forma que a
   extrapolação silenciosa tomaria.

2. **`STOCK` não soma** (`CA-8`). Teste diferencial: OI reagregado a `1h` **==** o último do bucket
   **e ≠** a soma dos 12 de `5min`. **Morde** se igual à soma — seria `12×` o OI real.

3. **`FLOW` soma.** Volume reagregado a `1h` **==** a soma dos 60 fatos de `1min` contidos.
   **Morde** se igual ao último (subestimação silenciosa — o defeito que `ADR-034/D6` recusou servir).

4. **Os 8 pares estão cobertos.** Teste de totalidade sobre o domínio medido:
   ```bash
   curl -s http://127.0.0.1:8000/api/v1/series-catalog \
     | python3 -c "import sys,json;print(sorted({(x['key']['nature'],x['key']['reduction']) for x in json.load(sys.stdin)['entries']}))"
   ```
   **`n = 8`** pares; cada um tem função declarada. **Morde** com par sem cobertura, e morde se a
   contagem subir sem alguém decidir a função nova.

5. **A recusa continua recusando.** `interval` fora de `{1m,5m,15m,1h,4h}` → **`422`**,
   `n = 3` casos (`1d`, `3m`, `30s`). **Morde** com qualquer `200`.

6. **O TF move todos** (`CA-7`). Playwright contra o app real: clicar `4h` e ler a contagem de barras
   de **cada um dos 6** painéis. **Morde** se um painel mantiver a contagem anterior.

7. ⛔ **Ablação de `P3`.** Fixado o TF de volta a `1m`, a contagem de barras volta ao valor anterior
   em todos os seis. Pixel que não muda sob ablação não estava seguindo o mestre.

8. **A escada de `GA-2` some ou é declarada** (`RN-4`). Sob TF explícito, `wire-points` deixa de ser
   `5×` `native-bars` — ou o relatório carrega o veredito de upsampling (`ADR-037/D4`).

9. `make verify` verde, `__pycache__` purgado antes.
