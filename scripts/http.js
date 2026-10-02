// Daily Learning — 通用网络请求
// 域名不通、地址写错、本地服务没起，Chromium/Node 只会抛一句英文，这里统一翻成人话。
// timeoutMs 用于「点了就该有反应」的请求：地址能连上却一直不回话时，fetch 会永远挂着，
// 按钮就卡在「拉取中...」再也点不动，所以必须给一个上限。

/**
 * @param {string} url
 * @param {object} options
 * @param {number} [timeoutMs] 0 表示不设上限
 * @param {AbortSignal} [signal] 用户主动中止；到点没人回话也由它兜底
 * @returns {Promise<Response>}
 */
async function request(url, options = {}, timeoutMs = 0, signal) {
  const ctrl = new AbortController();
  const timer = timeoutMs ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  const relay = () => ctrl.abort();
  if (signal) signal.addEventListener('abort', relay, { once: true });
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } catch (err) {
    // 先分清是谁掐断的：用户中止不该被说成地址有问题
    if (signal && signal.aborted) throw new Error('已中止生成');
    if (ctrl.signal.aborted) throw new Error('等得太久了，检查一下接口地址能不能正常响应');
    throw new Error(`连不上这个地址（${(err && err.message) || '请求失败'}），检查一下接口地址和网络`);
  } finally {
    if (timer) clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', relay);
  }
}

/**
 * 读取响应体里的 JSON，拿不到就返回 null（错误响应体经常不是 JSON）
 */
async function readJson(response) {
  try {
    return await response.json();
  } catch (_) {
    return null;
  }
}

module.exports = { request, readJson };
