"""机制防线测试。

1. README 测试计数防漂移：README 里的数字必须与 pytest 实际收集数一致
   （历史上连错四轮的根治——改测试不改文档会直接挂这里）。
2. 性质测试非空转：差异化处置的修正路径必须在随机数据里被真实触发
   （"对拍通过"不等于"对拍覆盖了改动路径"）。
"""

import re
import subprocess
import sys
from pathlib import Path

COMPETITION_DIR = Path(__file__).resolve().parents[1]


def test_readme_test_count_matches_reality():
    readme = (COMPETITION_DIR / "README.md").read_text(encoding="utf-8")
    m = re.search(r"# (\d+) 项", readme)
    assert m, "README 缺少 '# N 项' 测试计数说明"
    claimed = int(m.group(1))
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "--collect-only", "-q", "tests/"],
        cwd=COMPETITION_DIR, capture_output=True, text=True, check=True)
    tail = result.stdout.strip().splitlines()[-1]
    collected = int(re.search(r"(\d+) tests? collected", tail).group(1))
    assert claimed == collected, (
        f"README 声称 {claimed} 项测试，实际收集 {collected} 项——"
        f"改了测试就要同步 README（本守卫就是为了不再漂移）")


def test_policy_b_exercises_repair_path(tmp_path):
    from study_companion.clean import ISSUE_SCORE_REPAIRED_FROM_POINTS
    from study_companion.load import load_all
    from test_properties import generate_dataset
    from study_companion.clean import build_valid_records

    hits = 0
    for seed in range(30):
        data_dir = generate_dataset(seed, tmp_path / f"pb{seed}")
        # 默认即差异化处置：修正路径必须被真实触发
        cl = build_valid_records(load_all(data_dir))
        hits += sum(1 for vr in cl.valid_records
                    if ISSUE_SCORE_REPAIRED_FROM_POINTS in vr.issues)
    assert hits > 0, (
        "随机数据未触发修正路径——性质测试对差异化处置空转，"
        "需要修 generate_dataset 的注入形态")


def test_contract_structure_matches_products(tmp_path):
    """契约结构守卫：管线产物的键集合必须与 shared/contracts 契约样例一致."""
    import json as _json
    from study_companion.pipeline import run_pipeline
    from conftest import FIXTURES

    out = tmp_path / "out"
    run_pipeline(FIXTURES, out)
    contracts = COMPETITION_DIR / "shared" / "contracts"

    produced = _json.load(open(out / "valid_records.json", encoding="utf-8"))
    example = _json.load(open(contracts / "valid_record.example.json", encoding="utf-8"))
    example_keys = set(example["records"][0])
    for rec in produced:
        assert set(rec) == example_keys, (
            f"valid_records 结构漂移: 多出 {set(rec) - example_keys}，"
            f"缺少 {example_keys - set(rec)}——更新产物须同步契约样例")

    stats = _json.load(open(out / "student_stats.json", encoding="utf-8"))
    stats_example = _json.load(open(contracts / "student_stats.example.json", encoding="utf-8"))
    assert set(stats[0]) == set(stats_example[0]), "student_stats 结构漂移"
