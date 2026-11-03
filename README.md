# SoftMatcha-for-Obsidian

SoftMatcha 2の検索をObsidianで使うプラグインです。0.2.0ではDDD / Clean Architectureで再構成し、端末内のWASMと既存検索サービスのアダプターを用意しました。設計は [ARCHITECTURE.md](ARCHITECTURE.md) に記載しています。
⌘⇧O（Windows/LinuxはCtrl+Shift+O）で検索窓、↑↓で選択、Enterでノートへ移動、⌘/Ctrl+Enterで新タブ、Alt+Enterでリンク挿入。

## 構成と対応範囲

- クライアント: Obsidian公開APIとWeb APIのみ。macOS / Windows / Linux / iOS / Android向け。iOS/Android実機検証は未実施。
- 既定の端末内検索: 公式SoftMatcha 2のRust検索コアをWASMへ移植。Web Workerで常駐させ、IndexedDBに索引を保存します。ローカル検索にサーバーは不要です。iOS/Android実機は未検証です。
- 検索サービス: 従来のPython/Rust実装も設定で選べます。大きなvaultや常時稼働するサービスを利用する場合の選択肢です。
- Markdown本文を索引化。PDF/OCR、Omnisearchの検索構文・Vim操作等の完全互換は未実装。
- 公式エンジンの制約により検索語はトークン化後12語以内。未登録語は明示的なエラーになります。日本語はfastText日本語モデルとMeCabを使います。既定は公式crawlベクトルの上位5万語（保存サイズ約59MB）です。語彙を絞っているため固有名詞・専門語が未登録になる場合があります。多言語モデルの横断検索を保証しません。
- ノートはアップロードしません。サービスが読み取るvaultを指定してください。iOSとサービスで同じ相対パスのノートを同期しておきます。

## インストール

```sh
npm ci
# Rust / wasm32-unknown-unknown標準ライブラリ / wasm-pack / linkerも必要
npm run build
# 初回のみ公開モデルを用意する（既存サーバーのモデルがあれば再利用）
server/.venv/bin/python -c "from pathlib import Path; import sys; sys.path.insert(0, 'server'); from model_adapter import prepare; prepare(Path('server/state/models/compact-ja'))"
npm run assets
# main.js / manifest.json / styles.css / assets/ を
# vaultの .obsidian/plugins/softmatcha-search/ へコピー
```

ビルドでは未生成・更新されたRustコードをWASMへ変換します。Python環境は後述の `server/setup.sh` で作成できます。モデルと辞書の配布ファイルは約76MBで、ZIPにも含めます。ソースGitには含めません。

Obsidianのコミュニティプラグインで有効化してください。既存のOmnisearchが⌘⇧Oを使用する場合はその割り当てを解除します。

## 検索サービス

Python 3.12、Rust、uv、C/C++ビルド環境、pkg-config、ICU開発ライブラリが必要です。
macOSではネイティブCPU用Pythonを使ってください。Intel macOSで最新版Torchを含む公式依存関係は利用できない場合があるため、その場合はLinuxコンテナを使用します。

```sh
bash server/setup.sh
# トークンは24文字以上のランダム値を自分で生成して指定する
export SOFTMATCHA_TOKEN='replace-with-a-long-random-token'
bash server/run.sh --vault /absolute/path/to/vault --state /absolute/path/to/index --exclude output --exclude tools
```

初回は公式fastText crawlベクトルをストリームで読み、5万語に達したら通信を終了して軽量モデルを作ります。モデルはCC BY-SA 3.0、取得元・変更内容を索引ディレクトリのSOURCE.txtに保存します。公式7.2GBモデルも `--backend fasttext --model fasttext-ja-vectors` で選べますが、別途大きな容量が必要です。
設定でURL（初期値 http://127.0.0.1:8769）、同じトークン、コーパスID（default）を指定します。
状態は認証付きの `GET /v1/status` で確認できます。初回構築中は検索窓に待機メッセージが出ます。

Linuxコンテナでは `server` をビルドコンテキストとしてDockerfileを使用できます。`/vault`を読み取り専用、`/state`とモデルキャッシュを永続ボリュームでマウントし、SOFTMATCHA_TOKENを設定してください。

## iOS・別のPC

端末内検索では `assets/` を含むプラグイン一式を端末へ配置してください。Obsidianの同期方法によってはプラグイン内の追加ファイルが転送されないため、配置状況を確認してください。初回索引はバックグラウンドで作り、次回からはキャッシュを復元します。アプリがキャッシュを破棄した場合は再構築します。WASMの実機動作とメモリ上限は未検証です。

検索サービスを選ぶ場合は、サービスを常時稼働できるMac/Linux等に配置し、HTTPSリバースプロキシやプライベートネットワーク経由で接続します。リモートの平文HTTPはクライアントが拒否します。localhostはiPhone自身を指すため、iOSではサーバーのHTTPSアドレスを設定します。
サービスの既定バインドは127.0.0.1です。必要なネットワーク構成でのみ `--host` を指定してください。検索クエリと結果の抜粋は指定サービスを通ります。トークンはプラグイン設定に保存されるため、設定ファイルの共有には注意してください。

## スケーリングと更新

安定したパスハッシュで8区画に分割し、内容ハッシュが変わった区画だけ再構築します（`--shards 1..128`）。60秒ごとにvaultを走査します。原文は変更しません。
完成した全区画が揃ってから世代を交換し、構築失敗時は前の索引を維持します。検索はメモリマップと最大8区画のLRUキャッシュと、区画間で共有する正規化済み単語ベクトル、同時検索1件、候補・結果・実行時間上限を使用します。検索途中の世代は変更しません。
現在は単一サービス・単一コーパスです。大規模な多人数利用はコーパスごとにサービスを分けてルーティングする構成を想定します。全件走査コスト、索引構築時のRAM、初回モデルロード時間、古い索引のディスク使用量は残ります。古い世代の自動削除は実装していません。

## 検証

`npm run build` でTypeScriptとブラウザ向けバンドルを検証。
サーバーのテストは `python -m pytest tests/test_service.py` （fastapi / httpx / pytest必要）。
実端末・大規模vaultでの性能や日本語検索品質は別途検証が必要です。

公式エンジン: https://github.com/softmatcha/softmatcha2
固定コミット: b37e104741465a31425db5f07202d8065af7d571
プラグイン・サービスコードはMIT。SoftMatcha 2はApache-2.0および一部MIT。公式ソースのライセンスは変更せず使用します。

## このvaultでの再起動

`bash tools/softmatcha-search/server/start-local.sh` で、このvault専用サービスを再開できます。認証情報は既存のプラグイン設定から読み、コマンドやログには出力しません。Obsidianを再読み込みするとインストール済みプラグインが読み込まれます。

## 上流互換パッチ

`server/compat.patch` は小さい索引の挿入候補が少ない場合にRustが範囲外アクセスする問題を修正します。固定コミットに適用し、小型の人工ベクトルと実際のRust検索を使った結合テストを用意しています。

## 0.1.1の性能改善

8区画を2枠のキャッシュで順番に読むことによる再読込と、語彙ベクトルの区画ごとの再正規化を除去しました。既定8区画を保持し、正規化済み語彙ベクトルを共有します。行番号はキャッシュ済み改行位置から二分探索します。入力の待機時間は180msから80msへ変更しました。

2026-11-03、このvault・5万語モデル・50件上限のローカル直接呼び出しで、修正前の繰り返し検索2.913秒に対し、修正後の温かい検索は0.046〜0.062秒。初回0.913秒。例は「検索」「機械学習」「人工知能」で、広範なベンチマークではありません。UIの待機・通信・描画時間は含みません。候補上限・結果上限・類似度閾値は同じです。モデルを拡大するとこれらの数字が保たれるとは限りません。

フルモデルはダウンロードするだけでは検索は高速化しません。語彙の拡大を目的に別途保存し、索引を再構築して速度と品質を評価してから切り替えます。

## 0.1.3の起動時準備

Obsidianのレイアウト準備完了時に、検索窓を開かずに認証付きPOST /v1/warmupを非同期で送ります。サービス側も起動時・索引世代更新後にモデル、辞書、共有正規化ベクトル、索引と改行情報を先読みします。同じ世代の準備は再実行しません。クライアントの準備状態と検索要求の直列化はプラグイン単位で保持します。検索窓の開閉ではモデルを破棄しません。

未接続・初回索引作成中は2秒間隔で最大約2分再試行し、プラグインの無効化時にタイマーを停止します。Obsidian起動はウォームアップ完了を待ちません。サービスの起動そのものは引き続きstart-local.sh等で行います。プロセス再起動、索引変更、キャッシュ追い出し時には読み込みが必要です。


## 0.2.0の設計移行

表示名は **SoftMatcha-for-Obsidian**。内部ID `softmatcha-search` は既存設定・ホットキーを引き継ぐため維持しています。

移行前スナップショットはこのディレクトリ専用Gitの `57cd2c2`。以降の設計移行は、この独立リポジトリの履歴で管理します。

`npm test` はモデルをダウンロードしません。日本語WASM結合テストには `npm run assets` で作った公開アセットが必要です。`cargo test --manifest-path rust/Cargo.toml -p softmatcha-core` と `server/.venv/bin/python -m pytest tests -q` でコアとネイティブ経路を確認できます。

`node scripts/benchmark-wasm.mjs /absolute/path/to/vault` はローカルで件数と処理時間だけを出力します。ノート内容を外部へ送信しません。ベンチマークのIndexedDBはテスト用でプロセス終了時に失われます。

2026-11-03のWASM計測（Node Worker、908ノート・約7.2MB・5万語モデル）: モデル・辞書の展開660ms、初回索引89.1秒、8シャードのキャッシュ復元475ms、検索27〜160ms。UIの80ms待機・ファイル読込・描画を含みません。iOSの性能を表すものではありません。記録は `tests/performance-wasm.json`。

macOSのObsidian 1.15.0でプラグインを再読み込みし、実WASMの「今日の」検索が50件返ること、本文の小さいフォント・高さ制限の解除・一致部分のハイライトを画面で確認済み。iOS/Android実機は未検証。
