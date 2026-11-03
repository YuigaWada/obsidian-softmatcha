import { TFile, type App, normalizePath } from "obsidian";
import type { LocalResources } from "./wasm-search-engine";
/** Only this repository adapter knows Obsidian vault paths and file APIs. */
export function vaultResources(app: App, pluginId: string): LocalResources {
  const root = normalizePath(
    `${app.vault.configDir}/plugins/${pluginId}/assets`,
  );
  return {
    exists: (path) => app.vault.adapter.exists(`${root}/${path}`),
    vaultId: `${app.vault.getName()}:${app.vault.configDir}:${pluginId}`,
    binary: (path) => app.vault.adapter.readBinary(`${root}/${path}`),
    text: (path) => app.vault.adapter.read(`${root}/${path}`),
    list: () =>
      app.vault
        .getMarkdownFiles()
        .filter((f) => !f.path.split("/").some((part) => part.startsWith(".")))
        .map((f) => ({ path: f.path, mtime: f.stat.mtime, size: f.stat.size })),
    read: (path) => {
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile))
        return Promise.reject(Error(`ノートが見つかりません: ${path}`));
      return app.vault.cachedRead(file);
    },
  };
}

export function modelAssetStore(app: App, pluginId: string) {
  const root = normalizePath(
    `${app.vault.configDir}/plugins/${pluginId}/assets`,
  );
  return {
    exists: (path: string) =>
      app.vault.adapter.exists(normalizePath(`${root}/${path}`)),
    mkdir: async (path: string) => {
      if (!(await app.vault.adapter.exists(root)))
        await app.vault.adapter.mkdir(root);
      await app.vault.adapter.mkdir(normalizePath(`${root}/${path}`));
    },
    write: async (path: string, data: ArrayBuffer) => {
      if (!(await app.vault.adapter.exists(root)))
        await app.vault.adapter.mkdir(root);
      await app.vault.adapter.writeBinary(
        normalizePath(`${root}/${path}`),
        data,
      );
    },
  };
}
