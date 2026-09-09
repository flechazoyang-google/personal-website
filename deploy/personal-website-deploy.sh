#!/usr/bin/env bash
# 从 GitHub 拉取 personal-website 并同步到 nginx web 根目录。
#
# 部署位置：/usr/local/bin/personal-website-deploy.sh
# 触发方式：personal-website-deploy.timer（每 2 分钟）
#
# 设计要点：
#   - 只做 `merge --ff-only`：服务器上有任何本地改动就直接失败，绝不覆盖
#   - 同步时排除 .git / .github / scripts / deploy，web 根目录只保留站点文件
#   - 无改动时零开销退出（只做一次 fetch）
set -euo pipefail

REPO_DIR=/opt/personal-website
WEB_ROOT=/var/www/personal-website

cd "$REPO_DIR"
git fetch --quiet origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "up-to-date $LOCAL"
  exit 0
fi

git merge --ff-only origin/main
rsync -a --delete \
  --exclude=".git" --exclude=".github" --exclude="scripts" \
  --exclude=".claude" --exclude=".gitignore" --exclude="deploy" \
  "$REPO_DIR"/ "$WEB_ROOT"/
echo "deployed $LOCAL -> $REMOTE"
