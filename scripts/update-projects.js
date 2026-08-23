#!/usr/bin/env node

/**
 * update-projects.js  v1.1
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
    source: 'github',
    owner: 'flechazoyang-google',
    repo: 'coc-war-tool'
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
    if (data.tag_name) return data.tag_name;
  } catch (_) {}

  const tags = await fetchJSON(
    `https://api.github.com/repos/${owner}/${repo}/tags?per_page=20`
  );
  if (Array.isArray(tags) && tags.length > 0) {
    const stable = tags.find(t => !/preview|alpha|beta|rc|dev/i.test(t.name));
    return (stable || tags[0]).name;
  }
  return null;
}

async function getLatestGiteeRelease(owner, repo) {
  const data = await fetchJSON(
    `https://gitee.com/api/v5/repos/${owner}/${repo}/releases?per_page=1&page=1&direction=desc`
  );
  if (Array.isArray(data) && data.length > 0) {
    return data[0].tag_name || data[0].name || null;
  }
  return null;
}

async function getGitHubDescription(owner, repo) {
  const data = await fetchJSON(`https://api.github.com/repos/${owner}/${repo}`);
  return {
    description: data.description || null,
    stars: data.stargazers_count || 0,
    language: data.language || null
  };
}

async function getGiteeDescription(owner, repo) {
  const data = await fetchJSON(`https://gitee.com/api/v5/repos/${owner}/${repo}`);
  return {
    description: data.description || null,
    stars: data.stargazers_count || 0,
    language: data.language || null
  };
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
      let latestVersion = null;
      let repoInfo = null;

      if (config.source === 'github') {
        console.log(`   GitHub: ${config.owner}/${config.repo}`);
        latestVersion = await getLatestGitHubRelease(config.owner, config.repo);
        repoInfo = await getGitHubDescription(config.owner, config.repo);
      } else if (config.source === 'gitee') {
        console.log(`   Gitee: ${config.owner}/${config.repo}`);
        latestVersion = await getLatestGiteeRelease(config.owner, config.repo);
        repoInfo = await getGiteeDescription(config.owner, config.repo);
      }

      if (latestVersion && latestVersion !== project.version) {
        console.log(`   🔄 版本更新: ${project.version} → ${latestVersion}`);
        project.version = latestVersion;
        changes.push(`${project.name}: ${latestVersion}`);
      } else if (latestVersion) {
        console.log(`   ✅ 版本已是最新: ${latestVersion}`);
      } else {
        console.log(`   ⚠️  未找到 release 信息`);
      }

      if (repoInfo) {
        if (repoInfo.stars !== undefined) {
          console.log(`   ⭐ Stars: ${repoInfo.stars}`);
        }
        if (repoInfo.language) {
          console.log(`   💻 语言: ${repoInfo.language}`);
        }
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
