package gramaire

// The grammar AST: the shape every `lr` block parses into, and the value
// the table builder consumes. Deliberately tiny — it is the contract
// between the (eventually self-hosted) parser and the rest of the tool.
// Ported from src/Gramaire/Syntax.purs.

// A right-hand-side symbol exactly as written in the grammar.
enum Sym derives CanEqual:
  case Ref(name: String) // a name: resolves to a nonterminal or a lexer token class
  case Lit(text: String) // a backtick terminal literal, e.g. ":" or "+"
  case Rep(sym: Sym) // one-or-more sugar (X+); eliminated by Desugar
  case Star(sym: Sym) // zero-or-more sugar (X*); eliminated by Desugar
  case Opt(sym: Sym) // zero-or-one sugar (X?); eliminated by Desugar
  case Macro(name: String, args: Vector[Sym]) // a macro call Name<args>
  case Field(name: String, sym: Sym) // a named child position name:X; the name reaches the IR
  case Group(
      alts: Vector[Vector[Sym]]
  ) // a parenthesised group ( a | b ); hoisted to a fresh rule by Desugar
  case Any // the `.` wildcard: any one terminal; lowered to a closed-alphabet group
  case Not(set: Vector[Sym]) // negation ~X / ~(a|b): any terminal not in the set

object Sym:
  /** Every nonterminal/terminal name transitively referenced inside a symbol (a `name:X` field is
    * transparent; a literal contributes nothing). Shared by every pass that needs to know what a
    * symbol mentions — reference-checking (`Diagnostics.undefinedNonterminals`), self-reference
    * detection (`Lr`'s unused-token/precedence checks), and inline-rule cycle detection
    * (`Desugar`'s `#[inline]` expansion).
    */
  def refs(s: Sym): Vector[String] = s match
    case Sym.Ref(n)          => Vector(n)
    case Sym.Lit(_)          => Vector.empty
    case Sym.Rep(inner)      => refs(inner)
    case Sym.Star(inner)     => refs(inner)
    case Sym.Opt(inner)      => refs(inner)
    case Sym.Field(_, inner) => refs(inner)
    case Sym.Macro(_, args)  => args.flatMap(refs)
    case Sym.Group(alts)     => alts.flatMap(_.flatMap(refs))
    case Sym.Any             => Vector.empty
    case Sym.Not(set)        => set.flatMap(refs)

// A `-> IDENT` / `-> IDENT(args...)` alternative delegate (ADR D48, extended for parameterized
// args): `name` is the identifier after `->`; `args` is empty for the bare form, or each
// parenthesized argument's literal source text for the `-> IDENT(a, 'b', 42)` form — an
// identifier's name, a literal's unescaped content, or a number's digit string, in order.
final case class DelegateSpec(name: String, args: Vector[String])

// An alternative: a sequence of right-hand symbols, an optional `# Label`
// naming the alternative (per-alternative visitor methods and CST
// accessors, ADR D26), an optional semantic action kept as raw source
// text for emission, and an optional `-> IDENT` / `-> IDENT(args...)` delegate (ADR D48):
// mutually exclusive with `action` by construction (the grammar has no
// production combining both at once, so a document writing both is a
// parse error, not a runtime check) — the named implementation resolves
// either to a consumer-supplied implementation at runtime or, in a later
// phase, to a fenced implementation elsewhere in the same file.
final case class Alt(
    syms: Vector[Sym],
    label: Option[String],
    action: Option[String],
    delegate: Option[DelegateSpec] = None
)

// A rule: a left-hand nonterminal name, its `#[attr]` attributes (e.g.
// `inline`, ADR D28), its alternatives, and an optional leading doc-comment
// (ADR D39's cross-format comment round-trip — see `Lr.docCommentsOf`/
// `Lr.withDocComments`; never populated by `Lr.parseWith`/`parse` themselves,
// only by a caller that explicitly opts in).
final case class Rule(
    name: String,
    attrs: Vector[String],
    alts: Vector[Alt],
    doc: Option[String] = None
)

// A grammar is an ordered list of rules.
//
// Structural equality (free via `derives CanEqual` + case-class/enum
// equals) lets the self-hosting test assert that the parser, once
// generated, reads `Productions.gram.md` back to a value equal to the literal.
final case class Grammar(rules: Vector[Rule]) derives CanEqual
