"""`CA-8′` — the falsifier that REPLACES `CA-8`, in the four layers `T-03.7` names.

`plano 03` DoD 1 (`docs/plans/SPEC-008-candle-real-e-eixo-unico/03_timeframe.md`), `SPEC-008`
§5.4, `ADR-040/D2`, `tasks.toml::T-03.7`.

`PRD-008`'s `CA-8` (*"OI reagregado a `1h` == último do bucket, e ≠ soma dos 12 de `5min`"*) was
RETIRED — not extended, retired — because `JULGAMENTO-QUANT-ARCHITECT.md` §4 measured it MORDE
only `last↔Σ` (1 swap of 20 possible) and passes GREEN over the degenerate `o=h=l=c` candle
`RN-2` measures the live view-model produces (`view-model.ts:30-38`): on a flat candle the five
candidate functions (`Σ`, `first`, `max`, `min`, `last`) all COINCIDE, so any wrong pick in
`REDUCTION_TABLE` (`domain/series_reduction.py`) would still pass. A falsifier that cannot fail
under a real defect is `ADR-012`'s `rc=0` again — silence dressed as a passing test.

`T-03.1`'s `test_series_reduction.py` already proves `reduce_bucket` disagrees pairwise across
the 5 functions, on TOY-sized `values`. This file is CA-8′'s own four layers, over a REAL
market fixture, and it is what closes the gap the retired `CA-8` left open:

  (a) a NON-DEGENERACY GUARD, which runs first — the rest measures nothing over a flat candle;
  (b) the fixture ITSELF, collected from the Binance origin (`[P-seed]`: reading the origin is
      not seeding — `md.series` would have INHERITED `klines_volume`'s own measured
      `-2,2%..-4,5%` understatement, `JULGAMENTO-QUANT-ARCHITECT.md` §4.2), with every literal
      pinned against the normative table below, auto-verifiable by the owner on Binance's own
      `BTCUSDT` `4h` chart;
  (c) the EXHAUSTIVE matrix — every one of the 8 `(nature, reduction)` pairs `REDUCTION_TABLE`
      covers, against all 5 candidate functions, asserting the declared one alone matches;
  (d) a COVERAGE ABLATION (81 of 240 minutes present) proving the served `Σ` is the partial
      total, never `mean(present) × expected` — the shape silent extrapolation would take.

── THE FIXTURE, AND THE COMMAND THAT PRODUCED IT ────────────────────────────────────────────

`BTCUSDT`, `1m` → `4h`, the CLOSED bucket `2026-09-18 12:00 → 16:00 UTC`
(`window_start_ms=1_789_732_800_000`, `window_end_ms=1_789_747_199_999`), `240/240` minutes
present — the SAME window `JULGAMENTO-QUANT-ARCHITECT.md` §4.1 names:

```bash
curl -s "https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1m\
&startTime=1789732800000&endTime=1789747199999&limit=241"
```

`[MEDIDO 2026-09-22]` — the array below (`_RAW_1M_BTCUSDT_20260918_1200_1600_UTC`) is that
response's `[open, high, low, close, volume]` fields, `float()`-parsed verbatim, `n=240`. It
reproduces `JULGAMENTO-QUANT-ARCHITECT.md` §4.1's own table to the cent (`test_ca8_prime_camada_b_…`
below pins the match), so the two measurements — theirs on `2026-09-19`, this one on `2026-09-22`
— agree on a bucket that has since CLOSED and cannot move.

⚠️ THIS FIXTURE IS NOT SEMEADURA (`[P-seed]`). Nothing here is written to `md.series` or read
from it; the array is a literal transcription of the origin's own published bytes, exactly the
role `OriginCandle` plays in `domain/candle_fidelity.py` for the 1-minute fidelity check — this
file is that same discipline applied to the REAGGREGATION layer `T-03.1`/`T-03.3` built on top.

── WHY "8 PAIRS × 5 FUNCTIONS" LANDS ON THE SAME "20" THE PLAN NAMES ────────────────────────

`REDUCTION_TABLE` has 8 `(nature, reduction)` entries, but only 5 DISTINCT (column, function)
SCENARIOS: `(STOCK, CLOSE)`, `(STOCK, LAST)`, `(STOCK, POINT)` and `(RATIO, POINT)` all reduce
through `last` over the SAME `close` column (`series_reduction.py`'s one documented collision,
transcribed again below). Camada (c) parametrizes over all 8 pairs (`8 × 5 = 40` cells), but the
INFORMATIVE ones — where a wrong function's value actually differs from the pair's own literal —
collapse to `5 scenarios × 4 wrong functions = 20`, verified by direct computation over this
fixture (`[MEDIDO 2026-09-22]`: no wrong function coincides with its scenario's correct value on
real, non-degenerate data) — the exact count `plano 03` DoD 1(c) and `SPEC-008` §5.4 name.
"""

from __future__ import annotations

from collections.abc import Callable
from decimal import Decimal

import pytest

from src.modules.charts.domain.panel_grid_enablement import classify_grid_multiple
from src.modules.sentimento.domain.as_of_accessor import BarPolicy, Observation
from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.domain.series_catalog import SeriesCatalog, SeriesCatalogEntry
from src.modules.sentimento.domain.series_history_report import BucketCoverage, PanelGridVerdict
from src.modules.sentimento.domain.series_key import (
    Nature,
    QuantityField,
    Reduction,
    SeriesKey,
    TsConvention,
)
from src.modules.sentimento.domain.series_reduction import REDUCTION_TABLE, reduce_bucket
from src.modules.sentimento.use_cases.series_history import build_series_history_report

_SYMBOL = "BTCUSDT"
_GRID_MS = 60_000
_FOUR_HOUR_MS = 4 * 60 * _GRID_MS  # 14_400_000

# `open_time_ms` of the FIRST minute of the window, `2026-09-18 12:00:00 UTC`. The origin labels
# a kline by its OPEN, and `240` consecutive 1-minute opens from here reach `15:59:00 UTC`, the
# last minute of the closed `[12:00, 16:00)` bucket — `curl` command and window above.
_WINDOW_START_MS = 1_789_732_800_000

_OHLCV = tuple[float, float, float, float, float]

# `[open, high, low, close, volume]` of each of the 240 real 1-minute klines, `float()`-parsed
# verbatim off the origin's own JSON array — see the module docstring for the exact `curl`.
_RAW_1M_BTCUSDT_20260918_1200_1600_UTC: tuple[_OHLCV, ...] = (
    (78031.0, 78047.0, 77984.4, 77984.4, 71.115),
    (77984.4, 77991.8, 77979.0, 77989.3, 86.942),
    (77989.3, 78039.2, 77960.9, 77990.3, 177.404),
    (77990.2, 78006.1, 77982.0, 78006.0, 43.483),
    (78006.0, 78095.6, 77983.9, 78081.4, 123.347),
    (78081.4, 78087.4, 78006.9, 78015.2, 85.752),
    (78015.1, 78022.6, 77996.6, 77999.2, 29.699),
    (77999.3, 78020.3, 77996.7, 77996.8, 31.909),
    (77996.8, 78019.4, 77996.8, 78002.3, 24.694),
    (78002.4, 78002.4, 77958.9, 77980.8, 88.39),
    (77980.9, 78005.0, 77976.8, 77985.3, 79.867),
    (77985.4, 77994.5, 77955.0, 77969.6, 122.957),
    (77969.6, 77993.8, 77969.6, 77993.8, 36.0),
    (77993.8, 78060.0, 77985.4, 78059.9, 106.797),
    (78060.0, 78082.7, 78033.0, 78057.1, 85.215),
    (78057.1, 78080.0, 78057.1, 78066.7, 48.221),
    (78066.8, 78066.8, 78036.7, 78043.3, 104.375),
    (78043.3, 78057.3, 78036.9, 78037.0, 16.734),
    (78036.9, 78037.0, 77983.4, 77996.7, 94.606),
    (77996.7, 77996.7, 77970.1, 77970.2, 41.234),
    (77970.1, 78000.0, 77933.9, 77975.4, 150.941),
    (77975.5, 78000.0, 77953.1, 78000.0, 65.573),
    (77999.9, 78053.1, 77999.9, 78040.9, 50.045),
    (78040.9, 78040.9, 77969.3, 77969.4, 35.477),
    (77969.3, 77976.5, 77964.8, 77966.6, 42.582),
    (77966.6, 77996.3, 77966.6, 77970.7, 59.588),
    (77970.7, 77992.9, 77944.8, 77973.1, 82.627),
    (77973.0, 77989.2, 77973.0, 77987.1, 27.433),
    (77987.0, 78017.9, 77978.6, 78017.8, 48.728),
    (78017.9, 78017.9, 77983.0, 77983.0, 40.605),
    (77983.0, 77997.3, 77942.0, 77963.1, 111.181),
    (77963.1, 77985.1, 77951.0, 77978.7, 69.522),
    (77978.7, 78000.0, 77973.0, 77999.4, 34.796),
    (77999.4, 78053.1, 77990.8, 78047.3, 57.149),
    (78047.3, 78055.5, 78047.0, 78052.9, 28.591),
    (78053.0, 78080.0, 78042.0, 78080.0, 106.904),
    (78080.0, 78084.0, 78079.8, 78084.0, 29.595),
    (78083.9, 78089.6, 78051.5, 78062.5, 85.766),
    (78062.4, 78089.6, 78062.4, 78089.6, 18.344),
    (78089.6, 78134.8, 78081.2, 78134.8, 76.021),
    (78134.9, 78158.2, 78116.2, 78117.5, 103.202),
    (78117.6, 78117.6, 78068.7, 78076.3, 34.151),
    (78076.3, 78099.8, 78076.3, 78099.8, 26.577),
    (78099.8, 78141.4, 78099.7, 78128.3, 55.45),
    (78128.3, 78128.3, 78070.6, 78074.6, 51.356),
    (78074.6, 78109.6, 78069.3, 78100.1, 188.098),
    (78100.1, 78104.5, 78071.3, 78071.4, 29.629),
    (78071.4, 78089.4, 78057.1, 78077.8, 39.69),
    (78077.8, 78077.8, 78047.6, 78048.4, 44.106),
    (78048.4, 78063.7, 78048.4, 78048.6, 14.811),
    (78048.6, 78062.6, 78024.4, 78025.9, 41.137),
    (78026.0, 78073.6, 78025.9, 78045.1, 50.418),
    (78045.0, 78064.6, 78045.0, 78058.3, 34.195),
    (78058.2, 78058.3, 77990.8, 77992.3, 88.652),
    (77992.2, 78018.2, 77987.4, 78014.1, 65.844),
    (78014.2, 78014.2, 77996.9, 78005.5, 20.555),
    (78005.6, 78024.3, 78005.5, 78024.2, 33.366),
    (78024.2, 78024.3, 78001.9, 78004.9, 47.875),
    (78005.0, 78020.9, 77990.1, 77999.7, 48.538),
    (77999.8, 78004.9, 77999.6, 78004.8, 17.336),
    (78004.9, 78019.9, 77994.1, 78019.9, 46.732),
    (78020.0, 78036.4, 78001.8, 78007.6, 42.502),
    (78007.5, 78007.6, 77941.6, 77944.8, 79.097),
    (77944.9, 77971.0, 77923.5, 77966.0, 163.967),
    (77966.0, 78024.5, 77966.0, 78006.0, 70.937),
    (78006.0, 78049.3, 78000.5, 78040.8, 90.078),
    (78040.8, 78051.6, 78000.0, 78000.0, 45.713),
    (78000.0, 78005.8, 77979.8, 78004.2, 54.069),
    (78004.2, 78027.8, 77990.9, 78017.6, 62.745),
    (78017.7, 78017.7, 77997.1, 77998.8, 18.725),
    (77998.8, 78019.9, 77982.5, 78013.1, 70.604),
    (78013.2, 78013.2, 77980.0, 77980.6, 70.487),
    (77980.6, 77992.0, 77964.2, 77964.5, 89.24),
    (77964.6, 77979.5, 77964.5, 77972.6, 28.586),
    (77972.6, 77999.4, 77972.6, 77999.4, 41.416),
    (77999.4, 78003.5, 77994.8, 78003.4, 38.112),
    (78003.5, 78025.3, 78003.4, 78023.2, 58.764),
    (78023.2, 78023.2, 78023.1, 78023.2, 14.012),
    (78023.2, 78059.8, 78023.1, 78059.7, 89.486),
    (78059.8, 78068.9, 78052.1, 78068.9, 68.833),
    (78068.9, 78100.1, 78068.8, 78099.7, 171.215),
    (78099.7, 78119.3, 78099.6, 78105.7, 63.129),
    (78105.7, 78119.0, 78101.4, 78111.0, 69.079),
    (78111.0, 78117.2, 78052.3, 78058.1, 81.924),
    (78058.2, 78065.2, 78038.0, 78042.6, 28.963),
    (78042.7, 78042.7, 78021.0, 78033.6, 80.221),
    (78033.7, 78077.1, 78021.0, 78042.4, 112.67),
    (78042.4, 78124.0, 78042.3, 78124.0, 99.891),
    (78124.0, 78140.0, 78083.8, 78140.0, 128.539),
    (78139.9, 78142.8, 78139.9, 78142.8, 55.028),
    (78142.8, 78187.2, 78100.6, 78187.2, 189.885),
    (78187.2, 78273.6, 78187.1, 78229.3, 433.703),
    (78229.3, 78264.5, 78152.3, 78236.8, 184.273),
    (78236.8, 78299.8, 78216.3, 78298.9, 352.066),
    (78299.0, 78376.8, 78275.4, 78353.6, 419.448),
    (78353.6, 78388.0, 78309.8, 78317.4, 246.528),
    (78317.3, 78393.9, 78304.9, 78391.8, 251.211),
    (78391.8, 78440.0, 78346.6, 78439.9, 352.797),
    (78440.0, 78595.3, 78434.4, 78582.1, 1240.633),
    (78582.2, 78940.9, 78582.2, 78925.9, 2528.646),
    (78926.0, 79169.5, 78859.5, 78953.7, 2427.272),
    (78953.8, 79001.7, 78828.3, 78841.1, 1287.997),
    (78841.0, 79084.0, 78839.6, 79082.6, 748.123),
    (79082.6, 79188.0, 79067.4, 79146.1, 1087.031),
    (79146.2, 79298.0, 79138.5, 79270.1, 1386.144),
    (79270.0, 79388.0, 79196.2, 79373.3, 1247.136),
    (79373.3, 79742.8, 79373.2, 79715.0, 3456.482),
    (79715.0, 79946.4, 79678.2, 79914.3, 2782.836),
    (79914.3, 79925.6, 79745.9, 79817.5, 1234.935),
    (79817.5, 79988.0, 79800.0, 79980.0, 1284.821),
    (79979.9, 80078.8, 79903.9, 80061.7, 1676.773),
    (80061.7, 80486.5, 80041.3, 80419.1, 3426.147),
    (80419.1, 80452.5, 80267.1, 80364.2, 1791.608),
    (80364.1, 80415.9, 80225.3, 80361.5, 1214.433),
    (80361.4, 80361.5, 80016.8, 80020.0, 1744.739),
    (80016.8, 80088.4, 79881.8, 79974.2, 2037.424),
    (79974.1, 80140.1, 79904.9, 80050.2, 805.629),
    (80050.2, 80111.5, 79906.7, 79906.8, 519.432),
    (79906.7, 79990.2, 79867.7, 79985.8, 586.021),
    (79985.8, 80046.7, 79919.8, 80046.5, 429.766),
    (80046.5, 80304.5, 80043.1, 80269.3, 1445.443),
    (80269.4, 80342.6, 80134.8, 80134.9, 816.054),
    (80134.8, 80204.3, 80093.4, 80102.0, 942.393),
    (80102.0, 80279.3, 80088.7, 80219.8, 458.796),
    (80219.9, 80347.6, 80193.1, 80336.4, 672.13),
    (80336.4, 80588.0, 80325.1, 80471.1, 1967.116),
    (80471.0, 80519.7, 80342.7, 80405.9, 778.948),
    (80405.8, 80482.4, 80311.0, 80311.0, 600.899),
    (80311.1, 80344.5, 80106.2, 80120.0, 1510.151),
    (80120.1, 80280.0, 80062.9, 80188.3, 860.53),
    (80188.2, 80206.3, 80089.9, 80148.9, 426.91),
    (80148.9, 80291.6, 80123.3, 80246.5, 319.448),
    (80246.5, 80254.0, 80153.3, 80206.2, 230.805),
    (80206.3, 80299.4, 80199.1, 80291.6, 283.516),
    (80291.5, 80291.6, 80220.5, 80279.6, 164.447),
    (80279.6, 80447.7, 80279.5, 80424.3, 358.298),
    (80424.3, 80489.8, 80424.3, 80488.0, 570.63),
    (80488.0, 80493.6, 80345.1, 80405.1, 367.706),
    (80405.1, 80574.4, 80405.1, 80529.8, 593.081),
    (80529.8, 80666.0, 80522.7, 80610.4, 1397.727),
    (80610.4, 80699.0, 80574.9, 80688.0, 1038.658),
    (80687.9, 80798.0, 80639.6, 80739.1, 1636.112),
    (80739.1, 80873.9, 80706.7, 80789.9, 1169.986),
    (80789.8, 80939.3, 80779.9, 80865.0, 772.202),
    (80865.0, 80950.0, 80848.3, 80920.8, 525.726),
    (80920.7, 80929.6, 80697.3, 80707.7, 837.127),
    (80707.7, 80769.9, 80596.4, 80617.5, 800.006),
    (80617.5, 80707.5, 80519.1, 80689.4, 782.402),
    (80689.4, 80795.8, 80665.2, 80713.5, 516.822),
    (80713.6, 80768.2, 80660.1, 80660.1, 435.822),
    (80660.2, 80704.7, 80516.5, 80548.0, 603.202),
    (80548.0, 80630.8, 80481.2, 80481.2, 773.79),
    (80481.3, 80638.1, 80453.6, 80574.7, 652.624),
    (80574.7, 80683.5, 80533.5, 80644.6, 454.949),
    (80644.5, 80648.9, 80532.8, 80615.6, 351.227),
    (80615.6, 80700.0, 80580.0, 80700.0, 348.247),
    (80700.0, 80778.6, 80681.5, 80778.6, 448.543),
    (80778.6, 80778.6, 80560.8, 80635.8, 427.007),
    (80635.8, 80635.8, 80540.5, 80548.8, 261.109),
    (80548.8, 80602.0, 80506.8, 80595.3, 333.368),
    (80595.3, 80688.0, 80558.6, 80688.0, 285.602),
    (80688.0, 80760.7, 80679.9, 80715.4, 357.664),
    (80715.4, 80762.5, 80642.7, 80658.3, 229.697),
    (80658.4, 80688.0, 80597.9, 80678.7, 151.586),
    (80678.6, 80760.6, 80669.7, 80747.9, 350.079),
    (80747.9, 80776.5, 80675.1, 80706.7, 271.668),
    (80706.7, 80759.7, 80701.6, 80758.8, 154.588),
    (80758.8, 80788.0, 80740.0, 80766.1, 258.754),
    (80766.1, 80868.9, 80766.1, 80861.9, 490.363),
    (80862.0, 80920.4, 80816.1, 80827.4, 549.495),
    (80827.3, 80877.5, 80781.8, 80825.0, 414.783),
    (80825.0, 80915.2, 80807.7, 80900.2, 358.534),
    (80900.1, 80915.5, 80824.8, 80899.7, 242.11),
    (80899.7, 80900.0, 80819.0, 80861.8, 230.832),
    (80861.8, 80933.0, 80815.7, 80879.8, 264.581),
    (80879.8, 80880.9, 80839.4, 80851.6, 131.043),
    (80851.6, 80900.0, 80814.0, 80845.8, 268.26),
    (80845.8, 80870.1, 80778.2, 80836.1, 253.481),
    (80836.2, 80885.4, 80818.7, 80867.2, 119.236),
    (80867.1, 80906.0, 80831.4, 80906.0, 163.235),
    (80905.9, 81034.9, 80875.5, 80921.4, 1163.266),
    (80921.5, 81033.9, 80863.2, 80916.9, 562.528),
    (80916.8, 80933.5, 80789.0, 80808.3, 346.717),
    (80808.4, 80814.0, 80660.3, 80662.6, 616.194),
    (80662.6, 80750.0, 80662.6, 80682.5, 355.201),
    (80682.6, 80825.8, 80668.6, 80825.8, 248.924),
    (80825.8, 80855.8, 80760.4, 80763.5, 357.916),
    (80763.5, 80815.3, 80717.7, 80780.0, 202.742),
    (80779.9, 80780.0, 80686.9, 80736.0, 180.268),
    (80736.1, 80741.5, 80550.8, 80557.7, 527.164),
    (80557.7, 80609.0, 80544.0, 80573.9, 319.511),
    (80573.9, 80602.3, 80538.7, 80600.9, 283.198),
    (80600.8, 80620.0, 80530.8, 80530.9, 197.942),
    (80530.8, 80628.5, 80530.8, 80624.6, 255.114),
    (80624.6, 80747.8, 80616.2, 80735.6, 235.954),
    (80735.6, 80947.0, 80728.7, 80889.8, 443.604),
    (80889.9, 81068.0, 80889.8, 80961.2, 978.65),
    (80961.1, 81000.0, 80837.3, 80839.6, 402.239),
    (80839.6, 80930.3, 80835.3, 80843.5, 328.633),
    (80843.5, 80906.0, 80830.0, 80861.2, 108.645),
    (80861.1, 80888.0, 80827.0, 80873.7, 97.978),
    (80873.6, 80886.6, 80808.7, 80835.0, 105.212),
    (80835.1, 80930.3, 80835.1, 80930.3, 143.554),
    (80930.2, 81025.0, 80930.2, 80976.0, 467.49),
    (80976.1, 81077.7, 80964.0, 81062.6, 487.619),
    (81062.6, 81156.8, 80994.6, 81000.1, 1005.569),
    (81000.0, 81000.0, 80921.8, 80927.5, 218.483),
    (80927.5, 80992.3, 80926.6, 80931.4, 243.274),
    (80931.4, 80947.2, 80863.5, 80875.7, 196.513),
    (80875.8, 80926.4, 80850.0, 80926.3, 201.684),
    (80926.4, 80933.6, 80806.0, 80806.5, 306.161),
    (80806.6, 80850.0, 80788.7, 80828.5, 239.125),
    (80828.5, 80828.5, 80707.3, 80707.4, 225.012),
    (80707.4, 80750.0, 80679.0, 80735.4, 227.125),
    (80735.3, 80786.3, 80692.2, 80786.3, 183.562),
    (80786.3, 80828.5, 80749.8, 80759.0, 209.361),
    (80759.0, 80809.2, 80708.5, 80728.0, 202.884),
    (80728.1, 80820.0, 80728.0, 80782.8, 164.249),
    (80782.8, 80794.0, 80711.0, 80711.0, 95.903),
    (80711.1, 80747.7, 80710.8, 80729.1, 108.919),
    (80729.2, 80738.0, 80687.0, 80737.9, 139.275),
    (80737.9, 80737.9, 80680.0, 80701.4, 112.805),
    (80701.5, 80709.7, 80658.3, 80709.6, 119.796),
    (80709.7, 80709.7, 80660.0, 80660.1, 90.178),
    (80660.0, 80660.1, 80611.3, 80611.3, 159.157),
    (80611.3, 80611.4, 80467.5, 80521.8, 626.12),
    (80521.7, 80630.8, 80521.0, 80630.7, 387.109),
    (80630.8, 80641.7, 80597.8, 80641.7, 123.799),
    (80641.6, 80692.0, 80641.6, 80682.4, 101.638),
    (80682.4, 80709.7, 80638.9, 80644.7, 96.779),
    (80644.6, 80724.4, 80644.6, 80714.8, 240.156),
    (80714.9, 80787.9, 80714.8, 80787.8, 87.485),
    (80787.9, 80787.9, 80718.7, 80722.7, 94.094),
    (80722.5, 80750.0, 80673.0, 80696.3, 116.527),
    (80696.4, 80699.9, 80660.0, 80672.6, 121.062),
    (80672.5, 80676.9, 80600.4, 80600.5, 216.818),
    (80600.5, 80634.7, 80577.0, 80611.6, 171.096),
    (80611.6, 80717.9, 80611.6, 80717.9, 135.056),
    (80717.9, 80733.3, 80642.4, 80664.1, 187.605),
    (80664.1, 80696.2, 80615.0, 80688.7, 151.149),
)


def _column(index: int) -> list[float]:
    """Return one OHLCV field across all 240 real minutes, in ascending `event_time` order."""
    return [row[index] for row in _RAW_1M_BTCUSDT_20260918_1200_1600_UTC]


_FIXTURE_COLUMNS: dict[str, list[float]] = {
    "open": _column(0),
    "high": _column(1),
    "low": _column(2),
    "close": _column(3),
    "volume": _column(4),
}

# The normative table `JULGAMENTO-QUANT-ARCHITECT.md` §4.1 / `plano 03` DoD 1(b) transcribes,
# literal — the numbers the owner checks against Binance's own `BTCUSDT` `4h` chart.
_EXPECTED_SUM_VOLUME = 93_465.237
_EXPECTED_FIRST_OPEN = 78_031.00
_EXPECTED_MAX_HIGH = 81_156.80
_EXPECTED_MIN_LOW = 77_923.50
_EXPECTED_LAST_CLOSE = 80_688.70

# The CONTRAFACTUAL each row of the plan's table names — what the WRONG function would have
# served instead, transcribed the same way.
_WRONG_MAX_CLOSE = 81_062.60  # `max(close)` in place of `max(high)` — `-94,20`, `-11,7 bp`
_WRONG_MIN_CLOSE = 77_944.80  # `min(close)` in place of `min(low)` — `+21,30`, `+2,7 bp`
_WRONG_FIRST_CLOSE = 77_984.40  # `first(close)` in place of `last(close)` — `-2.704,30`, `-3,35%`

# `(nature, reduction) -> (fixture column, expected literal)` — the 8 pairs `REDUCTION_TABLE`
# covers, mapped onto the 5 real scenarios above. The 4 pairs that share `last` over `close`
# (`CLOSE`/`LAST`/`POINT`-stock/`POINT`-ratio) are `series_reduction.py`'s own documented
# collision (module docstring, "the one collision the julgamento measured") — reused here on
# purpose, not an oversight, exactly the reason "8 × 5 = 40 cells / 20 informative" holds.
_PAIR_SCENARIOS: dict[tuple[Nature, Reduction], tuple[str, float]] = {
    (Nature.FLOW, Reduction.SUM): ("volume", _EXPECTED_SUM_VOLUME),
    (Nature.STOCK, Reduction.OPEN): ("open", _EXPECTED_FIRST_OPEN),
    (Nature.STOCK, Reduction.HIGH): ("high", _EXPECTED_MAX_HIGH),
    (Nature.STOCK, Reduction.LOW): ("low", _EXPECTED_MIN_LOW),
    (Nature.STOCK, Reduction.CLOSE): ("close", _EXPECTED_LAST_CLOSE),
    (Nature.STOCK, Reduction.LAST): ("close", _EXPECTED_LAST_CLOSE),
    (Nature.STOCK, Reduction.POINT): ("close", _EXPECTED_LAST_CLOSE),
    (Nature.RATIO, Reduction.POINT): ("close", _EXPECTED_LAST_CLOSE),
}

# `(nature, reduction) -> the name of the ONE function `REDUCTION_TABLE` declares for it.
_CORRECT_FUNCTION_NAME: dict[tuple[Nature, Reduction], str] = {
    (Nature.FLOW, Reduction.SUM): "sum",
    (Nature.STOCK, Reduction.OPEN): "first",
    (Nature.STOCK, Reduction.HIGH): "max",
    (Nature.STOCK, Reduction.LOW): "min",
    (Nature.STOCK, Reduction.CLOSE): "last",
    (Nature.STOCK, Reduction.LAST): "last",
    (Nature.STOCK, Reduction.POINT): "last",
    (Nature.RATIO, Reduction.POINT): "last",
}

# The 5 candidate functions `ADR-040/D2`'s julgamento names — applied uniformly to whichever
# column a pair's own `_PAIR_SCENARIOS` entry points at. Never `reduce_bucket` itself: these are
# the INDEPENDENT reference implementations camada (c) checks `reduce_bucket` against.
_CANDIDATE_FUNCTIONS: dict[str, Callable[[list[float]], float]] = {
    "sum": lambda values: float(sum(values)),
    "first": lambda values: float(values[0]),
    "max": lambda values: float(max(values)),
    "min": lambda values: float(min(values)),
    "last": lambda values: float(values[-1]),
}


# ── CAMADA (a) — THE NON-DEGENERACY GUARD, AND IT RUNS FIRST ─────────────────────────────────
#
# `JULGAMENTO-QUANT-ARCHITECT.md` §4, literal: on a degenerate `o=h=l=c` candle (`RN-2`'s own
# measured shape of the live view-model) the 5 candidate functions COINCIDE, and every layer
# below would pass under ANY wrong pick in `REDUCTION_TABLE`. This test is placed textually
# FIRST in the file for that reason — a reader (or `pytest -x`) hits it before trusting camadas
# (b)-(d) — and it is deliberately the cheapest of the four: four numbers, one `set`.


def test_ca8_prime_camada_a_the_fixture_is_not_degenerate_before_anything_else_trusts_it() -> None:
    """`first`, `max`, `min`, `last` of the CLOSE column must be 4 pairwise-distinct values.

    If this fails, the fixture below is flat (or the array was mis-transcribed) and every other
    test in this file would pass VACUOUSLY — under any swap of `first`/`max`/`min`/`last` — the
    exact silent-pass shape that retired `CA-8`.
    """
    close = _FIXTURE_COLUMNS["close"]
    readings = {"first": close[0], "max": max(close), "min": min(close), "last": close[-1]}

    assert len(set(readings.values())) == len(readings), (
        f"the fixture is degenerate at `close` (RN-2's o=h=l=c shape): {readings} — a "
        f"falsifier over this data would pass under any function swap, which is exactly what "
        f"retired CA-8"
    )
    # The real magnitude, not just "different": `[MEDIDO 2026-09-22]`, transcribed from the
    # `curl` above — a swing wide enough that no rounding could produce a false pass.
    assert max(close) - min(close) > 3_000.0


# ── CAMADA (b) — THE FIXTURE ITSELF, PINNED AGAINST THE NORMATIVE TABLE ──────────────────────


def test_ca8_prime_camada_b_the_binance_fixture_matches_the_normative_table_verbatim() -> None:
    """Every literal `JULGAMENTO-QUANT-ARCHITECT.md` §4.1 / `plano 03` DoD 1(b) names, pinned.

    `[MEDIDO 2026-09-22]` against the `curl` in the module docstring — a bucket CLOSED on
    `2026-09-18` cannot move, so this is a regression pin: if `_RAW_1M_BTCUSDT_20260918_1200_
    1600_UTC` is ever hand-edited, this is the test that catches the array drifting from the
    number the owner can still verify on Binance's own chart.
    """
    assert len(_RAW_1M_BTCUSDT_20260918_1200_1600_UTC) == 240  # `240/240` minutes — DoD 1(b)

    assert sum(_FIXTURE_COLUMNS["volume"]) == pytest.approx(_EXPECTED_SUM_VOLUME, abs=1e-9)
    assert _FIXTURE_COLUMNS["open"][0] == _EXPECTED_FIRST_OPEN
    assert max(_FIXTURE_COLUMNS["high"]) == _EXPECTED_MAX_HIGH
    assert min(_FIXTURE_COLUMNS["low"]) == _EXPECTED_MIN_LOW
    assert _FIXTURE_COLUMNS["close"][-1] == _EXPECTED_LAST_CLOSE

    # The CONTRAFACTUAL each row of the table names — what the wrong function would have served.
    assert max(_FIXTURE_COLUMNS["close"]) == _WRONG_MAX_CLOSE  # not `max(high)` — `-11,7 bp`
    assert min(_FIXTURE_COLUMNS["close"]) == _WRONG_MIN_CLOSE  # not `min(low)` — `+2,7 bp`
    assert _FIXTURE_COLUMNS["close"][0] == _WRONG_FIRST_CLOSE  # not `last(close)` — `-3,35%`


# ── CAMADA (c) — THE EXHAUSTIVE MATRIX: 8 PAIRS × 5 FUNCTIONS, NO `default` BRANCH ────────────


def test_ca8_prime_camada_c_scenario_table_covers_exactly_reduction_tables_8_pairs() -> None:
    """`_PAIR_SCENARIOS` must track `REDUCTION_TABLE` exactly — a totality guard on the guard.

    `T-03.2` owns the LIVE `/series-catalog` totality check; this is the narrower claim that
    THIS FILE's own fixture table has not silently drifted from the 8 pairs `series_reduction.py`
    declares, so a 9th pair added there without a scenario here fails loudly instead of this
    file quietly under-covering the matrix DoD 1(c) requires.
    """
    assert set(_PAIR_SCENARIOS) == set(REDUCTION_TABLE)
    assert set(_CORRECT_FUNCTION_NAME) == set(REDUCTION_TABLE)
    assert len(_PAIR_SCENARIOS) == 8


def _pair_sort_key(pair: tuple[Nature, Reduction]) -> tuple[str, str]:
    """Sort `(nature, reduction)` pairs by their string values — a stable `parametrize` order."""
    return (pair[0].value, pair[1].value)


_SORTED_PAIRS = sorted(REDUCTION_TABLE, key=_pair_sort_key)


@pytest.mark.parametrize("nature, reduction", _SORTED_PAIRS)
def test_ca8_prime_camada_c_only_the_declared_function_matches_the_real_fixture(
    nature: Nature, reduction: Reduction
) -> None:
    """Assert `reduce_bucket` and only the DECLARED candidate function match the real fixture.

    The OTHER 4 candidate functions, applied to the SAME real column, must NOT match. `40`
    cells (`8 pairs × 5 functions`) parametrized here; the module docstring quantifies why the
    INFORMATIVE subset — where a wrong function's value could be mistaken for the right one —
    is the same `20` `plano 03` DoD 1(c) names (5 distinct scenarios × 4 wrong functions each,
    the 4 `last`-over-`close` pairs sharing one scenario).
    """
    column_name, expected = _PAIR_SCENARIOS[(nature, reduction)]
    values = _FIXTURE_COLUMNS[column_name]
    correct_function_name = _CORRECT_FUNCTION_NAME[(nature, reduction)]

    # The production function itself, over the real fixture — not just the reference `lambda`.
    assert reduce_bucket(nature, reduction, values) == pytest.approx(expected, abs=1e-9)

    for function_name, function in _CANDIDATE_FUNCTIONS.items():
        candidate_value = function(values)
        if function_name == correct_function_name:
            assert candidate_value == pytest.approx(expected, abs=1e-9), (
                f"{nature.value}/{reduction.value}: the DECLARED function {function_name!r} "
                f"disagrees with the literal {expected} on the real fixture"
            )
        else:
            assert candidate_value != pytest.approx(expected, abs=1e-9), (
                f"{nature.value}/{reduction.value}: swapping "
                f"{correct_function_name!r} for {function_name!r} produced the SAME value "
                f"{candidate_value} as the literal {expected} — this cell cannot MORDE a wrong "
                f"pick in REDUCTION_TABLE"
            )


# ── CAMADA (d) — COVERAGE ABLATION: 81/240, AND `mean × expected` NEVER APPEARS ───────────────
#
# Reproduces the real partial bucket `plano 03` DoD 1(d) names (`2026-09-16 00:00`, `81/240`) by
# withholding all but the first 81 of the 240 real per-minute `klines_volume` facts from the SAME
# fixture — through `build_series_history_report`, the actual production use case (`T-03.3`/
# `T-03.4`), not a hand-rolled re-implementation of its arithmetic.


class _FakeReader:
    """A `SeriesWindowReader` fixture: returns exactly the `Observation`s it was built with."""

    def __init__(self, observations: tuple[Observation, ...]) -> None:
        self._observations = observations

    def read_window(
        self,
        *,
        series_key_id: str,
        symbol: str,
        window_start_ms: int,
        window_end_ms: int,
        lookback_ms: int,
    ) -> tuple[Observation, ...]:
        """Ignore every argument and return the fixed `Observation`s this reader was built with."""
        return self._observations


class _FakeBoundsReader:
    """A `SeriesStoreBoundsReader` fixture.

    Always `(None, None)` — `panel.coverage` is not this test's claim (`T-03.6` owns it); only
    the row-level `coverage` ablation is.
    """

    def read_bounds(self, *, series_key_id: str, symbol: str) -> tuple[int | None, int | None]:
        """Return `(None, None)`: an empty store, irrelevant to the row-level claim above."""
        return (None, None)


def _classify_panel_grid(*, panel_grid_ms: int, native_grid_ms: int) -> PanelGridVerdict:
    """Apply the REAL `charts` rule (`ADR-037/D4`), never a stub.

    Same shape `test_series_history.py` uses, so this file cannot invent a grid verdict `charts`
    never made.
    """
    verdict = classify_grid_multiple(panel_grid_ms, native_grid_ms)
    return PanelGridVerdict(
        native_grid_ms=verdict.native_grid_ms,
        enabled=verdict.enabled,
        reason=verdict.reason.value,
        multiple=verdict.multiple,
    )


def _volume_key() -> SeriesKey:
    """`klines_volume`, `BTCUSDT`, `1m` — the real `FLOW` series `Σ` is being tested on."""
    return SeriesKey(
        provider="binance",
        venue="usdm_futures",
        instrument_id=_SYMBOL,
        metric="klines_volume",
        cohort="all",
        interval="1m",
        unit="BTC",
        denom="base",
        nature=Nature.FLOW,
        ts_convention=TsConvention.AGGREGATE_OVER_BUCKET,
        reduction=Reduction.SUM,
        quantity_field=QuantityField.NA,
        label_shift=0,
        aggregation_scope="Symbol",
        verified_by="test_series_reduction_ca8_prime.py",
    )


def _catalog_for(key: SeriesKey) -> SeriesCatalog:
    """Build a one-entry catalog for `key`, `120_000` ms staleness (twice the native grid)."""
    entry = SeriesCatalogEntry(
        key=key, native_grid="1min", native_grid_ms=_GRID_MS, max_staleness_ms=120_000
    )
    return SeriesCatalog((entry,))


def _lagged_row(
    key: SeriesKey, *, bucket_end: int, value_raw: str, lag_ms: int = 50_000
) -> SeriesRow:
    """Build one real minute's `klines_volume` fact, readable `lag_ms` after its bucket closed."""
    return SeriesRow(
        series_key_id=key.series_key_id(),
        symbol=_SYMBOL,
        source="binance",
        bucket_end=bucket_end,
        event_time=bucket_end,
        available_at=bucket_end + lag_ms,
        availability_source=AvailabilitySource.OBSERVED,
        ingested_at=bucket_end + lag_ms,
        observed_at=bucket_end + lag_ms,
        provenance=Provenance.OBSERVED,
        src_label_raw="volume",
        observer_id="test",
        observer_region=UNKNOWN_OBSERVER_REGION,
        is_final=True,
        value_raw=value_raw,
    )


def test_ca8_prime_camada_d_81_of_240_serves_partial_sum_never_mean_times_240() -> None:
    """`coverage == {present: 81, expected: 240}`; served `Σ` is the 81 real facts, not `240×`.

    `[MEDIDO 2026-09-22]` over this file's own real fixture: `Σ(first 81 volumes) = 5170.515`,
    the full `Σ(240) = 93465.237`, and the forbidden extrapolation `mean(81) × 240 = 15320.0444…`
    — three DIFFERENT numbers, so a served value equal to the LAST one is exactly the silent
    extrapolation `ADR-040/D3` (`P-B`) refuses, and equal to the SECOND is the hole invisibly
    papered over. Only the first is correct.
    """
    key = _volume_key()
    first_native_instant = _WINDOW_START_MS + _GRID_MS  # `_read_instant` reaches to `bucket_end`
    outer_bucket_end = _WINDOW_START_MS + _FOUR_HOUR_MS
    present_volumes = _FIXTURE_COLUMNS["volume"][:81]
    rows = [
        _lagged_row(key, bucket_end=first_native_instant + i * _GRID_MS, value_raw=str(v))
        for i, v in enumerate(present_volumes)
    ]
    observations = tuple(Observation(row=row, value=Decimal(row.value_raw)) for row in rows)

    report = build_series_history_report(
        _catalog_for(key),
        _FakeReader(observations),
        _classify_panel_grid,
        _FakeBoundsReader(),
        series_key_id=key.series_key_id(),
        symbol=_SYMBOL,
        interval="4h",
        window_start_ms=outer_bucket_end,
        window_end_ms=outer_bucket_end,
        knowledge_time_ms=outer_bucket_end + 10 * _GRID_MS,
        bar_policy=BarPolicy.FINAL_ONLY,
    )

    assert len(report.rows) == 1
    only_row = report.rows[0]
    assert only_row.coverage == BucketCoverage(present=81, expected=240)
    assert only_row.absence is None

    served = float(only_row.value) if only_row.value is not None else None
    assert served is not None

    full_sum = sum(_FIXTURE_COLUMNS["volume"])
    forbidden_extrapolation = (sum(present_volumes) / len(present_volumes)) * 240

    assert served == pytest.approx(sum(present_volumes), abs=1e-6)
    assert served != pytest.approx(full_sum, abs=1e-6)
    assert served != pytest.approx(forbidden_extrapolation, abs=1e-6)
