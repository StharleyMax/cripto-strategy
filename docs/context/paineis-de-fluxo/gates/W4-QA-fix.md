# W4-QA-fix: correção do BLOCKER-1 do `W4-QA` (Doc delta do doji)

**Feature:** `paineis-de-fluxo` · **Branch:** `wave/paineis-f02` · **Data:** 2026-09-26 · **Agente:** `frontend-builder`
**Contra:** `gates/W4-QA.md` §7 (achados 1, 3 e 6) e §8 (ações 1 e 2)

## 1. O que mudou

| achado | arquivo | edição |
|---|---|---|
| BLOCKER-1 | `docs/MAPA-DOCUMENTAL.md:68` | nota `CORREÇÃO 2026-09-26` logo abaixo da linha: o doji do volume fica sem direção (`ADR-010/D-2`) |
| BLOCKER-1 | `docs/specs/PRD-009-paineis-de-fluxo.md` `RF-7` e `I-3` | nota logo depois de cada tabela, porque uma linha solta no meio quebraria a tabela. As linhas originais não mudaram |
| BLOCKER-1 | `docs/plans/SPEC-009-paineis-de-fluxo/02_volume_com_direcao.md` item 2.1 e DoD 1 | nota abaixo da tabela, e nota recuada dentro do DoD 1: *"reprova 3 dos 4"* passa a *"2 dos 4 pelo comparador, mais os mutantes do doji e do ausente"* (`W4-QA` §4: M1, M2, M4) |
| achado 3 | `PRD-009` `[Q-VOL-2]` e `SPEC-009` `[Q-DG-2]` | nota: a metade do volume foi respondida (opção B, linear com base 0, `gates/T-02.2-design-gate.md` §4 e §8 ciclo 2). A metade da liquidação continua aberta, porque o gate de `T-02.2` não a julgou |
| achado 6 | `frontend/src/app/symbol/SymbolClient.tsx` (a docstring do sub-eixo) | o comentário dizia que o readout imprime `SEM_PONTO`. Agora ele cita `ABSENCE_TOKEN` (`ausente` desde `T-01.R1`/`SF-9`). A mudança é só no comentário |

`STITCH_CONTEXT.md:224` (`D5.3`) **não foi tocado**: segundo o `W4-QA` §8.2, ele fica com o `ui-designer`. Os achados 2, 4, 5 e 7
(WARNING, sem ação de documento pedida) ficam como estão.

## 2. Falsificador: reprova sem o conserto e passa com ele

Para cada linha viva que diz *"doji = alta"*, *"Doji → cor de alta"*, *"Doji fica com a cor de alta"* ou *"reprova 3 dos 4"*, o
script exige, nas 15 linhas seguintes, uma nota `CORREÇÃO 2026-09-26` que aponte para `handoff/T-02.1-doji-julgamento.md`.
As próprias notas (linhas `>`) não entram no universo.

```bash
for f in docs/MAPA-DOCUMENTAL.md docs/specs/PRD-009-paineis-de-fluxo.md docs/plans/SPEC-009-paineis-de-fluxo/02_volume_com_direcao.md; do
  grep -n -iE 'doji = alta|doji → cor de alta|doji fica com a cor de alta|reprova 3 dos 4' "$f" | grep -vE '^[0-9]+: *>' |
  while IFS=: read -r n _; do
    sed -n "$((n+1)),$((n+15))p" "$f" | grep -q 'CORREÇÃO 2026-09-26.*T-02.1-doji-julgamento' && echo "ok $f:$n" || echo "STALE $f:$n"
  done
done
```

| árvore | resultado |
|---|---|
| sem o conserto (`git stash`) | **5 STALE**: `MAPA:68`, `PRD-009:194`, `PRD-009:282`, `plano 02:12`, `plano 02:20`, rc=1 `[MEDIDO]` |
| com o conserto | **5 ok, 0 STALE**, rc=0 `[MEDIDO]` |

## 3. Doc delta

- `docs/INDEX.md`: uma linha acrescentada (append-only), apontando para este arquivo.
- ADR: não é necessária. A decisão já existe (`ADR-010/D-2`), e aqui só foi anotada nos documentos que a contradiziam.
