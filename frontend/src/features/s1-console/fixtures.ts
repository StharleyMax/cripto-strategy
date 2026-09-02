/**
 * `T-07.12` — fixture/synthetic data for the `S1` console.
 *
 * ⚠️ GAP, registered per the dispatch instruction: none of this is read from a database.
 * `S1` is specified to read the named query `ingest_health_query` (`ADR-008/D3`,
 * `DoD D7.17`), and wiring that query is `T-07.13` — a separate, dependent task
 * (`docs/context/plataforma-dados/tasks.toml:954-962`). Until `T-07.13` lands, every value
 * below is fixture data, chosen for two properties: (1) it reproduces the numbers the plan
 * and the approved canonical screen already publish, and (2) where the plan's own figure is
 * explicitly a rounding (`~2.000 pts`, `~4,7x`), the fixture picks the nearest PRECISE input
 * that reconciles exactly through `domain.ts`'s formulas — documented row by row below,
 * never silently.
 *
 * Canonical screen: `S1 Console — Diagnóstico Operacional (Rev. B)`,
 * `screens/c0fc0210272f42a1ae29b6364e68d2e4`, downloaded and grepped in
 * `docs/context/plataforma-dados/gates/T-07.12-design.md` §10. This module's row order is
 * deliberately NOT the screen's row order — see the comment on `COLLECTOR_ROWS` below.
 */

import {
  DECLARED_SLO_TRAIL_MULTIPLIER,
  makeComputedUniformWindow,
  type CollectorRow,
  type ReconnectionEvent,
  type StorageBudgetLine,
} from "./domain.ts";

/**
 * The six rows of "Monitoramento de Coletores e Ingestão", in the order a real query would
 * plausibly return them (no particular severity order) — NOT pre-sorted with the stopped row
 * first. `orderRowsBySeverity` (`domain.ts`) is what the view model calls to produce the
 * approved top-of-list position for `/futures/data/*`; keeping the fixture unsorted is what
 * makes that call load-bearing instead of decorative, and `view-model.test.ts` asserts it.
 */
export const COLLECTOR_ROWS: readonly CollectorRow[] = [
  {
    // `2.206 pts × 1m ≈ 1,5 dia` — both numbers are the plan's own EXACT figures
    // (`docs/plans/.../07_aquisicao_em_regime.md`, `D7.12`), not rounded inputs.
    series: "OI · grade 1m · BTC · bn-dump",
    retention: makeComputedUniformWindow(2206, 1),
    resilience: { kind: "slo_multiplier", grade: "T1m", multiplier: DECLARED_SLO_TRAIL_MULTIPLIER },
    status: "ATIVO",
    uptimePercent: 99.8,
    statusDetail: null,
  },
  {
    // The plan publishes this row as "~2.000 pts × 5m ≈ 7,0 dias" — both figures already
    // rounded. `2016` is THIS module's fixture choice, not a value read anywhere: it is the
    // smallest round-looking point count that (a) still reads as "~2.000" and (b) makes
    // `computeUniformWindowDays` land on EXACTLY 7.0 (2016 × 5 / 1440 = 7.0), so the rendered
    // day figure is a real formula output, not a hand-typed string sitting next to an
    // unrelated point count. Displayed points will read "2.016", not the plan's "~2.000" —
    // a deliberate, registered divergence from the literal approved microcopy, in exchange
    // for arithmetic that actually reconciles. See the builder gate report for the same note.
    series: "OI · grade 5m · BTC · coinalyze",
    retention: makeComputedUniformWindow(2016, 5),
    resilience: { kind: "slo_multiplier", grade: "T5m", multiplier: DECLARED_SLO_TRAIL_MULTIPLIER },
    status: "ATIVO",
    uptimePercent: 99.9,
    statusDetail: null,
  },
  {
    // Liquidation daily roll-up: no purge policy exists at all — `[DOC-ONLY]`, never a number.
    series: "Liq · daily · BTC · coinalyze",
    retention: { kind: "doc_only" },
    resilience: { kind: "not_scored" },
    status: "ARQUIVO",
    uptimePercent: null,
    statusDetail: null,
  },
  {
    // `D7.14`: the plan's own figure, `3.052 pts × 1m ≈ 8 dias`, is carried as a
    // `measured_sparse` window, NOT run through `computeUniformWindowDays` —
    // `domain.test.ts` proves why: the naive product would give ≈2.1 days, not 8, because
    // this series is SPARSE (points are not evenly spaced). The 8-day figure is an
    // independently measured fact, and the regime note is the point of `D7.14`: the window
    // is not guaranteed to hold during exactly the regime (a cascade) where it matters.
    series: "Liq · grade 1m · BTC · coinalyze",
    retention: {
      kind: "measured_sparse",
      points: 3052,
      intervalMinutes: 1,
      days: 8,
      regimeNote: "janela válida no regime atual, não garantida em cascata",
    },
    resilience: { kind: "slo_multiplier", grade: "T1m", multiplier: DECLARED_SLO_TRAIL_MULTIPLIER },
    status: "ATIVO",
    uptimePercent: 99.7,
    statusDetail: null,
  },
  {
    // The row `orderRowsBySeverity` must move to the top. Placed mid-array on purpose.
    series: "/futures/data/* · ws · BTC",
    retention: { kind: "not_applicable" },
    resilience: { kind: "unavailable" },
    status: "PARADO",
    uptimePercent: null,
    statusDetail: null,
  },
  {
    // Raw S3 dump: "re-baixável (retenção NÃO MEDIDA), nunca infinito" — `unmeasured`, never
    // a number, and never rendered as if unlimited.
    series: "Raw · s3 · AWS · dump-s3",
    retention: { kind: "unmeasured" },
    resilience: { kind: "external_sla", label: "S3 SLA" },
    status: "PENDENTE",
    uptimePercent: null,
    statusDetail: "3k obj",
  },
];

/**
 * "FILA ETL (PENDENTES)" — the approved screen's literal figure. Fixture: `T-07.13` wires
 * the real depth from the consumer group that `plano 07` item `7.6`/`7.7` specifies
 * (Redis Streams, escritor único) — not measured here.
 */
export const ETL_QUEUE_DEPTH_PENDING = 14204;

/**
 * "Orçamento Armazenamento (GB/dia)" — the approved screen's literal per-line figures.
 * `/futures/data/*` carries `gbPerDay: null`: it is `PARADO`, and a stopped collector has no
 * forward storage budget — never a silently-summed zero.
 */
export const STORAGE_BUDGET_LINES: readonly StorageBudgetLine[] = [
  { label: "Coinalyze OI", gbPerDay: 1.2 },
  { label: "Coinalyze Liq", gbPerDay: 0.4 },
  { label: "/futures/data/*", gbPerDay: null },
];

/** "Reconexões e Rotina" — the approved screen's five literal entries, same order. Every
 * entry is the SAME kind of value by type (`ReconnectionEvent` has no severity field) —
 * `WS drop` and `WS resume` sit side by side with no visual distinction, which is `D7.15`. */
export const RECONNECTION_EVENTS: readonly ReconnectionEvent[] = [
  { time: "10:42:01", description: "WS reconnect /futures/data/*", durationLabel: "1.2s" },
  { time: "10:35:12", description: "S3 PUT success bn-dump", durationLabel: "0.4s" },
  { time: "10:15:00", description: "WS drop coinalyze-oi", durationLabel: "-" },
  { time: "10:15:02", description: "WS resume coinalyze-oi", durationLabel: "2.1s" },
  { time: "09:00:00", description: "Daily roll liq-daily", durationLabel: "0.1s" },
];
