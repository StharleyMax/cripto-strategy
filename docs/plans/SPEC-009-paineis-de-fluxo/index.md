# Plano de execução — `SPEC-009` · Painéis de fluxo

> **SPEC:** [`SPEC-009`](../../specs/SPEC-009-paineis-de-fluxo.md) (`DRAFT`; `SPEC_APPROVED` é gate do **owner**)
> **ADRs:** [`ADR-044`](../../adr/ADR-044-um-grafico-com-panes-nativos-v5-a-legenda-le-o-slot-e-a-perna-long-desce-por-escala-invertida.md) (proposta) · [`ADR-045`](../../adr/ADR-045-candle-de-oi-derivado-e-projecao-na-rota-ancorada-na-fronteira-de-abertura.md) (proposta; a condição foi satisfeita: `[Q-OI-1]` = `O-4`)
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
| `03a` | [`03_oi_candle.md`](03_oi_candle.md) | (dado) coletor de polling de 1 min até `md.series` | `sentimento` · `infra` | — **pode começar**: não toca `SymbolClient.tsx` |
| `03b` | [`03_oi_candle.md`](03_oi_candle.md) | candle de OI colorido por contratos, em dois regimes | `sentimento` · `web` | `03a`, `01` e `04` (por conta do arquivo) |

**Ordem:** `01` → `02` → `04` → `03b`. A `03a` **pode começar já** e andar em paralelo com `01`/`02`/`04`,
porque não toca `SymbolClient.tsx`. Quanto mais cedo o coletor liga, mais história com pavio de 1 min
existe quando o pixel chegar (**zero backfill**, `SPEC-009` §6.1). O teto é de **2** tasks simultâneas
`[DOC: MEMORY.md]`.

⛔ **Um editor de `SymbolClient.tsx` por vez** (`SPEC-009` §8, `D7`). As fases `01`, `02`, `03` (pixel) e
`04` editam o mesmo arquivo de 2.936 linhas `[MEDIDO: wc -l]` e **não andam em paralelo entre si**. As
pernas da `ADR-043` só entram depois da `01` estar mergeada, também em série.

## O que este plano não contém

- Os ramos `O-1`/`O-2`/`O-3` de F3, recusados pelo owner em 2026-09-23 (`[DECISÃO-OWNER: 2026-09-23, escolha entre
  alternativas apresentadas]`), e com eles a emenda de `ADR-036/D2`.
- Marcador de divergência (`NG-1`, `convergencia`), VPVR, Funding, CVD spot, L/S top traders (`NG-2`..`NG-4`).
- Consertar os buracos do OI da Binance (`NG-6`): aqui só se **desenha honesto**.
- Qualquer tarefa no tracker: é trabalho do `/tech-lead`, depois do `approve spec`.
