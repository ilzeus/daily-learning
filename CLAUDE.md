# CLAUDE.md —— Daily Learning AI 开发指引

> 每次 AI 开发会话开始时，请先阅读本文件和 `docs/` 中的所有标准文档。

---

## 项目简介

**Daily Learning** 是一个基于 Electron 的 Windows 桌面学习助手。用户输入想学习的概念，AI（DeepSeek）自动生成结构化知识点和总结，支持一键保存到 Notion 知识库。

详细需求见 [`docs/requirements.md`](docs/requirements.md)。

---

## 技术栈

详见 [`docs/tech-stack.md`](docs/tech-stack.md)

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron |
| 界面 | 原生 HTML + CSS + JavaScript |
| 包管理 | npm |
| AI API | DeepSeek API |
| 存储 | Notion API + electron-store |
| 打包 | electron-builder → Windows `.exe` |

## 核心依赖

| 包 | 用途 |
|----|------|
| `electron` | 桌面框架 |
| `electron-store` | 加密本地存储（API Key 等） |
| `marked` | Markdown 渲染 |
| `electron-builder` | 打包 Windows .exe |

---

## 设计规范速查

详见 [`docs/design-spec.md`](docs/design-spec.md)

| 规则 | 值 |
|------|-----|
| 全局背景色 | `#122E8A`（深海蓝） |
| 卡片/输入区底色 | `#F5EFEA`（米白） |
| 圆角 | **所有矩形 16px**（硬性规则，禁止直角） |
| 窗口默认尺寸 | 480 × 680 px |
| 品牌字体 | Google Fonts（Caveat 或 Dancing Script） |
| Markdown 渲染 | marked.js |

---

## 关键文件路径

| 文件/目录 | 说明 |
|-----------|------|
| `CLAUDE.md` | 本文件，AI 开发指引 |
| `main.js` | Electron 主进程 |
| `index.html` | 主页面 |
| `scripts/renderer.js` | 渲染进程主逻辑 |
| `scripts/api.js` | DeepSeek API 调用 |
| `scripts/notion.js` | Notion API 调用 |
| `scripts/config.js` | electron-store 配置管理 |
| `styles/global.css` | 全局样式 & 设计 Token |
| `assets/eagle.png` | 像素鹰品牌图 |
| `docs/requirements.md` | 功能需求文档 |
| `docs/tech-stack.md` | 技术栈说明 |
| `docs/design-spec.md` | 设计规范 |
| `docs/dev-plan.md` | 分步开发计划 |
| `devlog/` | 开发日志目录 |

---

## 编码约定

### 样式（CSS）
- **所有矩形元素必须使用 `border-radius: 16px`**（或引用 `var(--radius-default)`）
- 颜色必须引用 CSS 变量，禁止硬编码色值
  - 全局背景用 `var(--color-primary)` → `#122E8A`
  - 卡片/输入区用 `var(--color-surface)` → `#F5EFEA`
- 所有设计 Token 统一定义在 `styles/global.css` 的 `:root` 中
- 全局背景色设在 `body` 上（`#122E8A`）

### HTML
- 语义化标签优先（`<header>`、`<main>`、`<section>` 等）
- 类名使用 kebab-case（如 `btn-primary`、`result-card`、`config-modal`）

### JavaScript
- 使用 ES6+ 语法（const/let、箭头函数、模板字符串、async/await）
- 变量/函数命名使用 camelCase
- 一个文件对应一个功能模块（api.js → DeepSeek，notion.js → Notion，config.js → 本地存储）

### 通用
- **禁止引入任何前端框架**（React / Vue / Angular 等）
- 保持依赖最小化
- 首次启动逻辑：检测 electron-store 中是否有配置 → 无则弹出配置窗口

### Git
- 每完成一个 dev-plan 中的 Step 提交一次
- Commit message 格式：`Step N — 简短描述`

---

## AI 工作流程

### 每次开发会话开始时

1. **阅读本文件**（`CLAUDE.md`）
2. **阅读 `docs/` 中的所有标准文档**：`requirements.md`、`tech-stack.md`、`design-spec.md`、`dev-plan.md`
3. **在 `devlog/` 中创建今日日志文件**（如 `devlog/2026-06-22.md`）——如果当天尚无文件
4. **查看今日日志**，了解上次的进度和待办事项

### 开发过程中

- 严格遵循 `docs/design-spec.md` 中的设计规范
- 每次只做一个小功能（对应 `docs/dev-plan.md` 中的一个 Step）
- 做完后确认能跑通，再继续下一步
- 在日志文件中记录完成事项和遇到的问题

### 开发会话结束时

- 更新 `devlog/` 中的当日日志
- 标记完成和未完成的事项
