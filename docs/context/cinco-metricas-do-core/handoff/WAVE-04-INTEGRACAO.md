# Handoff — wave de INTEGRAÇÃO: juntar o que já está pronto e fazer chegar em produção

> Escrito em 2026-09-12. Este é o passo que **nenhuma fase é dona**, e é por isso que ele existe:
> três fases devolveram verde em worktree efêmera e produção continua sem as métricas delas.

## O fato que justifica esta wave, com o comando

```sql
select src_label_raw, count(distinct series_key_id), count(*) from md.series group by 1;
```
→ `klines` · `premiumIndex` · `openInterestHist` — **3 famílias** `[MEDIDO 2026-09-12]`.
`cvd_source`: **0 linhas em produção**. `count_long_short_ratio`: **0 em produção** (as 2.100 linhas
da fase 04 vieram de coletor efêmero). E:

```bash
git grep -c -iE 'open_interest|openInterest' master -- backend/src/modules/sentimento/infra/collectors_cli.py
```
→ **`rc=1`, nenhuma ocorrência**. O contêiner de produção **não sabe coletar open interest**; as 8.064
linhas foram uma execução avulsa. ⇒ **verde de fase ≠ métrica viva.**

## As branches a integrar, nesta ordem

| ordem | branch | o que traz | por que nesta posição |
|---|---|---|---|
| 1 | `worktree-agent-a51f816889224e772` | fase 05 `T-05.1`–`T-05.4` **e o commit `90f18fa`, que tira valores vivos do `.env.example` versionado** | ⛔ **primeiro, e sem discussão**: o repositório é PÚBLICO (`gh repo view` → `"visibility":"PUBLIC"`). Cada clone novo enquanto isso não entra leva as credenciais junto |
| 2 | `worktree-agent-a02a90124b12e6b19` | fase 03 — coletor de open interest (`ae24e23`) | é o que faz o OI **continuar** existindo em vez de congelar |
| 3 | `worktree-agent-a714e16e185cbef5f` | fase 02 backend — CVD (`e9d0f8f` e antecessores) | `make verify` VERDE 6/6 na worktree |
| — | `task/cinco-metricas-do-core-f04-long-short` (`e10f1d2`) | fase 04 | ⛔ **NÃO integre ainda.** Depende da decisão de `handoff/BLOQUEIO-F04-RATIO-NAO-CARREGA.md`, que corre em paralelo. Mudar identidade depois do merge é migração, não correção |

## Hot files que VÃO conflitar — são conhecidos, não surpresa

- `H1` `infra/collectors_cli.py` — fases 03 e 05 escrevem nele.
- `H2` `use_cases/series_catalog.py` — cada fase acrescenta linha de catálogo.
- `H3` `use_cases/collector_series_mapping.py`.

**Resolva por UNIÃO, nunca escolhendo um lado**: cada fase acrescenta uma métrica; um catálogo que
perde uma linha devolve `422 UnknownSeriesKeyIdError` e o painel fica vazio **com `rc=0`**.

## ⛔ O defeito de produção que esta wave tem de consertar, e ele é o mais caro

Produção ficou **18 h 45 min** sem coletar e **nada acusou**:

- Postgres desligou em `2026-09-11T19:53` (`AdminShutdown`) ⇒ `OperationalError: the connection is
  closed` em `collectors_cli.py:1013` ⇒ **`Exception in thread collector-klines`** e
  **`collector-premium-index`**, 2 de 2.
- O **processo continuou vivo**: `docker inspect` → `running=true`, `exit=0`, **`restarts=0`**.
  `restart: unless-stopped` nunca disparou porque nada saiu.

⇒ **Se uma thread de coletor morre, o processo tem de SAIR com código não-zero.** Sem isso a política
de restart é decorativa. É a mesma classe do `ACHADO-FORCEORDER` (46 h mudo) e do `inf` que mata a
thread sem matar o processo. **Teste que prova**: thread morre ⇒ processo sai ⇒ `rc != 0`.

Segundo defeito, achado no mesmo diagnóstico: a **API vaza `idle in transaction`** (2 sessões abertas
72 min e 35 min, desde o próprio boot), o que travou o `ALTER TABLE` de boot do coletor e **congelou
`md.ingest_run` inteira para leitura**. Registre; o conserto pode ser task própria.

## Cuidado que não é opcional

**Purgue `__pycache__` e use `PYTHONDONTWRITEBYTECODE=1`** antes de acreditar em qualquer vermelho ou
verde. Isto produziu DOIS falsos resultados hoje: 4 falhas fantasma num QA e **11 testes reprovando
com o código correto** na fase 04 (o `.pyc` do mutante continuava válido depois de restaurar o fonte).

## DoD desta wave

1. Branch única de wave com as 3 integradas, conflitos resolvidos por união.
2. `make verify` **na árvore integrada, com a máquina ociosa**. `INDETERMINADO` não é verde — se der,
   diga `INDETERMINADO` e falsifique antes de reportar.
3. Teste novo: thread de coletor morre ⇒ processo sai com `rc != 0`.
4. PR aberta, descrevendo as 3 fases e os 2 defeitos de produção.
5. **NÃO faça deploy.** A senha do Postgres pode ser rotacionada pelo owner (credenciais vazadas em
   repo público); deployar antes da decisão dele é trabalho jogado fora. Deixe os comandos prontos.
