#!/bin/sh
# 智慧学伴一键复验（验收书"在干净输出目录重跑"的可执行形式）
#
# 用法：
#   ./modules/verify.sh                                  # 合成数据全量验证
#   STUDY_DATA_DIR=<六表CSV目录> ./modules/verify.sh     # 追加真实数据全链路+跨语言对拍
#
# 环境要求：python3(≥3.9)+pytest、node(≥24.9)。

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
PASS_COUNT=0
FAIL_COUNT=0
LOG_DIR=$(mktemp -d "${TMPDIR:-/tmp}/study-verify.XXXXXX") || exit 1
printf '复验日志：%s\n' "$LOG_DIR"
if [ -n "$STUDY_DATA_DIR" ]; then
  STUDY_DATA_DIR=$(cd "$STUDY_DATA_DIR" && pwd) || exit 1
  export STUDY_DATA_DIR
fi
FAILED_SUMMARY=""

step() { printf '\n== %s ==\n' "$1"; }
ok() { PASS_COUNT=$((PASS_COUNT + 1)); printf '✓ %s\n' "$*"; }
bad() { FAIL_COUNT=$((FAIL_COUNT + 1)); FAILED_SUMMARY="$FAILED_SUMMARY
  ✗ $*"; printf '✗ %s\n' "$*"; }

# ---------- 1. Python 参考实现 ----------
step "Python 参考实现测试"
if python3 -c "import pytest" >/dev/null 2>&1; then
  if (cd competition && python3 -m pytest tests/ -q >"$LOG_DIR/python.log" 2>&1); then
    ok "python-tests: $(tail -1 "$LOG_DIR/python.log")"
  else
    bad "python-tests（详见 $LOG_DIR/python.log）"
  fi
else
  bad "python-tests: 未安装 pytest"
fi

# ---------- 2. TS 全模块（构建+类型+行为，合成数据） ----------
step "TypeScript 全模块测试"
if [ -n "$STUDY_DATA_DIR" ]; then
  printf '已指定正式数据：在基准生成后运行一次完整测试。\n'
elif npm run study:test >"$LOG_DIR/typescript.log" 2>&1; then
  ok "ts-tests: $(grep -c 'ℹ pass' "$LOG_DIR/typescript.log") 组套件全过"
else
  bad "ts-tests（详见 $LOG_DIR/typescript.log）"
fi

# ---------- 3. 真实数据全链路（可选） ----------
if [ -n "$STUDY_DATA_DIR" ]; then
  step "真实数据：Python 管线（干净目录）"
  OUT="$LOG_DIR/python-output"
  if (cd competition && PYTHONPATH=src python3 -m study_companion pipeline \
        --data-dir "$STUDY_DATA_DIR" --output-dir "$OUT" >/dev/null 2>&1); then
    ok "python-pipeline: $OUT"
  else
    bad "python-pipeline"
  fi

  step "真实数据：跨语言基准生成"
  REF="$LOG_DIR/python_reference.json"
  if python3 - "$STUDY_DATA_DIR" "$REF" << 'PYEOF' >/dev/null 2>&1
import json, sys
sys.path.insert(0, 'competition/src')
from study_companion.load import load_all
from study_companion.clean import build_valid_records
from study_companion.stats import student_node_stats
from study_companion.quality import build_quality_report
ds = load_all(sys.argv[1]); cl = build_valid_records(ds)
ref = {}
for sid in sorted(ds.students):
    for nid in sorted(ds.nodes):
        s = student_node_stats(ds, cl, sid, nid)
        ref[f'{sid}@{nid}'] = {'earned': s['总体']['得分'],
                               'possible': s['总体']['满分'],
                               'valid': s['总体']['已评分_计入统计']}
obs = build_quality_report(ds, cl).to_dict()['数据观察']
ref['observations'] = {
    'unresolved_pending_ids': obs['未决待评分'],
    'node_item_gaps': obs['节点_题目_无有效作答'],
    'unmeasured_indicator_ids': obs['指标_零覆盖'],
    'node_students_without_records': obs['节点_学生_零记录']}
json.dump(ref, open(sys.argv[2], 'w'), ensure_ascii=False)
PYEOF
  then ok "reference-export: 全部学生×节点 + 观察层"
  else bad "reference-export"; fi

  step "真实数据：TS 全模块（live + 跨语言对拍）"
  if STUDY_DATA_DIR="$STUDY_DATA_DIR" STUDY_DIFF_REFERENCE="$REF" \
     npm run study:test >"$LOG_DIR/live.log" 2>&1; then
    ok "ts-live-parity: 数字与 Python 完全一致"
  else
    bad "ts-live-parity（详见 $LOG_DIR/live.log）"
  fi

  step "真实数据：交互报告导出（干净目录）"
  # CLI 要求输出目录不存在（拒绝覆盖）：基目录 mktemp，输出指向其下不存在的子目录
  REPORT="$LOG_DIR/live-report"
  if node modules/app/cli.ts export --data "$STUDY_DATA_DIR" \
    --out "$REPORT" --summary-only >"$LOG_DIR/report.log" 2>&1 \
    && node modules/app/check-export.ts "$REPORT" live >>"$LOG_DIR/report.log" 2>&1; then
    ok "report-export: $REPORT/index.html"
  else
    bad "report-export"
  fi
else
  printf '\n（未设置 STUDY_DATA_DIR：跳过真实数据链路，仅合成验证）\n'
fi

step "合成输入干净导出与完整性检查"
if npm run study:demo -- --out "$LOG_DIR/demo" >"$LOG_DIR/demo.log" 2>&1 \
  && node modules/app/check-export.ts "$LOG_DIR/demo/report" fixture >>"$LOG_DIR/demo.log" 2>&1; then
  ok "fixture-export: 完成标记、机器核验与各对象文件一致"
else
  bad "fixture-export（详见 $LOG_DIR/demo.log）"
fi

# ---------- 汇总 ----------
printf '\n========== 复验结果 ==========\n'
if [ "$FAIL_COUNT" -gt 0 ]; then
  printf '通过 %d 项，失败 %d 项:\n%s\n' "$PASS_COUNT" "$FAIL_COUNT" "$FAILED_SUMMARY"
  exit 1
fi
printf '全部 %d 项通过。\n' "$PASS_COUNT"
