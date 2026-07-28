#!/usr/bin/env sh
# setup-dev-hooks.sh — install local git hooks for trellis-enhance dev.
#
# The global `trellis` command is symlinked to this repo's built dist/, so it
# runs whatever is currently built here. These hooks auto-rebuild the CLI after
# merge / pull / branch-switch WHEN product source changed — so you always get
# the latest features with no reinstall and no manual `pnpm build`.
#
# Local hooks live in .git/hooks/ and are NOT committed, so run this once per
# clone. Dogfood-only changes (.trellis/ , .claude/ ...) correctly skip the build.
#
# Usage:  sh scripts/setup-dev-hooks.sh
set -eu

ROOT=$(git rev-parse --show-toplevel)
HOOKS="$ROOT/.git/hooks"
mkdir -p "$HOOKS"

cat > "$HOOKS/post-merge" <<'HOOK'
#!/bin/sh
# Auto-rebuild trellis-enhance CLI after merge/pull IF product source changed.
if git diff-tree -r --name-only ORIG_HEAD HEAD 2>/dev/null | grep -qE '^packages/(cli|core)/(src|scripts)/'; then
  printf '[trellis-enhance] product source changed — rebuilding CLI...\n'
  if pnpm --filter trellis-enhance build >/dev/null 2>&1; then
    printf "[trellis-enhance] \342\234\223 build done — global 'trellis' is current.\n"
  else
    printf "[trellis-enhance] \342\234\227 build FAILED — run: pnpm --filter trellis-enhance build\n"
  fi
fi
HOOK

cat > "$HOOKS/post-checkout" <<'HOOK'
#!/bin/sh
# args: $1 prev_head  $2 new_head  $3 branch_flag(1=branch switch)
[ "$3" = "1" ] || exit 0
if git diff --name-only "$1" "$2" 2>/dev/null | grep -qE '^packages/(cli|core)/(src|scripts)/'; then
  printf '[trellis-enhance] branch product differs — rebuilding CLI...\n'
  if pnpm --filter trellis-enhance build >/dev/null 2>&1; then
    printf "[trellis-enhance] \342\234\223 build done.\n"
  else
    printf "[trellis-enhance] \342\234\227 build FAILED — run: pnpm --filter trellis-enhance build\n"
  fi
fi
HOOK

chmod +x "$HOOKS/post-merge" "$HOOKS/post-checkout"
echo "[trellis-enhance] installed post-merge + post-checkout auto-build hooks in $HOOKS"
