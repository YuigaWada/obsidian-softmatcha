import { Plugin } from "obsidian";
import { defaults, type SearchConfig } from "./domain/search";
import type { SearchSession } from "./application/search-session";
import { createSearchSession } from "./composition/search-session";
import { Search, Settings } from "./presentation/obsidian-ui";
/** Obsidian lifecycle/composition entry point. */
export default class SoftMatchaPlugin extends Plugin {
  config: SearchConfig = { ...defaults };
  private session!: SearchSession;
  private stopped = false;
  private engineKind: "wasm" | "remote" = "wasm";
  get warmState() {
    return this.session?.state ?? "準備中…";
  }
  async onload() {
    this.config = { ...defaults, ...(await this.loadData()) };
    this.engineKind = this.config.engine;
    this.session = createSearchSession(
      this.app,
      this.manifest.id,
      this.engineKind,
    );
    this.addCommand({
      id: "search",
      name: "Search vault",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "O" }],
      callback: () => new Search(this.app, this).open(),
    });
    this.addRibbonIcon("search", "SoftMatcha-for-Obsidian", () =>
      new Search(this.app, this).open(),
    );
    this.addSettingTab(new Settings(this.app, this));
    this.app.workspace.onLayoutReady(() => {
      if (!this.stopped) this.session.prepare(this.config);
    });
    this.registerInterval(
      window.setInterval(() => {
        if (!this.stopped) this.session.prepare(this.config);
      }, 60000),
    );
  }
  onunload() {
    this.stopped = true;
    this.session.dispose();
  }
  async save() {
    await this.saveData(this.config);
    if (!this.stopped) {
      if (this.engineKind !== this.config.engine) {
        this.session.dispose();
        this.engineKind = this.config.engine;
        this.session = createSearchSession(
          this.app,
          this.manifest.id,
          this.engineKind,
        );
      }
      this.session.prepare(this.config);
    }
  }
  query(query: string, isCurrent?: () => boolean) {
    return this.session.search(query, this.config, isCurrent);
  }
}
