// Daily Learning — 预加载桥接
// 渲染进程只能通过这一个对象和主进程说话；新增能力必须在这里显式开口子。
const { contextBridge, ipcRenderer, shell } = require('electron');
const { renderMarkdown } = require('./scripts/markdown.js');

async function call(channel, payload) {
  const res = await ipcRenderer.invoke(channel, payload);
  if (res && res.ok) return res.data;
  throw new Error((res && res.error) || '主进程没有返回结果');
}

contextBridge.exposeInMainWorld('dl', {
  boot: () => call('boot:get'),
  saveConfig: (patch) => call('config:set', patch),
  generate: (topic, mode, requestId) => call('notes:generate', { topic, mode, requestId }),
  abortGenerate: (requestIds) => call('notes:abort', { requestIds }),
  listModels: (apiKey, baseUrl) => call('models:list', { apiKey, baseUrl }),
  saveToNotion: (title, markdown) => call('notion:save', { title, markdown }),
  copyText: (text) => call('clipboard:write', text),
  openNotesFolder: () => call('notes:open-folder'),
  pickNotesDir: () => call('notes:pick-dir'),
  renderMarkdown: (markdown) => renderMarkdown(markdown),
  openExternal: (url) => {
    if (/^(https?:|mailto:)/i.test(String(url || ''))) {
      shell.openExternal(url).catch((err) => console.error('[links] 打不开这个链接:', err && err.message));
    }
  }
});
