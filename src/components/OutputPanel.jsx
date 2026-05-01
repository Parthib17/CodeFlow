import React, { useMemo } from 'react';
import { useExecution } from '../context/ExecutionContext';
import './OutputPanel.css';

function getComplexityColor(c) {
    if (!c) return '#94a3b8';
    if (c === 'O(1)') return '#10b981';
    if (c === 'O(log n)') return '#06b6d4';
    if (c === 'O(n)') return '#3b82f6';
    if (c === 'O(n log n)') return '#8b5cf6';
    if (c === 'O(n²)') return '#f59e0b';
    if (c === 'O(n³)' || c.includes('n^')) return '#ef4444';
    if (c.includes('2^n')) return '#dc2626';
    return '#94a3b8';
}

function getComplexityLabel(c) {
    if (!c) return '';
    if (c === 'O(1)') return 'Constant';
    if (c === 'O(log n)') return 'Logarithmic';
    if (c === 'O(n)') return 'Linear';
    if (c === 'O(n log n)') return 'Linearithmic';
    if (c === 'O(n²)') return 'Quadratic';
    if (c === 'O(n³)') return 'Cubic';
    if (c.includes('2^n')) return 'Exponential';
    return 'Polynomial';
}

export default function OutputPanel() {
    const { steps, currentStep, complexity, isComplete, error } = useExecution();

    const currentOutput = useMemo(() => {
        if (currentStep < 0 || currentStep >= steps.length) return '';
        return steps[currentStep].output || '';
    }, [steps, currentStep]);

    const currentDescription = useMemo(() => {
        if (currentStep < 0 || currentStep >= steps.length) return null;
        return steps[currentStep];
    }, [steps, currentStep]);

    const outputLines = currentOutput.split('\n').filter(l => l !== '');

    // Show complexity when execution is complete (reached last step or explicitly complete)
    const showComplexity = complexity && (isComplete || (steps.length > 0 && currentStep >= steps.length - 1));

    return (
        <div className="output-panel" id="output-panel">
            <div className="panel-header">
                <div className="panel-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="4 17 10 11 4 5" />
                        <line x1="12" y1="19" x2="20" y2="19" />
                    </svg>
                    <span>Console Output</span>
                </div>
            </div>

            <div className="output-content">
                {/* Step Info Bar */}
                {currentDescription && (
                    <div className="step-info-bar">
                        <div className="step-info-line">
                            <span className="step-info-label">Line</span>
                            <span className="step-info-value">{currentDescription.line}</span>
                        </div>
                        <div className="step-info-desc">
                            <span className="step-info-label">Action</span>
                            <span className="step-info-value">{currentDescription.description}</span>
                        </div>
                        {currentDescription.flowType && (
                            <div className="step-info-flow">
                                <span className={`flow-badge flow-${currentDescription.flowType?.split('-')[0]}`}>
                                    {currentDescription.flowType}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Console */}
                <div className="console-output" id="console-output">
                    {outputLines.length === 0 && !showComplexity ? (
                        <div className="console-empty">
                            <span className="console-prompt">$</span>
                            <span className="console-waiting">Waiting for output...</span>
                        </div>
                    ) : (
                        <>
                            {outputLines.map((line, i) => (
                                <div key={i} className="console-line">
                                    <span className="console-prompt">›</span>
                                    <span className="console-text">{line}</span>
                                </div>
                            ))}

                            {/* Error display */}
                            {error && (
                                <div className="console-line console-error-line">
                                    <span className="console-prompt console-error-prompt">✕</span>
                                    <span className="console-text console-error-text">{error.message}</span>
                                </div>
                            )}

                            {/* Complexity Analysis at end of console */}
                            {showComplexity && (
                                <div className="console-complexity">
                                    <div className="console-divider">
                                        <span className="divider-line" />
                                        <span className="divider-label">Complexity Analysis</span>
                                        <span className="divider-line" />
                                    </div>

                                    <div className="complexity-row">
                                        <span className="complexity-icon">⏱</span>
                                        <span className="complexity-key">Time:</span>
                                        <span className="complexity-val" style={{ color: getComplexityColor(complexity.time) }}>
                                            {complexity.time}
                                        </span>
                                        <span className="complexity-tag" style={{ color: getComplexityColor(complexity.time) }}>
                                            {getComplexityLabel(complexity.time)}
                                        </span>
                                    </div>

                                    <div className="complexity-row">
                                        <span className="complexity-icon">💾</span>
                                        <span className="complexity-key">Space:</span>
                                        <span className="complexity-val" style={{ color: getComplexityColor(complexity.space) }}>
                                            {complexity.space}
                                        </span>
                                        <span className="complexity-tag" style={{ color: getComplexityColor(complexity.space) }}>
                                            {getComplexityLabel(complexity.space)}
                                        </span>
                                    </div>

                                    {complexity.details && (
                                        <div className="complexity-stats-row">
                                            <span className="complexity-stat">Steps: {complexity.details.totalSteps}</span>
                                            <span className="complexity-stat">Loops: {complexity.details.loopSteps}</span>
                                            <span className="complexity-stat">Nesting: {complexity.details.maxNestDepth}</span>
                                        </div>
                                    )}

                                    {complexity.explanation && complexity.explanation.length > 0 && (
                                        <div className="complexity-explanations-inline">
                                            {complexity.explanation.map((exp, i) => (
                                                <div key={i} className="console-line complexity-explain-line">
                                                    <span className="console-prompt" style={{ color: '#8b5cf6' }}>›</span>
                                                    <span className="console-text complexity-explain-text">{exp}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
