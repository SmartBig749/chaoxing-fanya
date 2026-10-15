import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import { redactAxiosError } from './redact';

export const POLL_INTERVAL_MS = 2000;
/** 前端保留的日志条数上限，防止长时间运行把 DOM 撑爆 */
export const MAX_LOG_LINES = 500;
/** 连续失败达到该次数即判定失联并停止轮询 */
export const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * 任务轮询与日志增量拉取。
 *
 * - 日志按 seq 游标增量拉取，不再每 2 秒重复拉取整份日志
 * - 连续失败会降级为 degraded → disconnected，并停止轮询，由用户手动重试
 * - 任务进入终态自动停止轮询
 */
export default function useTaskPolling(taskId) {
  const [taskStatus, setTaskStatus] = useState(null);
  const [taskDetails, setTaskDetails] = useState(null);
  const [logs, setLogs] = useState([]);
  const [connection, setConnection] = useState('connecting');

  const failuresRef = useRef(0);
  const cursorRef = useRef(0);
  const timerRef = useRef(null);
  const stoppedRef = useRef(false);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const fetchOnce = useCallback(async () => {
    if (stoppedRef.current) return;

    try {
      const [statusRes, detailsRes, logsRes] = await Promise.all([
        api.get(`/task/${taskId}`),
        api.get(`/task/${taskId}/details`),
        api.get(`/logs/${taskId}`, { params: { since: cursorRef.current } }),
      ]);

      failuresRef.current = 0;
      setConnection('online');

      if (statusRes.data?.status) setTaskStatus(statusRes.data.data);
      if (detailsRes.data?.status) setTaskDetails(detailsRes.data.data);

      const payload = logsRes.data;
      if (payload?.status) {
        // 服务端日志被裁剪、或后端进程已重启（序号从头开始）时本地游标会失效，
        // 此时必须重置，否则会永久拉不到新日志。
        if (payload.dropped || (payload.first == null && cursorRef.current > 0)) {
          cursorRef.current = 0;
          if (payload.dropped) {
            // 明确告知而不是静默断层
            setLogs((prev) => [
              ...prev,
              { message: '（更早的日志已被裁剪）', level: 'warning', timestamp: Date.now() / 1000 },
            ]);
          }
        }

        const incoming = Array.isArray(payload.data) ? payload.data : [];
        if (incoming.length) {
          setLogs((prev) => {
            const merged = [...prev, ...incoming];
            return merged.length > MAX_LOG_LINES
              ? merged.slice(merged.length - MAX_LOG_LINES)
              : merged;
          });
        }
        if (typeof payload.next === 'number') cursorRef.current = payload.next;
      }

      const finished = statusRes.data?.data?.status;
      if (finished === 'completed' || finished === 'error' || finished === 'cancelled') {
        stop();
      }
    } catch (err) {
      console.error('轮询任务状态失败:', redactAxiosError(err));
      failuresRef.current += 1;
      if (failuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
        stop();
        setConnection('disconnected');
      } else {
        setConnection('degraded');
      }
    }
  }, [taskId, stop]);

  const start = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    stoppedRef.current = false;
    failuresRef.current = 0;
    setConnection('connecting');
    fetchOnce();
    timerRef.current = setInterval(fetchOnce, POLL_INTERVAL_MS);
  }, [fetchOnce]);

  useEffect(() => {
    if (!taskId) return undefined;
    start();
    return () => {
      stoppedRef.current = true;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [taskId, start]);

  /** 手动重试：重置游标重新建立连接 */
  const retry = useCallback(() => {
    cursorRef.current = 0;
    start();
  }, [start]);

  return { taskStatus, taskDetails, logs, connection, retry };
}
