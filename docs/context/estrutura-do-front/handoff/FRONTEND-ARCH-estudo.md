# Handoff → `frontend-architect` — estudo de estrutura do front (`estrutura-do-front`)

**Aberto em 2026-10-02.** Ledger: `harness pipeline state estrutura-do-front` = `INIT`.
**Entrega:** `docs/context/estrutura-do-front/gates/FRONTEND-ARCH-estudo.md` + ADR **proposta** em `docs/adr/` (número livre seguinte a `ADR-049`, conferindo as três branches abaixo para não colidir).

## 1. O pedido do owner — citação literal `[PREMISSA-OWNER: 2026-10-02]`

> *"hoje praticamente 100% do que temos de valor está em um único arquivo, então trabalhar em multi tasks está quase impossível."*
>
> *"uma das necessidades é a criação de uma aba de seleção de indicadores/estratégias. volume, OI, cvd e outros é tudo indicadores. Então vamos fazer essa estruturação no projeto, inclusive olhar como e quais responsabiliades, pois n faz sentido ficar tudo da forma como está. Cada um deveria ser um item isolado que posso mexer sem gerar impactos e são carregados a partir dos indicadores selecionados."*
>
> *"Vale estudar como aplicar isso nas pastas e em arquivos, o que deveria ser componentes, pq claramente não estamos seguindo boas práticas."*
>
> *"esse ajuste de agora será puxado antes da feature de indicadores-smc pq daí já conseguimos ter algo estruturado lá"*

## 2. Fatos medidos (orquestrador, 2026-10-02)

- `frontend/src/app/symbol/SymbolClient.tsx`: **4.490 linhas** em `master` (`eda7520`) e **4.527** em `wave/paineis-f05` `[MEDIDO: wc -l; git show wave/paineis-f05:…]`. Segundo maior: `view-model.ts` 1.286, `[symbol]/page.tsx` 1.038.
- `frontend/src/app/symbol/` tem **86 arquivos** `[MEDIDO: ls | wc -l]`; `components/` só tem `ui/`; `features/` = `panel`, `s1-console`, `s3-inspector`.
- Dentro de `SymbolClient.tsx` convivem: tipos de dado por pane (`VolumeSubAxisData`, `CvdPaneData`, `OiPaneData`, `LiquidationPaneData`, `LongShortPaneData`, `PriceCandleData`), o host do gráfico e o registrar de panes (`SymbolChartHost`, `ChartHostContext`, `PaneRegistrar`), legenda/crosshair (`PaneLegend`, `LegendValue`), marcas de ausência/cobertura, e cada pane com constantes, escalas e parâmetros de ablação de e2e (`PricePane` `:2002`, `OiPane` `:2528`, CVD, liquidação, long/short…) `[MEDIDO: grep de declarações de topo na versão da wave]`.
- Já existe `app/symbol/pane-registry.ts` (532 linhas). Leia-o antes de propor registro novo.
- **`wave/paineis-f05` está ATIVA e não mergeada:** 10+ commits, **47 arquivos do front, +1.640/−287**, T-05.1 mergeada na wave, T-05.2..5 em andamento `[MEDIDO: git diff --stat master...wave/paineis-f05 -- frontend]`. Outra sessão trabalha nela. **Não edite nada nela.**

## 3. O que já foi decidido e que este estudo afeta

Na branch `docs/indicadores-smc-refinamento` (worktree `.claude/worktrees/indicadores-smc`, outra sessão — **só leia**):
- `docs/adr/ADR-048-*` (proposta): camada de indicadores **enxertada** em `SymbolClient.tsx` (registrar com *overlay*, `chart-host-overlay.ts`, código em `app/symbol/indicators/`), orçamento ~60–80 linhas no arquivo.
- `docs/context/indicadores-smc/gates/FRONTEND-ARCH-veredito.md` §0: P-1 (`SymbolClient` remonta por `key` a cada TF/`knowledgeTimeMs`), P-3 (`features/**` não importa `charts`; regra ESLint `ADR-034/D8`).
- `docs/specs/SPEC-010-indicadores-smc.md` §8 (sequência e "um editor de `SymbolClient.tsx` por vez") e §6.1 (`IndicatorInstance`).
- `docs/context/indicadores-smc/gates/UI-DESIGNER-proposta.md`: o seletor (tela A) desenhado.

Este estudo **pode e deve** dizer o que muda em `ADR-048` e em `SPEC-010 §8` — como proposta de emenda, não editando os arquivos daquela branch.

## 4. Perguntas a responder

- **E-1 Inventário de responsabilidades** de `SymbolClient.tsx` (e de `view-model.ts`, `[symbol]/page.tsx`): blocos, linhas, quem depende de quem. Medido, com comando.
- **E-2 O contrato de "indicador" como módulo.** Uma interface única para o que hoje é pane fixo (volume, OI, CVD, liquidação, long/short) **e** para o que vem (EMA/SMA, SMC): identidade, dado de que precisa (fetch/SSE), onde desenha (pane próprio × *overlay* no preço), legenda, ausência, parâmetros. O que é núcleo (vela, eixo de tempo, host, crosshair) e **não** é indicador.
- **E-3 Carregamento por seleção:** registro (catálogo) → instâncias selecionadas → o host monta só o que está selecionado. Onde mora o estado da seleção sobrevivendo ao remonte (P-1). Lazy import por indicador vale a pena aqui? Com número, não opinião.
- **E-4 Árvore de pastas e fronteiras:** o que vai para `components/` (genérico), `charts/` (geometria, sem React?), cada indicador numa pasta própria com tipo/hook/componente/teste. Como as regras de ESLint de `ADR-034/D8` mudam para **impedir** um indicador de importar outro.
- **E-5 Plano de migração em fatias**, cada uma mergeável sozinha e com o comportamento na tela idêntico (o e2e existente é o portão: diga quais specs). Ordem, tamanho estimado e quais fatias podem correr em paralelo depois. Sequência frente a `wave/paineis-f05` e a `indicadores-smc`.
- **E-6 Teste:** os 50+ testes de contrato em `app/symbol/*.test.ts` mudam de lugar? Quais quebram por caminho, quais por comportamento.

## 5. Fora do seu julgamento (marque onde aparecer)

Aparência e interação do seletor = `ui-designer` + gate `ux-ui-mastery`. Se volume/OI/CVD continuam ligados por padrão = decisão do owner (redija o menu com o custo de cada opção).

## 6. Regras

`CLAUDE.md` vale integralmente: número só com comando; código em inglês, docs em português; **R1: devolva ≤ 15 linhas** (veredito, números, caminho). Só escreva sob `docs/` desta worktree.

## 7. Estado de saída (frontend-architect, 2026-10-02) — ENTREGUE

- Estudo: `docs/context/estrutura-do-front/gates/FRONTEND-ARCH-estudo.md` (E-1..E-6, emenda proposta à ADR-048/SPEC-010 no §8, menu do owner no §9).
- ADR: `docs/adr/ADR-050-indicador-como-modulo-isolado-nucleo-do-grafico-e-catalogo-por-selecao.md` (proposta).
- Pendente para o orquestrador: linha em `docs/INDEX.md` (append-only, não tocada por instrução do despacho); `O-1`/`O-2` ao owner; a pergunta da `ADR-047` (embutidos no corpo hasheado) ao `/architect` de `indicadores-smc`.
- F0 pode ser despachada já (não toca arquivo da `wave/paineis-f05`); F1+ esperam a fase 05 em `origin/master`.
