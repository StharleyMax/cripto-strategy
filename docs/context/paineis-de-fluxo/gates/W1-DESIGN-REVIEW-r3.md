# W1-DESIGN-REVIEW r3: veredito do `ux-ui-mastery:design-review` sobre o `/symbol` da wave W1 depois do W1-FIX2

**Veredito: APPROVED WITH CONDITIONS. Nota 61/100** (r1: 53, r2: 58). O falsificador da r2 (§8 de lá) foi rodado
no app real, com dado real, e **as duas cláusulas valem juntas**:

1. **MF-B′ fechado, com ablação minha.** Em `4h` e `15m`, parado, a legenda do volume mostra a última barra
   fechada que a API serve (`9182.651` = barra `4h` de 26/09 00:00; `204.171` = barra `15m` de 26/09 04:00). Sob o
   crosshair, o volume lê `ausente` **só onde o preço também lê** (0 posições com volume `ausente` e preço lendo).
   Tirar o conserto (mutação V3: `slots={volume.slots}`) faz o `ausente` voltar em **24 de 24** posições nos 2 TFs.
2. Os itens 1 e 2 do §2 da r2 **continuam passando**: o `T` e o *"há 0 min"* sobrevivem aos arrastos, e a legenda
   do preço em repouso bate com o rótulo do eixo.

As condições são os achados abertos do §4 (nenhum é novo, nenhum piorou).

```
Feature: paineis-de-fluxo · Wave: W1 · Base: 790b2fb (wave/paineis-f01)
frontend/src == 1ebee50 (W1-FIX2): `git diff --stat 1ebee50 HEAD -- frontend/src` = vazio
frontend/src != r2:  `git diff --stat 63b50d4 HEAD -- frontend/src` = 10 arquivos, +276 −12  ⇒ nada reaproveitado da r2 nem da T-01.11 r2
Skill: ux-ui-mastery:design-review (10 domínios) · captura: 2026-09-26 04:10–04:40 UTC · portas 8837/4337
```

## 1. Instrumento

| peça | como |
|---|---|
| reuso | **nenhum**. O `frontend/src` mudou no W1-FIX2 (comando acima), então tudo foi capturado de novo |
| app | cópia de `frontend/` no scratchpad (rsync sem `node_modules`/`.next`; `node_modules` por hardlink `cp -al`). `INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8837 npx next build` rc=0, depois `next start -p 4337` |
| dado | API de produção `:8000` pelo proxy só-leitura (o mesmo `proxy.mjs` da r2; na 2ª metade, uma variante que só acrescenta log de URL). Contadores: `proxy_get_requests_total=296 refused=0` + `298 refused=0` `[MEDIDO]`. **Nenhum seed, nenhum INSERT** |
| captura | o `cap.mjs` da r2 (§1 de lá), sem mudança de lógica: Playwright/Chromium, DPR 1, `/symbol/BTCUSDT`, 1920×1080 e 1280×800; `1m` em repouso, a sequência do `drag3`, o arrasto para o futuro, e por TF (`4h`,`15m`,`1h`,`5m`) repouso + varredura de 24 x + arrasto. 16 PNGs `W1-DR3-*.png` + `facts.json` |
| volume × API | `volprobe.mjs` (repouso + 24 x, `4h`/`15m`, 1920) e GET direto em `/api/v1/series-history?series_key_id=ef3033…&interval={4h,15m}&bar_policy=final_only` com a janela que o SSR pediu (URL lida do log do proxy) |
| ablação | V3 na cópia: `SymbolClient.tsx:1801` `slots={volume.legendSlots}` → `slots={volume.slots}`; build rc=0; `volprobe.mjs`; reversão por cópia do original (`diff -q` contra a worktree = igual); rebuild; `volprobe.mjs` de novo |
| evidência | PNGs, `facts.json`, scripts e logs no scratchpad da sessão, **sem versionar** (regra §4: este portão commita só este arquivo) |

## 2. O falsificador da r2, medido no pixel

| cláusula | medido | resultado |
|---|---|---|
| 1a. `4h`/`15m` parados: volume = soma da última barra fechada | legenda `9182.651` (`4h`, T 03:59) e `204.171` (`15m`, T 04:14), nos 2 viewports. API: `4h` última linha presente `09-26 00:00 = 9182.651`; `15m` `09-26 04:00 = 204.171` `[MEDIDO: volprobe HEAD + curl na URL do SSR; n=24 e 384 linhas]` | **passa** |
| 1b. sob o crosshair, lê valor em todo x com barra | `4h`: volume `ausente` **0/24**. `15m`: **9/24**, e o preço está `ausente` nas **mesmas 9** (lacunas reais: 255 de 384 linhas presentes) ⇒ `vol_ausente_where_price_reads = 0` nos 2 TFs. `1h`/`5m`: volume `ausente` = preço `ausente` + 0–2 (8 vs 5 em `1h`@1920; lacunas da série) `[MEDIDO: facts.tf_*.sweep; volprobe]` | **passa**. A comparação slot a slot contra o corpo servido é do `W1-QA-r3` §2 (0 `ausente` com barra, 0 valor errado); não repeti |
| 1c. a mutação morde | **V3**: repouso `ausente`/`SEM_PONTO` nos 2 TFs; varredura **24/24** `ausente` em `4h` (preço 0/24) e **24/24** em `15m` (preço 9/24). Revertido: volta a `9182.651`/`204.171`, 0/24 e 9/24 `[MEDIDO: volprobe MUT-V3 e HEAD-after-revert]` | **morde** |
| 2a. `T` e idade sobrevivem ao gesto | `1m`, 3 estados do `drag3` nos 2 viewports: `T = 04:14` / `04:19`, *"há 0 min"* nos 3. Arrasto para o futuro: igual. Depois do arrasto em `4h`/`15m`/`1h`/`5m`: `T` = o do repouso `[MEDIDO: facts.mfa, mfa_future, tf_*.afterDrag; n=2×4]` | **passa** |
| 2b. preço parado = rótulo do eixo | `4h`: `84056` / eixo `84056.00`. `15m`: `83908.6` / `83908.60` (PNG `W1-DR3-1920x1080-{4h-hover,15m}.png`). Repouso: 0/8 `ausente` em `4h`/`1h`; 2/8 em `15m`/`5m`/`1m` = as 2 liquidações | **passa** |

As 2 liquidações `ausente` em repouso seguem tratadas como verdadeiras (atraso da Coinalyze) `[INFERRED: mesma
leitura da r2; o W1-QA-r3 §2 cruzou legenda × API em 1m/15m/4h]`.

**C-2 (piso da liquidação) no pixel:** em `15m`/`4h` o pé de toda barra long fica acima da faixa de marcas, e o
topo da barra mais alta está na mesma linha da r2 (y = 9 px do topo do painel nas duas capturas, colunas x 1200–1740)
`[MEDIDO: PIL sobre W1-DR2/W1-DR3-1920x1080-15m.png]`. Ou seja, o `keepFloor` não moveu o teto, e o SF-10 abaixo
continua do mesmo tamanho, nem maior nem menor.

## 3. Must-fix

**Nenhum.** O único da r2 (MF-B′) fechou, com a ablação acima.

## 4. Condições (abertas, conferidas no pixel novo; nenhuma reprova sozinha)

| item | estado | medida r3 |
|---|---|---|
| SF-8: numeral com ruído de ponto flutuante | aberto | `613372.7679000001` (liquidação long, `4h`, 2 viewports) |
| SF-9: o `sr-only` diz `SEM_PONTO` | aberto | 7 nós em `4h`/`15m`/`1h`, 6 em `5m` |
| SF-10: caixas "COBERTURA PARCIAL" e barras de liquidação sobre o texto da legenda | aberto, **igual à r2** | as barras long cortam "Liquidação de posições compradas (long)" e a caixa (PNG `15m`, `4h-hover`). ⚠️ O contador `coverage` do `cap.mjs` deu **0** com as caixas visíveis: o seletor de nó-folha é cego a esse texto. Instrumento defeituoso, declarado; a leitura vem do PNG |
| SF-11: 4 s sem estado pendente no clique de TF | aberto | `first_pressed_ms = 4000` em **6/6** cliques `[MEDIDO: tfclick.mjs, n=6]` |
| SF-12: arrasto rola para o vazio sem "ir para o agora" | aberto | PNG `W1-DR3-1920x1080-1m-back-to-edge.png`: plot vazio, sem rótulo de tempo |
| SF-3: dobra | aberto | `scrollHeight = 1081` em todo estado |
| SF-6: caixa "Últimas 4 h" cortada | aberto | a caixa do long/short aparece cortada pelo eixo nos 2 viewports (PNG `1920x1080-15m`, `1280x800-15m`) |
| E-2: 404 do ao vivo | aberto | `failed_n = 30` por viewport; "ao vivo indisponível" ×3 |
| E-3: vela de 1 px em `4h` | aberto | PNG `4h-hover`: traços de 1 px a ≈120 px |
| E-4: "DADO VELHO" falso em TF ≠ `1m` | aberto | `4h` e `1h`: 1 alerta cada (*"há 3 h 54 min … DADO VELHO"* no OI de `4h`) |
| E-5: título "(1m, …)" em qualquer TF | aberto | `Preço (1m, USDT)`, `Volume (1m, BTC)` em `15m` e `4h` |

## 5. Pontuação, pelos 10 domínios da skill

| domínio | r1 | r2 | r3 | uma linha |
|---|---|---|---|---|
| Heuristic Compliance | 5 | 6 | 7 | Some a última negativa falsa sistemática (H1). Seguem o DADO VELHO falso em `4h`/`1h` e 4 s sem sinal no TF |
| Research Foundation | 6 | 6 | 7 | A legenda do volume em TF ≠ `1m` ganhou teste com os valores lidos da API e contrato de fonte, e as mutações mordem |
| Mobile Experience | 3 | 3 | 3 | Fora do alvo |
| Desktop Experience | 5 | 6 | 6 | 8 leituras corretas em todo TF. A vela de `4h` segue ilegível (E-3), e há dobra (SF-3) |
| Visual Design | 6 | 6 | 6 | SF-10 e SF-8 sem mudança |
| Accessibility | 6 | 6 | 6 | SF-9 sem mudança |
| Interaction Design | 4 | 6 | 6 | Crosshair coerente entre as 8 leituras. SF-11 e SF-12 abertos |
| Future-Readiness | 6 | 6 | 6 | Sem mudança |
| System Architecture | 7 | 7 | 7 | A legenda do volume passa a ler a grade canônica pela primitiva compartilhada. Custo: 2 vetores por série (barras nativas, legenda canônica), o que pede disciplina para não divergirem |
| Ethics & Content | 5 | 6 | 7 | `ausente` volta a significar "não sabemos" em todas as 8 leituras. Resta o alarme de idade falso em `4h` |

**Média: 61/100** `[MEDIDO: 7+7+3+6+6+6+6+6+7+7 = 61, /10 = 6,1]`. Sem o Mobile, fica em **6,44** (58/9).

Radar (r3): `[7, 7, 3, 6, 6, 6, 6, 6, 7, 7]`, na ordem da tabela.

**Pontos fortes:** (1) as 8 legendas agora dizem a verdade em todo TF, em repouso e sob o crosshair, e há mutação
que morde para cada conserto. (2) O `T` e a idade sobrevivem a qualquer gesto. (3) A linguagem de integridade
(cobertura, terceiro, procedência, escala log declarada) continua honesta e visível.

**Roteiro.** *Rápido (< 1 dia):* SF-8 (formatar pelo passo do instrumento), SF-9 (texto humano no `sr-only`), E-5
(título com o TF da rota). *Médio (1–5 dias):* SF-11 (`aria-busy` e indicador no botão clicado, ou troca otimista com
esqueleto), SF-12 (botão "ir para o agora" quando a borda sai da vista, ou `rightOffset` limitado), E-4 (idade na
régua do TF), SF-10 (reserva real da legenda na faixa de barras, e caixas de cobertura fora do plot). *Estratégico:*
E-3 (largura da vela proporcional à duração, decisão da `ADR-044`).

## 6. Falsificador deste veredito

O APPROVED WITH CONDITIONS cai para NEEDS_FIX se, no mesmo app e com dado real, qualquer destas valer:

1. em algum TF, uma posição do crosshair com barra de volume servida ler `ausente` ou um valor diferente do servido
   (a comparação slot a slot do `W1-QA-r3` §2 com o `volcheck.cjs`, refeita);
2. a mutação V3 (ou V1/V2 do `W1-QA-r3` §5) deixar de morder no app real, o que diria que a legenda passou a ler
   outro caminho;
3. qualquer condição do §4 piorar. Exemplo: o topo das barras de liquidação subir acima da linha y = 9 px do painel,
   ou o `first_pressed_ms` do TF passar de 4000.
