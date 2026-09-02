"""`capture_instrument_universe_snapshot`: the `D2.5` two-read confirmation, unit-level.

`test_instrument_universe_snapshot.py` proves `D2.5` end to end on real fixtures. This module
proves the REFUSAL path — what happens when the two `exchangeInfo` reads DISAGREE — which the
real fixtures never exercise (they were captured 3 ms apart and agree by construction). A
synthetic disagreement is the only way to make that branch observable at all.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, cast

import pytest

from src.modules.sentimento.domain.instrument_universe_snapshot import (
    ExchangeInfoPayload,
    FundingInfoEntry,
    PremiumIndexEntry,
)
from src.modules.sentimento.use_cases.capture_instrument_universe_snapshot import (
    UnstableExchangeInfoReadError,
    capture_instrument_universe_snapshot,
)
from tests.helpers.data_fixtures import require_fixture

_EI_0824 = "binance/rest/ei.json"
_EI_0824_MD5 = "dbdba08fa871dab3341a15b4c3e3abc4"
_EI2_0824 = "binance/rest/ei2.json"
_EI2_0824_MD5 = "9cab1cbc1df29227acffbd8d82d834aa"
_FI_0824 = "binance/rest/fi.json"
_FI_0824_MD5 = "708ad49f70069d725477b1b7a5c02510"
_PI_0824 = "binance/rest/pi.json"
_PI_0824_MD5 = "f8ab44575844421c2603eb71466dcb4d"


def _load(relative: str, expected_md5: str) -> Any:  # noqa: ANN401 - raw JSON, shaped by callers
    """Read one cataloged fixture, pinned by `md5`, and decode it as JSON."""
    path: Path = require_fixture(relative, expected_md5=expected_md5)
    return json.loads(path.read_text(encoding="utf-8"))


def test_two_agreeing_reads_build_the_snapshot() -> None:
    """The real, 3-ms-apart pair (`ei.json`/`ei2.json`) is accepted and joined."""
    exchange_info_first = _load(_EI_0824, _EI_0824_MD5)
    exchange_info_second = _load(_EI2_0824, _EI2_0824_MD5)
    funding_info = _load(_FI_0824, _FI_0824_MD5)
    premium_index = _load(_PI_0824, _PI_0824_MD5)

    snapshot = capture_instrument_universe_snapshot(
        exchange_info_first, exchange_info_second, funding_info, premium_index, "2026-08-24"
    )

    assert snapshot.captured_on == "2026-08-24"
    assert len(snapshot.rows) == 872 + 20  # exchangeInfo union fundingInfo's 20 COIN-M extras


def test_a_mutated_second_read_is_refused_instead_of_silently_accepted() -> None:
    """The one branch the real fixtures cannot reach: two reads that DISAGREE.

    `ei.json` is copied and one symbol's `underlyingSubType` is mutated — the exact shape
    `test_d2_5_fingerprint_reacts_to_a_real_change_in_underlying_sub_type` proves moves the
    narrow fingerprint. `SPEC-001` §3.4 asks for a refusal here, not a best-effort guess about
    which read to trust.
    """
    exchange_info_first: ExchangeInfoPayload = _load(_EI_0824, _EI_0824_MD5)
    exchange_info_second: ExchangeInfoPayload = cast(
        "ExchangeInfoPayload", json.loads(json.dumps(exchange_info_first))
    )
    exchange_info_second["symbols"][0]["underlyingSubType"] = ["MUTATED"]
    funding_info: list[FundingInfoEntry] = _load(_FI_0824, _FI_0824_MD5)
    premium_index: list[PremiumIndexEntry] = _load(_PI_0824, _PI_0824_MD5)

    with pytest.raises(UnstableExchangeInfoReadError, match="two exchangeInfo reads"):
        capture_instrument_universe_snapshot(
            exchange_info_first, exchange_info_second, funding_info, premium_index, "2026-08-24"
        )


def test_the_refusal_message_carries_two_different_sha256_fingerprints() -> None:
    """A caller reading the exception needs the two digests to tell WHICH reads disagreed."""
    exchange_info_first: ExchangeInfoPayload = _load(_EI_0824, _EI_0824_MD5)
    exchange_info_second: ExchangeInfoPayload = cast(
        "ExchangeInfoPayload", json.loads(json.dumps(exchange_info_first))
    )
    exchange_info_second["symbols"][0]["underlyingSubType"] = ["MUTATED"]
    funding_info: list[FundingInfoEntry] = _load(_FI_0824, _FI_0824_MD5)
    premium_index: list[PremiumIndexEntry] = _load(_PI_0824, _PI_0824_MD5)

    with pytest.raises(UnstableExchangeInfoReadError) as failure:
        capture_instrument_universe_snapshot(
            exchange_info_first, exchange_info_second, funding_info, premium_index, "2026-08-24"
        )

    message = str(failure.value)
    hex_digests = re.findall(r"\b[0-9a-f]{64}\b", message)
    assert len(hex_digests) == 2
    assert hex_digests[0] != hex_digests[1]
