# FIX — PR #217, as 2 ações `[FAIL]` do QA de `6616c06`

Laudo de origem: [`QA-PR-217-revalidacao.md`](QA-PR-217-revalidacao.md) (veredito `NEEDS_FIX`,
2 `[FAIL]`). Escopo desta correção: **essas duas, e nada além**. `D16` não foi reaberto (segue
suspenso, pendência `A5` com dono). Nenhuma query no Postgres, nenhum deploy, nenhuma constante
alterada.

Universo do diff: **2 arquivos**, `git diff --stat` → `35 insertions(+), 3 deletions(-)`.

---

## AÇÃO 1 — `xfail(strict=True)` no teste declarado-vermelho

`backend/tests/sentimento/test_publication_lag_table.py:577` recebeu **uma linha**, e só ela:

```python
@pytest.mark.xfail(strict=True, reason="D16: uncensored live p99 overshoots the native grid")
```

**Docstring intacto** — `git diff` do arquivo é `1 file changed, 1 insertion(+)`, `0` deleções, o
que é a prova mecânica de que nenhuma linha do registro do defeito encolheu. `pytest` já estava
importado (`:29`); nenhum import novo.

### Por que o teste é novo desta PR — reconferido, não presumido

```
git ls-tree -r --name-only origin/master | grep publication_lag_table
# (nenhuma linha)   -> o arquivo NAO existe na master
```

Logo a master hoje é verde e o merge sem esta correção a deixaria vermelha. `[MEDIDO 2026-09-15]`

### Os dois lados, medidos aqui — não herdados do laudo

O ponto do `strict` é que o teste continua mordendo, e **do lado certo**: hoje ele é `xfail`, e no
dia em que o dado sarar ele **REPROVA** em vez de emudecer. Os dois lados foram rodados nesta
worktree, com `__pycache__` purgado e `PYTHONDONTWRITEBYTECODE=1`:

```
# (a) HOJE, dado real -> o arquivo inteiro fica VERDE e o registro continua no lugar
cd backend && .venv/bin/python -m pytest tests/sentimento/test_publication_lag_table.py \
    -q --no-cov -p no:randomly
# ...........................................x                             [100%]
# rc=0        (universo: 44 testes no arquivo; 43 passed + 1 xfailed)

# (b) MUTACAO DE DADO — toda a cauda de KLINES_UNCENSORED_LAG_TAIL_MS trazida para DENTRO da
#     grade (43 valores -> 1_000), que e exatamente o que a remedicao pos-deploy vai produzir:
# ...........................................F                             [100%]
# [XPASS(strict)] D16: uncensored live p99 overshoots the native grid
# FAILED tests/sentimento/test_publication_lag_table.py::test_the_live_lag_holds_the_grid_when_the_late_polls_are_not_censored_away
# rc=1        (universo: os mesmos 44 testes)
```

`[MEDIDO 2026-09-15]`. **Verde não prova nada até uma mutação reprovar** — (b) é essa mutação, e
ela reprova com a mensagem `XPASS(strict)`, que é o sinal de que a proteção é o `strict` e não o
`xfail`. Um `xfail` não-estrito devolveria `rc=0` nos dois lados e a proteção seria decorativa.

Arquivo restaurado por cópia após a mutação, com conferência criptográfica:
`sha256sum -c` → `SUCESSO`; `git diff --stat` do teste voltou a `1 insertion(+)`.

---

## AÇÃO 2 — a afirmação falsa em produção, e o `p99` não-censurado que faltava

### 2a — a frase refutada, removida (não ressalvada)

`backend/src/modules/sentimento/domain/publication_lag_table.py:51` dizia:

> `nb = 2` (210 rows) is the ambiguous middle — a live poll that caught up after a gap, or a
> two-bucket backfill — and it is EXCLUDED rather than guessed at

O teste do MESMO commit (`test_publication_lag_table.py:551-559`) mede o contrário. A frase foi
**substituída pelo que está medido**, não emendada com ressalva — o handoff era explícito
(*"Remova a afirmação falsa em vez de empilhar ressalva nela"*):

- `nb = 2` são **polls atrasados**, `210` linhas, **`4,9%`** das `4.289` linhas live não-censuradas
  (`210 / 4289 = 4,896%`);
- todos os `105` grupos abrangem exatamente `60_000` ms, e a leitura mais velha é a mais nova mais
  um passo de grade — a evidência SQL foi trazida para o módulo de produção;
- a conclusão que a frase falsa escondia está agora escrita: **`nb = 1` é um filtro CENSORANTE**, e
  `lag_max_ms = 59_999 < 60_000` é propriedade **do filtro**, não do endpoint.

O texto novo é **comentário de produção em inglês** (`CLAUDE.md`, linha 5 da tabela de fronteira).
Nenhuma mensagem de `raise`/`Error`/`Exception` foi criada nesta correção.

### 2b — `60_936` registrado ao lado de `lag_p99_ms=59_361`

Este era o núcleo do achado: o número que **refuta** a escolha não aparecia em lugar nenhum do
módulo de produção.

```
# ANTES (na master desta PR):
grep -n "60_936" backend/src/modules/sentimento/domain/publication_lag_table.py   # rc=1, 0 linhas
# DEPOIS:
# 275:# (`nb <= 2`, `n = 4.289`) the `p99` is `60_936` ms — ABOVE the native `60_000` ms grid, not
# 290:#         CENSORED (`nb = 1`). Uncensored (`nb <= 2`, `n = 4.289`) the `p99` is `60_936` > grid.
```

`[MEDIDO 2026-09-15; universo: o módulo de produção inteiro, 1 arquivo]`

O bloco acima de `ENDPOINT_PUBLICATION_LAG` (`:272-286`) agora declara, na cara do leitor: a
leitura klines é **censurada**; sobre a população não-censurada o `p99` é `60_936 > 60_000`; os
`639` ms de folga são **artefato do filtro**; e **carimbar no primeiro ponto da grade é decisão do
owner, ainda em aberto**. Há ponteiro nominal para o teste `xfail(strict=True)` da Ação 1 como
registro executável. Uma segunda linha, colada em `lag_p99_ms=59_361` (`:290`), garante que quem
ler só a constante — e não o cabeçalho — também veja a censura.

⛔ **Nenhuma constante mudou.** `lag_p99_ms`, `sample_n`, `lag_max_ms` e as caudas seguem idênticos:
o diff de produção é `+34/-3` e **todas** as inserções são comentário.

---

## Portão

`make verify`, rodado nesta worktree em `20260915T173342Z`, com `__pycache__` purgado e
`PYTHONDONTWRITEBYTECODE=1` exportado antes da rodada:

```
[OK       ] lint-backend    rc=0  452 source files
[OK       ] lint-frontend   rc=0  ESLint + tsc --noEmit --strict do projeto sobre frontend/src
[OK       ] test-frontend   rc=0  592 pass, 0 fail em 4 suítes (app/charts/s1/s3)
[OK       ] test            rc=0  2481 passed · Total coverage: 96.63%
[OK       ] boundaries      rc=0  7 kept, 0 broken
[OK       ] regras          rc=0  0 bloqueio(s), 73 aviso(s)
[OK       ] política        rc=0
[OK       ] e2e             rc=0  27 passed (33.6s)
[----     ] diff             2 files changed, 35 insertions(+), 3 deletions(-)
veredito: VERDE — 8 portões mediram e passaram
```

**O portão `test` virou `rc=0`, que era o `[FAIL]` da Ação 1** — o laudo anterior media
`rc=1  2481 passed` com `1 failed`; agora é `rc=0  2481 passed`, com o mesmo `2481`, porque o teste
saiu da coluna `failed` para a coluna `xfailed` **sem sair da suíte**. Cobertura `96,63%` idêntica à
do laudo — nenhuma linha de produção foi adicionada ou removida, só comentário.
`[MEDIDO 2026-09-15; universo: 8 portões, 2481 testes backend + 592 frontend + 27 e2e]`

## Observações — NÃO corrigidas, por estarem fora das 2 ações

Declaradas em vez de silenciadas, e nenhuma delas bloqueia:

1. **`:46` diz `nb=1 -> 4.075`, mas `sample_n=4_079`** (4 linhas de diferença), e é `4_079 + 210 =
   4_289` que fecha com o `n` não-censurado do teste. Divergência **pré-existente**, herdada; não
   toquei porque não é nenhum dos 2 `[FAIL]`.
2. **O docstring do teste (`:585-590`) afirma que `make verify` devolve `rc=1` aqui** — verdadeiro
   antes da Ação 1, **falso depois dela**. O laudo mandou o docstring **intacto** e eu obedeci ao
   literal; sinalizo porque é a mesma classe de defeito da Ação 2 (prosa que o instrumento refuta),
   e quem decidir emendar a frase decide contra uma instrução explícita — por isso não decidi
   sozinho.

---

# APÊNDICE — as 2 observações declaradas acima, corrigidas (2026-09-15, 2º ciclo)

O coordenador mandou corrigir as duas, pelo motivo certo: **são a mesma classe de defeito da Ação
2 — prosa provada falsa**. A Obs. 2 existia porque *"docstring intacto"* foi lido ao literal; o
coordenador esclareceu que queria preservar o **raciocínio**, não uma afirmação que o próprio
conserto acabou de falsificar.

## Obs. 1 — `:46` dizia `nb=1 -> 4.075`, e o número certo é `4.079`

**Medido, não deduzido** (Postgres **somente leitura**, mesma janela congelada do laudo):

```
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -c "
with g as (select series_key_id, available_at, count(*) nb from md.series group by 1,2)
select s.source, g.nb, count(*) from md.series s
  join g on g.series_key_id = s.series_key_id and g.available_at = s.available_at
 where s.bucket_end < 1789155360000 and s.source = '/fapi/v1/klines'
 group by 1,2 order by 2;"
# /fapi/v1/klines|1|4079      <- 4.079, NAO 4.075
# /fapi/v1/klines|2|210
# /fapi/v1/klines|1079|9711
# /fapi/v1/klines|1080|3240
# /fapi/v1/klines|1500|343588
```

`[MEDIDO 2026-09-15, read-only; universo: todas as linhas klines com `bucket_end < 1789155360000`]`

`4.075` era **erro de transcrição**: contradizia `sample_n = 4_079` doze linhas abaixo **e** o
`4.289 = 4.079 + 210` de que a população não-censurada depende — `4.075` não fecha com nenhum dos
dois. O comando foi colocado **ao lado do número**, no próprio módulo.

### 🔴 A medição achou um SEGUNDO número caducado, e ele está corrigido em vez de calado

As linhas de **backfill** também mudaram: `nb = 1079/1080/1500` somam **`356.539`** hoje, não os
`120.951` que o comentário afirmava — passadas de backfill continuaram importando história para
dentro da mesma janela depois de 2026-09-11. **As linhas LIVE (`nb = 1`, `nb = 2`) reproduzem
EXATAMENTE** (`4.079`/`210`), que é o que importa: o `p99` lê **só** a população `nb = 1`, então o
crescimento do backfill não move nenhuma constante. O comentário agora **data** o snapshot e diz
qual metade reproduz e qual não — em vez de afirmar `120.951` como verdade corrente.

## Obs. 2 — o docstring afirmava `rc=1`, e a Ação 1 tornou isso falso

`:586-591` dizia: *"`make verify` returning `rc=1` here is expected until the data changes"*.
Depois do `xfail(strict=True)` o portão devolve **`rc=0`**. A frase foi **substituída**, não
ressalvada, e o raciocínio foi **preservado e ampliado**:

- o registro do defeito continua: a asserção `assert 60936 < 60000` é falsa de propósito, e falhava
  idêntica antes e depois de `418f47b` ⇒ **o vermelho é do DADO**, não do teste;
- passa a dizer **como** esse vermelho é carregado desde 2026-09-15 (`xfail(strict=True)`, arquivo
  `xfailed`, `make verify` `rc=0`) e **por que** (o teste é novo; deixá-lo falhando deixaria a
  master permanentemente vermelha e todo `rc=1` futuro indistinguível de regressão — o `rc`
  ambíguo de `ADR-012`);
- e diz o que `strict` compra: no dia em que o dado melhorar, a asserção passa a valer, o `pytest`
  converte o passe inesperado em `[XPASS(strict)]` e o portão volta a `rc=1` ⇒ **o teste morde do
  lado certo**, forçando a troca das constantes. Um `xfail` não-estrito daria `rc=0` dos dois lados
  e a proteção seria inútil.

## Portão — reconferido, não presumido

```
make verify      # 20260915T174859Z, __pycache__ purgado, PYTHONDONTWRITEBYTECODE=1
[OK] lint-backend 452 source files · [OK] lint-frontend · [OK] test-frontend 592 pass, 0 fail
[OK] test rc=0  2481 passed · Total coverage: 96.63%
[OK] boundaries 7 kept, 0 broken · [OK] regras 0 bloqueio(s), 73 aviso(s) · [OK] política
[OK] e2e 27 passed (33.1s)
veredito: VERDE — 8 portões mediram e passaram
```

Idêntico ao 1º ciclo em todo portão (`2481 passed`, `96.63%`) — as duas correções são **comentário
e docstring**, zero linha executável. Diff do ciclo: `2 files changed, 40 insertions(+), 10
deletions(-)`.

**Nenhuma observação aberta restou.** As duas que eu havia declarado estão fechadas com medição; a
terceira (backfill `120.951 → 356.539`) foi achada **por causa** da medição da primeira e está
corrigida no mesmo ato.
