/* ===== DSH Plugin Hub — 前端逻辑 ===== */
(function () {
  'use strict';

  // ---------- 全局状态 ----------
  let DATA = null; // { generated_at, total_count, fetched, categories, plugins }
  const state = {
    category: 'all',
    sort: 'stars',
    order: 'desc',
    search: '',
    filter: null, // 'hot' | 'new' | 'cn' | 'active'
    visibleCount: 60,
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ---------- 工具 ----------
  function fmt(n) {
    if (n == null) return '0';
    if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1) + ' 万';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }
  function timeAgo(iso) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    const diff = Date.now() - t;
    const m = Math.floor(diff / 60000);
    if (m < 60) return m <= 0 ? '刚刚' : m + ' 分钟前';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' 小时前';
    const d = Math.floor(h / 24);
    if (d < 30) return d + ' 天前';
    const mo = Math.floor(d / 30);
    if (mo < 12) return mo + ' 个月前';
    return Math.floor(mo / 12) + ' 年前';
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LANG_COLORS = {
    TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5', Go: '#00ADD8', Rust: '#dea584',
    Java: '#b07219', 'C++': '#f34b7d', C: '#555555', 'C#': '#178600', Shell: '#89e051', HTML: '#e34c26',
    CSS: '#563d7c', Vue: '#41b883', Ruby: '#701516', Kotlin: '#A97BFF', Swift: '#F05138', Lua: '#000080',
  };
  const catMap = {};
  const catOf = (id) => catMap[id] || null;

  // 插件安装类型（基于仓库元数据推测，与 DSH 插件市场的四类识别一致）
  const TYPE_INFO = {
    skill: { label: 'Skill', color: '#ec4899', hint: '含 SKILL.md，安装到 ~/.dsh/skills/' },
    preset: { label: 'Agent 预设', color: '#8b5cf6', hint: '含 preset.yml，安装到 ~/.dsh/.agent-presets/' },
    script: { label: '安装脚本', color: '#f59e0b', hint: '含 install.sh / install.ps1，运行脚本安装' },
    plugin: { label: 'Cordis 插件', color: '#22c55e', hint: 'npm 包，注册进 cordis.patch.yml' },
  };
  function detectType(p) {
    const h = ((p.name || '') + ' ' + (p.description || '')).toLowerCase();
    if (/skill/.test(h)) return 'skill';
    if (/preset/.test(h)) return 'preset';
    if (/installer|install\.sh|install\.ps1|setup\.sh/.test(h)) return 'script';
    return 'plugin';
  }
  function fallbackCopy(text, cb) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); cb(); } catch (e) { toast('复制失败，请手动复制'); }
    document.body.removeChild(ta);
  }
  function copyText(text) {
    const done = () => toast('✅ 已复制到剪贴板');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else { fallbackCopy(text, done); }
  }

  // ---------- 数据加载 ----------
  async function loadData() {
    const badge = $('#heroBadgeText');
    try {
      const res = await fetch('plugins.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      DATA = await res.json();
      DATA.categories.forEach((c) => (catMap[c.id] = c));
      badge.textContent = `已连接插件市场 · 收录 ${DATA.fetched} 个插件`;
    } catch (e) {
      badge.textContent = '⚠️ 数据加载失败，请通过本地服务器访问';
      console.error('load plugins.json failed:', e);
      return;
    }
    renderAll();
    maybeLiveRefresh();
  }

  // 尝试实时刷新 Top 100 星标（浏览器端，30 分钟缓存）
  async function maybeLiveRefresh() {
    const KEY = 'dsh_ph_refresh';
    try {
      const cached = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (cached && Date.now() - cached.t < 30 * 60 * 1000) return;
      const res = await fetch('https://api.github.com/search/repositories?q=topic:dsh-plugin&sort=stars&order=desc&per_page=100', {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!res.ok) return;
      const j = await res.json();
      const map = {};
      (j.items || []).forEach((r) => (map[r.full_name] = { stars: r.stargazers_count, forks: r.forks_count, pushed_at: r.pushed_at, description: r.description }));
      let changed = 0;
      DATA.plugins.forEach((p) => {
        const fresh = map[p.full_name];
        if (fresh && fresh.stars !== p.stars) { p.stars = fresh.stars; p.forks = fresh.forks; p.pushed_at = fresh.pushed_at || p.pushed_at; changed++; }
      });
      localStorage.setItem(KEY, JSON.stringify({ t: Date.now() }));
      if (changed > 0) { renderAll(); toast(`✨ 已实时刷新 ${changed} 个插件的星标数据`); }
    } catch (e) { /* 静默降级 */ }
  }

  // ---------- 渲染 ----------
  function renderAll() {
    renderStats();
    renderCategories();
    renderRank();
    renderGrid();
  }

  function renderStats() {
    const sum = DATA.plugins.reduce((a, p) => a + (p.stars || 0), 0);
    $('#statPlugins').textContent = DATA.fetched;
    $('#statStars').textContent = fmt(sum);
    $('#statCats').textContent = DATA.categories.length;
    $('#statUpdated').textContent = timeAgo(DATA.generated_at);
    $('#asstCount').textContent = DATA.fetched;
  }

  function renderCategories() {
    const bar = $('#catBar');
    const chips = DATA.categories.map((c) => {
      const n = DATA.plugins.filter((p) => p.category === c.id).length;
      return `<button class="cat-chip" data-cat="${c.id}" style="--cat:${c.color}"><span class="cat-emoji">${c.emoji}</span>${esc(c.label)}<span class="cat-count">${n}</span></button>`;
    }).join('');
    const total = DATA.plugins.length;
    bar.innerHTML = `<button class="cat-chip active" data-cat="all"><span class="cat-emoji">✨</span>全部<span class="cat-count">${total}</span></button>` + chips;
    bar.querySelectorAll('.cat-chip').forEach((el) => el.addEventListener('click', () => {
      state.category = el.dataset.cat;
      state.visibleCount = 60;
      bar.querySelectorAll('.cat-chip').forEach((x) => x.classList.remove('active'));
      el.classList.add('active');
      renderGrid();
    }));
  }

  function getSortedPlugins() {
    const arr = DATA.plugins.slice();
    const key = state.sort;
    const cmp = (a, b) => {
      let va, vb;
      if (key === 'stars') { va = a.stars || 0; vb = b.stars || 0; }
      else if (key === 'forks') { va = a.forks || 0; vb = b.forks || 0; }
      else { va = new Date(a[key === 'created' ? 'created_at' : 'pushed_at'] || 0).getTime(); vb = new Date(b[key === 'created' ? 'created_at' : 'pushed_at'] || 0).getTime(); }
      return state.order === 'asc' ? va - vb : vb - va;
    };
    arr.sort(cmp);
    return arr;
  }

  function applyFilters(list) {
    return list.filter((p) => {
      if (state.category !== 'all' && p.category !== state.category) return false;
      if (state.search) {
        const q = state.search.toLowerCase();
        const hay = (p.name + ' ' + p.full_name + ' ' + p.description + ' ' + (p.topics || []).join(' ')).toLowerCase();
        if (!q.split(/\s+/).every((t) => hay.includes(t))) return false;
      }
      if (state.filter === 'hot' && (p.stars || 0) < 100) return false;
      if (state.filter === 'new') {
        const days = (Date.now() - new Date(p.created_at || 0).getTime()) / 86400000;
        if (days > 7) return false;
      }
      if (state.filter === 'active') {
        const days = (Date.now() - new Date(p.pushed_at || 0).getTime()) / 86400000;
        if (days > 30) return false;
      }
      if (state.filter === 'cn' && !/[一-龥]/.test(p.description || '')) return false;
      return true;
    });
  }

  function cardHTML(p, i) {
    const cat = catOf(p.category);
    const langColor = LANG_COLORS[p.language] || '#94a3b8';
    const rank = state.sort === 'stars' && state.order === 'desc' && state.category === 'all' && !state.search && !state.filter && i < 3;
    return `
      <article class="plugin-card" data-full="${esc(p.full_name)}" style="animation-delay:${Math.min(i % 12, 11) * 30}ms">
        ${rank ? `<span class="rank-badge">TOP ${i + 1}</span>` : ''}
        <span class="cat-badge" style="background:${cat ? cat.color : '#64748b'}">${cat ? cat.emoji + ' ' + esc(cat.label) : '其他'}</span>
        <div class="top">
          <div class="plugin-avatar"><img src="${esc(p.avatar)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" /></div>
          <div>
            <div class="plugin-name">${esc(p.name)}</div>
            <div class="plugin-owner">${esc(p.owner)}</div>
          </div>
        </div>
        <div class="plugin-desc">${esc(p.description) || '暂无描述'}</div>
        <div class="plugin-meta">
          <span class="meta-item meta-stars">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/></svg>
            ${fmt(p.stars)}
          </span>
          <span class="meta-item">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0Z"/></svg>
            ${fmt(p.forks)}
          </span>
          <span class="meta-item"><span class="lang-dot" style="background:${langColor}"></span>${esc(p.language) || '—'}</span>
          <span class="meta-item" style="margin-left:auto">${timeAgo(p.pushed_at)}</span>
        </div>
      </article>`;
  }

  function renderGrid() {
    const list = applyFilters(getSortedPlugins());
    const grid = $('#pluginGrid');
    $('#resultCount').textContent = `共 ${list.length} 个插件 · 数据每日自动同步`;
    $('#resultSummary').textContent = `显示 ${Math.min(state.visibleCount, list.length)} / ${list.length} 个`;

    const visible = list.slice(0, state.visibleCount);
    grid.innerHTML = visible.map((p, i) => cardHTML(p, i)).join('') || `<div class="empty"><div class="big">🔍</div>没有找到匹配的插件，换个关键词试试吧</div>`;

    grid.querySelectorAll('.plugin-card').forEach((el) => el.addEventListener('click', () => openModal(el.dataset.full)));

    const btn = $('#loadMore');
    if (list.length > state.visibleCount) {
      btn.style.display = 'inline-block';
      btn.disabled = false;
    } else {
      btn.style.display = 'none';
    }
  }

  function renderRank() {
    const top = DATA.plugins.slice().sort((a, b) => (b.stars || 0) - (a.stars || 0)).slice(0, 10);
    $('#rankList').innerHTML = top.map((p, i) => {
      const cat = catOf(p.category);
      return `
        <div class="rank-item ${i < 3 ? 'top' + (i + 1) : ''}" data-full="${esc(p.full_name)}">
          <div class="rank-no">${i + 1}</div>
          <div class="rank-info">
            <div class="rank-name">${esc(p.name)}</div>
            <div class="rank-desc">${esc(p.description) || ''}</div>
          </div>
          <span class="rank-cat" style="background:${cat ? cat.color : '#64748b'}">${cat ? cat.emoji + ' ' + esc(cat.label) : '其他'}</span>
          <div class="rank-stars">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/></svg>
            ${fmt(p.stars)}
          </div>
        </div>`;
    }).join('');
    $('#rankList').querySelectorAll('.rank-item').forEach((el) => el.addEventListener('click', () => openModal(el.dataset.full)));
  }

  // ---------- 弹窗 ----------
  function openModal(fullName) {
    const p = DATA.plugins.find((x) => x.full_name === fullName);
    if (!p) return;
    const cat = catOf(p.category);
    const topics = (p.topics || []).slice(0, 8).map((t) => `<span class="topic-tag">#${esc(t)}</span>`).join('');
    const install = p.homepage || p.html_url;
    const typeInfo = TYPE_INFO[detectType(p)];
    const installCmd = `dsh plugin --profile web add github:${p.owner}/${p.name}`;
    $('#modal').innerHTML = `
      <div class="modal-head">
        <div class="modal-avatar"><img src="${esc(p.avatar)}" alt="" /></div>
        <div>
          <div class="modal-title">${esc(p.name)}</div>
          <div class="modal-owner">${esc(p.full_name)} · ${cat ? esc(cat.label) : '其他'}</div>
        </div>
      </div>
      <div class="modal-desc">${esc(p.description) || '暂无描述'}</div>
      <div class="modal-stats">
        <div class="modal-stat"><div class="num" style="color:var(--star)">⭐ ${fmt(p.stars)}</div><div class="lbl">Stars</div></div>
        <div class="modal-stat"><div class="num">${fmt(p.forks)}</div><div class="lbl">Forks</div></div>
        <div class="modal-stat"><div class="num">${esc(p.language) || '—'}</div><div class="lbl">语言</div></div>
        <div class="modal-stat"><div class="num">${esc(p.license) || '—'}</div><div class="lbl">协议</div></div>
        <div class="modal-stat"><div class="num">${timeAgo(p.updated_at)}</div><div class="lbl">更新</div></div>
      </div>
      ${topics ? `<div class="modal-topics">${topics}</div>` : ''}
      <div class="install-box">
        <div class="install-box-head">
          <span class="type-badge" style="background:${typeInfo.color}">${esc(typeInfo.label)}</span>
          <span class="install-type-hint">${esc(typeInfo.hint)}</span>
        </div>
        <div class="install-cmd-row">
          <code class="install-cmd">${esc(installCmd)}</code>
          <button class="copy-btn" data-copy="${esc(installCmd)}">复制</button>
        </div>
        <div class="install-tip">💡 更省事：装好「<a href="#install" class="install-link">插件市场</a>」后，可在网页里一键安装，无需命令行。类型为推测结果，以仓库 README 为准。</div>
      </div>
      <div class="modal-actions">
        <a class="btn btn-primary" href="${esc(p.html_url)}" target="_blank" rel="noopener">GitHub 主页 ↗</a>
        ${install ? `<a class="btn btn-ghost" href="${esc(install)}" target="_blank" rel="noopener">项目主页</a>` : ''}
      </div>`;
    $('#modalOverlay').classList.add('open');
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    // 排序
    $('#sortSeg').addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      state.sort = btn.dataset.sort;
      state.visibleCount = 60;
      $$('#sortSeg .seg-btn').forEach((x) => x.classList.remove('active'));
      btn.classList.add('active');
      renderGrid();
    });
    $('#sortOrder').addEventListener('click', () => {
      state.order = state.order === 'desc' ? 'asc' : 'desc';
      $('#sortOrder').classList.toggle('desc', state.order === 'desc');
      renderGrid();
    });

    // 过滤 chips
    $('#filterChips').addEventListener('click', (e) => {
      const chip = e.target.closest('.fchip');
      if (!chip) return;
      const f = chip.dataset.f;
      state.filter = state.filter === f ? null : f;
      state.visibleCount = 60;
      $$('#filterChips .fchip').forEach((x) => x.classList.remove('active'));
      if (state.filter) chip.classList.add('active');
      renderGrid();
    });

    // 搜索
    let debounce;
    const onSearch = (val) => {
      state.search = val.trim();
      state.visibleCount = 60;
      clearTimeout(debounce);
      debounce = setTimeout(renderGrid, 180);
    };
    $('#heroSearch').addEventListener('input', (e) => onSearch(e.target.value));
    $('#heroQuick').addEventListener('click', (e) => {
      const chip = e.target.closest('.quick-chip');
      if (!chip) return;
      $('#heroSearch').value = chip.dataset.q;
      onSearch(chip.dataset.q);
      document.getElementById('browse').scrollIntoView({ behavior: 'smooth' });
    });

    // 加载更多
    $('#loadMore').addEventListener('click', () => { state.visibleCount += 60; renderGrid(); });

    // 弹窗关闭
    $('#modalOverlay').addEventListener('click', (e) => { if (e.target === $('#modalOverlay')) $('#modalOverlay').classList.remove('open'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#modalOverlay').classList.remove('open'); });

    // 主题切换
    const root = document.documentElement;
    const savedTheme = localStorage.getItem('dsh_ph_theme');
    if (savedTheme) root.dataset.theme = savedTheme;
    $('#themeToggle').addEventListener('click', () => {
      const next = root.dataset.theme === 'light' ? 'dark' : 'light';
      root.dataset.theme = next;
      localStorage.setItem('dsh_ph_theme', next);
    });

    // ⌘K / Ctrl+K 聚焦搜索
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#heroSearch').focus(); }
    });

    // 复制按钮 + 系统切换（事件委托）
    document.addEventListener('click', (e) => {
      const copyBtn = e.target.closest('.copy-btn');
      if (copyBtn) { copyText(copyBtn.dataset.copy || ''); return; }
      const osTab = e.target.closest('.os-tab');
      if (osTab) {
        $$('.os-tab').forEach((x) => x.classList.remove('active'));
        osTab.classList.add('active');
        const os = osTab.dataset.os;
        $$('.install-code').forEach((x) => x.classList.toggle('hidden', x.dataset.osCode !== os));
      }
    });

    // 助手
    bindAssistant();
  }

  // =====================================================
  // 智能问答助手（Agent 应用）
  // 纯前端导购 Agent：意图识别 + 约束抽取 + 相关性评分 + 多轮上下文
  // =====================================================
  function bindAssistant() {
    const fab = $('#assistantFab');
    const panel = $('#assistantPanel');
    const close = $('#assistantClose');
    const clearBtn = $('#assistantClear');
    const input = $('#assistantInput');
    const send = $('#assistantSend');
    const body = $('#assistantBody');
    const suggests = $('#assistantSuggests');

    // 会话上下文（多轮对话）
    const ctx = {
      lastIntent: null,
      lastQuery: '',
      lastPool: [],  // 最近一次推荐的全量候选
      lastShown: 0,  // 已展示数量
      history: [],   // [{ role, text?, html? }]
    };

    const HKEY = 'dsh_ph_chat';
    const saveHistory = () => { try { localStorage.setItem(HKEY, JSON.stringify(ctx.history)); } catch (e) {} };
    const loadHistory = () => { try { const h = JSON.parse(localStorage.getItem(HKEY) || '[]'); if (Array.isArray(h)) ctx.history = h; } catch (e) {} };

    // ---------- 轻量 Markdown（加粗 / 行内代码 / 换行） ----------
    function md(s) {
      return esc(s)
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br/>');
    }

    // ---------- 渲染 ----------
    function welcomeHTML() {
      return md('你好！我是 DSH 插件导购 Agent 🐋\n我已学完全部插件，可以帮你：\n\n· 🔍 **按需求找插件** — 「找能看图的」\n· 🏆 **推荐热门** — 「推荐高星插件」\n· 📂 **逛分类** — 「有哪些分类」\n· ⚖️ **对比插件** — 「对比 A 和 B」\n· 📊 **看统计** — 「一共有多少插件」\n· 📦 **安装教程** — 「怎么安装」\n\n直接告诉我你想做什么吧～');
    }

    const scroll = () => { body.scrollTop = body.scrollHeight; };

    function addUser(q) {
      const div = document.createElement('div');
      div.className = 'msg msg-user';
      div.innerHTML = `<div class="bubble">${esc(q).replace(/\n/g, '<br/>')}</div>`;
      body.appendChild(div);
      ctx.history.push({ role: 'user', text: q });
      saveHistory();
      scroll();
    }

    function typing() {
      const div = document.createElement('div');
      div.className = 'msg msg-bot';
      div.innerHTML = `<div class="bubble"><span class="typing"><span></span><span></span><span></span></span></div>`;
      body.appendChild(div);
      scroll();
      return div;
    }

    const bindRec = (el) => el.addEventListener('click', () => openModal(el.dataset.full));

    function recCards(list) {
      return (list || []).slice(0, 4).map((p) => {
        const cat = catOf(p.category);
        return `<button class="rec" data-full="${esc(p.full_name)}">
          <span class="rec-avatar"><img src="${esc(p.avatar)}" alt="" loading="lazy" onerror="this.style.display='none'" /></span>
          <span class="rec-main">
            <span class="rec-name">${esc(p.name)}</span>
            <span class="rec-desc">${esc((p.description || '').slice(0, 60))}</span>
            <span class="rec-tags">${cat ? `<i style="color:${cat.color}">${cat.emoji} ${esc(cat.label)}</i>` : ''}${p.language ? `<i>${esc(p.language)}</i>` : ''}</span>
          </span>
          <span class="rec-side">⭐ ${fmt(p.stars)}</span>
        </button>`;
      }).join('');
    }

    // ---------- 约束抽取 ----------
    function matchLanguage(ql) {
      const map = [['javascript', 'JavaScript'], ['typescript', 'TypeScript'], ['python', 'Python'], ['golang', 'Go'], ['rust', 'Rust'], ['java', 'Java'], ['c#', 'C#'], ['c++', 'C++'], ['ruby', 'Ruby'], ['kotlin', 'Kotlin'], ['swift', 'Swift'], ['vue', 'Vue'], ['lua', 'Lua']];
      for (const [kw, lang] of map) if (ql.includes(kw)) return lang;
      if (/\bgo\b|go语言/.test(ql)) return 'Go';
      return null;
    }

    function extractConstraints(ql) {
      const c = {};
      if (/中文|汉语|国产/.test(ql)) c.cn = true;
      if (/高星|100星|千星|1k|星以上|star以上|知名/.test(ql)) c.hot = true;
      if (/最近|新出|新上|活跃|刚更新|近7|近30|近七天|近一月/.test(ql)) c.recent = true;
      if (/免费|开源|opensource|apache|mit许可|bsd|gpl/.test(ql)) c.oss = true;
      const lang = matchLanguage(ql);
      if (lang) c.lang = lang;
      return c;
    }

    function applyConstraints(list, c) {
      if (!c || !Object.keys(c).length) return list;
      return list.filter((p) => {
        if (c.cn && !/[一-龥]/.test(p.description || '')) return false;
        if (c.hot && (p.stars || 0) < 100) return false;
        if (c.recent) { const days = (Date.now() - new Date(p.pushed_at || 0).getTime()) / 86400000; if (days > 30) return false; }
        if (c.oss) { const l = (p.license || '').toLowerCase(); if (l && !/(mit|apache|bsd|gpl|lgpl|mpl|isc|unlicense|wtfpl)/.test(l)) return false; }
        if (c.lang && (p.language || '').toLowerCase() !== c.lang.toLowerCase()) return false;
        return true;
      });
    }

    // ---------- 相关性 ----------
    function scorePlugin(p, q) {
      const name = p.name.toLowerCase();
      const desc = (p.description || '').toLowerCase();
      const topics = (p.topics || []).join(' ').toLowerCase();
      let score = 0;
      for (const t of tokenize(q)) {
        if (t.length < 2) continue;
        if (name.includes(t)) score += 14;
        else if (topics.includes(t)) score += 7;
        else if (desc.includes(t)) score += 5;
      }
      const phrase = q.replace(/[\s,，。、！？!?]+/g, '').toLowerCase();
      if (phrase.length >= 3) {
        if (name.includes(phrase)) score += 20;
        else if (desc.includes(phrase)) score += 8;
      }
      score += Math.log10((p.stars || 0) + 2);
      return score;
    }

    function matchCategory(q) {
      const ql = q.toLowerCase();
      let best = null, bestScore = 0;
      for (const [cat, words] of Object.entries(SYNONYMS)) {
        let s = 0;
        for (const w of words) if (ql.includes(w)) s += w.length > 2 ? 3 : 2;
        if (s > bestScore) { bestScore = s; best = cat; }
      }
      return best;
    }

    function findPlugin(name) {
      const n = name.toLowerCase();
      return DATA.plugins.find((x) => x.name.toLowerCase() === n || x.full_name.toLowerCase() === n)
        || DATA.plugins.find((x) => x.name.toLowerCase().includes(n))
        || DATA.plugins.find((x) => (x.description || '').toLowerCase().includes(n));
    }

    // ---------- 意图识别 ----------
    function understand(ql) {
      if (/^(你好|您好|hi|hello|hey|嗨|哈喽|嗨喽|在吗)[\s!！~～。,.，]*$/.test(ql)) return 'greet';
      if (/你能|你会|可以做什么|能做什么|帮助|help|功能|怎么用你|使用说明/.test(ql)) return 'help';
      if (/什么是dsh|dsh是什么|deepseek harness|这个网站|这是啥|你是谁|关于/.test(ql)) return 'about';
      if (/安装|怎么用|如何用|怎么装|入门|上手|install|quickstart|部署|启动|怎么开始|usage/.test(ql)) return 'install';
      if (/对比|比较|vs|versus|哪个更好|区别|优缺点/.test(ql)) return 'compare';
      if (/有哪些分类|分类|有哪些类型|几类|类别/.test(ql)) return 'categories';
      if (/多少|几个|统计|总数|平均|哪种语言|什么语言最多|哪个最多/.test(ql)) return 'stats';
      if (/换一批|再来|换点|还有|再推荐|别的|下一个|继续/.test(ql)) return 'more';
      if (/排行|排行榜|最火|最热|热门|最高|top|best|哪些值得|值得装|高星|榜单|排名/.test(ql)) return 'rank';
      return 'search';
    }

    // ---------- 意图处理器 ----------
    const handlers = {
      greet() { return { text: '你好呀！👋 我是 DSH 插件导购 Agent。\n\n直接告诉我想做什么，例如：\n· 「有没有能看图的插件」\n· 「推荐多 Agent 协作的」\n· 「有哪些分类」' }; },
      help() { return { text: '我可以帮你做这些：\n\n🔍 **找插件** — 「找能做 OCR 的」\n🏆 **推荐热门** — 「推荐高星插件」\n📂 **逛分类** — 「有哪些分类」「Agent 类插件」\n⚖️ **对比** — 「对比 A 和 B」\n📊 **统计** — 「一共有多少插件」\n📦 **安装** — 「怎么安装插件」\n\n也可以直接说插件名，我给你详情。' }; },
      about() { return { text: '🐋 **DSH Plugin Hub** 是 DeepSeek Harness（DSH）的开源插件导航站。\n\n实时同步 GitHub `dsh-plugin` 生态，按 Stars 排行、智能分类，助你 30 秒定位所需插件。\n\n目前已收录 **' + DATA.fetched + '** 个插件、' + DATA.categories.length + ' 个分类。' }; },
      install() { return { text: 'DSH 插件安装有两种方式：\n\n1️⃣【最省事·推荐】装「插件市场」：\n   见页面「🚀 一键安装」区，Windows 用 `irm ... | iex`、Mac 用 `curl ... | bash`，装好后所有插件在网页里点「安装」即可。\n\n2️⃣【命令行】直接装：\n   `dsh plugin --profile web add github:owner/repo`\n\n⚠️ 安装后重启 DSH 再刷新页面。点开任意插件卡片可一键复制对应安装命令。' }; },
      rank(q, c) {
        let list = DATA.plugins.slice().sort((a, b) => (b.stars || 0) - (a.stars || 0));
        list = applyConstraints(list, c);
        const pool = list.slice(0, 12);
        const tag = c.cn ? '（中文友好）' : c.recent ? '（近 30 天活跃）' : c.lang ? '（' + c.lang + '）' : '';
        return { text: `当前 Stars 最高的 ${pool.length} 个插件${tag}，社区热度首选 👇`, recs: pool.slice(0, 4), pool };
      },
      categories() {
        const lines = DATA.categories.map((c) => `${c.emoji} **${c.label}**（${DATA.plugins.filter((p) => p.category === c.id).length}）`);
        return { text: `目前共有 **${DATA.categories.length}** 个分类：\n\n${lines.join('\n')}\n\n想看某一类，直接说分类名即可，比如「${DATA.categories[1].label}」。` };
      },
      stats() {
        const sum = DATA.plugins.reduce((a, p) => a + (p.stars || 0), 0);
        const langs = {};
        DATA.plugins.forEach((p) => { if (p.language) langs[p.language] = (langs[p.language] || 0) + 1; });
        const topLang = Object.entries(langs).sort((a, b) => b[1] - a[1])[0];
        const cn = DATA.plugins.filter((p) => /[一-龥]/.test(p.description || '')).length;
        const active = DATA.plugins.filter((p) => (Date.now() - new Date(p.pushed_at || 0).getTime()) / 86400000 <= 30).length;
        return { text: `📊 数据一览：\n\n· 收录插件：**${DATA.fetched}** 个\n· 累计 Stars：**${fmt(sum)}**\n· 中文友好：**${cn}** 个\n· 近 30 天活跃：**${active}** 个\n· 主力语言：**${topLang ? topLang[0] : '—'}**（${topLang ? topLang[1] : 0} 个）\n\n数据更新于 ${timeAgo(DATA.generated_at)}。` };
      },
      compare(q) {
        const parts = q.split(/对比|比较|和|与|vs|versus|、/i).map((s) => s.trim()).filter((s) => s.length >= 2);
        const found = parts.map(findPlugin).filter(Boolean).slice(0, 2);
        if (found.length < 2) return { text: '对比需要两个插件名哦～ 例如：「对比 open-design 和 XXX」\n\n不确定名字的话，可以先问「推荐几个 UI 插件」，再让我对比其中两个。' };
        const [a, b] = found;
        const winner = (a.stars || 0) >= (b.stars || 0) ? a : b;
        return {
          text: `⚖️ **对比结果**\n\n**${a.name}** vs **${b.name}**\n\n· ⭐ Stars：${fmt(a.stars)} / ${fmt(b.stars)}\n· 🍴 Forks：${fmt(a.forks)} / ${fmt(b.forks)}\n· 💻 语言：${a.language || '—'} / ${b.language || '—'}\n· 📜 协议：${a.license || '—'} / ${b.license || '—'}\n· 🕐 更新：${timeAgo(a.pushed_at)} / ${timeAgo(b.pushed_at)}\n\n🏆 综合热度「**${winner.name}**」更高（${fmt(winner.stars)} ⭐）`,
          recs: [a, b]
        };
      },
      more(q, c) {
        // 无上文时退化为普通搜索（兼容「还有没有能看图的」这类首次提问）
        if (!ctx.lastPool || !ctx.lastPool.length) return handlers.search(q, c);
        const hasC = !!(c.cn || c.hot || c.recent || c.oss || c.lang);
        if (hasC) {
          const filtered = applyConstraints(ctx.lastPool, c);
          if (!filtered.length) return { text: '没有同时满足这些条件的插件，放宽条件再试试？' };
          return { text: '按你的新要求筛选后，为你找到 👇', recs: filtered.slice(0, 4), pool: filtered };
        }
        const next = ctx.lastPool.slice(ctx.lastShown, ctx.lastShown + 4);
        if (!next.length) return { text: '以上就是全部啦，换个需求试试？' };
        return { text: '再给你推荐几个 👇', recs: next, pool: ctx.lastPool, _more: true };
      },
      search(q, c) {
        const key = q.trim().toLowerCase();
        // 1) 精确名称命中
        const exact = DATA.plugins.find((x) => x.name.toLowerCase() === key || x.full_name.toLowerCase() === key);
        if (exact) return { text: '我找到了这个插件：', recs: [exact], pool: [exact] };
        // 2) 名称包含
        const nameHit = key.length >= 4
          ? DATA.plugins.filter((x) => x.name.toLowerCase().includes(key)).sort((a, b) => (b.stars || 0) - (a.stars || 0))
          : [];
        if (nameHit.length) { const pool = nameHit.slice(0, 12); return { text: `找到 ${nameHit.length} 个名称匹配的插件：`, recs: pool.slice(0, 4), pool }; }
        // 3) 分类 + 关键词评分
        const cat = matchCategory(q);
        const list = applyConstraints(DATA.plugins.slice(), c);
        const scored = list.map((pl) => ({ pl, score: scorePlugin(pl, q) + (cat && pl.category === cat ? 9 : 0) }))
          .filter((x) => x.score > 3)
          .sort((a, b) => b.score - a.score)
          .slice(0, 12);
        if (scored.length) {
          const catObj = cat ? catOf(cat) : null;
          const hint = catObj ? `💡 命中「${catObj.emoji} ${catObj.label}」分类，为你找到相关度最高的插件：` : '根据你的描述，为你找到这些插件：';
          return { text: hint, recs: scored.slice(0, 4).map((x) => x.pl), pool: scored.map((x) => x.pl) };
        }
        // 4) 兜底：热门
        const top = DATA.plugins.slice().sort((a, b) => (b.stars || 0) - (a.stars || 0)).slice(0, 12);
        return { text: '没找到特别匹配的插件 🤔\n\n先看看这几个社区热门 👇 也可以换个更具体的关键词（如「侧边栏」「OCR」「多 Agent」）', recs: top.slice(0, 4), pool: top };
      }
    };

    function answer(q) {
      if (!DATA) return { text: '数据还在加载中，请稍等片刻～' };
      const ql = q.toLowerCase();
      const intent = understand(ql);
      const c = extractConstraints(ql);
      const r = handlers[intent](q, c);
      ctx.lastIntent = intent;
      ctx.lastQuery = q;
      if (r.recs && r.recs.length) {
        if (r._more) ctx.lastShown = (ctx.lastShown || 0) + r.recs.length;
        else { ctx.lastPool = r.pool || r.recs; ctx.lastShown = r.recs.length; }
      }
      return r;
    }

    function ask(query) {
      open();
      addUser(query);
      const t = typing();
      setTimeout(() => {
        const r = answer(query);
        let html = md(r.text || '');
        if (r.recs && r.recs.length) html += recCards(r.recs);
        t.querySelector('.bubble').innerHTML = html;
        t.querySelectorAll('.rec').forEach(bindRec);
        ctx.history.push({ role: 'bot', html });
        saveHistory();
        scroll();
      }, 420 + Math.random() * 300);
    }

    // ---------- 事件 ----------
    const open = () => panel.classList.add('open');
    const toggle = () => panel.classList.toggle('open');
    fab.addEventListener('click', toggle);
    close.addEventListener('click', () => panel.classList.remove('open'));
    clearBtn.addEventListener('click', () => {
      ctx.history = [];
      ctx.lastPool = []; ctx.lastShown = 0;
      saveHistory();
      body.innerHTML = welcomeHTML();
      scroll();
    });

    suggests.addEventListener('click', (e) => {
      const chip = e.target.closest('.sugg-chip');
      if (!chip) return;
      ask(chip.dataset.q || chip.textContent.trim());
    });

    const doSend = () => {
      const q = input.value.trim();
      if (!q) return;
      ask(q);
      input.value = '';
      input.style.height = 'auto';
    };
    send.addEventListener('click', doSend);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
    });
    input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 110) + 'px'; });

    // ---------- 初始化 ----------
    loadHistory();
    if (ctx.history.length) {
      body.innerHTML = '';
      ctx.history.forEach((m) => {
        const div = document.createElement('div');
        div.className = 'msg msg-' + (m.role === 'user' ? 'user' : 'bot');
        div.innerHTML = `<div class="bubble">${m.role === 'user' ? esc(m.text).replace(/\n/g, '<br/>') : (m.html || '')}</div>`;
        body.appendChild(div);
      });
      body.querySelectorAll('.rec').forEach(bindRec);
    } else {
      body.innerHTML = welcomeHTML();
    }
    scroll();
  }

  // 分类同义词表（意图关键词 → 分类 id，供 matchCategory 使用）
  const SYNONYMS = {
    'ui': ['界面', '侧边栏', '皮肤', '主题', '面板', '看板', '桌面', '终端界面', 'sidebar', 'ui', 'theme', 'skin', 'panel', 'web'],
    'vision': ['看图', '视觉', '图像', '图片', '截图', 'ocr', '识别', '多模态', 'vision', 'image', 'picture', 'photo', 'screenshot'],
    'memory': ['记忆', '上下文', '知识库', '长期记忆', '笔记', 'memory', 'context', 'knowledge', 'note'],
    'agent': ['多agent', '多智能体', '团队', '协作', '编排', '工作流', '子代理', 'swarm', 'workflow', 'team', 'subagent', 'orchestrat'],
    'dev': ['开发', '代码', '调试', '终端', 'git', '编辑器', 'sdk', 'cli', 'code', 'debug', 'editor', 'terminal', 'shell', 'browser'],
    'data': ['数据', '搜索', '数据库', '爬虫', '检索', '查询', 'data', 'search', 'database', 'scrape', 'crawl', 'sql'],
    'integration': ['迁移', '桥接', '集成', '接入', '导入', '导出', 'claude', 'cursor', 'notion', 'github', 'migrate', 'bridge', 'import', 'export', 'connector'],
    'productivity': ['效率', '任务', '快捷键', '分享', 'todo', 'task', 'productivity', 'shortcut', 'share'],
    'fun': ['游戏', '宠物', '彩蛋', '娱乐', '鲸鱼', '小游戏', '整活', 'game', 'pet', 'fun', 'meme'],
    'security': ['安全', '沙箱', '权限', '审计', 'security', 'sandbox', 'permission', 'auth'],
  };

  function tokenize(q) {
    return q.toLowerCase().split(/[\s,，。、！？!?]+/).filter(Boolean);
  }

  // ---------- toast ----------
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------- 启动 ----------
  bindEvents();
  loadData();
})();
