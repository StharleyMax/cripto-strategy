# `T-05.1` — Falsificador de `denom` de `sum_liquidation`, **antes** de gravar a identidade

> Rodado em 2026-09-12, worktree `agent-a51f816889224e772`. Plano: `05_liquidacoes.md` item 5.1.
> `DoD` do handoff item 5: *"`denom` decidido por medição, em `gates/falsificador-denom-liquidacao.md`,
> **antes** de `T-05.3`"*.

## Veredito

**`denom = "quote"` — e a decisão vem com uma condição que o plano não tinha: o coletor
TEM de passar `convert_to_usd=true` na requisição.**

⛔ **O padrão do fornecedor é `convert_to_usd=false`, e ele devolve BASE.** Gravar a identidade
com `denom="quote"` e requisitar com o padrão produziria uma série rotulada em USD carregando
unidade de moeda — **defeito silencioso**, porque nada na resposta diz qual unidade veio.

Isto é exatamente o que `T-05.1` existe para pegar: o plano trazia
`[INFERRED: denom="quote"]` (`SPEC-007` §4.3) e a inferência está **certa no rótulo e incompleta
no caminho** — ela não é propriedade do endpoint, é propriedade do **parâmetro**.

## Como foi medido — e por que não precisou do `!forceOrder@arr`

A task propunha comparar com o payload de `!forceOrder@arr`. **Esse oráculo não existe hoje:**
o coletor de `forceOrder` tem `5` runs, **todos `REJECTED` com `n_written = 0`**, e nenhuma
linha em `md.series` `[MEDIDO 2026-09-12, comando na seção "Comandos" abaixo, n=5 runs]`.

Então o falsificador foi construído **sem segunda fonte**, sobre uma propriedade que separa as
duas hipóteses por ordem de grandeza: pedir a **mesma janela de 1 min** para um instrumento caro
(`BTCUSDT`, ~7,7e4 USD) e um barato (`DOGEUSDT`, ~8,5e-2 USD).

- se os valores forem **quote** (nocional USD), os dois caem na **mesma** ordem de grandeza;
- se forem **base** (unidade da moeda), eles se separam pelo **fator do preço**, ~6 ordens.

### O que voltou — `convert_to_usd=false`

| símbolo | `t` | `l` | `s` |
|---|---|---|---|
| `BTCUSDT_PERP.A` | 1789200660 | **0.003** | 0 |
| `BTCUSDT_PERP.A` | 1789202220 | 0 | **0.019** |
| `DOGEUSDT_PERP.A` | 1789203900 | 0 | **49332** |
| `DOGEUSDT_PERP.A` | 1789207320 | 0 | **947120** |

`0.003` contra `947120` — **~8,5 ordens de grandeza**. É o fator do preço, não escala de
nocional. ⇒ **`convert_to_usd=false` devolve BASE.**

### O que voltou — `convert_to_usd=true`, mesma janela, mesmos `t`

| símbolo | `t` | `l` | `s` |
|---|---|---|---|
| `BTCUSDT_PERP.A` | 1789200660 | **231.85380000000004** | 0 |
| `BTCUSDT_PERP.A` | 1789202220 | 0 | **1468.8482** |
| `DOGEUSDT_PERP.A` | 1789203900 | 0 | **4186.313520000001** |
| `DOGEUSDT_PERP.A` | 1789207320 | 0 | **80533.6136** |

Agora `231.85` contra `80533.61` — **mesma ordem de grandeza**, que é a assinatura de nocional.

## O oráculo que fecha a prova — o preço implícito bate com a Binance

Dividir o par (quote, base) do **mesmo bucket** tem de devolver o preço. Se devolvesse outra
coisa, `convert_to_usd=true` não seria `preço × base` e a leitura "quote" cairia.

```
BTCUSDT:  implied=77284.600000  binance_mark=77346.942109  drift= 8.1bp
BTCUSDT:  implied=77307.800000  binance_mark=77346.942109  drift= 5.1bp
DOGEUSDT: implied=0.084860      binance_mark=0.085061      drift=23.6bp
DOGEUSDT: implied=0.085030      binance_mark=0.085061      drift= 3.6bp
```

`[MEDIDO 2026-09-12, n=4 pares em 2 instrumentos]` — desvio **3,6 a 23,6 bp** contra o
`markPrice` de `/fapi/v1/premiumIndex`. ⚠️ O desvio é **esperado e não é erro**: os buckets têm
até 6 h de idade e o `markPrice` é de agora; o que a medição prova é a **razão**, não a
simultaneidade. Um `denom` errado erraria por ordens de grandeza, não por dezenas de bp.

## Por que `quote` e não `base`, agora que as duas estão disponíveis

1. **É a única unidade comparável entre instrumentos.** Somar ou ranquear liquidação de `BTC` e
   de `DOGE` em unidade de moeda não significa nada; o painel de `RF-3` compara instrumentos.
2. **É a direção derivável, e ela é de mão única.** A perna da Binance (`!forceOrder@arr`) traz
   **preço e quantidade**, então o nocional é derivável dela; o inverso **não é** — base sozinha
   não vira USD sem um preço que a fonte não publica. Escolher `quote` mantém a reconciliação
   futura possível `[DOC: tasks.toml T-05.1 refs]`.
3. **Casa com o `[INFERRED]` do `SPEC-007` §4.3**, então a identidade não muda de rótulo.

## O que isto obriga em `T-05.3` e `T-05.5`

- `T-05.3` grava `denom="quote"` na `SeriesKey`.
- `T-05.5` **tem de** montar o path com `convert_to_usd=true`. Um teste tem de **reprovar** o
  path sem o parâmetro — sem isso, o padrão do fornecedor reintroduz BASE em silêncio e a série
  fica com rótulo certo e número errado.

## Comandos (literais) e o universo

```bash
# 1. o oraculo que NAO existe — forceOrder nunca gravou nada (n=5 runs, 0 linhas)
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At \
  -c "select endpoint, verdict, count(*), sum(n_written) from md.ingest_run group by 1,2 order by 1,2;"
#   -> /stream?streams=...forceOrder|REJECTED|5|0

# 2. o falsificador de denom (2 chamadas Coinalyze, espacadas 1,5 s)
python3 scratchpad/denom_probe.py     # universo: 2 instrumentos x 2 valores de convert_to_usd
#   -> BTCUSDT n_points=24, DOGEUSDT n_points=7, em AMBAS as chamadas

# 3. o oraculo de preco (2 chamadas Binance, bucket diferente)
python3 scratchpad/price_oracle.py    # universo: n=4 pares (quote, base)
```

**Cota gasta nesta task: `2` chamadas Coinalyze** `[MEDIDO]`, contra o teto de 40 por janela
deslizante de 60 s — espaçadas em 1,5 s, sem rajada. As 2 chamadas à Binance são de **outro
balde** (`binance-fapi`) e não disputam esta cota.

## Falsificador deste documento

Se uma chamada com `convert_to_usd=true` devolver, para um mesmo `t`, um valor cuja divisão
pela versão `false` **não** fique dentro de ~1% do preço do instrumento naquele bucket, então
`convert_to_usd` não é `preço × base` e esta decisão tem de ser reaberta antes de `T-05.3`.
