package gramaire.cli

import java.nio.file.Files
import java.nio.file.Path
import gramaire.Railroad

class RailroadGoldenSuite extends munit.FunSuite:
  private def read(path: String): String = Files.readString(Path.of(path))

  test("renderSvg: calc Expr stays byte-identical to the committed sidecar SVG") {
    val prod = Railroad.parseProduction(
      "Expr : Expr '+' Term | Expr '-' Term | Term",
      Set("Expr", "Term", "Factor")
    )
    assertEquals(Railroad.renderSvg(prod), read("examples/diagrams-calc/expr.svg"))
  }

  test("renderSvg: calc Term stays byte-identical to the committed sidecar SVG") {
    val prod = Railroad.parseProduction(
      "Term : Term '*' Factor | Term '/' Factor | Factor",
      Set("Expr", "Term", "Factor")
    )
    assertEquals(Railroad.renderSvg(prod), read("examples/diagrams-calc/term.svg"))
  }
