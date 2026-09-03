"""`fee_schedule(venue, market, tier, maker_bps, taker_bps, effective_from, evidence_url)`.

Plan `06` item 6.8, `CA-F2-14`, `D6.13`. The central falsifier this file runs: resolving a rate
for a date the schedule does not cover REFUSES — it never returns a most-recent entry, a zero,
or any other silent default (`test_resolve_refuses_when_no_entry_covers_the_date` below).
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from src.modules.sentimento.domain.fee_schedule import (
    EXCHANGE_INFO_LIQUIDATION_FEE_FIELD,
    FEE_SCHEDULE_COLUMNS,
    DuplicateFeeScheduleEntryError,
    FeeScheduleEntry,
    MalformedFeeScheduleEntryError,
    MissingFeeEvidenceUrlError,
    NoFeeScheduleAsOfError,
    build_fee_schedule_catalog,
)


def _entry(**overrides: object) -> FeeScheduleEntry:
    fields: dict[str, object] = {
        "venue": "binance",
        "market": "usdm_futures",
        "tier": "VIP0",
        "maker_bps": Decimal("2.0"),
        "taker_bps": Decimal("5.0"),
        "effective_from": date(2026, 1, 1),
        "evidence_url": "https://www.binance.com/en/fee/futureFee",
    }
    fields.update(overrides)
    return FeeScheduleEntry(**fields)  # type: ignore[arg-type]


# ── shape ─────────────────────────────────────────────────────────────────────────────────


def test_fee_schedule_columns_match_spec_001_section_3_4() -> None:
    """The exact 7 columns `SPEC-001` §3.4 declares, in the order it declares them."""
    assert FEE_SCHEDULE_COLUMNS == (
        "venue",
        "market",
        "tier",
        "maker_bps",
        "taker_bps",
        "effective_from",
        "evidence_url",
    )


def test_exchange_info_liquidation_fee_is_a_named_distinct_field() -> None:
    """`liquidationFee` is `exchangeInfo`'s only fee-shaped field — not a `fee_schedule` input."""
    assert EXCHANGE_INFO_LIQUIDATION_FEE_FIELD == "liquidationFee"


@pytest.mark.parametrize("blank_field", ["venue", "market", "tier"])
def test_refuses_a_blank_identity_field(blank_field: str) -> None:
    """`venue`/`market`/`tier` blank is refused by name."""
    with pytest.raises(MalformedFeeScheduleEntryError, match=blank_field):
        _entry(**{blank_field: "  "})


def test_refuses_a_blank_evidence_url() -> None:
    """`D6.13`: a rate the backtest cannot cite back to its evidence is refused."""
    with pytest.raises(MissingFeeEvidenceUrlError):
        _entry(evidence_url="")


def test_accepts_a_negative_maker_bps_as_a_legitimate_rebate() -> None:
    """A maker rebate is real fee-schedule data, not an invalid one — no invented sign rule."""
    entry = _entry(maker_bps=Decimal("-1.5"))
    assert entry.maker_bps == Decimal("-1.5")


# ── `FeeScheduleCatalog` — uniqueness and as-of resolution ──────────────────────────────────


def test_duplicate_natural_key_is_refused() -> None:
    """Two rows sharing `(venue, market, tier, effective_from)` would leave `resolve` guessing."""
    with pytest.raises(DuplicateFeeScheduleEntryError):
        build_fee_schedule_catalog((_entry(), _entry()))


def test_resolve_refuses_when_no_entry_covers_the_date() -> None:
    """`D6.13`: an uncovered date REFUSES, never a default rate resolved as-of the window."""
    catalog = build_fee_schedule_catalog((_entry(effective_from=date(2026, 6, 1)),))

    with pytest.raises(NoFeeScheduleAsOfError):
        catalog.resolve(venue="binance", market="usdm_futures", tier="VIP0", at=date(2026, 1, 1))


def test_resolve_refuses_on_an_empty_catalog() -> None:
    """`PRD-001`: "hoje não existe nenhum" — the zero-entry case must refuse, not crash oddly."""
    catalog = build_fee_schedule_catalog(())

    with pytest.raises(NoFeeScheduleAsOfError):
        catalog.resolve(venue="binance", market="usdm_futures", tier="VIP0", at=date(2026, 1, 1))


def test_resolve_picks_the_latest_entry_still_in_effect() -> None:
    """Among entries with `effective_from <= at`, the LATEST one wins — a tier change or promo."""
    older = _entry(effective_from=date(2026, 1, 1), maker_bps=Decimal("2.0"))
    newer = _entry(effective_from=date(2026, 6, 1), maker_bps=Decimal("1.0"))
    catalog = build_fee_schedule_catalog((older, newer))

    resolved = catalog.resolve(
        venue="binance", market="usdm_futures", tier="VIP0", at=date(2026, 8, 1)
    )

    assert resolved.maker_bps == Decimal("1.0")


def test_resolve_does_not_apply_a_future_entry() -> None:
    """An entry with `effective_from` AFTER `at` has not taken effect — never applied early."""
    older = _entry(effective_from=date(2026, 1, 1), maker_bps=Decimal("2.0"))
    future = _entry(effective_from=date(2027, 1, 1), maker_bps=Decimal("0.5"))
    catalog = build_fee_schedule_catalog((older, future))

    resolved = catalog.resolve(
        venue="binance", market="usdm_futures", tier="VIP0", at=date(2026, 6, 1)
    )

    assert resolved.maker_bps == Decimal("2.0")


def test_resolve_does_not_leak_across_tier() -> None:
    """A schedule for a DIFFERENT tier never resolves for the one requested."""
    vip0 = _entry(tier="VIP0")
    vip1 = _entry(tier="VIP1", maker_bps=Decimal("1.0"))
    catalog = build_fee_schedule_catalog((vip0, vip1))

    with pytest.raises(NoFeeScheduleAsOfError):
        catalog.resolve(venue="binance", market="usdm_futures", tier="VIP2", at=date(2026, 6, 1))
