import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import { executePython } from '../engine/pyodideRunner';
import { executeJavaScript } from '../engine/jsExecutor';
import { executeJava } from '../engine/javaExecutor';
import { executeC } from '../engine/cExecutor';
import { executeCpp } from '../engine/cppExecutor';
import { executeGo } from '../engine/goExecutor';
import { executeRust } from '../engine/rustExecutor';
import { executeCSharp } from '../engine/csharpExecutor';
import { executeViaPiston, PISTON_LANGUAGES } from '../engine/pistonRunner';
import { analyzeComplexity } from '../engine/complexityAnalyzer';

const ExecutionContext = createContext(null);

// Languages that support per-step visualization (real interpreters with stepping).
export const VISUALIZED_LANGUAGES = new Set(['python', 'javascript', 'java', 'c', 'cpp', 'go', 'rust', 'csharp']);

// All supported languages (visualized + piston-runner languages).
export const SUPPORTED_LANGUAGES = {
    python:     { label: 'Python',     icon: '🐍', mode: 'visualize' },
    javascript: { label: 'JavaScript', icon: '🟨', mode: 'visualize' },
    java:       { label: 'Java',       icon: '☕', mode: 'visualize' },
    c:          { label: 'C',          icon: '🅒',  mode: 'visualize' },
    cpp:        { label: 'C++',        icon: '➕', mode: 'visualize' },
    go:         { label: 'Go',         icon: '🐹', mode: 'visualize' },
    rust:       { label: 'Rust',       icon: '🦀', mode: 'visualize' },
    csharp:     { label: 'C#',         icon: '#️⃣', mode: 'visualize' },
    ...Object.fromEntries(
        Object.entries(PISTON_LANGUAGES)
            .filter(([k]) => !['java', 'c', 'cpp', 'go', 'rust', 'csharp'].includes(k))
            .map(([k, v]) => [k, { label: v.label, icon: v.icon, mode: 'run' }])
    ),
};

const DEFAULT_SAMPLES = {
    python: `# Welcome to CodeFlow!
# Bubble Sort — watch the array swap step by step.

arr = [64, 34, 25, 12, 22, 11, 90]
n = len(arr)

for i in range(n - 1):
    for j in range(n - i - 1):
        if arr[j] > arr[j + 1]:
            arr[j], arr[j + 1] = arr[j + 1], arr[j]

print("Sorted:", arr)
`,
    javascript: `// Welcome to CodeFlow!
// Bubble Sort — watch the array swap step by step.

const arr = [64, 34, 25, 12, 22, 11, 90];
const n = arr.length;

for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - i - 1; j++) {
        if (arr[j] > arr[j + 1]) {
            [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
        }
    }
}

console.log("Sorted:", arr);
`,
    java: `public class Main {
    public static void main(String[] args) {
        int[] arr = {64, 34, 25, 12, 22, 11, 90};
        int n = arr.length;

        // Bubble Sort — watch the array change step by step
        for (int i = 0; i < n - 1; i++) {
            for (int j = 0; j < n - i - 1; j++) {
                if (arr[j] > arr[j + 1]) {
                    int temp = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = temp;
                }
            }
        }

        System.out.println("Sorted array:");
        for (int i = 0; i < n; i++) {
            System.out.println(arr[i]);
        }
    }
}
`,
    cpp: `#include <iostream>
#include <vector>
using namespace std;

int main() {
    vector<int> v = {64, 34, 25, 12, 22, 11, 90};
    int n = v.size();

    // Bubble Sort — watch vector change step by step
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (v[j] > v[j + 1]) {
                int temp = v[j];
                v[j] = v[j + 1];
                v[j + 1] = temp;
            }
        }
    }

    cout << "Sorted: ";
    for (int x : v) {
        cout << x << " ";
    }
    cout << endl;
    return 0;
}
`,
    c: `#include <stdio.h>

int main() {
    int arr[] = {64, 34, 25, 12, 22, 11, 90};
    int n = 7;

    // Bubble Sort — watch the array change step by step
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                int temp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
        }
    }

    printf("Sorted array:\\n");
    for (int i = 0; i < n; i++) {
        printf("%d\\n", arr[i]);
    }
    return 0;
}
`,
    go: `package main

import "fmt"

func main() {
    arr := []int{64, 34, 25, 12, 22, 11, 90}
    n := len(arr)

    // Bubble Sort — watch the slice swap step by step
    for i := 0; i < n-1; i++ {
        for j := 0; j < n-i-1; j++ {
            if arr[j] > arr[j+1] {
                arr[j], arr[j+1] = arr[j+1], arr[j]
            }
        }
    }

    fmt.Println("Sorted:", arr)
}
`,
    rust: `fn main() {
    let mut arr = vec![64, 34, 25, 12, 22, 11, 90];
    let n = arr.len();

    // Bubble Sort — watch the vec swap step by step
    for i in 0..n - 1 {
        for j in 0..n - i - 1 {
            if arr[j] > arr[j + 1] {
                let temp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
        }
    }

    println!("Sorted: {:?}", arr);
}
`,
    typescript: `const arr: number[] = [5, 3, 8, 1, 9, 2];
const sorted = [...arr].sort((a, b) => a - b);
console.log("Sorted:", sorted);
`,
    csharp: `using System;

class Program {
    static void Main() {
        int[] arr = {64, 34, 25, 12, 22, 11, 90};
        int n = arr.Length;

        // Bubble Sort — watch the array swap step by step
        for (int i = 0; i < n - 1; i++) {
            for (int j = 0; j < n - i - 1; j++) {
                if (arr[j] > arr[j + 1]) {
                    int temp = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = temp;
                }
            }
        }

        Console.WriteLine("Sorted:");
        foreach (var x in arr) {
            Console.WriteLine(x);
        }
    }
}
`,
    ruby: `arr = [5, 3, 8, 1, 9, 2]
puts arr.sort.inspect
`,
    php: `<?php
$arr = [5, 3, 8, 1, 9, 2];
sort($arr);
print_r($arr);
`,
    kotlin: `fun main() {
    val arr = intArrayOf(5, 3, 8, 1, 9, 2)
    arr.sort()
    println(arr.joinToString(" "))
}
`,
    swift: `let arr = [5, 3, 8, 1, 9, 2]
print(arr.sorted())
`,
    bash: `#!/bin/bash
arr=(5 3 8 1 9 2)
IFS=$'\\n' sorted=($(sort -n <<<"\${arr[*]}"))
echo "\${sorted[@]}"
`,
};

const initialState = {
    code: DEFAULT_SAMPLES.python,
    language: 'python',
    steps: [],
    currentStep: -1,
    isRunning: false,
    isPaused: false,
    isComplete: false,
    error: null,
    output: '',
    speed: 800,
    complexity: null,
    loadingMessage: null,
};

function reducer(state, action) {
    switch (action.type) {
        case 'SET_CODE':
            return { ...state, code: action.payload, steps: [], currentStep: -1, isRunning: false, isPaused: false, isComplete: false, error: null, output: '', complexity: null };
        case 'SET_LANGUAGE': {
            // Always load the language's default sample so the editor immediately
            // shows valid code for the new language. (Previous behavior preserved
            // edits, but the user wanted automatic swap on language change.)
            const sample = DEFAULT_SAMPLES[action.payload] ?? state.code;
            return {
                ...state,
                language: action.payload,
                code: sample,
                steps: [],
                currentStep: -1,
                isRunning: false,
                isPaused: false,
                isComplete: false,
                error: null,
                output: '',
                complexity: null,
            };
        }
        case 'SET_LOADING':
            return { ...state, loadingMessage: action.payload };
        case 'SET_STEPS':
            return {
                ...state,
                steps: action.payload.steps,
                error: action.payload.error,
                output: action.payload.output,
                complexity: action.payload.complexity || null,
                loadingMessage: null,
            };
        case 'SET_CURRENT_STEP':
            return { ...state, currentStep: action.payload };
        case 'START_RUNNING':
            return { ...state, isRunning: true, isPaused: false, isComplete: false };
        case 'PAUSE':
            return { ...state, isPaused: true, isRunning: false };
        case 'RESUME':
            return { ...state, isPaused: false, isRunning: true };
        case 'STOP':
            return { ...state, isRunning: false, isPaused: false, isComplete: true };
        case 'RESET':
            return { ...state, steps: [], currentStep: -1, isRunning: false, isPaused: false, isComplete: false, error: null, output: '', complexity: null, loadingMessage: null };
        case 'SET_SPEED':
            return { ...state, speed: action.payload };
        default:
            return state;
    }
}

async function runEngine(language, code, onProgress) {
    if (language === 'python') {
        return executePython(code, onProgress);
    }
    if (language === 'javascript') {
        return executeJavaScript(code);
    }
    if (language === 'java') {
        return executeJava(code);
    }
    if (language === 'c') {
        return executeC(code);
    }
    if (language === 'cpp') {
        return executeCpp(code);
    }
    if (language === 'go') {
        return executeGo(code);
    }
    if (language === 'rust') {
        return executeRust(code);
    }
    if (language === 'csharp') {
        return executeCSharp(code);
    }
    if (PISTON_LANGUAGES[language]) {
        onProgress?.('Compiling & running on remote sandbox…');
        return executeViaPiston(language, code);
    }
    return { steps: [], error: { message: `Language '${language}' not supported`, line: 1 }, output: '' };
}

export function ExecutionProvider({ children }) {
    const [state, dispatch] = useReducer(reducer, initialState);
    const autoPlayRef = useRef(null);
    const stepsRef = useRef([]);
    const currentStepRef = useRef(-1);
    const runIdRef = useRef(0);

    const clearAutoPlay = useCallback(() => {
        if (autoPlayRef.current) {
            clearInterval(autoPlayRef.current);
            autoPlayRef.current = null;
        }
    }, []);

    const execute = useCallback(async () => {
        clearAutoPlay();
        dispatch({ type: 'RESET' });
        const myRunId = ++runIdRef.current;

        try {
            const onProgress = (msg) => {
                if (runIdRef.current === myRunId) dispatch({ type: 'SET_LOADING', payload: msg });
            };
            const result = await runEngine(state.language, state.code, onProgress);
            if (runIdRef.current !== myRunId) return; // superseded by another run

            // Run static complexity analysis for all visualized languages.
            if (VISUALIZED_LANGUAGES.has(state.language)) {
                try { result.complexity = analyzeComplexity(state.code, result); }
                catch { result.complexity = null; }
            } else {
                result.complexity = null;
            }

            stepsRef.current = result.steps;
            currentStepRef.current = -1;
            dispatch({ type: 'SET_STEPS', payload: result });

            if (result.steps.length > 0) {
                dispatch({ type: 'START_RUNNING' });
                dispatch({ type: 'SET_CURRENT_STEP', payload: 0 });
                currentStepRef.current = 0;

                autoPlayRef.current = setInterval(() => {
                    const nextStep = currentStepRef.current + 1;
                    if (nextStep >= stepsRef.current.length) {
                        clearAutoPlay();
                        dispatch({ type: 'STOP' });
                        return;
                    }
                    currentStepRef.current = nextStep;
                    dispatch({ type: 'SET_CURRENT_STEP', payload: nextStep });
                }, state.speed);
            } else {
                dispatch({ type: 'STOP' });
            }
        } catch (e) {
            if (runIdRef.current !== myRunId) return;
            console.error('Execution error:', e);
            dispatch({
                type: 'SET_STEPS',
                payload: { steps: [], error: { message: e.message || 'Unknown execution error', line: 0 }, output: '', complexity: null },
            });
            dispatch({ type: 'STOP' });
        }
    }, [state.code, state.language, state.speed, clearAutoPlay]);

    const autoPlay = useCallback((speed) => {
        clearAutoPlay();
        dispatch({ type: 'RESUME' });
        autoPlayRef.current = setInterval(() => {
            const nextStep = currentStepRef.current + 1;
            if (nextStep >= stepsRef.current.length) {
                clearAutoPlay();
                dispatch({ type: 'STOP' });
                return;
            }
            currentStepRef.current = nextStep;
            dispatch({ type: 'SET_CURRENT_STEP', payload: nextStep });
        }, speed);
    }, [clearAutoPlay]);

    const nextStep = useCallback(() => {
        clearAutoPlay();
        const next = currentStepRef.current + 1;
        if (next < stepsRef.current.length) {
            currentStepRef.current = next;
            dispatch({ type: 'SET_CURRENT_STEP', payload: next });
            dispatch({ type: 'PAUSE' });
        } else {
            dispatch({ type: 'STOP' });
        }
    }, [clearAutoPlay]);

    const prevStep = useCallback(() => {
        clearAutoPlay();
        const prev = currentStepRef.current - 1;
        if (prev >= 0) {
            currentStepRef.current = prev;
            dispatch({ type: 'SET_CURRENT_STEP', payload: prev });
            dispatch({ type: 'PAUSE' });
        }
    }, [clearAutoPlay]);

    const jumpToStep = useCallback((step) => {
        clearAutoPlay();
        if (step >= 0 && step < stepsRef.current.length) {
            currentStepRef.current = step;
            dispatch({ type: 'SET_CURRENT_STEP', payload: step });
            dispatch({ type: 'PAUSE' });
        }
    }, [clearAutoPlay]);

    const pause = useCallback(() => {
        clearAutoPlay();
        dispatch({ type: 'PAUSE' });
    }, [clearAutoPlay]);

    const reset = useCallback(() => {
        clearAutoPlay();
        currentStepRef.current = -1;
        runIdRef.current++;
        dispatch({ type: 'RESET' });
    }, [clearAutoPlay]);

    const setCode = useCallback((code) => {
        clearAutoPlay();
        dispatch({ type: 'SET_CODE', payload: code });
    }, [clearAutoPlay]);

    const setLanguage = useCallback((lang) => {
        clearAutoPlay();
        dispatch({ type: 'SET_LANGUAGE', payload: lang });
    }, [clearAutoPlay]);

    const setSpeed = useCallback((speed) => {
        dispatch({ type: 'SET_SPEED', payload: speed });
    }, []);

    const value = {
        ...state,
        execute,
        autoPlay,
        nextStep,
        prevStep,
        jumpToStep,
        pause,
        reset,
        setCode,
        setLanguage,
        setSpeed,
        supportedLanguages: SUPPORTED_LANGUAGES,
        isVisualized: VISUALIZED_LANGUAGES.has(state.language),
    };

    return <ExecutionContext.Provider value={value}>{children}</ExecutionContext.Provider>;
}

export function useExecution() {
    const ctx = useContext(ExecutionContext);
    if (!ctx) throw new Error('useExecution must be used within ExecutionProvider');
    return ctx;
}
