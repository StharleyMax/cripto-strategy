# O gate de design — quem critica o que `charts` e `web` produzem

**Criado em 2026-08-28 por `T-01.3` (`CST-10`).** É o documento para onde
`[agents.by_component.charts].design_gate` e `[agents.by_component.web].design_gate`
apontam em [`harness.toml`](../harness.toml).

**Por que ele existe, e não um ponteiro para o `CLAUDE.md`:** o `CLAUDE.md` declara a
delegação de design em **2026-08-25**, e a divisão de julgamento de `charts` só existe
desde a resposta de `Q16` em **2026-08-28** — três dias depois. O `CLAUDE.md` **não
contém** a frase que este documento precisa carregar (*"nenhum dos dois aprova o trabalho
do outro"*). Apontar para ele mandaria quem lê a política encontrar a doutrina **anterior**
à decisão que a política materializa.

## O gate

| | |
|---|---|
| **quem é** | `ux-ui-mastery` — plugin instalado, **19 skills / 10 comandos** `[DOC: CLAUDE.md]` |
| **o que ele julga** | **interação**: usabilidade, acessibilidade, carga cognitiva, motion, conteúdo |
| **força do veredito** | **bloqueante para design.** Declaração literal do owner em 2026-08-25: *"o agente tem autonomia de decisão, **desde que ux-ui-mastery esteja de acordo**"* `[PREMISSA-OWNER: 2026-08-25]` |
| **o que ele NÃO julga** | fidelidade do dado. Ele não decide se `LOCF` sobre `FLOW` é erro de tipo, nem se a âncora de `cvd_cum` está certa |

## A regra que este documento existe para tornar impossível de esquecer

**Ninguém aprova o próprio trabalho, e nenhum dos dois julgamentos aprova o outro.**

| componente | `architect` (dono de julgamento) | `design_gate` | o que cada um reprova |
|---|---|---|---|
| `charts` | [`quant-architect`](../.claude/agents/quant-architect.md) | `ux-ui-mastery` | **arquiteto:** o gráfico mente sobre o dado. **gate:** a tela é ilegível, inacessível ou engana pela interação |
| `web` | [`ui-designer`](../.claude/agents/ui-designer.md) | `ux-ui-mastery` | **designer:** decide UI/UX sem pedir permissão. **gate:** a condição dessa autonomia |

**A citação que fixa a divisão de `charts`, do owner, em 2026-08-28:**

> toda tela de `charts` passa a ter **dois** julgamentos independentes — `quant-architect`
> sobre a fidelidade do dado, `ux-ui-mastery` sobre a interação. **Nenhum dos dois aprova
> o trabalho do outro.**

`[PREMISSA-OWNER: 2026-08-28]` · fonte única: [`docs/decisoes-do-owner.md`](decisoes-do-owner.md) §`Q16`

**A citação que fixa a de `web`, do `CLAUDE.md`, em 2026-08-25:** *"agente que gera e
aprova o próprio trabalho não tem gate. O ciclo é **gera → critica → itera**"*. O
`ui-designer` é o gerador; declarar `web` só com `architect = ui-designer` publicaria, na
política, um gerador sem gate.

## Ordem de operação

1. O `architect` do componente decide o que decide — **sem pedir permissão**, dentro da sua
   classe de risco.
2. O gate critica. Enquanto ele não concordar, **a decisão de design não vale**.
3. Discordância entre os dois **não se resolve por antiguidade nem por hierarquia**: sobe
   para o owner. Precedente medido: em `ADR-010` o designer discordou do gate em 4 pontos
   e **acertou nos 4** `[DOC: docs/INDEX.md, linha 2026-08-25T20:22Z]`.
4. Silêncio do owner **não é aprovação**; aprovação é o veredito do gate `[DOC: CLAUDE.md]`.

## ⚠️ O limite deste documento, declarado e não escondido

**Nenhum comando do plugin roteia por `design_gate`.**
`[MEDIDO 2026-08-28: grep -rn "agents" sobre os 8 arquivos de `commands/` do harness-plugin
v0.13.0 → 3 ocorrências; só `build.md:36` e `qa.md:19` rodam `harness policy --key agents`,
e as duas agem exclusivamente sobre os papéis `builder` e `qa`]`. A chave `architect`, que
já estava declarada para `sentimento`/`convergencia`/`backtest` desde antes, tem **a mesma
propriedade** — não é uma fraqueza nova introduzida aqui.

O que o mecanismo garante é menor e é verificável: `harness validate --strict` reprova
componente fora do vocabulário fechado e **avisa** sobre ponteiro que não resolve
(`lib/policy.py:540-543` e `:549-550`). **Quem executa este gate é quem lê
`harness policy --key agents.by_component` antes de despachar revisão de `charts` ou `web`
— e este documento existe para que essa leitura devolva um caminho, não um nome solto.**

### O que a mutação mostrou, e é pior do que o parágrafo acima admitia

Três mutações efêmeras contra a declaração de `harness.toml`, `[MEDIDO 2026-08-28]`:

| mutação | resultado | leitura |
|---|---|---|
| componente **fora** do vocabulário fechado (`[agents.by_component.frontend]`) | **`rc=1`**, `[erro] V-16 … esperado um dos componentes declarados` | o validador **de fato lê** esta seção; o verde não é carimbo |
| `design_gate` apontando para caminho **inexistente** | `rc=0` com **2 `[aviso]` V-16** nomeando as duas chaves | o ponteiro quebrado é **visível**, mas **não reprova** (`fatal=False` em `lib/policy.py`) |
| **`design_gate` simplesmente APAGADO das duas entradas** | **`rc=0`, silêncio total** — e `harness policy` passa a devolver `charts` e `web` só com `architect` | **⚠️ nada no mecanismo protege o segundo julgamento.** Apagar o gate é indistinguível, para o validador, de nunca tê-lo declarado |

**Consequência, escrita para não ser descoberta depois:** a separação dos dois julgamentos é
**doutrina, não portão**. Quem apagar a linha `design_gate` de `charts` ou de `web` desfaz uma
decisão do owner (`Q16`, 2026-08-28) e do `CLAUDE.md` (2026-08-25) **sem que nenhum comando
acuse**. O que sobra contra isso é a revisão humana e este parágrafo — e chamar isso de
enforcement seria a mentira que o resto do repositório existe para evitar.
