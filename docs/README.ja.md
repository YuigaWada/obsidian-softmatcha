# SoftMatcha for Obsidian

言葉が少し違っていても、思い出したいノートの一節へ。

**SoftMatcha Search** は、英語と日本語に対応したObsidian用のローカル検索プラグインです。
ファイル名・本文の文字列一致ですぐに検索でき、任意のモデルを追加すると
[SoftMatcha 2](https://github.com/softmatcha/softmatcha2)で意味の近い単語を含む箇所も探せます。

[English](../README.md) · [使い方の詳細（英語）](USAGE.md)

## ドキュメント

- [検索・設定・モデル導入（英語）](USAGE.md)
- [プライバシーと保存データ](PRIVACY.md)

## インストール

Obsidianのコミュニティディレクトリには、まだ掲載されていません。

リリース提供後は、[リリースページ](https://github.com/YuigaWada/SoftMatcha-for-Obsidian/releases)から
`main.js`・`manifest.json`・`styles.css` をダウンロードし、
`<vault設定ディレクトリ>/plugins/softmatcha-search/` に置きます。
Obsidianのコミュニティプラグイン設定で **SoftMatcha Search** を有効にしてください。
既定のvault設定ディレクトリは `.obsidian` です。
配布ZIPの `softmatcha-for-obsidian.zip` を同じ場所に展開しても導入できます。

ファイル名と本文の文字列一致は、モデルをダウンロードせずに使えます。

### 意味検索を有効にする

1. プラグインと同じリリースの `models-ja-<version>.zip` または `models-en-<version>.zip` を取得します。
2. **設定 → SoftMatcha Search → モデルパックを取り込む** からZIPを選択します。
3. 同じ設定画面で、利用する言語の意味検索を有効にします。

モデルは任意で、手動で取り込んで端末内に保存します。
アカウント・課金・APIキー・Service URLの設定は必要ありません。
モデルパックは各端末で取り込んでください。同期サービスが追加ファイルまで転送するとは限りません。

## 主な機能

- **Markdownノートを検索**：ファイル名・本文の文字列一致に加え、モデル導入後は意味の近い単語でも検索。
- **英語と日本語に対応**：意味検索を言語ごとにオン・オフ。無効なモデルは読み込みません。
- **一致箇所をハイライト**：実際に一致した原文に色を付け、空行を省いたコンパクトな抜粋を表示。
- **キーボードで操作**：候補選択、一致行を開く、新規タブで開く、Markdownリンク挿入。
- **起動時にバックグラウンドで準備**：索引を端末内に保存し、次回以降の起動で復元。
- **端末内で検索**：Rust/WebAssemblyの検索エンジンをWorkerで実行。
- **日英のUI**：Obsidianの言語に追従、または設定で固定。

## 使い方

コマンドパレットから **SoftMatcha Search: 検索** を実行するか、リボンの検索アイコンを押します。
**設定 → ホットキー** で、Macは **⌘⇧O**、その他は **Ctrl+Shift+O** を割り当てると便利です。
既定のホットキーは自動設定しません。

| キー | 操作 |
| --- | --- |
| ↑ / ↓ | 検索候補を選択 |
| Enter | ノートの一致行を開く |
| ⌘/Ctrl+Enter | 新しいタブで開く |
| Alt+Enter | アクティブなエディターにMarkdownリンクを挿入 |

検索でノートは書き換えません。リンク挿入を選んだ場合だけ、エディターへ書き込みます。

## 対応環境と制約

**Obsidian 1.8.7以降**が必要です。macOS / Obsidian 1.15.0で検索・設定画面を確認済みです。
iOS・Android・Windows・LinuxのObsidian実機では未検証です。CIの検証結果とは区別しています。

両モデルと日本語辞書の展開後サイズは約 **135 MiB** で、別途RAMも必要です。
大きなvaultの初回索引構築には1分以上かかる場合があります。
次回以降は索引を復元しますが、モデルのメモリ展開は毎回必要です。
片言語だけ有効にするか、文字列一致だけを使うこともできます。

意味検索は各言語内で単語の近さを扱います。翻訳検索や文書への質問応答は提供しません。
意味検索は12トークン以内です。PDF・画像のOCRやOmnisearchの検索構文には対応していません。

## プライバシー

ノートをアップロードせず、端末内で検索します。テレメトリはありません。
モデルはプラグインの設定フォルダー、本文と位置情報を含む索引はアプリのIndexedDBに保存します。
詳しくは[プライバシーガイド](PRIVACY.md)を参照してください。

## ライセンス

独自コードと、このREADMEを含む独自ドキュメントは[MIT](../LICENSE)です。SoftMatcha 2移植部分はApache-2.0と一部MIT、
fastTextモデルはCC BY-SA 3.0、日本語辞書は元の配布条件を維持します。
[第三者ライセンス通知](../licenses/THIRD_PARTY_NOTICES.md)と[ライセンス全文](../licenses/)を参照してください。

## 謝辞

[SoftMatcha 2](https://github.com/softmatcha/softmatcha2)、[fastText](https://fasttext.cc/)、
[kuromoji.js](https://github.com/takuyaa/kuromoji.js)を使用しています。
本プラグインは独立したコミュニティによる実装です。
