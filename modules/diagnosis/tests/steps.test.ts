import assert from 'node:assert/strict'
import test from 'node:test'
import { analyze_steps } from '../steps.ts'

test('equation transposition finds the first changed solution and not its propagated result', () => {
  const result = analyze_steps('1. 2x+3=7。\n2. 2x=10。\n3. x=5。', '解方程：2x+3=7。')
  assert.equal(result.status, 'error')
  assert.equal(result.error?.finding_type, 'equation_transformation')
  assert.deepEqual(result.error?.step_refs, [2])
})

test('equation anchoring detects an already wrong first submitted transformation', () => {
  const result = analyze_steps('1. 2x=10。\n2. x=5。', '解方程：2x+3=7。')
  assert.equal(result.status, 'error')
  assert.deepEqual(result.error?.step_refs, [1])
})

test('fractional equation, combined same-line steps, and numeric checking preserve the correct solution', () => {
  const result = analyze_steps('1. 两边同乘6：3(x-1)+2(x+1)=24。\n2. 3x-3+2x+2=24。\n3. 5x-1=24。\n4. 5x=25，x=5。\n5. 检验：(5-1)/2+(5+1)/3=2+2=4。', '解方程：(x-1)/2+(x+1)/3=4。')
  assert.equal(result.status, 'verified')
})

test('an equals chain keeps its fixed equation left side', () => {
  const result = analyze_steps('1. x=9-6=3。', '解方程：x+6=9。')
  assert.equal(result.status, 'verified')
})

test('equivalent linear equations may exchange sides or multiply by a nonzero rational', () => {
  for (const process of ['1. 2x+4=8\n2. 4=x+2\n3. x=2', '1. x+y=3\n2. 2x+2y=6', '1. 0.1x+0.2=0.3\n2. x=1']) {
    assert.equal(analyze_steps(process, '').status, 'verified', process)
  }
  const process = '1. 2(x+1)=6。\n2. 2x+2=6。\n3. 2x=4。\n4. x=2。'
  assert.equal(analyze_steps(process, '解方程：2(x+1)=6，注意正确去括号。').status, 'verified')
  assert.equal(analyze_steps(process, '先去括号，再解方程2(x+1)=6。').status, 'verified')
})

test('expression expansion and collecting terms are checked as polynomial identities', () => {
  const cases = [
    ['1. -(2x-3)+x\n2. -2x-3+x\n3. -x-3', '化简：-(2x-3)+x。'],
    ['1. 2x+3x\n2. 6x', '化简：2x+3x。'],
    ['1. 2+3*4\n2. 20', '计算：2+3*4。'],
  ]
  for (const [process, question] of cases) {
    const result = analyze_steps(process!, question!)
    assert.equal(result.status, 'error')
    assert.equal(result.error?.finding_type, 'expression_transformation')
    assert.deepEqual(result.error?.step_refs, [2])
  }
})

test('an original-expression label and omitted label on the next line share the question anchor', () => {
  const question = '化简：3(2a-b)-2(a+2b)。'
  assert.equal(analyze_steps('1. 原式=6a-3b-2a-4b。\n2. =4a-7b。', question).status, 'verified')
  const wrong = analyze_steps('1. 原式=6a-3b-2a+4b。\n2. =4a+b。', question)
  assert.equal(wrong.status, 'error')
  assert.deepEqual(wrong.error?.step_refs, [1])
})

test('same-line expression chains and arrows report the actual submitted step number', () => {
  const expression = analyze_steps('7. -(2x-3)+x=-2x-3+x=-x-3', '化简：-(2x-3)+x。')
  assert.equal(expression.status, 'error')
  assert.deepEqual(expression.error?.step_refs, [7])
  const equation = analyze_steps('4. 2x+3=7 → 2x=10 → x=5', '解方程：2x+3=7。')
  assert.equal(equation.status, 'error')
  assert.deepEqual(equation.error?.step_refs, [4])
})

test('rational polynomial comparison does not use numerical samples', () => {
  assert.equal(analyze_steps('1. (x+1)^2\n2. x^2+2x+1', '化简：(x+1)^2。').status, 'verified')
  assert.equal(analyze_steps('1. (a+b)(a-b)\n2. a^2-b^2', '化简：(a+b)(a-b)。').status, 'verified')
  assert.equal(analyze_steps('1. x/3+x/6\n2. x/2', '化简：x/3+x/6。').status, 'verified')
  const wrong = analyze_steps('1. (x-1)(x-2)\n2. 0', '化简：(x-1)(x-2)。')
  assert.equal(wrong.status, 'error')
})

test('unicode superscripts, fullwidth symbols, and unary minus retain mathematical precedence', () => {
  assert.equal(analyze_steps('１．（ｘ＋１）²\n２．ｘ²＋２ｘ＋１', '化简：（x+1）²。').status, 'verified')
  const wrong = analyze_steps('1. -x^2\n2. (-x)^2', '化简：-x^2。')
  assert.equal(wrong.status, 'error')
  assert.equal(wrong.error?.finding_type, 'expression_transformation')
  assert.equal(analyze_steps('0.5x+1=2\nx=2', '').status, 'verified')
})

test('inequality direction error remains separate from numerical and endpoint errors', () => {
  const direction = analyze_steps('1. -3y<12\n2. y<-4', '')
  assert.equal(direction.error?.finding_type, 'inequality_direction')
  assert.deepEqual(direction.error?.step_refs, [2])
  for (const process of ['1. -3y<12\n2. y<-7', '1. x<2\n2. x<=2', '1. 2x+3<7\n2. 2x<10']) {
    const result = analyze_steps(process, '')
    assert.equal(result.status, 'error')
    assert.equal(result.error?.finding_type, 'inequality_transformation')
  }
})

test('inequalities accept equivalent reversed-side, fractional, and constant relations', () => {
  for (const process of ['1. -2x+3<11\n2. -2x<8\n3. x>-4', '1. 2>x\n2. x<2', '1. 0x+1<2\n2. 0<1', '1. 0x+2<1\n2. 0>1']) {
    assert.equal(analyze_steps(process, '').status, 'verified', process)
  }
})

test('independent conditions in systems are never treated as transformations of each other', () => {
  for (const question of ['解方程组：x+y=3，x-y=1。', '解不等式组：x>1，x<3。', '已知x>1，x<3，求范围。']) {
    assert.equal(analyze_steps('1. x+y=3\n2. x-y=1', question).status, 'unsupported')
  }
  assert.equal(analyze_steps('1. x+y=5\n2. x-y=1\n3. x=3', '求满足x+y=5和x-y=1的x、y。').status, 'unsupported')
  assert.equal(analyze_steps('1. x+y=5，x-y=1\n2. x=3，y=2', '求两数和为5、差为1的两数。').status, 'unsupported')
  assert.equal(analyze_steps('1. x>1\n2. x<3\n3. 1<x<3', '求同时满足x>1且x<3的范围。').status, 'unsupported')
  assert.equal(analyze_steps('1. x=2\n2. x=3', '分别解下列方程。').status, 'unsupported')
  assert.equal(analyze_steps('1. x-12>=3，x>=15。\n2. x<=20。\n3. 15<=x<=20。', '某商品成本为12元，售价为x元。要求每件至少获利3元，且售价不超过20元，求售价x的取值范围。').status, 'unsupported')
  assert.equal(analyze_steps('1. x>=15\n2. x<=20', '某商品售价至少15元，不超过20元，求范围。').status, 'unsupported')
  assert.equal(analyze_steps('1. x>2\n2. x<5\n3. 2<x<5', '一个数比2大又比5小，求这个数的范围。').status, 'unsupported')
})

test('a colon is optional when anchoring an explicit algebra task', () => {
  const result = analyze_steps('1. 原式=6x-2-x+4\n2. =5x+2', '化简2(3x-1)-(x+4)')
  assert.equal(result.status, 'error')
  assert.deepEqual(result.error?.step_refs, [1])
  assert.equal(analyze_steps('2+3*4=20', '计算2+3*4').status, 'error')
})

test('substitution contexts are distinct from polynomial identities', () => {
  assert.equal(analyze_steps('1. x+1\n2. 3', '当x=2时，求x+1的值。').status, 'unsupported')
  assert.equal(analyze_steps('1. x+1\n2. 3', '代入求值。').status, 'unsupported')
})

test('quoted counterexamples and student correction are not attributed as student errors', () => {
  const process = '1. -3y<12\n2. y<-4\n3. 不正确，除以负数应反向。'
  for (const question of ['判断小明的解法是否正确。', '小明说这样变形，对吗？', '指出下列步骤中的错误。', '解不等式。']) {
    const result = analyze_steps(process, question)
    assert.equal(result.status, 'unsupported')
    assert.equal(result.error, undefined)
  }
  const correction = '1. -3y<12。\n2. y<-4。\n3. 错在第2步，除以负数时需反向。'
  assert.equal(analyze_steps(correction, '找出下面过程中的问题并改正。').status, 'unsupported')
  assert.equal(analyze_steps('1. -3y<12。\n2. y<-4。', '有一道题，某人的解答如下，你认为有什么问题？').status, 'unsupported')
  assert.equal(analyze_steps('1. -3y<12。\n2. y<-4。\n3. 第2步漏了变号，正确结果为y>-4。', '解不等式：-3y<12。').status, 'unsupported')
  assert.equal(analyze_steps('1. -3y<12。\n2. y<-4。', '这是另一份课堂记录，请谈谈看法。').status, 'unsupported')
})

test('unsupported functions, variable denominators, ambiguous division and nonlinear equations are explicit', () => {
  for (const process of ['1. sin(x)\n2. x', '1. x/x\n2. 1', '1. 2/3x\n2. 2x/3', '1. x^2=1\n2. x=1', '1. x^7\n2. x', '1. -3y<12\n2. z<-4']) {
    const result = analyze_steps(process, '')
    assert.equal(result.status, 'unsupported', process)
    assert.equal(result.error, undefined)
  }
})

test('unknown syntax creates a comparison break and is never silently declared verified', () => {
  const result = analyze_steps('1. 2x+3=7\n2. TODO: need algebra\n3. x=2', '')
  assert.equal(result.status, 'unsupported')
  assert.equal(result.error, undefined)
})

test('adjacent numeric tokens are not silently interpreted as implicit multiplication', () => {
  for (const process of ['1. 1.2.3\n2. 0.36', '1. 2(3+1)4\n2. 32', '1. x2\n2. 2x']) {
    const result = analyze_steps(process, '')
    assert.equal(result.status, 'unsupported', process)
    assert.equal(result.error, undefined, process)
  }
})

test('nonlinear terms that cancel do not crash the specialized direction classifier', () => {
  const result = analyze_steps('1. x^2<x^2+2x\n2. x<0', '')
  assert.equal(result.status, 'error')
  assert.equal(result.error?.finding_type, 'inequality_transformation')
})

test('missing, one-statement and excessive processes return bounded statuses', () => {
  assert.equal(analyze_steps('', '').status, 'no_process')
  assert.equal(analyze_steps('x=2', '').status, 'unsupported')
  assert.equal(analyze_steps('x'.repeat(12001), '').status, 'unsupported')
  assert.equal(analyze_steps('1. ' + '('.repeat(30) + 'x' + ')'.repeat(30) + '\n2. x', '').status, 'unsupported')
  assert.equal(analyze_steps('1. 1/0\n2. 2', '').status, 'unsupported')
  assert.equal(analyze_steps('1. 0^0\n2. 1', '').status, 'unsupported')
  assert.equal(analyze_steps('1. x^0\n2. 1', '化简：x^0。').status, 'unsupported')
  assert.equal(analyze_steps('1. 2^0\n2. 1', '').status, 'verified')
  assert.equal(analyze_steps('9999999999999999999999. 2x=4\n2. x=3', '').status, 'unsupported')
})
