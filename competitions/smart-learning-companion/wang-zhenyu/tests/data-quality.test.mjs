import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRecord } from '../src/data-quality.mjs';

const q017 = {
  '材料编号': 'Q017', '主题编号': 'T01', '指标编号': 'T01I2', '满分': '1', '参考答案': '-3x²y'
};
const q038 = {
  '材料编号': 'Q038', '主题编号': 'T03', '指标编号': 'T03I1', '满分': '1', '参考答案': 'x≤5'
};
const n01 = { '节点编号': 'N01', '可用题目编号': 'Q017' };

function rawRecord(overrides = {}) {
  return {
    '记录编号': 'SYN-001', '材料编号': 'Q017', '主题编号': 'T01', '节点编号': 'N01',
    '评分状态': '已评分', '得分': '0', '满分': '1', '学生最终作答': '-3x²y',
    '评分点得分': 'Q017P1=0', ...overrides
  };
}

test('与参考答案一致但评分点为零时保留原0分并只进入复核', () => {
  const audit = auditRecord(rawRecord(), q017, n01);
  assert.equal(audit.resolvedScore, 0);
  assert.equal(audit.scoreSource, 'original');
  assert.equal(audit.reviewRequired, true);
  assert.deepEqual(audit.issueCodes, ['answer_key_zero_conflict']);
});

test('总分与有效评分点合计冲突时使用评分点合计且标记复核', () => {
  const audit = auditRecord(rawRecord({ '记录编号': 'SYN-002', '得分': '3', '评分点得分': 'Q017P1=1' }), q017, n01);
  assert.equal(audit.resolvedScore, 1);
  assert.equal(audit.scoreSource, 'point_sum');
  assert.equal(audit.reviewRequired, true);
  assert.deepEqual(audit.issueCodes, ['score_out_of_range', 'score_point_conflict']);
});

test('节点范围冲突保留原节点，不按日期或题号自动迁移', () => {
  const audit = auditRecord(rawRecord({
    '记录编号': 'SYN-003', '材料编号': 'Q038', '主题编号': 'T03', '学生最终作答': 'x≤5', '评分点得分': 'Q038P1=1', '得分': '1'
  }), q038, n01);
  assert.equal(audit.nodeId, 'N01');
  assert.equal(audit.reviewRequired, true);
  assert.deepEqual(audit.issueCodes, ['node_scope_conflict']);
});


test('未知评分点不能作为自动纠分依据', () => {
  const question = {
    ...q017,
    '评分点': 'Q017P1 答案正确 1分',
  };
  const audit = auditRecord(rawRecord({
    '记录编号': 'SYN-004',
    '得分': '3',
    '评分点得分': 'UNKNOWN_POINT=1',
  }), question, n01);
  assert.equal(audit.reviewRequired, true);
  assert.ok(audit.issueCodes.includes('invalid_point_scores'));
  assert.equal(audit.scoreSource, 'review_required');
  assert.equal(audit.resolvedScore, null);
});


test('尾随非评分文本不能被当作有效评分片段', () => {
  const question = {
    ...q017,
    '评分点': 'Q017P1 答案正确 1分',
  };
  const audit = auditRecord(rawRecord({
    '记录编号': 'SYN-005',
    '得分': '0',
    '评分点得分': 'Q017P1=0junk',
  }), question, n01);
  assert.equal(audit.reviewRequired, true);
  assert.ok(audit.issueCodes.includes('invalid_point_scores'));
});
