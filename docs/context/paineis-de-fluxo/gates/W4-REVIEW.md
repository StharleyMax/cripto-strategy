# W4-REVIEW — review arquitetural da wave W4 (fase 02 + T-01.R1)

**Feature:** `paineis-de-fluxo` · **Base:** `c0d851b` (`wave/paineis-f02`), diff `master...wave/paineis-f02`
(merge-base `5518e51`) · **Data:** 2026-09-26 · **Revisor:** `/review` (read-only; não roda `gate-record`)
**Contra:** `docs/plans/SPEC-009-paineis-de-fluxo/02_volume_com_direcao.md` (itens 2.1–2.4, DoD 1–5), o DoD de
`T-02.1`…`T-02.5` (`harness tasks json paineis-de-fluxo`), `SPEC-009` §389/§391/§403, `PRD-009` `RF-7`/`RNF-3`/`CA-6`/
`CA-12`/`I-3`, `ADR-003`, `ADR-010` (D-2), `ADR-044` (D2/D3′), `ADR-045`, `CLAUDE.md` e `handoff/REGRAS-DE-DESPACHO-WORKFLOW-2026-09-24.md` §4-§5.

## 0. Veredito: **COMPLIANT**

Nenhuma regra bloqueante violada. Quatro WARNINGs de documento/convenção e dois INFO, nenhum de regra bloqueante.
⚠️ **Este veredito não anula o `NEEDS_FIX` de `gates/W4-QA.md`.** O BLOCKER-1 do QA (Doc delta do doji) é
de outra régua, a doutrina do QA. Aqui ele entra como WARNING-2, porque nenhuma regra bloqueante o cobre.

## 1. Denominador

| camada | comando | universo | resultado |
|---|---|---|---|
| regras bloqueantes em vigor | `harness rules list --severity block` | **8** regras (packs `core`, `web-fullstack`, `own`) | 8 avaliadas pelo runner |
| por arquivo | `git diff --name-only master...wave/paineis-f02 \| grep -E '^(frontend/src\|frontend/e2e\|backend\|deploy)/'` e `harness rules --mode file --path <f>` em cada um | **27** arquivos (17 `frontend/src`, 10 `frontend/e2e`; 0 backend/deploy) | **27/27 rc=0, 0 achados** `[MEDIDO]` |
| varredura inteira | `harness rules --mode sweep` | árvore da wave | **0 `[BLOQUEIO]`**, 77 linhas `[AVISO]`, **nenhuma** em arquivo do diff `[MEDIDO: grep -F "<arquivo>:" sobre a saída]` |
| unitárias da fase | `cd frontend && node --test src/charts/volume-direction.test.ts src/app/symbol/pane-legend.test.ts src/app/symbol/absence-readout-microcopy.test.ts` | 33 testes | **33 pass / 0 fail** `[MEDIDO]` |

Sobre `core.relative-import`: `harness rules list` não expõe o padrão, e o runner não acusa o `from "./x.ts"` de TS
(55 de 69 arquivos de `frontend/src/charts` usam a mesma forma `[MEDIDO: grep -rlE 'from "\./' | wc -l]`). O que
vale é o que o runner mede, e ele não acusou.

`make verify` não foi rodado de novo por este portão. A evidência é a do QA (`W4-QA.md` §5, `rc=0`,
`VERIFY_FORCE=1`) `[DOC]`.

## 2. Camada arquitetural — o que foi conferido e passou

- **Direção de dependência.** `charts/volume-direction.ts:38-41` importa só de `charts` (`color-tokens`,
  `canonical-grid`, `s2-scalar-grid`, `s2-lightweight-adapter`). `web` consome pelo barril `charts/index.ts:152-155`
  (`SymbolClient.tsx:108`). Nenhum `charts → app` (`grep -rnE 'from "(\.\./)+app' frontend/src/charts`: só a sonda
  de `eslint-boundary.test.ts:239`). Isso cumpre `ADR-003` FR-1 (charts puro, sem I/O).
- **Responsabilidade por componente, como o plano manda.** Item 2.1 (função pura) e 2.2 (vela ausente ⇒ neutro) em
  `charts` (`volume-direction.ts:50-59`). Item 2.3 (escala) e 2.4 (ligação) em `web`: `SymbolClient.tsx:1524`,
  `:1536` e `:1977`. O pareamento vela↔barra é **por `time`**, dentro de `charts` (`volume-direction.ts:81-105`). Isso
  é correto porque `volume.slots` segue a ordem do wire, uma linha por bucket da TF (`panel-assembly.ts:206-212`).
- **`RNF-3`, uma gramática de cor.** Os tokens saem de `colorTokens()`/`dojiItemColors()`, nunca de um literal, com o
  mesmo predicado de doji da vela.
- **`RN-4`.** Barra sem vela recebe `provenanceWeak` **explícito** (`volume-direction.ts:52-54`). Zero e ausência
  ficam fora da série de barras e ganham marca própria (`:94-96`).
- **`ADR-044` (legenda lê o slot, `CA-3′`/`CA-4`).** `T-01.R1` muda só o numeral pintado
  (`pane-legend.ts` `formatLegendNumeral`). `rawValue` continua o número servido, e o `data-fact` ainda termina em
  `:absent`. `ABSENCE_TOKEN = "ausente"` é microcopy pt-BR (`CLAUDE.md`, tabela linha 8).
- **Idioma de identificador** (convenção, não portão). Os identificadores, os nomes de arquivo novos
  (`volume-direction.ts`, `e2e/28-30`) e as mensagens de `RangeError` estão em inglês.
- **`ADR-045`.** O diff não toca OI nem projeção. Nada a conferir.

## 3. Achados

1. **[WARNING-1] A redundância de FORMA da barra de volume, aceita em D3, foi trocada por "a forma está na vela
   acima", e a troca não foi registrada.** `SymbolClient.tsx:1977` desenha a barra cheia, com a direção só no matiz
   (`HistogramData.color`). `handoff/DESIGN-LAYOUT.md:39` (**D3, ACEITO** pelo `ux-ui-mastery`) pede "volume com a
   forma da vela (vazado verde / cheio vermelho / `#8b949e` no doji)", como "redundância de forma de `ADR-010` D-2
   estendida à barra: sem ela, o volume colorido reprova SC 1.4.1". A pergunta foi escalada ao orquestrador **antes da
   T-02.3** (`handoff/T-02.1-doji-julgamento.md` §4; `gates/T-02.1-DOJI-builder.md:108-110`: par `{color, borderColor}`
   com série custom, **ou** reversão da D3 pelo `ux-ui-mastery`). No diff não há artefato dessa decisão
   (`grep -lE 'vazad|borderColor|ICustomSeries'` nos docs do diff só devolve os próprios documentos que levantaram
   a pergunta). O gate de design aprovou a tela assim (`T-02.5-design-review-r2.md` APPROVED), mas o SF-14
   (`T-02.5-design-review.md:123-128`, repetido em r2 `:128-130`) diz que a garantia de WCAG 1.4.1 "deve ficar
   escrita". **Correção:** uma nota datada abaixo da linha D3 de `DESIGN-LAYOUT.md`, sem reescrevê-la (append),
   registrando que a redundância de forma do volume vem da vela do mesmo instante, com citação do r2 e do SF-14.
   A outra saída é implementar `{color, borderColor}` com série custom em `charts`.
   — `frontend/src/app/symbol/SymbolClient.tsx:1977` — `handoff/DESIGN-LAYOUT.md:39` (D3) + `ADR-010` §D-2 (`:105-119`).
2. **[WARNING-2] O código segue a `ADR-010/D-2`, mas o plano e o PRD aprovados ainda dizem "doji = alta".**
   `volume-direction.ts:55-57` pinta o doji com `dojiItemColors().color`. O plano `02:12`, `PRD-009:194` (`RF-7`),
   `:282` (`I-3`) e `MAPA-DOCUMENTAL.md:68` dizem alta. A precedência escolhida está certa: `MAPA-DOCUMENTAL.md:9-15`
   põe ADR acima de SPEC, PRD e plano. O dono de `I-3` é o `design_gate`, que já tinha aceito `#8b949e`
   (julgamento §1). O que falta é o documento. O DoD 1 do plano (`:20`, "reprova 3 dos 4") não se cumpre ao pé da
   letra. Com o ramo `===` antes, `>=`→`<` reprova 2, e o mutante do doji reprova o 3º (julgamento §3; `W4-QA.md`
   M2b). **Correção:** a ação 1 de `W4-QA.md` §8, com as notas datadas abaixo das linhas.
   — `docs/plans/SPEC-009-paineis-de-fluxo/02_volume_com_direcao.md:12,20` — `ADR-010` §D-2 + `MAPA-DOCUMENTAL.md:9-15`.
3. **[WARNING-3] `Q-VOL-2`/`Q-DG-2` foi respondida (linear, base 0), e a SPEC continua dizendo "o de hoje".**
   `SPEC-009:389` põe log10 como default. A decisão está em `gates/T-02.2-design-gate.md` §8 (APPROVED no ciclo 2) e
   no código (`SymbolClient.tsx:1524`, `VOLUME_BAR_BASE = 0`, `PriceScaleMode.Normal`). **Correção:** anotar a
   resposta em `SPEC-009:389` e `PRD-009:337`.
   — `docs/specs/SPEC-009-paineis-de-fluxo.md:389` — `SPEC-009` §389 (`[Q-DG-2]`, dono `design_gate`).
4. **[WARNING-4] Um comentário editado neste diff continua em português.** A docstring de `VolumeMarksLegend`
   (`SymbolClient.tsx:1785-1786`, "As DUAS marcas da faixa de marcas (abaixo da base das barras desde `T-02.2`…") foi
   reescrita na W4 e ficou em PT. A linha 5 da tabela de fronteira do `CLAUDE.md` pede comentário em inglês. O resto do
   que a W4 reescreveu no mesmo arquivo foi traduzido (ex.: `:1589-1598`). **Correção:** traduzir o bloco na próxima
   edição do arquivo. É convenção, não portão.
   — `frontend/src/app/symbol/SymbolClient.tsx:1785` — `CLAUDE.md` §"A tabela de fronteira", linha 5.
5. **[INFO]** `SymbolClient.tsx:1728` ainda diz que o readout "prints `SEM_PONTO`". Desde o SF-9 ele imprime `ausente`
   (`W4-QA.md` achado 6). A docstring da constante (`:1395-1409`) já traz a correção.
6. **[INFO]** O pareamento por `time` em TF ≠ `1m` só tem guarda unitário (`volume-direction.test.ts:89`). Sob M3,
   `e2e/29`/`e2e/30` passam (`W4-QA.md` W-1). A responsabilidade está no lugar certo (`charts`), e falta só o guarda de
   integração (`W4-QA.md` §8 ação 3).

## 4. O que este portão não mediu

- A cor por pixel (`CA-6`) e as mutações no app real são do QA (`W4-QA.md` §3-§4). Não refiz.
- O juízo estético de D3 contra SF-14 é do `ux-ui-mastery`, não deste portão. O WARNING-1 cobra o **registro**
  da decisão, não o mérito dela.
