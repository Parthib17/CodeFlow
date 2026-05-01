/**
 * Python Subset Interpreter / Simulator
 * Supports: variables, arithmetic, strings, lists, if/elif/else, while, for-range loops, print
 * Produces a snapshot of state at every executed line.
 */

/* ── Tokenizer ────────────────────────────────────────────── */
const TOKEN_TYPES = {
    NUMBER: 'NUMBER',
    STRING: 'STRING',
    BOOLEAN: 'BOOLEAN',
    NONE: 'NONE',
    IDENT: 'IDENT',
    OP: 'OP',
    COMP: 'COMP',
    ASSIGN: 'ASSIGN',
    LPAREN: 'LPAREN',
    RPAREN: 'RPAREN',
    LBRACKET: 'LBRACKET',
    RBRACKET: 'RBRACKET',
    COMMA: 'COMMA',
    COLON: 'COLON',
    KEYWORD: 'KEYWORD',
    NEWLINE: 'NEWLINE',
    INDENT: 'INDENT',
    DEDENT: 'DEDENT',
    EOF: 'EOF',
    LOGICAL: 'LOGICAL',
    NOT: 'NOT',
    DOT: 'DOT',
};

const KEYWORDS = new Set([
    'if', 'elif', 'else', 'while', 'for', 'in', 'range', 'print',
    'True', 'False', 'None', 'and', 'or', 'not', 'break', 'continue',
    'def', 'return', 'pass', 'append', 'pop', 'len', 'input', 'int', 'str', 'float',
    'list', 'abs', 'min', 'max', 'sum', 'sorted', 'reversed', 'enumerate', 'zip', 'map', 'filter',
    'type', 'isinstance', 'round', 'pow', 'divmod', 'chr', 'ord', 'hex', 'oct', 'bin', 'bool',
]);

function tokenize(source) {
    const lines = source.split('\n');
    const tokens = [];
    const indentStack = [0];

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const rawLine = lines[lineIdx];
        // skip blank / comment-only lines
        const stripped = rawLine.trimStart();
        if (stripped === '' || stripped.startsWith('#')) continue;

        // calculate indent level
        let indent = 0;
        for (const ch of rawLine) {
            if (ch === ' ') indent++;
            else if (ch === '\t') indent += 4;
            else break;
        }

        // emit INDENT/DEDENT tokens
        if (indent > indentStack[indentStack.length - 1]) {
            indentStack.push(indent);
            tokens.push({ type: TOKEN_TYPES.INDENT, line: lineIdx });
        }
        while (indent < indentStack[indentStack.length - 1]) {
            indentStack.pop();
            tokens.push({ type: TOKEN_TYPES.DEDENT, line: lineIdx });
        }

        // tokenize the line content
        let i = indent;
        while (i < rawLine.length) {
            const ch = rawLine[i];
            if (ch === ' ' || ch === '\t') { i++; continue; }
            if (ch === '#') break; // comment

            // strings
            if (ch === '"' || ch === "'") {
                const quote = ch;
                let str = '';
                i++;
                while (i < rawLine.length && rawLine[i] !== quote) {
                    if (rawLine[i] === '\\' && i + 1 < rawLine.length) {
                        const esc = rawLine[i + 1];
                        if (esc === 'n') str += '\n';
                        else if (esc === 't') str += '\t';
                        else if (esc === '\\') str += '\\';
                        else if (esc === quote) str += quote;
                        else str += '\\' + esc;
                        i += 2;
                    } else {
                        str += rawLine[i];
                        i++;
                    }
                }
                i++; // skip closing quote
                tokens.push({ type: TOKEN_TYPES.STRING, value: str, line: lineIdx });
                continue;
            }

            // numbers
            if (/\d/.test(ch) || (ch === '-' && i + 1 < rawLine.length && /\d/.test(rawLine[i + 1]) && (tokens.length === 0 || ['OP', 'COMP', 'ASSIGN', 'LPAREN', 'LBRACKET', 'COMMA', 'KEYWORD', 'LOGICAL', 'NOT', 'COLON'].includes(tokens[tokens.length - 1]?.type)))) {
                let num = '';
                if (ch === '-') { num += '-'; i++; }
                while (i < rawLine.length && /[\d.]/.test(rawLine[i])) {
                    num += rawLine[i]; i++;
                }
                tokens.push({ type: TOKEN_TYPES.NUMBER, value: num.includes('.') ? parseFloat(num) : parseInt(num, 10), line: lineIdx });
                continue;
            }

            // two-char operators
            if (i + 1 < rawLine.length) {
                const two = rawLine[i] + rawLine[i + 1];
                if (two === '**') {
                    tokens.push({ type: TOKEN_TYPES.OP, value: '**', line: lineIdx });
                    i += 2;
                    continue;
                }
                if (['==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '//'].includes(two)) {
                    if (['==', '!=', '<=', '>='].includes(two)) {
                        tokens.push({ type: TOKEN_TYPES.COMP, value: two, line: lineIdx });
                    } else if (['+=', '-=', '*=', '/='].includes(two)) {
                        tokens.push({ type: TOKEN_TYPES.ASSIGN, value: two, line: lineIdx });
                    } else if (two === '//') {
                        tokens.push({ type: TOKEN_TYPES.OP, value: '//', line: lineIdx });
                    }
                    i += 2;
                    continue;
                }
            }

            // single-char
            if ('+-*/%'.includes(ch)) {
                tokens.push({ type: TOKEN_TYPES.OP, value: ch, line: lineIdx });
                i++; continue;
            }
            if (ch === '<' || ch === '>') {
                tokens.push({ type: TOKEN_TYPES.COMP, value: ch, line: lineIdx });
                i++; continue;
            }
            if (ch === '=') {
                tokens.push({ type: TOKEN_TYPES.ASSIGN, value: '=', line: lineIdx });
                i++; continue;
            }
            if (ch === '(') { tokens.push({ type: TOKEN_TYPES.LPAREN, line: lineIdx }); i++; continue; }
            if (ch === ')') { tokens.push({ type: TOKEN_TYPES.RPAREN, line: lineIdx }); i++; continue; }
            if (ch === '[') { tokens.push({ type: TOKEN_TYPES.LBRACKET, line: lineIdx }); i++; continue; }
            if (ch === ']') { tokens.push({ type: TOKEN_TYPES.RBRACKET, line: lineIdx }); i++; continue; }
            if (ch === ',') { tokens.push({ type: TOKEN_TYPES.COMMA, line: lineIdx }); i++; continue; }
            if (ch === ':') { tokens.push({ type: TOKEN_TYPES.COLON, line: lineIdx }); i++; continue; }
            if (ch === '.') { tokens.push({ type: TOKEN_TYPES.DOT, line: lineIdx }); i++; continue; }

            // identifiers and keywords
            if (/[a-zA-Z_]/.test(ch)) {
                let ident = '';
                while (i < rawLine.length && /[a-zA-Z0-9_]/.test(rawLine[i])) {
                    ident += rawLine[i]; i++;
                }
                if (ident === 'True') tokens.push({ type: TOKEN_TYPES.BOOLEAN, value: true, line: lineIdx });
                else if (ident === 'False') tokens.push({ type: TOKEN_TYPES.BOOLEAN, value: false, line: lineIdx });
                else if (ident === 'None') tokens.push({ type: TOKEN_TYPES.NONE, value: null, line: lineIdx });
                else if (ident === 'and' || ident === 'or') tokens.push({ type: TOKEN_TYPES.LOGICAL, value: ident, line: lineIdx });
                else if (ident === 'not') tokens.push({ type: TOKEN_TYPES.NOT, value: 'not', line: lineIdx });
                else if (KEYWORDS.has(ident)) tokens.push({ type: TOKEN_TYPES.KEYWORD, value: ident, line: lineIdx });
                else tokens.push({ type: TOKEN_TYPES.IDENT, value: ident, line: lineIdx });
                continue;
            }

            i++; // skip unknown
        }
        tokens.push({ type: TOKEN_TYPES.NEWLINE, line: lineIdx });
    }

    // emit remaining DEDENTs
    while (indentStack.length > 1) {
        indentStack.pop();
        tokens.push({ type: TOKEN_TYPES.DEDENT, line: lines.length - 1 });
    }
    tokens.push({ type: TOKEN_TYPES.EOF, line: lines.length - 1 });
    return tokens;
}

/* ── Parser ───────────────────────────────────────────────── */
class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.pos = 0;
    }

    peek() { return this.tokens[this.pos] || { type: TOKEN_TYPES.EOF }; }
    advance() { return this.tokens[this.pos++]; }
    expect(type) {
        const tok = this.advance();
        if (tok.type !== type) throw new Error(`Expected ${type} but got ${tok.type} (${tok.value}) at line ${tok.line + 1}`);
        return tok;
    }
    match(type, value) {
        const tok = this.peek();
        if (tok.type === type && (value === undefined || tok.value === value)) {
            return this.advance();
        }
        return null;
    }
    skipNewlines() { while (this.peek().type === TOKEN_TYPES.NEWLINE) this.advance(); }

    parse() {
        const stmts = [];
        this.skipNewlines();
        while (this.peek().type !== TOKEN_TYPES.EOF) {
            stmts.push(this.parseStatement());
            this.skipNewlines();
        }
        return { type: 'Program', body: stmts };
    }

    parseStatement() {
        const tok = this.peek();

        if (tok.type === TOKEN_TYPES.KEYWORD) {
            switch (tok.value) {
                case 'if': return this.parseIf();
                case 'while': return this.parseWhile();
                case 'for': return this.parseFor();
                case 'print': return this.parsePrint();
                case 'break': this.advance(); this.skipNewlines(); return { type: 'Break', line: tok.line };
                case 'continue': this.advance(); this.skipNewlines(); return { type: 'Continue', line: tok.line };
                case 'pass': this.advance(); this.skipNewlines(); return { type: 'Pass', line: tok.line };
                case 'def': return this.parseDef();
                case 'return': return this.parseReturn();
            }
        }

        // assignment or expression statement
        return this.parseAssignmentOrExpr();
    }

    parseAssignmentOrExpr() {
        const startLine = this.peek().line;
        const expr = this.parseExpression();

        // Check for .append() or .pop() style calls already handled in expression
        // Check for assignment
        const tok = this.peek();
        if (tok.type === TOKEN_TYPES.ASSIGN) {
            const op = this.advance().value;
            const value = this.parseExpression();
            this.skipNewlines();

            // handle list index assignment: expr might be { type: 'Index', object, index }
            if (expr.type === 'Index') {
                return { type: 'IndexAssign', object: expr.object, index: expr.index, op, value, line: startLine };
            }
            return { type: 'Assignment', name: expr.name || expr.value, op, value, line: startLine };
        }

        this.skipNewlines();
        return { type: 'ExprStatement', expr, line: startLine };
    }

    parseExpression() {
        return this.parseLogical();
    }

    parseLogical() {
        let left = this.parseNot();
        while (this.peek().type === TOKEN_TYPES.LOGICAL) {
            const op = this.advance().value;
            const right = this.parseNot();
            left = { type: 'Logical', op, left, right, line: left.line };
        }
        return left;
    }

    parseNot() {
        if (this.peek().type === TOKEN_TYPES.NOT) {
            const tok = this.advance();
            const operand = this.parseNot();
            return { type: 'Not', operand, line: tok.line };
        }
        return this.parseComparison();
    }

    parseComparison() {
        let left = this.parseAddSub();
        while (this.peek().type === TOKEN_TYPES.COMP) {
            const op = this.advance().value;
            const right = this.parseAddSub();
            left = { type: 'Comparison', op, left, right, line: left.line };
        }
        // handle 'in' keyword for membership
        if (this.peek().type === TOKEN_TYPES.KEYWORD && this.peek().value === 'in') {
            this.advance();
            const right = this.parseAddSub();
            left = { type: 'Comparison', op: 'in', left, right, line: left.line };
        }
        return left;
    }

    parseAddSub() {
        let left = this.parseMulDiv();
        while (this.peek().type === TOKEN_TYPES.OP && (this.peek().value === '+' || this.peek().value === '-')) {
            const op = this.advance().value;
            const right = this.parseMulDiv();
            left = { type: 'BinaryOp', op, left, right, line: left.line };
        }
        return left;
    }

    parseMulDiv() {
        let left = this.parsePower();
        while (this.peek().type === TOKEN_TYPES.OP && ['*', '/', '%', '//'].includes(this.peek().value)) {
            const op = this.advance().value;
            const right = this.parsePower();
            left = { type: 'BinaryOp', op, left, right, line: left.line };
        }
        return left;
    }

    parsePower() {
        let left = this.parseUnary();
        if (this.peek().type === TOKEN_TYPES.OP && this.peek().value === '**') {
            const op = this.advance().value;
            const right = this.parseUnary();
            left = { type: 'BinaryOp', op, left, right, line: left.line };
        }
        return left;
    }

    parseUnary() {
        if (this.peek().type === TOKEN_TYPES.OP && this.peek().value === '-') {
            const tok = this.advance();
            const operand = this.parseUnary();
            return { type: 'UnaryOp', op: '-', operand, line: tok.line };
        }
        return this.parsePostfix();
    }

    parsePostfix() {
        let expr = this.parsePrimary();

        while (true) {
            // Index access
            if (this.peek().type === TOKEN_TYPES.LBRACKET) {
                this.advance();
                const index = this.parseExpression();
                this.expect(TOKEN_TYPES.RBRACKET);
                expr = { type: 'Index', object: expr, index, line: expr.line };
                continue;
            }

            // Dot access for method calls
            if (this.peek().type === TOKEN_TYPES.DOT) {
                this.advance();
                // Method name can be either a keyword (like 'append', 'sort') or an identifier
                const tok = this.peek();
                let method;
                if (tok.type === TOKEN_TYPES.KEYWORD || tok.type === TOKEN_TYPES.IDENT) {
                    method = this.advance().value;
                } else {
                    throw new Error(`Expected method name after '.' at line ${tok.line + 1}`);
                }
                if (this.peek().type === TOKEN_TYPES.LPAREN) {
                    this.advance();
                    const args = [];
                    if (this.peek().type !== TOKEN_TYPES.RPAREN) {
                        args.push(this.parseExpression());
                        while (this.match(TOKEN_TYPES.COMMA)) args.push(this.parseExpression());
                    }
                    this.expect(TOKEN_TYPES.RPAREN);
                    expr = { type: 'MethodCall', object: expr, method, args, line: expr.line };
                }
                continue;
            }

            // Function call
            if (this.peek().type === TOKEN_TYPES.LPAREN && expr.type === 'Identifier') {
                this.advance();
                const args = [];
                if (this.peek().type !== TOKEN_TYPES.RPAREN) {
                    args.push(this.parseExpression());
                    while (this.match(TOKEN_TYPES.COMMA)) args.push(this.parseExpression());
                }
                this.expect(TOKEN_TYPES.RPAREN);
                expr = { type: 'FuncCall', name: expr.name, args, line: expr.line };
                continue;
            }

            break;
        }

        return expr;
    }

    parsePrimary() {
        const tok = this.peek();

        if (tok.type === TOKEN_TYPES.NUMBER) {
            this.advance();
            return { type: 'Number', value: tok.value, line: tok.line };
        }
        if (tok.type === TOKEN_TYPES.STRING) {
            this.advance();
            return { type: 'String', value: tok.value, line: tok.line };
        }
        if (tok.type === TOKEN_TYPES.BOOLEAN) {
            this.advance();
            return { type: 'Boolean', value: tok.value, line: tok.line };
        }
        if (tok.type === TOKEN_TYPES.NONE) {
            this.advance();
            return { type: 'NoneValue', value: null, line: tok.line };
        }
        if (tok.type === TOKEN_TYPES.IDENT) {
            this.advance();
            return { type: 'Identifier', name: tok.value, line: tok.line };
        }

        // List literal
        if (tok.type === TOKEN_TYPES.LBRACKET) {
            this.advance();
            const elements = [];
            if (this.peek().type !== TOKEN_TYPES.RBRACKET) {
                elements.push(this.parseExpression());
                while (this.match(TOKEN_TYPES.COMMA)) {
                    if (this.peek().type === TOKEN_TYPES.RBRACKET) break;
                    elements.push(this.parseExpression());
                }
            }
            this.expect(TOKEN_TYPES.RBRACKET);
            return { type: 'ListLiteral', elements, line: tok.line };
        }

        // Parenthesized expression
        if (tok.type === TOKEN_TYPES.LPAREN) {
            this.advance();
            const expr = this.parseExpression();
            this.expect(TOKEN_TYPES.RPAREN);
            return expr;
        }

        // Built-in functions used as primary
        if (tok.type === TOKEN_TYPES.KEYWORD && ['range', 'len', 'int', 'str', 'float', 'list', 'abs', 'min', 'max', 'sum', 'input', 'print',
            'sorted', 'reversed', 'enumerate', 'zip', 'map', 'filter', 'type', 'isinstance', 'round', 'pow', 'divmod',
            'chr', 'ord', 'hex', 'oct', 'bin', 'bool', 'pass'].includes(tok.value)) {
            this.advance();
            if (tok.value === 'print' || tok.value === 'pass') {
                // print/pass used as expression? treat as ident
                return { type: 'Identifier', name: tok.value, line: tok.line };
            }
            if (this.peek().type === TOKEN_TYPES.LPAREN) {
                this.advance();
                const args = [];
                if (this.peek().type !== TOKEN_TYPES.RPAREN) {
                    args.push(this.parseExpression());
                    while (this.match(TOKEN_TYPES.COMMA)) args.push(this.parseExpression());
                }
                this.expect(TOKEN_TYPES.RPAREN);
                return { type: 'FuncCall', name: tok.value, args, line: tok.line };
            }
            return { type: 'Identifier', name: tok.value, line: tok.line };
        }

        throw new Error(`Unexpected token: ${tok.type} (${tok.value}) at line ${tok.line + 1}`);
    }

    parseBlock() {
        this.expect(TOKEN_TYPES.COLON);
        this.skipNewlines();
        this.expect(TOKEN_TYPES.INDENT);
        const stmts = [];
        this.skipNewlines();
        while (this.peek().type !== TOKEN_TYPES.DEDENT && this.peek().type !== TOKEN_TYPES.EOF) {
            stmts.push(this.parseStatement());
            this.skipNewlines();
        }
        if (this.peek().type === TOKEN_TYPES.DEDENT) this.advance();
        return stmts;
    }

    parseIf() {
        this.expect(TOKEN_TYPES.KEYWORD); // 'if'
        const line = this.tokens[this.pos - 1].line;
        const condition = this.parseExpression();
        const body = this.parseBlock();

        const branches = [{ condition, body, line }];
        this.skipNewlines();
        // elif
        while (this.peek().type === TOKEN_TYPES.KEYWORD && this.peek().value === 'elif') {
            this.advance();
            const elifLine = this.tokens[this.pos - 1].line;
            const elifCond = this.parseExpression();
            const elifBody = this.parseBlock();
            branches.push({ condition: elifCond, body: elifBody, line: elifLine });
            this.skipNewlines();
        }
        // else
        let elseBody = null;
        let elseLine = null;
        if (this.peek().type === TOKEN_TYPES.KEYWORD && this.peek().value === 'else') {
            this.advance();
            elseLine = this.tokens[this.pos - 1].line;
            elseBody = this.parseBlock();
        }

        return { type: 'If', branches, elseBody, elseLine, line };
    }

    parseWhile() {
        this.expect(TOKEN_TYPES.KEYWORD); // 'while'
        const line = this.tokens[this.pos - 1].line;
        const condition = this.parseExpression();
        const body = this.parseBlock();
        return { type: 'While', condition, body, line };
    }

    parseFor() {
        this.expect(TOKEN_TYPES.KEYWORD); // 'for'
        const line = this.tokens[this.pos - 1].line;
        const varName = this.expect(TOKEN_TYPES.IDENT).value;
        this.expect(TOKEN_TYPES.KEYWORD); // 'in'
        const iterable = this.parseExpression();
        const body = this.parseBlock();
        return { type: 'For', varName, iterable, body, line };
    }

    parsePrint() {
        this.expect(TOKEN_TYPES.KEYWORD); // 'print'
        const line = this.tokens[this.pos - 1].line;
        this.expect(TOKEN_TYPES.LPAREN);
        const args = [];
        if (this.peek().type !== TOKEN_TYPES.RPAREN) {
            args.push(this.parseExpression());
            while (this.match(TOKEN_TYPES.COMMA)) args.push(this.parseExpression());
        }
        this.expect(TOKEN_TYPES.RPAREN);
        this.skipNewlines();
        return { type: 'Print', args, line };
    }

    parseDef() {
        this.expect(TOKEN_TYPES.KEYWORD); // 'def'
        const line = this.tokens[this.pos - 1].line;
        const name = this.expect(TOKEN_TYPES.IDENT).value;
        this.expect(TOKEN_TYPES.LPAREN);
        const params = [];
        if (this.peek().type !== TOKEN_TYPES.RPAREN) {
            params.push(this.expect(TOKEN_TYPES.IDENT).value);
            while (this.match(TOKEN_TYPES.COMMA)) params.push(this.expect(TOKEN_TYPES.IDENT).value);
        }
        this.expect(TOKEN_TYPES.RPAREN);
        const body = this.parseBlock();
        return { type: 'FuncDef', name, params, body, line };
    }

    parseReturn() {
        this.expect(TOKEN_TYPES.KEYWORD); // 'return'
        const line = this.tokens[this.pos - 1].line;
        let value = null;
        if (this.peek().type !== TOKEN_TYPES.NEWLINE && this.peek().type !== TOKEN_TYPES.EOF && this.peek().type !== TOKEN_TYPES.DEDENT) {
            value = this.parseExpression();
        }
        this.skipNewlines();
        return { type: 'Return', value, line };
    }
}

/* ── Interpreter ──────────────────────────────────────────── */
const MAX_STEPS = 5000;

class BreakSignal { }
class ContinueSignal { }
class ReturnSignal {
    constructor(value) { this.value = value; }
}

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
    if (val === null || val === undefined) return 'None';
    if (typeof val === 'boolean') return val ? 'True' : 'False';
    if (typeof val === 'string') return `"${val}"`;
    if (Array.isArray(val)) return `[${val.map(formatValue).join(', ')}]`;
    return String(val);
}

function getType(val) {
    if (val === null || val === undefined) return 'NoneType';
    if (typeof val === 'boolean') return 'bool';
    if (typeof val === 'number') return Number.isInteger(val) ? 'int' : 'float';
    if (typeof val === 'string') return 'str';
    if (Array.isArray(val)) return 'list';
    return 'object';
}

export function executePython(source) {
    const tokens = tokenize(source);
    const parser = new Parser(tokens);
    let ast;
    try {
        ast = parser.parse();
    } catch (e) {
        return {
            steps: [],
            error: { message: e.message, line: 0 },
            output: '',
        };
    }

    const steps = [];
    const variables = {};
    const functions = {};
    let output = '';
    let stepCount = 0;

    function snapshot(line, description, changedVars = [], flowType = null, flowDetail = null) {
        stepCount++;
        if (stepCount > MAX_STEPS) throw new Error('Maximum execution steps exceeded (possible infinite loop)');

        const varSnapshot = {};
        for (const [k, v] of Object.entries(variables)) {
            varSnapshot[k] = {
                value: deepClone(v),
                display: formatValue(v),
                type: getType(v),
            };
        }

        steps.push({
            step: steps.length + 1,
            line: line + 1, // 1-indexed
            description,
            variables: varSnapshot,
            changedVars,
            output: output,
            flowType: flowType, // 'if-true', 'if-false', 'loop-iteration', 'loop-end', etc
            flowDetail: flowDetail,
            dataStructures: detectDataStructures(varSnapshot),
        });
    }

    function detectDataStructures(vars) {
        const ds = [];
        for (const [name, info] of Object.entries(vars)) {
            if (Array.isArray(info.value)) {
                ds.push({
                    name,
                    type: 'array',
                    values: info.value.map(v => ({ value: v, display: formatValue(v) })),
                });
            }
        }
        return ds;
    }

    function evaluate(node) {
        if (!node) return null;
        switch (node.type) {
            case 'Number': return node.value;
            case 'String': return node.value;
            case 'Boolean': return node.value;
            case 'NoneValue': return null;
            case 'Identifier': {
                if (node.name in variables) return variables[node.name];
                throw new Error(`NameError: name '${node.name}' is not defined (line ${node.line + 1})`);
            }
            case 'ListLiteral': return node.elements.map(evaluate);
            case 'BinaryOp': {
                const l = evaluate(node.left);
                const r = evaluate(node.right);
                switch (node.op) {
                    case '+':
                        if (typeof l === 'string' || typeof r === 'string') return String(l) + String(r);
                        if (Array.isArray(l) && Array.isArray(r)) return [...l, ...r];
                        return l + r;
                    case '-': return l - r;
                    case '*':
                        if (typeof l === 'string' && typeof r === 'number') return l.repeat(r);
                        if (Array.isArray(l) && typeof r === 'number') { let res = []; for (let i = 0; i < r; i++) res = [...res, ...l]; return res; }
                        return l * r;
                    case '/': {
                        if (r === 0) throw new Error(`ZeroDivisionError: division by zero (line ${node.line + 1})`);
                        return l / r;
                    }
                    case '//': {
                        if (r === 0) throw new Error(`ZeroDivisionError: integer division by zero (line ${node.line + 1})`);
                        return Math.floor(l / r);
                    }
                    case '%': return ((l % r) + r) % r; // Python modulo
                    case '**': return Math.pow(l, r);
                    default: throw new Error(`Unknown operator: ${node.op}`);
                }
            }
            case 'UnaryOp': {
                const val = evaluate(node.operand);
                if (node.op === '-') return -val;
                return val;
            }
            case 'Comparison': {
                const l = evaluate(node.left);
                const r = evaluate(node.right);
                switch (node.op) {
                    case '==': return l === r || (JSON.stringify(l) === JSON.stringify(r));
                    case '!=': return l !== r && (JSON.stringify(l) !== JSON.stringify(r));
                    case '<': return l < r;
                    case '>': return l > r;
                    case '<=': return l <= r;
                    case '>=': return l >= r;
                    case 'in':
                        if (typeof r === 'string') return r.includes(l);
                        if (Array.isArray(r)) return r.includes(l);
                        return false;
                    default: throw new Error(`Unknown comparison: ${node.op}`);
                }
            }
            case 'Logical': {
                const l = evaluate(node.left);
                if (node.op === 'and') return l ? evaluate(node.right) : l;
                if (node.op === 'or') return l ? l : evaluate(node.right);
                return l;
            }
            case 'Not': return !evaluate(node.operand);
            case 'Index': {
                const obj = evaluate(node.object);
                let idx = evaluate(node.index);
                if (Array.isArray(obj)) {
                    if (idx < 0) idx = obj.length + idx;
                    if (idx < 0 || idx >= obj.length) throw new Error(`IndexError: list index out of range (line ${node.line + 1})`);
                    return obj[idx];
                }
                if (typeof obj === 'string') {
                    if (idx < 0) idx = obj.length + idx;
                    return obj[idx];
                }
                throw new Error(`TypeError: object is not subscriptable (line ${node.line + 1})`);
            }
            case 'FuncCall': return callFunction(node);
            case 'MethodCall': return callMethod(node);
            default: throw new Error(`Cannot evaluate node type: ${node.type}`);
        }
    }

    function callFunction(node) {
        const args = node.args.map(evaluate);
        switch (node.name) {
            case 'range': {
                let start = 0, stop, step = 1;
                if (args.length === 1) { stop = args[0]; }
                else if (args.length === 2) { start = args[0]; stop = args[1]; }
                else { start = args[0]; stop = args[1]; step = args[2]; }
                const result = [];
                if (step > 0) { for (let i = start; i < stop; i += step) result.push(i); }
                else if (step < 0) { for (let i = start; i > stop; i += step) result.push(i); }
                return result;
            }
            case 'len': {
                const val = args[0];
                if (typeof val === 'string' || Array.isArray(val)) return val.length;
                throw new Error(`TypeError: object has no len() (line ${node.line + 1})`);
            }
            case 'int': return parseInt(args[0], 10) || 0;
            case 'float': return parseFloat(args[0]) || 0.0;
            case 'str': return formatValue(args[0]);
            case 'abs': return Math.abs(args[0]);
            case 'min': return Array.isArray(args[0]) ? Math.min(...args[0]) : Math.min(...args);
            case 'max': return Array.isArray(args[0]) ? Math.max(...args[0]) : Math.max(...args);
            case 'sum': return Array.isArray(args[0]) ? args[0].reduce((a, b) => a + b, 0) : args.reduce((a, b) => a + b, 0);
            case 'round': return args.length > 1 ? Number(args[0].toFixed(args[1])) : Math.round(args[0]);
            case 'pow': return Math.pow(args[0], args[1]);
            case 'bool': return Boolean(args[0]);
            case 'chr': return String.fromCharCode(args[0]);
            case 'ord': return typeof args[0] === 'string' ? args[0].charCodeAt(0) : 0;
            case 'hex': return '0x' + args[0].toString(16);
            case 'oct': return '0o' + args[0].toString(8);
            case 'bin': return '0b' + args[0].toString(2);
            case 'sorted': {
                const arr = Array.isArray(args[0]) ? [...args[0]] : [];
                arr.sort((a, b) => a - b);
                return arr;
            }
            case 'reversed': {
                const arr = Array.isArray(args[0]) ? [...args[0]] : [];
                arr.reverse();
                return arr;
            }
            case 'type': return getType(args[0]);
            case 'isinstance': return getType(args[0]) === args[1];
            case 'list': {
                if (Array.isArray(args[0])) return [...args[0]];
                if (typeof args[0] === 'string') return args[0].split('');
                return [];
            }
            case 'input': return ''; // Simulate empty input
            default: {
                // user-defined function
                if (node.name in functions) {
                    const funcDef = functions[node.name];
                    const savedVars = { ...variables };
                    for (let i = 0; i < funcDef.params.length; i++) {
                        variables[funcDef.params[i]] = args[i] !== undefined ? args[i] : null;
                    }
                    snapshot(funcDef.line, `Call function ${node.name}(${args.map(formatValue).join(', ')})`, funcDef.params, 'function-call', node.name);
                    try {
                        executeBlock(funcDef.body);
                    } catch (e) {
                        if (e instanceof ReturnSignal) {
                            // restore vars but keep the return value
                            const returnVal = e.value;
                            for (const k of funcDef.params) delete variables[k];
                            Object.assign(variables, savedVars);
                            return returnVal;
                        }
                        throw e;
                    }
                    for (const k of funcDef.params) delete variables[k];
                    Object.assign(variables, savedVars);
                    return null;
                }
                throw new Error(`NameError: name '${node.name}' is not defined (line ${node.line + 1})`);
            }
        }
    }

    function callMethod(node) {
        const obj = evaluate(node.object);
        const args = node.args.map(evaluate);
        const objName = node.object.name || '?';

        if (Array.isArray(obj)) {
            switch (node.method) {
                case 'append': {
                    obj.push(args[0]);
                    if (node.object.name) variables[node.object.name] = obj;
                    return null;
                }
                case 'pop': {
                    const idx = args.length > 0 ? args[0] : obj.length - 1;
                    const val = obj.splice(idx, 1)[0];
                    if (node.object.name) variables[node.object.name] = obj;
                    return val;
                }
                case 'insert': {
                    obj.splice(args[0], 0, args[1]);
                    if (node.object.name) variables[node.object.name] = obj;
                    return null;
                }
                case 'remove': {
                    const idx = obj.indexOf(args[0]);
                    if (idx > -1) obj.splice(idx, 1);
                    if (node.object.name) variables[node.object.name] = obj;
                    return null;
                }
                case 'sort': {
                    obj.sort((a, b) => a - b);
                    if (node.object.name) variables[node.object.name] = obj;
                    return null;
                }
                case 'reverse': {
                    obj.reverse();
                    if (node.object.name) variables[node.object.name] = obj;
                    return null;
                }
                default: throw new Error(`AttributeError: 'list' object has no attribute '${node.method}'`);
            }
        }
        if (typeof obj === 'string') {
            switch (node.method) {
                case 'upper': return obj.toUpperCase();
                case 'lower': return obj.toLowerCase();
                case 'strip': return obj.trim();
                case 'split': return args.length > 0 ? obj.split(args[0]) : obj.split(/\s+/);
                case 'join': return Array.isArray(args[0]) ? args[0].join(obj) : obj;
                case 'replace': return obj.replace(new RegExp(args[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), args[1]);
                case 'find': return obj.indexOf(args[0]);
                case 'count': return (obj.match(new RegExp(args[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
                case 'startswith': return obj.startsWith(args[0]);
                case 'endswith': return obj.endsWith(args[0]);
                default: throw new Error(`AttributeError: 'str' object has no attribute '${node.method}'`);
            }
        }
        throw new Error(`AttributeError: object has no attribute '${node.method}'`);
    }

    function executeBlock(stmts) {
        for (const stmt of stmts) {
            const signal = executeStatement(stmt);
            if (signal instanceof BreakSignal || signal instanceof ContinueSignal || signal instanceof ReturnSignal) {
                return signal;
            }
        }
        return null;
    }

    function executeStatement(stmt) {
        switch (stmt.type) {
            case 'Assignment': {
                const val = evaluate(stmt.value);
                const oldVal = variables[stmt.name];
                switch (stmt.op) {
                    case '=': variables[stmt.name] = val; break;
                    case '+=': variables[stmt.name] = (typeof variables[stmt.name] === 'string') ? variables[stmt.name] + val : variables[stmt.name] + val; break;
                    case '-=': variables[stmt.name] -= val; break;
                    case '*=': variables[stmt.name] *= val; break;
                    case '/=': variables[stmt.name] /= val; break;
                }
                const desc = oldVal === undefined
                    ? `Initialize ${stmt.name} = ${formatValue(variables[stmt.name])}`
                    : `Update ${stmt.name}: ${formatValue(oldVal)} → ${formatValue(variables[stmt.name])}`;
                snapshot(stmt.line, desc, [stmt.name], oldVal === undefined ? 'var-init' : 'var-update');
                break;
            }

            case 'IndexAssign': {
                const obj = evaluate(stmt.object);
                let idx = evaluate(stmt.index);
                const val = evaluate(stmt.value);
                if (Array.isArray(obj)) {
                    if (idx < 0) idx = obj.length + idx;
                    const oldVal = obj[idx];
                    switch (stmt.op) {
                        case '=': obj[idx] = val; break;
                        case '+=': obj[idx] += val; break;
                        case '-=': obj[idx] -= val; break;
                        case '*=': obj[idx] *= val; break;
                        case '/=': obj[idx] /= val; break;
                    }
                    const objName = stmt.object.name || '?';
                    if (stmt.object.name) variables[stmt.object.name] = obj;
                    snapshot(stmt.line, `Update ${objName}[${idx}]: ${formatValue(oldVal)} → ${formatValue(obj[idx])}`, [objName], 'var-update');
                }
                break;
            }

            case 'ExprStatement': {
                const result = evaluate(stmt.expr);
                // For method calls that modify state (append, pop etc.)
                if (stmt.expr.type === 'MethodCall') {
                    const objName = stmt.expr.object.name || '?';
                    snapshot(stmt.line, `${objName}.${stmt.expr.method}(${stmt.expr.args.map(a => formatValue(evaluate(a))).join(', ')})`.replace(/NaN/g, ''), [objName], 'method-call');
                } else if (stmt.expr.type === 'FuncCall') {
                    // already handled
                }
                break;
            }

            case 'Print': {
                const vals = stmt.args.map(evaluate);
                const line = vals.map(v => {
                    if (typeof v === 'string') return v;
                    return formatValue(v);
                }).join(' ');
                output += line + '\n';
                snapshot(stmt.line, `print: ${line}`, [], 'print');
                break;
            }

            case 'If': {
                for (let i = 0; i < stmt.branches.length; i++) {
                    const branch = stmt.branches[i];
                    const condVal = evaluate(branch.condition);
                    if (condVal) {
                        snapshot(branch.line, `${i === 0 ? 'if' : 'elif'} condition is True`, [], 'if-true', { branch: i });
                        const signal = executeBlock(branch.body);
                        if (signal) return signal;
                        return null;
                    } else {
                        snapshot(branch.line, `${i === 0 ? 'if' : 'elif'} condition is False`, [], 'if-false', { branch: i });
                    }
                }
                if (stmt.elseBody) {
                    snapshot(stmt.elseLine, 'else branch taken', [], 'else');
                    const signal = executeBlock(stmt.elseBody);
                    if (signal) return signal;
                }
                break;
            }

            case 'While': {
                let iteration = 0;
                while (true) {
                    const condVal = evaluate(stmt.condition);
                    if (!condVal) {
                        snapshot(stmt.line, `while condition is False — loop ends`, [], 'loop-end', { iterations: iteration });
                        break;
                    }
                    iteration++;
                    snapshot(stmt.line, `while loop — iteration ${iteration}`, [], 'loop-iteration', { iteration });
                    const signal = executeBlock(stmt.body);
                    if (signal instanceof BreakSignal) {
                        snapshot(stmt.line, 'break — exiting loop', [], 'break');
                        break;
                    }
                    if (signal instanceof ContinueSignal) continue;
                    if (signal instanceof ReturnSignal) return signal;
                }
                break;
            }

            case 'For': {
                const iterable = evaluate(stmt.iterable);
                if (!Array.isArray(iterable) && typeof iterable !== 'string') {
                    throw new Error(`TypeError: '${getType(iterable)}' object is not iterable (line ${stmt.line + 1})`);
                }
                const items = typeof iterable === 'string' ? iterable.split('') : iterable;
                let iteration = 0;
                for (const item of items) {
                    iteration++;
                    variables[stmt.varName] = item;
                    snapshot(stmt.line, `for loop — ${stmt.varName} = ${formatValue(item)} (iteration ${iteration}/${items.length})`, [stmt.varName], 'loop-iteration', { iteration, total: items.length, variable: stmt.varName, value: item });
                    const signal = executeBlock(stmt.body);
                    if (signal instanceof BreakSignal) {
                        snapshot(stmt.line, 'break — exiting loop', [], 'break');
                        break;
                    }
                    if (signal instanceof ContinueSignal) continue;
                    if (signal instanceof ReturnSignal) return signal;
                }
                if (iteration === items.length || iteration === 0) {
                    snapshot(stmt.line, `for loop completed (${iteration} iterations)`, [], 'loop-end', { iterations: iteration });
                }
                break;
            }

            case 'Break':
                snapshot(stmt.line, 'break statement', [], 'break');
                return new BreakSignal();

            case 'Continue':
                snapshot(stmt.line, 'continue statement', [], 'continue');
                return new ContinueSignal();

            case 'FuncDef':
                functions[stmt.name] = { params: stmt.params, body: stmt.body, line: stmt.line };
                snapshot(stmt.line, `Define function ${stmt.name}(${stmt.params.join(', ')})`, [], 'func-def');
                break;

            case 'Pass':
                snapshot(stmt.line, 'pass (no operation)', [], 'pass');
                break;

            case 'Return': {
                const val = stmt.value ? evaluate(stmt.value) : null;
                snapshot(stmt.line, `return ${formatValue(val)}`, [], 'return');
                return new ReturnSignal(val);
            }

            default:
                break;
        }

        return null;
    }

    try {
        executeBlock(ast.body);
    } catch (e) {
        if (!(e instanceof ReturnSignal)) {
            const lineMatch = e.message.match(/line (\d+)/);
            return {
                steps,
                error: {
                    message: e.message,
                    line: lineMatch ? parseInt(lineMatch[1]) : steps.length > 0 ? steps[steps.length - 1].line : 1,
                },
                output,
            };
        }
    }

    return { steps, error: null, output };
}

export { formatValue, getType };
