import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useExecution } from '../context/ExecutionContext';
import './VariablePanel.css';

export default function VariablePanel() {
    const { steps, currentStep } = useExecution();

    const currentVars = useMemo(() => {
        if (currentStep < 0 || currentStep >= steps.length) return {};
        return steps[currentStep].variables || {};
    }, [steps, currentStep]);

    const prevVars = useMemo(() => {
        if (currentStep <= 0 || currentStep >= steps.length) return {};
        return steps[currentStep - 1].variables || {};
    }, [steps, currentStep]);

    const changedVars = useMemo(() => {
        if (currentStep < 0 || currentStep >= steps.length) return [];
        return steps[currentStep].changedVars || [];
    }, [steps, currentStep]);

    const varEntries = Object.entries(currentVars);

    const getVarStatus = (name) => {
        if (changedVars.includes(name)) {
            if (!(name in prevVars)) return 'new';
            return 'changed';
        }
        return 'unchanged';
    };

    const getTypeColor = (type) => {
        switch (type) {
            case 'int':
            case 'float': return 'var(--accent-warning)';
            case 'str': return 'var(--accent-success)';
            case 'bool': return 'var(--accent-tertiary)';
            case 'list': return 'var(--accent-secondary)';
            case 'NoneType': return 'var(--text-muted)';
            default: return 'var(--text-secondary)';
        }
    };

    return (
        <div className="variable-panel" id="variable-panel">
            <div className="panel-header">
                <div className="panel-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
                        <line x1="16" y1="8" x2="2" y2="22" />
                        <line x1="17.5" y1="15" x2="9" y2="15" />
                    </svg>
                    <span>Variables</span>
                    <span className="var-count">{varEntries.length}</span>
                </div>
            </div>

            <div className="variable-list">
                {varEntries.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">📦</div>
                        <p>No variables yet</p>
                        <span>Run your code to see variables</span>
                    </div>
                ) : (
                    <AnimatePresence mode="popLayout">
                        {varEntries.map(([name, info]) => {
                            const status = getVarStatus(name);
                            return (
                                <motion.div
                                    key={name}
                                    className={`var-item ${status}`}
                                    layout
                                    initial={{ opacity: 0, x: -20, scale: 0.95 }}
                                    animate={{ opacity: 1, x: 0, scale: 1 }}
                                    exit={{ opacity: 0, x: 20, scale: 0.95 }}
                                    transition={{ duration: 0.25, ease: 'easeOut' }}
                                >
                                    <div className="var-header">
                                        <span className="var-name">{name}</span>
                                        <span className="var-type" style={{ color: getTypeColor(info.type) }}>
                                            {info.type}
                                        </span>
                                    </div>
                                    <div className="var-value">
                                        <code>{info.display}</code>
                                    </div>
                                    {status === 'changed' && prevVars[name] && (
                                        <div className="var-prev">
                                            <span className="var-prev-label">was:</span>
                                            <code>{prevVars[name].display}</code>
                                        </div>
                                    )}
                                    {status === 'new' && (
                                        <div className="var-badge var-badge-new">NEW</div>
                                    )}
                                    {status === 'changed' && (
                                        <div className="var-badge var-badge-changed">CHANGED</div>
                                    )}
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                )}
            </div>
        </div>
    );
}
