# Achados pré-existentes, encontrados pelo orquestrador ao investigar a fase 05

Nenhum destes é introduzido pelos 3 fixes desta fase (`T-05-FIX` auto-retrigger, `T-05-FIX`
CVD/precisão decimal, os 2 fixes de stub de `17-*`/`20-*.spec.ts`) — os dois abaixo foram
reproduzidos, de forma idêntica, num worktree detached em `ef608ec` (o commit imediatamente
ANTES de qualquer um dos 3 fixes entrar em `wave/candle-f05`), com o mesmo comando. Registrados
aqui em vez de descartados como "flakiness" sem prova — `MEMORY.md`: "Escopo: confira o diff, não
o resumo" e "Revalidar gate após mudança de produção" pedem exatamente essa checagem antes de
aceitar uma explicação.

## 1. `16-eixo-unico-pan-e-ablacao.spec.ts:204` — write count desalinha entre painéis, 1 em cada ~2 rodadas

DoD-2/DoD-4 espera que UM gesto de arrasto real produza o MESMO número de escritas em cada um dos
5 painéis não-origem (prova de "sem amplificação, sem laço"). Medido, `n=1` gesto, duas rodadas:

```
$ npx playwright test e2e/16-eixo-unico-pan-e-ablacao.spec.ts --reporter=line
# rodada A (wave/candle-f05, com os 3 fixes): oi=50 cvd=50 long-short=50, liquidation-long=49 liquidation-short=49
# rodada B (ef608ec, SEM nenhum dos 3 fixes): idêntico ao padrão acima (mesma reprovação)
```

Os dois cohorts de liquidação ficam consistentemente 1 escrita atrás dos outros 3 painéis, no
MESMO gesto — não é ordem alfabética nem posição no DOM, é especificamente o par
`liquidation-cohort-{long,short}`. Cheira a uma race pré-existente no fan-out de
`RangeDispatcher.onPanelRangeChanged` especificamente para esses dois painéis (talvez montagem
tardia, ou uma segunda inscrição que perde o primeiro frame) — não investigado a fundo aqui,
fora do escopo dos 3 fixes desta fase.

## 2. `18-tf-refetch-e-ablacao.spec.ts` — clicar TF `4h` não move `endMsInclusive` no universo fraco (sqlite efêmero)

Dois testes (`:107` e `:153`) reprovam porque `window_after_4h.endMsInclusive` é BYTE-A-BYTE igual
a `window` antes do clique — o DoD que este spec existe para provar ("selecionar 4h move a borda
da janela") nunca chega a ser exercido. Medido, `n=1`, duas rodadas, MESMO valor exato
(`1790186040000`) nos dois antes/depois, nas duas árvores:

```
$ STATE_DIR="$(bash scripts/e2e-env.sh up 1 8811 4311)"; \
  E2E_BASE_URL="$(cat "$STATE_DIR/base_url")" E2E_API_LOG_PATH="$STATE_DIR/api.log" \
  E2E_SENTIMENTO_API_BASE_URL="$(cat "$STATE_DIR/api_base_url")" \
  frontend/node_modules/.bin/playwright test --config=frontend/playwright.config.ts \
  e2e/18-tf-refetch-e-ablacao.spec.ts --reporter=line
# wave/candle-f05 (com os 3 fixes) e ef608ec (sem): mesma reprovação, mesmo endMsInclusive
```

Suspeita, não confirmada: o universo fraco (sqlite efêmero, `scripts/e2e-env.sh`) tem um "agora"
congelado no momento do seed, e a mudança de TF pode estar recalculando a janela a partir de um
`knowledge_time`/`server_now_ms` que não muda entre requisições nesse ambiente específico —
diferente do universo sintético privado (`17-*`/`20-*.spec.ts`), que usa `Date.now()` real. Não
investigado a fundo aqui.

## O que isto significa para o fechamento da fase 05

Nenhum dos dois bloqueia esta fase — ambos pré-existem, prováveis heranças de `T-02.x`/`T-03.x`
(fase 02/03), não tocados por nenhuma das 5 tasks que mexeram em `range-dispatch.ts`/
`axis-sync*.ts`/`SymbolClient.tsx` nesta fase. Registrados para o QA/Reviewer da fase decidirem se
tratam como débito aberto (mais um achado escalado, como o CORS gap e o `ADR-026` UPSAMPLING de
`T-05.11`) ou abrem task dedicada fora desta fase.
