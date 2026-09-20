# `/review` — fase `01` de `candle-real-e-eixo-unico` (PR #227, `wave/candle-f01`)

**Veredito: COMPLIANT** — nenhuma das 8 regras bloqueantes em vigor foi violada.
Data: 2026-09-20 · Revisor: `/review` (read-only) · Base: `origin/master...wave/candle-f01`

⚠️ **COMPLIANT é sobre a régua mecânica, e o denominador está abaixo.** Os 4 `WARNING` são
convenção e governança — nenhum deles é regra bloqueante, e por isso nenhum vira o veredito.
**Mas o `WARNING-3` impede fechar a fase**: o ledger não registra o que o documento afirma.

---

## O denominador — sem ele um veredito não é medição

| o quê | quanto | o comando |
|---|---|---|
| regras bloqueantes em vigor | **8** | `harness rules list --severity block` |
| regras avaliadas | **8 de 8** (varredura avalia o conjunto todo) | `harness rules --mode sweep` |
| arquivos do diff | **80** | `git diff --stat origin/master...wave/candle-f01` |
| destes, **código** por `code_paths` | **33** | `harness policy --key code_paths` + filtro de prefixo/glob |
| arquivos varridos um a um | **33 de 33** | `harness rules --mode file --path <f>`, em laço |
| commits | **38** | `git rev-list --count origin/master..wave/candle-f01` |

### Camada 1 — o que o runner mede

```
harness rules --mode sweep        # 73 achados no repositorio inteiro, 0 BLOQUEIO
```

Dos **33** arquivos de código deste diff, **2** carregam achado, ambos `[AVISO]`
`core.module-docstring-single-line`:

- `backend/src/modules/sentimento/use_cases/collector_series_mapping.py:1`
- `backend/src/modules/sentimento/use_cases/series_catalog.py:1`

**Os dois já estavam assim em `master`** — logo esta fase introduziu **zero** achado novo:

```
git show origin/master:backend/src/modules/sentimento/use_cases/series_catalog.py | head -3
# -> a MESMA docstring de multiplas linhas
```

#### O controle positivo — porque `rc=0` com saída vazia é ambíguo (`ADR-012`)

`harness rules --mode file` devolveu **vazio com `rc=0`** para 31 dos 33 arquivos. Isso é
indistinguível entre *"nada violou"* e *"o instrumento não mede"* até que se prove que ele morde:

```
harness rules --mode file --path backend/src/modules/sentimento/use_cases/series_catalog.py
# -> {"decision": "block", "reason": "[AVISO] [core.module-docstring-single-line] ..."}   rc=2
```

Ele morde. **O silêncio sobre os outros 31 é silêncio real.**

### O portão do repositório, rodado inteiro

```
make verify
[OK] lint-backend    rc=0  461 source files
[OK] lint-frontend   rc=0  ESLint + tsc --noEmit --strict
[OK] test-frontend   rc=0  757 pass, 0 fail em 4 suites
[OK] test            rc=0  2623 passed · Total coverage: 96.33%
[OK] boundaries      rc=0  7 kept, 0 broken
[OK] regras          rc=0  0 bloqueio(s), 73 aviso(s)
[OK] política        rc=0
```

`boundaries — 7 kept, 0 broken` é a camada arquitetural medida por máquina, e ela está intacta.

---

## Camada 2 — o que só a arquitetura declarada diz

### 1 · `ADR-027/D1` — o backfill é one-shot de verdade ✅

`ADR-027/D1` declara **exatamente três processos de vida longa** e diz, literal, que os
utilitários *"NUNCA viram container de vida longa"*. Três provas independentes:

**(a) `deploy/compose.yml` não ganhou serviço nenhum.** 12 blocos antes, 12 depois
(7 serviços + 5 volumes):

```
git show origin/master:deploy/compose.yml | grep -cE '^  [a-z][a-z0-9_-]*:$'   # 12
grep -cE '^  [a-z][a-z0-9_-]*:$' deploy/compose.yml                            # 12
```

As **+29 linhas são comentário**, e o comentário **recusa** o bloco de serviço por escrito
(`deploy/compose.yml:250-252`): *"⛔ NAO declare isso como `service:` deste arquivo … vira o
quarto processo de vida longa que `ADR-027/D1` recusa."*

**(b) O entrypoint sai.** `klines_backfill_cli.py`: `main(argv) -> int` em `:567`, guarda
`if __name__` em `:638`. Zero scheduler, zero daemon, zero laço de sinal.

**(c) O `while True` de `:417` é paginação limitada, não laço de serviço** — quatro saídas reais,
documentadas em `:410-413` e verificadas no código: envelope de erro (`:433`), página vazia
(`:435`), página curta (`:447`), cursor alcançou o presente (`:450`).

O mesmo vale para `candle_fidelity_cli.py` (`main` em `:489`, guarda em `:528`;
`while cursor < window_end_ms` em `:259`, limitado pela janela).

### 2 · Camadas e direção de dependência ✅

```
grep -rnE '^(from|import).*\binfra\b' backend/src/modules/sentimento/domain/    # zero
grep -rnE '^(from|import).*\binfra\b' backend/src/modules/sentimento/use_cases/ # zero
```

`domain/candle_fidelity.py` importa **só** stdlib + `src.modules.sentimento.domain.*`, por
caminho **absoluto**. O julgamento é puro e offline; só `infra` fala com a rede, e fala por
`Protocol` que a suíte substitui — é o que mantém o arnês verificável sob a socket amputada
("ZERO REDE", `candle_fidelity_cli.py:5-8`).

### 3 · O arnês de fidelidade — os instrumentos das três refutações ✅

As três refutações desta fase deixaram **instrumento**, não prosa. Vale registrar, porque é o
oposto do modo de falha que este repositório nomeia:

- `SignCounts.unilateral_bias(*, minimum_n)` — `candle_fidelity.py:326-334` — **`minimum_n` é
  obrigatório e não tem default**, e a docstring diz por quê: *"`pos=0` over one diverging bucket
  is a coin flip, not a signature, and a default would let a caller report a coin flip as
  evidence."* É exatamente essa propriedade que separou o `CLOSE` simétrico do `[M-9]` unilateral.
- `MAX_LOCF_RUN_LENGTH` (`:108`) codifica a lição do achado refutado — o degrau de `LOCF` que
  tinha sido acusado como defeito de dado.
- `_refuse_incomplete_window` (`:702`) **recusa** janela parcial em vez de comparar o que tem.

### 4 · O canal de direção por forma ✅

`ADR-010/D-2` exige três estados; a biblioteca só expressa dois (`isUp = open <= close`,
`lightweight-charts@5.2.1`). A solução está correta e — o que importa aqui — **citada com
arquivo e linha da própria biblioteca**:

- `HOLLOW_BODY_FILL = "rgba(0,0,0,0)"` (`color-tokens.ts:191`) — o canal **não-cor**: a ablação
  cinza colapsa matiz e **não toca alfa**, então a alta sobrevive a uma tela sem cor nenhuma.
- `dojiItemColors()` (`color-tokens.ts:266`) + a aplicação **por item** em
  `s2-lightweight-adapter.ts:104-112` — o doji deixa de ser pintado como alta, que era a
  segunda refutação.
- `priceLineColor` é reparo de defeito medido, não decoração — a origem do preto opaco está
  citada em `dist/lightweight-charts.development.mjs:406-412`.

### 5 · Idioma — medido, não estimado ✅

| superfície | medição | comando |
|---|---|---|
| mensagem de exceção (`backend/src` alterado) | **34 chamadas com string, 0 em português** | AST sobre `*Error`/`*Exception`, o método que o `CLAUDE.md` prescreve |
| evento de log novo | **4, todos em inglês** (`backfill_completed`, `backfill_page_refused`, `backfill_symbol_completed`, `backfill_waiting_for_writer`) | `grep` nos dois CLIs |
| chave de `extra={}` nova | **22, todas em inglês** | `git diff ... | grep -oE '"[a-z_]+":'` |
| segmento de diretório (falsificador do `CLAUDE.md`) | **22 após exclusão, 0 em português** | o `grep -vxE` do `CLAUDE.md`, rodado no HEAD |
| microcopy visível | **pt-BR**, correto (`SymbolClient.tsx:873` "fica"/"ficam"; "Preço") | tabela de fronteira, linha 8 |

`painel` → `panel` já migrou: o falsificador que o `CLAUDE.md` registra com **1 em português**
hoje devolve **zero**.

### 6 · Higiene que as lições anteriores pediam ✅

- **Não semeia o Postgres compartilhado.** `frontend/e2e/15-vela-e-ablacao.spec.ts:49-51` declara
  `[P-seed]`: *"ESTE ARQUIVO NÃO SEMEIA NADA … Nenhum `INSERT`, nenhum `psql`, nenhum `docker`."*
- **Commits:** 38, todos `Stharley Maxwell <stharleymax@gmail.com>`, **0** trailer de co-autoria.
- **`docs/INDEX.md` append-only:** 11 linhas acrescentadas, **0 removidas**.
- **`CLAUDE.md`:** a tabela continua com **12** linhas (`CA-F1-1` respeitado); o acréscimo de
  `infra` carrega `[DECISÃO-OWNER: 2026-09-19]`, o rótulo certo para escolha entre alternativas.

---

## Achados

### `[WARNING-1]` Um `[MEDIDO]` que não reproduz com o comando que o próprio documento publica

**`CLAUDE.md:139-141`** — `CLAUDE.md` §"Nenhum número sem o comando que o produziu"

O texto afirma: *"o falsificador rodado com e sem `infra` na exclusão devolve a MESMA lista, menos
o próprio `infra` — **23 segmentos contra 22**, zero em português nos dois"* `[MEDIDO 2026-09-19]`.

Rodando o **bloco `grep -vxE` que o próprio `CLAUDE.md` publica**, no **commit que publicou a
afirmação** (`0aaedef`):

```
B=$(git ls-tree -r --name-only 0aaedef | grep -E '^(backend/src|backend/tests|frontend/src)/' \
      | awk -F/ '{for(i=1;i<NF;i++) print $i}' | sort -u)
echo "$B" | grep -vxE 'sentimento|charts|convergencia|backtest|web|docs'        | wc -l   # 22
echo "$B" | grep -vxE 'sentimento|charts|convergencia|backtest|web|docs|infra'  | wc -l   # 21
```

**22 contra 21, não 23 contra 22.** Os mesmos números no HEAD, e as duas listas de segmentos são
idênticas (`diff` entre `0aaedef` e HEAD: vazio).

**O que sobrevive e o que não.** A *conclusão* está certa — a lista é a mesma menos o próprio
`infra`, e são **zero em português** nas duas (confirmado). A **decisão de não somar `infra` à
exclusão continua correta e bem argumentada**. O que não reproduz é o **número publicado sob
`[MEDIDO]`**, errado por um em ambos os termos.

**Correção:** trocar por "22 segmentos contra 21", ou declarar qual universo produziu 23.

### `[WARNING-2]` As 29 linhas novas de `compose.yml` são comentário em português

**`deploy/compose.yml:239-267`** — `CLAUDE.md` tabela de fronteira, **linha 5**
(*"docstring / comentário → inglês"*)

`deploy/` está em `code_paths` (`include_prefixes`), então a linha 5 o alcança. E o arquivo é
**uniformemente inglês** em todo o resto — `:1-11` e `:124-129` são inglês, e os dois CLIs novos
desta mesma fase são inglês do começo ao fim. O bloco novo é a única ilha em português.

**Não vira o veredito:** o próprio `CLAUDE.md` declara, literal, que *"idioma de identificador é
convenção, não portão"*, e proíbe transformá-la em `[[rules.own]]`.

**Correção:** traduzir o bloco. O conteúdo técnico dele é bom e deve ficar — é a melhor explicação
escrita de por que o backfill não é serviço.

### `[WARNING-3]` O ledger não registra o que o documento de estado afirma — e isto **impede fechar a fase**

**`docs/context/candle-real-e-eixo-unico/ESTADO-2026-09-19.md:12-15`** vs o ledger —
`CLAUDE.md` §"O ledger é a identidade do estado, não o texto do documento"

O `ESTADO` afirma: *"**As 11 tasks: todas mergeadas**"*. O estado de registro discorda, por dois
instrumentos independentes:

```
harness pipeline show candle-real-e-eixo-unico
# -> estado BUILD_AUTHORIZED; ZERO evento `resolve`; ZERO gate-record

grep -nE '^\s*(id|status)\s*=' docs/context/candle-real-e-eixo-unico/tasks.toml | grep -A1 'T-01'
# -> 11 ids, 11 x  status = "todo"
```

O `CLAUDE.md` é explícito: *"Um documento marcado 'aprovado' **sem o evento no ledger não está
aprovado**."* O código pode muito bem estar mergeado no ramo — o que **não** existe é o registro.

**Correção:** `harness resolve` para a fase inteira **numa chamada só** (é atômico por fase:
listar as 11, não um subconjunto), **antes** de qualquer gate de fase.

### `[WARNING-4]` Dois gates de OWNER gravados com o placeholder do template como motivo

**Ledger, eventos `2026-09-19T17:00:57Z` e `2026-09-19T17:28:24Z`** — `CLAUDE.md` §"Gates
marcados **owner**"

```
harness pipeline show candle-real-e-eixo-unico
2026-09-19T17:00:57Z  approve  spec  — <seu motivo>
2026-09-19T17:28:24Z  approve  build — <seu motivo>
```

`spec` e `build` são justamente os dois gates que **nenhum agente pode dar**. O campo de motivo
dos dois ficou com o texto do template, literal. O contraste é interno ao mesmo ledger — os dois
gates que **foram** preenchidos carregam justificativa real:

```
approve prd   — gap analysis ok: 4 bloqueantes do PRD ([Q1]-[Q4]) fechados pelo owner ...
approve tasks — tasks_review aprovado pelo owner em 2026-09-19; local_reason corrigido ...
```

Um gate de owner cujo motivo é placeholder registra **o ato, não o fundamento**. Numa auditoria
futura os dois são indistinguíveis de "aprovado sem ler".

**Correção:** o owner re-declara o motivo dos dois (evento de correção; o ledger é append-only).

### `[INFO-1]` `wait_for_drain` não tem timeout

**`backend/src/modules/sentimento/infra/klines_backfill_cli.py:334-363`**

**Não é violação** — é decisão deliberada, com as duas alternativas custeadas na docstring
(`:342-347`): desistir deixa história pela metade *parecendo completa*; publicar mesmo assim
entrega linhas que `MAXLEN` descarta. Registrado só porque o one-shot pode ficar pendurado
indefinidamente se o escritor parar de drenar, e o único sinal é `backfill_waiting_for_writer`
repetindo no log. Um operador que não esteja olhando não vê.

### `[INFO-2]` A ablação de `color-tokens.test.ts` é sobre string de token, não sobre pixel

**`frontend/src/charts/color-tokens.test.ts:177-201`** — já auto-declarado em `ESTADO:52-53`

Ela substitui os dois hexes num `Record` e conta classes distintas. Dos três estados, **dois não
são tocados pelo `sed` que o teste imita** (`rgba(0,0,0,0)` e `#8b949e`), então sobrevivem por
construção. É mais fraca que o gravador de pintura de `candle-direction-channel.test.ts`.
A fase já a nomeou como dívida — registrado para não se perder.

### `[INFO-3]` `data-fact="live_preço:attempted"` — chave de máquina derivada de microcopy pt-BR

**`frontend/src/app/symbol/SymbolClient.tsx:2266`** — template `` `live_${label}:…` ``

**Pré-existente, não introduzido por esta fase** — o mesmo template está em
`origin/master:frontend/src/app/symbol/SymbolClient.tsx:2192`, idêntico. Esta fase **achou e
documentou** (`PRD-008` `M10`, `[Q6]` não-bloqueante, dono `/architect`). Registrado aqui só para
o gate não perder o ponteiro.

---

## O `DoD-1` continua aberto, e isso não é achado meu

`ESTADO:29` e `:31-38`: **124 pontos por chave contra os ≥500 exigidos**. A causa é `R-1` do
acessor (`available_at <= t`), e servir a linha do backfill seria **lookahead** — *o acessor está
certo*. Dono declarado: `/architect` + `ADR-006`/`SPEC-001` §2.5, **cai na fase `05`**, com
`⛔ Não reabrir por conta própria`. **Não reabri.** Fica registrado que a fase fecha com
**7 de 8 `DoD`**, por decisão com dono — não por omissão.

---

## Veredito

**COMPLIANT.** 8 regras bloqueantes em vigor, 8 avaliadas, **0 violadas** sobre 33 arquivos de
código (`harness rules --mode sweep` → 0 bloqueio; `make verify` → 6 portões verdes, incluindo
`boundaries 7 kept, 0 broken`). O instrumento foi provado mordente antes de se confiar no
silêncio dele.

⚠️ **COMPLIANT não é "pode fechar a fase".** O `[WARNING-3]` é pré-requisito de qualquer gate de
fase: enquanto o ledger tiver zero `resolve`, o estado de registro contradiz o documento — e neste
repositório **quem manda é o ledger**.

⛔ Este revisor **não gravou nada no ledger** e **não alterou código**.
