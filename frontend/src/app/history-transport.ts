/**
 * `T-05.9` — the web side of `ADR-005/D1`'s **historical** route (item 5.12 of plan `05`,
 * `DoD D5.8`): "Transporte HTTP endereçável por conteúdo para o histórico. Nenhum tick chega
 * ao browser."
 *
 * `ADR-005/D1` already decided the FORM of the transport — this module does not invent one:
 *
 *   | classe    | transporte | chave |
 *   |-----------|------------|-------|
 *   | histórico | HTTP, resposta endereçável por conteúdo | `(series_key_id, symbol,
 *     interval, janela, knowledge_time, bar_policy)` |
 *
 * `docs/adr/ADR-005-transporte-de-leitura.md` §D1: "é imutável por construção: `knowledge_time`
 * fixo ⇒ a resposta é cacheável para sempre, e o cache É o `knowledge_time`." §D4:
 * "`bar_policy` é declarado pelo CONSUMIDOR, na requisição… `intrabar` nunca é default."
 * §Falsificador: "se qualquer payload de transporte contiver campo de nível de tick (`agg_id`,
 * `price` por trade, `quantity` por trade), esta ADR está violada."
 *
 * Fronteira desta task, e por que ela para aqui: NÃO cria servidor/endpoint algum —
 * `find backend -iname '*server*' -o -iname '*api*' -o -iname '*route*'` (2026-09-02) não
 * lista nenhum framework HTTP no backend (nenhum `fastapi`/`flask`/`uvicorn` em
 * `backend/pyproject.toml`), e criar um estaria fora do que `docs/context/plataforma-dados/
 * handoff/T-05.9.md` autoriza. O que existe hoje, e que esta task consome, é o CONTRATO —
 * `ADR-005/D1` (a forma) e `backend/src/modules/sentimento/domain/as_of_accessor.py` (o
 * vocabulário: `BarPolicy`, `knowledge_time`, `bar_policy` "nunca é default", linhas 54-70 e
 * 213-224). Este módulo fecha o lado `web`: a chave de requisição endereçável por conteúdo, e
 * os dois portões que tornam o falsificador da ADR EXECUTÁVEL no browser — zero campo de
 * nível de tick, e taxa nunca mais fina que o intervalo pedido — sobre QUALQUER payload que
 * uma rota futura venha a servir, sem assumir um schema de resposta que nenhuma ADR fixou
 * ainda (o içamento de D3 é payload de `charts`, fora deste componente).
 *
 * Mesmo padrão de `T-05.8` (`./knowledge-time-bundle.ts`): módulo TypeScript puro em
 * `src/app/`, sem tela, testado com `node --test`, sem chamada de rede real em teste.
 *
 * `T-01.5` (`pagina-de-grafico-s2`) — CORREÇÃO: este módulo nasceu (`T-05.9`) ANTES de
 * `ADR-034` fixar o wire real de `GET {API_PREFIX}/series-history` (`T-01.3`), e chutou
 * `camelCase`/ISO-8601 (`seriesKeyId`, `window: {from, to}`, `knowledgeTime`). A rota real
 * (`backend/src/api/routes/series_history.py`) serve `snake_case`/epoch-ms:
 * `series_key_id`, `symbol`, `interval`, `window_start_ms`, `window_end_ms`,
 * `knowledge_time_ms`, `bar_policy` — sem nível `window` aninhado, sem `Window` de
 * `knowledge-time-bundle.ts`. Esta correção troca a forma da CHAVE para a forma REAL; os dois
 * portões do falsificador (`assertNoTickLevelFields`/`assertBucketSpacingWithinInterval`) e o
 * cache endereçável por conteúdo continuam agnósticos de schema, logo intactos.
 */

/**
 * Mirror de `BarPolicy` (`as_of_accessor.py:54-70`) — os dois valores, verbatim. Este módulo
 * não decide admissão de bucket (isso é do accessor); ele só carrega a política declarada
 * através da fronteira requisição/resposta.
 */
export type BarPolicy = "final_only" | "intrabar";

/**
 * Mirror de `Absence` (`provenance.py:97-114`) — o conjunto fechado de quatro razões, verbatim
 * na grafia do domínio (`SPEC-001` §3.1 já fixa os valores em português; traduzir aqui criaria
 * uma segunda vocabulário para a mesma coisa).
 */
export type Absence = "SEM_PONTO" | "NAO_LIDO" | "QUARENTENA" | "SEM_FONTE";

/**
 * A chave endereçável por conteúdo do `ADR-005/D1`, sete termos, nesta ordem canônica —
 * estável, para que a mesma chave produza sempre a mesma URL/endereço de cache. Nomes e tipos
 * são os REAIS de `GET {API_PREFIX}/series-history` (`ADR-034`, `backend/src/api/routes/
 * series_history.py`) — `snake_case`, epoch-ms, sem nível `window` aninhado.
 */
export interface HistoryRequestKey {
  readonly series_key_id: string;
  readonly symbol: string;
  /** O rótulo nativo da grade, na grafia da fonte (`"1m"`, `"5m"`…) — nunca parseado aqui;
   * a grade canônica é dona de `charts` (`T-05.1`, item 5.2 do plano `05`). */
  readonly interval: string;
  /** Início da janela, epoch milissegundos (inclusive). */
  readonly window_start_ms: number;
  /** Fim da janela, epoch milissegundos (inclusive) — `window_start_ms === window_end_ms` é
   * uma janela válida de um único instante (`ADR-034/D9`, `use_cases/series_history.py`). */
  readonly window_end_ms: number;
  /** Epoch milissegundos, fixo. É este campo que faz a resposta imutável — `D1`. */
  readonly knowledge_time_ms: number;
  /** OBRIGATÓRIO, sem valor default em função nenhuma deste módulo — `D4`. */
  readonly bar_policy: BarPolicy;
}

const PARAM_ORDER = [
  "series_key_id",
  "symbol",
  "interval",
  "window_start_ms",
  "window_end_ms",
  "knowledge_time_ms",
  "bar_policy",
] as const;

function assertNonEmpty(value: string, field: string): void {
  if (value.trim() === "") {
    throw new Error(`chave de historico invalida: campo "${field}" nao pode ser vazio`);
  }
}

function assertEpochMs(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `chave de historico invalida: campo "${field}" tem de ser um epoch-ms inteiro nao negativo, recebi ${value}`,
    );
  }
}

function assertBarPolicyValue(value: string): asserts value is BarPolicy {
  if (value !== "final_only" && value !== "intrabar") {
    throw new Error(
      `chave de historico invalida: "bar_policy" tem de ser "final_only" ou "intrabar" ` +
        `(ADR-005/D4: declarado pelo consumidor, nunca default), recebi ${JSON.stringify(value)}`,
    );
  }
}

/**
 * Valida uma `HistoryRequestKey` antes de ela virar URL/endereço de cache. Reprova em vez de
 * aceitar um estado ambíguo: falhar aqui é mais barato que falhar do lado do servidor (`422`).
 */
export function assertValidHistoryRequestKey(key: HistoryRequestKey): void {
  assertNonEmpty(key.series_key_id, "series_key_id");
  assertNonEmpty(key.symbol, "symbol");
  assertNonEmpty(key.interval, "interval");
  assertEpochMs(key.window_start_ms, "window_start_ms");
  assertEpochMs(key.window_end_ms, "window_end_ms");
  if (key.window_start_ms > key.window_end_ms) {
    throw new Error(
      `chave de historico invalida: window_start_ms (${key.window_start_ms}) nao pode ser ` +
        `posterior a window_end_ms (${key.window_end_ms})`,
    );
  }
  assertEpochMs(key.knowledge_time_ms, "knowledge_time_ms");
  assertBarPolicyValue(key.bar_policy);
}

/**
 * A chave vira parâmetros de URL, campo a campo — legível e linkável, não um blob serializado.
 */
export function encodeHistoryRequest(key: HistoryRequestKey): URLSearchParams {
  assertValidHistoryRequestKey(key);
  const raw: Record<(typeof PARAM_ORDER)[number], string> = {
    series_key_id: key.series_key_id,
    symbol: key.symbol,
    interval: key.interval,
    window_start_ms: String(key.window_start_ms),
    window_end_ms: String(key.window_end_ms),
    knowledge_time_ms: String(key.knowledge_time_ms),
    bar_policy: key.bar_policy,
  };
  const params = new URLSearchParams();
  for (const field of PARAM_ORDER) {
    params.set(field, raw[field]);
  }
  return params;
}

function parseEpochMs(raw: string, field: string): number {
  const value = Number(raw);
  assertEpochMs(value, field);
  return value;
}

/**
 * O inverso de `encodeHistoryRequest`. `bar_policy` é lido e validado sem NENHUM fallback — se
 * o parâmetro estiver ausente ou fora do conjunto fechado, a leitura é RECUSADA, nunca
 * silenciosamente default para `final_only`. Essa recusa é o mecanismo de `D4` do lado do
 * cliente: "intrabar nunca é default" só vale se "nenhum valor" também nunca vira default.
 */
export function decodeHistoryRequest(params: URLSearchParams): HistoryRequestKey {
  const seriesKeyId = params.get("series_key_id");
  const symbol = params.get("symbol");
  const interval = params.get("interval");
  const windowStartMs = params.get("window_start_ms");
  const windowEndMs = params.get("window_end_ms");
  const knowledgeTimeMs = params.get("knowledge_time_ms");
  const barPolicy = params.get("bar_policy");

  if (seriesKeyId === null) throw new Error('chave de historico invalida: parametro "series_key_id" ausente');
  if (symbol === null) throw new Error('chave de historico invalida: parametro "symbol" ausente');
  if (interval === null) throw new Error('chave de historico invalida: parametro "interval" ausente');
  if (windowStartMs === null) throw new Error('chave de historico invalida: parametro "window_start_ms" ausente');
  if (windowEndMs === null) throw new Error('chave de historico invalida: parametro "window_end_ms" ausente');
  if (knowledgeTimeMs === null) {
    throw new Error('chave de historico invalida: parametro "knowledge_time_ms" ausente');
  }
  if (barPolicy === null) {
    throw new Error(
      'chave de historico invalida: parametro "bar_policy" ausente — ADR-005/D4 exige que seja ' +
        "declarado pelo consumidor; este modulo nao assume final_only nem nenhum outro default",
    );
  }
  assertBarPolicyValue(barPolicy);

  const key: HistoryRequestKey = {
    series_key_id: seriesKeyId,
    symbol,
    interval,
    window_start_ms: parseEpochMs(windowStartMs, "window_start_ms"),
    window_end_ms: parseEpochMs(windowEndMs, "window_end_ms"),
    knowledge_time_ms: parseEpochMs(knowledgeTimeMs, "knowledge_time_ms"),
    bar_policy: barPolicy,
  };
  assertValidHistoryRequestKey(key);
  return key;
}

/** A URL completa — `base` + os parâmetros canônicos. */
export function historyRequestUrl(base: URL | string, key: HistoryRequestKey): URL {
  const url = new URL(base);
  url.search = encodeHistoryRequest(key).toString();
  return url;
}

/**
 * O endereço de conteúdo canônico — a string estável que `D1` chama de cache. "O cache É o
 * `knowledge_time`": como a chave inteira (incluindo `knowledge_time_ms`) participa do
 * endereço, duas requisições com a MESMA chave produzem sempre o MESMO endereço, e uma
 * requisição com `knowledge_time_ms` diferente (mesmo que só isso mude) produz um endereço
 * diferente — nunca
 * colide com uma janela de conhecimento distinta.
 */
export function contentAddress(key: HistoryRequestKey): string {
  return encodeHistoryRequest(key).toString();
}

/**
 * O cache endereçável por conteúdo do lado do cliente — a metade positiva de `D1`: uma
 * resposta histórica NUNCA muda para a mesma chave, então nunca precisa ser refeita nem
 * revalidada.
 *
 * `set` RECUSA sobrescrever uma entrada existente com um payload BYTE-A-BYTE diferente — não
 * por paranoia de performance, mas porque isso seria a prova de que a premissa de `D1`
 * ("imutável por construção") quebrou: se o mesmo `(series_key_id, symbol, interval, janela,
 * knowledge_time, bar_policy)` produziu duas respostas diferentes, ou a chave está incompleta
 * (falta um termo que deveria discriminar) ou o servidor não é determinístico — e nenhum dos
 * dois deveria ser engolido em silêncio por um `Map.set` comum.
 */
export class HistoryResponseCache<TPayload> {
  private readonly entries = new Map<string, TPayload>();

  get(key: HistoryRequestKey): TPayload | undefined {
    return this.entries.get(contentAddress(key));
  }

  has(key: HistoryRequestKey): boolean {
    return this.entries.has(contentAddress(key));
  }

  set(key: HistoryRequestKey, payload: TPayload): void {
    const address = contentAddress(key);
    const existing = this.entries.get(address);
    if (existing !== undefined) {
      const same = JSON.stringify(existing) === JSON.stringify(payload);
      if (!same) {
        throw new Error(
          `cache endereçavel por conteudo violado: o endereco "${address}" ja tinha uma ` +
            "resposta diferente. ADR-005/D1 declara a resposta historica imutavel por " +
            "construcao — duas respostas distintas para a MESMA chave sao a evidencia de que " +
            "essa premissa quebrou, e um Map comum engoliria a segunda em silencio",
        );
      }
      return;
    }
    this.entries.set(address, payload);
  }
}

// ── Os dois portões do falsificador de ADR-005 ("nenhum tick chega ao browser") ────────────

/**
 * O conjunto de nomes de campo de nível de tick, transcrito do falsificador da ADR
 * (`agg_id`, `price` por trade, `quantity` por trade) e do CABEÇALHO REAL do dump
 * (`data/binance/aggtrades/*.csv`: `agg_trade_id,price,quantity,first_trade_id,last_trade_id,
 * transact_time,is_buyer_maker`) mais o vocabulário do domínio
 * (`backend/src/modules/sentimento/domain/aggtrade_contiguity.py:34`, campo `agg_id`). Nenhum
 * destes nomes tem uso legítimo em um envelope de bucket — `ADR-005/D2` usa `last_price` e
 * `n_trades`, compostos, nunca os nomes crus de uma linha de tick.
 */
export const TICK_LEVEL_FIELD_NAMES: ReadonlySet<string> = new Set([
  "agg_id",
  "agg_trade_id",
  "price",
  "quantity",
  "first_trade_id",
  "last_trade_id",
  "transact_time",
  "is_buyer_maker",
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Percorre QUALQUER payload JSON decodificado e RECUSA (lança) no instante em que encontra um
 * campo de nível de tick em qualquer profundidade — a metade "zero campo de nível de tick" do
 * `DoD D5.8`. Deliberadamente agnóstico de schema: nenhuma ADR fixou ainda a forma exata da
 * resposta histórica (o içamento de `D3` é payload de `charts`), então o portão que protege o
 * transporte não pode depender de conhecer os nomes dos campos legítimos — só dos proibidos.
 */
export function assertNoTickLevelFields(payload: unknown, path = "$"): void {
  if (Array.isArray(payload)) {
    payload.forEach((item, index) => assertNoTickLevelFields(item, `${path}[${index}]`));
    return;
  }
  if (isPlainRecord(payload)) {
    for (const [field, value] of Object.entries(payload)) {
      if (TICK_LEVEL_FIELD_NAMES.has(field)) {
        throw new Error(
          `ADR-005 violada: campo de nivel de tick "${field}" encontrado em ${path}.${field} — ` +
            "nenhum tick chega ao browser (falsificador da ADR, DoD D5.8)",
        );
      }
      assertNoTickLevelFields(value, `${path}.${field}`);
    }
  }
}

/**
 * A metade "taxa" do `DoD D5.8`: `taxa ≤ max(1 Hz, 1/TF) por série`. Para o transporte
 * histórico (uma resposta, não um fluxo), a forma observável do mesmo invariante é de
 * ESPAÇAMENTO — nenhum bucket devolvido pode estar mais perto do vizinho do que o intervalo
 * pedido permite, porque um espaçamento mais fino É a definição de tick chegando disfarçado
 * de bucket extra.
 *
 * `timestampsIso` tem de estar em ORDEM não decrescente (a mesma pré-condição que
 * `detect_agg_id_gaps`/`detect_gaps` do backend já exigem de suas sequências — ordenar aqui
 * esconderia uma resposta fora de ordem em vez de recusá-la).
 */
export function assertBucketSpacingWithinInterval(timestampsIso: readonly string[], intervalMs: number): void {
  if (intervalMs <= 0) {
    throw new Error(`assertBucketSpacingWithinInterval: intervalMs tem de ser positivo, recebi ${intervalMs}`);
  }
  for (let i = 1; i < timestampsIso.length; i += 1) {
    const previous = Date.parse(timestampsIso[i - 1]!);
    const current = Date.parse(timestampsIso[i]!);
    if (Number.isNaN(previous) || Number.isNaN(current)) {
      throw new Error(
        `assertBucketSpacingWithinInterval: timestamp invalido no par [${i - 1}, ${i}]: ` +
          `"${timestampsIso[i - 1]}", "${timestampsIso[i]}"`,
      );
    }
    if (current < previous) {
      throw new Error(
        `assertBucketSpacingWithinInterval: sequencia fora de ordem em [${i - 1}, ${i}]: ` +
          `"${timestampsIso[i - 1]}" depois "${timestampsIso[i]}"`,
      );
    }
    const spacing = current - previous;
    if (spacing > 0 && spacing < intervalMs) {
      throw new Error(
        `ADR-005 violada: espacamento de ${spacing}ms entre buckets [${i - 1}, ${i}] e mais ` +
          `fino que o intervalo pedido (${intervalMs}ms) — taxa acima de max(1 Hz, 1/TF), ` +
          "sintoma de tick chegando disfarcado de bucket (falsificador da ADR, DoD D5.8)",
      );
    }
  }
}
