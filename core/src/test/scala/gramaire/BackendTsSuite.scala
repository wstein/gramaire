package gramaire

import Sym.*

// Ported from the structural half of test/Test/Backend/Ts.purs.
// The drift-locked golden (real `lr` grammar's .ts/.d.ts) lives in the
// JVM-only BackendGoldenSuite.
class BackendTsSuite extends munit.FunSuite:

  // A labeled alternative drives a label-named Visitor method (D24).
  private val labeled = Grammar(
    Vector(
      Rule(
        "E",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("NUM"), Lit("+"), Ref("NUM")), Some("Add"), None),
          Alt(Vector(Ref("NUM")), Some("Lit"), None)
        )
      )
    )
  )

  test("ts: the emitted module carries tables, a driver, and a typed Visitor") {
    IR.buildIR(Method.Canonical, "E", labeled) match
      case Left(_) => fail("labeled grammar should build")
      case Right(ir) =>
        val src = BackendTs.emit(ir)
        assert(src.contains("const ACTION:"), "has the ACTION table")
        assert(src.contains("const GOTO:"), "has the GOTO table")
        assert(src.contains("const PRODS:"), "has the PRODS table")
        assert(
          src.contains("export function parse(tokens: Token[]): CstNode"),
          "has the parse driver"
        )
        assert(src.contains("export interface Visitor<T>"), "has a typed Visitor")
        assert(
          src.contains("Add(children: T[]): T;"),
          "names the Visitor method after the label (D24)"
        )
        assert(src.contains("export function fold<T>"), "has the fold catamorphism")
        val dts = BackendTs.emitDts(ir)
        assert(dts.contains("export declare function parse"), ".d.ts declares parse")
        assert(dts.contains("export interface Visitor<T>"), ".d.ts declares the Visitor")
  }
