#!/usr/bin/env bash
# bin/setup.sh — install the agent-with-dsh profiles into the DeepSeek Harness.
#
# What it does:
#   1. Copies the repo profile templates into $DSH_HOME/profiles/<name>
#      (default $HOME/.dsh/profiles), substituting __REPO__ with this repo's
#      absolute path in the patch files.
#   2. Symlinks examples/node_modules -> $DSH_HOME/profiles/node_modules so
#      profile plugins that import @deepseek-ai/* resolve against the same
#      installed harness (see docs/dsh-integration.md).
#   3. Validates the headless profile composition with --dump-config.
#
# Idempotent: safe to re-run after editing the templates.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DSH_HOME_DIR="${DSH_HOME:-$HOME/.dsh}"
PROFILES_HOME="$DSH_HOME_DIR/profiles"
PROFILES=("my-agent-headless" "my-agent-web")

echo "agent-with-dsh setup"
echo "  repo:      $REPO"
echo "  dsh home:  $DSH_HOME_DIR"

for name in "${PROFILES[@]}"; do
  dest="$PROFILES_HOME/$name"
  mkdir -p "$dest"
  cp "$REPO/profiles/$name/package.json" "$dest/package.json"
  sed "s|__REPO__|$REPO|g" "$REPO/profiles/$name/cordis.patch.yml.tpl" > "$dest/cordis.patch.yml"
  if [ -f "$REPO/profiles/$name/pnpm-workspace.yaml" ]; then
    cp "$REPO/profiles/$name/pnpm-workspace.yaml" "$dest/pnpm-workspace.yaml"
  fi
  echo "  installed profile: $name"
done

# Plugin module resolution: profile plugins are inserted by absolute path and
# their @deepseek-ai/* imports resolve from this fallback.
if [ ! -e "$REPO/examples/node_modules" ]; then
  ln -s "$PROFILES_HOME/node_modules" "$REPO/examples/node_modules"
  echo "  linked examples/node_modules -> $PROFILES_HOME/node_modules"
fi

# Locate the dsh checkout: ${DSH_CHECKOUT:-} wins, then common neighbors.
DSH_CHECKOUT_DIR="${DSH_CHECKOUT:-}"
if [ -z "$DSH_CHECKOUT_DIR" ]; then
  for candidate in "$REPO/../deepseek-harness" "$REPO/../Dev/deepseek-harness" "$REPO/../../Dev/deepseek-harness"; do
    if [ -f "$candidate/package.json" ]; then DSH_CHECKOUT_DIR="$candidate"; break; fi
  done
fi
echo ""
echo "Validating my-agent-headless composition..."
if command -v pnpm >/dev/null 2>&1 && [ -n "$DSH_CHECKOUT_DIR" ] && [ -f "$DSH_CHECKOUT_DIR/package.json" ]; then
  (cd "$DSH_CHECKOUT_DIR" && pnpm dsh --profile my-agent-headless --dump-config >/dev/null 2>&1 && echo "  OK: headless profile composes") \
    || echo "  (validation failed — see docs/dsh-integration.md)"
else
  echo "  (dsh checkout not found; validation skipped — set DSH_CHECKOUT=/path/to/deepseek-harness)"
fi

echo ""
echo "Done. Next steps:"
echo "  one-shot:  pnpm dsh --profile my-agent-headless \"your task\""
echo "  web GUI:   pnpm dsh --profile my-agent-web"
echo "  change model: edit ~/.dsh/profiles/my-agent-headless/cordis.patch.yml"