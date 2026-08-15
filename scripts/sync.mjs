#!/usr/bin/env node
/**
 * DSH Plugin Hub — 数据同步脚本
 * 通过 GitHub Search API 抓取所有 topic:dsh-plugin 的公开仓库，
 * 提取关键字段，做相关性过滤 + 智能分类，生成 web/plugins.json 快照。
 *
 * 用法: node sync.mjs [--out ../web/plugins.json]
 * 说明: GitHub 未认证搜索 API 限 10 req/min，脚本内置限流（约 7s/请求）。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, process.argv[3] || '../web/plugins.json');
const PER_PAGE = 100;
const MAX_PAGE = 10; // search API 最多返回 1000 条
const DELAY_MS = 7000; // 10 req/min => 每 7 秒一个

const API = 'https://api.github.com/search/repositories?q=topic:dsh-plugin&sort=stars&order=desc&per_page=' + PER_PAGE + '&page=';
// 支持通过环境变量 GITHUB_TOKEN 认证（CI 中可获更高 API 配额）
const TOKEN = process.env.GITHUB_TOKEN || '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(page) {
  const res = await fetch(API + page, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'dsh-plugin-hub-sync',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(TOKEN ? { 'Authorization': 'Bearer ' + TOKEN } : {}),
    },
  });
  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get('x-ratelimit-reset');
    const wait = reset ? (Number(reset) * 1000 - Date.now()) + 2000 : 65000;
    console.warn(`  [rate-limit] 等待 ${Math.round(wait / 1000)}s ...`);
    await sleep(wait);
    return fetchPage(page);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} on page ${page}`);
  return res.json();
}

function pick(repo) {
  return {
    name: repo.name || '',
    full_name: repo.full_name || '',
    owner: repo.owner ? repo.owner.login : '',
    avatar: repo.owner ? repo.owner.avatar_url : '',
    html_url: repo.html_url || '',
    homepage: repo.homepage || '',
    description: repo.description || '',
    stars: repo.stargazers_count || 0,
    forks: repo.forks_count || 0,
    language: repo.language || '',
    topics: repo.topics || [],
    license: repo.license ? repo.license.spdx_id : '',
    created_at: repo.created_at || '',
    updated_at: repo.updated_at || '',
    pushed_at: repo.pushed_at || '',
    archived: !!repo.archived,
    fork: !!repo.fork,
  };
}

// ============ 相关性过滤 ============
// 排除官方本体 + 无 DSH/DeepSeek 信号（蹭 dsh-plugin 标签）的仓库
const BODY_REPOS = new Set(['deepseek-ai/deepseek-harness']);
function isRelevant(repo) {
  if (BODY_REPOS.has(repo.full_name)) return false;
  const hay = (repo.name + ' ' + repo.description).toLowerCase();
  return /dsh|deepseek|deep-seek/.test(hay);
}

// ============ 智能分类 ============
const CATEGORIES = [
  { id: 'ui', label: 'UI 与界面增强', emoji: '🎨', color: '#6366f1', desc: 'Web UI、侧边栏、终端、皮肤主题、面板增强',
    kw: ['web-ui','webui','sidebar','tui','skin','theme','panel','widget','dashboard','interface','desktop','tab','界面','皮肤','主题','侧边栏','面板','看板','桌面'] },
  { id: 'agent', label: 'Agent 编排与协作', emoji: '🤖', color: '#8b5cf6', desc: '多 Agent 团队、子代理、工作流编排、任务协作',
    kw: ['multi-agent','multiagent','subagent','sub-agent','agent-team','agent-teams','orchestrat','workflow','swarm','crew','collaborat','team','团队','协作','编排','多智能体','工作流'] },
  { id: 'memory', label: '记忆与知识', emoji: '🧠', color: '#ec4899', desc: '跨会话记忆、长期记忆、知识库、上下文管理',
    kw: ['memory','context','knowledge','remember','recall','archive','obsidian','notebook','记忆','上下文','知识','笔记'] },
  { id: 'vision', label: '视觉与多模态', emoji: '👁️', color: '#14b8a6', desc: '图像理解、OCR、视觉模型、多模态',
    kw: ['vision','ocr','image','screenshot','multimodal','vlm','visual','picture','photo','视觉','图像','图片','截图','看图'] },
  { id: 'dev', label: '开发与工具链', emoji: '🛠️', color: '#f59e0b', desc: '代码编辑、Git、终端、调试、SDK、CLI',
    kw: ['git','code','editor','sdk','cli','terminal','shell','debug','lint','testing','build','browser','npm','eslint','typescript','代码','调试','终端','开发'] },
  { id: 'data', label: '数据与搜索', emoji: '📊', color: '#22c55e', desc: '数据研究、搜索、数据库、爬虫、API 接入',
    kw: ['data','search','database','scrape','crawl','api','research','query','sql','crawler','数据','搜索','数据库','检索','爬虫'] },
  { id: 'integration', label: '集成与迁移', emoji: '🔌', color: '#0ea5e9', desc: '第三方服务接入、Claude/其他平台迁移桥接',
    kw: ['bridge','migrate','import','export','connector','integrat','claude','cursor','notion','github','slack','wechat','feishu','telegram','discord','迁移','桥接','接入','导入','导出','集成'] },
  { id: 'productivity', label: '效率与协作', emoji: '⚡', color: '#ef4444', desc: '任务管理、快捷键、效率工具、协作办公',
    kw: ['todo','task','productivity','shortcut','efficien','share','效率','任务','分享','快捷键'] },
  { id: 'fun', label: '娱乐与彩蛋', emoji: '🎮', color: '#f97316', desc: '小游戏、电子宠物、趣味彩蛋、整活插件',
    kw: ['game','pet','whale','fun','play','manner','manners','meme','troll','ads','minigame','mascot','游戏','宠物','彩蛋','娱乐','鲸鱼'] },
  { id: 'security', label: '安全与治理', emoji: '🔐', color: '#64748b', desc: '权限、沙箱、安全审计、合规',
    kw: ['security','sandbox','permission','auth','audit','safe','guard','安全','沙箱','权限','审计'] },
];

const CJK = /[\u4e00-\u9fff]/;
function kwToRegex(k) {
  const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^a-z0-9])' + esc + '([^a-z0-9]|$)', 'i');
}

function classify(repo) {
  const haystack = [repo.name, repo.full_name, repo.description, (repo.topics || []).join(' ')].join(' ').toLowerCase();
  let best = 'other', bestScore = 0;
  for (const cat of CATEGORIES) {
    let score = 0;
    for (const k of cat.kw) {
      if (CJK.test(k)) { if (haystack.includes(k)) score += 2; }
      else if (kwToRegex(k).test(haystack)) score += 2;
    }
    if (score > bestScore) { bestScore = score; best = cat.id; }
  }
  return best;
}

// ============ 主流程 ============
async function main() {
  console.log('DSH Plugin Hub — 开始同步插件市场数据 ...');
  const first = await fetchPage(1);
  const total = first.total_count ?? 0;
  console.log(`  共发现 ${total} 个 dsh-plugin 仓库，抓取前 ${Math.min(total, MAX_PAGE * PER_PAGE)} 条 ...`);

  const repos = [];
  repos.push(...(first.items || []).map(pick));

  const pages = Math.min(Math.ceil(total / PER_PAGE), MAX_PAGE);
  for (let p = 2; p <= pages; p++) {
    await sleep(DELAY_MS);
    console.log(`  抓取第 ${p}/${pages} 页 ...`);
    const data = await fetchPage(p);
    repos.push(...(data.items || []).map(pick));
  }

  // 去重
  const seen = new Set();
  const uniq = repos.filter((r) => { if (!r.full_name || seen.has(r.full_name)) return false; seen.add(r.full_name); return true; });

  // 相关性过滤 + 分类
  const relevant = uniq.filter(isRelevant).map((r) => ({ ...r, category: classify(r) }));

  const payload = {
    generated_at: new Date().toISOString(),
    total_count: total,
    fetched: relevant.length,
    categories: CATEGORIES.map(({ id, label, emoji, color, desc }) => ({ id, label, emoji, color, desc })),
    plugins: relevant,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`  ✅ 已写入 ${relevant.length} 个插件到 ${OUT}`);
  console.log(`  生成时间: ${payload.generated_at}`);
}

main().catch((e) => { console.error('同步失败:', e.message); process.exit(1); });
