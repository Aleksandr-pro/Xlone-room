/**
 * Safe, zero-eval AE-style expression parser & evaluator.
 * Supports:
 * - Variables: time, index, value, fps, duration, PI, E
 * - Arithmetic: +, -, *, /, %, ^, unary -, parentheses
 * - Comparisons: >, <, >=, <=, ==, !=
 * - Functions: wiggle(freq, amp), loopOut(type), sin, cos, tan, abs, sqrt, pow, min, max, floor, ceil, round, clamp, linear
 * - Math.* namespace aliases (Math.sin, Math.PI, etc.)
 */

export interface ExpressionContext {
  time: number;
  index: number;
  value: number;
  fps: number;
  duration: number;
  seed: number;
  evalAtTime?: (t: number) => number;
  firstKeyframeTime?: number;
  lastKeyframeTime?: number;
}

type Token =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'id'; value: string }
  | { type: 'op'; value: string }
  | { type: 'paren'; value: '(' | ')' }
  | { type: 'comma' }
  | { type: 'question' }
  | { type: 'colon' };

function hash1D(n: number, seed: number): number {
  const x = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453123;
  return (x - Math.floor(x)) * 2 - 1;
}

function smoothNoise1D(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  const a = hash1D(i, seed);
  const b = hash1D(i + 1, seed);
  return a + (b - a) * u;
}

export function evalWiggle(time: number, freq: number, amp: number, seed: number, baseValue: number): number {
  if (freq <= 0 || amp === 0) return baseValue;
  const n1 = smoothNoise1D(time * freq, seed);
  const n2 = smoothNoise1D(time * freq * 2.07 + 13.37, seed + 7) * 0.35;
  return baseValue + ((n1 + n2) / 1.35) * amp;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(input[i + 1] ?? ''))) {
      let numStr = '';
      while (i < input.length && /[0-9.]/.test(input[i])) {
        numStr += input[i++];
      }
      const parsed = Number(numStr);
      if (Number.isNaN(parsed)) throw new Error(`Invalid number: ${numStr}`);
      tokens.push({ type: 'num', value: parsed });
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let str = '';
      while (i < input.length && input[i] !== quote) {
        str += input[i++];
      }
      i++; // closing quote
      tokens.push({ type: 'str', value: str });
      continue;
    }

    if (/[a-zA-Z_$]/.test(ch)) {
      let id = '';
      while (i < input.length && /[a-zA-Z0-9_$.]/.test(input[i])) {
        id += input[i++];
      }
      tokens.push({ type: 'id', value: id });
      continue;
    }

    const twoChar = input.slice(i, i + 2);
    if (['>=', '<=', '==', '!=', '&&', '||'].includes(twoChar)) {
      tokens.push({ type: 'op', value: twoChar });
      i += 2;
      continue;
    }

    if ('+-*/%^<>'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      i++;
      continue;
    }

    if (ch === ',') {
      tokens.push({ type: 'comma' });
      i++;
      continue;
    }

    if (ch === '?') {
      tokens.push({ type: 'question' });
      i++;
      continue;
    }

    if (ch === ':') {
      tokens.push({ type: 'colon' });
      i++;
      continue;
    }

    // Skip trailing semicolons safely
    if (ch === ';') {
      i++;
      continue;
    }

    throw new Error(`Unexpected character '${ch}'`);
  }

  return tokens;
}

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[], private readonly ctx: ExpressionContext) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    const t = this.tokens[this.pos++];
    if (!t) throw new Error('Unexpected end of expression');
    return t;
  }

  parse(): number {
    if (this.tokens.length === 0) return this.ctx.value;
    const val = this.parseTernary();
    return typeof val === 'number' && Number.isFinite(val) ? val : this.ctx.value;
  }

  private parseTernary(): number | string {
    const cond = this.parseOr();
    if (this.peek()?.type === 'question') {
      this.consume();
      const truthy = this.parseTernary();
      const colon = this.consume();
      if (colon.type !== 'colon') throw new Error('Expected : in ternary expression');
      const falsy = this.parseTernary();
      return Number(cond) ? truthy : falsy;
    }
    return cond;
  }

  private parseOr(): number | string {
    let left = this.parseAnd();
    while (this.peek()?.type === 'op' && (this.peek() as { value: string }).value === '||') {
      this.consume();
      const right = this.parseAnd();
      left = Number(left) || Number(right) ? 1 : 0;
    }
    return left;
  }

  private parseAnd(): number | string {
    let left = this.parseComparison();
    while (this.peek()?.type === 'op' && (this.peek() as { value: string }).value === '&&') {
      this.consume();
      const right = this.parseComparison();
      left = Number(left) && Number(right) ? 1 : 0;
    }
    return left;
  }

  private parseComparison(): number | string {
    let left = this.parseAddSub();
    while (
      this.peek()?.type === 'op' &&
      ['>', '<', '>=', '<=', '==', '!='].includes((this.peek() as { value: string }).value)
    ) {
      const op = (this.consume() as { value: string }).value;
      const right = this.parseAddSub();
      const l = Number(left);
      const r = Number(right);
      if (op === '>') left = l > r ? 1 : 0;
      else if (op === '<') left = l < r ? 1 : 0;
      else if (op === '>=') left = l >= r ? 1 : 0;
      else if (op === '<=') left = l <= r ? 1 : 0;
      else if (op === '==') left = l === r ? 1 : 0;
      else left = l !== r ? 1 : 0;
    }
    return left;
  }

  private parseAddSub(): number | string {
    let left = this.parseMulDiv();
    while (
      this.peek()?.type === 'op' &&
      ((this.peek() as { value: string }).value === '+' || (this.peek() as { value: string }).value === '-')
    ) {
      const op = (this.consume() as { value: string }).value;
      const right = this.parseMulDiv();
      left = op === '+' ? Number(left) + Number(right) : Number(left) - Number(right);
    }
    return left;
  }

  private parseMulDiv(): number | string {
    let left = this.parsePower();
    while (
      this.peek()?.type === 'op' &&
      ['*', '/', '%'].includes((this.peek() as { value: string }).value)
    ) {
      const op = (this.consume() as { value: string }).value;
      const right = this.parsePower();
      const l = Number(left);
      const r = Number(right);
      if (op === '*') left = l * r;
      else if (op === '/') left = r === 0 ? 0 : l / r;
      else left = r === 0 ? 0 : l % r;
    }
    return left;
  }

  private parsePower(): number | string {
    let left = this.parseUnary();
    while (this.peek()?.type === 'op' && (this.peek() as { value: string }).value === '^') {
      this.consume();
      const right = this.parseUnary();
      left = Math.pow(Number(left), Number(right));
    }
    return left;
  }

  private parseUnary(): number | string {
    if (this.peek()?.type === 'op') {
      const op = (this.peek() as { value: string }).value;
      if (op === '-' || op === '+') {
        this.consume();
        const val = Number(this.parseUnary());
        return op === '-' ? -val : val;
      }
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number | string {
    const t = this.consume();
    if (t.type === 'num') return t.value;
    if (t.type === 'str') return t.value;

    if (t.type === 'paren' && t.value === '(') {
      const val = this.parseTernary();
      const close = this.consume();
      if (close.type !== 'paren' || close.value !== ')') {
        throw new Error('Missing closing parenthesis');
      }
      return val;
    }

    if (t.type === 'id') {
      if (this.peek()?.type === 'paren' && (this.peek() as { value: string }).value === '(') {
        this.consume(); // '('
        const args: (number | string)[] = [];
        if (!(this.peek()?.type === 'paren' && (this.peek() as { value: string }).value === ')')) {
          args.push(this.parseTernary());
          while (this.peek()?.type === 'comma') {
            this.consume();
            args.push(this.parseTernary());
          }
        }
        const close = this.consume();
        if (close.type !== 'paren' || close.value !== ')') {
          throw new Error(`Expected ')' after arguments to ${t.value}`);
        }
        return this.callFunction(t.value, args);
      }

      return this.resolveVariable(t.value);
    }

    throw new Error('Unexpected token in expression');
  }

  private resolveVariable(name: string): number {
    switch (name) {
      case 'time':
        return this.ctx.time;
      case 'index':
        return this.ctx.index;
      case 'value':
        return this.ctx.value;
      case 'fps':
        return this.ctx.fps;
      case 'duration':
        return this.ctx.duration;
      case 'PI':
      case 'Math.PI':
        return Math.PI;
      case 'E':
      case 'Math.E':
        return Math.E;
      default:
        throw new Error(`Unknown identifier '${name}'`);
    }
  }

  private callFunction(rawName: string, args: (number | string)[]): number {
    const name = rawName.startsWith('Math.') ? rawName.slice(5) : rawName;
    const n = (idx: number, def = 0): number => Number(args[idx] ?? def);

    switch (name) {
      case 'wiggle':
        return evalWiggle(this.ctx.time, n(0, 2), n(1, 20), this.ctx.seed, this.ctx.value);
      case 'loopOut': {
        const mode = String(args[0] ?? 'cycle').toLowerCase();
        const t0 = this.ctx.firstKeyframeTime ?? 0;
        const t1 = this.ctx.lastKeyframeTime ?? 0;
        const span = t1 - t0;
        if (!this.ctx.evalAtTime || span <= 0 || this.ctx.time <= t1) {
          return this.ctx.value;
        }
        const elapsed = this.ctx.time - t0;
        if (mode === 'pingpong') {
          const cycles = Math.floor(elapsed / span);
          const rem = elapsed % span;
          const mapped = cycles % 2 === 1 ? t1 - rem : t0 + rem;
          return this.ctx.evalAtTime(mapped);
        }
        // cycle
        const mapped = t0 + (elapsed % span);
        return this.ctx.evalAtTime(mapped);
      }
      case 'sin':
        return Math.sin(n(0));
      case 'cos':
        return Math.cos(n(0));
      case 'tan':
        return Math.tan(n(0));
      case 'abs':
        return Math.abs(n(0));
      case 'sqrt':
        return Math.sqrt(Math.max(0, n(0)));
      case 'pow':
        return Math.pow(n(0), n(1, 1));
      case 'min':
        return Math.min(...args.map((a) => Number(a)));
      case 'max':
        return Math.max(...args.map((a) => Number(a)));
      case 'floor':
        return Math.floor(n(0));
      case 'ceil':
        return Math.ceil(n(0));
      case 'round':
        return Math.round(n(0));
      case 'clamp':
        return Math.min(Math.max(n(0), n(1)), n(2));
      case 'linear': {
        const t = n(0);
        const tMin = n(1);
        const tMax = n(2);
        const v1 = n(3);
        const v2 = n(4);
        if (tMax === tMin) return v1;
        const p = Math.min(1, Math.max(0, (t - tMin) / (tMax - tMin)));
        return v1 + (v2 - v1) * p;
      }
      default:
        throw new Error(`Unknown function '${rawName}'`);
    }
  }
}

export function evaluateExpression(
  code: string,
  ctx: ExpressionContext
): { value: number; error?: string } {
  const trimmed = code.trim();
  if (!trimmed) return { value: ctx.value };
  try {
    const tokens = tokenize(trimmed);
    const parser = new Parser(tokens, ctx);
    return { value: parser.parse() };
  } catch (err) {
    return {
      value: ctx.value,
      error: err instanceof Error ? err.message : 'Expression error',
    };
  }
}
