// Type surface for `site-glue.mjs` — the Scala.js port of site/src/lib's
// logic-bearing TypeScript (demo-grammars, lab-link, cst-view, first-follow,
// diagrams, gramark-runtime, engine-client). GENERATED; regenerate with
// `npm run build:site-glue`. Keep this in sync with the Scala sources under
// `site-glue/js/src/main/scala/gramark/site/`.

// ---- demo-grammars ----
export const SHOWCASE: string;
export const DIGIT: string;
export const LIST: string;
export const CALC: string;

// ---- lab-link ----
export interface LabLink {
  grammar?: string;
  input?: string;
  preset?: string;
}
export function labGrammarHref(
  base: string,
  grammar: string,
  input?: string,
): string;
export function labPresetHref(base: string, preset: string): string;
export function readLabLink(hash: string, search: string): LabLink;

// ---- cst-view ----
export type Cst =
  { rule: number; children: Cst[] } | { token: string; text: string };
export function toLisp(cstJson: string, prodLhs: string[]): string;
export function renderCstHtml(
  cstJson: string,
  prodLhs: string[],
  collapsed: string[],
  path?: string,
): string;

// ---- diagrams ----
export interface RuleDiagram {
  name: string;
  svg: string;
}
export interface DiaSym {
  label: string;
  term: boolean;
}
export interface Production {
  name: string;
  alts: DiaSym[][];
}
export function grammarProductions(
  source: string,
  ruleNames: string[],
): Production[];
export function renderDiagrams(
  source: string,
  ruleNames: string[],
): RuleDiagram[];

// ---- first-follow ----
export interface FirstFollow {
  first: Record<string, string[]>;
  follow: Record<string, string[]>;
  nullable: string[];
}
export function computeFirstFollow(prods: Production[]): FirstFollow;

// ---- gramark-runtime ----
export type GramarkMethod = "Canonical" | "LALR" | "IELR";
export interface GramarkParseResult {
  success: boolean;
  message: string;
  diagnostics: string[];
  rules: string[];
  tokens: string[];
  tree: string;
  trace: string;
  conflicts: string;
  cstJson: string;
  allCstJson: string[];
  prodLhs: string[];
  method: GramarkMethod;
  meta: string;
  evalJs: string;
  raw?: string;
}
export function parseGramarkDocument(
  source: string,
  inputOverride?: string,
  method?: GramarkMethod,
): Promise<GramarkParseResult>;
export function getDefaultGrammar(): string;
export function getDefaultInput(): string;

// ---- engine-client ----
export function parseInWorker(
  source: string,
  input: string,
  method?: GramarkMethod,
): Promise<GramarkParseResult>;
