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

  // 判断描述是否为英文（用于显示翻译按钮）
  function isEnglish(text) {
    if (!text || !text.trim()) return false;
    const ch = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    return ch / text.length < 0.1 && /[a-zA-Z]/.test(text);
  }
  // MyMemory 免费翻译 API（无需 key，CORS 友好）
  async function translateText(text) {
    if (!text) return text;
    if (text.length > 480) text = text.slice(0, 480) + '...';
    try {
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh-CN`);
      const data = await res.json();
      return data.responseData?.translatedText || text;
    } catch (e) {
      console.warn('translate failed:', e);
      return text;
    }
  }

  // ---------- 数据加载 ----------
  async function loadData() {
    const badge = $('#heroBadgeText');
    try {
      const res = await fetch('plugins.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      DATA = await res.json();
      DATA.categories.forEach((c) => (catMap[c.id] = c));
      if (window.DSHChat) window.DSHChat.setData(DATA);
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
    const showTranslate = isEnglish(p.description);
    const installCmd = `dsh plugin --profile web add github:${p.owner}/${p.name}`;
    $('#modal').innerHTML = `
      <div class="modal-head">
        <div class="modal-head-left">
          <div class="modal-avatar"><img src="${esc(p.avatar)}" alt="" /></div>
          <div>
            <div class="modal-title">${esc(p.name)}</div>
            <div class="modal-owner">${esc(p.full_name)} · ${cat ? esc(cat.label) : '其他'}</div>
          </div>
        </div>
        ${showTranslate ? '<button class="translate-btn" id="translateBtn" title="将英文描述翻译为中文">🌐 翻译</button>' : ''}
      </div>
      <div class="modal-desc" id="modalDesc">${esc(p.description) || '暂无描述'}</div>
      <div class="modal-translated" id="modalTranslated" style="display:none"></div>
      <div class="modal-stats">
        <div class="modal-stat"><div class="num" style="color:var(--star)">⭐ ${fmt(p.stars)}</div><div class="lbl">Stars</div></div>
        <div class="modal-stat"><div class="num">${fmt(p.forks)}</div><div class="lbl">Forks</div></div>
        <div class="modal-stat"><div class="num">${esc(p.language) || '—'}</div><div class="lbl">语言</div></div>
        <div class="modal-stat"><div class="num">${esc(p.license) || '—'}</div><div class="lbl">协议</div></div>
        <div class="modal-stat"><div class="num">${timeAgo(p.updated_at)}</div><div class="lbl">更新</div></div>
      </div>
      ${topics ? `<div class="modal-topics">${topics}</div>` : ''}
      <div class="code-block install-cmd"><span class="code-prompt">$</span> ${esc(installCmd)}</div>
      <div class="modal-actions">
        <a class="btn btn-primary" href="${esc(p.html_url)}" target="_blank" rel="noopener">GitHub 主页 ↗</a>
        ${install ? `<a class="btn btn-ghost" href="${esc(install)}" target="_blank" rel="noopener">项目主页</a>` : ''}
      </div>`;
    $('#modalOverlay').classList.add('open');

    // 翻译按钮
    const tBtn = $('#translateBtn');
    if (tBtn) {
      tBtn.addEventListener('click', async () => {
        const target = $('#modalTranslated');
        if (target.style.display !== 'none') {
          target.style.display = 'none';
          tBtn.textContent = '🌐 翻译';
          return;
        }
        const original = tBtn.textContent;
        tBtn.textContent = '⏳ 翻译中...';
        tBtn.disabled = true;
        const translated = await translateText(p.description);
        if (translated && translated !== p.description) {
          target.innerHTML = `<div class="translated-label">🌐 中文翻译</div><div class="translated-text">${esc(translated)}</div>`;
          target.style.display = 'block';
          tBtn.textContent = '🌐 隐藏';
        } else {
          tBtn.textContent = '😅 翻译失败';
          setTimeout(() => (tBtn.textContent = original), 1800);
        }
        tBtn.disabled = false;
      });
    }
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

  // =====================================================
  // 智能问答助手（Agent 应用）—— 引擎在 chat-engine.js（window.DSHChat）
  // =====================================================
  function bindAssistant() {
    const fab = $('#assistantFab');
    const panel = $('#assistantPanel');
    const close = $('#assistantClose');
    const clearBtn = $('#assistantClear');
    const expandBtn = $('#assistantExpand');
    const input = $('#assistantInput');
    const send = $('#assistantSend');
    const body = $('#assistantBody');
    const suggests = $('#assistantSuggests');

    const HKEY = 'dsh_ph_chat';
    let history = loadHistory();
    function loadHistory() {
      try { const h = JSON.parse(localStorage.getItem(HKEY) || '[]'); return Array.isArray(h) ? h : []; } catch (e) { return []; }
    }
    const saveHistory = () => { try { localStorage.setItem(HKEY, JSON.stringify(history)); } catch (e) {} };

    // 轻量 Markdown
    function md(s) {
      return esc(s)
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br/>');
    }

    function welcomeHTML() {
      return md('你好！我是 DSH 插件导购 Agent 🐋\n我已学完全部插件，可以帮你：\n\n· 🔍 **按需求找插件** — 「找能看图的」\n· 🏆 **推荐热门** — 「推荐高星插件」\n· 📂 **逛分类** — 「有哪些分类」\n· ⚖️ **对比插件** — 「对比 A 和 B」\n· 📊 **看统计** — 「一共有多少插件」\n· 📦 **安装教程** — 「怎么安装」\n\n💡 点右上角 ⤢ 进入全屏版，体验更好～');
    }

    const scroll = () => { body.scrollTop = body.scrollHeight; };

    function addUser(q) {
      const div = document.createElement('div');
      div.className = 'msg msg-user';
      div.innerHTML = `<div class="bubble">${esc(q).replace(/\n/g, '<br/>')}</div>`;
      body.appendChild(div);
      history.push({ role: 'user', text: q });
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

    function ask(query) {
      open();
      addUser(query);
      const t = typing();
      setTimeout(() => {
        const r = window.DSHChat.reply(query);
        let html = md(r.text || '');
        if (r.recs && r.recs.length) html += recCards(r.recs);
        t.querySelector('.bubble').innerHTML = html;
        t.querySelectorAll('.rec').forEach(bindRec);
        history.push({ role: 'bot', html });
        saveHistory();
        scroll();
      }, 420 + Math.random() * 300);
    }

    const open = () => panel.classList.add('open');
    const toggle = () => panel.classList.toggle('open');
    fab.addEventListener('click', toggle);
    close.addEventListener('click', () => panel.classList.remove('open'));
    expandBtn.addEventListener('click', () => { location.href = 'assistant.html'; });
    clearBtn.addEventListener('click', () => {
      history = [];
      window.DSHChat.reset();
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

    // 初始化
    if (history.length) {
      body.innerHTML = '';
      history.forEach((m) => {
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
