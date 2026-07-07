package gramaire

// A `format` backend: `gramaire-ir` in, an ANTLR4 `.g4` grammar out. The
// tractable half of the ANTLR <-> Gramaire converter — each nonterminal
// becomes a parser rule, each token class a lexer rule. The reverse
// direction (ANTLR -> Gramaire, ConvertAntlr) is the hard half.
// Ported from src/Gramaire/Backend/Antlr.purs.
//
// Also consumes `IRNonterminal.comment` (ADR D39) to reconstruct each parser rule's own leading
// `/* … */` doc comment — mirrors `BackendBison`'s own use of the same field exactly.
object BackendAntlr:
  val backend: Backend = Backend(
    name = "antlr",
    capabilities = Vector(Capability.Format),
    strategies = Backend.allStrategies,
    emit = ir =>
      val g4 = Vector(Output(s"${ir.grammar.name}.g4", emit(ir)))
      val renames = renameMap(ir)
      // A `<Name>.gramaire-names.json` sidecar (ADR D62), only when something was actually
      // renamed — never an in-band `.g4` comment: ANTLR's own file format isn't Gramaire's to
      // annotate, and a sidecar keeps the exported grammar plain, ordinary ANTLR. Read back by
      // `ConvertAntlr.importAntlr`'s own `renameMap` parameter to restore the original spelling
      // (and every reference to it) on re-import.
      if renames.isEmpty then g4
      else g4 :+ Output(s"${ir.grammar.name}.gramaire-names.json", renameMapJson(renames))
  )

  /** Every PARSER rule this export force-lowercased (ADR D62): ANTLR name -> original Gramaire
    * name. Empty when the grammar's own nonterminals were already all lowercase-initial (the common
    * case for a grammar imported FROM ANTLR in the first place, or authored lowercase to begin
    * with) — a real ANTLR parser rule can never start uppercase, so `Expr`/`expr` could never both
    * be valid ANTLR parser rules; only the direction Gramaire -> ANTLR ever renames.
    */
  def renameMap(ir: IR): Map[String, String] =
    ir.grammar.nonterminals.flatMap { nt =>
      val exported = ruleName(nt.name)
      if exported != nt.name then Some(exported -> nt.name) else None
    }.toMap

  // `Json.stringify` already sorts an JObject's keys at render time (its own canonical-JSON
  // guarantee), so no separate sort is needed here.
  private def renameMapJson(renames: Map[String, String]): String =
    Json.stringify(Json.JObject(renames.toVector.map { case (k, v) => k -> Json.JString(v) }))

  private val reserved: Set[String] =
    Set(
      "grammar",
      "lexer",
      "parser",
      "tokens",
      "channels",
      "options",
      "import",
      "fragment",
      "mode",
      "returns",
      "locals",
      "throws",
      "catch",
      "finally"
    )

  // A nonterminal becomes a parser rule (lowercase first letter); ANTLR
  // keywords are suffixed so a rule named `grammar` or `tokens` does not collide.
  private def ruleName(n: String): String =
    val lc = n.take(1).toLowerCase + n.drop(1)
    if reserved.contains(lc) then lc + "_" else lc

  private def esc1(c: Char): String = c match
    case '\'' => "\\'"
    case '\\' => "\\\\"
    case _    => c.toString

  // A literal terminal as an ANTLR single-quoted string.
  private def quote(spelling: String): String = "'" + spelling.map(esc1).mkString + "'"

  /** Translate Gramaire's restricted regex sublanguage to ANTLR4 lexer notation.
    */
  def regexToAntlr(src: String): String =
    def quoteEscaped(d: Char): String = d match
      case 'n' => "'\\n' "
      case 'r' => "'\\r' "
      case 't' => "'\\t' "
      case _   => quotePlain(d)
    def quotePlain(c: Char): String = "'" + esc1(c) + "' "

    def at(i: Int): Option[Char] = if i >= 0 && i < src.length then Some(src.charAt(i)) else None

    // A `{n,m}` quantifier carries over unchanged.
    def verbatimBrace(i: Int): Vector[String] = at(i) match
      case Some('}') => "}" +: go(i + 1, false)
      case Some(c)   => c.toString +: verbatimBrace(i + 1)
      case None      => Vector.empty

    def go(i: Int, inClass: Boolean): Vector[String] =
      at(i) match
        case None => Vector.empty
        case Some(c) if inClass =>
          c match
            case ']' => "]" +: go(i + 1, false)
            case '\\' =>
              at(i + 1) match
                case Some(d) => (s"\\$d") +: go(i + 2, true)
                case None    => "\\" +: go(i + 1, true)
            case _ => c.toString +: go(i + 1, true)
        case Some(c) =>
          c match
            case '[' =>
              at(i + 1) match
                case Some('^') => "~[" +: go(i + 2, true)
                case _         => "[" +: go(i + 1, true)
            case '(' =>
              (at(i + 1), at(i + 2)) match
                case (Some('?'), Some(':')) => "(" +: go(i + 3, false)
                case _                      => "(" +: go(i + 1, false)
            case ')' => ")" +: go(i + 1, false)
            case '|' => "| " +: go(i + 1, false)
            case '*' => "* " +: go(i + 1, false)
            case '+' => "+ " +: go(i + 1, false)
            case '?' => "? " +: go(i + 1, false)
            case '.' => ". " +: go(i + 1, false)
            case '{' => verbatimBrace(i)
            case '\\' =>
              at(i + 1) match
                case Some(d) => quoteEscaped(d) +: go(i + 2, false)
                case None    => go(i + 1, false)
            case _ => quotePlain(c) +: go(i + 1, false)

    go(0, false).mkString.trim

  private def patternText(p: IRPattern): String = p match
    case IRPattern.IRPatLiteral(s) => quote(s)
    case IRPattern.IRRegex(src)    => regexToAntlr(src)

  private def skipText(c: IRTokenClass): String = if c.skip then " -> skip" else ""

  /** Render the IR as an ANTLR4 combined grammar. */
  def emit(ir: IR): String =
    val ntNameById: Map[Int, String] = ir.grammar.nonterminals.map(n => n.id -> n.name).toMap
    val termById: Map[Int, IRTerminal] = ir.grammar.terminals.map(t => t.id -> t).toMap
    // A token carrying `@spelling("...")` (ADR D61) renders under that spelling everywhere in the
    // `.g4`, not just its own lexer-rule line — a parser rule referencing it (`symText`'s `IRRefT`
    // case below) must agree, or the emitted grammar references a lexer rule name (`DIGIT`) that no
    // longer exists once the definition line itself renders as `Digit`.
    val spellingByTid: Map[Int, String] = ir.lexer match
      case None     => Map.empty
      case Some(lx) => lx.classes.flatMap(c => c.nativeSpelling.map(c.terminal -> _)).toMap

    def symText(r: IRRef): String = r match
      case IRRef.IRRefNT(i, _) => ruleName(ntNameById.getOrElse(i, s"nt$i"))
      case IRRef.IRRefT(i, _) =>
        termById.get(i) match
          case Some(IRTerminal.IRLiteral(_, spelling)) => quote(spelling)
          case Some(IRTerminal.IRClass(_, name))       => spellingByTid.getOrElse(i, name)
          case None                                    => s"T$i"

    def altText(r: IRRule): String =
      val rhsText = r.rhs.map(symText) match
        case Vector() => "/* empty */"
        case parts    => parts.mkString(" ")
      // `IRRule.predicate` flags this alt's action an ALL(*) semantic predicate (D42/D-predicates)
      // rather than a value-building one — render it back as ANTLR4's own `{ ... }?` syntax
      // (ADR D54), leading the alt as is idiomatic ANTLR4 style. The body always lives under
      // whichever single key `actions` carries — `"default"` if this `IR` was never re-tagged by
      // `IR.withActionLang` (e.g. a hand-built `IR` in a unit test), or the document's declared
      // `%lang` once it has been (the real `emit` pipeline's `Main.scala` always calls
      // `withActionLang` before any backend runs) — never both, since `Alt`'s one `action` field
      // is the sole source for both `actions` and `predicate` (`IR.irGrammarOf`). Reading
      // `.values.headOption` rather than a hardcoded key name is what makes this correct under
      // either case. The stored text itself is `Desugar`'s wrapped form (e.g. `\_ -> flag`, a
      // synthesized binder around the author's real body), not the literal source — `unwrapBinder`
      // (`BackendJs.scala`, `private[gramaire]`, already reused by the Lab for the same "display the
      // author's real body" reason) strips it back to `flag` regardless of target language, since
      // that transform is about undoing Gramaire's own desugaring wrapper, not about JS specifically.
      r.predicate match
        case Some(_) =>
          val body = BackendJs.unwrapBinder(r.actions.values.headOption.getOrElse(""))
          s"{$body}? $rhsText"
        case None => rhsText

    def parserRule(nt: IRNonterminal): String =
      val alts = ir.grammar.rules.filter(_.lhs == nt.id)
      val body = alts.map(altText) match
        case Vector() => s"${ruleName(nt.name)} : /* (no productions) */ ;\n"
        case texts =>
          s"${ruleName(nt.name)}\n  : ${texts.head}" + texts.tail
            .map(b => s"\n  | $b")
            .mkString + "\n  ;\n"
      nt.comment.map(c => s"/* $c */\n").getOrElse("") + body

    // A token carrying `@spelling("...")` (ADR D61) round-trips under its ORIGINAL ANTLR spelling —
    // e.g. a `Digit` lexer rule imported as Gramaire's `DIGIT` re-exports as `Digit`, not `DIGIT` —
    // rather than Gramaire's own ALL-CAPS-only internal name, which exists purely so `## Tokens`
    // fences stay self-classifying (D-grammar-roles), not as a real ANTLR-facing identifier.
    def lexerRule(lx: IRLexer, tid: Int): Option[String] =
      for
        cls <- lx.classes.find(_.terminal == tid)
        name <- termById.get(tid).collect { case IRTerminal.IRClass(_, n) => n }
      yield s"${cls.nativeSpelling.getOrElse(name)} : ${patternText(cls.pattern)}${skipText(cls)} ;"

    val lexerSection: Vector[String] = ir.lexer match
      case None     => Vector.empty
      case Some(lx) => "// ── lexer ──" +: lx.order.flatMap(tid => lexerRule(lx, tid))

    (Vector(s"grammar ${ir.grammar.name};", "") ++ ir.grammar.nonterminals.map(
      parserRule
    ) ++ lexerSection).mkString("\n")
