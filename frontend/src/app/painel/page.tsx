"use client";

import { useState } from "react";

import { Filter } from "../../features/panel/Filter.tsx";
import { S1Console } from "../../features/s1-console/S1Console.tsx";
import {
  COLLECTOR_ROWS,
  ETL_QUEUE_DEPTH_PENDING,
  RECONNECTION_EVENTS,
  STORAGE_BUDGET_LINES,
} from "../../features/s1-console/fixtures.ts";
import { buildS1ViewModel } from "../../features/s1-console/view-model.ts";
import { S3Inspector } from "../../features/s3-inspector/S3Inspector.tsx";
import { FIXTURE_CATALOG_ROWS, FIXTURE_DIVERGENCES } from "../../features/s3-inspector/fixtures.ts";
import { EMPTY_CATALOG_FILTER, buildS3ViewModel } from "../../features/s3-inspector/view-model.ts";

// The `/painel` route (ADR-018 D2): composes the 3 production `.tsx` that
// already exist, wired to their published fixture + view-model modules.
// No chart (`S2`, `charts/`) is mounted here -- the ESLint boundary in
// D5.12 (`eslint.config.mjs`) forbids `web -> charts` in either direction
// today; opening it is a decision for T-05.2+, not this task.
//
// `openedSeriesId`'s VALUE is deliberately unread: the quarantine drawer
// that would consume it is a screen scope the design_gate has not closed
// yet (`T-06.10-design.md` §6, PENDING) -- only the setter is wired.
export default function PainelPage() {
  const [filterText, setFilterText] = useState("");
  const [, setOpenedSeriesId] = useState<string | null>(null);

  const s1ViewModel = buildS1ViewModel(
    COLLECTOR_ROWS,
    ETL_QUEUE_DEPTH_PENDING,
    STORAGE_BUDGET_LINES,
    RECONNECTION_EVENTS,
  );
  const s3ViewModel = buildS3ViewModel(FIXTURE_CATALOG_ROWS, EMPTY_CATALOG_FILTER, null, [], FIXTURE_DIVERGENCES);

  return (
    <main>
      <Filter />
      <S1Console viewModel={s1ViewModel} />
      <S3Inspector
        viewModel={s3ViewModel}
        filterText={filterText}
        onFilterTextChange={setFilterText}
        onOpenSeries={setOpenedSeriesId}
      />
    </main>
  );
}
