# W1-DESIGN-REVIEW r2: veredito do `ux-ui-mastery:design-review` sobre o `/symbol` da wave W1 depois do W1-FIX

**Veredito: NEEDS_FIX. Nota 58/100** (r1: 53). O W1-FIX matou o **MF-A** e **7 das 8 leituras** do MF-B, e eu
medi as duas coisas no app real, com dado real. Fica **1 must-fix**, que é o resto do MF-B:

- **MF-B′ (sev. 3):** em todo TF ≠ `1m`, a legenda do **volume** diz `ausente` em **192 de 192** leituras (em
  repouso e sob o crosshair), com as barras de volume desenhadas logo abaixo. É o item 3 do falsificador da r1, e
  ele continua falhando. Bate com o BLOCKER-1 do `W1-QA-r2` §3, que foi medido de forma independente.

```
Feature: paineis-de-fluxo · Wave: W1 · Base: a4663b2 (wave/paineis-f01)
frontend/src == 4a17e35 (W1-FIX): `git diff --stat 4a17e35 HEAD -- frontend/src` = vazio
frontend/src != r1: `git diff --stat dd07bc3 HEAD -- frontend/src` = 12 arquivos, +294 −16  ⇒ os PNGs da r2/r1 NÃO foram reaproveitados
Skill: ux-ui-mastery:design-review (10 domínios) · captura: 2026-09-26 02:45–03:15 UTC · portas 8837/4337
```

## 1. Instrumento

| peça | como |
|---|---|
| reuso | **nenhum**. O `frontend/src` mudou no W1-FIX (comando acima), então tudo foi capturado de novo |
| app | uma cópia de `frontend/` no scratchpad, com `node_modules` por hardlink. `INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8837 npx next build` deu rc=0, depois `next start -p 4337` |
| dado | a API de produção `:8000`, lida pelo proxy só-leitura (`T-01.11-r2-proxy.mjs.txt` com a porta trocada para 8837). Contador final: `proxy_get_requests_total=470 refused=0` `[MEDIDO]`. **Nenhum seed, nenhum INSERT** |
| captura | Playwright/Chromium com DPR 1, `/symbol/BTCUSDT`, em 1920×1080 e 1280×800. Por viewport: `1m` em repouso. A sequência do `drag3.mjs` da r1 (§7 de lá). Um arrasto para o futuro. E, para cada TF (`4h`, `15m`, `1h`, `5m`): clique, repouso, **varredura do crosshair em 24 x** sobre o plot, e um arrasto |
| latência do TF | `tfclick.mjs` (§7): clica no TF e amostra a cada 500 ms, por 15 s, o botão aceso, a URL e o `T`. n=6 na W1, e n=2 no `deploy-web-1` (`:3000`, o master em produção) como controle |
| evidência | Os PNGs (`W1-DR2-*.png`), o `facts.json` e os scripts ficaram no scratchpad da sessão, **sem versionar**: pela regra §4, este portão commita só este arquivo |

## 2. O que o W1-FIX fechou, medido no pixel (falsificador da r1, §8 de lá)

| item do falsificador | medido | resultado |
|---|---|---|
| 1. o `drag3.mjs` mantém `T` e "há N min" | `1m`, 3 estados (carga → 1 arrasto de 30 % para o passado → mais 4 arrastos de 70 %), nos 2 viewports: `T = 02:49` / `02:54` e *"há 0 min"* **nos 3**. O arrasto para o futuro também não muda nada. Depois do arrasto em `4h`/`15m`/`5m`, o `T` é igual ao do repouso `[MEDIDO: facts.mfa, mfa_future, tf_*.afterDrag; n=2 viewports × 4 sequências]` | **passa**. MF-A fechado. A mutação que morde é a M-A do `W1-QA-r2` (teto cru ⇒ `T` recua 760 min, e `e2e/27` dá 1 failed). Não repeti essa mutação |
| 2. em `4h`/`15m`, parado, a legenda do preço = o rótulo do eixo | `4h`: legenda `83971.4`, eixo `83971.40`. `15m`: `83993.3` e `83993.30` (PNG `W1-DR2-1920x1080-{4h,15m}.png`). Em repouso, o preço fica fora do `ausente` nos 4 TFs e nos 2 viewports | **passa** |
| 3. sob o crosshair, qualquer x dentro de um bucket com vela lê valor | preço em `4h`: **0 de 24** `ausente`. Nos outros TFs, 7–13 de 24 caem em lacuna real da série (os PNGs mostram buracos de horas em 23–25/09). **Volume: 24 de 24 `ausente` em cada um dos 4 TFs e dos 2 viewports** | **falha no volume** ⇒ MF-B′ |

A leitura de repouso das 8 legendas saiu de **8 de 8 `ausente`** (r1, `4h`) para **1 de 8** (`4h`, só o volume) e
**3 de 8** (`15m`/`5m`: volume mais as 2 liquidações) `[MEDIDO: facts.tf_*.rest.leg]`. As 2 liquidações também
aparecem `ausente` em `1m`, e o dado da Coinalyze chega com atraso. Por isso trato esse `ausente` como **verdadeiro**
`[INFERRED: não cruzei com o corpo do /series-history; o W1-QA-r2 §2 cruzou 143/144 em 15m]`.

## 3. Must-fix

### MF-B′ (sev. 3): em TF ≠ `1m`, a legenda do volume afirma "não sabemos" ao lado da barra desenhada

| estado | legenda do volume | na tela |
|---|---|---|
| repouso em `4h`, `15m`, `5m` (2 viewports), e em `1h` a 1280 | `ausente`, com `data-legend-absence=SEM_PONTO` | barras de volume logo abaixo das velas (PNG `W1-DR2-1920x1080-15m.png`, y≈330–390) |
| crosshair, 24 x × 4 TFs × 2 viewports | **192 de 192 `ausente`** | a mesma barra |
| `1m` | `0.962` (ok) | — |

`[MEDIDO: cap.mjs facts.tf_*.sweep; n=192]`

**Causa:** eu não medi. Aceito a do `W1-QA-r2` §3 como `[INFERRED]` (o volume lê um slot no espaço de índice da
grade nativa do TF, e o encaixe `bucketMs` do `LegendFrame` trabalha na grade canônica de 1 min). Os números batem
com isso: o volume cai em 100 % das posições, e não em algumas.

**Por que ainda reprova, com 1 de 8:** na r2 da `T-01.11`, `ausente` virou a palavra do "não sabemos" (MF-3). Uma
negativa falsa **sistemática** numa leitura tira o valor da palavra nas outras 7: o operador não tem como saber qual
`ausente` é verdadeiro. E o `W1-FIX-builder.md` §1 dá o MF-B como fechado.

**Falsificador:** em `4h` e `15m`, parado, a legenda do volume tem de mostrar a soma da última barra fechada (o
`W1-QA-r2` §3 já tem os valores da API: `4h` 20:00 = `14515.595`, `15m` 02:00 = `276.608`). Sob o crosshair, os x
dentro de uma barra desenhada têm de ler valor. **Este gate pede a mutação do conserto**, não o relatório.

## 4. Should-fix novos (não reprovam)

- **SF-11 (sev. 2, anterior à W1):** o clique em um TF leva **4,0 s** para acender o botão, trocar a URL e trocar o
  dado. Nesse tempo, o `1m` continua aceso, e não aparece nenhum sinal de pendência (heurística 1, visibilidade do
  estado do sistema). Os números: `first_pressed_ms = 4000` em **6 de 6** cliques na W1 e em 2 de 2 no master, e um
  `curl` na página `?interval=1h` levou `3.64 s` `[MEDIDO: tfclick.mjs, n=6 + 2]`. Numa das capturas (1920, `1h`),
  a troca **ainda não tinha pousado em 6 s**. O PNG `W1-DR2-1920x1080-1h.png` mostra o `1m` aceso com o dado de `1m`.
  Conserto: estado pendente no botão clicado (`aria-busy` com indicador), ou uma troca otimista do botão com um
  esqueleto no plot.
- **SF-12 (sev. 2, anterior à W1 `[INFERRED: nem a W1 nem o master têm fixRightEdge, pelo git grep]`):** o arrasto
  deixa rolar **para além da última vela**, até o vazio: nenhuma vela, **nenhum rótulo de tempo**. O PNG
  `W1-DR2-1920x1080-1m-back-to-edge.png` mostra o fim da sequência do `drag3`. O `T` e as legendas ficam certos,
  então não há dado perdido. Mas a tela não oferece caminho de volta, e isso é a saída (c) da r1, que ninguém
  implementou: um "ir para o agora" visível quando a borda sai da vista, ou `fixRightEdge` / um `rightOffset`
  limitado.

## 5. O que continua aberto, conferido no pixel novo

| item | estado agora | medida |
|---|---|---|
| SF-8: numeral com ruído de ponto flutuante | **aberto** | `14315336.490699999`, `60777.34220000001`, `2851.2434000000003`, `420.30800000000005` (sweep e repouso, nos 4 TFs) |
| SF-9: o `sr-only` diz `SEM_PONTO` | **aberto** | 7 nós em `4h`/`15m`, 6 em `5m`, 2 em `1m` (`"Leitura atual: SEM_PONTO…"`) |
| SF-10: caixas "COBERTURA PARCIAL" sobre o plot | **aberto** | em `4h`/`15m`, 4 caixas. As barras da liquidação long ainda cortam "Liquidação de posições compradas (long)" (PNG `4h-hover`) |
| SF-3: dobra | **aberto** | `scrollHeight = 1081` em todos os estados |
| SF-6: caixa "Últimas 4 h" cortada | **aberto** | "Últi" / "Últim" a 1920 |
| E-2: 404 do ao vivo | **aberto** | 30 respostas `404` por página, todas em `:8837/?…` |
| E-3: vela de 1 px em `4h` | **aberto** | PNG `W1-DR2-1920x1080-4h.png`: 24 traços de 1 px separados por ≈120 px |
| E-4: "DADO VELHO" falso em TF ≠ `1m` | **aberto** | `4h`: *"há 3 h 54 min … DADO VELHO"*. `1h` a 1280: *"há 54 min"*, com 1 alerta. A família do MF-B, que o W1-FIX não tocou |
| E-5: título "(1m, …)" em qualquer TF | **aberto** | os 6 títulos iguais nos 5 TFs |

## 6. Pontuação, pelos 10 domínios da skill

| domínio | W1 r1 | W1 r2 | uma linha |
|---|---|---|---|
| Heuristic Compliance | 5 | 6 | O arrasto não mente mais sobre o `T`, e o preço lê em todo TF. Seguem: o volume `ausente` falso, o DADO VELHO falso em `4h`/`1h`, e 4 s sem sinal no TF (SF-11) |
| Research Foundation | 6 | 6 | O `e2e/27` passou a medir a retenção da borda. A legenda do volume em TF ≠ `1m` segue sem teste nenhum |
| Mobile Experience | 3 | 3 | Fora do alvo |
| Desktop Experience | 5 | 6 | O arrasto preserva o dado. A vela de `4h` segue ilegível (E-3) |
| Visual Design | 6 | 6 | SF-10 e SF-8 sem mudança |
| Accessibility | 6 | 6 | SF-9 sem mudança |
| Interaction Design | 4 | 6 | Arrasto e crosshair do preço corretos. O TF não tem estado pendente (SF-11), e o rolar para o vazio não tem volta (SF-12) |
| Future-Readiness | 6 | 6 | Sem mudança |
| System Architecture | 7 | 7 | O teto virou `max(teto, seed + 1 página)`. A legenda do volume lê num espaço de índice diferente do das outras 7 |
| Ethics & Content | 5 | 6 | Sumiram 7 negativas falsas. Ficam o volume e o alarme de idade em `4h` |

**Média: 58/100** `[MEDIDO: 6+6+3+6+6+6+6+6+7+6 = 58, /10 = 5,8]`. Sem o Mobile, fica em **6,11** (55/9).

**Pontos fortes:** (1) o `T` e a idade agora sobrevivem a qualquer gesto, com mutação que morde. (2) O preço lê a
barra do TF, em repouso e sob o crosshair, e bate com o eixo. (3) A linguagem de integridade (cobertura, terceiro,
procedência) continua honesta e visível.

**Roteiro.** *Rápido (< 1 dia):* MF-B′ (levar o slot do volume para o mesmo espaço de índice, mais um e2e com dado
em TF ≠ `1m`), SF-8, SF-9. *Médio (1–5 dias):* SF-11 (estado pendente do TF), SF-12 (ir para o agora), E-4 (idade
na régua do TF), SF-10. *Estratégico:* E-3 (largura da vela por duração, decisão da `ADR-044`).

## 7. Reprodução da latência do TF (SF-11), só GET

```js
// node tfclick.mjs [base]  — samples pressed button / url / T every 500 ms for 15 s after a TF click.
import { chromium } from "<frontend>/node_modules/playwright/index.mjs";
const BASE = process.argv[2] ?? "http://127.0.0.1:4337"; const b = await chromium.launch(); const out = [];
for (const tf of ["1h", "4h", "15m", "5m", "1h", "4h"]) {
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto(`${BASE}/symbol/BTCUSDT`); await p.locator(".tv-lightweight-charts").first().waitFor(); await p.waitForTimeout(6000);
  await p.locator(`[data-testid="timeframe-button-${tf}"]`).click(); const s = [];
  for (let i = 0; i < 30; i++) { await p.waitForTimeout(500); s.push(await p.evaluate(() => ({
    pressed: document.querySelector('[aria-pressed="true"]')?.textContent?.trim(), url: location.search }))); }
  const k = s.findIndex((x) => x.pressed === tf); out.push({ tf, first_pressed_ms: k < 0 ? null : (k + 1) * 500 }); await p.close();
}
await b.close(); console.log(JSON.stringify(out));   // W1 and master: 4000 ms in every click
```

## 8. Falsificador deste veredito

O NEEDS_FIX cai para **APPROVED WITH CONDITIONS** (SF-8…SF-12, E-2…E-5 como condição) se, no mesmo app e com dado
real, as duas coisas valerem juntas:

1. em `4h` e `15m`, parado, a legenda do volume mostra a soma da última barra fechada, e sob o crosshair ela lê
   valor em todo x com barra desenhada. A prova é a **mutação**: tirar o conserto faz o `ausente` voltar;
2. os itens 1 e 2 do §2 continuam passando.

Se o volume ler valor e o número **não** for a soma que a API serve para aquela barra, o defeito mudou de nome
(de ausência falsa para leitura errada) e continua reprovando.
