# Handoff — fase `05` (liquidações), **metade backend apenas**

> Despachado em 2026-09-12. Plano: `docs/plans/SPEC-007-cinco-metricas-do-core/05_liquidacoes.md`.
> Tasks: `docs/context/cinco-metricas-do-core/tasks.toml:709-832`.

## O escopo é RECORTADO, e o recorte não é preferência — é o `PLANO-PARALELISMO`

**Entra:** `T-05.1` ∥ `T-05.4` (Lote 5-1A) → `T-05.2` (Lote 5-1B, **sozinha**) → `T-05.3`
(Lote 5-2A) → `T-05.5` → `T-05.6` → `T-05.7`.

**⛔ NÃO entra, e pare antes de tocar:**

| task | por quê |
|---|---|
| `T-05.8` | hot file `H2` (`use_cases/series_catalog.py`), e a **fase 04 está em curso agora** escrevendo nele (`T-04.4`). `depends_on = ["T-05.3","T-04.4"]` — a segunda aresta não está satisfeita |
| `T-05.9`/`T-05.10`/`T-05.11` | painel novo, hot file `H4` (`SymbolClient.tsx:239-246` + tipo `S2Panels`). `PLANO-PARALELISMO:218` nomeia ESTE par como a razão de `04 ∥ 05` ser impossível |
| `T-05.12`/`T-05.13`/`T-05.14` | dependem das acima |

Ao terminar `T-05.7`, **escreva o estado em `handoff/FASE-05-CONTINUACAO.md` e devolva.** A fase
não fecha nesta rodada, e tentar fechá-la é o conflito garantido que o plano já mediu.

## O que a fase 03 provou uma hora atrás, e vale aqui

O corte estava em DOIS lugares, não num. Havia cliente de produção pronto (`T-07.1`) **sem coletor
nenhum** — `md.ingest_run` não listava o endpoint. Aqui a forma é a mesma: `infra/coinalyze_history_client.py`
e `infra/https_quota_probe.py` **existem** e `T-05.5` manda reusá-los, **não reinventar** (`MEDIÇÃO §6`).
Confirme com `md.ingest_run` o que está de pé antes de escrever a primeira linha.

## Ordem obrigatória e o motivo de cada aresta

1. **`T-05.1` ANTES de `T-05.3`.** `denom` entra na identidade (`series_key.py:226`): fixá-lo depois
   de gravar é **migração, não correção**.
2. **`T-05.2` sozinha na janela.** `[COTA]` — teto de 40 unidades por janela **deslizante** de 60 s
   `[MEDIDO 2026-09-10, n=41 requisições]`. Dois medidores na mesma chave se envenenam.
   `T-05.4` pareia com `T-05.1` justamente porque tem **zero rede**.
3. **`T-05.5` é a task mais larga do plano** (`RS-3.1..RS-3.7`, sete requisitos, cada um com teste).
   Passando de ~150 turnos: handoff em `handoff/T-05.5.md` e devolva.

## Cota — e a frase que já custou caro aqui

**MÉDIA NÃO É PICO.** A janela é deslizante de 60 s; um ciclo disparado de uma vez ocupa a janela
inteira e a próxima retentativa toma `429` mesmo com o orçamento médio em 20%. Requisições
**espalhadas** (`RS-3.6`). Recuo obedece o `Retry-After` **da resposta** (observados 49,1 s / 56,8 s /
59,0 s) — recuo fixo cego é proibido (`RS-3.2`).

## A chave

`$COINALYZE_API_KEY`, lida de `.env` por `os.environ` **sem default**. **Nenhuma chave em documento
ou código, nunca** — `CLAUDE.md`. `T-05.4` entrega um grep que **morde e cala**: sem o par, o `rc=0`
é indistinguível entre "não há chave" e "o instrumento não sabe procurar" (`ADR-012`).

## O falsificador desta fase — ele pode DERRUBAR uma decisão do owner

`T-05.2`: se a retenção real de `liquidation-history` for **menor** que o tempo entre uma queda de
coletor e o alarme de liveness, a recuperabilidade que justificou `ADR-036/D4` é **teórica** e a
decisão de tirar o socket do caminho crítico tem de ser reaberta. Baseline documental a confirmar ou
refutar: ~1,5 dia a `1min`, ~7 dias a `5min` (teto por **contagem** de pontos, ~2.000)
`[DOC: MEDICAO §5]`. **Meça; não propague o baseline.**

## Série ESPARSA — o erro é de TIPO, não de UX

Ausência é `SEM_PONTO`, **nunca zero**. Zero liquidação num minuto é fato legítimo; zero porque o
cano morreu é defeito. Por isso `T-05.7` mede **contiguidade e heartbeat, nunca taxa** — um detector
por taxa devolve o mesmo número nos dois casos, e foi exatamente assim que o `!forceOrder@arr` ficou
**~46 h** mudo sem que nada acusasse (`ACHADO-FORCEORDER.md`, `n=2` runs).

## DoD desta rodada (subconjunto do DoD da fase)

1. `select count(*) from md.series` para `sum_liquidation`, **as duas coortes**, `> 0`. Hoje: `0`.
2. Run fechado com `n_written > 0` em `md.ingest_run`.
3. **Nenhum veredito `REJECTED` com `api_code` E `notes` ambos nulos** na fonte desta fase. Hoje, no
   `!forceOrder@arr`: **2 de 2 violam** `[MEDIDO 2026-09-10]`.
4. Retenção medida, com comando e `n`, em `gates/`.
5. `denom` decidido por medição, em `gates/falsificador-denom-liquidacao.md`, **antes** de `T-05.3`.
6. Teste de cota com fonte injetada: o coletor **recusa** passar de 40 u/60 s e um ciclo `N=10` não
   dispara em rajada.
7. `make verify` — e se a máquina estiver disputada, diga `INDETERMINADO`, não "verde".

⚠️ **`INDETERMINADO` não é verde.** Há 2 outros builders rodando; `pytest` concorrente já produziu
`rc=1` ambiental aqui hoje. Se acontecer, **falsifique** (rode de novo, isole) antes de reportar.

## Regras da casa que valem sem exceção

- Commit **sem** `Co-Authored-By`, em nenhuma caixa. Autor = owner. O hook reprova.
- **Nenhum número sem o comando, o universo (`n`) e o rótulo de força.**
- **Nunca seedar dado sintético no Postgres compartilhado** — já vazou para a tela do owner.
- Mensagem de `raise`/`Error` em **inglês**; identificador em inglês; docs em português.
- **Commite antes de devolver.** Worktree removida com trabalho solto já perdeu relatório aqui.
