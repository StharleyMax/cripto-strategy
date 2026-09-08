# Gate quant-architect — necessidade do poller intraday de OI (F3) e valor da agregação multi-exchange

**Data:** 2026-09-08 · **Feature:** `coinalyze-fora-da-quarentena` (filha de `plataforma-dados`) ·
**Escopo:** só F3 (condicional a `[Q4]` de `PRD-005`). F1/F2 (`SPEC-005`/`ADR-033`) já aceitos, fora
de discussão.

## Pergunta 1 — F3 é necessária para o v0?

**Veredito: NÃO. F3 fica fora do v0, sem travar `advance`.**

Evidência, em ordem de força:

1. `[DOC: docs/context/coinalyze-fora-da-quarentena/handoff_to_architect.md:13]` — o próprio handoff
   do PM ao `/architect` já registrou a condicionalidade: *"F3 condicional (cadência de produção do
   coletor, só se `[Q4]` vier 'sim' do owner)"*. F3 nunca esteve no caminho crítico do v0; é item de
   menu do owner (`M2`, linha 28), não decisão de arquitetura antecipável.
2. `[DOC: handoff_to_architect.md:23]` — §1.4 do PRD já concluiu, com evidência de mecanismo
   (retenção por resolução, `medicao-coinalyze.md:38-40`) e de decisão prévia (`ADR-027/D1`: coletor
   one-shot nunca vira container de vida longa), que a Coinalyze **não precisa de coletor contínuo**.
3. `[MEDIDO 2026-09-08]` — `find backend/src/modules -maxdepth 1 -type d` devolve só
   `backtest`, `charts`, `sentimento` (+ `__pycache__`). **Não existe `convergencia`.** Um poller
   intraday de OI hoje não teria consumidor: seria dado produzido para uma camada que ainda não
   existe — exatamente a "dependência falsa" que o handoff pediu para evitar.
4. O caso de uso citado pelo owner (*"rompimento no SMC precisará de confirmação em CVD e OI"*) é
   sobre o Módulo C (matriz de convergência), que ainda está em `SPEC_DRAFT` nem começou a ser
   desenhado. Construir o poller antes do consumidor é otimizar uma interface que ainda pode mudar de
   formato quando a convergência nascer (ex.: pode precisar de OI por bucket alinhado a candle
   fechado, não de série contínua — decisão que só a SPEC de `convergencia` vai fixar).

**v0 fecha com F1+F2** (probe em regime + persistência, fórmula MODELED + promoção), ambos sobre o
`coinalyze_one_shot_cli` diário que já existe — nenhuma peça de F1/F2 depende de OI intraday.

**Gatilho de reabertura, com endereço (mesmo padrão de `CLAUDE.md` §linha 11):** quando a SPEC do
módulo `convergencia` (ainda não escrita) definir o contrato de entrada de OI que o gatilho de
rompimento SMC consome (granularidade, alinhamento temporal com o candle, tolerância de lookahead).
Só então F3 tem consumidor real e a decisão de fonte (pergunta 2) deixa de ser prematura. Até lá,
F3 permanece dívida com dono declarado (owner, via `[Q4]`), não item de v0.

## Pergunta 2 — OI agregado multi-exchange (Coinalyze) tem valor real sobre Binance single-exchange?

**A pergunta como formulada no handoff carrega uma premissa que a medição já derrubou — corrija antes
de decidir.**

### 2a. "Coinalyze agrega OI nativamente" é falso — já medido

`[DOC: docs/medicao-coinalyze.md:14-29, medido 2026-08-25]`:
```
curl -sS -H "api_key: $COINALYZE_API_KEY" https://api.coinalyze.net/v1/exchanges
curl -sS -H "api_key: $COINALYZE_API_KEY" https://api.coinalyze.net/v1/future-markets
# 28 exchanges (Binance = 'A') · 5.127 mercados · 764 perpétuos na Binance
```
Todo mercado carrega um campo `exchange` obrigatório apontando para UMA exchange. Não existe símbolo
agregado; a palavra `aggregated` não aparece na doc oficial. O texto do handoff (linha 33: *"Coinalyze
agrega OI de MÚLTIPLAS exchanges"*) descreve uma VISUALIZAÇÃO do site da Coinalyze ("Aggregated OI
Delta Profile" no screenshot do owner), não uma capacidade da API que este projeto consome. Consumir
"OI agregado" via Coinalyze custaria **N chamadas (uma por exchange) + agregação nossa** — exatamente
o mesmo trabalho de agregação que consumir N APIs nativas (Binance + Bybit + OKX) exigiria. **A
Coinalyze não entrega agregação de graça; entrega um schema uniforme sob 1 API key/rate limit para 28
exchanges**, o que é economia de engenharia (não construir N adaptadores bespoke), não economia de
sinal.

### 2b. A premissa "Binance domina o volume, logo agregação é ruído desprezível" também não se sustenta bem

`[DOC: CoinGlass, "2026 Q1 Cryptocurrency Market Share Research Report", via WebSearch 2026-09-08]` —
Binance responde por **~30% do open interest médio diário** entre as top-10 exchanges de derivativos
no Q1 2026 (~US$23,9 bi de ~US$79,8 bi implícitos), com OKX/Bybit/Gate compondo o resto. Isto é
liderança clara, não dominância que torne os outros ~70% desprezíveis. Rotulo isto **[DOC, fonte
externa, não Binance/Bybit/Coinalyze API docs — força menor que doc oficial, mas verificável]**, não
`[MEDIDO]` (não medi eu mesmo via API paga).

### Conclusão da pergunta 2 (opinião de domínio, rotulada)

`[OPINIÃO]`: **se e quando** a camada de convergência existir e precisar de OI como confirmador de
rompimento SMC, há razão para preferir OI agregado multi-exchange sobre Binance-only — 30% de
cobertura deixa boa parte do delta de posicionamento fora do sinal. Mas isso **não** significa "use
Coinalyze para conseguir a agregação": a Coinalyze não agrega nativamente (2a), então o custo de
implementação de "OI agregado via Coinalyze" (N chamadas + merge) e "OI agregado via APIs nativas" (N
adaptadores + merge) diverge principalmente em superfície de integração (1 API key vs N), não em
esforço de agregação em si. Esta é uma decisão de **arquitetura de ingestão**, a ser tomada quando F3
tiver consumidor — não uma vantagem de sinal que justifique adiantar F3 hoje.

## Recomendação final

1. `advance` de `coinalyze-fora-da-quarentena` **não deve ser bloqueado** por F3.
2. Corrigir o handoff/PRD futuro para não repetir "Coinalyze agrega OI nativamente" — é leitura de UI,
   não de API; a matriz de convergência vai precisar dessa distinção quando desenhar o adaptador real.
3. Quando `convergencia` nascer e F3 for revisitada: decidir fonte de OI ali, com o contrato de
   consumo da convergência na mão — não antes.
