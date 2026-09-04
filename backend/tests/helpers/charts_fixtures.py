"""Synthetic fixtures for `charts` tests — NOT the raw datasets `D8.1`/`D8.6`/`D8.7` measured.

`CLAUDE.md`, "Dado bruto não é versionado": the real taker/funding datasets that produced
`951/2013 (47,2%)`, `máx 2055,3%`, and `max = 2,4017` live nowhere in this repository — they
were live measurements over `data/`, which is gitignored, and `T-08.6` has no cataloged fixture
under `data/MANIFEST.md` for them (unlike `tests/helpers/data_fixtures.py`'s
`require_fixture`, which DOES point at real on-disk bytes for other tasks).

So the two builders below manufacture DETERMINISTIC, SEEDED, CONTINUOUS-VALUED populations that
reproduce the SHAPE the ADR's falsifier asks for — not the literal 2013 raw observations, which
this repository does not hold. Each builder documents exactly which property is real
reconstruction (deterministic by seed, provable from the construction) and which number is
injected on purpose (the maximum, planted to match the ADR's own citation).
"""

from __future__ import annotations

import random


def synthetic_taker_like_population(*, extreme: float = 2055.3) -> tuple[float, ...]:
    """Return 2013 synthetic, continuous "%"-valued observations.

    The shape `ADR-020`'s falsifier needs.

    `D8.6`, literal: "951 de 2013 (47,2%) caem fora à direita, máx 2055,3%" under the OLD fixed
    11-edge table. This fixture does not reproduce the raw dataset (unavailable, see module
    docstring) — it reproduces the property the falsifier checks: a right tail whose share is
    PROPORTIONAL to a declared quantile (`q=99` asks for ~1%), never the 47,2% the fixed table
    produced, with the maximum observed value pinned at `2055,3` so `overflowRight.extreme` has
    something exact to match.

    2012 values are drawn `Random(20260906).uniform(-80.0, 95.0)` — a CONTINUOUS distribution,
    so no two draws collide and no point mass forms by construction (`test_histogram.py` and
    `test_scan.py` both assert `point_masses == ()` against this fixture, which is the intended
    contrast with `synthetic_funding_like_population` below). The 2013th value is `extreme`
    itself: strictly larger than the uniform range's own maximum (95.0 << 2055.3), so it is
    ALWAYS the single largest observation, deterministically, regardless of the other 2012.
    """
    rng = random.Random(20260906)  # noqa: S311 (deterministic test fixture, not crypto)
    body = tuple(rng.uniform(-80.0, 95.0) for _ in range(2012))
    return (*body, extreme)


def synthetic_funding_like_population(
    *, point_mass_value: float = 0.0001, point_mass_share: float = 0.76
) -> tuple[float, ...]:
    """1500 synthetic funding-like observations, most of them ONE repeated value.

    `D8.7`'s shape: "massa em `interestRate(símbolo,data)`: 0,0001 em 665 símbolos" (share ≈
    0,76 of the 873-symbol universe `D8.7` measured against).

    1140 of 1500 values (share 0,76) are exactly `point_mass_value`; the remaining 360 are
    drawn `Random(20260907).uniform(-0.0005, 0.0005)` — continuous, so none of them collides
    with `point_mass_value` or with each other (a coincidental collision would silently grow
    the point mass beyond the 1140 this function promises, which is exactly the kind of
    silent drift a fixture must not have).
    """
    rng = random.Random(20260907)  # noqa: S311 (deterministic test fixture, not crypto)
    mass_count = round(1500 * point_mass_share)
    spread_count = 1500 - mass_count
    spread = tuple(rng.uniform(-0.0005, 0.0005) for _ in range(spread_count))
    return (point_mass_value,) * mass_count + spread


def synthetic_btc_like_population(*, maximum: float = 2.4017) -> tuple[float, ...]:
    """Return a small BTC-only population whose maximum is exactly `2,4017`.

    `D8.1`'s own regression: "`scan` com `Absolute{5.0}` sobre BTC/30d -> 0 linhas,
    `distribution` mostra `max = 2,4017`".

    100 values drawn `Random(20260908).uniform(-1.0, 2.0)`, plus the maximum itself planted as
    the 101st — same technique as `synthetic_taker_like_population`: the injected value is
    always the single largest, so `HistogramResult.overflow_right.extreme` (with a recipe whose
    top edge is below it) and `max(values)` agree by construction, not by luck.
    """
    rng = random.Random(20260908)  # noqa: S311 (deterministic test fixture, not crypto)
    body = tuple(rng.uniform(-1.0, 2.0) for _ in range(100))
    return (*body, maximum)
