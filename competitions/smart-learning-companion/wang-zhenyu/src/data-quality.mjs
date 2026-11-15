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

export function parsePointScoreValues(value) {
  const matches = [...String(value ?? '').matchAll(/=\s*(-?\d+(?:\.\d+)?)/g)];
  return matches.map((match) => Number(match[1])).filter(Number.isFinite);
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
    answer_key_zero_conflict: '最终作答与参考答案一致但评分为零，需人工复核'
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
  const pointValues = parsePointScoreValues(record['评分点得分'] ?? record.point_scores);
  const pointSum = pointValues.length ? pointValues.reduce((sum, value) => sum + value, 0) : null;

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
    const pointSumIsValid = pointSum !== null && pointSum >= 0 && maxScore !== null && pointSum <= maxScore;
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
