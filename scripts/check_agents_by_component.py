#!/usr/bin/env python3
"""Compare the published `agents.by_component` assignment against the golden file.

Reads the ACTUAL policy JSON on stdin (produced by `harness policy --key
agents.by_component`) and the EXPECTED assignment from the golden file named in `argv[1]`.

Exit codes follow the semantics every other gate of this repository already uses
(`ADR-011/D2`, `scripts/verify.sh`):

    0 -- measured, and the assignment is the declared one
    1 -- MEASURED AND DIVERGED; every divergence is printed with its full key path
    3 -- REFUSED to measure (golden missing/unparseable, stdin not JSON, empty golden)

It never checks only for key presence. `D1.2` already proved that a check satisfied by
`{"charts": {}}` measures nothing: it tests presence of a key, not presence of an owner.
The comparison here runs over the whole mapping -- components, roles AND role values -- so an
emptied section, a deleted `design_gate`, a swapped owner and an ADDED component are each a
named divergence.

Operator-facing strings are Portuguese by `CLAUDE.md` line 8 ("microcopy de operador");
identifiers, docstrings and comments are English by lines 1 and 5.
"""

from __future__ import annotations

import json
import sys

KEY = "agents.by_component"


def load_golden(path: str) -> dict[str, dict[str, str]]:
    """Read the frozen assignment. Anything but a JSON object is a refusal, not a failure."""
    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"{path}: o arquivo dourado tem de conter um objeto JSON")
    return data


def load_actual(raw: str) -> dict[str, dict[str, str]]:
    """Parse the policy output.

    An UNDECLARED key makes `harness policy` print an empty line with `rc=0` -- measured, as
    `harness policy --key glossary_doc` does today. That is not an environment failure: it
    means the assignment stopped being published, which is the "empty the whole section"
    mutation and MUST bite. So it becomes `{}` and every component is reported as missing.
    """
    if not raw.strip():
        return {}
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("a saída da política não é um objeto JSON")
    return data


def diff(
    expected: dict[str, dict[str, str]], actual: dict[str, dict[str, str]]
) -> list[str]:
    """Return one line per divergence, each naming the full key path that diverged."""
    findings: list[str] = []

    for component in sorted(set(expected) | set(actual)):
        if component not in actual:
            papeis = ", ".join(sorted(expected[component])) or "nenhum"
            findings.append(
                f"{KEY}.{component} — COMPONENTE AUSENTE da política "
                f"(o dourado declara os papéis: {papeis})"
            )
            continue
        if component not in expected:
            papeis = ", ".join(sorted(actual[component])) or "nenhum"
            findings.append(
                f"{KEY}.{component} — COMPONENTE INESPERADO na política "
                f"(o dourado não o declara; papéis encontrados: {papeis})"
            )
            continue

        want, got = expected[component], actual[component]
        if not isinstance(got, dict):
            findings.append(
                f"{KEY}.{component} — esperado um objeto de papéis, obtido {got!r}"
            )
            continue

        for role in sorted(set(want) | set(got)):
            if role not in got:
                findings.append(
                    f"{KEY}.{component}.{role} — PAPEL AUSENTE; esperado {want[role]!r}"
                )
            elif role not in want:
                findings.append(
                    f"{KEY}.{component}.{role} — PAPEL INESPERADO; obtido {got[role]!r}"
                )
            elif want[role] != got[role]:
                findings.append(
                    f"{KEY}.{component}.{role} — esperado {want[role]!r}, "
                    f"obtido {got[role]!r}"
                )

    return findings


def main(argv: list[str]) -> int:
    """Run the comparison and return the exit code the gate publishes."""
    if len(argv) != 2:
        print("RECUSA: uso: check_agents_by_component.py <dourado.json>", file=sys.stderr)
        return 3

    try:
        expected = load_golden(argv[1])
    except (OSError, ValueError) as error:
        print(f"RECUSA: não consegui ler o arquivo dourado: {error}", file=sys.stderr)
        return 3

    try:
        actual = load_actual(sys.stdin.read())
    except ValueError as error:
        print(f"RECUSA: não consegui ler a saída da política: {error}", file=sys.stderr)
        return 3

    if not expected:
        # A golden frozen on an EMPTY assignment would pass over an emptied policy: the gate
        # would exist and measure nothing. Universo vazio nao e prova (`ADR-012`).
        print(
            "RECUSA: o arquivo dourado não declara componente nenhum — um dourado vazio "
            "passaria sobre uma política esvaziada e não provaria nada.",
            file=sys.stderr,
        )
        return 3

    findings = diff(expected, actual)
    papeis = sum(len(roles) for roles in expected.values())
    if not findings:
        print(
            f"agents.by_component: bate com o dourado — "
            f"{len(expected)} componente(s), {papeis} papel(is)."
        )
        return 0

    print(
        f"REPROVADO — {KEY} divergiu do arquivo dourado em {len(findings)} ponto(s) "
        f"(universo: {len(expected)} componente(s), {papeis} papel(is) declarados):",
        file=sys.stderr,
    )
    for finding in findings:
        print(f"  - {finding}", file=sys.stderr)
    print(
        "        Se a mudança é INTENCIONAL, o `harness.toml` e "
        "`scripts/agents-by-component.golden.json` mudam NO MESMO commit — são as duas "
        "superfícies que o item 1.13 do plano 01 existe para exigir.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
