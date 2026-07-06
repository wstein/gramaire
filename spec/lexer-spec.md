# Lexer specification — the Tokens-role `gramaire` fence

Status: **draft**, tracks `irVersion: 0`. Defines how a `.gram.md` grammar
specifies its own lexis, so a grammar is self-contained and every backend can
emit a _working_ parser (lexer + tables) from the IR alone. Keywords MUST,
SHOULD, MAY per RFC 2119. Amends the
[fmt output contract](../docs/fmt-output-contract.md), the
[IR schema](ir-schema.json), and interlocks with
[incremental-spec](incremental-spec.md) (extras) and
[line-continuation](line-continuation.md) (the `NL` case).

The open questions of an earlier draft are resolved here, recorded as ADRs **D32**
(capture groups) and **D33** (the `-> pass` interface) in the
[implementation plan](../docs/multi-backend-implementation-plan.md).

## 1. Why this exists

A grammar's productions are in the file but its lexis was not: `json.gram.md`
names `STRING` and `NUMBER` but never says what they match, so a hand-written
scanner is required. That breaks three things at once — grammars are not
self-contained, the "tables-only" backend and generic interpreter can't produce
a working parser from the IR, and `Gramaire.Lexer` sits _outside_ the self-host
loop. Defining the lexer in the grammar fixes all three.

## 2. The Tokens-role `gramaire` fence

Lexis is declared in a bare ` ```gramaire ` fence — the same, only fence tag the
whole notation has — whose role is inferred from its own content shape ("case
is law", grammar-format spec §1): a fence classifies as **Tokens** when every
one of its non-blank lines defines a named token class:

```text
NAME : <definition> [ modifiers ]
```

- `NAME` is an ALL-CAPS token class (`[A-Z][A-Z0-9_]*`), matching the class names
  already used in productions.
- `<definition>` is either a **string literal** `"…"` (an exact match) or a
  **regular expression** `/…/` (§3).
- `modifiers` are zero or more of `-> skip`, `@prec(N)`, `@caseless`, `-> pass`
  (§6); a `/regex/` may also carry a glued `i` case-insensitivity flag (`/…/i`).

A grammar MUST place all its named classes here; an ALL-CAPS symbol used in a
production but absent from a Tokens-role fence is an error ("token class `X`
used but never defined") unless the block is in external mode (§6).

Like the Settings- and Precedence-role fences, a Tokens-role fence is a
hand-parsed sidecar notation, not itself a `gramaire` grammar — but unlike
those two, it is never ambiguous with production content: a token
definition's ALL-CAPS-name-before-`:` shape can never overlap a valid
production, since the `lr` notation requires a newline between a rule's name
and its `:` (`IDENT NL :`) while a token definition's `:` is on the same line
as its name.

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

1. **Named classes** — defined in the Tokens-role `gramaire` fence (§2).
2. **Implicit literals** — every terminal literal that appears in a production
   (`'{'`, `','`, `'true'`, and in `gramaire` itself `':'` / `'|'` / `';'`) is a token defined
   by its exact spelling. These need **no** Tokens-role fence entry; the productions
   define them. A literal may be written in either of two interchangeable
   delimiters — `'x'` or `"x"` — all identical (ADR D34); the author picks
   whichever needs no escaping (`'"'`, `"'"`). The chosen delimiter is escaped
   with a backslash inside the literal (`'\''`, `"\""`). Backtick is **not** a
   delimiter (it collides with Markdown inline code / fences). The lexer emits
   the whole quoted lexeme; the consumer unquotes and unescapes to the spelling.

All of these are merged into **one** scanner DFA. A grammar therefore never needs
to repeat its punctuation/keyword literals in its Tokens-role fence; it declares
only the open-ended classes.

## 5. Matching semantics

- **M1 (maximal munch).** At each position the scanner takes the **longest** match
  among all tokens.
- **M2 (priority on ties).** When two tokens match the same length, priority
  decides, highest first: implicit literals and `"…"` string-literal classes, then
  `/regex/` classes in **declaration order** (earlier wins). An explicit `@prec(N)`
  (higher N = higher priority) overrides the default order.
- **M3 (keyword reservation).** Because implicit literals outrank classes (M2), a
  quoted keyword beats an overlapping class: with `IDENT : /[A-Za-z_]\w*/` and a
  production using `'true'`, the input `true` lexes as the keyword, while
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
  generated lexer reproduces the bootstrap `Gramaire.Lexer`'s payload extraction:
  `ACTION : /\{%((?:[^%]|%[^}])*)%\}/` emits the body; `NL :
  /(\r?\n)(?:[ \t]*\r?\n)*/` emits a single `\n`. `TERM_LIT` (ADR D34) is the one
  exception — its two-delimiter alternation cannot carry a per-branch capture
  (≤1 capture, D32), so it emits the whole quoted lexeme and the consumer
  unquotes. A `TERM_LIT` never spans a line break (its class excludes `\n`), so
  an unclosed `'…` fails to match rather than greedily swallowing the rest of
  the source — the notation lexer then reports the lone opening quote as a
  located "unterminated string literal" instead of a cascade of downstream
  "unexpected character" errors. Trimming an action body's surrounding
  whitespace is likewise the **consumer's** concern (codegen), not the lexer's.

## 6. Modifiers, extras, and the external hook

- **`-> skip`** — the token is matched but is **not** a grammar symbol: the parser
  skips it. Skip tokens are exactly the grammar's **extras** — they populate the IR
  `extras` field and are preserved in the CST as leading trivia (incremental-spec
  §3). Whitespace and comments are `-> skip`. `-> skip` is the **only** extras
  mechanism for an in-file lexer; a block-level `%extras` list is reserved for
  naming externally-defined tokens (external mode), where there is no in-file
  pattern to carry `-> skip`.
- **`@prec(N)`** — explicit tie-break priority (§5, M2).
- **`@caseless`** — the class matches **ASCII case-insensitively** (ADR D35):
  every `Lit` and `Class` in its pattern folds case, so `KW : "select" @caseless`
  matches `SELECT`, `Select`, … . The equivalent on a regex is the glued **`i`
  flag** — `KW : /select/i` — identical in meaning; an author may write either.
  The matched **text** stays the source casing (`SeLeCt` lexes as itself). Unicode
  case folding is deferred with `\p{…}` (§13); v0 folds ASCII only.
- **`-> pass`** — after the regular scan, a named, host-supplied **post-lex
  pass** may reclassify or transform the token stream. It is the escape hatch for
  the genuinely non-regular fraction of lexing (indentation/offside, semicolon
  insertion, the `gramaire` continuation keep/drop). **Interface (D33):** a pass is a
  pure `Array Token -> Array Token`, registered host-side by name, run after the
  scan; it is **scalar-only** (it cannot be vectorized; cf. D31). It does **not**
  do payload extraction — that is capture's job (M5) — so the canonical `NL` pass
  decides only which `NL`s to keep or drop (line-continuation §3), while capture
  already gave each its `\n` text.
- **Block-level external mode** — the _entire_ scanner is supplied out of band; the
  block then lists class names with **no** patterns, and the grammar declares it
  brings its own lexer (today's behaviour, preserved for fully context-sensitive
  languages). Default mode is in-file regular lexing.
- **Out of scope:** an external pass reclassifies tokens from lexical context (surrounding
  characters, offside runs); it does not and will not carry _parse_ state back into
  the scanner (the classic C-typedef "lexer hack"), since the scanner runs as a
  parse-independent pre-pass (§8's self-host oracle depends on that). That class of
  problem is a parser-side concern — see `docs/multi-backend-implementation-plan.md`
  ADR D41.

## 7. IR additions

To carry lexis, the IR gains a top-level `lexer` object (lexer-spec §7,
implemented in `Gramaire.IR`):

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
`terminal`, to keep `IRTerminal` unchanged. `-> skip` classes also populate
`grammar.extras`. Token classes a grammar never uses in a production (the `-> skip`
ones) get fresh appended terminal ids. Backends compile the DFA from `pattern`s
(small, deterministic) rather than the IR shipping a serialized DFA; a backend MAY
cache one. Implicit literals are already in the IR as `kind: "literal"` terminals.

The scanner **strategy** is a backend concern (ADR D31): scalar DFA or SIMD
structural classification, behind the maximal-munch token contract. The IR
describes tokens, never how to scan them; any fast lexer must reproduce the
reference token stream byte-for-byte.

## 8. Self-host

`grammar/Productions.gram.md` carries its own Tokens-role `gramaire` fence (§10), and the scanner
built from it is the **production** lexer for `gramaire` grammar source: `Gramaire.Lr`
scans with `lrScanItems` (that block plus the implicit `` `:` `` / `` `|` ``
literals), trimming each `ACTION` body in the consumer (M5). `Gramaire.Lexer` is
now iteration-0 **bootstrap** — kept only as the self-host oracle's reference.

The oracle (`Test.LexerSelfHost`) proves the generated scanner reproduces that
bootstrap lexer **token-for-token** — terminal _and_ text, thanks to capture
(M5) — not just on a snippet but across the whole of `grammar/Productions.gram.md`; a
second guard checks the bootstrapped `lrTokensSource` still parses to the same
classes as the file's block. Because the parse path now scans with the generated
lexer, the existing parser self-host (`parse(Productions.gram.md) == bootstrapGrammar`)
and the whole grammar corpus are themselves an end-to-end check on it.

## 9. fmt and structure

- A grammar's lexis lives in a single, reserved `## Tokens` heading holding a
  Tokens-role `gramaire` fence — purely a STYLE convention `fmt` emits and
  checks (fmt-output-contract), never a language requirement (headings carry
  no grammar semantics). It SHOULD appear **before the first nonterminal
  section** (alphabet before grammar).
- fmt MUST align the `:` column within the block and preserve declaration order
  (it is significant — M2). The `*.gram.lock` hashes the normalized token
  definitions so a pattern change is drift-visible.

## 10. Worked example — `Productions.gram.md`

The `gramaire` notation, defining its own tokens, with capture groups (M5) for the
payload-bearing classes and `ATTR` ordered before `IDENT` / `LABEL` so `#[name]`
out-matches a `# Name` label. `NL` is significant (the continuation pass refines
its keep/drop via an external pass, while capture gives it a `\n` text); `WS` is
skipped (extras); operator tokens use the string-literal form; `` `:` ``,
`` `|` ``, and `` `;` `` stay implicit literals from the productions. Every
line ends with a mandatory `;` (mirroring Bison/YACC/ANTLR4's own convention)
— the notation's token definitions are rules too, subject to the same
terminator.

```gramaire
WS       : /[ \t]+/                       -> skip ;
NL       : /(\r?\n)(?:[ \t]*\r?\n)*/      -> layout ;
ATTR     : /#\[([A-Za-z_][A-Za-z0-9_]*)\]/ ;
IDENT    : /[A-Za-z_][A-Za-z0-9_]*/ ;
TERM_LIT : /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/ ;
ACTION   : /\{%((?:[^%]|%[^}])*)%\}/ ;
LABEL    : /#[ \t]*([A-Za-z_][A-Za-z0-9_]*)/ ;
PLUS     : "+" ;
STAR     : "*" ;
QUESTION : "?" ;
LANGLE   : "<" ;
RANGLE   : ">" ;
COMMA    : "," ;
```

## 11. Worked example — `json.gram.md`

Standard JSON: two open-ended classes plus skipped whitespace; the structural
punctuation and the `true`/`false`/`null` keywords are implicit literals from the
productions, so they are not repeated here. `STRING` and `NUMBER` carry the whole
match as their text (no capture), and use non-capturing groups for structure.

```gramaire
STRING : /"(?:[^"\\]|\\.)*"/ ;
NUMBER : /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+)?/ ;
WS     : /[ \t\r\n]+/    -> skip ;
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
- **L3 (extras populate the IR).** `-> skip` tokens appear in `grammar.extras` and
  as CST trivia (incremental-spec §3).
- **L4 (self-host lexer).** The generated `gramaire` lexer reproduces the bootstrap
  lexer's token stream on `grammar/Productions.gram.md` (§8) — terminals now, text once
  capture lands.
- **L5 (json self-contained).** `json.gram.md` plus its Tokens-role `gramaire`
  fence parses a JSON corpus with no hand-written scanner.

## 13. Resolved questions

1. **Unicode classes** — **ASCII for v0.** The regex parser reserves `\p{…}`
   syntactically and rejects it ("Unicode classes are not yet supported") rather
   than mis-parsing, so grammars stay forward-compatible. Full `\p{L}` / `\p{N}`
   is a later, opt-in addition (it needs property tables; still a DFA, so no
   ReDoS).
2. **Token fragments** — **deferred.** Patterns are short enough flat for now; a
   non-emitting `%fragment NAME : /…/` for reuse (a shared `DIGIT`) is revisited
   when a real grammar feels the pain.
3. **Per-token vs block extras** — `-> skip` is the sole in-file mechanism; a
   block-level `%extras` list is reserved for external mode only (§6).
4. **The `-> pass` contract** — pinned in §6 (D33): a scalar, host-registered
   `Array Token -> Array Token` pass run after the scan; line-continuation is its
   canonical instance. Capture (M5), not the external pass, owns token text.
