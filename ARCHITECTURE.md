# SoftMatcha-for-Obsidian の設計

独立Gitリポジトリはこのディレクトリの `.git/`。移行前の実装は `57cd2c2` に保存した。vault本体のGit履歴とは別管理で、モデル、索引、依存物、ノート本文はこの履歴へ追加しない。

## 境界と用語

検索コンテキストは検索語、候補、類似度、一致範囲を扱う。候補の識別はノート相対パスと行番号。一致範囲は表示する抜粋内のUTF-16オフセットであり、モデルが置換した実際の原文に付ける。

索引コンテキストは文書、トークン、シャード、索引世代を扱う。文書の識別は相対パス。シャードは安定したパスハッシュで分割する。文書内容とモデル・辞書の版から再利用可能な索引を識別し、完成した世代を公開する。モデルは検索窓ではなくエンジンの寿命に属する。

DDDの境界と不変条件をコードへ置き、Clean Architectureで実行環境への依存を外側へ向ける。小さな検索システムなので、各型へRepositoryやServiceを一律に追加しない。

## 依存方向

```mermaid
flowchart LR
  UI[Obsidian UI] --> App[検索ユースケース / Port]
  App --> Domain[検索語・候補・一致範囲]
  Remote[HTTPアダプター] -. implements .-> App
  Local[Worker / WASMアダプター] -. implements .-> App
  Root[Composition root] --> UI
  Root --> Remote
  Root --> Local
```

`src/main.ts` はObsidianのライフサイクルだけを接続する。`src/composition/` が具象アダプターを選ぶ。`src/presentation/` は検索窓、設定画面、ノートを開く操作、描画。HTTPやWASMを直接参照しない。

`src/domain/search.ts` は検索値、検索語検証、一致範囲の検証・マージ。Obsidian、HTTP、タイマー、Workerに依存しない。

`src/application/` は `SearchEngine` と `Scheduler` のPortを宣言し、`SearchSession` が起動時準備、再試行、検索の直列化、古い入力の破棄、終了時処理を担当する。画面を閉じてもエンジンを破棄しない。失敗した検索が後続のキューを止めない。

`src/infrastructure/` はHTTP、Obsidianの読み取りAPI、Worker RPC、辞書ロード、IndexedDBの実装。ノートへの書き込みは行わない。リンク挿入だけはユーザーがAlt+Enterした際の既存UI操作として残す。

## Rustの境界

- `rust/core/src/domain.rs`: 文書・トークン・候補と単語ベクトルの検証。
- `rust/core/src/application.rs`: 検索実行と `IndexRepository` Port。索引の具象実装をimportしない。
- `rust/core/src/indexing.rs`: メモリ上の圧縮接尾辞索引、文書境界、候補位置の復元、UTF-16範囲への変換、索引保存・復元。
- `rust/core/src/upstream/`: 固定した公式SoftMatcha 2の候補列挙・検索コードの移植。Python/NumPy、Unixのpread、Rayonを外し、バイト列・ndarray・逐次処理・web-timeへ置き換えた。
- `rust/wasm/`: wasm-bindgenによる外側の入出力アダプター。OS固有コードを持たない。

WASM版は自前でポータブル索引を構築し、pair/trioビット集合の追加枝刈りを省略する。単語の置換・挿入・削除を列挙する本体アルゴリズムは保持するが、候補数・時間上限、日本語の辞書実装、索引の構築法が異なるため、ネイティブ版と全クエリで完全に同じ順位になる保証はしない。

## 起動・検索・更新

1. Obsidianのレイアウト準備完了時に非同期で準備を始める。
2. ローカルWASMでは公開モデル・IPADIC辞書を読み、一つのWorker内に常駐させる。初期化中の要求は同じPromiseを待つ。
3. ノートの一覧・版を調べ、内容をWorkerへ渡す。モデル版・辞書版・文書内容から索引キーを計算する。
4. IndexedDBのチェックポイントがあればハッシュを検証して復元し、なければ変更したシャードを構築する。新しい世代が揃うまで古い索引を残す。失敗した新世代は取り除く。
5. 入力を80ms待機し、IME変換中は検索しない。待機中に古くなった検索はエンジンに送らない。
6. 辞書で分割した検索語をIDに変換し、語彙との類似度を計算、公式アルゴリズムで候補列挙、文書・行へ戻して上位候補を表示する。
7. 一致した実際の原文だけをmark要素で着色する。ノートのHTMLは実行しない。
8. 60秒ごとに更新を検知する。変更がなければモデルの再ロード・ノートの再読み取り・索引再構築をしない。成功後は古いチェックポイントを削除する。
9. 無効化時にタイマー、Worker、待機中の要求を終了する。

再起動時もモデルと辞書のメモリ展開は必要。索引の復元によって構築を省略するのであり、すべての初期化を永久に省略できるわけではない。IndexedDBが利用できない・容量不足・破損した場合は再構築する。

## ネイティブ検索サービス

`server/service.py` はCLIとcomposition rootで、従来の起動コマンドと公開importを維持する。

`search_domain.py` は入力値・検索エラー・状態。`search_application.py` は検索・コーパス選択・準備のユースケースとエンジンPort。いずれもFastAPIに依存しない。

`http_api.py` は認証、HTTP検証、エラーのHTTPステータス変換、レスポンス化、起動時の呼び出しを担当する。`infrastructure/vault_repository.py` が読み取り専用のvault走査と不変索引の構築・公開、`native_engine.py` がモデルの常駐・検索を担当する。FastAPIを使わず直接テストできる。

## 制約と検証

既定の5万語モデルには未登録語がある。本文検索は1〜12トークン。ファイル名一致は未登録語でも返せる。候補・実行時間には上限がある。WASMは単一Workerで処理し、UIスレッドを占有しない。初回の全索引構築には時間がかかり、ノート全文の転送とモデル・辞書・索引のRAMは必要。非常に大きいvaultはネイティブサービスを選べる。

TypeScriptの依存方向、キュー・再試行の寿命、既存UI、実WASMと日本語モデル、チェックポイント復元・更新・削除、ネイティブの実Rust検索をテストする。Node WorkerとIndexedDB代替実装による結合試験であり、iOS/Android実機やObsidian WebViewでの動作・メモリ上限の確認は別途必要。

macOSのObsidian 1.15.0でプラグインを再読み込みし、実WASMの「今日の」検索が50件返ること、本文の小さいフォント・高さ制限の解除・一致部分のハイライトを画面で確認済み。iOS/Android実機は未検証。
