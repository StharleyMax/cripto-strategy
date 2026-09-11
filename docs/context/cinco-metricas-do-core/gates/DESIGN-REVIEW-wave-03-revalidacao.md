# Design review — wave 03, RE-VALIDAÇÃO de `NEEDS_FIX`

`ux-ui-mastery:design-review` · branch `wave/03-producao-e-janela-deslizante` · `d480dcc`
· 2026-09-11

## Veredito: ⛔ NEEDS_FIX

Um defeito bloqueante, **novo**, criado pela própria correção. Os dois achados que motivaram o
`NEEDS_FIX` anterior estão **resolvidos**.

---

## ⛔ BLOQUEIO — `D13` apagou a paleta clara só no TypeScript; o CSS ainda a tem

`D13` decidiu *"tema único escuro, paleta clara deletada"*. Executado em `charts/color-tokens.ts`
(`ColorMode`, `TOKENS_BY_MODE` e a paleta clara saíram). **Não executado em
`frontend/src/app/globals.css:75-92`**, que mantém:

```css
@media (prefers-color-scheme: light) {
  :root { --color-surface-base: #ffffff; --color-provenance-strong: #131722; … }
}
```

**Consequência, e é pior que uma inconsistência:** o fundo passa a ser decidido pelo SO do
operador, enquanto as cores do gráfico (canvas do `lightweight-charts`) vêm de `colorTokens()`,
que agora **só tem o escuro e não acompanha**. Numa máquina com o SO em modo claro a tela é
branca e as séries continuam pintadas para fundo escuro.

`[MEDIDO 2026-09-11]`, com a própria `contrastRatio` do repo:

```bash
cd frontend && node --input-type=module -e '
import { contrastRatio } from "./src/charts/contrast.ts"; …'
```

| papel | sobre `#131722` (o que o portão afere) | sobre `#ffffff` (o que a tela pode ser) |
|---|---|---|
| `provenanceStrong` — **a linha de Open Interest** | 14,72:1 | **1,22:1** ⛔ |
| `dataBrokenInk` | 9,68:1 | **1,85:1** ⛔ |
| `provenanceWeak` | 5,82:1 | 3,08:1 |
| `directionUpFill` | 5,01:1 | 3,57:1 |
| `directionDownFill` | 4,59:1 | 3,90:1 |

**`n=5` papéis; 2 reprovam o piso de 3,0:1 que esta mesma wave acabou de instituir.**
A linha de OI a **1,22:1** é, na prática, invisível.

**E o portão novo não vê nada disso, por construção:** `contrast.ts` afere contra
`SURFACE_BASE = "#131722"`, uma **constante TypeScript**. O CSS pode contradizê-la e o teste
continua `8/8` verde. É o modo de falha que `ADR-012` nomeia para o `rc=0` — sinal
indistinguível entre *"não erodiu"* e *"o instrumento não é capaz de ver"*.

**Agravante — o e2e roda justamente no claro.** `frontend/src/features/s3-inspector/S3Inspector.tsx:67`
declara, em comentário de produção: *"LIGHT surface (`prefers-color-scheme: light`, **this
project's e2e default**)"*. Nada em `frontend/src/` emite `color-scheme` ou força o escuro
(`grep -rn 'color-scheme\|data-theme' frontend/src/` → 4 linhas, todas comentário ou o próprio
`@media`).

### O que conserta, e o que o conserto tem de provar

1. Apagar `globals.css:74-92` inteiro e declarar `color-scheme: dark` em `:root` — sem isso o
   browser ainda pinta scrollbar e widget de formulário em claro.
2. **Um teste que faça o portão enxergar o CSS**, senão o defeito volta: `SURFACE_BASE` e
   `--color-surface-base` do `globals.css` têm de ser provados **iguais**, e a ausência de
   qualquer bloco `prefers-color-scheme` tem de ser asserção. Hoje as duas fontes não se falam.
3. Falsificador: reintroduzir o `@media` tem de **reprovar**.

---

## ✅ Resolvido desde o `NEEDS_FIX` anterior

**1. O piso de contraste existe e morde.** `CONTRAST_BACKDROP` é
`Readonly<Record<ColorRole, ContrastBackdrop>>` — **exaustivo por tipo**, não allowlist: papel
novo em `ColorRole` sem linha aqui é **erro de compilação**. A distinção importa, e
`ADR-011/D1.10` reprova justamente a outra forma.

**2. `directionOn` não era defeito, e agora está estruturalmente declarado.**
`{ kind: "roles", roles: ["directionUpFill","directionDownFill"], minRatio: 4.5 }` — a tinta
senta no corpo da vela, então o corpo **é** o fundo de aferição, com piso *mais alto* (4,5:1 de
`ADR-010/ON`), não dispensa. **Eu havia medido contra a referência errada e reportado 1,00:1 como
defeito; a retratação está no código, em `color-tokens.ts:154-157`.**

**3. O vão está declarado sem ser encolhido.** `ReadableHorizon`
(`SymbolClient.tsx:231-246`) imprime `Dado legível desde <UTC> — <presentes>/<grades> grades de
1 min na janela` e expõe `data-fact="volume_readable_horizon:833/5760"`. A tela **não** finge
cobertura que não tem, e a ausência é `SEM_PONTO`, nunca `0` (`ABSENCE_TOKEN`, `:191`).

---

## Domínios

| domínio | nota | uma linha |
|---|---|---|
| Heuristic Compliance | 8 | "visibilidade do estado do sistema" é o ponto forte: o horizonte legível é dito, não inferido |
| Research Foundation | 7 | decisões ancoradas em medição e em `DECISOES-OWNER.md`, não em gosto |
| Mobile Experience | — | **fora de escopo** por `D14` `[PREMISSA-OWNER: 2026-09-11]`: *"sem mobile no piloto"* |
| Desktop Experience | 7 | densidade adequada ao operador; sem atalho de teclado ainda |
| Visual Design | 5 | **duas verdades sobre o fundo** — o bloqueio acima |
| Accessibility | 4 | `role="group"`/`aria-label` presentes; **2 de 5 papéis reprovam 1.4.11 no claro** |
| Interaction Design | 7 | `role="status"` na ausência de painel; sem estado de carregamento explícito |
| Future-Readiness | 6 | `data-fact` torna a tela legível por máquina — base boa |
| System Architecture | 6 | token governado e união fechada; **perde pontos porque CSS e TS não compartilham fonte** |
| Ethics & Content | 9 | não inventa dado: `SEM_PONTO` é erro de tipo, e o vão aparece |

**Nota geral: 64/100** — puxada pelo bloqueio, que é de uma linha só de causa e barato de
corrigir.

## Prioridade

**Ganho rápido (< 1 dia)** — apagar `globals.css:74-92`, `color-scheme: dark` em `:root`, e o
teste que amarra `SURFACE_BASE` ao CSS. É o bloqueio inteiro.

**Médio (1–5 dias)** — estado de carregamento explícito; navegação por teclado entre painéis.

**Estratégico** — a `T-01.8` decide forma e microcopy do horizonte legível; o texto de hoje é
placeholder declarado como tal em `SymbolClient.tsx:225-230`.
