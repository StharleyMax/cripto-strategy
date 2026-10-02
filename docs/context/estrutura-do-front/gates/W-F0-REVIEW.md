# Review da fase 00 — `estrutura-do-front` (wave `estrutura-f00`)

**Auditor:** `harness-plugin:reviewer` (read-only), 2026-10-02, sobre `843ac8f`. Gravado em arquivo pelo orquestrador.
**Veredito: COMPLIANT** — 8/8 regras `block`, 0 achados bloqueantes em 10 arquivos; 1 WARNING.

## Denominador

- `harness rules list --severity block` → 8 regras; `harness rules --mode file --path <f>` nos 10 arquivos → 0 achados, rc=0; `--mode sweep` sem linha nos 10 `[MEDIDO]`.
- `npx eslint` nos 10 → rc=0; `node --test` nos 5 testes novos/alterados → 24 pass / 0 fail `[MEDIDO]`.
- Contra ADR-050 D1–D7 + E-1..E-4, ADR-034/D8, SPEC-011 §3–§5.5, `00_trilhos.md`.

## `[WARNING]` W-1 — P1 alcança arquivo-raiz de `indicators/`

`frontend/eslint-rules/indicator-isolation.mjs:96-108` (`classify`, retorno final `{ layer: "indicator", kind: child }`): qualquer
**arquivo** solto em `indicators/` (fora `contract.ts`/`catalog.ts`) vira "indicador". `SPEC-011 §5.3` define pasta de indicador como
**subdiretório** de `indicators/` menos `selection/`.

Prova `[MEDIDO pelo reviewer e reproduzida pelo orquestrador]`:
`printf 'import { X } from "./catalog.ts";' | npx eslint --stdin --stdin-filename src/app/symbol/indicators/catalog.test.ts` →
`P1: indicator 'catalog.test' may not import symbol/indicators/catalog.ts`, rc=1.

Efeito: hoje não dispara; dispara no primeiro teste de catálogo na raiz (F2/F9). Conserto: `layer: "indicator"` só com
`segments.length > 2`; arquivo-raiz vira camada própria sujeita a P2/P3; sonda nova `indicators/catalog.test.ts → ./catalog.ts` CALA.

## Pontos pedidos — OK

- `eslint.config.mjs` só adições: `git diff --numstat` = `48 0`; nenhum `no-restricted-imports` tocado.
- Barrel `ADR-034/D8` morde por stdin em `indicators/cvd/probe.ts`, `probe.test.ts`, `SymbolClient2.tsx`; `src/charts → app/` ainda reprova.
- Núcleo não importa `indicators/` (direção `indicators → chart`). E-4: contrato não enumera `kind`. E-1: `refeed` no registrar.
- Varredores só alargaram (mesmo filtro, `readdirSync` recursivo ⊇ universo antigo); `data-fact` continua 47.
- Fronteira com `wave/paineis-f05`: `grep -xFf` sem sobreposição (rc=1); a wave tem hoje 55 arquivos de `frontend/` (INFO).
- Idioma: inglês; `MORDE`/`CALA` são jargão preexistente.
