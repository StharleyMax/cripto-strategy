# W6-DESIGN-REVIEW: `ux-ui-mastery:design-review` do `/symbol` no fim da wave `paineis-f03b`

**Veredito: APPROVED WITH CONDITIONS. Nota 64/100**, a mesma do `T-03.14` r2. O app foi recapturado no HEAD da wave,
com dado real e um export novo, e nada regrediu. O falsificador do r2 (§6) foi rodado inteiro e não disparou: `frontend/src`
é byte a byte o de `0119435`, `legsolid` passa nas 9 cenas com o controle positivo mordendo, a 1ª linha de regra e faixa
é 653 em todas, e CA-7 dá 53/53. Nenhuma condição nova reprova. Há uma observação nova, de severidade 1 (OBS-W6-1, §4),
que é da mesma família de C-3.

```
Feature: paineis-de-fluxo · Wave: W6 (paineis-f03b, T-03.8..T-03.14) · portão: design-review (§4 das regras de despacho)
HEAD revisado: ef2ff95 (wave/paineis-f03b) · laudo anterior: gates/T-03.14-design-review-r2.md (0119435)
Captura 2026-09-27 21:49–22:20 UTC · portas 8847 (proxy) / 4347 (app)
```

## 1. Reaproveitar ou recapturar

`git diff --quiet 0119435 HEAD -- frontend/src` dá **rc=0**. `git diff --stat 0119435 HEAD` mostra só `docs/` (13 arquivos,
+540/−0) `[MEDIDO]`. A regra de despacho permitia reaproveitar os screenshots do r2, mas **recapturei**: o dado andou
cerca de 1 h 15 min desde o r2 e passou a incluir a volta do polling depois do buraco de 11:30Z. O motivo é medir a
propriedade de novo, e não apenas reler o laudo antigo.

| peça | como |
|---|---|
| app | `git archive ef2ff95 frontend` numa árvore **isolada** (`$SP/w6dr/tree`, com `node_modules` por hard link). Assim o `next build` não toca o `.next` da worktree da wave, que o QA de front usa. `INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8847 next build` rc=0, e depois `next start -H 127.0.0.1 -p 4347` |
| dado | proxy híbrido **só leitura** `real-proxy.py` (cópia de `gates/T-03.13-real-proxy.py.txt`, com a porta 8847 como argumento). O OI é respondido pela função de rota da wave sobre um export novo de `md.series`: 8 ids, `bucket_end ≥ 2026-09-22`, `default_transaction_read_only=on`, `lock_timeout=3000`, receita de `handoff/T-03.10.md`. Deu 13.014 linhas, sha256 `a9dbe6d60b19b327…` e `max(bucket_end)` 21:49Z, exportado às 21:49:08Z. O resto vai por GET para a produção `:8000`. **A produção roda o `master`, que não serve `oi_candles`, e por isso o proxy é híbrido.** Contador final: `passthrough_get 258, local_oi 20, refused 1` `[MEDIDO: proxy.log]`. O único refused é o **meu** `POST` de prova do 405, feito antes da captura. **Nenhum INSERT, nenhum seed** |
| captura geral | `cap.mjs`, derivado de `gates/T-01.11-r2-capture.mjs.txt`: mesma coleta de legenda, texto/contraste e scroll, mais `?interval=` e os atributos `data-oi-*`. Cenas: 1280×800, 1600×1200 e 1920×1080 a `1m`; 1600×1200 a `5m`, `15m`, `1h` e `4h`; 390×844 a `1m`. Mais crosshair a 70 % e 12 paradas de Tab a 1600/`1m` |
| bancada do r2 | `oicap.mjs` do r1 (só a porta e o caminho do Playwright mudam), `oipx.py`, `legsolid.py` e `ca7.py`, sem alteração, sobre as 9 cenas de [`T-03.14-evidence/scenes.txt`](T-03.14-evidence/scenes.txt). Mais 2 cenas extras a 1280×800 |
| evidência | `$SP/w6dr/{cap,scap,s1280}` e `oipx.jsonl`/`legsolid.jsonl`, com `SP=/tmp/claude-1002/-home-stharley-Documentos-projects-cripto-strategy/854f12b5-43c8-425a-9856-b6679093c941/scratchpad`. Não versionada, pelo §4 das regras (o portão commita só o laudo) |

## 2. O falsificador do `T-03.14` r2 (§6), rodado inteiro no HEAD da wave

| item do r2 §6 | limiar | **W6 (`ef2ff95`, export 21:49Z)** |
|---|---|---|
| `frontend/src` igual a `0119435` | `rc=0` | **rc=0** |
| regra: maior trecho vertical na legenda ≤ controle de texto | por cena | `1m-live` 0 ≤ 6 · `1m-entry` 0 ≤ 5 · `5m-entry` 0 ≤ 1 · `15m-island` 1, 0 ≤ 3 · `ablation` 3 ≤ 4 |
| faixa: px em trechos ≥ 3 dentro de `[pane_top, legend_bottom)` | `= 0` | **0 em 9/9** (maior trecho na legenda: 2 px) |
| 1ª linha de regra e faixa = `pane_top + data-legend-bottom-px` | 653 | **653 em 5/5 cenas com regra**. A faixa aparece inteira logo abaixo: 245, 854, 1528, 911, 23, 612 e 240 px |
| controle positivo (PNGs do r1) | ≥ 38 linhas | **38** (`btc-1m-entry`, r1) → o instrumento enxerga |
| CA-7, cor × `sinal(C − O)` | 53/53 | **53/53** (28 `point_5m`, 25 `poll_1m`) `[ca7.py]` |
| DoD-6, ablação `e2eOiLine=1` | 0 tinta de vela | **0/0** up/down, contra 533/551 na mesma cena sem ablação |
| Q-2, fundo dentro × fora da faixa | `(30,34,48)` × `(19,23,34)` | **igual** nas 7 cenas que têm faixa |

`[MEDIDO: oipx.py + legsolid.py + ca7.py sobre $SP/w6dr/scap, n=9 cenas; legenda = linhas 615–652]`

**Legenda que quebra linha, a 1280×800.** Esse caso o r2 não mediu. A 1280, a legenda do OI ao vivo quebra em 3 linhas,
e o `data-legend-bottom-px` do pane acompanha: dá **54**, contra 38 a 1600 e 120 a 390 (`data-legend-reserve`
`margins`/`overflow`) `[MEDIDO: W6-facts.json, panes[oi-pane].attrs]`. O primitive lê a borda do render, e não conta
linhas (`SymbolClient.tsx:812`). Duas cenas com regra a 1280×800 (`1m`/`5m` entry) passam no mesmo `legsolid`: regra
com trecho de 2 e 3, contra controles de 5 e 2, faixa 0, 1ª linha 653 `[MEDIDO: $SP/w6dr/s1280]`. ⚠️ Nessas duas cenas a
legenda em repouso tem 2 linhas. **Não medi** regra e faixa com a legenda em 3 linhas: a 1280, a vista padrão não tem
regra na janela, porque a fronteira `1790391600000` fica à esquerda dela.

## 3. O que a tela mostra, no HEAD da wave (dado real)

- **Leitura geral (1600×1200, `1m`):** a hierarquia é a da W5, com uma gramática de candle só (preço e OI). O pane de OI
  mostra a faixa *"amostras 5m"* à esquerda, a regra e o rótulo *"amostras 1m"*. A legenda diz `O … H/L não medidos C …`
  e `DERIVADO (OHLC de amostras 1m · ADR-045)`, sem marca de canvas por cima.
- **Buraco de 23:00Z (dia 26) a 12:00Z (dia 27)** no preço, no OI e no CVD. É o incidente de idle-in-transaction, ou seja,
  **dado**, não design. Os três panes mostram o mesmo buraco, sem interpolar, o que está certo (H1/H8).
- **Tipografia e contraste:** o menor corpo é 11 px e o menor contraste medido é 5,01:1, nas 8 cenas. Scroll horizontal:
  0 em todas as cenas desktop e a 390 `[MEDIDO: W6-facts.json]`.
- **Teclado:** as 12 paradas de Tab ciclam `1m` → link de atribuição → `body`, com foco visível `solid 2px`. Os outros
  TFs não são paradas de Tab. Isso é herdado (não é superfície da 03b) e fica como observação, sem nota nova.
- **Herdados e iguais, sem piora:** E-2 (3 × `404` em `/?series_key_id=` por carga, *"ao vivo indisponível"* ×3), E-3
  (vela de 1 px a `4h`), E-4 (*"há 3 h 54 min … DADO VELHO"* no OI a `4h`, o mesmo texto do W1-DR r2/r3) e a legenda que
  invade o plot a 390 (`reserve overflow`, 120 px; mobile está fora do alvo).

## 4. Condições (não reprovam; vão para o dono)

- **C-1 = SF-19 (sev. 2, `web`):** na vista padrão, a direção do candle de OI é dada só pelo matiz (WCAG 1.4.1). Igual
  ao r2.
- **C-2 = SF-20 (sev. 2, `web`):** de `15m` em diante a vela vira um palito de 1 px. Igual.
- **C-3 = SF-21 (sev. 1, `web`):** na ilha de `15m`, a vela fica colada na regra. Igual.
- **C-4 (`ui-designer`):** a reescrita de DG-2 para *"a altura do pane sob a legenda"* continua pendente. Enquanto o texto
  não mudar, um leitor pode "consertar" o código de volta para y = 0.
- **OBS-W6-1 (NOVA, sev. 1, `web`, família de C-3):** com o dado atual, a vista **padrão** de `15m`, `1h` e `4h` ganhou uma
  faixa de 1 bucket depois do buraco de 11:30Z (`bands-at …1790508600000-1790509500000` a `15m`). Ela aparece como **duas
  regras a ~5 px uma da outra, sem rótulo** (`data-oi-regime-labels` fica com 3 rótulos para 4 faixas), e parece um traço
  duplo de artefato. Isso é o comportamento especificado (uma fronteira por troca de regime) sobre um dado que ficou
  assim, e não regressão, porque o código é o do r2. Mas antes aparecia só numa cena escolhida (`btc-15m-island`) e agora
  aparece na vista padrão. **Recomendação ao `ui-designer`:** quando a faixa tiver menos de N px (sugestão: menos que a
  largura do rótulo), desenhar uma regra só, ou um tique, com o regime no tooltip/legenda. Isso vai como decisão de
  design, com o próprio design gate, e não como fix desta wave.
- **Herdadas da W5, iguais:** SF-16, SF-17, SF-18, OBS-W5-1 e a caixa *"Últimas 4 h"* a 1280. Os itens (1)–(6) do
  falsificador da W5 não foram re-rodados aqui. O r2 os mediu em `0119435`, `frontend/src` é idêntico, e o que muda entre
  o r2 e agora é só a janela de dado `[INFERRED: código igual; os itens (1)–(6) medem liquidação/F-6/V-1/SF-11/RN-3, que não
  leem o OI]`.
- **`CA-12`, a metade Stitch:** fora deste laudo. Dono: o orquestrador.

## 5. Pontuação, pelos 10 domínios da skill

| domínio | T-03.14 r2 | **W6** | uma linha |
|---|---|---|---|
| Heuristic Compliance | 7 | **7** | H1: regime e amostragem visíveis sem hover. H8: legenda limpa. OBS-W6-1 é ruído visual pequeno |
| Research Foundation | 7 | **7** | export novo, 9+2 cenas, controle positivo, CA-7 refeito. Sem teste com operador |
| Mobile Experience | 3 | **3** | fora do alvo. A legenda invade o plot a 390 |
| Desktop Experience | 7 | **7** | densidade de terminal; a `15m`+ a vela se perde (C-2) |
| Visual Design | 7 | **7** | nenhuma marca cruza a legenda, nem com a quebra a 1280 (54 px medidos) |
| Accessibility | 6 | **6** | contraste ≥ 5,01:1 e corpo ≥ 11 px; direção só por matiz (C-1) |
| Interaction Design | 6 | **6** | crosshair e legenda de largura fixa; TF fora da ordem de Tab (herdado) |
| Future-Readiness | 6 | **6** | `data-oi-regime-*` e `data-legend-bottom-px` deixam a propriedade auditável |
| System Architecture | 8 | **8** | a borda vem do render (`getBoundingClientRect`), e não de contar linhas; ela acompanha a quebra |
| Ethics & Content | 7 | **7** | `H/L não medidos` e `DERIVADO … ADR-045` em vez de número inventado |

**Média: 64/100** `[MEDIDO: 7+7+3+7+7+6+6+6+8+7 = 64]`. Radar: `[7, 7, 3, 7, 7, 6, 6, 6, 8, 7]`.

**Roteiro.** *Quick win:* C-4, reescrever o texto de DG-2 (`ui-designer`, menos de 1 h). *Médio:* OBS-W6-1 (faixa
estreita vira uma regra só) e C-3. *Estratégico:* C-1, a direção sem depender só da cor (oco × cheio em todo regime ou
um glifo na legenda), e C-2, a forma de vela em TF largo.

## 6. Falsificador deste veredito

Este APPROVED WITH CONDITIONS cai se, antes do merge da wave, qualquer um destes acontecer:

- `git diff --quiet ef2ff95 HEAD -- frontend/src` deixar de dar `rc=0`;
- `legsolid.py` sobre as 9 cenas de `scenes.txt` der trecho vertical de regra na legenda maior que o controle da cena, ou
  qualquer px de faixa em trecho ≥ 3 dentro de `[pane_top, legend_bottom)`. Isso só conta enquanto o controle positivo das
  PNGs do r1 continuar dando ≥ 38;
- a 1ª linha da regra sair de `pane_top + data-legend-bottom-px`, ou o `data-legend-bottom-px` a 1280×800/`1m` deixar de
  acompanhar a legenda em 3 linhas (hoje 54);
- `ca7.py` sair de 53/53, ou a ablação `e2eOiLine=1` deixar qualquer tinta de vela.

Não há `gate-record` neste laudo: quem grava é o orquestrador (§4 das regras de despacho).
