// Type surface for `gramark-engine.mjs` — the Scala `gramark.Playground`
// module bundled to browser ESM (ADR D13). GENERATED; regenerate with
// `npm run build:engine`. Keep this in sync with `gramark.PlaygroundResult`.

/** The table-construction method threaded to `Gramark.Glr.forest`/`recognize`. */
export type EngineMethod = "Canonical" | "LALR" | "IELR";

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
  /** The parse tree (CST), one node per line; "" if rejected. */
  tree: string;
  /** The LR shift/reduce step sequence; "" if rejected. */
  trace: string;
  /** The explain-conflict analysis of the grammar itself. */
  conflicts: string;
  /** The first parse tree as gramark-cst JSON ({rule,children}|{token,text}); "" if rejected. */
  cstJson: string;
  /** Every derivation as gramark-cst JSON — more than one only when ambiguous
   * under the selected method (`Gramark.Glr.forest`). */
  allCstJson: string[];
  /** Production id -> LHS rule name; indexes `cstJson`'s numeric `rule` field. */
  prodLhs: string[];
  /** The table-construction method actually used to parse. */
  method: EngineMethod;
  /** Per-production [{label, fields}] JSON — the handler shape for evaluation. */
  meta: string;
  /** The self-contained JS evaluator (Backend.Js) — its inline {% %} actions baked into one `evaluate(cst)`; "" if not LR-buildable. */
  evalJs: string;
}

export function evaluate(args: {
  source: string;
  input: string;
  method?: EngineMethod;
}): EngineResult;
