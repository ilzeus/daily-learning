// Daily Learning — Notion API 调用
const { getConfig } = require('./config.js');

// ---- 常量 ----
const NOTION_API_URL = 'https://api.notion.com/v1/pages';
const NOTION_VERSION = '2022-06-28';

// ---- 缓存 ----
// 缓存数据库属性名，避免每次保存都查一次
let _dbPropertyCache = null;
let _cachedDbId = null;

/**
 * 获取 Notion 数据库的属性信息
 * @param {string} databaseId
 * @param {string} token
 * @returns {Promise<object>} 数据库的 properties 对象
 */
async function fetchDatabaseProperties(databaseId, token) {
  if (_dbPropertyCache && _cachedDbId === databaseId) {
    return _dbPropertyCache;
  }

  const url = `https://api.notion.com/v1/databases/${databaseId}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION
    }
  });

  if (!response.ok) {
    throw new Error(`无法读取数据库信息 (HTTP ${response.status})。请确认：\n1. 数据库 ID 是否正确\n2. Notion Integration 已连接到该数据库`);
  }

  const db = await response.json();
  _dbPropertyCache = db.properties;
  _cachedDbId = databaseId;
  return _dbPropertyCache;
}

/**
 * 找到数据库中 title 类型的属性名
 * @param {object} properties — 数据库的 properties 对象
 * @returns {string}
 */
function findTitlePropertyName(properties) {
  for (const [key, prop] of Object.entries(properties)) {
    if (prop.type === 'title') {
      return key;
    }
  }
  return 'Name'; // fallback
}

/**
 * 检查数据库中是否存在指定属性
 * @param {object} properties
 * @param {string} name
 * @param {string} type — 可选，同时校验类型
 * @returns {boolean}
 */
function hasProperty(properties, name, type) {
  const prop = properties[name];
  if (!prop) return false;
  if (type && prop.type !== type) return false;
  return true;
}

// ---- 块转换 ----

/**
 * 将 Markdown 文本转换为 Notion blocks
 * @param {string} markdown
 * @returns {Array} Notion block 对象数组
 */
function markdownToBlocks(markdown) {
  const sections = markdown.split(/\n\n+/).filter(s => s.trim());
  const blocks = [];

  for (const section of sections) {
    const lines = section.split('\n');
    const firstLine = lines[0].trim();
    const fullText = section.trim();
    const restText = lines.slice(1).join('\n').trim();

    // ---- 标题 (h1-h3) ----
    const headingMatch = firstLine.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      const type = 'heading_' + level;
      blocks.push({
        object: 'block',
        type: type,
        [type]: { rich_text: richText(headingText) }
      });
      if (restText) {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: richText(restText) }
        });
      }
      continue;
    }

    // ---- 无序列表 ----
    if (firstLine.startsWith('- ') || firstLine.startsWith('* ')) {
      for (const line of lines) {
        const item = line.trim().replace(/^[-*]\s+/, '');
        if (!item) continue;
        blocks.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: richText(item) }
        });
      }
      continue;
    }

    // ---- 有序列表 ----
    if (/^\d+\.\s/.test(firstLine)) {
      for (const line of lines) {
        const item = line.trim().replace(/^\d+\.\s+/, '');
        if (!item) continue;
        blocks.push({
          object: 'block',
          type: 'numbered_list_item',
          numbered_list_item: { rich_text: richText(item) }
        });
      }
      continue;
    }

    // ---- 代码块 ----
    if (firstLine.startsWith('```')) {
      const langMatch = firstLine.match(/^```(\w*)/);
      const code = lines.slice(1).join('\n').replace(/```$/, '');
      blocks.push({
        object: 'block',
        type: 'code',
        code: {
          rich_text: richText(code),
          language: (langMatch && langMatch[1]) ? langMatch[1] : 'plain text'
        }
      });
      continue;
    }

    // ---- 默认段落 ----
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: richText(fullText) }
    });
  }

  return blocks;
}

/**
 * 文本 → Notion rich_text 数组（自动切割超过 2000 字符的段落）
 * @param {string} text
 * @returns {Array<{type: 'text', text: {content: string}}>}
 */
function richText(text) {
  const MAX = 2000;
  const trimmed = text.trim();
  if (!trimmed) return [{ type: 'text', text: { content: '' } }];

  const parts = [];
  let remaining = trimmed;

  while (remaining.length > 0) {
    if (remaining.length <= MAX) {
      parts.push({ type: 'text', text: { content: remaining } });
      break;
    }
    let cut = remaining.lastIndexOf('\n', MAX);
    if (cut <= 0) cut = MAX;
    parts.push({ type: 'text', text: { content: remaining.slice(0, cut) } });
    remaining = remaining.slice(cut).trim();
  }

  return parts;
}

// ---- API 调用 ----

/**
 * 保存笔记到 Notion 数据库
 * @param {string} title    — 学习主题（作为页面标题）
 * @param {string} markdown — AI 生成的 Markdown 内容（转换为页面子块）
 * @returns {Promise<object>} 创建成功的页面对象
 */
async function saveToNotion(title, markdown) {
  const config = getConfig();

  if (!config.notionToken || !config.notionDatabaseId) {
    throw new Error('请先配置 Notion Integration Token 和数据库 ID');
  }

  // 1. 获取数据库属性信息（自动缓存）
  const dbProperties = await fetchDatabaseProperties(config.notionDatabaseId, config.notionToken);

  // 2. 找到 title 类型的属性名（每个数据库有且仅有一个）
  const titlePropName = findTitlePropertyName(dbProperties);

  // 3. 动态构建 properties，只写入数据库实际存在的字段
  const properties = {};
  properties[titlePropName] = {
    title: [{ text: { content: title } }]
  };

  // 如果有 Date（日期）属性，填入今天日期
  if (hasProperty(dbProperties, 'Date', 'date')) {
    const today = new Date().toISOString().split('T')[0];
    properties['Date'] = { date: { start: today } };
  }

  // 4. 创建页面
  const body = {
    parent: { database_id: config.notionDatabaseId },
    properties: properties,
    children: markdownToBlocks(markdown)
  };

  const response = await fetch(NOTION_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.notionToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    let errMsg = `Notion API 请求失败 (HTTP ${response.status})`;
    try {
      const errData = await response.json();
      if (errData.message) errMsg = errData.message;
    } catch (_) { /* 无法解析错误体 */ }
    throw new Error(errMsg);
  }

  return response.json();
}

module.exports = { saveToNotion };
