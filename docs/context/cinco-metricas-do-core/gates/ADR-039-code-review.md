# Code-review — `ADR-039` / `as_of_batch` · **COMPLIANT**

**Data:** 2026-09-16 · **Auditor:** `harness-plugin:reviewer` (read-only) · **Persistido pelo:** loop principal

⚠️ **Por que este arquivo foi escrito pelo orquestrador:** o `reviewer` é read-only **por desenho** —
não tem ferramenta de escrita e não grava `gate-record`. O conteúdo é dele; a transcrição é minha.

## Veredito

**`COMPLIANT`** — **0** de **8** regras bloqueantes violadas.
Denominador: `harness rules list --severity block` = 8; todas avaliadas nos 4 arquivos de
`git diff master...` via `harness rules --mode file`. O único `[AVISO]`
(`core.module-docstring-single-line`, `series_history.py:1`) é **pré-existente em master, idêntico**.
`make verify` → 8 portões verdes, `2.498 passed`, cobertura `96,67%`. `git status` limpo ao fim;
acessor byte-idêntico ao pré-mutação.

## Contrato honrado — verificado, não argumentado

| item | como foi verificado |
|---|---|
| **`C2`** | `as_of` intacta, **não** é `as_of_batch(t)[0]`; conjunção única em `_admits`, chamada pelas **duas** portas. ⛔ **E não é código morto:** `46` testes a exercitam por `test_as_of_accessor.py:145` |
| **`D4`** | pós-filtros em `_reading_for`, sem curto-circuito |
| **`D5`** | `grep 'ORDER BY' postgres_series_window_reader.py` → `rc=1` |
| **`D6`** | guarda de solda `q`/`nq` continua em `_admits`; o caller **não** pré-filtra |
| **`DoD-1`** | plantou terceira pública `-> list[AsOfReading]` ⇒ `test_exactly_one_public_callable…` **FALHOU** (revertido) |
| **diferencial** | 3 mutações, todas mordem: `cursor < t` (1 fail), `activation = bucket_end` (7), sem `sort` (3) |
| **anti-vacuidade** | `checked = 131.901` comparações; `with_value` `226/231` e `111/111` contra pisos `115`/`55` |
| **idioma** | sem dívida — o português acrescentado é só rótulo `[MEDIDO …]` e citação literal do `ADR-039` |

## Os achados, e o que foi feito com cada um

### ⛔ `[WARNING-1]` — `max(latest_bucket_end, bucket_end)` sem falsificador · **CORRIGIDO**

`as_of_accessor.py:648-650`. O auditor mutou para `return bucket_end` e **a suíte inteira ficou
VERDE**. Provou que é **divergência real, não equivalência**: com um bucket antigo ativando DEPOIS de
um mais novo, `as_of` responde `9.0`/`9.0` e o lote mutado `9.0`/**`1.0`** — **valor velho desenhado
como atual**, que é exatamente o defeito de tela que esta feature existe para impedir.

**Conserto (orquestrador, 2026-09-16), com o ciclo completo:**
`_older_bucket_activating_last()` + `test_falsifier_the_latest_bucket_end_must_never_move_backwards`.

```
mutacao `return bucket_end`  ANTES do falsificador  -> 64 passed   (VERDE: buraco confirmado)
mesma mutacao  DEPOIS do falsificador               ->  1 failed   (MORDE)
                                                        value '1.00000000' != '9.00000000',
                                                        bucket_end andando para tras
sem mutacao                                         -> 65 passed   (CALA)
git diff do arquivo de producao                     -> VAZIO
```

⚠️ A entrada sintética é **rotulada**, identidade real (chave de OI do catálogo piloto), **só o
timing é fabricado** — mesmo contrato do par de `D3`.

### ⛔ `[WARNING-2]` — o gatilho de `D3` não podia disparar · **CORRIGIDO**

`test_no_backwards_revision_in_md_series_today_can_move_a_reading` declarava *"THIS TEST IS THE
TRIPWIRE. The day a revision lands inside its own bucket's ownership window, this assertion fails"*
— **falso**: ele assere sobre `_observations()`, a fatia **congelada por md5**, não sobre
`md.series`. Bytes congelados não adquirem forma nova ⇒ no dia em que a forma aparecer em produção,
a asserção **continua passando**. É o `rc=0` do `ADR-012` que o parágrafo vizinho denuncia.

**Conserto:** o docstring passa a dizer o que o teste **é** — um **pin** sobre a fatia congelada, com
gatilho **manual, do dono do re-export**, e o `SELECT` a ser re-rodado à mão contra `md.series`
(somente leitura) antes de voltar a confiar no falsificador sintético de `D3`.

### ⛔ `[WARNING-3]` — números contraditórios no registro do portão · **CORRIGIDO**

O bloco `DECLARED_PRODUCERS`/`C3` dizia *"1.282 real rows"*, *"5 of the 748"*, *"53 … buckets"*
contra o que o diferencial **assere**: `571` linhas, `len(early) == 2`, `re_minimised == 23`.
Viola `CLAUDE.md` §*"Nenhum número sem o comando que o produziu"*. Substituídos pelos asseridos,
com o endereço de cada asserção e a nota de que `D3` é carregado mas **não observável** na leitura.

### `[INFO]` — aceitos, registrados, não consertados

1. **Ramo `_absence_for_empty` do lote nunca comparado** — ambos os casos usam
   `first_capture_at=None`; mutação para `Absence.NO_POINT` constante sobrevive. **Sem exposição
   hoje** (`series_history.py:217` fixa `None`), e o auditor sondou com `first_capture_at` setado:
   as duas portas concordam (`SEM_FONTE`). É **cegueira do portão, não defeito**.
2. `_absorb` com `<=` no desempate sobrevive (só alcançável com chave completa duplicada).
3. `_activation_instant` é calculado **2×** por linha em `_activated_in_order:601-608`.

## O que este review NÃO afirma

1. **Não afirma que `as_of` está exercitada em produção** — ela ficou **sem chamador de produção**
   (é `C2` funcionando). O único instrumento que impede as duas portas de divergirem é o
   diferencial, e é por isso que os 3 `[WARNING]` acima eram sobre ele.
2. **Não afirma que `D3` está provado em dado real** — `0` de `5.624` na leitura; o falsificador é
   sintético rotulado, com gatilho manual (`WARNING-2`).
