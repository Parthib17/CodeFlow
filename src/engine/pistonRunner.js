/**
 * Remote code runner — executes Java, C, C++, Go, Rust, etc. via a free public API.
 *
 * Background: emkc.org's public Piston endpoint went whitelist-only on 2026-02-15,
 * so we now use Godbolt's Compile Explorer execute API as the default, with an
 * optional override (VITE_PISTON_URL) for users who self-host Piston.
 *
 * No per-line stepping (the code runs in a remote sandbox), but you get real
 * compile + run output. We synthesize a single "completed" step so the UI flows.
 */

// If the user sets VITE_PISTON_URL (e.g. a self-hosted Piston instance), we use Piston.
// Otherwise we fall back to Godbolt's compile-and-execute API.
const CUSTOM_PISTON_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_PISTON_URL) || '';
const GODBOLT_URL = 'https://godbolt.org/api/compiler';

// ── Godbolt compiler IDs (chosen as recent, stable releases) ──────────
const GODBOLT_COMPILERS = {
    java:       { id: 'java2100',   filename: 'example.java',  label: 'Java 21' },
    c:          { id: 'cg132',      filename: 'example.c',     label: 'GCC 13.2' },
    cpp:        { id: 'g132',       filename: 'example.cpp',   label: 'GCC 13.2 C++' },
    go:         { id: 'gl1221',     filename: 'example.go',    label: 'Go 1.22.1' },
    rust:       { id: 'r1830',      filename: 'example.rs',    label: 'Rust 1.83' },
    csharp:     { id: 'dotnettrunk',filename: 'example.cs',    label: '.NET trunk', userArgs: '-c Release' },
    kotlin:     { id: 'kotlinc1920',filename: 'example.kt',    label: 'Kotlin 1.9.20' },
    swift:      { id: 'swift590',   filename: 'example.swift', label: 'Swift 5.9.0' },
    // Godbolt does not run TypeScript/Ruby/PHP/Bash directly via execute; we keep
    // these as "not supported on default backend" with a helpful error.
};

// ── Piston language IDs (used only if VITE_PISTON_URL is set) ────────
const PISTON_LANGUAGES_INTERNAL = {
    java:       { language: 'java',       version: '15.0.2',  filename: 'Main.java' },
    c:          { language: 'c',          version: '10.2.0',  filename: 'main.c' },
    cpp:        { language: 'cpp',        version: '10.2.0',  filename: 'main.cpp' },
    go:         { language: 'go',         version: '1.16.2',  filename: 'main.go' },
    rust:       { language: 'rust',       version: '1.68.2',  filename: 'main.rs' },
    typescript: { language: 'typescript', version: '5.0.3',   filename: 'main.ts' },
    csharp:     { language: 'csharp',     version: '6.12.0',  filename: 'Main.cs' },
    ruby:       { language: 'ruby',       version: '3.0.1',   filename: 'main.rb' },
    php:        { language: 'php',        version: '8.2.3',   filename: 'main.php' },
    kotlin:     { language: 'kotlin',     version: '1.8.20',  filename: 'main.kt' },
    swift:      { language: 'swift',      version: '5.3.3',   filename: 'main.swift' },
    bash:       { language: 'bash',       version: '5.2.0',   filename: 'main.sh' },
};

// Public language manifest (shown in the dropdown). All Piston-supported langs are
// listed; if the user is on the default Godbolt backend, languages without Godbolt
// coverage will produce a clear "not supported on this backend" message.
export const PISTON_LANGUAGES = {
    java:       { label: 'Java',       icon: '☕' },
    c:          { label: 'C',          icon: '🅒' },
    cpp:        { label: 'C++',        icon: '➕' },
    go:         { label: 'Go',         icon: '🐹' },
    rust:       { label: 'Rust',       icon: '🦀' },
    csharp:     { label: 'C#',         icon: '#️⃣' },
};

/* ── Output cleanup ─────────────────────────────────────────────────
 * Godbolt's GCC/Clang return color-coded diagnostics with ANSI escape
 * sequences. They render as garbage in HTML, so we strip them. */
const ANSI_RE = /\x1B\[[0-9;]*[A-Za-z]/g;
function stripAnsi(s) { return typeof s === 'string' ? s.replace(ANSI_RE, '') : s; }

/* ── Source preprocessing ──────────────────────────────────────────── */
// Godbolt saves Java as `example.java`, so a `public class Main {…}` triggers
// "class Main is public, should be declared in a file named Main.java". We
// rename the public class to "example" automatically. Same for any public class.
function preprocessJavaForGodbolt(source) {
    const m = source.match(/public\s+class\s+([A-Za-z_]\w*)/);
    if (!m) return source;
    const className = m[1];
    // Rename the class declaration AND any references to it.
    return source
        .replace(/public\s+class\s+([A-Za-z_]\w*)/, 'public class example')
        .replace(new RegExp(`\\b${className}\\b`, 'g'), (match, offset, full) => {
            // Don't touch the one we just renamed — but re-renaming "example" to "example" is a no-op anyway.
            return match === className ? 'example' : match;
        });
}

/* ── Runner: Piston (custom self-hosted) ───────────────────────────── */
async function runViaPiston(language, source) {
    const cfg = PISTON_LANGUAGES_INTERNAL[language];
    if (!cfg) {
        return { steps: [], error: { message: `Language '${language}' not supported`, line: 1 }, output: '' };
    }
    const url = CUSTOM_PISTON_URL.replace(/\/$/, '') + '/api/v2/piston/execute';
    let resp;
    try {
        resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                language: cfg.language,
                version: cfg.version,
                files: [{ name: cfg.filename, content: source }],
                stdin: '',
                compile_timeout: 10000,
                run_timeout: 5000,
            }),
        });
    } catch (e) {
        return { steps: [], error: { message: `Network error: ${e.message}`, line: 1 }, output: '' };
    }
    if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        return { steps: [], error: { message: `Piston ${resp.status}: ${t.slice(0, 200)}`, line: 1 }, output: '' };
    }
    const data = await resp.json();
    const compileOut = data.compile?.output || data.compile?.stderr || '';
    const runOut = data.run?.output ?? '';
    const runErr = data.run?.stderr ?? '';
    const combined = [compileOut, runOut].filter(Boolean).join('');
    let error = null;
    if (data.compile && data.compile.code !== 0 && (data.compile.stderr || data.compile.output)) {
        const m = (data.compile.stderr || '').match(/:(\d+):/);
        error = { message: `Compile error: ${(data.compile.stderr || data.compile.output).slice(0, 400)}`, line: m ? parseInt(m[1], 10) : 1 };
    } else if (data.run && data.run.code !== 0 && runErr) {
        error = { message: `Runtime error: ${runErr.slice(0, 400)}`, line: 1 };
    }
    return synthesizeResult(language, combined, error);
}

/* ── Runner: Godbolt ───────────────────────────────────────────────── */
async function runViaGodbolt(language, source) {
    const cfg = GODBOLT_COMPILERS[language];
    if (!cfg) {
        return {
            steps: [],
            error: {
                message: `${language} isn't available on the default Godbolt backend. ` +
                         `To run it, self-host Piston and set VITE_PISTON_URL. ` +
                         `(Supported on default backend: Java, C, C++, Go, Rust, C#, Kotlin, Swift)`,
                line: 1,
            },
            output: '',
        };
    }

    // Source preprocessing per language
    let src = source;
    if (language === 'java') src = preprocessJavaForGodbolt(src);

    const url = `${GODBOLT_URL}/${cfg.id}/compile`;
    let resp;
    try {
        resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                source: src,
                options: {
                    userArguments: cfg.userArgs || '',
                    compilerOptions: { executorRequest: true },
                    executeParameters: { args: [], stdin: '' },
                    filters: { execute: true },
                },
            }),
        });
    } catch (e) {
        return { steps: [], error: { message: `Network error contacting Godbolt: ${e.message}`, line: 1 }, output: '' };
    }
    if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        return { steps: [], error: { message: `Godbolt ${resp.status}: ${t.slice(0, 200)}`, line: 1 }, output: '' };
    }
    const data = await resp.json();
    // Godbolt returns stdout/stderr as arrays of {text}; strip ANSI color codes.
    const stdoutText = stripAnsi((data.stdout || []).map(x => x.text).join('\n'));
    const stderrText = stripAnsi((data.stderr || []).map(x => x.text).join('\n'));
    const buildErr = data.buildResult && data.buildResult.code !== 0
        ? stripAnsi((data.buildResult.stderr || []).map(x => x.text).join('\n'))
        : '';

    let error = null;
    let combined = stdoutText;
    if (data.didExecute === false || (data.buildResult && data.buildResult.code !== 0)) {
        const m = buildErr.match(/:(\d+):/) || stderrText.match(/:(\d+):/);
        const errMsg = (buildErr || stderrText || 'Compilation failed').slice(0, 800);
        error = { message: `Compile error: ${errMsg}`, line: m ? parseInt(m[1], 10) : 1 };
        combined = errMsg;
    } else if (data.code !== 0 && stderrText) {
        error = { message: `Runtime error: ${stderrText.slice(0, 400)}`, line: 1 };
        combined = stdoutText + (stdoutText && stderrText ? '\n' : '') + stderrText;
    } else if (stderrText) {
        // Non-fatal stderr (warnings)
        combined = stdoutText + (stdoutText ? '\n' : '') + stderrText;
    }

    return synthesizeResult(language, combined, error);
}

function synthesizeResult(language, output, error) {
    const cfg = PISTON_LANGUAGES[language] || { label: language };
    const steps = (output || error) ? [{
        step: 1,
        line: 1,
        description: error ? 'Execution failed' : `Executed (${cfg.label})`,
        variables: {},
        changedVars: [],
        output: output || '',
        flowType: error ? 'error' : 'print',
        flowDetail: null,
        dataStructures: [],
    }] : [];
    return { steps, error, output: output || '' };
}

/* ── Public entry ──────────────────────────────────────────────────── */
export async function executeViaPiston(language, source) {
    if (CUSTOM_PISTON_URL) return runViaPiston(language, source);
    return runViaGodbolt(language, source);
}
