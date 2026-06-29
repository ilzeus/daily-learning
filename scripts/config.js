// Daily Learning — 配置管理（本地 JSON 文件存储）
const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');

let _configPath = null;

/**
 * 获取配置文件路径（位于 Electron userData 目录下）
 */
function getConfigPath() {
  if (_configPath) return _configPath;
  const userData = ipcRenderer.sendSync('get-userdata-path');
  _configPath = path.join(userData, 'daily-learning-config.json');
  return _configPath;
}

/**
 * 读取配置文件
 * @returns {object}
 */
function readStore() {
  try {
    const filePath = getConfigPath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (_) {
    // 文件损坏或不存在，返回空对象
  }
  return {};
}

/**
 * 写入配置文件
 * @param {object} data
 */
function writeStore(data) {
  const filePath = getConfigPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 获取所有配置
 * @returns {{ deepseekApiKey: string, notionToken: string, notionDatabaseId: string }}
 */
function getConfig() {
  const data = readStore();
  return {
    deepseekApiKey: data.deepseekApiKey || '',
    notionToken: data.notionToken || '',
    notionDatabaseId: data.notionDatabaseId || ''
  };
}

/**
 * 更新配置（部分更新）
 * @param {object} config
 */
function setConfig(config) {
  const data = readStore();
  if (config.deepseekApiKey !== undefined) {
    data.deepseekApiKey = config.deepseekApiKey;
  }
  if (config.notionToken !== undefined) {
    data.notionToken = config.notionToken;
  }
  if (config.notionDatabaseId !== undefined) {
    data.notionDatabaseId = config.notionDatabaseId;
  }
  writeStore(data);
}

/**
 * 检查是否已完成首次配置（三个字段都已填写）
 * @returns {boolean}
 */
function hasConfig() {
  const config = getConfig();
  return !!(config.deepseekApiKey && config.notionToken && config.notionDatabaseId);
}

module.exports = { getConfig, setConfig, hasConfig };
