/**
 * `T-08.9` (plan `08_superficie_e_reprodutibilidade.md` item `8.6`, `SPEC-001` §6): "**S2
 * completa**: `as-of` com **moldura impossível de não notar**" — half of this task's title,
 * literal from `PRD-001-plataforma-dados.md:642` and `docs/plataforma-superficies-e-
 * faseamento.md:314`. The other half (marcação de fixture com teclado obrigatório) is
 * `s2-review-mode.ts`.
 *
 * ── WHAT ALREADY EXISTS, AND WHAT THIS TASK ADDS ─────────────────────────────────────────
 *
 * `T-05.8` (`frontend/src/app/knowledge-time-bundle.ts`) already gives `AO VIVO`/`COMO EM T`
 * a first-class `mode` in the URL/state contract, and `docs/product/STITCH_CONTEXT.md` §7/D2
 * already requires that leaving `COMO EM T` back to `AGORA` "tem sintoma visível" — delivered
 * as a small chrome pill (fill+borda migrating between two `<span>`s of the header, per
 * `T-05.8`'s own gate). That pill is real and is NOT rebuilt here. What THIS module adds is
 * the stronger symptom this task's own title names: not a pill in the 40px header chrome
 * (`web`'s job — `STITCH_CONTEXT.md:225`, "chrome 40px"), but a `charts`-owned geometry
 * decoration around the PANEL ITSELF, sized so it cannot be mistaken for the system's ambient
 * 1px chrome ("bordas 1px", same doc, same line) — the failure mode this exists to prevent is
 * an operator reading a frozen `COMO EM T` view as if it were live.
 *
 * ── PURE — `ADR-003` FR-1 ────────────────────────────────────────────────────────────────
 *
 * No I/O, no `Date.now()`, no DOM. `s2-badge.ts`'s own `SessionEnvelope.mode` (`"AO_VIVO" |
 * "COMO_EM_T"`) is reused verbatim rather than re-declared, so the two modules can never
 * drift on what the two mode strings are. Wiring this into an actual mounted panel is a
 * rendering task for later, same posture `s2-badge.ts` and `s2-pointer-mode.ts` already took
 * for the badge and the overlay stack.
 *
 * ── WHY NO NEW COLOR ROLE — `ADR-010`/D-4 ────────────────────────────────────────────────
 *
 * `color-tokens.ts`'s `ColorRole` is a closed union, deliberately not extended here: `ADR-010`
 * `D-4` ("ação e procedência NÃO consomem hue") is the same principle applied to a THIRD kind
 * of state — not a data value, not a procedência tag, but "how you are looking at the whole
 * screen". Rather than invent a role `color-tokens.test.ts`'s forbidden-substring guard was
 * never asked to reason about, "impossível de não notar" is built from two channels this
 * module DOES own: WIDTH (structural, `AS_OF_FRAME_WIDTH_PX`, asserted at 4× the system's own
 * declared ambient border) and TEXT (`label`, which always spells out "COMO EM T" plus the
 * verbatim `knowledgeTime` the caller supplies — never a bare color swatch). This is the same
 * redundancy-of-form discipline `ADR-010`'s `D-2` already applies to price direction ("o hue é
 * acelerador, não portador"): a reader with no color perception at all still gets the frame.
 */

import type { SessionEnvelope } from "./s2-badge.ts";

/** `STITCH_CONTEXT.md:225`: "bordas 1px" — the system's ambient, everywhere-else border width. */
export const AMBIENT_BORDER_WIDTH_PX = 1;

/** The frame is `AS_OF_FRAME_MIN_MULTIPLIER`× the ambient border, at minimum — the numeric
 * floor `assertFrameIsNoticeable` enforces, not just a comment. */
export const AS_OF_FRAME_MIN_MULTIPLIER = 4;

/** The width this module actually emits — comfortably above the floor above, not pinned to it. */
export const AS_OF_FRAME_WIDTH_PX = AMBIENT_BORDER_WIDTH_PX * AS_OF_FRAME_MIN_MULTIPLIER;

/** The literal words the label must carry — `PRD-001:642`'s own vocabulary for the mode. */
export const AS_OF_FRAME_LABEL_MARKER = "COMO EM T";

export class AsOfLabelLeakedUnderLiveError extends Error {}
export class MissingKnowledgeTimeLabelError extends Error {}

/** `active: false` under `AO_VIVO` — no width, no label, nothing for a renderer to draw. */
export interface InactiveAsOfFrame {
  readonly active: false;
}

/** `active: true` under `COMO_EM_T` — the two redundant channels: `widthPx` (structural) and
 * `label` (textual, always carrying `AS_OF_FRAME_LABEL_MARKER` verbatim). */
export interface ActiveAsOfFrame {
  readonly active: true;
  readonly widthPx: number;
  readonly label: string;
}

export type AsOfFrame = InactiveAsOfFrame | ActiveAsOfFrame;

/**
 * Builds the frame from `SessionEnvelope["mode"]` — the SAME string `s2-badge.ts` already
 * carries once per screen (`Nível 1 — SESSÃO`), so a caller never has to derive a second
 * source of truth for "am I in as-of mode".
 *
 * `knowledgeTimeLabel` is the human-readable `knowledge_time` string the caller already holds
 * (e.g. from `frontend/src/app/knowledge-time-bundle.ts`'s `AsOfBundle.knowledgeTime` — NOT
 * imported here, because `charts` never imports from `app`/`web`, `D5.12`); this module only
 * shapes it into the frame, it never formats a date itself.
 *
 * Refuses BOTH wrong directions, mirroring `knowledge-time-bundle.ts`'s own `decodeBundle`
 * discipline (`D5.4`: a mode/label mismatch is exactly the silent-regression class of bug that
 * discipline exists to catch):
 *   - `AO_VIVO` with a non-null label → `AsOfLabelLeakedUnderLiveError` (the frame's own
 *     version of "voltar para AO VIVO tem de apagar knowledge_time, nunca carrega-lo escondido")
 *   - `COMO_EM_T` with no (or blank) label → `MissingKnowledgeTimeLabelError` (an active frame
 *     with nothing for the text channel to say is not "impossível de não notar", it is a bare
 *     colored rectangle — exactly what `D-2`'s redundancy argument forbids)
 */
export function buildAsOfFrame(
  mode: SessionEnvelope["mode"],
  knowledgeTimeLabel: string | null,
): AsOfFrame {
  if (mode === "AO_VIVO") {
    if (knowledgeTimeLabel !== null) {
      throw new AsOfLabelLeakedUnderLiveError(
        `mode is AO_VIVO but knowledgeTimeLabel ("${knowledgeTimeLabel}") is not null — the as-of ` +
          "frame can never survive a return to AO VIVO (mirrors D5.4's returnToLive discipline in " +
          "knowledge-time-bundle.ts: if the label survived, the symptom did not happen)",
      );
    }
    return { active: false };
  }
  if (knowledgeTimeLabel === null || knowledgeTimeLabel.trim() === "") {
    throw new MissingKnowledgeTimeLabelError(
      `mode is COMO_EM_T but knowledgeTimeLabel is ${JSON.stringify(knowledgeTimeLabel)} — an active ` +
        "as-of frame with no text is a bare color rectangle, exactly what ADR-010/D-2's redundancy-" +
        "of-form argument forbids; it is refused, never rendered with an empty label",
    );
  }
  return {
    active: true,
    widthPx: AS_OF_FRAME_WIDTH_PX,
    label: `${AS_OF_FRAME_LABEL_MARKER} · ${knowledgeTimeLabel}`,
  };
}

export class FrameNotNoticeableError extends Error {}
export class FrameLabelMissingMarkerError extends Error {}

/**
 * The falsifier for "impossível de não notar" itself — a frame that PASSES this function is
 * the only kind `buildAsOfFrame` is allowed to produce; `s2-asof-frame.test.ts` proves that by
 * handing this function a deliberately poisoned frame (width equal to the system's own ambient
 * 1px) and asserting it is REJECTED, not just typechecked. An inactive frame trivially passes
 * (there is nothing to notice, and nothing wrong with that).
 */
export function assertFrameIsNoticeable(frame: AsOfFrame): void {
  if (!frame.active) {
    return;
  }
  if (
    !Number.isFinite(frame.widthPx) ||
    frame.widthPx < AMBIENT_BORDER_WIDTH_PX * AS_OF_FRAME_MIN_MULTIPLIER
  ) {
    throw new FrameNotNoticeableError(
      `frame.widthPx (${frame.widthPx}) is not a finite number at least ${AS_OF_FRAME_MIN_MULTIPLIER}x ` +
        `the system's own ambient border (${AMBIENT_BORDER_WIDTH_PX}px, STITCH_CONTEXT.md:225) — ` +
        "NaN/Infinity/undefined all fail a bare '<' comparison by coercion (QA finding, T-08.9 round " +
        "2) and indistinguishable from ordinary chrome (or absent entirely) is exactly what " +
        "'impossível de não notar' forbids",
    );
  }
  if (!frame.label.includes(AS_OF_FRAME_LABEL_MARKER)) {
    throw new FrameLabelMissingMarkerError(
      `frame.label (${JSON.stringify(frame.label)}) does not contain "${AS_OF_FRAME_LABEL_MARKER}" — ` +
        "the text channel is the redundant half of the signal (ADR-010/D-2); a frame that relies on " +
        "width/color alone is refused",
    );
  }
}
