// Daily Learning — 主进程 IPC 处理
// main.js 和离线测试 harness 共用这一份注册，避免测试少注册一个通道导致假失败。
const { ipcMain, clipboard, shell, dialog, BrowserWindow } = require('electron');
const { getConfig, setConfig, hasConfig, getPublicConfig, migrateStore, getConfigIssues } = require('./config.js');
const { generateNotes, listModels, MODE_LABELS } = require('./api.js');
const { saveToNotion, resetDatabaseCache } = require('./notion.js');
const {
  defaultNotesDir, resolveNotesDir, ensureNotesDir, saveNote
} = require('./notes-store.js');
const { PROVIDERS } = require('./providers.js');

// 一次「生成」= 三个并发请求，各自的 AbortController 按界面给的 requestId 存着
const inflight = new Map();

// 桥接层只传纯数据：把异常包成 { ok, error }，不让 Error 对象跨进程
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, payload) => {
    try {
      return { ok: true, data: await fn(payload) };
    } catch (err) {
      return { ok: false, error: (err && err.message) || '未知错误' };
    }
  });
}

// 落盘失败的具体原因只进控制台：errno 原文带的是他的用户目录，
// 直接顶在界面上既看不懂又等于把机器信息贴出来
function saveFailureReason(err) {
  const code = (err && err.code) || '';
  if (code === 'ENOSPC') return '磁盘空间不够';
  if (code === 'EACCES' || code === 'EPERM') return '应用数据目录没有写入权限';
  if (code === 'ENOENT' || code === 'ENOTDIR') return '那个文件夹被删了，或者被一个同名文件占了';
  return '这台机器暂时写不了文件';
}

function registerHandlers() {
  // 启动即把老配置（明文密钥、deepseekApiKey）升级成当前格式。
  // 放在这里是因为正式启动和离线探针都只调这一个函数，避免两边行为分叉。
  migrateStore();

  // 注意求值顺序：getPublicConfig 会触发解密，异常要让它写进 _readIssue
  handle('boot:get', () => {
    const config = getConfig();
    return {
      providers: PROVIDERS,
      modeLabels: MODE_LABELS,
      config: getPublicConfig(),
      hasConfig: hasConfig(),
      // 界面里的「打开文件夹」和路径提示都用这个生效值，不自己拼路径
      notesDir: resolveNotesDir(config.notesDir),
      defaultNotesDir: defaultNotesDir(),
      issues: getConfigIssues()
    };
  });

  // 密钥字段留空表示「不改动已保存的值」，所以这里不能把空串当新值写进去
  handle('config:set', (patch) => {
    setConfig(patch || {});
    // 换库或改库结构之后，缓存的属性名就是旧数据了
    resetDatabaseCache();
    return getPublicConfig();
  });

  handle('notes:generate', async ({ topic, mode, requestId }) => {
    const ctrl = new AbortController();
    inflight.set(requestId, ctrl);
    try {
      // 必须 await：直接 return promise 会让 finally 在请求还在跑的时候就执行，
      // abort 通道于是找不到这个请求
      const markdown = await generateNotes(topic, mode, ctrl.signal);
      const config = getConfig();
      if (!config.autoSaveNotes) return { markdown };
      try {
        saveNote({
          dir: resolveNotesDir(config.notesDir),
          topic,
          modeLabel: MODE_LABELS[mode] || mode,
          markdown
        });
        return { markdown };
      } catch (err) {
        // 存盘失败不该把已经生成好的笔记一起丢掉，界面会另外提示一句
        console.error('[notes] 自动存盘失败:', err && err.message);
        return { markdown, saveError: saveFailureReason(err) };
      }
    } finally {
      inflight.delete(requestId);
    }
  });

  // 界面上点一次「生成」是三个并发请求，所以中止要能一次点名三个 id
  handle('notes:abort', ({ requestIds }) => {
    (requestIds || []).forEach((id) => {
      const ctrl = inflight.get(id);
      if (!ctrl) return;
      inflight.delete(id);
      ctrl.abort();
    });
    return true;
  });

  handle('models:list', ({ apiKey, baseUrl }) =>
    listModels({ apiKey: apiKey || getConfig().apiKey, baseUrl }));

  handle('notion:save', ({ title, markdown }) => saveToNotion(title, markdown));

  // 复制走主进程：渲染进程没有 Node，浏览器那套 clipboard API 还要问权限
  handle('clipboard:write', (text) => {
    clipboard.writeText(String(text || ''));
    return true;
  });

  handle('notes:open-folder', async () => {
    let dir;
    try {
      dir = ensureNotesDir(resolveNotesDir(getConfig().notesDir));
    } catch (err) {
      console.error('[notes] 笔记文件夹创建失败:', err && err.message);
      throw new Error(`笔记文件夹用不了：${saveFailureReason(err)}`);
    }
    // openPath 是异步的：成功 resolve 成空串，失败 resolve 成一句英文原因（带路径）。
    // 不 await 拿到的是个 pending Promise，恒为真 → 资源管理器其实开了，界面却报「打不开」。
    const problem = await shell.openPath(dir);
    if (problem) {
      console.error('[notes] 打开文件夹失败:', problem);
      throw new Error('系统没能打开这个文件夹，可以照着配置窗里的路径自己找过去');
    }
    return true;
  });

  // 挑文件夹只能在主进程做：渲染进程没有 Node，也不该碰系统对话框
  handle('notes:pick-dir', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const options = {
      title: '选一个放笔记的文件夹',
      buttonLabel: '放这里',
      properties: ['openDirectory', 'createDirectory']
    };
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return picked.canceled ? '' : (picked.filePaths[0] || '');
  });
}

module.exports = { registerHandlers };
