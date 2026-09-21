# ⛔ ACHADO REFUTADO — a vela NÃO tinha pavio truncado; era o degrau de LOCF

> ## ⚠️ ESTE DOCUMENTO ESTAVA ERRADO. Leia esta seção antes do corpo.
>
> **Refutado por `T-01.7` (CST-203) em 2026-09-19, e reproduzido de forma independente pelo loop
> principal — o mesmo que escreveu o erro.** O corpo abaixo fica **inalterado, de propósito**: apagá-lo
> esconderia como o erro foi cometido, que é a parte útil.
>
> ### Por que os dois "defeitos" não eram defeitos
>
> `klines_ohlc` é **`nature: STOCK`** e `CARRY_FORWARD_BY_NATURE[Nature.STOCK] = True`
> (`backend/src/modules/sentimento/domain/as_of_accessor.py:112`), com
> **`maxStalenessMs = 120_000`** sobre grade de **1 min** ⇒ **uma barra escrita responde DUAS fatias
> adjacentes, legitimamente.** Isso explica inteiramente o "defeito 1" (buckets idênticos): `n=1`
> barra escrita, nada duplicado.
>
> O "defeito 2" (`+41,00` no low) cai junto: eu comparei uma célula **arrastada** contra o minuto da
> origem em que ela foi desenhada. A prova é aritmética e o arnês a imprime —
> **`lag_ms = −53.993`** para aquela célula: `available_at` **ANTES** do instante que ela responde.
> Toda linha *escrita* tem `available_at >= bucket_end`; logo aquela célula foi **carregada**, não
> escrita.
>
> ```
> OPEN  t=1789852440000  origin=81001.10  carried=81023.00  delta=21.90  lag_ms=-53993
> ```
>
> ### ⭐ Como eu errei, que é o que vale guardar
>
> **Os dois campos que me refutam estavam na saída do catálogo que eu mesmo imprimi** — `"nature":
> "STOCK"` e `"maxStalenessMs": 120000` — e eu não os conectei. Comparei tela contra origem **sem
> primeiro perguntar se a célula era escrita ou arrastada.** A lição não é "confira mais"; é:
> **antes de acusar o dado, separe a célula ESCRITA da célula CARREGADA.** O arnês de `T-01.7` agora
> faz essa separação por construção e reporta as duas classes apartadas.
>
> ### ⛔ O defeito REAL que ficou no lugar (menor, e de outra natureza)
>
> `[MEDIDO 2026-09-19, reproduzido pelo loop principal numa janela de 3 h, n=476 comparações sobre
> 180 buckets de origem]` — `candle_fidelity_cli --symbol BTCUSDT --window-start-ms … --window-end-ms
> … --knowledge-time-ms …`:
>
> | redução | exatas | divergências | direção |
> |---|---|---|---|
> | `OPEN` | **119/119** | 0 | — |
> | `HIGH` | 116/119 | 3 | **3 neg** (armazenado ABAIXO da origem) |
> | `LOW` | 118/119 | 1 | 1 pos (armazenado ACIMA) |
> | `CLOSE` | 77/119 | **42** | `pos=22 / neg=20` — **atravessa o zero** |
>
> Todas com `writer trace = live_tail` e `lag_ms ≈ 2,3 s`. **O `CLOSE` é o defeito**: ~35% dos
> buckets erram, quase sempre por **um tick**, e o sinal é **simétrico** ⇒ **NÃO é o `[M-9]`**, cujo
> viés no volume era unilateral (`pos=0` em 4/4). O viés do volume **não se propagou** para a vela.
>
> ### ⚠️ Uma nuance que o veredito não cobre, e que eu levanto aqui
>
> `HIGH` divergiu **3/3 para baixo** e `LOW` **1/1 para cima** — as quatro divergências **estreitam a
> vela**. Separadas, nenhuma alcança o `minimum_bias_n=4` do arnês; **agregadas como "estreitamento
> de faixa" dariam `n=4`, unilateral 4/4**. `n=4` é amostra pequena e isto **não** derruba o veredito
> — mas a pergunta *"HIGH-negativo e LOW-positivo deveriam ser um único estatístico?"* é de
> `/architect` + `ADR-034`, e fica registrada em vez de perdida.
>
> ### O que continua `[NÃO MEDIDO]`
>
> A janela auto-verificável do owner (`2026-09-18 12:00→16:00 UTC`) seguia **`0/240`** — backfill em
> voo —, e o assert sobre a quádrupla está **declarado NÃO-EXECUTADO** com `rc=3` (`ADR-012`), não
> verde. Comando para repetir: `handoff/T-01.7-estado.md`.

---

## ⬇️ O TEXTO ORIGINAL, PRESERVADO COMO ESTAVA (e ERRADO nas conclusões)

# ACHADO — a vela gravada DIVERGE da origem, e o pavio sai truncado

**Medido pelo loop principal em 2026-09-19 ~21:20 UTC**, logo após o redeploy de `api`/`web`/`collector`
que destravou `DoD 1`/`DoD 3` da fase `01`. **Entrada direta para `T-01.7` (CST-203).**

## O que foi observado

Assim que a ponta ficou completa, `price_last_reading` saiu de `absent` para **`exact`** e
`price_candles` foi de `2/5760` para `4/5760`. Os 4 buckets completos, lidos por
`/api/v1/series-history` nas 4 reduções:

```
  20:25  6486750c=81301.90  a09ef785=81309.80  b8dc419e=81309.80  b99614b0=81280.10
  20:26  6486750c=81301.90  a09ef785=81309.80  b8dc419e=81309.80  b99614b0=81280.10
  21:13  6486750c=81001.20  a09ef785=81023.10  b8dc419e=81023.00  b99614b0=81001.00
  21:14  6486750c=81001.20  a09ef785=81023.10  b8dc419e=81023.00  b99614b0=81001.00
```

## ⛔ Defeito 1 — buckets adjacentes carregam valores BYTE A BYTE idênticos

`20:25` == `20:26` e `21:13` == `21:14`, nas **quatro** reduções, ao centavo. Dois minutos
consecutivos com o mesmo open, high, low E close não é comportamento de mercado — é **o mesmo
kline gravado sob dois `event_time`**. `n=4` buckets, `2/2` pares idênticos.

## ⛔ Defeito 2 — o PAVIO sai truncado contra a origem

Comparação com `https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1m`
(auto-verificável pelo owner no gráfico da Binance):

| bucket | nosso intervalo | origem (Binance) | erro no LOW |
|---|---|---|---|
| `21:13` | `[81001.00 , 81023.10]` | `O=81001.10 H=81023.00 L=80960.00 C=80966.60` | **+41,00** (nosso low ACIMA do verdadeiro) |
| `20:25` | `[81280.10 , 81309.80]` | `O=81301.80 H=81309.60 L=81299.80 C=81305.20` | **−19,70** (nosso low ABAIXO do verdadeiro) |

⚠️ **A conclusão NÃO depende de qual chave é qual redução.** Seja qual for o mapeamento, em `21:13`
o intervalo gravado span `[81001.00 , 81023.10]` enquanto o bucket verdadeiro span
`[80960.00 , 81023.00]`. **O nosso não contém o low da origem.** O `close` verdadeiro (`80966.60`)
não aparece em nenhuma das 4 reduções.

## A hipótese — e ela é a PREVISÃO de `[M-9]` se cumprindo no PREÇO

`[M-9]` (escalado pelo `/architect`) mediu que `klines_volume` **subestima a origem** em −2,2% a
−4,5%, com `pos=0` em 4/4 — assinatura de **snapshot intrabarra gravado como `final_only`**. O
aviso literal em `tasks.toml`: *"A vela de 01 anda no MESMO coletor ⇒ pode herdar o defeito, e um
HIGH subestimado é pavio encurtado que ninguém vê."*

O padrão de `21:13` é exatamente isso, do outro lado da vela: no instante do snapshot o preço já
tinha subido a `81023` e **ainda não tinha caído** para `80960`. Gravado como final, o pavio
inferior desaparece.

⚠️ **`[NÃO MEDIDO]`: qual caminho produziu estes pontos.** O backfill (CLI) e o coletor compartilham
`build_klines_to_rows` (que `T-01.3` levou de 2 para 6 tuplas), então o defeito pode estar no
compartilhado ou em só um dos dois. **`T-01.7` tem de separar os dois casos** — a janela histórica
`2026-09-18 12:00→16:00 UTC` ainda devolvia `0 pontos` nas 4 reduções quando isto foi escrito
(backfill em voo), então a comparação do caminho histórico continua por fazer.

## Por que isto NÃO invalida a fase 01

`CA-2` (a vela tem faixa) **passa** no que existe: `4/4` buckets com `high > low`, zero degenerada.
A vela deixou de ser a degenerada — este achado é sobre **fidelidade ao dado**, não sobre a forma.
E é precisamente o defeito que `DoD 9`/`T-01.7` foram escritos para MORDER antes de virar silêncio.

**⛔ `T-01.7` não conserta a causa-raiz** (é de `ADR-034` + `/architect`). Ela impede a feature de
propagar o defeito em silêncio para o preço — a diferença entre dívida declarada e defeito novo.
