# Gate `infra-architect` sobre `F3` — co-assinatura e `[Q6]`/`P8` (`captura-em-producao`)

**Assina:** `infra-architect`. **Data:** 2026-09-08. **Fecha:** `SPEC-004` cabeçalho `P8`, §8
`[Q6]`; `ADR-032/D5`, `F7`; `ADR-031/D2`; `PRD-004` `[Q6]`; plano `03` item `3.9`; `T-03.6`
(`docs/context/captura-em-producao/tasks.toml:441-456`, `CST-165`).

**Pré-condição de fechamento de `F3`** (`depends_on = ["T-03.4", "T-03.5"]`): os dois compose já
existem e estão mergeados em `master` — `deploy/compose.yml` (7 serviços, `T-03.4`) e
`deploy/compose.local.yml` (overlay de 3, `T-03.5`) `[MEDIDO 2026-09-08: git log --oneline -- deploy/
→ 68c74a0 (T-03.4), 3e37256 (T-03.5), ambos ancestrais de origin/master]`.

**Não reabre:** `ADR-002/D4` (finalista de motor — TimescaleDB em `pg15`, já decidido); `ADR-031/D1`,
`D3` (motor do registro, quem grava o run — são do `quant-architect`); a definição de run (`[Q3]`,
`gates/Q3-run-definition.md`); o layout de partição de `T-07.6`/`T-07.8` da mãe (fora do escopo de
`infra`, já respeitado por `gates/F2-series-ddl.md` §6). **Não implanta** (`R-E`) — nenhum `up` real,
nenhum host tocado.

---

## 1. Co-assinatura de `ADR-031/D2` — a imagem do serviço `postgres`

`ADR-031/D2` fixa `timescale/timescaledb:2.17.2-pg15` como `[INFERRED]`, pendente de `approve spec` e
da co-assinatura do `infra-architect` (a imagem e o serviço `postgres` são `infra`). Confirmação:

```
grep -n 'image:' deploy/compose.yml
# 42:    image: timescale/timescaledb:2.17.2-pg15
```

`[MEDIDO 2026-09-08]`. É a mesma imagem que `ADR-002/D4` (emenda) mediu contra os cinco critérios do
candidato 4 — **nenhum desvio**, nada a trocar. `postgres:16-alpine` (a imagem anterior a `T-03.4`,
sem a extensão TimescaleDB) não sobrevive em nenhum dos dois compose atuais. `ADR-031` §D2 e o
parágrafo de `Status` foram atualizados para citar este gate como a co-assinatura satisfeita.

## 2. Co-assinatura de `ADR-032` — `D1`–`D4` como implementados, sem desvio

Verificação de que `T-03.1`–`T-03.5` implementaram a decisão **como escrita**, não uma variação:

| decisão | verificação | resultado |
|---|---|---|
| `D1` — base com 7 serviços, sem `profiles:`; overlay com exatamente 3, todos existentes no base | `grep -nE '^  [a-z_-]+:$' deploy/compose.yml` → `postgres redis api writer collector web caddy` (7, mais 4 linhas de `volumes:` que a mesma regex também casa — o `docker compose config --services` real já foi medido por `T-03.4`/`T-03.5`: `api caddy collector postgres redis web writer`, 7, e `api collector postgres redis web writer`, 6, sem `caddy`, no alvo local); `grep -n 'profiles:' deploy/compose.yml deploy/compose.local.yml` → a única ocorrência no arquivo base é dentro de um COMENTÁRIO de cabeçalho (linha 13, `# No profiles: in this file`), não uma diretiva YAML; a diretiva real (`profiles: ["deploy-only"]`) está só no overlay, em `caddy:` | `[MEDIDO 2026-09-08]` — sem desvio |
| `D2` — Dockerfiles como entregável, uma imagem só para `api`/`writer`/`collector` | `backend/Dockerfile` (43 linhas) e `frontend/Dockerfile` (23 linhas) existem; `deploy/compose.yml` usa `build: context: ../backend` idêntico nos três serviços, só o `command:` difere (`python -m src.main` / `single_writer_cli` / `collectors_cli`) | `[MEDIDO 2026-09-08: wc -l backend/Dockerfile frontend/Dockerfile]` — sem desvio |
| `D3` — um `.env` na raiz para os dois alvos | `deploy/compose.yml` e `deploy/compose.local.yml` referenciam só `env_file: ../.env`; `.env.example` ganhou os 15 nomes de `SPEC-004 §3.6` (`T-03.3`, medido e registrado em `docs/INDEX.md` na entrada de `2026-09-08T09:20Z`) | sem desvio — não repito a medição aqui, seria a mesma que `T-03.3` já fez |
| `D4` — `redis` com teto e `noeviction` | `redis:7-alpine`, `command: redis-server --appendonly yes --maxmemory ${REDIS_MAXMEMORY} --maxmemory-policy noeviction`, `healthcheck: redis-cli ping`, volume `redis_data`, sem `ports:` (linhas 59-76 de `deploy/compose.yml`) | sem desvio |

`ADR-032` §`Status` foi atualizado para **aceita**, citando este gate.

## 3. `[Q6]`/`P8` — liveness de `writer`/`collector`: decisão é **NÃO implementar** `healthcheck` por comando

`SPEC-004` cabeçalho e `ADR-032/D5` deixam o default: `restart: unless-stopped` + fail-fast no boot +
`depends_on: … condition: service_healthy` para `postgres`/`redis` (já implementado por `T-03.4`) +
`/collector-status` marcando `PARADO` após `stale_after_s` como instrumento de vida — e um
`healthcheck:` por comando **declarado, não implementado**, com a decisão de implementar ou não
deixada para este gate. **Decisão: manter o default — não implementar.**

Três razões, cada uma suficiente sozinha:

1. **Zero efeito comportamental sob `docker compose` puro.** Nenhum serviço declara `depends_on: …
   condition: service_healthy` apontando para `writer` ou `collector` (`grep -n
   'condition: service_healthy' deploy/compose.yml` → só sob `redis:`/`postgres:` como alvo,
   nunca como consumidor de `writer`/`collector`). Docker Compose v2.19.1 (medido em
   `ADR-032` §Contexto) não é Swarm nem Kubernetes: um container marcado `unhealthy` não é
   reiniciado nem tirado de tráfego sozinho — o único efeito visível seria cosmético,
   em `docker ps`/`docker inspect`.
2. **O único comando executável sem tocar código prova pouco, e prova errado.** `writer`/`collector`
   não falam HTTP; a única sonda possível sem nova instrumentação é algo como
   `pgrep -f single_writer_cli`/`pgrep -f collectors_cli`, que confirma só que o processo-mestre
   não morreu — exatamente o que o estado do container (`Restarting`/`Exited`) já expõe via
   `restart: unless-stopped` + boot fail-fast (`ADR-029/D3`). Não confirma que a thread de trabalho
   não travou (por exemplo `XREADGROUP` bloqueado, ou `PING` ao Redis respondendo enquanto o loop de
   consumo está preso). Um `healthcheck` que reporta `healthy` nesse cenário é o mesmo padrão de
   sinal ambíguo que este repositório já nomeia para `rc=0` vazio (`ADR-012`, `CLAUDE.md` §"Nenhum
   número sem o comando") — falsa confiança é pior do que ausência de sinal, porque alguém vai
   confiar nela.
3. **Um `healthcheck` que medisse atraso de verdade custaria mais do que o declarado.** A única
   fonte real de "está atrasado" é `/collector-status` (`stale_after_s`, `ADR-030/D1`), que roda na
   `api`, não dentro do container de `writer`/`collector`. Consultá-la exigiria `curl` (ou
   equivalente) na imagem `python:3.13-slim`, que `backend/Dockerfile` não instala hoje — mudança de
   imagem fora do escopo declarado desta task — e a resposta agregada de `/collector-status` mistura
   séries de `writer` e `collector`, sem atribuição clara a um container específico. Construir isso
   sem um consumidor que precise de `healthy`/`unhealthy` no compose é a mesma classe de "construção
   especulativa" que `ADR-027` já recusou para `P9`/`[Q10]` (`gates/F2-series-ddl.md` §7).

**Custo de reverter, se um dia se implementar:** 1 bloco `healthcheck:` por serviço em
`deploy/compose.yml` (`writer`, `collector`) — como o próprio `P8` do cabeçalho de `SPEC-004` já
nomeia. Não requer mudar `deploy/compose.local.yml`.

**Gatilho de reabertura, nomeado:** o dia em que `writer`/`collector` ganharem um heartbeat de
processo (arquivo tocado a cada ciclo, ou chave Redis com TTL renovada) como instrumento de uma task
futura — nesse momento o `healthcheck:` de compose passa a ter algo real para checar, e a decisão
volta a esta mesa.

## 4. Como o owner confere

1. `grep -n 'image:' deploy/compose.yml` → linha 42, `timescale/timescaledb:2.17.2-pg15` — a mesma
   imagem de `ADR-002/D4`.
2. `grep -n 'profiles:' deploy/compose.yml deploy/compose.local.yml` → a única diretiva YAML real
   está no overlay (`caddy: profiles: ["deploy-only"]`); no base é só texto de comentário.
3. `deploy/compose.yml` continua sem `healthcheck:` sob `writer:`/`collector:` — `grep -cE
   '^    healthcheck:$' deploy/compose.yml` → **2** (`postgres`, `redis`) `[MEDIDO 2026-09-08]`.
   (Um `grep -c healthcheck` sem âncora dá **4**: as outras duas ocorrências são a palavra dentro
   de comentário, linhas 20 e 101 — não uma diretiva YAML; por isso a âncora `^    healthcheck:$`,
   não a palavra solta.) Este é o resultado ESPERADO da decisão de §3 (não implementar) — não é
   uma pendência.
4. `test -f docs/context/captura-em-producao/gates/F3-infra-architect.md && grep -c
   'infra-architect' docs/context/captura-em-producao/gates/F3-infra-architect.md` → ≥ 1 (DoD
   `T-03.6` exato).

## 5. O que fica para outra task, deliberadamente

- `healthcheck:` de `writer`/`collector`, se o gatilho de §3 disparar — não tem task própria ainda.
- `T-03.7` (medição de pegada) e `T-03.8` (ponta a ponta local) continuam como as próximas tasks de
  `F3` — este gate não implementa nem mede nenhuma das duas.
- Este gate **não** é `advance`/`approve`/`gate-record` — são atos de owner (`CLAUDE.md` §ledger);
  o veredito aqui é o do juiz de componente, registrado em arquivo, como as demais tasks de `F3`.
