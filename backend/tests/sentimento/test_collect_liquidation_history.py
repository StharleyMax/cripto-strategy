"""The liquidation CYCLE: `RS-3.2`, `RS-3.3`, `RS-3.6`, `RS-3.7` and the two zero rules.

ZERO REDE. `source` and `clock` are injected, so the `429` recoil, the quota wait and the
five-minute spread all run in microseconds against scripted answers — which is the only way a
test can assert on a pause that would otherwise take a minute of wall clock to observe.
"""

from __future__ import annotations

import json

import pytest

from src.modules.sentimento.domain.liquidation_collection import (
    QUOTA_CEILING,
    RetryLedger,
    SlidingQuotaWindow,
)
from src.modules.sentimento.domain.recoil_policy import RecoilPolicy
from src.modules.sentimento.use_cases.collect_liquidation_history import (
    DEFAULT_LOOKBACK_SECONDS,
    LiquidationCollectorState,
    LiquidationCycleResult,
    LiquidationFetch,
    collect_liquidation_history_once,
)

# A bucket that closed long before `_NOW_MS`, so `RS-3.4` admits it.
_SETTLED_START = 1_789_200_600
_NOW_MS = (_SETTLED_START + 600) * 1000
_RECOIL = RecoilPolicy(base_seconds=30.0, factor=2.0, cap_seconds=300.0)


def _body(symbol: str, history: list[dict[str, object]]) -> bytes:
    """Render the provider's wire shape for ONE requested symbol."""
    return json.dumps([{"symbol": f"{symbol}_PERP.A", "history": history}]).encode("utf-8")


class _FakeClock:
    """A clock that never really sleeps but remembers every pause it was asked for."""

    def __init__(self, now_ms: int = _NOW_MS) -> None:
        """Start held at `now_ms`, with an arbitrary monotonic origin."""
        self.now_ms = now_ms
        self.slept: list[float] = []
        self._monotonic = 1_000.0

    def monotonic(self) -> float:
        """Return the current monotonic reading, advanced only by `sleep`."""
        return self._monotonic

    def epoch_ms(self) -> int:
        """Return the wall clock, which this fake holds still unless a test moves it."""
        return self.now_ms

    def sleep(self, seconds: float) -> None:
        """Record the pause and advance the monotonic reading by it."""
        self.slept.append(seconds)
        self._monotonic += seconds


class _ScriptedSource:
    """Answers each call from a queue, and records the paths it was asked for."""

    def __init__(self, answers: list[LiquidationFetch]) -> None:
        """Take the script; the LAST answer repeats once the queue runs down."""
        self._answers = list(answers)
        self.paths: list[str] = []

    def fetch(self, path: str) -> LiquidationFetch:
        """Pop the next scripted answer, repeating the last one if the script runs out."""
        self.paths.append(path)
        if len(self._answers) > 1:
            return self._answers.pop(0)
        return self._answers[0]


def _collect(
    *,
    symbols: list[str],
    answers: list[LiquidationFetch],
    clock: _FakeClock | None = None,
    state: LiquidationCollectorState | None = None,
    ledger: RetryLedger | None = None,
    cycle_seconds: float = 300.0,
    lookback_seconds: int = DEFAULT_LOOKBACK_SECONDS,
) -> tuple[LiquidationCycleResult, list[tuple[str, str, int, str]], _FakeClock, _ScriptedSource]:
    """Run one cycle against scripted answers and collect everything it published."""
    clock = clock or _FakeClock()
    source = _ScriptedSource(answers)
    published: list[tuple[str, str, int, str]] = []
    result = collect_liquidation_history_once(
        symbols=symbols,
        source=source,
        clock=clock,
        state=state or LiquidationCollectorState(),
        recoil=_RECOIL,
        publish=lambda symbol, cohort, start, value: published.append(
            (symbol, cohort, start, value)
        ),
        ledger=ledger,
        cycle_seconds=cycle_seconds,
        lookback_seconds=lookback_seconds,
    )
    return result, published, clock, source


# ── THE HAPPY PATH, AND THE TWO COHORTS ───────────────────────────────────────────────────


def test_a_settled_bucket_publishes_both_cohorts_as_two_rows() -> None:
    """`l` and `s` are two independent series, never one net — `ZL-1`, `T-05.3`."""
    body = _body("BTCUSDT", [{"t": _SETTLED_START, "l": 231.85, "s": 1468.84}])
    result, published, _, _ = _collect(
        symbols=["BTCUSDT"], answers=[LiquidationFetch(status=200, body=body)]
    )
    # `T-05.2`: the nine closed minutes AFTER the wire bucket were consulted and came back
    # empty, so each side also writes them as `0` — 2 wire rows + 2 x 9 consulted zeros.
    assert sorted(row for row in published if row[2] == _SETTLED_START) == [
        ("BTCUSDT", "long", _SETTLED_START, "231.85"),
        ("BTCUSDT", "short", _SETTLED_START, "1468.84"),
    ]
    assert result.n_published == 2 + 2 * 9
    assert result.notes is None


def test_the_unsettled_newest_bucket_is_not_published() -> None:
    """`RS-3.4`: a bucket that has not closed is dropped, and it is NOT a gap.

    THE MUTATION: flipping `is_settled_bucket`'s comparison would publish a number that is
    still growing as final, which `as_of`'s `argmin(observed_at)` then freezes forever.
    """
    running_start = (_NOW_MS // 1000) - 30  # the bucket that is half-elapsed right now
    body = _body(
        "BTCUSDT",
        [
            {"t": _SETTLED_START, "l": 100, "s": 0},
            {"t": running_start, "l": 999, "s": 0},
        ],
    )
    _, published, _, _ = _collect(
        symbols=["BTCUSDT"], answers=[LiquidationFetch(status=200, body=body)]
    )
    assert running_start not in {row[2] for row in published}
    assert all(row[3] != "999" for row in published)
    assert max(row[2] for row in published) + 60 <= _NOW_MS // 1000


def test_a_side_never_seen_operating_is_silent_and_not_a_zero() -> None:
    """`ZL-2`: a leading zero from a side that never reported is `NO_SOURCE`, so no row.

    Absence is `SEM_PONTO`, never zero (plan `05` item 5.4) — and for a `Nature.FLOW` series
    that is a TYPE error, not a rendering preference.
    """
    body = _body("BTCUSDT", [{"t": _SETTLED_START, "l": 0, "s": 42}])
    _, published, _, _ = _collect(
        symbols=["BTCUSDT"], answers=[LiquidationFetch(status=200, body=body)]
    )
    assert [row for row in published if row[1] == "long"] == []
    assert [(row[1], row[3]) for row in published if row[2] == _SETTLED_START] == [("short", "42")]


def test_a_zero_after_that_side_proved_itself_is_a_real_observation() -> None:
    """`ZL-3`: once a side reports a non-zero, a later zero IS a measurement and is written."""
    body = _body(
        "BTCUSDT",
        [
            {"t": _SETTLED_START, "l": 7, "s": 0},
            {"t": _SETTLED_START + 60, "l": 0, "s": 0},
        ],
    )
    _, published, _, _ = _collect(
        symbols=["BTCUSDT"], answers=[LiquidationFetch(status=200, body=body)]
    )
    longs = [row for row in published if row[1] == "long"]
    assert [row[3] for row in longs[:2]] == ["7", "0"]
    assert [row[2] for row in longs[:2]] == [_SETTLED_START, _SETTLED_START + 60]


def test_the_side_memory_survives_the_cycle_boundary() -> None:
    """A side that proved itself LAST cycle is not demoted to `NO_SOURCE` by a quiet window.

    THE MUTATION: without `LiquidationCollectorState.seen_nonzero`, the same bucket would be a
    value or an absence depending only on where the five-minute window happened to start.
    """
    state = LiquidationCollectorState()
    first = _body("BTCUSDT", [{"t": _SETTLED_START, "l": 5, "s": 0}])
    _collect(
        symbols=["BTCUSDT"],
        answers=[LiquidationFetch(status=200, body=first)],
        state=state,
    )
    second = _body("BTCUSDT", [{"t": _SETTLED_START + 60, "l": 0, "s": 0}])
    _, published, _, _ = _collect(
        symbols=["BTCUSDT"],
        answers=[LiquidationFetch(status=200, body=second)],
        state=state,
    )
    assert ("BTCUSDT", "long", _SETTLED_START + 60, "0") in published


# ── `RS-3.6` — THE SPREAD IS REAL, NOT DOCUMENTED ─────────────────────────────────────────


def test_a_ten_symbol_cycle_pauses_nine_times_and_never_bursts() -> None:
    """`n - 1` pauses of `cycle/n`, so the ten calls fill the cadence, not its first second.

    MÉDIA NÃO É PICO: without these pauses the average spend would still read `2 u/min` while
    ten units sat inside a single sliding window, and the next retry in that minute would take
    a `429` the budget said was impossible.
    """
    symbols = [f"SYM{index}" for index in range(10)]
    answers = [LiquidationFetch(status=200, body=b"[]")]
    _, _, clock, _ = _collect(symbols=symbols, answers=answers, cycle_seconds=300.0)
    assert clock.slept == [pytest.approx(30.0)] * 9


def test_the_cycle_waits_rather_than_spending_the_forty_first_call_in_a_window() -> None:
    """`RS-3.1` end to end: a window already full makes the cycle WAIT, never overspend."""
    state = LiquidationCollectorState(quota=SlidingQuotaWindow())
    for index in range(QUOTA_CEILING):
        state.quota.spend(1_000.0 - 59.0 + index * 0.1)
    _, _, clock, source = _collect(
        symbols=["BTCUSDT"],
        answers=[LiquidationFetch(status=200, body=b"[]")],
        clock=_FakeClock(),
        state=state,
    )
    assert clock.slept, "the cycle spent a call without waiting for room in the window"
    assert len(source.paths) == 1


# ── `RS-3.2` — THE RECOIL OBEYS THE RESPONSE ──────────────────────────────────────────────


def test_the_recoil_obeys_retry_after_from_the_response_and_not_a_fixed_number() -> None:
    """A provider asking 49 s is waited 49 s — a blind 60 s would waste ~18% of the window.

    The three values observed in production were 49,1 s / 56,8 s / 59,0 s `[DOC: MEDICAO §3]`,
    all of them BELOW a flat minute, and all of them above this policy's own 30 s base — so the
    header is what decides, which is exactly what `RS-3.2` requires.
    """
    settled = _body("BTCUSDT", [{"t": _SETTLED_START, "l": 3, "s": 0}])
    answers = [
        LiquidationFetch(status=429, retry_after="49"),
        LiquidationFetch(status=200, body=settled),
    ]
    result, published, clock, _ = _collect(symbols=["BTCUSDT"], answers=answers)
    assert clock.slept == [pytest.approx(49.0)]
    assert result.api_code == 429
    assert published, "the retry after the recoil never happened"


def test_a_provider_asking_more_than_the_cap_is_served_across_several_sleeps() -> None:
    """THE WARNING `recoil_policy.py` WROTE FOR THIS MODULE, made executable.

    Capping a SINGLE sleep keeps the worst block predictable. Resuming after that cap when
    `unmet_seconds > 0` would hit the provider before it said to — so the loop continues until
    the request is `honoured_in_full`. `cap_seconds` is 300 here and the provider asks 700, so
    the pause must total at least 700 s and no single sleep may exceed the cap.
    """
    answers = [
        LiquidationFetch(status=429, retry_after="700"),
        LiquidationFetch(status=200, body=b"[]"),
    ]
    _, _, clock, _ = _collect(symbols=["BTCUSDT"], answers=answers)
    assert sum(clock.slept) >= 700.0
    assert max(clock.slept) <= 300.0


def test_a_429_without_a_header_still_recoils_on_our_own_escalation() -> None:
    """`POLICY_NO_RETRY_AFTER`: a mute provider gets our base, never zero."""
    answers = [
        LiquidationFetch(status=429),
        LiquidationFetch(status=200, body=b"[]"),
    ]
    _, _, clock, _ = _collect(symbols=["BTCUSDT"], answers=answers)
    assert clock.slept == [pytest.approx(30.0)]


# ── `RS-3.3` — THE RETRY IS THE PAIR'S, NOT THE CYCLE'S ───────────────────────────────────


def test_one_failing_symbol_does_not_cost_the_others_a_single_call() -> None:
    """THE MUTATION: a cycle-level retry would re-fetch nine good answers to fix one bad one.

    Two symbols, the first failing twice (its whole budget) and the second answering. The
    expected call count is 3 — two for the loser, one for the winner — and NOT 4, which is what
    re-running the cycle would cost.
    """
    ledger = RetryLedger(max_attempts=2)
    good = _body("ETHUSDT", [{"t": _SETTLED_START, "l": 1, "s": 0}])
    answers = [
        LiquidationFetch(transport_error="ConnectionResetError: peer went away"),
        LiquidationFetch(transport_error="ConnectionResetError: peer went away"),
        LiquidationFetch(status=200, body=good),
    ]
    result, published, _, source = _collect(
        symbols=["BTCUSDT", "ETHUSDT"], answers=answers, ledger=ledger
    )
    assert len(source.paths) == 3
    assert result.n_calls == 3
    assert {row[0] for row in published} == {"ETHUSDT"}


def test_a_transport_failure_is_named_in_the_cycle_notes() -> None:
    """`RS-4`/`T-05.6`: the reason travels into the record, not only into stderr."""
    answers = [LiquidationFetch(transport_error="ConnectionResetError: peer went away")]
    result, _, _, _ = _collect(symbols=["BTCUSDT"], answers=answers)
    assert result.notes is not None
    assert "ConnectionResetError" in result.notes


def test_a_fetch_that_is_neither_a_dispatch_nor_a_failure_is_refused() -> None:
    """One optional field would collapse "never left the machine" into "empty answer"."""
    with pytest.raises(ValueError, match="never both nor neither"):
        LiquidationFetch()
    with pytest.raises(ValueError, match="never both nor neither"):
        LiquidationFetch(status=200, transport_error="boom")


# ── `RS-3.7` — THE GAP ────────────────────────────────────────────────────────────────────


def test_a_symbol_the_provider_never_mentioned_comes_back_as_a_gap() -> None:
    """A `200` with `[]` for a requested symbol is an ABSENCE, and it is reported as one."""
    answers = [LiquidationFetch(status=200, body=b"[]")]
    result, _, _, _ = _collect(symbols=["BTCUSDT"], answers=answers)
    assert result.unanswered == ("BTCUSDT",)
    assert "unanswered symbols: BTCUSDT" in (result.notes or "")


def test_a_quiet_symbol_is_answered_and_produces_no_gap() -> None:
    """THE CALA HALF: 79,8% of minutes are empty, and none of them is a gap.

    Without this test the gap detector would be indistinguishable from one that fires on every
    quiet cycle — four false gaps per cadence, and a real one nobody could see in the noise.
    """
    answers = [LiquidationFetch(status=200, body=_body("BTCUSDT", []))]
    result, published, _, _ = _collect(symbols=["BTCUSDT"], answers=answers)
    assert result.unanswered == ()
    assert published == []
    assert result.notes is None


def test_a_non_success_status_is_recorded_as_the_api_code() -> None:
    """`RS-4`: a provider refusal carries ITS number, which is what `api_code` is for."""
    answers = [LiquidationFetch(status=503, body=b"")]
    result, _, _, _ = _collect(symbols=["BTCUSDT"], answers=answers)
    assert result.api_code == 503
    assert "HTTP 503" in (result.notes or "")


# ── `T-05.2` — THE CONSULTED, EMPTY MINUTE IS WRITTEN AS `0`, AND ONLY FROM EVIDENCE ──────

# The window `m0..m9`, closed; `m10` is running (`now = m10 + 30 s`). The lookback is chosen so
# the request's `from` is EXACTLY `m0`, which makes every count below exact.
_M0 = 1_789_200_600
_WINDOW_NOW_MS = (_M0 + 10 * 60 + 30) * 1000
_WINDOW_LOOKBACK = (_WINDOW_NOW_MS // 1000) - _M0


def _m(index: int) -> int:
    """Return the start of minute `index` of the window."""
    return _M0 + index * 60


def _seeded_state() -> LiquidationCollectorState:
    """Return a state where BOTH sides of BTCUSDT already proved they can report (`ZL-2`)."""
    return LiquidationCollectorState(seen_nonzero={("BTCUSDT", "l"), ("BTCUSDT", "s")})


def _window_cycle(
    answers: list[LiquidationFetch],
    *,
    state: LiquidationCollectorState,
    now_ms: int = _WINDOW_NOW_MS,
) -> tuple[LiquidationCycleResult, list[tuple[str, str, int, str]]]:
    """One cycle over the `m0..m9` window (shifted by `now_ms`), BTCUSDT only."""
    result, published, _, _ = _collect(
        symbols=["BTCUSDT"],
        answers=answers,
        clock=_FakeClock(now_ms),
        state=state,
        lookback_seconds=_WINDOW_LOOKBACK,
    )
    return result, published


def _zeros(published: list[tuple[str, str, int, str]], cohort: str) -> list[int]:
    """Return the minutes written as `0` for one cohort, in publication order."""
    return [row[2] for row in published if row[1] == cohort and row[3] == "0"]


def test_an_answered_window_writes_every_empty_closed_minute_as_zero_on_both_sides() -> None:
    """MORDE 1: one point at `m3` ⇒ exactly 9 zeros per side, and `m3` keeps the wire value.

    THE MUTATION: reverting `T-05.2` writes 1 row per side and leaves 9 holes the read path
    shows as `SEM_PONTO` — the 100%-partial panel `FIX-uso-2026-10-02.md` §D-B measured.
    """
    body = _body("BTCUSDT", [{"t": _m(3), "l": 50.5, "s": 7}])
    result, published = _window_cycle(
        [LiquidationFetch(status=200, body=body)], state=_seeded_state()
    )
    expected_zeros = [_m(i) for i in range(10) if i != 3]
    assert _zeros(published, "long") == expected_zeros
    assert _zeros(published, "short") == expected_zeros
    assert [row for row in published if row[2] == _m(3)] == [
        ("BTCUSDT", "long", _m(3), "50.5"),
        ("BTCUSDT", "short", _m(3), "7"),
    ]
    assert result.n_published == 2 * 10
    # CALA: the zeros cost no call — the window was already being asked for.
    assert result.n_calls == 1


@pytest.mark.parametrize(
    "fetch",
    [
        LiquidationFetch(status=200, body=b"[]"),
        LiquidationFetch(status=200, body=_body("ETHUSDT", [{"t": _m(3), "l": 1, "s": 1}])),
        LiquidationFetch(status=503, body=b""),
        LiquidationFetch(transport_error="ConnectionResetError: peer went away"),
        LiquidationFetch(status=200, body=b"{not json"),
    ],
    ids=["empty-array", "names-another-symbol", "http-5xx", "transport-error", "malformed"],
)
def test_without_an_answered_response_not_a_single_zero_is_written(
    fetch: LiquidationFetch,
) -> None:
    """MORDE 2 — THE ABLATION OF THE EVIDENCE: no `answered`, no zero, whatever else holds.

    The state is seeded, the window is closed and empty — every other condition for a zero is
    met. Only the evidence is missing, and it is the evidence alone that decides.
    """
    _, published = _window_cycle([fetch], state=_seeded_state())
    assert [row for row in published if row[3] == "0"] == []
    assert published == []


def test_a_side_not_yet_seen_operating_gets_no_zero_before_its_first_non_zero() -> None:
    """MORDE 3 — `ZL-2` intact by construction: zeros only AFTER the side proved itself.

    Fresh state, `l` first reports at `m5` ⇒ no zero in `m0..m4`, zeros in `m6..m9`. `s` never
    reports a non-zero ⇒ not one zero, wire or candidate.
    """
    body = _body("BTCUSDT", [{"t": _m(5), "l": 9, "s": 0}])
    _, published = _window_cycle(
        [LiquidationFetch(status=200, body=body)], state=LiquidationCollectorState()
    )
    assert _zeros(published, "long") == [_m(i) for i in range(6, 10)]
    assert [row for row in published if row[1] == "short"] == []


def test_the_minute_in_progress_never_receives_a_zero() -> None:
    """MORDE 4: `m10` is running at `now`, so it is neither a wire row nor a candidate zero."""
    body = _body("BTCUSDT", [{"t": _m(3), "l": 1, "s": 1}])
    _, published = _window_cycle([LiquidationFetch(status=200, body=body)], state=_seeded_state())
    assert max(row[2] for row in published) == _m(9)
    assert _m(10) not in {row[2] for row in published}


def test_overlapping_windows_write_each_zero_exactly_once_per_process() -> None:
    """MORDE 5a — condition 6: the second window re-covers `m2..m9` and rewrites none of them.

    THE MUTATION: without `zero_published`, each zero is rewritten on every cycle whose window
    still covers it — ~36x at the regime window, the multiplicity non-zero rows already pay.
    """
    state = _seeded_state()
    body = _body("BTCUSDT", [{"t": _m(3), "l": 1, "s": 1}])
    _, first = _window_cycle([LiquidationFetch(status=200, body=body)], state=state)
    _, second = _window_cycle(
        [LiquidationFetch(status=200, body=body)],
        state=state,
        now_ms=_WINDOW_NOW_MS + 120_000,
    )
    for cohort in ("long", "short"):
        both = _zeros(first, cohort) + _zeros(second, cohort)
        assert sorted(both) == sorted(set(both)), f"{cohort}: a zero was written twice"
        assert _zeros(second, cohort) == [_m(10), _m(11)]
    # and the memory is pruned to the current window — `m0`, `m1` slid out of it
    assert all(key[2] >= _m(2) for key in state.zero_published)


def test_the_cycle_after_a_side_proves_itself_writes_the_minutes_zl2_held() -> None:
    """MORDE 5b: the minutes `ZL-2` demoted are not remembered, so the next cycle writes them.

    Cycle 1 (fresh): `l` proves itself at `m5`, so `m0..m4` are held back. Cycle 2 (same
    window): `l` is now `seen_nonzero`, so `m0..m4` are written — and `m6..m9`, already written,
    are not. Cycle 3 writes no zero at all.
    """
    state = LiquidationCollectorState()
    body = _body("BTCUSDT", [{"t": _m(5), "l": 9, "s": 0}])
    _, first = _window_cycle([LiquidationFetch(status=200, body=body)], state=state)
    _, second = _window_cycle([LiquidationFetch(status=200, body=body)], state=state)
    _, third = _window_cycle([LiquidationFetch(status=200, body=body)], state=state)
    assert _zeros(first, "long") == [_m(i) for i in range(6, 10)]
    assert _zeros(second, "long") == [_m(i) for i in range(5)]
    assert _zeros(third, "long") == []


# ── W7-QA-BACK — edges the T-05.2 suite did not pin (QA mutations QA52-1, QA52-2) ───────────


def test_a_quiet_answered_window_with_no_point_at_all_is_ten_zeros_per_side() -> None:
    """The DOMINANT production case: the provider answered BTCUSDT with `history: []`.

    A symbol that cites itself with an EMPTY history was consulted and nothing happened, so a
    side that already proved itself (`ZL-2`) gets a zero on every closed minute of the window.
    QA mutation `QA52-1` (`answered=outcome.answered and bool(points)`) — a gate that demands a
    point before it believes the window — survived the T-05.2 suite: every MORDE test had one
    wire point, and the only `history: []` test runs with a fresh state where ZL-2 hides it.
    """
    result, published = _window_cycle(
        [LiquidationFetch(status=200, body=_body("BTCUSDT", []))], state=_seeded_state()
    )
    every_minute = [_m(i) for i in range(10)]
    assert _zeros(published, "long") == every_minute
    assert _zeros(published, "short") == every_minute
    assert result.n_published == 2 * 10
    assert result.unanswered == ()


def test_the_retention_guard_counts_the_whole_response_not_only_its_settled_points() -> None:
    """`1.500` points where the newest is the minute in progress ⇒ the guard still holds.

    The provider's retention is a count of points it RETURNED (`RETENTION_POINT_FLOOR`), and the
    running minute is one of them. QA mutation `QA52-2` (`n_points_in_response=len(settled)`)
    drops it from the count, reads `1.499`, and claims `m0..m500` — minutes the provider may
    simply have forgotten — as consulted and empty.
    """
    now_ms = (_M0 + 2000 * 60 + 30) * 1000  # `m2000` is running
    history: list[dict[str, object]] = [{"t": _m(i), "l": 1, "s": 1} for i in range(501, 2001)]
    assert len(history) == 1500
    result, published, _, _ = _collect(
        symbols=["BTCUSDT"],
        answers=[LiquidationFetch(status=200, body=_body("BTCUSDT", history))],
        clock=_FakeClock(now_ms),
        state=_seeded_state(),
        lookback_seconds=(now_ms // 1000) - _M0,
    )
    assert [row for row in published if row[3] == "0"] == []
    assert min(row[2] for row in published) == _m(501)
    assert result.n_published == 2 * 1499
