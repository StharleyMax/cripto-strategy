# Fase `10` — A pirâmide de testes (adendo de 2026-10-03)

> **Natureza deste arquivo:** é um **plano-índice**, escrito pelo `/tech-lead` e não pelo `/architect`. Ele existe porque o validador de tasks exige um
> `10_*.md` para a fase `10` (`V-24`) `[MEDIDO 2026-10-03: harness tasks validate estrutura-do-front → 28 ERROR V-24 sem este arquivo]`.
> **Ele não decide nada.** Toda decisão de destino de teste está nas três análises citadas abaixo, e a quebra em tasks está na narrativa §10.
> **Tela:** a mesma. A fase só mexe em teste, e o único código de produção tocado é `export` de constante (`T-10.10`)
> **Componentes:** `web` · `charts` · `sentimento` · `backtest` · `infra`
> **Origem:** o pedido do owner, não um requisito da `SPEC-011`. `[PREMISSA-OWNER: 2026-10-03]` *"apos a analise já pode iniciar os ajustes e melhorias,
> daí pode entrar nessa memsa feature atual"*.

## As fontes, que fazem o papel de plano

| análise | o que decide | seções que as tasks citam |
|---|---|---|
| [`E2E-analise.md`](../../context/piramide-de-testes/gates/E2E-analise.md) | o veredito dos 42 specs, os conflitos de destino C-1…C-9 e os custos escondidos | §1.1, §2, §3/<spec> (linha `(origem)`), §5, §6 |
| [`UNIT-FRONT-analise.md`](../../context/piramide-de-testes/gates/UNIT-FRONT-analise.md) | os gargalos `eslint-boundary` e `fingerprint`, as classes dos testes de fonte, a mutação F01–F14/R01–R04 | §1, §2, §4, §6, §7 |
| [`BACKEND-analise.md`](../../context/piramide-de-testes/gates/BACKEND-analise.md) | o oráculo do `oi_candles`, os grupos G1–G12 | §2, §3, §4, §7 |

## Itens → tasks

| # | item | tasks |
|---|---|---|
| 10.A | mecânico, sem mexer em asserção: sonos fixos, skip antes da montagem, instrumento do 35/38, lint dos probes plantados, fixture do `s2-cvd`, cache do oráculo | `T-10.1`…`T-10.7` |
| 10.P | as pendências das análises parciais, só medição | `T-10.8`, `T-10.9` |
| 10.B | fusões e descidas: os contratos de fonte do front (precedem F3–F8), o par `axis-fidelity`, os anfitriões de e2e, as descidas parciais, G5–G8 do backend | `T-10.10`…`T-10.26` |
| 10.C | cortes: 31, 36, 33 (d)+(e) no e2e; G1–G4 no backend | `T-10.27`, `T-10.28` |

## DoD da fase

1. **`REGRA-M`:** todo teste que sai do lugar tem a mutação de origem nomeada e provada contra a suíte depois da mudança. Sem mordida, ele fica.
2. **`REGRA-T`:** tempo antes e depois do mesmo comando, sozinho na máquina. Ganho não medido não fecha task.
3. **`REGRA-X`:** exceção ao `DoD-2` da feature, task a task, só nos specs que a task nomeia.
4. **Portão:** `make verify-scope` por task; a wave fecha com `VERIFY_FORCE=1 make verify`, sozinho na máquina.

O texto completo das três regras está no cabeçalho da fase `10` em [`tasks.toml`](../../context/estrutura-do-front/tasks.toml).
