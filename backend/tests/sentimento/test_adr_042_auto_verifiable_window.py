"""`ADR-042`/falsifier 4 — a janela auto-verificável.

`docs/plans/.../05_historia_sob_demanda.md`, `DoD 0`: `BTCUSDT`,
`bucket_end ∈ (1789732800000, 1789747200000]`, sobre linhas REAIS de `md.series`, não sobre
fixture sintética.

⛔ ESTE É O FALSIFICADOR QUE FECHA `T-05.0`, NÃO UM EXTRA. A ADR é literal: "hoje ela falharia" —
`/series-history` com `knowledge_time_ms = server_now_ms` devolve `absence: {SEM_PONTO: 241}`
mesmo com as 240 linhas do backfill já no banco (`gates/T-01.5-dod6-medicao-e-achado-lookahead.md`).
Depois de `D1`, pelo menos uma delas tem de ser servida — **sem** que `R-1` tenha sido removida
(o item 4 do ADR marca isso como o modo de "resolver" que não conta: apagar a checagem em vez de
reoperar o operando).

Este arquivo lê o slice pelo MESMO mecanismo que `test_as_of_batch_differential.py` usa para o
falsificador `D2`/`D3` de `ADR-039`: `tests/helpers/data_fixtures.require_fixture`, pinado por
`md5`, `data/postgres/md_series_slice_adr042.jsonl` (catalogado em `data/MANIFEST.md`).

    [MEDIDO 2026-09-23, `deploy-postgres-1`, `BEGIN READ ONLY`, nenhuma semeadura]

    -- as 240 linhas do achado, agora com o preenchimento do catalogo em `Reduction.CLOSE`:
    SELECT count(DISTINCT bucket_end), count(*) FROM md.series
    WHERE symbol='BTCUSDT'
      AND series_key_id='6486750c2f9cced5b50231fc32a64fd40c47d3ff04b3e8610f986cd0f2a03b6f'
      AND bucket_end > 1789732800000 AND bucket_end <= 1789747200000;
    -- 240 | 313   (313: algumas buckets carregam mais de uma linha — revisao/reobservacao)

    -- exportado com:
    docker exec -i deploy-postgres-1 sh -c \
      'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -A -t -q -f -' <<'SQL' \
      > data/postgres/md_series_slice_adr042.jsonl
    BEGIN READ ONLY;
    SELECT row_to_json(t) FROM (
      SELECT series_key_id, symbol, source, bucket_end, event_time, available_at,
             availability_source, ingested_at, observed_at, provenance, src_label_raw,
             observer_id, observer_region, is_final, principal_id, value_raw
      FROM md.series
      WHERE symbol='BTCUSDT'
        AND series_key_id='6486750c2f9cced5b50231fc32a64fd40c47d3ff04b3e8610f986cd0f2a03b6f'
        AND bucket_end > 1789732800000 AND bucket_end <= 1789747200000
      ORDER BY series_key_id, bucket_end, observed_at, source, ingested_at
    ) t;
    SQL
    -- 313 linhas, md5 e2939317085fca21ff2c5dc4f5584884
"""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Final

import pytest

from src.modules.sentimento.domain.as_of_accessor import (
    BarPolicy,
    DecisionReadRefusedError,
    Observation,
    ReadPurpose,
    SeriesReadPolicy,
    as_of,
    as_of_batch,
)
from src.modules.sentimento.domain.klines_ohlc_catalog import build_klines_ohlc_entry
from src.modules.sentimento.domain.provenance import AvailabilitySource, Provenance, SeriesRow
from src.modules.sentimento.domain.series_key import Reduction, SeriesKey
from tests.helpers.data_fixtures import require_fixture

_FIXTURE: Final = "postgres/md_series_slice_adr042.jsonl"
_FIXTURE_MD5: Final = "e2939317085fca21ff2c5dc4f5584884"

_SYMBOL: Final = "BTCUSDT"
_WINDOW_START_EXCLUSIVE: Final = 1_789_732_800_000
_WINDOW_END_INCLUSIVE: Final = 1_789_747_200_000
_SERIES_KEY_ID: Final = "6486750c2f9cced5b50231fc32a64fd40c47d3ff04b3e8610f986cd0f2a03b6f"
_CLOSE_VERIFIED_BY: Final = "test_klines_ohlc_catalog.py"


def _observations() -> tuple[Observation, ...]:
    """Parse the pinned real slice.

    By KEYWORD — never by attribute read (same discipline as
    `test_as_of_batch_differential.py`'s `_observations`).
    """
    path = require_fixture(_FIXTURE, expected_md5=_FIXTURE_MD5)
    parsed = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        record = json.loads(line)
        row = SeriesRow(
            series_key_id=record["series_key_id"],
            symbol=record["symbol"],
            source=record["source"],
            bucket_end=record["bucket_end"],
            event_time=record["event_time"],
            available_at=record["available_at"],
            availability_source=AvailabilitySource(record["availability_source"]),
            ingested_at=record["ingested_at"],
            observed_at=record["observed_at"],
            provenance=Provenance(record["provenance"]),
            src_label_raw=record["src_label_raw"],
            observer_id=record["observer_id"],
            observer_region=record["observer_region"],
            is_final=record["is_final"],
            value_raw=record["value_raw"],
            principal_id=record["principal_id"],
        )
        parsed.append(Observation(row=row, value=Decimal(row.value_raw)))
    return tuple(parsed)


def _close_case() -> tuple[SeriesKey, SeriesReadPolicy]:
    """Return the `klines_ohlc`/`CLOSE` catalog row this window's `series_key_id` names.

    Imported from the production builder (`build_klines_ohlc_entry`), not re-spelled: a second
    spelling of the fifteen-term identity is exactly how a fixture test stops being about the
    rows it claims to be about (`ADR-039`'s differential file makes the same argument for
    `_funding_estimado_key`).
    """
    entry = build_klines_ohlc_entry(
        Reduction.CLOSE, instrument_id=_SYMBOL, verified_by=_CLOSE_VERIFIED_BY
    )
    assert entry.key.series_key_id() == _SERIES_KEY_ID, (
        "the catalog builder stopped producing the id this window's rows are stored under — "
        "the fixture would silently compare against an empty universe"
    )
    policy = SeriesReadPolicy(
        asof_max_staleness_ms=entry.max_staleness_ms,
        render_max_staleness_ms=entry.max_staleness_ms,
        bucket_interval_ms=entry.native_grid_ms,
        first_capture_at=None,
    )
    return entry.key, policy


# ── THE UNIVERSE, ASSERTED BEFORE ANYTHING IS COMPARED OVER IT ─────────────────────────────


def test_the_window_holds_the_240_backfilled_buckets_the_finding_measured() -> None:
    """Pin the slice: `240` distinct `bucket_end`, `313` rows (some buckets carry a revision)."""
    observations = _observations()
    bucket_ends = {o.row.bucket_end for o in observations}
    assert len(observations) == 313, len(observations)
    assert len(bucket_ends) == 240, len(bucket_ends)
    assert min(bucket_ends) > _WINDOW_START_EXCLUSIVE
    assert max(bucket_ends) <= _WINDOW_END_INCLUSIVE

    lag_ms = [o.row.available_at - o.row.bucket_end for o in observations]
    assert min(lag_ms) > 100_000_000, (
        f"the slice stopped carrying the achado's publication lag (min {min(lag_ms)} ms) — "
        f"a slice with a small lag would not exercise `D1` at all: `available_at <= t` would "
        f"already admit these rows under the PRE-`ADR-042` rule too"
    )


# ── FALSIFIER 4, FIRST HALF: BEFORE `D1`'S WIDENING, THE WINDOW IS FULLY ABSENT ─────────────


def test_with_knowledge_time_equal_t_the_whole_window_is_still_sem_ponto() -> None:
    """`D2`'s own case (`K = t`) reproduces exactly what the achado measured: zero servidas.

    This is the "ANTES" side of falsifier 4 — the ADR's own literal claim that `/series-history`
    "hoje... devolveria `absence: {SEM_PONTO: 241}`". `K = t` is what a caller gets by NOT
    adopting `ADR-042` (`D2`'s equivalence), so this pins that the pre-`ADR-042` shape survives
    unless the caller opts into the wider horizon.
    """
    key, policy = _close_case()
    observations = _observations()
    instants = sorted({o.row.bucket_end for o in observations})
    readings = as_of_batch(
        series=key,
        symbol=_SYMBOL,
        instants=tuple(instants),
        observations=observations,
        policy=policy,
        bar_policy=BarPolicy.FINAL_ONLY,
        purpose=ReadPurpose.RENDERING,
        knowledge_time=instants[-1],  # a SINGLE call needs one K; the tightest legitimate one
    )
    # `knowledge_time = instants[-1]` still admits nothing: every row's `available_at` is
    # `> 100_000_000 ms` past its OWN `bucket_end`, and `instants[-1]` is only `~14_340_000 ms`
    # (240 minutes) past `instants[0]` — nowhere near enough to reach any row's `available_at`.
    served = [r for r in readings if r.value is not None]
    assert served == [], (
        f"{len(served)} row(s) served under a horizon that never reaches this backfill's lag"
    )


# ── FALSIFIER 4, SECOND HALF: THE ADR'S OWN CLAIM — `>= 1` SERVED, `R-1` STILL STANDING ────


def test_after_adr_042_rendering_serves_the_backfill_without_removing_r1() -> None:
    """`>= 1` das `240` linhas passa a ser servida sob `RENDERING`, e `R-1` continua de pé.

    Um horizonte que alcança o backfill serve as linhas sob `RENDERING` — E a MESMA chamada, sob
    `ENTRY_CONDITION`, continua recusando.

    `knowledge_time` aqui é `max(available_at) + 1` — o menor valor que ainda alcança TODA a
    janela, escolhido a partir dos próprios dados (não de um relógio real, que `domain` não lê,
    `pyproject.toml`, contrato "Natureza"). Não é um valor mágico: é literalmente "logo depois
    que a última linha do backfill chegou ao nosso armazém", que é a pergunta `RENDERING` faz.
    """
    key, policy = _close_case()
    observations = _observations()
    instants = sorted({o.row.bucket_end for o in observations})
    knowledge_time = max(o.row.available_at for o in observations) + 1

    readings = as_of_batch(
        series=key,
        symbol=_SYMBOL,
        instants=tuple(instants),
        observations=observations,
        policy=policy,
        bar_policy=BarPolicy.FINAL_ONLY,
        purpose=ReadPurpose.RENDERING,
        knowledge_time=knowledge_time,
    )
    served = [r for r in readings if r.value is not None]
    assert len(served) >= 1, (
        "`ADR-042`/falsifier 4: zero of the 240 backfilled buckets were served under a horizon "
        "that reaches their `available_at` — `D1` did not widen R-1 as decided"
    )
    # `[MEDIDO]`: every one of the 240 buckets is admissible under this horizon (their `age_ms`
    # at their OWN `bucket_end` is `0`, well inside the `120_000 ms` staleness `_close_case` — a
    # backfilled bucket read AT its own instant is never late) — reported, not just asserted
    # `>= 1`, so a regression that serves only some of them is visible in the failure diff.
    assert len(served) == 240, (
        f"expected all 240 buckets servable at their own instant, got {len(served)}"
    )

    # ⛔ `R-1` STILL STANDS: the SAME window, `ENTRY_CONDITION`, `knowledge_time` past `t` for
    # the FIRST instant — `ADR-042`/`D3` refuses. If this raised nothing, "serving the backfill"
    # would have been achieved by DELETING R-1 instead of re-operating it — the exact failure
    # mode falsifier 4 names.
    with pytest.raises(DecisionReadRefusedError):
        as_of(
            series=key,
            symbol=_SYMBOL,
            t=instants[0],
            observations=observations,
            policy=policy,
            bar_policy=BarPolicy.FINAL_ONLY,
            purpose=ReadPurpose.ENTRY_CONDITION,
            knowledge_time=knowledge_time,
        )
