"""Ingestion record: the run that happened, the gap it left, and the shape both are read in."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Final

# ── OS 15 CAMPOS SAO CONTRATO, E A ORDEM FAZ PARTE DELE ───────────────────────────────────
#
# `ADR-008/D3` fixa esta lista com a frase "colunas que a consulta devolve, fixadas aqui
# porque sao o contrato entre os dois consumidores". Ela NAO e a lista de colunas da TABELA
# `md.ingest_run` (`SPEC-001` §3.5), e a diferenca e nos dois sentidos:
#
#   so na TABELA:    `started_at`, `ended_at`   -- gravados, nao projetados
#   so na CONSULTA:  `janela_de_perda`          -- derivado, e em F0 ele nao existe ainda
#
# A ordem entra no `sha256` da projecao canonica (`ADR-008/DoD-2`), entao reordenar esta
# tupla muda a impressao digital de todo relatorio: e mudanca de contrato, nao de estilo.
INGEST_HEALTH_RUN_COLUMNS: Final[tuple[str, ...]] = (
    "run_id",
    "source",
    "endpoint",
    "window",
    "n_expected",
    "n_returned",
    "n_written",
    "verdict",
    "api_code",
    "src_sha256",
    "weight_used",
    "observer_id",
    "observer_region",
    "clock_skew_ms",
    "janela_de_perda",
)

# `SPEC-001` §3.5, literal. `class` e palavra reservada de Python, entao o CAMPO do dataclass
# se chama `gap_class` e a CHAVE projetada continua `class` — quem renomear a chave quebra o
# contrato com S1 sem que nenhum teste de Python perceba, e por isso a traducao e explicita
# em `_GAP_FIELD_BY_COLUMN` logo abaixo, e nao implicita numa comprehension.
INGEST_HEALTH_GAP_COLUMNS: Final[tuple[str, ...]] = (
    "source",
    "symbol",
    "series_key_id",
    "from_ts",
    "to_ts",
    "n_missing",
    "class",
    "detected_at",
)

_GAP_FIELD_BY_COLUMN: Final[dict[str, str]] = {
    column: ("gap_class" if column == "class" else column) for column in INGEST_HEALTH_GAP_COLUMNS
}

# ── O CONJUNTO FECHADO DE `verdict`, E O QUE CADA MEMBRO CUSTA EM EVIDENCIA ────────────────
#
# `ACCEPTED_WITH_WARNING` e `REJECTED` estao LITERAIS na `SPEC-001` (§5.6 e §5.5/§5.7), e o
# `grep` que os enumera devolve so esses dois em todo `docs/`
# [MEDIDO 2026-08-29: `grep -rn "ACCEPTED\|REJECTED" docs/` -> nenhum outro valor de
#  `verdict` aparece escrito; n = 1 arvore de documentacao].
#
# `ACCEPTED` e o terceiro e ele e `[INFERRED: §5.6 chama `ACCEPTED_WITH_WARNING` de a variante
# COM AVISO de um aceite e manda "NUNCA 'REJECTED', NUNCA zero linhas gravadas"; um aceite sem
# aviso e pressuposto por essa frase e nunca escrito literalmente em lugar nenhum]`. Sem ele
# uma execucao limpa nao teria `verdict` nenhum e o registro nasceria inutil. A PERGUNTA de
# quem e o dono da enumeracao esta ABERTA e nomeada para o `quant-architect` — ela nao foi
# decidida aqui, so rotulada.
# Separados de proposito: a tupla abaixo e o que a SPEC ESCREVE, e o `frozenset` acrescenta o
# terceiro. Fundir os dois numa linha so apagaria a diferenca entre medido e inferido.
VERDICTS_SPELLED_IN_THE_SPEC: Final[tuple[str, str]] = ("ACCEPTED_WITH_WARNING", "REJECTED")
KNOWN_VERDICTS: Final[frozenset[str]] = frozenset({"ACCEPTED", *VERDICTS_SPELLED_IN_THE_SPEC})

# ── `janela_de_perda` EM F0: AUSENTE POR DECLARACAO, e nunca por um numero inventado ───────
#
# `D7.12` decide que ela e FORMULA por serie (`pontos x intervalo`), nao constante, e o dono
# dela e `T-07.12` (`web`, fase 07). Em F0 nao ha formula, e um numero seco aqui seria
# exatamente o que `D7.14` proibe. A COLUNA existe na projecao — `ADR-008/D3` a fixa — e o
# valor e `null`. Tirar a coluna deixaria S1 reintroduzi-la com outro nome; preenche-la com
# um chute publicaria uma retencao que ninguem mediu.
LOSS_WINDOW_NOT_COMPUTED_IN_F0: Final[None] = None


class UnknownVerdictError(Exception):
    """A `verdict` that the shared query does not know — it FAILS instead of hiding the run."""


@dataclass(frozen=True)
class IngestRun:
    """One row of `md.ingest_run` (`SPEC-001` §3.5), stored RAW, exactly as observed."""

    run_id: str
    source: str
    endpoint: str
    window: str
    n_expected: int
    n_returned: int
    n_written: int
    verdict: str
    api_code: int | None
    src_sha256: str
    weight_used: int
    observer_id: str
    observer_region: str
    clock_skew_ms: int
    started_at: str
    ended_at: str


@dataclass(frozen=True)
class IngestGap:
    """One row of `md.ingest_gap` (`SPEC-001` §3.5): an absence, with the class of absence."""

    source: str
    symbol: str
    series_key_id: str
    from_ts: str
    to_ts: str
    n_missing: int
    gap_class: str
    detected_at: str


@dataclass(frozen=True)
class IngestHealthReport:
    """What `ingest_health_query` returns: the runs and the gaps, in a byte-stable shape.

    THE PROJECTION IS THE CONTRACT, NOT THE RENDERING. `ADR-008/DoD-2` compares the `sha256`
    of the CLI projection against the `sha256` of what feeds S1, so any consumer that wants
    to be the SAME implementation has to emit these bytes and not a prettier cousin.

    LOCALE INVARIANCE (`SPEC-001` §3.8) IS INHERITED, NOT CLAIMED BY HAND: every line is
    `json.dumps` with `ensure_ascii=True`, and JSON has no locale — the decimal point is a
    dot and there is no thousands separator, by grammar. `tests/sentimento/
    test_ingest_record_durability.py` runs the §3.8 test literally (`LANG=pt_BR.UTF-8`
    against `LANG=C`, `sha256` compared) instead of trusting this paragraph.
    """

    runs: tuple[IngestRun, ...]
    gaps: tuple[IngestGap, ...]

    def canonical_lines(self) -> tuple[str, ...]:
        """Return the projection as one JSON object per line, sections marked.

        EVERY line is valid JSON on its own — including the header and the section markers —
        so the raw record stays greppable and sortable line by line, which is what a CLI
        record of F0 is for, without the format stopping being machine-exact.
        """
        header = _canonical_json(
            {
                "query": "ingest_health_query",
                "n_runs": len(self.runs),
                "n_gaps": len(self.gaps),
            }
        )
        lines = [header, _canonical_json({"section": "ingest_run", "n": len(self.runs)})]
        lines.extend(_project_run(run) for run in self.runs)
        lines.append(_canonical_json({"section": "ingest_gap", "n": len(self.gaps)}))
        lines.extend(_project_gap(gap) for gap in self.gaps)
        return tuple(lines)

    def canonical_projection(self) -> str:
        """Return the whole projection as one string — the exact bytes the CLI writes out."""
        return "\n".join(self.canonical_lines())

    def fingerprint(self) -> str:
        """Return `sha256` of the canonical projection — the identity `ADR-008/DoD-2` compares."""
        return hashlib.sha256(self.canonical_projection().encode("utf-8")).hexdigest()


def _canonical_json(payload: dict[str, object]) -> str:
    """Serialize with no whitespace slack and no locale — insertion order IS the column order."""
    return json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=False)


def _project_run(run: IngestRun) -> str:
    """Project one run onto the 15 columns `ADR-008/D3` fixed, in the order it fixed them."""
    payload: dict[str, object] = {}
    for column in INGEST_HEALTH_RUN_COLUMNS:
        if column == "janela_de_perda":
            payload[column] = LOSS_WINDOW_NOT_COMPUTED_IN_F0
        else:
            payload[column] = getattr(run, column)
    return _canonical_json(payload)


def _project_gap(gap: IngestGap) -> str:
    """Project one gap onto the `md.ingest_gap` columns, keeping `class` as the wire name."""
    return _canonical_json(
        {column: getattr(gap, _GAP_FIELD_BY_COLUMN[column]) for column in INGEST_HEALTH_GAP_COLUMNS}
    )
