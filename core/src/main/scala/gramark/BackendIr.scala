package gramark

// The `ir` backend: serialize the IR itself — the universal escape
// hatch, emitting `gramark-ir` as canonical JSON.
// Ported from src/Gramark/Backend/Ir.purs.
object BackendIr:
  val backend: Backend = Backend(
    name = "ir",
    capabilities = Vector(Capability.Data),
    strategies = Backend.allStrategies,
    emit = ir => Vector(Output(s"${ir.grammar.name}.ir.json", Json.stringify(IR.toJson(ir))))
  )
