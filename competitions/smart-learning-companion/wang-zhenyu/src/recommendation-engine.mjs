/**
 * 王振宇模块：个性化学习建议与分步辅导计划生成器。
 *
 * 输入必须来自已核验的学生证据、题库和诊断结果。本模块不修改原始记录。
 */
import { INDICATORS, TOPICS, getTopic } from './knowledge-base.mjs';

export const PLAN_SCHEMA_VERSION = '1.0.0';

const STATUS_GRADED = '已评分';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function numberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function byRevisionDesc(a, b) {
  return Number(b.revision ?? b['修订版本'] ?? 1) - Number(a.revision ?? a['修订版本'] ?? 1);
}

function normalizeEvidenceItem(item) {
  return {
    record_id: item.record_id ?? item['记录编号'],
    event_id: item.event_id ?? item['作答事件编号'],
    revision: Number(item.revision ?? item['修订版本'] ?? 1),
    student_id: item.student_id ?? item['学生编号'],
    node_id: item.node_id ?? item['节点编号'],
    item_id: item.item_id ?? item['材料编号'],
    topic_id: item.topic_id ?? item['主题编号'],
    indicator_id: item.indicator_id ?? item['指标编号'],
    status: item.status ?? item['评分状态'],
    score: numberOrNull(item.score ?? item['得分']),
    max_score: numberOrNull(item.max_score ?? item['满分']),
    answer: item.answer ?? item['学生最终作答'] ?? '',
    steps: item.steps ?? item['解答过程'] ?? '',
    point_scores: item.point_scores ?? item['评分点得分'] ?? '',
    submitted_at: item.submitted_at ?? item['模拟提交时间'] ?? '',
    source_ref: item.source_ref ?? item['记录编号']
  };
}

/** 同一作答事件只保留最高修订版本，待评分和未作答不会被当作零分。 */
export function collapseEvents(evidence) {
  assert(Array.isArray(evidence), 'evidence 必须是数组');
  const events = new Map();
  for (const raw of evidence) {
    const item = normalizeEvidenceItem(raw);
    assert(item.event_id, '证据缺少 event_id/作答事件编号');
    const current = events.get(item.event_id);
    if (!current || item.revision > current.revision) events.set(item.event_id, item);
  }
  return [...events.values()];
}

function questionKey(question) {
  return question.material_id ?? question['材料编号'];
}

function normalizeQuestions(questions) {
  const entries = Array.isArray(questions)
    ? questions.map((q) => [questionKey(q), q])
    : Object.entries(questions ?? {});
  return new Map(entries.map(([id, q]) => [id, {
    item_id: id,
    topic_id: q.topic_id ?? q['主题编号'],
    indicator_id: q.indicator_id ?? q['指标编号'],
    type: q.type ?? q['题型'],
    stem: q.stem ?? q['题干或内容'] ?? '',
    answer: q.answer ?? q['参考答案'] ?? '',
    analysis: q.analysis ?? q['参考解析'] ?? '',
    max_score: numberOrNull(q.max_score ?? q['满分']),
    source: q.source ?? q['来源或资料文件'] ?? ''
  }]));
}

function indicatorStats(evidence) {
  const result = new Map();
  for (const item of evidence) {
    if (item.status !== STATUS_GRADED || item.score === null || item.max_score === null) continue;
    if (!item.indicator_id) continue;
    const current = result.get(item.indicator_id) ?? { earned: 0, possible: 0, count: 0, items: [] };
    current.earned += item.score;
    current.possible += item.max_score;
    current.count += 1;
    current.items.push(item);
    result.set(item.indicator_id, current);
  }
  return result;
}

function chooseFocus(evidence, requestedFocus) {
  const stats = indicatorStats(evidence);
  if (requestedFocus) {
    assert(INDICATORS[requestedFocus], '未知指标: ' + requestedFocus);
    return { indicator_id: requestedFocus, stats: stats.get(requestedFocus) ?? null, reason: '调用方指定了当前最重要的辅导指标' };
  }
  const assessed = [...stats.entries()]
    .map(([indicator_id, value]) => ({ indicator_id, ...value, rate: value.possible ? value.earned / value.possible : null }))
    .filter((x) => x.count > 0)
    .sort((a, b) => a.rate - b.rate || b.count - a.count);
  if (assessed.length === 0) return { indicator_id: null, stats: null, reason: '尚无已评分证据' };
  return { indicator_id: assessed[0].indicator_id, stats: assessed[0], reason: '选择已评分证据中得分率最低的指标' };
}

function certaintyFor(count) {
  if (count === 0) return 'insufficient';
  if (count <= 2) return 'provisional';
  return 'adequate';
}

function planKindFor(rate) {
  if (rate === null) return 'coverage_probe';
  if (rate < 0.6) return 'remediation';
  if (rate < 0.8) return 'consolidation';
  return 'extension';
}

function materialRefs(indicatorId) {
  const indicator = INDICATORS[indicatorId];
  const topic = TOPICS[indicator.topic];
  return [
    { type: '学习卡', id: topic.card, location: topic.card, note: indicator.name },
    { type: '教材切片', id: topic.textbook, location: topic.pages, note: '按教材正文顺序复习' },
    { type: '课程标准', id: topic.standard, location: topic.standardPage, note: indicator.name }
  ];
}

function makeHint(level, text, purpose) {
  return { level, text, purpose, visibility: 'student', reveals_answer: false };
}

function stepHints(indicatorId, specificText) {
  const hints = INDICATORS[indicatorId].hints;
  return [
    makeHint(1, hints[0], '激活概念与观察顺序'),
    makeHint(2, specificText ?? hints[1], '提供下一步操作，不给出结果'),
    makeHint(3, hints[2], '用检查或代值替代直接答案')
  ];
}

function itemSummary(item, questions) {
  const q = questions.get(item.item_id);
  return {
    item_id: item.item_id,
    node_id: item.node_id,
    status: item.status,
    score: item.score,
    max_score: item.max_score,
    answer: item.answer,
    steps: item.steps,
    point_scores: item.point_scores,
    stem: q?.stem ?? '',
    source_ref: item.source_ref
  };
}

function teacherOnlyFor(items, questions) {
  return items.filter(Boolean).map((item) => {
    const q = questions.get(item.item_id);
    return {
      item_id: item.item_id,
      stem: q?.stem ?? '',
      answer: q?.answer ?? '',
      analysis: q?.analysis ?? '',
      note: '仅供教师查看，学生端提示不得包含本字段。'
    };
  });
}

function buildEvidenceGaps(evidence) {
  const assessed = new Set(evidence.filter((x) => x.status === STATUS_GRADED).map((x) => x.indicator_id));
  return Object.keys(INDICATORS).filter((id) => !assessed.has(id)).map((id) => ({
    indicator_id: id,
    topic: INDICATORS[id].topic,
    name: INDICATORS[id].name,
    interpretation: '无已评分证据，不能判断掌握程度'
  }));
}

function chooseSequence(primary, fallbackItems, requestedItems = []) {
  const preferred = unique(requestedItems);
  const fromEvidence = unique((primary?.items ?? []).map((x) => x.item_id));
  const kb = INDICATORS[primary?.indicator_id]?.practiceItems ?? fallbackItems;
  return unique([...preferred, ...fromEvidence, ...kb]);
}

function commonAdjustmentRules(primary) {
  const indicator = INDICATORS[primary];
  return [
    {
      id: 'A1',
      condition: '学生只读一级提示就能独立完成并说明理由',
      action: '跳过二级提示，直接进入迁移题；记录为独立达成。'
    },
    {
      id: 'A2',
      condition: '学生在二级提示后完成，但单独作答仍出错',
      action: '保留同结构变式一题，减少提示层级后再次观察。'
    },
    {
      id: 'A3',
      condition: '三级提示后仍未完成或仍只靠试猜',
      action: indicator.adjustment[1] + '；下一次计划降低难度并增加示范。'
    },
    {
      id: 'A4',
      condition: '连续两次独立完成同类题并能在反思中说清依据',
      action: '结束本指标强化，转入下一薄弱指标或迁移任务。'
    }
  ];
}

function buildCoveragePlan(request, evidence, questions, generatedAt) {
  const probes = request.coverage_probe_indicators?.length
    ? request.coverage_probe_indicators
    : ['T02I1', 'T03I1'];
  const probeEvidence = probes.map((indicatorId, index) => {
    const choices = INDICATORS[indicatorId].practiceItems;
    const itemId = index === 0 ? choices[Math.min(3, choices.length - 1)] : choices[Math.min(2, choices.length - 1)];
    const q = questions.get(itemId);
    return { itemId, indicatorId, q };
  });
  const limitations = [
    '当前只有有限主题的已评分记录，不能推断未测主题已掌握或未掌握。',
    '待评分、未作答和无记录均不进入掌握度计算。',
    '本计划首先补充观察，不直接给出“薄弱”结论。'
  ];
  return {
    schema_version: PLAN_SCHEMA_VERSION,
    plan_id: 'PLAN-' + request.student.id + '-coverage-' + generatedAt.slice(0, 10).replaceAll('-', ''),
    generated_at: generatedAt,
    module: { name: '个性化建议与分步辅导', owner: '王振宇', version: '1.0.0' },
    student: { id: request.student.id, class_id: request.student.class_id },
    plan_kind: 'coverage_probe',
    certainty: 'insufficient',
    primary_focus: null,
    summary: '现有证据只覆盖部分主题，先设计低负担观察任务，再决定后续强化方向。',
    evidence_used: evidence.map((x) => itemSummary(x, questions)),
    evidence_gaps: buildEvidenceGaps(evidence),
    material_refs: probes.flatMap((id) => materialRefs(id)),
    steps: [
      {
        step_no: 1,
        phase: '确认已有优势',
        objective: '用一题已掌握主题的题确认学生能独立说明步骤。',
        item_refs: [evidence.find((x) => x.status === STATUS_GRADED)?.item_id].filter(Boolean),
        student_action: '选择一题已经做过的题，口述“我先做什么、再做什么、最后怎样检查”。',
        hints: [],
        success_criteria: ['能独立口述完整步骤', '能指出自己使用的规则'],
        next_if_success: '进入未覆盖主题的短探测。',
        next_if_not: '先回到对应学习卡，不用本次记录判断新主题。'
      },
      ...probeEvidence.map((probe, index) => ({
        step_no: index + 2,
        phase: '低负担主题探测',
        objective: '补充观察 ' + INDICATORS[probe.indicatorId].name + '。',
        item_refs: [probe.itemId],
        material_refs: materialRefs(probe.indicatorId),
        student_action: '独立完成并写出关键步骤；不会时可使用一级提示。',
        hints: stepHints(probe.indicatorId),
        success_criteria: ['能说明使用的规则', '能完成基本步骤并自行检查'],
        next_if_success: '补一题同指标变式，确认不是偶然正确。',
        next_if_not: '记录提示层级与卡点，进入该指标的小步辅导。',
        teacher_only: teacherOnlyFor([{ item_id: probe.itemId }], questions)
      })),
      {
        step_no: probeEvidence.length + 2,
        phase: '形成下一次计划',
        objective: '依据探测结果确定一个首要辅导指标。',
        item_refs: [],
        student_action: '留下本次最短反思：哪一步最容易出错，下一次先检查什么。',
        hints: [],
        success_criteria: ['下一次计划只聚焦一个首要问题', '调整条件有本次观察证据支持'],
        next_if_success: '生成正式强化计划。',
        next_if_not: '继续补充观察，不提前贴标签。'
      }
    ],
    observation: ['是否能在无提示下启动', '首次卡点发生在哪一步', '提示层级与最终独立性'],
    adjustment_rules: [
      { id: 'C1', condition: '两项探测均独立正确', action: '再各加一题变式；仍正确后才记为初步掌握。' },
      { id: 'C2', condition: '一项正确、一项需要二级提示', action: '优先辅导需要提示的指标。' },
      { id: 'C3', condition: '两项均需三级提示', action: '降低起点，先从学习卡中的单一规则开始。' }
    ],
    limitations,
    teacher_explanation: teacherOnlyFor(probeEvidence.map((x) => ({ item_id: x.itemId })), questions),
    quality_checks: { no_direct_answer_in_student_hints: true, uncertainty_explicit: true, evidence_ids: evidence.map((x) => x.record_id) }
  };
}

/**
 * 根据学生证据生成一份可执行计划。
 * @param {object} request 学生、证据、题库和可选重点指标。
 * @returns {object} 与页面、JSON、CSV共用字段口径的学习计划。
 */
export function buildLearningPlan(request, generatedAt = new Date().toISOString()) {
  assert(request?.student?.id, '缺少 student.id');
  assert(request?.student?.class_id, '缺少 student.class_id');
  const evidence = collapseEvents(request.evidence ?? []);
  const questions = normalizeQuestions(request.questions ?? {});
  if (request.plan_mode === 'coverage' || evidence.filter((x) => x.status === STATUS_GRADED).length === 0) {
    return buildCoveragePlan(request, evidence, questions, generatedAt);
  }
  const focus = chooseFocus(evidence, request.focus_indicator);
  assert(focus.indicator_id, '没有可用于生成计划的已评分证据');
  const indicator = INDICATORS[focus.indicator_id];
  const rated = evidence.filter((x) => x.indicator_id === focus.indicator_id && x.status === STATUS_GRADED);
  const rate = focus.stats?.possible ? focus.stats.earned / focus.stats.possible : null;
  const sequence = chooseSequence(focus.stats, indicator.practiceItems, request.preferred_items ?? []);
  const requestedReview = request.review_item ? rated.find((item) => item.item_id === request.review_item) : null;
  const review = requestedReview
    ?? [...rated].sort((a, b) => (a.score / a.max_score) - (b.score / b.max_score))[0]
    ?? { item_id: request.review_item ?? sequence[0], node_id: '', status: 'no_record', score: null, max_score: null, answer: '', steps: '', point_scores: '', source_ref: '' };
  const practice = sequence.find((id) => id !== review.item_id) ?? sequence[0];
  const transfer = sequence.find((id) => id !== review.item_id && id !== practice) ?? sequence[1] ?? practice;
  const certainty = certaintyFor(focus.stats?.count ?? 0);
  const planKind = planKindFor(rate);
  const evidenceGaps = buildEvidenceGaps(evidence);
  const primarySummary = focus.stats
    ? '已评分证据 ' + focus.stats.count + ' 条，当前得分率为 ' + Math.round(rate * 1000) / 10 + '%。'
    : '当前没有该指标的已评分证据。';
  const limitations = [
    certainty === 'adequate' ? '证据数量足以为本次计划提供方向，但仍不代表长期掌握。' : '证据数量有限，本次结论是暂定的，需要后续观察。',
    '待评分、未作答和无记录不会被当作零分或未掌握。',
    '若题目、材料或记录版本发生变化，必须重新生成计划。'
  ];
  const reviewForTeacher = review.item_id ? [{ item_id: review.item_id }] : [];
  const practiceForTeacher = [{ item_id: practice }, { item_id: transfer }];
  return {
    schema_version: PLAN_SCHEMA_VERSION,
    plan_id: 'PLAN-' + request.student.id + '-' + focus.indicator_id.toLowerCase() + '-' + generatedAt.slice(0, 10).replaceAll('-', ''),
    generated_at: generatedAt,
    module: { name: '个性化建议与分步辅导', owner: '王振宇', version: '1.0.0' },
    student: { id: request.student.id, class_id: request.student.class_id },
    plan_kind: planKind,
    certainty,
    primary_focus: {
      indicator_id: focus.indicator_id,
      topic_id: indicator.topic,
      topic_name: TOPICS[indicator.topic].name,
      indicator_name: indicator.name,
      focus_statement: indicator.focus,
      score_rate: rate === null ? null : Math.round(rate * 1000) / 10,
      evidence_count: focus.stats?.count ?? 0,
      selection_reason: request.focus_indicator ? '调用方指定当前辅导重点' : focus.reason
    },
    summary: primarySummary + '本次优先处理“' + indicator.name + '”。',
    evidence_used: rated.map((x) => itemSummary(x, questions)),
    evidence_gaps: evidenceGaps,
    material_refs: materialRefs(focus.indicator_id),
    steps: [
      {
        step_no: 1,
        phase: '概念复位',
        objective: '用学习卡恢复规则和观察顺序，不直接解题。',
        item_refs: [],
        material_refs: materialRefs(focus.indicator_id),
        student_action: '读学习卡，用自己的话说出本指标最关键的一条规则，并圈出关键词。',
        hints: stepHints(focus.indicator_id, '先不要算结果；按“看条件—选规则—写下一步”的顺序说一遍。'),
        success_criteria: ['能说出规则而不看答案', '能指出题目中触发该规则的词或符号'],
        next_if_success: '进入原题复盘。',
        next_if_not: '教师用学习卡中的最小例子示范一次，再让学生复述。'
      },
      {
        step_no: 2,
        phase: '原题复盘',
        objective: '定位首次出错步骤，而不是重做整题。',
        item_refs: [review.item_id].filter(Boolean),
        material_refs: materialRefs(focus.indicator_id),
        student_action: '标出自己第一次不确定的步骤，说明当时依据的规则；使用一级提示后尝试修正该步。',
        hints: stepHints(focus.indicator_id, '只检查当前这一步：你依据的是哪条规则？符号或方向在这一步有没有变化？'),
        success_criteria: ['能指出具体卡点', '能按规则修正当前步骤并说明理由'],
        next_if_success: '进入同类独立练习。',
        next_if_not: '下降到三级提示，用代值或反向运算核对这一步。',
        teacher_only: teacherOnlyFor(reviewForTeacher, questions)
      },
      {
        step_no: 3,
        phase: '独立练习',
        objective: '在同类题中独立迁移同一规则。',
        item_refs: [practice],
        material_refs: materialRefs(focus.indicator_id),
        student_action: '独立完成，不先看提示；完成后用一句话说明关键步骤。',
        hints: stepHints(focus.indicator_id),
        success_criteria: ['基本步骤正确', '能说明关键规则', '完成自检'],
        next_if_success: '进入不同情境的迁移题。',
        next_if_not: '回到二级提示，只改卡点步骤，不重抄整题。',
        teacher_only: teacherOnlyFor([{ item_id: practice }], questions)
      },
      {
        step_no: 4,
        phase: '迁移与检验',
        objective: '换情境或换问法后仍能使用同一规则，并完成检查。',
        item_refs: [transfer],
        material_refs: materialRefs(focus.indicator_id),
        student_action: '完成后必须写出一个检查动作：代值、回代、数轴核对或结合实际条件解释。',
        hints: stepHints(focus.indicator_id),
        success_criteria: ['迁移题结果正确', '检查动作与题型匹配', '能解释结果是否合理'],
        next_if_success: '进入反思和下一次观察。',
        next_if_not: '暂停新题，回到学习卡并降低一个认知步骤。',
        teacher_only: teacherOnlyFor([{ item_id: transfer }], questions)
      },
      {
        step_no: 5,
        phase: '反思与退出',
        objective: '把一次正确表现转成可复用的自检语言。',
        item_refs: [],
        student_action: '填写两句话：这次最容易错的地方是____；下次开始前我先检查____。',
        hints: [
          makeHint(1, '回看第2步和第4步，比较自己在哪一步使用了提示。', '形成自我监控', 'student', false),
          makeHint(2, '把“粗心”改写成具体动作，例如检查符号、端点、单位或回代。', '形成可执行检查', 'student', false),
          makeHint(3, '请教师根据本次提示层级决定下一题难度。', '交给教师调整', 'student', false)
        ],
        success_criteria: ['反思包含具体步骤', '下一次计划有明确观察点'],
        next_if_success: '按调整规则决定是否结束本指标强化。',
        next_if_not: '保留原计划再练一题，不立即切换主题。'
      }
    ],
    observation: indicator.observation,
    adjustment_rules: commonAdjustmentRules(focus.indicator_id),
    limitations,
    teacher_explanation: teacherOnlyFor([...reviewForTeacher, ...practiceForTeacher], questions),
    quality_checks: {
      no_direct_answer_in_student_hints: true,
      uncertainty_explicit: true,
      evidence_ids: rated.map((x) => x.record_id),
      material_refs_present: true,
      adjustment_conditions_present: true
    }
  };
}

/** 基础质量检查，供页面、CLI 和验收脚本共用。 */
export function validatePlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== 'object') return ['计划不是对象'];
  if (!plan.plan_id) errors.push('缺少 plan_id');
  if (!plan.student?.id) errors.push('缺少 student.id');
  if (!Array.isArray(plan.steps) || plan.steps.length < 3) errors.push('步骤不足');
  for (const [index, step] of (plan.steps ?? []).entries()) {
    if (!step.student_action) errors.push('步骤' + (index + 1) + '缺少学生动作');
    if (!Array.isArray(step.hints)) errors.push('步骤' + (index + 1) + '缺少提示数组');
    for (const hint of step.hints ?? []) {
      if (hint.visibility !== 'student') errors.push('提示可见性错误');
      if (hint.reveals_answer !== false) errors.push('学生提示不得直接给答案');
      if (/^答案[:：]/.test(hint.text)) errors.push('提示包含直接答案');
    }
  }
  if (!Array.isArray(plan.adjustment_rules) || plan.adjustment_rules.length < 3) errors.push('调整条件不足');
  if (!Array.isArray(plan.limitations) || plan.limitations.length === 0) errors.push('缺少适用限制');
  return errors;
}
