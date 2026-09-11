# Inventário de código por métrica do CORE — o que existe antes de a feature começar

`[MEDIDO 2026-09-10]` Contagem de **arquivos que citam o termo**, por camada, sob
`backend/src/modules/sentimento/`. Entrada para o `/architect` dimensionar as fatias.

    for m in kline openinterest 'long_short\|longshort' forceorder aggtrade; do
      for l in domain infra use_cases; do
        grep -rli "$m" backend/src/modules/sentimento/$l --include='*.py' | wc -l
      done
    done

| métrica do CORE | termo | domain | infra | use_cases | linhas em `md.series` |
|---|---|---:|---:|---:|---:|
| **volume** | `kline` | 3 | **0** | 1 | **0** |
| open interest | `openinterest` | 6 | 3 | 0 | **0** |
| long/short ratio | `long_short` | 6 | 1 | 0 | **0** |
| liquidações | `forceorder` | 6 | 7 | 5 | **0** |
| CVD | `aggtrade` | 15 | 9 | 2 | **0** |

⚠️ **Contagem de arquivos que CITAM o termo, não de funcionalidade pronta.** Um arquivo de
`infra` pode ser probe descartável, não coletor de produção — foi o caso de
`openInterestHist`, que aparece como `probe` em `collectors_cli.py`. Não trate esta tabela
como estimativa de esforço sem abrir os arquivos.

## O que a tabela mostra

**Volume (klines) — a fatia 1 — tem `infra = 0`.** Não existe cliente HTTP de
`/fapi/v1/klines` em lugar nenhum.

**E não existe métrica de volume em catálogo nenhum.**
`grep -rnoE '"(volume|sum_volume|base_volume|quote_volume)"' backend/src` devolve **zero
linhas** `[MEDIDO 2026-09-10]`. `build_klines_last_entry` (`price_source_catalog.py:163`) é a
série de **preço**, não de volume — o docstring é explícito: *"the negotiated-price series …
`Reduction.LAST`: the last trade price of the 5-minute bucket"*.

⇒ **A fatia 1 cria a identidade de série, não a herda.**

E `interval` entra no `sha256` da identidade: `klines_last`/`sum_open_interest` estão declarados
em **`5m`** numa rota que só serve **`1m`** — o que virou a regra `RN-S1` da `SPEC-007`.

`[INFERRED: é a assinatura da decomposição horizontal descrita no DIAGNOSTICO — o catálogo de
preço foi entregue antes de qualquer coletor existir para qualquer métrica]`.

## Consequência para o sequenciamento

A fatia 1 não é "ligar um cano existente": é **escrever o coletor de klines do zero e negociar
a identidade de série de volume**, que não existe em catálogo nenhum. As duas coisas, não uma.

O que ela ganha de volta: `/fapi/v1/klines` traz `takerBuyBaseVol` no índice `[9]` ao lado de
`volume` no `[5]`, então o **mesmo cliente serve a fatia 2 (CVD)** — que passa a não introduzir
capacidade nova. Ver [`ACHADO-KLINES-CVD.md`](ACHADO-KLINES-CVD.md).
