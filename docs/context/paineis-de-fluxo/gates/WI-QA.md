# WI-QA: portão de QA da trilha WI (idle-in-transaction da API, `D-2`)

**Universo:** `git diff master...wave/api-idle-tx` em `83e7a78` (código) + `c672bce`/`c894848` (laudos
REVIEW e CODE-REVIEW, só docs). Contrato: `handoff/WI-desenho-infra-architect.md` §5 e §7, e `D-2`
(`handoff/DECISOES-DO-OWNER-2026-09-27.md`, worktree `wave-paineis-f03b`).
**Data:** 2026-09-27. **Veredito: APPROVED.**

## Isolamento da medição (e por que ele foi necessário)

Durante este portão, **outro portão fazia mutação na mesma worktree**: `git status` mostrou
`M backend/src/main/__init__.py` (a mutação B, `compose_postgres_connection(os.environ)` sem `connect=`)
e dois `pytest -k hold_no_transaction` que não eram meus `[MEDIDO: git diff + pgrep -af pytest]`. Os
dois portões concorrentes (REVIEW e CODE-REVIEW) commitaram depois e a árvore voltou limpa. Um primeiro
`make verify` meu, iniciado nessa janela, foi **abortado** (rc=2, `Terminado`) e não conta.

Para não medir a mutação alheia, **toda ablação abaixo rodou numa cópia isolada**:
`git archive HEAD` (`83e7a78`+docs) extraído em scratchpad, com o `.venv` da worktree por symlink.
Confirmei que o import vem da cópia, não da worktree: o traceback de `import src.main` na cópia aponta
para o caminho da cópia `[MEDIDO]`. Bytecode desligado (`PYTHONDONTWRITEBYTECODE=1`) e sem cache do
pytest (`-p no:cacheprovider`), por causa do cache obsoleto que já falseou mutação aqui.

## Veredito

```
## QA Gate — WI [infra / sentimento backend]
- [OK] core.relative-import — make verify, portão regras: "0 bloqueio(s), 77 aviso(s)"; o teste novo usa só import absoluto
- [OK] core.silent-except — idem; nenhum except no diff de produção nem no teste novo
- [OK] core.print-statement — idem; nenhum print no diff
- [OK] core.hardcoded-secret — escopo production: o diff de src/ não tem credencial (connect_autocommit só recebe conninfo)
- [OK] web-fullstack.browser-imports-server — diff não toca frontend/
- [OK] web-fullstack.tenant-from-request — diff não lê identificador de inquilino
- [OK] web-fullstack.server-test-directory-present — backend/tests/ existe e ganhou 3 arquivos
- [OK] own.compose-hardcoded-secret — deploy/compose.yml:113-114 só fixa PGOPTIONS/PGAPPNAME, não segredo
- [OK] Testes existem e passam — WI: 13 passed (5+5+3); make verify: 2829 passed, e2e 87 passed
- [OK] Cobertura 96,23% contra alvo 70% (backend/pyproject.toml:128); camadas 99,7/99,6/92,4% contra 90/80/70%
- [OK] DoD do desenho §5.1/§5.2, item a item (abaixo); §5.3/§5.4 são portão de deploy, fora deste
Regras bloqueantes avaliadas: 8 de 8 listadas por `harness rules list --severity block`
Veredito: APPROVED
```

## 1. O vazamento existia: o teste reprova no código de antes

Comando, na cópia isolada, para cada mutação em `src/main/__init__.py`:
`PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest --no-cov -p no:cacheprovider tests/main/test_api_connections_hold_no_transaction.py -q`

| mutação | call sites com `connect=connect_autocommit` | resultado `[MEDIDO]` |
|---|---|---|
| nenhuma (HEAD) | 2 | 5 passed |
| **A**: sem `connect=` em `compose_ingest_record_store` (`:243`) | 1 | `1 of 2 app sessions left idle in transaction`; FAILED `…idle_in_transaction` e `…boot_alter[md.ingest_run]` |
| **B**: sem `connect=` em `compose_postgres_connection` (`:260`) | 1 | `1 of 2 …`; FAILED `…idle_in_transaction` e `…boot_alter[md.series]` |
| **A+B** = o código de `master` | 0 | `2 of 2 app sessions left idle in transaction`; FAILED `…idle_in_transaction`, `boot_alter[md.series]`, `boot_alter[md.ingest_run]`, com `canceling statement due to lock timeout` (35,5 s) |

A+B é o código de antes do conserto, e reproduz **o estado** (sessão `idle in transaction`) e **o dano**
(`ALTER TABLE` do boot fica na fila e morre em `lock_timeout=2s`). Cada mutação parcial reprova só a
tabela que a conexão dela lê. Isso bate com o mapeamento do desenho §1.1 e com a tabela do builder
(`WI-builder.md:48-57`), agora reproduzida por um portão independente. O universo `>= 2 sessões` está
afirmado no teste, então `0 idle` sobre universo vazio não passa.

## 2. O timeout vale só para a API

| mutação | resultado `[MEDIDO]` |
|---|---|
| **M4**: padrão de `compose_postgres_connection` vira `connect_autocommit` | FAILED `…stays_transactional_for_writer_and_collector` |
| **M5**: `options=-cstatement_timeout=0` no `_postgres_conninfo` (libpq para de ler `PGOPTIONS`) | FAILED `…pgoptions_reaches_a_composed_connection` |
| **M6**: tira `PGOPTIONS` do `api` em `deploy/compose.yml` | 4 FAILED (`test_real_compose…` + 3 `test_checker_*`) |
| **M7**: `environment: PGOPTIONS` acrescentado ao `writer` | 3 FAILED (`test_real_compose…` + 2 `test_checker_*`) |
| **M8**: `collectors_cli.py` importa `connect_autocommit` | FAILED `test_only_the_api_composition_root_injects_connect_autocommit` (teste novo, §3) |

Comando: o mesmo pytest sobre os 3 arquivos WI com `-k 'not served'`. O `.env.example` não carrega
`PGOPTIONS` nem o nome do timeout (`test_env_example_never_carries_the_timeout`, verde). **O que isto
NÃO cobre:** o `.env` real (gitignored, leitura negada neste portão), que é `env_file` dos três
serviços. Um `PGOPTIONS` escrito lá à mão pegaria o writer e o coletor, e só o comando 1 do §5.3 do
desenho o vê `[NÃO MEDIDO]`.

## 3. Teste acrescentado por este portão

`backend/tests/main/test_connect_autocommit_reaches_the_api_alone.py` (3 testes). **A lacuna que ele
fecha:** o teste (c) do builder fixa o **padrão** de `connect` das funções compartilhadas, mas não vê
um entrypoint do writer/coletor que passe `connect=connect_autocommit` **explicitamente**, e `D-2`
exclui os dois. O teste percorre `backend/src` por AST (nome, atributo e alias de import) e admite
`connect_autocommit` só em `src/main/__init__.py` e no módulo que o define. Ele afirma o universo
(`src/main` de fato o injeta) e traz os dois casos rejeitados (import num coletor e referência por
atributo). Morde: M8 acima. `ruff check` e `ruff format --check` limpos, `mypy` sem issue `[MEDIDO]`.

## 4. make verify

`VERIFY_FORCE=1 E2E_API_PORT=8846 E2E_NEXT_PORT=4346 make verify` na worktree limpa `c894848`, com o
teste novo presente → **rc=0, VERDE: os 8 portões mediram e passaram** `[MEDIDO 2026-09-27T12:31:41Z]`.
As portas de e2e foram deslocadas porque a worktree `t-03-8` rodava e2e nas padrão (8821/4321) ao mesmo
tempo.

- `lint-backend` 477 arquivos (476 do builder + o teste novo) · `lint-frontend` ok
- `test-frontend` 1139 pass / 0 fail
- `test` **2829 passed** (2826 do builder + 3), cobertura total **96,23%** contra `fail_under=70`
  (`backend/pyproject.toml:128`). Por camada: domain 99,7% (meta 90%), use_cases 99,6% (meta 80%),
  infra 92,4% (meta 70%), 3 de 3 camadas medidas. `ingest_record_store_composition.py` a **100%**.
- `boundaries` 7 kept, 0 broken · `regras` **0 bloqueio**, 77 avisos (os 2 avisos em arquivos do diff
  são `core.module-docstring-single-line`, anteriores ao diff, como o builder já registrou) · `política` ok
- `e2e` **87 passed**
- Log: `/tmp/verify-wave-api-idle-tx-20260927T123141Z.log` (308K).

## 5. Fora deste portão, declarado

- **§5.3 (leitura em runtime depois do deploy)** e **§5.4 (falsificador de ≥ 2 dias, `2|0` por
  `application_name='cripto-api'`)**: são portão de deploy, não pytest. `[NÃO MEDIDO]`: não houve deploy.
  `0|0` ali **não** é verde (a chave não pegou).
- Follow-ups do desenho §6 (lock_timeout no ALTER de boot, `default_transaction_read_only`, role
  dedicado): fora de `D-2`, não cobrados aqui.
