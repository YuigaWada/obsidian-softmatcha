"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => SoftMatchaPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var defaults = { endpoint: "http://127.0.0.1:8769", token: "", corpus: "default", similarity: 0.45, limit: 50 };
var SoftMatchaPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.config = defaults;
    this.activeSearch = Promise.resolve();
    this.warmState = "\u6E96\u5099\u4E2D\u2026";
    this.stopped = false;
    this.warmVersion = 0;
  }
  async onload() {
    this.config = { ...defaults, ...await this.loadData() };
    this.addCommand({ id: "search", name: "Search vault", hotkeys: [{ modifiers: ["Mod", "Shift"], key: "O" }], callback: () => new Search(this.app, this).open() });
    this.addRibbonIcon("search", "SoftMatcha Search", () => new Search(this.app, this).open());
    this.addSettingTab(new Settings(this.app, this));
    this.app.workspace.onLayoutReady(() => {
      if (!this.stopped) void this.prepareInBackground();
    });
  }
  onunload() {
    this.stopped = true;
    this.warmVersion++;
    clearTimeout(this.warmTimer);
  }
  async save() {
    await this.saveData(this.config);
    clearTimeout(this.warmTimer);
    void this.prepareInBackground();
  }
  serviceUrl(path) {
    const url = new URL(path, this.config.endpoint);
    if (url.protocol !== "https:" && !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw Error("\u30EA\u30E2\u30FC\u30C8\u63A5\u7D9A\u306B\u306FHTTPS\u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
    return url.toString();
  }
  async prepareInBackground(attempt = 0, version = ++this.warmVersion) {
    if (this.stopped || version !== this.warmVersion) return;
    try {
      if (!this.config.token) {
        this.warmState = "\u8A2D\u5B9A\u3067\u691C\u7D22\u30B5\u30FC\u30D3\u30B9\u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044";
        return;
      }
      const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${this.config.token}` };
      const r = await (0, import_obsidian.requestUrl)({ url: this.serviceUrl("/v1/warmup"), method: "POST", headers, body: JSON.stringify({ corpus: this.config.corpus }), throw: false });
      if (this.stopped || version !== this.warmVersion) return;
      if (r.status !== 200) throw Error(`HTTP ${r.status}`);
      if (r.json?.warmed) {
        this.warmState = "\u691C\u7D22\u6E96\u5099\u5B8C\u4E86";
        return;
      }
      this.warmState = "\u30E2\u30C7\u30EB\u30FB\u7D22\u5F15\u3092\u6E96\u5099\u4E2D\u2026";
    } catch (e) {
      if (this.stopped || version !== this.warmVersion) return;
      this.warmState = "\u691C\u7D22\u30B5\u30FC\u30D3\u30B9\u306B\u672A\u63A5\u7D9A";
    }
    if (attempt < 60 && !this.stopped) this.warmTimer = setTimeout(() => void this.prepareInBackground(attempt + 1, version), 2e3);
  }
  async query(query) {
    const url = this.serviceUrl("/v1/search");
    const r = await (0, import_obsidian.requestUrl)({ url, method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.config.token}` }, body: JSON.stringify({ query, corpus: this.config.corpus, limit: this.config.limit, min_similarity: this.config.similarity }), throw: false });
    if (r.status !== 200) throw Error(r.json?.detail ?? `\u691C\u7D22\u30B5\u30FC\u30D3\u30B9: HTTP ${r.status}`);
    return r.json;
  }
};
var Search = class extends import_obsidian.SuggestModal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.generation = 0;
    this.closed = false;
    this.composing = false;
    this.setPlaceholder("SoftMatcha 2\u3067\u691C\u7D22\u2026");
    this.setInstructions([{ command: "\u2191\u2193", purpose: "\u9078\u629E" }, { command: "Enter", purpose: "\u958B\u304F" }, { command: "\u2318/Ctrl+Enter", purpose: "\u65B0\u3057\u3044\u30BF\u30D6" }, { command: "Alt+Enter", purpose: "\u30EA\u30F3\u30AF\u633F\u5165" }]);
    this.status = this.modalEl.createDiv({ cls: "softmatcha-status", text: plugin.warmState });
    this.inputEl.addEventListener("compositionstart", () => {
      this.composing = true;
    });
    this.inputEl.addEventListener("compositionend", () => {
      this.composing = false;
      this.inputEl.dispatchEvent(new Event("input"));
    });
  }
  getSuggestions(query) {
    const id = ++this.generation;
    clearTimeout(this.timer);
    this.pending?.([]);
    this.pending = void 0;
    if (!query.trim() || this.composing || this.closed) return Promise.resolve([]);
    return new Promise((resolve) => {
      this.pending = resolve;
      this.timer = setTimeout(async () => {
        if (id !== this.generation) {
          resolve([]);
          return;
        }
        const previous = this.plugin.activeSearch;
        let done;
        this.plugin.activeSearch = new Promise((r) => {
          done = r;
        });
        await previous;
        if (id !== this.generation || this.closed) {
          done();
          resolve([]);
          return;
        }
        this.status.setText("\u691C\u7D22\u4E2D\u2026");
        try {
          const r = await this.plugin.query(query.trim());
          if (id === this.generation && !this.closed) {
            this.status.setText(r.message ?? `${r.results.length}\u4EF6 \xB7 SoftMatcha 2`);
            resolve(r.results);
          } else resolve([]);
        } catch (e) {
          if (id === this.generation && !this.closed) this.status.setText(`${e instanceof Error ? e.message : e} \u2014 \u8A2D\u5B9A\u3067\u63A5\u7D9A\u5148\u30FB\u30C8\u30FC\u30AF\u30F3\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002`);
          resolve([]);
        } finally {
          done();
          if (id === this.generation) this.pending = void 0;
        }
      }, 80);
    });
  }
  renderSuggestion(hit, el) {
    el.createDiv({ cls: "softmatcha-title", text: hit.path.replace(/\.md$/, "") });
    const excerpt = el.createDiv({ cls: "softmatcha-excerpt" });
    renderHighlighted(excerpt, hit.excerpt, hit.match_ranges ?? []);
    el.createDiv({ cls: "softmatcha-meta", text: `${hit.line + 1}\u884C\u76EE \xB7 \u985E\u4F3C\u5EA6 ${hit.score.toFixed(3)}` });
  }
  onChooseSuggestion(hit, event) {
    void this.openHit(hit, event);
  }
  async openHit(hit, event) {
    const f = this.app.vault.getAbstractFileByPath(hit.path);
    if (!(f instanceof import_obsidian.TFile)) {
      new import_obsidian.Notice("\u3053\u306E\u7AEF\u672B\u306B\u30CE\u30FC\u30C8\u304C\u3042\u308A\u307E\u305B\u3093\u3002vault\u306E\u540C\u671F\u72B6\u614B\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      return;
    }
    if (event.altKey) {
      const editor = this.app.workspace.activeEditor?.editor;
      if (editor) editor.replaceSelection(this.app.fileManager.generateMarkdownLink(f, this.app.workspace.getActiveFile()?.path ?? ""));
      return;
    }
    const leaf = this.app.workspace.getLeaf(event.metaKey || event.ctrlKey ? "tab" : false);
    await leaf.openFile(f, { eState: { line: hit.line } });
  }
  onClose() {
    this.closed = true;
    this.generation++;
    clearTimeout(this.timer);
    this.pending?.([]);
    this.pending = void 0;
  }
};
var Settings = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    this.containerEl.empty();
    this.containerEl.createEl("p", { text: "SoftMatcha 2\u30B5\u30FC\u30D3\u30B9\u304C\u7D22\u5F15\u5316\u3057\u305Fvault\u3068\u540C\u3058vault\u3092\u4F7F\u3063\u3066\u304F\u3060\u3055\u3044\u3002\u30AF\u30E9\u30A4\u30A2\u30F3\u30C8\u306F\u30CE\u30FC\u30C8\u3092\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u3057\u307E\u305B\u3093\u3002iOS\u3067\u306FMac\u7B49\u306E\u30B5\u30FC\u30D3\u30B9\u3078HTTPS\u3067\u63A5\u7D9A\u3057\u307E\u3059\u3002" });
    for (const [key, name, desc] of [["endpoint", "\u691C\u7D22\u30B5\u30FC\u30D3\u30B9URL", "Mac\u5358\u4F53: http://127.0.0.1:8769\u3002iOS: \u5230\u9054\u53EF\u80FD\u306AHTTPS\u30A2\u30C9\u30EC\u30B9\u3002"], ["token", "\u30A2\u30AF\u30BB\u30B9\u30C8\u30FC\u30AF\u30F3", "\u30B5\u30FC\u30D3\u30B9\u306ESOFTMATCHA_TOKEN\u3068\u4E00\u81F4\u3055\u305B\u307E\u3059\u3002\u7AEF\u672B\u306E\u30D7\u30E9\u30B0\u30A4\u30F3\u8A2D\u5B9A\u306B\u4FDD\u5B58\u3055\u308C\u307E\u3059\u3002"], ["corpus", "\u30B3\u30FC\u30D1\u30B9ID", "\u30B5\u30FC\u30D0\u30FC\u5074\u3067\u8A31\u53EF\u3055\u308C\u305F\u30B3\u30FC\u30D1\u30B9\u540D\u3002"]]) {
      new import_obsidian.Setting(this.containerEl).setName(name).setDesc(desc).addText((t) => {
        t.setValue(this.plugin.config[key]).onChange(async (v) => {
          this.plugin.config[key] = v;
          await this.plugin.save();
        });
        if (key === "token") t.inputEl.type = "password";
      });
    }
    new import_obsidian.Setting(this.containerEl).setName("\u985E\u4F3C\u5EA6\u306E\u4E0B\u9650").addSlider((s) => s.setLimits(0.1, 1, 0.05).setValue(this.plugin.config.similarity).setDynamicTooltip().onChange(async (v) => {
      this.plugin.config.similarity = v;
      await this.plugin.save();
    }));
  }
};
function renderHighlighted(el, text, ranges) {
  const valid = ranges.filter(([a, b]) => Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b > a && b <= text.length).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [a, b] of valid) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  let offset = 0;
  for (const [a, b] of merged) {
    el.appendText(text.slice(offset, a));
    el.createEl("mark", { cls: "softmatcha-match", text: text.slice(a, b) });
    offset = b;
  }
  el.appendText(text.slice(offset));
}
