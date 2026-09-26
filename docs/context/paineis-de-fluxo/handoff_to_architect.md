# `paineis-de-fluxo` — handoff do `/pm` para o `/architect`

**PRD:** [`docs/specs/PRD-009-paineis-de-fluxo.md`](../../specs/PRD-009-paineis-de-fluxo.md) · **estado ao entregar:** `PRD_DRAFT`
**Entrada:** [`handoff/DISCOVERY.md`](handoff/DISCOVERY.md) + a imagem em `handoff/referencia/`

## 1. Antes de abrir o PRD — a correção que muda o tamanho de F3

⭐ **O DISCOVERY dizia que a OI OHLC da Coinalyze *"já é capturada"*. Não é.** As 16 entradas
(`coinalyze·sum_open_interest·5m·OPEN/HIGH/LOW/CLOSE` × 4 símbolos) estão no catálogo e têm **zero
linha** em `md.series`, em todos os símbolos `[MEDIDO 2026-09-23 — PRD-009 §1.2 M2, com o SQL]`.
⇒ um candle de OI com pavio real **não é só `web`**: ou deriva da Binance (O-1), ou exige coletor
novo (O-2, e F3 vira duas fases). Menu com custo em PRD-009 §13-A; **a escolha é do owner**.

E o OI da Binance tem **14,2% de buckets ausentes em 7 dias**, maior buraco ~18 h (M3). O candle vai
mostrar isso — `RN-2` proíbe costurar o buraco.

## 2. As decisões que são suas (ou que você delega), e o PRD não tomou

| id | decisão | onde |
|---|---|---|
| `Q-ARQ-1` | 1 `createChart` com panes nativos v5 (S-1) × 6 charts estilizados (S-2) — **`frontend-architect`** | §13-B |
| `Q-SEQ-1` | sequência contra as pernas de `ADR-043` (proposta, mesmo `SymbolClient.tsx` de 2.936 linhas) | §4.2, §14 |
| contrato | `OiCandle` e onde o OHLC é montado (rota × browser), sob `ADR-040` | §9 |
| `Q-LIQ-1` | a convenção de cor/lado da liquidação, com fonte lida — **`quant-architect`** | §14 |
| O-2 × `ADR-036/D2` | se *"OHLC de OI não existe na origem"* satisfaz o teste do terceiro — **`quant-architect`** | §13-A, `D-c` |

## 3. Fronteiras que a SPEC deve honrar

- `D-a` (OI na origem, contratos) é **`[DECISÃO-OWNER: 2026-09-19]`** — só o owner reverte (§13-C).
- Liquidação: duas pernas, nunca líquido (`RN-3`); ausência ≠ zero sobrevive à fusão (`RN-4`).
- F1 migra os panes **sem mudar forma** — layout numa fase só, para não ter dois layouts na tela.
- Non-goals: marcador de divergência (`convergencia`), VPVR, Funding, CVD spot, L/S top traders.

## 4. O falsificador que a SPEC herda — pixel, com ablação

§10: `CA-1`..`CA-12`, cada um com a mutação que tem de reprovar. `CA-7` exige na janela **ao menos um**
bucket em que preço e OI divergem de sinal — senão o teste não distingue "colorido pelo OI" de
"colorido pelo preço" e é **inconclusivo**, não verde.

## 5. Peer review que o `/pm` pede

1. A ordem F1 (esqueleto) → F2 (volume) → F3 (OI) → F4 (liquidação) respeita `DoD-VERTICAL`? F1 não
   cria métrica; o argumento de fazê-la fase própria está em §5/F1 e `I-4`.
2. RF-4 (legenda segue crosshair) é trivial em S-1 e código novo em S-2 — isso pesa em `Q-ARQ-1`.
3. O teto de latência (`G-3`/`PRD-008 [Q5]`) segue sem número; F1 mede a baseline.
