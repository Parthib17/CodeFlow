/**
 * C# Subset Interpreter
 *
 * C# and Java are syntactically very close, so we extend the Java interpreter
 * and only patch the bits that diverge:
 *   - Wrapper stripping: `using System;` lines, `namespace Foo { … }`,
 *     `class Program { … }`, and `static void Main(string[] args)` get removed
 *     while preserving line numbers.
 *   - `Console.WriteLine(...)` / `Console.Write(...)` map to print.
 *   - `foreach (var x in arr)` is recognized in addition to Java's `for ( : )`.
 *   - `var` declarations with type inference.
 *   - `$"..."` string interpolation is expanded.
 *
 * Beyond that we lean on JavaInterpreter for control flow, expression eval,
 * arrays, methods, etc.
 */

import { CInterpreter, deepClone, splitArgs } from './cExecutor.js';

// ── C#-flavored display helpers ────────────────────────────────────────

function getCSharpType(val) {
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'boolean') return 'bool';
    if (typeof val === 'string') return 'string';
    if (typeof val === 'number') return Number.isInteger(val) ? 'int' : 'double';
    if (Array.isArray(val)) return 'array';
    return typeof val;
}

function formatCSharpValue(val) {
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'boolean') return val ? 'True' : 'False';
    if (typeof val === 'string') return `"${val}"`;
    if (Array.isArray(val)) return `[${val.map(formatCSharpValue).join(', ')}]`;
    if (typeof val === 'number') return String(val);
    return String(val);
}

function unescapeCSharpString(s) {
    return s
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .replace(/\\\\/g, '\\')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\0/g, '\0');
}

// ── Wrapper stripping ──────────────────────────────────────────────────

function stripCSharpWrapper(source) {
    const rawLines = source.split('\n');
    const out = []; // mainBody { text, line }
    const methods = []; // user-defined static methods
    let depth = 0; // overall brace depth
    let inMain = false;
    let mainBraceDepth = 0;
    let currentMethod = null;
    let methodBraceDepth = 0;
    let foundClass = false;

    // Track braces ignoring strings/chars
    function countBraces(text) {
        let openB = 0, closeB = 0;
        let inStr = false, strCh = '';
        for (let k = 0; k < text.length; k++) {
            const c = text[k];
            if (!inStr && (c === '"' || c === "'")) { inStr = true; strCh = c; continue; }
            if (inStr && c === strCh && text[k - 1] !== '\\') { inStr = false; continue; }
            if (inStr) continue;
            if (c === '{') openB++;
            if (c === '}') closeB++;
        }
        return { openB, closeB };
    }

    for (let i = 0; i < rawLines.length; i++) {
        const text = rawLines[i].trim();

        // skip directives / comments
        if (!text) continue;
        if (text.startsWith('//')) continue;
        if (text.startsWith('using ')) continue;
        if (text.startsWith('namespace ')) {
            const { openB, closeB } = countBraces(text);
            depth += openB - closeB;
            continue;
        }

        const { openB, closeB } = countBraces(text);

        // Class declaration line — enter the class body
        const classMatch = text.match(/^(?:public\s+|internal\s+|private\s+|static\s+|partial\s+|abstract\s+|sealed\s+)*class\s+\w/);
        if (classMatch && !foundClass) {
            foundClass = true;
            depth += openB - closeB;
            continue;
        }

        // Inside class but not yet in a method
        if (foundClass && !inMain && !currentMethod) {
            // Method header: [modifiers] ReturnType Name(params) [{]
            const methodHeader = text.match(/^(?:(?:public|private|protected|internal|static|virtual|override|sealed|async|extern)\s+)*([\w<>\[\],\s]+?)\s+(\w+)\s*\(([^)]*)\)\s*\{?\s*$/);
            if (methodHeader) {
                const returnType = methodHeader[1].trim();
                const name = methodHeader[2];
                const paramsStr = methodHeader[3];

                if (name === 'Main' || name === 'main') {
                    inMain = true;
                    mainBraceDepth = openB;
                    depth += openB - closeB;
                    continue;
                }

                const params = paramsStr.trim()
                    ? splitArgs(paramsStr).map(p => {
                        const m = p.trim().match(/^(?:(?:ref|out|in|params)\s+)?([\w<>\[\],\s]+)\s+(\w+)$/);
                        return m
                            ? { type: m[1].trim(), name: m[2] }
                            : { type: 'object', name: p.trim() };
                    })
                    : [];

                currentMethod = { name, params, returnType, body: [], headerLine: i };
                methodBraceDepth = openB;
                if (closeB >= openB && openB > 0) {
                    methods.push(currentMethod);
                    currentMethod = null;
                }
                continue;
            }

            // Skip stray lines inside class body (fields, properties, etc.)
            depth += openB - closeB;
            continue;
        }

        if (inMain) {
            mainBraceDepth += openB - closeB;
            if (mainBraceDepth <= 0 && closeB > 0) {
                inMain = false;
                continue;
            }
            const elseSplit = text.match(/^\}\s*(else\b[\s\S]*)$/);
            if (elseSplit) {
                out.push({ text: '}', line: i });
                out.push({ text: elseSplit[1].trim(), line: i });
            } else {
                out.push({ text, line: i });
            }
            continue;
        }

        if (currentMethod) {
            methodBraceDepth += openB - closeB;
            if (methodBraceDepth <= 0 && closeB > 0) {
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

        // Top-level statements (C# 9+ top-level program style)
        if (!foundClass) {
            const elseSplit = text.match(/^\}\s*(else\b[\s\S]*)$/);
            if (elseSplit) {
                out.push({ text: '}', line: i });
                out.push({ text: elseSplit[1].trim(), line: i });
            } else {
                out.push({ text, line: i });
            }
        }
    }

    return { mainBody: out, methods };
}

// ── CSharpInterpreter ──────────────────────────────────────────────────

class CSharpInterpreter extends CInterpreter {
    constructor(source) {
        super('');
        this.source = source;
        const { mainBody, methods } = stripCSharpWrapper(source);
        this.mainBody = mainBody;

        for (const m of methods) {
            this.functions[m.name] = m;
        }
        this.functions['main'] = {
            name: 'main',
            params: [],
            returnType: 'void',
            body: mainBody,
            headerLine: mainBody.length > 0 ? mainBody[0].line - 1 : 0,
        };
        // Alias Main → main for explicit calls
        if (!this.functions['Main']) this.functions['Main'] = this.functions['main'];
    }

    _snapshot(line, description, changedVars = [], flowType = null, flowDetail = null) {
        this.stepCount++;
        if (this.stepCount > 5000) throw new Error('Maximum execution steps exceeded (possible infinite loop)');

        const allVars = this._allDisplayVars();
        const snap = {};
        for (const [k, v] of Object.entries(allVars)) {
            snap[k] = { value: deepClone(v), display: formatCSharpValue(v), type: getCSharpType(v) };
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
                    values: info.value.map(v => ({ value: v, display: formatCSharpValue(v) })),
                })),
        });
    }

    _isTypeKeyword(word) {
        return super._isTypeKeyword(word) ||
            /^(?:string|object|var|decimal|byte|sbyte|ushort|uint|ulong|nint|nuint|dynamic|String|Object)$/.test(word);
    }

    _isTypeDecl(text) {
        if (super._isTypeDecl(text)) return true;
        if (/^(?:int|long|short|byte|sbyte|ushort|uint|ulong|float|double|decimal|bool|char|string|object|var)\s*\[\s*\]\s+\w/.test(text)) return true;
        return /^(?:string|object|decimal|var|String|Object|byte|sbyte|ushort|uint|ulong|nint|nuint|List|Dictionary|HashSet|Queue|Stack)(?:\s*<[^>]*>)?(?:\s*\[\])?\s+\w/.test(text);
    }

    _normalizeCSharpArrayDecl(text) {
        // `int[] arr` → `int arr[]`  (CInterpreter's array regex shape)
        return text.replace(
            /^((?:const\s+)?)(int|long|short|char|float|double|bool|byte|sbyte|ushort|uint|ulong|string|object|decimal|var)\s*\[\s*\]\s+(\w+)/,
            '$1$2 $3[]'
        );
    }

    // ── Statement dispatch ────────────────────────────────────────────

    _execStmt({ text, line }, idx, all) {
        if (!text || text === '{' || text === '}' || text.startsWith('//')) {
            return { type: 'normal' };
        }

        text = this._normalizeCSharpArrayDecl(text);

        // Skip access-modifier-only field declarations
        if (/^(?:public|private|protected|internal|static)\s+\w/.test(text) &&
            !/^(?:public|private|protected|internal|static)\s+\w+\s*\(/.test(text)) {
            return { type: 'normal' };
        }

        // Console.WriteLine / Write / Error.WriteLine
        if (/^Console\.(WriteLine|Write|WriteError)\s*\(/.test(text)) {
            this._execCSharpPrint(text, line);
            return { type: 'normal' };
        }
        if (/^Console\.Error\.(WriteLine|Write)\s*\(/.test(text)) {
            this._execCSharpPrint(text.replace('Console.Error', 'Console'), line);
            return { type: 'normal' };
        }

        // foreach (var x in arr)
        if (/^foreach\s*\(/.test(text)) {
            return this._execForeach(text, line, idx, all);
        }

        // Multiple statements on one line
        const stmts = this._splitStatements(text);
        if (stmts.length > 1) {
            for (const s of stmts) {
                const res = this._execStmt({ text: s, line }, 0, []);
                if (res.type !== 'normal') return { ...res, next: idx + 1 };
            }
            return { type: 'normal' };
        }

        return super._execStmt({ text, line }, idx, all);
    }

    // ── Console.WriteLine / Console.Write ──────────────────────────────

    _execCSharpPrint(text, line) {
        const isWriteLine = /WriteLine|WriteError/.test(text);
        const argStart = text.indexOf('(');
        const argEnd = this._findMatchingParen(text, argStart);
        if (argStart === -1 || argEnd === -1) return;
        const argsStr = text.substring(argStart + 1, argEnd);
        const args = argsStr.trim() ? splitArgs(argsStr) : [];

        let outStr = '';
        if (args.length === 0) {
            outStr = '';
        } else if (args.length === 1) {
            const val = this._eval(args[0]);
            outStr = this._toCSharpPrintString(val);
        } else {
            // Console.WriteLine("format {0} {1}", a, b) — composite format
            const fmtVal = this._eval(args[0]);
            const fmt = typeof fmtVal === 'string' ? fmtVal : String(fmtVal ?? '');
            const vals = args.slice(1).map(a => this._eval(a));
            outStr = this._compositeFormat(fmt, vals);
        }

        if (isWriteLine) outStr += '\n';
        this.output += outStr;
        const variant = isWriteLine ? 'WriteLine' : 'Write';
        this._snapshot(line, `${variant}: ${outStr.replace(/\n/g, '↵').slice(0, 60)}`, [], 'print');
    }

    _toCSharpPrintString(val) {
        if (val === null || val === undefined) return '';
        if (typeof val === 'boolean') return val ? 'True' : 'False';
        if (typeof val === 'string') return val;
        if (Array.isArray(val)) return `System.${val.map(v => this._toCSharpPrintString(v)).join(', ')}[]`;
        return String(val);
    }

    _compositeFormat(fmt, vals) {
        // C# composite: "Hello {0}, you are {1}"
        return fmt.replace(/\{(\d+)(?::([^}]+))?\}/g, (_, idxStr, fmtSpec) => {
            const v = vals[parseInt(idxStr, 10)];
            if (v === null || v === undefined) return '';
            if (fmtSpec) {
                if (/^F\d*$/i.test(fmtSpec)) {
                    const prec = parseInt(fmtSpec.slice(1) || '2', 10);
                    return (Number(v) || 0).toFixed(prec);
                }
                if (/^X\d*$/i.test(fmtSpec)) {
                    return (Math.trunc(Number(v) || 0)).toString(16);
                }
                if (/^D\d*$/i.test(fmtSpec)) {
                    const w = parseInt(fmtSpec.slice(1) || '0', 10);
                    return String(Math.trunc(Number(v) || 0)).padStart(w, '0');
                }
            }
            return this._toCSharpPrintString(v);
        });
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

    // ── foreach ────────────────────────────────────────────────────────

    _execForeach(text, line, idx, all) {
        // foreach (var x in arr) [{ body }]
        const m = text.match(/^foreach\s*\(\s*(?:(?:var|[\w<>\[\],\s]+))\s+(\w+)\s+in\s+(.+?)\s*\)\s*\{?(.*)$/);
        if (!m) return { type: 'normal' };
        const varName = m[1];
        const containerExpr = m[2].trim();
        const sameLineBody = m[3].trim();

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
            this._snapshot(line, `foreach: ${varName} = ${formatCSharpValue(item)} (${iteration}/${items.length})`, [varName], 'loop-iteration', { iteration });
            const res = this._execBlock(body);
            if (res.type === 'return') return { ...res, next: bodyEnd + 1 };
            if (res.type === 'break') break;
        }
        delete this._vars[varName];
        this._snapshot(line, `foreach completed (${iteration} iterations)`, [], 'loop-end');
        return { type: 'normal', next: bodyEnd + 1 };
    }

    // ── Expression evaluation ─────────────────────────────────────────

    _eval(expr) {
        if (expr === undefined || expr === null) return null;
        expr = String(expr).trim();
        if (!expr) return null;

        if (expr === 'true') return true;
        if (expr === 'false') return false;
        if (expr === 'null') return null;

        // Verbatim string @"..."
        if (expr.startsWith('@"') && expr.endsWith('"') && expr.length >= 3) {
            return expr.slice(2, -1).replace(/""/g, '"');
        }

        // Interpolated string $"..."
        if (expr.startsWith('$"') && expr.endsWith('"') && expr.length >= 3) {
            return this._evalInterpolated(expr.slice(2, -1));
        }

        // Plain string
        if (expr.startsWith('"') && expr.endsWith('"') && this._isCompleteString(expr)) {
            return unescapeCSharpString(expr.slice(1, -1));
        }

        // Char literal
        if (/^'.'$/.test(expr)) return expr.charCodeAt(1);
        if (/^'\\.'$/.test(expr)) {
            switch (expr[2]) {
                case 'n': return 10; case 't': return 9; case 'r': return 13;
                case '0': return 0; case '\\': return 92; case "'": return 39;
            }
        }

        // Numbers with suffix
        if (/^-?\d+[lLuU]+$/.test(expr)) return parseInt(expr.replace(/[lLuU]+$/, ''), 10);
        if (/^-?\d+(\.\d+)?[fFdDmM]$/.test(expr)) return parseFloat(expr.slice(0, -1));

        // Math.*
        let m = expr.match(/^Math\.(\w+)\(([\s\S]*)\)\s*$/);
        if (m) {
            const args = m[2].trim() ? splitArgs(m[2]).map(a => this._eval(a)) : [];
            switch (m[1]) {
                case 'Abs': return Math.abs(Number(args[0]) || 0);
                case 'Max': return Math.max(Number(args[0]) || 0, Number(args[1]) || 0);
                case 'Min': return Math.min(Number(args[0]) || 0, Number(args[1]) || 0);
                case 'Pow': return Math.pow(Number(args[0]) || 0, Number(args[1]) || 0);
                case 'Sqrt': return Math.sqrt(Number(args[0]) || 0);
                case 'Floor': return Math.floor(Number(args[0]) || 0);
                case 'Ceiling': return Math.ceil(Number(args[0]) || 0);
                case 'Round': return Math.round(Number(args[0]) || 0);
                case 'Log': return Math.log(Number(args[0]) || 0);
                case 'Log10': return Math.log10(Number(args[0]) || 0);
                case 'Sin': return Math.sin(Number(args[0]) || 0);
                case 'Cos': return Math.cos(Number(args[0]) || 0);
                case 'Tan': return Math.tan(Number(args[0]) || 0);
                case 'PI': return Math.PI;
                case 'E': return Math.E;
            }
        }
        if (expr === 'Math.PI') return Math.PI;
        if (expr === 'Math.E') return Math.E;

        // int.Parse / double.Parse / int.TryParse / etc
        m = expr.match(/^(?:int|Int32)\.Parse\s*\(([\s\S]+)\)\s*$/);
        if (m) return parseInt(this._eval(m[1]) ?? '', 10) || 0;
        m = expr.match(/^(?:double|Double)\.Parse\s*\(([\s\S]+)\)\s*$/);
        if (m) return parseFloat(this._eval(m[1]) ?? '') || 0;

        // string.Join(sep, arr)  /  String.Join
        m = expr.match(/^(?:string|String)\.Join\s*\(([\s\S]+)\)\s*$/);
        if (m) {
            const args = splitArgs(m[1]);
            const sep = this._eval(args[0]);
            const arr = this._eval(args[1]);
            if (Array.isArray(arr)) return arr.map(v => this._toCSharpPrintString(v)).join(String(sep ?? ''));
            return '';
        }
        // string.Format
        m = expr.match(/^(?:string|String)\.Format\s*\(([\s\S]+)\)\s*$/);
        if (m) {
            const args = splitArgs(m[1]);
            const fmt = this._eval(args[0]);
            const vals = args.slice(1).map(a => this._eval(a));
            return this._compositeFormat(typeof fmt === 'string' ? fmt : String(fmt ?? ''), vals);
        }

        // new int[]{1,2,3}  /  new int[] { 1, 2, 3 }
        m = expr.match(/^new\s+\w+\s*\[\s*\]\s*\{([\s\S]*)\}\s*$/);
        if (m) {
            const inner = m[1].trim();
            if (!inner) return [];
            return splitArgs(inner).map(v => this._eval(v.trim()));
        }
        // new int[size]
        m = expr.match(/^new\s+(\w+)\s*\[([^\]]+)\]\s*$/);
        if (m) {
            const size = Number(this._eval(m[2])) || 0;
            const fill = m[1] === 'string' ? '' : m[1] === 'bool' ? false : 0;
            return new Array(size).fill(fill);
        }
        // new List<int>() / new List<int>{1,2,3}
        m = expr.match(/^new\s+List\s*<[^>]+>\s*\(\s*\)\s*$/);
        if (m) return [];
        m = expr.match(/^new\s+List\s*<[^>]+>\s*\{([\s\S]*)\}\s*$/);
        if (m) {
            const inner = m[1].trim();
            if (!inner) return [];
            return splitArgs(inner).map(v => this._eval(v.trim()));
        }
        // Generic constructor → object
        m = expr.match(/^new\s+\w+\s*\(/);
        if (m) return {};

        // Array literal {1,2,3} (used in initializers)
        if (expr.startsWith('{') && expr.endsWith('}')) {
            const inner = expr.slice(1, -1).trim();
            if (!inner) return [];
            return splitArgs(inner).map(v => this._eval(v.trim()));
        }

        // arr.Length (property)
        m = expr.match(/^(\w+)\.Length\s*$/);
        if (m) {
            const v = this._getVar(m[1]);
            if (Array.isArray(v) || typeof v === 'string') return v.length;
        }
        m = expr.match(/^(\w+)\.Count\s*$/);
        if (m) {
            const v = this._getVar(m[1]);
            if (Array.isArray(v)) return v.length;
        }

        // Method call: obj.method(args)
        m = expr.match(/^(\w+)\.(\w+)\s*\(([\s\S]*)\)\s*$/);
        if (m) {
            const objName = m[1], method = m[2], argsStr = m[3];
            const obj = this._getVar(objName);
            const args = argsStr.trim() ? splitArgs(argsStr).map(a => this._eval(a.trim())) : [];

            if (typeof obj === 'string') {
                switch (method) {
                    case 'Length': return obj.length;
                    case 'ToUpper': return obj.toUpperCase();
                    case 'ToLower': return obj.toLowerCase();
                    case 'Trim': return obj.trim();
                    case 'Substring':
                        return args.length === 1
                            ? obj.substring(Number(args[0]) || 0)
                            : obj.substring(Number(args[0]) || 0, (Number(args[0]) || 0) + (Number(args[1]) || 0));
                    case 'IndexOf': return obj.indexOf(typeof args[0] === 'string' ? args[0] : String.fromCharCode(args[0]));
                    case 'Contains': return obj.includes(String(args[0] ?? ''));
                    case 'StartsWith': return obj.startsWith(String(args[0] ?? ''));
                    case 'EndsWith': return obj.endsWith(String(args[0] ?? ''));
                    case 'Replace': return obj.split(String(args[0] ?? '')).join(String(args[1] ?? ''));
                    case 'Split': return obj.split(String(args[0] ?? ''));
                    case 'Equals': return obj === String(args[0] ?? '');
                }
            }

            if (Array.isArray(obj)) {
                switch (method) {
                    case 'Length': case 'Count': return obj.length;
                    case 'Add': {
                        this._setVar(objName, [...obj, args[0]]);
                        return undefined;
                    }
                    case 'Remove': {
                        const newArr = obj.filter(x => x !== args[0]);
                        this._setVar(objName, newArr);
                        return obj.length !== newArr.length;
                    }
                    case 'RemoveAt': {
                        const newArr = [...obj];
                        newArr.splice(Number(args[0]) || 0, 1);
                        this._setVar(objName, newArr);
                        return undefined;
                    }
                    case 'Contains': return obj.includes(args[0]);
                    case 'IndexOf': return obj.indexOf(args[0]);
                    case 'Clear': {
                        this._setVar(objName, []);
                        return undefined;
                    }
                    case 'ToArray': return [...obj];
                    case 'Sort': {
                        this._setVar(objName, [...obj].sort((a, b) => Number(a) - Number(b)));
                        return undefined;
                    }
                    case 'Reverse': {
                        this._setVar(objName, [...obj].reverse());
                        return undefined;
                    }
                    case 'First': return obj[0];
                    case 'Last': return obj[obj.length - 1];
                    case 'Sum': return obj.reduce((a, b) => Number(a) + Number(b), 0);
                    case 'Min': return obj.length ? Math.min(...obj.map(Number)) : null;
                    case 'Max': return obj.length ? Math.max(...obj.map(Number)) : null;
                }
            }
        }

        // Array.Sort(arr) static
        m = expr.match(/^Array\.Sort\s*\(([\s\S]+)\)\s*$/);
        if (m) {
            const argList = splitArgs(m[1]);
            const name = argList[0].trim();
            const v = this._getVar(name);
            if (Array.isArray(v)) {
                this._setVar(name, [...v].sort((a, b) => Number(a) - Number(b)));
            }
            return undefined;
        }

        // String concatenation with + (when at least one operand is a string)
        const plusIdx = this._findOuterPlusForCSharpConcat(expr);
        if (plusIdx !== -1) {
            const left = this._eval(expr.slice(0, plusIdx));
            const right = this._eval(expr.slice(plusIdx + 1));
            if (typeof left === 'string' || typeof right === 'string') {
                return this._toCSharpPrintString(left) + this._toCSharpPrintString(right);
            }
            return (Number(left) || 0) + (Number(right) || 0);
        }

        return super._eval(expr);
    }

    _evalInterpolated(body) {
        // Walk through, replacing `{expr}` with eval'd values.
        // Supports `{expr:format}` (basic).
        let res = '';
        let i = 0;
        while (i < body.length) {
            const c = body[i];
            if (c === '{' && body[i + 1] === '{') { res += '{'; i += 2; continue; }
            if (c === '}' && body[i + 1] === '}') { res += '}'; i += 2; continue; }
            if (c === '{') {
                let depth = 1, end = i + 1;
                while (end < body.length && depth > 0) {
                    if (body[end] === '{') depth++;
                    else if (body[end] === '}') { depth--; if (depth === 0) break; }
                    end++;
                }
                const inner = body.substring(i + 1, end);
                const colonIdx = this._findFormatColon(inner);
                let exprStr = inner;
                let fmtSpec = '';
                if (colonIdx !== -1) {
                    exprStr = inner.substring(0, colonIdx);
                    fmtSpec = inner.substring(colonIdx + 1);
                }
                const v = this._eval(exprStr);
                if (fmtSpec) {
                    if (/^F\d*$/i.test(fmtSpec)) {
                        const prec = parseInt(fmtSpec.slice(1) || '2', 10);
                        res += (Number(v) || 0).toFixed(prec);
                    } else if (/^X\d*$/i.test(fmtSpec)) {
                        res += (Math.trunc(Number(v) || 0)).toString(16);
                    } else if (/^D\d*$/i.test(fmtSpec)) {
                        const w = parseInt(fmtSpec.slice(1) || '0', 10);
                        res += String(Math.trunc(Number(v) || 0)).padStart(w, '0');
                    } else {
                        res += this._toCSharpPrintString(v);
                    }
                } else {
                    res += this._toCSharpPrintString(v);
                }
                i = end + 1;
                continue;
            }
            // Process escape sequences
            if (c === '\\' && i + 1 < body.length) {
                switch (body[i + 1]) {
                    case 'n': res += '\n'; i += 2; continue;
                    case 't': res += '\t'; i += 2; continue;
                    case 'r': res += '\r'; i += 2; continue;
                    case '\\': res += '\\'; i += 2; continue;
                    case '"': res += '"'; i += 2; continue;
                }
            }
            res += c;
            i++;
        }
        return res;
    }

    _findFormatColon(inner) {
        // Find the first `:` not inside parens/brackets — that's the format-spec separator
        let depth = 0;
        for (let i = 0; i < inner.length; i++) {
            const c = inner[i];
            if (c === '(' || c === '[' || c === '{') depth++;
            else if (c === ')' || c === ']' || c === '}') depth--;
            else if (depth === 0 && c === ':') return i;
        }
        return -1;
    }

    _isCompleteString(expr) {
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

    _findOuterPlusForCSharpConcat(expr) {
        let depth = 0, inStr = false, strCh = '';
        let hasString = false;
        for (let i = 0; i < expr.length; i++) {
            const c = expr[i];
            if (!inStr && c === '"') { inStr = true; strCh = c; if (depth === 0) hasString = true; continue; }
            if (inStr && c === strCh && expr[i - 1] !== '\\') { inStr = false; continue; }
            if (inStr) continue;
            if (c === '(' || c === '[') depth++;
            if (c === ')' || c === ']') depth--;
        }
        if (!hasString) return -1;

        depth = 0; inStr = false; strCh = '';
        for (let i = 0; i < expr.length; i++) {
            const c = expr[i];
            if (!inStr && c === '"') { inStr = true; strCh = c; continue; }
            if (inStr && c === strCh && expr[i - 1] !== '\\') { inStr = false; continue; }
            if (inStr) continue;
            if (c === '(' || c === '[') depth++;
            if (c === ')' || c === ']') depth--;
            if (depth === 0 && c === '+' && i > 0) {
                if (expr[i - 1] === '+' || expr[i + 1] === '+') continue;
                if (expr[i - 1] === '=') continue;
                if (expr[i + 1] === '=') continue;
                if ('(<>=!+-*/%&|^,'.includes(expr[i - 1])) continue;
                return i;
            }
        }
        return -1;
    }

    run() {
        if (!this.functions['main']) {
            return { steps: [], error: { message: 'No Main() method found', line: 1 }, output: '' };
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

// ── Public export ───────────────────────────────────────────────────────

export function executeCSharp(source) {
    try {
        const interp = new CSharpInterpreter(source);
        return interp.run();
    } catch (e) {
        return {
            steps: [],
            error: { message: e.message || 'C# execution error', line: 1 },
            output: '',
        };
    }
}
