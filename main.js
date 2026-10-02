// Daily Learning — 主进程
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const { registerHandlers } = require('./scripts/handlers.js');
const { attachWindowGuards } = require('./scripts/window-guards.js');

const APP_ICON = path.join(__dirname, 'assets', 'logo.png');
const PRELOAD = path.join(__dirname, 'preload.js');

// 简洁工具风：不显示系统菜单栏，配置入口在窗口内的标题栏
Menu.setApplicationMenu(null);

// 不设这个，Windows 会把任务栏图标归到 Electron 宿主，窗口图标显示不出来
app.setAppUserModelId('com.dailylearning.app');

registerHandlers();

function createWindow() {
  const win = new BrowserWindow({
    width: 480,
    height: 680,
    minWidth: 400,
    minHeight: 500,
    icon: APP_ICON,
    show: false,
    webPreferences: {
      // 渲染进程拿不到 Node：所有网络与文件读写都在主进程做完再喂给它
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  attachWindowGuards(win, {
    rootDir: __dirname,
    // openExternal 是 Promise：找不到默认浏览器会 reject，不接住就是一条未处理拒绝
    openExternal: (url) => {
      shell.openExternal(url).catch((err) => console.error('[links] 交给系统浏览器失败:', err && err.message));
    }
  });

  win.once('ready-to-show', () => win.show());
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
