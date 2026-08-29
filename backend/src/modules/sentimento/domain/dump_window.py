"""The dump work window: enumerated A PRIORI from a DEPTH, never discovered by a cursor."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Final, Literal

from src.modules.sentimento.domain.etl_backlog import EtlBacklog

# ── WHY THE WINDOW IS ENUMERATED AND NOT WALKED ──────────────────────────────────────────────
#
# `SPEC-001` §5.7 and `T-07.1` both require a CLOSED window enumerated up front. The reason is
# measured and it is not style: `D7.3` records that replaying the `startTime`-alone case returns
# *"a cauda de hoje, HTTP 200, sem aviso"* `[DOC: tasks_review.md, linha de `T-07.1`]`, so a loop
# shaped `cursor += janela` never advances and writes today's data carrying a timestamp of weeks
# ago. A window built by date arithmetic cannot have that failure mode, because no response is
# allowed to decide what the next unit of work is.
#
# This module is `domain`: no file, no socket, no clock. `date` comes in as an argument precisely
# so that nothing here reads one.
#
# ── DEPTH IS A PARAMETER, AND THAT IS A DECISION WITH A CITED SOURCE ──────────────────────────
#
# `Q18` is NOT a gate. `decisoes-do-owner.md`, `Q18`(d), literal:
#
#     **(d) RELOGIO: NAO.** *Requisito que torna a resposta tardia barata: a fila e retomavel e a
#     profundidade e PARAMETRO dela* => comecar por 30 dias e estender depois **nao e retrabalho**,
#     e a mesma fila com outro limite.
#
# `[PREMISSA-OWNER: citacao literal, via tasks_review.md §7/D-5]`
#
# So `DEFAULT_DEPTH_DAYS` is 30 and it is a DEFAULT, not a limit: extending it is a different
# argument to the same function, and the queue that consumes this window is resumable, so the
# extension re-enters an already-drained window and redoes nothing.
#
# ── `bookDepth` NAO TEM PREFIXO `monthly`, E ISSO ESTA MEDIDO ─────────────────────────────────
#
# `SPEC-001` §5.8, third row of the table: *"`bookDepth` nao tem prefixo `monthly` — um ETL que
# assuma mensal **quebra**"* `[MEDIDO, CST-5]`. This module refuses that combination at
# construction time instead of building a URL that 404s at 3 a.m., because a window that enumerates
# objects which cannot exist is not a window — it is a list of future failures.

# `Q18`(d): the default is 30 days, and the owner's own argument for why it is cheap to be
# wrong about it is that the queue is resumable. Extending is the same queue with another limit.
DEFAULT_DEPTH_DAYS: Final[int] = 30

# The bucket layout, verbatim from an URL that was actually fetched:
# `https://data.binance.vision/data/futures/um/monthly/bookTicker/BTCUSDT/BTCUSDT-bookTicker-2024-04.zip`
# `[MEDIDO 2026-08-29, ADR-014, bloco de codigo do achado que abre a ADR]`.
BUCKET_ROOT: Final[str] = "data/futures/um"
BUCKET_HOST: Final[str] = "https://data.binance.vision"

Granularity = Literal["monthly", "daily"]


class UnsupportedGranularityError(Exception):
    """The dataset does not publish under this prefix, so the object could never exist."""


class InvalidDepthError(Exception):
    """A depth that enumerates nothing, or that counts backwards."""


@dataclass(frozen=True)
class DumpDataset:
    """A dataset of the dump, and WHICH prefixes the publisher actually serves it under."""

    name: str
    has_monthly: bool

    def granularity_for(self, requested: Granularity) -> Granularity:
        """Return `requested`, or refuse when the publisher does not serve that prefix.

        Refusing here rather than at fetch time is the point: `SPEC-001` §5.8 measured that
        `bookDepth` has no `monthly` prefix, so a window that enumerated monthly `bookDepth`
        objects would be a list of guaranteed 404s wearing the shape of work.
        """
        if requested == "monthly" and not self.has_monthly:
            raise UnsupportedGranularityError(
                f"{self.name!r} is not published under the 'monthly' prefix "
                f"(SPEC-001 §5.8, [MEDIDO, CST-5]): an ETL that assumes monthly breaks"
            )
        return requested


AGG_TRADES: Final[DumpDataset] = DumpDataset(name="aggTrades", has_monthly=True)
BOOK_DEPTH: Final[DumpDataset] = DumpDataset(name="bookDepth", has_monthly=False)

# The CLOSED vocabulary of datasets this queue knows how to enumerate. A composition root that
# accepted an arbitrary name would build a plausible URL for a dataset nobody measured, and the
# first evidence of the mistake would be a `404` at 3 a.m. inside a retry loop.
DATASETS_BY_NAME: Final[dict[str, DumpDataset]] = {
    AGG_TRADES.name: AGG_TRADES,
    BOOK_DEPTH.name: BOOK_DEPTH,
}


class UnknownDatasetError(Exception):
    """A dataset name outside the closed vocabulary of `DATASETS_BY_NAME`."""


def dataset_by_name(name: str) -> DumpDataset:
    """Resolve a dataset name, or refuse naming what IS available."""
    dataset = DATASETS_BY_NAME.get(name)
    if dataset is None:
        raise UnknownDatasetError(
            f"{name!r} is not a dataset this queue enumerates; known: {sorted(DATASETS_BY_NAME)}"
        )
    return dataset


@dataclass(frozen=True)
class DumpPartition:
    """One object of the dump: the smallest unit of work the queue knows about.

    `period` is the FIRST day of what the object name declares — the 1st of the month for a
    monthly object, the day itself for a daily one. The declared window is derived from the
    NAME, which is what makes the class-O question ("does the content cover what the name
    promises?") askable at all.
    """

    dataset: DumpDataset
    symbol: str
    granularity: Granularity
    period: date

    @property
    def period_label(self) -> str:
        """Return the date fragment the object name carries: `YYYY-MM` or `YYYY-MM-DD`."""
        if self.granularity == "monthly":
            return f"{self.period:%Y-%m}"
        return f"{self.period:%Y-%m-%d}"

    @property
    def object_name(self) -> str:
        """Return the file name of the object, sidecar excluded."""
        return f"{self.symbol}-{self.dataset.name}-{self.period_label}.zip"

    @property
    def object_key(self) -> str:
        """Return the key inside the bucket — this is also the queue key, and that is on purpose.

        The queue key IS the bucket key, so a checkpoint line is readable by a human against the
        bucket without a translation table. `EtlBacklog` refuses a repeated key, and bucket keys
        are unique by construction, so the two invariants agree instead of needing reconciling.
        """
        return (
            f"{BUCKET_ROOT}/{self.granularity}/{self.dataset.name}/{self.symbol}/{self.object_name}"
        )

    @property
    def url(self) -> str:
        """Return the absolute URL — what `curl -sI` of `SPEC-001` §5.8 is pointed at."""
        return f"{BUCKET_HOST}/{self.object_key}"

    def declared_hours(self) -> float:
        """Return how many hours the object NAME claims to contain.

        This is the denominator of the class-O question. It is computed from the name and never
        from the content, because the whole failure mode is content that disagrees with the name.
        """
        if self.granularity == "daily":
            return 24.0
        return _days_in_month(self.period) * 24.0


def _days_in_month(day: date) -> int:
    """Return the length of the month `day` falls in, without importing a calendar module."""
    first_of_next = (day.replace(day=1) + timedelta(days=31)).replace(day=1)
    return (first_of_next - day.replace(day=1)).days


def _validated_depth(depth_days: int) -> int:
    """Return `depth_days` when it enumerates at least one day, and refuse otherwise."""
    if depth_days < 1:
        raise InvalidDepthError(
            f"depth of {depth_days} day(s) enumerates an empty window; the parameter is a "
            f"count of days back from `end_date`, inclusive, and the default is "
            f"{DEFAULT_DEPTH_DAYS} (`Q18`(d))"
        )
    return depth_days


def enumerate_window(
    dataset: DumpDataset,
    symbol: str,
    end_date: date,
    depth_days: int = DEFAULT_DEPTH_DAYS,
    granularity: Granularity = "daily",
) -> tuple[DumpPartition, ...]:
    """Enumerate the closed window `[end_date - depth_days + 1, end_date]`, oldest first.

    OLDEST FIRST IS THE WORK ORDER, and `EtlBacklog` treats the declared order AS the work
    order, so this choice is load-bearing rather than cosmetic: a queue killed halfway has
    drained the OLD end, which is the end that a bucket with unmeasured retention can take away
    from us. Draining newest-first would spend the run on the objects least likely to disappear.

    A monthly window returns one partition per month TOUCHED by the day range, deduplicated —
    30 days of depth is 1 or 2 monthly objects, not 30.
    """
    span = _validated_depth(depth_days)
    resolved = dataset.granularity_for(granularity)
    days = [end_date - timedelta(days=offset) for offset in reversed(range(span))]
    if resolved == "daily":
        periods = days
    else:
        periods = sorted({day.replace(day=1) for day in days})
    return tuple(
        DumpPartition(dataset=dataset, symbol=symbol, granularity=resolved, period=period)
        for period in periods
    )


def backlog_of(partitions: tuple[DumpPartition, ...]) -> EtlBacklog:
    """Turn an enumerated window into the CLOSED backlog the existing `drain` already consumes.

    This function is the whole reason no second resume mechanism was written. `EtlBacklog` +
    `drain` + `JsonlCheckpoint` already prove "never duplicates, never loses" under a real
    `SIGKILL`; the dump queue is that mechanism pointed at a window this module enumerates.
    Adding a parallel one would mean two answers to "what is still pending", and the day they
    disagree neither is trustworthy.
    """
    return EtlBacklog.of(partition.object_key for partition in partitions)
