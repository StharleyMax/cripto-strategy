# W6-DESIGN-REVIEW-r3: `ux-ui-mastery:design-review` do `/symbol` no HEAD da wave `paineis-f03b`, depois do W6-FIX, do W6-QA-BACK-r3 e do W6-QA-FRONT-r3

**Veredito: APPROVED WITH CONDITIONS. Nota 64/100**, a mesma do r2 (`W6-DESIGN-REVIEW-r2.md`, `1c95f62`). O item 1 do
falsificador do r2 **não disparou**: `frontend/src` é o mesmo byte a byte. O que mudou foi o `backend/src` (o conserto do
`D-1`/`D2-bis` em `20e01b4`), e esse backend é o que gera o candle de OI que o proxy serve à página. Por isso recapturei
tudo com o backend do HEAD em vez de reaproveitar os PNG do r2. Também repeti cada requisição de OI que a página fez
contra o backend do r2, sobre o mesmo export. Deu **235 de 235 envelopes idênticos**. O falsificador do r2 rodou inteiro
e não disparou. A diferença que aparece no pixel vem de o relógio ter andado 12 h 35 min, e não do código (§3). Há uma
observação nova, de severidade 1 e sem regressão: OBS-W6-r3-1 (§4).

```
Feature: paineis-de-fluxo · Wave: W6 (paineis-f03b, T-03.8..T-03.14) · portão: design-review r3 (§4 das regras de despacho)
HEAD revisado: 6c4014b (wave/paineis-f03b) · laudo anterior: gates/W6-DESIGN-REVIEW-r2.md (1c95f62)
Captura 2026-09-28 13:27–13:55 UTC · portas 8847 (proxy HEAD) / 8848 (proxy do backend 1c95f62, só para o replay) / 4347 (app)
```

## 1. O que mudou desde o r2, e por que recapturei mesmo assim

| medida | resultado |
|---|---|
| `git diff --quiet 1c95f62 HEAD -- frontend/src` | **rc=0**: o item 1 do falsificador do r2 **não disparou** |
| `diff -rq $SP/w6dr2/tree/frontend/src <worktree>/frontend/src` | **rc=0**, sem nenhuma linha. A árvore do build do r2 é o `src` do HEAD |
| `git diff --numstat 1c95f62 HEAD -- backend/src` | `oi_candle_regimes.py` +20/−3 e `series_history.py` +98/−5 (o W6-FIX do `D-1`) |
| `git diff --stat 1c95f62 HEAD -- frontend/` | só `e2e/38-oi-candle-acceptance-per-bucket.spec.ts` (+42), teste |

`[MEDIDO 2026-09-28 na worktree wave-paineis-f03b]`

A regra de despacho permitia reaproveitar os screenshots, porque `frontend/src` não mudou. Não reaproveitei. O proxy do
r2 responde o OI com a **função de rota da própria worktree** (`build_series_history_report`), então a mudança de backend
chega ao pixel sem passar por `frontend/src`. Reaproveitar os PNG seria aprovar o candle de um backend que não é o do HEAD.

| peça | como |
|---|---|
| app | o **mesmo build** do r2 (`$SP/w6dr2/tree/frontend`, `src` idêntico ao HEAD pelo `diff -rq` acima), com `next start -H 127.0.0.1 -p 4347` e `INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8847`. A worktree da wave não foi tocada: `git status --short` sai vazio |
| dado | o proxy híbrido **só leitura** do r2 (`real-proxy.py`, cópia de `gates/T-03.13-real-proxy.py.txt`). A única mudança é que ele loga o caminho inteiro, e não só 160 caracteres. Rodou com o `backend/` do HEAD, com `PYTHONPYCACHEPREFIX` num diretório novo, para não ler `__pycache__` velho. Export novo de `md.series` com `default_transaction_read_only=on` (o `SHOW` devolveu `on`) e `lock_timeout=3000`, os mesmos 8 ids e `bucket_end ≥ 2026-09-22`: **13.391 linhas, sha256 `1211bfc949fc2830…`, igual ao do r2**, porque a ingestão continua parada (§3). Contador final: `passthrough_get 366, local_oi 294, refused 1`. O refused é o **meu** `POST` de prova (405). **Nenhum INSERT, nenhum seed** |
| replay | o backend de `1c95f62` (`git archive`) num proxy igual na 8848, sobre o mesmo CSV. `replay.py` repete **toda** requisição de OI que a página fez na captura (235 caminhos únicos) nos dois backends e compara o envelope inteiro, menos `server_now_ms` |
| bancada | `oicap.mjs`, `oipx.py`, `legsolid.py`, `ca7.py`, `cap.mjs`, `p1280.sh`, `p1100.sh` e `wrap.mjs` do r2, sem alteração de lógica. As 9 cenas de [`T-03.14-evidence/scenes.txt`](T-03.14-evidence/scenes.txt), mais 2 a 1280×800, mais 2 a 1100×1000, a varredura de 5 larguras e a captura geral (8 cenas, crosshair a 70 % e as paradas de Tab) |
| evidência | `$SP/w6dr3/{cap,scap,s1280,s1100,wrap}`, `oipx-facts.jsonl`, `legsolid.jsonl`, `measure.out`, `cmp.out`, `replay.out`, `sweep.out`, `sweep2.out` e `proxy-capture.log`, com `SP=/tmp/claude-1002/-home-stharley-Documentos-projects-cripto-strategy/854f12b5-43c8-425a-9856-b6679093c941/scratchpad`. Não versionada, pelo §4 das regras (o portão commita só o laudo) |

## 2. O falsificador do r2 (§6), rodado inteiro no HEAD

| item do r2 §6 | limiar | **r3 (`6c4014b`, export 13:26Z)** |
|---|---|---|
| `git diff --name-only 1c95f62 HEAD -- frontend/src \| grep -vc '\.test\.ts$'` | `0` | **0** (o diff é vazio) |
| regra: maior trecho vertical na legenda ≤ controle de texto | por cena | `1m-entry` 1 ≤ 5 · `5m-entry` 1 ≤ 2 · `15m-island` 1 e 4 ≤ 5. As outras 6 cenas não têm regra na tela (§3) |
| faixa: px em trechos ≥ 3 dentro de `[pane_top, legend_bottom)` | `= 0` | **0 em 9/9** (maior trecho na legenda: 2 px) |
| 1ª linha de regra e faixa = `pane_top + data-legend-bottom-px` | 653 | **653 nas 3 cenas com regra** (4 regras) |
| a 1100, com a legenda em 4 linhas | `615 + 70 = 685` | **685 nas 2 cenas** (`1m`/`5m` entry). Regra 1 e 1, contra controles de 1 e 5. Faixa 0 |
| controle positivo (PNG do `T-03.14` r1, `btc-1m-entry`) | ≥ 38 linhas | **38**, então o instrumento enxerga |
| CA-7, cor × `sinal(C − O)` | 53/53 | **53/53** (28 `point_5m`, 25 `poll_1m`), 0 `no_ink`, 0 `bad` |
| DoD-6, ablação `e2eOiLine=1` | 0 tinta de vela | **0/0** up/down, contra **391/439** na mesma cena sem ablação |
| Q-2, fundo dentro × fora da faixa | `(30,34,48)` × `(19,23,34)` | **igual** nas 5 cenas que têm faixa na tela |

`[MEDIDO: measure.sh = oipx.py + legsolid.py + ca7.py sobre $SP/w6dr3/scap, n=9 cenas; p1100.sh e p1280.sh]`

A 1280×800: `1m-entry` dá regra 0 contra controle 0, e `5m-entry` dá 3 contra controle 1. Os dois têm faixa 0 e 1ª linha
653. O 3 > 1 **não é item do falsificador**: o falsificador do r2 fala das 9 cenas de `scenes.txt`, e a 1280 era bancada
auxiliar. Mesmo assim fui ao pixel. A regra começa na linha 653, abaixo da legenda. Os 3 px dentro da legenda estão na
coluna 718 e são traço de glifo cinza do texto, e não a regra: a regra, quando existe, é contínua de 653 até a base do
pane. O r2 teve 3 contra controle 3 na mesma cena. Registro para o próximo portão não reler isso como regressão.

**Varredura de largura** (`wrap.mjs`, `1m` ao vivo): 1600 → 38, 1280 → 38, 1100 → 70, 1000 → 70, 900 → 70. Em todas,
`data-legend-bottom-px` é igual ao fundo do bloco da legenda medido por `getBoundingClientRect`, e o scroll horizontal é 0.
Os números são os mesmos do r2. `[MEDIDO: wrap/wrap.jsonl, n=5]`

### 2.1 O `D-1` no pixel: o que o r2 deixou como NÃO MEDIDO

O r2 (§4, "Fora do design", ii) registrou que o `D-1` podia trocar o regime de **um** bucket na borda esquerda de uma
janela `1m`, e que isso não tinha sido medido no pixel. Agora está medido, em duas partes.

| medida | universo | resultado |
|---|---|---|
| `replay.py`: toda requisição de OI que a página fez na captura r3, backend HEAD × backend `1c95f62` | **235** caminhos únicos (9 cenas + 1280 + 1100 + largura + captura geral) | **235 idênticos, 0 diferentes** |
| `sweep.py`: janelas `1m` de 3 h com início **fora** da grade de 5 min (o gatilho do `D-1`), `k = 0..9` min após 4 âncoras reais, BTC e ETH, os 2 ids | **160** janelas | **0 diferentes** |
| `sweep2.py`: o mesmo, com as âncoras na borda do buraco de polling de `09-27T00:22Z` (677 min) | **80** janelas | **0 diferentes** |

`[MEDIDO: replay.out, sweep.out, sweep2.out; o proxy da 8848 roda um series_history.py com 0 ocorrências de
_poll_anchors_left_of_window, e o do HEAD com 3]`

Leitura: **sobre o dado real, a página que o operador vê é a mesma com e sem o conserto.** O `D-1` é real, e o
`W6-QA-BACK-r3` o mata em teste sintético (N1 mata 5 testes). Mas nenhuma janela deste universo, nem as que a página
pede, o dispara. `[NÃO SEI]` se existe no dado real alguma janela que o dispare. Esta bancada não tem controle positivo
para o `D-1`, porque não achei no export uma janela em que os dois backends divergem. Então "0 diferentes" prova que o
pixel de hoje não mudou, e **não** prova que o instrumento enxergaria o `D-1`. O dono da prova de sensibilidade é o
`W6-QA-BACK-r3`, e não este portão.

## 3. O que a tela mostra, no HEAD (dado real)

- ⚠️ **A ingestão continua parada.** Às 13:26Z, `max(bucket_end)` do OI de BTCUSDT ainda é 23:07Z (`/fapi/v1/openInterest`)
  e 23:05Z (`openInterestHist`) de 09-27, pela consulta só leitura. O `deploy-collector-1` está `Up 14 hours`, mas não
  grava nada. O `W6-QA-BACK-r3` já atribui isso ao idle-in-transaction da API (3ª ocorrência, conserto `83e7a78` não
  implantado). **Não é superfície deste portão. Dono: o orquestrador.** Por causa disso o export tem o mesmo sha256 do r2,
  e o que muda entre r2 e r3 é só o relógio: o fecho da janela foi de 00:54Z para 13:29Z.
- **O que o relógio muda na tela, e está certo:** a vista padrão (`1m`, 1600) agora abre com **14 h** de vazio à direita.
  Preço, liquidação e CVD dizem *"ausente"*. O OI diz *"Última leitura há 14 h 19 min … teto desta série: 10 min. ⚠️ … DADO
  VELHO"*, o long/short diz *"Idade da última observação: 14 h 23 min"*, e *"Ao vivo"* diz *"indisponível"* nas três séries.
  É H1 cumprida sob dado ruim, sem interpolar e sem esticar a última vela. A janela andou, então a transição de regime de
  `09-26T03:00Z` saiu da vista padrão: `data-oi-regime-bands` 3 → 2, e as faixas e a regra existem no dado carregado mas
  estão fora da tela. Por isso 6 das 9 cenas não têm regra visível. `data-oi-candles` foi de 2290 para 2178, porque há
  menos dado real dentro da janela.
- **Tipografia, contraste e teclado, nas 8 cenas da captura geral:** menor corpo 11 px, menor contraste 5,01:1, scroll
  horizontal 0, 12 paradas de Tab a 1600 (o mesmo ciclo do r2) e os 3 × `404` herdados (E-2). Tudo igual ao r2
  `[MEDIDO: cmp.out]`.
- **OBS-W6-1 continua igual:** a `15m`, a faixa estreita depois do buraco (colunas 886–910) segue como duas regras sem rótulo.
  A `4h`, 4 faixas dão 3 rótulos (no r2 eram 4 de 4), porque a janela andou e a faixa da esquerda saiu da tela.
- **Herdados e iguais, sem piora:** E-2, E-3 (vela de 1 px a `4h`, visível em `W6-1600x1200-4h-oi.png`), E-4 e a caixa
  *"Últimas 4 h"*.

## 4. Condições (não reprovam; vão para o dono)

- **C-1 = SF-19 (sev. 2, `web`):** a direção do candle de OI é dada só pelo matiz (WCAG 1.4.1). Igual.
- **C-2 = SF-20 (sev. 2, `web`):** de `15m` em diante a vela vira um palito de 1 px. Igual.
- **C-3 = SF-21 (sev. 1, `web`):** na ilha de `15m`, a vela fica colada na regra. Igual.
- **C-4 (`ui-designer`):** a reescrita de DG-2 para *"a altura do pane sob a legenda"* continua pendente.
- **OBS-W6-1 (sev. 1, `web`):** igual ao r2.
- **OBS-W6-r2-1 (sev. 1, `web`, herdada da 03a):** *"o valor acima é DADO VELHO"* (`SymbolClient.tsx:2203`) continua
  apontando para uma posição onde, em repouso, só há `ausente`. Igual.
- **OBS-W6-r3-1 (NOVA, sev. 1, `web`, sem regressão):** com uma vista de **um regime só**, nada em repouso diz qual é o
  regime. O cabeçalho diz `Open Interest (5m, BTC)` (`identityTerms(legends.oi)`, `SymbolClient.tsx:2664`), que é a grade
  nativa da série de histórico. Mas toda vela na vista padrão de hoje é `binance_poll_1m`: `data-oi-regime-labels` sai
  vazio, e o crosshair diz *"DERIVADO (OHLC de amostras 1m)"*. No r2 os rótulos *"amostras 5m / amostras 1m"* estavam na
  tela e resolviam a ambiguidade. Agora o único nome de grão visível em repouso é `5m`, e ele não descreve a vela. É H2 e
  H4 (consistência entre o que o título diz e o que a vela é). O código não mudou: o dado parado e a janela andada só
  deixaram o caso visível. **Recomendação ao `ui-designer`:** quando a vista não tem transição, mostrar o rótulo do regime
  único (um *"amostras 1m"* na borda esquerda do plot), ou fazer o cabeçalho dizer o grão da vela e não o da série nativa.
  Vai com o design gate da própria mudança, e não como fix desta wave.
- **Fora do design, para o orquestrador:** o incidente de ingestão do §3, que é o mesmo do `W6-QA-BACK-r3` e da T-03.7.
- **Herdadas da W5, iguais:** SF-16, SF-17, SF-18, OBS-W5-1 e a caixa *"Últimas 4 h"*. `CA-12`, a metade Stitch: dono é
  o orquestrador.

## 5. Pontuação, pelos 10 domínios da skill

| domínio | W6 r2 | **W6 r3** | uma linha |
|---|---|---|---|
| Heuristic Compliance | 7 | **7** | H1 cumprida com 14 h de dado parado. OBS-W6-r2-1 e OBS-W6-r3-1 são ruído pequeno de H2/H4 |
| Research Foundation | 7 | **7** | recaptura no backend do HEAD, replay de 235 requisições contra o backend anterior, sweep de 240 janelas. Sem teste com operador |
| Mobile Experience | 3 | **3** | fora do alvo. A legenda invade o plot a 390 (herdado) |
| Desktop Experience | 7 | **7** | densidade de terminal; a `15m`+ a vela se perde (C-2) |
| Visual Design | 7 | **7** | nenhuma marca cruza a legenda, a 38 ou a 70 px |
| Accessibility | 6 | **6** | contraste ≥ 5,01:1 e corpo ≥ 11 px; direção só por matiz (C-1) |
| Interaction Design | 6 | **6** | crosshair e legenda de largura fixa; TF fora da ordem de Tab (herdado) |
| Future-Readiness | 6 | **6** | `data-oi-regime-*` e `data-legend-bottom-px` deixam a propriedade auditável, e foi isso que separou relógio de código no §3 |
| System Architecture | 8 | **8** | a borda vem do render; o candle vem de uma função de rota só, e por isso o replay prova a igualdade |
| Ethics & Content | 7 | **7** | `ausente`, idade e teto em vez de número inventado; duas frases apontam para o lugar errado (OBS-W6-r2-1, OBS-W6-r3-1) |

**Média: 64/100** `[MEDIDO: 7+7+3+7+7+6+6+6+8+7 = 64]`. Radar: `[7, 7, 3, 7, 7, 6, 6, 6, 8, 7]`.

**Top 3 forças.** (1) Com 14 h de dado parado, a tela não inventa nada: *"ausente"*, a idade e o teto em todo pane. (2) A
reserva da legenda é lida do render e acompanha 38 → 70 px sem que nenhuma marca a cruze. (3) O candle sai de uma função
de rota só, e por isso a mudança de backend pôde ser provada inofensiva para o pixel (235/235), e não apenas presumida.

**Roteiro.** *Quick wins (menos de 1 dia):* C-4, reescrever DG-2 (`ui-designer`). OBS-W6-r2-1, uma string. *Médio (1 a 5
dias):* OBS-W6-r3-1, o rótulo do regime único ou o grão no cabeçalho. OBS-W6-1, a faixa estreita vira uma regra só. C-3.
*Estratégico (1 semana ou mais):* C-1, a direção sem depender só da cor, e C-2, a forma de vela em TF largo.

## 6. Falsificador deste veredito

Este APPROVED WITH CONDITIONS cai se, antes do merge da wave, qualquer um destes acontecer:

- `git diff --name-only 6c4014b HEAD -- frontend/src | grep -vc '\.test\.ts$'` deixar de dar **0**;
- `backend/src` mudar em `6c4014b..HEAD` e o `replay.py` (backend novo × `6c4014b`, sobre as requisições de uma captura
  nova) der qualquer envelope de OI diferente, sem recaptura. Isto é o que este r3 aprendeu: `frontend/src` sozinho não
  cobre o candle, porque o candle é desenhado com dado que o backend deriva;
- `legsolid.py` sobre as 9 cenas de `scenes.txt` der trecho vertical de regra na legenda maior que o controle da cena, ou
  qualquer px de faixa em trecho ≥ 3 dentro de `[pane_top, legend_bottom)`. Isso só conta enquanto o controle positivo
  continuar dando ≥ 38;
- a 1ª linha da regra sair de `pane_top + data-legend-bottom-px`: 653 a 1600, ou 685 a 1100 com a legenda quebrada;
- `ca7.py` sair de 53/53, ou a ablação `e2eOiLine=1` deixar qualquer tinta de vela.

Não há `gate-record` neste laudo: quem grava é o orquestrador (§4 das regras de despacho).
