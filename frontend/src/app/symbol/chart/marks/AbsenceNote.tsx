import type { PanelStatus } from "../../panel-status.ts";

const ABSENCE_REASON_LABEL: Record<Exclude<PanelStatus, { kind: "ok" }>["reason"], string> = {
  not_in_catalog: "sem série cadastrada no catálogo",
  // `T-03.5`: the catalog answered with MORE THAN ONE candidate and the route refuses to choose
  // by position. Said on screen because the alternative — drawing whichever row came first — is
  // the defect that put this panel on an empty series for a whole phase.
  ambiguous_in_catalog: "o catálogo tem mais de uma série candidata e a escolha seria por posição",
  missing_base_url: "configuração de API ausente",
  connection_refused: "API de leitura inacessível",
  non_2xx: "API respondeu com erro",
  malformed_envelope: "resposta em formato inválido",
};

export function AbsenceNote({ status }: { readonly status: PanelStatus }) {
  if (status.kind === "ok") {
    return null;
  }
  return (
    // ⛔ NO `role="status"`, and the removal is `T-05.10`'s `m-5` finding. A live region
    // (`aria-live="polite"`) announces CHANGE; this note exists at the first paint (`status` comes
    // from the server, per request) and never mutates on the client. A live region already present
    // at load time is NOT announced by a screen reader ⇒ the role bought nothing and left a spurious
    // live region competing with the ones that do change. The text stays reachable: it is a `<p>` in
    // the flow.
    <p data-fact={`panel_absent:${status.reason}`} className="text-sm text-provenance-weak">
      Sem dado real neste painel — {ABSENCE_REASON_LABEL[status.reason]}. Nenhum número é mostrado no lugar
      (nunca um zero fabricado).
    </p>
  );
}

/** `RN-1`'s literal token: absence is `SEM_PONTO`, and for a `FLOW` series rendering it as `0`
 * is an error of TYPE, not of taste. `DoD-3` asserts this exact string's ABSENCE from the CVD
 * pane once data is present, so it is as load-bearing as a testid.
 *
 * ⚠️ `T-02.5` MADE THE CVD READOUT USE IT TOO, and the previous version of this comment said the
 * opposite ("`formatFlowValue`'s `—` is the CVD readout's own wording and is deliberately NOT
 * reused here"). Why it changed: `formatFlowValue` (`D5.3`) is the CROSSHAIR wording and stays
 * exactly as it is inside `charts` — but on THIS screen it made CVD the only one of four
 * readouts spelling absence differently from the other three (Preço, OI and o sub-eixo de Volume
 * all print `SEM_PONTO`), and `DoD-3`'s "não diz `SEM_PONTO`" is unfalsifiable against a pane
 * that could never say it: a test that passes whether or not the data arrived proves nothing.
 * One token, four readouts, one thing for an operator to learn. ⛔ FORM SUBMITTED TO THE
 * `design_gate`, not decided here — `CLAUDE.md` §"Design — autonomia delegada, com gate de
 * validação"; what a builder decides is that absence is DISTINGUISHABLE and machine-readable.
 *
 * ⚠️ `T-01.R1` (`SF-9` of `gates/W1-DESIGN-REVIEW.md` §3, still open in r3 §4): THE TOKEN IS NOW
 * THE pt-BR WORD, NOT THE ENUM. Since `T-01.7` every readout using it lives in `PaneDetails`
 * (`sr-only`), so the ONLY audience of this string is a screen reader — and it heard
 * "Leitura atual: SEM_PONTO" while a sighted operator read `ausente` in the legend (`MF-3` of the
 * r1, moved to another channel). One word on both channels: this literal must equal
 * `ABSENCE_MICROCOPY[LEGEND_GRID_ABSENCE]`, which `absence-readout-microcopy.test.ts` pins (it is
 * spelled out rather than derived because five `*-dom-contract.test.ts` mutate this exact
 * declaration). The machine half is unchanged: every readout's `data-fact` still ends in
 * `:absent`, and the legend keeps the enum in `data-legend-absence`. It is still never a number. */
export const ABSENCE_TOKEN = "ausente";

/** `YYYY-MM-DD HH:MM UTC`, built off the epoch instant with no locale in the path: this string
 * is a FACT about the data (which instant), not a presentation choice, and a locale-dependent
 * rendering of it would make the same screen say different things to different readers. */
export function formatUtcMinute(instantMs: number): string {
  return `${new Date(instantMs).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
