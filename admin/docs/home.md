# Lorem Ipsum Markdown Showcase

---

## Introduction

This document serves as a comprehensive example of **Markdown's various formatting possibilities**, using the classic *Lorem Ipsum* text as its content. From basic text styling to lists, code blocks, and tables, you'll find a demonstration of common Markdown features here.

---

## Basic Text Formatting

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

* This text is **bold**.
* This text is *italic*.
* This text is ***bold and italic***.
* This text is ~~struck through~~.
* You can also use `backticks` for `inline code`.

---

## Headers

Markdown supports up to six levels of headers.

# Header 1
## Header 2
### Header 3
#### Header 4
##### Header 5
###### Header 6

---

## Lists

### Unordered List

* Lorem ipsum dolor sit amet.
    * Consectetur adipiscing elit.
        * Sed do eiusmod tempor.
* Incididunt ut labore et dolore magna.
* Aliqua ut enim ad minim veniam.

### Ordered List

1.  Quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
2.  Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
3.  Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

---

## Blockquotes

> "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."
>
> — John Doe, *Lorem Ipsum Anthology*

---

## Code Blocks

```python
def fibonacci(n):
    a, b = 0, 1
    for i in range(n):
        print(a, end=" ")
        a, b = b, a + b

fibonacci(10)