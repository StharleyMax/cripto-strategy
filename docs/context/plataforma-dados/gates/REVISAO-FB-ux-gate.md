# Gate de UX — `/painel` sob `ux-ui-mastery:ux-audit` (2026-09-04)

Executado no loop principal (`/workflow`) como **gate de validação** da revisão front↔back
(`CLAUDE.md` §Design: "nenhuma decisão de design vale antes de o validador concordar").
Insumo: `REVISAO-FB-playwright.md` §4 (17 achados `[MEDIDO]`, 16 testes, 12 ✘ / 4 ✓) e os
screenshots `REVISAO-FB-shots/01,07` (inspecionados). **Este gate não mede de novo — classifica o
que o Playwright mediu pelas 10 heurísticas de Nielsen.** Onde o achado é do Playwright, o rótulo
é `[MEDIDO: REVISAO-FB-playwright §4 #n]`; onde é leitura minha, `[INFERRED]`.

## UX Audit Results

### Summary
- **Target**: `/painel` (S1 Console + S3 Inspector), única rota da app, chromium headless 1243, viewports 1280 e 390.
- **Overall Score**: **18/100** `[INFERRED: 5 heurísticas com violação sev 4 ou 3; a tela não tem nenhum caminho de dado real]`
- **Findings**: **5 critical (sev 4) · 6 major (sev 3) · 5 minor (sev 2) · 2 cosmetic (sev 1)** — n=18 (17 do Playwright + 1 deste gate)

### Critical & Major Findings

| # | H | local | problema | sev | fonte |
|---|---|---|---|---|---|
| 1 | H1 | toda a tela | Nenhum estado de sistema: sem loading, sem erro, sem vazio. `<main>` idêntico (sha256) com API no ar, bloqueada e morta. O operador **não tem como saber** que está olhando fixture. | **4** | `[MEDIDO §4 #1, #2]` |
| 2 | H1/H2 | toda a tela | Dado exibido é fixture compilada — 0 requisições a API em 16. A tela **mente sobre o estado real** dos coletores (mostra `ATIVO 99.8%` para nada que exista). | **4** | `[MEDIDO §4 #1]` |
| 3 | H3 | S3 · botão `abrir` | Ação primária inerte: 0 cabeçalho "Linhas Cruas" após clique, URL inalterada; `page.tsx:29` descarta `openedSeriesId`. Controle que promete e não faz. | **4** | `[MEDIDO §4 #4]` |
| 4 | H5/H3 | S3 · input de filtro | Filtro aceita qualquer texto e nunca filtra (2→2→2 linhas); `page.tsx:38` passa `EMPTY_CATALOG_FILTER`. Feedback zero para a intenção do usuário. | **4** | `[MEDIDO §4 #3]` |
| 5 | H4/H8 | toda a tela | **Zero CSS chega ao browser**: `Times New Roman`, sem grid, sem cor, ícones renderizados como texto (`PARADOstop_circle`, `diamondQUARENTENA`). O `DESIGN_SYSTEM.md` aprovado não existe em runtime. | **4** | `[MEDIDO §4 #5]` + shot 01 |
| 6 | H2 | S1 · cabeçalho de coluna | `JANELA_DE_PERDA` exibido como identificador cru (snake_case, caixa alta). Linguagem de código na UI do operador. | 3 | `[INFERRED: shot 01]` |
| 7 | H2/H4 | S1 e S3 · células numéricas | Duas marcas decimais e duas convenções de milhar na mesma tela (`1,5 dia` vs `99.8%`; `2.206 pts` vs `1440/1440`). Viola SPEC-001 §3.8. | 3 | `[MEDIDO §4 #10]` |
| 8 | H9/H10 | `/` e `/nao-existe` | 404 padrão do Next em inglês sob `lang=pt-BR`, sem link para `/painel`. Quem abre a raiz não tem para onde ir. | 3 | `[MEDIDO §4 #7]` |
| 9 | H8 | primeira linha da tela | Texto de bancada de lint visível: "Filtro: any resultado serve" (`features/panel/Filter.tsx`). Corpus de teste em produção. | 3 | `[MEDIDO §4 #8]` |
| 10 | H6 | aba do browser / topo | `document.title` vazio (axe `document-title`, serious); 0 `<h1>`. Nenhum sinal de "onde estou". | 3 | `[MEDIDO §4 #6, #12]` |
| 11 | H4 (mobile) | 390 px | Overflow horizontal 558>390 em 2/2 tabelas; sem `overflow-auto` porque não há CSS. | 3 | `[MEDIDO §4 #9]` + shot 07 |

### Minor & Cosmetic
| # | H | problema | sev | fonte |
|---|---|---|---|---|
| 12 | H3 | Gaveta de quarentena "colapsável" sem nenhum controle (`0 button/summary/aria-expanded`). | 2 | `[MEDIDO §4 #11]` |
| 13 | H6/a11y | `input` só com placeholder; 2/2 tabelas sem `caption`/`aria-label`; 0 `nav`. | 2 | `[MEDIDO §4 #12]` |
| 14 | H7 | App inteira tem 3 controles (1 input, 2 botões) e 2 são inertes — nenhuma eficiência para operador frequente (atalhos, ordenação, densidade). | 2 | `[MEDIDO §4 #15]` |
| 15 | H1 | Reconexões exibem `Dur: -` sem legenda do que significa ausência. | 2 | `[INFERRED: shot 01]` |
| 16 | H4 | Estados de coletor em caixa alta (`ATIVO`, `PARADO`) misturados com glifo textual — sem ícone real, sem cor semântica (`ADR-010` governa cor por tipo de marca e não chega ao browser). | 2 | `[INFERRED: shot 01]` + `[MEDIDO §4 #5]` |
| 17 | H2 | `[DOC-ONLY]`, `N/A`, `NÃO MEDIDA` em células — três vocabulários para "sem dado". | 1 | `[INFERRED: shot 01]` |
| 18 | H10 | Nenhum help, tooltip ou legenda para `RESILIÊNCIA ~4.7x` ou `T1m / SLO`. | 1 | `[INFERRED: shot 01]` |

### Strengths `[MEDIDO §4 #14, #12]`
- Hidratação limpa: 0 `console.error`, 0 `pageerror`, HTTP 200.
- Estrutura semântica de base: `main` presente, `lang=pt-BR`, 5 `h2` na ordem esperada, tabelas com `th`.
- axe: 23 regras WCAG 2.x A/AA passam, 1 violação (`document-title`).
- Cliente HTTP tipado existe e funciona contra uvicorn real (8/8 testes), com fingerprint em paridade — o problema é fiação e decisão, não fundação.

### Recommendations (prioridade → esforço)
1. **Decidir e ligar o caminho de dado** (Server Component + `server-only`, decisão do `frontend-architect` em `REVISAO-FB-frontend-architect.md` §3) e **remover as fixtures da rota** — sem isto, todo o resto é pintura sobre dado falso. Esforço: fase de plano (PRD/SPEC), não task. Resolve #1, #2.
2. **Estados de sistema como contrato**: `loading.tsx`, `error.tsx`, ramo vazio em `S1Console`/`S3Inspector`, banner "API indisponível". Esforço: M. Resolve #1, #15.
3. **CSS em runtime**: diagnosticar por que Tailwind/`globals.css` não chega (`layout.tsx` sem import? `postcss` ausente?) — é o achado #5 e derruba #11, #16 juntos. Esforço: S a M `[NÃO SEI: causa raiz não medida]`.
4. **Ligar os 2 controles inertes** (`abrir`, filtro) ou removê-los até existirem. Controle que não faz nada é pior que ausente (H3/H5). Esforço: S. Resolve #3, #4, #12.
5. **Higiene de produção**: remover `Filter.tsx` de bancada da rota, `metadata.title`, `h1`, redirect `/`→`/painel`, `not-found.tsx` em pt-BR. Esforço: S. Resolve #8, #9, #10.
6. **Locale único de numeral** via um formatador (`Intl.NumberFormat('pt-BR')`) — SPEC-001 §3.8 já decide. Esforço: S. Resolve #7.
7. **Cabeçalhos humanos** (`Janela de perda`, não `JANELA_DE_PERDA`) — mas cuidado: o **nome da coluna de contrato** fica em `janela_de_perda` (`CLAUDE.md` linha 11); o rótulo de UI é superfície separada (linha 8). Esforço: XS. Resolve #6.

### Veredito do gate
**NÃO CONCORDA com o estado atual de `/painel` como produto.** As decisões de design registradas em
`T-06.10-design.md`/`STITCH_CONTEXT.md` **não chegam ao browser** (achado #5) e a tela não tem caminho
de dado (achado #1). O gate concorda com o diagnóstico dos três revisores: a raiz é **decisão de
arquitetura de leitura** (dono: `frontend-architect` + `infra-architect`, com `quant-architect` para
`janela_de_perda`), e a correção de UX só faz sentido **depois** dela.

`[NÃO SEI]`: contraste e hierarquia visual do design aprovado — não há CSS em runtime para medir.
