# 独立版Pathloom CAD ロードマップ

更新日：2026-10-26 JST。基準SHA・方針・問題の根拠は[cad-master-plan.md](cad-master-plan.md)、
実行結果は[cad-development-log.md](cad-development-log.md)。
本書は今後の実装計画であり、Phase 0で機能修正や後続Phaseの実装は行っていない。

## Phaseと既存仕様の対応

| Phase | 目的 | 対応する既存仕様 | 現在の状態 / 終了条件 |
| --- | --- | --- | --- |
| 0 | 現況・接続・テスト・問題の監査、資料統合 | 旧P0の現況再確認 | 資料作成済み。環境ブロック・実機未確認を明示してPRレビューへ渡す |
| 1 | 基本操作と形状/設定/履歴/保存の整合性 | 旧P1/P2の完成確認＋基盤修正 | 未着手。下記P1-00〜08の対象経路と実機ゲートを満たす |
| 2 | 日常的な曲線・立体編集、CAD入出力 | 旧P3、既存STEP経路の接続 | Issue #12〜#15の自動実装・検証を完了。実Macは別Issue #37で未実施 |
| 3 | 面作成・面編集と高度な立体編集 | 旧P4、残りの65機能 | 未着手。各IDの入力モード、正確性、参照、保存、失敗fixtureを完了させる |
| 4 | コマンド拡張、性能、回復、配布 | 旧P5＋残る共通基盤 | 未着手。版管理・明示的AI編集・性能測定・配布物の検証を完了させる |

65機能は引き続き全体の目標。Phase 1の完了を「全CAD完成」と呼ばない。
各機能の状態は[cad-command-status.md](cad-command-status.md)、受け入れ条件は[cad-verification-status.md](cad-verification-status.md)で管理する。

## Phase 1：基本操作と結果の整合性を完成させる

最初に**P1-00でCIの既存テストを動かせる状態へ戻し、P1-01の形状不整合を修正する**。
その後P1-02〜04を優先し、P1-05〜08で実操作から保存・生成までを閉じる。
環境整備・実機検証の準備は先行可能だが、未実行を合格に置き換えない。

| タスク / 優先度 | 具体的な作業 | 主な対象 | 依存 / 完了条件 |
| --- | --- | --- | --- |
| P1-00 / 高・検証基盤 | AUD-007のNode 20 Clipper読込エラーを修正。対応Node版とテスト環境の契約を揃え、既存のbrowser向け処理を保つ | `vendor/clipper/clipper-env.js`、読込adapter、JS test/既存CI | なし。Node 20.20.2とNode 24で全JSテストが実行される。CIの`npm test`を通し、後続browserまで到達。engine宣言だけと実装が食い違う状態を残さない |
| P1-01 / 最優先 | AUD-001の古い結果の適用を防ぐ。すべてのawait後に文書・feature・revision・入力hash・epochを再確認し、適用をまとめる。破棄したhandleを解放し最新dirty状態を失わない | `cad/store.js`、`tests/cad-jobs.test.mjs` | なし。幅70のexport待ち中に80へ変更しても最終形状80。待ち中のUndo/削除/別文書読込/上流変更でも古い文書を更新しない。通常の無関係revision変更は有効結果を捨てない |
| P1-02 / 高 | AUD-002の複数元形状Differenceを修正。対象と工具の役割、工具保持、複数出力をschema/UI/native間で揃える。対応しないモードは実行前に明示的に拒否 | D02 registry/session、`native/cad_operations` | P1-01後に結果適用を確認。Box A(0..10)・B(20..30)・工具C(5..15)で各元形状を切る契約なら体積合計1,500、両方の残形状を保持。単一対象500、非接触、空結果、Undo/save/reopenも確認 |
| P1-03 / 高 | AUD-003の分割出力の由来を保持。複数slotとentity/bodyの対応、消失/追加時のbinding候補と明示的修復を設計し実装 | D04、native split、Store、references、generation binding | P1-01。不要な再計算・同じ分割の再実行で同一出力の参照を失わない。形状変更時にordinal/近傍だけで別結果へ結ばない。分割数変更と保存後も正しく継承またはblocked表示になる |
| P1-04 / 高 | AUD-004の平面指定を実際に処理/検証する。既存演算の必須型・単位・範囲・非対応オプションを照合し、無視された設定で成功させない | E06、`commands/registry.js`、native operation validation | P1-01。XY/XZ/YZ/任意平面、平面不一致、非平面、零軸/不正軸、距離符号、round/miterで数値fixture。非対応は型付き診断。汎用CAD全体に印刷用平面制約を課さない |
| P1-05 / 高 | 基本作図の操作経路を仕上げる。Line/Polyline、Rectangleの中心・2コーナー・3点、Circle中心半径、作業平面、MoveのXYZ、選択前/後、入力中のキー競合を揃える | C02/C03/C04/C06、transform、session、workspace/view UI | P1-01/04。クリック・数値入力・Enter/Esc・相対座標・Shift複数選択・端点/中心スナップを操作確認。未完成モードを完成表示しない。拘束長方形の寸法変更/未収束/Undo/saveを確認 |
| P1-06 / 高 | Rectangle→Extrude→Fillet→CAD binding→ツールパス→G-codeの更新と失敗復旧を完了させる。独立形状/別グラフへの影響を切り分ける | S05/D05、Store、generation-adapter、`cad-ui.js`、`app.js` | P1-01〜04。60×40×25→80×40×25で体積60,000→80,000、対象edge追従、生成寸法更新。参照消失ではlastValidを区別しG-codeを止め、再選択で復旧。別の正常形状は操作可能。非アクティブ生成グラフの状態も検査 |
| P1-07 / 高 | v1/v2互換と不完全な作業の保存・回復を固める。CAD失敗状態、draft、command版、破損正本、open/cancel時の現文書保護を操作経路で検証 | persistence、Store、shape-library、`cad-ui.js`、`project_files.rs` | P1-01/03/06。v1を開くだけで改変せず次回保存v2。開曲線/開面/NURBS/失敗＋lastValidを別プロセスへ復元。失敗するOpenで現在文書を失わない。未保存変更と回復ファイルの扱いを仕様に沿って確定 |
| P1-08 / 高 | 自動テストとmacOS実機検証を完了。P1-01〜04を恒久的な回帰テストへ取り込み、既存JS/native/browser/Rustチェックを実行する | tests/native tests/既存CI、下表M01〜M07 | 全修正後。正常・失敗の両方を記録。Chromium取得失敗等の環境障害をアプリ不具合と分離。Rust/Tauri実接続、macOS OS保存・回復まで確認して初めてPhase 1完了 |

Phase 1の固定基準シーンは「Rectangle60×40→Extrude25→Fillet R2」と
「自由な負Z/非平面の開曲線→開いた押出面」とする。前者は寸法追従・参照・出力、
後者はCADの自由度と正確な保存の基準に使う。印刷不能な中間形状を作図段階で禁止しない。

A02/A03/A05〜A09/A13/A14/A16/A21〜A24、T01/T02/T08/T10〜T12/T24/T25、
R01〜R05/R08/R09を中心に既存受け入れ台帳へ証拠を追記する。
既存テストが再び通るだけでは、これら全条件の完成とは判定しない。

## macOSで実行する項目

2026-10-28の順序・範囲決定：自動回帰とframe/保存競合の先行対策はIssue #11 /
PR #36で扱い、以下M01〜M07と実機での保存/回復・Phase 1最終照合は
[Issue #37](https://github.com/usagicraftlab/pathloom/issues/37)へ移管した。
Phase 1の残る#34/#9/#10の完成後の「実機検証フェーズ」で実施する。
移管は合格ではなく、未実施のM項目と必要証拠は以下のまま保持する。

**M01のうちmacOS arm64 CIの`npm ci`・frontend準備・Rust crateコンパイル/21単体テストは成功。**
M01の残りとM02以降のGUI/OS実利用は未実施。インストールしたアプリで確かめる。
ブラウザ/Rustの今回のローカル未実行は、macOS固有の制約とは別の環境ブロックである。

| ID | 実行項目 | 完了の証拠 |
| --- | --- | --- |
| M01 | `npm ci`、`npm run cad:setup`、`npm test`、`npm run test:cad-native`、packaged browser、`cargo test --manifest-path src-tauri/Cargo.toml --locked`、`npm run mac:build` | macOS/CPU/Node/Rust/Python/OCP版、コマンド、終了コード、CI URLまたは実行ログ。.app/.dmg生成成功をテスト成功と区別 |
| M02 | Finderから.appを起動し、別途配備したPython/OCPの探索、欠落時の案内と再試行を確認 | 開発元repoパスや起動元シェルの環境変数に依存するかを記録。Apple Siliconをまず確認し、Intel対応は別の確認範囲として表示 |
| M03 | 実Tauri→Rust→PythonでCAD作図、長時間処理のcancel、異常終了、再起動、正本再import | 古い結果が適用されず確定済み形状を回復。実プロセス終了を確認。ブラウザのcad_cancel no-opで代用しない |
| M04 | Fileメニュー、Open/Save/Save As、ダイアログ取消、同名更新、権限/容量エラー、破損ファイルを確認 | 別プロセスで開いた正本と数値が一致。失敗時に元ファイルと編集中文書を保持 |
| M05 | Library/コマンド保存/CAD recoveryをOS app-dataへ保存してアプリ再起動 | CAD以外を含む回復範囲の実態、draft/lastValid/command版と別プロジェクトへの混入防止を記録 |
| M06 | macOS WebViewで4工程共有ビュー、選択・スナップ・マウス/トラックパッド・日本語入力・Cmd系キー・1280×800/1440×900・VoiceOverを確認 | 作業対象・カメラ・パネル位置を保持。入力中のDelete等が形状操作へ漏れない |
| M07 | P1-06の形状設計→パス→保存→再起動→ローカルG-code生成を通す | geometry/binding/hashとG-code座標の一致、失敗中の出力阻止。実プリンター送信や物理印刷の結果とは区別 |

## Phase 2：基本編集とCAD入出力

| 作業単位 | 既存ID / 対象 | 完了の基準 |
| --- | --- | --- |
| 曲線の編集 | E01〜E11を順に完成。特にTrim/Extend/2曲線Fillet・Chamfer、Split対象指定、Seam、制御点編集 | 交点/対象端点/保持区間/距離の入力を明示。正常/不成立/曖昧候補を分け、正本と履歴・全出力を保持 |
| 閉領域と基本立体 | S03、B01〜B08、D01〜D07の不足モード | 穴/複数領域、面の押出、Cap/Pipe、複数Boolean対象、Shell失敗診断。開いた結果も許し、閉体積と区別 |
| 既存STEPとの接続 | `importedShapes`/既存面編集と`cadDocument`の明示的import adapter、STEP書出し | Issue #14完了。exact B-repだけを履歴化し、単位/配置/正本/由来を保持。別runtime再読込のbbox・面積/体積・closure・validityを照合。実Mac保存dialogはIssue #37で未実施 |
| 共通操作・再利用 | Move以外の変換、選択/重なり候補、Library依存closure・配置 | Issue #15。Rotate/Scale/Mirrorを正本履歴化。Library closureのtyped IDを挿入ごとに再発行し、XYZ配置を正本Move履歴として追加。実MacはIssue #37 |

新しいトポロジーや保存項目が必要なら、現行version/schemaを壊さない移行方針を先に記録する。

## Phase 3：面と高度な編集

- Issue #16でC11/C12、E12〜E14、S04/S06〜S11をregistry-firstで実装する。
  正常/失敗、複数出力、近似accuracy、fresh runtime再読込、Undo/Redo/v2を照合し、
  実Mac/Tauri/OS dialogはIssue #37と区別する。
- F01〜F11、D08/D09の一般面編集はIssue #17で低水準演算を具体化し、
  registry-first v2、typed subshape input、exact/fit accuracy、保存fixtureを実装した。
  実Mac/Tauri/OS dialogはIssue #37として未実施のまま区別する。
- Sweep2/Network/Patch/Blend/Match/RebuildはIssue #18で採用OCP APIをstartup probeと
  受入fixtureから実行検証し、公開registry、近似分類、実測偏差と許容差を確定する。
  詳細は`cad-sweep-publication-plan.md`。実MacはIssue #37として別に保持する。
- 一般Modified/Generatedの由来、複数出力、再選択、保存・再開を演算ごとに検証する。
- 65 IDすべての必要モードと正常/失敗fixtureを既存台帳で閉じる。高度機能を未実装のまま隠して全体完成としない。
- Issue #19では正規65 IDを固定した`cad-65-command-fixtures.json`を証拠索引とし、
  command-statusのModes/Known limitsを正本として、正常/失敗fixtureの空欄・ID欠落・
  registry欠落・証拠ファイル欠落を自動監査する。未対応モードは未完了表示のまま閉じる。

## Phase 4：拡張・性能・配布

- command DSL、別名衝突、保存版固定、明示的なupgrade/rollback、AIによるコマンド編集を完成させる。
  既存AI Componentの方式・ローカル認証・隔離QuickJSを維持する。
- 任意スケッチの要素・拘束・ドラッグ・寸法表示、非線形ソルバーの成分分離/スケーリング/診断を仕様に沿って拡張する。
- CAD以外を含む回復、未知schema/operation版の読取専用回復、Library移行を仕上げる。
- 代表モデルで表示/再計算/転送/起動/メモリを測り、handle・表示cacheのGCを改善する。
  合成モデルのLinux値をMac性能の達成根拠にしない。
- Python/OCPの配備と探索、配布物の依存版・第三者表示・source/rebuild手順を確認する。
  既存の[第三者ソフトウェア表示](../THIRD_PARTY_NOTICES.md)の未完事項を引き継ぐ。

## 各PRで残すもの

対象IDと入力モード、変更理由、互換性への影響、実行コマンドと結果、未実施項目、
次の開始地点を記録する。機能台帳とA/T/R台帳を更新し、実行結果だけを開発ログに追加する。
mainへのマージや配布は、その時点のユーザー指示に従う。

## 2026-10-28 — Phase2 曲線編集の実施範囲

Issue12 / PR39はE01〜E11の明示入力・正本編集・全出力・履歴/v2を実装。
NURBS continuationの接線延長への仕様変更はユーザー判断（ボード16:13）による。
演算ごとの境界、失敗/再実行と最終検証は[実測文書](cad-curve-editing-plan.md)と開発ログを参照。
#13〜#15はMuse有効化の順序を守り、#37の実機確認やPhase3は今回の合格へ含めない。

## 2026-10-28 — Phase2 閉領域と基本立体

Issue13 / PR40はS03/B01〜B08/D01〜D07の不足モードを
[実装前の対応表と境界](cad-regions-solids-plan.md)へ具体化して実装。
穴/複数領域・Pipe/Cap・面押出・Boolean複数入力/接触次元・Shell失敗を全検証で照合。
旧command版と既存D02/D04の由来/全結果の契約を保持し、実機#37やPhase3の合格へ広げない。
最終CIとマージ結果はPR/Codexログで記録し、#14/#15はMuse有効化待ちを維持する。

## 2026-10-30 — 指示018 UI評価ラウンド

Phase 3演算へ進む前のUI評価として、既存CADワークスペースの情報配置と操作入口だけを
レビュー結果へ合わせる。上部コマンド、左アウトライナー、右の編集中設定、下部履歴を
維持し、削除/抑制/Library/生成はcontext menuへ集約する。3DのXY/XZ/YZ参照平面は
既存作図sessionへ入力を渡すが、新しい演算・schema・bindingは追加しない。実Macの
ポインティング/VoiceOver/OS統合はIssue #37の未実施範囲を維持する。

### 追加レビュー 7〜10

追加評価では、ビューキューブ、command分類のhover展開、Esc一回終了、配列コピー、
command配置編集、形状色タグ、inline rename、Mirror面選択、生成へのdrag、形状間snap guide、
Tabによる一時panel非表示、選択形状寸法、outliner thumbnailをUI層へ追加する。
履歴scrubは表示だけに限定し、保存正本・後続履歴・生成を変更しない。自動Extrudeは新演算を
追加せず、交差bodyが厳密に1件のときだけ既存Extrude＋Union/Differenceを1 Undo単位として
合成する。複数body候補では通常Extrudeを保持する。centerline symmetry、collision highlight、
selection filter/view animation、数値矢印step、recent commandは今回の採用範囲外とする。

### 2026-10-31 追加レビュー11〜13と範囲回答

drag前復元、folder、suppressed表示、確認付き再開、H/Shift+H/I、原点XYZ、Enter次欄、pivot、
角/軸Scale、shortcutも018へ含める。08:35回答で軸Scaleだけnative変換/axisFactorsを拡張し、
v1互換と他項目の機構境界を維持する。全採用項目は[UI受入対応](cad-ui-review-additions.md)。
014〜017はMuse有効化待ち、#37とPR43は別枠。UI成功を65機能の最終照合に置換しない。
