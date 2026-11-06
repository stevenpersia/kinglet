#!/usr/bin/env bash
# Vercel "Ignored Build Step" (vercel.json → ignoreCommand), run from apps/web.
# Exit 0 = skip the build, exit 1 = build. Only files the website is made from count, so work on the
# desktop app alone never starts (or breaks) a website deploy.
# Compared with the last deployed commit when Vercel knows it, else the previous commit; if that commit
# is not in the clone, git fails and the site is built (safe default).
base="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"
git diff --quiet "$base" HEAD -- \
  . \
  ../desktop/src/renderer/components/Icons.tsx \
  ../desktop/src/renderer/theme.css \
  ../../package.json \
  ../../pnpm-workspace.yaml
case $? in
  0) echo "No website change since $base: skipping the build."; exit 0 ;;
  1) echo "Website changed since $base: building."; exit 1 ;;
  *) echo "Could not compare with $base: building."; exit 1 ;;
esac
