# 设计规范 —— Daily Learning

> 版本：v0.4 | 最后更新：2026-10-01
>
> v0.2 写的是「深海蓝 + 米白 + 像素鹰 + 全局 16px 圆角」，那版已经整个换掉了。
> 这份文档里的每个值都对应 `styles/global.css` 的 `:root`，改 Token 请同步改这里。

---

## 设计语言

**简洁工具风 + Apple 设计语言。** 判断标准不是「好不好看」而是三条：

1. 浅灰底 + 白色柔光卡片分层，**不靠描边靠阴影**；
2. 主操作是**墨黑 pill**，彩色只出现在语义状态上（绿=强调/成功，红=错误），**没有蓝色主题**；
3. 留白优先于信息密度，一屏只做一件事。

---

## 配色 Token

### 背景与表面

| Token | 值 | 用途 |
|-------|-----|------|
| `--color-bg` | `#F5F5F7` | 全局背景（`body`） |
| `--color-surface` | `#FFFFFF` | 卡片、输入区、弹窗 |
| `--color-surface-alt` | `#FAFAFC` | 次按钮 hover 底色 |
| `--color-border` | `rgba(0,0,0,.08)` | 极轻界定线 |
| `--color-border-strong` | `rgba(0,0,0,.16)` | 需要看清的边框 |

### 文字（每档都算过对比度）

| Token | 值 | 对白底对比度 | 用途 |
|-------|-----|--------------|------|
| `--color-text` | `#1D1D1F` | 9.9:1 | 正文、标题 |
| `--color-text-muted` | `#55555A` | 6.8:1 | 标签、说明、次要信息 |
| `--color-text-faint` | `#707076` | 4.5:1 | 占位符、路径等最弱一档 |

> 上一版用的是 `#86868B`（3.3:1），普通字号读不出来，已经整体调深。**改文字色前先算相对亮度。**

### 主操作与语义色

| Token | 值 | 用途 |
|-------|-----|------|
| `--color-ink` / `--color-ink-hover` | `#1D1D1F` / `#3A3A3C` | 墨黑 pill 主按钮 |
| `--color-accent` | `#1F7A35` | 强调 / 选中 / 焦点环（Apple 绿加深到能当正文读，`#248A3D` 只有 4.4:1） |
| `--color-accent-ring` / `--color-accent-soft` | `rgba(31,122,53,.20)` / `.08` | 焦点环、选中底 |
| `--color-success` | `#248A3D` | 成功 toast 圆点 |
| `--color-danger` | `#B42318` | 错误文字、失败红点 |
| `--color-danger-bg` / `--color-danger-line` | `#FFF1F0` / `rgba(180,35,24,.22)` | 错误区底色与内描边 |

**不用 emoji 表达状态**，toast 和标签用小圆点（`::before` + 语义色）。

---

## 圆角

| Token | 值 | 用在哪 |
|-------|-----|--------|
| `--radius-sm` | `10px` | 表单输入框、代码块 |
| `--radius-md` | `14px` | textarea、错误区、下拉弹层 |
| `--radius-lg` | `18px` | 结果卡片 |
| `--radius-xl` | `22px` | 配置弹窗 |
| `--radius-pill` | `980px` | 所有按钮、分段控件、toast |

例外（语义就是「胶囊 / 小片」，不套 Token）：进度条 `999px`、行内代码 `6px`、圆形头像与状态点 `50%`。

> 旧规则「所有矩形一律 16px」已废弃——同一种圆角用在 22px 的输入框和 300px 的卡片上会显得呆。

---

## 字体

| Token | 值 |
|-------|-----|
| `--font-body` | `-apple-system, "SF Pro Text", "Segoe UI Variable Text", "Microsoft YaHei UI", "PingFang SC", sans-serif` |
| `--font-display` | 同上，Display 变体，用于标题与数字 |
| `--font-mono` | `"SF Mono", "Cascadia Code", Consolas, monospace` |

**不引 Google Fonts。** 桌面应用离线启动、且中文根本用不上 Caveat 那类手写体；旧规范里的品牌艺术字已删。

| Token | 值 | 用途 |
|-------|-----|------|
| `--font-size-xs` | `12px` | 字段标签、提示 |
| `--font-size-sm` | `13px` | 按钮、toast、次要文字 |
| `--font-size-md` | `14px` | 正文基准（`body`） |
| `--font-size-lg` | `15px` | 小标题 |
| `--font-size-xl` | `17px` | 弹窗标题、结果区 H1 |

字重只有三档：`400` 正文 / `500` 按钮与标签 / `600` 标题强调（`--font-weight-normal/medium/bold`）。
全局 `line-height: 1.6`，标题 `letter-spacing` 轻微收 `-0.3px ~ -0.5px`。

---

## 间距 / 阴影 / 动效

- 间距：`4 / 8 / 12 / 20 / 28`（`--space-xs…xl`），页面左右留 `20px`
- 阴影取代描边：
  - `--shadow-card` `0 1px 2px rgba(0,0,0,.03), 0 6px 24px rgba(0,0,0,.06)` — 静止卡片
  - `--shadow-raise` `0 2px 8px …, 0 12px 32px …` — 弹窗、toast
  - `--shadow-btn` `0 1px 2px rgba(0,0,0,.16)` — 主按钮
- 缓动统一 `--ease-out: cubic-bezier(.32,.72,0,1)`（Apple 的减速手感），时长 0.15–0.3s
- 位移幅度小：按钮按下 `scale(0.97)`、toast 入场 `translateY(8px)`，hover 只换底色不上浮
- 全应用只有一处循环动画：加载态那根 iOS 风格的不确定进度条（3px 轨道 + 32% 绿色滑块，1.2s `track-slide`），其余一律禁止无限循环

---

## 组件要点

| 组件 | 规则 |
|------|------|
| 主按钮 | 墨黑 pill + `--shadow-btn`，hover 转 `--color-ink-hover`，按下 `scale(.97)`；生成中整个按钮变「中止生成」 |
| 次按钮 | 白底 pill + `--shadow-card`，hover 转 `--color-surface-alt`，图标用 `currentColor` |
| 分段控件 | 轨道 `rgba(0,0,0,.05)`，选中档浮起成白底 pill（iOS 分段控件做法）；失败档文字转红 + 右上角 5px 红点 |
| 输入区 | 白卡 `--radius-md`，`focus` 时 `--color-accent-ring` 外环 |
| 结果卡片 | 白卡 `--radius-lg`，内部滚动；`data-mode` 决定排版（三版字号/行距/列表标记不同） |
| 配置弹窗 | `--radius-xl` 白卡 + 毛玻璃遮罩（`blur(24px) saturate(180%)`），底部操作条 `position: sticky` 常驻可见 |
| 自绘下拉 | 原生 `select` 只当数据源藏起来；弹层是 `.picker`（Electron 35 无法用 CSS 改原生弹层的蓝色高亮） |
| 开关 | 原生 `checkbox` + `appearance:none` 换皮（保留键盘焦点和空格切换）：42×26 pill，关 `--color-border-strong`、开 `--color-accent`，22px 白滑块走 `translateX(16px)`，`0.18s var(--ease-out)`；文案与开关同一行、两端对齐，文案 `label` 带 `for` 指向 checkbox |
| 路径输入 | 等宽 `--font-mono` + `--font-size-xs` + `--color-text-faint`（路径是最弱一档信息）；placeholder 直接写「留空 = <默认目录>」，把默认值摊开给人看而不是藏在代码里；下方「自定义保存位置」「打开文件夹」右对齐成一行小按钮。按钮文案说**这件事的结果**（保存去哪），不说控件动作（「选文件夹」已被否掉） |
| Toast | 白底 pill + `--shadow-raise` + 左侧语义圆点，3 秒自动收 |

---

## 可访问性

- 焦点必须可见：全局 `button/input/textarea/[tabindex]:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }`
- 分段控件用 roving tabindex：整组只占一个 Tab 停靠点，`←/→/Home/End` 换档
- 动态文案：toast `role="status" aria-live="polite"`，错误区 `role="alert"`
- 图标按钮一律 `aria-label`，装饰性 SVG `aria-hidden="true"`
- Tab 顺序 = 视觉顺序：配置入口 → 输入框 → 分段控件 → 生成按钮 → 弹窗字段

---

## 层级（z-index）

| 层 | 值 |
|----|-----|
| 标题栏 | 100 |
| 配置遮罩 | 200 |
| 下拉弹层 | 300 |
| Toast | 400 |

> Toast 必须高于遮罩：配置窗里也要看得见提示。新增浮层先想清楚它该压着谁——曾经因为气泡被遮罩盖住导致「点了没反应」。

---

## 窗口

| 项目 | 值 |
|------|-----|
| 默认 | 480 × 680 |
| 最小 | 400 × 500 |
| 菜单栏 | 去掉（`Menu.setApplicationMenu(null)`），配置入口在标题栏齿轮 |
| 快捷键 | `F12` / `Ctrl+Shift+I` 控制台，`Ctrl+Q` 退出（菜单没了，accelerator 靠 `before-input-event` 补） |

---

## 变更记录

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-06-22 | v0.2 | 深海蓝 + 米白 + 全局 16px 圆角 + 像素鹰 + Google Fonts |
| 2026-10-01 | v0.3 | 全量替换为 Apple 灰阶 + 系统绿；圆角分四级；文字灰阶过 WCAG AA；去 Google Fonts；补可访问性与层级规范 |
| 2026-10-01 | v0.4 | 加「开关」组件规范（原生 checkbox 换皮，绿=开）；配置弹窗底部吸附条补 `padding-top`，避免上沿压在按钮头顶 |
| 2026-10-01 | v0.5 | 加「路径输入」规范（等宽 + 占位符摊开默认值 + 右对齐小按钮行） |
