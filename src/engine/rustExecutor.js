/**
 * Rust Subset Interpreter
 *
 * Built on CInterpreter — the surface syntax differs (`let mut`, `fn`, ranges,
 * `println!`) but the underlying semantics for sequential, statement-by-step
 * visualization map cleanly onto the C engine.
 *
 * Source preprocessing rewrites:
 *   - `fn main() { }` → `int main() { }`
 *   - `fn name(args) -> ret { }` → `ret name(c-style-args) { }`
 *   - `let mut x = val` / `let x = val` → `auto x = val;`
 *   - `let x: TYPE = val` → `TYPE x = val;`
 *   - `let arr = vec![1,2,3]` / `let arr = [1,2,3]` → `int arr[] = {1,2,3};`
 *   - `if cond {` → `if (cond) {`
 *
 * Handled in `_execStmt` (Rust syntax preserved):
 *   - `for x in 0..n { }` and `0..=n` (inclusive) ranges
 *   - `for x in &arr { }`, `for x in arr.iter() { }`
 *   - `for (i, x) in arr.iter().enumerate() { }`
 *   - `println!`, `print!` macros
 *   - `arr.len()`, `arr.iter().sum()`, `arr.sort()` etc. via `_eval` / method dispatch
 */

import { CInterpreter, deepClone, splitArgs } from './cExecutor.js';

// ── Rust-flavored display helpers ──────────────────────────────────────

function getRustType(val) {
    if (val === null || val === undefined) return '()';
    if (typeof val === 'boolean') return 'bool';
    if (typeof val === 'string') return val.length === 1 ? 'char' : '&str';
    if (typeof val === 'number') return Number.isInteger(val) ? 'i32' : 'f64';
    if (Array.isArray(val)) return 'Vec';
    return typeof val;
}

function formatRustValue(val) {
    if (val === null || val === undefined) return '()';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'string') return `"${val}"`;
    if (Array.isArray(val)) return `[${val.map(formatRustValue).join(', ')}]`;
    if (typeof val === 'number') return String(val);
    return String(val);
}

function unescapeRustString(s) {
    return s
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .replace(/\\\\/g, '\\')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'");
}

// ── Source preprocessor ────────────────────────────────────────────────

function transformRustLine(line) {
    const indentMatch = line.match(/^\s*/);
    const indent = indentMatch ? indentMatch[0] : '';
    const stripped = line.trim();

    if (!stripped || stripped.startsWith('//')) return line;

    // use std::...; / extern crate / mod / pub / etc. — strip
    if (/^use\s+/.test(stripped)) return '';
    if (/^extern\s+crate\b/.test(stripped)) return '';
    if (/^mod\s+/.test(stripped)) return '';
    if (/^#\[/.test(stripped)) return ''; // attribute macros

    // fn main() { ... }  →  int main() { ... }
    // fn name(args) -> ret { ... }  →  ret name(c-args) { ... }
    let m = stripped.match(/^(?:pub\s+)?fn\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*([^{]+?)\s*)?(\{?)\s*$/);
    if (m) {
        const name = m[1];
        const paramsStr = m[2].trim();
        const ret = m[3] ? m[3].trim() : 'void';
        const open = m[4] || '';

        // Convert Rust params: `name: type` → `type name`
        let cParams = '';
        if (paramsStr) {
            const parts = splitArgs(paramsStr).map(p => {
                const colonIdx = p.indexOf(':');
                if (colonIdx === -1) return `int ${p.trim()}`;
                const pname = p.substring(0, colonIdx).replace(/^mut\s+/, '').trim();
                let ptype = p.substring(colonIdx + 1).trim();
                ptype = ptype.replace(/^&\s*/, '').replace(/^mut\s+/, '');
                return `${rustTypeToC(ptype)} ${pname}`;
            });
            cParams = parts.join(', ');
        }

        const cRet = ret === 'void' ? 'int' : rustTypeToC(ret);
        return `${indent}${cRet} ${name}(${cParams}) ${open}`;
    }

    // if cond {  →  if (cond) {
    m = stripped.match(/^if\s+(.+?)\s*\{\s*$/);
    if (m && !m[1].startsWith('(') && !/\blet\b/.test(m[1])) {
        return `${indent}if (${m[1]}) {`;
    }
    m = stripped.match(/^\}\s*else\s+if\s+(.+?)\s*\{\s*$/);
    if (m && !m[1].startsWith('(')) {
        return `${indent}} else if (${m[1]}) {`;
    }
    m = stripped.match(/^else\s+if\s+(.+?)\s*\{\s*$/);
    if (m && !m[1].startsWith('(')) {
        return `${indent}else if (${m[1]}) {`;
    }

    // while cond {  →  while (cond) {  (Rust drops the parens too)
    m = stripped.match(/^while\s+(.+?)\s*\{\s*$/);
    if (m && !m[1].startsWith('(')) {
        return `${indent}while (${m[1]}) {`;
    }

    // loop {  →  while (true) {
    m = stripped.match(/^loop\s*(\{?)\s*$/);
    if (m) {
        const open = m[1] || '{';
        return `${indent}while (true) ${open}`;
    }

    // ── Variable declarations ──────────────────────────────────────
    // let arr = vec![1,2,3];   →  int arr[] = {1,2,3};
    // let mut arr = vec![1,2,3];
    m = stripped.match(/^let\s+(?:mut\s+)?(\w+)\s*(?::\s*[^=]+)?\s*=\s*vec!\s*\[(.*)\]\s*;?\s*$/);
    if (m) return `${indent}int ${m[1]}[] = {${m[2]}};`;

    // let arr = [1,2,3];   →  int arr[] = {1,2,3};
    // let arr = [val; n];  →  int arr[n];
    m = stripped.match(/^let\s+(?:mut\s+)?(\w+)\s*(?::\s*[^=]+)?\s*=\s*\[(.+?)\]\s*;?\s*$/);
    if (m) {
        const inner = m[2];
        const repeat = inner.match(/^(.+?)\s*;\s*(.+)$/);
        if (repeat) {
            return `${indent}int ${m[1]}[${repeat[2]}];`;
        }
        return `${indent}int ${m[1]}[] = {${inner}};`;
    }

    // let x: TYPE = val;  →  TYPE x = val;
    m = stripped.match(/^let\s+(?:mut\s+)?(\w+)\s*:\s*([^=]+?)\s*=\s*(.+?)\s*;?\s*$/);
    if (m) {
        const ctype = rustTypeToC(m[2].trim());
        return `${indent}${ctype} ${m[1]} = ${m[3]};`;
    }

    // let mut x = val;  /  let x = val;
    m = stripped.match(/^let\s+(?:mut\s+)?(\w+)\s*=\s*(.+?)\s*;?\s*$/);
    if (m) return `${indent}auto ${m[1]} = ${m[2]};`;

    // let x: TYPE;  (uninitialized)
    m = stripped.match(/^let\s+(?:mut\s+)?(\w+)\s*:\s*([^=]+?)\s*;?\s*$/);
    if (m) return `${indent}${rustTypeToC(m[2].trim())} ${m[1]};`;

    // let mut x;
    m = stripped.match(/^let\s+(?:mut\s+)?(\w+)\s*;?\s*$/);
    if (m) return `${indent}int ${m[1]};`;

    return line;
}

function rustTypeToC(t) {
    t = t.trim().replace(/^&\s*/, '').replace(/^mut\s+/, '');
    if (/^Vec\s*<.*>$/.test(t)) return 'int'; // best-effort
    if (/^\[.*\]$/.test(t)) return 'int';
    if (t === 'String' || t === 'str' || t === '&str') return 'string';
    if (/^[iu](8|16|32|64|128|size)$/.test(t)) return 'int';
    if (t === 'f32' || t === 'f64') return 'double';
    if (t === 'bool') return 'bool';
    if (t === 'char') return 'char';
    if (t === '()') return 'void';
    return 'auto';
}

function preprocessRustSource(source) {
    return source.split('\n').map(transformRustLine).join('\n');
}

// ── RustInterpreter ────────────────────────────────────────────────────

class RustInterpreter extends CInterpreter {
    constructor(source) {
        const preprocessed = preprocessRustSource(source);
        super(preprocessed);
    }

    _snapshot(line, description, changedVars = [], flowType = null, flowDetail = null) {
        this.stepCount++;
        if (this.stepCount > 5000) throw new Error('Maximum execution steps exceeded (possible infinite loop)');

        const allVars = this._allDisplayVars();
        const snap = {};
        for (const [k, v] of Object.entries(allVars)) {
            snap[k] = { value: deepClone(v), display: formatRustValue(v), type: getRustType(v) };
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
                    values: info.value.map(v => ({ value: v, display: formatRustValue(v) })),
                })),
        });
    }

    _isTypeKeyword(word) {
        return super._isTypeKeyword(word) ||
            /^(?:i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize|f32|f64|str|String)$/.test(word);
    }

    // ── Statement dispatch ────────────────────────────────────────────

    _execStmt({ text, line }, idx, all) {
        if (!text || text === '{' || text === '}' || text.startsWith('//')) {
            return { type: 'normal' };
        }

        // println! / print! / eprintln! / eprint!
        if (/^(?:e?println!|e?print!)\s*\(/.test(text)) {
            this._execRustPrint(text, line);
            return { type: 'normal' };
        }

        // for x in ITER { ... }
        if (/^for\s+/.test(text) && /\bin\b/.test(text)) {
            return this._execRustFor(text, line, idx, all);
        }

        return super._execStmt({ text, line }, idx, all);
    }

    // ── println!/print! ───────────────────────────────────────────────

    _execRustPrint(text, line) {
        const m = text.match(/^(e?println!|e?print!)\s*\(([\s\S]*)\)\s*;?\s*$/);
        if (!m) return;
        const variant = m[1];
        const argsStr = m[2];
        const args = argsStr.trim() ? splitArgs(argsStr) : [];
        if (args.length === 0) {
            const out = variant.endsWith('println!') ? '\n' : '';
            this.output += out;
            this._snapshot(line, `${variant}`, [], 'print');
            return;
        }
        const fmt = this._eval(args[0]);
        const fmtStr = typeof fmt === 'string' ? fmt : String(fmt ?? '');
        const vals = args.slice(1).map(a => this._eval(a));
        let out = this._rustFormat(fmtStr, vals);
        if (variant.endsWith('println!')) out += '\n';
        this.output += out;
        this._snapshot(line, `${variant}: ${out.replace(/\n/g, '↵').slice(0, 60)}`, [], 'print');
    }

    _toRustString(val) {
        if (val === null || val === undefined) return '()';
        if (typeof val === 'boolean') return val ? 'true' : 'false';
        if (typeof val === 'string') return val;
        if (Array.isArray(val)) return `[${val.map(v => this._toRustString(v)).join(', ')}]`;
        return String(val);
    }

    _toRustDebug(val) {
        if (val === null || val === undefined) return '()';
        if (typeof val === 'boolean') return val ? 'true' : 'false';
        if (typeof val === 'string') return `"${val}"`;
        if (Array.isArray(val)) return `[${val.map(v => this._toRustDebug(v)).join(', ')}]`;
        return String(val);
    }

    // Rust format strings: {} = Display, {:?} = Debug, {:width.prec} etc.
    _rustFormat(fmt, vals) {
        let res = '', vi = 0, i = 0;
        while (i < fmt.length) {
            if (fmt[i] === '{' && fmt[i + 1] === '{') { res += '{'; i += 2; continue; }
            if (fmt[i] === '}' && fmt[i + 1] === '}') { res += '}'; i += 2; continue; }
            if (fmt[i] !== '{') { res += fmt[i++]; continue; }
            // Parse `{...}` placeholder
            const close = fmt.indexOf('}', i);
            if (close === -1) { res += fmt[i++]; continue; }
            const spec = fmt.substring(i + 1, close);
            i = close + 1;
            // Spec: [name][:format] — we ignore named args for simplicity
            let isDebug = false, isHex = false, isOct = false, isBin = false;
            const colonIdx = spec.indexOf(':');
            if (colonIdx !== -1) {
                const fmtPart = spec.substring(colonIdx + 1);
                if (fmtPart.includes('?')) isDebug = true;
                else if (fmtPart.endsWith('x')) isHex = true;
                else if (fmtPart.endsWith('o')) isOct = true;
                else if (fmtPart.endsWith('b')) isBin = true;
            }
            const v = vals[vi++];
            if (isDebug) res += this._toRustDebug(v);
            else if (isHex) res += (Math.trunc(Number(v) || 0)).toString(16);
            else if (isOct) res += (Math.trunc(Number(v) || 0)).toString(8);
            else if (isBin) res += (Math.trunc(Number(v) || 0)).toString(2);
            else res += this._toRustString(v);
        }
        return res;
    }

    // ── for x in ITER ────────────────────────────────────────────────

    _execRustFor(text, line, idx, all) {
        // Extract the `for ... in ...` header up to the body brace.
        let m = text.match(/^for\s+(.+?)\s+in\s+(.+?)\s*\{\s*$/);
        if (!m) return super._execStmt({ text, line }, idx, all);

        let pattern = m[1].trim();
        const iterExpr = m[2].trim();

        // Pattern variants:
        //   x         (single var)
        //   (i, x)    (tuple destructure for enumerate)
        //   _         (discard)
        let varIdx = null, varVal = null;
        const tupleM = pattern.match(/^\(\s*(\w+)\s*,\s*(\w+)\s*\)$/);
        if (tupleM) {
            varIdx = tupleM[1] === '_' ? null : tupleM[1];
            varVal = tupleM[2] === '_' ? null : tupleM[2];
        } else {
            varVal = pattern === '_' ? null : pattern;
        }

        // Iterator forms:
        //   start..end           → exclusive range
        //   start..=end          → inclusive range
        //   &arr  /  arr.iter()  → values
        //   arr.iter().enumerate() → (index, value)
        //   arr                  → values (consuming iter)
        let items = null;
        let isEnumerate = /\.iter\s*\(\s*\)\s*\.\s*enumerate\s*\(\s*\)\s*$/.test(iterExpr);
        const cleanedIter = iterExpr
            .replace(/\.iter\s*\(\s*\)\s*\.\s*enumerate\s*\(\s*\)\s*$/, '')
            .replace(/\.iter\s*\(\s*\)\s*$/, '')
            .replace(/\.into_iter\s*\(\s*\)\s*$/, '')
            .replace(/^&\s*/, '')
            .trim();

        const inclusiveM = cleanedIter.match(/^(.+?)\s*\.\.=\s*(.+)$/);
        const exclusiveM = !inclusiveM ? cleanedIter.match(/^(.+?)\s*\.\.\s*(.+)$/) : null;

        if (inclusiveM) {
            const lo = Number(this._eval(inclusiveM[1])) || 0;
            const hi = Number(this._eval(inclusiveM[2])) || 0;
            items = [];
            for (let v = lo; v <= hi; v++) items.push(v);
        } else if (exclusiveM) {
            const lo = Number(this._eval(exclusiveM[1])) || 0;
            const hi = Number(this._eval(exclusiveM[2])) || 0;
            items = [];
            for (let v = lo; v < hi; v++) items.push(v);
        } else {
            const v = this._eval(cleanedIter);
            if (Array.isArray(v)) items = v;
            else if (typeof v === 'string') items = v.split('').map(c => c.charCodeAt(0));
            else items = [];
        }

        const { body, bodyEnd } = this._extractBlock(idx, all, text);

        let iteration = 0;
        for (let i = 0; i < items.length; i++) {
            iteration++;
            if (isEnumerate && varIdx) this._vars[varIdx] = i;
            else if (isEnumerate && varVal === null) {/* both _ */}
            if (varVal) this._vars[varVal] = items[i];
            else if (!isEnumerate && varIdx) this._vars[varIdx] = items[i];

            const desc = isEnumerate
                ? `for (i=${i}, val=${formatRustValue(items[i])}) — iter ${iteration}/${items.length}`
                : `for ${varVal || varIdx || '_'} = ${formatRustValue(items[i])} — iter ${iteration}/${items.length}`;
            const changedNames = [];
            if (isEnumerate && varIdx) changedNames.push(varIdx);
            if (varVal) changedNames.push(varVal);
            if (!isEnumerate && !varVal && varIdx) changedNames.push(varIdx);
            this._snapshot(line, desc, changedNames, 'loop-iteration', { iteration });
            const res = this._execBlock(body);
            if (res.type === 'return') return { ...res, next: bodyEnd + 1 };
            if (res.type === 'break') break;
        }
        if (varIdx) delete this._vars[varIdx];
        if (varVal) delete this._vars[varVal];
        this._snapshot(line, `for completed (${iteration} iterations)`, [], 'loop-end');
        return { type: 'normal', next: bodyEnd + 1 };
    }

    // ── Expression evaluation ─────────────────────────────────────────

    _eval(expr) {
        if (expr === undefined || expr === null) return null;
        expr = String(expr).trim();
        if (!expr) return null;

        // String literal with Rust escapes
        if (expr.startsWith('"') && expr.endsWith('"') && this._isCompleteRustString(expr)) {
            return unescapeRustString(expr.slice(1, -1));
        }

        // Char literal: 'a' / '\n'
        if (/^'.'$/.test(expr)) return expr.charCodeAt(1);
        if (/^'\\.'$/.test(expr)) {
            switch (expr[2]) {
                case 'n': return 10; case 't': return 9; case 'r': return 13;
                case '0': return 0; case '\\': return 92; case "'": return 39;
            }
        }

        // vec![1,2,3]
        let m = expr.match(/^vec!\s*\[([\s\S]*)\]\s*$/);
        if (m) {
            const inner = m[1].trim();
            if (!inner) return [];
            const repeat = inner.match(/^(.+?)\s*;\s*(.+)$/);
            if (repeat) {
                const v = this._eval(repeat[1]);
                const n = Number(this._eval(repeat[2])) || 0;
                return new Array(n).fill(v);
            }
            return splitArgs(inner).map(v => this._eval(v.trim()));
        }

        // Array literal [1,2,3]  (only when whole expr is a balanced `[...]`)
        if (expr.startsWith('[') && expr.endsWith(']') && this._isBalanced(expr, '[', ']')) {
            const inner = expr.slice(1, -1).trim();
            if (!inner) return [];
            const repeat = inner.match(/^(.+?)\s*;\s*(.+)$/);
            if (repeat) {
                const v = this._eval(repeat[1]);
                const n = Number(this._eval(repeat[2])) || 0;
                return new Array(n).fill(v);
            }
            return splitArgs(inner).map(v => this._eval(v.trim()));
        }

        // `expr as TYPE`  — strip cast
        m = expr.match(/^(.+?)\s+as\s+([\w]+)\s*$/);
        if (m) {
            const v = this._eval(m[1]);
            const t = m[2];
            if (/^[iu](8|16|32|64|128|size)$/.test(t)) return Math.trunc(Number(v) || 0);
            if (t === 'f32' || t === 'f64') return Number(v) || 0;
            if (t === 'char' && typeof v === 'number') return v;
            if (t === 'bool') return !!v;
            return v;
        }

        // Method calls: arr.method(args)
        m = expr.match(/^(\w+)\.(\w+)\s*\(([\s\S]*)\)\s*$/);
        if (m) {
            const objName = m[1], method = m[2], argsStr = m[3];
            const obj = this._getVar(objName);
            const args = argsStr.trim() ? splitArgs(argsStr).map(a => this._eval(a.trim())) : [];

            if (Array.isArray(obj)) {
                switch (method) {
                    case 'len': return obj.length;
                    case 'is_empty': return obj.length === 0;
                    case 'first': return obj[0];
                    case 'last': return obj[obj.length - 1];
                    case 'iter': case 'into_iter': return obj;
                    case 'sum': return obj.reduce((a, b) => Number(a) + Number(b), 0);
                    case 'min': return obj.length ? Math.min(...obj.map(Number)) : null;
                    case 'max': return obj.length ? Math.max(...obj.map(Number)) : null;
                    case 'sort': {
                        const sorted = [...obj].sort((a, b) => Number(a) - Number(b));
                        this._setVar(objName, sorted);
                        return undefined;
                    }
                    case 'reverse': {
                        this._setVar(objName, [...obj].reverse());
                        return undefined;
                    }
                    case 'push': {
                        this._setVar(objName, [...obj, args[0]]);
                        return undefined;
                    }
                    case 'pop': {
                        const newArr = [...obj];
                        const last = newArr.pop();
                        this._setVar(objName, newArr);
                        return last;
                    }
                    case 'contains': return obj.includes(args[0]);
                    case 'clone': return [...obj];
                    case 'to_vec': return [...obj];
                    case 'get': return obj[Number(args[0]) || 0];
                }
            }

            if (typeof obj === 'string') {
                switch (method) {
                    case 'len': return obj.length;
                    case 'is_empty': return obj.length === 0;
                    case 'to_string': case 'to_owned': case 'clone': return obj;
                    case 'to_uppercase': return obj.toUpperCase();
                    case 'to_lowercase': return obj.toLowerCase();
                    case 'trim': return obj.trim();
                    case 'starts_with': return obj.startsWith(String(args[0] ?? ''));
                    case 'ends_with': return obj.endsWith(String(args[0] ?? ''));
                    case 'contains': return obj.includes(String(args[0] ?? ''));
                    case 'replace': return obj.split(String(args[0] ?? '')).join(String(args[1] ?? ''));
                    case 'chars': return obj.split('').map(c => c.charCodeAt(0));
                    case 'split': return obj.split(String(args[0] ?? ''));
                    case 'parse': return parseFloat(obj) || parseInt(obj, 10) || 0;
                }
            }
        }

        // Free-function patterns
        m = expr.match(/^Vec::new\s*\(\s*\)\s*$/);
        if (m) return [];
        m = expr.match(/^Vec::with_capacity\s*\(\s*[^)]+\)\s*$/);
        if (m) return [];
        m = expr.match(/^String::new\s*\(\s*\)\s*$/);
        if (m) return '';
        m = expr.match(/^String::from\s*\(\s*([\s\S]+?)\s*\)\s*$/);
        if (m) return String(this._eval(m[1]) ?? '');

        return super._eval(expr);
    }

    _isCompleteRustString(expr) {
        if (!expr.startsWith('"') || !expr.endsWith('"')) return false;
        let inStr = false, strCh = '';
        for (let i = 0; i < expr.length; i++) {
            const c = expr[i];
            if (!inStr && c === '"') { inStr = true; strCh = c; continue; }
            if (inStr && c === strCh && expr[i - 1] !== '\\') {
                inStr = false;
                if (i !== expr.length - 1) return false;
            }
        }
        return !inStr;
    }

    _isBalanced(expr, open, close) {
        let depth = 0, inStr = false, strCh = '';
        for (let i = 0; i < expr.length; i++) {
            const c = expr[i];
            if (!inStr && (c === '"' || c === "'")) { inStr = true; strCh = c; continue; }
            if (inStr && c === strCh && expr[i - 1] !== '\\') { inStr = false; continue; }
            if (inStr) continue;
            if (c === open) depth++;
            else if (c === close) { depth--; if (depth === 0 && i !== expr.length - 1) return false; }
        }
        return depth === 0;
    }
}

// ── Public export ───────────────────────────────────────────────────────

export function executeRust(source) {
    try {
        const interp = new RustInterpreter(source);
        return interp.run();
    } catch (e) {
        return {
            steps: [],
            error: { message: e.message || 'Rust execution error', line: 1 },
            output: '',
        };
    }
}
