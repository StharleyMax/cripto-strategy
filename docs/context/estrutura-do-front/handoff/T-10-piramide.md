# Handoff ao tech-lead: fase 10 · pirâmide de testes (2026-10-03)

## O pedido `[PREMISSA-OWNER: 2026-10-03]`

A análise nasceu deste pedido:

> *"nosso maior gargalo ta nos testes e2e, consegue validar como ta nossa piramide de testes, o e2e deveria validar o que os unitários n
> estao sao capazes de validar. vamos dar uma revisada nisso. e tbm ver testes unitarios inuteis e duplicados."*

Depois da análise, o owner autorizou:

> *"apos a analise já pode iniciar os ajustes e melhorias, daí pode entrar nessa memsa feature atual"*

A feature atual é `estrutura-do-front`. As melhorias entram nela como a **fase 10**, com ids `T-10.N`, pelo mesmo caminho por que a T-00.4 entrou
(veja a narrativa §9 na branch `origin/task/T-00.E2E`). O adendo desta fase vai na narrativa como **§10**.

## Fontes, todas nesta worktree (commit 5bc99643)

- `docs/context/piramide-de-testes/gates/E2E-analise.md`: os 42 specs com veredito; a tabela §2; os conflitos C-1…C-9 já resolvidos em §5;
  os custos escondidos em §6.
- `docs/context/piramide-de-testes/gates/UNIT-FRONT-analise.md`: 111 arquivos, 216 testes que fazem grep de fonte, os gargalos
  eslint-boundary e fingerprint, e a §7 de pendências.
- `docs/context/piramide-de-testes/gates/BACKEND-analise.md`: o oráculo do `test_oi_candles_route_invariants.py`, os grupos G1–G8 e a §7 de
  pendências.

Leia esses arquivos por seção, com `grep -n` ancorado nos títulos. **Não cole o corpo deles no tasks.toml:** cite o arquivo e a seção.

## Restrições de quebra

1. **Ordem por custo e risco.** Primeiro o que é mecânico e não mexe em asserção: os sonos fixos (`waitForTimeout`), o skip decidido antes da
   montagem, a instrumentação do 35/38, o lint dos probes plantados, o cache do oráculo. Depois vêm as fusões e as descidas, e por último os cortes.
2. **Toda task que funde, desce ou corta prova que a mesma mutação ainda morde depois da mudança.** Isso vale por spec ou teste
   removido. Cite a mutação de origem (o `git log` ou o gate que a análise já cita). Se nenhuma mutação morder, o teste não sai.
3. **Os tempos antes e depois saem do mesmo comando, sozinho na máquina** (há um e2e por vez, sob `scratchpad/e2e.lock`). Ganho que não foi
   medido não fecha a task.
4. **Exceção à DoD-2 da feature, declarada task a task:** esta fase pode ter M/D em `frontend/e2e/`, mas só nos specs que a task nomeia
   (o mesmo padrão da T-00.4).
5. **Dependências:**
   - Tudo que toca `e2e/18` ou `e2e/20` depende de `T-00.4`, que mexeu nos dois e ainda não fez merge. Isso inclui a fusão 17/22→20 e a 26→18.
   - Nada colide em arquivo com `T-02.2`/`T-02.3`. Confira em `tasks.toml`.
   - A reescrita dos contratos-âncora que fazem grep de fonte (UNIT-FRONT §8) **precede F3–F7**, porque cada movimentação quebra
     15 a 20 arquivos desses (T-01.2/3/4). Declare isso nas `depends_on` das tasks das fases 03 a 07.
6. **Escopo:** o teste de backend fica fora dos 10 prefixos da feature. Liste o prefixo exato que precisa de
   `harness pipeline scope estrutura-do-front add` e confira se outra feature viva já o reivindica. Quem roda o comando é o orquestrador.
7. **As pendências das análises PARCIAIS também viram task**, para não ficarem como dívida silenciosa:
   - confirmar os 41 "MORDE em memória" (UNIT-FRONT §7);
   - classificar as 195 funções de backend que não executam linha de produção (BACKEND §7).

## Fora da fase 10 (decisão do owner, não do tech-lead)

- `workers > 1` no Playwright: esbarra no swap do host.
- Código de `charts/` e `backtest/` no backend que a produção não importa.

Liste os dois no adendo §10 como pendências do owner, com o custo de cada um.

## Entrega

1. Acrescente as tasks ao final de `docs/context/estrutura-do-front/tasks.toml` e rode `harness tasks validate estrutura-do-front`.
2. Escreva o adendo §10 em `gates/TECH-LEAD-narrativa.md`.
3. Acrescente uma linha a `docs/INDEX.md`, que é append-only.
4. Não crie card no Jira e não commite: o orquestrador commita.
