# ADR-003 — A fronteira `charts` ⇄ `web`

**Data:** 2026-08-25 · **Status:** proposto · **SPEC:** [`SPEC-001`](../specs/SPEC-001-plataforma-dados.md) §4.1
**Fase/Epic:** F5a (a fronteira) e F1 (o primeiro uso) · `CST-1`, `CST-3` · **Componente alvo:** `docs`
**Origem:** correção que o gate mandou carregar — **hoje nenhum dos dois tem arquiteto atribuído em `[agents.by_component]`**

## Contexto

Medido: `harness policy --key agents.by_component` devolve entradas para **`sentimento`, `convergencia` e `backtest`** — e **nada** para `charts` nem `web`. São os dois componentes que a rodada de superfícies produziu, e **é onde todo o sistema de honestidade do dado vai morar** (o selo, a política de ausência, a paleta, `<Anotacao>`).

**E o problema é anterior ao ponteiro:** `CST-7` registra que a fronteira é hoje *"indeterminável por caminho"*. Se ela não é decidível, **o componente-alvo de todo item de frontend é arbitrário** — e isso derrota `[agents.by_component]` e qualquer regra por caminho, porque as duas dependem de saber a qual componente um arquivo pertence.

**Componente omitido é componente sem dono de julgamento.** Atribuir ponteiro antes de a fronteira existir só move o arbítrio.

## Decisão

**A fronteira é por CONTRATO DE DADO, não por caminho de arquivo nem por tecnologia.**

```
charts  = o que transforma <ValorDeMercado> e <Anotacao> em GEOMETRIA
          grade canônica compartilhada · mapeamento tempo->x e valor->y · escalas
          política de ausência por `nature` · trilho de vigência · overlay de anotação
          => entra SÉRIE TIPADA, sai COORDENADA. Não faz fetch. Não conhece rota.
          Não conhece sessão, usuário nem `knowledge_time` — recebe-os como argumento.

web     = o que transforma INTENÇÃO em leitura tipada, e resposta em página
          rotas · sessão e identidade · bundle<->URL · seleção de símbolo/janela/TF
          chrome (selo de sessão, chip de `env`, `pointer_mode`)
          => entra REQUISIÇÃO, sai <ValorDeMercado>/<Anotacao> entregue a `charts`
```

**As três regras que tornam a fronteira decidível por inspeção:**

| # | regra | consequência |
|---|---|---|
| **FR-1** | **`charts` não faz I/O.** Zero `fetch`, zero rota, zero `localStorage`. Toda entrada é argumento | um módulo de `charts` é testável **sem servidor e sem rede** — e a S2-mínima é construível offline, que é o que F1 promete |
| **FR-2** | **`web` não calcula geometria.** Nenhum `px`, nenhuma escala, nenhuma decisão de "onde desenhar" | impede a segunda implementação da grade canônica, que é **o modo de falha em que a tela e o motor discordam sobre o que aconteceu** |
| **FR-3** | **A grade canônica é UMA função, dona de `charts`, e o motor de backtest a IMPORTA** — não a reimplementa | `charts` deixa de ser "a pasta do gráfico" e passa a ser **o dono da grade**, que é o que justifica ele ser componente e não pasta |

**Ponteiro de arquiteto:** ambos apontam para o mesmo dono de julgamento **hoje**, porque o repositório tem um arquiteto de domínio; **o que esta ADR entrega é o critério que torna a atribuição verificável**, não o nome.

## Alternativas recusadas

| alternativa | por que |
|---|---|
| **fronteira por caminho** (`frontend/src/features/chart/**` = `charts`, resto = `web`) | é a que parece mais barata e é **circular**: o layout ainda não existe (`ADR-009`), e amarrar componente a caminho faz **mover arquivo trocar de dono de julgamento** |
| **fronteira por tecnologia** (`charts` = o wrapper do Lightweight Charts) | reduz `charts` a um adaptador de biblioteca, e então **a grade canônica não tem dono** — e ela é compartilhada com o motor, que não é frontend |
| **`charts` some; tudo é `web`** | o vocabulário de componentes é **fechado** e `charts` já está nele. Colapsá-lo exigiria edição de política **e** deixaria a grade sem dono. Custo: a regra `FR-3` deixa de ser expressável |
| **atribuir o ponteiro agora e decidir a fronteira depois** | é o estado de hoje com um nome em cima. Mede-se: `harness rules --mode file --path <um .tsx>` devolve **saída vazia** — o dono existiria e não teria universo |

## Falsificador

**Um item de plano que não consiga declarar UM componente do vocabulário fechado.** É o teste que `CST-7` já nomeia, e esta ADR o aceita como o seu: se, ao fatiar F1 e F4, aparecer um item cujo alvo seja ambiguamente `charts` **e** `web`, a fronteira de FR-1/FR-2 não é decidível e esta ADR está errada.

**Aplicado ao plano desta rodada:** as 9 fases declaram alvo único em todos os itens (ver `docs/plans/SPEC-001-plataforma-dados/`). **O caso mais próximo do limite é o crosshair com linha-guia apontando para trás** (`CA-F1-10`): é **`charts`**, porque a linha-guia é geometria derivada de `available_at`, e `web` só entrega o par `(valor, available_at)`.

**Segundo falsificador:** um módulo de `charts` que precise de `fetch` para renderizar. Se aparecer, FR-1 é irreal e a fronteira é outra.

## Consequência

- O teste de `FR-1`/`FR-2` é **de comportamento e executável**: um contrato de import `forbidden` por componente, na forma medida no `anything_monorepo` (`import-linter`) — ver [`ADR-009`](ADR-009-reuso-da-forma-do-anything.md). **`grep` não é aprovação.**
- **`Q16` deixa de ser pergunta de arquitetura e passa a ser edição de política** (`[agents.by_component]` + `code_paths` + pack), que é `CST-1` e `ADR-009`.
