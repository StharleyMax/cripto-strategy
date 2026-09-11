# `D13` aplicada — tema único e escuro, parâmetro APAGADO, com portão de contraste

**Agente:** `frontend-builder` · **Componente:** `web` (+ `charts`) · **Data:** 2026-09-11
**Base:** `wave/03-producao-e-janela-deslizante` (`b722b56`, fast-forward — branch local, não publicada)
**Decisão aplicada:** [`handoff/DECISOES-OWNER.md` §D13](../handoff/DECISOES-OWNER.md)
`[DECISÃO-OWNER: 2026-09-11, escolha entre alternativas apresentadas]` — *"pode registar a oção b"*

---

## 1. O que mudou, e por que NÃO foi a opção `A`

`colorTokens()` e `candlestickSeriesColors()` **perderam o parâmetro `mode`**. `ColorMode`,
`TOKENS_BY_MODE` e a paleta **clara inteira** foram **deletados** de
[`frontend/src/charts/color-tokens.ts`](../../../../frontend/src/charts/color-tokens.ts).

⛔ **Não foi trocado `"light"` por `"dark"`** — essa é a alternativa `A`, que `D13` recusa **por nome**
porque *"deixa a armadilha armada, e ela já disparou duas vezes no mesmo arquivo"*
(`SymbolClient.tsx:296` e `:334`). Com o parâmetro apagado o defeito deixa de ser **argumento errado** e
passa a ser **inexprimível**: não há como pedir a paleta clara, porque ela não existe.

A testemunha versionada disso é aritmética, não prosa —
`color-tokens.test.ts::"D13: the theme parameter is GONE, not merely defaulted"`:

```
assert.equal(colorTokens.length, 0);
assert.equal(candlestickSeriesColors.length, 0);
```

Sob a opção `A` os dois valeriam `1`. E `lint-frontend` hoje **carrega `tsc --noEmit --strict`**
(saída literal do portão: *"ESLint + tsc --noEmit --strict do projeto sobre frontend/src"*), então um
sítio que ainda passasse argumento **reprova no typechecker**, não só no teste.

### Sítios atualizados — 18, conforme a task declarou

| arquivo | linhas | natureza |
|---|---|---|
| `frontend/src/app/symbol/SymbolClient.tsx` | `281`, `296`, `334`, `360` | **produção** (4) |
| `frontend/src/charts/color-tokens.test.ts` | 7 ocorrências (2 laços `for … of ["light","dark"]` colapsados) | teste |
| `frontend/src/app/symbol/axis-fidelity.test.ts` | `128` | teste |
| `frontend/src/app/symbol/volume-subaxis-dom-contract.test.ts` | `165` | teste (substituição textual sobre o fonte do `SymbolClient` — a regex teve de acompanhar, senão o `assert.notEqual(restyled, source)` viraria falso-verde) |
| `frontend/src/charts/s2-axis-integration.test.ts` | `143` | teste |
| `frontend/src/charts/index.ts` | `89` | barril: `ColorMode` deixa de ser reexportado |
| `frontend/src/charts/s2-headless-run.ts` | `29` | docstring que citava `candlestickSeriesColors(mode)` |

`grep -rn 'colorTokens(\|candlestickSeriesColors(' frontend/src` → **18 ocorrências, 0 com argumento**
`[MEDIDO 2026-09-11]`.

### O que NÃO foi tocado, deliberadamente

- **`scripts/validate_palette.js` mantém o bloco `PAPEIS.claro`.** Ele é o instrumento `docs` da
  aritmética de dicromacia de `ADR-010`, e `D13` aposentou o tema claro do **app**, não da **ADR**.
  O cross-check de `color-tokens.test.ts` passou de 2 colunas para 1 (`escuro`), e o teste de
  precondição continua exigindo que **as duas** colunas sejam parseáveis no script.
- **`globals.css` intocado.** `D13` mediu que o app **já era** escuro-apenas: 10 tokens no `@theme`
  escuro, 0 no claro sem media query.
- `docs/context/plataforma-dados/gates/T-05.7-design.md:85` cita `colorTokens(mode).critical`. É
  **relatório de gate histórico** (registro append-only de uma task passada) — não reescrito.

---

## 2. O PORTÃO — `frontend/src/charts/color-contrast.test.ts`

Nenhum token de série pode ficar abaixo do piso declarado contra a superfície em que ele é **de fato
desenhado**. Fórmula WCAG 2.x de luminância relativa, em
[`frontend/src/charts/contrast.ts`](../../../../frontend/src/charts/contrast.ts) (puro, sem DOM — a
alternativa `C` de `D13`, "derivar das CSS custom properties em runtime", foi recusada por violar a
pureza que `ADR-003` FR-1 exige de `charts`).

### A exceção de `directionOn` é ESTRUTURAL, não allowlist

O modo errado de resolver isto seria uma lista de nomes que o teste pula — e
`CLAUDE.md` nomeia esse padrão: *"entrada de allowlist é indistinguível de bypass"*. Em vez disso,
**cada papel declara contra o que é medido**, ao lado da paleta:

```ts
export const CONTRAST_BACKDROP: Readonly<Record<ColorRole, ContrastBackdrop>> = {
  directionUpFill:   { kind: "surface", minRatio: 3.0 },
  directionDownFill: { kind: "surface", minRatio: 3.0 },
  directionOn:       { kind: "roles", roles: ["directionUpFill", "directionDownFill"], minRatio: 4.5 },
  dataBrokenInk:     { kind: "surface", minRatio: 3.0 },
  provenanceStrong:  { kind: "surface", minRatio: 3.0 },
  provenanceWeak:    { kind: "surface", minRatio: 3.0 },
};
```

O tipo é `Record<ColorRole, …>` ⇒ **um token novo sem declaração é erro de tipo**, e `tsc --strict`
está dentro de `make verify`. Não há como acrescentar cor sem dizer sobre o que ela é pintada. Um
teste separado exige que o conjunto de chaves seja **igual** ao da paleta (`assert.deepEqual` dos dois
`Object.keys().sort()`) — um token sem backdrop é um token que o portão não mede, que é exatamente
como a linha de OI invisível passou.

E a exceção **não** é isenção: o controle negativo `"directionOn is NOT exempt"` escurece
`directionUpFill` para `#1d2330` e mostra `directionOn` **reprovando** contra o próprio fill.

`SURFACE_BASE = "#131722"` é literal em `charts` (que não pode ler o DOM), e o portão **lê
`frontend/src/app/globals.css` como texto** para provar que as duas citações não divergiram — mesma
disciplina "two call sites, one number" que o arquivo já usava contra `validate_palette.js`.

---

## 3. Os contrastes — antes e depois `[MEDIDO 2026-09-11]`

Contra `--color-surface-base` = `#131722` (`frontend/src/app/globals.css:28`):

| série / papel | com `"light"` (como estava em produção) | agora (paleta única) | piso |
|---|---:|---:|---:|
| volume — `provenanceWeak` | **2,80:1** ⛔ reprova WCAG 1.4.11 | **5,82:1** | 3,0 |
| linha de OI — `provenanceStrong` | **1,00:1** — *invisível, igual ao fundo* | **14,72:1** | 3,0 |
| `directionUpFill` | 5,01 | **5,01:1** | 3,0 |
| `directionDownFill` | 4,59 | **4,59:1** | 3,0 |
| `dataBrokenInk` | 1,65 ⛔ | **9,68:1** | 3,0 |
| `directionOn` **sobre os fills** (não sobre o fundo) | — | **5,01** (alta) · **4,59** (baixa) ⇒ pior **4,59:1** | 4,5 |

Os dois números que `D13` nomeia — `2,80 → 5,82` e `1,00 → 14,72` — **reproduzem exatamente**, e estão
congelados como asserção em `"the measured ratios are the ones D13 recorded, to 2 decimals"`.

⚠️ **`directionOn` contra o fundo dá `1,00:1` e isso NÃO é defeito** — foi reportado como um na revisão
de design e **retratado** em `D13` (*"Medi contra a referência errada"*). Ele é tinta sobre o corpo da
vela.

⚠️ **Por que `5,82` aqui e `4,89` na tabela de `DESIGN_SYSTEM.md §1.2`:** a tabela mede o **pior caso
de superfície** (`--sup-listra`, `#222634`); o portão mede o fundo em que a carta é realmente desenhada
(`--sup-base`, `#131722`). Referências diferentes, ambas verdadeiras — e o `5,01`/`4,59` de
`--direcao-on` da tabela **bate dígito a dígito** com o que o portão calcula, o que é uma confirmação
independente de que a exceção estrutural está aferida contra a referência certa.

---

## 4. O portão MORDE — mutação plantada e revertida

`provenanceWeak` replantado para `#57606a` (o hex exato que a paleta clara deletada carregava, isto é,
o valor com que o histograma de volume era de fato pintado em produção):

```
npx --prefix frontend node --experimental-strip-types --test frontend/src/charts/color-contrast.test.ts
→ ℹ tests 8 · pass 6 · fail 2
✖ D13's floor: no token sits below the contrast floor of the surface it is drawn on
  AssertionError: tokens below their declared contrast floor:
    provenanceWeak (#57606a) vs surface #131722: 2.80:1 < 3.0:1
✖ the measured ratios are the ones D13 recorded, to 2 decimals
```

Revertido → **8/8 pass**. O `2.80:1` que o portão imprime é o mesmo `2,80` que `D13` registrou.

Além da mutação na paleta real, o arquivo carrega **3 controles negativos permanentes**, que rodam em
todo `make verify` e alimentam o **mesmo** `measure()` do portão (guarda exercitada só sobre dado que
já passa não prova nada):

1. `#57606a` em `provenanceWeak` → `2,80:1`, abaixo do piso;
2. `#131722` em `provenanceStrong` → `1,00:1` — o defeito exatamente como foi para produção;
3. `directionUpFill` → `#1d2330` faz **`directionOn`** reprovar, provando que a exceção é "medido
   contra outra coisa", nunca "não medido".

---

## 5. Comandos rodados, literais, com o universo

| comando | resultado | universo |
|---|---|---|
| `bash scripts/verify.sh` (`HARNESS_MECHANISM` exportado para o **executável**) | **VERDE — 6 portões mediram e passaram** | `lint-backend rc=0` (413 arquivos) · `lint-frontend rc=0` (**ESLint + `tsc --noEmit --strict`**) · `test rc=0` (**2120 passed**, cobertura **96,96%**) · `boundaries rc=0` (7 kept, 0 broken) · `regras rc=0` (**0 bloqueio**, 66 avisos) · `política rc=0` |
| `npm --prefix frontend run test:charts` | **187/187 pass, 0 fail** | era 179 — **+8** (o portão novo) |
| `npm --prefix frontend run test:app` | **156/156 pass, 0 fail** | inalterado |
| `npm --prefix frontend run test:s3` | **111/111 pass, 0 fail** | inalterado |
| `npm --prefix frontend run test:s1` | 97 pass, **8 fail — AMBIENTAL** | ver §6 |
| `npm --prefix frontend run lint` | `rc=0`, saída vazia | `eslint src` |
| `npm --prefix frontend run test:e2e -- --list` | **`Total: 24 tests in 8 files`** | inalterado, como a task exige |
| `harness rules --mode sweep --changed-only` | `rc=0`, nenhum achado | 9 arquivos do diff |

⚠️ **Declaração de universo, sem a qual "os testes passam" não é medição:**
`grep -rn 'node --test' scripts/verify.sh Makefile .git/hooks/pre-push` → **0 linhas** ⇒ a suíte
`node --test` do front **não está em portão nenhum**. Foi rodada à mão, e é por isso que cada linha
acima traz o comando e a contagem. O que `make verify` de fato cobre do front é `lint-frontend`
(ESLint + `tsc --strict`).

⚠️ `npx --prefix frontend playwright test --list` **da raiz do worktree devolve `0 tests in 0 files`** —
o `playwright.config.ts` vive em `frontend/`, e o `npx` não muda o cwd. A forma que mede é
`npm --prefix frontend run test:e2e -- --list`, porque `npm run` executa no diretório do pacote.
Registrado para o próximo não concluir "a coleta quebrou" de um erro de cwd.

---

## 6. As 8 falhas de `test:s1` são AMBIENTAIS, e a prova não é opinião

```
src.main.StoreParentDirectoryMissingError:
  series quarantine store parent directory does not exist: data/md
```

`ls -d /home/stharley/Documentos/projects/cripto-strategy/data/md` → **não existe nem no checkout
principal**. O diff **não toca** `frontend/src/features/s1-console/`
(`git diff --name-only | grep -c s1-console` → **0**), e a entrada de `docs/INDEX.md` da correção da
wave `03` (2026-09-11T16:00Z) já registrou a mesma falha, com a mesma causa, antes desta task existir.

**Setup do worktree, para quem repetir:** `frontend/node_modules`, `data/` e `backend/.venv` são
gitignored e **não** existem num worktree novo. Sem os três, `test:charts` reprova ~16 testes de
fixture real e `test:s1` recusa medir — e **recusa de medir não é reprova**, mas parece uma.
Symlinks para o checkout principal resolvem; nenhum deles é versionável.

---

## 7. Doc delta

- **[`docs/product/DESIGN_SYSTEM.md`](../../../product/DESIGN_SYSTEM.md) §1.2** — tarja nova depois da
  tabela de papéis: o app passou a ter um tema, a coluna **claro** da tabela e o `PAPEIS.claro` do
  script **ficam** (são `ADR-010`, não app), os contrastes antes/depois, o portão e a razão de
  `5,82` (portão, `--sup-base`) não conflitar com `4,89` (tabela, `--sup-listra`).
  ⚠️ A tarja **registra decisão do owner e medição**; ela não decide aparência. Qualquer mudança de
  aparência continua sendo do [`ui-designer`](../../../../.claude/agents/ui-designer.md) com o
  `design_gate` (`ux-ui-mastery`) de acordo.
- **`docs/product/STITCH_CONTEXT.md`** — **sem mudança**, com motivo: nada de navegação, tela ou
  layout mudou. O que mudou é a paleta que já estava declarada no design system, e a decisão é do
  owner, não proposta de design.
- **ADR** — **não necessária**, com motivo: `ADR-010` não é contrariada — nenhum valor de cor mudou,
  nenhum papel entrou ou saiu, e `ADR-003` é **reforçada** (a alternativa que leria o DOM foi
  recusada). O ato é de aplicação de `D13`, que já é decisão registrada do owner.
- **[`docs/INDEX.md`](../../../INDEX.md)** — 1 linha **acrescentada** (append-only).

---

## 8. O que este gate NÃO fez

- ⛔ **Nenhuma escrita no ledger** — `gate-record`, `approve` e `advance` são atos de **owner**.
- ⛔ **Nenhuma validação ao vivo por Playwright.** `claude mcp list` não lista servidor Playwright
  nesta instalação ⇒ o passo **não roda**, e a ausência fica registrada aqui em vez de ser descrita
  como feita. `--list` foi rodado (24/8) para provar que a **coleta** não regrediu; a execução dos
  e2e exige app real de pé e é do `frontend-qa`.
- ⛔ **Nada semeado em banco** — esta task não toca dado; só leitura de fixture e de `globals.css`.
- Os **66 avisos** de `harness rules` são os mesmos da wave, pré-existentes; `--changed-only` sobre o
  diff desta task devolve `rc=0` sem achado.
