package gramark.cli

// Phase 0 scaffolding placeholder for the unified `gramark` CLI. Real
// subcommands (`emit`, `conformance`, `codegen-regen`, `check`, `fmt`)
// land in Phase 3 once `core` and the CLI's own logic are ported.
object Main:
  def main(args: Array[String]): Unit =
    println(s"gramark-cli scaffold: ${gramark.Version.placeholder}")
