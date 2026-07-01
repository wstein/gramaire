// Cross-compilation: one `core/shared` source tree built to both Scala.js
// and JVM bytecode (sbt-crossproject's `crossProject(...)`).
addSbtPlugin("org.scala-js" % "sbt-scalajs" % "1.16.0")
addSbtPlugin("org.portable-scala" % "sbt-scalajs-crossproject" % "1.3.2")

// Packaging: JavaAppPackaging for the fast JVM-jar path (every CI run),
// sbt-native-image for the GraalVM native binary (release/nightly only —
// see cli/README once written).
addSbtPlugin("com.github.sbt" % "sbt-native-packager" % "1.10.4")
addSbtPlugin("org.scalameta" % "sbt-native-image" % "0.3.4")

// Formatting: version pinned here (not just in CI YAML), same discipline
// as purs-tidy's pinned invocation on the PureScript side.
addSbtPlugin("org.scalameta" % "sbt-scalafmt" % "2.5.2")
