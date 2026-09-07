"""`series_row_wire` — the ONE encoding between `SeriesRow` and the Redis Streams transport.

`SPEC-004` §3.2 (plan `01`, item 1.1): this module is the SOLE owner of the
`SeriesRow <-> Mapping[str, str]` wire — `encode` feeds `RedisStreamPublisher.publish`
(`redis_stream_bus.py`), and `decode` is what a future consumer wires as the `Decoder` for
`RedisSeriesWriteQueue` (`T-02.5`, out of this task's scope). No other module may define a
second `decode` for this row shape — `D1.1` measures exactly that:
`grep -rln 'def decode' backend/src/modules/sentimento/infra | wc -l` must stay **1**.

WHY A DEDICATED WIRE MODULE INSTEAD OF `dataclasses.asdict`: `asdict` emits Python values —
`int`, `bool`, `Enum` members, `None` — into a `dict[str, Any]`, and `XADD`
(`RedisStreamPublisher.publish`) requires `Mapping[str, str]`, every value ASCII text. This
module is the one place that owns the string encoding for each of the 15 `SeriesRow` columns,
so a producer and a consumer written against the same stream never each invent their own
parsing of it.

THE `None` SENTINEL (`_ABSENT`, below): `SPEC-004` §3.2 is explicit that `None` does not exist
on the wire, and that an optional field becomes the empty string only if the dataclass itself
permits an empty string as one of that field's own legitimate values — and today none of
`SeriesRow`'s two optional columns do. `principal_id` (`str | None`) is the case that makes this
concrete: `SeriesRow.__post_init__` only rejects a blank `principal_id` when `provenance` is
`Provenance.HUMAN` — a non-`HUMANO` row is free to carry `principal_id=""` as an actual, distinct
value from `principal_id=None`. Encoding both as `""` would make `decode` unable to tell "no
principal" from "principal is the empty string", so this module uses a single NUL byte instead:
no field on a `SeriesRow` is ever produced by a process that embeds a NUL (`series_key_id` is a
hex digest, `symbol`/`source`/`observer_id` are short exchange/operator tokens, `src_label_raw`
is a source-supplied label, `observer_region` defaults to `UNKNOWN_OBSERVER_REGION`), so `_ABSENT`
cannot collide with a real value the dataclass allows.
"""

from __future__ import annotations

from collections.abc import Mapping
from enum import Enum
from typing import Final

from src.modules.sentimento.domain.provenance import AvailabilitySource, Provenance, SeriesRow

# Declaration order of `SeriesRow` (`provenance.py`), transcribed rather than computed from
# `dataclasses.fields(SeriesRow)` at import time — a future reorder of the dataclass then shows
# up as a diff HERE, in the one place that is supposed to notice, instead of silently following
# along. `SPEC-004` §3.2 counts the same 15 names, in the same order.
FIELD_NAMES: Final[tuple[str, ...]] = (
    "series_key_id",
    "symbol",
    "source",
    "bucket_end",
    "event_time",
    "available_at",
    "availability_source",
    "ingested_at",
    "observed_at",
    "provenance",
    "src_label_raw",
    "observer_id",
    "observer_region",
    "is_final",
    "principal_id",
)
# SPEC-004 §3.2 fixes SeriesRow at 15 wire columns — `test_series_row_wire.py` pins the count
# (no `assert` here: `S101` forbids it in production code, and a wrong count would already fail
# every round-trip test, so a runtime check would only duplicate what the test already catches).

_FIELD_NAME_SET: Final[frozenset[str]] = frozenset(FIELD_NAMES)

_TRUE: Final[str] = "1"
_FALSE: Final[str] = "0"
# A single NUL byte — see the module docstring's "THE `None` SENTINEL" section for why this and
# not the empty string.
_ABSENT: Final[str] = "\x00"


class SeriesRowWireError(Exception):
    """Base of every error `decode` raises.

    `decode` never returns a partial row or swallows a bad field into a silent default —
    `SPEC-004` §3.2 makes every one of these failures name the offending field, and each
    concrete subclass below exists so a caller can also tell missing from extra from unparsable
    without parsing the message.
    """


class MissingWireFieldError(SeriesRowWireError):
    """`decode` was handed a mapping missing one of the 15 required `SeriesRow` columns."""


class UnexpectedWireFieldError(SeriesRowWireError):
    """`decode` was handed a mapping carrying a key none of the 15 columns owns."""


class InvalidWireFieldValueError(SeriesRowWireError):
    """`decode` was handed a value that does not parse as the named field's encoded type."""


def encode(row: SeriesRow) -> Mapping[str, str]:
    """Project `row` into the flat `str -> str` mapping `RedisStreamPublisher.publish` sends.

    One key per column, named exactly as the `SeriesRow` field (`SPEC-004` §3.2: "chave = nome
    do campo"). Dict-literal order is `FIELD_NAMES` order, and `RedisStreamPublisher.publish`
    iterates a mapping in its own order (`redis_stream_bus.py`), so the field order on the wire
    is stable and matches this module's declared order.
    """
    return {
        "series_key_id": row.series_key_id,
        "symbol": row.symbol,
        "source": row.source,
        "bucket_end": str(row.bucket_end),
        "event_time": str(row.event_time),
        "available_at": str(row.available_at),
        "availability_source": row.availability_source.name,
        "ingested_at": str(row.ingested_at),
        "observed_at": str(row.observed_at),
        "provenance": row.provenance.name,
        "src_label_raw": row.src_label_raw,
        "observer_id": row.observer_id,
        "observer_region": row.observer_region,
        "is_final": _encode_optional_bool(row.is_final),
        "principal_id": _encode_optional_text(row.principal_id),
    }


def decode(fields: Mapping[str, str]) -> SeriesRow:
    """Recover the `SeriesRow` that `encode` produced — or raise, naming the field.

    `SPEC-004` §3.2's property is `decode(encode(row)) == row` for every `Provenance`; a field
    missing, a field none of the 15 owns, or a value that will not parse each raise a distinct,
    typed, English exception rather than a silently wrong or partial row.
    """
    _reject_field_set_mismatch(fields)
    return SeriesRow(
        series_key_id=_decode_text("series_key_id", fields),
        symbol=_decode_text("symbol", fields),
        source=_decode_text("source", fields),
        bucket_end=_decode_int("bucket_end", fields),
        event_time=_decode_int("event_time", fields),
        available_at=_decode_int("available_at", fields),
        availability_source=_decode_enum("availability_source", AvailabilitySource, fields),
        ingested_at=_decode_int("ingested_at", fields),
        observed_at=_decode_int("observed_at", fields),
        provenance=_decode_enum("provenance", Provenance, fields),
        src_label_raw=_decode_text("src_label_raw", fields),
        observer_id=_decode_text("observer_id", fields),
        observer_region=_decode_text("observer_region", fields),
        is_final=_decode_optional_bool("is_final", fields),
        principal_id=_decode_optional_text("principal_id", fields),
    )


def _reject_field_set_mismatch(fields: Mapping[str, str]) -> None:
    present = frozenset(fields.keys())
    missing = _FIELD_NAME_SET - present
    if missing:
        raise MissingWireFieldError(
            f"wire mapping is missing field(s) {sorted(missing)!r} of the 15 `SeriesRow` "
            f"columns `SPEC-004` §3.2 fixes"
        )
    extra = present - _FIELD_NAME_SET
    if extra:
        raise UnexpectedWireFieldError(
            f"wire mapping carries field(s) {sorted(extra)!r} that no `SeriesRow` column "
            f"owns (`SPEC-004` §3.2 names exactly 15)"
        )


def _encode_optional_bool(value: bool | None) -> str:
    if value is None:
        return _ABSENT
    return _TRUE if value else _FALSE


def _encode_optional_text(value: str | None) -> str:
    return _ABSENT if value is None else value


def _decode_text(name: str, fields: Mapping[str, str]) -> str:
    return fields[name]


def _decode_optional_text(name: str, fields: Mapping[str, str]) -> str | None:
    raw = fields[name]
    return None if raw == _ABSENT else raw


def _decode_int(name: str, fields: Mapping[str, str]) -> int:
    raw = fields[name]
    try:
        return int(raw)
    except ValueError as error:
        raise InvalidWireFieldValueError(
            f"field '{name}' = {raw!r} is not a decimal integer"
        ) from error


def _decode_optional_bool(name: str, fields: Mapping[str, str]) -> bool | None:
    raw = fields[name]
    if raw == _ABSENT:
        return None
    if raw == _TRUE:
        return True
    if raw == _FALSE:
        return False
    raise InvalidWireFieldValueError(
        f"field '{name}' = {raw!r} is not one of the encoded boolean forms "
        f"({_TRUE!r}, {_FALSE!r}, or the absence marker for None)"
    )


def _decode_enum[EnumT: Enum](
    name: str, enum_type: type[EnumT], fields: Mapping[str, str]
) -> EnumT:
    raw = fields[name]
    try:
        return enum_type[raw]
    except KeyError as error:
        raise InvalidWireFieldValueError(
            f"field '{name}' = {raw!r} is not a member name of {enum_type.__name__}"
        ) from error
