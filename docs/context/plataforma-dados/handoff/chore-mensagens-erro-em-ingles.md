# Handoff — traduzir mensagens de `raise`/`Error`/`Exception` para inglês

**Não é task numerada** — limpeza autorizada diretamente pelo owner. **Base:**
`master@76c4d65` (branch `chore/mensagens-erro-em-ingles`, já com 5 mensagens corrigidas). **Worktree:**
`/tmp/claude-1002/wt/lang-cleanup`.

## Por que

Owner, literal: *"pode ajustar essas questão do português e remover essas mensagens"* — respondendo ao
achado do `/review` de `T-03.6` de que `CLAUDE.md` §"Idioma de identificador" tinha uma lacuna
`⏸ NÃO DECIDIDO` sobre mensagem de exceção, com gatilho de reabertura já disparado (3 PT → 50 PT).
Ver `CLAUDE.md` §"Mensagem de exceção — RESPONDIDA em 2026-09-02" (já editado neste commit) para o
texto normativo completo. **Decisão: toda mensagem de `raise X("…")` vira inglês.**

## O que já foi feito (não repita)

`etl_backlog.py` (2), `quota_bucket.py` (1 de 3 — `bucket_by_identifier`), `ramp_ledger.py` (2). Rode
o scanner abaixo primeiro para ver o que falta de verdade.

## Como achar TODAS as mensagens — não confie em grep de uma linha

Um grep de uma linha SUBCONTA (raise partido em várias linhas não casa). Use o scanner AST em
`/tmp/claude-1002/wt/lang-cleanup/scan_raise_pt.py` (já neste worktree):

```bash
cd /tmp/claude-1002/wt/lang-cleanup
python3 scan_raise_pt.py
# TOTAL=137 PT=45 EN=87   (45, nao mais 50 — os 5 ja corrigidos saem da lista)
```

A lista impressa é `arquivo:linha construtor: texto` — cada linha marcada PT é uma mensagem a traduzir.
**O heurístico de PT/EN é aproximado** (regex de palavras comuns) — leia a mensagem antes de mexer;
se o script errar uma classificação (raro, mas confira principalmente strings mistas número+palavra),
use seu julgamento, não o script cegamente.

## Regras da tradução

- **Só o TEXTO da mensagem.** Não toque em docstring, comentário, nome de variável, nome de exceção —
  isso é escopo de outra decisão (docstring/comentário já é `[DOC]` inglês desde `ADR-011/D6`, mas
  **não foi pedido aqui**; não expanda o escopo).
- Preserve QUALQUER `{variavel}` de f-string exatamente — só troque as palavras em volta.
- Preserve o SENTIDO técnico exato — várias mensagens citam números/ADRs/regras específicas
  (`ADR-004 B1`, `D3.3`, etc.) — não generalize, não resuma.
- **Nenhum teste depende do texto da mensagem** (`[MEDIDO 2026-09-02]`:
  `find backend/tests -name '*.py' -exec grep -l "pytest.raises.*match=" {} \;` → vazio) — pode traduzir
  sem medo de quebrar asserção de string, mas rode a suíte mesmo assim para pegar qualquer coisa que o
  grep não viu.

## Depois de traduzir todas

1. Rode `python3 scan_raise_pt.py` de novo — **PT tem que chegar a 0** (menos o que estiver fora de
   `backend/src`, que não é o universo medido aqui).
2. `bash backend/scripts/test.sh` — **aguarde ATIVAMENTE terminar**, não dispare em background e pare
   o turno esperando notificação (não funciona para subagente nesta sessão).
3. `bash backend/scripts/natureza.sh` e `boundaries.sh` — nenhuma mudança de import esperada, só texto.
4. `harness rules --mode sweep --changed-only --format ndjson` — 0 achado bloqueante esperado.

## Também precisa ser feito: os 7 novos de `T-03.6` (PR #73, ainda não mesclada)

Outra worktree, `/tmp/claude-1002/wt/T-03.6`, branch `tasks/T-03.6-availability-probe-set`. Arquivos:
`availability_poll.py`, `availability_lag_stats.py`, `availability_probe_set.py` (4 mensagens),
`system_probe_clock.py`. Rode o MESMO `scan_raise_pt.py` (copie para lá) apontando para essa worktree,
traduza, rode a suíte de lá também, commit e push nessa outra branch — **PR #73 continua separada, não
misture os dois commits**.

## Restrições do repositório

- Idioma de identificador em inglês (já é regra — esta task só estende a mensagem de exceção para o
  mesmo tratamento), `docs/INDEX.md` append-only, sem `Co-Authored-By:`.
- Push: `HARNESS_MECHANISM=/home/stharley/.claude/plugins/cache/harness/harness-plugin/0.13.0/bin/harness`,
  URL explícita `https://github.com/StharleyMax/cripto-strategy.git`, nunca `--force-with-lease`.

## Entrega

Dois PRs: um da branch `chore/mensagens-erro-em-ingles` contra `master` (as 45 mensagens do repo já
mesclado); um push adicional na branch `tasks/T-03.6-availability-probe-set` (os 7 de `T-03.6`, PR #73
já existe, só adicione commit).

Devolva no máximo 15 linhas: números de antes/depois dos dois scans, PRs/commits, caminho de qualquer
relatório que você escrever. Nunca cole o corpo.
