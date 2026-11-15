import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLearningPlan, collapseEvents, validatePlan } from '../src/recommendation-engine.mjs';

const questions = {
  Q041: { material_id: 'Q041', topic_id: 'T03', indicator_id: 'T03I1', type: '填空题', stem: '解不等式-2x>6', answer: 'x<-3', analysis: '除以负数反向', max_score: 1 },
  Q043: { material_id: 'Q043', topic_id: 'T03', indicator_id: 'T03I1', type: '解答题', stem: '解不等式-2x+3<11', answer: 'x>-4', analysis: '除以负数反向并检验', max_score: 3 },
  Q044: { material_id: 'Q044', topic_id: 'T03', indicator_id: 'T03I2', type: '选择题', stem: '数轴表示不等式组', answer: 'B', analysis: '端点开闭', max_score: 1 },
  Q023: { material_id: 'Q023', topic_id: 'T02', indicator_id: 'T02I1', type: '填空题', stem: '解方程2x-5=9', answer: 'x=7', analysis: '移项并检验', max_score: 1 },
  Q039: { material_id: 'Q039', topic_id: 'T03', indicator_id: 'T03I1', type: '填空题', stem: '解不等式x-3<2', answer: 'x<5', analysis: '移项', max_score: 1 },
  Q018: { material_id: 'Q018', topic_id: 'T01', indicator_id: 'T01I3', type: '解答题', stem: '判断含x整式化简后的结论', answer: '对；化简结果为-9，与x的取值无关', analysis: '化简后结果不含x', max_score: 3 },
  Q011: { material_id: 'Q011', topic_id: 'T01', indicator_id: 'T01I3', type: '解答题', stem: '用整式解释数量关系', answer: '说明化简结果与问题的关系', analysis: '先化简再解释', max_score: 3 }
};

const nodeScopes = [
  { node_id: 'N02', available_item_ids: ['Q041', 'Q043', 'Q044', 'Q023', 'Q039', 'Q018', 'Q011'] },
  { node_id: 'N01', available_item_ids: ['Q023'] }
];

function planContext(plan, evidence) {
  return {
    student: plan.student,
    target_node_id: plan.target_node_id,
    evidence,
    questions,
    nodes: nodeScopes
  };
}

function record(overrides = {}) {
  const base = {
    record_id: 'DR0023', event_id: 'D01-N02-Q043', revision: 2, student_id: 'D01', node_id: 'N02',
    item_id: 'Q043', topic_id: 'T03', indicator_id: 'T03I1', status: '已评分', score: 1, max_score: 3,
    answer: 'x<-4', steps: '-2x<8', point_scores: 'Q043P1=1；Q043P2=0；Q043P3=0', source_ref: 'DR0023'
  };
  return { ...base, ...overrides, source_ref: overrides.source_ref ?? overrides.record_id ?? base.source_ref };
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


test('证据来自其他学生时拒绝生成计划', () => {
  assert.throws(() => buildLearningPlan({
    student: { id: 'D01', class_id: 'DC01' },
    evidence: [record({ student_id: 'D02' })],
    questions,
    nodes: nodeScopes,
    target_node_id: 'N02'
  }, '2026-11-14T12:00:00+08:00'), /不属于当前学生/);
});

test('证据来自其他节点时拒绝生成计划', () => {
  assert.throws(() => buildLearningPlan({
    student: { id: 'D01', class_id: 'DC01' },
    evidence: [record({ node_id: 'N01' })],
    questions,
    nodes: nodeScopes,
    target_node_id: 'N02'
  }, '2026-11-14T12:00:00+08:00'), /不属于当前目标节点/);
});

test('不存在的题目不能进入计划', () => {
  assert.throws(() => buildLearningPlan({
    student: { id: 'D01', class_id: 'DC01' },
    evidence: [record({ item_id: 'Q999' })],
    questions,
    nodes: nodeScopes,
    target_node_id: 'N02'
  }, '2026-11-14T12:00:00+08:00'), /题目不存在/);
});

test('节点可用题集外的题目不能进入计划', () => {
  assert.throws(() => buildLearningPlan({
    student: { id: 'D01', class_id: 'DC01' },
    evidence: [record({ item_id: 'Q043', node_id: 'N01' })],
    questions,
    nodes: nodeScopes,
    target_node_id: 'N01'
  }, '2026-11-14T12:00:00+08:00'), /题目不在该节点允许题集内/);
});

test('Q018学生提示只给方法，不泄露判断或结果', () => {
  const q018 = record({
    record_id: 'DR9001', event_id: 'D01-N02-Q018', item_id: 'Q018', topic_id: 'T01', indicator_id: 'T01I3',
    score: 1, max_score: 3, answer: '他的说法正确', point_scores: 'Q018P1=1；Q018P2=0；Q018P3=0'
  });
  const plan = buildLearningPlan({
    student: { id: 'D01', class_id: 'DC01' },
    evidence: [q018],
    questions,
    nodes: nodeScopes,
    target_node_id: 'N02',
    focus_indicator: 'T01I3',
    preferred_items: ['Q018', 'Q011']
  }, '2026-11-14T12:00:00+08:00');
  const hints = plan.steps.flatMap((step) => step.hints).map((hint) => hint.text).join(' ');
  assert.equal(/恒等于|-9|全部抵消|与x的取值无关|说法正确/.test(hints), false);
  assert.deepEqual(validatePlan(plan, planContext(plan, [q018])), []);
});

test('验证器能识别被篡改的学生证据和泄题提示', () => {
  const source = record();
  const plan = buildLearningPlan({
    student: { id: 'D01', class_id: 'DC01' },
    evidence: [source],
    questions,
    nodes: nodeScopes,
    target_node_id: 'N02',
    focus_indicator: 'T03I1',
    review_item: 'Q043'
  }, '2026-11-14T12:00:00+08:00');

  const tamperedEvidence = structuredClone(plan);
  tamperedEvidence.evidence_used[0].student_id = 'D02';
  assert.match(validatePlan(tamperedEvidence, planContext(plan, [source])).join(' '), /证据不属于计划学生/);

  const tamperedScore = structuredClone(plan);
  tamperedScore.evidence_used[0].score = 3;
  assert.match(validatePlan(tamperedScore, planContext(plan, [source])).join(' '), /证据得分字段被篡改/);

  const tamperedMaterial = structuredClone(plan);
  tamperedMaterial.material_refs[0].id = 'BOGUS_MATERIAL';
  assert.match(validatePlan(tamperedMaterial, planContext(plan, [source])).join(' '), /引用不存在材料/);

  const tamperedHint = structuredClone(plan);
  tamperedHint.steps[1].hints[0].text = '所以答案一定是x>-4。';
  assert.match(validatePlan(tamperedHint, planContext(plan, [source])).join(' '), /学生提示泄题/);
});

test('验证器拒绝被篡改到节点范围外的题目', () => {
  const source = record();
  const plan = buildLearningPlan({
    student: { id: 'D01', class_id: 'DC01' },
    evidence: [source],
    questions,
    nodes: nodeScopes,
    target_node_id: 'N02',
    focus_indicator: 'T03I1',
    review_item: 'Q043'
  }, '2026-11-14T12:00:00+08:00');
  const tampered = structuredClone(plan);
  tampered.steps[1].item_refs = ['Q999'];
  assert.match(validatePlan(tampered, planContext(plan, [source])).join(' '), /引用不存在题目/);
});

test('自编整除关系题的各级学生提示不泄露结论', () => {
  const divisibilityQuestion = {
    material_id: 'Q900', topic_id: 'T01', indicator_id: 'T01I3', type: '解答题',
    stem: '自编题：判断一个整式化简后是否总能被3整除。', answer: '能；化简结果为3的倍数',
    analysis: '合并同类项后得到3的倍数，因此结论成立。', max_score: 3
  };
  const customQuestions = { ...questions, Q900: divisibilityQuestion };
  const customNodes = [{ node_id: 'N02', available_item_ids: ['Q900', 'Q011'] }];
  const evidence = [record({
    record_id: 'DR9002', event_id: 'D01-N02-Q900', item_id: 'Q900', topic_id: 'T01', indicator_id: 'T01I3',
    score: 1, max_score: 3, answer: '示例学生作答', point_scores: 'Q900P1=1；Q900P2=0；Q900P3=0'
  })];
  const plan = buildLearningPlan({
    student: { id: 'D01', class_id: 'DC01' },
    evidence,
    questions: customQuestions,
    nodes: customNodes,
    target_node_id: 'N02',
    focus_indicator: 'T01I3',
    preferred_items: ['Q900', 'Q011']
  }, '2026-11-14T12:00:00+08:00');
  const hints = plan.steps.flatMap((step) => step.hints).map((hint) => hint.text).join(' ');
  assert.equal(/3的倍数|能被3整除|结论(?:是|为)/.test(hints), false);
  assert.match(plan.teacher_explanation.map((item) => item.answer).join(' '), /3的倍数/);
  assert.deepEqual(validatePlan(plan, {
    student: plan.student,
    target_node_id: plan.target_node_id,
    evidence,
    questions: customQuestions,
    nodes: customNodes
  }), []);
});
