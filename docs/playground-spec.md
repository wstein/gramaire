# Product Specification: Grammark Lab (Playground)

## 1. Overview & Vision

Grammark Lab is a browser-native, live grammar laboratory designed to make grammar development as fast, visual, and precise as software development. Traditional parser generators force developers into slow edit-compile-test loops, leaving them blind to why a stream failed or why an ambiguity occurred. Grammark Lab eliminates this black box, providing a real-time, interactive environment.

By building on top of Grammark's unique Markdown-first Core, Grammark Lab isn't just an evaluator—it is a live documentation tool and diagnostic oracle. It runs 100% client-side, compiling the parser engine and evaluating test inputs with sub-millisecond feedback.

---

## 2. Competitive Analysis and Feature Gap

To build the best-in-class playground, we analyzed seven existing grammar workbenches. The table below scores their capabilities and reveals critical feature gaps:

| Feature Dimension | ANTLR Lab | Chevrotain | Nearley | LALRPOP | Railroad UI | Peggy JS | Flatbars Lab | **Grammark Lab** |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Purity of Target** | Server JVM | JS Only | JS Only | Rust IDE | EBNF Only | JS Only | Template VM | **Language Neutral** |
| **Compilation Latency** | High (Secs) | None (JS) | Low (MS) | N/A | None | None | None | **None (In-Browser)** |
| **Rich Parse-Tree / CST** | yes | Yes | yes | no | no | no | no | **Yes (Interactive)** |
| **Visual Token Maps** | yes | yes | no | no | no | no | yes | **Yes (Hover-Linked)** |
| **Grammar-Relative Diagnostics** | no | no | no | yes | no | no | yes | **Yes (Production-Linked)** |
| **Interactive State Walk** | no | no | no | no | no | no | no | **Yes (LALR State Trace)** |
| **Two-way Railroad Sync** | no | yes | no | no | yes | no | no | **Yes (Embedded/Sidecar)** |
| **Robust Share / Gist** | no | no | no | no | no | no | yes | **Yes (LZMA / Host)** |

### Key Competitor Weaknesses

*   **ANTLR Lab (http://lab.antlr.org/):** Heavy JVM-based backend. Compiles out-of-process on a unix box, inducing latency and privacy concerns. Visualizations are static, and error locations don't map naturally to live-cursor positions.
*   **Chevrotain Playground (https://chevrotain.io/playground/):** Bound exclusively to JavaScript. Writing grammars looks like writing boilerplate JS class methods rather than clear EBNF-like grammar rules.
*   **Nearley Playground (https://omrelli.ug/nearley-playground/):** Parses arbitrary Earley streams but diagnostics are sparse. When parsing fails, users get dumped with raw stack traces that do not explain the expected token or matching state.
*   **LALRPOP IntelliJ (https://plugins.jetbrains.com/plugin/15229-lalrpop):** Excellent Rust diagnostics but locked completely inside an IDE. Zero live evaluation capabilities for test payloads without full cargo compilation.
*   **Railroad UI (https://www.bottlecaps.de/rr/ui):** Elegant formatting and parsing of W3C EBNF, but only generates views—it cannot execute or test a grammar against string payloads.
*   **Peggy JS (https://peggyjs.org/online.html):** Extremely simple, but offers zero visualization of State machines or internal FIRST/FOLLOW tables.
*   **Flatbars Lab (https://wstein.github.io/flatbars/):** Extremely clean Monaco-based split editor with share links and schema diagnostics, but is for template rendering (JSONATA/YAML/HBS), not general context-free parsing.

---

## 3. Core Architectural Strategy

We reject out-of-process compilation—it is slow, unsecure, and costly. Grammark Lab runs entirely in the browser using the compiled Core.

```mermaid
flowchart TD
    subgraph UI Thread (Main)
        Editor[Monaco MD Editor] <--> VFS[Memory VFS]
        InputEditor[Monaco Test Input] <--> RunCtrl[Controller]
        RunCtrl <--> ASTView[CST Tree Explorer & Diagnostics]
        RunCtrl <--> DiagramView[Interactive Railroad SVG]
    end
    subgraph Web Worker Thread
        WorkerListener[Message Listener] <--> Kernel[PureScript Core Parser]
        Kernel --> LexER[Lexer / Spanned Tokenizer]
        Kernel --> Generator[LR Table Builder]
        Kernel --> Interpreter[Table Parser Engine]
    end
    VFS <-->|PostMessage| WorkerListener
    RunCtrl <-->|PostMessage| WorkerListener
```

### In-Browser Compilation & Virtual File System (VFS)
The playground maps all virtual workspace files inside a virtual memory filesystem (`Record String String`) inside the PureScript Core. 100% of the PureScript compiler is compiled to ES6 JavaScript and runs in a separate **Web Worker** thread to prevent locking the UI during parser building.

---

## 4. Feature Specification

### 4.1. Dual Monaco Editor Workspace
*   **Left Pane (The Source):** Real-time editor with syntax highlighting for Markdown containing fenced `lr` grammar blocks. Implements GFM inline checks.
*   **Right Pane (The Input):** Editor for raw input payloads that the user wants to parsing against the custom grammar.
*   **Diagnostic Gutter:** Highlights both grammar errors (using Grammark's conflict diagnostics) and parser input errors (such as unexpected tokens at line/col) in the matching editors.

### 4.2. Visual Token-to-Production Mapping & Hover Inspect
*   In the CST Tree view, hovering over any internal rule node highlights the corresponding production in the source grammar editor.
*   Hovering over any terminal leaf in the AST view highlights the character range or substring in the input payload editor. This is enabled by the spanned tokenizer introduced in [src/Grammark/Lexer.purs](src/Grammark/Lexer.purs).
*   The initial public lab implementation now supports a live editor-and-evaluator loop with inline diagnostics and an accept/reject result surface for quick iteration.

### 4.3. Interactive State Walk and "Why Did This Fail?" Diagnostic Gutter
*   Upon compilation failure (e.g. Shift/Reduce conflict), the playground does not print "State 45 has conflict". Instead, it walks the core's conflict pipeline ([src/Grammark/Diagnostics.purs](src/Grammark/Diagnostics.purs)) and highlights the exact competing tokens directly inside the Markdown `lr` block.
*   Upon parsing failure, the engine displays a list of "Expected Terminals" based on the LR automaton's state at the failure head, allowing one-click insertion of valid next tokens into the input stream.

### 4.4. Live-Rendering Railroad Diagrams & FIRST/FOLLOW Tab
*   As the user types, the UI parses alternatives and renders live SVGs below each H2 block.
*   An operations drawer displays the auto-generated **FIRST/FOLLOW Table** in real-time, matching GFM format.

### 4.5. Universal Export & Sharing
*   **EBNF / IR Download:** Direct export of the compiled [spec/ir-schema.json](spec/ir-schema.json) structure, or W3C-style clean EBNF through the modular [src/Grammark/Backend/Ebnf.purs](src/Grammark/Backend/Ebnf.purs) backend.
*   **Url Serialization:** Compresses the full workspace (grammar, input string, and current layout settings) into a URL query parameter using **LZMA compression** to preserve ultra-dense sharing links under the 2KB browser URL limits.

---

## 5. Technical Implementation & Live Compilation Flow

1.  **Change Detection:** The main thread detects user changes in the Markdown editor.
2.  **Web Worker Message:** Main thread posts a `{ type: "COMPILE", source: markdownContent }` message to the Web Worker.
3.  **Core Parsing:** Inside the worker, `Grammark.Lr.parse` reads the grammar, lowers it through `Grammark.Desugar` to compile surface sugar (`+`, `*`, `?`, parameters) to the core epsilon-free notation.
4.  **Table Generation:** The worker builds LR tables via canonical LR(1) or IELR(1) split calculations.
5.  **Output Serializer:** If successful, the worker runs the tokenizer on the user's Input. If parsing succeeds, it converts the CST to a JSON payload conforming to the CST schema.
6.  **UI Update:** The worker posts back the calculated CST, diagnostics, and EBNF representation. The main thread renders the interactive CST tree and draws railroad SVG blocks.
