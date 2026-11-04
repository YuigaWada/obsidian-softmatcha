import { Plugin, getLanguage, type Command } from "obsidian";
import {
  defaults,
  loadSearchConfig,
  type SearchConfig,
  SearchFault,
  type SearchLanguage,
} from "./domain/search";
import type { SearchSession } from "./application/search-session";
import {
  createSearchSession,
  sessionLabels,
} from "./composition/search-session";
import { messages, resolveLocale } from "./presentation/i18n";
import { DownloadModel } from "./application/model-download";
import { AutomaticModels } from "./application/automatic-models";
import { InstalledModels } from "./infrastructure/installed-models";
import { errorText } from "./presentation/i18n";
import { GithubModelSource } from "./infrastructure/github-model-source";
import { ModelPackInstaller } from "./infrastructure/model-pack-installer";
import { modelAssetStore } from "./infrastructure/obsidian-resources";
import { Search, Settings } from "./presentation/obsidian-ui";
/** Obsidian lifecycle/composition entry point. */
export default class SoftMatchaPlugin extends Plugin {
  config: SearchConfig = { ...defaults };
  private session!: SearchSession;
  private stopped = false;
  private modelTransferRunning = false;
  private automaticModels!: AutomaticModels;
  private modelStatusMessage = "";
  private modelStatusListeners = new Set<() => void>();
  get modelStatus() {
    return this.modelStatusMessage;
  }
  onModelStatusChange(listener: () => void) {
    this.modelStatusListeners.add(listener);
    return () => this.modelStatusListeners.delete(listener);
  }
  private setModelStatus(text: string) {
    this.modelStatusMessage = text;
    for (const listener of this.modelStatusListeners) listener();
  }
  private async ensureModels(): Promise<void> {
    if (
      this.stopped ||
      !this.config.autoDownloadModels ||
      this.modelTransferRunning
    )
      return;
    const label = (language: SearchLanguage) =>
      language === "ja" ? this.labels.semanticJa : this.labels.semanticEn;
    await this.automaticModels.ensure(
      this.manifest.version,
      () => this.config,
      (language, phase) =>
        this.setModelStatus(
          `${label(language)}: ${phase === "downloading" ? this.labels.downloading : phase === "cancelled" ? this.labels.downloadCancelled : this.labels.importing}`,
        ),
      (language, error) =>
        this.setModelStatus(
          `${label(language)}: ${errorText(error, this.locale)}`,
        ),
      () => !this.stopped,
    );
    this.setModelStatus(this.modelStatusMessage);
  }
  get modelTransferActive() {
    return this.modelTransferRunning || (this.automaticModels?.active ?? false);
  }
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
    const store = modelAssetStore(this.app, this.manifest.id);
    this.automaticModels = new AutomaticModels(
      new InstalledModels(store),
      new DownloadModel(new GithubModelSource(), {
        install: (data, language) =>
          this.modelTransfer((installer) => installer.install(data, language)),
      }),
    );
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
      if (!this.stopped) {
        this.session.prepare(this.runtimeConfig());
        void this.ensureModels();
      }
    });
    this.registerInterval(
      window.setInterval(() => {
        if (!this.stopped) {
          this.session.prepare(this.runtimeConfig());
          void this.ensureModels();
        }
      }, 60000),
    );
  }
  onunload() {
    this.stopped = true;
    this.session.dispose();
    this.modelStatusListeners.clear();
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
      void this.ensureModels();
    }
  }
  private async modelTransfer(
    action: (installer: ModelPackInstaller) => Promise<unknown>,
  ): Promise<void> {
    if (this.modelTransferRunning) throw new SearchFault("modelBusy");
    this.modelTransferRunning = true;
    this.setModelStatus(this.labels.importing);
    try {
      await action(
        new ModelPackInstaller(modelAssetStore(this.app, this.manifest.id)),
      );
      if (!this.stopped) {
        this.setModelStatus(this.labels.imported);
        this.engineSignature = "";
        await this.save();
      }
    } finally {
      this.modelTransferRunning = false;
      this.setModelStatus(this.modelStatusMessage);
    }
  }
  async importModels(data: ArrayBuffer): Promise<void> {
    await this.modelTransfer((installer) => installer.install(data));
  }
  query(query: string, isCurrent?: () => boolean) {
    return this.session.search(query, this.runtimeConfig(), isCurrent);
  }
}
