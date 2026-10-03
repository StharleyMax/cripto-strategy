# Fase `00` — Os trilhos antes do movimento

> **Tela:** não é tocada. Nenhum arquivo de produção da rota muda
> **Componente:** `web`
> **Requisitos cobertos:** `RF-1` · `RF-6` · `RF-7` · `RN-5` · `CA-2` · `CA-3` · `CA-4` · `CA-6` · `CA-9`
> **Fronteira:** **nenhum dos 47 arquivos de `frontend/` da `wave/paineis-f05`**, nem `frontend/README.md` (`SPEC-011 §9`, `G-M`). Pode correr já

## Itens

| # | item | componente | requisito |
|---|---|---|---|
| 0.1 | `app/symbol/indicators/contract.ts`, só tipos: `IndicatorDefinition` genérico em `K extends string`, `Placement`, `DataSource`, `OverlayBandRequest` (`SPEC-011 §4.1`, `§4.3`). Não enumera `kind` | `web` | `RF-1` |
| 0.1b | Os tipos que o **núcleo** consome nascem no núcleo, em arquivos só de tipos: o binding em `app/symbol/chart/host/` e o requisito de série em `app/symbol/chart/history/` (`SPEC-011 §3`, `§4.2`, `G-R`). `contract.ts` os reusa. São arquivos novos, fora do diff da wave | `web` | `RF-1`, `G-R` |
| 0.2 | `local/indicator-isolation` em `frontend/eslint-rules/`, ligada em `eslint.config.mjs` **sem** mexer nos blocos de `no-restricted-imports` existentes. Resolve o caminho de `import`, `export … from`, `import()` e `require`, e aplica P1, P2 e P3 (`SPEC-011 §5.3`). O docstring da regra documenta a tabela | `web` | `RF-6`, `RN-5`, `CA-6` |
| 0.3 | Teste de diretório de topo: os diretórios de `frontend/src/` ⊆ `{app, charts, components, features}`, lista fixa no teste (`SPEC-011 §5.4`) | `web` | `RF-7` |
| 0.4 | `bucket-arithmetic-boundary.test.ts` varre `app/symbol/**` com recursão, testes fora (`SPEC-011 §5.5`) | `web` | `CA-9` |
| 0.5 | `data-fact-ascii-key-contract.test.ts` lê a árvore `app/symbol/**` sem testes; o total continua 47 | `web` | `CA-9` |

## DoD verificável — comando e universo

1. **Sondas da regra** (`CA-2`, `CA-3`, `CA-6`). Um teste de regra (o padrão de `use-client-fingerprint-boundary`) roda o ESLint sobre as **9** sondas de
   `SPEC-011 §5.3`: as 5 que mordem (P1 por `import`, `import()` e `require`; P2; P3) reprovam com `local/indicator-isolation`, e as 4 que calam
   (as 3 da tabela e `indicators/selection/probe.ts` → `../catalog.ts`) passam. **Morde:** apagar o ramo de `require` ⇒ a sonda por `require` passa ⇒ reprova. Tirar `chart/**` do escopo ⇒ a sonda de P2 cala ⇒ reprova. Tirar
   a P3 ⇒ a sonda `app/symbol/probe.ts` cala ⇒ reprova.
2. **O barrel continua mordendo.** A sonda `indicators/cvd/probe-deep.ts` importando `../../../../charts/s2-panels.ts` reprova por
   `no-restricted-imports` `[DOC: estudo §4.3]`. **Morde:** a regra nova ter substituído as opções do bloco ⇒ a sonda cala ⇒ reprova.
3. **Diretório de topo** (`CA-4`). A sonda `frontend/src/indicators/x.ts` reprova o teste de 0.3, e a árvore real passa. **Morde:** o teste ler a lista do
   disco ⇒ cala ⇒ reprova.
4. **Varredores** (`CA-9`). A linha `Math.floor(ms / step) * step` em `app/symbol/indicators/oi/probe.ts` reprova o teste de 0.4. **Morde:** voltar o
   `readdirSync` sem recursão ⇒ `pass 5, fail 0` ⇒ reprova. O teste de 0.5 dá 47 sobre a árvore de hoje.
5. **Nada da wave foi tocado:** `git diff --name-only $BASE..HEAD | grep -xFf <(git diff --name-only master...wave/paineis-f05)` devolve vazio.
6. `make lint-frontend`, `make test-fast K=<os testes novos>` e, no fim, `make verify` verdes. As sondas de 1 e 2 ficam **no teste da regra**, como fonte em memória com nome de arquivo virtual (permanentes). As de 3 e 4 são arquivos plantados, medidos e apagados antes do commit, e o resultado vai para a PR.
