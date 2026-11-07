import { vector_scores } from "../../../../resources/wasm/softmatcha_wasm.js";
import type { ModelInput } from "../protocol";
import { MobileStore } from "./store";
import { releaseBuffer } from "./buffers";
export const blockRows = 1024;
interface Metadata {
  dimensions: number;
  size: number;
  vocabulary: Record<string, number>;
  lengths: Float32Array;
  blobPages?: boolean;
}
/** Disk pages are consumed individually; only small word and score caches persist. */
export class DiskVectors {
  private scores = new Map<number, Float32Array>();
  private words = new Map<number, Float32Array>();
  private constructor(
    private store: MobileStore,
    readonly prefix: string,
    readonly meta: Metadata,
  ) {}
  static async open(
    store: MobileStore,
    language: string,
    version: string,
    yieldWork: () => Promise<void> = async () => {},
  ) {
    const prefix = `vectors-rows-v2:${language}:${version}`;
    const meta = await store.get<Metadata>(prefix);
    if (meta && !meta.blobPages) {
      for (let start = 0; start < meta.size; start += blockRows) {
        const key = `${prefix}:${start / blockRows}`;
        const page = await store.get<Float32Array | Blob>(key);
        if (!page) throw Error("Missing vector page");
        if (!(page instanceof Blob)) {
          try {
            await store.put(key, new Blob([page as Float32Array<ArrayBuffer>]));
          } finally {
            releaseBuffer(page);
          }
        }
        await yieldWork();
      }
      meta.blobPages = true;
      await store.put(prefix, meta);
    }
    return meta ? new DiskVectors(store, prefix, meta) : undefined;
  }
  static async begin(
    store: MobileStore,
    spec: Omit<ModelInput, "vectors"> & { size: number },
  ) {
    const { size, dimensions, language, version } = spec;
    if (
      !Number.isInteger(size) ||
      size < 2 ||
      size > 65536 ||
      !Number.isInteger(dimensions) ||
      dimensions < 1 ||
      dimensions > 1024
    )
      throw Error("Invalid model size");
    const prefix = `vectors-rows-v2:${language}:${version}`;
    const lengths = new Float32Array(size);
    let next = 0,
      finished = false;
    // Incomplete imports are never exposed as usable models.
    await store.remove([prefix]);
    return {
      async append(page: Float32Array) {
        const entries: [string, unknown][] = [];
        try {
          const count = Math.min(blockRows, size - next);
          if (finished || count < 1 || page.length !== count * dimensions)
            throw Error("Invalid vector page");
          entries.push([
            `${prefix}:${next / blockRows}`,
            new Blob([page as Float32Array<ArrayBuffer>]),
          ]);
          for (let row = 0; row < count; row++) {
            let sum = 0;
            for (let d = 0; d < dimensions; d++) {
              const v = page[row * dimensions + d];
              sum = Math.fround(sum + Math.fround(v * v));
            }
            lengths[next + row] = Math.fround(Math.sqrt(sum) + 1e-12);
            entries.push([
              `${prefix}:word:${next + row}`,
              page.slice(row * dimensions, (row + 1) * dimensions),
            ]);
          }
          await store.putMany(entries);
          next += count;
        } finally {
          releaseBuffer(page);
          for (const [, value] of entries)
            if (value instanceof Float32Array) releaseBuffer(value);
        }
      },
      async finish() {
        if (finished || next !== size) throw Error("Incomplete vector model");
        const meta: Metadata = {
          dimensions,
          size,
          vocabulary: JSON.parse(spec.vocabulary) as Record<string, number>,
          lengths,
          blobPages: true,
        };
        await store.put(prefix, meta);
        finished = true;
        return new DiskVectors(store, prefix, meta);
      },
      abort() {
        if (!finished) {
          finished = true;
          releaseBuffer(lengths);
        }
      },
    };
  }
  static async install(
    store: MobileStore,
    model: ModelInput,
    yieldWork: () => Promise<void>,
  ) {
    const raw = new Float32Array(model.vectors);
    const writer = await DiskVectors.begin(store, {
      language: model.language,
      version: model.version,
      dimensions: model.dimensions,
      vocabulary: model.vocabulary,
      size: raw.length / model.dimensions,
    });
    try {
      for (
        let start = 0;
        start < raw.length;
        start += blockRows * model.dimensions
      ) {
        await writer.append(
          raw.slice(start, start + blockRows * model.dimensions),
        );
        await yieldWork();
      }
      return await writer.finish();
    } catch (error) {
      writer.abort();
      throw error;
    } finally {
      releaseBuffer(raw);
      model.vectors = new ArrayBuffer(0);
    }
  }
  async compact(ids: number[]) {
    const vectors = new Float32Array(ids.length * this.meta.dimensions);
    const available = new Map(
      ids.flatMap((id) => {
        const row = this.words.get(id);
        return row ? [[id, row] as const] : [];
      }),
    );
    const missing = ids.filter((id) => !available.has(id));
    const fetched = await this.store.getMany<Float32Array>(
      missing.map((id) => `${this.prefix}:word:${id}`),
    );
    missing.forEach((id, i) => available.set(id, fetched[i]));
    const evicted = new Set<Float32Array>();
    ids.forEach((id, i) => {
      const row = available.get(id);
      if (!row || row.length !== this.meta.dimensions)
        throw Error("Missing vector row");
      this.words.delete(id);
      if (this.words.size >= 1024) {
        const oldest = this.words.keys().next().value!;
        evicted.add(this.words.get(oldest)!);
        this.words.delete(oldest);
      }
      this.words.set(id, row);
      vectors.set(row, i * this.meta.dimensions);
    });
    const retained = new Set(this.words.values());
    for (const row of evicted) if (!retained.has(row)) releaseBuffer(row);
    return vectors;
  }
  async similarities(
    ids: number[],
    current: () => boolean,
    yieldWork: () => Promise<void>,
  ) {
    const cached = new Map(ids.map((id) => [id, this.scores.get(id)]));
    const missing = [...new Set(ids)].filter((id) => !cached.get(id));
    if (missing.length) {
      const queries = await this.compact(missing);
      const qn = new Float32Array(missing.map((id) => this.meta.lengths[id]));
      const rows = missing.map(() => new Float32Array(this.meta.size));
      try {
        for (let start = 0; start < this.meta.size; start += blockRows) {
          if (!current()) return undefined;
          const stored = await this.store.get<Blob>(
            `${this.prefix}:${Math.floor(start / blockRows)}`,
          );
          if (!(stored instanceof Blob)) throw Error("Missing vector page");
          const page = new Float32Array(await stored.arrayBuffer());
          try {
            const count = page.length / this.meta.dimensions;
            const scores = vector_scores(
              page,
              this.meta.lengths.subarray(start, start + count),
              queries,
              qn,
              this.meta.dimensions,
            );
            try {
              for (let i = 0; i < rows.length; i++)
                rows[i].set(scores.subarray(i * count, (i + 1) * count), start);
            } finally {
              releaseBuffer(scores);
            }
          } finally {
            releaseBuffer(page);
          }
          await yieldWork();
        }
      } finally {
        releaseBuffer(queries);
        releaseBuffer(qn);
      }
      for (let i = 0; i < missing.length; i++) {
        if (this.scores.size >= 8)
          this.scores.delete(this.scores.keys().next().value!);
        this.scores.set(missing[i], rows[i]);
      }
      // Queries longer than the cache still need all rows for this request.
      const available = new Map(missing.map((id, i) => [id, rows[i]]));
      const result = new Float32Array(ids.length * this.meta.size);
      ids.forEach((id, i) =>
        result.set(available.get(id) ?? cached.get(id)!, i * this.meta.size),
      );
      return result;
    }
    const result = new Float32Array(ids.length * this.meta.size);
    ids.forEach((id, i) =>
      result.set(this.scores.get(id)!, i * this.meta.size),
    );
    return result;
  }
}
