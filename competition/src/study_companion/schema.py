"""领域对象（当前记录结构契约的一部分，对应 shared/contracts）.

所有对象保留 ``raw`` 原始行：验收要求"当前记录：保留原文与可查询的历史记录"。
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional

# 评分状态取值
SCORED = "已评分"
PENDING = "待评分"
UNANSWERED = "未作答"

# 统计口径（stats_flag）取值：
#   normal        正常参与统计
#   corrected     字段按权威来源修正后参与统计（如主题以题库为准）
#   review_kept   疑似评分有误，保留原分参与统计并标记人工复核
#   excluded      冲突未仲裁，不参与得分统计（隔离，证据保留）
FLAG_NORMAL = "normal"
FLAG_CORRECTED = "corrected"
FLAG_REVIEW_KEPT = "review_kept"
FLAG_EXCLUDED = "excluded"


@dataclass
class Requirement:
    """课程要求：主题 x 观察指标."""

    theme_id: str
    theme_name: str
    theme_goal: str
    indicator_id: str
    indicator: str
    standard_id: str
    standard_loc: str
    textbook_pages: str
    raw: Dict[str, str]


@dataclass
class ScoringPoint:
    point_id: str
    text: str
    score: int


@dataclass
class Question:
    """题目与材料（题目 / 学习卡 / 教材切片）."""

    material_id: str
    theme_id: Optional[str]
    material_type: str
    question_type: str
    content: str
    options: List[str]
    answer: str
    analysis: str
    full_score: Optional[int]
    scoring_points: List[ScoringPoint]
    indicator_id: str
    source_file: str
    raw: Dict[str, str]


@dataclass
class Student:
    student_id: str
    class_id: str
    grade: int
    raw: Dict[str, str]


@dataclass
class TestNode:
    node_id: str
    date: str
    themes_taught: List[str]
    description: str
    available_questions: List[str]
    raw: Dict[str, str]


@dataclass
class AnswerRow:
    """作答记录原始行（一行一个修订版本）."""

    record_id: str
    student_id: str
    material_id: str
    theme_recorded: str
    node_id: str
    event_id: str
    revision: int
    submitted_at: str
    scoring_status: str
    score: Optional[int]
    full_score: Optional[int]
    final_answer: str
    solution_steps: List[str]
    point_scores: Dict[str, int]
    raw: Dict[str, str]
    point_scores_invalid: bool = False


@dataclass
class ValidRecord:
    """当前有效记录：版本归并后的最新版本 + 清洗处置结果.

    这是发给队友的"当前记录"——统计、比较、诊断、建议只用它。
    """

    record: AnswerRow
    effective_theme: str          # 以题库为准的主题（作答誊录主题与题库不一致时的修正结果）
    effective_score: Optional[int]      # 隔离记录为 None
    effective_full_score: Optional[int]  # 以题库为准的满分（记录满分誊录错误时的修正结果）
    stats_flag: str               # FLAG_* 常量
    issues: List[str]             # 命中的异常类型（quality report 对应）
    superseded_by_revision: bool = False  # 恒 False（被归并的行不进入该结构）
    history: List[AnswerRow] = field(default_factory=list)  # 被归并的旧版本


@dataclass
class Dataset:
    requirements: List[Requirement]
    questions: Dict[str, Question]
    students: Dict[str, Student]
    nodes: Dict[str, TestNode]
    rows: List[AnswerRow]
    field_doc: List[Dict[str, str]]

    # ---- 便捷查询 ----
    def question(self, material_id: str) -> Optional[Question]:
        return self.questions.get(material_id)

    def node(self, node_id: str) -> Optional[TestNode]:
        return self.nodes.get(node_id)

    def student(self, student_id: str) -> Optional[Student]:
        return self.students.get(student_id)

    def indicators(self) -> List[str]:
        return [r.indicator_id for r in self.requirements]

    def themes(self) -> List[str]:
        seen = []
        for r in self.requirements:
            if r.theme_id not in seen:
                seen.append(r.theme_id)
        return seen
