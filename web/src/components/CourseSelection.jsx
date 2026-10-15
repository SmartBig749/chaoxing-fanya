import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './ui/Card';
import Button from './ui/Button';
import Input from './ui/Input';
import Select from './ui/Select';
import Field from './ui/Field';
import { Play, Loader2, BookOpen, Settings, LogOut, ChevronDown, ChevronUp, AlertTriangle, RefreshCw } from 'lucide-react';
import api from '../api/axios';
import { redactAxiosError } from '../lib/redact';
import AdvancedSettings from './AdvancedSettings';
import ChapterSelector from './ChapterSelector';
import { findMissingIds, summarizeSelection } from '../lib/chapter-selection';

const SPEED_RANGE = { min: 1, max: 2 };
const JOBS_RANGE = { min: 1, max: 10 };

const NOTOPEN_OPTIONS = [
  { value: 'retry', label: '重试' },
  { value: 'ask', label: '询问' },
  { value: 'continue', label: '跳过' },
];

const CourseSelection = ({
  userInfo,
  sessionId,
  runningTaskId,
  onOpenProgress,
  onStartStudy,
  onLogout,
}) => {
  const [courses, setCourses] = useState([]);
  const [selectedCourses, setSelectedCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('保存结果会显示在这里');
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const [startError, setStartError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [runningStatus, setRunningStatus] = useState(null);
  const [settings, setSettings] = useState({
    speed: 1.0,
    jobs: 4,
    notopen_action: 'retry',
    tiku_config: {},
    notification_config: {},
    ocr_config: {},
  });

  // 章节选择：{ [courseId]: { mode: 'all' | 'custom', ids: string[] } }
  // 未出现的课程按「全部章节」处理
  const [chapterSelection, setChapterSelection] = useState({});
  const [chaptersByCourse, setChaptersByCourse] = useState({});
  const [chapterLoading, setChapterLoading] = useState({});
  const [chapterError, setChapterError] = useState({});
  const [expandedCourse, setExpandedCourse] = useState(null);

  const fetchConfig = useCallback(async () => {
    try {
      const response = await api.get('/config');
      if (response.data?.status && response.data.data) {
        const cfg = response.data.data;
        if (cfg.settings) {
          setSettings((prev) => ({ ...prev, ...cfg.settings }));
        }
        if (Array.isArray(cfg.selectedCourses)) {
          setSelectedCourses(cfg.selectedCourses);
        }
        if (cfg.chapterSelection && typeof cfg.chapterSelection === 'object') {
          setChapterSelection(cfg.chapterSelection);
        }
      }
    } catch (err) {
      console.error('加载已保存配置失败:', redactAxiosError(err));
    }
  }, []);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await api.post('/courses', { session_id: sessionId });
      if (response.data?.status) {
        setCourses(Array.isArray(response.data.data) ? response.data.data : []);
      } else {
        setLoadError(response.data?.msg || '获取课程列表失败');
      }
    } catch (err) {
      console.error('获取课程列表失败:', redactAxiosError(err));
      setLoadError(err?.response?.data?.msg || '获取课程列表失败，请确认登录状态或稍后重试');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchConfig();
    fetchCourses();
  }, [fetchConfig, fetchCourses]);

  // 课程页上显示后台任务入口（返回课程页后仍可回到进度页）
  useEffect(() => {
    if (!runningTaskId) {
      setRunningStatus(null);
      return undefined;
    }
    let cancelled = false;
    api
      .get(`/task/${runningTaskId}`)
      .then((res) => {
        if (!cancelled) setRunningStatus(res.data?.status ? res.data.data : null);
      })
      .catch(() => {
        if (!cancelled) setRunningStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [runningTaskId]);

  const toggleCourse = (courseId) => {
    setSelectedCourses((prev) =>
      prev.includes(courseId) ? prev.filter((id) => id !== courseId) : [...prev, courseId]
    );
  };

  // 惰性加载某门课程的章节列表
  const fetchChapters = async (course) => {
    const courseId = course.courseId;
    setChapterLoading((prev) => ({ ...prev, [courseId]: true }));
    setChapterError((prev) => ({ ...prev, [courseId]: '' }));
    try {
      const response = await api.post('/chapters', {
        session_id: sessionId,
        course,
      });
      if (response.data?.status) {
        setChaptersByCourse((prev) => ({
          ...prev,
          [courseId]: response.data.data?.chapters || [],
        }));
      } else {
        setChapterError((prev) => ({
          ...prev,
          [courseId]: response.data?.msg || '接口返回异常',
        }));
      }
    } catch (err) {
      console.error('获取章节列表失败:', redactAxiosError(err));
      setChapterError((prev) => ({
        ...prev,
        [courseId]: err?.response?.data?.msg || err.message || '请求失败',
      }));
    } finally {
      setChapterLoading((prev) => ({ ...prev, [courseId]: false }));
    }
  };

  const toggleExpand = (course) => {
    const courseId = course.courseId;
    const next = expandedCourse === courseId ? null : courseId;
    setExpandedCourse(next);
    if (next && !chaptersByCourse[courseId] && !chapterLoading[courseId]) {
      fetchChapters(course);
    }
  };

  const setChapterValue = (courseId, value) => {
    setChapterSelection((prev) => ({ ...prev, [courseId]: value }));
  };

  // 生效的课程列表（不选课程时代表全部课程）
  const effectiveCourseIds =
    selectedCourses.length > 0 ? selectedCourses : courses.map((c) => c.courseId);

  // 有多少门课程使用了「自定义章节」
  const customChapterCourseCount = effectiveCourseIds.filter((courseId) => {
    const sel = chapterSelection[courseId];
    return sel && sel.mode === 'custom';
  }).length;

  /**
   * 数值输入：清空或非法输入时保留上一个有效值，不再把 NaN/null 传给后端。
   * 越界值在失焦时夹取并给出字段级提示，避免输入过程中被打断。
   */
  const handleNumberChange = (field, raw) => {
    if (raw === '') return;
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed)) return;
    setSettings((prev) => ({ ...prev, [field]: parsed }));
    setFieldErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const handleNumberBlur = (field, { min, max, integer = false }) => {
    const current = Number(settings[field]);
    let value = Number.isFinite(current) ? current : min;
    if (integer) value = Math.round(value);
    const clamped = Math.min(max, Math.max(min, value));

    if (clamped !== settings[field]) {
      setSettings((prev) => ({ ...prev, [field]: clamped }));
      setFieldErrors((prev) => ({ ...prev, [field]: `已调整为允许范围 ${min} - ${max}` }));
    }
  };

  const validateBeforeStart = () => {
    if (loadError) return '课程列表加载失败，请先点击重试';
    if (courses.length === 0) return '没有可学习的课程，请先重新加载课程列表';
    if (effectiveCourseIds.length === 0) return '请至少选择一门课程';

    const speed = Number(settings.speed);
    const jobs = Number(settings.jobs);
    if (!Number.isFinite(speed) || speed < SPEED_RANGE.min || speed > SPEED_RANGE.max) {
      return `播放倍速需在 ${SPEED_RANGE.min}.0 - ${SPEED_RANGE.max}.0 之间`;
    }
    if (!Number.isInteger(jobs) || jobs < JOBS_RANGE.min || jobs > JOBS_RANGE.max) {
      return `并发章节数需在 ${JOBS_RANGE.min} - ${JOBS_RANGE.max} 之间`;
    }
    return '';
  };

  const handleStartStudy = async () => {
    // 防重入用 ref 而非 state：同一事件循环内的连续点击拿到的仍是旧 state，
    // 只用 state 守卫会漏掉同步连点（实测能起两个并发任务）。
    if (startingRef.current) return;

    const problem = validateBeforeStart();
    if (problem) {
      setStartError(problem);
      return;
    }

    startingRef.current = true;
    setStartError('');
    setStarting(true);
    try {
      // 启动任务时自动持久化当前配置，无需手动点保存（失败不阻塞启动）
      api.post('/config', { settings, selectedCourses, chapterSelection }).catch((err) => {
        console.error('自动保存配置失败:', redactAxiosError(err));
      });

      await onStartStudy({
        ...settings,
        course_list: effectiveCourseIds,
        chapter_selection: chapterSelection,
      });
    } catch (err) {
      console.error('启动学习任务失败:', redactAxiosError(err));
      setStartError(err?.response?.data?.msg || err?.message || '启动学习任务失败，请重试');
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  };

  const handleSaveConfig = async () => {
    try {
      setSaving(true);
      setSaveStatus('');
      const response = await api.post('/config', { settings, selectedCourses, chapterSelection });
      if (!response.data?.status) {
        setSaveStatus(response.data?.msg || '保存失败');
      } else {
        setSaveStatus('保存成功');
      }
    } catch (err) {
      console.error('保存配置请求失败:', redactAxiosError(err));
      setSaveStatus(err?.response?.data?.msg || '保存请求失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" aria-hidden="true" />
          <p className="text-muted-foreground">加载课程列表中...</p>
        </div>
      </div>
    );
  }

  const startDisabled = starting || courses.length === 0 || !!loadError;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">课程管理</h1>
            <p className="text-muted-foreground mt-1">选择要学习的课程并配置学习参数</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              当前账号：
              <span className="font-medium text-gray-900">
                {userInfo?.username || (userInfo?.useCookies ? '（Cookie 登录）' : '未知')}
              </span>
            </span>
            <Button variant="outline" onClick={onLogout}>
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
              退出登录
            </Button>
          </div>
        </div>

        {runningStatus && onOpenProgress && (
          <Card className="mb-6 border-blue-200 bg-blue-50">
            <CardContent className="pt-6 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center text-sm text-blue-800">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                有学习任务正在后台运行（{runningStatus.status === 'completed' ? '已完成' : runningStatus.status === 'error' ? '已出错' : '学习中'}）
              </div>
              <Button variant="outline" onClick={onOpenProgress}>
                查看进度
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BookOpen className="mr-2 h-5 w-5" aria-hidden="true" />
                  课程列表
                </CardTitle>
                <CardDescription>
                  选择要自动学习的课程（不选择将学习所有课程）；选中课程后可展开「选择章节」指定要学习的章节
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadError && (
                  <div
                    role="alert"
                    className="mb-4 flex items-start justify-between gap-3 p-4 rounded-lg bg-destructive/10 text-sm"
                  >
                    <span className="flex items-start text-destructive">
                      <AlertTriangle className="w-4 h-4 mr-2 mt-0.5 shrink-0" aria-hidden="true" />
                      课程列表加载失败：{loadError}
                    </span>
                    <Button variant="outline" size="sm" onClick={fetchCourses}>
                      <RefreshCw className="w-3 h-3 mr-1" aria-hidden="true" />
                      重试
                    </Button>
                  </div>
                )}

                {!loadError && courses.length === 0 && (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    <p>当前账号下没有读取到任何课程。</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={fetchCourses}>
                      <RefreshCw className="w-3 h-3 mr-1" aria-hidden="true" />
                      重新加载
                    </Button>
                  </div>
                )}

                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {courses.map((course) => {
                    const isSelected = selectedCourses.includes(course.courseId);
                    const isExpanded = expandedCourse === course.courseId;
                    const chapterValue =
                      chapterSelection[course.courseId] || { mode: 'all', ids: [] };
                    const chapters = chaptersByCourse[course.courseId] || [];
                    const missingCount =
                      chapterValue.mode === 'custom' ? findMissingIds(chapterValue.ids, chapters).length : 0;

                    return (
                      <div
                        key={course.courseId}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {/* 可点击卡片：补 role/aria/tabIndex/keydown，让键盘与读屏都能操作 */}
                        <div
                          role="checkbox"
                          aria-checked={isSelected}
                          aria-label={`选择课程 ${course.title}`}
                          tabIndex={0}
                          className="cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          onClick={() => toggleCourse(course.courseId)}
                          onKeyDown={(e) => {
                            if (e.key === ' ' || e.key === 'Enter') {
                              e.preventDefault();
                              toggleCourse(course.courseId);
                            }
                          }}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="font-semibold text-gray-900">{course.title}</h3>
                              <p className="text-sm text-muted-foreground mt-1">
                                课程ID: {course.courseId}
                              </p>
                            </div>
                            <div
                              aria-hidden="true"
                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                isSelected ? 'border-primary bg-primary' : 'border-gray-300'
                              }`}
                            >
                              {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
                            </div>
                          </div>
                        </div>

                        {/* 章节选择入口：仅对已选中的课程展示 */}
                        {isSelected && (
                          <div className="mt-3 pt-3 border-t border-primary/20">
                            <button
                              type="button"
                              className="flex items-center w-full text-xs text-primary hover:underline"
                              aria-expanded={isExpanded}
                              aria-controls={`chapter-panel-${course.courseId}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpand(course);
                              }}
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                              )}
                              {isExpanded ? '收起章节选择' : '选择章节'}
                              <span className="ml-2 text-muted-foreground">
                                {summarizeSelection(chapterValue, chapters)}
                              </span>
                              {missingCount > 0 && (
                                <span className="ml-2 flex items-center text-amber-600">
                                  <AlertTriangle className="w-3 h-3 mr-0.5" aria-hidden="true" />
                                  {missingCount} 个失效
                                </span>
                              )}
                            </button>

                            {isExpanded && (
                              <div
                                id={`chapter-panel-${course.courseId}`}
                                className="mt-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ChapterSelector
                                  courseId={course.courseId}
                                  chapters={chapters}
                                  loading={!!chapterLoading[course.courseId]}
                                  error={chapterError[course.courseId] || ''}
                                  value={chapterValue}
                                  onChange={(v) => setChapterValue(course.courseId, v)}
                                  onReload={() => fetchChapters(course)}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Settings className="mr-2 h-5 w-5" aria-hidden="true" />
                  学习配置
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field
                  id="speed"
                  label="播放倍速"
                  hint="范围: 1.0 - 2.0"
                  error={fieldErrors.speed}
                >
                  <Input
                    id="speed"
                    type="number"
                    min={SPEED_RANGE.min}
                    max={SPEED_RANGE.max}
                    step="0.1"
                    value={settings.speed}
                    aria-invalid={fieldErrors.speed ? true : undefined}
                    onChange={(e) => handleNumberChange('speed', e.target.value)}
                    onBlur={() => handleNumberBlur('speed', SPEED_RANGE)}
                  />
                </Field>

                <Field
                  id="jobs"
                  label="并发章节数"
                  hint="同时处理的章节数量"
                  error={fieldErrors.jobs}
                >
                  <Input
                    id="jobs"
                    type="number"
                    min={JOBS_RANGE.min}
                    max={JOBS_RANGE.max}
                    value={settings.jobs}
                    aria-invalid={fieldErrors.jobs ? true : undefined}
                    onChange={(e) => handleNumberChange('jobs', e.target.value)}
                    onBlur={() => handleNumberBlur('jobs', { ...JOBS_RANGE, integer: true })}
                  />
                </Field>

                <Field id="notopen" label="未开放章节处理">
                  <Select
                    id="notopen"
                    options={NOTOPEN_OPTIONS}
                    value={settings.notopen_action}
                    onChange={(e) => setSettings({ ...settings, notopen_action: e.target.value })}
                  />
                </Field>

                <div className="pt-4 border-t">
                  <AdvancedSettings settings={settings} onChange={setSettings} />
                </div>
              </CardContent>
              <CardFooter className="flex flex-col space-y-2">
                {startError && (
                  <p role="alert" className="w-full text-xs text-destructive text-center">
                    {startError}
                  </p>
                )}
                <Button
                  className="w-full"
                  onClick={handleStartStudy}
                  disabled={startDisabled}
                  aria-busy={starting}
                >
                  {starting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      启动中...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" aria-hidden="true" />
                      开始学习
                    </>
                  )}
                </Button>
                {startDisabled && !starting && (
                  <p className="text-xs text-muted-foreground text-center">
                    {loadError
                      ? '课程列表加载失败，无法启动'
                      : courses.length === 0
                        ? '没有可用课程，无法启动'
                        : ''}
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full text-xs"
                  onClick={handleSaveConfig}
                  disabled={saving}
                >
                  {saving ? '保存中...' : '保存当前配置'}
                </Button>
                <p role="status" aria-live="polite" className="text-xs text-muted-foreground text-center">
                  {saveStatus}
                </p>
              </CardFooter>
            </Card>

            <Card className="mt-4">
              <CardContent className="pt-6">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">总课程数:</span>
                    <span className="font-semibold">{courses.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">已选择:</span>
                    <span className="font-semibold">
                      {selectedCourses.length > 0 ? selectedCourses.length : '全部'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">章节选择:</span>
                    <span className="font-semibold">
                      {customChapterCourseCount > 0
                        ? `${customChapterCourseCount} 门自定义`
                        : '全部章节'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CourseSelection;
