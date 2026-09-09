# 部署说明（阿里云轻量服务器 · Ubuntu 24.04）

本站已从 GitHub Pages 迁移到自建服务器，通过 **服务器定时 `git pull` + nginx 静态托管** 发布。

## 架构

```
GitHub 仓库 main
   │  ① GitHub Action（update-projects.yml）每 6h 更新 projects.json 并提交
   │
   ▼  ② 服务器每 2 分钟 git fetch + ff-only 合并
/opt/personal-website          ← git 克隆（含 .git / .github / scripts）
   │  rsync（排除 .git/.github/scripts/deploy）
   ▼
/var/www/personal-website      ← nginx 站点根（仅 index.html + projects.json）
   │
   ▼
nginx (80 → 301 → 443) + Let's Encrypt
```

| 项 | 值 |
|---|---|
| 域名 | `yghsite.cn`、`www.yghsite.cn` |
| 服务器 | 8.134.237.122（阿里云轻量，Ubuntu 24.04） |
| 站点根 | `/var/www/personal-website` |
| 仓库克隆 | `/opt/personal-website` |
| 部署脚本 | `/usr/local/bin/personal-website-deploy.sh` |
| 定时器 | `personal-website-deploy.timer`（每 2 分钟） |
| 日志 | `journalctl -u personal-website-deploy.service` |

> 同机还有 `blog.yghsite.cn`（WordPress）与 `memos.yghsite.cn`（Memos 反代），
> 本站配置独立成 `sites-available/personal-website`，不触碰它们。

## 首次部署（重建服务器时用）

```bash
# 1. 克隆仓库
git clone https://github.com/flechazoyang-google/personal-website.git /opt/personal-website
mkdir -p /var/www/personal-website

# 2. 安装部署脚本与定时器
install -m 755 deploy/personal-website-deploy.sh /usr/local/bin/personal-website-deploy.sh
cp deploy/systemd/personal-website-deploy.service /etc/systemd/system/
cp deploy/systemd/personal-website-deploy.timer   /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now personal-website-deploy.timer

# 3. nginx 站点
cp deploy/nginx/personal-website.conf /etc/nginx/sites-available/personal-website
ln -sfn /etc/nginx/sites-available/personal-website /etc/nginx/sites-enabled/personal-website
nginx -t && systemctl reload nginx

# 4. HTTPS
certbot --nginx -d yghsite.cn -d www.yghsite.cn \
  --non-interactive --agree-tos --redirect -m <你的邮箱>
```

## 日常发布

推送到 `main` 即可，服务器 2 分钟内自动同步：

```bash
git push origin main
# 想立刻生效，不等定时器：
ssh root@8.134.237.122 systemctl start personal-website-deploy.service
```

## 排障

```bash
# 看最近一次部署
journalctl -u personal-website-deploy.service -n 30 --no-pager

# 手动跑一次
systemctl start personal-website-deploy.service

# 确认服务器 HEAD 与远程一致
git -C /opt/personal-website log --oneline -1

# 确认 web 根内容
ls -la /var/www/personal-website

# nginx 配置校验 / 重载
nginx -t && systemctl reload nginx
```

常见问题：

| 现象 | 原因与处理 |
|---|---|
| 站点 404 | 忘记 `systemctl reload nginx`；或 server_name 写错 |
| 部署脚本报 `Not possible to fast-forward` | 服务器仓库被本地改动过：`git -C /opt/personal-website status` 后手动处理 |
| 证书续期 | certbot 自带 `systemd` 定时任务，`certbot renew --dry-run` 可验证 |
| GitHub 拉取慢/失败 | 本机实测 1.8s 可拉；若网络抖动，定时器下一轮会自动重试 |

## 与 GitHub Pages 的关系

已关闭 GitHub Pages（仓库 Settings → Pages → Source: None）。
`index.html` 里对 `projects.json` 的引用是相对路径，迁移后无需改动。
