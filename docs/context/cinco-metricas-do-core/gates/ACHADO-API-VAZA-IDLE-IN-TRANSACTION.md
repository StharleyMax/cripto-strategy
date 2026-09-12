# ACHADO — a API vaza sessão `idle in transaction`, e foi ela que congelou `md.ingest_run`

> Registrado pela **wave de integração** (`WAVE-04-INTEGRACAO.md`, DoD 4: *"PR aberta, descrevendo
> as 3 fases e os 2 defeitos de produção"*). Este é o **segundo** defeito. O primeiro — thread de
> coletor que morre sem derrubar o processo — **foi consertado nesta mesma wave**; este **não**, e
> a razão está em "Por que não foi consertado aqui", abaixo.

## O fato

Duas sessões da API ficaram em `idle in transaction` — **72 min e 35 min, ambas desde o próprio
boot do processo** `[DOC: WAVE-04-INTEGRACAO.md:53-55, diagnóstico de 2026-09-11]`. Consequência
medida no mesmo diagnóstico:

1. o `ALTER TABLE` de boot do coletor **travou** — `ALTER TABLE` pede `ACCESS EXCLUSIVE`, e uma
   transação aberta, **mesmo sem ter escrito nada**, segura o lock de leitura que o impede de
   entrar;
2. com o `ALTER TABLE` na fila, **toda leitura posterior de `md.ingest_run` entrou na fila atrás
   dele** — a tabela ficou congelada para leitura.

⚠️ O rótulo é `[DOC]` e não `[MEDIDO]`: quem mediu foi o diagnóstico da wave, contra a produção.
**Esta wave não reproduziu o vazamento** — ela não deployou nada e não tocou no Postgres de
produção (`WAVE-04-INTEGRACAO.md`, DoD 5).

## Por que isto é da MESMA classe do defeito das threads, e não um incômodo de performance

O defeito da thread e este defeito são a mesma doença com dois sintomas: **o sinal de saúde
continua verde enquanto o serviço não serve**. A tabela congelada não devolve erro — devolve
**espera**. Um cliente com timeout generoso fica pendurado; um `SELECT` de diagnóstico rodado por
um humano *"para ver se está tudo bem"* também trava, e quem está olhando conclui que o banco
"está lento", não que há um lock. É `rc=0` com zero linhas outra vez: o modo de falha que
`ADR-012` nomeia — sinal indistinguível entre *"nada de errado"* e *"o instrumento nunca foi capaz
de distinguir"*.

E há um agravante próprio: `idle in transaction` **desde o boot** significa que ninguém precisa de
carga, de pico, nem de azar para reproduzir. O vazamento nasce com o processo.

## A hipótese de causa — e ela está declarada como hipótese

`[NÃO MEDIDO]` Uma sessão que fica `idle in transaction` desde o boot é o sintoma clássico de uma
conexão que **abriu transação e nunca fez `COMMIT`/`ROLLBACK`** — tipicamente um pool cuja conexão
é emprestada, usada para um `SELECT` e devolvida sem fechar a transação implícita que o próprio
`SELECT` abriu. Em `psycopg3` isso acontece quando se usa a conexão fora de um `with
connection.transaction()` / sem `autocommit=True`: o driver abre transação no primeiro comando e
só a encerra quando alguém a encerra.

**Isto é hipótese, não diagnóstico.** Para virar diagnóstico falta exatamente uma medição, e ela
está escrita abaixo para quem pegar a task.

## Como confirmar — os comandos, prontos

```sql
-- quem está pendurado, há quanto tempo, e em que estado
select pid, state, now() - state_change as tempo_no_estado,
       now() - xact_start as idade_da_transacao, application_name, query
  from pg_stat_activity
 where state = 'idle in transaction'
 order by xact_start;

-- quem bloqueia quem (rode COM o ALTER TABLE de boot na fila)
select blocked.pid as bloqueado, blocking.pid as bloqueador,
       blocked.query as query_bloqueada, blocking.query as query_bloqueadora
  from pg_stat_activity blocked
  join lateral unnest(pg_blocking_pids(blocked.pid)) as bp(pid) on true
  join pg_stat_activity blocking on blocking.pid = bp.pid
 where cardinality(pg_blocking_pids(blocked.pid)) > 0;
```

**O falsificador da hipótese:** se `application_name` das sessões penduradas **não** for o da API,
a causa não é a API e este achado está com o dono errado.

## O conserto, quando alguém o pegar — e a ordem importa

1. **A causa** — fechar a transação no lado da API (`autocommit=True` para o caminho de leitura,
   ou um `with` que garanta `COMMIT`/`ROLLBACK` no retorno da conexão ao pool). É o conserto real.
2. **A rede de segurança** — `idle_in_transaction_session_timeout` no servidor (ou no papel da
   API). Ela transforma "pendurado para sempre" em "erro que aparece", que é a diferença entre
   este defeito e um defeito que alguém percebe.

⛔ **(2) sozinho não é conserto** — é anestésico. Mata a sessão pendurada e deixa a API continuar
vazando; o próximo sintoma aparece em outro lugar, mais difícil de ligar à causa.

**O portão que o conserto tem de trazer** (senão volta em silêncio, como este voltou): um teste em
que a API atende uma requisição de leitura e, **depois da resposta**, `pg_stat_activity` não mostra
nenhuma sessão daquela aplicação em `idle in transaction`. Verde sem esse teste não prova nada —
foi exatamente assim que o vazamento chegou à produção.

## Por que não foi consertado nesta wave

Escopo. A wave de integração tem DoD declarado (`WAVE-04-INTEGRACAO.md:63-71`) e o conserto deste
defeito **não está nele** — o próprio handoff diz *"Registre; o conserto pode ser task própria"*
(`:55`). Além disso ele mora na **camada de API**, que nenhuma das três fases integradas toca, e
exigiria um teste de integração com Postgres que esta wave não tem montado.

**O que esta wave fez com ele:** registrou com comando, hipótese, falsificador e portão — que é o
que impede um achado de virar folclore de transcript.
