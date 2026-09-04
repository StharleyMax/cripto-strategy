# ADR-024 — `S4` honestidade de leitura: idade nunca fora da borda direita (ausente por tipo, não por `null`), `denom` verbatim com sentinela de `sentimento`, seleção que nunca lê o próprio resultado, e retrospectividade como contrato de assinatura

**Status:** `proposto` · **Data:** 2026-09-04 · **Componente:** `charts` (motor Python, `backend/src/modules/charts/`) — fronteira com `sentimento` (dono do `available_at`/`as_of`/catálogo) e com `web`/`infra` (fora de escopo, ver "Não fecha")
**Feature:** `plataforma-dados` (`T-08.13`, `CST-81`) · **Autor:** `quant-architect`
**Rev de ancoragem:** worktree `tasks/T-08.13-honestidade-leitura-s4`, base `master`/`fe8a466` — `T-08.6` (`ADR-020`) e `T-08.7` (`ADR-022`) já mergeados. `find backend/src/modules/charts -name '*.py'` lista `field_identity.py`, `histogram_recipe.py`, `histogram.py`, `observation.py`, `scan.py`, `threshold_spec.py`, `firing_rate.py`, `compute_distribution.py`, `run_scan.py`, `compute_firing_rate.py`.
**Mandato citado no despacho:** honestidade de leitura para a bancada `S4` — idade só na borda direita do tempo, `denom` nunca inventado, zero seleção como informação (não como filtro invisível), `S4` declarada retrospectiva enquanto a rampa de cota (`T-07.7`) não sustenta varredura ao vivo.

**⚠️ COLISÃO DE NUMERAÇÃO CONHECIDA:** a worktree paralela `tasks/T-08.8-firing-rate-oos-walk-forward` tem, não commitado, um `docs/adr/ADR-022-firing-rate-walk-forward-particao-de-janelas-e-tipo-oos.md` — escrito antes de `ADR-022` (min-obs, `T-08.7`) ser mergeado em `master`. Quando `T-08.8` sincronizar com `master`, aquele arquivo colide com o `ADR-022` já existente e **também** teria colidido com este `ADR-024` se `T-08.8` tivesse pousado em `023` primeiro. Nenhuma reserva de número existe neste repositório além de "o mais alto em `origin/master` no momento" — quem mergear por último renumera. Registrado aqui para o merge de `T-08.8` não descobrir isso sozinho.

**Fecha:** os quatro pontos do título, formalizados no TIPO onde possível (não em prosa de UI): (1) o que "idade só na borda direita" proíbe estruturalmente nos tipos de `charts/domain`; (2) que o invariante de ordem de `ADR-006/D4` é REUSADO do `sentimento`, nunca reimplementado em `charts`; (3) que `denom` é sempre verbatim, com o sentinela de multiplicador não resolvido vivendo em `sentimento`, nunca inferido em `charts`; (4) a barreira estrutural contra seleção que lê o próprio resultado, generalizando o isolamento que `ADR-022/D4` já construiu para `z_dispersion`; (5) que `S4` é retrospectiva por ASSINATURA de função, não por texto de tela.
**Não fecha:** a rota HTTP (`infra`, `T-01.8` sem juiz — `harness.toml:76-84`); o texto exato do chip de idade/legenda `[NÃO SUSTENTADO hoje]` na tela (`web`, `[NÃO SEI: task ainda não nomeada — nenhuma task web da fase 08 cobre hoje; só T-08.5 e T-08.11 são web nesta fase, e nenhuma das duas trata chip de idade; a rota HTTP também segue sem task, T-01.8 sem juiz]`); a query SQL do adaptador `ObservationSource` (continua "do builder de uma task futura", herdado de `ADR-020/D7`); a curadoria em si da tabela de multiplicador com `evidence_url` (é `sentimento`, sem task nomeada hoje — ver D3); a regra de `firing_rate` walk-forward (`T-08.8`, `D8.2` — tipo já fechado por `ADR-020/D5`, não reaberto aqui).

---

## Contexto

### O que já existe e este ADR reusa — a maior parte do trabalho pesado já está feita, uma camada abaixo

- **O invariante de ordem `limiar_atraso <= asof_max_staleness_ms` (`ADR-006/D4`) já está implementado**, por série, em `backend/src/modules/sentimento/domain/as_of_accessor.py:343-369` (`reject_delay_threshold_above_staleness`) — a mensagem de erro cita os dois números DA série (`series_key_id`, `delay_threshold_ms`, `asof_ms`), nunca uma constante global, exatamente como `D8.16` exige. **`charts` não tem hoje, e não deve ganhar, uma segunda implementação deste invariante.**
- **`AsOfReading.age_ms` (`as_of_accessor.py:225,326`) já é `t - winner.row.bucket_end`** — tempo de referência menos o ponto, nunca `now() - available_at` (o módulo não lê relógio: `Window`/`t`/`knowledge_time` chegam como parâmetro em todo lugar deste corpus, a mesma disciplina que `firing_rate.py:31-35` documenta para `charts`). Isto já é literalmente `SPEC-001` §6.1: `idade = tempo_de_referência − available_at`, "nunca `now − available_at`".
- **Nenhum tipo de `charts/domain` carrega `age_ms`/idade hoje** — `grep -rn "age_ms\|idade" backend/src/modules/charts/` devolve **zero linhas de código** (uma única linha de docstring citando "elegibilidade", sem relação) `[MEDIDO 2026-09-04]`. `Observation`, `Fired`, `NotFired`, `Insufficient`, `Bin`, `PointMass`, `Overflow`, `HistogramResult`, `ScanResult` — nenhum tem o campo.
- **`ObservationSource.observed_values` (`compute_distribution.py:51-63`) não recebe `spec`/`ThresholdSpec`** — a assinatura é `(field, nature, universe, window, knowledge_time_ms)`. A população lida não pode depender do limiar que será avaliado sobre ela, porque o limiar não é um argumento da leitura `[MEDIDO 2026-09-04, leitura direta da assinatura]`.
- **`ADR-022/D4` já isola telemetria de decisão**: nenhuma função de `scan.py` (`_fires`, `_compare`, `_robust_z`, `evaluate_scan`) aceita `ZDispersionTelemetry`/`ScanResult` como entrada — não há import circular possível. Este ADR generaliza esse mesmo isolamento para o motor inteiro (D4 abaixo), não inventa um mecanismo novo.
- **`FieldIdentity` já é `(metric, unit, denom)` frozen/hashable (`ADR-020/D1`)** — dois `denom` diferentes são, por construção de `__eq__`/`__hash__` gerados pelo `@dataclass(frozen=True)`, duas chaves diferentes. `field_identity.py` não tem nenhuma função que derive `denom` de outra coisa — só `__post_init__` recusando termo em branco.

### Os quatro pontos do despacho, com o comando/medição que cada um tem que responder

| ponto | medição que fixa o problema | por que é decisão de arquitetura, não de UI |
|---|---|---|
| idade só na borda direita | `SPEC-001` §6.1: "um gráfico de 3 dias tem zero carimbos de idade, e isso está certo"; `plataforma-superficies-e-faseamento.md:141` idem | se "idade" fosse um campo opcional em todo tipo de linha/bin, a disciplina de preenchê-lo só na borda vira convenção de quem escreve o adaptador — a mesma classe de risco que `ADR-022` já recusou para `low_confidence` (alternativa recusada: "carrega o valor mesmo assim, com uma flag") |
| `denom` verbatim | `D8.18`/`CA-F4-21`: 20 símbolos com `baseAsset` `^\d`, **zero campo de multiplicador no `exchangeInfo`**, regex de prefixo erra `1MBABYDOGEUSDT` por 10⁶ | se `charts` alguma vez tentasse inferir `denom` de `baseAsset`, reproduziria o MESMO defeito que `D8.6` já mediu uma camada acima (bordas fixas por metric quebram porque a escala varia) — só que na identidade do campo, não nas bordas |
| zero seleção é informação | `D8.20`: "nenhum nudge para baixar o limiar"; `ADR-022`, alternativa recusada: "usar `z_dispersion` para vetar automaticamente o `scan`" é "overfitting de segunda ordem" | é a MESMA classe de vazamento que lookahead — filtrar a entrada pelo resultado que está sendo medido é olhar à frente no espaço dos parâmetros em vez do tempo, mas o mecanismo de defesa é o mesmo: a assinatura da função não pode aceitar o que ela ainda não devolveu |
| `S4` retrospectiva | `D8.17`: `[NÃO SUSTENTADO hoje]`, 570×5 séries = 2,85–14,25 min/varredura, rampa de `T-07.7` ainda não resolve o balde | uma tela que diz "retrospectivo" enquanto o código por baixo aceita `end_ms = None`/"até agora" é a mesma classe de defeito que `ADR-005/D2` já nomeou para `intrabar`: "o servidor não infere de 'é a borda direita'" — a garantia tem que estar na assinatura, não na prosa da tela |

---

## Decisão

### D1 — Idade nunca é campo de tipo pooled/agregado; só existiria num tipo estreito de "leitura corrente", que `S4` não tem hoje

Nenhum tipo que representa uma população (`Observation`, `Fired`, `NotFired`, `Insufficient`, `Bin`,
`PointMass`, `Overflow`) ou um agregado sobre janela (`HistogramResult`, `ScanResult`,
`FiringRateResult`) ganha um campo `age_ms`/idade — **nem opcional, nem `None`-por-padrão**. A ausência
é por **omissão do campo**, o mesmo idioma que `ADR-022/D5` já usa para `HistogramRecipe` nunca ganhar
`min_obs`: um `Bin.count` é uma contagem sobre TODO um `window`, e "há quanto tempo" não tem resposta
única para uma contagem que somou pontos de dias diferentes — a pergunta só faz sentido para **o único
ponto de um instrumento que se senta na borda direita do `window` sendo lido**.

Se um consumidor futuro de `S4` precisar mostrar "valor corrente de BTC, `idade 3min`" ao lado do
histograma (hoje **não existe** essa leitura em `charts` — `S4` só expõe estatística de janela), essa
leitura tem que vir por um **tipo novo e estreito**, não por um campo acrescentado a um dos tipos acima:

```python
# formalização de SPEC-001 §6.1, reusando o vocabulário que sentimento/domain/provenance.py
# já fixa (Provenance.OBSERVED = "OBSERVADO" / MODELED = "MODELADO") — não uma enumeração nova:
EdgeAge = ObservedAge(ms: int) | ModeledAge(ms: int) | UnknownAge
# UnknownAge é o "idade ?" que SPEC-001 §6.1 já nomeia: "lag_ms não foi medido para aquele endpoint"

@dataclass(frozen=True)
class CurrentReading:            # NOME PROVISÓRIO — não implementado por este ADR
    instrument_id: str
    value: float
    age: EdgeAge                 # o ÚNICO lugar do motor de S4 onde idade pode existir
```

`age` viria de `sentimento.domain.as_of_accessor.AsOfReading.age_ms` (reusado, nunca recalculado — D2
abaixo), envelopado no discriminador `EdgeAge` conforme a proveniência (`Provenance.OBSERVED` vs
`MODELED`) já carregada pela linha de origem. **Por construção, `CurrentReading` só pode representar UM
ponto por instrumento — o mais recente admitido em `t` — porque é isso que `as_of` devolve**; não há
como construir um `CurrentReading` para um ponto histórico, porque a função que o produziria (`as_of`)
não tem esse modo de chamada.

**Consequência prática hoje:** como `S4` não tem `CurrentReading` implementado (nenhuma task o pediu:
nem `T-08.6`, nem `T-08.7`, nem os `DoD` de `T-08.13`), **nenhuma linha de `S4` carrega idade hoje** — e
isso não é uma lacuna, é `D5` (retrospectividade) fazendo o trabalho de `D1` por construção: uma
bancada que só olha para trás não tem borda direita "viva" para carimbar.

### D2 — O invariante de ordem `ADR-006/D4` é REUSADO do `sentimento`; `charts` nunca ganha uma segunda constante de atraso

Quando o adaptador concreto de `ObservationSource` (task futura, "do builder" por `ADR-020/D7`) decidir
elegibilidade ou expuser qualquer noção de atraso para o caminho de leitura de `S4`, ele **tem que**
construir um `sentimento.domain.as_of_accessor.SeriesReadPolicy` por série e rotear a checagem por
`reject_delay_threshold_above_staleness`/`as_of` — nunca declarar um `asof_max_staleness_ms` literal
dentro de `backend/src/modules/charts/`. O precedente que autoriza essa importação cruzada já existe:
`FieldIdentity`/`field_identity.py` já importa `Nature` de `sentimento.domain.series_key`
(`ADR-020/D1`), e este ADR estende o mesmo padrão ao invariante de atraso.

**Por que isto é decisão de arquitetura e não só "reusar uma função":** `ADR-006`'s próprio contexto
registra que uma constante de UX virou, por proximidade, o default de uma leitura de decisão — a defesa
contra essa gravidade é ter **um dono só** (`sentimento`) para o número, e `charts` importando-o em vez
de reimplementá-lo é o que torna essa gravidade impossível de repetir na bancada nova.

**Falsificador:** qualquer literal numérico de milissegundos com nome parecido a `staleness`/`atraso`
dentro de `backend/src/modules/charts/` — hoje **zero** `[MEDIDO: grep -rn "staleness\|atraso" backend/src/modules/charts/ → 0 linhas, 2026-09-04]`.

### D3 — `denom` é sempre verbatim; o sentinela de multiplicador não resolvido é publicado por `sentimento`, `charts` nunca infere

`FieldIdentity.denom` (`ADR-020/D1`, intocado) continua uma `str` sem validação de conteúdo além de "não
em branco" — **este ADR não adiciona lógica de inferência de `denom` em `charts`, e proíbe que alguma
task futura adicione**. Para os ~20 símbolos com `baseAsset` de prefixo numérico e zero campo de
multiplicador no `exchangeInfo` (`D8.18`/`CA-F4-21`), `sentimento` (dono do catálogo, `T-07.9`
`instrument_alias` já é o mecanismo de YAML versionado com `evidence_url` — a curadoria do MULTIPLICADOR
em si não tem task nomeada hoje, `[NÃO SEI: dono e prazo da tabela curada, fora do escopo desta ADR]`)
publica um dos dois valores verbatim, nunca um terceiro inventado por regex:

```python
# vive em sentimento, não em charts — este ADR só fixa o CONTRATO que charts consome
RESOLVED_DENOM = "base_contracts" | "notional_usd" | <outro denom curado com evidence_url>
UNRESOLVED_MULTIPLIER_DENOM: Final[str] = "contratos (multiplicador não resolvido)"
```

**Por que isto fecha `D8.18` sem uma linha nova em `charts`:** `FieldIdentity` já é `frozen=True`, e
`dataclass` gera `__eq__`/`__hash__` sobre a tupla `(metric, unit, denom)` inteira — dois
`FieldIdentity`s com `denom` diferentes JÁ SÃO chaves diferentes, e `distribution`/`scan` já operam
POR `FieldIdentity` (`ADR-020/D2`: `derive_edges(field, nature, ...)`, `run_scan.py`: `evaluate_scan(...,
field=field, ...)`). Um instrumento com `denom = "contratos (multiplicador não resolvido)"` cai,
estruturalmente, numa população DIFERENTE de um instrumento com `denom = "base_contracts"` — "S4 recusa
comparação cross-símbolo naquela linha" é uma CONSEQUÊNCIA de `ADR-020/D1`, não uma regra nova que
`scan.py` precisa aprender. O que este ADR fecha é a fronteira de RESPONSABILIDADE: `charts` nunca
escreve o valor de `denom`, só o lê e o usa como chave — a fabricação do sentinela (e a curadoria da
tabela real) é ato de `sentimento`.

**Falsificador:** qualquer `re.match`/heurística sobre `baseAsset`/`instrument_id` dentro de
`backend/src/modules/charts/` produzindo um `denom` — hoje **zero** ocorrências
`[MEDIDO: grep -rn "baseAsset\|re\.match" backend/src/modules/charts/ → 0 linhas, 2026-09-04]`. E um
`FieldIdentity.__eq__` sobrescrito para ignorar `denom` — quebraria D3 e `ADR-020/D1` ao mesmo tempo.

### D4 — Zero seleção é informação: nenhuma função do motor de `S4` lê o próprio resultado, nem aceita `spec`/limiar como parâmetro de LEITURA

Generaliza o isolamento que `ADR-022/D4` já construiu para `ZDispersionTelemetry` (nenhuma função de
decisão a recebe como entrada) para o motor de `S4` inteiro, com dois mecanismos, ambos já verificáveis
por assinatura hoje:

1. **A porta de leitura (`ObservationSource.observed_values`) nunca ganha um parâmetro `spec`/
   `ThresholdSpec`/limiar.** A população elegível de `(field, nature, universe, window,
   knowledge_time_ms)` é fixada ANTES de qualquer limiar ser aplicado a ela — o limiar decide quantos
   dos pontos JÁ LIDOS disparam, nunca quais pontos são lidos. Isto é a mesma disciplina que impede
   lookahead temporal (`available_at <= t`, uma restrição sobre O QUE é lido, não sobre COMO é julgado),
   aplicada ao eixo de seleção de amostra em vez do eixo de tempo — filtrar a entrada pelo resultado que
   está sendo medido é a MESMA classe de vazamento, só que no espaço dos parâmetros.
2. **Nenhum `use_case` (`compute_distribution`, `run_scan`, `compute_firing_rate`) contém um laço que
   chama a si mesmo de novo com um parâmetro relaxado quando o primeiro resultado devolve zero.**
   `ScanResult{n_fired: 0}`, `EmptyScanInputError`, `MinObsNotMetError` são RESPOSTAS TERMINAIS que o
   operador vê — nunca uma condição interna que dispara uma segunda chamada com `min_obs` menor ou um
   `q` de percentil diferente. A alternativa recusada por `ADR-022` ("usar `z_dispersion` para vetar
   automaticamente o `scan`") é o caso particular; este `D4` é a regra geral da qual aquela recusa é uma
   instância.

**Por que isto não é "apenas não fazer auto-retry" (prosa sem portão):** o falsificador é de
ASSINATURA, não de comportamento observado em produção — `Protocol.observed_values` ganhando um
argumento `spec` é um `diff` de uma linha que um `git log -p` de qualquer PR futura expõe, o mesmo tipo
de falsificador estrutural que `ADR-022/D4` já usa ("nenhuma função … aceita … por assinatura, não por
promessa em prosa").

**Falsificador:** `inspect.signature(ObservationSource.observed_values)` contendo um parâmetro cujo tipo
é `ThresholdSpec` (ou qualquer variante) — hoje ausente `[MEDIDO 2026-09-04, leitura direta de
`compute_distribution.py:51-58`]`. Ou: um `use_case` de `charts/use_cases/` chamando outra função de
`charts/use_cases/` recursivamente ou em laço condicionado ao próprio resultado — hoje nenhum dos três
`use_cases` (`compute_distribution.py`, `run_scan.py`, `compute_firing_rate.py`, 98+48+38 linhas) chama
outro `use_case` `[MEDIDO 2026-09-04, leitura direta]`.

### D5 — `S4` é retrospectiva por assinatura: nenhuma função aceita "até agora", só janela fechada e `knowledge_time_ms` explícito

`Window` (`firing_rate.py:27-45`, `start_ms`/`end_ms`) já recusa `end_ms <= start_ms`, mas isso sozinho
não impede um chamador de passar `end_ms = <relógio de agora>` a cada nova invocação, o que produziria
uma varredura "ao vivo" por reamostragem — exatamente o que `D8.17` mede como **`[NÃO SUSTENTADO hoje]`**
(2,85–14,25 min por varredura de 570×5 séries). Este ADR fixa, como regra de fronteira e não como
mudança de tipo (`Window` já está correto — o problema é o QUE CHAMA `Window`, não o tipo em si):

**Nenhum `use_case` de `charts/use_cases/` para `S4` (`compute_distribution`, `run_scan`,
`compute_firing_rate`) ganha um modo "live"/"contínuo"/"streaming" até uma ADR futura reabrir esta
decisão nomeando que a rampa de `T-07.7` sustenta o custo.** Isso significa, concretamente, até lá:

- nenhum parâmetro opcional do tipo `live: bool` ou `end_ms: int | None` ("`None` = agora") em nenhuma
  assinatura de `use_case` de `S4`;
- nenhum laço de repetição (`while True`, `asyncio` polling, WebSocket) dentro de
  `backend/src/modules/charts/use_cases/`;
- toda chamada exige um `knowledge_time_ms`/`window.end_ms` explícito e literal — o chamador (rota HTTP,
  quando `infra` tiver dono) decide "agora" UMA vez, na borda do sistema, nunca dentro do motor.

**Por que a assinatura e não a tela:** uma tela que escreve `[NÃO SUSTENTADO hoje]` enquanto o código por
baixo aceita "até agora" é o mesmo modo de falha que `ADR-005/D2` já nomeou para `intrabar` — "o servidor
não infere de 'é a borda direita'", e aqui a regra espelhada é "o motor não infere 'é agora'". A garantia
tem que sobreviver a um consumidor futuro que não leu a tela.

**Falsificador:** qualquer assinatura de `charts/use_cases/*.py` para `S4` com um parâmetro que aceite
"agora"/"até o presente" implícito, ou qualquer `while`/`asyncio.sleep`/importação de biblioteca de
polling dentro desse diretório — hoje nenhum dos três arquivos tem qualquer forma de laço ou parâmetro
opcional de tempo `[MEDIDO 2026-09-04, leitura direta: `compute_distribution.py`, `run_scan.py`,
`compute_firing_rate.py` — todos exigem `window`/`knowledge_time_ms` posicional ou nomeado, sem
default]`.

---

## Alternativas recusadas

| alternativa | por que recusada |
|---|---|
| **`age_ms: int \| None` em todo tipo de linha/bin, `None` fora da borda** | é a MESMA forma que `ADR-022` já recusou para `low_confidence`: um campo presente que depende da disciplina de quem preenche é indistinguível, num export ou num `sum()` acidental, de um campo que deveria estar ausente. Omitir o campo do tipo é a única forma que não depende de disciplina do chamador |
| **Reimplementar `limiar_atraso <= asof_max_staleness_ms` dentro de `charts` (uma constante local)** | é literalmente a gravidade que `ADR-006`'s contexto já documentou e nomeou como causa de defeito real: "uma constante escolhida para desenhar vira, por gravidade, o default do acessor que o backtest usa" — duplicar o dono é reabrir essa porta |
| **`denom` resolvido por regex de `baseAsset` dentro de `charts` (`^\d+` → multiplicador)** | é exatamente o defeito que `PRD-001`/`handoff_to_architect.md` já mediram: a regex erra `1MBABYDOGEUSDT` por 10⁶. Curar a tabela é trabalho de catálogo (`sentimento`), não de motor de bancada |
| **Deixar `spec`/`ThresholdSpec` entrar como parâmetro opcional de `observed_values`, "para otimizar a query"** | abriria a porta exata que `D4` fecha: uma implementação futura poderia (com boa intenção de performance) filtrar linhas no SQL usando o limiar, produzindo uma população que já "sabe" o que está sendo medido — indistinguível de olhar à frente no espaço dos parâmetros |
| **`Window.end_ms` aceitar `None` como "até agora", resolvido no motor** | move a decisão de "o que é agora" para dentro de uma camada que a `Natureza` deste `pyproject.toml` já proíbe de ler relógio (`domain`/`use_cases` puros) — forçaria uma exceção a essa regra só para esta bancada |

---

## Falsificador desta ADR

**Qualquer campo `age`/`idade`/`age_ms` aparecendo em `Observation`, `Fired`, `NotFired`,
`Insufficient`, `Bin`, `PointMass`, `Overflow`, `HistogramResult` ou `ScanResult`** — quebra `D1`
diretamente, porque é exatamente a forma ("campo presente, preenchido só às vezes") que este ADR nomeia
como indefensável.

**Qualquer literal numérico de staleness/atraso dentro de `backend/src/modules/charts/`** — quebra `D2`;
o número tem que vir de `sentimento.domain.as_of_accessor`, sempre.

**Qualquer heurística sobre `baseAsset`/`instrument_id` produzindo `denom` dentro de
`backend/src/modules/charts/`** — quebra `D3`.

**`ObservationSource.observed_values` ganhando um parâmetro `ThresholdSpec`/limiar, ou um `use_case` de
`S4` chamando outro em laço condicionado ao próprio resultado** — quebra `D4`.

**Qualquer assinatura de `use_case` de `S4` aceitando "agora" implícito, ou qualquer laço de polling
dentro de `charts/use_cases/`** — quebra `D5`.

---

## Consequência

- `T-08.13` (builder, se/quando aberta) não precisa mudar nenhuma linha de `histogram.py`/`scan.py`/
  `firing_rate.py` para fechar `D8.15`/`D8.16`/`D8.18`/`D8.20`/`D8.17` — este ADR mostra que os quatro já
  estão satisfeitos pelo desenho existente (`ADR-020`/`ADR-022`) mais o reuso explícito de
  `sentimento.domain.as_of_accessor`. O trabalho de builder, se houver, é um teste de regressão que fixa
  os falsificadores acima (grep/`inspect.signature` como asserção de CI), não código de produção novo.
- Um `T-08.13b` futuro (sem número reservado) herda `CurrentReading`/`EdgeAge` (`D1`) no dia em que uma
  UI de `S4` precisar mostrar "valor corrente + idade" ao lado do histograma — este ADR só fixa a FORMA
  que esse tipo tem que ter, não o implementa.
- A rota HTTP (`infra`, `T-01.8` sem juiz) e o texto de tela (`web`, `[NÃO SEI: task ainda não nomeada]`
  — nenhuma task `web` da fase 08 cobre hoje o chip de idade/texto "retrospectiva"; `T-08.12` é `charts`,
  DoD `D8.11`-`D8.14`, renderização de painel, sem relação com esta lacuna) consomem os tipos aqui
  fechados sem poder reintroduzir "agora" implícito nem `age` em tipo agregado — `D4`/`D5`/`D1` são
  cláusulas que uma rota HTTP também tem que respeitar, não só o motor Python.
- `ADR-006/D4` continua sendo a fonte de verdade do invariante de ordem; este ADR não a emenda, só
  aponta `charts` para ela (`D2`).

## Como o owner confere isto sem confiar no arquiteto

Decisão pré-implementação — os quatro comandos abaixo são a verificação, e todos rodam sobre o
repositório de HOJE, não sobre código futuro:

```bash
# D1 — nenhum tipo de S4 carrega idade hoje
grep -rn "age_ms\|idade" backend/src/modules/charts/          # esperado: 0 linhas de código

# D2 — nenhuma constante de staleness duplicada em charts
grep -rn "staleness\|atraso" backend/src/modules/charts/      # esperado: 0 linhas

# D3 — nenhuma heurística de denom em charts
grep -rn "baseAsset\|re\.match" backend/src/modules/charts/   # esperado: 0 linhas

# D4 — a porta de leitura não recebe limiar
sed -n '51,58p' backend/src/modules/charts/use_cases/compute_distribution.py
# esperado: (field, nature, universe, window, knowledge_time_ms) — sem `spec`/`ThresholdSpec`
```

Os quatro comandos acima rodaram nesta sessão com os resultados citados no corpo da ADR
`[MEDIDO 2026-09-04]` — o owner reproduz o mesmo `grep`, não a leitura do arquiteto.

Rotulado explicitamente como **opinião de arquitetura, não medição nova**: a FORMA do tipo `EdgeAge`/
`CurrentReading` em `D1` (três variantes, nomes, reuso de `Provenance`) é julgamento de domínio deste
agente, sem medição ou documento público que a fixe como única forma correta —
`[OPINIÃO: quant-architect, 2026-09-04]`. O que É medido e não-opinião: que os quatro `grep`s acima
devolvem zero hoje, que `reject_delay_threshold_above_staleness` já existe e já é por série
(`as_of_accessor.py:343-369`), e que `20 símbolos`/`zero campo de multiplicador` é medição herdada de
`D8.18`/`PRD-001` (não recalculada aqui).
