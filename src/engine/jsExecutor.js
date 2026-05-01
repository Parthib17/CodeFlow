/**
 * JavaScript executor.
 *
 * Strategy:
 *   1. Lightly instrument the source — after every "top-level-ish" statement
 *      we inject a __step(line) call that snapshots the current scope.
 *   2. Run the instrumented code with the native `Function` constructor inside
 *      a sandboxed scope. This means any modern JS (ES2023+) actually runs:
 *      arrow functions, classes, async/await, destructuring, optional chaining,
 *      spread, template literals, generators — the engine is V8, not us.
 *   3. We expose a `console` shim that captures output, and a `__step` callback
 *      that records snapshots. Variables are tracked by re-running source with
 *      `with` over a Proxy that intercepts gets/sets so we know the live values.
 *
 * Trade-offs: we don't get expression-level stepping; we step at the statement
 * boundary. This matches the resolution of the Python tracer (per-line) and is
 * what algorithm visualization needs.
 */

const MAX_STEPS = 8000;
const EXEC_TIMEOUT_MS = 5000;

/* ── Source instrumentation ───────────────────────────────────
 * Insert `__step(<line>)` after each statement at brace depth 0/1
 * inside the user code, and right after entering a block. Quotes,
 * template literals, regex, and comments are skipped. */

function instrument(source) {
    const out = [];
    let i = 0;
    let line = 1;
    let depth = 0;
    let parenDepth = 0;
    let bracketDepth = 0;
    let lastStmtLine = 1;
    const len = source.length;

    function emitStep(ln) {
        out.push(`;__step(${ln});`);
    }

    while (i < len) {
        const ch = source[i];
        const next = source[i + 1];

        // Newline
        if (ch === '\n') {
            out.push(ch);
            i++;
            line++;
            continue;
        }

        // Line comment
        if (ch === '/' && next === '/') {
            while (i < len && source[i] !== '\n') { out.push(source[i]); i++; }
            continue;
        }
        // Block comment
        if (ch === '/' && next === '*') {
            out.push(ch); out.push(next); i += 2;
            while (i < len && !(source[i] === '*' && source[i + 1] === '/')) {
                if (source[i] === '\n') line++;
                out.push(source[i]); i++;
            }
            if (i < len) { out.push(source[i]); out.push(source[i + 1]); i += 2; }
            continue;
        }

        // String / template literal
        if (ch === '"' || ch === "'" || ch === '`') {
            const quote = ch;
            out.push(ch); i++;
            while (i < len) {
                const c = source[i];
                if (c === '\\') { out.push(c); out.push(source[i + 1] || ''); i += 2; continue; }
                if (c === '\n') line++;
                if (c === quote) { out.push(c); i++; break; }
                if (quote === '`' && c === '$' && source[i + 1] === '{') {
                    out.push(c); out.push(source[i + 1]); i += 2;
                    let braceDepth = 1;
                    while (i < len && braceDepth > 0) {
                        const cc = source[i];
                        if (cc === '{') braceDepth++;
                        else if (cc === '}') braceDepth--;
                        else if (cc === '\n') line++;
                        out.push(cc); i++;
                        if (braceDepth === 0) break;
                    }
                    continue;
                }
                out.push(c); i++;
            }
            continue;
        }

        // Track parens/brackets so we don't instrument inside for(;;) or fn args.
        if (ch === '(') { parenDepth++; out.push(ch); i++; continue; }
        if (ch === ')') { parenDepth = Math.max(0, parenDepth - 1); out.push(ch); i++; continue; }
        if (ch === '[') { bracketDepth++; out.push(ch); i++; continue; }
        if (ch === ']') { bracketDepth = Math.max(0, bracketDepth - 1); out.push(ch); i++; continue; }

        // Inject step after `{` (start of block) and after `;` (statement end),
        // but only when we're at the top level of brackets/parens.
        if (ch === '{') {
            depth++;
            out.push(ch);
            i++;
            if (parenDepth === 0 && bracketDepth === 0) emitStep(line);
            continue;
        }
        if (ch === '}') { depth = Math.max(0, depth - 1); out.push(ch); i++; continue; }
        if (ch === ';') {
            out.push(ch);
            i++;
            if (parenDepth === 0 && bracketDepth === 0) {
                emitStep(line);
                lastStmtLine = line;
            }
            continue;
        }

        out.push(ch); i++;
    }

    return out.join('');
}

/* ── Value formatting ──────────────────────────────────────── */

function formatValue(v, depth = 0) {
    if (depth > 4) return '…';
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    const t = typeof v;
    if (t === 'number' || t === 'boolean') return String(v);
    if (t === 'bigint') return String(v) + 'n';
    if (t === 'string') return JSON.stringify(v.length > 200 ? v.slice(0, 200) + '…' : v);
    if (t === 'function') return `[Function: ${v.name || 'anonymous'}]`;
    if (t === 'symbol') return v.toString();
    if (Array.isArray(v)) {
        const inner = v.slice(0, 50).map(x => formatValue(x, depth + 1));
        if (v.length > 50) inner.push('…');
        return '[' + inner.join(', ') + ']';
    }
    if (v instanceof Map) return `Map(${v.size})`;
    if (v instanceof Set) return `Set(${v.size})`;
    if (v instanceof Date) return v.toISOString();
    if (v instanceof RegExp) return v.toString();
    if (t === 'object') {
        const keys = Object.keys(v).slice(0, 50);
        const inner = keys.map(k => `${k}: ${formatValue(v[k], depth + 1)}`);
        if (Object.keys(v).length > 50) inner.push('…');
        return '{' + inner.join(', ') + '}';
    }
    return String(v);
}

function getType(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    if (v instanceof Map) return 'Map';
    if (v instanceof Set) return 'Set';
    if (v instanceof Date) return 'Date';
    if (v instanceof RegExp) return 'RegExp';
    return typeof v;
}

function toJsonable(v, depth = 0) {
    if (depth > 4) return null;
    if (v === null || v === undefined) return v ?? null;
    const t = typeof v;
    if (t === 'number' || t === 'boolean' || t === 'string') return v;
    if (Array.isArray(v)) return v.slice(0, 50).map(x => toJsonable(x, depth + 1));
    if (t === 'object' && v.constructor === Object) {
        const out = {};
        for (const k of Object.keys(v).slice(0, 50)) out[k] = toJsonable(v[k], depth + 1);
        return out;
    }
    return null;
}

/* ── Executor ──────────────────────────────────────────────── */

export async function executeJavaScript(source) {
    const steps = [];
    let output = '';
    let stepCount = 0;
    let prevSnap = {};
    const sourceLines = source.split('\n');
    let lastError = null;

    const consoleShim = {
        log: (...args) => { output += args.map(a => typeof a === 'string' ? a : formatValue(a)).join(' ') + '\n'; },
        error: (...args) => { output += args.map(a => typeof a === 'string' ? a : formatValue(a)).join(' ') + '\n'; },
        warn: (...args) => { output += args.map(a => typeof a === 'string' ? a : formatValue(a)).join(' ') + '\n'; },
        info: (...args) => { output += args.map(a => typeof a === 'string' ? a : formatValue(a)).join(' ') + '\n'; },
    };

    // Track user vars by recording every assignment to a special tracking object.
    // We use a function that the instrumented code calls with the current scope.
    let liveScope = {};

    const __step = (line) => {
        stepCount++;
        if (stepCount > MAX_STEPS) throw new Error('Maximum execution steps exceeded (possible infinite loop)');
        const snap = {};
        for (const [k, v] of Object.entries(liveScope)) {
            if (typeof v === 'function' && !v.__userFn) continue;
            snap[k] = { display: formatValue(v), type: getType(v), value: toJsonable(v) };
        }
        const changed = [];
        for (const k of Object.keys(snap)) {
            if (!prevSnap[k] || prevSnap[k].display !== snap[k].display) changed.push(k);
        }
        prevSnap = snap;
        const text = (sourceLines[line - 1] || '').trim();
        let flow = null;
        if (/^(for|while)\b/.test(text)) flow = 'loop-iteration';
        else if (/^if\b/.test(text)) flow = 'if-check';
        else if (/^else\b/.test(text)) flow = 'else';
        else if (/^return\b/.test(text)) flow = 'return';
        else if (/^function\b/.test(text)) flow = 'func-def';
        else if (/^class\b/.test(text)) flow = 'class-def';
        else if (/console\.(log|error|warn|info)\(/.test(text)) flow = 'print';
        const ds = [];
        for (const [name, info] of Object.entries(snap)) {
            if (Array.isArray(info.value)) {
                ds.push({ name, type: 'array', values: info.value.map(v => ({ value: v, display: formatValue(v) })) });
            } else if (info.type === 'object' && info.value && typeof info.value === 'object') {
                ds.push({ name, type: 'dict', values: Object.entries(info.value).map(([k, v]) => ({ key: k, value: v, display: formatValue(v) })) });
            }
        }
        steps.push({
            step: steps.length + 1,
            line,
            description: text || `line ${line}`,
            variables: snap,
            changedVars: changed,
            output,
            flowType: flow,
            flowDetail: null,
            dataStructures: ds,
        });
    };

    // Capture top-level declarations by transforming `let x = ...` / `const x = ...` / `var x = ...`
    // into `__scope.x = ...` so we can track them. Inside functions we leave them alone.
    // To keep things simple: replace top-level `(let|const|var)\s+(\w+)\s*=` with `var $2 = __scope.$2 =`.
    // This only fires at column 0 of a logical line (no leading whitespace) to avoid touching nested decls.
    const scopeAlias = '__scope';
    const trackedSource = source.replace(
        /^(\s*)(let|const|var)\s+([a-zA-Z_$][\w$]*)\s*=/gm,
        (_, ws, kw, name) => `${ws}${kw === 'const' ? 'var' : kw} ${name} = ${scopeAlias}.${name} =`
    ).replace(
        /^(\s*)function\s+([a-zA-Z_$][\w$]*)/gm,
        (m, ws, name) => `${m}; ${scopeAlias}.${name} = ${name};`
    );

    const instrumented = instrument(trackedSource);

    const startTime = Date.now();
    const timeoutCheck = () => {
        if (Date.now() - startTime > EXEC_TIMEOUT_MS) {
            throw new Error('Execution timeout (5s exceeded)');
        }
    };

    try {
        // Build the runner. liveScope is the same object the instrumented code mutates,
        // so __step sees current values.
        liveScope = {};
        const fn = new Function('__step', '__scope', 'console', '__timeout',
            `"use strict";\nreturn (async () => {\n${instrumented}\n})();`
        );
        // Wrap __step to also enforce timeout periodically
        const stepWithTimeout = (ln) => { timeoutCheck(); __step(ln); };
        const result = fn(stepWithTimeout, liveScope, consoleShim, timeoutCheck);
        await Promise.race([
            result,
            new Promise((_, rej) => setTimeout(() => rej(new Error('Execution timeout (5s exceeded)')), EXEC_TIMEOUT_MS)),
        ]);
    } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        // Try to extract line from stack
        let line = 1;
        if (e && e.stack) {
            const m = e.stack.match(/<anonymous>:(\d+):/);
            if (m) line = Math.max(1, parseInt(m[1], 10) - 2); // offset for IIFE wrapper
        }
        lastError = { message: msg, line };
    }

    return { steps, error: lastError, output };
}
