# Ponteiro — decisão de arquitetura sobre navegação fluida (troca de símbolo/TF sem round-trip RSC)

**Corpo completo:** [`docs/adr/ADR-043-navegacao-fluida-client-driven-symbol-e-tf-sem-round-trip-rsc.md`](../../../adr/ADR-043-navegacao-fluida-client-driven-symbol-e-tf-sem-round-trip-rsc.md)

**Veredito, em uma linha:** client-driven é o caminho certo para este app Next 16, mas em DUAS
PERNAS — symbol switcher nasce client-driven (não existe hoje, zero passivo), TF bar migra DEPOIS
em task própria (T-03.9/10/11 ficam ~87% intactos, só ~216 de 1.665 linhas de transporte/wiring
morrem). Não é DoD de `fase 04` desta feature — recomendo feature própria, por amendar
`ADR-005/D5` e `ADR-019/D4`, ter dependência de CORS fora de `web`, e precisar de `design_gate`
para UI nova (seletor de símbolo).

**Despachado por:** investigação read-only sobre `page.tsx`, `SymbolClient.tsx`, `series-history-client.ts`,
`series-catalog-query.ts`, `view-model.ts`, `ADR-005`, `ADR-019`, diffs de `T-03.9`/`T-03.10`/`T-03.11`.
