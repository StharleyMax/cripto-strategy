"""Survivorship at the ingestion edge: a symbol absent from the CURRENT universe never rejects."""

# `SPEC-001` §5.6, `CA-F3-14`, `T-07.2` (`CST-56`). Literal contract, from the SPEC:
#
#   simbolo ausente do exchangeInfo CORRENTE
#      ->  verdict = 'ACCEPTED_WITH_WARNING'  +  linha em md.ingest_gap
#      ->  NUNCA 'REJECTED', NUNCA zero linhas gravadas
#
# `[DOC: SPEC-001 §5.6]`: **109 símbolos históricos são invisíveis hoje** — 21,6% do universo
# cripto-perp com histórico não existe mais no `exchangeInfo` corrente (727 -> 570). Rejeitar
# esses símbolos na borda de ingestão apagaria 21,6% do histórico já capturado, silenciosamente.
# That number is measured elsewhere (the S3 listing x `exchangeInfo` diff is not this module's
# job to reproduce); what THIS module owns is the DECISION, exercised below against the real
# `exchangeInfo` capture already cataloged for `T-02.1` (`data/binance/rest/ei.json`), where
# `MATICUSDT` is a genuine, measured absence (`test_instrument_universe_snapshot.py`, `D2.3`).
#
# ── THE BOUNDARY THAT DOES NOT GENERALIZE, AND WHY IT IS A SEPARATE TYPE ───────────────────
#
# `oi_history_paginator.classify_page` has its OWN `Verdict = Literal["ACCEPTED", "REJECTED"]`,
# because `api_code == -1130` (end of history, `D7.1`) and a point outside the requested window
# (`D7.3`/`D7.4`) are both real reasons to reject. `SPEC-001` §5.6 is explicit that this second
# question — "is this symbol known to the CURRENT universe?" — is NOT the same axis, and reading
# `CA-F3-1` without `CA-F3-14` is exactly the mistake that plants survivorship: generalizing
# "unknown or stale input rejects" to "unknown SYMBOL rejects". `SurvivorshipVerdict` below has
# no `REJECTED` member at all — not a convention this module remembers to honor, but a shape
# `classify_symbol_survivorship` cannot return outside of, the same technique `ClosedWindow`
# uses to make the `D7.3` call unrepresentable.
#
# ── DOMAIN, NOT infra/use_cases (`ADR-016`, `Natureza`) ─────────────────────────────────────
#
# No socket, no clock, no file. "The current universe" arrives as a `frozenset[str]` the
# caller already produced with `instrument_universe_snapshot.exchange_info_symbols` — this
# module does not read a second representation of `exchangeInfo`, it consumes the one that
# already exists (the handoff's explicit instruction: reuse `T-02.1`'s vocabulary).

from __future__ import annotations

from dataclasses import dataclass
from typing import Final, Literal

from src.modules.sentimento.domain.ingest_record import IngestGap

SurvivorshipVerdict = Literal["ACCEPTED", "ACCEPTED_WITH_WARNING"]

# Spelled identically to the strings `domain.ingest_record` already fixes
# (`VERDICTS_SPELLED_IN_THE_SPEC`, `KNOWN_VERDICTS`) — this module does not invent a second
# vocabulary for the same two words; `test_dump_survivorship.py` pins the two modules agree.
ACCEPTED: Final[SurvivorshipVerdict] = "ACCEPTED"
ACCEPTED_WITH_WARNING: Final[SurvivorshipVerdict] = "ACCEPTED_WITH_WARNING"

REASON_ABSENT_FROM_CURRENT_EXCHANGE_INFO: Final[str] = "absent_from_current_exchange_info"

# `md.ingest_gap.class` "has no enum of its own yet" (`infra/metrics_csv_reader.py`,
# `SOURCE_GAP_CLASS`) — this is the SECOND member of that still-open enumeration, and it names
# a different kind of absence on purpose: `SOURCE_GAP` is a hole INSIDE a series (the upstream
# dump itself is short, `n_missing > 0`); `SURVIVORSHIP_WARNING` is not a hole in the data at
# all (the whole window WAS captured, `n_missing == 0`) — it records that the symbol carrying
# that data is not one the CURRENT universe recognizes. Collapsing the two under one class
# would erase exactly the distinction `md.ingest_gap` exists to keep auditable.
SURVIVORSHIP_GAP_CLASS: Final[str] = "SURVIVORSHIP_WARNING"


@dataclass(frozen=True)
class SurvivorshipDecision:
    """The verdict `classify_symbol_survivorship` reached, and why — never a rejection."""

    verdict: SurvivorshipVerdict
    reason: str | None


def classify_symbol_survivorship(
    symbol: str, current_exchange_info_symbols: frozenset[str]
) -> SurvivorshipDecision:
    """Classify one symbol against the CURRENT `exchangeInfo` universe — `SPEC-001` §5.6.

    `symbol in current_exchange_info_symbols` -> `ACCEPTED`, no warning: the ordinary case,
    where the historical dump names a symbol the exchange still lists today.

    Absent -> `ACCEPTED_WITH_WARNING`, `REASON_ABSENT_FROM_CURRENT_EXCHANGE_INFO`. This is the
    ONLY outcome for an absent symbol; there is no branch here that can produce `REJECTED`,
    because `SurvivorshipVerdict` does not have that member.
    """
    if symbol in current_exchange_info_symbols:
        return SurvivorshipDecision(verdict=ACCEPTED, reason=None)
    return SurvivorshipDecision(
        verdict=ACCEPTED_WITH_WARNING, reason=REASON_ABSENT_FROM_CURRENT_EXCHANGE_INFO
    )


def build_survivorship_gap(
    symbol: str,
    *,
    source: str,
    series_key_id: str,
    window_from_ts: str,
    window_to_ts: str,
    detected_at: str,
) -> IngestGap:
    """Build the `md.ingest_gap` row `SPEC-001` §5.6 requires alongside the warning verdict.

    `window_from_ts`/`window_to_ts`/`detected_at` arrive ALREADY FORMATTED (ISO, `...Z`) — this
    module reads no clock (`Natureza`) — and are the window of the dump that was accepted, not
    a range of missing timestamps: `n_missing=0` is deliberate, the same way
    `InstrumentUniverseSnapshot.captured_on` is a supplied string rather than a read one.
    """
    return IngestGap(
        source=source,
        symbol=symbol,
        series_key_id=series_key_id,
        from_ts=window_from_ts,
        to_ts=window_to_ts,
        n_missing=0,
        gap_class=SURVIVORSHIP_GAP_CLASS,
        detected_at=detected_at,
    )
