# WI-REVIEW — revisão arquitetural da trilha WI (idle-in-transaction da API)

**Veredito: COMPLIANT** (= APPROVED para o workflow). 0 BLOCKER · 0 WARNING novo · 1 INFO herdado.
**Árvore:** `wave/api-idle-tx` em `83e7a78`, diff `master...wave/api-idle-tx` (base `68e6d50`).
**Contra:** `handoff/WI-desenho-infra-architect.md` (o desenho) e `D-2` de
`handoff/DECISOES-DO-OWNER-2026-09-27.md:10` `[DECISÃO-OWNER: 2026-09-27, escolha entre alternativas
apresentadas]`: *"`idle_in_transaction_session_timeout` no acesso da API + task para achar a causa"*.
Regras de despacho: `handoff/REGRAS-DE-DESPACHO-WORKFLOW-2026-09-24.md` §4-§5. Este portão **não** rodou `gate-record`.

## Denominador

| o quê | n | comando |
|---|---|---|
| regras bloqueantes em vigor | **8** | `harness rules list --severity block` |
| regras bloqueantes avaliadas | **8/8** (o runner aplica todas por arquivo) | `harness rules --mode file --path <f>` |
| arquivos varridos | **8/8** do diff (2 produção, 2 teste, 1 deploy, 3 docs) | `git diff --name-only master...wave/api-idle-tx` |
| achados `[BLOQUEIO]` | **0** | o mesmo laço, `grep -c BLOQUEIO` → `0` nos 8 |
| contratos `import-linter` | **7 kept, 0 broken** | `backend/.venv/bin/lint-imports` |
| testes novos | **10 passed** | `make test-fast K="hold_no_transaction or idle_transaction_timeout"` (8,5 s) |

`[MEDIDO 2026-09-27, nesta worktree]`. O `make verify` completo não foi rerodado aqui. O do builder está em
`gates/WI-builder.md:69-74` (rc=0, 2826 passed) `[DOC]`.

## Camada 1 — o que o runner mede

- **0 violação bloqueante** nos 8 arquivos. `own.compose-hardcoded-secret` não dispara em `deploy/compose.yml`:
  as duas variáveis novas (`PGOPTIONS`, `PGAPPNAME`) não são segredo.
- **[INFO, herdado]** `core.module-docstring-single-line` (severidade AVISO, não bloqueia) em
  `backend/src/main/__init__.py:1` e `backend/src/modules/sentimento/infra/ingest_record_store_composition.py:1`.
  O runner devolve **o mesmo aviso, na mesma linha, no `master` `68e6d50`**, e o diff não toca a linha 1 de
  nenhum dos dois. Não é desta trilha. Fica fora do veredito.

## Camada 2 — o que só a arquitetura declarada diz

| verificação | resultado | citação |
|---|---|---|
| `psycopg` não sai de `infra` | **OK.** `connect_autocommit` nasce em `sentimento/infra/ingest_record_store_composition.py:183`. `src.main` só a importa e a injeta pelo `connect=` que as funções de composição já aceitavam | contrato *"O motor de armazenamento nao vaza para fora de infra (ADR-014/D1d)"*, `backend/pyproject.toml:338-347`, KEPT; desenho §2 |
| direção de dependência / injeção | **OK.** A escolha da conexão fica na raiz de composição (`src/main/__init__.py:243`, `:260`). O adapter compartilhado `PostgresIngestRecordStore` não muda, e é o que o desenho exige ao recusar `commit`/`rollback` no adapter | desenho §2 *"Recusados"*; contrato *"Consumidor nao importa infra de contexto"*, KEPT |
| writer e coletor intactos (a exclusão de `D-2`) | **OK.** O padrão das duas composições continua `psycopg.connect`. `git grep connect_autocommit backend/src` → só `main/__init__.py` e a definição. O guarda que morde é `test_default_composition_stays_transactional_for_writer_and_collector` (mutação M4 → 1 failed, `WI-builder.md:54`) | desenho §2 *"O que não muda"*, §5.1(c) |
| cobertura das conexões da API | **OK.** `create_app` abre exatamente 2 conexões Postgres (`grep -nE "compose_\|psycopg\|connect\(" src/main src/api` → só `:243` e `:260`), e as duas recebem `connect_autocommit` | desenho §1.1 (conexões A e B) |
| timeout só na API | **OK.** `PGOPTIONS`/`PGAPPNAME` só em `services.api.environment` (`deploy/compose.yml:113-114`). `git grep PGOPTIONS -- deploy backend/src .env.example` não acha outro serviço nem o `.env.example` | desenho §3.1; `D-2` |
| §2 e §3 na mesma PR (a ordem do §4) | **OK.** O código e o compose estão no mesmo commit `83e7a78` | desenho §4 *"entram na mesma PR"* |
| comentário `APP_HOST` = *"the ONE variable"* | **Atualizado** em `deploy/compose.yml:96-98` e `:176-178` | desenho §3.1, último parágrafo |
| modo de falha silenciosa (`options=` no conninfo) | **Coberto.** `test_pgoptions_reaches_a_composed_connection` morde sob M5 (`WI-builder.md:55`) | desenho §3.1 ⚠️ |
| prova §5.1 com ablação por call site | **Presente.** A: 2 failed; B: 2 failed; A+B: 3 failed (reproduz o vazamento) (`WI-builder.md:51-53`) `[DOC: laudo do builder; este portão não re-ablou]` | desenho §5.1 *"Ablação obrigatória"* |
| prova §5.2 com caso rejeitado | **Presente.** `test_checker_rejects_pgoptions_on_the_writer`, `…_an_api_without_the_timeout`, `…_list_form_environment` (`test_compose_api_idle_transaction_timeout.py:75-99`) | desenho §5.2 |
| idioma (CLAUDE.md, tabela linhas 1-5, 7) | **OK.** Identificador, docstring e comentário novos estão em inglês. `docs/` está em português | `CLAUDE.md` §*"A tabela de fronteira"* |
| `docs/INDEX.md` append-only | **OK.** `+1` linha, `-0` | `CLAUDE.md` §*"Registro de artefatos"* |

## Fora do veredito, declarado

- **§5.3/§5.4 (a leitura em runtime depois do deploy, e os ≥ 2 dias sem disparo)** são portão do deploy, não
  deste diff. O próprio desenho os coloca lá, e `WI-builder.md` registra que ficam para o ato de deploy.
  Até esse ato, o laudo `ESCALADO-api-idle-in-transaction.md` **não** está fechado.
- As opções do desenho que ficaram de fora (`default_transaction_read_only`, role dedicado, reconexão,
  `lock_timeout` no `ALTER` de boot) são follow-up, e o desenho diz isso nos §4 e §6. A ausência delas não é violação.
- **Revalidação:** se a produção mudar depois deste laudo, peça a mutação (A, B e M4 a M7 de `WI-builder.md`),
  não este relatório (§4 das regras de despacho).
