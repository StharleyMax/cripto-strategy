# ADR-004 — Reconexão de stream sem identificador de sequência

**Data:** 2026-08-25 · **Status:** proposto · **⚠️ Esta decisão é GATE DE F0** · **SPEC:** [`SPEC-001`](../specs/SPEC-001-plataforma-dados.md) §5.4
**Fase/Epic:** decisão precede F0 (`CST-2`); registro consolidado em F5b (`CST-7`) · **Componente alvo:** `sentimento`
**Origem:** correção que o gate mandou carregar

## Contexto

O WebSocket da Binance **desconecta a cada 24 h por doc** `[DOC]` ⇒ **reconexão é rotina diária, não exceção**. E as duas classes de stream que F0 liga **não têm o mesmo instrumento de reparo**:

| stream | identificador de sequência | dump repõe? | subamostragem |
|---|---|---|---|
| `<symbol>@aggTrade` | **`agg_id`**, contíguo: `a[i+1] == a[i]+1`, **0 saltos em 8.873.078 linhas** `[MEDIDO]` | **sim**, desde 2019-12-31 | não |
| **`!forceOrder@arr`** | **NENHUM** | **não existe `liquidation*` no dump** `[MEDIDO]` | *"only the latest one liquidation order within 1000ms will be pushed"* `[DOC]` |

**Uma regra única para as duas é um defeito**, e o motivo é assimétrico: em `aggTrade` a sobreposição é **detectável e descartável** e o buraco é **reparável**; em `!forceOrder@arr` a sobreposição **duplica sem detecção** e o buraco **não volta de fonte nenhuma**.

**E há uma incerteza de semântica em cima:** a doc se contradiz entre `latest` e `largest` (`SPEC-001` §5.10) — `[NÃO VERIFICÁVEL HOJE]`.

## Decisão

**Uma política POR CLASSE de stream. Três classes, e a terceira existe porque a segunda não tem instrumento.**

### Classe A — stream com identificador de sequência contíguo (`aggTrade`)

| regra | conteúdo |
|---|---|
| A1 | Reconecta com **sobreposição deliberada**; dedupe por **`agg_id`**, que é exato |
| A2 | Buraco detectado por **contiguidade**, nunca por taxa — a vazão do mesmo símbolo variou **3,66×** entre dois dias da mesma semana (55,6 vs 15,2 msg/s) e **o pico não escala com o volume** (3.468 msg/s num dia com 43% menos trades) `[MEDIDO]` |
| A3 | Buraco vira **linha em `md.ingest_gap`** e é **reparado do dump** quando ele publicar; até então a série carrega a descontinuidade **visível**, não costurada |
| A4 | **Nunca** `first/last trade_id` como invariante: **11.327 descontinuidades de `f/l` (0,862%) contra 0 de `agg_id`** no mesmo arquivo `[MEDIDO]` |

### Classe B — stream SEM identificador de sequência e SEM reposição (`!forceOrder@arr`)

| regra | conteúdo |
|---|---|
| B1 | **Sobreposição é obrigatória, não tolerada.** Duas conexões ativas durante a janela de troca, com fechamento da antiga **depois** de a nova receber a primeira mensagem. Buraco é irreversível; duplicata é reparável |
| B2 | **Chave natural de dedupe declarada e publicada:** `( symbol, side, price, orig_qty, trade_time )` do payload de ordem forçada, **mais `received_at` do observador** como desempate de gravação. **A chave é declarada, não presumida** |
| B3 | **A taxa de colisão da chave natural é PUBLICADA**, por símbolo e por dia, e a **direção do viés residual é escrita**: colisão não resolvida ⇒ **subcontagem**. ⇒ toda soma sobre essa série é **limite inferior**, e a tela escreve isso ao lado do número |
| B4 | O payload cru grava **nome do stream + data do snapshot da doc**, porque a semântica `latest\|largest` é a única forma de ser pinada depois |
| B5 | **Toda estatística de tamanho sobre essa série carrega, na PRÓPRIA SAÍDA, o rótulo `semântica de subamostragem NÃO RESOLVIDA (latest\|largest)`** — não só no payload. Acréscimo desta ADR ao que o handoff propôs: rótulo em coluna de payload **não chega ao consumidor de máquina**, e é consumidor de máquina que calcula percentil |

### Classe C — polling (`premiumIndex`, snapshot, probe, spread contingente)

| regra | conteúdo |
|---|---|
| C1 | Sem reconexão: **janela fechada e enumerada a priori** (`SPEC-001` §5.7). Falha é `verdict` em `md.ingest_run`, com `api_code` |
| C2 | **Nunca** cursor derivado da resposta: `openInterestHist` com `startTime` sozinho devolve **a cauda de hoje, HTTP 200, sem aviso** — comportamento **não documentado** `[MEDIDO]` |

## Alternativas recusadas

| alternativa | por que |
|---|---|
| **Reconexão sem sobreposição** (fecha, abre) | em Classe B produz buraco **irreversível** a cada 24 h, na única série cujo histórico não volta por preço nenhum. Custo: um buraco por dia, para sempre |
| **Dedupe por hash do payload cru** | o payload de duas mensagens idênticas de liquidações **realmente distintas** (mesmo símbolo, mesmo preço, mesmo tamanho, mesmo ms) é idêntico ⇒ **subcontaria eventos reais sem registrar que subcontou**. B2+B3 fazem a mesma coisa **medindo e publicando o viés** |
| **Uma regra única para as duas classes** | ou aplica a Classe A à B (dedupe por sequência que não existe), ou aplica a B à A (sobreposição e chave natural onde há `agg_id` exato) — **e a segunda descarta o único detector exato que este projeto tem** |
| **Esperar a doc ser corrigida para ligar o coletor** | *"não se resolve lendo mais doc — a doc é que se contradiz"*. E esperar custa **liquidação intraday que não volta** |

## Falsificador

**Se, sobre ≥ 30 dias de captura, a taxa de colisão da chave natural de B2 for maior que a taxa de reconexão** (isto é, se a chave colidir mais entre eventos genuinamente distintos do que entre duplicatas de sobreposição), **então B2 está subcontando mais do que B1 está protegendo**, e a política de Classe B está errada — o caminho passa a ser **gravar tudo sem dedupe** e resolver a duplicata na leitura, com a contagem bruta preservada.

**Segundo falsificador:** se a razão `Σ(capturado_dia) / agregado_diário_Coinalyze` (`CA-F0-14`) ficar **acima de 1** por símbolo e por lado, há **duplicata não removida** — e B1+B2 não estão fazendo o que esta ADR diz. **Ressalva que vai junto, sem ela o teste engana:** não se sabe se a Coinalyze constrói o agregado dela a partir do **mesmo** stream subamostrado. Se sim, a razão tende a 1 e **não prova nada**; se não, ela mede a perda. **As duas saídas informam sobre em qual caso estamos.**

## Consequência

- **B3 torna a subcontagem um número publicado em vez de uma ressalva de rodapé.** Isso é o que permite `CA-F0-14` ser um critério e não uma curiosidade.
- O registro consolidado desta decisão é `CST-7` (F5b); **a decisão em si precede a primeira linha do coletor de F0** — e é por isso que ela é gate.
