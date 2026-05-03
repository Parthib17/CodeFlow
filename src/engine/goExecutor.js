/**
 * Go Subset Interpreter
 *
 * Built on top of CInterpreter — Go shares enough structural overlap with C
 * (statements, blocks, expressions) that we can preprocess Go-specific syntax
 * into a C-like form line by line, then dispatch through the C engine while
 * intercepting the bits that don't translate cleanly:
 *
 *   - package / import declarations are stripped (replaced with blank lines
 *     so source line numbers stay aligned with the editor)
 *   - `func name(args) ret {` is rewritten to a C-style header
 *   - `if cond {` / `else if cond {` get parens added
 *   - `for i := 0; i < n; i++ {` → `for (int i = 0; i < n; i++) {`
 *   - `for cond {` → `while (cond) {`
 *   - `for {` → `while (true) {`
 *   - `arr := []int{...}` → `int arr[] = {...}`
 *   - `arr := make([]int, n)` → `int arr[] = new int[n]`
 *   - `var x int = 5` / `var x = 5` / `var x int`
 *   - generic `x := expr` → `auto x = expr`
 *
 * What we keep Go-flavored and handle in `_execStmt`:
 *   - `for i, v := range arr {` and friends
 *   - parallel assignment / decl: `a, b = b, a` and `a, b := 1, 2`
 *   - `fmt.Println / fmt.Printf / fmt.Print`
 *   - `len()`, `append()`, `make()` builtins (in `_eval`)
 */

import { CInterpreter, deepClone, splitArgs } from './cExecutor.js';

// ── Go-flavored display helpers ─────────────────────────────────────────

function getGoType(val) {
    if (val === null || val === undefined) return 'nil';
    if (typeof val === 'boolean') return 'bool';
    if (typeof val === 'string') return 'string';
    if (typeof val === 'number') return Number.isInteger(val) ? 'int' : 'float64';
    if (Array.isArray(val)) return 'slice';
    if (typeof val === 'object') return 'map';
    return typeof val;
}

function formatGoValue(val) {
    if (val === null || val === undefined) return '<nil>';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'string') return `"${val}"`;
    if (Array.isArray(val)) return `[${val.map(formatGoValue).join(' ')}]`;
    if (typeof val === 'number') return String(val);
    return String(val);
}

function unescapeGoString(s) {
    return s
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .replace(/\\\\/g, '\\')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'");
}

// ── Source preprocessor ─────────────────────────────────────────────────
// Walks each line and rewrites Go-specific syntax into a C-like equivalent
// without changing the line count, so step line-numbers still match the
// editor's display.

function splitGoForHeader(header) {
    const parts = [];
    let depth = 0, inStr = false, strCh = '', cur = '';
    for (const ch of header) {
        if (!inStr && (ch === '"' || ch === "'" || ch === '`')) { inStr = true; strCh = ch; cur += ch; continue; }
        if (inStr && ch === strCh) { inStr = false; cur += ch; continue; }
        if (inStr) { cur += ch; continue; }
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        if (ch === ')' || ch === ']' || ch === '}') depth--;
        if (ch === ';' && depth === 0) { parts.push(cur.trim()); cur = ''; }
        else cur += ch;
    }
    parts.push(cur.trim());
    return parts;
}

function transformGoLine(line) {
    const indentMatch = line.match(/^\s*/);
    const indent = indentMatch ? indentMatch[0] : '';
    const stripped = line.trim();

    if (!stripped || stripped.startsWith('//')) return line;

    // package / import lines → empty (preserve line count)
    if (/^package\s+\w/.test(stripped)) return '';
    if (/^import\b/.test(stripped)) return '';
    if (stripped === ')') return '';
    if (/^"\w[\w/.-]*"\s*$/.test(stripped)) return ''; // import block entries

    // func main() {  →  int main() {
    // func name(args) ret {  →  ret name(c-style-args) {
    let m = stripped.match(/^func\s+(\w+)\s*\(([^)]*)\)\s*([^{]*?)\s*(\{?)\s*$/);
    if (m) {
        const name = m[1];
        const paramsStr = m[2].trim();
        const ret = m[3].trim() || 'void';
        const open = m[4] || '';

        // Convert Go params (name type, name type) → C (type name, type name)
        let cParams = '';
        if (paramsStr) {
            const parts = splitArgs(paramsStr).map(p => {
                const tokens = p.trim().split(/\s+/);
                if (tokens.length === 1) return `int ${tokens[0]}`;
                const typeTok = tokens[tokens.length - 1];
                const cType = typeTok.startsWith('[]') ? typeTok.slice(2) : typeTok;
                const isSlice = typeTok.startsWith('[]');
                const names = tokens.slice(0, -1).join(' ');
                return `${cType} ${names}${isSlice ? '[]' : ''}`;
            });
            cParams = parts.join(', ');
        }

        const cRet = ret === 'void'
            ? 'int'
            : ret.startsWith('[]') ? ret.slice(2) : ret;
        return `${indent}${cRet} ${name}(${cParams}) ${open}`;
    }

    // Range loops are handled in _execStmt — leave them alone but normalize
    // trailing whitespace.
    if (/^for\b/.test(stripped) && /\brange\b/.test(stripped)) {
        return line;
    }

    // for { ... }  (infinite)
    m = stripped.match(/^for\s*(\{?)\s*$/);
    if (m) {
        const open = m[1] || '{';
        return `${indent}while (true) ${open}`;
    }

    // for init; cond; update { ... }   OR   for cond { ... }
    m = stripped.match(/^for\s+(.+?)\s*\{\s*$/);
    if (m) {
        const inner = m[1];
        const parts = splitGoForHeader(inner);
        if (parts.length === 3) {
            // 3-part for: rewrite `i := 0` → `int i = 0`
            const initFix = parts[0].replace(/^([a-zA-Z_]\w*)\s*:=\s*/, 'int $1 = ');
            return `${indent}for (${initFix}; ${parts[1]}; ${parts[2]}) {`;
        }
        return `${indent}while (${inner}) {`;
    }

    // if cond {  →  if (cond) {
    m = stripped.match(/^if\s+(.+?)\s*\{\s*$/);
    if (m && !m[1].startsWith('(')) {
        return `${indent}if (${m[1]}) {`;
    }
    // } else if cond {  /  else if cond {
    m = stripped.match(/^\}\s*else\s+if\s+(.+?)\s*\{\s*$/);
    if (m && !m[1].startsWith('(')) {
        return `${indent}} else if (${m[1]}) {`;
    }
    m = stripped.match(/^else\s+if\s+(.+?)\s*\{\s*$/);
    if (m && !m[1].startsWith('(')) {
        return `${indent}else if (${m[1]}) {`;
    }

    // Variable declarations
    // arr := []TYPE{vals}  →  TYPE arr[] = {vals};
    m = stripped.match(/^(\w+)\s*:=\s*\[\](\w+)\s*\{(.*)\}\s*;?\s*$/);
    if (m) return `${indent}${m[2]} ${m[1]}[] = {${m[3]}};`;

    // arr := make([]TYPE, size)  →  TYPE arr[] = new TYPE[size];
    m = stripped.match(/^(\w+)\s*:=\s*make\s*\(\s*\[\](\w+)\s*,\s*([^,)]+)(?:,\s*[^)]+)?\s*\)\s*;?\s*$/);
    if (m) return `${indent}${m[2]} ${m[1]}[] = new ${m[2]}[${m[3]}];`;

    // var x TYPE = val  →  TYPE x = val;
    m = stripped.match(/^var\s+(\w+)\s+(\[\])?(\w+)\s*=\s*(.+?);?\s*$/);
    if (m) {
        if (m[2]) return `${indent}${m[3]} ${m[1]}[] = ${m[4]};`;
        return `${indent}${m[3]} ${m[1]} = ${m[4]};`;
    }
    // var x TYPE  →  TYPE x;
    m = stripped.match(/^var\s+(\w+)\s+(\[\])?(\w+)\s*;?\s*$/);
    if (m) {
        if (m[2]) return `${indent}${m[3]} ${m[1]}[];`;
        return `${indent}${m[3]} ${m[1]};`;
    }
    // var x = val  →  auto x = val;
    m = stripped.match(/^var\s+(\w+)\s*=\s*(.+?);?\s*$/);
    if (m) return `${indent}auto ${m[1]} = ${m[2]};`;

    // Don't transform other lines (handled in _execStmt or fall through to C)
    return line;
}

function preprocessGoSource(source) {
    return source.split('\n').map(transformGoLine).join('\n');
}

// ── GoInterpreter ───────────────────────────────────────────────────────

class GoInterpreter extends CInterpreter {
    constructor(source) {
        const preprocessed = preprocessGoSource(source);
        super(preprocessed);
    }

    _snapshot(line, description, changedVars = [], flowType = null, flowDetail = null) {
        this.stepCount++;
        if (this.stepCount > 5000) throw new Error('Maximum execution steps exceeded (possible infinite loop)');

        const allVars = this._allDisplayVars();
        const snap = {};
        for (const [k, v] of Object.entries(allVars)) {
            snap[k] = { value: deepClone(v), display: formatGoValue(v), type: getGoType(v) };
        }

        if (changedVars.length === 0) {
            for (const k of Object.keys(snap)) {
                const prev = this.prevSnapshot[k];
                if (!prev || prev.display !== snap[k].display) changedVars.push(k);
            }
        }
        this.prevSnapshot = snap;

        this.steps.push({
            step: this.steps.length + 1,
            line: line + 1,
            description,
            variables: snap,
            changedVars,
            output: this.output,
            flowType,
            flowDetail,
            dataStructures: Object.entries(snap)
                .filter(([, i]) => Array.isArray(i.value))
                .map(([name, info]) => ({
                    name, type: 'array',
                    values: info.value.map(v => ({ value: v, display: formatGoValue(v) })),
                })),
        });
    }

    _isTypeKeyword(word) {
        return super._isTypeKeyword(word) ||
            /^(?:int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|byte|rune|string|bool|complex64|complex128|uintptr)$/.test(word);
    }

    _isTypeDecl(text) {
        if (super._isTypeDecl(text)) return true;
        return /^(?:int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|byte|rune|complex64|complex128|uintptr|string)\s*\*?\s*\w/.test(text);
    }

    // ── Statement dispatch ────────────────────────────────────────────

    _execStmt({ text, line }, idx, all) {
        if (!text || text === '{' || text === '}' || text.startsWith('//')) {
            return { type: 'normal' };
        }

        // fmt.Println / fmt.Printf / fmt.Print
        if (/^fmt\.(Println|Printf|Print)\s*\(/.test(text)) {
            this._execGoPrint(text, line);
            return { type: 'normal' };
        }

        // Range loop:  for i, v := range arr  /  for v := range arr  /  for _, v := range arr
        if (/^for\s+/.test(text) && /\brange\b/.test(text)) {
            return this._execGoRange(text, line, idx, all);
        }

        // Parallel assignment / decl — must run before super to avoid
        // C interpreter's regex failing on multi-target lhs
        if (this._looksLikeParallel(text)) {
            const res = this._tryParallel(text, line);
            if (res) return res;
        }

        // Single-target short decl `name := expr` (the slice / make forms were
        // already lifted into C-style decls during preprocessing; everything
        // else lands here)
        const shortDecl = text.replace(/;$/, '').trim().match(/^([a-zA-Z_]\w*)\s*:=\s*(.+)$/);
        if (shortDecl) {
            const name = shortDecl[1];
            const val = this._eval(shortDecl[2]);
            this._vars[name] = val;
            this._snapshot(line, `${name} := ${formatGoValue(val)}`, [name], 'var-init');
            return { type: 'normal' };
        }

        return super._execStmt({ text, line }, idx, all);
    }

    // Detect a comma at top depth that comes before `=` or `:=`
    _looksLikeParallel(text) {
        let depth = 0, inStr = false, strCh = '';
        let sawComma = false;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (!inStr && (c === '"' || c === "'" || c === '`')) { inStr = true; strCh = c; continue; }
            if (inStr && c === strCh && text[i - 1] !== '\\') { inStr = false; continue; }
            if (inStr) continue;
            if (c === '(' || c === '[' || c === '{') depth++;
            else if (c === ')' || c === ']' || c === '}') depth--;
            else if (depth === 0 && c === ',') sawComma = true;
            else if (depth === 0 && sawComma && (c === '=' || (c === ':' && text[i + 1] === '='))) {
                return true;
            }
        }
        return false;
    }

    _tryParallel(text, line) {
        text = text.replace(/;$/, '').trim();
        // Find the splitter: := or =
        let isDecl = false;
        let depth = 0, inStr = false, strCh = '', splitAt = -1, splitLen = 1;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (!inStr && (c === '"' || c === "'" || c === '`')) { inStr = true; strCh = c; continue; }
            if (inStr && c === strCh && text[i - 1] !== '\\') { inStr = false; continue; }
            if (inStr) continue;
            if (c === '(' || c === '[' || c === '{') depth++;
            else if (c === ')' || c === ']' || c === '}') depth--;
            if (depth !== 0) continue;
            if (c === ':' && text[i + 1] === '=') { isDecl = true; splitAt = i; splitLen = 2; break; }
            if (c === '=' && text[i - 1] !== '=' && text[i - 1] !== '!' && text[i - 1] !== '<' &&
                text[i - 1] !== '>' && text[i - 1] !== '+' && text[i - 1] !== '-' && text[i - 1] !== '*' &&
                text[i - 1] !== '/' && text[i - 1] !== '%' && text[i + 1] !== '=') {
                splitAt = i; splitLen = 1; break;
            }
        }
        if (splitAt === -1) return null;

        const lhs = text.substring(0, splitAt).trim();
        const rhs = text.substring(splitAt + splitLen).trim();
        const lhsParts = splitArgs(lhs);
        const rhsParts = splitArgs(rhs);
        if (lhsParts.length < 2) return null;

        // Evaluate all RHS first (snapshot of old values)
        const newVals = rhsParts.map(r => this._eval(r));

        const changed = [];
        for (let i = 0; i < lhsParts.length; i++) {
            const target = lhsParts[i].trim();
            const val = newVals[i % newVals.length];
            const arrM = target.match(/^(\w+)\[(.+)\]$/);
            if (arrM) {
                const arrName = arrM[1];
                const idxVal = this._eval(arrM[2]);
                const arr = this._getVar(arrName);
                if (Array.isArray(arr)) {
                    const newArr = [...arr];
                    newArr[idxVal] = val;
                    this._setVar(arrName, newArr);
                    if (!changed.includes(arrName)) changed.push(arrName);
                }
            } else if (isDecl) {
                this._vars[target] = val;
                changed.push(target);
            } else {
                this._setVar(target, val);
                if (!changed.includes(target)) changed.push(target);
            }
        }
        const desc = isDecl
            ? `${lhsParts.join(', ')} := ${rhsParts.join(', ')}`
            : `${lhsParts.join(', ')} = ${rhsParts.join(', ')}`;
        this._snapshot(line, desc, changed, isDecl ? 'var-init' : 'var-update');
        return { type: 'normal' };
    }

    // ── fmt.* ─────────────────────────────────────────────────────────

    _execGoPrint(text, line) {
        const m = text.match(/^fmt\.(Println|Printf|Print)\s*\(([\s\S]*)\)\s*;?\s*$/);
        if (!m) return;
        const variant = m[1];
        const argsStr = m[2];
        const args = argsStr.trim() ? splitArgs(argsStr) : [];
        const vals = args.map(a => this._eval(a));

        let out = '';
        if (variant === 'Println') {
            out = vals.map(v => this._toGoString(v)).join(' ') + '\n';
        } else if (variant === 'Print') {
            out = vals.map(v => this._toGoString(v)).join('');
        } else if (variant === 'Printf') {
            const fmt = vals[0];
            const fmtStr = typeof fmt === 'string' ? fmt : String(fmt ?? '');
            out = this._goFormat(fmtStr, vals.slice(1));
        }
        this.output += out;
        this._snapshot(line, `${variant}: ${out.replace(/\n/g, '↵').slice(0, 60)}`, [], 'print');
    }

    _toGoString(val) {
        if (val === null || val === undefined) return '<nil>';
        if (typeof val === 'boolean') return val ? 'true' : 'false';
        if (typeof val === 'string') return val;
        if (Array.isArray(val)) return `[${val.map(v => this._toGoString(v)).join(' ')}]`;
        return String(val);
    }

    _goFormat(fmt, vals) {
        let res = '', vi = 0, i = 0;
        while (i < fmt.length) {
            if (fmt[i] !== '%') { res += fmt[i++]; continue; }
            i++;
            while (i < fmt.length && '+-0 #'.includes(fmt[i])) i++;
            let width = '';
            while (i < fmt.length && /\d/.test(fmt[i])) width += fmt[i++];
            let prec = '';
            if (fmt[i] === '.') {
                i++;
                while (i < fmt.length && /\d/.test(fmt[i])) prec += fmt[i++];
            }
            const conv = fmt[i++];
            const v = vals[vi++];
            switch (conv) {
                case 'd':
                    res += String(Math.trunc(Number(v) || 0));
                    break;
                case 'f': case 'g':
                    res += (Number(v) || 0).toFixed(prec ? parseInt(prec) : 6);
                    break;
                case 's':
                    res += v === null || v === undefined ? '<nil>' : (typeof v === 'string' ? v : this._toGoString(v));
                    break;
                case 'v':
                    res += this._toGoString(v);
                    break;
                case 't':
                    res += v ? 'true' : 'false';
                    break;
                case 'c':
                    res += typeof v === 'number' ? String.fromCharCode(v) : String(v ?? '');
                    break;
                case 'x':
                    res += (Math.trunc(Number(v) || 0)).toString(16);
                    break;
                case 'X':
                    res += (Math.trunc(Number(v) || 0)).toString(16).toUpperCase();
                    break;
                case '%':
                    res += '%'; vi--; break;
                default:
                    res += '%' + conv;
            }
        }
        return res;
    }

    // ── Range-based for ───────────────────────────────────────────────

    _execGoRange(text, line, idx, all) {
        let varIdx = null, varVal = null, containerExpr = null;
        let m = text.match(/^for\s+(\w+)\s*,\s*(\w+)\s*:=\s*range\s+(.+?)\s*\{?\s*$/);
        if (m) {
            varIdx = m[1] === '_' ? null : m[1];
            varVal = m[2] === '_' ? null : m[2];
            containerExpr = m[3];
        } else {
            m = text.match(/^for\s+(\w+)\s*:=\s*range\s+(.+?)\s*\{?\s*$/);
            if (m) {
                varIdx = m[1] === '_' ? null : m[1];
                containerExpr = m[2];
            } else {
                m = text.match(/^for\s+range\s+(.+?)\s*\{?\s*$/);
                if (m) containerExpr = m[1];
            }
        }
        if (!containerExpr) return { type: 'normal' };

        const container = this._eval(containerExpr);
        let items = [];
        if (Array.isArray(container)) items = container;
        else if (typeof container === 'string') items = container.split('').map(c => c.charCodeAt(0));

        const { body, bodyEnd } = this._extractBlock(idx, all, text);

        let iteration = 0;
        for (let i = 0; i < items.length; i++) {
            iteration++;
            if (varIdx) this._vars[varIdx] = i;
            if (varVal) this._vars[varVal] = items[i];
            const desc = `range: ${varIdx ? `${varIdx}=${i}` : ''}${varIdx && varVal ? ', ' : ''}${varVal ? `${varVal}=${formatGoValue(items[i])}` : ''} (${iteration}/${items.length})`;
            this._snapshot(line, desc, [varIdx, varVal].filter(Boolean), 'loop-iteration', { iteration });
            const res = this._execBlock(body);
            if (res.type === 'return') return { ...res, next: bodyEnd + 1 };
            if (res.type === 'break') break;
        }
        if (varIdx) delete this._vars[varIdx];
        if (varVal) delete this._vars[varVal];
        this._snapshot(line, `range completed (${iteration} iterations)`, [], 'loop-end');
        return { type: 'normal', next: bodyEnd + 1 };
    }

    // ── Expression evaluation ─────────────────────────────────────────

    _eval(expr) {
        if (expr === undefined || expr === null) return null;
        expr = String(expr).trim();
        if (!expr) return null;

        // Backtick raw string
        if (expr.startsWith('`') && expr.endsWith('`') && expr.length >= 2) {
            return expr.slice(1, -1);
        }

        // Slice literal: []TYPE{vals}
        let m = expr.match(/^\[\]([\w\.]+)\s*\{([\s\S]*)\}\s*$/);
        if (m) {
            const inner = m[2].trim();
            if (!inner) return [];
            return splitArgs(inner).map(v => this._eval(v.trim()));
        }

        // make([]T, n)  /  make([]T, n, cap)
        m = expr.match(/^make\s*\(\s*\[\]([\w\.]+)\s*,\s*([^,)]+)(?:,\s*[^)]+)?\s*\)\s*$/);
        if (m) {
            const size = Number(this._eval(m[2])) || 0;
            return new Array(size).fill(0);
        }

        // len(x)
        m = expr.match(/^len\s*\(([\s\S]+)\)\s*$/);
        if (m) {
            const v = this._eval(m[1]);
            if (Array.isArray(v)) return v.length;
            if (typeof v === 'string') return v.length;
            return 0;
        }

        // cap(x)
        m = expr.match(/^cap\s*\(([\s\S]+)\)\s*$/);
        if (m) {
            const v = this._eval(m[1]);
            if (Array.isArray(v)) return v.length;
            return 0;
        }

        // append(slice, ...vals)
        m = expr.match(/^append\s*\(([\s\S]+)\)\s*$/);
        if (m) {
            const args = splitArgs(m[1]);
            const slice = this._eval(args[0]);
            const newSlice = Array.isArray(slice) ? [...slice] : [];
            for (let i = 1; i < args.length; i++) {
                const v = args[i].trim();
                // Variadic spread: append(s, more...)
                if (v.endsWith('...')) {
                    const expanded = this._eval(v.slice(0, -3));
                    if (Array.isArray(expanded)) newSlice.push(...expanded);
                } else {
                    newSlice.push(this._eval(v));
                }
            }
            return newSlice;
        }

        return super._eval(expr);
    }
}

// ── Public export ───────────────────────────────────────────────────────

export function executeGo(source) {
    try {
        const interp = new GoInterpreter(source);
        return interp.run();
    } catch (e) {
        return {
            steps: [],
            error: { message: e.message || 'Go execution error', line: 1 },
            output: '',
        };
    }
}
