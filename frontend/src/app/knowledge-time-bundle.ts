/**
 * `T-05.8` — the URL/state contract for the operational chrome: `knowledge_time` na URL, o
 * bundle É a URL (nao um CRUD), e `COMO EM T` sobrevive a navegacao ate o operador voltar
 * explicitamente para `AO VIVO`.
 *
 * Fontes que fixam o contrato, nesta ordem:
 *   - `docs/specs/SPEC-001-plataforma-dados.md` §7 —
 *     `reproduzir(run) = (bundle_hash, window, knowledge_time)`, e "o bundle de parametros e
 *     versionado e hasheavel, e ele E a URL — nao um CRUD. Gerenciador de presets e produto
 *     prematuro e non-goal."
 *   - `docs/product/STITCH_CONTEXT.md` §7 — `D1` (`AO VIVO`/`COMO EM T` sao modos de primeira
 *     classe no chrome), `D2` (voltar para `AGORA` tem sintoma visivel; sem sintoma, reprova),
 *     `D7` (o bundle e a URL).
 *   - `docs/plans/SPEC-001-plataforma-dados/05_fatia_visivel.md`, item 5.6 e `DoD D5.4`:
 *     "`COMO EM T` sobrevive a navegacao" com teste negativo obrigatorio — voltar para `AGORA`
 *     sem sintoma visivel reprova.
 *
 * Escopo, e por que ele para aqui: este modulo e o `ui-designer` concordam que o que falta
 * nesta task e contrato de ESTADO/URL, nao pixel (`docs/context/plataforma-dados/gates/
 * T-05.8-design.md`) — a `S2` canonica ja materializa o sintoma visivel (par fill+borda
 * migrando entre os dois `<span>` do chrome) para QUALQUER campo que discrimine os dois
 * modos. O que este modulo garante e que esse campo (`mode`) SEMPRE discrimina: voltar para
 * `live` e uma impossibilidade DE TIPO de continuar carregando `knowledgeTime`, nao uma
 * convencao que uma edicao futura poderia quebrar em silencio.
 */

/** `live` = `AO VIVO` (sem `knowledge_time`, o horizonte de leitura e "agora"). */
/** `as_of` = `COMO EM T` (horizonte travado em `knowledgeTime`). */
export type Mode = "live" | "as_of";

/** A janela de tempo sob observacao. Os dois limites sao instantes ISO 8601 em UTC. */
export interface Window {
  readonly from: string;
  readonly to: string;
}

/**
 * `AO VIVO`. Por construcao de TIPO esta forma nao tem campo para carregar
 * `knowledgeTime` — nao e um valor omitido, e um campo que nao existe.
 */
export interface LiveBundle {
  readonly mode: "live";
  readonly symbol: string;
  readonly window: Window;
}

/**
 * `COMO EM T`. `knowledgeTime` e OBRIGATORIO aqui, nao opcional — o terceiro termo de
 * `reproduzir(run) = (bundle_hash, window, knowledge_time)` nunca esta ausente neste modo.
 */
export interface AsOfBundle {
  readonly mode: "as_of";
  readonly symbol: string;
  readonly window: Window;
  readonly knowledgeTime: string;
}

/** O bundle inteiro — e ele que a URL carrega, ponto a ponto, sem persistencia paralela. */
export type Bundle = LiveBundle | AsOfBundle;

/** Ordem canonica dos parametros de query — estavel, para que o mesmo bundle produza sempre
 * a mesma string de URL (pre-requisito para comparar/hashear URLs no futuro sem surpresa de
 * ordenacao de `Map`). */
const PARAM_ORDER = ["symbol", "from", "to", "mode", "t"] as const;

function assertIsoInstant(value: string, field: string): void {
  if (value === "" || Number.isNaN(Date.parse(value))) {
    throw new Error(`bundle invalido: campo "${field}" nao e um instante ISO 8601: "${value}"`);
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim() === "") {
    throw new Error(`bundle invalido: campo "${field}" nao pode ser vazio`);
  }
}

/**
 * Valida um `Bundle` antes de ele virar URL. Reprova em vez de aceitar um estado ambiguo —
 * um `symbol` vazio ou uma janela invertida NUNCA deveriam materializar-se numa URL
 * compartilhavel, e falhar aqui e mais barato que falhar na leitura do lado do servidor.
 */
export function assertValidBundle(bundle: Bundle): void {
  assertNonEmpty(bundle.symbol, "symbol");
  assertIsoInstant(bundle.window.from, "window.from");
  assertIsoInstant(bundle.window.to, "window.to");
  if (Date.parse(bundle.window.from) >= Date.parse(bundle.window.to)) {
    throw new Error(
      `bundle invalido: window.from (${bundle.window.from}) nao e anterior a window.to (${bundle.window.to})`,
    );
  }
  if (bundle.mode === "as_of") {
    assertIsoInstant(bundle.knowledgeTime, "knowledgeTime");
  }
}

/**
 * O bundle vira parametros de URL, campo a campo — nao um blob serializado, para que a URL
 * continue legivel e linkavel por um humano (`D7`: "o bundle e a URL").
 */
export function encodeBundle(bundle: Bundle): URLSearchParams {
  assertValidBundle(bundle);
  const raw: Record<(typeof PARAM_ORDER)[number], string | undefined> = {
    symbol: bundle.symbol,
    from: bundle.window.from,
    to: bundle.window.to,
    mode: bundle.mode,
    t: bundle.mode === "as_of" ? bundle.knowledgeTime : undefined,
  };
  const params = new URLSearchParams();
  for (const key of PARAM_ORDER) {
    const value = raw[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  return params;
}

/**
 * O inverso de `encodeBundle` — e ele quem faz valer `D2`. Uma URL que declara `mode=live`
 * mas ainda carrega `t` NAO decodifica em silencio para um `LiveBundle` com o campo
 * descartado: ela e RECUSADA, porque esse e exatamente o bug que `D5.4` proibe (voltar para
 * `AGORA` sem sintoma visivel) — se o parametro sobreviveu na URL, o sintoma nao aconteceu.
 */
export function decodeBundle(params: URLSearchParams): Bundle {
  const symbol = params.get("symbol");
  const from = params.get("from");
  const to = params.get("to");
  const mode = params.get("mode");
  const knowledgeTime = params.get("t");

  if (symbol === null) throw new Error('bundle invalido: parametro "symbol" ausente na URL');
  if (from === null) throw new Error('bundle invalido: parametro "from" ausente na URL');
  if (to === null) throw new Error('bundle invalido: parametro "to" ausente na URL');
  if (mode !== "live" && mode !== "as_of") {
    throw new Error(`bundle invalido: parametro "mode" tem de ser "live" ou "as_of", recebi ${JSON.stringify(mode)}`);
  }

  if (mode === "live") {
    if (knowledgeTime !== null) {
      throw new Error(
        'bundle invalido: mode="live" mas o parametro "t" (knowledge_time) ainda esta na URL — ' +
          "isto e o retrocesso silencioso que D5.4 proibe: voltar para AO VIVO tem de apagar " +
          "knowledge_time, nunca carrega-lo escondido.",
      );
    }
    const bundle: LiveBundle = { mode: "live", symbol, window: { from, to } };
    assertValidBundle(bundle);
    return bundle;
  }

  if (knowledgeTime === null) {
    throw new Error('bundle invalido: mode="as_of" exige o parametro "t" (knowledge_time), e ele esta ausente');
  }
  const bundle: AsOfBundle = { mode: "as_of", symbol, window: { from, to }, knowledgeTime };
  assertValidBundle(bundle);
  return bundle;
}

/** `bundleUrl`/`parseBundleFromUrl` fecham o laco: o bundle so existe como URL, nunca como
 * registro persistido a parte — e a metade positiva de `D7` ("nao um CRUD"). */
export function bundleUrl(base: URL | string, bundle: Bundle): URL {
  const url = new URL(base);
  url.search = encodeBundle(bundle).toString();
  return url;
}

export function parseBundleFromUrl(url: URL | string): Bundle {
  const parsed = typeof url === "string" ? new URL(url) : url;
  return decodeBundle(parsed.searchParams);
}

/**
 * O mecanismo que faz `COMO EM T` sobreviver a navegacao (`D5.4`, caso positivo): toda
 * navegacao que so muda simbolo/janela passa pelo bundle CORRENTE, nunca por um estado
 * default — `mode` e (quando `as_of`) `knowledgeTime` atravessam intactos porque o
 * discriminated union nao da como enganar o compilador construindo um `LiveBundle` com
 * `knowledgeTime` sobrando, nem um `AsOfBundle` sem ele.
 */
export function navigate(bundle: Bundle, changes: { symbol?: string; window?: Window }): Bundle {
  const symbol = changes.symbol ?? bundle.symbol;
  const window = changes.window ?? bundle.window;
  if (bundle.mode === "live") {
    return { mode: "live", symbol, window };
  }
  return { mode: "as_of", symbol, window, knowledgeTime: bundle.knowledgeTime };
}

/** Entra em `COMO EM T`, travando o horizonte de leitura no instante dado. */
export function withKnowledgeTime(bundle: Bundle, knowledgeTime: string): AsOfBundle {
  const next: AsOfBundle = { mode: "as_of", symbol: bundle.symbol, window: bundle.window, knowledgeTime };
  assertValidBundle(next);
  return next;
}

/**
 * A transicao que `D2` exige ter sintoma visivel: volta para `AO VIVO`. A construcao e
 * EXPLICITA (nao um spread do bundle anterior) precisamente para que `knowledgeTime` nao
 * tenha como sobreviver por acidente — o proprio tipo de retorno (`LiveBundle`) nao tem
 * onde guarda-lo.
 */
export function returnToLive(bundle: Bundle): LiveBundle {
  return { mode: "live", symbol: bundle.symbol, window: bundle.window };
}
