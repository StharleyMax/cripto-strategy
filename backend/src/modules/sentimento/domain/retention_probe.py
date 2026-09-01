"""The monthly `curl -sI` of `SPEC-001` §5.8, and the rule that the `404` alone does not give."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Final

from src.modules.sentimento.domain.dump_window import (
    AGG_TRADES,
    BOOK_DEPTH,
    DumpDataset,
    DumpPartition,
    Granularity,
)

# ── WHAT THIS MODULE IS, AND WHAT IT EXPLICITLY IS NOT ───────────────────────────────────────
#
# `SPEC-001` §5.8 fixes the contract: the dump is *"re-baixavel (retencao do balde NAO MEDIDA)"*,
# **never "infinito"**, and the mandated mitigation is a monthly `curl -sI` on an OLD prefix AND a
# RECENT one, for `aggTrades` and `bookDepth`. That probe is **mitigation of BUCKET RETENTION, not
# of body integrity** — it answers *"is the object still there?"*, never *"is the object right?"*.
#
# This module does the two halves that are decidable OFFLINE: it ENUMERATES what to probe, and it
# CLASSIFIES what came back. The `curl` itself is network and lives with whoever runs the cron;
# `infra/head_probe_log.py` parses its output. Nothing here opens a socket, so the classification
# is testable without one — which is why the suite of this repository stays offline.
#
# ── THE RULE THAT WAS MISSING, AND IT IS NOT THE `404` ───────────────────────────────────────
#
# `ADR-014` (status **proposed**), finding `A7`, MEASURED with `n = 3 symbols x 3 months = 9`
# `HEAD` requests:
#
#     BTCUSDT 2024-03 200 6712517585 | 2024-04 200   37761761 | 2024-05 404
#     ETHUSDT 2024-03 200 5384737931 | 2024-04 200   31343866 | 2024-05 404
#     SOLUSDT 2024-03 200 3952724227 | 2024-04 200   24390426 | 2024-05 404
#
# => **the monthly `curl -sI` catches May's `404` and does NOT catch the partial April** — and the
# partial April is the month whose data exists by halves, which is what poisons the series.
# **The last period before a `404` is systematically suspect**, and that is the rule that was
# missing.
#
# The April object is not corrupt. Its `.CHECKSUM` published by the vendor **CONFERE**
# (`sha256sum -c` -> `rc=0`), `unzip -t` says *"No errors detected"*, `content-length` matches the
# bytes received, and every timestamp inside it IS inside April. It covers **0,942 %** of the month
# its own name declares `[MEDIDO 2026-08-29, ADR-014, n = 1 object of 37,761,761 B actually
# downloaded and hashed]`. Five gates pass over it. **Only the coverage of the declared window
# bites, and it is
# none of the five.**
#
# That is the difference between the two classes of failure, and it decides what this module can
# and cannot promise:
#
# | class | what happened | who witnesses it |
# |---|---|---|
# | **T · transport** | the bytes were lost BETWEEN the publisher and us | any digest computed by
#   the publisher: `.CHECKSUM`, `content-length`, the zip |
# | **O · origin** | the publisher's object IS ALREADY SHORT | **no class-T witness** — all of them
#   are computed over the same short object, so they agree with each other and are wrong together |
#
# `.CHECKSUM` is a class-T witness. `SPEC-001` §5.8 infers *"dai `G1` (verificacao de `.CHECKSUM`)
# ser obrigatoria na ingestao"* FROM a class-O case. **The conclusion survives; the premise is a
# non sequitur** (`ADR-014`, finding `A1`). This module is the class-O half, at the only resolution
# `HEAD` can reach: the WINDOW, not the body.
#
# ── THE VOCABULARY IS THIS MODULE'S OWN, AND THAT IS DELIBERATE ──────────────────────────────
#
# These findings are NOT `verdict` values. `verdict` is the closed set of `md.ingest_run`, the SPEC
# is its owner (`ADR-014/D2a`), and `ADR-014` is **proposed** — writing `ACCEPTED_WITH_WARNING`
# here would be adopting an unratified enumeration and would put a second writer on a vocabulary
# this task does not own. When `ADR-014` is accepted, the mapping is one function and it has a
# home; today the finding is reported under its own name and nothing is silently equated.

# The object is there and nothing about the window says otherwise.
PRESENT: Final[str] = "PRESENT"
# `404`: honest failure. The vocabulary adjacent to `SPEC-001` §5.9 calls this `SEM_FONTE`
# downstream (a contract term, kept verbatim);
# here it is only "the bucket no longer serves it".
ABSENT: Final[str] = "ABSENT"
# `200`, and the NEXT period is `ABSENT`. This is finding `A7`: the last period before a `404` is
# where a dataset was discontinued MID-PERIOD, so the object exists, verifies, and is short.
SUSPECT_LAST_BEFORE_ABSENT: Final[str] = "SUSPECT_LAST_BEFORE_ABSENT"

HTTP_NOT_FOUND: Final[int] = 404

RETENTION_FINDINGS: Final[frozenset[str]] = frozenset({PRESENT, ABSENT, SUSPECT_LAST_BEFORE_ABSENT})

# The findings that mean "ingest it, but never in silence". Enumerated as a set rather than
# tested with `startswith("SUSPECT")`, because a prefix test is a search method that decides
# membership by spelling: renaming a member to `LIKELY_SHORT` would silently empty this set and
# the queue would go quiet without a single test failing.
SUSPECT_FINDINGS: Final[frozenset[str]] = frozenset({SUSPECT_LAST_BEFORE_ABSENT})

# The granularity each dataset is probed at, and it is NOT the same for the two. `aggTrades` is
# probed monthly because it is published monthly; `bookDepth` has no `monthly` prefix at all
# `[MEDIDO, SPEC-001 §5.8]`, so probing it "monthly" would be probing objects that cannot exist.
# The item in the plan says *"`curl -sI` MENSAL"* and that word is the CADENCE of the probe, not
# the granularity of the object — conflating the two is exactly the break §5.8 warns about.
PROBE_GRANULARITY: Final[dict[str, Granularity]] = {
    AGG_TRADES.name: "monthly",
    BOOK_DEPTH.name: "daily",
}

PROBED_DATASETS: Final[tuple[DumpDataset, ...]] = (AGG_TRADES, BOOK_DEPTH)


class UnknownProbeDatasetError(Exception):
    """A dataset with no declared probe granularity — refusing beats guessing `monthly`."""


@dataclass(frozen=True)
class ProbeOutcome:
    """What one `curl -sI` returned about one partition. `content_length` is `None` on a `404`."""

    partition: DumpPartition
    status: int
    content_length: int | None


@dataclass(frozen=True)
class RetentionFinding:
    """One partition classified, with the reason written so a log line explains itself."""

    partition: DumpPartition
    finding: str
    reason: str


def probe_targets(
    symbol: str,
    old_period: date,
    recent_period: date,
    datasets: tuple[DumpDataset, ...] = PROBED_DATASETS,
) -> tuple[DumpPartition, ...]:
    """Enumerate the OLD-prefix and RECENT-prefix partitions §5.8 mandates, per dataset.

    Two periods per dataset, because the two answer different questions: the OLD one asks *"has
    the bucket started deleting?"* and the RECENT one asks *"is the publisher still writing?"*.
    A probe of only one of them discovers the loss in two years instead of in one month, which
    is the entire argument §5.8 makes for the probe being *"ridiculamente barata"*.
    """
    targets: list[DumpPartition] = []
    for dataset in datasets:
        granularity = PROBE_GRANULARITY.get(dataset.name)
        if granularity is None:
            raise UnknownProbeDatasetError(
                f"{dataset.name!r} has no declared probe granularity; defaulting to 'monthly' "
                f"is the break SPEC-001 §5.8 measured on `bookDepth`"
            )
        for period in (old_period, recent_period):
            targets.append(
                DumpPartition(
                    dataset=dataset,
                    symbol=symbol,
                    granularity=dataset.granularity_for(granularity),
                    period=period,
                )
            )
    return tuple(targets)


def classify(outcomes: tuple[ProbeOutcome, ...]) -> tuple[RetentionFinding, ...]:
    """Classify a run of outcomes for ONE series. ADJACENCY IS BY CALENDAR, never by position.

    ⚠️ THIS IS THE CORRECTION OF A DEFECT `/qa` MEASURED 2026-08-29, and the old shape is worth
    recording because each half of it was correct on its own. This function used to read
    `outcomes[index + 1]` as *the* successor while `outcomes_for` SKIPS any partition nobody
    probed. Composed, a hole in the probe log made **2024-03 the neighbour of 2024-06** and
    produced a `SUSPECT` with 2024-04 and 2024-05 healthy and present — while this very docstring
    claimed *"the boundary is one step wide"*. It was one ROW wide, and a row is an accident of
    which lines the cron happened to write.

    Now the successor is `partition.successor()` — the calendar one — looked up in the probed
    set. **A period whose calendar successor was never probed is NOT suspect**, and it is not
    `PRESENT`-with-a-clean-bill either: the reason string says the successor was not probed, so
    the finding carries what it does and does not know.

    The caller no longer owes this function an ordering. That obligation was real and it was a
    trap, so it was removed rather than documented harder.
    """
    probed = {outcome.partition: outcome for outcome in outcomes}
    return tuple(
        _classify_one(outcome, probed.get(outcome.partition.successor())) for outcome in outcomes
    )


def _classify_one(outcome: ProbeOutcome, successor: ProbeOutcome | None) -> RetentionFinding:
    """Classify a single outcome given the one that follows it, or `None` at the newest end."""
    label = outcome.partition.period_label
    if outcome.status == HTTP_NOT_FOUND:
        return RetentionFinding(
            partition=outcome.partition,
            finding=ABSENT,
            reason=f"{label}: 404 — the bucket no longer serves this object",
        )
    if successor is not None and successor.status == HTTP_NOT_FOUND:
        return RetentionFinding(
            partition=outcome.partition,
            finding=SUSPECT_LAST_BEFORE_ABSENT,
            reason=(
                f"{label}: 200, and {successor.partition.period_label} is 404 — the last period "
                f"before a 404 is where the dataset was discontinued MID-PERIOD. The object "
                f"verifies and is still short (ADR-014/A7, [MEDIDO])"
            ),
        )
    if successor is None:
        return RetentionFinding(
            partition=outcome.partition,
            finding=PRESENT,
            reason=(
                f"{label}: {outcome.status} — present. The calendar successor "
                f"({outcome.partition.successor().period_label}) was NOT probed, so the `A7` "
                f"boundary could not be evaluated here: this is absence of evidence, not "
                f"evidence of health"
            ),
        )
    return RetentionFinding(
        partition=outcome.partition,
        finding=PRESENT,
        reason=f"{label}: {outcome.status} — present, and the next period is not missing",
    )


def size_ratio_alarm(
    subject: ProbeOutcome,
    neighbour: ProbeOutcome,
) -> float | None:
    """Return `neighbour / subject` as an ALARM, or `None` when either length is unusable.

    ACCEPTED AS AN ALARM, REFUSED AS `n_missing`, and the refusal is measured rather than
    cautious: on the 2024-04 case the size ratio against the neighbouring month is **177,8x**
    while the real temporal deficit is **106,2x** (720 / 6,781) `[MEDIDO, ADR-014/D3d]`.
    Compression and market activity vary between periods, so the ratio gives an ORDER OF
    MAGNITUDE and does not give the number. Returning it as a float and naming the function
    `alarm` is the whole guard: nothing downstream can mistake it for a count of missing hours.
    """
    if not subject.content_length or not neighbour.content_length:
        return None
    return neighbour.content_length / subject.content_length


def probe_targets_for_window(
    partitions: tuple[DumpPartition, ...],
) -> tuple[DumpPartition, ...]:
    """Return what an operator must `curl -sI` for P2 to have anything to say about THIS drain.

    ⚠️ THIS FUNCTION EXISTS BECAUSE `/qa` MEASURED THAT P2 WAS STRUCTURALLY SILENT. The two
    probe questions had been conflated, and they are not the same question:

    | function | question it answers | targets |
    |---|---|---|
    | `probe_targets` | **bucket retention** — *is the old object still there?* | 1 old + 1 recent
    per dataset |
    | `probe_targets_for_window` | **class O** — *is what I am about to ingest short?* | the whole
    window + the successor of the newest |

    Measured: `probe_targets` against the queue's declared default window is **4 targets against
    30 partitions, intersection = 0** `[MEDIDO 2026-08-29 by the /qa]` — so on a default run there
    was no
    observation to classify and P2 never spoke. Retention monitoring cannot double as the
    class-O witness of a specific drain, and asking it to was the design error.

    **The successor of the newest partition is included and it is the whole point of `A7`:** an
    operator backfilling *up to the last month that exists* is doing the ordinary thing, and the
    `404` that convicts that last month sits one period OUTSIDE the window.
    """
    if not partitions:
        return ()
    return (*partitions, partitions[-1].successor())
