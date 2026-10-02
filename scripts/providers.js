// Daily Learning — 模型服务商预设
// 全部走 OpenAI 兼容的 POST {baseUrl}/chat/completions，差异只在地址和模型名
const PROVIDERS = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyPlaceholder: 'sk-...'
  },
  {
    id: 'kimi',
    label: 'Kimi（月之暗面）',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    keyPlaceholder: 'sk-...'
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    models: ['glm-4-flash', 'glm-4-air', 'glm-4-plus', 'glm-4-long'],
    keyPlaceholder: '按需填写'
  },
  {
    id: 'qwen',
    label: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen-long'],
    keyPlaceholder: 'sk-...'
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
    keyPlaceholder: 'sk-...'
  },
  {
    // 自定义服务商的模型只能靠 /models 拉取或手填
    id: 'custom',
    label: '自定义（OpenAI 兼容）',
    baseUrl: '',
    model: '',
    models: [],
    keyPlaceholder: '本地服务通常填 ollama'
  }
];

const DEFAULT_PROVIDER = 'deepseek';

function getProvider(id) {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];
}

function isKnownProvider(id) {
  return PROVIDERS.some((p) => p.id === id);
}

// 有人会把文档 curl 示例里的完整地址粘进来，这种情况不再拼一次
function chatCompletionsUrl(baseUrl) {
  const trimmed = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /\/chat\/completions$/.test(trimmed) ? trimmed : trimmed + '/chat/completions';
}

// 拉模型列表用的地址：把 chat 端点换成 models
function modelsUrl(baseUrl) {
  const trimmed = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  const root = trimmed.replace(/\/chat\/completions$/, '');
  return /\/models$/.test(root) ? root : root + '/models';
}

module.exports = { PROVIDERS, DEFAULT_PROVIDER, getProvider, isKnownProvider, chatCompletionsUrl, modelsUrl };
