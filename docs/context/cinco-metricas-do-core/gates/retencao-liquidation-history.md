# `T-05.2` — Retenção real de `liquidation-history`: o falsificador de `ADR-036/D4`

> Rodado em 2026-09-12, `[COTA]` **sozinha na janela** (Lote 5-1B), como o `PLANO-PARALELISMO`
> manda — dois medidores na mesma chave se envenenam.

## Veredito

**`ADR-036/D4` SOBREVIVE ao falsificador, com folga de ~1 ordem de grandeza.**
E o **baseline documental estava errado — para menos, por 6,6×.** Não o propague.

## A medição

Um símbolo (`BTCUSDT_PERP.A`), janela pedida de **365 dias** (muito maior que qualquer retenção
plausível, de propósito), um `interval` por chamada. **5 chamadas**, espaçadas 2,0 s.

| `interval` | `n_points` | bucket mais antigo | **span real** | span se fosse contíguo |
|---|---|---|---|---|
| `1min` | 2.900 | 2026-09-02T15:10Z | **9,96 d** (239,07 h) | 48,33 h |
| `5min` | 2.592 | 2026-08-27T09:05Z | **16,21 d** (389,15 h) | 216,00 h |
| `15min` | 2.088 | 2026-08-18T00:45Z | **25,56 d** (613,49 h) | 522,00 h |
| `1hour` | 1.610 | 2026-07-07T01:00Z | **67,55 d** (1.621,24 h) | 1.610,00 h |
| `daily` | 365 | 2025-09-13T00:00Z | **364,59 d** (8.750,24 h) | 8.760,00 h |

`[MEDIDO 2026-09-12T14:14Z, n=5 intervalos × 1 símbolo = 5 chamadas]`

## O que isto REFUTA do baseline documental

`MEDICAO §5` dizia: *"~1,5 dia a `1min`, ~7 dias a `5min`, teto por **contagem** de pontos
(~2.000)"* `[DOC]`. **As duas metades caem:**

1. **A retenção é MAIOR, não menor.** `1min` mede **9,96 d** contra os ~1,5 d documentados —
   **6,6× mais**. A `5min` mede **16,21 d** contra ~7 d — **2,3× mais**.
2. **O teto NÃO é uma contagem fixa de ~2.000 pontos.** `n_points` varia 2.900 / 2.592 / 2.088 /
   1.610 / 365. Um teto por contagem daria o mesmo número em todo `interval`, e não dá.

O que os números parecem desenhar é uma **retenção em degraus por `interval`** (~10 d / ~16 d /
~26 d / ~68 d / 365 d), com o `daily` batendo exatamente em **1 ano**. ⚠️ *"Parecem desenhar"* é
leitura minha sobre 5 pontos de 1 símbolo — `[INFERRED: 5 intervalos, 1 símbolo, 1 instante]`,
não medição da política do fornecedor, que ele não publica.

## O número que importa para `T-05.7`, e ele saiu de graça aqui

Compare `span real` com `span se fosse contíguo` (= `n_points × interval`). Em `1min`:
**2.900 pontos cobrindo 239,07 h**, quando 239,07 h têm **14.344 buckets de 1 min**.

⇒ **apenas 20,2% dos buckets de 1 minuto têm liquidação** `[MEDIDO 2026-09-12, n=14.344 buckets
possíveis, 2.900 preenchidos]`.

Isto é a **série esparsa MEDIDA**, e não mais afirmada: **~80% dos minutos não têm liquidação
nenhuma, legitimamente**. O fornecedor devolve **só o bucket não-vazio**.

**É exatamente por isso que `T-05.7` não pode medir liveness por taxa:** um detector por taxa vê
"zero pontos neste minuto" em 4 de cada 5 minutos **saudáveis**, e vê a mesma coisa quando o cano
morreu. Foi assim que o `!forceOrder@arr` ficou ~46 h mudo sem nada acusar
(`ACHADO-FORCEORDER.md`). Agora o número que torna a taxa inútil está medido: **20,2%**.

E isto também explica por que o `daily` tem **365 de 365**: agregado em um dia, *sempre* há
liquidação — a esparsidade é uma propriedade da **grade**, não do mercado.

## Por que o falsificador não disparou

O falsificador é literal: *"se a retenção real for **menor** que o tempo entre uma queda de
coletor e o alarme de liveness, a recuperabilidade que justificou `ADR-036/D4` é teórica"*.

- **retenção no intervalo mais apertado (`1min`): 9,96 dias** `[MEDIDO]`;
- **tempo até o alarme de liveness:** a cadência adotada é **5 min** (`RS-3.5`, `SPEC-007` §6.3)
  e o detector de `T-05.7` é por heartbeat/contiguidade ⇒ ordem de **minutos**, e mesmo um
  operador que só olhasse uma vez por dia daria **~1 dia**.

`9,96 d` contra `~1 d` no pior caso realista ⇒ **folga de ~10×**. E como o custo de uma
requisição **independe da janela pedida** `[DOC: MEDICAO §4.2.3-§4.2.5]`, recuperar 9 dias custa
**as mesmas unidades** que recuperar 5 minutos: **1 requisição por símbolo-endpoint**.

⇒ A recuperabilidade que `ADR-036/D4` comprou é **real e medida**, não teórica. O socket
(`!forceOrder@arr`) pode continuar fora do caminho crítico.

## O contraste que dá sentido ao número

O `!forceOrder@arr` ficou **~46 h** mudo `[DOC: ACHADO-FORCEORDER.md, n=2 runs]` — hoje já são
**5 runs, todos `REJECTED`, `n_written=0`** `[MEDIDO 2026-09-12]`. Sendo WebSocket, **aquelas 46 h
estão perdidas para sempre**. As mesmas 46 h de queda num coletor REST sobre esta fonte
custariam **uma chamada por símbolo** para recuperar, e sobrariam ~8 dias de margem.

## Comandos (literais) e o universo

```bash
# a medicao (5 chamadas Coinalyze, espacadas 2,0 s, sozinha na janela de 60 s)
python3 scratchpad/retention_probe.py
# universo: 5 intervalos x 1 simbolo (BTCUSDT_PERP.A), janela pedida = 365 d

# o contraste do socket (n=5 runs)
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At \
  -c "select endpoint, verdict, count(*), sum(n_written) from md.ingest_run group by 1,2 order by 1,2;"
```

**Cota gasta: 5 chamadas** `[MEDIDO]`, contra o teto de 40 por janela deslizante de 60 s — **12,5%
do teto**, espaçadas, sem rajada e sem nenhum `429`.

## O falsificador DESTE documento

A medição é de **um símbolo, num instante**. Se `BTCUSDT_PERP.A` tiver retenção diferente de um
símbolo de baixa liquidez (plausível: o teto pode ser por **contagem de linhas armazenadas**, e
um símbolo ilíquido acumula menos linhas por dia, logo alcançaria **mais tempo**, não menos),
o número muda — **mas na direção segura**. Para derrubar `ADR-036/D4` seria preciso achar um
símbolo com retenção **abaixo de ~1 dia** a `1min`. Não medido: `[NÃO MEDIDO]` para os demais
símbolos do universo.
