# Remedição do atraso de publicação de klines DEPOIS do alinhamento à grade (`O4`)

**Isto não é medição — é o comando que a produz, escrito antes de existir dado para rodá-lo.**
A task que alinhou o escalonador (`O4` de
[`OPCOES-D16-ESTATISTICA-CONTRA-A-GRADE.md`](../OPCOES-D16-ESTATISTICA-CONTRA-A-GRADE.md)) **não
mediu efeito em produção**, e não podia: a remedição exige horas de coleta **com o conserto
rodando**. `[NÃO MEDIDO — nenhum número deste documento foi observado; todos são critério, não
resultado]`

## O que mudou, em uma linha

`backend/src/modules/sentimento/infra/collectors_cli.py` fechava o ciclo de klines com
`stop_event.wait(interval_s)` **depois** do trabalho ⇒ período real `interval_s + trabalho`,
fase escorregando a cada volta. Passou a dormir **até** `bucket_end + KLINES_CYCLE_OFFSET_S`
(`GridAlignedTicker`, `infra/grid_aligned_ticker.py`) ⇒ período = `interval_s`, fase constante.

## Pré-condição — sem ela o número mede o regime velho

1. A imagem com o conserto está no serviço `collector` (`deploy/compose.yml`), **de pé**.
2. Anote `T_DEPLOY_MS` = epoch ms do momento em que o container subiu:

```bash
docker inspect -f '{{.State.StartedAt}}' deploy-collector-1
# converta para epoch ms; toda a janela abaixo tem de começar DEPOIS disso
```

3. Espere **no mínimo 18 h** de coleta contínua depois de `T_DEPLOY_MS`. Esse é o mesmo span da
   medição que achou o defeito (`n = 4.289`, `~60` polls/h/símbolo × 4 símbolos × 17,9 h), e é o
   que dá um `n` comparável. Menos que isso e a comparação antes/depois não é entre iguais.

## O comando (⛔ SOMENTE LEITURA — nenhum `insert`/`update`/`delete`, nenhum seed)

Mesma CTE da medição original (`OPCOES-D16` §F0): separador de fan-out **não circular**
(`nb <= 2`), população **ao vivo não censurada**, endpoint `/fapi/v1/klines`. A única diferença é
o piso da janela, que agora é `T_DEPLOY_MS` em vez de `0`, e o teto, que continua sendo um
`bucket_end` congelado para a janela não mexer entre duas execuções.

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c "
with g as (select series_key_id, available_at, count(*) nb from md.series group by 1,2),
     live as (select s.* from md.series s
                join g on g.series_key_id=s.series_key_id and g.available_at=s.available_at
                      and g.nb<=2
               where s.bucket_end >= <T_DEPLOY_MS>
                 and s.bucket_end <  <TETO_CONGELADO_MS>
                 and s.source='/fapi/v1/klines')
select count(*) n,
 percentile_disc(0.50) within group (order by available_at-bucket_end) p50,
 percentile_disc(0.95) within group (order by available_at-bucket_end) p95,
 percentile_disc(0.99) within group (order by available_at-bucket_end) p99,
 min(available_at-bucket_end)  mn,
 max(available_at-bucket_end)  mx,
 count(*) filter (where available_at-bucket_end >= 60000) ge60k from live;"
```

## Critério de aceite — os quatro, e o `ge60k` é o que decide

| # | critério | valor exigido | por quê |
|---|---|---:|---|
| A-1 | `ge60k` | **`0`** | é o defeito, contado direto: `105` de `4.289` antes `[MEDIDO 2026-09-11]`. Qualquer valor `> 0` significa que o alinhamento não alcançou o caso |
| A-2 | `p99` | **`<= 5.000 ms`** | teto **de aceite**, não previsão. O esperado é `offset (2.000) + trabalho do ciclo dos 4 símbolos + atraso do endpoint (`<= 12 ms`)`; `5.000` dá margem de folga sem deixar passar o regime velho, cujo `p99` era `60.936 ms`. ⚠️ Se der entre `5.000` e `60.000`, o conserto **funcionou** (a grade deixou de ser estourada) mas o `offset` está mal dimensionado ou o ciclo demora mais do que se supunha — **não** é motivo para reabrir `D16`, é motivo para medir o tempo de ciclo |
| A-3 | `mn` | **`>= 0`** | um mínimo negativo é leitura **antes** de `bucket_end`, i.e. lookahead real entrando pelo poll. Se aparecer, `KLINES_CYCLE_OFFSET_S` está baixo demais contra o skew de relógio |
| A-4 | `n` | **`>= 4.000`** | sem `n` comparável ao `4.289` da medição original, o `p99` não é comparável. `n` baixo = janela curta ou coletor caindo, e aí o número mede outra coisa |

**O alvo que o despacho nomeou, literal:** *"o `p99` tem de cair para perto dos `<= 12 ms` do
endpoint"*. Ele **não cai para `12 ms`** e não deveria: `12 ms` é o atraso do **endpoint**, e o que
esta coluna mede é `endpoint + fase do nosso poll`, com a fase agora **deliberadamente** fixada em
`KLINES_CYCLE_OFFSET_S = 2.000 ms` de margem contra skew de relógio. O que cai para perto de zero é
**a parte que era defeito** — a deriva —, e é isso que `A-1` e `A-2` medem. Quem quiser o termo do
endpoint isolado tem de descontar o `offset`: `p99 - 2.000`.

## Depois que os quatro passarem

`D16` volta à mesa com `p99` novo. Sob a recomendação do `/quant-architect`
(`OPCOES-D16` §3), o desfecho é **`O1` sem emenda nenhuma**: `SPEC-001` §5.2 intacta, `p99`
arredondado para cima cai em `bucket_end + 60.000`, sem lookahead e sem descontinuidade na
fronteira backfill↔ao-vivo.

⛔ **`backend/src/modules/sentimento/domain/publication_lag_table.py` NÃO foi tocado por esta task.**
Os números dele descrevem o regime morto e serão **remedidos**, não editados a mão — a edição é ato
de quem rodar o comando acima e tiver o número.

## Bloqueio nomeado, para não ficar silencioso

`_run_premium_index_collector` (`collectors_cli.py:636`) fecha o laço com **o mesmo**
`stop_event.wait(interval_s)` pós-trabalho e **não foi alterado** — está fora do escopo desta
task, que é o defeito de klines.

⚠️ **Corrigido em 2026-09-11 — a versão anterior desta seção dizia que o `premiumIndex` "não exibe
a assinatura do defeito na medição", e o enunciado forte é outro:**

1. **A deriva EXISTE no `premiumIndex`, e sai dos números da própria tabela.**
   `build_premium_index_to_rows` emite 2 linhas por símbolo por ciclo sobre 4 símbolos ⇒ 8
   linhas/ciclo. Com `sample_n = 34.752` e janela `window_end_ms − window_start_ms = 262.496 s`:
   `34.752 ÷ 8 = 4.344` ciclos e `262.496 ÷ (4.344 − 1) = 60,441 s/ciclo` contra os `60,0 s`
   declarados `[MEDIDO 2026-09-11 sobre os campos de `domain/publication_lag_table.py`]`.
2. **A medição é INCAPAZ de exibir a fase do poll, por construção.** `_build_row` grava
   `bucket_end = reading.source_time` (`use_cases/collector_series_mapping.py:232`), logo
   `available_at − bucket_end = received_at − source_time` — ida-e-volta de rede e nada mais. A
   fase do nosso poll é **algebricamente ausente da coluna**: o `p99 = 1.758 ms` seria idêntico
   sob um escalonador perfeito e sob um que derivasse uma hora por dia. Em klines o `bucket_end`
   vem da grade do venue (`close_time_ms`), e por isso lá a fase aparece.
   ⇒ Não é *"ausência de evidência"*; é **ausência de instrumento**.
3. **O `min = −100 ms` não pode vir do horário do poll.** `bucket_end` é o relógio da Binance ao
   responder e `available_at` é o nosso ao receber; recebemos sempre **depois** de eles carimbarem.
   Valor negativo só pode ser **desvio entre os dois relógios**.

Fica como achado nomeado, não como conserto pela metade — e agora nomeado com o motivo certo.

## ⛔ O portão está VERMELHO, e o vermelho é ESPERADO — leia antes de concluir regressão

`make verify` devolve **`rc=1`**, e a única falha é
`backend/tests/sentimento/test_publication_lag_table.py::test_the_live_lag_holds_the_grid_when_the_late_polls_are_not_censored_away`
(`assert 60936 < 60000`).

**Esse teste é o DOCUMENTO EXECUTÁVEL do defeito que este handoff existe para fechar**, não uma
regressão: ele mede o `p99` da população ao vivo **não censurada** do regime **anterior** ao
alinhamento (`60.936 ms`, estourando a grade nativa de `60.000 ms`) — o mesmo `105/4.289` que
motivou `O4`. Ele reprovava **antes** de `418f47b` e reprova **depois**, byte-idêntico
`[MEDIDO 2026-09-11: mesma falha no commit pai `967368f`, worktree detached e limpo]`.

**Quem o fecha é a remedição descrita neste documento — e só ela.** Rodar o comando da seção
anterior sobre a janela pós-deploy e substituir a cauda medida é o único ato que muda a cor. Os
critérios que decidem são os **quatro da tabela acima**, sem emenda:

| critério | valor exigido |
|---|---:|
| `ge60k` | **`0`** |
| `p99` | **`<= 5.000 ms`** |
| `mn` | **`>= 0`** |
| `n` | **`>= 4.000`** |

⚠️ **Enquanto os quatro não forem satisfeitos com dado novo, `make verify` continua `rc=1` e isso
é o estado correto.** Um portão vermelho **sem declaração** é indistinguível de regressão — é o
modo de falha que `ADR-012` nomeia para o `rc=0` ambíguo, com o sinal trocado. Esta seção é a
declaração. ⛔ **Não "conserte" o teste afrouxando a asserção**: o teto `60.000` é a grade nativa
medida (`44.612` passos, `44.612` iguais a `60.000`, 1 valor distinto), não um alvo negociável.
