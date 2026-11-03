import { Plugin, getLanguage, type Command } from "obsidian";
import { defaults, loadSearchConfig, type SearchConfig } from "./domain/search";
import type { SearchSession } from "./application/search-session";
import {
  createSearchSession,
  sessionLabels,
} from "./composition/search-session";
import { messages, resolveLocale } from "./presentation/i18n";
import { ModelPackInstaller } from "./infrastructure/model-pack-installer";
import { modelAssetStore } from "./infrastructure/obsidian-resources";
import { Search, Settings } from "./presentation/obsidian-ui";
/** Obsidian lifecycle/composition entry point. */
export default class SoftMatchaPlugin extends Plugin {
  config: SearchConfig = { ...defaults };
  private session!: SearchSession;
  private stopped = false;
  private searchCommand: Command | undefined;
  get locale() {
    return resolveLocale(
      this.config.uiLanguage,
      typeof getLanguage === "function" ? getLanguage() : "ja",
    );
  }
  get labels() {
    return messages(this.locale);
  }
  private runtimeConfig() {
    return { ...this.config, locale: this.locale };
  }
  private engineSignature = "";
  get warmState() {
    return this.session?.state ?? this.labels.preparing;
  }
  async onload() {
    const saved: unknown = await this.loadData();
    this.config = loadSearchConfig(saved);
    this.engineSignature = JSON.stringify([this.config.searchLanguages]);
    this.session = createSearchSession(this.app, this.manifest.id, this.locale);
    this.searchCommand = this.addCommand({
      id: "search",
      name: this.labels.search,
      callback: () => new Search(this.app, this).open(),
    });
    this.addRibbonIcon("search", this.manifest.name, () =>
      new Search(this.app, this).open(),
    );
    this.addSettingTab(new Settings(this.app, this));
    this.app.workspace.onLayoutReady(() => {
      if (!this.stopped) this.session.prepare(this.runtimeConfig());
    });
    this.registerInterval(
      window.setInterval(() => {
        if (!this.stopped) this.session.prepare(this.runtimeConfig());
      }, 60000),
    );
  }
  onunload() {
    this.stopped = true;
    this.session.dispose();
  }
  async save() {
    await this.saveData(this.config);
    if (this.searchCommand) this.searchCommand.name = this.labels.search;
    if (!this.stopped) {
      const signature = JSON.stringify([this.config.searchLanguages]);
      if (this.engineSignature !== signature) {
        this.engineSignature = signature;
        this.session.dispose();
        this.session = createSearchSession(
          this.app,
          this.manifest.id,
          this.locale,
        );
      }
      this.session.setLabels(sessionLabels(this.locale));
      this.session.prepare(this.runtimeConfig());
    }
  }
  async importModels(data: ArrayBuffer): Promise<void> {
    await new ModelPackInstaller(
      modelAssetStore(this.app, this.manifest.id),
    ).install(data);
    this.engineSignature = "";
    await this.save();
  }
  query(query: string, isCurrent?: () => boolean) {
    return this.session.search(query, this.runtimeConfig(), isCurrent);
  }
}
