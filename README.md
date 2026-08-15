# 🐋 DSH Plugin Hub

**DeepSeek Harness（DSH）开源插件导航站** —— 实时同步 GitHub `dsh-plugin` 生态，按 Stars 动态排行、智能分类，帮助开发者 30 秒定位所需插件、快速上手 DSH。

> 在线访问：https://USERNAME.github.io/dsh-plugin-hub/

## ✨ 功能

- 🔍 **实时数据**：定时抓取 GitHub `dsh-plugin` 话题全部仓库，按 Stars 动态排序
- 🗂️ **智能分类**：11 个分类（UI 界面 / Agent 编排 / 记忆知识 / 视觉多模态 / 开发工具 / 数据搜索 / 集成迁移 / 效率 / 娱乐彩蛋 / 安全）
- 📊 **多维度筛选**：分类 + 排序（Stars / Forks / 更新时间 / 收录时间）+ 关键词搜索 + 快捷筛选
- 🏆 **排行榜**：Top 10 Stars 榜单
- 🤖 **智能问答助手**：自然语言推荐插件（「有没有能看图的插件」「推荐多 Agent 协作」）
- 🌗 暗/亮主题、插件详情弹窗、安装命令一键复制

## 🚀 本地运行

```bash
cd web
python -m http.server 8099
# 打开 http://127.0.0.1:8099
```

## 🔄 数据同步

同步脚本抓取 GitHub Search API 并生成 `web/plugins.json`：

```bash
node scripts/sync.mjs
```

- 支持环境变量 `GITHUB_TOKEN` 认证（更高 API 配额）
- GitHub Actions 每日 08:30（UTC+8）自动同步并部署到 GitHub Pages

## 📁 目录结构

```
├── scripts/sync.mjs        # 数据同步脚本（抓取 + 相关性过滤 + 智能分类）
├── web/                    # 站点源码
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── plugins.json        # 数据快照（自动生成）
└── .github/workflows/      # 自动同步 + 部署
```

## 📄 说明

本项目为非官方社区项目，数据源自 GitHub `dsh-plugin` 生态。DeepSeek Harness 由 DeepSeek 官方开源（MIT 协议）。
