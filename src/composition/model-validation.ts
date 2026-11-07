import source from "softmatcha-worker-source";
import type {
  Catalog,
  validateModelPack,
} from "../infrastructure/model-pack-installer";
/** ZIP inflation runs in a disposable Worker; buffers return by ownership transfer. */
export function validateInWorker(
  data: ArrayBuffer,
  catalog?: Catalog,
  signal?: AbortSignal,
): ReturnType<typeof validateModelPack> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Error("Model validation cancelled"));
      return;
    }
    const url = URL.createObjectURL(
      new Blob([source], { type: "text/javascript" }),
    );
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    const finish = () => {
      worker.terminate();
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      finish();
      reject(Error("Model validation cancelled"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = (e) => {
      finish();
      reject(Error(e.message));
    };
    worker.onmessage = (e) => {
      finish();
      const result = e.data as {
        value: Awaited<ReturnType<typeof validateModelPack>>;
        error?: string;
      };
      if (result.error) reject(Error(result.error));
      else resolve(result.value);
    };
    try {
      worker.postMessage(
        { id: 1, type: "unpack", payload: { data, catalog } },
        [data],
      );
    } catch (error) {
      finish();
      reject(error instanceof Error ? error : Error("Model validation failed"));
    }
  });
}
