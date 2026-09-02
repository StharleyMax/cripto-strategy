"""The daily instrument-universe snapshot: `market`, `underlyingSubType`, `interestRate`."""

# `SPEC-001` §3.4, plan `02` items 2.1+2.2 (`T-02.1`/`CST-12`). Three public Binance USDⓈ-M
# endpoints feed one row per symbol:
#
#   `exchangeInfo`    -> `market` (by membership, see below), `underlyingSubType`
#   `fundingInfo`     -> `funding_interval_hours` — and it is the endpoint that carries
#                        COIN-M symbols even though this module never calls `dapi.binance.com`
#                        `[MEDIDO 2026-09-01: `XLMUSD_PERP` — a COIN-M name — is inside the
#                        `fapi.binance.com/fapi/v1/fundingInfo` response body, absent from
#                        `exchangeInfo`; 20 such symbols the same day]`
#   `premiumIndex`    -> `interest_rate`, and the SECOND WITNESS of the universe (`SPEC-001`
#                        §3.4: "premiumIndex como segunda testemunha")
#
# THIS MODULE IS `domain`: it touches no socket, no clock, no file. It takes ALREADY-DECODED
# JSON (`dict`/`list` from `json.loads`, produced by `infra`) and returns pure data. Contract 3
# of `[tool.importlinter]` (`Natureza`) is what makes that a portao and not a convention.
#
# ── `market` IS DERIVED, NOT A FIELD THE API RETURNS ───────────────────────────────────────
#
# Neither `exchangeInfo` nor `fundingInfo` names a `market` column. `exchangeInfo` on
# `fapi.binance.com` answers ONLY USDⓈ-M contracts (`[MEDIDO 2026-09-01]`), so a symbol's
# membership in that response IS the USDⓈ-M/COIN-M distinction `SPEC-001` §3.4 asks to be
# stored: present in `exchangeInfo` -> `MARKET_USDS_M`; present in `fundingInfo` alone ->
# `MARKET_COIN_M`. `MARKET_COIN_M`/`MARKET_USDS_M` are plain ASCII strings and not the
# special-character spelling ("USDⓈ-M") the SPEC's prose uses, because those are STORED
# VALUES this repository chose, not a third party's wire spelling — unlike `QuantityField`
# in `series_key.py`, there is no vendor field to transcribe here.
#
# ── `underlying_sub_type` — `None` MEANS "no `exchangeInfo` row this capture", `()` MEANS "an
# EMPTY list came back" ───────────────────────────────────────────────────────────────────
#
# A COIN-M symbol reached only through `fundingInfo` has no `exchangeInfo` entry to read
# `underlyingSubType` from at all — that is `None`, an absence of OBSERVATION. A USDⓈ-M symbol
# whose `exchangeInfo["underlyingSubType"]` is the empty list `[]` (most of them, e.g.
# `BTCUSDT`'s pair carries `["PoW"]` but a "TradFi" quarterly may carry `[]`) is `()`, an
# observed absence of TAG. Collapsing the two into one `None`/`()` would erase exactly the
# distinction `series_key.py`'s `QuantityField.NA` docstring names: "`NULL` in a term of
# identity produces two rows that neither distinguish nor compare".
#
# ── THE HASH: `SPEC-001` §3.4, LITERAL ──────────────────────────────────────────────────────
#
# "`payload_hash` do JSON bruto NAO detecta mudanca ... Hash sobre projecao canonica dos
# campos armazenados, mais confirmacao em duas leituras." `exchange_info_fingerprint` below is
# the narrow half of that sentence — canonical over `symbol` + `underlyingSubType` ALONE, which
# is what a caller compares across two back-to-back `exchangeInfo` reads (`use_cases/
# capture_instrument_universe_snapshot.py`) to confirm the read is stable BEFORE trusting it.
# `InstrumentUniverseSnapshot.fingerprint` is the wide half — over every stored field of the
# joined universe — and is what a caller compares across DAYS to detect drift (`D2.2`).

from __future__ import annotations

import hashlib
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Final, TypedDict

from src.modules.sentimento.domain.canonical_json import canonical_json

MARKET_USDS_M: Final[str] = "USDS_M"
MARKET_COIN_M: Final[str] = "COIN_M"


class ExchangeInfoSymbol(TypedDict):
    """The two `exchangeInfo` fields this module reads — the raw entry carries many more."""

    symbol: str
    underlyingSubType: list[str]


class ExchangeInfoPayload(TypedDict):
    """The one `exchangeInfo` field this module reads: the per-symbol list."""

    symbols: list[ExchangeInfoSymbol]


class FundingInfoEntry(TypedDict):
    """The two `fundingInfo` fields this module reads."""

    symbol: str
    fundingIntervalHours: int


class PremiumIndexEntry(TypedDict):
    """The two `premiumIndex` fields this module reads."""

    symbol: str
    interestRate: str


@dataclass(frozen=True)
class InstrumentRow:
    """One symbol's stored fields, joined across the three sources.

    NO FIELD IS OPTIONAL BY ACCIDENT: `underlying_sub_type`, `funding_interval_hours` and
    `interest_rate` are each `None` exactly when their SOURCE has no row for this `symbol` in
    THIS capture — a fact worth keeping, per `SPEC-001` §5.6 ("survivorship na borda de
    ingestao"), rather than a zero or an empty string that would read as an observed value.
    """

    symbol: str
    market: str
    underlying_sub_type: tuple[str, ...] | None
    funding_interval_hours: int | None
    interest_rate: str | None


@dataclass(frozen=True)
class SymbolSetDivergence:
    """The two-sided difference between two symbol sets — `D2.3` and `D2.4` share this shape.

    Divergence here is `SPEC-001` §3.4's own words: "a divergencia e dado, nao erro". Nothing
    in this dataclass raises or flags a problem; it is the measurement that a caller (`D2.3`
    reads it as `exchangeInfo` x `premiumIndex`, `D2.4` as `exchangeInfo` x `fundingInfo`) then
    reports.
    """

    only_in_first: tuple[str, ...]
    only_in_second: tuple[str, ...]


def exchange_info_symbols(payload: ExchangeInfoPayload) -> frozenset[str]:
    """Return every `symbol` in an `exchangeInfo` response — the USDⓈ-M side of the universe."""
    return frozenset(entry["symbol"] for entry in payload["symbols"])


def funding_info_symbols(payload: Sequence[FundingInfoEntry]) -> frozenset[str]:
    """Return every `symbol` in a `fundingInfo` response — USDⓈ-M plus the COIN-M stowaways."""
    return frozenset(entry["symbol"] for entry in payload)


def premium_index_symbols(payload: Sequence[PremiumIndexEntry]) -> frozenset[str]:
    """Return every `symbol` in a `premiumIndex` response — the second witness."""
    return frozenset(entry["symbol"] for entry in payload)


def compare_symbol_sets(first: frozenset[str], second: frozenset[str]) -> SymbolSetDivergence:
    """Return the two-sided, sorted difference — the one function `D2.3` and `D2.4` share."""
    return SymbolSetDivergence(
        only_in_first=tuple(sorted(first - second)),
        only_in_second=tuple(sorted(second - first)),
    )


def exchange_info_canonical_projection(payload: ExchangeInfoPayload) -> str:
    """Project `exchangeInfo` onto `symbol` + `underlyingSubType` ALONE, sorted by symbol.

    Narrower than `InstrumentUniverseSnapshot` on purpose: this is the projection two
    back-to-back reads of the SAME endpoint are compared against (`D2.5`), and every other
    field of the raw payload (`serverTime`, `rateLimits`, per-symbol `filters`, …) is exactly
    the noise `SPEC-001` §3.4 says a raw-payload hash wrongly reacts to.
    """
    entries = sorted(payload["symbols"], key=lambda entry: entry["symbol"])
    lines = [
        canonical_json(
            {
                "symbol": entry["symbol"],
                "underlying_sub_type": list(entry.get("underlyingSubType") or []),
            }
        )
        for entry in entries
    ]
    return "\n".join(lines)


def exchange_info_fingerprint(payload: ExchangeInfoPayload) -> str:
    """Return `sha256` of `exchange_info_canonical_projection` — the `D2.5` stability check."""
    return hashlib.sha256(exchange_info_canonical_projection(payload).encode("utf-8")).hexdigest()


def _row_for_symbol(
    symbol: str,
    exchange_entry: ExchangeInfoSymbol | None,
    funding_entry: FundingInfoEntry | None,
    premium_entry: PremiumIndexEntry | None,
) -> InstrumentRow:
    """Join one symbol's (possibly-absent) entries from the three sources into one row."""
    underlying_sub_type = (
        tuple(exchange_entry.get("underlyingSubType") or []) if exchange_entry is not None else None
    )
    return InstrumentRow(
        symbol=symbol,
        market=MARKET_USDS_M if exchange_entry is not None else MARKET_COIN_M,
        underlying_sub_type=underlying_sub_type,
        funding_interval_hours=(
            funding_entry["fundingIntervalHours"] if funding_entry is not None else None
        ),
        interest_rate=premium_entry["interestRate"] if premium_entry is not None else None,
    )


def build_instrument_rows(
    exchange_info: ExchangeInfoPayload,
    funding_info: Sequence[FundingInfoEntry],
    premium_index: Sequence[PremiumIndexEntry],
) -> tuple[InstrumentRow, ...]:
    """Join the three sources into one row per symbol, sorted by symbol.

    The universe is `exchangeInfo` UNION `fundingInfo` — every symbol either endpoint names.
    `premiumIndex` is consulted for `interest_rate` where it has a matching row, but its OWN
    extra symbols (`D2.3`: `EOSUSDT`, `FRONTUSDT`, `MATICUSDT` on `[MEDIDO 2026-09-01]`) are
    NOT added as rows — `premiumIndex` is the second WITNESS of the universe
    (`compare_symbol_sets`), not a third definer of it.
    """
    exchange_by_symbol = {entry["symbol"]: entry for entry in exchange_info["symbols"]}
    funding_by_symbol = {entry["symbol"]: entry for entry in funding_info}
    premium_by_symbol = {entry["symbol"]: entry for entry in premium_index}
    universe = sorted(set(exchange_by_symbol) | set(funding_by_symbol))
    return tuple(
        _row_for_symbol(
            symbol,
            exchange_by_symbol.get(symbol),
            funding_by_symbol.get(symbol),
            premium_by_symbol.get(symbol),
        )
        for symbol in universe
    )


def funding_interval_hours_distribution(rows: Sequence[InstrumentRow]) -> dict[int, int]:
    """Return `{fundingIntervalHours: count}` over the rows that HAVE a `fundingInfo` entry.

    `D2.2` reads this over two captures and compares the two dicts — a symbol appearing,
    disappearing or changing interval moves the count, and `SPEC-001` §3.4 calls that
    behaviour proof that the snapshot detects universe drift.
    """
    counts: dict[int, int] = {}
    for row in rows:
        if row.funding_interval_hours is None:
            continue
        counts[row.funding_interval_hours] = counts.get(row.funding_interval_hours, 0) + 1
    return counts


@dataclass(frozen=True)
class InstrumentUniverseSnapshot:
    """One dated snapshot: every stored field of every symbol, plus the day it was captured.

    `captured_on` is an ISO date (`YYYY-MM-DD`) SUPPLIED by the caller — this dataclass reads
    no clock (`Natureza`, `ADR-016/D1`), and the SAME string is what the storing `infra` layer
    puts in the snapshot's file name (`D2.1`: "grava a data no proprio nome ... do snapshot").
    """

    captured_on: str
    rows: tuple[InstrumentRow, ...]

    def canonical_lines(self) -> tuple[str, ...]:
        """Return one canonical-JSON line per row, preceded by a header line with the count.

        `rows` is ALREADY sorted by symbol (`build_instrument_rows`' contract), so nothing
        here re-sorts — a second sort would silently mask a caller that stopped sorting.
        """
        header = canonical_json(
            {
                "snapshot": "instrument_universe_snapshot",
                "captured_on": self.captured_on,
                "n_rows": len(self.rows),
            }
        )
        lines = [header]
        lines.extend(canonical_json(_project_row(row)) for row in self.rows)
        return tuple(lines)

    def canonical_projection(self) -> str:
        """Return the whole projection as one string — the exact bytes a report would emit."""
        return "\n".join(self.canonical_lines())

    def fingerprint(self) -> str:
        """Return `sha256` of `canonical_projection` — the wide, cross-day identity of `D2.2`."""
        return hashlib.sha256(self.canonical_projection().encode("utf-8")).hexdigest()


def _project_row(row: InstrumentRow) -> dict[str, object]:
    """Project one row onto its five stored fields, in the order the projection writes them."""
    return {
        "symbol": row.symbol,
        "market": row.market,
        "underlying_sub_type": (
            list(row.underlying_sub_type) if row.underlying_sub_type is not None else None
        ),
        "funding_interval_hours": row.funding_interval_hours,
        "interest_rate": row.interest_rate,
    }
