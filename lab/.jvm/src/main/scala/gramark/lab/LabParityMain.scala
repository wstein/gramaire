package gramark.lab

// A thin JVM entry point for the JVM<->JS parity gate (docs/playground-spec.md §8):
// site/scripts/check-lab-parity.mjs runs a fixed fixture list of LabRequests through this (via
// `sbt labJVM/runMain`) and through the linked labJS worker module under Node
// (site/public/lab/engine.mjs), byte-comparing the serialized LabResponse. LabApi.evaluate is the
// thing actually under test; this is not a CLI feature, just a shell that can be invoked from a
// script — matching how LabExports.scala (JS-only) wraps the same LabApi.evaluate for the Worker.
//
// Takes N request file paths (not stdin or inline JSON args): a temp-file-per-fixture is the
// simplest way for the calling script to hand over a multi-line grammar source without any
// shell-quoting/escaping concerns, and passing all N in one process avoids paying sbt/JVM startup
// overhead once per fixture. `Json.stringify` pretty-prints (multi-line, matching this codebase's
// canonical-JSON convention elsewhere), so each response is wrapped in distinct START/END marker
// lines — not just one delimiter — so the caller can extract it with a start/end regex regardless
// of embedded newlines in the response itself, or of sbt's own log noise (confirmed: sbt's
// trailing "[success] Total time..." banner lands on stdout right after the last runMain output,
// which a single trailing-delimiter split would silently fold into the last response).
import gramark.Json

object LabParityMain:
  private val startMarker = "===LAB-PARITY-RESPONSE-START==="
  private val endMarker = "===LAB-PARITY-RESPONSE-END==="

  def main(args: Array[String]): Unit =
    if args.isEmpty then
      System.err.println("usage: LabParityMain <request1.json> [request2.json ...]")
      sys.exit(1)

    args.foreach { requestPath =>
      val text = java.nio.file.Files.readString(java.nio.file.Path.of(requestPath))
      Json.parse(text).flatMap(LabRequest.fromJson) match
        case Left(err) =>
          System.err.println(s"invalid LabRequest JSON in $requestPath: $err")
          sys.exit(1)
        case Right(request) =>
          val response = LabApi.evaluate(request)
          println(startMarker)
          println(LabResponse.serialize(response))
          println(endMarker)
    }
