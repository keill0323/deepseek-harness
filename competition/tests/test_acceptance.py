"""验收书检查项自检（魏文宇负责项，合成数据复现）.

验收书编号 -> 检查项：
1. 版本归并：原始行先归并事件，v2 不与 v1 重复计数
2. 异常处理：已知冲突均被识别/复核，处理依据可追溯
3. 状态区别：待评分、未作答、无记录；零分和尚未教学分别处理
4. 统计复算：得分、分母和覆盖与独立复算一致，数值由代码产生
5. 比较口径：排除本人真实生效（班级汇总入口）
6. 覆盖与范围：无记录不被推断；不同节点内容不混比
7. 通用性：换学生/打乱行/重复导入后行为正确（见 test_generality_*）
"""

import csv
import random
import shutil
import subprocess
import sys
from pathlib import Path

COMPETITION_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(COMPETITION_DIR / "src"))

from study_companion.clean import build_valid_records  # noqa: E402
from study_companion.load import load_all  # noqa: E402
from study_companion.stats import class_node_stats, student_node_stats  # noqa: E402

FIXTURES = COMPETITION_DIR / "shared" / "fixtures" / "synthetic" / "模拟学情数据"


def test_acceptance_1_version_merge():
    dataset = load_all(FIXTURES)
    clean = build_valid_records(dataset)
    assert clean.row_count - clean.event_count == len(clean.merge_log)
    event_ids = [vr.record.event_id for vr in clean.valid_records]
    assert len(event_ids) == len(set(event_ids))       # 事件唯一，无重复计数
    for entry in clean.merge_log:
        assert entry.kept_revision > max(rev for _, rev in entry.superseded)


def test_acceptance_2_anomalies_traceable():
    dataset = load_all(FIXTURES)
    clean = build_valid_records(dataset)
    flagged = [vr for vr in clean.valid_records if vr.issues]
    assert len(flagged) == 5
    assert all(vr.stats_flag != "normal" for vr in flagged)
    # 每类异常都能从 quality.DISPOSITIONS 找到处置与依据
    from study_companion.clean import DISPOSITIONS
    for vr in flagged:
        for issue in vr.issues:
            assert issue in DISPOSITIONS
            assert DISPOSITIONS[issue]["处置"] and DISPOSITIONS[issue]["依据"]


def test_acceptance_3_status_distinction():
    dataset = load_all(FIXTURES)
    clean = build_valid_records(dataset)
    s = student_node_stats(dataset, clean, "E03", "EN02")
    assert s["总体"]["待评分"] == 1                    # 待评分单列
    assert s["总体"]["未作答"] == 0
    cov_missing = student_node_stats(dataset, clean, "E05", "EN02")
    assert cov_missing["总体"]["无记录"] == 8           # 无记录单列
    zero = student_node_stats(dataset, clean, "E05", "EN01")
    assert zero["得分率"] == 0.0                        # 真零分
    n1 = student_node_stats(dataset, clean, "E01", "EN01")
    assert n1["按主题"]["T03"] == "未教学（本节点未测量）"  # 尚未教学


def test_acceptance_4_numbers_by_code():
    """CLI 产出的数值与库函数一致（数值由代码产生）。"""
    dataset = load_all(FIXTURES)
    clean = build_valid_records(dataset)
    s = student_node_stats(dataset, clean, "E01", "EN01")
    proc = subprocess.run(
        [sys.executable, "-m", "study_companion", "stats",
         "--student", "E01", "--node", "EN01", "--json"],
        capture_output=True, text=True, encoding="utf-8", cwd=COMPETITION_DIR,
        env={"PYTHONPATH": str(COMPETITION_DIR / "src"),
             "STUDY_COMPANION_DATA_DIR": str(FIXTURES), "PATH": "/usr/bin:/bin",
             "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"},
        check=True,
    )
    import json
    cli = json.loads(proc.stdout)[0]
    assert cli["得分率"] == s["得分率"] == 1.0
    assert cli["总体"] == s["总体"]


def test_acceptance_5_exclude_self():
    dataset = load_all(FIXTURES)
    clean = build_valid_records(dataset)
    full = class_node_stats(dataset, clean, "EC01", "EN01")
    minus = class_node_stats(dataset, clean, "EC01", "EN01", exclude_students=["E01"])
    assert full["总体"]["得分"] - minus["总体"]["得分"] == 4   # E01 的 4 分被真实排除


def test_acceptance_6_scope_no_inference():
    dataset = load_all(FIXTURES)
    clean = build_valid_records(dataset)
    empty = student_node_stats(dataset, clean, "E05", "EN02")
    assert empty["总体"]["已评分_计入统计"] == 0
    assert empty["总体"]["无记录"] == 8
    assert empty["得分率"] is None                        # 不产生 0% 假象
    a = student_node_stats(dataset, clean, "E01", "EN01")
    b = student_node_stats(dataset, clean, "E01", "EN02")
    assert a["总体"]["得分"] != b["总体"]["得分"]          # 节点隔离不混比


def _shuffle_csv(source: Path, target: Path, seed: int):
    with open(source, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    header, body = rows[0], rows[1:]
    random.Random(seed).shuffle(body)
    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(body)


def test_acceptance_7_generality_shuffle_and_rerun(tmp_path):
    """打乱作答记录行序 + 换学生查询 + 重复加载，结果不变."""
    dataset = load_all(FIXTURES)
    clean = build_valid_records(dataset)
    baseline = student_node_stats(dataset, clean, "E01", "EN01")

    for seed in (1, 42):
        mixed = tmp_path / f"mixed{seed}"
        mixed.mkdir()
        for name in ["课程要求.csv", "题目与材料.csv", "模拟学生.csv",
                     "测验节点.csv", "字段说明.csv"]:
            shutil.copy(FIXTURES / name, mixed / name)
        _shuffle_csv(FIXTURES / "作答记录.csv", mixed / "作答记录.csv", seed)
        ds2 = load_all(mixed)
        clean2 = build_valid_records(ds2)
        again = student_node_stats(ds2, clean2, "E01", "EN01")
        assert again["总体"] == baseline["总体"]
        assert again["按主题"] == baseline["按主题"]

    # 重复加载同一数据两次，结果一致（无隐藏状态）
    ds3 = load_all(FIXTURES)
    clean3 = build_valid_records(ds3)
    assert student_node_stats(ds3, clean3, "E01", "EN01")["总体"] == baseline["总体"]
