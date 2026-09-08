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
 * What this module owns is the CONTRACT: the request that opens a stream, the envelope shape a
 * message on that stream carries (D2), and the two gates that make the ADR's falsifier
 * executable on any payload/sequence a real stream will someday produce — zero tick-level
 * field, and rate never finer than `max(1 Hz, 1/TF)`. `T-01.5` below corrects the open request
 * to match the REAL route (`ADR-034`), which never accepts `bar_policy`.
 *
 * Reuse, not reinvention: `assertNoTickLevelFields` and `assertBucketSpacingWithinInterval` are
 * imported from `./history-transport.ts` rather than redeclared — the falsifier is the SAME ADR
 * for both routes, and a second implementation of either gate would be exactly the class of
 * drift `D1`'s two-route split does not license.
 *
 * `T-01.5` (`pagina-de-grafico-s2`) — CORRECTION: this module was written (`T-08.11`) BEFORE
 * `ADR-034` fixed the real wire of `GET {API_PREFIX}/series-live` (`T-01.4`), and guessed
 * `camelCase` plus a `bar_policy` field that route never accepts
 * (`backend/src/api/routes/series_live.py`: `series_key_id`, `symbol`, `interval` — no
 * `bar_policy`, because the live edge's partial-bucket envelope is "always in formation, live"
 * and there is no policy for a consumer to declare). This correction renames the open-request
 * fields to the real, `snake_case` ones and DROPS `bar_policy`/`BarPolicy` from the open
 * request entirely; the bucket envelope below (`ADR-005/D2`) is untouched — it was already
 * `snake_case` and unchanged by `ADR-034`.
 */

import {
  assertBucketSpacingWithinInterval,
  assertNoTickLevelFields,
} from "./history-transport.ts";

// ── The request that opens a live stream (D1) ───────────────────────────────────────────────

/**
 * What a consumer sends to open the one SSE stream for a series. There is no
 * `knowledge_time_ms` here (unlike `HistoryRequestKey`) — the live edge has no fixed instant to
 * key a cache by, its horizon is "now". There is also no `bar_policy`: `ADR-034`/
 * `series_live.py` never accepts one — the live envelope is structurally always in formation.
 */
export interface LiveStreamOpenRequest {
  readonly series_key_id: string;
  readonly symbol: string;
  /** The grid's native label (`"1m"`, `"5m"`…), never parsed here — same boundary
   * `HistoryRequestKey.interval` draws; the canonical grid belongs to `charts` (`T-05.1`). */
  readonly interval: string;
}

const OPEN_REQUEST_PARAM_ORDER = ["series_key_id", "symbol", "interval"] as const;

function assertNonEmpty(value: string, field: string): void {
  if (value.trim() === "") {
    throw new Error(`invalid live stream request: field "${field}" must not be empty`);
  }
}

/** Validates a `LiveStreamOpenRequest` before it becomes a URL/subscription. Rejects rather
 * than accepts an ambiguous state — same posture as `assertValidHistoryRequestKey`. */
export function assertValidLiveStreamOpenRequest(request: LiveStreamOpenRequest): void {
  assertNonEmpty(request.series_key_id, "series_key_id");
  assertNonEmpty(request.symbol, "symbol");
  assertNonEmpty(request.interval, "interval");
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
 * The inverse of `encodeLiveStreamOpenRequest`. No field here has a fallback — a missing
 * `series_key_id`/`symbol`/`interval` is REFUSED, never silently defaulted.
 */
export function decodeLiveStreamOpenRequest(params: URLSearchParams): LiveStreamOpenRequest {
  const seriesKeyId = params.get("series_key_id");
  const symbol = params.get("symbol");
  const interval = params.get("interval");

  if (seriesKeyId === null) throw new Error('invalid live stream request: parameter "series_key_id" is missing');
  if (symbol === null) throw new Error('invalid live stream request: parameter "symbol" is missing');
  if (interval === null) throw new Error('invalid live stream request: parameter "interval" is missing');

  const request: LiveStreamOpenRequest = { series_key_id: seriesKeyId, symbol, interval };
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
 * The bucket is still open. `is_final` is typed as the LITERAL `false` here, not `boolean`: a
 * caller cannot construct an in-progress envelope and merely forget to set the flag, because
 * there is no other value the type accepts. This is the "nunca omitido/implícito" requirement
 * enforced at the type level, not only at the runtime check `decodeBucketEnvelope` also
 * performs.
 *
 * `T-01.5` correction: `D4`'s original design ("`bar_policy` filters which variant a consumer
 * receives") assumed the open request carried a `bar_policy` — `ADR-034`/`series_live.py`
 * drops that field for F1 (`LiveStreamOpenRequest` above has none), so BOTH variants can arrive
 * on the same stream today; filtering by `is_final`, if a consumer wants only closed buckets,
 * is the CALLER's job, not this transport's.
 */
export interface InProgressBucketEnvelope extends BucketEnvelopeFields {
  readonly is_final: false;
}

/** The bucket closed. */
export interface FinalBucketEnvelope extends BucketEnvelopeFields {
  readonly is_final: true;
}

/** Discriminated on `is_final` — a switch over `envelope.is_final` narrows exhaustively. */
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
