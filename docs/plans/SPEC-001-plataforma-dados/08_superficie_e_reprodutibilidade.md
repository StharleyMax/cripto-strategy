# Fase 08 — Superfície completa, bancada e reprodutibilidade

**Epic:** `CST-6` (F4) · **Componentes alvo: `charts`** (S4, S2 completa), **`web`** (bundle, rotas), **`backtest`** (`run_registry`), **`docs`** (ADR de motor) · **Gate: `Q10`, `Q11`, `Q13`**
**Depende de:** `04`, `06`, `07`

**Mandato, literal:** **entregue a distribuição; o limiar é parâmetro.** A proposta original pedia screener com coluna booleana; a tela **inverte** isso, e a razão está medida: *"spike de OI > 5% em 15m"* dispara **ZERO vezes em 8.631 janelas de BTCUSDT** (p99 = 0,7495%, máx **2,4017%**) e **27 vezes em 2.013 janelas de COTIUSDT** no campo notional. **Limiar absoluto é um filtro "não-BTC" disfarçado de sinal.**

## Itens

| # | item | requisito | componente |
|---|---|---|---|
| 8.1 | **Spike do motor de armazenamento**, com o critério declarado **antes** de rodar | `ADR-002`/D4, `CA-F4-24` | `docs` |
| 8.2 | Regra de **compactação × `knowledge_time`**: `compaction_epoch` por partição | `ADR-002`/D6 | `sentimento` |
| 8.3 | `run_registry` com `bundle_hash`, `window`, **`knowledge_time`**, hash de conteúdo das partições, `intrabar_convention` **e** `intrabar_decided_count` | `CA-F4-25`, `SPEC-001` §3.5 | `backtest` |
| 8.4 | Bundle de parâmetros **versionado e hasheável — que É a URL, não um CRUD** | `SPEC-001` §7 | `web` |
| 8.5 | **S4 bancada**: `distribution`/`scan`/`firing_rate`, histograma, bordas de bin por `(field, nature)` | `SPEC-001` §6 | `charts` |
| 8.6 | **S2 completa**: as-of com moldura impossível de não notar, marcação de fixture com **teclado obrigatório**, painéis restantes | `SPEC-001` §6 | `charts` |
| 8.7 | Primitivo `swing_point` em `<Anotacao>` — **zero algoritmo, zero limiar, zero "nível"** | `SPEC-001` §3.6, `Q20` | `charts` |
| 8.8 | Transporte ao vivo por **SSE com envelope de bucket** | `ADR-005`/D1, D2 | `web` |
| 8.9 | Grade canônica **versionada junto com o dado derivado** | `ADR-003`/FR-3 | `charts` |

## DoD — comando e universo

| # | critério | ação | universo esperado |
|---|---|---|---|
| **D8.1** | o limiar sai do código | `scan` com `Absolute{5.0}` sobre BTC/30d | **0 linhas**, e `distribution` mostra **`max = 2,4017`**, conferido por **DOIS caminhos independentes** (view vs recontagem sobre a tabela crua), **não pela mesma tabela duas vezes** |
| **D8.2** | `firing_rate` in-sample é tautologia e a tela **diz isso** | forçar `eval == calib` | a célula lê **`tautológico — janelas idênticas`**, nunca `1,04%`. OOS walk-forward (calibra 7 d, avalia o seguinte, n=23): média **1,404%**, **máx 12,847% = 12,8× o alvo**; com q=99,9, **52×** |
| **D8.3** | nenhum eixo tem default | carregar a tela **sem `ThresholdSpec` na URL** | **ZERO números derivados** |
| **D8.4** | `min_obs` devolve ausência | célula com `n_obs < min_obs` | **`—`**, nunca um número; e **`n_obs` efetivo POR PONTO** em toda saída de percentil/z |
| **D8.5** | a dispersão do z é **telemetria obrigatória** | exibir dispersão cross-símbolo | **≥ 4 símbolos.** Dispersão anômala é a assinatura de **janelas de tamanhos diferentes com o mesmo rótulo** |
| **D8.6** | bins com **bin de overflow contado** | 11 bordas propostas (teto 50%) no taker | **951 de 2013 (47,2%)** caem fora à direita, **máx 2055,3%** ⇒ bordas são atributo do `(field, nature)` |
| **D8.7** | histograma, **não só percentis** | distribuição de funding | **`p90 = p99` = o mesmo número**, e `>` vs `>=` muda o disparo de **9/1500 para 184/1500 (20×)**. O histograma **marca a massa pontual em `interestRate(símbolo, data)`** — `0.0001` em 665 símbolos, **`0` em 208**, `0.00005` em 2 |
| **D8.8** | métrica transversal carrega **`n` e o universo derivado do dado** | funding de BTCUSDT | o `72,2` publicado **não reproduz sob nenhum universo**: 69,47 / 70,97 / 75,07 / 76,00 / 76,38 |
| **D8.9** | **reprodutibilidade de verdade** | (1) roda `scan`; (2) ingere **observação atrasada de bucket DENTRO da janela já avaliada**; (3) roda de novo com **o mesmo** bundle e janela | **idêntico, OU o sistema RECUSA apontando divergência de `knowledge_time`.** Nunca número diferente em silêncio sob o mesmo `bundle_hash` |
| **D8.10** | **compactação ≠ dado novo** | compactar uma partição | `compaction_epoch` **incrementa**, `knowledge_time` **inalterado**, e o sistema **distingue as duas causas de hash novo** |
| **D8.11** | painel habilita por múltiplo da grade | TF=60m no painel de OI | **719/720 fechos com ponto**, painel **habilitado**. Cobertura: 1m **20,0%** · 5m **100%** · 15m **100%** · 60m **99,9%** · 240m **99,4%** · 1440m **100%** |
| **D8.12** | discos não fundem | janela de 24 h | `min(gap_px) > 0`, com **`2r + 2 <= espaçamento_px`**; acima de **~8,33 h em 1200 px** o painel **declara o downsample no título**. Aritmética: 1200 px / 24 h ⇒ **4,167 px**; disco r=4 com anel de 2 px = 12 px ⇒ **65% de sobreposição** |
| **D8.13** | bucket em formação **não é escondido** | render | `is_final = false`, visível. Aos 4 min de um bucket de 5 min: high definitivo conhecido em **77,4%**, low **78,8%**, ambos **56,6%**, **90,0% do range já aconteceu**. **`h`/`l`/`c` do bucket corrente NUNCA são lidos como finais** |
| **D8.14** | **nunca dois eixos Y no mesmo painel** | OI em `base_contracts` **ou** `notional_usd`, toggle | **nunca eixo duplo**: `p99\|Δ15m\|` do taker é **824,6%** contra **0,75%** do OI ⇒ o gráfico **inventaria uma correlação que não está no dado** |
| **D8.15** | idade só na borda direita | `viewport_fim < agora − cadência_nativa` | chip de idade **substituído** pelo rótulo absoluto da janela |
| **D8.16** | invariante de ordem, **por série** | `limiar_atraso <= asof_max_staleness_ms` | o teste **falha exibindo os dois números DA SÉRIE SOB TESTE** — nunca uma constante global (`ADR-006`/D4) |
| **D8.17** | S4 **declara-se retrospectiva** enquanto a rampa não resolver o balde | tela | escrito na própria tela. **`[NÃO SUSTENTADO hoje]`** varredura transversal ao vivo: 570 × 5 séries = **2,85 min/varredura se por endpoint, 14,25 se compartilhado** |
| **D8.18** | unidade nunca é inventada | render de `baseAsset` com prefixo numérico | `denom` **verbatim**, ou `contratos (multiplicador não resolvido)`, **e S4 recusa comparação cross-símbolo naquela linha** |
| **D8.19** | **o eixo aguenta a carga cheia** | coordenadas X contra `event_time` | **288 pontos + 1.440 candles no mesmo eixo, tolerância 0,5 px.** ⚠️ **`[NÃO MEDIDO]` — o maior risco técnico desta especificação** |
| **D8.20** | zero seleção é **informação** | `scan` com 0 linhas | **nenhum nudge para baixar o limiar.** A tela não empurra o owner na direção de mais disparos num instrumento que gasta capital dele |
| **D8.21** | o spike de motor tem critério **antes** | executar `ADR-002`/D4 | **espaço ≤ 2× o zipado da fonte** · **varredura de 30 d × 4 símbolos com `as_of` ≤ 60 s** · **fixture envenenada (3 classes) passa** · **`free -m` e `df -h` MEDIDOS** · latência de rede medida (candidato 5) |

## Não faz

Não desenha zona SMC, **não detecta estrutura**, não implementa gerenciador de presets (**produto prematuro**; sobrevive o bundle hasheável, que é a URL), não calcula métrica de performance, **não faz varredura ao vivo**, não dispara ordem, não pontua sinal, não ranqueia qualidade de setup.

## Falsificador da fase

**F-4 global:** o mesmo `bundle_hash` + `window` devolvendo número diferente **sem recusa**. E o par `D8.9`/`D8.10`: se uma compactação não for distinguível de dado novo, **a garantia se perde pela porta da manutenção**, em silêncio.
