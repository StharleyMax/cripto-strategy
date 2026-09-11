# REVIEW arquitetural — wave `03` (`wave/03-producao-e-janela-deslizante`)

**Veredito: COMPLIANT** — 0 das 8 regras bloqueantes violadas. Data: 2026-09-11.
Revisor: `/review` (read-only). Ancoragem: `d480dcc` (tip da branch) vs `master`.

## Denominador

| o que | comando | resultado |
|---|---|---|
| regras bloqueantes em vigor | `harness rules list --severity block` | **n=8** (`core.relative-import`, `core.silent-except`, `core.print-statement`, `core.hardcoded-secret`, `web-fullstack.browser-imports-server`, `web-fullstack.tenant-from-request`, `web-fullstack.server-test-directory-present`, `own.compose-hardcoded-secret`) |
| escopo do diff | `git diff --stat master..wave/03-producao-e-janela-deslizante` | **34 arquivos, 3.297+/399−** |
| arquivos de código no escopo | `git diff --name-only … \| grep -E '\.(ts\|tsx\|py\|js\|jsx\|yml\|yaml)$'` | **n=24** |
| régua mecânica, por arquivo | `harness rules --mode file --path <f>` (laço sobre os 24) | **0 BLOQUEIO, 0 AVISO** |
| régua mecânica, árvore inteira | `harness rules --mode sweep` | 132 linhas · **0 BLOQUEIO** · 14 AVISO, **nenhum dentro do diff** (11 `core.module-docstring-single-line` em `backend/src`, 4 `web-fullstack.hardcoded-url` em `frontend/src/app/*.test.ts` — passivo de `master`) |
| suíte do componente | `npm --prefix frontend run test:charts` · `test:app` | **187/187** e **156/156**, 0 fail |
| `make verify` | `make verify` (worktree do revisor, `20260911T171525Z`) | `lint-backend` **OK** (413 arquivos) · `lint-frontend` **OK** · `test` **OK** (2.120 passed, cobertura 96,96%) · `boundaries` **OK** (7 kept, 0 broken) · ⚠️ `regras` e `política` **`rc=3` NÃO MEDIU** ⇒ veredito do script: **INDETERMINADO** |

> ⚠️ **Por que o `INDETERMINADO` do `make verify` NÃO é achado desta wave, e por que ele não me dispensa:** os dois portões que recusaram medir são `--changed-only`, e a árvore está **limpa** (`diff: sem mudança não-commitada`) — eles não têm o que olhar depois do commit. É o `rc` ambíguo que `ADR-012` nomeia, e o script acerta ao chamá-lo de `INDETERMINADO` em vez de verde. **É exatamente por isso que o denominador acima não usa `make verify` como régua:** rodei `harness rules --mode file --path <f>` nos 24 arquivos, um a um, que é a medição que `--changed-only` não faz numa árvore commitada.

## Os 5 pontos auditados

### 1. Fronteira de idioma — ✅ com 1 WARNING

`d480dcc` cria `frontend/src/charts/contrast.ts` e `frontend/src/charts/color-contrast.test.ts`:
**nascem em inglês**, nas três superfícies que a tabela de 12 linhas do `CLAUDE.md` cobre —
identificador (linha 1/2: `relativeLuminance`, `contrastRatio`, `HEX_RE`, `measure`, `poisoned`,
`THIS_DIR`), docstring (linha 5) e **mensagem de `throw new Error(...)`** (prosa adjacente
`[PREMISSA-OWNER: 2026-09-02]`): `contrast.ts:27` `expected a "#rrggbb" color, got …`,
`color-contrast.test.ts:65` `role "…" declares an unknown contrast backdrop: …`.

Varredura de toda a wave — `grep -nE 'throw new [A-Za-z]*Error\(' -A2` sobre os arquivos alterados
de `frontend/src`: **n=14 mensagens, 0 em português**. Identificadores de topo dos 6 módulos novos
(`contrast.ts`, `color-contrast.test.ts`, `s2-window.ts`, `s2-fixture-window.ts`,
`request-window.ts`, `series-key-id.ts`): **0 em português**.

String visível de UI (linha 8 da tabela, pt-BR): o diff de `SymbolClient.tsx` **não acrescenta
microcopy nova** — só estilo, `toISOString` e o novo `firstPresentMs`; a `data-*`/`SEM_PONTO`
existente fica. Nada a reprovar.

**[WARNING-1]** `frontend/src/charts/index.ts:57-66` (bloco `2b`, novo nesta wave) e
`index.ts:21-22` são **comentário autoral em português**, o que a **linha 5** da tabela
(`docstring / comentário → inglês`, `ADR-011/D6` + `T-01.7`) manda ser inglês.
⚠️ **Mitigação real, e ela é o motivo de isto ser WARNING e não BLOCKER:** (a) `index.ts` **já
carregava** o mesmo estilo em `master` (`// ── 2. composição de painéis`, e a linha 9 do docstring),
então a wave **continua** um desvio local, não o inaugura; (b) idioma de identificador é
**convenção, não portão** — `CLAUDE.md` §*"Idioma de identificador é convenção, não portão"*
proíbe explicitamente `[[rules.own]]` de idioma (`ADR-011/D1.10`), logo **nenhuma régua mecânica
pode pegar isto** e ele não pode ser bloqueante.
**Correção concreta:** reescrever `index.ts:57-66` e `21-22` em inglês, preservando as citações
literais de `ADR-003` FR-2 entre aspas (as demais ocorrências de português no diff — 
`SymbolClient.tsx:80`, `s2-window.ts:33`, `s2-window.test.ts:113,123`, `s2-fixture-window.ts:22`,
`request-window.ts:143`, `volume-subaxis-dom-contract.test.ts:93` — **são citação de documento
português dentro de prosa inglesa e estão corretas**; não as toque).

### 2. `CONTRAST_BACKDROP` NÃO é allowlist — ✅ julgado pelo mecanismo, não pela alegação

A alegação do builder ("exceção estrutural: token sem backdrop = erro de tipo") **se sustenta**, e
o que a sustenta não é a frase — são quatro propriedades verificáveis do mecanismo:

1. **Totalidade por tipo** — `color-tokens.ts:159`:
   `Readonly<Record<ColorRole, ContrastBackdrop>>`. Um membro novo de `ColorRole` sem linha aqui
   **não compila**. Uma allowlist é o oposto: ela é um `readonly string[]` cujo *default* é medir e
   cuja *entrada* é não medir.
2. **Totalidade também em runtime** — `color-contrast.test.ts:99-107`:
   `assert.deepEqual(Object.keys(CONTRAST_BACKDROP).sort(), Object.keys(colorTokens()).sort())`.
   Nem "declarei e esqueci" nem "declarei a mais" passam.
3. **Nenhum papel é pulado** — `color-contrast.test.ts:121-131` itera
   `Object.keys(CONTRAST_BACKDROP)` **inteiro**; não há `continue`, `skip`, nem lista de nomes.
   `directionOn` **é medido**, só que contra o backdrop que ele declara
   (`kind:"roles"`, `["directionUpFill","directionDownFill"]`, piso 4,5 de `ADR-010/ON`), e o
   `measure` toma o **pior** dos dois. Piso mínimo global assegurado: `minRatio >= 3.0` para todo
   papel (`color-contrast.test.ts:110`).
4. **A exceção é mostrada MORDENDO** — `color-contrast.test.ts:176-180`, controle negativo
   "directionOn is NOT exempt": escurecer `directionUpFill` para `#1d2330` **reprova `directionOn`**.
   Isto é exatamente o que uma allowlist não consegue fazer: entrada de allowlist é
   incondicionalmente silenciosa, e é por isso que `CLAUDE.md` a chama de indistinguível de bypass.

Além disso, `ADR-011/D1.10`/`PRD-002`/`RN-4` proíbem allowlist **na máquina de regras**
(`[[rules.own]]`) — `CONTRAST_BACKDROP` não está lá; é input de um teste. Não há regra a citar
contra ele, e por analogia o mecanismo também não se qualifica. **Nada a reprovar.**

### 3. `CA-F2-3` em `page.tsx` — ACHADO ABERTO, **fora** do diff desta wave

Confirmado e corrigindo a coordenada do enunciado: a chamada está em
`frontend/src/app/symbol/page.tsx:239` (a `:238` é comentário), **fora de try/catch**:

```ts
const volumeSlots = volumeSlotsFromHistoryRows(volumeResult.rows);
```

E ela **pode lançar**: `view-model.ts:177-192` lança `InvalidSeriesValueError` para valor não
finito (`:184`) e para valor negativo (`:191`). Uma linha malformada de `/series-history` derruba
a rota `/symbol` inteira — contra `CA-F2-3` e contra o que o **próprio cabeçalho de `page.tsx`
declara** (*"WHY EVERY FAILURE DEGRADES TO ABSENCE, NEVER A THROWN PAGE"*).

**NÃO reprovo esta wave por isto, e a evidência é o `git diff -U0`:** os hunks de `page.tsx` são
`+16,9 · +47,4 · +60,0 · +61,0 · +80 · +85 · +100,0 · +123,3 · +128 · +137,3 · +171,5 · +198,4 ·
+204,4 · +210 · +220 · +243,5 · +249 · +272`. **A linha 239 não está em nenhum deles** — a wave a
deixou byte a byte como estava em `master`. É passivo, já reportado em
`docs/context/cinco-metricas-do-core/gates/T-01.7-qa.md:186-191,289`.
**Correção concreta (task própria, não esta wave):** envolver a chamada em `try/catch` que degrade
para `slots: []` + `status: {kind:"absent"}`, exatamente como `fetchPanelRows` já faz para os 3
painéis.

### 4. Barril de `charts` — ✅ não vaza fixture

`index.ts` mudou nesta wave (novo bloco `2b`), e **continua sem exportar `s2-fixture-window.ts`**:

- `grep -n 's2-fixture-window' frontend/src/charts/index.ts` → só o comentário de exclusão
  (`:64-66`), **nenhum `export`**.
- `grep -rn 'S2_FIXTURE_WINDOW' frontend/src frontend/e2e` → importado por **3 arquivos, todos
  `*.test.ts` de `src/charts/`** (`s2-axis-integration`, `s2-panels`, `s2-absence-policy`).
  **Zero** consumidores em `src/app/` e **zero** em `frontend/e2e/`.
- O teste do lado `web` que precisa de janela fixa **não** faz deep import: `view-model.test.ts:53-58`
  **deriva a própria** por `resolveTrailingWindow` vindo do barril.
- O portão é executável, não documental: `frontend/eslint.config.mjs:269-277` restringe
  `src/app/symbol/**` a `**/charts/index{,.ts,.tsx}`; `QA-wave-03.md §3` plantou o deep import e
  ele **reprovou** (`no-restricted-imports`, 1 error).

O que o bloco `2b` **passou** a exportar (`ONE_DAY_MS`, `S2_WINDOW_SPAN_MS`, `lastGridInstant`,
`resolveTrailingWindow`, `utcDaysCovered`, `S2Window`, `TrailingWindowRequest`) é geometria pura de
`charts`, na direção certa de `ADR-003` FR-2 (`web` lê o relógio, `charts` faz a geometria) —
`page.tsx:171` é a única leitura de `Date.now()`. Sem inversão de dependência. **Nada a reprovar.**

### 5. Número sem o comando — 1 WARNING

**Onde a disciplina está paga:** `D13-tema-unico-escuro-builder.md:45` (`grep -rn 'colorTokens(\|
candlestickSeriesColors(' frontend/src` → 18 ocorrências, 0 com argumento), `:101-113` (tabela de
razões com a referência declarada e o comando do portão em `:131`), `QA-wave-03.md` (6 blocos de
comando com saída crua, incluindo `npx playwright test --list`),
`WAVE-03-janela-deslizante-quant-architect.md` (16 blocos, 13 ocorrências de `n=`),
`T-01.10-infra.md` (20 blocos, 19 `[MEDIDO]`, 9 `n=`).

**[WARNING-2]** Dois blocos **acrescentados por este diff** carregam `[MEDIDO 2026-09-11]` **sem o
comando e sem o `n`**:
- `docs/product/DESIGN_SYSTEM.md:409` — *"as 4 chamadas de produção do gráfico pediam `"light"`"*;
- `docs/context/cinco-metricas-do-core/handoff/DECISOES-OWNER.md:265-270` — a tabela
  (`0`/`10` tokens em `globals.css`; `4`/`0` chamadas), que é **a fonte** do número acima.

Documento citado: `CLAUDE.md` §*"Nenhum número sem o comando que o produziu"* — *"Toda afirmação
quantitativa carrega o comando, o universo (`n`) e um rótulo de força"*. O rótulo está; o comando e
o `n` não. Os números **são** verdadeiros (reproduzi: `grep -c` de `colorTokens(` em produção e o
`@theme` de `globals.css` batem), e é justamente por serem verdadeiros que vale consertar barato.
**Correção concreta:** acrescentar a `DECISOES-OWNER.md:265` os dois comandos que produziram a
tabela — algo como
`grep -rn 'colorTokens(\|candlestickSeriesColors(' frontend/src --include='*.ts*' | grep -v test`
e `grep -n -- '--color-' frontend/src/app/globals.css` — com o `n` de cada; `DESIGN_SYSTEM.md:409`
pode então citar o handoff em vez de repetir o número solto.

**Observação menor (INFO):** `QA-wave-03.md` carrega todos os comandos mas **nenhum rótulo
`[MEDIDO]`** (`grep -c MEDIDO` → 0). O comando está lá, que é a metade que importa; o rótulo é
barato de acrescentar.

## Sinais laterais confirmados (não são violação; registro para o orquestrador)

- O **BLOQUEIO** que `QA-wave-03.md §1` levantou (`e2e/08` importando `RANGE_*` deletado ⇒
  `0 tests in 0 files`) **foi corrigido** em `3a0eff6`: `grep -rn 'RANGE_START_MS\|
  RANGE_END_MS_EXCLUSIVE' frontend/` não devolve **nenhuma** ocorrência em `frontend/e2e/`, e
  `e2e/08:4` agora importa `computeSeriesKeyId` do módulo novo `series-key-id.ts`.
- O seeding no Postgres compartilhado que `QA-wave-03.md §1` observou **saiu**:
  `grep -rn 'seedSeriesRow\|INSERT INTO' frontend/e2e/` → `rc=1`, nenhuma linha.

## Veredito

**COMPLIANT** — **0/8** regras bloqueantes violadas, medido por `harness rules --mode file` sobre
os **24** arquivos de código do diff e por `harness rules --mode sweep` sobre a árvore inteira.
Os dois achados são **WARNING** (convenção, com documento citado) e o `CA-F2-3` é **achado aberto
fora do escopo do diff**, registrado e não reprovado.
