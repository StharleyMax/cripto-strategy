# Protocolo de despacho — o que entra no contexto e o que fica em disco

Doutrina deste repositório para o **loop principal** e para **todo subagente**. Declarado em
`harness.toml` como `[agents] dispatch_protocol`; o mecanismo o serve sob a chave efetiva
`agents.roles.dispatch_protocol` — o acessor separa papel de componente
`[MEDIDO 2026-08-29: harness policy --key agents.roles.dispatch_protocol → rc=0]`.

Alcança `/build` e `/qa`, que consultam `harness policy --key agents`
`[MEDIDO 2026-08-29: 2 ocorrências no plugin v0.13.0 — commands/build.md:36, commands/qa.md:19]`.
Para o loop principal e os demais papéis, quem vincula é o `CLAUDE.md`.

## Por que existe, com o número que a produziu

Sessão `b227a990` deste repositório `[MEDIDO 2026-08-29 somando `usage` sobre os transcripts
em `~/.claude/projects/<slug>/`]`:

| | contexto lido | turnos |
|---|---|---|
| loop principal | 276,7M | 868 |
| **45 subagentes** | **822,2M** | **6.746** |
| **total da sessão** | **1,099 bilhão** | |

**Os subagentes são 74–89% do consumo, hora a hora.** Na hora de pico, 192,3M de contexto
lido — 141,9M deles em subagentes. Todas as sessões deste projeto somam **1,78 bilhão**.

> ⚠️ **PRIMEIRA VERSÃO DESTE DOCUMENTO ERRAVA ISTO, e o registro fica.** Ela dizia *"62% do
> custo é o loop principal"* porque usou o campo `<subagent_tokens>` da notificação (média
> 185k) como consumo do subagente. **Esse campo não é o consumo.** Os transcripts reais dos
> subagentes vivem em `<slug>/<sessão>/subagents/**/*.jsonl` — 105 arquivos que a primeira
> medição não abriu. O consumo real por subagente é **18,3M em média**, não 185k: **99× maior**.
> A lição é a da casa: *número medido no instrumento errado é número inventado com aparência
> de rigor.*

**A assimetria que justifica cada regra abaixo:** cada token que entra num contexto é relido a
cada turno seguinte, até o agente morrer. O maior `/build` da sessão leu **93,5M** para produzir
**72,7k de conteúdo único** — **1.286×**. O custo de uma linha não é o que ela custa uma vez; é
o que ela custa multiplicado pelos turnos que faltam.

As fontes no loop principal, que R1–R4 atacam (**26% do total**):

| fonte | medida | universo |
|---|---|---|
| relatório de subagente inlinado | média **9,4KB** — e o texto integral **já estava em disco**, no `<output-file>` que a própria notificação cita | n=44 notificações |
| prompt de despacho | média **8,6KB** — maior que a definição do agente que ele invoca | n=30 chamadas de `Agent` |
| arquivo grande lido no loop principal | um `sed -n '140,280p'` de **26KB** num turno | n=261 chamadas de `Bash` |

E dentro dos subagentes, que R6–R7 atacam (**74%**): turnos e verificação — nunca o tamanho
da task, que foi medido e falsificado em R6.

**`/compact` não alcança os 74%.** Ele funciona no que alcança — depois da compactação das
15:23 o loop principal consumiu 15,9M na hora seguinte contra 50,4M numa hora sem — mas é
esteira (**voltou a 400k em 53 min**; pico da sessão **657k**) e **nenhum subagente é tocado
por ele**: cada um nasce em 30,7k e constrói os próprios milhões dentro da própria vida.

## As regras

### R1 — O subagente devolve ponteiro, nunca o relatório

Escreva o relatório completo em `docs/context/<feature>/gates/<TASK>-<papel>.md`. **Devolva no
máximo 15 linhas:** veredito, os números medidos com o comando, e o caminho do relatório.
**NUNCA cole o corpo do relatório na resposta** — quem precisar do detalhe abre o arquivo.

O contrato de veredito que `agents/qa.md` e `agents/reviewer.md` já declaram **é o teto, não o
piso**. Um `## QA Gate` de 16KB descumpre o formato que o próprio arquivo do agente escreve.

### R2 — O despacho referencia, não transcreve

O prompt de despacho tem **no máximo 20 linhas** e cita caminhos. Contexto longo vai para
`docs/context/<feature>/handoff/<TASK>.md` **antes** do despacho, e o prompt manda ler.
Repetir no prompt o que já está num arquivo paga o texto duas vezes: uma no prompt, outra na
leitura do subagente.

### R3 — Arquivo grande não entra no loop principal

Acima de ~200 linhas: `grep -n` com âncora, `--json` com filtro, ou **delegue a leitura**.
**NUNCA `cat` ou `sed -n '1,300p'` de arquivo grande no loop principal.** O subagente lê
inteiro e devolve o que importa; o loop principal fica com o resumo, não com o corpo.

### R4 — Saída de comando é filtrada na origem

Todo comando que pode devolver mais de ~50 linhas termina em `| head -N`, `| tail -N`, ou
passa por `--json | python3 -c`. Truncar depois de ler não desfaz a leitura.

### R5 — O veredito mora no ledger, a prosa é anexo

`harness gate-record` é o canal do veredito. O arquivo de R1 é anexo dele, nunca substituto —
documento marcado "aprovado" sem evento no ledger não está aprovado (`CLAUDE.md`).

### R6 — O subagente morre cedo; o workflow invoca o próximo

**O custo é quadrático nos turnos, não linear.** Medido no maior `/build` da sessão
`b227a990` (`T-03.10`): **93,5M de contexto em 376 turnos**, contra **72,7k de conteúdo
único** produzido — cada token que entra é relido **1.286 vezes** até o agente morrer. O
contexto no primeiro turno é **30,7k**; a curva por quinto é 93k → 214k → 277k → 299k →
**357k**. A base é enxuta: o que cresce é acumulação.

Com base 30k e ~0,94k de crescimento por turno, o consumo é `N×30k + 0,94k×N²/2`:

| turnos | contexto lido | |
|---|---|---|
| 376 | ~93M | o medido |
| **188** | **~22M** | **4,2× menos** |
| 94 | ~6M | 15× menos |

**A regra:** um subagente que projetar passar de **~150 turnos** (o `p50` medido é 137)
**para, escreve o estado em `docs/context/<feature>/handoff/<TASK>.md` e devolve** — o
workflow invoca o próximo com aquele arquivo como entrada. Cadeia de agentes curtos custa
quadraticamente menos que um agente longo, pelo mesmo trabalho.

Corolário de batching: medições independentes vão numa chamada só. No agente acima foram
**180 chamadas de ferramenta em 376 turnos** — cada chamada custa dois turnos —, e **58
delas repetiam o mesmo `cd .../backend &&`**, um número por vez. Agrupar não corta uma
medição sequer; corta o turno que cada uma paga.

> **HIPÓTESE FALSIFICADA, registrada porque foi proposta aqui e morreu na medição:** *"as
> tasks estão grandes demais, fatie-as"*. **Falso.** A correlação entre turnos e escritas
> (proxy de tamanho) é `r = 0,51`, mas **a mediana de escritas é ZERO** — metade dos
> subagentes não escreve nada e ainda roda 137+ turnos. Um `/qa` de `T-01.5` rodou **175
> turnos, 103 `Bash`, 0 escritas, 17,6M de contexto**. Os turnos vêm da **verificação**, não
> do tamanho da task. Fatiar task não teria movido o número.

### R7 — Verificação é um comando, e a saída bruta fica em disco

`[MEDIDO 2026-08-29 sobre 105 transcripts de subagente, n=1.320 chamadas]`: os comandos de
verificação despejaram **~397 mil tokens de saída bruta** nos contextos — `git diff` 277
chamadas / ~201k tokens · `harness rules` 332 / ~66k · `make lint` 221 / ~43k · `make test`
263 / ~41k · `git status` 158 / ~35k · `make boundaries` 69 / ~10k.

**Use `make verify`** (`scripts/verify.sh`): roda os seis portões numa chamada e imprime
~10 linhas, deixando a saída bruta em arquivo. `[MEDIDO 2026-08-29: 5.915 bytes de log →
591 bytes impressos, 10×, e uma chamada no lugar de seis]`. Ele não mede nada de novo e
**nunca inventa número** — quando a extração não casa, imprime `(número não extraído)` e o
`rc`.

E **não releia o que já leu**: foram medidos **62 casos** de um mesmo arquivo lido 3+ vezes
**dentro do mesmo agente** — `PRD-001` **15×**, `CLAUDE.md` 9×. Leia uma vez; o que
interessa vai para o arquivo de trabalho da task.

## O outro eixo: WALL-CLOCK — e ele está separado porque NÃO é contexto

R1–R7 tratam de token. Estas duas tratam de **tempo de parede**, que é uma conta diferente e não
deve ser somada à outra. `[MEDIDO 2026-09-07 por `python3 scripts/analysis/session-cost.py`,
n=34.763 chamadas de ferramenta em 543 transcripts: **53,33h**]`.

> **O aparo não é cosmético, é a diferença entre medir e mentir:** a medição descarta chamadas
> acima de **1800s**, que são artefato de sessão interrompida e retomada, não execução. Sem
> aparar, o total vai a **85,3h** — e **3 chamadas sozinhas** respondem por **23,7h** desse
> número. Um total que 3 chamadas dominam não descreve nenhum gargalo.

### R8 — Suíte inteira é PORTÃO, não laço de desenvolvimento

| invocação | n | tempo | por chamada |
|---|---|---|---|
| `pytest` **suíte inteira** | 1.138 | **11,86h** — 22% de todo o wall-clock | 37,5s |
| `pytest` **alvo** (`-k`/arquivo) | 641 | 1,13h | 6,2s |

**A regra:** durante o desenvolvimento, `make test-fast K=<filtro>`
(`backend/scripts/test-fast.sh`) — **2,19s medidos** contra os 37,5s da suíte, ~17×. A suíte
completa fica onde ela decide alguma coisa: `make test` e `make verify`.

⛔ **`test-fast` NÃO roda cobertura e NÃO chama `check-coverage-layers.sh`.** As duas recusas
`rc=3` daquele script continuam existindo em `test.sh`, onde o portão mora. **Verde no
`test-fast` não é verde de portão** — e o script recusa com `rc=3` se chamado sem filtro,
porque sem filtro ele seria a suíte inteira sem cobertura: o comando caro vestido com o nome do
barato. `-k ""` cai na mesma recusa, já que filtro vazio casa com a suíte toda no `pytest`.

### R9 — Não faça polling; peça notificação

`[MEDIDO 2026-09-07: **114 chamadas** de `until`/`while` com `sleep`, **3,68h**, **116,4s** por
chamada — 6,9% do wall-clock]`. Um laço de `sleep` **paga tempo de parede e não devolve nada**:
ele não mede mais rápido, só ocupa o turno esperando.

**Em vez disso:** `Bash` com `run_in_background` e a notificação de conclusão, ou o `Monitor`
para acompanhar um processo. O custo de esperar passa a ser **zero** — o turno termina e a
notificação acorda quem precisa. Polling só se justifica contra estado que o harness não
observa (CI remoto, fila externa), e aí o intervalo se escolhe pela velocidade do estado, não
por hábito.

## O limite que este documento admite

`agents/qa.md` já registrou a lição que vale aqui: *"prosa aqui mediu 0% de adesão — quem cobra
de verdade é o portão do `gate-record`"*. **R1–R5 não são portão** — são doutrina, e doutrina
sem portão é adesão voluntária.

> **⚠️ ESTE PARÁGRAFO ESTAVA ERRADO E FOI CORRIGIDO EM 2026-09-07.** Ele dizia: *"o portão
> correspondente (um teto de turnos ou de bytes cobrado na notificação de subagente) **não
> existe no mecanismo** e seria mudança no plugin, não aqui"*. **Existe, e não é mudança no
> plugin: é um hook `PostToolUse`** — [`scripts/claude-hooks/subagent-turn-cap.sh`](../scripts/claude-hooks/subagent-turn-cap.sh),
> registrado em `.claude/settings.json`. **R6 deixou de ser doutrina e virou mecanismo.**

**R6 agora tem portão.** O hook conta os turnos do transcript do subagente e, ao passar de
**150**, injeta o aviso de handoff no contexto dele — e repete só a cada 50 turnos, para o
próprio aviso não virar o gasto que ele combate. Três propriedades deliberadas:

- **Ele avisa, não bloqueia.** Bloquear no meio de uma task deixaria trabalho pela metade **sem
  handoff escrito**, que é pior que o custo evitado. Quem decide devolver continua sendo o
  agente — mas deixou de ser o único a saber que a conta está correndo.
- **Ele só fala com subagente.** O loop principal roda milhares de turnos legitimamente
  (**2.843** na maior sessão medida) e é discriminado pelo `/subagents/` no caminho do
  transcript `[MEDIDO 2026-09-07: transcript de 2.843 turnos do loop principal → 0 bytes de
  saída; subagente de 493 turnos → avisa]`.
- **Ele fala com a cauda, não com o corpo.** A mediana de turnos por subagente **já obedece** a
  doutrina — 66 a 86 nas sessões recentes, contra a base de 137. Quem paga são os máximos de
  **528, 483 e 404**: os 19% que passam de 150 turnos consomem **65%** de todo o contexto de
  subagente `[MEDIDO 2026-09-07, n=614 subagentes de 14 sessões]`.

**R7 é a exceção, e é por isso que ela é a mais forte da lista:** `scripts/verify.sh` não pede
adesão — ele **é** mais barato de rodar do que os seis comandos que substitui. Regra que se
paga sozinha não depende de ninguém lembrar dela.

## Falsificador

Numa sessão de trabalho comparável sob estas regras, meça — **a métrica que manda é a do
subagente, porque é onde estão 74%**:

```
# contexto lido por subagente, dos transcripts em
#   ~/.claude/projects/<slug>/<sessão>/subagents/**/*.jsonl
# linha de base MEDIDA em b227a990 (n=45):
#   contexto medio por subagente = 18,3M   ·   turnos p50 = 137, max = 376
#   loop principal: p50 de contexto = 275k
```

**Se o contexto médio por subagente não cair abaixo de `18,3M`, estas regras não pagam o que
custam e este documento sai** — não fica como boa intenção não medida.

### ✅ O falsificador FOI RODADO em 2026-09-07, e o documento sobrevive

`[MEDIDO 2026-09-07, n=614 subagentes em 14 sessões, 543 transcripts, 322MB]` — pelo comando
`python3 scripts/analysis/dispatch-falsifier.py`, que é o falsificador desta seção virado
script para não depender de ninguém reescrevê-lo:

| | base (`b227a990`, n=45) | agora (n=614) | |
|---|---|---|---|
| contexto médio por subagente | 18,3M | **12,1M** | **−34%**, o documento se paga |
| turnos por subagente, `p50` | 137 | **66 a 86** nas sessões recentes | o corpo obedece |
| turnos por subagente, `max` | 376 | **528 · 483 · 404** | **a cauda piorou** |
| loop principal, contexto/turno `p50` | 275k | 291,7k (`p90` 597,8k) | praticamente parado |

**A leitura honesta é que a média melhorou e a cauda não** — e as duas coisas não se anulam,
porque a cauda é justamente onde está o dinheiro: os subagentes que passam de 150 turnos são
**19% do universo e 65% do contexto de subagente**. Duas sessões ficam **acima** da base:
`b5929a28` (20,3M, 112 subagentes, `max` 528) e `80881c8a` (22,6M, mas `n=2`, amostra pequena
demais para concluir). É esse retrato que o portão de R6 passa a cobrar, e é por ele que a
próxima medição deve ser julgada: **se o `max` de turnos não cair depois do hook, o hook sai.**

Correção de escala, para o número não ser citado errado: a frase acima diz *"é onde estão
74%"*. Medido agora, subagente é **64%** do fluxo de tokens (6,3G de 9,8G), contra 36% do loop
principal. A ordem de grandeza se manteve; o número exato, não.
