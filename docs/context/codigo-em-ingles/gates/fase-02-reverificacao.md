# Fase 02 · RE-VERIFICAÇÃO do `NEEDS_FIX` — `codigo-em-ingles`

`[MEDIDO 2026-08-29 em e718fb3, worktree /tmp/claude-1002/wt/gates, branch chore/gates-01-03-codigo-em-ingles]`

**Escopo:** re-verificar as **três erratas** que o `/tech-lead` emendou depois do `NEEDS_FIX` de
`gates/fases-01-03-retroativo.md` §3.1/§3.2. **Não é auditoria nova:** `CA-F2-1`, `CA-F2-5`,
`CA-F2-6` e `CA-F2-7` já tinham veredito `OK` naquele relatório e não foram reabertos.
Fases `01` e `03` já estão no ledger (`gates.jsonl`: `01 QA APPROVED`, `03 QA APPROVED`).

## 1. ERRATA 2 — `CA-F2-2` metade (b): `55` → `54`, e a causa é o **mapa**

Reproduzido com o **mesmo universo `ast`** (`Name(Store)` + `arg` + `Function/AsyncFunction/ClassDef`),
carregando o mapa **do próprio verificador versionado** (`MAP_F1`/`MAP_F2`), não de transcrição:

```
backend/.venv/bin/python <script de prova de conjunto>   # scratchpad, universo idêntico ao do /tech-lead
== test_infrastructure_durability.py
   |ANTES|=15  |imagem(ANTES)|=15  |DEPOIS|=15
   imagem(ANTES)-DEPOIS=[]   DEPOIS-imagem(ANTES)=[]   colisoes={}
== test_resumable_etl_backlog.py
   |ANTES|=55  |imagem(ANTES)|=54  |DEPOIS|=54
   imagem(ANTES)-DEPOIS=[]   DEPOIS-imagem(ANTES)=[]
   colisoes={'process': ['process', 'processo']}
```

**A colisão é exatamente a declarada** — `{processo, process} → process`, **uma única**, e `55 − 1 = 54`.
As duas diferenças de conjunto são **vazias nos dois arquivos**, que é a forma forte: não é contagem
que bate por acaso, é **igualdade de imagem**. O `55` do DoD anterior era, de fato, **insatisfazível sem
contrariar `SPEC-002` §3.1** — um DoD sobre mapa não-injetivo reprova um builder correto. **`OK`.**

## 2. ERRATA 3 — `CA-F2-2` metade (a): fora o `startswith`, entra a lista fechada dos **40**

```
|PT40| = 40 | nao-test_: 26 | test_: 14
test_infrastructure_durability.py: em_PT40=0 []  | predicado_ANTIGO(com startswith)=2
test_resumable_etl_backlog.py:     em_PT40=0 []  | predicado_ANTIGO(com startswith)=12
```

A lista fechada tem **26 + 14 = 40**, conferida por construção contra `MAP_F1 ∪ MAP_F2`. O
**predicado antigo** (`x in PT or x.startswith("test_")`) devolve **2 e 12** sobre a árvore
**renomeada** — e `2` e `12` são **o número de funções de teste de cada arquivo**, isto é, o predicado
casava os nomes **NOVOS**: só zeraria apagando a suíte. Confirmado. Com a lista fechada, **`em_PT40 = 0`
nos dois**. **`OK`.**

## 3. ERRATA 1 + `CA-F2-3'` — o falsificador, re-rodado por mim, 3 mutações

`backend/.venv/bin/python docs/context/codigo-em-ingles/gates/CA-F2-3-linha-verificador.py`,
com `git checkout --` e `git status --porcelain -- backend` **vazio conferido entre cada mutação**:

| caso | mutação | ÓRFÃS | `rc` | publicado |
|---|---|---|---|---|
| CALA | árvore como entregue | `ORFAS=0  ENUMERADAS_AUSENTES=0` | `0` | bate |
| M1 | apagar `assert leftovers == [], f"…"` (`:51`) | **12** | `1` | bate |
| M2 | apagar a **docstring** de `test_a_missing_or_empty_checkpoint_returns_the_whole_window` (`:244`) | **1** (`[delete] STRING '"""Return no entry…'`) | `1` | **ver §3.1** |
| M2′ | apagar a **linha `:243`** (a assinatura `def …`) | **10** | `1` | bate com o `10` |
| M3 | apagar `# noqa: S603 - argv literal, sem shell` (`:171`) | **1** (`[delete] COMMENT`) | `1` | bate |

**MORDE 3 de 3** (contra `0 de 3` do `CA-F2-3` publicado antes da errata), e o lado **CALA** é `rc=0` na
árvore como entregue — um falsificador que morde em tudo não mede nada. **M3 continua sendo o caso que
escapa de `test.sh` E de `lint.sh`**, e é o único dos três que nenhum outro critério pega.

### 3.1 ⚠️ `[aviso]` — a errata **rotula** M2 como *"a docstring"* e **publica o número da linha `:243`**

`:243` **é a assinatura `def …`**, não a docstring; a docstring é `:244`. Apagar uma docstring produz
**um único token `STRING`** — nunca `10`. O `10` é **exatamente** o número de tokens da assinatura
(`def`, nome, `(`, `tmp_path`, `:`, `Path`, `)`, `->`, `None`, `:`), e eu o reproduzi em M2′.

**Isto NÃO altera nenhum veredito:** o critério **MORDE nas duas leituras** (`rc=1` em ambas), e a
leitura *docstring* é a mais forte das duas (apagar docstring escapa de `test` e é pega só por `lint`;
apagar o `def` quebra a coleta). É **defeito de rótulo em prosa**, não de instrumento.
**Dívida documental, dono `/tech-lead`:** o `ref` de `CA-F2-3'` no `tasks.toml` deve dizer
*"apagar a assinatura `:243` → 10 órfãs"* **ou** *"apagar a docstring `:244` → 1 órfã"*, e hoje diz uma
frase que mistura as duas. `[MEDIDO 2026-08-29 em e718fb3, n=4 mutações]`

## 4. Os demais critérios da fase — re-medidos, não herdados

```
make verify                    # HARNESS_MECHANISM exportado para dentro do make
[OK] lint-backend  rc=0  56 source files
[OK] lint-frontend rc=0
[OK] test          rc=0  386 passed · Total coverage: 99.24%
[OK] boundaries    rc=0  3 kept, 0 broken
[OK] regras        rc=0  0 bloqueio(s), 1 aviso(s)      # web-fullstack.browser-test-file-present, DECLARADO em "NAO FAZ"
[OK] política      rc=0
veredito: VERDE — 6 portões mediram e passaram
```

`CA-F2-3` **após a ERRATA 1 é linha de base de suíte e só isso**: `rc=0`, e **não** `rc=3` ("recusou
medir"). Cumprido. As 7 regras bloqueantes de `harness rules list --severity block` foram avaliadas
pelo portão `regras` do `verify` (`--mode sweep`): **0 bloqueio**.

`CA-F2-4`, re-medido em **linhas** e nos três revs:

| token | `c7df90c` (ANTES) | `2cd4ddd` (DEPOIS) | `e718fb3` (hoje) |
|---|---|---|---|
| `test_durabilidade_da_infra` | **4** | **0** | **0** |
| `test_etl_backlog_retomavel` | **3** | **0** | **0** |

(escopo `harness.toml README.md backend/README.md frontend/README.md backend/src backend/tests frontend/src`;
`n > 0` ANTES satisfaz `RN-8` e bate com o piso de sanidade do plano, `4` e `3`.)

**Observação, não FAIL:** a `EMENDA 2` do DoD lista **`docs/context`** no escopo, e com ele os dois tokens
medem **15** e **16** linhas hoje — em `docs/context/codigo-em-ingles/{gates/CA-F2-3-linha-verificador.py,
gates/T-02.1-build.md, gates/T-02.1-qa.md, tasks.toml, tasks_review.md}`. **Já eram 13 e 13 no próprio
merge da fase (`2cd4ddd`)**, e o `/qa` retroativo já havia dado `OK` a `CA-F2-4` pelo escopo de código.
São **as citações que a própria prova do rename precisa fazer** — `PAIRS` do verificador **é** o mapa
antigo→novo; um relatório de gate que não pudesse nomear o caminho antigo não poderia provar nada.
Não é citação VIVA no sentido de `RN-1` (nenhuma instrui trabalho corrente sobre um caminho morto).

`CA-F2-9`: os 4 eventos em português **intactos** — `grep -rqF` `rc=0` para `etl_item_publicado`,
`etl_item_concluido`, `etl_drenagem_concluida`, `checkpoint_cauda_truncada`.

## 5. A dívida `master` → `origin/master` **não impede** o `APPROVED` da 02

`tasks_review.md` §13.3 declara que a ação 4 do `/qa` **não foi aplicada**. Ela **não bloqueia**, e a
razão é medida, não estilística:

1. **Nenhuma evidência desta re-verificação depende dela.** Tudo que eu medi usa **range explícito**
   (`c7df90c..2cd4ddd`) ou comando absoluto. `CA-F2-7` pelo range explícito → **0 linhas**.
2. **Neste rev os dois refs são o mesmo objeto:** `git rev-parse master origin/master` → `c2e13e3` nos
   dois; `git diff --numstat master... -- docs/INDEX.md docs/adr docs/plans docs/specs` e a variante
   `origin/master...` devolvem **a mesma linha** (`1 0 docs/INDEX.md`, que é o *append* desta branch de
   gates — append-only respeitado, `1 +` / `0 −`). O defeito é **latente**, não ativo.
3. **É herdada pelas três fases**, e `01`/`03` **já estão no ledger**. Corrigir só o DoD da `02` criaria
   **três redações do mesmo instrumento**. Continua **dívida aberta declarada, dono `/tech-lead`** — e
   ela é da classe que `ADR-012` nomeia: com ref local atrasado, `rc=0` deixa de distinguir *"nada
   divergiu"* de *"o instrumento comparou com a base errada"*.

## 6. Fora de escopo, e permanece assim

O **10º evento de log em português** (`probe_bucket_coupling.py:75`, vindo de `207c817`/`plataforma-dados`)
e o **risco de contaminação da regra de classificação** (`tasks_review.md` §14 e §14.1) continuam
`⏸ NÃO DECIDIDO`, dono **owner / `/architect`**. Não bloqueiam: `CA-F2-9` mede os **4 eventos da fase 02
intactos**, e isso é verdade medida acima.

## 7. Veredito

```
## QA Gate — Fase 02 [sentimento, docs] · RE-VERIFICAÇÃO
- [OK] 7/7 regras bloqueantes — make verify · portão `regras` (sweep): 0 bloqueio(s), 1 aviso(s), rc=0
- [OK] Testes existem e passam — make verify · test rc=0 (386 passed)
- [OK] Cobertura 99,24% total; pisos por camada verdes (check-coverage-layers, dentro do test rc=0)
- [OK] ERRATA 2 — 15 e 54, colisão {processo, process}→process reproduzida, difs de conjunto vazias
- [OK] ERRATA 3 — em_PT40 = 0 nos dois; predicado antigo = 2 e 12 (= nº de funções de teste)
- [OK] CA-F2-3' — CALA rc=0 (ORFAS=0); MORDE 3/3 (M1=12, M2=1 STRING, M3=1 COMMENT), rc=1 em todas
- [OK] DoD restante — CA-F2-4 (4/3 → 0/0), CA-F2-9 (4 eventos intactos), CA-F2-3 (rc=0, não rc=3)
- [aviso] rótulo de M2 no tasks.toml mistura ":243"(=def, 10 órfãs) com "docstring"(=:244, 1 órfã)
- [sem anomalia] nenhuma checagem deixou de produzir veredito
Regras bloqueantes avaliadas: 7 de 7 listadas por `harness rules list --severity block`
Veredito: APPROVED
```
