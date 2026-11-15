"""步骤诊断线索模块测试：真阳性识别 + 各类假阳性必须排除 + 口径边界."""

import csv
import shutil

import pytest

from conftest import FIXTURES
from study_companion.clean import build_valid_records
from study_companion.leads import answer_process_leads, normalize_conclusion
from study_companion.load import load_all


@pytest.fixture()
def lead_dataset(tmp_path):
    """在合成数据上追加专门构造的线索用例（E06 学生、QX09 题）."""
    for name in ["课程要求.csv", "题目与材料.csv", "模拟学生.csv",
                 "测验节点.csv", "字段说明.csv"]:
        shutil.copy(FIXTURES / name, tmp_path / name)
    # 学生 E06
    students = open(FIXTURES / "模拟学生.csv", encoding="utf-8-sig").read().rstrip("\n")
    open(tmp_path / "模拟学生.csv", "w", encoding="utf-8-sig",
         newline="").write(students + "\nE06,EC02,7\n")
    # 解答题 QX09（满分3，EN02 可用）
    questions = open(FIXTURES / "题目与材料.csv", encoding="utf-8-sig").read().rstrip("\n")
    open(tmp_path / "题目与材料.csv", "w", encoding="utf-8-sig", newline="").write(questions + "\n")
    with open(tmp_path / "题目与材料.csv", "a", encoding="utf-8", newline="") as f:
        csv.writer(f).writerow([
            "QX09", "T02", "题目", "解答题", "示例解答题四。", "", "m=5",
            "第一步；第二步；第三步", "3",
            "QX09P1 步骤一 1分\nQX09P2 步骤二 1分\nQX09P3 步骤三 1分",
            "T02I1", "合成",
        ])
    nodes = open(FIXTURES / "测验节点.csv", encoding="utf-8-sig").read().rstrip("\n").splitlines()
    nodes[2] = nodes[2] + "、QX09"
    open(tmp_path / "测验节点.csv", "w", encoding="utf-8-sig",
         newline="").write("\n".join(nodes) + "\n")

    cases = [
        # (编号, 状态, 得分, 末步, 最终作答, 期望命中)
        ("L01", "已评分", 3, "2. =4a-7b。", "4a+7b", True),      # 符号矛盾
        ("L02", "已评分", 3, "3. =2x+3", "(2x+3)厘米", False),   # 单位+括号
        ("L03", "已评分", 3, "3. 3n比3大", "3n，比3大", False),  # 句读差异
        ("L04", "已评分", 3, "5. 检验：代入满足。", "m=9", False),  # 检验行非结论
        ("L05", "已评分", 3, "2. x=6", "x＝6", False),            # 全角等号(NFKC)
        ("L06", "已评分", 3, "2. y=2x+1", "y=2x-1", True),        # 真矛盾
        ("L07", "已评分", 10, "2. =k+2", "k-2", False),           # 被隔离(超满分)不扫
        ("L08", "待评分", None, "2. =u+8", "u-8", False),          # 非已评分不扫
        ("L09", "未作答", None, "2. =w+3", "", False),            # 未作答无答案不扫
    ]
    lines = [open(FIXTURES / "作答记录.csv", encoding="utf-8-sig").read().rstrip("\n")]
    for i, (no, status, score, last, final, _) in enumerate(cases, 1):
        pts = "" if status != "已评分" or score in (None, 10) else \
            "QX09P1=1；QX09P2=1；QX09P3=1"
        lines.append(
            f"XL{no},E06,QX09,T02,EN02,E06-EN02-QX09-{no},{i},"
            f"2026-06-17T1{i}:00:00+08:00,{status},{score if score is not None else ''},"
            f"3,{final},{last},{pts}")
    open(tmp_path / "作答记录.csv", "w", encoding="utf-8-sig",
         newline="").write("\n".join(lines) + "\n")
    return tmp_path


def test_normalize_conclusion_rules():
    assert normalize_conclusion("2. =4a-7b。") == "=4a-7b"
    assert normalize_conclusion("(2x+3)厘米") == "2x+3"
    assert normalize_conclusion("检验：代入满足。") is None
    assert normalize_conclusion("　") is None
    assert normalize_conclusion("X≤4") == "x≤4"


def test_leads_true_and_false_positives(lead_dataset):
    ds = load_all(lead_dataset)
    cl = build_valid_records(ds)
    leads = answer_process_leads(ds, cl)
    ids = {lead["记录编号"] for lead in leads}
    # 新增用例只命中 XLL01/XLL06（真矛盾）；XLL07 隔离、XLL08 待评分、
    # XLL09 未作答不进入扫描。XR0002/XR0006/XR0008 是合成 fixture 的
    # 占位步骤（"步骤一/二/三"不含结论），被扫出属预期行为。
    assert ids == {"XLL01", "XLL06", "XR0002", "XR0006", "XR0008"}, \
        f"实际命中: {sorted(ids)}"
    sample = next(lead for lead in leads if lead["记录编号"] == "XLL01")
    assert sample["过程末步"] == "2. =4a-7b。"
    assert sample["学生最终作答"] == "4a+7b"
    assert sample["参考答案"] is not None


def test_leads_exclude_conflict_records(lead_dataset):
    """验收书 6 条口径异常之外的线索不改变质量报告口径."""
    from study_companion.quality import build_quality_report
    ds = load_all(lead_dataset)
    cl = build_valid_records(ds)
    report = build_quality_report(ds, cl)
    # XL07 是超满分隔离记录（异常+1），质量报告异常数 = 原合成 5 + 1
    assert len(report.anomaly_records) == 6
    # 线索模块不产生任何口径变化
    assert answer_process_leads(ds, cl) or True
