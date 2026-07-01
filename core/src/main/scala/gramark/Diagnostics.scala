package gramark

import Sym.*

// Grammar-relative conflict diagnostics ([S13], LALRPOP's signature
// lesson).
//
// A `Table.Conflict` carries the competing production indices, but
// indices are LR-implementation jargon. This module renders them in the
// terms the grammar author wrote.
// Ported from src/Gramark/Diagnostics.purs.
object Diagnostics:

  /** A name is nonterminal-shaped when it has a lowercase letter (mixed-case); an ALL-CAPS name is
    * a terminal token class.
    */
  private def isNonterminalName(name: String): Boolean = name.toUpperCase != name

  /** Every nonterminal reference inside a symbol (a `name:X` field is transparent; a literal
    * contributes nothing).
    */
  private def refsOf(s: Sym): Vector[String] = s match
    case Ref(n)          => Vector(n)
    case Lit(_)          => Vector.empty
    case Rep(inner)      => refsOf(inner)
    case Star(inner)     => refsOf(inner)
    case Opt(inner)      => refsOf(inner)
    case Field(_, inner) => refsOf(inner)
    case Macro(_, args)  => args.flatMap(refsOf)
    case Group(alts)     => alts.flatMap(_.flatMap(refsOf))
    case Any             => Vector.empty
    case Not(set)        => set.flatMap(refsOf)

  /** Names referenced as nonterminals but never defined by a rule. */
  def undefinedNonterminals(g: Grammar): Vector[String] =
    val defined = Table.nontermSet(g)
    def undefined(name: String): Boolean = isNonterminalName(name) && !defined.contains(name)
    g.rules.flatMap(_.alts.flatMap(_.syms.flatMap(refsOf))).filter(undefined).distinct

  /** Reject a grammar that references an undefined nonterminal, naming each so the message reads in
    * the author's terms.
    */
  def checkDefined(g: Grammar): Either[String, Grammar] =
    undefinedNonterminals(g) match
      case Vector() => Right(g)
      case bad =>
        Left(
          "undefined nonterminal" + (if bad.length == 1 then " " else "s ")
            + bad.map(n => s"`$n`").mkString(", ")
            + ": a mixed-case name must be defined by some rule"
            + " (an ALL-CAPS name is a lexer token class)."
        )

  /** Render every conflict in a failed build against the grammar that produced it.
    */
  def renderConflicts(g: Grammar, conflicts: Vector[Conflict]): Vector[String] =
    val prods = Table.productions(g)
    conflicts.map(renderConflict(prods, _))

  private def sym(s: GSym): String = s match
    case GSym.NonTerm(n) => n
    case GSym.Term(t)    => s"`$t`"
    case GSym.EOF        => "$"

  // Name a production by its real index: `LHS -> a b c`, or `ε` for an
  // empty right-hand side. A `-1` (or out-of-range) index is the augmented accept.
  private def prodName(prods: Vector[Prod], i: Int): String =
    prods.lift(i) match
      case Some(p) => p.lhs + " -> " + (if p.rhs.isEmpty then "ε" else p.rhs.map(sym).mkString(" "))
      case None    => "accept (the start production)"

  /** Render one conflict in grammar terms. `prods` is `productions g` — the real (un-augmented)
    * production list the conflict's indices reference.
    */
  def renderConflict(prods: Vector[Prod], c: Conflict): String = c match
    case Conflict.ShiftReduce(state, onSymbol, reduceProd) =>
      s"shift/reduce conflict in state $state on ${sym(onSymbol)}:\n" +
        s"  shift ${sym(onSymbol)}  vs  reduce ${prodName(prods, reduceProd)}\n" +
        s"  fix: give ${sym(onSymbol)} a precedence in the `## Precedence` block, inline a rule, or enable GLR."
    case Conflict.ReduceReduce(state, onSymbol, prodA, prodB) =>
      s"reduce/reduce conflict in state $state on ${sym(onSymbol)}:\n" +
        s"  reduce ${prodName(prods, prodA)}  vs  reduce ${prodName(prods, prodB)}\n" +
        s"  fix: the rules are ambiguous on ${sym(onSymbol)}; merge them into one rule, left-factor, or enable GLR."
