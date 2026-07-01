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

lazy val coreJS = core.js
lazy val coreJVM = core.jvm

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

lazy val root = project
  .in(file("."))
  .aggregate(coreJS, coreJVM, cli)
  .settings(
    publish / skip := true,
  )
