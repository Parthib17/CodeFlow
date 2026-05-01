import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useExecution } from '../context/ExecutionContext';
import './DataStructurePanel.css';

export default function DataStructurePanel() {
    const { steps, currentStep } = useExecution();

    const currentDS = useMemo(() => {
        if (currentStep < 0 || currentStep >= steps.length) return [];
        return steps[currentStep].dataStructures || [];
    }, [steps, currentStep]);

    const prevDS = useMemo(() => {
        if (currentStep <= 0 || currentStep >= steps.length) return [];
        return steps[currentStep - 1].dataStructures || [];
    }, [steps, currentStep]);

    const getChangedIndices = (dsName) => {
        const curr = currentDS.find(d => d.name === dsName);
        const prev = prevDS.find(d => d.name === dsName);
        if (!curr || !prev) return new Set();

        const changed = new Set();
        const maxLen = Math.max(curr.values.length, prev.values.length);
        for (let i = 0; i < maxLen; i++) {
            const currVal = curr.values[i]?.value;
            const prevVal = prev.values[i]?.value;
            if (currVal !== prevVal) changed.add(i);
        }
        return changed;
    };

    return (
        <div className="ds-panel" id="data-structure-panel">
            <div className="panel-header">
                <div className="panel-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" />
                        <rect x="14" y="3" width="7" height="7" />
                        <rect x="14" y="14" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" />
                    </svg>
                    <span>Data Structures</span>
                </div>
            </div>

            <div className="ds-content">
                {currentDS.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">🧊</div>
                        <p>No data structures</p>
                        <span>Arrays and lists will appear here</span>
                    </div>
                ) : (
                    currentDS.map((ds) => {
                        const changed = getChangedIndices(ds.name);
                        return (
                            <div key={ds.name} className="ds-container">
                                <div className="ds-header">
                                    <span className="ds-name">{ds.name}</span>
                                    <span className="ds-type-badge">{ds.type}</span>
                                    <span className="ds-length">len: {ds.values.length}</span>
                                </div>

                                {ds.type === 'array' && (
                                    <div className="array-viz">
                                        <div className="array-indices">
                                            {ds.values.map((_, i) => (
                                                <div key={i} className="array-index">{i}</div>
                                            ))}
                                        </div>
                                        <div className="array-blocks">
                                            <AnimatePresence mode="popLayout">
                                                {ds.values.map((item, i) => (
                                                    <motion.div
                                                        key={`${ds.name}-${i}`}
                                                        className={`array-block ${changed.has(i) ? 'changed' : ''}`}
                                                        layout
                                                        initial={{ opacity: 0, scale: 0.5, y: 10 }}
                                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                                        exit={{ opacity: 0, scale: 0.5, y: -10 }}
                                                        transition={{ duration: 0.3, ease: 'easeOut', delay: i * 0.03 }}
                                                    >
                                                        <span className="block-value">{item.display}</span>
                                                    </motion.div>
                                                ))}
                                            </AnimatePresence>
                                        </div>
                                        {/* Stack view */}
                                        {ds.values.length > 0 && (
                                            <div className="stack-view">
                                                <div className="stack-label">Stack View ↕</div>
                                                <div className="stack-blocks">
                                                    {[...ds.values].reverse().map((item, i) => {
                                                        const origIdx = ds.values.length - 1 - i;
                                                        return (
                                                            <motion.div
                                                                key={`stack-${ds.name}-${origIdx}`}
                                                                className={`stack-block ${changed.has(origIdx) ? 'changed' : ''} ${i === 0 ? 'top' : ''}`}
                                                                layout
                                                                initial={{ opacity: 0, x: -20 }}
                                                                animate={{ opacity: 1, x: 0 }}
                                                                transition={{ duration: 0.2, delay: i * 0.05 }}
                                                            >
                                                                <span className="stack-idx">{origIdx}</span>
                                                                <span className="stack-val">{item.display}</span>
                                                                {i === 0 && <span className="stack-top-badge">TOP</span>}
                                                            </motion.div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
