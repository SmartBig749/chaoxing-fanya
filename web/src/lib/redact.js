/**
 * 日志脱敏：避免把密码、Token、Key 写进浏览器控制台或错误上报。
 */

const SENSITIVE_KEY_PATTERN = /pass|token|key|secret|session|cookie|auth/i;

/** 对单个值做整体遮蔽，只保留长度信息 */
const maskString = (value) => (value ? `***(${String(value).length})` : value);

/** 递归剔除对象里的敏感字段 */
export function redact(value, depth = 0) {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (typeof value !== 'object') return value;

  const out = {};
  Object.entries(value).forEach(([key, item]) => {
    if (item && typeof item === 'object') {
      out[key] = redact(item, depth + 1);
    } else if (SENSITIVE_KEY_PATTERN.test(key) && typeof item === 'string') {
      out[key] = maskString(item);
    } else {
      out[key] = item;
    }
  });
  return out;
}

/** 从 axios 错误对象里提取可安全打印的结构 */
export function redactAxiosError(error) {
  if (!error || typeof error !== 'object') return error;
  return {
    message: error.message,
    code: error.code,
    status: error.response?.status,
    data: redact(error.response?.data),
    method: error.config?.method,
    url: error.config?.url,
  };
}
