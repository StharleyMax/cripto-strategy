# Plano de execução — `SPEC-011` · Estrutura do front

> **SPEC:** [`SPEC-011`](../../specs/SPEC-011-estrutura-do-front.md) (`DRAFT` ao nascer. Estado: `harness pipeline state estrutura-do-front`. `SPEC_APPROVED` é gate do **owner**)
> **ADR:** [`ADR-050`](../../adr/ADR-050-indicador-como-modulo-isolado-nucleo-do-grafico-e-catalogo-por-selecao.md) (proposta, com as emendas `E-1`..`E-4`; aceitar é `OWN-1`)
> **PRD:** [`PRD-011`](../../specs/PRD-011-estrutura-do-front.md) · **Gap Analysis:** [`gates/PRD-011-gap-analysis.md`](../../context/estrutura-do-front/gates/PRD-011-gap-analysis.md)
> **Vocabulário:** `harness policy --key components` → `n=7` `[MEDIDO 2026-10-02]`. Todo item declara o seu componente.

## A fase é uma refatoração sem mudança visível, e o portão é a não-regressão

O `DoD-VERTICAL` vira não-regressão (`SPEC-011 §7.1`): nenhuma fase cria dado nem pixel.

| id | item | como verificar |
|---|---|---|
| `DoD-1` | dado e API | não-regressão: as specs de dado real (`08`–`14`) dentro do `make e2e` |
| `DoD-2` | **a tela é a mesma** (`CA-1`) | `make e2e` inteiro verde **e** `git diff --name-status $BASE..HEAD -- frontend/e2e/` sem `M` nem `D` em spec que já existia em `$BASE` |
| `DoD-3` | ⛔ **ablação** | cada fase nomeia a mutação que tem de reprovar o critério dela. Critério que não reprova a própria ablação não conta |
| `DoD-4` | portão | `make verify` verde, rodado com `run_in_background` |
| `DoD-5` | números registrados na PR | `wc -l SymbolClient.tsx`, `B` (bundle, `SPEC-011 §7.4`) e, de F1 a F8, `N_fact` |

**Reprova sempre:** editar spec de e2e existente (`RN-9`) · lógica nova dentro de fatia de movimento (`CA-8`) · `indicators/_shared/` (`RN-5`) · um indicador
importando outro, mesmo que o lint ainda não exista na fatia · identificador novo fora do inglês (tabela de fronteira do `CLAUDE.md`) · qualquer regra,
alvo de `make` ou allowlist **de idioma**.

## As fases

| fase | arquivo | o que entrega | componentes | bloqueada por |
|---|---|---|---|---|
| `00` | [`00_trilhos.md`](00_trilhos.md) | contrato, regra de isolamento (P1–P3), teste de diretório de topo, varredores alargados | `web` | nada. **Corre já, junto da fase `05` de `paineis-de-fluxo`** |
| `01` | [`01_nucleo_para_fora.md`](01_nucleo_para_fora.md) | host, registrar, legenda, marcas para `chart/`; chrome para `chrome/` | `web` · `docs` | `00` **e** a fase `05` em `origin/master` (`SPEC-011 §9`) |
| `02` | [`02_registrar_por_chave.md`](02_registrar_por_chave.md) | registrar por `instanceKey`, `unmount` obrigatório, índice derivado, `refeed` | `web` | `01` |
| `03` | [`03_dado_por_tabela.md`](03_dado_por_tabela.md) | `catalog.ts` nasce como tabela; SSR e pager iteram `series` + `derive` (o núcleo recebe por parâmetro); caracterização SSR = pager | `web` | `02` |
| `04` | [`04_cvd_piloto.md`](04_cvd_piloto.md) | CVD na pasta dele | `web` | `03` |
| `05` | [`05_oi.md`](05_oi.md) | OI na pasta dele | `web` | `04` |
| `06` | [`06_liquidacao.md`](06_liquidacao.md) | liquidação na pasta dela | `web` | `04` |
| `07` | [`07_long_short.md`](07_long_short.md) | long/short na pasta dele | `web` | `04` |
| `08` | [`08_volume_overlay.md`](08_volume_overlay.md) | volume vira overlay do preço; faixa por pedido | `web` · `charts` | `04` |
| `09` | [`09_selecao.md`](09_selecao.md) | `layout.tsx`, reducer, catálogo completo, host guiado pela seleção, handle de e2e | `web` | `05`–`08` |

**Ordem:** `00` já. Depois do merge da fase `05`: `01` → `02` → `03` → `04` em série. `05`, `06`, `07` e `08` correm **no máximo 3 por vez**, e a `08` é a única
que edita `chart/**`. `09` fecha.

**A F10 do PRD não está aqui** (`SPEC-011 §6.5`): ela vai como emenda `A-7` para a `SPEC-010`. Até lá, o pager busca o catálogo inteiro.

## O que este plano não contém

- A UI do seletor (`NG-1`, `O-2`) e qualquer indicador novo (`NG-4`).
- A F10 (`RF-11`, `CA-14`), que vai para a `SPEC-010` (`A-7`).
- As emendas à `ADR-048` e à `SPEC-010` (`SPEC-011 §10`), que são da outra branch.
- Qualquer tarefa no tracker: é do `/tech-lead`, depois do `approve spec`.
