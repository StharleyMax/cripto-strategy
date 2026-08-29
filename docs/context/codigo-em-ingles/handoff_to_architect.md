# Handoff `/pm` → `/architect` — `codigo-em-ingles`

**Data:** 2026-08-29 · **Feature:** `codigo-em-ingles` · **Estado do ledger:** `INIT` (intocado por este ciclo)
**PRD:** [`docs/specs/PRD-002-codigo-em-ingles.md`](../../specs/PRD-002-codigo-em-ingles.md)
**Rev de ancoragem de toda medição:** `master@7af0e4f`
**Componentes:** `docs` (predominante) · `sentimento` (`U2`) · `web` (`U3`)

---

## 0. A irregularidade de fluxo, dita primeiro

**A `ADR-013` foi escrita ANTES deste PRD.** O fluxo normal é `/pm` → `/architect`; aqui o `/architect` mediu primeiro porque a pergunta *"isto pode ter portão?"* precisava de resposta antes de o escopo poder ser escrito. **O PRD não repete as medições da `ADR-013`** — ele reproduz as que usa, ancoradas em `7af0e4f`, e onde um número mudou o documento diz por quê.

**E ela foi ATUALIZADA durante a redação.** Escrevi contra `ace9fa9` (`proposto`, 369 linhas); você publicou `6aaefb1` (**`aceito`**, 518 linhas) e a PR #18 entrou. **Fiz uma revisão `R1` e o mapa está em PRD §0.1.** Resumo do que ela mudou aqui:

| | a sua revisão | o que fiz |
|---|---|---|
| `D3` fechada, rótulo `[DECISÃO-OWNER]` | **convergência independente** — §3.3 já usava esse rótulo pelo mesmo argumento, escrito antes de eu ler `6aaefb1` | nada a mudar |
| **`D4`** endereça o glossário ao `/pm`, *"como dívida referenciada, não como requisito"* | **acatei literalmente.** `[GAP G3]` cita `D4` e declara que **nenhum critério de aceite depende do glossário** | §10 reescrito |
| você declarou *"27 é piso, não teto"* (o detector não vê parâmetro) | **eu quantifiquei o piso** para os 2 arquivos de `U2`: **40 de 70 nomes ligados**, por `ast`. **Não é correção sua — é o número que a sua afirmação não tinha** | §4.2 reescrito, com a nota de que os dois números medem universos diferentes e não se contradizem |
| você chegou à divisão VIVA × HISTÓRICA, com 10 arquivos / 5 + 5 | **convergência independente**, e sobra **uma divergência real** — o plano `01` | **§5.2.1 nova, e é o item que eu devolvo a você** |
| a ressalva de que a exceção cria classe nova de FP para instrumento futuro | adotei, **e virou critério de aceite**: `CA-U1-6`, o medidor de erosão | §3.3 e §6/`U1` |

**Nada da sua revisão me segurou.** Você escreveu que o PRD tinha tudo de que precisava, e tinha.

---

## 1. O que este PRD decide, e o que ele devolve

### Decide

1. **A fronteira do universo em 12 linhas** (PRD §3.1) — as 8 de `ADR-013/D3` **mais 4 superfícies que ela não listava**, e as 4 existem na árvore de hoje com divergência viva.
2. **A exceção do vocabulário de componentes está escrita** (§3.3), com o rótulo correto: `[DECISÃO-OWNER: 2026-08-29, escolha entre alternativas apresentadas]` — **não** `[PREMISSA-OWNER]`. Isto **fecha a pergunta bloqueante que `ADR-013/D3` deixou aberta.**
3. **Quatro unidades de valor**, com retroativo e prospectivo separados (§6).
4. **Um mecanismo automático, medido dos dois lados em bancada, com corpus de retenção** (§12) — e **duas variantes construídas e recusadas com o número que recusa cada uma**.

### Devolve — três perguntas, e duas são do owner

| | pergunta | decide | bloqueia |
|---|---|---|---|
| **`[Q1]`** | nome de **evento de log** e chaves de `extra=` vão para inglês? | **owner** | `U4` apenas — **não** bloqueia `U1`, `U2`, `U3` |
| **`[Q2]`** | **segmento de URL** (`"/painel"`) é código ou superfície de produto? | **owner** | nada hoje; custo cresce na fase `05` |
| **`[Q3]`** | **onde a convenção mora** fisicamente | **você** | `CA-U1-1` não fecha sem ela |

---

## 2. As três coisas que eu acho que mais mudam o seu trabalho

### 2.1 O universo de `backend/tests` é **40 identificadores, não 19** — e o instrumento é a razão

`ADR-013` mediu por `grep -E '(def|class) …'` e publicou **19**. Esse instrumento **não vê parâmetro, variável local nem constante de módulo**. Re-medido por `ast` sobre os **mesmos 2 arquivos**: **70 nomes ligados distintos, 40 em português** `[MEDIDO 2026-08-29 em 7af0e4f]`.

**A conclusão da `ADR-013` não muda; o dimensionamento da task, sim** — e a lista fechada dos 40, integral e sem reticências, está em PRD §6/`U2`, junto com o script que a re-deriva. **Ela foi classificada à mão, token a token, de propósito:** §1.3 do PRD mediu que dicionário erra em `so`, e `so` **existe nesta árvore como identificador** (`so_linha_em_branco`).

**E o universo cabe em 2 arquivos** — os mesmos 2 cujo **nome** está em português, nascidos no mesmo commit (`3b31ebc`, `T-01.1`). Isso torna o diff revisável por inteiro.

### 2.2 *"Atualize as 9 citações de `Filtro.tsx`"* produziria uma violação de `CLAUDE.md`

O número **9** está correto para o token `Filtro.tsx`; para a palavra `Filtro` são **12**, e `harness.toml` cita, em 3 linhas que o primeiro grep não pega, o caminho de sonda `frontend/src/__sonda__/Filtro.test.tsx` com um `rc` **medido** ao lado.

**Mas o ponto que mais importa é outro: as 9 se dividem em VIVAS e HISTÓRICAS, com regras opostas.** `docs/INDEX.md` é **append-only por `CLAUDE.md`**; ADR e plano são decisões **datadas**, verdadeiras no rev que declaram. **Um builder que receber "atualize todas as citações" vai reescrever o `INDEX.md`.** A enumeração normativa está em PRD `CA-U2-4` e `CA-U3-4`, e ela é para copiar para a task, não para resumir.

### 2.3 Duas superfícies de contrato que ninguém tinha listado, e as duas já divergem

**Evento de log** — 9 nomeados em `backend/src`, **4 em português e 5 em inglês**, nascidos no mesmo mês (PRD §4.4). O próprio `docs/INDEX.md:68` registra que *"a divergência é decisão de leitura do agente, não citação do owner"*. **Não é identificador** (não quebra import) e **não é documento**: é **chave de consulta operacional**, e o consumidor vive fora deste repositório. Renomear devolve zero linhas **em silêncio**. ⇒ `[Q1]`, e `[GAP G2]`.

**Coluna de contrato** — `janela_de_perda` é uma das 15 colunas que `ADR-008/D3` fixou, e a ordem alimenta o `sha256` da projeção canônica. **A exceção já está escrita em código de produção, em inglês, com o motivo** (`ingest_record.py:87-89`). O PRD a lista como exceção com dono (`ADR-008/D3`) e nomeia o momento em que ela volta: `[GAP G1]`, na fase `07`.

---

## 3. O que eu recomendo que a SPEC decida, com o argumento

| # | decisão | minha recomendação | rótulo |
|---|---|---|---|
| **A1** | onde a convenção mora (`[Q3]`) | **`CLAUDE.md`** — é lido no bootstrap de todo agente e já carrega o vocabulário fechado; o `README` da raiz tem o precedente de `D1.10` mas não é lido por padrão | `[INFERRED: recomendação de PM]` |
| **A2** | onde o verificador de §12 mora | **em lugar nenhum permanente — rodado à mão pelo `/qa`**, porque ele **expira** quando a renomeação termina. Criar alvo de `make` paga custo permanente por benefício de 2 tasks, e é o falsificador nº 4 de `ADR-012/D5(b)` | `[INFERRED: recomendação de PM]` |
| **A3** | ordem das unidades | **`U1` → (`U2` ‖ `U3`)**, com `U4` em paralelo assim que `[Q1]` voltar. `U2` e `U3` não se tocam (componentes e diretórios disjuntos) e podem ir em worktrees paralelos | `[INFERRED: os diffs são disjuntos, medido]` |
| **A4** | `U2` e `U3` cabem numa fase só? | **sim, e recomendo que caibam.** 2 + 4 arquivos, 49 identificadores, diff revisável por inteiro. Fragmentar multiplica o risco de rename não-atômico, que é o único risco real | `[INFERRED: recomendação de PM]` |

---

## 4. Onde eu discordo do que me foi passado — dois pontos, com o número

**(a) *"os 4 arquivos do `frontend/` estão em português, nome e identificadores"*.** São **3 de 4** nomes-base: `config.ts` é inglês, e o português ali é o **diretório** `painel/`. A `ADR-013` já tinha feito essa correção e eu a confirmo em `7af0e4f`. **A distinção não é preciosismo:** nome-base e segmento de diretório são superfícies diferentes, com conjuntos de citação diferentes — `Filtro.tsx` é citado em 9 arquivos, `features/painel` em 8, e **os conjuntos não coincidem** (`backend/README.md` cita o diretório e não o arquivo).

**(b) *"renomear `Filtro.tsx` sem consertar a citação converte a prova em `rc=0` por caminho inexistente"*.** Correto, e **incompleto pelo lado que mais assusta**: `harness.toml` cita `features/painel/` em **5 linhas**, e **4 delas são a metade MORDE** (`serie.tsx`, o violador plantado), não a metade CALA. **Renomear o diretório invalida as DUAS metades da prova de dois lados, não só a CALA.** É por isso que `CA-U3-3` manda re-executar os **quatro** casos de `ADR-011/D4` **depois** do rename, e não só o do `Filtro.tsx`.

---

## 5. O que eu NÃO fiz, e é para você conferir que eu não fiz

- **Não movi o ledger.** `harness pipeline state codigo-em-ingles` → `INIT`, antes e depois. Nenhum `dispatch`, nenhum `advance`, nenhum `approve`.
- **Não criei, editei nem comentei nada no tracker.** `tracker.kind = jira`, projeto `CST` — e unidade de valor no tracker é ato posterior à sua validação.
- **Não criei task.** Unidade de trabalho é do `/tech-lead`.
- **Não escrevi código.** A bancada de PRD §12 rodou num diretório temporário, sobre uma árvore **extraída** de `7af0e4f`. **Nenhum arquivo sob `backend/` ou `frontend/` do repositório foi tocado** — outros agentes estão em worktrees paralelos sobre esses caminhos.
- **Não editei a `ADR-013`.** Ela é sua.
- **Não reescrevi nenhuma linha existente de `docs/INDEX.md`.** Acrescentei uma.

---

## 6. Os dois portões de owner, e não há rota que os evite

`approve codigo-em-ingles spec` e `approve codigo-em-ingles build` são **do owner** por `CLAUDE.md`. O owner **aceitou explicitamente** que eles ficam no caminho (`[DECISÃO-OWNER: 2026-08-29]`). A rota que os evitaria — task em `plataforma-dados`, que está em `BUILD_AUTHORIZED` — é a que `ADR-013/D1` recusa, e recusa por três razões, sendo a primeira que a convenção governa **6 componentes** e morreria no `advance DONE` de uma feature sobre **1**.

## 7. ⏸ O item que eu devolvo a VOCÊ — e é o único em que nós discordamos

**PRD §5.2.1.** Você classifica `docs/plans/SPEC-001-plataforma-dados/01_governanca_gateante.md` como citação **VIVA**; eu o classifiquei como **HISTÓRICA**. O objeto é o mesmo, então um de nós está errado.

- **seu argumento (VIVA):** é receita executável, e `CA-U3-3` manda re-executá-la depois do rename. Receita que nomeia arquivo inexistente é âncora morta.
- **meu argumento (HISTÓRICA):** é linha de **DoD de fase concluída** — `D1.3b` fechou com `/qa APPROVED` e `/review COMPLIANT`, e nenhum dos dois vereditos foi dado sobre `Filter.tsx`. Reescrevê-la muda o registro de um critério **já cumprido naquele rev**.
- **minha recomendação, que é uma terceira leitura** `[INFERRED: recomendação de PM]`**:** o plano é **híbrido**, e a saída não é escolher um lado — **a receita viva já mora em `frontend/README.md`**, em 4 lugares, como protocolo executável com `printf`/`rm`, e esse arquivo está em VIVA nos **dois** inventários. ⇒ atualizar o `README` mantém a receita; deixar a linha do plano preserva o registro. **Nenhuma âncora morre, nenhum registro é reescrito.**

**`CA-U3-4` lista o plano em HISTÓRICA provisoriamente.** O plano é seu; se você o mover para VIVA, a SPEC tem de dizer o que fazer com o fato de que o veredito de `/qa` daquela fase foi dado sobre o nome antigo.

---

## 8. O que eu preciso de você

`[READY FOR SPEC]` ou a lista de bloqueantes. Se algum ponto deste PRD depender de algo que só a atualização da `ADR-013` fecha, **nomeie qual** — o coordenador segura o PRD em vez de eu inventar a resposta.
