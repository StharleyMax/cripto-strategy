/**
 * `T-05.2` — the PURE half of `series-history-client.ts`'s envelope handling, split out so it
 * can be imported from the BROWSER too.
 *
 * `series-history-client.ts` opens with `import "server-only"` (`ADR-019/D4`: the base URL it
 * reads must never reach the browser bundle) — and until this split, that guard also blocked
 * every OTHER export of that file, including `parseSeriesHistoryEnvelope`, which has no
 * dependency on the base URL, `fetch`, or any secret at all. `D-C3.5`
 * (`docs/context/candle-real-e-eixo-unico/handoff/JULGAMENTO-FRONTEND-ARCHITECT.md:281-308`)
 * makes `web` fetch a NEW page of history from the CLIENT (a pan gesture near the loaded edge),
 * and a client module that imports anything from a `"server-only"`-guarded file fails the Next
 * build outright — so the envelope TYPE and its PARSER move here, where nothing imports
 * `"server-only"`, and `series-history-client.ts` re-exports both unchanged (byte-for-byte
 * behaviour, verified by `series-history-client.test.ts`, which is untouched by this split).
 *
 * `browser-series-history-client.ts` (`T-05.2`) is the new client-side caller; `page.tsx`'s
 * (Server Component) `series-history-client.ts` stays the ONLY module that reads
 * `INGEST_HEALTH_API_BASE_URL` — this module reads no environment variable and makes no network
 * call, so the split changes WHO can import the parser, never WHAT it does.
 */

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `T-03.12` — `BucketCoverage.to_wire()` (`series_history_report.py`): the `{present,
 * expected}` PAIR OF INTEGERS `T-03.4`/`P-B`/`ADR-040/D3` mandates on every REAGGREGATED row,
 * never a bool, never a percentage (the backend docstring's own reasoning: a percentage cannot
 * be told apart from a different window landing on the same ratio, and the denominator IS the
 * information). `null` is the DEGENERATE case — a native row (no reaggregation happened) has no
 * fraction to report, not a fraction of `0/0`. */
export interface BucketCoverage {
  readonly present: number;
  readonly expected: number;
}

/** One row of the `rows` array — `SeriesHistoryRow.to_wire()` (`series_history_report.py`),
 * mirrored field-for-field. `available_at`/`value`/`absence` are `null` exactly when there is
 * no point (`(value === null) !== (absence === null)` never both, per `CA-F1-5`) — this module
 * does not re-derive that invariant, it is asserted below at the point the wire is trusted. */
export interface SeriesHistoryRow {
  readonly event_time: number;
  readonly available_at: number | null;
  readonly value: string | null;
  readonly absence: string | null;
  readonly coverage: BucketCoverage | null;
}

/** The 3-level envelope `GET /series-history` serves (`ADR-005/D3`, `session`/`panel`/`rows`). */
export interface SeriesHistoryEnvelope {
  readonly session: { readonly principal_id: string | null; readonly server_now_ms: number };
  readonly panel: {
    readonly series_key_id: string;
    readonly source: string;
    readonly nature: string;
    readonly unit: string;
  };
  readonly rows: readonly SeriesHistoryRow[];
  readonly knowledge_time: number;
  readonly bar_policy: string;
}

/** `T-03.12` — validates `rows[i].coverage` against `BucketCoverage.to_wire()`'s exact shape:
 * `null`, or a plain object with two INTEGER fields, never a bool and never a float (a
 * percentage smuggled through as `0.34` would pass `typeof === "number"` silently, which is
 * exactly the collapse `T-03.4`'s backend docstring rejects "par de inteiros, nunca bool, nunca
 * percentual" for). */
function assertWireCoverage(value: unknown, index: number): asserts value is BucketCoverage | null {
  if (value === null) {
    return;
  }
  if (!isPlainRecord(value)) {
    throw new Error(`series_history envelope: rows[${index}].coverage is not null and not a plain object`);
  }
  if (!Number.isInteger(value.present) || !Number.isInteger(value.expected)) {
    throw new Error(
      `series_history envelope: rows[${index}].coverage must be {present: int, expected: int}, got ` +
        `${JSON.stringify(value)}`,
    );
  }
}

function assertWireRow(value: unknown, index: number): asserts value is SeriesHistoryRow {
  if (!isPlainRecord(value)) {
    throw new Error(`series_history envelope: rows[${index}] is not a plain object`);
  }
  if (typeof value.event_time !== "number") {
    throw new Error(`series_history envelope: rows[${index}].event_time must be a number`);
  }
  if (value.available_at !== null && typeof value.available_at !== "number") {
    throw new Error(`series_history envelope: rows[${index}].available_at must be a number or null`);
  }
  if (value.value !== null && typeof value.value !== "string") {
    throw new Error(`series_history envelope: rows[${index}].value must be a string or null`);
  }
  if (value.absence !== null && typeof value.absence !== "string") {
    throw new Error(`series_history envelope: rows[${index}].absence must be a string or null`);
  }
  if ((value.value === null) === (value.absence === null)) {
    throw new Error(
      `series_history envelope: rows[${index}] has value=${JSON.stringify(value.value)} and ` +
        `absence=${JSON.stringify(value.absence)} — CA-F1-5 requires exactly one of the two to be null`,
    );
  }
  assertWireCoverage(value.coverage, index);
}

/**
 * Parse `GET /series-history`'s decoded JSON body. Strict on the envelope shape; delegates the
 * two ADR-005 falsifier gates (`assertNoTickLevelFields`/`assertBucketSpacingWithinInterval`)
 * to the caller (`fetchSeriesHistoryViaHttp`/`fetchSeriesHistoryFromBrowser`), which runs them on
 * `body` BEFORE this narrows it — same order `series-catalog-query.ts` uses, so a smuggled
 * tick-level field anywhere in the payload is caught before this function trusts any of it.
 */
export function parseSeriesHistoryEnvelope(body: unknown): SeriesHistoryEnvelope {
  if (!isPlainRecord(body)) {
    throw new Error("series_history envelope: response body is not a plain JSON object");
  }
  const session = body.session;
  if (!isPlainRecord(session) || typeof session.server_now_ms !== "number") {
    throw new Error('series_history envelope: "session.server_now_ms" is missing or not a number');
  }
  if (session.principal_id !== null && typeof session.principal_id !== "string") {
    throw new Error('series_history envelope: "session.principal_id" must be a string or null');
  }
  const panel = body.panel;
  if (
    !isPlainRecord(panel) ||
    typeof panel.series_key_id !== "string" ||
    typeof panel.source !== "string" ||
    typeof panel.nature !== "string" ||
    typeof panel.unit !== "string"
  ) {
    throw new Error('series_history envelope: "panel" is missing one of series_key_id/source/nature/unit');
  }
  if (!Array.isArray(body.rows)) {
    throw new Error('series_history envelope: "rows" is missing or not an array');
  }
  body.rows.forEach((row, index) => assertWireRow(row, index));
  if (typeof body.knowledge_time !== "number") {
    throw new Error('series_history envelope: "knowledge_time" must be a number');
  }
  if (typeof body.bar_policy !== "string") {
    throw new Error('series_history envelope: "bar_policy" must be a string');
  }

  return {
    session: { principal_id: session.principal_id as string | null, server_now_ms: session.server_now_ms },
    panel: {
      series_key_id: panel.series_key_id,
      source: panel.source,
      nature: panel.nature,
      unit: panel.unit,
    },
    rows: body.rows as readonly SeriesHistoryRow[],
    knowledge_time: body.knowledge_time,
    bar_policy: body.bar_policy,
  };
}
