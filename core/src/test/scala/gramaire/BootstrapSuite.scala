package gramaire

// A structural sanity check for the literal bootstrap value. The full parity
// gates live in the JVM-only self-host suites, which parse `Productions.gram.md`
// back to this value with both the hand-written and generated reducers.
class BootstrapSuite extends munit.FunSuite:
  test("bootstrapGrammar has the eighteen `lr` notation rules, in source order") {
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
        "Delegate",
        "ArgList",
        "Arg",
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
