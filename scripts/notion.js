// Daily Learning — Notion API 调用
// 这里的 Markdown → Notion block 映射必须和屏幕上 marked 渲染出来的结果一致，
// 否则用户在应用里看到「有表格、有加粗」，存进 Notion 却变成一堆星号和竖线。
const { getConfig } = require('./config.js');
const { request, readJson } = require('./http.js');

// ---- 常量 ----
const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const TEXT_MAX = 2000;      // 单个 rich_text 的字符上限
const BLOCK_BATCH = 100;    // 单次请求 children 的保守上限
const TITLE_MAX = 2000;
const REQUEST_TIMEOUT = 30000;

// Notion 只认它自己那份语言名，写错的值会直接 400
const CODE_LANGUAGES = [
  'abap', 'agda', 'arduino', 'assembly', 'bash', 'bonjour', 'c', 'clojure', 'coffeescript',
  'cpp', 'csharp', 'css', 'dart', 'diff', 'docker', 'elixir', 'elm', 'erlang', 'flow', 'fortran',
  'f#', 'gherkin', 'glsl', 'go', 'graphql', 'groovy', 'haskell', 'html', 'java', 'javascript',
  'json', 'julia', 'kotlin', 'latex', 'less', 'lisp', 'livescript', 'lua', 'makefile', 'markdown',
  'markup', 'matlab', 'mermaid', 'nix', 'objective-c', 'perl', 'php', 'plain text', 'powershell',
  'prolog', 'purescript', 'python', 'r', 'reason', 'ruby', 'rust', 'sass', 'scala', 'scheme',
  'scss', 'shell', 'sql', 'stylus', 'swift', 'toml', 'typescript', 'vb.net', 'verilog', 'vhdl',
  'visual basic', 'vue', 'vue2', 'wasm', 'xml', 'yaml'
];

// 模型爱写的简写 → Notion 认的语言名
const CODE_LANGUAGE_ALIASES = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', node: 'javascript',
  ts: 'typescript', tsx: 'typescript', py: 'python', rb: 'ruby', rs: 'rust', go: 'go', golang: 'go',
  sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', ps1: 'powershell',
  md: 'markdown', yml: 'yaml', txt: 'plain text', text: 'plain text', 'c++': 'cpp', 'c#': 'csharp',
  objc: 'objective-c', 'object-c': 'objective-c', dockerfile: 'docker', html: 'html', vue: 'vue',
  sql: 'sql', json: 'json', css: 'css', scss: 'scss', less: 'less', xml: 'xml', latex: 'latex'
};

function normalizeLanguage(raw) {
  const lower = String(raw || '').trim().toLowerCase();
  const mapped = CODE_LANGUAGE_ALIASES[lower] || lower;
  return CODE_LANGUAGES.includes(mapped) ? mapped : 'plain text';
}

// ---- 缓存 ----
let _dbPropertyCache = null;
let _cachedDbId = null;

function resetDatabaseCache() {
  _dbPropertyCache = null;
  _cachedDbId = null;
}

// ---- 行内文本 ----

function stripHtml(text) {
  return String(text)
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function annotationOf(ann) {
  if (ann.code) {
    return { bold: false, italic: false, strikethrough: false, underline: false, code: true, color: 'default' };
  }
  return {
    bold: !!ann.bold,
    italic: !!ann.italic,
    strikethrough: !!ann.strikethrough,
    underline: !!ann.underline,
    code: false,
    color: 'default'
  };
}

function chunkText(text) {
  if (text.length <= TEXT_MAX) return [text];
  const parts = [];
  let rest = text;
  while (rest.length > TEXT_MAX) {
    let cut = rest.lastIndexOf('\n', TEXT_MAX);
    if (cut <= 0) cut = TEXT_MAX;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, '');
  }
  if (rest) parts.push(rest);
  return parts;
}

function safeLink(url) {
  const raw = String(url || '').trim().replace(/[\u0000-\u001f]/g, '');
  return /^(https?:|mailto:)/i.test(raw) ? raw : '';
}

function pushText(parts, content, ann, link) {
  const text = stripHtml(content);
  if (!text) return;
  chunkText(text).forEach((piece) => {
    const item = { type: 'text', text: { content: piece }, annotations: annotationOf(ann) };
    if (link) item.text.link = { url: link };
    parts.push(item);
  });
}

// 长标记放前面，否则 *** 会被拆成 ** + *
const MARKS = [
  { open: '***', close: '***', ann: { bold: true, italic: true } },
  { open: '**', close: '**', ann: { bold: true } },
  { open: '__', close: '__', ann: { bold: true }, boundary: true },
  { open: '~~', close: '~~', ann: { strikethrough: true } },
  { open: '`', close: '`', ann: { code: true }, literal: true },
  { open: '*', close: '*', ann: { italic: true } },
  { open: '_', close: '_', ann: { italic: true }, boundary: true }
];

const LINK_RE = /^(!?)\[([^\]]*)\]\(\s*<?([^)>\s]*)>?(?:\s+["'][^"']*["'])?\s*\)/;
const BOUNDARY_BEFORE = /(^|[\s([{（【《“"'、，。：；!?—-])$/u;

/**
 * Markdown 行内语法 → Notion rich_text（加粗/斜体/删除线/行内代码/链接都会保留）
 * @param {string} text
 * @param {object} [ann]
 * @param {string} [link]
 * @param {Array} [out]
 * @returns {Array}
 */
function parseInline(text, ann = {}, link = '', out = []) {
  const src = String(text || '');
  let buf = '';
  let i = 0;

  const flush = () => {
    if (buf) {
      pushText(out, buf, ann, link);
      buf = '';
    }
  };

  while (i < src.length) {
    const ch = src[i];

    if (ch === '\\' && i + 1 < src.length && /[\\`*_~[\]()#>|!]/.test(src[i + 1])) {
      buf += src[i + 1];
      i += 2;
      continue;
    }

    if (ch === '[' || (ch === '!' && src[i + 1] === '[')) {
      const m = LINK_RE.exec(src.slice(i));
      if (m) {
        flush();
        const isImage = m[1] === '!';
        const url = safeLink(m[3]);
        if (isImage) {
          // Notion 的段落里不能放行内图片，退化成可读的链接
          pushText(out, m[2] || url, ann, url || undefined);
        } else {
          parseInline(m[2], ann, url || link, out);
        }
        i += m[0].length;
        continue;
      }
    }

    let matched = false;
    for (const mark of MARKS) {
      if (!src.startsWith(mark.open, i)) continue;
      if (mark.boundary && !BOUNDARY_BEFORE.test(src.slice(0, i))) continue;

      const start = i + mark.open.length;
      const end = src.indexOf(mark.close, start);
      if (end < 0) continue;

      const inner = src.slice(start, end);
      if (!inner || /^\s|\s$/.test(inner)) continue;

      flush();
      parseInline(inner, mark.literal ? { code: true } : { ...ann, ...mark.ann }, link, out);
      i = end + mark.close.length;
      matched = true;
      break;
    }
    if (matched) continue;

    buf += ch;
    i += 1;
  }

  flush();
  return out;
}

function richText(text) {
  const parts = parseInline(text);
  return parts.length ? parts : [{ type: 'text', text: { content: ' ' }, annotations: annotationOf({}) }];
}

// ---- 块级结构 ----

function block(type, payload) {
  return { object: 'block', type, [type]: payload };
}

function codeBlock(code, lang) {
  return block('code', { rich_text: richText(code.replace(/\n+$/, '')), language: normalizeLanguage(lang), caption: [] });
}

function tableBlocks(rows) {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 1);
  const toRow = (cells) => block('table_row', {
    cells: Array.from({ length: width }, (_, idx) => parseInline(cells[idx] || ''))
  });

  const header = rows[0];
  const body = rows.slice(1).filter((row) => !/^[\s|:-]+$/.test(row.join('|')));
  const chunks = [];
  const MAX_ROWS = 90; // 留一点余量给 100 block 的上限

  for (let i = 0; i < body.length; i += MAX_ROWS) chunks.push(body.slice(i, i + MAX_ROWS));
  if (!chunks.length) chunks.push([]);

  return chunks.map((chunk, idx) => {
    const withHeader = idx === 0 ? [header, ...chunk] : chunk;
    return block('table', {
      table_width: width,
      has_column_header: idx === 0,
      has_row_header: false,
      children: withHeader.map(toRow)
    });
  });
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_LINE = /^\s*\|?.*\|.*$/;

function isTableSeparator(line) {
  return /^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{0,}:?\s*\|?\s*$/.test(line);
}

function parseTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function startsNewBlock(line) {
  return /^\s{0,3}(`{3,}|~{3,})/.test(line) ||
    /^\s{0,3}#{1,6}\s+/.test(line) ||
    /^\s{0,3}>/.test(line) ||
    LIST_ITEM.test(line) ||
    (TABLE_LINE.test(line) && line.includes('|'));
}

/**
 * 解析一段列表，按缩进还原层级（Notion 的列表块支持 children）
 */
function parseList(lines, startIndex) {
  const top = [];
  const stack = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      // 松散列表：项与项之间可以有空行，只要下一个非空行还是列表项
      let peek = i + 1;
      while (peek < lines.length && !lines[peek].trim()) peek += 1;
      if (peek < lines.length && LIST_ITEM.test(lines[peek]) && top.length) {
        i = peek;
        continue;
      }
      break;
    }

    const m = line.match(LIST_ITEM);
    if (!m) {
      // 缩进续行并进当前项
      if (stack.length && /^\s{2,}\S/.test(line)) {
        stack[stack.length - 1].item.text += `\n${line.trim()}`;
        i += 1;
        continue;
      }
      break;
    }

    const indent = m[1].replace(/\t/g, '    ').length;
    const text = m[3].trim();
    const task = text.match(/^\[([ xX])\]\s+([\s\S]*)$/);
    const item = {
      type: task ? 'to_do' : (/\d/.test(m[2]) ? 'numbered_list_item' : 'bulleted_list_item'),
      text: task ? task[2] : text,
      checked: task ? task[1].toLowerCase() === 'x' : false,
      isTask: !!task,
      children: []
    };

    while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop();
    if (stack.length) stack[stack.length - 1].item.children.push(item);
    else top.push(item);
    stack.push({ indent, item });

    i += 1;
  }

  const toBlock = (item) => {
    const payload = { rich_text: richText(item.text) };
    if (item.isTask) payload.checked = item.checked;
    if (item.children.length) payload.children = item.children.map(toBlock);
    return block(item.type, payload);
  };

  return { blocks: top.map(toBlock), next: i };
}

/**
 * Markdown → Notion blocks（逐行解析，标题/列表/表格/引用/代码块各归各位）
 * @param {string} markdown
 * @returns {Array}
 */
function markdownToBlocks(markdown) {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    // 围栏代码块：内部允许空行，整块收完再走
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})\s*(\S*)/);
    if (fence) {
      const closeRe = new RegExp(`^\\s{0,3}${fence[1][0] === '`' ? '`' : '~'}{${fence[1].length},}\\s*$`);
      const body = [];
      i += 1;
      while (i < lines.length && !closeRe.test(lines[i])) { body.push(lines[i]); i += 1; }
      i += 1; // 跳过闭合围栏（没闭合时吃掉 EOF，不吊死）
      blocks.push(codeBlock(body.join('\n'), fence[2]));
      continue;
    }

    // 标题：Notion 只有三级，四级往下统一归到三级
    const heading = line.match(/^\s{0,3}(#{1,6})\s+([\s\S]+?)\s*#*\s*$/);
    if (heading) {
      const type = `heading_${Math.min(heading[1].length, 3)}`;
      blocks.push(block(type, { rich_text: richText(heading[2]), is_toggleable: false }));
      i += 1;
      continue;
    }

    // 分割线
    if (/^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/.test(line)) {
      blocks.push(block('divider', {}));
      i += 1;
      continue;
    }

    // 表格：表头 + 分隔行 + 数据行
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const rows = [parseTableRow(line)];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(parseTableRow(lines[i]));
        i += 1;
      }
      tableBlocks(rows).forEach((t) => blocks.push(t));
      continue;
    }

    // 引用块：连续的 > 行合成一个 quote
    if (/^\s{0,3}>/.test(line)) {
      const body = [];
      while (i < lines.length && (/^\s{0,3}>/.test(lines[i]) || (body.length && lines[i].trim() && !startsNewBlock(lines[i])))) {
        body.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
        i += 1;
      }
      blocks.push(block('quote', { rich_text: richText(body.join('\n')) }));
      continue;
    }

    // 列表（含嵌套、含任务列表）
    if (LIST_ITEM.test(line)) {
      const parsed = parseList(lines, i);
      parsed.blocks.forEach((b) => blocks.push(b));
      i = parsed.next;
      continue;
    }

    // 普通段落：吃到下一个空行或下一个块级起点
    const buf = [line.trim()];
    i += 1;
    while (i < lines.length && lines[i].trim() && !startsNewBlock(lines[i])) {
      buf.push(lines[i].trim());
      i += 1;
    }
    blocks.push(block('paragraph', { rich_text: richText(buf.join('\n')) }));
  }

  return blocks;
}

// ---- 计数与分批 ----

function countBlocks(blocks) {
  return blocks.reduce((sum, b) => {
    const kids = b[b.type] && b[b.type].children;
    return sum + 1 + (Array.isArray(kids) ? countBlocks(kids) : 0);
  }, 0);
}

/**
 * 把已经算好的 block 数组按「累计不超过 BLOCK_BATCH 个」切成若干批
 */
function batchBlocks(blocks) {
  const batches = [];
  let current = [];
  let size = 0;

  blocks.forEach((b) => {
    const cost = countBlocks([b]);
    if (size + cost > BLOCK_BATCH && current.length) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(b);
    size += cost;
  });
  if (current.length) batches.push(current);
  return batches;
}

// ---- API 调用 ----

function notionHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION
  };
}

async function notionRequest(url, token, options, attempts = 2) {
  for (let i = 0; i < attempts; i += 1) {
    const response = await request(url, { ...options, headers: notionHeaders(token) }, REQUEST_TIMEOUT);
    if (response.status === 429 && i < attempts - 1) {
      const wait = Number(response.headers.get('retry-after')) || 1;
      await new Promise((r) => setTimeout(r, Math.min(wait, 3) * 1000));
      continue;
    }
    if (!response.ok) {
      const data = await readJson(response);
      const detail = data && (data.message || (data.error && data.error.message));
      throw new Error(detail ? `${detail}` : `Notion 请求失败 (HTTP ${response.status})`);
    }
    const json = await readJson(response);
    if (!json) throw new Error('Notion 返回的内容读不出来');
    return json;
  }
  throw new Error('Notion 请求过于频繁，稍后再试一次');
}

async function fetchDatabaseProperties(databaseId, token) {
  if (_dbPropertyCache && _cachedDbId === databaseId) return _dbPropertyCache;

  const db = await notionRequest(`${NOTION_API}/databases/${databaseId}`, token, { method: 'GET' });
  _dbPropertyCache = db.properties || {};
  _cachedDbId = databaseId;
  return _dbPropertyCache;
}

function findTitlePropertyName(properties) {
  const entry = Object.entries(properties).find(([, prop]) => prop && prop.type === 'title');
  return entry ? entry[0] : 'Name';
}

function hasProperty(properties, name, type) {
  const prop = properties[name];
  if (!prop) return false;
  if (type && prop.type !== type) return false;
  return true;
}

/** 本地日期，不用 toISOString()：UTC 会让东八区凌晨存的笔记标成昨天 */
function localToday() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * 保存笔记到 Notion 数据库
 * @param {string} title
 * @param {string} markdown
 * @returns {Promise<{url: string}>}
 */
async function saveToNotion(title, markdown) {
  const config = getConfig();

  if (!config.notionToken || !config.notionDatabaseId) {
    throw new Error('请先配置 Notion Integration Token 和数据库 ID');
  }

  const dbProperties = await fetchDatabaseProperties(config.notionDatabaseId, config.notionToken);
  const titlePropName = findTitlePropertyName(dbProperties);

  const properties = {};
  properties[titlePropName] = {
    title: parseInline(String(title).slice(0, TITLE_MAX))
  };
  if (hasProperty(dbProperties, 'Date', 'date')) {
    properties.Date = { date: { start: localToday() } };
  }

  const batches = batchBlocks(markdownToBlocks(markdown));
  const page = await notionRequest(`${NOTION_API}/pages`, config.notionToken, {
    method: 'POST',
    body: JSON.stringify({
      parent: { database_id: config.notionDatabaseId },
      properties,
      children: batches.shift() || []
    })
  });

  // 剩下的分批追加：一次塞太多 block 会被 Notion 拒掉
  for (const batch of batches) {
    await notionRequest(`${NOTION_API}/blocks/${page.id}/children`, config.notionToken, {
      method: 'PATCH',
      body: JSON.stringify({ children: batch })
    });
  }

  return { url: page.url };
}

module.exports = { saveToNotion, markdownToBlocks, parseInline, resetDatabaseCache };
