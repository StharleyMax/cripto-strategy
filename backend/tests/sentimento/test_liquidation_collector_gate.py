"""QA gate of `T-05.5`/`T-05.6`/`T-05.7`: the properties the DoD names, measured end to end.

These are NOT a second copy of `test_collect_liquidation_history.py`. Each one here exists
because the same requirement is provable by a STRONGER observation than the one already in the
suite, and the difference is stated in the docstring:

- `DoD 6b` asks that the collector *recuse ultrapassar 40 u/60 s*. The existing test drives ONE
  cycle against a pre-filled window and asserts it slept. This file instead records the injected
  monotonic instant of EVERY call across an adversarial run and asserts the sliding-window
  invariant directly, over every 60 s window there is.
- `RS-3.6` asks that the calls be SPREAD. Counting the pauses does not say WHERE they landed: a
  loop that fired ten calls and then slept nine times would satisfy `clock.slept == [30.0] * 9`.
  Here the assertion is the SPACING BETWEEN CALLS, which a burst cannot fake.

ZERO REDE: `source` and `clock` are injected, as everywhere else in this suite.
"""

from __future__ import annotations

from email.utils import formatdate

import pytest

from src.modules.sentimento.domain.liquidation_collection import (
    QUOTA_CEILING,
    QUOTA_WINDOW_SECONDS,
    RetryLedger,
    SlidingQuotaWindow,
)
from src.modules.sentimento.domain.recoil_policy import RecoilPolicy
from src.modules.sentimento.use_cases.collect_liquidation_history import (
    LiquidationCollectorState,
    LiquidationFetch,
    collect_liquidation_history_once,
)
from tests.sentimento.test_collect_liquidation_history import (
    _NOW_MS,
    _RECOIL,
    _SETTLED_START,
    _body,
    _FakeClock,
)


class _StampingSource:
    """Answers from a script AND stamps the injected monotonic instant of every call.

    The stamp is the whole point: `clock.slept` says how long the cycle paused, and the DoD asks
    WHEN the calls happened. Only the second one can tell a spread cycle from a burst followed
    by a nap.
    """

    def __init__(self, clock: _FakeClock, answers: list[LiquidationFetch]) -> None:
        """Take the clock to read and the queue to answer from; the last answer repeats."""
        self._clock = clock
        self._answers = list(answers)
        self.at: list[float] = []
        self.paths: list[str] = []

    def fetch(self, path: str) -> LiquidationFetch:
        """Record the instant and the path, then answer."""
        self.at.append(self._clock.monotonic())
        self.paths.append(path)
        if len(self._answers) > 1:
            return self._answers.pop(0)
        return self._answers[0]


def _worst_window(instants: list[float], window_seconds: float) -> int:
    """Return the largest number of calls inside ANY trailing window of that width.

    Every call is taken as the right edge of a window, which is exactly how a sliding limiter on
    the provider's side would count: the worst case is always anchored on some call.
    """
    worst = 0
    for right in instants:
        inside = [moment for moment in instants if right - window_seconds < moment <= right]
        worst = max(worst, len(inside))
    return worst


# ── `DoD 6b`, first half: THE CEILING HOLDS OVER EVERY SLIDING WINDOW, NOT ON AVERAGE ──────


def test_no_sixty_second_window_of_an_adversarial_run_ever_holds_a_forty_first_call() -> None:
    """40 symbols, a one-minute cadence and EVERY symbol failing — 80 calls, ceiling intact.

    This is the shape that breaks a budget kept on averages: the spread pause collapses to the
    `60/40 = 1,5 s` floor, and the per-pair retry (`RS-3.3`) doubles the call count without
    buying a single extra pause, because a retry follows its failure immediately. 80 calls in
    the space of one cadence is therefore the densest thing this collector can legally do.

    The assertion is on the PROVIDER'S unit of enforcement: no trailing 60 s window, anchored
    anywhere, may contain more than 40 calls. A tumbling counter passes the average and fails
    this.
    """
    clock = _FakeClock()
    symbols = [f"SYM{index:02d}" for index in range(40)]
    source = _StampingSource(clock, [LiquidationFetch(transport_error="peer went away")])
    result = collect_liquidation_history_once(
        symbols=symbols,
        source=source,
        clock=clock,
        state=LiquidationCollectorState(),
        recoil=_RECOIL,
        publish=lambda *_: None,
        ledger=RetryLedger(max_attempts=2),
        cycle_seconds=60.0,
    )
    assert result.n_calls == 80, "the adversarial run did not produce the density it was built for"
    assert _worst_window(source.at, QUOTA_WINDOW_SECONDS) <= QUOTA_CEILING


def test_the_collector_refuses_rather_than_overspends_when_the_clock_will_not_advance() -> None:
    """A window with no room and a clock that cannot free it: REFUSE, never issue the call.

    `_spend_one_call` waits for room. If the wait does not produce room — a clock skew, a
    truncated sleep, a window whose oldest entry is newer than it looked — the choice is between
    issuing a 41st call and raising. `QuotaExhaustedError` is the right answer and this pins it:
    the DoD says *recusa ultrapassar*, not *reporta ter ultrapassado*.
    """

    class _FrozenClock(_FakeClock):
        def sleep(self, seconds: float) -> None:
            """Record the pause and refuse to move — the skew this test is about."""
            self.slept.append(seconds)

    clock = _FrozenClock()
    state = LiquidationCollectorState(quota=SlidingQuotaWindow())
    for index in range(QUOTA_CEILING):
        state.quota.spend(clock.monotonic() - 1.0 + index * 0.001)
    source = _StampingSource(clock, [LiquidationFetch(status=200, body=b"[]")])
    with pytest.raises(Exception, match="41st call"):
        collect_liquidation_history_once(
            symbols=["BTCUSDT"],
            source=source,
            clock=clock,
            state=state,
            recoil=_RECOIL,
            publish=lambda *_: None,
        )
    assert source.at == [], "a 41st call left the machine inside a full window"


# ── `DoD 6b`, second half: `N = 10` IS SPREAD, AND THE SPACING IS THE PROOF ────────────────


def test_a_ten_symbol_cycle_spaces_its_calls_and_does_not_burst_then_nap() -> None:
    """The ten calls are 30 s apart and span the cadence — measured BETWEEN CALLS, not summed.

    THE MUTATION THIS CATCHES AND A PAUSE COUNT DOES NOT: moving the sleep to the end of the
    loop body still yields nine 30 s pauses and still fires ten calls inside one instant. Here
    the first and last call are 270 s apart, and no two calls are closer than the spread.
    """
    clock = _FakeClock()
    symbols = [f"SYM{index}" for index in range(10)]
    source = _StampingSource(clock, [LiquidationFetch(status=200, body=b"[]")])
    collect_liquidation_history_once(
        symbols=symbols,
        source=source,
        clock=clock,
        state=LiquidationCollectorState(),
        recoil=_RECOIL,
        publish=lambda *_: None,
        cycle_seconds=300.0,
    )
    assert len(source.at) == 10
    spacings = [later - earlier for earlier, later in zip(source.at, source.at[1:], strict=False)]
    assert spacings == [pytest.approx(30.0)] * 9
    assert source.at[-1] - source.at[0] == pytest.approx(270.0)
    assert _worst_window(source.at, QUOTA_WINDOW_SECONDS) <= 3


# ── `RS-3.2`: THE RECOIL READS THE RESPONSE, IN BOTH LEGAL FORMS OF THE HEADER ─────────────


def test_the_recoil_obeys_the_http_date_form_of_retry_after_too() -> None:
    """`RFC 9110` allows an ABSOLUTE DATE, and the wall clock is what resolves it.

    The module docstring claims `epoch_ms()` is used rather than `monotonic()` precisely so the
    date form lands right. Only this form can tell the two apart: a monotonic origin is
    arbitrary, so subtracting it from a real date is off by decades — while the seconds form
    would keep passing, which is how the defect would survive a suite that only tested seconds.
    """
    clock = _FakeClock()
    when = formatdate(timeval=_NOW_MS / 1000.0 + 47.0, usegmt=True)
    source = _StampingSource(
        clock,
        [
            LiquidationFetch(status=429, retry_after=when),
            LiquidationFetch(
                status=200, body=_body("BTCUSDT", [{"t": _SETTLED_START, "l": 2, "s": 1}])
            ),
        ],
    )
    published: list[tuple[str, str, int, str]] = []
    collect_liquidation_history_once(
        symbols=["BTCUSDT"],
        source=source,
        clock=clock,
        state=LiquidationCollectorState(),
        recoil=RecoilPolicy(base_seconds=30.0, factor=2.0, cap_seconds=300.0),
        publish=lambda *row: published.append(row),
    )
    assert clock.slept == [pytest.approx(47.0, abs=1.0)]
    assert published, "the retry after the dated recoil never happened"
