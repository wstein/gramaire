# Grammark Language Specification (v0.1)

This document defines the formal syntax, semantics, desugaring rules, and compilation invariants of the Grammark language and its intermediate representation, `grammark-ir`.

---

## 1. Document Structure & Grammar Envelope

A Grammark grammar is hosted inside a canonical GitHub-Flavored Markdown (GFM) document. The parsing compiler ignores all prose, headings, list markers, and external diagrams. The source grammar is extracted exclusively by scanning ATX H2 headings (`##`) and fenced code blocks whose info strings begin with `lr`.

### 1.1 Heading Mapping
*   **The Grammar Name:** Taken from the first H1 heading (`# <GrammarName>`). There must be exactly one H1 heading.
*   **Nonterminal Rules:** Every non-reserved H2 heading (`## <Nonterminal>`) defines a nonterminal rule.
*   **Reserved H2 Headings:**
    *   `## Precedence` — hosts the operator precedence block.
    *   `## Error messages` — hosts the visual grammar error index.
    *   `## Generated tables` — hosts the compiled FIRST/FOLLOW pipe tables.

Any H3 (`###`) and deeper heading layer is treated as presentational grouping and is completely skipped by the structure analyzer.

---

## 2. Grammar Lexical Grammar

Within an `lr` code fence, the Lexer processes a series of tokens mapping to identifiers, terminal symbols, precedence modifiers, and semantic actions.

The following lexer symbols are defined in the lexical core:

*   **`IDENT`:** Pattern `[a-zA-Z_][a-zA-Z0-9_-]*`. Matches both rule nonterminals (mixed-case) and terminal category markers (all-uppercase).
*   **`LITERAL`:** String characters enclosed inside backticks (e.g. `` `+` ``). Declares literal terminal symbols. Escaping backticks uses standard Markdown backslash notation.
*   **`COLON`:** The `:` punctuation symbol. Separates rule heads from production alternatives.
*   **`VBAR`:** The `|` separator. Separates multiple production alternatives.
*   **`ACTION`:** Matches a semantic action block enclosed inside `{%` and `%}` markers. The body is parsed as raw host-language lambda text.
*   **`PREC_DECL`:** Precedence operators `%left`, `%right`, and `%nonassoc` inside the precedence scope.
*   **`LABEL`:** Written as `# Name`. Attaches a visitor method label to a specific alternative production.

---

## 3. Desugaring Compilations

Before building LR parsing tables, Grammark compiles the surface grammar containing optional, list, macro, or inline qualifiers into a pure, epsilon-free context-free grammar representation. The desugaring module is implemented in [src/Grammark/Desugar.purs](src/Grammark/Desugar.purs).

### 3.1 Repetition compilations (`+` and `*`)

#### One-or-More repetition (`A+`)
For any symbol reference `A+` inside a production, Grammark spawns a fresh left-recursive nonterminal `A_list` and maps:

$$\begin{aligned}
A_{\text{list}} &\to A_{\text{list}} \ A \\
&\mid A
\end{aligned}$$

The generated actions automatically accumulate elements into an array.

#### Zero-or-More repetition (`A*`)
For any symbol reference `A*`, Grammark compiles `A*` to `A_list?` (an optional list).

### 3.2 Optionals (`?`)

For any optional reference `A?` occurring inside a production rule alternative, Grammark performs **use-site enumeration**. This maintains epsilon-freeness in the parsing core.

Given the rule:
```lr
Expr : pre A? post {% f %}
```

Grammark compiles this alternative into two concrete productions:
$$\begin{aligned}
\text{Expr} &\to \text{pre} \ A \ \text{post} \quad &&[\text{with action wrapper applying } \text{Just}(a)] \\
&\to \text{pre} \ \text{post} \quad &&[\text{with action wrapper applying } \text{Nothing}]
\end{aligned}$$

This enumeration propagates exponentially for $k$ optional attributes ($2^k$), ensuring the underlying state machine is 100% free of nullable epsilon-transition loops.

### 3.3 Named Fields
To support structured AST visitors without positional matching, symbols can be annotated with names:

```lr
Expr : left:Expr `+` right:Term
```

This populates the `rhs[].field` property in the intermediate model, automatically generating CST method accessors (`left()`, `right()`) for target backends.

---

## 4. The Intermediate Representation Contract

The compiler represents the analyzed grammar and its parsing engine inside a versioned JSON schema described in [spec/ir-schema.json](spec/ir-schema.json). The browser-based lab consumes the same grammar structure to power live evaluation and diagnostics, keeping the docs site aligned with the runtime implementation.

```json
{
  "irVersion": 0,
  "grammar": {
    "name": "JSON",
    "start": "Json",
    "rules": [
      {
        "id": 0,
        "lhs": "Expr",
        "rhs": [
          {"symbol": "Expr", "id": 0, "kind": "nonterminal", "field": "left"},
          {"symbol": "+", "id": 2, "kind": "terminal"},
          {"symbol": "Term", "id": 1, "kind": "nonterminal", "field": "right"}
        ],
        "label": "Add",
        "actions": {
          "purescript": "\\l _ r -> Add l r"
        }
      }
    ]
  },
  "tables": {
    "states": 42,
    "action": [
      {
        "state": 0,
        "terminals": [
          {"id": 4, "action": {"kind": "shift", "state": 5}}
        ],
        "eof": {"kind": "error"}
      }
    ],
    "goto": [
      {
        "state": 0,
        "nonterminals": [
          {"id": 0, "state": 1}
        ]
      }
    ]
  }
}
```

Every backend reads only this IR file. This isolates target generator engines from frontend details like GFM document processing or line-wrapping constraints.

---

## 5. Incremental & LSP Conformance Rules

The playground and IDE extensions must follow the requirements defined in [spec/incremental-spec.md](spec/incremental-spec.md):

1.  **Fidelity (R1):** The CST must completely reconstruct the input string, including comments and whitespace.
2.  **Equivalence (R13):** Applying a span edit through the incremental delta method `edit(tree, change)` must produce a tree structurally identical to a full-reparse `parse(new_string)`.
3.  **Panic Resync (C3):** The recovery tables must implement panic-mode recovery, utilizing FOLLOW sets and `recovery.syncTokens` to isolate parsing errors to specific brackets or statements.
