# W1-DESIGN-REVIEW: veredito do `ux-ui-mastery:design-review` sobre o `/symbol` da wave W1, no app real com dado real

**Veredito: NEEDS_FIX. Nota 53/100** (a `T-01.11` r2 deu 64/100, mas só olhou o TF `1m`). No `1m` em repouso, o
pixel é o mesmo da r2 e o APPROVED WITH CONDITIONS dela continua valendo. A W1, porém, entrega também a **troca
de TF** e o **arrasto** (as 3 regressões da fase 05), e a r2 não exercitou nenhum dos dois. Exercitados sobre o dado
real, apareceram **2 must-fix**:

- **MF-A (sev. 4):** um arrasto, para qualquer lado, **apaga as 12 h 40 min mais recentes** da tela. Voltar para a
  borda não traz de volta.
- **MF-B (sev. 3):** em todo TF ≠ `1m`, as 8 leituras da legenda dizem **`ausente`**, com o dado desenhado ao lado.

```
Feature: paineis-de-fluxo · Wave: W1 (fase 01 + fix das regressões da fase 05 + T-01.10 + T-01.11-FIX)
Base: c06d420 (wave/paineis-f01) · frontend/src idêntico a a154fe3 (`git diff --stat a154fe3 HEAD -- frontend/src` = vazio)
Skill: ux-ui-mastery:design-review (10 domínios) · captura: 2026-09-26 00:40–01:05 UTC · portas 8837/4337
```

## 1. Instrumento

| peça | como |
|---|---|
| reuso | O `frontend/src` não mudou desde a r2 (comando acima). Por isso os PNGs da r2 em **TF `1m`**, sem gesto, foram reaproveitados: `e2e-shots/T-01.11-r2-*`. Olhei de novo o de 1280×1200 e o de 1920×1080 |
| app | uma cópia de `frontend/` no scratchpad, com `node_modules` por hardlink, para não mexer no `.next` da worktree. `INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8837 npx next build` deu rc=0, depois `next start -p 4337` |
| dado | a API de produção `:8000`, lida pelo proxy só-leitura da r2 (`T-01.11-r2-proxy.mjs.txt`, com a porta trocada para 8837). Contador final: `proxy_get_requests_total=316 refused=0` `[MEDIDO]`. **Nenhum seed, nenhum INSERT** |
| captura nova | Playwright/Chromium com DPR 1, `/symbol/BTCUSDT`, em 1920×1080 e 1280×800: clique em `4h` e em `15m`, crosshair em 4h, arrasto de 30 % da largura nos dois sentidos, e 4 arrastos de volta para a borda |
| referência | `deploy-web-1` (`:3000`, o master em produção, 6 charts) com os mesmos gestos e com a carga direta de `?interval=4h`. Serve para atribuir cada defeito à W1 ou ao que já existia |
| evidência | Os PNGs e os scripts ficaram no scratchpad da sessão, **sem versionar**: pela regra §4, este portão commita só este arquivo. O script que reproduz o MF-A está no §7 e roda sozinho |

## 2. Must-fix

### MF-A (sev. 4, atribuído à W1 `[INFERRED]`): um arrasto apaga a borda mais recente e ela não volta

| gesto (TF `1m`, 1920×1080) | `T` no cabeçalho "COMO EM T" | OI: "Última leitura há …" | tela |
|---|---|---|---|
| carga | `2026-09-26 00:59` | `0 min` | dado até a borda direita |
| 1 arrasto de 30 % para o passado | **`2026-09-25 12:19`** | **`38 h 44 min` ⚠️ DADO VELHO** | as 12 h 40 min mais recentes somem. O lado direito fica vazio |
| mais 4 arrastos de 70 % de volta para a borda | **`2026-09-25 12:19`** (não volta) | **`38 h 44 min`** | **tela vazia**: nenhuma vela, nenhum rótulo de tempo, as 8 legendas em `ausente`/valor velho |
| 1 arrasto de 30 % **para o futuro**, a partir da carga | **`2026-09-25 12:14`** | `38 h 39 min` | o mesmo corte |
| clique em `4h`, depois arrasto | `23:59 → 11:19` | `3 h 54 min → 37 h 44 min` | o mesmo corte |

`[MEDIDO: drag.mjs, drag2.mjs, drag3.mjs; n=5 sequências de gesto na W1, 2 viewports]`

**O controle não faz isso.** Com os mesmos 3 gestos no `:3000`, "Leitura atual: 83860.1" e "há 0 min" ficam
iguais do começo ao fim `[MEDIDO: drag3.mjs, REF]`.

**Causa provável `[INFERRED: aritmética exata, sem mutação rodada por este gate]`:** a janela inicial tem **5760
slots** (4 dias × 1 min). O teto de acumulação é `DEFAULT_MAX_ACCUMULATED_SLOTS = 5_000`
(`frontend/src/app/symbol/history-page-window.ts:37`), e ele corta pela **direita**. O corte fica adiado durante o
gesto e é aplicado na soltura (`capWindowRightEdge`, `use-history-pager.ts:395`, que entrou na `T-01.5`, `6767f3f`).
**5760 − 5000 = 760 min = 12 h 40 min**, que é exatamente o recuo medido de `T` (00:59 → 12:19). Não existe
página para o futuro que traga a borda de volta.

O teto já existia no master (`git grep MAX_ACCUMULATED_SLOTS origin/master` acha o mesmo `widenAndCapWindow`). Mas
o master **não manifesta** o corte com o mesmo gesto. `[NÃO SEI]` se o pager do master nem chega a disparar ou se
dispara sem aplicar o corte. **Onde a W1 manifesta o defeito, o controle não manifesta.** Por isso a atribuição é à W1.

**Por que é severidade 4:** o operador perde **o trecho que mais importa** (o mais recente) com o gesto mais comum da
tela. Não tem como recuperar sem recarregar. E a própria tela passa a gritar "DADO VELHO" sobre um OI que estava
fresco. O `W1-QA` provou "sem pulo" e "sobrevive à página" (`e2e/16`, `e2e/20`, `e2e/22`: contagem de escrita, de
montagem e de salto), mas **nenhum** desses testes olha se a borda direita continua na tela depois da soltura.

**Conserto:** decisão de quem é dono de `D-C3.5` e da `T-01.5`. As saídas que vejo, sem escolher entre elas: (a) um
teto ≥ janela inicial + 1 página, (b) cortar a ponta **oposta à que está na tela**, e não sempre a direita, (c) uma
página para o futuro quando a vista volta à borda, com um "ir para o agora" visível.

**Falsificador:** com o teto em ≥ 6260, o mesmo `drag3.mjs` tem de manter `T = 00:59` e "há 0 min" nas 3 linhas.
Se `T` recuar mesmo assim, a causa não é o teto e este parágrafo está errado.

### MF-B (sev. 3, já existia na carga direta, e a W1 levou para o caminho principal): em TF ≠ `1m`, a legenda diz `ausente` com o dado desenhado

| estado | leitura das 8 legendas | o que está na tela ao lado |
|---|---|---|
| repouso em `4h` e em `15m` (1920 e 1280) | **8 de 8 = `ausente`** (`data-legend-absence=SEM_PONTO`) | a vela, o rótulo de último valor no eixo (`83971.40`), OI `95344.84`, CVD `458.22` |
| crosshair em `4h`, **em cima** da coluna de 1 px da vela (x=1501) | 7 com valor. **Volume = `ausente`** | a vela |
| crosshair em `4h`, **1 px à direita** (x=1502) | **8 de 8 = `ausente`**, com o OI "retido" | o mesmo bucket de 4 h, com dado |

`[MEDIDO: capture.mjs facts.tf_4h/tf_15m.legends, hover4h.mjs; n=8 leituras × 4 estados × 2 viewports]`

Na r2, **`ausente` virou a palavra do "não sabemos"** (MF-3). Aqui ela afirma que não sabemos do dado que está
desenhado ao lado, em **4 dos 5 TFs** do seletor. Em `4h`, ela sai verdadeira só numa faixa de 1 px a cada 120 px.

**Causa provável `[INFERRED: leitura do código]`:** o instante de leitura usa passo de 1 min em qualquer TF:
`lastInstantMs` = `lastGridInstant(panels.window, ONE_MINUTE_MS)` (`SymbolClient.tsx:540-541`), e o preço lê com
`resolveStockReading(closeSlots, ONE_MINUTE_MS, ONE_MINUTE_MS, …)` (`:1942`). Em `4h`, o último minuto da grade
não tem ponto: o ponto está no slot de abertura do bucket.

**Atribuição:** no master, a carga direta de `?interval=4h` já pinta "Leitura atual: SEM_PONTO" nas 8 leituras
`[MEDIDO: ref4h.mjs]`, então **o defeito é anterior à W1**. Só que até a W1 o clique no TF desenhava o `1m` (a
regressão), e ninguém chegava nesse estado pelo seletor. A W1 consertou a troca (`e2e/26`: `1m→4h` desenha 23 = 23),
e com isso **cada clique de TF passa a cair nele**. É por isso que reprova esta wave: a entrega da W1 é "o TF troca o
dado", e a primeira leitura depois do clique são 8 negativas falsas.

**Falsificador:** em `4h`, parado, a legenda do preço tem de mostrar o fechamento do último bucket fechado, que é o
mesmo número do rótulo do eixo. E, sob o crosshair, qualquer x dentro de um bucket com vela tem de ler valor.

## 3. Should-fix novos (não reprovam, seguem como condição)

- **SF-8 (sev. 2, da F1):** o numeral da legenda é `String(value)` (`pane-legend.ts`, `formatLegendReading`). A soma
  reagregada aparece com ruído de ponto flutuante: **`14315336.490699999`** e `60777.34220000001` na liquidação em
  `4h` `[MEDIDO: hover4h.mjs]`. A precisão também muda de leitura para leitura (`83767` no preço, contra `84059.30` no
  eixo). Conserto: um formatador por grandeza, com a mesma precisão do eixo do pane.
- **SF-9 (sev. 2, da F1, a11y):** a camada `sr-only` ainda diz **"Leitura atual: SEM_PONTO"** ao leitor de tela.
  São 8 nós em `4h` e 2 em `1m`, todos com `.sr-only` e nenhum com ancestral `aria-hidden` `[MEDIDO: aria.mjs,
  enum.mjs]`. É o MF-3 da r1 mudado de canal: quem enxerga lê `ausente`, e quem ouve ouve o enum. Conserto: a
  mesma palavra dos dois lados.
- **SF-10 (sev. 2):** em `4h` e em `15m`, as caixas "COBERTURA PARCIAL — N de M buckets…" ficam **sobre o plot**
  (preço, as 2 liquidações e o CVD), e as barras altas da liquidação long **cortam o texto** "Liquidações (1m, USD)"
  e "Liquidação de posições compradas". Crop: `W1-DR-1920x1080-15m.png`, y≈405–490. A mensagem de integridade
  está certa, mas o lugar dela disputa o dado.

## 4. Escalados (anteriores à W1, visíveis agora pelo seletor de TF)

- **E-3 (sev. 3):** em `4h`, cada vela ocupa **1 slot de uma grade de 1 min**. O resultado são 23 velas de **1 px**
  de largura, espaçadas por ≈120 px, e o corpo abre/fecha não aparece (crop `crop4h.png`: pavio e corpo com a mesma
  largura `[MEDIDO: PIL]`). O `ARQ-1-julgamento-frontend-architect.md:141` previa *"um candle por slot, sem
  artefato"* para `5m`…`4h`, e o pixel refuta isso. O master na carga direta de `4h` desenha igual. É geometria da
  `ADR-044`: dono `frontend-architect`. O `15m` fica legível no limite (corpos de ≈3 px).
- **E-4 (sev. 3):** em `4h`, o OI diz **"Última leitura há 3 h 54 min … ⚠️ Mais velha que o teto — DADO VELHO"**
  logo depois da carga. A idade é contada da **abertura** do bucket de 4 h (20:00) até o fecho da janela (23:59).
  O master na carga direta diz o mesmo `[MEDIDO: ref4h.mjs]`. É a mesma família do MF-B (tempo de TF ≠ `1m` lido na
  régua de 1 min), e o conserto provavelmente anda junto `[INFERRED]`.
- **E-5 (sev. 1):** em qualquer TF, o título do pane continua dizendo **"(1m, USDT)"** e **"(1m, BTC)"**. Se o
  parêntese é a granularidade **nativa** (como o "(5m, BTC)" do OI), está certo. Só que, com o botão `4h` aceso,
  ele se lê como "o que estou vendo". Fica para o `ui-designer` decidir a microcopy.

## 5. Condições da r2 que continuam abertas (conferidas no pixel novo)

SF-2′ (o aviso de terceiro cortado a 1280, sem `title`), SF-3 (dobra a 800 px: `scrollHeight` = 1081 nos 4
estados novos), SF-6 (a caixa "Últimas 4 h" cortada: "Últ" a 1920 em `4h`/`15m`), SF-7, E-1 (a reta sobre a
lacuna) e E-2 (3 × `404` do ao vivo: 12 falhas por viewport nesta captura, todas em `/?series_key_id=…`). Nenhuma
mudou, porque o `frontend/src` é o mesmo da r2.

## 6. Pontuação, pelos 10 domínios da skill

| domínio | r2 (só `1m`) | W1 | uma linha |
|---|---|---|---|
| Heuristic Compliance | 7 | 5 | Visibilidade de estado quebrada em TF ≠ `1m` (MF-B, E-4), e nenhum "ir para o agora" depois do corte (MF-A) |
| Research Foundation | 6 | 6 | O instrumento de QA mediu salto e montagem, mas não retenção de dado. A previsão do ARQ-1 para `4h` não foi medida antes |
| Mobile Experience | 3 | 3 | Fora do alvo |
| Desktop Experience | 7 | 5 | O `1m` segue bom. Em `4h` a vela é ilegível (E-3), e o gesto principal perde dado (MF-A) |
| Visual Design | 7 | 6 | Caixas de cobertura sobre o plot, barras cortando texto (SF-10), numeral com ruído (SF-8) |
| Accessibility | 7 | 6 | O leitor de tela ouve `SEM_PONTO` (SF-9) |
| Interaction Design | 7 | 4 | O arrasto destrói a borda (MF-A). O crosshair em `4h` só lê numa coluna de 1 px (MF-B) |
| Future-Readiness | 6 | 6 | Sem mudança |
| System Architecture | 8 | 7 | Teto (5000) menor que a janela inicial (5760), e `ONE_MINUTE_MS` fixo no instante de leitura |
| Ethics & Content | 6 | 5 | "DADO VELHO" falso e `ausente` falso: alarme e ausência que a tela não sustenta |

**Média: 53/100** `[MEDIDO: (5+6+3+5+6+6+4+6+7+5) = 53, /10 = 5,3]`. Sem o Mobile, fica em **5,56** (50/9).

**Roteiro.** *Rápido (< 1 dia):* SF-8 (formatador), SF-9 (mesma palavra no `sr-only`). *Médio (1–5 dias):* MF-B
com E-4 (instante e idade na régua do TF), MF-A (teto e borda, com um "ir para o agora"), SF-10. *Estratégico:*
E-3 (grade por TF, ou largura por duração: decisão da `ADR-044`).

## 7. Reprodução do MF-A (roda sozinho, só GET, contra qualquer build)

```js
// node drag3.mjs  — needs next start on :4337 (W1) and :3000 (master) over the read-only proxy.
import { chromium } from "<frontend>/node_modules/playwright/index.mjs";
const b = await chromium.launch();
const st = (p) => p.evaluate(() => ({ T: (document.body.innerText.match(/T = [0-9-]+ [0-9:]+ UTC/) ?? [null])[0],
  oi: (document.body.innerText.match(/Última leitura há [^e]+em relação/) ?? [null])[0] }));
for (const base of ["http://127.0.0.1:4337", "http://127.0.0.1:3000"]) {
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto(`${base}/symbol/BTCUSDT`); await p.locator(".tv-lightweight-charts").first().waitFor(); await p.waitForTimeout(6000);
  const box = await p.locator(".tv-lightweight-charts").first().boundingBox(); const y = box.y + 150;
  const drag = async (a, z) => { await p.mouse.move(box.x + box.width * a, y); await p.mouse.down();
    await p.mouse.move(box.x + box.width * z, y, { steps: 15 }); await p.mouse.up(); await p.mouse.move(5, 5); await p.waitForTimeout(3500); };
  const log = [await st(p)]; await drag(0.3, 0.6); log.push(await st(p));
  for (let i = 0; i < 4; i++) await drag(0.8, 0.1); log.push(await st(p));
  console.log(base, JSON.stringify(log));   // W1: T 00:59 -> 12:19 -> 12:19 ; master: unchanged
}
await b.close();
```

## 8. Falsificador deste veredito

O NEEDS_FIX cai para APPROVED WITH CONDITIONS se, no mesmo app com dado real, estas 3 coisas valerem juntas:

1. o `drag3.mjs` mantém `T` e "há N min" iguais antes e depois dos gestos (ou devolve a borda com um "ir para o agora");
2. em `4h` e em `15m`, parado, a legenda do preço mostra o mesmo número do rótulo do eixo;
3. sob o crosshair, qualquer x dentro de um bucket com vela lê valor.

Este gate pede a **mutação** do conserto (reverter o conserto e ver o defeito voltar), e não o relatório.
