# ADR-016 — Relógio é **capacidade**; tipo de data é **valor**. O contrato 3 passa a proibir a leitura, não o import

**Status:** `proposto` · **Data:** 2026-08-29 · **Componente:** `docs` · **Feature:** `plataforma-dados`
**Autor:** `/architect` · **Rev de ancoragem de TODA medição:** **`master@1ad1434`** (worktree `arch/ADR-016-natureza-do-relogio`), e o lado `T-03.10` medido em `task/T-03.10-fila-etl-retomavel@6b8f441`
**Origem:** o BLOQUEIO ABERTO do ciclo 2 de [`docs/context/plataforma-dados/gates/T-03.10-build.md`](../context/plataforma-dados/gates/T-03.10-build.md) §"colisão de merge com o contrato 3" — o builder recusou decidir, e **recusou certo** (`D6`).

**Fecha:** a colisão entre o contrato 3 que a `T-03.1` acrescentou (PR #29, mergeada) e o `domain/` da `T-03.10` (PR #28, aberta e travada em `git push --dry-run → rc=1`).

**Não reabre** `ADR-011/D3a` (grafo de imports para direção de camada) nem `ADR-014/D1d`. O contrato 3 **continua existindo e continua mordendo** — muda o que ele proíbe, e nasce o portão que fica com o resto.

---

## Contexto — as duas metades, e as duas estão certas

`T-03.1` declarou o contrato 3 porque `socket` e `ssl` estavam em `domain/` **passando por todos os portões**. O contrato é real e o motivo é real.

```toml
name = "Natureza: domain e use_cases nao falam com socket, ssl nem relogio"
forbidden_modules = ["socket", "ssl", "time", "datetime"]
```

`T-03.10` põe em `domain/` dois módulos que importam `date` e `timedelta` para aritmética de calendário pura, e **nenhum deles lê relógio**:

```
$ grep -rnE "^\s*(import|from)\s+(time|datetime|socket|ssl)\b" backend/src/modules/sentimento/{domain,use_cases}/
domain/dump_window.py:6:from datetime import date, timedelta
domain/retention_probe.py:6:from datetime import date
$ grep -rnE "\.now\(\)|\.today\(\)|\.utcnow\(\)|time\.time\(\)|monotonic\(\)" .../domain/ .../use_cases/
(nenhuma)
```
`[MEDIDO 2026-08-29, em `task/T-03.10-fila-etl-retomavel@6b8f441` — n = 13 arquivos de `domain/`, 2 imports, 0 leituras]`

Na base `master@1ad1434` o mesmo grep sobre **todo** `backend/src/` devolve **5** ocorrências, **todas em `infra/`** (`system_ramp_clock.py`, `aggtrade_nq_probe_cli.py`, `binance_stream_probe.py`) e **0** em `domain/`/`use_cases/` `[MEDIDO 2026-08-29]` — ou seja, o contrato 3, hoje, **cala sobre um universo vazio na camada que ele guarda**. O primeiro código que ele encontra é o da `T-03.10`.

### A pergunta de mérito, e ela não é de merge

| | |
|---|---|
| o que o contrato **proíbe** | o **módulo** `datetime`, inteiro |
| o que o nome do contrato **declara** | *"não falam com … **relógio**"* |
| o que o perigo de fato **é** | **não-determinismo e dependência de ambiente** — um valor que muda conforme *quando* e *onde* o código roda |
| o que `date`/`timedelta` **carregam** | nada disso: são **valores imutáveis** que chegam por argumento |

⇒ **O import é um proxy do perigo, não o perigo.** `date.today()` é o relógio; `date` como tipo não é. E o proxy é **grosso nos dois sentidos**, o que o torna pior que impreciso:

- **grosso para mais:** reprova aritmética de calendário pura, que é inofensiva;
- **grosso para menos, e isto é o que decide** — `from datetime import date` já **entrega** `date.today()`. Sob o contrato de hoje, um arquivo de `domain/` que importa `datetime` está BROKEN **do mesmo jeito** com ou sem leitura de relógio dentro, e o contrato **nunca chega a perguntar** se há leitura.

---

## A bancada — 6 experimentos, e a matriz que decide

Todos em `arch/ADR-016-natureza-do-relogio` sobre `master@1ad1434`, com o venv de `make setup` (`import-linter 2.14`, Python 3.13), usando **o `domain/` da `T-03.10` como corpus — corpus que eu não escrevi e não escolhi**. Mutantes plantados em cópia, revertidos, árvore reconferida limpa entre os experimentos `[MEDIDO 2026-08-29]`.

O scanner de bancada está versionado em [`docs/adr/bancadas/ADR-016-natureza.py`](bancadas/ADR-016-natureza.py) — **e ele não é portão**; o cabeçalho dele diz isso em voz alta.

| # | montagem | corpus | `import-linter` | scanner de AST |
|---|---|---|---|---|
| **E1** | contrato 3 **como está** | mutante | **BROKEN**, nomeando `dump_window -> datetime (l.6)` e `retention_probe -> datetime (l.6)` | — |
| **E2** | contrato 3 **+ `ignore_imports`** dos 2 módulos | mutante | **`3 kept, 0 broken` (2 ignored imports)** | — |
| **E3** | contrato 3 **estreitado** para `["socket","ssl"]` | mutante | `3 kept, 0 broken` | **rc=1**, `dump_window.py:255 -> datetime.now`, `retention_probe.py:274 -> date.today` |
| **E4** | o mesmo par | **limpo** (os 2 arquivos originais) | `3 kept, 0 broken` | **rc=0**, `0 leitura(s)` |
| **E5** | contrato estreitado + sonda `import ssl` em `domain/` | — | **BROKEN**, `2 kept, 1 broken` | — |
| **E6** | — | `getattr(date, "today")()` | — | **0** (ponto cego, declarado abaixo) |

**E1 é o achado que dispensa argumento estético:** a linha que o contrato nomeia é **`l.6`, o import** — a **mesma** linha, com e sem `datetime.now()` no arquivo. O instrumento não olha para onde o perigo está.

**E2 mata a saída mais barata.** `ignore_imports` é a forma que `import-linter` oferece para exceção, e ela sai **verde com `datetime.now()` e `date.today()` dentro de `domain/`** — a isenção concede exatamente a capacidade que o contrato existe para negar, e a concede **só nos arquivos que a pediram**. Isenção que reprova o teste de dois lados é `parecendo coberto` (`ADR-009/D3`).

**E3+E4 são o teste de dois lados exigido, na mesma passada:** o scanner nomeia `arquivo:linha` dos 2 mutantes e **cala sobre `date`/`timedelta` nas linhas 129/171/174/194/196/214/230 dos MESMOS arquivos**. Bateria mais larga, no corpus inteiro de `domain/` de uma vez: **3 mutantes plantados** (`datetime.now` em `dump_window`, `time.monotonic` em `etl_backlog`, `date.today` em `retention_probe`) → **3/3 acusados, 0 falso positivo** `[MEDIDO]`. Controle de não-vacuidade: o mesmo scanner sobre `infra/` acha **5** leituras reais `[MEDIDO]`.

---

## Decisão

### D1 · O contrato distingue, e a distinção é **capacidade × valor**

**Sim, o contrato deve distinguir, e a `T-03.10` não muda.** A regra que fica escrita, e que decide os casos futuros sem consulta:

> Módulo cuja superfície é **só capacidade** (não há uso inofensivo dele numa camada pura) é proibido **por import**, no grafo. Módulo que mistura **valor e capacidade** é guardado **por uso** — proíbe-se a *leitura*, não o *tipo*.

`socket` e `ssl` são capacidade pura: `domain/` não tem nada legítimo a fazer com transporte. `datetime` e `time` misturam.

### D2 · `datetime` e `time` **saem** de `forbidden_modules`; `socket` e `ssl` **ficam**

```toml
forbidden_modules = ["socket", "ssl"]
```

E o **nome do contrato muda junto** — deixar "nem relógio" num contrato que não guarda mais o relógio é a contradição texto × medição que este repositório passou o mês corrigindo. Novo nome: `"Natureza: domain e use_cases nao falam com socket nem ssl"`, com o ponteiro para esta ADR no comentário acima dele.

`E5` mede que o contrato estreitado **continua mordendo** — não vira cerimônia.

### D3 · `time` tem o mesmo defeito, e ele foi **medido antes da resposta**

`time` expõe **38** nomes públicos: **21** são leitura/manipulação de relógio, **17 não são** — `strftime`, `strptime`, `struct_time`, `mktime`, `timezone`, `tzname`, `altzone`, `daylight`, `get_clock_info`, `tzset` e as 7 constantes `CLOCK_*` `[MEDIDO 2026-08-29: `python3 -c "import time; …"`, n=38]`.

**Uso em `domain`/`use_cases` hoje: 0, nos dois lados** (`master@1ad1434` e `T-03.10@6b8f441`) `[MEDIDO]`. ⇒ **Não há demanda medida para `time`** — e é por isso que ele sai **junto**, e não por consistência estética: mantê-lo na lista de import deixaria a **mesma armadilha latente** para o próximo autor que precisar de `struct_time`, e essa armadilha custaria outro ciclo de arquitetura. `D1` é uma regra ou é um caso particular; sair só `datetime` a tornaria caso particular.

O scanner cobre as 21 do lado do relógio — medido pelo mutante `time.monotonic` acusado no corpus completo.

### D4 · O instrumento é **scanner de AST ligado ao import**, e ele mora no `make` — não no `harness`, não no `import-linter`

**Por que não `import-linter`:** o `grimp` monta o grafo em granularidade de **módulo**. `datetime.date` não é submódulo de `datetime`, é objeto dentro dele; a distinção **não é expressável no instrumento** (E1), e a única válvula que ele oferece reprova o teste de dois lados (E2).

**Por que não `[[rules.own]]`:** os motores que o `harness` tem são `forbidden-regex`, `forbidden-regex-allowlist`, `line-scoped` e `path-presence` — **4 motores, nenhum de AST** `[MEDIDO 2026-08-29: `harness rules list`, n=10 regras em vigor]`. Uma regra própria aqui seria **regex de linha**, e `ADR-011/D3a` já trocou regex por estrutura *neste exato tipo de fronteira* porque a regex não via três formas. Declarar uma agora seria desfazer `D3a` uma camada abaixo.
⇒ Cai em **`ADR-012/D4`**: o que precisa morder e não é motor do `harness` mora no `make`. Portanto: script em `backend/scripts/`, alvo no `Makefile`, chamado por `scripts/hooks/pre-push.pre-harness` — a mesma costura de `boundaries.sh` (`ADR-011/D3b`).

**Não nasce `[[rules.own]]`, logo `harness corpus verify`/`mutate` é satisfeito com universo 0** — e isso é escrito, não subentendido: a obrigação de corpus **não some**, ela **muda de credor**. Quem cobra é o DoD de `D5`, que exige a mesma prova de dois lados por mutação.

**O algoritmo, em 4 passos (é isto que a bancada implementa e o que a task promove):**
1. `ast.parse` do arquivo; colher as ligações que `import`/`from … import` criam para `datetime` e `time` — **incluindo `as`** (`import time as t` liga `t`);
2. para cada `ast.Attribute`, resolver a **raiz** do encadeamento até um `ast.Name`;
3. se a raiz é um nome ligado no passo 1, casar `attr` contra o conjunto de **leitura de relógio** daquele qualificador (`datetime.now|utcnow|today|astimezone`, `date.today`, `time.{time,monotonic,perf_counter,sleep,localtime,gmtime,…}`);
4. acusar `arquivo:linha:expressão`. Anotação de tipo e aritmética nunca alcançam o passo 3.

⚠️ **Casa por `ast.Attribute`, não por `ast.Call`** — `funcao(datetime.now)` passa o relógio adiante sem chamá-lo, e a forma `Call` deixaria isso passar.

**Escopo:** `backend/src/modules/*/domain/` e `backend/src/modules/*/use_cases/`. `infra/` fica fora — é lá que o relógio **deve** morar (as 5 leituras medidas).

### D5 · A troca é **atômica**, e a `PR #28` espera por ela — não o contrário

Estreitar o contrato **antes** de o portão existir abre uma janela em que `domain/` não é guardado por nada, e trocaria um portão que morde por doutrina — que é a única coisa que este documento não tem licença para fazer. Portanto:

**O mesmo commit** (i) cria `backend/scripts/natureza.sh` + o script de AST promovido de `docs/adr/bancadas/`, (ii) acrescenta o alvo `make natureza` e o põe no `pre-push`, (iii) **só então** aplica `D2` ao `backend/pyproject.toml`.

**DoD verificável** — o critério nomeia o comando e o universo:
- `make natureza` na árvore de `master` + `T-03.10` mesclada → **rc=0**, `0 leitura(s)`, universo **≥13 arquivos** de `domain/` e todos os de `use_cases/`;
- **prova de dois lados por mutação, n=4**, cada mutante revertido e a árvore reconferida entre eles: `datetime.now()`, `date.today()` *sem import novo*, `import time` + `time.monotonic()`, e `f(datetime.now)` **sem chamar** → **4/4 com `rc=1` nomeando `arquivo:linha`**, e **0 falso positivo** sobre as 7 linhas legítimas de `date`/`timedelta` de `dump_window.py`;
- `bash backend/scripts/boundaries.sh` → **rc=0** com `Contracts: 3 kept, 0 broken`, **e** com a sonda `import ssl` em `domain/` → **rc=1** (E5 reproduzido no portão, não na bancada);
- `git push --dry-run` da `T-03.10` → **rc=0**.

**Dono: `/tech-lead`,** que quebra isto em `T-03.11` (componente `sentimento`). **Nenhum builder pode fazê-lo por conta própria** — é a mesma fronteira que `D6` confirma.

### D6 · As duas recusas do builder da `T-03.10` estão **certas**, e por motivos diferentes

**(a) Não estreitar o contrato de outra task.** Correto, e o motivo é institucional: fronteira declarada é ato de arquitetura. Se cada builder pudesse afrouxar o contrato que o barra, o contrato mede a paciência do builder, não a estrutura do código. **Repare que o custo do acerto é visível e foi pago:** `rc=1` e uma PR travada. É o preço certo.

**(b) Não trocar `timedelta` por aritmética à mão.** Correto, e o motivo é técnico e medido: `dump_window.py` usa `timedelta` em **4 sítios** (l. 171, 174, 196, 230 `[MEDIDO]`), um deles `_days_in_month` — `(day.replace(day=1) + timedelta(days=31)).replace(day=1)`. Reescrever isso à mão é reimplementar ano bissexto e comprimento de mês para satisfazer a **letra** de uma regra cuja **intenção** o código já honra, e a task **acabou de gastar um ciclo consertando um defeito de adjacência de período** `[DOC: gate `T-03.10`, ciclo 2, item 1]`. **Piorar o desenho para agradar o instrumento é o instrumento governando a arquitetura** — inversão que `ADR-012` recusa por nome.

---

## Alternativas recusadas, com o custo medido

| alternativa | custo medido | por que cai |
|---|---|---|
| **manter a proibição total; `T-03.10` reescreve** | `timedelta` em 4 sítios de `dump_window.py`, incluindo comprimento de mês | E1: o contrato **não distingue de qualquer jeito** — continuaria BROKEN por `l.6` mesmo num arquivo que só lê relógio. Paga-se o pior desenho **sem** comprar precisão |
| **`ignore_imports` para os 2 módulos** | `3 kept, 0 broken` **com `datetime.now()` e `date.today()` dentro de `domain/`** (E2) | reprova o teste de dois lados. Concede a capacidade exatamente onde alguém pediu, e a lista cresce em silêncio |
| **`[[rules.own]]` com regex de linha** | 4 motores no `harness`, **0 de AST** `[MEDIDO]` | desfaz `ADR-011/D3a` uma camada abaixo: regex não vê alias, re-export nem import em função |
| **não fazer nada; `T-03.10` fica travada** | `git push --dry-run → rc=1`, PR #28 parada | a espera é custo real e **não** é argumento para afrouxar; mas ela também não é decisão — só adia esta |

---

## Limite declarado — o que este portão **não** fecha

O scanner é **estático**, como o `grimp`. `getattr(date, "today")()` sai **0** `[MEDIDO, E6]`, e o mesmo vale para `importlib` e atributo montado em runtime. **É a mesma classe de buraco que `ADR-011/D3a` já declarou para o `import-linter`, e ela não aumenta com esta troca** — o que muda é que o buraco passa a ser *escapável de propósito* em vez de *inatingível por construção*.

⇒ **O que este portão garante:** que ninguém leia o relógio em camada pura **por acidente**. **O que ele não garante:** que ninguém o faça **deliberadamente, escondendo**. Fechar o segundo exige instrumentação em tempo de execução, que nenhuma task tem — e o `getattr` que hoje existe em `domain/` **não toca relógio**: são **2** ocorrências, ambas em `ingest_record.py` (l. 192, 199), sobre campos de `dataclass` `[MEDIDO 2026-08-29: `grep -rn getattr .../domain/`, n=2]`. Quem quiser fechá-lo abre task; **fica aberto, com dono nomeado: `/architect`, na primeira `[NÃO SEI]` que o exigir.**

---

## Falsificador

**A decisão está errada se o scanner acusar código legítimo mais do que impedir código ilegítimo.** A observação que a derruba, e ela é contável:

> Ao fim da fase 03, conte no histórico de `make natureza`: **acusações sobre `date`/`timedelta` legítimos** (falso positivo) versus **leituras de relógio em `domain`/`use_cases` que ele barrou** (verdadeiro positivo).
> **Se falso positivo ≥ verdadeiro positivo, `D4` cai** — o par vira `["socket","ssl"]` só, e o relógio em camada pura volta a ser convenção de revisão humana, escrita e sem portão (a forma que `ADR-013` já usa para idioma).
> **Hoje o placar da bancada é 0 falso positivo × 3 verdadeiros positivos, n=13 arquivos** `[MEDIDO 2026-08-29]`.

Um segundo falsificador, mais barato e mais cruel: **se `make natureza` passar 30 dias sem nunca sair `rc=1` numa árvore real**, ele é cerimônia — e cerimônia permanente por benefício de duas tasks é o que `ADR-012/D5` recusa por nome. Nesse caso `D5` sai e a bancada volta para `docs/`.

---

# ERRATA 1 — 2026-08-29 · o instrumento estava furado, e as frases que ele sustentava eram falsas

**Append, não reescrita.** Nada acima foi apagado; o que ficou errado está **nomeado abaixo, com o número novo ao lado do velho**. A decisão (`D1`–`D3`, `D6`) **não muda**, e a medição que a sustenta — **`E2`: `ignore_imports` dando `3 kept, 0 broken` com `datetime.now()` dentro de `domain/`** — continua de pé, reconferida.

**Origem:** o `/tech-lead`, ao dimensionar a task de `D5` (PR #35), achou **dois buracos e uma colisão** antes de escrever uma linha. O coordenador reproduziu o principal. **Os três são procedentes** `[MEDIDO 2026-08-29, `master@171b8e7`]`.

**Autoria do achado é dele, e isso importa:** sem ele, **o DoD de `D5` teria sido satisfeito por um `git mv`** — os 4 mutantes que eu escrevi eram todos da forma `ast.Attribute`, que era justamente a metade que funcionava.

## E7 · O buraco do `ast.Name` — **falha do instrumento, não limite dele**

```
import time;                  time.monotonic()   →  rc=1  MORDE
from time import monotonic;   monotonic()        →  rc=0  CEGO
```
`[MEDIDO 2026-08-29 pelo coordenador; reproduzido aqui em 2 diretórios de 1 arquivo]`

**A forma cega é a mais idiomática das duas, e é ESTÁTICA.** Ela **não** é o resíduo de runtime que `E6` declarou: `getattr` não tem ligação estática para consultar; `from time import monotonic` **tem**. A causa é exata e é do meu código: o sítio de chamada é `ast.Name`, `achados()` só entrava em `ast.Attribute`, e **`_bindings` criava a ligação que ninguém consultava** — o dado para ver a forma nua já estava no script, sem uso.

### D7 · **Fechado, não declarado** — e o critério é o da `ADR-012`

`ADR-012` estabeleceu duas formas de tratar lacuna: **fechar** ou **declarar com o dono nomeado**. Declarar é a forma legítima quando fechar produziria `parecendo coberto` (`D1`) ou quando o custo é desproporcional ao benefício (`D5`). **Nenhuma das duas se aplica aqui:** o dado já existia na estrutura, o conserto é um ramo `elif` na mesma travessia, e a lacuna **não é residual — é a metade idiomática do universo**. Declarar isto seria usar a forma "declarar" da `ADR-012` para comprar silêncio barato, que é o oposto do que ela autoriza.

## E8 · A cobertura de `time` não batia com a aritmética da `D3`, e **os dois números estavam errados**

`RELOGIO["time"]` cobria **12** dos **21** que `D3` contava como relógio — `time.ctime()`, `time.asctime()`, `time.clock_gettime_ns()` saíam `rc=0`. Recontando, a **`D3` também estava errada**, e não só por omissão:

| | `D3` original | **corrigido** |
|---|---|---|
| proibidos | 21 | **28** |
| permitidos | 17 | **10** |

O erro de `D3` não foi de conta, foi de **taxonomia binária**: ela perguntava "é relógio?" quando a pergunta certa tem quatro respostas.

### D8 · A taxonomia que decide os casos futuros sem consulta

| classe | o que é | veredito |
|---|---|---|
| **L** — lê | o valor depende de **quando** | proibido — **14** |
| **E** — escreve | efeito sobre o processo ou o sistema (`clock_settime`, `clock_settime_ns`, **`tzset`**) | proibido — **3** |
| **A** — ambiente | depende de **onde**, sem depender de quando (`clock_getres`, `get_clock_info`, `timezone`, `altzone`, `daylight`, `tzname`) | proibido — **6** |
| **ARIDADE** | lê **abaixo de N argumentos**; de N para cima é formatador puro | condicional — **5** |
| **P** — puro | formatação e tipos (`strptime`, `struct_time`, `mktime`, as 7 constantes `CLOCK_*`) | permitido — **10** |

`14+3+6+5+10 = 38`, e a partição é **exaustiva e disjunta sobre `dir(time)`** — conferida por `assert` **dentro da bancada**, que recusa (`rc=1`) se uma versão de Python mudar `dir(time)` `[MEDIDO: controle invertido — removendo `mktime` da partição, `_confere_particao()` → `rc=1` nomeando `sobra=['mktime']`]`.

**Os 9 que estavam `[NÃO SEI]`, decididos um a um:**
`process_time_ns`, `thread_time_ns`, `clock_gettime_ns`, `pthread_getcpuclockid` → **L**. `clock_settime`, `clock_settime_ns` → **E**, e escrever é *mais* grave que ler. `clock_getres` → **A**: é determinístico na mesma máquina e **diferente em outra**, que é a metade "dependência de ambiente" que `D1` nomeia — o defeito que passa em CI e falha em produção. `ctime`, `asctime` → **ARIDADE, e o `/tech-lead` está exatamente certo**: sem argumento leem, com argumento são formatadores.

**Além dos 9, três que eu tinha classificado errado e ninguém pediu** — vão aqui porque a conta não fecharia sem eles: **`tzset` sai de "permitido" para E** (muta o fuso do processo); **`localtime`/`gmtime` saem de L para ARIDADE** (com argumento são conversores); **`strftime` sai de "permitido" para ARIDADE**.

⚠️ **E `strftime` expôs um defeito meu, achado pela própria bateria desta errata:** o limiar de aridade **não é "zero" universal**. `time.strftime("%Y")` tem **um** argumento e ainda assim chama `localtime()` por dentro — só `strftime(fmt, t)` é puro. O limiar é **por nome** (`ARIDADE_MIN_PURO`: `ctime`/`asctime`/`localtime`/`gmtime`/`astimezone` → 1, `strftime` → 2). Com o limiar fixo em 0, `m13_strftime_0arg` saía `rc=0` `[MEDIDO]`.

## A bateria de dois lados — **n=23**, e o placar antes × depois

15 mutantes que **devem morder** + 8 controles que **devem calar**, o mesmo `achados()` chamado nos dois scanners `[MEDIDO 2026-08-29]`:

```
n=23 casos | defeitos ANTES=10 | defeitos DEPOIS=0
```

Os 10 defeitos do scanner mergeado: `m02` nome nu · `m03` nome nu com alias · `m04`/`m05` `ctime()` · `m06` `clock_gettime_ns()` · `m07` `asctime()` · `m12` nome nu **sem ser chamado** · `m13` `strftime("%Y")` · `m14` `tzset()` · `m15` `timezone`. Os 8 controles calavam antes e calam agora — **inclusive os 3 formatadores com argumento** (`ctime(1234)`, `time.ctime(x)`, `strftime("%Y", t)`), que é o lado que prova que a aridade não virou proibição total.

**Falso positivo, com o universo corrigido pelo `/tech-lead`:** são **9 linhas em 2 arquivos** — `dump_window.py` l. 129/171/174/194/196/214/230 **e `retention_probe.py` l. 131/132**, que eu havia perdido — não "7 em 1". Sobre o corpus limpo da `T-03.10` (13 arquivos de `domain/` + `use_cases/`): **`0 leitura(s)`, `rc=0`** `[MEDIDO com o scanner corrigido]`. Controle de não-vacuidade em `infra/`: **5** leituras reais, inalterado.

## D9 · A frase de garantia da `D5`, corrigida

A frase do "Limite declarado" — *"garante que ninguém leia o relógio em camada pura por acidente"* — **era falsa enquanto `E7` existisse**, e é isso que esta errata conserta antes de qualquer outra coisa. O que o instrumento **de fato** entrega, e nada além:

> **Garante:** que toda referência a um nome de relógio que chegue ao sítio de uso por `import`, `from … import` ou `as` seja acusada com `arquivo:linha` — **nas duas formas de sítio** (`ast.Attribute` e `ast.Name`), chamada ou apenas passada adiante, e com a aridade respeitada nos 6 nomes condicionais.
> **Não garante:** nada sobre nome produzido em **runtime** — `getattr`, `importlib`, `eval`. Aí não há ligação estática para consultar, e é a mesma classe que `ADR-011/D3a` declara para o `grimp`.

**A fronteira entre os dois passa a ser exatamente "existe ligação estática?"** — e é uma pergunta com resposta, ao contrário de "por acidente", que não tem.

### D10 · O DoD de `D5` era satisfazível por `git mv` — substituído

O DoD escrito em `D5` listava 4 mutantes, **todos `ast.Attribute`**. Ele **passaria no scanner furado**. Substituído por:

- a **bateria de 23 casos** desta errata (15 mordem, 8 calam), **rc=1 nomeando `arquivo:linha` nos 15** e **rc=0 nos 8** — e ela **precisa incluir `m02`/`m12`**, as formas de nome nu, sem as quais o DoD volta a ser satisfazível por `git mv`;
- **0 falso positivo** sobre as **9** linhas legítimas em **2** arquivos;
- `_confere_particao()` → `rc=1` sob mutação da partição de `time` (controle invertido acima);
- os itens de `boundaries.sh`, `make natureza` e `git push --dry-run` de `D5` **ficam como estão**.

### D11 · Errata de identificador — `T-03.11` → **`T-03.12`**

`D5` nomeia `T-03.11`, que **já existe e está cardada** (`CST-27`, Coinalyze). A task de `D5` é a **`T-03.12`**, criada na PR #35 — que **não é minha para editar**, e não editei. Onde `D5` disser `T-03.11`, leia-se `T-03.12`.

## `[NÃO SEI]` que esta errata abre, com dono

`datetime` **não foi auditado nome a nome** — a pergunta era sobre `time`, e estender sem corpus seria a mesma pressa que produziu `E8`. O caso concreto: **`datetime.fromtimestamp`** usa o fuso **local** com 1 argumento e é determinístico com `tz=`, ou seja, é da família ARIDADE, e **hoje não está em nenhuma lista**. `[NÃO SEI]` declarado, **dono `/architect`**, gatilho observável: o primeiro uso de `fromtimestamp` em `domain/` ou `use_cases/` — hoje **0** `[MEDIDO 2026-08-29: `grep -rn fromtimestamp` nas duas camadas, nos dois lados → 0]`.

## D12 · Status — **continua `proposto`, e o parágrafo do owner está escrito**

O coordenador tem razão no diagnóstico: uma ADR `proposto` **gateando a PR #28** é a mesma contradição texto × ledger que a `ADR-015` teve de resolver hoje. Mas o desfecho da `ADR-015` é precedente nos **dois** sentidos, e o segundo se aplica a mim: o `/tech-lead` **recusou mudar o status sozinho** e levou ao owner. **Eu sou o autor desta ADR** — meu próprio contrato diz *"nunca se auto-aprova"*, e um autor que promove a própria decisão porque ela ficou conveniente é exatamente o ciclo sem portão que este repositório desmonta em toda parte.

⇒ **Fica `proposto`.** O que eu posso fazer é remover a razão para hesitar, e é o que esta errata faz: o instrumento agora entrega a frase que a `D5` promete. **Parágrafo pronto para o owner, se ele aceitar:**

> **Passa a `aceito` em 2026-08-29 pelo owner.** Ela estava `proposto` **enquanto já gateava a `PR #28`** — documento `proposto` sustentando o bloqueio de uma PR é contradição texto × ledger (`CLAUDE.md`). A decisão (`D1`–`D3`) sobreviveu à revisão do `/tech-lead`, que achou **dois defeitos no instrumento e nenhum na decisão**; a `ERRATA 1` os fechou com **n=23, defeitos 0**. `[DECISÃO-OWNER: 2026-08-29]`

**O custo de esperar, medido e não retórico:** a `PR #28` segue travada em `git push --dry-run → rc=1`, com causa única e correta (`Contracts: 2 kept, 1 broken`). **Não é urgência que justifique eu me aprovar** — é o preço de o portão estar certo, e quem o paga decide quando parar de pagar.
