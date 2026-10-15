import React, { useEffect, useMemo, useState } from 'react';
import Button from './ui/Button';
import Input from './ui/Input';
import Checkbox from './ui/Checkbox';
import {
  ListChecks,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import {
  MODE_ALL,
  MODE_CUSTOM,
  normalizeSelection,
  toggleOne,
  selectAll,
  selectNone,
  selectUnfinished,
  invertSelection,
  applyRange,
  countSelected,
  findMissingIds,
  switchMode,
} from '../lib/chapter-selection';

/**
 * 章节选择器
 *
 * value 形态：{ mode: 'all' | 'custom', ids: string[] }
 *   - mode === 'all'    学习该课程全部章节（默认行为）
 *   - mode === 'custom' 只学习 ids 中列出的章节（ids 为空表示该课程不学任何章节）
 *
 * 选择算法全部来自 lib/chapter-selection.js 的纯函数，组件只负责交互与呈现。
 */
const ChapterSelector = ({
  courseId,
  chapters = [],
  loading = false,
  error = '',
  value,
  onChange,
  onReload,
}) => {
  const selection = useMemo(() => normalizeSelection(value), [value]);
  const ids = selection.ids;
  const selectedSet = useMemo(() => new Set(ids), [ids]);

  const [rangeFrom, setRangeFrom] = useState('1');
  const [rangeTo, setRangeTo] = useState('');
  const [rangeError, setRangeError] = useState('');
  const [hint, setHint] = useState('');

  const total = chapters.length;
  const selectedCount = countSelected(ids, chapters);
  const missingIds = findMissingIds(ids, chapters);

  // 切换课程时重置范围输入与提示，避免上一门课程的章号与提示残留
  useEffect(() => {
    setRangeFrom('1');
    setRangeTo('');
    setRangeError('');
    setHint('');
  }, [courseId]);

  const emit = (nextIds) => onChange({ mode: MODE_CUSTOM, ids: nextIds });

  const handleModeChange = (nextMode) => {
    const result = switchMode(nextMode, selection, chapters);
    if (!result) {
      // 已经处于该模式：直接返回，重复点击不会把选择集改掉（幂等）
      return;
    }
    setRangeError('');
    setHint(result.defaultedToAll ? '已默认选中全部章节，请按需取消' : '');
    onChange(result.next);
  };

  const handleApplyRange = () => {
    const result = applyRange(chapters, rangeFrom, rangeTo);
    if (result.error) {
      // 非法区间只提示、不改动当前选择集
      setRangeError(result.error);
      return;
    }
    setRangeError('');
    setHint('');
    emit(result.ids);
  };

  const quickBtn = 'text-xs h-8 px-2.5';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        正在加载章节列表...
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-3 py-4 px-3 rounded-md bg-destructive/10 text-sm"
      >
        <span className="flex items-center text-destructive">
          <AlertTriangle className="w-4 h-4 mr-2 shrink-0" />
          章节加载失败：{error}
        </span>
        {onReload && (
          <Button variant="outline" size="sm" onClick={onReload}>
            <RefreshCw className="w-3 h-3 mr-1" />
            重试
          </Button>
        )}
      </div>
    );
  }

  if (!total) {
    return (
      <div className="py-4 text-sm text-muted-foreground text-center">
        该课程未读取到章节列表
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 模式切换 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center text-sm font-medium text-gray-900">
          <ListChecks className="w-4 h-4 mr-1.5" aria-hidden="true" />
          学习章节
        </div>
        <div className="flex rounded-md border border-input overflow-hidden" role="group" aria-label="章节选择模式">
          <button
            type="button"
            aria-pressed={selection.mode === MODE_ALL}
            className={`px-3 h-8 text-xs transition-colors ${
              selection.mode === MODE_ALL
                ? 'bg-primary text-primary-foreground'
                : 'bg-background hover:bg-accent'
            }`}
            onClick={() => handleModeChange(MODE_ALL)}
          >
            全部章节
          </button>
          <button
            type="button"
            aria-pressed={selection.mode === MODE_CUSTOM}
            className={`px-3 h-8 text-xs transition-colors ${
              selection.mode === MODE_CUSTOM
                ? 'bg-primary text-primary-foreground'
                : 'bg-background hover:bg-accent'
            }`}
            onClick={() => handleModeChange(MODE_CUSTOM)}
          >
            自定义选择
          </button>
        </div>
      </div>

      {selection.mode === MODE_ALL ? (
        <p className="text-xs text-muted-foreground">
          将学习该课程全部 <span className="font-semibold">{total}</span> 章（已完成的章节会自动跳过）
        </p>
      ) : (
        <>
          {hint && (
            <p role="status" className="text-xs text-blue-600">
              {hint}
            </p>
          )}

          {/* 快捷操作 */}
          <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" className={quickBtn} onClick={() => emit(selectAll(chapters))}>
              全选
            </Button>
            <Button variant="outline" className={quickBtn} onClick={() => emit(selectNone())}>
              全不选
            </Button>
            <Button variant="outline" className={quickBtn} onClick={() => emit(selectUnfinished(chapters))}>
              只选未完成
            </Button>
            <Button variant="outline" className={quickBtn} onClick={() => emit(invertSelection(ids, chapters))}>
              反选
            </Button>
          </div>

          {/* 范围快捷 */}
          <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
            <span>范围：第</span>
            <Input
              type="number"
              min="1"
              max={total}
              aria-label="起始章号"
              aria-invalid={rangeError ? true : undefined}
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
              className="h-8 w-16 px-2 text-xs"
            />
            <span>章 至 第</span>
            <Input
              type="number"
              min="1"
              max={total}
              aria-label="结束章号"
              aria-invalid={rangeError ? true : undefined}
              placeholder={String(total)}
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
              className="h-8 w-16 px-2 text-xs"
            />
            <span>章</span>
            <Button variant="outline" className={quickBtn} onClick={handleApplyRange}>
              应用范围
            </Button>
          </div>

          {rangeError && (
            <p role="alert" className="text-xs text-destructive">
              {rangeError}
            </p>
          )}

          {/* 统计 */}
          <div className="flex items-center justify-between text-xs flex-wrap gap-2">
            <span className="text-muted-foreground">
              已选 <span className="font-semibold text-gray-900">{selectedCount}</span> / 共 {total} 章
            </span>
            {selectedCount === 0 && (
              <span className="flex items-center text-destructive" role="status">
                <AlertTriangle className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                未选择任何章节，该课程将被跳过
              </span>
            )}
          </div>

          {missingIds.length > 0 && (
            <p role="status" className="text-xs text-amber-600">
              有 {missingIds.length} 个已保存的章节在最新章节列表中不存在，建议重新勾选
            </p>
          )}

          {/* 章节列表 */}
          <div
            className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1"
            role="group"
            aria-label={`章节列表，共 ${total} 章`}
          >
            {chapters.map((chapter, index) => {
              const key = String(chapter.id);
              const checked = selectedSet.has(key);
              const inputId = `chapter-${courseId ?? 'course'}-${key || index}`;
              return (
                <Checkbox
                  key={key || index}
                  id={inputId}
                  checked={checked}
                  onChange={() => emit(toggleOne(ids, key))}
                  className={`items-start p-2.5 rounded-md border transition-colors ${
                    checked ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="block">
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground shrink-0">第{index + 1}章</span>
                      <span className="text-sm text-gray-900 truncate" title={chapter.title}>
                        {chapter.title}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5 mt-1">
                      {chapter.has_finished && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                          已完成
                        </span>
                      )}
                      {chapter.need_unlock && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                          需解锁
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {chapter.jobCount} 个任务点
                      </span>
                    </span>
                  </span>
                </Checkbox>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default ChapterSelector;
