package gramaire

class VersionSuite extends munit.FunSuite:
  test("scaffold placeholder compiles and runs on both JVM and JS") {
    assertEquals(Version.placeholder, "gramaire-core scaffold")
  }
