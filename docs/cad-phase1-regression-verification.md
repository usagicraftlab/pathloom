# Issue #11 / 指示006：自動回帰検証とmacOS実機の残件

2026-10-28 JST。指示ボードの順序変更に従い、指示007より先に実施する。
基準mainは `5defb1778f2058940c0d54e91b747d7ef8b2a71c`。
指示007 / PR #35のnative修正やfixture変更は、このブランチに取り込まない。

**Issue #11全体は未完了。macOS実機のM01〜M07と、未完のP1-06/07を含む
Phase 1最終照合は完了していない。自動テストの成功だけでマージ・自動closeしない。**

## frame数の瞬間値を描画完了と取り違えない

`setAxisView`はカメラ状態を同期的に更新し、描画をrequestAnimationFrameに予約する。
従来のmaintenanceテストはaxisがtopなら直ちにframe数を読み、予約済みのcallbackが
未実行でも0を不合格にしていた。PR #35 attempt2の既存traceでは、click完了から
frame読取開始まで約6.459msだった。mainでの再現成功とは区別する。

同じ `frames > 0` を `expect.poll` で待つ。idleの `frames < 4`、axis=top、
45秒のtest timeout、default assertion timeout、retry0を維持する。
固定sleepの追加、数値閾値の緩和、失敗時の自動retryではない。

追加した制御付きbrowserケースは、実appが予約した描画callbackだけを一時保留する。
axis=topでもframes=0・保留callbackあり、という正当な中間状態を確認してから解放し、
実callbackによるframe増加を待つ。描画しない状態を成功扱いしない。

## コマンド保存と初期ライブラリ読込の競合

workspaceはnative helloの直後にreadyとなるが、その後も初期コマンド一覧を読んでいる。
従来の登録処理はこの読込を待たずに文書・共有一覧を更新でき、初期snapshotとの
競合を許していた。重なる初期化のstatus更新も保存結果より後に到着し得る。

回帰ケースでは初期コマンド一覧のreplyを保留し、登録を押す。修正前のmain製品コードでは、
初期読込完了前に新しい定義が文書へ入ったため不合格になった。期待を緩めて通さない。
workspace初期化を進行中のpromiseに集約し、登録処理はライブラリ・回復確認まで待つ。
nativeの起動共有に加えて、UI側の初期化全体を共有する。

修正後は保留中に登録が先行せず、解放後に共有保存・ボタン表示・保存通知を確認する。
別の失敗ケースは共有保存を拒否し、成功通知を出さず、失敗理由とproject内の定義を
保持することを検証する。保存先・Tauri transportはfixtureで、実OS保存の証拠ではない。

## P1-01〜04の恒久回帰との対応

| 範囲 | 維持して全件実行する証拠 |
| --- | --- |
| P1-01 / AUD-001 | `tests/cad-jobs.test.mjs`：編集・export中のUndo/delete/Open、遅い失敗、最新結果の適用、runtime epoch |
| P1-02 / AUD-002 | `tests/cad-difference.test.mjs`、`native/test_cad_difference.py`、browser Difference3件：複数target、工具保持、空/非接触、Undo・保存 |
| P1-03 / AUD-003 | `tests/cad-split.test.mjs`、`native/test_cad_split.py`、browser D04：source別候補、参照消失、明示修復、Library独立コピー |
| P1-04 / AUD-004 | `native/test_cad_offset.py`：要求平面・距離符号・不正/不一致の拒否、既存browserのplane診断 |

既存の合格範囲を維持するための照合であり、A/T/Rのpartialやnot-runを一括昇格しない。
機能台帳は65 IDのまま、保存・起動の共有基盤の証拠のみ追記する。

## 実測結果

実行環境はLinux、Node24.22.1 / Node20.20.2、Python3.12.14 / OCP7.8.1.1、
Playwright1.64.1 / Chrome Headless Shell156.0.8078.4。packaged frontendを使用する。
既存configを継承し、ignored configには絶対パス・JSON reporter・出力先だけを指定する。

| 実行 | 結果 |
| --- | --- |
| 修正前の追加保存2ケース | 1成功/1失敗、24.520秒。初期一覧読込より登録が先行する失敗。保存拒否ケースは成功 |
| 修正後の対象5ケース | 5成功/失敗・skip・retry0、15.186秒。従来A04/R06、保存追加2件、従来frame、新規保留frame |
| Node24 `npm test` | 192成功/失敗・skip0、test6.333秒/runner6.715秒 |
| Node20.20.2で全28 JSファイルを明示展開 | 192成功/失敗・skip0、test7.113秒/runner7.220秒。直接binaryのversionも確認 |
| Python `-B -m unittest discover -s native -p 'test*.py'` | 51検出＝49成功/任意NVIDIA USD依存2skip、test5.016秒/runner6.756秒 |
| 全browser | 35成功/失敗・skip・retry・flaky0、errors[]、test145.509秒/runner147.606秒 |
| このheadのCI | 未実行。push/PR後の全runをPR本文とボードへ追記する |
| ローカルRust | cargo未導入のため未実行。CIのmacOS Rust結果とは分けて記録する |

最初のnpm exec経由Node20実行はexit0だったが、保存したTAPが66件までで集計がなく、
全件成功とは確認できなかった。上表は直接Node20.20.2 binaryで全28ファイルを再実行し、
`1..192 / tests192 / pass192 / fail0 / skipped0`まで確認した結果である。
旧entrypointのexit0を全件成功として合算しない。

raw log/JSON/失敗traceは `work/board-verification/006/`。
CIリンク・PR・マージとIssue自動closeの結果は実際の確認後に記録する。

## macOS実機で残る完了条件

この実行環境はLinuxで、macOS GUIやOSダイアログへの接続はない。
以下はすべて未実施であり、browserのTauri代替やCIのRust単体テストで置き換えない。

| ID | 未実施の実機確認 |
| --- | --- |
| M01 | macOSでruntime準備・全検証・`.app/.dmg` build。CIでのcrateコンパイルと区別する |
| M02 | Finderからの.app起動、Python/OCP探索、欠落案内と再試行 |
| M03 | 実Tauri→Rust→Python、cancel・異常終了・再起動・正本再import |
| M04 | 実OSのOpen/Save/Save As、取消・上書き・権限/容量・破損ファイルの保護 |
| M05 | app-dataへのLibrary/コマンド/recovery保存とアプリ再起動 |
| M06 | macOS WebView、入力・Cmd/日本語・トラックパッド・VoiceOver・画面サイズ |
| M07 | P1-06の設計→パス→保存→再起動→G-code。指示004の完了もまだ必要 |

実行者はmacOS/CPU、対象commit、Node/Rust/Python/OCP版、日時、各操作の実測結果と
証拠を[ロードマップM01〜M07](cad-roadmap.md)に対応付けて残す必要がある。
実機検証の実行結果または明確な作業範囲変更が得られるまで、Issue #11全体は完了にしない。
指示006完了前に007や004を再開しない。
