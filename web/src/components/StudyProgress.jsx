import React, { useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import Button from './ui/Button';
import {
  CheckCircle2, Clock, AlertCircle, Play, Home, BookOpen,
  FileText, XCircle, Loader2, ChevronDown, ChevronRight,
  Activity, TrendingUp, Film, MonitorPlay, SkipForward, WifiOff, RefreshCw
} from 'lucide-react';
import useTaskPolling from '../lib/useTaskPolling';

const StudyProgress = ({ taskId, onBack }) => {
  const { taskStatus, taskDetails, logs, connection, retry } = useTaskPolling(taskId);
  const [expandedCourses, setExpandedCourses] = useState(new Set());
  const logsEndRef = useRef(null);

  // 宿主环境（如 jsdom、部分内嵌浏览器）可能没有 scrollIntoView，
  // 直接调用会抛错并让整棵 React 树被卸载成白屏，因此先做特性检测。
  useEffect(() => {
    const node = logsEndRef.current;
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const toggleCourse = (courseId) => {
    setExpandedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  };

  const getStatusInfo = () => {
    if (!taskStatus) return { text: '加载中...', color: 'text-gray-500', icon: Clock };

    switch (taskStatus.status) {
      case 'running':
        return { text: '学习中', color: 'text-blue-600', icon: Play };
      case 'completed':
        return { text: '已完成', color: 'text-green-600', icon: CheckCircle2 };
      case 'cancelled':
        return { text: '已中止', color: 'text-amber-600', icon: XCircle };
      case 'error':
        return { text: '出现错误', color: 'text-red-600', icon: AlertCircle };
      default:
        return { text: '未知状态', color: 'text-gray-500', icon: Clock };
    }
  };

  const getLogLevelColor = (level) => {
    switch (level) {
      case 'error':
        return 'text-red-400';
      case 'warning':
        return 'text-yellow-400';
      case 'success':
        return 'text-green-400';
      default:
        return 'text-gray-300';
    }
  };

  const getCourseStatusIcon = (status) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;
  const progress = taskStatus ? (taskStatus.progress / (taskStatus.total || 1)) * 100 : 0;
  const progressPercent = Math.round(progress);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header：返回入口常驻，任务运行期间也能离开本页（任务继续在后台执行） */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">学习进度监控</h1>
            <p className="text-muted-foreground mt-1">实时跟踪任务执行详情</p>
          </div>
          <Button variant="outline" onClick={onBack}>
            <Home className="mr-2 h-4 w-4" aria-hidden="true" />
            返回课程列表
          </Button>
        </div>

        {connection !== 'online' && (
          <div
            role="alert"
            className={`mb-6 flex items-start justify-between gap-3 p-4 rounded-lg text-sm ${
              connection === 'disconnected'
                ? 'bg-destructive/10 text-destructive'
                : 'bg-amber-50 text-amber-700 border border-amber-100'
            }`}
          >
            <span className="flex items-start">
              <WifiOff className="w-4 h-4 mr-2 mt-0.5 shrink-0" aria-hidden="true" />
              {connection === 'disconnected'
                ? '与后端失去连接，已停止自动刷新。请确认服务是否仍在运行，然后重试。'
                : connection === 'connecting'
                  ? '正在连接后端以获取最新进度...'
                  : '获取进度时出现异常，正在重试...'}
            </span>
            {connection === 'disconnected' && (
              <Button variant="outline" size="sm" onClick={retry}>
                <RefreshCw className="w-3 h-3 mr-1" aria-hidden="true" />
                重新连接
              </Button>
            )}
          </div>
        )}

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">课程进度</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {taskStatus?.progress || 0} / {taskStatus?.total || 0}
                  </p>
                </div>
                <BookOpen className="h-8 w-8 text-blue-500" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">章节统计</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {taskStatus?.stats?.completed_chapters || 0} / {taskStatus?.stats?.total_chapters || 0}
                  </p>
                </div>
                <FileText className="h-8 w-8 text-green-500" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">任务状态</p>
                  <p className="text-lg font-semibold mt-1 flex items-center">
                    <StatusIcon className={`mr-2 h-5 w-5 ${statusInfo.color}`} aria-hidden="true" />
                    {statusInfo.text}
                  </p>
                </div>
                <Activity className="h-8 w-8 text-purple-500" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">完成率</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{progressPercent}%</p>
                </div>
                <TrendingUp className="h-8 w-8 text-orange-500" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Current Progress */}
            <Card>
              <CardHeader>
                <CardTitle>当前进度</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">整体进度</span>
                    <span className="font-semibold">
                      {taskStatus?.progress || 0} / {taskStatus?.total || 0} 课程
                    </span>
                  </div>
                  <div
                    className="w-full bg-gray-200 rounded-full h-3 overflow-hidden"
                    role="progressbar"
                    aria-label="整体课程进度"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(progressPercent, 100)}
                  >
                    <div
                      className="bg-gradient-to-r from-blue-500 to-blue-600 h-full transition-all duration-500 ease-out"
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                </div>

                {taskStatus?.current_course && (
                  <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10" aria-hidden="true">
                      <BookOpen className="w-24 h-24 text-blue-500" />
                    </div>
                    <div className="flex items-start relative z-10">
                      <div className="p-2 bg-white rounded-lg shadow-sm mr-4">
                        <Loader2 className="h-6 w-6 text-blue-600 animate-spin" aria-hidden="true" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-blue-600 font-medium mb-1">正在学习</p>
                        <h3 className="text-lg font-bold text-gray-900 mb-1">{taskStatus.current_course}</h3>
                        {taskStatus.current_chapter && (
                          <div className="flex items-center text-sm text-gray-600">
                            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs mr-2">章节</span>
                            {taskStatus.current_chapter}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 视频播放进度 */}
                {taskDetails?.active_jobs && Object.keys(taskDetails.active_jobs).length > 0 && (
                  <div className="space-y-4 mt-6 pt-6 border-t border-gray-100">
                    <div className="flex items-center space-x-2 mb-4">
                      <MonitorPlay className="h-5 w-5 text-indigo-600" aria-hidden="true" />
                      <h3 className="font-semibold text-gray-900">
                        正在播放视频 ({Object.keys(taskDetails.active_jobs).length})
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {Object.values(taskDetails.active_jobs).map((job, index) => (
                        <div
                          key={index}
                          className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow duration-200"
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex items-start space-x-3 overflow-hidden">
                              <div className="p-2 bg-indigo-50 rounded-lg flex-shrink-0">
                                <Film className="h-5 w-5 text-indigo-500" aria-hidden="true" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <h4 className="font-medium text-gray-900 truncate" title={job.job_name}>
                                  {job.job_name || '未知任务'}
                                </h4>
                                <p className="text-xs text-gray-500 truncate mt-0.5 flex items-center" title={job.course_name}>
                                  <BookOpen className="h-3 w-3 mr-1" aria-hidden="true" />
                                  {job.course_name}
                                </p>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0 ml-4">
                              <span className="text-lg font-bold text-indigo-600">
                                {Math.round(job.progress)}%
                              </span>
                            </div>
                          </div>

                          <div className="relative pt-1">
                            <div className="flex items-center justify-between text-xs text-gray-500 mb-1 font-mono">
                              <span>{formatTime(job.current_time)}</span>
                              <span>{formatTime(job.duration)}</span>
                            </div>
                            <div
                              className="overflow-hidden h-2 text-xs flex rounded-full bg-gray-100"
                              role="progressbar"
                              aria-label={`${job.job_name || '视频'} 播放进度`}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={Math.min(Math.round(job.progress), 100)}
                            >
                              <div
                                style={{ width: `${Math.min(job.progress, 100)}%` }}
                                className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-indigo-500 transition-all duration-500 ease-out"
                              >
                                <div
                                  aria-hidden="true"
                                  className="w-full h-full opacity-30 bg-[length:10px_10px] bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] animate-[progress-stripes_1s_linear_infinite]"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {taskStatus?.error && (
                  <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start">
                      <AlertCircle className="h-5 w-5 text-red-600 mr-3 mt-0.5 flex-shrink-0" aria-hidden="true" />
                      <div>
                        <p className="text-sm text-red-600 font-semibold mb-1">错误信息</p>
                        <p className="text-sm text-red-700">{taskStatus.error}</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Course Details */}
            {taskDetails && taskDetails.courses && taskDetails.courses.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <BookOpen className="mr-2 h-5 w-5" aria-hidden="true" />
                    课程明细
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {taskDetails.courses.map((course) => {
                      const isExpanded = expandedCourses.has(course.id);
                      const hasChapters = !!course.chapters && course.chapters.length > 0;
                      return (
                        <div key={course.id} className="border border-gray-200 rounded-lg overflow-hidden">
                          <button
                            type="button"
                            className="w-full p-3 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between text-left"
                            aria-expanded={isExpanded}
                            aria-controls={`progress-course-${course.id}`}
                            onClick={() => toggleCourse(course.id)}
                          >
                            <span className="flex items-center flex-1">
                              {getCourseStatusIcon(course.status)}
                              <span className="ml-3 font-medium text-gray-900">{course.title}</span>
                            </span>
                            <span className="flex items-center space-x-2">
                              {hasChapters && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                  {course.chapters.filter((c) => c.has_finished).length} / {course.chapters.length} 章节
                                </span>
                              )}
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-gray-500" aria-hidden="true" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-gray-500" aria-hidden="true" />
                              )}
                            </span>
                          </button>

                          {isExpanded && hasChapters && (
                            <div id={`progress-course-${course.id}`} className="p-3 bg-white border-t border-gray-200">
                              <div className="space-y-1">
                                {course.chapters.map((chapter, idx) => (
                                  <div
                                    key={chapter.id}
                                    className="flex items-center text-sm py-2 px-3 hover:bg-gray-50 rounded"
                                  >
                                    <span className="text-gray-400 mr-3 w-6">{idx + 1}.</span>
                                    <span
                                      className={`flex-1 ${
                                        chapter.status === 'skipped'
                                          ? 'text-gray-400 line-through'
                                          : 'text-gray-700'
                                      }`}
                                    >
                                      {chapter.title}
                                    </span>
                                    {chapter.status === 'skipped' ? (
                                      <span className="ml-2 flex items-center text-xs text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded">
                                        <SkipForward className="h-3 w-3 mr-1" aria-hidden="true" />
                                        已跳过
                                      </span>
                                    ) : chapter.has_finished ? (
                                      <CheckCircle2 className="h-4 w-4 text-green-500 ml-2" aria-label="已完成" />
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Execution Logs */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileText className="mr-2 h-5 w-5" aria-hidden="true" />
                  执行日志
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  role="log"
                  aria-live="polite"
                  aria-label={`执行日志，当前显示最近 ${logs.length} 条`}
                  className="bg-gray-900 rounded-lg p-4 h-[400px] overflow-y-auto font-mono text-xs"
                >
                  {logs.length === 0 ? (
                    <p className="text-gray-400">等待日志输出...</p>
                  ) : (
                    logs.map((log, index) => (
                      <div key={index} className={`mb-1 ${getLogLevelColor(log.level || 'info')}`}>
                        <span className="text-gray-500 mr-2">
                          [{new Date(log.timestamp * 1000).toLocaleTimeString('zh-CN')}]
                        </span>
                        {log.message || log}
                      </div>
                    ))
                  )}
                  <div ref={logsEndRef} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>任务信息</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">任务ID</p>
                  <p className="font-mono text-xs bg-gray-100 p-2 rounded mt-1 break-all">{taskId}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">开始时间</p>
                  <p className="text-sm font-semibold mt-1">
                    {taskStatus?.start_time
                      ? new Date(taskStatus.start_time * 1000).toLocaleString('zh-CN')
                      : '-'}
                  </p>
                </div>

                {taskStatus?.status === 'completed' && (
                  <div role="status" className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm font-semibold text-green-700 flex items-center">
                      <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                      所有任务已完成！
                    </p>
                  </div>
                )}

                {taskStatus?.status === 'cancelled' && (
                  <div role="status" className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm font-semibold text-amber-700 flex items-center">
                      <XCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                      任务已中止
                    </p>
                  </div>
                )}

                {taskStatus?.status === 'error' && (
                  <div role="status" className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm font-semibold text-red-700 flex items-center">
                      <AlertCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                      任务执行失败
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {taskStatus?.stats && (
              <Card>
                <CardHeader>
                  <CardTitle>详细统计</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">总章节数</span>
                    <span className="font-semibold text-gray-900">{taskStatus.stats.total_chapters || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">已完成章节</span>
                    <span className="font-semibold text-green-600">{taskStatus.stats.completed_chapters || 0}</span>
                  </div>
                  {taskStatus.stats.skipped_chapters > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">跳过章节</span>
                      <span className="font-semibold text-yellow-600">{taskStatus.stats.skipped_chapters}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">总任务数</span>
                    <span className="font-semibold text-gray-900">{taskStatus.stats.total_tasks || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">已完成任务</span>
                    <span className="font-semibold text-green-600">{taskStatus.stats.completed_tasks || 0}</span>
                  </div>
                  {taskStatus.stats.failed_tasks > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">失败任务</span>
                      <span className="font-semibold text-red-600">{taskStatus.stats.failed_tasks}</span>
                    </div>
                  )}
                  {taskStatus.stats.skipped_tasks > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">跳过任务</span>
                      <span className="font-semibold text-yellow-600">{taskStatus.stats.skipped_tasks}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudyProgress;
