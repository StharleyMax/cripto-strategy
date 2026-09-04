#!/usr/bin/env python3
"""Write the same dataset.csv (candidate 4's input) as partitioned Parquet
(candidate 5), so the two candidates are compared on the byte-identical dataset.
Partition layout: symbol=<symbol>/fonte=<fonte>/part.parquet -- one file per
(symbol, fonte), mirroring how an R2 object-store layout would be organized for
selective partition pruning by DuckDB httpfs.
"""
import csv
import os

import pyarrow as pa
import pyarrow.csv as pa_csv
import pyarrow.parquet as pq

IN_CSV = "built/dataset.csv"
# "_z19" no nome do diretorio nao e cosmetico: e o que distingue este build (zstd
# nivel 19, explicito) do que o zstd *default* produziria (ver README, linha do
# criterio de espaco) -- QA T-08.1 ciclo 1 achou os dois em desacordo: o parametro
# compression_level estava ausente aqui e o GLOB de verify_duckdb.py ja apontava
# para "_z19", entao o pipeline quebrava na etapa 3b se seguido ao pe da letra.
OUT_DIR = "built/parquet_z19"


def main():
    # pyarrow's CSV reader auto-infers ISO8601 timestamp[s, tz=UTC] and bool columns
    # correctly from this file's shape -- verified: event_time/bucket_end/available_at/
    # observed_at come back as timestamp[s, tz=UTC], is_final as bool, no cast needed.
    # poison_class needs an explicit null_values=[''] -- unlike Postgres COPY (CSV
    # format defaults its null string to '', so psql's \copy auto-NULLs the empty
    # field), pyarrow's CSV reader keeps an unquoted empty field as literal '' unless
    # told otherwise. Caught by TEST A returning 0 rows instead of 30 on first run.
    table = pa_csv.read_csv(
        IN_CSV,
        convert_options=pa_csv.ConvertOptions(null_values=[""], strings_can_be_null=True),
    )

    os.makedirs(OUT_DIR, exist_ok=True)
    pq.write_to_dataset(
        table,
        root_path=OUT_DIR,
        partition_cols=["symbol", "fonte"],
        compression="zstd",
        compression_level=19,
    )
    print(f"rows written: {table.num_rows}")


if __name__ == "__main__":
    main()
