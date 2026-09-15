# Code-review da PR #222 — ciclo 2 (commits novos após `75c0aea`)

**Veredito: NON_COMPLIANT** — 1 `[BLOCKER]`, 1 `[WARNING]`, 2 `[INFO]`.

- **Universo:** `git diff 75c0aea..HEAD`, cabeça `c35caa5`. Commits auditados: `8352e69`,
  `0f35cae`, `53fdad5`, `038b774`, `c35caa5`. O COMPLIANT anterior em `75c0aea` **não foi refeito**.
- **Denominador mecânico:** **8** regras bloqueantes em vigor (`harness rules list --severity block`),
  **8 avaliadas**, **0 violadas**. Varredura: `git diff --name-only 75c0aea..HEAD | grep -E '\.(py|ts|tsx|yml)$'`
  → **10 arquivos de código**, cada um por `harness rules --mode file --path <f>`.
- **Laudos fechados, não reabertos:** `gates/T-03.5-T-03.6-design-review.md` (APPROVED 82/100),
  `gates/T-03.5-T-03.6-A-4.2-decisao-limiar.md`.

---

## `[BLOCKER-1]` O guarda de `FR-2` AFROUXOU — ele cala sobre o floor de bucket em duas etapas, onde o padrão antigo mordia

`frontend/src/app/symbol/bucket-arithmetic-boundary.test.ts:70-77` — `ADR-003`/`FR-2`
(`docs/adr/ADR-003-fronteira-charts-web.md:37`: *"impede a segunda implementação da grade canônica,
que é o modo de falha em que a tela e o motor discordam sobre o que aconteceu"*).

O commit `0f35cae` trocou `/Math\.floor\s*\(/` por dois braços:

```
/Math\.floor\s*\([^\n]*_MS\b/          # largura de grade NOMEADA
/Math\.floor\s*\([^\n]*\)\s*\*/        # quociente MULTIPLICADO DE VOLTA
```

**A afirmação do builder é falsa sobre o INSTRUMENTO, não sobre a operação.** O docstring
(`:61-63`) argumenta que o floor sobre a grade *"cannot be written without leaving one of two
fingerprints"*. A operação, talvez; **a varredura, não** — ela é linha a linha
(`:85`, `source.split("\n")`), então o braço de multiply-back só enxerga o `*` **na mesma linha**.
Escrito em duas etapas, com largura LITERAL, o floor escapa aos dois braços:

```ts
const bucketIndex = Math.floor(instantMs / 300_000);   // nenhum `_MS`, nenhum `*` nesta linha
return bucketIndex * 300_000;                          // nenhum `Math.floor` nesta linha
```

Isto **é** a segunda implementação da grade canônica: toma um instante e devolve um instante sobre
a fronteira do bucket. É também a forma mais natural quando o quociente é reusado.

**`[MEDIDO 2026-09-15]`, mutação replantada por este review em módulo de produção
(`frontend/src/app/symbol/panel-status.ts`) e revertida — `git status --porcelain` vazio depois:**

| mutação replantada | `npm --prefix frontend run test:app` | padrão antigo |
|---|---|---|
| duas etapas, largura literal (acima) | **`pass 203 / fail 0` — FR-2 VERDE, guarda SILENTE** | mordia |
| uma linha, `Math.floor(instantMs / 300_000) * 300_000` | `pass 202 / fail 1` — FR-2 reprova | mordia |

A segunda linha prova que o braço de multiply-back funciona **e** que a primeira mutação é o caso
que distingue: o guarda não está quebrado, está **furado exatamente na forma que o padrão anterior
cobria**. A lista `MORDE` (`:98-108`) não carrega essa forma — a ausência dela é o que deixou o
furo passar pelo próprio falsificador do commit.

⚠️ **Não há defeito vivo hoje:** a varredura de `FR-2` está verde sobre a produção real e nenhum
módulo de `src/app/symbol/` escreve aritmética de bucket. O que regrediu é a **força do portão**.

**Correção concreta, e ela foi validada por este review** — um 3º braço ancorado na ESCALA do
divisor, porque toda largura de grade em ms é `>= 60_000` e `formatSpan` divide por `1_000`/`60`/`3_600`:

```ts
// divisor de escala de BUCKET (>= 60_000 ms): pega o floor em duas etapas que os dois
// braços atuais deixam passar, e cala sobre a decomposição de span do A-4.1.
{ pattern: /Math\.floor\s*\([^\n]*\/\s*(?:[6-9]\d|\d{3,})[\d_]*(?:_\d{3})*\b/, why: "…" }
```

`[MEDIDO 2026-09-15]`: a regra de escala morde as **3** formas em duas etapas
(`/ 300_000`, `/ 60000`, `/ 300_000` reusado) e cala sobre as **4** linhas de `formatSpan`
(`/ 1_000`, `/ 60`, `/ 3_600`, `% 3_600 / 60`). Alternativa equivalente: varrer `source` inteiro em
vez de linha a linha, para o braço de multiply-back sobreviver à quebra de linha.
**Em qualquer das duas, acrescente a forma de duas etapas à lista `MORDE`** — sem isso o próximo
afrouxamento repete este.

✅ **O que o builder acertou e este review confirma:** recusar mover `formatSpan` para fora do
alcance da varredura foi correto — seria bypass silencioso. O problema não é a intenção, é que o
padrão escolhido paga essa recusa com cobertura.

---

## `[WARNING-1]` `core.module-docstring-single-line` em 2 arquivos — herdado do merge, fora dos commits novos

`backend/src/modules/sentimento/infra/collectors_cli.py:1` e
`backend/src/modules/sentimento/infra/grid_aligned_ticker.py:1` — regra
`core.module-docstring-single-line`, severidade **`[AVISO]`**, **não** bloqueante (não consta das 8
de `harness rules list --severity block`). Ambos entraram pelo merge `c35caa5` (master, PR #217),
**nenhum** commit novo desta PR os tocou. Registrado para não ser lido como achado desta PR.

---

## O que foi verificado e está CORRETO

**1. `lastReadableAvailableAtMs` não tem caminho de volta para `max(available_at)` — confirmado.**
`frontend/src/app/symbol/view-model.ts:456-465` elege a linha pelo **maior `event_time`** e só então
lê o `available_at` **daquela** linha. `grep -rn 'Math\.max' frontend/src/app/symbol/*.ts *.tsx`
(sem testes) → **1 ocorrência**, e é o clamp de `formatSpan` (`SymbolClient.tsx:561`), não uma
agregação sobre `available_at`. `resolveFreshnessVerdict:526` tem **um único** produtor de
`observedMs`, que é esta função. A distinção está escrita no código (`:440-442`), não só no commit.

**2. `docs/INDEX.md` — append-only preservado no merge add/add `c35caa5`.**
`git diff c35caa5^1 c35caa5 -- docs/INDEX.md | grep -cE '^-[^-]'` → **0**;
contra `c35caa5^2` → **0**; no range inteiro `75c0aea..HEAD` → **0 removidas, 7 acrescentadas**.
Os registros dos dois lados sobreviveram (3 de `O4`/`D16`, 2 do fix da PR #217, 1 dos gates da #222,
1 do `A-4.2`), intercalados por data sem reescrita de linha existente.

**3. Idioma — conforme a tabela de fronteira do `CLAUDE.md`.**
Identificadores novos de produção em inglês (`lastReadableAvailableAtMs`, `referenceMs`,
`formatSpan`, `bucketStartMs`) — linha 1. Docstrings e comentários novos em inglês — linha 5.
Microcopy de operador em pt-BR (`"Última leitura há … em relação ao fecho da janela"`,
`"⚠️ Mais velha que o teto — o valor acima é DADO VELHO."`) — **linha 8**, fora do universo do
inglês por remissão. Nenhuma violação.

**4. `V-1` — o guarda MORDE, replantado por este review, não presumido do commit.**
Repondo o ` UTC` duplicado em `SymbolClient.tsx:528` → `pass 202 / fail 1`, e o teste que reprova é
`V-1: the ` UTC` suffix is printed ONCE …` (`oi-pane-dom-contract.test.ts`). Revertido → árvore
limpa. O conserto está no REPETIDOR e não no formatador, que é o lado certo: os outros 4 chamadores
(`:370`, `:481`, `:636`, `:771`) nunca repetiram o sufixo.

**5. Higiene de commit — `[MEDIDO]`.** `git log --format='%B' 75c0aea..HEAD | grep -ci 'co-authored-by'`
→ **0**. Autor e committer de todos os commits do range: `Stharley Maxwell <stharleymax@gmail.com>`.

---

## `[INFO]`

- **`[INFO-1]`** `8352e69` e `53fdad5` são docs-only (`298` e `184` inserções, 1 arquivo cada,
  zero código) — nada a auditar além de existirem.
- **`[INFO-2]`** O teste `both arms of the floor guard are load-bearing` (`:117-135`) é boa prática e
  faz o que promete — prova que nenhum braço é decoração do outro. Ele **não** é afetado por
  `[BLOCKER-1]`: provar que 2 braços são independentes é ortogonal a provar que os 2 juntos cobrem
  a superfície. Ao aplicar o 3º braço, o `assert.equal(arms.length, 2)` (`:123`) precisa ser
  reancorado para `3`, como o próprio comentário dele manda.

---

## Como reabrir

`[BLOCKER-1]` fecha quando a mutação de duas etapas com largura literal, replantada em módulo de
produção de `frontend/src/app/symbol/`, fizer `npm --prefix frontend run test:app` devolver `rc=1`
pelo teste `FR-2` — e a forma estiver na lista `MORDE` do próprio arquivo.

**Este review é read-only:** nenhuma linha de código foi alterada, nenhum teste criado; as 3
mutações foram revertidas e `git status --porcelain` devolveu vazio após cada uma. Nenhuma escrita
no ledger além do `gate-record` deste veredito.
