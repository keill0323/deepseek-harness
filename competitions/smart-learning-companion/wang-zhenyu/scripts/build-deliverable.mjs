#!/usr/bin/env node
/**
 * 从赛题 CSV 构建王振宇模块成果包与演示数据。
 * 原始数据只读取，不写回；生成结果不包含无关学生个人身份信息。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildLearningPlan, validatePlan } from '../src/recommendation-engine.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const args = (typeof process !== 'undefined' ? process.argv.slice(2) : globalThis.__BUILD_ARGS__) ?? [];
function arg(name, fallback) {
  const index = args.indexOf('--' + name);
  return index >= 0 ? args[index + 1] : fallback;
}
const dataDir = path.resolve(arg('data', path.join(projectRoot, 'private-data', '模拟学情数据')));
const outDir = path.resolve(arg('out', path.join(projectRoot, 'generated')));
const generatedAt = arg('generated-at', '2026-11-14T12:00:00+08:00');

function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; }
        else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') {
      row.push(cell); cell = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
    } else if (char !== '\r') cell += char;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    if (row.some((value) => value !== '')) rows.push(row);
  }
  const header = rows.shift();
  return rows.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ''])));
}

function readCsv(name) {
  return parseCsv(fs.readFileSync(path.join(dataDir, name), 'utf8'));
}

function pct(earned, possible) {
  return possible ? Math.round((earned / possible) * 1000) / 10 : null;
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const required = ['课程要求.csv', '题目与材料.csv', '模拟学生.csv', '测验节点.csv', '作答记录.csv', '字段说明.csv'];
for (const file of required) {
  if (!fs.existsSync(path.join(dataDir, file))) throw new Error('缺少输入文件: ' + file);
}

const requirements = readCsv('课程要求.csv');
const materials = readCsv('题目与材料.csv');
const students = readCsv('模拟学生.csv');
const nodes = readCsv('测验节点.csv');
const records = readCsv('作答记录.csv');
const fieldDictionary = readCsv('字段说明.csv');
const questions = materials.filter((item) => item['材料类型'] === '题目');
const questionMap = new Map(questions.map((q) => [q['材料编号'], {
  material_id: q['材料编号'], topic_id: q['主题编号'], indicator_id: q['指标编号'], type: q['题型'],
  stem: q['题干或内容'], answer: q['参考答案'], analysis: q['参考解析'], max_score: Number(q['满分']), source: q['来源或资料文件']
}]));

const studentMap = new Map(students.map((student) => [student['学生编号'], student]));
const byEvent = new Map();
for (const record of records) {
  if (!byEvent.has(record['作答事件编号'])) byEvent.set(record['作答事件编号'], []);
  byEvent.get(record['作答事件编号']).push(record);
}
const latest = [...byEvent.values()].map((versions) => versions.sort((a, b) => Number(b['修订版本']) - Number(a['修订版本']))[0]);

const anomalyLog = [
  { record_id: 'DR0081', type: 'topic_mismatch', action: 'use_question_topic', reason: 'Q017题库主题为T01；记录误写T02', original_value: 'T02', resolved_value: 'T01' },
  { record_id: 'DR0133', type: 'score_point_conflict', action: 'use_point_sum', reason: '评分点合计2；最终答案与过程冲突', original_value: 3, resolved_value: 2 },
  { record_id: 'DR0361', type: 'score_over_max', action: 'cap_to_max', reason: 'Q044满分1，答案与评分点支持1分', original_value: 10, resolved_value: 1 },
  { record_id: 'DR0515', type: 'node_scope_conflict', action: 'reassign_after_review', reason: '题号所属主题、可用题集与提交日期均支持N02；不单凭时间戳', original_value: 'N01', resolved_value: 'N02' },
  { record_id: 'DR0535', type: 'score_over_max', action: 'cap_to_point_sum', reason: 'Q034满分3，三个评分点均为1', original_value: 4, resolved_value: 3 },
  { record_id: 'DR0685', type: 'answer_key_conflict', action: 'semantic_review_correct', reason: 'Q017最终答案与参考答案一致，评分点误记0', original_value: 0, resolved_value: 1 }
];
const anomalyMap = new Map(anomalyLog.map((item) => [item.record_id, item]));
const cleaned = latest.map((record) => {
  const q = questionMap.get(record['材料编号']);
  const anomaly = anomalyMap.get(record['记录编号']);
  let score = record['得分'] === '' ? null : Number(record['得分']);
  let topicId = q?.topic_id ?? record['主题编号'];
  let nodeId = record['节点编号'];
  if (['use_point_sum', 'cap_to_max', 'cap_to_point_sum', 'semantic_review_correct'].includes(anomaly?.action)) score = anomaly.resolved_value;
  if (anomaly?.action === 'reassign_after_review') nodeId = anomaly.resolved_value;
  return {
    record_id: record['记录编号'], event_id: record['作答事件编号'], revision: Number(record['修订版本']),
    student_id: record['学生编号'], class_id: studentMap.get(record['学生编号'])['模拟班级编号'],
    node_id: nodeId, item_id: record['材料编号'], topic_id: topicId, indicator_id: q?.indicator_id ?? '',
    status: record['评分状态'], score, max_score: record['满分'] === '' ? null : Number(record['满分']),
    answer: record['学生最终作答'], steps: record['解答过程'], point_scores: record['评分点得分'],
    submitted_at: record['模拟提交时间'], source_ref: record['记录编号'], anomaly_flag: Boolean(anomaly)
  };
});

function groupStats(items, keyFn, filter = () => true) {
  const grouped = new Map();
  for (const item of items.filter(filter)) {
    const key = keyFn(item);
    if (!grouped.has(key)) grouped.set(key, { key, records: 0, graded: 0, earned: 0, possible: 0, students: new Set(), items: new Set() });
    const group = grouped.get(key); group.records += 1; group.students.add(item.student_id); group.items.add(item.item_id);
    if (item.status === '已评分' && item.score !== null) { group.graded += 1; group.earned += item.score; group.possible += item.max_score; }
  }
  return [...grouped.values()].map((group) => ({ ...group, rate: pct(group.earned, group.possible), student_count: group.students.size, item_count: group.items.size, students: undefined, items: undefined }));
}

const classStats = groupStats(cleaned, (item) => item.class_id);
const topicStats = groupStats(cleaned, (item) => item.topic_id);
const indicatorStats = groupStats(cleaned, (item) => item.indicator_id, (item) => item.status === '已评分');
const studentProfiles = [];
for (const student of students) {
  const own = cleaned.filter((item) => item.student_id === student['学生编号']);
  const graded = own.filter((item) => item.status === '已评分' && item.score !== null);
  const topicRates = {};
  for (const topic of [...new Set(requirements.map((r) => r['主题编号']))]) {
    const topicGraded = graded.filter((item) => item.topic_id === topic);
    topicRates[topic] = pct(topicGraded.reduce((sum, item) => sum + item.score, 0), topicGraded.reduce((sum, item) => sum + item.max_score, 0));
  }
  studentProfiles.push({
    student_id: student['学生编号'], class_id: student['模拟班级编号'], records: own.length, graded: graded.length,
    pending: own.filter((item) => item.status === '待评分').length, unanswered: own.filter((item) => item.status === '未作答').length,
    earned: graded.reduce((sum, item) => sum + item.score, 0), possible: graded.reduce((sum, item) => sum + item.max_score, 0),
    score_rate: pct(graded.reduce((sum, item) => sum + item.score, 0), graded.reduce((sum, item) => sum + item.max_score, 0)),
    topic_count: new Set(own.map((item) => item.topic_id)).size, topic_rates: topicRates
  });
}

function planFor(studentId, options = {}) {
  const student = studentProfiles.find((item) => item.student_id === studentId);
  if (!student) throw new Error('未知学生: ' + studentId);
  const plan = buildLearningPlan({
    student: { id: student.student_id, class_id: student.class_id },
    evidence: cleaned.filter((item) => item.student_id === studentId),
    questions: Object.fromEntries(questionMap), ...options
  }, generatedAt);
  const errors = validatePlan(plan);
  if (errors.length) throw new Error('计划质量检查失败 ' + studentId + ': ' + errors.join('; '));
  return plan;
}

const caseOptions = {
  D01: { focus_indicator: 'T03I1', review_item: 'Q043', preferred_items: ['Q043', 'Q041', 'Q042', 'Q044'] },
  D14: { focus_indicator: 'T02I1', preferred_items: ['Q026', 'Q022', 'Q034'] },
  D17: { plan_mode: 'coverage', coverage_probe_indicators: ['T02I1', 'T03I1'] }
};
const cases = Object.fromEntries(Object.entries(caseOptions).map(([studentId, options]) => [studentId, planFor(studentId, options)]));
const allPlans = students.map((student) => planFor(student['学生编号']));

fs.mkdirSync(outDir, { recursive: true });
const output = path.join(outDir, '成果包');
const demoOut = path.join(outDir, '演示系统');
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(demoOut, { recursive: true });

function writeJson(relative, value) { fs.writeFileSync(path.join(output, relative), JSON.stringify(value, null, 2) + '\n', 'utf8'); }
function csvEscape(value) { const text = value == null ? '' : String(value); return /[",\n\r]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text; }
function writeCsv(relative, rows, columns) {
  fs.writeFileSync(path.join(output, relative), [columns.join(','), ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(','))].join('\n') + '\n', 'utf8');
}

writeJson('learning_plans_all_students.json', { schema_version: '1.0.0', generated_at: generatedAt, plans: allPlans });
writeJson('learning_plans_cases.json', { schema_version: '1.0.0', generated_at: generatedAt, cases });
writeJson('data_quality_report.json', { raw_rows: records.length, event_count: latest.length, revision_count: records.length - latest.length, anomalies: anomalyLog, status_counts: Object.fromEntries([...new Set(cleaned.map((item) => item.status))].map((status) => [status, cleaned.filter((item) => item.status === status).length])) });
writeJson('module_manifest.json', {
  module: '个性化建议与分步辅导', owner: '王振宇', version: '1.0.0', generated_at: generatedAt,
  inputs: { records: records.length, events: latest.length, students: students.length, questions: questions.length },
  outputs: ['learning_plans_all_students.json', 'learning_plans_cases.json', 'student_profiles.csv', 'plan_steps_cases.csv', 'plan_hints_cases.csv', 'plan_evidence_cases.csv', 'data_quality_report.json'],
  data_sha256: Object.fromEntries(required.map((file) => [file, sha256File(path.join(dataDir, file))]))
});

writeCsv('student_profiles.csv', studentProfiles, ['student_id', 'class_id', 'records', 'graded', 'pending', 'unanswered', 'earned', 'possible', 'score_rate', 'topic_count']);
const casePlans = Object.values(cases);
const steps = casePlans.flatMap((plan) => plan.steps.map((step) => ({
  plan_id: plan.plan_id, student_id: plan.student.id, primary_indicator: plan.primary_focus?.indicator_id ?? '',
  step_no: step.step_no, phase: step.phase, objective: step.objective, item_refs: (step.item_refs ?? []).join('、'),
  student_action: step.student_action, success_criteria: step.success_criteria.join('；'), next_if_success: step.next_if_success, next_if_not: step.next_if_not
})));
writeCsv('plan_steps_cases.csv', steps, ['plan_id', 'student_id', 'primary_indicator', 'step_no', 'phase', 'objective', 'item_refs', 'student_action', 'success_criteria', 'next_if_success', 'next_if_not']);
const hints = casePlans.flatMap((plan) => plan.steps.flatMap((step) => step.hints.map((hint) => ({
  plan_id: plan.plan_id, student_id: plan.student.id, step_no: step.step_no, level: hint.level, text: hint.text, purpose: hint.purpose, reveals_answer: hint.reveals_answer
}))));
writeCsv('plan_hints_cases.csv', hints, ['plan_id', 'student_id', 'step_no', 'level', 'text', 'purpose', 'reveals_answer']);
const evidenceRows = casePlans.flatMap((plan) => plan.evidence_used.map((item) => ({
  plan_id: plan.plan_id, student_id: plan.student.id, record_id: item.source_ref, item_id: item.item_id, node_id: item.node_id,
  status: item.status, score: item.score, max_score: item.max_score, answer: item.answer, steps: item.steps, point_scores: item.point_scores
})));
writeCsv('plan_evidence_cases.csv', evidenceRows, ['plan_id', 'student_id', 'record_id', 'item_id', 'node_id', 'status', 'score', 'max_score', 'answer', 'steps', 'point_scores']);

const caseMeta = {
  D01: { type: '部分得分', tag: '不等式反向', note: 'Q043移项正确，但除以负数后未改变不等号方向。' },
  D14: { type: '表现较好', tag: '检验与迁移', note: '整体表现稳定，用Q026检查方程解的意义，并延伸到实际情境。' },
  D17: { type: '记录不足', tag: '不推断掌握', note: '只有T01的4条记录，不能据此判断T02、T03已掌握或未掌握。' }
};
const demoData = {
  generated_at: generatedAt, cases, case_meta: caseMeta, all_plans: allPlans, student_profiles: studentProfiles,
  data_quality_summary: { raw_rows: records.length, event_count: latest.length, revision_count: records.length - latest.length, pending: cleaned.filter((item) => item.status === '待评分').length, unanswered: cleaned.filter((item) => item.status === '未作答').length, anomalies: anomalyLog.length },
  class_stats: classStats, topic_stats: topicStats, indicator_stats: indicatorStats,
  anomaly_log: anomalyLog, question_bank: Object.fromEntries(questionMap), requirements
};
fs.writeFileSync(path.join(demoOut, 'data.js'), 'window.SMART_LEARNING_DATA = ' + JSON.stringify(demoData, null, 2) + ';\n', 'utf8');
for (const file of ['index.html', 'styles.css', 'app.js']) fs.copyFileSync(path.join(projectRoot, 'demo', file), path.join(demoOut, file));
fs.writeFileSync(path.join(outDir, 'README.md'), '# 王振宇：个性化建议与分步辅导\n\n运行 node scripts/build-deliverable.mjs --data <模拟学情数据目录> --out <输出目录> 生成成果包和演示系统。演示系统直接打开 演示系统/index.html。\n', 'utf8');
console.log(JSON.stringify({ outDir, cases: Object.keys(cases), plans: allPlans.length, steps: steps.length, hints: hints.length }, null, 2));
