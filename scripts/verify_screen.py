#!/usr/bin/env python3
"""verify_screen.py — VERIFICACAO ESTRUTURAL de uma tela gerada pelo Stitch.

Por que este arquivo existe:
  STITCH_CONTEXT.md 8.2 tinha uma tabela de 13 verificacoes em PROSA. Executada contra a saida
  real (Rev. A), TRES delas produziram veredito FALSO:
    #2  regex de MESMA LINHA => 0 numa tela conformante  ..............  FALSO FAIL
    #5  'ffb4ab' => 1 na tela DEFEITUOSA e 1 na CORRIGIDA  ............  CEGA
    #7  nomeia o HEX, nao o PAPEL; conta declaracao como uso  .........  FALSO PASS possivel
  O padrao: das 13, as 9 que eram `grep` NEGATIVO eram robustas; as 4 que exigiam estrutura
  POSITIVA eram existenciais e sem comando. A tabela era forte onde o risco era baixo.

Os tres principios, e cada um vira codigo aqui:
  1. medir USO APLICADO, nunca presenca do literal (o esquema do tema IMPOE `error`);
  2. verificacao estrutural e RELACIONAL e EXAUSTIVA, nunca existencial;
  3. a ABLACAO DE CINZA carrega o peso, porque testa a propriedade que o sistema ALEGA.

Uso:  python3 scripts/verify_screen.py <arquivo.html>
Saida: exit 0 se passa, exit 1 se reprova. `[NAO APLICAVEL]` nao reprova.
"""
import re, sys, pathlib

UP, DOWN, NEUTRO = "089981", "f23645", "8b949e"
REVOGADOS = ["2a78d6", "eb6834", "a8c8ff", "4b91f1", "121315", "16181d", "0d0e10", "2a2e39",
             "93c5fd", "c4b5fd", "99f6e4"]
SUPERFICIES = ["131722", "0d1017", "222634"]

falhas, avisos, na = [], [], []
def reprova(c, m): falhas.append(f"{c}: {m}")
def avisa(c, m):   avisos.append(f"{c}: {m}")
def naplic(c, m):  na.append(f"{c}: {m}")

def split_config(src):
    """separa o bloco tailwind.config (DECLARACAO) do resto (USO APLICADO)."""
    m = re.search(r'tailwind\.config\s*=.*?</script>', src, re.S)
    if not m: return src, ""
    return src[:m.start()] + src[m.end():], m.group(0)

def classificar(corpo, up, down):
    """particiona TODO div que usa hue de direcao em CHEIO / VAZADO / AMBIGUO.
    AMBIGUO > 0 reprova: a particao tem de cobrir o total."""
    cheio, vazado, ambiguo, pintado = [], [], [], []
    for m in re.finditer(r'<(?:div|span|rect|path)[^>]*class="([^"]*)"', corpo):
        c = m.group(1)
        if up not in c and down not in c: continue
        bg   = re.search(r'bg-\[#(?:%s|%s)\]' % (up, down), c)
        bord = re.search(r'border-\[#(?:%s|%s)\]' % (up, down), c)
        trans = 'bg-transparent' in c
        if bg and bord: pintado.append(c)            # bloco solido PINTADO
        elif bord and trans: vazado.append(c)
        elif bg and not bord: cheio.append(c)
        else: ambiguo.append(c)
    return cheio, vazado, ambiguo, pintado

def main(path):
    src = pathlib.Path(path).read_text(encoding="utf-8")
    uso, cfg = split_config(src)
    print(f"arquivo {path}  |  {len(src)} bytes  |  uso aplicado {len(uso)}  |  declaracao {len(cfg)}\n")

    # -- N1..N11  NEGATIVOS: literal proibido, medido no USO APLICADO --
    for hexv in REVOGADOS:
        n = len(re.findall(hexv, uso))
        if n: reprova("N-revogado", f"#{hexv} APLICADO {n}x (declaracao nao conta, uso conta)")
    for tok, rot in [("backdrop-blur","blur/vidro"), ("overflow-y-auto","scroll de painel"),
                     ("notifications","sino"), ("AS AT T","microcopy EN"), (">LIVE<","microcopy EN"),
                     ("Documentation","link de rodape inventado"), ("API Status","link inventado"),
                     ("text-error","severidade tingida"), ("PROD","vocabulario de ambiente")]:
        n = len(re.findall(re.escape(tok), uso))
        if n: reprova("N-proibido", f"{tok!r} APLICADO {n}x  ({rot})")

    # -- P1..P4  PRESERVACOES, derivadas da lista de acertos --
    for tok in ["klines_last", "structure_detection", "taker_buy", "stroke-dasharray", "MAINNET"]:
        if not re.search(re.escape(tok), src): reprova("P-preservacao", f"{tok!r} AUSENTE (regressao)")
    # -- P5  price_source X price_use: RESOLVIDO em 2026-08-28. Ver a TARJA abaixo.
    #
    # TARJA: este bloco dizia
    #   ~~for tok in ["price_use","price_source"]: ... "P1 nunca pudera detectar regressao dele.
    #     [NAO SEI] se 4.1.1 erra"~~
    # As DUAS afirmacoes eram falsas, e o defeito era NESTE arquivo, nao na tela:
    #   - procurava os NOMES DE CAMPO do ADR-007 (`price_use` / `price_source`), que sao
    #     identificadores de esquema e nunca foram copy de interface. Medem 0 nas duas telas
    #     porque nunca deveriam medir 1.
    #   - `4.1.1` NAO erra. Os dois fatos estao na tela, medidos no cabecalho do painel de preco:
    #       candles 15m · BTCUSDT · klines_last · fonte bn-dump · uso: structure_detection
    #     `klines_last` E a fonte de preco; `uso: structure_detection` E o uso.
    #   - e P1 SEMPRE pudera detectar regressao dos dois, porque ja checa os dois literais que
    #     de fato os carregam. A cobertura existia; o cheque redundante e que estava cego.
    # O que sobra e uma ASSIMETRIA DE ROTULO, e ela e observacao, nao reprovacao (ver P5b).
    if re.search(r'klines_last', src) and re.search(r'uso:\s*structure_detection', src):
        print("P5 price_source E price_use: os dois declarados no cabecalho do painel de preco")
    else:
        reprova("P5-preco", "fonte de preco e/ou uso de preco deixaram de ser declarados JUNTOS "
                            "(ADR-007). Medido presente em f233 e em Rev.A")
    # P5b  o `uso` tem rotulo (`uso:`); a FONTE nao tem — `klines_last` entra cru numa
    # sequencia separada por `·`, ao lado de `BTCUSDT` e `fonte bn-dump`. Quem nao sabe que
    # `klines_last` e um endpoint de kline nao le aquele token como "fonte do preco".
    # NAO e reprovacao: nao houve regressao e mexer nisto e mudanca de copy (variavel nova).
    if re.search(r'klines_last', src) and not re.search(r'(fonte|source)\s*:?\s*klines_last', src):
        avisa("P5b-rotulo", "`klines_last` aparece SEM rotulo de fonte enquanto o uso aparece com "
                            "`uso:`. Assimetria de rotulo: candidata a rodada futura, sob gate")

    # -- N12/N13  IDIOMA DO DOCUMENTO: mesma classe de defeito que (j), fora do corpo visivel.
    # Entraram como AVISO em 2026-08-28 e foram PROMOVIDOS A REPROVACAO na mesma rodada,
    # pela condicao pre-registrada: `[NAO SEI]` se estavam sob controle do prompt. Ficou MEDIDO
    # que estao — a Rev. B escreveu `lang="pt-BR"` e o <title> acentuado a pedido, e o diff
    # normalizado contra a Rev. A tem 4 linhas e nenhuma outra. `[NAO SEI]` virou `[MEDIDO]`,
    # entao o cheque virou gate. Se um dia o Stitch passar a sobrescrever `lang` por conta
    # propria, isto reprova sem culpa do design e o remedio e rebaixar de volta, com o comando.
    m_lang = re.search(r'<html[^>]*\blang="([^"]+)"', src)
    if m_lang and not m_lang.group(1).lower().startswith("pt"):
        reprova("N12-lang", f'lang="{m_lang.group(1)}" num documento cujo microcopy e todo pt-BR. '
                            f'SC 3.1.1 (nivel A): leitor de tela pronuncia pt com fonemas de en')
    m_tit = re.search(r'<title>([^<]*)</title>', src)
    if m_tit and re.search(r'\bSymbol\b|\bChart\b|\bPrice\b', m_tit.group(1)):
        reprova("N13-title", f'<title>{m_tit.group(1)}</title> em ingles: e a MESMA classe do '
                             f'desvio (j), num lugar que o §9 nao nomeia porque nao e corpo visivel')

    # -- E1  SUPERFICIES: as tres, e so as tres --
    for sup in SUPERFICIES:
        if not re.search(sup, uso): reprova("E1-superficie", f"#{sup} nao aparece no uso aplicado")

    # -- E2  PARTICAO DOS CORPOS: relacional e exaustiva --
    cheio, vazado, ambiguo, pintado = classificar(uso, UP, DOWN)
    print(f"E2 particao de corpos: CHEIO {len(cheio)} · VAZADO {len(vazado)} · "
          f"AMBIGUO {len(ambiguo)} · PINTADO {len(pintado)}")
    if not cheio:   reprova("E2-particao", "classe CHEIO com count 0")
    if not vazado:  reprova("E2-particao", "classe VAZADO com count 0")
    if ambiguo:     reprova("E2-particao", f"{len(ambiguo)} corpos NAO classificaveis => a particao "
                                           f"nao cobre o total: {ambiguo[:2]}")
    if pintado:     reprova("E2-particao", f"{len(pintado)} 'bloco solido PINTADO' (bg E border do "
                                           f"mesmo direcional) — e vazado fingido")

    # -- E3  CRUZ/DOJI: separa CODIGO de FIXTURE (4a/4b/4c/4d) --
    ramo = re.findall(r'<!--\s*Doji|doji|CRUZ', uso, re.I)
    if not ramo:
        reprova("E3a-terceiro-ramo", "nenhum TERCEIRO RAMO de doji no codigo. Verificavel sem dado: "
                                     "a ausencia do ramo e defeito de DESIGN, nao de fixture")
    else:
        print(f"E3a terceiro ramo presente: {len(ramo)} marcador(es)")
        naplic("E3b-fixture", f"barras com open==close neste fixture: {len(ramo)}. Se 0, o predicado "
                              f"real e |close-open| < tick_size DATADO, e a fracao e [NAO SEI] "
                              f"(SPEC 1.9) => ausencia de dado NAO reprova")
        # E3d: corpo >= 2px numa barra doji e a altura minima proibida entrando por tras
        for m in re.finditer(r'<!--\s*Doji.*?-->(.{0,400})', uso, re.S | re.I):
            for h in re.finditer(r'h-\[(\d+)px\]', m.group(1)):
                if int(h.group(1)) >= 2:
                    reprova("E3d-altura-minima", f"corpo de {h.group(1)}px numa barra doji: afirma "
                                                 f"direcao que o dado nao sustenta")

    # -- E4  ABLACAO DE CINZA: o teste que nao pode ser fingido --
    abl = uso.replace(UP, "808080").replace(DOWN, "808080")
    c2, v2, a2, p2 = classificar(abl, "808080", "808080")
    antes  = sum(1 for x in (cheio, vazado) if x) + (1 if ramo else 0)
    depois = sum(1 for x in (c2, v2) if x) + (1 if ramo else 0)
    print(f"E4 ablacao de cinza: {antes} classes distintas ANTES -> {depois} DEPOIS")
    if depois < 3:
        reprova("E4-ablacao", f"colapsou de {antes} para {depois}: a forma NAO sobrevive sem cor "
                              f"(SC 1.4.1 reprova sozinho)")

    # -- E5  INTEGRIDADE: PAPEL, nao hex. Os tres canais, e a ORDEM importa --
    glifo   = len(re.findall(r'rotate-45|diamond|losango', uso, re.I))
    palavra = len(re.findall(r'QUARENTENA|sem procedencia|idade \?', uso))
    # qualquer violeta: o tema pode pintar #e0aaff OU um derivado (#e5b5ff mede 2,2 => mesma cor)
    violeta = [h for h in re.findall(r'#([0-9a-fA-F]{6})', uso)
               if h.lower() in ("e0aaff", "e5b5ff", "d9a4f8", "c084fc", "f4d9ff")]
    print(f"E5 integridade: glifo {glifo} · palavra {palavra} · violeta(por papel) {len(violeta)}")
    if glifo == 0:   reprova("E5-glifo", "losango vazado AUSENTE. A cor e o TERCEIRO canal, nunca o primeiro")
    if palavra == 0: reprova("E5-palavra", "nenhuma palavra de integridade (QUARENTENA / 'idade ?')")
    if violeta and glifo == 0:
        reprova("E5-ordem", "violeta APLICADO sem glifo: e a violacao exata que a regra existe para impedir")
    fora = set(h.lower() for h in violeta) - {"e0aaff"}
    if fora:
        reprova("E5-hex", f"violeta APLICADO fora do valor governado: {sorted(fora)} "
                          f"(#e5b5ff mede 2,2 contra #e0aaff => e a MESMA cor, vinda por derivacao)")

    # -- E6  IDADE: contagem e posicao, nao presenca --
    n_idade = len(re.findall(r'\bidade\b', uso, re.I))
    print(f"E6 carimbo de idade: {n_idade}")
    if n_idade == 0: reprova("E6-idade", "campo IDADE ausente: o selo tem 4 campos, nao 3")
    if n_idade > 1:  reprova("E6-idade", f"{n_idade} carimbos. D3/item 10: um grafico de 3 dias tem ZERO; "
                                          f"so a BORDA DIREITA DO TEMPO carrega um")

    # -- E7  numeral: monoespacada + tabular --
    if not re.search(r'tabular-nums', src): reprova("E7-numeral", "font-variant-numeric: tabular-nums ausente")
    if re.search(r'Public Sans', src):      reprova("E7-numeral", "Public Sans em numeral: item 13 exige MONOESPACADA")

    print()
    for r in avisos: print("AVISO       ", r)
    for r in na:     print("[NAO APLIC.]", r)
    for r in falhas: print("REPROVA     ", r)
    print(f"\n{'REPROVADO' if falhas else 'APROVADO'}  ({len(falhas)} reprovacoes, "
          f"{len(avisos)} avisos, {len(na)} nao-aplicaveis)")
    return 1 if falhas else 0

if __name__ == "__main__":
    if len(sys.argv) != 2: print(__doc__); sys.exit(2)
    sys.exit(main(sys.argv[1]))
