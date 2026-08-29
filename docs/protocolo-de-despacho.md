# Protocolo de despacho — o que entra no contexto e o que fica em disco

Doutrina deste repositório para o **loop principal** e para **todo subagente**. Declarado em
`harness.toml` como `[agents] dispatch_protocol`; o mecanismo o serve sob a chave efetiva
`agents.roles.dispatch_protocol` — o acessor separa papel de componente
`[MEDIDO 2026-08-29: harness policy --key agents.roles.dispatch_protocol → rc=0]`.

Alcança `/build` e `/qa`, que consultam `harness policy --key agents`
`[MEDIDO 2026-08-29: 2 ocorrências no plugin v0.13.0 — commands/build.md:36, commands/qa.md:19]`.
Para o loop principal e os demais papéis, quem vincula é o `CLAUDE.md`.

## Por que existe, com o número que a produziu

`[MEDIDO 2026-08-29, sessão `b227a990` deste repositório: 692 turnos do loop principal, 16h,
41 subagentes]` — **62% do custo da sessão foi releitura de contexto** (US$ 96 de US$ 154
`[INFERRED: preço de lista Opus 5, $5/$25 por MTok, leitura de cache 0,1×, escrita 1h 2×]`).
Contexto por turno: **p50 275k · p90 506k · máx 537k**, e a sessão estourou e compactou.

As três fontes, medidas no transcript:

| fonte | medida | universo |
|---|---|---|
| relatório de subagente inlinado | média **9,4KB**, ~103k tokens no total — e o texto integral **já estava em disco**, no `<output-file>` que a própria notificação cita | n=44 notificações |
| prompt de despacho | média **8,6KB** — maior que a definição do agente que ele invoca (`agents/qa.md` = 66 linhas) | n=30 chamadas de `Agent` |
| arquivo grande lido no loop principal | um `sed -n '140,280p'` de **26KB** num único turno | n=261 chamadas de `Bash` |

Comando que reproduz: ler `~/.claude/projects/<slug>/<sessão>.jsonl` e somar `usage` por
turno e bytes por tipo de bloco de conteúdo.

**A assimetria que justifica cada regra abaixo:** um relatório entregue no turno 300 de 692 é
relido **~390 vezes**. O custo de uma linha não é o que ela custa uma vez — é o que ela custa
multiplicado pelos turnos que faltam. Escrever 9KB no disco custa 9KB; colá-los no contexto
custa 9KB × (turnos restantes).

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

## O limite que este documento admite

`agents/qa.md` já registrou a lição que vale aqui: *"prosa aqui mediu 0% de adesão — quem cobra
de verdade é o portão do `gate-record`"*. **Nada neste arquivo é portão.** R1–R4 são doutrina, e
doutrina sem portão é adesão voluntária. O portão correspondente — um teto de bytes medido na
notificação de subagente — **não existe no mecanismo** e seria mudança no plugin, não aqui.

## Falsificador

Rode uma sessão de trabalho comparável sob estas regras e meça:

```
# US$/turno e p50 de contexto, do transcript da sessão
# linha de base MEDIDA em b227a990: US$/turno = 0,223 · p50 de contexto = 275k
```

**Se `US$/turno` e o p50 de contexto não caírem abaixo de `0,223` e `275k`, estas regras não
pagam o que custam e este documento sai** — não fica como boa intenção não medida.
