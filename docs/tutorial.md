# Grammark Tutorial

Welcome to Grammark! This tutorial will guide you from writing your first syntax definition to building a fully certified, compile-ready, and interactive grammar that renders beautifully on GitHub.

Grammark's core philosophy is **"Grammars that render themselves."** Instead of maintaining a grammar file in one proprietary syntax and a documentation page in another, you write standard Markdown. Your grammar _is_ your documentation, and your documentation _is_ your grammar.

---

## 1. What is a `.gram.md` File?

A `.gram.md` file is a valid Markdown document that follows a specific **structure** (defined in [docs/fmt-output-contract.md](docs/fmt-output-contract.md)). All production rules live in fenced code blocks marked with the `lr` info string. Everything outside these code blocks is standard prose.

A standard grammar file uses this clean hierarchy:
1.  **H1 Heading (`#`):** The name of your grammar.
2.  **H2 Headings (`##`):** One per nonterminal symbol, plus special sections like `Precedence`, `Error messages`, and `Generated tables`.
3.  **Code Fences (` ```lr `):** Containing production rules or declarations.
4.  **Prose and Images:** To explain and visualize your grammar.

---

## 2. Your First Grammar: A Simple Calculator

Let's build a simple arithmetic calculator that supports numbers, addition, and subtraction.

Create a file named [examples/calc.gram.md](examples/calc.gram.md) and start with the title:

```markdown
# Calculator Grammar

This is the grammar definition for a simple arithmetic calculator.
```

### Writing Your First Nonterminal

In Grammark, rules are grouped under H2 headings naming the nonterminal symbol. Let's create an `Expr` (Expression) rule:

```markdown
## Expr

An expression is either a sum/difference of smaller expressions or a single number.

```lr
Expr
  : Expr `+` Term
  | Expr `-` Term
  | Term
```
```

Let's dissect this:
*   `Expr` on the left names the nonterminal.
*   `: ` starts the alternatives.
*   `| ` separates each alternative production.
*   Backtick expressions like `` `+` `` represent **literal terminals**.
*   Symbols starting with an ALL-CAPS word (like `NUM`) or mixed-case names (like `Term`) are terminal categories and nonterminals respectively.

Let's define the `Term` nonterminal:

```markdown
## Term

A term is a base factor—in our simple calculator, just a number literal.

```lr
Term
  : NUM
```
```

Here, `NUM` represents a token category. In Grammark, we define token rules either in our lexer profile or match them as primitive classifications.

---

## 3. Working with Expressive Surface Sugar

Writing pure, epsilon-free, left-recursive EBNF structures can be wordy. Grammark solves this by providing **surface sugar** that compiles down to clean core rules.

All sugar compile-rules are defined in [src/Grammark/Desugar.purs](src/Grammark/Desugar.purs) and run automatically.

### Repetition (`+` and `*`)

Instead of manually crafting left-recursive lists for repetition, you can use `+` (one or more) or `*` (zero or more):

```lr
StatementList
  : Stmt+
```

During compilation, Grammark automatically desugars `Stmt+` to a fresh nonterminal and left-recursive productions behind the scenes, keeping the core parser generator epsilon-free.

### Optional Elements (`?`)

For elements that are optional, use `?`:

```lr
FunctionCall
  : IDENT `(` ArgumentList? `)`
```

### Macro Functions

Want to define comma-separated or symbol-separated lists? You can use parameter macros:

```lr
Block
  : `{` Sep<Stmt, `;`> `}`
```

This expands to a clean, desugared sequence, dramatically reducing boilerplate in language design.

---

## 4. Attaching Semantic Actions

A parser that only checks syntax is only half-useful; you usually want to build a runtime value or an Abstract Syntax Tree (AST). In Grammark, you do this by enclosing action bodies between `{%` and `%}`:

```lr
Expr
  : Expr `+` Term   {% \left _ right -> Add left right %}
  | Expr `-` Term   {% \left _ right -> Sub left right %}
  | Term            {% \t -> t %}
```

### Action Rules
*   Semantic actions are lambda functions written in the host language.
*   The default action language is **PureScript** (matching the core compiler).
*   Actions are positional: the list of parameters corresponds to the elements of your production. In `Expr '+' Term`, we receive 3 parameters: the left expression value, the matching `+` token, and the right term value. We can discard the operator using `_`.

### Multi-Language Action Profiles

If you compile your grammar into multiple host targets (e.g., Typescript, Rust), you can language-tag your actions:

```lr
Expr
  : Expr `+` Term   {% purescript \l _ r -> Add l r %}
                    {% rust       |l, _, r| Expr::Add(Box::new(l), Box::new(r)) %}
```

Each backend parses only the action matching its language profile and discards the rest.

---

## 5. Adding Precedence and Resolving Conflicts

When you have recursive operators like `+` and `*`, your grammar becomes ambiguous. In traditional tools, this causes Shift/Reduce conflicts. Grammark lets you declare operator precedence within a dedicated section:

```markdown
## Precedence

We declare classical algebraic operator precedence. Multiplication and division bind tighter than addition and subtraction.

```lr precedence
%left `+` `-`
%left `*` `/`
```
```

This specifies that `*` and `/` resolve conflicts by shifting, while `+` and `-` reduce—resolving classic ambiguity mathematically.

---

## 6. Verifying Your Grammar via the CLI

The browser-based Grammark Lab now gives you a second, immediate feedback loop: edit a grammar, paste sample input, and evaluate it directly in the browser without leaving the docs site.

Our grammar is ready! To verify that it satisfies structure, formatting, layout, and doesn't contain grammar conflicts, run the check tool:

```sh
# Verify structure, formatting, and lack of shift-reduce conflicts
node bootstrap/grammark-check.ts examples/calc.gram.md
```

If it succeeds, it writes nothing and exits with a green check status. If your formatting or railroad diagrams drift, it will display targeted diagnostics and tell you what to fix.

### Auto-Formatting and Generating Diagrams

To automatically format your file to satisfy the [docs/fmt-output-contract.md](docs/fmt-output-contract.md) and build sidecar railroad diagrams, run the formatter:

```sh
# Writes sidecar railroad SVGs into examples/diagrams/
node bootstrap/grammark-check.ts fmt examples/calc.gram.md

# ...or embed them directly as native mermaid diagrams inside the Markdown file
node bootstrap/grammark-check.ts fmt --diagrams=mermaid examples/calc.gram.md
```

You are now ready to design self-rendering languages with Grammark!
