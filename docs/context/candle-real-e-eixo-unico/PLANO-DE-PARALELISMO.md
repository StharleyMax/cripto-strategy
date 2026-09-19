# `candle-real-e-eixo-unico` — plano de paralelismo

> Exigido por `D8` (`docs/context/cinco-metricas-do-core/handoff/DECISOES-OWNER.md:164-183`).
> `[PREMISSA-OWNER: 2026-09-10]`, literal: *"Faça o tl montar uma plano de paralelismo e exectamos
> a partir desse plano com no máximo 2 execuções simultaneas"*.
>
> **O plano é o que a execução segue. Não é para o orquestrador improvisar o agrupamento na hora.**
>
> Gerado pelo loop principal em 2026-09-19, sobre `tasks.toml` validado (`48 task(s), 0 ERROR,
> 0 WARN`). Reproduzível: o script que o derivou está em §5.

---

## 1. As três restrições, e de onde cada uma vem

| # | restrição | origem | força |
|---|---|---|---|
| R-A | **≤ 2 tasks simultâneas**, mesmo quando o DAG liberar mais | `D8` | `[PREMISSA-OWNER: 2026-09-10]` — o teto anterior era 3, e caiu |
| R-B | **`depends_on` do `tasks.toml`** é respeitado sempre | contrato da quebra | `[DOC]` |
| R-C | **ordem das fases é a espinha**: `01 → 02 → 03 → 04 → 05` | ver §2 — **e esta é a que o DAG NÃO codifica** | `[INFERRED: ver o argumento em §2]` |

## 2. ⛔ O achado que obrigou R-C: o DAG sozinho permite o que o plano proíbe

```bash
# arestas de depends_on que cruzam fase, sobre as 48 tasks
python3 -c "…"   # script completo em §5
# -> arestas CRUZANDO fase: 3  ·  tasks SEM nenhuma dependencia: 8
```

`[MEDIDO 2026-09-19, n=48 tasks]` — existem **3** arestas cruzando fase, e **todas** entram na
`05`:

| aresta | |
|---|---|
| `T-05.1` ← `T-02.3` | |
| `T-05.5` ← `T-03.6` | |
| `T-05.7` ← `T-03.6` | |

⇒ **entre `01`, `02`, `03` e `04` o DAG declara ZERO dependência.** Em ondas topológicas puras
isso daria **8 ondas** com até **11 tasks simultâneas**, e a onda 1 conteria tasks de **todas as
cinco fases ao mesmo tempo** — inclusive uma da `05`.

**Por que isso seria errado, e não só agressivo:**

1. **`D8` proíbe assumir.** Literal: *"Se o `/tech-lead` achar que fatias podem correr em paralelo,
   precisa justificar contra essa dependência — não assumir."* Nenhuma justificativa foi escrita
   para `01`∥`02`∥`03`∥`04`, então o default é a ordem declarada no plano;
2. ⭐ **o `/architect` decidiu explicitamente que `02` vem antes de `03`**, e o motivo é de
   correção, não de gosto: os painéis **ainda não compartilham grade** (`price_slots:5760` contra
   `oi_slots:1152`) ⇒ ligar o eixo (`02`) tem de vir **antes** de reagregar por timeframe (`03`),
   senão sincronizam-se painéis **mostrando instantes diferentes** — um erro que parece certo.
   **Esta aresta não está no `tasks.toml`**;
3. **`DoD-VERTICAL`**: fase é uma fatia vertical até o pixel. Rodar task da `05` (história sob
   demanda) antes de a `01` ter produzido a vela entrega paginação de uma série que ainda não
   existe.

> **A dívida, declarada e não escondida:** o certo seria o `depends_on` carregar a aresta
> `02 → 03`, e aí `R-C` sairia do plano e entraria no dado de máquina. Enquanto não entrar, **este
> documento é a única coisa que impede a execução de construir `03` sobre um eixo não unificado**,
> e documento não é portão. **Dono: o `/tech-lead`, na primeira reabertura do `tasks.toml`.**

## 3. Os 30 lotes — o que a execução segue

Ordem estritamente de cima para baixo. Cada lote é **uma wave**: ≤ 2 tasks simultâneas, em
worktrees isoladas, **uma PR por wave**.

### Fase `01` — vela (11 tasks · 6 lotes)

| lote | tasks |
|---|---|
| 1 | `T-01.1` + `T-01.2` |
| 2 | `T-01.3` + `T-01.6` |
| 3 | `T-01.4` + `T-01.8` |
| 4 | `T-01.5` + `T-01.9` |
| 5 | `T-01.10` + `T-01.11` |
| 6 | `T-01.7` |

### Fase `02` — eixo único (8 tasks · 6 lotes)

| lote | tasks |
|---|---|
| 7 | `T-02.1` + `T-02.5` |
| 8 | `T-02.2` |
| 9 | `T-02.3` |
| 10 | `T-02.4` |
| 11 | `T-02.6` + `T-02.7` |
| 12 | `T-02.8` |

⚠️ **Os lotes 8, 9 e 10 são de UMA task cada, e isso não é desperdício** — é cadeia real de
`depends_on` (`T-02.2 → T-02.3 → T-02.4`). Agrupá-los violaria `R-B`.

### Fase `03` — timeframe (12 tasks · 8 lotes)

| lote | tasks |
|---|---|
| 13 | `T-03.1` |
| 14 | `T-03.2` + `T-03.3` |
| 15 | `T-03.4` + `T-03.5` |
| 16 | `T-03.8` |
| 17 | `T-03.6` + `T-03.7` |
| 18 | `T-03.9` |
| 19 | `T-03.10` + `T-03.11` |
| 20 | `T-03.12` |

### Fase `04` — OI honesto (6 tasks · 4 lotes)

| lote | tasks |
|---|---|
| 21 | `T-04.1` + `T-04.3` |
| 22 | `T-04.2` + `T-04.4` |
| 23 | `T-04.5` |
| 24 | `T-04.6` |

### Fase `05` — história sob demanda (11 tasks · 6 lotes)

| lote | tasks |
|---|---|
| 25 | `T-05.1` + `T-05.3` |
| 26 | `T-05.2` + `T-05.4` |
| 27 | `T-05.5` + `T-05.9` |
| 28 | `T-05.6` + `T-05.7` |
| 29 | `T-05.10` + `T-05.11` |
| 30 | `T-05.8` |

**Total: 30 lotes sequenciais** sobre 48 tasks. Ocupação média **1,60** task por lote contra o
teto de 2 — o que falta para 2,0 é cadeia de `depends_on`, não folga desperdiçada.

## 4. As regras de execução que já valem e este plano não reinventa

- **worktree isolada por task**, e **só remover a worktree depois de confirmar o commit** — três
  relatórios de QA já foram perdidos por pular esse passo;
- **a PR é por wave**, não por task — a unidade é o ciclo paralelo;
- **QA + code-review + design-review aprovados dispensam o owner no merge**;
- **subagente morre cedo**: passando de ~150 turnos, escreve handoff e devolve
  (`scripts/claude-hooks/subagent-turn-cap.sh` avisa; o custo é quadrático nos turnos);
- **worktree não vê arquivo não-commitado** do principal — nunca citar caminho `??` num prompt de
  despacho;
- **purgar `__pycache__`** antes de acreditar em verde ou vermelho;
- **revalidar gate após mudança de produção**: `APPROVED` velho sobre código novo é pior que
  `NEEDS_FIX` velho.

## 5. O script que derivou os lotes — para qualquer um refazer e conferir

```python
import re, pathlib
s = pathlib.Path("docs/context/candle-real-e-eixo-unico/tasks.toml").read_text(encoding="utf-8")
T = {}
for b in re.findall(r'\[\[tasks\]\](.*?)(?=\n\[\[tasks\]\]|\Z)', s, re.S):
    i = re.search(r'^id\s*=\s*"([^"]+)"', b, re.M).group(1)
    ph = re.search(r'^phase\s*=\s*"([^"]+)"', b, re.M)
    T[i] = {"phase": ph.group(1) if ph else "-",
            "dep": re.findall(r'"([^"]+)"',
                   re.search(r'^depends_on\s*=\s*\[(.*?)\]', b, re.S | re.M).group(1))}

TETO, feito, lote = 2, set(), 0
for fase in ["01", "02", "03", "04", "05"]:          # R-C: a fase e a espinha
    restam = {i for i in T if T[i]["phase"] == fase}
    while restam:
        pronta = sorted(i for i in restam if all(d in feito for d in T[i]["dep"]))  # R-B
        if not pronta:
            raise SystemExit(f"travada: {sorted(restam)}")
        for k in range(0, len(pronta), TETO):        # R-A: lotes de <=2
            lote += 1
            print(f"lote {lote:2d}: {' + '.join(pronta[k:k+TETO])}")
        feito |= set(pronta); restam -= set(pronta)
```

**O falsificador deste plano:** trocar `TETO = 2` por `TETO = 3` tem de mudar a saída — se não
mudar, o teto não está sendo aplicado e o script não mede o que diz medir. E remover a linha do
`for fase` tem de produzir ondas misturando fases, que é exatamente o que §2 proíbe.

### O falsificador RODADO, não presumido `[MEDIDO 2026-09-19, n=48 tasks]`

```
MORDE teto:   teto=2 -> 30 lotes  |  teto=3 -> 25 lotes
MORDE fase:   com espinha de fase -> 30  |  sem espinha -> 26
```

**Os dois mordem**, e é isso que torna o plano auditável em vez de declarativo:

- trocar o teto de 2 para 3 muda a saída (**30 → 25**) ⇒ `R-A` **está** sendo aplicada. Se não
  mudasse, o teto seria enfeite;
- remover a espinha de fase muda a saída (**30 → 26**) ⇒ `R-C` **está** restringindo de fato, e os
  4 lotes de diferença são exatamente o paralelismo entre fatias que `D8` manda justificar antes de
  usar. **Ninguém justificou** ⇒ os 4 ficam na mesa.

⚠️ **Leia o número certo:** os 4 lotes economizados **não são ganho disponível** — são o preço da
correção. Pagá-los é o que impede `03` de reagregar sobre um eixo que `02` ainda não unificou.
