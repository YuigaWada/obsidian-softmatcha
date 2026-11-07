/** Read file pages using ranges or a backpressured response stream. */
async function* streamPages(
  response: Response,
  pageBytes: number,
  total: number,
): AsyncGenerator<ArrayBuffer> {
  if (!response.body || typeof response.body.getReader !== "function") {
    await response.body?.cancel();
    throw Error("Bounded model streaming unavailable");
  }
  const reader = response.body.getReader();
  let emitted = 0,
    received = 0,
    filled = 0;
  let page = new Uint8Array(Math.min(pageBytes, total));
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > total) throw Error("Invalid vector file size");
      for (let offset = 0; offset < value.byteLength;) {
        const count = Math.min(
          page.byteLength - filled,
          value.byteLength - offset,
        );
        page.set(value.subarray(offset, offset + count), filled);
        filled += count;
        offset += count;
        if (filled === page.byteLength) {
          const size = page.byteLength;
          yield page.buffer;
          emitted += size;
          filled = 0;
          page = new Uint8Array(Math.min(pageBytes, total - emitted));
        }
      }
    }
    if (received !== total || emitted !== total)
      throw Error("Truncated vector file");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function* binaryPages(
  url: string,
  pageBytes: number,
  total: number,
  // Local app/capacitor file ranges; requestUrl only supports network URLs.
  transport: typeof window.fetch = (input, init) => window.fetch(input, init),
): AsyncGenerator<ArrayBuffer> {
  if (
    !Number.isSafeInteger(pageBytes) ||
    pageBytes < 1 ||
    pageBytes > 2 * 1024 * 1024 ||
    !Number.isSafeInteger(total) ||
    total < 1
  )
    throw Error("Invalid binary page size");
  for (let offset = 0; offset < total; offset += pageBytes) {
    const end = Math.min(total, offset + pageBytes) - 1;
    const response = await transport(url, {
      headers: { Range: `bytes=${offset}-${end}` },
    });
    // Some Obsidian iOS file handlers ignore Range. Consume their body as a
    // stream with backpressure rather than materializing the entire file.
    if (offset === 0 && (response.status === 200 || response.status === 0)) {
      yield* streamPages(response, pageBytes, total);
      return;
    }
    if (
      response.status !== 206 ||
      response.headers.get("Content-Range") !==
        `bytes ${offset}-${end}/${total}`
    ) {
      await response.body?.cancel();
      throw Error("Bounded model reads unavailable");
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== end - offset + 1)
      throw Error("Truncated vector page");
    yield bytes;
  }
}
