import { requestUrl, type App } from "obsidian";
import { SearchSession } from "../application/search-session";
import { RemoteSearchEngine } from "../infrastructure/remote-search-engine";
import { WasmSearchEngine } from "../infrastructure/wasm-search-engine";
import { vaultResources } from "../infrastructure/obsidian-resources";
import source from "softmatcha-worker-source";
export function createSearchSession(
  app: App,
  pluginId: string,
  engine: "remote" | "wasm",
): SearchSession {
  const adapter =
    engine === "wasm"
      ? new WasmSearchEngine(vaultResources(app, pluginId), () => {
          const url = URL.createObjectURL(
            new Blob([source], { type: "text/javascript" }),
          );
          try {
            return new Worker(url);
          } finally {
            URL.revokeObjectURL(url);
          }
        })
      : new RemoteSearchEngine(requestUrl);
  return new SearchSession(adapter, {
    after(ms, action) {
      const id = setTimeout(action, ms);
      return () => clearTimeout(id);
    },
  });
}
