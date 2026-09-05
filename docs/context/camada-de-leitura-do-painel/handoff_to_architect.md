# Handoff PM → Architect — `camada-de-leitura-do-painel`

**PRD:** [`docs/specs/PRD-003-camada-de-leitura-do-painel.md`](../../specs/PRD-003-camada-de-leitura-do-painel.md) · **Ledger:** `PRD_DRAFT` (advance registrado em 2026-09-04; `harness pipeline show camada-de-leitura-do-painel`) · **Feature filha de `plataforma-dados`** (`relate` no ledger) · **Rev:** `master@c8e7193` · **Tracker:** `local_only` (MCP Atlassian não autenticado; nada criado).

## O que este PRD pede ao `/architect` — em ordem

1. **Gap Analysis do PRD** (peer review). Onde eu não sei, está `[NÃO SEI]` (8 ocorrências) ou `[Q1]`–`[Q10]` (§15). Nenhum foi convertido em `[INFERRED]`; os 7 `[INFERRED]` estão em §12 com custo de reversão.
2. **ADR de `web`** formalizando `RN-1`: Server Component + `import "server-only"` + reescrita do portão ESLint `D5.17b` para morder só em `"use client"`. **Co-assinatura do `quant-architect` é obrigatória** — o instrumento muda, a propriedade `ADR-005/D6.4` é dele. A decisão técnica já foi tomada pelo `frontend-architect` (`REVISAO-FB-frontend-architect.md` §3, com falsificador em 3 casos); o PRD a adota, não a reabre.
3. **Fixar a data do `TBD`** do envelope agregado por série (`[Q7]`, §9) — dono `quant-architect`; F3 não começa sem ele.
4. **SPEC + plano em 3 fases** (`F1` web+infra P0 → `F2` infra → `F3` sentimento+infra+web), ordem obrigatória por §1.3.

## O que NÃO reabrir (§3 do PRD, com rótulo)

BFF recusado `[DECISÃO-OWNER 2026-09-03]` · Caddy **próprio** em `deploy/`, subdomínio existente, **estruturado e não implantado** `[PREMISSA-OWNER 2026-09-04]` + leitura `I-1` · feature filha `[PREMISSA-OWNER]` · `/painel` **não decidido** (owner, `[Q1]`) · `janela_de_perda` no backend (`CLAUDE.md` linha 11) · premissas de infra (VPS compartilhada, só Postgres, R2).

## Onde o PRD diverge dos insumos — para você conferir, não aceitar

- **§1.4:** o e2e `02-rede-e-estados.spec.ts:9` (`isApiLike`, `helpers.ts:50-55`) mede requisições **do browser**; sob Server Component o browser faz 0 por desenho ⇒ o teste **reprovaria a implementação correta**. `CA-F1-1` mede pelo **log de acesso da API** + variação de conteúdo. `[INFERRED I-7]` — não executado contra implementação inexistente. Se você discordar, o CA fica de pé (não depende da inferência).
- **§4.2 corte de escopo `[INFERRED I-2]`:** recursos `2`, `3`, `4c`, `6` **fora** (`NG-3`), sujeito ao menu **M1** do owner. Motivo: cada um exige decisão sua/`ADR-005`/`ADR-002` não tomada, e três ocupam disco/conexão longa.
- **`[GAP G1]`:** `harness policy --key components` devolve **7** (`infra` adotado, `harness.toml:39-46`); `CLAUDE.md` lista 6. Não editei `CLAUDE.md`.
- **`[GAP G2]`:** causa raiz de **0 CSS** no browser não medida (`0 *.css` na árvore; `layout.tsx:3-5` declara fora de escopo de `T-05.11`). `CA-F1-15` precisa do seu diagnóstico.

## Menu do owner (§14) — não decidir por ele

M1 escopo (a/b/c) · M2 prefixo de URL (`/api/v1` proposto) · M3 botão `abrir` sem `RawDataRow` (remover × sem fonte) · M4 auth mínima no Caddy quando implantar · M5 suíte de front em `make verify`. **M1 bloqueia a SPEC**; se o owner não responder, a SPEC pode nascer com (a) declarado como premissa revisável.

## Regras bloqueantes endereçadas

`harness rules list --severity block` → 8; mapeamento em §17 do PRD. A que mais importa: `web-fullstack.browser-imports-server` é a mesma propriedade de `CA-F1-4` (`server-only`).

## Critério de aceite do seu retorno

Veredito `APPROVED`/`NEEDS_FIX` em ≤ 15 linhas, relatório em `docs/context/camada-de-leitura-do-painel/gates/PRD-003-architect.md`. Máximo 3 ciclos antes de escalar ao owner.
