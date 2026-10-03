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

---

## Re-validação @a451027

Universo: `git diff 27fe3b4..a451027 -- scripts/md-series-compaction scripts/scope-resolve.sh frontend/e2e/scope-map.tsv backend/tests`
(8 commits, `compact.sh` +81, `flags.sql` +3, `scope-resolve.sh` +30, testes +239). Lido à mão contra o
código, com medição no Docker local (só leitura) onde a semântica de ferramenta decide. Não rodei
`make verify` nem e2e, porque o despacho proíbe.

### Veredito: **CHANGES_REQUESTED** (escopo estreito: N-1)

O núcleo do B-1 está fechado. Mas o próprio conserto traz uma guarda que não existe no Docker real (N-1),
e o teste a dá como verde por meio de um `docker` falso que não reproduz o filtro. Neste repositório,
falso verde em portão de passo irreversível não passa. O conserto tem cerca de 3 linhas.

### B-1 — **FECHADO** para a topologia documentada

- `compact.sh:165-201` (`require_pipeline_stopped`), chamado em `snapshot` (`:205`, **antes** do `mkdir`
  e do `clock_timestamp`) e de novo em `delete` (`:293`, antes de listar chunks).
- Fail-closed conferido ramo a ramo: contêiner não achado → `die`. Estado ≠ `exited|created|dead`
  (`running`, `paused`, `restarting`) → `die`. `XINFO` com erro → `die`. Grupo ausente (`found≠1`) → `die`.
  `lag` nil (linha vazia), `?` ou ≠0 → `die`. `pending` ≠0 → `die`. Os testes cobrem `lag>0`,
  `lag-nil`, `collector-running`, `writer-running`, `writer-paused`, `writer-not-found` e `group-missing`,
  mais `pending>0` no `delete`.
- **Parser contra o Redis real** `[MEDIDO 2026-10-03: docker exec deploy-redis-1 redis-cli XINFO GROUPS md.series.write | <awk de compact.sh>]`
  → `1 0 0`. A saída real é `name|single_writer|consumers|1|pending|0|…|lag|0`: o par chave/valor por
  `NR%2` vale, e o grupo padrão `single_writer` é o que existe.
- **Ninguém além do escritor grava `md.series`.** `grep -rnE 'INSERT INTO md\.series' backend/src deploy scripts`
  devolve só `postgres_series_sink.py:72`, usado só por `single_writer_cli.py`, e
  `scripts/oi-poll-capture-bench.sh:130`, que grava no Postgres **do bench**, não no deploy. A rota de
  quarentena da `api` só lê (nenhum `XADD`/publish em `routes/series_quarantine.py`).
- **Restart policy não reabre o furo.** `writer` e `collector` são `unless-stopped`
  (`deploy/compose.yml:164,308`), e um `docker stop` sobrevive ao restart do daemon. Mais forte: mesmo
  que alguém religue o pipeline depois do `snapshot`, isso não injeta linha com `ingested_at <= T_SNAP`.
  O stream estava vazio para o grupo (lag 0, pending 0), e o coletor carimba `received_at` no relógio
  de parede da busca (`collectors_cli.py:1918`, mesmo kernel que o `clock_timestamp()` do Postgres).
  Então toda linha nova nasce `> T_SNAP`. A recheca no `delete` é cinto e suspensório.
- **Resíduo aceito (BAIXA):** existe TOCTOU entre a recheca de `delete` e o fim do laço de chunks. Pelo
  argumento acima, ele não alcança o universo congelado.

### N-1 — a varredura "qualquer nome" por label é **código morto no Docker real**. O teste a dá verde por um fake — **MÉDIA, bloqueia**

- `compact.sh:176-178`:
  `docker ps --filter label=com.docker.compose.service=collector --filter label=com.docker.compose.service=writer`.
  No `docker ps`, filtros `label` repetidos são **AND** (o contêiner precisa ter todos), não OR. Nenhum
  contêiner tem `service=collector` **e** `service=writer` ao mesmo tempo, então a saída é **sempre vazia**.
- **Medido com o pipeline VIVO** `[MEDIDO 2026-10-03, Docker 24.0.4, deploy-collector-1 e deploy-writer-1 em execução]`:
  o comando exato de `compact.sh` devolve `[]`. Com um filtro só (`…=collector`), devolve
  `[deploy-collector-1]`. Controle: `--filter …=postgres --filter …=redis` também devolve vazio.
- O comentário `:161-162` (*"a scaled replica, another project — the named check alone would miss it"*),
  a tabela de `T-06.4-fix-B1.md:14` e a mutação **M4** (*"varredura `docker ps` neutralizada — 2 failed
  (`scaled-replica`)"*, `:47`) afirmam uma guarda que não existe. O fake
  (`test_md_series_compaction_delete_flow.py:59`, `ps) … echo "$FAKE_DOCKER_PS"`) ignora os argumentos e
  devolve o nome. É o caso "a mutação reprova contra o dublê, não contra a ferramenta".
- **Alcance real:** o furo exige réplica **não nomeada** do escritor **e** do coletor ao mesmo tempo.
  Um coletor extra sem escritor só faz o lag subir, e a recheca do `delete` pega. Um escritor extra sem
  coletor não tem o que gravar. Na topologia de escritor único (`ADR-009`) isso é improvável, e por isso
  é MÉDIA e não ALTA. Bloqueia porque é um falso verde novo dentro do portão que protege o `DELETE`
  irreversível.
- **Correção:** um único `docker ps --filter label=com.docker.compose.service --format '{{.Names}} {{.Label "com.docker.compose.service"}}'`
  com `awk '$2=="collector"||$2=="writer"{print $1}'`, ou dois `docker ps` (um por serviço). O fake
  precisa **honrar os filtros**, por exemplo devolvendo o nome só quando o `--filter` pede o serviço
  dele. Sem isso, o teste não morde a regressão que acabei de medir.

### M-3 — **FECHADO** para os casos medidos. Fica um resíduo da mesma classe (N-2)

- `scope-resolve.sh` `check_tokens` roda no shell principal (o `while … done < "$MAP"` não é pipe, então
  `recusa` sai com rc=3), antes de `expand`. Ela recusa `ab+`, `8-9`, `13-12`, `16-2O`, `16-x` e `2O+`.
  Os testes cobrem os três primeiros.
- **N-2 (MÉDIA latente, pré-existente, não bloqueia):** `NN+` com `NN` **acima do último spec** é um
  token bem formado. `check_tokens` o aceita, `expand` (`:59`, `for ((i=a; i<=last…))`) não imprime
  nada e a linha encolhe em silêncio. `[MEDIDO 2026-10-03: cópia de expand no scratchpad, last=42]`:
  `'13 99+ 29'` → `13 29`, `'13 43+ 29'` → `13 29`. É plausível quando os specs do fim são apagados
  (uma linha `40+` com 40–42 removidos), e o comentário de `expand` (*"the first number printed is `a`
  itself"*) está errado justamente nesse caso. O completo da wave é o anteparo. **Correção:** em
  `check_tokens`, para `NN+` e `NN-MM`, chamar `spec_of` na base, que está no shell principal e recusa.

### F-1 / W-2 — **FECHADOS**, sem falso verde novo

- `frontend/e2e/scope-map.tsv` no diff → `full_e2e`. O mapa removido já recusava em `[ -f "$MAP" ]`.
- `frontend/public/*` → `full_e2e`, posto **antes** do ramo `*.md`, então um `.md` servido não vira
  documento. Também conferi: `git ls-files frontend/src frontend/e2e | grep -c '\.md$'` = `0`, logo o
  ramo `*.md` não engole código de app hoje.
- O alargamento é monotônico (só leva ao COMPLETO): nenhum caminho novo estreita a seleção.

### Fora deste diff (continuam abertos, não bloqueiam)

- **M-1** (`idle in transaction` no ramo rejeitado) e **M-2** (`ESCOPO:*` em `verify.sh:196`):
  `git diff --stat 27fe3b4..a451027` não toca `write_series_row.py`, `postgres_series_sink.py` nem
  `verify.sh`.

### Para fechar (re-validação)

- **N-1:** corrigir o filtro e fazer o fake honrar `--filter`. Prova: o comando corrigido, rodado com o
  pipeline vivo, devolve `deploy-collector-1` e `deploy-writer-1`, e a mutação M4 reprova contra o fake
  novo.
- N-2 na mesma passada (uma linha), sem exigência deste gate.
