/**
 * Java Subset Interpreter
 *
 * Built on top of CInterpreter — Java is structurally similar to C, so the
 * core block/statement/expression machinery is reused. JavaInterpreter
 * overrides parsing, statement dispatch, and expression evaluation to
 * cover Java-specific syntax:
 *   - class { ... } and method wrapping
 *   - System.out.println / System.out.print / System.out.printf
 *   - String concatenation with `+`
 *   - arr.length (property, not function)
 *   - String methods: length(), charAt(), substring(), indexOf(), etc.
 *   - new int[]{...} and {...} array literals
 *   - for-each loops: for (T x : arr)
 *   - Math.abs/max/min/pow/sqrt/etc.
 *   - Integer.parseInt / Double.parseDouble / String.valueOf
 *   - ArrayList / Arrays.toString (basic)
 */

import { CInterpreter, deepClone, formatValue as cFormatValue, splitArgs } from './cExecutor.js';

// Java-flavored type detection
function getJavaType(val) {
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'boolean') return 'boolean';
    if (typeof val === 'string') return 'String';
    if (typeof val === 'number') return Number.isInteger(val) ? 'int' : 'double';
    if (Array.isArray(val)) return 'array';
    if (typeof val === 'object') return 'Object';
    return typeof val;
}

// Java-flavored value formatting (uses doubles like Java's println)
function formatJavaValue(val) {
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'string') return `"${val}"`;
    if (Array.isArray(val)) return `[${val.map(formatJavaValue).join(', ')}]`;
    if (typeof val === 'number') {
        if (Number.isInteger(val)) return String(val);
        return String(val);
    }
    return String(val);
}

// Convert Java escape sequences in a JS string
function unescapeJavaString(s) {
    return s
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .replace(/\\\\/g, '\\')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\0/g, '\0');
}

// ── Java pre-processor ──────────────────────────────────────────────────
// Strip the `public class Foo { ... }` wrapper but keep accurate line numbers.

function stripJavaWrapper(source) {
    const rawLines = source.split('\n');
    let depth = 0;
    let inClass = false;
    let inMain = false;
    let mainBraceDepth = 0;
    const out = []; // { text, line }
    const methods = []; // { name, params, returnType, body, headerLine }

    let currentMethod = null;
    let methodBraceDepth = 0;
    let pendingMethodHeader = null;

    for (let i = 0; i < rawLines.length; i++) {
        const text = rawLines[i].trim();

        // Skip imports / package
        if (text.startsWith('import ') || text.startsWith('package ')) continue;

        // Skip block/line comments
        if (text.startsWith('//')) continue;

        // Track braces
        let openBraces = 0, closeBraces = 0;
        let inStr = false, strCh = '';
        for (let k = 0; k < text.length; k++) {
            const c = text[k];
            if (!inStr && (c === '"' || c === "'")) { inStr = true; strCh = c; continue; }
            if (inStr && c === strCh && text[k - 1] !== '\\') { inStr = false; continue; }
            if (inStr) continue;
            if (c === '{') openBraces++;
            if (c === '}') closeBraces++;
        }

        // Class declaration — entering class body
        const classMatch = text.match(/^(?:public\s+|final\s+|abstract\s+)*class\s+\w+/);
        if (classMatch && !inClass) {
            inClass = true;
            depth += openBraces;
            depth -= closeBraces;
            continue;
        }

        // Inside class: detect method definitions
        if (inClass && !inMain && !currentMethod) {
            // Method header: [modifiers] returnType name(params) [{]
            const methodHeader = text.match(/^(?:(?:public|private|protected|static|final|abstract)\s+)*([\w<>\[\]]+)\s+(\w+)\s*\(([^)]*)\)\s*\{?\s*$/);
            if (methodHeader) {
                const returnType = methodHeader[1];
                const name = methodHeader[2];
                const paramsStr = methodHeader[3];

                if (name === 'main') {
                    inMain = true;
                    mainBraceDepth = openBraces;
                    depth += openBraces;
                    depth -= closeBraces;
                    continue;
                }

                // Other methods
                const params = paramsStr.trim() && paramsStr.trim() !== ''
                    ? splitArgs(paramsStr).map(p => {
                        const m = p.trim().match(/^([\w<>\[\]]+)\s+(\w+)$/);
                        return m ? { type: m[1], name: m[2] } : { type: 'Object', name: p.trim() };
                    })
                    : [];
                currentMethod = { name, params, returnType, body: [], headerLine: i };
                methodBraceDepth = openBraces;
                if (closeBraces >= openBraces && openBraces > 0) {
                    // single-line empty method
                    methods.push(currentMethod);
                    currentMethod = null;
                }
                continue;
            }

            // Skip stray lines inside class body (fields, etc.)
            depth += openBraces;
            depth -= closeBraces;
            continue;
        }

        // Inside main()
        if (inMain) {
            for (const c of text) {
                if (c === '{') mainBraceDepth++;
                if (c === '}') mainBraceDepth--;
            }
            if (mainBraceDepth <= 0 && closeBraces > 0) {
                // End of main
                inMain = false;
                continue;
            }
            // Split `} else …` into two virtual lines so brace-counting
            // body extraction handles them as separate units. Both keep
            // the same source line number for the visualizer.
            const elseSplit = text.match(/^\}\s*(else\b[\s\S]*)$/);
            if (elseSplit) {
                out.push({ text: '}', line: i });
                out.push({ text: elseSplit[1].trim(), line: i });
            } else {
                out.push({ text, line: i });
            }
            continue;
        }

        // Inside a non-main method
        if (currentMethod) {
            for (const c of text) {
                if (c === '{') methodBraceDepth++;
                if (c === '}') methodBraceDepth--;
            }
            if (methodBraceDepth <= 0 && closeBraces > 0) {
                methods.push(currentMethod);
                currentMethod = null;
                continue;
            }
            const elseSplit = text.match(/^\}\s*(else\b[\s\S]*)$/);
            if (elseSplit) {
                currentMethod.body.push({ text: '}', line: i });
                currentMethod.body.push({ text: elseSplit[1].trim(), line: i });
            } else {
                currentMethod.body.push({ text, line: i });
            }
            continue;
        }
    }

    return { mainBody: out, methods };
}

// ── JavaInterpreter ─────────────────────────────────────────────────────

class JavaInterpreter extends CInterpreter {
    constructor(source) {
        super(''); // empty source — we'll set up manually
        this.source = source;

        const { mainBody, methods } = stripJavaWrapper(source);
        this.mainBody = mainBody;

        // Register methods
        for (const m of methods) {
            this.functions[m.name] = m;
        }
        // Synthesize a main function
        this.functions['main'] = {
            name: 'main',
            params: [],
            returnType: 'void',
            body: mainBody,
            headerLine: mainBody.length > 0 ? mainBody[0].line - 1 : 0,
        };
    }

    // Override snapshot to use Java type names + value formatting
    _snapshot(line, description, changedVars = [], flowType = null, flowDetail = null) {
        this.stepCount++;
        if (this.stepCount > 5000) throw new Error('Maximum execution steps exceeded (possible infinite loop)');

        const allVars = this._allDisplayVars();
        const snap = {};
        for (const [k, v] of Object.entries(allVars)) {
            snap[k] = { value: deepClone(v), display: formatJavaValue(v), type: getJavaType(v) };
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
                    values: info.value.map(v => ({ value: v, display: formatJavaValue(v) })),
                })),
        });
    }

    // Convert Java array syntax `Type[] name` → `Type name[]` so the C
    // interpreter's array decl handler picks it up. Done at the start of
    // every statement dispatch.
    _normalizeJavaArrayDecl(text) {
        return text.replace(
            /^((?:final\s+)?)(int|long|short|char|float|double|boolean|byte|String|Integer|Double|Object)\s*\[\s*\]\s+(\w+)/,
            '$1$2 $3[]'
        );
    }

    // Java type detection: includes String[], int[], etc.
    _isTypeDecl(text) {
        if (super._isTypeDecl(text)) return true;
        // Java array form: Type[] name
        if (/^(?:final\s+)?(?:int|long|short|char|float|double|boolean|byte|String|Integer|Double|Object)\s*\[\s*\]\s+\w/.test(text)) return true;
        return /^(?:final\s+)?(?:String|Integer|Double|Boolean|Character|Long|Object|var|ArrayList|List|HashMap|Map|HashSet|Set)(?:\s*<[^>]*>)?(?:\s*\[\])?\s+\w/.test(text);
    }

    _isTypeKeyword(word) {
        return super._isTypeKeyword(word) || /^(?:String|Integer|Double|Boolean|Long|Character|Object|var)$/.test(word);
    }

    // ── Statement dispatch ─────────────────────────────────────────────

    _execStmt({ text, line }, idx, all) {
        if (!text || text === '{' || text === '}' || text.startsWith('//')) {
            return { type: 'normal' };
        }

        // Normalize Java array syntax before any further dispatch
        text = this._normalizeJavaArrayDecl(text);

        // Class field declarations get filtered at parse time, but be safe
        if (/^(?:public|private|protected)\s+(?:static\s+)?\w/.test(text) && !/^(?:public|private|protected)\s+(?:static\s+)?\w+\s*\(/.test(text)) {
            return { type: 'normal' };
        }

        // System.out.println / print / printf
        if (/^System\.out\.print(?:ln|f)?\s*\(/.test(text)) {
            this._execJavaPrint(text, line);
            return { type: 'normal' };
        }

        // System.err.println — same as System.out for visualization purposes
        if (/^System\.err\.print(?:ln|f)?\s*\(/.test(text)) {
            this._execJavaPrint(text.replace('System.err', 'System.out'), line);
            return { type: 'normal' };
        }

        // For-each: for (T x : arr) — must check before generic for
        if (/^for\s*\(/.test(text)) {
            const fe = this._parseForEach(text);
            if (fe) return this._execForEach(fe, text, line, idx, all);
        }

        // Multiple statements on one line (shared with C handling)
        const stmts = this._splitStatements(text);
        if (stmts.length > 1) {
            for (const s of stmts) {
                const res = this._execStmt({ text: s, line }, 0, []);
                if (res.type !== 'normal') return { ...res, next: idx + 1 };
            }
            return { type: 'normal' };
        }

        // Fall through to C handling for everything else
        return super._execStmt({ text, line }, idx, all);
    }

    // ── System.out.println / print / printf ────────────────────────────

    _execJavaPrint(text, line) {
        // Determine which variant
        const isPrintln = /println/.test(text);
        const isPrintf = /printf/.test(text);

        // Extract args from System.out.println(...)
        const argStart = text.indexOf('(');
        const argEnd = this._findMatchingParen(text, argStart);
        if (argStart === -1 || argEnd === -1) return;
        const argsStr = text.substring(argStart + 1, argEnd);

        const args = argsStr.trim() ? splitArgs(argsStr) : [];

        if (isPrintf) {
            // printf-style
            const fmt = this._eval(args[0]);
            const vals = args.slice(1).map(a => this._eval(a));
            const result = this._sprintfFormat(typeof fmt === 'string' ? fmt : String(fmt), vals);
            this.output += result;
            this._snapshot(line, `printf: ${result.replace(/\n/g, '↵').slice(0, 60)}`, [], 'print');
            return;
        }

        // println / print: evaluate & concat all args
        let outStr = '';
        if (args.length === 0) {
            outStr = '';
        } else {
            // Evaluate the (possibly-concatenated) expression
            const val = this._eval(args[0]);
            outStr = this._toJavaPrintString(val);
        }

        if (isPrintln) outStr += '\n';
        this.output += outStr;
        this._snapshot(line, `println: ${outStr.replace(/\n/g, '↵').slice(0, 60)}`, [], 'print');
    }

    _toJavaPrintString(val) {
        if (val === null || val === undefined) return 'null';
        if (typeof val === 'boolean') return val ? 'true' : 'false';
        if (typeof val === 'string') return val;
        if (Array.isArray(val)) return `[${val.map(v => this._toJavaPrintString(v)).join(', ')}]`;
        return String(val);
    }

    _findMatchingParen(text, startIdx) {
        let depth = 0;
        let inStr = false, strCh = '';
        for (let i = startIdx; i < text.length; i++) {
            const c = text[i];
            if (!inStr && (c === '"' || c === "'")) { inStr = true; strCh = c; continue; }
            if (inStr && c === strCh && text[i - 1] !== '\\') { inStr = false; continue; }
            if (inStr) continue;
            if (c === '(') depth++;
            if (c === ')') { depth--; if (depth === 0) return i; }
        }
        return -1;
    }

    // ── For-each ──────────────────────────────────────────────────────

    _parseForEach(text) {
        const m = text.match(/^for\s*\(\s*(?:final\s+)?([\w<>\[\]]+(?:\s*\[\])?)\s+(\w+)\s*:\s*(.+?)\s*\)\s*\{?(.*)$/);
        if (!m) return null;
        return {
            typeDecl: m[1],
            varName: m[2],
            containerExpr: m[3].trim(),
            sameLineBody: m[4].trim(),
        };
    }

    _execForEach({ typeDecl, varName, containerExpr, sameLineBody }, text, line, idx, all) {
        const container = this._eval(containerExpr);
        let items = [];
        if (Array.isArray(container)) items = container;
        else if (typeof container === 'string') items = container.split('');

        let body, bodyEnd;
        if (sameLineBody && sameLineBody !== '{') {
            body = [{ text: sameLineBody, line }];
            bodyEnd = idx;
        } else {
            ({ body, bodyEnd } = this._extractBlock(idx, all, text));
        }

        let iteration = 0;
        for (const item of items) {
            iteration++;
            this._vars[varName] = item;
            this._snapshot(line, `for-each: ${varName} = ${formatJavaValue(item)} (item ${iteration}/${items.length})`, [varName], 'loop-iteration', { iteration });
            const res = this._execBlock(body);
            if (res.type === 'return') return { ...res, next: bodyEnd + 1 };
            if (res.type === 'break') break;
        }

        delete this._vars[varName];
        this._snapshot(line, `for-each completed (${items.length} items)`, [], 'loop-end');
        return { type: 'normal', next: bodyEnd + 1 };
    }

    // ── Expression evaluation ──────────────────────────────────────────

    _eval(expr) {
        if (expr === undefined || expr === null) return null;
        expr = String(expr).trim();
        if (!expr) return null;

        // Boolean / null
        if (expr === 'true') return true;
        if (expr === 'false') return false;
        if (expr === 'null') return null;

        // String literal
        if (expr.startsWith('"') && expr.endsWith('"') && this._isCompleteString(expr)) {
            return unescapeJavaString(expr.slice(1, -1));
        }

        // Char literal
        if (/^'.'$/.test(expr)) return expr.charCodeAt(1);
        if (/^'\\.'$/.test(expr)) {
            switch (expr[2]) {
                case 'n': return 10; case 't': return 9; case 'r': return 13;
                case '0': return 0; case '\\': return 92; case "'": return 39;
            }
        }

        // Number with suffix
        if (/^-?\d+[lL]$/.test(expr)) return parseInt(expr.slice(0, -1), 10);
        if (/^-?\d+(\.\d+)?[fFdD]$/.test(expr)) return parseFloat(expr.slice(0, -1));

        // Math.abs / Math.max / Math.min / Math.pow / etc.
        if (/^Math\.\w+\(/.test(expr)) {
            const m = expr.match(/^Math\.(\w+)\(([\s\S]*)\)$/);
            if (m) {
                const args = m[2].trim() ? splitArgs(m[2]).map(a => this._eval(a)) : [];
                switch (m[1]) {
                    case 'abs': return Math.abs(Number(args[0]) || 0);
                    case 'max': return Math.max(Number(args[0]) || 0, Number(args[1]) || 0);
                    case 'min': return Math.min(Number(args[0]) || 0, Number(args[1]) || 0);
                    case 'pow': return Math.pow(Number(args[0]) || 0, Number(args[1]) || 0);
                    case 'sqrt': return Math.sqrt(Number(args[0]) || 0);
                    case 'floor': return Math.floor(Number(args[0]) || 0);
                    case 'ceil': return Math.ceil(Number(args[0]) || 0);
                    case 'round': return Math.round(Number(args[0]) || 0);
                    case 'random': return Math.random();
                    case 'log': return Math.log(Number(args[0]) || 0);
                    case 'log10': return Math.log10(Number(args[0]) || 0);
                    case 'sin': return Math.sin(Number(args[0]) || 0);
                    case 'cos': return Math.cos(Number(args[0]) || 0);
                    case 'tan': return Math.tan(Number(args[0]) || 0);
                    case 'PI': return Math.PI;
                    case 'E': return Math.E;
                }
            }
        }

        // Math.PI / Math.E (constants)
        if (expr === 'Math.PI') return Math.PI;
        if (expr === 'Math.E') return Math.E;

        // Integer.parseInt / Double.parseDouble / String.valueOf
        if (/^Integer\.parseInt\(/.test(expr)) {
            const m = expr.match(/Integer\.parseInt\(([^)]+)\)/);
            return m ? parseInt(this._eval(m[1]), 10) || 0 : 0;
        }
        if (/^Double\.parseDouble\(/.test(expr)) {
            const m = expr.match(/Double\.parseDouble\(([^)]+)\)/);
            return m ? parseFloat(this._eval(m[1])) || 0 : 0;
        }
        if (/^String\.valueOf\(/.test(expr)) {
            const m = expr.match(/String\.valueOf\(([^)]+)\)/);
            return m ? String(this._eval(m[1]) ?? '') : '';
        }
        if (/^String\.format\(/.test(expr)) {
            const m = expr.match(/String\.format\(([\s\S]+)\)$/);
            if (m) {
                const args = splitArgs(m[1]);
                const fmt = this._eval(args[0]);
                const vals = args.slice(1).map(a => this._eval(a));
                return this._sprintfFormat(typeof fmt === 'string' ? fmt : String(fmt), vals);
            }
        }

        // Arrays.toString(arr)
        if (/^Arrays\.toString\(/.test(expr)) {
            const m = expr.match(/Arrays\.toString\(([\s\S]+)\)$/);
            if (m) {
                const v = this._eval(m[1]);
                return Array.isArray(v) ? `[${v.join(', ')}]` : String(v);
            }
        }

        // Arrays.sort(arr)
        if (/^Arrays\.sort\(/.test(expr)) {
            const m = expr.match(/Arrays\.sort\(([\s\S]+)\)$/);
            if (m) {
                const argList = splitArgs(m[1]);
                const name = argList[0].trim();
                const v = this._getVar(name);
                if (Array.isArray(v)) {
                    const sorted = [...v].sort((a, b) => Number(a) - Number(b));
                    this._setVar(name, sorted);
                }
                return undefined;
            }
        }

        // new Type[]{...}
        if (/^new\s+\w+\s*\[\s*\]\s*\{/.test(expr)) {
            const m = expr.match(/^new\s+\w+\s*\[\s*\]\s*\{([^}]*)\}/);
            if (m) {
                const inner = m[1].trim();
                if (!inner) return [];
                return splitArgs(inner).map(v => this._eval(v.trim()));
            }
        }

        // new Type[size]
        if (/^new\s+\w+\s*\[/.test(expr)) {
            const m = expr.match(/^new\s+(\w+)\s*\[([^\]]+)\]/);
            if (m) {
                const size = Number(this._eval(m[2])) || 0;
                const fill = m[1] === 'String' ? '' : m[1] === 'boolean' ? false : 0;
                return new Array(size).fill(fill);
            }
        }

        // new ArrayList<>() or new ArrayList<Integer>()
        if (/^new\s+ArrayList\s*<.*>?\s*\(\)/.test(expr)) {
            return [];
        }
        if (/^new\s+\w+\(/.test(expr)) {
            return {}; // generic object
        }

        // Array literal: {1, 2, 3}
        if (expr.startsWith('{') && expr.endsWith('}')) {
            const inner = expr.slice(1, -1).trim();
            if (!inner) return [];
            return splitArgs(inner).map(v => this._eval(v.trim()));
        }

        // arr.length (property, no parens)
        const lenM = expr.match(/^(\w+)\.length$/);
        if (lenM) {
            const v = this._getVar(lenM[1]);
            if (Array.isArray(v)) return v.length;
            if (typeof v === 'string') return v.length;
        }

        // Method call on object: obj.method(args)
        const methCallM = expr.match(/^(\w+)\.(\w+)\s*\(([\s\S]*)\)$/);
        if (methCallM) {
            const [, objName, method, argsStr] = methCallM;
            const obj = this._getVar(objName);
            const argList = argsStr.trim() ? splitArgs(argsStr).map(a => this._eval(a.trim())) : [];

            if (typeof obj === 'string') {
                switch (method) {
                    case 'length': return obj.length;
                    case 'charAt': return obj.charCodeAt(Number(argList[0]) || 0);
                    case 'substring':
                        return argList.length === 1
                            ? obj.substring(Number(argList[0]) || 0)
                            : obj.substring(Number(argList[0]) || 0, Number(argList[1]) || 0);
                    case 'indexOf': return obj.indexOf(typeof argList[0] === 'string' ? argList[0] : String.fromCharCode(argList[0]));
                    case 'lastIndexOf': return obj.lastIndexOf(typeof argList[0] === 'string' ? argList[0] : String.fromCharCode(argList[0]));
                    case 'toUpperCase': return obj.toUpperCase();
                    case 'toLowerCase': return obj.toLowerCase();
                    case 'trim': return obj.trim();
                    case 'replace': return obj.split(String(argList[0])).join(String(argList[1]));
                    case 'split': return obj.split(String(argList[0]));
                    case 'startsWith': return obj.startsWith(String(argList[0]));
                    case 'endsWith': return obj.endsWith(String(argList[0]));
                    case 'contains': return obj.includes(String(argList[0]));
                    case 'equals': return obj === String(argList[0] ?? '');
                    case 'isEmpty': return obj.length === 0;
                    case 'concat': return obj + String(argList[0] ?? '');
                    case 'compareTo': return obj < argList[0] ? -1 : obj > argList[0] ? 1 : 0;
                }
            }

            if (Array.isArray(obj)) {
                switch (method) {
                    case 'length': return obj.length;
                    case 'size': return obj.length;
                    case 'add': {
                        const newArr = [...obj, argList[0]];
                        this._setVar(objName, newArr);
                        return true;
                    }
                    case 'get': return obj[Number(argList[0]) || 0];
                    case 'set': {
                        const newArr = [...obj];
                        newArr[Number(argList[0]) || 0] = argList[1];
                        this._setVar(objName, newArr);
                        return obj[Number(argList[0]) || 0];
                    }
                    case 'remove': {
                        const newArr = [...obj];
                        const removed = newArr.splice(Number(argList[0]) || 0, 1);
                        this._setVar(objName, newArr);
                        return removed[0];
                    }
                    case 'isEmpty': return obj.length === 0;
                    case 'contains': return obj.includes(argList[0]);
                    case 'indexOf': return obj.indexOf(argList[0]);
                    case 'clear': {
                        this._setVar(objName, []);
                        return undefined;
                    }
                    case 'toArray': return [...obj];
                    case 'toString': return `[${obj.join(', ')}]`;
                }
            }

            // System / etc. — fallback
            if (objName === 'System' && method === 'currentTimeMillis') return Date.now();
        }

        // Field access: obj.field
        const fieldM = expr.match(/^(\w+)\.(\w+)$/);
        if (fieldM) {
            const obj = this._getVar(fieldM[1]);
            if (obj && typeof obj === 'object' && !Array.isArray(obj) && fieldM[2] in obj) return obj[fieldM[2]];
        }

        // String concatenation with + : detect any + at depth 0 with string operands
        const plusIdx = this._findOuterPlusForJavaConcat(expr);
        if (plusIdx !== -1) {
            const left = this._eval(expr.slice(0, plusIdx));
            const right = this._eval(expr.slice(plusIdx + 1));
            if (typeof left === 'string' || typeof right === 'string') {
                return this._toJavaPrintString(left) + this._toJavaPrintString(right);
            }
            return (Number(left) || 0) + (Number(right) || 0);
        }

        // Fall through to C eval for arithmetic / comparison / arrays / variables
        return super._eval(expr);
    }

    _isCompleteString(expr) {
        // Make sure the leading " and trailing " are actually a single string literal
        // (not e.g. "a" + "b" — same first/last char but multiple parts)
        let inStr = false, strCh = '';
        for (let i = 0; i < expr.length; i++) {
            const c = expr[i];
            if (!inStr && c === '"') { inStr = true; strCh = c; continue; }
            if (inStr && c === strCh && expr[i - 1] !== '\\') {
                inStr = false;
                if (i !== expr.length - 1) return false; // closes early
            }
        }
        return !inStr; // true if string ends at the end of expr
    }

    _findOuterPlusForJavaConcat(expr) {
        // Find the LEFTMOST + at depth 0 — we want left-associative split with
        // leftmost first so each call recurses onto smaller right-hand pieces.
        let depth = 0, inStr = false, strCh = '';
        let hasString = false;
        // First pass: detect if the expression contains a string literal at depth 0
        for (let i = 0; i < expr.length; i++) {
            const c = expr[i];
            if (!inStr && c === '"') { inStr = true; strCh = c; if (depth === 0) hasString = true; continue; }
            if (inStr && c === strCh && expr[i - 1] !== '\\') { inStr = false; continue; }
            if (inStr) continue;
            if (c === '(' || c === '[') depth++;
            if (c === ')' || c === ']') depth--;
        }
        if (!hasString) return -1; // no string concat needed

        depth = 0; inStr = false; strCh = '';
        for (let i = 0; i < expr.length; i++) {
            const c = expr[i];
            if (!inStr && c === '"') { inStr = true; strCh = c; continue; }
            if (inStr && c === strCh && expr[i - 1] !== '\\') { inStr = false; continue; }
            if (inStr) continue;
            if (c === '(' || c === '[') depth++;
            if (c === ')' || c === ']') depth--;
            if (depth === 0 && c === '+' && i > 0) {
                // Skip ++ and += and unary +
                if (expr[i - 1] === '+' || expr[i + 1] === '+') continue;
                if (expr[i - 1] === '=') continue;
                if (expr[i + 1] === '=') continue;
                if ('(<>=!+-*/%&|^,'.includes(expr[i - 1])) continue;
                return i;
            }
        }
        return -1;
    }

    // Override printf formatter to not double-unescape
    _sprintfFormat(fmt, vals) {
        let res = '', vi = 0, i = 0;
        // Don't re-unescape — Java string already has actual newlines from _eval
        while (i < fmt.length) {
            if (fmt[i] !== '%') { res += fmt[i++]; continue; }
            i++;
            while (i < fmt.length && '+-0 #'.includes(fmt[i])) i++;
            let width = ''; while (i < fmt.length && /\d/.test(fmt[i])) width += fmt[i++];
            let prec = ''; if (fmt[i] === '.') { i++; while (i < fmt.length && /\d/.test(fmt[i])) prec += fmt[i++]; }
            const conv = fmt[i++];
            const v = vals[vi++];
            const w = width ? parseInt(width) : 0;
            switch (conv) {
                case 'd': case 'i': {
                    const s = String(Math.trunc(Number(v) || 0));
                    res += w > s.length ? s.padStart(w) : s;
                    break;
                }
                case 'f': res += (Number(v) || 0).toFixed(prec ? parseInt(prec) : 6); break;
                case 's': {
                    let s = v === null || v === undefined ? 'null' : this._toJavaPrintString(v);
                    if (prec) s = s.slice(0, parseInt(prec));
                    res += w > s.length ? s.padStart(w) : s;
                    break;
                }
                case 'c': res += typeof v === 'number' ? String.fromCharCode(v) : String(v ?? '')[0] || ''; break;
                case 'b': res += String(!!v); break;
                case 'n': res += '\n'; vi--; break;
                case 'x': res += (Math.trunc(Number(v) || 0)).toString(16); break;
                case 'X': res += (Math.trunc(Number(v) || 0)).toString(16).toUpperCase(); break;
                case '%': res += '%'; vi--; break;
                default: res += '%' + conv;
            }
        }
        return res;
    }

    // ── Public run ─────────────────────────────────────────────────────

    run() {
        if (!this.functions['main']) {
            return { steps: [], error: { message: 'No main() method found', line: 1 }, output: '' };
        }
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
        return { steps: this.steps, error: null, output: this.output };
    }
}

// ── Public export ─────────────────────────────────────────────────────────

export function executeJava(source) {
    try {
        const interp = new JavaInterpreter(source);
        return interp.run();
    } catch (e) {
        return {
            steps: [],
            error: { message: e.message || 'Java execution error', line: 1 },
            output: '',
        };
    }
}

// Re-exports for backward compatibility
export { formatJavaValue as formatValue, getJavaType as getType };
