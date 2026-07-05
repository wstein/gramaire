package gramark.lab

// LabProtocol — the typed JSON boundary the in-browser Lab talks to across
// the Scala.js/Worker seam (docs/playground-spec.md §5.1). JSON strings
// across the @JSExportTopLevel boundary, not typed Scala.js facades —
// matching how the worker protocol is already described there, and
// avoiding facade-interop complexity for what's really just structured
// data. Encoders/decoders are hand-written, matching gramark.Json's own
// convention: this codebase has no `derives`-based codec mechanism, so
// every encoder (e.g. Cst.toJson) is a manual pattern match, and each
// type's codec lives in that type's own companion object.
//
// Started as the M4 v1 slice — sized to the four v1 tabs (Result, Tokens,
// Parse tree, Diagnostics). LabResponse.version exists so M5+ fields
// (productions, forest, and further additions for the remaining tabs) are
// additive, never a breaking change to what's already shipped — new fields
// default to None so pre-M5 callers/tests need no changes.

import gramark.{Json, Method}

/** A request from the Lab UI: the full .grmk.md source, an optional target-language input to parse,
  * the table-construction method to build with, an optional start-rule override, and the parse
  * strategy (`"lr"` — the default — or `"ll-star"`; `IR.withStrategy`'s own two values,
  * D-strategy). Under `"lr"`, `buildOk`/`parse`/`evaluatorJs` are driven by the LR table build, and
  * `atn`/`ParseResult.llTrace` are always absent. Under `"ll-star"`, `parse`/`evaluatorJs`/`atn`
  * are driven by `Ll.parseTraced` instead — a genuine alternate pipeline, not merely additive:
  * `buildOk` no longer depends on the LR table build succeeding (an LR conflict downgrades to a
  * warning instead, since ALL(*) resolves the same tie itself, by declaration order), and
  * `parse.trace` is always absent in favor of `parse.llTrace`. `forest`/`analysis` stay
  * LR/GLR-driven under both strategies — `method` always selects the automaton they're built from.
  */
final case class LabRequest(
    source: String,
    input: Option[String],
    method: Method,
    startRule: Option[String] = None,
    strategy: String = "lr"
)

object LabRequest:
  /** Decode a `LabRequest` from JSON — the one direction actually crossed at runtime (the Lab UI
    * sends a request; this module never needs to construct one FROM Scala and hand it to JS).
    */
  def fromJson(j: Json): Either[String, LabRequest] = j match
    case Json.JObject(kvs) =>
      val m = kvs.toMap
      for
        source <- m.get("source") match
          case Some(Json.JString(s)) => Right(s)
          case _                     => Left("LabRequest.source must be a string")
        input <- m.get("input") match
          case Some(Json.JString(s))   => Right(Some(s))
          case Some(Json.JNull) | None => Right(None)
          case _                       => Left("LabRequest.input must be a string or null")
        method <- m.get("method") match
          case Some(mj) => methodFromJson(mj)
          case None     => Left("LabRequest.method is required")
        startRule <- m.get("startRule") match
          case Some(Json.JString(s))   => Right(Some(s))
          case Some(Json.JNull) | None => Right(None)
          case _                       => Left("LabRequest.startRule must be a string or null")
        strategy <- m.get("strategy") match
          case Some(Json.JString(s)) if s == "lr" || s == "ll-star" => Right(s)
          case Some(Json.JString(other)) => Left(s"unknown strategy: $other")
          case Some(Json.JNull) | None   => Right("lr")
          case _                         => Left("LabRequest.strategy must be a string")
      yield LabRequest(source, input, method, startRule, strategy)
    case _ => Left("LabRequest must be a JSON object")

  private def methodFromJson(j: Json): Either[String, Method] = j match
    case Json.JString("Canonical") => Right(Method.Canonical)
    case Json.JString("LALR")      => Right(Method.LALR)
    case Json.JString("IELR")      => Right(Method.IELR)
    case Json.JString(other)       => Left(s"unknown method: $other")
    case _                         => Left("LabRequest.method must be a string")

/** `gramark.SrcSpan`, wire-rendered — a `[start, end)` code-unit span into whichever source text
  * the owning `DiagnosticInfo` is relative to (the grammar source, or `LabRequest.input`).
  */
final case class SrcSpanInfo(start: Int, end: Int)

object SrcSpanInfo:
  def toJson(s: SrcSpanInfo): Json =
    Json.JObject(Vector("start" -> Json.JInt(s.start), "end" -> Json.JInt(s.end)))

/** `gramark.Diagnostic`, wire-rendered: severity/stage as lowercase strings, an optional span, the
  * note/help lines verbatim, and `rendered` — the SAME plain-text `Diagnostic.render` output the
  * CLI prints, included so the Lab UI has a zero-effort fallback (and so the JVM<->JS parity gate
  * byte-compares the shared renderer's output on both platforms, not just the structured fields).
  */
final case class DiagnosticInfo(
    severity: String,
    stage: String,
    message: String,
    span: Option[SrcSpanInfo],
    notes: Vector[String],
    rendered: String
)

object DiagnosticInfo:
  def toJson(d: DiagnosticInfo): Json =
    Json.JObject(
      Vector(
        "severity" -> Json.JString(d.severity),
        "stage" -> Json.JString(d.stage),
        "message" -> Json.JString(d.message),
        "span" -> d.span.map(SrcSpanInfo.toJson).getOrElse(Json.JNull),
        "notes" -> Json.JArray(d.notes.map(Json.JString.apply)),
        "rendered" -> Json.JString(d.rendered)
      )
    )

/** A single lexed token from the Lab's Tokens tab, with its source span (start/end are code-unit
  * offsets into `LabRequest.input`, matching `gramark.Spanned`'s own convention).
  */
final case class LabToken(text: String, terminal: String, start: Int, end: Int)

object LabToken:
  def toJson(t: LabToken): Json =
    Json.JObject(
      Vector(
        "text" -> Json.JString(t.text),
        "terminal" -> Json.JString(t.terminal),
        "start" -> Json.JInt(t.start),
        "end" -> Json.JInt(t.end)
      )
    )

/** One step of an LR walk (`gramark.LrStep`, wire-rendered): the action taken and the parse
  * stack/remaining-input state *before* taking it — the Parse trace tab's flat numbered list and
  * the LR walk tab's stepper both read the same `trace` array, one rendering it as a table, the
  * other adding prev/next/slider navigation over it.
  */
final case class LrStepInfo(
    index: Int,
    stateBefore: Int,
    action: LrActionInfo,
    stackSymbols: Vector[String],
    remainingSymbols: Vector[String]
)

object LrStepInfo:
  def toJson(s: LrStepInfo): Json =
    Json.JObject(
      Vector(
        "index" -> Json.JInt(s.index),
        "stateBefore" -> Json.JInt(s.stateBefore),
        "action" -> LrActionInfo.toJson(s.action),
        "stackSymbols" -> Json.JArray(s.stackSymbols.map(Json.JString.apply)),
        "remainingSymbols" -> Json.JArray(s.remainingSymbols.map(Json.JString.apply))
      )
    )

/** `gramark.TraceAction`, wire-rendered as a `kind`-tagged object (`rhs`/`terminal` already
  * display-rendered like `ProductionInfo.rhs`).
  */
enum LrActionInfo:
  case Shift(terminal: String, lexeme: String)
  case Reduce(lhs: String, rhs: Vector[String], prodIndex: Int)
  case Accept

object LrActionInfo:
  def toJson(a: LrActionInfo): Json = a match
    case LrActionInfo.Shift(terminal, lexeme) =>
      Json.JObject(
        Vector(
          "kind" -> Json.JString("shift"),
          "terminal" -> Json.JString(terminal),
          "lexeme" -> Json.JString(lexeme)
        )
      )
    case LrActionInfo.Reduce(lhs, rhs, prodIndex) =>
      Json.JObject(
        Vector(
          "kind" -> Json.JString("reduce"),
          "lhs" -> Json.JString(lhs),
          "rhs" -> Json.JArray(rhs.map(Json.JString.apply)),
          "prodIndex" -> Json.JInt(prodIndex)
        )
      )
    case LrActionInfo.Accept =>
      Json.JObject(Vector("kind" -> Json.JString("accept")))

/** One step of an ALL(*) walk (`gramark.LlStep`, wire-rendered): the `lr` walk's ll-star
  * counterpart. `ruleStack` is bottom to top, including the rule the action concerns — the LL walk
  * tab's stepper renders it where the LR walk tab renders `LrStepInfo.stackSymbols`. `Predict.rule`
  * names the rule the walk actually descends (a `LeftRec`-folded tail rule or
  * `PrecClimb`-stratified level, not the original grammar rule an alt may fold back to on the
  * `Cst`).
  */
final case class LlStepInfo(index: Int, ruleStack: Vector[String], action: LlActionInfo, pos: Int)

object LlStepInfo:
  def toJson(s: LlStepInfo): Json =
    Json.JObject(
      Vector(
        "index" -> Json.JInt(s.index),
        "ruleStack" -> Json.JArray(s.ruleStack.map(Json.JString.apply)),
        "action" -> LlActionInfo.toJson(s.action),
        "pos" -> Json.JInt(s.pos)
      )
    )

/** `gramark.LlAction`, wire-rendered as a `kind`-tagged object, mirroring `LrActionInfo`'s shape.
  */
enum LlActionInfo:
  case Predict(rule: String, chosenAlt: Int, altCount: Int)
  case Match(terminal: String, lexeme: String)
  case ExitRule(rule: String)
  case Accept

object LlActionInfo:
  def toJson(a: LlActionInfo): Json = a match
    case LlActionInfo.Predict(rule, chosenAlt, altCount) =>
      Json.JObject(
        Vector(
          "kind" -> Json.JString("predict"),
          "rule" -> Json.JString(rule),
          "chosenAlt" -> Json.JInt(chosenAlt),
          "altCount" -> Json.JInt(altCount)
        )
      )
    case LlActionInfo.Match(terminal, lexeme) =>
      Json.JObject(
        Vector(
          "kind" -> Json.JString("match"),
          "terminal" -> Json.JString(terminal),
          "lexeme" -> Json.JString(lexeme)
        )
      )
    case LlActionInfo.ExitRule(rule) =>
      Json.JObject(Vector("kind" -> Json.JString("exitRule"), "rule" -> Json.JString(rule)))
    case LlActionInfo.Accept =>
      Json.JObject(Vector("kind" -> Json.JString("accept")))

/** The outcome of parsing `LabRequest.input` against the compiled grammar. `tokens` is populated
  * even on a reject (so the Tokens tab still has something to show); `cst` is `None` unless
  * `accepted`. `trace` (the LR walk) and `llTrace` (the ll-star walk) are mutually exclusive —
  * `LabRequest.strategy` decides which one a given response ever populates, never both — and both
  * share `cst`'s accepted-only lifecycle (a rejected/incomplete parse has no walk to show), which
  * is why they live here rather than as a top-level `LabResponse` field the way `forest` does
  * (forest's whole reason to exist is showing data when `buildOk` is false — trace/llTrace have no
  * equivalent case: `buildOk` under ll-star never blocks a parse attempt in the first place).
  * `traceTruncated`/`llTraceTruncated` mirror `ForestResult.truncated`: true when the real walk had
  * more steps than `trace`/`llTrace` holds (LabApi's `traceCap`), so the UI can say so instead of a
  * capped walk silently ending mid-parse with no indication anything was cut.
  */
final case class ParseResult(
    accepted: Boolean,
    message: Option[DiagnosticInfo],
    tokens: Vector[LabToken],
    cst: Option[Json],
    trace: Option[Vector[LrStepInfo]] = None,
    traceTruncated: Boolean = false,
    llTrace: Option[Vector[LlStepInfo]] = None,
    llTraceTruncated: Boolean = false
)

object ParseResult:
  def toJson(p: ParseResult): Json =
    Json.JObject(
      Vector(
        "accepted" -> Json.JBool(p.accepted),
        "message" -> p.message.map(DiagnosticInfo.toJson).getOrElse(Json.JNull),
        "tokens" -> Json.JArray(p.tokens.map(LabToken.toJson)),
        "cst" -> p.cst.getOrElse(Json.JNull),
        "trace" -> p.trace.map(ts => Json.JArray(ts.map(LrStepInfo.toJson))).getOrElse(Json.JNull),
        "traceTruncated" -> Json.JBool(p.traceTruncated),
        "llTrace" -> p.llTrace
          .map(ts => Json.JArray(ts.map(LlStepInfo.toJson)))
          .getOrElse(Json.JNull),
        "llTraceTruncated" -> Json.JBool(p.llTraceTruncated)
      )
    )

/** What kind of grammar symbol a `RenderedSymbol` is — a rule reference, a named token, a literal
  * string terminal, or the end-of-input marker. `Literal`/`Token` are the one distinction
  * `LabApi.renderSym`'s own string-only rendering (still used for `LrActionInfo`, unchanged) cannot
  * make: both render backtick-quoted identically there, because `Table.scala`'s `GSym.Term` (the
  * type both renderers read) already collapses that distinction into one untyped name before
  * FIRST/FOLLOW or the LR tables are even built — recovering it for DISPLAY means classifying by
  * name from the grammar's own pre-`GSym` `Sym` tree instead (`LabApi.classifyTerminals`), never
  * touching `Table.scala`'s own symbol type or the algorithm built on it.
  */
enum SymbolKind:
  case Literal, Token, Nonterminal, Eof

object SymbolKind:
  def toJson(k: SymbolKind): Json = Json.JString(k match
    case SymbolKind.Literal     => "literal"
    case SymbolKind.Token       => "token"
    case SymbolKind.Nonterminal => "nonterminal"
    case SymbolKind.Eof         => "eof"
  )

/** One grammar symbol as it appears in a production's RHS or a rule's FIRST/FOLLOW set — `text` is
  * the same display spelling `ProductionInfo`'s own rendering always used (a terminal's own
  * spelling with no surrounding backticks, a nonterminal's own bare name, `$` for `Eof`), now
  * paired with `kind` so a client can style each symbol by category (e.g. matching
  * `Railroad.scala`'s own terminal/nonterminal visual split) without re-deriving it from `text`'s
  * shape.
  */
final case class RenderedSymbol(text: String, kind: SymbolKind)

object RenderedSymbol:
  def toJson(s: RenderedSymbol): Json =
    Json.JObject(Vector("text" -> Json.JString(s.text), "kind" -> SymbolKind.toJson(s.kind)))

/** One flattened production of the compiled (already-desugared) grammar — the Lowered Core tab's
  * row shape, and the per-production `{% %}` action text the Evaluate tab's reductions list looks
  * up by index (M5+, avoiding a second copy of the same action text in the wire format). `lhs` is
  * always a nonterminal's own bare name (a production's LHS, by construction); `rhs` is each
  * symbol's own display rendering plus its kind — see `RenderedSymbol`.
  */
final case class ProductionInfo(lhs: String, rhs: Vector[RenderedSymbol], action: Option[String])

object ProductionInfo:
  def toJson(p: ProductionInfo): Json =
    Json.JObject(
      Vector(
        "lhs" -> Json.JString(p.lhs),
        "rhs" -> Json.JArray(p.rhs.map(RenderedSymbol.toJson)),
        "action" -> p.action.map(Json.JString.apply).getOrElse(Json.JNull)
      )
    )

/** The ALL(*) engine's own internal rewrite of the Lowered Core tab's productions — the same two
  * grammar transforms `Ll.parse`/`Ll.parseTraced` run before lowering to an `Atn`
  * (`PrecClimb.stratify`, then `LeftRec.eliminate`), rendered the same production-list way as
  * `productions` instead of staying invisible. Present whenever `productions` is (independent of
  * Engine/strategy — this describes the grammar's structure, not which engine the request happened
  * to ask for), so the Lab can show the actual before/after rewrite rather than asserting it
  * happens. `afterPrecedence` is `productions` unchanged whenever the grammar declares no `##
  * Precedence` (`PrecClimb.stratify` is then a no-op); `afterLeftRecursion` is `afterPrecedence`
  * unchanged whenever the grammar has no direct left recursion (`LeftRec.eliminate` is then a
  * no-op) — the Lab only renders a section when it actually differs from the stage before it.
  */
final case class AllStarLowering(
    afterPrecedence: Vector[ProductionInfo],
    afterLeftRecursion: Vector[ProductionInfo]
)

object AllStarLowering:
  def toJson(a: AllStarLowering): Json =
    Json.JObject(
      Vector(
        "afterPrecedence" -> Json.JArray(a.afterPrecedence.map(ProductionInfo.toJson)),
        "afterLeftRecursion" -> Json.JArray(a.afterLeftRecursion.map(ProductionInfo.toJson))
      )
    )

/** The All-parses tab's data: every distinct parse of `LabRequest.input` under the GLR multi-action
  * table (`Glr.forest`), capped so a wildly ambiguous grammar can't blow up the response —
  * `truncated` is true when more parses existed than `parses` holds.
  */
final case class ForestResult(parses: Vector[Json], truncated: Boolean)

object ForestResult:
  def toJson(f: ForestResult): Json =
    Json.JObject(
      Vector("parses" -> Json.JArray(f.parses), "truncated" -> Json.JBool(f.truncated))
    )

/** One table-construction method's automaton size and conflict count (`Table.MethodStats`,
  * wire-rendered — `conflicts` is a count here, not the `Vector[Conflict]` Diagnostics already
  * renders elsewhere in this response).
  */
final case class MethodStatsInfo(states: Int, conflicts: Int)

object MethodStatsInfo:
  def toJson(m: MethodStatsInfo): Json =
    Json.JObject(Vector("states" -> Json.JInt(m.states), "conflicts" -> Json.JInt(m.conflicts)))

/** One nonterminal's FIRST/FOLLOW sets, each symbol rendered the same way as `ProductionInfo.rhs`
  * (text + kind — see `RenderedSymbol`). `kind` here is only ever `Literal`/`Token`/`Eof`, never
  * `Nonterminal`: a FIRST/FOLLOW set describes which real input tokens can appear, never which
  * rules can.
  */
final case class RuleFirstFollow(
    name: String,
    first: Vector[RenderedSymbol],
    follow: Vector[RenderedSymbol]
)

object RuleFirstFollow:
  def toJson(r: RuleFirstFollow): Json =
    Json.JObject(
      Vector(
        "name" -> Json.JString(r.name),
        "first" -> Json.JArray(r.first.map(RenderedSymbol.toJson)),
        "follow" -> Json.JArray(r.follow.map(RenderedSymbol.toJson))
      )
    )

/** `Glr.ConflictVerdict`, wire-rendered as its tag name (`"conflict-free"` | `"lalr-artifact"` |
  * `"resolved-by-declaration"` | `"genuine"`), alongside the conflict count that survives with the
  * grammar's own declared precedence applied and, for a genuine conflict, its
  * `Diagnostics`-rendered description — the same classification `gramark explain-conflict` prints
  * as CLI prose (`Glr.explainP`), surfaced live in the Lab as the grammar is edited instead of only
  * on demand from the CLI.
  */
final case class ConflictVerdictInfo(
    verdict: String,
    withPrecedenceConflicts: Int,
    genuineConflicts: Vector[String]
)

object ConflictVerdictInfo:
  def toJson(v: ConflictVerdictInfo): Json =
    Json.JObject(
      Vector(
        "verdict" -> Json.JString(v.verdict),
        "withPrecedenceConflicts" -> Json.JInt(v.withPrecedenceConflicts),
        "genuineConflicts" -> Json.JArray(v.genuineConflicts.map(Json.JString.apply))
      )
    )

/** The Grammar analysis tab's data (M5+, `docs/playground-spec.md` T2.1/T2.3): every method's
  * state/conflict count (not just the requested `LabRequest.method`, so the tab can render the
  * three-method comparison without a re-request), FIRST/FOLLOW per rule, a railroad SVG per rule,
  * and the conflict-classification verdict. `railroad` is built from the compiled
  * (already-desugared) `Grammar` directly rather than re-parsing each rule's raw `.grmk.md` fenced
  * block the way `gramark fmt`'s sidecar SVGs do — a deliberate divergence: a desugared `X+`
  * renders as a reference to its synthesized list rule instead of `gramark fmt`'s native loop
  * shape. Acceptable for a live in-browser view; not meant to replace the committed sidecar SVGs
  * `.grmk.md` documents embed.
  */
final case class GrammarAnalysis(
    perMethod: Map[String, MethodStatsInfo],
    firstFollow: Vector[RuleFirstFollow],
    railroad: Map[String, String],
    verdict: ConflictVerdictInfo
)

object GrammarAnalysis:
  def toJson(a: GrammarAnalysis): Json =
    Json.JObject(
      Vector(
        "perMethod" -> Json.JObject(a.perMethod.toVector.map { case (k, v) =>
          k -> MethodStatsInfo.toJson(v)
        }),
        "firstFollow" -> Json.JArray(a.firstFollow.map(RuleFirstFollow.toJson)),
        "railroad" -> Json.JObject(a.railroad.toVector.map { case (k, v) => k -> Json.JString(v) }),
        "verdict" -> ConflictVerdictInfo.toJson(a.verdict)
      )
    )

/** One `AtnSim.Ambiguity`, wire-rendered: a decision the ALL(*) predictor couldn't resolve down to
  * one alternative on its own, resolved by declaration order instead (first-alt-wins) — the same
  * notion `gramark conformance`'s `ll-star:` lines report per corpus, here surfaced per grammar/
  * input in the Lab instead.
  */
final case class AmbiguityInfo(rule: String, decision: Int, pos: Int, alts: Vector[Int])

object AmbiguityInfo:
  def toJson(a: AmbiguityInfo): Json =
    Json.JObject(
      Vector(
        "rule" -> Json.JString(a.rule),
        "decision" -> Json.JInt(a.decision),
        "pos" -> Json.JInt(a.pos),
        "alts" -> Json.JArray(a.alts.map(Json.JInt.apply))
      )
    )

/** The ATN diagnostics tab's data, under `LabRequest.strategy == "ll-star"`: whether
  * `Ll.parseTraced` accepts `LabRequest.input` (mirroring `parse.accepted`), the DFA prediction
  * cache's hit/miss counts, and every declaration-order-resolved ambiguity hit along the way — from
  * the SAME `AtnSim.Cache(track = true)` run that produced `parse`, not a separate one (so the
  * numbers describe the actual parse, not a shadow recognizer run against the same input).
  * Populated only when `input` is given.
  */
final case class AtnDiagnostics(
    accepted: Boolean,
    hits: Int,
    misses: Int,
    ambiguities: Vector[AmbiguityInfo]
)

object AtnDiagnostics:
  def toJson(d: AtnDiagnostics): Json =
    Json.JObject(
      Vector(
        "accepted" -> Json.JBool(d.accepted),
        "hits" -> Json.JInt(d.hits),
        "misses" -> Json.JInt(d.misses),
        "ambiguities" -> Json.JArray(d.ambiguities.map(AmbiguityInfo.toJson))
      )
    )

/** One ```gramark fence's role and line span in `LabRequest.source`'s own raw text — the Live
  * Document notebook's cell boundaries and role badge (Settings/Tokens/Precedence/Rule), computed
  * by `Lr.classifyFenceContent`'s "case is law" content-shape rule (the SAME oracle the CLI's
  * structure gate uses, D29/D43) rather than re-inferred in TypeScript. Present whenever the source
  * has at least one ```gramark fence, independent of whether the grammar notation parses — a broken
  * grammar still shows correct cell boundaries to fix it by. Empty for a fence-free native `.grmk`
  * source (there is simply no ```gramark marker to find there); the notebook view only applies to
  * `.grmk.md` sources. `startLine`/`endLine` are 1-based and inclusive, spanning the opening
  * \```gramark marker line through the closing ``` marker line, in `source`'s own line numbering
  * (never a `Lr.toFenced` projection's), matching what the Lab frontend's textarea — which only
  * ever holds the raw source — can navigate/highlight directly.
  */
final case class FenceInfo(
    index: Int,
    kind: String,
    nonterminal: Option[String],
    startLine: Int,
    endLine: Int
)

object FenceInfo:
  def toJson(f: FenceInfo): Json =
    Json.JObject(
      Vector(
        "index" -> Json.JInt(f.index),
        "kind" -> Json.JString(f.kind),
        "nonterminal" -> f.nonterminal.map(Json.JString.apply).getOrElse(Json.JNull),
        "startLine" -> Json.JInt(f.startLine),
        "endLine" -> Json.JInt(f.endLine)
      )
    )

/** The Lab's full response: whether the grammar itself built, any diagnostics, and — if input was
  * given and the grammar built — the parse result. `evaluatorJs` (the Evaluate tab's data, M5+) is
  * `BackendJs.emitTraced`'s generated ES module SOURCE TEXT, not a computed value — the Worker
  * dynamically imports and runs it client-side, since running arbitrary grammar-author JS is
  * inherently a Worker-thread, not a Scala, concern (the same boundary `gramark emit --backend js`
  * already crosses when a user runs the downloaded file themselves).
  */
final case class LabResponse(
    labProtocolVersion: Int,
    buildOk: Boolean,
    diagnostics: Vector[DiagnosticInfo],
    parse: Option[ParseResult],
    productions: Option[Vector[ProductionInfo]] = None,
    forest: Option[ForestResult] = None,
    analysis: Option[GrammarAnalysis] = None,
    evaluatorJs: Option[String] = None,
    atn: Option[AtnDiagnostics] = None,
    allStarLowering: Option[AllStarLowering] = None,
    fences: Vector[FenceInfo] = Vector.empty
)

object LabResponse:
  /** The schema version of the serialized LabResponse document (spec/lab-protocol-schema.json).
    * Bumped 0 -> 1 for the `diagnostics`/`parse.message` shape change (a plain string ->
    * `DiagnosticInfo`, carrying severity/stage/span/notes) — version 0 was documented draft/
    * unstable with no compatibility promise, and the site is this protocol's only consumer,
    * deployed from the same repo/commit, so this is a clean break rather than an additive field.
    */
  val version: Int = 1

  def toJson(r: LabResponse): Json =
    Json.JObject(
      Vector(
        "labProtocolVersion" -> Json.JInt(r.labProtocolVersion),
        "buildOk" -> Json.JBool(r.buildOk),
        "diagnostics" -> Json.JArray(r.diagnostics.map(DiagnosticInfo.toJson)),
        "parse" -> r.parse.map(ParseResult.toJson).getOrElse(Json.JNull),
        "productions" -> r.productions
          .map(ps => Json.JArray(ps.map(ProductionInfo.toJson)))
          .getOrElse(Json.JNull),
        "forest" -> r.forest.map(ForestResult.toJson).getOrElse(Json.JNull),
        "analysis" -> r.analysis.map(GrammarAnalysis.toJson).getOrElse(Json.JNull),
        "evaluatorJs" -> r.evaluatorJs.map(Json.JString.apply).getOrElse(Json.JNull),
        "atn" -> r.atn.map(AtnDiagnostics.toJson).getOrElse(Json.JNull),
        "allStarLowering" -> r.allStarLowering
          .map(AllStarLowering.toJson)
          .getOrElse(Json.JNull),
        "fences" -> Json.JArray(r.fences.map(FenceInfo.toJson))
      )
    )

  /** Serialize a LabResponse to canonical JSON text (no trailing newline) — the wire format
    * returned across the @JSExportTopLevel boundary, and what the JVM↔JS parity gate byte-compares
    * (docs/playground-spec.md §8).
    */
  def serialize(r: LabResponse): String = Json.stringify(toJson(r))
