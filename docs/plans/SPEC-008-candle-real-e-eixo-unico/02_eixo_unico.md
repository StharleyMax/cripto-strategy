# Fase `02` — O eixo único: um dono do range, não seis ouvintes

> **Pixel:** `P2` — arrastar/zoom no painel de Preço move os outros **cinco** no mesmo instante
> **Componentes:** `web` · `charts`
> **Requisitos cobertos:** `RF-5` · `RNF-2` · `[Q5]`/`G-3` · `[M-7]` (nome do segmento de rota)
> ✅ **`[M-4]` FECHADO 2026-09-19** — `D-C3.1`..`D-C3.7` em
> [`JULGAMENTO-FRONTEND-ARCHITECT.md`](../../context/candle-real-e-eixo-unico/handoff/JULGAMENTO-FRONTEND-ARCHITECT.md)
> (506 linhas). Esta fase está **desbloqueada**, e o julgamento **mudou o desenho dela**.

## A baseline, medida — e a correção de contagem

```bash
grep -n "useLightweightChart(" frontend/src/app/symbol/SymbolClient.tsx
# 416 = a DEFINICAO; 820 · 1024 · 1137 · 1394 · 1995 = 5 sitios de chamada
```
São **5 sítios**, mas **6 gráficos em runtime** — `LiquidationCohortSurface` monta **2×**
(`:1503,1510`, `cohort="long"`/`"short"`). O `6` do `PRD-008`/`M8` está certo **pelo caminho
errado**, e o caminho importa porque `CA-5` era escrito como contagem de `grep`
`[MEDIDO 2026-09-19]`.

## ⛔ O achado que reordena esta fase: **as grades já divergem**

```bash
grep -o 'data-fact="[a-z_]*slots:[0-9]*"' <captura de /symbol> | sort -u
# price_slots:5760 · cvd_slots:5760 · long_short_slots:5760 · oi_slots:1152
```
`buildOiPanel` usa **`FIVE_MINUTES_MS`** (`frontend/src/charts/s2-panels.ts:135`); `buildPricePanel`
usa `ONE_MINUTE_MS` (`:125`) `[MEDIDO 2026-09-19]`.

⇒ **o índice lógico `i` é o minuto `i` no Preço e o minuto `5i` no OI.** Ligar a assinatura sem
unificar a grade sincroniza painéis **mostrando instantes diferentes** — *"um defeito pior que o
atual, porque parece consertado"*.

⭐ **E a guarda de reentrância NÃO é o mecanismo de proteção**, contra a intuição: a malha ingênua
**não estoura** (`n=6`: 6 notificações, 30 escritas, profundidade 1). O que morde é grade
divergente — CALA = **0 min** de desalinhamento, MORDE = **5.460 min (91 h)** *com a guarda ligada*
`[MEDIDO 2026-09-19: loop-probe2.mjs, lightweight-charts 5.2.1 + jsdom]`.

## Itens

| # | item | componente | requisito |
|---|---|---|---|
| **2.0** | ⛔ **PRIMEIRO: grade canônica ÚNICA** — todo painel sobre exatamente a mesma grade, lossless com whitespace (`D9`/`D-C3.2`). **Sem isto, 2.1 entrega o defeito pior** | `charts` | `D9` |
| 2.1 | `TimeAxisController` **puro em `charts`** — sem `IChartApi`, sem `fetch` (`ADR-003/FR-1+FR-2`); `web` assina, despacha e aplica (`D-C3.1`) | `charts` | `RF-5`, `C-3` |
| 2.2 | Guarda de reentrância — **necessária, mas não é ela que resolve** (ver acima); o invariante de grade é que protege | `charts` | `RF-5` |
| 2.2b | O estado de registro é em **INSTANTES**; `logicalRange` é só formato de fio, convertido por **aritmética pura** sem arredondar (`D-C3.3`) | `charts` | `RF-5` |
| 2.3 | `fitContent()` deixa de ser por gráfico — o enquadramento inicial é **do eixo**, não de cada painel | `web` | `RF-5` |
| 2.4 | A rota vira `/symbol/[symbol]`, **segmento em inglês** (linha 12 do `CLAUDE.md`, `[DECISÃO-OWNER: 2026-09-19]`); o nome exato é `[M-7]`. ⚠️ CORREÇÃO, 2026-09-26: rótulo trocado — a linha 12 do `CLAUDE.md` é `[PREMISSA-OWNER: 2026-09-08]` (*"rotas em ingles"*); o que leva `[DECISÃO-OWNER: 2026-09-19]` é o segmento `/symbol/[symbol]` (`PRD-009` D-f), e `[M-7]` está resolvida `[MEDIDO 2026-09-26: grep -n 'PREMISSA-OWNER: 2026-09-08' CLAUDE.md; grep -n 'D-f' docs/specs/PRD-009-paineis-de-fluxo.md]` — [`docs/MAPA-DOCUMENTAL.md`](../../MAPA-DOCUMENTAL.md) §3 #52 | `web` | `D-e`, `[Q4]` |
| 2.5 | Plano de migração de `/painel` **não** entra aqui — é task dedicada (`CLAUDE.md`, linha 12) | — | fora |
| 2.6 | ✅ **Teto de latência DECIDIDO pelo owner (`[M-5]` fechada):** **16 ms** por quadro para arrastar/zoom — *um quadro a 60 fps*. `[DECISÃO-OWNER: 2026-09-19, escolha entre alternativas apresentadas]`. Deixou de ser `[NÃO MEDIDO]` ⇒ vira **DoD 7**, medível. ⚠️ CORREÇÃO, 2026-09-26: dizia **16 ms**; o teto vigente é **`p95 ≤ 160 ms`** (`n ≥ 61`), recalibrado pelo owner em 2026-09-22 `[MEDIDO 2026-09-26: grep -n '160 ms' frontend/e2e/17-teto-latencia-eixo.spec.ts → :9]` — [`docs/MAPA-DOCUMENTAL.md`](../../MAPA-DOCUMENTAL.md) §3 #60 | `web` | `RNF-2`, `[Q5]` |
| 2.7 | **Veredito do `ux-ui-mastery`** sobre o comportamento de pan/zoom | `web` | `CLAUDE.md` §Design |

## DoD verificável — comando e universo

1. ⛔ **`CA-5` foi RETIRADO — ele não morde nem cala.** O desenho correto e a malha ingênua dão
   **a mesma contagem `1`**: a sonda que mede **30 escritas** tem **1** ocorrência textual
   `[MEDIDO 2026-09-19: loop-probe.mjs]`. O `grep` fica como **higiene, nunca aceite**.
   **Os quatro substitutos, comportamentais:**

   | id | critério | morde quando |
   |---|---|---|
   | `CA-5a` | **uma** grade: `grep -o 'data-fact="[a-z_]*slots:[0-9]*"' <página> \| cut -d: -f2 \| sort -u \| wc -l` | `≠ 1`. **Hoje dá `2`** (`5760` e `1152`) |
   | `CA-5b` | par morde/cala, headless com 6 gráficos: CALA = `desalinhamento 0 min`; MORDE (grades podadas) = `> 0` | o caso MORDE **passa** ⇒ mede *"algo se moveu"*, não alinhamento. Referência **5.460 min** |
   | `CA-5c` | o remonte não amplifica: `setVisibleLogicalRange` por **um** pan | `> 5` para `N=6` — a malha ingênua dá **30** |
   | `CA-5d` | TF preserva o instante: `1m`→`4h` com range fixo, erro `< 1 bucket do TF novo` | **`325,3 h`** (range lógico cru); via tempo dá **2,7 h** |

2. **O pan move os cinco.** Playwright contra o **app real**: arrastar o painel de Preço em `N = 3`
   deslocamentos distintos; os **5** painéis restantes mudam o range no mesmo evento.
   **Assert de posição**, nunca de status HTTP nem de presença de atributo.

3. ⛔ **Ablação de `P2`** (`CA-6`). Desligada a assinatura, os cinco **param** de acompanhar —
   mesma captura, mesmo gesto, resultado oposto. Sem isso, `DoD-2` é verde falso.

4. **Sem realimentação.** Um gesto único produz **1** propagação por painel, não `N`. Instrumentar a
   contagem e assertar: **morde** com contagem crescente ou laço.

5. **A rota responde.** `/symbol/BTCUSDT` → `200`, e o segmento é ASCII em inglês.
   `n = 4` símbolos do catálogo (`BTCUSDT`/`ETHUSDT`/`LINKUSDT`/`SOLUSDT`) `[MEDIDO 2026-09-19]`.

7. ⭐ **Teto de latência do eixo: `16 ms` por quadro**
   > ⚠️ CORREÇÃO, 2026-09-26: dizia **16 ms** / `n ≥ 60`; o teto vigente é **`p95 ≤ 160 ms`**, `n ≥ 61`, recalibrado em
   > 2026-09-22 `[DECISÃO-OWNER: 2026-09-22, escolha entre alternativas apresentadas]` (`SPEC-009` A-3;
   > `frontend/e2e/17-teto-latencia-eixo.spec.ts:9,90,128`) `[MEDIDO 2026-09-26: grep -n '160 ms\|RECALIBRA' frontend/e2e/17-teto-latencia-eixo.spec.ts]`.
   > O texto abaixo fica como registro da decisão de 2026-09-19.
   `[DECISÃO-OWNER: 2026-09-19, escolha entre alternativas apresentadas]` — *um quadro a 60 fps*.
   Isto **fecha `[M-5]`** e tira `RNF-2` do estado `[NÃO MEDIDO]`.

   **Como é medido, e o critério é de distribuição — não de média:** Playwright contra o app real,
   `n ≥ 60` quadros de um arrasto contínuo (≈ 1 s a 60 fps), instrumentando o intervalo entre
   aplicações de range (`performance.now()` no aplicador do `TimeAxisController`, ou
   `requestAnimationFrame` sobre o `<canvas>`):

   - **`p95 ≤ 16 ms`** sobre os `n ≥ 60` quadros;
   - **morde** com `p95 > 16 ms`, e morde **também** se a instrumentação reportar `n < 60`
     quadros no arrasto — menos quadros que o esperado é queda de taxa disfarçada de amostra curta.

   ⚠️ **Média é proibida como critério:** um travamento de 200 ms em 60 quadros de 10 ms some na
   média (13,2 ms, "passa") e é exatamente o que o owner percebe. O teto é sobre a **cauda**.

   📌 **Referência de escala já medida, para o número não nascer descalibrado:** `setData` de
   129.600 pontos × 6 painéis custa **752,6 ms** `[MEDIDO 2026-09-19]` — **47× o teto**. Isto não
   reprova o eixo (é carga de dado, não de pan), mas fixa que **recarregar dado dentro do gesto de
   pan viola o teto por construção** ⇒ paginação é assíncrona e fora do quadro (fase `05`).

8. `make verify` verde, `__pycache__` purgado antes.
