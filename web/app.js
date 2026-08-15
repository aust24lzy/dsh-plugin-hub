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
      <div class="code-block install-cmd"><span class="code-prompt">$</span> dsh plugin add ${esc(p.name)}</div>
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

    // 助手
    bindAssistant();
  }

  // ---------- 智能问答助手 ----------
  function bindAssistant() {
    const fab = $('#assistantFab');
    const panel = $('#assistantPanel');
    const close = $('#assistantClose');
    const input = $('#assistantInput');
    const send = $('#assistantSend');
    const body = $('#assistantBody');
    const suggests = $('#assistantSuggests');

    const open = () => panel.classList.add('open');
    const toggle = () => panel.classList.toggle('open');
    fab.addEventListener('click', toggle);
    close.addEventListener('click', () => panel.classList.remove('open'));

    suggests.addEventListener('click', (e) => {
      const chip = e.target.closest('.sugg-chip');
      if (!chip) return;
      ask(chip.textContent);
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

    function addMsg(text, who) {
      const div = document.createElement('div');
      div.className = 'msg msg-' + who;
      div.innerHTML = `<div class="bubble">${text}</div>`;
      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
      return div;
    }

    function typing() {
      const div = document.createElement('div');
      div.className = 'msg msg-bot';
      div.innerHTML = `<div class="bubble"><span class="typing"><span></span><span></span><span></span></span></div>`;
      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
      return div;
    }

    function ask(query) {
      open();
      addMsg(esc(query), 'user');
      const t = typing();
      setTimeout(() => {
        const { text, recs } = answer(query);
        let html = esc(text);
        if (recs && recs.length) {
          html += recs.slice(0, 4).map((p) => {
            const cat = catOf(p.category);
            return `<button class="rec" data-full="${esc(p.full_name)}"><b>${esc(p.name)}</b><span class="rec-stars">⭐ ${fmt(p.stars)}</span><br/><span style="color:var(--text-dim);font-size:12px">${esc((p.description || '').slice(0, 46))}</span> <span style="color:${cat ? cat.color : '#888'};font-size:11px">· ${cat ? esc(cat.label) : '其他'}</span></button>`;
          }).join('');
        }
        t.querySelector('.bubble').innerHTML = html;
        t.querySelectorAll('.rec').forEach((el) => el.addEventListener('click', () => openModal(el.dataset.full)));
        body.scrollTop = body.scrollHeight;
      }, 450 + Math.random() * 350);
    }
  }

  // 助手应答引擎（关键词 + 同义词 → 分类/功能匹配）
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

  function answer(query) {
    if (!DATA) return { text: '数据还在加载中，请稍等片刻～', recs: [] };
    const q = query.trim();
    const ql = q.toLowerCase();
    const toks = tokenize(q);

    // 安装/使用帮助
    if (/怎么装|如何安装|怎么用|如何使用|install|安装|入门|上手|使用教程|怎么开始|quickstart/.test(ql)) {
      return {
        text: 'DSH 插件的安装很简单，三步搞定：\n\n1️⃣ 启动 Harness：`npx @deepseek-ai/dsh web`\n2️⃣ 命令行安装插件：`dsh plugin add <插件名>`\n3️⃣ 重启或在设置中启用即可\n\n你也可以在下方卡片点开任意插件，查看它的 GitHub 主页和 README 获取具体安装命令。',
        recs: []
      };
    }

    // 排行榜/热门
    if (/最火|最热|热门|最高|排行榜|top|best|推荐|popular|trend|哪些值得|值得装/.test(ql)) {
      const top = DATA.plugins.slice().sort((a, b) => (b.stars || 0) - (a.stars || 0)).slice(0, 5);
      return { text: `这是当前 GitHub Stars 最高的 ${top.length} 个插件，社区热度最高的选择 👇`, recs: top };
    }

    // 精确插件名匹配
    const exact = DATA.plugins.filter((p) => {
      const name = p.name.toLowerCase();
      return ql.length >= 3 && (name === ql || name.includes(ql.replace(/\s+/g, '')) || ql.includes(name));
    }).sort((a, b) => (b.stars || 0) - (a.stars || 0));
    if (exact.length && ql.length >= 3) {
      return { text: `我找到了 ${exact.length} 个名称匹配的插件：`, recs: exact.slice(0, 5) };
    }

    // 类别/功能匹配打分
    const catHits = {};
    let matchedCat = null;
    for (const [cat, words] of Object.entries(SYNONYMS)) {
      let s = 0;
      for (const w of words) {
        if (ql.includes(w)) s += w.length > 2 ? 3 : 2;
      }
      if (s > 0) catHits[cat] = s;
    }
    matchedCat = Object.keys(catHits).sort((a, b) => catHits[b] - catHits[a])[0] || null;

    const scored = DATA.plugins.map((p) => {
      const hay = (p.name + ' ' + p.full_name + ' ' + p.description + ' ' + (p.topics || []).join(' ')).toLowerCase();
      let score = 0;
      for (const t of toks) { if (t.length >= 2 && hay.includes(t)) score += 3; }
      if (matchedCat && p.category === matchedCat) score += 8;
      // 名称命中加权
      if (p.name.toLowerCase().includes(ql.replace(/\s+/g, '')) || ql.includes(p.name.toLowerCase())) score += 12;
      score += Math.log10((p.stars || 0) + 2); // 星标微调
      return { p, score };
    }).filter((x) => x.score > 3).sort((a, b) => b.score - a.score).slice(0, 5);

    if (scored.length) {
      const cat = matchedCat ? catOf(matchedCat) : null;
      const hint = cat ? `\n\n💡 命中分类「${cat.emoji} ${cat.label}」，以下为相关度最高的插件：` : '以下是根据你的描述匹配到的插件：';
      return { text: '根据你的需求，我找到了这些插件' + hint, recs: scored.map((x) => x.p) };
    }

    return {
      text: '暂时没找到精确匹配的插件 🤔\n\n你可以试试：\n· 换一个更具体的关键词（如「侧边栏」「OCR」「多 Agent」）\n· 直接告诉我插件的英文名\n· 问「推荐高星插件」看热门榜单',
      recs: []
    };
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
