"""独立参考实现（测试预言机）——直接从验收书规则条文实现，不依赖被测代码.

仅用于 tests/test_properties.py 的随机等价对拍。写法刻意与
study_companion 不同（面向原始 dict、无 dataclass、无分层），
保证两边不会共享同一个错误。
"""

import csv
import re
import unicodedata
from collections import defaultdict
from pathlib import Path


def _norm(text):
    return "".join(unicodedata.normalize("NFKC", text or "").split()).lower()


def _points(text):
    values = {}
    invalid = False
    for part in re.split(r"[；;\n]", text or ""):
        part = part.strip()
        if not part:
            continue
        match = re.fullmatch(r"([^=\s]+)\s*=\s*([+-]?\d+)", part)
        if not match:
            invalid = True
            continue
        key, value = match.group(1), int(match.group(2))
        if key in values:
            invalid = True
            continue
        values[key] = value
    return values, invalid


def _rubric(text):
    values = {}
    for line in (text or "").splitlines():
        line = line.strip()
        if not line:
            continue
        match = re.fullmatch(r"(\S+)\s+.+?\s+(\d+)\s*分", line)
        if not match or match.group(1) in values:
            return None
        values[match.group(1)] = int(match.group(2))
    return values


def load_raw(data_dir: Path):
    def rd(name):
        with open(Path(data_dir) / name, encoding="utf-8-sig", newline="") as f:
            return list(csv.DictReader(f))
    return {
        "records": rd("作答记录.csv"),
        "bank": {r["材料编号"]: r for r in rd("题目与材料.csv")},
        "nodes": {r["节点编号"]: r for r in rd("测验节点.csv")},
        "students": rd("模拟学生.csv"),
    }


def analyze(data_dir: Path, repair_consistent_points: bool = False):
    raw = load_raw(data_dir)
    records, bank, nodes = raw["records"], raw["bank"], raw["nodes"]

    # 规则一（验收书）：同一作答事件多个修订版本，只算最高版本
    best = {}
    for r in records:
        ev = r["作答事件编号"]
        if ev not in best or int(r["修订版本"]) > int(best[ev]["修订版本"]):
            best[ev] = r
    current = list(best.values())

    out_records = {}
    for r in current:
        b = bank.get(r["材料编号"])
        avail = set(nodes[r["节点编号"]]["可用题目编号"].split("、"))
        issues = []
        # 规则二：作答主题与题库主题不一致——以题库为准
        theme = r["主题编号"]
        if b and b["主题编号"] and r["主题编号"] != b["主题编号"]:
            issues.append("theme_mismatch")
            theme = b["主题编号"]
        # 规则三：得分范围、评分点来源与总分一致性——按题库权威满分判断
        sc = int(r["得分"]) if r["得分"] else None
        recorded_full = int(r["满分"]) if r["满分"] else None
        bank_full = int(b["满分"]) if b and b["满分"] else None
        full = bank_full if bank_full is not None else recorded_full
        if b and recorded_full is not None and bank_full is not None and recorded_full != bank_full:
            issues.append("full_score_mismatch_bank")
        pts, malformed_points = _points(r["评分点得分"])
        rubric = _rubric(b["评分点"]) if b else None
        rubric = rubric or {}
        pts_sum = sum(pts.values())
        invalid_points = (
            malformed_points
            or (bool(pts) != bool(rubric))
            or set(pts) != set(rubric)
            or any(value < 0 or value > rubric.get(point_id, -1)
                   for point_id, value in pts.items())
        )
        if r["评分状态"] == "已评分" and sc is not None:
            if sc < 0:
                issues.append("score_negative")
            if full is not None and sc > full:
                issues.append("score_exceeds_full")
            if invalid_points:
                issues.append("invalid_point_scores")
            if pts and pts_sum != sc:
                issues.append("total_points_mismatch")
        # 规则四：材料不在节点可用题集——不迁移节点，不进该节点统计
        if r["材料编号"] not in avail:
            issues.append("node_out_of_scope")
        # 规则五：答案与参考答案相符但记 0 分——保留原分，标语义复核
        if (r["评分状态"] == "已评分" and sc == 0 and b
                and _norm(r["学生最终作答"]) and
                _norm(r["学生最终作答"]) == _norm(b["参考答案"])):
            issues.append("semantic_review")
        blocking = any(i in issues for i in (
            "score_exceeds_full", "total_points_mismatch", "node_out_of_scope",
            "invalid_point_scores", "score_negative"))
        # 差异化处置：得分超满分但评分点合计==权威满分 -> 以评分点合计为有效得分
        effective = sc
        if ("score_exceeds_full" in issues and repair_consistent_points
                and not invalid_points and "score_negative" not in issues
                and "node_out_of_scope" not in issues
                and pts and full is not None):
            if pts_sum == full:
                issues.append("score_repaired_from_points")
                effective = pts_sum
                blocking = False
        in_stats = (r["评分状态"] == "已评分" and not blocking)
        out_records[r["记录编号"]] = {
            "学生": r["学生编号"], "节点": r["节点编号"], "材料": r["材料编号"],
            "主题": theme, "状态": r["评分状态"], "得分": effective, "满分": full,
            "进统计": in_stats, "异常": sorted(issues),
        }

    # 学生 x 节点统计
    stats = {}
    for sid in {r["学生编号"] for r in raw["students"]}:
        for nid in nodes:
            sel = [v for v in out_records.values()
                   if v["学生"] == sid and v["节点"] == nid]
            inlist = [v for v in sel if v["进统计"]]
            stats[(sid, nid)] = {
                "得分": sum(v["得分"] for v in inlist),
                "满分": sum(v["满分"] for v in inlist),
                "计入": len(inlist),
                "隔离": sum(1 for v in sel
                            if v["状态"] == "已评分" and not v["进统计"]),
                "待评分": sum(1 for v in sel if v["状态"] == "待评分"),
                "未作答": sum(1 for v in sel if v["状态"] == "未作答"),
                "无记录": len(set(nodes[nid]["可用题目编号"].split("、"))
                             - {v["材料"] for v in sel}),
                "主题": {},
            }
            for v in inlist:
                t = stats[(sid, nid)]["主题"].setdefault(v["主题"], [0, 0, 0])
                t[0] += v["得分"]; t[1] += v["满分"]; t[2] += 1

    # 覆盖
    coverage = {}
    for sid in {r["学生编号"] for r in raw["students"]}:
        for nid in nodes:
            avail = set(nodes[nid]["可用题目编号"].split("、"))
            sel = [v for v in out_records.values()
                   if v["学生"] == sid and v["节点"] == nid]
            covered = {v["材料"] for v in sel} & avail
            scored = {v["材料"] for v in sel if v["进统计"]} & avail
            coverage[(sid, nid)] = {
                "可用": len(avail), "有记录": len(covered), "已评分": len(scored),
                "无记录": len(avail - covered),
            }
    return {"records": out_records, "stats": stats, "coverage": coverage}
