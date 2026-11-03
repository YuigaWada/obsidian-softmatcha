import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
function sources(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? sources(path.join(dir, e.name))
        : [path.join(dir, e.name).replaceAll(path.sep, "/")],
    )
    .filter((f) => f.endsWith(".ts"));
}
test("domain and use cases depend only inward", () => {
  for (const file of [
    ...sources("src/domain"),
    ...sources("src/application"),
  ]) {
    const imports = [
      ...fs.readFileSync(file, "utf8").matchAll(/from\s+['"]([^'"]+)['"]/g),
    ].map((m) => m[1]);
    for (const specifier of imports) {
      assert.ok(
        specifier.startsWith("."),
        `${file} imports platform package ${specifier}`,
      );
      const target = path
        .normalize(path.join(path.dirname(file), specifier))
        .replaceAll(path.sep, "/");
      assert.ok(
        target.startsWith("src/domain/") ||
          (file.startsWith("src/application/") &&
            target.startsWith("src/application/")),
        `${file} depends outward on ${target}`,
      );
    }
  }
  for (const file of sources("src/presentation"))
    assert.doesNotMatch(
      fs.readFileSync(file, "utf8"),
      /from ['"][^'"]*(?:infrastructure|composition)[^'"]*['"]/,
    );
});

test("Python and Rust use cases also keep framework/index dependencies outside", () => {
  for (const file of [
    "server/search_domain.py",
    "server/search_application.py",
  ])
    assert.doesNotMatch(
      fs.readFileSync(file, "utf8"),
      /(?:from|import)\s+(?:fastapi|pydantic|infrastructure|http_api|service|softmatcha)\b/,
    );
  const application = fs.readFileSync("rust/core/src/application.rs", "utf8");
  assert.doesNotMatch(
    application,
    /use\s+crate::[^;]*(?:indexing|upstream|storage)/,
  );
  assert.doesNotMatch(application, /wasm_bindgen|std::fs/);
});
