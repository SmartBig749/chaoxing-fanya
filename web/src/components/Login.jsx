import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './ui/Card';
import Button from './ui/Button';
import Input from './ui/Input';
import Label from './ui/Label';
import { LogIn, Loader2 } from 'lucide-react';
import api from '../api/axios';
import { redactAxiosError } from '../lib/redact';

const Login = ({ onLoginSuccess, notice = '' }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [useCookies, setUseCookies] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 用户一旦重新输入就清掉上一次的登录错误，
  // 否则「密码错误」之类的过期提示会一直挂在表单上直到再次提交
  const clearError = () => {
    if (error) setError('');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/login', {
        username,
        password,
        use_cookies: useCookies,
      });

      if (response.data?.status) {
        // 只把 session_id 交给上层：密码仅作为本次请求的参数，不进入任何持久化状态
        onLoginSuccess({
          sessionId: response.data.data?.session_id,
          username: response.data.data?.username ?? username,
          useCookies,
        });
      } else {
        setError(response.data?.msg || '登录失败');
      }
    } catch (err) {
      console.error('登录请求失败:', redactAxiosError(err));
      setError(err.response?.data?.msg || '网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const message = error || notice;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 bg-primary rounded-full">
              <LogIn className="w-8 h-8 text-white" aria-hidden="true" />
            </div>
          </div>
          <CardTitle className="text-center text-3xl">超星学习通</CardTitle>
          <CardDescription className="text-center">
            自动化学习助手 - 登录以继续
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">手机号</Label>
              <Input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                placeholder="请输入手机号"
                value={username}
                onChange={(e) => {
                  clearError();
                  setUsername(e.target.value);
                }}
                required={!useCookies}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => {
                  clearError();
                  setPassword(e.target.value);
                }}
                required={!useCookies}
                disabled={useCookies}
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                id="use-cookies"
                type="checkbox"
                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                checked={useCookies}
                onChange={(e) => setUseCookies(e.target.checked)}
              />
              <Label htmlFor="use-cookies" className="cursor-pointer text-sm font-normal">
                使用Cookie登录（需提前配置cookies.txt）
              </Label>
            </div>

            {/* 错误与提示共用一块 role=alert 区域，读屏会自动播报 */}
            <div role="alert" aria-live="polite">
              {message && (
                <div
                  className={`p-3 text-sm rounded-md ${
                    error
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-blue-50 text-blue-700 border border-blue-100'
                  }`}
                >
                  {message}
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              账号密码仅用于本次登录校验，服务器只在内存中保留登录状态，刷新页面无需重新输入；
              如需切换账号请点击「退出登录」。
            </p>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  登录中...
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />
                  登录
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default Login;
