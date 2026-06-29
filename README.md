# Daily Learning

Windows 桌面端 AI 学习笔记助手。输入想学习的概念，AI 自动生成结构化知识点和总结，一键保存到 Notion。

## 功能演示

![主界面](assets/exp1.png)

![生成笔记](assets/exp2.png)

![配置页面](assets/exp3.png)

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron |
| 界面 | 原生 HTML / CSS / JavaScript |
| AI API | DeepSeek API |
| 存储 | Notion API |
| Markdown 渲染 | marked.js |
| 本地配置 | 本地 JSON 文件存储 |

## 功能特性

- 输入学习主题，AI 自动生成知识点 + 总结
- Markdown 渲染，格式清晰
- 一键保存到 Notion 数据库
- 像素鹰加载动画
- 首次配置向导，API Key 本地加密存储
- 深海蓝 + 米白配色，全局圆角设计

## 使用方法

1. 下载 [Releases](../../releases) 中的 `.exe` 安装包
2. 首次启动时配置 DeepSeek API Key 和 Notion Token
3. 输入想学习的内容，点击生成笔记
4. 点击保存到 Notion

## 本地开发

```bash
# 安装依赖
npm install

# 启动应用
npm start
```

## 项目结构

```
.
├── main.js                 # Electron 主进程
├── index.html              # 主页面
├── package.json            # 项目配置 & 依赖
├── scripts/
│   ├── api.js              # DeepSeek API 调用
│   ├── config.js           # 本地配置管理
│   ├── notion.js           # Notion API 调用
│   └── renderer.js         # 渲染进程主逻辑
├── styles/
│   └── global.css          # 全局样式 & 设计 Token
├── docs/
│   ├── requirements.md     # 功能需求文档
│   ├── tech-stack.md       # 技术栈说明
│   ├── design-spec.md      # 设计规范
│   └── dev-plan.md         # 分步开发计划
├── devlog/                 # 开发日志
└── assets/                 # 静态资源（品牌图、演示截图等）
    ├── exp1.png             # 主界面截图
    ├── exp2.png             # 生成笔记截图
    └── exp3.png             # 配置页面截图
```

## 作者

- **jklzues**
- GitHub: [@jklzues](https://github.com/jklzues)
