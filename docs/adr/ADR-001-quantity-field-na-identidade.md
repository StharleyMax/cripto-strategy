# ADR-001 — `quantity_field` é termo de identidade da série

**Data:** 2026-08-25 · **Status:** proposto (o gate `spec` é do owner) · **SPEC:** [`SPEC-001`](../specs/SPEC-001-plataforma-dados.md) §1
**Fase/Epic:** F0 e F1 · `CST-2`, `CST-3` · **Componente alvo:** `sentimento`
**Origem:** pré-condição **bloqueante** carregada pelo gate do PRD (`approve prd`, 2026-08-25T13:40:41Z)

## Contexto

O `aggTrade` da Binance tem **dois** campos de quantidade: `q` e `nq` (quantidade **excluindo ordens RPI**). O REST e o WS trazem os dois; **o dump S3 traz só `q`**.

Medido nesta rodada (comando em `SPEC-001` §1.1, sobre `data/binance/rest/nq_*.json` e `data/binance/aggtrades/`):

| medição | resultado |
|---|---|
| campos REST | `['T','a','f','l','m','nq','p','q']` — oito |
| colunas do dump | sete, **sem `nq`** |
| `q ≠ nq` | DOGEUSDT **16/1000**, déficit **80,56 bp**; BTC/ETH/SOL/XRP **0/1000** |
| `nq > q` | **0/1000** ⇒ déficit **unidirecional** |
| `nq == 0` com `q > 0` | **4 de 16** ⇒ existe aggTrade **inteiramente RPI** |
| `q` mediano dos divergentes | **63.776** contra **6.945** de todos ⇒ **9,2×** |
| lado dos divergentes | **15 de 16 com `m = false`** (compra agressora) |
| **efeito no CVD** | `cvd_delta(q) − cvd_delta(nq) = 243.197` = **6,01% de \|cvd_delta(q)\|**, contra déficit de volume de 243.317 ⇒ **99,95% do déficit cai no CVD** |

## Decisão

1. **`quantity_field ∈ {q, nq, NA}` é termo da `SeriesKey`** — não coluna, não flag, não atributo de catálogo. `NA` é valor explícito para série que não deriva de `aggTrade`.
2. **`quantity_field = q` é o valor canônico do caminho de decisão** (`backtest`, `convergencia`, `scan` com `scope: CrossSection`).
3. **`quantity_field = nq` é série paralela** que existe só para `t ≥ primeira_captura_ao_vivo`.
4. **Proibido emendar.** Leitura sob `nq` de janela anterior à primeira captura devolve `Ausencia = SEM_FONTE` — nunca cai para `q` em silêncio.
5. **`cvd_source` se desdobra em `aggtrade_q` e `aggtrade_nq`**, cada um com erro publicado.
6. **F0 persiste o agregado por bucket de 1 min** — `Σq_buy · Σq_sell · Σnq_buy · Σnq_sell · tx · btx · agg_id_min · agg_id_max` — direto do stream. **Não é captura de tick.**

## Alternativas recusadas, com o custo medido

| alternativa | por que foi recusada |
|---|---|
| **`quantity_field` como coluna, não como identidade** | a mesma `SeriesKey` teria trecho histórico em `q` (dump) e trecho ao vivo em `nq`. `cvd_cum` é soma acumulada e o déficit é **unidirecional** (0/1000 violações de `nq ≤ q`) ⇒ **cresce sem limite dentro da janela da âncora**. Custo medido no ponto de junção: **6,01% do delta por janela** em DOGEUSDT |
| **Eleger `nq` como canônico** (é a grandeza "mais limpa") | **o dump nunca fornece `nq`** ⇒ toda profundidade histórica anterior à primeira captura ao vivo ficaria vazia. Custo: perder 2.183 dias de série para ganhar um filtro |
| **Ignorar `nq` e usar só `q`** | `nq` é **`CL-5`, capture-or-lose**: o dump não tem o campo, o REST devolve **48 h** `[DOC]`. Cada dia não capturado é um dia sem `nq`, para sempre. E a divergência está nos trades **9,2× maiores que a mediana** — exatamente a cauda de que **absorção por tamanho de trade** é lida, a camada que o direcionamento do owner nomeia |
| **Capturar `aggTrade` cru ao vivo para preservar `nq`** | reabre o que `E-07` fechou: **6,93–33,1 MB/dia/símbolo** zipado, ~240 GB/ano a 20 símbolos. O agregado por bucket preserva o que a decisão usa (o owner decide **no fechamento do bucket** `[PREMISSA-OWNER]`) por **ordem de 10² B/bucket e zero chamada nova** |

## Falsificador

**Se, sobre uma janela de captura ao vivo de ≥ 7 dias no conjunto declarado, `count(q ≠ nq) == 0` em TODOS os símbolos e `|cvd_delta(q) − cvd_delta(nq)| == 0` em todos os buckets, então o termo de identidade é custo sem retorno** e `quantity_field` deve voltar a ser coluna informativa.

**Segundo falsificador, de direção oposta:** se `nq > q` aparecer **uma vez**, a premissa de unidirecionalidade cai e a regra `QF-4` (não emendar) passa a ser insuficiente — o déficit deixa de ter direção conhecida e a série `nq` precisa de tratamento de sinal, não só de isolamento.

## Dependência não resolvida, e ela é gate do item 6

**`[NÃO MEDIDO]`: se o WS `<symbol>@aggTrade` carrega `nq`.** Medi no **REST**; `medicao-coinalyze.md` §2.2 afirma REST **e** WS, e eu não reproduzi o WS. **Teste que fecha, segundos de trabalho:** assinar e inspecionar o payload. **Se o WS não trouxer `nq`, o agregador passa a depender de REST com peso e janela de 48 h** — muda o desenho do coletor, **não** o contrato (itens 1–5 sobrevivem às duas respostas).

## Consequências

- `<Anotacao>` (`SPEC-001` §3.6) ganha `quantity_field` na chave de fixture: uma marcação sobre CVD em `q` **não é** a mesma sobre `nq`.
- A fixture envenenada ganha a **classe (c)** (`SPEC-001` §5.1): bucket presente nas duas identidades, leitura sob `nq` fora da janela ao vivo devolvendo `SEM_FONTE`.
- O catálogo publica, por símbolo e por dia, `count(q≠nq)/n` e o déficit em bp. **Sem isso `nq` é nome sem magnitude.**
- **`CL-5` entra na tabela de capture-or-lose**, e o custo de atraso de `Q1` aumenta.
