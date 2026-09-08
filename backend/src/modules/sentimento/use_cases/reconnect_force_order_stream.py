"""Drive ADR-004's Class-B reconnection: open the new source, THEN close the old one."""
#
# This is the mechanic B1 describes made executable: `perform_overlap_handoff` opens
# `new_source` BEFORE calling `old_source.close()` — the ordering itself is what guarantees the
# overlap, not a comment promising it. `require_overlap` (domain) then checks the two instants
# this function recorded, so a future change to this ordering fails the invariant instead of only
# failing to be noticed.
#
# EMENDA D6 (`ADR-004`, 2026-09-08): this function used to BLOCK on `next(new_source.messages())`
# before closing the old one — "the new connection proved itself" meant "it delivered a domain
# message". For a sparse producer (`forceOrder`, even combined across the whole symbol universe)
# that message can be minutes away, and blocking on it reintroduced the exact hang this module
# exists to prevent — for BOTH causes of reconnection, the `StopIteration` this module always
# handled and the new idle-silence timeout `ADR-004` D5 adds. The proof is now the handshake
# completing (`new_source.open()` returning without error); see
# `force_order_reconnection_overlap.py`'s own D6 note for why `ReconnectionHandoff`'s field was
# renamed to match. One consequence: the new source's first message is no longer captured here —
# it is read by the caller's own loop, through the SAME path as any other message
# (`collectors_cli.py`'s `_publish_raw_force_order_message`), so `reconnect_and_key` below no
# longer keys a "first message" separately from `overlap_window_tail`.
#
# `reconnect_and_key` composes the handoff with the B2 natural key
# (`force_order_natural_key.py`) so the messages the overlap window carried are ready for B3's
# `count_daily_collisions` (`force_order_collision_accounting.py`) without a caller having to
# wire the three together by hand. What this module does NOT do, by design (`T-03.3` handoff,
# "não construa a integração com `aggTrade` aqui"): it names nothing about Class A (`aggTrade`'s
# `agg_id` reconnection) — Class A sequence-based reconnection is a separate future task, and
# nothing here presumes its shape.

from __future__ import annotations

import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from src.modules.sentimento.domain.force_order_collision_accounting import ForceOrderKeyObservation
from src.modules.sentimento.domain.force_order_natural_key import (
    ForceOrderKeyExtractionError,
    extract_force_order_natural_key,
    trade_time_utc_date,
)
from src.modules.sentimento.domain.force_order_reconnection_overlap import (
    ReconnectionHandoff,
    require_overlap,
)
from src.modules.sentimento.use_cases.probe_stream_quantity_fields import MessageSource

logger = logging.getLogger(__name__)


def perform_overlap_handoff(
    old_source: MessageSource,
    new_source: MessageSource,
    now: Callable[[], float],
) -> ReconnectionHandoff:
    """Open `new_source` (handshake only), THEN close `old_source` — never the reverse.

    This is B1's ordering as code, under Emenda D6: `old_source.close()` is not called until
    AFTER `new_source.open()` has returned, so there is no line in this function where a caller
    could observe the old channel gone while the new one has not yet proven itself. This function
    never calls `new_source.messages()` — reading the first message is the caller's job, through
    its normal read loop, exactly like every message after it. The two timestamps recorded are
    handed to `require_overlap`, which raises if they are ever inverted by a future edit here.

    `old_source` is expected to already be open (it is the connection the caller was reading
    before deciding to reconnect); this function only closes it, it never opens it.
    """
    new_source.open()
    new_source_ready_at = now()
    old_source.close()
    old_source_closed_at = now()
    handoff = ReconnectionHandoff(
        new_source_ready_at=new_source_ready_at,
        old_source_closed_at=old_source_closed_at,
    )
    require_overlap(handoff)
    return handoff


@dataclass(frozen=True)
class ReconnectAndKeyOutcome:
    """One handoff's yield: the B1 handoff, the B2 observations, and what could not be keyed."""

    handoff: ReconnectionHandoff
    observations: tuple[ForceOrderKeyObservation, ...]
    unkeyable_raw: tuple[str, ...]


def reconnect_and_key(
    old_source: MessageSource,
    new_source: MessageSource,
    overlap_window_tail: Sequence[str],
    now: Callable[[], float],
) -> ReconnectAndKeyOutcome:
    """Run the B1 handoff, then key every raw message `overlap_window_tail` carried, for B3.

    `overlap_window_tail` is the OLD connection's messages that arrived during the overlap
    window, BEFORE this call — the caller's read loop is what knows which raw lines those were
    (this function only performs the handoff and the keying, it does not track a live read
    loop: that belongs to a future continuous daemon, out of `T-03.3`'s scope per the handoff).
    Since Emenda D6, the new source's first message is NOT included here — `perform_overlap_handoff`
    no longer reads it, so there is nothing of the new connection's to key yet; the caller's own
    loop will read and key it through the ordinary per-message path the next time it calls
    `next()`, collapsing what used to be two separate keying paths into one.

    A message that fails to key (`ForceOrderKeyExtractionError`) is logged and counted in
    `unkeyable_raw`, never silently dropped — B3's published rate must be able to say how many
    raw lines it could not even attempt to dedupe.
    """
    handoff = perform_overlap_handoff(old_source, new_source, now)
    observations: list[ForceOrderKeyObservation] = []
    unkeyable: list[str] = []
    for raw in overlap_window_tail:
        try:
            key = extract_force_order_natural_key(raw)
        except ForceOrderKeyExtractionError:
            logger.warning("mensagem sem chave natural B2 durante o overlap: %.120s", raw)
            unkeyable.append(raw)
            continue
        observations.append(
            ForceOrderKeyObservation(key=key, day=trade_time_utc_date(key.trade_time))
        )
    return ReconnectAndKeyOutcome(
        handoff=handoff,
        observations=tuple(observations),
        unkeyable_raw=tuple(unkeyable),
    )
