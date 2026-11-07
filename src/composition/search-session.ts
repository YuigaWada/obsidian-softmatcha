import { Platform, type App } from "obsidian";
import { SearchSession } from "../application/search-session";
import { WasmSearchEngine } from "../infrastructure/wasm-search-engine";
import { vaultResources } from "../infrastructure/obsidian-resources";
import { messages, errorText } from "../presentation/i18n";
import type { UiLocale } from "../domain/search";
import source from "softmatcha-worker-source";
export function createSearchSession(
  app: App,
  pluginId: string,
  locale: UiLocale = "ja",
): SearchSession {
  const adapter = new WasmSearchEngine(
    vaultResources(app, pluginId),
    () => {
      const url = URL.createObjectURL(
        new Blob([source], { type: "text/javascript" }),
      );
      try {
        return new Worker(url);
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    Platform.isIosApp,
  );
  return new SearchSession(
    adapter,
    {
      after(ms, action) {
        const id = window.setTimeout(action, ms);
        return () => window.clearTimeout(id);
      },
    },
    sessionLabels(locale),
    Platform.isIosApp ? 2 : 60,
  );
}
export function sessionLabels(locale: UiLocale) {
  const labels = messages(locale);
  return {
    preparing: labels.preparing,
    ready: labels.ready,
    indexing: labels.indexing,
    error: (e: unknown) => `${labels.prepareError}: ${errorText(e, locale)}`,
  };
}
