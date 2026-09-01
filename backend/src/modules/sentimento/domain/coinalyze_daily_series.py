"""The two Coinalyze `daily` series this one-shot captures, and what "enough" means for each."""

# `CA-F0-13` (`SPEC-001` §5.2, plano 02 item 2.3) names two series and a floor for each:
#
#     open interest  >= 2.400 pontos, 1a data <= 2020-01-21
#     liquidacao     >=   700 pontos, 1a data <= 2024-08-26
#
# Both numbers are `[DOC: docs/medicao-coinalyze.md §1.2]` — the round trip that measured 2.409
# days of OI and 730 days of liquidation with a real key, 11 calls spent. This module holds the
# REQUIREMENT and the PARSING of what the provider sends back; it never opens a connection and
# never reads a clock, so every function here is testable with a JSON fixture and nothing else.
#
# ── WHY `raw` STAYS A `Mapping[str, object]` INSTEAD OF FOUR TYPED FIELDS ──────────────────────
#
# `SPEC-001` §5.6's rule for a schema change is "campo ADITIVO desconhecido -> quarentena +
# alarme, NUNCA parar a ingestao". A `DailyPoint` that unpacked `{t, o, h, l, c}` into four named
# floats would silently DROP a field the provider adds tomorrow, which is the opposite of "grava
# cru" (plano 02, "Nao faz"). Only `t` is read here, because it is the one field every consumer of
# this module needs (counting points, finding the first date); everything else rides along
# unopened in `raw` and is stored byte-for-byte by whichever adapter persists it.

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from enum import Enum
from typing import Final


class SeriesKind(Enum):
    """The two series this task captures — closed, because a third needs its own requirement."""

    OPEN_INTEREST = "open_interest"
    LIQUIDATION = "liquidation"


# The Coinalyze endpoint path for each kind, `daily` interval always — this task never asks for
# any other granularity (`docs/medicao-coinalyze.md` §5).
ENDPOINT_PATH_BY_KIND: Final[dict[SeriesKind, str]] = {
    SeriesKind.OPEN_INTEREST: "/v1/open-interest-history",
    SeriesKind.LIQUIDATION: "/v1/liquidation-history",
}

# `A` is Binance's exchange code in Coinalyze's namespace, measured against real symbols in
# `docs/medicao-coinalyze.md` §5 ("Binance `A`"). This task only ever captures Binance USDT-M
# perpetuals, so the suffix is a constant and not a parameter.
_BINANCE_EXCHANGE_CODE: Final[str] = "A"


def to_coinalyze_symbol(binance_symbol: str) -> str:
    """Translate a Binance symbol into Coinalyze's `<SYMBOL>_PERP.<CODE>` namespace.

    Refuses an already-suffixed or empty symbol rather than double-suffixing it silently: a
    caller that passes `BTCUSDT_PERP.A` by mistake would otherwise get
    `BTCUSDT_PERP.A_PERP.A` and a `200` with zero history, which reads exactly like "this
    symbol does not exist on Coinalyze" and hides the real bug.
    """
    symbol = binance_symbol.strip()
    if not symbol:
        raise ValueError("binance_symbol vazio nao tem tradução para o namespace da Coinalyze")
    if "_PERP." in symbol:
        raise ValueError(
            f"{binance_symbol!r} ja parece estar no namespace da Coinalyze "
            "(contem '_PERP.'); passe o simbolo cru da Binance"
        )
    return f"{symbol}_PERP.{_BINANCE_EXCHANGE_CODE}"


def history_path_for(
    series_kind: SeriesKind,
    coinalyze_symbol: str,
    from_epoch_seconds: int,
    to_epoch_seconds: int,
) -> str:
    """Build the query path for ONE symbol, `interval=daily` always — never a batched symbol list.

    One symbol per call is a deliberate choice, not an oversight: the provider's own doc says
    batching by comma still spends one call per symbol
    (`avaliacao-discovery.md`: *"each symbol consume one API call"*), so batching would save
    HTTP round trips without saving quota — and it would also mean `parse_daily_points` has to
    handle a response array of arbitrary length instead of refusing anything but 0 or 1
    elements. `to`/`from` are accepted as epoch seconds, matching what
    `docs/medicao-coinalyze.md` §1.1 shows the provider accepting.
    """
    if from_epoch_seconds >= to_epoch_seconds:
        raise ValueError(
            f"from_epoch_seconds={from_epoch_seconds} >= to_epoch_seconds={to_epoch_seconds}: "
            "uma janela invertida ou vazia nao pede historico nenhum"
        )
    endpoint = ENDPOINT_PATH_BY_KIND[series_kind]
    return (
        f"{endpoint}?symbols={coinalyze_symbol}&interval=daily"
        f"&from={from_epoch_seconds}&to={to_epoch_seconds}"
    )


@dataclass(frozen=True)
class DailyPoint:
    """One point of a `daily` series, kept RAW — only `t` is interpreted, everything else rides.

    `raw` is a plain `Mapping[str, object]` fresh from `json.loads`, so re-serialising it with
    the same JSON encoder round-trips every field the provider sent, known or not.
    """

    timestamp_epoch_seconds: int
    raw: Mapping[str, object]

    @property
    def date_utc(self) -> date:
        """Return the UTC calendar date this point falls on.

        `tz=timezone.utc` is EXPLICIT and mandatory: `datetime.fromtimestamp` without a `tz`
        reads the process's LOCAL timezone, which is an environment dependency this pure
        function must not carry (`ADR-016/D1`, "mesmo codigo, outra maquina, outra resposta").
        With `tz=` given, the call is deterministic in the input alone.
        """
        return datetime.fromtimestamp(self.timestamp_epoch_seconds, tz=UTC).date()


class MalformedCoinalizeResponseError(Exception):
    """The response body does not have the shape this module knows how to read.

    Raised instead of returning an empty tuple, because "the provider changed its wire shape"
    and "this symbol has zero history" are different facts (`SPEC-001` §5.5): the first is a
    schema change this ingestor must not swallow, and the second is a legitimate `200`.
    """


def parse_daily_points(body: bytes) -> tuple[DailyPoint, ...]:
    """Parse one `/…-history?symbols=<one symbol>` response body into its points.

    The provider's wire shape for ONE requested symbol is a JSON array with at most one
    element, `{"symbol": "...", "history": [{"t": …, …}, …]}`. An empty array is a LEGITIMATE
    answer — "this symbol has no history on Coinalyze" — and returns `()`, not an error.
    """
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as failure:
        raise MalformedCoinalizeResponseError(
            f"corpo nao e JSON valido: {type(failure).__name__}: {failure}"
        ) from failure
    if not isinstance(payload, list):
        raise MalformedCoinalizeResponseError(
            f"corpo esperado como lista, veio {type(payload).__name__}"
        )
    if len(payload) == 0:
        return ()
    if len(payload) > 1:
        raise MalformedCoinalizeResponseError(
            f"esperava no maximo 1 simbolo por chamada (este coletor pede 1 por vez), "
            f"vieram {len(payload)}"
        )
    entry = payload[0]
    if not isinstance(entry, dict) or "history" not in entry:
        shape = sorted(entry) if isinstance(entry, dict) else type(entry).__name__
        raise MalformedCoinalizeResponseError(f"elemento sem campo 'history': {shape}")
    history = entry["history"]
    if not isinstance(history, list):
        raise MalformedCoinalizeResponseError(
            f"'history' esperado como lista, veio {type(history).__name__}"
        )
    points: list[DailyPoint] = []
    for index, item in enumerate(history):
        if not isinstance(item, dict) or "t" not in item:
            raise MalformedCoinalizeResponseError(
                f"ponto {index} de 'history' sem campo 't': {item!r}"
            )
        try:
            timestamp = int(item["t"])
        except (TypeError, ValueError) as failure:
            raise MalformedCoinalizeResponseError(
                f"ponto {index}: 't' nao e inteiro: {item['t']!r}"
            ) from failure
        points.append(DailyPoint(timestamp_epoch_seconds=timestamp, raw=item))
    return tuple(points)


@dataclass(frozen=True)
class SeriesRequirement:
    """The floor `CA-F0-13` sets for one series: how many points, how far back, at least."""

    series_kind: SeriesKind
    min_points: int
    first_point_on_or_before: date

    def __post_init__(self) -> None:
        """Reject a requirement that could never be met by construction."""
        if self.min_points < 1:
            raise ValueError(
                f"min_points={self.min_points}: um requisito de zero pontos nao mede cobertura"
            )


# The two floors this task exists to satisfy, `[DOC: docs/medicao-coinalyze.md §1.2]`:
#   OI daily      2.409 dias medidos, 2020-01-21 -> hoje  => piso 2.400 / <= 2020-01-21
#   liquidacao    730 dias medidos,  2024-08-26 -> hoje   => piso   700 / <= 2024-08-26
OPEN_INTEREST_REQUIREMENT: Final[SeriesRequirement] = SeriesRequirement(
    series_kind=SeriesKind.OPEN_INTEREST,
    min_points=2400,
    first_point_on_or_before=date(2020, 1, 21),
)
LIQUIDATION_REQUIREMENT: Final[SeriesRequirement] = SeriesRequirement(
    series_kind=SeriesKind.LIQUIDATION,
    min_points=700,
    first_point_on_or_before=date(2024, 8, 26),
)

REQUIREMENT_BY_KIND: Final[dict[SeriesKind, SeriesRequirement]] = {
    OPEN_INTEREST_REQUIREMENT.series_kind: OPEN_INTEREST_REQUIREMENT,
    LIQUIDATION_REQUIREMENT.series_kind: LIQUIDATION_REQUIREMENT,
}


@dataclass(frozen=True)
class SeriesRequirementVerdict:
    """Whether one symbol's captured points satisfy the requirement, and why not when they don't.

    `met` is never inferred by the caller from the other fields — it is computed once, here,
    so two call sites cannot disagree about what "enough" means for the same requirement.
    """

    met: bool
    n_points: int
    first_point_date: date | None
    reasons: tuple[str, ...]


def evaluate_series_requirement(
    requirement: SeriesRequirement, points: Sequence[DailyPoint]
) -> SeriesRequirementVerdict:
    """Check `points` against `requirement`, naming every reason it falls short.

    Both checks run independently — a symbol can fail on count alone, on depth alone, or both —
    and the verdict names every failing reason instead of stopping at the first, because an
    operator deciding whether to re-run wants to know the whole gap, not one symptom of it.
    """
    n_points = len(points)
    first_point_date = min((point.date_utc for point in points), default=None)
    reasons: list[str] = []
    if n_points < requirement.min_points:
        reasons.append(f"n_points={n_points} < min_points={requirement.min_points}")
    if first_point_date is None or first_point_date > requirement.first_point_on_or_before:
        reasons.append(
            f"first_point_date={first_point_date} > "
            f"first_point_on_or_before={requirement.first_point_on_or_before}"
        )
    return SeriesRequirementVerdict(
        met=not reasons,
        n_points=n_points,
        first_point_date=first_point_date,
        reasons=tuple(reasons),
    )
