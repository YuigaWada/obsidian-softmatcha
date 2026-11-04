// Runs on actual iOS Simulator WebKit, not Node or desktop browser emulation.
import { AutomaticModels } from "../../src/application/automatic-models";
import { DownloadModel } from "../../src/application/model-download";
import { GithubModelSource } from "../../src/infrastructure/github-model-source";
import { ModelPackInstaller } from "../../src/infrastructure/model-pack-installer";
import { InstalledModels } from "../../src/infrastructure/installed-models";
import { WasmSearchEngine } from "../../src/infrastructure/wasm-search-engine";
import { defaults } from "../../src/domain/search";
import source from "softmatcha-worker-source";

const checks: string[] = [],
  requests: string[] = [];
let nextId = 0;
const pending = new Map<
  number,
  { resolve: (r: any) => void; reject: (e: Error) => void }
>();
const scope = globalThis as any;
scope.nativeComplete = (id: number, result: any) => {
  const task = pending.get(id);
  if (!task) return;
  pending.delete(id);
  result.error ? task.reject(Error(result.error)) : task.resolve(result);
};
scope.nativeModelRequest = async ({ url }: { url: string }) => {
  requests.push(url);
  const id = ++nextId;
  const result: any = await new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    scope.webkit.messageHandlers.qa.postMessage({ kind: "download", id, url });
  });
  // URLSession has downloaded inside the Simulator app sandbox. A loopback
  // test server streams that file into WebKit without huge base64 messages.
  const response = await fetch(`/downloads/${result.file}`);
  return { status: result.status, arrayBuffer: await response.arrayBuffer() };
};
const assert = (condition: unknown, message: string) => {
  if (!condition) throw Error(message);
};
const record = (text: string) => {
  checks.push(text);
  document.body.textContent = checks.join("\n");
};
let finished = false;
function finish(passed: boolean, error?: unknown) {
  if (finished) return;
  finished = true;
  scope.webkit.messageHandlers.qa.postMessage({
    kind: "done",
    passed,
    error: String(error ?? ""),
    checks,
    requests,
    userAgent: navigator.userAgent,
  });
}
window.addEventListener("error", (e) => finish(false, e.message));
window.addEventListener("unhandledrejection", (e) => finish(false, e.reason));
async function run() {
  const files = new Map<string, Uint8Array>();
  const store = {
    exists: async (path: string) => files.has(path),
    mkdir: async () => {},
    text: async (path: string) => {
      const data = files.get(path);
      if (!data) throw Error("Missing " + path);
      return new TextDecoder().decode(data);
    },
    write: async (path: string, data: ArrayBuffer) => {
      files.set(path, new Uint8Array(data));
    },
  };
  const config = {
    ...defaults,
    searchLanguages: ["en"] as ("en" | "ja")[],
    autoDownloadModels: false,
  };
  const automatic = new AutomaticModels(
    new InstalledModels(store),
    new DownloadModel(new GithubModelSource(), new ModelPackInstaller(store)),
  );
  const ensure = () =>
    automatic.ensure(
      scope.qaModelVersion,
      () => config,
      () => {},
      (_, error) => {
        throw error;
      },
    );
  await ensure();
  assert(requests.length === 0, "Opt-out made a network request");
  record("automatic-download opt-out: pass");
  const fixture = {
    en: { path: "english.md", text: "A happy researcher is reading a book." },
    ja: { path: "japanese.md", text: "日本の研究者が本を読んでいます。" },
  };
  for (const language of ["en", "ja"] as const) {
    files.clear();
    config.autoDownloadModels = true;
    config.searchLanguages = [language];
    await ensure();
    assert(
      await new InstalledModels(store).has(language),
      "Incomplete installed model",
    );
    const count = requests.length;
    await ensure();
    assert(requests.length === count, "Re-downloaded installed pack");
    record(
      `${language}: native URLSession download, SHA-256 validation, installation, reuse: pass`,
    );
    const item = fixture[language];
    const engine = new WasmSearchEngine(
      {
        ...store,
        vaultId: "ios-qa-" + language,
        binary: async (path: string) => {
          const raw = files.get(path);
          if (!raw) throw Error("Missing " + path);
          return new Uint8Array(raw).buffer;
        },
        list: () => [{ path: item.path, mtime: 1, size: item.text.length }],
        read: async () => item.text,
      },
      () =>
        new Worker(
          URL.createObjectURL(new Blob([source], { type: "text/javascript" })),
        ),
    );
    try {
      assert(await engine.prepare(config), "Engine did not prepare");
      const query = language === "en" ? "happy" : "日本";
      const result = await engine.search(query, config);
      assert(
        result.mode === "wasm" && !result.literalOnly,
        "Semantic model unavailable",
      );
      assert(
        result.results.some(
          (hit) =>
            hit.path === item.path &&
            hit.match_ranges?.some(([a, b]) =>
              hit.excerpt.slice(a, b).includes(query),
            ),
        ),
        "Missing highlighted result",
      );
      record(
        `${language}: WebKit Worker, WASM, tokenization, search and highlight offsets: pass`,
      );
    } finally {
      engine.dispose();
    }
  }
  record("iOS Simulator WebKit integration complete");
  finish(true);
}
void run().catch((error) => finish(false, error));
