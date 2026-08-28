# Fase 09 — Consolidação de fronteira

**Epic:** `CST-7` (F5b) · **Componente alvo: `docs`** · **Gate: nenhum**
**Depende de:** `04`, `06`, `07`, `08` — **por construção: consolida o que elas decidiram.**

**Por que é Epic separado de `01`:** `01` (F5a) e esta (F5b) têm **o mesmo componente e prazos OPOSTOS** — `01` fecha (na parte que gateia, `T-01.1`) **antes de `02`** — `D-1` (owner, 2026-08-28 — [registro](../../context/plataforma-dados/decisoes-de-execucao-2026-08-28.md) §2) —, esta só fecha **depois de `08`**. Um Epic único atravessaria o projeto **sem DoD encerrável** e tornaria impossível representar no board que **F5a gateia F0**.

## Itens

| # | item | requisito | componente |
|---|---|---|---|
| 9.1 | Os **nove ADRs** desta rodada numerados, referenciados pelas fases e **cada um com falsificador** | `CA-F5-2` | `docs` |
| 9.2 | **Nenhuma decisão de fronteira sem ADR** — varredura das fases `04`–`08` | `CA-F5-2` | `docs` |
| 9.3 | `env ∈ {mainnet, testnet, demo, replay}` em **toda** linha de ordem/fill, com chip no chrome desde a primeira tela que exibir fill | `CA-F5-3` | `docs` |
| 9.4 | Registro consolidado de `ADR-004` (a **decisão** é gate de `03`; o registro é aqui) | `ADR-004` | `docs` |
| 9.5 | Registro do **finalista** do motor, com os números que o spike de `08` produziu | `ADR-002`/D4 | `docs` |
| 9.6 | Decisão sobre o componente `infra` **registrada** — adotada ou recusada, **com o motivo escrito** | `ADR-009`/D5 | `docs` |
| 9.7 | Runbook de **uma página** para "coletor parado", e a declaração de **quem é notificado em segundo lugar** | `[GAP G5]` | `docs` |
| 9.8 | `docs/INDEX.md` atualizado, append-only | — | `docs` |

## DoD — comando e universo

| # | critério | comando | universo |
|---|---|---|---|
| **D9.1** | todo ADR referenciado existe e tem número | varrer `docs/plans/SPEC-001-plataforma-dados/*.md` por `ADR-` e conferir contra `ls docs/adr/` | **9 ADRs**; **zero referência órfã** |
| **D9.2** | **todo ADR tem falsificador** | `grep -c "^## Falsificador" docs/adr/*.md` | **≥ 1 por arquivo.** ADR sem falsificador é justificativa, não decisão registrada |
| **D9.3** | `env` é obrigatório | teste que **rejeita linha de ordem/fill sem `env`** | **≥ 1 caso negativo** |
| **D9.4** | o finalista de motor está registrado **com números medidos**, não com preferência | ler `ADR-002` atualizado | **`free -m`, `df -h`, região, e os 5 critérios do spike** — todos com valor |
| **D9.5** | `G5` fechado | ler o runbook | **1 página**, com o passo que **reduz a perda**, e **o segundo destinatário nomeado** (ou a aceitação explícita e escrita do risco) |
| **D9.6** | a decisão de `infra` está escrita nas duas direções possíveis | ler | adotado **ou** recusado, **com o motivo** — **nunca ausente** |

## Não faz

Não escreve código de produção, **não altera contrato de dados** (isso é `04`/`06`), não decide política de coleta, **não aprova a SPEC**.

## Falsificador da fase

**`D9.2`.** Se qualquer ADR desta rodada não tiver seção de falsificador, o corpo de ADRs é um conjunto de justificativas — e a próxima pessoa não terá como saber qual delas já foi refutada pelos fatos.
