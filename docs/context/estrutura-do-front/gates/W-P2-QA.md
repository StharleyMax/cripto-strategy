# W-P2-QA: QA da wave 2 da fase 10 (pirâmide de testes): T-10.3, T-10.10, T-10.11, T-10.17, T-10.20 (+ relatório da T-10.8)

| | |
|---|---|
| **feature / fase** | `estrutura-do-front` · fase `10` · wave `piramide-w2` |
| **worktree / branch** | `.claude/worktrees/wave-piramide-w2` · `wave/piramide-w2` · HEAD `18494508` (árvore `6545e986`) |
| **agente** | `frontend-qa` · 2026-10-03 |
| **verify da wave** | `/tmp/verify-wave-piramide-w2-20261003T215234Z.log`. O cache `.git/verify-cache/6545e986…` aponta para ele, então o VERDE é **desta árvore** |

Evidência bruta: `scratchpad/wp2qa/` da sessão `a6300abb-…` (`mut.sh`, `mutfiles.sh`, `mut38.py`, `e2e-mut.sh`,
`m38-colour.log`, `m38-line.log`, `m01-caption.log`, `m20-axis.log`, `timing.log`). Todas as mutações foram revertidas e conferidas:
`git diff --quiet` por arquivo nas unitárias, `git status --short frontend/src | wc -l` = **0** depois de cada e2e. No fim, `git status --short`
mostra só `?? gates/W-P2-REVIEW.md`, que é de outro agente, e este relatório. **Nenhum arquivo de `frontend/` foi alterado.**

## Veredito

```
## QA Gate (Front) — Fase 10: pirâmide de testes, wave piramide-w2
- [OK] DoD das 5 tasks, item a item, com as mutações refeitas por mim (tabelas abaixo)
- [OK] Lógica fora do componente: o diff de produção são 8 linhas, todas `export` (SymbolClient.tsx)
- [OK] Contrato tipado: o render usa props tipadas, sem `as never`. typecheck --strict rc=0 no verify
- [OK] Sem segredo no cliente: portão `regras`, 0 [BLOQUEIO] (verify :1889-2044)
- [OK] Acessibilidade: o 05-t2 fundido morde (mutação no-caption, abaixo)
- [OK] Testes passam e têm o par morde/cala. A exceção é a lacuna do badge (W-1)
- [OK] Cobertura: backend 96,92% contra alvo 70% (verify :1851). Front sem alvo declarado [NÃO MEDIDO]
- [OK] regras: 0 [BLOQUEIO], 77 [AVISO], 5 deles em frontend/ e nenhum em arquivo do diff
- [OK] make verify VERDE: lint×2, test:app 726/0, charts 354+1 skip/0, s1 105/0, s3 111/0, pytest 3664,
       e2e 119 passed + 15 skipped em 40 specs, Playwright 5.9m
- [OK] Doc delta · docs/INDEX.md só com linhas ACRESCENTADAS (+4, -0). Faltam 3 linhas (W-3)
- [OK] Rótulos e números com comando
Veredito: APPROVED. As condições W-1 e W-3 ficam com o orquestrador e não bloqueiam o merge da wave.
```

## Mutações refeitas por mim (REGRA-M), contra a árvore da wave

### Unitárias: `node --conditions=react-server --test --test-reporter=tap <arquivo>`, um arquivo por vez

Antes de mutar, rodei os 16 arquivos tocados: **160 ok / 0 not ok**.

| task | mutação | resultado |
|---|---|---|
| T-10.11 | **F01** `LIMITE DA COBERTURA` → `LIMITE DE COBERTURA` | badge **rc=1** (1 teste) |
| T-10.11 | **F11** remove `aria-pressed={isSelected}` | TF bar **rc=1** (3 testes) |
| T-10.11 | **badge no PricePane**, incondicional, dentro do `<section>` | price-pane **rc=1** (`T-05.6 DoD item 2`) |
| T-10.11 | badge no PricePane com guarda (`gridSlots > drawnCandles`) | price-pane **rc=1** (o mesmo teste, `expected: 0`) |
| T-10.11 | **R01** (ordem das props do `<OiPane>`), **R02** (`oiWallState` renomeado), **R03** (quebra antes de `/>`), **R04** (`handleKeyDown` renomeado) | **verde ×3 em todas** (badge 4/4, TF 7/7, price 10/10) |
| T-10.10 | **F03** `ABSENCE_TOKEN = "SEM_PONTO"`, varrendo os 111 arquivos de `src/app/**` | **1 arquivo**: `absence-readout-microcopy` (antes eram 6) |
| T-10.10 | F02 `SEM_PONTO: "vazio"` | 2 arquivos: `absence-readout-microcopy` e `pane-legend`, como antes |
| T-10.10 | AB1 (`ABSENCE_TOKEN =\n "ausente"`), V3 (margens em várias linhas), H3 (`CHART_HEIGHT_PX =\n 220`) | **0 arquivos**: as 3 ablações ficaram verdes |
| T-10.10 | V1 (margem `top 0.8 → 0.5`) e H1B (`CHART_HEIGHT_PX = 20`) | `price-volume-band-separation` e `candle-direction-channel`, como antes |
| T-10.8 | W01 (`lineSeriesLossless` descarta o whitespace) | `s2-axis-integration` 3 falhas. Os dois `axis-fidelity`, 0. **Reproduz o §0 item 5** |

### e2e: um spec por vez, `E2E_API_PORT=8903 E2E_NEXT_PORT=4403`, sob `flock …/scratchpad/e2e.lock`, com `next build` sobre o código mutado

| task | mutação | spec | resultado |
|---|---|---|---|
| T-10.3 | colorir pelo preço (`colour-by-price`, `T-03.13-builder` §3 c) | 38 | **2 failed**: `gate_ca7_colour: 73 defect(s)` e o E5 junto. WALL 61 s |
| T-10.3 | `lineVisible: false` sob `?e2eOiLine=1` | 38 | **1 failed**: DoD-6, `gate_px_ablation: 2 defect(s)`. `line_ink 224` e `judged_with_line 146/146` **passariam** no juiz antigo. Quem morde é `line_rows` 1/1 contra ≥ 10 (74/75 na limpa). Confirma o achado §4 do builder |
| T-10.17 | o `<caption>` da tabela de `S1Console.tsx:47` removido | 01 | **1 failed**: 01-t1, passo `05-t2`, `tables have no caption/aria-label`. O B1 passou. WALL 13 s |
| T-10.20 | `ChartHost.tsx:328` `[registrar]` → `[registrar, axis]` | 20 | **1 failed**: `HOST REMONTADO: o gráfico foi recriado 1 vez(es) em 1 página(s)… [o passo de paginação também reprovou…]`, `chart_mount_count_after=2`. WALL 251 s |

## Os desvios declarados: julgamento

1. **02-B2 foi para o 01-B1, e não para o 01-t1. ACEITO.** É o destino de `E2E-analise` §2 (*"B2 → 01-B1"*). O 01-t1 é independente do ambiente
   por contrato, e o B2 reprova com `E2E_API_UP=0`. Fundido no t1, ele derrubaria o t1 no modo "API no chão" (M6b do builder: t1 verde, B1
   vermelho). Fica uma pendência de texto: o título e o DoD 1 da `T-10.17` ainda dizem "01-t1". Re-apontar é tarefa do `/tech-lead`, como o
   próprio builder registrou (§8).
2. **O sono de 100 ms ficou no `dragRight`, entre o `move` e o `mouse.up`. ACEITO.** O código o justifica em
   `e2e/20:549-553`. Ele não espera o app, é a duração do gesto (segurar e soltar). Trocar por `waitForChartSettled` poria o polling por frame
   dentro da janela borda→desenho que o teto de `400` mede. O outro sono, entre `down` e `move`, foi trocado pelo helper. Os dois existiam
   antes da task. O sono que sobra não é aposta de prontidão, e por isso não reprova sob máquina lenta.
3. **O +3,8 s de `test:app` da T-10.11 foi medido sob carga. REMEDIDO SEM CARGA, e o custo é real.** Comando:
   `node --conditions=react-server --test 'src/app/**/*.test.ts'`. As árvores foram extraídas por `git archive` de `a9275129` e de `HEAD`,
   com `node_modules` e `data/` ligados por symlink. Os lados rodaram intercalados B/A ×3, segurando o `e2e.lock`, com `others=0`
   `[MEDIDO 2026-10-03, n=3 por lado]`:

   | | run1 | run2 | run3 | mediana | testes |
   |---|---|---|---|---|---|
   | antes `a9275129` | 12,0 | 15,1 | 15,0 | **15,0 s** | 735/0 |
   | depois `HEAD` | 16,0 | 17,8 | 17,6 | **17,6 s** | 726/0 |

   A diferença é de **+2,6 s na mediana (+17 %)**, e de +3,9 s no par mais limpo (run1, load 1,2). O load subiu de 1,2 para 9,5 pelo
   paralelismo do próprio `node --test`. O número do builder (+3,8 s) **não era artefato de carga**. O custo é o que o padrão previa
   (jsdom + typescript carregados por arquivo, `T-10.11-padrao.md` §2.1). Ver W-2.
4. **A lacuna de ligação do badge no OI e no long/short. MEDIDA, e a proteção REGREDIU.** Ver W-1.

## Achados

**W-1 [WARNING]: duas mutações de ligação passaram de vermelho a verde em todos os portões.** O arquivo a ser corrigido é `tasks.toml` (refs da T-10.13 e da T-10.14), e quem corrige é o orquestrador.

| mutação em `SymbolClient.tsx` | badge antigo (`a9275129`), rodado por mim | `test:app` da wave, 111 arquivos | e2e no verify |
|---|---|---|---|
| **OI-NOBADGE**: `{wallState === "beyond-coverage" ? <BeyondCoverageBadge factKey="oi_coverage"/> : null}` → `{null}` (`:1755`) | **rc=1**, 6 falhas (DoD item 2, guard, os 2 MORDE de remoção) | **726/0, verde** | não alcança |
| **LS-WRONGFEED**: `wallState={longShortWallState}` → `wallState={oiWallState}` (`:3426`) | **rc=1** (`exactly ONE badge … threaded once`) | **726/0, verde** | não alcança |

O e2e/21 só prova a ligação no universo forte. `seriesWindowReaderPresent()` devolve `false` quando a API usa `.sqlite3`
(`e2e/21:78-86`), e o verify dá `series_window_reader_present=false` em **12 de 12** fatos deste log. Nesse ramo, o teste só afirma
**ausência**. O defeito *"o painel de OI esvazia em silêncio na parede"* fica, então, **sem nenhuma guarda automática**.

**Por que não é BLOCKER:** o DoD 2 da T-10.11 admite isso de forma literal (*"onde não houver prova, o relatório diz e a ligação não se perde em
silêncio"*). O builder declarou a lacuna no relatório §4 e no docstring do teste, com a medição. Além disso, restaurar o regex antigo
reacenderia R01–R03, o falso alarme que a task existe para remover.

**A condição:** a lacuna precisa de uma task com nome. Hoje ela só vive em relatório de gate. As refs da T-10.13 e da T-10.14 dizem
*"a ligação em SymbolClient com o lugar da prova declarado"*, mas **não citam** OI-NOBADGE nem LS-WRONGFEED. Ação proposta:
(a) somar OI-NOBADGE à mordida da T-10.13, e o equivalente do long/short à da T-10.14. O render do pane os alcança.
(b) LS-WRONGFEED é a alimentação no call site, e **nenhum render de pane a alcança**. Ela precisa de um destes caminhos: um render de
`SymbolClient` com cliente falso (P3 do padrão), o e2e/21 no universo forte, ou um teste de valor sobre `panelWallState` por painel.
A escolha entre eles é do orquestrador ou do `/tech-lead`.

**W-2 [WARNING]: o custo por arquivo do harness de render vai se somar nas T-10.12..T-10.15.** A T-10.11 adicionou +2,6 a +3,9 s de
parede ao `test:app` (§desvio 3) com 3 arquivos de render e 4 de import de `.tsx`. Cada contrato que entrar no padrão paga
jsdom + typescript. Recomendo que cada uma dessas tasks meça `test:app` sozinho, como a REGRA-T já pede, e que o orçamento seja
fixado antes da quarta. A alavanca óbvia é um cache de transpilação no hook `load` de `component-render.ts`. `[INFERRED: não medi o cache]`

**W-3 [WARNING]: `docs/INDEX.md` não tem linha para `T-10.3-build.md`, `T-10.20-build.md` nem `T-10.8-build.md`.** O comando foi
`grep -cE 'T-10\.8' docs/INDEX.md` → 0. Os builders da T-10.3 e da T-10.20 declararam que essas linhas entram no fechamento da wave pelo
orquestrador, padrão de `0370a1a5`. Fica como condição desse fechamento. O INDEX é append-only: `git diff origin/master...HEAD -- docs/INDEX.md`
mostra **+4 e −0**.

**INFO-1:** a saída da T-10.8 se chama `gates/T-10.8-build.md`, mas `tasks.toml:883` pede `T-10.8-mutacao-rodada-2.md`. A divergência
está declarada no próprio relatório (linha 6), e nenhum documento cita o nome do `tasks.toml`.

**INFO-2: resíduos declarados, que conferi e que ficam.** `price-pane` ainda faz `readFileSync` de `[symbol]/page.tsx`. É Server Component e
vai para a F3, item 3.4, como diz `T-10.11-padrao.md:305-307`. `volume-subaxis-geometry`, `-tf-invariance` e `price-volume-band-separation`
leem `SymbolClient.tsx` para os **papéis de escala**, que são props de JSX e não constantes. As constantes já vêm por import (V3 verde).
O DoD 1 da T-10.10 fala de *constante*, então o resíduo está fora dele. As referências a `e2e/17` e `e2e/22` em comentários
(`T-10.20-build.md` §8) e os comentários de produção desatualizados (`T-10.10-build.md` §7, `T-10.11-build.md` §7) ficam como follow-up.

## DoD, por task (o que eu conferi além das mutações)

- **T-10.3:** só o spec 38 mudou. As 5 itens do DoD estão no relatório §5. A cegueira do juiz de linha foi provada pela minha mutação.
- **T-10.10:** `grep -rn 'MOVED_OUT_FILES = ' frontend/src | wc -l` → **1**. O módulo tem 8 consumidores (o badge saiu na T-10.11).
  `EXPECTED_ABSENCE_TOKEN` aparece 0 vezes. O `assert.equal(ABSENCE_TOKEN, ABSENCE_MICROCOPY[…])` vem por import
  (`absence-readout-microcopy.test.ts:25,38-45`). O DoD 1 e o DoD 2, abertos no relatório da T-10.10, **fecharam na T-10.11** (§5 dela),
  e eu os conferi: AB1 e V3 verdes, F03 em 1 arquivo. `eslint.config.mjs`: o diff tem 0 linhas fora de comentário.
- **T-10.11:** `git diff origin/master...HEAD -- frontend/package.json frontend/package-lock.json` → vazio. A produção soma 8 linhas, todas `export`.
  `readFileSync`: badge 0, TF 0, price-pane 1 (`page.tsx`, INFO-2).
- **T-10.17:** restam 01 t1/B1 · 02 t1, B3 (param.), B4, B5, B6 · 04 t1 · 05 axe · 06 390 · 07 D3.4, como pede o DoD 2. No 01, toda
  asserção é `expect.soft`, exceto `status == 200` (pré-condição).
- **T-10.20:** 17 e 22 foram apagados. `scope-map.tsv` agora tem faixas sem os dois. `ChartHost` resolve pelo `@rota:symbol`
  `08-16 18-21 23+`, que inclui o 20.
- **verify-scope** das 5 tasks: substituído pelo verify COMPLETO da wave, que é mais forte e está verde nesta árvore.

## Não feito, nomeado

- Playwright MCP não existe nesta instalação. A prova é o e2e versionado.
- Não gravei no ledger e não commitei, por instrução do despacho.
