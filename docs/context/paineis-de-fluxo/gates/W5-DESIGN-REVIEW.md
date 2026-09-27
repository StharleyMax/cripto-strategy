# `W5-DESIGN-REVIEW`: veredito do `ux-ui-mastery` no fim da wave `paineis-f04` (fase 04, pane fundido de liquidação)

**Veredito: APPROVED WITH CONDITIONS. Nota 65/100**, a mesma de `T-04.7`, porque o código medido é o mesmo. Nenhum
achado de severidade ≥ 3 é atribuível à wave. Ficam abertas as condições de `T-04.7` §4 (SF-16, SF-17 e SF-18,
todas com sev. ≤ 2) e uma observação nova de sev. 1 (§3). **Continuam escalados**, e nenhum deles reprova o design:
o E-7 (pipeline parado, **ainda** parado às 05:12Z) e a metade Stitch do `CA-12`.

```
Feature: paineis-de-fluxo · Wave: W5 (wave/paineis-f04) · HEAD a2d7c66 · referência master 613719a
Skill: ux-ui-mastery:design-review (10 domínios) · evidência de pixel reaproveitada de T-04.7 (§1)
```

## 1. Por que reaproveitar o screenshot de `T-04.7`, e com que prova

O despacho só autoriza reaproveitar os screenshots se `frontend/src` não tiver mudado desde o veredito de `T-04.7`.
Medi as duas condições, e a do dado também:

| condição | comando | resultado |
|---|---|---|
| o front não mudou desde a base de `T-04.7` | `git diff --quiet 0df6ded HEAD -- frontend/` | **rc=0** `[MEDIDO]`. Os 3 commits depois de `0df6ded` (`f87be59`, `e8b9aca` e `a2d7c66`) só mexem em `docs/` |
| a wave inteira está no universo de `T-04.7` | `git diff --stat master HEAD -- frontend/src` | **16 arquivos**, +2391/−1263. É o mesmo universo que `T-04.7` §3 (SF-12) citou e comparou com o `master` `[MEDIDO]` |
| o dado real está no mesmo estado da captura | `psql` só leitura (`default_transaction_read_only=on`): `max(bucket_end)` de `md.series` e as linhas da última hora | `2026-09-27 00:22:00Z`, **0** linhas na última hora, às 05:12Z `[MEDIDO]`. É o mesmo corte que `T-04.7` §1 mediu às 04:40Z. Uma captura nova veria o mesmo dado parado e não mudaria nenhuma das condições marcadas "não comparável" |
| identidade dos PNGs reaproveitados | `sha256sum *.png \| sha256sum` sobre `scratchpad/t047/out/` | 36 PNGs, digest `c684962f27b99c77`. A captura rodou entre 04:29Z e 04:55Z (`stat`: 04:38Z no PNG `1920x1080-15m`) `[MEDIDO]` |

Não subi app nem proxy nas portas 8847/4347. Com o front idêntico e o dado parado no mesmo bucket, uma recaptura
repetiria as 29 capturas de `T-04.7` byte a byte no que depende do código e da série, e **nenhum INSERT nem seed** foi
necessário para chegar a esta conclusão. O instrumento, o proxy só-GET (`refused=0`) e a referência `master` estão
em [`T-04.7-design-review.md`](T-04.7-design-review.md) §1 e em [`T-04.7-evidence/`](T-04.7-evidence/).

## 2. O que este validador releu com os próprios olhos

Não carimbei o laudo anterior. Abri dois PNGs e comparei o que vi com o que `T-04.7` §2 afirma:

- **`1920x1080-15m`, a tela inteira.** Um pane de gráfico com 5 linhas. A liquidação vem com a nota de terceiro, as
  duas pernas (`short □`, `long ■`), os dois selos de cobertura e a chave *"▁ ausente · ▃ zero do fornecedor · altura
  linear, a mesma escala nas duas pernas"*, tudo **acima** das barras: a última linha de texto fica em y ≈ 515 e as
  barras começam em ≈ 530. O SF-10 está fechado, como foi medido. As barras verdes ficam acima do zero e as vermelhas
  abaixo. Os dois selos repetem *"384 de 384"*, enquanto o volume diz *"143 de 384"*, que é o SF-18 do jeito que foi
  descrito. As barras ocupam ≈ 75 px de um pane de ≈ 217 px. Todas as leituras dizem `ausente`, e o OI mostra
  `DADO VELHO` com *"4 h 4 min"*, o que é verdadeiro pelo E-7.
- **`1280x800-1m-liq`, o recorte do pane.** A cascata de long a 1m aparece à esquerda como a barra vermelha mais
  alta, bem acima da mediana, que é o F-1 visível sem instrumento. As faixas de marca de cima e de baixo não invadem
  a área das barras, de acordo com o F-3. A chave cabe inteira.

Os dois PNGs **confirmam** o §2 de `T-04.7` e não contradizem nada nele.

## 3. Observação nova (sev. 1, preexistente, não reprova)

- **OBS-W5-1: a 1280 px, a nota de terceiro da liquidação perde a justificativa.** A linha termina em *"…medir a
  fidelidade contra, e pub…"*. O que sobra (*"Dado de TERCEIRO (coinalyze)"* e *"Erro publicado: NENHUM"*) é o que o
  operador precisa saber. O que se perde é o porquê. O texto é o `<p data-fact="liquidation_provenance:…">` de
  `SymbolClient.tsx:2583`, que já existia no `master` (`SymbolClient.tsx:2504` e `:3004` em `613719a`), e o corte com
  reticências é a decisão do `T-01.11-FIX` (SF-2, `SymbolClient.tsx:849`). `[NÃO MEDIDO: se o master corta no mesmo
  ponto a 1280, porque a referência de T-04.7 só foi capturada a 1920]`. **Recomendação:** mover a justificativa
  para um `title`/`details` ou para a nota de rodapé do pane, e deixar na linha só *"Fonte externa: coinalyze · erro
  publicado: nenhum"*. Dono: `web`.

## 4. Pontuação, pelos 10 domínios da skill

| domínio | nota | força principal | melhoria principal |
|---|---|---|---|
| Heuristic Compliance | 7 | H4 (consistência): a liquidação usa a gramática do volume, com escala linear, base 0 e marcas de ausente e zero | H2: numeral cru de 8 dígitos (SF-16) |
| Research Foundation | 7 | 5 falsificadores do design gate medidos no pixel real, com referência `master` pelo mesmo instrumento | nenhum teste com operador. `F-4` `[NÃO MEDIDO]` |
| Mobile Experience | 3 | — | fora do alvo (desktop de operador) |
| Desktop Experience | 7 | um pane, uma linha de zero e os dois lados num olhar. A 800 px o pane cabe inteiro na 1ª vista | a `5m`+ a legenda ocupa 60 % do pane (SF-18) |
| Visual Design | 7 | tokens de alta e baixa no lugar das barras brancas do `master`, e o SF-10 fechado | alinhamento do numeral entre as pernas (SF-17) e OBS-W5-1 |
| Accessibility | 7 | a perna se lê pela posição, pela palavra e pela forma do quadrado (vazado × cheio), não só pela cor (WCAG 1.4.1) | o `sr-only` "Leitura atual: ausente" diverge do numeral visível a `4h` |
| Interaction Design | 6 | crosshair coerente: 2 leituras em 120/120 posições, com x estável | SF-11 (≈ 4 s sem estado pendente) e SF-12 sem mudança |
| Future-Readiness | 6 | os atributos `data-liquidation-*` deixam o pane legível por máquina | sem mudança |
| System Architecture | 8 | o registry funde duas coortes num pane sem número com sinal no caminho | E-3/E-5: grade de 1 min em TF ≠ `1m` |
| Ethics & Content | 7 | nenhum número líquido e nenhuma magnitude com sinal. Ausente ≠ zero por perna | o selo "384 de 384" repetido e suspeito (SF-18) |

**Média: 65/100** `[MEDIDO: 7+7+3+7+7+7+6+6+8+7 = 65]`. Radar: `[7, 7, 3, 7, 7, 7, 6, 6, 8, 7]`. Nenhuma nota muda em
relação a `T-04.7`, porque o código é o mesmo e a OBS-W5-1 (sev. 1) não chega a mover o domínio Visual.

**Top 3 forças:** (1) *"qual lado foi varrido"* se lê de relance: a cascata de long sai 53× a mediana, embaixo e em
vermelho. (2) Não há caminho visual para um número líquido ou com sinal. (3) A fusão fechou o SF-10, o defeito
visual mais antigo da liquidação.

**Roteiro.** *Rápido (< 1 dia):* SF-16 (formatador pt-BR com o passo pela magnitude), SF-17 (coluna numérica alinhada
à direita, com vão fixo) e OBS-W5-1. *Médio (1–5 dias):* SF-18 (um selo por pane, depois de conferir a contagem), o
`sr-only` coerente com o numeral, e a caixa "Últimas 4 h" sem cobrir texto. *Estratégico:* E-3/E-5 (largura da barra
e título em TF ≠ `1m`).

## 5. Escalado, e não atribuído à wave

- **E-7 continua.** O pipeline está parado desde 00:22Z e ainda estava às 05:12Z, ou seja, **4 h 50 min** sem
  bucket novo em `md.series` `[MEDIDO: psql só leitura]`. `deploy-collector-1` aparece como `Up 5 hours`
  `[MEDIDO: docker ps]`. Pela memória *"Up/healthy com CPU zero é bloqueado, não ocioso"*, vale olhar
  `pg_stat_activity` (idle-in-transaction) antes de qualquer outra coisa. `[NÃO MEDIDO: causa]`. Dono: `infra`.
  **Consequência para este gate:** SF-6, E-4 e o item (5) do falsificador de `T-04.7` só são mensuráveis quando o
  dado voltar.
- **`CA-12`, a metade Stitch.** Este laudo, como o de `T-04.7`, cobre **só o screenshot**. A fase não pode marcar o
  `CA-12` cumprido com ele. Dono: o orquestrador.

## 6. Falsificador deste veredito

O falsificador é o mesmo de `T-04.7` §7, itens (1) a (5), e os instrumentos estão em `T-04.7-evidence/`. Somo mais
uma condição, que é a premissa do reaproveitamento: **este laudo perde a validade se `git diff --quiet 0df6ded HEAD --
frontend/` deixar de dar `rc=0`** antes do merge da wave. Nesse caso é preciso recapturar, e não reler.
