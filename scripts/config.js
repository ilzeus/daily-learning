// Daily Learning — 配置管理（主进程，本地 JSON 文件存储）
// 密钥用 Electron safeStorage（Windows 上是 DPAPI）加密后再落盘：
// 只有同一台机器上的同一个 Windows 账户能解回来，直接拷走配置文件拿不到明文。
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');
const { DEFAULT_PROVIDER, getProvider, isKnownProvider } = require('./providers.js');
const { normalizeNotesDir } = require('./notes-store.js');

const SECRET_FIELDS = ['apiKey', 'notionToken'];
const ENC_PREFIX = 'enc:v1:';

// 上一次读盘/解密出了什么问题，界面要能如实告诉用户，不能假装是「还没配置」
let _readIssue = null;

function getConfigPath() {
  return path.join(app.getPath('userData'), 'daily-learning-config.json');
}

function encryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch (_) {
    return false;
  }
}

function encrypt(plain) {
  if (!plain) return plain;
  if (String(plain).startsWith(ENC_PREFIX)) return plain;
  if (!encryptionAvailable()) return String(plain);
  return ENC_PREFIX + safeStorage.encryptString(String(plain)).toString('base64');
}

function decrypt(stored) {
  if (!stored) return '';
  const raw = String(stored);
  if (!raw.startsWith(ENC_PREFIX)) return raw; // 迁移前的明文，照旧能用
  try {
    return safeStorage.decryptString(Buffer.from(raw.slice(ENC_PREFIX.length), 'base64'));
  } catch (_) {
    // 换机器、换 Windows 账户，或系统密钥库里的钥匙被清了
    _readIssue = 'saved-secret-unreadable';
    return '';
  }
}

/**
 * 读取配置文件（原始字段，密钥仍是存储形态）
 * @returns {object}
 */
function readStore() {
  try {
    const filePath = getConfigPath();
    if (!fs.existsSync(filePath)) {
      _readIssue = null;
      return {};
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      _readIssue = 'corrupt';
      return {};
    }
    _readIssue = null; // 读盘成功就清掉上一次的异常；解密异常在这之后才会写
    return parsed;
  } catch (_) {
    // 文件读不出来或 JSON 坏了：不静默当成空配置，留给 getConfigIssues() 报告
    _readIssue = 'corrupt';
  }
  return {};
}

/**
 * 原子写入：先写临时文件再改名覆盖，避免断电或进程被杀时留下半份配置
 * @param {object} data
 */
function writeStore(data) {
  const filePath = getConfigPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

/**
 * 把磁盘上还是明文的密钥就地升级成密文，并把老版本的 deepseekApiKey 合并进 apiKey。
 * 只在主进程就绪后调用一次，用户不需要重填任何东西。
 * @returns {boolean} 是否改写过文件
 */
function migrateStore() {
  const data = readStore();
  if (!Object.keys(data).length) return false;

  let changed = false;
  if (!data.apiKey && data.deepseekApiKey) {
    data.apiKey = data.deepseekApiKey;
    changed = true;
  }
  if (data.deepseekApiKey) {
    delete data.deepseekApiKey;
    changed = true;
  }
  SECRET_FIELDS.forEach((field) => {
    const value = data[field];
    if (value && !String(value).startsWith(ENC_PREFIX)) {
      data[field] = encrypt(value);
      changed = true;
    }
  });

  if (changed) {
    _readIssue = null;
    writeStore(data);
  }
  return changed;
}

/**
 * 读取完整配置（含解开的密钥），只能在主进程内部使用，绝不回传给渲染进程
 * @returns {{ provider: string, apiKey: string, baseUrl: string, model: string,
 *            notionToken: string, notionDatabaseId: string, notesDir: string,
 *            autoSaveNotes: boolean }}
 */
function getConfig() {
  const data = readStore();

  // 老版本只有 deepseekApiKey，没存服务商和模型，按 DeepSeek 默认值补齐
  const provider = isKnownProvider(data.provider) ? data.provider : DEFAULT_PROVIDER;
  const preset = getProvider(provider);

  // 手改过的脏路径不该把生成都带崩：当没填，回默认目录
  let notesDir = '';
  try {
    notesDir = normalizeNotesDir(data.notesDir);
  } catch (_) {
    notesDir = '';
  }

  return {
    provider,
    apiKey: decrypt(data.apiKey || data.deepseekApiKey || ''),
    baseUrl: data.baseUrl || preset.baseUrl,
    model: data.model || preset.model,
    notionToken: decrypt(data.notionToken || ''),
    notionDatabaseId: data.notionDatabaseId || '',
    notesDir,
    // 写盘是副作用，默认关掉：想要的人在配置窗里打开开关
    autoSaveNotes: data.autoSaveNotes === true
  };
}

/**
 * 可以安全回传给界面的配置：只有「存没存过」，没有密钥本身
 * @returns {object}
 */
function getPublicConfig() {
  const config = getConfig();
  return {
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    notionDatabaseId: config.notionDatabaseId,
    notesDir: config.notesDir,
    autoSaveNotes: config.autoSaveNotes,
    hasApiKey: !!config.apiKey,
    hasNotionToken: !!config.notionToken
  };
}

/**
 * 更新配置（部分更新）
 * 界面上拿不到已存的密钥，所以空值一律理解为「保持原值不变」
 * @param {object} config
 */
function setConfig(config) {
  const data = readStore();

  Object.keys(config || {}).forEach((key) => {
    const value = config[key];
    if (value === undefined || value === null) return;

    if (SECRET_FIELDS.includes(key)) {
      const trimmed = String(value).trim();
      if (!trimmed) return; // 留空 = 不改，因为界面里看不到旧值
      data[key] = encrypt(trimmed);
      return;
    }
    if (key === 'notesDir') {
      // 填了相对路径就当场报错，别等生成完才发现文件不知道去哪了
      data[key] = normalizeNotesDir(value);
      return;
    }
    data[key] = value;
  });

  delete data.deepseekApiKey; // 老字段不再写回，避免同一份 key 存两处
  _readIssue = null;
  writeStore(data);
}

/**
 * 配置读取异常，供启动时如实提示
 * @returns {string[]} 可直接展示的中文句子，没问题时为空数组
 */
function getConfigIssues() {
  const issues = [];
  if (_readIssue === 'corrupt') {
    issues.push('本地配置文件读不出来，已按未配置处理，请重新填写一次');
  } else if (_readIssue === 'saved-secret-unreadable') {
    issues.push('密钥解不开（可能换过机器或 Windows 账户），请重新填写 API Key；用 Notion 的话也要重填 Token');
  }
  if (!encryptionAvailable()) {
    issues.push('这台机器暂时用不了系统密钥库，密钥会以明文保存在本机配置里');
  }
  return issues;
}

/**
 * 检查能不能生成笔记
 * Notion 两项不在这里要求：归档是可选项，没填只是存不了，不该拦着生成
 * 自定义服务商没填地址也算未配置，因为无法生成
 * @returns {boolean}
 */
function hasConfig() {
  const config = getConfig();
  return !!(config.apiKey && config.baseUrl && config.model);
}

module.exports = {
  getConfig,
  getPublicConfig,
  setConfig,
  hasConfig,
  migrateStore,
  getConfigIssues
};
