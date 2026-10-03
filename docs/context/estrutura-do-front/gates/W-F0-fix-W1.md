# W-F0-fix-W1 — conserto pós-review da fase 00 (`T-00.2`): arquivo-raiz de `indicators/` não é indicador

Feature: `estrutura-do-front` · Componente: `web` · Fonte dos achados: `gates/W-F0-REVIEW.md` (W-1) e
`gates/W-F0-QA.md` (W3).

## O que mudou

`frontend/eslint-rules/indicator-isolation.mjs` (único arquivo de código no commit):

- **W-1.** `classify` ganhou a camada `indicators-root-file`: dois segmentos terminando em extensão de
  fonte (`indicators/catalog.test.ts`, `indicators/index.ts`). Ela deixa de ser indicador, como pede
  a `SPEC-011 §5.3`: pasta de indicador é SUBDIRETÓRIO de `indicators/`, menos `selection/`.
  - **P2 continua valendo:** a camada entrou em `targetIsUnderIndicators`.
  - **P3 continua valendo:** o arquivo-raiz não é `catalog`, então importar `./oi/…` dá P3.
  - **Leitura conservadora declarada:** alvo de dois segmentos SEM extensão (`./oi`) segue sendo
    tratado como pasta de indicador. A resolução é léxica e não há como distinguir arquivo de pasta.
- **W3.** Um indicador que alcança `indicators-root` (`".."`, `"../"`) ou `indicators-root-file` agora
  dá **P1**. Antes do conserto, essa fuga era fechada pelo P1 do próprio `index.ts`, que era
  classificado como "indicador `index`". Com o W-1, o `index.ts` deixa de ser indicador e reexportar o
  catálogo nele fica permitido. Sem o W3, o desvio indicador → `..` → `index.ts` → `catalog.ts`
  passaria a ficar aberto.
  - Indicador → arquivo-raiz já era P1 antes do conserto (como "outro indicador"), então nada foi
    alargado ali.
  - O que se alargou foi só `indicators-root` (`".."`), que era a sugestão do QA.

## Prova dos dois braços `[MEDIDO 2026-10-02]`

Sondas por stdin: `printf … | npx eslint --stdin --stdin-filename src/app/symbol/<arquivo> -f json`,
`n=8`.

| sonda | regra de `HEAD` (`c96ca23`) | com o conserto |
|---|---|---|
| `indicators/catalog.test.ts → ./catalog.ts` | **P1**, rc=1 | **cala**, rc=0 |
| `indicators/catalog.test.ts → ./contract.ts` | cala | cala |
| `indicators/catalog.test.ts → ./oi/definition.ts` | P1 | **P3** |
| `chart/host/probe.ts → ../../indicators/catalog.test.ts` | P2 | P2 |
| `indicators/oi/probe.ts → ".."` | **cala** (W3) | **P1** |
| `indicators/oi/probe.ts → "../"` | **cala** (W3) | **P1** |
| `indicators/oi/probe.ts → "../index.ts"` | P1 | P1 |
| `indicators/index.ts → ./catalog.ts` | P1 | cala (o desvio fecha no importador, pela linha `".."`) |

Teste da regra com o patch aplicado. O comando roda uma cópia em scratchpad, com o import de `eslint`
e `FRONTEND_ROOT` fixados em caminho absoluto: `node --conditions=react-server --test <cópia>`.

- **Com o conserto:** 5/5 testes passam. As 9 sondas antigas continuam no primeiro teste, e 5 delas
  mordem.
- **Regra revertida para `HEAD`:** 4 passam e **1 falha**, justamente o teste novo, com
  `CALA "indicators/catalog.test.ts -> ./catalog.ts"`.

Na árvore, sem o patch, rodei
`node --conditions=react-server --test src/app/symbol/indicator-isolation-rule.test.ts src/app/top-level-source-directories.test.ts`:
8/8 passam. `npm run lint`: limpo. `harness rules --mode sweep --changed-only`: rc=0, sem saída.

## Bloqueado — a sonda permanente NÃO está no arquivo de teste

A edição de `frontend/src/app/symbol/indicator-isolation-rule.test.ts` foi **negada pelo hook
`harness gate-enforce`**. O motivo é colisão de escopo: `frontend/src/app/symbol` é reivindicado por
`estrutura-do-front` e por `paineis-de-fluxo`, as duas em `BUILD_AUTHORIZED`.

- Reprodução: `harness pipeline scope <feature> list`, e `harness gate-enforce` com o JSON do `Edit`
  na entrada, que devolve `deny`.
- `frontend/eslint-rules/` só tem um dono, e por isso a regra pôde ser editada.

Não contornei o hook (escrita por `Bash`) e não gravei `override` no ledger. Ledger não é escrita
minha (card, §Restrições 5).

**O patch está pronto e foi verificado:** `handoff/W-F0-fix-W1-test.patch` (`git apply --check` passa).
Para aplicar, quem tem a autoridade roda `harness pipeline override estrutura-do-front "<motivo>"`,
depois `git apply` e depois o teste da regra.

**Observação para o orquestrador:** pela mesma colisão, os arquivos da F0 em `frontend/src/app/symbol/`
devem esbarrar no `harness require-push` na hora do push `[INFERRED: o hook usa o mesmo classificador;
não medido]`.

## make verify

`E2E_API_PORT=8881 E2E_NEXT_PORT=4381 make verify` deu **VERDE** nos 8 portões, rc=0 `[MEDIDO 2026-10-02]`. Números: test-frontend 1223 pass / 0 fail; test 3429 passed, cobertura 96,42%; e2e 98 passed; regras com 0 bloqueios. O log está em `/tmp/verify-wave-estrutura-f00-20261002T213714Z.log`.

## Doc delta

- `SPEC-011`: sem mudança. O conserto alinha a regra ao texto da §5.3, não o contrário.
- ADR: não é necessária. Não há decisão nova; o W3 fecha um desvio da P1 que já está declarada.
- `docs/INDEX.md`: sem linha. Segue o precedente do fechamento da wave (`W-F0-QA` W5).
- Validação ao vivo (Playwright): não se aplica. É regra de lint, sem tela.
