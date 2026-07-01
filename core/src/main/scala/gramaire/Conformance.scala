package gramaire

import ConformanceLexers.Lexer

// A conformance harness: a corpus of grammars + accept/reject input
// vectors, run as a differential oracle across all three
// table-construction methods.
//
// A grammar is conformant on a vector iff every method (canonical
// LR(1), LALR(1), IELR(1)) agrees with the expected outcome. The corpus
// is descriptor-driven: each entry pairs a grammar with its own input
// `Lexer` and accept/reject vectors.
// Ported from src/Gramaire/Conformance.purs.

enum Outcome derives CanEqual:
  case Accept, Reject

object Outcome:
  extension (o: Outcome)
    def render: String = o match
      case Accept => "accept"
      case Reject => "reject"

// A test case: a name, an input snippet, and the expected outcome.
// (Named `TestVector`, not `Vector`, to avoid colliding with Scala's own
// collection type — the prior reference implementation had no such
// name clash.)
final case class TestVector(name: String, input: String, expect: Outcome)

// A corpus entry: a named language given by its grammar, its input
// `Lexer`, and the vectors to run.
final case class Descriptor(
    language: String,
    grammar: Grammar,
    lexer: Lexer,
    vectors: Vector[TestVector]
)

// The outcome of one vector under one method.
final case class VResult(
    language: String,
    name: String,
    method: String,
    expected: Outcome,
    actual: Outcome,
    pass: Boolean
)

final case class Summary(total: Int, passed: Int, failures: Vector[VResult])

object Conformance:
  /** The methods the differential oracle runs every vector through. */
  val methods: Vector[Method] = Vector(Method.Canonical, Method.LALR, Method.IELR)

  /** Parse an input snippet to a CST under the given method, with the supplied language `Lexer`, or
    * `Left` with a reason.
    */
  def parseCst(lexer: Lexer, method: Method, g: Grammar, input: String): Either[String, Cst] =
    lexer(input) match
      case Left(e) => Left(e)
      case Right(toks) =>
        Table.buildTablesFor(method, g) match
          case Left(_) => Left("grammar is not parseable by this method")
          case Right(table) =>
            Parser.run(table, Cst.cstToken, Cst.cstReduce, toks).left.map(_.render)

  /** Recognize an input snippet: accepted iff it parses. */
  def recognize(lexer: Lexer, method: Method, g: Grammar, input: String): Outcome =
    parseCst(lexer, method, g, input) match
      case Left(_)  => Outcome.Reject
      case Right(_) => Outcome.Accept

  /** Run every vector of one descriptor through every method. */
  def runSuite(d: Descriptor): Vector[VResult] =
    for
      v <- d.vectors
      m <- methods
    yield
      val actual = recognize(d.lexer, m, d.grammar, v.input)
      VResult(d.language, v.name, m.toString, v.expect, actual, actual == v.expect)

  /** Run a whole corpus of descriptors. */
  def runSuites(ds: Vector[Descriptor]): Vector[VResult] = ds.flatMap(runSuite)

  def summarize(rs: Vector[VResult]): Summary =
    Summary(rs.length, rs.count(_.pass), rs.filterNot(_.pass))

  /** The `calc` corpus: arithmetic that should and should not parse. */
  val calcVectors: Vector[TestVector] = Vector(
    TestVector("a single number", "42", Outcome.Accept),
    TestVector("a sum", "1+2", Outcome.Accept),
    TestVector("mixed precedence", "1+2*3", Outcome.Accept),
    TestVector("parentheses", "(1+2)*3", Outcome.Accept),
    TestVector("whitespace is skipped", "1 + 2 - 3", Outcome.Accept),
    TestVector("a trailing operator", "1+", Outcome.Reject),
    TestVector("a leading operator", "+1", Outcome.Reject),
    TestVector("an unbalanced paren", "(1+2", Outcome.Reject),
    TestVector("two numbers, no operator", "1 2", Outcome.Reject),
    TestVector("empty input", "", Outcome.Reject)
  )

  /** The `lr` grammar corpus: clearly-valid and clearly-invalid `lr` snippets. */
  val lrVectors: Vector[TestVector] = Vector(
    TestVector("single rule, literal rhs", "Foo\n: 'x'", Outcome.Accept),
    TestVector("two symbols on the rhs", "Foo\n: Bar 'x'", Outcome.Accept),
    TestVector("rule with a semantic action", "Foo\n: 'x' {% \\a -> a %}", Outcome.Accept),
    TestVector("two alternatives", "Foo\n: 'x'\n| 'y'", Outcome.Accept),
    TestVector("two rules", "A\n: 'x'\n\nB\n: 'y'", Outcome.Accept),
    TestVector("leading terminal, no lhs", "'x'", Outcome.Reject),
    TestVector("missing newline after lhs", "Foo Bar", Outcome.Reject),
    TestVector("colon but empty body", "Foo\n:", Outcome.Reject),
    TestVector("body starts with a bar", "Foo\n| 'x'", Outcome.Reject),
    TestVector("empty input", "", Outcome.Reject)
  )

  /** The `lr` corpus entry: the bootstrap grammar, the `lr` lexer, its vectors. */
  val lrDescriptor: Descriptor =
    Descriptor("lr", Bootstrap.bootstrapGrammar, ConformanceLexers.lrLexer, lrVectors)

  /** The `calc` corpus entry, given its grammar. */
  def calcDescriptor(g: Grammar): Descriptor =
    Descriptor("calc", g, ConformanceLexers.calcLexer, calcVectors)
