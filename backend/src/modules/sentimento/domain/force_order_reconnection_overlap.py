"""ADR-004 B1 — Class-B reconnection overlap is MANDATORY, checked, never only documented."""
#
# `!forceOrder@arr` has no reposição — a gap in it is IRREVERSIBLE (`ADR-004`, "Alternativas
# recusadas"). B1's literal text: "Duas conexões ativas durante a janela de troca, com
# fechamento da antiga DEPOIS de a nova receber a primeira mensagem." This module turns that
# sentence into an invariant a caller cannot violate silently: closing the old connection before
# the new one proved itself alive passes every type check in Python and fails ONLY here.

from __future__ import annotations

from dataclasses import dataclass


class ReconnectionGapError(ValueError):
    """The old source closed BEFORE the new source's first message — a gap, forbidden by B1."""


@dataclass(frozen=True)
class ReconnectionHandoff:
    """The two instants B1 orders: the new source's first message, and the old source's close.

    Both are readings of the SAME clock (whatever the caller's `now` is) — comparing instants
    from two different clocks would make `require_overlap` meaningless, and this type carries no
    slot for a second clock to be smuggled in by accident.
    """

    new_first_message_at: float
    old_source_closed_at: float


def require_overlap(handoff: ReconnectionHandoff) -> None:
    """Raise `ReconnectionGapError` unless the old source outlived the new source's first message.

    `old_source_closed_at < new_first_message_at` is the ONLY shape of violation B1 forbids: the
    old connection closing strictly before the new one proved itself alive is exactly the "buraco
    irreversível a cada 24h" `ADR-004` names as the alternative this decision refused. Equal
    instants are ACCEPTED as overlap (an old source closed in the same tick the new one delivered
    its first message has not left a gap), so this is `<`, never `<=`.
    """
    if handoff.old_source_closed_at < handoff.new_first_message_at:
        raise ReconnectionGapError(
            f"old_source closed at {handoff.old_source_closed_at} before new_source's first "
            f"message at {handoff.new_first_message_at} — ADR-004 B1 requires mandatory "
            "overlap, and a gap in !forceOrder@arr is IRREVERSIBLE (no replay)"
        )
