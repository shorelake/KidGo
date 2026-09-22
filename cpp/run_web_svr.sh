#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
export KATAGO_DATA="${KATAGO_DATA:-$PROJECT_DIR/web_service/data}"
export KATAGO_GPU="${KATAGO_GPU:-0}"
ACTION="${1:-start}"
case "$ACTION" in
  start|stop|status) if [[ $# -gt 0 ]]; then shift; fi ;;
  -h|--help)
    printf '%s\n' 'Usage: ./run_web_svr.sh [start|stop|status] [server options]' \
      'start (default): run in foreground with Conda go; Ctrl+C stops gracefully.' \
      'stop: gracefully stop this project server and its KataGo engines.' \
      'status: show whether the managed server process is running.' \
      'Defaults: KATAGO_HOST=0.0.0.0 KATAGO_PORT=3000 KATAGO_GPU=0' \
      'Optional: KATAGO_CONDA_ENV, KATAGO_DATA, KATAGO_MODEL_DIR, KATAGO_BUILD_WEB=1'
    exit 0 ;;
  --*) ACTION=start ;;
  *) printf 'Unknown command: %s\n' "$ACTION" >&2; exit 2 ;;
esac
PID_FILE="$KATAGO_DATA/web.pid"
managed_pid() {
  local pid cmd
  [[ -r "$PID_FILE" ]] || return 1
  read -r pid < "$PID_FILE" || return 1
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  [[ "$(readlink "/proc/$pid/cwd" 2>/dev/null)" == "$PROJECT_DIR" ]] || return 1
  cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)" || return 1
  [[ "$cmd" == *" -m web_service "* ]] || return 1
  printf '%s' "$pid"
}
if [[ "$ACTION" == stop || "$ACTION" == status ]]; then
  [[ $# == 0 ]] || { printf '%s\n' 'stop/status do not accept server options.' >&2; exit 2; }
  if PID="$(managed_pid)"; then
    if [[ "$ACTION" == status ]]; then
      printf 'Running (PID %s).\n' "$PID"
      exit 0
    fi
    kill -TERM "$PID"
    for ((attempt=0; attempt<60; attempt++)); do
      if ! managed_pid >/dev/null; then
        printf '%s\n' 'Stopped. KataGo engines have been released.'
        exit 0
      fi
      sleep 1
    done
    printf '%s\n' 'Shutdown is still in progress; check status and server output.' >&2
    exit 1
  fi
  printf '%s\n' 'Not running.'
  exit 0
fi
mkdir -p "$KATAGO_DATA"
exec 9>"$KATAGO_DATA/launcher.lock"
if ! flock -n 9; then
  printf '%s\n' 'This project server is already starting or running.' >&2
  exit 1
fi
if PID="$(managed_pid)"; then
  printf 'Already running (PID %s).\n' "$PID" >&2
  exit 1
fi
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

# Activate Conda, then exec Python directly so Ctrl+C/TERM reaches Uvicorn.
CONDA_BASE="$("$CONDA_COMMAND" info --base)"
source "$CONDA_BASE/etc/profile.d/conda.sh"
conda activate "${KATAGO_CONDA_ENV:-go}"
printf 'KataGo Web: http://%s:%s (Conda: %s)\n' "${KATAGO_HOST:-0.0.0.0}" "${KATAGO_PORT:-3000}" "${KATAGO_CONDA_ENV:-go}"
printf '%s\n' "$$" > "$PID_FILE"
exec python -m web_service --host "${KATAGO_HOST:-0.0.0.0}" --port "${KATAGO_PORT:-3000}" \
  --token-file "$KATAGO_DATA/access.token" "$@"
