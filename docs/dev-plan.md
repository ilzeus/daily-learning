# 分步开发计划 —— Daily Learning

> 原则：每次只做一个小功能，确认能跑通再做下一个。

---

## Step 0 — Electron 项目初始化

**目标：** `npm start` 弹出桌面窗口，显示 "Hello Daily Learning"。

- [ ] `npm init` 创建 package.json
- [ ] 安装 electron 依赖
- [ ] 创建 `main.js`（主进程，创建 480×680 的 BrowserWindow）
- [ ] 创建 `index.html`
- [ ] 创建 `scripts/renderer.js`（渲染进程入口，可为空）
- [ ] 配置 `package.json` 的 `"start"` 脚本为 `electron .`
- [ ] 验证：`npm start` 弹出 480×680 桌面窗口

---

## Step 1 — 全局样式 & 设计 Token

**目标：** CSS 变量可用，深蓝背景 + 品牌区就位。

- [ ] 创建 `styles/global.css`
- [ ] `:root` 中定义设计 Token（配色、圆角、字体）
- [ ] 全局 reset + `body` 背景设为 `#122E8A`
- [ ] 引入 Google Fonts（Caveat 或 Dancing Script）
- [ ] 顶部品牌区：像素鹰 `assets/eagle.png` + "Daily Learning" 艺术字体
- [ ] 验证：桌面窗口深蓝背景，顶部品牌区正确显示

---

## Step 2 — 学习内容输入区（F1）

**目标：** 用户可以输入学习主题。

- [ ] 大尺寸圆角 textarea，米白底（`#F5EFEA`）
- [ ] placeholder："输入你想学习的内容..."
- [ ] 样式符合设计规范（16px 圆角、深色文字）
- [ ] 验证：输入框可用，样式正确

---

## Step 3 — "生成笔记"按钮 & 加载动画（F2 前半）

**目标：** 点击按钮触发加载动画。

- [ ] "生成笔记"按钮（米白底 + 深蓝文字 + 16px 圆角）
- [ ] 像素鹰进度条加载动画（CSS 动画，从左飞到右循环）
- [ ] 点击按钮 → 显示动画（先不接 API）
- [ ] 验证：点击按钮后动画播放，再次点击或模拟完成后动画消失

---

## Step 4 — DeepSeek API 集成（F2 后半）

**目标：** 调用 DeepSeek API，渲染 Markdown 结果。

- [ ] 创建 `scripts/api.js`（封装 DeepSeek API 调用）
- [ ] 系统提示词按需求文档配置
- [ ] 安装 marked.js，渲染返回的 Markdown
- [ ] 结果卡片：米白底、可滚动、深蓝文字
- [ ] 错误处理：友好提示 "生成失败，请检查网络或API配置后重试"
- [ ] 验证：输入主题 → 点击生成 → 动画 → Markdown 结果正确渲染

---

## Step 5 — 保存到 Notion（F3）

**目标：** 生成结果可一键保存到 Notion。

- [ ] 创建 `scripts/notion.js`（封装 Notion API 调用）
- [ ] "保存到 Notion"按钮（未生成时 disabled 置灰）
- [ ] 保存逻辑：标题=主题，Content=Markdown，Date=当前日期
- [ ] 保存成功/失败提示
- [ ] 验证：生成 → 保存 → Notion 数据库中出现新页面

---

## Step 6 — 首次启动配置（F4）

**目标：** 首次启动弹出配置窗口，配置持久化。

- [ ] 安装 electron-store
- [ ] 创建 `scripts/config.js`（配置读写）
- [ ] 配置弹窗（三个字段 + 保存/取消）
- [ ] 首次启动检测 → 无配置则弹窗
- [ ] 菜单栏可重新唤出配置窗口
- [ ] 验证：首次启动弹窗 → 填写配置 → 重启不再弹出 → 菜单可修改

---

## Step 7 — 打包 .exe

**目标：** 生成可分发的 Windows .exe。

- [ ] 配置 electron-builder
- [ ] 执行打包命令
- [ ] 验证：.exe 可在 Windows 上独立运行

---

## 变更记录

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-06-22 | v0.1 | 初始版本（React 技术栈） |
| 2026-06-22 | v0.2 | 修正为 Electron + 原生 HTML/CSS/JS |
| 2026-06-22 | v0.3 | 对齐 Daily Learning 需求：细化为 Step 0~7，覆盖 F1~F4 + 打包 |
