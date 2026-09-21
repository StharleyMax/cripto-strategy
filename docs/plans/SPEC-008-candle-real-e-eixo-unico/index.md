# Plano de execução — `SPEC-008` · Candle real e eixo único

> **SPEC:** [`SPEC-008`](../../specs/SPEC-008-candle-real-e-eixo-unico.md) (`DRAFT` — `SPEC_APPROVED` é gate do **owner**)
> **ADR:** [`ADR-040`](../../adr/ADR-040-reagregacao-na-rota-supported-interval-vira-conjunto-e-a-funcao-e-de-nature-e-reduction.md) (proposta)
> **PRD:** [`PRD-008`](../../specs/PRD-008-candle-real-e-eixo-unico.md)
> **Vocabulário de componentes:** `harness policy --key components` → **n=7** `[MEDIDO 2026-09-19]`. Toda fase declara o seu.

## A unidade de fase é a FATIA VERTICAL

`coletor → escritor → md.series → /api/v1/series-history → painel com PIXEL visível`.
**Elo ausente ⇒ fase incompleta**, mesmo com os outros quatro verdes.

## O `DoD-VERTICAL` desta feature: fase = **um pixel**, e ele tem ablação

Os cinco pixels são os falsificadores `P1`..`P4` do `PRD-008` §2 mais o `P5` que o requisito novo do
owner (história sob demanda) trouxe. **Um por fase.**

| id | item | como cala |
|---|---|---|
| `DoD-1` | dado no Postgres real | `count(*)` de `md.series` para a `series_key_id` da fase **> 0** |
| `DoD-2` | a API serve | `GET /api/v1/series-history` → `n_points > 0` |
| `DoD-3` | **o pixel está na tela** | Playwright contra o **app real**, assert de **posição** |
| `DoD-4` | ⛔ **ablação** | removida a causa, o pixel **some**. Pixel que sobrevive à ablação estava desenhando outra coisa |
| `DoD-5` | portão | `make verify` verde, com `__pycache__` purgado antes |

⛔ **`Assert de DOM não prova pixel`** — elemento pode passar em tudo e não existir na tela
`[DOC: MEMORY.md]`. `DoD-3` sem `DoD-4` é verde falso, e esta casa já pagou por ele.

**Reprova sempre:** `[P-seed]` violado (dado sintético no Postgres compartilhado) · `DoD-3` contra
mock ou só status HTTP · ausência renderizada como zero (`RN-1`) · qualquer
`[[rules.own]]`/alvo de `make`/allowlist **de idioma** (`PRD-002`/`RN-4`) · identificador novo fora
do inglês (tabela de fronteira do `CLAUDE.md`; `sentimento` é a exceção declarada).

## As cinco fases, na ordem e com a dependência que a produziu

| fase | arquivo | o pixel | componentes | bloqueada por |
|---|---|---|---|---|
| `01` | [`01_vela.md`](01_vela.md) | `P1` corpo e pavio | `sentimento` · `web` | — **pode começar** |
| `02` | [`02_eixo_unico.md`](02_eixo_unico.md) | `P2` pan move os cinco | `web` · `charts` | ✅ `[M-4]` **fechado** |
| `03` | [`03_timeframe.md`](03_timeframe.md) | `P3` TF reagrega todos | `sentimento` · `web` | ✅ `[M-3]` **fechado** |
| `04` | [`04_oi_honesto.md`](04_oi_honesto.md) | `P4` rótulo soletra os 3 termos | `web` | — independente |
| `05` | [`05_historia_sob_demanda.md`](05_historia_sob_demanda.md) | `P5` a parede é **dita** | `web` · `sentimento` | fase `02` (precisa do eixo) |

**Ordem recomendada:** `01` → `04` (independentes entre si, podem ir em paralelo; teto de **2**
tarefas simultâneas `[DOC: MEMORY.md]`) → `02` → `03` → `05`.

`01` primeiro porque é o único que entrega o que o owner anotou com `CANDLE?` em vermelho.

> ✅ **Os dois julgamentos delegados VOLTARAM em 2026-09-19** e `[M-3]`/`[M-4]` estão fechados
> (`SPEC-008` §5 e §6). Nenhuma fase segue bloqueada por julgamento.

## ⛔ Duas correções que os julgamentos trouxeram e que MUDAM este plano

**1. A fase `02` ganhou um pré-requisito dentro dela: unificar a grade ANTES de ligar o eixo.**
Os painéis **já não compartilham grade** — `oi_slots:1152` contra `price_slots:5760`, porque
`s2-panels.ts:135` usa `FIVE_MINUTES_MS` e `:125` usa `ONE_MINUTE_MS` `[MEDIDO 2026-09-19]`.
Ligar `subscribeVisibleLogicalRangeChange` sobre grades divergentes sincroniza painéis **mostrando
instantes diferentes** — *"um defeito pior que o atual, porque parece consertado"*.

**2. `CA-5` foi RETIRADO e substituído por `CA-5a`..`CA-5d`** (`SPEC-008` §9.1): a contagem de
`grep` **não distingue o desenho correto da malha ingênua** — os dois dão `1` `[MEDIDO 2026-09-19:
loop-probe.mjs, 30 escritas com 1 ocorrência textual]`.

## ⛔ Dois achados ESCALADOS, fora do escopo — mas um deles tem DoD nesta feature

- **`[M-9]`** `klines_volume` armazenado **subestima a origem** (−2,2% a −4,5%, **`pos=0` em 4/4**,
  `n=960` comparações) `[MEDIDO 2026-09-19]` — assinatura de snapshot intrabarra gravado como
  `final_only`. ⚠️ **A vela de `01` anda no MESMO coletor** ⇒ pode herdar o defeito, e um `HIGH`
  subestimado é pavio encurtado que ninguém vê. **A fase `01` ganha o DoD 9 para detectá-lo**;
  a causa raiz é de `/architect`/`ADR-034`.
- **`[M-10]`** `SEM_PONTO` ambíguo entre *"zero legítimo"* e *"não lemos"*. Dono `/architect`.

## O que este plano NÃO contém, e por quê

- **`F5` do `PRD-008`** (OI agregado multi-exchange em nocional USD) — fora. `[Q1]` foi resolvida
  para **C1** (a origem, com rótulo honesto) por **`[DECISÃO-OWNER: 2026-09-19, escolha entre
  alternativas apresentadas]`** — **não** por dedução de agente; `ADR-036/D2` não é reaberta.
  ⛔ **Fora por DECISÃO, não por inferência:** volta ao plano **só por nova decisão do owner**,
  não por argumento novo (`SPEC-008` §8.1 / `[M-2]`).
- **SMC, VPVR, funding** — `NG-1`/`NG-2`/`NG-3` do `PRD-008`.
- **Renomear os 4 eventos de log em português** — `NG-7`, linha 10 do `CLAUDE.md` é prospectiva.
- **Fechar `T-07.15`/`T-07.16`/`T-07.17` da mãe** — `NG-8`, são de `plataforma-dados`.
