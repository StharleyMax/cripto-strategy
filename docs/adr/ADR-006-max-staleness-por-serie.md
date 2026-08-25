# ADR-006 — `max_staleness` por série, com dois defaults de nomes diferentes

**Data:** 2026-08-25 · **Status:** proposto · **SPEC:** [`SPEC-001`](../specs/SPEC-001-plataforma-dados.md) §2.5, §6.1
**Fase/Epic:** F2 (o campo no catálogo) e F4 (a invariante na tela) · `CST-4`, `CST-6` · **Componente alvo:** `sentimento` (catálogo) e `charts` (invariante de render)
**Origem:** o PRD nomeia o ADR e não o escreve — *"o default de tela é declaradamente diferente do default de `as_of`"*

## Contexto

`max_staleness_ms` é o argumento que decide **por quanto tempo uma observação continua válida** numa leitura `LOCF`. Ele aparece em dois lugares com propósitos opostos:

| lugar | pergunta que responde | consequência de errar |
|---|---|---|
| **tela** | *"por quanto tempo eu ainda desenho o último ponto conhecido?"* | um pixel a mais ou a menos de trilho |
| **`as_of`** | *"por quanto tempo o `backtest` pode usar este número como se fosse o valor corrente?"* | **decisão de capital tomada sobre dado velho** |

**O modo de falha é gravitacional, e já aconteceu neste corpus:** o `faseamento` §2.3 derrubou um `max_staleness = 600 s` que tinha sido **escolhido numa lente de UX** e virou, por proximidade, a constante citada em outra seção. **Uma constante escolhida para desenhar vira, por gravidade, o default do acessor que o `backtest` usa** — e ninguém percebe, porque o nome é o mesmo.

E há uma segunda razão para não haver constante: a **defasagem de publicação varia por endpoint e por região do observador** (`SPEC-001` §2.2), e a base empírica de hoje é **~13 minutos de relógio, um símbolo, um horário, com dispersão de 55% sobre n=2** `[MEDIDO]`.

## Decisão

### D1 · Dois campos, com nomes DIFERENTES, e nenhum deles se chama `max_staleness`

```
render_max_staleness_ms   -> lente de tela.   Dono: `charts`.
asof_max_staleness_ms     -> acessor de leitura de decisão. Dono: `sentimento`.
```

**Não existe um campo chamado `max_staleness_ms`.** O nome ambíguo é removido do vocabulário, porque **foi o nome que permitiu a confusão** — não a constante.

### D2 · Os dois vivem no bundle, POR SÉRIE, com `verified_by`

Nenhum dos dois é constante global, nenhum é constante de tela, nenhum tem valor default de código. `verified_by` aponta **a medição** que sustenta o número: cadência nativa da série e `p99(defasagem)` para `(endpoint, observer_region)`.

### D3 · O acessor NUNCA cai no valor de tela

```
asof_max_staleness_ms ausente  =>  a leitura de decisão REPROVA
                                   (nunca herda render_max_staleness_ms,
                                    nunca assume a cadência nativa,
                                    nunca assume "infinito")
```

**Ausência é erro, não default.** Este é o mecanismo — sem ele, D1 é só uma convenção de nome.

### D4 · A invariante de ordem, por série

```
limiar_atraso <= asof_max_staleness_ms
```

Senão o painel **declara ausência antes de declarar atraso**, que é a ordem errada de dois avisos. Para série com cadência `c` e `p99(defasagem)` medida, `limiar_atraso = 2c + p99` **tem de ser ≤** ao `asof_max_staleness_ms` daquela série. **O teste falha exibindo os dois números DA SÉRIE SOB TESTE — nunca uma constante global**, porque foi a ilustração com constante que o `faseamento` derrubou.

### D5 · Série em quarentena não tem nenhum dos dois

`available_at IS NULL` ⇒ não há de que medir frescor. **A gaveta não recebe `asof_max_staleness_ms` "provisório"** — provisório aqui é o mesmo que abrir a quarentena pela porta do parâmetro.

## Alternativas recusadas

| alternativa | por que |
|---|---|
| **uma constante global** | a defasagem medida varia **68–201 s** entre endpoints, e a cadência varia de 1 min a 4 h. Uma constante é otimista para a série lenta e pessimista para a rápida — **e a otimista é a que envenena** |
| **um campo só, com o consumidor escolhendo o valor na chamada** | é o estado que produziu o defeito: o valor viaja da tela para o acessor porque **nada no tipo os distingue**. Nomes diferentes fazem o compilador/revisor ver a troca |
| **derivar `asof_max_staleness_ms` da cadência nativa** (`= k × interval`) | é a mesma classe da fórmula `available_at = create_time + native_period_s`, que está **QUEBRADA por medição: 361× otimista** contra o único canal medido. Fórmula sobre cadência ignora a defasagem de publicação, que é o que importa |
| **default "infinito" (LOCF sem limite)** | transforma toda lacuna em número, e a lacuna é informação: `nature = FLOW` com `LOCF` é **erro de tipo** |

## Falsificador

**Se existir um caminho de código em que uma leitura de decisão produza número com `asof_max_staleness_ms` não declarado** — herdado, inferido da cadência, ou assumido infinito — **D3 não está implementado e esta ADR é decorativa.**

**Teste que o expõe:** carregar o bundle **sem** `asof_max_staleness_ms` numa série e pedir `as_of` ⇒ **reprova**. E o teste espelhado, que é o que pega a gravidade: definir `render_max_staleness_ms = 600000` numa série, deixar `asof_max_staleness_ms` com o valor medido, e conferir que **a saída do acessor não muda em um bit**.

**Segundo falsificador:** uma série em que `limiar_atraso > asof_max_staleness_ms` passe pelo teste. Se passar, D4 não está sendo avaliada por série e voltou a ser constante.

## Consequência

- `Q19` (o `availability_probe_set`) **decide quais séries têm `p99(defasagem)` OBSERVED** e, portanto, quais têm `verified_by` de verdade. O que ficar fora nasce com `p99` **MODELED, conservador por construção, arredondado para cima** — e a série carrega isso por linha.
- Trocar a região do observador **invalida `verified_by`** de toda série calibrada na região antiga, porque a tabela de defasagem é chaveada por `(endpoint, observer_region)`.
