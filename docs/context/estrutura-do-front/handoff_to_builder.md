# Handoff ao builder — `estrutura-do-front`

> ⛔ **Só vale depois de dois atos do owner**: `approve tasks` (a narrativa) e o gate `build`. Confira antes de começar:
> `harness pipeline state estrutura-do-front` tem de dizer `BUILD_AUTHORIZED`. Com outro estado, não escreva código.

- **Agente:** `frontend-builder` em todas as 32 tasks (`harness policy --key agents`).
- **Dado de máquina:** [`tasks.toml`](tasks.toml) (`harness tasks list estrutura-do-front`). **Racional:** [`gates/TECH-LEAD-narrativa.md`](gates/TECH-LEAD-narrativa.md).
- **Entrada técnica:** [`SPEC-011`](../../specs/SPEC-011-estrutura-do-front.md), o plano da fase em [`docs/plans/SPEC-011-estrutura-do-front/`](../../plans/SPEC-011-estrutura-do-front/index.md),
  [`ADR-050`](../../adr/ADR-050-indicador-como-modulo-isolado-nucleo-do-grafico-e-catalogo-por-selecao.md), e a receita do `CA-8` no estudo §5
  ([`gates/FRONTEND-ARCH-estudo.md`](gates/FRONTEND-ARCH-estudo.md)).
- **O que pode começar primeiro:** `T-00.1`, `T-00.2` e `T-00.3`, em paralelo. Nenhuma das três toca os 47 arquivos de `frontend/` da `wave/paineis-f05`.
- **O que não começa:** nada de F1 em diante antes de `G-2`. A `T-01.1` mede essa condição e devolve **BLOQUEADA** se ela não estiver satisfeita.
- **Em toda task:** o `refs` traz `e2e:`, `numstat:` e `ablação:`, e o relatório só fecha com os três medidos. `$BASE` = `git merge-base HEAD origin/master` no
  início da task. A verificação é `make verify` com `run_in_background`, e no laço de desenvolvimento usa-se `make test-fast K=<filtro>`.
- **Reprova sempre:** editar spec de e2e existente (`RN-9`), lógica nova numa fatia de movimento (`CA-8`), `indicators/_shared/` (`RN-5`), um indicador
  importando outro, identificador novo fora do inglês, e qualquer regra ou allowlist de idioma.
- **Passou de ~150 turnos:** escreva o estado em `docs/context/estrutura-do-front/handoff/<TASK>.md` e devolva.
- **Tracker:** nenhuma task cardada ainda (`untracked_note`). Se ainda estiver assim quando você começar, avise no QA Gate Context Block.
