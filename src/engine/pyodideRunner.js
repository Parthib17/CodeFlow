/**
 * Pyodide-based Python executor.
 *
 * Loads CPython (via Pyodide WASM) on first use, then runs user code under
 * sys.settrace to capture a per-line snapshot of locals. This gives true
 * "any Python code runs" — including dicts, classes, comprehensions, f-strings,
 * exceptions, the standard library, etc. — instead of the small subset the
 * old hand-rolled interpreter supported.
 */

const PYODIDE_VERSION = '0.26.4';
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

let pyodidePromise = null;

function loadPyodideScript() {
    return new Promise((resolve, reject) => {
        if (window.loadPyodide) {
            resolve(window.loadPyodide);
            return;
        }
        const existing = document.querySelector('script[data-pyodide]');
        if (existing) {
            existing.addEventListener('load', () => resolve(window.loadPyodide));
            existing.addEventListener('error', reject);
            return;
        }
        const s = document.createElement('script');
        s.src = `${PYODIDE_INDEX_URL}pyodide.js`;
        s.async = true;
        s.dataset.pyodide = 'true';
        s.onload = () => resolve(window.loadPyodide);
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

export async function getPyodide(onProgress) {
    if (pyodidePromise) return pyodidePromise;
    pyodidePromise = (async () => {
        if (onProgress) onProgress('Downloading Python runtime…');
        const loader = await loadPyodideScript();
        if (onProgress) onProgress('Initializing Python (CPython on WASM)…');
        const py = await loader({ indexURL: PYODIDE_INDEX_URL });
        if (onProgress) onProgress('Ready');
        return py;
    })();
    return pyodidePromise;
}

// Python tracer + serializer. Runs once, then we just call run_user_code(src).
const TRACER_PY = `
import sys, json, io, traceback

_RESULT = {"steps": [], "output": "", "error": None}
_SOURCE_LINES = []
_MAX_STEPS = 8000
_STEP_COUNT = 0

def _safe_repr(v, depth=0):
    if depth > 4:
        return "…"
    try:
        if v is None or isinstance(v, (bool, int, float)):
            return repr(v)
        if isinstance(v, str):
            return repr(v) if len(v) < 200 else repr(v[:200] + "…")
        if isinstance(v, (list, tuple)):
            inner = [_safe_repr(x, depth + 1) for x in v[:50]]
            if len(v) > 50: inner.append("…")
            return "[" + ", ".join(inner) + "]" if isinstance(v, list) else "(" + ", ".join(inner) + ")"
        if isinstance(v, dict):
            items = list(v.items())[:50]
            inner = [_safe_repr(k, depth + 1) + ": " + _safe_repr(val, depth + 1) for k, val in items]
            if len(v) > 50: inner.append("…")
            return "{" + ", ".join(inner) + "}"
        if isinstance(v, set):
            inner = [_safe_repr(x, depth + 1) for x in list(v)[:50]]
            return "{" + ", ".join(inner) + "}" if inner else "set()"
        return type(v).__name__ + "(…)"
    except Exception:
        return "<unrepr>"

def _type_name(v):
    return type(v).__name__

def _to_jsonable_value(v, depth=0):
    if depth > 4: return None
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    if isinstance(v, (list, tuple)):
        return [_to_jsonable_value(x, depth + 1) for x in list(v)[:50]]
    if isinstance(v, dict):
        return {str(k): _to_jsonable_value(val, depth + 1) for k, val in list(v.items())[:50]}
    return None

def _snapshot_vars(local_vars):
    out = {}
    for k, v in local_vars.items():
        if k.startswith("__") and k.endswith("__"): continue
        if callable(v) and getattr(v, "__module__", None) in ("builtins", None):
            # Hide function objects from the user-facing view (defs themselves are still tracked separately).
            if not (hasattr(v, "__code__") and getattr(v.__code__, "co_filename", "") == "<user>"):
                continue
        try:
            out[k] = {
                "display": _safe_repr(v),
                "type": _type_name(v),
                "value": _to_jsonable_value(v),
            }
        except Exception:
            out[k] = {"display": "<error>", "type": "?", "value": None}
    return out

def _detect_data_structures(snap):
    ds = []
    for name, info in snap.items():
        v = info.get("value")
        if isinstance(v, list):
            ds.append({"name": name, "type": "array",
                       "values": [{"value": x, "display": _safe_repr(x)} for x in v]})
        elif isinstance(v, dict):
            ds.append({"name": name, "type": "dict",
                       "values": [{"key": str(k), "value": vv, "display": _safe_repr(vv)} for k, vv in v.items()]})
    return ds

_PREV_LOCALS = {}

def _make_tracer():
    def tracer(frame, event, arg):
        global _STEP_COUNT, _PREV_LOCALS
        if frame.f_code.co_filename != "<user>":
            return tracer
        if event != "line":
            return tracer
        _STEP_COUNT += 1
        if _STEP_COUNT > _MAX_STEPS:
            raise RuntimeError("Maximum execution steps exceeded (possible infinite loop)")
        lineno = frame.f_lineno
        # Merge globals (module-level vars from <user>) with locals when inside funcs
        if frame.f_globals is frame.f_locals:
            local_vars = dict(frame.f_locals)
        else:
            local_vars = dict(frame.f_globals)
            for k, v in frame.f_locals.items():
                if not (k.startswith("__") and k.endswith("__")):
                    local_vars[k] = v
        snap = _snapshot_vars(local_vars)
        changed = []
        for k, v in snap.items():
            prev = _PREV_LOCALS.get(k)
            if prev is None or prev.get("display") != v.get("display"):
                changed.append(k)
        _PREV_LOCALS = snap
        line_text = _SOURCE_LINES[lineno - 1] if 0 < lineno <= len(_SOURCE_LINES) else ""
        desc = line_text.strip() or f"line {lineno}"
        flow = None
        stripped = line_text.strip()
        if stripped.startswith("for ") or stripped.startswith("while "): flow = "loop-iteration"
        elif stripped.startswith("if ") or stripped.startswith("elif "): flow = "if-check"
        elif stripped.startswith("else"): flow = "else"
        elif stripped.startswith("return"): flow = "return"
        elif stripped.startswith("def "): flow = "func-def"
        elif stripped.startswith("class "): flow = "class-def"
        elif stripped.startswith("print"): flow = "print"
        _RESULT["steps"].append({
            "step": len(_RESULT["steps"]) + 1,
            "line": lineno,
            "description": desc,
            "variables": snap,
            "changedVars": changed,
            "output": _STDOUT.getvalue(),
            "flowType": flow,
            "flowDetail": None,
            "dataStructures": _detect_data_structures(snap),
        })
        return tracer
    return tracer

_STDOUT = io.StringIO()

def run_user_code(src):
    global _RESULT, _SOURCE_LINES, _STEP_COUNT, _STDOUT, _PREV_LOCALS
    _RESULT = {"steps": [], "output": "", "error": None}
    _SOURCE_LINES = src.split("\\n")
    _STEP_COUNT = 0
    _PREV_LOCALS = {}
    _STDOUT = io.StringIO()
    old_stdout, old_stderr = sys.stdout, sys.stderr
    sys.stdout = _STDOUT
    sys.stderr = _STDOUT
    user_globals = {"__name__": "__main__", "__builtins__": __builtins__}
    try:
        code_obj = compile(src, "<user>", "exec")
    except SyntaxError as e:
        sys.stdout, sys.stderr = old_stdout, old_stderr
        _RESULT["error"] = {"message": f"SyntaxError: {e.msg}", "line": e.lineno or 1}
        _RESULT["output"] = _STDOUT.getvalue()
        return json.dumps(_RESULT)
    sys.settrace(_make_tracer())
    try:
        exec(code_obj, user_globals)
    except RuntimeError as e:
        if "Maximum execution steps exceeded" in str(e):
            _RESULT["error"] = {"message": str(e), "line": _RESULT["steps"][-1]["line"] if _RESULT["steps"] else 1}
        else:
            _RESULT["error"] = {"message": f"{type(e).__name__}: {e}", "line": _extract_line(e)}
    except Exception as e:
        _RESULT["error"] = {"message": f"{type(e).__name__}: {e}", "line": _extract_line(e)}
    finally:
        sys.settrace(None)
        sys.stdout, sys.stderr = old_stdout, old_stderr
    _RESULT["output"] = _STDOUT.getvalue()
    return json.dumps(_RESULT)

def _extract_line(e):
    tb = e.__traceback__
    last = 1
    while tb:
        if tb.tb_frame.f_code.co_filename == "<user>":
            last = tb.tb_lineno
        tb = tb.tb_next
    return last
`;

let tracerInstalled = false;

async function ensureTracer(py) {
    if (tracerInstalled) return;
    await py.runPythonAsync(TRACER_PY);
    tracerInstalled = true;
}

export async function executePython(source, onProgress) {
    const py = await getPyodide(onProgress);
    await ensureTracer(py);
    py.globals.set('__user_src__', source);
    const json = await py.runPythonAsync(`run_user_code(__user_src__)`);
    py.globals.delete('__user_src__');
    return JSON.parse(json);
}
