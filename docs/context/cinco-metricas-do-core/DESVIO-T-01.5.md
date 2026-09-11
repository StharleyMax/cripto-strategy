# Desvio aberto: `T-01.5` não implementou `ADR-035/D3` como a ADR exige

**Status: ABERTO.** Precisa de decisão do `/architect`. Não fechar a fatia `01` sem resolver.

## O que a ADR exige, literal

`ADR-035/D3`, sob o título **"Restrições, e elas não são negociáveis"**:

> *"a troca é **no handler do processo de serviço** (escritor, coletor), nunca no handler de
> projeção."*

## O que foi implementado

A distinção saiu do **handler** e foi para o **registro**: um formatador único imprime `extra`,
e a garantia passa a ser que **código de projeção nunca passa `extra=`** — protegida por uma
varredura AST (0 infratores em 9 módulos) e 13 testes.

## Por que divergiu — e a causa sou eu, não o builder

O lote `1B` do `PLANO-PARALELISMO.md` colocou `T-01.4` e `T-01.5` em paralelo, e `T-01.4` é dona
de `single_writer_cli.py`. Instalar o handler de serviço exige editar exatamente esse arquivo.
Eu instruí o builder de `T-01.5` a **parar e reportar** nesse caso — ele reportou, e escolheu um
mecanismo que cabia no escopo em vez de violar o lote.

⇒ **O agrupamento de paralelismo forçou um desvio de desenho.** É um custo do paralelismo que
o plano não previu: ele mapeou colisão de arquivo entre tasks, mas não que a **restrição de
escopo tornaria uma task impossível de cumprir como especificada**.

## Por que o mecanismo implementado é mais fraco

| | ADR (handler) | implementado (registro) |
|---|---|---|
| garantia | **estrutural** — o handler de projeção não consegue imprimir `extra` | **convenção + teste** — ninguém escreve `extra=` em projeção |
| falha possível | nenhuma por construção | alguém adiciona `extra=` num módulo de projeção **novo** que a varredura AST não enumere |

A varredura cobre **9 módulos** hoje. Um 10º módulo de projeção nasce fora dela a menos que
alguém lembre de incluí-lo. É a classe de portão que `CLAUDE.md` chama de allowlist que erode.

## As duas saídas

1. **Instalar o handler depois que `T-01.4` liberar o arquivo** — task de acompanhamento na
   fatia `01`, e aí `D3` é cumprida como escrita. Custo: +1 task, e ela toca um arquivo que
   acabou de mudar.
2. **`/architect` emenda `D3`** aceitando a distinção por registro, e declara o custo da
   enumeração AST. Custo: uma restrição marcada "não negociável" passa a ser negociada — e o
   motivo é conveniência de agendamento, que é o pior motivo possível para relaxar contrato.

**Recomendação: (1).** A restrição foi marcada não-negociável com motivo declarado (contaminar
`stdout` de projeção quebra consumidor em silêncio), e o que a bloqueou foi um artefato do meu
lote, não uma descoberta sobre o desenho.

## O que NÃO está em dúvida

A `T-01.5` está **verde e é ganho real**: `make verify` 6 portões, 1961 testes, 4 mutantes
plantados e 4 mortos, cobertura 100% do arquivo. Hoje o log não imprime contador nenhum; depois
dela, imprime. O desvio é sobre **qual mecanismo garante a separação**, não sobre se ela existe.
