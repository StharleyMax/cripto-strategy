"""Drive ADR-004's Class-B reconnection: open the new source, wait, THEN close the old one."""
#
# This is the mechanic B1 describes made executable: `perform_overlap_handoff` opens
# `new_source` and blocks for its first message BEFORE calling `old_source.close()` — the
# ordering itself is what guarantees the overlap, not a comment promising it. `require_overlap`
# (domain) then checks the two instants this function recorded, so a future change to this
# ordering fails the invariant instead of only failing to be noticed.
#
# `reconnect_and_key` composes that handoff with the B2 natural key
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


@dataclass(frozen=True)
class OverlapHandoffRecord:
    """What one B1 handoff produced: the checked instants, plus the new source's first message."""

    handoff: ReconnectionHandoff
    first_new_message: str


def perform_overlap_handoff(
    old_source: MessageSource,
    new_source: MessageSource,
    now: Callable[[], float],
) -> OverlapHandoffRecord:
    """Open `new_source`, read its first message, THEN close `old_source` — never the reverse.

    This is B1's ordering as code: `old_source.close()` is not called until AFTER
    `new_source`'s first message has been read, so there is no line in this function where a
    caller could observe the old channel gone while the new one has not yet proven itself. The
    two timestamps recorded are handed to `require_overlap`, which raises if they are ever
    inverted by a future edit here.

    `old_source` is expected to already be open (it is the connection the caller was reading
    before deciding to reconnect); this function only closes it, it never opens it.
    """
    new_source.open()
    first_new_message = next(new_source.messages())
    new_first_message_at = now()
    old_source.close()
    old_source_closed_at = now()
    handoff = ReconnectionHandoff(
        new_first_message_at=new_first_message_at,
        old_source_closed_at=old_source_closed_at,
    )
    require_overlap(handoff)
    return OverlapHandoffRecord(handoff=handoff, first_new_message=first_new_message)


@dataclass(frozen=True)
class ReconnectAndKeyOutcome:
    """One handoff's yield: the B1 record, the B2 observations, and what could not be keyed."""

    handoff_record: OverlapHandoffRecord
    observations: tuple[ForceOrderKeyObservation, ...]
    unkeyable_raw: tuple[str, ...]


def reconnect_and_key(
    old_source: MessageSource,
    new_source: MessageSource,
    overlap_window_tail: Sequence[str],
    now: Callable[[], float],
) -> ReconnectAndKeyOutcome:
    """Run the B1 handoff, then key every raw message the overlap window carried, for B3.

    `overlap_window_tail` is the OLD connection's messages that arrived during the overlap
    window, BEFORE this call — the caller's read loop is what knows which raw lines those were
    (this function only performs the handoff and the keying, it does not track a live read
    loop: that belongs to a future continuous daemon, out of `T-03.3`'s scope per the handoff).
    The new source's first message (read by `perform_overlap_handoff`) is appended automatically.

    A message that fails to key (`ForceOrderKeyExtractionError`) is logged and counted in
    `unkeyable_raw`, never silently dropped — B3's published rate must be able to say how many
    raw lines it could not even attempt to dedupe.
    """
    handoff_record = perform_overlap_handoff(old_source, new_source, now)
    observations: list[ForceOrderKeyObservation] = []
    unkeyable: list[str] = []
    for raw in (*overlap_window_tail, handoff_record.first_new_message):
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
        handoff_record=handoff_record,
        observations=tuple(observations),
        unkeyable_raw=tuple(unkeyable),
    )
