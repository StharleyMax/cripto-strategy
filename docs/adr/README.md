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

## Tabela completa — as 26 ADRs, numeração, falsificador e onde são citadas

| ADR | Título | Status | Feature | Falsificador | Referenciada por (plano/task) |
|---|---|---|---|---|---|
| `ADR-001` | `quantity_field` é termo de identidade da série | proposto | `plataforma-dados` | ✅ | `03_captura_continua.md`, `04_contrato_temporal.md`, `06_semantica_declarada.md`; `T-03.1`, `T-03.4`, `T-04.2`, `T-06.9` |
| `ADR-002` | Motor de armazenamento | proposto, finalista pendente de spike | `plataforma-dados` | ✅ | `07_aquisicao_em_regime.md`, `08_superficie_e_reprodutibilidade.md`, `09_consolidacao_de_fronteira.md`; `T-07.5`, `T-08.1`, `T-08.3`, `T-09.3` |
| `ADR-003` | Fronteira `charts` ⇄ `web` | proposto | `plataforma-dados` | ✅ | `index.md`, `01_governanca_gateante.md`, `05_fatia_visivel.md`, `08_superficie_e_reprodutibilidade.md`; `T-01.1`, `T-01.3`, `T-01.5`, `T-01.7`, `T-01.8`, `T-01.10`, `T-05.1`, `T-05.13`, `T-05.16`, `T-08.14`, `T-09.4` |
| `ADR-004` | Reconexão de stream sem sequência | proposto | `plataforma-dados` | ✅ | `03_captura_continua.md`, `09_consolidacao_de_fronteira.md`; `T-03.3`, `T-09.3` |
| `ADR-005` | Transporte de leitura | proposto | `plataforma-dados` | ✅ | `05_fatia_visivel.md`, `08_superficie_e_reprodutibilidade.md`; `T-05.3`, `T-05.9`, `T-05.12`, `T-05.14`, `T-05.15`, `T-05.16`, `T-08.11` |
| `ADR-006` | `max_staleness` por série | proposto | `plataforma-dados` | ✅ | `04_contrato_temporal.md`, `08_superficie_e_reprodutibilidade.md`; `T-04.4`, `T-08.13` |
| `ADR-007` | `price_source` por uso | proposto | `plataforma-dados` | ✅ | `05_fatia_visivel.md`, `06_semantica_declarada.md`; `T-05.5`, `T-06.9` |
| `ADR-008` | Registro cru de F0 | proposto | `plataforma-dados` | ✅ | `02_captura_sem_gate_de_host.md`, `05_fatia_visivel.md`, `07_aquisicao_em_regime.md`; `T-02.3`, `T-05.12`, `T-05.14`, `T-05.15`, `T-05.16`, `T-07.13` |
| `ADR-009` | Reuso da forma do `anything_monorepo` | proposto | `plataforma-dados` | ✅ | `01_governanca_gateante.md`, `05_fatia_visivel.md`, `07_aquisicao_em_regime.md`, `09_consolidacao_de_fronteira.md`; `T-01.1`–`T-01.10`, `T-04.7`, `T-05.11`–`T-05.13`, `T-07.4`, `T-09.4` |
| `ADR-010` | Governança de cor por tipo de marca | **ACEITO** pelo owner 2026-08-25 | `plataforma-dados` | ✅ | `05_fatia_visivel.md`; `T-05.7` |
| `ADR-011` | Portão de fronteira sai do `harness`, vai para o `make` | proposto | `plataforma-dados` | ✅ | `01_governanca_gateante.md`, `05_fatia_visivel.md`; `T-01.2`, `T-01.4`–`T-01.7`, `T-01.10`, `T-03.12`, `T-05.11` |
| `ADR-012` | O que morde e não é fonte mora no `make` | proposto | `plataforma-dados` | ✅ | `01_governanca_gateante.md`, `05_fatia_visivel.md`; `T-01.9`, `T-01.10`, `T-02.3`, `T-03.12`, `T-05.1` |
| `ADR-013` | Código em inglês: convenção com fronteira, sem portão | **aceito** | `codigo-em-ingles` **(fora de escopo — trilha própria)** | ✅ | `docs/plans/SPEC-002-codigo-em-ingles/*`, `docs/context/codigo-em-ingles/tasks.toml` |
| `ADR-014` | Motor de F0: `verdict`, testemunha por fonte | proposto | `plataforma-dados` | ✅ | `T-02.3`, `T-02.4a` |
| `ADR-015` | Verificador de âncora: token tipado, citação viva | aceito | `codigo-em-ingles` **(fora de escopo — trilha própria)** | ✅ | `docs/plans/SPEC-002-codigo-em-ingles/*`, `docs/context/codigo-em-ingles/tasks.toml` |
| `ADR-016` | Relógio é capacidade; tipo de data é valor | proposto | `plataforma-dados` | ✅ | `05_fatia_visivel.md`; `T-03.12` |
| `ADR-017` | Detecção autônoma, auditoria por exceção | RASCUNHO | `plataforma-dados` | ✅ | `T-08.9` |
| `ADR-018` | Scaffold Next, `tsconfig` estrito, `tsc --strict` em `make lint-frontend` | RASCUNHO | `plataforma-dados` (`T-05.11`, `CST-102`) | ✅ | `T-05.11` **(adicionada nesta task)** |
| `ADR-019` | Cliente HTTP de `ingest_health`, paridade de `fingerprint` | RASCUNHO | `plataforma-dados` (`T-05.14`, `CST-105`) | ✅ | `T-05.14` **(adicionada nesta task)** |
| `ADR-020` | `S4` bancada: bordas de bin, overflow, contrato motor⇄render | proposto | `plataforma-dados` (`T-08.6`, `CST-74`) | ✅ | `T-08.6` **(adicionada nesta task)** |
| `ADR-021` | `run_registry`: schema, `bundle_hash`, `knowledge_time` | proposto | `plataforma-dados` (`T-08.4`, `CST-72`) | ✅ | `T-08.4` **(adicionada nesta task)** |
| `ADR-022` | `min_obs`, `n_obs` por ponto, dispersão do `z` | proposto | `plataforma-dados` (`T-08.7`, `CST-75`) | ✅ | `T-08.7` **(adicionada nesta task)** |
| `ADR-023` | `firing_rate` walk-forward, partição de janelas | proposto | `plataforma-dados` (`T-08.8`, `CST-76`) | ✅ | `T-08.8` **(adicionada nesta task)** |
| `ADR-024` | `S4` honestidade de leitura: borda, idade, denom verbatim | proposto | `plataforma-dados` (`T-08.13`, `CST-81`) | ✅ | `T-08.13` **(adicionada nesta task)** |
| `ADR-025` | Grade canônica versionada com o dado derivado | proposto | `plataforma-dados` (`T-08.14`, `CST-82`) | ✅ | `T-08.14` **(adicionada nesta task)** |
| `ADR-026` | Regras de renderização de painel múltiplo | proposto | `plataforma-dados` (`T-08.12`, `CST-80`) | ✅ | `T-08.12` **(adicionada nesta task)** |

## Manutenção deste índice

Este README não é gerado automaticamente — é reconciliado manualmente sempre que uma nova ADR
nasce. O falsificador dele mesmo: se `ls docs/adr/ADR-*.md | wc -l` divergir de **26** (o número
citado acima) na próxima leitura, este índice está desatualizado e precisa de nova
reconciliação antes de ser citado como fonte de verdade.
