# ADR-015 — O verificador de âncora tem **token tipado**, e citação VIVA se define por **obrigação em vigor**, não por executabilidade

**Status:** `aceito` · **Data:** 2026-08-29 · **Aceita em** 2026-08-29 pelo owner
> **Por que passou a `aceito`, e o motivo é o próprio critério desta casa:** ela estava `proposto`
> **enquanto já gateava `CA-F2-4` e `CA-F3-4` de uma SPEC APROVADA** — documento `proposto`
> sustentando critério de aceite de SPEC aprovada é a mesma contradição texto × ledger que o
> `CLAUDE.md` proíbe. O `/tech-lead` achou a contradição e **recusou decidir sozinho**, o que
> estava certo: mudar o status de uma ADR não é ato de quem quebra tasks. Levada ao owner com
> as alternativas e o custo de cada uma; ele escolheu aceitar.
> `[DECISÃO-OWNER: 2026-08-29 — escolha entre alternativas apresentadas, NÃO citação literal]`

**Data original:** 2026-08-29 · **Componente:** `docs` · **Feature:** `codigo-em-ingles`
**Autor:** `/architect` (segundo desta trilha — a `ADR-013` é de outro, está `aceito` e **não é reaberta aqui**)
**Rev de ancoragem de TODA medição:** **`master@5f4ece0`** · **Substitui um número e uma linha da `ADR-013`; não substitui nenhuma decisão dela.**
**Insumos:** [`ADR-013`](ADR-013-codigo-em-ingles-convencao-com-fronteira-e-sem-portao.md) (`aceito`) · [`ADR-011/D4`](ADR-011-o-portao-sai-do-harness-e-vai-para-o-make.md) · [`ADR-012/D4`](ADR-012-o-portao-de-shell-e-o-make-nao-o-code-paths.md) · [`PRD-002`](../specs/PRD-002-codigo-em-ingles.md) §12 · `CLAUDE.md`

> **Por que uma ADR e não uma nota na SPEC:** as três decisões abaixo fecham alternativas que o `PRD-002` deixou abertas ou descreveu com uma regra que **não descreve a própria lista dele**, e **uma delas corrige uma linha da `ADR-013`**. Corrigir uma ADR `aceito` por dentro de uma SPEC esconderia a correção de quem for ler a ADR.

---

## Contexto

O `PRD-002` §12 propõe um **verificador de âncora viva** — não um detector de idioma (a `ADR-013/D2` mediu que idioma não é decidível por comando, e nada aqui reabre isso). Ele decide **igualdade de string sobre conjunto enumerado**: para cada nome antigo de uma renomeação, nenhuma ocorrência sobrevive no conjunto de arquivos **VIVOS**.

Eu apliquei o teste de dois lados ao mecanismo dele **com corpus de retenção que ele não escolheu**, que é a armadilha que a própria `ADR-013/D2b` documentou (0/29 falso positivo no corpus de ajuste, **7/88 no de retenção**, incluindo `oi` com 286 ocorrências).

### O que o mecanismo do `/pm` acertou — e eu confirmo em bancada própria

A bancada dele mediu **3** tokens (`Filtro.tsx`, `painel/`, `configPainel`). Eu medi os **4 que ele nunca mediu** e que a própria `CA-U3-4` exige (`rotas.ts`, `formatar-percentual.ts`, `ROTAS`, `formatarPercentual`), sobre árvore extraída de `5f4ece0`:

```
$ git archive 5f4ece0 | tar -x -C "$B"
$ check_anchors.sh "$B" 'rotas.ts' 'formatar-percentual.ts' 'ROTAS' 'formatarPercentual'
[ANCORA MORTA] 'rotas.ts'            1 ocorrência   frontend/src/components/ui/formatar-percentual.ts:4
[ANCORA MORTA] 'formatar-percentual.ts'  1          docs/context/plataforma-dados/tasks.toml:234
[ANCORA MORTA] 'ROTAS'               2              frontend/src/app/rotas.ts:14,18
[ANCORA MORTA] 'formatarPercentual'  1              frontend/src/components/ui/formatar-percentual.ts:9
rc=1
```

`[MEDIDO 2026-08-29 em 5f4ece0, n=4 tokens / 5 ocorrências, TODAS âncoras legítimas — zero falso positivo]`

E, depois da renomeação atômica executada na bancada, o lado **CALA** sobre os **7** tokens de `CA-U3-4`:

```
$ check_anchors.sh "$B" 'Filtro.tsx' 'painel/' 'rotas.ts' 'formatar-percentual.ts' \
                        'configPainel' 'ROTAS' 'formatarPercentual'
rc=0
$ grep -n 'resultado serve' "$B/frontend/src/features/panel/Filter.tsx"
10:  return <p>Filtro: any resultado serve</p>;        ← a evidência SOBREVIVEU
$ grep -n 'any' "$B/frontend/src/features/panel/config.ts"
8:export const panelConfig = { retry: 3, any: true };  ← a outra metade SOBREVIVEU
```

`[MEDIDO 2026-08-29, bancada sobre árvore extraída de 5f4ece0; MORDE 31 ocorrências em 7 tokens / rc=1, CALA 0 / rc=0]`

> **⇒ Veredito sobre o mecanismo: ele NÃO cai na armadilha da `ADR-013/D2b`.** Ele passa nos dois lados sobre corpus que o autor dele não escolheu, e passa **com a evidência intacta** — que é a condição que um verificador ingênuo violaria. **O mecanismo é adotado.**

### O que ele errou — e é a regra de seleção, não o mecanismo

**O `PRD-002` §12.2 conclui:** *"O token do verificador é o **CAMINHO**, nunca a palavra."*
**A lista que ele de fato usa em `CA-U3-4`** é `Filtro.tsx`, `painel/`, `rotas.ts`, `formatar-percentual.ts`, **`configPainel`**, **`ROTAS`**, **`formatarPercentual`**. **Três dos sete não são caminho — são identificadores.** A regra escrita não descreve a lista escrita, e é a regra que uma task futura vai citar.

**O custo de a regra estar mal escrita, medido.** Alimentei o verificador com os **5 tokens que `CA-U3-4` omite** — `Filtro`, `Rota`, `razao`, `casas`, `sinal` — sobre a árvore **já corrigida** (corpus de retenção puro):

| token | falso positivo | onde |
|---|---|---|
| `razao` | **3** | `tasks.toml:20,132,269` — a palavra *"a razão"* em prosa portuguesa |
| `casas` | **4** | `backend/README.md:1130` (*"casasse"*), `tasks_review.md:285` (*"8 casas"*), `:786`, `handoff_to_architect.md:290` |
| `sinal` | **11** | `README.md:203`, `backend/README.md:656`, `tasks_review.md` ×2, `tasks.toml` ×2, `handoff_to_architect.md` ×5 — *"limiar de sinal"*, *"inverte de sinal"* |
| `Filtro` | **2** | `frontend/README.md:250` e `Filter.tsx:10` — **as duas são a evidência que `CA-U3-2` obriga a preservar** |
| `Rota` | 0 | — |

`[MEDIDO 2026-08-29, corpus de retenção = árvore corrigida em bancada, n=5 tokens → **20 falsos positivos**]`

**E a confirmação pelo lado do caminho, num corpus que ninguém tinha varrido:** o token-palavra `painel` casa **34 arquivos**; o token-caminho `features/painel` casa **9**. As ~25 diferenças são vocabulário de **produto** — *"o painel de OI"*, *"cabeçalho do painel de preço"* — em `docs/product/STITCH_CONTEXT.md` (18), `docs/plataforma-superficies-e-faseamento.md` (27), `scripts/validate_palette.js`, `scripts/verify_screen.py`, `docs/plans/…/05_fatia_visivel.md`. **Nenhuma delas é âncora de caminho, e nenhuma deve mudar.**

```
$ git grep -l -F 'painel'         5f4ece0 -- . | wc -l    # 34
$ git grep -l -F 'features/painel' 5f4ece0 -- . | wc -l    # 9
```

`[MEDIDO 2026-08-29 em 5f4ece0]` · **Isto reconfirma a variante 2 recusada pelo `/pm`, sobre corpus que ele não escolheu, e com um fator de 3,8× em vez do fator dele.**

---

## Decisão

### D1 · O token do verificador é **TIPADO**, e o tipo decide o **ESCOPO** — não existe token sem tipo

A regra *"caminho, nunca palavra"* é falsa como escrita e insuficiente como critério. A regra correta tem **duas** colunas, e a segunda é a que faltava:

| tipo do token | como se reconhece, mecanicamente | escopo em que o verificador o procura |
|---|---|---|
| **CAMINHO** | contém `/` **ou** termina em extensão (`\.[A-Za-z0-9]{1,4}$`) | **conjunto VIVO integral** — `harness.toml`, `README.md`, `backend/README.md`, `frontend/README.md`, `docs/context/`, `backend/src`, `backend/tests`, `frontend/src` |
| **IDENTIFICADOR** | tudo o mais | **apenas diretórios de código** — `backend/src`, `backend/tests`, `frontend/src` |

**Por que o escopo é o que resolve, e a medição é esta.** Os mesmos 5 tokens que produziram 20 falsos positivos no escopo integral, medidos no **escopo de código**, sobre a árvore corrigida:

```
ROTAS n=0 · Rota n=0 · razao n=0 · casas n=0 · sinal n=0 · configPainel n=0 · formatarPercentual n=0
Filtro n=1   frontend/src/features/panel/Filter.tsx:10  ← o texto JSX, a evidência
```

`[MEDIDO 2026-08-29, árvore corrigida em bancada: 20 FP → **1**, e o 1 é estrutural, não acidental]`

E o lado MORDE do mesmo escopo, na árvore intacta: `ROTAS` 2 · `razao` 3 · `casas` 2 · `sinal` 2 — **todas âncoras legítimas.** `[MEDIDO 2026-08-29 em 5f4ece0]`

> **⇒ Identificador é objeto de código e só existe em código.** Procurá-lo em prosa portuguesa é procurar um objeto onde ele não mora — e a prosa deste repositório é **densa nas mesmas palavras**, porque os identificadores foram tirados dela. O escopo não é otimização: é a diferença entre 20 FP e 1.

**A exceção nomeada, e ela é fechada em 1 elemento hoje:** um token cuja forma antiga sobrevive **dentro de evidência protegida** (`PRD-002` §5.3) é **inadmissível em qualquer escopo** e é verificado por outro mecanismo. **Hoje esse conjunto é `{Filtro}`, e nenhum outro** — porque `<p>Filtro: any resultado serve</p>` é o payload da bancada `D1.3b` e `CA-U3-2` obriga a preservá-lo. Um segundo elemento nesse conjunto é sinal de que a fronteira entre continente e conteúdo (`PRD-002` `RN-3`) parou de ser uma linha.

### D2 · Cada token é medido nos **dois lados individualmente**. Um `rc=0` agregado sobre 7 tokens não é evidência de 7 tokens

`CA-U3-4` pede **um** `rc=0` sobre **sete** tokens. **Um token com zero ocorrências no lado MORDE contribui `rc=0` em silêncio e é indistinguível de um token que passou** — um token errado de digitação, ou um nome que já não existia, some dentro do verde do agregado. É o **terceiro significado de `rc=0`** que a `ADR-012` nomeou (*"barato de cometer e caro de detectar"*), agora dentro do instrumento construído para caçá-lo.

**Hoje o risco é latente, não presente** — os 7 têm todos MORDE ≥ 1:

| token | MORDE (n de ocorrências, `5f4ece0`) |
|---|---|
| `Filtro.tsx` | 8 |
| `painel/` | 17 |
| `rotas.ts` | 1 |
| `formatar-percentual.ts` | 1 |
| `configPainel` | 1 |
| `ROTAS` | 2 |
| `formatarPercentual` | 1 |
| **total** | **31** |

`[MEDIDO 2026-08-29 em 5f4ece0, escopo por tipo conforme D1]`

**Decisão:** o DoD de qualquer fase que use o verificador declara, **por token**, o `n` do lado MORDE medido no rev de ancoragem **antes** da renomeação, e exige `0` **por token** depois. **Um token com MORDE `n=0` reprova a fase na hora em que é declarado** — não porque a árvore esteja errada, mas porque o token está.

### D3 · Citação **VIVA** é a que uma **obrigação em vigor** manda alguém re-executar. Não é "é executável" — e por isso o **plano `01` é HISTÓRICA**, corrigindo a `ADR-013`

**A divergência:** `ADR-013` classifica `docs/plans/SPEC-001-plataforma-dados/01_governanca_gateante.md` como **VIVA** (*"é receita executável"*); `PRD-002` §5.2.1 o classifica como **HISTÓRICA** e devolve a decisão ao `/architect`. **Decido HISTÓRICA, e o argumento é medido e é novo — nenhum dos dois documentos o tem.**

**O que a linha realmente é.** `01_governanca_gateante.md:36` é o item de DoD `D1.3b`, e a coluna que cita `Filtro.tsx` nomeia um universo de **três** arquivos de bancada: `tipos.ts`, `config.ts`, `Filtro.tsx`. Medido na árvore de hoje:

```
$ for p in tipos.ts config.ts Filtro.tsx serie.tsx; do test -e "frontend/src/features/painel/$p" ...
frontend/src/features/painel/tipos.ts    NÃO EXISTE
frontend/src/features/painel/config.ts   EXISTE
frontend/src/features/painel/Filtro.tsx  EXISTE
frontend/src/features/painel/serie.tsx   NÃO EXISTE
```

`[MEDIDO 2026-08-29 em 5f4ece0]`

> **⇒ Um terço do universo que a linha nomeia NUNCA existiu como arquivo versionado, e não deve existir** — `tipos.ts` e `serie.tsx` são violadores **plantados por `printf` e removidos por `rm`** pela receita de `frontend/README.md` §3. **Se *"receita que nomeia arquivo inexistente é âncora morta"* fosse o teste, o plano `01` já seria âncora morta hoje, antes de qualquer renomeação.** Não é. ⇒ **o teste está errado**, e é o teste que a `ADR-013` usou para classificar a linha como VIVA.

**O critério que substitui, e ele é decidível:**

> Uma citação é **VIVA** quando **existe uma obrigação em vigor, nomeável, que manda alguém resolver aquele caminho contra a árvore de novo.** É **HISTÓRICA** quando o que ela registra é um veredito já dado sobre um rev já passado.

Aplicado, e a aplicação separa exatamente onde os dois documentos discordavam:

| citação | obrigação em vigor que a re-executa | classe |
|---|---|---|
| `harness.toml:145-150` | **sim** — `CA-U3-3` manda re-medir os quatro casos de `ADR-011/D4` depois do rename | **VIVA** |
| `frontend/README.md` (4 lugares) | **sim** — é o protocolo de reprodução que `CA-U3-3` executa | **VIVA** |
| `backend/README.md`, `tasks.toml`, `handoff_to_builder.md` | **sim** — instruem trabalho corrente | **VIVA** |
| `docs/plans/…/01_governanca_gateante.md:36` (`D1.3b`) | **não** — a fase fechou com `/qa APPROVED` e `/review COMPLIANT`, e **nenhum dos dois vereditos foi dado sobre `Filter.tsx`** | **HISTÓRICA** |
| `docs/INDEX.md`, `ADR-003`, `ADR-011`, `ADR-012`, `ADR-013`, `proposta-discovery.md`, `PRD-001` | não | **HISTÓRICA** |

**E a receita não morre**, que era a preocupação legítima da `ADR-013`: ela mora em `frontend/README.md`, em 4 lugares, com `printf`/`rm`, e esse arquivo é **VIVA nos dois inventários**. Atualizar o `README` mantém a receita executável; deixar a linha do plano preserva o registro do DoD. **Nenhuma âncora morre, nenhum registro é reescrito** — e `docs/INDEX.md` continua append-only, que é regra de `CLAUDE.md`.

> **O que muda na `ADR-013`, com precisão: UMA linha de UMA tabela.** A tabela *"VIVA × HISTÓRIA"* de `D3` move `docs/plans/…/01_governanca_gateante.md` de **VIVA** para **HISTÓRIA**, e a contagem dela passa de **5 vivas / 5 de história** para **4 / 6**. **Nenhuma decisão da `ADR-013` cai** — `D1`, `D2`, `D3` (a fronteira) e `D4` continuam de pé sem emenda, e a doutrina *"sem portão"* não é tocada por nada aqui. A `ADR-013` **não é editada**: ela é decisão datada, e esta linha é o registro da correção.

---

## Alternativas recusadas

| alternativa | custo medido que a recusa |
|---|---|
| **manter *"o token é o caminho, nunca a palavra"*** como está | a regra **não descreve a lista que o próprio `PRD-002` usa** — 3 de 7 tokens são identificadores. Uma task futura que a aplique ao pé da letra ou remove os 3 (e perde 4 âncoras reais, `n=4` medido) ou estende para palavras (**20 FP**, medidos) |
| **escopo integral para todo token** | **20 falsos positivos** sobre corpus de retenção, `n=5` tokens — e **2 deles são a evidência que `CA-U3-2` manda preservar**, o que torna o critério de aceite autocontraditório |
| **escopo de código para todo token** | perde a classe inteira de **âncora em documento**, que é a única que falha em silêncio (`PRD-002` §5.1, classe C). `Filtro.tsx` tem **8** ocorrências no conjunto VIVO e as **8 de 8** estão FORA de diretório de código — `frontend/README.md` 5 · `harness.toml` 1 · `handoff_to_builder.md` 1 · `tasks.toml` 1 `[MEDIDO 2026-08-29 em 5f4ece0: zero ocorrência em `backend/src`, `backend/tests` ou `frontend/src`]` |
| **allowlist de exceções por token** | é o bypass que `PRD-002` `RN-4` e `ADR-013/D2b` recusam — *"entrada de allowlist é indistinguível de bypass"* |
| **`rc` agregado sobre a lista de tokens** (o que `CA-U3-4` escreve hoje) | um token de MORDE `n=0` some dentro do verde. Custo hoje `0` (os 7 têm `n≥1`), custo amanhã **não medido e silencioso** — a definição de dívida que esta casa recusa |
| **classificar VIVA por *"é executável"*** (a leitura da `ADR-013`) | falsificada: o universo que `D1.3b` nomeia contém **`tipos.ts`, que nunca existiu** — o teste classificaria a linha como âncora morta **hoje**, sem rename nenhum |
| **editar a `ADR-013`** para corrigir a linha | ADR é decisão **datada**; reescrevê-la apaga o registro de que a leitura foi outra. Mesma razão pela qual `D3` recusa reescrever citação HISTÓRICA |

---

## Falsificador

**De `D1` — e ele mede o instrumento contra o autor, que é como esta regra já foi corrigida uma vez.**
A primeira versão desta regra que eu escrevi admitia também *"caixa alta integral com `len ≥ 4`"* como token seguro. **Ela foi falsificada pela minha própria bancada, e o token que a derrubou foi `UNIVERSO`:**

```
$ check_anchors.sh <escopo integral> 'UNIVERSO'
    docs/context/plataforma-dados/tasks.toml:267   "FECHADA 2026-08-29: /qa APPROVED …"
    docs/context/plataforma-dados/tasks.toml:274   "UNIVERSO RETROATIVO, re-medido nesta sessao …"
```

`[MEDIDO 2026-08-29: 8 ocorrências, 2 são a palavra em prosa portuguesa enfática, não o identificador]` · **Este repositório escreve português em caixa alta para dar ênfase**, e a caixa alta portanto não distingue identificador de prosa. `ROTAS` sobreviveu por acidente do corpus, não por propriedade do token. ⇒ **a condição caiu da regra, e `UNIVERSO` é verificado pelo `ast` de `CA-U2-2`, que é onde ele já estava.**

**⇒ O falsificador em vigor:** rode o verificador com um token do tipo IDENTIFICADOR **no escopo integral** e conte. Se o número de falsos positivos for **0** para um token que é palavra portuguesa comum, a separação por escopo é cerimônia e `D1` deve cair. **Hoje esse número é 20 sobre 5 tokens** `[MEDIDO 2026-08-29]`.

**De `D2`:** declare um token deliberadamente errado (ex.: `Filtr0.tsx`) na lista de uma fase. **Se a fase passar**, `D2` não está implementado — o agregado engoliu o token morto. **Se reprovar no ato da declaração**, `D2` está de pé.

**De `D3`:** se, depois de `U3` fechar, alguém precisar re-executar `D1.3b` do plano `01` **por obrigação nomeada** — não por curiosidade — então a linha era VIVA e a `ADR-013` estava certa. **O sintoma é observável e barato:** procure, nos artefatos das fases seguintes, um DoD que cite `01_governanca_gateante.md:36` como comando a rodar. **Hoje esse número é zero**, e `CA-U3-3` cita `frontend/README.md` §3 e `harness.toml`, não o plano.

---

## Consequência

- **`SPEC-002` reescreve `CA-U3-4` e `CA-U3-6` na forma tipada e de dois lados por token.** O mecanismo do `/pm` é **adotado sem emenda**; o que muda é a regra de admissão do token e a granularidade do `rc`.
- **`CA-U2-4` fica como está** — os dois tokens dela (`test_durabilidade_da_infra`, `test_etl_backlog_retomavel`) são snake_case compostos de 26 caracteres, tipo IDENTIFICADOR por `D1`, e **medidos no escopo integral eles produzem 0 falso positivo** (as 6 ocorrências fora dos 2 arquivos são as âncoras vivas que `CA-U2-4` já enumera: `backend/README.md` ×5, `jsonl_checkpoint.py` ×1) `[MEDIDO 2026-08-29]`. **Registro a exceção em vez de a esconder: para estes dois tokens o escopo integral é seguro, e é o escopo certo, porque as âncoras deles estão em `README`.** `D1` diz onde o verificador **procura por padrão**; uma fase pode ampliar o escopo de um token declarando o `n` do lado MORDE, que é o que `D2` obriga.
- **A `ADR-013` ganha uma correção de uma linha, registrada aqui e no `docs/INDEX.md`, e não é editada.**
- **Nenhuma `[[rules.own]]` nasce, nenhum alvo de `make` nasce.** O verificador **expira** com a renomeação (`PRD-002` §12.3) e vive **inline no DoD da fase** — `ADR-012/D5(b)`, falsificador nº 4: cerimônia permanente por benefício de duas tasks é o que esta casa recusa.
