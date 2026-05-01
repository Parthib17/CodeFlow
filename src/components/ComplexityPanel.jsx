import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useExecution } from '../context/ExecutionContext';
import './ComplexityPanel.css';

export default function ComplexityPanel() {
    const { complexity, steps, isComplete } = useExecution();

    if (!complexity || steps.length === 0) {
        return null;
    }

    const { time, space, explanation, details } = complexity;

    const getComplexityColor = (c) => {
        if (c === 'O(1)') return '#10b981';
        if (c === 'O(log n)') return '#06b6d4';
        if (c === 'O(n)') return '#3b82f6';
        if (c === 'O(n log n)') return '#8b5cf6';
        if (c === 'O(n²)') return '#f59e0b';
        if (c === 'O(n³)' || c.includes('n^')) return '#ef4444';
        if (c.includes('2^n')) return '#dc2626';
        return '#94a3b8';
    };

    const getComplexityLabel = (c) => {
        if (c === 'O(1)') return 'Constant';
        if (c === 'O(log n)') return 'Logarithmic';
        if (c === 'O(n)') return 'Linear';
        if (c === 'O(n log n)') return 'Linearithmic';
        if (c === 'O(n²)') return 'Quadratic';
        if (c === 'O(n³)') return 'Cubic';
        if (c.includes('2^n')) return 'Exponential';
        return 'Polynomial';
    };

    const getComplexityRating = (c) => {
        if (c === 'O(1)') return { label: 'Excellent', bars: 1 };
        if (c === 'O(log n)') return { label: 'Great', bars: 2 };
        if (c === 'O(n)') return { label: 'Good', bars: 3 };
        if (c === 'O(n log n)') return { label: 'Fair', bars: 4 };
        if (c === 'O(n²)') return { label: 'Poor', bars: 5 };
        if (c === 'O(n³)') return { label: 'Bad', bars: 6 };
        return { label: 'Critical', bars: 7 };
    };

    const timeColor = getComplexityColor(time);
    const spaceColor = getComplexityColor(space);
    const timeRating = getComplexityRating(time);
    const spaceRating = getComplexityRating(space);

    return (
        <AnimatePresence>
            <motion.div
                className="complexity-panel"
                id="complexity-panel"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
            >
                <div className="panel-header">
                    <div className="panel-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="20" x2="18" y2="10" />
                            <line x1="12" y1="20" x2="12" y2="4" />
                            <line x1="6" y1="20" x2="6" y2="14" />
                        </svg>
                        <span>Complexity Analysis</span>
                        <span className="complexity-badge">Big O</span>
                    </div>
                </div>

                <div className="complexity-content">
                    {/* Time Complexity Card */}
                    <motion.div
                        className="complexity-card"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        <div className="card-header">
                            <div className="card-icon time-icon">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <polyline points="12 6 12 12 16 14" />
                                </svg>
                            </div>
                            <div className="card-label">Time Complexity</div>
                        </div>
                        <div className="card-value" style={{ color: timeColor }}>
                            {time}
                        </div>
                        <div className="card-sublabel" style={{ color: timeColor }}>
                            {getComplexityLabel(time)}
                        </div>
                        <div className="complexity-meter">
                            {[1, 2, 3, 4, 5, 6, 7].map(i => (
                                <div
                                    key={i}
                                    className={`meter-bar ${i <= timeRating.bars ? 'active' : ''}`}
                                    style={i <= timeRating.bars ? {
                                        background: i <= 3 ? '#10b981' : i <= 5 ? '#f59e0b' : '#ef4444'
                                    } : {}}
                                />
                            ))}
                        </div>
                        <div className="rating-label" style={{ color: timeColor }}>
                            {timeRating.label}
                        </div>
                    </motion.div>

                    {/* Space Complexity Card */}
                    <motion.div
                        className="complexity-card"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <div className="card-header">
                            <div className="card-icon space-icon">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="2" width="20" height="20" rx="2" />
                                    <rect x="6" y="6" width="12" height="12" rx="1" />
                                    <rect x="10" y="10" width="4" height="4" rx="0.5" />
                                </svg>
                            </div>
                            <div className="card-label">Space Complexity</div>
                        </div>
                        <div className="card-value" style={{ color: spaceColor }}>
                            {space}
                        </div>
                        <div className="card-sublabel" style={{ color: spaceColor }}>
                            {getComplexityLabel(space)}
                        </div>
                        <div className="complexity-meter">
                            {[1, 2, 3, 4, 5, 6, 7].map(i => (
                                <div
                                    key={i}
                                    className={`meter-bar ${i <= spaceRating.bars ? 'active' : ''}`}
                                    style={i <= spaceRating.bars ? {
                                        background: i <= 3 ? '#10b981' : i <= 5 ? '#f59e0b' : '#ef4444'
                                    } : {}}
                                />
                            ))}
                        </div>
                        <div className="rating-label" style={{ color: spaceColor }}>
                            {spaceRating.label}
                        </div>
                    </motion.div>

                    {/* Execution Stats */}
                    <motion.div
                        className="exec-stats"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        <div className="stat-row">
                            <span className="stat-label">Total Steps</span>
                            <span className="stat-value">{details.totalSteps}</span>
                        </div>
                        <div className="stat-row">
                            <span className="stat-label">Loop Steps</span>
                            <span className="stat-value">{details.loopSteps}</span>
                        </div>
                        <div className="stat-row">
                            <span className="stat-label">Conditionals</span>
                            <span className="stat-value">{details.conditionalSteps}</span>
                        </div>
                        <div className="stat-row">
                            <span className="stat-label">Max Nesting</span>
                            <span className="stat-value">{details.maxNestDepth}</span>
                        </div>
                        <div className="stat-row">
                            <span className="stat-label">Variables</span>
                            <span className="stat-value">{details.variableCount}</span>
                        </div>
                        <div className="stat-row">
                            <span className="stat-label">Arrays</span>
                            <span className="stat-value">{details.arrayCount}</span>
                        </div>
                    </motion.div>

                    {/* Explanations */}
                    <motion.div
                        className="complexity-explanations"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                    >
                        <div className="explanations-title">Analysis Details</div>
                        {explanation.map((exp, i) => (
                            <div key={i} className="explanation-item">
                                <span className="explanation-dot">›</span>
                                <span>{exp}</span>
                            </div>
                        ))}
                        {details.arrayOps.length > 0 && (
                            <>
                                <div className="explanations-title" style={{ marginTop: '8px' }}>Array Operations</div>
                                {details.arrayOps.map((op, i) => (
                                    <div key={i} className="explanation-item">
                                        <span className="explanation-dot">⚡</span>
                                        <span><code>.{op.op}()</code> — {op.complexity}</span>
                                    </div>
                                ))}
                            </>
                        )}
                    </motion.div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
