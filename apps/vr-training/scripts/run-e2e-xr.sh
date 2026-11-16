#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export VR_PORT="${VR_PORT:-5191}"
mkdir -p artifacts/xr-e2e
modules=("$@")
if [[ ${#modules[@]} == 0 ]];then modules=(electrical water roads fire assist ar);fi
for module in "${modules[@]}";do
  case "$module" in electrical|water|roads|fire|assist|ar) ;; *) echo "Unknown module: $module" >&2;exit 2 ;; esac
done

# Each complete browser lifecycle owns one bounded shared-lock job. A pause in
# an earlier module must not consume the deadline of every later module.
if [[ -n "${HEAVY_SH:-}" && -x "${HEAVY_SH:-}" && "${HEAVY_LOCK_HELD:-0}" != 1 ]];then
  completed=();failed=()
  for module in "${modules[@]}";do
    if setsid --wait env HEAVY_TIMEOUT="${HEAVY_TIMEOUT:-1200}" "$HEAVY_SH" bash "$0" "$module";then
      completed+=("$module")
    else
      failed+=("$module")
    fi
    node scripts/xr-report.mjs "${modules[*]}" "${completed[@]}"
    if [[ ${#failed[@]} != 0 && "${CIVICOPS_XR_CONTINUE:-0}" != 1 ]];then break;fi
  done
  if [[ ${#failed[@]} != 0 ]];then echo "XR cases failed: ${failed[*]}" >&2;exit 1;fi
  exit 0
fi
cleanup(){
  npx iwsdk dev down >artifacts/xr-e2e/shutdown.json 2>&1 || true
  rm -f artifacts/xr-e2e/request*.mjs
}
trap cleanup EXIT
completed=();failed=()
for module in "${modules[@]}";do
  # Unknown hand outcomes are never repeated. Every module begins a fresh session.
  export CIVICOPS_CAPTURE_CDP="${CIVICOPS_CAPTURE_CDP:-1}" CIVICOPS_EXTERNAL_CDP="${CIVICOPS_EXTERNAL_CDP:-1}"
  export CIVICOPS_CAPTURE_PREFIX="${CIVICOPS_CAPTURE_PREFIX:-vr19}"
  rm -f artifacts/xr-e2e/report.json
  launch_ready=0
  for launch_attempt in 1 2 3;do
    if npx iwsdk dev up --ai-mode agent --headless --open --allow-browser-automation \
      --screenshot-width 1280 --screenshot-height 800 >"artifacts/xr-e2e/$module-startup.json" 2>&1;then
      launch_ready=1;break
    fi
    cp "artifacts/xr-e2e/$module-startup.json" "artifacts/xr-e2e/$module-startup-$launch_attempt.json"
    if [[ "$launch_attempt" == 3 ]] || ! node scripts/xr-command.mjs can-restart-launch "artifacts/xr-e2e/$module-startup.json";then break;fi
    echo "Retry clean launcher timeout $launch_attempt/2: $module (no XR input dispatched)"
  done
  if [[ "$launch_ready" == 1 ]] &&
    npx iwsdk runtime wait --timeout 45000 >"artifacts/xr-e2e/$module-ready.json" &&
    node scripts/e2e-xr.mjs "$module";then
    completed+=("$module")
  else
    failed+=("$module")
    if [[ -f artifacts/xr-e2e/report.json ]];then cp artifacts/xr-e2e/report.json "artifacts/xr-e2e/$module-failure.json";fi
    timeout 25 npx iwsdk browser logs --input-json '{"count":60}' >"artifacts/xr-e2e/$module-failure-console.json" 2>&1 || true
  fi
  node scripts/xr-report.mjs "${modules[*]}" "${completed[@]}"
  npx iwsdk dev down >"artifacts/xr-e2e/$module-shutdown.json" 2>&1 || true
done
if [[ ${#failed[@]} != 0 ]];then echo "XR cases failed: ${failed[*]}" >&2;exit 1;fi
