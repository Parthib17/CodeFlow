/**
 * Java Subset Interpreter / Simulator
 * Supports: variables, arithmetic, strings, arrays, if/else, while, for loops, System.out.println
 * Produces a snapshot of state at every executed line.
 */

const MAX_STEPS = 5000;

function deepClone(val) {
    if (Array.isArray(val)) return val.map(deepClone);
    if (val !== null && typeof val === 'object') {
        const out = {};
        for (const k in val) out[k] = deepClone(val[k]);
        return out;
    }
    return val;
}

function formatValue(val) {
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'string') return `"${val}"`;
    if (Array.isArray(val)) return `[${val.map(formatValue).join(', ')}]`;
    return String(val);
}

function getType(val) {
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'boolean') return 'boolean';
    if (typeof val === 'number') return Number.isInteger(val) ? 'int' : 'double';
    if (typeof val === 'string') return 'String';
    if (Array.isArray(val)) return 'array';
    return 'Object';
}

export function executeJava(source) {
    const steps = [];
    const variables = {};
    let output = '';
    let stepCount = 0;

    function snapshot(line, description, changedVars = [], flowType = null, flowDetail = null) {
        stepCount++;
        if (stepCount > MAX_STEPS) throw new Error('Maximum execution steps exceeded');
        const varSnapshot = {};
        for (const [k, v] of Object.entries(variables)) {
            varSnapshot[k] = { value: deepClone(v), display: formatValue(v), type: getType(v) };
        }
        steps.push({
            step: steps.length + 1, line: line + 1, description, variables: varSnapshot,
            changedVars, output, flowType, flowDetail,
            dataStructures: Object.entries(varSnapshot).filter(([, i]) => Array.isArray(i.value)).map(([name, info]) => ({
                name, type: 'array', values: info.value.map(v => ({ value: v, display: formatValue(v) })),
            })),
        });
    }

    try {
        const lines = source.split('\n');
        // Strip the class/method wrapper — find code inside main()
        let codeLines = [];
        let insideMain = false;
        let braceCount = 0;
        let mainStartLine = 0;

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            // Skip imports, package declarations, empty lines
            if (trimmed.startsWith('import ') || trimmed.startsWith('package ') || trimmed === '') continue;
            // Detect main method
            if (trimmed.includes('public static void main') || trimmed.includes('static void main')) {
                insideMain = true;
                mainStartLine = i;
                if (trimmed.includes('{')) braceCount = 1;
                continue;
            }
            // Detect class declaration
            if (trimmed.match(/^(public\s+)?class\s+\w+/) && !insideMain) continue;

            if (insideMain) {
                if (trimmed === '}') {
                    braceCount--;
                    if (braceCount <= 0) { insideMain = false; continue; }
                }
                for (const ch of trimmed) {
                    if (ch === '{') braceCount++;
                    if (ch === '}') braceCount--;
                }
                if (braceCount > 0) codeLines.push({ text: trimmed, originalLine: i });
            }
        }

        // If no main method found, treat entire source as code lines
        if (codeLines.length === 0) {
            for (let i = 0; i < lines.length; i++) {
                const trimmed = lines[i].trim();
                if (trimmed && !trimmed.startsWith('import ') && !trimmed.startsWith('package ') &&
                    !trimmed.match(/^(public\s+)?class\s+/) && !trimmed.includes('static void main') &&
                    trimmed !== '{' && trimmed !== '}') {
                    codeLines.push({ text: trimmed, originalLine: i });
                }
            }
        }

        // Simple line-by-line interpreter
        let i = 0;
        while (i < codeLines.length) {
            const { text: line, originalLine } = codeLines[i];
            const result = executeLine(line, originalLine, codeLines, i);
            if (result && result.skip) { i = result.skip; continue; }
            i++;
        }

        function evaluateExpression(expr) {
            expr = expr.trim();
            if (expr === 'true') return true;
            if (expr === 'false') return false;
            if (expr === 'null') return null;

            // String literal
            if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
                return expr.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
            }

            // Number
            if (/^-?\d+(\.\d+)?$/.test(expr)) {
                return expr.includes('.') ? parseFloat(expr) : parseInt(expr, 10);
            }
            if (/^-?\d+(\.\d+)?[fFdD]$/.test(expr)) {
                return parseFloat(expr.slice(0, -1));
            }

            // Parenthesized
            if (expr.startsWith('(') && expr.endsWith(')')) {
                return evaluateExpression(expr.slice(1, -1));
            }

            // String concatenation with +
            if (expr.includes('+')) {
                const parts = splitOnOperator(expr, '+');
                if (parts.length > 1) {
                    const evaluated = parts.map(p => evaluateExpression(p));
                    if (evaluated.some(v => typeof v === 'string')) {
                        return evaluated.map(v => v === null ? 'null' : typeof v === 'string' ? v : String(v)).join('');
                    }
                    return evaluated.reduce((a, b) => a + b);
                }
            }

            // Arithmetic operators
            for (const op of ['-', '*', '/', '%']) {
                if (op === '-' && expr.startsWith('-')) continue;
                const parts = splitOnOperator(expr, op);
                if (parts.length > 1) {
                    const l = evaluateExpression(parts[0]);
                    const r = evaluateExpression(parts.slice(1).join(op));
                    if (typeof l === 'number' && typeof r === 'number') {
                        switch (op) {
                            case '-': return l - r;
                            case '*': return l * r;
                            case '/': return r === 0 ? Infinity : (Number.isInteger(l) && Number.isInteger(r) ? Math.trunc(l / r) : l / r);
                            case '%': return l % r;
                        }
                    }
                }
            }

            // Comparison operators
            for (const op of ['==', '!=', '<=', '>=', '<', '>']) {
                const idx = expr.indexOf(op);
                if (idx > 0 && (op.length === 2 || (expr[idx + 1] !== '=' && (idx === 0 || expr[idx - 1] !== '!' && expr[idx - 1] !== '<' && expr[idx - 1] !== '>')))) {
                    const l = evaluateExpression(expr.slice(0, idx));
                    const r = evaluateExpression(expr.slice(idx + op.length));
                    switch (op) {
                        case '==': return l === r;
                        case '!=': return l !== r;
                        case '<': return l < r;
                        case '>': return l > r;
                        case '<=': return l <= r;
                        case '>=': return l >= r;
                    }
                }
            }

            // Logical operators
            if (expr.includes('&&')) { const p = expr.split('&&'); return evaluateExpression(p[0]) && evaluateExpression(p.slice(1).join('&&')); }
            if (expr.includes('||')) { const p = expr.split('||'); return evaluateExpression(p[0]) || evaluateExpression(p.slice(1).join('||')); }
            if (expr.startsWith('!')) return !evaluateExpression(expr.slice(1));

            // Method calls
            if (expr.includes('.nextInt(')) {
                const match = expr.match(/(\w+)\.nextInt\((\d*)\)/);
                if (match) return Math.floor(Math.random() * (parseInt(match[2]) || 100));
            }
            if (expr.includes('.nextDouble(')) return Math.random();
            if (expr.includes('.nextFloat(')) return Math.random();
            if (expr.includes('.nextBoolean(')) return Math.random() > 0.5;
            if (expr.includes('.length()')) {
                const obj = expr.split('.length()')[0].trim();
                const val = variables[obj];
                return typeof val === 'string' ? val.length : 0;
            }
            if (expr.includes('.length')) {
                const obj = expr.split('.length')[0].trim();
                const val = variables[obj];
                return Array.isArray(val) ? val.length : 0;
            }

            // Math methods
            if (expr.startsWith('Math.')) {
                const mathMatch = expr.match(/Math\.(\w+)\(([^)]*)\)/);
                if (mathMatch) {
                    const args = mathMatch[2].split(',').map(a => evaluateExpression(a));
                    switch (mathMatch[1]) {
                        case 'abs': return Math.abs(args[0]);
                        case 'max': return Math.max(args[0], args[1]);
                        case 'min': return Math.min(args[0], args[1]);
                        case 'pow': return Math.pow(args[0], args[1]);
                        case 'sqrt': return Math.sqrt(args[0]);
                        case 'random': return Math.random();
                        case 'floor': return Math.floor(args[0]);
                        case 'ceil': return Math.ceil(args[0]);
                        case 'round': return Math.round(args[0]);
                    }
                }
            }

            // Integer/Double parsing
            if (expr.startsWith('Integer.parseInt(')) {
                const inner = expr.match(/Integer\.parseInt\(([^)]+)\)/);
                return inner ? parseInt(evaluateExpression(inner[1]), 10) : 0;
            }
            if (expr.startsWith('Double.parseDouble(')) {
                const inner = expr.match(/Double\.parseDouble\(([^)]+)\)/);
                return inner ? parseFloat(evaluateExpression(inner[1])) : 0;
            }
            if (expr.startsWith('String.valueOf(')) {
                const inner = expr.match(/String\.valueOf\(([^)]+)\)/);
                return inner ? String(evaluateExpression(inner[1])) : '';
            }

            // new keyword
            if (expr.startsWith('new ')) {
                const rest = expr.slice(4).trim();
                if (rest.startsWith('Random(')) return { _type: 'Random' };
                if (rest.startsWith('Scanner(')) return { _type: 'Scanner' };
                if (rest.match(/^int\[/)) {
                    const sizeMatch = rest.match(/int\[([^\]]+)\]/);
                    const size = sizeMatch ? evaluateExpression(sizeMatch[1]) : 0;
                    return new Array(size).fill(0);
                }
                if (rest.match(/^double\[/)) {
                    const sizeMatch = rest.match(/double\[([^\]]+)\]/);
                    const size = sizeMatch ? evaluateExpression(sizeMatch[1]) : 0;
                    return new Array(size).fill(0.0);
                }
                if (rest.match(/^String\[/)) {
                    const sizeMatch = rest.match(/String\[([^\]]+)\]/);
                    const size = sizeMatch ? evaluateExpression(sizeMatch[1]) : 0;
                    return new Array(size).fill('');
                }
                // Array initialization with values: new int[]{1, 2, 3}
                const arrInit = rest.match(/\w+\[\]\{([^}]*)\}/);
                if (arrInit) return arrInit[1].split(',').map(v => evaluateExpression(v));
                return null;
            }

            // Array access: arr[index]
            const arrAccess = expr.match(/^(\w+)\[([^\]]+)\]$/);
            if (arrAccess) {
                const arr = variables[arrAccess[1]];
                const idx = evaluateExpression(arrAccess[2]);
                if (Array.isArray(arr)) return arr[idx];
            }

            // Cast: (int), (double), etc.
            const castMatch = expr.match(/^\((?:int|double|float|long|char|byte|short)\)\s*(.+)$/);
            if (castMatch) {
                const val = evaluateExpression(castMatch[1]);
                if (expr.startsWith('(int)')) return Math.trunc(val);
                return val;
            }

            // Variable reference
            if (/^\w+$/.test(expr) && expr in variables) {
                return variables[expr];
            }

            // Increment/decrement
            if (expr.endsWith('++') || expr.endsWith('--')) {
                const name = expr.slice(0, -2);
                if (name in variables) {
                    const old = variables[name];
                    variables[name] = expr.endsWith('++') ? old + 1 : old - 1;
                    return old;
                }
            }
            if (expr.startsWith('++') || expr.startsWith('--')) {
                const name = expr.slice(2);
                if (name in variables) {
                    variables[name] = expr.startsWith('++') ? variables[name] + 1 : variables[name] - 1;
                    return variables[name];
                }
            }

            return expr; // fallback: return as string
        }

        function splitOnOperator(expr, op) {
            const parts = [];
            let depth = 0;
            let current = '';
            let inStr = false;
            for (let i = 0; i < expr.length; i++) {
                const ch = expr[i];
                if (ch === '"' && (i === 0 || expr[i - 1] !== '\\')) { inStr = !inStr; current += ch; continue; }
                if (inStr) { current += ch; continue; }
                if (ch === '(' || ch === '[') depth++;
                if (ch === ')' || ch === ']') depth--;
                if (depth === 0 && expr.slice(i, i + op.length) === op && op.length === 1 &&
                    !(op === '-' && i > 0 && '+-*/%=(<>!&|'.includes(expr[i - 1]))) {
                    parts.push(current);
                    current = '';
                    i += op.length - 1;
                    continue;
                }
                current += ch;
            }
            parts.push(current);
            return parts.length > 1 ? parts : [expr];
        }

        function findMatchingBrace(startIdx) {
            let braces = 0;
            for (let j = startIdx; j < codeLines.length; j++) {
                const t = codeLines[j].text;
                for (const ch of t) {
                    if (ch === '{') braces++;
                    if (ch === '}') braces--;
                }
                if (braces <= 0) return j;
            }
            return codeLines.length - 1;
        }

        function findElse(startIdx, endIdx) {
            for (let j = endIdx; j < codeLines.length; j++) {
                const t = codeLines[j].text.trim();
                if (t.startsWith('else if') || t.startsWith('} else if') || t === 'else {' || t === '} else {' || t.startsWith('else')) return j;
                if (t && !t.startsWith('}')) break;
            }
            return -1;
        }

        function executeLine(line, origLine, allLines, idx) {
            // Skip braces and empty
            if (line === '{' || line === '}' || line === '') return null;

            // System.out.println / System.out.print
            if (line.startsWith('System.out.print')) {
                const isLn = line.includes('println');
                const match = line.match(/System\.out\.print(?:ln)?\(([^;]*)\);?/);
                if (match) {
                    const val = evaluateExpression(match[1]);
                    const str = typeof val === 'string' ? val : formatValue(val);
                    output += str + (isLn ? '\n' : '');
                    snapshot(origLine, `print: ${str}`, [], 'print');
                }
                return null;
            }

            // Variable declaration with type
            const declMatch = line.match(/^(?:final\s+)?(?:int|double|float|long|short|byte|char|boolean|String|var|Random|Scanner|[\w<>]+(?:\[\])?)\s+(\w+)\s*=\s*(.+?);?\s*$/);
            if (declMatch) {
                const name = declMatch[1];
                const val = evaluateExpression(declMatch[2]);
                variables[name] = val;
                snapshot(origLine, `Initialize ${name} = ${formatValue(val)}`, [name], 'var-init');
                return null;
            }

            // Variable declaration without assignment
            const declOnlyMatch = line.match(/^(?:int|double|float|long|short|byte|char|boolean|String)\s+(\w+)\s*;?\s*$/);
            if (declOnlyMatch) {
                const name = declOnlyMatch[1];
                variables[name] = 0;
                snapshot(origLine, `Declare ${name}`, [name], 'var-init');
                return null;
            }

            // Array assignment: arr[i] = val
            const arrAssignMatch = line.match(/^(\w+)\[([^\]]+)\]\s*=\s*(.+?);?\s*$/);
            if (arrAssignMatch) {
                const arrName = arrAssignMatch[1];
                const index = evaluateExpression(arrAssignMatch[2]);
                const val = evaluateExpression(arrAssignMatch[3]);
                if (Array.isArray(variables[arrName])) {
                    variables[arrName][index] = val;
                    snapshot(origLine, `Update ${arrName}[${index}] = ${formatValue(val)}`, [arrName], 'var-update');
                }
                return null;
            }

            // Assignment: name = val
            const assignMatch = line.match(/^(\w+)\s*([\+\-\*\/]?=)\s*(.+?);?\s*$/);
            if (assignMatch && !line.includes('==') && !line.match(/^(?:int|double|float|String|boolean|long|char|short|byte|var|Random|Scanner)/)) {
                const name = assignMatch[1];
                const op = assignMatch[2];
                const val = evaluateExpression(assignMatch[3]);
                const old = variables[name];
                switch (op) {
                    case '=': variables[name] = val; break;
                    case '+=': variables[name] = typeof variables[name] === 'string' ? variables[name] + val : variables[name] + val; break;
                    case '-=': variables[name] -= val; break;
                    case '*=': variables[name] *= val; break;
                    case '/=': variables[name] /= val; break;
                }
                snapshot(origLine, `${old === undefined ? 'Initialize' : 'Update'} ${name} = ${formatValue(variables[name])}`, [name], old === undefined ? 'var-init' : 'var-update');
                return null;
            }

            // Increment/decrement: i++ / i-- / ++i / --i
            const incMatch = line.match(/^(\w+)\s*(\+\+|--)\s*;?\s*$/);
            if (incMatch) {
                const name = incMatch[1];
                const old = variables[name];
                variables[name] = incMatch[2] === '++' ? old + 1 : old - 1;
                snapshot(origLine, `Update ${name}: ${old} → ${variables[name]}`, [name], 'var-update');
                return null;
            }

            // If statement
            if (line.startsWith('if') || line.startsWith('} else if') || line.startsWith('else if')) {
                const condMatch = line.match(/(?:else\s+)?if\s*\((.+)\)\s*\{?/);
                if (condMatch) {
                    const condVal = evaluateExpression(condMatch[1]);
                    if (condVal) {
                        snapshot(origLine, `if condition is true`, [], 'if-true');
                        // Execute block
                        let j = idx + 1;
                        while (j < codeLines.length && codeLines[j].text !== '}' && !codeLines[j].text.startsWith('} else')) {
                            const r = executeLine(codeLines[j].text, codeLines[j].originalLine, codeLines, j);
                            j = (r && r.skip) ? r.skip : j + 1;
                        }
                        // Skip past the else block if exists
                        if (j < codeLines.length) {
                            const endBrace = j;
                            const elseIdx = findElse(idx, endBrace + 1);
                            if (elseIdx > 0) {
                                j = elseIdx;
                                let braceCnt = 0;
                                while (j < codeLines.length) {
                                    for (const ch of codeLines[j].text) { if (ch === '{') braceCnt++; if (ch === '}') braceCnt--; }
                                    j++;
                                    if (braceCnt <= 0) break;
                                }
                            } else { j = endBrace + 1; }
                        }
                        return { skip: j };
                    } else {
                        snapshot(origLine, `if condition is false`, [], 'if-false');
                        // Skip to else or end
                        let j = idx + 1;
                        while (j < codeLines.length && codeLines[j].text !== '}' && !codeLines[j].text.startsWith('} else')) j++;
                        if (j < codeLines.length && (codeLines[j].text.startsWith('} else') || codeLines[j].text === 'else {')) {
                            return { skip: j };
                        }
                        return { skip: j + 1 };
                    }
                }
            }

            // Else
            if (line.startsWith('else') || line.startsWith('} else {') || line === 'else {') {
                snapshot(origLine, `else branch taken`, [], 'else');
                let j = idx + 1;
                while (j < codeLines.length && codeLines[j].text !== '}') {
                    const r = executeLine(codeLines[j].text, codeLines[j].originalLine, codeLines, j);
                    j = (r && r.skip) ? r.skip : j + 1;
                }
                return { skip: j + 1 };
            }

            // For loop
            if (line.startsWith('for')) {
                const forMatch = line.match(/for\s*\((.+?);(.+?);(.+?)\)\s*\{?/);
                if (forMatch) {
                    // Init
                    executeLine(forMatch[1].trim() + ';', origLine, codeLines, idx);
                    let iteration = 0;
                    // Find loop body
                    const bodyStart = idx + 1;
                    let bodyEnd = bodyStart;
                    let braceCnt = 1;
                    for (let j = bodyStart; j < codeLines.length; j++) {
                        for (const ch of codeLines[j].text) { if (ch === '{') braceCnt++; if (ch === '}') braceCnt--; }
                        if (braceCnt <= 0) { bodyEnd = j; break; }
                    }
                    while (evaluateExpression(forMatch[2].trim())) {
                        iteration++;
                        if (iteration > MAX_STEPS) break;
                        snapshot(origLine, `for loop — iteration ${iteration}`, [], 'loop-iteration', { iteration });
                        for (let j = bodyStart; j < bodyEnd; j++) {
                            const r = executeLine(codeLines[j].text, codeLines[j].originalLine, codeLines, j);
                            if (r && r.skip) j = r.skip - 1;
                        }
                        // Update
                        const update = forMatch[3].trim();
                        if (update.includes('++')) { const v = update.replace(/[+;]/g, '').trim(); variables[v]++; }
                        else if (update.includes('--')) { const v = update.replace(/[-;]/g, '').trim(); variables[v]--; }
                        else executeLine(update + ';', origLine, codeLines, idx);
                    }
                    snapshot(origLine, `for loop completed (${iteration} iterations)`, [], 'loop-end');
                    return { skip: bodyEnd + 1 };
                }
            }

            // While loop
            if (line.startsWith('while')) {
                const whileMatch = line.match(/while\s*\((.+)\)\s*\{?/);
                if (whileMatch) {
                    const bodyStart = idx + 1;
                    let bodyEnd = bodyStart;
                    let braceCnt = 1;
                    for (let j = bodyStart; j < codeLines.length; j++) {
                        for (const ch of codeLines[j].text) { if (ch === '{') braceCnt++; if (ch === '}') braceCnt--; }
                        if (braceCnt <= 0) { bodyEnd = j; break; }
                    }
                    let iteration = 0;
                    while (evaluateExpression(whileMatch[1])) {
                        iteration++;
                        if (iteration > MAX_STEPS) break;
                        snapshot(origLine, `while loop — iteration ${iteration}`, [], 'loop-iteration', { iteration });
                        for (let j = bodyStart; j < bodyEnd; j++) {
                            const r = executeLine(codeLines[j].text, codeLines[j].originalLine, codeLines, j);
                            if (r && r.skip) j = r.skip - 1;
                        }
                    }
                    snapshot(origLine, `while loop ended (${iteration} iterations)`, [], 'loop-end');
                    return { skip: bodyEnd + 1 };
                }
            }

            // Standalone expressions (method calls etc.)
            if (line.endsWith(';')) {
                evaluateExpression(line.slice(0, -1));
            }

            return null;
        }

    } catch (e) {
        const lineMatch = e.message.match(/line (\d+)/);
        return {
            steps, output,
            error: { message: e.message, line: lineMatch ? parseInt(lineMatch[1]) : steps.length > 0 ? steps[steps.length - 1].line : 1 },
        };
    }

    return { steps, error: null, output };
}

export { formatValue, getType };
