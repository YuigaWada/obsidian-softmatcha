import { validateInWorker } from "./composition/model-validation";
import { Plugin, Platform, getLanguage, type Command } from "obsidian";
import {
  defaults,
  loadSearchConfig,
  type SearchConfig,
  SearchFault,
  type SearchLanguage,
  type SearchResult,
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
      (Platform.isIosApp && document.hidden) ||
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
    if (Platform.isIosApp && this.preparationPaused) this.resumePreparation();
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
  private preparationPaused = false;
  private modelAbort = new AbortController();
  private updateTimer: number | undefined;
  private resumePreparation() {
    if (this.stopped) return;
    if (this.preparationPaused) {
      this.session = createSearchSession(
        this.app,
        this.manifest.id,
        this.locale,
      );
      this.engineSignature = JSON.stringify([this.config.searchLanguages]);
      this.preparationPaused = false;
    }
    if (Platform.isIosApp) this.session.setActive(!document.hidden);
    this.session.prepare(this.runtimeConfig());
  }
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
          this.modelTransfer(
            (installer) => installer.install(data, language),
            language,
          ),
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
    if (Platform.isIosApp) {
      const changed = () => {
        window.clearTimeout(this.updateTimer);
        this.updateTimer = window.setTimeout(() => {
          if (!this.stopped && !this.preparationPaused && !document.hidden)
            this.session.prepare(this.runtimeConfig());
        }, 750);
      };
      this.app.workspace.onLayoutReady(() => {
        if (this.stopped) return;
        this.registerEvent(this.app.vault.on("create", changed));
        this.registerEvent(this.app.vault.on("modify", changed));
        this.registerEvent(this.app.vault.on("delete", changed));
        this.registerEvent(this.app.vault.on("rename", changed));
        const visibility = () => {
          this.session.setActive(!document.hidden);
          if (document.hidden) this.session.cancelSearch();
          else if (!this.preparationPaused) {
            this.session.prepare(this.runtimeConfig());
            void this.ensureModels();
          }
        };
        this.registerDomEvent(document, "visibilitychange", visibility);
        this.session.setActive(!document.hidden);
      });
      this.register(() => window.clearTimeout(this.updateTimer));
      this.registerInterval(
        window.setInterval(() => {
          if (!this.stopped) void this.ensureModels();
        }, 5 * 60000),
      );
    } else
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
    this.modelAbort.abort();
    this.session.dispose();
    window.clearTimeout(this.updateTimer);
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
      if (!this.preparationPaused) this.session.prepare(this.runtimeConfig());
      void this.ensureModels();
    }
  }
  private async modelTransfer(
    action: (installer: ModelPackInstaller) => Promise<unknown>,
    language?: SearchLanguage,
  ): Promise<void> {
    if (this.modelTransferRunning) throw new SearchFault("modelBusy");
    this.modelTransferRunning = true;
    if (Platform.isIosApp && !this.preparationPaused) {
      this.session.dispose();
      this.preparationPaused = true;
    }
    this.setModelStatus(this.labels.importing);
    try {
      await action(
        new ModelPackInstaller(
          modelAssetStore(this.app, this.manifest.id),
          undefined,
          Platform.isIosApp
            ? (data, catalog) =>
                validateInWorker(data, catalog, this.modelAbort.signal)
            : undefined,
          () =>
            !this.stopped &&
            (!language ||
              (this.config.autoDownloadModels &&
                this.config.searchLanguages.includes(language))),
          Platform.isIosApp,
        ),
      );
      if (!this.stopped) {
        this.setModelStatus(this.labels.imported);
        if (Platform.isIosApp) await this.saveData(this.config);
        else {
          this.engineSignature = "";
          await this.save();
        }
      }
    } finally {
      this.modelTransferRunning = false;
      if (
        Platform.isIosApp &&
        !this.automaticModels.active &&
        this.preparationPaused
      )
        this.resumePreparation();
      this.setModelStatus(this.modelStatusMessage);
    }
  }
  async importModels(data: ArrayBuffer): Promise<void> {
    await this.modelTransfer((installer) => installer.install(data));
  }
  cancelSearch() {
    this.session.cancelSearch();
  }
  query(
    query: string,
    isCurrent?: () => boolean,
    onPartial?: (result: SearchResult) => void,
  ) {
    if (this.preparationPaused)
      return Promise.resolve({ results: [], message: this.modelStatus });
    return this.session.search(
      query,
      this.runtimeConfig(),
      isCurrent,
      onPartial,
    );
  }
}
