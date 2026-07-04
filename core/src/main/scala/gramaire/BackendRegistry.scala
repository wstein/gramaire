package gramaire

// The registry of first-party in-process backends.
// Ported from src/Gramaire/Backend/Registry.purs.
object BackendRegistry:
  /** Every first-party backend, in display order. */
  val backends: Vector[Backend] =
    Vector(
      BackendIr.backend,
      BackendEbnf.backend,
      BackendDot.backend,
      BackendTs.backend,
      BackendAntlr.backend,
      BackendJs.backend,
      BackendAtnTs.backend
    )

  /** Find a backend by its `--backend` name. */
  def findBackend(name: String): Option[Backend] = backends.find(_.name == name)
