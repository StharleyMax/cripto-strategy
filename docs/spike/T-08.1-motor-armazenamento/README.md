# Spike do motor de armazenamento — T-08.1 / CST-69

Resolve `ADR-002`/D4: candidato **4** (TimescaleDB em `postgres:15`) × candidato **5**
(Parquet no R2 + DuckDB `httpfs`). Os cinco critérios foram declarados **antes** de rodar
— são os de `ADR-002`/D4, repetidos ao pé da letra em `D8.21` do plano da fase 08 — e este
diretório é o comando que produziu cada número citado na emenda de `ADR-002`.

**Resultado, em uma linha:** candidato 4 passa nos cinco critérios, medidos. Candidato 5
passa nos quatro que dá para medir sem a VPS e sem a conta R2, e o quinto (`latência de
rede`) fica `[NÃO MEDIDO]` — não por omissão, por não ter credencial nem acesso à VPS
neste ambiente. Ver a emenda em `docs/adr/ADR-002-motor-de-armazenamento.md` para a decisão
e o raciocínio completos.

## Por que dado real, e de onde ele vem

`data/` está fora deste checkout (gitignored, não versionado — `CLAUDE.md` §"Dado bruto não
é versionado") e este ambiente não tem acesso às 8.637 linhas de `metrics` de BTCUSDT
citadas em `ADR-002`. Em vez de sintetizar dado falso, `fetch_data.py` puxa Open Interest
**real** da API pública da Binance Futures (`/futures/data/openInterestHist`, sem API key)
para 4 símbolos × 30 dias × 5 min — mesma cadência e mesma ordem de grandeza documentada em
`ADR-002` (288 linhas/dia/símbolo). Isto é dado de mercado real, **de uma janela diferente**
da citada em `ADR-002` (aquela é de ~2026-08-18; esta é de 2026-09-04) — rotulado como tal em
todo lugar que o cita.

**Simplificação declarada:** só as colunas de Open Interest (`sum_open_interest`,
`sum_open_interest_value`), não as sete colunas de procedência inteiras nem funding/CVD/
liquidação. O spike testa o **motor** (espaço, tempo, correção bitemporal), não o schema de
produção completo — a forma bitemporal (event_time/available_at/observed_at/is_final/fonte)
é a mesma, o número de colunas de valor não muda nenhum dos cinco critérios.

## Passo a passo (reprodutível)

```bash
# 1. Puxa OI real da Binance (paginação: startTime + endTime por página, NÃO só
#    startTime -- ver o comentário em fetch_data.py sobre por que a paginação ingênua
#    pula direto pro fim).
python3 fetch_data.py --symbols BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT --days 30 --out-dir ./raw
# -> 8.624 linhas/símbolo, 4 símbolos, 34.496 linhas reais [MEDIDO 2026-09-04]

tar -czf raw_source.tar.gz raw/*.csv
du -sb raw_source.tar.gz
# -> 603.727 bytes: "o zipado da fonte" do critério de espaço

# 2. Monta o dataset bitemporal + injeta as 3 classes de veneno de SPEC-001 §5.1,
#    e calcula a referência esperada em Python puro (independente de qualquer SQL) --
#    "dois caminhos independentes", disciplina de D8.1.
python3 build_dataset.py --raw-dir ./raw --out-dir ./built
# -> 35.419 linhas: 34.496 reais + 30 classe (a) + 30 classe (b) + 863 classe (c)/nq

# 3a. Candidato 4 -- TimescaleDB (proxy: imagem oficial timescale/timescaledb:2.17.2-pg15,
#     Postgres 15.10 + extensão, sha256:d33b93c4... -- ver "Desvio do candidato real"
#     abaixo para o porquê da substituição).
docker run -d --name spike-ts -e POSTGRES_PASSWORD=spike -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=spike -p 15433:5432 timescale/timescaledb:2.17.2-pg15
psql -h 127.0.0.1 -p 15433 -U postgres -d spike -f schema.sql
psql -h 127.0.0.1 -p 15433 -U postgres -d spike \
  -c "\copy market_series FROM 'built/dataset.csv' WITH (FORMAT csv, HEADER true)"
psql -h 127.0.0.1 -p 15433 -U postgres -d spike \
  -c "SELECT compress_chunk(c) FROM show_chunks('market_series') c;"
psql -h 127.0.0.1 -p 15433 -U postgres -d spike -c "VACUUM ANALYZE market_series;"
psql -h 127.0.0.1 -p 15433 -U postgres -d spike -c "SELECT hypertable_size('market_series');"
# -> 909.312 bytes

python3 verify_timescale.py   # roda o backtest as_of + as 3 classes de fixture

# 3b. Candidato 5 -- Parquet particionado (symbol, fonte), zstd nível 19, local
#     (proxy do R2 -- ver "O que NÃO foi medido" abaixo).
python3 write_parquet.py
du -sb built/parquet_z19
# -> 1.200.986 bytes

python3 verify_duckdb.py     # mesma bateria, via DuckDB sobre os Parquet locais
```

## Resultado por critério (`D8.21` / `ADR-002`/D4)

| # | critério | candidato 4 (TimescaleDB) | candidato 5 (Parquet+DuckDB) |
|---|---|---|---|
| espaço ≤ 2× zipado | **909.312 B = 1,506×** ✅ `[MEDIDO 2026-09-04]` | **1.200.986 B = 1,989×** ✅, margem de 0,5% `[MEDIDO 2026-09-04]` — com zstd *default* (não nível 19) dá **1.244.234 B = 2,061× ❌**, sensível à configuração |
| backtest ≤ 60s | **0,048–0,092s** (5 execuções) ✅ | **0,011–0,022s** (local, SEM a rede do R2) ✅ parcial — ver abaixo |
| fixture 3 classes | **bit-idêntico à referência Python**, n=30+30+863 ✅ | **bit-idêntico**, mesmo n, após corrigir um bug do MEU carregador (`''` != `NULL`, ver `write_parquet.py`) ✅ |
| `free -m`/`df -h` medidos, cabe com folga | RSS do container: **153,8 MiB**; delta de disco: **~900 KB**. Contra 5.219 MB RAM livre / 75 GB disco livre da VPS (`T-08.1`/refs) → folga **>99,9%** ✅ | RSS do DuckDB: **~105 MiB** (pico, inclui o interpretador Python); **zero disco persistente na VPS por desenho** ✅ |
| latência de rede (só candidato 5) | N/A — sem hop de rede, mesmo host | **`[NÃO MEDIDO]`** — sem credencial R2 nem acesso SSH à VPS neste ambiente. Proxy informativo (NÃO é o critério): TLS handshake + TTFB ao domínio `r2.cloudflarestorage.com` a partir deste ambiente (Curitiba, não a VPS) — **64–107 ms**, 5 amostras `[MEDIDO 2026-09-04, ambiente ≠ VPS]` |

## Desvio do candidato real — e por que ele não invalida o número

`ADR-002` descreve o candidato 4 como "TimescaleDB na instância `postgres:15` **já de pé**"
— isto é, a extensão instalada dentro do container de produção existente. Este ambiente não
tem acesso a essa instância (nem rede, nem SSH), então usei a imagem oficial
`timescale/timescaledb:2.17.2-pg15`, que **é** Postgres 15.10 com a extensão TimescaleDB
pré-instalada — funcionalmente idêntica para o que os cinco critérios medem (espaço,
tempo de leitura, correção bitemporal), porque nenhum dos cinco depende de COMO a extensão
chegou lá. **O que este spike não testa:** o passo de migração "instalar a extensão dentro
de um container postgres:15 já rodando com dados" — isso é uma tarefa operacional de infra
(candidata a uma fase futura), não uma propriedade do motor.

## O que NÃO foi medido, e por quê

**Latência de rede real ao R2, do candidato 5.** Duas lacunas de acesso, não uma:

1. sem `.env`/credencial R2 neste checkout (`CLAUDE.md`: "Nenhuma chave em documento" — e não
   há sequer o arquivo, gitignored por máquina);
2. sem acesso SSH à VPS (São Paulo) — este ambiente roda em Curitiba/PR, ISP residencial
   (`curl -s ipinfo.io` deste ambiente: Curitiba, AS14868 LIGGA), **não** é a VPS.

O falsificador que `ADR-002` já nomeia para isto é `FA-2`: "latência de rede por consulta ao
R2 que multiplique o tempo da varredura sequencial por partição, estourando os 60s". Ele
continua sem resposta. A varredura local (candidato 5, sem rede) ficou em 0,01–0,02s contra
um teto de 60s — ou seja, há **~3.000× de headroom** antes de a rede virar o gargalo, mas
"há headroom" não é o mesmo que "medido": o layout particionado (5 arquivos aqui; dezenas a
centenas em produção com partição por dia) implica um GET HTTP por arquivo tocado, e
NENHUM desses GETs foi feito contra o bucket real.

**Recomendação registrada na emenda de `ADR-002`:** medir isto FROM A VPS, contra o bucket
real, antes de qualquer decisão de reverter candidato 4 → candidato 5.

## Ambiente

```
timescale/timescaledb:2.17.2-pg15  sha256:d33b93c43b9db7a065f660847d4390d4a84ea1dd72395258aa8873f314de58c7
duckdb 1.5.5 · pyarrow 25.0.1 · psycopg 3.3.5 · Python 3.13.13
curl -s ipinfo.io  ->  Curitiba, PR, BR, AS14868 LIGGA (este ambiente, NÃO a VPS)
```

## Correção de reprodutibilidade — ciclo 2 (QA `T-08.1`, `NEEDS_FIX`)

**Append, nada acima foi reescrito.** QA (`docs/context/plataforma-dados/gates/T-08.1-qa.md`)
reproduziu este passo a passo do zero e achou dois bugs no candidato 5 — não na decisão, no
**código que deveria produzir o número já documentado acima**:

1. `write_parquet.py` chamava `pq.write_to_dataset(..., compression="zstd")` **sem
   `compression_level`**. Rodado como estava commitado: `du -sb built/parquet` = 1.236.601 B
   → 2,048× o zipado da fonte — **reprova** o critério ≤2×, não o 1,989×/PASS documentado
   acima. Corrigido: `compression_level=19` explícito.
2. `OUT_DIR` do mesmo script era `"built/parquet"`, mas `verify_duckdb.py:13` e o passo `du
   -sb built/parquet_z19` deste README já usavam `built/parquet_z19` — seguido ao pé da
   letra, `verify_duckdb.py` quebrava (`IOException: No files found`). Corrigido alinhando
   `OUT_DIR = "built/parquet_z19"` (em vez de renomear os dois consumidores).

**Reexecutado de ponta a ponta com o fix, dado novo (refetch da Binance em 2026-09-04, não
o mesmo dado bit a bit do ciclo 1 — por isso os bytes variam no dígito menos significativo,
não a razão):**

```bash
python3 fetch_data.py --symbols BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT --days 30 --out-dir ./raw
# -> 8.624 linhas/símbolo × 4 = 34.496 linhas [MEDIDO 2026-09-04, ciclo 2]
tar -czf raw_source.tar.gz raw/*.csv && du -sb raw_source.tar.gz
# -> 603.709 B
python3 build_dataset.py --raw-dir ./raw --out-dir ./built
# -> 35.419 linhas (34.496 + 30 + 30 + 863)

# candidato 4 (TimescaleDB) -- mesmos comandos do passo 3a acima
# -> hypertable_size = 909.312 B (idêntico byte a byte ao ciclo 1) = 1,506×
python3 verify_timescale.py
# -> OVERALL: PASS, scan 0,0479s

python3 write_parquet.py && du -sb built/parquet_z19
# -> 1.200.765 B = 1,989× [MEDIDO 2026-09-04, ciclo 2] -- confirma o número da emenda
python3 verify_duckdb.py
# -> OVERALL: PASS, scan 0,0119s -- roda sem editar nada, GLOB e OUT_DIR já batem
```

**Confirmação do contraste com o default** (mesmo dataset, zstd sem `compression_level`):
`du -sb built/parquet_default` → 1.233.261 B = **2,043×** — reprova o critério ≤2×, mesma
direção do 2,061× já documentado acima (a diferença de 3ª casa decimal é o dado
re-fetchado, não o motor).

**Efeito na decisão:** nenhum. Os números da emenda de `ADR-002` (1,506× e 1,989×) são
**confirmados reais** por esta reexecução — o defeito estava só no script não reproduzir o
que já estava escrito, agora corrigido. `ADR-002` não foi tocado (`CLAUDE.md`: só se os
números mudassem valeria emenda nova). Gate completo:
`docs/context/plataforma-dados/gates/T-08.1-builder-ciclo2.md`.
