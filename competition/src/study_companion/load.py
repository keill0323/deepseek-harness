"""六表加载与字段映射.

字段映射原则：中文列名 -> 英文 snake_case 属性；中文列名保留在 FIELD_MAPPING
并可通过 ``write_field_mapping`` 导出为 CSV（T+2h 交付物之一）。
加载阶段只做结构校验（缺列、引用不存在），业务异常（超满分、主题不一致等）
由 clean 模块统一识别，保证"统一清洗入口"唯一。
"""

import csv
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .config import DATA_FILES
from .schema import (
    AnswerRow,
    Dataset,
    Question,
    Requirement,
    ScoringPoint,
    Student,
    TestNode,
    PENDING,
    SCORED,
    UNANSWERED,
)


class LoadError(Exception):
    """数据结构不符合契约（缺文件 / 缺列 / 引用不存在）。"""


# 中文列名 -> (英文属性, 类型, 说明)
FIELD_MAPPING: Dict[str, Tuple[str, str, str]] = {
    # 课程要求
    "主题编号": ("theme_id", "文本", "学习主题编号 T01—T03"),
    "主题": ("theme_name", "文本", "主题名称"),
    "主题目标": ("theme_goal", "文本", "该主题学习目标"),
    "指标编号": ("indicator_id", "文本", "观察指标编号，如 T01I1"),
    "观察指标": ("indicator", "文本", "指标具体内容"),
    "课标整理编号": ("standard_id", "文本", "课标条目整理编号 CR01—CR03"),
    "课标文件页／正文页": ("standard_loc", "文本", "课标 PDF 中位置"),
    "教材正文页": ("textbook_pages", "文本", "教材印刷页码范围"),
    # 题目与材料
    "材料编号": ("material_id", "文本", "Q/L/B 编号"),
    "材料类型": ("material_type", "文本", "题目/学习卡/教材"),
    "题型": ("question_type", "文本", "选择题/填空题/解答题"),
    "题干或内容": ("content", "文本", "题干或材料正文"),
    "选项": ("options", "文本", "选择题选项，每行一个"),
    "参考答案": ("answer", "文本", "参考答案"),
    "参考解析": ("analysis", "文本", "参考解题思路"),
    "满分": ("full_score", "整数", "题目满分，1 或 3"),
    "评分点": ("scoring_points", "文本", "每行一个：编号 内容 分值"),
    "来源或资料文件": ("source_file", "文本", "材料来源或文件位置"),
    # 模拟学生
    "学生编号": ("student_id", "文本", "D01—D40"),
    "模拟班级编号": ("class_id", "文本", "DC01、DC02"),
    "年级": ("grade", "整数", "7"),
    # 测验节点
    "节点编号": ("node_id", "文本", "N01、N02"),
    "模拟测验日期": ("date", "日期", "YYYY-MM-DD"),
    "已教及测量主题": ("themes_taught", "文本", "主题编号、分隔"),
    "说明": ("description", "文本", "教学进度说明"),
    "可用题目编号": ("available_questions", "文本", "材料编号、分隔"),
    # 作答记录
    "记录编号": ("record_id", "文本", "DR+四位序号，每行唯一"),
    "作答事件编号": ("event_id", "文本", "学生-节点-材料"),
    "修订版本": ("revision", "整数", "同一事件版本号，从 1 起"),
    "模拟提交时间": ("submitted_at", "日期时间", "ISO 8601 北京时间"),
    "评分状态": ("scoring_status", "文本", "已评分/待评分/未作答"),
    "得分": ("score", "整数", "0 到满分；待评分/未作为空"),
    "学生最终作答": ("final_answer", "文本", "最终答案"),
    "解答过程": ("solution_steps", "文本", "每步一行编号"),
    "评分点得分": ("point_scores", "文本", "编号=得分；分隔"),
    # 字段说明
    "数据表": ("table", "文本", "字段说明表用"),
    "字段名": ("column", "文本", "字段说明表用"),
    "含义": ("meaning", "文本", "字段说明表用"),
    "取值或格式": ("format", "文本", "字段说明表用"),
    "示例": ("example", "文本", "字段说明表用"),
    "为空时": ("when_empty", "文本", "字段说明表用"),
}

VALID_STATUSES = {SCORED, PENDING, UNANSWERED}


def _read_csv(path: Path) -> List[Dict[str, str]]:
    if not path.exists():
        raise LoadError(f"缺少数据文件: {path}")
    with open(path, encoding="utf-8-sig", newline="") as f:
        return [{(k or "").strip(): (v or "").strip() for k, v in row.items()}
                for row in csv.DictReader(f)]


def _require_columns(rows: List[Dict[str, str]], columns: List[str], table: str) -> None:
    if not rows:
        raise LoadError(f"{table} 表为空")
    missing = [c for c in columns if c not in rows[0]]
    if missing:
        raise LoadError(f"{table} 表缺少列: {missing}")


def _to_int(value: str) -> Optional[int]:
    if value in ("", None):
        return None
    return int(value)


def _to_int_checked(value: str, field: str, record_id: str) -> Optional[int]:
    """整数解析失败转为带定位信息的 LoadError（而非裸 traceback）。"""
    if value in ("", None):
        return None
    try:
        return int(value)
    except ValueError:
        raise LoadError(f"{record_id} 的{field}不是整数: {value!r}")


def _split_list(value: str) -> List[str]:
    return [part.strip() for part in value.replace("；", "、").split("、") if part.strip()]


def parse_scoring_points(text: str) -> List[ScoringPoint]:
    """解析评分点文本：每行 "编号 内容 分值"，如 ``Q043P2 除以负数时反向 1分``."""
    points = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        # 末尾 "N分" / "N 分"
        tail = line.rsplit(" ", 1)
        score = None
        if len(tail) == 2 and tail[1].replace("分", "").isdigit():
            score = int(tail[1].replace("分", ""))
            line = tail[0]
        head = line.split(" ", 1)
        point_id = head[0]
        desc = head[1] if len(head) > 1 else ""
        points.append(ScoringPoint(point_id=point_id, text=desc, score=score or 0))
    return points


def parse_point_scores_checked(text: str) -> Tuple[Dict[str, int], bool]:
    """Parse point scores while retaining whether any fragment was malformed or duplicated."""
    result: Dict[str, int] = {}
    invalid = False
    for part in re.split(r"[；;\n]", text):
        part = part.strip()
        if not part:
            continue
        match = re.fullmatch(r"([^=\s]+)\s*=\s*([+-]?\d+)", part)
        if not match:
            invalid = True
            continue
        key, value = match.group(1), int(match.group(2))
        if key in result:
            invalid = True
            continue
        result[key] = value
    return result, invalid


def parse_point_scores(text: str) -> Dict[str, int]:
    """解析评分点得分：``Q043P1=1；Q043P2=0`` -> {'Q043P1': 1, ...}."""
    return parse_point_scores_checked(text)[0]


def load_requirements(data_dir: Path) -> List[Requirement]:
    rows = _read_csv(data_dir / DATA_FILES["requirements"])
    cols = ["主题编号", "主题", "主题目标", "指标编号", "观察指标",
            "课标整理编号", "课标文件页／正文页", "教材正文页"]
    _require_columns(rows, cols, "课程要求")
    return [Requirement(
        theme_id=r["主题编号"], theme_name=r["主题"], theme_goal=r["主题目标"],
        indicator_id=r["指标编号"], indicator=r["观察指标"],
        standard_id=r["课标整理编号"], standard_loc=r["课标文件页／正文页"],
        textbook_pages=r["教材正文页"], raw=r,
    ) for r in rows]


def load_questions(data_dir: Path) -> Dict[str, Question]:
    rows = _read_csv(data_dir / DATA_FILES["materials"])
    cols = ["材料编号", "主题编号", "材料类型", "题型", "题干或内容", "选项",
            "参考答案", "参考解析", "满分", "评分点", "指标编号", "来源或资料文件"]
    _require_columns(rows, cols, "题目与材料")
    questions = {}
    for r in rows:
        q = Question(
            material_id=r["材料编号"],
            theme_id=r["主题编号"] or None,
            material_type=r["材料类型"],
            question_type=r["题型"],
            content=r["题干或内容"],
            options=[o for o in r["选项"].splitlines() if o.strip()],
            answer=r["参考答案"],
            analysis=r["参考解析"],
            full_score=_to_int(r["满分"]),
            scoring_points=parse_scoring_points(r["评分点"]),
            indicator_id=r["指标编号"],
            source_file=r["来源或资料文件"],
            raw=r,
        )
        if q.material_id in questions:
            raise LoadError(f"题目与材料表材料编号重复: {q.material_id}")
        questions[q.material_id] = q
    return questions


def load_students(data_dir: Path) -> Dict[str, Student]:
    rows = _read_csv(data_dir / DATA_FILES["students"])
    _require_columns(rows, ["学生编号", "模拟班级编号", "年级"], "模拟学生")
    return {r["学生编号"]: Student(
        student_id=r["学生编号"], class_id=r["模拟班级编号"],
        grade=_to_int(r["年级"]) or 0, raw=r,
    ) for r in rows}


def load_nodes(data_dir: Path) -> Dict[str, TestNode]:
    rows = _read_csv(data_dir / DATA_FILES["nodes"])
    cols = ["节点编号", "模拟测验日期", "已教及测量主题", "说明", "可用题目编号"]
    _require_columns(rows, cols, "测验节点")
    return {r["节点编号"]: TestNode(
        node_id=r["节点编号"], date=r["模拟测验日期"],
        themes_taught=_split_list(r["已教及测量主题"]),
        description=r["说明"],
        available_questions=_split_list(r["可用题目编号"]),
        raw=r,
    ) for r in rows}


def load_records(data_dir: Path) -> List[AnswerRow]:
    rows = _read_csv(data_dir / DATA_FILES["records"])
    cols = ["记录编号", "学生编号", "材料编号", "主题编号", "节点编号",
            "作答事件编号", "修订版本", "模拟提交时间", "评分状态", "得分",
            "满分", "学生最终作答", "解答过程", "评分点得分"]
    _require_columns(rows, cols, "作答记录")
    parsed = []
    seen_ids = set()
    seen_event_revs = set()
    for r in rows:
        if r["记录编号"] in seen_ids:
            raise LoadError(f"作答记录记录编号重复: {r['记录编号']}")
        seen_ids.add(r["记录编号"])
        status = r["评分状态"]
        if status not in VALID_STATUSES:
            raise LoadError(f"{r['记录编号']} 评分状态非法: {status!r}")
        # 契约强制（字段说明：得分为空时=待评分或未作答）：
        # 已评分必须有整数得分与满分；待评分/未作答不得携带得分。
        # 提前到加载层拒绝，杜绝统计层出现"已评分却无分数"的口径分叉。
        if status == SCORED:
            if not r["得分"] or not r["满分"]:
                raise LoadError(
                    f"{r['记录编号']} 已评分但得分/满分为空：违反字段契约"
                    f"（得分={r['得分']!r}，满分={r['满分']!r}），请先人工核对")
            try:
                int(r["得分"]); int(r["满分"])
            except ValueError:
                raise LoadError(
                    f"{r['记录编号']} 已评分但得分/满分不是整数："
                    f"（得分={r['得分']!r}，满分={r['满分']!r}）")
        elif r["得分"]:
            raise LoadError(
                f"{r['记录编号']} {status}却携带得分 {r['得分']!r}：违反字段契约")
        point_scores, point_scores_invalid = parse_point_scores_checked(r["评分点得分"])
        row = AnswerRow(
            record_id=r["记录编号"], student_id=r["学生编号"],
            material_id=r["材料编号"], theme_recorded=r["主题编号"],
            node_id=r["节点编号"], event_id=r["作答事件编号"],
            revision=_to_int_checked(r["修订版本"], "修订版本", r["记录编号"]) or 1,
            submitted_at=r["模拟提交时间"], scoring_status=status,
            score=_to_int_checked(r["得分"], "得分", r["记录编号"]),
            full_score=_to_int_checked(r["满分"], "满分", r["记录编号"]),
            final_answer=r["学生最终作答"],
            solution_steps=[s for s in r["解答过程"].splitlines() if s.strip()],
            point_scores=point_scores,
            raw=r,
            point_scores_invalid=point_scores_invalid,
        )
        event_rev = (row.event_id, row.revision)
        if event_rev in seen_event_revs:
            raise LoadError(
                f"作答事件 {row.event_id} 的修订版本 {row.revision} 重复"
                f"（记录 {row.record_id}）：版本归并将无法仲裁，请先人工核对")
        seen_event_revs.add(event_rev)
        parsed.append(row)
    return parsed


def load_field_doc(data_dir: Path) -> List[Dict[str, str]]:
    path = data_dir / DATA_FILES["field_doc"]
    if not path.exists():
        return []
    return _read_csv(path)


def check_references(dataset: Dataset) -> None:
    """引用完整性：记录引用的学生 / 材料 / 节点必须存在."""
    for row in dataset.rows:
        if row.student_id not in dataset.students:
            raise LoadError(f"{row.record_id} 引用不存在的学生: {row.student_id}")
        if row.material_id not in dataset.questions:
            raise LoadError(f"{row.record_id} 引用不存在的材料: {row.material_id}")
        if row.node_id not in dataset.nodes:
            raise LoadError(f"{row.record_id} 引用不存在的节点: {row.node_id}")


def load_all(data_dir: Path) -> Dataset:
    data_dir = Path(data_dir)
    dataset = Dataset(
        requirements=load_requirements(data_dir),
        questions=load_questions(data_dir),
        students=load_students(data_dir),
        nodes=load_nodes(data_dir),
        rows=load_records(data_dir),
        field_doc=load_field_doc(data_dir),
    )
    check_references(dataset)
    return dataset


def field_mapping_rows() -> List[Dict[str, str]]:
    """导出字段映射表（中文列名 / 英文字段 / 类型 / 说明）."""
    return [
        {"中文列名": cn, "英文字段": en, "类型": typ, "说明": note}
        for cn, (en, typ, note) in FIELD_MAPPING.items()
    ]
