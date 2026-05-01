import React from 'react';
import { ExecutionProvider } from './context/ExecutionContext';
import Header from './components/Header';
import CodeEditor from './components/CodeEditor';
import ExecutionControls from './components/ExecutionControls';
import VariablePanel from './components/VariablePanel';
import DataStructurePanel from './components/DataStructurePanel';
import TimelinePanel from './components/TimelinePanel';
import OutputPanel from './components/OutputPanel';

import './App.css';

function App() {
  return (
    <ExecutionProvider>
      <div className="app" id="app-root">
        <Header />
        <ExecutionControls />
        <main className="app-main" id="main-content">
          {/* Left Column: Code Editor */}
          <div className="col col-editor">
            <CodeEditor />
          </div>

          {/* Center Column: Data Structures + Output */}
          <div className="col col-center">
            <DataStructurePanel />
            <OutputPanel />
          </div>

          {/* Right Column: Variables + Timeline */}
          <div className="col col-right">
            <VariablePanel />
            <TimelinePanel />
          </div>
        </main>

        {/* Decorative background elements */}
        <div className="bg-decoration">
          <div className="bg-orb bg-orb-1"></div>
          <div className="bg-orb bg-orb-2"></div>
          <div className="bg-orb bg-orb-3"></div>
        </div>
      </div>
    </ExecutionProvider>
  );
}

export default App;
