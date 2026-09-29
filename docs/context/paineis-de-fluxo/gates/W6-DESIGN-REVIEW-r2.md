# W6-DESIGN-REVIEW-r2: `ux-ui-mastery:design-review` do `/symbol` no HEAD da wave `paineis-f03b`, depois do W6-QA-FRONT-FIX e do W6-QA-FRONT-r2

**Veredito: APPROVED WITH CONDITIONS. Nota 64/100**, a mesma do r1 (`W6-DESIGN-REVIEW.md`, `ef2ff95`). O item 1 do
falsificador do r1 disparou: `frontend/src` mudou. Por isso recapturei o app no HEAD, com dado real e um export novo, e
rodei de novo o falsificador inteiro. Os itens 2 a 4 não dispararam: `legsolid` passa nas 9 cenas com o controle positivo
mordendo (38), a 1ª linha de regra e faixa é `pane_top + data-legend-bottom-px` em todas as cenas com regra, CA-7 dá 53/53
e a ablação dá 0 tinta de vela. A mudança em `frontend/src` é **só de teste** (2 arquivos `*.test.ts`, +23/−0), e nada
dela entra no bundle. Há uma observação nova de conteúdo, de severidade 1 e herdada da 03a (OBS-W6-r2-1, §4). Há também
um **incidente de dado fora do design** (§3): a ingestão parou às 23:07Z, e o orquestrador precisa saber disso.

```
Feature: paineis-de-fluxo · Wave: W6 (paineis-f03b, T-03.8..T-03.14) · portão: design-review r2 (§4 das regras de despacho)
HEAD revisado: 1c95f62 (wave/paineis-f03b) · laudo anterior: gates/W6-DESIGN-REVIEW.md (ef2ff95)
Captura 2026-09-28 01:01–01:20 UTC · portas 8847 (proxy) / 4347 (app)
```

## 1. O que mudou desde o r1, e por que recapturei

| medida | resultado |
|---|---|
| `git diff --quiet ef2ff95 HEAD -- frontend/src` | **rc=1**: o item 1 do falsificador do r1 **disparou** |
| `git diff --numstat ef2ff95 HEAD -- frontend/src` | `oi-candle-pane.test.ts` +13/−0 e `oi-regime-marks.test.ts` +10/−0 |
| `git diff --name-only ef2ff95 HEAD -- frontend/src \| grep -vc '\.test\.ts$'` | **0**: nenhum arquivo de produção mudou |
| `diff -rq` entre a `src` da árvore do r1 e a do HEAD | as mesmas 2 diferenças, e nenhuma outra |
| commits de `ef2ff95..HEAD` que tocam `frontend/` | `e369418` (instrumento do `e2e/38` + teste do U2) e `41f1555` (testes U9/U15 + vista de reentrada no `e2e/38`) |

`[MEDIDO 2026-09-28 na worktree wave-paineis-f03b]`

A regra de despacho deixava reaproveitar os screenshots se `frontend/src` não tivesse mudado. Ele mudou, então
recapturei. O r1 escreveu o falsificador em termos de `frontend/src`, e ler "só teste" como "não mudou" seria trocar a
medida pelo meu julgamento. Na captura, o pixel confirma o que o diff diz (§2).

| peça | como |
|---|---|
| app | `git archive 1c95f62 frontend` numa árvore **isolada** (`$SP/w6dr2/tree`, com `node_modules` por hard link da árvore do r1). `INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8847 next build` rc=0, e depois `next start -H 127.0.0.1 -p 4347`. O `.next` da worktree da wave não foi tocado |
| dado | o mesmo proxy híbrido **só leitura** do r1 (`real-proxy.py`, cópia de `gates/T-03.13-real-proxy.py.txt`, porta 8847), rodado com o `backend/` da wave. O backend não mudou desde `ef2ff95` (`git diff --stat ef2ff95 HEAD -- backend/src` sai vazio). O export novo de `md.series` saiu com `default_transaction_read_only=on`, `lock_timeout=3000`, os mesmos 8 ids e `bucket_end ≥ 2026-09-22`: 13.391 linhas, sha256 `1211bfc949fc2830…`, `max(bucket_end)` 23:07Z, exportado às 01:01:22Z. Contador final do proxy: `passthrough_get 740, local_oi 69, refused 1` `[MEDIDO: proxy.log]`. O único refused é o **meu** `POST` de prova (405), feito antes da captura. **Nenhum INSERT, nenhum seed** |
| captura geral | `cap.mjs` do r1 (derivado de `gates/T-01.11-r2-capture.mjs.txt`), só com o caminho do Playwright mudado. As mesmas 8 cenas, mais crosshair a 70 % e as paradas de Tab |
| bancada do r2 | `oicap.mjs`, `oipx.py`, `legsolid.py` e `ca7.py`, sem alteração, sobre as 9 cenas de [`T-03.14-evidence/scenes.txt`](T-03.14-evidence/scenes.txt). Mais 2 cenas a 1280×800 (`p1280.sh` do r1) e **3 novas a 1100 de largura**, mais uma varredura de 5 larguras (§2.1) |
| evidência | `$SP/w6dr2/{cap,scap,s1280,s1100,wrap}`, `oipx-facts.jsonl`, `legsolid.jsonl`, `measure.sh`, `cmp.py`, `wrap.mjs` e `p1100.sh`, com `SP=/tmp/claude-1002/-home-stharley-Documentos-projects-cripto-strategy/854f12b5-43c8-425a-9856-b6679093c941/scratchpad`. Não versionada, pelo §4 das regras (o portão commita só o laudo) |

## 2. O falsificador do r1 (§6), rodado inteiro no HEAD

| item do r1 §6 | limiar | **r2 (`1c95f62`, export 01:01Z)** |
|---|---|---|
| `frontend/src` igual a `ef2ff95` | `rc=0` | **rc=1, só `*.test.ts`** (§1). Por isso a recaptura |
| regra: maior trecho vertical na legenda ≤ controle de texto | por cena | `1m-live` 0 ≤ 5 · `1m-entry` 1 ≤ 2 · `5m-entry` 1 ≤ 1 · `15m-island` 0 ≤ 2 e 1 ≤ 9 · `ablation` 0 ≤ 2 |
| faixa: px em trechos ≥ 3 dentro de `[pane_top, legend_bottom)` | `= 0` | **0 em 9/9** (maior trecho na legenda: 2 px) |
| 1ª linha de regra e faixa = `pane_top + data-legend-bottom-px` | 653 | **653 em 5/5 cenas com regra** (6 regras). A faixa aparece inteira logo abaixo: 150, 854, 911, 23, 145, 612 e 1528 px |
| controle positivo (PNG do `T-03.14` r1, `btc-1m-entry`) | ≥ 38 linhas | **38** → o instrumento enxerga |
| CA-7, cor × `sinal(C − O)` | 53/53 | **53/53** (28 `point_5m`, 25 `poll_1m`), 0 `no_ink`, 0 `bad` `[ca7.py]` |
| DoD-6, ablação `e2eOiLine=1` | 0 tinta de vela | **0/0** up/down, contra 543/564 na mesma cena sem ablação |
| Q-2, fundo dentro × fora da faixa | `(30,34,48)` × `(19,23,34)` | **igual** nas 7 cenas que têm faixa |

`[MEDIDO: measure.sh = oipx.py + legsolid.py + ca7.py sobre $SP/w6dr2/scap, n=9 cenas; legenda = linhas 615–652]`

A 1280×800, as 2 cenas do `p1280.sh` dão regra com trecho 0 e 3, contra controles de 3 e 3. A faixa dá 0 e a 1ª linha
é 653 `[MEDIDO: $SP/w6dr2/s1280]`.

### 2.1 Legenda que quebra linha: o item do r1 foi medido com mais linhas do que antes

O r1 fixou *"o `data-legend-bottom-px` a 1280×800/`1m` acompanha a legenda em 3 linhas (hoje 54)"*. Com o dado de agora
isso **não se reproduz a 1280**: o OI está *"ausente"* na vista padrão (§3), a legenda fica mais curta e ocupa 2
linhas, então o valor é **38**. Esse 38 é o render, não uma regressão. Por isso medi a mesma propriedade onde a legenda
quebra agora:

| largura (`1m`, ao vivo) | `data-legend-bottom-px` | fundo do bloco da legenda (`getBoundingClientRect`, relativo ao pane) |
|---|---|---|
| 1600 | 38 | 38 |
| 1280 | 38 | 38 |
| 1100 | **70** | **70** |
| 1000 | 70 | 70 |
| 900 | 70 | 70 |

`[MEDIDO: wrap.mjs, n=5 larguras, scroll horizontal 0 em todas]`. A 390, o valor foi de 120 (r1) para **152**, com
`reserve overflow`: o atributo acompanha o texto mais longo.

**Com a legenda em 4 linhas (70 px) e uma regra na janela** (`p1100.sh`, 1100×1000, `1m`/`5m` entry), o trecho da regra
dá 0 e 1, contra controles de 3 e 5. A faixa dá 0 e a **1ª linha é 685 = 615 + 70** nas duas cenas
`[MEDIDO: $SP/w6dr2/s1100]`. É o caso que o r1 **não** mediu (a 1280 ele não tinha regra com a legenda em 3 linhas), e
agora está medido com uma linha a mais.

## 3. O que a tela mostra, no HEAD (dado real)

- **Leitura geral (1600×1200, `1m`):** a hierarquia é a do r1. No pane de OI, a faixa *"amostras 5m"* fica à esquerda,
  com a regra e *"amostras 1m"*. Com o crosshair, a legenda diz `O … H/L não medidos C …` e `DERIVADO (OHLC de amostras 1m
  · ADR-045)`, sem marca de canvas por cima. Tipografia e contraste, nas 8 cenas: menor corpo 11 px, menor contraste
  5,01:1, scroll horizontal 0, 12 paradas de Tab a 1600 (mesmo ciclo do r1), 3 × `404` herdados (E-2) `[MEDIDO: cmp.py]`.
- ⚠️ **Incidente de dado, fora do design: a ingestão está parada desde 23:07Z.** Às 01:04Z, `max(bucket_end)` do OI de
  BTCUSDT é 23:07Z (`/fapi/v1/openInterest`) e 23:05Z (`openInterestHist`). A consulta foi só leitura, com
  `default_transaction_read_only=on`. `deploy-collector-1` foi reiniciado às 23:07:39Z (`RestartCount=2`), e o fim do log
  mostra `OSError: [Errno 9] Bad file descriptor` no stream `forceOrder` com `verdict=REJECTED`
  `[MEDIDO: docker inspect + docker logs --since 3h]`. **Não investiguei a causa, porque não é superfície deste portão.
  Dono: o orquestrador.** O que a tela faz com isso é design, e está certo quase tudo: preço, liquidação e CVD dizem
  *"ausente"* em T = 00:54Z. O OI diz *"Última leitura há 1 h 44 min … teto desta série: 10 min. ⚠️ … DADO VELHO"*, e o
  long/short diz *"Idade da última observação: 1 h 48 min"*. É H1 cumprida em dado ruim, sem interpolar nada.
- **OBS-W6-1 continua igual:** a `15m`, a faixa de 1 bucket depois do buraco de 11:30Z segue como duas regras a ~5 px uma
  da outra, sem rótulo (`rg-labels` 3 para 4 faixas; 4 de 4 a `4h`) `[MEDIDO: cmp.py; W6-1600x1200-15m-oi.png]`.
- **Herdados e iguais, sem piora:** E-2, E-3 (vela de 1 px a `4h`), E-4 e a legenda que invade o plot a 390.

## 4. Condições (não reprovam; vão para o dono)

- **C-1 = SF-19 (sev. 2, `web`):** a direção do candle de OI é dada só pelo matiz (WCAG 1.4.1). Igual.
- **C-2 = SF-20 (sev. 2, `web`):** de `15m` em diante a vela vira um palito de 1 px. Igual.
- **C-3 = SF-21 (sev. 1, `web`):** na ilha de `15m`, a vela fica colada na regra. Igual.
- **C-4 (`ui-designer`):** a reescrita de DG-2 para *"a altura do pane sob a legenda"* continua pendente.
- **OBS-W6-1 (sev. 1, `web`, família de C-3):** igual ao r1, com a mesma recomendação (uma faixa mais estreita que o
  rótulo vira uma regra só, ou um tique).
- **OBS-W6-r2-1 (NOVA, sev. 1, `web`, herdada da 03a):** a frase de dado velho do OI diz *"o valor acima é DADO VELHO"*
  (`SymbolClient.tsx:2203`, que entrou em `01057b3`, T-03.5/T-03.6, 2026-09-12). Ela contradiz a tela em dois estados que
  o incidente deixou visíveis. **(a)** Em repouso, a linha logo acima diz `O ausente H ausente L ausente C ausente`: não
  há valor acima, e o único número é o rótulo do eixo (94362.78). **(b)** Com o crosshair, o "valor acima" é o candle
  histórico apontado (por exemplo `O 94908.746 … C 94909.049`), que não é velho: é o fato daquele instante. É H2/H4 (a
  palavra aponta para o que não está lá), e não é regressão da 03b: a string não foi tocada na wave. **Recomendação ao
  `ui-designer`:** nomear o objeto (*"a última leitura (… ) é DADO VELHO"*) em vez de apontar para uma posição. Isso vai
  com o próprio design gate, e não como fix desta wave.
- **Fora do design, para o orquestrador:** (i) o incidente de ingestão do §3. (ii) O `D-1` do `W6-QA-BACK-r2`
  (`D2-bis` na borda esquerda de uma janela `1m`) pode trocar o regime de **um** bucket na borda esquerda de uma janela
  `1m`. **Não medi** isso no pixel: as 9 cenas não enquadram esse caso, e ele é defeito de servidor, não de design.
- **Herdadas da W5, iguais:** SF-16, SF-17, SF-18, OBS-W5-1 e a caixa *"Últimas 4 h"*. `CA-12`, a metade Stitch: dono é
  o orquestrador.

## 5. Pontuação, pelos 10 domínios da skill

| domínio | W6 r1 | **W6 r2** | uma linha |
|---|---|---|---|
| Heuristic Compliance | 7 | **7** | H1 cumprida com o dado parado (idade e teto visíveis). OBS-W6-1 e OBS-W6-r2-1 são ruído pequeno |
| Research Foundation | 7 | **7** | export novo, 9+2+3 cenas, controle positivo, CA-7 refeito, varredura de largura. Sem teste com operador |
| Mobile Experience | 3 | **3** | fora do alvo. A legenda invade o plot a 390 (agora 152 px) |
| Desktop Experience | 7 | **7** | densidade de terminal; a `15m`+ a vela se perde (C-2) |
| Visual Design | 7 | **7** | nenhuma marca cruza a legenda, nem com 4 linhas (70 px) |
| Accessibility | 6 | **6** | contraste ≥ 5,01:1 e corpo ≥ 11 px; direção só por matiz (C-1) |
| Interaction Design | 6 | **6** | crosshair e legenda de largura fixa; TF fora da ordem de Tab (herdado) |
| Future-Readiness | 6 | **6** | `data-oi-regime-*` e `data-legend-bottom-px` deixam a propriedade auditável |
| System Architecture | 8 | **8** | a borda vem do render; medido de 38 a 70 px, e ela acompanha |
| Ethics & Content | 7 | **7** | `H/L não medidos` e `DADO VELHO` em vez de número inventado; a frase aponta para o lugar errado (OBS-W6-r2-1) |

**Média: 64/100** `[MEDIDO: 7+7+3+7+7+6+6+6+8+7 = 64]`. Radar: `[7, 7, 3, 7, 7, 6, 6, 6, 8, 7]`.

**Top 3 forças.** (1) A reserva da legenda é lida do render e segue 38 → 70 → 152 px sem que nenhuma marca a cruze. (2) A
tela é honesta com o dado parado: *"ausente"*, a idade e o teto, sem interpolar. (3) Uma gramática de candle só, com o
regime e a amostragem visíveis sem hover.

**Roteiro.** *Quick wins (menos de 1 dia):* C-4, reescrever DG-2 (`ui-designer`). OBS-W6-r2-1, trocar *"o valor acima"*
por um sujeito explícito (1 string, `SymbolClient.tsx:2203`). *Médio (1 a 5 dias):* OBS-W6-1 (a faixa estreita vira uma
regra só) e C-3. *Estratégico (1 semana ou mais):* C-1, a direção sem depender só da cor, e C-2, a forma de vela em TF
largo.

## 6. Falsificador deste veredito

Este APPROVED WITH CONDITIONS cai se, antes do merge da wave, qualquer um destes acontecer:

- `git diff --name-only 1c95f62 HEAD -- frontend/src | grep -vc '\.test\.ts$'` deixar de dar **0**. Isto é, se mudar um
  arquivo de produção. Mudança só de teste não derruba, e agora isso está escrito aqui, antes do fato, e não decidido
  depois;
- `legsolid.py` sobre as 9 cenas de `scenes.txt` der trecho vertical de regra na legenda maior que o controle da cena, ou
  qualquer px de faixa em trecho ≥ 3 dentro de `[pane_top, legend_bottom)`. Isso só conta enquanto o controle positivo
  continuar dando ≥ 38;
- a 1ª linha da regra sair de `pane_top + data-legend-bottom-px`, a 1600 (653) ou a 1100 com a legenda quebrada
  (`615 + data-legend-bottom-px`, hoje 685);
- `ca7.py` sair de 53/53, ou a ablação `e2eOiLine=1` deixar qualquer tinta de vela.

Não há `gate-record` neste laudo: quem grava é o orquestrador (§4 das regras de despacho).
