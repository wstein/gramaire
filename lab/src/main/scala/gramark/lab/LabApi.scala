package gramark.lab

// The composition pipeline docs/playground-spec.md §5.1 describes.
// `core`'s functions are separate concerns today (`Parser.run` bundles no
// diagnostics, no CST, no tokens by itself) — this module's job is
// composing them, the same way the CLI already does in
// cli/jvm/src/main/scala/gramark/cli/Main.scala's `runEmit`.
//
// Don't conflate `Lr.parse` with parsing a user's input. `Lr.parse`/
// `parseWith` parse the GRAMMAR-DEFINITION NOTATION itself (`.grmk.md` ->
// Grammar, via the self-hosting bootstrap grammar) — a completely
// different concern from `Parser.run`, which parses a TARGET INPUT against
// a compiled ParseTable. `evaluate` below runs step 1 once per `COMPILE`,
// step 4 (`parseInput`) once per `EVALUATE`.

import gramark.{
  AtnSim,
  BackendJs,
  Cst,
  ConformanceLexers,
  Diagnostic,
  Diagnostics,
  GSym,
  Glr,
  Grammar,
  IR,
  LeftRec,
  Ll,
  LlAction,
  LlError,
  LlStep,
  LrStep,
  Lr,
  Method,
  ParseError,
  ParseTable,
  Parser,
  Precedence,
  PrecClimb,
  Railroad,
  Scanner,
  Severity,
  Spanned,
  SrcSpan,
  Stage,
  Sym,
  Table,
  Token,
  TokenDef,
  TraceAction,
  Tokens
}

object LabApi:
  // The All-parses tab's cap (docs/playground-spec.md M5+): enough to show a genuinely ambiguous
  // grammar's shape without a pathological grammar's parse count blowing up the response.
  private val forestCap = 50

  // `trace`/`llTrace` step count cap: under ll-star a grammar with unresolved LR conflicts (which
  // used to short-circuit to `parse = None` under `lr`, never reaching `Parser.walk`) now runs a
  // full `Ll.parseTraced` walk on every 200ms-debounced keystroke, with no table-driven bound on
  // step count the way LR's own walk has. Mirrors `forestCap`'s cap-not-fail pattern rather than
  // adding a step budget to the engine itself.
  //
  // The value itself is picked, not measured — same as `forestCap` — against no actual latency or
  // Walk-tab DOM-render budget. Tuning it properly would mean profiling `WalkPanel`/`ParseTracePanel`
  // render cost per row in `site/src/lab/LabIsland.tsx` and this function's own (documented) O(n)-
  // per-step cost, then picking a cap the 200ms debounce window can actually absorb — not done here.
  private[lab] val traceCap = 5000

  // The generic "keep the first `limit`, and say whether that dropped anything" shape both
  // `capSteps` (trace/llTrace, capped at `traceCap`) and `forestFor` (All-parses, capped at
  // `forestCap`) need — one cap-not-fail mechanism, not two independently hand-rolled `take`/
  // `length > limit` pairs.
  private[lab] def capAt[A](steps: Vector[A], limit: Int): (Vector[A], Boolean) =
    (steps.take(limit), steps.length > limit)

  // Factored out so LabApiSuite can pin the cap against a synthetic vector instead of forcing a
  // real multi-thousand-step parse through the engine — `Parser.walk`'s O(n) per-step stack/
  // remaining-input snapshots and `Ll.walkSyms`'s per-symbol recursion both have their own,
  // pre-existing memory/stack-depth costs on a parse that long, unrelated to this cap. Returns
  // whether truncation actually happened (mirrors `ForestResult.truncated`) so a capped walk can
  // say so, instead of `ParseResult.trace`/`llTrace` silently ending mid-parse with no indication
  // anything was cut.
  private[lab] def capSteps[A](steps: Vector[A]): (Vector[A], Boolean) = capAt(steps, traceCap)

  // The Lab has no real "file" for the grammar source (a browser textarea) or the target input —
  // generic placeholder source names for `Diagnostic.render`'s `-->` line, distinguishing the two
  // artifacts a diagnostic might be about (mirrors `Lr.parse`'s own `<grammar>` convention).
  private val grammarSourceName = "<grammar>"
  private val inputSourceName = "<input>"

  private def severityWord(s: Severity): String = s match
    case Severity.Error   => "error"
    case Severity.Warning => "warning"

  private def stageWord(s: Stage): String = s match
    case Stage.Lex      => "lex"
    case Stage.Parse    => "parse"
    case Stage.Desugar  => "desugar"
    case Stage.Resolve  => "resolve"
    case Stage.Tables   => "tables"
    case Stage.Internal => "internal"

  // `spanSafe` gates whether `d.span` is safe to expose on the wire as raw offsets: `SrcSpan`s for
  // grammar-notation diagnostics are relative to `Lr.toFenced(request.source)` (Diagnostic.scala's
  // own `SrcSpan` doc comment: "the original .grmk.md text, OR ITS FENCE-FREE .grmk PROJECTION when
  // the source had no fenced form"), never to `request.source` itself when the two differ. The one
  // consumer of these offsets outside `render` (the Lab frontend's click-to-source-span navigation)
  // only ever has `request.source` — the literal textarea content, not the internal projection — so
  // a span computed for the projection would select/highlight the wrong region there. Dropping the
  // span (message/severity/notes/rendered text are all still shown in full) is the safe, correct
  // behavior for that mismatched case; `render`'s own text is unaffected either way, since it's
  // always built against the same `src` the span was computed relative to.
  private def toDiagnosticInfo(
      d: Diagnostic,
      sourceName: String,
      src: String,
      spanSafe: Boolean
  ): DiagnosticInfo =
    DiagnosticInfo(
      severityWord(d.severity),
      stageWord(d.stage),
      d.message,
      if spanSafe then d.span.map(sp => SrcSpanInfo(sp.start, sp.end)) else None,
      d.notes,
      Diagnostic.render(d, sourceName, src)
    )

  // The Live Document notebook's per-fence role + line span (D29/D43: classification is Scala's
  // job, never re-inferred in TypeScript — `Lr.classifyFenceContent` is the same "case is law"
  // oracle the CLI's structure gate (`GramarkCheck.scala`) uses). Mirrors
  // `Lr.fenceOrigins`'s own bare-```gramark-marker matching, tracking 1-based line numbers instead
  // of character offsets since that's what a browser textarea navigates by; deliberately NOT
  // reusing `Lr.fenceOrigins` itself, since that private helper's offsets are relative to
  // `Lr.toFenced`'s projection (right for `lrBlocks`' purpose, wrong for a Lab frontend that only
  // ever has `request.source`'s own raw text — the same mismatch `toDiagnosticInfo`'s `spanSafe`
  // guards against above). Computed unconditionally, independent of whether the grammar notation
  // parses below, so a broken grammar still shows correct cell boundaries/role badges to fix it
  // by. Empty for a fence-free native `.grmk` source — there's simply no ```gramark marker to find
  // there, a correct "no fences" answer; the notebook view only applies to `.grmk.md` sources.
  private def fenceInfosOf(source: String): Vector[FenceInfo] =
    final case class Acc(openLine: Int, content: Vector[String], out: Vector[FenceInfo])
    val lines = source.split("\n", -1).toVector
    // `openLine == 0` means "not currently inside a fence" (1-based line numbers are always >= 1).
    val acc = lines.zipWithIndex.foldLeft(Acc(0, Vector.empty, Vector.empty)) {
      case (a, (line, i)) =>
        val lineNo = i + 1
        if a.openLine > 0 then
          if line.trim == "```" then
            val contentStr = a.content.mkString("\n")
            val kind = Lr.classifyFenceContent(contentStr)
            val nonterminal =
              if kind == Lr.FenceKind.Rule then
                a.content
                  .find(_.trim.nonEmpty)
                  .flatMap(_.trim.split("\\s+", -1).headOption.filter(_.nonEmpty))
              else None
            val kindWord = kind match
              case Lr.FenceKind.Rule       => "rule"
              case Lr.FenceKind.Tokens     => "tokens"
              case Lr.FenceKind.Settings   => "settings"
              case Lr.FenceKind.Precedence => "precedence"
            val info = FenceInfo(a.out.length, kindWord, nonterminal, a.openLine, lineNo)
            Acc(0, Vector.empty, a.out :+ info)
          else a.copy(content = a.content :+ line)
        else if line.trim == "```gramark" then Acc(lineNo, Vector.empty, a.out)
        else a
    }
    acc.out

  /** Compile `request.source` and, if `request.input` is given, parse it. Plain Scala — no
    * Scala.js-specific API — so it compiles and is directly testable on both `labJVM` and `labJS`;
    * the `@JSExportTopLevel` wrapper around this lives in the JS-only entry point, not here (this
    * cross-compiled module has one shared source tree for both platforms).
    */
  def evaluate(request: LabRequest): LabResponse =
    val fences = fenceInfosOf(request.source)
    val (src, projected) = Lr.toFencedTagged(request.source)
    // Whether `src` is actually `request.source` verbatim — false whenever the grammar notation is
    // fence-free (`toFenced` reorders/strips it into a synthetic projection), the one case where a
    // `Diagnostic.span`'s offsets (always relative to `src`) would be wrong if applied to the raw
    // text the Lab frontend actually has. See `toDiagnosticInfo`'s own comment.
    val spanSafe = !projected
    // `Lr.parseWith` always uses Canonical to build the `lr` NOTATION's OWN tables (parsing the
    // `.grmk.md` text itself) — a fixed implementation detail, unrelated to `request.method`, which
    // is the METHOD the caller wants the TARGET grammar's own tables built with, below.
    Lr.parseWith(Method.Canonical, request.source) match
      case Left(diags) =>
        LabResponse(
          LabResponse.version,
          buildOk = false,
          diagnostics = diags.map(toDiagnosticInfo(_, grammarSourceName, src, spanSafe)),
          parse = None,
          fences = fences
        )
      case Right(parsedGrammar) =>
        val grammar = withStartRule(parsedGrammar, request.startRule)
        // The target grammar's own declared `## Precedence` block (ADR D37) — dropping this (i.e.
        // building with `Table.emptyPrec`) leaves every shift/reduce ambiguity a declared
        // `%left`/`%right`/`%nonassoc` would have resolved as an unresolved conflict, which is wrong
        // for any grammar (like `examples/calc-prec.grmk.md`) whose parseability depends on it. The
        // CLI threads this the same way (`Main.scala`'s `Lr.precedenceOf(md)`); the Lab must too.
        val prec = Lr.precedenceOf(request.source)
        // `productions`/`forest`/`analysis` depend only on the grammar notation having parsed, not
        // on `Table.buildTablesFor` succeeding, and stay LR/GLR-driven under BOTH strategies —
        // `Glr.forest`'s multi-action table never fails (it keeps every conflicting action instead
        // of rejecting), which is exactly what lets a genuinely ambiguous grammar (real conflicts
        // under every method, so `buildOk` is always false under `lr`) still show the All-parses
        // tab's forest instead of only a diagnostic. `forest` is always built from `Method.Canonical`
        // — not `request.method` — regardless of `strategy`: "what parses does this grammar admit"
        // is a property of the grammar alone, not of which code-gen method the caller happens to
        // want, and Canonical is this codebase's own designated oracle (`Table.buildTables`'s doc
        // comment: "the oracle the LALR/IELR constructions are differentially tested against";
        // `GlrSuite`'s own forest tests already only ever use it). `analysis` similarly never reads
        // `request.method` — `Table.statsForAll` always reports all three methods at once.
        //
        // No separate `Diagnostics.undefinedNonterminals` call belongs here: `Lr.parseWith` already
        // runs it, as its own last step (`Desugar.desugar(g).flatMap(Diagnostics.checkDefined)`) —
        // an undefined mixed-case reference is a hard `Left(diags)` above, not a soft warning
        // `LabApi` needs to compute separately. A grammar that reaches this `Right(grammar)` branch
        // is guaranteed already free of them.
        val productions = Some(productionsOf(grammar))
        val allStarLowering = Some(allStarLoweringOf(prec, grammar))
        // Lexed once per call, not once per tab: forest/parse below all read the same target-input
        // scan against the same token definitions instead of each re-lexing it.
        val spanned = request.input.map(lexInput(request.source, grammar, _))
        val forest = spanned.map(forestFor(Method.Canonical, grammar, _))
        val analysis = Some(analysisOf(prec, grammar))
        // Soft diagnostics (unknown `#[attr]`/`%setting`, an unreachable rule, an unused token
        // class) are independent of whether the target grammar's tables build — a grammar can have
        // both real conflicts AND an unused token class, and both should be visible together.
        val warnings =
          Lr.warningsFor(request.source).map(toDiagnosticInfo(_, grammarSourceName, src, spanSafe))
        val tableResult = Table.buildTablesForP(prec, request.method, grammar)

        if request.strategy == "ll-star" then
          // A genuine alternate pipeline, not merely additive: buildOk no longer depends on
          // tableResult (the grammar notation already parsed and desugared, which is all ALL(*)
          // needs) — an LR conflict only downgrades to a warning, since ALL(*) resolves the same
          // tie itself, by declaration order (the same idiom `gramark conformance`'s `ll-star:`
          // lines already report).
          val conflictWarnings = tableResult match
            case Left(conflicts) =>
              val spans = Lr.spanIndexOf(request.source)
              Diagnostics
                .conflictDiagnostics(grammar, spans, conflicts)
                .map(d =>
                  toDiagnosticInfo(
                    // `d.notes` still carries the LR-only remedy text ("give X a precedence...
                    // enable GLR") verbatim — true advice for the LR/GLR methods, but silent on
                    // what ALL(*) itself is doing about the SAME conflict right now. Append,
                    // rather than replace, so both readings stay visible together.
                    d.copy(
                      severity = Severity.Warning,
                      notes = d.notes :+
                        "note: under ALL(*), ties like this one are resolved by declaration order — the parse shown reflects that resolution, not a fix to the grammar."
                    ),
                    grammarSourceName,
                    src,
                    spanSafe
                  )
                )
            case Right(_) => Vector.empty
          // One tracking cache shared by `parse` and `atn` — the ATN diagnostics describe the
          // actual parse, not a separate shadow run against the same input.
          val cache = new AtnSim.Cache(track = true)
          val parse = request.input.zip(spanned).map { case (input, sp) =>
            parseInputLl(prec, grammar, input, sp, cache)
          }
          val atn = parse.map { p =>
            AtnDiagnostics(
              p.accepted,
              cache.hits,
              cache.misses,
              cache.ambiguities.map(a => AmbiguityInfo(a.rule, a.decision, a.pos, a.alts))
            )
          }
          val (evaluatorJs, predicateWarning) = evaluatorJsResult(prec, request.source, grammar)
          LabResponse(
            LabResponse.version,
            buildOk = true,
            diagnostics = warnings ++ conflictWarnings ++ predicateWarning,
            parse = parse,
            productions = productions,
            forest = forest,
            analysis = analysis,
            evaluatorJs = evaluatorJs,
            atn = atn,
            allStarLowering = allStarLowering,
            fences = fences
          )
        else
          tableResult match
            case Left(conflicts) =>
              val spans = Lr.spanIndexOf(request.source)
              val conflictInfos = Diagnostics
                .conflictDiagnostics(grammar, spans, conflicts)
                .map(toDiagnosticInfo(_, grammarSourceName, src, spanSafe))
              LabResponse(
                LabResponse.version,
                buildOk = false,
                diagnostics = conflictInfos ++ warnings,
                parse = None,
                productions = productions,
                forest = forest,
                analysis = analysis,
                allStarLowering = allStarLowering,
                fences = fences
              )
            case Right(table) =>
              val parse = request.input.zip(spanned).map { case (input, sp) =>
                parseInput(table, input, sp)
              }
              val (evaluatorJs, predicateWarning) = evaluatorJsResult(prec, request.source, grammar)
              LabResponse(
                LabResponse.version,
                buildOk = true,
                diagnostics = warnings ++ predicateWarning,
                parse = parse,
                productions = productions,
                forest = forest,
                analysis = analysis,
                evaluatorJs = evaluatorJs,
                allStarLowering = allStarLowering,
                fences = fences
              )

  // The Lab's start-rule picker (M5+): core has no separate "start rule" concept anywhere —
  // `Table.analyze`'s startSymbol and `IR.irGrammarOf`'s startSymbol both just take
  // `grammar.rules.head` (the first `##` heading in declaration order), and that's what
  // `Table.buildTablesFor`'s augmented-start production keys off. Reordering `rules` so the
  // requested rule is first, once, right here, lets every downstream computation (table-building,
  // FIRST/FOLLOW, the railroad diagram, the traced evaluator) pick it up for free — zero changes to
  // core, and the CLI/every other caller is untouched since they never pass a `startRule`. A name
  // that doesn't match any rule (shouldn't happen — the picker UI only ever offers the grammar's
  // own real rule names) is ignored, falling back to the grammar's natural declaration order.
  private def withStartRule(grammar: Grammar, startRule: Option[String]): Grammar =
    startRule match
      case Some(name) if grammar.rules.exists(_.name == name) =>
        val (matched, rest) = grammar.rules.partition(_.name == name)
        Grammar(matched ++ rest)
      case _ => grammar

  // A terminal renders backtick-quoted (matching the grammar notation's own literal spelling and
  // the LR-walk ACTION line's format, M5+); a nonterminal renders bare; EOF as `$`.
  private def renderSym(s: GSym): String = s match
    case GSym.NonTerm(n) => n
    case GSym.Term(t)    => s"`$t`"
    case GSym.EOF        => "$"

  // The Lowered Core tab's data: the desugared grammar's flattened productions, each paired with
  // its original `{% %}` action text. `Table.productions` and `grammar.rules.flatMap(_.alts)` are
  // built by the same flatMap-over-rules-then-alts traversal (Table.scala's `productions`), so
  // zipping them by index pairs each resolved production with its source alternative correctly.
  // `alt.action` is Desugar.normalizeAction's WRAPPED form (`\_ _ _ -> (c) => ...`) — every
  // action gets this synthesized positional-binder prefix regardless of host language; it's an
  // internal codegen convenience (BackendJs strips it the same way before baking an action into
  // the generated evaluator), never something a grammar author should see reflected back at them.
  private def productionsOf(grammar: Grammar): Vector[ProductionInfo] =
    val prods = Table.productions(grammar)
    val alts = grammar.rules.flatMap(_.alts)
    prods.zip(alts).map { case (p, alt) =>
      ProductionInfo(p.lhs, p.rhs.map(renderSym), alt.action.map(BackendJs.unwrapBinder))
    }

  // The Lowered Core tab's ALL(*)-only section: the same two rewrites `Ll.parse`/`Ll.parseTraced`
  // run, in the same order, before lowering to an `Atn` — `PrecClimb.stratify` (a no-op unless the
  // grammar declares `## Precedence`), then `LeftRec.eliminate` (a no-op unless the grammar has
  // direct left recursion) — rendered via the same `productionsOf` every other production list uses,
  // so the Lab can show these transforms' actual output instead of asserting they happen invisibly.
  private def allStarLoweringOf(prec: Precedence, grammar: Grammar): AllStarLowering =
    val (stratified, _) = PrecClimb.stratify(grammar, prec)
    val (rewritten, _) = LeftRec.eliminate(stratified)
    AllStarLowering(productionsOf(stratified), productionsOf(rewritten))

  // The Grammar analysis tab's data: every method's state/conflict count (not just
  // `request.method` — the comparison table needs all three), FIRST/FOLLOW per rule, and a
  // railroad SVG per rule. Independent of `request.input`/`request.method`, like `productions`.
  // This runs on every `evaluate` call (every debounced keystroke), so it uses `statsForAll`
  // (one shared canonical-automaton build) rather than three separate `statsFor` calls — the
  // naive version was measurably slow enough under concurrent load to blow past this project's
  // Playwright test timeouts.
  private def analysisOf(prec: Precedence, grammar: Grammar): GrammarAnalysis =
    val perMethod = Table.statsForAll(prec, grammar).map { case (m, stats) =>
      m.toString -> MethodStatsInfo(stats.states, stats.conflicts.length)
    }

    val a = Table.analyze(grammar)
    val firstFollow = grammar.rules.map { r =>
      RuleFirstFollow(
        r.name,
        a.firsts.getOrElse(r.name, Set.empty).toVector.sorted.map(renderSym),
        a.follows.getOrElse(r.name, Set.empty).toVector.sorted.map(renderSym)
      )
    }

    // Built from the compiled (desugared) Grammar directly, not by re-parsing each rule's raw
    // .grmk.md fenced block the way `gramark fmt`'s sidecar SVGs do (that needs CLI-only
    // markdown-block parsing this cross-compiled module doesn't have) — see GrammarAnalysis's own
    // doc comment for the resulting, deliberate divergence (a desugared X+ shows its synthesized
    // list rule, not gramark fmt's native loop shape).
    val nts = Table.nontermSet(grammar)
    val railroad = grammar.rules.map { r =>
      val prod = Railroad.Production(
        r.name,
        r.alts.map(alt =>
          Railroad.Alt(alt.syms.map(s => toDiaSym(nts, s)), alt.action.map(BackendJs.unwrapBinder))
        )
      )
      r.name -> Railroad.renderSvg(prod, themed = true)
    }.toMap

    // The same classification `gramark explain-conflict` prints as CLI prose (`Glr.explainP`),
    // computed once here and rendered live instead of only on demand — `reportOf` shares its
    // conflict counts with `Glr.explainP`'s own prose rendering, so the two never drift.
    val report = Glr.reportOf(prec, grammar)
    val verdictTag = report.verdict match
      case Glr.ConflictVerdict.ConflictFree          => "conflict-free"
      case Glr.ConflictVerdict.LalrArtifact          => "lalr-artifact"
      case Glr.ConflictVerdict.ResolvedByDeclaration => "resolved-by-declaration"
      case Glr.ConflictVerdict.Genuine               => "genuine"
    val verdict =
      ConflictVerdictInfo(verdictTag, report.withPrecedenceConflicts, report.genuineConflicts)

    GrammarAnalysis(perMethod, firstFollow, railroad, verdict)

  // The Evaluate tab's data (M5+): BackendJs.emitTraced's generated ES module source text — the
  // Worker dynamically imports and runs it, never this module (Scala never executes the grammar
  // author's JS). Uses IR.irGrammarOf, not the table-building IR.buildIRP/buildIR — irGrammarOf
  // reads only IR.grammar, no automaton, which is exactly why this runs under BOTH strategies:
  // it needs no LR table build to succeed (ll-star) and no ATN either (lr).
  // `Left` when the grammar declares a `{%? %}` predicate: neither runtime evaluates it — under
  // `lr` there's no prediction concept at all to give it meaning; under `ll-star`, `Ll.parseTraced`
  // still doesn't evaluate predicate bodies (ADR D42 tracks the effect, nothing consumes it yet) —
  // so either way the traced JS runtime would silently run the predicate's boolean-test expression
  // as if it were the production's value. No evaluator is a more honest result than a
  // confidently-wrong one.
  private def evaluatorJsFor(
      prec: Precedence,
      source: String,
      grammar: Grammar
  ): Either[String, String] =
    // No CLI-shaped `file` path exists in the Lab's browser context to fall back to; "grammar" is
    // only ever cosmetic (BackendJs's header comment), mirroring cli/jvm's own grammarName's H1
    // extraction (that helper is CLI-only, reading a file path this module doesn't have).
    val name =
      source.split("\n", -1).find(_.startsWith("# ")).map(_.drop(2).trim).getOrElse("grammar")
    val irGrammar = IR.irGrammarOf(prec, name, grammar)
    if irGrammar.rules.exists(_.predicate.isDefined) then
      Left(
        "a semantic predicate (`{%? %}`) is declared, but the Evaluate tab's traced JS runtime " +
          "doesn't evaluate predicates yet (ADR D42) — its body would run as an ordinary value " +
          "action instead, so no evaluator is generated for this grammar"
      )
    else
      val tagged = IR.withActionLangGrammar(Lr.actionLangOf(source), irGrammar)
      Right(BackendJs.emitTraced(tagged))

  // `evaluatorJsFor`'s Either, folded into the (evaluatorJs, extra-diagnostics) shape both
  // `evaluate` branches build their LabResponse from — shared so the predicate-warning rendering
  // can't drift between the two.
  private def evaluatorJsResult(
      prec: Precedence,
      source: String,
      grammar: Grammar
  ): (Option[String], Vector[DiagnosticInfo]) =
    evaluatorJsFor(prec, source, grammar) match
      case Right(js) => (Some(js), Vector.empty)
      case Left(msg) =>
        (None, Vector(DiagnosticInfo("warning", "internal", msg, None, Vector.empty, msg)))

  private def toDiaSym(nts: Set[String], s: Sym): Railroad.DiaSym = s match
    case Sym.Ref(name)       => Railroad.DiaSym(name, term = !nts.contains(name))
    case Sym.Lit(text)       => Railroad.DiaSym(text, term = true)
    case Sym.Field(_, inner) => toDiaSym(nts, inner)
    // Defensive only: sugar (Rep/Star/Opt/Macro/Group/Any/Not) is eliminated by Desugar before
    // LabApi ever sees this Grammar, so this arm should be unreachable in practice.
    case other => Railroad.DiaSym(other.toString, term = true)

  // The All-parses tab's data: every distinct parse of `input` under the GLR multi-action table for
  // `method`, action-free (Cst.cstToken/cstReduce — same driver callbacks the v1 Parse tree tab
  // uses), capped at `forestCap`. A lexical error yields an empty, non-truncated forest (Tokens/
  // Result already surface the lexical-error message; All-parses simply has nothing to show).
  private def forestFor(method: Method, grammar: Grammar, spanned: Vector[Spanned]): ForestResult =
    if Scanner.hasErrorSpanned(spanned) then ForestResult(Vector.empty, truncated = false)
    else
      val plainTokens = spanned.map(s => Token(s.terminal, s.text))
      val all = Glr.forest(method, grammar, plainTokens)
      val (capped, truncated) = capAt(all, forestCap)
      ForestResult(capped.map(Cst.toJson), truncated)

  // The grammar's own declared `## Tokens` block, or none — feeds `lexInput`, shared by
  // `forestFor`/`parseInput`/`parseInputLl`, all of which read the same target input lexed
  // against the same token definitions (one scan per `evaluate` call, not one each).
  private def tokenDefsOf(source: String): Vector[TokenDef] =
    ConformanceLexers.tokensBlock(source) match
      case Some(block) => Tokens.parseTokens(block).getOrElse(Vector.empty)
      case None        => Vector.empty

  private def lexInput(source: String, grammar: Grammar, input: String): Vector[Spanned] =
    val items = Scanner.buildItems(tokenDefsOf(source), ConformanceLexers.grammarLiterals(grammar))
    Scanner.scanSpanned(items, input)

  // The "expected one of: ..." note for an input-side parse rejection, from the compiled table's
  // own action row — the terminals are the TARGET grammar's own (whatever the author declared), so
  // unlike `Lr`'s own notation-parse errors, no friendly-name remapping is needed: they already read
  // in the author's terms.
  private def expectedNote(table: ParseTable, state: Int): Vector[String] =
    val expected =
      table.action.keys.collect { case (s, GSym.Term(t)) if s == state => t }.toVector.sorted
    if expected.isEmpty then Vector.empty
    else Vector("note: expected one of: " + expected.map(t => s"`$t`").mkString(", "))

  // Shared by `diagnosticForInputParseError`/`diagnosticForLlError`: the span for a rejection at
  // token position `pos`, or the last token's end (an end-of-input rejection has no token of its
  // own to point at).
  private def spanFor(spanned: Vector[Spanned], pos: Int): Option[SrcSpan] =
    spanned
      .lift(pos)
      .map(s => SrcSpan(s.start, s.end))
      .orElse(spanned.lastOption.map(s => SrcSpan(s.end, s.end)))

  private def diagnosticForInputParseError(
      e: ParseError,
      table: ParseTable,
      spanned: Vector[Spanned]
  ): Diagnostic =
    e match
      case ParseError.UnexpectedToken(state, terminal, pos) =>
        val shown = spanned.lift(pos).map(s => s"`${s.text}`").getOrElse(s"`$terminal`")
        Diagnostic.error(
          Stage.Parse,
          s"unexpected $shown",
          spanFor(spanned, pos),
          expectedNote(table, state)
        )
      case ParseError.UnexpectedEnd(state, pos) =>
        Diagnostic.error(
          Stage.Parse,
          "unexpected end of input",
          spanFor(spanned, pos),
          expectedNote(table, state)
        )
      case ParseError.InternalError(m) =>
        Diagnostic.error(Stage.Internal, s"internal error: $m; please report this")

  // Shared by `parseInput`/`parseInputLl`: both lex `input` against the grammar's own declared
  // `## Tokens` (or its implicit backtick-literal terminals alone, if it has none) the same way,
  // and reject identically on a lexical error — `Left` the already-built reject `ParseResult`
  // (tokens still populated — the Lab's Tokens tab should show something even here — cst never
  // is), `Right` the tokens for the caller's own engine-specific parse to consume. Only the two
  // callers' post-lex behavior (LR's `Parser`/`ll-star`'s `Ll`) actually differs.
  private def lexOrReject(
      input: String,
      spanned: Vector[Spanned]
  ): Either[ParseResult, (Vector[LabToken], Vector[Token])] =
    val labTokens = spanned.map(s => LabToken(s.text, s.terminal, s.start, s.end))
    if Scanner.hasErrorSpanned(spanned) then
      val errorRuns = Scanner.mergeErrorRuns(spanned)
      val d = errorRuns.headOption match
        case Some(s) =>
          Diagnostic.error(
            Stage.Lex,
            s"""unexpected character `${s.text}`""",
            Some(SrcSpan(s.start, s.end))
          )
        case None => Diagnostic.error(Stage.Lex, "lexical error in input")
      Left(
        ParseResult(
          accepted = false,
          message = Some(toDiagnosticInfo(d, inputSourceName, input, spanSafe = true)),
          labTokens,
          cst = None
        )
      )
    else Right((labTokens, spanned.map(s => Token(s.terminal, s.text))))

  // Run the compiled LR table over already-lexed `input`. `cst`/`trace` only populate on accept.
  private def parseInput(table: ParseTable, input: String, spanned: Vector[Spanned]): ParseResult =
    lexOrReject(input, spanned) match
      case Left(rejected) => rejected
      case Right((labTokens, plainTokens)) =>
        Parser.run(table, Cst.cstToken, Cst.cstReduce, plainTokens) match
          case Left(err) =>
            val d = diagnosticForInputParseError(err, table, spanned)
            ParseResult(
              accepted = false,
              message = Some(toDiagnosticInfo(d, inputSourceName, input, spanSafe = true)),
              labTokens,
              cst = None
            )
          case Right(cst) =>
            // walk and run are differentially tested to agree (core/src/test/scala/gramark/
            // ParserSuite.scala) — `.toOption` here is defensive, not expected to ever discard a
            // Left in practice, since run() just accepted the exact same table/tokens.
            val capped = Parser.walk(table, plainTokens).toOption.map(steps => capSteps(steps))
            ParseResult(
              accepted = true,
              message = None,
              labTokens,
              cst = Some(Cst.toJson(cst)),
              trace = capped.map { case (steps, _) => steps.map(toLrStepInfo) },
              traceTruncated = capped.exists { case (_, truncated) => truncated }
            )

  // The `ll-star` strategy's counterpart to `parseInput`: `Ll.parseTraced` instead of
  // `Parser.run`/`Parser.walk`, and `llTrace` instead of `trace` — same tokens-populated-on-reject,
  // cst/trace-only-on-accept lifecycle either way. `cache` is the one `evaluate` shares with the
  // ATN diagnostics tab, so its hit/miss/ambiguity counts describe this exact parse.
  private def parseInputLl(
      prec: Precedence,
      grammar: Grammar,
      input: String,
      spanned: Vector[Spanned],
      cache: AtnSim.Cache
  ): ParseResult =
    lexOrReject(input, spanned) match
      case Left(rejected) => rejected
      case Right((labTokens, plainTokens)) =>
        Ll.parseTraced(grammar, plainTokens, prec, cache) match
          case Left(err) =>
            val d = diagnosticForLlError(err, spanned)
            ParseResult(
              accepted = false,
              message = Some(toDiagnosticInfo(d, inputSourceName, input, spanSafe = true)),
              labTokens,
              cst = None
            )
          case Right((cst, steps)) =>
            val (capped, truncated) = capSteps(steps)
            ParseResult(
              accepted = true,
              message = None,
              labTokens,
              cst = Some(Cst.toJson(cst)),
              trace = None,
              llTrace = Some(capped.map(toLlStepInfo)),
              llTraceTruncated = truncated
            )

  // The ll-star analogue of `diagnosticForInputParseError`: `LlError.expected == Vector("$")`
  // means the walk completed a full parse but input remained — everywhere else, `expected` names
  // the terminal(s) that would have continued the parse at `pos`.
  private def diagnosticForLlError(err: LlError, spanned: Vector[Spanned]): Diagnostic =
    // `expected == Vector("$")` is the internal EOF sentinel (the walk completed a full parse but
    // input remained) — the message below already says so in plain language; a "note: expected
    // one of: `$`" alongside it would leak that sentinel to the user instead of naming a real
    // terminal, which is what this note means everywhere else.
    val expectedNote =
      if err.expected.isEmpty || err.expected == Vector("$") then Vector.empty
      else Vector("note: expected one of: " + err.expected.map(t => s"`$t`").mkString(", "))
    val message = spanned.lift(err.pos) match
      case Some(s) if err.expected == Vector("$") =>
        s"unexpected `${s.text}` after a complete parse"
      case Some(s) => s"unexpected `${s.text}`"
      case None    => "unexpected end of input"
    Diagnostic.error(Stage.Parse, message, spanFor(spanned, err.pos), expectedNote)

  // The Parse trace / LR walk tabs' data: gramark.LrStep, wire-rendered — GSym stack/remaining-
  // input symbols and the reduce action's rhs all go through `renderSym`, same as everywhere else
  // in this file.
  private def toLrStepInfo(step: LrStep): LrStepInfo =
    val action = step.action match
      case TraceAction.Shift(terminal, lexeme) =>
        LrActionInfo.Shift(renderSym(GSym.Term(terminal)), lexeme)
      case TraceAction.Reduce(lhs, rhs, prodIndex) =>
        LrActionInfo.Reduce(lhs, rhs.map(renderSym), prodIndex)
      case TraceAction.Accept => LrActionInfo.Accept
    LrStepInfo(
      step.index,
      step.stateBefore,
      action,
      step.stackSymbols.map(renderSym),
      step.remainingSymbols.map(renderSym)
    )

  // The LL walk tab's data: gramark.LlStep, wire-rendered — `ruleStack`/action fields are already
  // plain strings (rule names, terminal spellings), unlike LrStep's GSym stack, so no `renderSym`
  // pass is needed here.
  private def toLlStepInfo(step: LlStep): LlStepInfo =
    val action = step.action match
      case LlAction.Predict(rule, chosenAlt, altCount) =>
        LlActionInfo.Predict(rule, chosenAlt, altCount)
      case LlAction.Match(terminal, lexeme) => LlActionInfo.Match(terminal, lexeme)
      case LlAction.ExitRule(rule)          => LlActionInfo.ExitRule(rule)
      case LlAction.Accept                  => LlActionInfo.Accept
    LlStepInfo(step.index, step.ruleStack, action, step.pos)
