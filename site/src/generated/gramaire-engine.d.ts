// Type surface for `gramaire-engine.mjs` — the PureScript `Gramaire.Playground`
// module bundled to browser ESM (ADR D13). GENERATED; regenerate with
// `npm run build:engine`. Keep this in sync with `Gramaire.Playground.Result`.

export interface EngineResult {
  /** Did the grammar document itself parse? */
  ok: boolean;
  /** Did the input parse against that grammar? */
  accepted: boolean;
  message: string;
  diagnostics: string[];
  /** The grammar's nonterminals, in source order. */
  rules: string[];
  /** The input's lexed token texts. */
  tokens: string[];
}

export function evaluate(args: { source: string; input: string }): EngineResult;
