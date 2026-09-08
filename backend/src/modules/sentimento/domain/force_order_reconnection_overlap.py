"""ADR-004 B1 — Class-B reconnection overlap is MANDATORY, checked, never only documented."""
#
# `!forceOrder@arr` has no reposição — a gap in it is IRREVERSIBLE (`ADR-004`, "Alternativas
# recusadas"). B1's literal text: "Duas conexões ativas durante a janela de troca, com
# fechamento da antiga DEPOIS de a nova receber a primeira mensagem." This module turns that
# sentence into an invariant a caller cannot violate silently: closing the old connection before
# the new one proved itself alive passes every type check in Python and fails ONLY here.
#
# EMENDA D6 (`ADR-004`, 2026-09-08): "a nova receber a primeira mensagem" is no longer what proves
# the new connection alive. For a SPARSE producer (`forceOrder`, even combined across the whole
# symbol universe) the next domain message can be minutes away, and blocking on it reintroduces
# the exact hang this module exists to prevent. The proof is now "completou o handshake RFC
# 6455" (`new_source.open()` returning without error) — the instant from which Binance is already
# pushing frames on the combined stream, no `SUBSCRIBE` required. `ReconnectionHandoff` is
# renamed accordingly (`new_source_ready_at`, not `new_first_message_at`): the field NAME used to
# assert something the field no longer measures, and a stale name here is exactly the kind of
# silent drift this module was written to make impossible to miss.

from __future__ import annotations

from dataclasses import dataclass


class ReconnectionGapError(ValueError):
    """The old source closed BEFORE the new source was ready — a gap, forbidden by B1."""


@dataclass(frozen=True)
class ReconnectionHandoff:
    """The two instants B1 orders: the new source becoming ready, and the old source's close.

    Both are readings of the SAME clock (whatever the caller's `now` is) — comparing instants
    from two different clocks would make `require_overlap` meaningless, and this type carries no
    slot for a second clock to be smuggled in by accident. "Ready" (Emenda D6) means the new
    source's RFC 6455 handshake completed — no domain message is required, or waited for, here.
    """

    new_source_ready_at: float
    old_source_closed_at: float


def require_overlap(handoff: ReconnectionHandoff) -> None:
    """Raise `ReconnectionGapError` unless the old source outlived the new source becoming ready.

    `old_source_closed_at < new_source_ready_at` is the ONLY shape of violation B1 forbids: the
    old connection closing strictly before the new one proved itself alive (handshake complete,
    Emenda D6) is exactly the "buraco irreversível a cada 24h" `ADR-004` names as the alternative
    this decision refused. Equal instants are ACCEPTED as overlap (an old source closed in the
    same tick the new one became ready has not left a gap), so this is `<`, never `<=`.
    """
    if handoff.old_source_closed_at < handoff.new_source_ready_at:
        raise ReconnectionGapError(
            f"old_source closed at {handoff.old_source_closed_at} before new_source was ready "
            f"(handshake complete) at {handoff.new_source_ready_at} — ADR-004 B1 requires "
            "mandatory overlap, and a gap in !forceOrder@arr is IRREVERSIBLE (no replay)"
        )
