import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
function tests(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? tests(`${dir}/${entry.name}`)
      : entry.name.endsWith(".test.mjs")
        ? [`${dir}/${entry.name}`]
        : [],
  );
}
const result = spawnSync(
  process.execPath,
  ["--test", ...tests("tests").sort()],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
