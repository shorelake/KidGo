#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
CONDA_COMMAND="${CONDA_EXE:-$HOME/miniconda3/bin/conda}"
if [[ ! -x "$CONDA_COMMAND" ]]; then
  CONDA_COMMAND="$(command -v conda || true)"
fi
if [[ -z "$CONDA_COMMAND" || ! -x "$CONDA_COMMAND" ]]; then
  printf '%s\n' 'Conda not found. Set CONDA_EXE to your conda executable.' >&2
  exit 1
fi

if [[ ! -f web_service/frontend/dist/index.html || "${KATAGO_BUILD_WEB:-0}" == 1 ]]; then
  (
    cd web_service/frontend
    npm ci --no-audit --no-fund
    npm run build
  )
fi

export KATAGO_DATA="${KATAGO_DATA:-$PROJECT_DIR/web_service/data}"
export KATAGO_GPU="${KATAGO_GPU:-0}"
printf 'KataGo Web: http://%s:%s (Conda: %s)\n' "${KATAGO_HOST:-0.0.0.0}" "${KATAGO_PORT:-3000}" "${KATAGO_CONDA_ENV:-go}"
exec "$CONDA_COMMAND" run --no-capture-output -n "${KATAGO_CONDA_ENV:-go}" \
  python -m web_service --host "${KATAGO_HOST:-0.0.0.0}" --port "${KATAGO_PORT:-3000}" \
  --token-file "$KATAGO_DATA/access.token" "$@"
