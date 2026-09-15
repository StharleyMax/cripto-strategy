/**
 * `T-01.7` — the DOM CONTRACT of the volume sub-axis, guarded.
 *
 * WHY THIS FILE EXISTS (achado do QA de `T-01.7`): `view-model.test.ts` proves `RN-1` on the
 * DATA side — a mutation planting `value: 0` on absence turns 4 of its tests red. It proves
 * NOTHING about the RENDERING side, and the rendering side is where `T-01.7`'s own extra
 * deliverable lives. Measured, not assumed: with the suite at 136/136 green, each of the three
 * mutations below passed unnoticed —
 *
 *   - renaming `VOLUME_SUBAXIS_TESTID`            -> 136 pass / 0 fail
 *   - `ABSENCE_TOKEN = "SEM_PONTO"` becoming `"0"` -> 136 pass / 0 fail
 *   - deleting `data-volume-present-points`        -> 136 pass / 0 fail
 *
 * The second one IS the defect `RN-1` names, reachable by a one-token edit: a `FLOW` absence
 * printed as `0` on screen ("LOCF over it is a type error, never UX"). The other two silently
 * break `T-01.9`'s selector, which is the very thing that makes `T-01.8` (form) and `T-01.9`
 * (data) parallelizable.
 *
 * WHY A SOURCE SCAN AND NOT A RENDER: this repo has no component renderer in any suite
 * (`@testing-library` is not installed; no `*.test.ts` mounts a `.tsx`), and `SymbolClient.tsx`
 * imports `lightweight-charts`, which wants a DOM. The source scan is the technique this repo
 * already uses for exactly this class of claim — `universe-at.test.ts`'s "structural
 * falsifier", with its own MORDE companion, in this same suite. It is a weaker instrument than
 * a render and says so: it proves the literal is SPELLED where the contract requires, not that
 * a browser painted it. The browser half is `T-01.9`'s e2e, by design.
 *
 * Path resolved from `fileURLToPath`, never from `cwd` — same discipline as `universe-at.test.ts`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SYMBOL_CLIENT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "SymbolClient.tsx");
const source = readFileSync(SYMBOL_CLIENT_PATH, "utf8");

/** The selector `T-01.9` will `page.locator()` by. Duplicated here ON PURPOSE: a contract with
 * another task is not guarded by importing the constant it is made of — that would rename
 * itself along with the mutation it is supposed to catch. */
const EXPECTED_TESTID = "price-pane-volume-subaxis";
const EXPECTED_PRESENT_POINTS_ATTR = "data-volume-present-points";
/** `RN-1`'s literal token. `DoD-3` asserts its ABSENCE from the screen when data is present, so
 * the string is as load-bearing as the testid. */
const EXPECTED_ABSENCE_TOKEN = "SEM_PONTO";

const TESTID_DECLARATION = /const VOLUME_SUBAXIS_TESTID = "([^"]*)";/;
const ABSENCE_TOKEN_DECLARATION = /const ABSENCE_TOKEN = "([^"]*)";/;

test("T-01.9 contract: the volume sub-axis carries the STABLE testid, spelled exactly", () => {
  const declaration = TESTID_DECLARATION.exec(source);
  assert.ok(declaration !== null, "VOLUME_SUBAXIS_TESTID declaration not found — the anchor moved, fix this test");
  assert.equal(
    declaration[1],
    EXPECTED_TESTID,
    "the testid T-01.9 selects by changed; renaming it silently breaks the e2e's only handle",
  );
  // Declared is not rendered: the constant must actually reach a `data-testid` attribute.
  assert.match(source, /data-testid=\{VOLUME_SUBAXIS_TESTID\}/);
});

test("T-01.9 contract: the present-point count is a bare integer attribute on that same element", () => {
  assert.match(
    source,
    new RegExp(`${EXPECTED_PRESENT_POINTS_ATTR}=\\{volume\\.presentPoints\\}`),
    "the attribute DoD-3/RN-S2 read N >= 30 from must be rendered, and must carry the raw count",
  );
  // Same element as the testid, not a sibling — otherwise the e2e's `getAttribute` finds nothing.
  const subAxisElement = /data-testid=\{VOLUME_SUBAXIS_TESTID\}\s*\n\s*data-volume-present-points=\{volume\.presentPoints\}/;
  assert.match(source, subAxisElement, "testid and present-point count must sit on the SAME element");
});

test("RN-1 at the RENDERING layer: absence prints SEM_PONTO, and the token is never a number", () => {
  const declaration = ABSENCE_TOKEN_DECLARATION.exec(source);
  assert.ok(declaration !== null, "ABSENCE_TOKEN declaration not found — the anchor moved, fix this test");
  assert.equal(declaration[1], EXPECTED_ABSENCE_TOKEN, "absence is SEM_PONTO — for a FLOW series a number here is an error of TYPE");
  assert.ok(
    !/^-?\d+(\.\d+)?$/.test(declaration[1]!),
    "the absence token must not be a number in any shape — 0, 0.0 and -0 are all the RN-1 defect",
  );
  // The token has to be what the readout actually falls back to, not a dead constant.
  assert.match(
    source,
    /volume\.reading\.kind === "absent" \|\| volume\.reading\.value === null \? ABSENCE_TOKEN :/,
    "the absent branch of the volume readout must resolve to ABSENCE_TOKEN",
  );
});

// ── C4: the readable horizon is DECLARED on screen, not left to look like a dead market ──────
//
// `[MEDIDO 2026-09-11, ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md]`: only `769/5.761` grades of the
// derived window carry a value, and the first sits at index `4.971` — the leftmost 86% of the
// chart is structurally empty because `R-1` correctly refuses backfilled rows at their own grid
// instant. That absence is REAL, so the chart does not lie; but "sabíamos nada ainda" and "o
// mercado não teve dado" look identical to an operator, and telling two kinds of absence apart
// is what `RN-1` is for. So the number is printed (`quant-architect`, wave `03`, C4).

test("C4: the screen declares the readable horizon — first readable instant AND how many grades", () => {
  assert.match(
    source,
    /data-fact=\{`volume_readable_horizon:\$\{volume\.presentPoints\}\/\$\{gridSlots\}`\}/,
    "the horizon fact must carry BOTH numbers — a bare count cannot say 769 OF WHAT",
  );
  assert.match(
    source,
    /data-readable-since-ms=\{volume\.firstPresentMs \?\? ""\}/,
    "the first readable instant must reach the DOM as a machine-readable attribute",
  );
  // `null` is absence of a horizon and must READ as absence, never as the epoch (`0`).
  assert.match(
    source,
    /volume\.firstPresentMs === null\s*\n?\s*\? "Nenhuma grade legível no período"/,
    "no readable grade must print a sentence, not a date derived from 0",
  );
  // ⛔ AND THE SPAN IS NOT SHRUNK TO FIT: C4 item 2. The window is `PRD-006 §2`/item `5.1`'s, and
  // a chart that narrows itself to hide its own hole is worse than one that names the hole. The
  // client never names the span at all — it draws the window it was handed.
  assert.ok(
    !source.includes("S2_WINDOW_SPAN_MS"),
    "the rendering layer must not reach for the span — re-cutting it around the data hides the gap",
  );
  // And the denominator is the slot array it was handed, whole — not a re-sliced sub-range.
  assert.match(source, /const gridSlots = volume\.slots\.length;/);
});

test("C4: the request this render was built from is on the root element, so the screen is auditable", () => {
  // What makes `e2e/08` able to cross-check the DOM against `/series-history` over EXACTLY the
  // window the server used — instead of re-deriving it from the spec's own clock, which races,
  // or seeding Postgres, which `[P-seed]` forbids.
  for (const attribute of [
    /data-window-start-ms=\{panels\.window\.startMs\}/,
    /data-window-end-ms-inclusive=\{lastInstantMs\(panels\)\}/,
    /data-knowledge-time-ms=\{knowledgeTimeMs\}/,
  ]) {
    assert.match(source, attribute, `the root element must declare ${attribute}`);
  }
});

// ── MORDE: the three mutations that were GREEN before this file existed ──────────────────────

test("MORDE: each of the 3 DOM-contract mutations that used to pass green is now caught", () => {
  const mutants: readonly { readonly name: string; readonly mutate: (s: string) => string }[] = [
    { name: "testid renamed", mutate: (s) => s.replace(TESTID_DECLARATION, 'const VOLUME_SUBAXIS_TESTID = "renamed";') },
    { name: "absence rendered as 0", mutate: (s) => s.replace(ABSENCE_TOKEN_DECLARATION, 'const ABSENCE_TOKEN = "0";') },
    { name: "present-point attribute deleted", mutate: (s) => s.replace(/\s*data-volume-present-points=\{volume\.presentPoints\}/, "") },
  ];
  for (const mutant of mutants) {
    const mutated = mutant.mutate(source);
    assert.notEqual(mutated, source, `the mutation "${mutant.name}" found no anchor — update this test, do not delete it`);
    const survives =
      TESTID_DECLARATION.exec(mutated)?.[1] === EXPECTED_TESTID &&
      ABSENCE_TOKEN_DECLARATION.exec(mutated)?.[1] === EXPECTED_ABSENCE_TOKEN &&
      mutated.includes(`${EXPECTED_PRESENT_POINTS_ATTR}={volume.presentPoints}`);
    assert.ok(!survives, `the mutation "${mutant.name}" is NOT detected by the asserts above — the guard is vacuous`);
  }
});

// ── `T-01.8`: os dois `BLOCKER` do `design_gate`, guardados do lado do FONTE ─────────────────
//
// ⚠️ ESTA É A METADE FRACA, E ELA DIZ ISSO. O que prova a ALTURA EM PIXEL é
// `volume-subaxis-geometry.test.ts`, que mede contra a `lightweight-charts` real; o que estes
// asserts provam é que a FIAÇÃO está escrita — que a série de barras não voltou ao mapeamento
// que desenha zero como barra, que as duas marcas existem e que a escala é declarada na tela.
// As duas metades são necessárias: a geometria não vê um `setData` que deixou de ser chamado no
// componente, e o scan não vê um pixel.

const VOLUME_SETDATA = /volumeSeries\.setData\(positiveValueSeriesLossless\(volume\.slots\) as never\);/;
const LOG_MODE = /mode: PriceScaleMode\.Logarithmic,/;
const ABSENCE_SETDATA = /absenceSeries\.setData\(absenceMarkSeries\(volume\.slots, ABSENCE_MARK_PX\) as never\);/;
const ZERO_SETDATA = /zeroSeries\.setData\(zeroMarkSeries\(volume\.slots, ZERO_MARK_PX\) as never\);/;
const ABSENCE_ROLE = /const ABSENCE_MARK_COLOR_ROLE = "(\w+)" as const;/;
const ZERO_ROLE = /const ZERO_MARK_COLOR_ROLE = "(\w+)" as const;/;

test("BLOCKER-1: a série de barras usa o mapeamento que uma escala log consegue posicionar", () => {
  assert.match(
    source,
    VOLUME_SETDATA,
    "o sub-eixo voltou a `lineSeriesLossless`, que entrega `0` como barra de altura zero — " +
      "`log10(0)` não tem coordenada e a barra de altura zero É a marca da ausência",
  );
  assert.match(source, LOG_MODE, "a escala do sub-eixo não declara `PriceScaleMode.Logarithmic` — BLOCKER-1");
  // E o rótulo que o laudo exige JUNTO com a escala: um eixo log não rotulado é pior que um
  // linear ilegível, porque convida a ler o dobro de altura como o dobro de volume.
  assert.match(source, /data-fact="volume_scale:log10"/, "a escala tem de ser DECLARADA na tela, não só aplicada");
  assert.match(source, /escala log10/, "o rótulo visível tem de dizer a escala em palavras");
});

test("BLOCKER-2: ausência e zero legítimo são DUAS séries, com marcas e tintas distintas", () => {
  assert.match(source, ABSENCE_SETDATA, "não há série de marca de ausência — `WhitespaceItem` não desenha nada");
  assert.match(source, ZERO_SETDATA, "não há série de marca para o zero legítimo do fornecedor");
  const absenceRole = ABSENCE_ROLE.exec(source)?.[1];
  const zeroRole = ZERO_ROLE.exec(source)?.[1];
  assert.ok(absenceRole !== undefined && zeroRole !== undefined, "os papéis de tinta das marcas sumiram do fonte");
  assert.notEqual(
    absenceRole,
    zeroRole,
    "as duas marcas partilham a MESMA tinta — 'não houve liquidação' e 'não sabemos' voltariam a ser " +
      "a mesma afirmação (STITCH_CONTEXT.md:1821-1825)",
  );
  // ⛔ `ADR-010`: a distinção é de LUMINÂNCIA, hue zero. Nem direção de preço (verde/vermelho, que
  // é `fill` e volume não tem direção) nem integridade de dado (`dataBrokenInk` — uma lacuna de
  // grade é OPERACIONAL, não dado quebrado).
  for (const role of [absenceRole!, zeroRole!]) {
    assert.match(role, /^provenance(Strong|Weak)$/, `a marca usa o papel ${role}, fora da rampa de procedência`);
  }
  // E a legenda, que é o terceiro canal — dentro do `<canvas>` nenhuma legenda alcança.
  assert.match(source, /data-fact="volume_marks_legend:2"/);
});

test("MORDE: cada uma das 4 regressões dos dois BLOCKER é pega por um assert acima", () => {
  const mutants: readonly { readonly name: string; readonly mutate: (s: string) => string }[] = [
    {
      name: "volta ao lineSeriesLossless (zero vira barra de altura zero)",
      mutate: (s) => s.replace(VOLUME_SETDATA, "volumeSeries.setData(lineSeriesLossless(volume.slots) as never);"),
    },
    { name: "escala volta ao linear", mutate: (s) => s.replace(LOG_MODE, "") },
    { name: "a marca de ausência some", mutate: (s) => s.replace(ABSENCE_SETDATA, "") },
    {
      name: "as duas marcas passam a usar a MESMA tinta",
      mutate: (s) => s.replace(ZERO_ROLE, 'const ZERO_MARK_COLOR_ROLE = "provenanceWeak" as const;'),
    },
  ];
  for (const mutant of mutants) {
    const mutated = mutant.mutate(source);
    assert.notEqual(mutated, source, `a mutação "${mutant.name}" não achou âncora — atualize este teste, não o apague`);
    const survives =
      VOLUME_SETDATA.test(mutated) &&
      LOG_MODE.test(mutated) &&
      ABSENCE_SETDATA.test(mutated) &&
      ZERO_SETDATA.test(mutated) &&
      ABSENCE_ROLE.exec(mutated)?.[1] !== ZERO_ROLE.exec(mutated)?.[1];
    assert.ok(!survives, `a mutação "${mutant.name}" NÃO é detectada pelos asserts acima — a guarda é vazia`);
  }
});

// ── CALA: form is `T-01.8`'s to change, and changing it must not touch any assert above ──────

test("CALA: a design_gate NEEDS_FIX about colour, height or scale leaves the contract intact", () => {
  // Exactly the kind of edit `T-01.8` is allowed to make without coordinating with `T-01.9`.
  const restyled = source
    .replace(/const VOLUME_SCALE_MARGINS = \{ top: 0\.8, bottom: 0 \} as const;/, "const VOLUME_SCALE_MARGINS = { top: 0.55, bottom: 0.05 } as const;")
    .replace(/color: colorTokens\(\)\.provenanceWeak,/, "color: colorTokens().provenanceStrong,");
  assert.notEqual(restyled, source, "the form constants moved — re-anchor this CALA rather than dropping it");
  assert.equal(TESTID_DECLARATION.exec(restyled)?.[1], EXPECTED_TESTID);
  assert.equal(ABSENCE_TOKEN_DECLARATION.exec(restyled)?.[1], EXPECTED_ABSENCE_TOKEN);
  assert.ok(restyled.includes(`${EXPECTED_PRESENT_POINTS_ATTR}={volume.presentPoints}`));
  assert.match(restyled, /data-testid=\{VOLUME_SUBAXIS_TESTID\}/);
});

// ── The layer boundary this component must not cross (`web-fullstack.browser-imports-server`) ─

test("SymbolClient.tsx imports nothing server-side — no node: builtin, no view-model.ts", () => {
  const importedFrom = [...source.matchAll(/^import[\s\S]*?from "([^"]+)";$/gm)].map((match) => match[1]!);
  assert.ok(importedFrom.length > 0, "no imports parsed — the scan is vacuous, fix the pattern");
  for (const specifier of importedFrom) {
    assert.ok(!specifier.startsWith("node:"), `client component imports the Node builtin ${specifier}`);
    // `view-model.ts` pulls `node:crypto` (computeSeriesKeyId); importing it from a client
    // component is the BLOQUEIO `web-fullstack.browser-imports-server` names.
    assert.ok(!specifier.includes("view-model"), `client component imports the server-side ${specifier}`);
  }
});
