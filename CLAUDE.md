# CLAUDE.md —— Daily Learning AI 开发指引

> 每次 AI 开发会话开始时，先读本文件和 `docs/` 下的文档。文档写的是**现在是什么样**，不是当初的规划。

---

## 项目简介

**Daily Learning** 是基于 Electron 的 Windows 桌面学习助手。输入一个概念，一次并发调用 OpenAI 兼容接口，拿到三种讲解风格（学习版 / 专业版 / 笔记版），可归档到 Notion，也可在配置里打开自动落盘开关把每版写成本机 Markdown（默认关）。

详细需求见 [`docs/requirements.md`](docs/requirements.md)。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 35（Chromium 134），`sandbox: false`（preload 要 `require` 本地模块） |
| 界面 | 原生 HTML + CSS + JavaScript，**禁止引入前端框架** |
| 唯一运行时依赖 | `marked` v4（渲染前转义 HTML） |
| 开发依赖 | `electron`、`electron-builder` |
| AI 接口 | OpenAI 兼容 `chat/completions`，服务商预设见 `scripts/providers.js` |
| 归档 | Notion API `2022-06-28` |
| 配置存储 | `fs` + JSON 文件，密钥字段用 `safeStorage`（Windows DPAPI）加密成 `enc:v1:...` |

**没有 electron-store**（v1.0 时用 `fs` 重写过，别再加回来）。

---

## 关键文件

| 文件 | 说明 |
|------|------|
| `main.js` | 建窗口、去菜单栏、装守卫，只做这些 |
| `preload.js` | `contextBridge` 白名单，渲染进程唯一的出口 |
| `index.html` | 单页界面 + CSP meta |
| `scripts/handlers.js` | 所有 `ipcMain.handle` 注册；正式启动和离线探针共用这一份 |
| `scripts/window-guards.js` | 导航 / `window.open` / webview 拦截 + 键盘快捷键（菜单被去掉后 accelerator 靠它） |
| `scripts/config.js` | 配置读写、加解密、旧格式迁移、读取异常诊断 |
| `scripts/providers.js` | 服务商预设、接口地址拼接 |
| `scripts/http.js` | fetch 封装：超时、外部 signal 转发、错误归因成人话 |
| `scripts/api.js` | 三套 system prompt、`generateNotes(topic, mode, signal)`、`listModels` |
| `scripts/markdown.js` | Markdown → HTML：转义、标题锚点、链接协议白名单 |
| `scripts/notion.js` | Markdown → Notion 块，属性探测 + 分批追加 |
| `scripts/notes-store.js` | 本机落盘：默认/自定义目录、路径校验、文件名净化、本地时间戳 |
| `scripts/renderer.js` | 界面逻辑（唯一碰 DOM 的地方） |
| `styles/global.css` | 设计 Token + 全部样式 |
| `assets/logo.png` | 鹰徽标（任务栏 / 标题栏 / 打包图标） |

---

## 不可回退的决策

这些是讨论后定下来的，改回去要先问：

1. **一次生成三版，切档零延迟。** 不做「切档时才请求」——那是拿体验换 token。三版排版必须明显不同（段落密度、字号行距、列表形态），不能只是换个措辞。
2. **视觉语言是简洁工具风 + Apple tokens**：浅灰底 `#F5F5F7`、白色柔光卡片、墨黑 pill 主按钮、彩色只用于语义状态。**蓝色系已被明确否决**，别在任何地方重新引入。
3. **配置字段改名 / 换结构，必须在 `migrateStore()` 里兼容老文件。** 使用者不该重填任何密钥。
4. **Notion 是可选的。** 没填 Notion 只该挡住「保存到 Notion」，不该拦生成、不该在首次配置里追问。
5. **错误文案说人话**：说清「哪一步、大概为什么、下一步做什么」，不把 errno、堆栈、他的用户目录贴到界面上（原始错误进 `console.error`）。
6. **新增配置项必须对老文件有默认值**（`getConfig()` 里判 `=== true` / `!== false` 这种），不靠 `migrateStore()` 补字段。带副作用的默认**关**——`autoSaveNotes` 缺失＝不写盘，不往用户硬盘上放东西；纯展示类的才默认开。

---

## 安全边界（硬性）

- 渲染进程 `nodeIntegration: false`、`contextIsolation: true`，只能通过 `preload.js` 显式列出的通道和主进程说话；新增能力必须在这里显式开口子。
- **密钥永不过 IPC 边界**：`getPublicConfig()` 只给 `hasApiKey` / `hasNotionToken` 布尔值。任何把 `apiKey` / `notionToken` 明文送回渲染进程的改动都是回归。
- 密钥落盘前经 `safeStorage`；不可用时如实报「这台机器的系统密钥库不可用」，不退回明文存储。
- CSP 保持 `script-src 'self'`、`connect-src 'none'`、`object-src 'none'`。渲染进程不做网络请求。
- 模型输出的 HTML 一律转义；链接只放行 `http(s)` 和 `mailto`，其余协议（含 `javascript:`）不渲染成可点元素。
- 窗口内导航、`window.open`、`<webview>` 全部拦截，外部链接交系统浏览器。

---

## 编码约定

**CSS**
- 颜色 / 圆角 / 间距 / 字号一律引用 `:root` 的 Token，禁止硬编码色值。
- 类名 BEM 风格 kebab-case（`.result__footer`、`.config-modal__field--hidden`）。
- 灰阶每档都要过 WCAG AA（普通文字 ≥ 4.5:1）；改文字色前先算对比度。
- 焦点可见：全局 `:focus-visible` 描边，别用 `outline: 0` 干掉。

**JavaScript**
- ES6+，camelCase；一个文件一个职责。
- 注释写「为什么」，不写「这行干什么」；中文。
- 界面状态变化必须有可见反馈（按钮文案、loading、toast、标签红点），不静默失败。
- `renderer.js` 整个是一个 `DOMContentLoaded` 回调：启动流程在中间就调用了 `showConfigModal()`，所以**它引用的任何 `const` 必须声明在那之前**，否则 TDZ 报错会把整个回调炸掉，症状是「配置窗根本不出现」。
- 返回 Promise 的 Electron API（`shell.openPath` / `shell.openExternal` / `dialog.showOpenDialog`）**必须 `await` 或 `.catch()`**：漏掉 await 时 `if (result)` 判的是 Promise 对象，恒为真——`openPath` 这样写过，结果资源管理器开了、界面却报「打不开」。

**Git**
- 不擅自 commit / push，由使用者决定。
- 提交信息：`fix: …` / `feat: …`，一句话说清改动。

---

## 验证流程

改完界面或主进程代码，按下面顺序确认（这台机器上实测可行的路子）：

1. `node --check` 过一遍所有 JS。
2. **Electron 自当测试宿主**：写临时 `.probe-*.js`，用
   `./node_modules/electron/dist/electron.exe --user-data-dir="$TEMP/xxx" .probe-xxx.js`
   起**隐藏窗口**跑真实 `index.html`，`webPreferences` 用真 `preload.js`，`executeJavaScript` 驱动 UI，结果写 `.probe-*.json` 再读。
   - 必须带 `--user-data-dir`：既隔离配置，也避免和使用者开着的实例抢默认 userData。
   - **结果写文件，不要用管道**（Windows GUI 子系统的 stdout 不接管道，会永久挂起）。
   - 加 `setTimeout` 看门狗写 TIMEOUT；注入页面的脚本包成 `(async () => {...})()`，并挂 `process.on('unhandledRejection')`。
   - 浮层 / 提示必须做命中测试（`elementFromPoint` + `closest`），只断言 class 和文本会漏掉遮挡。
   - `capturePage()` 先丢一帧再截，防止旧帧。
   - **不要**在探针里点「打开文件夹」这类会弹资源管理器 / 浏览器的动作，改完如实说明该路径未验证。
3. 探针文件（`.probe-*`）用完删掉，别留在仓库里。

---

## 工作流程

1. 读本文件 + `docs/`。
2. 看 `devlog/` 最新一篇，了解上次进度和还没验证的部分。
3. 一次做一个小步，做完用上面的流程验证。
4. 在 `devlog/` 记录：改了什么、**怎么验的、验到了什么、哪些没验**。没跑过的测试不能写成跑过。
