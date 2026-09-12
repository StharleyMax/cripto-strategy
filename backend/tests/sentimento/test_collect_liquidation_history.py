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
    )
    return result, published, clock, source


# ── THE HAPPY PATH, AND THE TWO COHORTS ───────────────────────────────────────────────────


def test_a_settled_bucket_publishes_both_cohorts_as_two_rows() -> None:
    """`l` and `s` are two independent series, never one net — `ZL-1`, `T-05.3`."""
    body = _body("BTCUSDT", [{"t": _SETTLED_START, "l": 231.85, "s": 1468.84}])
    result, published, _, _ = _collect(
        symbols=["BTCUSDT"], answers=[LiquidationFetch(status=200, body=body)]
    )
    assert sorted(published) == [
        ("BTCUSDT", "long", _SETTLED_START, "231.85"),
        ("BTCUSDT", "short", _SETTLED_START, "1468.84"),
    ]
    assert result.n_published == 2
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
    assert [row[2] for row in published] == [_SETTLED_START]
    assert all(row[3] != "999" for row in published)


def test_a_side_never_seen_operating_is_silent_and_not_a_zero() -> None:
    """`ZL-2`: a leading zero from a side that never reported is `NO_SOURCE`, so no row.

    Absence is `SEM_PONTO`, never zero (plan `05` item 5.4) — and for a `Nature.FLOW` series
    that is a TYPE error, not a rendering preference.
    """
    body = _body("BTCUSDT", [{"t": _SETTLED_START, "l": 0, "s": 42}])
    _, published, _, _ = _collect(
        symbols=["BTCUSDT"], answers=[LiquidationFetch(status=200, body=body)]
    )
    assert [(row[1], row[3]) for row in published] == [("short", "42")]


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
    assert [row[3] for row in longs] == ["7", "0"]


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
    assert [row[0] for row in published] == ["ETHUSDT"]


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
