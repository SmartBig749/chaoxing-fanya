/**
 * 与后端 app.py 的 MASKED_VALUE 保持一致。
 *
 * 凭据类字段（题库 Token、各类 API Key、内嵌密钥的通知 URL）在下发时被替换成该掩码，
 * 前端原样回传即表示「用户未修改」，后端会还原为磁盘上已保存的真实值。
 * 显式清空该字段（提交空字符串）才表示删除凭据。
 */
export const MASKED_VALUE = '__MASKED__';

export const isMasked = (value) => value === MASKED_VALUE;

/**
 * 会话持久化结构版本。
 * v1 曾把明文密码写进 localStorage，加载时检测到旧版本一律丢弃并要求重新登录。
 */
export const SESSION_SCHEMA_VERSION = 2;
export const SESSION_STORAGE_KEY = 'chaoxing_session';
