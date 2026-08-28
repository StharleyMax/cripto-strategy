#!/usr/bin/env bash
# measure_stitch_drift.sh — auditoria de DRIFT do Stitch. NAO E GATE.
#
# Por que este arquivo existe:
#   DESIGN_SYSTEM.md §1.4-quater estabelece que "todo numero publicado neste documento tem de
#   existir dentro do script". Os numeros de drift medidos em 2026-08-25 (4a revisao) precisavam
#   de comando, e nenhum deles pertence ao gate: eles medem valores que a plataforma REJEITA,
#   nao valores que ela adota. Poe-los em validate_palette.js confundiria auditoria com gate.
#
# Por que ele EXTRAI o estimador em vez de reimplementar:
#   O defeito mais caro que este projeto ja mediu foi "estimador diferente, publicado como se
#   fosse o mesmo" (Vienot 1999 contra Brettel 1997, divergencia de ~2x e de 28.0 em tritan).
#   Duas copias do estimador divergem em silencio. Aqui existe UMA copia — as linhas 1..185 de
#   validate_palette.js — e ela e extraida em tempo de execucao. Se validate_palette.js mudar
#   o estimador, este script muda com ele, ou quebra alto.
#
# Uso:  bash scripts/measure_stitch_drift.sh
set -euo pipefail
cd "$(dirname "$0")/.."

GATE=scripts/validate_palette.js
PRELUDE_END=185
OUT="$(mktemp -t stitchdrift.XXXXXX.js)"
trap 'rm -f "$OUT"' EXIT

# --- guarda: o prelude extraido ainda define o que precisamos? ---
for sym in simBrettel ciede2000 relLum contraste min3 vered de; do
  grep -q "\b$sym\b" <(sed -n "1,${PRELUDE_END}p" "$GATE") \
    || { echo "ABORTA: '$sym' nao esta nas linhas 1..$PRELUDE_END de $GATE."; \
         echo "O prelude mudou de forma. Reveja PRELUDE_END antes de confiar em qualquer numero."; exit 2; }
done

sed -n "1,${PRELUDE_END}p" "$GATE" > "$OUT"
cat >> "$OUT" <<'JSEOF'

// ==================================================================
// DRIFT DO STITCH — medido em 2026-08-25 (4a revisao)
// Fonte dos valores: extracao de hex do HTML de
//   projects/9264019151773162472/screens/f233baf87e12403797d1c867f69ab53d
// ATENCAO (2026-08-28): essa tela esta REVOGADA e e o registro do drift, nao a S2.
//   A S2 canonica e screens/8174234965cd4ffbacfb7b2a0a61a427 (Rev. B), APROVADA com
//   0 reprovacoes em scripts/verify_screen.py. Ver STITCH_CONTEXT.md 4.1.0.
//   Este bloco mede o DRIFT HISTORICO e por isso continua apontando para f233 de proposito:
//   trocar a fonte aqui apagaria a medicao que justifica a governanca.
// ==================================================================

const linha = (r) => console.log(r);
linha('');
linha('BLOCO D1 — as superficies do Stitch NAO sao as nossas');
const SUP_STITCH = { fundo:'#121315', painel:'#16181d', chrome:'#0d0e10', borda:'#2a2e39' };
const SUP_NOSSA  = { base:'#131722',  chrome:'#0d1017', listra:'#222634' };
for (const [k,v] of Object.entries(SUP_STITCH))
  linha(`  stitch ${k.padEnd(7)} ${v}  lum ${relLum(v).toFixed(5)}`);
for (const [k,v] of Object.entries(SUP_NOSSA))
  linha(`  nossa  ${k.padEnd(7)} ${v}  lum ${relLum(v).toFixed(5)}`);
linha(`  contraste #16181d x #131722 = ${contraste('#16181d','#131722').toFixed(3)}`);
linha('  => uma superficie a 1.008 da correta ainda esta ERRADA. Proximidade nao e conformidade.');

linha('');
linha('BLOCO D2 — o par de direcao REVOGADO contra o par EM VIGOR');
for (const [a,b,rot] of [['#2a78d6','#eb6834','REVOGADO  azul/laranja'],
                         ['#089981','#f23645','EM VIGOR  verde/vermelho TradingView']]) {
  const razao = (relLum(a)+0.05)/(relLum(b)+0.05);
  linha(`  ${rot.padEnd(38)} min3 ${min3(a,b).toFixed(1).padStart(5)}  ${vered(min3(a,b))}` +
        `   cinza ${(razao>1?razao:1/razao).toFixed(3)} COLAPSA`);
}
linha('  ATENCAO, e e uma tarja: o par REVOGADO mede MELHOR sob dicromacia (51.1 contra 18.0).');
linha('  A revogacao NAO foi ganha no eixo da dicromacia — foi ganha na Lei de Jakob (o owner');
linha('  le TradingView todo dia). O par em vigor PASSA (18.0 > piso 15), e e isso que se exige');
linha('  dele. Dizer que "nao havia trade-off" e falso: o trade-off e de 33.1 dE e foi ACEITO.');

linha('');
linha('BLOCO D3 — o numeral tingido de vermelho: text-error #ffb4ab em "1149/1152" e "1 lacuna"');
for (const s of ['#16181d','#0d0e10','#121315'])
  linha(`  contraste #ffb4ab sobre ${s} = ${contraste('#ffb4ab',s).toFixed(2)}`);
linha(`  #ffb4ab x #f23645 (vermelho de baixa em vigor) min3 = ${min3('#ffb4ab','#f23645').toFixed(1)}  ${vered(min3('#ffb4ab','#f23645'))}`);
linha(`  #ffb4ab x #eb6834 (a baixa DA TELA)            min3 = ${min3('#ffb4ab','#eb6834').toFixed(1)}  ${vered(min3('#ffb4ab','#eb6834'))}`);
linha('  => O DEFEITO NAO E ARITMETICO. O vermelho e legivel (10.46) e e separavel (21.1).');
linha('     O defeito e CATEGORICO: severidade nao tem canal de cor, e o numeral tem um unico');
linha('     eixo de tinta (procedencia, sem hue). Nao invente apoio numerico para uma conclusao');
linha('     que se sustenta sozinha — foi esse o defeito de forma que gerou a regra de 1.4-quater.');

linha('');
linha('BLOCO D4 — ACAO ESTA AZUL na tela: #a8c8ff (7 usos) e #4b91f1 (rail ativo)');
for (const az of ['#a8c8ff','#4b91f1','#2a78d6','#1d4ed8'])
  linha(`  ${az} x #e0aaff (integridade)  min3 ${min3(az,'#e0aaff').toFixed(1).padStart(5)}  ` +
        `${vered(min3(az,'#e0aaff')).padEnd(4)}  deutan ${de(az,'#e0aaff','deutan').toFixed(1)}`);
linha('  => #a8c8ff da 0.9: e a MESMA COR do violeta de integridade sob deuteranopia. E o valor');
linha('     que o sistema de cor dinamica DERIVOU da semente #2a78d6 — ou seja, "acao e azul"');
linha('     nao foi invencao do gerador de tela, foi o tema cumprindo o seu papel.');

linha('');
linha('BLOCO D5 — PROCEDENCIA COMO TINT DE COR falha nos PROPRIOS termos');
linha('  os tres tints que o designMd revogado prescrevia para OBSERVADO/DERIVADO/MODELADO:');
const T = ['#93c5fd','#c4b5fd','#99f6e4'];
for (let i=0;i<T.length;i++) for (let j=i+1;j<T.length;j++)
  linha(`    ${T[i]} x ${T[j]}  min3 ${min3(T[i],T[j]).toFixed(1).padStart(5)}  ${vered(min3(T[i],T[j]))}`);
for (const t of T)
  linha(`    ${t} x #e0aaff (integridade)  min3 ${min3(t,'#e0aaff').toFixed(1).padStart(5)}  ${vered(min3(t,'#e0aaff'))}`);
linha('  => DOIS dos tres tints medem 0.5 entre si: sao indistinguiveis. E #c4b5fd mede 0.6');
linha('     contra o violeta de integridade. Procedencia-como-hue nao separa nem os seus');
linha('     proprios niveis, e ainda invade o canal de integridade. Este e um argumento NOVO');
linha('     para ADR-010 D-4: antes ele era "o orcamento de hue tem 3 vagas" (escassez);');
linha('     agora ha tambem "o tint nao funciona" (aritmetica).');
linha('  o ramp EM VIGOR, sem hue:');
linha(`    #e6e9ef x #8b949e  min3 ${min3('#e6e9ef','#8b949e').toFixed(1)}  ` +
      `razao de luminancia ${((relLum('#e6e9ef')+0.05)/(relLum('#8b949e')+0.05)).toFixed(2)}`);

linha('');
linha('ESTE SCRIPT NAO E GATE. Ele nao tem exit != 0 por reprovacao, porque quase tudo que ele');
linha('mede e valor REJEITADO — reprovar era o esperado. O gate e scripts/validate_palette.js.');
JSEOF

node "$OUT"
