import { TFile, type App, normalizePath } from "obsidian";
import type { LocalResources } from "./wasm-search-engine";
/** Only this repository adapter knows Obsidian vault paths and file APIs. */
export function vaultResources(app: App, pluginId: string): LocalResources {
  const root = normalizePath(
    `${app.vault.configDir}/plugins/${pluginId}/assets`,
  );
  return {
    vaultId: `${app.vault.getName()}:${app.vault.configDir}:${pluginId}`,
    binary: (path) => app.vault.adapter.readBinary(`${root}/${path}`),
    text: (path) => app.vault.adapter.read(`${root}/${path}`),
    list: () =>
      app.vault
        .getMarkdownFiles()
        .filter(
          (f) =>
            !f.path.split("/").some((part) => part.startsWith(".")) &&
            !/^(tools|output|96config)\//.test(f.path),
        )
        .map((f) => ({ path: f.path, mtime: f.stat.mtime, size: f.stat.size })),
    read: (path) => {
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile))
        return Promise.reject(Error(`ノートが見つかりません: ${path}`));
      return app.vault.cachedRead(file);
    },
  };
}
