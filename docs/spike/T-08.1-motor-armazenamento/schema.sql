-- Candidate 4 (ADR-002/D4): TimescaleDB extension in a postgres:15 instance.
--
-- chunk_time_interval=45 days (effectively one chunk for this 30d window) and
-- compress_segmentby='symbol,fonte' were chosen AFTER measuring: the first pass used
-- the more conventional chunk_time_interval=1 day (31 tiny chunks, segmentby symbol
-- only) and the compressed footprint came out ~4.8x the source instead of ~1.5x --
-- columnar compression needs enough rows per (chunk, segment) to amortize its
-- per-segment overhead, and at this spike's small scale (35k rows) 31 chunks starve
-- it. See docs/adr/ADR-002-motor-de-armazenamento.md, "Emenda T-08.1" for the numbers.
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE market_series (
    event_time              timestamptz NOT NULL,
    symbol                   text        NOT NULL,
    sum_open_interest        double precision,
    sum_open_interest_value  double precision,
    bucket_end               timestamptz NOT NULL,
    available_at             timestamptz NOT NULL,
    observed_at              timestamptz NOT NULL,
    is_final                 boolean     NOT NULL,
    fonte                    text        NOT NULL,
    poison_class             text
);

SELECT create_hypertable('market_series', 'event_time', chunk_time_interval => interval '45 days');
ALTER TABLE market_series SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'symbol,fonte',
    timescaledb.compress_orderby = 'event_time'
);

-- \copy market_series FROM 'built/dataset.csv' WITH (FORMAT csv, HEADER true);
-- SELECT compress_chunk(c) FROM show_chunks('market_series') c;
-- (compress AFTER load: compress_chunk on an empty hypertable has nothing to compress)

CREATE INDEX ix_ms_sym_avail ON market_series (symbol, available_at);
CREATE INDEX ix_ms_fonte ON market_series (symbol, fonte, event_time);
