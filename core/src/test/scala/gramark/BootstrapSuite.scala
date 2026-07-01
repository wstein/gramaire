package gramark

// A structural sanity check only — the real parity gate (the generated
// parser reads `lr.grmk.md` back to this exact value) lands with the
// self-hosting proof once `Lr`/`Codegen` are ported.
class BootstrapSuite extends munit.FunSuite:
  test("bootstrapGrammar has the fifteen `lr` notation rules, in source order") {
    val names = Bootstrap.bootstrapGrammar.rules.map(_.name)
    assertEquals(
      names,
      Vector(
        "Grammar",
        "RuleList",
        "Rule",
        "Body",
        "Alt",
        "SymList",
        "Sym",
        "Args",
        "Action",
        "Label",
        "GroupBody",
        "Atom",
        "NotArg",
        "SetBody",
        "SetItem"
      )
    )
  }

  test("every alternative in Sym has a semantic action string, except the Atom passthrough") {
    val symRule = Bootstrap.bootstrapGrammar.rules.find(_.name == "Sym").get
    val (withAction, actionless) = symRule.alts.partition(_.action.isDefined)
    assertEquals(withAction.length, 17)
    assertEquals(
      actionless.map(_.syms),
      Vector(Vector(Sym.Ref("Atom"))),
      "the single-symbol `Sym : Atom` alternative relies on default passthrough, not a real action"
    )
  }
