# WI — CODE-REVIEW (skill `code-review`, nível high) — `master...wave/api-idle-tx`

**Veredito: APPROVED** — 0 achado de correção CONFIRMADO.

- **Alvo:** `master...wave/api-idle-tx`. O código revisado é o de `83e7a78`. `c672bce` (HEAD) só acrescenta
  `gates/WI-REVIEW.md` (`git diff --stat 83e7a78 HEAD -- backend deploy frontend` → vazio `[MEDIDO]`).
- **Universo:** 8 arquivos, +734/−7 (`git diff --stat master...wave/api-idle-tx`). O código de produção
  são 2 arquivos (`backend/src/main/__init__.py`, `ingest_record_store_composition.py`) mais `deploy/compose.yml`.
- **Regra do veredito (despacho):** NEEDS_FIX só com achado CONFIRMADO de correção.

## Verificação própria (não é releitura do laudo do builder)

| medição | comando | resultado |
|---|---|---|
| testes novos | `make test-fast K="hold_no_transaction or idle_transaction_timeout"` | `10 passed` `[MEDIDO]` |
| mutação A: `compose_ingest_record_store(os.environ)` sem `connect=` em `main/__init__.py:243` | `sed` + `make test-fast K=hold_no_transaction` + `git checkout` | `2 failed` (inclui `boot_alter[md.ingest_run]`) `[MEDIDO]` |
| mutação B: `compose_postgres_connection(os.environ)` sem `connect=` em `:260` | idem | `2 failed` (inclui `boot_alter[md.series]`) `[MEDIDO]` |
| outros consumidores do padrão compartilhado | `grep -rn 'compose_ingest_record_store(\|compose_postgres_connection(' backend/src` | collector, klines_backfill, bench e ntp_skew continuam em `psycopg.connect`, então o padrão do writer e do coletor ficou intacto (`D-2`) |
| escritas pela API | `grep -n 'commit' postgres_ingest_record_store.py` + uso em `create_app` | a API só chama os métodos de leitura (`runs`/`gaps`/`describe_readiness`, `read_window`/`read_bounds`). O `commit()` explícito das escritas continua válido sob autocommit |

As duas mutações mordem, e cada call site reprova o `ALTER` da tabela que a sua conexão lê.

## Candidatos da skill (9): nenhum é defeito de correção do conserto

| # | local | classe | veredito | por que não bloqueia |
|---|---|---|---|---|
| 1 | `deploy/compose.yml:113` | robustez | PLAUSIBLE | Se um vazamento futuro passar de 30 s, a conexão morre e as rotas dão 500 até reiniciar, porque não há reconexão. O desenho (§4) aceitou essa troca explicitamente, e `WI-builder.md:81` já registra a reconexão como dívida. É follow-up, não regressão |
| 2 | `main/__init__.py:243` | altitude | PLAUSIBLE | O conserto fica no call site, não no adaptador. Um consumidor NOVO com o `connect` padrão reintroduziria o vazamento. Foi decisão do desenho (`D-2` exclui mexer no padrão), e `test_default_composition_stays_transactional…` a pina |
| 3 | teste `:87` | teste | PLAUSIBLE | `app_sessions >= 2` não filtra `backend_type`/`application_name`. A ablação A+B relatada (*"2 of 2"*) mostra que o universo hoje são as 2 sessões da app. Endurecimento recomendado: filtrar `backend_type='client backend'` |
| 4 | teste `:115` | teste | CONFIRMED (lido) | `while not server.started` não tem prazo nem checa `thread.is_alive()`. Se o uvicorn falhar no boot, a suíte trava em vez de reprovar. É defeito de teste, não do conserto. Recomendado |
| 5 | teste `:111` | reuso | CONFIRMED (lido) | O padrão uvicorn-em-thread se repete em outros arquivos de `backend/tests`. Candidato a `tests/helpers` |
| 6 | `main/__init__.py:260` | recurso | PLAUSIBLE | Nenhum lifespan fecha as 2 conexões. É preexistente ao diff. No teste, o `DROP DATABASE … WITH (FORCE)` limpa |
| 7 | `composition.py:192` | docstring | REFUTADO como regressão | `runs()`+`gaps()` já eram statements separados sob `READ COMMITTED` com `autocommit=False`, e cada statement tomava o próprio snapshot. O autocommit não muda a consistência entre eles |
| 8 | teste de compose `:70` | teste | PLAUSIBLE, baixo | Checa só `.env.example`, e o `.env` real não é versionado. Limite do instrumento, não defeito |
| 9 | teste `:165` | eficiência | CONFIRMED (lido) | São 3 boots da app onde 1 bastaria. A suíte roda em ~16 s, então o ganho é marginal |

Recomendado, sem bloquear: #4, depois #3. Follow-up com dono: #1 (reconexão), já na dívida do builder.
