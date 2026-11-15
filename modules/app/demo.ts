import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { CsvRow, DatasetInput } from '../data/types.ts'
import { run_companion_cli } from './cli.ts'

const TABLE_FILES: Record<keyof DatasetInput, string> = {
  students: '模拟学生.csv', items: '题目与材料.csv', nodes: '测验节点.csv', requirements: '课程要求.csv', records: '作答记录.csv',
}

function response(student: string, node: string, item: string, topic: string, answer: string, steps: string, score: number, maximum: number, pointScores: string): CsvRow {
  const event = `${student}-${node}-${item}`
  return {
    记录编号: `RECORD-${event}`, 学生编号: student, 材料编号: item, 主题编号: topic,
    节点编号: node, 作答事件编号: event, 修订版本: '1', 模拟提交时间: '',
    评分状态: '已评分', 得分: String(score), 满分: String(maximum),
    学生最终作答: answer, 解答过程: steps, 评分点得分: pointScores,
  }
}

/**
 * Create public, independently authored examples for three contrasting simulated learners.
 * @returns Five literal source tables containing no released competition CSV or student records.
 */
export function make_demo_input(): DatasetInput {
  const records: CsvRow[] = []
  for (const student of ['DEMO-A', 'DEMO-B']) {
    for (const node of ['CHECK-1', 'CHECK-2']) {
      records.push(response(student, node, 'EX-A', 'TOP-A', '6a', '1. 4a+2a=(4+2)a。\n2. =6a。', 1, 1, 'EX-AP1=1'))
      records.push(response(student, node, 'EX-B', 'TOP-B', 'y=6', '1. y=11-5。\n2. y=6。', 1, 1, 'EX-BP1=1'))
    }
  }
  records.push(response('DEMO-A', 'CHECK-2', 'EX-C', 'TOP-C', 'z<-3', '1. -4z<12。\n2. z<-3。', 1, 3, 'EX-CP1=1；EX-CP2=0；EX-CP3=0'))
  records.push(response('DEMO-B', 'CHECK-2', 'EX-C', 'TOP-C', 'z>-3', '1. -4z<12。\n2. z>-3。\n3. 选取满足条件的值代入检查。', 3, 3, 'EX-CP1=1；EX-CP2=1；EX-CP3=1'))
  records.push(response('DEMO-C', 'CHECK-1', 'EX-A', 'TOP-A', '6a', '', 1, 1, 'EX-AP1=1'))
  return {
    students: [
      { 学生编号: 'DEMO-A', 模拟班级编号: 'GROUP-A', 年级: '7' },
      { 学生编号: 'DEMO-B', 模拟班级编号: 'GROUP-A', 年级: '7' },
      { 学生编号: 'DEMO-C', 模拟班级编号: 'GROUP-B', 年级: '7' },
    ],
    items: [
      { 材料编号: 'EX-A', 主题编号: 'TOP-A', 材料类型: '题目', 题型: '填空题', 题干或内容: '合并同类项：4a+2a。', 选项: '', 参考答案: '6a', 参考解析: '同类项系数相加，字母部分不变。', 满分: '1', 评分点: 'EX-AP1 正确合并同类项 1分', 指标编号: 'ALG-1', 来源或资料文件: '自编公开演示' },
      { 材料编号: 'EX-B', 主题编号: 'TOP-B', 材料类型: '题目', 题型: '填空题', 题干或内容: '求解方程y+5=11。', 选项: '', 参考答案: 'y=6', 参考解析: '等式两边同减5。', 满分: '1', 评分点: 'EX-BP1 正确求出未知量 1分', 指标编号: 'EQU-1', 来源或资料文件: '自编公开演示' },
      { 材料编号: 'EX-C', 主题编号: 'TOP-C', 材料类型: '题目', 题型: '解答题', 题干或内容: '求解不等式-4z<12，并说明变形依据。', 选项: '', 参考答案: 'z>-3', 参考解析: '两边除以负数，不等号反向，再检验所得范围。', 满分: '3', 评分点: 'EX-CP1 正确保留等价条件 1分\nEX-CP2 除以负数时反向 1分\nEX-CP3 写出并检查解集 1分', 指标编号: 'INE-1', 来源或资料文件: '自编公开演示' },
      { 材料编号: 'CARD-A', 主题编号: 'TOP-A', 材料类型: '学习卡', 题型: '', 题干或内容: '先确认同类项，再相加系数；字母及指数保持不变。', 选项: '', 参考答案: '', 参考解析: '', 满分: '', 评分点: '', 指标编号: 'ALG-1', 来源或资料文件: '自编公开演示' },
      { 材料编号: 'CARD-B', 主题编号: 'TOP-B', 材料类型: '学习卡', 题型: '', 题干或内容: '等式两边同时做相同运算，最后代回原式检验。', 选项: '', 参考答案: '', 参考解析: '', 满分: '', 评分点: '', 指标编号: 'EQU-1', 来源或资料文件: '自编公开演示' },
      { 材料编号: 'CARD-C', 主题编号: 'TOP-C', 材料类型: '学习卡', 题型: '', 题干或内容: '乘除负数时先检查方向变化，再检查端点和取值范围。', 选项: '', 参考答案: '', 参考解析: '', 满分: '', 评分点: '', 指标编号: 'INE-1', 来源或资料文件: '自编公开演示' },
    ],
    nodes: [
      { 节点编号: 'CHECK-1', 模拟测验日期: '', 已教及测量主题: 'TOP-A、TOP-B', 说明: '自编演示第一次检查，尚未测量不等式。', 可用题目编号: 'EX-A、EX-B' },
      { 节点编号: 'CHECK-2', 模拟测验日期: '', 已教及测量主题: 'TOP-A、TOP-B、TOP-C', 说明: '自编演示第二次检查，增加不等式步骤观察。', 可用题目编号: 'EX-A、EX-B、EX-C' },
    ],
    requirements: [
      { 主题编号: 'TOP-A', 主题: '代数式与整式运算', 主题目标: '自编演示要求：解释并合并同类项。', 指标编号: 'ALG-1', 观察指标: '识别同类项并合并系数', 课标整理编号: '', '课标文件页／正文页': '', 教材正文页: '' },
      { 主题编号: 'TOP-B', 主题: '方程与方程组', 主题目标: '自编演示要求：使用等式性质求解并检验。', 指标编号: 'EQU-1', 观察指标: '保持等式两边同变', 课标整理编号: '', '课标文件页／正文页': '', 教材正文页: '' },
      { 主题编号: 'TOP-C', 主题: '不等式与不等式组', 主题目标: '自编演示要求：解释负数乘除时的不等号方向。', 指标编号: 'INE-1', 观察指标: '负数除法时改变不等号方向', 课标整理编号: '', '课标文件页／正文页': '', 教材正文页: '' },
    ],
    records,
  }
}

function encodeCsv(rows: CsvRow[]): string {
  const headers = Object.keys(rows[0] ?? {})
  const quote = (value: string): string => `"${value.replaceAll('"', '""')}"`
  return `${[headers.map(quote).join(','), ...rows.map(row => headers.map(header => quote(row[header] ?? '')).join(','))].join('\r\n')}\r\n`
}

/**
 * Write synthetic CSV files and a full fixture report into a new local directory.
 * @param args - One required --out option naming a directory that does not exist.
 * @returns Process status; the shared exporter prints only artifact paths and general status.
 */
export async function run_demo_cli(args: string[]): Promise<number> {
  const generated_at = new Date().toISOString()
  try {
    if (args.length !== 2 || args[0] !== '--out' || !args[1] || args[1].startsWith('--')) throw new Error('指定唯一的--out新目录。')
    const directory = resolve(args[1])
    await mkdir(dirname(directory), { recursive: true })
    await mkdir(directory, { recursive: false })
    const inputDirectory = join(directory, 'input')
    await mkdir(inputDirectory, { recursive: false })
    const input = make_demo_input()
    for (const key of Object.keys(TABLE_FILES) as Array<keyof DatasetInput>) {
      await writeFile(join(inputDirectory, TABLE_FILES[key]), encodeCsv(input[key]), { encoding: 'utf8', flag: 'wx' })
    }
    return await run_companion_cli(['export', '--data', inputDirectory, '--out', join(directory, 'report'), '--fixture', '--summary-only'])
  } catch {
    process.stdout.write(`${JSON.stringify({ generated_at, result_status: 'error', engine: 'local_rules', error: '合成演示生成失败；请指定尚不存在且可写的--out目录。' }, null, 2)}\n`)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void run_demo_cli(process.argv.slice(2)).then(code => { process.exitCode = code })
}
