# `CA-F4-5` — o critério afirma o número certo com um comando que não o produz

**Achado do coordenador do loop, 2026-08-29, em `master@aac3442`.** Encontrado ao conferir se a fase
`04` da `codigo-em-ingles` estava entregue antes de virar status de task. **Ela não estava** — e o
critério que mediria o falsificador da fase é cego.

## O que `CA-F4-5` manda rodar, literal

`docs/context/codigo-em-ingles/tasks.toml`, bloco `id = "T-04.1"`:

> `CA-F4-5` (os 9 eventos INTACTOS: `grep -rnE 'logger\.(info|warning|debug|error)\("' backend/src | wc -l` -> 9, com os 4 portugueses presentes por `grep -F` de cada um)

## O que ele devolve hoje

```bash
grep -rnE 'logger\.(info|warning|debug|error)\("' backend/src | wc -l
# 7        ← o critério publica 9
```

`[MEDIDO 2026-08-29 em aac3442, n=7 linhas]`

## A afirmação está CERTA; o instrumento está ERRADO — e erra nos dois sentidos

Contado por AST (`ast.Call` com `logger.<nível>` e `ast.Constant` de `str` no primeiro argumento),
sobre o mesmo `backend/src`:

```
total de chamadas logger.*(literal)      10
EVENTOS NOMEADOS (sem espaço no nome)     9   ← 4 PT + 5 EN, exatamente o que os documentos afirmam
MENSAGEM FORMATADA (com espaço)           1
```

`[MEDIDO 2026-08-29 em aac3442, n=10 chamadas]`

**Os 9 eventos, com o call site:**

| evento | idioma | call site |
|---|---|---|
| `checkpoint_cauda_truncada` | PT | `infra/jsonl_checkpoint.py:76` |
| `etl_drenagem_concluida` | PT | `use_cases/drain_etl_backlog.py:63` |
| `etl_item_concluido` | PT | `use_cases/drain_etl_backlog.py:62` |
| `etl_item_publicado` | PT | `infra/file_etl_worker.py:41` |
| `checksum_sidecar_absent` | EN | `infra/checksummed_file_payload.py:78` |
| `ingest_gap_persisted` | EN | `infra/sqlite_ingest_record_store.py:237` |
| `ingest_health_query_read` | EN | `use_cases/ingest_health.py:66` |
| `ingest_run_persisted` | EN | `infra/sqlite_ingest_record_store.py:218` |
| `ingestion_verified` | EN | `use_cases/ingest_verified_payload.py:162` |

**O `grep` erra duas vezes, e as duas quase se cancelam — que é o pior caso possível:**

1. **Perde 3 eventos** cujo `logger.info(` e cujo nome estão em **linhas diferentes** —
   `etl_drenagem_concluida`, `ingest_health_query_read`, `ingestion_verified`. O regex ancora em
   `("` na mesma linha; uma chamada quebrada em duas linhas nunca casa.
2. **Conta 1 não-evento** — `use_cases/probe_bucket_coupling.py:75`,
   `logger.debug("leitura do contador de %s falhou: %s", …)`, que é **mensagem formatada**, não nome
   de evento. A linha 10 do `CLAUDE.md` fala de *"nome de EVENTO DE LOG"*; isto não é um.

`9 − 3 + 1 = 7`. **O número publicado quase reaparece por dois erros que se compensam parcialmente** —
e é por isso que ninguém viu.

## Por que isto importa mais do que um off-by-two

O falsificador declarado da fase `04`, palavra por palavra no `tasks.toml`:

> *"Hoje sao 4 de 9, E O NUMERO DE PORTUGUESES NAO PODE SUBIR."*

**A quebra de linha é o caminho de menor resistência para um evento novo.** Um `extra={}` com três
chaves já força o `black`/`ruff` a quebrar a chamada — foi exatamente o que aconteceu com
`etl_drenagem_concluida`. Logo um **quinto evento em português**, escrito da forma mais provável,
**nasce invisível para o critério que existe para pegá-lo**.

É a família de defeito que este repositório já nomeou: **método de busca que não vê o que afirma ver**.
E é a mesma classe do `rc=0` de `ADR-012` — o critério devolveria "está tudo intacto" tanto quando está
quanto quando o instrumento não é capaz de distinguir.

## O que NÃO estou fazendo, e por quê

**Não reescrevo `CA-F4-5`.** Critério de aceite é ato do `/tech-lead`; a `T-04.1` sequer foi construída,
e emendar o DoD de uma task não iniciada por fora do papel que o escreve é como a divergência começa.
Este documento é o **caso concreto** que a emenda vai citar.

**A correção sugerida, para quem for emendá-la:** contar por AST, e separar **evento nomeado**
(literal sem espaço) de **mensagem formatada**. O script desta medição está reproduzido acima em
prosa; ele cabe em 12 linhas e não precisa de dependência nova.

## Estado da fase 04, medido — ela NÃO está entregue

| critério | comando | medido | veredito |
|---|---|---|---|
| `CA-F4-1` | `grep -n '^\| 10 \|' CLAUDE.md \| grep -c 'INFERRED:'` | `1`, e `0` para `NÃO DECIDIDO` | ✅ |
| `CA-F4-2` | `grep -cF 'T-07.13' CLAUDE.md` | **`0`** — exige rc=0 nos três | ⛔ **REPROVA** |
| `CA-F4-3` | `grep -n '^\| 12 \|' CLAUDE.md` | marcador `1`, `owner` `1` | ✅ |
| `CA-F4-5` | o `grep` publicado | **`7`**, publica `9` | ⛔ **instrumento cego** |
| `CA-F4-6` | registro da resposta do owner em `docs/context/codigo-em-ingles/` | **arquivo não existe** | ⛔ **REPROVA** |
| `CA-F1-1` | `grep -c '^\| [0-9]* \| \*\*' CLAUDE.md` | `12` | ✅ |

`[MEDIDO 2026-08-29 em aac3442]`

**`CA-F4-2` reprova por um motivo real, não formal:** o `CLAUDE.md` diz que reabrir a coluna de
contrato *"é ato daquela ADR, não desta feature"*, mas **não nomeia o momento de reabrir**. A `T-04.1`
manda escrever que a reabertura acontece quando `T-07.12`/`T-07.13` escreverem o consumidor da
projeção. Sem isso, a exceção fica sem gatilho — que é precisamente o defeito que a task existe para
consertar.

**`CA-F4-6`:** a resposta do owner (*não existe consumidor externo dos 4 eventos*) está no **ledger** e
em `docs/INDEX.md:86`, mas **não** em `docs/context/codigo-em-ingles/`. A própria `T-04.2` antecipa
isto: *"é o deliverable mais fácil de ser engolido por uma task cujo trabalho principal é editar o
`CLAUDE.md`"*. Foi engolido por um **evento de ledger**, o que o texto não previu e não deixa de ser o
mesmo desfecho: quem procurar a pergunta onde ela foi prometida não a acha.
