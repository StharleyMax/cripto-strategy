"""Two properties `RS-3.6`/`RS-3.7` claim and the cycle does not hold. QA of `T-05.5`.

Each test here is written to PASS against the behaviour the requirement describes, so a red
line is the proof of the defect and a green line is the proof of the fix. Neither is a style
preference: both were reached by reading the production path, and both are reproduced with an
injected source and an injected clock (ZERO REDE).
"""

from __future__ import annotations

import json
import threading

from src.modules.sentimento.domain.liquidation_collection import QUOTA_WINDOW_SECONDS
from src.modules.sentimento.use_cases.collect_liquidation_history import (
    LiquidationCollectorState,
    LiquidationFetch,
    collect_liquidation_history_once,
)
from tests.sentimento.test_collect_liquidation_history import (
    _RECOIL,
    _SETTLED_START,
    _FakeClock,
)
from tests.sentimento.test_liquidation_collector_gate import _StampingSource, _worst_window


class _StoppableClock(_FakeClock):
    """`infra/collectors_cli._SystemCollectorClock`, reproduced exactly: `stop_event.wait`.

    That class sleeps with `stop_event.wait(seconds)` — deliberately, so a `SIGTERM` mid-pause
    does not hold the process hostage (`SPEC-004` 3.1). The consequence this reproduces is the
    other half of that choice: ONCE THE FLAG IS SET, EVERY PAUSE BECOMES A NO-OP, including the
    `RS-3.6` spread between symbols.
    """

    def __init__(self, stop_event: threading.Event) -> None:
        """Bind to the same flag the real collector binds to."""
        super().__init__()
        self._stop_event = stop_event

    def sleep(self, seconds: float) -> None:
        """Pause, unless the process was asked to stop — exactly as the real clock does."""
        self.slept.append(seconds)
        if not self._stop_event.is_set():
            self._monotonic += seconds


def test_a_sigterm_mid_cycle_does_not_turn_the_remaining_calls_into_a_burst() -> None:
    """`RS-3.6` must survive shutdown: the spread is a QUOTA guarantee, not a comfort pause.

    `collect_liquidation_history_once` iterates the whole symbol universe with no reference to
    the stop flag, and `_SystemCollectorClock.sleep` returns instantly once that flag is set. So
    a `SIGTERM` arriving after the first symbol makes the remaining nine calls fire AT THE SAME
    INSTANT — the burst `RS-3.6` names, and it lands in the same 60 s window the container's
    replacement will start spending against, because `SlidingQuotaWindow` lives in the process
    that just died and the new one starts its count at zero.

    "Média não é pico" is precisely this: the cycle's average is still 2 u/min.

    Either answer satisfies this test — stop iterating when the flag is set, or keep pacing on
    the way out. What may not stand is nine calls in one instant.
    """
    stop = threading.Event()
    clock = _StoppableClock(stop)
    symbols = [f"SYM{index}" for index in range(10)]

    class _SigtermAfterFirst(_StampingSource):
        def fetch(self, path: str) -> LiquidationFetch:
            """Answer, and raise the stop flag once the first call is out."""
            answer = super().fetch(path)
            stop.set()
            return answer

    source = _SigtermAfterFirst(clock, [LiquidationFetch(status=200, body=b"[]")])
    collect_liquidation_history_once(
        symbols=symbols,
        source=source,
        clock=clock,
        state=LiquidationCollectorState(),
        recoil=_RECOIL,
        publish=lambda *_: None,
        cycle_seconds=300.0,
    )
    assert _worst_window(source.at, QUOTA_WINDOW_SECONDS) <= 2, (
        f"{len(source.at)} calls left the machine, "
        f"{_worst_window(source.at, QUOTA_WINDOW_SECONDS)} of them inside one 60 s window, "
        f"after the stop flag was set — the RS-3.6 spread is disabled by shutdown"
    )


def test_a_body_for_a_different_symbol_is_an_unanswered_symbol_and_not_this_ones_data() -> None:
    """`RS-3.7`: the question is whether THIS symbol came back, not whether SOMETHING did.

    `_collect_one_symbol` sets `answered = len(answered_symbols(body)) > 0` — it counts the
    entries in the response and never compares them with the symbol it asked for. A body naming
    another instrument therefore (i) files no `IngestGap` for the symbol that really was not
    answered, and (ii) publishes that other instrument's points UNDER THE REQUESTED SYMBOL,
    because `parse_daily_points` does not check the name either.

    This is the same class of silence `MEDIÇÃO §3.1` measured on the batched call (20 asked, 19
    returned, nothing in the payload saying which one was dropped): the collector reads a
    shorter or different array and reports success.
    """
    clock = _FakeClock()
    wrong = json.dumps(
        [{"symbol": "ETHUSDT_PERP.A", "history": [{"t": _SETTLED_START, "l": 9, "s": 9}]}]
    ).encode("utf-8")
    source = _StampingSource(clock, [LiquidationFetch(status=200, body=wrong)])
    published: list[tuple[str, str, int, str]] = []
    result = collect_liquidation_history_once(
        symbols=["BTCUSDT"],
        source=source,
        clock=clock,
        state=LiquidationCollectorState(),
        recoil=_RECOIL,
        publish=lambda *row: published.append(row),
    )
    assert result.unanswered == ("BTCUSDT",), (
        "the provider answered about another instrument and BTCUSDT was recorded as answered"
    )
    assert [row[0] for row in published] == [], (
        f"another instrument's points were published under BTCUSDT: {published}"
    )
