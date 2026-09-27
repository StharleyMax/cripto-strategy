"""`CsvSeriesWindowReader`: the window read of `md.series`, served from a read-only CSV export."""

# `T-03.10`: `ADR-045`'s falsifiers are measured on REAL rows of the shared Postgres, and that
# database is read ONLY through `psql \copy (SELECT …) TO STDOUT WITH (FORMAT csv, HEADER true)`
# inside a `default_transaction_read_only=on` session — the command is in
# `docs/context/paineis-de-fluxo/gates/T-03.10-builder.md`. The bench never opens a connection
# of its own (`CLAUDE.md`: never seed, never write, and the API's idle-in-transaction history is
# the reason a second long-lived session is not opened either). This adapter turns that export
# back into the `Observation`s `PostgresSeriesWindowReader.read_window` would have returned for
# the same rows, so `use_cases/series_history.build_series_history_report` runs unmodified.
#
# The header must be EXACTLY `EXPORT_COLUMNS`, in order: the same sixteen columns, in the same
# order, as `postgres_series_window_reader._SELECT_WINDOW_SQL` (a test holds the two together).
# A reordered or partial export is refused by name, never read by position.
#
# `bucket_end` is kept as a parsed `int` BESIDE each `Observation`, and the window filter reads
# that `int`: reading `row.bucket_end` back off the `SeriesRow` would make this module a toucher
# of a read-path column (`test_as_of_is_the_single_reader.py`, `DECLARED_TOUCHERS`).

from __future__ import annotations

import csv
from collections import defaultdict
from collections.abc import Iterable, Mapping
from decimal import Decimal
from pathlib import Path
from typing import Final

from src.modules.sentimento.domain.as_of_accessor import Observation
from src.modules.sentimento.domain.provenance import AvailabilitySource, Provenance, SeriesRow

EXPORT_COLUMNS: Final[tuple[str, ...]] = (
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
    "value_raw",
)

# `psql`'s CSV spelling of a boolean, and of `NULL` (an unquoted empty field).
_BOOLEAN_BY_TEXT: Final[Mapping[str, bool | None]] = {"t": True, "f": False, "": None}


class CsvExportHeaderError(Exception):
    """The export's header is not `EXPORT_COLUMNS` in order, so no column can be trusted."""


class CsvExportValueError(Exception):
    """A field of the export does not read as the type its `md.series` column has."""


def _row_from_fields(fields: Mapping[str, str]) -> SeriesRow:
    """Build a `SeriesRow` from one CSV record, by KEYWORD — the shape the Postgres reader uses."""
    is_final_text = fields["is_final"]
    if is_final_text not in _BOOLEAN_BY_TEXT:
        raise CsvExportValueError(f"is_final {is_final_text!r} is not one of t/f/empty")
    return SeriesRow(
        series_key_id=fields["series_key_id"],
        symbol=fields["symbol"],
        source=fields["source"],
        bucket_end=int(fields["bucket_end"]),
        event_time=int(fields["event_time"]),
        available_at=int(fields["available_at"]),
        availability_source=AvailabilitySource(fields["availability_source"]),
        ingested_at=int(fields["ingested_at"]),
        observed_at=int(fields["observed_at"]),
        provenance=Provenance(fields["provenance"]),
        src_label_raw=fields["src_label_raw"],
        observer_id=fields["observer_id"],
        observer_region=fields["observer_region"],
        is_final=_BOOLEAN_BY_TEXT[is_final_text],
        value_raw=fields["value_raw"],
        principal_id=fields["principal_id"] or None,
    )


class CsvSeriesWindowReader:
    """`SeriesWindowReader` + `SeriesStoreBoundsReader` over an in-memory `md.series` export."""

    def __init__(self, records: Iterable[Mapping[str, str]]) -> None:
        """Index every record by `(series_key_id, symbol)`, with its `bucket_end` parsed once.

        Raises:
            CsvExportValueError: a numeric field does not parse as an integer.

        """
        self._rows: dict[tuple[str, str], list[tuple[int, Observation]]] = defaultdict(list)
        for fields in records:
            try:
                row = _row_from_fields(fields)
                bucket_end = int(fields["bucket_end"])
            except ValueError as failure:
                raise CsvExportValueError(
                    f"record for {fields.get('series_key_id')!r}/{fields.get('symbol')!r} "
                    f"does not parse: {failure}"
                ) from failure
            self._rows[(row.series_key_id, row.symbol)].append(
                (bucket_end, Observation(row=row, value=Decimal(row.value_raw)))
            )

    @classmethod
    def from_path(cls, path: Path) -> CsvSeriesWindowReader:
        """Read a `psql` CSV export (`WITH (FORMAT csv, HEADER true)`) of `EXPORT_COLUMNS`.

        Raises:
            CsvExportHeaderError: the header is not exactly `EXPORT_COLUMNS`, in order.
            CsvExportValueError: a field does not parse as its column's type.

        """
        with path.open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            if tuple(reader.fieldnames or ()) != EXPORT_COLUMNS:
                raise CsvExportHeaderError(
                    f"{path}: header {reader.fieldnames!r} is not {list(EXPORT_COLUMNS)!r}"
                )
            return cls(list(reader))

    def read_window(
        self,
        *,
        series_key_id: str,
        symbol: str,
        window_start_ms: int,
        window_end_ms: int,
        lookback_ms: int,
    ) -> tuple[Observation, ...]:
        """Return the observations with `bucket_end` in `[window_start - lookback, window_end]`.

        The same inclusive bounds as `PostgresSeriesWindowReader.read_window`'s `WHERE`.
        """
        lower_bound = window_start_ms - lookback_ms
        return tuple(
            observation
            for bucket_end, observation in self._rows.get((series_key_id, symbol), ())
            if lower_bound <= bucket_end <= window_end_ms
        )

    def read_bounds(self, *, series_key_id: str, symbol: str) -> tuple[int | None, int | None]:
        """Return `(MIN(bucket_end), MAX(bucket_end))` of THE EXPORT, `None`/`None` if empty.

        The export is a slice of the store, so these are the export's walls, not the store's;
        no falsifier reads `panel.coverage`, which is the only consumer of this answer.
        """
        ends = [bucket_end for bucket_end, _ in self._rows.get((series_key_id, symbol), ())]
        if not ends:
            return (None, None)
        return (min(ends), max(ends))
