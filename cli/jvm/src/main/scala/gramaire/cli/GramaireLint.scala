package gramaire.cli

import gramaire.IR

// `gramaire lint --target <name> <file>`: a preflight compat gate answering "will this grammar
// survive export to this backend, and if not, what specifically breaks?" Deliberately reuses the
// already-built IR (the same `Main.parseWithDocs` + `IR.buildIRP` pipeline `runEmit`/`runCheck`
// already run) rather than re-parsing or re-deriving a parallel compatibility model — each check
// below is a pure, located `Vector[String]` finding list against a resolved backend name, the
// exact shape `GramaireCheck.GateResult` already uses for `check`'s own structure/drift gates.
//
// A first version, not an exhaustive compatibility auditor: three checks, each verified empirically
// against the current backends rather than assumed from the notation's own docs.
object GramaireLint:

  // ANTLR4 has no precedence-declaration syntax at all — confirmed empirically:
  // `BackendAntlr.scala` never reads `ir.grammar.precedence` anywhere, unlike `BackendBison.scala`,
  // which DOES consume it to reconstruct `%left`/`%right`/`%nonassoc` (ADR D37/D38). A grammar with
  // a non-empty `## Precedence` block silently loses every declared level on `--target antlr`
  // export; Bison has no such gap.
  def precedenceLoss(ir: IR, backendName: String): Vector[String] =
    if backendName == "antlr" && ir.grammar.precedence.nonEmpty then
      val levels = ir.grammar.precedence.sortBy(_.level).map(p => s"${p.assoc}@${p.level}")
      Vector(
        s"## Precedence declares ${ir.grammar.precedence.length} level(s) " +
          s"(${levels.mkString(", ")}); ANTLR4 has no precedence-declaration syntax, so every " +
          "level is silently dropped on export (Bison's `%left`/`%right`/`%nonassoc` has no such gap)"
      )
    else Vector.empty

  // Confirmed empirically: NEITHER `BackendAntlr.scala` nor `BackendBison.scala` (nor most other
  // first-party textual backends) reads `IRRule.delegate` at all — each backend's rule-rendering
  // (`altText`) only ever looks at `r.rhs`, so a `-> name`/`-> name(args)` alternative (ADR D48)
  // renders as a bare, actionless alt with no comment or reference to the delegate left behind; the
  // delegate silently vanishes, not just its resolution. `ir` is exempt because it serializes the
  // whole IR (delegate included) as JSON, so nothing is lost exporting there; `js` is exempt too, as
  // of ADR D51 — `BackendJs` now renders a `-> name` delegate as a real generated call (an embedded
  // `## Externals` implementation spliced in directly, or a runtime-resolved `externals[name]` call
  // otherwise), so `--target js` genuinely keeps it, unlike every other textual backend here.
  def delegateLoss(ir: IR, backendName: String): Vector[String] =
    if backendName == "ir" || backendName == "js" then Vector.empty
    else
      val ntNameById = ir.grammar.nonterminals.map(n => n.id -> n.name).toMap
      ir.grammar.rules.collect {
        case r if r.delegate.isDefined =>
          val d = r.delegate.get
          val rule = ntNameById.getOrElse(r.lhs, s"nt${r.lhs}")
          val argsText = if d.args.isEmpty then "" else s"(${d.args.mkString(", ")})"
          s"rule `$rule` delegates its action to `-> ${d.name}$argsText`; the '$backendName' " +
            "backend never renders a rule's delegate at all, so the reference vanishes on " +
            "export, not even as a comment"
      }

  // Confirmed empirically (same grep as `delegateLoss`): `IR.externals` (ADR D49's `## Externals`
  // embedded fenced implementations) was, until D51, referenced by no first-party textual backend
  // either — an author who embedded a delegate's real `-> name` implementation directly in the
  // `.gram.md` got it silently dropped too, on top of the reference itself (`delegateLoss`). Scoped
  // the same way as that check: `ir` carries it through as JSON; `js` now splices a matching `###
  // name` `javascript` fence directly into the generated reduce function (D51) — both exempt.
  def externalsLoss(ir: IR, backendName: String): Vector[String] =
    if backendName == "ir" || backendName == "js" || ir.externals.isEmpty then Vector.empty
    else
      ir.externals.map { ext =>
        val langs = ext.impl.keys.toVector.sorted.mkString(", ")
        s"## Externals embeds a `$langs` implementation for `${ext.name}`; the '$backendName' " +
          "backend carries none of it into the export — the embedded code vanishes along with " +
          "the delegate reference that names it"
      }

  /** All of `lint`'s checks against `ir` for the named target backend, one `GateResult` per check —
    * mirrors `GramaireCheck.checkStructure`/`checkDrift`'s pass-is-empty convention exactly, so
    * `runLint` can present them the same way `runCheck` presents its own gates.
    */
  def gates(ir: IR, backendName: String): Vector[GramaireCheck.GateResult] =
    Vector(
      GramaireCheck.GateResult("precedence", precedenceLoss(ir, backendName)),
      GramaireCheck.GateResult("delegate", delegateLoss(ir, backendName)),
      GramaireCheck.GateResult("externals", externalsLoss(ir, backendName))
    )
