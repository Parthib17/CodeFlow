import React, { useState } from 'react';
import { useExecution } from '../context/ExecutionContext';
import './ExecutionControls.css';

export default function ExecutionControls() {
    const {
        execute, autoPlay, nextStep, prevStep, pause, reset,
        steps, currentStep, isRunning, isPaused, isComplete,
        speed, setSpeed, error,
    } = useExecution();

    const hasSteps = steps.length > 0;
    const isAtStart = currentStep <= 0;
    const isAtEnd = currentStep >= steps.length - 1;

    const handleRun = () => {
        if (isRunning && !isPaused) {
            // Pause if currently running
            pause();
        } else if (!hasSteps || isComplete) {
            // Fresh execution
            execute();
        } else if (isPaused) {
            // Resume from paused state
            autoPlay(speed);
        }
    };

    const handleAutoPlay = () => {
        if (hasSteps && !isAtEnd) {
            autoPlay(speed);
        }
    };

    const speedLabels = {
        1500: 'Slow',
        800: 'Normal',
        400: 'Fast',
        150: 'Turbo',
    };

    return (
        <div className="execution-controls" id="execution-controls">
            <div className="controls-left">
                {/* Run / Restart */}
                <button
                    className="ctrl-btn ctrl-run"
                    onClick={handleRun}
                    id="btn-run"
                    title={hasSteps && isComplete ? 'Restart' : 'Run Code'}
                >
                    {isRunning && !isPaused ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                    ) : isComplete ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
                    ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                    )}
                    <span>{isRunning && !isPaused ? 'Running' : isComplete ? 'Restart' : hasSteps && isPaused ? 'Resume' : 'Run'}</span>
                </button>

                {/* Pause */}
                {isRunning && !isPaused && (
                    <button className="ctrl-btn" onClick={pause} id="btn-pause" title="Pause">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                        <span>Pause</span>
                    </button>
                )}

                <div className="ctrl-divider" />

                {/* Step Controls */}
                <button
                    className="ctrl-btn"
                    onClick={prevStep}
                    disabled={!hasSteps || isAtStart}
                    id="btn-prev"
                    title="Previous Step"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="19 20 9 12 19 4 19 20" /><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="2" /></svg>
                </button>

                <button
                    className="ctrl-btn"
                    onClick={nextStep}
                    disabled={!hasSteps || isAtEnd}
                    id="btn-next"
                    title="Next Step"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2" /></svg>
                </button>

                {hasSteps && isPaused && !isAtEnd && (
                    <button className="ctrl-btn ctrl-autoplay" onClick={handleAutoPlay} id="btn-autoplay" title="Auto Play">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor" /></svg>
                        <span>Auto</span>
                    </button>
                )}

                <div className="ctrl-divider" />

                {/* Reset */}
                <button
                    className="ctrl-btn ctrl-reset"
                    onClick={reset}
                    disabled={!hasSteps}
                    id="btn-reset"
                    title="Reset"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" /></svg>
                    <span>Reset</span>
                </button>
            </div>

            <div className="controls-center">
                {hasSteps && (
                    <div className="step-counter">
                        <span className="step-current">{currentStep + 1}</span>
                        <span className="step-separator">/</span>
                        <span className="step-total">{steps.length}</span>
                        <span className="step-label">steps</span>
                    </div>
                )}
                {error && (
                    <div className="error-badge" id="error-badge">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                        <span>{error.message.length > 50 ? error.message.slice(0, 50) + '...' : error.message}</span>
                    </div>
                )}
            </div>

            <div className="controls-right">
                <div className="speed-control" id="speed-control">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    <div className="speed-buttons">
                        {Object.entries(speedLabels).map(([ms, label]) => (
                            <button
                                key={ms}
                                className={`speed-btn ${speed === Number(ms) ? 'active' : ''}`}
                                onClick={() => setSpeed(Number(ms))}
                                id={`speed-${label.toLowerCase()}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
