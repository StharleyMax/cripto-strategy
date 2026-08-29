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

# ── O QUE ESTE MODULO E, E O QUE ELE EXPLICITAMENTE NAO E ─────────────────────────────────────
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
# ── A REGRA QUE FALTAVA, E ELA NAO E O `404` ──────────────────────────────────────────────────
#
# `ADR-014` (status **proposto**), achado `A7`, MEASURED with `n = 3 simbolos x 3 meses = 9`
# requisicoes `HEAD`:
#
#     BTCUSDT 2024-03 200 6712517585 | 2024-04 200   37761761 | 2024-05 404
#     ETHUSDT 2024-03 200 5384737931 | 2024-04 200   31343866 | 2024-05 404
#     SOLUSDT 2024-03 200 3952724227 | 2024-04 200   24390426 | 2024-05 404
#
# => **o `curl -sI` mensal pega o `404` de maio e NAO pega o abril parcial** — e abril parcial e o
# mes em que os dados existem pela metade, que e o que envenena a serie. **O ultimo periodo antes
# de um `404` e sistematicamente suspeito**, e essa e a regra que faltava.
#
# The April object is not corrupt. Its `.CHECKSUM` published by the vendor **CONFERE**
# (`sha256sum -c` -> `rc=0`), `unzip -t` says *"No errors detected"*, `content-length` matches the
# bytes received, and every timestamp inside it IS inside April. It covers **0,942 %** of the month
# its own name declares `[MEDIDO 2026-08-29, ADR-014, n = 1 objeto de 37.761.761 B baixado e
# hasheado]`. Five gates pass over it. **Only the coverage of the declared window bites, and it is
# none of the five.**
#
# That is the difference between the two classes of failure, and it decides what this module can
# and cannot promise:
#
# | classe | o que aconteceu | quem testemunha |
# |---|---|---|
# | **T · transporte** | os bytes se perderam ENTRE o publicador e nos | qualquer digest do
#   publicador: `.CHECKSUM`, `content-length`, o zip |
# | **O · origem** | o objeto do publicador JA E CURTO | **nenhuma testemunha de classe T** — todas
#   sao computadas sobre o mesmo objeto curto |
#
# `.CHECKSUM` is a class-T witness. `SPEC-001` §5.8 infers *"dai `G1` (verificacao de `.CHECKSUM`)
# ser obrigatoria na ingestao"* FROM a class-O case. **The conclusion survives; the premise is a
# non sequitur** (`ADR-014`, achado `A1`). This module is the class-O half, at the only resolution
# `HEAD` can reach: the WINDOW, not the body.
#
# ── O VOCABULARIO E PROPRIO, E ISSO E DELIBERADO ──────────────────────────────────────────────
#
# These findings are NOT `verdict` values. `verdict` is the closed set of `md.ingest_run`, the SPEC
# is its owner (`ADR-014/D2a`), and `ADR-014` is **proposto** — writing `ACCEPTED_WITH_WARNING`
# here would be adopting an unratified enumeration and would put a second writer on a vocabulary
# this task does not own. When `ADR-014` is accepted, the mapping is one function and it has a
# home; today the finding is reported under its own name and nothing is silently equated.

# The object is there and nothing about the window says otherwise.
PRESENT: Final[str] = "PRESENT"
# `404`: honest failure. `SPEC-001` §5.9-adjacent vocabulary calls this `SEM_FONTE` downstream;
# here it is only "the bucket no longer serves it".
ABSENT: Final[str] = "ABSENT"
# `200`, and the NEXT period is `ABSENT`. This is achado `A7`: the last period before a `404` is
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
    """Classify a run of outcomes for ONE series, ordered oldest to newest.

    The order is the contract, and it is not cosmetic: `SUSPECT_LAST_BEFORE_ABSENT` is a
    statement about a NEIGHBOUR, so it cannot be decided one outcome at a time. Handed a
    shuffled sequence this function would answer confidently and wrongly, which is why the
    caller's ordering obligation is written here and asserted by a test.

    Only the immediate successor is consulted. A gap further along the sequence says nothing
    about this period, and widening the rule would manufacture suspicion that achado `A7` does
    not support — `A7` is about the discontinuation boundary, and the boundary is one step wide.
    """
    findings: list[RetentionFinding] = []
    for index, outcome in enumerate(outcomes):
        successor = outcomes[index + 1] if index + 1 < len(outcomes) else None
        findings.append(_classify_one(outcome, successor))
    return tuple(findings)


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
