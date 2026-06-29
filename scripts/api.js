// Daily Learning — DeepSeek API 调用
const { getConfig } = require('./config.js');

// ---- 常量 ----
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

const SYSTEM_PROMPT = [
  '你是一位知识渊博的学习导师。',
  '根据用户输入的主题，生成相关核心知识点（数量由 AI 根据主题自主判断，不可遗漏核心内容），',
  '每个知识点附带简洁解释，最后给出一段总结。',
  '输出格式为 Markdown。'
].join('');

// ---- API 调用 ----

/**
 * 调用 DeepSeek API 生成学习笔记
 * @param {string} topic — 用户输入的学习主题
 * @returns {Promise<string>} AI 生成的 Markdown 内容
 */
async function generateNotes(topic) {
  const config = getConfig();

  if (!config.deepseekApiKey) {
    throw new Error('请先配置 DeepSeek API Key');
  }

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.deepseekApiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: topic }
      ],
      temperature: 0.7
    })
  });

  if (!response.ok) {
    let errorMsg = `API 请求失败 (HTTP ${response.status})`;
    try {
      const errData = await response.json();
      if (errData.error && errData.error.message) {
        errorMsg = errData.error.message;
      }
    } catch (_) { /* 无法解析错误响应体，使用默认消息 */ }
    throw new Error(errorMsg);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

module.exports = { generateNotes };
