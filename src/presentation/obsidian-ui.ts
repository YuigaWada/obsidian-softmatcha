import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  SuggestModal,
  TFile,
  Notice,
  Platform,
  type ButtonComponent,
} from "obsidian";
import type {
  SearchConfig,
  Hit,
  SearchResult,
  UiLocale,
} from "../domain/search";
import { highlightRanges } from "../domain/search";
import { messages, errorText, resultCount, moreMatches } from "./i18n";
import { groupHits, resultPreview, type GroupedHit } from "./result-preview";
export interface SearchHost extends Plugin {
  config: SearchConfig;
  readonly warmState: string;
  readonly locale: UiLocale;
  readonly labels: ReturnType<typeof messages>;
  save(): Promise<void>;
  importModels(data: ArrayBuffer): Promise<void>;
  readonly modelTransferActive: boolean;
  readonly modelStatus: string;
  onModelStatusChange(listener: () => void): () => void;
  cancelSearch?(): void;
  query(
    query: string,
    isCurrent?: () => boolean,
    onPartial?: (result: SearchResult) => void,
  ): Promise<SearchResult>;
}
export class Search extends SuggestModal<GroupedHit> {
  timer: number | undefined;
  generation = 0;
  pending: ((x: GroupedHit[]) => void) | undefined;
  status: HTMLElement;
  closed = false;
  composing = false;
  private previewQueue: (() => Promise<void>)[] = [];
  private previewReads = 0;
  private completed: { query: string; result: SearchResult } | undefined;
  private showStatus(r: SearchResult) {
    this.status.setText(
      r.mode
        ? `${resultCount(r.results.length, this.plugin.locale)} · SoftMatcha 2${r.mode === "wasm" ? " WASM" : ""}${r.literalOnly ? ` · ${this.plugin.labels[r.literalOnly]}` : ""}${r.indexing ? ` · ${this.plugin.labels.indexing}` : ""}${r.pendingSemantic ? ` · ${this.plugin.labels.searching}` : ""}`
        : (r.message ??
            `${resultCount(r.results.length, this.plugin.locale)} · SoftMatcha 2`),
    );
  }
  constructor(
    app: App,
    private plugin: SearchHost,
  ) {
    super(app);
    if (Platform.isIosApp) this.modalEl.addClass("softmatcha-ios");
    this.setPlaceholder(plugin.labels.placeholder);
    this.setInstructions([
      { command: "↑↓", purpose: plugin.labels.select },
      { command: "Enter", purpose: plugin.labels.open },
      { command: "⌘/Ctrl+Enter", purpose: plugin.labels.newTab },
      { command: "Alt+Enter", purpose: plugin.labels.insertLink },
    ]);
    this.status = this.modalEl.createDiv({
      cls: "softmatcha-status",
      text: plugin.warmState,
    });
    this.inputEl.addEventListener("compositionstart", () => {
      this.composing = true;
    });
    this.inputEl.addEventListener("compositionend", () => {
      this.composing = false;
      this.inputEl.dispatchEvent(new Event("input"));
    });
  }
  getSuggestions(query: string): Promise<GroupedHit[]> {
    this.plugin.cancelSearch?.();
    const id = ++this.generation;
    this.previewQueue = [];
    window.clearTimeout(this.timer);
    this.pending?.([]);
    this.pending = undefined;
    if (!query.trim() || this.composing || this.closed) {
      this.completed = undefined;
      return Promise.resolve([]);
    }
    if (this.completed?.query === query.trim()) {
      const result = this.completed.result;
      this.completed = undefined;
      this.showStatus(result);
      return Promise.resolve(groupHits(result.results));
    }
    this.completed = undefined;
    return new Promise((resolve) => {
      this.pending = resolve;
      this.timer = window.setTimeout(() => {
        void (async () => {
          if (id !== this.generation) {
            resolve([]);
            return;
          }

          if (id !== this.generation || this.closed) {
            resolve([]);
            return;
          }
          this.status.setText(this.plugin.labels.searching);
          let partial = false;
          try {
            const r = await this.plugin.query(
              query.trim(),
              () => id === this.generation && !this.closed,
              (result) => {
                if (id === this.generation && !this.closed) {
                  partial = true;
                  this.showStatus(result);
                  resolve(groupHits(result.results));
                }
              },
            );
            if (id === this.generation && !this.closed) {
              this.showStatus(r);
              if (partial) {
                this.completed = { query: query.trim(), result: r };
                this.inputEl.dispatchEvent(new Event("input"));
              }
              resolve(groupHits(r.results));
            } else resolve([]);
          } catch (e) {
            if (id === this.generation && !this.closed)
              this.status.setText(errorText(e, this.plugin.locale));
            resolve([]);
          } finally {
            if (id === this.generation) this.pending = undefined;
          }
        })();
      }, 80);
    });
  }
  renderSuggestion(hit: GroupedHit, el: HTMLElement) {
    el.createDiv({
      cls: "softmatcha-title",
      text: hit.path.replace(/\.md$/, ""),
    });
    const excerpt = el.createDiv({ cls: "softmatcha-excerpt" });
    const render = (source?: string) => {
      excerpt.empty();
      if (!hit.matches.length) {
        excerpt.setText(this.plugin.labels.filename);
        return;
      }
      const preview = resultPreview(hit, source);
      for (const row of preview.lines) {
        const line = excerpt.createEl("button", {
          cls: "softmatcha-preview-line",
          attr: {
            type: "button",
            "aria-label": `${row.line + 1}: ${row.text}`,
          },
        });
        line.tabIndex = -1;
        renderHighlighted(line, row.text, row.ranges);
        line.addEventListener("click", (event) => {
          event.stopPropagation();
          void this.openHit({ ...hit, line: row.line }, event);
          this.close();
        });
      }
      if (preview.remaining)
        excerpt.createDiv({
          cls: "softmatcha-more-matches",
          text: moreMatches(preview.remaining, this.plugin.locale),
        });
    };
    render();
    // Fetch rendered previews, at most two notes at once. Source text is
    // discarded after rendering five bounded lines; stale queries stop work.
    const generation = this.generation;
    if (hit.matches.length) {
      this.previewQueue.push(async () => {
        if (this.closed || generation !== this.generation || !el.isConnected)
          return;
        const file = this.app.vault.getAbstractFileByPath(hit.path);
        if (!(file instanceof TFile)) return;
        const source = await this.app.vault.cachedRead(file);
        if (!this.closed && generation === this.generation && el.isConnected)
          render(source);
      });
      window.setTimeout(() => this.drainPreviews(), 0);
    }
    const first = this.firstMatch(hit);
    el.createDiv({
      cls: "softmatcha-meta",
      text:
        this.plugin.locale === "ja"
          ? `${first.line + 1}行目 · 類似度 ${hit.score.toFixed(3)}`
          : `Line ${first.line + 1} · Similarity ${hit.score.toFixed(3)}`,
    });
  }
  private firstMatch(hit: GroupedHit): Hit {
    return hit.matches.length
      ? hit.matches.reduce((a, b) => (a.line <= b.line ? a : b))
      : hit;
  }
  private drainPreviews() {
    while (!this.closed && this.previewReads < 2 && this.previewQueue.length) {
      const next = this.previewQueue.shift()!;
      this.previewReads++;
      void next()
        .catch(() => {
          /* Keep the search excerpt when a note disappears. */
        })
        .finally(() => {
          this.previewReads--;
          window.setTimeout(() => this.drainPreviews(), 0);
        });
    }
  }
  onChooseSuggestion(hit: GroupedHit, event: MouseEvent | KeyboardEvent) {
    void this.openHit(this.firstMatch(hit), event);
  }
  async openHit(hit: Hit, event: MouseEvent | KeyboardEvent) {
    const f = this.app.vault.getAbstractFileByPath(hit.path);
    if (!(f instanceof TFile)) {
      new Notice(this.plugin.labels.missingNote);
      return;
    }
    if (event.altKey) {
      const editor = this.app.workspace.activeEditor?.editor;
      if (editor)
        editor.replaceSelection(
          this.app.fileManager.generateMarkdownLink(
            f,
            this.app.workspace.getActiveFile()?.path ?? "",
          ),
        );
      return;
    }
    const leaf = this.app.workspace.getLeaf(
      event.metaKey || event.ctrlKey ? "tab" : false,
    );
    await leaf.openFile(f, { eState: { line: hit.line } });
  }
  onClose() {
    this.plugin.cancelSearch?.();
    this.closed = true;
    this.previewQueue = [];
    this.completed = undefined;
    this.generation++;
    window.clearTimeout(this.timer);
    this.pending?.([]);
    this.pending = undefined;
  }
}
export class Settings extends PluginSettingTab {
  private transferButtons = new Set<ButtonComponent>();
  private modelStatusCleanup: (() => void) | undefined;
  hide() {
    this.modelStatusCleanup?.();
    this.modelStatusCleanup = undefined;
  }
  private setTransferButtons(disabled: boolean) {
    for (const button of this.transferButtons) button.setDisabled(disabled);
  }
  constructor(
    app: App,
    private plugin: SearchHost,
  ) {
    super(app, plugin);
  }
  display() {
    this.renderSettings();
  }
  getSettingDefinitions() {
    const labels = this.plugin.labels;
    return [
      {
        name: labels.models,
        desc: labels.info,
        aliases: [
          labels.uiLanguage,
          labels.autoDownload,
          labels.semanticJa,
          labels.semanticEn,
          labels.similarity,
        ],
        render: (setting: Setting) => {
          setting.settingEl.addClass("softmatcha-settings");
          this.renderSettings(setting.settingEl);
        },
      },
    ];
  }
  private renderSettings(container = this.containerEl) {
    this.modelStatusCleanup?.();
    this.transferButtons.clear();
    container.empty();
    const labels = this.plugin.labels;
    container.createEl("p", { text: labels.info });
    new Setting(container).setName(labels.uiLanguage).addDropdown((d) =>
      d
        .addOption("auto", labels.automatic)
        .addOption("ja", "日本語")
        .addOption("en", "English")
        .setValue(this.plugin.config.uiLanguage)
        .onChange(async (value) => {
          this.plugin.config.uiLanguage = value as SearchConfig["uiLanguage"];
          await this.plugin.save();
          this.renderSettings(container);
        }),
    );
    const modelSetting = new Setting(container)
      .setName(labels.models)
      .setDesc(labels.importInfo);
    modelSetting.descEl.createEl("a", {
      text: ` ${labels.modelDownloads}`,
      href: `https://github.com/YuigaWada/obsidian-softmatcha/releases/tag/models-${this.plugin.manifest.version}`,
    });
    const progress = container.createEl("p", {
      cls: "softmatcha-model-status",
      attr: { role: "status", "aria-live": "polite" },
    });
    const updateStatus = () => {
      progress.setText(this.plugin.modelStatus);
      this.setTransferButtons(this.plugin.modelTransferActive);
    };
    this.modelStatusCleanup = this.plugin.onModelStatusChange(updateStatus);
    progress.setText(this.plugin.modelStatus);
    new Setting(container)
      .setName(labels.autoDownload)
      .setDesc(labels.autoDownloadInfo)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.config.autoDownloadModels)
          .onChange(async (value) => {
            this.plugin.config.autoDownloadModels = value;
            await this.plugin.save();
          }),
      );
    modelSetting.addButton((button) => {
      this.transferButtons.add(button);
      button
        .setDisabled(this.plugin.modelTransferActive)
        .setButtonText(labels.importPack)
        .onClick(() => {
          const input = container.createEl("input", {
            type: "file",
            cls: "softmatcha-file-input",
            attr: { accept: ".zip" },
          });
          input.addEventListener(
            "change",
            () => {
              void (async () => {
                const file = input.files?.[0];
                if (!file) return;
                this.setTransferButtons(true);
                progress.setText(labels.importing);
                try {
                  await this.plugin.importModels(await file.arrayBuffer());
                  progress.setText(labels.imported);
                  new Notice(labels.imported);
                } catch (error) {
                  progress.setText(errorText(error, this.plugin.locale));
                  new Notice(errorText(error, this.plugin.locale));
                } finally {
                  input.remove();
                  this.setTransferButtons(this.plugin.modelTransferActive);
                }
              })();
            },
            { once: true },
          );
          input.click();
        });
    });
    for (const [language, label] of [
      ["ja", labels.semanticJa],
      ["en", labels.semanticEn],
    ] as const) {
      new Setting(container)
        .setName(label)
        .setDesc(labels.semanticDesc)
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.config.searchLanguages.includes(language))
            .onChange(async (enabled) => {
              this.plugin.config.searchLanguages =
                this.plugin.config.searchLanguages.filter(
                  (l) => l !== language,
                );
              if (enabled) this.plugin.config.searchLanguages.push(language);
              await this.plugin.save();
            }),
        );
    }
    new Setting(container).setName(labels.similarity).addSlider((s) =>
      s
        .setLimits(0.1, 1, 0.05)
        .setValue(this.plugin.config.similarity)
        .onChange(async (v) => {
          this.plugin.config.similarity = v;
          await this.plugin.save();
        }),
    );
  }
}

// Note text is always rendered as text nodes.
function renderHighlighted(
  el: HTMLElement,
  text: string,
  ranges: [number, number][],
) {
  let offset = 0;
  for (const [a, b] of highlightRanges(text, ranges)) {
    el.appendText(text.slice(offset, a));
    el.createEl("mark", { cls: "softmatcha-match", text: text.slice(a, b) });
    offset = b;
  }
  el.appendText(text.slice(offset));
}
