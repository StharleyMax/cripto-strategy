# ADR-013 — Código em inglês é convenção com fronteira escrita, e o portão não existe hoje: eu medi por quê

**Data:** 2026-08-29 · **Status:** proposto · **SPEC:** — (a decisão é do repositório, não de `SPEC-001`)
**Fase/Epic:** — · **Componente alvo:** `docs`
**Origem:** achado do owner em 2026-08-29, medido e re-medido nesta árvore (`master@01ec5a8`)
**Supersede/estende:** `ADR-011/D6` (idioma de **docstring** — convenção, não portão). Esta ADR **não** o revoga: estende o mesmo veredito ao **identificador** e ao **nome de caminho**, com bancada própria e um falsificador construtivo que `D6` não tinha.

> *"Assim como docstring, todo código gerado é em inglês, olhando no front, ta tudo em portugues, nome dos arquivos, var, tudo."*
> `[PREMISSA-OWNER: 2026-08-29, citação literal]`

**Fecha três perguntas:**

| pergunta | decisão |
|---|---|
| onde a regra mora — task em `plataforma-dados` ou a feature órfã? | **D1** — feature própria, **renomeada**; com uma exceção nomeada e um custo declarado |
| isso pode ter portão, ou é doutrina? | **D2** — **doutrina.** Três portões candidatos medidos e **os três recusados**, com o número que recusa cada um |
| qual é a fronteira do universo? | **D3** — escrita item a item; e **uma colisão que não é minha para resolver**, formulada como uma pergunta |

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

> **⚠️ A última linha da tabela falsifica, de fato, uma afirmação publicada.** O plano `01` (`01_governanca_gateante.md:110`) recomenda encerrar a feature órfã, e o falsificador dessa recomendação diz: *"se o owner a criou para trabalho de docstring **fora** de `backend/` — o `frontend/`, por exemplo, **que não tem docstring nenhuma medida**"*. **O frontend tem 4 docstrings, e as 4 estão em inglês.** O parêntese era `[NÃO MEDIDO]` vestido de fato, e é falso. ⇒ **A condição literal daquele falsificador não dispara** (não há docstring portuguesa fora de `backend/`). O que dispara é outra coisa, que ele não previu, e `D1` a trata.

---

## Decisão

### D1 · A convenção mora em **feature própria, renomeada** — e o nome `docstrings-em-ingles` não sobrevive

**Escolho (b), com o nome trocado.** A trilha correta é: `advance docstrings-em-ingles REJECTED "<motivo>"` + `init codigo-em-ingles`.

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

| | detector | MORDE (33 identificadores PT de hoje) | CALA (29 identificadores EN de hoje) |
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

**Dívida nomeada, com dono:** *este repositório não tem glossário, e a chave que o apontaria está vazia.* Não é dívida desta ADR nem de `T-01.7` — é anterior às duas. Fica declarada aqui porque é a **única** peça que converte uma doutrina em portão, e porque o `bootstrap` já a pede.

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
2. o **arquivo** `Filtro.tsx` → nome → **inglês** (`Filter.tsx`), **atômico com as 9 citações**, `harness.toml:149` inclusive;
3. o **texto JSX** `"Filtro: any resultado serve"` → string de interface → **fora do universo**, e **intocável por outra razão**: a palavra `any` **dentro dessa string** é o payload da bancada `D1.3b`. Traduzi-la apaga a prova de que nenhuma regex de linha é simultaneamente completa e correta (`ADR-011/D4`). ⇒ **traduzir o texto é destruir evidência; renomear o componente e o arquivo não é.**

#### ⏸ A colisão que eu NÃO resolvo, e a pergunta que o owner precisa responder

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

> **A PERGUNTA, em uma frase:**
>
> **O vocabulário fechado de componentes está DENTRO ou FORA do universo "todo código em inglês" — isto é, `sentimento` e `convergencia` viram `sentiment` e `convergence` (e com eles `backend/src/modules/*`, `backend/tests/*`, `harness.toml`, os 84 `tasks.toml` e os rótulos do Jira), ou o vocabulário de governança é uma superfície declarada EXCETA, e os diretórios que dele derivam ficam em português por herança?**

**Eu não decido, e não é modéstia — é competência declarada:** `components` é ato do owner por `CLAUDE.md`, e nenhuma leitura minha da citação de hoje revoga uma regra escrita. **`[NÃO SEI]` qual das duas o owner quis**, e a citação não desempata: *"nome dos arquivos"* alcança `sentimento/` literalmente, e *"alterar o vocabulário é ato do owner"* o protege literalmente. **Duas leituras literais, ambas defensáveis, é a definição de bloqueante.**

**Recomendação, que é minha e leva rótulo próprio:** **EXCETAR o vocabulário de governança**, e escrever a exceção. Argumento: `components` não é identificador de código — é **chave de política**, consumida por `agents.by_component`, `code_paths` e `require-code`; o custo medido (400 ocorrências, 55 arquivos, 84 tasks, rótulos de tracker fora do repositório) é desproporcional ao ganho; e o precedente de fronteira já existe nesta trilha — `ADR-012/D5(a)` recusou mexer em superfície de governança de outro repositório pela mesma razão de custo/fronteira. **Falsificador da minha recomendação:** se o owner responder que o vocabulário entra, a exceção não sobrevive e a migração é **um** ato atômico do owner sobre `harness.toml` + tracker + código, **nunca** uma task de agente. `[INFERRED: recomendação de arquiteto, não declaração do owner]`

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
| **renomear o frontend agora, como exceção** | `Filtro.tsx` é citado em **9 arquivos versionados**, e o nono é `harness.toml:149`, onde ele **é** a metade CALA de uma prova de dois lados. Renomeação não-atômica converte a prova em **falso positivo de conformidade** (`rc=0` por caminho inexistente, `ADR-012`) |

---

## Falsificador

**Contra `D1` — e ele reabre a escolha inteira.** Se o owner responder que o vocabulário de componentes **entra** no universo, então a convenção deixa de ser convenção de código e vira **migração de governança**: `harness.toml`, tracker e código num ato só. Nesse caso `codigo-em-ingles` é a casa **errada** — uma feature de repositório não move o vocabulário do repositório —, e o desfecho correto é um ato do owner, não uma trilha de pipeline. **`D1` está certa apenas sob a resposta que eu recomendo, e essa resposta não é minha.**

**Contra `D2`, e é o que me faria estar errado do jeito mais caro.** Se, nas fases `02`–`09`, aparecerem identificadores em português **em código que passou por `/qa` e `/review`** — isto é, se a revisão humana **não** pegar o que o portão não pega —, então "doutrina" comprou **nada** e a troca certa era aceitar 8% de falso positivo em `[AVISO]`. **O sintoma é observável e barato:** rode a variante `D` sobre a árvore a cada fim de fase; se o número de achados **subir** entre duas fases aprovadas, a doutrina não está segurando. **O "antes" está medido e é o marco zero: hoje, 33 identificadores em português, 19 deles em `backend/tests` e 9 em `frontend/src`.**

**Contra `D2` na direção oposta — o gatilho de reabertura.** O de `D2e`: glossário de domínio versionado sob `glossary_doc` **mais** lista de vocabulário de biblioteca, e a variante `D` medida sobre corpus de retenção não usado para construí-la. `0` FP com ≥ 90% MORDE ⇒ vira portão, no `make`.

**Contra `D3`.** Se o owner disser que documentação e mensagem de commit **também** vão para o inglês, três linhas da tabela caem e o custo muda de ordem: são **todos** os ADR, SPEC e planos, e com eles as **âncoras textuais** que `ADR-011`, `ADR-012` e o plano `01` usam para se referir uns aos outros — e `ADR-012` já registrou que âncora textual foi adotada justamente porque número de linha envelhece. Traduzir o corpus quebraria as duas formas de âncora de uma vez.

**Contra a recusa da exceção do frontend.** Se a fase `05` começar a escrever `.tsx` **antes** de `codigo-em-ingles` chegar a `BUILD_AUTHORIZED`, o custo da minha escolha sobe: cada arquivo novo nasce com nome a renomear depois. **Se isso acontecer, a decisão certa não é abrir exceção — é o owner priorizar os dois gates**, porque renomear 4 arquivos com 9 citações já é caro e renomear 40 não fica mais barato por eu ter esperado.

---

## Consequência

- **Nasce zero portão.** Nenhuma `[[rules.own]]`, nenhum alvo de `make`, nenhuma superfície de enforcement nova. O que nasce é **uma convenção escrita com fronteira**, e uma **dívida nomeada** (`glossary_doc` vazio) que é a peça que a converteria em portão.
- **`ADR-011/D6` fica de pé e ganha bancada.** O veredito *"idioma não é mensurável por comando"* passa de leitura de documentação a **medição de retenção** — e a medição diz algo mais fino do que `D6` dizia: o problema não é o **MORDE** (94% é alto), é o **CALA**, e ele quebra exatamente nas **abreviações**, que é onde identificador vive.
- **`T-01.7` fica absolvida, por escrito.** Ela obedeceu a uma fronteira explícita com falsificador. Quem ler o achado do owner como *"a task fez pela metade"* estará atribuindo a uma task um defeito que é de **lacuna entre tasks** — e no `frontend/` sequer isso: ali `T-01.7` nunca entrou (**0 arquivos**), e o docstring inglês ao lado do identificador português saiu do **mesmo commit** de `T-01.2`.
- **O plano `01` (`01_governanca_gateante.md:110`) tem uma afirmação falsa que esta ADR corrige sem reescrever:** *"o `frontend/`, que não tem docstring nenhuma medida"* — são **4 blocos, 4 de 4 em inglês**. A recomendação de **encerrar** que se apoiava nela **cai**, por um motivo diferente do que o falsificador previa: não porque haja docstring portuguesa fora de `backend/`, mas porque **o owner acabou de dar escopo à feature, e o escopo é maior que o nome dela**.
- **Duas perguntas voltam ao owner** (a colisão de `components`; e a confirmação da tabela de `D3`), e **duas aprovações de owner** ficam no caminho de qualquer código (`spec`, `build`). Nada é despachável hoje sem elas, e eu não fabrico uma casa autorizada para contornar isso.
- **Eu não escrevo o código, não movi o ledger, não criei task e não renomeei nada.** `/architect` decide; `/tech-lead` materializa; `advance`/`approve` são do owner.

---

## Roteamento operacional

**O que o coordenador pode despachar HOJE: nada que renomeie.** Digo isto explicitamente porque a resposta útil aqui é a negativa, e inventar uma task despachável seria fabricar caminho.

**O que precisa nascer, e onde:**

| # | ato | feature | componente | quem | gate no caminho |
|---|---|---|---|---|---|
| 1 | `harness pipeline advance docstrings-em-ingles REJECTED "escopo real existe e é maior que o nome; segue em codigo-em-ingles (ADR-013/D1)"` | `docstrings-em-ingles` | — | **owner** (é ledger) | nenhum gate formal, mas **é ato de governança** — não de agente |
| 2 | `harness pipeline init codigo-em-ingles` | `codigo-em-ingles` | — | **owner** | — |
| 3 | PRD com a fronteira de `D3` **e a colisão de `components` respondida** | `codigo-em-ingles` | `docs` | `/pm` → `/architect` | `approve prd` (agente pode) |
| 4 | SPEC + plano de renomeação em fases (backend/tests · frontend · nomes de caminho) | `codigo-em-ingles` | `docs` | `/architect` | **`approve spec` — OWNER** |
| 5 | tasks | `codigo-em-ingles` | `docs`, `sentimento`, `web` | `/tech-lead` | `approve tasks` (agente pode) + **`approve build` — OWNER** |

**Os dois portões de owner são `approve codigo-em-ingles spec` e `approve codigo-em-ingles build`.** `CLAUDE.md` proíbe agente de dar os dois. Não há rota que os evite — e a rota que os evitaria (task em `plataforma-dados`) é a que `D1` recusa.

**O que voltar ao owner, em três itens, nesta ordem:**

1. **A pergunta de `D3`** (`components` dentro ou fora). **É bloqueante para o item 3** — sem ela o PRD não sabe se `backend/src/modules/sentimento/` está no universo, e um PRD que não sabe seu universo é o defeito que esta ADR inteira trata. Minha recomendação está escrita e rotulada, e ela é minha, não dele.
2. **A confirmação da tabela de `D3`** — 5 das 8 linhas são `[INFERRED]`. Não são bloqueantes (assumi e registrei), mas a linha *"documentação continua em português"* governa muito arquivo e é barata de confirmar.
3. **Os atos 1 e 2 no ledger.** Um comando cada.

**Sinal para o `/tech-lead`:** ainda **não** há o que materializar. O gatilho é a SPEC de `codigo-em-ingles` chegar a `SPEC_APPROVED` — e antes disso a narrativa de review que o `/tech-lead` exige não tem o que revisar.

**Cuidado que viaja junto com a task de frontend, quando ela existir** — está em `D1` e em `D3`, e resumido aqui para não se perder: renomear `Filtro.tsx` é **atômico com as 9 citações versionadas**, `harness.toml:149-150` incluído; o **texto JSX não se traduz** (é payload de bancada de `D1.3b`); e o falsificador da renomeação é o ESLint continuar acusando `tipos.ts` e continuar calando sobre os dois legítimos — os mesmos quatro casos de `ADR-011/D4`, medidos **depois** do rename.
