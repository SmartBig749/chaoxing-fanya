import React, { useCallback, useEffect, useState } from 'react';
import Login from './components/Login';
import CourseSelection from './components/CourseSelection';
import StudyProgress from './components/StudyProgress';
import ErrorBoundary from './components/ErrorBoundary';
import api from './api/axios';
import { redactAxiosError } from './lib/redact';
import { SESSION_SCHEMA_VERSION, SESSION_STORAGE_KEY } from './lib/constants';

const VALID_STEPS = ['login', 'courses', 'progress'];

/**
 * 从 localStorage 恢复会话。
 *
 * 注意两点历史问题：
 *  1. 旧结构里保存了明文密码 → 用 schemaVersion 区分，旧数据一律丢弃
 *  2. step 与 payload 不匹配时会渲染空容器（整页白屏）→ 这里做字段校验
 */
const loadSession = () => {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schemaVersion !== SESSION_SCHEMA_VERSION) return null;
    if (!VALID_STEPS.includes(parsed.step)) return null;
    if (parsed.step === 'login') return null;
    // 课程页与进度页都依赖有效会话
    if (!parsed.sessionId) return null;
    if (parsed.step === 'progress' && !parsed.taskId) return null;

    return parsed;
  } catch {
    return null;
  }
};

const clearSession = () => {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* 隐私模式等场景下读写失败不应阻断使用 */
  }
};

const BootScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
    <div className="text-center">
      <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-muted-foreground">正在恢复登录状态...</p>
    </div>
  </div>
);

function App() {
  const [bootstrap] = useState(loadSession);
  const [step, setStep] = useState(bootstrap?.step || 'login');
  const [username, setUsername] = useState(bootstrap?.username || '');
  const [useCookies, setUseCookies] = useState(!!bootstrap?.useCookies);
  const [sessionId, setSessionId] = useState(bootstrap?.sessionId || '');
  const [taskId, setTaskId] = useState(bootstrap?.taskId || '');
  const [notice, setNotice] = useState('');
  const [restoring, setRestoring] = useState(!!bootstrap);

  const resetToLogin = useCallback((message = '') => {
    setStep('login');
    setUsername('');
    setUseCookies(false);
    setSessionId('');
    setTaskId('');
    setNotice(message);
  }, []);

  // 持久化：只保留非敏感字段，密码不再落盘
  useEffect(() => {
    if (step === 'login') {
      clearSession();
      return;
    }
    try {
      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          schemaVersion: SESSION_SCHEMA_VERSION,
          step,
          username,
          useCookies,
          sessionId,
          taskId,
        })
      );
    } catch {
      /* 写入失败（如隐私模式）不影响当前使用 */
    }
  }, [step, username, useCookies, sessionId, taskId]);

  // 刷新页面后向服务端确认会话是否仍然有效（凭据只在后端内存中）
  useEffect(() => {
    if (!restoring) return undefined;
    let cancelled = false;

    api
      // 用 POST + body 传 session_id：session_id 等价于 bearer 凭据，
      // 放进 URL query 会被写入服务端访问日志与浏览器历史，故不允许出现在 URL 中
      .post('/session', { session_id: sessionId })
      .then((res) => {
        if (cancelled) return;
        if (!res.data?.status) throw new Error('会话无效');
        setUsername(res.data.data?.username || '');
        setUseCookies(!!res.data.data?.use_cookies);
        setRestoring(false);
      })
      .catch(() => {
        if (cancelled) return;
        setRestoring(false);
        resetToLogin('登录状态已失效，请重新登录');
      });

    return () => {
      cancelled = true;
    };
  }, [restoring, sessionId, resetToLogin]);

  // 恢复到进度页时校验任务是否仍存在（后端重启会导致内存任务丢失）
  useEffect(() => {
    if (restoring || step !== 'progress' || !taskId) return undefined;
    let cancelled = false;

    api
      .get(`/task/${taskId}`)
      .then((res) => {
        if (cancelled) return;
        if (!res.data?.status) {
          setTaskId('');
          setStep('courses');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        // 只有后端明确表示任务不存在时才退回课程页；
        // 网络抖动或服务重启交给进度页的失联提示处理，避免把用户踢出页面
        if (err?.response?.status === 404) {
          setTaskId('');
          setStep('courses');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [restoring, step, taskId]);

  const handleLoginSuccess = useCallback((info) => {
    setUsername(info?.username || '');
    setUseCookies(!!info?.useCookies);
    setSessionId(info?.sessionId || '');
    setTaskId('');
    setNotice('');
    setStep('courses');
  }, []);

  const handleStartStudy = useCallback(
    async (settings) => {
      const response = await api.post('/start', {
        session_id: sessionId,
        ...settings,
      });

      if (!response.data?.status) {
        throw new Error(response.data?.msg || '启动学习任务失败');
      }

      setTaskId(response.data.data.task_id);
      setStep('progress');
    },
    [sessionId]
  );

  const handleLogout = useCallback(async () => {
    try {
      await api.post('/logout', { session_id: sessionId });
    } catch (err) {
      console.error('退出登录请求失败:', redactAxiosError(err));
    } finally {
      resetToLogin('已退出登录');
    }
  }, [sessionId, resetToLogin]);

  // 返回课程页时保留 taskId，便于随时回到进度页查看后台任务
  const handleBackToHome = useCallback(() => {
    setStep('courses');
  }, []);

  const renderStep = () => {
    if (step === 'courses' && sessionId) {
      return (
        <CourseSelection
          userInfo={{ username, useCookies }}
          sessionId={sessionId}
          runningTaskId={taskId}
          onOpenProgress={() => setStep('progress')}
          onStartStudy={handleStartStudy}
          onLogout={handleLogout}
        />
      );
    }

    if (step === 'progress' && taskId) {
      return <StudyProgress taskId={taskId} sessionId={sessionId} onBack={handleBackToHome} />;
    }

    // 未知 step 或 payload 残缺：回退登录页，而不是渲染空白容器
    const fallbackNotice = step === 'login' ? notice : '会话状态不完整，请重新登录';
    return <Login onLoginSuccess={handleLoginSuccess} notice={fallbackNotice} />;
  };

  return (
    <div className="App">
      <ErrorBoundary onReset={resetToLogin}>
        {restoring ? <BootScreen /> : renderStep()}
      </ErrorBoundary>
    </div>
  );
}

export default App;
