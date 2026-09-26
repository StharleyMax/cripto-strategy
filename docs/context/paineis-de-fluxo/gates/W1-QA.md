# W1-QA — QA de front da wave W1 (fase 01 + fix das regressões da fase 05 + T-01.10 + T-01.11-FIX)

**Feature:** `paineis-de-fluxo` · **Base:** `f5b1f06` (`wave/paineis-f01`) · **Data:** 2026-09-26 (UTC) ·
**Agente:** `frontend-qa` · **Janela:** exclusiva (nenhum outro agente do workflow ativo) · **Portas:** 8835/4335
**Contra:** `docs/plans/SPEC-009-paineis-de-fluxo/01_esqueleto.md` (DoD 1–12) · `handoff/FIX-regressoes-fase05.md` ·
`gates/T-01.11-design-review.md` (r1, MF-1/MF-2) e `gates/T-01.11-design-review-r2.md`

## 0. Veredito: NEEDS_FIX

O **produto** está certo, e as 3 regressões estão mortas no pixel e sob ablação. Isso inclui o dado real, lido pelo
proxy só-leitura. **Dois achados BLOCKER, nenhum no código de produção:**

1. **`make verify` foi VERMELHO na primeira rodada** (`e2e/18:107` e `18:153`), e o vermelho **reproduz** de forma
   determinística numa faixa do relógio. É defeito do **teste** `e2e/18`, que já existia antes da W1, e não da W1. Mas
   o critério desta wave é *"100% verde, sem vermelho conhecido"*, e agora esse vermelho é conhecido (§3).
2. **Doc delta:** a `ADR-044` ainda publica o falsificador de `D2′` que o próprio `/architect` julgou falso. A emenda
   está escrita e pronta em `handoff/ADR044-D2P-julgamento.md` §4.1/§4.2, e não foi aplicada (§6).

## 1. Checklist

```
## QA Gate (Front) — Fase 01: esqueleto (+ 1.F1/1.F2/1.3′/1.7′, T-01.10, T-01.11-FIX)
- [OK]   DoD da fase item a item (§2), cada um com o comando
- [OK]   Lógica fora do componente: seed-identity.ts, pane-registry.ts, pane-legend.ts, legend-reading.ts,
         mark-band-geometry.ts, pane-stack-layout.ts, host-series-feed.ts, pane-scale-isolation.ts,
         unlabeled-tick-format.ts. Todos são módulos puros e têm *.test.ts
- [OK]   Contrato tipado na borda: tsc --noEmit --strict no lint-frontend (rc=0)
- [OK]   Sem segredo no cliente: `regras` com 0 bloqueio (77 avisos, nenhum de segredo)
- [OK]   Acessibilidade: camada de DOM com pointer-events none e canvases aria-hidden (e2e/23, e2e/24 verdes).
         Não reauditei o C-5 (pointer-events) além do e2e
- [OK]   Testes existem, passam e têm o par morde/cala. 6 mutações rodadas por este QA (§4), 6/6 mordem
- [FAIL] Cobertura: front [NÃO MEDIDO] (não há instrumento de cobertura em node --test/Playwright). Back 96,31%
- [OK]   regras sem bloqueante: 0 bloqueio(s), 77 aviso(s), dentro do make verify
- [FAIL] make verify verde: rodada 1 VERMELHA (63 passed, 2 failed). Rodada 2 VERDE (67 passed, 2 skipped).
         O vermelho depende do relógio (§3)
- [FAIL] Doc delta: a emenda da ADR-044/D2′ não foi aplicada (§6). docs/INDEX.md: +12 −0 linhas (append-only OK)
- [OK]   Rótulos de força e números com comando, no que li dos gates da wave. Um número está defasado (§7, W-5)
```

Os 2 `[FAIL]` que valem veredito são o `make verify` e o Doc delta. O de cobertura é a ausência de instrumento, que
já estava assim antes da W1, e não reprova sozinho.

## 2. DoD do plano 01, item a item

| DoD | como foi medido | resultado |
|---|---|---|
| 1 Spike | `gates/T-01.0-spike.md` presente, com F-1..F-5 e controle negativo | OK `[DOC]`, não rodei de novo |
| 2 Um gráfico (`CA-1′`) | `e2e/24:383` no `make verify` e no app real | `tv_lightweight_charts_count=1`, 6 panes com `points=5760` `[MEDIDO]`. Na captura real: `charts=1` |
| 3 Um eixo (`CA-2′`) | `e2e/24:427`, por pixel | uma faixa só com tinta de texto de tempo (`top=943`, `textInk=293`) `[MEDIDO]` |
| 4 Crosshair e legenda | `e2e/24:476` | verde nas 2 rodadas. ⚠️ Roda contra o stub próprio do spec, e não contra a API de produção: `proxy_get_requests_total=1` na rodada real (W-4) |
| 5 Legenda derivada | `e2e/24:550` | verde |
| 6 Formas 08..15 | `make e2e` | verdes. **`e2e/15` CA-2 e CA-4 SKIPPED** (*"universo FRACO: a API sob teste serve 0 velas"*), então essa parte não é medida no portão (W-3) |
| 7 Latência | fatos de `make verify` nas rodadas 1 e 2 | `e2e/17`: `p95` = **17,4 / 29,4 ms**, `n=86`, max 33,1 / 34,8 (teto 160). `e2e/20`: página `p95` = **71,8 / 72,4 ms**, `n=15` (teto 400). Intervalo intra-gesto: max **66,9 / 80,5 ms**, `n=320/316`, `over_ceiling_n=0` (teto 160). O F-7 (rAF ≥ 25 ms) é da `T-01.10` `[DOC: gates/T-01.10-latencia.md]` e não foi re-rodado aqui |
| 8 `make verify` + `__pycache__` purgado + `ux-ui-mastery` | 2× `make verify`. Depois, purga de **24** diretórios `__pycache__` e `make test` | rodada 1 VERMELHA, rodada 2 VERDE. Pós-purga: **2731 passed, 1 skipped, 1 xfailed**, cobertura 96,32%. ux-ui-mastery r2: APPROVED WITH CONDITIONS 64/100 `[DOC]` |
| 9 `18` | `e2e/18` + `e2e/26` novo (§4), fraco e real | produto OK: `1m→5m` desenha **663 = 663** da carga direta, `1m→4h` desenha **23 = 23** (o `1m` desenha 3226) `[MEDIDO, dado real, proxy refused=0]`. `e2e/18` vermelho numa faixa do relógio (§3) e **cego** ao termo `interval` (§4, W-1) |
| 10 `16` | `range-dispatch.test.ts` + `e2e/16` + mutação D | `host_write_count_delta` = 0 nos 3 gestos. A mutação morde nos dois níveis |
| 11 `20` | `e2e/20`, `e2e/22`, mutação C | `chart_mount_count_after=1` depois de 2 páginas. `gestures_parked_after_page_n=0` em 10–11 gestos elegíveis. `page_boundary_jump_slots` = 12× `0`. A mutação morde o `22`, e o `20` reprova antes do alvo (W-2) |
| 12 Baseline da `T-01.10` | `gates/T-01.10-latencia.md` | presente `[DOC]` |
| MF-1 / MF-2 (r1) | `e2e/24:597` + mutações E/F + captura real 1280×1200 | CVD `normal`, eixo **2000.00 / −2000.00**. Liquidação: `logarithmic` e **0** rótulo. OI, long/short e preço: `normal`. As duas mutações mordem |

## 3. BLOCKER-1: `e2e/18` reprova por relógio, e `make verify` saiu vermelho

- **Medido:** a rodada 1 do `make verify`, que começou às `2026-09-25T23:55:50Z` e chegou ao e2e perto de `00:04Z`,
  deu **63 passed, 2 failed**: `18:107` (asserção em `:131`) e `18:153` (`:161`). Log bruto:
  `/tmp/verify-wave-paineis-f01-20260925T235550Z.log`.
- **Reproduzido:** `run.sh head18 3 18-tf-refetch` deu **3/3 vermelho** entre `00:07Z` e `00:09Z`. Depois das
  `00:10Z`, `run.sh head18b 2` deu **2/2 verde**.
- **Causa:** `request-window.ts:146-163`. A borda de `1m` é alinhada a 5 min (`RIGHT_EDGE_LAG_MS` = 5 min), e a de
  `4h` é alinhada a 4h. Quando `floor_5m(now − 5min)` cai numa fronteira de 4h, as duas janelas são **idênticas**
  (fato: `window_before == window_after_4h`, as duas com `start=1790035200000`, `end=1790380740000` e
  `knowledge=1790381040000`). Então *"4h move a borda"* é **falso por construção** das `HH:05` às `HH:10` UTC, com
  HH ∈ {00, 04, 08, 12, 16, 20}. São 5 de cada 240 min, **2,08% das leituras de relógio**
  `[INFERRED: aritmética de alinhamento; o mesmo 2,1% de WAVE-03-janela-deslizante-quant-architect.md §1]`.
  O `:153` tem um segundo modo, mais raro: se uma fronteira de 5 min cai entre `original` e `restored`, a
  comparação `toEqual` quebra `[INFERRED: ~2 s de teste / 300 s ≈ 0,7%; NÃO MEDIDO]`.
- **O produto está certo nessa faixa.** A chave muda pelo termo `interval` e a instância é trocada: o `e2e/26`
  passa na mesma faixa, porque não depende do relógio.
- **De quem é:** o teste é da `T-03.11` (o alinhamento a `max(5m, interval)`). Ele já existia, e não é regressão
  da W1. Mas o critério da wave é *"sem vermelho conhecido"*.

## 4. As mutações, rodadas por este QA (6/6 mordem)

Cada mutação foi aplicada na árvore, medida com `next build` + Playwright nas portas 8835/4335 e revertida com
`git checkout --`. A árvore ficou limpa depois de cada uma (`git status --short` mostra só o spec novo).

| # | mutação | reprova | cala |
|---|---|---|---|
| A | `interval: DEFAULT_TIMEFRAME` na chave (`[symbol]/page.tsx:996`) | **`e2e/26` 5m** (fraco e real: depois do clique ficam **2580** velas de `1m` contra **664** da carga direta de `5m`, e o host sobrevive) | **`e2e/18` 4/4 VERDE**: o `18` é cego a este termo, e isso confirma o `[ACHADO]` do `T-01.F1-builder.md` §3. O `e2e/26` 4h fica verde, como deve |
| B | sem `key` em `<SymbolClient>` (reproduz o `master`) | `e2e/18:107`, `18:153`, `e2e/26` 5m e 4h (4 failed) | `18:90` e `18:181` |
| — | `seedIdentityKey` sem `interval` (unitário) | `seed-identity.test.ts`: *"every pair of distinct served timeframes gives distinct keys"* (1 fail / 6 pass) | — |
| C | `axis` nas deps do efeito de montagem (`SymbolClient.tsx:1170`) | `e2e/22` (`chart_mount_count_after=4` em 3 páginas) e `e2e/20` | — |
| D | `index === originIndex && false` (`range-dispatch.ts:194`) | `range-dispatch.test.ts` (5 ✖, incluindo T-01.5 (a) e (b)) e `e2e/16:149` (*"o dispatcher escreveu na origem"*) | `e2e/16:181` (ablação) |
| E | sem `createPanesBeforeSeries` (`SymbolClient.tsx:1045`) | `e2e/24:597` *"MF-1: um pane herdou o modo de escala de outro"* | os outros 4 testes do `e2e/24` |
| F | `priceFormat` numérico na liquidação (`SymbolClient.tsx:2599`) | `e2e/24:597` *"MF-2 liquidation-cohort-long: o eixo log da liquidação rotula"* | os outros 4 |

**Teste novo (versionado): `frontend/e2e/26-tf-click-swaps-drawn-grid.spec.ts`**, com 2 testes (5m, 4h):

- **(A)** O nó do host do gráfico é **novo** depois do clique. Vale sempre, inclusive no universo fraco, que serve
  0 velas.
- **(B)** Onde há dado: as velas desenhadas depois do clique são iguais às da carga direta e diferentes das de `1m`.

Ele fecha o W-1, porque morde A e B, e não depende do relógio. Entrou na rodada 2 do `make verify` (67 passed).

## 5. As 3 regressões, com a prova

| regressão | prova no HEAD | ablação que reprova |
|---|---|---|
| **TF 4h troca o dado** (`18`) | `e2e/26`, dado real: `1m` 3226 → clique `4h` **23** = carga direta 23 · clique `5m` **663** = 663 | B (sem `key`) e A (sem `interval`, via `e2e/26`) |
| **sem pulo no arrasto** (`16`) | `e2e/16`: `host_write_count_delta` = 0 em 3 gestos | D |
| **arrasto sobrevive à página** (`20`/`22`) | `e2e/22`: `mount_count` fica em 1 depois de 2 páginas · `e2e/20`: `gestures_parked_after_page_n=0`, `page_boundary_jump_slots` todos 0 | C |

**Universo real:** `next build/start` na porta 4335, contra a API de produção (`127.0.0.1:8000`) através do proxy
só-leitura na 8835 (cópia de `T-01.11-r2-proxy.mjs.txt`). Resultado: `refused=0` em todas as rodadas, com
**193 / 113 / 14 GETs**. **Nada foi semeado, nenhum INSERT.**

## 6. BLOCKER-2 (Doc delta): a ADR-044 publica um falsificador de `D2′` já julgado falso

`docs/adr/ADR-044-…md:86-89` ainda diz *"**Morde:** filtrar também a portadora colapsa as lacunas"*. O
`handoff/ADR044-D2P-julgamento.md` §1 mediu que esse controle dá **0 byte** no gráfico que a frase descreve, e
escreveu a emenda (§4.1 para a ADR, §4.2 para `handoff/T-01.10-desenho.md:98`). O §5 diz: *"Aplicar a §4.1 à ADR é
ato de quem integrar `f16673d`/`eed2844` na wave"*. A integração aconteceu (`ceec6ef`), e a emenda não foi aplicada.
`git diff ba21f07..HEAD -- docs/adr/ADR-044*` não mostra a troca, e a linha 98 do desenho continua com o texto antigo.

O **código** já tem as três pernas do falsificador partido: `e2e/25` com `carrier_filtered_no_marks` e
`host-series-feed.test.ts` com 9 testes. Só o documento está atrasado.

## 7. WARNINGs

- **W-1:** o `e2e/18` é cego ao termo `interval` (mutação A, 4/4 verde). **Fechado** pelo `e2e/26`.
- **W-2:** com a mutação C, o `e2e/20` reprova no pré-arrasto (*"o pré-arrasto não moveu o gráfico"*), e não na
  asserção da `T-01.F2`. Então a mordida da asserção nova contra o remonte não aparece de novo no HEAD. O `e2e/22`
  cobre a mesma propriedade diretamente.
- **W-3:** `e2e/15` CA-2/CA-4 são pulados no `make e2e` (universo fraco, 0 velas). O DoD 6 é medido pela metade no
  portão.
- **W-4:** `e2e/24` sobe o próprio stub, então o CA-3′/CA-4 (*"legenda == API"*) não é contra a API de produção. A
  prova com dado real é a captura r2 do design gate e a minha: legendas `84074.6`, `223.311`, `95234.404`,
  `1.2989`, `delta 121.609`, `acumulado -12742.535`.
- **W-5:** informativo. O `frontend_qa.agent.md` diz que as suítes do front estão fora de portão e que são 34
  arquivos. **Isso está defasado:** `make verify` roda `test-frontend` com **1066 pass / 0 fail em 4 suítes**.
- **W-6:** para o design gate, não para QA. No pixel real, o eixo direito do CVD (±2000) só vale para o **delta**. O
  acumulado (`-12742.535` na legenda) vive numa escala sobreposta sem rótulo, e a linha tracejada aparece perto de
  −2000 no eixo do delta. Isso já existia antes da F1. A microcopy *"escala log10 (base 1)"* também soa
  contraditória. Os SF-2′/SF-3/SF-6/SF-7 da r2 continuam como condição.

## 8. Ações (NEEDS_FIX)

1. **`frontend/e2e/18-tf-refetch-e-ablacao.spec.ts` (`frontend-builder`):** tornar o teste determinístico. Quando
   `(before.endMsInclusive + 60_000) % FOUR_HOURS_MS === 0`, as janelas coincidem por construção. Nesse caso,
   registrar um `fact`, afirmar a igualdade das janelas e manter a asserção do access log (+10 hits de
   `interval=4h`). A troca de instância fica provada pelo `e2e/26`. No `:153`, reler `original` se o
   `knowledgeTimeMs` mudar entre as leituras. **Falsificador:** rodar `e2e/18` numa faixa `HH:05–HH:10` UTC (4h/4h)
   tem de dar verde, e a mutação B tem de continuar mordendo fora dela.
2. **`docs/adr/ADR-044-…md:86-89` e `handoff/T-01.10-desenho.md:98` (quem integra a wave):** aplicar o texto de
   `handoff/ADR044-D2P-julgamento.md` §4.1 e §4.2.
3. **Orquestrador:** acrescentar em `docs/INDEX.md` a linha deste laudo e do `e2e/26`. A §4 das regras manda o QA
   commitar só o laudo e os testes.

## 9. Comandos

- `E2E_API_PORT=8835 E2E_NEXT_PORT=4335 make verify` (2×):
  `/tmp/verify-wave-paineis-f01-20260925T235550Z.log` (VERMELHO) e
  `/tmp/verify-wave-paineis-f01-20260926T002120Z.log` (VERDE)
- `scripts/e2e-env.sh up 1 8835 4335` + `playwright test <filtro>` + `down`: universo fraco, para as mutações A–F e
  para os rerodes do `18`
- `next build` com `INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8835` + `next start -p 4335` + proxy GET-only 8835 →
  :8000: universo real, `e2e/24`, `e2e/26`, `e2e/16`, mutação A e captura 1280×1200
- `find backend -name __pycache__ -type d -not -path '*/.venv/*'` → 24 purgados · `make test` → 2731 passed
