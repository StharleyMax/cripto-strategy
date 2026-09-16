# `A11` — a latência de `/symbol`, medida até a causa

**Data:** 2026-09-16 · **Autor:** loop principal (orquestrador) · **Status:** medição fechada, decisão de arquitetura EM ABERTO

Escrito **antes** do despacho aos arquitetos, para que o prompt deles caiba em 20 linhas
(`docs/protocolo-de-despacho.md` R2). Nenhum número aqui foi digitado — todos carregam o comando.

## 1. A cadeia medida, do sintoma até o fundo

`[MEDIDO 2026-09-16, host local, `deploy-postgres-1` SOMENTE LEITURA, nenhuma semeadura]`

| # | o que | número | comando |
|---|---|---|---|
| 1 | `GET http://localhost:3000/symbol` | **3 de 3 estouraram 300 s**, `ttfb=0`, **0 bytes** | `curl -o /dev/null -w '%{time_total}' --max-time 300` ×3 |
| 2 | `GET /api/v1/series-catalog` | **0,659 s**, 29.930 B | `curl -w` |
| 3 | **1** `GET /api/v1/series-history`, sozinho, máquina ociosa | **17,250 s**, 570.607 B | `curl -w` |
| 4 | o `SELECT` exato por trás de (3) | **9,078 ms**, 10.047 linhas, Bitmap Index Scan | `EXPLAIN (ANALYZE, BUFFERS)` |
| 5 | (3) sob contenção, primeira vez / morno | **279,026 s** / **81,951 s** | `curl -w` ×2 |
| 6 | **4** `series-history` concorrentes (o que a página faz) | **22,2 / 44,0 / 117,2 / 124,2 s** | 4× `curl &` + `wait` |
| 7 | processo da API | **1 PID**, `python -m src.main` | `docker top deploy-api-1` |
| 8 | capacidade ociosa ao lado | **8 cores**, `NanoCpus=0`, `CpuQuota=0` | `nproc`, `docker inspect` |

**Linha 4 contra linha 3: 9 ms de banco para 17.250 ms de resposta ⇒ 99,95% do tempo é Python.**
O Postgres está inocente e o plano usa índice.

## 2. O experimento que discrimina — escala da janela

Mesma série, mesmo `knowledge_time_ms`, só a janela encolhendo:

```bash
B='http://localhost:8000/api/v1/series-history?series_key_id=94c3d3dd…&symbol=BTCUSDT&interval=1m&knowledge_time_ms=1789572240000&bar_policy=final_only'
E=1789571940000
for span in 345540000 172770000 86385000 43192500; do S=$((E-span)); curl -s -o /dev/null \
  -w "span=$((span/60000))min size=%{size_download}B total=%{time_total}s\n" "$B&window_start_ms=$S&window_end_ms=$E"; done
```

| janela | corpo | tempo | razão |
|---|---|---|---|
| 5.759 min | 570.607 B | **17,250 s** | — |
| 2.879 min | 285.487 B | **3,174 s** | 5,4× |
| 1.439 min | 142.927 B | **0,558 s** | 5,7× |
| 719 min | 71.647 B | **0,098 s** | 5,7× |

⛔ **O corpo cresce EXATAMENTE linear e o tempo cresce ~5,5× por duplicação** (4× seria quadrático
puro). **Saída linear com tempo superquadrático só acontece quando o custo está no cálculo por
ponto** — não em I/O, não em serialização, não no banco. É o falsificador que separa as hipóteses
sem precisar supor nada do interior do código.

## 3. A causa, com endereço

`backend/src/modules/sentimento/use_cases/series_history.py:229-255` percorre **cada instante da
grade** e, em cada um, chama `as_of(observations=<a janela inteira>)`.
`backend/src/modules/sentimento/domain/as_of_accessor.py:305-313` **reconstrói uma list
comprehension sobre TODAS as linhas a cada chamada**, e depois faz `max(...)` (`:321`) e `min(...)`
(`:322`) sobre `admitted` — três passadas por instante de grade.

Universo real, medido em `md.series` na janela de 4 dias (`SELECT … GROUP BY series_key_id`):

| série | linhas na janela | grades | avaliações de predicado |
|---|---|---|---|
| `23e43323…` | **36.179** | 5.760 | **208.391.040** |
| `bc0b8a78…` | **36.155** | 5.760 | 208.252.800 |
| `94c3d3dd…` | **10.047** | 5.760 | 57.870.720 |
| **a página (4 séries que chegam à API)** | — | — | **≈ 475 milhões** |

⚠️ São **6,3 linhas por bucket** (36.179 / 5.760) — revisões, não duplicatas.

**E 2 dos 5 predicados são tautológicos:** `row.series_key_id == series_key_id` e
`row.symbol == symbol` (`as_of_accessor.py:308-309`) — o SQL em
`postgres_series_window_reader.py:42` **já filtrou os dois** (`WHERE series_key_id = %s AND
symbol = %s`). São ~40% de 475 milhões de comparações cujo resultado é conhecido antes de rodar.

**O multiplicador:** o trabalho é CPU-bound em Python puro num **processo só**. FastAPI despacha
`def` síncrono num threadpool, mas o **GIL serializa** — 6 leituras concorrentes disputam um core
com 8 ociosos ao lado. É o que a linha 6 da tabela mostra: 17 s sozinho, 124 s a quatro.

## 4. ⛔ Correção de um erro meu, registrada

`gates/CODE-REVIEW-FASE-05.md` `W-2` e a entrada `A11` de `PENDENCIAS-PARA-AVALIAR-DEPOIS.md`
atribuem a degradação a *"uma API que serializa"*, com causa-raiz em
`ACHADO-API-VAZA-IDLE-IN-TRANSACTION` (`B12`/`B13`). **Está errado, e a medição refuta:** o banco
responde em **9 ms** com index scan. A causa é o laço `O(grade × linhas)` acima. `B12`/`B13`
seguem sendo defeitos reais, mas **não são a causa desta latência**.

## 5. Premissa do owner que a medição corrigiu — Granian

`[PREMISSA-OWNER, 2026-09-16]` — *"no inicio do discovery foi passado a granier justamente por ele
permitir ter esses works e gerenciar o awsgi de forma interessante"*.

**O repositório registra o oposto**, e isto é `[DOC]`, não opinião:
`docs/context/plataforma-dados/gates/T-05.12-infra-architect.md:19-30` mede que o **vizinho**
(`anything_monorepo`) serve produção **e** dev com Granian, e que **este** repositório escolheu
`uvicorn` **contra** ele — por `DoD-D5.13`, que exige provar a rota **pela rede sem subprocess**:
`uvicorn.Server` sobe na mesma thread do teste (`Config(install_signal_handlers=False)` +
`Server.run()` numa `threading.Thread`), e **Granian é servidor Rust desenhado para ser processo
próprio**. `grep -rniE 'granian'` no repo → aparece **só naquele documento**; não está instalado.

⇒ A pergunta "Granian lida melhor?" **continua válida e é do owner**, mas quem a responder tem de
pagar o custo declarado: o que acontece com `D5.13` e com os ~8 testes que sobem `uvicorn.Server`
numa thread (`backend/tests/api/test_*.py`).

## 6. As opções em cima da mesa, com o custo de cada uma

| # | mudança | ganho esperado | risco |
|---|---|---|---|
| 1 | subir workers (1 → N) | 124 s → **~20 s** a 4 painéis | exige confirmar contra `ADR-009/D3` que a API **não escreve** |
| 2 | pré-filtrar antes do laço (tirar os 2 predicados tautológicos e o corte por `observed_at <= knowledge_time`, que não depende de `t`) | ~40% (17,2 s → **~10 s**) | baixo, não toca semântica |
| 3 | **varredura única** — `t` avança monotonicamente ⇒ uma passada ordenada com ponteiro responde as 5.760 grades em `O(n log n + m)` | 17,2 s → **< 1 s** | **alto**: `as_of` é *"the single read accessor"* por ADR, guardado por `test_as_of_is_the_single_reader.py` |
| 4 | cache no servidor (resposta imutável por `D1`; `knowledge_time_ms` anda de **5 em 5 min** — medido `…571940000` → `…572240000`) | recarga → ~0 s | esconde o custo, não conserta |

**Decisão do owner (2026-09-16):** seguir com a **3**, mantendo a **1** como ajuste que vale por si,
e **avaliar Granian**. É o que os dois despachos abaixo vão validar.

## 6b. ⛔ O que os dois arquitetos DERRUBARAM deste documento

Acrescentado em 2026-09-16, depois dos laudos. **Três erros meus, nenhum apagado do texto acima.**

1. **A opção 1 como eu a escrevi CRASH-LOOPA, não degrada.** `uvicorn/main.py:603-607` faz
   `sys.exit(STARTUP_FAILURE)` com `workers>1` quando recebe app-OBJETO, e `__main__.py:40` passa
   objeto. "Risco baixo" estava errado: o serviço não sobe.
2. **A citação `ADR-009/D2`/`D3` que pus no despacho está TROCADA.** A propriedade de escritor único
   é `ADR-002/D5` + `ADR-027:81`. Mandei o arquiteto conferir contra a ADR errada; ele corrigiu.
3. **A opção 2 na forma que propus foi RECUSADA.** Li `series_key_id`/`symbol` dentro de `as_of`
   como desperdício de performance; são a **guarda de solda** (`as_of_accessor.py:283-286`).
   Sobrevive só como `2A` (o caller filtra fora do laço; `as_of` mantém os cinco predicados).

⚠️ **E `B12` sobe de sequela para PORTÃO:** `create_app` abre **2** conexões
(`src/main/__init__.py:241,251`) que ficam `idle in transaction` desde o boot — verificado pelo
orquestrador em `pg_stat_activity`: `pids` 187453/187454, **40 min** de `xact_start`, uma delas com
o `_SELECT_WINDOW_SQL` literal. `workers=N` multiplica isso por `N` ⇒ bloqueadores do `ALTER TABLE`
do coletor. **Consertar `B12` é pré-requisito de qualquer worker.**

⚠️ **Correção ao meu próprio §4:** dizer que `B12`/`B13` "não são a causa desta latência" continua
verdadeiro, mas eles **são** o que impede a mitigação. Não são inertes.

## 7. O que os arquitetos NÃO devem fazer

⛔ Nenhum código. Decisão, ADR e plano — implementação é do `builder`, com QA e code-review próprios.
⛔ Nenhuma escrita no Postgres, em nenhuma hipótese.
