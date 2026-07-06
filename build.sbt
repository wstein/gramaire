// Pinned explicitly, bumped deliberately — the same discipline the prior
// reference implementation's own package manifest applied to its registry pin.
ThisBuild / scalaVersion := "3.4.2"
ThisBuild / organization := "de.wstein.gramark"
ThisBuild / versionScheme := Some("early-semver")

val munitVersion = "1.0.2"

// The cross-compiled compiler core: lexer, ATN, table construction
// (Canonical/LALR/IELR), IR, GLR/LL, diagnostics, desugar, transform,
// backends, conformance. Filesystem-free by construction (ADR D13's
// equivalent) — CrossType.Pure means one shared source tree
// (`core/src/main/scala`) serves both the Scala.js and JVM builds, no
// platform-specific source dirs (that's CrossType.Full's `shared/`+`js/`+
// `jvm/` layout, not this one).
lazy val core = crossProject(JSPlatform, JVMPlatform)
  .crossType(CrossType.Pure)
  .in(file("core"))
  .settings(
    name := "gramark-core",
    libraryDependencies += "org.scalameta" %%% "munit" % munitVersion % Test,
    testFrameworks += new TestFramework("munit.Framework"),
  )
  .jvmSettings(
    // Standalone (JDK-independent — Nashorn was pulled from the JDK itself in 15) pure-Java
    // ECMAScript engine, JVM-test-only: lets a JVM-only suite (BackendJsExternalsSuite) actually
    // RUN `BackendJs.emit`'s output — not just diff its text — the strongest proof a delegate/
    // externals-rendering example works end to end. Deliberately not depended on by any other
    // module or by production code (core/src/main stays runtime-free per ADR D13); scoped to
    // `Test` so it never reaches a `coreJVM/package`/`cli` artifact, and `.jvmSettings`-only so
    // `coreJS/compile` (Scala.js has no JVM classpath at all) is entirely unaffected.
    libraryDependencies += "org.openjdk.nashorn" % "nashorn-core" % "15.4" % Test
  )

lazy val coreJS = core.js
lazy val coreJVM = core.jvm

// LabProtocol: the typed request/response boundary the in-browser Lab talks
// to across the Scala.js/Worker seam (docs/playground-spec.md §5.1) — kept
// out of `core` so `core`'s public API stays the compiler's API, not a
// presentation-layer shape for one specific consumer. `labJVM` isn't for any
// CLI feature; it exists so the JVM↔JS parity gate (§8) can run the same
// LabRequest through this module on the JVM and through the linked `labJS`
// module under Node, byte-comparing the serialized LabResponse.
lazy val lab = crossProject(JSPlatform, JVMPlatform)
  .crossType(CrossType.Pure)
  .in(file("lab"))
  .dependsOn(core)
  .settings(
    name := "gramark-lab",
    libraryDependencies += "org.scalameta" %%% "munit" % munitVersion % Test,
    testFrameworks += new TestFramework("munit.Framework"),
  )
  .jsSettings(
    // ESModule output so Vite/Astro can `import` the linked bundle directly
    // in the Worker (site/src/lab/worker.ts) — no bundler-specific loader
    // shim needed. No @main entry point exists; only the
    // @JSExportTopLevel functions in the JS-only lab/.js/src/main/scala
    // supplementary source dir (LabExports.scala) are called from JS.
    scalaJSUseMainModuleInitializer := false,
    scalaJSLinkerConfig ~= (_.withModuleKind(ModuleKind.ESModule)),
  )

lazy val labJS = lab.js
lazy val labJVM = lab.jvm

// The unified native/JVM `gramark` CLI — replaces the prior reference
// implementation's Cli.purs + Codegen/Main.purs and the TypeScript
// bootstrap/gramark-check.ts bridge.
lazy val cli = project
  .in(file("cli/jvm"))
  .dependsOn(coreJVM)
  .enablePlugins(JavaAppPackaging, NativeImagePlugin)
  .settings(
    name := "gramark",
    Compile / mainClass := Some("gramark.cli.Main"),
    libraryDependencies += "org.scalameta" %%% "munit" % munitVersion % Test,
    testFrameworks += new TestFramework("munit.Framework"),
    nativeImageOptions += "--no-fallback",
    // Use the JDK sbt itself is running under (rather than having the
    // plugin provision its own GraalVM via coursier's jvm-index, whose
    // default entry is stale/unindexed) — so `sbt cli/nativeImage` must be
    // invoked with JAVA_HOME pointed at a GraalVM distribution (this
    // machine: `/Library/Java/JavaVirtualMachines/graalvm-25.jdk/Contents/Home`;
    // CI: `graalvm/setup-graalvm@v1`, per the migration plan's Phase 3).
    nativeImageGraalHome := file(System.getProperty("java.home")).toPath,
  )

// A throwaway compile target for the `scala-peg` backend's execute-and-verify parity gate
// (site/scripts/check-scala-peg-parity.mjs) — no standalone Scala tooling (`scala-cli`/`scalac`/
// `coursier`) exists in this environment to compile+run the emitted code as an external process
// the way the `atn-ts` backend's own gate runs `tsc`+`node`, so this is the equivalent: a real
// sbt project the emitted Scala compiles inside. Deliberately has NO dependency on `coreJVM` (or
// anything else) — the whole point is proving the generated code stands on its own; only its own
// fixed driver (`src/main/scala/gramark/scratch/Main.scala`) is committed, `Generated.scala` is
// rewritten fresh by `ScalaPegParityMain` (cli/jvm) before every run and is gitignored. Not
// aggregated into `root` — `sbt test`/`sbt compile` never touch it; it's reached only via the
// parity script's own `sbt "codegenScratch/runMain ..."` invocations, since its source tree is
// incomplete (no `Generated.scala`) until that main has run once.
lazy val codegenScratch = project
  .in(file("codegen-scratch"))
  .settings(
    name := "gramark-codegen-scratch",
    publish / skip := true,
    // Only the opt-in `scala-peg-fastparse`/`scala-peg-combinators` backends' generated code uses
    // these — the dependency-free `scala-peg` backend's own generated code references neither, so
    // each is simply unused (harmlessly) whenever `codegen-scratch` compiles a different backend's
    // output.
    libraryDependencies += "com.lihaoyi" %% "fastparse" % "3.1.1",
    libraryDependencies += "org.scala-lang.modules" %% "scala-parser-combinators" % "2.4.0",
  )

lazy val root = project
  .in(file("."))
  .aggregate(coreJS, coreJVM, labJS, labJVM, cli)
  .settings(
    publish / skip := true,
  )
