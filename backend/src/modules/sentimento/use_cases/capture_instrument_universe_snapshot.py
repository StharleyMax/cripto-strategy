"""Capture one dated instrument-universe snapshot, confirmed by two `exchangeInfo` reads."""

# `SPEC-001` §3.4, literal: "Hash sobre projecao canonica dos campos armazenados, mais
# confirmacao em duas leituras." This use case IS that confirmation: it takes two `exchangeInfo`
# reads the caller already made moments apart, refuses to build a snapshot when they disagree on
# the fields that matter (`D2.5`), and otherwise joins them with one `fundingInfo` and one
# `premiumIndex` read into the day's `InstrumentUniverseSnapshot`.
#
# Fetching the three payloads is `infra`'s job (a socket, `Natureza` forbids here); this module
# only orchestrates already-decoded JSON.

from __future__ import annotations

import logging
from collections.abc import Sequence

from src.modules.sentimento.domain.instrument_universe_snapshot import (
    ExchangeInfoPayload,
    FundingInfoEntry,
    InstrumentUniverseSnapshot,
    PremiumIndexEntry,
    build_instrument_rows,
    exchange_info_fingerprint,
)

logger = logging.getLogger(__name__)


class UnstableExchangeInfoReadError(Exception):
    """Two `exchangeInfo` reads, moments apart, disagree on `symbol` + `underlyingSubType`.

    `SPEC-001` §3.4 asks for the confirmation, not for a retry policy: retrying, backing off
    or picking a "best" read are all decisions this exception refuses to make silently on a
    caller's behalf. The caller (`infra`) decides what an unstable read means operationally.
    """


def capture_instrument_universe_snapshot(
    exchange_info_first_read: ExchangeInfoPayload,
    exchange_info_second_read: ExchangeInfoPayload,
    funding_info: Sequence[FundingInfoEntry],
    premium_index: Sequence[PremiumIndexEntry],
    captured_on: str,
) -> InstrumentUniverseSnapshot:
    """Build the day's snapshot, refusing it when the two `exchangeInfo` reads disagree.

    `exchange_info_second_read` — not the first — is what feeds `build_instrument_rows`: it is
    the read closest to `funding_info`/`premium_index` in wall-clock time, and the two having
    just been proven to agree on `symbol`/`underlyingSubType` means either would do.
    """
    first_fingerprint = exchange_info_fingerprint(exchange_info_first_read)
    second_fingerprint = exchange_info_fingerprint(exchange_info_second_read)
    if first_fingerprint != second_fingerprint:
        raise UnstableExchangeInfoReadError(
            f"two exchangeInfo reads disagree on the canonical projection "
            f"({first_fingerprint} != {second_fingerprint}); SPEC-001 §3.4 requires "
            f"confirmation across two reads before accepting the snapshot"
        )
    rows = build_instrument_rows(exchange_info_second_read, funding_info, premium_index)
    logger.debug(
        "instrument_universe_snapshot_captured",
        extra={"captured_on": captured_on, "n_rows": len(rows)},
    )
    return InstrumentUniverseSnapshot(captured_on=captured_on, rows=rows)
