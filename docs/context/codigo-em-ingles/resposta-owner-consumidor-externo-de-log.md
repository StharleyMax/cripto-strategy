# `T-04.2` (`CST-98`) — A resposta do owner sobre **consumidor externo** dos 4 eventos de log

**Feature:** `codigo-em-ingles` · **fase** `04` · **componente** `docs` · `SPEC-002` §6.2, `[GAP G2]`
· **DoD:** `CA-F4-6`

> **Por que este arquivo existe, e não só o evento de ledger.** A `T-04.2` declarou o risco antes de
> ele acontecer: *"é o deliverable mais fácil de ser engolido por uma task cujo trabalho principal é
> editar o `CLAUDE.md`"*. Ele **foi** engolido — não pela `T-04.1`, mas por um `approve build`. A
> resposta existia em **dois** lugares (o ledger e `docs/INDEX.md:86`) e em **nenhum** dos dois quem
> perguntar *"posso renomear `etl_item_publicado`?"* vai procurar. **A superfície de log divergiu
> justamente por não ter dono declarado**; registrar a resposta só onde ela foi dita repetiria o
> padrão.

---

## 1. A pergunta, literal — e ela é um FATO, não uma escolha de idioma

> *"Alguma query, alerta, dashboard ou script **fora deste repositório** consulta os nomes
> `etl_item_publicado`, `etl_item_concluido`, `etl_drenagem_concluida`, `checkpoint_cauda_truncada`,
> ou as chaves `destino`, `processados`, `janela`, `bytes_descartados`?"*

`[DOC: docs/context/codigo-em-ingles/tasks.toml:284, bloco `T-04.2` que comeca em `:272`]`

**Nenhuma das duas respostas bloqueia qualquer fase desta SPEC** — é por isso que a task nasceu `todo`
e não `blocked`.

## 2. A resposta — **NÃO**, e o rótulo importa

**`[DECISÃO-OWNER: 2026-08-29, escolha entre alternativas apresentadas]`**

> **Não existe consumidor externo** dos 4 eventos de log em português nem das 4 chaves de `extra={}`.

**Fonte primária, e é o ledger:** evento `approve build` de **`2026-08-29T15:07:17Z`**, cujo motivo
transcreve a resposta dada no mesmo ato:

```bash
harness pipeline show codigo-em-ingles | grep -F '15:07:17Z'
# → "… PERGUNTA T-04.2 JA RESPONDIDA pelo owner no mesmo ato: nao existe consumidor externo
#    dos 4 eventos de log em portugues, entao renomea-los e barato e a task fecha a divergencia agora."
```

**Fonte secundária:** `docs/INDEX.md:86` (linha de `2026-08-29T16:45Z`, *"três decisões do owner
registradas"*).

⚠️ **`[DECISÃO-OWNER]` e não `[PREMISSA-OWNER]`, e a distinção não é cerimônia:** o owner **escolheu**
`"Sim — aprovar build e despachar"` de um menu que um agente redigiu, com o custo de cada opção
declarado. Ele **não ditou** a frase acima. `[PREMISSA-OWNER]` é citação literal, na grafia dele;
usá-lo aqui inventaria uma frase que o owner nunca disse. `CLAUDE.md` é explícito sobre a diferença, e
a confusão **já produziu defeito neste repositório**.

## 3. O que **foi** medido — e é pouco, de propósito

```bash
git ls-files | grep -icE 'dashboard|alert|grafana|prometheus|loki|logql'
# → 0
```

`[MEDIDO 2026-08-29 em aac3442, universo: 100% dos arquivos versionados]` — **zero** dashboards,
alertas ou coletores **versionados neste repositório**.

E os 9 eventos, medidos por **AST** (não por `grep` — ver §6), continuam **intactos**: 4 em português,
5 em inglês.

| # | evento | idioma | call site | chaves de `extra={}` |
|---|---|---|---|---|
| 1 | `etl_item_publicado` | **PT** | `infra/file_etl_worker.py:41` | `etl_key`, **`destino`** |
| 2 | `etl_item_concluido` | **PT** | `use_cases/drain_etl_backlog.py:62` | `etl_key` |
| 3 | `etl_drenagem_concluida` | **PT** | `use_cases/drain_etl_backlog.py:63` | **`processados`**, **`janela`** |
| 4 | `checkpoint_cauda_truncada` | **PT** | `infra/jsonl_checkpoint.py:76` | **`bytes_descartados`** |
| 5 | `checksum_sidecar_absent` | EN | `infra/checksummed_file_payload.py:78` | `subject` |
| 6 | `ingest_run_persisted` | EN | `infra/sqlite_ingest_record_store.py:218` | `run_id` |
| 7 | `ingest_gap_persisted` | EN | `infra/sqlite_ingest_record_store.py:237` | `source`, `symbol` |
| 8 | `ingest_health_query_read` | EN | `use_cases/ingest_health.py:66` | `runs`, `gaps` |
| 9 | `ingestion_verified` | EN | `use_cases/ingest_verified_payload.py:162` | `subject`, `sha256`, `lines` |

Prefixo comum das 9 linhas: `backend/src/modules/sentimento/`.
`[MEDIDO 2026-08-29 em aac3442 por AST — `ast.walk` sobre 100% dos `.py` de `backend/src`; n=13
chamadas de `logger.*`, das quais 9 eventos, 3 mensagens formatadas e 1 `%s`]`.

## 4. O que a medição **NÃO** prova — e esta seção é a metade que dá valor à outra

**`0` dashboards versionados NÃO é ausência de consumidor.** `[NÃO MEDIDO]`, declarado:

- `backend/src/modules/sentimento/infra/ingest_health_cli.py:69` **antecipa um hospedeiro externo, em
  docstring**: *"A `cron` wrapper, a scheduler or a supervisor calls
  `logging.basicConfig(stream=sys.stdout, level=INFO)` before calling anything"*. **O desenho conta
  com alguém lá fora lendo `stdout`.**
- **O que roda na VPS do owner está fora do alcance de qualquer agente.** Nenhum comando executável
  neste repositório observa o `crontab`, o `journald` ou o coletor de lá.

**É exatamente isso que torna a pergunta barata de responder e cara de errar:** o `git ls-files`
custa 1 comando; um `grep` que deixou de casar custa `rc=0` com **zero linhas**, e ninguém é avisado.

## 5. A consequência — o ramo barato da regra condicional de `T-04.1`

A `T-04.1` escreveu a regra condicional **antes** da resposta, para que ela não precisasse de outro
round. Com o **não**, o ramo que vale é o primeiro:

| resposta | migração | vale? |
|---|---|---|
| **sem consumidor** | **rename direto**, em **fase própria e futura** | ✅ **este** |
| com consumidor, ou o owner não sabe | **emissão dupla** por janela declarada; o antigo só sai depois de o owner confirmar que a consulta migrou | ❌ não se aplica |
| sem resposta | nada acontece com os 4, e **nada trava** | ❌ houve resposta |

**Duas coisas que este documento NÃO autoriza, e omiti-las seria o defeito caro:**

1. ⛔ **Nenhum dos 4 eventos é renomeado por esta SPEC.** `CA-F4-5` é o critério que prova, e
   `SPEC-002` §6.3 é quem decide. Barato **não é** o mesmo que *feito*: a migração continua sendo
   **unidade própria e futura**, com dono e fase declarados quando for cardada.
2. ⛔ **A regra prospectiva continua valendo** (`CLAUDE.md`, linha 10 da tabela de fronteira): todo
   evento e toda chave **novos** nascem em inglês. Hoje são **4 PT de 9**, e **o número não pode
   subir** — é o falsificador da fase `04`.

## 6. ⚠️ Divergência registrada — o comando publicado em `CA-F4-5` é CEGO

`CA-F4-5` manda medir com
`grep -rnE 'logger\.(info|warning|debug|error)\("' backend/src | wc -l` esperando **9**. O comando
devolve **7**, e **a afirmação `9 eventos, 4 PT + 5 EN` está CERTA** — quem erra é o instrumento, nos
**dois** sentidos:

- **perde 3** eventos cuja chamada está quebrada em duas linhas — `etl_drenagem_concluida`,
  `ingest_health_query_read`, `ingestion_verified` (a regex exige `logger.info("` **na mesma linha**);
- **conta 1** que não é evento — `use_cases/probe_bucket_coupling.py:75`, uma mensagem formatada
  (`"leitura do contador de %s falhou: %s"`), não um nome de evento.

`9 − 3 + 1 = 7`. **`7` não é reprovação desta entrega** — nenhuma task desta fase renomeia evento
algum. **A metade do critério que funciona** é o `grep -F` por nome, e ela passa: os 4 em português
estão presentes, 1 ocorrência cada (§3).

**Critério de aceite NÃO foi reescrito** — isso é ato do `/tech-lead`, e a divergência está registrada
aqui e em `docs/context/codigo-em-ingles/gates/T-04x-build.md` para que ele decida.
