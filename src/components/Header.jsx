import React, { useState, useRef, useEffect } from 'react';
import './Header.css';
import { useExecution } from '../context/ExecutionContext';

export default function Header() {
    const { language, setLanguage, supportedLanguages, isVisualized, loadingMessage } = useExecution();
    const [open, setOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const onClick = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    const current = supportedLanguages[language];

    return (
        <header className="header" id="main-header">
            <div className="header-left">
                <div className="logo">
                    <div className="logo-icon">
                        <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                            <defs>
                                <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#6366f1" />
                                    <stop offset="50%" stopColor="#a855f7" />
                                    <stop offset="100%" stopColor="#06b6d4" />
                                </linearGradient>
                            </defs>
                            <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#logoGrad)" opacity="0.15" />
                            <path d="M10 10L16 16L10 22" stroke="url(#logoGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M18 22H24" stroke="url(#logoGrad)" strokeWidth="2.5" strokeLinecap="round" />
                        </svg>
                    </div>
                    <div className="logo-text">
                        <h1 className="logo-title">CodeFlow</h1>
                        <span className="logo-subtitle">Execution Intelligence</span>
                    </div>
                </div>
            </div>

            <div className="header-center">
                <div className="lang-dropdown" ref={dropdownRef}>
                    <button
                        className="lang-dropdown-btn"
                        onClick={() => setOpen((o) => !o)}
                        id="lang-dropdown-btn"
                    >
                        <span className="lang-icon">{current?.icon}</span>
                        <span className="lang-name">{current?.label}</span>
                        <span className={`lang-mode-pill mode-${current?.mode}`}>
                            {current?.mode === 'visualize' ? 'Visualize' : 'Run'}
                        </span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                             style={{ transform: open ? 'rotate(180deg)' : '', transition: 'transform 0.2s' }}>
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </button>
                    {open && (
                        <div className="lang-dropdown-menu" id="lang-dropdown-menu">
                            <div className="lang-group-label">Step-by-step visualization</div>
                            {Object.entries(supportedLanguages).filter(([, v]) => v.mode === 'visualize').map(([id, v]) => (
                                <button
                                    key={id}
                                    className={`lang-option ${language === id ? 'active' : ''}`}
                                    onClick={() => { setLanguage(id); setOpen(false); }}
                                >
                                    <span className="lang-icon">{v.icon}</span>
                                    <span>{v.label}</span>
                                    {language === id && <span className="lang-check">✓</span>}
                                </button>
                            ))}
                            <div className="lang-group-label">Run remotely (output only)</div>
                            {Object.entries(supportedLanguages).filter(([, v]) => v.mode === 'run').map(([id, v]) => (
                                <button
                                    key={id}
                                    className={`lang-option ${language === id ? 'active' : ''}`}
                                    onClick={() => { setLanguage(id); setOpen(false); }}
                                >
                                    <span className="lang-icon">{v.icon}</span>
                                    <span>{v.label}</span>
                                    {language === id && <span className="lang-check">✓</span>}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="header-right">
                {loadingMessage ? (
                    <div className="status-badge status-loading">
                        <span className="status-dot status-dot-loading"></span>
                        <span className="status-text">{loadingMessage}</span>
                    </div>
                ) : (
                    <div className="status-badge">
                        <span className="status-dot"></span>
                        <span className="status-text">
                            {isVisualized ? 'Local Engine' : 'Remote Sandbox'}
                        </span>
                    </div>
                )}
            </div>
        </header>
    );
}
