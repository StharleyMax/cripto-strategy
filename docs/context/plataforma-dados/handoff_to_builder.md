# Handoff `/tech-lead` → `/build` — `plataforma-dados`

**Data:** 2026-08-25 · **Papel de origem:** `/tech-lead` · **Estado do ledger ao fechar:** `TASKS_APPROVED`
**Aprovação que autorizou a materialização:** owner, 2026-08-25, declaração literal **"tasks aprovadas"**
(`approve tasks` no ledger em `2026-08-25T19:51:34Z`).

> ⛔ **O gate `build` é do OWNER.** Este handoff descreve trabalho; não o autoriza. Nenhuma linha de
> código de produção foi escrita nesta sessão, e `TASKS_APPROVED` ≠ `BUILD_AUTHORIZED`.

---

## 1. O que existe agora, com o comando que prova

| artefato | onde | verificação |
|---|---|---|
| tasks no tracker | `CST-8`..`CST-88`, **81 tasks**, filhas dos Epics `CST-1`..`CST-7` | `jql: project = CST AND parent IN (CST-1,CST-2,CST-3,CST-4,CST-5,CST-6,CST-7)` |
| dado de máquina | `docs/context/plataforma-dados/tasks.toml` | `harness tasks validate plataforma-dados` → **`OK: 81 task(s), 0 ERROR, 0 WARN`** (exit 0) |
| narrativa e racional | `docs/context/plataforma-dados/tasks_review.md` (720 linhas) | aprovada pelo owner |
| escopo de caminhos | declarado no ledger | `harness pipeline scope plataforma-dados list` |

**Zero Epic novo.** 7 Epics antes, 7 Epics depois. Nenhuma fronteira de valor movida, nenhuma unidade
de valor criada — isso é do produto, não deste papel.

---

## 2. ⚠️ A contagem final é 81, não 82 — e a razão é uma decisão do owner que não foi tomada

A narrativa aprovada diz **82**. Materializei **81**. A diferença é **exatamente uma task**, e ela é a
que a própria narrativa declarou **contingente**:

> `T-03.12` · *coletor de spread `GET /fapi/v1/depth?limit=5` a 1/min* — *"existe se e somente se
> `Q17` = (c)"* (`tasks_review.md` §6, "Contingente").

`docs/decisoes-do-owner.md:50` diz que **`Q17` está `RESPONDIDA COM RESÍDUO`**, e o resíduo, literal na
linha final de §Q17, é: **"⇒ RESÍDUO NOMEADO, e é do owner: (a2) ou (a3)?"** — assumir o spread, ou
medi-lo a 1/min. **(a3) é a opção que a narrativa chamou de "(c)".** Ela **não foi escolhida**.

⇒ **Criar `T-03.12` seria escolher (a3) pelo owner; não criar é obedecer ao contingente como escrito.**
Nada depende de `T-03.12` no grafo (`grep T-03.12 tasks.toml` → nenhuma ocorrência em `depends_on`),
então a ausência não deixa dependência órfã.

**O que fazer quando `Q17` for respondida:**
- **(a3)** ⇒ criar `T-03.12` sob `CST-2`, `phase = "03"`, `components = ["sentimento"]`,
  `depends_on = ["T-01.1"]`, rótulos `spec-001 fase-03 sentimento capture-or-lose`. Números já medidos
  e prontos para o DoD: **20 símbolos × 1/min = 40 de peso contra `REQUEST_WEIGHT 2400` = 1,67%**;
  **295 B/chamada, peso 2**; **~3,1 GB/ano**.
- **(a2)** ⇒ a task **não nasce**, e o spread passa a ser **premissa nomeada, versionada e carimbada no
  resultado — nunca constante dissolvida no número**.

**`CL-4` não morre em nenhum dos dois casos.** Encolhe ~110×, e continua capture-or-lose.

**Colisão de rótulo que vale corrigir na próxima edição da narrativa:** `tasks_review.md` usa "(b)/(c)"
como rótulos de *opção*, enquanto `decisoes-do-owner.md` usa "(a)/(b)/(c)/(d)" como rótulos
*estruturais* (opções / medido / trava / relógio) e numera as opções **(a1)/(a2)/(a3)**. As duas
leituras convergem no significado, mas o "(c)" da narrativa é o "(a3)" da fonte única.

---

## 3. As duas arestas contestadas — MARCADAS, NÃO APLICADAS

O grafo materializado é **o que o `index.md` do plano declara**, não o que o `/tech-lead` propôs.
`D-1` e `D-2` seguem **pendentes de decisão do owner**.

### 3.1 Onde a marca está, e como recuperá-la

| superfície | forma | comando de recuperação |
|---|---|---|
| `tasks.toml` | string com prefixo `CONTESTADO:` dentro de `refs` | `harness tasks json plataforma-dados \| grep -B4 CONTESTADO` |
| Jira | rótulo `contestado-d1` / `contestado-d2` | `jql: project = CST AND labels IN (contestado-d1, contestado-d2)` |
| Jira | bloco `⚠️ ARESTA CONTESTADA` no fim da descrição | visível ao abrir a issue |

**Por que `refs` e não um campo próprio.** `TASK_KEYS` do validador (`scripts/tasks.sh:126`) é
vocabulário **fechado**; chave fora dele cai em **V-09**, cuja própria mensagem diz *"chave IGNORADA
pelo validador: nada a le, nada a valida"* (`scripts/tasks.sh:565`). Um campo inventado seria um
marcador que **nada lê** — exatamente o que se queria evitar. `refs` é **obrigatório**, é lista de
string livre, sai no `harness tasks json` e é greppável. O rótulo Jira dá o `jql`, que é o que torna a
aplicação posterior *"um jql e um edit"* em vez de arqueologia sobre 720 linhas.

### 3.2 `D-1` — `Q16` a montante de `CL-1..CL-5`

- **Marcadas (3):** `T-01.2` (`CST-9`), `T-01.3` (`CST-10`), `T-05.1` (`CST-35`).
- **Aresta:** o plano declara `01 (inteira, com Q16) ─> 02` **e** `01 ─> 03`.
- **Aplicar significa:** só `T-01.1` (o runner) precede `02`/`03`/`04`; `T-01.2`/`T-01.3` passam a
  preceder `05`. Edição concreta: `depends_on += ["T-01.2"]` em `T-05.1`, e afrouxar o gate de fase de
  `02`/`03` no `index.md`.
- **Argumento:** `tasks_review.md` §7/D-1. Verificado por fora e confirmado: a fase `01` declara
  *"Gate: nenhum"* no cabeçalho, e `D1.3` exige a cobertura de `frontend/` **fechada e medida por
  bloqueio devolvido** — logo a outra resposta de `Q16` (*"re-declarar a lacuna"*) **reprova o DoD da
  própria fase**. `Q16` tem `RELÓGIO: NÃO`; `03` tem o único relógio irreversível do projeto.

### 3.3 `D-2` — o maior risco técnico agendado depois de quem o assume

- **Marcadas (2):** `T-08.2` (`CST-70`, origem), `T-05.2` (`CST-36`, alvo).
- **Aresta:** `D8.19` (eixo do Lightweight Charts, **288 pontos + 1.440 candles, tolerância 0,5 px**,
  `[NÃO MEDIDO]`, *"o maior risco técnico desta especificação"*) vive na fase `08`.
- **Aplicar significa:** `depends_on += ["T-08.2"]` em `T-05.2`. E, se a contabilidade tiver de
  acompanhar a ordem, **`T-08.2` migra de `CST-6` para `CST-1`** — **isso muda a atribuição de um Epic,
  logo é decisão do owner e não deste papel.** Deixei em `CST-6`.
- **Argumento:** `tasks_review.md` §7/D-2. **16 tasks de `charts`** (`05` + `08`) são construídas sobre
  a premissa que este spike testa, e testá-lo custa **uma página estática com 1.728 pontos sintéticos**:
  zero rede, zero API key, zero dado real, zero dependência de fase.

---

## 4. `D5.6` — a marca que EU ERREI, e a correção com o comando

**`T-05.7` (`CST-41`)** depende de `D5.6`. Na primeira passada marquei a task como **não conferível**,
afirmando que as edições `E-1..E-4` de `ADR-010` §5 estavam *"preparadas e NÃO APLICADAS"*.
**Estava errado, e a causa é nomeável: repassei a afirmação do texto da ADR sem medir os arquivos.**

Medido depois:

| edição | alvo | estado real | comando |
|---|---|---|---|
| `E-1` | `docs/specs/SPEC-001-plataforma-dados.md:542` | **APLICADA** | `sed -n '542p'` → bloco *"REVOGADO e SUPERSEDIDO por `ADR-010`"* |
| `E-2` | `SPEC` linha de `Q13` (hoje `:649`) | **APLICADA** | `grep -n Q13` → `Q13` = **`RESPONDIDA`**, *"trocar = 4 valores de hue + 361 medições"* |
| `E-3` | `docs/plans/SPEC-001-plataforma-dados/05_fatia_visivel.md:34` | **APLICADA** | `sed -n '34p'` → `D5.6` já com 361 medições e `#f23645 ↔ #eb6834` FAIL 5,3 |
| `E-4` | `docs/context/plataforma-dados/tasks_review.md:307` | **NÃO aplicada** | `grep '2 tokens'` → ainda presente |

`git diff --stat` → SPEC **+9/−3**, plano **+1/−1**.

**⇒ `D5.6` está atualizado e `T-05.7` É CONFERÍVEL HOJE.** E o comando do DoD roda:
`node scripts/validate_palette.js` → **exit 0** `[MEDIDO 2026-08-25]` — o script **existe**, o que era
`[NÃO MEDIDO]` quando `D5.6` o nomeou. **A correção foi aplicada nas duas superfícies** (`tasks.toml`
`refs` de `T-05.7` e descrição de `CST-41`), com o erro anterior declarado em vez de apagado.

### 4.1 Duas ressalvas que sobrevivem à correção

1. **`E-1`..`E-3` estão no working tree e NÃO COMMITADAS** (`git status` → ` M`). **Um checkout limpo
   ainda traz os números revogados.** Isto é dívida de commit, não de conteúdo.
2. **`E-4` é o único resíduo real de conteúdo:** `tasks_review.md:307` ainda diz *"trocar custa 2
   tokens"*, quando o medido é **25 tokens · 4 valores com hue · 361 medições**. **Não corrigi de
   propósito:** a narrativa é artefato **aprovado pelo owner**, e reescrevê-la sem o gate dele é o
   defeito que `ADR-010` §5 existe para evitar. Rótulo Jira que carrega isso: `dod-superseded-adr-010`.

### 4.2 Correção de estado que vale para quem lê o review

**`Q13` está `RESPONDIDA`** pelo owner em 2026-08-25 (convenção ocidental), não `ABERTA` como
`tasks_review.md` §6 registrou, e a `SPEC:649` já reflete isso. Ela **continua não gateando** — mas não
porque a troca é trivial (não é), e sim porque **a decisão já foi tomada**.

**E uma correção ao briefing desta sessão:** `ADR-010` foi descrita como *status `proposto`, ainda não
aceito pelo owner*. O cabeçalho do arquivo diz **`ACEITO pelo owner em 2026-08-25`**, com declaração
literal citada, e **supersede `SPEC-001` §6.2**. Materializei contra o arquivo, não contra o briefing.

---
## 5. Status declarado: 18 `blocked`, em dois eixos que NÃO devem ser colapsados

`harness tasks list plataforma-dados` → `total=81 linked=81 local=0 uncarded=0`.

### 5.1 Bloqueio por pergunta de owner em aberto — 16 tasks

| pergunta | tasks | relógio |
|---|---|---|
| **`Q1`** autoriza ligar os coletores | `T-02.1` `T-02.2` `T-03.2` `T-03.3` `T-03.4` `T-03.5` `T-03.8` `T-03.11` — **8** | **SIM, capture-or-lose. Único item sem mitigação de engenharia: ~1 dia perdido por dia** |
| **`Q16`** dono de `charts`/`web` | `T-01.2` `T-01.3` `T-05.1` — **3** | NÃO de dado; **SIM de retrabalho** (antes do primeiro `.tsx`) |
| **`Q3`** canal de alarme fora do browser | `T-07.11` `T-09.5` — **2** | SIM condicional — **é o que impede os OUTROS de perderem** |
| **`Q19`** `availability_probe_set` | `T-03.6` — **1** | **SIM. Decide quais séries têm defasagem real PARA SEMPRE** |
| **`Q11`** owner marca o corpus | `T-08.9` — **1** | NÃO |
| **`Q10`** ordem monitorar/pesquisar/executar | `T-08.6` — **1** | NÃO (parcial: decide teclado e densidade, não a existência) |

### 5.2 Bloqueio por NÚMERO QUE FALTA — 2 tasks, e não é pergunta de ninguém

| task | número | comando | consequência de não ter |
|---|---|---|---|
| `T-03.9` | **região da VPS** | `curl -s ipinfo.io` de dentro da VPS | **`observer_region` é coluna de F0, impossível retroativamente.** Gravar F0 sem ela é gravar F0 errado, sem correção posterior |
| `T-08.1` | **região + `free -m` + `df -h`** | três comandos, uma sessão de SSH | teto no falsificador de `ADR-002`; e decide se qualquer byte de série pode morar local (a VPS roda **6 serviços**, sob pressão de disco documentada em `KAN-86`) |

**Os dois eixos ficam separados de propósito.** Colapsar *"esperando o owner"* com *"esperando um ssh"*
faz o segundo nunca ser resolvido, porque passa a parecer decisão de terceiro. **A região tem relógio:
ela vence junto com `Q1`, não com `08`.**

### 5.3 Não bloqueiam, e é deliberado
`Q18` (parâmetro da fila, não gate — §7/D-5) · `Q20` (`swing_point` sobrevive a qualquer resposta) ·
`Q12` (parcial: mecanismo anda, conteúdo de ~5 linhas/ano espera) · `Q4` (parcial) · `Q5` `Q6` `Q8`
`Q14` (`INFERÍVEL`, revertem sem migração de dado) · `Q7` · `Q2` (**RESPONDIDA**).

### 5.4 ⚠️ E uma que não bloqueia task nenhuma, e é por isso que está aqui
**`Q15` (ToS de Binance, Bybit e Coinalyze) · `ABERTA` · `[MEDIDO]: nada` — ninguém leu os três ToS.**
Nenhuma das 81 tasks está tecnicamente travada por ela. **A restrição incide RETROATIVAMENTE sobre
exatamente o que `Q1` manda acumular.** ⇒ a recomendação técnica é *"aprove `Q1` hoje"* e a de risco é
*"leia `Q15` antes"*. Não tenho como dissolver a tensão e não vou fingir que a decomposição a dissolve.

---

## 6. Por onde começar, se e quando o owner abrir o gate `build`

**Fase `01` é o gate declarado do plano, e `T-01.1` é a única task dela sem bloqueio.** Ela entrega o
runner (`[test_cmd]` deixa de devolver `{}`), e `D1.1` exige que o primeiro teste **seja um dos de
`02`/`03`** — o que amarra o runner ao trabalho de relógio.

**As três tasks sem gate nenhum e com valor de decisão desproporcional ao custo** — todas as três
mudam o desenho de outras tasks e nenhuma depende de pergunta em aberto:

1. **`T-03.1` (`CST-17`)** — medir se o WS `aggTrade` carrega `nq`. **1 símbolo, 1 mensagem.** Se não
   carregar, **`T-03.4` muda de desenho** (passa a depender de REST, peso e janela de 48 h). E `T-03.4`
   é a task de maior relógio do projeto.
2. **`T-03.7` (`CST-23`)** — rampa até o primeiro 429. `SPEC` §9.2 declara esta medição **não
   diferível**: decide se S4 ao vivo existe.
3. **`T-08.2` (`CST-70`)** — o spike do eixo. Uma página estática, zero rede. **Se `D-2` for aceita,
   esta é a primeira task de `charts` a rodar.**

**E os três números de SSH (`ipinfo.io`, `free -m`, `df -h`)**, que não são task de código e destravam
`T-03.9` e `T-08.1`.

---

## 7. Escopo de caminhos declarado

```
harness pipeline scope plataforma-dados list
```

`harness.toml` **está na lista de propósito**: `T-01.1`..`T-01.4` o editam, e escopo que não inclui o
arquivo que a fase `01` inteira modifica é escopo que não protege nada. **`data/` está FORA** — é
gitignored, ~850 MB, dado de terceiro re-obtenível, catalogado em `data/MANIFEST.md`.

---

## 8. O que este papel recusou fazer, e por quê

| recusa | motivo |
|---|---|
| aplicar `D-1` ou `D-2` | são decisões de grafo (e `D-2`, de atribuição de Epic). Marcadas, não aplicadas |
| criar `T-03.12` | o contingente `Q17 = (a3)` não foi escolhido pelo owner |
| aplicar `E-1..E-4` de `ADR-010` | tocam SPEC, plano, `docs/product/` e a narrativa já aprovada — nenhum é artefato deste papel |
| corrigir o `9` de `D9.1` para `10` | é DoD de plano aprovado. Registrado dentro de `T-09.1` (`CST-83`), que é onde se reconcilia |
| corrigir o defeito de tabela do `index.md` na linha `07` | plano é artefato do `/architect` (§7/D-6) |
| criar Epic, unidade de valor, ou componente | do produto e do owner. Vocabulário fechado inalterado |
| escrever qualquer linha de código de produção | `TASKS_APPROVED` ≠ `BUILD_AUTHORIZED` |

---

## 9. Próximo passo

**`/build`** — e o gate é do **owner**, não deste papel nem do builder.

---

## 10. ADDENDUM 2026-08-28 — a fase `01` depois de `ADR-011`

**Nenhuma seção acima foi reescrita.** Elas descrevem o estado de 2026-08-25 e continuam
sendo o registro do que se sabia então — inclusive a contagem `81` da §2 e as `18 blocked` da
§5, que os números abaixo superam sem apagar.

### 10.1 Números de hoje, e o comando de cada um

```
harness tasks validate plataforma-dados   →  84 task(s), 0 ERROR, 0 WARN
harness tasks list plataforma-dados       →  1 done · 68 todo · 15 blocked
harness pipeline state plataforma-dados   →  BUILD_AUTHORIZED
```

`[MEDIDO 2026-08-28, re-rodado DEPOIS de escritos]`. A trilha do total: **81 → 82** (`T-01.5`,
a peça 1 de `ADR-009/D1` que caíra entre os itens do plano) **→ 84** (`T-01.6` e `T-01.7`, os
itens `1.10` e `1.11` do plano reescrito). `T-03.12` continua **não existindo**.

### 10.2 A ordem da fase `01`, e ela é declaração do `/architect`

```
T-01.1 (done) ─┬─> T-01.4 ──> T-01.6 ──┬──> T-01.5
               │                       └──> T-01.7
               ├─> T-01.2
               └─> T-01.3
```

- **`T-01.4` antes de `T-01.6`** porque `T-01.6` reescreve o *conteúdo* de `bootstrap.sh`
  (venv+uv → `poetry install`), e o assert de versão é o que mais facilmente se perde numa
  reescrita.
- **`T-01.6` antes de `T-01.5`** porque `make boundaries` não existe sem o `Makefile` e
  `poetry run lint-imports` não existe sem Poetry.
- **`T-01.6` antes de `T-01.7`** porque o README documenta a ativação da venv **por comando
  `make`**.

### 10.3 Cinco coisas que reprovam a fase se forem lidas pela metade

1. **`T-01.5` tem DUAS metades.** `import-linter` **e** `scripts/hooks/pre-push.pre-harness`
   rodando `make boundaries`. Sem a segunda, a ferramenta existe e ninguém a roda — não há CI
   (`ls .github` → inexistente) e o `pre-push` gerado não chama `make`. **Zero edição no hook
   gerado, zero `core.hooksPath`** (proibido pelo `CLAUDE.md`): o hook gerado **já** resolve e
   executa `hooks/pre-push.pre-harness`, e `scripts/install-git-hooks.sh` **já** o instala.
2. **`D1.9` não fecha com uma task só.** `T-01.4` traz `.python-version`, `mypy
   python_version`, `ruff target-version` e `PY_ALVO`; `T-01.6` traz `requires-python`. Quem
   fechar uma e declarar o DoD cumprido declarou verde sem olhar a outra metade.
3. **As duas recusas `rc=3` do piso são contrato.** Relatório **ausente** → `rc=3`; relatório
   **velho** → `rc=3`. O `Makefile` **CHAMA** `bash backend/scripts/test.sh` — nunca encadeia
   `pytest` e o piso com `;` numa receita, que é o construto de falso-verde que o repositório
   de referência já mediu (`KAN-172`). E **`rc=3` por "venv não existe" NÃO conta como
   aprovação**: é a falha que `backend/poetry.toml` existe para impedir.
4. **`D1.3b` é medição, não citação.** A frase *"AST não tem os dois defeitos da regex"* é
   **mecanismo**, e está `[NÃO MEDIDO]` neste disco. O ESLint **do projeto** tem de acusar
   `tipos.ts`, calar em `config.ts` e calar em `Filter.tsx`.
5. **Docstrings em inglês são CONVENÇÃO, não portão.** `D1.10` **reprova** se alguém declarar
   uma `[[rules.own]]` de idioma: a de diacrítico devolve **0 achados sobre 18**, e a de
   palavra-função ASCII pega **12 de 18**.

### 10.4 Escopo de caminhos — ampliado, e a §7 acima está desatualizada de propósito

Sete caminhos que as tasks novas escrevem eram **recusados** pelo portão de escrita
`[MEDIDO 2026-08-28: harness pipeline require-code]`. O escopo foi de **8 para 19** prefixos e
os sete passam a devolver *"código permitido"*. O vigente sai por comando — não confie nesta
lista nem na da §7:

```
harness pipeline scope plataforma-dados list
```

### 10.5 Cards

`T-01.5` → **`CST-89`** · `T-01.6` → **`CST-90`** · `T-01.7` → **`CST-91`**, Tarefas no Epic
`CST-1`. `CST-9` e `CST-11` atualizados. **Nenhuma task da feature está `local_only`.**
O rótulo `bloqueada-q16` foi removido de `CST-9`, `CST-10` e `CST-35`
`[MEDIDO depois da remoção: JQL do rótulo → total 0]`.
