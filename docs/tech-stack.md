# 技术栈说明 —— Daily Learning

> 版本：v0.4 | 最后更新：2026-10-01

---

## 总览

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 桌面框架 | Electron | ^35.7.5（Chromium 134） | 单窗口，无系统菜单 |
| 界面 | 原生 HTML / CSS / JS | — | 无框架、无构建步骤、无打包器 |
| Markdown | marked | ^4.3.0 | 唯一的运行时依赖。v5 起 renderer 钩子改成收 token 对象，`scripts/markdown.js` 的转义/协议白名单要跟着重写才能升 |
| 打包 | electron-builder | ^26.15.3 | portable + nsis，产物在 `release/` |
| AI 接口 | OpenAI 兼容 `chat/completions` | — | 纯 `fetch`，不装官方 SDK |
| 归档 | Notion API | `2022-06-28` | 纯 `fetch` |
| 配置 | Node `fs` + JSON | — | 密钥字段过 `safeStorage` |

**依赖只有 marked 一个。** 加任何新依赖前先想清楚：这是一个离线桌面壳，多一个包就多一份供应链风险。

---

## 进程模型

```
main.js ─ 建窗口 / 去菜单 / 装守卫
   │
   ├── scripts/handlers.js ── ipcMain.handle(...)   ← 正式启动与离线探针共用
   │      ├── config.js      读写配置、DPAPI 加解密、旧格式迁移
   │      ├── api.js  ─────── providers.js, http.js  生成三版、拉模型列表
   │      ├── notion.js      Markdown → Notion 块，分批 append
   │      └── notes-store.js 本机 Markdown 落盘
   │
   ├── scripts/window-guards.js ── 导航/弹窗/webview 拦截 + 快捷键
   │
preload.js ─ contextBridge 白名单（渲染进程唯一的出口）
   │
scripts/renderer.js ─ 只碰 DOM，网络与文件一律走 window.dl.*
   └── scripts/markdown.js ── marked + HTML 转义 + 链接协议白名单（在渲染进程内执行）
```

- `nodeIntegration: false` + `contextIsolation: true`：渲染进程拿不到 `require`、`process`、`fs`。
- `sandbox: false` 是必须的：`preload.js` 要 `require('./scripts/markdown.js')`，而沙箱预加载脚本只能 `require('electron')`。
- 所有 IPC 走统一的信封：`{ ok: true, data }` / `{ ok: false, error: string }`，`Error` 对象不跨进程。

---

## IPC 通道

| 通道 | 入参 | 返回 | 说明 |
|------|------|------|------|
| `boot:get` | — | `{providers, modeLabels, config, hasConfig, notesDir, defaultNotesDir, issues}` | 一次拿全启动数据；`config` 是**公开视图**，密钥只有 `hasApiKey` / `hasNotionToken` 两个布尔；`notesDir` 是已生效的目录（没配就是默认值），`defaultNotesDir` 只用来当输入框 placeholder |
| `config:set` | 局部 patch | 新的公开配置 | 密钥字段留空表示不改动；写盘后清掉 Notion 属性缓存 |
| `notes:generate` | `{topic, mode, requestId}` | `{markdown, saveError?}` | 一次点生成 = 三个并发调用；`requestId` 用于中止；`autoSaveNotes` 开着才顺手落盘 |
| `notes:abort` | `{requestIds[]}` | `true` | 按 id 掐掉还在飞的请求 |
| `models:list` | `{apiKey?, baseUrl}` | `string[]` | 界面上还没保存的草稿值也能查 |
| `notion:save` | `{title, markdown}` | 页面 URL | |
| `clipboard:write` | 文本 | `true` | 渲染进程的 clipboard API 在窗口失焦时会静默失败 |
| `notes:open-folder` | — | `true` | `await shell.openPath`（**必须 await**：不 await 拿到的是 pending Promise，恒为真 → 文件夹开了却仍报「打不开」，2026-10-02 就是这么踩的）。失败返回的是英文原因，已转成人话，原文只进 `console.error` |
| `notes:pick-dir` | — | 路径字符串，取消时 `''` | `dialog.showOpenDialog({properties:['openDirectory','createDirectory']})`，用户自己点，主进程不猜路径 |

新增能力必须同时改 `handlers.js` 和 `preload.js`——preload 是白名单，不在上面的通道界面就看不见。

---

## 网络层

`scripts/http.js` 的 `request(url, options, timeoutMs, signal)` 统一负责：

- 内部 `AbortController` 管超时，外部 `signal` 管用户中止，两者都要能触发；
- 错误**归因**：外部 signal 已 abort → 「已中止生成」；超时 → 「等得太久了，检查一下接口地址…」；其余 → 「连不上这个地址（…），检查一下接口地址和网络」。
- 超时：生成 120s（模型可能真的要想一会儿），拉模型列表 15s。

渲染进程 `connect-src 'none'`，**不可能**自己发请求。

---

## 存储

| 位置 | 内容 |
|------|------|
| `<userData>/daily-learning-config.json` | 配置；`apiKey` / `notionToken` 存成 `enc:v1:<base64>`；`autoSaveNotes` 只在显式为 `true` 时才开（缺字段 = 关）；`notesDir` 存用户自定义目录，空 = 默认 |
| `<userData>/notes/*.md` | 默认落盘位置，`notesDir` 填了就以 `notesDir` 为准 |

- 写盘一律 `tmp` + `rename` 原子替换，避免半截文件被当成损坏配置。
- 读不出来时分清三种情况：文件损坏 / 密钥解不开（换机器或换了 Windows 账户）/ 系统密钥库不可用，各自给出对应提示，统一收在 `getConfigIssues()` 里由 `boot:get` 带回。
- `migrateStore()` 在注册 IPC 前跑一次，负责把 `deepseekApiKey`、明文密钥等历史格式升级成当前结构。**改字段名必须在这里补兼容。**

---

## 安全

| 措施 | 位置 |
|------|------|
| CSP：`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'` | `index.html` |
| 渲染时把模型输出里的原始 HTML 转义成文字（marked 自定义 renderer 的 `html` 钩子） | `scripts/markdown.js` |
| 链接只放行 `http(s)` / `mailto`，其余协议降级成 `#`；图片只放行 `https:` | `scripts/markdown.js` |
| 窗口内导航 / `window.open` / `<webview>` 全拦 | `scripts/window-guards.js` |
| 密钥加密绑定 Windows 账户（DPAPI） | `scripts/config.js` |
| 密钥不过 IPC 边界 | `getPublicConfig()` |

> CSP 有个副作用：探针里想注入 `<style>` 覆盖样式会被拒（`style-src 'self'`），用 `webContents.insertCSS()` 绕过——那是测试脚手架的事，不是应用的洞。

---

## 运行与验证

```bash
npm install
npm start              # 开发运行
npm run build:win      # 打包（产物 release/）
node --check main.js preload.js scripts/*.js   # 语法自检
```

没有测试框架。回归靠临时 Electron 探针（隐藏窗口 + `--user-data-dir` 隔离 + 本地 mock 服务 + 结果写文件），做法和坑见 `CLAUDE.md` 的「验证流程」。

---

## 变更记录

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-06-22 | v0.2 | Electron + 原生 HTML/CSS/JS，规划中的项目结构 |
| 2026-10-01 | v0.3 | 按实现重写：进程模型、IPC 通道表、网络层与错误归因、存储与迁移、安全措施、真实依赖 |
| 2026-10-01 | v0.4 | 新增配置项 `autoSaveNotes`（关掉后 `notes:generate` 不写盘、不建目录） |
| 2026-10-01 | v0.5 | `autoSaveNotes` 默认值改为 `false`；新增 `notesDir` 配置与 `notes:pick-dir` 通道（`dialog.showOpenDialog` 选目录） |
