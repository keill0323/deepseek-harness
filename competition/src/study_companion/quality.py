"""质量报告：版本归并摘要 + 异常清单（含处置与依据）+ 状态分布."""

from dataclasses import dataclass
from typing import Dict, List, Optional

from .clean import (
    CleanResult,
    DISPOSITIONS,
    ISSUE_SCORE_REPAIRED_FROM_POINTS,
)
from .schema import (
    Dataset,
    FLAG_CORRECTED,
    FLAG_EXCLUDED,
    FLAG_NORMAL,
    FLAG_REVIEW_KEPT,
    PENDING,
    SCORED,
    UNANSWERED,
)

ISSUE_LABELS = {
    "theme_mismatch": "作答主题与题库主题不一致",
    "score_exceeds_full": "得分超出满分",
    "total_points_mismatch": "总分与评分点合计不一致",
    "node_out_of_scope": "材料超出节点可用范围",
    "semantic_review": "答案与参考答案一致但记0分（语义复核）",
    "full_score_mismatch_bank": "记录满分与题库不一致",
    "score_repaired_from_points": "得分按评分点合计修正（纠正）",
    "invalid_point_scores": "评分点编号、取值或范围不可信",
    "score_negative": "得分为负数",
}


@dataclass
class QualityReport:
    row_count: int
    event_count: int
    superseded_count: int
    status_counts: Dict[str, int]
    flag_counts: Dict[str, int]
    anomaly_records: List[Dict]
    merge_entries: List[Dict]
    policy: str = "repair_consistent_points"
    observations: Optional[Dict] = None

    def to_dict(self) -> Dict:
        return {
            "原始行数": self.row_count,
            "归并后事件数": self.event_count,
            "被归并版本数": self.superseded_count,
            "处置策略": self.policy,
            "评分状态分布": self.status_counts,
            "统计口径分布": self.flag_counts,
            "异常记录": self.anomaly_records,
            "版本归并明细": self.merge_entries,
            "数据观察": self.observations or {},
        }

    def summary_lines(self) -> List[str]:
        lines = [
            f"原始行数 {self.row_count} -> 归并后事件数 {self.event_count}"
            f"（被归并旧版本 {self.superseded_count} 条，不重复计数）",
            "评分状态分布: " + ", ".join(f"{k}={v}" for k, v in sorted(self.status_counts.items())),
            "统计口径分布: " + ", ".join(f"{k}={v}" for k, v in sorted(self.flag_counts.items())),
            f"异常记录共 {len(self.anomaly_records)} 条：",
        ]
        for a in self.anomaly_records:
            issues = "、".join(ISSUE_LABELS.get(i, i) for i in a["异常类型"])
            lines.append(
                f"  {a['记录编号']} {a['学生编号']}/{a['材料编号']}/{a['节点编号']}"
                f"｜{issues}｜口径={a['统计口径']}"
            )
        return lines


def build_quality_report(dataset: Dataset, clean: CleanResult,
                         policy: str = "repair_consistent_points") -> QualityReport:
    status_counts = {SCORED: 0, PENDING: 0, UNANSWERED: 0}
    flag_counts = {FLAG_NORMAL: 0, FLAG_CORRECTED: 0,
                   FLAG_REVIEW_KEPT: 0, FLAG_EXCLUDED: 0}
    anomalies: List[Dict] = []
    for vr in clean.valid_records:
        status_counts[vr.record.scoring_status] += 1
        flag_counts[vr.stats_flag] += 1
        if vr.issues:
            anomalies.append({
                "记录编号": vr.record.record_id,
                "学生编号": vr.record.student_id,
                "材料编号": vr.record.material_id,
                "节点编号": vr.record.node_id,
                "评分状态": vr.record.scoring_status,
                "得分": vr.record.score,
                "满分": vr.record.full_score,
                "学生最终作答": vr.record.final_answer,
                "异常类型": list(vr.issues),
                "统计口径": vr.stats_flag,
                "处置与依据": [
                    {
                        "类型": issue,
                        "说明": ISSUE_LABELS.get(issue, issue),
                        # 差异化处置下，被"评分点自洽修正"取代的 issue 不再显示
                        # 静态的"隔离"文案——报告必须反映实际生效的处置
                        "处置": (f"已被「{ISSUE_LABELS['score_repaired_from_points']}」"
                                 f"取代：本记录实际按评分点合计纠正（corrected）"
                                 if ISSUE_SCORE_REPAIRED_FROM_POINTS in vr.issues
                                 and issue in ("score_exceeds_full",
                                               "total_points_mismatch")
                                 else DISPOSITIONS[issue]["处置"]),
                        "依据": DISPOSITIONS[issue]["依据"],
                    }
                    for issue in vr.issues
                ],
            })
    return QualityReport(
        row_count=clean.row_count,
        event_count=clean.event_count,
        superseded_count=clean.row_count - clean.event_count,
        status_counts=status_counts,
        flag_counts=flag_counts,
        anomaly_records=anomalies,
        merge_entries=[entry.to_dict() for entry in clean.merge_log],
        policy=policy,
        observations=build_observations(dataset, clean),
    )


def build_observations(dataset: Dataset, clean: CleanResult) -> Dict:
    """非阻塞数据观察：记录不足 / 未测量，供"暂不能确定的内容"说明用.

    与异常处置（阻塞、改口径）不同，观察不改任何统计——只把
    "哪里信息不足、不能下结论"机器化地列出来（任务二要求）。
    """
    # 1) 未决待评分：归并后仍待评分的当前记录（分数悬而未决）
    unresolved_pending = sorted(
        vr.record.record_id for vr in clean.valid_records
        if vr.record.scoring_status == PENDING)

    # 2) 节点×题目：可用但无任何计入统计作答（按节点分别判断——
    #    某题在 A 节点有有效作答不代表 B 节点不缺）
    in_stats = {(vr.record.node_id, vr.record.material_id)
                for vr in clean.valid_records
                if vr.record.scoring_status == SCORED and vr.stats_flag in
                {FLAG_NORMAL, FLAG_CORRECTED, FLAG_REVIEW_KEPT}}
    question_gaps = {}
    for node_id in sorted(dataset.nodes):
        node = dataset.node(node_id)
        gaps = sorted(q for q in node.available_questions
                      if (node_id, q) not in in_stats)
        if gaps:
            question_gaps[node_id] = gaps

    # 3) 指标零覆盖：课程要求的观察指标中没有任何有效作答测量过的
    measured = set()
    for vr in clean.valid_records:
        if vr.record.scoring_status == SCORED and vr.stats_flag in \
                {FLAG_NORMAL, FLAG_CORRECTED, FLAG_REVIEW_KEPT}:
            question = dataset.question(vr.record.material_id)
            if question is not None and question.indicator_id:
                measured.add(question.indicator_id)
    unmeasured_indicators = sorted(
        set(dataset.indicators()) - measured)

    # 4) 学生×节点零记录：记录不足案例线索（不得推断为未掌握）
    students_with_records = {}
    for vr in clean.valid_records:
        students_with_records.setdefault(vr.record.node_id, set()).add(
            vr.record.student_id)
    no_record_cases = {}
    for node_id in sorted(dataset.nodes):
        missing = sorted(set(dataset.students) -
                         students_with_records.get(node_id, set()))
        if missing:
            no_record_cases[node_id] = missing

    return {
        "未决待评分": unresolved_pending,
        "节点_题目_无有效作答": question_gaps,
        "指标_零覆盖": unmeasured_indicators,
        "节点_学生_零记录": no_record_cases,
        "解读提示": "以上为信息不足清单，不参与统计口径；分析时须注明"
                    "'暂不能确定'，不得解释为未掌握或全部掌握。",
    }
