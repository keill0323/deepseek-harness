"""管线输出测试：全流程产物齐备且结构正确（写入 pytest 临时目录）."""

import csv
import json

import pytest

from conftest import FIXTURES
from study_companion.pipeline import run_pipeline


@pytest.fixture(scope="module")
def paths(tmp_path_factory):
    out = tmp_path_factory.mktemp("pipeline_out")
    return run_pipeline(FIXTURES, out)


def test_pipeline_products(paths):
    for key in ["字段映射", "质量报告", "个人统计", "覆盖表"]:
        assert key in paths
    # 真实样例目标（D01/Q043/Q025/D14/D17）在合成数据下逐项自动跳过
    for key in ["Q025同伴记录", "D17无记录样例", "D01/Q043当前记录",
                "D14较好表现样例"]:
        assert key not in paths


def test_field_mapping_csv(paths):
    with open(paths["字段映射"], encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    assert rows[0]["中文列名"] == "主题编号"
    assert any(r["中文列名"] == "作答事件编号" for r in rows)


def test_valid_records_csv_keeps_raw_and_flags(paths):
    path = [p for p in paths["当前有效记录"] if str(p).endswith(".csv")][0]
    with open(path, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 13
    by_id = {r["记录编号"]: r for r in rows}
    assert by_id["XR0010"]["统计口径"] == "corrected"
    assert by_id["XR0010"]["有效主题"] == "T01"
    assert by_id["XR0010"]["主题编号"] == "T02"       # 原文保留
    assert by_id["XR0004"]["统计口径"] == "excluded"
    assert by_id["XR0006"]["被归并版本"] == "XR0005(v1)"


def test_valid_records_json_structure(paths):
    path = [p for p in paths["当前有效记录"] if str(p).endswith(".json")][0]
    with open(path, encoding="utf-8") as f:
        records = json.load(f)
    assert len(records) == 13
    sample = next(r for r in records if r["记录编号"] == "XR0006")
    assert sample["历史版本"][0]["记录编号"] == "XR0005"
    assert sample["统计口径"] == "normal"


def test_quality_report_json(paths):
    with open(paths["质量报告"], encoding="utf-8") as f:
        report = json.load(f)
    assert report["原始行数"] == 15
    assert report["归并后事件数"] == 13
    assert len(report["异常记录"]) == 5
    assert len(report["版本归并明细"]) == 2


def test_stats_csv_and_json_consistent(paths):
    csv_path, json_path = paths["个人统计"]
    with open(csv_path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        csv_fieldnames = set(reader.fieldnames)
        csv_rows = {r["学生编号"] + "@" + r["节点编号"]: r for r in reader}
    with open(json_path, encoding="utf-8") as f:
        json_rows = json.load(f)
    assert len(csv_rows) == len(json_rows) == 10
    # 列完整性：JSON 派生的所有列必须存在于 CSV（列名取首行会静默丢列）
    expected_cols = set()
    for s in json_rows:
        for theme, v in s["按主题"].items():
            if isinstance(v, dict):
                expected_cols |= {f"{theme}_得分", f"{theme}_满分", f"{theme}_得分率"}
            else:
                expected_cols.add(f"{theme}_口径")
        for indicator in s["按指标"]:
            expected_cols.add(f"{indicator}_得分率")
    missing = expected_cols - csv_fieldnames
    assert not missing, f"CSV 丢失列: {sorted(missing)}"
    # 合成数据里第一行(E01@EN01)没有 T02I1 记录、第二行(E01@EN02)有——
    # 此断言专门复现"首行列名丢列"条件
    assert "T02I1_得分率" in csv_fieldnames
    for s in json_rows:
        key = s["学生编号"] + "@" + s["节点编号"]
        assert float(csv_rows[key]["得分"] or 0) == s["总体"]["得分"]
        assert float(csv_rows[key]["满分"] or 0) == s["总体"]["满分"]
    assert csv_rows["E05@EN02"]["无记录"] == "8"


def test_stats_flat_rows_expands_themes_dynamically():
    """扁平化 CSV 的主题列按数据动态展开：非 T01—T03 的主题不得丢列."""
    from study_companion.pipeline import stats_flat_rows

    def bucket(score, full):
        return {"已评分_计入统计": 1, "已评分_隔离": 0, "待评分": 0, "未作答": 0,
                "无记录": 0, "得分": score, "满分": full}

    fabricated = [{
        "学生编号": "E01", "班级": "EC01", "节点编号": "EN01",
        "总体": {**bucket(2, 3), "节点可用题数": 5}, "得分率": 2 / 3,
        "按主题": {"T09": {**bucket(2, 3), "得分率": 2 / 3}},
        "按指标": {"T09I1": {**bucket(2, 3), "得分率": 2 / 3}},
    }]
    rows = stats_flat_rows(fabricated)
    assert rows[0]["T09_得分"] == 2
    assert rows[0]["T09_满分"] == 3
    assert rows[0]["T09_得分率"] == 2 / 3
    assert rows[0]["T09I1_得分率"] == 2 / 3


def test_determinism_shuffle_inputs_byte_identical(tmp_path):
    """规范化排序证明：打乱输入行序，除 _meta.json 外全部产物逐字节一致."""
    import csv as _csv
    import shutil as _shutil

    from study_companion.pipeline import run_pipeline

    def shuffle_records(seed):
        target = tmp_path / f"shuffled{seed}"
        target.mkdir()
        for name in ["课程要求.csv", "题目与材料.csv", "模拟学生.csv",
                     "测验节点.csv", "字段说明.csv"]:
            _shutil.copy(FIXTURES / name, target / name)
        import random
        with open(FIXTURES / "作答记录.csv", encoding="utf-8-sig", newline="") as f:
            rows = list(_csv.reader(f))
        header, body = rows[0], rows[1:]
        random.Random(seed).shuffle(body)
        with open(target / "作答记录.csv", "w", encoding="utf-8-sig", newline="") as f:
            writer = _csv.writer(f)
            writer.writerow(header)
            writer.writerows(body)
        return target

    run_pipeline(FIXTURES, tmp_path / "out_orig")
    for seed in (1, 42):
        run_pipeline(shuffle_records(seed), tmp_path / f"out_s{seed}")
        for produced in (tmp_path / "out_orig").rglob("*"):
            if not produced.is_file() or produced.name == "_meta.json":
                continue
            rel = produced.relative_to(tmp_path / "out_orig")
            other = tmp_path / f"out_s{seed}" / rel
            assert other.exists(), f"缺文件 {rel}"
            assert produced.read_bytes() == other.read_bytes(), \
                f"seed={seed} 打乱行序后产物不一致: {rel}"

    # 数据指纹真实生效：打乱后的数据文件哈希必须不同
    meta_orig = json.load(open(tmp_path / "out_orig" / "_meta.json", encoding="utf-8"))
    meta_shuf = json.load(open(tmp_path / "out_s1" / "_meta.json", encoding="utf-8"))
    h1 = meta_orig["数据文件"]["作答记录.csv"]["sha256"]
    h2 = meta_shuf["数据文件"]["作答记录.csv"]["sha256"]
    assert h1 != h2 and len(h1) == 64


def test_meta_sidecar_fields(tmp_path):
    from study_companion.pipeline import run_pipeline
    paths = run_pipeline(FIXTURES, tmp_path / "out_meta")
    meta = json.load(open(paths["生成元数据"], encoding="utf-8"))
    assert meta["处置策略"] == "repair_consistent_points"
    assert meta["原始行数"] == 15 and meta["归并后事件数"] == 13
    assert set(meta["数据文件"]) >= {"作答记录.csv", "题目与材料.csv"}
    assert meta["数据文件"]["作答记录.csv"]["行数"] == 15
