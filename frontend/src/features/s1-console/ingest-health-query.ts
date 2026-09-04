/**
 * `T-07.13` — the `web` CONSUMER of the ONE named query `ADR-008/D3` fixes:
 * `ingest_health_query` (`backend/src/modules/sentimento/use_cases/ingest_health.py:32`),
 * `INGEST_HEALTH_QUERY_NAME = "ingest_health_query"` (same file, line 21).
 *
 * ── THE BOUNDARY THIS MODULE OBEYS, LITERAL FROM THE DISPATCH ──────────────────────────────
 *
 * `docs/context/plataforma-dados/handoff/T-07.13.md`: backend has NO HTTP framework yet
 * (`[MEDIDO]` by `T-05.9`: zero `fastapi`/`flask`/`uvicorn`), so the browser cannot call
 * `ingest_health_query` live, and inventing an endpoint is explicitly OUT of this task. What
 * IS authorized: invoking `ingest_health_cli.py` as a READ-ONLY SUBPROCESS against a local
 * SQLite fixture — not editing `backend/`, consuming what already exists, same class of move
 * as `T-05.9` consuming `as_of_accessor.py`. This module does exactly that, and nothing more:
 * `runIngestHealthCli` below is a synchronous, read-only child-process call. Production wiring
 * of a real, async, server-side route is future work, out of `D7.17`'s scope.
 *
 * ── WHAT `D7.17` ACTUALLY DEMANDS, AND WHY A SECOND SUBPROCESS CALL WOULD NOT PROVE IT ──────
 *
 * `docs/plans/SPEC-001-plataforma-dados/07_aquisicao_em_regime.md`, `D7.17`: "a consulta é
 * UMA: `sha256` da projeção canônica da saída do CLI IGUAL à que alimenta S1; e um `verdict`
 * INÉDITO ⇒ os dois mudam juntos ou os dois reprovam." `ADR-008/D3` names the defect this
 * guards: "UMA consulta nomeada, DOIS consumidores" — if S1 read the store through its OWN
 * second query, the repository would have two implementations of the same truth, diverging
 * silently on the first unheard-of `verdict`.
 *
 * So this module does NOT reimplement the query. `fetchIngestHealthProjectionViaCli` gets its
 * data from the SAME subprocess call that IS consumer #1 (the CLI) — there is no second SQL,
 * no second store read. What it DOES independently is re-derive the canonical projection from
 * the PARSED rows (`canonicalLines`/`fingerprint` below, a byte-for-byte mirror of
 * `backend/src/modules/sentimento/domain/ingest_record.py`'s `_project_run`/`_project_gap`/
 * `canonical_json.py`) and compare that reconstruction's `sha256` against the CLI's own
 * `sha256` of the SAME output. A parsing bug, a dropped column, a reordered field, or a
 * silently-invented default for an unrecognised `verdict` would each move the TS-side
 * reconstruction away from the CLI's bytes — and the function THROWS the moment that happens,
 * rather than only in a test. That is the falsifier this module carries at runtime, not only
 * at test time.
 *
 * `KNOWN_VERDICTS` is NOT re-declared here for that same reason: this module never inspects
 * `verdict` to decide admission. An unheard-of `verdict` makes `ingest_health_query` raise
 * `UnknownVerdictError` inside the CLI process, so the subprocess exits non-zero with EMPTY
 * `stdout` — `runIngestHealthCli`/`fetchIngestHealthProjectionViaCli` propagate that failure
 * as a thrown `Error` instead of returning a partial or default-filled projection. If this
 * module ever grew its own verdict allowlist, THAT would be the second implementation.
 *
 * ── GATILHO DE REABERTURA DE `ADR-008/D3` (`janela_de_perda`, `CLAUDE.md` tabela linha 11) ──
 *
 * `T-07.13` is named, in `CLAUDE.md`'s boundary table and in the handoff, as the task whose
 * REAL implementation flips the trigger: "a reabertura acontece quando T-07.12/T-07.13 …
 * escreverem o consumidor da projeção canônica." `T-07.12` used a synthetic fixture and did
 * NOT trip it (registered in `T-07.12-builder.md`). This module DOES read
 * `ingest_health_query`'s real output (via the CLI it already ships), so it IS that consumer.
 * Per the handoff: this file does not decide the naming question — `janela_de_perda` stays
 * exactly as `ingest_record.py:87-89` names it, verbatim, because the column name is
 * `ADR-008/D3`'s contract, not this task's. The gate report registers that the trigger fired;
 * the decision itself belongs to `ADR-008/D3`/the owner, not to this module or this workflow.
 *
 * ── SCOPE NOT COVERED HERE, NAMED SO IT IS NOT MISTAKEN FOR AN OVERSIGHT ────────────────────
 *
 * `collectorRowsFromIngestHealthProjection` (below) maps the query's raw rows into
 * `CollectorRow` (`domain.ts`) so `buildS1ViewModelFromIngestHealthProjection` can hand
 * `S1Console.tsx` a real `S1ViewModel`. This mapping is DELIBERATELY MINIMAL: the shared
 * query's projection carries no per-series retention FORMULA classification (`computed_uniform`
 * vs `measured_sparse` vs `doc_only`, `D7.12`-`D7.14`) and no resilience/SLO-trail signal
 * (`D7.13`) — those are `T-07.12`'s fixture-backed domain, owned by a different DoD range than
 * `D7.17`. Inventing that classification here from columns that do not carry it would be the
 * same class of overreach the dispatch forbids for the HTTP endpoint, generalised: this module
 * states plainly which choices are grounded in the query's own columns (`statusFromVerdict`,
 * `uptimePercent`) and which are a deliberately narrow placeholder (`resilience` is always
 * `not_scored`; `retention` is `unmeasured` unless the query ever emits a non-null
 * `janela_de_perda`, which F0 never does — `ingest_record.py:91`, `LOSS_WINDOW_NOT_COMPUTED_IN_F0`).
 *
 * ── UPDATE, `T-05.14`/`ADR-019`: THE ROUTE THIS MODULE'S DOCSTRING ONCE SAID DID NOT EXIST ──
 *
 * The two paragraphs above are `T-07.13`'s ORIGINAL record — "backend has NO HTTP framework
 * yet" was true when they were written and is kept verbatim because it is the reasoning that
 * justified the CLI-subprocess transport at the time, not because it is still current. It is
 * NOT current: `T-05.12` (`backend/src/api/routes/ingest_health.py`) added `GET
 * /ingest-health`, the real HTTP consumer of the SAME `ingest_health_query`, served over a
 * real socket (`backend/tests/api/test_ingest_health_route_over_the_network.py`). `ADR-019`
 * is the decision that adds `fetchIngestHealthProjectionViaHttp`/`parseIngestHealthEnvelope`
 * to this module for that route, dropping the CLI-only parser (`SectionMarker`/`isHeaderLine`/
 * `parseCanonicalProjection`) and its single caller
 * (`fetchIngestHealthProjectionViaCli`/`IngestHealthQueryResult`) — the NDJSON shape they read
 * died with `ADR-005/D6.1`'s envelope. `runIngestHealthCli` and the rest of the subprocess
 * transport are UNCHANGED here: removing them outright is `T-05.15`, not this task.
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertNoTickLevelFields } from "../../app/history-transport.ts";
import {
  buildS1ViewModel,
  type S1ViewModel,
} from "./view-model.ts";
import type {
  CollectorRow,
  CollectorStatus,
  ReconnectionEvent,
  StorageBudgetLine,
} from "./domain.ts";

/** Mirror of `INGEST_HEALTH_QUERY_NAME` (`use_cases/ingest_health.py:21`) — the name is how
 * this, the SECOND consumer, is meant to find the query: by this string, not by reading SQL. */
export const INGEST_HEALTH_QUERY_NAME = "ingest_health_query";

// ── THE PROJECTED SHAPE, TRANSCRIBED FROM `ADR-008/D3` — NOT DERIVED FROM PYTHON SOURCE ────
//
// There is no cross-language import, so "transcribed" here means what it means in
// `backend/tests/sentimento/test_ingest_health_query.py`'s `ADR_008_D3_RUN_COLUMNS`: typed by
// hand from the ADR/plan text, kept as an INDEPENDENT witness so a column reorder in
// `projectRun`/`projectGap` below has something to disagree with in `ingest-health-query.test.ts`.

/** The 15 columns `ADR-008/D3` fixes for `md.ingest_run`'s projection, in the ADR's order. */
export const INGEST_HEALTH_RUN_COLUMNS: readonly string[] = [
  "run_id",
  "source",
  "endpoint",
  "window",
  "n_expected",
  "n_returned",
  "n_written",
  "verdict",
  "api_code",
  "src_sha256",
  "weight_used",
  "observer_id",
  "observer_region",
  "clock_skew_ms",
  "janela_de_perda",
];

/** `SPEC-001` §3.5's `md.ingest_gap` columns, wire name `class` (never `gap_class`). */
export const INGEST_HEALTH_GAP_COLUMNS: readonly string[] = [
  "source",
  "symbol",
  "series_key_id",
  "from_ts",
  "to_ts",
  "n_missing",
  "class",
  "detected_at",
];

/** One projected `md.ingest_run` row. `janela_de_perda` is `null` throughout F0
 * (`ingest_record.py:91`) — never a guessed number. */
export interface IngestHealthRunRow {
  readonly run_id: string;
  readonly source: string;
  readonly endpoint: string;
  readonly window: string;
  readonly n_expected: number;
  readonly n_returned: number;
  readonly n_written: number;
  readonly verdict: string;
  readonly api_code: number | null;
  readonly src_sha256: string;
  readonly weight_used: number;
  readonly observer_id: string;
  readonly observer_region: string;
  readonly clock_skew_ms: number;
  readonly janela_de_perda: number | null;
}

/** One projected `md.ingest_gap` row. The field is named `class`, matching the wire key —
 * Python renames it `gap_class` only because `class` is reserved there; TypeScript has no
 * such reservation on an object property, so no renaming is needed here. */
export interface IngestHealthGapRow {
  readonly source: string;
  readonly symbol: string;
  readonly series_key_id: string;
  readonly from_ts: string;
  readonly to_ts: string;
  readonly n_missing: number;
  readonly class: string;
  readonly detected_at: string;
}

/** What `ingest_health_query` returns, mirrored: the runs and the gaps. */
export interface IngestHealthProjection {
  readonly runs: readonly IngestHealthRunRow[];
  readonly gaps: readonly IngestHealthGapRow[];
}

/**
 * TypeScript mirror of `canonical_json.py`: no whitespace slack (`JSON.stringify` with no
 * indent argument already matches Python's `separators=(",", ":")`), insertion order IS the
 * field order (both languages preserve string-key insertion order), and every non-ASCII code
 * point escaped as `\uXXXX` — lowercase hex, four digits — mirroring `ensure_ascii=True`.
 * JavaScript strings are UTF-16 code units already, so this needs no separate surrogate-pair
 * handling: an astral character is two code units, each escaped on its own, exactly like
 * Python's `ensure_ascii` does for the same character.
 */
export function canonicalJson(payload: Readonly<Record<string, unknown>>): string {
  const raw = JSON.stringify(payload);
  // A loop over UTF-16 code UNITS (`raw[index]`/`charCodeAt(index)`, never `for...of`, which
  // iterates code POINTS and would merge a surrogate pair before it could be escaped half by
  // half) -- deliberately not a regex literal, so the escape boundary is a plain numeric
  // comparison instead of a hand-typed character class. `0x80` is the exact boundary
  // `ensure_ascii=True` uses: ASCII is 0-127, so codepoint 127 (DEL) stays UNESCAPED, matching
  // Python's `json.dumps` exactly rather than a more aggressive cutoff.
  let escaped = "";
  for (let index = 0; index < raw.length; index += 1) {
    const code = raw.charCodeAt(index);
    escaped += code >= 128 ? `\\u${code.toString(16).padStart(4, "0")}` : raw[index];
  }
  return escaped;
}

/** Project one run onto the 15 columns, THIS ORDER — independent of
 * `INGEST_HEALTH_RUN_COLUMNS` above on purpose, so the guard test in
 * `ingest-health-query.test.ts` is not comparing a value against itself. */
function projectRun(run: IngestHealthRunRow): string {
  return canonicalJson({
    run_id: run.run_id,
    source: run.source,
    endpoint: run.endpoint,
    window: run.window,
    n_expected: run.n_expected,
    n_returned: run.n_returned,
    n_written: run.n_written,
    verdict: run.verdict,
    api_code: run.api_code,
    src_sha256: run.src_sha256,
    weight_used: run.weight_used,
    observer_id: run.observer_id,
    observer_region: run.observer_region,
    clock_skew_ms: run.clock_skew_ms,
    janela_de_perda: run.janela_de_perda,
  });
}

/** Project one gap onto `md.ingest_gap`'s 8 columns, keeping `class` as the wire name. */
function projectGap(gap: IngestHealthGapRow): string {
  return canonicalJson({
    source: gap.source,
    symbol: gap.symbol,
    series_key_id: gap.series_key_id,
    from_ts: gap.from_ts,
    to_ts: gap.to_ts,
    n_missing: gap.n_missing,
    class: gap.class,
    detected_at: gap.detected_at,
  });
}

/** Mirror of `IngestHealthReport.canonical_lines()` — header, section markers, then rows, each
 * line independently valid JSON, in the SAME order the CLI emits them. */
export function canonicalLines(projection: IngestHealthProjection): readonly string[] {
  const header = canonicalJson({
    query: INGEST_HEALTH_QUERY_NAME,
    n_runs: projection.runs.length,
    n_gaps: projection.gaps.length,
  });
  const lines: string[] = [
    header,
    canonicalJson({ section: "ingest_run", n: projection.runs.length }),
  ];
  for (const run of projection.runs) {
    lines.push(projectRun(run));
  }
  lines.push(canonicalJson({ section: "ingest_gap", n: projection.gaps.length }));
  for (const gap of projection.gaps) {
    lines.push(projectGap(gap));
  }
  return lines;
}

/** Mirror of `IngestHealthReport.canonical_projection()` — the exact bytes the CLI writes. */
export function canonicalProjection(projection: IngestHealthProjection): string {
  return canonicalLines(projection).join("\n");
}

/** Mirror of `IngestHealthReport.fingerprint()` — the identity `ADR-008/DoD-2` compares. */
export function fingerprint(projection: IngestHealthProjection): string {
  return createHash("sha256").update(canonicalProjection(projection), "utf8").digest("hex");
}

// ── PARSING THE HTTP ENVELOPE — `ADR-005/D6.1` + `ADR-019/D2` ───────────────────────────────
//
// The envelope is a nested JSON object (`{ query, n_runs, n_gaps, runs[], gaps[] }`), not the
// CLI's line-delimited NDJSON — the NDJSON parser this module used to carry (`SectionMarker`/
// `isHeaderLine`/`parseCanonicalProjection`) is gone with it (`ADR-019/D1`). Permissive on an
// UNKNOWN field, strict on a MISSING or MISTYPED one: `projectRun`/`projectGap` above already
// read by column name, never by position, so an extra key never reaches the canonicalization
// that feeds `fingerprint` — only a missing or mistyped one can.

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type EnvelopeFieldKind = "string" | "number" | "nullable-number";

function assertEnvelopeFieldType(
  value: unknown,
  column: string,
  kind: EnvelopeFieldKind,
  context: string,
): void {
  if (kind === "string" && typeof value === "string") {
    return;
  }
  if (kind === "number" && typeof value === "number") {
    return;
  }
  if (kind === "nullable-number" && (value === null || typeof value === "number")) {
    return;
  }
  throw new Error(
    `${context}: column "${column}" has the wrong type (expected ${kind}, got ` +
      `${value === null ? "null" : typeof value})`,
  );
}

const RUN_ROW_FIELD_KINDS: ReadonlyMap<string, EnvelopeFieldKind> = new Map([
  ["run_id", "string"],
  ["source", "string"],
  ["endpoint", "string"],
  ["window", "string"],
  ["n_expected", "number"],
  ["n_returned", "number"],
  ["n_written", "number"],
  ["verdict", "string"],
  ["api_code", "nullable-number"],
  ["src_sha256", "string"],
  ["weight_used", "number"],
  ["observer_id", "string"],
  ["observer_region", "string"],
  ["clock_skew_ms", "number"],
  ["janela_de_perda", "nullable-number"],
]);

const GAP_ROW_FIELD_KINDS: ReadonlyMap<string, EnvelopeFieldKind> = new Map([
  ["source", "string"],
  ["symbol", "string"],
  ["series_key_id", "string"],
  ["from_ts", "string"],
  ["to_ts", "string"],
  ["n_missing", "number"],
  ["class", "string"],
  ["detected_at", "string"],
]);

function assertIngestHealthRunRow(
  value: unknown,
  index: number,
): asserts value is IngestHealthRunRow {
  if (!isPlainRecord(value)) {
    throw new Error(`ingest_health_query envelope: runs[${index}] is not a plain object`);
  }
  for (const [column, kind] of RUN_ROW_FIELD_KINDS) {
    if (!(column in value)) {
      throw new Error(`ingest_health_query envelope: runs[${index}] is missing column "${column}"`);
    }
    assertEnvelopeFieldType(value[column], column, kind, `ingest_health_query envelope: runs[${index}]`);
  }
}

function assertIngestHealthGapRow(
  value: unknown,
  index: number,
): asserts value is IngestHealthGapRow {
  if (!isPlainRecord(value)) {
    throw new Error(`ingest_health_query envelope: gaps[${index}] is not a plain object`);
  }
  for (const [column, kind] of GAP_ROW_FIELD_KINDS) {
    if (!(column in value)) {
      throw new Error(`ingest_health_query envelope: gaps[${index}] is missing column "${column}"`);
    }
    assertEnvelopeFieldType(value[column], column, kind, `ingest_health_query envelope: gaps[${index}]`);
  }
}

/**
 * Parse `GET /ingest-health`'s decoded JSON body into typed rows (`ADR-005/D6.1`'s envelope
 * shape). Every element of `runs`/`gaps` has to carry the 15/8 named columns with the right
 * type — a key BEYOND those is ignored, never rejected (`ADR-019/D2`), matching the postures
 * `projectRun`/`projectGap` already have. `n_runs`/`n_gaps` have to agree with the arrays'
 * `length` — a defensive check against a truncated response, since the header itself declares
 * the count.
 */
export function parseIngestHealthEnvelope(body: unknown): IngestHealthProjection {
  if (!isPlainRecord(body)) {
    throw new Error("ingest_health_query envelope: response body is not a plain JSON object");
  }
  if (body.query !== INGEST_HEALTH_QUERY_NAME) {
    throw new Error(
      `ingest_health_query envelope: "query" is ${JSON.stringify(body.query)}, expected ` +
        `${JSON.stringify(INGEST_HEALTH_QUERY_NAME)}`,
    );
  }
  if (!Array.isArray(body.runs)) {
    throw new Error('ingest_health_query envelope: "runs" is missing or not an array');
  }
  if (!Array.isArray(body.gaps)) {
    throw new Error('ingest_health_query envelope: "gaps" is missing or not an array');
  }
  if (body.n_runs !== body.runs.length) {
    throw new Error(
      `ingest_health_query envelope: "n_runs" (${JSON.stringify(body.n_runs)}) disagrees ` +
        `with runs.length (${body.runs.length}) — this is exactly what a truncated response ` +
        "looks like",
    );
  }
  if (body.n_gaps !== body.gaps.length) {
    throw new Error(
      `ingest_health_query envelope: "n_gaps" (${JSON.stringify(body.n_gaps)}) disagrees ` +
        `with gaps.length (${body.gaps.length}) — this is exactly what a truncated response ` +
        "looks like",
    );
  }

  const runs: IngestHealthRunRow[] = body.runs.map((run, index) => {
    assertIngestHealthRunRow(run, index);
    return run;
  });
  const gaps: IngestHealthGapRow[] = body.gaps.map((gap, index) => {
    assertIngestHealthGapRow(gap, index);
    return gap;
  });

  return { runs, gaps };
}

const THIS_FILE_DIR = path.dirname(fileURLToPath(import.meta.url));

/** `frontend/src/features/s1-console/` → repo root → `backend`. Overridable per call — the
 * test suite never relies on this default reaching outside its own worktree unexpectedly. */
const DEFAULT_BACKEND_ROOT = path.resolve(THIS_FILE_DIR, "../../../../backend");

export interface IngestHealthCliOptions {
  /** Defaults to `<repo>/backend`. */
  readonly backendRoot?: string;
  /** Defaults to `<backendRoot>/.venv/bin/python3`. */
  readonly pythonBin?: string;
}

export interface IngestHealthCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

// The exact composition-root shape `backend/tests/sentimento/test_ingest_health_query.py`
// itself uses to invoke the CLI as a subprocess (`test_the_product_never_leaks_onto_the_
// diagnostic_stream`) — imported by its REAL dotted path, never run as `__main__`. Running it
// as `__main__` renames the CLI's own logger to `"__main__"`, which collides with the
// diagnostic logger `route_diagnostics_away_from_the_product_stream` installs and duplicates
// every line onto both streams `[MEDIDO 2026-09-02, this task's own bench: `python3 -m
// src.modules.sentimento.infra.ingest_health_cli <path>` prints every projection line TWICE,
// once as bare JSON and once prefixed "INFO __main__ …"; importing `main` by its dotted path
// instead, as below, reproduces the CLI's own test and leaves `stdout` byte-clean]`.
const HOSTED_SCRIPT = [
  "import sys",
  "from src.modules.sentimento.infra.ingest_health_cli import main",
  "raise SystemExit(main(sys.argv[1:]))",
].join("\n");

/**
 * Run `ingest_health_cli` as a read-only subprocess against `storePath` — consumer #1,
 * unmodified. Synchronous on purpose: this is a read adapter for proving `D7.17`, not a
 * request handler in a running server (none exists yet in `frontend/` — see module docstring).
 */
export function runIngestHealthCli(
  storePath: string,
  options: IngestHealthCliOptions = {},
): IngestHealthCliResult {
  const backendRoot = options.backendRoot ?? DEFAULT_BACKEND_ROOT;
  const pythonBin = options.pythonBin ?? path.join(backendRoot, ".venv", "bin", "python3");

  if (!existsSync(pythonBin)) {
    throw new Error(
      `RECUSA: ${pythonBin} nao existe. Rode 'bash backend/scripts/bootstrap.sh' (precisa de ` +
        "rede) ou reaproveite um .venv ja construido — cair para um interprete do PATH rodaria " +
        "o falsificador de D7.17 num ambiente que o repositorio nao declarou.",
    );
  }

  const result = spawnSync(pythonBin, ["-c", HOSTED_SCRIPT, storePath], {
    cwd: backendRoot,
    encoding: "utf8",
  });
  if (result.error) {
    throw result.error;
  }
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

// ── THE HTTP TRANSPORT — `ADR-005/D6.1`/`D6.4`, `ADR-019/D3`/`D4` ───────────────────────────

export interface IngestHealthHttpOptions {
  /** Defaults to `process.env.INGEST_HEALTH_API_BASE_URL` — NEVER `NEXT_PUBLIC_*`
   * (`ADR-019/D4`: that family is inlined into the browser bundle, and this module has to
   * stay server-only). Passing it explicitly is how tests point at a loopback server. */
  readonly baseUrl?: string;
  /** Injectable so a test can pass a real `fetch` bound to a test server, and so a future
   * caller is never forced to depend on the ambient global. */
  readonly fetchImpl?: typeof fetch;
}

/** What `fetchIngestHealthProjectionViaHttp` returns: the typed projection, plus the
 * fingerprint this client computed over it — never one read off the wire (`ADR-019/D3`). */
export interface IngestHealthHttpResult {
  readonly projection: IngestHealthProjection;
  readonly fingerprint: string;
}

function resolveIngestHealthBaseUrl(explicit: string | undefined): string {
  const baseUrl = explicit ?? process.env.INGEST_HEALTH_API_BASE_URL;
  if (baseUrl === undefined || baseUrl === "") {
    throw new Error(
      "fetchIngestHealthProjectionViaHttp: no base URL configured — pass options.baseUrl or " +
        "set INGEST_HEALTH_API_BASE_URL. Never INGEST_HEALTH_API_BASE_URL prefixed with " +
        "NEXT_PUBLIC_ (ADR-019/D4): that family is inlined into the browser bundle, and this " +
        "module must stay server-only.",
    );
  }
  return baseUrl;
}

/**
 * The `web` HTTP consumer of `GET /ingest-health` (`ADR-005/D6.1`, `ADR-019`). Only the
 * network round trip (`fetch` + `response.json()`) is asynchronous — from the decoded body
 * onward, `parseIngestHealthEnvelope` → `fingerprint` is the SAME synchronous chain the CLI
 * path already used (`ADR-005/D6.4`: the canonicalization/fingerprint instrument itself never
 * becomes a `Promise`). `assertNoTickLevelFields` (`../../app/history-transport.ts`) runs
 * over the raw decoded body first — `ADR-005`'s falsifier stays agnostic of this module's own
 * schema, same as it already is for the historical transport.
 */
export async function fetchIngestHealthProjectionViaHttp(
  options: IngestHealthHttpOptions = {},
): Promise<IngestHealthHttpResult> {
  const baseUrl = resolveIngestHealthBaseUrl(options.baseUrl);
  const doFetch = options.fetchImpl ?? fetch;
  const url = new URL("/ingest-health", baseUrl);

  const response = await doFetch(url);
  if (!response.ok) {
    throw new Error(
      `fetchIngestHealthProjectionViaHttp: GET ${url.toString()} answered ${response.status} ` +
        `${response.statusText}`,
    );
  }
  const body: unknown = await response.json();
  assertNoTickLevelFields(body);

  const projection = parseIngestHealthEnvelope(body);
  return { projection, fingerprint: fingerprint(projection) };
}

// ── MAPEAMENTO PARA `CollectorRow` — MÍNIMO E DELIBERADO, VER O DOCSTRING DO MÓDULO ─────────

function statusFromVerdict(verdict: string): CollectorStatus {
  // The only fact this module reads off `verdict` to pick a `CollectorStatus`: a `REJECTED`
  // MOST RECENT run is observable evidence the collector's last attempt failed. This is NOT a
  // liveness/heartbeat signal (`D7.9` owns that) — it is the narrowest reading of what the
  // query itself hands back, named so nobody mistakes it for the real thing.
  return verdict === "REJECTED" ? "PARADO" : "ATIVO";
}

function collectorRowFromRun(run: IngestHealthRunRow): CollectorRow {
  return {
    series: `${run.source} · ${run.endpoint}`,
    retention:
      run.janela_de_perda === null
        ? { kind: "unmeasured" }
        : { kind: "declared_constant", days: run.janela_de_perda },
    resilience: { kind: "not_scored" },
    status: statusFromVerdict(run.verdict),
    uptimePercent: run.n_expected > 0 ? (run.n_written / run.n_expected) * 100 : null,
    statusDetail: null,
  };
}

/**
 * One `CollectorRow` per `(source, endpoint)` pair, keeping only the MOST RECENT run for each.
 *
 * `IngestHealthRunRow` carries no timestamp — `started_at`/`ended_at` are TABLE-only columns,
 * never projected (`ingest_record.py:18`, "QUERY only: `janela_de_perda`" / "TABLE only:
 * `started_at`, `ended_at`"). What IS reliable is the store's own read order:
 * `SqliteIngestRecordStore`'s `_SELECT_RUNS` is `ORDER BY started_at, run_id` ASCENDING, a
 * documented, tested invariant ("A ORDENACAO E PARTE DA IMPRESSAO DIGITAL",
 * `sqlite_ingest_record_store.py`). Keeping the LAST row seen per key therefore keeps that
 * key's most recent run, without this module inventing its own notion of recency.
 */
export function collectorRowsFromIngestHealthProjection(
  projection: IngestHealthProjection,
): readonly CollectorRow[] {
  const latestByKey = new Map<string, IngestHealthRunRow>();
  for (const run of projection.runs) {
    latestByKey.set(`${run.source}::${run.endpoint}`, run);
  }
  return [...latestByKey.values()].map(collectorRowFromRun);
}

/**
 * The full `S1ViewModel`, with `rows` sourced from the shared query — `storageBudgetLines`,
 * `etlQueueDepthPending` and `reconnectionEvents` stay CALLER-SUPPLIED, because they come from
 * a different data source entirely (Redis Streams consumer-group depth, `plano 07` itens
 * 7.6/7.7 — see `fixtures.ts`'s own note on `ETL_QUEUE_DEPTH_PENDING`), not from
 * `ingest_health_query`. Wiring those is a different task's DoD, not `D7.17`'s.
 */
export function buildS1ViewModelFromIngestHealthProjection(
  projection: IngestHealthProjection,
  etlQueueDepthPending: number,
  storageBudgetLines: readonly StorageBudgetLine[],
  reconnectionEvents: readonly ReconnectionEvent[],
): S1ViewModel {
  return buildS1ViewModel(
    collectorRowsFromIngestHealthProjection(projection),
    etlQueueDepthPending,
    storageBudgetLines,
    reconnectionEvents,
  );
}
