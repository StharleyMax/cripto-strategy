"""The declared `availability_probe_set` of `Q19` — symbols, endpoints, period, never invented."""

# `Q19` (`docs/decisoes-do-owner.md` §Q19), `RESPONDIDA` 2026-09-02. `[PREMISSA-OWNER: 2026-09-02]`,
# literal: "vamos inicar com btc/usdt, eth/usdt, link/usdt, sol/usdt" — four symbols, not the
# universe. `[DECISAO-OWNER: 2026-09-02, escolha entre alternativas apresentadas]`: 10 s on the 5
# Binance `/futures/data/*` endpoints, and the Coinalyze endpoints included in the SAME round
# (own, blind, 40 calls/min budget) — chosen from a menu this repository wrote, cost declared.
#
# `D3.3` (plano 03 item 3.4, `CA-F0-9`) is the falsifier this module enforces, and it is TWO
# separate rules, not one: (1) the sweep has to fit its bucket — `5 x S x (60/periodo) <= 200`
# for Binance; (2) `periodo >= 60s` REPROVA on ITS OWN, regardless of budget — 60 s is coarser
# than the already-measured lag dispersion (99,6-200,8 s, `docs/specs/PRD-001-plataforma-dados.md`
# §5.1) and a probe that coarse spends quota and answers nothing.
#
# ── THE 5 BINANCE ENDPOINTS ARE THE SAME FIVE, NAMED FROM THE OTHER SIDE ───────────────────────
#
# `domain/metrics_shift.py` already names this family from the `daily/metrics` DUMP's eight raw
# columns: `sum_open_interest[_value]` <- `openInterestHist`; `count_toptrader_long_short_ratio`
# <- `topLongShortAccountRatio` (by number of accounts); `sum_toptrader_long_short_ratio` <-
# `topLongShortPositionRatio` (by position size); `count_long_short_ratio` <-
# `globalLongShortAccountRatio` (all traders, by account); `sum_taker_long_short_vol_ratio` <-
# `takerlongshortRatio`. Reusing the SAME five REST endpoints here — rather than inventing a
# different set for the live probe — is what keeps a future comparison between the dump's
# `event_time` and this probe's `available_at` meaningful for the same underlying series.
#
# ── THE COINALYZE ENDPOINTS REUSE THE SAME TWO PATHS `CA-F0-13` ALREADY DECLARED ───────────────
#
# `domain/coinalyze_daily_series.py`'s `ENDPOINT_PATH_BY_KIND` already names
# `/v1/open-interest-history` and `/v1/liquidation-history` for `T-02.2`'s one-shot. This probe
# asks the SAME two paths, reused rather than re-declared — the wire shape a response comes back
# in does not depend on the `interval` query parameter, only the bucketing does (`infra/` builds
# that query string with a FINER interval than `daily`, because a `daily` bucket would not move
# inside a several-minute proof run and this task exists to OBSERVE a transition, not to wait a
# day for one — see `infra/availability_http_client.py`).

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Final

from src.modules.sentimento.domain.coinalyze_daily_series import SeriesKind
from src.modules.sentimento.domain.local_quota_broker import LocalQuotaBroker
from src.modules.sentimento.domain.quota_bucket import BINANCE_FUTURES_DATA, COINALYZE, QuotaBucket

# `[PREMISSA-OWNER: 2026-09-02]`, literal: "vamos inicar com btc/usdt, eth/usdt, link/usdt,
# sol/usdt". Four, not the whole universe — changing this is an owner act, not a code review.
AVAILABILITY_PROBE_SYMBOLS: Final[tuple[str, ...]] = ("BTCUSDT", "ETHUSDT", "LINKUSDT", "SOLUSDT")


class BinanceFuturesDataEndpoint(Enum):
    """The 5 endpoints of `/futures/data/*` this probe set covers — `D3.3`'s `5` is this count."""

    OPEN_INTEREST_HIST = "openInterestHist"
    TOP_LONG_SHORT_ACCOUNT_RATIO = "topLongShortAccountRatio"
    TOP_LONG_SHORT_POSITION_RATIO = "topLongShortPositionRatio"
    GLOBAL_LONG_SHORT_ACCOUNT_RATIO = "globalLongShortAccountRatio"
    TAKER_LONG_SHORT_RATIO = "takerlongshortRatio"


BINANCE_ENDPOINTS: Final[tuple[BinanceFuturesDataEndpoint, ...]] = tuple(BinanceFuturesDataEndpoint)
COINALYZE_ENDPOINTS: Final[tuple[SeriesKind, ...]] = (
    SeriesKind.OPEN_INTEREST,
    SeriesKind.LIQUIDATION,
)

# `[DOC: docs/decisoes-do-owner.md §Q19, docs/specs/PRD-001-plataforma-dados.md §4]` — `/futures/
# data/*` has its OWN bucket, `1000 req/5 min = 200 req/min`.
BINANCE_FUTURES_DATA_REQUESTS_PER_MINUTE: Final[float] = 200.0
# `[DOC: domain/quota_bucket.py COINALYZE.blindness_reason, docs/medicao-coinalyze.md §3.1]` —
# 40 calls/min per key, and the bucket is BLIND: the `200` carries no counter to confirm it.
COINALYZE_REQUESTS_PER_MINUTE: Final[float] = 40.0

# `D3.3`: at 60 s the probe's own resolution is COARSER than the dispersion it exists to
# resolve (99,6-200,8 s, measured n=2) — REPROVA regardless of how much budget is left over.
MAX_INFORMATIVE_PERIOD_SECONDS: Final[float] = 60.0


class InvalidProbeSetError(Exception):
    """A probe set that would not fit its declared bucket, or would probe too coarsely to inform."""


@dataclass(frozen=True)
class AvailabilityProbeSet:
    """The whole `availability_probe_set` of `Q19` — closed over what `D3.3` must be able to check.

    `binance_endpoints`/`coinalyze_endpoints` and the two buckets have defaults so a caller only
    ever has to name `symbols` and the two periods — the ones `Q19` actually decided between.
    """

    symbols: tuple[str, ...]
    binance_period_seconds: float
    coinalyze_period_seconds: float
    binance_endpoints: tuple[BinanceFuturesDataEndpoint, ...] = BINANCE_ENDPOINTS
    coinalyze_endpoints: tuple[SeriesKind, ...] = COINALYZE_ENDPOINTS
    binance_bucket: QuotaBucket = BINANCE_FUTURES_DATA
    coinalyze_bucket: QuotaBucket = COINALYZE

    def __post_init__(self) -> None:
        """Reject a set with no symbols/endpoints, a duplicate, or a period `D3.3` would refuse.

        Split into two helpers below rather than one long body: `mccabe` (`C90`,
        `backend/pyproject.toml`) caps a function at 10 branches, and the shape check (four
        "non-empty, no duplicate" tests) and the arithmetic check (`D3.3`'s own falsifier) are
        two different concerns that happen to both be validation.
        """
        _reject_empty_or_duplicate_targets(self)
        _reject_period_that_d33_would_refuse(self)

    @property
    def binance_calls_per_sweep(self) -> int:
        """Return how many Binance calls one full sweep (every endpoint x every symbol) costs."""
        return len(self.binance_endpoints) * len(self.symbols)

    @property
    def binance_requests_per_minute(self) -> float:
        """Return the Binance call rate `D3.3` checks: `5 x S x (60/periodo)`."""
        return self.binance_calls_per_sweep * (60.0 / self.binance_period_seconds)

    @property
    def binance_broker(self) -> LocalQuotaBroker:
        """Return the fixed-interval pace for one Binance sweep (`T-02.2`'s pattern, reused)."""
        return LocalQuotaBroker(
            calls_per_window=self.binance_calls_per_sweep,
            window_seconds=self.binance_period_seconds,
        )

    @property
    def coinalyze_calls_per_sweep(self) -> int:
        """Return how many Coinalyze calls one full sweep (every endpoint x every symbol) costs."""
        return len(self.coinalyze_endpoints) * len(self.symbols)

    @property
    def coinalyze_requests_per_minute(self) -> float:
        """Return the Coinalyze call rate against its own, blind, 40/min bucket."""
        return self.coinalyze_calls_per_sweep * (60.0 / self.coinalyze_period_seconds)

    @property
    def coinalyze_broker(self) -> LocalQuotaBroker:
        """Return the fixed-interval pace for one Coinalyze sweep — conservative, never a burst."""
        return LocalQuotaBroker(
            calls_per_window=self.coinalyze_calls_per_sweep,
            window_seconds=self.coinalyze_period_seconds,
        )

    @property
    def total_endpoint_count(self) -> int:
        """Return the endpoint count `D3.2` checks against `>= 5 endpoints`."""
        return len(self.binance_endpoints) + len(self.coinalyze_endpoints)


def _reject_empty_or_duplicate_targets(probe_set: AvailabilityProbeSet) -> None:
    """Reject a set with no symbols, no endpoints on either source, or a duplicate in any list."""
    if not probe_set.symbols:
        raise InvalidProbeSetError("nenhum simbolo declarado: um probe sem alvo nao mede nada")
    if len(set(probe_set.symbols)) != len(probe_set.symbols):
        raise InvalidProbeSetError(f"simbolos repetidos em {probe_set.symbols!r}")
    if not probe_set.binance_endpoints:
        raise InvalidProbeSetError("nenhum endpoint Binance declarado")
    if len(set(probe_set.binance_endpoints)) != len(probe_set.binance_endpoints):
        raise InvalidProbeSetError(
            f"endpoints Binance repetidos em {probe_set.binance_endpoints!r}"
        )
    if not probe_set.coinalyze_endpoints:
        raise InvalidProbeSetError("nenhum endpoint Coinalyze declarado")
    if len(set(probe_set.coinalyze_endpoints)) != len(probe_set.coinalyze_endpoints):
        raise InvalidProbeSetError(
            f"endpoints Coinalyze repetidos em {probe_set.coinalyze_endpoints!r}"
        )


def _reject_period_that_d33_would_refuse(probe_set: AvailabilityProbeSet) -> None:
    """Reject a non-positive period, a `>= 60s` Binance period, or a budget `D3.3` would refuse."""
    if probe_set.binance_period_seconds <= 0:
        raise InvalidProbeSetError(
            f"binance_period_seconds={probe_set.binance_period_seconds}: periodo nao positivo"
        )
    if probe_set.coinalyze_period_seconds <= 0:
        raise InvalidProbeSetError(
            f"coinalyze_period_seconds={probe_set.coinalyze_period_seconds}: periodo nao positivo"
        )
    if probe_set.binance_period_seconds >= MAX_INFORMATIVE_PERIOD_SECONDS:
        raise InvalidProbeSetError(
            f"binance_period_seconds={probe_set.binance_period_seconds} >= "
            f"{MAX_INFORMATIVE_PERIOD_SECONDS}: `D3.3` reprova — mais grosso que a dispersao "
            f"medida (99,6-200,8 s), custa cota e nao informa"
        )
    if probe_set.binance_requests_per_minute > BINANCE_FUTURES_DATA_REQUESTS_PER_MINUTE:
        raise InvalidProbeSetError(
            f"binance: {probe_set.binance_requests_per_minute:.1f} chamadas/min > "
            f"{BINANCE_FUTURES_DATA_REQUESTS_PER_MINUTE:.0f} do balde `/futures/data/*` — "
            f"`D3.3` reprova (5 x S x (60/periodo) <= 200)"
        )
    if probe_set.coinalyze_requests_per_minute > COINALYZE_REQUESTS_PER_MINUTE:
        raise InvalidProbeSetError(
            f"coinalyze: {probe_set.coinalyze_requests_per_minute:.1f} chamadas/min > "
            f"{COINALYZE_REQUESTS_PER_MINUTE:.0f} do balde cego da Coinalyze"
        )


# ── THE DECLARED INSTANCE, AND THE ARITHMETIC BEHIND EACH NUMBER ──────────────────────────────
#
# Binance: 5 endpoints x 4 symbols = 20 calls/sweep; at 10 s, 20 x (60/10) = 120 chamadas/min —
# 60% of the 200/min bucket, matching `docs/decisoes-do-owner.md` §Q19 exactly.
#
# Coinalyze: 2 endpoints x 4 symbols = 8 calls/sweep. `período >= 12 s` would already fit
# (8 x (60/12) = 40, the whole bucket) — 30 s is chosen INSTEAD, deliberately conservative
# rather than copying the Binance number: 8 x (60/30) = 16 chamadas/min, 40% of the 40/min
# blind bucket, leaving headroom a BLIND bucket cannot verify it has (`domain/quota_bucket.py`).
AVAILABILITY_PROBE_SET: Final[AvailabilityProbeSet] = AvailabilityProbeSet(
    symbols=AVAILABILITY_PROBE_SYMBOLS,
    binance_period_seconds=10.0,
    coinalyze_period_seconds=30.0,
)
