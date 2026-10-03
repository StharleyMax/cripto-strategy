# W8 — code-review da wave W8 de `paineis-de-fluxo` (T-05.6, T-06.1, T-06.2, T-06.3, T-06.4)

- **Alvo:** `git diff d2055d9..5572169` (branch `wave/paineis-f06` contra `master`), 84 arquivos,
  +6882/−592 `[MEDIDO 2026-10-03: git diff --stat d2055d9..5572169 | tail -1]`.
- **Instrumento:** skill `code-review`, nível `high` (10 achados brutos), mais verificação manual de cada
  um contra o código em `5572169`. Só leitura: nenhum teste, e2e ou `make verify` rodado por este gate.
  A única execução foi uma sonda de `bash` sobre uma cópia da função `expand` (achado M-3).
- **Intenções lidas:** `gates/T-05.6-DESIGN-GATE.md`, `handoff/T-05.6-escopo.md`, `handoff/T-06.1-desenho.md`
  §1–§2, `handoff/T-06.3-desenho.md`, `handoff/T-06.4-prova.md` (§1, §3, §4 e a decisão do owner),
  `gates/T-06.4-fix-W8.md`, `gates/W8-QA-INFRA.md`, `gates/W7-CODE-REVIEW.md` (formato e R-2).
- **Fora do escopo, já com dono:** F-1 de `gates/W8-QA-INFRA.md` (mapa editado no próprio diff), cujo
  conserto está em andamento. Não é repetido aqui.

## Veredito: **CHANGES_REQUESTED**

O núcleo de correção está **certo**: o descarte no escritor preserva o `as_of` (prova abaixo, lida do
código), o `DELETE` só apaga linha dominada, os workers não compartilham estado mutável e o veredito
por escopo não grava cache. **Um achado bloqueia**, porque protege um passo irreversível que ainda não
rodou e é barato de consertar: o universo "congelado" do `compact.sh` não está congelado (B-1). O
falsificador F-B pode reprovar **depois** do `DELETE` sem que haja defeito, e aí o owner não tem como
separar o falso alarme de uma deleção errada.

Contagem: **1 bloqueante (MÉDIA-ALTA)** · **3 MÉDIA** (não bloqueiam) · **6 BAIXA ou aceitos por desenho**.

## O que foi conferido e está correto

| foco | verificação | resultado |
|---|---|---|
| anti-lookahead do predecessor imediato | `repeated_fact.py:109-121` exige `p.observed_at < r.observed_at`, `p.available_at <= r.available_at` e o mesmo fato de 13 colunas. O `as_of` admite `available_at <= K` **e** `observed_at <= K` e escolhe o `argmin(observed_at)` (`as_of_accessor.py:291,312,625-626`). Logo, para todo `K` que admite `r`, `p` também é admitido e vence `r`: descartar `r` não muda nenhuma resposta | **correto** |
| redelivery | o predecessor é **estritamente** anterior (`postgres_series_sink.py:91-94`), então a mesma linha nunca é julgada repetição de si mesma | correto |
| `DELETE` só de duplicata | `flags.sql` usa a mesma regra por `lag()`, com `PARTITION BY` na chave mais `bucket_end` (a janela nunca cruza chunk). Numa cadeia `p→r→s` de fatos iguais, `r` e `s` saem e `p` fica; a dominância é transitiva pelo `<=` de `available_at`. O bucket com inversão sai inteiro (`bucket_inverted`). Cada chunk faz `COMMIT` só se `n_selected = n_deleted` | **correto para o `as_of`** |
| pré-condições do `DELETE` (D-1/D-2) | `compact.sh:224-237` exige `stats-before`, `envelopes-before` e a listagem de chunks capturada com `\|\| die` | corrigido |
| workers da API | uvicorn com `workers > 1` usa `spawn`: cada filho importa o próprio app e abre a própria conexão. A API não escreve no SQLite de quarentena (só quem chama `.record` são coletor e ETL). A extensão por SkipScan (`MIN` dos mínimos por `source`) é igual ao `MIN` por construção | correto |
| cache do verify por escopo | `verify.sh:503` grava o cache só com `COMPLETO_DE_FATO=1`; `make verify` passa `E2E_SPECS=` na linha de comando, que vence o ambiente (`Makefile`) | correto |
| asserts de e2e removidos | os `expect` removidos de `22/29/33/37/38` eram guardas de **posicionamento** (zoom-out manual). `view.ts::showView` os substitui e **lança erro** se o alvo não for alcançado em `maxIterations`, ou se pedir página sem `allowPaging` (`view.ts:326-347`). O gesto continua sendo roda e arrasto reais, sem setter | sem perda de mordida |

## Achado bloqueante

### B-1 — o universo "congelado" de `compact.sh` cresce depois de `T_SNAP`. F-B pode reprovar após o `DELETE` irreversível — **MÉDIA-ALTA, bloqueia**

- `scripts/md-series-compaction/compact.sh:143-152` (`cmd_snapshot`) e `flags.sql:10-11`.
- O congelamento é `ingested_at <= T_SNAP`. Mas `ingested_at` é o `received_at` **do coletor**
  (`collector_series_mapping.py:266` e mais 5 sítios), carimbado **antes** de a linha entrar no stream.
  A pré-condição checa só `lag == 0` no `XINFO GROUPS`. No Redis, `lag` conta as entradas ainda **não
  entregues** e **exclui** as que já foram entregues e estão no PEL (sem `ack`), ou seja, o lote que o
  escritor está gravando agora. O coletor continua rodando e pode ter uma resposta com
  `received_at <= T_SNAP` ainda não publicada. Isso vale ainda mais no walk de boot com contrapressão
  (`T-05.3`): ele **espera** o lag cair antes de publicar a página que já buscou.
- **Cenário:** `snapshot` vê `lag=0` com um lote de N linhas no PEL, e o `count before` começa logo em
  seguida (é o que um orquestrador faz, comando atrás de comando). As N linhas aterrissam com
  `ingested_at <= T_SNAP` depois do snapshot de leitura do `count before`. Então o `DELETE` e o
  `count after` enxergam um universo maior. Resultado: `F-B.1` (`after.frozen == before.survivors`,
  `compact.sh:260-271`) e a impressão digital de `F-B` **reprovam**, e o `verify` diz "REPROVA" sobre
  linhas já apagadas sem backup. O owner aceitou apagar sem backup com a condição *"sendo somente
  duplicado"* `[PREMISSA-OWNER: 2026-10-02, T-06.4-prova.md §3.3]`. A prova dessa condição é
  exatamente este falsificador, e ele passa a não distinguir "apagou o que não devia" de "chegou linha
  atrasada".
- **O dado não corre risco.** A dominância vale sobre qualquer conjunto de linhas, e o `DELETE`
  recalcula as flags dentro da própria instrução. O que quebra é a capacidade do instrumento de provar,
  depois do passo irreversível, que nada além de duplicata saiu.
- **Correção sugerida (qualquer uma):** (a) `docker stop` do `collector` durante o procedimento (só
  Docker local, decisão já tomada pelo owner), com `lag == 0` **e** `pending == 0` (`XINFO GROUPS` já
  devolve `pending`) antes de gravar `T_SNAP`; ou (b) `T_SNAP = clock − margem` (ex.: 10 min) mais
  `pending == 0`, e o `count before` só depois da margem. Um teste do script que reprove `snapshot` com
  `pending > 0` fecha o portão.
- **Força:** CONFIRMED por leitura (semântica de `lag` no `XINFO GROUPS` e origem de `ingested_at`)
  `[INFERRED: a frequência real do lote em voo no momento do snapshot não foi medida]`.

## Achados MÉDIA (não bloqueiam; recomendados)

### M-1 — o caminho `REJECTED_MODELED_OVER_OBSERVED` deixa a conexão do escritor `idle in transaction` — **MÉDIA, pré-existente**

- `use_cases/write_series_row.py:91` retorna antes de `immediate_predecessor`, que agora é o único
  lookup que faz `commit` (`postgres_series_sink.py:152`). `observed_already_present`
  (`postgres_series_sink.py:120-135`) abre a transação de leitura e não a fecha. A conexão do escritor
  é `psycopg.connect` (sem autocommit, `single_writer_cli.py:282-293`) e **não** tem o
  `idle_in_transaction_session_timeout`, que está fixado só no serviço `api` (`deploy/compose.yml:100-103`).
- **Cenário:** a última linha de um lote é um `MODELED` sobre um bucket `OBSERVADO`. Ela não credita
  run (`single_writer_cli.py:386-400`), então nada faz `commit` depois. Com a fila ociosa, o escritor
  dorme `idle in transaction` segurando `AccessShareLock` em `md.series`. Qualquer `ALTER` fica na fila
  atrás dele, que é a classe do incidente que a docstring nova cita como motivo do `commit`.
- **Pré-existente:** em `d2055d9` esse caminho também não fechava a leitura. A wave escreveu o
  invariante na docstring e o aplicou a um só dos dois ramos. Correção de uma linha: `commit` em
  `observed_already_present`, ou antes do `return` do ramo rejeitado.

### M-2 — `verify.sh --scope`: `ESCOPO:*` aceita `pytest=` vazio ou desconhecido e o veredito diz "pytest completo com piso" — **MÉDIA (latente)**

- `scripts/verify.sh:196` casa `ESCOPO:<qualquer coisa>`. O `case "$ESC_PYT"` (`:319-341`) não tem ramo
  para valor desconhecido, então nenhum pytest roda. O veredito cai em `*) D_PYT="pytest completo com piso"`
  (`:489`) com `VERDE-ESCOPO`.
- **Hoje não é alcançável:** `scope-resolve.sh:287-301` sempre imprime um dos três valores. Mas o ramo
  `*` da linha 197 existe justamente para recusar saída irreconhecível, e `ESCOPO:*` passa por cima dele.
  A regra declarada do arquivo é fail-closed. Correção: `ESCOPO:COMPLETO|ESCOPO:ALVO|ESCOPO:PULADO`.

### M-3 — `scope-resolve.sh::expand` descarta em silêncio um token malformado do mapa — **MÉDIA (latente)**

- `scripts/scope-resolve.sh:57-63`. Um erro aritmético de `bash` dentro de `$( )` não imprime nada
  para o token, e `spec_of` nunca o vê.
- **Medido** `[MEDIDO 2026-10-03: cópia de expand no scratchpad, last=42]`: `expand '13 16-2O 29'` →
  `13 29`; `'13 2O+ 29'` → `13 29`; `'13 16-x 29'` → `13 29`; `'13 20-16 29'` (faixa invertida) →
  `13 29`. Em todos, rc da validação = 0 e a linha do mapa entra encolhida.
- É o caso "mapa podre encolhe a seleção em silêncio" que o cabeçalho promete recusar com `rc=3`. O
  completo da wave é o anteparo, e por isso não bloqueia. O conserto de F-1 (mapa no diff ⇒ COMPLETO)
  pega o commit que introduz o erro, mas **não** os diffs seguintes, que leem a linha já podre.
  Correção: validar cada token com `^[0-9]{2}(-[0-9]{2}|\+)?$` e `a <= b` no laço de leitura do mapa
  (`:69-78`), fora do subshell.

## Achados BAIXA / aceitos por desenho

| # | arquivo:linha | cenário | status |
|---|---|---|---|
| L-1 | `frontend/e2e/14-long-short-dado-real.spec.ts:789-808` | a guarda `readableInBand >= 2` saiu. Quando a barra anterior à faixa não é legível, o assert não discrimina o corte inclusivo e vira anotação `non-discriminating` | **Aceito por desenho**: é o R-2 de `W7-CODE-REVIEW` resolvido como `T-05.6-build.md` declara. A igualdade rodapé = legíveis da faixa continua afirmada sempre (0 ⇒ `absent`), e os índices da faixa (`:582-585`, `:771-774`), independentes do dado, já rejeitam o corte inclusivo. Também verifiquei que a regressão C-1 (corte na grade de 1 min) dá agora a **mesma** contagem da faixa exclusiva em 1h/4h, então não há defeito visível que o assert deixe passar |
| L-2 | `backend/src/main/__main__.py:18` | o supervisor (`workers > 1`) importa `src.main`, roda `create_app()` e segura 2 conexões Postgres (autocommit, ociosas) e o app em memória sem servir | **Declarado** em `T-06.3-desenho.md:165` (+~59 MB no pai). As conexões são autocommit, então não ficam `idle in transaction`. Sugestão barata: importar o app só no ramo `workers == 1` |
| L-3 | `backend/src/main/__main__.py:77-78` | `API_LIMIT_MAX_REQUESTS=0` ⇒ `limit=0` ⇒ cada worker sai no primeiro tick (`uvicorn/server.py:265-268`), e o supervisor entra em laço de respawn. Valor negativo ⇒ `randint(0, jitter<0)` lança `ValueError` | CONFIRMED, BAIXA: o compose fixa `2000`, e só erro de configuração dispara. Validar `>= 1` como `_worker_count` já faz |
| L-4 | `write_series_row.py:92` + `postgres_series_sink.py:140-155` | o predecessor é o do store **na hora da escrita**. Uma linha que chega fora de ordem (`observed_at` menor, entregue depois) pode cair entre o predecessor e uma linha já descartada (`X, Y, X` vira `X, Y`) | PLAUSIBLE, BAIXA: o `as_of` não muda (a dominância não exige imediatez). Só se perde a ordem das mudanças para o F-1 de `T-05.2`, e só com mais de um produtor. Um stream único entrega em ordem e `read_pending` vem antes de `read_new` |
| L-5 | `flags.sql:10-11` | a mesma forma de L-4 no `DELETE`: uma linha com `ingested_at > T_SNAP` e `observed_at` entre duas congeladas não entra no `lag()` | PLAUSIBLE, BAIXA: o `as_of` continua invariante. A ordem `X,Y,X` só se perde com linha fora de ordem |
| L-6 | `postgres_series_sink.py:140-155` | cada candidata custa SELECT + SELECT + COMMIT + INSERT + COMMIT, contra SELECT + INSERT + COMMIT | Eficiência: o `COMMIT` de leitura não grava WAL. As duas leituras usam a mesma chave e poderiam virar uma só. Não bloqueia |
| L-7 | `scope-resolve.sh:199` | um arquivo de `frontend/src` que existe mas que o grafo não liga a nenhuma página (CSS por `@import`, import dinâmico, asset) recebe só `e2e/11`, quando o fail-closed pediria COMPLETO | Latente: hoje o único não-TS é `app/globals.css`, que `layout.tsx` alcança ⇒ COMPLETO `[MEDIDO: git ls-files frontend/src \| grep -vE '\.(ts\|tsx)$' ⇒ 1 arquivo]` |
| L-8 | `scripts/md-series-compaction/compact.sh:2-22` e as mensagens de `die`; mensagens de `expect` novas em português nos e2e | linha 5 da tabela de fronteira do `CLAUDE.md` (comentário em inglês), e a decisão de 2026-09-02 (mensagem de erro em inglês) aplicada por analogia ao `die` | **Convenção, não portão** (o `CLAUDE.md` diz isso literalmente). Os identificadores Python/TS novos estão em inglês, e não achei `raise`/`throw` novo com mensagem em português `[MEDIDO: grep nas linhas + do diff]` |

## Achados brutos da skill e destino

| skill # | destino |
|---|---|
| 1 (`verify.sh:196`) | M-2 |
| 2 (`e2e/14:799`) | L-1, aceito por desenho |
| 3 (`__main__.py:18`) | L-2 |
| 4 (`__main__.py:78`) | L-3 |
| 5 (`write_series_row.py:91`) | M-1, pré-existente |
| 6 (`write_series_row.py:92`) | L-4 |
| 7 (`postgres_series_sink.py:152`) | L-6 |
| 8 (`compact.sh:2`) | L-8 |
| 9 (`flags.sql:9`) | L-5. O B-1 é achado próprio deste gate, na mesma área |
| 10 (`scope-resolve.sh:59`) | M-3, medido |

## Para fechar

- **B-1** antes de qualquer `compact.sh snapshot` no Docker local: snapshot com `pending == 0` e o
  coletor parado (ou margem de tempo), e um teste do script que reprove `pending > 0`.
- M-1, M-2 e M-3 são consertos de uma a três linhas cada. Recomendo fazê-los na mesma passada, sem
  exigência deste gate.
