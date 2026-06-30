// Plain-English definitions for the parser jargon the docs use, surfaced as
// hover tooltips by <Term>. Keyed by a short slug; the visible text is the
// component's slot, so the same term can read naturally in different sentences.
export const glossary: Record<string, string> = {
  recognizer:
    "A parser that only answers yes/no — does the input fit the grammar? — without building a value or a tree.",
  nonterminal:
    "A named grammar rule (mixed-case in Grammark), defined by its productions. Contrast a terminal.",
  terminal:
    "A literal piece of input — a quoted spelling like '+', or a token class like NUMBER.",
  "token-class":
    "An ALL-CAPS lexer rule (e.g. NUMBER : /[0-9]+/) that matches a family of input text, not one fixed spelling.",
  "shift-reduce":
    "A conflict where the parser cannot tell whether to read another token (shift) or apply a completed rule (reduce).",
  "lalr-artifact":
    "A conflict that LALR(1)'s merged states invent but canonical LR(1) or IELR(1) resolve — fixable by a stronger table method, no grammar change.",
  lr1: "Left-to-right input, rightmost derivation, one token of lookahead — the parser class Grammark targets.",
  cst: "Concrete syntax tree: every token and rule the parser matched, brackets and operators included.",
  ast: "Abstract syntax tree: the trimmed tree your actions build, keeping only what downstream code needs.",
  "epsilon-free":
    "A grammar with no empty (nullable) productions. Grammark's desugaring keeps the generated core epsilon-free.",
};
