# Diagnóstico: a distância entre o CORE e o que existe (2026-09-10)

Universo: stack de produção de pé (`deploy-{api,writer,collector,postgres,redis,web}-1`).

## O CORE declarado pelo owner
gráfico com **volume · open interest · long/short ratio · liquidações · CVD**

## O que md.series contém — a única tabela de dado de série
`[MEDIDO 2026-09-10, n=23.512 linhas]`

    docker exec deploy-api-1 python -c "... select series_key_id,symbol,source,count(*) from md.series group by 1,2,3"

| source | series keys | linhas | símbolos |
|---|---|---|---|
| `/fapi/v1/premiumIndex` | 8 | 23.512 | BTC/ETH/SOL/LINK USDT |
| **todo o resto** | **0** | **0** | — |

**Das 5 métricas do CORE, zero têm uma única linha.** O que é coletado
(premiumIndex = funding/mark price) **não é nenhuma das 5**.

## Por que a tela está vazia
Os 3 painéis do `/symbol` são Preço(klines_last) · Open Interest · CVD.
Nenhum dos 3 tem dado ⇒ `Leitura atual: SEM_PONTO` em todos. Correto, não é bug de render.

## Contabilidade quebrada
`[MEDIDO 2026-09-10, n=2.910 runs]`

    /api/v1/ingest-health → sum n_returned = 2.616.300 · sum n_written = 0 · runs com n_written>0 = 0

`n_written=0` em 100% dos runs **enquanto md.series tem 23.512 linhas** ⇒ o campo
`n_written` não é preenchido pelo caminho de escrita. É o `rc=0` de `ADR-012`:
indistinguível entre "não escreveu" e "não mede".

## Coletor de liquidação morto há ~46h
`[MEDIDO 2026-09-10, n=2 runs]` forceOrder: 2 runs, ambos `REJECTED`,
`n_returned=0`, `api_code=None`, `notes=None`. Janela do 2º run:
`2026-09-08T22:08 → 2026-09-10T19:53`. Zero liquidação capturada, e o veredito
não diz o motivo.

## O log tem número; o formatter o descarta

    single_writer_cli.py:359   logger.info("writer_batch_acked",
                                 extra={"n_accepted":…, "n_rejected":…})
    collectors_cli.py:477      logger.info("collector_cycle_completed",
                                 extra={"endpoint":…, "n_published":…, "verdict":…, "run_id":…})

Os contadores existem e são calculados. Quem os apaga é `ingest_health_cli.py:33` →
`_STABLE_FORMAT = "%(message)s"`, que imprime só a mensagem e descarta todo campo de `extra`.

⇒ O conserto é **uma string de formato**, não instrumentação de dois módulos.

Sintoma observável: `docker logs deploy-collector-1 --since 2h | grep -v
collector_cycle_completed` → **zero linhas**. Não há como medir vazão pelo log.

## O domínio existe; o cano não
`aggtrade_bucket_aggregate.py` · `long_short_ratio_series.py` · `cvd_source_catalog.py` ·
`binance_aggtrade_payload.py` existem em `backend/src/modules/sentimento/domain/`.
Coletores declarados em `infra/`: depth, exchangeInfo, fundingInfo, premiumIndex, time,
openInterestHist(probe), stream. **Nenhum de aggTrades, klines ou long/short.**

## Causa estrutural do "andar em círculo"
A decomposição de `plataforma-dados` é **horizontal** (fase = camada: contrato,
retenção, catálogo, painel, observabilidade). 9 fases APPROVED e **nenhuma fase
jamais precisou de um ponto na tela para passar**. Fatia vertical (1 métrica:
coletor→writer→md.series→API→painel) nunca foi a unidade de fase.
