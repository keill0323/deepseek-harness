"""统一清洗入口：版本归并 + 异常识别与处置.

规则来源：四人 24 小时开发任务与验收书 + 赛题材料。全部处置附"依据"，
满足验收项"异常处理：已知冲突均被识别/复核，处理依据可追溯"。

版本归并
    同一 ``作答事件编号`` 的多个修订版本只保留最高版本进入"当前有效记录"；
    被归并的旧版本保留在 ``ValidRecord.history``，可查（保留原文与历史）。

异常识别（对归并后的当前记录）
    theme_mismatch        作答主题与题库主题不一致 -> 以题库为准修正主题，
                          记录保留参与统计（corrected）
    score_exceeds_full    得分 > 满分（含 10/1、4/3）-> 隔离，不参与统计
    total_points_mismatch 总分与评分点合计不一致 -> 隔离，不参与统计
    node_out_of_scope     材料不在该节点可用题集（如 N01 出现 T03 题）
                          -> 不改节点（不能仅按时间戳擅自改节点），隔离
    semantic_review       学生答案与参考答案一致却记 0 分
                          -> 保留原分参与统计并标记人工复核（不擅自改分）

状态口径
    待评分 / 未作答：不参与得分统计，但计入"各状态数量"；
    无记录：由 coverage 模块处理，绝不解释为未掌握或 0 分。
"""

import unicodedata
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from .schema import (
    AnswerRow,
    Dataset,
    ValidRecord,
    FLAG_CORRECTED,
    FLAG_EXCLUDED,
    FLAG_NORMAL,
    FLAG_REVIEW_KEPT,
    PENDING,
    SCORED,
    UNANSWERED,
)

ISSUE_THEME_MISMATCH = "theme_mismatch"
ISSUE_SCORE_EXCEEDS_FULL = "score_exceeds_full"
ISSUE_TOTAL_POINTS_MISMATCH = "total_points_mismatch"
ISSUE_NODE_OUT_OF_SCOPE = "node_out_of_scope"
ISSUE_SEMANTIC_REVIEW = "semantic_review"
ISSUE_FULL_MISMATCH_BANK = "full_score_mismatch_bank"
ISSUE_SCORE_REPAIRED_FROM_POINTS = "score_repaired_from_points"
ISSUE_INVALID_POINT_SCORES = "invalid_point_scores"
ISSUE_SCORE_NEGATIVE = "score_negative"

# 处置规则与依据（写入质量报告，保证可追溯）
DISPOSITIONS = {
    ISSUE_THEME_MISMATCH: {
        "处置": "以题目与材料表的主题为准修正 effective_theme，记录保留参与统计",
        "依据": "题目与材料.csv 是主题-材料的权威映射；作答记录中的主题列为誊录字段",
    },
    ISSUE_SCORE_EXCEEDS_FULL: {
        "处置": "隔离（excluded）：不参与得分统计，证据保留待人工复核",
        "依据": "验收书：得分超出满分不能直接进入统计；总分与分项均无法仲裁真值",
    },
    ISSUE_SCORE_REPAIRED_FROM_POINTS: {
        "处置": "按评分点合计修正得分（corrected）：评分点合计与满分一致时，"
                "以评分点合计为有效得分（需开启 repair_consistent_points 策略）",
        "依据": "评分点合计==满分构成自洽证据链，总分疑为誊录错误；策略由全队拍板",
    },
    ISSUE_TOTAL_POINTS_MISMATCH: {
        "处置": "隔离（excluded）：不参与得分统计，证据保留待人工复核",
        "依据": "总分与评分点合计矛盾时无法仲裁真值，验收书要求处理留依据",
    },
    ISSUE_NODE_OUT_OF_SCOPE: {
        "处置": "保留原节点不迁移，隔离（excluded）：不参与该节点统计",
        "依据": "验收书：不能仅按时间戳擅自改节点；测验节点表的可用题目为节点范围依据",
    },
    ISSUE_SEMANTIC_REVIEW: {
        "处置": "保留原分参与统计，标记 semantic_review 待人工复核",
        "依据": "验收书：答案与参考答案相符但记 0 分进入语义评分复核；不擅自改分",
    },
    ISSUE_FULL_MISMATCH_BANK: {
        "处置": "以题库满分为准修正 effective_full_score，记录保留",
        "依据": "题目与材料.csv 是满分权威来源",
    },
    ISSUE_INVALID_POINT_SCORES: {
        "处置": "隔离（excluded）：评分点编号、取值或范围不可信，不参与得分统计",
        "依据": "评分点必须属于当前题目，且每一项得分非负、不超过该项满分",
    },
    ISSUE_SCORE_NEGATIVE: {
        "处置": "隔离（excluded）：负分不参与统计，证据保留待人工复核",
        "依据": "得分必须为非负数；负分不能生成有效得分率",
    },
}


@dataclass
class MergeLogEntry:
    event_id: str
    kept_record_id: str
    kept_revision: int
    superseded: List[Tuple[str, int]]  # (record_id, revision)
    changes: Dict[str, List[str]]      # 字段 -> [旧值, 新值]

    def to_dict(self) -> Dict:
        return {
            "作答事件编号": self.event_id,
            "保留记录": self.kept_record_id,
            "保留版本": self.kept_revision,
            "被归并记录": [{"记录编号": rid, "版本": rev} for rid, rev in self.superseded],
            "字段变化": {k: v for k, v in self.changes.items()},
        }


@dataclass
class CleanResult:
    valid_records: List[ValidRecord]
    merge_log: List[MergeLogEntry]
    row_count: int
    event_count: int

    def counts_by_flag(self) -> Dict[str, int]:
        counts = {}
        for vr in self.valid_records:
            counts[vr.stats_flag] = counts.get(vr.stats_flag, 0) + 1
        return counts


def _diff_fields(old: AnswerRow, new: AnswerRow) -> Dict[str, List[str]]:
    changes = {}
    for attr, label in [
        ("scoring_status", "评分状态"), ("score", "得分"),
        ("final_answer", "学生最终作答"), ("submitted_at", "模拟提交时间"),
    ]:
        ov, nv = getattr(old, attr), getattr(new, attr)
        if ov != nv:
            changes[label] = [str(ov), str(nv)]
    return changes


def merge_versions(rows: List[AnswerRow]) -> Tuple[List[ValidRecord], List[MergeLogEntry]]:
    """按作答事件编号归并：保留最高修订版本，其余进入 history.

    输出按记录编号规范排序（canonical order）：产物顺序与输入行序
    彻底解耦——打乱输入行后所有产物逐字节一致（见 test_properties）。
    """
    by_event: Dict[str, List[AnswerRow]] = {}
    for row in rows:
        by_event.setdefault(row.event_id, []).append(row)

    valid: List[ValidRecord] = []
    log: List[MergeLogEntry] = []
    for event_id, versions in by_event.items():
        ordered = sorted(versions, key=lambda r: r.revision)
        current = ordered[-1]
        superseded = ordered[:-1]
        if superseded:
            changes = {}
            for old in superseded:
                for k, v in _diff_fields(old, current).items():
                    changes[k] = v
            log.append(MergeLogEntry(
                event_id=event_id,
                kept_record_id=current.record_id,
                kept_revision=current.revision,
                superseded=[(r.record_id, r.revision) for r in superseded],
                changes=changes,
            ))
        valid.append(ValidRecord(
            record=current,
            effective_theme=current.theme_recorded,
            effective_score=current.score,
            effective_full_score=current.full_score,
            stats_flag=FLAG_NORMAL,
            issues=[],
            history=superseded,
        ))
    valid.sort(key=lambda vr: vr.record.record_id)
    log.sort(key=lambda entry: entry.event_id)
    return valid, log


def normalize_answer(text: str) -> str:
    """答案归一化：全角转半角、去空白、统一小写，用于语义比对."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKC", text)
    return "".join(text.split()).lower()


def detect_issues(vr: ValidRecord, dataset: Dataset,
                  repair_consistent_points: bool = True) -> ValidRecord:
    """对单条当前记录识别异常并给出统计口径处置.

    差异化处置（默认开启，2026-11-14 依据老师说明确定：异常数据由系统
    检测并处理——能纠正的纠正、不能仲裁的忽略）：
    - 得分超出满分、且评分点合计==满分（证据自洽）-> 以评分点合计为
      有效得分（corrected，纠正）；
    - 得分与评分点相互矛盾且无自洽证据（如评分点合计!=满分）-> 隔离
      （excluded，忽略），保留证据待人工复核；
    - repair_consistent_points=False 可退回保守模式（全部隔离）。
    """
    row = vr.record
    question = dataset.question(row.material_id)
    node = dataset.node(row.node_id)
    issues: List[str] = []

    # 1) 主题与题库不一致（仅题目类材料有权威主题）
    if question is not None and question.theme_id:
        if row.theme_recorded != question.theme_id:
            issues.append(ISSUE_THEME_MISMATCH)
            vr.effective_theme = question.theme_id  # 修正

    # 2) 满分与题库不一致 -> 以题库为准修正到 effective_full_score
    #    （不原地改解析层 AnswerRow——分层原则：检测层只产出有效值）
    if (question is not None and question.full_score is not None
            and row.full_score is not None and row.full_score != question.full_score):
        issues.append(ISSUE_FULL_MISMATCH_BANK)
        vr.effective_full_score = question.full_score

    # 3) 得分范围、评分点来源与总分一致性（仅已评分，按有效满分判断）
    effective_full = vr.effective_full_score
    if row.scoring_status == SCORED and row.score is not None:
        if row.score < 0:
            issues.append(ISSUE_SCORE_NEGATIVE)
        if effective_full is not None and row.score > effective_full:
            issues.append(ISSUE_SCORE_EXCEEDS_FULL)
        rubric = question.scoring_points if question is not None else []
        rubric_by_id = {point.point_id: point.score for point in rubric}
        point_scores_invalid = bool(rubric) and (
            len(rubric_by_id) != len(rubric)
            or set(row.point_scores) != set(rubric_by_id)
            or any(
                value < 0 or value > rubric_by_id.get(point_id, -1)
                for point_id, value in row.point_scores.items()
            )
        )
        if point_scores_invalid:
            issues.append(ISSUE_INVALID_POINT_SCORES)
        if row.point_scores and sum(row.point_scores.values()) != row.score:
            issues.append(ISSUE_TOTAL_POINTS_MISMATCH)

    # 4) 节点范围外材料
    if node is not None and row.material_id not in node.available_questions:
        issues.append(ISSUE_NODE_OUT_OF_SCOPE)

    # 5) 答案与参考答案一致但记 0 分（语义复核）
    if (row.scoring_status == SCORED and row.score == 0
            and question is not None and question.answer
            and normalize_answer(row.final_answer) == normalize_answer(question.answer)
            and normalize_answer(row.final_answer) != ""):
        issues.append(ISSUE_SEMANTIC_REVIEW)

    # 口径：隔离 > 评分点自洽修正 > 修正 > 复核保留 > 正常
    if (ISSUE_SCORE_EXCEEDS_FULL in issues
            and repair_consistent_points
            and ISSUE_INVALID_POINT_SCORES not in issues
            and ISSUE_SCORE_NEGATIVE not in issues
            and ISSUE_NODE_OUT_OF_SCOPE not in issues
            and row.point_scores
            and effective_full is not None
            and sum(row.point_scores.values()) == effective_full):
        # 方案 B：评分点合计==满分 -> 以评分点合计为准（corrected）
        issues.append(ISSUE_SCORE_REPAIRED_FROM_POINTS)
        vr.effective_score = sum(row.point_scores.values())
        vr.stats_flag = FLAG_CORRECTED
    elif ISSUE_SCORE_EXCEEDS_FULL in issues or ISSUE_TOTAL_POINTS_MISMATCH in issues \
            or ISSUE_NODE_OUT_OF_SCOPE in issues or ISSUE_INVALID_POINT_SCORES in issues \
            or ISSUE_SCORE_NEGATIVE in issues:
        vr.stats_flag = FLAG_EXCLUDED
        vr.effective_score = None
    elif ISSUE_THEME_MISMATCH in issues or ISSUE_FULL_MISMATCH_BANK in issues:
        vr.stats_flag = FLAG_CORRECTED
    elif ISSUE_SEMANTIC_REVIEW in issues:
        vr.stats_flag = FLAG_REVIEW_KEPT
    else:
        vr.stats_flag = FLAG_NORMAL
    vr.issues = issues
    return vr


def build_valid_records(dataset: Dataset,
                        repair_consistent_points: bool = True) -> CleanResult:
    """统一清洗入口：全队唯一入口，返回当前有效记录 + 归并日志.

    repair_consistent_points：见 detect_issues docstring。
    默认 True = 差异化处置（纠正自洽 / 忽略不自洽）。
    """
    valid, log = merge_versions(dataset.rows)
    valid = [detect_issues(vr, dataset, repair_consistent_points)
             for vr in valid]
    return CleanResult(
        valid_records=valid,
        merge_log=log,
        row_count=len(dataset.rows),
        event_count=len(valid),
    )
