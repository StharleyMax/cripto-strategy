# ADR-042 — Dois relógios, não um: `available_at` responde ao HORIZONTE DE CONHECIMENTO, `bucket_end` responde à FATIA

**Data:** 2026-09-20 · **Status:** proposta · **SPEC:** [`SPEC-008`](../specs/SPEC-008-candle-real-e-eixo-unico.md), com efeito em [`SPEC-001`](../specs/SPEC-001-plataforma-dados.md) §2.3/§2.5
**Fases:** `05` (história sob demanda) — **é pré-requisito dela, não consequência** · **Componentes alvo:** `sentimento` (o acessor único), `web` (quem escolhe o relógio)
**Origem:** achado de `T-01.5` da feature `candle-real-e-eixo-unico` — [`gates/T-01.5-dod6-medicao-e-achado-lookahead.md`](../context/candle-real-e-eixo-unico/gates/T-01.5-dod6-medicao-e-achado-lookahead.md), corroborado pelo portão de fase em [`gates/FASE-01-qa.md`](../context/candle-real-e-eixo-unico/gates/FASE-01-qa.md) §4
**Relação com decisões anteriores:** **sucede `ADR-006` e `SPEC-001` §2.3 sem afrouxá-las.** Compõe com `ADR-039` (acessor em lote) — a monotonicidade da admissão, que é o teorema em que `as_of_batch` se apoia, **sobrevive**, e a §*Por que `ADR-039` não quebra* prova por quê.

---

## Contexto — o achado, e ele não é um bug

O backfill de 90 dias escreveu **2.148.504 linhas** de `klines_ohlc`, custou **1,641 GB** de
`hypertable_size` e **3 h de walk**, fechou `ACCEPTED`, e **nenhuma daquelas linhas aparece na
tela** `[MEDIDO 2026-09-19, T-01.5-dod6-medicao-e-achado-lookahead.md]`:

```bash
# no banco: 240 linhas na janela auto-verificavel, provenance OBSERVADO, is_final=t
psql -Atc "select count(*) from md.series where series_key_id='6486750c2f…'
           and symbol='BTCUSDT' and bucket_end > 1789732800000 and bucket_end <= 1789747200000"
# 240
# pela API, a MESMA janela:
curl -s ".../series-history?series_key_id=6486750c2f…&…&bar_policy=final_only"
# 241 rows, absence: {'SEM_PONTO': 241}   <= ZERO servidas
```

A causa está escrita e está **correta**: a linha do poll vivo tem `available_at − bucket_end` =
**2,4 s**; a do backfill, **119.486.908 ms ≈ 33 h**. A regra `R-1` do acessor é
`available_at <= t`, onde `t` é **a FATIA** — o instante da grade que está sendo respondido
(`as_of_accessor.py:542`, `SPEC-001` §2.3). Na fatia de 2026-09-18 12:01 nós **não sabíamos**
aquele valor: ele só existiu no nosso armazém 33 h depois. **Servi-lo naquela fatia seria
lookahead, e o acessor recusa. O mecanismo está funcionando como especificado.**

⇒ **A decisão desta ADR não é consertar `R-1`. É separar duas perguntas que `R-1` hoje responde
com o mesmo operando.**

### As duas leituras, e o sistema só implementa uma

| leitura | a pergunta, literal | hoje |
|---|---|---|
| **decisão / backtest** | *"o que eu sabia NAQUELE instante?"* | ✅ implementada |
| **gráfico de história** | *"o que eu sei HOJE sobre aquele instante?"* | ❌ não existe |

As duas são legítimas e **não são a mesma**. A primeira é o que impede um backtest de lucrar com
um número que só chegou depois. A segunda é o que qualquer gráfico de qualquer corretora faz, e é
a única sobre a qual se pode desenhar uma vela de 2026-06-21 hoje.

---

## As medições

**M1 — a fase `05` está planejada sobre a premissa que o achado falsifica, e o achado não tem
carregador fora de duas páginas de prosa.**

```bash
grep -rniE "modos? de leitura|knowledge_time|available_at|anti-lookahead" \
  docs/plans/SPEC-008-candle-real-e-eixo-unico/05_historia_sob_demanda.md \
  docs/specs/SPEC-008-candle-real-e-eixo-unico.md \
  docs/context/candle-real-e-eixo-unico/tasks.toml
```
→ **zero linha** nos três arquivos `[MEDIDO 2026-09-20 pelo QA da fase 01, n=3 arquivos;
reproduzido por mim em b9bd200]`. O `DoD 1` da fase `05` é *"n = 3 arrastos sucessivos para trás
aumentam a contagem de barras, monotonicamente"* — **construída como está escrita hoje, a fase
`05` entrega paginação sobre `SEM_PONTO`**, e o `DoD 1` morde por uma causa que já está medida e
que a fase não sabe que existe.

**M2 — o discriminador que a decisão precisa JÁ EXISTE, em produção, nos dois lados.**

```bash
grep -n "knowledge_time\|purpose" backend/src/modules/sentimento/use_cases/series_history.py
grep -n "knowledge_time_ms" backend/src/api/routes/series_history.py
```
→ o caminho do gráfico já chama `as_of_batch(..., purpose=ReadPurpose.RENDERING,
knowledge_time=knowledge_time_ms)` (`series_history.py:261-262`) e a rota já **recusa com `422`**
um `knowledge_time_ms` no futuro relativo a `server_now_ms` (`routes/series_history.py:73-77`)
`[MEDIDO 2026-09-20, n=2 arquivos]`. **Não falta parâmetro; falta ele SIGNIFICAR alguma coisa em
`R-1`.**

**M3 — hoje `knowledge_time` só sabe APERTAR, nunca soltar.** No acessor, os cinco termos da
admissão são uma **conjunção** (`_admits`, `as_of_accessor.py:517-549`), e `knowledge_time`
entra como `observed_at <= knowledge_time` (`:541`) **ao lado** de `available_at <= t` (`:542`).
⇒ `knowledge_time = now` não destrava nada: `R-1` continua recusando sozinha. `[DOC:
as_of_accessor.py:535-546]`

---

## Decisão

### `D1` — `R-1` passa a ligar `available_at` ao HORIZONTE DE CONHECIMENTO, não à fatia

```
        hoje:   available_at <= t              ∧  observed_at <= K  ∧  R-2(bucket_end <= t)
      decidido: available_at <= K              ∧  observed_at <= K  ∧  R-2(bucket_end <= t)
```

onde `t` é a fatia da grade e `K` é `knowledge_time`, o instante de conhecimento que o chamador
declara.

**Duas coordenadas, e elas têm nome fora deste repositório:** `bucket_end` é *valid time* (quando
o fato aconteceu) e `available_at` é *transaction time* (quando ele passou a ser conhecível). `t`
percorre a primeira; `K` fixa a segunda. Hoje `R-1` e `R-2` percorrem **a mesma** coordenada, e é
por isso que não existe modo de ler o passado revisado.

### `D2` — ⛔ Com `K = t` o comportamento é IDÊNTICO ao de hoje, byte a byte

Este é o núcleo da decisão, e é o que a torna não-afrouxadora: `available_at <= K` com `K = t`
**é** `available_at <= t`. Todo chamador que quer a semântica de decisão a obtém passando o
próprio instante da fatia, que é o que um backtest faz por definição (`resolve_knowledge_time`,
`backtest/use_cases/record_run.py:96`). **A regra antiga é um caso particular da nova, não um
caso revogado.**

### `D3` — ⛔ `K > t` é admitido SOMENTE sob `ReadPurpose.RENDERING`; sob os outros dois o acessor RECUSA

`ENTRY_CONDITION` e `EXECUTION_SIMULATION` passam a **levantar** quando `knowledge_time > t`.

- `ENTRY_CONDITION` com `K > t` é **a definição** de lookahead: decidir a entrada de `t` com o
  que só se soube depois.
- `EXECUTION_SIMULATION` com `K > t` é o mesmo defeito na perna do preenchimento — o fill
  otimista que infla o P&L sem tocar na regra de entrada.
- `RENDERING` é o único onde `K > t` é legítimo, e a frase já está no repositório desde
  `SPEC-001` §2.3: *"nothing is decided by a pixel"* (`as_of_accessor.py:87`).

**É o mesmo mecanismo — e deliberadamente o mesmo — que `_refuse_intrabar_for_entry` já aplica a
`bar_policy`:** `purpose` é argumento obrigatório justamente para o acessor poder recusar uma
combinação em vez de confiar que o chamador leu a SPEC (`as_of_accessor.py:74-79`).

### `D4` — ⚠️ O que esta decisão CUSTA, declarado e não escondido

**Hoje a segurança anti-lookahead é acidental; depois dela, é explícita.** Com `R-1` amarrada a
`t`, *nenhum* chamador consegue ler o futuro nem querendo — a proteção não depende de ninguém
acertar um argumento. Com `D1`+`D3`, a proteção passa a depender de **uma recusa que precisa
existir e precisa ser testada**.

Isto é uma piora de robustez que eu não vou disfarçar: troca-se uma garantia estrutural por uma
garantia condicional. A troca se paga porque a garantia estrutural **também proíbe o caso
legítimo**, e o custo de proibi-lo já está medido em bytes (1,641 GB invisíveis) e em plano (a
fase `05` inteira). Mas o portão de `D3` **não é opcional**: sem ele, esta ADR é um afrouxamento.

### `D5` — `web` declara o relógio; NUNCA há default implícito de `K`

`knowledge_time` continua argumento **obrigatório** do acessor (é hoje, e continua). O gráfico de
história envia `K = server_now_ms`; um gráfico de replay/auditoria envia o `K` que o operador
escolher; o backtest envia `K = t`. **Nenhum caminho ganha um default** — um default aqui é a
forma de o lookahead voltar em silêncio.

---

## Por que `ADR-039` não quebra — a monotonicidade sobrevive

`as_of_batch` se apoia num teorema declarado no próprio acessor: *"The last two are the only
terms that depend on `t`, and both reach BACKWARDS from it. That is what makes admission MONOTONE
in `t`"* (`as_of_accessor.py:545-546`).

Sob `D1`, `available_at <= K` **deixa de depender de `t`** (`K` é constante ao longo da grade de
uma chamada). Um termo constante é trivialmente monótono em `t`, e `R-2` (`bucket_end <= t`)
segue alcançando para trás. ⇒ **a admissão continua monótona em `t`**, que é exatamente a
condição de `ADR-039`/`D1`. A passada ordenada única não precisa mudar de forma.

⚠️ `[NÃO MEDIDO]`: eu não rodei `as_of_batch` sob a regra nova — esta ADR **não altera código**.
O parágrafo acima é argumento sobre o invariante escrito, não medição. **Quem paga é o `DoD` da
task de execução**, abaixo.

---

## O que esta ADR NÃO decide — e a fronteira é literal

- **Não decide a UX da história sob demanda** (o estado nomeado, o badge, a paginação). Isso é
  `web` + `ux-ui-mastery`, itens `5.1`–`5.7` da fase `05`.
- **Não decide o `K` que o gráfico envia por padrão** além de `server_now_ms` para o modo
  história — se houver replay com `K` escolhido pelo operador, o desenho é da fase que o pedir.
- **Não reabre `ADR-006`/`SPEC-001` §2.5 na parte de `max_staleness`, LOCF ou natureza.** Só o
  operando de `R-1`.
- **⛔ Não decide nada sobre capital, tamanho de posição ou uso do gráfico para operar.** Um
  gráfico com `K = now` mostra história **revisada**, e ler uma estratégia nele **não é** um
  backtest. Quem separa os dois é `D3`, e a separação é técnica; o que o owner faz com a tela é
  decisão dele.

---

## Falsificadores — como o owner confere sem confiar em mim

1. **A regra nova contém a antiga (`D2`).** Com `K = t` em toda fatia, o resultado de
   `/series-history` tem de ser **igual byte a byte** ao de hoje, na mesma janela. **Morde** com
   qualquer diferença — diferença ali significa que `D1` mudou o modo de decisão, que é
   precisamente o que ela promete não fazer.

2. **A fixture envenenada de `SPEC-001` §5.1 continua recusada.** Ela é uma lista literal em
   teste (o acessor é puro, de propósito). Sob `purpose=ENTRY_CONDITION` e **qualquer** `K`, ela
   tem de continuar não produzindo leitura de lookahead. **Morde** se algum `K` a destravar.

3. **⛔ O portão de `D3`, e é o que impede esta ADR de ser um afrouxamento:**
   `as_of(..., purpose=ENTRY_CONDITION, t=T, knowledge_time=T+1)` **levanta**, e o mesmo para
   `EXECUTION_SIMULATION`. **Morde** se qualquer um dos dois devolver leitura.
   ⚠️ **E morde também se o teste passar por engano**: o caso positivo (`RENDERING` com
   `K = T+1` **devolve** a linha do backfill) tem de estar no mesmo arquivo, senão o teste não
   distingue *"recusou certo"* de *"recusa tudo"*.

4. **O que a fase `05` existe para provar, e hoje ela falharia:** na janela auto-verificável
   (`BTCUSDT`, `bucket_end ∈ (1789732800000, 1789747200000]`), `/series-history` com
   `knowledge_time_ms = server_now_ms` tem de deixar de devolver `absence: {SEM_PONTO: 241}` e
   passar a servir **≥ 1** das 240 linhas que o `psql` mostra — **sem** que `R-1` tenha sido
   removida. **Morde** se alguém alcançar isso apagando `R-1` em vez de reoperar o operando: aí
   o item 2 acima cai junto, e é por isso que os dois andam no mesmo portão.

---

## Consequências

- A fase `05` ganha um **pré-requisito** que ela não tinha: `T-05.0` (`tasks.toml`), da qual
  `T-05.1` e `T-05.8` passam a depender. Sem ela, a fase pagina sobre `SEM_PONTO`.
- `SPEC-008` §7 e `05_historia_sob_demanda.md` passam a citar este achado em vez de o
  pressupor resolvido.
- O backfill já pago (1,641 GB, 2.148.504 linhas) deixa de ser dívida invisível — **o dado está
  correto e comprado; o que faltava era a leitura**.
- ⚠️ `SPEC-001` §2.3 precisa de emenda quando esta ADR sair de `proposta`. A ADR **não** a emenda
  sozinha: a transcrição literal da fórmula vive lá, e duas verdades sobre `R-1` em dois
  documentos é o defeito que este repositório já pagou uma vez (`CLAUDE.md`, regra invertida
  propagada por dois documentos).
