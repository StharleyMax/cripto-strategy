# SPEC-002 — Código em inglês: contrato, fronteira e mecanismo

**Status:** `DRAFT` — e **é DRAFT porque o ledger diz DRAFT.** `SPEC_APPROVED` exige `harness pipeline approve codigo-em-ingles spec`, que é gate **do owner** por `CLAUDE.md`. Escrever "APROVADA" aqui sem o evento seria violação, não atalho.
**Feature:** `codigo-em-ingles` · **Data:** 2026-08-29 · **Componentes:** `docs` (predominante) · `sentimento` (`F2`) · `web` (`F3`)
**Estado do ledger ao escrever:** `PRD_DRAFT` `[MEDIDO 2026-08-29: harness pipeline state codigo-em-ingles → PRD_DRAFT; 3 eventos: init, dispatch pm, advance PRD_DRAFT]`
**Rev de ancoragem de TODA medição:** **`master@5f4ece0`** — e **não é `7af0e4f`**, que é a âncora do `PRD-002`. Ver §0.1.
**Insumos:** [`PRD-002`](PRD-002-codigo-em-ingles.md) · [`ADR-013`](../adr/ADR-013-codigo-em-ingles-convencao-com-fronteira-e-sem-portao.md) (`aceito`, **usada, não reaberta**) · [`ADR-015`](../adr/ADR-015-token-tipado-no-verificador-de-ancora-e-o-criterio-de-citacao-viva.md) (nasce com esta SPEC) · `ADR-008/D3` · `ADR-011/D4,D6` · `ADR-012/D4,D5` · `SPEC-001` §3.8 · `CLAUDE.md` · `harness.toml`
**Glossário:** `harness policy --key glossary_doc` devolve **1 byte (só o newline) com `rc=0`** e `harness.toml` não tem a chave `[MEDIDO 2026-08-29]`. **Não existe glossário neste projeto e eu não li nenhum**, embora o meu próprio bootstrap (`agents/architect.md:14`) mande ler o arquivo que ela aponta. Dívida com dono em `ADR-013/D4`; **nenhum critério desta SPEC depende dela.**
**Zero código.** Contratos, formas de dado, limites de camada e comportamento de borda. Nenhum trecho abaixo é implementação.

---

## 0. Veredito do peer review do `PRD-002` — **[READY FOR SPEC]**

**Aprovado.** Nenhum bloqueante. Eu re-medi **seis** afirmações centrais dele e **as seis se confirmam**; encontrei **quatro** defeitos, todos de **critério** e nenhum de **conclusão**, e os quatro estão consertados nesta SPEC em vez de devolvidos.

### 0.1 O que eu re-medi do `PRD-002`, e o veredito de cada um

| # | afirmação do `PRD-002` | meu resultado em `5f4ece0` | veredito |
|---|---|---|---|
| 1 | `backend/src` tem **77** declarações, **0** em português | `grep -rnoE '\b(def\|class) [a-zA-Z_0-9]+' backend/src --include='*.py' \| wc -l` → **77** em `7af0e4f` **e** em `5f4ece0` | **confere.** O `26` publicado pelo coordenador vinha de saída truncada por `head -60`; o `23` da `ADR-013` é correto em `01ec5a8`. **77 é o número.** |
| 2 | `backend/tests` tem **70** nomes ligados, **40** em português, em **2** arquivos | script `ast` do `PRD-002` §6/`U2` re-rodado: `15/7` + `55/33` = **70/40** | **confere, byte a byte** |
| 3 | `Filtro` casa **12** arquivos, `Filtro.tsx` casa **9** | **em `7af0e4f`: confere.** **Em `5f4ece0`: 13 e 10** — ver `[G-A1]` | **confere na âncora dele; envelheceu em 1 dia** |
| 4 | `so_linha_em_branco` existe nesta árvore | `test_etl_backlog_retomavel.py:250,251,252` | **confere.** O falso positivo do instrumento **é identificador real** |
| 5 | 7 regras `block`, 6 componentes, `glossary_doc` vazio | `harness rules list --severity block` → **7**; `--key components` → **6**; `--key glossary_doc` → **1 byte, `rc=0`** | **confere** |
| 6 | o mecanismo de §12 passa nos dois lados **com a evidência intacta** | bancada própria, **corpus de retenção que o `/pm` não escolheu**: MORDE **31/`rc=1`**, CALA **0/`rc=0`**, evidência viva nas duas metades | **confere — e ver §0.2, que é o teste que ele não fez** |

### 0.2 O teste de dois lados que eu apliquei ao mecanismo dele, com corpus que ele não escolheu

**O `/pm` não propôs detector de idioma** — a `ADR-013/D2` provou que idioma não é decidível por comando, e nada aqui reabre isso. Ele propôs **igualdade de string sobre conjunto enumerado**, que é decidível. **A pergunta certa não é "funciona?" — é "funciona sobre corpus que o autor não escolheu?"**, porque a `ADR-013/D2b` mediu que o melhor detector dela ia de **0/29 falso positivo no corpus de ajuste para 7/88 no de retenção**.

**Medi os 4 tokens que a bancada dele nunca tocou** (`rotas.ts`, `formatar-percentual.ts`, `ROTAS`, `formatarPercentual`) e os **5 que `CA-U3-4` omite** (`Filtro`, `Rota`, `razao`, `casas`, `sinal`). Resultado integral em [`ADR-015`](../adr/ADR-015-token-tipado-no-verificador-de-ancora-e-o-criterio-de-citacao-viva.md).

> **⇒ O mecanismo NÃO cai na armadilha da `ADR-013/D2b`. Adotado.**
> **⇒ A REGRA DE SELEÇÃO do token cai, e cai medida: 20 falsos positivos** sobre a árvore corrigida, dois deles **a evidência que `CA-U3-2` obriga a preservar**. A regra escrita (*"o token é o caminho, nunca a palavra"*) **não descreve a lista de 7 tokens que a própria `CA-U3-4` usa** — 3 dela são identificadores. `ADR-015/D1` substitui a regra; **o mecanismo fica.**

### 0.3 Os quatro defeitos de critério, e onde cada um está consertado

| | defeito | classe | consertado em |
|---|---|---|---|
| **`[G-A1]`** | os números de citação estão ancorados em `7af0e4f`; `master` é `5f4ece0` e a `ADR-013` mergeou **e virou citadora**: `Filtro.tsx` 9→**10**, `Filtro` 12→**13**. **E esta SPEC, o `PRD-002`, a `ADR-015` e os planos também virarão citadores** | auto-envenenamento (`ADR-012`) | **§4.1** — o critério **nunca é uma contagem**; é classe + conjunto enumerado + rev |
| **`[G-A2]`** | `PRD-002` §5.2 diz *"as **9** se dividem"* e enumera **12**, incluindo `backend/README.md`, que **não cita `Filtro` nem `Filtro.tsx`** (cita `features/painel`) | método que não vê o que afirma ver | **§4.2** — tabela **por token**, nunca por feature |
| **`[G-A3]`** | a regra de token não descreve a lista de tokens | idem | **`ADR-015/D1`** |
| **`[G-A4]`** | `CA-U3-4` pede **um** `rc=0` sobre **7** tokens: um token de MORDE `n=0` some dentro do verde | terceiro significado de `rc=0` (`ADR-012`) | **`ADR-015/D2`** + **§4.3** |

### 0.4 O defeito que eu encontrei fora do `PRD-002`, no instrumento — e ele reprova `CA-U3-6` como escrita

`CA-U3-6` diz: *"`harness code-paths classify` sobre cada um dos 4 caminhos novos devolve `producao` — a mesma classificação de hoje. Se um deles cair para `nao-producao`, o rename tirou `frontend/src` do universo de regra em silêncio."* **O critério é vácuo, e a prova é de dois lados:**

```
$ test -f frontend/src/features/panel/Filter.tsx           ; echo $?     # 1  — NÃO EXISTE (ainda)
$ harness code-paths classify frontend/src/features/panel/Filter.tsx
producao: … — include_prefixes + include_globs casam e nada exclui        # rc=0

$ test -f frontend/src/xxx-nao-existe-em-lugar-nenhum/zzz.tsx ; echo $?   # 1
$ harness code-paths classify frontend/src/xxx-nao-existe-em-lugar-nenhum/zzz.tsx
producao: … — include_prefixes + include_globs casam e nada exclui        # rc=0
```

`[MEDIDO 2026-08-29 em 5f4ece0, n=3 caminhos: 2 inexistentes, 1 existente — os três devolvem `producao` com `rc=0`]`

> **⇒ `harness code-paths classify` é CEGO À EXISTÊNCIA do arquivo.** Ele casa a string contra `include_prefixes`/`include_globs` e nunca toca o disco. Consequência direta: **depois de `F3`, `classify frontend/src/features/painel/Filtro.tsx` continuará devolvendo `producao`/`rc=0` sobre um arquivo que não existe mais.** `CA-U3-6` passaria mesmo que o builder tivesse renomeado para um diretório errado, ou errado a digitação — ela mede a **configuração**, não a **árvore**.
>
> **E há um corolário que alcança o protocolo da casa.** `RN-5` (e `ADR-012/D4`) manda: **(1)** `test -f`, **(2)** `harness code-paths classify`, **(3)** só então o `rc`. **O passo (2) não protege contra a falha do passo (1)** — ele devolve `producao`/`rc=0` para caminho inexistente. **Quem pula o `test -f` confiando que o `classify` o cobre não está coberto.** É a família *"método de busca que não vê o que afirma ver"*, desta vez dentro do protocolo escrito para evitá-la. **Não altero `RN-5` — ela já manda o `test -f` primeiro, e está certa. Registro que o passo (2) não é rede do passo (1), porque a ordem sugere que seja.**

**`CA-U3-6` é reescrita em §4.4 na forma de dois lados.**

### 0.5 O que eu NÃO sei, dito

- **`[NÃO SEI]` se existe consumidor dos 4 eventos de log em português.** Medido: **0** dashboards, alertas ou coletores versionados (`git ls-files | grep -icE 'dashboard|alert|grafana|prometheus|loki|logql'` → **0**) `[MEDIDO 2026-08-29]`. **Ausência de arquivo versionado não é prova de ausência de consumidor** — `ingest_health_cli.py:69` diz, em docstring, que *"a scheduler or a supervisor calls `logging.basicConfig(...)`"*, ou seja o desenho **antecipa** um hospedeiro externo. Ver §6.
- **`[NÃO SEI]` se as 5 fases desta SPEC cabem no tempo que o owner tem.** Não estimei duração e não vou fingir que estimei.
- **Não li glossário nenhum**, porque não existe (cabeçalho).

---

## 1. Objetivo e fronteira desta SPEC

**Objetivo:** dar contrato executável às quatro unidades de valor do `PRD-002`, resolver as três decisões que ele devolveu ao `/architect`, e fixar os nomes exatos — **sem escrever código e sem criar portão de idioma.**

**Fora desta SPEC**, por remissão e não por omissão: string de UI e microcopy (`SPEC-001` §3.8, que **permanece de pé sem alteração**); o glossário (`ADR-013/D4`); a coluna de contrato `janela_de_perda` (`ADR-008/D3`); qualquer `[[rules.own]]` de idioma (`ADR-011/D1.10` — declarar uma **reprova a fase**).

---

## 2. `[Q3]` RESOLVIDA · A convenção mora em **`CLAUDE.md`**, e o `README` da raiz ganha um **ponteiro sem cópia**

**Os candidatos eram `CLAUDE.md`, `README.md` da raiz e um `docs/CONVENCOES.md` novo.** A escolha tem consequência de **alcance**, não de arrumação, e o alcance é medível.

**A medição que decide, e ela derruba o argumento fácil dos dois lados:**

```
$ harness policy --key docs.bootstrap_docs
["docs/proposta-discovery.md"]
```

`[MEDIDO 2026-08-29]` · **`bootstrap_docs` tem UM arquivo, e ele não é o `CLAUDE.md` nem o `README.md`.** ⇒ **o argumento *"o `README` da raiz não é lido no bootstrap"* é verdadeiro, e o argumento simétrico *"o `CLAUDE.md` é"* é FALSO se apoiado nessa chave.** Registro isto porque era a justificativa que eu tinha na mão e ela não sobrevive à medição.

**O que sustenta a decisão é outra coisa, e é mais forte:** `CLAUDE.md` é carregado **incondicionalmente** como *project instructions* pelo harness em toda sessão de agente — não por política do repositório, mas por mecanismo do `Claude Code`, e é por isso que ele abre dizendo *"These instructions OVERRIDE any default behavior"*. **É o único arquivo deste repositório com essa propriedade.** E há um segundo argumento, de adjacência: **`CLAUDE.md:70` já carrega o vocabulário fechado de componentes** — que é exatamente o **referente da exceção**. Regra e exceção passam a morar a 4 linhas uma da outra, e `CA-F1-2` fica satisfeita por um `grep` num arquivo só.

**Decisão, em duas metades e com uma proibição explícita:**

| onde | o que vai | o que **não** vai |
|---|---|---|
| **`CLAUDE.md`** (seção nova, adjacente a *"Vocabulário fechado de componentes"*) | **normativo**: a regra em uma linha, a tabela de fronteira de 12 linhas de `PRD-002` §3.1 com `[Q1]`/`[Q2]` resolvidas conforme §6/§7, a exceção literal, e a frase *"idioma de identificador é convenção, não portão"* com o gatilho de reabertura de `ADR-013/D2e` | — |
| **`README.md`** da raiz, §*"Idioma de docstring é convenção, não portão"* (linha 83, o precedente de `D1.10`) | **ponteiro**: o título generaliza para **idioma de identificador**, e o corpo aponta para `CLAUDE.md` | **NENHUMA cópia da tabela.** Duas cópias divergem, e `PRD-002` §3.2 já mede o custo de duas verdades sobre a mesma superfície |

**Por que não `docs/CONVENCOES.md` novo:** um arquivo novo em `docs/` não é lido por ninguém por construção — `bootstrap_docs` não o listaria e `CLAUDE.md` teria de apontá-lo, o que é o mesmo custo com um salto a mais. **`[INFERRED: nenhum arquivo de `docs/` tem garantia de leitura; `bootstrap_docs` tem 1 elemento e não é extensível por agente]`**

**Falsificador de `[Q3]`:** se, três fases adiante, um agente escrever identificador em português **tendo o `CLAUDE.md` no contexto**, então o lugar não era o problema e a doutrina não alcança — e o certo é reabrir `ADR-013/D2e`, não mudar o arquivo de lugar. **O sintoma é observável:** `CA-F1-6` (§5) mede erosão a cada fase.

---

## 3. Contratos de nome — a tabela de renomeação é **normativa e fechada**

Os nomes abaixo **substituem as sugestões** de `PRD-002` §6/`U3`. Congelados em `5f4ece0`.

### 3.1 `F2` · `backend/tests` — 2 arquivos

| de | para |
|---|---|
| `backend/tests/sentimento/test_durabilidade_da_infra.py` | `backend/tests/sentimento/test_infrastructure_durability.py` |
| `backend/tests/sentimento/test_etl_backlog_retomavel.py` | `backend/tests/sentimento/test_resumable_etl_backlog.py` |

**`sentimento/` NÃO muda** — exceção de `PRD-002` §3.1/linha 9, `[DECISÃO-OWNER: 2026-08-29, escolha entre alternativas apresentadas]`.

**Os 40 identificadores — mapa fechado, sem reticências.** *(`test_infrastructure_durability.py`, 7)*
`chamadas`→`calls` · `destino`→`destination` · `espia`→`spy` · `parcial`→`partial` · `visto`→`seen` · `test_checkpoint_faz_fsync_e_a_linha_ja_esta_no_arquivo_quando_ele_ocorre`→`test_checkpoint_fsyncs_and_the_line_is_already_in_the_file_when_it_happens` · `test_worker_faz_fsync_no_parcial_antes_do_rename_atomico`→`test_worker_fsyncs_the_partial_before_the_atomic_rename`

*(`test_resumable_etl_backlog.py`, 33)*
`CheckpointVolatil`→`VolatileCheckpoint` · `ContadorDeTrabalho`→`WorkCounter` · `UNIVERSO`→`UNIVERSE` · `_conferir_saida_integra`→`_assert_output_intact` · `_semear`→`_seed` · `alvo`→`target` · `ambiente`→`env` · `ausente`→`missing` · `contador`→`counter` · `esperado`→`expected` · `limite`→`limit` · `mortos_com`→`killed_at` · `processados`→`processed` · `processo`→`process` · `publicados`→`published` · `quantos`→`how_many` · `reinicio`→`restart` · `residuos`→`leftovers` · `retomada`→`resumed` · `so_linha_em_branco`→`blank_line_only` · `vazio_path`→`empty_path` · `test_cauda_truncada_e_descartada_e_o_resto_sobrevive`→`test_a_truncated_tail_is_discarded_and_the_rest_survives` · `test_checkpoint_ausente_ou_vazio_devolve_janela_inteira`→`test_a_missing_or_empty_checkpoint_returns_the_whole_window` · `test_checkpoint_fora_da_janela_e_erro_e_nao_ruido`→`test_a_checkpoint_outside_the_window_is_an_error_not_noise` · `test_checkpoint_volatil_reprocessa_a_janela_inteira`→`test_a_volatile_checkpoint_reprocesses_the_whole_window` · `test_drenagem_completa_processa_cada_arquivo_uma_unica_vez`→`test_a_complete_drain_processes_each_file_exactly_once` · `test_janela_declarada_recusa_chave_repetida`→`test_a_declared_window_refuses_a_repeated_key` · `test_janela_declarada_recusa_chave_vazia`→`test_a_declared_window_refuses_an_empty_key` · `test_linha_completa_ilegivel_e_corrupcao_e_nao_e_tolerada`→`test_an_unreadable_complete_line_is_corruption_and_is_not_tolerated` · `test_matar_o_processo_no_meio_e_retomar_nao_duplica_nem_perde`→`test_killing_the_process_midway_and_resuming_neither_duplicates_nor_loses` · `test_pendente_preserva_a_ordem_declarada`→`test_pending_preserves_the_declared_order` · `test_reprocessar_o_mesmo_item_nao_muda_o_resultado_nem_deixa_parcial`→`test_reprocessing_the_same_item_changes_nothing_and_leaves_no_partial` · `test_segunda_drenagem_sem_falha_nao_refaz_nada`→`test_a_second_drain_without_failure_redoes_nothing`

**`so_linha_em_branco`→`blank_line_only` merece nota:** `so` é o token que fez o `/qa` da `T-02.3` acusar 46 linhas de português por engano, e **`so` é inglês**. O falso positivo do instrumento é identificador real desta árvore. **A classificação dos 40 é HUMANA e assinada; nenhum dicionário a produziu**, e é isso que a torna critério de aceite em vez de estimativa.

### 3.2 `F3` · `frontend/src` — 4 arquivos + 1 diretório

| de | para | identificadores |
|---|---|---|
| `frontend/src/app/rotas.ts` | `frontend/src/app/routes.ts` | `ROTAS`→`ROUTES` · `Rota`→`Route` · chave `painel:`→`panel:` |
| `frontend/src/components/ui/formatar-percentual.ts` | `frontend/src/components/ui/format-percentage.ts` | `formatarPercentual`→`formatPercentage` · `razao`→`ratio` · `casas`→`digits` · `sinal`→`sign` |
| `frontend/src/features/painel/` | `frontend/src/features/panel/` | — |
| `frontend/src/features/painel/config.ts` | `frontend/src/features/panel/config.ts` (nome-base já é inglês) | `configPainel`→`panelConfig` |
| `frontend/src/features/painel/Filtro.tsx` | `frontend/src/features/panel/Filter.tsx` | componente `Filtro`→`Filter` |

**Três coisas que NÃO mudam em `F3`, e a omissão de qualquer uma delas reprova a fase:**

1. **O texto JSX `<p>Filtro: any resultado serve</p>` fica literal.** A palavra `Filtro` **sobrevive dentro da string e isso é correto** — a evidência é a posição sintática do token `any`, não o nome do arquivo (`ADR-011/D4`, bancada `D1.3b`).
2. **`{ retry: 3, any: true }` fica literal** — `any` como chave de objeto é a outra metade da mesma bancada.
3. **O valor `"/painel"` fica em português** até `[Q2]` voltar (§7). ⇒ o arquivo conterá a linha `panel: "/painel"`, **mista de propósito**. Um builder que "arrumar" isso reprova a fase.

---

## 4. O verificador de âncora — contrato, tipado e de dois lados por token

Adotado de `PRD-002` §12 **sem emenda ao mecanismo**, com a regra de seleção de `ADR-015/D1` e a granularidade de `ADR-015/D2`.

**Onde ele mora:** **em lugar nenhum permanente.** Ele **expira** com a renomeação; criar alvo de `make` paga custo permanente por benefício de duas fases, e é o falsificador nº 4 de `ADR-012/D5(b)` e o que matou o arquivo-dourado de `ADR-013/D2c`. ⇒ **o comando vai inline no DoD da fase**, e nada é versionado. Confirma a recomendação `A2` do `/pm`.

### 4.1 A forma do critério — **nunca uma contagem**

**`[G-A1]`, e é a regra que impede o defeito de se repetir:** o conjunto de citadores **cresce por causa desta própria feature**. Entre `7af0e4f` e `5f4ece0`, a `ADR-013` mergeou e virou citadora: `Filtro.tsx` foi de **9** para **10** arquivos, `Filtro` de **12** para **13** `[MEDIDO 2026-08-29]`. **O `PRD-002`, esta SPEC, a `ADR-015`, os cinco planos e os handoffs serão citadores também.**

> **⇒ Nenhum critério desta SPEC diz *"as N citações"*, e nenhuma task pode dizer.** O critério é sempre **classe + conjunto enumerado + rev**. Uma contagem é uma lista aberta com aparência de fechada (`PRD-002` `RN-6`).

### 4.2 O conjunto VIVO e o HISTÓRICO — enumerados **por token**, nunca por feature

**`[G-A2]`:** `PRD-002` §5.2 apresenta como *"a divisão das 9"* uma tabela de **12** entradas que inclui `backend/README.md`, o qual **não casa `Filtro` nem `Filtro.tsx`** — ele cita `features/painel`. **As listas operacionais de `CA-U3-4` estão certas** (são a união sobre todos os tokens de `F3`); o que está errado é a frase que descreve o próprio conjunto. Consertado assim:

| token | tipo (`ADR-015/D1`) | escopo | VIVOS (atualizar, atômico) | HISTÓRICOS (não tocar) |
|---|---|---|---|---|
| `Filtro.tsx` | CAMINHO | integral | `harness.toml` · `frontend/README.md` · `docs/context/…/tasks.toml` · `docs/context/…/handoff_to_builder.md` | `docs/INDEX.md` · `ADR-003` · `ADR-011` · `ADR-012` · **`ADR-013`** · `docs/plans/…/01_governanca_gateante.md` |
| `features/painel` | CAMINHO | integral | `harness.toml` · `frontend/README.md` · `backend/README.md` | `docs/INDEX.md` · `ADR-003` · `ADR-011` · `ADR-012` · `ADR-013` · `docs/plans/…/01_…md` |
| `rotas.ts` · `formatar-percentual.ts` | CAMINHO | integral | `frontend/src/components/ui/…` · `docs/context/…/tasks.toml` | — |
| `ROTAS` · `Rota` · `formatarPercentual` · `razao` · `casas` · `sinal` · `configPainel` | IDENTIFICADOR | **só código** | `backend/src` · `backend/tests` · `frontend/src` | — |
| `test_durabilidade_da_infra` · `test_etl_backlog_retomavel` | IDENTIFICADOR, **escopo ampliado para integral com `n` declarado** (`ADR-015`/Consequência) | integral | `backend/README.md` (5 linhas) · `backend/src/…/jsonl_checkpoint.py:22` · o outro arquivo de teste | `docs/INDEX.md` |
| **`Filtro`** (palavra) | **INADMISSÍVEL em qualquer escopo** | — | — | é a evidência de `CA-F3-2`; verificado por `grep -F` de igualdade, não por ausência |

**`docs/proposta-discovery.md` e `docs/specs/PRD-001-plataforma-dados.md`** casam a palavra `Filtro` e **não** o caminho: **fora do universo do verificador por `ADR-015/D1`**, e HISTÓRICOS de qualquer modo.

### 4.3 O `rc` é **por token**, e o lado MORDE é declarado antes

**`[G-A4]` / `ADR-015/D2`.** O DoD da fase declara, por token, o `n` do lado MORDE medido em `5f4ece0` **antes** de renomear, e exige **`0` por token** depois. **Um token com MORDE `n=0` reprova a fase no ato da declaração.**

| token | MORDE `n` em `5f4ece0` |
|---|---|
| `Filtro.tsx` | **8** |
| `painel/` | **17** |
| `rotas.ts` | **1** |
| `formatar-percentual.ts` | **1** |
| `configPainel` | **1** |
| `ROTAS` | **2** |
| `formatarPercentual` | **1** |
| `test_durabilidade_da_infra` | **4** |
| `test_etl_backlog_retomavel` | **3** |

`[MEDIDO 2026-08-29 em 5f4ece0, escopo por tipo conforme ADR-015/D1]`

### 4.4 `CA-F3-6` reescrita — `classify` sozinho não é evidência

**`[§0.4]`.** A forma vácua era *"`classify` devolve `producao` nos 4 novos"*. A forma de dois lados, e as três metades são obrigatórias:

1. `test -f` em cada um dos **4 caminhos NOVOS** → **`rc=0`** (o arquivo nasceu);
2. `test -f` em cada um dos **4 caminhos ANTIGOS** → **`rc=1`** (o arquivo morreu — é este lado que pega o rename para o lugar errado);
3. **só então** `harness code-paths classify` nos 4 novos → **`producao`**, a mesma classificação de hoje.

**Sem o passo (2), o critério passa sobre uma árvore em que o rename não aconteceu**, porque `classify` é cego à existência. Com os três, ele mede a árvore.

---

## 5. Os critérios de aceite, por fase — forma e falsificador

As formas são as do `PRD-002` §0/2: **(a)** enumeração de arquivo · **(b)** lista fechada congelada num rev · **(c)** igualdade de string sobre conjunto enumerado · **(d)** falsificador comportamental · **(f)** evidência preservada. **Nenhum critério desta SPEC é *"está em inglês"*.**

Os critérios de aceite integrais, com o comando e o universo de cada um, vivem nos arquivos de fase em [`docs/plans/SPEC-002-codigo-em-ingles/`](../plans/SPEC-002-codigo-em-ingles/index.md). Os **três** que mudam de forma em relação ao `PRD-002` estão acima (§4.2, §4.3, §4.4); os demais são adotados como escritos, renumerados de `CA-Un-k` para `CA-Fn-k`.

**A linha de base comportamental de `CA-F2-3`, que o `PRD-002` exigia sem ter os números — medida agora:**

```
$ make test
107 passed in 5.88s
TOTAL   370 statements   0 miss   54 branch   0 partial   100%
[OK] domain 100.0% [124/124] · [OK] use_cases 100.0% [52/52] · [OK] infra 100.0% [194/194]
universo: 3 camada(s) medida(s) de 3 declarada(s)
$ make lint     # All checks passed! · 29 files formatted · no issues in 29 source files · eslint src limpo
```

`[MEDIDO 2026-08-29 em 5f4ece0, worktree com .venv; make lint rc=0, make test rc=0]`

> **`CA-F2-3` congela estes números.** Depois de `F2`: **107 testes**, **370 statements**, **54 branches**, **124/52/194 por camada**. **Qualquer divergência reprova, inclusive para mais** — se a suíte passar com número diferente de statements, a renomeação virou reescrita e ninguém viu.
>
> ⚠️ **Sem `.venv`, `make lint`/`test`/`boundaries` recusam com `rc=3` = "não mediu", que NÃO é "passou".** Um DoD satisfeito com `rc=3` é falso-verde.

**`CA-F1-6` — o medidor de erosão da exceção, e é o único critério desta SPEC que continua valendo depois de a feature fechar** (adotado de `ADR-013/D3` via `PRD-002`):

```
$ git ls-tree -r --name-only <rev> | grep -E '^(backend/src|backend/tests|frontend/src)/' \
    | awk -F/ '{for(i=1;i<NF;i++) print $i}' | sort -u \
    | grep -vxE 'sentimento|charts|convergencia|backtest|web|docs'
app backend components domain features frontend helpers infra modules painel src tests ui use_cases
```

`[MEDIDO 2026-08-29 em 5f4ece0: 14 segmentos sobrevivem ao filtro; leitura à mão diz 13 inglês e 1 português — `painel`]`
**Hoje MORDE:** o conjunto de segmentos portugueses é `{sentimento, painel}`, **tamanho 2**. **Depois de `F3` CALA:** vira `{sentimento}`, **tamanho 1**, e `sentimento` casa por igualdade de string com `harness policy --key components`. **Um terceiro elemento, em qualquer fase futura, é a evidência de que a exceção virou rampa.**

**`CA-F1-4` — nenhuma regra nasce.** `harness rules list --severity block` devolve **as mesmas 7** de hoje (`core.relative-import`, `core.silent-except`, `core.print-statement`, `core.hardcoded-secret`, `web-fullstack.browser-imports-server`, `web-fullstack.tenant-from-request`, `web-fullstack.server-test-directory-present`) `[MEDIDO 2026-08-29]`, e `git diff master -- harness.toml` **não contém** a substring `[[rules.own]]`. **`ADR-011/D1.10`: declarar uma `[[rules.own]]` de idioma REPROVA a fase.**

**Baseline de `harness rules --mode sweep`: 1 `[AVISO]` (`web-fullstack.browser-test-file-present`), 0 `[BLOQUEIO]`, `rc=0`** `[MEDIDO 2026-08-29 em 5f4ece0]` — e continua **1 aviso** depois de `F3`. Fechá-lo é dívida de outra trilha.

---

## 6. `[Q1]` · Evento de log — **eu decido a metade prospectiva; o owner fornece um FATO, não uma decisão**

O coordenador me pediu para julgar se `[Q1]` é mesmo pergunta de owner. **Não é uma pergunta. São duas, e elas têm donos diferentes** — e é por isso que ela vinha travada.

### 6.1 A metade que é minha, e eu a decido agora: **evento de log novo nasce em inglês**

**Nome de evento de log e chave de `extra={}` entram no universo do inglês, prospectivamente, a partir de `F1`.** `[INFERRED: aplicação de `ADR-013/D3` linha 1 a uma superfície que ela não enumerou — a string em `logger.info("…")` é escrita em código, por quem escreve o código, e nenhuma leitura de *"todo código gerado é em inglês"* a exclui]`

**Por que isto não precisava do owner, e o custo de ter esperado está medido.** A superfície tem **9 eventos: 4 em português, 5 em inglês**, e os dois grupos nasceram **no mesmo mês**. O próprio repositório registra a causa:

> *"o código novo é **todo em inglês** … o que cria um **segundo vocabulário de observabilidade** ao lado do que já existe em português … **Nada existente foi renomeado.** A divergência é **decisão de leitura do agente**, não citação do owner"* `[DOC: docs/INDEX.md:68]`

⇒ **A divergência nasceu de a superfície não ter dono declarado.** Mandá-la ao owner como pergunta de idioma mantém a superfície sem dono por mais um round, e **cada task que rodar nesse intervalo decide por hábito** — que é exatamente como os 4 e os 5 apareceram. **Convenção de código é minha por `ADR-013/D1`; esta é convenção de código.**

### 6.2 A metade que é do owner, e é **factual**: *"alguma coisa que você roda lê estes nomes?"*

**Renomear os 4 eventos existentes** é outra coisa: classe **D** de `PRD-002` §5.1 — **chave de consulta operacional**, consumidor fora do repositório, **quebra silenciosa** (a query devolve zero linhas com `rc=0`).

**O que eu medi:** **0** dashboards, alertas ou coletores versionados `[MEDIDO 2026-08-29: git ls-files | grep -icE 'dashboard|alert|grafana|prometheus|loki|logql' → 0]`. **O que isso NÃO prova:** que não há consumidor. `ingest_health_cli.py:69` diz em docstring que *"a scheduler or a supervisor calls `logging.basicConfig(stream=sys.stdout, level=INFO)`"* — **o desenho antecipa um hospedeiro externo**, e o que roda na VPS do owner está fora do meu alcance.

> **⇒ Ao owner vai um FATO, não uma escolha:** *"alguma query, alerta, dashboard ou script fora deste repositório consulta os nomes `etl_item_publicado`, `etl_item_concluido`, `etl_drenagem_concluida`, `checkpoint_cauda_truncada`, ou as chaves `destino`, `processados`, `janela`, `bytes_descartados`?"* **Sim ou não. Nenhuma das duas respostas bloqueia qualquer fase desta SPEC.**

### 6.3 A regra condicional, escrita agora para que a resposta não precise de mais um round

| resposta do owner | o que acontece |
|---|---|
| **não há consumidor** | os 4 eventos e as 4 chaves migram numa fase própria e futura, com rename direto, **fora do escopo desta SPEC** |
| **há consumidor** (ou o owner não sabe) | migração com **emissão dupla** por uma janela declarada — o evento novo passa a ser emitido **ao lado** do antigo, e o antigo só sai depois de o owner confirmar que a consulta migrou. **`[NÃO SEI]` qual janela**, porque depende do que o consumidor é |
| **sem resposta** | **nada acontece com os 4, e nada trava.** `F1` escreve a regra prospectiva; a superfície passa a ter dono; a divergência **para de crescer** mesmo que não encolha |

**Falsificador de §6.1:** se, duas fases adiante, um evento novo nascer em português **tendo o `CLAUDE.md` no contexto**, a decisão prospectiva não pegou e a superfície precisa de mecanismo, não de doutrina. **O sintoma é observável e barato:** `grep -rnE 'logger\.(info|warning|debug|error)\("' backend/src` e conte os portugueses. **Hoje são 4, e o número não pode subir.**

---

## 7. `[Q2]` · Segmento de URL — **fica aberta, e a SPEC declara o que fazer sem ela**

**`[Q2]` é do owner e eu não a decido** — ela está exatamente sobre a linha que `PRD-002` §3.2 traçou por remissão a `SPEC-001` §3.8 (`pt-BR` para superfície visível). **Decidi-la aqui criaria as duas verdades que §3.2 existe para evitar.**

**O que a SPEC fixa sem ela:** em `F3`, a **chave** `painel:` vira `panel:` (é identificador, `PRD-002` §3.1/linha 1) e o **valor** `"/painel"` **fica**. A linha mista é deliberada e está em §3.2/item 3.
**Custo de deixar aberta:** hoje **1 rota**. Na fase `05` de `SPEC-001` são muitas, e trocar URL depois quebra bookmark e link. **A pergunta é barata agora e monotonicamente mais cara depois** — mas não bloqueia nada aqui.

---

## 8. `[GAP G1]` fechado com gatilho nomeado · coluna de contrato

`janela_de_perda` fica em português por herança de `ADR-008/D3`, e a exceção **já está escrita em código de produção com o motivo** (`ingest_record.py:87-89`). O `PRD-002` `[GAP G1]` observa que **ninguém marcou o momento de reabrir.** Marco:

> **Gatilho:** a reabertura acontece quando `T-07.12`/`T-07.13` (fase `07`, componente `web`) escrever o consumidor da projeção. **Quem decide é `ADR-008/D3`, não esta feature.** A pergunta que volta é *"a coluna vira `loss_window`?"*, e ela volta **com dado já gravado atrás dela** — a ordem das 15 colunas alimenta o `sha256` da projeção canônica (`ADR-008/DoD-2`), logo renomear muda a impressão digital de **todo** relatório já emitido. ⇒ **é mudança de contrato, não de estilo, e exige plano de migração do fingerprint.**

`CA-F4-2` exige que esta linha esteja escrita no `CLAUDE.md` citando `ADR-008/D3`.

---

## 9. Non-goals desta SPEC

Além dos 11 do `PRD-002` §8, que ficam de pé: **não altero a `ADR-013`** (`ADR-015/D3` registra a correção de uma linha da tabela dela **sem editá-la**) · **não escrevo o glossário** (`ADR-013/D4`) · **não decido `[Q2]`** · **não renomeio os 4 eventos de log nesta SPEC** (§6.3) · **não crio `Filter.test.tsx`** nem fecho o aviso `browser-test-file-present` · **não movo o ledger, não crio task, não escrevo código.**

---

## 10. O que esta SPEC não decide, e quem decide

| item | decide |
|---|---|
| `[Q2]` — segmento de URL | **owner** |
| existe consumidor dos 4 eventos de log? (§6.2) | **owner — e é fato, não escolha** |
| `approve codigo-em-ingles spec` e `approve … build` | **owner** — `CLAUDE.md`, e não há rota que os evite |
| `advance PRD_VALIDATED` / `SPEC_DRAFT`, `approve prd` | **coordenador** |
| as tasks | **`/tech-lead`**, depois de `SPEC_APPROVED` |
| reabrir a coluna de contrato | `ADR-008/D3`, no gatilho de §8 |
| reabrir a proibição de portão de idioma | **apenas** o gatilho de `ADR-013/D2e`: glossário sob `glossary_doc` **mais** lista de vocabulário de biblioteca, sobre corpus de retenção `n ≥ 88`, com **0** falso positivo e ≥ 90% de acerto |
