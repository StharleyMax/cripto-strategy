# Registro CRU da medição de `T-03.7` — 2026-08-29

Estes arquivos são **o que saiu do fornecedor**, sem edição. A leitura está em
[`../../medicao-balde-de-cota-2026-08-29.md`](../../medicao-balde-de-cota-2026-08-29.md); aqui
ficam os bytes, para que **um terceiro possa falsificar cada número sem confiar no texto**.

**Nenhuma chave nestes arquivos.** A da Coinalyze vive em `.env` (perms 600, gitignored) e viaja
como header `api_key` na requisição, **nunca na resposta** — que é tudo o que foi gravado.

| arquivo | o que é | comando que o produziu |
|---|---|---|
| `00_observador.json` | quem mediu: IP, cidade, ASN | `curl -s https://ipinfo.io` |
| `01_curl_d3.12_headers.txt` | `D3.12` **antes** de existir bancada — `curl` cru nos dois baldes Binance | `curl -sS -D - -o /dev/null <url>` |
| `02_peso_de_fapi_depth.txt` | o peso de `/fapi/v1/depth?limit=5`: **5 → 7 → 9 ⇒ 2** | 3 × `curl` + `grep x-mbx-used-weight-1m` |
| `03_headers_dos_tres_baldes.jsonl` | `D3.12` pela bancada: **todos** os headers dos 3 baldes | `quota_ramp_cli headers` |
| `04_acoplamento.json` | o controle de topologia: 4 leituras + 20 chamadas cegas | `quota_ramp_cli coupling 20` |
| `05_rampa_futures_data.json` | **os 150 degraus crus** da rampa no balde do screener | `quota_ramp_cli ramp binance-futures-data 150` |
| `06_rampa_coinalyze.json` | **os 41 degraus crus**, incluindo o `429` do degrau 41 | `quota_ramp_cli ramp coinalyze 70` |
| `07_vereditos_recomputados.txt` | os vereditos **recomputados dos degraus acima**, com os campos corrigidos | script sobre `05_` e `06_` |
| `08_latencias_e_teto_do_instrumento.txt` | latências e o teto de **114 req/min** da rampa serial | script sobre `05_` e `06_` |

## ⚠️ `05_` e `06_` carregam um nome de campo que **já não existe no código**

Os dois trazem **`requests_before_throttle`**, e ele foi **partido em dois**
(`throttled_at_request` + `accepted_before_throttle`) **por causa do que estes próprios arquivos
mostraram**: em `06_`, o campo saiu **`41`** ao lado de `"accepted": 40`, e as duas grandezas são
diferentes — a 41ª foi **recusada**, o que cabe na janela é **40**.

**Os arquivos NÃO foram reescritos, e isso é deliberado.** Eles são o registro de um momento; editá-
los apagaria a evidência do defeito que motivou o conserto. O que se faz com um registro cru é
**recomputar**, e é o que `07_` é: os mesmos degraus, o veredito de hoje.

```bash
cd backend && PYTHONPATH=. .venv/bin/python -c "
import json
from src.modules.sentimento.domain.ramp_ledger import RampLedger, RampRung, RungOutcome
cru = json.load(open('<caminho de 05_ ou 06_>'))
degraus = tuple(RampRung(index=r['index'], outcome=RungOutcome(r['outcome']), status=r['status'],
                         observed_weight=r['observed_weight'], retry_after_seconds=r['retry_after_seconds'],
                         elapsed_seconds=r['elapsed_seconds'], detail=r['detail'])
                for r in cru['rungs'])
v = RampLedger(bucket_identifier=cru['bucket'], rungs=degraus).verdict()
print(v.conclusion.value, v.throttled_at_request, v.accepted_before_throttle, v.reason)"
```

## O que estes arquivos **não** provam

Cada um é **uma passada, de um IP, num endpoint, num momento**. `05_` mostra `CEILING_NOT_REACHED`,
que é **piso e nunca teto** — e o teto que faltou é do **instrumento** (114 req/min, `08_`), não do
fornecedor. Ver o §0 e o §4 do documento de leitura antes de citar qualquer número daqui.
