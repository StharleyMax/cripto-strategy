# Narrativa de review — a task que a `ADR-016/D5` exige, e que destrava a `PR #28`

**Autor:** `/tech-lead` · **Data:** 2026-08-29 · **Feature:** `plataforma-dados` · **Componente:** `sentimento`
**Âncora de TODA medição desta narrativa:** `origin/master@171b8e7` (worktree `tl-T-03.11`, branch `tasks/T-03.11-scanner-relogio`), com o corpus lido de `task/T-03.10-fila-etl-retomavel@6b8f441`.
**Estado:** aguardando aprovação humana. **Nada foi cardado**, o ledger não foi tocado, nenhum código de produção foi escrito.

> Este arquivo **não substitui** [`tasks_review.md`](tasks_review.md) — aquele é a narrativa de 720 linhas
> aprovada pelo owner em 2026-08-25 (*"tasks aprovadas"*), e **reescrevê-lo seria editar um artefato
> aprovado**. Esta é a narrativa de **uma** task acrescentada depois, pelo mesmo motivo pelo qual
> `decisoes-de-execucao-2026-08-28.md` existe em separado.

---

## 0 · O gate de entrada, e onde eu não passo nele

| exigência do meu papel | medido | veredito |
|---|---|---|
| `harness pipeline state plataforma-dados` == `SPEC_APPROVED` | **`BUILD_AUTHORIZED`** `[MEDIDO 2026-08-29]` | **DIVERGE, e eu declaro em vez de contornar** |
| `index.md` do plano existe | sim | ok |
| destino no tracker identificado | `harness policy --key tracker` → `{kind=jira, project=CST, board_id=36}` `[MEDIDO]` | ok |
| `tasks.toml` válido na base | `harness tasks validate plataforma-dados` → **84 task(s), 0 ERROR, 0 WARN** `[MEDIDO]` | ok |

**Por que sigo mesmo assim, e por que isso não é um portão furado:** `SPEC_APPROVED` é o gate de uma
**decomposição inicial**. Esta feature já passou dele e está em execução; o que se faz aqui é
**inserir uma task numa quebra já aprovada**, motivada por uma ADR mergeada hoje que **nomeia
`/tech-lead` como dono** (`ADR-016/D5`). O estado `BUILD_AUTHORIZED` é *posterior* a `SPEC_APPROVED`,
não anterior — o gate não foi pulado, foi ultrapassado. **Ainda assim registro:** se o owner entender
que inserção em quebra aprovada exige rito próprio, esta narrativa é o lugar de dizer, e eu paro.

---

## 1 · O que a ADR decidiu, e o que sobra para a task

`ADR-016/D1` fixa a regra: **capacidade pura é proibida por import; valor-misturado-com-capacidade é
guardado por uso.** `socket`/`ssl` ficam em `forbidden_modules`; `datetime`/`time` saem e passam a ser
guardados por um scanner de AST.

`D5` fixa a **restrição de forma**: portão **nasce** e contrato **estreita** no **mesmo commit**. A
razão está medida na própria ADR (`E2`): `ignore_imports` sai **`3 kept, 0 broken` com `datetime.now()`
e `date.today()` dentro de `domain/`**. Uma árvore intermediária em que o contrato já afrouxou e o
scanner ainda não existe é essa mesma janela, só que aberta para todo o `domain/`.

⇒ **A task é atômica por construção, e isso é a primeira coisa que o DoD cobra.**

---

## 2 · Cinco achados. Três deles mudam a task, e dois mudariam o veredito do builder

Tudo abaixo foi reproduzido por mim nesta worktree, com mutante plantado em cópia extraída por
`git archive` e árvore reconferida limpa entre cada um.

### A-1 · A `ADR-016/D5` nomeia um `id` que **já existe**, e ele está cardado

```
$ grep -n 'id = "T-03.11"' -A2 docs/context/plataforma-dados/tasks.toml
477:id = "T-03.11"
478:title = "[sentimento] 03 · Reconciliacao diaria liquidacao capturada x agregado Coinalyze, ..."
```
`T-03.11` = **`CST-27`**, `status = "blocked"`, `depends_on = ["T-02.2","T-03.2"]`
`[MEDIDO 2026-08-29, n=1 ocorrência em 1165 linhas]`.

**A task nasce como `T-03.12`**, que é o primeiro `id` livre da fase 03 `[MEDIDO: `grep 'id = "T-03'` →
11 ids, `T-03.1`..`T-03.11`, sem buracos]`. **Não renomeio a `T-03.11` existente** — ela está cardada, e
`id` de task cardada é chave externa. A divergência com o texto da ADR fica escrita no `refs` da task,
porque *"quem ler `D5` daqui a três meses vai procurar `T-03.11` e achar a Coinalyze"*.

### A-2 · ⚠️ A bancada tem um **segundo ponto cego**, e a ADR **não o declara** — `from time import monotonic` sai **rc=0**

Este é o achado que impede a task de ser um `git mv`.

```
$ python3 docs/adr/bancadas/ADR-016-natureza.py <domain> <use_cases>   # mutante plantado
from time import monotonic ; _c = monotonic()      -> natureza: 0 leitura(s)   rc=0   ⚠️
from time import time      ; _a = time()           -> natureza: 0 leitura(s)   rc=0   ⚠️
from time import sleep     ; _b = sleep(1)         -> natureza: 0 leitura(s)   rc=0   ⚠️
from time import monotonic as m ; _c = m()         -> natureza: 0 leitura(s)   rc=0   ⚠️
CONTROLE: import time ; _e = time.sleep(1)         -> RELOGIO ... time.sleep    rc=1   ✅
```
`[MEDIDO 2026-08-29, n=5 mutantes, um por vez, `etl_backlog.py` restaurado do backup entre cada]`

**A causa é estrutural, não um nome faltando na lista.** `D4` manda casar por `ast.Attribute` (passo 2:
*"para cada `ast.Attribute`, resolver a raiz"*), e `_bindings` **liga** corretamente
`monotonic -> time.monotonic`. Mas o sítio de chamada de um `from … import` nu é um **`ast.Name`**, que
**nunca entra no laço** — `achados()` faz `if not isinstance(no, ast.Attribute): continue`. A ligação é
criada e depois nunca consultada.

**Por que isto é grave e não é o mesmo buraco do `getattr`:** `ADR-016` garante, com todas as letras,
*"que ninguém leia o relógio em camada pura **por acidente**"*, e reserva o não-garantido para quem
*"o faça **deliberadamente, escondendo**"*. `from time import monotonic` **é a grafia idiomática**, é o
que um autor escreve sem nenhuma intenção de esconder, e é **estática** — o instrumento **pode** vê-la.
⇒ **Enquanto este buraco existir, a frase de garantia da `D5` é falsa.** A task fecha, e o DoD ganha um
quinto mutante para provar que fechou.

### A-3 · `RELOGIO["time"]` cobre **12 dos 21** nomes de relógio que a `D3` conta

```
$ python3 -c "import time; ..."   # Python 3.13, n=38 públicos
total publicos: 38 · nao-relogio: 17 · relogio: 21     ← confere com D3, exatamente
bancada cobre: 12
relogio NAO cobertos: asctime clock_getres clock_gettime_ns clock_settime
                      clock_settime_ns ctime process_time_ns pthread_getcpuclockid thread_time_ns
```
`[MEDIDO 2026-08-29, worktree tl-T-03.11, Python 3.13]`

E o buraco morde:
```
import time ; _c = time.ctime()              -> rc=0   ⚠️
import time ; _d = time.clock_gettime_ns(0)  -> rc=0   ⚠️
import time ; _e = time.asctime()            -> rc=0   ⚠️
```
`[MEDIDO, n=3]`

**A conta de 38/17/21 da `D3` está certa** — eu a reproduzi e ela bate nome a nome. O que não está certo
é a frase seguinte, *"o scanner cobre as 21 do lado do relógio"*: **ele cobre 12**, e a evidência que a
`D3` cita (*"medido pelo mutante `time.monotonic` acusado"*) prova **um** dos 12, não os 21.

**E eu não decido quais dos 9 entram.** `ctime()`/`asctime()` sem argumento **leem** o relógio, mas com
argumento são formatadores como `strftime` — que a `D3` classificou como **não-relógio**; e
`clock_settime` **escreve**. ⇒ **`[NÃO SEI]` declarado:** a fronteira exata dos 9 é chamada de
arquitetura, não minha. O DoD **não exige "21"** — exige que o conjunto seja **derivado e justificado
nome a nome contra os 38**, com o resíduo escrito. Um número que eu inventasse aqui viraria alvo, e
alvo inventado é pior que buraco declarado.

### A-4 · O universo de falso positivo é **9 linhas em 2 arquivos**, não 7 em 1

`D5` cobra *"0 falso positivo sobre as 7 linhas legítimas de `date`/`timedelta` de `dump_window.py`"*.
As 7 conferem (129/171/174/194/196/214/230). Mas `retention_probe.py` tem **mais 2** anotações legítimas:
```
131:    old_period: date,
132:    recent_period: date,
```
`[MEDIDO 2026-08-29 em task/T-03.10-fila-etl-retomavel@6b8f441]`

**`D5` não está errada — está estreita.** O texto de `E3` diz *"dos MESMOS arquivos"* (plural) e nomeia 7
linhas que são **todas** de `dump_window.py`; a discrepância é entre os dois trechos da própria ADR. O
DoD desta task usa **n=9, os dois arquivos**, porque um silêncio não conferido é onde o falso positivo
se esconde.

### A-5 · O instrumento que vai medir esta task é **cego a arquivo novo** — e esta task **cria** arquivos

`docs/context/plataforma-dados/gates/T-03.10-build.md` já mediu: `harness rules --mode sweep
--changed-only` dá **0 achados / rc=0** sobre arquivo **untracked** com violação `block` plantada, e
**rc=1** depois do `git add` `[DOC: gate T-03.10, n=3 estados, mutante conferido por sha256]`.

Esta task cria `backend/scripts/natureza.*`. ⇒ **o builder receberá verde falso** se rodar
`--changed-only` antes do `git add`. Vai escrito no DoD como passo obrigatório, não como conselho.

---

## 3 · O que eu **reproduzi** da ADR, e que sustenta o dimensionamento

| # | comando | resultado | universo |
|---|---|---|---|
| `E4` | bancada sobre o corpus limpo da `T-03.10` | **`natureza: 0 leitura(s)`, rc=0** | **n=20** (13 `domain` + 7 `use_cases`) |
| `M1` | `from datetime import datetime` + `datetime.now()` | **rc=1**, `dump_window.py:252 -> datetime.now` | 1 |
| `M2` | `date.today()` **sem import novo** | **rc=1**, `retention_probe.py:270 -> date.today` | 1 |
| `M3` | `import time` + `time.monotonic()` | **rc=1** | 1 |
| `M4` | `f(datetime.now)` **sem chamar** | **rc=1** — o `Attribute`-em-vez-de-`Call` da `D4` funciona | 1 |
| `E6` | `getattr(date,"today")()` | **rc=0** — ponto cego confirmado | 1 |
| — | árvore reconferida entre cada mutante | **rc=0** | — |
`[MEDIDO 2026-08-29, worktree tl-T-03.11; corpus extraído por `git archive` de 6b8f441]`

**Os 4 mutantes de `D5` passam na bancada como versionada.** É por isso que `A-2` e `A-3` importam: o
DoD de `D5`, sozinho, **seria satisfeito por um `git mv`** — e deixaria dois buracos estáticos abertos
num portão que se anuncia como cobrindo o acidente. **A bateria vai de 4 para 6 mutantes.**

*(Nota de leitura: o enunciado do despacho fala em "bateria de 3 mutantes → 3/3". Os `3/3` são de `E3`,
a medição de bancada da ADR; o **DoD** de `D5` pede **n=4**. Segui `D5`, e acrescentei 2.)*

---

## 4 · A task, e por que **uma** e não três

Poderia ser três: (a) promove o scanner, (b) estreita o contrato, (c) fecha `A-2`/`A-3`.
**Não pode**, e o motivo é a própria `D5`: (a) e (b) **têm de ser o mesmo commit**. E (c) separada
significaria mergear um portão com dois buracos estáticos conhecidos e um cartão dizendo "depois" —
que é a definição de `parecendo coberto` que `ADR-009/D3` nomeia. **Uma task, um commit, seis mutantes.**

**Componente `sentimento`** — é o que `ADR-016/D5` declara, e o corpus guardado é
`backend/src/modules/sentimento/{domain,use_cases}/`. O enum fechado (`harness policy --key components`
→ `sentimento charts convergencia backtest web docs` `[MEDIDO]`) não tem entrada de ferramental, e
inventar uma é ato de owner.

**Tracker: nenhum card, e a task sai SEM `local_only`.** O owner disse *"não crie card no Jira — eu
cardo"* `[PREMISSA-OWNER: 2026-08-29, citação literal do despacho]`. `local_only = true` significa
*"decidiu-se não cardar, nunca"*, e aqui a decisão é *"cardar depois"*. **Um marcador que colapse
"decidi" e "vou fazer depois" faz o segundo nunca chamar atenção** — o mesmo argumento que a quebra da
`codigo-em-ingles` já usou. A ferramenta separa os eixos sozinha: `harness tasks list plataforma-dados`
passará a devolver `uncarded=1`, e é assim que se vê que falta cardar.

**`depends_on = ["T-03.1"]`** — é a task que acrescentou o contrato 3 (PR #29, mergeada). **Não** depende
da `T-03.10`: a relação é inversa, a `T-03.10` é que espera por esta, e `D5` diz isso por extenso.

---

## 5 · O DoD, item a item — cada um com o comando e o universo

1. **Atomicidade (`D5`).** `git show --stat <sha>` do **único** commit contém, juntos:
   `backend/scripts/natureza.*`, o alvo `natureza` no `Makefile`, a chamada em
   `scripts/hooks/pre-push.pre-harness`, **e** a edição de `backend/pyproject.toml`.
   **Reprova se forem dois commits**, mesmo que a árvore final esteja certa.
2. **Árvore limpa.** `make natureza` sobre `master` + `T-03.10` mesclada → **rc=0**, `0 leitura(s)`,
   universo **n=20** (13 `domain` + 7 `use_cases`) **impresso pelo próprio comando** — um `n` não
   impresso é o `rc=0` de universo vazio que `ADR-012` já nomeia.
3. **Bateria de 6 mutantes, um por vez, árvore reconferida entre cada** → **6/6 com rc=1 nomeando
   `arquivo:linha`**: os 4 de `D5` (`datetime.now()`; `date.today()` sem import novo; `import time` +
   `time.monotonic()`; `f(datetime.now)` sem chamar) **+ `from time import monotonic` chamado nu (`A-2`)
   + um dos 9 nomes de `A-3` que a justificativa do item 5 tiver incluído**.
4. **Zero falso positivo, n=9** — 7 linhas de `dump_window.py` (129/171/174/194/196/214/230) **e** 2 de
   `retention_probe.py` (131/132). Conferido **por linha**, não por `rc`.
5. **O conjunto de nomes é derivado, não copiado.** Justificativa nome a nome contra os **38** públicos
   de `time` (`python3 -c "import time; dir(time)"`), no cabeçalho do script: quais dos 21 entram, quais
   dos 9 de `A-3` ficam de fora e **por quê**. Reprova se a lista for a da bancada sem justificativa.
6. **O contrato estreitado ainda morde.** `bash backend/scripts/boundaries.sh` → **rc=0**,
   `Contracts: 3 kept, 0 broken`; **e** com `import ssl` plantado em `domain/` → **rc=1** (`E5`
   reproduzido no portão, não na bancada).
7. **`git add` ANTES do sweep (`A-5`).** `harness rules --mode sweep` **completo** → rc=0, 0 `[BLOQUEIO]`.
   Um `--changed-only` sobre arquivo untracked **não conta como medição**.
8. **O bloqueio some.** `git push --dry-run` da `T-03.10` rebaseada → **rc=0**.
9. **O ponto cego vai escrito no script, não só na ADR.** Cabeçalho declara `getattr(date,"today")()`
   → **0** `[MEDIDO, E6]` e a classe (`importlib`, atributo montado em runtime).
   *Este repositório já foi mordido por instrumento que herdou limitação sem herdar a declaração.*
10. **O falsificador vira contável.** O script imprime uma linha estável e grepável por acusação, para
    que ao fim da fase 03 se conte **falso positivo × verdadeiro positivo**; se **FP ≥ VP**, `D4` cai.
    **Placar de hoje: 0 × 3** `[MEDIDO, ADR-016 E3]`. Segundo falsificador: 30 dias sem nunca sair
    `rc=1` em árvore real ⇒ é cerimônia, e `D5` sai (`ADR-012/D5`).
11. **Não reabre o que não é seu.** `docs/adr/bancadas/ADR-016-natureza.py` **permanece** em `docs/`
    (promover é **copiar e endurecer**, não mover — a ADR precisa continuar reproduzível); o status
    `proposto` da `ADR-016` **não é tocado** (aceitar ADR é ato de owner);
    `git diff --name-only -- docs/adr` → só `docs/INDEX.md` fora dela.

---

## 6 · `[NÃO SEI]` declarados

- **Quais dos 9 nomes de `A-3` pertencem ao conjunto de relógio.** `ctime`/`asctime` sem argumento leem;
  com argumento são formatadores como `strftime`, que a `D3` pôs entre os 17 não-relógio. Fronteira de
  arquitetura. O DoD cobra a **justificativa**, não um número que eu tenha inventado.
- **Se a `ADR-016` deve subir a `aceito` antes desta task rodar.** Ela está `proposto` e já gateia uma PR
  aberta — a mesma tensão que a quebra da `codigo-em-ingles` escalou para a `ADR-015`. **Não decido.**
- **Duração.** Não estimei e não vou fingir que estimei.
- **Se `A-2` sozinho justifica reabrir a `ADR-016`.** Ele contradiz uma frase de garantia da `D5`, não
  uma decisão dela — `D1`..`D6` seguem de pé, e a task fecha o buraco. Mas quem decide se um texto de
  ADR mergeada precisa de errata é o `/architect`.

## 7 · O que eu **não** fiz

Nenhum card no Jira (`CST` intocado) · ledger intocado (`BUILD_AUTHORIZED` antes e depois; nenhum
`approve`, `advance` ou `scope`) · nenhum código de produção · `harness.toml`, `CLAUDE.md`,
`backend/pyproject.toml`, `Makefile` e a bancada **não editados** · nenhuma linha existente de
`docs/INDEX.md` reescrita · `tasks_review.md` (o aprovado) **não editado** · nenhum merge.

**Escopo de caminhos: deliberadamente NÃO declarado.** `harness pipeline scope add` **grava no ledger
com `actor: "owner"`**, e o despacho proíbe mexer no ledger — o evento sairia assinado como se fosse do
owner. É o mesmo motivo, e a mesma recusa, da Decisão 3 de 2026-08-29T16:45Z no `INDEX`.

**Próximo passo:** owner aprova esta narrativa → a task já está materializada em `tasks.toml` e validada
→ owner carda → `/build`.
