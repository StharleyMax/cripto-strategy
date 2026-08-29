#!/usr/bin/env python3
"""CA-F2-3' -- o falsificador da fase 02, e ele MORDE onde CA-F2-3 calava.

FORMA: igualdade, nunca contagem (`SPEC-002` 4.1). O fluxo de tokens do arquivo NOVO
tem de ser igual ao do ANTIGO com o mapa FECHADO de `SPEC-002` 3.1 aplicado, e toda
divergencia restante tem de estar ENUMERADA em `ENUMERADAS` / `TRUNC`. Apagar um token
CRIA divergencia -- por isso o criterio nao se satisfaz apagando nada, que e exatamente
o que `CA-F2-3` (`--cov=src`, cego a `backend/tests` por construcao) nao conseguia.

COMMENT NAO E DESCARTADO de proposito: e o unico token que pega a remocao de um
`# noqa`, o caso M3, que escapa de `test.sh` E de `lint.sh`.

USO (da raiz do repositorio):
    backend/.venv/bin/python docs/context/codigo-em-ingles/gates/CA-F2-3-linha-verificador.py
    rc=0 -> CALA (nenhuma divergencia orfa, e as enumeradas estao todas presentes)
    rc=1 -> MORDE (ha divergencia fora do mapa e fora da lista fechada)

PLACAR [MEDIDO 2026-08-29 em 75026ff, n=3 mutacoes, arvore restaurada entre cada uma]:
    arvore como entregue        -> ORFAS=0                                    rc=0
    M1 apagar assercao  :51     -> ORFAS=12                                   rc=1
    M2 apagar docstring :243    -> ORFAS=10                                   rc=1
    M3 apagar noqa      :171    -> ORFAS=1  ([delete] COMMENT '# noqa: S603')  rc=1
"""
import io, re, subprocess, sys, tokenize, difflib

BASE = "c7df90c"
PAIRS = [
    ("backend/tests/sentimento/test_durabilidade_da_infra.py",
     "backend/tests/sentimento/test_infrastructure_durability.py"),
    ("backend/tests/sentimento/test_etl_backlog_retomavel.py",
     "backend/tests/sentimento/test_resumable_etl_backlog.py"),
]
MAP_F1 = {
    "chamadas": "calls", "destino": "destination", "espia": "spy", "parcial": "partial",
    "visto": "seen",
    "test_checkpoint_faz_fsync_e_a_linha_ja_esta_no_arquivo_quando_ele_ocorre":
        "test_checkpoint_fsyncs_and_the_line_is_already_in_the_file_when_it_happens",
    "test_worker_faz_fsync_no_parcial_antes_do_rename_atomico":
        "test_worker_fsyncs_the_partial_before_the_atomic_rename",
}
MAP_F2 = {
    "CheckpointVolatil": "VolatileCheckpoint", "ContadorDeTrabalho": "WorkCounter",
    "UNIVERSO": "UNIVERSE", "_conferir_saida_integra": "_assert_output_intact",
    "_semear": "_seed", "alvo": "target", "ambiente": "env", "ausente": "missing",
    "contador": "counter", "esperado": "expected", "limite": "limit",
    "mortos_com": "killed_at", "processados": "processed", "processo": "process",
    "publicados": "published", "quantos": "how_many", "reinicio": "restart",
    "residuos": "leftovers", "retomada": "resumed", "so_linha_em_branco": "blank_line_only",
    "vazio_path": "empty_path",
    "test_cauda_truncada_e_descartada_e_o_resto_sobrevive":
        "test_a_truncated_tail_is_discarded_and_the_rest_survives",
    "test_checkpoint_ausente_ou_vazio_devolve_janela_inteira":
        "test_a_missing_or_empty_checkpoint_returns_the_whole_window",
    "test_checkpoint_fora_da_janela_e_erro_e_nao_ruido":
        "test_a_checkpoint_outside_the_window_is_an_error_not_noise",
    "test_checkpoint_volatil_reprocessa_a_janela_inteira":
        "test_a_volatile_checkpoint_reprocesses_the_whole_window",
    "test_drenagem_completa_processa_cada_arquivo_uma_unica_vez":
        "test_a_complete_drain_processes_each_file_exactly_once",
    "test_janela_declarada_recusa_chave_repetida":
        "test_a_declared_window_refuses_a_repeated_key",
    "test_janela_declarada_recusa_chave_vazia":
        "test_a_declared_window_refuses_an_empty_key",
    "test_linha_completa_ilegivel_e_corrupcao_e_nao_e_tolerada":
        "test_an_unreadable_complete_line_is_corruption_and_is_not_tolerated",
    "test_matar_o_processo_no_meio_e_retomar_nao_duplica_nem_perde":
        "test_killing_the_process_midway_and_resuming_neither_duplicates_nor_loses",
    "test_pendente_preserva_a_ordem_declarada":
        "test_pending_preserves_the_declared_order",
    "test_reprocessar_o_mesmo_item_nao_muda_o_resultado_nem_deixa_parcial":
        "test_reprocessing_the_same_item_changes_nothing_and_leaves_no_partial",
    "test_segunda_drenagem_sem_falha_nao_refaz_nada":
        "test_a_second_drain_without_failure_redoes_nothing",
}
FULL = {**MAP_F1, **MAP_F2}
# extensao de atributo declarada pelo builder (build §11), aceita pelo /qa (T-02.1-qa §7)
ATTR = {"_alvo": "_target"}
# o mapa de ARQUIVO da mesma tabela — citacao de caminho dentro de docstring
FILEMAP = {
    "test_durabilidade_da_infra.py": "test_infrastructure_durability.py",
    "test_etl_backlog_retomavel.py": "test_resumable_etl_backlog.py",
}
# CITACAO TRUNCADA por reticencias — a MESMA tabela, citada por prefixo dentro de uma
# docstring. Entrada ENUMERADA, nao heuristica de prefixo: `SPEC-002` 3.1, linha
# `test_reprocessar_o_mesmo_item_nao_muda_o_resultado_nem_deixa_parcial`.
TRUNC = {"test_reprocessar_o_mesmo_item_...": "test_reprocessing_the_same_item_..."}
NAMEMAP = {**FULL, **ATTR}
TEXTMAP = {**FULL, **ATTR, **FILEMAP, **TRUNC}
SKIP = {tokenize.NEWLINE, tokenize.NL, tokenize.INDENT, tokenize.DEDENT,
        tokenize.ENCODING, tokenize.ENDMARKER}
# EXCECAO ENUMERADA, lista fechada: (arquivo, tag, tipo, texto)
ENUMERADAS = [
    ("backend/tests/sentimento/test_resumable_etl_backlog.py", "insert", "OP", ","),
]
_RX = re.compile("|".join(sorted((re.escape(k) for k in TEXTMAP), key=len, reverse=True)))

def toks(src):
    return [(tokenize.tok_name[t.type], t.string)
            for t in tokenize.generate_tokens(io.StringIO(src).readline)
            if t.type not in SKIP]

def sub_text(s):
    return _RX.sub(lambda m: TEXTMAP[m.group(0)], s)

def orfas(path, old_src, new_src):
    a = [(k, NAMEMAP.get(s, s) if k == "NAME" else s) for k, s in toks(old_src)]
    b = toks(new_src)
    out = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes():
        if tag == "equal":
            continue
        old, new = a[i1:i2], b[j1:j2]
        # CLASSE DECLARADA 1: citacao de identificador/caminho renomeado DENTRO de literal.
        # O bloco so e explicado se o mapa FECHADO, aplicado como TEXTO, reproduz o lado novo
        # token a token. Apagar qualquer coisa quebra a igualdade e a divergencia fica ORFA.
        if old and new and [(k, sub_text(s)) for k, s in old] == new:
            continue
        for k, s in old:
            out.append((path, "delete", k, s))
        for k, s in new:
            out.append((path, "insert", k, s))
    return out

def main():
    todas = []
    for old, new in PAIRS:
        old_src = subprocess.run(["git", "show", f"{BASE}:{old}"],
                                 capture_output=True, text=True, check=True).stdout
        o = orfas(new, old_src, open(new, encoding="utf-8").read())
        todas += o
        print(f"{new}: {len(o)} divergencia(s) nao explicada(s) pelo mapa")
    resto = [x for x in todas if x not in ENUMERADAS]
    faltando = [x for x in ENUMERADAS if x not in todas]
    for x in resto:
        print(f"    ORFA     [{x[1]}] {x[2]} {x[3][:74]!r}  ({x[0].split('/')[-1]})")
    for x in faltando:
        print(f"    FALTANDO [{x[1]}] {x[2]} {x[3][:74]!r}")
    print(f"ORFAS={len(resto)}  ENUMERADAS_AUSENTES={len(faltando)}")
    return len(resto) + len(faltando)

if __name__ == "__main__":
    sys.exit(0 if main() == 0 else 1)
