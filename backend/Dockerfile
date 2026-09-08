# backend/Dockerfile — T-03.1 (SPEC-004 s3.6, ADR-032/D2)
#
# ONE image for api, writer, and collector. They differ only by the `command:` that
# `deploy/compose.yml` sets per service (ADR-027/D1, literal: "mesma imagem, comando
# diferente") — this file intentionally carries NO logic-bearing ENTRYPOINT, so a wrong
# process never hides behind an entrypoint script silently picking a role.
#
# Base pinned to python:3.13-slim, matching `requires-python = ">=3.13,<3.14"`
# (backend/pyproject.toml) — the interpreter inside the image is the same major.minor the
# test suite runs against on the host.
FROM python:3.13-slim

# Poetry is the declared manager (ADR-011/D1). Pin exact, same discipline as every other
# dependency in this tree: reproducibility over convenience.
ENV POETRY_VERSION=2.4.1 \
    POETRY_HOME=/opt/poetry \
    POETRY_NO_INTERACTION=1 \
    POETRY_VIRTUALENVS_CREATE=false \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
ENV PATH="${POETRY_HOME}/bin:${PATH}"

RUN pip install --no-cache-dir "poetry==${POETRY_VERSION}"

WORKDIR /app

# Single COPY of the whole (dockerignore-filtered) build context — deliberate, not
# convenience: D3.6/D3.8's falsifier is "`.dockerignore` without `.env*` => >= 1 `.env*` file
# inside the image", and that falsifier is only load-bearing if a secret placed at
# `backend/.env` is actually in the copy's path. `.venv`, `tests/`, `data/`, `.env*`, and
# `__pycache__` are what `backend/.dockerignore` strips before this COPY ever sees them —
# they never reach the daemon, so they cannot land in a layer no matter how COPY is written.
COPY . .
# `package-mode = false` (backend/pyproject.toml): there is no distributable package to
# install, only the pinned dependency set — `--no-root` skips the (nonexistent) root install,
# `--only main` excludes the dev group (coverage, mypy, pytest, ruff, import-linter,
# fakeredis) that this image never runs.
RUN poetry install --only main --no-root --no-cache

# No default CMD/ENTRYPOINT: `deploy/compose.yml` sets `command:` per service
# (`python -m src.main`, `python -m src.modules.sentimento.infra.single_writer_cli`,
# `python -m src.modules.sentimento.infra.collectors_cli`) — see SPEC-004 s3.6.
