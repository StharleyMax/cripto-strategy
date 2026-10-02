# W-F0-QA: QA de front da fase `00` de `estrutura-do-front` (T-00.1, T-00.2, T-00.3)

> **Autor:** `frontend-qa`, 2026-10-02 · **Árvore:** `wave/estrutura-f00` em `843ac8f` (o código é o de `9445763`, porque `843ac8f` só traz doc)
> **Diff da fase:** `git diff docs/estrutura-do-front..HEAD` (`docs/estrutura-do-front` = `a3471a2`): 13 arquivos, +1332/−5
> **Contra:** `docs/plans/SPEC-011-estrutura-do-front/00_trilhos.md` (itens 0.1 a 0.5, DoD 1 a 6) · `SPEC-011 §3, §4.1–§4.3, §5.1–§5.5` · `tasks.toml` T-00.1/2/3
> **Ledger:** não escrevi nada. O `gate-record` é ato do orquestrador ou do owner.

## Veredito: **APPROVED**

Todas as guardas novas **mordem**. Cada ablação reprova o teste dono dela, cada reversão volta ao verde e nenhuma sonda ficou na árvore.
Achei **0 BLOCKER** e **6 WARNING** (abaixo).

```markdown
## QA Gate (Front) — Fase 00: os trilhos antes do movimento
- [OK] DoD da fase, item a item, com comando (seção "DoD" abaixo)
- [OK] Lógica fora do componente: a fase não tem componente, só tipos, uma regra de lint e testes
- [OK] Contrato tipado: só tipos, com prova por AST (C3–C6) e prova pelo compilador (C1–C2)
- [OK] Sem segredo no cliente: `harness rules --mode sweep --changed-only` rc=0, e o instrumento vê os arquivos da fase (sonda abaixo)
- [OK] Acessibilidade: não se aplica. A fase não toca a tela nem tem elemento interativo
- [OK] Testes existem, passam e têm o par morde/cala: 24/24 nos 5 arquivos; 20 de 21 ablações reprovam; a 21ª é limite declarado (T3)
- [OK] Cobertura: [NÃO MEDIDO]. O plano `00` não declara alvo e o front não tem instrumento de cobertura
- [OK] `harness rules --mode sweep --changed-only` sem bloqueante
- [OK] `make verify` verde: /tmp/verify-wave-estrutura-f00-20261002T210942Z.log (test:app 663/0, e2e 98 passed, 7 skipped)
- [OK] Doc delta correto · `docs/INDEX.md` só com linha acrescentada (4/0 desde `eda7520`, nenhuma da fase; ver W5)
- [OK] Rótulos de força corretos e números com comando nos dois relatórios dos builders
```

## Como a mutação foi medida

- **Executor:** `node --conditions=react-server --test <arquivo>`, rodado a partir de `frontend/`. É o mesmo comando de `test:app`, só que por arquivo.
- **Lint em disco:** `npx eslint -f json <caminho>`, com a config real.
- **Aplicação:** cada mutação é uma troca de string que tem de casar **exatamente 1×**. Ela é aplicada no lugar e revertida com `git checkout -- <arquivo>`. As sondas plantadas foram apagadas.
- **Árvore depois:** `git status --short` só mostra `gates/W-F0-REVIEW.md`, que não é meu (ver a nota de concorrência).
- **Logs e scripts:** os logs por mutação estão em `scratchpad/<rótulo>.log`. Os scripts são `scratchpad/{mut,rule_muts,disk_muts,sweep_muts,contract_muts}.py`.

**Linha de base, antes de qualquer mutação** `[MEDIDO]`:

| arquivo | rc | pass | fail |
|---|---|---|---|
| `indicator-isolation-rule.test.ts` | 0 | 4 | 0 |
| `contract.test.ts` | 0 | 4 | 0 |
| `top-level-source-directories.test.ts` | 0 | 4 | 0 |
| `bucket-arithmetic-boundary.test.ts` | 0 | 6 | 0 |
| `data-fact-ascii-key-contract.test.ts` | 0 | 6 | 0 |

Os 24 testes também aparecem como `✔` dentro do `make verify` da wave: `grep -cE "^✔ .*<nome>"` no log dá 1 para cada um dos 8 nomes que conferi.

## 1. `local/indicator-isolation`: 10 de 10 ablações reprovam, e 2 sondas em disco mordem

Arquivo: `indicator-isolation-rule.test.ts`.

| # | mutação | rc | pass/fail | o que reprova |
|---|---|---|---|---|
| R1 | o ramo `require` desligado (`if (false)`) | 1 | 3/1 | `MORDE "P1 by require"` |
| R2 | o ramo `ImportExpression` (`import()`) desligado | 1 | 2/2 | `MORDE "P1 by import()"` e a forma template |
| R3 | o ramo `ImportDeclaration` desligado | 1 | 2/2 | as nove sondas e as formas |
| R4 | `chart/**` fora do escopo (`head === "chart__off"`) | 1 | 2/2 | `MORDE "P2" (chart/host/probe.ts)` |
| R5 | a P3 desligada | 1 | 2/2 | `MORDE "P3" (probe.ts)` |
| R6 | a P1 desligada | 1 | 1/3 | as nove sondas, as formas e a tabela |
| R7 | a P2 desligada | 1 | 2/2 | as nove sondas e a tabela |
| R8 | a exceção de `selection/` desligada | 1 | 2/2 | a CALA `selection → catalog` passa a ser acusada |
| R9 | a regra desligada em `eslint.config.mjs` (`"off"`) | 1 | 1/3 | todas as que mordem |
| R10 | um bloco `no-restricted-imports` novo para `indicators/**` (`../cvd/**`, `../oi/**`), que substitui o do barrel | 1 | 3/1 | `ADR-034/D8 is intact` (DoD 2) |
| — | reversão | 0 | 4/0 | — |

Duas sondas foram plantadas **em disco** e lintadas pela config do projeto, pelo mesmo caminho de `eslint src` que é o `make lint-frontend`.

**L1.** Duas sondas reais:

- `indicators/cvd/x.ts`;
- `indicators/oi/probe.ts`, com `import` e `import()` de `../cvd/x.ts`.

Resultado: rc=1, `[P1, P1]`.

**L2.** O arquivo novo do núcleo, `chart/host/indicator-binding.ts`, ganhou `import type … from "../../indicators/contract.ts"`. Resultado: rc=1, `[P2]`.

**Reversão:** `npx eslint src` dá rc=0 e 0 mensagens.

## 2. Os varredores alargados reprovam uma sonda colocada só na subpasta

`BASE` é o arquivo como está em `docs/estrutura-do-front`, antes do alargamento.

| # | sonda | versão do teste | rc | pass/fail | leitura |
|---|---|---|---|---|---|
| S1 | `indicators/oi/probe.ts`: `return Math.floor(ms / step) * step;` | bucket BASE (plano) | 0 | 5/0 | **cego**: é o defeito que a fase fecha |
| S2 | idem | bucket alargado | 1 | 5/1 | `FR-2: no module of src/app/symbol/** …` |
| S3 | idem | alargado sem `recursive: true` | 1 | 5/1 | `the walk DESCENDS` |
| S4 | **sem sonda** | alargado sem `recursive: true` | 1 | 5/1 | `the walk DESCENDS`: a ablação é pega sem sonda nenhuma |
| — | — | reversão | 0 | 6/0 | — |
| D1 | `indicators/oi/probe.tsx`: `data-fact="oi_prõbe:x"` | data-fact BASE (só `SymbolClient.tsx`) | 0 | 5/0 | **cego** |
| D2 | idem | data-fact alargado | 1 | 4/2 | contagem (48 ≠ 47) e `non-ASCII literal segment` |
| D3 | `data-fact="oi_probe:x"` (ASCII) | alargado | 1 | 5/1 | contagem 48 ≠ 47: um fato novo numa subpasta move o total |
| D4 | a sonda de D2 | alargado sem `recursive: true` | 1 | 5/1 | `the universe is the tree` |
| — | — | reversão | 0 | 6/0 | — |

**N_fact = 47** sobre a árvore de hoje: o teste prende o literal em `data-fact-ascii-key-contract.test.ts:138` e passa (`6/0`).

O bucket tem **6** padrões (`grep -c 'pattern: /'`), e `[symbol]/page.tsx` está no universo com 0 ofensores nos 6. O `G-N` tinha medido 5 de 6. A medição desta fase fecha o sexto.

## 3. Diretório de topo: reprova um diretório novo

| # | sonda | versão | rc | pass/fail | leitura |
|---|---|---|---|---|---|
| T1 | `frontend/src/indicators/x.ts` | teste novo | 1 | 3/1 | `CA-4: every directory …` |
| T2 | idem | lista lida do disco (ablação) | 1 | 1/3 | `CA-4` **cala**; `pin` e `MORDE` reprovam |
| T3 | **sem sonda** | lista lida do disco | 0 | 4/0 | **não morde**: limite estrutural, ver W4 |
| T4 | `frontend/src/proxy.ts`, um arquivo no topo | teste novo | 0 | 4/0 | CALA, como `ADR-048/D8` exige |
| — | — | reversão | 0 | 4/0 | — |

## 4. O contrato é só de tipos e não enumera `kind`

Arquivo: `contract.test.ts`.

| # | mutação | rc | pass/fail | o que reprova |
|---|---|---|---|---|
| C1 | `K extends "volume" \| "oi" \| "cvd" \| "long_short" \| "liquidation"` | 1 | 2/2 | as duas CALA: o `"x"` sintético e o kind gerado no teste |
| C2 | `readonly kind: K & ("volume" \| …)` | 1 | 2/2 | as mesmas duas |
| C3 | `export const INDICATOR_KINDS = […] as const` em `contract.ts` | 1 | 3/1 | `carry types only` |
| C4 | `export function noop()` em `chart/host/indicator-binding.ts` | 1 | 3/1 | `carry types only` |
| C5 | `import type` → `import` em `chart/history/series-requirement.ts` | 1 | 3/1 | `carry types only` |
| C6 | `export type {…}` → `export {…}` (reexport com valor) em `contract.ts` | 1 | 3/1 | `carry types only` |
| — | reversão | 0 | 4/0 | — |

A forma do contrato bate com as tabelas da SPEC:

- **`§4.1`:** `kind`, `category`, `cardinality`, `defaultParams`, `parseParams`, `placement` (com `stretch` e `band`), `data` e `View`.
- **`§4.2`:** `instanceKey` string, `unmount` obrigatório, `measure`/`scales`/`layout` opcionais e `refeed` no registrar (`E-1`).
- **`§4.3`:** `bottomFraction`.

A direção é `indicators → chart`. A sonda L2 prova que o inverso morde.

## DoD do plano `00`, item a item

1. **9 sondas da regra.** OK: as 5 que mordem e as 4 que calam, permanentes e em memória. As 3 ablações do DoD estão em R1, R4 e R5, e há mais sete (R2, R3, R6–R10).
2. **O barrel continua mordendo.** OK: R10. O teste exige a mensagem `ADR-034/D8`, além do `ruleId`.
3. **Diretório de topo.** OK: T1 e T2. A árvore real passa (T4 e a reversão).
4. **Varredores.** OK: S1 a S4 e D1 a D4. 47 sobre a árvore de hoje.
5. **Nada da wave foi tocado.** OK: `git diff --name-only docs/estrutura-do-front..HEAD | grep -xFf <(git diff --name-only master...wave/paineis-f05)` dá rc=1, vazio. Ver W6.
6. **Portões.** OK. No log do `make verify`: `lint-frontend` e `typecheck` passam sem saída, `test:app` dá 663/0 e o e2e dá 98 passed. Os dois specs instáveis estão explicados em `gates/W-F0-e2e-instavel.md`.

As sondas de 3 e 4 não ficaram na árvore: `git status --short` não mostra nenhum arquivo meu.

O `numstat` das tasks confere com `git diff --numstat docs/estrutura-do-front..HEAD -- frontend/`:

- **T-00.1:** 4 arquivos novos, remoção 0.
- **T-00.2:** `indicator-isolation.mjs` (255/0), `eslint.config.mjs` (48/0, só adições) e o teste (246/0).
- **T-00.3:** o teste novo (81/0) e os 2 varredores (26/3 e 41/2).
- **e2e:** `git diff --name-status eda7520..HEAD -- frontend/e2e/` dá 0 linhas.

**Regras.** `harness rules --mode sweep --changed-only` dá rc=0 sem saída, e `--mode file` sobre os 10 arquivos de `frontend/` da fase também. Saída vazia sozinha não prova nada, então separei *"passou"* de *"não mediu"* com uma sonda: `"https://fapi.binance.com/…"` plantado em `contract.ts` dispara `[web-fullstack.hardcoded-url] … contract.ts:135` nos dois modos. O instrumento vê os arquivos da fase.

## Achados

1. **[WARNING] W1: a T-00.1 não tem relatório de builder.** Sem relatório não há gate block nem campo `Doc delta:`. Lido ao pé da letra, o card diz que Doc delta ausente é `NEEDS_FIX`. O despacho mandou julgar a T-00.1 pelo código e pelo commit `9b71bba`, porque o notebook reiniciou, e eu fiz a validação de Doc delta por conta própria:
   - nenhum documento é devido, porque `SPEC-011 §3/§4` e `ADR-050/D2/D3` + `E-1`/`E-4` já descrevem os 3 arquivos campo a campo;
   - `frontend/README.md` está vetado pela `G-M`;
   - não há decisão estrutural nova.

   **Ação:** o commit de fechamento da wave cita este relatório como o Doc delta da T-00.1.
2. **[WARNING] W2: o relatório da T-00.2 termina num `## make verify` vazio** (`gates/T-00.2-builder.md:98`). O veredito ficou coberto pelo verify da wave (`843ac8f`, log acima). Fica como registro de processo.
3. **[WARNING] W3: specifier de diretório não é julgado pela P1.** De `indicators/oi/probe.ts`, `import { c } from ".."` (ou `"../"`) resolve para `indicators/` mesmo. A camada é `indicators-root`, e a P1 não a julga: o resultado é **0 mensagens**, medido em disco.
   - **A fuga fica fechada por construção:** o barrel `indicators/index.ts` necessário para explorá-la é classificado como indicador `index`, e reexportar o catálogo dá **P1** nele (medido: `index.ts` sai com `[P1]`).
   - **O que não está bem:** a mensagem diz *"indicator `index`"*, o que confunde, e nenhum teste prende esse caso.
   - **Sugestão** para o `frontend-builder`, numa fase futura: tratar `indicators-root` como alvo P1 e acrescentar a sonda `..` no teste da regra (`frontend/eslint-rules/indicator-isolation.mjs:152-156`).
4. **[WARNING] W4: a ablação "lista lida do disco" só é visível com a sonda presente.** O caso é T3, e o builder o declarou em `gates/T-00.3-build.md`. A causa é estrutural: o disco de hoje *são* os 4 nomes, então nenhum teste puro distingue o literal do disco. O que segura o DoD 3 é o `pin`, e ele morde assim que um diretório novo existe (T2).
5. **[WARNING] W5: nenhuma linha no `docs/INDEX.md` para os artefatos da fase.** Os artefatos são a regra, o contrato, `gates/T-00.2-builder.md`, `gates/T-00.3-build.md`, `gates/W-F0-e2e-instavel.md` e este relatório. Os builders adiaram de propósito, para não colidir 3 worktrees, seguindo o precedente `a4eb5d7`. **Ação:** acrescentar uma linha no commit de fechamento da wave, sem reescrever linhas existentes.
6. **[WARNING] W6: o plano e as tasks citam "47 arquivos" da `wave/paineis-f05`, e hoje são 55.** Medição: `git diff --name-only master...wave/paineis-f05 -- frontend/ | wc -l` dá **55**, com a wave em `acce0b3` `[MEDIDO 2026-10-02]`. Os builders mediram 51 em `31fade6`. A interseção continua **vazia**, então o DoD 5 vale. O número do plano está velho; a fronteira, não.

**Nota sobre o card do `frontend-qa`.** O card diz que *"os testes do front não estão em portão nenhum"*, e isso está **desatualizado**. Hoje o `make verify` roda `test-frontend-app`, `test-frontend-charts`, `test-frontend-s1` e `test-frontend-s3` (seções nas linhas 19, 1028, 1395 e 1514 do log). Os 5 arquivos desta fase rodam dentro do portão.

**Nota de concorrência.** Durante esta QA apareceu na mesma worktree um `gates/W-F0-REVIEW.md` não rastreado, de outro agente. Não o toquei, e este commit leva só este arquivo. Minhas mutações foram feitas e revertidas antes de o arquivo aparecer, e todas as reversões voltaram ao verde. Mesmo assim, há uma ressalva: se o revisor também mutou a árvore no mesmo intervalo, uma mutação dele poderia ter coincidido com um teste meu. Nenhum resultado meu divergiu do esperado nem dos números dos builders.
