# W-P2-REVIEW — revisão arquitetural da wave 2 da fase `10` (`estrutura-do-front`)

**Veredito: COMPLIANT.** Nenhuma regra bloqueante violada. 0 BLOCKER · 0 WARNING · 4 INFO.

- **Wave:** `T-10.3`, `T-10.10`, `T-10.11`, `T-10.17`, `T-10.20`. Branch `wave/piramide-w2` em `18494508`.
- **Diff:** `git diff origin/master...HEAD`: 40 caminhos, sendo 38 A/M e 2 D (`e2e/17`, `e2e/22`).
- **Contrato lido:** `TECH-LEAD-narrativa.md` §10.2–10.5 (REGRA-X), `tasks.toml` (refs/DoD das 5 tasks + a decisão P1 de `a9275129`),
  `gates/T-10.11-padrao.md` §3.1/§5/§7, `CLAUDE.md` § idioma.
- **Escrita:** só este arquivo. Ledger e commit não foram tocados, como o despacho pediu.

## 1. Camada mecânica: o runner

| | |
|---|---|
| regras bloqueantes em vigor | **8** (`harness rules list --severity block`) |
| avaliadas | **8**. Pelo `paths` do pack, só `web-fullstack.browser-imports-server` (`frontend/src/**`) alcança arquivo deste diff. As `core.*` são `**/*.py`, `tenant-from-request` é `backend/**/*.py` e `own.compose-hardcoded-secret` é `*.yml`/`*.yaml` |
| comando | `harness rules --mode file --surface ci --path <f>`, um por arquivo, sobre os 38 A/M |
| resultado | **38/38 rc=0, saída vazia** `[MEDIDO]` |
| controle positivo | um repositório falso no scratchpad (cópia de `harness.toml` + `.harness`) e `frontend/src/app/probe.ts` com `import … from "../../backend/api"` + URL fixa. Resultado: **rc=1**, `[BLOQUEIO] web-fullstack.browser-imports-server :1` + `[AVISO] hardcoded-url :2` `[MEDIDO]`. O instrumento morde. Um probe em scratchpad **fora** de `include_prefixes` devolve rc=0, o que confirma que o recorte é por caminho |
| ⚠️ o que o runner NÃO cobre | os 9 de `frontend/e2e/`, os 9 de `docs/` e `frontend/eslint.config.mjs` (19 de 38) ficam fora de `code_paths.include_prefixes`, e o rc=0 deles não mede nada. Para esses 19, a única cobertura é a leitura das §2–§4 |
| ESLint | `npx eslint src/app/symbol src/app/component-render.ts` → **rc=0, 0 linhas** `[MEDIDO]` |

## 2. Produção: só `export`

- `SymbolClient.tsx`: **8 `-` / 8 `+`**. Tirar o prefixo `export ` de cada `+` deixa a linha **idêntica** ao `-` correspondente: `diff` rc=0 `[MEDIDO: git diff -U0 | sed 's/^export //' | diff]`.
  As linhas são `PricePane` (P1, `T-10.11`) e 7 constantes (`VOLUME_SCALE_MARGINS`, `PRICE_CANDLE_SCALE_MARGINS`, `VOLUME_BAR_BASE`,
  `VOLUME_MARKS_SCALE_MARGINS`, `VOLUME_MARKS_BAND_PX`, `ABSENCE_MARK_PX`, `ZERO_MARK_PX`). Nenhuma linha lógica.
- As 7 constantes estão no ESCOPO da **`T-10.10`** (*"Produção: SÓ acrescentar `export` às constantes raspadas (… SymbolClient.tsx)"*) e entraram no commit da `T-10.11` (`64e85a53`).
  `T-10.11-build.md` §5 declara isso, e a P1 só soma `PricePane`. Fica em INFO-1.
- `frontend/src/` fora de teste: além do `SymbolClient.tsx`, só `component-render.ts` (o escopo que a P1 somou) e `symbol-client-moved-out-files.ts` (o "módulo de apoio de teste novo" da `T-10.10`).
  `component-render.ts` × `T-10.11-padrao.md` §3.1: **só o docstring difere**, e o código é idêntico `[MEDIDO: diff contra o bloco ts extraído]`.
  Nenhum arquivo de produção importa o harness (`grep -rln component-render src`: 8 arquivos, todos `.test.ts` + o próprio arquivo).
- `frontend/eslint.config.mjs`: todas as linhas alteradas são comentário (`grep -vE '^[-+]\s*(//|\*|/\*)'` → rc=1). É o follow-up W-P1-QA da `T-10.10`, "só comentário".
- `frontend/package.json` / lockfile: **0 caminhos no diff** `[MEDIDO]`.

## 3. Escopo por task (REGRA-X, narrativa §10.2: exceção ao `DoD-2` só nos specs que a task nomeia)

| task | commit(s) | caminhos tocados | ESCOPO declarado | ok |
|---|---|---|---|---|
| T-10.3 | `4582f1d8` | `e2e/38` + relatório | `e2e/38` (helper opcional não usado) | sim |
| T-10.10 | `13d83d6a` | 12 `.test.ts` + `symbol-client-moved-out-files.ts` + comentários do `eslint.config.mjs` + relatório | os testes de raspagem, ABSENCE_TOKEN, MOVED_OUT_FILES, o módulo de apoio e o follow-up eslint | sim |
| T-10.11 | `60e6f332`, `a9275129`, `64e85a53`, `ff94cbb7` | 3 contratos-piloto + `component-render.ts` + `PricePane` export; mais 4 testes e 7 exports da pendência da T-10.10 | piloto + P1. Os extras estão no escopo da T-10.10 e foram declarados (INFO-1) | sim |
| T-10.17 | `37a24836`, `a10b49bf` | `e2e/01,02,04,05,06,07` | 01, 02, 04–07 (+ `scope-map` "se alguma linha os cita", e nenhuma linha precisou mudar, §4) | sim |
| T-10.20 | `4d1d0bdc` | `e2e/17` (D), `e2e/20`, `e2e/22` (D), `scope-map.tsv` | idem | sim |

Além dos caminhos de escopo, cada commit só tocou gates e `docs/INDEX.md`. `INDEX.md`: 0 linhas removidas (append-only respeitado).
`T-10.8-build.md` entra no diff pelo merge de `task/T-10.8` em `T-10.10`, e é um relatório.
`harness pipeline require-code` responde "código permitido — estrutura-do-front (scope)" para os 2 arquivos novos de `src/`, para `e2e/20` e para `eslint.config.mjs`.
Tetos da `T-10.20`, DoD (2), inalterados: `LATENCY_CEILING_MS = 400`, cadência `160` (`AXIS_CADENCE_CEILING_MS`, do qual `PAN_FRAME_CEILING_MS` é alias), `MIN_FRAMES 60` → `CADENCE_MIN_FRAMES 60` `[MEDIDO: grep de const numérica, origin/master vs HEAD]`.

## 4. `scope-map.tsv`

- Specs existentes: 40, sem 17 e sem 22 (`ls e2e/*.spec.ts`).
- Cada token de cada linha não-comentário do mapa foi expandido (NN, NN-MM, NN+) e checado contra o `ls`: **0 token aponta spec ausente**.
  Nenhuma faixa cobre 17 ou 22 `[MEDIDO]`. As 7 linhas de eixo/paginação passaram de `16-27` para `16 18-21 23-27`. `@rota:symbol` passou de `08+` para `08-16 18-21 23+`.
- `scope-resolve.sh` (`VERIFY_BASE=origin/master`): rc=0, `e2e=COMPLETO` por "mapa mudou no diff", que é o fail-closed esperado.
- Fusões da `T-10.17` (04-t2, 05-t2, 06-1280, 07-D3.5, 07-ambiente → 01-t1; 02-B2 → 01-B1): o único mapeamento para o bloco /console é `@rota:console 01-07`.
  Os 7 specs continuam existindo, então nenhuma linha precisava mudar. Nenhuma linha do mapa cita 02–07 sem 01 `[MEDIDO: awk]`.

## 5. Idioma (CLAUDE.md, tabela de 12 linhas: **convenção, não portão**)

- Identificadores novos no diff de `frontend/`: **253**, e **0** casa com uma lista de raízes PT (vela, balde, linha, página, eixo, preço, janela, passo, arrasto, teto, sonda…).
  Heurística, não detector: `[NÃO MEDIDO exaustivamente]`, por `ADR-013/D2`.
- Nomes de arquivo novos em inglês (`component-render.ts`, `symbol-client-moved-out-files.ts`).
- Strings PT novas em `price-pane-dom-contract.test.ts` (`"Preço"`, `/nunca uma vela de altura zero/`) são microcopy de UI asserida (linha 8, PT legítimo).
- Os títulos PT de `test.step` no `01` são títulos movidos de 02/04–07 pelas fusões, não novos.

## 6. INFO (fora do veredito; nenhum tem regra nem trecho normativo que o torne violação)

- **INFO-1 (atribuição):** as 7 constantes exportadas e a edição de `absence-readout-microcopy`, `price-volume-band-separation`, `volume-subaxis-geometry` e `volume-subaxis-tf-invariance` são escopo da `T-10.10` e entraram no commit da `T-10.11` (`64e85a53`).
  Estão declaradas em `T-10.11-build.md` §0/§5. O `/qa` deve fechar o DoD 1 da `T-10.10` lendo as duas evidências juntas.
- **INFO-2 (DoD 1 da T-10.11, residual declarado):** `price-pane-dom-contract.test.ts:34,52` ainda faz `readFileSync` de `[symbol]/page.tsx` (Server Component).
  O DoD 1 diz "sem readFileSync de .ts/.tsx". O desvio é declarado em `T-10.11-build.md` §0 e em `T-10.11-padrao.md` §0/§5, que o empurra para F3 item 3.4. A decisão de aceitá-lo é do `/qa`.
- **INFO-3 (ponteiro velho para spec apagado):** `frontend/src/app/symbol/chart/host/ChartHost.tsx:49,177` e `frontend/e2e/16-eixo-unico-pan-e-ablacao.spec.ts:43` ainda citam `e2e/22`, e a ablação de mount-count agora mora no `e2e/20`.
  Os dois arquivos estão fora do escopo da T-10.20. A narrativa §10.4 dá ao `/tech-lead` o re-apontamento pós-merge.
- **INFO-4 (idioma no e2e, superfície não enumerada):** `e2e/20:1649,1655,1662` traz mensagens de `expect` **novas** em PT ("HOST REMONTADO…", "o veredito do host precisa…", "o passo de paginação também reprovou…": 0 ocorrências em `origin/master` de 17/20/22).
  Comentários PT pré-existentes do 20 ficaram bilíngues por substituição mecânica (`:36`, "MESMA RECEITA DE the former `e2e/17`").
  A decisão de 2026-09-02 cobre `raise`/`Error`/`Exception`, e `frontend/e2e/` não está nas linhas 1/2 da tabela. Por isso não há norma citável que torne isto violação. Registrado para quem decidir estender a fronteira.
