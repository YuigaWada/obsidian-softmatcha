import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
function fixture() {
  class Element {
    constructor() {
      this.listeners = {};
      this.children = [];
    }
    createDiv(options = {}) {
      const child = new Element();
      child.cls = options.cls;
      child.text = options.text;
      this.children.push(child);
      return child;
    }
    createEl(tag, options = {}) {
      const child = this.createDiv(options);
      child.tag = tag;
      return child;
    }
    appendText(text) {
      this.children.push({ text });
    }
    setText(s) {
      this.text = s;
    }
    addEventListener(k, f) {
      this.listeners[k] = f;
    }
    dispatchEvent() {}
  }
  let modal, request, layoutReady, worker;
  class FakeWorker {
    requests = [];
    constructor() {
      worker = this;
    }
    postMessage(message) {
      this.requests.push(message);
      if (message.type === "search")
        request = { body: JSON.stringify(message.payload) };
      queueMicrotask(() =>
        this.onmessage?.({
          data: {
            id: message.id,
            value:
              message.type === "search" ? { results: [], mode: "wasm" } : true,
          },
        }),
      );
    }
    terminate() {}
  }

  class Plugin {
    async loadData() {
      return {};
    }
    addCommand(c) {
      this.command = c;
    }
    addRibbonIcon() {}
    addSettingTab() {}
    registerInterval() {}
    async saveData() {}
  }
  class SuggestModal {
    constructor(app) {
      this.app = app;
      this.inputEl = new Element();
      this.modalEl = new Element();
      modal = this;
    }
    setPlaceholder() {}
    setInstructions() {}
    open() {}
  }
  const obsidian = {
    Plugin,
    SuggestModal,
    PluginSettingTab: class {},
    Setting: class {},
    TFile: class {},
    Notice: class {},
    normalizePath: (path) => path,
  };
  const exports = {};
  const context = {
    exports,
    module: { exports },
    require: (n) => {
      assert.equal(n, "obsidian");
      return obsidian;
    },
    setTimeout,
    clearTimeout,
    window: { setTimeout, clearTimeout, setInterval: () => 0 },
    URL,
    Event,
    Blob,
    Worker: FakeWorker,
    queueMicrotask,
  };
  vm.runInNewContext(fs.readFileSync("main.js", "utf8"), context);
  const P = context.module.exports.default;
  const p = new P();
  p.manifest = { id: "softmatcha-search" };
  p.app = {
    vault: {
      configDir: ".obsidian",
      getName: () => "test",
      getMarkdownFiles: () => [],
      adapter: {
        exists: async () => false,
        read: async () => {
          throw Error("File not found");
        },
      },
    },
    workspace: {
      onLayoutReady: (callback) => {
        layoutReady = callback;
      },
    },
  };
  return {
    p,
    Element,
    startup: () => layoutReady(),
    get worker() {
      return worker;
    },
    get modal() {
      return modal;
    },
    get request() {
      return request;
    },
  };
}
test("command, debounce, IME, close cancellation", async () => {
  const f = fixture();
  await f.p.onload();
  assert.equal(f.p.command.id, "search");
  assert.equal(f.p.command.hotkeys, undefined);
  f.p.command.callback();
  const m = f.modal;
  const first = m.getSuggestions("古い検索");
  const second = m.getSuggestions("日本語");
  assert.equal((await first).length, 0);
  await second;
  assert.equal(JSON.parse(f.request.body).query, "日本語");
  m.inputEl.listeners.compositionstart();
  assert.equal((await m.getSuggestions("変換中")).length, 0);
  m.inputEl.listeners.compositionend();
  const pending = m.getSuggestions("終了前");
  m.onClose();
  assert.equal((await pending).length, 0);
});

test("only the actual matching substring gets an inline background", async () => {
  const f = fixture();
  await f.p.onload();
  f.p.command.callback();
  const root = new f.Element();
  const text = "😀<img src=x>金メダル受賞者です";
  const start = text.indexOf("金");
  f.modal.renderSuggestion(
    {
      path: "研究.md",
      line: 0,
      score: 0.9,
      excerpt: text,
      match_ranges: [[start, start + 3]],
    },
    root,
  );
  const excerpt = root.children.find((x) => x.cls === "softmatcha-excerpt");
  assert.equal(excerpt.children.filter((x) => x.tag === "mark").length, 1);
  assert.equal(
    excerpt.children.find((x) => x.tag === "mark").text,
    "金メダル".slice(0, 3),
  );
  assert.equal(excerpt.children.map((x) => x.text).join(""), text);
  assert.equal(
    excerpt.children.some((x) => x.tag === "img"),
    false,
  );
});

test("local preparation starts at application layout readiness without opening a search window", async () => {
  const f = fixture();
  await f.p.onload();
  assert.equal(f.request, undefined);
  f.startup();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(f.worker.requests[0].type, "init");
  assert.equal(f.worker.requests[0].payload.models.length, 0);
  assert.equal(f.modal, undefined);
  f.p.onunload();
});

test("blank excerpt lines are omitted without shifting Unicode highlights or source line numbers", async () => {
  const f = fixture();
  await f.p.onload();
  f.p.command.callback();
  const root = new f.Element();
  const text = "\r\n前文\r\n  \t\r\n\r\n😀金メダル\n\n後文\n";
  const start = text.indexOf("金");
  f.modal.renderSuggestion(
    {
      path: "研究.md",
      line: 34,
      score: 1,
      excerpt: text,
      match_ranges: [[start, start + 4]],
    },
    root,
  );
  const excerpt = root.children.find((x) => x.cls === "softmatcha-excerpt");
  assert.equal(
    excerpt.children.map((x) => x.text).join(""),
    "前文\n😀金メダル\n後文",
  );
  assert.equal(excerpt.children.find((x) => x.tag === "mark").text, "金メダル");
  assert.match(
    root.children.find((x) => x.cls === "softmatcha-meta").text,
    /35/,
  );
});
