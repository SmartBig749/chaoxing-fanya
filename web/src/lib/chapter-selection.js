/**
 * 章节选择算法的纯函数实现。
 *
 * value 形态：{ mode: 'all' | 'custom', ids: string[] }
 *   - mode === 'all'    学习该课程全部章节（默认行为）
 *   - mode === 'custom' 只学习 ids 中列出的章节（ids 为空表示该课程不学任何章节）
 *
 * 组件只负责调用这些函数，边界行为集中在这里，便于单测覆盖。
 */

export const MODE_ALL = 'all';
export const MODE_CUSTOM = 'custom';

/** 去重并转成字符串，丢掉空白值 */
export const dedupe = (list) => {
  const out = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((item) => {
    const key = String(item ?? '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  });
  return out;
};

/** 统一成 { mode, ids } 结构，非法输入回退到「全部章节」 */
export const normalizeSelection = (value) => {
  const mode = value?.mode === MODE_CUSTOM ? MODE_CUSTOM : MODE_ALL;
  const ids = Array.isArray(value?.ids) ? value.ids : [];
  return { mode, ids: dedupe(ids) };
};

export const chapterIds = (chapters) => (chapters || []).map((c) => String(c.id));

export const toggleOne = (ids, id) => {
  const key = String(id);
  const current = dedupe(ids);
  return current.includes(key) ? current.filter((x) => x !== key) : [...current, key];
};

export const selectAll = (chapters) => chapterIds(chapters);

export const selectNone = () => [];

export const selectUnfinished = (chapters) =>
  (chapters || []).filter((c) => !c.has_finished).map((c) => String(c.id));

export const invertSelection = (ids, chapters) => {
  const current = new Set(dedupe(ids));
  return chapterIds(chapters).filter((id) => !current.has(id));
};

/**
 * 应用「第 from 章 至 第 to 章」范围选择。
 *
 * 返回 { ids, range } 或 { error }：非法区间不会改动当前选择集，只给可读原因。
 * 结束章号留空表示「到最后一章」。
 */
export const applyRange = (chapters, from, to) => {
  const list = chapters || [];
  const total = list.length;
  if (!total) return { error: '章节列表为空，无法应用范围' };

  const fromNum = parseInt(from, 10);
  const toNum = parseInt(to, 10);
  const hasFrom = !Number.isNaN(fromNum);
  const hasTo = !Number.isNaN(toNum);

  if (!hasFrom && !hasTo) return { error: '请输入起始章号' };

  const start = hasFrom ? fromNum : 1;
  const end = hasTo ? toNum : total;

  if (start < 1 || start > total) return { error: `起始章号需在 1 - ${total} 之间` };
  if (end < 1 || end > total) return { error: `结束章号需在 1 - ${total} 之间` };
  if (start > end) return { error: `起始章号（${start}）不能大于结束章号（${end}）` };

  return {
    ids: list.slice(start - 1, end).map((c) => String(c.id)),
    range: [start, end],
  };
};

/** 已选数量（只统计当前确实存在的章节） */
export const countSelected = (ids, chapters) => {
  const set = new Set(dedupe(ids));
  return (chapters || []).filter((c) => set.has(String(c.id))).length;
};

/** 选中、但已不在章节列表里的 id（课程内容变化后可能出现） */
export const findMissingIds = (ids, chapters) => {
  const known = new Set(chapterIds(chapters));
  return dedupe(ids).filter((id) => !known.has(id));
};

/** 折叠态摘要：「已选 X / 共 Y 章」，失效选择单独提示 */
export const summarizeSelection = (value, chapters) => {
  const selection = normalizeSelection(value);
  if (selection.mode !== MODE_CUSTOM) return '全部章节';

  const total = (chapters || []).length;
  const chosen = countSelected(selection.ids, chapters);
  const missing = findMissingIds(selection.ids, chapters).length;

  if (!total) return `已选 ${selection.ids.length} 章`;
  return missing ? `已选 ${chosen} / ${total} 章（${missing} 个失效）` : `已选 ${chosen} / ${total} 章`;
};

/**
 * 切换模式。
 *
 * - 已经处于目标模式时返回 null（幂等：重复点击不改变选择集）
 * - 从「全部章节」切到「自定义」且尚未选择任何章节时，默认保留全选，
 *   返回值里的 defaultedToAll 用于提示用户「已默认全选，请按需取消」
 */
export const switchMode = (mode, value, chapters) => {
  const selection = normalizeSelection(value);
  if (selection.mode === mode) return null;

  if (mode === MODE_ALL) {
    return { next: { mode: MODE_ALL, ids: [] }, defaultedToAll: false };
  }

  const defaultedToAll = selection.ids.length === 0;
  return {
    next: {
      mode: MODE_CUSTOM,
      ids: defaultedToAll ? chapterIds(chapters) : selection.ids,
    },
    defaultedToAll,
  };
};
