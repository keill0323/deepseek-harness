/** Exact, bounded checks of adjacent elementary algebra transformations. */

/** One directly disproved transformation, without attributing an enduring misconception. */
export interface StepError {
  finding_type: 'inequality_direction' | 'inequality_transformation' | 'equation_transformation' | 'expression_transformation'
  title: string
  description: string
  step_refs: number[]
}

/** Verification concerns supplied transformations only, never completeness or mastery. */
export interface StepAnalysis {
  status: 'verified' | 'error' | 'unsupported' | 'no_process'
  error?: StepError
  reason: string
}

interface Rational { n: bigint; d: bigint }
type Polynomial = Map<string, Rational>
interface Expression { kind: 'expression'; value: Polynomial }
interface Relation { kind: 'relation'; left: Polynomial; right: Polynomial; operator: '=' | '<' | '>' | '<=' | '>=' }
type Statement = Expression | Relation
interface Located { statement: Statement; step: number }

const ZERO: Rational = { n: 0n, d: 1n }
const ONE: Rational = { n: 1n, d: 1n }
const MAX_PROCESS = 12000
const MAX_EXPRESSION = 512
const MAX_STATEMENTS = 128
const MAX_TERMS = 64
const MAX_DEGREE = 6

class Unsupported extends Error {}

function abs(n: bigint): bigint { return n < 0n ? -n : n }

function rational(n: bigint, d = 1n): Rational {
  if (d === 0n) throw new Unsupported('含除零运算。')
  if (n.toString().length > 80 || d.toString().length > 80) throw new Unsupported('数值超出精确核验上限。')
  if (d < 0n) { n = -n; d = -d }
  let a = abs(n); let b = d
  while (b !== 0n) { const remainder = a % b; a = b; b = remainder }
  return { n: n / a, d: d / a }
}

function add(a: Rational, b: Rational): Rational { return rational(a.n * b.d + b.n * a.d, a.d * b.d) }
function multiply(a: Rational, b: Rational): Rational { return rational(a.n * b.n, a.d * b.d) }
function divide(a: Rational, b: Rational): Rational { return rational(a.n * b.d, a.d * b.n) }
function equal(a: Rational, b: Rational): boolean { return a.n === b.n && a.d === b.d }

function term(key: string, value: Rational): Polynomial { return value.n === 0n ? new Map() : new Map([[key, value]]) }

function combine(a: Polynomial, b: Polynomial, sign = 1n): Polynomial {
  const result = new Map(a)
  for (const [key, value] of b) {
    const next = add(result.get(key) ?? ZERO, multiply(value, rational(sign)))
    if (next.n === 0n) result.delete(key)
    else result.set(key, next)
  }
  if (result.size > MAX_TERMS) throw new Unsupported('展开后的项数超出核验上限。')
  return result
}

function product(a: Polynomial, b: Polynomial): Polynomial {
  let result: Polynomial = new Map()
  for (const [left, x] of a) for (const [right, y] of b) {
    const key = (left + right).split('').sort().join('')
    if (key.length > MAX_DEGREE) throw new Unsupported('多项式次数超出核验上限。')
    result = combine(result, term(key, multiply(x, y)))
  }
  return result
}

function constant(value: Polynomial): Rational | null {
  return [...value.keys()].some(key => key !== '') ? null : value.get('') ?? ZERO
}

function variables(value: Polynomial): string {
  return [...new Set([...value.keys()].join(''))].sort().join('')
}

function samePolynomial(a: Polynomial, b: Polynomial): boolean {
  return a.size === b.size && [...a].every(([key, value]) => equal(value, b.get(key) ?? ZERO))
}

function normalize(value: string): string {
  const superscript = '⁰¹²³⁴⁵⁶⁷⁸⁹'
  return value.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/gu, digits => '^' + [...digits].map(digit => superscript.indexOf(digit)).join(''))
    .normalize('NFKC').replace(/[−﹣–]/gu, '-').replace(/[×·∙]/gu, '*').replace(/÷/gu, '/')
    .replace(/≤/gu, '<=').replace(/≥/gu, '>=').replace(/[【［]/gu, '(').replace(/[】］]/gu, ')')
    .replace(/\[/gu, '(').replace(/\]/gu, ')').replace(/\s/gu, '')
}

function polynomial(source: string): Polynomial {
  if (source.length === 0 || source.length > MAX_EXPRESSION) throw new Unsupported('表达式为空或过长。')
  if (/\/(?:\d+(?:\.\d+)?|\.\d+)(?:[A-Za-z(])/u.test(source)) throw new Unsupported('除法后接隐式乘法的写法有歧义，需明确括号。')
  if (/(?:sin|cos|tan|log|sqrt|abs|exp|ln|pi)\b|[fgh]\(/iu.test(source)) throw new Unsupported('含未支持的函数。')
  const tokens = source.match(/\d+(?:\.\d+)?|\.\d+|[A-Za-z]|[()+\-*/^]/gu) ?? []
  if (tokens.join('') !== source || tokens.length > 256) throw new Unsupported('含未支持的数学记号或表达式过长。')
  let index = 0
  let depth = 0
  function atom(): Polynomial {
    const token = tokens[index++]
    if (token === '(') {
      depth += 1
      if (depth > 20) throw new Unsupported('括号嵌套过深。')
      const value = sum()
      if (tokens[index++] !== ')') throw new Unsupported('括号不配对。')
      depth -= 1
      return value
    }
    if (token && /^[A-Za-z]$/u.test(token)) return term(token, ONE)
    if (token && /^(?:\d+(?:\.\d+)?|\.\d+)$/u.test(token)) {
      if (token.length > 18) throw new Unsupported('常数位数超出核验上限。')
      const pieces = token.split('.')
      const digits = pieces[1]?.length ?? 0
      return term('', rational(BigInt(token.replace('.', '')), 10n ** BigInt(digits)))
    }
    throw new Unsupported('缺少运算对象。')
  }
  function power(): Polynomial {
    let value = atom()
    if (tokens[index] === '^') {
      index += 1
      const exponent = tokens[index++] ?? ''
      if (!/^\d$/u.test(exponent) || Number(exponent) > MAX_DEGREE) throw new Unsupported('仅支持0至6的整数指数。')
      const base = value
      if (exponent === '0' && (constant(base)?.n ?? 0n) === 0n) throw new Unsupported('零或可能为零的底数取零次幂，定义域条件未确认。')
      value = term('', ONE)
      for (let i = 0; i < Number(exponent); i += 1) value = product(value, base)
    }
    return value
  }
  function unary(): Polynomial {
    if (tokens[index] === '+') { index += 1; return unary() }
    if (tokens[index] === '-') { index += 1; return product(term('', rational(-1n)), unary()) }
    return power()
  }
  function factors(): Polynomial {
    let value = unary()
    while (index < tokens.length) {
      const token = tokens[index]!
      if (token === '*') { index += 1; value = product(value, unary()) }
      else if (token === '/') {
        index += 1
        const denominator = constant(unary())
        if (denominator === null) throw new Unsupported('含变量分母，不能以整式恒等核验。')
        value = product(value, term('', divide(ONE, denominator)))
      } else if (token === '(' || /^[A-Za-z]$/u.test(token)) value = product(value, unary())
      else break
    }
    return value
  }
  function sum(): Polynomial {
    let value = factors()
    while (tokens[index] === '+' || tokens[index] === '-') {
      const sign = tokens[index++] === '+' ? 1n : -1n
      value = combine(value, factors(), sign)
    }
    return value
  }
  const value = sum()
  if (index !== tokens.length) throw new Unsupported('表达式未完整解析。')
  return value
}

function linear(value: Polynomial): boolean { return [...value.keys()].every(key => key.length <= 1) }

function equationKey(value: Polynomial): string {
  if (!linear(value)) throw new Unsupported('方程含非线性项，暂不核验其解集。')
  const keys = [...value.keys()].sort()
  if (keys.length === 0) return 'all'
  if (keys.length === 1 && keys[0] === '') return 'empty'
  const first = value.get(keys[0]!)!
  return keys.map(key => { const ratio = divide(value.get(key)!, first); return key + ':' + ratio.n + '/' + ratio.d }).join('|')
}

function relationVariables(value: Relation): string { return variables(combine(value.left, value.right, -1n)) }

interface Range { kind: 'all' | 'empty' | 'bound'; variable?: string; endpoint?: Rational; direction?: '<' | '>'; inclusive?: boolean }

function range(value: Relation): Range {
  const difference = combine(value.left, value.right, -1n)
  if (!linear(difference)) throw new Unsupported('不等式含非线性项。')
  const names = variables(difference)
  if (names.length > 1) throw new Unsupported('暂不核验多变量不等式。')
  const b = difference.get('') ?? ZERO
  const a = names ? difference.get(names)! : ZERO
  const greater = value.operator.startsWith('>')
  const inclusive = value.operator.endsWith('=')
  if (a.n === 0n) {
    const valid = greater ? b.n > 0n || (inclusive && b.n === 0n) : b.n < 0n || (inclusive && b.n === 0n)
    return { kind: valid ? 'all' : 'empty' }
  }
  return { kind: 'bound', variable: names, endpoint: divide(multiply(b, rational(-1n)), a), direction: greater === (a.n > 0n) ? '>' : '<', inclusive }
}

function sameRange(a: Range, b: Range): boolean {
  return a.kind === b.kind && (a.kind !== 'bound' || (a.variable === b.variable && a.direction === b.direction && a.inclusive === b.inclusive && equal(a.endpoint!, b.endpoint!)))
}

function missedNegativeDivision(before: Relation, after: Relation): boolean {
  const leftVariable = variables(before.left)
  const afterVariable = variables(after.left)
  if (leftVariable.length !== 1 || leftVariable !== afterVariable || before.operator !== after.operator) return false
  if (before.left.size !== 1 || after.left.size !== 1 || !equal(after.left.get(leftVariable) ?? ZERO, ONE)) return false
  const coefficient = before.left.get(leftVariable)
  if (!coefficient) return false
  const firstBound = constant(before.right); const lastBound = constant(after.right)
  return coefficient.n < 0n && firstBound !== null && lastBound !== null && equal(divide(firstBound, coefficient), lastBound)
}

function compare(before: Statement, after: Statement, expressionTask: boolean): StepError | null {
  if (before.kind !== after.kind) throw new Unsupported('相邻步骤不是同一种可核验的数学关系。')
  if (before.kind === 'expression' && after.kind === 'expression') {
    if (!expressionTask && variables(before.value) !== variables(after.value)) throw new Unsupported('变量集合改变，可能含代入或换元，需另行核对。')
    if (samePolynomial(before.value, after.value)) return null
    return { finding_type: 'expression_transformation', title: '整式变形前后不恒等', description: '精确展开并合并同类项后，相邻两式的系数不一致；应先核对这一步的符号、去括号、乘法或合并运算。', step_refs: [] }
  }
  if (before.kind !== 'relation' || after.kind !== 'relation') throw new Unsupported('无法比较相邻步骤。')
  if ((before.operator === '=') !== (after.operator === '=')) throw new Unsupported('等式与不等式之间的转换需人工核对。')
  if (relationVariables(before) !== relationVariables(after)) throw new Unsupported('方程变量集合改变，可能涉及独立条件、消元或换元。')
  if (before.operator === '=') {
    const same = equationKey(combine(before.left, before.right, -1n)) === equationKey(combine(after.left, after.right, -1n))
    if (!same && relationVariables(before).length > 1) throw new Unsupported('多变量方程可能是独立条件；仅确认成比例的等价变形，不据此判错。')
    return same ? null : { finding_type: 'equation_transformation', title: '方程变形改变了解集', description: '对相邻线性方程精确整理后，得到的解集不一致；应先核对这一步两边的运算、移项和合并。', step_refs: [] }
  }
  if (sameRange(range(before), range(after))) return null
  return missedNegativeDivision(before, after)
    ? { finding_type: 'inequality_direction', title: '负数除法步骤未改变方向', description: '相邻两步显示两边除以同一负数，除法所得数值相符，但不等号仍保持原方向。', step_refs: [] }
    : { finding_type: 'inequality_transformation', title: '不等式变形改变了解集', description: '精确整理相邻一元线性不等式后，方向、端点或端点是否包含不一致；应先核对这一步的运算与不等号。', step_refs: [] }
}

function statements(text: string, expressionMode: boolean): Statement[] {
  const raw = normalize(text)
  const operators = [...raw.matchAll(/<=|>=|=|<|>/gu)]
  if (operators.length === 0) return [{ kind: 'expression', value: polynomial(raw) }]
  if (expressionMode && operators.every(match => match[0] === '=')) return raw.split('=').filter(Boolean).map(value => ({ kind: 'expression', value: polynomial(value) }))
  if (operators.every(match => match[0] === '=')) {
    const parts = raw.split('=')
    const left = polynomial(parts[0]!)
    return parts.slice(1).map(value => ({ kind: 'relation', left, right: polynomial(value), operator: '=' }))
  }
  if (operators.length !== 1) throw new Unsupported('连锁不等式或复合条件暂不核验。')
  const operator = operators[0]!
  return [{ kind: 'relation', left: polynomial(raw.slice(0, operator.index)), right: polynomial(raw.slice(operator.index! + operator[0].length)), operator: operator[0] as Relation['operator'] }]
}

function questionAnchor(question: string, expressionMode: boolean): Statement | null {
  const match = expressionMode
    ? /(?:化简|计算|展开)(?:下列(?:代数)?(?:式子|各式|整式|表达式)?)?[：:]?\s*([^，,；;。\n]+)/u.exec(question)
    : /解(?:下列)?(?:方程|不等式)[：:]?\s*([^，,；;。\n]+)/u.exec(question)
  if (!match) return null
  try {
    const parsed = statements(match[1]!, expressionMode)
    return parsed.length === 1 ? parsed[0]! : null
  } catch (error) {
    if (error instanceof Unsupported) return null
    throw error
  }
}

/**
 * Check the earliest directly disproved adjacent transformation using exact arithmetic.
 * @param process - The submitted numbered or unnumbered process, never teacher answer text.
 * @param question - The supplied question, used to identify expression tasks and quoted counterexamples.
 * @returns A first local error, verified comparable transformations, or an explicit unsupported reason.
 */
export function analyze_steps(process: string, question: string): StepAnalysis {
  if (process.trim() === '') return { status: 'no_process', reason: '未提供解答过程。' }
  if (process.length > MAX_PROCESS || question.length > MAX_PROCESS) return { status: 'unsupported', reason: '过程或题干过长，未自动核验。' }
  if (/方程组|不等式组|同时满足|公共解集|共同范围|且|分别(?:解|计算)|[（(]1[）)].*[（(]2[）)]/u.test(question)
    || (question.match(/<=|>=|=|<|>|≤|≥/gu)?.length ?? 0) > 1
    || (question.match(/至少|至多|不少于|不多于|不超过|不低于|不大于|不小于|大于|小于|比[^，。、；]{0,20}?[大小]/gu)?.length ?? 0) > 1) return { status: 'unsupported', reason: '多条件或多子题中的独立关系不能按单条等价变形链比较，需人工核验。' }
  if (/判断|辨析|是否正确|指出.*(?:错|问题)|找出.*(?:错|问题)|说法.*(?:对|正确)|解法.*(?:对|正确)|小明说|以下.*错误|反例|改正|改错|有误|纠错|订正|有什么问题|解答如下/u.test(question)
    || /错误解法|错误示范|反例|不正确|不成立|错在|第[^。\n]*步[^。\n]*(?:有误|漏|错)|这一步.*错|该步.*错|不能.*(?:写|变|得到)|应(?:当|该)?(?:改|为)|纠正|正确(?:结果|写法)/u.test(process)) {
    return { status: 'unsupported', reason: '过程可能引用、辨析或纠正他人错误，不能把其中的式子直接归因为学生错误。' }
  }
  if (/代入|求值|当[^。\n]*[=＝]/u.test(question)) return { status: 'unsupported', reason: '含代入求值条件，不能把赋值后的式子直接当作恒等变形核验。' }
  const normalizedQuestion = normalize(question).replace(/[。.;；]+$/u, '')
  const directTask = /化简|计算|展开|合并同类项|去括号|解(?:下列|一元一次|关于[A-Za-z]的)?(?:方程|不等式)/u.test(question)
  const mathOnlyQuestion = /^[A-Za-z0-9().+\-*/^=<>]+$/u.test(normalizedQuestion) && /[()+\-*/^=<>]/u.test(normalizedQuestion)
  if (question.trim() !== '' && !directTask && !mathOnlyQuestion) return { status: 'unsupported', reason: '题干不是已支持的直接计算或求解任务，无法确认各式属于同一条学生主张的变形链。' }
  const expressionMode = !/方程|不等式/u.test(question) && (/化简|计算|展开|合并同类项|去括号/u.test(question) || /原式[=＝]/u.test(process))
  let previous: Located | null = null
  const anchor = questionAnchor(question, expressionMode)
  if (anchor) previous = { statement: anchor, step: 0 }
  let checked = 0
  let count = 0
  let unsupported = ''
  const lines = process.split(/\r?\n/u).filter(line => line.trim() !== '')
  for (const [index, line] of lines.entries()) {
    const numbered = /^\s*([0-9０-９]+)\s*(?:[.．](?![0-9０-９])|[、)）])\s*(.*)$/u.exec(line)
    const step = numbered ? Number(numbered[1]!.normalize('NFKC')) : index + 1
    if (!Number.isSafeInteger(step) || step < 1) return { status: 'unsupported', reason: '步骤编号不是可精确引用的正整数。' }
    let body = (numbered?.[2] ?? line).trim()
    if (/^(?:检验|验算|验证)[：:]/u.test(body)) { previous = null; continue }
    body = body.replace(/^(?:解|答)[：:]\s*/u, '').replace(/^(?:两边(?:同乘|同除|同时加|同时减)[^：:]*|移项|合并同类项|去括号|化简|整理)[：:]\s*/u, '').replace(/^原式\s*[=＝]\s*/u, '')
    if (body === '') continue
    const pieces = body.split(/(?:→|⇒|⟹|，|,|；|;)/u)
    for (const piece of pieces) {
      const cleaned = piece.trim().replace(/^(?:所以|因此|得|即)[：:]?\s*/u, '').replace(/[。.;；]+$/u, '').replace(/^=\s*/u, '')
      if (cleaned === '') continue
      try {
        const parsed = statements(cleaned, expressionMode)
        for (const statement of parsed) {
          count += 1
          if (count > MAX_STATEMENTS) return { status: 'unsupported', reason: '待核验式子数量超出上限。' }
          if (previous) {
            const error = compare(previous.statement, statement, expressionMode)
            checked += 1
            if (error) return { status: 'error', error: { ...error, step_refs: [step], description: error.description + ' 此为当前过程最早可确认的不一致；其后沿用该结果的变形不重复计作独立根因。' }, reason: unsupported ? '此前含未支持的内容，仅定位最早能够直接确认的错误。' : '精确核验相邻变形，未推断学生的长期能力。' }
          }
          previous = { statement, step }
        }
      } catch (error) {
        if (!(error instanceof Unsupported)) throw error
        unsupported ||= error.message
        previous = null
      }
    }
  }
  if (unsupported) return { status: 'unsupported', reason: unsupported + ' 未把未支持部分判为正确或错误。' }
  if (checked === 0) return { status: 'unsupported', reason: '没有可直接比较的相邻变形，无法确认步骤错误。' }
  return { status: 'verified', reason: '已核验的相邻变形等价；不代表解答完整、最终答案正确或学生已掌握。' }
}
