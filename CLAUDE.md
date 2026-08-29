# Convenções deste repositório

## ⛔ Commits — regra determinística, aplicada por hook

1. **Sem trailer de co-autoria.** Nenhum `Co-Authored-By:`, em nenhuma variação de caixa.
2. **Autor e committer são o owner:** `Stharley Maxwell <stharleymax@gmail.com>`.

Declarado pelo owner em 2026-08-25. **Não é convenção — é portão.** O hook
[`scripts/hooks/commit-msg`](scripts/hooks/commit-msg) reprova o commit antes de ele existir, e reprova
igual para humano e para agente. Instale com `bash scripts/install-git-hooks.sh` (idempotente).

O hook checa a identidade com `git var GIT_AUTHOR_IDENT` / `GIT_COMMITTER_IDENT`, não a config — assim
`git commit --author=…` e `GIT_AUTHOR_EMAIL=…` também são pegos.

**`core.hooksPath` é proibido neste repositório.** O `pre-push` é gerado por `harness install-hooks` e
vive em `.git/hooks`; redirecionar `hooksPath` o desligaria **em silêncio**, que é a pior classe de
quebra — o portão para de existir e nada avisa.

## Design — autonomia delegada, com gate de validação

**Declarado pelo owner em 2026-08-25:** *"quero que meus agents nessa questão de design tenha autonomia
… porém n tenho experiência nem habilidades suficientes com ui-ux … o agente tem autonomia de decisão,
**desde que ux-ui-mastery esteja de acordo**"*.

| | |
|---|---|
| **quem decide** | [`ui-designer`](.claude/agents/ui-designer.md) — operador do Stitch, e ele decide de UI/UX **sem pedir permissão** |
| **o gate** | `ux-ui-mastery` (plugin, 19 skills / 10 comandos). **Nenhuma decisão de design vale antes de o validador concordar.** Não é revisão opcional — é a condição da autonomia |
| **por que dois** | agente que gera e aprova o próprio trabalho não tem gate. O ciclo é **gera → critica → itera** |
| **o que muda com a delegação** | a obrigação de prestar contas **aumenta**: argumento, fonte lida com arquivo citado, falsificador, e `[NÃO SEI]` explícito. Quem não pode auditar merece mais rigor, não menos |

O owner intervém **por exceção** — ele pontua o que discordar. Silêncio dele não é aprovação; aprovação
é o veredito do validador.

---

## O ledger é a identidade do estado, não o texto do documento

O pipeline é o `harness`. Um documento marcado "aprovado" **sem o evento `approve` no ledger não está
aprovado**. Antes de acreditar em qualquer estado:

```
harness status                        # dashboard
harness pipeline state <feature>      # o estado corrente
harness pipeline show  <feature>      # o histórico cru, evento a evento
harness doctor                        # a saúde da instalação
```

Gates marcados **owner** (`spec`, `build`, `advance DONE`) **não podem ser feitos por agente.**

## Nenhum número sem o comando que o produziu

Toda afirmação quantitativa carrega o comando, o universo (`n`) e um rótulo de força: `[MEDIDO]` ·
`[DOC]` · `[NÃO MEDIDO]` · `[PREMISSA-OWNER]` · `[INFERRED: motivo]`. **Não é estilo.** Três defeitos
reais deste projeto foram encontrados por essa disciplina, incluindo uma regra anti-lookahead que estava
**invertida** e propagada por dois documentos.

Corolário: **`[PREMISSA-OWNER]` é para citação literal do owner.** Paráfrase vestida de declaração já
produziu defeito aqui — leitura adotada por agente leva rótulo próprio.

## Higiene de contexto — o subagente devolve ponteiro, não relatório

`[MEDIDO 2026-08-29, sessão `b227a990`: 692 turnos do loop principal, 16h, 41 subagentes]` — **62% do
custo foi releitura de contexto**, não geração. Relatório de subagente inlinado: média **9,4KB**, e o
texto integral **já estava em disco**, no `<output-file>` que a própria notificação cita. Um relatório
entregue no turno 300 de 692 é relido **~390 vezes**: o custo de uma linha é o que ela custa vezes os
turnos que faltam.

Vinculante para o loop principal e para todo subagente — R1–R5 em
[`docs/protocolo-de-despacho.md`](docs/protocolo-de-despacho.md):

- **Subagente devolve no máximo 15 linhas** — veredito, números com o comando que os produziu, e o
  caminho do relatório completo em `docs/context/<feature>/gates/`. **NUNCA cole o corpo.**
- **Prompt de despacho: no máximo 20 linhas**, citando caminhos. Contexto longo vai para
  `docs/context/<feature>/handoff/<TASK>.md` **antes** do despacho.
- **NUNCA `cat` nem `sed -n '1,300p'` de arquivo grande no loop principal** — `grep -n` com âncora,
  `--json` com filtro, ou delegue a leitura.
- Todo comando que pode passar de ~50 linhas termina em `| head -N` ou `| tail -N`.

**Nada disto é portão** — é doutrina, e `agents/qa.md` já mediu que prosa sem portão tem 0% de adesão.
Por isso o documento carrega um falsificador que o manda sair se não pagar o que custa.

## Dado bruto não é versionado

`data/` (~850 MB) está no `.gitignore`. É dado de terceiro, re-obtenível, catalogado em
[`data/MANIFEST.md`](data/MANIFEST.md), que traduz os caminhos citados nos documentos para onde o
arquivo está. **O repositório guarda as conclusões e os comandos, não os bytes.**

**Nenhuma chave em documento, nunca.** A key da Coinalyze vive em `.env` (perms 600, gitignored) e os
comandos a referenciam só como `$COINALYZE_API_KEY`.

## Vocabulário fechado de componentes

`sentimento` · `charts` · `convergencia` · `backtest` · `web` · `docs` — via
`harness policy --key components`. Alterar o vocabulário é ato do owner, não de agente.

## Idioma de identificador — a fronteira escrita, e ela é **convenção, não portão**

**A regra, em uma linha:** o código deste repositório nasce **em inglês**; o que fica em português está
**enumerado na tabela abaixo**, e a enumeração é fechada.

`[PREMISSA-OWNER, 2026-08-29]` — e aqui o rótulo é este porque a frase é **citação literal** do owner:

> *"Assim como docstring, todo código gerado é em inglês, olhando no front, ta tudo em portugues, nome dos arquivos, var, tudo."*

### A exceção do vocabulário de componentes — literal, e é para ser grepada

> **O vocabulário fechado de componentes e todo caminho que dele deriva ficam em português. Todo o resto do código vai para o inglês.**

`[DECISÃO-OWNER: 2026-08-29, escolha entre alternativas apresentadas]` — **e o rótulo é este, e não
`[PREMISSA-OWNER]`**: o owner escolheu uma opção de um menu que um agente redigiu, com o custo de cada
uma declarado. Não é frase ditada por ele. O custo que ele aceitou, como estava escrito no menu:
*"o repositório fica bilíngue numa fronteira, mas a fronteira é declarada e tem uma linha só"*
(`PRD-002` §3.3, resolvendo a pergunta que `ADR-013/D3` deixou aberta).

**Os caminhos que derivam, hoje:** `backend/src/modules/sentimento/` e `backend/tests/sentimento/`.
`sentimento` não é identificador de código — é **chave de política**, consumida por `[components]`,
`[agents.by_component]` e `[code_paths]`. Renomeá-la é migração de governança com efeito em
`require-code`, em `classify` e no roteamento de agente, não mudança de estilo.

**⚠️ A exceção cria uma classe nova de falso positivo, e isso está declarado, não escondido:** qualquer
instrumento futuro que meça idioma **acusa `sentimento` de português**, e a partir desta decisão a
acusação é **falsa por construção** ⇒ todo instrumento de idioma terá de carregar a lista de exceções
como **entrada de primeira classe**.

**O falsificador da exceção — ele mede EROSÃO, não intenção:** todo nome em português aceito sob
`backend/src/` ou `frontend/src/` tem de casar, **por igualdade de string**, com um elemento de
`harness policy --key components`. Um segundo nome português que **não** case é a evidência de que a
exceção virou rampa.

### A tabela de fronteira — 12 linhas, normativa e fechada

Origem: `PRD-002` §3.1 (que estende `ADR-013/D3` de 8 para 12 superfícies), com a **linha 10** resolvida
por `SPEC-002` §6.1 e a **linha 12** deliberadamente em aberto por `SPEC-002` §7.

| # | superfície | decisão | força | origem |
|---|---|---|---|---|
| 1 | **identificador de produção** (`backend/src`, `frontend/src`) | **inglês** | `[PREMISSA-OWNER: 2026-08-29]` — *"todo código gerado é em inglês … var, tudo"* | `ADR-013/D3` |
| 2 | **identificador de teste** (`backend/tests`) — incluindo nome `test_*`, fixture, helper, classe de apoio, **parâmetro, variável local e constante de módulo** | **inglês** | `[INFERRED: "todo código" sem qualificador de camada; e `harness.toml [code_paths] include_prefixes` lista `backend/tests/` como código]` | `ADR-013/D3`, estendida por `PRD-002` §4.2 |
| 3 | **nome de arquivo** | **inglês** | `[PREMISSA-OWNER: 2026-08-29]` — *"nome dos arquivos"*, literal | `ADR-013/D3` |
| 4 | **nome de diretório** | **inglês**, exceto o que deriva de `components` (linha 9) | `[INFERRED: um diretório é metade de um caminho]` | `ADR-013/D3` |
| 5 | **docstring / comentário** | **inglês** | `ADR-011/D6` + `T-01.7`, em vigor `[DOC]` | `ADR-013/D3` |
| 6 | **mensagem de commit, corpo de PR** | **português** | `[INFERRED: não é "código gerado"; 18 dos 20 últimos commits em português, n=20]` | `ADR-013/D3` |
| 7 | **`docs/`, `README`, SPEC, ADR, plano, `tasks.toml`, `CLAUDE.md`** | **português** | `[INFERRED: traduzir destruiria as âncoras textuais que 3 ADRs usam para se referir umas às outras]` | `ADR-013/D3` |
| 8 | **string visível de UI / microcopy de operador** | **português (pt-BR)** — e **fora deste universo por REMISSÃO, não por omissão** | `[DOC: SPEC-001 §3.8 + PRD-001 §9/Q14]` — reabrir aqui criaria duas verdades sobre a mesma superfície | `ADR-013/D3` + `PRD-002` §3.2 |
| 9 | **vocabulário fechado de componentes** (`sentimento` · `charts` · `convergencia` · `backtest` · `web` · `docs`) **e os caminhos que dele derivam** (`backend/src/modules/sentimento/`, `backend/tests/sentimento/`) | **português — EXCEÇÃO DECLARADA** | `[DECISÃO-OWNER: 2026-08-29, escolha entre alternativas apresentadas]` — ver a exceção literal acima | `PRD-002` §3.3 |
| 10 | **nome de EVENTO DE LOG** (a string em `logger.info("…")`) e **as chaves de `extra={}`** | **inglês, PROSPECTIVAMENTE** — todo evento e toda chave **novos** nascem em inglês | `[INFERRED: aplicação de ADR-013/D3 linha 1 a superfície não enumerada — a string em `logger.info("…")` é escrita em código, por quem escreve o código]` | `SPEC-002` §6.1 |
| 11 | **nome de COLUNA DE CONTRATO** (`janela_de_perda`, `window`, `class`) | **português — EXCEÇÃO, já declarada em código de produção** | `[DOC: backend/src/modules/sentimento/domain/ingest_record.py:87-89]` — herança de `ADR-008/D3`; reabri-la é ato daquela ADR, não desta feature | `PRD-002` §3.4 |
| 12 | **segmento de URL / rota** (`"/painel"` em `ROTAS`) | **⏸ NÃO DECIDIDO** | `[NÃO SEI]` — `[Q2]`, e **quem decide é o owner** | `PRD-002` §3.1 / `SPEC-002` §7 |

**Linha 10 — o que ela NÃO faz, e a omissão é deliberada:** os **4 eventos existentes em português**
(`etl_item_publicado`, `etl_item_concluido`, `etl_drenagem_concluida`, `checkpoint_cauda_truncada`) e as
**4 chaves** (`destino`, `processados`, `janela`, `bytes_descartados`) **NÃO são renomeados por esta
SPEC** (`SPEC-002` §6.3). Renomear um identificador Python quebra um import, e o import reprova;
renomear um evento de log quebra uma consulta, **e a consulta continua devolvendo `rc=0` com zero
linhas** — quebra silenciosa, com consumidor fora deste repositório. A regra prospectiva faz a
divergência **parar de crescer** mesmo que não a encolha: hoje são **4 em português de 9 eventos**
`[DOC: PRD-002 §4.4]`, e o número **não pode subir**.

**Linha 12 — o custo de deixar em aberto, escrito para não ser esquecido:** hoje é **1 rota**. Na fase
`05` de `SPEC-001` são muitas, e trocar URL depois quebra bookmark e link. **A pergunta é barata agora e
monotonicamente mais cara depois** — mas não bloqueia nada. Dono: **owner**.

### Idioma de identificador é convenção, **não portão** — e o gatilho de reabertura tem endereço

> Em uma linha, e literal para quem vier grepar: **idioma de identificador é convenção, não portão.**

**Este repositório NÃO mede o idioma dos identificadores, e não finge que mede.** `ADR-013/D2` construiu
**três** detectores e recusou os três **com número**, não por gosto: o melhor deles dá **7 falsos
positivos em 88 identificadores legítimos** de corpus de retenção, e um deles é **`oi`** — *open
interest*, **286 ocorrências em 23 arquivos** `[MEDIDO 2026-08-29, árvore extraída de 01ec5a8; universo:
docs/*.md]`. **A propriedade que faz o detector morder — token curto — é a mesma que o impede de calar.**

⛔ **Nenhuma `[[rules.own]]` de idioma, nenhum alvo de `make` de idioma, nenhuma allowlist de idioma.**
`ADR-011/D1.10`: declarar uma **REPROVA a fase** (`PRD-002`/`RN-4`). Entrada de allowlist é
indistinguível de bypass, e a allowlist derivada de hoje é **vazia** `[DOC: ADR-013/D2b]`.

**O gatilho que reabre, e é o único** (`ADR-013/D2e`) — **duas listas, não uma:**

1. um **glossário de domínio versionado** sob a chave `glossary_doc`. Hoje ela é **dívida com dono**
   (`ADR-013/D4`): `harness policy --key glossary_doc` devolve **1 byte — só o newline — com `rc=0`**, e
   `grep -n 'glossary' harness.toml` devolve **`rc=1`, nenhuma linha**
   `[MEDIDO 2026-08-29 em c7df90c]`. ⚠️ `rc=0` com saída vazia é ambíguo entre *"declarado e vazio"* e
   *"nunca declarado"*; **só o `grep` no `harness.toml` separa os dois**;
2. uma **lista declarada de vocabulário de biblioteca e de abreviação técnica** — `sem_acquire`,
   `sem_release`, `serie`, `time_serie` e `parametrize` **não são domínio**, e um glossário de domínio
   **estruturalmente não os alcança**.

> **Com as duas na mão**, rode a variante `D` de `ADR-013/D2a` usando-as como **entrada de primeira
> classe**. Se ela devolver **0 falso positivo** sobre um corpus CALA de **≥ 88** identificadores
> legítimos **que não foram usados para construí-la**, mantendo **≥ 90% de MORDE**, então esta doutrina
> cai e a convenção vira portão — **em `make`, nunca em `[[rules.own]]`**: o detector não é regex de
> linha, e nenhum dos 4 tipos que a máquina de regras expressa o comporta.
>
> **"Cala sobre o corpus que usei para ajustar" não conta** — `ADR-013/D2e` mediu que essa métrica dá
> `0/29` e mente.

## Registro de artefatos é append-only

[`docs/INDEX.md`](docs/INDEX.md). Acrescente linha; **não reescreva linha existente.**
