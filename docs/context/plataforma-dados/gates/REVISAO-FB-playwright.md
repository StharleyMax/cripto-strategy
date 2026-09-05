# REVISAO-FB — validação do `/painel` real com Playwright (frontend-qa, 2026-09-04)

Entrada: [`handoff/revisao-comunicacao-front-back-2026-09-04.md`](../handoff/revisao-comunicacao-front-back-2026-09-04.md)
e [`handoff/lacunas-leitura-api-painel.md`](../handoff/lacunas-leitura-api-painel.md).
Não é gate de fase: nenhum `approve`/`advance`, nenhum commit, nenhum arquivo de produção tocado
(`git status --short | grep -E 'frontend/src|backend/src'` → vazio `[MEDIDO 2026-09-04]`).

## Veredito

**NEEDS_FIX — a tela `/painel` é uma fixture renderizada sem CSS, com 0 chamadas a qualquer API e
2 dos 3 controles inertes.** 16 testes e2e rodaram, **12 reprovaram, 4 passaram**; cada reprovação é
uma asserção que codifica o comportamento que ADR-005/D5, `T-06.10-design.md` ou SPEC-001 §3.8
prometem, então cada `✘` abaixo é um furo provado, não um teste frágil.

Achados: **5 BLOCKER · 7 WARNING · 5 INFO** (tabela em §4).

## 1. Ambiente e comandos, literais

```bash
# instalação (só devDependencies; nenhum código de produção)
npm --prefix frontend install -D @playwright/test          # 1.63.0
npm --prefix frontend install -D @axe-core/playwright      # 4.13.0, instalou em <2 min (autorizado no despacho)
npx --prefix frontend playwright install chromium          # cache tinha 1208..1234; a 1.63 exige 1243 → download 114,3 MiB

# servidores
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/painel   # 200 — Next dev do owner, não derrubado
cd backend && INGEST_HEALTH_STORE_PATH=/tmp/ih-e2e.sqlite3 .venv/bin/uvicorn src.main:app --port 8765
curl -s http://localhost:8765/ingest-health   # {"query":"ingest_health_query","n_runs":0,"n_gaps":0,"runs":[],"gaps":[]} HTTP 200
# API morta ao final: curl → 000

# suíte
E2E_FACTS_FILE=<scratch>/facts.jsonl PW_OUTPUT_DIR=<scratch>/pw-results npm --prefix frontend run test:e2e
```

Artefatos criados (todos teste/config): `frontend/playwright.config.ts`, `frontend/e2e/helpers.ts`,
`frontend/e2e/0{1..7}-*.spec.ts` — 488 linhas, 7 specs, 16 testes (15 `test(` + 1 loop de viewport),
11 `expect` duros, 24 `expect.soft` `[MEDIDO: wc -l e2e/*.ts playwright.config.ts; grep -c]`.
`frontend/package.json`: `+ "test:e2e": "playwright test"`, `+ @playwright/test ^1.63.0`,
`+ @axe-core/playwright ^4.13.0` (`git diff -- frontend/package.json`, 5 linhas).
`tsconfig.json` inclui só `src/**` e `eslint src` só `src/` ⇒ `e2e/` **não entra em `make lint-frontend`**.

⚠️ **Deviação declarada:** o handoff dizia *"package.json do front só ganha `@playwright/test`"*; o
prompt de despacho autorizou `@axe-core/playwright` se instalasse em <2 min, e instalou. Se o owner
quiser a regra do handoff, `npm --prefix frontend uninstall @axe-core/playwright` e apagar
`e2e/05-a11y.spec.ts:1` (o resto do spec não depende dele).

⚠️ **Esta suíte não está em portão nenhum.** `make verify` roda 6 portões e nenhum executa nem
`node --test` nem `playwright test` (`grep -n 'portao ' scripts/verify.sh` → 6, 0 de front
`[MEDIDO 2026-09-03 no agente]`). Ela protege contra quem lembrar de rodá-la, e só.

## 2. Saída literal — `npm --prefix frontend run test:e2e 2>&1 | tail -20`

```
      42 | });
      43 |
        at /home/stharley/Documentos/projects/cripto-strategy/frontend/e2e/07-locale.spec.ts:41:100

    Error Context: ../../../../../../tmp/claude-1002/.../scratchpad/pw-results/07-locale-numerais-visívei-51e7c--de-milhar-cada-célula-usa--chromium/error-context.md

  12 failed
    [chromium] › e2e/01-painel-carrega.spec.ts:9:1 › /painel responde 200, hidrata sem erro, e tem título/estilo/ícones reais 
    [chromium] › e2e/02-rede-e-estados.spec.ts:9:1 › /painel faz alguma requisição a uma API? (esperado pelo ADR-005: sim) 
    [chromium] › e2e/02-rede-e-estados.spec.ts:42:1 › /painel com API no ar vs API inalcançável — a tela muda? (esperado: sim, com estado de erro) 
    [chromium] › e2e/03-rotas.spec.ts:9:1 › / (raiz) leva o operador ao painel? (esperado: redirect ou página inicial) 
    [chromium] › e2e/03-rotas.spec.ts:23:1 › rota inexistente (/nao-existe) — o que o operador vê ──
    [chromium] › e2e/04-interacoes.spec.ts:31:1 › filtro do catálogo (S3) — digitar reduz as linhas? 
    [chromium] › e2e/04-interacoes.spec.ts:51:1 › botão 'abrir' (S3) — abre a CAMADA 2 'Linhas Cruas'? 
    [chromium] › e2e/04-interacoes.spec.ts:69:1 › gaveta de quarentena — colapsa/expande? ──────────
    [chromium] › e2e/05-a11y.spec.ts:10:1 › axe-core: violações A/AA no /painel ────────────────────
    [chromium] › e2e/05-a11y.spec.ts:29:1 › landmarks e cabeçalhos ─────────────────────────────────
    [chromium] › e2e/06-viewport.spec.ts:13:3 › viewport 390 — overflow horizontal e altura total ──
    [chromium] › e2e/07-locale.spec.ts:11:1 › numerais visíveis — que marca decimal e de milhar cada célula usa? 
  4 passed (30.9s)
```

Os 4 que passaram: `/painel/` com barra final → 200 e normaliza para `/painel`; inventário de controles;
Tab alcança `input` → `button` com `outline: auto`; viewport 1280 sem overflow.

## 3. Screenshots — `REVISAO-FB-shots/` (7 arquivos, full-page, chromium headless)

| arquivo | estado | sha256 (16) |
|---|---|---|
| `01-painel-1280-padrao.png` | `/painel`, 1280×800, API no ar | `dc30fd31346378eb` |
| `02-painel-1280-api-inalcancavel.png` | idem, toda requisição a host ≠ `:3000` abortada; regravado com a API **morta** | `dc30fd31346378eb` — **byte-idêntico ao 01** |
| `03-raiz.png` | `/` | `629102d267a1392e` |
| `04-rota-inexistente.png` | `/nao-existe` | `629102d267a1392e` — **byte-idêntico ao 03** |
| `05-filtro-digitado-sem-efeito.png` | filtro do catálogo com `open_interest` digitado | `03a2db72a6b90874` |
| `06-abrir-clicado-sem-efeito.png` | após clicar no 1º `abrir` | `4b7b9a7d79915381` |
| `07-painel-390-mobile.png` | `/painel`, 390×844 | `17ced9c4fc7d938e` |

`[MEDIDO: sha256sum *.png]`. O que o 01 mostra, em uma frase: página em Times New Roman preto sobre
branco, primeira linha *"Filtro: any resultado serve"*, células com *"PARADOstop_circle"*,
*"Coinalyze OI1.2"*, *"TOTAL PREVISTO1.6 GB"*, *"diamondQUARENTENA"*, *"8 diasjanela válida no regime
atual, não garantida em cascata"* — rótulo, valor e nome de glifo colados porque nenhuma classe CSS existe.

## 4. Achados — evidência → severidade

Todo número é `[MEDIDO 2026-09-04]` pelo spec citado (fatos em `facts.jsonl`, linha `E2E-FACT <spec> <nome>=<valor>` no stdout).

| # | achado | evidência (spec · fato · shot) | sev |
|---|---|---|---|
| 1 | **`/painel` não fala com nenhuma API.** 16 requisições, todas ao Next dev (`document`: 1, `script`: 15), 0 a host/caminho de API; 1 websocket e é o HMR do Next. Log da API: 2 `GET /ingest-health` antes e 2 depois da suíte inteira (os dois são `curl` meus; `n=7` linhas). Causa: `page.tsx:8-16` importa `fixtures.ts` de S1 e S3; `ingest-health-query.ts` não é importado por `page.tsx` (handoff: 10 importadores, nenhum é a página). Viola ADR-005/D5 ("a porta de leitura é o backend"). | `02` · `requests_total=16`, `requests_to_api_like_hosts=[]`, `websockets=[ws://…/_next/hmr…]` · shot 01 | BLOCKER |
| 2 | **Nenhum estado de carregamento/erro/vazio existe.** `<main>.innerText` = 1318 bytes com API no ar, com toda rede externa abortada, e com o processo `uvicorn` morto (re-rodada do spec 02 após `curl → 000`). Screenshot 01 ≡ 02 por sha256. O falsificador do plano 05 (`05_fatia_visivel.md:225`, *"fechar com o servidor ausente repete o defeito"*) está disparado. | `02` · `main_text_bytes_api_up=1318`, `main_text_bytes_api_down=1318`, `main_text_identical=true`, `requests_blocked_as_api_down=0` · shots 01/02 | BLOCKER |
| 3 | **Filtro do catálogo é inerte.** 2 linhas antes; 2 com `zzz-nenhuma-serie-casa`; 2 com `open_interest`. O `input` é controlado e ecoa o texto (setter ligado), mas `page.tsx:38` constrói o view-model com `EMPTY_CATALOG_FILTER` e nunca lê `filterText`. O operador digita e nada acontece. | `04` · `catalog_rows_before_filter=2`, `…after_nonmatching_filter=2` · shot 05 | BLOCKER |
| 4 | **`abrir` é inerte — CAMADA 2 nunca monta.** 2 botões; após clique, 0 cabeçalho `Linhas Cruas`, URL inalterada. `page.tsx:29`: `const [, setOpenedSeriesId] = useState(...)` — o valor é descartado por decisão registrada no comentário (design gate da gaveta PENDING). `S3Inspector.tsx:130` renderiza a camada só se `selectedSeriesLabel !== null`, e `page.tsx:38` passa `null` fixo. | `04` · `abrir_buttons=2`, `linhas_cruas_heading_after_click=0` · shot 06 | BLOCKER |
| 5 | **Zero CSS chega ao browser.** `link[rel=stylesheet]`: 0; `document.styleSheets`: 1, e é um `<style>` de 4 regras `@font-face __nextjs-Geist` (overlay de dev do Next, não da app); `td` em `"Times New Roman"`; `body` sem background. As classes Tailwind de `S1Console.tsx`/`S3Inspector.tsx` são strings inertes — `frontend/README.md:1698` já declara. Efeito visível: 3 spans `.material-symbols-outlined` (`stop_circle`, `diamond`, `diamond`) renderizam o **nome** do glifo como texto; rótulo+valor colados (§3). O design aprovado pelo gate (`T-07.12-ux-critique.md`) não se parece com o que renderiza. | `01` · `stylesheets_applied=1`, `glyph_font_families=["Times New Roman"]`, `glyph_spans=[…]`; sonda: `link[rel=stylesheet]: 0` · shots 01/07 | BLOCKER |
| 6 | `document.title` vazio — a aba mostra a URL. axe: 1 violação, `document-title`, impacto **serious** (23 regras passam, 0 incompletas, tags wcag2a/2aa/21a/21aa). Nenhum `metadata` em `layout.tsx`/`page.tsx` (`grep -rn metadata frontend/src/app` → 0). | `01` `document_title=""` · `05` `axe_violations=[{document-title, serious, 1 nó}]` | WARNING |
| 7 | `/` e `/nao-existe` devolvem o 404 padrão do Next, **em inglês** (*"This page could not be found."*) sob `<html lang="pt-BR">`, sem link para `/painel`; `/Painel` também 404. Só existe `app/painel/page.tsx` e `ROUTES.panel`. Operador que abre `localhost:3000` não descobre a tela. | `03` · `root_status=404`, `unknown_has_link_to_panel=0`, `uppercase_status=404` · shots 03/04 | WARNING |
| 8 | Texto de bancada de lint visível como primeira linha da tela: *"Filtro: any resultado serve"* — `features/panel/Filter.tsx:1-8` se descreve como *"Bench file 3 of 3 for D1.3b … must stay silent"*; é corpus de teste do detector de `any`, não microcopy, e `page.tsx:43` o monta. | `01` · `bench_filter_text_visible=1` · shot 01 | WARNING |
| 9 | Overflow horizontal em 390 px: `scrollWidth=558 > clientWidth=390`; 2/2 tabelas mais largas que o viewport. Em 1280: `1280/1280`, 0 tabelas. Sem CSS não há `md:w-80` nem `overflow-auto` em vigor. | `06` · `metrics_390`, `metrics_1280` · shot 07 | WARNING |
| 10 | Duas marcas decimais e duas convenções de milhar **na mesma tela**: `1,5 dia`/`7,0 dias` (vírgula) vs `99.8%`/`1.2`/`~4.7x`/`1.6 GB` (ponto); `2.206 pts`/`14.204` (ponto de milhar) vs `1440/1440` (sem separador). `view-model.ts:57-64` registra a divisão como *"registered, not fixed … design-system decision"*. SPEC-001 §3.8 permite pt-BR em microcopy, mas não diz que o operador tem de adivinhar célula a célula qual é a decimal. Sem `toLocaleString`/`Intl` no código (`grep` → 0 em produção): determinístico, só inconsistente. | `07` · `comma_decimal_hits` (2), `dot_decimal_hits` (13), `dot_thousands_hits` (4), `bare_thousands_hits` (2) | WARNING |
| 11 | Gaveta de quarentena chamada de *"painel colapsável"* (`S3Inspector.tsx:24`, `T-06.10-design.md`) sem nenhum controle: 0 `button`/`summary`/`[aria-expanded]` no `aside`. | `04` · `quarantine_drawer_toggle_controls=0` | WARNING |
| 12 | Estrutura a11y: 0 `<h1>` (cabeçalhos começam em `h2`); 1/1 `input` só com `placeholder` (axe aceita placeholder como nome, por isso não acusa); 2/2 tabelas sem `caption`/`aria-label`; 0 `nav`. `main`: 1 ✔, `lang=pt-BR` ✔. | `05` · `h1_count=0`, `inputs_total_vs_labelled=[1,0]`, `tables_total_vs_named=[2,0]` | WARNING |
| 13 | API sem CORS: `OPTIONS /ingest-health` → 405; `GET` com `Origin: http://localhost:3000` não devolve `Access-Control-Allow-Origin` (`grep -rn CORSMiddleware backend/src` → 0). Hoje irrelevante (0 chamadas); **só** vira bloqueio se algum dia o browser chamar `:8765` direto — o desenho atual (`ingest-health-query.ts:463-484`, `INGEST_HEALTH_API_BASE_URL` server-side, nunca `NEXT_PUBLIC_*`) faria a chamada do lado do servidor Next e não precisaria de CORS. | `curl -X OPTIONS …` → 405; `curl -D - -H Origin …` sem header | INFO |
| 14 | Hidratação limpa: 0 `console.error`, 0 `console.warning`, 0 `pageerror` no carregamento de `/painel`; HTTP 200; os 5 `h2` esperados presentes. | `01` · `console_errors=[]`, `page_errors=[]`, `h2_headings` (5) | INFO |
| 15 | Inventário: 4 controles interativos, 1 é *"Open Next.js Dev Tools"* (overlay de dev, não é da app) ⇒ **a app tem 3**: 1 `input`, 2 `button abrir`. S1 tem 0 controles — coerente com *"S1 NÃO é o canal de alarme"* (`S1Console.tsx:15`). Teclado: Tab → `input` → `button`, `outline: auto`. | `04` · `interactive_controls_count=4`, `s1_controls_count=0`, `tab_order_first_two=[input,button]` | INFO |
| 16 | A API sobre store vazio responde `200 {"n_runs":0,"n_gaps":0}`. Mesmo que `/painel` fosse ligado hoje ao único endpoint, ele receberia zero runs e zero gaps — não há store SQLite local (`find . -name '*.sqlite*'` → nenhum, handoff). | `curl :8765/ingest-health` | INFO |
| 17 | A suíte e2e não está em `make verify` nem em hook (§1). Rodar é ato manual. | `grep -n 'portao ' scripts/verify.sh` → 6, nenhum de front | INFO |

## 5. `[NÃO SEI]` — o que este relatório não mede

- **O que a tela mostraria com dados reais.** Não há caminho de dado até ela (achado 1), e o único endpoint devolve vazio (achado 16). Qualquer afirmação sobre "como ficaria ligada" é projeção, não medição.
- **Env do processo Next do owner** (`INGEST_HEALTH_API_BASE_URL` definido ou não). Não inspecionei um processo que não é meu; e é irrelevante para o achado 1, porque `page.tsx` não importa o cliente que leria a variável.
- **Firefox/WebKit.** Só chromium headless 1243 (Chrome Headless Shell 153.0.8010.12). Layout/overflow em outros motores não medido.
- **Contraste real do design.** axe `color-contrast` passou (está nas 23 regras que passam), mas sobre preto-em-branco default do browser, não sobre as cores do `DESIGN_SYSTEM.md` — que não chegam ao browser (achado 5). Contraste do design aprovado permanece **não medido em runtime**.
- **Persistência do `/tmp/ih-e2e.sqlite3`**: não verifiquei se o `uvicorn` criou o arquivo; o processo foi morto ao final.

## 6. Como reproduzir

```bash
# 1. Next dev no :3000 (owner) e API:
cd backend && INGEST_HEALTH_STORE_PATH=/tmp/ih-e2e.sqlite3 .venv/bin/uvicorn src.main:app --port 8765 &
# 2. suíte (facts em $TMPDIR/cripto-strategy-e2e/facts.jsonl por padrão):
npm --prefix frontend run test:e2e 2>&1 | tail -20
# 3. só o contraste API no ar vs morta: matar o uvicorn e re-rodar
npx --prefix frontend playwright test e2e/02-rede-e-estados.spec.ts
```

Esperado hoje: `12 failed / 4 passed`. Quando um achado for corrigido, o `✘` correspondente vira `✓`
sem mexer no spec — as asserções já codificam o comportamento desejado.
