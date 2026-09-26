# ADR-043 — Navegação fluida (troca de símbolo/TF sem round-trip RSC): client-driven é o caminho certo, mas EM DUAS PERNAS, não tudo-ou-nada

**Data:** 2026-09-23 · **Status:** proposta · **SPEC:** efeito em [`SPEC-008`](../specs/SPEC-008-candle-real-e-eixo-unico.md); amenda a postura de [`ADR-005`](ADR-005-transporte-de-leitura.md)/D5 e a regra de [`ADR-019`](ADR-019-cliente-http-de-ingest-health-e-paridade-de-fingerprint.md)/D4
**Componente alvo:** `web` · **Fases:** não é DoD de `candle-real-e-eixo-unico/fase 04` — ver veredito de processo no final
**Origem:** pesquisa do owner (troca de moeda/TF sem "hard refresh", estado global do cliente + fetch/WS + shallow URL sync via History API) comparada ao estado medido de `/symbol/[symbol]`

---

## Contexto — o que existe hoje, medido, não adivinhado

`frontend/src/app/symbol/[symbol]/page.tsx` é um Server Component `async` com
`export const dynamic = "force-dynamic"` (linha 198). A cada `router.push` de `TimeframeBar`
(`SymbolClient.tsx:2662-2672`, `next/navigation`), Next reexecuta o componente inteiro no
servidor: `Promise.all` de **10** `fetchPanelRows` (linhas 524-546), mais `GET /series-catalog`,
mais toda a montagem de view-model (`view-model.ts`, **1.165** linhas — `assembleOhlcCandles`,
`resolveFreshnessVerdict`, `countNativeBarsByPublication`, `scaledCvdDeltasFromHistoryRows`
etc., todas rodando **server-side** dentro de `SymbolPage`). Confirmado pelo e2e
`frontend/e2e/18-tf-refetch-e-ablacao.spec.ts:141`, que lê o **access log da API real** e exige
`hitsAfter - hitsBefore ≥ 10` — a prova de que o clique realmente cruza a rede até o backend, não
só troca destaque de botão.

**Não existe seletor de símbolo hoje** `[MEDIDO: grep -rn 'symbol.*select\|SymbolSwitcher' frontend/src → 0]` —
`/symbol/[symbol]` só é alcançável por URL direta/bookmark.

### A barreira que a proposta do owner esbarra, e ela não é estética — é `import "server-only"`

```bash
grep -rln '^import "server-only"' frontend/src/app frontend/src/features
```
`[MEDIDO]` → 5 módulos, e os dois que importam nesta rota:
`frontend/src/app/symbol/series-history-client.ts:1` e
`frontend/src/features/s3-inspector/series-catalog-query.ts:1`. `server-only` (pacote do Next)
**lança em runtime** se um desses módulos for alcançado por um bundle de browser — não é
convenção, é o mesmo mecanismo que `T-05.16` vai formalizar como portão (`ADR-019/D4`: *"a
restrição que vincula é: jamais `"use client"`, preservando o '0 importador de valor' que
`ADR-005/D6.4` mede hoje"*). **Hoje isso é `0` importador de valor de fora do servidor —
`[MEDIDO 2026-09-03 em 8c002e4]`. Fazer o que o owner pediu literalmente — client faz seu próprio
fetch — sobe esse número de `0` para `≥ 1`, e o portão que está para nascer reprovaria.**

**O que NÃO é barreira, ao contrário do que pareceria à primeira leitura:**
- `ADR-005/D5` ("Next não é segunda verdade… zero SQL, zero regra de domínio, zero subprocess")
  **não proíbe o browser falar direto com o FastAPI** — proíbe o *Next Route Handler* reimplementar
  lógica (a alternativa recusada era "BFF em Route Handler", não "fetch do browser"). E há
  **precedente vivo no mesmo arquivo**: `SymbolClient.tsx:2442` já abre `new EventSource(url)`
  **direto do browser contra o FastAPI**, com a URL resolvida uma vez no servidor
  (`process.env.INGEST_HEALTH_API_BASE_URL`, linha 852) e passada como prop — o mesmo padrão que
  `ADR-019/D4` já descreve como aceitável ("ler variável sem `NEXT_PUBLIC_` é a segunda rede de
  proteção", não uma proibição de o valor chegar ao cliente via prop).
- `view-model.ts` (1.165 linhas) e `request-window.ts` (164 linhas) **não têm `server-only`** —
  são funções puras, já portáveis para o cliente sem reescrita.
- O e2e de `T-03.11` mede pelo **access log da API**, não pelo mecanismo de transporte — sobrevive
  a uma migração de transporte quase inalterado (ver abaixo).

## Decisão

**Client-driven é o caminho certo para este app — mas em DUAS PERNAS, cada uma com seu próprio
falsificador, e a segunda NÃO é DoD de `fase 04`.**

### Perna 1 — o seletor de símbolo nasce client-driven, porque não existe passivo a preservar

Não há switcher hoje: **zero custo de migração, é escrever direto no padrão certo.** Ele:
1. abre um par de módulos-irmãos NÃO `server-only` de `series-history-client.ts`/
   `series-catalog-query.ts` — mesma validação (`history-transport.ts`, já puro, reusado sem
   cópia), env var resolvida **uma vez no servidor** e passada por prop (mesmo mecanismo de
   `liveUrls` hoje), nunca `NEXT_PUBLIC_*` (preserva `ADR-019/D4` ao pé da letra: o valor nunca
   é assado no bundle em build-time, só entregue por prop por requisição);
2. mantém `page.tsx` como o **primeiro paint** (SSR) — bookmark/deep-link continuam funcionando
   sem JS, e o `force-dynamic` de hoje segue sendo quem responde a isso;
3. depois do primeiro paint, a troca de símbolo é: estado do cliente muda → o painel refaz os
   **mesmos 10 fetches**, agora do browser contra o FastAPI direto → `pushState` shallow
   (`history.pushState` ou `router.push` com uma flag que NÃO dispara Server Component — Next 16
   ainda não tem "shallow routing" nativo para App Router fora de `router.push`/`replace`
   disparando sempre RSC; a forma correta aqui é **não usar `next/navigation` para isto** e
   escrever a URL com a History API bruta, como a pesquisa do owner descreve).

### Perna 2 — o TF bar migra DEPOIS, em task própria, e não descarta `T-03.9`/`T-03.10`/`T-03.11`

`T-03.9`+`T-03.10`+`T-03.11` somam **1.665** linhas (`git show --stat` de `e174194`+`57e6693`+
`61566b0`, `[MEDIDO]`). Do que sobrevive intacto à migração:
- `supported-timeframes.ts`/`.test.ts` (o conjunto servido, lido do backend) — **inalterado**,
  não fala de transporte;
- `interval-reduction-shape.test.ts` (176), `volume-subaxis-tf-invariance.test.ts` (210),
  `timeframe-bar-dom-contract.test.ts` (98+66) — testam **funções puras de `view-model.ts`** e o
  DOM do botão, nenhuma delas amarrada a "quem fez o fetch";
- `18-tf-refetch-e-ablacao.spec.ts` (211) — lê o **access log da API**, não o mecanismo Next; a
  asserção `hitsAfter ≥ 10` continua válida com 10 fetches do browser, só a espera
  (`waitForLoadState("networkidle")`, que depende de navegação Next) precisa trocar para esperar
  o DOM do painel atualizar.

O que **precisa reescrever**: o branch de `?interval=` em `page.tsx` (**81** linhas do diff de
`T-03.11`) e `handleTimeframeSelect`/`TimeframeBar` wiring em `SymbolClient.tsx` (**53+12+70=135**
linhas somadas dos três commits) — ou seja, **~216 de 1.665 linhas (13%)** é o que morre; o resto
é view-model/testes de contrato que não sabem, nem deveriam saber, de onde o dado veio.

**Por que a Perna 2 espera:** o comportamento de `T-03.11` está em produção, testado e correto —
"clicar 4h e ler a contagem de barras dos 6 painéis" (`DoD 6/7/8`) já prova que o dado está certo
sob RSC round-trip. Trocar o transporte da Perna 1 primeiro valida o padrão (URL do FastAPI por
prop, módulo cliente-safe, `pushState` bruto) sobre uma superfície **nova**, sem arriscar
regressão sobre uma superfície **já aprovada**. Migrar os dois ao mesmo tempo é reescrever duas
vezes se o padrão da Perna 1 precisar de ajuste depois de tocar produção.

> ⚠️ **CORREÇÃO, 2026-09-24 (`frontend-architect`).** A premissa da linha 95 (*"o comportamento de
> `T-03.11` está em produção, testado e correto"*) é **falsa desde `718cb1a`** (`T-05.2`). A partir desse
> commit, clicar em `4h` muda a URL e a tela continua com as velas de `1m`: 4583 velas em vez de 24. O bisect deu
> `0c9cb43` verde 2/2 e `718cb1a` vermelho 2/2 `[MEDIDO: docs/context/paineis-de-fluxo/gates/DIAG-e2e-master.md
> §2]`. A **ordem** das pernas não muda (`[DECISÃO-OWNER: 2026-09-23, escolha entre alternativas apresentadas]`:
> depois de `DONE` de `paineis-de-fluxo`), e a correção entra antes disso, na `T-01.F1`
> (`docs/context/paineis-de-fluxo/handoff/FIX-regressoes-fase05.md` §2, §5). O texto original fica, porque o valor
> do registro está em ele mostrar o erro.

## O que esta ADR NÃO decide — e por quê

- **CORS do FastAPI para `GET /series-history`/`GET /series-catalog` a partir do browser.** SSE já
  exige CORS para `EventSource`; um `fetch` GET simples tem a mesma exigência, mas confirmar a
  configuração hoje é `infra`/backend, fora deste componente. **Dependência declarada, não
  resolvida aqui.**
- **O nome/forma exata do "estado global do cliente"** (Context, Zustand, URL como única fonte de
  verdade) — é implementação, não arquitetura de transporte; fica para quem construir a Perna 1,
  dentro da fronteira que esta ADR fixa (URL bruta via History API, nunca `router.push` para o
  caso client-driven).
- **Se isto é task de `fase 04` ou feature própria — ver veredito de processo abaixo, que é
  meu limite: julgamento técnico, não escopo de processo** (o despacho que originou esta ADR
  marcou isso explicitamente fora do meu mandato).

## Falsificador

| # | afirma | comando | MORDE |
|---|---|---|---|
| **F1** | `server-only` ainda guarda os dois módulos originais | `grep -c '^import "server-only"' frontend/src/app/symbol/series-history-client.ts frontend/src/features/s3-inspector/series-catalog-query.ts` | qualquer um voltar a `0` — a primeira barreira de segurança de `ADR-019/D4` (fallback para `undefined` em vez de vazar URL) desapareceu |
| **F2** | os módulos-irmãos client-safe não vazam a base URL em build-time | `grep -rn 'NEXT_PUBLIC_INGEST_HEALTH' frontend/src` | qualquer ocorrência — viola `ADR-019/D4` ao pé da letra |
| **F3** | a troca de símbolo/TF NÃO dispara round-trip RSC | Playwright: interceptar requests de documento Next (`page.on('request')`, filtrar `Next-Router-State-Tree`/RSC payload) durante o clique — zero após a Perna 1/2 completas | uma requisição RSC aparecer no clique |
| **F4** | os **10** fetches ainda chegam ao FastAPI | reusar `countSeriesHistoryAccessLogHits` de `18-tf-refetch-e-ablacao.spec.ts` | `hitsAfter - hitsBefore < 10` |
| **F5** | a URL continua a fonte de verdade (bookmark funciona) | `curl` direto em `/symbol/BTCUSDT?interval=4h` sem JS (`curl -s | grep 4h`) | o primeiro paint não refletir o `interval` da URL |

## Veredito de processo (dentro do meu mandato: julgamento técnico sobre tamanho/risco, não decisão de backlog)

**Não é task solta de `fase 04`.** Três motivos medidos, não preferência: (1) amenda postura de
`ADR-005/D5` e a regra viva de `ADR-019/D4` — decisão de arquitetura, não bugfix de wiring; (2)
tem dependência declarada em `infra`/backend (CORS) fora de `web`; (3) o seletor de símbolo é
**UI nova** — precisa do `design_gate` (`ux-ui-mastery`) que nenhuma task hoje cobre, e o
`ui-designer` decide isso, não eu. `fase 04` desta feature já tem escopo fechado (wiring+
`price_use`, achado em uso ao vivo) — recomendo feature própria (ou fase nova dedicada), com PRD/
SPEC próprios para a Perna 1, e a Perna 2 como task subsequente na mesma feature, não em paralelo.

**Pendente de decisão do owner:** se a Perna 1 (symbol switcher) entra como feature nova agora, ou
fica atrás de outra prioridade — isto é backlog, e não é meu.
