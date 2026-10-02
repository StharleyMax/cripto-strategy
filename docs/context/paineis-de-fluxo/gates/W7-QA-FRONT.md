# W7 — QA de FRONT da wave (fase `05` de `paineis-de-fluxo`: `T-05.1`, `T-05.4`, `T-05.1-R1`)

`frontend-qa`, 2026-10-02. Worktree `.claude/worktrees/wave-paineis-f05`, código medido em **`acce0b3`**. Depois dele
entrou só `41b51a7` (W7-DESIGN-REVIEW: 1 `.md` + 13 PNG, `git diff --stat acce0b3..HEAD`, sem código).
Norma: `plans/SPEC-009-paineis-de-fluxo/05_correcoes_de_uso.md` (DoD 1, 4, 5), `handoff/T-05.1-desenho.md`,
`handoff/T-05.1-revisao-ab29321.md`, `handoff/T-05.4-desenho.md` §6 e §10, `gates/T-05.1-build.md`,
`gates/T-05.4-build.md`, `gates/T-05.1-R1-build.md`.

`S` = scratchpad da sessão (`/tmp/claude-1002/…/scratchpad/qa`). É efêmero, por isso os números estão copiados aqui.
O 1º `make verify` desta sessão foi morto pelo teto de 20 min do `Bash` em background. O 2º morreu no reinício da
máquina. O que vale é o 3º, abaixo.

## QA Gate (Front) — Fase 05: correções de uso

- [OK] **DoD 1 (eixo por TF)**: `e2e/39` contra o app real (build da worktree em `:3147`, API `:8000`/Postgres), 6/6 + o
  arrasto e o zoom-in de 4h. Por TF, `grid_slots`, `drawn_fraction` e `bar_spacing_px`:
  1m `5760, 0,9903, 9,93` · 5m `1152, 0,9913, 9,93` · 15m `384, 0,9974, 9,92` · 1h `168, 1, 9,92` · 4h `42, 1, 27,91`.
  Montagem de 4h: `0` pedidos. Zoom-in de 4h: `0` pedidos `[MEDIDO: S/abl-BASE.log]`.
- [OK] **DoD 4 (aviso)**: `e2e/40` contra o app real e o stub, **20 passed** junto com 39 e 14 no braço base. A
  sonda P5 (abaixo) cruza ledger × chip × texto nos 5 TFs.
- [OK] **DoD 5**: `make verify` VERDE (ver a seção do `make verify`).
- [OK] Lógica fora do componente: `coverage-magnitude.ts`, `timeframe-window.ts` e `long-short-band.ts` são puros.
  O `PartialCoverageMark` só renderiza.
- [OK] Contrato na borda: `series-history-envelope.ts` valida `coverage` como inteiros. Lacuna em **W-2**.
- [OK] Sem segredo no cliente. O portão `regras` deu 0 bloqueios e 77 avisos.
- [OK] Acessibilidade: as duas formas do chip são `aria-hidden` e a frase falada é o `sr-only`. O ledger publica a cabeça
  mesmo quando não há chip.
- [OK] Testes existem, passam e têm o par morde/cala. Mutações: **21, das quais 20 reprovaram**. U1 sobrevive (equivalente) e U4 sobrevivia até ganhar teste; os dois estão
  explicados abaixo, e 1 deles ganhou teste.
- [OK] Cobertura: test-frontend **1263 pass / 0 fail** nas 4 suítes, e o backend **96,90%**. A cobertura de linha do
  front não é medida por portão nenhum `[NÃO MEDIDO]`.
- [OK] `harness rules`: o portão `regras` do verify deu `rc=0`, 0 bloqueios. O `--changed-only` solto devolveu `rc=0`
  com saída vazia, que é ambíguo, e por isso não é citado como prova.
- [OK] `make verify` verde.
- [OK] Doc delta: `frontend/README.md` §24/§25 e `docs/INDEX.md` só com linhas **acrescentadas**
  (`git diff master...HEAD -- docs/INDEX.md` → só `+`). Ressalva em W-3.
- [OK] Rótulos: os números dos três relatórios de build trazem comando e universo.

## make verify — portão da wave

`E2E_API_PORT=8871 E2E_NEXT_PORT=4371 VERIFY_FORCE=1 make verify`, `__pycache__` purgado (0 diretórios), árvore
`acce0b3` + o teste novo deste QA. Log: `/tmp/verify-wave-paineis-f05-20261002T212428Z.log` `[MEDIDO]`:

```
lint-backend OK 495 · lint-frontend OK (ESLint + tsc --strict) · test-frontend OK 1263/0 · test OK 3476 passed, 96.90%
boundaries OK 7/0 · regras OK 0 bloqueios, 77 avisos · política OK · e2e OK 108 passed, 14 skipped (10,7 min)
veredito: VERDE — 8 portões
```

**Este é o 1º e2e medido sobre `T-05.1-R1`**: o build daquela task ficou "NÃO MEDIDO" por colisão de porta. O `e2e/20`
**não** estourou: `axis_intra_gesture_interval_max_ms = 127,4` contra o teto de 160, p95 50,9, e
`history_page_latency_p95_ms = 111,6`. Por isso não houve rodada isolada 3×.

## Mutações e ablações — 21, das quais 20 reprovaram (13 unitárias + 8 e2e)

**Unitárias** (cópia isolada de `frontend/src`, `node --test`, script `S/umut.sh`):

| id | task | mutação | resultado |
|---|---|---|---|
| U1 | 05.1 | `isLeftOfMountView`: `<=` → `<` | **sobrevive**: equivalente, só difere na igualdade exata em meia barra (medida zero) |
| U2 | 05.1 | trava de meia barra → barra inteira | reprova 1 (`-0,6 bar`) |
| U5 | 05.1 | piso de `historyRequest` arredondado para baixo | reprova 3 |
| U6 | 05.1 | TF desconhecido cai no `1m` em vez de lançar | reprova 1 |
| U7 | 05.1 | `mountViewRange` = eixo inteiro | reprova 1 |
| U3 | 05.4 | cabeça `>` → `>=` | reprova 1 (o caso de fronteira) |
| U4 | 05.4 | sem `Math.max(0, …)` em `summarizeCoverageMagnitude` | **sobrevivia** → ganhou teste (W-2) → reprova 1 |
| U8 | 05.4 | forma compacta não nula com `missing = 0` | reprova 1 |
| U9 | 05.4 | aviso com `missingFacts >= 0` (chip com missing = 0) | reprova 6 |
| R1a | R1 | `recentBandSlots`: `>=` → `>` | reprova 8 |
| R1b | R1 | corte do rodapé com outra régua (`+1 min`) | reprova 8 |
| R1c | R1 | só a faixa com outra régua | reprova 8 |
| R1d | R1 | `panel-assembly` com `recentStats` sobre a janela toda | reprova 3 (MORDE 1h/4h, CALA 1m) |

**e2e contra o app real e o stub** (`S/abl.sh`: muta → `next build` → `next start :3147` → playwright → `git checkout`).
`git status` limpo ao fim, exceto o teste deste QA.

| id | origem | ablação | resultado |
|---|---|---|---|
| A1 | declarada | passo = `60_000` no pager **e** no `page.tsx` | **4 failed / 1 passed**: 5m/15m/1h/4h reprovam, e o 1m (controle) passa |
| A2 | declarada | trava do pager desligada | **1 failed**: o zoom-in de 4h pagina. A montagem de 4h passou nesta corrida porque o eco não veio, diferente do build (que mediu 10). O zoom-in é o que separa |
| A3 | minha | `VIEW_BARS = 5_760` | **3 failed**: 1m/5m/15m (`bar_spacing < 4`). 1h e 4h passam porque o eixo é menor que a vista |
| B1 | declarada (#3) | `COVERAGE_HEAD_GRACE_MS = 0` | **A-3 failed** |
| B2 | declarada (#4) | `data-fact` em buckets | **A-2+A-1 failed** |
| B3 | declarada (C3-1) | sem `@container/legend` | **C-3 a 1024 e a 1200 failed** (2/4) |
| B4 | minha | forma completa sempre pintada (sem `@max-[1140px]:hidden`) | **C-3 a 1024 e a 1200 failed** (2/4) |
| R1-e2e | minha | `recentBandSlots` exclusivo à esquerda | **`e2e/14` C-1 em 1h e em 4h failed** (2/2) |

Base sem mutação, `e2e/14` C-1 contra dado real: 1h `band 163/167`, `readable_in_band = 5`; 4h `band 40/41`,
`readable_in_band = 2`. **(a) do despacho: o conserto da `T-05.1-R1` vale.** O 1m é provado igual ao de antes pelo
`CALA C-1` unitário (`deepEqual` com a regra antiga) e pela R1d, que reprova só os MORDE.

## Sondas adversariais contra o app real (`S/e2e/qa-w7.spec.ts`, não versionada)

| sonda | resultado `[MEDIDO]` |
|---|---|
| P1: troca 1h→4h **no meio de um arrasto** (botão de ponteiro ainda apertado) | 4h nasce `42/42`, 27,9 px, `0` pedidos, `0` erros, `mounts = 1` |
| P2: 4h→1h **com página em voo** (10 pedidos) | 1h fica `168/168`. A resposta velha não contamina, nenhum pedido novo, `0` erros |
| P3: 4h, clique sem arrasto e depois resize que **estreita** (1024) e que **alarga** (1600) | `0` pedidos nos dois. O `[NÃO SEI]` da revisão (alargar pagina?) foi medido: **não pagina** nesta geometria |
| P4: 4h, duas páginas seguidas | `84/84` (10 pedidos) e depois `126/126` (20). A trava não vira trava permanente |
| P5: ledger × chip × texto nos 5 TFs | 1m: 0 chips (sem reagregação). 5m/15m: volume e CVD `65/5760` (1,1%), liquidação `4466`/`4468` de `5760`. 1h: `502/10080` (5,0%), liquidação `8275/10080`. 4h: `502/10080`, liquidação `8319/10080`. Toda série com `missing = 0` não tem chip, e o chip existente bate fato, `missing-ms` e % |
| P6: 1m, tempo até o 1º canvas, master `eda7520` × wave, intercalado, n = 6 cada | master `5767–6309` ms (mediana 5963). Wave `5875–6341` ms (mediana 6186, +3,7%). As faixas se sobrepõem. **Sem regressão material** `[INFERRED: n = 6, máquina compartilhada]` |

⚠️ **P2 e P4 só mediram com o cabeçalho CORS injetado** (`page.route` → `route.fetch` da API real + `access-control-allow-origin`).
Sem ele, o browser em `:3147` tem o fetch da página **bloqueado por CORS** (a API só libera a origem do deploy). Na 1ª
rodada o P4 falhou por isso, não por defeito do produto: os mesmos bytes, com o cabeçalho, dão `126/126`. Quem medir
paginação contra a API real a partir de outra porta precisa disso, senão mede o ambiente.

## (b) `e2e/14 › the LongShortPane's bar count is the API's` em 1m — **PRÉ-EXISTENTE no master, dependente de dado**

Rodado contra o master `eda7520` (worktree de controle `qa-w7-ctl`, build próprio em `:3148`, já removida) e contra a
wave, com o mesmo dado `[MEDIDO]`:

| braço | resultado | fatos |
|---|---|---|
| master `eda7520` | **failed**: *"cannot be below `ceil(wire/5)`"* | `native_by_publication = 1132`, `wire = 5760`, `ceil(wire/5) = 1152`, `widest_publication_slots = 85` |
| wave `acce0b3` | **failed**, mesma mensagem | os mesmos números |

A causa está no dado: uma publicação do long/short cobre **85 slots** de 1 min (um buraco de ~85 min), e o invariante
do spec supõe no máximo 5. **Não é regressão da wave.** O dono é `sentimento` (o buraco) ou o premissa do spec
(`e2e/14:35`), não `web`. O `make e2e` não pega isso porque roda no universo fraco.

## Achados

1. **[WARNING] W-1. P2 e P4 contra a API real exigem CORS injetado.** Os specs versionados de paginação (20/21/22) usam
   stub, então nenhum e2e versionado prova a página **real** de 4h desenhada. Recomendação, sem bloquear: versionar o P4
   (duas páginas de 4h, `126/126`) num spec de dado real com o `route` de CORS.
2. **[WARNING] W-2. O envelope não recusa `present > expected`** (`series-history-envelope.ts:265`, só checa que são
   inteiros). O `Math.max(0, …)` era a única guarda e não tinha teste (U4 sobrevivia). **Corrigido neste QA, só com
   teste:** `coverage-magnitude.test.ts` ganhou o par morde/cala "QA U4", 25/25 passam, e a mutação agora reprova.
3. **[WARNING] W-3. Doc delta.** O chip com duas formas (container query a 1140 px) está em `frontend/README.md` §25 e no
   desenho §10, não em `DESIGN_SYSTEM.md` (§1.5/linha 355, integridade). Não reprova: a regra visual de integridade
   (violeta + glifo + texto) já está lá e o padrão não a muda. Se outra superfície reusar o chip, ele merece uma linha.
4. **[WARNING] W-4. `e2e/14` bar count** — pré-existente, ver (b). Dono fora de `web`.
5. Herdados e não reabertos: F-2/F-3 de `T-05.4` (liquidação 77–82% faltando, que a `T-05.2` fecha depois do
   re-populamento), o OI a 59,2 px em 1024, e o N-1 do W7-DESIGN-REVIEW.

Nenhum BLOCKER.

## Veredito: **APPROVED**

Sem ações obrigatórias. As recomendações são W-1 e W-3.

## Arquivos deste QA

- `frontend/src/app/symbol/coverage-magnitude.test.ts` (+2 testes, o par U4)
- `docs/context/paineis-de-fluxo/gates/W7-QA-FRONT.md` (este arquivo)
