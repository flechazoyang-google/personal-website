#!/usr/bin/env node

/**
 * update-projects.js  v1.2
 * 从 GitHub / Gitee API 拉取最新 release 版本，更新 projects.json
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
  'coc-war': {
    source: 'gitee',
    owner: 'yang-genhao',
    repo: 'coc-war-tool',
    apkPattern: 'COCtools-{version}.apk',
    trackPreview: true
  },
  'toolbox': {
    source: 'gitee',
    owner: 'yang-genhao',
    repo: 'tools'
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

async function getLatestGitHubRelease(owner, repo) {
  try {
    const data = await fetchJSON(
      `https://api.github.com/repos/${owner}/${repo}/releases/latest`
    );
    if (data.tag_name) return { stable: data.tag_name };
  } catch (_) {}

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

function buildDownloadUrl(config, version) {
  if (!config.apkPattern) return null;
  const filename = config.apkPattern.replace('{version}', version);
  return `https://gitee.com/${config.owner}/${config.repo}/releases/download/${version}/${filename}`;
}

function updateDownloadLinks(project, config, stableVersion, previewVersion) {
  if (!config.apkPattern) return;

  const stableUrl = buildDownloadUrl(config, stableVersion);
  const previewUrl = previewVersion ? buildDownloadUrl(config, previewVersion) : null;

  project.links = project.links.map(link => {
    if (link.label === '下载稳定版' && stableUrl) {
      return { ...link, url: stableUrl };
    }
    if (link.label === '下载体验版' && previewUrl) {
      return { ...link, url: previewUrl };
    }
    return link;
  });
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

    try {
      let versions = {};
      let repoInfo = null;

      console.log(`   ${config.source}: ${config.owner}/${config.repo}`);

      if (config.source === 'github') {
        versions = await getLatestGitHubRelease(config.owner, config.repo);
      } else {
        versions = await getGiteeReleases(config.owner, config.repo);
      }

      repoInfo = await getRepoInfo(config.source, config.owner, config.repo);

      if (versions.stable) {
        if (versions.stable !== project.version) {
          console.log(`   🔄 稳定版: ${project.version} → ${versions.stable}`);
          project.version = versions.stable;
          changes.push(`${project.name} 稳定版: ${versions.stable}`);
        } else {
          console.log(`   ✅ 稳定版已是最新: ${versions.stable}`);
        }
      }

      if (config.trackPreview && versions.preview) {
        if (versions.preview !== project.previewVersion) {
          console.log(`   🔄 预览版: ${project.previewVersion || '无'} → ${versions.preview}`);
          project.previewVersion = versions.preview;
          changes.push(`${project.name} 预览版: ${versions.preview}`);
        } else {
          console.log(`   ✅ 预览版已是最新: ${versions.preview}`);
        }
      }

      if (versions.stable) {
        updateDownloadLinks(project, config, versions.stable, config.trackPreview ? versions.preview : null);
      }

      if (!versions.stable) {
        console.log(`   ⚠️  未找到 release 信息`);
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
    console.log(`\n📋 变更摘要:`);
    changes.forEach(c => console.log(`   - ${c}`));
  } else {
    console.log('\n📋 无版本变更');
  }
}

main().catch(err => {
  console.error('❌ 脚本执行失败:', err);
  process.exit(1);
});
