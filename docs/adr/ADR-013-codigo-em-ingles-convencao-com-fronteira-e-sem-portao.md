# ADR-013 — Código em inglês é convenção com fronteira escrita, e o portão não existe hoje: eu medi por quê

**Data:** 2026-08-29 · **Status:** **aceito** (atualizada em 2026-08-29 com as duas respostas do owner) · **SPEC:** — (a decisão é do repositório, não de `SPEC-001`)
**Fase/Epic:** — · **Componente alvo:** `docs`
**Origem:** achado do owner em 2026-08-29, medido e re-medido nesta árvore (`master@01ec5a8`)
**Supersede/estende:** `ADR-011/D6` (idioma de **docstring** — convenção, não portão). Esta ADR **não** o revoga: estende o mesmo veredito ao **identificador** e ao **nome de caminho**, com bancada própria e um falsificador construtivo que `D6` não tinha.

> *"Assim como docstring, todo código gerado é em inglês, olhando no front, ta tudo em portugues, nome dos arquivos, var, tudo."*
> `[PREMISSA-OWNER: 2026-08-29, citação literal]`

**Fecha três perguntas:**

| pergunta | decisão | quem fechou |
|---|---|---|
| onde a regra mora — task em `plataforma-dados` ou a feature órfã? | **D1** — feature própria, **renomeada**. **Executado**: `docstrings-em-ingles` → `REJECTED`, `codigo-em-ingles` → `INIT` | proposta do `/architect`, **decidida e executada pelo owner em 2026-08-29** |
| isso pode ter portão, ou é doutrina? | **D2** — **doutrina.** Três portões candidatos medidos e **os três recusados**, com o número que recusa cada um. **Inalterada nesta revisão**, e reforçada por evidência de campo de dois auditores independentes | `/architect` |
| qual é a fronteira do universo? | **D3** — escrita item a item, e a colisão **FECHADA**: o vocabulário de componentes é **exceção declarada** | proposta do `/architect`, **decidida pelo owner em 2026-08-29** |
| o `glossary_doc` vazio que o falsificador de `D2` encontrou | **D4** — **dívida com dono nomeado**, promovida a decisão própria nesta revisão | `/architect` |

---

## Contexto

### Três correções ao enquadramento que eu recebi — medidas antes de qualquer decisão

Este repositório cobra *"nenhum número sem o comando que o produziu"*. Eu reproduzi os três números que me foram entregues e **dois não bateram**. Registro aqui porque a correção muda o diagnóstico, não só o dígito.

**(1) `backend/src` tem 23 declarações, não 26.** Comando verbatim do enquadramento, rodado nesta árvore:

```
$ grep -rnoE '\b(def|class) [a-zA-Z_0-9]+' backend/src --include='*.py' | wc -l
23
```

`[MEDIDO 2026-08-29 em `01ec5a8`]` · O **veredito** do enquadramento estava certo e continua: **0 das 23 em português**, lidas uma a uma. O universo é que era 13% menor do que o anunciado. Quarta vez nesta trilha que um número correto de conclusão viaja com um universo errado.

**(2) `T-01.7` nunca tocou `frontend/`. Zero arquivos.** E isto **desmonta a hipótese de "universo menor que a intenção"** para o frontend:

```
$ git show --name-only --format='' b0c2df3 | grep -c '^frontend/'
0
```

`[MEDIDO 2026-08-29]` · Os 4 arquivos de `frontend/src` — **e os 4 docstrings em inglês dentro deles** — nasceram em **`T-01.2`** (`e8c08d4`, 2026-08-28), não em `T-01.7`.

> **⇒ O achado é mais forte do que "a regra teve universo pequeno demais". No frontend não havia regra nenhuma.** O mesmo agente, no **mesmo commit**, no **mesmo dia**, escreveu um docstring em inglês e um identificador em português **a uma linha de distância**. O inglês do docstring não veio de convenção declarada — veio de hábito internalizado. Um universo pequeno demais é uma regra mal calibrada; **hábito não é regra, e não tem calibração para corrigir.**

E em `backend/tests` — onde `T-01.7` de fato entrou e traduziu 10 docstrings — **a fronteira que a deixou passar ao lado dos 14 nomes era explícita, obrigatória e tinha falsificador**:

> *"FRONTEIRA DO QUE ESTA TASK PODE TOCAR: APENAS o conteudo de docstring. Nenhuma assinatura, nenhum nome, nenhum comportamento."* `[DOC: docs/context/plataforma-dados/tasks.toml, T-01.7]`

O falsificador dela (`ast.dump` idêntico 13/13 com as docstrings removidas) **teria reprovado uma renomeação**. ⇒ **`T-01.7` não errou: ela obedeceu.** O defeito não é dela nem da regra dela — é que **nenhuma task jamais teve o identificador como sujeito**. Lacuna entre tasks, não dentro de uma.

**(3) `config.ts` tem nome em inglês.** O enquadramento diz *"4 de 4 arquivos, nome E identificadores em português"*. Medido: **3 de 4** nomes-base são portugueses (`rotas.ts`, `formatar-percentual.ts`, `Filtro.tsx`). `config` é inglês — o que é português é o **diretório** que o contém (`features/painel/`). A distinção não é preciosismo: ela separa duas superfícies (**nome-base** × **segmento de diretório**) que `D3` decide separadamente.

### O universo, medido

| superfície | identificadores | nomes de caminho | veredito |
|---|---|---|---|
| `backend/src` | **23 declarações, 0 em português** | 1 segmento PT: `sentimento` (deriva de `components`) | conforme, **exceto** o segmento derivado |
| `backend/tests` | **19 em português** de 27 distintas (14 `test_*` + `_semear`, `_conferir_saida_integra`, `ContadorDeTrabalho`, `CheckpointVolatil`, `espia`) | **2 de 3** arquivos (`test_durabilidade_da_infra.py`, `test_etl_backlog_retomavel.py`) + segmento `sentimento` | não conforme |
| `frontend/src` | **9 em português** (`ROTAS`, `Rota`, `formatarPercentual`, `razao`, `casas`, `sinal`, `configPainel`, `Filtro`) | **3 de 4** nomes-base + segmento `painel` | não conforme |
| `frontend/src` — docstrings | **4 blocos JSDoc, 4 de 4 em inglês** `[MEDIDO 2026-08-29: `grep -rc '^/\*\*' frontend/src`]` | — | conforme |

`[MEDIDO 2026-08-29, todos em `01ec5a8`; comandos em `docs/INDEX.md` e reproduzidos ao longo desta ADR]`

### O universo, RE-MEDIDO em `7af0e4f` — porque a minha própria linha de base envelheceu

**Esta ADR nasceu sobre `01ec5a8`. Ao trazer o `master` (`7af0e4f`, `T-02.3` + `T-02.4a`) o universo cresceu, e um número de linha de base que não é re-medido é exatamente o defeito que esta ADR persegue.** Re-medido com o **meu próprio detector** (variante `D` + glossário), sobre declarações (`def`/`class`/`const`/`let`/`function`/`type`/`interface`) e nomes de arquivo:

| superfície | identificadores/nomes distintos | acusados de português | antes (`01ec5a8`) |
|---|---|---|---|
| `backend/src` | **78** | **0** | 23 decl · 0 |
| `backend/tests` | **149** | **19** | 27 decl · 19 |
| `frontend/src` | **10** | **8** | 10 · 8 |
| **total** | **237** | **27** | — |

`[MEDIDO 2026-08-29 em `7af0e4f`, detector da bancada de `D2a`]`

> **⇒ O achado é forte e é a favor de `D2`: `backend/src` mais que TRIPLICOU (23 → 78) e continua em ZERO português. E `backend/tests` ganhou 73 nomes de teste NOVOS — todos em inglês — sem que o número de acusados subisse um único ponto (19 antes, 19 depois).**
>
> ```
> $ comm -23 <(nomes de teste em 7af0e4f) <(nomes de teste em 01ec5a8) | wc -l
> 73        # ex.: test_absent_sidecar_refuses_instead_of_assuming_the_file_is_fine,
>           #      test_killing_the_recorder_mid_run_keeps_every_committed_record
> ```
>
> `[MEDIDO 2026-08-29]` · **Os 19 acusados de hoje são exatamente os 19 de ontem.** A convenção está sendo seguida **sem portão nenhum**, por tasks que nem sabiam desta ADR — `T-02.3` e `T-02.4a` fecharam antes de ela mergear. **É a evidência mais direta que existe de que a doutrina de `D2` está segurando**, e ela não foi construída por mim.

**Limite declarado do método, para ninguém o vender como mais do que é:** o detector vê **declaração e nome de arquivo**, não **parâmetro**. `razao` e `casas`, parâmetros de `formatarPercentual`, são portugueses e **não estão** nos 27. ⇒ **27 é piso, não teto.**

> **⚠️ E rodá-lo sobre a árvore real produziu DOIS FALSOS POSITIVOS que a bancada sintética não tinha previsto — em nomes de DIRETÓRIO:** dos 15 segmentos distintos, o detector acusa **4**: `painel`, `sentimento`, **`infra`** e **`ui`**. **`infra` e `ui` são inglês** (*infrastructure*, *user interface*) — abreviações técnicas correntes, que é **exatamente a família que `D2b` nomeou** (`oi`, `os`, `sem`, `com`). **Eu não os previ, e eles apareceram sozinhos, na primeira vez que apontei o instrumento para a árvore inteira em vez de para o corpus que eu tinha escrito.** Isso não enfraquece `D2` — **confirma-a pelo lado mais desconfortável**, que é o instrumento errando contra o seu autor.


> **⚠️ A última linha da tabela falsifica, de fato, uma afirmação publicada.** O plano `01` (`01_governanca_gateante.md:110`) recomenda encerrar a feature órfã, e o falsificador dessa recomendação diz: *"se o owner a criou para trabalho de docstring **fora** de `backend/` — o `frontend/`, por exemplo, **que não tem docstring nenhuma medida**"*. **O frontend tem 4 docstrings, e as 4 estão em inglês.** O parêntese era `[NÃO MEDIDO]` vestido de fato, e é falso. ⇒ **A condição literal daquele falsificador não dispara** (não há docstring portuguesa fora de `backend/`). O que dispara é outra coisa, que ele não previu, e `D1` a trata.

---

## Decisão

### D1 · A convenção mora em **feature própria, renomeada** — e o nome `docstrings-em-ingles` não sobrevive

**Escolho (b), com o nome trocado.** A trilha correta é: `advance docstrings-em-ingles REJECTED "<motivo>"` + `init codigo-em-ingles`.

> **✅ EXECUTADO PELO OWNER em 2026-08-29 — esta secção foi escrita como proposta e agora é fato.** Os dois atos estão no ledger, e o ledger é a identidade do estado:
>
> ```
> $ harness pipeline show docstrings-em-ingles
> ▸ docstrings-em-ingles — estado atual: REJECTED
>     2026-08-28T19:45:52Z  override  execução sem risco
>     2026-08-29T12:06:17Z  advance   REJECTED — Escopo nunca declarado (1 evento no ledger, um override de
>                                     2026-08-28). O owner declarou em 2026-08-29 'todo codigo gerado e em
>                                     ingles' — escopo MAIOR que o nome desta feature, que so cobre docstring.
>                                     ADR-013 (PR #18) decide: encerrar aqui e abrir 'codigo-em-ingles' com o
>                                     escopo correto. […] Decisao do owner em 2026-08-29.
>
> $ harness pipeline show codigo-em-ingles
> ▸ codigo-em-ingles — estado atual: INIT
>     2026-08-29T12:06:25Z  init      INIT
> ```
>
> `[MEDIDO 2026-08-29, re-lido do ledger nesta revisão e não repassado do enunciado]` · **`REJECTED` e não `DONE`**, como `D1` pedia, e **com motivo escrito** — que é o que o `harness` exige (`pipeline.sh:617`) e o que preserva a história. **O owner aceitou explicitamente os dois gates dele** (`approve spec`, `approve build`) no caminho de `codigo-em-ingles`.

**Por que não (a), task em `plataforma-dados`.** Três razões, em ordem de força:

1. **A propriedade sobrevive à SPEC.** `SPEC-001` é plataforma de dados. A convenção governa `sentimento`, `charts`, `convergencia`, `backtest`, `web` e `docs` — os **seis** componentes, incluindo quatro que `SPEC-001` nunca toca. Pendurá-la em `plataforma-dados` faz a casa da convenção **morrer junto com a feature** no dia do `advance DONE`. Uma convenção cuja casa tem data de validade é uma convenção que ninguém encontra no mês seguinte.
2. **A decisão que falta é de produto, não de execução.** `D3` termina numa pergunta ao owner sobre o vocabulário fechado de componentes. Isso é escopo, e escopo nasce em PRD — não em `refs` de task de uma fase já autorizada. Materializar como task herdaria o gate `build` **sem** que ninguém tivesse aprovado o escopo, que é a definição de atalho de portão.
3. **Timing medido.** Duas tasks de backend estão em worktrees agora sobre `backend/src` e `backend/tests`. Uma task de renomeação sobre os mesmos caminhos é fábrica de conflito. Isto é argumento de calendário, não de arquitetura — mas é decisivo para a metade backend e eu não vou fingir que não é.

**Por que o nome tem de mudar.** `docstrings-em-ingles` mente em **duas** direções: descreve um **subconjunto** do problema (docstring ⊂ identificador ⊂ nome de caminho), e descreve trabalho que está **feito** — `T-01.7` fechou com 55 docstrings em inglês, `/qa APPROVED` e `/review COMPLIANT`. Manter o nome é reproduzir exatamente o defeito que esta ADR conserta: **um rótulo cujo universo é menor que a intenção.**

**E a renomeação não é opcional por limitação da ferramenta, o que é conveniente:** o `harness` **não tem** subcomando `rename`.

```
$ grep -oE 'elif cmd == "[a-z-]+"|^if cmd == "[a-z-]+"' <plugin 0.13.0>/scripts/pipeline.sh
init dispatch approve advance override relate scope progress migrate-state state show
require-prd require-spec require-tasks tasks require-code
```

`[MEDIDO 2026-08-29, plugin v0.13.0, 17 subcomandos, nenhum `rename`]` · E o próprio plugin **prescreve** o caminho que eu escolhi, na mensagem de recusa de reabertura: *"Reabrir é ato explícito: `harness pipeline init <feature>` numa feature nova, **com nome novo**; ressuscitar a antiga apagaria o registro de que ela foi rejeitada."* `[DOC: scripts/pipeline.sh:610-612]`

**⇒ `REJECTED` e não `DONE`.** `DONE` afirmaria que a trilha entregou o que se propunha; ela nunca declarou escopo, então não há o que dar por entregue. `REJECTED` exige motivo escrito (`pipeline.sh:617`) — e o motivo é a linha que preserva a história: *"escopo real existe, e é maior que o nome; continua em `codigo-em-ingles`"*.

#### O custo de descartar (a), nomeado

**(a) é despachável hoje; (b) não é.** `plataforma-dados` está em `BUILD_AUTHORIZED` — o gate já está aberto. `codigo-em-ingles` nasce em `INIT` e o caminho até `BUILD_AUTHORIZED` passa por **4 aprovações** (`prd`, `spec`, `tasks`, `build` — `[MEDIDO: GATE_FOR em pipeline.sh:83-84]`), das quais **`spec` e `build` são do owner** e `CLAUDE.md` proíbe agente de dar.

**O preço concreto:** os 14 nomes de teste, os 3 nomes-base do frontend e os 9 identificadores do frontend **ficam na árvore por pelo menos um ciclo de ida-e-volta com o owner.** Eu aceito esse preço, e a razão é que a alternativa é pior de um jeito irreversível: renomear **antes** de a fronteira estar decidida significa renomear **duas vezes**, e a segunda renomeação atinge um alvo que a primeira já moveu.

#### E não, eu não abro uma exceção para o frontend — apesar de ela ser tentadora

O argumento a favor era bom: os 4 arquivos são dívida direta de `T-01.2`, dentro da própria `plataforma-dados`, e o frontend cresce na fase `05` (4 arquivos hoje, muitos depois). **Ele cai contra uma medição:**

```
$ git grep -l 'Filtro.tsx' 01ec5a8 -- .        # 9 arquivos versionados
docs/INDEX.md  docs/adr/ADR-003…  docs/adr/ADR-011…  docs/adr/ADR-012…
docs/context/plataforma-dados/handoff_to_builder.md   docs/context/plataforma-dados/tasks.toml
docs/plans/SPEC-001-plataforma-dados/01_governanca_gateante.md   frontend/README.md   harness.toml
```

`[MEDIDO 2026-08-29, ancorado em `01ec5a8`]`

**E o nono é o que decide.** `harness.toml:149-150` usa `Filtro.tsx` como a metade **CALA** de uma prova de dois lados:

```
#   harness rules --mode file --path frontend/src/features/painel/Filtro.tsx --surface ci
#   # -> saída VAZIA, exit=0   (o outro lado: a regra CALA sobre código legítimo)
```

> **⚠️ Renomear `Filtro.tsx` sem consertar `harness.toml` no mesmo commit converte uma prova de silêncio em FALSO POSITIVO DE CONFORMIDADE — e `ADR-012` já mediu exatamente essa armadilha.** `harness rules --mode file` sobre caminho **inexistente** devolve `rc=0` com saída de 0 byte, indistinguível de *"avaliado e limpo"*. O comentário continuaria dizendo *"a regra cala sobre código legítimo"*, o comando continuaria devolvendo verde, **e o verde passaria a vir de o arquivo não existir.** É o terceiro significado de `rc=0` que `ADR-012` nomeia como *"barato de cometer e caro de detectar"*.

⇒ **A renomeação do frontend é segura, mas não é barata, e o cuidado é escrevível:** ela é **atômica com** a atualização das 9 citações, e o `Filtro.tsx`/`config.ts` são **bancada de `D1.3b`** (`ADR-011/D4`) — o que os torna bancada não é o nome, é a **posição sintática** do token `any` (`JSXText` e chave de objeto). Renomear o **arquivo** e o **componente** preserva a evidência; **traduzir o texto JSX `"Filtro: any resultado serve"` a destrói**, porque a palavra `any` *dentro do texto* é o payload. `D3` separa os dois.

---

### D2 · Idioma de identificador **NÃO tem portão bloqueante hoje. É doutrina.** E eu recusei três portões, cada um com o número que o recusa

Eu resisti à resposta fácil nas duas direções. Construí a melhor aproximação que sei construir, medi as duas metades de `1.8'`, e ela é **muito melhor** que a aproximação de docstring de `ADR-011/D6` — e **mesmo assim não serve como bloqueio.**

#### D2a · A bancada, e ela é de dois lados

Bancada isolada em `scratchpad`, **fora do repositório do owner**. Segmentação por `_`, `-` e fronteira camelCase; prefixo `test` descartado (é API do pytest, não idioma). Cinco variantes:

| | detector | MORDE (33 identificadores PT, corpus de `01ec5a8`) | CALA (29 identificadores EN, mesmo corpus) |
|---|---|---|---|
| **A** | palavras-função PT (`de`, `da`, `nao`, `que`…) | 14/33 = **42,4%** | 0/29 |
| **B** | A + sufixos só-PT (`-cao`, `-vel`, `-mento`, `-agem`…) | 19/33 = **57,6%** | 0/29 |
| **C** | token ∉ dicionário EN **∧** ∈ dicionário PT-BR (acentuado) | 30/33 = **90,9%** | 0/29 |
| **D** | idem, PT-BR **dobrado** (acentos removidos) | 31/33 = **93,9%** | 0/29 |
| **E** | B ∪ D | 32/33 = **97,0%** | 0/29 |

`[MEDIDO 2026-08-29: bancada em diretório temporário; `/usr/share/dict/american-english` **n=104 334** e `/usr/share/dict/brazilian` **n=275 502**; corpora MORDE n=33 e CALA n=29 extraídos por `grep` da árvore `01ec5a8`]`

**A dobra dos acentos é o que faz a diferença, e ela existe por causa deste repositório em particular.** `razao` está no dicionário PT **dobrado** e `razão` não está no cru — porque a lista é acentuada e **este código escreve português sem acento** (`ADR-011/D6` mediu: `grep -rlP '[ãçõ]' backend/src` → **0 arquivos**). Um detector que não dobrar erra exatamente no estilo que este repo usa.

**E aqui está o resultado que eu não esperava e que é honesto reportar: a aproximação de identificador é MUITO melhor que a de docstring.** `ADR-011/D6` mediu **67% de recall** (12 de 18) para a lista de palavras-função sobre **prosa**. Sobre **identificador** a mesma família chega a **94%**. A razão é mecânica, não sorte: **identificador segmenta** — `_` e camelCase entregam tokens limpos, e prosa não entrega. ⇒ **O universo do identificador é genuinamente mais tratável que o do docstring**, e quem repetir *"idioma não é decidível, ponto"* estará repetindo `D6` sem re-medir.

#### D2b · E é exatamente por isso que a recusa precisa vir do OUTRO lado — e vem

Os `0/29` acima são o problema, não a virtude: **esse corpus CALA é o corpus contra o qual eu ajustei o detector.** 29 identificadores, todos da árvore de hoje. O universo que importa para um portão não é o código de hoje — é **todo identificador legítimo que este repositório ainda vai escrever**. Então montei um segundo corpus CALA, adversarial, com o vocabulário que **a própria `SPEC-001` e o glossário de domínio já declaram** (`funding`, `basis`, `cvd`, `ohlcv`, `knowledge_time`, `premium_index`, `resample`, `symbol`, `exchange`, `binance`…) mais vocabulário técnico corrente (`os`, `no_cache`, `sem_acquire`, `parametrize`, `timestamp`, `serializer`…):

| detector | MORDE (n=33) | **FALSO-POSITIVO (n=88 legítimos)** |
|---|---|---|
| A | 42,4% | **8/88** |
| B | 57,6% | **8/88** |
| C | 90,9% | **7/88** |
| **D** | **93,9%** | **7/88** — `oi`, `oi_delta`, `sem_acquire`, `sem_release`, `serie`, `time_serie`, `parametrize` |
| E | 97,0% | **13/88** — os 7 acima + `os`, `os_path`, `no_cache`, `no_data`, `com_port`, `example_com` |

`[MEDIDO 2026-08-29, mesmo detector, corpus CALA adversarial n=88]`

> **⚠️ O falso positivo que decide é `oi`.** `oi` é *Open Interest* — a abreviação central do componente `sentimento`, o eixo de metade desta estratégia. E `oi` é palavra portuguesa (*"oi"*), ausente do dicionário inglês. O detector a acusa.
>
> ```
> $ T=$(mktemp -d); git archive 01ec5a8 docs | tar -x -C "$T"
> $ grep -rowE 'OI' "$T/docs" --include='*.md' | wc -l          # 286 ocorrencias
> $ grep -rlowE 'OI' "$T/docs" --include='*.md' | wc -l         # em 23 arquivos
> $ grep -rhoE '\b(OI|oi_[a-z_]+|open_interest)\b' "$T/docs" --include='*.md' | sort | uniq -c | sort -rn | head -3
>     286 OI          9 oi_lq_vol_denominated_in          8 open_interest
> ```
>
> `[MEDIDO 2026-08-29, árvore EXTRAÍDA do rev `01ec5a8`]` · **286 ocorrências em 23 arquivos.** Isto não é falso positivo hipotético sobre código imaginário: é falso positivo sobre o token mais frequente do vocabulário que esta SPEC declara, num código que **ainda não foi escrito** e que **vai** ser escrito nas fases `02`–`09`.
>
> > **⚠️ Duas armadilhas de método neste número, e as duas mordem quem repetir a forma óbvia.**
> >
> > **(a) `grep -r docs/` na árvore VIVA envenena a si mesmo.** Esta ADR contém o token `OI`, então o comando rodado depois de publicá-la mede a si próprio — a **6ª** instância de *"número medido envelhece com a edição seguinte"* nesta trilha, e desta vez ela foi **evitada em vez de cometida**. Extrair o rev é imune; **`--exclude` não seria**, e `ADR-012` já mediu por quê (ele só enumera o que eu já sabia que ia mudar).
> >
> > **(b) `git grep` e `grep` DISCORDAM sobre os mesmos bytes.** Sobre `docs/specs/PRD-001-plataforma-dados.md`, **inalterado desde `01ec5a8`** (`git diff --stat 01ec5a8 -- <arquivo>` → vazio): `grep -owE 'OI' <arquivo> | wc -l` → **79**; `git grep -owE 'OI' 01ec5a8 -- <o mesmo arquivo> | wc -l` → **81** `[MEDIDO 2026-08-29]`. São **dois motores de regex** decidindo fronteira de palavra em prosa UTF-8 acentuada, e a divergência é silenciosa. ⇒ **ancorar no rev com `git grep` troca uma armadilha por outra**; a forma publicada acima ancora **e** usa um só motor.
> >
> > **`[NÃO SEI]` qual dos dois está certo sobre os 2 casos divergentes** — e não precisei saber: o veredito (*`oi` é vocabulário central e o detector o acusa*) é o mesmo em 79, em 81 ou em 286. **Registro a ignorância em vez de escolher o número que me convém.**

**E a família do erro é nomeável, o que a torna previsível e não anedótica: o conjunto dos falsos positivos é o conjunto das ABREVIAÇÕES e dos EMPRÉSTIMOS.** `oi` (open interest), `sem` (semáforo POSIX), `os` (módulo da stdlib), `no` (inglês comum), `com` (domínio/porta), `parametrize` (**a API do pytest**, presente em todo teste parametrizado). Abreviação é curta, e token curto colide com palavra funcional portuguesa quase por construção. **Identificador é justamente o lugar do código onde abreviação vive.** ⇒ **A propriedade que torna o identificador mais fácil de MORDER — segmentar em tokens curtos — é a mesma que o torna mais difícil de CALAR.**

**O teste de retenção já rodou, e eu não precisei inventá-lo.** A *allowlist* derivada do código de hoje é **vazia** (0 FP sobre os 29 de hoje). Essa allowlist vazia produz **7 falsos positivos** no corpus adversarial. ⇒ **allowlist enumera o que eu já sabia que ia colidir, e envelhece junto comigo** — que é literalmente a lição que `ADR-012` escreveu sobre `--exclude`. Pior: uma entrada de allowlist é indistinguível de um **bypass**. Quem quiser chamar uma variável de `janela` acrescenta `janela` à allowlist, e a allowlist não tem portão sobre si mesma.

⇒ **`D` não serve como portão bloqueante.** Eu não a vendo como tal.

#### D2c · O terceiro candidato — asserção de arquivo-dourado sobre segmento de caminho — também cai, e pelo falsificador do próprio repositório

Nome de caminho parecia a saída: universo **fechado**, pequeno e **zero falso positivo por construção** (é igualdade de conjuntos, não detecção de idioma).

```
$ git ls-tree -r --name-only 01ec5a8 | grep -E '^(backend/src|backend/tests|frontend/src)/' \
    | tr '/' '\n' | sed 's/\.[a-z]*$//' | sort -u | wc -l
27
```

`[MEDIDO 2026-08-29: 27 segmentos distintos]` · Morde (segmento novo ⇒ `rc=1`) e cala (árvore de hoje ⇒ `rc=0`). **Mas o churn o mata**, e o critério é o falsificador nº 4 de `ADR-012/D5(b)`: *"duas superfícies que sempre mudam juntas são uma superfície com passo extra"*.

```
b0c2df3 (T-01.7) segmentos tocados=17     e8c08d4 (T-01.2) segmentos tocados=11
os outros 10 dos 12 últimos commits: 0
```

`[MEDIDO 2026-08-29, 12 commits]` · Os dois commits que tocam segmentos são **exatamente os dois que criaram código**. `SPEC-001` tem **9 fases e 84 tasks**; toda task que cria arquivo edita o dourado. ⇒ **um arquivo dourado que todo builder edita é cerimônia, não portão** — e o remédio, que `ADR-012` já escreveu, é não criá-lo.

#### D2d · Veredito, com todas as letras

> **Não há portão possível hoje para idioma de identificador ou de nome de caminho. É DOUTRINA — convenção declarada, verificada por revisão humana, exatamente como `ADR-011/D6` decidiu para docstring.**
>
> **E `D6` continua de pé por medição, não por herança:** o falsificador dele exigia um detector que classificasse o português **e** não produzisse falso positivo *"sobre um docstring inglês legítimo com termo técnico"*. Eu construí o melhor detector que sei construir e ele **falha essa metade**, sobre o termo técnico mais frequente deste projeto. **O falsificador de `D6` não disparou. Eu tentei fazê-lo disparar e medi que não.**

**O que eu NÃO afirmo:** não afirmo que idioma seja indecidível em geral. Um detector probabilístico (`langdetect` e afins) é `[NÃO MEDIDO]` — não está instalado (`python3 -c "import langdetect"` → `ModuleNotFoundError` `[MEDIDO 2026-08-29]`) e instalar dependência não é ato de arquiteto (`ADR-011/D4`, precedente). Plugins de `flake8` também são `[NÃO MEDIDO]`: `flake8` **não está no `PATH` do interpretador corrente** (`pyenv: flake8: command not found`, existe só sob 3.12.8, e o alvo declarado é **3.13** por `ADR-011/D5`) `[MEDIDO 2026-08-29]`.

#### D2e · O falsificador, e ele é CONSTRUTIVO — nomeia a peça que falta e ela já tem endereço

`ADR-011/D6` deixou um falsificador que ninguém sabia como satisfazer. Este nomeia o mecanismo, porque **eu medi qual é a peça faltante**: o detector não erra por ser burro, erra por **não ter uma lista do vocabulário declarado deste domínio**. Testei com um glossário mínimo (n=12: `oi`, `cvd`, `funding`, `basis`, `ohlcv`, `etl`, `jsonl`, `fsync`, `binance`, `bybit`, `coinalyze`, `backtest`):

| | MORDE | FALSO-POSITIVO |
|---|---|---|
| `D` sem glossário | 31/33 | **7/88** |
| `D` + glossário de domínio (n=12) | 31/33 | **5/88** — restam `sem_acquire`, `sem_release`, `serie`, `time_serie`, `parametrize` |

`[MEDIDO 2026-08-29]`

**Honestidade sobre o que isso mostra: o glossário fecha `oi` e NÃO fecha os outros cinco** — porque `sem`, `serie` e `parametrize` são vocabulário de **biblioteca e de abreviação técnica**, não de domínio. Um glossário de domínio **estruturalmente** não os alcança. ⇒ a peça faltante são **duas** listas, não uma.

**E a primeira já tem slot declarado neste repositório, vazio:**

```
$ harness policy --key glossary_doc
                            # saída de 0 byte, rc=0
$ grep -n 'glossary' harness.toml
                            # nenhuma linha
$ ls docs/glossario* docs/glossary*
                            # nenhum arquivo
```

`[MEDIDO 2026-08-29]` · **O `bootstrap` de todo agente deste repositório manda ler `glossary_doc`, e a chave não aponta para nada.** (Nota lateral, mesma família de `ADR-012`: `rc=0` com saída vazia aqui é ambíguo entre *"declarado e vazio"* e *"nunca declarado"*; só o `grep` no `harness.toml` separa.)

> **⇒ FALSIFICADOR DE `D2`, executável e datado: no dia em que existirem (i) um glossário de domínio versionado sob `glossary_doc` E (ii) uma lista declarada de vocabulário de biblioteca/abreviação, rode a variante `D` com as duas como entrada de primeira classe. Se ela devolver `0` falso-positivo sobre um corpus CALA de pelo menos 88 identificadores legítimos NÃO usados para construí-la, mantendo ≥ 90% de MORDE, então esta decisão cai e a convenção vira portão — em `make`, nunca em `[[rules.own]]`** (o detector não é regex de linha; nenhum dos 4 tipos que a máquina de regras expressa — `forbidden-regex`, `forbidden-regex-allowlist`, `line-scoped`, `path-presence` — o comporta).
>
> **A barra é a mesma de `1.8'`: as duas metades, e a metade CALA medida sobre corpus de retenção.** *"Cala sobre o corpus que usei para ajustar"* não conta — eu acabei de medir que essa métrica dá `0/29` e mente.

**Esta lacuna deixou de ser nota de rodapé deste argumento: ela virou decisão própria — ver `D4`.** Ela é anterior a esta ADR e a `T-01.7`, e é a **única** peça que converteria a doutrina em portão.

---

#### D2f · CONFIRMAÇÃO DE CAMPO, obtida por acidente e por terceiros — e ela vale mais que os meus três protótipos

**Acrescentado em 2026-08-29, na revisão que trouxe o `master`.** Enquanto eu construía a bancada de `D2a`, **dois auditores independentes da `T-02.3` mediram idioma com instrumentos próprios, construídos sem conhecer o meu — e os dois foram mordidos pela mesma família.** Isto não é corroboração que eu fui buscar; é corroboração que apareceu sozinha, e por isso vale mais.

| auditor | o que o instrumento dele disse | o que a conferência à mão revelou |
|---|---|---|
| **`/qa`** | **46 linhas** em português | o dicionário PT dele incluía **`so`** — **e `so` é inglês** |
| **`/review`** | **31 de 177 linhas** | conferiu **6 à mão** e achou **3 falso-positivos** — inglês que **cita** português entre aspas (`ingest_record.py:12`, citando a frase do `ADR-008/D3`) ⇒ **taxa de erro ~50%**, e ele **RECUSOU PUBLICAR O NÚMERO** |

`[DOC: docs/INDEX.md, linha `2026-08-29T13:40Z`, registrada pelo coordenador do loop; os dois achados são dos auditores da `T-02.3`, não meus]`

**A frase do `/qa` é a melhor formulação do defeito que eu li nesta trilha, e não é minha:**

> *"instrumento que acende no idioma que ele deveria aprovar não está medindo"*

E o `/review` nomeou a família ao se recusar a publicar: disse que o número dele **não confirma nem refuta** o `19/499` do `/qa`, e que era *"a mesma família mordendo o instrumento dele"*.

> **⇒ Três instrumentos, construídos independentemente, por três agentes diferentes, no mesmo dia — e os três produzem falso positivo sobre inglês legítimo.** O meu sobre abreviações (`oi`, `sem`, `os`, `parametrize`) e sobre nomes de diretório (`infra`, `ui`); o do `/qa` sobre `so`; o do `/review` sobre citação entre aspas. **Nenhum dos três se conhecia.**
>
> **Isso muda a força da recusa de `D2`.** Ela deixa de ser *"eu tentei três aproximações e não consegui"* — que é uma afirmação sobre a minha competência — e passa a ser *"três autores independentes construíram instrumentos de idioma e os três erraram no mesmo eixo, o do CALAR"*, que é uma afirmação sobre **o problema**. `[MEDIDO por terceiros, 2026-08-29]`
>
> **E o `/review` fez a coisa certa, que é a que este repositório cobra: recusou publicar um número cuja taxa de erro ele mediu.** Um portão bloqueante não tem essa saída — ele **reprova o push**, e não pode escrever *"recuso-me a opinar"*. **Um instrumento com ~50% de erro que um humano pode descartar é um relatório; o mesmo instrumento ligado a um portão é uma parede.**

---

### D3 · A fronteira do universo, escrita item a item

O owner disse *"todo código"*. Isto é a tradução operável, e ela vira prompt de builder.

| superfície | decide | força |
|---|---|---|
| **identificador de produção** (`backend/src`, futuro `frontend/src`) | **inglês** | `[PREMISSA-OWNER: 2026-08-29]` — *"todo código gerado é em inglês … var, tudo"* |
| **identificador de teste** (`backend/tests`) | **inglês** — incluindo nome de função `test_*`, fixture, helper e classe de apoio | `[INFERRED: "todo código" sem qualificador de camada; e o repo já trata `backend/tests/` como `code_paths` — `include_prefixes` o lista]` |
| **nome de arquivo** | **inglês** | `[PREMISSA-OWNER: 2026-08-29]` — *"nome dos arquivos"*, literal |
| **nome de diretório** | **inglês** | `[INFERRED: "nome dos arquivos" no contexto de "ta tudo em portugues"; e um diretório é metade de um caminho. Falsificável: se o owner quis dizer só o nome-base, `painel/` e `sentimento/` saem do universo e a colisão de baixo evapora]` |
| **docstring / comentário** | **inglês** | `ADR-011/D6` + `T-01.7`, já em vigor `[DOC]` |
| **mensagem de commit, corpo de PR** | **português** | `[INFERRED: o owner escreve em português; os 12 últimos commits são em português; `CLAUDE.md` é em português. Não é "código gerado"]` |
| **`docs/`, `README`, SPEC, ADR, plano, `tasks.toml`** | **português** | `[INFERRED: idem; todo o corpus de decisão deste repositório é português, e traduzi-lo destruiria as âncoras textuais que 3 ADRs usam]` |
| **string visível ao usuário na UI** | **fora deste universo** — é decisão de **produto**, não de convenção de código | `[INFERRED: idioma de interface e idioma de código são eixos independentes; o owner falou de "código gerado"]` |

#### A separação que o `Filtro.tsx` obriga, e ela não é teórica

`Filtro.tsx` contém `<p>Filtro: any resultado serve</p>`. São **três** objetos distintos numa linha:

1. o **componente** `Filtro` → identificador → **inglês** (`Filter`);
2. o **arquivo** `Filtro.tsx` → nome → **inglês** (`Filter.tsx`) — e **a instrução foi refinada nesta revisão, porque "atômico com as citações" estava perigosamente vago** (ver o quadro abaixo);
> **⚠️ REFINAMENTO de 2026-08-29, e ele evita um dano que a redação anterior autorizava.** Re-medido em `HEAD`, `Filtro.tsx` é citado em **10** arquivos versionados — era 9 em `01ec5a8`, e **o décimo é esta própria ADR** (a família do auto-envenenamento, de novo, agora numa instrução em vez de num número). **Mas "atualize as 10" seria ERRADO**, e é por isso que a instrução muda de forma em vez de mudar de dígito:
>
> | superfície | arquivos | o que fazer no rename |
> |---|---|---|
> | **VIVA — receita executável ou instrução corrente** | `harness.toml` (`:149-150`), `frontend/README.md`, `docs/context/plataforma-dados/tasks.toml`, `handoff_to_builder.md`, `docs/plans/…/01_governanca_gateante.md` | **atualizar, atomicamente com o `git mv`** |
> | **HISTÓRIA — registro do que foi decidido, com data** | `ADR-003`, `ADR-011`, `ADR-012`, **esta `ADR-013`**, `docs/INDEX.md` | **NÃO reescrever.** `INDEX.md` é **append-only** por `CLAUDE.md`; ADR registra a decisão **no estado em que ela foi tomada**. O rename entra como **linha nova** no `INDEX.md`, não como edição das antigas |
>
> `[MEDIDO 2026-08-29 em `HEAD`: 10 arquivos; 5 vivos, 5 de história]` · **A única que é receita executável é `harness.toml:149-150`** — as outras quatro vivas são prosa que instrui. **Reescrever a história para "consertar" um nome apagaria o registro de que a bancada existiu com aquele nome, que é exatamente a evidência que o cuidado inteiro existe para proteger.**

3. o **texto JSX** `"Filtro: any resultado serve"` → string de interface → **fora do universo**, e **intocável por outra razão**: a palavra `any` **dentro dessa string** é o payload da bancada `D1.3b`. Traduzi-la apaga a prova de que nenhuma regex de linha é simultaneamente completa e correta (`ADR-011/D4`). ⇒ **traduzir o texto é destruir evidência; renomear o componente e o arquivo não é.**

#### ✅ A colisão, FECHADA pelo owner: o vocabulário de governança é **exceção declarada**

Duas regras do owner se contradizem, e nenhuma cede sozinha:

- *"todo código gerado é em inglês … nome dos arquivos"* `[PREMISSA-OWNER: 2026-08-29]`
- *"Vocabulário fechado de componentes: `sentimento` · `charts` · `convergencia` · `backtest` · `web` · `docs`. **Alterar o vocabulário é ato do owner, não de agente.**"* `[DOC: CLAUDE.md]`

**Dois dos seis são portugueses** (`sentimento`, `convergencia`) e **`backend/src/modules/sentimento/` deriva do vocabulário**, não é escolha independente de quem escreveu o diretório. A superfície, medida:

```
$ git ls-tree -r --name-only 01ec5a8 | grep -c 'sentimento'          # 10 caminhos versionados
$ git grep -l 'sentimento' 01ec5a8 -- . | wc -l                       # 55 arquivos o mencionam
$ git grep -c 'sentimento' 01ec5a8 -- . | awk -F: '{s+=$NF} END{print s}'   # 400 ocorrências
$ git grep -l 'convergencia' 01ec5a8 -- . | wc -l                     # 24 arquivos; 0 caminhos
```

`[MEDIDO 2026-08-29, ancorado em `01ec5a8`]` · `sentimento` está em **`harness.toml`** (`components`, `agents.by_component`, `code_paths`), em **84 tasks**, em **rótulos do Jira**, em **9 arquivos de plano** e em **10 caminhos de código**. **Não é renomeação de diretório: é mudança de vocabulário de governança, com efeito em `require-code`, em `classify` e no roteamento de agente por componente.**

> **A PERGUNTA, COMO FOI APRESENTADA AO OWNER — e é importante que ela fique registrada na forma em que ele a leu:**
>
> **O vocabulário fechado de componentes está DENTRO ou FORA do universo "todo código em inglês" — isto é, `sentimento` e `convergencia` viram `sentiment` e `convergence` (e com eles `backend/src/modules/*`, `backend/tests/*`, `harness.toml`, os 84 `tasks.toml` e os rótulos do Jira), ou o vocabulário de governança é uma superfície declarada EXCETA, e os diretórios que dele derivam ficam em português por herança?**

**Eu não decidi, e não era modéstia — era competência declarada:** `components` é ato do owner por `CLAUDE.md`, e nenhuma leitura minha da citação revoga uma regra escrita. Escrevi `[NÃO SEI]` porque *"nome dos arquivos"* alcança `sentimento/` literalmente **e** *"alterar o vocabulário é ato do owner"* o protege literalmente — duas leituras literais defensáveis é a definição de bloqueante.

#### ✅ A RESPOSTA — decisão do owner em 2026-08-29

> **EXCETAR o vocabulário.** Os 6 componentes (`sentimento`, `charts`, `convergencia`, `backtest`, `web`, `docs`) ficam **como estão**, em português. `backend/src/modules/sentimento/` e `backend/tests/sentimento/` **derivam deles e ficam também**. A regra de inglês vale para **todo o resto**.
>
> **`[DECISÃO-OWNER: 2026-08-29 — escolha entre alternativas apresentadas por este documento]`**

> **⚠️ E o rótulo desta linha é deliberado, porque este repositório já pagou por errá-lo.** **NÃO é `[PREMISSA-OWNER]`.** `CLAUDE.md` reserva `[PREMISSA-OWNER]` para **citação literal do owner**, e aqui não há citação literal: **o owner escolheu uma opção de um menu que EU escrevi.** A frase é minha; a escolha é dele. Chamar isto de `[PREMISSA-OWNER]` seria exatamente a *"paráfrase vestida de declaração"* que o `CLAUDE.md` nomeia como já tendo produzido defeito aqui — e seria pior que a média, porque a paráfrase seria **auto-atribuída**: eu estaria citando como palavra do owner uma frase que eu mesmo redigi. ⇒ **`[DECISÃO-OWNER]`, com a alternativa transcrita como foi apresentada, para que quem auditar veja o que ele leu antes de escolher.**

**O custo que foi declarado JUNTO com a opção, e sobre o qual ele decidiu:**

> *"o repositório fica bilíngue numa fronteira, mas a fronteira é declarada e tem uma linha só"*

**Eu fui perguntado se sustento que esse custo estava bem declarado. Sustento — com uma ressalva medida, e ela não muda a decisão.**

**O que estava bem declarado:** a fronteira é de fato **uma linha** e ela é **enumerável**, não difusa — são **6 palavras**, fixadas por `harness policy --key components`, e tudo que delas deriva é derivação **mecânica** (o diretório tem o nome do componente). Quem lê a exceção sabe exatamente onde ela começa e termina, o que é a diferença entre uma exceção e uma erosão.

**A ressalva, e ela é uma medição que eu não tinha quando escrevi a frase:** *"bilíngue numa fronteira"* descreve o **repositório**, e o efeito real é um pouco maior — a exceção cria uma **classe nova de falso positivo para qualquer instrumento futuro**. Rodando o meu próprio detector sobre a árvore de hoje, `sentimento` é **acusado de português** — e a partir desta decisão essa acusação é **falsa por construção**, porque o nome passou a ser correto por exceção. ⇒ **todo instrumento que algum dia medir idioma terá de carregar a lista de exceções como entrada de primeira classe**, exatamente como `D2e` já exige para o glossário. Isso é custo real, é pequeno, e é **do mesmo tipo** que `D2e` já obriga a pagar — mas ele não estava na frase que o owner leu, e eu registro isso em vez de deixar passar.

**Não muda a decisão** porque a alternativa (migrar o vocabulário) tinha o custo medido de **400 ocorrências em 55 arquivos, 84 tasks e rótulos de tracker fora deste repositório** — e **re-medido em `HEAD` esse custo SUBIU para 487 ocorrências em 69 arquivos e 28 caminhos** `[MEDIDO 2026-08-29, árvore extraída de `HEAD`]`, porque `T-02.3` e `T-02.4a` adicionaram código sob `sentimento/` nos dois dias entre a pergunta e a resposta. **A decisão do owner ficou mais barata por ter sido tomada agora, não mais cara** —, e porque `components` não é identificador de código: é **chave de política**, consumida por `agents.by_component`, `code_paths` e `require-code`. Renomeá-la seria mudar governança para satisfazer uma convenção de código — precedente que `ADR-012/D5(a)` já recusou pela mesma razão de custo e de fronteira.

##### Falsificador da exceção — o que a faria cair

**O principal, e ele é um ato, não uma observação: no dia em que o owner alterar o vocabulário de componentes** — ato dele por `CLAUDE.md`, nunca de agente — **a exceção morre junto com o nome que ela protegia**, e os diretórios derivados migram no **mesmo ato atômico** que muda `harness.toml`, `tasks.toml` e os rótulos do tracker. **Nunca como task de agente**, e nunca em dois commits: um `components` já renomeado com `backend/src/modules/sentimento/` ainda em disco é um repositório em que `require-code` e `classify` discordam do vocabulário — falha silenciosa, e da pior classe.

**O segundo, e ele mede erosão em vez de intenção:** se algum dia um nome em português aparecer sob `backend/src/` ou `frontend/src/` **justificado pela exceção** sem derivar mecanicamente de um dos 6 componentes, então a exceção deixou de ser uma linha e virou uma rampa. **O sintoma é observável e barato:** todo nome português aceito tem de casar, por igualdade de string, com um elemento de `harness policy --key components`. **Hoje isso é `1` — `sentimento` — e nenhum outro** `[MEDIDO 2026-08-29, ver §"O universo, re-medido"]`. Um segundo nome português que **não** case é a evidência de que a rampa começou.

---

### D4 · O `glossary_doc` vazio é **dívida com dono nomeado**, e não observação de rodapé

O falsificador de `D2e` foi procurar a peça que falta para um portão de idioma e **encontrou um buraco que não é sobre idioma**. Ele merece linha própria porque **não é uma lacuna deste trabalho — é uma lacuna do `bootstrap` de todo agente deste projeto**.

**Medido nesta árvore (`7af0e4f`), e os três comandos foram reproduzidos:**

```
$ harness policy --key glossary_doc          # rc=0, saída de 1 byte (só o newline)
$ grep -in 'glossar' harness.toml            # NADA — zero linhas
$ ls docs/glossario* docs/glossary*          # nenhum arquivo
```

**E os consumidores existem, são instruções a agente, e são oito:**

```
$ grep -rln 'glossary_doc' <plugin 0.13.0>/agents <plugin 0.13.0>/commands
agents/architect.md   agents/builder.md   agents/pm.md   agents/reviewer.md
commands/architect.md   commands/grill-me.md   commands/pm.md   commands/review.md
```

`[MEDIDO 2026-08-29: n=8 arquivos de instrução; `agents/architect.md:14`, `commands/pm.md:23` e `commands/grill-me.md:41` conferidos linha a linha]` — e os três dizem, literalmente, *"leia o arquivo apontado"*.

> **⚠️ Esta é a família da casa, no lugar mais caro possível.** **`rc=0` com saída vazia lido como sucesso** é exatamente o defeito que `ADR-012` nomeou em `harness rules --mode file`, e que esta ADR já encontrou uma terceira vez ao medir `OI`. Aqui ele mora **no primeiro passo de todo agente**: o `bootstrap` manda ler um ponteiro, o ponteiro devolve `rc=0`, e **o agente segue adiante achando que leu o glossário — quando não há glossário.** Ninguém é avisado, porque `rc=0` é o código de sucesso.
>
> **E a consequência é medível na própria trilha:** `D2f` mostra **três** instrumentos de idioma construídos no mesmo dia por três agentes, cada um com o seu próprio dicionário improvisado (`so` no do `/qa`, aspas no do `/review`, abreviações no meu). **Um glossário declarado é justamente o insumo que os três teriam compartilhado.** A ausência dele não causou os três defeitos, mas garantiu que cada um os descobrisse sozinho.

**Decisão:** **a dívida fica DECLARADA com dono, e o dono não é este documento.** Preencher `glossary_doc` é escrever um glossário de domínio — vocabulário de `sentimento`, `charts`, `convergencia` e `backtest` (`OI`, `CVD`, `funding`, `basis`, `knowledge_time`, `nature`, `LOCF`…) — o que é **trabalho de produto e de domínio**, não de convenção de código. **Endereço natural: o `/pm`, no PRD de `codigo-em-ingles` ou numa trilha própria**, com julgamento técnico do `quant-architect`, que é quem `agents.by_component` declara para os três componentes de domínio.

**O que eu NÃO faço, e declaro para ninguém esperar:** **não escrevo o glossário aqui e não declaro a chave.** `harness.toml` é superfície que esta ADR não toca (e `components`, que vive nele, acabou de ser objeto de decisão do owner). Escrever um glossário de domínio de dentro de uma ADR sobre idioma de identificador seria a ampliação de escopo que `Regra 5` do plano existe para disciplinar.

**Falsificador de `D4`:** se o glossário for escrito e **nenhum** dos 8 arquivos de instrução mudar de comportamento — isto é, se nenhum agente citar o glossário numa decisão — então a chave era cerimônia e o certo é **removê-la das instruções**, não preenchê-la. **O sintoma é observável:** procure, nos artefatos das próximas fases, uma decisão que cite o glossário como fonte. **Hoje esse número é zero, e não pode ser outro: o arquivo não existe.**

---

## Alternativas recusadas

| alternativa | por que não, com o custo medido |
|---|---|
| **task nova em `plataforma-dados`** (herda `BUILD_AUTHORIZED`) | compra despacho hoje e paga com a casa: a convenção governa **6** componentes e morre no `advance DONE` de uma feature sobre **1**. E o que falta decidir é **escopo**, que exige PRD — herdar o gate `build` sem escopo aprovado é atalho de portão |
| **manter o nome `docstrings-em-ingles`** | o nome descreve um **subconjunto** e descreve trabalho **feito** (`T-01.7`, 55 docstrings, `/qa APPROVED`). Manter reproduz o defeito que a ADR conserta. E `harness` não tem `rename` `[MEDIDO: 17 subcomandos]` — o próprio plugin prescreve `REJECTED` + `init` com nome novo |
| **`advance … DONE`** na feature órfã | `DONE` afirma entrega; ela nunca declarou escopo, não há o que dar por entregue — e `DONE` é gate de **owner**. `REJECTED` exige motivo escrito (`pipeline.sh:617`), que é o registro que preserva a história |
| **portão bloqueante com detector de dicionário (variante `D`)** | **7 falsos positivos em 88 legítimos**, e um deles é **`oi`** — *open interest*, **286 ocorrências** nos documentos deste projeto, em código que as fases `02`–`09` ainda vão escrever. Recall de 94% não compra um bloqueio que reprova o vocabulário central do domínio |
| **variante `D` + *allowlist*** | a allowlist derivada de hoje é **vazia** e produz **7 FP** no corpus de retenção ⇒ ela enumera o que eu já sabia, e envelhece comigo (`ADR-012`, lição do `--exclude`). Pior: entrada de allowlist é indistinguível de **bypass**, e a allowlist não tem portão sobre si mesma |
| **proibir diacríticos** | já medido e já recusado por `ADR-011/D6`: **0 achados sobre 18 docstrings PT**, porque este código escreve português sem acento. Continua sendo o portão que devolve verde por não ter olhado |
| **variante `D` em severidade `[AVISO]`** | 8% de ruído sobre código legítimo num canal que hoje carrega **2 avisos reais** (`core.module-docstring-single-line`, `web-fullstack.hardcoded-url`). Aviso que se aprende a ignorar **degrada os avisos que mordem** — custo pago por regras que não têm defeito nenhum |
| **arquivo-dourado de segmentos de caminho** | zero FP por construção, mas **os 2 commits que criaram código tocaram 17 e 11 segmentos**, e a SPEC tem **9 fases / 84 tasks**. Dourado que todo builder edita é cerimônia — recusado pelo falsificador nº 4 de `ADR-012/D5(b)` |
| **`[[rules.own]]` de idioma** | **não é expressável**: os tipos que a máquina de regras conhece são `forbidden-regex`, `forbidden-regex-allowlist`, `line-scoped` e `path-presence`; segmentação em tokens + consulta a dicionário não é regex de linha. E `ADR-011`/`D1.10` já declara que **declarar uma `[[rules.own]]` de idioma REPROVA a fase** |
| **`langdetect` / plugin de `flake8`** | `[NÃO MEDIDO]` nos dois casos — `langdetect` não instalado; `flake8` fora do `PATH` do interpretador alvo (3.13). Instalar dependência não é ato de arquiteto (`ADR-011/D4`). Reabre pelo gatilho de `D2e`, não por gosto |
| **renomear o frontend agora, como exceção** | `Filtro.tsx` é citado em **10 arquivos versionados** (9 em `01ec5a8` + esta ADR), e um deles é `harness.toml:149-150`, onde ele **é** a metade CALA de uma prova de dois lados. Renomeação não-atômica converte a prova em **falso positivo de conformidade** (`rc=0` por caminho inexistente, `ADR-012`). **E 5 das 10 são HISTÓRIA e não podem ser reescritas** — ver o quadro em `D3` |

---

## Falsificador

**Contra `D1` — RESOLVIDO, e registro como estava escrito porque a condição dele era exatamente a pergunta que foi feita.** A redação original dizia: *"se o owner responder que o vocabulário de componentes **entra** no universo, então `codigo-em-ingles` é a casa errada"*. **O owner respondeu que NÃO entra** (`D3`), logo a condição **não disparou** e `D1` fica de pé — a casa é a feature, e ela já existe em `INIT`. **O falsificador continua vivo para o futuro:** se um dia o vocabulário entrar, a migração é ato atômico do owner e **não** trilha de pipeline, e `codigo-em-ingles` não é a casa dela.

**Contra `D2`, e é o que me faria estar errado do jeito mais caro.** Se, nas fases `02`–`09`, aparecerem identificadores em português **em código que passou por `/qa` e `/review`** — isto é, se a revisão humana **não** pegar o que o portão não pega —, então "doutrina" comprou **nada** e a troca certa era aceitar 8% de falso positivo em `[AVISO]`. **O sintoma é observável e barato:** rode a variante `D` sobre a árvore a cada fim de fase; se o número de achados **subir** entre duas fases aprovadas, a doutrina não está segurando. **O "antes" está medido, e ele foi RE-MEDIDO nesta revisão porque envelheceu em dois dias: o marco zero é `7af0e4f` — 237 identificadores/nomes, dos quais 27 acusados de português (19 em `backend/tests`, 8 em `frontend/src`, 0 em `backend/src`), com o limite declarado de que parâmetros ficam fora do método** (ver §*"O universo, RE-MEDIDO"*).

> **E a primeira leitura já veio, sem que eu a fosse buscar: entre `01ec5a8` e `7af0e4f`, `backend/src` foi de 23 a 78 declarações e continuou em ZERO, e `backend/tests` ganhou 73 nomes novos, todos em inglês, com o número de acusados parado em 19.** ⇒ **na primeira medição depois da decisão, a doutrina está segurando** — e ela segurou sobre código escrito por tasks que sequer conheciam esta ADR.

**Contra `D2` na direção oposta — o gatilho de reabertura.** O de `D2e`: glossário de domínio versionado sob `glossary_doc` **mais** lista de vocabulário de biblioteca, e a variante `D` medida sobre corpus de retenção não usado para construí-la. `0` FP com ≥ 90% MORDE ⇒ vira portão, no `make`.

**Contra `D3`, na exceção que ele acabou de declarar.** Está escrito em §*"Falsificador da exceção"*, e tem duas metades: **(i)** o dia em que o owner alterar `components` — ato dele — a exceção morre com o nome que protegia, e a migração é **um** ato atômico; **(ii)** todo nome português aceito tem de casar, por igualdade de string, com um elemento de `harness policy --key components`. **Hoje isso é `1` (`sentimento`) e nenhum outro** `[MEDIDO 2026-08-29]`; um segundo que não case é a evidência de que a exceção virou rampa.

**Contra `D3`, no resto da tabela.** Se o owner disser que documentação e mensagem de commit **também** vão para o inglês, três linhas da tabela caem e o custo muda de ordem: são **todos** os ADR, SPEC e planos, e com eles as **âncoras textuais** que `ADR-011`, `ADR-012` e o plano `01` usam para se referir uns aos outros — e `ADR-012` já registrou que âncora textual foi adotada justamente porque número de linha envelhece. Traduzir o corpus quebraria as duas formas de âncora de uma vez.

**Contra a recusa da exceção do frontend.** Se a fase `05` começar a escrever `.tsx` **antes** de `codigo-em-ingles` chegar a `BUILD_AUTHORIZED`, o custo da minha escolha sobe: cada arquivo novo nasce com nome a renomear depois. **Se isso acontecer, a decisão certa não é abrir exceção — é o owner priorizar os dois gates**, porque renomear 4 arquivos com 9 citações já é caro e renomear 40 não fica mais barato por eu ter esperado.

---

## Consequência

- **Nasce zero portão.** Nenhuma `[[rules.own]]`, nenhum alvo de `make`, nenhuma superfície de enforcement nova. O que nasce é **uma convenção escrita com fronteira**, e uma **dívida nomeada** (`glossary_doc` vazio) que é a peça que a converteria em portão.
- **`ADR-011/D6` fica de pé e ganha bancada.** O veredito *"idioma não é mensurável por comando"* passa de leitura de documentação a **medição de retenção** — e a medição diz algo mais fino do que `D6` dizia: o problema não é o **MORDE** (94% é alto), é o **CALA**, e ele quebra exatamente nas **abreviações**, que é onde identificador vive.
- **`T-01.7` fica absolvida, por escrito.** Ela obedeceu a uma fronteira explícita com falsificador. Quem ler o achado do owner como *"a task fez pela metade"* estará atribuindo a uma task um defeito que é de **lacuna entre tasks** — e no `frontend/` sequer isso: ali `T-01.7` nunca entrou (**0 arquivos**), e o docstring inglês ao lado do identificador português saiu do **mesmo commit** de `T-01.2`.
- **O plano `01` (`01_governanca_gateante.md:110`) tem uma afirmação falsa que esta ADR corrige sem reescrever:** *"o `frontend/`, que não tem docstring nenhuma medida"* — são **4 blocos, 4 de 4 em inglês**. A recomendação de **encerrar** que se apoiava nela **cai**, por um motivo diferente do que o falsificador previa: não porque haja docstring portuguesa fora de `backend/`, mas porque **o owner acabou de dar escopo à feature, e o escopo é maior que o nome dela**.
- **As duas perguntas VOLTARAM RESPONDIDAS, e a ADR foi atualizada para refletir isso** (`D1` executada no ledger, `D3` fechada com exceção declarada). **Restam as duas aprovações de owner** no caminho de qualquer código (`spec`, `build`) — o owner as aceitou explicitamente.
- **A exceção de `D3` cria obrigação para o futuro, e ela está escrita:** todo instrumento que algum dia medir idioma tem de carregar **a lista de componentes** como entrada de primeira classe, ao lado do glossário de `D2e` — porque a partir desta decisão `sentimento` é **correto por exceção**, e um detector que não souber disso o acusa.
- **`glossary_doc` sai do rodapé e vira `D4`**, com dono nomeado (`/pm` + `quant-architect`) e falsificador próprio. **Não é dívida desta ADR**: ela está no `bootstrap` de **8** arquivos de instrução do plugin e é anterior a este trabalho.
- **Eu não escrevo o código, não movi o ledger, não criei task e não renomeei nada.** `/architect` decide; `/tech-lead` materializa; `advance`/`approve` são do owner. **Os dois atos de ledger de `D1` foram do owner, e eu os LI para registrá-los — não os executei.**

---

## Roteamento operacional

**Atualizado em 2026-08-29, depois das respostas do owner.** O quadro mudou: **dois dos cinco atos já estão feitos.**

| # | ato | feature | componente | quem | estado |
|---|---|---|---|---|---|
| 1 | `advance docstrings-em-ingles REJECTED "<motivo>"` | `docstrings-em-ingles` | — | owner | ✅ **FEITO** — `2026-08-29T12:06:17Z`, motivo escrito citando esta ADR |
| 2 | `init codigo-em-ingles` | `codigo-em-ingles` | — | owner | ✅ **FEITO** — `2026-08-29T12:06:25Z`, estado `INIT` |
| 3 | **PRD** com a fronteira de `D3` **e a exceção de `components` já decidida** | `codigo-em-ingles` | `docs` | `/pm` → `/architect` | ▶ **EM CURSO** — o coordenador despachou o `/pm` |
| 4 | SPEC + plano de renomeação em fases | `codigo-em-ingles` | `docs` | `/architect` | ⏸ **`approve spec` — OWNER** |
| 5 | tasks | `codigo-em-ingles` | `docs`, `sentimento`, `web` | `/tech-lead` | ⏸ `approve tasks` (agente) + **`approve build` — OWNER** |

**Os dois portões de owner continuam sendo `approve codigo-em-ingles spec` e `approve codigo-em-ingles build`.** `CLAUDE.md` proíbe agente de dar os dois, e o owner os aceitou.

### O que o `/pm` precisa desta ADR para o PRD — e nada aqui o segura

**Coordenei-me com o despacho em paralelo: o PRD tem tudo o que precisa, e a ADR não é bloqueante para ele.** As quatro peças que o `/pm` deve copiar, já fechadas:

1. **A tabela de fronteira de `D3`** — 8 superfícies. **3 estão decididas por owner/DOC; 5 são `[INFERRED]` minhas.** O PRD deve **transcrever os rótulos**, não promovê-los: um `[INFERRED]` que vira requisito sem rótulo é a paráfrase-vestida-de-declaração que `D3` acabou de recusar em si mesma.
2. **A exceção de `components`** — `[DECISÃO-OWNER: 2026-08-29]`, com a alternativa transcrita como foi apresentada e o custo que foi declarado junto.
3. **A separação identificador × string de UI** — `Filtro` (renomeia) vs. `"Filtro: any resultado serve"` (**não** traduz). Isto é requisito, não detalhe de implementação: um PRD que não o separe autoriza destruir a bancada `D1.3b`.
4. **`D2`: o PRD NÃO deve pedir portão de idioma.** Critério de aceite verificável é *"revisão humana confere"*, e **nenhuma `[[rules.own]]` de idioma** — declarar uma **reprova a fase** por `D1.10`/`ADR-011`.

**A única coisa que eu seguraria, e não é da ADR:** o PRD **não** deve tentar declarar o glossário de `D4` — é trabalho de domínio, com dono diferente, e enfiá-lo aqui é a ampliação de escopo que `Regra 5` disciplina. **Se o `/pm` quiser cobri-lo, que seja como dívida referenciada, não como requisito desta feature.**

**Sinal para o `/tech-lead`:** ainda **não** há o que materializar. O gatilho é `codigo-em-ingles` chegar a `SPEC_APPROVED`.

**Cuidado que viaja junto com a task de frontend, quando ela existir — o VEREDITO é inalterado, e a INSTRUÇÃO ficou mais precisa nesta revisão. É o que impede alguém de apagar evidência arquitetural com um `git mv`:** `Filtro.tsx` é citado em **10** arquivos versionados, e o rename é **atômico com as 5 superfícies VIVAS** — `harness.toml:149-150` (a única receita executável), `frontend/README.md`, `tasks.toml`, `handoff_to_builder.md`, `plano 01`. **As outras 5 são HISTÓRIA e NÃO se reescrevem** (`ADR-003`, `ADR-011`, `ADR-012`, esta ADR, e `docs/INDEX.md`, que é append-only) — o rename entra como **linha nova** no `INDEX`. O **texto JSX não se traduz** (é payload da bancada `D1.3b`). E o falsificador do rename é o ESLint continuar acusando `tipos.ts` e continuar calando sobre os dois legítimos — os mesmos quatro casos de `ADR-011/D4`, medidos **depois** do rename.
