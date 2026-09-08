# Gap Analysis — PRD-006 `pagina-de-grafico-s2` — `/architect`

**Veredito: APPROVED.** Rev: `master@adf6537` (PRD ancorou em `025d1da`; confirmado ancestral,
sem drift material — `git log 025d1da..HEAD -- frontend/src/app/painel` vazio; a única divergência
é `source-state.ts` já existir no diretório `painel/` hoje, 5 arquivos e não 4 — PRD subcontou por
1, não muda nenhuma conclusão).

## O que foi verificado, não só lido

- `ADR-005/D1..D6` lido inteiro. Header diz `Status: proposto`, nunca virou `aprovado` — mas `D5`
  está registrada como `[DECISÃO-OWNER 2026-09-03]` em `docs/decisoes-do-owner.md`, e `D1-D6` já
  regem código shipado (`s2-badge.ts`, migração de `S1` para `/collector-status`). **Não-bloqueante,
  achado herdado**: o campo `Status` do ADR está obsoleto, não a decisão. Não é desta feature corrigir.
- 6 medições do PRD reproduzidas (rotas backend = 5, rota history/live = 0, `s2-*` = 32, `page.tsx` = 1,
  `components` = 7, regras bloqueantes = 8): todas batem.
- **Achado NÃO nomeado pelo PRD, que muda o plano de F2**: `frontend/eslint.config.mjs:182-198`
  proíbe HOJE toda importação `web→charts` ("no sanctioned crossing point exists yet"). `T-05.2`
  fechou sem carvar a exceção que `ADR-003:90-94` já antecipava. F2 (`CA-F2-1` exige import de
  `charts` na página nova) vai reprovar `eslint` no estado atual do repo. Não é contradição do
  PRD — é exatamente a fronteira que `D-f`/NG não reabrem e que cabe ao `frontend-architect`
  decidir a forma da exceção estreita. Registrado no handoff de dispatch.
- Nenhuma regra bloqueante (`harness rules list --severity block`, 8) é violada pelo escopo
  declarado; nenhuma contradição entre `D-a`..`D-j`; critérios de aceite (§10) têm comando e
  universo, exceto os que dependem de rota ainda não nomeada (aceito — nome é `TBD` com dono).

## Classificação das 6 perguntas (`[Q1]`-`[Q6]`) e 6 gaps (`G1`-`G6`)

Nenhuma é bloqueante. `Q1`/`Q2`/`Q3` → `frontend-architect` (dispatch feito, handoff em
`docs/context/pagina-de-grafico-s2/handoff/F1-F2-frontend-architect.md`). `Q5` → `quant-architect`
(dispatch feito, `.../F1-quant-architect.md`). `Q4` (nomes/rotas dos 2 endpoints) decido eu, por
simetria com `/series-catalog`/`/series-quarantine`: `/series-history` (HTTP) e `/series-live`
(SSE). `Q6`: F3 entra na MESMA SPEC/plano (ordem F1→F2→F3, `I-3` do PRD aceita). `G1`-`G5` viram
itens de plano; `G6` (7×6 componentes) fica só registrado, não é desta feature.

## Próximo passo

`harness pipeline advance PRD_VALIDATED` → `SPEC_DRAFT`. SPEC-006 + ADR-034 (nomes de rota e
contrato final de `ADR-005/D1`, que fecha alternativas) + plano em 3 fases, depois dos dois
retornos de dispatch.

---

## Addendum — achado BLOQUEANTE de `quant-architect`, pós-`PRD_VALIDATED`

**Relatório:** `docs/context/pagina-de-grafico-s2/gates/F1-quant-architect.md`. **Verificado por
mim, 3 fontes independentes, não só lido**: `md.series` (`postgres_series_sink.py:40-58`, `CREATE
TABLE`) tem **15 colunas, nenhuma numérica de mercado** — só identidade/bucket/procedência.
`SeriesRow` (`provenance.py:144-178`) documenta a ausência como intencional: *"deliberately not
the value: it is the shape of what makes a row VALID"*. `series_row_wire.py` transcreve os mesmos
15 nomes. `Observation` (`as_of_accessor.py:188-202`) pareia `SeriesRow` com `value: Decimal` **à
parte**, e hoje só é construído à mão em teste — **nenhum caminho de produção o produz**.

**Isto derruba `D-h` do PRD** (*"a dependência de dado real está satisfeita hoje"*): `captura-em-
producao` grava procedência, não o número. **F1 (as duas rotas de histórico/SSE) não tem hoje
nada além de metadados para servir.**

**Decisão, não escalada ao PM — resolvida na própria SPEC, porque `sentimento` já é componente
tocado por este PRD** (§"Componentes tocados"): a SPEC nasce com uma **fase `F0`** que adiciona a
coluna de valor (`value_raw TEXT NOT NULL`, string crua, disciplina `Decimal`-sobre-string-crua de
`SPEC-001 §2.6`/:190) a `md.series`/`SeriesRow`/`series_row_wire.py`, **antes** de F1. O custo de
re-ingestão de dado já capturado em produção (se houver) é **nomeado como decisão do owner**, não
resolvido aqui — ver SPEC-006 §14. `ADR-034` fixa a forma da coluna com alternativas recusadas e
falsificador.

**Por que não voltou ao PM/PRD:** a lacuna é de **schema de `sentimento`**, não de requisito de
produto — o PRD pediu corretamente "ler o registro que `captura-em-producao` grava"; o que faltava
era saber que o registro não carrega o número. Isso é achado de arquitetura durante a escrita da
SPEC, o mesmo padrão que `ADR-005` emenda de 2026-09-03 já seguiu (`A4`/`A5` descobertos depois da
ADR original aprovada, resolvidos por emenda, não por reabertura de PRD).
