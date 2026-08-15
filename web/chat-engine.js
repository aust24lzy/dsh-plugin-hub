/* =====================================================
 * DSH 插件导购 Agent —— 共享问答引擎（纯逻辑，无 DOM 依赖）
 *
 * 全局暴露 window.DSHChat：
 *   setData(data)  注入 plugins.json 解析后的数据
 *   reply(query)   返回 { text, recs }，recs 为插件对象数组
 *   reset()        清空多轮上下文
 *   hasData()      数据是否就绪
 * ===================================================== */
(function () {
  'use strict';

  let DATA = null;
  const catMap = {};
  let ctx = { lastPool: [], lastShown: 0 };

  // 分类同义词表（意图关键词 → 分类 id）
  const SYNONYMS = {
    'ui': ['界面', '侧边栏', '皮肤', '主题', '面板', '看板', '桌面', '终端界面', 'sidebar', 'theme', 'skin', 'panel', 'dashboard', 'ui', 'webui'],
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

  // 对比时需剔除的虚词
  const STOP = new Set(['推荐', '哪个', '更好', '插件', '最好', '一些', '几个', '一下', '帮我', '给我', '有没有', '的', '和', '与']);

  // ---------- 对外 API ----------
  function setData(d) {
    DATA = d;
    (d.categories || []).forEach((c) => (catMap[c.id] = c));
  }
  const hasData = () => !!DATA;
  const catOf = (id) => catMap[id] || null;
  function reset() { ctx = { lastPool: [], lastShown: 0 }; }

  // ---------- 工具 ----------
  function fmt(n) {
    if (n == null) return '0';
    if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1) + ' 万';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }
  function tokenize(q) {
    return q.toLowerCase().split(/[\s,，。、！？!?]+/).filter(Boolean);
  }
  function topN(n) {
    return DATA.plugins.slice().sort((a, b) => (b.stars || 0) - (a.stars || 0)).slice(0, n);
  }

  // ---------- 意图识别（精炼规则，避免宽泛词误判） ----------
  function understand(ql) {
    const is = (re) => re.test(ql);
    if (is(/^(你好|您好|hi|hello|hey|嗨|哈喽|嗨喽|在吗|早上好|晚上好|下午好)[\s!！~～。,.，]*$/)) return 'greet';
    if (is(/你能做什么|能做什么|会什么|有什么功能|使用说明|help/)) return 'help';
    if (is(/什么是dsh|dsh是什么|deepseek.?harness|这是什么网站|这个网站|你是谁|介绍一下/)) return 'about';
    if (is(/怎么安装|如何安装|怎么装|安装|install|入门|上手|安装教程|装插件/)) return 'install';
    if (is(/对比|比较|\bvs\b|versus|哪个好|哪个更好|区别|优缺点|二选一/)) return 'compare';
    if (is(/有哪些分类|分类有哪些|几个分类|类别|分类列表|分几类/)) return 'categories';
    if (is(/有多少|一共多少|多少插件|统计|总数|多少个|平均|哪种语言|什么语言最多|哪个最多|数据一览/)) return 'stats';
    if (is(/换一批|再来|换点|还有吗|还有没有|再推荐|别的推荐|下一个|继续/)) return 'more';
    if (is(/排行|排行榜|最火|最热|热门|最高|top|best|哪些值得|值得装|高星|榜单|排名/)) return 'rank';
    return 'search';
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

  // ---------- 相关性评分 ----------
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
      for (const w of words) {
        let hit;
        // 短英文缩写（<=3 位）用词边界，避免 "build" 误命中 "ui"
        if (/^[a-z0-9]{1,3}$/.test(w)) {
          hit = new RegExp('(^|[^a-z0-9])' + w + '([^a-z0-9]|$)', 'i').test(ql);
        } else {
          hit = ql.includes(w);
        }
        if (hit) s += w.length > 2 ? 3 : 2;
      }
      if (s > bestScore) { bestScore = s; best = cat; }
    }
    return best;
  }
  function findPlugin(name) {
    const n = name.trim().toLowerCase();
    if (n.length < 2) return null;
    return DATA.plugins.find((x) => x.name.toLowerCase() === n || x.full_name.toLowerCase() === n)
      || DATA.plugins.find((x) => x.name.toLowerCase().startsWith(n))
      || DATA.plugins.find((x) => x.name.toLowerCase().includes(n))
      || null;
  }

  // ---------- 意图处理器 ----------
  const handlers = {
    greet() { return { text: '你好呀！👋 我是 DSH 插件导购 Agent。\n\n直接告诉我想做什么，例如：\n· 「有没有能看图的插件」\n· 「推荐多 Agent 协作的」\n· 「有哪些分类」' }; },
    help() { return { text: '我可以帮你做这些：\n\n🔍 **找插件** — 「找能做 OCR 的」\n🏆 **推荐热门** — 「推荐高星插件」\n📂 **逛分类** — 「有哪些分类」「Agent 类插件」\n⚖️ **对比** — 「对比 A 和 B」\n📊 **统计** — 「一共有多少插件」\n📦 **安装** — 「怎么安装插件」\n\n也可以直接说插件名，我给你详情。' }; },
    about() { return { text: '🐋 **DSH Plugin Hub** 是 DeepSeek Harness（DSH）的开源插件导航站。\n\n实时同步 GitHub `dsh-plugin` 生态，按 Stars 排行、智能分类，助你 30 秒定位所需插件。\n\n目前已收录 **' + DATA.fetched + '** 个插件、' + DATA.categories.length + ' 个分类。' }; },
    install() { return { text: 'DSH 插件安装很简单，三步搞定：\n\n1️⃣ 启动 Harness：`npx @deepseek-ai/dsh web`\n2️⃣ 命令行安装插件：`dsh plugin --profile web add github:owner/repo`\n3️⃣ 重启 DSH 再刷新页面即可\n\n💡 点开任意插件卡片，能看到并一键复制它对应的安装命令。' }; },
    rank(q, c) {
      let list = applyConstraints(topN(100), c);
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
      return { text: `📊 数据一览：\n\n· 收录插件：**${DATA.fetched}** 个\n· 累计 Stars：**${fmt(sum)}**\n· 中文友好：**${cn}** 个\n· 近 30 天活跃：**${active}** 个\n· 主力语言：**${topLang ? topLang[0] : '—'}**（${topLang ? topLang[1] : 0} 个）` };
    },
    compare(q) {
      const parts = q.split(/对比|比较|和|与|\bvs\b|versus|、/i)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2 && !STOP.has(s));
      const found = parts.map(findPlugin).filter(Boolean).slice(0, 2);
      if (found.length === 0) return { text: '我没认出你提到的插件名 🤔\n\n请用完整名称，例如：「对比 open-design 和 dsh-agent-teams」。\n\n不确定名字的话，先问「推荐几个 UI 插件」拿到名字，再让我对比其中两个。' };
      if (found.length === 1) return { text: `我只找到了「${found[0].name}」，另一个名字没匹配到。它的信息如下 👇\n\n💡 想看两个的对比，请把两个名字都写完整，例如「对比 ${found[0].name} 和 另一个插件」。`, recs: [found[0]] };
      const [a, b] = found;
      const winner = (a.stars || 0) >= (b.stars || 0) ? a : b;
      return {
        text: `⚖️ **对比结果**\n\n**${a.name}** vs **${b.name}**\n\n· ⭐ Stars：${fmt(a.stars)} / ${fmt(b.stars)}\n· 🍴 Forks：${fmt(a.forks)} / ${fmt(b.forks)}\n· 💻 语言：${a.language || '—'} / ${b.language || '—'}\n· 📜 协议：${a.license || '—'} / ${b.license || '—'}\n· 🕐 更新：${timeAgo(a.pushed_at)} / ${timeAgo(b.pushed_at)}\n\n🏆 综合热度「**${winner.name}**」更高（${fmt(winner.stars)} ⭐）`,
        recs: [a, b]
      };
    },
    more(q, c) {
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
      const exact = DATA.plugins.find((x) => x.name.toLowerCase() === key || x.full_name.toLowerCase() === key);
      if (exact) return { text: '我找到了这个插件：', recs: [exact], pool: [exact] };
      const nameHit = key.length >= 4
        ? DATA.plugins.filter((x) => x.name.toLowerCase().includes(key)).sort((a, b) => (b.stars || 0) - (a.stars || 0))
        : [];
      if (nameHit.length) { const pool = nameHit.slice(0, 12); return { text: `找到 ${nameHit.length} 个名称匹配的插件：`, recs: pool.slice(0, 4), pool }; }
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
      const top = topN(12);
      return { text: '没找到特别匹配的插件 🤔\n\n先看看这几个社区热门 👇 也可以换个更具体的关键词（如「侧边栏」「OCR」「多 Agent」）', recs: top.slice(0, 4), pool: top };
    }
  };

  function timeAgo(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
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

  // ---------- 主入口 ----------
  function reply(query) {
    if (!DATA) return { text: '数据还在加载中，请稍等片刻～' };
    const q = String(query || '').trim();
    if (!q) return { text: '你想让我帮你找什么插件？直接说需求即可～' };
    const ql = q.toLowerCase();
    const intent = understand(ql);
    const c = extractConstraints(ql);
    const r = handlers[intent](q, c);
    if (r.recs && r.recs.length) {
      if (r._more) ctx.lastShown = (ctx.lastShown || 0) + r.recs.length;
      else { ctx.lastPool = r.pool || r.recs; ctx.lastShown = r.recs.length; }
    }
    return r;
  }

  window.DSHChat = { setData, reply, reset, hasData };
})();
