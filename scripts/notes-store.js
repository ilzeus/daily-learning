// Daily Learning — 本机笔记落盘
// 每生成一版就顺手存一份 Markdown：关掉应用、没配 Notion、API 抽风，
// 都不该让人白等一趟。目录默认在应用数据目录下，配置窗里可以换成自己的文件夹。
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function defaultNotesDir() {
  return path.join(app.getPath('userData'), 'notes');
}

// 配置里存的是用户填的原始路径；空值表示「用默认目录」，不写死进配置文件
function normalizeNotesDir(raw) {
  const value = String(raw || '').trim().replace(/^"|"$/g, ''); // 从资源管理器地址栏粘过来常带引号
  if (!value) return '';
  // 只跑 Windows，所以认盘符和 UNC 两种写法；相对路径留着不然是个坑
  if (!/^[a-zA-Z]:[\\/]/.test(value) && !/^\\\\/.test(value)) {
    throw new Error('笔记文件夹要填完整路径，比如 D:\\笔记');
  }
  return value;
}

function resolveNotesDir(configured) {
  return configured ? configured : defaultNotesDir();
}

function ensureNotesDir(dir) {
  const target = dir || defaultNotesDir();
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
  return target;
}

// Windows 文件名不能带这些，主题里出现就换成空格
function safeName(text) {
  const cleaned = String(text || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned.slice(0, 40) || '未命名').replace(/[. ]+$/, '');
}

// 用本地时间：文件名要和他墙上的钟对得上，UTC 会让晚上生成的笔记跑到明天
function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return [
    d.getFullYear(), p(d.getMonth() + 1), p(d.getDate())
  ].join('-') + ' ' + [p(d.getHours()), p(d.getMinutes()), p(d.getSeconds())].join('-');
}

/**
 * @param {{ dir?: string, topic: string, modeLabel: string, markdown: string }} note
 * @returns {string} 文件名
 */
function saveNote(note) {
  const dir = ensureNotesDir(note.dir);
  const name = `${stamp(new Date())} ${note.modeLabel} ${safeName(note.topic)}.md`;
  fs.writeFileSync(path.join(dir, name), String(note.markdown), 'utf-8');
  return name;
}

module.exports = {
  defaultNotesDir,
  normalizeNotesDir,
  resolveNotesDir,
  ensureNotesDir,
  saveNote,
  safeName
};
