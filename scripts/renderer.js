// Daily Learning — 渲染进程
// 注意：renderer.js 通过 <script src> 加载，require 相对路径从 index.html（项目根目录）解析
const { ipcRenderer } = require('electron');
const { generateNotes } = require('./scripts/api.js');
const { saveToNotion } = require('./scripts/notion.js');
const { getConfig, setConfig, hasConfig } = require('./scripts/config.js');
const marked = require('marked');

// ---- 状态 ----
let lastTopic = '';
let lastMarkdown = '';

document.addEventListener('DOMContentLoaded', () => {
  // ---- DOM 引用 ----
  const textarea = document.querySelector('.input-area');
  const btnGenerate = document.getElementById('btn-generate');
  const loadingContainer = document.getElementById('loading-container');
  const resultContainer = document.getElementById('result-container');
  const resultContent = document.getElementById('result-content');
  const errorContainer = document.getElementById('error-container');
  const errorMessage = document.getElementById('error-message');
  const btnSave = document.getElementById('btn-save');
  const toast = document.getElementById('toast');
  const toastIcon = document.getElementById('toast-icon');
  const toastMessage = document.getElementById('toast-message');

  // 配置弹窗 DOM
  const configOverlay = document.getElementById('config-overlay');
  const configModalTitle = document.getElementById('config-modal-title');
  const configDeepseekKey = document.getElementById('config-deepseek-key');
  const configNotionToken = document.getElementById('config-notion-token');
  const configNotionDb = document.getElementById('config-notion-db');
  const btnConfigSave = document.getElementById('btn-config-save');
  const btnConfigCancel = document.getElementById('btn-config-cancel');

  // ---- 首次启动检测 ----
  if (!hasConfig()) {
    showConfigModal(true);
  }

  // ---- 生成笔记 (F2) ----
  btnGenerate.addEventListener('click', async () => {
    const topic = textarea.value.trim();
    if (!topic) return;

    btnGenerate.disabled = true;
    loadingContainer.classList.add('loading--active');
    hideResult();
    hideError();

    try {
      const markdown = await generateNotes(topic);
      lastTopic = topic;
      lastMarkdown = markdown;
      resultContent.innerHTML = marked.parse(markdown);
      showResult();
    } catch (err) {
      errorMessage.textContent = err.message || '生成失败，请检查网络或API配置后重试';
      showError();
    } finally {
      loadingContainer.classList.remove('loading--active');
      btnGenerate.disabled = false;
    }
  });

  // ---- 保存到 Notion (F3) ----
  btnSave.addEventListener('click', async () => {
    if (!lastMarkdown || !lastTopic) return;

    btnSave.disabled = true;
    btnSave.textContent = '正在保存...';

    try {
      await saveToNotion(lastTopic, lastMarkdown);
      showToast('success', '✅', '保存成功！');
    } catch (err) {
      showToast('error', '❌', err.message || '保存失败，请检查 Notion 配置');
    } finally {
      btnSave.disabled = false;
      btnSave.textContent = '保存到 Notion';
    }
  });

  // ---- 配置弹窗 (F4) ----
  function showConfigModal(isFirstRun) {
    const config = getConfig();
    configDeepseekKey.value = config.deepseekApiKey || '';
    configNotionToken.value = config.notionToken || '';
    configNotionDb.value = config.notionDatabaseId || '';
    configModalTitle.textContent = isFirstRun ? '首次配置' : '配置';
    configOverlay.classList.add('config-overlay--active');
  }

  function hideConfigModal() {
    configOverlay.classList.remove('config-overlay--active');
  }

  // 保存
  btnConfigSave.addEventListener('click', () => {
    setConfig({
      deepseekApiKey: configDeepseekKey.value.trim(),
      notionToken: configNotionToken.value.trim(),
      notionDatabaseId: configNotionDb.value.trim()
    });
    hideConfigModal();
    showToast('success', '✅', '配置已保存');
  });

  // 取消
  btnConfigCancel.addEventListener('click', () => {
    hideConfigModal();
  });

  // 点击遮罩层关闭（仅已配置时）
  configOverlay.addEventListener('click', (e) => {
    if (e.target === configOverlay && hasConfig()) {
      hideConfigModal();
    }
  });

  // 键盘 Escape 关闭（仅已配置时）
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && configOverlay.classList.contains('config-overlay--active') && hasConfig()) {
      hideConfigModal();
    }
  });

  // ---- IPC：菜单栏 → 打开配置 ----
  ipcRenderer.on('open-config', () => {
    showConfigModal(false);
  });

  // ---- Toast 提示 ----
  let toastTimer = null;

  function showToast(type, icon, message) {
    if (toastTimer) clearTimeout(toastTimer);

    toast.className = 'toast';
    toastIcon.textContent = icon;
    toastMessage.textContent = message;
    toast.classList.add('toast--' + type, 'toast--active');

    toastTimer = setTimeout(() => {
      toast.classList.remove('toast--active');
      toastTimer = null;
    }, 3000);
  }

  // ---- 结果区显隐 ----
  function showResult() {
    resultContainer.classList.add('result--active');
    btnSave.disabled = false;
  }

  function hideResult() {
    resultContainer.classList.remove('result--active');
    btnSave.disabled = true;
  }

  // ---- 错误区显隐 ----
  function showError() {
    errorContainer.classList.add('error--active');
  }

  function hideError() {
    errorContainer.classList.remove('error--active');
  }
});
