export interface GrammarSymbol {
  kind: "nonterminal" | "terminal" | "token";
  value: string;
}

export interface GrammarProduction {
  lhs: string;
  rhs: GrammarSymbol[];
  source: string;
}

export interface GrammarRule {
  name: string;
  productions: GrammarProduction[];
}

// A named token class from a `## Tokens` block, compiled to a sticky RegExp so
// the preview can lex it. The regular sublanguage Grammark allows (no
// backreferences, lookaround, or anchors) is a subset of JS regex, so the
// source compiles directly.
export interface GrammarTokenClass {
  name: string;
  regex: RegExp;
  skip: boolean;
}

export interface Grammar {
  name: string;
  startSymbol: string;
  rules: GrammarRule[];
  // Classes declared in the grammar's own `lr tokens` block, if any. With these
  // the preview can lex ALL-CAPS terminals (STRING, NUMBER, …) itself.
  tokenClasses: GrammarTokenClass[];
}

export interface EvaluationResult {
  success: boolean;
  message: string;
  diagnostics: string[];
  trace: string[];
  inputTokens: string[];
  grammarRules: string[];
}

export function formatEvaluationReport(result: EvaluationResult): string {
  const parts = [result.message];

  if (result.inputTokens.length > 0) {
    parts.push(`Tokens: ${result.inputTokens.join(", ")}`);
  }

  if (result.trace.length > 0) {
    parts.push("Trace:");
    parts.push(...result.trace.map((entry) => `- ${entry}`));
  }

  if (result.diagnostics.length > 0) {
    parts.push("Diagnostics:");
    parts.push(...result.diagnostics.map((entry) => `- ${entry}`));
  }

  return parts.join("\n");
}

export interface ParseIssue {
  message: string;
  severity: "error" | "warning";
}

interface EarleyState {
  production: GrammarProduction;
  dot: number;
  start: number;
  end: number;
}

interface Token {
  kind: "literal" | "class" | "unknown";
  // For a literal: its spelling. For a class: the matched text (for display).
  // For unknown: the offending character.
  value: string;
  // The token class name (e.g. "STRING") when kind === "class".
  className?: string;
}

const DEFAULT_GRAMMAR = `# Brackets

A grammar over balanced parentheses. Every terminal is a backtick literal,
so the in-browser preview lexes input straight from the grammar — there are
no token classes that would need a separate lexer.

## S

\`\`\`lr
S
  : \`(\` \`)\`
  | \`(\` S \`)\`
\`\`\`
`;

const DEFAULT_INPUT = "(())";

export function getDefaultGrammar(): string {
  return DEFAULT_GRAMMAR;
}

export function getDefaultInput(): string {
  return DEFAULT_INPUT;
}

export function parseMarkdownGrammar(source: string): {
  grammar: Grammar | null;
  issues: ParseIssue[];
} {
  const lines = source.split(/\r?\n/);
  const rules = new Map<string, GrammarRule>();
  const tokenClasses: GrammarTokenClass[] = [];
  const issues: ParseIssue[] = [];
  let currentBlock: string[] = [];
  let inFence = false;
  let fenceInfo = "";
  let currentRule: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith("```")) {
      if (!inFence) {
        inFence = true;
        currentBlock = [];
        // Key on the fence info string, like the CLI's `lrBlocks`: a ```lr
        // fence holds grammar productions, a ```lr tokens fence the lexis.
        // Everything else — `lr errors`, `lr precedence`, a ```purescript AST
        // sketch — is skipped (a content heuristic used to mistake the AST's
        // `| Arr …` lines for alternatives).
        fenceInfo = line.slice(3).trim();
      } else {
        if (fenceInfo === "lr") {
          parseRuleBlock(currentBlock.join("\n"), rules, issues, currentRule);
        } else if (fenceInfo === "lr tokens") {
          parseTokenBlock(currentBlock.join("\n"), tokenClasses, issues);
        }
        currentBlock = [];
        inFence = false;
        fenceInfo = "";
      }
      continue;
    }

    if (inFence) {
      currentBlock.push(rawLine);
      continue;
    }

    if (line.startsWith("## ")) {
      currentRule = null;
      continue;
    }

    if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(line)) {
      currentRule = line;
    }
  }

  if (inFence) {
    issues.push({ severity: "error", message: "Unterminated lr fence." });
  }

  if (rules.size === 0) {
    issues.push({
      severity: "error",
      message: "No lr grammar rules were found.",
    });
  }

  const grammarRules = Array.from(rules.values());

  // A name is a nonterminal exactly when it is some rule's left-hand side —
  // regardless of case. The per-symbol classifier above guesses by case alone,
  // so a single-letter rule like `S` is mis-tagged as a token class; reclassify
  // any non-literal symbol that names a defined rule as a nonterminal.
  const ruleNames = new Set(grammarRules.map((rule) => rule.name));
  for (const rule of grammarRules) {
    for (const production of rule.productions) {
      production.rhs = production.rhs.map((symbol) =>
        symbol.kind !== "terminal" && ruleNames.has(symbol.value)
          ? { kind: "nonterminal", value: symbol.value }
          : symbol,
      );
    }
  }

  const startSymbol = grammarRules[0]?.name ?? "Start";

  return {
    grammar:
      rules.size > 0
        ? {
            name: "Lab Grammar",
            startSymbol,
            rules: grammarRules,
            tokenClasses,
          }
        : null,
    issues,
  };
}

// Parse a `lr tokens` block: one `NAME : /regex/ [%skip]` (or `NAME : "literal"`)
// per line. Each regex class is compiled to a sticky RegExp the preview can lex
// with; a class whose pattern is rejected by JS regex (or uses a Grammark-only
// construct) is dropped, so it surfaces later as an undefined class rather than
// a crash.
function parseTokenBlock(
  block: string,
  tokenClasses: GrammarTokenClass[],
  issues: ParseIssue[],
): void {
  const lines = block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    const match = /^([A-Z][A-Z0-9_]*)\s*:\s*(.+)$/.exec(line);
    if (!match) {
      issues.push({
        severity: "warning",
        message: `Could not parse token definition: ${line}`,
      });
      continue;
    }
    const name = match[1];
    const def = match[2].trim();
    const skip = /(^|\s)%skip(\s|$)/.test(def);
    // Strip trailing modifiers (%skip, %prec N, %external(...)) to isolate the pattern.
    const pattern = def.replace(
      /\s*%(skip|prec\s+\d+|external\([^)]*\)).*$/,
      "",
    );

    let regex: RegExp | null = null;
    const rx = /^\/(.*)\/$/.exec(pattern);
    const lit = /^"(.*)"$/.exec(pattern);
    if (rx) {
      try {
        regex = new RegExp(rx[1], "y");
      } catch {
        issues.push({
          severity: "warning",
          message: `Token ${name} has a pattern the preview can't compile; it won't be lexed here.`,
        });
        continue;
      }
    } else if (lit) {
      // An exact-string class lexes like the literal it spells.
      regex = new RegExp(escapeRegExp(lit[1]), "y");
    } else {
      issues.push({
        severity: "warning",
        message: `Token ${name} is neither /regex/ nor "literal"; skipped.`,
      });
      continue;
    }
    tokenClasses.push({ name, regex, skip });
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseRuleBlock(
  block: string,
  rules: Map<string, GrammarRule>,
  issues: ParseIssue[],
  currentRuleName: string | null,
): void {
  const normalized = block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (normalized.length === 0) {
    return;
  }

  const productionLines = normalized.filter((line) => line !== "lr");
  const matchedRuleNames = productionLines.filter(
    (line) =>
      /^[A-Za-z][A-Za-z0-9_-]*$/.test(line) &&
      !line.startsWith(":") &&
      !line.startsWith("|"),
  );

  let currentRule: GrammarRule | null = null;
  const targetRuleName = currentRuleName ?? matchedRuleNames[0] ?? null;

  for (const line of productionLines) {
    if (
      /^[A-Za-z][A-Za-z0-9_-]*$/.test(line) &&
      !line.startsWith(":") &&
      !line.startsWith("|")
    ) {
      const ruleName = line;
      currentRule = rules.get(ruleName) ?? { name: ruleName, productions: [] };
      rules.set(ruleName, currentRule);
      continue;
    }

    if (!currentRule) {
      if (targetRuleName) {
        currentRule = rules.get(targetRuleName) ?? {
          name: targetRuleName,
          productions: [],
        };
        rules.set(targetRuleName, currentRule);
      } else {
        issues.push({
          severity: "error",
          message: "Rule body found before a rule name.",
        });
        continue;
      }
    }

    if (line.startsWith(":")) {
      const rhs = parseProductionBody(line.slice(1).trim());
      currentRule.productions.push({
        lhs: currentRule.name,
        rhs,
        source: line,
      });
      continue;
    }

    if (line.startsWith("|")) {
      const rhs = parseProductionBody(line.slice(1).trim());
      currentRule.productions.push({
        lhs: currentRule.name,
        rhs,
        source: line,
      });
      continue;
    }
  }
}

function parseProductionBody(body: string): GrammarSymbol[] {
  if (!body) {
    return [];
  }

  const trimmed = body.split(/\s+{%/)[0]?.trim() ?? body.trim();
  const tokens = trimmed.match(/`[^`]+`|[A-Za-z_][A-Za-z0-9_-]*|[^\s]+/g) ?? [];

  return tokens.map((token) => {
    if (token.startsWith("`") && token.endsWith("`")) {
      return { kind: "terminal", value: token.slice(1, -1) };
    }

    if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(token)) {
      if (/^[A-Z][A-Z0-9_]*$/.test(token)) {
        return { kind: "token", value: token };
      }
      return { kind: "nonterminal", value: token };
    }

    return { kind: "terminal", value: token };
  });
}

export function evaluateGrammar(
  grammar: Grammar | null,
  input: string,
): EvaluationResult {
  if (!grammar) {
    return {
      success: false,
      message: "The grammar could not be parsed.",
      diagnostics: ["Enter a valid grammar to begin."],
      trace: [],
      inputTokens: [],
      grammarRules: [],
    };
  }

  // The preview lexes input from the grammar's own literal terminals — a
  // literal is its own lexer — plus any classes the grammar declares in its
  // `## Tokens` block (STRING, NUMBER, …). A class that is USED but not DEFINED
  // there carries no lexer, so we say so rather than guess what it means.
  const usedClasses = collectTokenClasses(grammar);
  const definedClasses = new Set(grammar.tokenClasses.map((c) => c.name));
  const undefinedClasses = usedClasses.filter((c) => !definedClasses.has(c));
  if (undefinedClasses.length > 0) {
    return {
      success: false,
      message:
        "The in-browser preview can't evaluate undeclared token classes.",
      diagnostics: [
        `This grammar uses the token class(es) ${undefinedClasses.join(", ")} with no definition in a \`## Tokens\` block.`,
        "Declare them in an `lr tokens` block (so the preview can lex them), rewrite those terminals as literals, or run the grammark CLI for full evaluation.",
      ],
      trace: [],
      inputTokens: [],
      grammarRules: grammar.rules.map((rule) => rule.name),
    };
  }

  const tokens = lexByGrammar(
    input,
    collectLiterals(grammar),
    grammar.tokenClasses,
  );
  const inputTokens = tokens.map((token) => token.value);
  const unknown = tokens.filter((token) => token.kind === "unknown");
  const parsed = runEarley(grammar, tokens);
  const success = parsed.success && unknown.length === 0;

  const diagnostics = success
    ? [
        "Accepted by the in-browser preview.",
        `Parsed ${inputTokens.length} token(s).`,
      ]
    : [
        "The input did not match the grammar.",
        ...(unknown.length > 0
          ? [
              `Unrecognized input: ${unknown
                .map((token) => JSON.stringify(token.value))
                .join(", ")} — no literal terminal matches.`,
            ]
          : []),
        ...parsed.trace.slice(0, 3),
      ];

  return {
    success,
    message: success
      ? "The input matched the grammar."
      : "The input did not match the grammar.",
    diagnostics,
    trace: parsed.trace,
    inputTokens,
    grammarRules: grammar.rules.map((rule) => rule.name),
  };
}

// The literal terminals (backtick spellings) a grammar uses — the alphabet the
// preview can lex input against.
function collectLiterals(grammar: Grammar): Set<string> {
  const literals = new Set<string>();
  for (const rule of grammar.rules) {
    for (const production of rule.productions) {
      for (const symbol of production.rhs) {
        if (symbol.kind === "terminal") {
          literals.add(symbol.value);
        }
      }
    }
  }
  return literals;
}

// The ALL-CAPS token classes a grammar uses — terminals the preview cannot lex
// without a per-language lexer.
function collectTokenClasses(grammar: Grammar): string[] {
  const classes = new Set<string>();
  for (const rule of grammar.rules) {
    for (const production of rule.productions) {
      for (const symbol of production.rhs) {
        if (symbol.kind === "token") {
          classes.add(symbol.value);
        }
      }
    }
  }
  return [...classes];
}

// Lex input by maximal munch over the grammar's literal terminals AND its
// declared token classes (from the `## Tokens` block), skipping whitespace and
// any `%skip` class. On a tie a literal wins (keyword reservation: `true` beats
// an identifier class). A character nothing can start becomes an `unknown`
// token, which never matches — so it surfaces as a rejection, not a silent skip.
function lexByGrammar(
  input: string,
  literals: Set<string>,
  tokenClasses: GrammarTokenClass[],
): Token[] {
  const sortedLiterals = [...literals].sort((a, b) => b.length - a.length);
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    if (/\s/.test(input[index])) {
      index += 1;
      continue;
    }

    // Longest class match at the cursor (sticky regex anchors at lastIndex).
    let bestClass: { length: number; token: Token; skip: boolean } | null =
      null;
    for (const cls of tokenClasses) {
      cls.regex.lastIndex = index;
      const m = cls.regex.exec(input);
      if (m && m.index === index && m[0].length > 0) {
        if (!bestClass || m[0].length > bestClass.length) {
          bestClass = {
            length: m[0].length,
            token: { kind: "class", value: m[0], className: cls.name },
            skip: cls.skip,
          };
        }
      }
    }

    // Longest literal at the cursor (sortedLiterals is longest-first).
    const literal = sortedLiterals.find((candidate) =>
      input.startsWith(candidate, index),
    );

    // A literal wins ties (>=); a strictly longer class wins otherwise.
    if (literal && (!bestClass || literal.length >= bestClass.length)) {
      tokens.push({ kind: "literal", value: literal });
      index += literal.length;
    } else if (bestClass) {
      if (!bestClass.skip) tokens.push(bestClass.token);
      index += bestClass.length;
    } else {
      tokens.push({ kind: "unknown", value: input[index] });
      index += 1;
    }
  }

  return tokens;
}

function runEarley(
  grammar: Grammar,
  tokens: Token[],
): { success: boolean; trace: string[] } {
  const chart: EarleyState[][] = Array.from(
    { length: tokens.length + 1 },
    () => [],
  );
  const startProduction: GrammarProduction = {
    lhs: "$start",
    rhs: [{ kind: "nonterminal", value: grammar.startSymbol }],
    source: `start -> ${grammar.startSymbol}`,
  };

  const initialState: EarleyState = {
    production: startProduction,
    dot: 0,
    start: 0,
    end: 0,
  };
  chart[0].push(initialState);
  const trace: string[] = [];

  for (let position = 0; position <= tokens.length; position += 1) {
    let changed = true;
    while (changed) {
      changed = false;
      const states = chart[position];
      for (let index = 0; index < states.length; index += 1) {
        const state = states[index];
        if (state.dot === state.production.rhs.length) {
          const completedSymbol = state.production.lhs;
          const previousStates = chart[state.start];
          for (const previous of previousStates) {
            const symbol = previous.production.rhs[previous.dot];
            if (
              symbol &&
              symbol.kind === "nonterminal" &&
              symbol.value === completedSymbol
            ) {
              const nextState = advanceState(previous, completedSymbol, state);
              if (addState(chart[position], nextState)) {
                changed = true;
                if (completedSymbol !== "$start") {
                  trace.push(
                    `${completedSymbol} -> ${state.production.rhs.map((item) => item.value).join(" ")}`,
                  );
                }
              }
            }
          }
          continue;
        }

        const nextSymbol = state.production.rhs[state.dot];
        if (!nextSymbol) {
          continue;
        }

        if (nextSymbol.kind === "nonterminal") {
          const rule = grammar.rules.find(
            (candidate) => candidate.name === nextSymbol.value,
          );
          if (!rule) {
            continue;
          }

          for (const production of rule.productions) {
            const predicted = {
              production,
              dot: 0,
              start: position,
              end: position,
            };
            if (addState(chart[position], predicted)) {
              changed = true;
            }
          }
          continue;
        }

        if (
          position < tokens.length &&
          tokenMatches(nextSymbol, tokens[position])
        ) {
          const advanced = advanceState(state, nextSymbol.value, undefined);
          if (addState(chart[position + 1], advanced)) {
            changed = true;
          }
        }
      }
    }
  }

  const accepted = chart[tokens.length].some((candidate) => {
    return (
      candidate.production.lhs === "$start" &&
      candidate.dot === candidate.production.rhs.length
    );
  });

  return { success: accepted, trace };
}

function advanceState(
  state: EarleyState,
  symbol: string,
  completedState?: EarleyState,
): EarleyState {
  return {
    production: state.production,
    dot: state.dot + 1,
    start: state.start,
    end: completedState?.end ?? state.end,
  };
}

function addState(chart: EarleyState[], state: EarleyState): boolean {
  const exists = chart.some((candidate) => {
    return (
      candidate.production.lhs === state.production.lhs &&
      candidate.production.source === state.production.source &&
      candidate.dot === state.dot &&
      candidate.start === state.start
    );
  });

  if (!exists) {
    chart.push(state);
    return true;
  }

  return false;
}

// A literal terminal matches a literal token of equal spelling; an ALL-CAPS
// token class matches a lexed class token of the same name. An `unknown` token
// never matches anything.
function tokenMatches(symbol: GrammarSymbol, token: Token): boolean {
  if (symbol.kind === "terminal") {
    return token.kind === "literal" && token.value === symbol.value;
  }
  if (symbol.kind === "token") {
    return token.kind === "class" && token.className === symbol.value;
  }
  return false;
}
