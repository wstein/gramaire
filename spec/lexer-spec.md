# Lexer specification — `lr tokens`

Status: **draft**, tracks `irVersion: 0`. Defines how a `.gram.md` grammar
specifies its own lexis, so a grammar is self-contained and every backend can
emit a _working_ parser (lexer + tables) from the IR alone. Keywords MUST,
SHOULD, MAY per RFC 2119. Amends the
[fmt output contract](../docs/fmt-output-contract.md), the
[IR schema](ir-schema.json), and interlocks with
[incremental-spec](incremental-spec.md) (extras) and
[line-continuation](line-continuation.md) (the `NL` case).

The open questions of an earlier draft are resolved here, recorded as ADRs **D32**
(capture groups) and **D33** (the `%external` interface) in the
[implementation plan](../docs/multi-backend-implementation-plan.md).

## 1. Why this exists

A grammar's productions are in the file but its lexis was not: `json.gram.md`
names `STRING` and `NUMBER` but never says what they match, so a hand-written
scanner is required. That breaks three things at once — grammars are not
self-contained, the "tables-only" backend and generic interpreter can't produce
a working parser from the IR, and `Grammark.Lexer` sits _outside_ the self-host
loop. Defining the lexer in the grammar fixes all three.

## 2. The `lr tokens` block

Lexis is declared in a fenced block whose info string is `lr tokens`. Each line
defines one **named token class**:

```text
lr tokens
NAME : <definition> [ modifiers ]
```

- `NAME` is an ALL-CAPS token class (`[A-Z][A-Z0-9_]*`), matching the class names
  already used in productions.
- `<definition>` is either a **string literal** `"…"` (an exact match) or a
  **regular expression** `/…/` (§3).
- `modifiers` are zero or more of `%skip`, `%prec N`, `%external(pass)` (§6).

A grammar MUST place all its named classes here; an ALL-CAPS symbol used in a
production but absent from `lr tokens` is an error ("token class `X` used but
never defined") unless the block is in `%external` mode (§6).

Like `lr precedence` and `lr errors`, the `lr tokens` block is a hand-parsed
sidecar notation, not itself an `lr` grammar.

## 3. The regular sublanguage

Token patterns MUST be **regular** — compilable to a DFA — so scanning is
linear-time, maximal-munch, and free of catastrophic backtracking (ReDoS). The
permitted constructs:

- literal characters (metacharacters escaped: `\. \/ \[ \] \( \) \{ \} \* \+ \?
  \| \^ \$ \\`, plus `\n \r \t \uXXXX`);
- character classes `[...]`, ranges `a-z`, negation `[^...]`;
- `.` — any character except a line terminator;
- quantifiers `*`, `+`, `?`, and bounded `{n}`, `{n,}`, `{n,m}`;
- grouping: a **capturing** group `( … )` (§5, payload) and a **non-capturing**
  group `(?: … )` (structure only);
- alternation `|`.

The following are **forbidden** (non-regular or unsafe), and a grammar using them
MUST be rejected at build time:

- backreferences (`\1`);
- lookahead / lookbehind and the other assertions (`(?=)`, `(?!)`, `(?<=)`,
  `(?<!)`), named groups (`(?<name>)`), conditionals — every `(?…)` form except
  the non-capturing `(?:…)`;
- non-greedy quantifiers (`*?`, `+?`) — unneeded; maximal munch plus delimiter
  patterns cover the cases (a `{% … %}` action is the regular
  `/\{%(?:[^%]|%[^}])*%\}/`, the same shape as a C block comment);
- anchors `^` `$` (matching is implicitly anchored at the scan cursor).

This restriction is a **security boundary**, stated the same way action payloads
are: a grammar from a registry MUST NOT be able to make a backend's scanner hang.
Because every pattern is DFA-compilable, pathological backtracking is
unrepresentable. A capturing group adds **no power** (it marks a span, it does
not match differently), so it does not weaken this guarantee.

## 4. Token kinds and the implicit alphabet

The effective token set a grammar lexes is the union of:

1. **Named classes** — defined in `lr tokens` (§2).
2. **Implicit literals** — every terminal literal that appears in a production
   (`` `{` ``, `` `,` ``, `` `true` ``, and in `lr` itself `` `:` `` / `` `|` ``)
   is a token defined by its exact spelling. These need **no** `lr tokens` entry;
   the productions define them. A literal may be written in any of three
   interchangeable delimiters — `` `x` ``, `'x'`, or `"x"` — all identical
   (ADR D34); the author picks whichever needs no escaping (`'"'`, `"'"`,
   `` `'` ``). The chosen delimiter is escaped with a backslash inside the
   literal (`'\''`, `"\""`); backticks take none. The lexer emits the whole
   quoted lexeme; the consumer unquotes and unescapes to the spelling.

All of these are merged into **one** scanner DFA. A grammar therefore never needs
to repeat its punctuation/keyword literals in `lr tokens`; it declares only the
open-ended classes.

## 5. Matching semantics

- **M1 (maximal munch).** At each position the scanner takes the **longest** match
  among all tokens.
- **M2 (priority on ties).** When two tokens match the same length, priority
  decides, highest first: implicit literals and `"…"` string-literal classes, then
  `/regex/` classes in **declaration order** (earlier wins). An explicit `%prec N`
  (higher N = higher priority) overrides the default order.
- **M3 (keyword reservation).** Because implicit literals outrank classes (M2), a
  backtick keyword beats an overlapping class: with `IDENT : /[A-Za-z_]\w*/` and a
  production using `` `true` ``, the input `true` lexes as the keyword, while
  `trueish` lexes as one `IDENT` (M1). This is standard keyword reservation and
  needs no extra declaration.
- **M4 (no match).** If no token matches at a position, the scanner emits a
  lexical-error token spanning the offending character and resynchronizes at the
  next position (so editor/recovery use never aborts; cf. incremental-spec §4). A
  strict consumer (the CLI) treats any error token as a rejection.
- **M5 (capture = emitted text).** A pattern MAY contain **at most one** capturing
  group `( … )`; two is a build error. When present, the token's emitted **text**
  is the captured span; when absent, it is the whole match. In both cases the
  token's **span** is the whole match (for source fidelity). This is how the
  generated lexer reproduces the bootstrap `Grammark.Lexer`'s payload extraction:
  `ACTION : /\{%((?:[^%]|%[^}])*)%\}/` emits the body; `NL :
  /(\r?\n)(?:[ \t]*\r?\n)*/` emits a single `\n`. `TERM_LIT` (ADR D34) is the one
  exception — its three-delimiter alternation cannot carry a per-branch capture
  (≤1 capture, D32), so it emits the whole quoted lexeme and the consumer
  unquotes. Trimming an action body's surrounding whitespace is likewise the
  **consumer's** concern (codegen),
  not the lexer's.

## 6. Modifiers, extras, and the external hook

- **`%skip`** — the token is matched but is **not** a grammar symbol: the parser
  skips it. Skip tokens are exactly the grammar's **extras** — they populate the IR
  `extras` field and are preserved in the CST as leading trivia (incremental-spec
  §3). Whitespace and comments are `%skip`. `%skip` is the **only** extras
  mechanism for an in-file lexer; a block-level `%extras` list is reserved for
  naming externally-defined tokens (`%external` mode), where there is no in-file
  pattern to carry `%skip`.
- **`%prec N`** — explicit tie-break priority (§5, M2).
- **`%external(pass)`** — after the regular scan, a named, host-supplied **post-lex
  pass** may reclassify or transform the token stream. It is the escape hatch for
  the genuinely non-regular fraction of lexing (indentation/offside, semicolon
  insertion, the `lr` continuation keep/drop). **Interface (D33):** a pass is a
  pure `Array Token -> Array Token`, registered host-side by name, run after the
  scan; it is **scalar-only** (it cannot be vectorized; cf. D31). It does **not**
  do payload extraction — that is capture's job (M5) — so the canonical `NL` pass
  decides only which `NL`s to keep or drop (line-continuation §3), while capture
  already gave each its `\n` text.
- **Block-level `%external`** — the _entire_ scanner is supplied out of band; the
  block then lists class names with **no** patterns, and the grammar declares it
  brings its own lexer (today's behaviour, preserved for fully context-sensitive
  languages). Default mode is in-file regular lexing.

## 7. IR additions

To carry lexis, the IR gains a top-level `lexer` object (lexer-spec §7,
implemented in `Grammark.IR`):

```text
"lexer": {
  "mode": "regular" | "external",
  "order": [ terminalId… ],        // declaration order, resolves M2 ties
  "classes": [
    { "terminal": id, "pattern": { "regex": "…" } | { "literal": "…" },
      "skip": bool?, "prec": int? }
  ]
}
```

The lexis lives in this one object keyed by terminal id, rather than on each
`terminal`, to keep `IRTerminal` unchanged. `%skip` classes also populate
`grammar.extras`. Token classes a grammar never uses in a production (the `%skip`
ones) get fresh appended terminal ids. Backends compile the DFA from `pattern`s
(small, deterministic) rather than the IR shipping a serialized DFA; a backend MAY
cache one. Implicit literals are already in the IR as `kind: "literal"` terminals.

The scanner **strategy** is a backend concern (ADR D31): scalar DFA or SIMD
structural classification, behind the maximal-munch token contract. The IR
describes tokens, never how to scan them; any fast lexer must reproduce the
reference token stream byte-for-byte.

## 8. Self-host

`grammar/lr.gram.md` carries its own `lr tokens` block (§10), and the scanner
built from it is the **production** lexer for `lr` grammar source: `Grammark.Lr`
scans with `lrScanItems` (that block plus the implicit `` `:` `` / `` `|` ``
literals), trimming each `ACTION` body in the consumer (M5). `Grammark.Lexer` is
now iteration-0 **bootstrap** — kept only as the self-host oracle's reference.

The oracle (`Test.LexerSelfHost`) proves the generated scanner reproduces that
bootstrap lexer **token-for-token** — terminal _and_ text, thanks to capture
(M5) — not just on a snippet but across the whole of `grammar/lr.gram.md`; a
second guard checks the bootstrapped `lrTokensSource` still parses to the same
classes as the file's block. Because the parse path now scans with the generated
lexer, the existing parser self-host (`parse(lr.gram.md) == bootstrapGrammar`)
and the whole grammar corpus are themselves an end-to-end check on it.

## 9. fmt and structure

- A grammar's lexis lives in a single reserved `## Tokens` H2 section holding the
  `lr tokens` block. It SHOULD appear **before the first nonterminal section**
  (alphabet before grammar); the structure gate treats `Tokens` as a reserved
  section like `Precedence` (fmt-output-contract amendment).
- fmt MUST align the `:` column within the block and preserve declaration order
  (it is significant — M2). The `*.gram.lock` hashes the normalized token
  definitions so a pattern change is drift-visible.

## 10. Worked example — `lr.gram.md`

The `lr` notation, defining its own tokens, with capture groups (M5) for the
payload-bearing classes and `ATTR` ordered before `IDENT` / `LABEL` so `#[name]`
out-matches a `# Name` label. `NL` is significant (the continuation pass refines
its keep/drop via `%external`, while capture gives it a `\n` text); `WS` is
skipped (extras); operator tokens use the string-literal form; `` `:` `` and
`` `|` `` stay implicit literals from the productions.

```text
lr tokens
WS       : /[ \t]+/                       %skip
NL       : /(\r?\n)(?:[ \t]*\r?\n)*/      %external(layout)
ATTR     : /#\[([A-Za-z_][A-Za-z0-9_]*)\]/
IDENT    : /[A-Za-z_][A-Za-z0-9_]*/
TERM_LIT : /`[^`]+`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/
ACTION   : /\{%((?:[^%]|%[^}])*)%\}/
LABEL    : /#[ \t]*([A-Za-z_][A-Za-z0-9_]*)/
PLUS     : "+"
STAR     : "*"
QUESTION : "?"
LANGLE   : "<"
RANGLE   : ">"
COMMA    : ","
```

## 11. Worked example — `json.gram.md`

Standard JSON: two open-ended classes plus skipped whitespace; the structural
punctuation and the `true`/`false`/`null` keywords are implicit literals from the
productions, so they are not repeated here. `STRING` and `NUMBER` carry the whole
match as their text (no capture), and use non-capturing groups for structure.

```text
lr tokens
STRING : /"(?:[^"\\]|\\.)*"/
NUMBER : /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+)?/
WS     : /[ \t\r\n]+/    %skip
```

All first characters are disjoint (`"` for STRING, a digit or `-` for NUMBER,
letters for the keywords, punctuation for the structural literals, whitespace for
`WS`), so the merged DFA is unambiguous under maximal munch with no priority
tie-breaks needed.

## 12. Conformance and tests

- **L1 (regular only).** A pattern using a forbidden construct (§3) is rejected
  with a clear message.
- **L2 (munch + keywords).** `trueish` → one `IDENT`; `true` → the keyword
  (M1/M3); longest-match and priority cases from a token-level corpus.
- **L3 (extras populate the IR).** `%skip` tokens appear in `grammar.extras` and
  as CST trivia (incremental-spec §3).
- **L4 (self-host lexer).** The generated `lr` lexer reproduces the bootstrap
  lexer's token stream on `grammar/lr.gram.md` (§8) — terminals now, text once
  capture lands.
- **L5 (json self-contained).** `json.gram.md` plus its `lr tokens` block parses a
  JSON corpus with no hand-written scanner.

## 13. Resolved questions

1. **Unicode classes** — **ASCII for v0.** The regex parser reserves `\p{…}`
   syntactically and rejects it ("Unicode classes are not yet supported") rather
   than mis-parsing, so grammars stay forward-compatible. Full `\p{L}` / `\p{N}`
   is a later, opt-in addition (it needs property tables; still a DFA, so no
   ReDoS).
2. **Token fragments** — **deferred.** Patterns are short enough flat for now; a
   non-emitting `%fragment NAME : /…/` for reuse (a shared `DIGIT`) is revisited
   when a real grammar feels the pain.
3. **Per-token vs block extras** — `%skip` is the sole in-file mechanism; a
   block-level `%extras` list is reserved for `%external` mode only (§6).
4. **`%external` contract** — pinned in §6 (D33): a scalar, host-registered
   `Array Token -> Array Token` pass run after the scan; line-continuation is its
   canonical instance. Capture (M5), not `%external`, owns token text.
