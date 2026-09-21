# `DoD-9` FECHADO — duas janelas disjuntas, `faithful` nas duas

**Data:** 2026-09-21 · **Feature:** `candle-real-e-eixo-unico` · **Fase:** `01`
**Conserto que isto verifica:** `ADR-041` (offset do ciclo de klines `2,0 s` → `20,0 s`)

## A saída, copiada da máquina

Janela **A** — `[1789948980000, 1789957980000)` = `2026-09-21T00:03:00Z` → `02:33:00Z`:

```
symbol=BTCUSDT verdict=faithful
window: [1789948980000, 1789957980000) bar_policy=final_only minimum_bias_n=4
universe: origin_buckets=150 compared=600 absent=0 carried=0 divergences=0
  OPEN  n=150 pos=0 neg=0 zero=150
  HIGH  n=150 pos=0 neg=0 zero=150
  LOW   n=150 pos=0 neg=0 zero=150
  CLOSE n=150 pos=0 neg=0 zero=150
rc=0
```

Janela **B** — `[1789957980000, 1789966980000)` = `2026-09-21T02:33:00Z` → `05:03:00Z`:

```
symbol=BTCUSDT verdict=faithful
window: [1789957980000, 1789966980000) bar_policy=final_only minimum_bias_n=4
universe: origin_buckets=150 compared=600 absent=0 carried=0 divergences=0
  OPEN  n=150 pos=0 neg=0 zero=150
  HIGH  n=150 pos=0 neg=0 zero=150
  LOW   n=150 pos=0 neg=0 zero=150
  CLOSE n=150 pos=0 neg=0 zero=150
rc=0
```

```bash
(cd backend && .venv/bin/python -m src.modules.sentimento.infra.candle_fidelity_cli \
  --symbol BTCUSDT --window-start-ms <T0> --window-end-ms <T1> \
  --knowledge-time-ms $(date -u +%s)000)
```

## O critério, item a item

| exigência do arquiteto | janela A | janela B |
|---|---|---|
| `verdict=accepted`/`faithful` | ✅ | ✅ |
| `rc=0` | ✅ | ✅ |
| `n >= 150` buckets | ✅ `150` | ✅ `150` |
| duas janelas **disjuntas** | ✅ `A` termina onde `B` começa, sem sobreposição | |
| nenhum viés unilateral acima de `minimum_bias_n=4` em `HIGH`/`LOW` | ✅ `pos=0 neg=0` nos dois | ✅ |

**O contraste que dá sentido ao número.** O `[M-9]` que derrubou este `DoD` media
`HIGH pos=0/neg=20`, `LOW pos=7/neg=0`, `n=34` buckets divergentes unilaterais em 2 janelas
`[MEDIDO 2026-09-20, laudo FASE-01-qa.md]`. Agora: `divergences=0` em `1.200` comparações
(`600` por janela). Não é viés reduzido — é viés ausente.

## ⚠️ O que estas duas janelas NÃO medem, e não deixo implícito no `faithful`

**`VOLUME` não está no universo deste instrumento.** `compared=600` é `150` buckets × **4**
campos (`OPEN`/`HIGH`/`LOW`/`CLOSE`). E o `VOLUME` era o sinal mais FORTE do `[M-9]`
(`pos=0/neg=48`, o mais unilateral de todos).

Quem mede volume é a escada de `ADR-041`: `+2s` → `32/52` buckets com volume divergente;
`+5s` → `3`; **`+10s` e `+30s` → `0`** `[MEDIDO 2026-09-19, n=52]`. O offset em produção é
`20 s`, que é `2×` o menor degrau limpo. **Então o volume está coberto por medição — só não por
ESTA medição.** Um `faithful` aqui não é certificado sobre volume.

## O falsificador que repete isto sozinho

`test_the_klines_poll_fires_after_the_origin_has_settled_the_bar_never_before`, offline, dentro
de `make verify`. Reprova se o `2.0` voltar. **Nada mais na suíte pegaria a volta:** o coletor
fica saudável, o run fecha `ACCEPTED`, `n_published` bate — e cada vela sai estreita.

## O que continua aberto e NÃO é coberto por este laudo

- **O dado gravado antes de `2026-09-21T00:03:00Z` continua sendo prefixo.** `ADR-041` conserta
  a escrita daqui para frente; não reprocessa o passado. Decisão de limpar/re-popular é do owner.
- **`lock_timeout` no `ALTER` de boot + `PYTHONUNBUFFERED=1`** no `deploy/compose.yml` — ver
  `ESCALADO-api-idle-in-transaction.md`. Sem dono.
