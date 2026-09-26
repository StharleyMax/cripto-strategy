# Índice de ADRs — numeração, falsificador e referência por fase

Este documento não existia antes de `T-09.1` (`CST-83`) — verificado por busca de
`README`/`index` sob `docs/adr/` e por nome aproximado em toda `docs/` antes de criar este
arquivo `[MEDIDO 2026-09-04: nenhum candidato encontrado]`. Ele é o registro que `D9.1`/`D9.2`
de `docs/plans/SPEC-001-plataforma-dados/09_consolidacao_de_fronteira.md` exigem: todo ADR
numerado, com falsificador, e referenciado pela fase que o usa.

## Por que este documento existe agora, e não editou o plano aprovado

O DoD `D9.1` do plano diz **"9 ADRs; zero referência órfã"**. Esse número já estava obsoleto em
2026-08-25 (`ls docs/adr/` media 10 — `ADR-001..ADR-010`, e `ADR-010` nasceu depois da narrativa
de review que fixou "nove"). Ficou **ainda mais obsoleto**: esta mesma sessão criou
`ADR-020`..`ADR-026` (7 novas) durante a fase `08`.

**Reconciliar aqui não é reescrever o "9" do plano aprovado** — corrigir DoD de plano aprovado
sem o gate do owner é exatamente o defeito que `ADR-010 §5` evita
(`docs/context/plataforma-dados/handoff_to_builder.md:227`). Este README é o lugar onde a
contagem real vive e se mantém — o texto do plano permanece como está, com o número histórico,
e este índice é a fonte de verdade operacional a partir de agora.

## Contagem real hoje

```bash
ls docs/adr/ADR-*.md | wc -l
```
→ **26** ADRs, `ADR-001`..`ADR-026` `[MEDIDO 2026-09-04 em 0d31b7d]`. O padrão `ADR-*.md` (não
`*.md`) é deliberado: `docs/adr/` também contém este `README.md` e o diretório `bancadas/` — o
`README.md` casaria com um glob `*.md` (self-match, já que ele mesmo vive em `docs/adr/`), e o
`ADR-*.md` evita o falso positivo na fonte, sem depender de excluir nada depois.

> ⚠️ CORREÇÃO, 2026-09-26: dizia **26**; o valor é **45** (`ADR-001`..`ADR-045`)
> `[MEDIDO 2026-09-26 em ee29de0: ls docs/adr/ADR-*.md | wc -l → 45]`. O texto acima fica como registro
> de `T-09.1`; a contagem corrente é a da tabela completa abaixo. Ver [`docs/MAPA-DOCUMENTAL.md`](../MAPA-DOCUMENTAL.md) §3 #40.

## Escopo desta reconciliação: 24 de 26 são "desta rodada" (`plataforma-dados`)

`ADR-013` e `ADR-015` declaram, no próprio cabeçalho, que pertencem a outra feature:

- `ADR-013`: `**SPEC:** — (a decisão é do repositório, não de SPEC-001)`
- `ADR-015`: `**Feature:** codigo-em-ingles`

Ambas são numeradas, têm falsificador e são referenciadas — mas na trilha própria delas,
`docs/context/codigo-em-ingles/tasks.toml` e `docs/plans/SPEC-002-codigo-em-ingles/*.md`, não em
`docs/context/plataforma-dados/tasks.toml` (que é a trilha de `T-09.1`/`CST-83`)
`[MEDIDO 2026-09-04: grep -rln "ADR-013\|ADR-015" docs/plans/SPEC-002-codigo-em-ingles/*.md
docs/specs/*.md docs/context/codigo-em-ingles/tasks.toml → 7 arquivos, todos da trilha
codigo-em-ingles]`. Não são tocadas por esta task — donas são `SPEC-002`/`ADR-013`.

Restam **24 ADRs de `plataforma-dados`**: `ADR-001`..`ADR-012`, `ADR-014`, `ADR-016`..`ADR-026`.

## D9.2 — todo ADR tem falsificador (`≥ 1` por arquivo)

O comando literal do plano (`grep -c "^## Falsificador" docs/adr/*.md`) subconta porque várias
ADRs usam variantes do heading (`## Falsificadores`, `## Falsificador desta ADR`, `## Falsificador
geral do ADR`, `### Falsificador da emenda`). Comando corrigido, que casa a família toda de
headings de nível 2 e 3:

```bash
grep -c "^#\{2,3\} .*[Ff]alsificador" docs/adr/ADR-*.md | awk -F: '$2==0 {print}'
```
→ **saída vazia** — nenhuma das 26 ADRs tem zero. **26/26 com `≥ 1` falsificador**
`[MEDIDO 2026-09-04]`. `D9.2` fecha para o universo inteiro, não só para as 24 de
`plataforma-dados`.

> ⚠️ CORREÇÃO, 2026-09-26: o grep acima é **sensível a caixa** e não casa `## 5 · FALSIFICADORES`
> (`ADR-038`), o que o faria acusar `ADR-038` com zero. O comando correto é case-insensitive:
>
> ```bash
> grep -ci "^#\{2,3\} .*falsificador" docs/adr/ADR-*.md | awk -F: '$2==0 {print}'
> ```
> → **saída vazia: 45/45 com `≥ 1` falsificador** `[MEDIDO 2026-09-26 em ee29de0]`; a versão com `[Ff]`
> devolve `ADR-038…:0` `[MEDIDO 2026-09-26]`.

## D9.1 — toda ADR referenciada existe; toda ADR existente é referenciada pela fase que a usa

Duas direções, ambas medidas:

**(a) Referência órfã** (citação a uma `ADR-NNN` que não existe como arquivo) — zero, em
`docs/plans/`, `docs/context/*/tasks.toml` e `docs/specs/`:

```bash
comm -23 \
  <(grep -rohE 'ADR-[0-9]{3}' docs/plans docs/context/*/tasks.toml docs/specs 2>/dev/null | sort -u) \
  <(ls docs/adr/ADR-*.md | sed -E 's#.*/(ADR-[0-9]{3}).*#\1#' | sort -u)
```
→ **vazio** `[MEDIDO 2026-09-04]`.

**(b) ADR existente sem referência pela fase/task que a usa** — este era o gap real. Antes desta
task, 9 das 24 ADRs de `plataforma-dados` existiam só como arquivo próprio, sem nenhuma citação
em `docs/plans/SPEC-001-plataforma-dados/*.md` nem na task que as produziu, em
`docs/context/plataforma-dados/tasks.toml`:

| ADR | Task que a produziu (`Feature:`/`Task:` no cabeçalho da ADR) | Estava ausente do `refs` da task? |
|---|---|---|
| `ADR-018` | `T-05.11` (`CST-102`) | sim |
| `ADR-019` | `T-05.14` (`CST-105`) | sim |
| `ADR-020` | `T-08.6` (`CST-74`) | sim |
| `ADR-021` | `T-08.4` (`CST-72`) | sim |
| `ADR-022` | `T-08.7` (`CST-75`) | sim |
| `ADR-023` | `T-08.8` (`CST-76`) | sim |
| `ADR-024` | `T-08.13` (`CST-81`) | sim |
| `ADR-025` | `T-08.14` (`CST-82`) | sim |
| `ADR-026` | `T-08.12` (`CST-80`) | sim |

**Corrigido nesta task**: cada uma das 9 tasks acima recebeu uma linha nova em `refs`, citando o
número da ADR e o que ela decidiu (`docs/context/plataforma-dados/tasks.toml`). Depois da
correção, zero ADR de `plataforma-dados` fica sem referência de fase/task:

```bash
comm -13 \
  <(grep -rohE 'ADR-[0-9]{3}' docs/plans/SPEC-001-plataforma-dados/*.md docs/context/plataforma-dados/tasks.toml docs/specs/*.md 2>/dev/null | sort -u) \
  <(ls docs/adr/ADR-*.md | sed -E 's#.*/(ADR-[0-9]{3}).*#\1#' | sort -u) \
  | grep -vxE 'ADR-013|ADR-015'   # as 2 fora de escopo, ver secao acima
```
→ **vazio** `[MEDIDO 2026-09-04, após a edição de tasks.toml]`. Antes da edição, este mesmo
comando devolvia as 9 linhas da tabela acima.

## Tabela completa — as 45 ADRs (refeita em 2026-09-26)

Refeita a partir de [`docs/MAPA-DOCUMENTAL.md`](../MAPA-DOCUMENTAL.md) §2 (`docs/adr`). A versão de 26 linhas
(com as colunas feature/falsificador/referenciada-por, de `T-09.1`) está no histórico do git (`git show ee29de0:docs/adr/README.md`).

- **estado de fato** — o que vale hoje, lido contra código, ledger e ADRs posteriores (MAPA §2). `VIGENTE (texto: proposto)` = o
  código implementa e nada a superou, mas o texto nunca registrou aceite.
- **aceite no texto** — o campo `**Status:**` do cabeçalho da própria ADR, sem interpretação.
- **superado / emendado por** — a ADR, decisão ou código que prevalece sobre parte dela; `—` = nada.
- falsificador: **45/45** com `≥ 1` heading de falsificador (grep case-insensitive da §D9.2).

| ADR | tema | estado de fato (2026-09-26) | aceite no texto | superado / emendado por |
|---|---|---|---|---|
| [`ADR-001`](ADR-001-quantity-field-na-identidade.md) | quantity_field | PARCIAL | proposto (o gate spec é do owner) | CVD do core via klines → ADR-036/D5 |
| [`ADR-002`](ADR-002-motor-de-armazenamento.md) | motor | VIGENTE (emendas) | proposto, com um finalista pendente de spike | D1 SQLite F0 → ADR-031; instância VPS `[NÃO SEI]` (§4 P1) |
| [`ADR-003`](ADR-003-fronteira-charts-web.md) | charts⇄web | PARCIAL | proposto | :74 dono web → A6 (frontend-architect) |
| [`ADR-004`](ADR-004-reconexao-de-stream-sem-sequencia.md) | reconexão | VIGENTE (emenda) | proposto | — (A1/A3 não construídos) |
| [`ADR-005`](ADR-005-transporte-de-leitura.md) | transporte | VIGENTE (emenda) | proposto | :112 "infra aberto" → ADR-009/D6.5 |
| [`ADR-006`](ADR-006-max-staleness-por-serie.md) | max_staleness | VIGENTE | proposto | código diverge (§4 P3) |
| [`ADR-007`](ADR-007-price-source-por-uso.md) | price_source | VIGENTE | proposto | — |
| [`ADR-008`](ADR-008-registro-cru-de-f0.md) | registro cru F0 | PARCIAL | proposto | DoD-1 `[[rules.own]]` → ADR-011 |
| [`ADR-009`](ADR-009-reuso-da-forma-do-anything.md) | forma do anything | PARCIAL | proposto | D4 → ADR-011/D5 |
| [`ADR-010`](ADR-010-governanca-de-cor-por-tipo-de-marca.md) | cor | VIGENTE | ACEITO pelo owner em 2026-08-25 | — |
| [`ADR-011`](ADR-011-o-portao-sai-do-harness-e-vai-para-o-make.md) | portão no make | VIGENTE | proposto | — |
| [`ADR-012`](ADR-012-o-portao-de-shell-e-o-make-nao-o-code-paths.md) | portão de shell | VIGENTE | proposto | — |
| [`ADR-013`](ADR-013-codigo-em-ingles-convencao-com-fronteira-e-sem-portao.md) | idioma | PARCIAL | aceito | tabela 8→12 e 6→7 → CLAUDE.md |
| [`ADR-014`](ADR-014-motor-de-f0-enumeracao-de-verdict-e-testemunha-por-fonte.md) | verdict/testemunha | PARCIAL | proposto | D1 SQLite → ADR-031 |
| [`ADR-015`](ADR-015-token-tipado-no-verificador-de-ancora-e-o-criterio-de-citacao-viva.md) | token tipado | VIGENTE | aceito | — |
| [`ADR-016`](ADR-016-relogio-e-capacidade-tipo-de-data-e-valor.md) | relógio é capacidade | VIGENTE (texto: proposto) | proposto | — |
| [`ADR-017`](ADR-017-deteccao-autonoma-com-auditoria-por-excecao.md) | detecção autônoma | VIGENTE-RASCUNHO | RASCUNHO (aprovar é gate do owner) | aceite pendente (§4 P2) |
| [`ADR-018`](ADR-018-scaffold-next-tipo-em-make-lint-frontend.md) | scaffold Next | PARCIAL | RASCUNHO (aprovar é gate do owner) | D2 `/painel` → CLAUDE.md L12/ADR-034 |
| [`ADR-019`](ADR-019-cliente-http-de-ingest-health-e-paridade-de-fingerprint.md) | cliente ingest-health | PARCIAL | RASCUNHO (aprovar é gate do owner) | D1 → ADR-028; D4 relativizada → ADR-043 |
| [`ADR-020`](ADR-020-s4-bancada-bordas-de-bin-e-contrato-motor-renderizacao.md) | S4 bins | PARCIAL | proposto | D5 → ADR-023 |
| [`ADR-021`](ADR-021-run-registry-reprodutibilidade-de-backtest.md) | run_registry | VIGENTE | proposto | estendida por ADR-025 |
| [`ADR-022`](ADR-022-min-obs-por-observacao-n-obs-por-ponto-e-dispersao-do-z.md) | min_obs | VIGENTE (texto: proposto) | proposto | — |
| [`ADR-023`](ADR-023-firing-rate-walk-forward-particao-de-janelas-e-tipo-oos.md) | walk-forward | VIGENTE (texto: proposto) | proposto | — |
| [`ADR-024`](ADR-024-s4-honestidade-de-leitura-borda-idade-denom-verbatim-selecao-cega-retrospectiva.md) | S4 honestidade | VIGENTE (texto: proposto) | proposto | — |
| [`ADR-025`](ADR-025-grade-canonica-versionada-com-o-dado-derivado.md) | grid_version | PARCIAL | proposto | D3 constante TS não existe `[MEDIDO: grep -rni GRID_VERSION frontend/src → 0]` |
| [`ADR-026`](ADR-026-regras-de-renderizacao-de-painel-multiplo-de-grade-colisao-de-disco-bucket-em-formacao-eixo-y-unico.md) | regras de painel | VIGENTE (texto: proposto) | proposto | tensão com pane Preço+Volume (§4 P5) |
| [`ADR-027`](ADR-027-topologia-de-processo-e-producao-real-do-escritor-unico.md) | topologia | PARCIAL | aprovado pelo owner | lista de coletores/D1a → código + SPEC-009 |
| [`ADR-028`](ADR-028-leitura-do-painel-em-server-component-e-o-portao-de-d6-4-medido-pela-propriedade.md) | RSC + server-only | PARCIAL | aceito | caminho → ADR-034; exceção symbol/TF → ADR-043 |
| [`ADR-029`](ADR-029-topologia-da-camada-de-leitura-caddy-proprio-mesma-origem-por-caminho-e-readiness-que-discrimina.md) | topologia de leitura | VIGENTE | aceito | — ("não implantado" na VPS segue verdadeiro) |
| [`ADR-030`](ADR-030-agregado-por-serie-collector-status-formulas-sobre-runs-existentes.md) | collector-status | PARCIAL | proposto pelo quant-architect | D2 uptime → ADR-035 D12 |
| [`ADR-031`](ADR-031-motor-do-registro-em-producao-postgres-por-adaptador-e-a-imagem-do-candidato-4.md) | registro em Postgres | PARCIAL | aceita | D3 quem fecha o run → ADR-035 |
| [`ADR-032`](ADR-032-dois-alvos-de-compose-um-arquivo-de-deploy-e-um-overlay-local-explicito.md) | dois alvos de compose | VIGENTE | aceita | — |
| [`ADR-033`](ADR-033-store-de-defasagem-motor-compartilhado-e-mesclagem-conservadora.md) | lag store | VIGENTE | aceita | — |
| [`ADR-034`](ADR-034-rotas-de-serie-nome-schema-e-a-coluna-de-valor-que-faltava.md) | rotas de série | PARCIAL | proposta | D6 → ADR-040 |
| [`ADR-035`](ADR-035-contabilidade-de-n-written-o-escritor-fecha-o-run-que-o-coletor-abriu.md) | n_written | VIGENTE (emendas) | proposta | — |
| [`ADR-036`](ADR-036-fonte-por-metrica-do-core-a-origem-por-padrao-o-terceiro-so-onde-a-origem-e-vetada.md) | fonte por métrica | VIGENTE (D5 reescrita) | proposta | — |
| [`ADR-037`](ADR-037-bucket-interval-ms-e-a-grade-nativa-da-serie-nao-o-passo-do-relatorio.md) | grade nativa | VIGENTE | proposta | — (RATIO 6º membro aberto, técnico) |
| [`ADR-038`](ADR-038-carimbo-modeled-e-a-grade-nativa-e-observed_at-e-a-segunda-barreira.md) | carimbo MODELED | PARCIAL/DRAFT | PROPOSTA | §7.1 pendente (§4 P4) |
| [`ADR-039`](ADR-039-acessor-em-lote-a-monotonicidade-da-admissao-e-a-chave-de-ativacao.md) | acessor em lote | DRAFT | PROPOSTA | — |
| [`ADR-040`](ADR-040-reagregacao-na-rota-supported-interval-vira-conjunto-e-a-funcao-e-de-nature-e-reduction.md) | reagregação na rota | VIGENTE | proposta | — |
| [`ADR-041`](ADR-041-a-cauda-viva-le-uma-barra-que-a-origem-ainda-nao-assentou-a-causa-raiz-de-m9.md) | cauda viva | VIGENTE | proposta | — |
| [`ADR-042`](ADR-042-dois-relogios-available-at-responde-ao-horizonte-de-conhecimento-nao-a-fatia.md) | dois relógios | VIGENTE | proposta | — |
| [`ADR-043`](ADR-043-navegacao-fluida-client-driven-symbol-e-tf-sem-round-trip-rsc.md) | client-driven | VIGENTE | proposta | — |
| [`ADR-044`](ADR-044-um-grafico-com-panes-nativos-v5-a-legenda-le-o-slot-e-a-perna-long-desce-por-escala-invertida.md) | panes nativos | VIGENTE (D2′/D3′) | proposta | — |
| [`ADR-045`](ADR-045-candle-de-oi-derivado-e-projecao-na-rota-ancorada-na-fronteira-de-abertura.md) | candle de OI | VIGENTE | proposta (condição satisfeita em 2026-09-23) | — |

## Manutenção deste índice

Este README não é gerado automaticamente — é reconciliado manualmente sempre que uma nova ADR
nasce. O falsificador dele mesmo: se `ls docs/adr/ADR-*.md | wc -l` divergir de **45** (o número
citado acima; era 26 até a correção de 2026-09-26) na próxima leitura, este índice está desatualizado e precisa de nova
reconciliação antes de ser citado como fonte de verdade.
