# W6-QA-FRONT-FIX — correção dos dois achados do QA de front da 03b (`paineis-de-fluxo`)

Entrada: `handoff/W6-QA-FRONT.md` (tentativa 1, em `ef2ff95`). Worktree `wave-paineis-f03b`, branch
`wave/paineis-f03b`, código em `e369418`. Portas 8843/4343. Não é veredito de QA; é a correção que o QA
revalida pela mutação.

## 1. `e2e/38:1061` (GATE, DoD-6): era defeito do INSTRUMENTO, não flake de carga

**Sintoma** (`/tmp/verify-wave-paineis-f03b-20260927T212934Z.log:2797`): `auditView: the candles do not map
to ONE bucket shift of the grid (1,0)`. O QA atribuiu à carga das mutações rodando junto. A carga só mudou
qual ruído venceu; a causa é outra.

**Causa `[MEDIDO 2026-09-27]`.** O passo 2 de `auditView` escolhe a fase da vela pelo argmax da tinta de
vela (up+down+doji) sob `grade + δ`. Na página de vela a varredura tem pico nítido. Na ablação
(`?e2eOiLine=1`) não há vela e a varredura é plana, só antisserrilhado da linha. O argmax passa a ser ruído.
Medido com diagnóstico temporário (revertido) em `38-oi-candle -g GATE --repeat-each=3` (6 passed, 10,1 min),
fatos em `scratchpad/diag-facts.jsonl`:

| página | vista (b) | tinta por δ, de −half a +half | argmax nas 3 execuções |
|---|---|---|---|
| vela | capture (10,13) | `3209 3318 2048 109 0 0 0 0 0 869 3196` | −4 / −4 / −4 |
| vela | hole (13,89) | `6697 4093 993 0 … 0 281 3203 5673` | −6 / −6 / −6 |
| ablação | capture (10,13) | `184 291 350 392 299 268 261 283 275 235 187` | −2 / −2 / −2 |
| ablação | hole (13,89) | `119 147 169 168 166 160 160 166 172 160 153 133 119` | −3 / −5 / **+2** |

Com δ perto de `+b/4`, a sonda do quarto direito (`candleX + b/4`) cai na fronteira de meia barra da
legenda, e sondas diferentes nomeiam `k` e `k+1`: é o `(1,0)`. Já antes do conserto, o `leftQuarter` da
ablação saía misto (`self 7 / previous 1`), contra `previous 8` na vela. Isso mostra que a ablação lia
colunas fora de onde a vela estaria.

**Conserto** (`frontend/e2e/38-oi-candle-acceptance-per-bucket.spec.ts`):
- `candlePhaseOf(scan)`: devolve o argmax só quando algum passo cai a ≤ 10% do pico (`PHASE_SCAN_FLOOR_RATIO`).
  Se a varredura for plana, devolve `null` e `auditView` lança "the phase scan is flat". O instrumento não
  nomeia colunas por uma fase de ruído.
- `ablation()`: antes da página com `?e2eOiLine=1`, abre a página de vela, mede a fase na 1ª vista e passa a
  fração `δ/b` a `auditViews(…, phaseFraction)`. A fase é da escala de tempo e da legenda, não da série
  desenhada. Custo: um `auditView` a mais por teste de ablação (GATE e REAL).

**Teste que reprova sem o conserto:** `T-03.13: o instrumento — a fase da vela` (sem browser), com as
varreduras gravadas acima.
- limpo: `playwright test 38-oi-candle -g instrumento` → **1 passed**
- mutante que devolve o comportamento antigo (`return best.ink > 0 ? best.delta : null`, argmax sem piso) →
  **1 failed**, `Error: the line: flat · Received: -2`

**Depois do conserto:** `38-oi-candle -g "GATE|instrumento" --repeat-each=3` → **9 passed (12,3 min)**. Fatos
em `scratchpad/fix-facts.jsonl`:
- nas 3 execuções, a fase da ablação ficou em −6 na vista hole e −4 na capture, a mesma da página de vela;
- `leftQuarter` ficou em `previous 8` nas duas vistas, igual ao da vela;
- `verdict_gate_px_ablation`: 177 julgados, 0 defeito, `line_ink` entre 3653 e 3725;
- `gate_ablation_colour_defects`: 175 ou 176, então o juiz de cor continua REJEITANDO a linha.

## 2. Mutante U2 (borda inclusiva de `trimOiCandlesToWindow`) sobreviveu: lacuna de teste fechada

Novo teste em `frontend/src/app/symbol/oi-candle-pane.test.ts`: com janela
`[UP.bucket_end_ms, DOWN.bucket_end_ms)`, UP fica e DOWN sai. Com `startMs + 1`, UP sai. O código de
produção não mudou, porque a regra já estava certa e faltava o teste.
- limpo: `node --conditions=react-server --test src/app/symbol/oi-candle-pane.test.ts` → **15 pass / 0 fail**
- U2 (`>= window.startMs` → `> window.startMs`, aplicado com `sed` e revertido com `git checkout`) → **14 pass /
  1 fail** (o teste novo). No lote do QA era 0 fail.

## 3. Portões

- `eslint` nos 2 arquivos → rc=0. `tsc --noEmit -p frontend` → rc=0.
- `make verify`: ver §4.

## 4. `make verify`

`find backend -name __pycache__ -prune -exec rm -rf {} +; VERIFY_FORCE=1 E2E_API_PORT=8843 E2E_NEXT_PORT=4343 make verify`
em `e369418`, sem nada rodando junto → **VERDE, 8 portões** (log `/tmp/verify-wave-paineis-f03b-20260927T224246Z.log`):
- test-frontend: 1208 pass / 0 fail (era 1207; +1 do teste da borda)
- test: 3315 passed, cobertura 96,42%
- regras: 0 bloqueio (77 avisos)
- e2e: **96 passed / 0 failed / 7 skipped** (9,5 min). `e2e/38:1137` DoD-6 GATE ✓ e `e2e/38:1102` (o instrumento) ✓.

**Não medido `[NÃO MEDIDO]`:** o REAL de `e2e/38` (DoD-6 REAL, `:1162`) fica em skip no verify, porque exige
`E2E_OI_REAL_API_BASE_URL`. A mudança da ablação também vale para ele, e fica para a rodada REAL do QA
(`handoff/W6-QA-FRONT.md`, "Falta" item 2). Os lotes restantes do QA (U8..U15, E1..E5, A/B de latência) não
foram rodados aqui: são do QA.
