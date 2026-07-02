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

  // Every ALL-CAPS name referenced anywhere in the grammar — a proxy for "declared token classes"
  // (the grammar has no separate token-class list of its own; `checkDefined` only ever sees the
  // parsed `Grammar`, not the `## Tokens` block). Used for the case-insensitive did-you-mean: an
  // author who typed `Number` almost certainly meant the token class `NUMBER`, and `NUMBER` being
  // ALL-CAPS means it was never flagged as undefined itself.
  private def terminalLikeRefs(g: Grammar): Vector[String] =
    g.rules.flatMap(_.alts.flatMap(_.syms.flatMap(refsOf))).filter(n => n.toUpperCase == n).distinct

  // Iterative Levenshtein edit distance (classic DP, O(len(a)*len(b))).
  private[gramark] def levenshtein(a: String, b: String): Int =
    val dp = Array.tabulate(b.length + 1)(identity)
    for i <- 1 to a.length do
      var prev = dp(0)
      dp(0) = i
      for j <- 1 to b.length do
        val temp = dp(j)
        dp(j) =
          if a.charAt(i - 1) == b.charAt(j - 1) then prev
          else 1 + math.min(prev, math.min(dp(j), dp(j - 1)))
        prev = temp
    dp(b.length)

  // The closest candidate within a tight edit-distance budget (a wrong suggestion is worse than
  // none) — shared by the undefined-nonterminal did-you-mean and the unknown-`#[attr]`/setting
  // warnings' own suggestions.
  private[gramark] def nearestMatch(bad: String, candidates: Vector[String]): Option[String] =
    val threshold = if bad.length < 5 then 1 else 2
    candidates
      .map(n => (n, levenshtein(bad, n)))
      .filter(_._2 <= threshold)
      .sortBy(_._2)
      .headOption
      .map(_._1)

  // A `help:` suggestion for an undefined name: a case-insensitive match against a token class
  // first (the casing-convention footgun — `Number` meaning `NUMBER`), else the closest defined
  // rule name within a tight edit-distance budget.
  private def didYouMean(bad: String, ruleNames: Vector[String], termNames: Vector[String]): Option[String] =
    termNames.find(_.equalsIgnoreCase(bad)) match
      case Some(t) => Some(s"help: did you mean the token class `$t`? (token classes are ALL-CAPS)")
      case None    => nearestMatch(bad, ruleNames).map(n => s"help: did you mean `$n`?")

  /** Reject a grammar that references an undefined nonterminal — one diagnostic per reference site
    * (via `spans`, if given), each naming the symbol and, where a close match exists, suggesting one.
    */
  def checkDefined(g: Grammar, spans: SpanIndex = SpanIndex.empty): Either[Vector[Diagnostic], Grammar] =
    undefinedNonterminals(g) match
      case Vector() => Right(g)
      case bad =>
        val ruleNames = Table.nontermSet(g).toVector.sorted
        val termNames = terminalLikeRefs(g)
        def diagsFor(name: String): Vector[Diagnostic] =
          val notes = Vector(
            "note: a mixed-case name must be defined by some rule (an ALL-CAPS name is a lexer token class)"
          ) ++ didYouMean(name, ruleNames, termNames).toVector
          val occurrences = spans.identSpans.getOrElse(name, Vector.empty)
          val msg = s"undefined nonterminal `$name`"
          if occurrences.isEmpty then Vector(Diagnostic.error(Stage.Resolve, msg, None, notes))
          else occurrences.map(sp => Diagnostic.error(Stage.Resolve, msg, Some(sp), notes))
        Left(bad.flatMap(diagsFor))

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

  // A synthesized rule name's best-guess source name: strip the sugar-lowering suffix Desugar
  // applied (`_plus`/`_star`/`_opt`/`_comma`/`_sep_...`) and retry, until a rule-head span is found
  // or every stripping option is exhausted. `__group_N` (an anonymous hoisted group) has no source
  // name to recover, so it always falls through to span-less.
  private def sourceRuleNameGuess(name: String, ruleHeads: Map[String, SrcSpan]): Option[String] =
    if ruleHeads.contains(name) then Some(name)
    else if name.startsWith("__group_") then None
    else
      val sepIdx = name.indexOf("_sep_")
      val stripped =
        if name.endsWith("_plus") then Some(name.dropRight(5))
        else if name.endsWith("_star") then Some(name.dropRight(5))
        else if name.endsWith("_opt") then Some(name.dropRight(4))
        else if name.endsWith("_comma") then Some(name.dropRight(6))
        else if sepIdx >= 0 then Some(name.substring(0, sepIdx))
        else None
      stripped.flatMap(n => sourceRuleNameGuess(n, ruleHeads))

  private def spanForProd(prods: Vector[Prod], spans: SpanIndex, i: Int): Option[SrcSpan] =
    prods.lift(i).flatMap(p => sourceRuleNameGuess(p.lhs, spans.ruleHeadSpans)).flatMap(
      spans.ruleHeadSpans.get
    )

  /** Every conflict as a located `Diagnostic`, pointing at the offending rule's own head — the state
    * number (LR-implementation jargon) demoted to a trailing note instead of the headline.
    */
  def conflictDiagnostics(g: Grammar, spans: SpanIndex, conflicts: Vector[Conflict]): Vector[Diagnostic] =
    val prods = Table.productions(g)
    conflicts.map(conflictDiagnostic(prods, spans, _))

  private def conflictDiagnostic(prods: Vector[Prod], spans: SpanIndex, c: Conflict): Diagnostic =
    c match
      case Conflict.ShiftReduce(state, onSymbol, reduceProd) =>
        Diagnostic.error(
          Stage.Tables,
          s"shift/reduce conflict on ${sym(onSymbol)}",
          spanForProd(prods, spans, reduceProd),
          Vector(
            s"shift ${sym(onSymbol)}  vs  reduce ${prodName(prods, reduceProd)}",
            s"help: give ${sym(onSymbol)} a precedence in the `## Precedence` block, inline a rule, or enable GLR.",
            s"note: state $state"
          )
        )
      case Conflict.ReduceReduce(state, onSymbol, prodA, prodB) =>
        Diagnostic.error(
          Stage.Tables,
          s"reduce/reduce conflict on ${sym(onSymbol)}",
          spanForProd(prods, spans, prodA),
          Vector(
            s"reduce ${prodName(prods, prodA)}  vs  reduce ${prodName(prods, prodB)}",
            s"help: the rules are ambiguous on ${sym(onSymbol)}; merge them into one rule, left-factor, or enable GLR.",
            s"note: state $state"
          )
        )
