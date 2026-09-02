/**
 * `T-08.11` — the web side of `ADR-005/D1`'s **live** route (plan `08` item 8.8): "Transporte
 * ao vivo por SSE com envelope de bucket." Sibling of `./history-transport.ts` (`T-05.9`, the
 * **historical** route of the same ADR) — same decision, opposite edge of the timeline:
 *
 *   | classe | transporte | por que |
 *   |--------|------------|---------|
 *   | histórico | HTTP, resposta endereçável por conteúdo | imutável por construção |
 *   | **borda direita do tempo (AO VIVO)** | **SSE, um fluxo por sessão, envelope de bucket** | unidirecional, reconecta sozinho, sem controle de servidor no browser |
 *
 * `docs/adr/ADR-005-transporte-de-leitura.md`:
 *   - §D1: "não precisamos de canal do browser para o servidor — a superfície não age."
 *   - §D2: "`( bucket_open_ts, cvd_delta_parcial, last_price, n_trades, seq )` a
 *     `max(1 Hz, 1/TF)`… `seq` é monotônico por fluxo e existe para o cliente detectar lacuna
 *     de transporte SEM inferir do relógio."
 *   - §D4: "`bar_policy` é declarado pelo CONSUMIDOR, na requisição. O transporte NÃO escolhe.
 *     Um cliente que peça `final_only` NÃO recebe o bucket em formação; um que peça `intrabar`
 *     recebe com `is_final = false`. `intrabar` nunca é default."
 *   - §Falsificador: "se a taxa de mensagens que chega ao browser exceder `max(1 Hz, 1/TF)` por
 *     série, ou se qualquer payload de transporte contiver campo de nível de tick (`agg_id`,
 *     `price` por trade, `quantity` por trade), esta ADR está violada."
 *
 * Design gate for this task (`docs/context/plataforma-dados/gates/T-08.11-design.md`):
 * "SEM DECISÃO DE UI/UX NOVA. Contrato já coberto" — this is a transport module (encode/decode
 * of the SSE envelope), not a pixel. Item 8.8 names exactly this: the module delivers the
 * data (`is_final`, `seq`, `bucket_open_ts`); who reads and draws it is a different task
 * (`T-08.12`, `charts`).
 *
 * Scope, and why it stops here: no `EventSource` wiring, no actual network call — same
 * boundary `history-transport.ts` drew for `fetch`. There is still no HTTP/SSE framework in
 * `backend/` (`[MEDIDO]` by `T-05.9`: zero `fastapi`/`flask`/`uvicorn`), so a real stream to
 * connect to does not exist yet, and inventing a server is out of a `web`-component task.
 * What this module owns is the CONTRACT: the request that opens a stream (`bar_policy`
 * mandatory, D4), the envelope shape a message on that stream carries (D2), and the two gates
 * that make the ADR's falsifier executable on any payload/sequence a real stream will someday
 * produce — zero tick-level field, and rate never finer than `max(1 Hz, 1/TF)`.
 *
 * Reuse, not reinvention: `BarPolicy`, `assertNoTickLevelFields` and
 * `assertBucketSpacingWithinInterval` are imported from `./history-transport.ts` rather than
 * redeclared — the falsifier is the SAME ADR for both routes, and a second implementation of
 * either gate would be exactly the class of drift `D1`'s two-route split does not license.
 */

import {
  assertBucketSpacingWithinInterval,
  assertNoTickLevelFields,
} from "./history-transport.ts";
import type { BarPolicy } from "./history-transport.ts";

// ── The request that opens a live stream (D1 + D4) ──────────────────────────────────────────

/**
 * What a consumer sends to open the one SSE stream for a series. There is no `knowledgeTime`
 * here (unlike `HistoryRequestKey`) — the live edge has no fixed instant to key a cache by, its
 * horizon is "now".
 */
export interface LiveStreamOpenRequest {
  readonly seriesKeyId: string;
  readonly symbol: string;
  /** The grid's native label (`"1m"`, `"5m"`…), never parsed here — same boundary
   * `HistoryRequestKey.interval` draws; the canonical grid belongs to `charts` (`T-05.1`). */
  readonly interval: string;
  /** MANDATORY, no default anywhere in this module — `D4`: "o transporte NÃO escolhe… intrabar
   * nunca é default." A consumer that wants only finalized buckets asks for `"final_only"`
   * explicitly; nothing here silently prefers one policy over the other. */
  readonly barPolicy: BarPolicy;
}

const OPEN_REQUEST_PARAM_ORDER = ["seriesKeyId", "symbol", "interval", "barPolicy"] as const;

function assertNonEmpty(value: string, field: string): void {
  if (value.trim() === "") {
    throw new Error(`invalid live stream request: field "${field}" must not be empty`);
  }
}

function assertBarPolicyValue(value: string): asserts value is BarPolicy {
  if (value !== "final_only" && value !== "intrabar") {
    throw new Error(
      `invalid live stream request: "barPolicy" must be "final_only" or "intrabar" ` +
        `(ADR-005/D4: declared by the consumer, never defaulted), got ${JSON.stringify(value)}`,
    );
  }
}

/** Validates a `LiveStreamOpenRequest` before it becomes a URL/subscription. Rejects rather
 * than accepts an ambiguous state — same posture as `assertValidHistoryRequestKey`. */
export function assertValidLiveStreamOpenRequest(request: LiveStreamOpenRequest): void {
  assertNonEmpty(request.seriesKeyId, "seriesKeyId");
  assertNonEmpty(request.symbol, "symbol");
  assertNonEmpty(request.interval, "interval");
  assertBarPolicyValue(request.barPolicy);
}

/** The request becomes URL parameters, field by field — legible and linkable, not a
 * serialized blob. Mirrors `encodeHistoryRequest`. */
export function encodeLiveStreamOpenRequest(request: LiveStreamOpenRequest): URLSearchParams {
  assertValidLiveStreamOpenRequest(request);
  const params = new URLSearchParams();
  for (const field of OPEN_REQUEST_PARAM_ORDER) {
    params.set(field, request[field]);
  }
  return params;
}

/**
 * The inverse of `encodeLiveStreamOpenRequest`. `barPolicy` is read and validated with NO
 * fallback whatsoever — if the parameter is absent or outside the closed set, the read is
 * REFUSED, never silently defaulted to `"final_only"` (or, worse, `"intrabar"`). This refusal
 * is the client-side half of `D4`: "intrabar nunca é default" only holds if "no value" also
 * never becomes a default.
 */
export function decodeLiveStreamOpenRequest(params: URLSearchParams): LiveStreamOpenRequest {
  const seriesKeyId = params.get("seriesKeyId");
  const symbol = params.get("symbol");
  const interval = params.get("interval");
  const barPolicy = params.get("barPolicy");

  if (seriesKeyId === null) throw new Error('invalid live stream request: parameter "seriesKeyId" is missing');
  if (symbol === null) throw new Error('invalid live stream request: parameter "symbol" is missing');
  if (interval === null) throw new Error('invalid live stream request: parameter "interval" is missing');
  if (barPolicy === null) {
    throw new Error(
      'invalid live stream request: parameter "barPolicy" is missing — ADR-005/D4 requires it ' +
        "to be declared by the consumer; this module assumes no default, not even final_only",
    );
  }
  assertBarPolicyValue(barPolicy);

  const request: LiveStreamOpenRequest = { seriesKeyId, symbol, interval, barPolicy };
  assertValidLiveStreamOpenRequest(request);
  return request;
}

/** The full stream URL — `base` + the canonical open-request parameters. */
export function liveStreamUrl(base: URL | string, request: LiveStreamOpenRequest): URL {
  const url = new URL(base);
  url.search = encodeLiveStreamOpenRequest(request).toString();
  return url;
}

// ── The bucket envelope carried by every SSE message (D2) ───────────────────────────────────

interface BucketEnvelopeFields {
  /** Instant the current bucket opened, ISO 8601 UTC. */
  readonly bucket_open_ts: string;
  /** CVD delta accumulated since `bucket_open_ts`, as a decimal string (never a `number` —
   * same "no constructor from `number`" invariant `history-transport.ts` §D3 documents for
   * the cell). */
  readonly cvd_delta_parcial: string;
  readonly last_price: string;
  readonly n_trades: number;
  /** Monotonic PER STREAM — `D2`: exists so the client detects a transport gap WITHOUT
   * inferring one from the wall clock. See `LiveSeqGapTracker` below. */
  readonly seq: number;
}

/**
 * The bucket is still open — `D4`'s "`intrabar` recebe com `is_final = false`". `is_final` is
 * typed as the LITERAL `false` here, not `boolean`: a caller cannot construct an in-progress
 * envelope and merely forget to set the flag, because there is no other value the type
 * accepts. This is the "nunca omitido/implícito" requirement enforced at the type level, not
 * only at the runtime check `decodeBucketEnvelope` also performs.
 */
export interface InProgressBucketEnvelope extends BucketEnvelopeFields {
  readonly is_final: false;
}

/** The bucket closed. A consumer that requested `barPolicy: "final_only"` receives ONLY this
 * variant — `D4`: "não recebe o bucket em formação." */
export interface FinalBucketEnvelope extends BucketEnvelopeFields {
  readonly is_final: true;
}

/** Discriminated on `is_final`, same shape of union `history-transport.ts` uses for
 * `BarPolicy`/`Absence` — a switch over `envelope.is_final` narrows exhaustively. */
export type LiveBucketEnvelope = InProgressBucketEnvelope | FinalBucketEnvelope;

function assertNonEmptyEnvelopeField(value: string, field: string): void {
  if (value.trim() === "") {
    throw new Error(`invalid bucket envelope: field "${field}" must not be empty`);
  }
}

function assertIsoInstant(value: string, field: string): void {
  if (value === "" || Number.isNaN(Date.parse(value))) {
    throw new Error(`invalid bucket envelope: field "${field}" is not an ISO 8601 instant: "${value}"`);
  }
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`invalid bucket envelope: field "${field}" must be a non-negative integer, got ${value}`);
  }
}

/**
 * Validates a `LiveBucketEnvelope` after it has been shaped (by `decodeBucketEnvelope`, or by
 * a caller assembling one directly). Runs the tick-level-field gate too — `assertNoTickLevelFields`
 * is schema-agnostic (walks any payload for the ADR's proscribed names), so calling it here
 * makes it impossible to hold a `LiveBucketEnvelope` this module considers valid while it
 * secretly carries `agg_id`/`price`/`quantity`/etc. at any depth.
 */
export function assertValidBucketEnvelope(envelope: LiveBucketEnvelope): void {
  assertIsoInstant(envelope.bucket_open_ts, "bucket_open_ts");
  assertNonEmptyEnvelopeField(envelope.cvd_delta_parcial, "cvd_delta_parcial");
  assertNonEmptyEnvelopeField(envelope.last_price, "last_price");
  assertNonNegativeInteger(envelope.n_trades, "n_trades");
  assertNonNegativeInteger(envelope.seq, "seq");
  if (typeof envelope.is_final !== "boolean") {
    throw new Error(
      `invalid bucket envelope: "is_final" must be an explicit boolean, got ${JSON.stringify(
        (envelope as { is_final?: unknown }).is_final,
      )} — a bucket in formation carries is_final=false explicitly, never omitted or inferred`,
    );
  }
  assertNoTickLevelFields(envelope);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parses one already-JSON-decoded SSE message payload into a `LiveBucketEnvelope`. `is_final`
 * is read with NO fallback — an envelope missing the field, or carrying it as anything other
 * than a literal boolean, is REFUSED rather than assumed final or in-progress. That refusal is
 * what makes "nunca omitido/implícito" a runtime guarantee and not only a compile-time one:
 * `decodeBucketEnvelope` is exactly the boundary where an untyped wire payload becomes the
 * typed union, so it is the one place a missing flag could otherwise slip through silently.
 */
export function decodeBucketEnvelope(raw: unknown): LiveBucketEnvelope {
  if (!isPlainRecord(raw)) {
    throw new Error(`invalid bucket envelope: expected a JSON object, got ${JSON.stringify(raw)}`);
  }
  // Gate the RAW payload first, before narrowing to the known fields below — narrowing
  // reconstructs a fresh object from only `bucket_open_ts`/`cvd_delta_parcial`/`last_price`/
  // `n_trades`/`seq`/`is_final`, which would otherwise silently DROP any extra field the wire
  // payload carries, tick-level ones included. Checking `raw` here is what makes a smuggled
  // field anywhere in the payload (not only among the known ones) actually observable.
  assertNoTickLevelFields(raw);
  const { bucket_open_ts, cvd_delta_parcial, last_price, n_trades, seq, is_final } = raw;

  if (typeof bucket_open_ts !== "string") {
    throw new Error(`invalid bucket envelope: "bucket_open_ts" must be a string, got ${JSON.stringify(bucket_open_ts)}`);
  }
  if (typeof cvd_delta_parcial !== "string") {
    throw new Error(`invalid bucket envelope: "cvd_delta_parcial" must be a string, got ${JSON.stringify(cvd_delta_parcial)}`);
  }
  if (typeof last_price !== "string") {
    throw new Error(`invalid bucket envelope: "last_price" must be a string, got ${JSON.stringify(last_price)}`);
  }
  if (typeof n_trades !== "number") {
    throw new Error(`invalid bucket envelope: "n_trades" must be a number, got ${JSON.stringify(n_trades)}`);
  }
  if (typeof seq !== "number") {
    throw new Error(`invalid bucket envelope: "seq" must be a number, got ${JSON.stringify(seq)}`);
  }
  if (typeof is_final !== "boolean") {
    throw new Error(
      `invalid bucket envelope: "is_final" must be an explicit boolean, got ${JSON.stringify(is_final)} ` +
        "— a bucket in formation must carry is_final=false, never omitted or inferred (ADR-005/D4 " +
        "applied to the envelope)",
    );
  }

  const envelope = {
    bucket_open_ts,
    cvd_delta_parcial,
    last_price,
    n_trades,
    seq,
    is_final,
  } as LiveBucketEnvelope;
  assertValidBucketEnvelope(envelope);
  return envelope;
}

// ── The two gates that make ADR-005's live falsifier executable ─────────────────────────────

/**
 * `seq` is monotonic PER STREAM (`D2`) and exists so the client can notice a transport gap
 * WITHOUT inferring one from the wall clock. One tracker instance per open stream — `D1`: "um
 * fluxo por sessão" — a reconnect opens a NEW stream and deserves a NEW tracker, it does not
 * reuse the old one's `lastSeq`.
 *
 * A gap is reported, not thrown: skipping forward in `seq` is an ordinary, recoverable
 * transport event (a dropped SSE frame, a reconnect that resumed later than it left off), and
 * the caller — not this module — decides the recovery (e.g. backfilling from the historical
 * route). What IS thrown is `seq` failing to increase at all, because that is not a gap, it is
 * the monotonicity invariant itself breaking.
 */
export class LiveSeqGapTracker {
  private lastSeq: number | undefined;

  /** Call once per envelope received on this stream. Returns whether a gap was detected and,
   * if so, how many `seq` values were skipped. */
  observe(seq: number): { readonly gapDetected: boolean; readonly missedCount: number } {
    assertNonNegativeInteger(seq, "seq");
    if (this.lastSeq === undefined) {
      this.lastSeq = seq;
      return { gapDetected: false, missedCount: 0 };
    }
    if (seq <= this.lastSeq) {
      throw new Error(
        `LiveSeqGapTracker: seq must increase monotonically per stream (ADR-005/D2) — received ` +
          `${seq} after ${this.lastSeq}`,
      );
    }
    const missedCount = seq - this.lastSeq - 1;
    this.lastSeq = seq;
    return { gapDetected: missedCount > 0, missedCount };
  }
}

/**
 * The live counterpart of `assertBucketSpacingWithinInterval`: same falsifier ("taxa ≤
 * `max(1 Hz, 1/TF)` por série"), same rejection logic — reused verbatim, not reimplemented —
 * but envelopes arrive one at a time on a live stream instead of as a batch, so this guard
 * accumulates arrival instants and re-checks spacing incrementally. One instance per open
 * stream, same scoping reason as `LiveSeqGapTracker`.
 */
export class LiveEnvelopeRateGuard {
  private readonly intervalMs: number;
  private lastReceivedAtIso: string | undefined;

  constructor(intervalMs: number) {
    if (intervalMs <= 0) {
      throw new Error(`LiveEnvelopeRateGuard: intervalMs must be positive, got ${intervalMs}`);
    }
    this.intervalMs = intervalMs;
  }

  /** Call once per envelope received, with the instant it arrived (ISO 8601 UTC). Throws the
   * moment two arrivals are closer together than `max(1 Hz, 1/TF)` allows — the same
   * throw `assertBucketSpacingWithinInterval` raises, since this delegates to it. */
  observe(receivedAtIso: string): void {
    if (this.lastReceivedAtIso !== undefined) {
      assertBucketSpacingWithinInterval([this.lastReceivedAtIso, receivedAtIso], this.intervalMs);
    }
    this.lastReceivedAtIso = receivedAtIso;
  }
}
