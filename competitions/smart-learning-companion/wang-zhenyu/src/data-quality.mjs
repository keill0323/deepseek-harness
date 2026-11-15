/**
 * 通用数据一致性检查。
 *
 * 只依据题库、节点范围和记录内部字段判断异常，不按记录编号、日期或题号做特判。
 * 无法由数据本身消歧的冲突保留原值并要求人工复核。
 */

function numberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parsePointScoreAudit(value) {
  const entries = [];
  let invalid = false;
  for (const part of String(value ?? '').split(/[；;\n]/)) {
    const text = part.trim();
    if (!text) continue;
    const match = /^([^\s=]+)\s*=\s*(-?\d+(?:\.\d+)?)$/.exec(text);
    if (!match?.[1] || !match[2]) {
      invalid = true;
      continue;
    }
    const score = Number(match[2]);
    if (!Number.isFinite(score) || entries.some((entry) => entry.point_id === match[1])) {
      invalid = true;
      continue;
    }
    entries.push({ point_id: match[1], score });
  }
  return { entries, invalid };
}

export function parsePointScoreEntries(value) {
  return parsePointScoreAudit(value).entries;
}

export function parsePointScoreValues(value) {
  return parsePointScoreEntries(value).map((entry) => entry.score);
}

function parseRubricMaximums(value) {
  const maximums = new Map();
  for (const line of String(value ?? '').split(/\r?\n/).filter((entry) => entry.trim())) {
    const match = /^(\S+)\s+.+?\s+(\d+(?:\.\d+)?)\s*分\s*$/.exec(line.trim());
    if (!match?.[1] || !match[2] || maximums.has(match[1])) return null;
    maximums.set(match[1], Number(match[2]));
  }
  return maximums.size ? maximums : new Map();
}

export function normalizeComparableAnswer(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, '')
    .replace(/[。；;，,]+$/g, '');
}

function splitIds(value) {
  return String(value ?? '')
    .split(/[、,，;；\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function issueReason(codes) {
  const labels = {
    missing_question: '题目在题库中不存在',
    topic_mismatch: '记录主题与题库不一致',
    indicator_missing: '题目缺少指标编号',
    max_score_mismatch: '记录满分与题库不一致',
    unknown_node: '节点在测验节点表中不存在',
    node_scope_conflict: '题目不在该节点允许题集内',
    score_out_of_range: '得分超出有效范围',
    score_point_conflict: '总分与评分点合计不一致',
    point_sum_over_max: '评分点合计超过题目满分',
    graded_score_missing: '已评分记录缺少有效得分',
    answer_key_zero_conflict: '最终作答与参考答案一致但评分为零，需人工复核',
    invalid_point_scores: '评分点编号、取值或范围不可信'
  };
  return codes.map((code) => labels[code] ?? code).join('；');
}

/**
 * @param {object} record 最高修订版本作答记录。
 * @param {object|null} question 对应题库题目。
 * @param {object|null} node 记录节点。
 * @returns {object} 审计结果；所有冲突均进入复核，不凭记录编号自动消歧。
 */
export function auditRecord(record, question, node) {
  const codes = [];
  const status = record['评分状态'] ?? record.status;
  const originalScore = numberOrNull(record['得分'] ?? record.score);
  const recordedMaxScore = numberOrNull(record['满分'] ?? record.max_score);
  const questionMaxScore = numberOrNull(question?.['满分'] ?? question?.max_score);
  const questionTopicId = question?.['主题编号'] ?? question?.topic_id ?? '';
  const questionIndicatorId = question?.['指标编号'] ?? question?.indicator_id ?? '';
  const maxScore = questionMaxScore ?? recordedMaxScore;
  const itemId = record['材料编号'] ?? record.item_id;
  const nodeId = record['节点编号'] ?? record.node_id;
  const topicId = record['主题编号'] ?? record.topic_id;
  const studentAnswer = record['学生最终作答'] ?? record.answer ?? '';
  const referenceAnswer = question?.['参考答案'] ?? question?.answer ?? '';
  const pointAudit = parsePointScoreAudit(record['评分点得分'] ?? record.point_scores);
  const pointEntries = pointAudit.entries;
  const pointValues = pointEntries.map((entry) => entry.score);
  const pointSum = pointValues.length ? pointValues.reduce((sum, value) => sum + value, 0) : null;
  const rubricText = question?.['评分点'] ?? question?.scoring_rubric ?? null;
  const rubricMaximums = rubricText === null ? null : parseRubricMaximums(rubricText);
  let invalidPointScores = pointAudit.invalid;
  if (status === '已评分' && rubricText !== null) {
    const pointIds = pointEntries.map((entry) => entry.point_id);
    invalidPointScores = pointAudit.invalid || !rubricMaximums
      || new Set(pointIds).size !== pointIds.length
      || new Set(pointIds).size !== rubricMaximums.size
      || pointIds.some((pointId) => !rubricMaximums.has(pointId))
      || pointEntries.some((entry) => entry.score < 0 || entry.score > rubricMaximums.get(entry.point_id));
  }

  if (!question) codes.push('missing_question');
  if (!node) codes.push('unknown_node');
  if (question) {
    if (topicId && questionTopicId && topicId !== questionTopicId) codes.push('topic_mismatch');
    if (!questionIndicatorId) codes.push('indicator_missing');
    if (recordedMaxScore !== null && questionMaxScore !== null && recordedMaxScore !== questionMaxScore) {
      codes.push('max_score_mismatch');
    }
  }

  const availableItems = node ? splitIds(node['可用题目编号'] ?? node.available_item_ids) : [];
  if (node && itemId && !availableItems.includes(itemId)) codes.push('node_scope_conflict');

  if (status === '已评分') {
    if (originalScore === null) codes.push('graded_score_missing');
    if (invalidPointScores) codes.push('invalid_point_scores');
    if (maxScore !== null && originalScore !== null && (originalScore < 0 || originalScore > maxScore)) {
      codes.push('score_out_of_range');
    }
    if (pointSum !== null && originalScore !== null && pointSum !== originalScore) {
      codes.push('score_point_conflict');
    }
    if (pointSum !== null && maxScore !== null && pointSum > maxScore) codes.push('point_sum_over_max');
    if (
      pointSum === 0
      && maxScore !== null
      && maxScore > 0
      && normalizeComparableAnswer(studentAnswer)
      && normalizeComparableAnswer(studentAnswer) === normalizeComparableAnswer(referenceAnswer)
    ) {
      codes.push('answer_key_zero_conflict');
    }
  }

  let resolvedScore = originalScore;
  let scoreSource = 'original';
  if (status === '已评分') {
    const pointSumIsValid = !invalidPointScores && pointSum !== null && pointSum >= 0 && maxScore !== null && pointSum <= maxScore;
    const originalIsValid = originalScore !== null && maxScore !== null && originalScore >= 0 && originalScore <= maxScore;
    if (!originalIsValid && pointSumIsValid) {
      resolvedScore = pointSum;
      scoreSource = 'point_sum';
    } else if (originalIsValid && pointSum !== null && pointSum !== originalScore && pointSumIsValid) {
      resolvedScore = pointSum;
      scoreSource = 'point_sum';
    } else if (!originalIsValid) {
      resolvedScore = null;
      scoreSource = 'review_required';
    }
  }

  const canonicalTopicId = questionTopicId || topicId || '';
  const canonicalIndicatorId = questionIndicatorId || record['指标编号'] || record.indicator_id || '';
  const reviewRequired = codes.length > 0;
  return {
    issueCodes: [...new Set(codes)],
    reviewRequired,
    reason: reviewRequired ? issueReason([...new Set(codes)]) : '',
    originalScore,
    recordedMaxScore,
    questionMaxScore,
    pointScoreValues: pointValues,
    pointScoreSum: pointSum,
    invalidPointScores,
    resolvedScore,
    scoreSource,
    canonicalTopicId,
    canonicalIndicatorId,
    maxScore,
    nodeId,
    itemId,
    answerMatchesKey: normalizeComparableAnswer(studentAnswer) !== ''
      && normalizeComparableAnswer(studentAnswer) === normalizeComparableAnswer(referenceAnswer)
  };
}
