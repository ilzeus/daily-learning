// Daily Learning — 渲染进程
// 这个窗口没有 Node 权限（nodeIntegration 关、contextIsolation 开），
// 所有网络与文件读写都通过 window.dl 走主进程，见 preload.js。
const MODES = ['learn', 'pro', 'notes'];

// ---- 状态 ----
const results = { learn: '', pro: '', notes: '' };
const errors = { learn: '', pro: '', notes: '' };
let lastTopic = '';
let reqSeq = 0;

// 启动时从主进程取一次：服务商预设、模式文案、已保存的配置（不含密钥）
let boot = null;

function getProvider(id) {
  return boot.providers.find((p) => p.id === id) || boot.providers[0];
}

function isConfigured(config) {
  return !!(config.hasApiKey && config.baseUrl && config.model);
}

// 归档是可选项：没填 Notion 只影响「保存到 Notion」，不该拦着生成
function isNotionReady(config) {
  return !!(config.hasNotionToken && config.notionDatabaseId);
}

// 缺什么就点名什么，比一句「请先配置」更能让人知道下一步做什么
function missingConfigText(config) {
  const missing = [];
  if (!config.hasApiKey) missing.push('API Key');
  if (!config.model) missing.push('模型名称');
  if (!config.baseUrl) missing.push('接口地址');
  return missing.length ? `还差 ${missing.join('、')}，填完才能生成笔记` : '配置还没填完';
}

document.addEventListener('DOMContentLoaded', async () => {
  // ---- DOM 引用 ----
  const textarea = document.querySelector('.input-area');
  const btnGenerate = document.getElementById('btn-generate');
  const btnGenerateLabel = document.getElementById('btn-generate-label');
  const modeSwitch = document.getElementById('mode-switch');
  const loadingContainer = document.getElementById('loading-container');
  const loadingText = document.getElementById('loading-text');
  const resultContainer = document.getElementById('result-container');
  const resultContent = document.getElementById('result-content');
  const errorContainer = document.getElementById('error-container');
  const errorMessage = document.getElementById('error-message');
  const btnSave = document.getElementById('btn-save');
  const btnSaveLabel = document.getElementById('btn-save-label');
  const btnCopy = document.getElementById('btn-copy');
  const btnCopyLabel = document.getElementById('btn-copy-label');
  const btnOpenNotes = document.getElementById('btn-open-notes');
  const btnPickNotesDir = document.getElementById('btn-pick-notes-dir');
  const configNotesDir = document.getElementById('config-notes-dir');
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');
  const btnOpenConfig = document.getElementById('btn-open-config');

  // 配置弹窗 DOM
  const configOverlay = document.getElementById('config-overlay');
  const configModalTitle = document.getElementById('config-modal-title');
  const configProvider = document.getElementById('config-provider');
  const configApiKey = document.getElementById('config-api-key');
  const configModel = document.getElementById('config-model');
  const configModelManual = document.getElementById('config-model-manual');
  const configBaseUrl = document.getElementById('config-base-url');
  const configBaseUrlField = document.getElementById('config-baseurl-field');
  const configNotionToken = document.getElementById('config-notion-token');
  const configNotionDb = document.getElementById('config-notion-db');
  const configAutoSave = document.getElementById('config-auto-save');
  const notesHint = document.getElementById('notes-hint');
  const btnConfigSave = document.getElementById('btn-config-save');
  const btnConfigCancel = document.getElementById('btn-config-cancel');
  const btnRefreshModels = document.getElementById('btn-refresh-models');
  const providerTrigger = document.getElementById('config-provider-btn');
  const modelTrigger = document.getElementById('config-model-btn');

  // ---- 本机笔记自动存盘开关 ----
  // 必须声明在这里：首次启动会在下面 boot 流程里就调 syncNotesHint()，
  // 放到文件后半段的话那个 const 还没初始化，整个 DOMContentLoaded 会炸掉
  const NOTES_HINTS = {
    on: '开着：每生成一版就往上面那个文件夹写一个 Markdown 文件。',
    off: '关着：生成结果只在屏幕上，关掉应用就没了。要留档就打开开关，或者存到 Notion。'
  };

  function syncNotesHint() {
    notesHint.textContent = NOTES_HINTS[configAutoSave.checked ? 'on' : 'off'];
  }

  configAutoSave.addEventListener('change', syncNotesHint);

  // 按 MODES 顺序取标签，键盘换档时才能用同一个下标
  const modeItems = MODES.map((m) => modeSwitch.querySelector(`.segmented__item[data-mode="${m}"]`));

  // 模型下拉里代表"我自己填"的那一项
  const MANUAL_MODEL = '__manual__';

  function appendOption(select, value, text) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = text;
    select.appendChild(opt);
  }

  // ---- 主进程没接上时给出可见的失败，而不是留一个点不动的空界面 ----
  function showFatal(message) {
    loadingContainer.classList.remove('loading--active');
    errorMessage.textContent = message;
    showError();
  }

  if (!window.dl) {
    showFatal('界面桥接没有加载（preload.js 缺失或被拦截），请重新安装应用');
    return;
  }
  try {
    boot = await window.dl.boot();
  } catch (err) {
    showFatal(`启动失败：${err.message}`);
    return;
  }

  // 配置读不出来 / 密钥解不开 / 系统密钥库不可用 —— 如实说，不要伪装成「还没配置」
  if (boot.issues && boot.issues.length) {
    showToast('error', boot.issues.join('；'));
  }

  boot.providers.forEach((p) => appendOption(configProvider, p.id, p.label));

  // ---- 自绘下拉 ----
  // 原生 select 展开的那层菜单是操作系统画的，蓝色高亮跟整套 Apple token 打架，
  // 而且 Electron 35（Chromium 134）还不支持用 CSS 改写弹层。所以这里只留原生
  // select 当数据源（藏起来），触发按钮和弹层都用 DOM 画。
  const pickers = [];

  function createPicker(trigger, select, getOverrideLabel) {
    const popover = document.createElement('div');
    popover.className = 'picker';
    popover.id = `${trigger.id}-list`;
    popover.setAttribute('role', 'listbox');
    popover.hidden = true;
    document.body.appendChild(popover);

    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', popover.id);

    let active = -1;

    function sync() {
      const opt = select.options[select.selectedIndex];
      const text = (getOverrideLabel && getOverrideLabel()) || (opt && opt.textContent) || '';
      trigger.textContent = text;
      trigger.title = text;
    }

    function place() {
      const rect = trigger.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      popover.style.width = `${rect.width}px`;
      popover.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - rect.width - 12))}px`;
      if (popover.offsetHeight + 12 > spaceBelow && rect.top > spaceBelow) {
        popover.style.top = 'auto';
        popover.style.bottom = `${window.innerHeight - rect.top + 6}px`;
      } else {
        popover.style.top = `${rect.bottom + 6}px`;
        popover.style.bottom = 'auto';
      }
    }

    function mark(scroll) {
      Array.from(popover.children).forEach((row, i) => {
        const on = i === active;
        row.classList.toggle('picker__opt--active', on);
        row.setAttribute('aria-selected', on ? 'true' : 'false');
        if (on) {
          trigger.setAttribute('aria-activedescendant', row.id);
          if (scroll) row.scrollIntoView({ block: 'nearest' });
        }
      });
    }

    function open() {
      // 点另一个触发按钮时不会先触发"点外面"，得自己收掉别的弹层
      pickers.forEach((p) => { if (p !== picker) p.close(); });
      popover.innerHTML = '';
      Array.from(select.options).forEach((opt, i) => {
        const row = document.createElement('div');
        row.className = 'picker__opt';
        row.id = `${popover.id}-o${i}`;
        row.dataset.index = i;
        row.setAttribute('role', 'option');
        row.textContent = opt.textContent;
        if (i === select.selectedIndex) row.classList.add('picker__opt--selected');
        popover.appendChild(row);
      });
      popover.hidden = false;
      place();
      sync();
      active = select.selectedIndex;
      mark(true);
      trigger.setAttribute('aria-expanded', 'true');
    }

    function close() {
      if (popover.hidden) return;
      popover.hidden = true;
      trigger.removeAttribute('aria-activedescendant');
      trigger.setAttribute('aria-expanded', 'false');
    }

    function choose(i) {
      const opt = select.options[i];
      if (!opt) return;
      if (select.value !== opt.value) {
        select.value = opt.value;
        select.dispatchEvent(new Event('change'));
      }
      close();
    }

    trigger.addEventListener('click', () => {
      if (popover.hidden) open();
      else close();
    });

    trigger.addEventListener('keydown', (e) => {
      const total = select.options.length;
      if (e.key === 'Escape') {
        // 配置窗本身也监听 Esc 关闭，弹层开着时先把它吃掉，别一层一起关掉
        if (!popover.hidden) {
          e.stopPropagation();
          close();
        }
      } else if (e.key === 'Tab') {
        close();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (popover.hidden) {
          open();
          return;
        }
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + total) % total;
        mark(true);
      } else if (e.key === 'Home' || e.key === 'End') {
        if (popover.hidden) return;
        e.preventDefault();
        active = e.key === 'Home' ? 0 : total - 1;
        mark(true);
      } else if (e.key === 'Enter' && !popover.hidden) {
        e.preventDefault(); // 不拦的话浏览器还会补一次 click，把弹层又打开
        choose(active);
      }
    });

    // 按住别让焦点从触发按钮上跑掉
    popover.addEventListener('mousedown', (e) => e.preventDefault());
    popover.addEventListener('click', (e) => {
      const row = e.target.closest('.picker__opt');
      if (row) choose(Number(row.dataset.index));
    });

    select.addEventListener('change', sync);

    const picker = { sync, close };
    pickers.push(picker);
    return picker;
  }

  const providerPicker = createPicker(providerTrigger, configProvider);
  // 手填的模型名直接显示在按钮上，否则只写「手动填写…」看不出最后存的是哪个。
  // 但只有真的选中「手动填写…」时才算数：切回列表里的模型后，手填框只是被藏起来、
  // 值还留着，无条件读它会让按钮一直显示上一个手填的名字。
  const modelPicker = createPicker(modelTrigger, configModel, () =>
    configModel.value === MANUAL_MODEL ? configModelManual.value.trim() : ''
  );

  document.addEventListener('mousedown', (e) => {
    if (e.target.closest('.picker') || e.target.closest('.picker-trigger')) return;
    pickers.forEach((p) => p.close());
  });
  // 弹窗自身滚动时收起（scroll 不冒泡，只能捕获）
  window.addEventListener('scroll', () => pickers.forEach((p) => p.close()), true);

  function syncManualModelInput() {
    configModelManual.classList.toggle('config-modal__field--hidden', configModel.value !== MANUAL_MODEL);
  }

  // 列表里没有的模型（手填过的、服务商新出的）统一落到「手动填写」上
  function fillModelOptions(models, preferred) {
    configModel.innerHTML = '';
    models.forEach((id) => appendOption(configModel, id, id));
    appendOption(configModel, MANUAL_MODEL, '手动填写…');

    if (preferred && models.indexOf(preferred) > -1) {
      configModel.value = preferred;
      configModelManual.value = '';
    } else {
      configModel.value = MANUAL_MODEL;
      configModelManual.value = preferred || '';
    }
    // 走一次 change，让手填框显隐和下拉按钮文案跟着更新
    configModel.dispatchEvent(new Event('change'));
  }

  function currentModel() {
    return configModel.value === MANUAL_MODEL ? configModelManual.value.trim() : configModel.value;
  }

  configModel.addEventListener('change', syncManualModelInput);
  configModelManual.addEventListener('input', modelPicker.sync);

  // 接口地址只有自定义时才需要手填，预设服务商由代码补全
  function syncProviderFields(providerId) {
    const preset = getProvider(providerId);
    configApiKey.placeholder = boot.config.hasApiKey ? '已保存，留空表示不修改' : preset.keyPlaceholder;
    configNotionToken.placeholder = boot.config.hasNotionToken ? '已保存，留空表示不修改' : 'secret_...';
    configBaseUrlField.classList.toggle('config-modal__field--hidden', providerId !== 'custom');
  }

  configProvider.addEventListener('change', () => {
    const preset = getProvider(configProvider.value);
    configBaseUrl.value = preset.baseUrl;
    fillModelOptions(preset.models, preset.model);
    syncProviderFields(configProvider.value);
  });

  // ---- 首次启动检测 ----
  if (!isConfigured(boot.config)) {
    showConfigModal(true);
  }
  syncSaveButton();

  let currentMode = 'learn';
  let running = null; // { seq, ids, aborted } — 有值说明正在生成，此时主按钮是「中止」
  let saveWarnings = []; // 本轮里「生成成功但没存到本机」的原因，只在结束时汇总提示一次

  // 失败的版本在标签上留个红点：不展开错误区也能看出哪一档没出来
  function syncTabs() {
    modeItems.forEach((el) => {
      const mode = el.dataset.mode;
      const failed = !!errors[mode];
      el.classList.toggle('segmented__item--failed', failed);
      el.title = failed ? `${boot.modeLabels[mode]}生成失败：${errors[mode]}` : '';
    });
  }

  // ---- 展示某一版：纯视图切换，不发请求 ----
  function showVersion(mode) {
    const markdown = results[mode];

    if (markdown) {
      hideError();
      resultContainer.dataset.mode = mode;
      resultContent.innerHTML = window.dl.renderMarkdown(markdown);
      showResult();
      return;
    }

    hideResult();
    if (errors[mode]) {
      errorMessage.textContent = `${boot.modeLabels[mode]}生成失败：${errors[mode]}`;
      showError();
    } else {
      hideError();
    }
  }

  // 笔记里的链接一律交给系统浏览器，窗口本身永不离开本地页面
  resultContent.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;
    e.preventDefault();
    window.dl.openExternal(link.getAttribute('href'));
  });

  // ---- 生成笔记 (F2)：一次并发生成三个版本 ----
  async function runGenerate() {
    if (running) {
      stopGenerate();
      return;
    }

    const topic = textarea.value.trim();
    if (!topic) {
      showToast('error', '先输入想学习的内容');
      textarea.focus();
      return;
    }
    if (!isConfigured(boot.config)) {
      showConfigModal(false);
      showToast('error', missingConfigText(boot.config));
      return;
    }

    const seq = ++reqSeq;
    // requestId 带一次随机后缀：窗口重载后序号会从 1 重新开始，
    // 不带的话上一轮还没结束的请求会被这一轮的「中止」误伤
    const salt = Math.random().toString(36).slice(2, 7);
    const run = { seq, aborted: false, ids: MODES.map((m) => `${seq}:${m}:${salt}`) };
    running = run;
    // 现在就记下来：中途中止时，已经回来的那一版也要能用正确的标题存进 Notion
    lastTopic = topic;

    setGenerating(true);
    loadingText.textContent = '正在生成三个版本，点「中止生成」可以停下';
    hideResult();
    hideError();
    MODES.forEach((m) => {
      results[m] = '';
      errors[m] = '';
    });
    saveWarnings = [];
    syncTabs();

    await Promise.all(MODES.map((m, i) => window.dl.generate(topic, m, run.ids[i]).then(
      (res) => {
        if (seq !== reqSeq) return;
        results[m] = res.markdown;
        errors[m] = '';
        if (res.saveError) saveWarnings.push(res.saveError);
      },
      (err) => {
        if (seq !== reqSeq) return;
        results[m] = '';
        errors[m] = err.message || '未知错误';
      }
    )));

    // 中途点了中止，或被新一轮生成取代，这批结果都不再属于当前状态
    if (seq !== reqSeq) return;

    running = null;
    setGenerating(false);
    syncTabs();
    showVersion(currentMode);
    reportRunOutcome();
  }

  // 三版里只有一部分失败时，错误区只看得见当前这一档，其余的靠 toast + 标签红点补上
  function reportRunOutcome() {
    const failed = MODES.filter((m) => errors[m]);
    const msgs = [];
    if (failed.length && failed.length < MODES.length) {
      msgs.push(`${failed.map((m) => boot.modeLabels[m]).join('、')}没生成出来：${errors[failed[0]]}`);
    }
    if (saveWarnings.length) {
      msgs.push(`笔记没能存到本机：${saveWarnings[0]}`);
    }
    if (msgs.length) showToast('error', msgs.join('；'));
  }

  function setGenerating(on) {
    btnGenerateLabel.textContent = on ? '中止生成' : '生成笔记';
    loadingContainer.classList.toggle('loading--active', on);
  }

  // 中止只停掉还在飞的请求，已经回来的版本保留着可以直接看
  function stopGenerate() {
    if (!running || running.aborted) return;
    running.aborted = true;
    reqSeq++;
    const ids = running.ids;
    running = null;

    window.dl.abortGenerate(ids).catch(() => {});
    setGenerating(false);
    syncTabs();
    showVersion(currentMode);
    showToast('info', '已中止生成');
  }

  btnGenerate.addEventListener('click', runGenerate);

  // ---- 版本切换 ----
  function activateMode(mode) {
    if (MODES.indexOf(mode) < 0 || mode === currentMode) return;
    currentMode = mode;
    modeItems.forEach((el) => {
      const active = el.dataset.mode === mode;
      el.classList.toggle('segmented__item--active', active);
      el.setAttribute('aria-checked', active ? 'true' : 'false');
      // radiogroup 里只有当前档能被 Tab 键停到，否则 Tab 要按三次才走过一个控件
      el.tabIndex = active ? 0 : -1;
    });
    showVersion(mode);
  }

  modeSwitch.addEventListener('click', (e) => {
    const item = e.target.closest('.segmented__item');
    if (item) activateMode(item.dataset.mode);
  });

  // 键盘按 radiogroup 的约定走：左右换档，Home/End 到首尾
  modeSwitch.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    let target = -1;
    if (step) {
      target = (MODES.indexOf(currentMode) + step + MODES.length) % MODES.length;
    } else if (e.key === 'Home' || e.key === 'End') {
      target = e.key === 'Home' ? 0 : MODES.length - 1;
    }
    if (target < 0) return;
    e.preventDefault();
    activateMode(modeItems[target].dataset.mode);
    modeItems[target].focus();
  });

  // ---- 保存到 Notion (F3) ----
  function syncSaveButton() {
    if (isNotionReady(boot.config)) {
      btnSaveLabel.textContent = '保存到 Notion';
      btnSave.title = '';
      return;
    }
    // 没配 Notion 时按钮照样能点：点了说清缺什么，而不是抛一句 API 错误
    btnSave.title = '需要先在配置里填 Notion Integration Token 和数据库 ID';
  }

  btnSave.addEventListener('click', async () => {
    const markdown = results[currentMode];
    if (!markdown || !lastTopic) return;

    if (!isNotionReady(boot.config)) {
      showConfigModal(false);
      showToast('error', '存 Notion 要先填 Integration Token 和数据库 ID');
      return;
    }

    btnSave.disabled = true;
    btnSaveLabel.textContent = '正在保存...';

    try {
      await window.dl.saveToNotion(`${lastTopic} · ${boot.modeLabels[currentMode]}`, markdown);
      showToast('success', '已保存到 Notion');
    } catch (err) {
      showToast('error', err.message || '保存失败，请检查 Notion 配置');
    } finally {
      btnSave.disabled = false;
      syncSaveButton();
    }
  });

  // ---- 复制到剪贴板 ----
  // 走主进程的 clipboard 而不是 navigator.clipboard：后者在 Electron 里要权限，
  // 而且窗口没有焦点时会静默失败，界面上却写着「已复制」。
  btnCopy.addEventListener('click', async () => {
    const markdown = results[currentMode];
    if (!markdown) {
      showToast('error', '这一版还没生成出来，没有内容可复制');
      return;
    }
    try {
      await window.dl.copyText(markdown);
      showToast('success', `已复制${boot.modeLabels[currentMode]}的 Markdown`);
    } catch (err) {
      showToast('error', err.message || '复制失败');
    }
  });

  // ---- 打开本机笔记文件夹 ----
  btnOpenNotes.addEventListener('click', async () => {
    try {
      await window.dl.openNotesFolder();
    } catch (err) {
      showToast('error', err.message || '打开文件夹失败');
    }
  });

  // ---- 换保存位置 ----
  // 系统文件夹选择框只能主进程弹；取消时不动他已经填好的值
  btnPickNotesDir.addEventListener('click', async () => {
    try {
      const dir = await window.dl.pickNotesDir();
      if (dir) configNotesDir.value = dir;
    } catch (err) {
      showToast('error', err.message || '没能弹出选择窗口');
    }
  });

  // ---- 配置弹窗 (F4) ----
  function showConfigModal(isFirstRun) {
    const config = boot.config;
    configProvider.value = config.provider;
    configApiKey.value = '';
    configNotionToken.value = '';
    configBaseUrl.value = config.baseUrl;
    configNotionDb.value = config.notionDatabaseId;
    configAutoSave.checked = config.autoSaveNotes === true;
    syncNotesHint();
    configNotesDir.value = config.notesDir || '';
    configNotesDir.placeholder = `留空 = ${boot.defaultNotesDir || '应用数据目录下的 notes'}`;
    fillModelOptions(getProvider(config.provider).models, config.model);
    syncProviderFields(config.provider);
    providerPicker.sync();
    configModalTitle.textContent = isFirstRun ? '首次配置' : '配置';
    configOverlay.classList.add('config-overlay--active');
  }

  function hideConfigModal() {
    pickers.forEach((p) => p.close());
    configOverlay.classList.remove('config-overlay--active');
  }

  // 拉取最新：用界面上当前的 Key 和地址，没重填就复用已保存的 Key
  btnRefreshModels.addEventListener('click', async () => {
    const provider = configProvider.value;
    const baseUrl = provider === 'custom' ? configBaseUrl.value.trim() : getProvider(provider).baseUrl;
    const keep = currentModel();

    btnRefreshModels.disabled = true;
    btnRefreshModels.textContent = '拉取中...';

    try {
      const models = await window.dl.listModels(configApiKey.value.trim(), baseUrl);
      // 拉回来的列表里没有当前这个（尤其是手填的）时，fillModelOptions 会把它退回手填框，
      // 不能传 null，否则用户刚打的字会被清掉
      fillModelOptions(models, keep);
      showToast('success', `拿到 ${models.length} 个模型`);
    } catch (err) {
      showToast('error', err.message || '拉取模型列表失败');
    } finally {
      btnRefreshModels.disabled = false;
      btnRefreshModels.textContent = '拉取最新';
    }
  });

  // 保存
  btnConfigSave.addEventListener('click', async () => {
    const provider = configProvider.value;
    const baseUrl = (provider === 'custom' ? configBaseUrl.value : getProvider(provider).baseUrl).trim();
    const model = currentModel();

    if (!baseUrl) {
      showToast('error', '自定义服务商要填接口地址');
      return;
    }
    if (!model) {
      showToast('error', '请选择或填写模型名称');
      return;
    }

    const patch = {
      provider,
      baseUrl,
      model,
      notionDatabaseId: configNotionDb.value.trim(),
      autoSaveNotes: configAutoSave.checked,
      notesDir: configNotesDir.value.trim()
    };
    const apiKey = configApiKey.value.trim();
    const notionToken = configNotionToken.value.trim();
    if (apiKey) patch.apiKey = apiKey;
    if (notionToken) patch.notionToken = notionToken;

    try {
      boot.config = await window.dl.saveConfig(patch);
      hideConfigModal();
      syncSaveButton();
      showToast('success', '配置已保存');
    } catch (err) {
      showToast('error', err.message || '配置没能保存');
    }
  });

  // 取消 / 点遮罩 / Esc 都走这里：还没配好时不让关掉窗口，
  // 否则界面会停在「点什么都不对」的状态，人不知道原因
  function tryCloseConfigModal() {
    if (!configOverlay.classList.contains('config-overlay--active')) return;
    if (isConfigured(boot.config)) {
      hideConfigModal();
      return;
    }
    showToast('error', missingConfigText(boot.config));
  }

  btnConfigCancel.addEventListener('click', tryCloseConfigModal);

  configOverlay.addEventListener('click', (e) => {
    if (e.target === configOverlay) tryCloseConfigModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') tryCloseConfigModal();
  });

  // ---- 标题栏配置入口 ----
  btnOpenConfig.addEventListener('click', () => {
    showConfigModal(false);
  });

  // ---- Toast 提示 ----
  let toastTimer = null;

  function showToast(type, message) {
    if (toastTimer) clearTimeout(toastTimer);

    toast.className = 'toast';
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
    btnCopy.disabled = false;
  }

  function hideResult() {
    resultContainer.classList.remove('result--active');
    btnSave.disabled = true;
    btnCopy.disabled = true;
  }

  // ---- 错误区显隐 ----
  function showError() {
    errorContainer.classList.add('error--active');
  }

  function hideError() {
    errorContainer.classList.remove('error--active');
  }
});
