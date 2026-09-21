# Pauta de decisão — `[M-9]` na vela, e o que fazer com a fase `01`

`[DECISÃO-OWNER: 2026-09-20]` — *"o arquiteto tem autonomia para decidir caminho nessas questões.
N é um fato que precisa vim ao owner"*. ⇒ **Decida e execute. Não escale de volta.**

## O fato, medido e reproduzido

`candle_fidelity_cli` sobre o poll VIVO, janelas disjuntas, reproduzido pelo loop principal:

```
HIGH   pos=0  neg=9    ⛔ UNILATERAL — armazenado sempre ABAIXO da origem
LOW    pos=6  neg=0    ⛔ UNILATERAL — armazenado sempre ACIMA da origem
CLOSE  pos=37 neg=34   simétrico — ruído de corrida (lag ~2,3 s, trace=live_tail)
```

`[MEDIDO 2026-09-20, n=178 buckets por redução; o QA mediu 34 divergências em 2 janelas, 34
estreitando a vela, P≈2,3e-10]`. O próprio CLI imprime *"the `[M-9]` signature, not noise"*.

**Os dois erros apontam para o mesmo lado: a FAIXA da vela é subestimada.** Para leitura SMC — o uso
declarado do owner — pavio é onde a liquidez foi varrida; encurtar os dois extremos apaga o sinal.

## O que já está descartado, para não refazer

- **Não é o `build_klines_to_rows`**: o mesmo código serve o backfill, e o backfill reproduz a origem
  ao centavo nos 240 minutos do universo de `DoD-9` (`psql` direto). O defeito é do **poll vivo**.
- **Não é `CLOSE`**: ali a simetria é real e é corrida de 2,3 s.
- **Não é `LOCF`**: as divergências acima são de células ESCRITAS (`trace=live_tail`), não carregadas.
  ⚠️ Um achado anterior confundiu as duas e foi refutado — ver
  `gates/ACHADO-vela-viva-diverge-da-origem.md`. **Não repita.**

## As três decisões que são suas

**`D1` — a causa-raiz.** A hipótese em pé é snapshot intrabarra gravado como `final_only`: no instante
do poll o extremo ainda não aconteceu. Confirme ou derrube **com medição**, e decida o conserto.
**Dono declarado: `ADR-034`.** Se a correção exigir mudar o contrato, escreva a ADR.

**`D2` — a fase `01` fecha ou não.** O `DoD-9` é a métrica central da fase e está reprovado.
Alternativas, com o custo de cada uma declarado:
  - *consertar antes de fechar* — correto, mas a causa-raiz é de outra ADR e pode arrastar;
  - *fechar com `DoD-9` diferido e dono nomeado* — destrava a fase `02`, mas empilha o eixo único
    sobre vela que subestima a faixa;
  - *fechar com escopo reduzido* — declarar que a fase entrega a vela COM FORMA e não a vela FIEL,
    e mover fidelidade para uma fase/task própria.
  **Escolha uma e registre o porquê.** O owner delegou; não devolva a pergunta.

**`D3` — o achado do LOOKAHEAD não tem carregador.** `gates/T-01.5-dod6-medicao-e-achado-lookahead.md`
mostra que o backfill (2.148.504 linhas, 90,1 dias) **não é servível** porque `R-1` é
`available_at <= t` com `t` = a fatia. **Zero linha** sobre isso em `05_historia_sob_demanda.md`, na
`SPEC-008` e no `tasks.toml` `[MEDIDO pelo QA da fase 01]` ⇒ **a fase `05` está planejada sobre uma
premissa que o achado falsifica.** Decida onde ele entra e escreva lá.

## Contexto de leitura (⛔ use âncora, não leia inteiros)

- `docs/context/candle-real-e-eixo-unico/gates/FASE-01-qa.md` — o veredito `NEEDS_FIX` completo
- `docs/context/candle-real-e-eixo-unico/gates/T-01.7-builder.md` — o arnês e por que ele existe
- `backend/src/modules/sentimento/domain/candle_fidelity.py` + `infra/candle_fidelity_cli.py`
- o coletor que escreve a vela viva, sob `backend/src/modules/sentimento/`

## Fronteira

Roda em paralelo com a investigação da anomalia de **13,77 px** (`web`, outro agente).
- **teu**: `backend/**`, `docs/adr/**`, `docs/plans/SPEC-008-candle-real-e-eixo-unico/**`,
  `docs/context/candle-real-e-eixo-unico/**`
- **NÃO teu**: `frontend/**`, `deploy/**`
- ⛔ `docs/INDEX.md` é append-only. Commit sem trailer de co-autoria, autor é o owner.
- ⛔ Nenhum número sem o comando que o produziu. ⛔ Não grave no ledger — `gate-record` é do orquestrador.
