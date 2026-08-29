"""BANCADA da `ADR-016` — NAO E PORTAO, e ninguem o roda.

Este arquivo existe por um motivo so: tornar REPRODUZIVEL a medicao que a `ADR-016`
cita. Ele vive em `docs/` (componente `docs`), fora de `code_paths`, fora do `make` e
fora do `pre-push` — de proposito. Enquanto estiver aqui, ele NAO morde nada, e citar
sua existencia como cobertura seria exatamente o "parecendo coberto" que `ADR-009/D3`
nomeia e `ADR-012/D1` recusa.

A promocao dele a portao e a `T-03.11` (`ADR-016/D5`): move para `backend/scripts/`,
ganha alvo no `Makefile`, entra no `pre-push`, e SO ENTAO o contrato 3 e estreitado —
no MESMO commit, porque estreitar antes abriria janela sem portao.

Como reproduzir os numeros da `ADR-016` (E3/E4 e a bateria de 3 mutantes):

    python3 docs/adr/bancadas/ADR-016-natureza.py \
        backend/src/modules/sentimento/domain backend/src/modules/sentimento/use_cases
    # rc=0 e "0 leitura(s)" na arvore limpa; rc=1 nomeando arquivo:linha com mutante.

O QUE ELE FAZ, e por que nao e regex: resolve os NOMES que `import`/`from ... import`
ligam a `datetime`/`time` e so entao acusa acesso a um atributo de LEITURA DE RELOGIO
a partir desses nomes. `date` como anotacao e `timedelta` em aritmetica nao alcancam
nenhum atributo da lista => silencio, no MESMO arquivo em que `date.today()` e acusado.

PONTO CEGO DECLARADO (mesma classe do `importlib` que `ADR-011/D3a` declara para o
`grimp`): ele e ESTATICO. `getattr(date, "today")()` sai 0 [MEDIDO, E6 da ADR-016].
"""

import ast
import sys
from pathlib import Path

RELOGIO = {
    "datetime": {"now", "utcnow", "today", "astimezone"},
    "date": {"today"},
    "time": {"time", "time_ns", "monotonic", "monotonic_ns", "perf_counter",
             "perf_counter_ns", "process_time", "thread_time", "sleep",
             "localtime", "gmtime", "clock_gettime"},
}
MODULOS = {"datetime", "time"}


def _bindings(arvore):
    """nome_local -> qualificador ('datetime', 'datetime.datetime', 'time', ...)."""
    b = {}
    for no in ast.walk(arvore):
        if isinstance(no, ast.Import):
            for a in no.names:
                if a.name in MODULOS:
                    b[a.asname or a.name] = a.name
        elif isinstance(no, ast.ImportFrom) and no.module in MODULOS and no.level == 0:
            for a in no.names:
                b[a.asname or a.name] = f"{no.module}.{a.name}"
    return b


def _raiz(no):
    while isinstance(no, ast.Attribute):
        no = no.value
    return no.id if isinstance(no, ast.Name) else None


def achados(caminho):
    src = Path(caminho).read_text(encoding="utf-8")
    arvore = ast.parse(src, filename=str(caminho))
    b = _bindings(arvore)
    if not b:
        return []
    out = []
    for no in ast.walk(arvore):
        if not isinstance(no, ast.Attribute):
            continue
        raiz = _raiz(no.value) if isinstance(no.value, ast.Attribute) else (
            no.value.id if isinstance(no.value, ast.Name) else None)
        if raiz is None or raiz not in b:
            continue
        # ultimo segmento do qualificador determina o conjunto de atributos
        alvo = b[raiz].split(".")[-1]
        if isinstance(no.value, ast.Attribute):
            alvo = no.value.attr
        if no.attr in RELOGIO.get(alvo, set()):
            out.append((caminho, no.lineno, f"{raiz}"
                        + ("." + no.value.attr if isinstance(no.value, ast.Attribute) else "")
                        + "." + no.attr))
    return out


def main(argv):
    tot = []
    for raiz in argv[1:]:
        for p in sorted(Path(raiz).rglob("*.py")):
            tot += achados(p)
    for c, l, e in tot:
        print(f"RELOGIO EM CAMADA PURA: {c}:{l} -> {e}")
    print(f"natureza: {len(tot)} leitura(s) de relogio")
    return 1 if tot else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
