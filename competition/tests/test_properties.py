"""性质测试（metamorphic）：随机数据集 x 独立预言机等价对拍 + 核心不变量.

与固定样例测试的本质区别：这里不验证"我造的例子算对了"，
而是验证"任意符合契约的数据，两套独立实现结论一致、不变量恒成立"。
若 study_companion 核心逻辑（归并/处置/聚合）有任何分支性错误，
200 套随机数据几乎必然踩中。
"""

import csv
import random
import sys
from pathlib import Path

import pytest

COMPETITION_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(COMPETITION_DIR / "src"))

from study_companion.clean import build_valid_records  # noqa: E402
from study_companion.coverage import student_node_coverage  # noqa: E402
from study_companion.load import load_all  # noqa: E402
from study_companion.schema import FLAG_EXCLUDED  # noqa: E402
from study_companion.stats import student_node_stats  # noqa: E402

import reference_impl  # noqa: E402


# ---------------- 随机数据生成 ----------------

def generate_dataset(seed: int, out_dir: Path) -> Path:
    """生成一套随机但符合表契约的数据（含随机注入的各类异常与修订链）."""
    rng = random.Random(seed)
    out_dir.mkdir(parents=True, exist_ok=True)

    n_students = rng.randint(3, 8)
    n_questions = rng.randint(5, 12)
    students = [(f"PS{i:02d}", f"PC{rng.randint(1, 2):02d}") for i in range(1, n_students + 1)]
    questions = []
    for i in range(1, n_questions + 1):
        theme = f"PT{rng.randint(1, 3):02d}"
        qtype = rng.choice(["选择题", "填空题", "解答题"])
        full = 3 if qtype == "解答题" else 1
        ref = f"ref{i}"
        questions.append((f"PQ{i:03d}", theme, qtype, full, ref))
    node1 = [q[0] for q in questions if rng.random() < 0.7]
    if not node1:
        node1 = [questions[0][0]]
    node2 = [q[0] for q in questions if rng.random() < 0.9]
    if not node2:
        node2 = [questions[-1][0]]

    def w(name, header, rows):
        with open(out_dir / name, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(header)
            writer.writerows(rows)

    w("课程要求.csv",
      ["主题编号", "主题", "主题目标", "指标编号", "观察指标",
       "课标整理编号", "课标文件页／正文页", "教材正文页"],
      [[f"PT{t:02d}", f"主题{t}", "目标", f"PT{t:02d}I1", "指标", "CR01", "1／1", "上册1"]
       for t in (1, 2, 3)])
    def rubric_for(mid: str, qtype: str) -> str:
        if qtype != "解答题":
            return ""
        return "\n".join(f"{mid}P{k} 步骤{k} 1分" for k in (1, 2, 3))

    w("题目与材料.csv",
      ["材料编号", "主题编号", "材料类型", "题型", "题干或内容", "选项",
       "参考答案", "参考解析", "满分", "评分点", "指标编号", "来源或资料文件"],
      [[mid, theme, "题目", qtype, f"题干{i}", "", ref, "", str(full),
        rubric_for(mid, qtype), f"{theme}I1", "合成"] for i, (mid, theme, qtype, full, ref)
       in enumerate(questions, 1)])
    w("模拟学生.csv", ["学生编号", "模拟班级编号", "年级"],
      [[sid, cls, "7"] for sid, cls in students])
    w("测验节点.csv",
      ["节点编号", "模拟测验日期", "已教及测量主题", "说明", "可用题目编号"],
      [["PN01", "2026-01-01", "PT01、PT02", "一", "、".join(node1)],
       ["PN02", "2026-06-01", "PT01、PT02、PT03", "二", "、".join(node2)]])
    w("字段说明.csv", ["数据表", "字段名", "类型", "含义", "取值或格式", "示例", "为空时"], [])

    qmap = {mid: (theme, qtype, full, ref) for mid, theme, qtype, full, ref in questions}
    rows = []
    rid = 0

    def add_record(sid, node, mid, **kw):
        nonlocal rid
        rid += 1
        theme, qtype, full, ref = qmap[mid]
        status = kw.get("状态", rng.choice(["已评分"] * 8 + ["待评分", "未作答"]))
        score = kw.get("得分")
        if score is None:
            score = rng.randint(0, full) if status == "已评分" else ""
        elif status != "已评分":
            score = ""  # 契约：待评分/未作答不得携带得分
        final = kw.get("作答", f"ans{rid}")
        pts = kw.get("评分点")
        if pts is None and status == "已评分" and qtype == "解答题":
            remain, parts = score, []
            for k in range(3):
                take = min(1, remain) if k == 2 else rng.randint(0, min(1, remain))
                if k == 2:
                    take = remain
                remain -= take
                parts.append(f"{mid}P{k+1}={take}")
            pts = "；".join(parts)
        else:
            pts = pts or ""
        rec_theme = kw.get("记录主题", theme)
        rows.append([f"PR{rid:04d}", sid, mid, rec_theme, node,
                     f"{sid}-{node}-{mid}", kw.get("版本", 1),
                     kw.get("时间", "2026-01-01T09:00:00+08:00"),
                     status, score, full, final,
                     kw.get("过程", ""), pts])

    for sid, _ in students:
        for node, avail in (("PN01", node1), ("PN02", node2)):
            used_events = set()  # (sid, node, mid) 去重：注入不得制造重复(事件,版本)

            def take(mid_in):
                if (sid, node, mid_in) in used_events:
                    return False
                used_events.add((sid, node, mid_in))
                return True

            for mid in avail:
                r = rng.random()
                if r < 0.25:
                    continue  # 无记录
                theme, _, full, ref = qmap[mid]
                if r < 0.32:                     # 注入：主题誊录错误
                    wrong = next(t for t in ("PT01", "PT02", "PT03") if t != theme)
                    add_record(sid, node, mid, 记录主题=wrong)
                elif r < 0.38:                   # 注入：得分超满分（两种形态）
                    # 形态1：评分点合计==满分（差异化处置可纠正）
                    # 形态2：评分点跟随总分或缺失（两策略下都隔离）
                    if qmap[mid][1] == "解答题" and rng.random() < 0.5:
                        pts_full = "；".join(f"{mid}P{k}=1" for k in (1, 2, 3))
                        add_record(sid, node, mid,
                                   得分=full + rng.randint(1, 3), 评分点=pts_full)
                    else:
                        add_record(sid, node, mid, 得分=full + rng.randint(1, 9))
                elif r < 0.44 and qmap[mid][1] == "解答题":
                    # 注入：评分点合计与总分矛盾（合法点值合计不等于得分）
                    bad = "；".join(f"{mid}P{k}=1" for k in (1, 2, 3))
                    add_record(sid, node, mid, 得分=2, 评分点=bad)
                elif r < 0.50 and node == "PN01":
                    # 注入：节点范围外（用不在 PN01 可用集的题）
                    outside = [m for m, *_ in questions if m not in node1]
                    if outside:
                        pick = rng.choice(outside)
                        if take(pick):
                            add_record(sid, node, pick)
                elif r < 0.56:                   # 注入：语义复核（答案=参考却 0 分）
                    add_record(sid, node, mid, 得分=0, 作答=ref)
                elif r < 0.66:                   # 注入：修订链（v1 -> v2，可能 v3）
                    add_record(sid, node, mid, 版本=1, 得分=rng.randint(0, full))
                    add_record(sid, node, mid, 版本=2, 状态="已评分",
                               得分=rng.randint(0, full))
                    if rng.random() < 0.3:
                        add_record(sid, node, mid, 版本=3, 状态="待评分")
                else:
                    add_record(sid, node, mid)
    w("作答记录.csv",
      ["记录编号", "学生编号", "材料编号", "主题编号", "节点编号", "作答事件编号",
       "修订版本", "模拟提交时间", "评分状态", "得分", "满分",
       "学生最终作答", "解答过程", "评分点得分"], rows)
    return out_dir


# ---------------- 等价对拍 ----------------

def _module_view(dataset, clean):
    records = {}
    for vr in clean.valid_records:
        r = vr.record
        records[r.record_id] = {
            "学生": r.student_id, "节点": r.node_id, "材料": r.material_id,
            "主题": vr.effective_theme, "状态": r.scoring_status,
            "得分": r.score, "满分": r.full_score,
            "进统计": vr.stats_flag != FLAG_EXCLUDED and r.scoring_status == "已评分",
            "异常": sorted(vr.issues),
        }
    return records


@pytest.mark.parametrize("repair_points", [False, True], ids=["policyA", "policyB"])
@pytest.mark.parametrize("seed", range(200))
def test_random_equivalence(seed, tmp_path, repair_points):
    data_dir = generate_dataset(seed, tmp_path / f"d{seed}")
    dataset = load_all(data_dir)
    clean = build_valid_records(dataset, repair_consistent_points=repair_points)
    oracle = reference_impl.analyze(data_dir, repair_consistent_points=repair_points)

    # 1) 逐记录等价：当前记录集合、处置、异常类型
    mine = _module_view(dataset, clean)
    assert set(mine) == set(oracle["records"]), \
        f"seed={seed} 当前记录集合不一致"
    for rid in mine:
        m, o = mine[rid], oracle["records"][rid]
        assert m["进统计"] == o["进统计"], f"seed={seed} {rid} 进统计口径不一致"
        assert m["主题"] == o["主题"], f"seed={seed} {rid} 有效主题不一致"
        assert m["异常"] == o["异常"], f"seed={seed} {rid} 异常集不一致"

    # 2) 学生x节点统计等价
    for (sid, nid), o in oracle["stats"].items():
        s = student_node_stats(dataset, clean, sid, nid)
        g = s["总体"]
        assert (g["得分"], g["满分"], g["已评分_计入统计"]) == (o["得分"], o["满分"], o["计入"]), \
            f"seed={seed} {sid}@{nid} 统计不一致"
        assert g["已评分_隔离"] == o["隔离"]
        assert (g["待评分"], g["未作答"], g["无记录"]) == (o["待评分"], o["未作答"], o["无记录"])
        for theme, (ts, tf, tc) in o["主题"].items():
            mb = s["按主题"].get(theme)
            assert isinstance(mb, dict), f"seed={seed} {sid}@{nid} {theme} 主题缺失"
            assert (mb["得分"], mb["满分"], mb["已评分_计入统计"]) == (ts, tf, tc)

    # 3) 覆盖等价
    for (sid, nid), o in oracle["coverage"].items():
        c = student_node_coverage(dataset, clean, sid, nid)
        assert (c["节点可用题数"], c["有记录题数"], c["已评分数"], c["无记录题数"]) == \
            (o["可用"], o["有记录"], o["已评分"], o["无记录"]), f"seed={seed} {sid}@{nid} 覆盖不一致"


# ---------------- 核心不变量（对随机数据同样成立才算数） ----------------

def test_invariants_on_random_data(tmp_path):
    """P1 无损归并 / P2 总量守恒 / P4 隔离无得分 / P5 覆盖自洽."""
    for seed in (7, 42, 99):
        data_dir = generate_dataset(seed, tmp_path / f"inv{seed}")
        dataset = load_all(data_dir)
        clean = build_valid_records(dataset)

        # P1 无损：当前 + 历史 = 全部原始行，且互不重复
        seen = [vr.record.record_id for vr in clean.valid_records]
        hist = [h.record_id for vr in clean.valid_records for h in vr.history]
        assert sorted(seen + hist) == sorted(r.record_id for r in dataset.rows)
        assert len(seen) == len(set(seen)) and len(hist) == len(set(hist))

        # P2 守恒：各学生各节点"计入统计"的(得分,满分,题数)之和 == 全局当前有效记录口径
        total = [0, 0, 0]
        for vr in clean.valid_records:
            r = vr.record
            if vr.stats_flag != FLAG_EXCLUDED and r.scoring_status == "已评分":
                total[0] += r.score; total[1] += vr.effective_full_score; total[2] += 1
        summed = [0, 0, 0]
        for sid in dataset.students:
            for nid in dataset.nodes:
                g = student_node_stats(dataset, clean, sid, nid)["总体"]
                summed[0] += g["得分"]; summed[1] += g["满分"]; summed[2] += g["已评分_计入统计"]
        assert tuple(summed) == tuple(total), f"seed={seed} 总量不守恒"

        # P4 隔离记录不得携带有效得分
        for vr in clean.valid_records:
            if vr.stats_flag == FLAG_EXCLUDED:
                assert vr.effective_score is None

        # P5 覆盖自洽：有记录 >= 已评分；无记录 = 可用 - 有记录∩可用
        for sid in dataset.students:
            for nid in dataset.nodes:
                c = student_node_coverage(dataset, clean, sid, nid)
                assert c["有记录题数"] >= c["已评分数"]
                assert c["无记录题数"] == c["节点可用题数"] - c["有记录题数"]
