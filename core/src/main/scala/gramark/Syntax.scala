package gramark

// The grammar AST: the shape every `lr` block parses into, and the value
// the table builder consumes. Deliberately tiny — it is the contract
// between the (eventually self-hosted) parser and the rest of the tool.
// Ported from src/Gramark/Syntax.purs.

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

// An alternative: a sequence of right-hand symbols, an optional `# Label`
// naming the alternative (per-alternative visitor methods and CST
// accessors, ADR D26), and an optional semantic action kept as raw source
// text for emission.
final case class Alt(syms: Vector[Sym], label: Option[String], action: Option[String])

// A rule: a left-hand nonterminal name, its `#[attr]` attributes (e.g.
// `inline`, ADR D28), and its alternatives.
final case class Rule(name: String, attrs: Vector[String], alts: Vector[Alt])

// A grammar is an ordered list of rules.
//
// Structural equality (free via `derives CanEqual` + case-class/enum
// equals) lets the self-hosting test assert that the parser, once
// generated, reads `lr.grmk.md` back to a value equal to the literal.
final case class Grammar(rules: Vector[Rule]) derives CanEqual
