package gramaire.scratch

import java.nio.file.{Files, Path}
import java.util.Base64

// The fixed driver half of the `scala-peg` backend's execute-and-verify parity gate
// (`docs/all-star-port-plan.md`'s PEG-engine-plan Phase 3; the JVM oracle half is
// `cli/jvm/src/main/scala/gramaire/cli/ScalaPegParityMain.scala`). This file is the ONLY thing in
// this subproject that is ever committed — `Generated.scala` (the actual subject under test) is
// written fresh into this same package by `ScalaPegParityMain` before every run and is gitignored.
//
// Deliberately dependency-free, matching the generated code's own philosophy: no JSON library, no
// dependency on `gramaire-core` (this subproject exists specifically to prove the emitted Scala
// stands on its own — pulling in the compiler that emitted it would defeat the point). Tokens and
// results travel over a minimal line protocol instead (`ScalaPegParityMain`'s own doc spells it
// out): `VECTOR name` / `TOK terminal base64Text` lines / `ENDVECTOR`, one block per accept
// vector; base64 sidesteps a token's own text containing arbitrary characters without needing any
// escaping logic on either side.
object Main:
  private val startMarker = "===SCALA-PEG-ACTUAL-START==="
  private val endMarker = "===SCALA-PEG-ACTUAL-END==="

  private def b64(s: String): String = Base64.getEncoder.encodeToString(s.getBytes("UTF-8"))
  private def unb64(s: String): String = String(Base64.getDecoder.decode(s), "UTF-8")

  private final case class Vec(name: String, tokens: Vector[Generated.Token])

  // Mirrors `gramaire.Cst.render`/`showString` exactly (core/src/main/scala/gramaire/Cst.scala) —
  // duplicated, not imported, since this subproject must not depend on `gramaire-core` (see the
  // module header). Any drift between the two would only ever manifest as spurious parity
  // failures (this side rendering differently from what `ScalaPegParityMain` computes via the
  // real `gramaire.Cst.render`), never a silent false pass, so a copy is safe here.
  private def showString(s: String): String =
    val sb = StringBuilder("\"")
    s.foreach {
      case '"'  => sb.append("\\\"")
      case '\\' => sb.append("\\\\")
      case '\n' => sb.append("\\n")
      case '\r' => sb.append("\\r")
      case '\t' => sb.append("\\t")
      case c if c.toInt < 0x20 =>
        val n = c.toInt
        val digits = "0123456789abcdef"
        sb.append("\\u00").append(digits((n / 16) % 16)).append(digits(n % 16))
      case c => sb.append(c)
    }
    sb.append("\"").toString

  private def render(cst: Generated.Cst): String =
    def line(node: Generated.Cst): String = node match
      case Generated.Cst.Branch(p, _) => s"rule $p"
      case Generated.Cst.Token(t, s)  => s"$t ${showString(s)}"
    def indent(depth: Int): String = "  " * depth
    def go(depth: Int, node: Generated.Cst): String =
      indent(depth) + line(node) + (node match
        case Generated.Cst.Branch(_, kids) => kids.map(k => "\n" + go(depth + 1, k)).mkString
        case Generated.Cst.Token(_, _)     => ""
      )
    go(0, cst)

  private def parseVectors(lines: Vector[String]): Vector[Vec] =
    val buf = scala.collection.mutable.ArrayBuffer.empty[Vec]
    var name: Option[String] = None
    var toks = Vector.empty[Generated.Token]
    lines.foreach { line =>
      if line.startsWith("VECTOR ") then
        name = Some(line.stripPrefix("VECTOR "))
        toks = Vector.empty
      else if line == "ENDVECTOR" then
        name.foreach(n => buf += Vec(n, toks))
        name = None
      else if line.startsWith("TOK ") then
        line.stripPrefix("TOK ").split(" ", 2) match
          case Array(terminal, text) => toks :+= Generated.Token(terminal, unb64(text))
          case _                     => ()
    }
    buf.toVector

  def main(args: Array[String]): Unit =
    args match
      case Array(vectorsPath) =>
        val lines = Files.readAllLines(Path.of(vectorsPath)).toArray(Array.empty[String]).toVector
        val vectors = parseVectors(lines)
        println(startMarker)
        vectors.foreach { v =>
          Generated.parse(v.tokens) match
            case Some(cst) => println(s"RESULT ${v.name} ACCEPT ${b64(render(cst))}")
            case None      => println(s"RESULT ${v.name} REJECT")
        }
        println(endMarker)
      case _ =>
        System.err.println("usage: gramaire.scratch.Main <vectorsPath>")
        sys.exit(1)
