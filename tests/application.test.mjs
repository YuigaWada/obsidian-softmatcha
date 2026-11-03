import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const { outputFiles } = await build({
  entryPoints: ["src/application/search-session.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { SearchSession } = await import(
  "data:text/javascript;base64," +
    Buffer.from(outputFiles[0].text).toString("base64")
);
const config = {
  token: "test",
  endpoint: "",
  corpus: "default",
  similarity: 0.5,
  limit: 50,
};
const tick = () => new Promise((r) => setImmediate(r));
test("queued obsolete input is skipped; an error does not poison the session", async () => {
  let release;
  const calls = [];
  const engine = {
    prepare: async () => true,
    async search(q) {
      calls.push(q);
      if (q === "first") await new Promise((r) => (release = r));
      if (q === "fail") throw Error("offline");
      return { results: [] };
    },
  };
  const session = new SearchSession(engine, {
    after() {
      throw Error("unexpected retry");
    },
  });
  const first = session.search("first", config);
  await tick();
  let current = true;
  const old = session.search("obsolete", config, () => current);
  current = false;
  const last = session.search("last", config);
  release();
  await Promise.all([first, old, last]);
  assert.deepEqual(calls, ["first", "last"]);
  await assert.rejects(session.search("fail", config), /offline/);
  await session.search("recovered", config);
  assert.equal(calls.at(-1), "recovered");
  session.dispose();
});
test("late warmup results and retry timers are invalidated on reconfiguration and unload", async () => {
  const resolvers = [];
  const timers = [];
  const session = new SearchSession(
    {
      prepare: () => new Promise((r) => resolvers.push(r)),
      search: async () => ({ results: [] }),
    },
    {
      after(ms, fn) {
        const t = { fn, cancelled: false };
        timers.push(t);
        return () => (t.cancelled = true);
      },
    },
  );
  session.prepare(config);
  session.prepare({ ...config, corpus: "new" });
  resolvers[0](true);
  await tick();
  assert.equal(session.state, "準備中…");
  resolvers[1](false);
  await tick();
  assert.equal(timers.length, 1);
  session.dispose();
  assert.equal(timers[0].cancelled, true);
  timers[0].fn();
  assert.equal(resolvers.length, 2);
});
