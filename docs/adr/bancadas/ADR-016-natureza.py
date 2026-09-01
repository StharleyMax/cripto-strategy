"""BANCADA da `ADR-016` — NAO E PORTAO, e ninguem o roda.

Este arquivo existe por um motivo so: tornar REPRODUZIVEL a medicao que a `ADR-016`
cita. Ele vive em `docs/` (componente `docs`), fora de `code_paths`, fora do `make` e
fora do `pre-push` — de proposito. Enquanto estiver aqui, ele NAO morde nada, e citar
sua existencia como cobertura seria exatamente o "parecendo coberto" que `ADR-009/D3`
nomeia e `ADR-012/D1` recusa.

A promocao dele a portao e a `T-03.12` (`ADR-016/D5`, corrigida pela ERRATA 1 de
2026-08-29 — `T-03.11` ja existia, e o identificador colidia): move para
`backend/scripts/`, ganha alvo no `Makefile`, entra no `pre-push`, e SO ENTAO o
contrato 3 e estreitado — no MESMO commit, porque estreitar antes abriria janela sem
portao.

Como reproduzir os numeros da `ADR-016`:

    python3 docs/adr/bancadas/ADR-016-natureza.py \
        backend/src/modules/sentimento/domain backend/src/modules/sentimento/use_cases
    # rc=0 e "0 leitura(s)" na arvore limpa; rc=1 nomeando arquivo:linha com mutante.

O QUE ELE FAZ, e por que nao e regex: resolve os NOMES que `import`/`from ... import`
ligam a `datetime`/`time` e so entao acusa o que alcanca, a partir desses nomes, um
atributo de LEITURA/ESCRITA DE RELOGIO. `date` como anotacao e `timedelta` em
aritmetica nao alcancam nenhum nome das listas => silencio, no MESMO arquivo em que
`date.today()` e acusado.

── ERRATA 1 (2026-08-29) — DOIS BURACOS ESTRUTURAIS, ACHADOS PELO `/tech-lead` ───────

(1) O SITIO DE CHAMADA NU. A versao anterior so entrava em `ast.Attribute`, entao:

        import time;                time.monotonic()   ->  rc=1  MORDIA
        from time import monotonic; monotonic()        ->  rc=0  ERA CEGO

    A ligacao existia — `_bindings` a criava — e NINGUEM a consultava. O codigo para
    ver a forma nua ja estava aqui e nao era usado, e a forma cega e a MAIS
    IDIOMATICA das duas. Isto NAO era o residuo dinamico declarado em `E6`: e
    estatico, e portanto era FALHA DO INSTRUMENTO, nao limite dele.
    Fechado por `_ACHADO_NOME` abaixo.

(2) A COBERTURA DE `time` NAO BATIA COM A ARITMETICA. A lista cobria 12 dos nomes que
    a `D3` contava como relogio; `time.ctime()`, `asctime()`, `clock_gettime_ns()`
    saiam `rc=0`. E a recontagem mostrou que os DOIS numeros estavam errados: a
    particao correta de `dir(time)` (38 publicos, EXAUSTIVA E DISJUNTA, conferida por
    assert abaixo) e 28 proibidos / 10 permitidos — nao 21/17.

── A TAXONOMIA, e ela e a regra que decide os casos futuros ──────────────────────────

  L  le o relogio          o valor depende de QUANDO                    -> proibido
  E  escreve estado        efeito sobre o processo ou o sistema         -> proibido
  A  depende do AMBIENTE   sem depender do tempo (resolucao, tz, id)    -> proibido
  ARIDADE  le SO sem argumento; com argumento e formatador puro         -> condicional
  P  puro                  formatacao e tipos                           -> permitido

`A` e proibido pela metade "dependencia de ambiente" que `ADR-016/D1` nomeia: mesmo
codigo, outra maquina, outra resposta — que e o defeito que passa em CI e falha em
producao.

PONTO CEGO QUE PERMANECE, e agora ele e SO o dinamico (mesma classe do `importlib`
que `ADR-011/D3a` declara para o `grimp`): `getattr(date, "today")()` sai 0
[MEDIDO, E6]. Nome produzido em runtime nao tem ligacao estatica para consultar.
"""

import ast
import sys
from pathlib import Path

# ── `time`: particao EXAUSTIVA E DISJUNTA de dir(time), conferida por assert ──────────
_TIME_L = {"time", "time_ns", "monotonic", "monotonic_ns", "perf_counter",
           "perf_counter_ns", "process_time", "process_time_ns", "thread_time",
           "thread_time_ns", "clock_gettime", "clock_gettime_ns", "sleep",
           "pthread_getcpuclockid"}
_TIME_E = {"clock_settime", "clock_settime_ns", "tzset"}
_TIME_A = {"clock_getres", "get_clock_info", "timezone", "altzone", "daylight", "tzname"}
_TIME_ARIDADE = {"ctime", "asctime", "strftime", "localtime", "gmtime"}
_TIME_P = {"strptime", "struct_time", "mktime", "CLOCK_BOOTTIME", "CLOCK_MONOTONIC",
           "CLOCK_MONOTONIC_RAW", "CLOCK_PROCESS_CPUTIME_ID", "CLOCK_REALTIME",
           "CLOCK_TAI", "CLOCK_THREAD_CPUTIME_ID"}

# `datetime`: NAO auditado nome a nome nesta errata — a pergunta do coordenador era
# sobre `time`. `fromtimestamp` fica como [NAO SEI] NOMEADO na `ADR-016` (ele usa o
# fuso LOCAL com 1 argumento e e deterministico com `tz=`), com dono `/architect`.
SEMPRE = {
    "datetime": {"now", "utcnow", "today"},
    "date": {"today"},
    "time": _TIME_L | _TIME_E | _TIME_A,
}
# ── ARIDADE: nome -> MINIMO de argumentos que o torna PURO ───────────────────────────
#
# Abaixo do minimo (ou referenciado sem ser chamado, quando a aridade nao e conhecida
# estaticamente), ele le o relogio. O LIMIAR E POR NOME, e nao um "zero" universal —
# `time.strftime("%Y")` tem UM argumento e AINDA ASSIM chama `localtime()` por dentro;
# so `strftime(fmt, t)` e formatador puro. [DEFEITO MEU, achado pela propria bateria
# desta errata: com o limiar fixo em 0, `m13_strftime_0arg` saia rc=0.]
ARIDADE_MIN_PURO = {
    "datetime": {"astimezone": 1},
    "date": {},
    "time": {"ctime": 1, "asctime": 1, "localtime": 1, "gmtime": 1, "strftime": 2},
}
MODULOS = {"datetime", "time"}


def _confere_particao() -> None:
    """Falha alto se a particao de `time` deixar de ser exaustiva ou disjunta."""
    import time as _t

    publicos = {n for n in dir(_t) if not n.startswith("_")}
    classes = [_TIME_L, _TIME_E, _TIME_A, _TIME_ARIDADE, _TIME_P]
    uniao: set[str] = set()
    for c in classes:
        if uniao & c:
            raise SystemExit(f"RECUSA: classes de `time` se sobrepoem em {sorted(uniao & c)}")
        uniao |= c
    if uniao != publicos:
        raise SystemExit(
            "RECUSA: a particao de `time` nao cobre dir(time) nesta versao de Python. "
            f"sobra={sorted(publicos - uniao)} inventado={sorted(uniao - publicos)}"
        )


def _bindings(arvore: ast.AST) -> dict[str, str]:
    """nome_local -> qualificador ('time', 'time.monotonic', 'datetime.date', ...)."""
    b: dict[str, str] = {}
    for no in ast.walk(arvore):
        if isinstance(no, ast.Import):
            for a in no.names:
                if a.name in MODULOS:
                    b[a.asname or a.name] = a.name
        elif isinstance(no, ast.ImportFrom) and no.module in MODULOS and no.level == 0:
            for a in no.names:
                b[a.asname or a.name] = f"{no.module}.{a.name}"
    return b


def _aridade_por_no(arvore: ast.AST) -> dict[int, int]:
    """id() do no `func` de cada Call -> numero de argumentos daquela chamada."""
    return {
        id(no.func): len(no.args) + len(no.keywords)
        for no in ast.walk(arvore)
        if isinstance(no, ast.Call)
    }


def _proibido(mod: str, attr: str, chamadas: dict[int, int], no: ast.AST) -> bool:
    if attr in SEMPRE.get(mod, set()):
        return True
    minimo = ARIDADE_MIN_PURO.get(mod, {}).get(attr)
    if minimo is not None:
        n = chamadas.get(id(no), -1)     # -1 = referenciado sem ser chamado
        return n < minimo
    return False


def achados(caminho: str | Path) -> list[tuple[str, int, str]]:
    """Devolve (caminho, linha, expressao) de cada leitura/escrita de relogio."""
    caminho = str(caminho)
    arvore = ast.parse(Path(caminho).read_text(encoding="utf-8"), filename=caminho)
    ligacoes = _bindings(arvore)
    if not ligacoes:
        return []
    chamadas = _aridade_por_no(arvore)
    out: list[tuple[str, int, str]] = []

    for no in ast.walk(arvore):
        # ── SITIO 1: encadeamento de atributo a partir de um nome ligado ──────────
        if isinstance(no, ast.Attribute):
            alvo_no = no.value
            if isinstance(alvo_no, ast.Name) and alvo_no.id in ligacoes:
                mod = ligacoes[alvo_no.id].split(".")[-1]
                prefixo = alvo_no.id
            elif isinstance(alvo_no, ast.Attribute) and isinstance(alvo_no.value, ast.Name) \
                    and alvo_no.value.id in ligacoes:
                mod = alvo_no.attr
                prefixo = f"{alvo_no.value.id}.{alvo_no.attr}"
            else:
                continue
            if _proibido(mod, no.attr, chamadas, no):
                out.append((caminho, no.lineno, f"{prefixo}.{no.attr}"))

        # ── SITIO 2: o NOME NU — o buraco da ERRATA 1 ─────────────────────────────
        # `from time import monotonic` liga `monotonic` -> `time.monotonic`, e o sitio
        # de chamada e um `ast.Name`. A ligacao SEMPRE existiu; ninguem a consultava.
        elif isinstance(no, ast.Name) and isinstance(no.ctx, ast.Load):
            qual = ligacoes.get(no.id)
            if qual is None or "." not in qual:
                continue          # `import time` liga `time` -> `time`: nao e chamada
            mod, attr = qual.split(".", 1)
            if _proibido(mod, attr, chamadas, no):
                out.append((caminho, no.lineno, f"{no.id} (={qual})"))

    return sorted(set(out), key=lambda t: (t[0], t[1], t[2]))


def main(argv: list[str]) -> int:
    _confere_particao()
    tot: list[tuple[str, int, str]] = []
    for raiz in argv[1:]:
        alvo = Path(raiz)
        arquivos = sorted(alvo.rglob("*.py")) if alvo.is_dir() else [alvo]
        for p in arquivos:
            tot += achados(p)
    for c, ln, e in tot:
        print(f"RELOGIO EM CAMADA PURA: {c}:{ln} -> {e}")
    print(f"natureza: {len(tot)} leitura(s) de relogio")
    return 1 if tot else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
