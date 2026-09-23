# QA Gate — Fase `04` [`web`] — candle-real-e-eixo-unico — O OI honesto

Worktree: `/home/stharley/Documentos/projects/cripto-strategy-worktrees/candle-f04`, branch
`wave/candle-f04`, HEAD `78ff707` (working tree limpa, `git diff --stat HEAD` vazio).

Plano: `docs/plans/SPEC-008-candle-real-e-eixo-unico/04_oi_honesto.md` (itens 4.1–4.6, DoD 1–6).
Tasks: `T-04.1..T-04.6` (`CST-228..233`), tasks.toml linhas 566-652, todas ainda `status="todo"`
(aguardando `harness tasks resolve` pós-veredito). Handoffs em
`docs/context/candle-real-e-eixo-unico/handoff/T-04.{1..5}.md`. Gate de design já registrado:
`docs/context/candle-real-e-eixo-unico/gates/T-04.6-ux-ui-mastery.md` — **APPROVED, score 88/100**,
revisão ao vivo contra `/symbol/BTCUSDT` real.

Escopo do diff desta fase (`git diff --stat 10aeac4..78ff707 -- frontend/src frontend/e2e`):
`SymbolClient.tsx` (+72), `[symbol]/page.tsx` (+5), `panel-status.ts` (+30, tipo `OiProvenanceLabel`
novo), `view-model.ts` (+118, `deriveOiProvenanceLabel`/`openInterestAdr036D2Violations`), 3
arquivos de teste unitário (+335) e 1 spec e2e novo (`19-oi-provenance-ablacao-e-ascii.spec.ts`,
+339). **Zero mudança em `backend/src`** — a fase é puramente `web`, então a disciplina de purgar
`__pycache__` (item 6 do DoD) não se aplica a nenhum arquivo tocado aqui.

## Evidência por item do DoD do plano

1. **CA-9 (rótulo soletra grandeza/universo/coorte, lidos do `SeriesKey`)** —
   `frontend/src/app/symbol/view-model.ts:887-898` (`deriveOiProvenanceLabel`) é função pura sobre
   `OiProvenanceKey = Pick<SeriesKey, "unit"|"denom"|"provider"|"venue"|"cohort">`, nunca string
   escrita à mão. `SymbolClient.tsx:1295-1310` só interpola o objeto. Confirmado contra o app real
   no log `/tmp/verify-candle-f04-20260923T121747Z.log:2168+` (`make e2e`, log completo em disco):
   `E2E-FACT 19-oi-provenance-ablacao-e-ascii rendered_oi_provenance_fact="oi_provenance:grandeza=contracts (BTC);universo=binance/usdm_futures;coorte=all"` — bate byte a byte com o esperado
   calculado a partir do catálogo real (`expected_oi_provenance_fact`, mesma linha).

2. **⛔ CA-10 (ablação de derivação)** — `frontend/e2e/19-oi-provenance-ablacao-e-ascii.spec.ts:275-339`,
   stub HTTP sintético de catálogo (`[P-seed]` respeitado, zero escrita em banco). Log:
   `oi_provenance_before_ablation="...contracts (BTC);universo=binance/usdm_futures;coorte=all"` →
   `oi_provenance_after_ablation="...notional (USD);universo=binance/coinm_futures;coorte=stable_margined"`
   — muda sem tocar `SymbolClient.tsx`/`page.tsx`. Também prova o caminho `unresolved` (catálogo
   vazio → `oi_provenance:unresolved`, nunca some). **Mutação própria**: apliquei
   `deriveOiProvenanceLabel` hard-coded no lugar do template interpolado — 3 testes caem
   (`T-04.1/RN-5/CA-9`, `MORDE (T-04.1): hard-coding...`, `CALA: design_gate NEEDS_FIX...`),
   restaurado depois (ver seção "Mutação" abaixo).

3. **Zero chave de máquina não-ASCII, universo completo** — `frontend/src/app/symbol/
   data-fact-ascii-key-contract.test.ts` varre TODAS as 43 expressões `data-fact` do arquivo fonte
   (não só `LiveRow`), floor/ceiling em 43 para não passar varrendo zero. Contra o app real: log
   `data_fact_keys_total=47`, `data_fact_keys_non_ascii=[]`. **Mutação própria**: reverti
   `LiveRow` para `data-fact={\`live_\${label}:...\`}` (o bug original `CST-230`,
   `live_preço:attempted`) — 2 testes caem (`no data-fact expression interpolates label...`,
   `MORDE: reintroducing CST-230's bug...`), restaurado.

4. **Pixel na tela, assert de posição** — `19-oi-provenance-ablacao-e-ascii.spec.ts:147-194`:
   `toBeVisible()`, `boundingBox()` com `width/height > 0`, `x/y` dentro do viewport, e o próprio
   instrumento se falsifica (`display:none` forçado no fim, confirma que a MESMA asserção reprova).
   Log: `oi_provenance_bounding_box={"x":0,"y":747.89,"width":1280,"height":20}`.

5. **Nada de fonte mudou (`ADR-036/D2`)** — `openInterestAdr036D2Violations` (`view-model.ts:939-955`)
   compara `provider/unit/denom/aggregationScope` contra os 4 invariantes fixos; testado em
   `oi-series-selector.test.ts:262-300` (linha limpa hoje + violação nomeada termo a termo sob
   fixture adversarial). Sem regressão.

6. **`make verify` verde** — `/tmp/f04_verify.out`: 8 portões, `rc=0` em todos, HEAD `78ff707`
   idêntico ao commit corrente (`diff sem mudança não-commitada`). `lint-backend rc=0`,
   `lint-frontend rc=0`, `test-frontend rc=0 (853 pass)`, `test rc=0 (2711 passed, cobertura
   96,31%)`, `boundaries rc=0 (7 kept, 0 broken)`, `regras rc=0 (0 bloqueio, 76 aviso — nenhum nos
   arquivos desta fase)`, `política rc=0`, `e2e rc=0 (53 passed, 2 skipped pré-existentes)`.
   `49` (fase 03) `+ 4` (o spec 19 novo) `= 53` — bate.

## Regras bloqueantes (8 listadas por `harness rules list --severity block`)

- [OK] `core.relative-import` — nenhum import relativo introduzido (diff só toca frontend/TS).
- [OK] `core.silent-except` — n/a, sem `except` no diff.
- [OK] `core.print-statement` — n/a, sem Python no diff.
- [OK] `core.hardcoded-secret` — nenhuma credencial no diff.
- [OK] `web-fullstack.browser-imports-server` — `OiProvenanceLabel` foi deliberadamente colocado em
  `panel-status.ts` (dependency-free), não em `view-model.ts` (que puxa `node:crypto` via
  `series-key-id.ts`), exatamente para não violar esta regra na fronteira `"use client"`
  (`panel-status.ts:224-231`, comentário explícito). `regras` do `make verify` confirma `rc=0`.
- [OK] `web-fullstack.tenant-from-request` — n/a.
- [OK] `web-fullstack.server-test-directory-present` — n/a (regra de backend).
- [OK] `own.compose-hardcoded-secret` — n/a, nenhum compose tocado.

Regras bloqueantes avaliadas: 8 de 8.

## Mentalidade destrutiva — mutações aplicadas manualmente (além das que os próprios testes
já auto-mutam)

1. `deriveOiProvenanceLabel` output → string hard-coded no branch resolvido: **3 testes caem**
   (`test:app`, ver acima). Restaurado, `git status` limpo depois.
2. `LiveRow` revertido para `live_${label}` (bug histórico `CST-230`): **2 testes caem**.
   Restaurado.
3. `npx tsc --noEmit`: limpo.
4. `npm run lint` (`eslint src`): limpo.
5. `npm run test:app`: 409/409 (com as duas restaurações confirmadas antes e depois).

Nenhum defeito real encontrado — os builders das 5 tasks (`T-04.1` a `T-04.5`) e o gate de design
(`T-04.6`) já fecharam o padrão desta feature (fase 03 teve `NEEDS_FIX` real; aqui as três camadas
de prova — unit test com auto-mutação embutida, guarda estático de 43 `data-fact`, e e2e contra app
real com ablação e assert de posição — coincidem sem contradição em nenhum ponto verificado).

## Veredito

**APPROVED**

Ação para o orquestrador: `harness tasks resolve candle-real-e-eixo-unico 04 T-04.1=done T-04.2=done
T-04.3=done T-04.4=done T-04.5=done T-04.6=done`, depois `harness tasks validate
candle-real-e-eixo-unico`, depois `harness gate-record candle-real-e-eixo-unico 04 QA APPROVED "..."`.
