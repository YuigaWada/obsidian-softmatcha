import type { UiLocale, SearchConfig } from "../domain/search";
const ja = {
  models: "意味検索モデル",
  importPack: "モデルパックを取り込む",
  importInfo:
    "有効な言語のモデルをGitHubから取得します。取得済みモデルは再利用し、ノートや検索語は送信しません。ZIPの手動取り込みも使えます。",
  modelDownloads: "モデル配布ページ",
  autoDownload: "モデルを自動取得",
  autoDownloadInfo:
    "有効な言語の不足モデルを起動後にバックグラウンドで取得します。日本語約51 MiB・英語約32 MiB。Wi-Fiまたはモバイル通信を使用します。オフにすると自動取得しません。",
  downloading: "モデルをバックグラウンドでダウンロード中…",
  downloadFailed:
    "ダウンロードできませんでした。通信状態を確認して再度お試しください。ZIPの手動取り込みも利用できます。",
  downloadMissing:
    "このバージョンのモデルはまだ公開されていません。時間を置いて再度お試しください。",
  downloadCancelled: "モデルの取り込みを中止しました。",
  modelBusy: "別のモデルを取り込み中です。完了してからお試しください。",
  importing: "モデルパックを検証・保存中…",
  imported: "モデルパックを取り込みました。",
  invalidPack:
    "このモデルパックは使用できません。現在のプラグイン版に対応する配布ファイルを選んでください。",
  unavailable: "モデル未導入・文字列一致のみ",

  search: "検索",
  placeholder: "SoftMatcha 2で検索…",
  select: "選択",
  open: "開く",
  newTab: "新しいタブ",
  insertLink: "リンク挿入",
  searching: "検索中…",
  preparing: "準備中…",
  ready: "検索準備完了",
  indexing: "モデル・索引を準備中…",
  prepareError: "準備エラー",
  filename: "ファイル名の一致",
  missingNote:
    "この端末にノートがありません。vaultの同期状態を確認してください。",
  info: "検索は端末内で処理します。モデル導入後は起動時に索引を準備します。初回準備には時間がかかります。",
  uiLanguage: "UIの言語",
  automatic: "自動（Obsidianの表示言語）",
  semanticJa: "日本語の意味検索",
  semanticEn: "英語の意味検索",
  semanticDesc:
    "端末内検索で使用するモデル。オフにするとそのモデルを読み込みません。両方オフでも文字列一致は検索できます。",
  similarity: "類似度の下限",
  unknown: "未登録語のため文字列一致のみ",
  disabled: "意味検索オフ・文字列一致のみ",
  invalidQuery: "検索語は1〜512文字で指定してください。",
  tooManyTokens: "検索語は分かち書き後12トークン以内にしてください。",
  engineStopped: "検索エンジンを停止しました。",
  assetsMissing:
    "検索モデルが見つかりません。プラグインのassetsフォルダーを確認してください。",
};
const en: Record<keyof typeof ja, string> = {
  models: "Semantic search models",
  importPack: "Import model pack",
  importInfo:
    "Enabled language models are fetched from GitHub and reused on this device. Notes and search queries are never sent. Manual ZIP import is also available.",
  modelDownloads: "Model downloads",
  autoDownload: "Download models automatically",
  autoDownloadInfo:
    "Missing models for enabled languages download in the background after startup: about 51 MiB for Japanese and 32 MiB for English. Uses Wi-Fi or mobile data. Switch off to prevent automatic downloads.",
  downloading: "Downloading model in the background…",
  downloadFailed:
    "Download failed. Check your connection and try again, or import a ZIP manually.",
  downloadMissing:
    "Models for this version have not been published yet. Please try again later.",
  downloadCancelled: "Model setup cancelled.",
  modelBusy: "Another model import is running. Wait for it to finish.",
  importing: "Checking and saving model pack…",
  imported: "Model pack imported.",
  invalidPack:
    "This model pack cannot be used. Choose a pack made for this plugin version.",
  unavailable: "Models not installed: exact text matches only",

  search: "Search vault",
  placeholder: "Search with SoftMatcha 2…",
  select: "Select",
  open: "Open",
  newTab: "New tab",
  insertLink: "Insert link",
  searching: "Searching…",
  preparing: "Preparing…",
  ready: "Ready to search",
  indexing: "Preparing models and index…",
  prepareError: "Preparation failed",
  filename: "Filename match",
  missingNote: "This note is not on this device. Check vault sync.",
  info: "Search runs on this device. With models installed, indices are prepared at startup. Initial preparation can take time.",
  uiLanguage: "UI language",
  automatic: "Automatic (Obsidian language)",
  semanticJa: "Japanese semantic search",
  semanticEn: "English semantic search",
  semanticDesc:
    "Models for on-device search. Disabled models are not loaded. Exact text search works even with both disabled.",
  similarity: "Minimum similarity",
  unknown: "Unknown words: exact text matches only",
  disabled: "Semantic search off: exact text matches only",
  invalidQuery: "Enter a query between 1 and 512 characters.",
  tooManyTokens: "Use at most 12 tokens per query.",
  engineStopped: "The search engine has stopped.",
  assetsMissing: "Search models are missing. Check the plugin assets folder.",
};
export type MessageKey = keyof typeof ja;
export function messages(locale: UiLocale) {
  return locale === "ja" ? ja : en;
}
export function resolveLocale(
  preference: SearchConfig["uiLanguage"],
  obsidianLanguage: string,
): UiLocale {
  return preference === "ja" || preference === "en"
    ? preference
    : obsidianLanguage.toLowerCase().startsWith("ja")
      ? "ja"
      : "en";
}
export function errorText(error: unknown, locale: UiLocale): string {
  const code = (error as { code?: string })?.code;
  if (code && code in ja) return messages(locale)[code as MessageKey];
  return error instanceof Error ? error.message : String(error);
}
export function resultCount(count: number, locale: UiLocale): string {
  return locale === "ja"
    ? `${count}件`
    : `${count} result${count === 1 ? "" : "s"}`;
}
