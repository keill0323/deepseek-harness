"""版本归并与异常处置测试（验收书：版本归并 / 异常处理 / 状态区别）."""

from study_companion.clean import (
    ISSUE_INVALID_POINT_SCORES,
    ISSUE_NODE_OUT_OF_SCOPE,
    ISSUE_SCORE_EXCEEDS_FULL,
    ISSUE_SCORE_NEGATIVE,
    ISSUE_SEMANTIC_REVIEW,
    ISSUE_THEME_MISMATCH,
    ISSUE_TOTAL_POINTS_MISMATCH,
    normalize_answer,
)
from study_companion.schema import (
    FLAG_CORRECTED,
    FLAG_EXCLUDED,
    FLAG_NORMAL,
    FLAG_REVIEW_KEPT,
)


def test_version_merge_806_style(clean):
    """合成数据 15 行 -> 13 事件，2 个多版本事件各归并 1 条旧版本."""
    assert clean.row_count == 15
    assert clean.event_count == 13
    assert len(clean.merge_log) == 2
    events = {entry.event_id: entry for entry in clean.merge_log}
    e1 = events["E01-EN02-QX03"]
    assert e1.kept_record_id == "XR0006" and e1.kept_revision == 2
    assert e1.superseded == [("XR0005", 1)]
    assert e1.changes["评分状态"] == ["待评分", "已评分"]
    assert e1.changes["得分"] == ["None", "2"]
    e2 = events["E02-EN01-QX05"]
    assert e2.kept_record_id == "XR0008"
    assert e2.changes["得分"] == ["1", "2"]


def test_superseded_versions_kept_as_history(clean, valid_by_record):
    """被归并旧版本保留在 history（保留原文与可查询的历史记录）."""
    vr = valid_by_record["XR0006"]
    assert [h.record_id for h in vr.history] == ["XR0005"]
    assert vr.history[0].scoring_status == "待评分"
    # 旧版本记录编号不在当前有效记录中，但仍可经证据查询命中（见 test_evidence）


def test_score_exceeds_full_excluded(valid_by_record):
    vr = valid_by_record["XR0004"]  # 10/1
    assert ISSUE_SCORE_EXCEEDS_FULL in vr.issues
    assert vr.stats_flag == FLAG_EXCLUDED
    assert vr.effective_score is None


def test_total_points_mismatch_excluded(valid_by_record):
    vr = valid_by_record["XR0009"]  # 总分3 评分点合计2
    assert ISSUE_TOTAL_POINTS_MISMATCH in vr.issues
    assert vr.stats_flag == FLAG_EXCLUDED


def test_theme_mismatch_corrected_to_bank(valid_by_record):
    vr = valid_by_record["XR0010"]  # 记录 T02 / 题库 T01
    assert ISSUE_THEME_MISMATCH in vr.issues
    assert vr.stats_flag == FLAG_CORRECTED
    assert vr.effective_theme == "T01"
    assert vr.record.theme_recorded == "T02"   # 原文保留
    assert vr.effective_score == 1             # 修正主题不隔离得分


def test_semantic_zero_review_kept(valid_by_record):
    vr = valid_by_record["XR0011"]  # 答案=-5ab² 与参考一致但 0 分
    assert ISSUE_SEMANTIC_REVIEW in vr.issues
    assert vr.stats_flag == FLAG_REVIEW_KEPT
    assert vr.effective_score == 0              # 不擅自改分


def test_out_of_scope_keeps_node_but_excludes(valid_by_record):
    vr = valid_by_record["XR0012"]  # QX07(T03) 出现在 EN01
    assert ISSUE_NODE_OUT_OF_SCOPE in vr.issues
    assert vr.stats_flag == FLAG_EXCLUDED
    assert vr.record.node_id == "EN01"          # 不按时间戳改节点
    assert vr.effective_theme == "T03"


def test_normal_records_untouched(valid_by_record):
    for rid in ["XR0001", "XR0002", "XR0008", "XR0014", "XR0015"]:
        vr = valid_by_record[rid]
        assert vr.stats_flag == FLAG_NORMAL
        assert vr.issues == []


def test_pending_and_unanswered_not_excluded(valid_by_record):
    """待评分 / 未作答不是异常：保留原状态，仅不计入得分统计."""
    pending = valid_by_record["XR0013"]
    assert pending.record.scoring_status == "待评分"
    assert pending.stats_flag == FLAG_NORMAL
    unanswered = valid_by_record["XR0003"]
    assert unanswered.record.scoring_status == "未作答"
    assert unanswered.stats_flag == FLAG_NORMAL


def test_anomaly_record_count(clean):
    """合成数据共 5 条异常记录（5 类规则各一条）."""
    flagged = [vr for vr in clean.valid_records if vr.issues]
    assert {vr.record.record_id for vr in flagged} == {
        "XR0004", "XR0009", "XR0010", "XR0011", "XR0012"}


def test_normalize_answer():
    assert normalize_answer(" -5ab² ") == normalize_answer("-5ab²")
    assert normalize_answer("－5ab²") == normalize_answer("-5ab²")  # 全角负号归一
    assert normalize_answer("5ab²") != normalize_answer("-5ab²")


def test_differentiated_disposition_default_and_conservative(tmp_path, dataset):
    """差异化处置（默认）：纠正自洽、忽略不自洽；保守模式全隔离.

    构造一条 4/3、评分点 1+1+1 的记录（E03@EN02）：默认修正为 3；
    repair_consistent_points=False 隔离。
    同时验证评分点合计!=满分的记录在两种模式下都隔离（无法仲裁）。
    """
    import shutil
    from conftest import FIXTURES
    from study_companion.load import load_all
    from study_companion.clean import build_valid_records, ISSUE_SCORE_REPAIRED_FROM_POINTS
    from study_companion.schema import FLAG_CORRECTED

    for name in ["课程要求.csv", "题目与材料.csv", "模拟学生.csv",
                 "测验节点.csv", "字段说明.csv"]:
        shutil.copy(FIXTURES / name, tmp_path / name)
    lines = open(FIXTURES / "作答记录.csv", encoding="utf-8-sig").read().splitlines()
    lines.append("XR0100,E03,QX08,T03,EN02,E03-EN02-QX08,1,"
                 "2026-06-17T15:00:00+08:00,已评分,4,3,x<2,1. 步骤一,"
                 "QX08P1=1；QX08P2=1；QX08P3=1")
    open(tmp_path / "作答记录.csv", "w", encoding="utf-8-sig",
         newline="").write("\n".join(lines) + "\n")

    ds = load_all(tmp_path)
    # 默认 = 差异化处置：XR0100 评分点自洽 -> 纠正
    by_id = {vr.record.record_id: vr
             for vr in build_valid_records(ds).valid_records}
    repaired = by_id["XR0100"]
    assert repaired.stats_flag == FLAG_CORRECTED
    assert repaired.effective_score == 3
    assert ISSUE_SCORE_REPAIRED_FROM_POINTS in repaired.issues
    # XR0009（评分点 2 != 满分 3，无自洽证据）默认下仍隔离
    assert by_id["XR0009"].stats_flag == "excluded"
    assert by_id["XR0009"].effective_score is None

    # 保守模式：全部隔离
    by_id_c = {vr.record.record_id: vr for vr in
               build_valid_records(ds, repair_consistent_points=False).valid_records}
    assert by_id_c["XR0100"].stats_flag == "excluded"
    assert by_id_c["XR0100"].effective_score is None


def test_bank_full_score_mismatch_no_mutation(tmp_path):
    """记录满分与题库不一致：以题库为准入 effective_full_score，不篡改原文.

    同时验证：分层原则——解析层 AnswerRow 保持原值；统计分母用有效满分。
    """
    import shutil
    from conftest import FIXTURES
    from study_companion.load import load_all
    from study_companion.clean import build_valid_records
    from study_companion.stats import student_node_stats

    for name in ["课程要求.csv", "题目与材料.csv", "模拟学生.csv",
                 "测验节点.csv", "字段说明.csv"]:
        shutil.copy(FIXTURES / name, tmp_path / name)
    lines = open(FIXTURES / "作答记录.csv", encoding="utf-8-sig").read().splitlines()
    # E05 @ EN02 QX08（题库满分3）：记录满分誊录为 2，得分 2
    lines.append("XR0200,E05,QX08,T03,EN02,E05-EN02-QX08,1,"
                 "2026-06-17T15:00:00+08:00,已评分,2,2,x<2,1. 步骤一,"
                 "QX08P1=1；QX08P2=1；QX08P3=0")
    open(tmp_path / "作答记录.csv", "w", encoding="utf-8-sig",
         newline="").write("\n".join(lines) + "\n")

    ds = load_all(tmp_path)
    by_id = {vr.record.record_id: vr
             for vr in build_valid_records(ds).valid_records}
    vr = by_id["XR0200"]
    assert "full_score_mismatch_bank" in vr.issues
    assert vr.stats_flag == "corrected"
    assert vr.record.full_score == 2          # 解析层原文不被篡改
    assert vr.effective_full_score == 3       # 有效满分以题库为准
    # 统计分母用有效满分：E05@EN02 仅 XR0200(2/3)
    s = student_node_stats(ds, build_valid_records(ds), "E05", "EN02")
    assert (s["总体"]["得分"], s["总体"]["满分"]) == (2, 3)


def _load_with_appended_records(tmp_path, rows):
    import shutil
    from conftest import FIXTURES
    from study_companion.load import load_all
    from study_companion.clean import build_valid_records

    for name in ["课程要求.csv", "题目与材料.csv", "模拟学生.csv",
                 "测验节点.csv", "字段说明.csv"]:
        shutil.copy(FIXTURES / name, tmp_path / name)
    lines = open(FIXTURES / "作答记录.csv", encoding="utf-8-sig").read().splitlines()
    lines.extend(rows)
    open(tmp_path / "作答记录.csv", "w", encoding="utf-8-sig",
         newline="").write("\n".join(lines) + "\n")
    clean = build_valid_records(load_all(tmp_path))
    return {vr.record.record_id: vr for vr in clean.valid_records}


def test_out_of_scope_blocks_consistent_point_repair(tmp_path):
    by_id = _load_with_appended_records(tmp_path, [
        "XR0400,E05,QX07,T03,EN01,E05-EN01-QX07,1,"
        "2026-01-20T12:00:00+08:00,已评分,10,1,x>1,,QX07P1=1"
    ])
    vr = by_id["XR0400"]
    assert ISSUE_NODE_OUT_OF_SCOPE in vr.issues
    assert vr.stats_flag == FLAG_EXCLUDED
    assert vr.effective_score is None
    assert vr.record.node_id == "EN01"
    assert "score_repaired_from_points" not in vr.issues


def test_repair_requires_authoritative_maximum(tmp_path):
    by_id = _load_with_appended_records(tmp_path, [
        "XR0401,E05,QX08,T03,EN02,E05-EN02-QX08,1,"
        "2026-06-17T12:00:00+08:00,已评分,10,1,x<2,,"
        "QX08P1=1；QX08P2=0；QX08P3=0"
    ])
    vr = by_id["XR0401"]
    assert ISSUE_SCORE_EXCEEDS_FULL in vr.issues
    assert vr.effective_full_score == 3
    assert vr.stats_flag == FLAG_EXCLUDED
    assert vr.effective_score is None
    assert "score_repaired_from_points" not in vr.issues


def test_invalid_and_negative_point_scores_are_excluded(tmp_path):
    by_id = _load_with_appended_records(tmp_path, [
        "XR0402,E05,QX03,T01,EN01,E05-EN01-QX03,1,"
        "2026-01-20T12:05:00+08:00,已评分,1,3,k=2,,QX99P1=1",
        "XR0403,E05,QX08,T03,EN02,E05-EN02-QX08,1,"
        "2026-06-17T12:05:00+08:00,已评分,1,3,x<2,,"
        "QX08P1=3；QX08P2=-2；QX08P3=0",
        "XR0404,E05,QX03,T01,EN02,E05-EN02-QX03,1,"
        "2026-06-17T12:10:00+08:00,已评分,-1,3,k=2,,"
        "QX03P1=-1；QX03P2=0；QX03P3=0",
    ])
    for record_id in ["XR0402", "XR0403", "XR0404"]:
        vr = by_id[record_id]
        assert ISSUE_INVALID_POINT_SCORES in vr.issues
        assert vr.stats_flag == FLAG_EXCLUDED
        assert vr.effective_score is None
    assert ISSUE_SCORE_NEGATIVE in by_id["XR0404"].issues
