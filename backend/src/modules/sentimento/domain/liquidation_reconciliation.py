"""`T-03.11`: daily liquidation reconciliation, captured (`T-03.2`) vs Coinalyze (`T-02.2`)."""
#
# `SPEC-001`/plano `03` item 3.12, `CA-F0-14`. The handoff's own words are the requirement this
# module exists to satisfy, and they are quoted here because paraphrasing them once already cost
# this repository a defect (`CLAUDE.md`, "Nenhum número sem o comando que o produziu" corollary):
#
#   "não se sabe se a Coinalyze constrói o agregado dela a partir do MESMO stream subamostrado
#    que T-03.2 grava. Se sim, a razão tende a 1 e não prova nada; se não, a razão mede a perda
#    real de subamostragem. As DUAS saídas têm de informar em qual caso estamos — a reconciliação
#    tem de expor isso explicitamente no resultado (não é um número solto, é um número + a
#    interpretação de qual dos dois casos ele sugere), 'com a ressalva na tela' é literal no
#    título da task: mesmo sem tela ainda, o dado de saída tem de carregar o texto da ressalva
#    pronto para quando a tela existir."
#
# Three consequences follow directly from that paragraph, and each has a piece of code below:
#
#   1. `DailyLiquidationReconciliation` NEVER exposes a bare ratio — `hypothesis` rides next to
#      it on the SAME dataclass, so no call site can print the number without the label.
#   2. `RECONCILIATION_CAVEAT` is a fixed string, present on every result regardless of what the
#      ratio says — "a ressalva na tela" is not conditional on the outcome being interesting.
#   3. `classify_daily_reconciliation` always returns ONE of a closed set of verdicts, never an
#      unlabelled `Decimal` — the two cases the handoff names (`SAME_STREAM_INCONCLUSIVE`,
#      `INDEPENDENT_STREAM_MEASURES_LOSS`) plus two the handoff's binary framing does not name
#      but a real division still has to answer (`NO_LIQUIDATION_EITHER_SIDE`,
#      `CAPTURED_EXCEEDS_COINALYZE`) — see that function's docstring for why silently folding
#      the last two into the first two would be its own defect.
#
# ── WHY THIS MODULE PARSES `!forceOrder@arr` FOR THE FIRST TIME IN THIS CODEBASE ───────────────
#
# `force_order_envelope.py`'s whole point is "grava cru" — `ForceOrderEnvelope.raw` is stored
# untouched, and nothing in `T-03.1`/`T-03.2` ever opens it. This module is the first reader,
# and it reads exactly three fields (`s`, `S`, `l`) of the order sub-object, never `q` (the
# order's FULL declared size, repeated on every push for the same order as it fills) and never
# `z` (the RUNNING total, also repeated) — see `parse_force_order_message`'s docstring for the
# double-counting argument that rules those two out.

from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from enum import Enum
from typing import Final

from src.modules.sentimento.domain.coinalyze_daily_series import (
    DailyPoint,
    MalformedCoinalizeResponseError,
)

# `SPEC-001` §3.8 reserves pt-BR for UI-visible microcopy / operator-facing text (`CLAUDE.md`,
# tabela de fronteira, linha 8). This IS that text: the handoff is literal that it must "carregar
# o texto da ressalva pronto para quando a tela existir" — an operator will read this string on
# a screen this task does not build yet, which is exactly what the exception covers.
RECONCILIATION_CAVEAT: Final[str] = (
    "Nao se sabe se a Coinalyze constroi o agregado diario a partir do MESMO stream "
    "subamostrado que este coletor grava (!forceOrder@arr, rotulo de subamostragem "
    "NAO_RESOLVIDA latest|largest). Se sim, a razao tende a 1 e NAO PROVA NADA sobre a "
    "liquidacao real; se nao, a razao mede a perda real de subamostragem. Este resultado NAO "
    "decide qual dos dois casos vale — ele classifica com qual dos dois a razao MEDIDA hoje e "
    "consistente."
)


class MalformedForceOrderMessageError(Exception):
    """The raw `!forceOrder@arr` message text does not have the shape this module expects."""


class CoinalizeStreamHypothesis(Enum):
    """Which of the handoff's cases (plus the two it left unnamed) today's ratio is consistent with.

    `SAME_STREAM_INCONCLUSIVE` and `INDEPENDENT_STREAM_MEASURES_LOSS` are the handoff's own two
    cases, literal. `NO_LIQUIDATION_EITHER_SIDE` and `CAPTURED_EXCEEDS_COINALYZE` are NOT named
    by the handoff's binary framing, but `classify_daily_reconciliation` must still answer
    something for a day with zero liquidation on both sides (no ratio to speak of) and for a day
    where the capture sums to MORE than Coinalyze's published aggregate (a ratio neither of the
    two hypotheses predicts, and possibly a `unit`/`denom` mismatch —
    `docs/medicao-coinalyze.md` §2.3 measured 20 of 764 Binance perpetuals as `QUOTE_ASSET`-
    denominated on Coinalyze, a field this task does not capture). Folding either edge case
    silently into one of the handoff's two names would be the "número solto" defect the handoff
    warns against, just moved one layer down.
    """

    NO_LIQUIDATION_EITHER_SIDE = "no_liquidation_either_side"
    SAME_STREAM_INCONCLUSIVE = "same_stream_inconclusive"
    INDEPENDENT_STREAM_MEASURES_LOSS = "independent_stream_measures_loss"
    CAPTURED_EXCEEDS_COINALYZE = "captured_exceeds_coinalyze"


# The "tela diz qual" half of the handoff, ready to be read by an operator (row 8, pt-BR) —
# one short label per verdict, never a bare enum value.
HYPOTHESIS_SCREEN_LABEL: Final[dict[CoinalizeStreamHypothesis, str]] = {
    CoinalizeStreamHypothesis.NO_LIQUIDATION_EITHER_SIDE: (
        "Sem liquidacao capturada nem publicada neste dia — nada a reconciliar."
    ),
    CoinalizeStreamHypothesis.SAME_STREAM_INCONCLUSIVE: (
        "Razao proxima de 1: consistente com a Coinalyze usar o MESMO stream subamostrado — "
        "nao prova a liquidacao real."
    ),
    CoinalizeStreamHypothesis.INDEPENDENT_STREAM_MEASURES_LOSS: (
        "Razao abaixo de 1, fora da faixa: consistente com a Coinalyze medir de fonte "
        "INDEPENDENTE — a razao mede a perda real de subamostragem."
    ),
    CoinalizeStreamHypothesis.CAPTURED_EXCEEDS_COINALYZE: (
        "Capturado excede o agregado da Coinalyze — fora das duas hipoteses do handoff; "
        "investigar antes de confiar no numero (possivel denom BASE_ASSET/QUOTE_ASSET "
        "divergente, docs/medicao-coinalyze.md §2.3)."
    ),
}


@dataclass(frozen=True)
class CapturedLiquidationOrder:
    """One `!forceOrder@arr` order event, reduced to the three fields reconciliation needs.

    `last_filled_quantity` stays a raw string, same discipline as `cvd.CvdTrade.raw_quantity`
    and `qnq_divergence.QnqTrade.raw_q`: `Decimal` parsing happens once, at the point that sums
    it, never here.
    """

    symbol: str
    side: str
    last_filled_quantity: str
    transact_time_epoch_ms: int

    @property
    def day_utc(self) -> date:
        """UTC calendar date this order event falls on.

        Same `tz=UTC` discipline as `coinalyze_daily_series.DailyPoint.date_utc`:
        `datetime.fromtimestamp(..., tz=UTC)` reads no clock: it is a pure function of the
        millisecond this dataclass already carries, the same property that keeps
        `DailyPoint.date_utc` out of `backend/scripts/natureza.sh`'s scan (`ADR-016/D1`).
        """
        return datetime.fromtimestamp(self.transact_time_epoch_ms / 1000, tz=UTC).date()


def parse_force_order_message(raw: str) -> CapturedLiquidationOrder:
    """Parse one `!forceOrder@arr` raw text into the three fields reconciliation needs.

    Reads `l` (`LAST FILLED QUANTITY`, the Binance execution-report field name), never `q`
    (`ORIGINAL QUANTITY`) and never `z` (`CUMULATIVE FILLED QUANTITY`): `!forceOrder@arr` pushes
    at most ONE update per `{symbol, 1000 ms window}` — latest-or-largest,
    `force_order_envelope.SUBSAMPLING_SEMANTICS_LABEL` — so the SAME order can appear across more
    than one push as it fills across window boundaries. Summing `q` (repeated, unchanged, on
    every push for that order) or `z` (the running total, also repeated) would double-count;
    `l` is the increment THIS push reports, the same "increment, never a running total"
    discipline `cvd.cvd_delta_by_bucket` already applies to `aggTrade`.
    """
    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError) as failure:
        raise MalformedForceOrderMessageError(
            f"raw is not valid JSON: {type(failure).__name__}: {failure}"
        ) from failure
    if not isinstance(payload, dict) or "o" not in payload:
        shape = sorted(payload) if isinstance(payload, dict) else type(payload).__name__
        raise MalformedForceOrderMessageError(f"message missing 'o' field: {shape}")
    order = payload["o"]
    if not isinstance(order, dict):
        raise MalformedForceOrderMessageError(
            f"expected 'o' as an object, got {type(order).__name__}"
        )
    missing = [key for key in ("s", "S", "l", "T") if key not in order]
    if missing:
        raise MalformedForceOrderMessageError(f"'o' missing field(s) {missing}: {sorted(order)}")
    try:
        transact_time = int(order["T"])
    except (TypeError, ValueError) as failure:
        raise MalformedForceOrderMessageError(
            f"'o.T' is not an integer: {order['T']!r}"
        ) from failure
    return CapturedLiquidationOrder(
        symbol=str(order["s"]),
        side=str(order["S"]),
        last_filled_quantity=str(order["l"]),
        transact_time_epoch_ms=transact_time,
    )


def coinalyze_daily_liquidation_quantity(point: DailyPoint) -> Decimal:
    """Sum `l` (long liquidated) + `s` (short liquidated) from one Coinalyze `liquidation` point.

    `docs/medicao-coinalyze.md` §2.1: the provider's `daily` liquidation history returns
    `{t, l, s}`, and `T-03.11`'s DoD asks for a single `Σ(liquidação capturada)` against
    `o agregado daily`, not a per-side breakdown — `l + s` is the number this function returns.
    Reuses `MalformedCoinalizeResponseError` (`coinalyze_daily_series.py`) rather than a new
    exception type: a point missing `l`/`s`, or carrying a non-numeric one, is the same class of
    defect that module already names — "the provider's wire shape does not match what this
    reader expects" — and a second exception type for the same class would only make a caller's
    `except` clause miss one of them.
    """
    missing = [key for key in ("l", "s") if key not in point.raw]
    if missing:
        raise MalformedCoinalizeResponseError(
            f"liquidation point missing field(s) {missing}: {sorted(point.raw)}"
        )
    try:
        return Decimal(str(point.raw["l"])) + Decimal(str(point.raw["s"]))
    except InvalidOperation as failure:
        raise MalformedCoinalizeResponseError(
            f"'l'/'s' do not read as Decimal: l={point.raw['l']!r} s={point.raw['s']!r}"
        ) from failure


@dataclass(frozen=True)
class DailyLiquidationReconciliation:
    """The one row `T-03.11`'s DoD asks for: a number AND the case it is consistent with.

    `caveat` NEVER varies with `hypothesis` or `ratio` — it is the fixed text the handoff
    requires "pronto para quando a tela existir", independent of what today's ratio says.
    `screen_label` DOES vary — it is `HYPOTHESIS_SCREEN_LABEL[hypothesis]`, computed once here so
    two call sites can never disagree about which label a given `hypothesis` prints.
    """

    symbol: str
    day: str
    captured_quantity: Decimal
    coinalyze_quantity: Decimal
    ratio: Decimal | None
    hypothesis: CoinalizeStreamHypothesis
    caveat: str = RECONCILIATION_CAVEAT

    @property
    def screen_label(self) -> str:
        """Return the fixed, human-readable label for `hypothesis` — the "tela diz qual" half."""
        return HYPOTHESIS_SCREEN_LABEL[self.hypothesis]


def classify_daily_reconciliation(
    *,
    captured_quantity: Decimal,
    coinalyze_quantity: Decimal,
    near_one_lower_bound: Decimal,
    near_one_upper_bound: Decimal,
) -> tuple[Decimal | None, CoinalizeStreamHypothesis]:
    """Classify one `(captured, coinalyze)` pair into one of the four named verdicts, always.

    `near_one_lower_bound`/`near_one_upper_bound` have NO DEFAULT anywhere in this module — they
    are NOT a measured fact (`docs/medicao-conectividade-forceorder.md`: this observer has
    captured ZERO real `!forceOrder@arr` events as of 2026-09-01, so no distribution of real
    `(captured, coinalyze)` pairs exists yet to fit a tolerance to). Forcing every call site to
    name its own band, out loud, is the alternative to embedding an unmeasured number as if it
    were authoritative — the discipline `CLAUDE.md` calls "nenhum número sem o comando que o
    produziu" applied to a THRESHOLD instead of a measurement.

    The boundary is inclusive on both sides (`near_one_lower_bound <= ratio <=
    near_one_upper_bound` reads as `SAME_STREAM_INCONCLUSIVE`): a ratio sitting exactly on the
    line the caller drew is, by definition, still inside the band that caller declared
    "inconclusive" — `test_liquidation_reconciliation.py` pins both boundary values so a
    `>`/`>=` mutation at either edge is caught, not merely hoped against.
    """
    if captured_quantity < 0 or coinalyze_quantity < 0:
        raise ValueError(
            f"negative quantity is not a valid liquidation: captured={captured_quantity} "
            f"coinalyze={coinalyze_quantity}"
        )
    if not Decimal(0) < near_one_lower_bound <= Decimal(1) <= near_one_upper_bound:
        raise ValueError(
            f"invalid 'near 1' band: near_one_lower_bound={near_one_lower_bound} "
            f"near_one_upper_bound={near_one_upper_bound} (requires 0 < lower <= 1 <= upper)"
        )
    if coinalyze_quantity == 0 and captured_quantity == 0:
        return None, CoinalizeStreamHypothesis.NO_LIQUIDATION_EITHER_SIDE
    if coinalyze_quantity == 0:
        return None, CoinalizeStreamHypothesis.CAPTURED_EXCEEDS_COINALYZE
    ratio = captured_quantity / coinalyze_quantity
    if ratio > near_one_upper_bound:
        return ratio, CoinalizeStreamHypothesis.CAPTURED_EXCEEDS_COINALYZE
    if ratio < near_one_lower_bound:
        return ratio, CoinalizeStreamHypothesis.INDEPENDENT_STREAM_MEASURES_LOSS
    return ratio, CoinalizeStreamHypothesis.SAME_STREAM_INCONCLUSIVE


def reconcile_daily_liquidation(
    *,
    symbol: str,
    captured_orders: Sequence[CapturedLiquidationOrder],
    coinalyze_points: Sequence[DailyPoint],
    near_one_lower_bound: Decimal,
    near_one_upper_bound: Decimal,
) -> tuple[DailyLiquidationReconciliation, ...]:
    """Reconcile `symbol`, one row per Coinalyze `daily` point — Coinalyze's calendar drives it.

    Only days Coinalyze published a point for are reconciled: `T-03.11` spends "1 chamada/
    dia/símbolo" against the Coinalyze endpoint, so a day this call did not fetch (or Coinalyze
    never covered) has no authoritative "agregado daily" to compare against. Producing a row for
    it would either fabricate a Coinalyze zero this module never observed, or silently drop a
    captured day — both are the "nunca zero silencioso" defect `qnq_divergence.EmptyQnqGroupError`
    already refuses one division over, applied here to an absent point instead of an empty group.

    `captured_orders` NOT for `symbol` are ignored: `!forceOrder@arr` is whole-market
    (`force_order_envelope.py`), so filtering by symbol here — once — is what lets a caller pass
    the collector's raw stream through unfiltered instead of pre-filtering it per symbol.

    Raises if `coinalyze_points` names the same UTC day twice for `symbol`: the Coinalyze `daily`
    endpoint is contracted to return at most one point per day (`coinalyze_daily_series.py`), so
    two points landing on the same day is a defect in whatever produced `coinalyze_points`, not a
    case this function's arithmetic should silently absorb by summing or overwriting.
    """
    captured_totals: dict[str, Decimal] = {}
    for order in captured_orders:
        if order.symbol != symbol:
            continue
        day = order.day_utc.isoformat()
        try:
            quantity = Decimal(order.last_filled_quantity)
        except InvalidOperation as failure:
            raise MalformedForceOrderMessageError(
                f"{symbol}/{day}: last_filled_quantity {order.last_filled_quantity!r} does not "
                f"read as Decimal"
            ) from failure
        captured_totals[day] = captured_totals.get(day, Decimal(0)) + quantity

    results: list[DailyLiquidationReconciliation] = []
    seen_days: set[str] = set()
    for point in coinalyze_points:
        day = point.date_utc.isoformat()
        if day in seen_days:
            raise MalformedCoinalizeResponseError(
                f"{symbol}/{day}: more than one Coinalyze `daily` point for the same day"
            )
        seen_days.add(day)
        coinalyze_quantity = coinalyze_daily_liquidation_quantity(point)
        captured_quantity = captured_totals.get(day, Decimal(0))
        ratio, hypothesis = classify_daily_reconciliation(
            captured_quantity=captured_quantity,
            coinalyze_quantity=coinalyze_quantity,
            near_one_lower_bound=near_one_lower_bound,
            near_one_upper_bound=near_one_upper_bound,
        )
        results.append(
            DailyLiquidationReconciliation(
                symbol=symbol,
                day=day,
                captured_quantity=captured_quantity,
                coinalyze_quantity=coinalyze_quantity,
                ratio=ratio,
                hypothesis=hypothesis,
            )
        )
    return tuple(sorted(results, key=lambda row: row.day))


__all__ = (
    "RECONCILIATION_CAVEAT",
    "HYPOTHESIS_SCREEN_LABEL",
    "MalformedForceOrderMessageError",
    "CoinalizeStreamHypothesis",
    "CapturedLiquidationOrder",
    "DailyLiquidationReconciliation",
    "parse_force_order_message",
    "coinalyze_daily_liquidation_quantity",
    "classify_daily_reconciliation",
    "reconcile_daily_liquidation",
)
