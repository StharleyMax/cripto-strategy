#!/usr/bin/env python3
"""validate_order_fill_env.py — falsificador de D9.3 (fase 09, item 9.3, `CA-F5-3`).

Por que este arquivo existe, e por que ele nao vive em `backend/`:
  "Execucao ao vivo e entrada de ordem" esta FORA de escopo desta SPEC
  (`docs/specs/PRD-001-plataforma-dados.md` secao 12, non-goals). Nao existe hoje modulo de
  execucao no backend para hospedar este teste, e a propria fase 09 declara em "Nao faz":
  "nao escreve codigo de producao" (`docs/plans/SPEC-001-plataforma-dados/09_consolidacao_de_fronteira.md`).

  Mas a CONSEQUENCIA de plataforma que fica, mesmo com execucao fora de escopo, esta escrita
  em tres lugares (`recorte-plataforma.md` item 16, `plataforma-superficies-e-faseamento.md`
  linha 68, `PRD-001` secao 12): toda linha de ordem/fill carrega `env`, desde a primeira —
  "senao existira um periodo em que dado de demo e dado real sao indistinguiveis no store".

  Este arquivo FIXA esse contrato antes do consumidor existir, no mesmo padrao de
  `scripts/validate_palette.js` (ADR-010, `CA-F4-10`): o requisito nasce testavel, para que a
  primeira implementacao real de ordem/fill nao possa nascer sem `env`. Quando o modulo de
  execucao for construido (fora desta SPEC), ele importa `validar_env_da_linha` ou reimplementa
  o mesmo contrato — o falsificador abaixo continua valendo comando por comando.

O que ele NAO e: nao e o motor de execucao, nao decide o schema de ordem/fill alem do campo
`env`, nao roda contra dado real (nao ha dado real de execucao — non-goal desta SPEC).

Uso:  python3 scripts/validate_order_fill_env.py
Saida: exit 0 se todo caso (positivo e negativo) se comporta como esperado; exit 1 caso
contrario, com o(s) caso(s) que reprovou(aram) listado(s) em stderr.
"""

from __future__ import annotations

import sys
from typing import Any, Mapping

# `env` e dimensao obrigatoria de TODA linha de ordem/fill, conjunto fechado — PRD-001 §12,
# `recorte-plataforma.md` item 16, `plataforma-superficies-e-faseamento.md` linha 68.
ENV_VALORES_VALIDOS = frozenset({"mainnet", "testnet", "demo", "replay"})


class LinhaOrdemFillRejeitada(ValueError):
    """Levantada quando uma linha de ordem/fill nao traz `env` valido — CA-F5-3."""


def validar_env_da_linha(linha: Mapping[str, Any]) -> str:
    """Recusa a linha se `env` estiver ausente ou fora do conjunto fechado.

    Devolve o valor de `env` quando a linha e aceita. Este e o unico contrato que D9.3 exige;
    os demais campos de uma linha de ordem/fill (side, price, qty, ...) sao non-goal desta
    SPEC e nao sao verificados aqui.
    """
    if "env" not in linha:
        raise LinhaOrdemFillRejeitada(f"linha de ordem/fill sem campo 'env': {linha!r}")
    valor = linha["env"]
    if valor not in ENV_VALORES_VALIDOS:
        raise LinhaOrdemFillRejeitada(
            f"'env'={valor!r} fora do conjunto fechado {sorted(ENV_VALORES_VALIDOS)}: {linha!r}"
        )
    return valor


# --------------------------------------------------------------------------------------------
# Casos de teste. D9.3 exige >= 1 caso negativo ("rejeita linha de ordem/fill sem env"); aqui
# ha 4 positivos (um por valor do conjunto fechado, prova que o conjunto inteiro e aceito, nao
# so o caminho feliz de um valor) e 5 negativos (ausencia da chave — o caso que o DoD nomeia
# literalmente —, `None`, string vazia, valor fora do conjunto fechado, e erro de digitacao
# plausivel na chave). O falsificador da funcao e o loop de negativos: se qualquer um deles for
# aceito, a funcao nao esta protegendo o que alega proteger.
# --------------------------------------------------------------------------------------------

CASOS_POSITIVOS: list[dict[str, Any]] = [
    {"env": "mainnet", "order_id": "o1", "side": "buy"},
    {"env": "testnet", "order_id": "o2", "side": "sell"},
    {"env": "demo", "order_id": "o3", "side": "buy"},
    {"env": "replay", "order_id": "o4", "side": "sell"},
]

CASOS_NEGATIVOS: list[tuple[str, dict[str, Any]]] = [
    ("sem campo env (o caso que D9.3 nomeia)", {"order_id": "o5", "side": "buy"}),
    ("env = None", {"env": None, "order_id": "o6", "side": "buy"}),
    ("env = string vazia", {"env": "", "order_id": "o7", "side": "buy"}),
    ("env fora do conjunto fechado ('production' nao existe aqui)",
     {"env": "production", "order_id": "o8", "side": "buy"}),
    ("chave com erro de digitacao ('envs', plural)", {"envs": "mainnet", "order_id": "o9", "side": "buy"}),
]


def rodar() -> int:
    falhas: list[str] = []

    for linha in CASOS_POSITIVOS:
        try:
            valor = validar_env_da_linha(linha)
        except LinhaOrdemFillRejeitada as exc:
            falhas.append(f"FALSO NEGATIVO: linha valida foi rejeitada -> {linha!r} ({exc})")
        else:
            if valor != linha["env"]:
                falhas.append(f"valor devolvido diverge da linha: {linha!r} -> {valor!r}")

    for descricao, linha in CASOS_NEGATIVOS:
        try:
            validar_env_da_linha(linha)
        except LinhaOrdemFillRejeitada:
            pass  # esperado: a linha tem de ser rejeitada
        else:
            falhas.append(f"FALSO POSITIVO: linha invalida ACEITA ({descricao}) -> {linha!r}")

    total = len(CASOS_POSITIVOS) + len(CASOS_NEGATIVOS)
    if falhas:
        print(f"REPROVADO — {len(falhas)}/{total} caso(s) com veredito errado:", file=sys.stderr)
        for f in falhas:
            print(f"  - {f}", file=sys.stderr)
        return 1

    print(
        f"APROVADO — {len(CASOS_POSITIVOS)} caso(s) positivo(s) aceito(s), "
        f"{len(CASOS_NEGATIVOS)} caso(s) negativo(s) rejeitado(s) "
        f"(universo: {total} casos, {len(ENV_VALORES_VALIDOS)} valores validos de 'env')."
    )
    return 0


if __name__ == "__main__":
    sys.exit(rodar())
