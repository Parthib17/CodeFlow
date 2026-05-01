/**
 * Static Code Complexity Analyzer
 * Estimates Big O time and space complexity from parsed code structure.
 */

/**
 * Analyze Python source code and return complexity estimates.
 * @param {string} source - The Python source code
 * @param {{ steps: Array, error: any }} executionResult - Result from the executor
 * @returns {{ time: string, space: string, explanation: string[], details: object }}
 */
export function analyzeComplexity(source, executionResult) {
    const lines = source.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));

    const analysis = {
        loops: [],
        nestedDepth: 0,
        maxNestDepth: 0,
        hasRecursion: false,
        variables: new Set(),
        arrays: new Set(),
        arrayOps: [],
        conditionals: 0,
        functionDefs: [],
        functionCalls: [],
    };

    // Track indentation-based nesting
    let currentDepth = 0;
    const depthStack = [0];

    for (const line of lines) {
        const stripped = line.trim();
        const indent = line.length - line.trimStart().length;

        // Track nesting depth
        while (depthStack.length > 1 && indent <= depthStack[depthStack.length - 1]) {
            depthStack.pop();
            currentDepth = Math.max(0, currentDepth - 1);
        }

        // Detect for loops
        if (/^for\s+\w+\s+in\s+/.test(stripped)) {
            currentDepth++;
            depthStack.push(indent);

            let iterSize = 'n';
            const rangeMatch = stripped.match(/range\(([^)]+)\)/);
            if (rangeMatch) {
                const args = rangeMatch[1].split(',').map(a => a.trim());
                // Check if range uses len() or a variable
                if (args.some(a => /len\(/.test(a) || /^[a-zA-Z_]\w*$/.test(a))) {
                    iterSize = 'n';
                } else if (args.every(a => /^\d+$/.test(a))) {
                    iterSize = 'constant';
                }
                // Check for n-i type patterns (still O(n))
                if (args.some(a => /\w\s*-\s*\w/.test(a))) {
                    iterSize = 'n';
                }
            }

            analysis.loops.push({
                type: 'for',
                depth: currentDepth,
                iterSize,
                line: stripped,
            });
            analysis.maxNestDepth = Math.max(analysis.maxNestDepth, currentDepth);
        }

        // Detect while loops
        if (/^while\s+/.test(stripped)) {
            currentDepth++;
            depthStack.push(indent);
            analysis.loops.push({
                type: 'while',
                depth: currentDepth,
                iterSize: 'n', // conservative estimate
                line: stripped,
            });
            analysis.maxNestDepth = Math.max(analysis.maxNestDepth, currentDepth);
        }

        // Detect conditionals
        if (/^(if|elif|else)\s*/.test(stripped)) {
            analysis.conditionals++;
        }

        // Detect variables
        const assignMatch = stripped.match(/^(\w+)\s*=[^=]/);
        if (assignMatch) {
            analysis.variables.add(assignMatch[1]);
        }

        // Detect arrays/lists
        if (/\[.*\]/.test(stripped) && assignMatch) {
            analysis.arrays.add(assignMatch[1]);
        }

        // Detect array operations
        if (/\.append\(/.test(stripped)) {
            analysis.arrayOps.push({ op: 'append', complexity: 'O(1)' });
        }
        if (/\.pop\(/.test(stripped)) {
            analysis.arrayOps.push({ op: 'pop', complexity: 'O(1) / O(n)' });
        }
        if (/\.insert\(/.test(stripped)) {
            analysis.arrayOps.push({ op: 'insert', complexity: 'O(n)' });
        }
        if (/\.sort\(/.test(stripped)) {
            analysis.arrayOps.push({ op: 'sort', complexity: 'O(n log n)' });
        }
        if (/\.remove\(/.test(stripped)) {
            analysis.arrayOps.push({ op: 'remove', complexity: 'O(n)' });
        }

        // Detect function definitions
        const defMatch = stripped.match(/^def\s+(\w+)\s*\(/);
        if (defMatch) {
            analysis.functionDefs.push(defMatch[1]);
        }

        // Detect function calls (for recursion detection)
        for (const fn of analysis.functionDefs) {
            if (stripped.includes(`${fn}(`) && !stripped.startsWith('def ')) {
                analysis.functionCalls.push(fn);
                // Check if function calls itself (recursion)
                if (analysis.functionDefs.includes(fn)) {
                    analysis.hasRecursion = true;
                }
            }
        }
    }

    // Determine time complexity
    let timeComplexity = 'O(1)';
    let timeExplanation = [];

    if (analysis.maxNestDepth === 0 && analysis.loops.length === 0) {
        timeComplexity = 'O(1)';
        timeExplanation.push('No loops detected — constant time execution');
    } else if (analysis.maxNestDepth === 1) {
        // Check if any loop has sort inside
        if (analysis.arrayOps.some(op => op.op === 'sort')) {
            timeComplexity = 'O(n log n)';
            timeExplanation.push('Single loop with sort operation');
        } else {
            timeComplexity = 'O(n)';
            timeExplanation.push('Single-level loop iterating over input');
        }
    } else if (analysis.maxNestDepth === 2) {
        timeComplexity = 'O(n²)';
        timeExplanation.push('Two nested loops — quadratic time complexity');
    } else if (analysis.maxNestDepth === 3) {
        timeComplexity = 'O(n³)';
        timeExplanation.push('Three nested loops — cubic time complexity');
    } else if (analysis.maxNestDepth > 3) {
        timeComplexity = `O(n^${analysis.maxNestDepth})`;
        timeExplanation.push(`${analysis.maxNestDepth} nested loops — polynomial time`);
    }

    if (analysis.hasRecursion) {
        timeComplexity = 'O(2^n) *';
        timeExplanation.push('Recursion detected — complexity depends on recursion depth');
    }

    // Sequential loops (not nested) don't change dominant complexity
    const sequentialLoops = analysis.loops.filter(l => l.depth === 1).length;
    if (sequentialLoops > 1 && analysis.maxNestDepth <= 1) {
        timeExplanation.push(`${sequentialLoops} sequential loops (still ${timeComplexity})`);
    }

    // Add loop details
    if (analysis.loops.length > 0) {
        timeExplanation.push(`${analysis.loops.length} loop(s) found, max nesting depth: ${analysis.maxNestDepth}`);
    }

    // Determine space complexity
    let spaceComplexity = 'O(1)';
    let spaceExplanation = [];

    if (analysis.arrays.size > 0) {
        spaceComplexity = 'O(n)';
        spaceExplanation.push(`${analysis.arrays.size} array(s) used: ${[...analysis.arrays].join(', ')}`);

        // Check if arrays grow inside loops
        const hasAppendInLoop = analysis.loops.length > 0 && analysis.arrayOps.some(op => op.op === 'append');
        if (hasAppendInLoop) {
            spaceExplanation.push('Array grows inside loop — dynamic allocation');
        }
    } else {
        spaceExplanation.push('Only scalar variables used — constant space');
    }

    if (analysis.variables.size > 0) {
        spaceExplanation.push(`${analysis.variables.size} variable(s) tracked`);
    }

    // Execution statistics
    const totalSteps = executionResult?.steps?.length || 0;
    const loopSteps = executionResult?.steps?.filter(s =>
        s.flowType === 'loop-iteration' || s.flowType === 'loop-end'
    ).length || 0;
    const condSteps = executionResult?.steps?.filter(s =>
        s.flowType === 'if-true' || s.flowType === 'if-false' || s.flowType === 'else'
    ).length || 0;

    return {
        time: timeComplexity,
        space: spaceComplexity,
        explanation: [...timeExplanation, ...spaceExplanation],
        details: {
            totalSteps,
            loopSteps,
            conditionalSteps: condSteps,
            loopCount: analysis.loops.length,
            maxNestDepth: analysis.maxNestDepth,
            variableCount: analysis.variables.size,
            arrayCount: analysis.arrays.size,
            arrayOps: analysis.arrayOps,
            hasRecursion: analysis.hasRecursion,
        },
    };
}
