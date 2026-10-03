# W8-REVIEW — auditoria arquitetural da wave W8 (fase 06 + T-05.6) (`harness-plugin:reviewer`)

**Veredito: COMPLIANT** @ `a451027` (base `d2055d9`). Transcrito pelo orquestrador a partir do retorno do reviewer, que é read-only.

- **Denominador:** 8/8 regras `block` (`harness rules list --severity block`) [MEDIDO]. Os 90 arquivos A/M de `git diff d2055d9..a451027` foram varridos com `harness rules --mode file --path`, com 0 bloqueio [MEDIDO]. As seis respostas rc=2 são `[AVISO] core.module-docstring-single-line` na linha 1. Uma é nova (`repeated_fact.py`). As outras cinco (`main/__main__.py`, `postgres_series_sink.py`, `postgres_series_window_reader.py`, `single_writer_cli.py`, `write_series_row.py`) são anteriores à wave: os hunks começam em 14/28/49/387/17. `make boundaries` deu 7 kept, 0 broken, rc=0 [MEDIDO]. O falsificador de segmentos dá 23 = 23 [MEDIDO]. A chave Coinalyze tem 0 ocorrências no diff [MEDIDO].

## Achados

- **[WARNING] `core.module-docstring-single-line`** em `backend/src/modules/sentimento/domain/repeated_fact.py:1`. O módulo novo tem uma docstring de 26 linhas. Hoje 71 de 224 módulos de `backend/src` com docstring estão fora da regra [MEDIDO, `head -1` sobre `git ls-files 'backend/src/*.py'`], e este é o 72º. **Correção:** deixar a docstring numa linha e passar o texto dos três termos para um bloco de comentário logo abaixo.
- **[WARNING] idioma, convenção e não portão:** os comentários do arquivo novo `scripts/md-series-compaction/compact.sh:2-31` (e os `die`) estão em português (CLAUDE.md, tabela de fronteira, linha 5). Atenuantes: `scripts/` não está em `code_paths`; `verify.sh` tem precedente em português. Os irmãos da mesma task (`flags.sql`, `envelopes.py`) e `scope-resolve.sh` foram escritos em inglês. **Correção:** traduzir os comentários, mantendo números e rótulos `[PREMISSA-OWNER]` literais.

> **Destino dos dois WARNINGs (orquestrador, 2026-10-03):** somados ao builder da correção N-1 (`gates/T-06.4-fix-N1.md`), que já edita `compact.sh`.

## Sem violação, conferido

- **Escritor único e append-only (ADR-002/D1, D5, D6, e a emenda de 2026-10-02; ADR-041/D4 e a emenda):** as emendas só acrescentam texto, com 0 linha removida em `docs/adr` [MEDIDO]. O predicado (`FACT_COLUMNS`, 13 colunas) é o mesmo no escritor e em `flags.sql`, e um teste prende os dois. `flags.sql` também exclui os buckets com `available_at` descendo; a prova (`T-06.4-prova.md` §3.3) declara essa exclusão como "precaução", não como condição de correção. O `DELETE` é declarado fora do escritor (`ADR-002:425`). `compact.sh` recusa `DOCKER_HOST` remoto e contexto docker que não seja o default (`:134-139`), exige `COMPACT_CONFIRM` e só roda com o pipeline parado (B-1). O escopo "só local" é `[PREMISSA-OWNER]` literal. Nenhum outro caminho do diff escreve em `md.series`; `envelopes.py` e `screen-latency-probe.py` só leem.
- **Camadas:** `domain/repeated_fact.py` importa só de `domain/provenance`; `use_cases` importa de `domain`; `infra` implementa a porta `ObservedLookup.immediate_predecessor`; `immediate_predecessor` encerra a transação de leitura (`commit` antes do retorno). No front há só um import interno de `app/symbol`.
- **ADR-035/D1:** `SKIPPED_IDENTICAL_FACT` não soma em `n_written` e registra o run com +0 (`single_writer_cli.py:397`).
- **ADR-027/D1:** não há serviço novo. Os workers são processos filhos do mesmo `python -m src.main` (`deploy/compose.yml:111-130`).
- **Idioma do código de produção:** `InvalidWorkerCountError` e a mensagem dele, o evento `series_write_skipped`, as chaves de `extra` e `n_skipped_identical` estão em inglês. Os arquivos novos têm nome em inglês. O WARNING de W7 em `compose.yml:259-268` foi corrigido. O português em `frontend/src` é microcopy de UI (linha 8 da tabela).
- **Regra de dois modos (`25037e4`) contra o código:** lint ×2, `test-frontend`, `boundaries`, `regras` e `validate` rodam inteiros nos dois modos; o pytest ALVO usa `test-scope.sh --no-cov` e recusa rodar sem alvo; diff de front sem teste que nomeie o arquivo ⇒ PULADO; a varredura da Coinalyze roda sempre (`verify.sh:342-345`); `e2e/11` sempre entra (`scope-resolve.sh:105`) e `E2E_EXTRA` só acrescenta (`:294`); caminho sem regra ⇒ COMPLETO (`:290`); mapa alterado no diff ⇒ COMPLETO (`:194`); token malformado ou faixa invertida ⇒ recusa (`:66-75`); o completo passa `E2E_SPECS=` na linha de comando (`verify.sh:413`); não existe `SKIP_E2E`; o cache só é gravado com `COMPLETO_DE_FATO=1` (`:503`).
- **Append-only do registro:** `docs/INDEX.md` não tem nenhuma linha removida [MEDIDO].

## INFO

1. **O texto do CLAUDE.md não cobria um caso do código.** Um `--scope` que resolve COMPLETO nos dois lados imprime `VERDE —` e grava o cache (`verify.sh:195,481,503`; documentado só em `verify.sh:70`). Depois disso, o `make verify` da wave sobre a mesma árvore responde `VERDE (cache da árvore)` (`:145`). **Destino:** frase acrescentada ao `CLAUDE.md` e ao protocolo pelo orquestrador (gate da wave roda com `VERIFY_FORCE=1`).
2. **Exceção a D5 mal localizada na emenda.** A emenda de ADR-002 declara o `DELETE` fora do escritor no parágrafo sobre D6 (`:425`); o parágrafo sobre D5 (`:420`) não menciona a exceção. **Destino:** follow-up (ADR é append-only; não reescrito nesta wave).
3. **"Diff de front não roda pytest" não é absoluto.** `scope-resolve.sh:175` puxa, para qualquer caminho, os testes de backend que o nomeiam. O desvio vai para o lado seguro. **Destino:** frase do `CLAUDE.md` ajustada pelo orquestrador.
