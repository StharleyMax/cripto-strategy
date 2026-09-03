// `T-08.9` (plan `08_superficie_e_reprodutibilidade.md` item 8.6, `SPEC-001` §6) — falsifiers
// for `s2-asof-frame.ts`. Every negative case plants the WRONG value and asserts the module
// rejects it, per the builder mandate: "se voce afirma que uma protecao funciona, mostre o
// caso que ela rejeita".
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AMBIENT_BORDER_WIDTH_PX,
  AS_OF_FRAME_LABEL_MARKER,
  AS_OF_FRAME_MIN_MULTIPLIER,
  AS_OF_FRAME_WIDTH_PX,
  AsOfLabelLeakedUnderLiveError,
  FrameLabelMissingMarkerError,
  FrameNotNoticeableError,
  MissingKnowledgeTimeLabelError,
  assertFrameIsNoticeable,
  buildAsOfFrame,
} from "./s2-asof-frame.ts";
import type { AsOfFrame } from "./s2-asof-frame.ts";

test("AO_VIVO with no label produces an inactive frame", () => {
  const frame = buildAsOfFrame("AO_VIVO", null);
  assert.deepEqual(frame, { active: false });
});

test("MORDE: AO_VIVO with a surviving knowledgeTimeLabel is refused, not silently dropped", () => {
  assert.throws(
    () => buildAsOfFrame("AO_VIVO", "2026-09-01T00:00:00Z"),
    AsOfLabelLeakedUnderLiveError,
  );
});

test("COMO_EM_T with a label produces an active frame carrying both channels", () => {
  const frame = buildAsOfFrame("COMO_EM_T", "2026-09-01T00:00:00Z");
  assert.equal(frame.active, true);
  if (frame.active) {
    assert.equal(frame.widthPx, AS_OF_FRAME_WIDTH_PX);
    assert.equal(frame.label, "COMO EM T · 2026-09-01T00:00:00Z");
    assert.ok(frame.label.includes(AS_OF_FRAME_LABEL_MARKER));
  }
});

test("MORDE: COMO_EM_T with a null label is refused, never rendered with nothing to say", () => {
  assert.throws(() => buildAsOfFrame("COMO_EM_T", null), MissingKnowledgeTimeLabelError);
});

test("MORDE: COMO_EM_T with a blank (whitespace-only) label is refused", () => {
  assert.throws(() => buildAsOfFrame("COMO_EM_T", "   "), MissingKnowledgeTimeLabelError);
});

test("the emitted width is at least AS_OF_FRAME_MIN_MULTIPLIER times the system's ambient border", () => {
  assert.ok(AS_OF_FRAME_WIDTH_PX >= AMBIENT_BORDER_WIDTH_PX * AS_OF_FRAME_MIN_MULTIPLIER);
  // STITCH_CONTEXT.md:225 — "bordas 1px" is the doc-measured ambient value this compares against.
  assert.equal(AMBIENT_BORDER_WIDTH_PX, 1);
});

test("CALA: assertFrameIsNoticeable accepts what buildAsOfFrame actually produces", () => {
  const frame = buildAsOfFrame("COMO_EM_T", "2026-09-01T00:00:00Z");
  assert.doesNotThrow(() => assertFrameIsNoticeable(frame));
});

test("CALA: assertFrameIsNoticeable accepts an inactive frame trivially", () => {
  const frame = buildAsOfFrame("AO_VIVO", null);
  assert.doesNotThrow(() => assertFrameIsNoticeable(frame));
});

test("MORDE: assertFrameIsNoticeable rejects a frame no wider than the system's ambient chrome", () => {
  const poisoned: AsOfFrame = { active: true, widthPx: AMBIENT_BORDER_WIDTH_PX, label: "COMO EM T · x" };
  assert.throws(() => assertFrameIsNoticeable(poisoned), FrameNotNoticeableError);
});

test("MORDE: assertFrameIsNoticeable rejects a frame whose label drops the required marker", () => {
  const poisoned: AsOfFrame = { active: true, widthPx: AS_OF_FRAME_WIDTH_PX, label: "modo histórico" };
  assert.throws(() => assertFrameIsNoticeable(poisoned), FrameLabelMissingMarkerError);
});

// [QA] T-08.9 — falsificador da propria protecao: NaN nao e menor que nenhum numero em JS
// ('NaN < 4' e 'false'), entao 'widthPx < AMBIENT*MULTIPLIER' nao dispara para NaN. Um
// widthPx invalido (NaN) chegando ate assertFrameIsNoticeable e exatamente o caso que
// 'impossivel de nao notar' deveria recusar: CSS com largura NaN e invalido e tipicamente
// renderiza SEM borda nenhuma (0px/omitido pelo motor de renderizacao), o oposto do que o
// falsificador promete provar. Este teste PROVA o defeito (deve falhar contra o codigo
// atual) — nao e correcao, e evidencia para o QA gate.
test("MORDE (achado QA, nao corrigido): assertFrameIsNoticeable rejects a NaN widthPx", () => {
  const poisoned: AsOfFrame = { active: true, widthPx: Number.NaN, label: "COMO EM T · x" };
  assert.throws(() => assertFrameIsNoticeable(poisoned), FrameNotNoticeableError);
});
