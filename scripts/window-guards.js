// Daily Learning — 窗口侧守卫（导航拦截 + 快捷键）
// 从 main.js 抽出来单独成模块：正式启动和离线探针注册的是同一份代码，
// 否则探针各写各的 handler，main.js 改坏了也不会报错。
const { app } = require('electron');

// 只有本应用目录下的 file:// 算「自己的页面」
function isLocalPage(url, rootDir) {
  const root = String(rootDir).replace(/\\/g, '/').replace(/^\//, '');
  return url.startsWith('file:') && url.replace(/^file:\/\/+/, '').startsWith(root);
}

// 白名单协议之外的一律不当外部链接打开
function isSafeExternal(url) {
  return /^https?:\/\//i.test(url) || /^mailto:/i.test(url);
}

/**
 * @param {BrowserWindow} win
 * @param {{ rootDir: string, openExternal: (url: string) => void }} opts
 *        openExternal 由调用方注入：正式跑起来是系统浏览器，探针里换成记录器
 */
function attachWindowGuards(win, opts) {
  const { rootDir, openExternal } = opts;
  const wc = win.webContents;

  // 笔记里的链接、模型输出里的任何 window.open：只能开系统浏览器，永不开新窗口
  wc.setWindowOpenHandler(({ url }) => {
    if (isSafeExternal(url)) openExternal(url);
    return { action: 'deny' };
  });

  wc.on('will-navigate', (event, url) => {
    if (isLocalPage(url, rootDir)) return;
    event.preventDefault();
    if (isSafeExternal(url)) openExternal(url);
  });

  wc.on('did-attach-webview', (event) => event.preventDefault());

  // 菜单栏是关掉的，系统注册的加速键也就没了：DevTools 出不来、Ctrl+Q 退不掉。
  // 按窗口补上，出问题时至少有办法看日志。
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = String(input.key || '').toLowerCase();
    if (key === 'f12' || (input.control && input.shift && key === 'i')) {
      wc.toggleDevTools();
      event.preventDefault();
    } else if (input.control && key === 'q') {
      app.quit();
      event.preventDefault();
    }
  });
}

module.exports = { attachWindowGuards, isLocalPage, isSafeExternal };
