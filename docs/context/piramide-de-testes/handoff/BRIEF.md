# Briefing: análise da pirâmide de testes (2026-10-03)

**Só análise.** Nenhum teste é apagado, movido ou editado nesta rodada. A entrega é diagnóstico com número e recomendação, e o owner
decide depois.

## O pedido do owner (literal) `[PREMISSA-OWNER: 2026-10-03]`

> *"nosso maior gargalo ta nos testes e2e, consegue validar como ta nossa piramide de testes, o e2e deveria validar o que os unitários n
> estao sao capazes de validar. vamos dar uma revisada nisso. e tbm ver testes unitarios inuteis e duplicados."*

## Fatos de partida `[MEDIDO pelo orquestrador]`

- `make verify` verde de referência, sobre `origin/master` + T-02.1. O log está em
  `/tmp/claude-1002/-home-stharley-Documentos-projects-cripto-strategy/a6300abb-51da-44af-9f16-e5a540b2363f/scratchpad/verify-base-piramide.log`
  e não deve ser lido inteiro: use `grep`. Os tempos foram: e2e 587 s, `test` (backend) 249 s, `test-frontend` 63 s.
- **e2e:** `Running 141 tests using 1 worker`, com `fullyParallel: false`, `workers: 1` e `retries: 0` (`frontend/playwright.config.ts:17-19`).
  São 42 specs em `frontend/e2e/`. A soma dos tempos por teste dá 491 s; o resto é subida de ambiente (`scripts/e2e-env.sh`: API + `next build`/`next start`).
  Os dois specs mais caros são `38-oi-candle-acceptance-per-bucket` (157 s, 5 testes) e `35-liquidation-acceptance-per-bucket` (60 s, 5
  testes), que juntos dão 44% do tempo de teste. Para tirar o tempo por spec, faça grep de `✓ … (Ns)` no log.
- **Unitário front:** 112 arquivos `*.test.ts*` em `frontend/src`, rodados com `node --test` (`test:app`/`test:charts`/`test:s1`/`test:s3`), 1.297 testes.
  Pelo menos 16 arquivos leem o FONTE de outros `.ts` (`readFileSync`), ou seja, são "testes de contrato" que fazem grep do código.
- **Backend:** 254 arquivos `test_*.py` em `backend/tests`, 3.601 testes e cobertura de 96,92%.
- **Restrição da máquina:** o notebook tem 15 GB de RAM, com o swap em ~5/5 GB. Paralelizar o e2e (workers > 1) tem custo de memória e precisa
  ser avaliado com esse limite (ver o relatório da T-00.4 em `docs/context/estrutura-do-front/gates/T-00.4-build.md` na branch
  `task/T-00.E2E`, que mediu stall de I/O e de CPU do host).

## Critério da pirâmide (o que cada camada deve provar)

- **e2e** prova o que só um browser real com app real prova: pixel/canvas desenhado, rede real entre front e API, roteamento, integração
  entre camadas, e o comportamento sob gesto real. Se um teste e2e só checa uma conta, uma formatação, um mapeamento de dado ou um
  estado que um teste unitário ou de componente (jsdom, headless chart) também alcança, ele está **na camada errada**.
- **Unitário inútil** é o teste que: é tautológico (afirma a constante contra ela mesma); não falha com nenhuma mutação plausível do código;
  faz grep de texto do fonte quando existe uma afirmação comportamental equivalente; ou testa a biblioteca e não o nosso código.
- **Duplicado** é o par de testes em que uma mesma mutação faz os dois reprovarem e nenhum dos dois pega algo que o outro não pegue.

## Atenção, para não errar o veredito

O repositório usa ablação de propósito (`MORDE`/`CALA`, `e2e…` query params) e testes de contrato contra regressões que já aconteceram
(`docs/INDEX.md`, memórias de "assert de DOM não prova pixel"). **Um teste estranho não é inútil por parecer estranho:** antes de chamá-lo
de inútil ou duplicado, ache no `git log -S`/`docs/` por que ele nasceu, e diga o que se perde se ele sair. Toda afirmação precisa do
comando que a produziu, conforme o CLAUDE.md.
