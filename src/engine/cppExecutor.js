/**
 * C++ Subset Interpreter
 * Extends the C interpreter with:
 *   - cout / cin
 *   - std::vector<T>  (push_back, pop_back, size, empty, clear, front, back, sort)
 *   - std::string     (length, size, substr, find, append, push_back, at, empty)
 *   - Range-based for: for (T x : container) { ... }
 *   - auto keyword
 *   - pair<T1,T2>  — .first / .second
 *   - STL algorithms: sort, reverse, min_element, max_element, find
 *   - nullptr
 */

import { CInterpreter, deepClone, formatValue, getType, splitArgs } from './cExecutor.js';

const MAX_STEPS = 5000;
const MAX_CALL_DEPTH = 40;

// ── C++ value helpers ─────────────────────────────────────────────────────

function formatCppValue(val) {
    if (val && typeof val === 'object' && val.__type === 'vector') {
        return `[${val.data.map(formatCppValue).join(', ')}]`;
    }
    if (val && typeof val === 'object' && val.__type === 'pair') {
        return `(${formatCppValue(val.first)}, ${formatCppValue(val.second)})`;
    }
    if (val && typeof val === 'object' && val.__type === 'string') {
        return `"${val.data}"`;
    }
    return formatValue(val);
}

function getCppType(val) {
    if (val && typeof val === 'object' && val.__type) return val.__type;
    if (Array.isArray(val)) return 'array';
    return getType(val);
}

function makeVector(data = []) {
    return { __type: 'vector', data: [...data] };
}

function makeString(s = '') {
    return { __type: 'string', data: String(s) };
}

function makePair(first, second) {
    return { __type: 'pair', first, second };
}

function isVector(v) {
    return v && typeof v === 'object' && v.__type === 'vector';
}

function isCppString(v) {
    return v && typeof v === 'object' && v.__type === 'string';
}

// ── CppInterpreter (extends CInterpreter) ─────────────────────────────────

class CppInterpreter extends CInterpreter {
    constructor(source) {
        super(source);
    }

    // Override snapshot to handle vector display
    _snapshot(line, description, changedVars = [], flowType = null, flowDetail = null) {
        this.stepCount++;
        if (this.stepCount > MAX_STEPS) throw new Error('Maximum execution steps exceeded (possible infinite loop)');

        const allVars = this._allDisplayVars();
        const snap = {};
        for (const [k, v] of Object.entries(allVars)) {
            snap[k] = {
                value: this._toJsonable(v),
                display: formatCppValue(v),
                type: getCppType(v),
            };
        }

        if (changedVars.length === 0) {
            for (const k of Object.keys(snap)) {
                const prev = this.prevSnapshot[k];
                if (!prev || prev.display !== snap[k].display) changedVars.push(k);
            }
        }
        this.prevSnapshot = snap;

        // Build dataStructures for vectors and arrays
        const ds = [];
        for (const [name, info] of Object.entries(snap)) {
            if (Array.isArray(info.value)) {
                ds.push({ name, type: 'array', values: info.value.map(v => ({ value: v, display: formatValue(v) })) });
            } else if (info.type === 'vector' && Array.isArray(info.value?.data || info.value)) {
                const data = (info.value?.data) || info.value || [];
                ds.push({ name, type: 'array', values: data.map(v => ({ value: v, display: formatValue(v) })) });
            }
        }

        this.steps.push({
            step: this.steps.length + 1,
            line: line + 1,
            description,
            variables: snap,
            changedVars,
            output: this.output,
            flowType,
            flowDetail,
            dataStructures: ds,
        });
    }

    _toJsonable(val) {
        if (val === null || val === undefined) return null;
        if (isVector(val)) return { __type: 'vector', data: val.data.map(v => this._toJsonable(v)) };
        if (isCppString(val)) return { __type: 'string', data: val.data };
        if (Array.isArray(val)) return val.map(v => this._toJsonable(v));
        if (typeof val === 'object' && val.__type === 'pair') return { __type: 'pair', first: this._toJsonable(val.first), second: this._toJsonable(val.second) };
        if (typeof val === 'object') {
            const out = {};
            for (const k in val) out[k] = this._toJsonable(val[k]);
            return out;
        }
        return val;
    }

    // Override _isTypeDecl to handle C++ types
    _isTypeDecl(text) {
        if (super._isTypeDecl(text)) return true;
        // Vector, string, pair declarations
        return /^(?:const\s+)?(?:vector\s*<|string\s+|pair\s*<|map\s*<|set\s*<|stack\s*<|queue\s*<)/.test(text);
    }

    // Override _execStmt to handle C++ constructs
    _execStmt({ text, line }, idx, all) {
        if (!text || text === '{' || text === '}' || text.startsWith('#') || text.startsWith('using ') || text.startsWith('//')) {
            return { type: 'normal' };
        }

        // cout statement
        if (/^(?:std::)?cout\s*<</.test(text) || /^cout\s*<</.test(text)) {
            this._execCout(text, line);
            return { type: 'normal' };
        }

        // cin statement
        if (/^(?:std::)?cin\s*>>/.test(text)) {
            this._snapshot(line, 'cin (input skipped in visualizer)', [], 'print');
            return { type: 'normal' };
        }

        // Range-based for: for (T x : container) or for (auto& x : container)
        if (/^for\s*\(/.test(text)) {
            const rangeParsed = this._parseRangeFor(text);
            if (rangeParsed) return this._execRangeFor(rangeParsed, text, line, idx, all);
        }

        // Vector / string declaration
        if (/^(?:const\s+)?vector\s*</.test(text) || /^(?:const\s+)?string\s+\w/.test(text) || /^(?:const\s+)?pair\s*</.test(text)) {
            return this._execCppDecl(text, line);
        }

        // auto declaration
        if (/^(?:const\s+)?auto\s+\w/.test(text) && !/^for\b/.test(text)) {
            return this._execAutoDecl(text, line);
        }

        // C++ method calls: v.push_back(...), s.append(...), etc.
        if (/^\w+\.\w+\s*\(/.test(text)) {
            return this._execMethodCall(text, line, idx, all);
        }

        // sort / reverse / find / min_element etc. (free functions on containers)
        if (/^(?:std::)?(?:sort|reverse|fill|unique|count|find|next_permutation)\s*\(/.test(text)) {
            this._evalCppFreeFunc(text.replace(/;$/, '').trim(), line);
            return { type: 'normal' };
        }

        // Fall through to C handling
        return super._execStmt({ text, line }, idx, all);
    }

    // ── cout ────────────────────────────────────────────────────────────────

    _execCout(text, line) {
        // cout << a << b << endl << "\n" << ...
        const cleanText = text.replace(/;$/, '').replace(/^(?:std::)?cout/, '');
        const parts = this._splitCoutParts(cleanText);
        const outParts = [];

        for (const part of parts) {
            const t = part.trim();
            if (!t || t === '<<') continue;
            if (t === 'endl' || t === 'std::endl' || t === '"\\n"' || t === "'\\n'") {
                outParts.push('\n');
            } else if (t === '"\\t"' || t === "'\\t'") {
                outParts.push('\t');
            } else if (t.startsWith('setw(') || t.startsWith('setprecision(') || t.startsWith('fixed') || t.startsWith('setfill(')) {
                // ignore formatting manipulators
            } else {
                const val = this._eval(t);
                outParts.push(this._toCoutString(val));
            }
        }

        const outStr = outParts.join('');
        this.output += outStr;
        this._snapshot(line, `cout: ${outStr.replace(/\n/g, '↵').slice(0, 60)}`, [], 'print');
    }

    _splitCoutParts(text) {
        // Split "<<" respecting strings and nesting
        const parts = [];
        let depth = 0, inStr = false, strCh = '', cur = '';
        let i = 0;
        while (i < text.length) {
            const ch = text[i];
            if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strCh = ch; cur += ch; i++; continue; }
            if (inStr && ch === strCh && text[i - 1] !== '\\') { inStr = false; cur += ch; i++; continue; }
            if (inStr) { cur += ch; i++; continue; }
            if (ch === '(' || ch === '[') depth++;
            if (ch === ')' || ch === ']') depth--;
            if (depth === 0 && text.slice(i, i + 2) === '<<') {
                parts.push(cur.trim());
                cur = '';
                i += 2;
                continue;
            }
            cur += ch;
            i++;
        }
        if (cur.trim()) parts.push(cur.trim());
        return parts;
    }

    _toCoutString(val) {
        if (isVector(val)) return val.data.map(v => this._toCoutString(v)).join(' ');
        if (isCppString(val)) return val.data;
        if (typeof val === 'boolean') return val ? '1' : '0';
        if (val === null || val === undefined) return '';
        return String(val);
    }

    // ── Range-based for ─────────────────────────────────────────────────────

    _parseRangeFor(text) {
        // for (auto x : container) or for (int& x : arr) or for (const auto& x : v)
        const m = text.match(/^for\s*\(\s*((?:const\s+)?(?:auto|[\w<>:]+)(?:\s*[&*])?)\s+(\w+)\s*:\s*(.+?)\s*\)\s*\{?(.*)$/);
        if (!m) return null;
        return {
            typeDecl: m[1].trim(),
            varName: m[2],
            containerExpr: m[3].trim(),
            sameLineBody: m[4].trim(),
        };
    }

    _execRangeFor({ typeDecl, varName, containerExpr, sameLineBody }, text, line, idx, all) {
        const container = this._eval(containerExpr);
        let items = [];

        if (isVector(container)) items = container.data;
        else if (Array.isArray(container)) items = container;
        else if (isCppString(container)) items = container.data.split('').map(c => c.charCodeAt(0));
        else if (typeof container === 'string') items = container.split('').map(c => c.charCodeAt(0));

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
            if (iteration > MAX_STEPS) throw new Error('Infinite loop detected');
            this._vars[varName] = item;
            this._snapshot(line, `for ${varName} : ${containerExpr} — iteration ${iteration}`, [varName], 'loop-iteration', { iteration });
            const res = this._execBlock(body);
            if (res.type === 'return') return { ...res, next: bodyEnd + 1 };
            if (res.type === 'break') break;
        }

        // Clean up loop variable
        delete this._vars[varName];
        this._snapshot(line, `range-for completed (${iteration} iterations)`, [], 'loop-end');
        return { type: 'normal', next: bodyEnd + 1 };
    }

    // ── C++ declarations ────────────────────────────────────────────────────

    _execCppDecl(text, line) {
        text = text.replace(/;$/, '').trim();

        // vector<T> name = {vals} or vector<T> name(size) or vector<T> name(size, val)
        const vecDecl = text.match(/^(?:const\s+)?vector\s*<([^>]+)>\s+(\w+)\s*(?:=\s*\{([^}]*)\}|\(([^)]*)\))?/);
        if (vecDecl) {
            const name = vecDecl[2];
            if (vecDecl[3] !== undefined) {
                // = {vals}
                const vals = vecDecl[3].trim() ? splitArgs(vecDecl[3]).map(v => this._eval(v.trim())) : [];
                this._vars[name] = makeVector(vals);
            } else if (vecDecl[4] !== undefined) {
                // (size) or (size, val)
                const args = splitArgs(vecDecl[4]).map(a => this._eval(a.trim()));
                const size = Number(args[0]) || 0;
                const fillVal = args[1] !== undefined ? args[1] : 0;
                this._vars[name] = makeVector(new Array(size).fill(fillVal));
            } else {
                this._vars[name] = makeVector([]);
            }
            this._snapshot(line, `vector<${vecDecl[1]}> ${name} = ${formatCppValue(this._vars[name])}`, [name], 'var-init');
            return { type: 'normal' };
        }

        // string name = "val" or string name
        const strDecl = text.match(/^(?:const\s+)?string\s+(\w+)\s*(?:=\s*(.+))?$/);
        if (strDecl) {
            const name = strDecl[1];
            const val = strDecl[2] ? this._eval(strDecl[2]) : '';
            const s = typeof val === 'string' ? val : String(val ?? '');
            this._vars[name] = makeString(s);
            this._snapshot(line, `string ${name} = "${s}"`, [name], 'var-init');
            return { type: 'normal' };
        }

        // pair<T1,T2> name = {a, b} or {a, b}
        const pairDecl = text.match(/^(?:const\s+)?pair\s*<([^>]+)>\s+(\w+)\s*(?:=\s*\{([^}]*)\}|\(\s*(.+)\s*,\s*(.+)\s*\))?/);
        if (pairDecl) {
            const name = pairDecl[2];
            if (pairDecl[3] !== undefined) {
                const vals = splitArgs(pairDecl[3]).map(v => this._eval(v.trim()));
                this._vars[name] = makePair(vals[0], vals[1]);
            } else if (pairDecl[4] !== undefined) {
                this._vars[name] = makePair(this._eval(pairDecl[4]), this._eval(pairDecl[5]));
            } else {
                this._vars[name] = makePair(0, 0);
            }
            this._snapshot(line, `pair ${name} = ${formatCppValue(this._vars[name])}`, [name], 'var-init');
            return { type: 'normal' };
        }

        return { type: 'normal' };
    }

    _execAutoDecl(text, line) {
        text = text.replace(/;$/, '').trim();
        const m = text.match(/^(?:const\s+)?auto\s*(?:[&*])?\s+(\w+)\s*=\s*(.+)$/);
        if (!m) return { type: 'normal' };
        const name = m[1];
        const val = this._eval(m[2]);
        this._vars[name] = val;
        this._snapshot(line, `auto ${name} = ${formatCppValue(val)}`, [name], 'var-init');
        return { type: 'normal' };
    }

    // ── Method calls on objects ─────────────────────────────────────────────

    _execMethodCall(text, line, idx, all) {
        const m = text.replace(/;$/, '').trim().match(/^(\w+)\.(\w+)\s*\((.*)\)$/);
        if (!m) return { type: 'normal' };
        const [, objName, method, argsStr] = m;
        const obj = this._getVar(objName);
        if (obj === undefined) return { type: 'normal' };

        const args = argsStr.trim() ? splitArgs(argsStr).map(a => this._eval(a.trim())) : [];

        // Vector methods
        if (isVector(obj)) {
            const v = obj.data;
            switch (method) {
                case 'push_back': {
                    const newVec = makeVector([...v, args[0]]);
                    this._setVar(objName, newVec);
                    this._snapshot(line, `${objName}.push_back(${formatValue(args[0])}) → size=${newVec.data.length}`, [objName], 'method-call');
                    break;
                }
                case 'pop_back': {
                    if (v.length > 0) {
                        const newVec = makeVector(v.slice(0, -1));
                        this._setVar(objName, newVec);
                        this._snapshot(line, `${objName}.pop_back() → size=${newVec.data.length}`, [objName], 'method-call');
                    }
                    break;
                }
                case 'push_front': {
                    const newVec = makeVector([args[0], ...v]);
                    this._setVar(objName, newVec);
                    this._snapshot(line, `${objName}.push_front(${formatValue(args[0])})`, [objName], 'method-call');
                    break;
                }
                case 'clear': {
                    this._setVar(objName, makeVector([]));
                    this._snapshot(line, `${objName}.clear()`, [objName], 'method-call');
                    break;
                }
                case 'sort': {
                    const sorted = [...v].sort((a, b) => Number(a) - Number(b));
                    this._setVar(objName, makeVector(sorted));
                    this._snapshot(line, `${objName}.sort() → ${formatCppValue(this._getVar(objName))}`, [objName], 'method-call');
                    break;
                }
                case 'reverse': {
                    this._setVar(objName, makeVector([...v].reverse()));
                    this._snapshot(line, `${objName}.reverse()`, [objName], 'method-call');
                    break;
                }
                case 'resize': {
                    const newSize = Number(args[0]) || 0;
                    const fillVal = args[1] !== undefined ? args[1] : 0;
                    let newData = [...v];
                    while (newData.length < newSize) newData.push(fillVal);
                    if (newData.length > newSize) newData = newData.slice(0, newSize);
                    this._setVar(objName, makeVector(newData));
                    this._snapshot(line, `${objName}.resize(${newSize})`, [objName], 'method-call');
                    break;
                }
                case 'assign': {
                    const newVec = makeVector(new Array(Number(args[0]) || 0).fill(args[1] !== undefined ? args[1] : 0));
                    this._setVar(objName, newVec);
                    this._snapshot(line, `${objName}.assign(${args[0]}, ${args[1]})`, [objName], 'method-call');
                    break;
                }
                default:
                    this._snapshot(line, `${objName}.${method}(...)`, [], 'method-call');
            }
            return { type: 'normal' };
        }

        // String methods
        if (isCppString(obj)) {
            const s = obj.data;
            switch (method) {
                case 'append': case '+': {
                    const val = typeof args[0] === 'string' ? args[0] : (isCppString(args[0]) ? args[0].data : String(args[0] ?? ''));
                    const ns = makeString(s + val);
                    this._setVar(objName, ns);
                    this._snapshot(line, `${objName}.append("${val}")`, [objName], 'method-call');
                    break;
                }
                case 'push_back': {
                    const ch = typeof args[0] === 'number' ? String.fromCharCode(args[0]) : String(args[0] ?? '');
                    this._setVar(objName, makeString(s + ch));
                    this._snapshot(line, `${objName}.push_back('${ch}')`, [objName], 'method-call');
                    break;
                }
                case 'pop_back': {
                    this._setVar(objName, makeString(s.slice(0, -1)));
                    this._snapshot(line, `${objName}.pop_back()`, [objName], 'method-call');
                    break;
                }
                case 'clear': {
                    this._setVar(objName, makeString(''));
                    this._snapshot(line, `${objName}.clear()`, [objName], 'method-call');
                    break;
                }
                case 'insert': {
                    const pos = Number(args[0]) || 0;
                    const ins = typeof args[1] === 'string' ? args[1] : (isCppString(args[1]) ? args[1].data : String(args[1] ?? ''));
                    const ns = makeString(s.slice(0, pos) + ins + s.slice(pos));
                    this._setVar(objName, ns);
                    this._snapshot(line, `${objName}.insert(${pos}, "${ins}")`, [objName], 'method-call');
                    break;
                }
                case 'erase': {
                    const pos = Number(args[0]) || 0;
                    const len = args[1] !== undefined ? Number(args[1]) : s.length - pos;
                    this._setVar(objName, makeString(s.slice(0, pos) + s.slice(pos + len)));
                    this._snapshot(line, `${objName}.erase(${pos}, ${len})`, [objName], 'method-call');
                    break;
                }
                default:
                    this._snapshot(line, `${objName}.${method}(...)`, [], 'method-call');
            }
            return { type: 'normal' };
        }

        this._snapshot(line, `${objName}.${method}(...)`, [], 'method-call');
        return { type: 'normal' };
    }

    // ── STL free functions ─────────────────────────────────────────────────

    _evalCppFreeFunc(expr, callerLine) {
        const m = expr.match(/^(?:std::)?(\w+)\s*\((.*)\)$/);
        if (!m) return;
        const fname = m[1];
        const argsRaw = splitArgs(m[2]);

        // sort(v.begin(), v.end()) or sort(arr, arr+n) or sort(v.begin(), v.end(), cmp)
        if (fname === 'sort' || fname === 'stable_sort') {
            const containerName = argsRaw[0].replace(/\.begin\(\)|\.rbegin\(\)/, '').trim();
            const container = this._getVar(containerName);
            if (isVector(container)) {
                const sorted = [...container.data].sort((a, b) => Number(a) - Number(b));
                this._setVar(containerName, makeVector(sorted));
                this._snapshot(callerLine, `sort(${containerName}) → ${formatCppValue(this._getVar(containerName))}`, [containerName], 'method-call');
            } else if (Array.isArray(container)) {
                const sorted = [...container].sort((a, b) => Number(a) - Number(b));
                this._setVar(containerName, sorted);
                this._snapshot(callerLine, `sort(${containerName})`, [containerName], 'method-call');
            }
            return;
        }

        if (fname === 'reverse') {
            const containerName = argsRaw[0].replace(/\.begin\(\)|\.rbegin\(\)/, '').trim();
            const container = this._getVar(containerName);
            if (isVector(container)) {
                this._setVar(containerName, makeVector([...container.data].reverse()));
                this._snapshot(callerLine, `reverse(${containerName})`, [containerName], 'method-call');
            } else if (Array.isArray(container)) {
                this._setVar(containerName, [...container].reverse());
                this._snapshot(callerLine, `reverse(${containerName})`, [containerName], 'method-call');
            }
            return;
        }

        if (fname === 'fill') {
            const containerName = argsRaw[0].replace(/\.begin\(\)/, '').trim();
            const val = this._eval(argsRaw[2]);
            const container = this._getVar(containerName);
            if (isVector(container)) {
                this._setVar(containerName, makeVector(new Array(container.data.length).fill(val)));
                this._snapshot(callerLine, `fill(${containerName}, ${val})`, [containerName], 'method-call');
            }
            return;
        }
    }

    // ── Override _eval to handle C++ constructs ────────────────────────────

    _eval(expr) {
        if (expr === undefined || expr === null) return null;
        expr = String(expr).trim();
        if (!expr) return null;

        // nullptr
        if (expr === 'nullptr' || expr === 'NULL') return null;

        // Brace-init: {a, b, c}
        if (expr.startsWith('{') && expr.endsWith('}')) {
            return splitArgs(expr.slice(1, -1)).map(v => this._eval(v.trim()));
        }

        // make_pair(a, b)
        if (/^(?:std::)?make_pair\s*\(/.test(expr)) {
            const m = expr.match(/make_pair\s*\(([^)]+)\)/);
            if (m) {
                const args = splitArgs(m[1]).map(a => this._eval(a.trim()));
                return makePair(args[0], args[1]);
            }
        }

        // vector constructor in expression: vector<T>(size, val)
        if (/^vector\s*</.test(expr)) {
            const m = expr.match(/vector\s*<[^>]+>\s*\(([^)]*)\)/);
            if (m) {
                const args = splitArgs(m[1]).map(a => this._eval(a.trim()));
                return makeVector(new Array(Number(args[0]) || 0).fill(args[1] !== undefined ? args[1] : 0));
            }
            return makeVector([]);
        }

        // string constructor
        if (/^string\s*\(/.test(expr)) {
            const m = expr.match(/string\s*\(([^)]*)\)/);
            if (m) {
                const args = splitArgs(m[1]).map(a => this._eval(a.trim()));
                if (typeof args[0] === 'number' && typeof args[1] === 'number') {
                    return makeString(String.fromCharCode(args[1]).repeat(args[0]));
                }
                return makeString(String(args[0] ?? ''));
            }
            return makeString('');
        }

        // to_string(x)
        if (/^(?:std::)?to_string\s*\(/.test(expr)) {
            const m = expr.match(/to_string\s*\(([^)]+)\)/);
            if (m) return makeString(String(this._eval(m[1])));
        }

        // stoi / stof / stod
        if (/^(?:std::)?stoi\s*\(/.test(expr)) {
            const m = expr.match(/stoi\s*\(([^)]+)\)/);
            if (m) {
                const v = this._eval(m[1]);
                return parseInt(isCppString(v) ? v.data : String(v), 10) || 0;
            }
        }
        if (/^(?:std::)?stof\s*\(/.test(expr) || /^(?:std::)?stod\s*\(/.test(expr)) {
            const m = expr.match(/(?:stof|stod)\s*\(([^)]+)\)/);
            if (m) {
                const v = this._eval(m[1]);
                return parseFloat(isCppString(v) ? v.data : String(v)) || 0;
            }
        }

        // Method calls on variables: v.size(), v.empty(), v[i], s.length(), etc.
        // obj.method(args)
        const methodCallM = expr.match(/^(\w+)\.(\w+)\s*\((.*)\)$/);
        if (methodCallM) {
            const [, objName, method, argsStr] = methodCallM;
            const obj = this._getVar(objName);
            const args = argsStr.trim() ? splitArgs(argsStr).map(a => this._eval(a.trim())) : [];

            if (isVector(obj)) {
                switch (method) {
                    case 'size': case 'length': return obj.data.length;
                    case 'empty': return obj.data.length === 0;
                    case 'back': return obj.data[obj.data.length - 1];
                    case 'front': return obj.data[0];
                    case 'at': return obj.data[Number(args[0]) || 0];
                    case 'max_size': return 1e9;
                    case 'capacity': return obj.data.length;
                    case 'begin': return { __iter: objName, pos: 0 };
                    case 'end': return { __iter: objName, pos: obj.data.length };
                    case 'push_back': {
                        const nv = makeVector([...obj.data, args[0]]);
                        this._setVar(objName, nv); return nv.data.length;
                    }
                }
            }

            if (isCppString(obj)) {
                switch (method) {
                    case 'size': case 'length': return obj.data.length;
                    case 'empty': return obj.data.length === 0;
                    case 'substr': {
                        const start = Number(args[0]) || 0;
                        const len = args[1] !== undefined ? Number(args[1]) : obj.data.length - start;
                        return makeString(obj.data.substr(start, len));
                    }
                    case 'find': {
                        const needle = isCppString(args[0]) ? args[0].data : String(args[0] ?? '');
                        const pos = obj.data.indexOf(needle, Number(args[1]) || 0);
                        return pos === -1 ? 4294967295 : pos; // npos
                    }
                    case 'rfind': {
                        const needle = isCppString(args[0]) ? args[0].data : String(args[0] ?? '');
                        return obj.data.lastIndexOf(needle);
                    }
                    case 'at': return obj.data.charCodeAt(Number(args[0]) || 0);
                    case 'c_str': return obj.data;
                    case 'append': {
                        const s = isCppString(args[0]) ? args[0].data : String(args[0] ?? '');
                        const nv = makeString(obj.data + s);
                        this._setVar(objName, nv);
                        return nv;
                    }
                    case 'compare': {
                        const other = isCppString(args[0]) ? args[0].data : String(args[0] ?? '');
                        return obj.data < other ? -1 : obj.data > other ? 1 : 0;
                    }
                    case 'replace': {
                        const pos = Number(args[0]) || 0;
                        const len = Number(args[1]) || 0;
                        const rep = isCppString(args[2]) ? args[2].data : String(args[2] ?? '');
                        const nv = makeString(obj.data.slice(0, pos) + rep + obj.data.slice(pos + len));
                        this._setVar(objName, nv);
                        return nv;
                    }
                    case 'clear': { this._setVar(objName, makeString('')); return makeString(''); }
                }
            }

            if (Array.isArray(obj)) {
                switch (method) {
                    case 'size': case 'length': return obj.length;
                    case 'empty': return obj.length === 0;
                }
            }

            // pair.first / .second (accessed as method-less)
        }

        // obj.field (property access, no parens)
        const fieldM = expr.match(/^(\w+)\.(\w+)$/);
        if (fieldM) {
            const [, objName, field] = fieldM;
            const obj = this._getVar(objName);
            if (isVector(obj)) {
                if (field === 'size') return obj.data.length;
                if (field === 'front') return obj.data[0];
                if (field === 'back') return obj.data[obj.data.length - 1];
            }
            if (isCppString(obj)) {
                if (field === 'size' || field === 'length') return obj.data.length;
            }
            if (obj && typeof obj === 'object' && field in obj) return obj[field];
        }

        // vector subscript: v[i] — only if the WHOLE expression is a balanced
        // subscript (a greedy regex would mis-match `v[1] > v[2]`).
        const subParsed = this._parseSingleSubscript(expr);
        if (subParsed) {
            const container = this._getVar(subParsed.name);
            const idx = this._eval(subParsed.indexExpr);
            if (isVector(container)) return container.data[Number(idx)] ?? 0;
            if (isCppString(container)) return container.data.charCodeAt(Number(idx)) || 0;
        }

        // STL free function calls in expressions: min(a,b), max(a,b), count(...), etc.
        if (/^(?:std::)?(\w+)\s*\(/.test(expr)) {
            const fnM = expr.match(/^(?:std::)?(\w+)\s*\((.*)\)$/);
            if (fnM) {
                const fname = fnM[1];
                const argsRaw = splitArgs(fnM[2]).map(a => this._eval(a.trim()));
                switch (fname) {
                    case 'min': return argsRaw.length >= 2 ? Math.min(Number(argsRaw[0]), Number(argsRaw[1])) : argsRaw[0];
                    case 'max': return argsRaw.length >= 2 ? Math.max(Number(argsRaw[0]), Number(argsRaw[1])) : argsRaw[0];
                    case 'abs': return Math.abs(Number(argsRaw[0]) || 0);
                    case 'swap': {
                        const a = fnM[2].split(',')[0].trim();
                        const b = fnM[2].split(',')[1].trim();
                        const va = this._getVar(a), vb = this._getVar(b);
                        this._setVar(a, vb); this._setVar(b, va);
                        return undefined;
                    }
                    case 'count': {
                        const containerName = fnM[2].split(',')[0].replace(/\.begin\(\)/, '').trim();
                        const valToCount = argsRaw[argsRaw.length - 1];
                        const cont = this._getVar(containerName);
                        if (isVector(cont)) return cont.data.filter(x => x === valToCount).length;
                        if (Array.isArray(cont)) return cont.filter(x => x === valToCount).length;
                        return 0;
                    }
                }
            }
        }

        // Fall through to C evaluator
        return super._eval(expr);
    }

    // Override _evalCall to handle C++ functions
    _evalCall(expr, callerLine) {
        const m = expr.match(/^(?:std::)?(\w+)\s*\(([\s\S]*)\)$/);
        if (!m) return super._evalCall(expr, callerLine);

        const fname = m[1];
        const argsStr = m[2].trim();

        // cout as a function (unusual but handle gracefully)
        if (fname === 'cout') return undefined;

        // C++ specific builtins
        switch (fname) {
            case 'swap': {
                const parts = splitArgs(argsStr);
                if (parts.length >= 2) {
                    const a = parts[0].trim(), b = parts[1].trim();
                    const va = this._eval(a), vb = this._eval(b);
                    this._setVar(a, vb); this._setVar(b, va);
                    this._snapshot(callerLine || 0, `swap(${a}, ${b})`, [a, b], 'method-call');
                }
                return undefined;
            }
            case 'min': {
                const args = splitArgs(argsStr).map(a => this._eval(a.trim()));
                return Math.min(...args.map(Number));
            }
            case 'max': {
                const args = splitArgs(argsStr).map(a => this._eval(a.trim()));
                return Math.max(...args.map(Number));
            }
            case 'sort': case 'stable_sort': {
                this._evalCppFreeFunc(expr, callerLine || 0);
                return undefined;
            }
            case 'reverse': {
                this._evalCppFreeFunc(expr, callerLine || 0);
                return undefined;
            }
            case 'to_string': {
                const v = this._eval(splitArgs(argsStr)[0]);
                return makeString(String(v ?? ''));
            }
            case 'stoi': {
                const v = this._eval(splitArgs(argsStr)[0]);
                return parseInt(isCppString(v) ? v.data : String(v ?? ''), 10) || 0;
            }
            case 'stof': case 'stod': {
                const v = this._eval(splitArgs(argsStr)[0]);
                return parseFloat(isCppString(v) ? v.data : String(v ?? '')) || 0;
            }
        }

        return super._evalCall(expr, callerLine);
    }

    // Override _execAssign to handle vector element assignment
    _execAssign({ lhs, op, rhs }, line) {
        // vector element: v[i] = val
        const arrM = lhs.match(/^(\w+)\[(.+)\]$/);
        if (arrM) {
            const cname = arrM[1];
            const container = this._getVar(cname);
            const idx = this._eval(arrM[2]);
            const rhsVal = this._eval(rhs);

            if (isVector(container)) {
                const newData = [...container.data];
                newData[Number(idx)] = this._applyOp(newData[Number(idx)], op, rhsVal);
                this._setVar(cname, makeVector(newData));
                this._snapshot(line, `${cname}[${idx}] = ${formatValue(newData[Number(idx)])}`, [cname], 'var-update');
                return { type: 'normal' };
            }

            if (isCppString(container)) {
                let s = container.data.split('');
                const ch = typeof rhsVal === 'number' ? String.fromCharCode(rhsVal) : String(rhsVal ?? '');
                s[Number(idx)] = ch;
                this._setVar(cname, makeString(s.join('')));
                this._snapshot(line, `${cname}[${idx}] = '${ch}'`, [cname], 'var-update');
                return { type: 'normal' };
            }
        }

        // string += "str"
        const obj = this._getVar(lhs);
        if (isCppString(obj) && op === '+=') {
            const rhsVal = this._eval(rhs);
            const addStr = isCppString(rhsVal) ? rhsVal.data : String(rhsVal ?? '');
            const nv = makeString(obj.data + addStr);
            this._setVar(lhs, nv);
            this._snapshot(line, `${lhs} += "${addStr}"`, [lhs], 'var-update');
            return { type: 'normal' };
        }

        return super._execAssign({ lhs, op, rhs }, line);
    }
}

// ── Public export ────────────────────────────────────────────────────────

export function executeCpp(source) {
    try {
        const interp = new CppInterpreter(source);
        return interp.run();
    } catch (e) {
        return {
            steps: [],
            error: { message: e.message || 'C++ execution error', line: 1 },
            output: '',
        };
    }
}
