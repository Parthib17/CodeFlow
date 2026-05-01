import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import { executePython } from '../engine/pyodideRunner';
import { executeJavaScript } from '../engine/jsExecutor';
import { executeViaPiston, PISTON_LANGUAGES } from '../engine/pistonRunner';
import { analyzeComplexity } from '../engine/complexityAnalyzer';

const ExecutionContext = createContext(null);

// Languages that support per-step visualization (real interpreters with stepping).
export const VISUALIZED_LANGUAGES = new Set(['python', 'javascript']);

// All supported languages (visualized + piston-runner languages).
export const SUPPORTED_LANGUAGES = {
    python: { label: 'Python', icon: '🐍', mode: 'visualize' },
    javascript: { label: 'JavaScript', icon: '🟨', mode: 'visualize' },
    ...Object.fromEntries(
        Object.entries(PISTON_LANGUAGES).map(([k, v]) => [k, { label: v.label, icon: v.icon, mode: 'run' }])
    ),
};

const DEFAULT_SAMPLES = {
    python: `# Welcome to CodeFlow!
# Real CPython runs here — every Python feature works.

def fib(n):
    a, b = 0, 1
    seq = []
    for _ in range(n):
        seq.append(a)
        a, b = b, a + b
    return seq

result = fib(10)
print("Fibonacci:", result)
print("Sum:", sum(result))
`,
    javascript: `// Welcome to CodeFlow!
// Modern JavaScript (ES2023+) — arrow functions, classes, async, all of it.

const arr = [5, 3, 8, 1, 9, 2];

function bubbleSort(a) {
    const xs = [...a];
    for (let i = 0; i < xs.length - 1; i++) {
        for (let j = 0; j < xs.length - i - 1; j++) {
            if (xs[j] > xs[j + 1]) {
                [xs[j], xs[j + 1]] = [xs[j + 1], xs[j]];
            }
        }
    }
    return xs;
}

const sorted = bubbleSort(arr);
console.log("Sorted:", sorted);
`,
    java: `public class Main {
    public static void main(String[] args) {
        int[] arr = {64, 34, 25, 12, 22, 11, 90};
        for (int i = 0; i < arr.length - 1; i++) {
            for (int j = 0; j < arr.length - i - 1; j++) {
                if (arr[j] > arr[j + 1]) {
                    int t = arr[j]; arr[j] = arr[j + 1]; arr[j + 1] = t;
                }
            }
        }
        for (int x : arr) System.out.println(x);
    }
}
`,
    cpp: `#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;

int main() {
    vector<int> v = {5, 3, 8, 1, 9, 2};
    sort(v.begin(), v.end());
    for (int x : v) cout << x << " ";
    cout << endl;
    return 0;
}
`,
    c: `#include <stdio.h>

int main() {
    int arr[] = {5, 3, 8, 1, 9, 2};
    int n = 6;
    for (int i = 0; i < n - 1; i++)
        for (int j = 0; j < n - i - 1; j++)
            if (arr[j] > arr[j + 1]) {
                int t = arr[j]; arr[j] = arr[j + 1]; arr[j + 1] = t;
            }
    for (int i = 0; i < n; i++) printf("%d ", arr[i]);
    printf("\\n");
    return 0;
}
`,
    go: `package main

import "fmt"

func main() {
    arr := []int{5, 3, 8, 1, 9, 2}
    for i := 0; i < len(arr)-1; i++ {
        for j := 0; j < len(arr)-i-1; j++ {
            if arr[j] > arr[j+1] {
                arr[j], arr[j+1] = arr[j+1], arr[j]
            }
        }
    }
    fmt.Println(arr)
}
`,
    rust: `fn main() {
    let mut arr = vec![5, 3, 8, 1, 9, 2];
    arr.sort();
    println!("{:?}", arr);
}
`,
    typescript: `const arr: number[] = [5, 3, 8, 1, 9, 2];
const sorted = [...arr].sort((a, b) => a - b);
console.log("Sorted:", sorted);
`,
    csharp: `using System;
class Program {
    static void Main() {
        int[] arr = {5, 3, 8, 1, 9, 2};
        Array.Sort(arr);
        Console.WriteLine(string.Join(" ", arr));
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
            const sample = DEFAULT_SAMPLES[action.payload] || '';
            // Only swap source if user is on a default sample (avoid clobbering edits).
            const currentIsDefault = Object.values(DEFAULT_SAMPLES).includes(state.code);
            return {
                ...state,
                language: action.payload,
                code: currentIsDefault ? sample : state.code,
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

            // Static complexity is Python-flavored; only show it for languages where it makes sense.
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
