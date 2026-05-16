#!/bin/bash
set -euo pipefail

# ReszVault — rewrite local git history with dated frontend/backend commits.
# WARNING: Destroys .git and force-pushes main. Back up first.

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

rm -rf .git
git init
git remote add origin https://github.com/swarn007-byte/ReszVault.git

# Root ignore (applied before any commits)
cat > .gitignore <<'EOF'
node_modules/
dist/
out/
build/
.cache/
coverage/
*.tsbuildinfo
__pycache__/
*.pyc
.DS_Store

.env
.env.*
!.env.example

logs/
*.log

backend/data/
frontend/.vercel/
EOF

commit_if_staged() {
  if git diff --cached --quiet; then
    echo "  (nothing to commit — skipping)"
  else
    git commit -m "$1"
  fi
}

# ----------------------------------------------------
# FRONTEND COMMITS (May 6, 7, 8, 9, 10)
# ----------------------------------------------------

# May 6 - 07:43 AM — frontend tooling & config
export GIT_COMMITTER_DATE="2026-05-06 07:43:21"
export GIT_AUTHOR_DATE="2026-05-06 07:43:21"
git add .gitignore
git add frontend/package.json frontend/package-lock.json frontend/bun.lock 2>/dev/null || true
git add frontend/vite.config.ts frontend/tailwind.config.js frontend/eslint.config.js 2>/dev/null || true
git add frontend/tsconfig.json frontend/tsconfig.app.json frontend/tsconfig.node.json 2>/dev/null || true
git add frontend/index.html frontend/.env.example frontend/.gitignore 2>/dev/null || true
commit_if_staged "vibed frntd"

# May 7 - 12:28 PM — components
export GIT_COMMITTER_DATE="2026-05-07 12:28:14"
export GIT_AUTHOR_DATE="2026-05-07 12:28:14"
git add frontend/src/components/ 2>/dev/null || true
commit_if_staged "vibed frntd"

# May 8 - 04:15 PM — pages & public assets
export GIT_COMMITTER_DATE="2026-05-08 16:15:47"
export GIT_AUTHOR_DATE="2026-05-08 16:15:47"
git add frontend/src/pages/ frontend/public/ 2>/dev/null || true
commit_if_staged "vibed frntd"

# May 9 - 09:32 PM — styles
export GIT_COMMITTER_DATE="2026-05-09 21:32:05"
export GIT_AUTHOR_DATE="2026-05-09 21:32:05"
git add frontend/src/index.css 2>/dev/null || true
commit_if_staged "vibed frntd"

# May 10 - 11:04 AM — remaining frontend (api, hooks, store, routes, etc.)
export GIT_COMMITTER_DATE="2026-05-10 11:04:59"
export GIT_AUTHOR_DATE="2026-05-10 11:04:59"
git add frontend/src/ frontend/vercel.json frontend/README.md 2>/dev/null || true
commit_if_staged "vibed frntd"

# ----------------------------------------------------
# BACKEND COMMITS (May 11, 13, 15, 16)
# ----------------------------------------------------

# May 11 - 02:49 PM — backend entry & package setup
export GIT_COMMITTER_DATE="2026-05-11 14:49:12"
export GIT_AUTHOR_DATE="2026-05-11 14:49:12"
git add backend/index.ts backend/package.json backend/package-lock.json backend/bun.lock 2>/dev/null || true
git add backend/tsconfig.json backend/.env.example backend/.gitignore 2>/dev/null || true
commit_if_staged "vibed bkend"

# May 13 - 08:19 AM — lib (auth, session, ingest)
export GIT_COMMITTER_DATE="2026-05-13 08:19:33"
export GIT_AUTHOR_DATE="2026-05-13 08:19:33"
git add backend/lib/ 2>/dev/null || true
commit_if_staged "vibed bkend"

# May 15 - 06:57 PM — prisma schema & DB config
export GIT_COMMITTER_DATE="2026-05-15 18:57:04"
export GIT_AUTHOR_DATE="2026-05-15 18:57:04"
git add backend/prisma/ backend/prisma.config.ts 2>/dev/null || true
commit_if_staged "vibed bkend"

# May 16 - 01:22 PM — root deploy config & anything left
export GIT_COMMITTER_DATE="2026-05-16 13:22:18"
export GIT_AUTHOR_DATE="2026-05-16 13:22:18"
git add render.yaml backend/README.md backend/.cursor/ 2>/dev/null || true
git add -A
commit_if_staged "vibed bkend"

# ----------------------------------------------------
# PUSH
# ----------------------------------------------------
git branch -M main
git push -u origin main --force

echo "Successfully re-vibed your GitHub timeline!"
