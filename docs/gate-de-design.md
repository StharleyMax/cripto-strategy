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

**⚠️ Duas frases, dois rótulos — e fundi-las foi o defeito que o `/review` reprovou aqui
em 2026-08-28.** A fonte única é [`docs/decisoes-do-owner.md`](decisoes-do-owner.md) §`Q16`,
e ela mesma marca onde a fala do owner termina.

**(a) O que o owner declarou, literal** — `decisoes-do-owner.md:405`, sob o título
*"Declaração literal da opção selecionada"*, com o rótulo na `:407`:

> **`charts` → `quant-architect` · `web` → `ui-designer`**

`[PREMISSA-OWNER: 2026-08-28]`

**(b) A consequência que o `/architect` registrou ao anotar `Q16`** — `:418-421`, aberta por
*"Consequência operacional a registrar em `T-01.3`:"*, **voz do redator**, no mesmo parágrafo
em que ele **lê** a resposta (*"Esta resposta NÃO revoga a delegação de design"*):

> toda tela de `charts` passa a ter **dois** julgamentos independentes — `quant-architect`
> sobre a fidelidade do dado, `ux-ui-mastery` sobre a interação. **Nenhum dos dois aprova
> o trabalho do outro.**

`[DOC: docs/decisoes-do-owner.md:418-421 — a frase fecha na `:420`-`:421`; consequência
registrada pelo /architect, não fala literal do owner]`

**O falsificador — e este foi RODADO antes de ser publicado:**

```
$ grep -n -F "aprova o trabalho do" docs/decisoes-do-owner.md \
    docs/context/plataforma-dados/decisoes-de-execucao-2026-08-28.md
decisoes-de-execucao-2026-08-28.md:132: … **Nenhum aprova o trabalho do outro.**
decisoes-do-owner.md:420:               … **Nenhum dos dois aprova o trabalho do
```

**Duas redações diferentes para a suposta citação. Citação literal não tem duas redações.**
O `tasks.toml:152` já separava as duas coisas certo: chama a seta de *"citacao literal"* e o
resto de *"Conteudo obrigatorio desta task"*.

> **⚠️ Tarja 2026-08-28 (`/review`, ciclo 3): a versão anterior deste falsificador não
> rodava, e está registrada em vez de apagada.** Ela publicava `grep -rn -F "aprova o
> trabalho do outro" docs/` afirmando que devolvia as duas fontes. **Não devolve:** a fonte
> única **cai da saída**, porque a frase atravessa uma quebra de linha — a `:420` termina em
> `aprova o trabalho do` e a `:421` contém só `outro.**`. O fragmento também estava na linha
> errada (`:421`; o certo é `:420`). Tirar a palavra `outro` do padrão alcança as duas.
>
> **Versão wrap-safe**, que exibe as duas redações inteiras — o `grep` por linha não consegue:
>
> ```
> python3 -c 'import re,pathlib
> for f in ["docs/decisoes-do-owner.md","docs/context/plataforma-dados/decisoes-de-execucao-2026-08-28.md"]:
>     t=re.sub(r"\s+"," ",pathlib.Path(f).read_text())
>     print(f,"->",re.search(r"Nenhum[^.]*aprova o trabalho do outro\.",t).group(0))'
> decisoes-do-owner.md       -> Nenhum dos dois aprova o trabalho do outro.
> decisoes-de-execucao-….md  -> Nenhum aprova o trabalho do outro.
> ```
>
> **A lição, e ela é o método:** um falsificador publicado sem ter sido executado é a mesma
> classe de defeito que ele acusa. Esta família de armadilha — texto que atravessa wrap —
> mordeu **cinco vezes** nesta task: `\|` em BRE, `cut -c1-N`, `sed -n 'Np'` em linha longa,
> `grep -on` cruzando wrap, e `grep -F` cruzando wrap. **Rode o comando e confira que a saída
> contém o que o texto diz que ela contém, antes de publicá-lo.**

**E a chave `design_gate` não depende de (b) para existir:** (c) abaixo é base independente,
anterior em três dias, e é ela que sustenta o desenho.

**(c) A citação que fixa a de `web`, do `CLAUDE.md`, em 2026-08-25:** *"agente que gera e
aprova o próprio trabalho não tem gate. O ciclo é **gera → critica → itera**"*. O
`ui-designer` é o gerador; declarar `web` só com `architect = ui-designer` publicaria, na
política, um gerador sem gate.

## Ordem de operação

1. O `architect` do componente decide o que decide — **sem pedir permissão**, dentro da sua
   classe de risco.
2. O gate critica. Enquanto ele não concordar, **a decisão de design não vale**.
3. Discordância entre os dois **não se resolve por antiguidade nem por hierarquia**: sobe
   para o owner — ver o precedente abaixo.
4. Silêncio do owner **não é aprovação**; aprovação é o veredito do gate `[DOC: CLAUDE.md]`.

### O precedente que calibra o item 3

**Precedente, e ele tem de ser citado INTEIRO — as duas metades estão na mesma linha
`docs/INDEX.md:41` (a entrada `2026-08-25T20:22Z`), mais `docs/adr/ADR-010-…:6`:**

| metade | o que a fonte diz, literal | onde |
|---|---|---|
| **o gate mordeu** | *"O gate `ux-ui-mastery` emitiu `APROVADO COM CONDIÇÃO` — testou o testador antes de julgar"*, e *"gateou por duas falhas medidas"* | `docs/INDEX.md:41` |
| **e não foi barato** | *"o gate `ux-ui-mastery` (`APROVADO COM CONDIÇÃO`, **8 condições**)"* | `docs/adr/ADR-010-governanca-de-cor-por-tipo-de-marca.md:6` |
| **o designer contestou, e a contestação foi julgada pelo mérito** | *"O designer discordou do gate em 4 pontos e acertou nos 4"* | `docs/INDEX.md:41` |

`[DOC]` nas três · `[MEDIDO 2026-08-28: grep -on "O designer discordou do gate em 4 pontos e
acertou nos 4" docs/INDEX.md → `41:…`; e `sed -n '6p'` na ADR-010 → a linha das 8 condições]`

**A leitura que este precedente autoriza, e a que ele NÃO autoriza.** Ele **não** diz que o
designer costuma ter razão contra o gate: no mesmo episódio o gate impôs **8 condições** e
reprovou por **duas falhas medidas** que o designer não tinha visto. O que ele diz é mais
estreito e é o que interessa aqui: **discordância se resolve por medição, não por posto** —
o designer recusou 4 pontos **apresentando medição** (entre eles, que o valor sugerido pelo
próprio gate não entregava o P1 que o gate pedia), e foi por isso que prevaleceu nesses 4.
**Citar só a metade que favorece um dos lados é o defeito, e ele quase entrou aqui.**

## ⚠️ O limite deste documento, declarado e não escondido

**Nenhum comando do plugin roteia por `design_gate`.**
`[MEDIDO 2026-08-28: grep -rn "agents" sobre os 9 arquivos de `commands/` do harness-plugin
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

Cinco mutações efêmeras contra a declaração de `harness.toml`, `[MEDIDO 2026-08-28]` — as
duas últimas acrescentadas depois de o `/qa` apontar que a tabela de três não cobria o caso
pior:

| mutação | resultado | leitura |
|---|---|---|
| componente **fora** do vocabulário fechado (`[agents.by_component.frontend]`) | **`rc=1`**, `[erro] V-16 … esperado um dos componentes declarados` | o validador **de fato lê** esta seção; o verde não é carimbo |
| `design_gate` apontando para caminho **inexistente** | `rc=0` com **2 `[aviso]` V-16** nomeando as duas chaves | o ponteiro quebrado é **visível**, mas **não reprova** (`fatal=False` em `lib/policy.py`) |
| **`design_gate` simplesmente APAGADO das duas entradas** | **`rc=0`, silêncio total** — e `harness policy` passa a devolver `charts` e `web` só com `architect` | **⚠️ nada no mecanismo protege o segundo julgamento.** Apagar o gate é indistinguível, para o validador, de nunca tê-lo declarado |
| **donos TROCADOS** — `charts` → `ui-designer`, `web` → `quant-architect`, contradizendo **literalmente** a resposta de `Q16` | **`rc=0` em tudo**: `validate --strict`, `policy`, `doctor`, `sweep`, `tasks validate` — silêncio total | **⚠️ pior que a anterior.** Não é só o segundo julgamento que está desprotegido: **a atribuição do owner inteira** pode ser invertida sem que um único comando acuse |
| **seção vazia** — `[agents.by_component.charts]` sem nenhuma chave | `rc=0` em tudo, e `harness policy` publica **`"charts": {}`** | **⚠️ e isto atinge o próprio `D1.2`:** o comando do DoD (*"contém `charts` e `web`"*) é satisfeito por `{}`. A entrega real **não** está vazia, então `D1.2` fecha de verdade — mas **o comando do DoD, sozinho, não é portão**: ele testa presença de chave, não presença de dono |

**Consequência, escrita para não ser descoberta depois, e ela é mais ampla do que parecia
com três mutações:** o que é **doutrina, não portão**, não é só a separação dos dois
julgamentos — é **toda a atribuição de dono que o owner fez em `Q16`**. Apagar o
`design_gate`, trocar `charts` por `ui-designer`, ou esvaziar a seção inteira: as três
desfazem uma decisão do owner (`Q16`, 2026-08-28) e do `CLAUDE.md` (2026-08-25) **sem que
nenhum comando acuse**. O único erro que o mecanismo FECHA é o componente fora do
vocabulário fechado.

**Corolário para quem for conferir `D1.2` no futuro:** rodar o comando do DoD e ver `charts`
e `web` na saída **não basta** — é preciso olhar **o que há dentro** de cada um. O que sobra
contra tudo isto é a revisão humana e este parágrafo, e chamar isso de enforcement seria a
mentira que o resto do repositório existe para evitar.
