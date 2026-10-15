/**
 * 章节选择纯函数的边界用例。
 *
 * 运行：npm test（等价于 node --test tests/）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MODE_ALL,
  MODE_CUSTOM,
  dedupe,
  normalizeSelection,
  chapterIds,
  toggleOne,
  selectAll,
  selectNone,
  selectUnfinished,
  invertSelection,
  applyRange,
  countSelected,
  findMissingIds,
  summarizeSelection,
  switchMode,
} from '../src/lib/chapter-selection.js';

const chapters = [
  { id: 1, title: '第一章', has_finished: true },
  { id: 2, title: '第二章', has_finished: false },
  { id: 3, title: '第三章', has_finished: false },
  { id: 4, title: '第四章', has_finished: true },
  { id: 5, title: '第五章', has_finished: false },
];

test('dedupe：去重、转字符串、丢空值', () => {
  assert.deepEqual(dedupe([1, '1', '2', '', null, undefined, ' 3 ']), ['1', '2', '3']);
  assert.deepEqual(dedupe(undefined), []);
});

test('normalizeSelection：非法输入回退到全部章节', () => {
  assert.deepEqual(normalizeSelection(undefined), { mode: MODE_ALL, ids: [] });
  assert.deepEqual(normalizeSelection({ mode: 'bogus', ids: 'x' }), { mode: MODE_ALL, ids: [] });
  assert.deepEqual(normalizeSelection({ mode: MODE_CUSTOM, ids: [1, 1, 2] }), {
    mode: MODE_CUSTOM,
    ids: ['1', '2'],
  });
});

test('toggleOne：追加 / 移除 / 不改动原数组', () => {
  const ids = ['1'];
  assert.deepEqual(toggleOne(ids, '2'), ['1', '2']);
  assert.deepEqual(toggleOne(ids, '1'), []);
  assert.deepEqual(ids, ['1'], '不应修改入参数组');
});

test('selectAll / selectNone / selectUnfinished', () => {
  assert.deepEqual(selectAll(chapters), ['1', '2', '3', '4', '5']);
  assert.deepEqual(selectNone(), []);
  assert.deepEqual(selectUnfinished(chapters), ['2', '3', '5']);
  assert.deepEqual(selectAll([]), []);
});

test('invertSelection：只返回未选中的章节', () => {
  assert.deepEqual(invertSelection(['1', '2'], chapters), ['3', '4', '5']);
  assert.deepEqual(invertSelection(selectAll(chapters), chapters), []);
  assert.deepEqual(invertSelection([], chapters), ['1', '2', '3', '4', '5']);
});

test('applyRange：有效区间按序号切片', () => {
  assert.deepEqual(applyRange(chapters, '2', '4'), { ids: ['2', '3', '4'], range: [2, 4] });
  assert.deepEqual(applyRange(chapters, '1', '1'), { ids: ['1'], range: [1, 1] });
});

test('applyRange：结束章号留空表示到最后一章', () => {
  assert.deepEqual(applyRange(chapters, '4', ''), { ids: ['4', '5'], range: [4, 5] });
});

test('applyRange：起始 > 结束时报错且不返回选择集', () => {
  const result = applyRange(chapters, '5', '2');
  assert.ok(result.error && result.error.includes('不能大于'), JSON.stringify(result));
  assert.equal(result.ids, undefined);
});

test('applyRange：越界与空列表报错', () => {
  assert.match(applyRange(chapters, '0', '2').error, /起始章号/);
  assert.match(applyRange(chapters, '1', '9').error, /结束章号/);
  assert.match(applyRange([], '1', '2').error, /章节列表为空/);
  assert.match(applyRange(chapters, '', '').error, /请输入起始章号/);
});

test('countSelected / findMissingIds：只统计当前存在的章节', () => {
  assert.equal(countSelected(['1', '99'], chapters), 1);
  assert.deepEqual(findMissingIds(['1', '99', 'abc'], chapters), ['99', 'abc']);
  assert.deepEqual(findMissingIds([], chapters), []);
});

test('summarizeSelection：全部章节 / 已选 X 共 Y / 失效提示', () => {
  assert.equal(summarizeSelection({ mode: MODE_ALL, ids: [] }, chapters), '全部章节');
  assert.equal(summarizeSelection({ mode: MODE_CUSTOM, ids: ['1', '2'] }, chapters), '已选 2 / 5 章');
  assert.equal(
    summarizeSelection({ mode: MODE_CUSTOM, ids: ['1', '99'] }, chapters),
    '已选 1 / 5 章（1 个失效）'
  );
  assert.equal(summarizeSelection({ mode: MODE_CUSTOM, ids: ['a', 'b'] }, []), '已选 2 章');
});

test('switchMode：已处于目标模式时返回 null（幂等）', () => {
  assert.equal(switchMode(MODE_CUSTOM, { mode: MODE_CUSTOM, ids: [] }, chapters), null);
  assert.equal(switchMode(MODE_ALL, { mode: MODE_ALL, ids: [] }, chapters), null);
  assert.equal(switchMode(MODE_ALL, undefined, chapters), null);
});

test('switchMode：切到自定义时默认全选并标记 defaultedToAll', () => {
  const result = switchMode(MODE_CUSTOM, { mode: MODE_ALL, ids: [] }, chapters);
  assert.equal(result.defaultedToAll, true);
  assert.deepEqual(result.next, { mode: MODE_CUSTOM, ids: ['1', '2', '3', '4', '5'] });
});

test('switchMode：已有选择集时保留，不触发默认全选', () => {
  const result = switchMode(MODE_CUSTOM, { mode: MODE_CUSTOM, ids: ['2'] }, chapters);
  // 已是 custom -> null；这里构造一个 mode=all 但带 ids 的非法组合
  assert.equal(result, null);
  const fromAll = switchMode(MODE_CUSTOM, { mode: MODE_ALL, ids: ['2'] }, chapters);
  assert.equal(fromAll.defaultedToAll, false);
  assert.deepEqual(fromAll.next.ids, ['2']);
});

test('switchMode：切回全部章节时清空 ids', () => {
  const result = switchMode(MODE_ALL, { mode: MODE_CUSTOM, ids: ['1', '2'] }, chapters);
  assert.deepEqual(result.next, { mode: MODE_ALL, ids: [] });
});

test('chapterIds：统一转字符串', () => {
  assert.deepEqual(chapterIds(chapters), ['1', '2', '3', '4', '5']);
  assert.deepEqual(chapterIds(undefined), []);
});
