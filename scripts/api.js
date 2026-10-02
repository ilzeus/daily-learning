// Daily Learning — 对话模型 API 调用（OpenAI 兼容）
const { getConfig } = require('./config.js');
const { chatCompletionsUrl, modelsUrl } = require('./providers.js');
const { request, readJson } = require('./http.js');

const SYSTEM_PROMPTS = {
  learn: [
    '你是一位擅长把复杂概念讲明白的学习导师。',
    '用大白话讲解，通俗易懂，避免堆砌专业术语；必须用到术语时，紧跟一句口语化解释或生活类比。',
    '以连贯段落讲解为主，像给人口头讲解那样写，不要把内容拆成碎片化的条目清单；列表只在确实需要并列时使用，且不超过三条。',
    '按这个顺序讲：先一句话说清这是什么，再用一个生活化类比帮助理解，然后把核心知识点讲透（数量由你根据主题自主判断，不可遗漏核心内容）。',
    '最后单独用一行 Markdown 引用（以 > 开头）写出「一句话记住：……」。',
    '输出格式为 Markdown。'
  ].join(''),

  pro: [
    '你是一位严谨的专业讲师，读者已具备相关领域的基础。',
    '使用准确的术语和规范定义，以连贯段落论述为主：先讲机制与原理，再讲设计动机、适用场景、与相近概念的取舍，最后指出常见误区和坑。',
    '覆盖核心知识点（数量由你根据主题自主判断，不可遗漏核心内容），不要为了排版而把论述拆成碎片化的条目。',
    '结尾用一段话给出总结。',
    '输出格式为 Markdown。'
  ].join(''),

  notes: [
    '你是一位擅长整理知识体系的学习笔记编辑。',
    '把主题整理成可直接归档复习的结构化笔记：用分层标题（## 与 ###）搭出骨架，要点一律用短句列表，可以对照的内容用 Markdown 表格呈现，关键结论加粗。',
    '覆盖核心知识点（数量由你根据主题自主判断，不可遗漏核心内容），不要写引言式铺垫和空洞的过渡句。',
    '最后用一段简短总结收尾。',
    '输出格式为 Markdown。'
  ].join('')
};

const MODE_LABELS = {
  learn: '学习版',
  pro: '专业版',
  notes: '笔记版'
};

// ---- API 调用 ----

// 一次完整讲解可能要几十秒，但地址挂在那里永远不回话时不能一直卡着转圈，
// 除了界面上的「中止」按钮，还要有一个自己会到的上限
const GENERATE_TIMEOUT_MS = 120000;

/**
 * 调用配置的模型接口生成学习笔记
 * @param {string} topic — 用户输入的学习主题
 * @param {string} mode  — learn | pro | notes，未知值回退到 learn
 * @param {AbortSignal} [signal] — 用户中止本轮生成时掐断请求
 * @returns {Promise<string>} AI 生成的 Markdown 内容
 */
async function generateNotes(topic, mode, signal) {
  const config = getConfig();

  if (!config.apiKey) {
    throw new Error('请先配置 API Key');
  }

  const url = chatCompletionsUrl(config.baseUrl);
  if (!url) {
    throw new Error('请先在配置里填写接口地址');
  }
  if (!config.model) {
    throw new Error('请先在配置里填写模型名称');
  }

  const promptMode = SYSTEM_PROMPTS[mode] ? mode : 'learn';

  const response = await request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS[promptMode] },
        { role: 'user', content: topic }
      ],
      temperature: 0.7
    })
  }, GENERATE_TIMEOUT_MS, signal);

  if (!response.ok) {
    const errData = await readJson(response);
    const detail = errData && errData.error && errData.error.message;
    throw new Error(detail || `接口请求失败 (HTTP ${response.status})`);
  }

  const data = await readJson(response);
  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : '';
  if (!content) {
    throw new Error('接口没返回内容，检查一下模型名是否可用');
  }
  return content;
}

/**
 * 拉取服务商当前提供的模型列表
 * @param {{apiKey?: string, baseUrl?: string}} overrides — 配置窗里尚未保存的草稿值
 * @returns {Promise<string[]>} 模型 id，已去重排序
 */
async function listModels(overrides = {}) {
  const config = getConfig();
  const apiKey = overrides.apiKey !== undefined ? overrides.apiKey : config.apiKey;
  const baseUrl = overrides.baseUrl !== undefined ? overrides.baseUrl : config.baseUrl;

  if (!apiKey) {
    throw new Error('请先填写 API Key');
  }

  const url = modelsUrl(baseUrl);
  if (!url) {
    throw new Error('请先填写接口地址');
  }

  const response = await request(url, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${apiKey}` }
  }, 15000);

  if (response.status === 401 || response.status === 403) {
    throw new Error('API Key 不对或没权限，拉不到模型列表');
  }
  if (response.status === 404) {
    throw new Error('这个服务商没有模型列表接口，手动填写模型名吧');
  }
  if (!response.ok) {
    throw new Error(`获取模型列表失败 (HTTP ${response.status})`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (_) {
    // 有些服务商的 /models 返回 HTML 错误页
    throw new Error('这个接口没返回模型列表，请手动填写模型名');
  }

  // OpenAI 格式是 data，智谱用的是 model
  const items = Array.isArray(payload.data) ? payload.data
    : (Array.isArray(payload.model) ? payload.model : []);
  const ids = Array.from(new Set(
    items.map((it) => (typeof it === 'string' ? it : it && it.id)).filter(Boolean)
  ));

  if (!ids.length) {
    throw new Error('这个接口没返回模型列表，请手动填写模型名');
  }
  return ids.sort((a, b) => a.localeCompare(b));
}

module.exports = { generateNotes, listModels, MODE_LABELS };
