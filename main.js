const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');

// ---- 应用菜单 ----
const menuTemplate = [
  {
    label: '设置',
    submenu: [
      {
        label: '配置',
        accelerator: 'CmdOrCtrl+,',
        click: (_item, focusedWindow) => {
          if (focusedWindow) {
            focusedWindow.webContents.send('open-config');
          }
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
        click: () => { app.quit(); }
      }
    ]
  }
];

if (process.platform === 'darwin') {
  menuTemplate.unshift({
    label: app.getName(),
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  });
}

const menu = Menu.buildFromTemplate(menuTemplate);
Menu.setApplicationMenu(menu);

// ---- IPC ----
ipcMain.on('get-userdata-path', (event) => {
  event.returnValue = app.getPath('userData');
});

// ---- 窗口创建 ----
function createWindow() {
  const win = new BrowserWindow({
    width: 480,
    height: 680,
    minWidth: 400,
    minHeight: 500,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

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
