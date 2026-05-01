import React, { useMemo } from 'react';
import Editor from '@monaco-editor/react';
import { useExecution } from '../context/ExecutionContext';
import { sampleSnippets } from '../data/samples';
import './CodeEditor.css';

// Map our language IDs to Monaco's language IDs.
const MONACO_LANG = {
    python: 'python', javascript: 'javascript', typescript: 'typescript',
    java: 'java', c: 'c', cpp: 'cpp', csharp: 'csharp', go: 'go', rust: 'rust',
    ruby: 'ruby', php: 'php', kotlin: 'kotlin', swift: 'swift', bash: 'shell',
};

export default function CodeEditor() {
    const { code, setCode, language, steps, currentStep, supportedLanguages, loadingMessage } = useExecution();

    const currentLine = useMemo(() => {
        if (currentStep >= 0 && currentStep < steps.length) {
            return steps[currentStep].line;
        }
        return -1;
    }, [steps, currentStep]);

    // Generate decorations for the active line
    const handleEditorDidMount = (editor, monaco) => {
        // Custom theme
        monaco.editor.defineTheme('codeflow-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
                { token: 'keyword', foreground: 'c084fc' },
                { token: 'string', foreground: '34d399' },
                { token: 'number', foreground: 'f59e0b' },
                { token: 'type', foreground: '60a5fa' },
                { token: 'identifier', foreground: 'e2e8f0' },
                { token: 'delimiter', foreground: '94a3b8' },
                { token: 'operator', foreground: '67e8f9' },
            ],
            colors: {
                'editor.background': '#0d1117',
                'editor.foreground': '#e2e8f0',
                'editor.lineHighlightBackground': '#1a2236',
                'editor.selectionBackground': '#2563eb33',
                'editorLineNumber.foreground': '#475569',
                'editorLineNumber.activeForeground': '#818cf8',
                'editorCursor.foreground': '#818cf8',
                'editor.inactiveSelectionBackground': '#1e293b',
                'editorIndentGuide.background': '#1e293b',
                'editorIndentGuide.activeBackground': '#334155',
                'scrollbarSlider.background': '#47556944',
                'scrollbarSlider.hoverBackground': '#64748b66',
            },
        });
        monaco.editor.setTheme('codeflow-dark');

        editor._codeflowDecorations = [];

        // Update decorations on step changes
        const updateDecorations = () => {
            // We'll handle this via external updates
        };
    };

    // Use editor to set decorations
    const handleEditorChange = (value) => {
        setCode(value);
    };

    const loadSample = (sample) => {
        setCode(sample.code);
    };

    return (
        <div className="code-editor-panel" id="code-editor-panel">
            <div className="panel-header">
                <div className="panel-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 18 22 12 16 6"></polyline>
                        <polyline points="8 6 2 12 8 18"></polyline>
                    </svg>
                    <span>Code Editor</span>
                    <span className="language-badge">
                        {supportedLanguages?.[language]?.icon} {supportedLanguages?.[language]?.label}
                    </span>
                </div>
                <div className="panel-actions">
                    <div className="sample-dropdown" id="sample-dropdown">
                        <button className="sample-btn" id="sample-btn">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                            Samples
                        </button>
                        <div className="sample-list" id="sample-list">
                            {(sampleSnippets[language] || []).map((s, i) => (
                                <button
                                    key={i}
                                    className="sample-item"
                                    onClick={() => loadSample(s)}
                                    id={`sample-${i}`}
                                >
                                    <span className="sample-icon">{s.icon}</span>
                                    <div className="sample-info">
                                        <span className="sample-name">{s.name}</span>
                                        <span className="sample-desc">{s.description}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="editor-wrapper" id="editor-wrapper">
                {currentLine > 0 && (
                    <div
                        className="active-line-indicator"
                        style={{ top: `${(currentLine - 1) * 19}px` }}
                    />
                )}
                {loadingMessage && (
                    <div style={{
                        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(13, 17, 23, 0.85)', zIndex: 5, backdropFilter: 'blur(2px)',
                        color: '#a5b4fc', fontSize: '0.85rem', fontWeight: 500, gap: '10px', flexDirection: 'column',
                    }}>
                        <div style={{
                            width: 32, height: 32, border: '3px solid rgba(99,102,241,0.2)',
                            borderTopColor: '#818cf8', borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                        }} />
                        <span>{loadingMessage}</span>
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                )}
                <Editor
                    height="100%"
                    language={MONACO_LANG[language] || language}
                    value={code}
                    onChange={handleEditorChange}
                    onMount={handleEditorDidMount}
                    options={{
                        fontSize: 13.5,
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        fontLigatures: true,
                        lineHeight: 19,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        padding: { top: 12, bottom: 12 },
                        renderLineHighlight: 'all',
                        smoothScrolling: true,
                        cursorBlinking: 'smooth',
                        cursorSmoothCaretAnimation: 'on',
                        tabSize: 4,
                        wordWrap: 'on',
                        automaticLayout: true,
                        suggest: { enabled: false },
                        quickSuggestions: false,
                        parameterHints: { enabled: false },
                        folding: true,
                        glyphMargin: false,
                        lineDecorationsWidth: 4,
                        lineNumbersMinChars: 3,
                        overviewRulerBorder: false,
                        hideCursorInOverviewRuler: true,
                    }}
                />
            </div>
        </div>
    );
}
