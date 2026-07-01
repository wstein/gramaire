import org.scalajs.linker.interface.ModuleKind

// Pinned explicitly, bumped deliberately — the same discipline the prior
// reference implementation's own package manifest applied to its registry pin.
ThisBuild / scalaVersion := "3.4.2"
ThisBuild / organization := "de.wstein.gramaire"
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
    name := "gramaire-core",
    libraryDependencies += "org.scalameta" %%% "munit" % munitVersion % Test,
    testFrameworks += new TestFramework("munit.Framework"),
  )

lazy val coreJS = core.js
lazy val coreJVM = core.jvm

// The Scala.js entry point consumed by the site — replaces the prior
// reference implementation's `Gramaire.Playground` bundle. Kept separate
// from `core` so `@JSExport` annotations don't pollute the cross-platform
// module's public API.
lazy val playground = project
  .in(file("playground/js"))
  .enablePlugins(ScalaJSPlugin)
  .dependsOn(coreJS)
  .settings(
    name := "gramaire-playground",
    scalaJSLinkerConfig ~= (_.withModuleKind(ModuleKind.ESModule)),
    scalaJSUseMainModuleInitializer := false,
  )

// The site's logic-bearing TypeScript, ported to Scala.js (Phase 5). Depends
// on `core.js` for the shared, dependency-free pieces (railroad rendering,
// canonical JSON) and on scalajs-dom for the browser APIs (Worker,
// URLSearchParams, btoa/atob) the original TS files used directly. Kept
// separate from `playground` (which stays the thin `evaluate()` entry point
// bundled to `site/src/generated/gramaire-engine.mjs`) — this module's own
// bundle imports that prebuilt artifact via `@JSImport` rather than linking
// the whole compiler twice.
lazy val siteGlue = project
  .in(file("site-glue/js"))
  .enablePlugins(ScalaJSPlugin)
  .dependsOn(coreJS)
  .settings(
    name := "gramaire-site-glue",
    libraryDependencies ++= Seq(
      "org.scala-js" %%% "scalajs-dom" % "2.8.0",
      "org.scalameta" %%% "munit" % munitVersion % Test,
    ),
    testFrameworks += new TestFramework("munit.Framework"),
    scalaJSLinkerConfig ~= (_.withModuleKind(ModuleKind.ESModule)),
    scalaJSUseMainModuleInitializer := false,
    // `GramaireRuntime`'s `@JSImport("./gramaire-engine.mjs", ...)` is a static
    // ES import: the WHOLE test bundle fails to even load without a real
    // file there, regardless of whether a given test touches GramaireRuntime.
    // Copy the already-built engine bundle next to the linker output before
    // the JS test runner starts (mirrors what `site/`'s own build does when
    // assembling the real page).
    Test / fastLinkJS := {
      val report = (Test / fastLinkJS).value
      val dir = (Test / fastLinkJS / scalaJSLinkerOutputDirectory).value
      IO.copyFile(baseDirectory.value / ".." / ".." / "site" / "src" / "generated" / "gramaire-engine.mjs", dir / "gramaire-engine.mjs")
      report
    },
  )

// The engine Web Worker's own entry point — a separate bundle (mirroring how
// Vite treated `engine-worker.ts` as its own chunk), since a module worker
// script needs top-level code that runs the moment it's loaded (installing
// `self.onmessage`), not just exported functions called from outside.
lazy val engineWorker = project
  .in(file("site-glue/worker-js"))
  .enablePlugins(ScalaJSPlugin)
  .dependsOn(siteGlue)
  .settings(
    name := "gramaire-engine-worker",
    scalaJSLinkerConfig ~= (_.withModuleKind(ModuleKind.ESModule)),
    scalaJSUseMainModuleInitializer := true,
    Compile / mainClass := Some("gramaire.site.EngineWorkerMain"),
    // Same reason as siteGlue's identical hook: GramaireRuntime's static
    // @JSImport needs a real file alongside the linked output before any JS
    // env (even one running zero tests) can load this module at all.
    Test / fastLinkJS := {
      val report = (Test / fastLinkJS).value
      val dir = (Test / fastLinkJS / scalaJSLinkerOutputDirectory).value
      IO.copyFile(baseDirectory.value / ".." / ".." / "site" / "src" / "generated" / "gramaire-engine.mjs", dir / "gramaire-engine.mjs")
      report
    },
  )

// The unified native/JVM `gramaire` CLI — replaces the prior reference
// implementation's Cli.purs + Codegen/Main.purs and the TypeScript
// bootstrap/gramaire-check.ts bridge.
lazy val cli = project
  .in(file("cli/jvm"))
  .dependsOn(coreJVM)
  .enablePlugins(JavaAppPackaging, NativeImagePlugin)
  .settings(
    name := "gramaire",
    Compile / mainClass := Some("gramaire.cli.Main"),
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

lazy val root = project
  .in(file("."))
  .aggregate(coreJS, coreJVM, playground, siteGlue, engineWorker, cli)
  .settings(
    publish / skip := true,
  )
