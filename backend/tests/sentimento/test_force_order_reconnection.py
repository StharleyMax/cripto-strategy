"""Offline bench for `T-03.3`: ADR-004's Class-B reconnection policy for `!forceOrder@arr`.

ZERO REDE, like the rest of this suite (`backend/scripts/test.sh`). `D3.6` states plainly that
the real universe (`>= 30` days, `>= 20` symbols) "não é medível em regime real hoje": this bench
proves the MECHANICS instead — natural-key extraction (B2), the collision counter's direction
(B3, "subcontagem, nunca supercontagem"), and the overlap ordering (B1) — against a SIMULATED
reconnection with a KNOWN overlap, so the day real evidence exists, publishing it is this same
code, unchanged.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

import pytest

from src.modules.sentimento.domain.force_order_collision_accounting import (
    COLLISION_BIAS_DIRECTION,
    D3_6_REQUIRED_DAYS,
    D3_6_REQUIRED_SYMBOLS,
    DailyCollisionCount,
    ForceOrderKeyObservation,
    count_daily_collisions,
    d3_6_universe_met,
)
from src.modules.sentimento.domain.force_order_envelope import ForceOrderEnvelope
from src.modules.sentimento.domain.force_order_natural_key import (
    ForceOrderKeyExtractionError,
    ForceOrderNaturalKey,
    extract_force_order_natural_key,
    trade_time_utc_date,
)
from src.modules.sentimento.domain.force_order_reconnection_overlap import (
    ReconnectionGapError,
    ReconnectionHandoff,
    require_overlap,
)
from src.modules.sentimento.infra.force_order_collision_report_cli import (
    MalformedEvidenceLineError,
    _report_lines,
    _summary,
    build_parser,
    main,
    run,
)
from src.modules.sentimento.use_cases.reconnect_force_order_stream import (
    perform_overlap_handoff,
    reconnect_and_key,
)

# ── Raw !forceOrder@arr frames, ADR-004 B2's five fields plus noise the key must IGNORE ──────
# `T=0` -> UTC day "1970-01-01"; `T=86_400_000` (one day later) -> "1970-01-02".
FRAME_A = (
    '{"e":"forceOrder","E":0,"o":{"s":"BTCUSDT","S":"SELL","o":"LIMIT","f":"IOC","q":"0.010",'
    '"p":"78000.00","ap":"78006.30","X":"FILLED","l":"0.010","z":"0.010","T":0}}'
)
# Same B2 key as FRAME_A (symbol/side/price/orig_qty/trade_time), but `ap`/`z`/`X` differ — the
# shape a genuine overlap-delivered duplicate would take: same order, re-served by a second
# connection, not necessarily byte-identical.
FRAME_A_DUP = (
    '{"e":"forceOrder","E":1,"o":{"s":"BTCUSDT","S":"SELL","o":"LIMIT","f":"GTC","q":"0.010",'
    '"p":"78000.00","ap":"77999.90","X":"NEW","l":"0.000","z":"0.000","T":0}}'
)
FRAME_B = (
    '{"e":"forceOrder","E":86400000,"o":{"s":"BTCUSDT","S":"BUY","o":"LIMIT","f":"IOC",'
    '"q":"1.000","p":"3000.00","ap":"3000.00","X":"FILLED","l":"1.000","z":"1.000",'
    '"T":86400000}}'
)
# Same symbol/day as FRAME_A (`T=1_000` is still "1970-01-01"), but a GENUINELY DISTINCT order.
FRAME_A_LATER_SAME_DAY = (
    '{"e":"forceOrder","E":1000,"o":{"s":"BTCUSDT","S":"SELL","o":"LIMIT","f":"IOC","q":"0.020",'
    '"p":"78500.00","ap":"78500.00","X":"FILLED","l":"0.020","z":"0.020","T":1000}}'
)
# Differs from FRAME_A in EXACTLY ONE B2 field: `side` (`SELL` -> `BUY`). Everything else that
# feeds the key — `symbol`, `price`, `orig_qty`, `trade_time` — is byte-identical to FRAME_A.
FRAME_A_SIDE_FLIPPED = (
    '{"e":"forceOrder","E":0,"o":{"s":"BTCUSDT","S":"BUY","o":"LIMIT","f":"IOC","q":"0.010",'
    '"p":"78000.00","ap":"78006.30","X":"FILLED","l":"0.010","z":"0.010","T":0}}'
)
# Differs from FRAME_A in EXACTLY ONE B2 field: `trade_time` (`0` -> `1`). `symbol`, `side`,
# `price`, `orig_qty` are byte-identical to FRAME_A. `T=1` is still UTC day "1970-01-01", so a
# bucket split here could only come from the KEY, never from `day`.
FRAME_A_TRADE_TIME_SHIFTED = (
    '{"e":"forceOrder","E":1,"o":{"s":"BTCUSDT","S":"SELL","o":"LIMIT","f":"IOC","q":"0.010",'
    '"p":"78000.00","ap":"78006.30","X":"FILLED","l":"0.010","z":"0.010","T":1}}'
)
FRAME_C = (
    '{"e":"forceOrder","E":0,"o":{"s":"ETHUSDT","S":"SELL","o":"LIMIT","f":"IOC","q":"2.500",'
    '"p":"3500.00","ap":"3500.00","X":"FILLED","l":"2.500","z":"2.500","T":0}}'
)
NOT_JSON = "isto nao e json"
MISSING_ORDER_OBJECT = '{"e":"forceOrder","E":0}'


class FakeSource:
    """A `MessageSource` that replays scripted frames and records the events it takes part in."""

    def __init__(self, frames: list[str], events: list[str] | None = None, name: str = "") -> None:
        """Script the frames to replay, plus a shared `events` log and this source's `name`."""
        self._frames = frames
        self._events = events if events is not None else []
        self._name = name
        self.closed = False

    def open(self) -> None:
        """Record that this source was opened."""
        self._events.append(f"{self._name}_opened")

    def close(self) -> None:
        """Record that this source was closed."""
        self.closed = True
        self._events.append(f"{self._name}_closed")

    def messages(self) -> Iterator[str]:
        """Replay the scripted frames, recording each read."""
        for frame in self._frames:
            self._events.append(f"{self._name}_message_read")
            yield frame


# ══════════════════════════════ Domain: B2 natural key extraction ══════════════════════════════


def test_extract_reads_the_five_declared_fields() -> None:
    """The key holds exactly `(symbol, side, price, orig_qty, trade_time)`, nothing else."""
    key = extract_force_order_natural_key(FRAME_A)
    assert key == ForceOrderNaturalKey(
        symbol="BTCUSDT", side="SELL", price="78000.00", orig_qty="0.010", trade_time=0
    )


def test_extract_ignores_fields_outside_the_declared_five() -> None:
    """Two frames differing only in `ap`/`z`/`X`/`f`/`o`/`E` produce the IDENTICAL key.

    This is the structural proof that the key is EXACTLY B2's five fields — if any noise field
    leaked in, this equality would fail and every genuine overlap duplicate would be missed.
    """
    assert extract_force_order_natural_key(FRAME_A) == extract_force_order_natural_key(FRAME_A_DUP)


def test_side_alone_discriminates_the_key() -> None:
    """`side` is not decorative: flipping ONLY it must change the key and refuse to collide.

    `/qa`'s M4 mutation (`side="SELL"` hardcoded) makes this fail on BOTH assertions: the two
    keys become equal, and the two observations collapse into one bucket with `collisions=1`
    instead of the two independent events they are.
    """
    key_a = extract_force_order_natural_key(FRAME_A)
    key_flipped = extract_force_order_natural_key(FRAME_A_SIDE_FLIPPED)
    assert key_a.side == "SELL"
    assert key_flipped.side == "BUY"
    assert key_a != key_flipped

    counts = count_daily_collisions(
        [
            ForceOrderKeyObservation(key=key_a, day="1970-01-01"),
            ForceOrderKeyObservation(key=key_flipped, day="1970-01-01"),
        ]
    )
    assert counts == (
        DailyCollisionCount(symbol="BTCUSDT", day="1970-01-01", total_events=2, collisions=0),
    )


def test_trade_time_alone_discriminates_the_key() -> None:
    """`trade_time` is not decorative: flipping ONLY it must change the key and refuse to collide.

    `/qa`'s M3 mutation (`trade_time=0` hardcoded) makes this fail on BOTH assertions: the two
    keys become equal, and the two observations collapse into one bucket with `collisions=1`
    instead of the two independent events they are — even though both land on the SAME UTC day,
    so a bucket split here can only come from the key, never from `day`.
    """
    key_a = extract_force_order_natural_key(FRAME_A)
    key_shifted = extract_force_order_natural_key(FRAME_A_TRADE_TIME_SHIFTED)
    assert key_a.trade_time == 0
    assert key_shifted.trade_time == 1
    assert key_a != key_shifted

    day_a = trade_time_utc_date(key_a.trade_time)
    day_shifted = trade_time_utc_date(key_shifted.trade_time)
    assert day_a == day_shifted == "1970-01-01"

    counts = count_daily_collisions(
        [
            ForceOrderKeyObservation(key=key_a, day=day_a),
            ForceOrderKeyObservation(key=key_shifted, day=day_shifted),
        ]
    )
    assert counts == (
        DailyCollisionCount(symbol="BTCUSDT", day="1970-01-01", total_events=2, collisions=0),
    )


@pytest.mark.parametrize("raw", [NOT_JSON, MISSING_ORDER_OBJECT, "{}", '{"o": {}}'])
def test_extract_raises_with_context_on_anything_it_cannot_key(raw: str) -> None:
    """Malformed or incomplete text raises, loudly, naming ADR-004 B2 — never swallowed."""
    with pytest.raises(ForceOrderKeyExtractionError, match="ADR-004"):
        extract_force_order_natural_key(raw)


def test_trade_time_utc_date_is_deterministic_and_tz_free() -> None:
    """`trade_time_utc_date` reads only its argument, not the machine's local timezone."""
    assert trade_time_utc_date(0) == "1970-01-01"
    assert trade_time_utc_date(86_400_000) == "1970-01-02"


# ══════════════════════════ Domain: B3 collision accounting, and its direction ═════════════════


def test_a_repeated_key_within_one_bucket_is_a_collision_not_a_second_total() -> None:
    """THE mechanic B3 requires: a repeat subtracts from the total, never adds a duplicate."""
    key_a = extract_force_order_natural_key(FRAME_A)
    observations = [
        ForceOrderKeyObservation(key=key_a, day="1970-01-01"),
        ForceOrderKeyObservation(key=key_a, day="1970-01-01"),
    ]
    counts = count_daily_collisions(observations)
    assert counts == (
        DailyCollisionCount(symbol="BTCUSDT", day="1970-01-01", total_events=1, collisions=1),
    )
    assert counts[0].collision_rate == pytest.approx(1.0)


def test_the_falsifier_removing_the_duplicate_makes_the_collision_disappear() -> None:
    """Deleting the repeat (D3.5's pattern) drives `collisions` to 0 — the detector actually bites.

    Without this, a counter that always reported `collisions=0` would pass the test above by
    accident if it were wired wrong; this is the negative control that proves it is not.
    """
    key_a = extract_force_order_natural_key(FRAME_A)
    counts = count_daily_collisions([ForceOrderKeyObservation(key=key_a, day="1970-01-01")])
    assert counts == (
        DailyCollisionCount(symbol="BTCUSDT", day="1970-01-01", total_events=1, collisions=0),
    )
    assert counts[0].collision_rate == 0.0


def test_collision_rate_is_zero_when_nothing_was_observed_never_a_division_error() -> None:
    """A `total_events=0` bucket reports `0.0`, not a `ZeroDivisionError`.

    Never produced by `count_daily_collisions` itself, but a valid value of the type.
    """
    empty = DailyCollisionCount(symbol="BTCUSDT", day="1970-01-01", total_events=0, collisions=0)
    assert empty.collision_rate == 0.0


def test_buckets_split_by_symbol_and_by_day_independently() -> None:
    """Same symbol/different day, and different symbol/same day, are DISTINCT buckets."""
    observations = [
        ForceOrderKeyObservation(key=extract_force_order_natural_key(FRAME_A), day="1970-01-01"),
        ForceOrderKeyObservation(key=extract_force_order_natural_key(FRAME_B), day="1970-01-02"),
        ForceOrderKeyObservation(key=extract_force_order_natural_key(FRAME_C), day="1970-01-01"),
    ]
    counts = {(count.symbol, count.day): count for count in count_daily_collisions(observations)}
    assert len(counts) == 3
    assert all(count.collisions == 0 for count in counts.values())


def test_a_second_distinct_key_in_the_same_bucket_adds_to_the_total_not_a_new_bucket() -> None:
    """Two DISTINCT orders, same `(symbol, day)`, both land in the ONE existing bucket."""
    observations = [
        ForceOrderKeyObservation(key=extract_force_order_natural_key(FRAME_A), day="1970-01-01"),
        ForceOrderKeyObservation(
            key=extract_force_order_natural_key(FRAME_A_LATER_SAME_DAY), day="1970-01-01"
        ),
    ]
    counts = count_daily_collisions(observations)
    assert counts == (
        DailyCollisionCount(symbol="BTCUSDT", day="1970-01-01", total_events=2, collisions=0),
    )


def test_empty_input_publishes_an_empty_report_not_an_error() -> None:
    """Zero observations is a valid (if unhelpful) universe — never an exception."""
    assert count_daily_collisions([]) == ()
    assert d3_6_universe_met(()) is False


def test_d3_6_universe_met_requires_both_thresholds_at_once() -> None:
    """`>= 30` days AND `>= 20` symbols — either alone is insufficient (the `>=` boundary, too)."""
    thirty_days_one_symbol = tuple(
        DailyCollisionCount(symbol="BTCUSDT", day=f"day{i}", total_events=1, collisions=0)
        for i in range(D3_6_REQUIRED_DAYS)
    )
    assert d3_6_universe_met(thirty_days_one_symbol) is False

    twenty_symbols_one_day = tuple(
        DailyCollisionCount(symbol=f"SYM{i}", day="day0", total_events=1, collisions=0)
        for i in range(D3_6_REQUIRED_SYMBOLS)
    )
    assert d3_6_universe_met(twenty_symbols_one_day) is False

    full_universe = tuple(
        DailyCollisionCount(symbol=f"SYM{s}", day=f"day{d}", total_events=1, collisions=0)
        for d in range(D3_6_REQUIRED_DAYS)
        for s in range(D3_6_REQUIRED_SYMBOLS)
    )
    assert d3_6_universe_met(full_universe) is True


# ══════════════════════════════ Domain: B1 overlap invariant ═══════════════════════════════════


def test_require_overlap_accepts_the_old_source_closing_after_the_new_first_message() -> None:
    """Old closing strictly AFTER is the declared-good shape — no raise."""
    require_overlap(ReconnectionHandoff(new_first_message_at=5.0, old_source_closed_at=6.0))


def test_require_overlap_accepts_the_boundary_of_equal_instants() -> None:
    """Equal instants are NOT a gap — this is `<`, never `<=`."""
    require_overlap(ReconnectionHandoff(new_first_message_at=5.0, old_source_closed_at=5.0))


def test_require_overlap_rejects_the_old_source_closing_first() -> None:
    """THE falsifier: old closing BEFORE the new source's first message raises, naming B1."""
    with pytest.raises(ReconnectionGapError, match="ADR-004 B1"):
        require_overlap(ReconnectionHandoff(new_first_message_at=5.0, old_source_closed_at=4.9))


# ══════════════════════════ Use case: the B1 handoff mechanic itself ═══════════════════════════


def test_the_new_source_opens_and_is_read_before_the_old_source_closes() -> None:
    """THE ordering B1 requires, observed as a sequence of events, not just asserted in prose."""
    events: list[str] = []
    old = FakeSource([], events=events, name="old")
    new = FakeSource([FRAME_A], events=events, name="new")
    old.open()  # the caller's pre-existing connection, already open before any handoff decision

    ticks = iter([1.0, 2.0])
    record = perform_overlap_handoff(old, new, now=lambda: next(ticks))

    assert events == ["old_opened", "new_opened", "new_message_read", "old_closed"]
    assert old.closed
    assert record.first_new_message == FRAME_A
    assert record.handoff.new_first_message_at == 1.0
    assert record.handoff.old_source_closed_at == 2.0


# ══════════════════════ Use case: reconnect + key, the full simulated overlap ══════════════════


def test_reconnect_and_key_feeds_the_overlap_into_a_detectable_collision() -> None:
    """END TO END, SIMULATED: a known overlap duplicate becomes ONE B3 collision, not two totals.

    `overlap_window_tail` plays the old connection's LAST message before the handoff (`FRAME_A`);
    the new connection's FIRST message (`FRAME_A_DUP`) is the SAME liquidation, re-served during
    the overlap window B1 mandates. Feeding both into `count_daily_collisions` must land on ONE
    bucket with `total_events=1, collisions=1` — the mechanics D3.6 asks to be provable offline.
    """
    old = FakeSource([])
    new = FakeSource([FRAME_A_DUP])
    outcome = reconnect_and_key(old, new, overlap_window_tail=[FRAME_A], now=lambda: 0.0)

    assert outcome.unkeyable_raw == ()
    assert len(outcome.observations) == 2
    assert {observation.key for observation in outcome.observations} == {
        extract_force_order_natural_key(FRAME_A)
    }

    counts = count_daily_collisions(outcome.observations)
    assert counts == (
        DailyCollisionCount(symbol="BTCUSDT", day="1970-01-01", total_events=1, collisions=1),
    )


def test_reconnect_and_key_counts_but_never_drops_an_unkeyable_message() -> None:
    """A malformed raw line is reported in `unkeyable_raw`, never silently absent from the count."""
    old = FakeSource([])
    new = FakeSource([FRAME_B])
    outcome = reconnect_and_key(old, new, overlap_window_tail=[NOT_JSON], now=lambda: 0.0)
    assert outcome.unkeyable_raw == (NOT_JSON,)
    assert len(outcome.observations) == 1
    assert outcome.observations[0].key == extract_force_order_natural_key(FRAME_B)


# ═══════════════════════════════ Infra: the published report and summary ═══════════════════════


def _envelope_line(raw: str, received_at: str = "2026-08-29T00:00:00+00:00") -> str:
    """Build one JSONL line in the exact shape `force_order_raw_recorder.py` writes."""
    return json.dumps(ForceOrderEnvelope(raw=raw, received_at=received_at).as_dict())


def test_the_cli_reports_the_bias_direction_on_every_run(tmp_path: Path) -> None:
    """The B3 sentence is on the report even with zero evidence — never conditional on findings."""
    evidence = tmp_path / "empty.jsonl"
    evidence.write_text("", encoding="utf-8")
    args = build_parser().parse_args(["--evidence", str(evidence)])
    counts = run(args)
    assert counts == ()
    lines = _report_lines(counts, unkeyable=0, universe_met=False)
    assert any(COLLISION_BIAS_DIRECTION in line for line in lines)
    assert any("NAO MEDIVEL EM REGIME REAL HOJE" in line for line in lines)


def test_the_cli_end_to_end_detects_the_known_overlap_duplicate_and_writes_the_summary(
    tmp_path: Path,
) -> None:
    """END TO END, OFFLINE: a known duplicate publishes `collisions=1` in the written summary."""
    evidence = tmp_path / "raw.jsonl"
    evidence.write_text(
        "\n".join([_envelope_line(FRAME_A), _envelope_line(FRAME_A_DUP), _envelope_line(FRAME_C)])
        + "\n",
        encoding="utf-8",
    )
    summary_path = tmp_path / "collisions.json"
    code = main(["--evidence", str(evidence), "--summary", str(summary_path)])
    assert code == 0

    summary = json.loads(summary_path.read_text())
    assert summary["bias_direction"] == COLLISION_BIAS_DIRECTION
    assert summary["unkeyable_raw_lines"] == 0
    assert summary["d3_6_universe_met"] is False
    by_symbol = {row["symbol"]: row for row in summary["daily_counts"]}
    assert by_symbol["BTCUSDT"]["total_events"] == 1
    assert by_symbol["BTCUSDT"]["collisions"] == 1
    assert by_symbol["ETHUSDT"]["collisions"] == 0


def test_the_cli_skips_blank_lines_and_reads_across_multiple_evidence_files(tmp_path: Path) -> None:
    """A blank line is skipped, and observations from separate files are merged into one report."""
    evidence_1 = tmp_path / "raw-1.jsonl"
    evidence_2 = tmp_path / "raw-2.jsonl"
    evidence_1.write_text(_envelope_line(FRAME_A) + "\n\n", encoding="utf-8")
    evidence_2.write_text(_envelope_line(FRAME_A_DUP) + "\n", encoding="utf-8")
    summary_path = tmp_path / "collisions.json"
    main(["--evidence", str(evidence_1), str(evidence_2), "--summary", str(summary_path)])
    summary = json.loads(summary_path.read_text())
    assert summary["daily_counts"] == [
        {
            "symbol": "BTCUSDT",
            "day": "1970-01-01",
            "total_events": 1,
            "collisions": 1,
            "collision_rate": 1.0,
        }
    ]


def test_the_cli_counts_an_unkeyable_line_without_dropping_it_silently(tmp_path: Path) -> None:
    """A valid envelope whose `raw` is not a `forceOrder` frame is COUNTED, never silently lost."""
    evidence = tmp_path / "raw.jsonl"
    evidence.write_text(_envelope_line(MISSING_ORDER_OBJECT) + "\n", encoding="utf-8")
    summary_path = tmp_path / "collisions.json"
    main(["--evidence", str(evidence), "--summary", str(summary_path)])
    summary = json.loads(summary_path.read_text())
    assert summary["unkeyable_raw_lines"] == 1
    assert summary["daily_counts"] == []


def test_the_cli_refuses_a_corrupted_evidence_line_instead_of_reading_past_it(
    tmp_path: Path,
) -> None:
    """A line that is not even valid JSON raises — the recorder never writes this shape."""
    evidence = tmp_path / "raw.jsonl"
    evidence.write_text("{not json at all\n", encoding="utf-8")
    with pytest.raises(MalformedEvidenceLineError, match="line 1"):
        main(["--evidence", str(evidence)])


def test_the_report_names_d3_6_atendido_once_the_universe_is_reached() -> None:
    """The `ATENDIDO` branch, exercised directly on a synthetic 30x20 universe.

    Assembling 30x20 real evidence files is not the point of this offline bench — the accounting
    math already proves the boundary, above.
    """
    full_universe = tuple(
        DailyCollisionCount(symbol=f"SYM{s}", day=f"day{d}", total_events=1, collisions=0)
        for d in range(D3_6_REQUIRED_DAYS)
        for s in range(D3_6_REQUIRED_SYMBOLS)
    )
    lines = _report_lines(full_universe, unkeyable=0, universe_met=True)
    assert any("D3.6 ATENDIDO" in line for line in lines)
    summary = _summary(full_universe, unkeyable=0, universe_met=True)
    assert summary["d3_6_universe_met"] is True
