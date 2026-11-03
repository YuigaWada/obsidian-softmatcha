import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  SuggestModal,
  TFile,
  Notice,
} from "obsidian";
import type { SearchConfig, Hit, SearchResult } from "../domain/search";
import { highlightRanges } from "../domain/search";
export interface SearchHost extends Plugin {
  config: SearchConfig;
  readonly warmState: string;
  save(): Promise<void>;
  query(query: string, isCurrent?: () => boolean): Promise<SearchResult>;
}
export class Search extends SuggestModal<Hit> {
  timer: ReturnType<typeof setTimeout> | undefined;
  generation = 0;
  pending: ((x: Hit[]) => void) | undefined;
  status: HTMLElement;
  closed = false;
  composing = false;
  constructor(
    app: App,
    private plugin: SearchHost,
  ) {
    super(app);
    this.setPlaceholder("SoftMatcha 2で検索…");
    this.setInstructions([
      { command: "↑↓", purpose: "選択" },
      { command: "Enter", purpose: "開く" },
      { command: "⌘/Ctrl+Enter", purpose: "新しいタブ" },
      { command: "Alt+Enter", purpose: "リンク挿入" },
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
  getSuggestions(query: string): Promise<Hit[]> {
    const id = ++this.generation;
    clearTimeout(this.timer);
    this.pending?.([]);
    this.pending = undefined;
    if (!query.trim() || this.composing || this.closed)
      return Promise.resolve([]);
    return new Promise((resolve) => {
      this.pending = resolve;
      this.timer = setTimeout(async () => {
        if (id !== this.generation) {
          resolve([]);
          return;
        }

        if (id !== this.generation || this.closed) {
          resolve([]);
          return;
        }
        this.status.setText("検索中…");
        try {
          const r = await this.plugin.query(
            query.trim(),
            () => id === this.generation && !this.closed,
          );
          if (id === this.generation && !this.closed) {
            this.status.setText(
              r.message ?? `${r.results.length}件 · SoftMatcha 2`,
            );
            resolve(r.results);
          } else resolve([]);
        } catch (e) {
          if (id === this.generation && !this.closed)
            this.status.setText(`${e instanceof Error ? e.message : e}`);
          resolve([]);
        } finally {
          if (id === this.generation) this.pending = undefined;
        }
      }, 80);
    });
  }
  renderSuggestion(hit: Hit, el: HTMLElement) {
    el.createDiv({
      cls: "softmatcha-title",
      text: hit.path.replace(/\.md$/, ""),
    });
    const excerpt = el.createDiv({ cls: "softmatcha-excerpt" });
    renderHighlighted(excerpt, hit.excerpt, hit.match_ranges ?? []);
    el.createDiv({
      cls: "softmatcha-meta",
      text: `${hit.line + 1}行目 · 類似度 ${hit.score.toFixed(3)}`,
    });
  }
  onChooseSuggestion(hit: Hit, event: MouseEvent | KeyboardEvent) {
    void this.openHit(hit, event);
  }
  async openHit(hit: Hit, event: MouseEvent | KeyboardEvent) {
    const f = this.app.vault.getAbstractFileByPath(hit.path);
    if (!(f instanceof TFile)) {
      new Notice(
        "この端末にノートがありません。vaultの同期状態を確認してください。",
      );
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
    this.closed = true;
    this.generation++;
    clearTimeout(this.timer);
    this.pending?.([]);
    this.pending = undefined;
  }
}
export class Settings extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: SearchHost,
  ) {
    super(app, plugin);
  }
  display() {
    this.containerEl.empty();
    this.containerEl.createEl("p", {
      text: "WASMは端末内で検索し、起動時にモデルと索引を準備します。初回準備には時間がかかります。検索サービスも選択できます。",
    });
    new Setting(this.containerEl).setName("検索エンジン").addDropdown((d) =>
      d
        .addOption("wasm", "端末内のWASM")
        .addOption("remote", "検索サービス")
        .setValue(this.plugin.config.engine)
        .onChange(async (value) => {
          this.plugin.config.engine = value as "remote" | "wasm";
          await this.plugin.save();
        }),
    );
    for (const [key, name, desc] of [
      [
        "endpoint",
        "検索サービスURL",
        "Mac単体: http://127.0.0.1:8769。iOS: 到達可能なHTTPSアドレス。",
      ],
      [
        "token",
        "アクセストークン",
        "サービスのSOFTMATCHA_TOKENと一致させます。端末のプラグイン設定に保存されます。",
      ],
      ["corpus", "コーパスID", "サーバー側で許可されたコーパス名。"],
    ] as const) {
      new Setting(this.containerEl)
        .setName(name)
        .setDesc(desc)
        .addText((t) => {
          t.setValue(this.plugin.config[key]).onChange(async (v) => {
            this.plugin.config[key] = v;
            await this.plugin.save();
          });
          if (key === "token") t.inputEl.type = "password";
        });
    }
    new Setting(this.containerEl).setName("類似度の下限").addSlider((s) =>
      s
        .setLimits(0.1, 1, 0.05)
        .setValue(this.plugin.config.similarity)
        .setDynamicTooltip()
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
