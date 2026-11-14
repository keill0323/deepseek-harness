import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLearningPlan, collapseEvents, validatePlan } from '../src/recommendation-engine.mjs';

const questions = {
  Q041: { material_id: 'Q041', topic_id: 'T03', indicator_id: 'T03I1', type: '填空题', stem: '解不等式-2x>6', answer: 'x<-3', analysis: '除以负数反向', max_score: 1 },
  Q043: { material_id: 'Q043', topic_id: 'T03', indicator_id: 'T03I1', type: '解答题', stem: '解不等式-2x+3<11', answer: 'x>-4', analysis: '除以负数反向并检验', max_score: 3 },
  Q044: { material_id: 'Q044', topic_id: 'T03', indicator_id: 'T03I2', type: '选择题', stem: '数轴表示不等式组', answer: 'B', analysis: '端点开闭', max_score: 1 },
  Q023: { material_id: 'Q023', topic_id: 'T02', indicator_id: 'T02I1', type: '填空题', stem: '解方程2x-5=9', answer: 'x=7', analysis: '移项并检验', max_score: 1 },
  Q039: { material_id: 'Q039', topic_id: 'T03', indicator_id: 'T03I1', type: '填空题', stem: '解不等式x-3<2', answer: 'x<5', analysis: '移项', max_score: 1 }
};

function record(overrides = {}) {
  return {
    record_id: 'DR0023', event_id: 'D01-N02-Q043', revision: 2, student_id: 'D01', node_id: 'N02',
    item_id: 'Q043', topic_id: 'T03', indicator_id: 'T03I1', status: '已评分', score: 1, max_score: 3,
    answer: 'x<-4', steps: '-2x<8', point_scores: 'Q043P1=1；Q043P2=0；Q043P3=0', source_ref: 'DR0023', ...overrides
  };
}

test('同一作答事件只保留最高修订版本', () => {
  const items = [record({ record_id: 'DR0018', revision: 1, status: '待评分', score: null }), record({ revision: 2 })];
  const result = collapseEvents(items);
  assert.equal(result.length, 1);
  assert.equal(result[0].revision, 2);
  assert.equal(result[0].status, '已评分');
});

test('待评分不会被当成零分证据', () => {
  const plan = buildLearningPlan({
    student: { id: 'D90', class_id: 'DCX' },
    evidence: [record({ student_id: 'D90', status: '待评分', score: null, answer: 'x<-4' })],
    questions
  }, '2026-11-14T12:00:00+08:00');
  assert.equal(plan.plan_kind, 'coverage_probe');
  assert.equal(plan.evidence_used.length, 0);
  assert.match(plan.limitations.join(''), /待评分/);
});

test('Q043计划定位负系数反向，且学生提示不泄题', () => {
  const plan = buildLearningPlan({
    student: { id: 'D01', class_id: 'DC01' },
    evidence: [record()],
    questions,
    focus_indicator: 'T03I1',
    preferred_items: ['Q043', 'Q041', 'Q044']
  }, '2026-11-14T12:00:00+08:00');
  assert.equal(plan.primary_focus.indicator_id, 'T03I1');
  assert.equal(plan.steps[1].item_refs[0], 'Q043');
  assert.equal(validatePlan(plan).length, 0);
  const studentHints = plan.steps.flatMap((step) => step.hints).map((hint) => hint.text).join(' ');
  assert.equal(studentHints.includes('x>-4'), false);
  assert.equal(studentHints.includes('x<-4'), false);
  assert.equal(plan.teacher_explanation.some((item) => item.item_id === 'Q043'), true);
});

test('证据不足时生成补充观察计划而不是掌握结论', () => {
  const plan = buildLearningPlan({
    student: { id: 'D17', class_id: 'DC01' },
    evidence: [],
    questions,
    plan_mode: 'coverage',
    coverage_probe_indicators: ['T02I1', 'T03I1']
  }, '2026-11-14T12:00:00+08:00');
  assert.equal(plan.plan_kind, 'coverage_probe');
  assert.equal(plan.certainty, 'insufficient');
  assert.match(plan.summary, /证据/);
  assert.match(plan.limitations.join(''), /不能推断/);
  assert.deepEqual(plan.steps.filter((step) => step.phase === '低负担主题探测').map((step) => step.item_refs[0]), ['Q023', 'Q039']);
});

test('计划包含材料出处、观察点和调整条件', () => {
  const plan = buildLearningPlan({
    student: { id: 'D01', class_id: 'DC01' },
    evidence: [record()],
    questions,
    focus_indicator: 'T03I1'
  }, '2026-11-14T12:00:00+08:00');
  assert.equal(plan.material_refs.some((ref) => ref.id === 'L03'), true);
  assert.equal(plan.material_refs.some((ref) => ref.id === 'B02_相关资料切片.pdf'), true);
  assert.equal(plan.observation.length >= 3, true);
  assert.equal(plan.adjustment_rules.length >= 3, true);
  assert.equal(plan.quality_checks.no_direct_answer_in_student_hints, true);
});
