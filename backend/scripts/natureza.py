"""Portao de natureza por USO — `ADR-016/D4`.

Promovido de `docs/adr/bancadas/ADR-016-natureza.py` pela `T-03.12` (`ADR-016/D5`, corrigida
pela ERRATA 1 de 2026-08-29 — `T-03.11` ja existia cardada, e o identificador colidia).

Chamado por `backend/scripts/natureza.sh` (alvo `make natureza`, e por ele no
`scripts/hooks/pre-push.pre-harness`, na MESMA costura de `boundaries.sh`). A bancada em
`docs/adr/bancadas/ADR-016-natureza.py` PERMANECE la — este arquivo e uma COPIA endurecida,
nao uma mudanca de endereco (`ADR-016/D5`, DoD-11): a ADR precisa continuar reproduzivel a
partir do proprio texto dela.

O QUE ESTE SCRIPT FAZ, e por que nao e regex (`ADR-011/D3a` aplicada a esta fronteira): resolve
os NOMES que `import`/`from ... import` ligam a `datetime`/`time` — inclusive `as` — e so entao
acusa o que alcanca, a partir desses nomes, um atributo de LEITURA/ESCRITA DE RELOGIO. `date`
como anotacao e `timedelta` em aritmetica nao alcancam nenhum nome das listas => silencio, no
MESMO arquivo em que `date.today()` e acusado (`domain/dump_window.py` e
`domain/retention_probe.py` sao o corpus que prova as duas metades ao mesmo tempo).

── ERRATA 1 da ADR (2026-08-29) — DOIS BURACOS ESTRUTURAIS, ACHADOS PELO `/tech-lead` NA T-03.12,
   e OS DOIS SOBREVIVERIAM A UM SIMPLES `git mv` DA BANCADA PARA CA ────────────────────────────

(1) O SITIO DE CHAMADA NU. A versao que so entrava em `ast.Attribute` deixava passar a grafia
    MAIS IDIOMATICA de `time`:

        import time;                time.monotonic()   ->  rc=1  MORDIA
        from time import monotonic; monotonic()        ->  rc=0  ERA CEGO

    A ligacao `monotonic -> time.monotonic` existia — `_bindings` a criava — e NINGUEM a
    consultava: o sitio de chamada de um `from ... import` nu e um `ast.Name`, e o laco so
    entrava em `ast.Attribute`. Isto NAO e o residuo dinamico que o item (3) declara: e
    ESTATICO, logo era falha do instrumento, nao limite dele. Fechado pelo SITIO 2 de
    `achados()` abaixo — reproduza com `from time import monotonic as m; m()`.

(2) A COBERTURA DE `time` NAO BATIA COM A ARITMETICA DA PROPRIA ADR. `D3` contava 21 nomes de
    relogio em 38 publicos de `time`; a lista cobria 12. `time.ctime()`, `time.asctime()` e
    `time.clock_gettime_ns()` saiam `rc=0`. A recontagem, EXAUSTIVA E DISJUNTA sobre
    `dir(time)` e conferida por `_confere_particao()` abaixo, corrigiu os dois numeros: 28
    proibidos / 10 permitidos, nao 21/17 — ver a taxonomia logo abaixo.

(3) PONTO CEGO QUE PERMANECE, DECLARADO E NAO SO NA ADR (`ADR-016` "Limite declarado", `E6`,
    DoD-9 desta task): `getattr(date, "today")()` sai `0` — mesma classe do `importlib` e de
    atributo montado em runtime que `ADR-011/D3a` ja declara para o `grimp`. Nome produzido em
    runtime nao tem ligacao estatica para este (ou qualquer) scanner de AST consultar. Fechar
    isto exigiria instrumentacao em tempo de execucao, que nenhuma task tem; dono nomeado:
    `/architect`, na primeira `[NAO SEI]` que o exigir (`ADR-016`, secao "Limite declarado").

── A TAXONOMIA, e ela e a regra que decide os casos futuros de `time` sem nova consulta ────────

  L        le o relogio       o valor depende de QUANDO                     -> proibido (14)
  E        escreve estado     efeito sobre o processo ou o sistema          -> proibido (3)
  A        depende do AMBIENTE  sem depender do tempo (resolucao, tz, id)   -> proibido (6)
  ARIDADE  le SO sem argumento; com argumento e formatador puro             -> condicional (5)
  P        puro                formatacao e tipos                          -> permitido (10)

`14+3+6+5+10 = 38`, particao exaustiva e disjunta sobre `dir(time)` (Python 3.13), conferida
por `_confere_particao()` — ela falha alto (`RECUSA`, nao silencio) se uma versao futura de
Python mudar `dir(time)` e a particao deixar de cobrir ou passar a se sobrepor.

`A` e proibido pela metade "dependencia de ambiente" que `ADR-016/D1` nomeia: mesmo codigo,
outra maquina, outra resposta — o defeito que passa em CI e falha em producao.

`datetime` NAO foi auditado nome a nome (a pergunta da ERRATA 1 era sobre `time`). Caso
concreto deixado `[NAO SEI]`, dono `/architect`: `datetime.fromtimestamp` usa o fuso LOCAL com
1 argumento e e deterministico com `tz=` — e da familia ARIDADE, e hoje nao esta em nenhuma
lista.

── DoD-10 · O FALSIFICADOR DA PROPRIA ADR, e ele e a saida deste script ────────────────────────

Cada linha `RELOGIO EM CAMADA PURA: <arquivo>:<linha> -> <expressao>` e o dado bruto: ao fim da
fase 03, conte no historico de `make natureza` quantas acusacoes foram FALSO POSITIVO (`date`
ou `timedelta` legitimos) contra quantas foram VERDADEIRO POSITIVO (leitura de relogio real que
o portao barrou). Placar de referencia em 2026-08-29 (`ADR-016`, `E3`): 0 x 3. Se
FALSO POSITIVO >= VERDADEIRO POSITIVO, `ADR-016/D4` cai e o par volta a
`forbidden_modules = ["socket", "ssl"]` — o relogio em camada pura volta a ser convencao de
revisao humana, sem portao algum.
"""

import ast
import sys
from pathlib import Path

# ── `time`: particao EXAUSTIVA E DISJUNTA de dir(time), conferida por _confere_particao() ─────
_TIME_L = {
    "time",
    "time_ns",
    "monotonic",
    "monotonic_ns",
    "perf_counter",
    "perf_counter_ns",
    "process_time",
    "process_time_ns",
    "thread_time",
    "thread_time_ns",
    "clock_gettime",
    "clock_gettime_ns",
    "sleep",
    "pthread_getcpuclockid",
}
_TIME_E = {"clock_settime", "clock_settime_ns", "tzset"}
_TIME_A = {"clock_getres", "get_clock_info", "timezone", "altzone", "daylight", "tzname"}
_TIME_ARIDADE = {"ctime", "asctime", "strftime", "localtime", "gmtime"}
_TIME_P = {
    "strptime",
    "struct_time",
    "mktime",
    "CLOCK_BOOTTIME",
    "CLOCK_MONOTONIC",
    "CLOCK_MONOTONIC_RAW",
    "CLOCK_PROCESS_CPUTIME_ID",
    "CLOCK_REALTIME",
    "CLOCK_TAI",
    "CLOCK_THREAD_CPUTIME_ID",
}

SEMPRE = {
    "datetime": {"now", "utcnow", "today"},
    "date": {"today"},
    "time": _TIME_L | _TIME_E | _TIME_A,
}
# ── ARIDADE: nome -> MINIMO de argumentos que o torna PURO ────────────────────────────────────
#
# Abaixo do minimo (ou referenciado sem ser chamado, quando a aridade nao e conhecida
# estaticamente), ele le o relogio. O LIMIAR E POR NOME, nao um "zero" universal:
# `time.strftime("%Y")` tem UM argumento e AINDA ASSIM chama `localtime()` por dentro; so
# `strftime(fmt, t)` e formatador puro.
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
        n = chamadas.get(id(no), -1)  # -1 = referenciado sem ser chamado
        return n < minimo
    return False


def achados(caminho: str | Path) -> list[tuple[str, int, str]]:
    """Devolve (caminho, linha, expressao) de cada leitura/escrita de relogio no arquivo."""
    caminho = str(caminho)
    arvore = ast.parse(Path(caminho).read_text(encoding="utf-8"), filename=caminho)
    ligacoes = _bindings(arvore)
    if not ligacoes:
        return []
    chamadas = _aridade_por_no(arvore)
    out: list[tuple[str, int, str]] = []

    for no in ast.walk(arvore):
        # ── SITIO 1: encadeamento de atributo a partir de um nome ligado ───────────────────
        if isinstance(no, ast.Attribute):
            alvo_no = no.value
            if isinstance(alvo_no, ast.Name) and alvo_no.id in ligacoes:
                mod = ligacoes[alvo_no.id].split(".")[-1]
                prefixo = alvo_no.id
            elif (
                isinstance(alvo_no, ast.Attribute)
                and isinstance(alvo_no.value, ast.Name)
                and alvo_no.value.id in ligacoes
            ):
                mod = alvo_no.attr
                prefixo = f"{alvo_no.value.id}.{alvo_no.attr}"
            else:
                continue
            if _proibido(mod, no.attr, chamadas, no):
                out.append((caminho, no.lineno, f"{prefixo}.{no.attr}"))

        # ── SITIO 2: o NOME NU — o buraco da ERRATA 1 (achado A-2 da T-03.12) ──────────────
        # `from time import monotonic` liga `monotonic` -> `time.monotonic`, e o sitio de
        # chamada e um `ast.Name`. A ligacao SEMPRE existiu; ninguem a consultava.
        elif isinstance(no, ast.Name) and isinstance(no.ctx, ast.Load):
            qual = ligacoes.get(no.id)
            if qual is None or "." not in qual:
                continue  # `import time` liga `time` -> `time`: nao e chamada
            mod, attr = qual.split(".", 1)
            if _proibido(mod, attr, chamadas, no):
                out.append((caminho, no.lineno, f"{no.id} (={qual})"))

    return sorted(set(out), key=lambda t: (t[0], t[1], t[2]))


def main(argv: list[str]) -> int:
    """Varre cada raiz de `argv[1:]`, imprime o universo e cada acusacao; devolve o `rc`."""
    if len(argv) < 2:
        print("uso: natureza.py <raiz> [<raiz> ...]", file=sys.stderr)
        return 3
    _confere_particao()

    tot: list[tuple[str, int, str]] = []
    universo = 0
    for raiz in argv[1:]:
        alvo = Path(raiz)
        arquivos = sorted(alvo.rglob("*.py")) if alvo.is_dir() else [alvo]
        print(f"natureza: {len(arquivos)} arquivo(s) em {raiz}")
        universo += len(arquivos)
        for p in arquivos:
            tot += achados(p)

    for c, ln, e in tot:
        print(f"RELOGIO EM CAMADA PURA: {c}:{ln} -> {e}")
    print(f"natureza: universo de {universo} arquivo(s), {len(tot)} leitura(s) de relogio")
    return 1 if tot else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
