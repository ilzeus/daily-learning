# 技术栈说明

> 版本：v0.2 | 最后更新：2026-06-22

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Electron | 跨平台桌面应用 |
| 界面 | 原生 HTML + CSS + JavaScript | 不引入前端框架 |
| 包管理 | npm | Node.js 生态 |
| Lint | ESLint（可选） | 代码规范 |

## 核心依赖

```json
{
  "devDependencies": {
    "electron": "^latest"
  }
}
```

## 设计 Token 管理

- 所有颜色、圆角、间距定义为 CSS 变量，写在 `styles/global.css` 中
- 禁止在 HTML 或 JS 中硬编码颜色值
- 参考文件：`docs/design-spec.md`

## 项目结构（规划）

```text
Project2/
├── devlog/            # 开发日志
├── docs/              # 项目文档
├── styles/            # CSS 样式文件
│   └── global.css     # 全局样式 & 设计 Token
├── scripts/           # JS 脚本（渲染进程）
│   └── renderer.js    # 渲染进程入口
├── index.html         # 主页面
├── main.js            # Electron 主进程
├── CLAUDE.md          # AI 开发指引
└── package.json
```

## 运行方式

```bash
npm start              # 启动 Electron 桌面窗口
```

---

## 变更记录

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-06-22 | v0.1 | 初始版本（React + TS + Vite） |
| 2026-06-22 | v0.2 | 修正为 Electron + 原生 HTML/CSS/JS |
