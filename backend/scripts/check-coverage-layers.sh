#!/usr/bin/env bash
# check-coverage-layers.sh — piso de cobertura POR CAMADA.
#
# Forma copiada do vizinho (`anything_monorepo/scripts/check-coverage-layers.sh`), com UMA
# diferenca deliberada: la, relatorio ausente DEGRADA para exit 0 ("pulando check"); aqui
# RECUSA com saida 3. Um portao que passa quando nao mediu nada e a classe de defeito que
# este repositorio nomeia — verde sem universo varrido nao e medicao.
#
# Metas por camada, herdadas do vizinho: domain 90 · use_cases 80 · infra 70.
#
# ── RELATORIO VELHO E TRATADO COMO RELATORIO AUSENTE (conserto do `/review`, item B) ──
#
# "Ausente" ja recusava. "Velho" NAO recusava, e era pior: um XML de horas antes descreve um
# universo que nao e mais o do disco, mas tem numeros, e numero fabricado passa por medicao.
# A recusa por frescor abaixo cobre o que o `rm -f` do `test.sh` NAO cobre: chamada direta
# deste script, e `.py` editado DEPOIS da ultima suite verde.
set -euo pipefail

BACKEND="$(cd "$(dirname "$0")/.." && pwd)"
COV_XML="${1:-$BACKEND/coverage.xml}"
PY="$BACKEND/.venv/bin/python"

if [ ! -x "$PY" ]; then
    echo "RECUSA: $PY nao existe. Rode 'bash backend/scripts/bootstrap.sh'." >&2
    exit 3
fi

if [ ! -f "$COV_XML" ]; then
    echo "RECUSA: $COV_XML ausente — sem relatorio nao ha piso a verificar." >&2
    echo "        Rode 'bash backend/scripts/test.sh', que o gera antes de chamar este." >&2
    exit 3
fi

MAIS_NOVOS="$(find "$BACKEND/src" -name '*.py' -not -path '*/__pycache__/*' -newer "$COV_XML" -print 2>/dev/null || true)"
if [ -n "$MAIS_NOVOS" ]; then
    echo "RECUSA: $COV_XML e mais VELHO que o codigo que ele diz medir." >&2
    echo "        Relatorio velho descreve um universo que nao e mais o do disco — e numero" >&2
    echo "        de universo errado nao e medicao, e a mesma falha de 'relatorio ausente'." >&2
    echo "        Arquivo(s) de src/ mais novos que o relatorio:" >&2
    printf '          %s\n' $MAIS_NOVOS >&2
    echo "        Rode 'bash backend/scripts/test.sh' (sem --no-cov) para remedir." >&2
    exit 3
fi

echo "=== Cobertura por camada (ADR-009/D1) ==="
"$PY" - "$COV_XML" <<'PY'
import sys
import xml.etree.ElementTree as ET

CAMADAS = [
    ("domain", ("/domain/",), 90.0),
    ("use_cases", ("/use_cases/",), 80.0),
    ("infra", ("/infra/",), 70.0),
]
agregado = {nome: [0, 0] for nome, _, _ in CAMADAS}

arvore = ET.parse(sys.argv[1])
for classe in arvore.iter("class"):
    caminho = "/" + classe.get("filename", "").replace("\\", "/").strip("/") + "/"
    for nome, pedacos, _ in CAMADAS:
        if any(pedaco in caminho for pedaco in pedacos):
            for linha in classe.iter("line"):
                agregado[nome][0] += 1 if linha.get("hits", "0") != "0" else 0
                agregado[nome][1] += 1
            break

reprovadas = 0
vistas = 0
for nome, _, meta in CAMADAS:
    coberto, total = agregado[nome]
    if total == 0:
        print(f"  [RECUSA] {nome:<10} zero linha no relatorio — camada nao medida")
        reprovadas += 1
        continue
    vistas += 1
    pct = 100.0 * coberto / total
    marca = "OK  " if pct + 1e-9 >= meta else "FAIL"
    reprovadas += 1 if marca == "FAIL" else 0
    print(f"  [{marca}] {nome:<10} {pct:5.1f}% (meta {meta:.0f}%)  [{coberto}/{total} linhas]")

print(f"  universo: {vistas} camada(s) medida(s) de {len(CAMADAS)} declarada(s)")
sys.exit(1 if reprovadas else 0)
PY
