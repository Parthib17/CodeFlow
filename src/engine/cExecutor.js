/**
 * C Subset Interpreter
 * Supports: int/float/double/char/bool/long/short, arrays, pointers (basic),
 *           if/else, for/while/do-while, switch, printf/puts, user functions,
 *           stdlib math/string builtins, recursion.
 *
 * Produces a step-by-step snapshot at every executed statement — same shape
 * as the Python and JavaScript executors so all visualization panels work.
 */

const MAX_STEPS = 5000;
const MAX_CALL_DEPTH = 40;

// ── Helpers ──────────────────────────────────────────────────────────────

export function deepClone(val) {
    if (Array.isArray(val)) return val.map(deepClone);
    if (val !== null && typeof val === 'object') {
        const out = {};
        for (const k in val) out[k] = deepClone(val[k]);
        return out;
    }
    return val;
}

export function formatValue(val) {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'boolean') return val ? '1' : '0';
    if (typeof val === 'string') {
        if (val.length === 1) return `'${val}'`;
        return `"${val}"`;
    }
    if (Array.isArray(val)) return `[${val.map(formatValue).join(', ')}]`;
    if (typeof val === 'number') {
        if (Number.isInteger(val)) return String(val);
        const s = val.toFixed(6).replace(/\.?0+$/, '');
        return s || '0';
    }
    if (typeof val === 'object') {
        const pairs = Object.entries(val).map(([k, v]) => `${k}: ${formatValue(v)}`);
        return `{${pairs.join(', ')}}`;
    }
    return String(val);
}

export function getType(val) {
    if (val === null || val === undefined) return 'void*';
    if (typeof val === 'boolean') return 'bool';
    if (typeof val === 'string') return val.length === 1 ? 'char' : 'char*';
    if (typeof val === 'number') return Number.isInteger(val) ? 'int' : 'double';
    if (Array.isArray(val)) return 'array';
    if (typeof val === 'object') return 'struct';
    return typeof val;
}

// Split args respecting nesting and string literals
export function splitArgs(str) {
    const args = [];
    let depth = 0, cur = '', inStr = false, strCh = '';
    for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strCh = ch; cur += ch; continue; }
        if (inStr && ch === strCh && str[i - 1] !== '\\') { inStr = false; cur += ch; continue; }
        if (inStr) { cur += ch; continue; }
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        if (ch === ')' || ch === ']' || ch === '}') depth--;
        if (ch === ',' && depth === 0) { args.push(cur.trim()); cur = ''; }
        else cur += ch;
    }
    if (cur.trim()) args.push(cur.trim());
    return args;
}

// ── C Interpreter Class (exported so C++ can extend it) ──────────────────

export class CInterpreter {
    constructor(source) {
        this.steps = [];
        this.output = '';
        this.stepCount = 0;
        this.callStack = [];     // [{ vars:{}, funcName:string }]
        this.functions = {};     // { name: { params, body, headerLine, returnType } }
        this.defines = {};       // { name: resolvedValue }
        this.prevSnapshot = {};  // for change detection

        this._parse(source);
    }

    // ── Source preprocessing ──────────────────────────────────────────

    _stripComments(src) {
        // Remove block comments (preserve line count)
        src = src.replace(/\/\*[\s\S]*?\*\//g, m => m.split('\n').map((_, i) => i === 0 ? '' : '').join('\n'));
        // Remove line comments
        src = src.replace(/\/\/[^\n]*/g, '');
        return src;
    }

    _parse(rawSource) {
        const source = this._stripComments(rawSource);
        const rawLines = source.split('\n');

        // Collect #define macros
        for (const ln of rawLines) {
            const m = ln.trim().match(/^#define\s+(\w+)\s+(.+)$/);
            if (m) this.defines[m[1]] = m[2].trim();
        }

        // Build line objects, expanding `} else …` → two virtual lines so the
        // brace-counting body extractor handles them as separate units. Both
        // virtual lines keep the same original source line number so the
        // visualizer still maps correctly.
        const lineObjs = [];
        for (let i = 0; i < rawLines.length; i++) {
            const trimmed = rawLines[i].trim();
            // `} else …` (with arbitrary tail like `if (...) {` or `{` or empty)
            const m = trimmed.match(/^\}\s*(else\b[\s\S]*)$/);
            if (m) {
                lineObjs.push({ text: '}', line: i });
                lineObjs.push({ text: m[1].trim(), line: i });
            } else {
                lineObjs.push({ text: trimmed, line: i });
            }
        }

        // Extract function definitions
        this._extractFunctions(lineObjs);
    }

    _extractFunctions(lineObjs) {
        // Matches: [qualifiers] returnType funcName(params) {
        const funcRe = /^(?:(?:static|inline|extern|const)\s+)*(\w[\w\s*]*?)\s+(\w+)\s*\(([^)]*)\)\s*\{?\s*$/;
        const skipWords = new Set(['if', 'else', 'for', 'while', 'do', 'switch', 'return', 'struct', 'typedef', 'class']);

        let i = 0;
        while (i < lineObjs.length) {
            const { text, line } = lineObjs[i];
            if (!text || text.startsWith('#') || text.startsWith('//') || text.startsWith('*') || text.startsWith('using') || text.startsWith('struct') || text.startsWith('typedef')) {
                i++; continue;
            }

            const m = text.match(funcRe);
            if (m && !skipWords.has(m[2])) {
                const returnType = m[1].trim();
                const funcName = m[2];
                const paramsStr = m[3].trim();

                const params = this._parseParams(paramsStr);

                // Find body
                let j = i + 1;
                let braces = text.endsWith('{') ? 1 : 0;
                if (braces === 0 && j < lineObjs.length && lineObjs[j].text === '{') {
                    braces = 1; j++;
                }
                if (braces === 0) { i++; continue; } // forward declaration

                const body = [];
                while (j < lineObjs.length && braces > 0) {
                    const t = lineObjs[j].text;
                    for (const ch of t) {
                        if (ch === '{') braces++;
                        if (ch === '}') braces--;
                    }
                    if (braces > 0) body.push(lineObjs[j]);
                    j++;
                }

                this.functions[funcName] = { returnType, params, body, headerLine: line };
                i = j;
                continue;
            }
            i++;
        }
    }

    _parseParams(str) {
        if (!str || str === 'void' || str === '') return [];
        return splitArgs(str).map(p => {
            p = p.trim();
            // "int arr[]" or "int *ptr" or "int n"
            const m = p.match(/^([\w\s*]+?)\s*(\*?\s*\w+)(?:\[\].*)?$/);
            return m ? { type: m[1].trim(), name: m[2].replace(/\*/g, '').trim() } : { type: 'int', name: p.trim() };
        });
    }

    // ── Variable access ──────────────────────────────────────────────

    get _frame() { return this.callStack[this.callStack.length - 1]; }
    get _vars() { return this._frame.vars; }

    _getVar(name) {
        for (let i = this.callStack.length - 1; i >= 0; i--) {
            if (name in this.callStack[i].vars) return this.callStack[i].vars[name];
        }
        if (name in this.defines) {
            try { return this._eval(this.defines[name]); } catch { return this.defines[name]; }
        }
        return undefined;
    }

    _setVar(name, value) {
        for (let i = this.callStack.length - 1; i >= 0; i--) {
            if (name in this.callStack[i].vars) {
                this.callStack[i].vars[name] = value;
                return;
            }
        }
        this._vars[name] = value;
    }

    _allDisplayVars() {
        const out = {};
        for (const frame of this.callStack) Object.assign(out, frame.vars);
        return out;
    }

    // ── Snapshot ──────────────────────────────────────────────────────

    _snapshot(line, description, changedVars = [], flowType = null, flowDetail = null) {
        this.stepCount++;
        if (this.stepCount > MAX_STEPS) throw new Error('Maximum execution steps exceeded (possible infinite loop)');

        const allVars = this._allDisplayVars();
        const snap = {};
        for (const [k, v] of Object.entries(allVars)) {
            snap[k] = { value: deepClone(v), display: formatValue(v), type: getType(v) };
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
                    values: info.value.map(v => ({ value: v, display: formatValue(v) })),
                })),
        });
    }

    // ── Block / Statement execution ───────────────────────────────────

    _execBlock(lines) {
        let i = 0;
        while (i < lines.length) {
            if (this.stepCount > MAX_STEPS) throw new Error('Maximum execution steps exceeded');
            const res = this._execStmt(lines[i], i, lines);
            if (res.type !== 'normal') return res;
            i = res.next !== undefined ? res.next : i + 1;
        }
        return { type: 'normal' };
    }

    _execStmt({ text, line }, idx, all) {
        // Empty / brace-only / preprocessor
        if (!text || text === '{' || text === '}' || text.startsWith('#')) return { type: 'normal' };

        // Multiple statements on one line (split by ';' not inside parens/brackets/strings/braces)
        const stmts = this._splitStatements(text);
        if (stmts.length > 1) {
            for (const s of stmts) {
                const res = this._execStmt({ text: s, line }, 0, []);
                if (res.type !== 'normal') return { ...res, next: idx + 1 };
            }
            return { type: 'normal' };
        }

        // return
        if (/^return\b/.test(text)) {
            const m = text.match(/^return\s*(.*?);?\s*$/);
            const val = m && m[1] ? this._eval(m[1]) : undefined;
            this._snapshot(line, `return ${m && m[1] ? formatValue(val) : ''}`, [], 'return');
            return { type: 'return', value: val };
        }

        // break / continue
        if (/^break\s*;?$/.test(text)) {
            this._snapshot(line, 'break', [], 'break');
            return { type: 'break' };
        }
        if (/^continue\s*;?$/.test(text)) {
            this._snapshot(line, 'continue', [], 'continue');
            return { type: 'continue' };
        }

        // printf / puts / putchar
        if (/^printf\s*\(|^puts\s*\(|^putchar\s*\(/.test(text)) {
            this._execPrintf(text, line);
            return { type: 'normal' };
        }

        // scanf — skip input
        if (/^scanf\s*\(|^gets\s*\(|^fgets\s*\(/.test(text)) {
            this._snapshot(line, 'scanf (input skipped in visualizer)', [], 'print');
            return { type: 'normal' };
        }

        // if / else if  (else-if must dispatch to _execIf so its branch
        // is treated like its own if statement; otherwise the bare-else
        // matcher below would skip the condition check entirely)
        if (/^(?:else\s+)?if\s*\(/.test(text)) return this._execIf(text, line, idx, all);

        // else (bare)
        if (/^else\b/.test(text)) return { type: 'normal', next: idx + 1 };

        // for
        if (/^for\s*\(/.test(text)) return this._execFor(text, line, idx, all);

        // while
        if (/^while\s*\(/.test(text)) return this._execWhile(text, line, idx, all);

        // do
        if (/^do\s*\{?$/.test(text) || text === 'do') return this._execDoWhile(text, line, idx, all);

        // switch
        if (/^switch\s*\(/.test(text)) return this._execSwitch(text, line, idx, all);

        // Array declaration with initializer: int arr[] = {1,2,3}; or int arr[5] = {1,2,3};
        if (this._isTypeKeyword(text.split(/\s+/)[0]) && /\[\s*\d*\s*\]\s*=\s*\{/.test(text)) {
            return this._execArrayDecl(text, line);
        }

        // Variable declaration
        if (this._isTypeDecl(text)) return this._execVarDecl(text, line);

        // Standalone i++ / i-- / ++i / --i
        const incDec = text.match(/^(\w+)\s*(\+\+|--)\s*;?$|^(\+\+|--)\s*(\w+)\s*;?$/);
        if (incDec) {
            const name = incDec[1] || incDec[4];
            const op = incDec[2] || incDec[3];
            const old = this._getVar(name);
            const nv = op === '++' ? (old || 0) + 1 : (old || 0) - 1;
            this._setVar(name, nv);
            this._snapshot(line, `${name}: ${old} → ${nv}`, [name], 'var-update');
            return { type: 'normal' };
        }

        // Assignment / compound assignment
        const assign = this._matchAssignment(text);
        if (assign) return this._execAssign(assign, line);

        // Standalone function call
        if (/^\w[\w.>*]*\s*\(/.test(text)) {
            this._evalCall(text.replace(/;$/, '').trim(), line);
            return { type: 'normal' };
        }

        return { type: 'normal' };
    }

    _splitStatements(text) {
        // Split "int a = 1; int b = 2;" into ["int a = 1", "int b = 2"]
        // Don't split inside for(...;...;...) or string literals
        const stmts = [];
        let depth = 0, inStr = false, strCh = '', cur = '';
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strCh = ch; cur += ch; continue; }
            if (inStr && ch === strCh && text[i - 1] !== '\\') { inStr = false; cur += ch; continue; }
            if (inStr) { cur += ch; continue; }
            if (ch === '(' || ch === '[' || ch === '{') depth++;
            if (ch === ')' || ch === ']' || ch === '}') depth--;
            if (ch === ';' && depth === 0) {
                const s = cur.trim();
                if (s) stmts.push(s);
                cur = '';
            } else {
                cur += ch;
            }
        }
        const s = cur.trim();
        if (s) stmts.push(s);
        return stmts.length > 0 ? stmts : [text];
    }

    _isTypeKeyword(word) {
        return /^(?:int|float|double|long|short|char|bool|unsigned|signed|const|void|auto|size_t|uint\d*_t|int\d*_t|string)$/.test(word);
    }

    _isTypeDecl(text) {
        // Starts with a type keyword, followed by an identifier
        return /^(?:const\s+|unsigned\s+|signed\s+)?(?:int|float|double|long|short|char|bool|string|auto|size_t|uint\d*_t|int\d*_t|void)\s*\*?\s*\w/.test(text) &&
            !/^(?:if|for|while|switch|else|return|break|continue)\b/.test(text);
    }

    // ── Variable declaration handling ──────────────────────────────────

    _execVarDecl(text, line) {
        text = text.replace(/;$/, '').trim();

        // Extract type prefix (greedy match for "unsigned long" etc.)
        const typeM = text.match(/^((?:const\s+|unsigned\s+|signed\s+|long\s+|short\s+)?(?:int|float|double|long|short|char|bool|string|auto|size_t|uint\d*_t|int\d*_t|void)\s*\*?)\s*/);
        if (!typeM) return { type: 'normal' };

        const cType = typeM[1].trim().replace(/\s+/g, ' ');
        const rest = text.slice(typeM[0].length);
        const declarations = splitArgs(rest);
        const changed = [];

        for (const decl of declarations) {
            // Array: name[size] = {vals} or name[size] = <expr> (e.g. new int[n])
            // or name[size] (uninitialized) or name[]
            const arrM = decl.match(/^(\*?\s*\w+)\s*\[(\d*)\]\s*(?:=\s*([\s\S]+))?$/);
            if (arrM) {
                const name = arrM[1].replace('*', '').trim();
                const size = arrM[2] ? parseInt(arrM[2]) : 0;
                let arr;
                if (arrM[3] !== undefined) {
                    const initExpr = arrM[3].trim();
                    if (initExpr.startsWith('{') && initExpr.endsWith('}')) {
                        arr = splitArgs(initExpr.slice(1, -1)).map(v => this._eval(v.trim()));
                        if (size > arr.length) arr = [...arr, ...new Array(size - arr.length).fill(0)];
                    } else {
                        // Generic expression — e.g. `new int[n]` (Java) or
                        // a function returning an array. _eval should yield
                        // a JS array; fall back to a zero-filled buffer.
                        const v = this._eval(initExpr);
                        arr = Array.isArray(v) ? v : new Array(Math.max(size, 0)).fill(0);
                    }
                } else {
                    arr = new Array(Math.max(size, 0)).fill(cType.includes('char') ? 0 : 0);
                }
                this._vars[name] = arr;
                changed.push(name);
                continue;
            }

            // With assignment: name = expr
            const eqM = decl.match(/^(\*?\s*\w+)\s*=\s*(.+)$/);
            if (eqM) {
                const name = eqM[1].replace('*', '').trim();
                const val = this._eval(eqM[2]);
                this._vars[name] = val;
                changed.push(name);
                this._snapshot(line, `${cType} ${name} = ${formatValue(val)}`, [name], 'var-init');
                continue;
            }

            // Just name
            const name = decl.replace('*', '').trim();
            if (/^\w+$/.test(name)) {
                const def = cType.includes('float') || cType.includes('double') ? 0.0 :
                            cType.includes('char') ? 0 :
                            cType.includes('bool') ? false : 0;
                this._vars[name] = def;
                changed.push(name);
            }
        }

        if (changed.length > 0) {
            const desc = changed.map(n => {
                const v = this._vars[n];
                return `${n} = ${formatValue(v)}`;
            }).join(', ');
            this._snapshot(line, `${cType}: ${desc}`, changed, 'var-init');
        }

        return { type: 'normal' };
    }

    _execArrayDecl(text, line) {
        // int arr[] = {1,2,3}; or int arr[5] = {0};
        const m = text.match(/^(?:const\s+)?(?:unsigned\s+)?(\w+)\s+(\w+)\s*\[\s*(\d*)\s*\]\s*=\s*\{([^}]*)\}/);
        if (!m) return this._execVarDecl(text, line);
        const cType = m[1], name = m[2];
        const declared = m[3] ? parseInt(m[3]) : 0;
        const vals = m[4].split(',').map(v => this._eval(v.trim()));
        if (declared > vals.length) {
            while (vals.length < declared) vals.push(0);
        }
        this._vars[name] = vals;
        this._snapshot(line, `${cType} ${name}[] = ${formatValue(vals)}`, [name], 'var-init');
        return { type: 'normal' };
    }

    // ── Assignment ──────────────────────────────────────────────────

    _matchAssignment(text) {
        // Returns { lhs, op, rhs } or null
        // Must not match comparison operators or type declarations
        const m = text.replace(/;$/, '').match(/^(\*?\s*\w+(?:\[[^\]]+\])*)\s*([\+\-\*\/%&\|^]?=)\s*(.+)$/);
        if (!m) return null;
        const op = m[2];
        // Exclude ==
        if (op === '=' && text.includes('==')) return null;
        // Exclude type declarations
        if (this._isTypeDecl(text)) return null;
        return { lhs: m[1].trim(), op, rhs: m[3].trim() };
    }

    _execAssign({ lhs, op, rhs }, line) {
        // Array element: arr[i] = val
        const arrM = lhs.match(/^(\w+)\[(.+)\]$/);
        if (arrM) {
            const arrName = arrM[1];
            const idx = this._eval(arrM[2]);
            const arr = this._getVar(arrName);
            const rhsVal = this._eval(rhs);
            if (Array.isArray(arr)) {
                const newArr = [...arr];
                newArr[idx] = this._applyOp(arr[idx], op, rhsVal);
                this._setVar(arrName, newArr);
                this._snapshot(line, `${arrName}[${idx}] = ${formatValue(newArr[idx])}`, [arrName], 'var-update');
            }
            return { type: 'normal' };
        }

        // Pointer deref: *p = val
        if (lhs.startsWith('*')) {
            const name = lhs.slice(1).trim();
            const rhsVal = this._eval(rhs);
            this._setVar(name, rhsVal);
            this._snapshot(line, `*${name} = ${formatValue(rhsVal)}`, [name], 'var-update');
            return { type: 'normal' };
        }

        // Regular
        const old = this._getVar(lhs);
        const rhsVal = this._eval(rhs);
        const nv = this._applyOp(old, op, rhsVal);
        this._setVar(lhs, nv);
        const desc = old === undefined ? `${lhs} = ${formatValue(nv)}` : `${lhs}: ${formatValue(old)} → ${formatValue(nv)}`;
        this._snapshot(line, desc, [lhs], old === undefined ? 'var-init' : 'var-update');
        return { type: 'normal' };
    }

    _applyOp(left, op, right) {
        const l = left === undefined ? 0 : left;
        switch (op) {
            case '=': return right;
            case '+=': return typeof l === 'string' ? l + String(right) : (Number(l) || 0) + (Number(right) || 0);
            case '-=': return (Number(l) || 0) - (Number(right) || 0);
            case '*=': return (Number(l) || 0) * (Number(right) || 0);
            case '/=': {
                const r = Number(right) || 0;
                const lv = Number(l) || 0;
                return r === 0 ? 0 : (Number.isInteger(lv) && Number.isInteger(r) ? Math.trunc(lv / r) : lv / r);
            }
            case '%=': return (Number(l) || 0) % (Number(right) || 1);
            case '&=': return (Number(l) | 0) & (Number(right) | 0);
            case '|=': return (Number(l) | 0) | (Number(right) | 0);
            case '^=': return (Number(l) | 0) ^ (Number(right) | 0);
            default: return right;
        }
    }

    // ── Printf ────────────────────────────────────────────────────────

    _execPrintf(text, line) {
        if (/^puts\s*\(/.test(text)) {
            const m = text.match(/puts\s*\(([^)]+)\)/);
            if (m) {
                const val = this._eval(m[1]);
                const s = typeof val === 'string' ? val : formatValue(val);
                this.output += s + '\n';
                this._snapshot(line, `puts: ${s.replace(/\n/g, '↵')}`, [], 'print');
            }
            return;
        }
        if (/^putchar\s*\(/.test(text)) {
            const m = text.match(/putchar\s*\(([^)]+)\)/);
            if (m) {
                const val = this._eval(m[1]);
                const ch = typeof val === 'number' ? String.fromCharCode(val) : String(val || '');
                this.output += ch;
                this._snapshot(line, `putchar: '${ch}'`, [], 'print');
            }
            return;
        }

        // printf
        const inner = this._extractCallArgs(text, 'printf');
        if (!inner) return;
        const args = splitArgs(inner);
        if (!args.length) return;

        const fmt = this._eval(args[0]);
        const vals = args.slice(1).map(a => this._eval(a));
        const result = this._sprintfFormat(typeof fmt === 'string' ? fmt : String(fmt), vals);
        this.output += result;
        this._snapshot(line, `printf: ${result.replace(/\n/g, '↵').slice(0, 60)}`, [], 'print');
    }

    _extractCallArgs(text, funcName) {
        const start = text.indexOf(funcName + '(');
        if (start === -1) return null;
        let i = start + funcName.length + 1;
        let depth = 1;
        let result = '';
        while (i < text.length && depth > 0) {
            const ch = text[i];
            if (ch === '(') depth++;
            else if (ch === ')') { depth--; if (depth === 0) break; }
            result += ch;
            i++;
        }
        return result;
    }

    _sprintfFormat(fmt, vals) {
        let res = '', vi = 0, i = 0;
        fmt = fmt.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r')
                 .replace(/\\\\/g, '\\').replace(/\\"/g, '"').replace(/\\0/g, '');
        while (i < fmt.length) {
            if (fmt[i] !== '%') { res += fmt[i++]; continue; }
            i++;
            // flags, width, precision, length modifier
            while (i < fmt.length && '+-0 #'.includes(fmt[i])) i++;
            let width = ''; while (i < fmt.length && /\d/.test(fmt[i])) width += fmt[i++];
            let prec = ''; if (fmt[i] === '.') { i++; while (i < fmt.length && /\d/.test(fmt[i])) prec += fmt[i++]; }
            if (i < fmt.length && 'lhzL'.includes(fmt[i])) i++;
            const conv = fmt[i++];
            const v = vals[vi++];
            const w = width ? parseInt(width) : 0;
            switch (conv) {
                case 'd': case 'i': case 'u': {
                    let s = String(Math.trunc(Number(v) || 0));
                    res += w > s.length ? s.padStart(w) : s;
                    break;
                }
                case 'f': res += (Number(v) || 0).toFixed(prec ? parseInt(prec) : 6); break;
                case 'e': res += (Number(v) || 0).toExponential(prec ? parseInt(prec) : 6); break;
                case 'g': res += parseFloat(((Number(v) || 0).toPrecision(prec ? parseInt(prec) : 6))); break;
                case 'c': res += typeof v === 'number' ? String.fromCharCode(v) : String(v || '')[0] || ''; break;
                case 's': {
                    let s = v === null || v === undefined ? '' : String(v);
                    if (prec) s = s.slice(0, parseInt(prec));
                    res += w > s.length ? s.padStart(w) : s;
                    break;
                }
                case 'x': res += (Math.trunc(Number(v) || 0)).toString(16); break;
                case 'X': res += (Math.trunc(Number(v) || 0)).toString(16).toUpperCase(); break;
                case 'o': res += (Math.trunc(Number(v) || 0)).toString(8); break;
                case '%': res += '%'; vi--; break;
                default: res += '%' + conv;
            }
        }
        return res;
    }

    // ── Control flow ──────────────────────────────────────────────────

    _execIf(text, line, idx, all) {
        // Walk the entire if / else-if / else chain at once. Each branch's
        // body is extracted independently with _extractBlock (which counts
        // its own braces correctly), and only the first matching branch
        // runs. Returns next index past the whole chain.
        const chain = this._buildIfChain(idx, all, text);
        if (chain.length === 0) return { type: 'normal' };

        const lastBranch = chain[chain.length - 1];
        let executed = false;

        for (const branch of chain) {
            if (executed) break;
            const condStr = branch.cond;
            const condResult = condStr === null ? true : !!this._eval(condStr);
            const desc = condStr === null
                ? 'else branch'
                : `${branch.kind === 'if' ? 'if' : 'else if'} (${condStr}) → ${condResult ? 'true' : 'false'}`;
            const flow = condStr === null ? 'else' : (condResult ? 'if-true' : 'if-false');
            this._snapshot(branch.headerLine, desc, [], flow);
            if (condResult) {
                executed = true;
                const res = this._execBlock(branch.body);
                if (res.type !== 'normal') return { ...res, next: lastBranch.endIdx + 1 };
            }
        }

        return { type: 'normal', next: lastBranch.endIdx + 1 };
    }

    // Build a flat chain of { cond, body, kind, headerLine, endIdx } describing
    // the whole if / else-if / else cascade starting at idx in all.
    // - cond: condition string, or null for bare `else`
    // - body: array of line objects to execute when this branch matches
    // - kind: 'if' | 'else-if' | 'else'
    // - headerLine: original source line of the branch header (for snapshots)
    // - endIdx: index in `all` of the branch's closing `}` (or last body line)
    _buildIfChain(idx, all, headerText) {
        const chain = [];
        let curIdx = idx;
        let curHeader = headerText;
        // The very first call comes from `if (...)` dispatch. Any same-line
        // body (e.g. `if (cond) stmt;`) is handled here as a one-statement body.
        while (curIdx < all.length) {
            const text = curHeader;
            const isElseIf = /^else\s+if\b/.test(text);
            const isIf = !isElseIf && /^if\b/.test(text);
            const isElse = !isElseIf && /^else\b/.test(text);

            let cond = null;
            if (isIf || isElseIf) {
                const parsed = this._extractParenHeader(text, isIf ? /^if\b/ : /^else\s+if\b/);
                if (parsed) cond = parsed.header;
            }

            // Body extraction: same-line single-statement, or { ... }, or single
            // following line.
            let body, endIdx;
            const sameLineMatch = (isIf || isElseIf)
                ? this._extractParenHeader(text, isIf ? /^if\b/ : /^else\s+if\b/)
                : null;
            const sameLineBody = sameLineMatch ? sameLineMatch.sameLineBody : '';

            if ((isIf || isElseIf) && sameLineBody && sameLineBody !== '') {
                // `if (cond) stmt;`  or  `else if (cond) stmt;`
                body = [{ text: sameLineBody, line: all[curIdx].line }];
                endIdx = curIdx;
            } else if (isElse && !text.endsWith('{') && !text.includes('{')) {
                // `else stmt;` (single-line bare else)
                const restOfElse = text.replace(/^else\s*/, '').trim();
                if (restOfElse) {
                    body = [{ text: restOfElse, line: all[curIdx].line }];
                    endIdx = curIdx;
                } else if (curIdx + 1 < all.length) {
                    body = [all[curIdx + 1]];
                    endIdx = curIdx + 1;
                } else {
                    body = [];
                    endIdx = curIdx;
                }
            } else {
                const block = this._extractBlock(curIdx, all, text);
                body = block.body;
                endIdx = block.bodyEnd;
            }

            chain.push({
                cond,
                body,
                kind: isIf ? 'if' : (isElseIf ? 'else-if' : 'else'),
                headerLine: all[curIdx].line,
                endIdx,
            });

            // Bare else terminates the chain
            if (isElse) break;

            // Look for next else / else-if
            const nextIdx = endIdx + 1;
            if (nextIdx >= all.length) break;
            const nextText = all[nextIdx].text;
            if (!nextText.startsWith('else')) break;

            curIdx = nextIdx;
            curHeader = nextText;
        }
        return chain;
    }

    _extractIfElse(idx, all, headerText) {
        const body = [];
        let j = idx + 1;
        let braces = headerText.endsWith('{') || headerText.includes('){') ? 1 : 0;

        if (braces === 0) {
            if (j < all.length && all[j].text === '{') { braces = 1; j++; }
            else {
                // Single-statement if body
                if (j < all.length) body.push(all[j]);
                return { body, elseBody: [], elseEnd: j };
            }
        }

        // Extract the if-block body
        while (j < all.length && braces > 0) {
            for (const ch of all[j].text) { if (ch === '{') braces++; if (ch === '}') braces--; }
            if (braces > 0) body.push(all[j]);
            j++;
        }

        // Now j points to the line after the if's closing `}`. Walk forward,
        // accumulating every `else if (...)` and the optional terminal `else`
        // into a flat elseBody. _execBlock(elseBody) handles dispatch — when
        // it hits an `else if` line, that line goes back through _execIf
        // which calls _extractIfElse on this same flat list to find its own
        // body and the remaining chain.
        const elseBody = [];
        while (j < all.length && all[j].text.startsWith('else')) {
            const nt = all[j].text;
            elseBody.push(all[j]);
            j++;

            let eb = nt.endsWith('{') || nt.includes('){') ? 1 : 0;
            if (eb === 0) {
                if (j < all.length && all[j].text === '{') { eb = 1; j++; }
                else {
                    // Single-statement else / else-if body
                    if (j < all.length) { elseBody.push(all[j]); j++; }
                    if (!nt.startsWith('else if')) break;
                    continue;
                }
            }
            while (j < all.length && eb > 0) {
                for (const ch of all[j].text) { if (ch === '{') eb++; if (ch === '}') eb--; }
                if (eb > 0) elseBody.push(all[j]);
                j++;
            }
            // A bare `else` terminates the chain; `else if` continues it.
            if (!nt.startsWith('else if')) break;
        }

        return { body, elseBody, elseEnd: j - 1 };
    }

    _execFor(text, line, idx, all) {
        // for (init; cond; update) { body }
        const parsed = this._extractParenHeader(text, /^for\b/);
        if (!parsed) return { type: 'normal' };
        const header = parsed.header;
        const sameLineBody = parsed.sameLineBody;

        // Split header into init; cond; update
        const parts = this._splitForHeader(header);
        if (!parts) return { type: 'normal' };
        const [initStr, condStr, updateStr] = parts;

        // Execute init
        if (initStr.trim()) this._execStmt({ text: initStr.trim(), line }, 0, []);

        let body, bodyEnd;
        if (sameLineBody && sameLineBody !== '{') {
            // Single-statement loop on same line
            body = [{ text: sameLineBody, line }];
            bodyEnd = idx;
        } else {
            ({ body, bodyEnd } = this._extractBlock(idx, all, text));
        }

        let iteration = 0;
        while (!condStr.trim() || this._eval(condStr.trim())) {
            iteration++;
            if (iteration > MAX_STEPS) throw new Error('Infinite loop detected');
            this._snapshot(line, `for loop — iteration ${iteration}`, [], 'loop-iteration', { iteration });
            const res = this._execBlock(body);
            if (res.type === 'return') return { ...res, next: bodyEnd + 1 };
            if (res.type === 'break') break;
            // continue: fall through to update
            if (updateStr.trim()) this._execStmt({ text: updateStr.trim(), line }, 0, []);
        }

        this._snapshot(line, `for loop completed (${iteration} iterations)`, [], 'loop-end');
        return { type: 'normal', next: bodyEnd + 1 };
    }

    _splitForHeader(header) {
        // Split "int i = 0; i < n; i++" respecting nesting
        const parts = [];
        let depth = 0, cur = '', inStr = false, strCh = '';
        for (const ch of header) {
            if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strCh = ch; cur += ch; continue; }
            if (inStr && ch === strCh) { inStr = false; cur += ch; continue; }
            if (inStr) { cur += ch; continue; }
            if (ch === '(' || ch === '[') depth++;
            if (ch === ')' || ch === ']') depth--;
            if (ch === ';' && depth === 0) { parts.push(cur.trim()); cur = ''; }
            else cur += ch;
        }
        parts.push(cur.trim());
        return parts.length >= 3 ? [parts[0], parts[1], parts.slice(2).join(';')] : null;
    }

    _execWhile(text, line, idx, all) {
        const parsed = this._extractParenHeader(text, /^while\b/);
        if (!parsed) return { type: 'normal' };
        const condStr = parsed.header;
        const sameLineBody = parsed.sameLineBody;

        let body, bodyEnd;
        if (sameLineBody && sameLineBody !== '{') {
            body = [{ text: sameLineBody, line }];
            bodyEnd = idx;
        } else {
            ({ body, bodyEnd } = this._extractBlock(idx, all, text));
        }

        let iteration = 0;
        while (this._eval(condStr)) {
            iteration++;
            if (iteration > MAX_STEPS) throw new Error('Infinite loop detected');
            this._snapshot(line, `while (${condStr}) — iteration ${iteration}`, [], 'loop-iteration', { iteration });
            const res = this._execBlock(body);
            if (res.type === 'return') return { ...res, next: bodyEnd + 1 };
            if (res.type === 'break') break;
        }
        this._snapshot(line, `while loop ended (${iteration} iterations)`, [], 'loop-end');
        return { type: 'normal', next: bodyEnd + 1 };
    }

    _execDoWhile(text, line, idx, all) {
        const { body, bodyEnd } = this._extractBlock(idx, all, text);
        // Find while condition after closing brace
        let condStr = 'false';
        for (let j = bodyEnd + 1; j < Math.min(bodyEnd + 3, all.length); j++) {
            const wm = all[j].text.match(/^(?:}\s*)?while\s*\((.+)\)\s*;?$/);
            if (wm) { condStr = wm[1]; break; }
        }

        let iteration = 0;
        do {
            iteration++;
            if (iteration > MAX_STEPS) throw new Error('Infinite loop detected');
            this._snapshot(line, `do-while — iteration ${iteration}`, [], 'loop-iteration', { iteration });
            const res = this._execBlock(body);
            if (res.type === 'return') return res;
            if (res.type === 'break') break;
        } while (this._eval(condStr));

        this._snapshot(line, `do-while ended (${iteration} iterations)`, [], 'loop-end');
        return { type: 'normal', next: bodyEnd + 2 };
    }

    _execSwitch(text, line, idx, all) {
        const m = text.match(/^switch\s*\((.+)\)\s*\{?/);
        if (!m) return { type: 'normal' };
        const val = this._eval(m[1]);
        const { body, bodyEnd } = this._extractBlock(idx, all, text);

        this._snapshot(line, `switch (${formatValue(val)})`, [], 'if-check');

        let matched = false;
        let i = 0;
        while (i < body.length) {
            const t = body[i].text;
            const caseM = t.match(/^case\s+(.+?)\s*:/);
            const isDef = /^default\s*:/.test(t);

            if (caseM && !matched) {
                if (this._eval(caseM[1]) === val) {
                    matched = true;
                    this._snapshot(body[i].line, `case ${caseM[1]}: matched`, [], 'if-true');
                }
                i++; continue;
            }
            if (isDef && !matched) { matched = true; i++; continue; }
            if (matched) {
                const res = this._execStmt(body[i], i, body);
                if (res.type === 'break') break;
                if (res.type === 'return') return { ...res, next: bodyEnd + 1 };
                i = res.next !== undefined ? res.next : i + 1;
            } else {
                i++;
            }
        }
        return { type: 'normal', next: bodyEnd + 1 };
    }

    _extractBlock(idx, all, headerText) {
        let j = idx + 1;
        let braces = headerText.includes('{') ? 1 : 0;

        if (braces === 0) {
            if (j < all.length && all[j].text === '{') { braces = 1; j++; }
            else {
                // Single-statement body
                if (j < all.length) return { body: [all[j]], bodyEnd: j };
                return { body: [], bodyEnd: idx };
            }
        }

        const body = [];
        while (j < all.length && braces > 0) {
            for (const ch of all[j].text) { if (ch === '{') braces++; if (ch === '}') braces--; }
            if (braces > 0) body.push(all[j]);
            j++;
        }
        return { body, bodyEnd: j - 1 };
    }

    // ── Expression evaluator ──────────────────────────────────────────

    _eval(expr) {
        if (expr === undefined || expr === null) return null;
        expr = String(expr).trim();
        if (!expr) return null;

        // Define substitution
        if (expr in this.defines) {
            try { return this._eval(this.defines[expr]); } catch { return this.defines[expr]; }
        }

        // Boolean literals
        if (expr === 'true' || expr === 'TRUE') return true;
        if (expr === 'false' || expr === 'FALSE') return false;
        if (expr === 'NULL' || expr === 'nullptr' || expr === 'null') return null;
        if (expr === 'EOF') return -1;

        // Char literal: 'a' or '\n'
        if (/^'[^'\\]'$/.test(expr)) return expr.charCodeAt(1);
        if (/^'\\.'$/.test(expr)) {
            switch (expr[2]) {
                case 'n': return 10; case 't': return 9; case 'r': return 13;
                case '0': return 0; case '\\': return 92; case '\'': return 39;
            }
        }

        // String literal
        if (expr.startsWith('"') && expr.endsWith('"')) {
            return expr.slice(1, -1)
                .replace(/\\n/g, '\n').replace(/\\t/g, '\t')
                .replace(/\\\\/g, '\\').replace(/\\"/g, '"');
        }

        // Hex / octal / binary number
        if (/^0[xX][0-9a-fA-F]+$/.test(expr)) return parseInt(expr, 16);
        if (/^0[bB][01]+$/.test(expr)) return parseInt(expr.slice(2), 2);
        if (/^0[0-7]+$/.test(expr) && expr.length > 1) return parseInt(expr, 8);

        // Number with suffix
        const numM = expr.match(/^-?\d+(\.\d+)?([fFdDlLuU]*)$/);
        if (numM) {
            const s = expr.replace(/[fFdDlLuU]+$/, '');
            return s.includes('.') ? parseFloat(s) : parseInt(s, 10);
        }

        // Parenthesized / cast
        if (expr[0] === '(' && this._matchParen(expr, 0) === expr.length - 1) {
            const cast = expr.match(/^\((?:const\s+)?(?:int|long|short|char|float|double|unsigned|bool|void\s*\*?)\s*\*?\)\s*(.+)$/);
            if (cast) {
                const v = this._eval(cast[1]);
                if (/\((?:int|long|short|char|unsigned)/.test(expr)) return Math.trunc(Number(v) || 0);
                return Number(v) || 0;
            }
            return this._eval(expr.slice(1, -1));
        }

        // Ternary: a ? b : c
        const tern = this._findTernary(expr);
        if (tern) {
            return this._eval(expr.slice(0, tern.q)) ? this._eval(expr.slice(tern.q + 1, tern.c)) : this._eval(expr.slice(tern.c + 1));
        }

        // Binary operators — ordered by precedence (lowest first)
        const binOps = [
            ['||'], ['&&'],
            ['|'], ['^'], ['&'],
            ['==', '!='],
            ['<=', '>=', '<', '>'],
            ['<<', '>>'],
            ['+'],
            ['-'],
            ['*'], ['/'], ['%'],
        ];

        for (const group of binOps) {
            for (const op of group) {
                const pos = this._findOp(expr, op);
                if (pos !== -1) {
                    const l = this._eval(expr.slice(0, pos));
                    const r = this._eval(expr.slice(pos + op.length));
                    switch (op) {
                        case '||': return l || r;
                        case '&&': return l && r;
                        case '|': return (Number(l) | 0) | (Number(r) | 0);
                        case '^': return (Number(l) | 0) ^ (Number(r) | 0);
                        case '&': return (Number(l) | 0) & (Number(r) | 0);
                        case '==': return l === r || (typeof l === 'number' && typeof r === 'number' && l === r);
                        case '!=': return l !== r;
                        case '<=': return Number(l) <= Number(r);
                        case '>=': return Number(l) >= Number(r);
                        case '<': return Number(l) < Number(r);
                        case '>': return Number(l) > Number(r);
                        case '<<': return (Number(l) | 0) << (Number(r) | 0);
                        case '>>': return (Number(l) | 0) >> (Number(r) | 0);
                        case '+': {
                            if (typeof l === 'string' || typeof r === 'string') return String(l ?? '') + String(r ?? '');
                            return (Number(l) || 0) + (Number(r) || 0);
                        }
                        case '-': return (Number(l) || 0) - (Number(r) || 0);
                        case '*': return (Number(l) || 0) * (Number(r) || 0);
                        case '/': {
                            const rv = Number(r) || 0;
                            const lv = Number(l) || 0;
                            return rv === 0 ? 0 : (Number.isInteger(lv) && Number.isInteger(rv) ? Math.trunc(lv / rv) : lv / rv);
                        }
                        case '%': return (Number(l) || 0) % (Number(r) || 1);
                    }
                }
            }
        }

        // Unary operators
        if (expr.startsWith('!')) return !this._eval(expr.slice(1));
        if (expr.startsWith('~')) return ~(Number(this._eval(expr.slice(1))) | 0);
        if (expr.startsWith('-') && expr.length > 1) {
            const inner = this._eval(expr.slice(1));
            return typeof inner === 'number' ? -inner : inner;
        }
        if (expr.startsWith('+') && expr.length > 1) return Number(this._eval(expr.slice(1))) || 0;

        // sizeof
        if (/^sizeof\s*\(/.test(expr)) {
            const m = expr.match(/sizeof\s*\(([^)]+)\)/);
            if (m) {
                const t = m[1].trim();
                const v = this._getVar(t);
                if (Array.isArray(v)) return v.length * 4;
                return t === 'char' ? 1 : t === 'double' || t === 'long' ? 8 : 4;
            }
        }

        // Prefix ++/--
        if (expr.startsWith('++') || expr.startsWith('--')) {
            const name = expr.slice(2).trim();
            const old = this._getVar(name) || 0;
            const nv = expr.startsWith('++') ? old + 1 : old - 1;
            this._setVar(name, nv);
            return nv;
        }

        // Postfix ++/--
        if (expr.endsWith('++') || expr.endsWith('--')) {
            const name = expr.slice(0, -2).trim();
            const old = this._getVar(name) || 0;
            this._setVar(name, expr.endsWith('++') ? old + 1 : old - 1);
            return old;
        }

        // Address-of / pointer dereference
        if (expr.startsWith('&')) return this._getVar(expr.slice(1).trim());
        if (expr.startsWith('*') && !expr.startsWith('**')) return this._getVar(expr.slice(1).trim());

        // Function call
        const callM = expr.match(/^(\w+)\s*\(([\s\S]*)\)$/);
        if (callM) return this._evalCall(expr);

        // Array access: arr[i] or arr[i][j] (only when the whole expression is
        // a chain of balanced subscripts — a regex would mis-match `arr[i] > arr[j]`).
        const arrParsed = this._parseSubscriptChain(expr);
        if (arrParsed) {
            let val = this._getVar(arrParsed.name);
            for (const idxExpr of arrParsed.indices) {
                const idx = this._eval(idxExpr);
                if (Array.isArray(val)) val = val[idx];
                else if (typeof val === 'string') val = val.charCodeAt(idx) || 0;
                else break;
            }
            return val ?? 0;
        }

        // Member access: obj.field or ptr->field
        const memM = expr.match(/^(\w+)(?:\.|->) ?(\w+(?:\(.*\))?)$/);
        if (memM) {
            const obj = this._getVar(memM[1]);
            const field = memM[2];
            if (Array.isArray(obj)) {
                if (field === 'length' || field === 'size()') return obj.length;
            }
            if (obj && typeof obj === 'object') return obj[field] ?? 0;
        }

        // Variable
        const v = this._getVar(expr);
        if (v !== undefined) return v;

        // Bare integer fallback
        if (/^\d+$/.test(expr)) return parseInt(expr, 10);
        return 0;
    }

    _evalCall(expr, callerLine) {
        const m = expr.match(/^(\w+)\s*\(([\s\S]*)\)$/);
        if (!m) return 0;
        const fname = m[1];
        const argsStr = m[2].trim();
        const argVals = argsStr ? splitArgs(argsStr).map(a => this._eval(a)) : [];

        // Built-ins
        switch (fname) {
            case 'abs': case 'fabs': case 'labs': return Math.abs(Number(argVals[0]) || 0);
            case 'sqrt': return Math.sqrt(Number(argVals[0]) || 0);
            case 'pow': return Math.pow(Number(argVals[0]) || 0, Number(argVals[1]) || 0);
            case 'floor': return Math.floor(Number(argVals[0]) || 0);
            case 'ceil': return Math.ceil(Number(argVals[0]) || 0);
            case 'round': return Math.round(Number(argVals[0]) || 0);
            case 'log': return Math.log(Number(argVals[0]) || 0);
            case 'log2': return Math.log2(Number(argVals[0]) || 0);
            case 'log10': return Math.log10(Number(argVals[0]) || 0);
            case 'sin': return Math.sin(Number(argVals[0]) || 0);
            case 'cos': return Math.cos(Number(argVals[0]) || 0);
            case 'tan': return Math.tan(Number(argVals[0]) || 0);
            case 'rand': return Math.floor(Math.random() * 32768);
            case 'srand': return undefined;
            case 'max': case 'fmax': return Math.max(Number(argVals[0]) || 0, Number(argVals[1]) || 0);
            case 'min': case 'fmin': return Math.min(Number(argVals[0]) || 0, Number(argVals[1]) || 0);
            case 'strlen': return String(argVals[0] ?? '').length;
            case 'strcmp': return String(argVals[0] ?? '').localeCompare(String(argVals[1] ?? ''));
            case 'strncmp': return String(argVals[0] ?? '').slice(0, argVals[2]).localeCompare(String(argVals[1] ?? '').slice(0, argVals[2]));
            case 'atoi': return parseInt(String(argVals[0] ?? ''), 10) || 0;
            case 'atof': return parseFloat(String(argVals[0] ?? '')) || 0;
            case 'isalpha': return /[a-zA-Z]/.test(String.fromCharCode(argVals[0])) ? 1 : 0;
            case 'isdigit': return /[0-9]/.test(String.fromCharCode(argVals[0])) ? 1 : 0;
            case 'isspace': return /\s/.test(String.fromCharCode(argVals[0])) ? 1 : 0;
            case 'isupper': return /[A-Z]/.test(String.fromCharCode(argVals[0])) ? 1 : 0;
            case 'islower': return /[a-z]/.test(String.fromCharCode(argVals[0])) ? 1 : 0;
            case 'toupper': return String.fromCharCode(argVals[0]).toUpperCase().charCodeAt(0);
            case 'tolower': return String.fromCharCode(argVals[0]).toLowerCase().charCodeAt(0);
            case 'printf': this._execPrintf(expr + ';', callerLine || 0); return 0;
            case 'puts': {
                const s = String(argVals[0] ?? '');
                this.output += s + '\n';
                return s.length + 1;
            }
            case 'putchar': {
                const ch = typeof argVals[0] === 'number' ? String.fromCharCode(argVals[0]) : String(argVals[0] ?? '');
                this.output += ch;
                return argVals[0];
            }
            case 'scanf': case 'fscanf': case 'sscanf': case 'fgets': case 'gets': return 1;
            case 'malloc': case 'calloc': case 'realloc': return new Array(Number(argVals[0]) || 0).fill(0);
            case 'free': return undefined;
            case 'memset': {
                if (Array.isArray(argVals[0])) argVals[0].fill(argVals[1] || 0);
                return argVals[0];
            }
            case 'memcpy': return argVals[0];
            case 'qsort': {
                if (Array.isArray(argVals[0])) argVals[0].sort((a, b) => a - b);
                return undefined;
            }
            case 'exit': throw new Error('exit(' + (argVals[0] || 0) + ')');
        }

        // User-defined function
        if (this.functions[fname]) {
            if (this.callStack.length >= MAX_CALL_DEPTH) throw new Error('Maximum call depth exceeded (infinite recursion?)');
            return this._callUserFunc(fname, argVals, callerLine);
        }

        return 0;
    }

    _callUserFunc(fname, argVals, callerLine) {
        const func = this.functions[fname];
        const frame = { vars: {}, funcName: fname };
        for (let i = 0; i < func.params.length; i++) {
            frame.vars[func.params[i].name] = argVals[i] !== undefined ? argVals[i] : 0;
        }
        this.callStack.push(frame);
        this._snapshot(func.headerLine, `call ${fname}(${argVals.map(formatValue).join(', ')})`, [], 'function-call');
        let returnValue = undefined;
        try {
            const res = this._execBlock(func.body);
            if (res.type === 'return') returnValue = res.value;
        } finally {
            this.callStack.pop();
        }
        return returnValue;
    }

    // ── Operator search helpers ────────────────────────────────────────

    _findOp(expr, op) {
        // Find the RIGHTMOST occurrence of op at depth 0 (left-associative)
        let depth = 0, inStr = false, strCh = '';
        let found = -1;
        for (let i = 0; i < expr.length; i++) {
            const ch = expr[i];
            if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strCh = ch; continue; }
            if (inStr && ch === strCh && (i === 0 || expr[i - 1] !== '\\')) { inStr = false; continue; }
            if (inStr) continue;
            if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
            if (ch === ')' || ch === ']' || ch === '}') { depth--; continue; }
            if (depth !== 0) continue;

            if (expr.slice(i, i + op.length) !== op) continue;

            // Ensure it's not part of a longer op
            const after = expr[i + op.length];
            if (op === '=' && (after === '=' || '!<>+-*/&|^'.includes(expr[i - 1] || ''))) continue;
            if (op === '<' && (after === '<' || after === '=')) continue;
            if (op === '>' && (after === '>' || after === '=')) continue;
            if (op === '!' && after === '=') continue;
            if (op === '&' && (after === '&' || expr[i - 1] === '&')) continue;
            if (op === '|' && (after === '|' || expr[i - 1] === '|')) continue;
            if (op === '+' && (after === '+' || expr[i - 1] === '+')) continue;
            if (op === '-' && (after === '-' || after === '>' || expr[i - 1] === '-')) continue;

            // Subtraction: ensure it's binary (has left operand)
            if ((op === '-' || op === '+') && i === 0) continue;
            if ((op === '-' || op === '+') && i > 0 && '(<>=!+*/%-&|^,;'.includes(expr[i - 1])) continue;

            // * and & unary at position 0
            if ((op === '*' || op === '&') && i === 0) continue;
            if (op === '*' && i > 0 && '(<>=!+*/%-&|^,;'.includes(expr[i - 1])) continue;

            found = i;
        }
        return found;
    }

    // Parse a chain of subscripts where the WHOLE expression is `name[..][..]…`.
    // Returns { name, indices: [string, ...] } or null. Used to disambiguate
    // `arr[i]` (subscript) from `arr[i] > arr[j]` (comparison).
    _parseSubscriptChain(expr) {
        const nameM = expr.match(/^(\w+)/);
        if (!nameM) return null;
        const name = nameM[1];
        let pos = name.length;
        if (pos >= expr.length || expr[pos] !== '[') return null;

        const indices = [];
        while (pos < expr.length && expr[pos] === '[') {
            let depth = 0, inStr = false, strCh = '';
            let close = -1;
            for (let i = pos; i < expr.length; i++) {
                const ch = expr[i];
                if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strCh = ch; continue; }
                if (inStr && ch === strCh && expr[i - 1] !== '\\') { inStr = false; continue; }
                if (inStr) continue;
                if (ch === '[') depth++;
                else if (ch === ']') {
                    depth--;
                    if (depth === 0) { close = i; break; }
                }
            }
            if (close === -1) return null;
            indices.push(expr.substring(pos + 1, close));
            pos = close + 1;
        }
        if (pos !== expr.length) return null; // trailing chars → not a pure subscript
        return { name, indices };
    }

    // Single-subscript helper for cases that only support one level (e.g. cpp
    // vector/string subscript). Uses balanced bracket matching.
    _parseSingleSubscript(expr) {
        const c = this._parseSubscriptChain(expr);
        if (!c || c.indices.length !== 1) return null;
        return { name: c.name, indexExpr: c.indices[0] };
    }

    _matchParen(expr, start) {
        let depth = 0;
        for (let i = start; i < expr.length; i++) {
            if (expr[i] === '(') depth++;
            if (expr[i] === ')') { depth--; if (depth === 0) return i; }
        }
        return -1;
    }

    // Extract a control-flow header — e.g. `if (cond) body`, `for (i;c;u) body`,
    // `while (c) body` — using BALANCED parens. Returns { header, sameLineBody }
    // or null if the keyword is not present at the start.
    _extractParenHeader(text, kwRe) {
        if (!kwRe.test(text)) return null;
        const openParen = text.indexOf('(');
        if (openParen === -1) return null;
        let depth = 0, inStr = false, strCh = '';
        let closeParen = -1;
        for (let i = openParen; i < text.length; i++) {
            const ch = text[i];
            if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strCh = ch; continue; }
            if (inStr && ch === strCh && text[i - 1] !== '\\') { inStr = false; continue; }
            if (inStr) continue;
            if (ch === '(') depth++;
            else if (ch === ')') {
                depth--;
                if (depth === 0) { closeParen = i; break; }
            }
        }
        if (closeParen === -1) return null;
        return {
            header: text.substring(openParen + 1, closeParen),
            sameLineBody: text.substring(closeParen + 1).replace(/^\s*\{?\s*/, '').trim(),
        };
    }

    _findTernary(expr) {
        let depth = 0, inStr = false, strCh = '', qPos = -1;
        for (let i = 0; i < expr.length; i++) {
            const ch = expr[i];
            if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strCh = ch; continue; }
            if (inStr && ch === strCh) { inStr = false; continue; }
            if (inStr) continue;
            if (ch === '(' || ch === '[') depth++;
            if (ch === ')' || ch === ']') depth--;
            if (depth === 0 && ch === '?' && qPos === -1) qPos = i;
            if (depth === 0 && ch === ':' && qPos !== -1) return { q: qPos, c: i };
        }
        return null;
    }

    // ── Public execution entry ─────────────────────────────────────────

    run() {
        if (!this.functions['main']) {
            return { steps: [], error: { message: 'No main() function found', line: 1 }, output: '' };
        }
        this.callStack.push({ vars: {}, funcName: '__global__' });
        try {
            this._callUserFunc('main', [], 0);
        } catch (e) {
            const lm = e.message?.match(/line (\d+)/);
            return {
                steps: this.steps,
                error: { message: e.message || 'Runtime error', line: lm ? parseInt(lm[1]) : 1 },
                output: this.output,
            };
        }
        this.callStack.pop();
        return { steps: this.steps, error: null, output: this.output };
    }
}

// ── Public export ─────────────────────────────────────────────────────────

export function executeC(source) {
    try {
        const interp = new CInterpreter(source);
        return interp.run();
    } catch (e) {
        return {
            steps: [],
            error: { message: e.message || 'C execution error', line: 1 },
            output: '',
        };
    }
}
