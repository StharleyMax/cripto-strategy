# ⛔ ACHADO CRÍTICO — o `.env` de produção inteiro está num repositório **PÚBLICO**

> Achado em 2026-09-12 por `T-05.4` (fase `05`, `cinco-metricas-do-core`), no primeiro
> disparo real do detector que a própria task mandou construir.
> **Este documento existe para ser lido pelo owner antes de qualquer outra coisa desta fase.**

## O que foi encontrado

`.env.example` — arquivo **versionado e publicado** — carregava, num bloco comentado chamado
`###env local`, **os valores vivos de todas as 16 variáveis do `.env` de produção**.

Comentado com `#` **não desvaza nada**: o byte está no arquivo, o arquivo está no commit, e o
commit está no GitHub.

### Verificado por igualdade de `sha256`, não por semelhança

| variável | vazada == viva |
|---|---|
| **`COINALYZE_API_KEY`** | ✅ **idêntica** |
| **`POSTGRES_PASSWORD`** | ✅ **idêntica** |
| `POSTGRES_DB` · `POSTGRES_USER` · `POSTGRES_HOST` · `POSTGRES_PORT` | ✅ idênticas |
| `REDIS_*` (6) · `WRITER_*` (2) · `APP_PORT` · `INGEST_RECORD_BACKEND` | ✅ idênticas |

`[MEDIDO 2026-09-12, n=16 variáveis, 16/16 idênticas]` — comparação por `sha256`, os valores
nunca impressos.

### O alcance, e ele é o pior possível

```
git log --oneline -S'<a chave>' -- .env.example   ->  ff18811   (o commit que introduziu)
git branch -r --contains ff18811                  ->  origin/master
gh repo view StharleyMax/cripto-strategy --json visibility,isPrivate,pushedAt
   -> {"isPrivate":false,"pushedAt":"2026-09-12T12:54:39Z","visibility":"PUBLIC"}
```

⇒ **repositório PÚBLICO, `origin/master` contém o commit, empurrado em 2026-09-12 12:54 UTC.**

## O que eu fiz, e o que isso NÃO resolve

**Feito nesta worktree:** o bloco `###env local` (17 linhas) foi **removido** de `.env.example`,
e no lugar ficou `COINALYZE_API_KEY=` — **o nome, com valor vazio**, que é o que `T-05.4` pede.

⚠️ **Isso conserta o `HEAD`, e não desvaza nada.** Os valores continuam:

1. no **histórico** do repositório (`ff18811` e qualquer commit anterior que os tenha tido);
2. no **`origin/master` do GitHub**, público;
3. em qualquer **clone, fork, cache de CDN do GitHub ou varredor automático** que tenha passado
   por ali desde 12:54 UTC. Varredores de credencial rodam sobre o *event stream* público do
   GitHub em **minutos**, não em dias.

## ⛔ O que só o owner pode fazer, e é urgente

1. **ROTACIONAR a `COINALYZE_API_KEY`** no painel da Coinalyze. A chave publicada tem de ser
   considerada comprometida — não "provavelmente exposta", **exposta**.
2. **TROCAR a `POSTGRES_PASSWORD`** de produção, e verificar acesso indevido ao Postgres
   (se ele estiver alcançável de fora; se só existe dentro da rede do compose, o risco é menor
   mas a senha continua queimada).
3. Decidir sobre **reescrita de histórico** (`git filter-repo` / `gh` support) — **e saber que
   ela é paliativa**: o GitHub mantém objetos órfãos acessíveis por SHA e forks não são
   reescritos. **Rotacionar é o que resolve; reescrever histórico é higiene.**

**Nada disso é ato de agente.** `CLAUDE.md`: gates de owner não podem ser feitos por agente — e
rotacionar credencial é mais do que um gate.

## Por que isto passou por todo mundo até hoje

Não foi descuido de leitura: **nenhum instrumento deste repositório olhava para esse arquivo.**

| regra | escopo | alcança `.env.example`? |
|---|---|---|
| `core.hardcoded-secret` | `scope = production` → `backend/src/`, `frontend/src/` | ❌ |
| `own.compose-hardcoded-secret` | `paths = **/*.yml`, `**/*.yaml` | ❌ |

E `harness.toml` `[code_paths] include_prefixes` é `backend/src/`, `backend/tests/`,
`frontend/src/`, `deploy/` — **a raiz do repositório não está lá**. Então `.env.example`,
`docs/**.md`, `README.md` e `scripts/` estavam **fora do escopo de toda regra de segredo**.

Era exatamente o `rc=0` que `ADR-012` nomeia: indistinguível entre *"não há credencial"* e
*"o instrumento nunca olhou"*. **O instrumento nunca olhou.**

`domain/secret_leak_scan.py` + `tests/sentimento/test_coinalyze_key_never_versioned.py`
(entregues por `T-05.4`) varrem **`git ls-files` inteiro**, que é o universo que faltava.

## O falsificador deste achado

Se `sha256(valor em .env.example@ff18811) != sha256(valor em .env)` para
`COINALYZE_API_KEY` ou `POSTGRES_PASSWORD`, então o vazamento é de credencial morta e a
urgência cai. **Rodado: as 16 batem, 16/16.** O falsificador não salvou ninguém.

## Comandos (literais) para reproduzir

```bash
# 1. igualdade vazada-vs-viva, sem imprimir valor (compara sha256; n=16 variaveis)
python3 - <<'EOF'
import hashlib, pathlib, re
h = lambda s: hashlib.sha256(s.encode()).hexdigest()[:10]
leaked = dict(re.findall(r'^#([A-Z_]+)=(\S+)', pathlib.Path('.env.example').read_text(), re.M))
env = {}
for line in pathlib.Path('.env').read_text().splitlines():
    if '=' in line and not line.strip().startswith('#'):
        k, v = line.split('=', 1); env[k.strip()] = v.strip().strip('"').strip("'")
for k in sorted(leaked):
    print(k, h(leaked[k]), h(env.get(k, '')), leaked[k] == env.get(k))
EOF

# 2. alcance
git branch -r --contains ff18811
gh repo view StharleyMax/cripto-strategy --json visibility,isPrivate,pushedAt

# 3. o par morde/cala sobre a chave VIVA (universo: 1.265 arquivos versionados)
backend/.venv/bin/python scratchpad/exact_scan.py
#   CALA  universe=1265 files  live_key_hits=0
#   MORDE universe=1 file (.env.example@HEAD)  live_key_hits=1  lines=[66]
```
