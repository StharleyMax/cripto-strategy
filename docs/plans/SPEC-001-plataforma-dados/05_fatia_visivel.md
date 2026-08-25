# Fase 05 — S2-mínima: a primeira fatia de valor visível

**Epic:** `CST-3` (F1, segunda metade) · **Componentes alvo: `charts`** (geometria) e **`web`** (rota, sessão, auth) · **Gate: `Q16`**
**Depende de:** `04`. **Zero rede de mercado, zero API key** — o dado já está em disco.

**Honestidade sobre que valor é este:** a S2-mínima entrega valor **de verificação** — o owner olha uma série contra o preço e afirma que ela significa o que ele pensa. **Não** entrega valor operacional: não mostra o mercado agora (o painel de OI vem do dump com **~30,3 h** de idade e cobre 4 dias **com um buraco**). **As duas coisas se chamam "primeira tela" e não são a mesma** — escolher entre elas é `Q10`.

## Itens

| # | item | requisito | componente |
|---|---|---|---|
| 5.1 | S2-mínima: 1 símbolo (BTCUSDT), 4 dias, painéis **Preço** + **OI** + **CVD delta e acumulado** | `CA-F1-16` | `charts` |
| 5.2 | **Grade canônica como UMA função, dona de `charts`** — o motor a **importa**, nunca a reimplementa | `ADR-003`/FR-3 | `charts` |
| 5.3 | O **selo** de quatro campos, **visível sem hover** — tooltip não conta | `SPEC-001` §6.1 | `charts` |
| 5.4 | Içamento em três níveis (sessão / painel / número) | `CA-F4-14`, `ADR-005`/D3 | `charts` |
| 5.5 | Política de ausência **por `nature`** | `SPEC-001` §5.11 | `charts` |
| 5.6 | `knowledge_time` **na URL**; o bundle **É** a URL, não um CRUD | `SPEC-001` §7 | `web` |
| 5.7 | O painel de Preço declara **`price_source` E `price_use`** na linha do painel | `ADR-007`/PS-3 | `charts` |
| 5.8 | `pointer_mode ∈ {read, annotate}` declarado, com overlay reservado acima do plot e abaixo do crosshair | `SPEC-001` §3.6 | `charts` |
| 5.9 | Cor como **token nomeado por papel**; **`critical` fora do canal de cor** | `CA-F4-10` | `charts` |
| 5.10 | **Atribuição do Lightweight Charts** — notice do `NOTICE` + crédito à **TradingView** com link | `CA-F1-15`, `[GAP G4]` | `web` |
| 5.11 | **Auth mínima, single-user, extensível** — primeira superfície servida de host exposto | `SPEC-001` §8.3, `Q2` | `web` |
| 5.12 | Transporte: **HTTP endereçável por conteúdo** para o histórico. **Nenhum tick chega ao browser** | `ADR-005`/D1 | `web` |

## DoD — comando e universo

| # | critério | ação | saída esperada |
|---|---|---|---|
| **D5.1** | o carimbo de idade é do FECHO na TELA | crosshair no primeiro ponto de `met/2026-08-23.csv` | **`00:05:00Z`**. **Três dos quatro desenhos de UX imprimiram o rótulo cru** — é o defeito que a fase existe para impedir |
| **D5.2** | ausência de OI não é lida como leitura da barra | crosshair em barra de 1 min **sem** ponto de OI | valor em tinta secundária + `de hh:mm:ssZ (−Xm)` + **linha-guia apontando para trás** até a marca real |
| **D5.3** | `FLOW` ausente é ausência | crosshair em bucket ausente de `cvd_delta` | **`—`** |
| **D5.4** | `COMO EM T` sobrevive à navegação | `COMO EM T` → navegar → voltar | `T` sobrevive aos **três** saltos. **Teste negativo obrigatório:** voltar para `AGORA` **não tem sintoma visível** ⇒ reprova |
| **D5.5** | a marcação fica amarrada à série de preço | marcar sob `price_source = klines_last` e reabrir sob `mark_price` | a marcação **NÃO é reexibida como se fosse a mesma** (ou vem rotulada `marcada sobre outra série de preço`) |
| **D5.6** | a paleta passa nos dois modos, com 4 papéis, **sob as TRÊS dicromacias** | `node scripts/validate_palette.js` | **exit 0 · 361 medições · `min(protan, deutan, tritan) >= 15` em todo par crítico nos dois modos.** Par que prova a regra: `#f23645 ↔ #eb6834` **FAIL em 5,3** (deutan) ⇒ **`critical` não cabe no canal de cor.** Supersedido por [`ADR-010`](../../adr/ADR-010-governanca-de-cor-por-tipo-de-marca.md) — os números anteriores (24,7/26,8 e 10,8) **não reproduzem** |
| **D5.7** | atribuição presente na página pública | inspecionar a página | notice do `NOTICE` + **TradingView** creditada com link |
| **D5.8** | **nenhum tick chega ao browser** | contar mensagens e inspecionar payload | taxa **≤ `max(1 Hz, 1/TF)`** por série, e **zero campo de nível de tick** (`agg_id`, preço por trade, quantidade por trade) |
| **D5.9** | a grade tem **UMA** implementação | comparar a saída da grade usada pelo gráfico com a usada pelo acessor | `sha256` da projeção canônica **igual** sobre **4 dias × 1 símbolo × 3 TFs** |
| **D5.10** | identidade é dimensão | inserir `<Anotacao>` | `principal_id` **preenchido**, nunca `NULL`, nunca constante implícita |
| **D5.11** | o eixo aguenta a carga que F4 vai exigir | coordenadas X contra os `event_time` originais | tolerância **0,5 px**. **⚠️ `[NÃO MEDIDO]` — declarado o MAIOR RISCO TÉCNICO desta especificação.** Aqui com carga menor; a carga cheia (**288 pontos + 1.440 candles**) é `08` |

## Não faz

Não detecta nada — **zero algoritmo de SMC, zero limiar, zero "sinal"**. A caixa que o owner desenha é **entrada** da fase seguinte, não saída desta. Não tem painel de liquidação. Não tem watchlist multi-símbolo ao vivo. Não dispara ordem. Não mostra o mercado agora.

## Falsificador da fase

**F-3 global:** um item desta fase que não consiga declarar **UM** componente. O caso mais próximo do limite é `5.2`: a linha-guia de D5.2 é **geometria derivada de `available_at`** ⇒ **`charts`**, e `web` só entrega o par `(valor, available_at)`. Se essa atribuição não se sustentar na implementação, `ADR-003` está errado.
