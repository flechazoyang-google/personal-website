#!/usr/bin/env node

/**
 * update-projects.js  v1.3
 * 从 GitHub / Gitee API 拉取最新 release，更新 projects.json 的版本号与下载链接。
 *
 * v1.3 变更：
 *   - toolbox 改为 GitHub 源（flechazoyang-google/tools）
 *   - GitHub 源改用 /releases/latest，同时解析 APK 资产直链写入下载按钮
 *
 * 用法:
 *   node scripts/update-projects.js            # 正常更新
 *   node scripts/update-projects.js --dry-run  # 仅打印，不写入
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const PROJECTS_FILE = path.join(__dirname, '..', 'projects.json');

const REPOS = {
  'toolbox': {
    source: 'github',
    owner: 'flechazoyang-google',
    repo: 'tools',
    downloadLabel: '下载最新版',
    // 旧 tag（v1.2.x / v1.3.x）属于上一代 com.example.toolbox，
    // 因此不用 tag 兜底，只认正式 Release
    useTagsFallback: false
  }
};

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'flechazo-portfolio-updater',
      'Accept': 'application/json'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

/** 取最新正式 Release：版本号 + APK 资产直链。 */
async function getLatestGitHubRelease(owner, repo, useTagsFallback = true) {
  try {
    const data = await fetchJSON(
      `https://api.github.com/repos/${owner}/${repo}/releases/latest`
    );
    if (data.tag_name) {
      const apk = (data.assets || []).find(a => /\.apk$/i.test(a.name || ''));
      return {
        stable: data.tag_name,
        apkUrl: apk ? apk.browser_download_url : null,
        htmlUrl: data.html_url || null
      };
    }
  } catch (err) {
    if (!useTagsFallback) return {};
  }

  if (!useTagsFallback) return {};

  const tags = await fetchJSON(
    `https://api.github.com/repos/${owner}/${repo}/tags?per_page=20`
  );
  if (Array.isArray(tags) && tags.length > 0) {
    const isPreview = t => /preview|alpha|beta|rc|dev/i.test(t.name);
    const stable = tags.find(t => !isPreview(t));
    const preview = tags.find(t => isPreview(t));
    return {
      stable: stable ? stable.name : null,
      preview: preview ? preview.name : null
    };
  }
  return {};
}

async function getGiteeReleases(owner, repo) {
  const data = await fetchJSON(
    `https://gitee.com/api/v5/repos/${owner}/${repo}/releases?per_page=20&page=1&direction=desc`
  );
  if (!Array.isArray(data) || data.length === 0) return {};

  const isPreview = r => /preview|alpha|beta|rc|dev/i.test(r.tag_name || r.name || '');
  const stable = data.find(r => !isPreview(r));
  const preview = data.find(r => isPreview(r));

  return {
    stable: stable ? (stable.tag_name || stable.name) : null,
    preview: preview ? (preview.tag_name || preview.name) : null
  };
}

async function getRepoInfo(source, owner, repo) {
  if (source === 'github') {
    const data = await fetchJSON(`https://api.github.com/repos/${owner}/${repo}`);
    return { stars: data.stargazers_count || 0, language: data.language || null };
  }
  const data = await fetchJSON(`https://gitee.com/api/v5/repos/${owner}/${repo}`);
  return { stars: data.stargazers_count || 0, language: data.language || null };
}

/** 把 APK 直链写进 links：已有 download 链接就更新，否则追加。 */
function upsertDownloadLink(project, url, label) {
  if (!url) return false;
  if (!Array.isArray(project.links)) project.links = [];
  const existing = project.links.find(l => l && l.download);
  if (existing) {
    const changed = existing.url !== url || existing.label !== label;
    existing.label = label;
    existing.url = url;
    return changed;
  }
  project.links.push({ label, url, download: true });
  return true;
}

async function main() {
  console.log(DRY_RUN ? '[DRY RUN] 模式，不会写入文件\n' : '');
  console.log('=== 开始更新 projects.json ===\n');

  let projectsData;
  try {
    projectsData = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf-8'));
  } catch (err) {
    console.error('❌ 读取 projects.json 失败:', err.message);
    process.exit(1);
  }

  const changes = [];

  for (const project of projectsData.projects) {
    const config = REPOS[project.id];
    if (!config) {
      console.log(`⚠️  未找到 ${project.id} 的仓库配置，跳过`);
      continue;
    }

    console.log(`📦 ${project.name}`);
    console.log(`   ${config.source}: ${config.owner}/${config.repo}`);

    try {
      let versions = {};
      if (config.source === 'github') {
        versions = await getLatestGitHubRelease(
          config.owner, config.repo, config.useTagsFallback !== false
        );
      } else {
        versions = await getGiteeReleases(config.owner, config.repo);
      }

      const repoInfo = await getRepoInfo(config.source, config.owner, config.repo);

      if (versions.stable) {
        if (versions.stable !== project.version) {
          console.log(`   🔄 稳定版: ${project.version} → ${versions.stable}`);
          project.version = versions.stable;
          changes.push(`${project.name} 稳定版: ${versions.stable}`);
        } else {
          console.log(`   ✅ 稳定版已是最新: ${versions.stable}`);
        }
      } else {
        console.log('   ⚠️  未找到 release 信息（保持原版本号）');
      }

      if (versions.apkUrl) {
        const label = config.downloadLabel || '下载最新版';
        const changed = upsertDownloadLink(project, versions.apkUrl, label);
        if (changed) {
          console.log(`   🔗 下载链接: ${versions.apkUrl}`);
          changes.push(`${project.name} 下载链接已更新`);
        } else {
          console.log('   ✅ 下载链接已是最新');
        }
      } else if (config.source === 'github') {
        console.log('   ⚠️  Release 中没有 .apk 资产，保留原下载链接');
      }

      if (repoInfo) {
        console.log(`   ⭐ Stars: ${repoInfo.stars}`);
        if (repoInfo.language) console.log(`   💻 语言: ${repoInfo.language}`);
      }
    } catch (err) {
      console.error(`   ❌ 获取失败: ${err.message}`);
    }

    console.log('');
  }

  if (!DRY_RUN) {
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projectsData, null, 2) + '\n', 'utf-8');
    console.log('✅ projects.json 已更新');
  } else {
    console.log('[DRY RUN] 以上变更未写入文件');
  }

  if (changes.length > 0) {
    console.log('\n📋 变更摘要:');
    changes.forEach(c => console.log(`   - ${c}`));
  } else {
    console.log('\n📋 无版本变更');
  }
}

main().catch(err => {
  console.error('❌ 脚本执行失败:', err);
  process.exit(1);
});
