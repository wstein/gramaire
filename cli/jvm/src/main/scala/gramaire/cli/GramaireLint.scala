package gramaire.cli

import gramaire.IR
import gramaire.IRTerminal

// `gramaire lint --target <name> <file>`: a preflight compat gate answering "will this grammar
// survive export to this backend, and if not, what specifically breaks?" Deliberately reuses the
// already-built IR (the same `Main.parseWithDocs` + `IR.buildIRP` pipeline `runEmit`/`runCheck`
// already run) rather than re-parsing or re-deriving a parallel compatibility model — each check
// below is a pure, located `Vector[String]` finding list against a resolved backend name, the
// exact shape `GramaireCheck.GateResult` already uses for `check`'s own structure/drift gates.
//
// A first version, not an exhaustive compatibility auditor: six checks, each verified empirically
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

  // Confirmed empirically: ANTLR4 has a genuine, native `# Name` alt-label syntax (ADR D26) —
  // `BackendAntlr.scala`'s `parserRule`/`altText` never reads `r.label` at all, so a labeled
  // alternative renders as a bare, unlabeled alt even though the target format could carry the
  // label losslessly. (`BackendTs.scala`, checked for contrast, DOES read `r.label` to prefer it
  // over its own fallback name — so this is a real gap in `BackendAntlr` specifically, not an
  // inherent notation mismatch; deliberately scoped to `antlr`/`bison` only, since only those two
  // were verified here.) Real Bison/yacc has no alt-label concept at all — no `.y` syntax names
  // one alternative of a rule — so the loss there is structural, not a missed opportunity, but
  // still real: an author relying on the label for downstream tooling loses it either way.
  def altLabelLoss(ir: IR, backendName: String): Vector[String] =
    if backendName != "antlr" && backendName != "bison" then Vector.empty
    else
      val ntNameById = ir.grammar.nonterminals.map(n => n.id -> n.name).toMap
      ir.grammar.rules.collect {
        case r if r.label.isDefined =>
          val lbl = r.label.get
          val rule = ntNameById.getOrElse(r.lhs, s"nt${r.lhs}")
          val why =
            if backendName == "antlr" then
              "ANTLR4 has native `# Name` alt-label syntax, but this backend never emits it"
            else "Bison/yacc has no alt-label concept at all for it to go into"
          s"rule `$rule`'s alternative is labeled `# $lbl`; $why, so the label vanishes on " +
            "export (visitor/accessor method names and CST-node naming that depend on it are lost)"
      }

  // Confirmed empirically: ANTLR4's `.g4` syntax has no case-insensitive-terminal flag (no
  // `@caseless`-equivalent token option — real ANTLR4 needs either the `caseInsensitive` grammar
  // option (4.10+) or a manual `[Ss][Ee]...`-style character-class expansion, neither of which
  // this backend does). `BackendAntlr.scala`'s `lexerRule` renders `cls.pattern` through
  // `patternText`/`regexToAntlr` completely UNCHANGED, ignoring `IRTokenClass.caseless` (ADR D35)
  // entirely — worse than a dropped decoration: the emitted `.g4` lexer rule matches only the
  // EXACT case spelled in the source pattern, so it silently accepts a strictly NARROWER language
  // than the caseless token class actually specifies (e.g. a caseless `SELECT` keyword no longer
  // matches `select`/`Select` after export). `BackendBison.scala` never emits token patterns at
  // all (`%token` declares only names — Bison itself has no lexer section, that's Flex's job, a
  // separate `.l` file this exporter doesn't produce), so there is no pattern for it to get wrong
  // there; this check is deliberately `antlr`-only.
  def caselessLoss(ir: IR, backendName: String): Vector[String] =
    if backendName != "antlr" then Vector.empty
    else
      val termById = ir.grammar.terminals.map(t => t.id -> t).toMap
      ir.lexer match
        case None => Vector.empty
        case Some(lx) =>
          lx.classes.collect {
            case c if c.caseless =>
              val name = termById
                .get(c.terminal)
                .collect { case IRTerminal.IRClass(_, n) => n }
                .getOrElse(s"T${c.terminal}")
              s"token class `$name` is declared `@caseless`; ANTLR4 has no case-insensitive-" +
                "terminal syntax and this backend does no case-folding, so the exported `.g4` " +
                "lexer rule matches only the exact case written — silently accepting a NARROWER " +
                "language than the source grammar, not merely losing a decoration"
          }

  // Confirmed empirically (same grep as `delegateLoss`/`externalsLoss`): most first-party textual/
  // code backends read `IRRule.predicate` at all. A rule whose alternative only fires under a
  // semantic guard (`{%? %}`, D-predicates) renders as a bare, unconditional alt: the guard
  // vanishes, so the exported grammar accepts every input the ungated alternative shape allows. If
  // the predicate existed to rule out an ambiguity or a context the bare BNF shape alone can't
  // express, this is a real change to the accepted language, not merely a lost comment. `ir` is
  // exempt because it serializes the predicate marker as JSON and so loses nothing; `antlr` is
  // exempt as of ADR D54 — `BackendAntlr` now renders `IRRule.predicate` back as ANTLR4's own
  // `{ ... }?` syntax, so `--target antlr` genuinely keeps the guard, unlike every other backend
  // here (mirrors `delegateLoss`/`externalsLoss`'s own `js` exemption once `BackendJs` gained real
  // rendering, D51). `bison` stays un-exempted: real yacc has no semantic-predicate concept for a
  // guard to go into at all.
  def predicateLoss(ir: IR, backendName: String): Vector[String] =
    if backendName == "ir" || backendName == "antlr" then Vector.empty
    else
      val ntNameById = ir.grammar.nonterminals.map(n => n.id -> n.name).toMap
      ir.grammar.rules.collect {
        case r if r.predicate.isDefined =>
          val rule = ntNameById.getOrElse(r.lhs, s"nt${r.lhs}")
          s"rule `$rule`'s alternative carries a semantic predicate (`{%? %}`); the " +
            s"'$backendName' backend never reads `IRRule.predicate`, so the guard vanishes and " +
            "the alternative becomes unconditionally available on export — a different accepted " +
            "language, not just a lost decoration"
      }

  /** All of `lint`'s checks against `ir` for the named target backend, one `GateResult` per check —
    * mirrors `GramaireCheck.checkStructure`/`checkDrift`'s pass-is-empty convention exactly, so
    * `runLint` can present them the same way `runCheck` presents its own gates.
    */
  def gates(ir: IR, backendName: String): Vector[GramaireCheck.GateResult] =
    Vector(
      GramaireCheck.GateResult("precedence", precedenceLoss(ir, backendName)),
      GramaireCheck.GateResult("delegate", delegateLoss(ir, backendName)),
      GramaireCheck.GateResult("externals", externalsLoss(ir, backendName)),
      GramaireCheck.GateResult("altLabel", altLabelLoss(ir, backendName)),
      GramaireCheck.GateResult("caseless", caselessLoss(ir, backendName)),
      GramaireCheck.GateResult("predicate", predicateLoss(ir, backendName))
    )
