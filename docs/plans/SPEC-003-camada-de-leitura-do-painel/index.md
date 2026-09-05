# Plano de execução — `SPEC-003` · Camada de leitura do `/painel`

**SPEC:** [`SPEC-003`](../../specs/SPEC-003-camada-de-leitura-do-painel.md) (**`SPEC_DRAFT`** — o gate do owner ainda não aconteceu; `harness pipeline state camada-de-leitura-do-painel`)
**ADRs:** [`ADR-028`](../../adr/ADR-028-leitura-do-painel-em-server-component-e-o-portao-de-d6-4-medido-pela-propriedade.md) (proposta; co-assinada pelo `quant-architect` em 2026-09-04) · [`ADR-029`](../../adr/ADR-029-topologia-da-camada-de-leitura-caddy-proprio-mesma-origem-por-caminho-e-readiness-que-discrimina.md) (proposta)
**PRD:** [`PRD-003`](../../specs/PRD-003-camada-de-leitura-do-painel.md) · **Feature:** `camada-de-leitura-do-painel` (filha de `plataforma-dados`) · **Rev de ancoragem:** `master@c8e7193` · **Data:** 2026-09-04
**Tracker:** `local_only` (MCP Atlassian não autenticado nesta sessão); UVs candidatas em `PRD-003` §6; materialização é ato do `/tech-lead` após `SPEC_APPROVED`.

---

## As três fases, a ordem e o que M1 escolhe

| fase | entrega | componente alvo | requisitos | depende de | entra? |
|---|---|---|---|---|---|
| [`01`](01_pagina_diz_a_verdade.md) | **A página diz a verdade** — Server Component + `server-only`, estados de sistema, fixture fora, CSS no browser, `.env.example` + `make api`, e2e reescrito | `web` (itens P0 de alcançabilidade: `infra`) | `US-1`..`US-4`; `RF-1`..`RF-5`, `RF-10`, `RF-12`; `RN-2`..`RN-5`, `RN-7` | — | **sempre** (M1) |
| [`02`](02_api_alcancavel_e_honesta.md) | **A API é alcançável e honesta** — boot que recusa, `/ready`, `ETag`/`304`, `API_PREFIX`, `compose.yml` + `Caddyfile` estruturados | `infra` (valor do `ETag`: `sentimento`, já existe) | `US-5`..`US-8`; `RF-6`..`RF-8`; `RNF-3`, `RNF-5`; `RN-6`, `RN-9` | `01` (em medição: `CA-F1-1` prova o consumo do `ETag`) | se o `approve spec` disser *"F1+F2"* ou *"F1+F2+F3"* |
| [`03`](03_recursos_baratos.md) | **Os recursos baratos entram pelo caminho decidido** — catálogo, quarentena, agregado por série, locale único | `sentimento` + `infra` + `web` | `US-9`..`US-12`; `RF-9`, `RF-11`; `RN-8` | `02` (prefixo, `create_app` que recusa) **e** a ADR do `quant-architect` sobre o agregado (até 2026-09-11) | se o `approve spec` disser *"F1+F2+F3"* |

**Por que a ordem é obrigatória e não é cerimônia** (`PRD-003` §1.3): a raiz do defeito é uma **decisão não tomada** (onde a leitura acontece) — `01` a executa. Sem `01`, `02` produz `ETag` e `/ready` que ninguém consome, e `03` produz rotas que a tela não lê: seria repetir `T-05.9`/`T-08.11`, que fecharam `done` com metade cliente só (`05_fatia_visivel.md:217-225`). A experiência (CSS, estados) vem **dentro** de `01`, não antes — o gate de UX chamou corrigir a pintura antes do dado de *"pintura sobre dado falso"* (`REVISAO-FB-ux-gate` Rec. 1).

**Fase não aprovada em M1 não é apagada:** fica neste plano como **declarada**, com custo, para virar feature filha ou ser aprovada depois — nada de `01` é jogado fora em nenhuma combinação.

---

## As regras que valem em TODAS as fases

**`R-A` · Todo DoD nomeia o comando e o universo.** *"Testes passam"* não é DoD; *"`<comando>` verde sobre `n` casos"* é.

**`R-B` · Todo DoD tem a coluna "servidor ausente" — e ela dá veredito DIFERENTE.** É `RN-7` do PRD e o falsificador de `05_fatia_visivel.md:225`: *"se o teste novo passar com o servidor no chão, o item novo repetiu o defeito que ele existe para consertar"*. DoD de estrutura (compose, Caddyfile) e de ausência de fixture **declaram** que não medem comunicação — e por isso nunca fecham uma fase sozinhos.

**`R-C` · Zero código no Next além de renderizar.** `find frontend/src/app -name route.ts | wc -l` = 0 em toda fase (`ADR-005/D5`, `[DECISÃO-OWNER: 2026-09-03]`).

**`R-D` · Nenhuma implantação.** `docker compose config -q` e `caddy validate` são o teto (`RN-9`, `[PREMISSA-OWNER: 2026-09-04]` *"n vamos subir agora"*).

**`R-E` · Forma e microcopy são do `ui-designer` com gate `ux-ui-mastery`** (`CLAUDE.md` §Design). O plano fixa o **contrato de estado** (`data-fact`); o gate registra o veredito em `docs/context/camada-de-leitura-do-painel/gates/`. Silêncio do owner não é aprovação; aprovação é o veredito do validador.

**`R-F` · Idioma.** Código, mensagem de exceção, evento de log e chave de `extra={}` **novos** em inglês; string de UI em pt-BR; `janela_de_perda` intocada (`CLAUDE.md` tabela de fronteira, linhas 1, 8, 10, 11 + §mensagem de exceção).

**`R-G` · Verificação é `make verify`** (saída em disco, ~10 linhas) — mais os alvos de front declarados por fase (`make e2e`, `npm --prefix frontend run test:s1`), que **não** estão em `verify` até o owner decidir M5.

**`R-H` · O subagente devolve ponteiro, não relatório** (`docs/protocolo-de-despacho.md` R1–R7). Relatórios em `docs/context/camada-de-leitura-do-painel/gates/`.

---

## O que este plano NÃO faz

- Não cria tasks (`/tech-lead`, após `SPEC_APPROVED`) nem UVs no tracker.
- Não decide M1–M5 nem `[Q1]`–`[Q11]` — estão no cabeçalho da `SPEC-003` para o `approve spec`.
- Não implanta, não renomeia `/painel`, não toca as 15 colunas, não escreve coletor.
