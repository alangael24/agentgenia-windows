#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
runtime_root="$repo_root/runtime-build"
python_root="$runtime_root/python"
pi_root="$runtime_root/pi"

rm -rf "$python_root" "$pi_root"
mkdir -p "$python_root" "$pi_root"
cp -R /Users/alan/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/. "$python_root/"
"$python_root/bin/python3" -m pip install --disable-pip-version-check --no-compile -r "$repo_root/requirements.txt"

cp "$repo_root/runtime/pi/package.json" "$repo_root/runtime/pi/pnpm-lock.yaml" "$repo_root/runtime/pi/pnpm-workspace.yaml" "$pi_root/"
pnpm --dir "$pi_root" install --prod --frozen-lockfile
test -f "$pi_root/node_modules/@earendil-works/pi-coding-agent/dist/cli.js"
test -f "$pi_root/node_modules/pi-chrome/extensions/chrome-profile-bridge/index.ts"
