export interface GrammarSymbol {
  kind: 'nonterminal' | 'terminal' | 'token';
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

export interface Grammar {
  name: string;
  startSymbol: string;
  rules: GrammarRule[];
}

export interface EvaluationResult {
  success: boolean;
  message: string;
  diagnostics: string[];
  trace: string[];
  inputTokens: string[];
  grammarRules: string[];
}

export interface ParseIssue {
  message: string;
  severity: 'error' | 'warning';
}

interface EarleyState {
  production: GrammarProduction;
  dot: number;
  start: number;
  end: number;
}

interface Token {
  kind: 'number' | 'identifier' | 'punctuation' | 'whitespace';
  value: string;
}

const DEFAULT_GRAMMAR = `# Arithmetic Lab

This grammar demonstrates the live evaluator in a compact, Grammark-like form.

## Expr

\`\`\`lr
Expr
  : Term PLUS Expr
  | Term
Term
  : NUM
\`\`\`
`;

const DEFAULT_INPUT = '4 + 7';

export function getDefaultGrammar(): string {
  return DEFAULT_GRAMMAR;
}

export function getDefaultInput(): string {
  return DEFAULT_INPUT;
}

export function parseMarkdownGrammar(source: string): { grammar: Grammar | null; issues: ParseIssue[] } {
  const lines = source.split(/\r?\n/);
  const rules = new Map<string, GrammarRule>();
  const issues: ParseIssue[] = [];
  let currentRule: string | null = null;
  let currentBlock: string[] = [];
  let inFence = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('```')) {
      if (!inFence) {
        inFence = true;
        currentBlock = [];
      } else {
        const block = currentBlock.join('\n');
        parseRuleBlock(block, rules, issues);
        currentBlock = [];
        inFence = false;
      }
      continue;
    }

    if (inFence) {
      currentBlock.push(rawLine);
      continue;
    }

    if (line.startsWith('## ')) {
      currentRule = null;
      continue;
    }

    if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(line)) {
      currentRule = line;
    }
  }

  if (inFence) {
    issues.push({ severity: 'error', message: 'Unterminated lr fence.' });
  }

  if (rules.size === 0) {
    issues.push({ severity: 'error', message: 'No lr grammar rules were found.' });
  }

  const grammarRules = Array.from(rules.values());
  const startSymbol = grammarRules[0]?.name ?? 'Start';

  return {
    grammar: rules.size > 0
      ? {
          name: 'Lab Grammar',
          startSymbol,
          rules: grammarRules,
        }
      : null,
    issues,
  };
}

function parseRuleBlock(block: string, rules: Map<string, GrammarRule>, issues: ParseIssue[]): void {
  const normalized = block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (normalized.length === 0) {
    return;
  }

  let currentRule: GrammarRule | null = null;
  const productionLines = normalized.filter((line) => line !== 'lr');

  for (const line of productionLines) {
    if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(line) && !line.startsWith(':') && !line.startsWith('|')) {
      currentRule = rules.get(line) ?? { name: line, productions: [] };
      rules.set(line, currentRule);
      continue;
    }

    if (!currentRule) {
      issues.push({ severity: 'error', message: 'Rule body found before a rule name.' });
      continue;
    }

    if (line.startsWith(':')) {
      const rhs = parseProductionBody(line.slice(1).trim());
      currentRule.productions.push({ lhs: currentRule.name, rhs, source: line });
      continue;
    }

    if (line.startsWith('|')) {
      const rhs = parseProductionBody(line.slice(1).trim());
      currentRule.productions.push({ lhs: currentRule.name, rhs, source: line });
      continue;
    }
  }
}

function parseProductionBody(body: string): GrammarSymbol[] {
  if (!body) {
    return [];
  }

  const tokens = body.match(/`[^`]+`|[A-Za-z_][A-Za-z0-9_-]*|[^\s]+/g) ?? [];
  return tokens.map((token) => {
    if (token.startsWith('`') && token.endsWith('`')) {
      return { kind: 'terminal', value: token.slice(1, -1) };
    }

    if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(token)) {
      if (/^[A-Z][A-Z0-9_]*$/.test(token)) {
        return { kind: 'token', value: token };
      }
      return { kind: 'nonterminal', value: token };
    }

    if (token === 'PLUS') {
      return { kind: 'terminal', value: '+' };
    }

    return { kind: 'terminal', value: token };
  });
}

export function evaluateGrammar(grammar: Grammar | null, input: string): EvaluationResult {
  if (!grammar) {
    return {
      success: false,
      message: 'The grammar could not be parsed.',
      diagnostics: ['Enter a valid grammar to begin.'],
      trace: [],
      inputTokens: [],
      grammarRules: [],
    };
  }

  const tokens = tokenize(input);
  const inputTokens = tokens.filter((token) => token.kind !== 'whitespace').map((token) => token.value);
  const result = runEarley(grammar, tokens);
  const diagnostics = result.success
    ? ['Accepted by the live evaluator.', `Parsed ${inputTokens.length} token(s).`]
    : [
        'The input did not match the grammar.',
        ...result.trace.slice(0, 3),
      ];

  return {
    success: result.success,
    message: result.success ? 'The input matched the grammar.' : 'The input did not match the grammar.',
    diagnostics,
    trace: result.trace,
    inputTokens,
    grammarRules: grammar.rules.map((rule) => rule.name),
  };
}

function runEarley(grammar: Grammar, tokens: Token[]): { success: boolean; trace: string[] } {
  const chart: EarleyState[][] = Array.from({ length: tokens.length + 1 }, () => []);
  const startProduction: GrammarProduction = {
    lhs: '$start',
    rhs: [{ kind: 'nonterminal', value: grammar.startSymbol }],
    source: `start -> ${grammar.startSymbol}`,
  };

  const initialState: EarleyState = { production: startProduction, dot: 0, start: 0, end: 0 };
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
            if (symbol && symbol.kind === 'nonterminal' && symbol.value === completedSymbol) {
              const nextState = advanceState(previous, completedSymbol, state);
              if (addState(chart[position], nextState)) {
                changed = true;
                if (completedSymbol !== '$start') {
                  trace.push(`${completedSymbol} -> ${state.production.rhs.map((item) => item.value).join(' ')}`);
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

        if (nextSymbol.kind === 'nonterminal') {
          const rule = grammar.rules.find((candidate) => candidate.name === nextSymbol.value);
          if (!rule) {
            continue;
          }

          for (const production of rule.productions) {
            const predicted = { production, dot: 0, start: position, end: position };
            if (addState(chart[position], predicted)) {
              changed = true;
            }
          }
          continue;
        }

        if (position < tokens.length && tokenMatches(nextSymbol, tokens[position])) {
          const advanced = advanceState(state, nextSymbol.value, undefined);
          if (addState(chart[position + 1], advanced)) {
            changed = true;
          }
        }
      }
    }
  }

  const accepted = chart[tokens.length].some((candidate) => {
    return candidate.production.lhs === '$start' && candidate.dot === candidate.production.rhs.length;
  });

  return { success: accepted, trace };
}

function advanceState(state: EarleyState, symbol: string, completedState?: EarleyState): EarleyState {
  return {
    production: state.production,
    dot: state.dot + 1,
    start: state.start,
    end: completedState?.end ?? state.end,
  };
}

function addState(chart: EarleyState[], state: EarleyState): boolean {
  const exists = chart.some((candidate) => {
    return candidate.production.lhs === state.production.lhs
      && candidate.production.source === state.production.source
      && candidate.dot === state.dot
      && candidate.start === state.start;
  });

  if (!exists) {
    chart.push(state);
    return true;
  }

  return false;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/\d/.test(char)) {
      let value = char;
      index += 1;
      while (index < input.length && /\d/.test(input[index])) {
        value += input[index];
        index += 1;
      }
      tokens.push({ kind: 'number', value });
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      let value = char;
      index += 1;
      while (index < input.length && /[A-Za-z0-9_]/.test(input[index])) {
        value += input[index];
        index += 1;
      }
      tokens.push({ kind: 'identifier', value });
      continue;
    }

    tokens.push({ kind: 'punctuation', value: char });
    index += 1;
  }

  return tokens;
}

function tokenMatches(symbol: GrammarSymbol, token: Token): boolean {
  if (symbol.kind === 'terminal') {
    return token.value === symbol.value;
  }

  if (symbol.kind === 'token') {
    if (symbol.value === 'NUM') {
      return token.kind === 'number';
    }
    if (symbol.value === 'PLUS') {
      return token.kind === 'punctuation' && token.value === '+';
    }
    return token.kind === 'identifier' || token.kind === 'number';
  }

  return false;
}
