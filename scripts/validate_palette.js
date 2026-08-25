#!/usr/bin/env node
// validate_palette.js — o estimador que o DoD D5.6 nomeia.
//
// ESTIMADOR DE RECORDE (desde 2026-08-25, 3ª revisão): BRETTEL, VIÉNOT & MOLLON (1997),
//   dois semiplanos por dicromacia, projeção no espaço LMS. Cobre protan, deutan E TRITAN.
// ESTIMADOR ANTERIOR, mantido como segunda coluna para que os números publicados continuem
//   reproduzindo: Viénot, Brettel & Mollon (1999), UM plano. Só é válido para protan/deutan.
// Distância: CIEDE2000 (CIE 2001), D65, observador 2°.
//
// ESTE ARQUIVO FIXA O ESTIMADOR. Trocar de estimador troca os números: já foi medido
// neste projeto que `numpy.percentile` e `statistics.quantiles` divergem em razões ×p90.
// Um teste que reprova por troca silenciosa de estimador é a pior classe de teste vermelho.
// É POR ISSO que Viénot 1999 continua no arquivo em vez de ser apagado: BLOCO 0 mostra a
// diferença entre os dois estimadores, medida, em vez de a esconder atrás da troca.

const srgbToLinear = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linearToSrgb = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const hexToRgb = h => { const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255); };

// RGB linear -> LMS (Viénot 1999). Brettel 1997 usa O MESMO espaço LMS: o que muda é a
// PROJEÇÃO, não a transformada de cone. É isto que torna as duas colunas comparáveis.
const M_LMS = [[17.8824, 43.5161, 4.11935],
               [3.45565, 27.1554, 3.86714],
               [0.0299566, 0.184309, 1.46709]];
// LMS -> RGB linear (inversa de M_LMS)
const M_RGB = [[0.080944, -0.130504, 0.116721],
               [-0.010248, 0.054019, -0.113615],
               [-0.000365, -0.004122, 0.693513]];

const mul = (M, v) => M.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const cross = (a, b) => [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];

// ---------------------------------------------------------------------------
// BRETTEL 1997 — DOIS SEMIPLANOS, e os planos são DERIVADOS AQUI, não copiados.
// ---------------------------------------------------------------------------
// Método: cada semiplano contém a origem, o ponto branco W e uma ÂNCORA ESPECTRAL — o
// comprimento de onda que o dicromata enxerga veridicamente. Os dois semiplanos se
// articulam sobre o eixo neutro OW. O plano SEPARADOR é gerado por OW e pela direção de
// projeção (o eixo do cone ausente) ⇒ normal = W × e_k.
//
// POR QUE DERIVAR EM VEZ DE COPIAR CONSTANTE: a constante publicada vive num espaço LMS
// específico e não transporta em silêncio. Derivada aqui, ela é auditável por comando.
// VERIFICAÇÃO CRUZADA (rodada em 2026-08-25): esta derivação reproduz as constantes que a
// libDaltonLens publica para tritanopia — plano 660nm (-0.002592, 0.053691) e plano 485nm
// (-0.060108, 0.162987) — e a razão W_M/W_L = 0.52624 contra os 0.34478/0.65518 = 0.52623
// publicados. Cinco casas. A geometria está certa, não é coincidência de recall.
const CMF = {  // CIE 1931, 2°, nas âncoras de Brettel 1997
  475: [0.14210, 0.11260, 1.04190],   // protan/deutan, lado azul
  575: [0.84210, 0.91540, 0.00165],   // protan/deutan, lado amarelo
  485: [0.05795, 0.16930, 0.61604],   // tritan, lado ciano
  660: [0.16440, 0.06100, 0.00000],   // tritan, lado vermelho
};
const RGB_XYZ = [[3.2404542, -1.5371385, -0.4985314],
                 [-0.9692660, 1.8760108, 0.0415560],
                 [0.0556434, -0.2040259, 1.0572252]];
const W = mul(M_LMS, [1, 1, 1]);   // ponto branco = D65 = sRGB (1,1,1)
const lmsFromXYZ = xyz => mul(M_LMS, mul(RGB_XYZ, xyz));

// eixo do cone ausente, e as duas âncoras, por tipo
const BRETTEL = {
  protan: { k: 0, anc: [475, 575] },
  deutan: { k: 1, anc: [475, 575] },
  tritan: { k: 2, anc: [485, 660] },
};
for (const [kind, cfg] of Object.entries(BRETTEL)) {
  const k = cfg.k, idx = [0, 1, 2].filter(i => i !== k);
  cfg.idx = idx;
  cfg.planos = cfg.anc.map(nm => {
    const n = cross(W, lmsFromXYZ(CMF[nm]));
    return idx.map(i => -n[i] / n[k]);   // coeficientes de LMS[k]' = a*LMS[i0] + b*LMS[i1]
  });
  const e = [0, 0, 0]; e[k] = 1;
  cfg.nsep = cross(W, e);
}

function simBrettel(hex, kind) {
  const lin = hexToRgb(hex).map(srgbToLinear);
  if (kind === 'none') return lin.map(linearToSrgb);
  const lms = mul(M_LMS, lin), cfg = BRETTEL[kind];
  const dot = cfg.nsep[0]*lms[0] + cfg.nsep[1]*lms[1] + cfg.nsep[2]*lms[2];
  // dot >= 0 ⇒ o estímulo cai do lado da SEGUNDA âncora (575nm amarelo / 660nm vermelho)
  const c = dot >= 0 ? cfg.planos[1] : cfg.planos[0];
  const out = [...lms];
  out[cfg.k] = c[0] * lms[cfg.idx[0]] + c[1] * lms[cfg.idx[1]];
  return mul(M_RGB, out).map(x => Math.min(1, Math.max(0, x))).map(linearToSrgb);
}

// ---------------------------------------------------------------------------
// VIÉNOT 1999 — UM plano. MANTIDO só para reprodutibilidade histórica.
// ---------------------------------------------------------------------------
// ⚠️ MEDIDO nesta rodada, e é o motivo de Viénot ter sido REBAIXADO: os três conjuntos de
// coeficientes publicados por Viénot 1999 são EXATAMENTE `W × primária AZUL do sRGB`:
//     protan  L = 2.023442*M - 2.525806*S   (publicado 2.02344 / -2.52581)
//     deutan  M = 0.494207*L + 1.248272*S   (publicado 0.494207 / 1.24827)
//     tritan  S = -0.395913*L + 0.801108*M  (publicado -0.395913 / 0.801109)
// Para protan/deutan isso é inofensivo — os DOIS semiplanos de Brettel quase coincidem
// (protan 2.168 contra 2.185; deutan 0.4612 contra 0.4576) e o azul fica perto da âncora
// de 475nm. Para TRITANOPIA é degenerado: a primária azul é exatamente o eixo que a
// tritanopia PERDE, e os dois semiplanos reais divergem 23× no coeficiente de L
// (-0.0026 contra -0.0601). É por isso que o próprio artigo de 1999 se restringe a
// protan/deutan. Usar Viénot para tritan não é aproximar: é medir a coisa errada.
function simVienot(hex, kind) {
  const lin = hexToRgb(hex).map(srgbToLinear);
  let [L, Mm, S] = mul(M_LMS, lin);
  if (kind === 'protan') L = 2.02344 * Mm - 2.52581 * S;
  else if (kind === 'deutan') Mm = 0.494207 * L + 1.24827 * S;
  else if (kind === 'tritan') S = -0.395913 * L + 0.801109 * Mm;
  const out = mul(M_RGB, [L, Mm, S]).map(c => Math.min(1, Math.max(0, c)));
  return out.map(linearToSrgb);
}

function toLab(rgb) { // sRGB (0..1, já gama-codificado) -> Lab D65
  const [r, g, b] = rgb.map(srgbToLinear);
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const Y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b) / 1.0;
  const Z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
  const f = t => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function ciede2000(lab1, lab2) {
  const [L1, a1, b1] = lab1, [L2, a2, b2] = lab2;
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
  const ap1 = a1 * (1 + G), ap2 = a2 * (1 + G);
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const h = (x, y) => { if (x === 0 && y === 0) return 0; let d = Math.atan2(y, x) * deg; return d < 0 ? d + 360 : d; };
  const hp1 = h(ap1, b1), hp2 = h(ap2, b2);
  const dLp = L2 - L1, dCp = Cp2 - Cp1;
  let dhp = 0;
  if (Cp1 * Cp2 !== 0) { dhp = hp2 - hp1; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dhp * rad) / 2);
  const Lbp = (L1 + L2) / 2, Cbp = (Cp1 + Cp2) / 2;
  let hbp;
  if (Cp1 * Cp2 === 0) hbp = hp1 + hp2;
  else { const s = hp1 + hp2; hbp = Math.abs(hp1 - hp2) > 180 ? (s < 360 ? (s + 360) / 2 : (s - 360) / 2) : s / 2; }
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad)
            + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.20 * Math.cos((4 * hbp - 63) * rad);
  const dTh = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
  const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTh * rad) * Rc;
  return Math.sqrt(Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2)
                   + Rt * (dCp / Sc) * (dHp / Sh));
}

const de  = (h1, h2, kind) => ciede2000(toLab(simBrettel(h1, kind)), toLab(simBrettel(h2, kind)));
const deV = (h1, h2, kind) => ciede2000(toLab(simVienot(h1, kind)),  toLab(simVienot(h2, kind)));
const relLum = hex => { const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contraste = (a, b) => { const [l1, l2] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05); };

// ---------------------------------------------------------------------------
// PISOS. Declarados aqui, e a procedência de cada um está declarada com ele.
// ---------------------------------------------------------------------------
const PISO_DICROMACIA = 15;   // ΔE2000 entre dois papéis ADJACENTES. SEM norma citável.
const FRACAO_WARN = 0.45;     // SEM norma citável. ⇒ piso de WARN = 6,75.
const PISO_TEXTO = 4.5;       // WCAG 2.2 SC 1.4.3 AA — glifo de texto < 24px. NORMA.
const PISO_GRAFICO = 3.0;     // WCAG 2.2 SC 1.4.11 AA — objeto gráfico / fronteira de componente. NORMA.
const PISO_CINZA = 3.0;       // razão de LUMINÂNCIA entre dois fills que só se distinguem por cor.
                              // SEM norma: é a leitura deste projeto de SC 1.4.1 (Use of Color).
                              // Serve para PROVAR que um canal de FORMA é obrigatório, não para reprovar a cor.
const PISO_CINZA_TINTA = 1.5; // razão de LUMINÂNCIA entre duas TINTAS da MESMA coluna de tabela.
                              // SEM norma, e é o piso mais fraco deste arquivo. ADOTADO em 2026-08-25 (3ª rev.)
                              // porque o achado de tritanopia e o de captura-em-cinza têm a MESMA raiz: a
                              // tinta de integridade estava na posição menos distintiva possível da coluna.
                              // NÃO gateia — informa. Um piso sem procedência não tem direito de reprovar.

// VEREDITO DE DICROMACIA = min(protan, deutan, TRITAN). Antes de 2026-08-25 (3ª rev.) era
// min(protan, deutan) e tritanopia estava `[NÃO MEDIDO]` — era o falsificador declarado de
// DESIGN_SYSTEM §1.4, e ELE SE REALIZOU: o par `dado-quebrado-ink × proc-fraca` media 5,3
// em tritan no modo claro, abaixo até do piso de WARN.
const TIPOS = ['protan', 'deutan', 'tritan'];
const min3 = (a, b) => Math.min(...TIPOS.map(k => de(a, b, k)));

let houveFalha = false;
let nMedicoes = 0;
const fmt = (x, n = 1) => x.toFixed(n);
const vered = m => m >= PISO_DICROMACIA ? 'PASS' : m >= PISO_DICROMACIA * FRACAO_WARN ? 'WARN' : 'FAIL';

// ===========================================================================
// BLOCO 0 — OS DOIS ESTIMADORES, LADO A LADO. NÃO GATEIA.
// Existe porque a 3ª revisão TROCOU o estimador de recorde, e trocar estimador em
// silêncio é a pior classe de defeito que este arquivo conhece.
// ===========================================================================
console.log('BLOCO 0 — BRETTEL 1997 (recorde) contra VIENOT 1999 (rebaixado). NAO gateia.');
console.log('  Planos de Brettel DERIVADOS nesta execucao (W x ancora espectral):');
for (const kind of TIPOS) {
  const cfg = BRETTEL[kind], nomes = ['L', 'M', 'S'];
  for (let i = 0; i < 2; i++)
    console.log(`    ${kind.padEnd(7)} ancora ${cfg.anc[i]}nm: ${nomes[cfg.k]}' = ` +
      cfg.planos[i].map((c, j) => `${c.toFixed(6)}*${nomes[cfg.idx[j]]}`).join(' + '));
}
console.log('  ' + 'par'.padEnd(20) + '   BRETTEL pro/deu/tri      VIENOT pro/deu/tri     delta tritan');
const cmpEstim = [
  ['#089981', '#f23645', 'direcao alta x baixa'],
  ['#6d28d9', '#57606a', 'quebrado x fraca CLARO'],
  ['#c084fc', '#8b949e', 'quebrado x fraca ESCURO'],
];
for (const [a, b, nome] of cmpEstim) {
  const B = TIPOS.map(k => de(a, b, k)), V = TIPOS.map(k => deV(a, b, k));
  nMedicoes += 6;
  console.log('  ' + nome.padEnd(20) + '  ' + B.map(x => fmt(x).padStart(7)).join('') +
    '   ' + V.map(x => fmt(x).padStart(7)).join('') + '   ' + fmt(V[2] - B[2]).padStart(8));
}
console.log('  => protan/deutan concordam entre os dois estimadores (delta <= 4,8).');
console.log('     TRITAN divergem ate 27,9 e VIENOT SUPERESTIMA SEMPRE ⇒ usar Vienot para');
console.log('     tritanopia teria APROVADO o par que Brettel reprova. Era o falsificador.');

// ===========================================================================
// BLOCO 1 — HISTÓRICO. NÃO GATEIA. Existe para que os números publicados
// continuem reproduzindo, e para registrar o que foi rejeitado e por quê.
// ===========================================================================
const historico = [
  ['#2a78d6', '#eb6834', 'azul x laranja — par de direcao ANTIGO',   'publicado 24,7 / 26,8'],
  ['#008300', '#e34948', 'verde/vermelho generico',                  'publicado 7,2 / 8,6'],
  ['#d03b3b', '#eb6834', 'vermelho antigo x laranja de baixa',       'publicado 10,8 protan'],
  ['#f23645', '#eb6834', 'vermelho da TradingView x laranja',        'o PIOR par ja medido'],
  ['#f23645', '#2a78d6', 'vermelho x azul — a meia-medida da auditoria', 'passa, mas nao e o par da TradingView'],
  ['#6d28d9', '#57606a', 'CLARO: o violeta REVOGADO x tinta fraca',  'media 24,0 sem tritan; 5,3 COM tritan ⇒ FAIL'],
  ['#c084fc', '#8b949e', 'ESCURO: o violeta REVOGADO x tinta fraca', 'media 19,9 sem tritan; 14,7 COM tritan ⇒ WARN'],
];
console.log('\nBLOCO 1 — HISTORICO (nao gateia). Estimador: Brettel 1997 + CIEDE2000, D65, 2 graus.');
console.log('par'.padEnd(22) + 'protan'.padStart(8) + 'deutan'.padStart(8) + 'tritan'.padStart(8) + '   normal   min3   veredito   nota');
for (const [a, b, nome, nota] of historico) {
  const [p, d, t] = TIPOS.map(k => de(a, b, k)), n = de(a, b, 'none'), pior = Math.min(p, d, t);
  nMedicoes += 4;
  console.log(`${(a + ' ' + b).padEnd(22)}${fmt(p).padStart(8)}${fmt(d).padStart(8)}${fmt(t).padStart(8)}${fmt(n).padStart(9)}${fmt(pior).padStart(7)}   ${vered(pior).padEnd(9)}  ${nome} (${nota})`);
}

// ===========================================================================
// BLOCO 1b — OS PARES DE §1.4 QUE DECIDIRAM "ACAO NAO E AZUL".
// Antes de 2026-08-25 (3ª rev.) estes tres pares estavam PUBLICADOS no documento e
// NAO TINHAM COMANDO. Um numero publicado sem comando nao e medicao: e memoria.
// ===========================================================================
console.log('\nBLOCO 1b — "ACAO NAO E AZUL": os tres pares azul x violeta. NAO gateia (azul foi REJEITADO).');
console.log('par'.padEnd(22) + 'protan'.padStart(8) + 'deutan'.padStart(8) + 'tritan'.padStart(8) + '   min3   publicado antes');
const azuis = [
  ['#1d4ed8', '#6d28d9', '0,4'],
  ['#3b82f6', '#a855f7', '0,8'],
  ['#2a78d6', '#c084fc', '6,3  <= ERRADO, ver DESIGN_SYSTEM §1.4-bis'],
];
for (const [a, b, pub] of azuis) {
  const [p, d, t] = TIPOS.map(k => de(a, b, k));
  nMedicoes += 3;
  console.log(`${(a + ' ' + b).padEnd(22)}${fmt(p).padStart(8)}${fmt(d).padStart(8)}${fmt(t).padStart(8)}${fmt(Math.min(p, d, t)).padStart(7)}   ${pub}`);
}
console.log('  => o numero que CARREGA a decisao (0,3 em deutan) reproduz. Azul e violeta sao');
console.log('     a MESMA COR sob deuteranopia, e a decisao de mover acao para luminancia se mantem.');

// ===========================================================================
// BLOCO 1c — OS CANDIDATOS A `--dado-quebrado-ink`, e por que estes e nao outros.
// Existe porque DESIGN_SYSTEM §1.4-ter publica esta tabela, e a regra que a propria
// secao estabelece e: TODO numero publicado tem de existir dentro deste script.
// NAO GATEIA — e um registro de escolha, com o rejeitado ao lado do adotado.
// ===========================================================================
const hueLab = hex => { const [, a, b] = toLab(hexToRgb(hex)); let d = Math.atan2(b, a) * 180 / Math.PI; return d < 0 ? d + 360 : d; };
const deNormal = (a, b) => ciede2000(toLab(hexToRgb(a)), toLab(hexToRgb(b)));
const CANDIDATOS = {
  claro:  { sup: ['#ffffff', '#f7f8fa', '#eff0f2'], fraca: '#57606a', forte: '#131722',
    lista: [['#6d28d9', 'REVOGADO — tritan 5,3 contra a tinta fraca'],
            ['#581c87', 'ADOTADO — e o candidato do gate; empate tecnico resolvido por verificacao cruzada'],
            ['#5d1a7a', 'rejeitado — +0,4 dE sobre o adotado, sem segunda medicao independente'],
            ['#3b0764', 'rejeitado — ganha cinza contra a tinta fraca e PERDE contra a forte (min3 10,0)']] },
  escuro: { sup: ['#131722', '#0d1017', '#222634'], fraca: '#8b949e', forte: '#e6e9ef',
    lista: [['#c084fc', 'REVOGADO — tritan 14,7 contra a tinta fraca'],
            ['#e0aaff', 'ADOTADO — entrega o degrau de luminancia E fica mais longe do vermelho'],
            ['#e879f9', 'rejeitado — candidato do gate: min3 maior, mas cinza 1,25 (nao entrega P1) e matiz 323 graus'],
            ['#f0abfc', 'rejeitado — bom, mas min3 15,9 e matiz 322 graus'],
            ['#d946ef', 'REJEITADO POR MEDICAO — 12,2 contra o vermelho de baixa: o magenta saturado COLIDE']] },
};
console.log('\nBLOCO 1c — CANDIDATOS a --dado-quebrado-ink. NAO gateia. "cinzaFrc" e razao de LUMINANCIA.');
for (const modo of ['claro', 'escuro']) {
  const C = CANDIDATOS[modo];
  console.log(`\n  modo ${modo.toUpperCase()} — tinta fraca ${C.fraca} · tinta forte ${C.forte}`);
  console.log('  hex      matiz   wctSup  cinzaFrc   min3: fraca  forte   alta  baixa    MIN   dE_vermelho_visao_normal');
  for (const [hex, nota] of C.lista) {
    const wct = Math.min(...C.sup.map(s => contraste(hex, s)));
    const v = [C.fraca, C.forte, '#089981', '#f23645'].map(o => min3(hex, o));
    nMedicoes += 3 + 12 + 2;
    const mn = Math.min(...v);
    const ok = wct >= PISO_TEXTO && mn >= PISO_DICROMACIA;
    console.log(`  ${hex} ${fmt(hueLab(hex), 0).padStart(6)}  ${fmt(wct, 2).padStart(6)}  ${fmt(contraste(hex, C.fraca), 2).padStart(8)}   ` +
      v.map(x => fmt(x).padStart(7)).join('') + fmt(mn).padStart(7) + '   ' + fmt(deNormal(hex, '#f23645')).padStart(5) +
      `   ${ok ? 'ok  ' : 'NAO '} ${nota}`);
  }
}
console.log('\n  => o rejeitado que mais importa e #d946ef: 12,2 contra #f23645 e ABAIXO do piso 15.');
console.log('     "magenta reintroduz vermelho" nao era so semantica — na saturacao alta e ARITMETICA.');
console.log('  => e o adotado no escuro NAO e o de maior min3: e o que tambem move a LUMINANCIA.');
console.log('     #e879f9 tem min3 18,3 mas cinza 1,25 contra a tinta fraca; #e0aaff tem 17,1 e 1,66.');
console.log('     Um par acima do piso de dicromacia que COLAPSA em cinza conserta metade do defeito.');

// ===========================================================================
// BLOCO 2 — SUPERFÍCIES. Antes de 2026-08-25 NÃO EXISTIAM em documento nenhum,
// e sem elas nenhum contraste é verificável: contraste é sempre CONTRA algo.
// REGRA: nenhum fill cromático pode ser desenhado sobre superfície fora deste conjunto.
// ===========================================================================
const SUP = {
  claro:  { base: '#ffffff', chrome: '#f7f8fa', listra: '#eff0f2' },
  escuro: { base: '#131722', chrome: '#0d1017', listra: '#222634' },
};
// `base` e' o fundo do PLOT e do painel — e' onde os fills de direcao vivem.
// `listra` e' o extremo: no claro e' a MAIS ESCURA (pior caso p/ cor escura sobre claro),
//          no escuro e' a MAIS CLARA (pior caso p/ cor clara sobre escuro).
// #131722 e #1e222d..#222634 sao os valores da TradingView: Jakob's Law aplicada a superficie.

// ===========================================================================
// BLOCO 3 — PAPÉIS. 4 papéis, e a VARIANTE faz parte da identidade do token.
// Variante ausente = token que NAO EXISTE = uso impossivel. A ausencia e' a guarda.
// ===========================================================================
const PAPEIS = {
  claro: {
    'direcao-alta-fill':  { hex: '#089981', piso: PISO_GRAFICO, papel: 'direcao' },
    'direcao-baixa-fill': { hex: '#f23645', piso: PISO_GRAFICO, papel: 'direcao' },
    'direcao-on':         { hex: '#131722', piso: null,          papel: 'direcao', sobre: ['#089981', '#f23645'] },
    'dado-quebrado-ink':  { hex: '#581c87', piso: PISO_TEXTO,   papel: 'integridade' },
    'proc-forte':         { hex: '#131722', piso: PISO_TEXTO,   papel: 'procedencia' },
    'proc-fraca':         { hex: '#57606a', piso: PISO_TEXTO,   papel: 'procedencia' },
    'acao-fill':          { hex: '#131722', piso: PISO_GRAFICO, papel: 'acao' },
    'acao-on':            { hex: '#ffffff', piso: null,          papel: 'acao', sobre: ['#131722'] },
    'foco':               { hex: '#131722', piso: PISO_GRAFICO, papel: 'acao' },
  },
  escuro: {
    'direcao-alta-fill':  { hex: '#089981', piso: PISO_GRAFICO, papel: 'direcao' },
    'direcao-baixa-fill': { hex: '#f23645', piso: PISO_GRAFICO, papel: 'direcao' },
    'direcao-on':         { hex: '#131722', piso: null,          papel: 'direcao', sobre: ['#089981', '#f23645'] },
    'dado-quebrado-ink':  { hex: '#e0aaff', piso: PISO_TEXTO,   papel: 'integridade' },
    'proc-forte':         { hex: '#e6e9ef', piso: PISO_TEXTO,   papel: 'procedencia' },
    'proc-fraca':         { hex: '#8b949e', piso: PISO_TEXTO,   papel: 'procedencia' },
    'acao-fill':          { hex: '#333846', piso: null,          papel: 'acao' },  // fill NAO carrega a fronteira
    'acao-borda':         { hex: '#8b949e', piso: PISO_GRAFICO, papel: 'acao' },  // a BORDA carrega a fronteira
    'acao-on':            { hex: '#e6e9ef', piso: null,          papel: 'acao', sobre: ['#333846'] },
    'foco':               { hex: '#8b949e', piso: PISO_GRAFICO, papel: 'acao' },
  },
};
// TOKENS QUE DELIBERADAMENTE NAO EXISTEM, e a ausencia e' a regra:
//   --direcao-alta-text / --direcao-baixa-text   => cor de direcao NUNCA tinge glifo.
//   --dado-quebrado-fill                          => integridade NUNCA preenche area.
//   --dado-quebrado-numeral                       => integridade NUNCA tinge numeral.
//   --severidade-*                                => severidade OPERACIONAL (S1: "coletor PAROU")
//        nao tem token de cor NENHUM. Nao e o mesmo papel que integridade de dado, e nao
//        herda o violeta: a severidade vive em GLIFO + PALAVRA + luminancia. Ver §9 item 6.
// Consequencia: o NUMERAL tem UM UNICO eixo de tinta, o ramp de procedencia, que nao tem hue.

// ===========================================================================
// BLOCO 4 — CONTRASTE de cada token contra as 3 superfícies do SEU modo.
// ===========================================================================
console.log('\nBLOCO 2+4 — CONTRASTE WCAG por modo. piso texto ' + PISO_TEXTO + ':1 (SC 1.4.3) · piso grafico ' + PISO_GRAFICO + ':1 (SC 1.4.11)');
for (const modo of ['claro', 'escuro']) {
  const sup = SUP[modo];
  console.log(`\n  modo ${modo.toUpperCase()} — superficies: base ${sup.base} · chrome ${sup.chrome} · listra ${sup.listra}`);
  console.log('  ' + 'token'.padEnd(22) + 'base'.padStart(10) + 'chrome'.padStart(10) + 'listra'.padStart(10) + '   piso   veredito');
  for (const [nome, t] of Object.entries(PAPEIS[modo])) {
    if (t.piso === null) continue;
    let linha = '  ' + nome.padEnd(22); let pior = Infinity;
    for (const s of [sup.base, sup.chrome, sup.listra]) {
      const c = contraste(t.hex, s); nMedicoes++; pior = Math.min(pior, c);
      linha += fmt(c, 2).padStart(10);
    }
    const ok = pior >= t.piso; if (!ok) houveFalha = true;
    console.log(linha + fmt(t.piso, 1).padStart(7) + '   ' + (ok ? 'PASS' : 'FAIL') + `  (pior ${fmt(pior, 2)})`);
  }
  // tinta SOBRE fill: 1.4.3 exige 4.5:1 do glifo contra o SEU proprio fundo, que aqui e' o fill.
  for (const [nome, t] of Object.entries(PAPEIS[modo])) {
    if (!t.sobre) continue;
    for (const f of t.sobre) {
      const c = contraste(t.hex, f); nMedicoes++;
      const ok = c >= PISO_TEXTO; if (!ok) houveFalha = true;
      console.log(`  ${nome} ${t.hex} SOBRE fill ${f}: ${fmt(c, 2)}  piso ${PISO_TEXTO}  ${ok ? 'PASS' : 'FAIL'}`);
    }
  }
}

// ===========================================================================
// BLOCO 4b — ADJACÊNCIAS DE FRONTEIRA. Contraste entre DOIS TOKENS que são
// desenhados um ENCOSTADO no outro. Este bloco NÃO existia até 2026-08-25 (3ª rev.),
// e é por isso que `--foco` passou: ele foi medido contra SUPERFÍCIE, nunca contra o
// token que ele toca. `--foco` é BYTE-IDÊNTICO a `--acao-borda` no escuro e a
// `--acao-fill` no claro ⇒ contraste 1,00 ⇒ a fronteira NÃO EXISTE.
// RESOLUÇÃO DECLARADA (não é isenção): o anel de foco é DESLOCADO (`outline-offset`),
// e o vão entre o anel e a borda do botão é COR DE SUPERFÍCIE. A fronteira que 1.4.11
// exige passa a ser anel↔vão e borda↔vão, e as DUAS são medidas abaixo.
// É a mesma lógica já declarada para `--acao-fill` 1,32 no escuro: o piso de 1.4.11 recai
// sobre a FRONTEIRA do componente, não obrigatoriamente sobre um par de fills.
// ===========================================================================
console.log('\nBLOCO 4b — ADJACENCIAS DE FRONTEIRA. piso ' + PISO_GRAFICO + ':1 (SC 1.4.11) sobre o VAO.');
const ADJ = [
  { modo: 'escuro', a: 'foco', b: 'acao-borda', vao: ['base', 'chrome', 'listra'],
    nota: 'anel de foco encostado na borda do botao. DESLOCAMENTO OBRIGATORIO' },
  { modo: 'claro',  a: 'foco', b: 'acao-fill',  vao: ['base', 'chrome', 'listra'],
    nota: 'anel de foco encostado no fill do botao. DESLOCAMENTO OBRIGATORIO' },
];
for (const adj of ADJ) {
  const P = PAPEIS[adj.modo], ha = P[adj.a].hex, hb = P[adj.b].hex;
  const direto = contraste(ha, hb); nMedicoes++;
  console.log(`\n  ${adj.modo}: ${adj.a} ${ha} x ${adj.b} ${hb}  DIRETO = ${fmt(direto, 2)}` +
    (direto < PISO_GRAFICO ? '  <= SEM FRONTEIRA. exige vao.' : ''));
  console.log(`    ${adj.nota}`);
  let piorVao = Infinity;
  for (const s of adj.vao) {
    const hs = SUP[adj.modo][s];
    const ca = contraste(ha, hs), cb = contraste(hb, hs); nMedicoes += 2;
    piorVao = Math.min(piorVao, ca, cb);
    console.log(`    vao = sup-${s.padEnd(6)} ${hs}:  anel/vao ${fmt(ca, 2).padStart(6)}   borda/vao ${fmt(cb, 2).padStart(6)}`);
  }
  const ok = piorVao >= PISO_GRAFICO; if (!ok) houveFalha = true;
  console.log(`    => pior vao ${fmt(piorVao, 2)}  piso ${PISO_GRAFICO}  ${ok ? 'PASS' : 'FAIL'}`);
  console.log('    ⚠️ ESTE PASS DEPENDE DE GEOMETRIA, NAO DE COR: se o anel for desenhado');
  console.log('       COLADO na borda (outline-offset: 0), o veredito real e o DIRETO acima.');
}

// ===========================================================================
// BLOCO 5 — DICROMACIA entre papéis. CRÍTICO = os dois podem aparecer no MESMO
// agrupamento visual. INFORMATIVO = nao podem, e a razao esta escrita.
// VEREDITO POR min(protan, deutan, TRITAN).
// ===========================================================================
const CRITICOS = [
  ['direcao-alta-fill', 'direcao-baixa-fill', 'o par que carrega a direcao'],
  ['dado-quebrado-ink', 'direcao-alta-fill',  'losango do selo x corpo de vela no mesmo painel'],
  ['dado-quebrado-ink', 'direcao-baixa-fill', 'idem — era ESTE o par que reprovava antes de 2026-08-25'],
  ['dado-quebrado-ink', 'acao-fill',          'chip quebrado x botao, ambos no cabecalho de painel'],
  ['dado-quebrado-ink', 'proc-fraca',         'palavra QUARENTENA x numeral MODELADO na mesma coluna'],
  ['dado-quebrado-ink', 'proc-forte',         'palavra QUARENTENA x palavra OBSERVADO na mesma coluna'],
  ['proc-forte',        'proc-fraca',         'OBSERVADO x MODELADO na mesma coluna'],
];
const INFORMATIVOS = [
  ['acao-fill', 'direcao-alta-fill',  'botao vive no chrome/cabecalho; vela vive no plot. Nunca no mesmo agrupamento'],
  ['acao-fill', 'direcao-baixa-fill', 'idem'],
  ['proc-fraca', 'direcao-baixa-fill','tinta de numeral x fill de forma. Canais diferentes, nunca adjacentes'],
];
for (const modo of ['claro', 'escuro']) {
  const P = PAPEIS[modo];
  console.log(`\nBLOCO 5 — DICROMACIA, modo ${modo.toUpperCase()}. piso ${PISO_DICROMACIA} (ADOTADO, sem norma). Veredito por min(pro,deu,TRI).`);
  console.log('  ' + 'par'.padEnd(42) + 'protan'.padStart(8) + 'deutan'.padStart(8) + 'tritan'.padStart(8) + 'normal'.padStart(8) + '   min3   veredito');
  for (const [gate, lista] of [[true, CRITICOS], [false, INFORMATIVOS]]) {
    if (!gate) console.log('  --- informativos: NAO gateiam, e a razao de nao gatear esta na nota ---');
    for (const [ka, kb, nota] of lista) {
      if (!P[ka] || !P[kb]) continue;
      const a = P[ka].hex, b = P[kb].hex;
      const [p, d, t] = TIPOS.map(k => de(a, b, k)), n = de(a, b, 'none'), pior = Math.min(p, d, t);
      nMedicoes += 4;
      const v = vered(pior);
      if (gate && v !== 'PASS') houveFalha = true;
      console.log('  ' + `${ka} x ${kb}`.padEnd(42) + fmt(p).padStart(8) + fmt(d).padStart(8) + fmt(t).padStart(8) +
                  fmt(n).padStart(8) + fmt(pior).padStart(7) + '   ' + v + '   ' + nota);
    }
  }
}

// ===========================================================================
// BLOCO 6 — COLAPSO EM ESCALA DE CINZA. Este bloco NAO reprova a cor.
// Ele PROVA que um canal de FORMA e' obrigatorio para a direcao — e prova que
// isso NAO e' um defeito do par verde/vermelho: NENHUM par de hue resolve.
// ===========================================================================
console.log('\nBLOCO 6 — colapso em escala de cinza: razao de LUMINANCIA entre os dois fills de direcao');
const paresCinza = [
  ['#089981', '#f23645', 'verde/vermelho da TradingView — o par ADOTADO'],
  ['#2a78d6', '#eb6834', 'azul/laranja — o par anterior'],
  ['#008300', '#e34948', 'verde/vermelho generico'],
];
let exigeForma = false;
for (const [a, b, nome] of paresCinza) {
  const c = contraste(a, b); nMedicoes++;
  if (c < PISO_CINZA) exigeForma = true;
  console.log(`  ${a} x ${b}  ${fmt(c, 3)}  ${c < PISO_CINZA ? 'COLAPSA' : 'sobrevive'}  ${nome}`);
}
console.log(exigeForma
  ? '  => NENHUM par de hue sobrevive a escala de cinza. Canal de FORMA e OBRIGATORIO para a direcao:\n' +
    '     corpo VAZADO = close > open, corpo CHEIO = close < open, CRUZ = close == open (nao afirma).\n' +
    '     Isto NAO e um custo do verde/vermelho — e do hue.'
  : '  => algum par sobrevive sozinho em escala de cinza.');

// ===========================================================================
// BLOCO 6b — COLAPSO EM CINZA DAS TINTAS DA MESMA COLUNA.
// Bloco NOVO em 2026-08-25 (3ª rev.). NÃO GATEIA (PISO_CINZA_TINTA não tem procedência).
// Existe porque o achado de TRITANOPIA e o de CAPTURA-DE-TELA-EM-CINZA têm a MESMA raiz:
// a tinta de integridade estava na posição MENOS DISTINTIVA da coluna de procedência.
// Sob tritanopia o violeta colapsa para cinza — e o vizinho dele JA ERA cinza.
// ===========================================================================
console.log('\nBLOCO 6b — colapso em cinza das TINTAS da mesma coluna. piso informativo ' + PISO_CINZA_TINTA + ' (NAO gateia)');
for (const modo of ['claro', 'escuro']) {
  const P = PAPEIS[modo];
  const pares = [['dado-quebrado-ink', 'proc-fraca'], ['dado-quebrado-ink', 'proc-forte'], ['proc-forte', 'proc-fraca']];
  console.log(`  modo ${modo.toUpperCase()}:`);
  for (const [ka, kb] of pares) {
    const c = contraste(P[ka].hex, P[kb].hex); nMedicoes++;
    console.log(`    ${(ka + ' x ' + kb).padEnd(40)} ${fmt(c, 3)}  ${c >= PISO_CINZA_TINTA ? 'separa' : 'COLAPSA'}`);
  }
}
console.log('  Historico do que foi TROCADO por causa deste bloco (violeta antigo):');
for (const [a, b, n] of [['#6d28d9', '#57606a', 'CLARO  quebrado REVOGADO x fraca'],
                          ['#c084fc', '#8b949e', 'ESCURO quebrado REVOGADO x fraca']]) {
  const c = contraste(a, b); nMedicoes++;
  console.log(`    ${a} x ${b}  ${fmt(c, 3)}  COLAPSA  ${n}`);
}
console.log('  => a tinta de integridade ganhou um DEGRAU DE LUMINANCIA. Esse degrau e um canal');
console.log('     que sobrevive as TRES dicromacias, ao forced-colors e a captura em cinza — e e');
console.log('     o MESMO conserto que fechou o achado de tritanopia. Um conserto, dois defeitos.');

// ===========================================================================
// BLOCO 7 — CONTAGEM. Corrige a afirmacao "trocar o esquema e trocar 2 tokens".
// ===========================================================================
const nTokens = Object.keys(PAPEIS.claro).length + Object.keys(PAPEIS.escuro).length
              + Object.keys(SUP.claro).length + Object.keys(SUP.escuro).length;
const comHue = ['direcao-alta-fill', 'direcao-baixa-fill', 'dado-quebrado-ink'];
const nHue = new Set();
for (const modo of ['claro', 'escuro']) for (const k of comHue) if (PAPEIS[modo][k]) nHue.add(PAPEIS[modo][k].hex);
console.log('\nBLOCO 7 — CONTAGEM REAL');
console.log(`  tokens de cor declarados (papeis + superficies, 2 modos): ${nTokens}`);
console.log(`  valores que carregam HUE: ${nHue.size}  (${[...nHue].join(' ')})`);
console.log(`  medicoes executadas nesta rodada: ${nMedicoes}`);
console.log('  => "trocar o esquema e trocar 2 tokens" era FALSO. Trocar o esquema e trocar');
console.log(`     ${nHue.size} valores de hue E re-rodar as ${nMedicoes} medicoes deste script.`);
console.log('     Barato em edicao, caro em VALIDACAO. E e a validacao que decide.');

console.log('\n' + (houveFalha
  ? 'VEREDITO: REPROVA.'
  : 'VEREDITO: passa nos criterios que este script cobre, nos DOIS modos, com 4 papeis,\n' +
    '  sob as TRES dicromacias (protan, deutan, tritan).'));
console.log('COBERTURA: dicromacia entre papeis adjacentes por min(pro,deu,tri) (2 modos) + contraste');
console.log('  contra 3 superficies por modo + tinta sobre fill + ADJACENCIA DE FRONTEIRA com vao +');
console.log('  colapso em escala de cinza (fills de direcao E tintas de coluna) + contagem de tokens.');
console.log('NAO COBRE, e continua sendo divida de D5.6:');
console.log('  - forced-colors: active (Windows HCM). ⚠️ A PREMISSA ANTERIOR DESTE ARQUIVO ESTAVA');
console.log('    INVERTIDA PARA O PLOT. Dizia "nenhuma cor deste arquivo sobrevive la". Para o');
console.log('    CHROME (CSS) e verdade. Para o PLOT e o OPOSTO: ADR-003 poe geometria em');
console.log('    lightweight-charts, que desenha em <canvas>; forced-colors sobrescreve cor de CSS');
console.log('    e NAO afeta bitmap de canvas. O resultado em HCM nao e degradacao graciosa — e');
console.log('    HIBRIDO DESCASADO: velas mantem verde/vermelho e todo o chrome ao redor vira cor');
console.log('    de sistema. PIOR que o cenario assumido. Gancho: FR-1 (ADR-003:36) diz que charts');
console.log('    nao faz I/O e recebe tudo como argumento ⇒ PALETA COMO ARGUMENTO permite `web`');
console.log('    passar CanvasText/Canvas. [NAO MEDIDO] e [NAO SEI] se o owner usa Windows/HCM.');
console.log('  - prefers-contrast: more. [NAO MEDIDO]');
console.log('  - o piso 15, FRACAO_WARN 0,45, PISO_CINZA 3,0 e PISO_CINZA_TINTA 1,5 continuam');
console.log('    SEM procedencia normativa. Sao adotados por este arquivo e declarados nele.');
console.log('  - acromatopsia (monocromacia de bastonete): NAO medida como dicromacia. O BLOCO 6');
console.log('    e 6b sao o proxy por luminancia, e e um proxy, nao a simulacao.');
process.exitCode = houveFalha ? 1 : 0;
