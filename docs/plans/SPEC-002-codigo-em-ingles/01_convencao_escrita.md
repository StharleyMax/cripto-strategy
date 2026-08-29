# Fase `01` — A convenção escrita, localizável e citável

**Componente:** `docs` · **Classe:** prospectivo · **Depende de:** — · **Cobre:** `PRD-002`/`U1`, `[Q1]` metade prospectiva, `[Q3]`
**Rev de ancoragem:** `master@5f4ece0` · **Fronteira:** **apenas arquivos de convenção. Nenhum arquivo sob `backend/` ou `frontend/` é renomeado, editado ou movido por esta fase.**

> **Como** agente ou humano que vai escrever a próxima linha de código deste repositório,
> **quero** encontrar a convenção de idioma e a lista do que fica em português num lugar canônico e grepável,
> **para que** eu não dependa de alguém ter colado a frase do owner no meu prompt.

---

## Itens

| # | item | requisito | alvo |
|---|---|---|---|
| `1.1` | Seção nova em **`CLAUDE.md`**, adjacente a *"Vocabulário fechado de componentes"* (linha 70), com a **tabela de fronteira de 12 linhas** de `PRD-002` §3.1, integral | `U1`, `[Q3]` (`SPEC-002` §2) | `CLAUDE.md` |
| `1.2` | A **exceção do vocabulário** escrita literal e grepável, com o rótulo `[DECISÃO-OWNER: 2026-08-29, escolha entre alternativas apresentadas]` | `PRD-002` §3.3 | `CLAUDE.md` |
| `1.3` | A frase *"idioma de identificador é convenção, não portão"* **junto com o gatilho de reabertura** de `ADR-013/D2e` (glossário sob `glossary_doc` **mais** lista de vocabulário de biblioteca) | `RN-4` | `CLAUDE.md` |
| `1.4` | **Linha 10 da tabela resolvida:** evento de log e chave de `extra={}` nascem **em inglês**, prospectivamente, com o rótulo `[INFERRED: aplicação de ADR-013/D3 linha 1 a superfície não enumerada]` — **e a nota de que os 4 existentes NÃO são renomeados nesta SPEC** | `[Q1]` metade prospectiva (`SPEC-002` §6.1) | `CLAUDE.md` |
| `1.5` | **Linha 12 permanece `⏸ NÃO DECIDIDO`**, citando `[Q2]` e o dono (**owner**) | `SPEC-002` §7 | `CLAUDE.md` |
| `1.6` | `README.md` da raiz, §*"Idioma de docstring é convenção, não portão"* (linha 83): o título generaliza para **idioma de identificador** e o corpo **aponta para o `CLAUDE.md`** | `[Q3]`, metade ponteiro | `README.md` |
| `1.7` | **Uma linha nova** em `docs/INDEX.md` registrando a convenção e a correção de uma linha da tabela da `ADR-013` (`ADR-015/D3`) | `RN-2`, `[GAP G4]` | `docs/INDEX.md` |

**⛔ `1.6` é PONTEIRO, não cópia.** Nenhuma reprodução da tabela no `README`. Duas cópias divergem, e `PRD-002` §3.2 mede o custo de duas verdades sobre a mesma superfície.

---

## DoD — cada critério nomeia o comando e o universo

| # | critério | comando | esperado |
|---|---|---|---|
| `CA-F1-1` *(c)* | a tabela de 12 linhas está integral em `CLAUDE.md` | `test -f CLAUDE.md` **e** `grep -c '^| ' CLAUDE.md` na seção nova | `rc=0` e **12** linhas de tabela |
| `CA-F1-2` *(c)* | a exceção é grepável, **literal** | `grep -F 'vocabulário fechado de componentes e todo caminho que dele deriva ficam em português' CLAUDE.md` | **1 linha, `rc=0`** |
| `CA-F1-3` *(c)* | o gatilho de reabertura está escrito | `grep -n 'glossary_doc' CLAUDE.md` | `rc=0`, **≥1 linha** |
| `CA-F1-4` *(c, dois lados)* | **nenhuma regra nasce** | `harness rules list --severity block` **antes** e **depois**, `diff` das saídas; **e** `git diff master -- harness.toml` | `diff` **vazio**, **7 regras** com os mesmos identificadores; e **zero** ocorrência da substring `[[rules.own]]` |
| `CA-F1-5` *(c)* | o `README` aponta e **não copia** | `grep -c 'CLAUDE.md' README.md` → **≥1**; **e** `grep -cF 'vocabulário fechado de componentes e todo caminho que dele deriva' README.md` → **0** | as **duas** metades |
| `CA-F1-6` *(c, dois lados, **sobrevive à feature**)* | **medidor de erosão da exceção** | `git ls-tree -r --name-only <rev> \| grep -E '^(backend/src\|backend/tests\|frontend/src)/' \| awk -F/ '{for(i=1;i<NF;i++) print $i}' \| sort -u \| grep -vxE 'sentimento\|charts\|convergencia\|backtest\|web\|docs'` | **14 segmentos**, dos quais **exatamente 1 em português: `painel`**. Depois de `03`: **13, zero português** |
| `CA-F1-7` *(c)* | `docs/INDEX.md` **cresce, não muda** | `git diff --numstat master -- docs/INDEX.md` | **`N  0  docs/INDEX.md`** — **zero linhas removidas.** Qualquer `-` reprova |
| `CA-F1-8` *(d)* | **nada de código foi tocado** | `git diff --name-only master... -- backend frontend` | **vazio** |
| `CA-F1-9` *(d)* | a árvore continua verde e **medida** | `make lint`; `make test` | `rc=0` nos dois. **`rc=3` reprova** — é "não mediu", não "passou". Esperado: **107 passed, 370 statements, 54 branches, 100%** |

**⚠️ `CA-F1-5` sem a segunda metade seria satisfeita por copiar a tabela nos dois lugares.** A metade `→ 0` é a que impede as duas verdades.

---

## O item que o `PRD-002` deixou como `[NÃO SEI]` e que esta fase resolve pela metade

**`CA-U1-5` do `PRD-002`** dizia: *"a convenção entra no contexto de builder, não só num documento que ninguém abre — `[NÃO SEI]` o mecanismo"*, e exigia que o critério fosse verificável por comando.

**Resolvido pela escolha de `[Q3]`, e o mecanismo tem nome:** `CLAUDE.md` é carregado **incondicionalmente** como *project instructions* pelo harness em toda sessão de agente. **Não há passo de injeção a construir** — a escolha do arquivo **é** o mecanismo. É por isso que `[Q3]` era decisão de enforcement e não de arrumação.

> **`[NÃO SEI]` que sobra, e não o disfarço:** eu **não** tenho comando que prove que um builder futuro leu a seção. `CA-F1-1`–`CA-F1-3` provam que ela **existe e é grepável**; a leitura é medida **por consequência**, em `CA-F1-6` (erosão de segmento) e no falsificador de `SPEC-002` §6.1 (contagem de eventos de log em português, hoje **4**, que não pode subir). **Presença é decidível; leitura não é.** Prefiro dizer isso a inventar um critério que pareça medir leitura.

---

## Falsificador desta fase

Rode a variante `D` de `ADR-013/D2a` **ao fim de cada fase seguinte**, e cite os **dois** marcos zero juntos, porque medem universos diferentes:

| marco | instrumento | universo | valor em `7af0e4f` |
|---|---|---|---|
| da `ADR-013` | variante `D` + glossário, sobre **declaração e nome de arquivo** | 237 identificadores/nomes | **27 acusados** — 19 `backend/tests` · 8 `frontend/src` · **0 `backend/src`** |
| do `PRD-002` | `ast`, **todo nome ligado**, nos 2 arquivos de `02` | 70 nomes ligados | **40 em português**, classificados à mão |

**A comparação entre fases tem de usar o MESMO instrumento dos dois lados.** Comparar 27 com 40 não mede nada — é a família que `SPEC-002` §0.1 documenta. **Se o número de achados do mesmo instrumento SUBIR entre duas fases aprovadas por `/qa` e `/review`, então a doutrina comprou nada** e a troca certa era aceitar 8% de falso positivo em `[AVISO]` — que é a alternativa que `ADR-013/D2` recusou com número.
