import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const { outputFiles } = await build({
  entryPoints: ["src/infrastructure/binary-pages.ts"],
  bundle: true,
  write: false,
  format: "esm",
});
const { binaryPages } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
);

test("model file reads request bounded ranges including the final partial page", async () => {
  const requests = [],
    sizes = [];
  const transport = async (_url, { headers }) => {
    requests.push(headers.Range);
    const [, start, end] = /bytes=(\d+)-(\d+)/.exec(headers.Range).map(Number);
    return new Response(new Uint8Array(end - start + 1), {
      status: 206,
      headers: { "Content-Range": `bytes ${start}-${end}/10` },
    });
  };
  for await (const page of binaryPages(
    "capacitor://localhost/vector.f32",
    4,
    10,
    transport,
  ))
    sizes.push(page.byteLength);
  assert.deepEqual(requests, ["bytes=0-3", "bytes=4-7", "bytes=8-9"]);
  assert.deepEqual(sizes, [4, 4, 2]);
});

test("a server ignoring Range never causes a full model ArrayBuffer allocation", async () => {
  let consumed = false,
    cancelled = false;
  const transport = async () => ({
    status: 200,
    body: {
      cancel: async () => {
        cancelled = true;
      },
    },
    arrayBuffer: async () => {
      consumed = true;
      throw Error("must not allocate");
    },
  });
  await assert.rejects(async () => {
    for await (const page of binaryPages("local", 4, 10, transport)) void page;
  }, /Bounded model streaming unavailable/);
  assert.equal(consumed, false);
  assert.equal(cancelled, true);
});

test("iOS responses ignoring Range are split from a stream without arrayBuffer", async () => {
  const transport = async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([0, 1, 2, 3, 4, 5, 6]));
          controller.enqueue(new Uint8Array([7, 8, 9]));
          controller.close();
        },
      }),
    );
    response.arrayBuffer = () => {
      throw Error("whole-file read forbidden");
    };
    return response;
  };
  const pages = [];
  for await (const data of binaryPages("capacitor://file", 4, 10, transport))
    pages.push([...new Uint8Array(data)]);
  assert.deepEqual(pages, [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [8, 9],
  ]);
});
