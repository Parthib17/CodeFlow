export const sampleSnippets = {
    python: [
        {
            name: 'Bubble Sort',
            icon: '🫧',
            description: 'Classic sorting with nested loops',
            code: `arr = [64, 34, 25, 12, 22, 11, 90]
n = len(arr)
for i in range(n - 1):
    for j in range(n - i - 1):
        if arr[j] > arr[j + 1]:
            arr[j], arr[j + 1] = arr[j + 1], arr[j]
print("Sorted:", arr)`,
        },
        {
            name: 'Dict & Comprehension',
            icon: '📖',
            description: 'Real Python features that the old engine could not handle',
            code: `words = ["apple", "banana", "apple", "cherry", "banana", "apple"]
counts = {}
for w in words:
    counts[w] = counts.get(w, 0) + 1

# Comprehensions, f-strings, sorting by key
top = sorted(counts.items(), key=lambda kv: -kv[1])
for word, n in top:
    print(f"{word}: {n}")`,
        },
        {
            name: 'Classes',
            icon: '🏛',
            description: 'Object-oriented Python',
            code: `class Animal:
    def __init__(self, name, sound):
        self.name = name
        self.sound = sound
    def speak(self):
        return f"{self.name} says {self.sound}"

class Dog(Animal):
    def __init__(self, name):
        super().__init__(name, "Woof")

d = Dog("Rex")
print(d.speak())`,
        },
        {
            name: 'Recursion: Fibonacci',
            icon: '🌀',
            description: 'Memoized recursive Fibonacci',
            code: `cache = {}
def fib(n):
    if n in cache: return cache[n]
    if n < 2: return n
    cache[n] = fib(n - 1) + fib(n - 2)
    return cache[n]

for i in range(10):
    print(i, fib(i))`,
        },
        {
            name: 'Exceptions',
            icon: '⚠️',
            description: 'try / except / finally',
            code: `def safe_div(a, b):
    try:
        return a / b
    except ZeroDivisionError:
        return None
    finally:
        print(f"divided {a} by {b}")

print(safe_div(10, 2))
print(safe_div(5, 0))`,
        },
        {
            name: 'FizzBuzz',
            icon: '🎯',
            description: 'Classic FizzBuzz',
            code: `for i in range(1, 16):
    if i % 15 == 0: print("FizzBuzz")
    elif i % 3 == 0: print("Fizz")
    elif i % 5 == 0: print("Buzz")
    else: print(i)`,
        },
    ],
    javascript: [
        {
            name: 'Bubble Sort',
            icon: '🫧',
            description: 'Sort with destructuring swap',
            code: `const arr = [64, 34, 25, 12, 22, 11, 90];
for (let i = 0; i < arr.length - 1; i++) {
    for (let j = 0; j < arr.length - i - 1; j++) {
        if (arr[j] > arr[j + 1]) {
            [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
        }
    }
}
console.log("Sorted:", arr);`,
        },
        {
            name: 'Map / Filter / Reduce',
            icon: '🔁',
            description: 'Functional pipeline',
            code: `const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const result = nums
    .filter(n => n % 2 === 0)
    .map(n => n * n)
    .reduce((a, b) => a + b, 0);
console.log("Sum of squares of evens:", result);`,
        },
        {
            name: 'Classes',
            icon: '🏛',
            description: 'ES6 classes + inheritance',
            code: `class Shape {
    constructor(name) { this.name = name; }
    area() { return 0; }
}
class Circle extends Shape {
    constructor(r) { super("Circle"); this.r = r; }
    area() { return Math.PI * this.r * this.r; }
}
const c = new Circle(5);
console.log(\`\${c.name} area: \${c.area().toFixed(2)}\`);`,
        },
        {
            name: 'Async/Await',
            icon: '⏳',
            description: 'Promises and await',
            code: `async function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}
async function main() {
    console.log("start");
    await delay(50);
    console.log("after 50ms");
    const sum = [1, 2, 3].reduce((a, b) => a + b);
    console.log("sum:", sum);
}
main();`,
        },
        {
            name: 'FizzBuzz',
            icon: '🎯',
            description: 'Classic FizzBuzz',
            code: `for (let i = 1; i <= 15; i++) {
    if (i % 15 === 0) console.log("FizzBuzz");
    else if (i % 3 === 0) console.log("Fizz");
    else if (i % 5 === 0) console.log("Buzz");
    else console.log(i);
}`,
        },
    ],
    java: [
        {
            name: 'Hello + Math',
            icon: '👋',
            description: 'Hello world with arithmetic',
            code: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
        int x = 10, y = 20;
        System.out.println("Sum: " + (x + y));
    }
}`,
        },
        {
            name: 'Bubble Sort',
            icon: '🫧',
            description: 'Sort an array',
            code: `public class Main {
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
}`,
        },
        {
            name: 'Streams',
            icon: '🌊',
            description: 'Modern Java streams',
            code: `import java.util.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        int sum = IntStream.rangeClosed(1, 10).filter(n -> n % 2 == 0).map(n -> n * n).sum();
        System.out.println("Sum of squares of evens: " + sum);
    }
}`,
        },
    ],
    cpp: [
        {
            name: 'Hello World',
            icon: '👋',
            description: 'iostream basics',
            code: `#include <iostream>
int main() {
    std::cout << "Hello, World!" << std::endl;
    return 0;
}`,
        },
        {
            name: 'Vector Sort',
            icon: '🫧',
            description: 'std::sort',
            code: `#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;
int main() {
    vector<int> v = {5, 3, 8, 1, 9, 2};
    sort(v.begin(), v.end());
    for (int x : v) cout << x << " ";
    cout << endl;
    return 0;
}`,
        },
    ],
    c: [
        {
            name: 'Hello World',
            icon: '👋',
            description: 'printf',
            code: `#include <stdio.h>
int main() {
    printf("Hello, World!\\n");
    return 0;
}`,
        },
    ],
    go: [
        {
            name: 'Hello World',
            icon: '👋',
            description: 'fmt.Println',
            code: `package main
import "fmt"
func main() {
    fmt.Println("Hello, World!")
}`,
        },
    ],
    rust: [
        {
            name: 'Hello World',
            icon: '👋',
            description: 'println!',
            code: `fn main() {
    println!("Hello, World!");
}`,
        },
        {
            name: 'Vec & Iterator',
            icon: '🦀',
            description: 'Functional Rust',
            code: `fn main() {
    let nums: Vec<i32> = (1..=10).collect();
    let sum: i32 = nums.iter().filter(|n| *n % 2 == 0).map(|n| n * n).sum();
    println!("{}", sum);
}`,
        },
    ],
    typescript: [
        {
            name: 'Typed Sort',
            icon: '🔷',
            description: 'TS with types',
            code: `const arr: number[] = [5, 3, 8, 1, 9, 2];
const sorted = [...arr].sort((a, b) => a - b);
console.log("Sorted:", sorted);`,
        },
    ],
    csharp: [
        {
            name: 'Hello World',
            icon: '👋',
            description: 'Console.WriteLine',
            code: `using System;
class Program {
    static void Main() {
        Console.WriteLine("Hello, World!");
    }
}`,
        },
    ],
    ruby: [
        {
            name: 'Hello World',
            icon: '👋',
            description: 'puts',
            code: `puts "Hello, World!"
arr = [5, 3, 8, 1, 9, 2]
puts arr.sort.inspect`,
        },
    ],
    php: [
        {
            name: 'Hello World',
            icon: '👋',
            description: 'echo',
            code: `<?php
echo "Hello, World!\\n";
$arr = [5, 3, 8, 1, 9, 2];
sort($arr);
print_r($arr);`,
        },
    ],
    kotlin: [
        {
            name: 'Hello World',
            icon: '👋',
            description: 'println',
            code: `fun main() {
    println("Hello, World!")
}`,
        },
    ],
    swift: [
        {
            name: 'Hello World',
            icon: '👋',
            description: 'print',
            code: `print("Hello, World!")`,
        },
    ],
    bash: [
        {
            name: 'Hello World',
            icon: '👋',
            description: 'echo',
            code: `#!/bin/bash
echo "Hello, World!"
for i in {1..5}; do
    echo "Number: $i"
done`,
        },
    ],
};
