# `DR-11` fechado — e o e2e de pixel deixa de depender de quem lembra

**Alvo:** PR #220 (`c7e17fc`) + este commit · **Escopo:** `frontend/`, `Makefile`, `scripts/verify.sh`
**Origem:** [`design-review-painel-cvd.md` §REVALIDAÇÃO](design-review-painel-cvd.md) (`APPROVED 71/100`,
`DR-11` não-bloqueante) + `C1`, levantado por dois agentes em ciclos diferentes.

⛔ Figma não foi usado. ⛔ `backend/src` não foi tocado (havia agente na fase `05`).

---

## 1. O vão, como o revisor o demonstrou — e ele era real

O revisor mediu três coisas que este documento não repete de ouvido:

- `color-contrast.test.ts` **não** afere contra o valor que `createChart` recebe; afere contra
  `chartSurfaceTheme()`, **um elo acima**. Removido o `layout` de `chart-options.ts`, ele fica
  **verde** (`pass 16 · fail 0`).
- Quem reprovava o mutante era `chart-construction.test.ts`, por **`assert.match` sobre o
  texto-fonte** — mensagem sem nenhum `Received: "#ffffff"`, porque nenhum valor era computado.
- Plantado um sítio com o **`spread` que o próprio portão sanciona** (`{ ...chartConstructorOptions(…),
  layout: … "#FFFFFF" }`), **os dois portões de fonte ficaram verdes** e o defeito `DR-1` inteiro
  voltou à tela.
- Só `e2e/11-canvas-fundo.spec.ts` pegava — **e ele estava fora de `make verify`** (`Makefile:86`).

## 2. O que foi feito — quatro mudanças, nenhuma delas uma allowlist

1. **`chart-construction.test.ts`: a porta do `spread` fechada.** `bareCreateChartCalls` passa a
   rejeitar também a chamada que *cita* o construtor e depois **sobrescreve uma chave que o
   construtor possui**. As chaves são **derivadas em tempo de execução**
   (`Object.keys(chartConstructorOptions(1, 1))` → `width · height · layout · grid · timeScale`),
   nunca listadas: acrescentar uma chave ao construtor a torna inexprimível no sítio de chamada no
   mesmo commit.
2. **A asserção de VALOR, no lugar da regex.** Novo teste `DR-11` **constrói**
   `chartConstructorOptions(1, 1)` e compara `layout.background.color` com
   `chartSurfaceTheme().backgroundColor`. As duas `assert.match` sobre cor saíram — uma afirmação
   mais fraca sobre a mesma coisa é justamente o que foi acreditado. O scan de fonte que **fica** é
   o de *procedência* ("nenhum hex foi digitado aqui"), que valor nenhum responde.
3. **Os docstrings falsos, corrigidos.** `chart-theme.ts` e `color-contrast.test.ts` diziam medir
   "o valor que `createChart` recebe". `charts` **não pode importar `web`** (`ADR-003`/`D5.12`),
   então estruturalmente não pode ver a chamada — e agora dizem isso, nomeando quem mede cada elo.
   Instrumento que declara medir X e mede Y é a classe de defeito que produziu `DR-1`.
4. **Dois portões novos em `scripts/verify.sh` — 6 → 8.**
   - `test-frontend` (`C1`): as **quatro** suítes `node --test`, sem lista de exclusão.
   - `e2e` (`DR-11`): `make e2e`, o único portão que lê **pixel**.

## 3. `C1` — o número que o justificava, e o que ele virou

```bash
grep -rn 'node --test' scripts/verify.sh Makefile .git/hooks/pre-push   # ANTES: 0 linhas
```

`[MEDIDO 2026-09-03, reconfirmado 2026-09-12]` — **592 testes em 4 suítes** não estavam em portão
nenhum. Hoje:

| suíte | `n` | `[MEDIDO 2026-09-12]` |
|---|---|---|
| `test:app` | 181 | 181 pass · 0 fail |
| `test:charts` | 195 | 195 pass · 0 fail |
| `test:s1` | 105 | 105 pass · 0 fail |
| `test:s3` | 111 | 111 pass · 0 fail |

### `test:s1` — a exclusão foi considerada e RECUSADA, porque o defeito era real

Ela dava **97/105** por `store_parent_missing`, e o motivo não era "ambiente": `create_app` exige
**DOIS** diretórios-pai (`backend/src/main/__init__.py:261`) e a fixture pinava só um
(`INGEST_HEALTH_STORE_PATH`), deixando `QUARANTINE_STORE_PATH` no default `data/md/` — **que não
existe em checkout nenhum, nem no principal**. Consertado **na fixture**
(`ingest-health-query-http.test.ts`, uma linha de `env`), não contornado no portão: `97/105 → 105/105`.
Excluir teria congelado o defeito com um motivo escrito ao lado — a forma exata do `C5`.

### ⚠️ E o corpus de `data/` responde `rc=3`, nunca `rc=1`

**Nove** arquivos de teste leem o corpus não-versionado (`grep -rln 'data/binance\|data/snapshots'
frontend/src --include='*.test.ts'` → 9). Sem ele, `test:charts` reprova 16 e `test:app` 1, **por
ambiente**. O portão checa a precondição **antes** e recusa com **`rc=3` ("NÃO MEDIU")**, que o
`verify.sh` já não trata como passar. É a mesma semântica que `lint-frontend` usa para
`node_modules` ausente.

> ⚠️ **Correção do registro:** a §REVALIDAÇÃO anotou `test:charts` em `c7e17fc` como
> `pass 171 · fail 16`, "pré-existentes, não desta PR". **As 16 são artefato de worktree, não
> falha pré-existente** — com `data/` presente a suíte dá **195/195**
> `[MEDIDO 2026-09-12, n=195]`. O revisor rodou num worktree, e worktree não tem `data/` porque
> `data/` é gitignored. A conclusão dele ("não é regressão desta PR") continua certa; a causa era
> outra.

## 4. MORDE — a prova, e ela é a do próprio revisor, repetida contra o portão novo

Replantado o `#FFFFFF` **pela porta do `spread`**, no sítio de produção real
(`SymbolClient.tsx:203`), na forma que **passava** em `c7e17fc`:

```tsx
const chart = createChart(container, {
  ...chartConstructorOptions(container.clientWidth || 600, CHART_HEIGHT_PX),
  layout: { background: { type: ColorType.Solid, color: "#FFFFFF" }, textColor: "#191919" },
});
```

O mutante **passa no ESLint e no `tsc --noEmit --strict`** — é uma mudança de aparência legítima,
que é o que a torna perigosa. `bash scripts/verify.sh` com ele plantado:

```
[FALHA    ] test-frontend   rc=1   (app/symbol/SymbolClient.tsx line 203: createChart(container, { ...chartConstructorOptions(…), layout: … "#FFFFFF" … }))
[FALHA    ] e2e             rc=1   1 failed — Expected: "#131722" · Received: "#ffffff"
veredito: VERMELHO — algum portão mediu e REPROVOU
```

`[MEDIDO 2026-09-12, n=1 mutante; e2e: 12/12 canvases em `#ffffff`, `canvas_modal_colors` da
E2E-FACT]` — **dois portões de `make verify` reprovam onde antes zero reprovava.** Mutante
revertido em seguida (`git diff --stat frontend/src/app/symbol/SymbolClient.tsx` ⇒ vazio).

## 5. O preço, declarado — porque ele era o argumento que mantinha o e2e fora

`[MEDIDO 2026-09-12: make e2e → rc=0, 49 s de relógio, 27 specs, 12 canvases]`. O comentário do
alvo `e2e` dizia *"+~35 s por verify"*; o número real é **~49 s**. ⛔ **Sem variável de pulo** —
`SKIP_E2E=1` seria a porta que `DR-11` acabou de fechar, reaberta no nível do portão. Ambiente
ausente (venv, `node_modules`, porta ocupada) responde **`rc=3`**, que não é passar.

**Efeito colateral achado e pago no mesmo ciclo:** `shot()` escrevia dentro de
`docs/context/camada-de-leitura-do-painel/gates/e2e-shots/`, **versionado** — a primeira rodada
gatilhada deixou **4 PNGs modificados e 1 novo** depois de um verify verde. Um portão que reescreve
arquivo commitado produz sujeira que ninguém autorizou e que alguém commita por acidente. `SHOTS_DIR`
passa a ser **efêmero por padrão**, com `E2E_SHOTS_DIR` para quando um relatório precisar das
imagens — mesma forma que `FACTS_FILE` logo abaixo dele já usava.

## 6. O que este documento NÃO fecha

`DR-4` · `DR-5` · `DR-6` (parcial) · `DR-7` · `DR-8` · `DR-9` · `DR-12` seguem no roteiro da
§REVALIDAÇÃO, inalterados. `DR-11` era o item 1 daquele roteiro; os outros continuam onde estavam.
