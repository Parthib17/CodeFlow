import React, { useRef, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useExecution } from '../context/ExecutionContext';
import './TimelinePanel.css';

export default function TimelinePanel() {
    const { steps, currentStep, jumpToStep } = useExecution();
    const listRef = useRef(null);
    const activeRef = useRef(null);

    useEffect(() => {
        if (activeRef.current && listRef.current) {
            activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [currentStep]);

    const getFlowIcon = (flowType) => {
        switch (flowType) {
            case 'if-true': return '✅';
            case 'if-false': return '❌';
            case 'else': return '↪️';
            case 'loop-iteration': return '🔄';
            case 'loop-end': return '🏁';
            case 'var-init': return '📌';
            case 'var-update': return '✏️';
            case 'print': return '📢';
            case 'method-call': return '⚡';
            case 'func-def': return '🔧';
            case 'function-call': return '📞';
            case 'return': return '↩️';
            case 'break': return '🛑';
            case 'continue': return '⏭️';
            default: return '▸';
        }
    };

    const getFlowColor = (flowType) => {
        switch (flowType) {
            case 'if-true': return 'var(--accent-success)';
            case 'if-false': return 'var(--accent-danger)';
            case 'else': return 'var(--accent-warning)';
            case 'loop-iteration': return 'var(--accent-secondary)';
            case 'loop-end': return 'var(--text-muted)';
            case 'var-init': return 'var(--accent-primary-light)';
            case 'var-update': return 'var(--accent-warning)';
            case 'print': return 'var(--accent-success)';
            case 'break': return 'var(--accent-danger)';
            default: return 'var(--text-secondary)';
        }
    };

    return (
        <div className="timeline-panel" id="timeline-panel">
            <div className="panel-header">
                <div className="panel-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span>Execution Timeline</span>
                    {steps.length > 0 && (
                        <span className="timeline-count">{steps.length} steps</span>
                    )}
                </div>
            </div>

            <div className="timeline-list" ref={listRef} id="timeline-list">
                {steps.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">⏳</div>
                        <p>No execution history</p>
                        <span>Run code to see the timeline</span>
                    </div>
                ) : (
                    steps.map((step, i) => {
                        const isActive = i === currentStep;
                        const isPast = i < currentStep;
                        return (
                            <div
                                key={i}
                                ref={isActive ? activeRef : null}
                                className={`timeline-item ${isActive ? 'active' : ''} ${isPast ? 'past' : ''}`}
                                onClick={() => jumpToStep(i)}
                                id={`timeline-step-${i}`}
                            >
                                <div className="timeline-connector">
                                    <div className={`timeline-dot ${isActive ? 'active' : isPast ? 'past' : ''}`}
                                        style={{ borderColor: isActive ? getFlowColor(step.flowType) : undefined }}
                                    >
                                        {isActive && (
                                            <motion.div
                                                className="dot-pulse"
                                                animate={{ scale: [1, 1.8, 1], opacity: [1, 0, 1] }}
                                                transition={{ duration: 1.5, repeat: Infinity }}
                                            />
                                        )}
                                    </div>
                                    {i < steps.length - 1 && <div className={`timeline-line ${isPast ? 'past' : ''}`} />}
                                </div>
                                <div className="timeline-content">
                                    <div className="timeline-top">
                                        <span className="timeline-step-num">{step.step}</span>
                                        <span className="timeline-flow-icon">{getFlowIcon(step.flowType)}</span>
                                        <span className="timeline-line-badge">L{step.line}</span>
                                    </div>
                                    <div className="timeline-desc">{step.description}</div>
                                    {step.changedVars.length > 0 && (
                                        <div className="timeline-vars">
                                            {step.changedVars.map(v => (
                                                <span key={v} className="timeline-var-badge">
                                                    {v}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
