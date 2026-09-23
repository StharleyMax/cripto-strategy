"""`MAX_HISTORY_DAYS` — the declared ceiling of persisted `1m` klines history, per symbol (`D5`)."""

# Phase `05` item 5.2 + `SPEC-008` §7.1 (`T-05.3`).
#
# ── WHY THIS CONSTANT EXISTS, AS ITS OWN MODULE, IN `domain/` ───────────────────────────────
#
# The number was ALREADY written down once, in `infra/klines_backfill_cli.py`'s own
# `MAX_BACKFILL_DAYS`, and that was correct for what `T-01.5` needed: a one-shot job refusing to
# walk further than the ceiling. What that placement cannot serve is the OTHER consumer `D5`
# always implied — `GET /series-history` refusing a window that starts before the ceiling
# (`T-05.4`, plan `05` item 5.3/DoD 4). `backend/pyproject.toml`'s `[tool.importlinter]` layer
# contract is `infra > use_cases > domain` for this context: a route/use-case module is FORBIDDEN
# from importing `infra/klines_backfill_cli.py` (`make boundaries` would refuse it with
# `rc=3`), so a constant that lives only in `infra/` is unreachable from the one place `D5`'s
# other half has to enforce it. Moving the number down to `domain/` — where `source_floor.py`
# already keeps the SIBLING fact this module is deliberately next to (the upstream API's own
# wall, as opposed to this module's OWN STORE'S declared retention policy) — makes it reachable
# from every layer, and `infra/klines_backfill_cli.MAX_BACKFILL_DAYS` now IMPORTS it rather than
# re-declaring it, so the two can never drift apart.
#
# ── THE NUMBER, AND WHY IT IS 90 AND NOT SOME OTHER ROUND CEILING ───────────────────────────
#
# `[DECISAO-OWNER: 2026-09-19, escolha entre alternativas apresentadas]`, literal — quoted
# verbatim from `infra/klines_backfill_cli.py`, the same decision, never re-derived: *"90 dias,
# como a SPEC declara"*.
#
# The arithmetic the SPEC is quoting `[DOC: docs/plans/SPEC-008-candle-real-e-eixo-unico/
# 05_historia_sob_demanda.md, "Os três números que fixam o desenho" + item 5.2]`: the widest
# timeframe `/series-history` serves is `4h` (`ADR-040/D1`, `use_cases/series_history.py`'s own
# `SUPPORTED_INTERVALS`), and the paginator's own ceiling is `~500` bars per panel
# (`docs/plans/.../05_historia_sob_demanda.md` item 5.1b). `4h x 500 = 2000h = 83,3` days —
# `90` is the smallest ROUND ceiling that covers that whole span, with headroom for the two
# named use cases (`[Q2]`+`[Q3]`, `SPEC-008` §7.1) rather than landing exactly on the arithmetic.
#
# ── DoD 5/6 OF PLAN `05` — ALREADY MEASURED, BY THE SAME EXECUTION, NOT RE-RUN HERE ─────────
#
# Both DoDs ask for the SAME walk this constant already governs, and it already ran, under
# `T-01.5` — re-running it here would be a SECOND 90-day backfill for no new fact, at a real
# disk cost the first run's own gate doc flags as scarce
# (`docs/context/candle-real-e-eixo-unico/gates/T-01.5-dod6-medicao-e-achado-lookahead.md:94-95`:
# *"Disco: 12.824 MB livres, 95%… Um segundo backfill de 90 dias custa outros ~1,6 GB — decisão
# do owner, nunca repetição automática"*). The numbers that walk produced:
#
#   * **cota (DoD 5):** `n_calls = 348` total = **87 calls/symbol** for 4 symbols =
#     `ceil(129_600 / 1_500)`, weight 1 each, against the 2.400/min ceiling ⇒ **< 4%** of one
#     minute of quota, zero calls wasted `[MEDIDO 2026-09-19, gates/
#     T-01.5-dod6-medicao-e-achado-lookahead.md:109]`.
#   * **pegada de disco (DoD 6):** `+2.148.504` linhas de `klines_ohlc`, `+1,641 GB` de
#     `hypertable_size`, 90,0–90,1 dias de cobertura real por símbolo
#     `[MEDIDO 2026-09-19, gates/T-01.5-dod6-medicao-e-achado-lookahead.md:116,126]` — dentro do
#     teto de `≤ 2,07 M linhas`/4 símbolos que `SPEC-008` §3.6 declara.
#
# ── `5.6`: ONE-SHOT/CRON, NEVER A LONG-LIVED SERVICE ─────────────────────────────────────────
#
# `ADR-027/D1` allows exactly three long-lived processes and this history depth is not a fourth
# — `infra/klines_backfill_cli.run_backfill` has no outer loop and RETURNS
# (`test_klines_backfill_cli.py::test_the_one_shot_returns_instead_of_becoming_a_service`); an
# operator or `cron` re-runs it, this module does not schedule it.

from __future__ import annotations

from typing import Final

# `D5`, the owner's ceiling — see the module docstring above for the arithmetic and the literal
# decision. This is the ONE place the number is declared; every other module that needs it
# (`infra/klines_backfill_cli.py` today, `T-05.4`'s route refusal next) imports it from here.
MAX_HISTORY_DAYS: Final[int] = 90

MS_PER_DAY: Final[int] = 86_400_000

# The ceiling expressed in the unit `md.series.bucket_end`/`knowledge_time_ms` already use, so a
# caller computing "the earliest window_start_ms this route may serve" does not re-derive the
# `* 86_400_000` arithmetic at its own call site.
MAX_HISTORY_MS: Final[int] = MAX_HISTORY_DAYS * MS_PER_DAY
