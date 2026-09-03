"""Two OPPOSITE reactions to a payload's field set drifting from the contract (`SPEC-001` §5.5)."""

# ── THE CASE THAT PROVES THE OLD RULE WAS WRONG, AND WHY THIS MODULE EXISTS ────────────────
#
# `ADR-001` measured it: the Binance REST `aggTrade` object carries EIGHT keys,
# `['T','a','f','l','m','nq','p','q']`, but the S3 dump — the contract this ingestor was built
# against — publishes only SEVEN, without `nq`. The day Binance started sending `nq`, a
# fail-closed rule that rejects ANY unrecognized field would have stopped the WHOLE ingestion,
# for a source that got MORE generous, not more sparse. That is `CA-F2-12`'s `[MEDIDO]`, and it
# is the reason `SPEC-001` §5.5 writes two rules instead of one:
#
#     campo ADITIVO desconhecido   ->  quarentena + alarme        (NUNCA parar a ingestao)
#     campo AUSENTE ou RENOMEADO   ->  reprova
#
# THE TWO ARE NOT THE SAME CHECK WITH AN INVERTED RESULT. "Additive" means every field the
# contract EXPECTS is still there, plus something extra the contract never named. "Missing or
# renamed" means at least one field the contract expects is NOT where the contract said it
# would be — whether it vanished outright or reappeared under another key is indistinguishable
# from the payload alone, and `SPEC-001` §5.5 does not ask this module to guess which: both
# collapse to "an expected field is absent", and both reject. This module runs that as TWO
# independent tests over the same two field sets, not one test read backwards.
#
# REJECTION WINS WHEN BOTH FIRE ON THE SAME PAYLOAD. A field renamed from `q` to `quantity`
# makes `q` absent (reject) AND makes `quantity` an unrecognized extra (additive, on its own
# would quarantine) — the SAME EVENT the SPEC calls "renomeado". Checking "is anything expected
# missing" FIRST is what keeps a rename from being misread as a harmless addition: the missing
# name is the only signal a rename leaves behind, and it must not be shadowed by the field that
# took its place.

from __future__ import annotations

from dataclasses import dataclass

from src.modules.sentimento.domain.provenance import Absence


class SchemaChangeRejectedError(Exception):
    """A payload missing a field the contract expects — absent outright, or renamed away.

    `SPEC-001` §5.5's OTHER branch. Raised instead of returning a verdict, so a caller that
    holds a `SchemaChangeVerdict` already knows the payload was never a candidate for
    rejection — the two outcomes do not share a return type on purpose, the same way
    `provenance.InvalidSeriesRowError` is raised rather than folded into a `SeriesRow` field.
    """


@dataclass(frozen=True)
class SchemaChangeVerdict:
    """The classification of one payload's field set against the contract's expected set.

    Only reachable through `classify_schema_change` below, and only for a payload that carries
    every expected field — `unknown_fields` is therefore the complete answer to "what, if
    anything, does this payload carry that the contract never named", with an empty set
    meaning the payload matches the contract exactly.
    """

    expected_fields: frozenset[str]
    received_fields: frozenset[str]

    @property
    def unknown_fields(self) -> frozenset[str]:
        """Fields present in the payload that the contract does not name."""
        return self.received_fields - self.expected_fields

    @property
    def is_additive(self) -> bool:
        """True when the payload carries at least one field the contract never named."""
        return bool(self.unknown_fields)

    @property
    def absence(self) -> Absence | None:
        """`Absence.QUARANTINE` for an additive payload, `None` for an exact match.

        Reuses `provenance.Absence` rather than a second quarantine-destination enum — an
        additively-drifted payload is isolated for the same reason `SPEC-001` §5.2's
        three-term predicate isolates a row: the CONSUMER (`T-04.4`'s `as_of`) is the one that
        must not see it silently, and it already reads `Absence` as its vocabulary of "why".
        """
        return Absence.QUARANTINE if self.is_additive else None

    @property
    def should_alarm(self) -> bool:
        """True exactly when `is_additive` — the predicate this task decides, not the channel.

        `SPEC-001` §5.5 requires "quarentena + alarme" together for the additive case; this
        property is the WHEN. The WHERE the alarm goes is out of scope here (see
        `use_cases/classify_schema_change.py`'s module docstring) — `T-07.11`'s external
        channel is `blocked` on `Q3` as of this task, so there is no channel to call into yet.
        """
        return self.is_additive


def classify_schema_change(
    *, expected_fields: frozenset[str], received_fields: frozenset[str]
) -> SchemaChangeVerdict:
    """Classify a payload's field set against the contract — the two-test predicate itself.

    Order is the enforcement of the module docstring's "rejection wins" rule: the missing-field
    test runs BEFORE the additive one, so a renamed field (missing under its old name, present
    under a new one) is rejected rather than quarantined.

    Raises:
        SchemaChangeRejectedError: at least one field `expected_fields` names is absent from
            `received_fields` — outright missing, or present only under another name.

    """
    missing_fields = expected_fields - received_fields
    if missing_fields:
        raise SchemaChangeRejectedError(
            f"field(s) {sorted(missing_fields)} are expected by the contract but absent from "
            f"the payload — absent outright, or renamed under a different key. `SPEC-001` "
            f"§5.5 rejects this payload rather than accepting it with the field silently gone"
        )
    return SchemaChangeVerdict(expected_fields=expected_fields, received_fields=received_fields)
