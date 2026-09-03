# Parecer arquitetural — fronteira `web` × `sentimento` (consulta do owner, 2026-09-03)

**Ato:** parecer READ-ONLY pedido pelo owner. **Não é** validação de PRD, **não é** SPEC, **não** toca
`tasks.toml`, ledger, Jira, código nem `gate-record`. **Estado real no despacho:**
`harness pipeline state plataforma-dados` → **`BUILD_AUTHORIZED`** `[MEDIDO 2026-09-03]`.

**Base:** os 8 fatos de `handoff/consulta-fronteira-web-2026-09-03.md` (não remedidos, usados como dados),
mais o que este parecer mediu por conta própria — cada número com o comando e o `n`.

---

## Veredito em uma linha por pergunta

| | veredito |
|---|---|
| **P1** | **DIVIDIDO.** O espelho de `ingest_record.py` (`ingest-health-query.ts`) **NÃO** viola `ADR-008/D3` — é o instrumento que `DoD-2` **exige**. Mas os **outros 9** módulos são o caso que `ADR-003/D2` declarou `[NÃO SEI]` com gatilho, **e o gatilho DISPAROU**. Dona: `quant-architect`. |
| **P2** | **A pergunta está mal-posta e corrigi-la muda a resposta.** O plano **tem** a rota HTTP (item `5.12` → `T-05.9`) e o SSE (item `8.8` → `T-08.11`), **os dois `done`** — fechados com **apenas a metade CLIENTE do contrato**. O que não tem item, nem task, nem fase é **(a) o scaffold do app** e **(b) a metade SERVIDOR**. |
| **P3** | **162 de 500 linhas** de `ingest-health-query.ts` morrem (32,4%); **~250 linhas ficam REFÉNS** de um schema de resposta que **nenhuma ADR fixou**; e o módulo **é produção, não teste** — medido pela política, não pela intenção. |

---

# P1 — Isolamento: o espelho é o falsificador ou a segunda implementação?

## P1(a) — `ingest-health-query.ts` está CORRETO, e a leitura contrária lê o objeto errado da proibição

As duas leituras estão no mesmo arquivo porque o arquivo é honesto. A que vale é a primeira, e o
argumento é **textual em `ADR-008`**, não de gosto:

**1. O objeto que `D3` proíbe é o CAMINHO DE LEITURA, não a projeção.** `ADR-008/D3` literal:
*"Se F0 escrever o seu próprio **caminho de leitura**, F3 reimplementa o mesmo registro"*. E `DoD-1`
fixa o alvo do enforcement sem ambiguidade: *"existe exatamente **UMA definição** de
`ingest_health_query`"*, a ser medida por `forbidden-regex` **contra uma segunda definição**. O módulo TS
**não lê o store**: os dados dele vêm do **consumidor #1** (o próprio CLI), por `spawnSync`
(`ingest-health-query.ts:369`). ⇒ **uma consulta, uma definição, um caminho de leitura.** `DoD-1` está
satisfeito, não violado.

**2. Sem a re-derivação independente, `DoD-2` seria VACUOSO — e isso é dirimente.** `DoD-2` pede:
*"`sha256` da projeção canônica da saída do CLI **igual** ao `sha256` da projeção da **resposta que
alimenta S1**"*. Se o lado `web` apenas **repetisse** o `sha256` que o CLI imprime, o critério compararia
um número **consigo mesmo** e não falsificaria nada. A única forma de `DoD-2` ter dente é o segundo
consumidor **reconstruir** a projeção e comparar. ⇒ **o espelho é o instrumento do DoD, e a ADR o exige.**

**3. `DoD-3` se sustenta pelo mecanismo declarado.** O módulo **não** redeclara `KNOWN_VERDICTS`
(`ingest-health-query.ts:42-45`); `verdict` inédito faz o CLI levantar `UnknownVerdictError`, o
subprocesso sai não-zero com `stdout` vazio e o TS **lança**. ⇒ *"os dois mudam juntos ou os dois
reprovam"*, que é o falsificador da ADR.

### O que o espelho realmente prova — mais estreito do que `DoD-2` dá a entender

⚠️ **Correção a registrar, e ela é do texto de `DoD-2`, não do código.** A entrada do lado TS **já é o
`stdout` canonicalizado do CLI**. Logo o que o `sha256` compara é (i) que a tupla de **15 colunas** do TS
(`INGEST_HEALTH_RUN_COLUMNS`, linha 102) é **idêntica em ordem** à do Python — que é exatamente o que
alimenta a impressão digital de `ADR-008/DoD-2` — e (ii) que o parse é **sem perda**. **Não** compara
duas leituras independentes do mesmo estado, porque **não existem duas** (e é justamente esse o ponto de
`D3`). O texto de `DoD-2` lido de fora sugere duas leituras comparadas; o que há é uma leitura e uma
reconstrução. **A propriedade é real e vale — o enunciado é que está mais forte que o mecanismo.**

**Isto é achado de redação de DoD, dono `ADR-008`, não defeito de implementação.**

## P1(b) — Aqui `web` ABSORVEU domínio, e a ADR que é dona já tinha declarado o gatilho

`ADR-003` §`D2` (acrescentado por `T-05.1`/`quant-architect` em **2026-09-02**, `:340-364`) declarou,
literal:

> *"decidir qual desses dois lados (TS ou Python) é a fonte de verdade da grade, se algum dia existirem
> os dois, é uma decisão de arquitetura que não tem candidato a resolver hoje — permanece em aberto,
> dona `quant-architect`, gatilho: **o dia em que uma task real precisar de bucketing de tempo em AMBAS
> as linguagens para o MESMO propósito (hoje nenhuma precisa)**."*

**O gatilho disparou — em menos de 24 h, e por tasks que já estão `done`:**

| par | evidência, citada do próprio arquivo |
|---|---|
| `universe_at.py` ↔ `app/universe-at.ts` (**325 linhas**) | `universe-at.ts:1-16`: *"TypeScript **port** of `universe_at(ts, filter)`… **reimplementing the algorithm here**, citing the source, **is the sanctioned path**"* |
| `cvd.py` ↔ `charts/s2-cvd.ts` (**196 linhas**) | `s2-cvd.ts:4`: *"FORMULA **REPLICATED**, NOT REINVENTED"* — e com **divergência semântica DECLARADA**: `bigint` em vez de `Decimal`, justificada por *"does not persist a fact"* |
| `series_key.py`/`series_catalog.py` ↔ `s3-inspector/series-catalog.ts` (**181 linhas**) | `series-catalog.ts:1-8`: *"This is a **TRANSCRIPTION**… typed by hand from the Python source (**no cross-language import exists**)"* |

⚠️ **A palavra "sanctioned" em `universe-at.ts:15` não tem lastro em ADR nenhuma.** A sanção é uma
**auto-citação dentro do próprio módulo** que a usa. Nenhuma ADR autoriza port de domínio Python para TS;
a única ADR que tocou o assunto (`ADR-003/D2`) **deixou a pergunta aberta e nomeou dona**. Isto é a
classe de defeito que este repositório mede: **enforcement declarado no lugar de enforcement medido.**

### O número que fecha P1(b) — a rede existe em 1 caso de 10

```bash
# universo: modulos TS nao-teste que citam um .py como origem
grep -rlnE '\b[a-z_]+\.py\b' frontend/src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'   # 10 (universo 35)
# desses, quantos tem TESTEMUNHA CRUZADA EXECUTAVEL (invoca Python de verdade no teste)?
grep -rln 'python\|spawnSync\|execFile' frontend/src --include='*.test.ts'   # 2 arquivos
#   -> ingest-health-query.test.ts (modulo de port)  +  eslint-boundary.test.ts (nao e port)
# e do lado Python, algum teste compara contra o TS?
grep -rln 'frontend' backend/tests --include='*.py'   # rc=1, ZERO
```

**`[MEDIDO 2026-09-03 em `8c002e4`, n=10 módulos / 35 módulos não-teste / 25 arquivos de teste]`:**

- **1 de 10** tem testemunha cruzada executável (`ingest-health-query.ts`, via `sha256` contra o CLI real);
- **9 de 10** são transcrições à mão defendidas **só por fixture do lado TS** ⇒ mudança no Python
  **não reprova nada**;
- **0** testes do backend olham para o frontend ⇒ a deriva é **unidirecionalmente invisível**.

**Esta é a resposta direta ao owner:** o front **não** extrapolou onde ele suspeitou (o espelho de
`ingest_record.py` é o certo). Ele extrapolou em **9 módulos onde ninguém olhou**, e o modo de falha é o
exato que `ADR-008/D3` nomeia — *"divergem em silêncio"* — só que fora do alcance daquela ADR.

### Dois achados menores, nomeados para não virarem dívida silenciosa

1. **`s2-cvd.ts` é segunda implementação com divergência DELIBERADA e sem teste cruzado.** `bigint`
   contra `Decimal` é escolha defensável para gráfico; **mas** significa que o número que a tela mostra e
   o fato persistido **podem discordar por construção**, e nada mede a distância. `[NÃO SEI]` se a
   diferença é tolerável no universo real — **dona: `quant-architect`** (é semântica de `cvd`, não de UI).
2. **`universe-at.ts` inventou regra de domínio que não existe no Python.** O próprio cabeçalho
   (`:1-3`): *"plus a **NEW extension** this task adds (the delisting badge) that **has no Python
   counterpart**"*. `[NÃO SEI]` se o *delisting badge* é regra de **exibição** (legítimo em `web`) ou
   **predicado de domínio** (então é de `sentimento` e nasceu do lado errado). **Dona: `quant-architect`.**

### E há uma consequência de GOVERNANÇA que ninguém escreveu

```bash
harness policy --key agents.by_component
# web:  {"architect": ".claude/agents/ui-designer.md", "design_gate": "docs/gate-de-design.md"}
```

`[MEDIDO 2026-09-03]` — **7 dos 10** módulos de port vivem em diretórios do componente `web`
(`app/universe-at.ts`, `app/history-transport.ts`, `features/s3-inspector/{quarantine,series-catalog,domain,view-model}.ts`,
`features/s1-console/ingest-health-query.ts`) e **3** em `charts`
(`canonical-grid.ts`, `s2-cvd.ts`, `s2-annotation-identity.ts`).

⇒ **o dono de julgamento arquitetural de 7 módulos de lógica de domínio portada é o `ui-designer`.**
`charts` roteia para `quant-architect`; `web` roteia para o agente de UI. Semântica de `universe_at` e
schema de resposta de transporte **não são decisão de UI**. Isto não é culpa do `ui-designer` — é o
roteamento fazendo o que foi declarado fazer. **Ato de owner** (é `[agents.by_component]`, política).

---

# P2 — Momento do Next: o fato 4 é artefato de grep, e a correção agrava o achado

## O que o grep do handoff não podia ver

O fato 4 usou `grep -rniE 'scaffold|create-next|app router|API HTTP'`. **O vocabulário deste repositório
para rota HTTP não é "API HTTP" — é "transporte".** Refazendo com o vocabulário certo:

```bash
grep -rniE 'transporte|SSE' docs/plans/SPEC-001-plataforma-dados/*.md   # 12 linhas
grep -n '5\.12\|8\.8\|ADR-005' docs/context/plataforma-dados/tasks.toml # itens materializados
```

`[MEDIDO 2026-09-03]` — **a rota HTTP está no plano, com item, ADR e task**:

| item de plano | ADR | task | status |
|---|---|---|---|
| `05`/**`5.12`** — *"Transporte: **HTTP endereçável por conteúdo** para o histórico. Nenhum tick chega ao browser"* | `ADR-005/D1` | **`T-05.9`** (`CST-43`) | **`done`** — QA APPROVED 2026-09-02, PR #68 |
| `08`/**`8.8`** — *"Transporte ao vivo por **SSE** com envelope de bucket"* | `ADR-005/D1,D2` | **`T-08.11`** (`CST-79`) | **`done`** — QA APPROVED 2026-09-02, PR #79 |

E `ADR-005/D1` **já decidiu a forma das duas rotas** (HTTP endereçável por conteúdo para histórico; SSE
para a borda direita). ⇒ **não falta ADR de transporte, e não falta item de plano.**

## O achado real, e é pior que "nenhuma fase prevê"

> **Os dois itens de transporte foram fechados entregando SÓ a metade CLIENTE do contrato. A metade
> SERVIDOR não tem item, não tem task, não tem fase — e as duas tasks estão `done`.**

Está escrito no próprio módulo, `frontend/src/app/history-transport.ts:20-33`:

> *"Fronteira desta task, e por que ela para aqui: **NÃO cria servidor/endpoint algum** … criar um
> estaria fora do que o handoff autoriza. O que existe hoje, e que esta task consome, é o **CONTRATO** …
> **sem assumir um schema de resposta que nenhuma ADR fixou ainda**."*

Cruzando com o fato 2 do handoff (zero `fastapi`/`flask`/`APIRouter` em `backend/`): um item cujo
enunciado é **"Transporte HTTP"** foi encerrado com **construtor de chave de requisição + dois portões de
payload**, sobre payload que ninguém serve. **Isso não é o builder errando** — os handoffs proibiram
tocar `backend/` e os gates registraram a lacuna 5 vezes (fato 8). **É o item de plano sendo satisfazível
sem a coisa que ele nomeia**, e é achado de `DoD`: `D5.8` mede *"nenhum tick chega ao browser"* — uma
propriedade **negativa**, verificável sobre payload hipotético. **DoD que passa sem o sujeito existir.**

## (a) O scaffold do app: não existe item, e a omissão é DECLARADA

```bash
grep -niE 'next\.js|scaffold|create-next|app router|renderiz' docs/context/plataforma-dados/tasks.toml
# 0 ocorrencias de scaffold/Next; os hits de 'tsx' sao os globs de cobertura de regra de T-01.2
```
`[MEDIDO 2026-09-03, n=81 tasks]`. E `frontend/src/app/routes.ts:11-13` diz a omissão na cara:

> *"The **Next.js pages themselves belong to the `web` component and are NOT created by this task**:
> scaffolding an application here would be scope this task does not own."*

**Onde ele DEVERIA nascer, e o argumento:** a fase **`05`** é a dona — `index.md:72` fixa *"o primeiro
`.tsx` é `05`"*, o cabeçalho da `05` declara componentes **`charts` + `web`** e gate **`Q16`** (já
**RESPONDIDA** em 2026-08-28, `docs/decisoes-do-owner.md:49` — *"o relógio de retrabalho **parou**"*), e
os itens `5.6`/`5.10`/`5.12` já são `web`. **Nenhuma SPEC nova é necessária:** `SPEC-001` §6 (superfície)
e §7 (o bundle **É** a URL) já fixam o contrato; falta **item + DoD**, não contrato.

**De quem é cada ato, e não é de um só:**

| ato | dono | por quê |
|---|---|---|
| escrever o item de scaffold + `DoD` na fase `05` | **`/architect`** | é item de plano; `index.md:9-11` exige requisito citado, **um** componente e DoD com comando e universo |
| materializar a task | **`/tech-lead`** | *"Nenhuma fase escreve no tracker"* (`index.md:12`) |
| **reabrir a fase `05`, que já tem `T-05.8`/`T-05.9` `done`** | **⛔ OWNER** | `advance`/`approve` são gates de owner (`CLAUDE.md`); acrescentar item a fase com tasks fechadas **não é ato de agente** |

## (b) A rota que substitui o `child_process`: a ADR decidiu o PROTOCOLO e não a FRONTEIRA DE PROCESSO

`ADR-005/D1` fixa **HTTP + SSE**. O que **nenhum** documento fixa é **onde o handler roda** — e disso
depende o componente:

| opção | componente | cabe no vocabulário fechado? |
|---|---|---|
| **Next Route Handler** em `frontend/src/app/**` | **`web`** | ✅ **cabe sem forçar**. Mas então o handler lê SQLite/Postgres do lado servidor — e `web-fullstack.browser-imports-server` é **`[BLOQUEIO]`** (`harness rules list`, n=10 regras); a fronteira browser/servidor **dentro** de `web` passa a precisar de mecanismo, não de convenção |
| **serviço Python** (FastAPI em `backend/`) servindo `ingest_health_query` | **força** | mais próximo é `sentimento`, mas o handler **é superfície**, não domínio. É o caso que `ADR-009/D5` já mediu: item de infra cai em `docs` **por eliminação**, e a ADR **propôs um componente `infra`** com falsificador — *"se todo item conseguir declarar um dos seis sem forçar, o componente novo é custo sem retorno"* |

⚠️ **`[NÃO SEI]` qual das duas, e é a decisão que de fato bloqueia (b).** Não é preferência de estilo:
ela decide **componente alvo**, e componente alvo decide **quem julga** e **qual regra morde**. **Dono
da decisão:** amendar `ADR-005` (que decidiu protocolo e é omissa em fronteira de processo) é ato de
**`quant-architect`**; **se a resposta exigir o componente `infra`, é ato de OWNER** — o vocabulário é
`policy_tracked` e `ADR-009/D5` já registrou que *"discutir não é delegar a decisão"*.

**E há um efeito colateral que precisa estar escrito antes da escolha:** se o handler for Next Route
Handler, ele nasce **dentro de `web`**, cujo `architect` declarado é o **`ui-designer`** (medido em P1).
⇒ a escolha (b) **não é neutra em governança**; ela decide, de tabela, quem responde por schema de
resposta e por leitura de store.

---

# P3 — O que fica inválido quando (b) existir

**Universo:** `find frontend/src -name '*.ts' -o -name '*.tsx' | grep -v '\.test\.' | xargs wc -l`
→ **35 módulos, 5.741 linhas** `[MEDIDO 2026-09-03]`.

## O que MORRE — número, com o comando

```bash
awk 'NR>=313 && NR<=470' frontend/src/features/s1-console/ingest-health-query.ts | wc -l   # 158
sed -n '74,77p'  frontend/src/features/s1-console/ingest-health-query.ts                   # 4 imports node:
wc -l frontend/src/features/s1-console/ingest-health-query.ts                              # 500
```

**162 de 500 linhas (32,4%) de `ingest-health-query.ts`** — o bloco de transporte por subprocesso
(`THIS_FILE_DIR`:315, `DEFAULT_BACKEND_ROOT`:319, `HOSTED_SCRIPT`:343, `runIngestHealthCli`:354,
`fetchIngestHealthProjectionViaCli`:399) **mais** os 4 imports `node:child_process`/`node:fs`/`node:path`/
`node:url` (74-77). **`spawnSync` não sobrevive a um browser em nenhuma variante** — não é acoplamento a
consertar, é código que existe só porque não havia rota.

## O que PRECISA REESCRITA e ninguém nomeou — e é o achado mais caro de P3

```bash
grep -rln 'from "node:' frontend/src --include='*.ts' | grep -v '\.test\.'   # 2 de 35
#   frontend/src/features/s1-console/ingest-health-query.ts
#   frontend/src/app/threshold-spec-bundle.ts
grep -rln 'createHash' frontend/src --include='*.ts' | grep -v '\.test\.'    # os MESMOS 2
```

**2 de 35 módulos não-teste não executam em browser hoje** `[MEDIDO 2026-09-03]`. E o motivo do segundo
(`threshold-spec-bundle.ts`, que não tem `child_process` nenhum) é o que importa:

> **`createHash("sha256")` de `node:crypto` é SÍNCRONO. O equivalente de browser
> (`crypto.subtle.digest`) é ASSÍNCRONO.**

`ingest-health-query.ts:262-264` — `export function fingerprint(…): string` — devolve `string` **síncrona**.
No browser, **a assinatura muda**: `fingerprint` vira `Promise<string>`, e com ela `canonicalProjection`
como chamador, `fetchIngestHealthProjection*`, e a cadeia até `buildS1ViewModelFromIngestHealthProjection`
(:488) e `S1Console.tsx`. ⇒ **o falsificador de `ADR-008/DoD-2` fica ASSÍNCRONO.** Não é troca de import:
é mudança de forma no instrumento que prova a ADR. **Nenhum documento, gate ou handoff registra isto.**

## O que SOBREVIVE — e a resposta honesta é "sobrevive REFÉM", não "sobrevive"

Sobrevivem as linhas **92-312** e **471-500** (~**250 linhas**): as tuplas de coluna, `canonicalJson`,
`canonicalLines`, `canonicalProjection`, `parseCanonicalProjection`, e os dois mapeadores de view-model.
**Mas sobrevivem sob uma condição que nada declara:** que a rota sirva **as mesmas linhas canônicas** que
o CLI imprime. `history-transport.ts:31-33` diz, do próprio lado `web`, que esse schema **não existe**:
*"sem assumir um schema de resposta que **nenhuma ADR fixou ainda**"*.

⇒ **se a rota servir linhas (rows) em vez das linhas canônicas do CLI, `parseCanonicalProjection`
(287-312, 26 linhas) morre também, e a comparação de `sha256` de `DoD-2` tem de ser REDESENHADA** — porque
o lado `web` deixaria de reconstruir a mesma projeção e voltaria a comparar número com número.

**Resumo de P3, sem arredondar para o lado confortável:** **162 linhas morrem com certeza · ~250 linhas
são reféns de um schema de resposta que nenhuma ADR fixou · 2 módulos (incl. 1 sem subprocesso nenhum)
precisam de reescrita de ASSINATURA por causa de `sha256` assíncrono · 3 `.tsx` / 409 linhas
(`grep -rn 'from "react"' frontend/src | wc -l` → **0**) precisam de fiação de renderização.**

## A pergunta embutida do owner, respondida direto: é produção ou é teste?

**É PRODUÇÃO, e a medição é da política, não da intenção:**

```bash
harness policy --key code_paths
# include_prefixes: ["backend/src/", "backend/tests/", "frontend/src/"]
# include_globs:    ["*.py","*.ts","*.tsx",...]   test_globs: ["**/tests/**","**/test_*.py"]
```

`frontend/src/features/s1-console/ingest-health-query.ts` casa `include_prefixes` + `include_globs`,
**não** casa `test_globs` (não está sob `**/tests/**`, não é `test_*.py`), e é **importado** por
`view-model`/`S1Console`. ⇒ **o classificador o vê como código de produção.** O próprio módulo se
descreve como *"a read adapter for proving `D7.17`, **not a request handler**"* (:352-353).

> **É código de produção fazendo trabalho de bancada de teste.** Essa é a resposta à segunda metade da
> pergunta do owner: o front **não** extrapolou no domínio que espelhou (P1a está certo) — ele extrapolou
> no **TRANSPORTE que substituiu**, e o substituto é `child_process`, que nunca teve como sobreviver.

---

# Consolidado: o que este parecer NÃO pode julgar, e de quem é cada decisão

| # | pergunta aberta | dona | gatilho / prazo |
|---|---|---|---|
| **A1** | qual lado (Python ou TS) é fonte de verdade do domínio portado, e como a paridade é PROVADA sem `import` cross-language | **`quant-architect`**, por `ADR-003/D2:340-364` | **JÁ DISPAROU** — 3 pares medidos em 2026-09-03; a ADR dizia *"hoje nenhuma precisa"* em 2026-09-02 |
| **A2** | o *delisting badge* de `universe-at.ts` é regra de exibição (`web`) ou predicado de domínio (`sentimento`)? | **`quant-architect`** | já em `done` (`T-07.14`) |
| **A3** | `bigint` de `s2-cvd.ts` × `Decimal` de `cvd.py` — a divergência é tolerável no universo real? | **`quant-architect`** | antes de a tela virar referência de número |
| **A4** | o handler HTTP roda como Next Route Handler (`web`) ou serviço Python (força componente ⇒ `infra`)? | amendar `ADR-005`: **`quant-architect`** · criar `infra`: **⛔ OWNER** (`ADR-009/D5`) | **bloqueia (b) de P2** |
| **A5** | schema da RESPOSTA da rota de histórico — linhas canônicas do CLI ou rows? | **`ADR-005`** (é omissa) / `ADR-008` para o efeito em `DoD-2` | decide se ~250 linhas de TS vivem |
| **A6** | `web.architect = ui-designer.md` julgando 7 módulos de domínio portado e o schema de transporte | **⛔ OWNER** — é `[agents.by_component]`, política | antes de (b) nascer dentro de `web` |
| **A7** | reabrir a fase `05` para receber o item de scaffold, com `T-05.8`/`T-05.9` já `done` | **⛔ OWNER** — `advance`/`approve` são gates de owner | antes de qualquer task de scaffold |

**Achado de redação a registrar contra os documentos donos, não contra o código:**
1. **`ADR-008/DoD-2`** enuncia comparação de duas leituras; o mecanismo real é uma leitura + uma
   reconstrução. O enunciado está mais forte que o mecanismo.
2. **`D5.8`** (*"nenhum tick chega ao browser"*) é DoD **negativo** — satisfazível sobre payload que
   ninguém serve. Foi como `5.12` fechou sem servidor.
3. **`ADR-005`** decidiu protocolo e é **omissa em fronteira de processo e em schema de resposta**.

**Nada neste parecer foi escrito no tracker, no ledger ou em código.** Read-only cumprido.
