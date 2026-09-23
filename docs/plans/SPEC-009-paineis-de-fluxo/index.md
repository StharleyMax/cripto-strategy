# Plano de execução — `SPEC-009` · Painéis de fluxo

> **SPEC:** [`SPEC-009`](../../specs/SPEC-009-paineis-de-fluxo.md) (`DRAFT`; `SPEC_APPROVED` é gate do **owner**)
> **ADRs:** [`ADR-044`](../../adr/ADR-044-um-grafico-com-panes-nativos-v5-a-legenda-le-o-slot-e-a-perna-long-desce-por-escala-invertida.md) (proposta) · [`ADR-045`](../../adr/ADR-045-candle-de-oi-derivado-e-projecao-na-rota-ancorada-na-fronteira-de-abertura.md) (proposta, condicional a `[Q-OI-1]`)
> **PRD:** [`PRD-009`](../../specs/PRD-009-paineis-de-fluxo.md)
> **Vocabulário:** `harness policy --key components` → `n=7` `[MEDIDO 2026-09-23]`. Todo item declara o seu componente.

## A fase é uma FATIA VERTICAL e termina num pixel com ablação

| id | item | como verificar |
|---|---|---|
| `DoD-1` | dado no Postgres real | `count(*)` de `md.series` `> 0` para as `series_key_id` da fase. Nas fases que não criam dado, é **não-regressão** |
| `DoD-2` | a API serve | `GET /api/v1/series-history` → `n_points > 0` |
| `DoD-3` | **o pixel está na tela** | Playwright contra o **app real** (`make e2e`), assert de **posição** |
| `DoD-4` | ⛔ **ablação** | tira a causa ⇒ o pixel **some**. Pixel que sobrevive à ablação estava desenhando outra coisa |
| `DoD-5` | portão | `make verify` verde, com `__pycache__` purgado antes |
| `DoD-6` | design | veredito do `ux-ui-mastery` sobre a tela do Stitch **e** sobre o screenshot da implementação (`CA-12`) |

**Reprova sempre:** dado sintético no Postgres compartilhado (`D-g`) · `DoD-3` contra mock ou só com
status HTTP · ausência desenhada como zero (`RN-4`) · identificador novo fora do inglês (tabela de
fronteira do `CLAUDE.md`) · qualquer regra, alvo de `make` ou allowlist **de idioma**.

## As fases

| fase | arquivo | o pixel | componentes | bloqueada por |
|---|---|---|---|---|
| `01` | [`01_esqueleto.md`](01_esqueleto.md) | 6 panes num gráfico, um eixo, crosshair e legenda | `web` · `charts` | **spike `T-01.0`** (item 1.0, antes de qualquer linha de produção) |
| `02` | [`02_volume_com_direcao.md`](02_volume_com_direcao.md) | barra de volume com a cor da vela | `charts` · `web` | `01` |
| `04` | [`04_liquidacao_num_pane.md`](04_liquidacao_num_pane.md) | short em cima, long embaixo, no mesmo pane | `web` · `charts` | `01`, e `02` por conta do arquivo (abaixo) |
| `03` | [`03_oi_candle.md`](03_oi_candle.md) | candle de OI colorido por contratos | `sentimento` · `web` (sob `O-2`/`O-4` vira `03a`+`03b`) | ⛔ **`[Q-OI-1]` do owner**, e `01` |

**Ordem:** `01` → `02` → `04`. A fase `03` entra assim que `[Q-OI-1]` for respondida. **A parte de backend
dela** (projeção em `sentimento`, ou coletor em `03a`) **pode andar em paralelo** com `02`/`04`, porque
não toca `SymbolClient.tsx`. **O pixel dela vem depois de `04`.** O teto é de **2** tasks simultâneas
`[DOC: MEMORY.md]`.

⛔ **Um editor de `SymbolClient.tsx` por vez** (`SPEC-009` §8, `D7`). As fases `01`, `02`, `03` (pixel) e
`04` editam o mesmo arquivo de 2.936 linhas `[MEDIDO: wc -l]` e **não andam em paralelo entre si**. As
pernas da `ADR-043` só entram depois da `01` estar mergeada, também em série.

## O que este plano não contém

- **Escolher `[Q-OI-1]`/`[Q-OI-2]`**: são do owner (`SPEC-009` §6.1, §11).
- Marcador de divergência (`NG-1`, `convergencia`), VPVR, Funding, CVD spot, L/S top traders (`NG-2`..`NG-4`).
- Consertar os buracos do OI da Binance (`NG-6`): aqui só se **desenha honesto**.
- Qualquer tarefa no tracker: é trabalho do `/tech-lead`, depois do `approve spec`.
