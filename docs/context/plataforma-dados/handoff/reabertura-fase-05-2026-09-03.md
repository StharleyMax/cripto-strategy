# Reabertura da fase `05` — itens NOVOS para a superfície servida

**Autorização do owner, 2026-09-03, literal:**

> *"Pode reabrir a fase5. São novas tasks, o que ta em done continua done, as novas tasks
> sinalizam as mudanças. Espelhe as decisoes no jira e nos artefatos de engenharia."*

`[PREMISSA-OWNER: 2026-09-03]`

**A cláusula que restringe o ato, e ela é literal:** *"o que ta em done continua done"*. Nenhum item
`5.1`–`5.12` é reescrito, nenhum DoD `D5.x` existente é alterado, nenhuma task `done` é reaberta.
**Os itens novos SINALIZAM a mudança** — numeração continua de `5.13` em diante.

## O que já está decidido e NÃO se reabre

`docs/decisoes-do-owner.md` §`2026-09-03 · A4/A6/A7`, rótulo
`[DECISÃO-OWNER: 2026-09-03, escolha entre alternativas apresentadas]`:

- **`A4`** — **FastAPI é a única porta de leitura.** As duas rotas de `ADR-005/D1` (HTTP endereçável
  por conteúdo para histórico; SSE para a borda direita) vivem no backend. `Next` renderiza e, se
  precisar, **proxia sessão/auth apenas — zero SQL, zero regra de domínio, zero subprocess.**
  ⇒ o componente `infra` **não nasce** por esta decisão; `ADR-009/D5` continua aberto (⛔ owner).
- **`A6`** — `web` ganha **arquiteto de front próprio**; a dupla `frontend_builder`/`frontend_qa` é
  portada do `anything` (`.github/agents/`); o `ui-designer` **mantém o `design_gate`** e deixa de
  ser `architect` de `web`. Sucede `Q16` **sem apagá-la**; `charts` intocado.
- **`A7`** — esta reabertura.

## ⏳ O que está EM VOO agora — não toque

**`docs/adr/ADR-005-*.md` está sendo emendado pelo `quant-architect` nesta mesma hora** (fronteira de
processo `A4` + decisão de `A5`, o schema da RESPOSTA da rota de histórico). **NÃO edite `ADR-005`.**
Onde um item novo depender do schema, **cite a emenda como dependência e declare `[NÃO SEI]`** em vez
de decidir — `A5` é do `quant-architect`, não deste despacho.

## Os fatos medidos que os itens novos têm de cobrir

`[MEDIDO 2026-09-03]`, do parecer `gates/consulta-fronteira-web-2026-09-03.md`:

1. **`grep -rn 'fastapi\|FastAPI\|APIRouter\|flask' backend/ -l` → `rc=1`, zero arquivos.** O
   diagrama [`arquitetura-fluxos.md:48-56`](../../arquitetura-fluxos.md) desenha
   `API["porta de leitura"]` **dentro** de `BACK["backend/ · Python + FastAPI"]`, com a aresta
   `API --> WEB --> CH`. O container nunca foi construído.
2. **`grep -n '"react"' frontend/package.json` → `rc=1`.** Sem `next`, sem `react`, sem
   `tsconfig.json`, sem script `dev`/`build`. `grep -rn 'from "react"' frontend/src | wc -l` → **0**,
   com **3 `.tsx`/409 linhas** existentes.
3. **`grep -niE 'next\.js|scaffold|create-next' tasks.toml` → 0** (n=81 tasks). O scaffold **não tem
   item em nenhuma das 9 fases** — a omissão é o achado, não a rota (a rota **está**: item `5.12`
   → `T-05.9` `done`; item `8.8` → `T-08.11` `done`, **as duas com metade cliente só**).
4. **`frontend/src/features/s1-console/ingest-health-query.ts` chama `ingest_health_cli.py` por
   `spawnSync`** (linhas 1-16 declaram a fronteira). `spawnSync` **não existe em browser** ⇒ aquele
   caminho nunca vira produção. E ele **conta como produção hoje**: `frontend/src/` casa
   `include_prefixes` e **não** casa `test_globs`.
5. **162 de 500 linhas (32,4%) daquele módulo morrem** quando a rota existir; **~250 sobrevivem
   reféns** do schema que `A5` decide.
6. **`createHash` (`node:crypto`) é síncrono; `crypto.subtle.digest` é assíncrono** ⇒
   `fingerprint(): string` vira `Promise` e **o falsificador de `ADR-008/DoD-2` fica assíncrono.**
   `grep -rln 'createHash' frontend/src | grep -v test` → **2 de 35**.
7. **1 de 10 ports Python→TS tem testemunha cruzada executável**; `grep -rln frontend backend/tests`
   → `rc=1`, zero. **`A1`–`A3` são do `quant-architect`** — não os decida aqui.
8. **`harness.toml:643-645`** põe `web.architect = ".claude/agents/ui-designer.md"`. O conjunto de
   papéis de `[agents.by_component]` é **ABERTO** (`lib/policy.py:549-550`) ⇒ `web.builder`/`web.qa`
   são declaráveis **sem mudar o plugin**.

## O que se pede — itens de plano, com DoD por comando

Escreva os itens novos em `docs/plans/SPEC-001-plataforma-dados/05_fatia_visivel.md`, de `5.13` em
diante, **na forma que a fase já usa** (tabela `# | item | requisito | componente` + tabela
`DoD — comando e universo` + falsificador). Cobertura mínima esperada, e a decomposição é sua:

- **o container FastAPI** (fato 1) e a rota de histórico servida — DoD que **prova pela rede**, não
  por subprocess;
- **o scaffold Next** (fato 2), incluindo `tsconfig.json` e o gate de tipo que hoje não existe
  (`T-07.14` mediu `tsc --noEmit --strict` **uma vez à mão**, sem gate);
- **a saída do `spawnSync` do universo de produção** (fatos 4 e 5) — ele vira teste de contrato ou
  morre; diga qual, e o comando que prova;
- **`A6` materializado** (fato 8): os dois agents portados + as chaves de `[agents.by_component]`.
  **⚠️ Julgue se este item pertence a `05` ou à fase `01`** — `T-01.2`/`T-01.3` (as tasks de `Q16`)
  **já gateiam a `05`**, e `A6` sucede `Q16` na mesma chave. Se for `01`, diga, **e não o escreva
  lá**: reabrir uma segunda fase é ato de owner que ele não autorizou.
- **o `principal_id`** de `5.11` continua valendo — não o reabra; se a rota servida ressuscitar a
  metade de auth que `5.11` rebaixou, **declare a pergunta ao owner**, não a decida.

## Restrições

- **NÃO** toque `ADR-005` (em voo), `tasks.toml`, ledger, Jira, `harness.toml` nem código. Task é ato
  do `/tech-lead`; Jira vem depois dele.
- **NÃO** reescreva item nem DoD existente da fase `05`. Só acrescente.
- Todo número com o comando e o `n`. `[NÃO SEI]` explícito, com o dono da decisão.
- Se decidir que algo exige ADR nova, **escreva a ADR** com seção de falsificador (`D9.2`) — mas
  **nunca em `ADR-005`**.
- Devolva **no máximo 15 linhas**: itens criados (números), o que virou pergunta de owner, e os
  caminhos. NUNCA cole o corpo.
