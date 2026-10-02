// Daily Learning — Markdown → 安全 HTML
// 模型返回的内容是不可信输入：marked 默认会把 Markdown 里的原始 HTML 原样透传，
// 所以这里把 HTML 转义成文字，并只放行 http/https/mailto 协议。
const marked = require('marked');

const SAFE_LINK = /^(https?:|mailto:)/i;
const SAFE_IMAGE = /^https:/i;

function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function normalizeUrl(raw) {
  const url = String(raw === undefined || raw === null ? '' : raw).trim().replace(/[\u0000-\u001f]/g, '');
  return SAFE_LINK.test(url) ? url : '#';
}

marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    // marked 对块级和行内 HTML 都只传一个参数，所以这里不加任何包裹标签：
    // 转义后的纯文本在两种位置都是合法内容，套 <p> 反而会在段落里套段落
    html(htmlOrToken) {
      const raw = typeof htmlOrToken === 'string'
        ? htmlOrToken
        : (htmlOrToken && (htmlOrToken.text || htmlOrToken.raw)) || '';
      return escapeHtml(raw);
    },

    link(href, title, text) {
      const url = normalizeUrl(href);
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return `<a href="${escapeHtml(url)}" data-external="1"${titleAttr}>${text || ''}</a>`;
    },

    image(href, title, text) {
      const raw = String(href || '').trim();
      if (!SAFE_IMAGE.test(raw)) return escapeHtml(text || '');
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return `<img src="${escapeHtml(raw)}" alt="${escapeHtml(text || '')}" loading="lazy"${titleAttr}>`;
    }
  }
});

/**
 * 把 AI 返回的 Markdown 渲染成可直接塞进 innerHTML 的字符串
 * @param {string} markdown
 * @returns {string} 已净化的 HTML
 */
function renderMarkdown(markdown) {
  if (!markdown) return '';
  return marked.parse(String(markdown));
}

module.exports = { renderMarkdown, escapeHtml };
