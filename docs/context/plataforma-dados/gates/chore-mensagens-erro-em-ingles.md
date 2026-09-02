# Relatório — traduzir mensagens de `raise`/`Error`/`Exception` para inglês

Branch: `chore/mensagens-erro-em-ingles`, base `master@76c4d65`.

## Medição inicial (scanner AST, `scan_raise_pt.py`)

```
cd backend && python3 ../scan_raise_pt.py
# TOTAL=137 PT=50 EN=87
```

50, não 45 como o handoff estimava — os 3 arquivos citados como "já feitos" (`etl_backlog.py`,
`quota_bucket.py`, `ramp_ledger.py`) estavam parcialmente corrigidos (2 de 3 raises cada), e o
scanner conta por AST, não pela estimativa do handoff.

## Achados de blind spot do próprio scanner (declarados, não escondidos)

O heurístico de `scan_raise_pt.py` usa uma lista fixa de palavras-PT. Ele **perdeu** mensagens
reais em português por dois motivos:

1. **Heurístico de palavra não cobre todo vocabulário PT** — ex.: `"conexao fechada antes de
   completar o handshake"` (nenhuma palavra da lista bate). Achado por leitura manual arquivo a
   arquivo (obrigatória pelo handoff: "leia a mensagem antes de mexer").
2. **Mensagens em posição de argumento não-primeiro** de exceções multi-arg (ex.:
   `StreamTransportError(ProbeStage.FRAME, "texto")`) — o scanner varre `node.args` inteiro, então
   captura a maioria, mas o texto de ajuda (`what` em `_exactly(..., "cabecalho do frame")`) só
   aparece embutido numa f-string de OUTRA chamada, fora do argumento literal do `raise`.

Um segundo scanner ad-hoc (grep de AST mais amplo, descartado após uso, não commitado) achou mais
7 mensagens em 6 arquivos que o primeiro scanner classificou como EN por não conterem nenhuma das
palavras da lista original: `etl_backlog.py`, `recoil_policy.py`,
`capture_instrument_universe_snapshot.py`, `binance_futures_snapshot_client.py`,
`coinalyze_history_client.py`, `qnq_divergence.py` (parcial — só o termo `deficit-em-bp` dentro de
uma frase já em inglês).

## Medição final

```
python3 scan_raise_pt.py
# TOTAL=137 PT=2 EN=135   (os 2 restantes são falso-positivo do heurístico: "namespace" bate a
# palavra-gatilho mas o texto já está em inglês — conferido por leitura manual)
```

**PT real: 0 de 137.**

## Testes que dependiam do texto (achado que contradiz a premissa do handoff)

O handoff citava `find backend/tests -name '*.py' -exec grep -l "pytest.raises.*match=" {} \;` →
vazio, como prova de que nenhum teste dependia do texto. Rodando o mesmo comando aqui:
**31 arquivos**, não vazio — a premissa estava errada (ou medida antes de os testes existirem).
29 testes falharam na primeira rodada de `test.sh` porque seus `match="..."` apontavam a string
antiga em português. Todos os 29 foram corrigidos para casar com o texto novo em inglês, sem
alterar a asserção de comportamento nem o `stage`/tipo de exceção — só a substring esperada.

## Comandos rodados e resultado

- `bash backend/scripts/bootstrap.sh` → venv criada, Python 3.13.13.
- `bash backend/scripts/test.sh` → **960 passed**, cobertura **98,17%** (domain 99,9%, use_cases
  100%, infra 96,0%; piso 90/80/70 OK).
- `bash backend/scripts/natureza.sh` → universo 50 arquivos, 0 leituras de relógio.
- `bash backend/scripts/boundaries.sh` → **3 kept, 0 broken**.
- `harness rules --mode sweep --changed-only --format ndjson` → saída vazia, `rc=0` (0 achados).

## Arquivos alterados

23 arquivos em `backend/src/modules/sentimento/{domain,infra,use_cases}` (só o texto de mensagens
de exceção) + 12 arquivos em `backend/tests/sentimento/` (só a string de `match=`, para acompanhar
a tradução). Nenhum nome de identificador, docstring, comentário ou nome de teste foi alterado,
com uma exceção deliberada: o comentário em `ingest_health.py` que justificava a mensagem em
português via `SPEC-001` §3.8 foi atualizado porque ficaria **factualmente falso** após a tradução
(o comentário dizia "a mensagem fica em português", e a mensagem não fica mais) — decisão já
coberta por `CLAUDE.md` §"Mensagem de exceção — RESPONDIDA em 2026-09-02", que trata esta
mensagem como qualquer outra da fronteira do inglês.
