# 🐋 DSH Plugin Hub

**DeepSeek Harness（DSH）开源插件导航站** —— 实时同步 GitHub `dsh-plugin` 生态，按 Stars 动态排行、智能分类，帮助开发者 30 秒定位所需插件、快速上手 DSH。

<p align="center">
  <a href="https://aust24lzy.github.io/dsh-plugin-hub/"><img src="https://img.shields.io/badge/在线访问-aust24lzy.github.io-6366f1?style=flat-square&logo=github" alt="在线访问"></a>
  <a href="https://1d6da375127842fe97d4a7e3e98c670b.app.workbuddy.link/"><img src="https://img.shields.io/badge/国内访问-CloudStudio-00a4ff?style=flat-square" alt="国内访问"></a>
  <a href="https://github.com/aust24lzy/dsh-plugin-hub/stargazers"><img src="https://img.shields.io/github/stars/aust24lzy/dsh-plugin-hub?style=flat-square" alt="GitHub stars"></a>
  <a href="https://github.com/aust24lzy/dsh-plugin-hub/network/members"><img src="https://img.shields.io/github/forks/aust24lzy/dsh-plugin-hub?style=flat-square" alt="GitHub forks"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
</p>

> 🌐 在线访问（国际）：**https://aust24lzy.github.io/dsh-plugin-hub/**
> 🇨🇳 在线访问（国内）：**https://1d6da375127842fe97d4a7e3e98c670b.app.workbuddy.link/**

## 📖 目录

- [功能](#-功能)
- [技术架构](#-技术架构)
- [快速开始](#-快速开始)
- [使用示例](#-使用示例)
- [数据同步](#-数据同步)
- [目录结构](#-目录结构)
- [部署](#-部署)
- [贡献指南](#-贡献指南)
- [说明](#-说明)

## ✨ 功能

- 🔍 **实时数据**：定时抓取 GitHub `dsh-plugin` 话题全部公开仓库，浏览器端每 30 分钟实时刷新 Top 100 星标
- 🗂️ **智能分类**：10 个分类（UI 界面 / Agent 编排 / 记忆知识 / 视觉多模态 / 开发工具 / 数据搜索 / 集成迁移 / 效率 / 娱乐彩蛋 / 安全）
- 📊 **多维度筛选**：分类 + 排序（Stars / Forks / 更新时间 / 收录时间）+ 关键词搜索 + 快捷筛选
- 🏆 **排行榜**：Top 10 Stars 榜单
- 🤖 **智能问答助手**：自然语言推荐插件，支持意图识别（10 类）、插件对比、多轮上下文与约束筛选（中文 / 高星 / 活跃 / 语言 / 协议）
- 🌐 **英文描述一键翻译**：插件描述为英文时，一键翻译为中文
- 📦 **安装命令一键复制**：`dsh plugin --profile web add github:owner/name`
- ⌨️ **键盘快捷键**：⌘K / Ctrl+K 快速聚焦搜索
- 🌗 暗 / 亮主题、插件详情弹窗
- 🚀 **双线部署**：GitHub Pages（国际，自动）+ CloudStudio（国内，手动快照）

## 🏗️ 技术架构

- **零依赖原生 JS**：无构建工具、无框架，纯 HTML + CSS + 原生 JS，可直接静态托管
- **共享问答引擎**：`chat-engine.js` 抽离为纯逻辑（无 DOM 依赖，全局 `window.DSHChat`），主站悬浮窗与全屏聊天页（`assistant.html`）复用同一套「意图识别 + 约束抽取 + 相关性评分」引擎
- **数据管道**：`sync.mjs` 抓取 GitHub Search API → 相关性过滤 + 智能分类 → 生成 `plugins.json` 快照 → 前端渲染；浏览器端再对 Top 100 星标做 30 分钟级实时刷新
- **双线部署**：GitHub Actions 每小时同步后自动部署到 GitHub Pages（国际）；国内访问经 CloudStudio 分享链接（手动部署快照）

## 🚀 快速开始

> 本仓库为纯静态站点（HTML + CSS + 原生 JS），无需构建，任何静态服务器均可运行。

### 1. 前置要求

| 依赖 | 版本 | 用途 |
| --- | --- | --- |
| [Node.js](https://nodejs.org/) | ≥ 18 | 运行数据同步脚本（可选） |
| Python 3 | 任意 | 本地起一个静态服务器（可选，也可用 `npx serve` 等） |

### 2. 克隆仓库

```bash
git clone https://github.com/aust24lzy/dsh-plugin-hub.git
cd dsh-plugin-hub
```

### 3. 本地运行

进入 `web` 目录，起一个静态服务器：

```bash
cd web
python -m http.server 8099
```

然后浏览器打开 **http://127.0.0.1:8099** 即可。

> 💡 也可以用任意静态服务器替代，例如：
> ```bash
> npx serve web
> ```
> 注：建议用本地服务器而非直接双击 `index.html`，部分浏览器下 `fetch` 本地 JSON 会受限。

### 4. 同步插件数据（可选）

站点默认读取 `web/plugins.json` 快照；如需刷新最新数据，运行同步脚本：

```bash
node scripts/sync.mjs
```

详见下方 [数据同步](#-数据同步)。

## 🎯 使用示例

### 示例 1：本地启动站点

```bash
git clone https://github.com/aust24lzy/dsh-plugin-hub.git
cd dsh-plugin-hub/web
python -m http.server 8099
# 浏览器打开 http://127.0.0.1:8099
```

### 示例 2：搜索插件

在顶部搜索框输入关键词即可实时过滤：

- 输入 `侧边栏` → 定位 Sidebar / UI 增强类插件
- 输入 `视觉` → 找到能看图、OCR、多模态相关插件
- 输入 `记忆` → 跨会话记忆、知识库类插件
- 输入 `多 Agent` → 团队协作、编排类插件

### 示例 3：筛选与排序

- 点击分类标签（如 `🎨 UI 与界面增强`）查看对应类别
- 使用快捷筛选：`🔥 高星榜 (≥100)` / `🆕 近 7 天新增` / `🇨🇳 中文友好` / `🟢 近 30 天活跃`
- 切换排序方式：`Stars` / `最近更新` / `Forks` / `最新收录`

### 示例 4：查看详情 + 复制安装命令

点击任意插件卡片打开详情弹窗，可查看：简介、分类、语言、Stars、开源协议等，并**一键复制安装命令**：

```bash
dsh plugin --profile web add github:owner/name
```

> 将 `owner/name` 替换为插件仓库的实际所有者与名称（弹窗内已自动生成完整命令）。

### 示例 5：智能问答助手

点击右下角悬浮球，用自然语言提问；也可点右上角「全屏聊天」进入独立聊天页：

- 🔍 找插件：「找能看图的插件」
- 🏆 推荐：「推荐高星插件」
- ⚖️ 对比：「对比 open-design 和 dsh-agent-teams」
- 📊 统计：「一共有多少插件」
- 📂 分类：「有哪些分类」
- 💬 多轮：「换一批」

### 示例 6：同步数据（带 Token 提升配额）

```bash
# 未认证（10 请求/分钟，脚本内置限流）
node scripts/sync.mjs

# 使用 GitHub Token 提升 API 配额（推荐）
GITHUB_TOKEN=ghp_xxx node scripts/sync.mjs
```

## 🔄 数据同步

同步脚本通过 GitHub Search API 抓取所有 `topic:dsh-plugin` 的公开仓库，做相关性过滤 + 智能分类后，生成 `web/plugins.json` 快照：

```bash
node scripts/sync.mjs [--out ../web/plugins.json]
```

- 支持环境变量 `GITHUB_TOKEN` 认证（更高 API 配额）
- 未认证限 10 req/min，脚本内置限流（约 7s/请求）
- GitHub Actions **每小时**自动同步，并部署到 GitHub Pages（国际）

## 📁 目录结构

```
.
├── scripts/sync.mjs        # 数据同步脚本（抓取 + 相关性过滤 + 智能分类）
├── web/                    # 站点源码（纯静态，无需构建）
│   ├── index.html          # 主页结构
│   ├── styles.css          # 样式（含暗/亮主题）
│   ├── app.js              # 主页逻辑（筛选 / 排序 / 排行榜 / 详情弹窗）
│   ├── chat-engine.js      # 智能助手共享引擎（纯逻辑，无 DOM 依赖）
│   ├── assistant.html      # 智能助手全屏聊天页
│   └── plugins.json        # 数据快照（由 sync.mjs 自动生成）
├── .github/workflows/      # 自动同步 + 部署到 GitHub Pages（另含 COS 上传）
└── LICENSE                 # MIT 协议
```

## 🚀 部署

本项目通过 GitHub Actions 自动部署，并额外提供国内访问通道：

| 通道 | 平台 | 访问地址 | 更新方式 |
| --- | --- | --- | --- |
| 🌍 国际 | GitHub Pages | `https://aust24lzy.github.io/dsh-plugin-hub/` | 每小时自动 |
| 🇨🇳 国内 | CloudStudio | `https://1d6da375127842fe97d4a7e3e98c670b.app.workbuddy.link/` | 手动部署快照 |

### 1. GitHub Pages（国际，自动）

1. **启用 Pages**：仓库 `Settings → Pages` 选择 `Deploy from a branch`，分支设为 `gh-pages`、目录 `/(root)`
2. **授权 Action**：`Settings → Actions → General` 勾选 `Read and write permissions`
3. 推送代码到 `main` 分支，或手动在 `Actions` 页运行 `Sync & Deploy` workflow（每小时第 30 分钟自动执行一次）

### 2. CloudStudio（国内，手动）

国内访问使用 WorkBuddy CloudStudio 部署的分享链接（免备案、国内直连）：

`https://1d6da375127842fe97d4a7e3e98c670b.app.workbuddy.link/`

> ⚠️ CloudStudio 是**静态快照**，GitHub Actions 每小时自动同步不会更新到此处；`web/` 有改动后需重新部署一次。

### 3. 腾讯云 COS（可选，需备案域名）

`deploy.yml` 已配置每小时同步上传到腾讯云 COS 桶 `mfnx-1469339292`（`ap-guangzhou`）。但注意：腾讯云 COS 规定 **2024 年 1 月 1 日后创建的桶，用默认域名（含 `cos-website` 静态网站域名）访问会强制下载、无法预览**。

如需通过 COS 正常访问，需**绑定已备案的自定义域名**（或接 CDN 域名）。所需 4 个密钥：

| 密钥名 | 说明 |
| --- | --- |
| `TENCENT_SECRET_ID` | 腾讯云 API 密钥 SecretId |
| `TENCENT_SECRET_KEY` | 腾讯云 API 密钥 SecretKey |
| `COS_BUCKET` | COS 存储桶名称（`mfnx-1469339292`） |
| `COS_REGION` | 存储桶地域（`ap-guangzhou`） |

## 🤝 贡献指南

欢迎任何形式的贡献！无论是修复 Bug、优化分类规则、改进界面，还是补充文档，都非常感谢 🙏

### 贡献方式

1. **Fork** 本仓库到你的账号
2. 创建特性分支：`git checkout -b feat/your-feature`
3. 提交改动：`git commit -m "feat: 描述你的改动"`
4. 推送到远端：`git push origin feat/your-feature`
5. 发起 **Pull Request**，描述清楚改动内容与动机

### 提交规范

- 提交信息建议遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)：`feat:` / `fix:` / `docs:` / `chore:` / `refactor:` 等
- 一次提交尽量只做一件事，保持变更聚焦

### 主要贡献方向

| 方向 | 说明 | 涉及文件 |
| --- | --- | --- |
| 分类规则 | 优化 `dsh-plugin` 生态的分类关键词与命中精度 | `scripts/sync.mjs` |
| 前端交互 | 新功能、性能优化、无障碍、主题适配 | `web/app.js`、`web/styles.css` |
| 智能助手 | 意图识别、约束抽取、推荐评分逻辑 | `web/chat-engine.js` |
| 文档 | 完善说明、示例、FAQ | `README.md` |
| Bug 修复 | 同步脚本、前端逻辑 | 任意 |

### 代码约定

- 前端保持**零依赖、原生 JS**（不引入构建工具 / 框架）
- 同步脚本使用 Node.js 内置 API（`node:fs` / `node:path` / `node:url` / `fetch`），不引入第三方依赖
- 智能助手引擎（`chat-engine.js`）保持纯逻辑、无 DOM 依赖，便于主站与全屏页复用
- 中文注释与文案，语义化命名，遵循 DRY 原则

### 提交前请确认

- [ ] 本地运行无报错
- [ ] 数据同步脚本可正常生成 `web/plugins.json`
- [ ] 不影响现有暗/亮主题与筛选排序功能

所有贡献默认遵循本仓库的 [MIT 协议](./LICENSE)。

## 📄 说明

本项目为**非官方社区项目**，数据源自 GitHub `dsh-plugin` 生态。DeepSeek Harness 由 DeepSeek 官方开源（MIT 协议）。

- 官方仓库：https://github.com/deepseek-ai/deepseek-harness
- 插件生态：https://github.com/topics/dsh-plugin
- 官网：https://www.deepseek.com/harness/
