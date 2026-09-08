# F1/F2 — decisões de `frontend-architect` — `pagina-de-grafico-s2`

**Rev de ancoragem:** `master@adf6537` (`git rev-parse --short HEAD`) · **Escopo:** `[Q1]`, `[Q2]`,
`[Q3]` (`PRD-006` §9/§14/§15) + forma da exceção estreita de ESLint (`ADR-003/D5.12`). **Não
implementa nada** — decisão de arquitetura para SPEC ainda a escrever.

---

## `[Q1]` — nome do segmento de rota novo (S2): **`symbol`**

| candidato | custo |
|---|---|
| `chart` | direto ao conteúdo visível (candlestick+OI+CVD), mas **não tem âncora** no vocabulário já fixado pelo design/domínio — introduz um 4º sinônimo (`gráfico`/`chart`/`S2`/…) para algo que já tem nome |
| **`symbol`** *(escolhido)* | casa por igualdade semântica com o nome **canônico já aprovado**: `S2 Símbolo - Operacional Core Rev. B` `[DOC: docs/product/STITCH_CONTEXT.md:5,130,145,197]` — a tela não é "um gráfico", é "o núcleo operacional **escalado por símbolo**"; hoje BTCUSDT fixo, mas `symbol` já é o campo dominante em `history-transport.ts`/`live-transport.ts` (`readonly symbol: string`, `frontend/src/app/live-transport.ts:59,90,115,120`) — a rota fica pronta para um segmento dinâmico futuro (`/symbol/[symbol]`) sem precisar trocar de nome quando o seletor de símbolo existir |
| `market` | mais amplo que o conteúdo real (sugere order book/visão multi-símbolo); zero âncora em código ou design |

**Comando que produziu a âncora:** `grep -n 'S2.*[Ss]ímbolo' docs/product/STITCH_CONTEXT.md` →
linhas 5, 130, 145, 197, todas nomeando a tela canônica como *"S2 Símbolo"*. `[MEDIDO 2026-09-08]`

**Diretório resultante:** `frontend/src/app/symbol/page.tsx` (App Router, `ADR-009/D3`: layout
fixo em `frontend/src/{app,features,components}`).

---

## `[Q2]` — nome que substitui `/painel`: **`console`**

| candidato | custo |
|---|---|
| **`console`** *(escolhido)* | já é o nome em produção — `frontend/src/features/s1-console/S1Console.tsx`, diretório `s1-console/` — e o nome canônico aprovado da tela é **`S1 Console — Diagnóstico Operacional (Rev. B)`** `[DOC: STITCH_CONTEXT.md:6,131,409,415]`. Migrar `/painel` para `console` fecha a divergência entre URL e identificador de código/design em vez de abrir uma nova |
| `dashboard` | genérico, sem âncora nesta base — aparece só 1× como adjetivo de severidade visual (`S3Inspector.tsx:54`, "dashboard severity"), não como nome de tela. Adotá-lo cria um **3º sinônimo** (`painel`/`console`/`dashboard`) para a mesma coisa |
| `panel` | cognato literal de "painel", mas **colide** com o vocabulário novo desta mesma feature: `RF-4`/`US-4` chamam os blocos Preço/OI/CVD da página `symbol` de **"panels"** — nomear a rota antiga `panel` cria duas coisas não relacionadas com o mesmo nome dentro do mesmo app |
| `overview` | sem âncora; sugere resumo/landing, subestima o caráter de diagnóstico operacional que o próprio título aprovado já declara |

`/painel` hoje serve S1 (console) + S3 (inspetor) — `console` nomeia o conteúdo dominante (S1);
S3 continua com nome próprio (`s3-inspector`) dentro da mesma rota, sem diluição.

**Consequência não pedida por `[Q1]`/`[Q2]` mas decorrente, registrada para não ficar implícita:**
o redirect de `/` (hoje `/` → `/painel`, `frontend/next.config.ts:14-23`) **continua apontando
para o sucessor direto de `/painel`**, ou seja `/` → `/console` — **não** para `/symbol`. Trocar o
destino de `/` para a tela nova seria decisão de produto fora do gatilho desta rodada (`NG-8`:
"renomear qualquer coisa fora de `/painel`"); só o **nome** muda, o **alvo lógico** de `/` não.

---

## `[Q3]` — bookmark antigo de `/painel`: **redirect 308 permanente**

**Decisão:** `{ source: "/painel", destination: "/console", permanent: true }`, acrescentado ao
array já existente em `frontend/next.config.ts`'s `redirects()` (mesmo mecanismo que já resolve
`/` → `/painel` hoje) — **não** middleware novo. Isto corrige a estimativa de custo do menu `M2`
do PRD (*"exige middleware/`next.config` novo"*): o `next.config.ts` **já tem** `redirects()`;
o custo real é uma linha no array existente, não infraestrutura nova.

**Por que `permanent: true` agora e não antes:** o comentário do próprio `next.config.ts:19-22`
explica que o `/` → `/painel` nasceu `permanent: false` **porque o nome do destino ainda não
estava decidido** (`CLAUDE.md` linha 12, `[Q2]`). Esta decisão fecha `[Q2]` — o motivo que
justificava 307 deixa de existir, e 308 é o CA-F3-4 (`redirect (3xx)`) com o menor custo de
manutenção (zero link quebrando, nenhum clique extra do operador único que é o usuário, `PRD-006`
§16).

**Falsificador nomeado:** `curl -sD - <base>/painel` após F3 → header `Location: /console` e
status `308`; ausência de `Location` ou status `4xx`/`5xx` ⇒ reprova `CA-F3-4`.

---

## Exceção estreita de `ADR-003/D5.12` — forma decidida (não implementada)

**Achado herdado do handoff (`F1-F2-frontend-architect.md` original) e confirmado por medição:**
`frontend/eslint.config.mjs:181-197` bloqueia **toda** importação `web → charts`
(`group: ["**/charts/**"]`, `files: ["src/app/**/*...", "src/features/**/*..."]`); `T-05.2` fechou
sem carvar a exceção que o próprio comentário do arquivo já antecipava (`:94-96`, *"a single
sanctioned `charts/index.ts` surface"*). `CA-F2-1` exige `import` de `charts` na página `symbol` ⇒
reprova hoje sem a exceção.

**A forma decidida — dois elementos, ambos necessários:**

1. **Uma superfície sancionada nova**, `frontend/src/charts/index.ts` — barrel único reexportando
   só o que a montagem de F2 precisa (execução headless S2, composição de painéis, adaptador
   lightweight, tokens de cor, tipos de política de ausência). Não é criado por esta decisão —
   é o artefato que F2 constrói e que a exceção abaixo autoriza.
2. **Um bloco de ESLint NOVO e mais específico**, adicionado DEPOIS do bloco `web` existente no
   array de `frontend/eslint.config.mjs` (em flat config, a config que casa por último para o
   mesmo arquivo+regra vence), com `files: ["src/app/symbol/**/*.{ts,tsx,mts,cts}"]` — **só o
   diretório da rota nova**, não todo `src/app/**`. Dentro dele:
   - `no-restricted-imports.patterns[].group` passa de `["**/charts/**"]` para
     `["**/charts/**", "!**/charts/index", "!**/charts/index.ts", "!**/charts/index.tsx"]` — a
     forma de negação-dentro-de-grupo é a mesma que a documentação oficial do
     `no-restricted-imports` usa para "proibir o diretório, liberar um arquivo dele";
   - os 3 seletores de `no-restricted-syntax` (import dinâmico literal, template literal sem
     interpolação, `require`) trocam `/(^|\/)charts(\/|$)/` por
     `/(^|\/)charts\/(?!index(\.tsx?)?$)/` — mesma exceção, forma dinâmica.

**O que NÃO muda:** o bloco `web` original (`:181-233`) fica intacto para **todo o resto** de
`src/app/**`/`src/features/**` — inclusive a rota `console` migrada de `/painel`. A exceção vale
só para o diretório `symbol`, e só para o barrel — import profundo (`charts/s2-cvd`, por exemplo)
continua proibido mesmo dentro de `symbol`.

**Falsificador nomeado — par morde/cala, 3 casos, para quem estender
`frontend/src/charts/eslint-boundary.test.ts`:**

| caso | import plantado | onde | esperado |
|---|---|---|---|
| morde-1 (import profundo, dentro da rota liberada) | `from "../../charts/s2-cvd"` | `src/app/symbol/page.tsx` | `eslint` → `rc≠0` (continua proibido) |
| morde-2 (contenção de escopo) | `from "../../charts/index"` | `src/app/console/**` ou `src/features/**` | `eslint` → `rc≠0` (exceção não vaza para fora de `symbol`) |
| cala (o caminho sancionado) | `from "../../charts/index"` | `src/app/symbol/page.tsx` | `eslint` → `rc=0` |

Sem os 3 casos rodando juntos, "a exceção existe" não está provado — só "a exceção não quebrou o
`build`", que é mais fraco.

---

## Resumo para retorno

- `[Q1]` = `symbol` · `[Q2]` = `console` · `[Q3]` = redirect 308 (`next.config.ts`, sem middleware)
- Exceção ESLint: bloco novo escopado a `src/app/symbol/**`, negação de grupo liberando só
  `charts/index.ts`; 3 casos de falsificador nomeados acima
- `/` continua redirecionando para o sucessor de `/painel` (`console`), não para `symbol` — fora
  do gatilho desta rodada (`NG-8`)
