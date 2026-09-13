# Handoff — fechar a PR #217 (`D16`: atraso de publicação e alinhamento de grade)

`[PREMISSA-OWNER: 2026-09-13]` — *"vamos fechar os trabalhos atuais q estãso com pr abertos.
Então vamos continuar até fechar todas pr em aberto"*.

## Onde ela está, e por que parou

- Branch: `ciclo/d16-atraso-medido-e-alinhamento-de-grade`. Parada desde `2026-09-11T22:33Z`.
- **61 commits atrás da master, 6 à frente** `[MEDIDO 2026-09-13]`. Master em `7b7fd20`.
- Escopo: 17 arquivos, `3.233+/10−`. Produção: `grid_aligned_ticker.py` (novo),
  `publication_lag_table.py`, `collectors_cli.py`, `deploy/compose.yml`.

⚠️ **Ela é a PR que traz o `GridAlignedTicker` para a master** — ele **não está lá**
(`git ls-tree -r origin/master | grep -iE 'ticker|aligned'` → nenhuma linha). Toda remedição que
outro documento diga estar *"esperando o ticker"* estava esperando **este merge**.

## O risco real, e é um só

`collectors_cli.py` **foi reescrito na master depois que esta branch saiu**: ganhou o wrapper
`_supervised` (que faz thread morta derrubar o processo, para o `restart: unless-stopped`
finalmente disparar) e passou de 4 para **6 threads de coletor** (`force-order`, `premium-index`,
`klines`, `open-interest`, `long-short`, `liquidation`). **Conflito ali é certo.**

⛔ **Ao resolver, o `_supervised` e as 6 threads da master têm de SOBREVIVER.** Eles consertaram
um apagão real de produção de **18h45** em `2026-09-12`: duas threads morreram de
`psycopg.OperationalError` e o processo seguiu vivo (`running=true`, `exit=0`, `restarts=0`), então
o restart nunca disparou. Perder isso no merge reintroduz um defeito que já custou quase 19 h de
silêncio. O teste que distingue é o único que morde a ordem *estado-antes-do-log* — não o apague.

## O caminho

1. Traga a master para a branch e resolva. `docs/INDEX.md` é **append-only** — união em ordem
   cronológica, nunca escolhendo um lado.
2. `make verify` (**8 portões**, não 6). ⚠️ Confira que `frontend/node_modules` é **diretório
   real**: se for symlink, 2 portões ficam verdes e o `e2e` morre com
   `TurbopackInternalError: Symlink points out of the filesystem root`.
3. ⚠️ Antes de aceitar qualquer vermelho como defeito real, **purgue `__pycache__`** e exporte
   `PYTHONDONTWRITEBYTECODE=1` — `.pyc` obsoleto já produziu 2 falsos resultados aqui num dia só.
4. QA + code-review. Aprovados, `make verify` e **merge**; grave os `gate-record`.

## Se o conteúdo estiver obsoleto, diga — não force o merge

A branch tem 4 dias e a master mudou muito. Se alguma medição dela tiver caducado (número medido
sobre população que não existe mais), **declare qual e por quê**, remediando ou removendo a
afirmação. ⛔ **Remova a afirmação falsa em vez de empilhar ressalva nela.**

## Regras que reprovam o trabalho se violadas

- Commit **sem** `Co-Authored-By` em qualquer caixa; autor e committer são o owner.
- **Nada de deploy** — houve um deploy não autorizado em `2026-09-12T23:41:13Z` que invalidou
  medições ao vivo. Postgres **somente leitura**; nunca semeie dado sintético no compartilhado.
- Todo número com o comando, o universo (`n`) e o rótulo de força.
- Passando de ~150 turnos, escreva o estado aqui e devolva. **Devolva no máximo 15 linhas.**
- **Commite antes de devolver** — seu relatório é insumo do próximo, e ele nasce em worktree.
