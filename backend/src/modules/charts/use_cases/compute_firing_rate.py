"""`compute_firing_rate` — `ADR-020/D5`'s use case, decided only as far as `D5` itself decides.

`D5` fixes the TYPE (`FiringRateResult` is `in_sample` xor `walk_forward`, `rate` absent by
type on the first) and states, literally, that "a regra de QUANDO usar cada modo é `T-08.8`,
não esta task." This use case therefore implements exactly one branch — the degenerate
`in_sample` case that already has a full rule (`calib_window == eval_window`) — and REFUSES,
by name, the other: computing a walk-forward `rate` needs the OOS split/window-count rule
`T-08.8` has not decided yet, and inventing one here would be exactly the debt this module
exists to avoid leaving silent.
"""

from __future__ import annotations

from src.modules.charts.domain.firing_rate import FiringRateResult, InSampleFiringRate, Window


class WalkForwardRuleNotDecidedError(Exception):
    """`calib_window != eval_window` needs a rule `ADR-020/D5` reserves for `T-08.8`.

    Window count, OOS split, and the honesty of the resulting `rate` are not decided by this
    ADR, and this use case refuses to guess at them.
    """


def compute_firing_rate(*, calib_window: Window, eval_window: Window) -> FiringRateResult:
    """Build the `in_sample` branch when `calib_window == eval_window`; refuse otherwise.

    `D8.2`'s trap is a UI showing a walk-forward-shaped number for a tautological cell — this
    function is the one place that decides WHICH branch of `FiringRateResult` gets built, and
    it only ever builds the branch `ADR-020/D5` already fully specifies.
    """
    if calib_window == eval_window:
        return InSampleFiringRate(calib_window=calib_window, eval_window=eval_window)
    raise WalkForwardRuleNotDecidedError(
        f"calib_window={calib_window!r} != eval_window={eval_window!r}: walk-forward mode "
        f"requires T-08.8's rule (window count, OOS split), which ADR-020/D5 explicitly does "
        f"not decide — this use case only builds the type-safe in_sample degenerate case today"
    )
