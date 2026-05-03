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
            description: 'Watch the array swap step by step',
            code: `public class Main {
    public static void main(String[] args) {
        int[] arr = {64, 34, 25, 12, 22, 11, 90};
        int n = arr.length;
        for (int i = 0; i < n - 1; i++) {
            for (int j = 0; j < n - i - 1; j++) {
                if (arr[j] > arr[j + 1]) {
                    int t = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = t;
                }
            }
        }
        for (int x : arr) System.out.println(x);
    }
}`,
        },
        {
            name: 'Selection Sort',
            icon: '🎯',
            description: 'Find the minimum and swap',
            code: `public class Main {
    public static void main(String[] args) {
        int[] arr = {29, 10, 14, 37, 13};
        int n = arr.length;
        for (int i = 0; i < n - 1; i++) {
            int minIdx = i;
            for (int j = i + 1; j < n; j++) {
                if (arr[j] < arr[minIdx]) {
                    minIdx = j;
                }
            }
            int t = arr[i];
            arr[i] = arr[minIdx];
            arr[minIdx] = t;
        }
        for (int x : arr) System.out.println(x);
    }
}`,
        },
        {
            name: 'Linear Search',
            icon: '🔍',
            description: 'Step through each element',
            code: `public class Main {
    public static void main(String[] args) {
        int[] arr = {7, 3, 11, 5, 19, 2, 8};
        int target = 19;
        int found = -1;
        for (int i = 0; i < arr.length; i++) {
            if (arr[i] == target) {
                found = i;
                break;
            }
        }
        if (found >= 0) {
            System.out.println("Found " + target + " at index " + found);
        } else {
            System.out.println("Not found");
        }
    }
}`,
        },
        {
            name: 'Binary Search',
            icon: '🪓',
            description: 'Halve the array each step',
            code: `public class Main {
    public static void main(String[] args) {
        int[] arr = {1, 3, 5, 7, 9, 11, 13, 15, 17, 19};
        int target = 13;
        int low = 0;
        int high = arr.length - 1;
        int found = -1;
        while (low <= high) {
            int mid = (low + high) / 2;
            if (arr[mid] == target) {
                found = mid;
                break;
            } else if (arr[mid] < target) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        System.out.println("Found at index: " + found);
    }
}`,
        },
        {
            name: 'Reverse Array',
            icon: '↩️',
            description: 'Two-pointer reversal',
            code: `public class Main {
    public static void main(String[] args) {
        int[] arr = {1, 2, 3, 4, 5, 6, 7};
        int left = 0;
        int right = arr.length - 1;
        while (left < right) {
            int t = arr[left];
            arr[left] = arr[right];
            arr[right] = t;
            left++;
            right--;
        }
        for (int x : arr) System.out.println(x);
    }
}`,
        },
        {
            name: 'Fibonacci',
            icon: '🌀',
            description: 'Iterative sequence',
            code: `public class Main {
    public static void main(String[] args) {
        int n = 10;
        int[] fib = new int[n];
        fib[0] = 0;
        fib[1] = 1;
        for (int i = 2; i < n; i++) {
            fib[i] = fib[i - 1] + fib[i - 2];
        }
        for (int x : fib) System.out.println(x);
    }
}`,
        },
        {
            name: 'FizzBuzz',
            icon: '🎯',
            description: 'Classic FizzBuzz',
            code: `public class Main {
    public static void main(String[] args) {
        for (int i = 1; i <= 15; i++) {
            if (i % 15 == 0) {
                System.out.println("FizzBuzz");
            } else if (i % 3 == 0) {
                System.out.println("Fizz");
            } else if (i % 5 == 0) {
                System.out.println("Buzz");
            } else {
                System.out.println(i);
            }
        }
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
using namespace std;
int main() {
    cout << "Hello, World!" << endl;
    int x = 10, y = 20;
    cout << "Sum: " << (x + y) << endl;
    return 0;
}`,
        },
        {
            name: 'Bubble Sort',
            icon: '🫧',
            description: 'Watch the vector swap step by step',
            code: `#include <iostream>
#include <vector>
using namespace std;
int main() {
    vector<int> v = {5, 3, 8, 1, 9, 2};
    int n = v.size();
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (v[j] > v[j + 1]) {
                int t = v[j];
                v[j] = v[j + 1];
                v[j + 1] = t;
            }
        }
    }
    for (int x : v) cout << x << " ";
    cout << endl;
    return 0;
}`,
        },
        {
            name: 'Selection Sort',
            icon: '🎯',
            description: 'Find the minimum and swap',
            code: `#include <iostream>
#include <vector>
using namespace std;
int main() {
    vector<int> v = {29, 10, 14, 37, 13};
    int n = v.size();
    for (int i = 0; i < n - 1; i++) {
        int minIdx = i;
        for (int j = i + 1; j < n; j++) {
            if (v[j] < v[minIdx]) {
                minIdx = j;
            }
        }
        int t = v[i];
        v[i] = v[minIdx];
        v[minIdx] = t;
    }
    for (int x : v) cout << x << " ";
    cout << endl;
    return 0;
}`,
        },
        {
            name: 'Binary Search',
            icon: '🪓',
            description: 'Halve the array each step',
            code: `#include <iostream>
#include <vector>
using namespace std;
int main() {
    vector<int> v = {1, 3, 5, 7, 9, 11, 13, 15, 17, 19};
    int target = 13;
    int low = 0;
    int high = v.size() - 1;
    int found = -1;
    while (low <= high) {
        int mid = (low + high) / 2;
        if (v[mid] == target) {
            found = mid;
            break;
        } else if (v[mid] < target) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    cout << "Found at index: " << found << endl;
    return 0;
}`,
        },
        {
            name: 'Reverse Vector',
            icon: '↩️',
            description: 'Two-pointer reversal',
            code: `#include <iostream>
#include <vector>
using namespace std;
int main() {
    vector<int> v = {1, 2, 3, 4, 5, 6, 7};
    int left = 0;
    int right = v.size() - 1;
    while (left < right) {
        int t = v[left];
        v[left] = v[right];
        v[right] = t;
        left++;
        right--;
    }
    for (int x : v) cout << x << " ";
    cout << endl;
    return 0;
}`,
        },
        {
            name: 'Fibonacci',
            icon: '🌀',
            description: 'Iterative sequence',
            code: `#include <iostream>
#include <vector>
using namespace std;
int main() {
    int n = 10;
    vector<int> fib(n, 0);
    fib[0] = 0;
    fib[1] = 1;
    for (int i = 2; i < n; i++) {
        fib[i] = fib[i - 1] + fib[i - 2];
    }
    for (int x : fib) cout << x << " ";
    cout << endl;
    return 0;
}`,
        },
        {
            name: 'FizzBuzz',
            icon: '🎯',
            description: 'Classic FizzBuzz',
            code: `#include <iostream>
using namespace std;
int main() {
    for (int i = 1; i <= 15; i++) {
        if (i % 15 == 0) {
            cout << "FizzBuzz" << endl;
        } else if (i % 3 == 0) {
            cout << "Fizz" << endl;
        } else if (i % 5 == 0) {
            cout << "Buzz" << endl;
        } else {
            cout << i << endl;
        }
    }
    return 0;
}`,
        },
    ],
    c: [
        {
            name: 'Hello World',
            icon: '👋',
            description: 'printf basics',
            code: `#include <stdio.h>
int main() {
    printf("Hello, World!\\n");
    int x = 10, y = 20;
    printf("Sum: %d\\n", x + y);
    return 0;
}`,
        },
        {
            name: 'Bubble Sort',
            icon: '🫧',
            description: 'Watch the array swap step by step',
            code: `#include <stdio.h>
int main() {
    int arr[] = {64, 34, 25, 12, 22, 11, 90};
    int n = 7;
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                int t = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = t;
            }
        }
    }
    for (int i = 0; i < n; i++) printf("%d ", arr[i]);
    printf("\\n");
    return 0;
}`,
        },
        {
            name: 'Selection Sort',
            icon: '🎯',
            description: 'Find the minimum and swap',
            code: `#include <stdio.h>
int main() {
    int arr[] = {29, 10, 14, 37, 13};
    int n = 5;
    for (int i = 0; i < n - 1; i++) {
        int minIdx = i;
        for (int j = i + 1; j < n; j++) {
            if (arr[j] < arr[minIdx]) {
                minIdx = j;
            }
        }
        int t = arr[i];
        arr[i] = arr[minIdx];
        arr[minIdx] = t;
    }
    for (int i = 0; i < n; i++) printf("%d ", arr[i]);
    printf("\\n");
    return 0;
}`,
        },
        {
            name: 'Linear Search',
            icon: '🔍',
            description: 'Step through each element',
            code: `#include <stdio.h>
int main() {
    int arr[] = {7, 3, 11, 5, 19, 2, 8};
    int n = 7;
    int target = 19;
    int found = -1;
    for (int i = 0; i < n; i++) {
        if (arr[i] == target) {
            found = i;
            break;
        }
    }
    if (found >= 0) {
        printf("Found %d at index %d\\n", target, found);
    } else {
        printf("Not found\\n");
    }
    return 0;
}`,
        },
        {
            name: 'Binary Search',
            icon: '🪓',
            description: 'Halve the array each step',
            code: `#include <stdio.h>
int main() {
    int arr[] = {1, 3, 5, 7, 9, 11, 13, 15, 17, 19};
    int n = 10;
    int target = 13;
    int low = 0;
    int high = n - 1;
    int found = -1;
    while (low <= high) {
        int mid = (low + high) / 2;
        if (arr[mid] == target) {
            found = mid;
            break;
        } else if (arr[mid] < target) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    printf("Found at index: %d\\n", found);
    return 0;
}`,
        },
        {
            name: 'Reverse Array',
            icon: '↩️',
            description: 'Two-pointer reversal',
            code: `#include <stdio.h>
int main() {
    int arr[] = {1, 2, 3, 4, 5, 6, 7};
    int n = 7;
    int left = 0;
    int right = n - 1;
    while (left < right) {
        int t = arr[left];
        arr[left] = arr[right];
        arr[right] = t;
        left++;
        right--;
    }
    for (int i = 0; i < n; i++) printf("%d ", arr[i]);
    printf("\\n");
    return 0;
}`,
        },
        {
            name: 'Fibonacci',
            icon: '🌀',
            description: 'Iterative sequence',
            code: `#include <stdio.h>
int main() {
    int n = 10;
    int fib[10];
    fib[0] = 0;
    fib[1] = 1;
    for (int i = 2; i < n; i++) {
        fib[i] = fib[i - 1] + fib[i - 2];
    }
    for (int i = 0; i < n; i++) printf("%d ", fib[i]);
    printf("\\n");
    return 0;
}`,
        },
        {
            name: 'FizzBuzz',
            icon: '🎯',
            description: 'Classic FizzBuzz',
            code: `#include <stdio.h>
int main() {
    for (int i = 1; i <= 15; i++) {
        if (i % 15 == 0) {
            printf("FizzBuzz\\n");
        } else if (i % 3 == 0) {
            printf("Fizz\\n");
        } else if (i % 5 == 0) {
            printf("Buzz\\n");
        } else {
            printf("%d\\n", i);
        }
    }
    return 0;
}`,
        },
    ],
    go: [
        {
            name: 'Hello World',
            icon: '👋',
            description: 'fmt.Println basics',
            code: `package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
    x, y := 10, 20
    fmt.Println("Sum:", x+y)
}`,
        },
        {
            name: 'Bubble Sort',
            icon: '🫧',
            description: 'Watch the slice swap step by step',
            code: `package main

import "fmt"

func main() {
    arr := []int{64, 34, 25, 12, 22, 11, 90}
    n := len(arr)
    for i := 0; i < n-1; i++ {
        for j := 0; j < n-i-1; j++ {
            if arr[j] > arr[j+1] {
                arr[j], arr[j+1] = arr[j+1], arr[j]
            }
        }
    }
    fmt.Println("Sorted:", arr)
}`,
        },
        {
            name: 'Selection Sort',
            icon: '🎯',
            description: 'Find the minimum and swap',
            code: `package main

import "fmt"

func main() {
    arr := []int{29, 10, 14, 37, 13}
    n := len(arr)
    for i := 0; i < n-1; i++ {
        minIdx := i
        for j := i + 1; j < n; j++ {
            if arr[j] < arr[minIdx] {
                minIdx = j
            }
        }
        arr[i], arr[minIdx] = arr[minIdx], arr[i]
    }
    fmt.Println("Sorted:", arr)
}`,
        },
        {
            name: 'Linear Search',
            icon: '🔍',
            description: 'Step through each element',
            code: `package main

import "fmt"

func main() {
    arr := []int{7, 3, 11, 5, 19, 2, 8}
    target := 19
    found := -1
    for i := 0; i < len(arr); i++ {
        if arr[i] == target {
            found = i
            break
        }
    }
    if found >= 0 {
        fmt.Println("Found", target, "at index", found)
    } else {
        fmt.Println("Not found")
    }
}`,
        },
        {
            name: 'Binary Search',
            icon: '🪓',
            description: 'Halve the array each step',
            code: `package main

import "fmt"

func main() {
    arr := []int{1, 3, 5, 7, 9, 11, 13, 15, 17, 19}
    target := 13
    low := 0
    high := len(arr) - 1
    found := -1
    for low <= high {
        mid := (low + high) / 2
        if arr[mid] == target {
            found = mid
            break
        } else if arr[mid] < target {
            low = mid + 1
        } else {
            high = mid - 1
        }
    }
    fmt.Println("Found at index:", found)
}`,
        },
        {
            name: 'Reverse Slice',
            icon: '↩️',
            description: 'Two-pointer reversal',
            code: `package main

import "fmt"

func main() {
    arr := []int{1, 2, 3, 4, 5, 6, 7}
    left := 0
    right := len(arr) - 1
    for left < right {
        arr[left], arr[right] = arr[right], arr[left]
        left++
        right--
    }
    fmt.Println(arr)
}`,
        },
        {
            name: 'Fibonacci',
            icon: '🌀',
            description: 'Iterative sequence',
            code: `package main

import "fmt"

func main() {
    n := 10
    fib := make([]int, n)
    fib[0] = 0
    fib[1] = 1
    for i := 2; i < n; i++ {
        fib[i] = fib[i-1] + fib[i-2]
    }
    fmt.Println(fib)
}`,
        },
        {
            name: 'FizzBuzz',
            icon: '🎯',
            description: 'Classic FizzBuzz',
            code: `package main

import "fmt"

func main() {
    for i := 1; i <= 15; i++ {
        if i%15 == 0 {
            fmt.Println("FizzBuzz")
        } else if i%3 == 0 {
            fmt.Println("Fizz")
        } else if i%5 == 0 {
            fmt.Println("Buzz")
        } else {
            fmt.Println(i)
        }
    }
}`,
        },
    ],
    rust: [
        {
            name: 'Hello World',
            icon: '👋',
            description: 'println! basics',
            code: `fn main() {
    println!("Hello, World!");
    let x = 10;
    let y = 20;
    println!("Sum: {}", x + y);
}`,
        },
        {
            name: 'Bubble Sort',
            icon: '🫧',
            description: 'Watch the vec swap step by step',
            code: `fn main() {
    let mut arr = vec![64, 34, 25, 12, 22, 11, 90];
    let n = arr.len();
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
}`,
        },
        {
            name: 'Selection Sort',
            icon: '🎯',
            description: 'Find the minimum and swap',
            code: `fn main() {
    let mut arr = vec![29, 10, 14, 37, 13];
    let n = arr.len();
    for i in 0..n - 1 {
        let mut min_idx = i;
        for j in i + 1..n {
            if arr[j] < arr[min_idx] {
                min_idx = j;
            }
        }
        let temp = arr[i];
        arr[i] = arr[min_idx];
        arr[min_idx] = temp;
    }
    println!("Sorted: {:?}", arr);
}`,
        },
        {
            name: 'Linear Search',
            icon: '🔍',
            description: 'Step through each element',
            code: `fn main() {
    let arr = vec![7, 3, 11, 5, 19, 2, 8];
    let target = 19;
    let mut found: i32 = -1;
    for i in 0..arr.len() {
        if arr[i] == target {
            found = i as i32;
            break;
        }
    }
    if found >= 0 {
        println!("Found {} at index {}", target, found);
    } else {
        println!("Not found");
    }
}`,
        },
        {
            name: 'Binary Search',
            icon: '🪓',
            description: 'Halve the array each step',
            code: `fn main() {
    let arr = vec![1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
    let target = 13;
    let mut low: i32 = 0;
    let mut high: i32 = arr.len() as i32 - 1;
    let mut found: i32 = -1;
    while low <= high {
        let mid = (low + high) / 2;
        if arr[mid as usize] == target {
            found = mid;
            break;
        } else if arr[mid as usize] < target {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    println!("Found at index: {}", found);
}`,
        },
        {
            name: 'Reverse Vec',
            icon: '↩️',
            description: 'Two-pointer reversal',
            code: `fn main() {
    let mut arr = vec![1, 2, 3, 4, 5, 6, 7];
    let mut left = 0;
    let mut right = arr.len() - 1;
    while left < right {
        let temp = arr[left];
        arr[left] = arr[right];
        arr[right] = temp;
        left += 1;
        right -= 1;
    }
    println!("{:?}", arr);
}`,
        },
        {
            name: 'Fibonacci',
            icon: '🌀',
            description: 'Iterative sequence',
            code: `fn main() {
    let n = 10;
    let mut fib = vec![0; n];
    fib[0] = 0;
    fib[1] = 1;
    for i in 2..n {
        fib[i] = fib[i - 1] + fib[i - 2];
    }
    println!("{:?}", fib);
}`,
        },
        {
            name: 'FizzBuzz',
            icon: '🎯',
            description: 'Classic FizzBuzz',
            code: `fn main() {
    for i in 1..=15 {
        if i % 15 == 0 {
            println!("FizzBuzz");
        } else if i % 3 == 0 {
            println!("Fizz");
        } else if i % 5 == 0 {
            println!("Buzz");
        } else {
            println!("{}", i);
        }
    }
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
            description: 'Console.WriteLine basics',
            code: `using System;

class Program {
    static void Main() {
        Console.WriteLine("Hello, World!");
        int x = 10, y = 20;
        Console.WriteLine($"Sum: {x + y}");
    }
}`,
        },
        {
            name: 'Bubble Sort',
            icon: '🫧',
            description: 'Watch the array swap step by step',
            code: `using System;

class Program {
    static void Main() {
        int[] arr = {64, 34, 25, 12, 22, 11, 90};
        int n = arr.Length;
        for (int i = 0; i < n - 1; i++) {
            for (int j = 0; j < n - i - 1; j++) {
                if (arr[j] > arr[j + 1]) {
                    int temp = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = temp;
                }
            }
        }
        foreach (var x in arr) {
            Console.WriteLine(x);
        }
    }
}`,
        },
        {
            name: 'Selection Sort',
            icon: '🎯',
            description: 'Find the minimum and swap',
            code: `using System;

class Program {
    static void Main() {
        int[] arr = {29, 10, 14, 37, 13};
        int n = arr.Length;
        for (int i = 0; i < n - 1; i++) {
            int minIdx = i;
            for (int j = i + 1; j < n; j++) {
                if (arr[j] < arr[minIdx]) {
                    minIdx = j;
                }
            }
            int temp = arr[i];
            arr[i] = arr[minIdx];
            arr[minIdx] = temp;
        }
        foreach (var x in arr) {
            Console.WriteLine(x);
        }
    }
}`,
        },
        {
            name: 'Linear Search',
            icon: '🔍',
            description: 'Step through each element',
            code: `using System;

class Program {
    static void Main() {
        int[] arr = {7, 3, 11, 5, 19, 2, 8};
        int target = 19;
        int found = -1;
        for (int i = 0; i < arr.Length; i++) {
            if (arr[i] == target) {
                found = i;
                break;
            }
        }
        if (found >= 0) {
            Console.WriteLine($"Found {target} at index {found}");
        } else {
            Console.WriteLine("Not found");
        }
    }
}`,
        },
        {
            name: 'Binary Search',
            icon: '🪓',
            description: 'Halve the array each step',
            code: `using System;

class Program {
    static void Main() {
        int[] arr = {1, 3, 5, 7, 9, 11, 13, 15, 17, 19};
        int target = 13;
        int low = 0;
        int high = arr.Length - 1;
        int found = -1;
        while (low <= high) {
            int mid = (low + high) / 2;
            if (arr[mid] == target) {
                found = mid;
                break;
            } else if (arr[mid] < target) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        Console.WriteLine($"Found at index: {found}");
    }
}`,
        },
        {
            name: 'Reverse Array',
            icon: '↩️',
            description: 'Two-pointer reversal',
            code: `using System;

class Program {
    static void Main() {
        int[] arr = {1, 2, 3, 4, 5, 6, 7};
        int left = 0;
        int right = arr.Length - 1;
        while (left < right) {
            int temp = arr[left];
            arr[left] = arr[right];
            arr[right] = temp;
            left++;
            right--;
        }
        foreach (var x in arr) {
            Console.WriteLine(x);
        }
    }
}`,
        },
        {
            name: 'Fibonacci',
            icon: '🌀',
            description: 'Iterative sequence',
            code: `using System;

class Program {
    static void Main() {
        int n = 10;
        int[] fib = new int[n];
        fib[0] = 0;
        fib[1] = 1;
        for (int i = 2; i < n; i++) {
            fib[i] = fib[i - 1] + fib[i - 2];
        }
        foreach (var x in fib) {
            Console.WriteLine(x);
        }
    }
}`,
        },
        {
            name: 'FizzBuzz',
            icon: '🎯',
            description: 'Classic FizzBuzz',
            code: `using System;

class Program {
    static void Main() {
        for (int i = 1; i <= 15; i++) {
            if (i % 15 == 0) {
                Console.WriteLine("FizzBuzz");
            } else if (i % 3 == 0) {
                Console.WriteLine("Fizz");
            } else if (i % 5 == 0) {
                Console.WriteLine("Buzz");
            } else {
                Console.WriteLine(i);
            }
        }
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
