package gramark

class VersionSuite extends munit.FunSuite:
  test("scaffold placeholder compiles and runs on both JVM and JS") {
    assertEquals(Version.placeholder, "gramark-core scaffold")
  }
