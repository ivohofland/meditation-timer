#!/usr/bin/env bash
# Deploy one commit of main to timer.fair.yoga: build it in a throwaway
# container and point the web root's `current` link at the result.
# deploy/DEPLOYMENT.md, "Updates".
#
# CI calls it over SSH with a key whose authorized_keys entry forces this
# script (`command="…",restrict`), so the commit arrives in
# SSH_ORIGINAL_COMMAND and nothing else can run under that key. By hand:
#   timer-deploy <full commit hash>
#
# The record of what serves is the `current` link itself: it names the
# release, and a release is named by its commit. The script only moves
# forward along origin/main: a commit already serving, or an older one,
# answers success and changes nothing, so two CI runs finishing out of order
# cannot roll the site back. Rolling back is a deliberate act by hand.
#
# The build reads the commit through `git archive`, never a checkout, so the
# clone in REPO_DIR is only fetched, never moved. The site keeps serving the
# old release until the link is swapped in one rename.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/meditation-timer}"
WEB_ROOT="${WEB_ROOT:-/var/www/timer.fair.yoga}"
BUILD_IMAGE="${BUILD_IMAGE:-node:22-alpine}"
LOCK_FILE="${LOCK_FILE:-/tmp/timer-deploy.lock}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

fail() { echo "deploy refused: $*" >&2; exit 1; }

# SSH_ORIGINAL_COMMAND when set (even empty: a key-forced call with no
# command is still a request, and an empty one is refused), else the argument.
REQUEST="${SSH_ORIGINAL_COMMAND-${1-}}"
[[ "$REQUEST" =~ ^[0-9a-f]{40}$ ]] || fail "expected one full lowercase commit hash, got '${REQUEST}'"
SHA="$REQUEST"

exec 9>"$LOCK_FILE"
flock -n 9 || fail "another deploy is running"

RELEASES="$WEB_ROOT/releases"
CURRENT="$WEB_ROOT/current"
mkdir -p "$RELEASES"

cd "$REPO_DIR"
git fetch --quiet origin main
git merge-base --is-ancestor "$SHA" origin/main 2>/dev/null || fail "$SHA is not on origin/main"

PREVIOUS=""
if [[ -L "$CURRENT" || -e "$CURRENT" ]]; then
  TARGET="$(readlink "$CURRENT" || true)"
  [[ "$TARGET" =~ ^releases/([0-9a-f]{40})$ ]] \
    || fail "$CURRENT does not point at a release (it points at '${TARGET}'); point it at releases/<commit> of the serving release (DEPLOYMENT.md, rolling back)"
  PREVIOUS="${BASH_REMATCH[1]}"
  if git merge-base --is-ancestor "$SHA" "$PREVIOUS" 2>/dev/null; then
    echo "already at or past $SHA (serving: $PREVIOUS); nothing to do"
    exit 0
  fi
  git merge-base --is-ancestor "$PREVIOUS" "$SHA" 2>/dev/null \
    || fail "serving $PREVIOUS is not an ancestor of $SHA; deploy by hand"
fi
echo "deploying ${PREVIOUS:-nothing} -> $SHA"

# The build folder sits beside the releases, on the same filesystem, so moving
# its output into place is a rename. It goes whatever happens.
BUILD="$(mktemp -d "$RELEASES/.build-XXXXXX")"
trap 'rm -rf "$BUILD"' EXIT
git archive "$SHA" | tar -x -C "$BUILD"

# Corepack runs the pnpm that package.json pins, but falls back to its own
# default, a different major, when it cannot read one. Asserted, not assumed.
PNPM_VERSION="$(sed -nE 's/.*"packageManager"[[:space:]]*:[[:space:]]*"pnpm@([0-9][^"+]*).*/\1/p' "$BUILD/package.json" 2>/dev/null | head -n1)"
[[ -n "$PNPM_VERSION" ]] || fail "$SHA's package.json pins no pnpm in packageManager"

# As this user, so everything it writes can be removed again.
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp -e COREPACK_HOME=/tmp/corepack -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e "PNPM_VERSION=$PNPM_VERSION" \
  -v "$BUILD:/app" -w /app \
  "$BUILD_IMAGE" \
  sh -euc 'got="$(corepack pnpm --version)"; [ "$got" = "$PNPM_VERSION" ] || { echo "pnpm $got runs, package.json pins $PNPM_VERSION" >&2; exit 1; }; corepack pnpm install --frozen-lockfile; corepack pnpm build' \
  || fail "build failed; $CURRENT still serves ${PREVIOUS:-nothing}"
[[ -f "$BUILD/dist/index.html" ]] || fail "the build has no index.html; $CURRENT still serves ${PREVIOUS:-nothing}"

rm -rf "${RELEASES:?}/$SHA"
mv "$BUILD/dist" "$RELEASES/$SHA"
chmod -R a+rX "$RELEASES/$SHA"

# One rename replaces the link, so a request sees the old release or the new
# one, never neither. GNU mv needs -T not to move the link into the old
# release; BSD mv (macOS, for the tests) spells it -h.
ln -sfn "releases/$SHA" "$CURRENT.tmp"
if mv --version >/dev/null 2>&1; then mv -T "$CURRENT.tmp" "$CURRENT"; else mv -fh "$CURRENT.tmp" "$CURRENT"; fi
echo "deployed $SHA"

# Keep the newest releases along main, for rolling back; never the serving one.
KEEP="$(git rev-list origin/main | while read -r c; do [[ -d "$RELEASES/$c" ]] && echo "$c"; done | head -n "$KEEP_RELEASES" || true)"
for dir in "$RELEASES"/*; do
  name="$(basename "$dir")"
  [[ "$name" =~ ^[0-9a-f]{40}$ && "$name" != "$SHA" ]] || continue
  grep -qx "$name" <<< "$KEEP" || rm -rf "$dir" || echo "warning: could not remove the old release $name" >&2
done
