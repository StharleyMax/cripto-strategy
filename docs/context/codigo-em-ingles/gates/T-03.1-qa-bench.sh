#!/usr/bin/env bash
# Bancada de /qa da `T-03.1` (`CST-96`) — o que o ESLint NAO cobre.
#
# POR QUE ESTE ARQUIVO EXISTE, e a razao e uma ausencia medida: `frontend/` nao tem suite.
# `frontend/package.json` declara UM script, `"lint": "eslint src"`; nao ha `vitest`, nao ha
# `tsc` no portao, e `make lint-frontend` chama so o ESLint. ESLint le REGRA DE ESTILO, nao
# COMPORTAMENTO: ele aprovaria com nota cheia um `format-percentage.ts` cujo `toFixed` passou
# a arredondar para o outro lado. Depois de um rename que troca 9 identificadores em 4
# arquivos, "o lint passou" nao e evidencia de que os arquivos ainda fazem o que faziam —
# e o unico jeito de saber e EXECUTAR os dois lados e comparar.
#
# A ARVORE NAO E TOCADA. Nada e escrito em `frontend/src` (`CA-F3-1` conta 4 arquivos), e
# NENHUM `*.test.*` nasce sob `frontend/src` — criar um fecharia o `[AVISO]`
# `web-fullstack.browser-test-file-present`, que o `NAO FAZ` da task manda deixar aberto.
# As duas versoes sao extraidas por `git show` para um diretorio temporario fora do repo.
#
# USO:  bash docs/context/codigo-em-ingles/gates/T-03.1-qa-bench.sh [REV_ANTES] [REV_DEPOIS]
#       rc=0 mediu e passou · rc=1 mediu e REPROVOU · rc=3 NAO MEDIU (dependencia ausente)
#
# `rc=3` NAO E "passou" (`ADR-012`; cabecalho do `Makefile`). Quem usar este script num
# portao tem de distinguir 1 de 3.

set -uo pipefail

REV_ANTES="${1:-c7df90c}"
REV_DEPOIS="${2:-HEAD}"

REPO="$(git rev-parse --show-toplevel)"
cd "$REPO" || exit 3

FALHAS=0
ok()   { printf '  [OK  ] %s\n' "$1"; }
fail() { printf '  [FALHA] %s\n' "$1"; FALHAS=$((FALHAS + 1)); }
sec()  { printf '\n=== %s ===\n' "$1"; }

# ── RECUSA explicita, distinta de reprovacao ──────────────────────────────────────
test -d frontend/node_modules || {
  printf 'RECUSA (rc=3): frontend/node_modules ausente — sem ele nao ha `tsc` e NADA foi medido.\n' >&2
  printf '        Rode `make setup` (precisa de rede). rc=3 e "nao mediu", nao "passou".\n' >&2
  exit 3
}
TSC="$REPO/frontend/node_modules/.bin/tsc"
test -x "$TSC" || { printf 'RECUSA (rc=3): %s ausente ou nao executavel.\n' "$TSC" >&2; exit 3; }
command -v node >/dev/null || { printf 'RECUSA (rc=3): `node` ausente.\n' >&2; exit 3; }

BANCADA="$(mktemp -d)"
trap 'rm -rf "$BANCADA"' EXIT

# ── A · EQUIVALENCIA COMPORTAMENTAL velho x novo, EXECUTADA ───────────────────────
# O mapa NORMATIVO e `SPEC-002` §3.2. O invariante NAO e "o objeto e igual": a chave
# `painel:` -> `panel:` muda POR CONTRATO enquanto o valor `"/painel"` fica em portugues
# (`CA-F3-8`, `[Q2]` do owner). Logo: chaves mapeadas pelo mapa, VALORES identicos.
sec "A · comportamento preservado — as duas versoes compiladas e EXECUTADAS"
mkdir -p "$BANCADA/antes" "$BANCADA/depois"
git show "$REV_ANTES:frontend/src/components/ui/formatar-percentual.ts" > "$BANCADA/antes/fp.ts" || exit 3
git show "$REV_DEPOIS:frontend/src/components/ui/format-percentage.ts"  > "$BANCADA/depois/fp.ts" || exit 3
git show "$REV_ANTES:frontend/src/app/rotas.ts"                          > "$BANCADA/antes/r.ts"  || exit 3
git show "$REV_DEPOIS:frontend/src/app/routes.ts"                        > "$BANCADA/depois/r.ts" || exit 3
git show "$REV_ANTES:frontend/src/features/painel/config.ts"             > "$BANCADA/antes/c.ts"  || exit 3
git show "$REV_DEPOIS:frontend/src/features/panel/config.ts"             > "$BANCADA/depois/c.ts" || exit 3

compila() {
  "$TSC" --target es2020 --module es2020 --moduleResolution bundler \
         --outDir "$BANCADA/$1/js" "$BANCADA/$1"/*.ts
}
compila antes  || { printf 'RECUSA (rc=3): tsc falhou no lado ANTES.\n' >&2; exit 3; }
compila depois || { fail "tsc REPROVA o lado DEPOIS — os arquivos renomeados nao compilam"; }

cat > "$BANCADA/equivalencia.mjs" <<'JS'
import assert from "node:assert/strict";
const B = process.argv[2];
const a = { fp: await import(`${B}/antes/js/fp.js`),  r: await import(`${B}/antes/js/r.js`),  c: await import(`${B}/antes/js/c.js`) };
const d = { fp: await import(`${B}/depois/js/fp.js`), r: await import(`${B}/depois/js/r.js`), c: await import(`${B}/depois/js/c.js`) };
const KEYMAP = { painel: "panel" };                       // SPEC-002 §3.2
const RAZOES = [0, 1, -1, 0.5, -0.5, 0.12345, -0.98765, 1e-9, 12345.6789, -0, Infinity, -Infinity, NaN];
const CASAS  = [0, 1, 2, 5, undefined];
let n = 0;
for (const x of RAZOES) for (const k of CASAS) {
  const velho = k === undefined ? a.fp.formatarPercentual(x) : a.fp.formatarPercentual(x, k);
  const novo  = k === undefined ? d.fp.formatPercentage(x)   : d.fp.formatPercentage(x, k);
  assert.equal(novo, velho, `formatPercentage(${x}, ${k}) -> ${JSON.stringify(novo)} ; formatarPercentual -> ${JSON.stringify(velho)}`);
  n++;
}
const ka = Object.keys(a.r.ROTAS), kd = Object.keys(d.r.ROUTES);
assert.equal(kd.length, ka.length, `ROUTES mudou de aridade: ${ka.length} -> ${kd.length}`); n++;
for (const k of ka) {
  const m = KEYMAP[k] ?? k;
  assert.ok(kd.includes(m), `chave ${k} -> ${m} sumiu de ROUTES`); n++;
  assert.equal(d.r.ROUTES[m], a.r.ROTAS[k], `o VALOR de ${k} mudou: ${a.r.ROTAS[k]} -> ${d.r.ROUTES[m]}`); n++;
}
assert.equal(d.r.ROUTES.panel, "/painel", "CA-F3-8: o valor da URL deixou de ser /painel"); n++;
assert.deepEqual(d.c.panelConfig, a.c.configPainel, "panelConfig != configPainel"); n++;
console.log(`${n}`);
JS

N_ASSERT="$(node "$BANCADA/equivalencia.mjs" "$BANCADA" 2>"$BANCADA/eq.err")"
if [ $? -eq 0 ] && [ -n "$N_ASSERT" ]; then
  ok "equivalencia velho x novo: ${N_ASSERT} assercoes, todas iguais"
else
  fail "equivalencia velho x novo REPROVOU: $(head -3 "$BANCADA/eq.err" | tr '\n' ' ')"
fi

# ── A' · A MUTACAO OBRIGATORIA — verde nao prova nada ate uma mutacao reprovar ────
# Sem este bloco, o de cima seria satisfeito por um `assert` que nunca olha nada.
sec "A' · mutacao — o bloco A tem de REPROVAR quando o comportamento muda"
sed -i 's/toFixed(digits)/toFixed(digits + 1)/' "$BANCADA/depois/fp.ts"
rm -rf "$BANCADA/depois/js" && compila depois >/dev/null 2>&1
if node "$BANCADA/equivalencia.mjs" "$BANCADA" >/dev/null 2>&1; then
  fail 'MUTANTE SOBREVIVEU: toFixed(digits + 1) passou pelo bloco A — o bloco A nao mede nada'
else
  ok 'mutante morto: toFixed(digits) -> toFixed(digits + 1) reprova o bloco A'
fi

# ── B · CA-F3-6, os TRES lados, e o controle de VACUIDADE ─────────────────────────
sec "B · CA-F3-6 — nasceu, morreu, e so entao classify"
NOVOS="frontend/src/app/routes.ts frontend/src/components/ui/format-percentage.ts frontend/src/features/panel/config.ts frontend/src/features/panel/Filter.tsx"
ANTIGOS="frontend/src/app/rotas.ts frontend/src/components/ui/formatar-percentual.ts frontend/src/features/painel/config.ts frontend/src/features/painel/Filtro.tsx"
for p in $NOVOS;   do test -f "$p" && ok "(1) nasceu: $p" || fail "(1) NAO existe: $p"; done
for p in $ANTIGOS; do test -f "$p" && fail "(2) SOBREVIVEU o caminho antigo: $p" || ok "(2) morreu: $p"; done
HN="${HARNESS_MECHANISM:-harness}"
for p in $NOVOS; do
  if "$HN" code-paths classify "$p" 2>/dev/null | grep -q '^producao:'; then ok "(3) classify producao: $p"; else fail "(3) classify NAO devolveu producao: $p"; fi
done
# o passo (2) nao e cerimonia: `classify` e CEGO A EXISTENCIA e devolve `producao` para
# caminho inexistente. Se isto deixar de valer, o argumento acima mudou e alguem tem de saber.
if "$HN" code-paths classify frontend/src/features/painel/Filtro.tsx 2>/dev/null | grep -q '^producao:'; then
  ok "controle: classify devolve 'producao' para caminho INEXISTENTE — por isso o passo (2) e obrigatorio"
else
  fail "controle mudou: classify deixou de ser cego a existencia; reveja CA-F3-6 e SPEC-002 §0.4"
fi

# ── C · A prova de dois lados, e a MORDIDA tem de cair DENTRO de features/panel/ ──
sec "C · CA-F3-3 — os 4 casos, DEPOIS do rename"
PANEL="frontend/src/features/panel"
# o invariante e "os 4 casos nao deixam residuo", nao "a arvore esta limpa": este proprio
# script pode estar untracked na primeira execucao. Comparo o ESTADO, nao o vazio.
ESTADO_ANTES="$(git status --porcelain)"

printf 'export type Payload = Record<string, any>;\nexport const cache: Map<string, any> = new Map();\n' > "$PANEL/tipos.ts"
npm --prefix frontend run lint > "$BANCADA/caso1.out" 2>&1; RC1=$?
rm -f "$PANEL/tipos.ts"
if [ $RC1 -ne 0 ] && [ "$(grep -c 'no-explicit-any' "$BANCADA/caso1.out")" -eq 2 ] && grep -q "$PANEL/tipos.ts" "$BANCADA/caso1.out"; then
  ok "caso 1/4 MORDE: rc=$RC1, 2 erros no-explicit-any, e o caminho mordido esta DENTRO de $PANEL/"
else
  fail "caso 1/4: rc=$RC1, erros=$(grep -c 'no-explicit-any' "$BANCADA/caso1.out"), mordida em $PANEL/? $(grep -q "$PANEL/tipos.ts" "$BANCADA/caso1.out" && echo sim || echo NAO)"
fi

npm --prefix frontend run lint > "$BANCADA/caso2.out" 2>&1; RC2=$?
[ $RC2 -eq 0 ] && ok "caso 2/4 CALA: rc=0 sobre a arvore limpa" || fail "caso 2/4: rc=$RC2, esperado 0"

printf 'import { x } from "../../../../backend/src/modules/sentimento/domain/etl_backlog";\nexport function Serie() { console.log(x); return null; }\n' > "$PANEL/serie.tsx"
"$HN" rules --mode file --path "$PANEL/serie.tsx" --surface ci > "$BANCADA/caso3.out" 2>&1; RC3=$?
rm -f "$PANEL/serie.tsx"
if [ $RC3 -ne 0 ] && grep -q "\[BLOQUEIO\].*browser-imports-server.*$PANEL/serie.tsx" "$BANCADA/caso3.out"; then
  ok "caso 3/4 MORDE: rc=$RC3, [BLOQUEIO] browser-imports-server DENTRO de $PANEL/"
else
  fail "caso 3/4: rc=$RC3, saida=$(head -1 "$BANCADA/caso3.out")"
fi

"$HN" rules --mode file --path "$PANEL/Filter.tsx" --surface ci > "$BANCADA/caso4.out" 2>&1; RC4=$?
if [ $RC4 -eq 0 ] && [ ! -s "$BANCADA/caso4.out" ] && test -f "$PANEL/Filter.tsx"; then
  ok "caso 4/4 CALA: test -f rc=0 (o arquivo EXISTE) e rules rc=0 com 0 byte"
else
  fail "caso 4/4: test -f=$(test -f "$PANEL/Filter.tsx" && echo 0 || echo 1), rules rc=$RC4, bytes=$(wc -c < "$BANCADA/caso4.out")"
fi

"$HN" rules --mode sweep > "$BANCADA/sweep.out" 2>&1; RCS=$?
NA=$(grep -c '\[AVISO\]'    "$BANCADA/sweep.out")
NB=$(grep -c '\[BLOQUEIO\]' "$BANCADA/sweep.out")
if [ $RCS -eq 0 ] && [ "$NA" -eq 1 ] && [ "$NB" -eq 0 ]; then
  ok "sweep: rc=0, 1 [AVISO] (browser-test-file-present, aberto DE PROPOSITO), 0 [BLOQUEIO]"
else
  fail "sweep: rc=$RCS, avisos=$NA (esperado 1), bloqueios=$NB (esperado 0)"
fi
if [ "$(git status --porcelain)" = "$ESTADO_ANTES" ]; then
  ok "os 4 casos nao deixaram residuo (git status identico ao de antes)"
else
  fail "os 4 casos DEIXARAM residuo na arvore: $(git status --porcelain | tr '\n' ' ')"
fi

# ── D · CA-F1-6 nas DUAS formas, porque as duas circulam ──────────────────────────
# `SPEC-002` §4.3 publica o comando com `grep -vxE` (filtra os nomes de componente); o
# relatorio de build publica um sem o filtro. Os dois medem a mesma coisa e devolvem `n`
# DIFERENTE, e o que o criterio pesa e "zero portugues", nao o `n`.
sec "D · CA-F1-6 — o medidor de erosao, nas duas formas publicadas"
N_SPEC=$(git ls-tree -r --name-only "$REV_DEPOIS" | grep -E '^(backend/src|backend/tests|frontend/src)/' \
         | awk -F/ '{for(i=1;i<NF;i++) print $i}' | sort -u | grep -vxE 'sentimento|charts|convergencia|backtest|web|docs' | wc -l)
N_BUILD=$(git ls-files backend/src backend/tests frontend/src | xargs -n1 dirname | tr '/' '\n' | sort -u | wc -l)
printf '  forma SPEC-002 §4.3 (com grep -vxE): n=%s\n  forma do relatorio de build (sem filtro): n=%s\n' "$N_SPEC" "$N_BUILD"
PT=$(git ls-files backend/src backend/tests frontend/src | xargs -n1 dirname | tr '/' '\n' | sort -u | grep -xE 'painel|filtro|rotas|graficos|convergencia|sentimento' | grep -vx 'sentimento' | wc -l)
[ "$PT" -eq 0 ] && ok "zero segmento em portugues fora da excecao \`sentimento\` (o que CA-F1-6 pesa)" \
                || fail "$PT segmento(s) em portugues fora da excecao — a excecao virou rampa"
SET_PT=$(git ls-files backend/src backend/tests frontend/src | xargs -n1 dirname | tr '/' '\n' | sort -u | grep -xc 'sentimento')
[ "$SET_PT" -eq 1 ] && ok "o conjunto portugues e {sentimento}, tamanho 1 — CALA de CA-F1-6" \
                    || fail "o conjunto portugues nao e {sentimento}"

# ── E · O conjunto VIVO ENUMERADO foi a ZERO — e o residuo esta FORA dele ─────────
# `SPEC-002` §4.1 [G-A1]: o criterio e classe + conjunto ENUMERADO + rev, NUNCA "as N
# citacoes". `docs/context/codigo-em-ingles/` cita os nomes antigos porque DESCREVE o
# rename, e nao esta no conjunto VIVO (`SPEC-002` §4.2 + os 5 arquivos da task).
sec "E · lado CALA sobre o conjunto VIVO enumerado"
VIVOS_CAMINHO="harness.toml README.md backend/README.md frontend/README.md docs/context/plataforma-dados backend/src backend/tests frontend/src"
for t in 'Filtro.tsx' 'painel/' 'rotas.ts' 'formatar-percentual.ts'; do
  n=$(git grep -n -F "$t" "$REV_DEPOIS" -- $VIVOS_CAMINHO | wc -l)
  m=$(git grep -n -F "$t" "$REV_ANTES"  -- $VIVOS_CAMINHO | wc -l)
  if [ "$m" -ge 1 ] && [ "$n" -eq 0 ]; then ok "CAMINHO $t: MORDE=$m -> CALA=$n"
  elif [ "$m" -eq 0 ]; then fail "CAMINHO $t: MORDE n=0 em $REV_ANTES — o TOKEN esta errado (ADR-015/D2)"
  else fail "CAMINHO $t: sobrou $n citacao(oes) no conjunto VIVO"; fi
done
VIVOS_IDENT="backend/src backend/tests frontend/src"
for t in 'configPainel' 'ROTAS' 'Rota' 'formatarPercentual' 'razao' 'casas' 'sinal'; do
  n=$(git grep -n -F "$t" "$REV_DEPOIS" -- $VIVOS_IDENT | wc -l)
  [ "$n" -eq 0 ] && ok "IDENT $t: CALA=0 no escopo so-codigo" || fail "IDENT $t: sobrou $n no escopo so-codigo"
done
# a evidencia PROTEGIDA que NAO pode sumir (`CA-F3-2`, `PRD-002` §5.3)
grep -qF 'Filtro: any resultado serve' "$PANEL/Filter.tsx" && ok "CA-F3-2: o texto JSX \`Filtro: any resultado serve\` SOBREVIVEU" \
                                                           || fail "CA-F3-2: a evidencia protegida foi 'arrumada' — reprova a fase"
grep -qF 'any: true' "$PANEL/config.ts" && ok "CA-F3-2: \`any: true\` como chave de objeto SOBREVIVEU" \
                                        || fail "CA-F3-2: \`any: true\` sumiu"
# o residuo declarado: nenhuma citacao antiga pode viver num `[[tasks]]` que NAO seja a T-03.1
LINHA_T031_INI=$(grep -n 'id = "T-03.1"' docs/context/codigo-em-ingles/tasks.toml | cut -d: -f1)
LINHA_T031_FIM=$(awk -v i="$LINHA_T031_INI" 'NR>i && /^\[\[tasks\]\]/ {print NR; exit}' docs/context/codigo-em-ingles/tasks.toml)
LINHA_1A_TASK=$(grep -n '^\[\[tasks\]\]' docs/context/codigo-em-ingles/tasks.toml | head -1 | cut -d: -f1)
FORA=$(git grep -n -F -e 'Filtro.tsx' -e 'painel/' -e 'rotas.ts' -e 'formatar-percentual.ts' -- docs/context/codigo-em-ingles/tasks.toml \
       | cut -d: -f2 | awk -v a="$LINHA_1A_TASK" -v i="$LINHA_T031_INI" -v f="$LINHA_T031_FIM" '$1>=a && !($1>i && $1<f)' | wc -l)
[ "$FORA" -eq 0 ] && ok 'nenhuma citacao antiga num [[tasks]] que nao seja a T-03.1 (as do cabecalho sao registro de medicao)' \
                  || fail "$FORA citacao(oes) antiga(s) num [[tasks]] AINDA ABERTO — obrigacao VIVA disfarcada de historica (ADR-015/D3)"

# ── F · O DEFEITO PROVADO: MORDE e CALA tem de sair do MESMO pathspec ────────────
# `ADR-015/D2` mede cada token "nos dois lados". Se o lado MORDE sair de um universo e o
# lado CALA de outro, a tabela mostra um colapso que NENHUM comando produz — e o `0` do
# lado CALA nao e evidencia sobre o `n` do lado MORDE, e sim sobre outro conjunto.
# Esta checagem existe porque isso ACONTECEU no relatorio de build (§2): a coluna MORDE
# (36/29/8/3) sai de `docs/context` INTEGRAL e a coluna CALA (0/0/0/0) sai de
# `docs/context/plataforma-dados`. Sob o comando PUBLICADO acima da tabela, o MORDE e
# 8/17/1/1. `[MEDIDO por esta bancada]`
sec "F · consistencia de escopo entre os dois lados"
INTEGRAL="harness.toml README.md backend/README.md frontend/README.md docs/context backend/src backend/tests frontend/src"
ENUMERADO="harness.toml README.md backend/README.md frontend/README.md docs/context/plataforma-dados backend/src backend/tests frontend/src"
for t in 'Filtro.tsx' 'painel/' 'rotas.ts' 'formatar-percentual.ts'; do
  mi=$(git grep -n -F "$t" "$REV_ANTES"  -- $INTEGRAL   | wc -l)
  ci=$(git grep -n -F "$t" "$REV_DEPOIS" -- $INTEGRAL   | wc -l)
  me=$(git grep -n -F "$t" "$REV_ANTES"  -- $ENUMERADO  | wc -l)
  ce=$(git grep -n -F "$t" "$REV_DEPOIS" -- $ENUMERADO  | wc -l)
  printf '  %-24s integral %s->%s   enumerado %s->%s\n' "$t" "$mi" "$ci" "$me" "$ce"
  if [ "$mi" = "$me" ]; then
    ok "$t: os dois escopos coincidem — nao ha como confundi-los"
  elif [ "$ce" -eq 0 ] && [ "$ci" -gt 0 ]; then
    ok "$t: escopo enumerado CALA em 0 e o integral NAO — publicar MORDE integral com CALA enumerado seria hibrido"
  else
    fail "$t: escopo enumerado nao CALA (integral $mi->$ci, enumerado $me->$ce)"
  fi
done

sec "VEREDITO DA BANCADA"
if [ "$FALHAS" -eq 0 ]; then printf 'rc=0 — todas as checagens passaram\n'; exit 0; fi
printf 'rc=1 — %s checagem(ns) REPROVARAM\n' "$FALHAS"; exit 1
