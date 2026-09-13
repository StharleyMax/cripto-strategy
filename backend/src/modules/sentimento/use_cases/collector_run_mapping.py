"""Map one closed session or one completed cycle onto the `IngestRun` `Q3` fixes.

`gates/Q3-run-definition.md` (`SPEC-004` §3.3, `ADR-031/D3`) is what "one run" means for one
closed `!forceOrder@arr` SESSION or one completed `premiumIndex` CYCLE, and this module is where
that shape is built.

`ADR-016`: composing an `IngestRun` from already-observed values is NOT a capability — nothing
here touches a socket, a clock or a database. `infra/collectors_cli.py` is the composition root
that calls these builders at session/cycle/pass close and hands the result to `record_run` on
the store it wired; this module is the ONE place the 16-field shape is decided, so the
composition root and this module's own tests share exactly one construction, never two (the
defect `ADR-008/DoD-3` names for the read side, applied here to the WRITE side).

There are FIVE builders since `T-04.3` (`SPEC-007` phase `04`, which added the fifth to the
four `T-03.3` left): the `forceOrder` session, the `premiumIndex` cycle, the `/fapi/v1/klines`
pass, the `/futures/data/openInterestHist` pass and the
`/futures/data/globalLongShortAccountRatio` pass. `Q3` predates the last three and fixes only
the first two, so `build_klines_run`'s own docstring carries the argument for what "one run"
means for a producer that PAGES — the one shape `Q3` never had to answer — and both
`/futures/data/` builders inherit that argument rather than re-making it, differing from it in
exactly one measured respect: `weight_used`, which that endpoint family does not publish.

`gates/Q3-run-definition.md` §3 fixes the two sentinels below as PHYSICALLY IMPOSSIBLE values
for the quantity they stand in for, so neither can ever collide with something actually
measured: `CLOCK_SKEW_NOT_MEASURED_MS` is a skew no real clock is off by (24+ days); `-1` is a
REST weight no real response header ever carries (weight is always `>= 0`). Both are documented
by name rather than left as bare literals, matching `domain/ingest_record.py`'s own
`LOSS_WINDOW_NOT_COMPUTED_IN_F0` precedent for "a value, never absent, never a guess".

── `ADR-035/D2`: THE RUN IS OPENED HERE AND CLOSED BY THE WRITER ─────────────────────────

`n_written` was a bare `0` in both builders, and `0` was carrying two different meanings at
once: "the writer persisted nothing" and "nobody has counted yet". `100%` of `2.910` runs read
`0` while `md.series` held `23.512` rows `[MEDIDO 2026-09-10, DIAGNOSTICO.md]`, so in practice
it only ever meant the second. `N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS` names the one meaning the
collector can honestly express, and the value stays `0` ON PURPOSE — a negative sentinel would
be summed by `collector_status.uptime_percent` (`collector_status.py:119-121`) into a NEGATIVE
percentage on a route that is already served (`RS-1`). The distinction the number cannot make
is made by the writer's `writer_accounted_at` stamp instead
(`infra/postgres_ingest_record_store.py`, plan item 1.6).

`run_id` is now a PARAMETER, defaulting to a fresh `uuid4` so every existing caller is
unchanged. It is a parameter because `ADR-035/D2` needs the id to exist BEFORE the cycle's rows
are published — minting it at cycle CLOSE, as this module used to, makes it impossible for the
rows to carry the run they belong to, and the writer then has nothing to close. Which process
mints it and when is the composition root's decision (`infra/collectors_cli.py`), not this
module's: composing an `IngestRun` from already-observed values is not a capability (`ADR-016`),
and neither is choosing when a cycle begins.
"""

from __future__ import annotations

import hashlib
from typing import Final, Literal, get_args
from uuid import uuid4

from src.modules.sentimento.domain.ingest_record import IngestRun
from src.modules.sentimento.domain.premium_index_batch import PREMIUM_INDEX_ENDPOINT
from src.modules.sentimento.domain.provenance import UNKNOWN_OBSERVER_REGION
from src.modules.sentimento.use_cases.persist_ntp_skew_run import SOURCE

# ── Q3 §2.1 — THE LITERAL `endpoint` PER PRODUCER, DISTINCT BY CONSTRUCTION ────────────────
FORCE_ORDER_ENDPOINT: Final[str] = "!forceOrder@arr"

# The THIRD producer (`T-01.3`, `SPEC-007` phase `01`). The string is the REST path, matching
# `infra/binance_klines_client.KLINES_PATH` byte for byte — it is spelled again here instead of
# imported because `use_cases` may not import `infra` (the `layers` contract of
# `backend/pyproject.toml` `[tool.importlinter]`), and the drift that duplication risks is the
# one `test_collector_run_mapping.py::test_the_klines_endpoint_literal_matches_the_client_path`
# makes executable rather than trusted.
KLINES_ENDPOINT: Final[str] = "/fapi/v1/klines"

# The FOURTH producer (`T-03.3`, `SPEC-007` phase `03`, M2). Same duplication-with-a-test
# discipline `KLINES_ENDPOINT` above documents: the literal matches
# `infra/binance_oi_history_client.OPEN_INTEREST_HIST_PATH` byte for byte, and
# `test_collector_run_mapping.py::test_the_open_interest_endpoint_literal_matches_the_client_path`
# makes that executable instead of trusted, because `use_cases` may not import `infra`.
OPEN_INTEREST_HIST_ENDPOINT: Final[str] = "/futures/data/openInterestHist"

# The FIFTH producer (`T-04.3`, `SPEC-007` phase `04`, `ADR-036/D3`). Split in two constants
# because the infra client takes the endpoint NAME and composes the path from its own
# `FUTURES_DATA_PATH_PREFIX` — so the name below is the one thing crossing the layer boundary,
# and `test_collector_run_mapping.py::test_the_long_short_endpoint_literal_matches_the_client_path`
# makes the composition executable instead of trusted, the same way the klines line above does.
LONG_SHORT_DATA_ENDPOINT: Final[str] = "globalLongShortAccountRatio"
LONG_SHORT_ENDPOINT: Final[str] = f"/futures/data/{LONG_SHORT_DATA_ENDPOINT}"

# The SIXTH producer (`T-05.5`, `SPEC-007` phase `05`, M4, `ADR-036/D4`) — and the FIRST one
# that is not Binance. Same duplication-with-a-test discipline as the lines above: the literal
# matches `domain/liquidation_collection.LIQUIDATION_HISTORY_PATH`, and
# `test_collector_run_mapping.py::test_the_liquidation_endpoint_literal_matches_the_collection_path`
# makes the pairing executable.
LIQUIDATION_HISTORY_ENDPOINT: Final[str] = "/v1/liquidation-history"

# ⛔ AND `source` IS NOT `binance-futures` FOR THIS ONE. Every run in `md.ingest_run` today
# carries one single source — `[MEDIDO 2026-09-12, n=5.406 runs: uma unica source,
# `binance-futures`]` — because every producer until now WAS Binance. Recording a Coinalyze run
# under that source would put a third party's numbers under an exchange's name in the one table
# an operator consults to ask "where did this come from", and `ADR-030`'s dashboard groups by
# exactly this field. The provider is also already spelled `coinalyze` by
# `domain/quota_bucket.COINALYZE.identifier` and by `SeriesKey.provider`, so this literal joins
# a vocabulary rather than inventing one.
COINALYZE_SOURCE: Final[str] = "coinalyze"

# ── Q3 §3 — THE SENTINELS AND THE OBSERVER LITERALS, NONE OF THEM A GUESS ──────────────────
# The WS collector spends no REST weight — a FACT (`0`), never a guess.
FORCE_ORDER_WEIGHT_USED: Final[int] = 0
# Physically impossible for a real skew measurement (24+ days off), so it can never be confused
# with one; the production collectors do not measure skew per session/cycle (`Q3` §3).
CLOCK_SKEW_NOT_MEASURED_MS: Final[int] = -2_147_483_648
# A real REST weight is always `>= 0`, so `-1` can never collide with one (`Q3` §3).
WEIGHT_NOT_READABLE: Final[int] = -1
# `ADR-035/D2`. The collector OPENS the run; the writer that persists the rows CLOSES it. Zero
# is what the collector honestly knows at that moment — see the module docstring for why this
# is `0` and not a negative sentinel, and for what distinguishes it from "settled at zero".
N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS: Final[int] = 0
# Names the PRODUCTION collector, distinct from the diagnostic probes (`Q3` §3).
FORCE_ORDER_OBSERVER_ID: Final[str] = "forceorder-collector"
PREMIUM_INDEX_OBSERVER_ID: Final[str] = "premiumindex-collector"
KLINES_OBSERVER_ID: Final[str] = "klines-collector"
OPEN_INTEREST_OBSERVER_ID: Final[str] = "openinterest-collector"
LONG_SHORT_OBSERVER_ID: Final[str] = "longshort-collector"
LIQUIDATION_OBSERVER_ID: Final[str] = "liquidation-collector"

# ── `/futures/data/` ANSWERS WITH **NO** `x-mbx-*` HEADER AT ALL, AND THAT IS MEASURED ─────
#
# `KLINES_WEIGHT_PER_CALL` below exists because `/fapi/v1/klines` DOES publish
# `x-mbx-used-weight-1m`, so its per-call price could be read off a real sequence. The
# `/futures/data/` family publishes nothing of the kind:
# `[MEDIDO 2026-09-12: GET /futures/data/openInterestHist?symbol=BTCUSDT&period=5m -> HTTP 200
# com ZERO header casando `weight`/`used` (n=1 resposta, todos os headers inspecionados);
# 60 chamadas consecutivas sem pausa -> 60x HTTP 200, nenhum 429/418]`.
#
# So an open-interest run's `weight_used` is `WEIGHT_NOT_READABLE` — the sentinel that means
# exactly "the provider answered without a readable header on a call this collector had no
# other way to price". Deriving a number here (`1 * n_calls`, say) would be a weight with no
# command behind it, which is the one thing this module's own header forbids. There is
# deliberately NO `OPEN_INTEREST_WEIGHT_PER_CALL` constant to go with this paragraph: a
# constant is an answer, and this endpoint did not give one.

# `/fapi/v1/klines` costs weight 1 per call of up to 1500 candles — a FACT of this endpoint,
# like `FORCE_ORDER_WEIGHT_USED = 0` is a fact of a WebSocket, and not a guess:
# `[MEDIDO 2026-09-10: sequencia 31->32->33 do header `x-mbx-used-weight-1m` sobre tres
# chamadas consecutivas]`. So a klines run's `weight_used` is `KLINES_WEIGHT_PER_CALL *
# n_calls`, DERIVED from a measured constant and a counted quantity — never
# `WEIGHT_NOT_READABLE`, which stands for "the provider answered without a readable header on
# a call this collector had no other way to price".
KLINES_WEIGHT_PER_CALL: Final[int] = 1

# ── THE CLOSED SET, RESTATED AS A `Literal` FOR THE ONE CALLER THAT MANUFACTURES RUNS ──────
#
# `domain/ingest_record.KNOWN_VERDICTS` stays a runtime `frozenset` because `IngestRun` is the
# RAW record (`use_cases/ingest_health.py`'s own docstring: the refusal of an unknown verdict
# belongs on the SHARED READ path, never in the dataclass, so a dirtier future writer can still
# persist what it actually observed). This module is different: it is the ONE controlled
# construction site Q3 describes, fed only by this package's own two collector threads — so the
# three spellings are fixed at the TYPE level here, and `test_collector_run_mapping.py` pins
# that this tuple and `KNOWN_VERDICTS` never drift apart.
KnownVerdict = Literal["ACCEPTED", "ACCEPTED_WITH_WARNING", "REJECTED"]
KNOWN_VERDICT_LITERALS: Final[tuple[str, ...]] = get_args(KnownVerdict)


# ── `T-05.6` / `RF-6` / `RS-4`: A `REJECTED` RUN WITHOUT A REASON CANNOT BE BUILT ──────────
#
# `DoD 5` of plan `05`: "NENHUM veredito `REJECTED` com `api_code` E `notes` ambos nulos".
# The measurement that motivated it is not a projection — it is the state of the database:
#
#     select run_id, endpoint, verdict, coalesce(api_code::text,'NULL'), n_written, started_at
#       from md.ingest_run where verdict='REJECTED' order by started_at;
#     -> `[MEDIDO 2026-09-12, n=6 runs REJECTED]`: 6 of 6 with `api_code` NULL
#        (5 from `!forceOrder@arr`, 1 from `/fapi/v1/klines` at 2026-09-11T01:40Z)
#
# The entry handoff said "2 de 2". It had grown to 6 of 6 while the phase was being planned:
# the debt was GROWING, not sitting still — which is what a rule enforced by prose does.
#
# So the rule is enforced HERE, at the one controlled construction site `Q3` describes, and it
# is enforced by REFUSING TO BUILD rather than by reviewing. A run that reaches `record_run`
# already satisfies `RS-4` or it never existed. The falsifier is a mutation and it is executable:
# `test_collector_run_mapping.py::test_a_rejected_run_without_api_code_or_notes_is_refused`
# passes `verdict="REJECTED"` with both nulls to every builder and requires this error.
#
# ⚠️ WHY THIS RAISES INSTEAD OF FILLING IN A DEFAULT NOTE. A default ("rejected") would satisfy
# the DoD query and satisfy nothing else — it is `ADR-012`'s `rc=0` wearing a string: a reason
# column that always has a value and never has information. The caller knows why the run
# failed; this module does not, and it must not pretend to.
class RejectionWithoutReasonError(ValueError):
    """A `REJECTED` run was built with `api_code` and `notes` both `None` (`RF-6`, `RS-4`)."""


def require_rejection_reason(
    verdict: KnownVerdict, api_code: int | None, notes: str | None
) -> None:
    """Refuse a `REJECTED` run that names no reason — the ONE place `RS-4` is enforced.

    Silent on every other verdict: an `ACCEPTED` run normally has nothing to explain, and
    demanding prose there would manufacture text nobody wrote. The rule is about the PAIR,
    so EITHER field satisfies it — `api_code` when the provider refused and gave a number,
    `notes` when the run died on our side, where there IS no provider code and `NULL` is the
    honest value for `api_code`. That second case is precisely the one that produced `DEF-2`.
    """
    if verdict == "REJECTED" and api_code is None and notes is None:
        raise RejectionWithoutReasonError(
            "a REJECTED run must carry api_code or notes: a verdict without a reason is "
            "indistinguishable between 'it failed for X' and 'this collector never knew how "
            "to say why' (RF-6, RS-4, ADR-012)"
        )


def build_force_order_run(
    started_at: str,
    ended_at: str,
    n_published: int,
    verdict: KnownVerdict,
    digest: hashlib._Hash,
    endpoint: str = FORCE_ORDER_ENDPOINT,
    run_id: str | None = None,
    notes: str | None = None,
) -> IngestRun:
    """Build the `IngestRun` for one `forceOrder` SESSION close (`Q3` §1.1, §3).

    `n_expected = n_returned = n_published`: `Q3` §3 (c) — there is no independent oracle for
    how many liquidations SHOULD have arrived, so inventing one would be exactly the number
    without a command that produced it this repository refuses. `digest` is the SESSION's
    running `sha256`, updated by the caller with every raw message's bytes as it arrives
    (`Q3` §3: an incremental hash avoids holding hours of messages in memory just to hash them
    at close).

    `endpoint` defaults to `FORCE_ORDER_ENDPOINT` (`Q3` §2.1's literal, `"!forceOrder@arr"`) so
    every caller that predates the combined-stream switch keeps recording the SAME value without
    passing anything new. `docs/context/captura-em-producao/gates/forceorder-fix-qa.md` is why
    the parameter exists at all: the LIVE collector's real source moved to a per-symbol combined
    stream (`collectors_cli._default_force_order_source`), and `IngestRun.endpoint` — read by
    `collector_status.py`'s dashboard label (`ADR-030`) and by whoever diagnoses the next
    incident from this same log line — must name WHAT WAS ACTUALLY CONNECTED, never a literal
    baked in here regardless of the caller's real socket.

    `run_id` defaults to a fresh `uuid4` — the behaviour this function always had. A caller that
    opened the session with an id of its own (so the published rows could carry it, `ADR-035/D2`)
    passes that SAME id here, and the run the writer closes is then the run the collector opened.
    """
    require_rejection_reason(verdict, None, notes)
    return IngestRun(
        run_id=run_id if run_id is not None else str(uuid4()),
        source=SOURCE,
        endpoint=endpoint,
        window=f"{started_at}/{ended_at}",
        n_expected=n_published,
        n_returned=n_published,
        n_written=N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS,
        verdict=verdict,
        api_code=None,
        src_sha256=digest.hexdigest(),
        weight_used=FORCE_ORDER_WEIGHT_USED,
        observer_id=FORCE_ORDER_OBSERVER_ID,
        observer_region=UNKNOWN_OBSERVER_REGION,
        clock_skew_ms=CLOCK_SKEW_NOT_MEASURED_MS,
        started_at=started_at,
        ended_at=ended_at,
        notes=notes,
    )


def build_premium_index_run(
    started_at: str,
    ended_at: str,
    n_symbols: int,
    status: int | None,
    weight_used: int | None,
    verdict: KnownVerdict,
    src_sha256: str,
    run_id: str | None = None,
    notes: str | None = None,
) -> IngestRun:
    """Build the `IngestRun` for one `premiumIndex` poll CYCLE (`Q3` §1.2, §3).

    `weight_used=None` (the provider answered this specific poll without a readable
    `x-mbx-used-weight-1m`) becomes `WEIGHT_NOT_READABLE` rather than aborting the process —
    `Q3` §3 (i): a 24/7 collector cannot end the run over one missing metadata header on a poll
    that otherwise published successfully, unlike the one-shot probe `persist_ntp_skew_run.py`
    refuses for.

    `run_id` defaults to a fresh `uuid4` — the behaviour this function always had. A caller that
    opened the cycle with an id of its own (so the published rows could carry it, `ADR-035/D2`)
    passes that SAME id here, and the run the writer closes is then the run the collector opened.
    """
    require_rejection_reason(verdict, status, notes)
    return IngestRun(
        run_id=run_id if run_id is not None else str(uuid4()),
        source=SOURCE,
        endpoint=PREMIUM_INDEX_ENDPOINT,
        window=f"{started_at}/{ended_at}",
        n_expected=n_symbols,
        n_returned=n_symbols,
        n_written=N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS,
        verdict=verdict,
        api_code=status,
        src_sha256=src_sha256,
        weight_used=weight_used if weight_used is not None else WEIGHT_NOT_READABLE,
        observer_id=PREMIUM_INDEX_OBSERVER_ID,
        observer_region=UNKNOWN_OBSERVER_REGION,
        clock_skew_ms=CLOCK_SKEW_NOT_MEASURED_MS,
        started_at=started_at,
        ended_at=ended_at,
        notes=notes,
    )


def build_klines_run(
    *,
    started_at: str,
    ended_at: str,
    n_returned: int,
    n_calls: int,
    api_code: int | None,
    verdict: KnownVerdict,
    src_sha256: str,
    run_id: str | None = None,
    notes: str | None = None,
) -> IngestRun:
    """Build the `IngestRun` for one `/fapi/v1/klines` pass (`T-01.3`, `SPEC-007` phase `01`).

    A "pass" is one sweep over the configured symbol universe — the boot backfill is one such
    pass (many pages per symbol), and every periodic cycle after it is another. That is the
    SAME unit `Q3` §1.2 fixes for `premiumIndex` ("one poll CYCLE"), applied to a producer that
    happens to page: the run is the thing the operator schedules, not the HTTP call, and
    recording one run per page would multiply `/api/v1/ingest-health` by 1500-bar pages for no
    added fact — `n_calls` carries the paging, `weight_used` prices it.

    `n_expected = n_returned`, and it is the same refusal `build_force_order_run` documents:
    there is no independent oracle for how many bars the exchange SHOULD have had for a window
    (a symbol listed mid-window legitimately has fewer), so inventing `backfill_days * 1440`
    would be a number with no command behind it. The count of bars this collector actually
    PUBLISHED is smaller still — the in-progress bucket is cut (`RS-3.4`) — and that difference
    is deliberately NOT folded in here: `n_returned` is what the source returned, and the
    published count is the log line's `n_published`, so the size of the anti-lookahead cut stays
    readable instead of being silently absorbed into the run record.

    `weight_used` is `KLINES_WEIGHT_PER_CALL * n_calls` — see that constant for why this
    endpoint is the one case where a derived weight is a measurement and not a guess.

    `n_written` stays `N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS`: this collector OPENS the run and
    the single writer CLOSES it (`ADR-035/D2`), which is only possible because `run_id` is a
    parameter here and is minted at pass OPEN by the composition root.
    """
    require_rejection_reason(verdict, api_code, notes)
    return IngestRun(
        run_id=run_id if run_id is not None else str(uuid4()),
        source=SOURCE,
        endpoint=KLINES_ENDPOINT,
        window=f"{started_at}/{ended_at}",
        n_expected=n_returned,
        n_returned=n_returned,
        n_written=N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS,
        verdict=verdict,
        api_code=api_code,
        src_sha256=src_sha256,
        weight_used=KLINES_WEIGHT_PER_CALL * n_calls,
        observer_id=KLINES_OBSERVER_ID,
        observer_region=UNKNOWN_OBSERVER_REGION,
        clock_skew_ms=CLOCK_SKEW_NOT_MEASURED_MS,
        started_at=started_at,
        ended_at=ended_at,
        notes=notes,
    )


def build_open_interest_run(
    *,
    started_at: str,
    ended_at: str,
    n_returned: int,
    n_calls: int,
    api_code: int | None,
    verdict: KnownVerdict,
    src_sha256: str,
    run_id: str | None = None,
    notes: str | None = None,
) -> IngestRun:
    """Build the `IngestRun` for one `/futures/data/openInterestHist` pass (`T-03.3`, phase `03`).

    A "pass" is one sweep over the configured symbol universe — the boot backfill is one such
    pass (many pages per symbol, enumerated a priori by `domain/oi_history_paginator.py`), and
    every periodic cycle after it is another. That is the SAME unit `build_klines_run` already
    argues for, and the argument is not re-made here: the run is what the operator schedules,
    not the HTTP call, and `n_calls` is what carries the paging.

    `n_expected = n_returned`, the same refusal both builders above document: this endpoint
    retains ~30 days and publishes one point per 5-minute bucket, but a symbol listed
    mid-window legitimately has fewer, so `backfill_days * 288` would be an oracle nobody
    measured.

    `weight_used` is `WEIGHT_NOT_READABLE`, and unlike `build_premium_index_run`'s *fallback*
    use of that sentinel this is the ONLY value this endpoint can ever produce — see
    `OPEN_INTEREST_OBSERVER_ID`'s neighbouring comment for the measurement
    (`/futures/data/` answers with no `x-mbx-*` header at all).

    `n_written` stays `N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS`: this collector OPENS the run and
    the single writer CLOSES it (`ADR-035/D2`), which is only possible because `run_id` is a
    parameter here and is minted at pass OPEN by the composition root.
    """
    require_rejection_reason(verdict, api_code, notes)
    return IngestRun(
        run_id=run_id if run_id is not None else str(uuid4()),
        source=SOURCE,
        endpoint=OPEN_INTEREST_HIST_ENDPOINT,
        window=f"{started_at}/{ended_at}",
        n_expected=n_returned,
        n_returned=n_returned,
        n_written=N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS,
        verdict=verdict,
        api_code=api_code,
        src_sha256=src_sha256,
        weight_used=WEIGHT_NOT_READABLE,
        observer_id=OPEN_INTEREST_OBSERVER_ID,
        observer_region=UNKNOWN_OBSERVER_REGION,
        clock_skew_ms=CLOCK_SKEW_NOT_MEASURED_MS,
        started_at=started_at,
        ended_at=ended_at,
        notes=notes,
    )


def build_long_short_run(
    *,
    started_at: str,
    ended_at: str,
    n_returned: int,
    n_calls: int,
    api_code: int | None,
    verdict: KnownVerdict,
    src_sha256: str,
    run_id: str | None = None,
    notes: str | None = None,
) -> IngestRun:
    """Build the `IngestRun` for one `/futures/data/globalLongShortAccountRatio` pass (`T-04.3`).

    Same UNIT as `build_klines_run`: a pass is one sweep over the configured symbol universe, not
    one HTTP call — `n_calls` carries how many requests the sweep spent. `Q3` §1.2's reasoning is
    unchanged by the endpoint, so it is not re-argued here.

    `weight_used` is `WEIGHT_NOT_READABLE`, and that is a MEASUREMENT rather than a shrug:
    `/futures/data/*` answers `200` with ZERO `x-mbx-*` headers (`domain/clock_skew.py`,
    `T-03.7`), so this collector genuinely has no way to price its own calls. It is the exact
    case that sentinel's own comment reserves it for — deriving a number the way
    `KLINES_WEIGHT_PER_CALL` does would require a measured per-call weight, and this endpoint
    family publishes none to measure. It is the same fact `build_open_interest_run` above rests
    on, for the same endpoint FAMILY — measured once, in `OPEN_INTEREST_OBSERVER_ID`'s
    neighbouring comment, and not re-measured per endpoint.

    `n_expected = n_returned` for the reason `build_klines_run` already states: there is no
    independent oracle for how many buckets the exchange SHOULD have had for a window.

    `n_written` stays `N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS` — this collector OPENS the run and
    the single writer CLOSES it (`ADR-035/D2`), which is only possible because `run_id` is a
    parameter here and is minted at pass OPEN by the composition root.
    """
    require_rejection_reason(verdict, api_code, notes)
    return IngestRun(
        run_id=run_id if run_id is not None else str(uuid4()),
        source=SOURCE,
        endpoint=LONG_SHORT_ENDPOINT,
        window=f"{started_at}/{ended_at}",
        n_expected=n_returned,
        n_returned=n_returned,
        n_written=N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS,
        verdict=verdict,
        api_code=api_code,
        src_sha256=src_sha256,
        weight_used=WEIGHT_NOT_READABLE,
        observer_id=LONG_SHORT_OBSERVER_ID,
        observer_region=UNKNOWN_OBSERVER_REGION,
        clock_skew_ms=CLOCK_SKEW_NOT_MEASURED_MS,
        started_at=started_at,
        ended_at=ended_at,
        notes=notes,
    )


def build_liquidation_history_run(
    *,
    started_at: str,
    ended_at: str,
    n_returned: int,
    n_calls: int,
    api_code: int | None,
    verdict: KnownVerdict,
    src_sha256: str,
    run_id: str | None = None,
    notes: str | None = None,
) -> IngestRun:
    """Build the `IngestRun` for one Coinalyze `liquidation-history` CYCLE (`T-05.5`).

    Same UNIT as `build_klines_run`: one pass over the configured symbol universe, with
    `n_calls` carrying how many requests it spent. `Q3` §1.2's reasoning does not change with
    the provider, so it is not re-argued here.

    ── `weight_used = n_calls`, AND WHY THAT IS NOT `WEIGHT_NOT_READABLE` ─────────────────

    The sentinel means "the provider answered without a readable header on a call this
    collector had NO OTHER WAY to price", and that is not this endpoint's situation. Coinalyze
    publishes no header either (`quota_bucket.COINALYZE` is `BLIND`) — but its ceiling is
    denominated IN CALLS: 40 per sliding 60 s `[MEDIDO 2026-09-10, n=41 requisicoes: a 41a
    tomou 429]`. The price of one call is therefore one unit BY THE DEFINITION OF THE UNIT, not
    by a derivation, and the count is this collector's own (`SlidingQuotaWindow` keeps it,
    because a blind bucket leaves local counting as the only accounting there is).

    That is the same standard `KLINES_WEIGHT_PER_CALL` meets — a measured per-call price times
    a counted quantity — reached by a different route, and it is what lets `RNF-3`'s budget
    claim ("<= 5% do teto a N=10, cadencia 5 min") be checked against the record instead of
    against a log line.

    `n_expected = n_returned`: there is no oracle for how many buckets a SPARSE series should
    have had. Only 20,2% of 1-minute buckets carry any liquidation at all
    `[MEDIDO 2026-09-12, n=14.344 buckets possiveis, 2.900 preenchidos]`, so an "expected" count
    derived from the window width would declare a 79,8% shortfall on a perfectly healthy cycle —
    which is precisely the rate-shaped reasoning `T-05.7` exists to keep out of this series.

    `notes` is `RS-4`'s second reason field and it is REQUIRED whenever the verdict is
    `REJECTED` and no `api_code` came — `require_rejection_reason` enforces it rather than
    trusting the caller.
    """
    require_rejection_reason(verdict, api_code, notes)
    return IngestRun(
        run_id=run_id if run_id is not None else str(uuid4()),
        source=COINALYZE_SOURCE,
        endpoint=LIQUIDATION_HISTORY_ENDPOINT,
        window=f"{started_at}/{ended_at}",
        n_expected=n_returned,
        n_returned=n_returned,
        n_written=N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS,
        verdict=verdict,
        api_code=api_code,
        src_sha256=src_sha256,
        weight_used=n_calls,
        observer_id=LIQUIDATION_OBSERVER_ID,
        observer_region=UNKNOWN_OBSERVER_REGION,
        clock_skew_ms=CLOCK_SKEW_NOT_MEASURED_MS,
        started_at=started_at,
        ended_at=ended_at,
        notes=notes,
    )
