#!/usr/bin/env bash
# Every gate CI runs (.github/workflows/ci.yml), in the same order, on this computer.
set -euo pipefail
cd "$(dirname "$0")/.."

node scripts/check-coverage-policy.mjs
pnpm exec biome ci
pnpm typecheck
pnpm fetch-model
pnpm build
pnpm test:coverage
pnpm test:scripts
(
  cd src-tauri
  cargo fmt --check
  cargo clippy --all-targets -- -D warnings
  cargo test
  cargo llvm-cov --summary-only \
    --ignore-filename-regex "$(node ../scripts/check-coverage-policy.mjs --rust-ignore-regex)" \
    --fail-under-lines 100 --fail-under-functions 100 --fail-under-regions 100
)
echo "Every gate passed."
