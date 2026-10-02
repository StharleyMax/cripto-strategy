# Decisões do owner — `estrutura-do-front`

Origem do menu: `gates/FRONTEND-ARCH-estudo.md` §9 (redigido pelo `frontend-architect`, apresentado pelo orquestrador em 2026-10-02).

## O-1 — o que vem ligado na primeira visita

`[DECISÃO-OWNER: 2026-10-02, escolha entre alternativas apresentadas]` — **os 5 indicadores atuais ligados** (volume, OI, CVD,
liquidação, long/short). O custo, como estava no menu: tela idêntica durante a migração, o e2e atual vale como portão, e mudar o
padrão depois é trocar uma constante. Alternativa recusada: só preço + volume (a tela mudaria na F9 e os specs de e2e teriam de
ligar os indicadores antes de medir).

## O-2 — onde nasce o seletor (tela A)

Menu: (a) F11 desta feature · (b) F1 de `indicadores-smc`. O owner respondeu em texto livre — literal:

> *"seleção pode ser da F1, daí aqui nasce como tudo sendo injetado já como se tivesse selecionado até que a f1 do smc seja desenvolvida."*

`[PREMISSA-OWNER: 2026-10-02]`

**Leitura adotada pelo orquestrador** `[INFERRED: da frase acima]`: a **UI do seletor (F11) sai desta feature e vai para a F1
de `indicadores-smc`**. Esta feature entrega o **mecanismo** de seleção (catálogo, estado da seleção acima do remonte, render e
fetch guiados pelo conjunto ativo, F9–F10) com **todos os 5 injetados como selecionados**, sem controle na tela para desligar.
Escopo desta feature: F0–F10.
