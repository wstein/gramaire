// markdownlint-cli2 ships no type declarations; declare the sliver of its
// programmatic API that the lint gate uses. See:
// https://github.com/DavidAnson/markdownlint-cli2#programmatic-invocation
declare module "markdownlint-cli2" {
  export interface MarkdownlintCli2Params {
    /** CLI-style arguments: the globs / file paths to lint. */
    readonly argv: readonly string[];
    /** Receives each normal output line instead of stdout. */
    readonly logMessage?: (msg: string) => void;
    /** Receives each error output line instead of stderr. */
    readonly logError?: (msg: string) => void;
  }

  /** Lints the given files and resolves to a process exit code. */
  export function main(params: MarkdownlintCli2Params): Promise<number>;
}
