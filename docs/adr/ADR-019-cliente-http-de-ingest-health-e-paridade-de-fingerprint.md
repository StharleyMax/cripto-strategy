# ADR-019 — Cliente HTTP de `ingest_health` (`ADR-005/D6.1`) e o falsificador de `ADR-008/DoD-2` sobre a rota real

**Status:** `RASCUNHO` (aprovar é gate do owner) · **Data:** 2026-09-04 · **Componente:** `web` ·
**Feature:** `plataforma-dados` (`T-05.14`, `CST-105`) · **Autor:** `architect` (`web`, `A6`)
**Rev de ancoragem:** `master@56b866c` (worktree `/tmp/claude-1002/wt/T-05.14`, branch
`tasks/T-05.14-cliente-rota-real`) — inclui `T-05.12` (rota real, `backend/src/api/routes/
ingest_health.py`) e `T-05.11` (scaffold Next, `frontend/src/app/`).

**Fecha:** como `frontend/src/features/s1-console/ingest-health-query.ts` lê o envelope real de
`GET /ingest-health` (`ADR-005/D6.1`), como o cliente re-projeta `runs[]`/`gaps[]` sobre a tupla do
contrato (mirror de `_project_run_dict`/`_project_gap_dict`), como o `fingerprint` fica SÍNCRONO
(`ADR-005/D6.4`) apesar do `fetch` ser assíncrono, onde a URL base vem de (nunca literal), e a forma
exata dos três testes de paridade — `F-D6-1` (CALA + controle negativo de reordenação) e `F-D6-2`
(campo novo dentro de `runs[]` × campo novo no envelope). **Não fecha:** DoD-3 (`verdict` inédito)
sobre HTTP — fora do escopo desta task, permanece coberto pelos testes existentes contra o CLI; nem
a remoção do transporte por subprocesso (`T-05.15`) nem a fronteira síncrona/assíncrona geral do
módulo (`T-05.16`) — este ADR não antecipa nenhum dos dois.

---

## Contexto

`ADR-005/D6.1` fixou o envelope: `{ query, n_runs, n_gaps, runs[], gaps[] }`, 15 colunas por `run`
(`ADR-008/D3`), 8 por `gap`, nome de fio `class` nunca `gap_class`. `backend/src/api/routes/
ingest_health.py` já serve isso — `report.to_envelope()`, testado sobre socket real por
`backend/tests/api/test_ingest_health_route_over_the_network.py` (`_served`: `uvicorn.Server` numa
thread `daemon`, porta `0`, MORDE/CALA sobre o processo vivo/morto). O lado TS
(`ingest-health-query.ts`) já tem a metade que D6.2 exige — `projectRun`/`projectGap`/`canonicalJson`/
`canonicalLines`/`canonicalProjection`/`fingerprint` (92-265) — porque `T-07.13` já as escreveu para
espelhar `_project_run`/`_project_gap` do lado do CLI. **Essas seis funções não mudam nesta ADR**:
elas já iteram a ordem do contrato, nunca a ordem do objeto recebido — a propriedade de D6.2 já existe,
só nunca foi exercitada contra bytes que vieram de rede.

O que morre é o que só fazia sentido para o formato antigo: `SectionMarker`, `isHeaderLine`,
`parseCanonicalProjection` (266-312, 47 linhas) — um parser de NDJSON com cabeçalho e marcadores de
seção, formato que só o `stdout` do CLI usa. O envelope HTTP é objeto JSON aninhado, não
linha-delimitado; manter os dois formatos de parsing depois de `D6.1` seria manter dois contratos
para um, que é exatamente o que a alternativa recusada de `D6` (texto canônico como corpo) evitou.

## Decisão

### D1 · O módulo continua sendo `ingest-health-query.ts` — sem arquivo novo

`projectRun`/`projectGap`/`canonicalJson`/`canonicalLines`/`canonicalProjection`/`fingerprint`
ficam onde estão, sem edição. `SectionMarker`/`isHeaderLine`/`parseCanonicalProjection` são
apagadas. `fetchIngestHealthProjectionViaCli` e `IngestHealthQueryResult` são apagadas também —
`parseCanonicalProjection` era o único parser que a alimentava, e reescrevê-la para o formato errado
(envelope) seria a mesma duplicação que a cláusula anterior recusa. `runIngestHealthCli` +
`IngestHealthCliOptions`/`Result` + `HOSTED_SCRIPT` + `DEFAULT_BACKEND_ROOT`/`THIS_FILE_DIR` + os 4
imports `node:` de `child_process`/`fs`/`path`/`url` **ficam intocados** — órfãos de uso em produção,
mas a remoção forçada deles (`spawnSync` não existe em browser) é `T-05.15`, não esta ADR. Os testes
que hoje chamam só `runIngestHealthCli` diretamente (a checagem de `DoD-3` sobre o CLI) também ficam
intocados: `T-05.14` não reabre `DoD-3`, que não está nos `refs` desta task.

### D2 · Parsing do envelope: permissivo em campo desconhecido, estrito em campo ausente/malformado

```ts
function assertIngestHealthRunRow(value: unknown, index: number): asserts value is IngestHealthRunRow
function assertIngestHealthGapRow(value: unknown, index: number): asserts value is IngestHealthGapRow
export function parseIngestHealthEnvelope(body: unknown): IngestHealthProjection
```

`parseIngestHealthEnvelope` exige `isPlainRecord(body)`, `body.query === INGEST_HEALTH_QUERY_NAME`,
`Array.isArray(body.runs|gaps)`, `body.n_runs === body.runs.length` e `body.n_gaps ===
body.gaps.length` (defesa contra resposta truncada — o próprio header declara a contagem, e ela tem
de bater com o array). Cada elemento de `runs`/`gaps` passa por `assertIngestHealthRunRow`/
`assertIngestHealthGapRow`: as 15/8 colunas nomeadas têm de estar presentes com o tipo certo — isto
É a "tipagem estrita e validação em toda entrada de rede" que este componente decide. **Chaves além
das nomeadas são ignoradas, nunca rejeitadas** — mesma postura que `projectRun`/`projectGap` já têm
(leem por nome, nunca por posição), e é essa postura que faz `F-D6-2` (abaixo) ter um resultado
diferente para campo-dentro-de-`runs[]` × campo-no-envelope sem precisar de duas implementações de
parser. `assertNoTickLevelFields` (já existe, `history-transport.ts`) roda sobre o `body` inteiro
antes do parse — o falsificador de `D5.8`/`ADR-005` continua agnóstico de schema.

### D3 · A borda de rede é assíncrona; a canonicalização e o `fingerprint` continuam síncronos — `ADR-005/D6.4`

```ts
export interface IngestHealthHttpOptions {
  readonly baseUrl?: string;      // default: leitura de configuração de ambiente, D4 abaixo
  readonly fetchImpl?: typeof fetch; // injetável — testes passam um fetch real contra localhost
}
export interface IngestHealthHttpResult {
  readonly projection: IngestHealthProjection;
  readonly fingerprint: string;   // computado no cliente, nunca aceito do servidor — D6.3
}
export async function fetchIngestHealthProjectionViaHttp(
  options?: IngestHealthHttpOptions,
): Promise<IngestHealthHttpResult>
```

Só o `fetch`/`response.json()` são `await`; a partir do corpo já decodificado,
`parseIngestHealthEnvelope` → `fingerprint(projection)` são a MESMA cadeia síncrona de sempre —
`fingerprint(): string` (`createHash` de `node:crypto`) não muda de forma. `D6.4` proíbe o
falsificador de `DoD-2` de virar `Promise<string>` **no instrumento de canonicalização**; não proíbe a
função de topo (a que faz I/O) de ser `async` — são camadas diferentes, e só a de baixo é o
falsificador. O `fingerprint` do resultado é sempre recomputado pelo cliente, nunca lido de um
`ETag`/campo do servidor — a alternativa "servidor manda o fingerprint e o cliente confia" já foi
recusada em `D6` por comparar um número consigo mesmo, e repeti-la aqui reabriria a mesma vacuidade.

### D4 · A URL base vem de configuração de ambiente, nunca de `NEXT_PUBLIC_*`

`options.baseUrl ?? process.env.INGEST_HEALTH_API_BASE_URL` (lançando se nenhum dos dois existir).
**Nunca `NEXT_PUBLIC_INGEST_HEALTH_API_BASE_URL`**: essa família de variável o Next inlina no bundle
do browser, e `A4`+`D6.4` exigem que este módulo só rode do lado do servidor (Server
Component/Route Handler — nunca um arquivo `"use client"`). Ler uma variável sem o prefixo
`NEXT_PUBLIC_` é também uma segunda rede de proteção: se este módulo for um dia importado por VALOR
de um componente cliente, a variável resolve `undefined` em vez de vazar um endereço — falha
observável, não fuga silenciosa. **Quem cabeia isto num Server Component é decisão de quem
implementa** (`painel/page.tsx`/`S1Console` ou um Route Handler) — não é DoD desta ADR, que só cobre
o módulo de transporte; a restrição que vincula é: **jamais `"use client"`**, preservando o "0
importador de valor" que `ADR-005/D6.4` mede hoje e que `T-05.16` vai formalizar como portão.
`harness rules --mode file --path frontend/src/features/s1-console/ingest-health-query.ts` não
acusa `web-fullstack.hardcoded-url` porque nenhuma string `http(s)://` literal aparece no módulo
(a allowlist de `localhost`/`127.0.0.1` só é exercitada pelos TESTES, que apontam para o servidor
real que eles mesmos sobem — `scope = "code"` da regra alcança `frontend/src/**` sem excluir teste,
mas o padrão é sobre STRING LITERAL, e testes usam a mesma disciplina de não hardcodar fora do
`127.0.0.1` da allowlist).

### D5 · Os três testes de paridade — arquivo novo, mesmo idioma que `test_ingest_health_route_over_the_network.py`

Novo arquivo `frontend/src/features/s1-console/ingest-health-query-http.test.ts` (separado de
`ingest-health-query.test.ts`, que continua cobrindo o caminho do CLI) — a mesma separação que o
backend já faz entre `test_ingest_health_query.py` e `test_ingest_health_route_over_the_network.py`.
Um script Python embutido (`spawn`, não `spawnSync` — o servidor tem de continuar vivo entre o
`fetch` e o `assert`) sobe `uvicorn` numa thread contra um fixture SQLite, imprime a porta em stdout,
e aceita um parâmetro opcional de MUTAÇÃO server-side, só para o processo de teste — nunca edita
`backend/src/`:

- **CALA (`F-D6-1` positivo)**: servidor real, sem mutação. `fetchIngestHealthProjectionViaHttp`
  busca o envelope; `fingerprint(projection)` do lado TS **igual** a
  `IngestHealthReport(runs=…, gaps=…).fingerprint()` computado do lado Python **sobre as MESMAS
  linhas** que semearam o fixture (construídas uma vez, em Python, e usadas para semear o store E
  para computar o `fingerprint` esperado — nunca lidas de volta do banco para evitar comparar a
  reconstrução consigo mesma).
- **`F-D6-1` negativo**: uma SEGUNDA instância do servidor, com `INGEST_HEALTH_RUN_COLUMNS`
  monkeypatchado (tupla reordenada) só no processo de teste antes de `create_app` subir — muda a
  ordem em que `_project_run_dict` itera, então `IngestHealthReport.fingerprint()` desse processo
  **muda**. O cliente TS busca o envelope dessa instância (o parse não quebra — D6.2: `projectRun`
  lê por nome) e recomputa `fingerprint(projection)` **sobre a ordem que O PRÓPRIO TS declara**
  (`INGEST_HEALTH_RUN_COLUMNS`/`projectRun`, inalterados) — igual ao fingerprint da instância
  ORIGINAL, diferente do da instância mutada. Asserção: `tsFingerprint !== mutatedServerFingerprint`
  **e** `tsFingerprint === originalServerFingerprint`. Se os dois lados baterem apesar da mutação,
  `DoD-2` está vazio de novo — é a frase do próprio `F-D6-1`, verbatim.
- **`F-D6-2`**: duas variações do MESMO fixture, cada uma servida por sua própria instância: (i) um
  campo extra dentro de um objeto de `runs[]` (via `_project_run_dict` monkeypatchado para
  acrescentar uma 16ª chave) — o `fingerprint` da instância mutada difere do original, o TS (que só
  lê as 15 nomeadas) fica ancorado no original ⇒ a paridade **reprova**, provando que a região por
  dentro de `runs[]` participa do hash; (ii) um campo extra plantado no envelope raiz (`to_envelope()`
  monkeypatchado para acrescentar `debug_note` ao dict de topo, **sem tocar `fingerprint()`**) — os
  dois fingerprints continuam iguais, provando que a região fora de `runs[]`/`gaps[]` NÃO participa.
  Os dois resultados narrados juntos são o falsificador de `D6.3` ("a impressão digital viaja FORA da
  região hasheada"): se (i) e (ii) se comportassem igual, a região hasheada não estaria definida.

## Falsificador desta ADR

| # | falsifica | comando/técnica | CALA | MORDE |
|---|---|---|---|---|
| **G1** | envelope real vira view-model | `fetchIngestHealthProjectionViaHttp` contra servidor real → `buildS1ViewModelFromIngestHealthProjection` | retorna `S1ViewModel` com `rows.length` igual ao número de `(source,endpoint)` distintos do fixture | servidor fora do ar → `fetch` rejeita, a `Promise` reprova, nunca um view-model vazio silencioso |
| **G2** = `F-D6-1` | `D6.2`/`DoD-2` | ver D5, positivo + negativo (reordenação) | fingerprints iguais sem mutação | fingerprints diferentes com mutação, e a comparação lança |
| **G3** = `F-D6-2` | `D6.3` | ver D5, campo em `runs[]` × campo no envelope | campo no envelope não move nenhum dos dois hashes | campo em `runs[]` move o hash do lado mutado, e só esse lado |
| **G4** | `D4` (URL não literal) | `harness rules --mode file --path frontend/src/features/s1-console/ingest-health-query.ts` | `web-fullstack.hardcoded-url` não dispara | uma string `"https://…"` literal introduzida no módulo dispara `[AVISO]` — reprova a revisão |

## Consequência

- `frontend/src/features/s1-console/ingest-health-query.ts`: **-47** linhas (`SectionMarker`/
  `isHeaderLine`/`parseCanonicalProjection`), **-52** linhas aprox. (`fetchIngestHealthProjectionViaCli`/
  `IngestHealthQueryResult`), **+~70-90** linhas (`assertIngestHealthRunRow`/`assertIngestHealthGapRow`/
  `parseIngestHealthEnvelope`/`fetchIngestHealthProjectionViaHttp`/os dois `interface`s) — número
  aproximado, o `wc -l` real depois do `/build` é quem decide, não esta ADR.
- `frontend/src/features/s1-console/ingest-health-query.test.ts`: perde os testes que só existiam
  para `fetchIngestHealthProjectionViaCli` (a checagem de `sha256` CLI×TS, a de 15/8 colunas via
  CLI, `janela_de_perda`, `collectorRowsFromIngestHealthProjection` via CLI) — migram para o arquivo
  novo, sobre a rota. Ficam: os dois testes de `DoD-3` que usam só `runIngestHealthCli`, e os dois
  testes de `fingerprint` que já eram fixture pura (sem CLI nenhum).
- `T-05.15` mede de novo antes de agir — o baseline de "162/500" que a task cita foi tirado ANTES de
  `T-05.14` rodar; esta ADR não o reescreve, só avisa que `wc -l`/`grep` em `T-05.15` vão achar um
  número diferente do citado, e isso é esperado, não um defeito desta ADR.
- Wiring em `painel/page.tsx`/`S1Console.tsx` **fica fora do DoD desta task** — os `refs` de
  `T-05.14` não citam a página, só o módulo de transporte. Fica registrado como trabalho aberto,
  com a restrição de `D4` (`"use client"` nunca) valendo para quem o fizer.
