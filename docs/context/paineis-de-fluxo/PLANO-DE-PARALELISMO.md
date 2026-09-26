# `paineis-de-fluxo` — plano de paralelismo

> Exigido por `D8` (`docs/context/cinco-metricas-do-core/handoff/DECISOES-OWNER.md:164-183`).
> `[PREMISSA-OWNER: 2026-09-10]`, literal: *"Faça o tl montar uma plano de paralelismo e exectamos
> a partir desse plano com no máximo 2 execuções simultaneas"*.
>
> **O plano é o que a execução segue. Não é para o orquestrador improvisar o agrupamento na hora.**
>
> Gerado pelo `/tech-lead` em 2026-09-23 sobre a quebra de [`tasks_review.md`](tasks_review.md) (39
> tasks). ✅ **Conferido contra o [`tasks.toml`](tasks.toml) materializado:** os `depends_on` das 39 tasks
> são **iguais** aos do dicionário de §5 `[MEDIDO 2026-09-23: tomllib × regex sobre este arquivo, 39 = 39]`.
> Se um dia divergirem, vale o `tasks.toml`, e este documento é refeito.
>
> **Aprovado** `[DECISÃO-OWNER: 2026-09-23, escolha entre alternativas apresentadas]`: wave = fase,
> prioridade padrão da `03a` (§3, **não** §3.1), `T-04.0` entra, e as pernas da `ADR-043` só depois de
> `DONE` desta feature (`tasks_review.md` §7).
>
> ⚠️ **No `tasks.toml`, `03a` e `03b` são as duas `phase = "03"`**: o validador recusa fase com letra
> (`V-11`) e fase sem arquivo de plano (`V-24`). Aqui, "fase `03a`/`03b`" continua sendo o rótulo de
> trilha usado pelo script, e não a chave do `tasks.toml`.

---

## 1. As restrições, e de onde cada uma vem

| # | restrição | origem | força |
|---|---|---|---|
| R-A | ~~≤ 2~~ **≤ 3 tasks simultâneas** em worktree, mesmo quando o DAG liberar mais (**desde 2026-09-24**; era 2) | `D8`, `MEMORY: orquestração`; **`handoff/DECISOES-DO-OWNER-2026-09-24.md` D-2**, *"executando as atividades em parelelo com até 3 tasks ao mesmo tempo"* | `[PREMISSA-OWNER: 2026-09-10]`, sucedida por `[PREMISSA-OWNER: 2026-09-24]` (§7) |
| R-B | **`depends_on`** é respeitado sempre | contrato da quebra | `[DOC]` |
| R-C | **espinha da trilha de tela: `01 → 02 → 04 → 03b`**. A `03a` corre fora dela | `plans/SPEC-009/index.md` §Ordem, despacho | `[DOC]` |
| R-D | **no máximo um editor de `SymbolClient.tsx` por lote** (2.936 linhas, `wc -l` em `61dbf6b`) | `SPEC-009` §8: *"nenhuma outra branch edita `SymbolClient.tsx`"*. Duas worktrees num lote são duas branches | `[DOC]` |
| R-E | **medição de latência roda em lote solo**: `T-01.0`, `T-01.1`, `T-01.10` | ver §2.2 | `[INFERRED: contenção de CPU]` |
| R-F | **o spike `T-01.0` vem antes de qualquer task de produção da F1** | `SPEC-009` §3, despacho | `[DOC]` |

## 2. O que mudou em relação ao plano da `candle-real-e-eixo-unico`

### 2.1 A espinha agora está **no dado**, e não só neste documento

O plano de `candle-real-e-eixo-unico` §2 declarou uma dívida: *"o certo seria o `depends_on` carregar a
aresta `02 → 03`"*. Aqui a primeira task de cada fase da trilha **depende das tasks terminais da fase
anterior** (`T-02.1` ← `T-01.10` + `T-01.11`; `T-04.0` ← `T-02.5`; `T-03.8` ← `T-04.7` + `T-03.7`).

**Prova de que pagou** (§5.1): remover a regra de espinha do script **não muda a saída**. Ela ficou
redundante porque o DAG já a carrega. No plano anterior, a mesma remoção mudava de 30 para 26 lotes.

### 2.2 Por que a latência roda sozinha

`T-01.0` (F-1, F-2 e o controle negativo de 20 ms), `T-01.1` (baseline) e `T-01.10` (tetos) medem `p95` de
intervalo entre frames. Com a outra worktree rodando `next build` ou `make verify`, o `p95` mede a
contenção, e o controle negativo de 20 ms pode sumir no ruído ou aparecer por causa dele. Custo medido
(§5.1): **1 lote** (27 → 26 sem a regra). É barato para não ter um verde que ninguém consegue interpretar.

## 3. Os 27 lotes — o que a execução segue

> ⚠️ **Tabela de 2026-09-23, superada para o que falta da F1.** Os lotes 1–3 foram executados. O que falta segue
> **§7** (teto 3, `T-01.F1`/`T-01.F2`, prioridade por caminho crítico). O texto abaixo fica como registro.

Ordem de cima para baixo. Cada lote tem ≤ 2 tasks, em worktrees isoladas. **Editor** = edita
`SymbolClient.tsx`.

| lote | tasks | wave | nota |
|---|---|---|---|
| 1 | `T-01.0` | — | ⛔ **solo.** Spike, **não mergeado**; só o relatório entra na W1. **Reprovou ⇒ tudo da F1 para** |
| 2 | `T-01.1` | W1 | solo (latência) |
| 3 | `T-01.2` + `T-01.3` | W1 | |
| 4 | `T-01.4` + `T-01.5` | W1 | `T-01.5` editor |
| 5 | `T-01.6` + `T-03.1` | W1 · W2 | `T-01.6` editor. **A `03a` começa aqui** |
| 6 | `T-01.7` + `T-01.8` | W1 | `T-01.7` editor |
| 7 | `T-01.9` + `T-03.2` | W1 · W2 | |
| 8 | `T-01.10` | W1 | solo (latência) |
| 9 | `T-01.11` + `T-03.3` | W1 · W2 | **W1 fecha: PR da F1** |
| 10 | `T-02.1` + `T-02.2` | W4 | `T-02.2` editor |
| 11 | `T-02.3` + `T-03.4` | W4 · W2 | `T-02.3` editor |
| 12 | `T-02.4` + `T-03.5` | W4 · W2 | |
| 13 | `T-02.5` + `T-03.6` | W4 · W2 | **W2 fecha: PR da `03a` → merge → deploy, com o `t0` de disco de `T-03.7`.** **W4 fecha: PR da F2** |
| 14 | `T-04.0` + `T-03.7` | — · W3 | `T-04.0` é spike, não mergeado. ⏱ `T-03.7` **só roda ≥ 24 h depois do deploy**; se o relógio não deixar, ela flutua para o primeiro lote em que deixe, e nada da trilha espera por ela até o lote 21 |
| 15 | `T-04.1` | W5 | |
| 16 | `T-04.2` | W5 | editor |
| 17 | `T-04.3` + `T-04.5` | W5 | `T-04.3` editor |
| 18 | `T-04.4` | W5 | editor — por R-D não divide lote com `T-04.3` |
| 19 | `T-04.6` | W5 | |
| 20 | `T-04.7` | W5 | **W5 fecha: PR da F4** |
| 21 | `T-03.8` | W6 | |
| 22 | `T-03.9` | W6 | |
| 23 | `T-03.10` | W6 | ⛔ reprovou ⇒ **para** antes do pixel |
| 24 | `T-03.11` | W6 | editor |
| 25 | `T-03.12` | W6 | editor |
| 26 | `T-03.13` | W6 | |
| 27 | `T-03.14` | W6 | **W6 fecha: PR da `03b`** |

**Total: 27 lotes sequenciais sobre 39 tasks, ocupação 1,44** `[MEDIDO 2026-09-23: script de §5]`. O que
falta para 2,0 é cadeia de `depends_on` (a `03b` e a `04` são quase inteiras seriais), mais os 3 lotes solo.

### 3.1 A alternativa que NÃO é o default: vaga reservada ao coletor

Com a `03a` pegando a 2ª vaga sempre que tiver task pronta (flag `rf` no script): **30 lotes**, a F1 fecha
no lote **12** em vez do 9, e o coletor entra em deploy depois do lote **8** em vez do 13. Troca **3 lotes
de caminho crítico** por **5 lotes a mais de captura**. Como a `03b` só usa a captura a partir do lote 21,
e ela precisa de só ≥ 24 h, o default fica com a trilha de tela. **A escolha é do owner**
(`tasks_review.md` §7 item 5).

## 4. As waves (a unidade da PR)

**Wave = fase**, herdando o portão por fase de `[DECISÃO-OWNER: 2026-09-19, escolha entre alternativas
apresentadas]` (`candle-real-e-eixo-unico/PLANO-DE-PARALELISMO.md` §7). Os lotes se acumulam na branch
da wave. QA, code-review, design-review e PR acontecem **uma vez por wave**; `make verify` continua por lote.

| wave | branch | tasks | fecha no lote | observação |
|---|---|---|---|---|
| **W1** | `wave/fluxo-f01` | `T-01.1`..`T-01.11` + o relatório de `T-01.0` | 9 | a F2 **só abre depois do merge da W1** |
| **W2** | `wave/fluxo-f03a` | `T-03.1`..`T-03.6` | 13 | aberta ao mesmo tempo que W1/W4. Paths disjuntos (`backend/`, `deploy/`) do front |
| **W3** | `wave/fluxo-f03a-24h` | `T-03.7` | ≥ 24 h depois do deploy | só relatório em `gates/` |
| **W4** | `wave/fluxo-f02` | `T-02.1`..`T-02.5` | 13 | |
| **W5** | `wave/fluxo-f04` | `T-04.1`..`T-04.7` + o relatório de `T-04.0` | 20 | |
| **W6** | `wave/fluxo-f03b` | `T-03.8`..`T-03.14` | 27 | |

⚠️ **W1/W4 e W2 ficam abertas juntas** e as duas escrevem em `docs/context/paineis-de-fluxo/` e acrescentam
linha em `docs/INDEX.md`. O conflito é de linha acrescentada (append-only), e se resolve mantendo as duas.

⚠️ **O teto de 2 é global, não desta feature.** `coinalyze-fora-da-quarentena` está `SPEC_APPROVED` e
aguardando o `/tech-lead` (`harness status`, 2026-09-23). Se ela entrar em build, divide as duas vagas, e
este plano estica. Ela mexe em `sentimento`: o lote que tiver `T-03.3` não pode correr junto com uma task
dela que edite o catálogo de OI.

⚠️ **Pernas da `ADR-043`:** entram **depois de `DONE` desta feature**
`[DECISÃO-OWNER: 2026-09-23, escolha entre alternativas apresentadas]`. A janela entre W1 e W4 foi
recusada.

⚠️ **Fechar a W2 no ledger:** `harness resolve` é atômico por fase, e a `03a` divide `phase = "03"` com a
`03b`. A chamada que marca `T-03.1..T-03.7` como `done` tem de listar `T-03.8..T-03.14` como
`blocked:<motivo>` (por exemplo, *"03b aguarda F4, SPEC-009 §8"*).

## 5. O script que derivou os lotes

```python
import sys
# id: (fase, depends_on, edita_SymbolClient, solo)
T = {
 "T-01.0":("01",[],0,1), "T-01.1":("01",["T-01.0"],0,1),
 "T-01.2":("01",["T-01.0"],0,0), "T-01.3":("01",["T-01.0"],0,0), "T-01.4":("01",["T-01.0"],0,0),
 "T-01.5":("01",["T-01.2","T-01.3"],1,0), "T-01.6":("01",["T-01.5"],1,0),
 "T-01.7":("01",["T-01.4","T-01.6"],1,0), "T-01.8":("01",["T-01.6"],0,0),
 "T-01.9":("01",["T-01.7","T-01.8"],0,0), "T-01.10":("01",["T-01.1","T-01.8"],0,1),
 "T-01.11":("01",["T-01.9"],0,0),
 "T-03.1":("03a",[],0,0), "T-03.2":("03a",[],0,0), "T-03.3":("03a",[],0,0),
 "T-03.4":("03a",["T-03.1","T-03.2","T-03.3"],0,0), "T-03.5":("03a",["T-03.4"],0,0),
 "T-03.6":("03a",["T-03.5"],0,0), "T-03.7":("03a",["T-03.6"],0,0),
 "T-02.1":("02",["T-01.10","T-01.11"],0,0), "T-02.2":("02",["T-01.10","T-01.11"],1,0),
 "T-02.3":("02",["T-02.1","T-02.2"],1,0), "T-02.4":("02",["T-02.3"],0,0), "T-02.5":("02",["T-02.4"],0,0),
 "T-04.0":("04",["T-02.5"],0,0), "T-04.1":("04",["T-04.0"],0,0), "T-04.2":("04",["T-04.1"],1,0),
 "T-04.3":("04",["T-04.2"],1,0), "T-04.4":("04",["T-04.2"],1,0), "T-04.5":("04",["T-04.2"],0,0),
 "T-04.6":("04",["T-04.3","T-04.4","T-04.5"],0,0), "T-04.7":("04",["T-04.6"],0,0),
 "T-03.8":("03b",["T-04.7","T-03.7"],0,0), "T-03.9":("03b",["T-03.8"],0,0),
 "T-03.10":("03b",["T-03.9"],0,0), "T-03.11":("03b",["T-03.10"],1,0),
 "T-03.12":("03b",["T-03.11"],1,0), "T-03.13":("03b",["T-03.12"],0,0), "T-03.14":("03b",["T-03.13"],0,0),
}
a = sys.argv[1:]
TETO   = int(a[0]) if a and a[0].isdigit() else 2      # R-A
EDITOR = "noeditor" not in a                            # R-D
SOLO   = "nosolo"   not in a                            # R-E
ESPINHA= "noespinha" not in a                           # R-C (redundante: ja esta no depends_on)
RF     = "rf" in a                                      # alternativa NAO adotada (§3.1)
trilha = ["01","02","04","03b"]                         # trilha de SymbolClient.tsx; 03a corre fora
def fechada(f, feito): return all(i in feito for i in T if T[i][0]==f)
def liberada(i, feito):
    f = T[i][0]
    if ESPINHA and f in trilha and trilha.index(f)>0 and not fechada(trilha[trilha.index(f)-1], feito): return False
    return all(d in feito for d in T[i][1])             # R-B
prio = lambda i: (0 if T[i][0] in trilha else 1, list(T).index(i))   # a trilha e o caminho critico
feito, lotes = set(), []
while len(feito) < len(T):
    prontas = sorted((i for i in T if i not in feito and liberada(i, feito)), key=prio)
    if not prontas: raise SystemExit("travada")
    if RF:
        tr=[i for i in prontas if T[i][0] in trilha]; fo=[i for i in prontas if T[i][0] not in trilha]
        if tr and fo: prontas = tr[:1]+fo+tr[1:]
    lote, ed = [], 0
    for i in prontas:
        if len(lote) == TETO: break
        if SOLO and lote and (T[i][3] or T[lote[0]][3]): continue
        if EDITOR and T[i][2] and ed: continue
        lote.append(i); ed += T[i][2]
        if SOLO and T[i][3]: break
    lotes.append(lote); feito |= set(lote)
if "q" not in a:
    for k,l in enumerate(lotes,1): print(f"lote {k:2d}: {' + '.join(l):20s} [{' · '.join(sorted({T[i][0] for i in l}))}]")
print(f"TOTAL lotes={len(lotes)} tasks={len(T)} ocupacao={len(T)/len(lotes):.2f}")
for l in lotes:
    assert len(l) <= TETO
    if EDITOR: assert sum(T[i][2] for i in l) <= 1
    if SOLO: assert not (len(l) > 1 and any(T[i][3] for i in l))
```

### 5.1 O falsificador, RODADO `[MEDIDO 2026-09-23, n=39 tasks]`

Cada regra é desligada por vez, e a saída é comparada **por conteúdo** (`md5sum` da lista de lotes), não
só pela contagem. Neste DAG o caminho crítico é serial, e por isso o teto sozinho **não muda o total**,
mas muda **quais tasks andam juntas**:

```
regra desligada   total   a saída mudou?
teto 2 -> 3         27    SIM   (lote 3 vira T-01.2 + T-01.3 + T-01.4)
sem R-D (editor)    27    SIM   (lote 17 vira T-04.3 + T-04.4: dois editores juntos)
sem R-E (solo)      26    SIM   (lote 1 vira T-01.0 + T-03.1: o spike medindo com vizinho)
sem R-C (espinha)   27    NAO   (a espinha já está no depends_on, §2.1)
com rf              30    SIM   (§3.1)
```

**Três das quatro regras mordem.** A quarta não morde **por construção**, e é essa a prova de que a dívida
do plano anterior foi paga. Se algum dia `sem R-C` passar a dizer SIM, alguém tirou uma aresta de espinha
do `tasks.toml`.

## 6. As regras de execução que já valem e este plano não reinventa

- worktree isolada por task, e **só remover a worktree depois de confirmar o commit**;
- `node_modules` entra na worktree por **hard link** (`cp -al`), **nunca por symlink**: o Turbopack recusa
  e o `make e2e` nasce `rc=3` (`candle-real-e-eixo-unico/PLANO-DE-PARALELISMO.md` §6);
- worktree não vê arquivo não-commitado do principal: nunca citar caminho `??` num despacho;
- purgar `__pycache__` antes de acreditar em verde ou vermelho;
- QA de front é **Playwright contra o app real**, com assert de dado no DOM **e ablação**. Assert de DOM
  não prova pixel;
- **nunca semear teste no Postgres compartilhado** (`D-g`): a `T-03.6` roda na stack de e2e própria;
- o `frontend-qa` não grava `gate-record`: o orquestrador roda o comando;
- **revalidar o gate após mudança de produção**, pedindo a mutação e não o relatório;
- subagente morre cedo: passando de ~150 turnos, escreve handoff em `handoff/<TASK>.md` e devolve.

## 7. Emenda de 2026-09-24: teto 3 e as tasks de correção da fase 05

**Origem:** `handoff/DECISOES-DO-OWNER-2026-09-24.md`. **D-1** `[DECISÃO-OWNER: 2026-09-24, escolha entre
alternativas apresentadas]` põe as 3 regressões da fase 05 dentro da F1. **D-2** `[PREMISSA-OWNER: 2026-09-24]`
sobe a R-A para **≤ 3**. A R-D (um editor de `SymbolClient.tsx` por lote) e a R-E (latência em lote solo)
**continuam**. O desenho da correção está em `handoff/FIX-regressoes-fase05.md`.

**O que mudou no script de §5**, e vale também para o `tasks.toml` (conferido com `harness tasks validate`, 41
tasks, 0 ERROR, 0 WARN):

```python
# dicionario T: duas tasks novas, duas arestas novas
 "T-01.F1":("01",[],0,0), "T-01.F2":("01",[],0,0),                 # nenhuma edita SymbolClient.tsx
 "T-01.8":("01",["T-01.6","T-01.F1","T-01.F2"],0,0),              # re-ancora o e2e/20 da F2; exige e2e/18 verde
 "T-01.10":("01",["T-01.1","T-01.8","T-01.F2"],0,1),              # nao mede composicao no instrumento inflado
TETO = int(a[0]) if a and a[0].isdigit() else 3                   # R-A (D-2)
# prioridade: caminho critico primeiro (a cadeia mais longa ate o fim), depois a ordem do dicionario
def altura(i): return 1 + max((altura(j) for j in T if i in T[j][1]), default=0)
prio = lambda i: (0 if T[i][0] in trilha else 1, -altura(i), list(T).index(i))
# partida real: feito = {"T-01.0","T-01.1","T-01.2","T-01.3"} (argumento "real")
```

**O que falta, a partir do estado real** `[MEDIDO 2026-09-24: script emendado, argumento real]`:

| lote | tasks | nota |
|---|---|---|
| 1 | `T-01.5` + `T-01.4` + `T-01.F1` | `T-01.5` é a editora. A `T-01.F1` só toca em `[symbol]/page.tsx` e num módulo puro |
| 2 | `T-01.F2` + `T-01.6` + `T-03.1` | `T-01.6` é a editora. A `T-01.F2` só toca em `e2e/20`. Aqui a `03a` começa, e ela divide o teto com a W1 |
| 3 | `T-01.7` + `T-01.8` + `T-03.2` | `T-01.7` é a editora. A `T-01.8` zera a lista de vermelhos esperados (FIX §6) |
| 4 | `T-01.9` + `T-03.3` | |
| 5 | `T-01.10` | solo (latência). Refaz a baseline de composição do `e2e/20` (FIX §4.1) |
| 6 | `T-01.11` + `T-03.4` | **a W1 fecha aqui**: QA + review, depois PR e merge (D-2) |

**Total a partir daqui: 24 lotes, 41 tasks, ocupação 1,71.** A mesma partida com a prioridade antiga (ordem
do dicionário) dá 25 lotes, e a W1 fecha no lote 7 em vez do 6: a `T-01.4` pegava a vaga do lote 1 e empurrava a
`T-01.5`, que é a cabeça do caminho crítico.

**O falsificador de §5.1, rodado de novo sobre o script emendado** `[MEDIDO 2026-09-24, partida real, n=41]`:

```
regra desligada   total   a saída mudou?
teto 3 -> 2         25    SIM   (lote 1 perde a T-01.F1; F1+F2 viram um lote próprio)
sem R-D (editor)    23    SIM
sem R-E (solo)      23    SIM
sem R-C (espinha)   24    NÃO   (a espinha continua no depends_on, §2.1)
```

⚠️ **O teto de 3 é da execução inteira**, W1 e W2 juntas. A `03a` roda noutra worktree
(`REGRAS-DE-DESPACHO-WORKFLOW-2026-09-24.md`), mas ocupa a mesma vaga.
