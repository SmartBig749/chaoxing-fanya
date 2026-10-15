import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Button from './ui/Button';

/**
 * 页面级错误边界。
 *
 * 没有它时，任意组件在渲染或副作用中抛错都会让 React 卸载整棵树，
 * 表现为整页白屏且没有任何恢复入口。
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('页面渲染异常:', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
    if (typeof this.props.onReset === 'function') {
      this.props.onReset();
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
        <div role="alert" className="w-full max-w-lg rounded-lg border bg-card p-6 shadow-sm">
          <div className="flex items-start">
            <AlertTriangle className="h-6 w-6 text-destructive mr-3 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold text-gray-900">页面出现异常</h1>
              <p className="text-sm text-muted-foreground mt-1">
                当前界面无法继续渲染。你可以返回首页重试；已在后台运行的学习任务不受影响。
              </p>
              <pre className="mt-3 max-h-40 overflow-auto rounded bg-gray-900 p-3 text-xs text-gray-200 whitespace-pre-wrap break-all">
                {String(error?.message || error)}
              </pre>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={this.handleReset}>返回首页</Button>
                <Button variant="outline" onClick={() => window.location.reload()}>
                  重新加载页面
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
