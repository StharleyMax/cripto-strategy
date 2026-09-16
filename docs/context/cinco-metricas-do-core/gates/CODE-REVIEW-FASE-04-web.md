# Code review — código de `web` da fase `04` (painel de long/short)

**Data:** 2026-09-16 · **Componente:** `web` · **Feature:** `cinco-metricas-do-core`
**Universo exato:** `git diff 0e2a079..da2ef79 -- frontend/` — 2 commits de código: `db2302c`
(`T-04.5`, estrutura + `data-testid`) e `fa16c15` (implementação do design Rev. 3 aprovado).
**Auditor:** `/review` (read-only por desenho). **Este arquivo foi escrito pelo orquestrador** — o
auditor não gera arquivo de relatório; o corpo abaixo é o laudo dele, transcrito com os comandos.
**Ledger:** intocado por esta auditoria.

---

## 1 · Veredito

✅ **`COMPLIANT`** — nenhuma regra bloqueante violada.

**O denominador, antes do número** (`ADR-012`): são **8** regras bloqueantes em vigor
(`harness rules list --severity block`), e **apenas 1 delas alcança `.ts`/`.tsx`** —
`web-fullstack.browser-imports-server`, `paths=["frontend/src/**"]`. As outras 7 são `**/*.py`,
`backend/**/*.py`, path-presence de repo ou de compose
`[DOC: packs/core/rules.toml:13-52, packs/web-fullstack/rules.toml:11-45]`. **Dizer "8 de 8
avaliadas" sem isto seria inflar o portão**: 7 delas não podiam morder este diff.

```bash
harness rules --mode file --path <f>      # 14 arquivos varridos -> 0 achados
harness rules --mode sweep --severity block  # 0 bloqueios (só [AVISO] pré-existentes)
npx eslint src/app/symbol/                # rc=0
npx tsx --test <5 módulos novos>          # 67/67 pass
```

## 2 · Verificado e limpo

| o quê | evidência |
|---|---|
| **`ADR-034/D8`** (fronteira `charts` ↔ `web`) | único import é o barrel `"../../charts/index.ts"` (`SymbolClient.tsx:83`); nenhum import profundo. `axis-fidelity.test.ts:70` reimplementa em vez de importar, deliberadamente |
| **`RN-1`, sem carry-forward** | `value !== null` distingue ausência; nenhuma substituição por `0`. Backend confirma `Nature.RATIO: False` (`as_of_accessor.py:115`). O `0` literal em `SymbolClient.tsx:1786` é guardado por `!hasObservation` (`:1906`) — **fato do estado, não fabricação** |
| **Idioma** | as 4 mensagens de exceção do diff estão em inglês; o falsificador de diretório do `CLAUDE.md` roda **22 segmentos, 0 em português** (`painel` → `panel` já feito), contra o baseline documentado de `14/1` |

## 3 · Achados — 1 `WARNING`, 3 `INFO`, nenhum bloqueante

### 3.1 `[WARNING]` A cadência nativa está literal na tela, e a API a serve

`SymbolClient.tsx:1507,1582,1786,1877` escrevem `5 min`/`5m` como literal, enquanto
`GET /api/v1/series-catalog` devolve `key.interval` e `nativeGrid` **por entrada** (conferido com
`curl`).

⛔ **É a classe que o próprio arquivo declara**, 200 linhas acima: `SymbolClient.tsx:311-314` carrega
`unit` do catálogo *"because a literal would be free to drift from what the backend published"*
`[DOC: gates/design-01.md §W-1]`. **Correção:** carregar `interval`/`nativeGrid` em
`LongShortPaneData`, como já se faz com `unit`.

⚠️ **Precedente pré-existente:** a fase `03` já faz isso em `:889` (`OiPane`). **O diff replica um
vício, não o inaugura** — o que muda o dono do conserto, não a sua validade.

### 3.2 `[INFO]` Divisão sem guarda de divisor, e a irmã 8 linhas abaixo tem

`SymbolClient.tsx:1693` (`windowStats.amplitude / windowStats.median`) contra `:1701`, que guarda
explicitamente contra `Infinity%`/`NaN%` com o comentário *"a screen whose whole subject is not
publishing numbers nobody measured"*. `median === 0` é degenerado nesta série — **a assimetria é
que é real**. Correção: estender a mesma guarda ao divisor.

### 3.3 `[INFO]` Duplicação — resposta à pergunta, sem regra violada

4 famílias paralelas `*ReadableHorizon` (`:878,1034,1304,1495`) e 2 `*Provenance` (`:1197,1591`).
**Divergem em fatos reais** (`LiquidationProvenance` publica `publishedError`, `LongShortProvenance`
não tem segunda fonte) e nos prefixos `data-fact` que os contratos de DOM e o e2e selecionam.
Não reportado como violação.

### 3.4 `[INFO]` Nome de arquivo do e2e em português — registro, não acusação

`frontend/e2e/14-long-short-dado-real.spec.ts` contraria a linha 3 da tabela de fronteira
(*"nome dos arquivos"*), **mas `frontend/e2e/` está fora de `code_paths.include_prefixes`** e o nome
segue 5 irmãos precedentes (`08-symbol-dado-real` … `13-liquidacoes-dado-real`). **Idioma de
identificador é convenção, não portão** (`CLAUDE.md`) — registrado para não sumir, não acusado.
