# 独立版Pathloom CAD マスタープラン

更新日：2026-10-26 JST。Phase 0監査基準：`main` の
`0a5b5670dc1d4afb2024682f8030885529835b8b`（2026-10-21 23:13 JST）。
作業ブランチ：`docs/cad-phase0-audit-20261026`。

## 1. 開発方針と今回の結論

独立版Pathloom Desktopを本体として、CAD単体の作図・編集からツールパス生成までを完成させる。
Tauri 2、Three.js、Python/OCPによるOpen CASCADE、既存のCAD履歴と生成ノードを維持する。
Rhino版への移行、SolidCraftへの全面置換は行わない。既存のRhino/GH入力連携は互換機能として残す。

**現状は正確な形状処理の土台と部分的な操作経路がある段階で、基本CAD操作の完成とは判定できない。**
Node 24の既存テストは通る一方、設定と実形状の不一致、複数対象の差分演算、分割後の参照維持、
Offsetの入力検証に問題を再現した。PRのNode 20 CIでも既存テストの読込エラーを確認した。
Phase 1は検証基盤の復旧、これらの修正、一連の操作の検証を先に行う。

Phase 0では調査・テスト・資料統合のみを行った。製品コード、保存形式、依存定義、
CI設定の変更はない。PRを作成してレビューに渡し、mainへはマージしない。

## 2. 資料と管理情報の置き場所

| 管理対象 | 正本 | 更新ルール |
| --- | --- | --- |
| 開発方針、構成、監査結果 | 本書 | 方針変更・新しい問題の確定時に更新 |
| 開発順序、タスク、完了条件 | [cad-roadmap.md](cad-roadmap.md) | 着手・完了・依存関係を更新。実行履歴を重複記録しない |
| 実行環境、コマンド、結果、再現手順 | [cad-development-log.md](cad-development-log.md) | 日付と対象SHAを付けて追記。最新監査結果の参照先 |
| C/E/S/F/B/Dの65機能の詳細状態 | [cad-command-status.md](cad-command-status.md) | 既存IDを維持。別の65行台帳を作らない |
| A/T/R受け入れ条件とfixture状態 | [cad-verification-status.md](cad-verification-status.md) | 条件単位の証拠を更新。テスト総数で全条件を合格にしない |
| CAD仕様・データ契約 | [cad-workspace-spec.md](cad-workspace-spec.md) | v2.0の全65機能を引き続き目標とする |
| 過去の技術判断と実装経緯 | [cad-implementation-notes.md](cad-implementation-notes.md) | 2026-10-21時点の履歴として保持。以後の現況は本書とログ |
| 操作設計の判断基準 | [app-design-constitution.md](app-design-constitution.md) | 明示的接続、作業位置の維持、自由な中間形状などの判断に使用 |

本計画のPhase 0〜4は今回の開発管理区分である。既存仕様のP0〜P5やコマンドIDを改番しない。
古い文書にある「未push」「次に実装する」等の記載は当時の状況であり、新しい作業許可や現況の根拠にしない。

## 3. 状態の判定方法

- **実装確認済みの範囲**：該当するコードを読み、今回実行したテストまたは追加プローブで具体的な動作を確認した部分。
- **部分実装**：演算・UI・入力モード・履歴・参照・保存の一部があるが、機能の要求全体を満たしていない。
- **未実装**：必要な操作経路がない。低水準演算だけ存在する場合は、その存在を別記する。
- **検証不足**：コードや過去の成功記録はあるが、今回の環境で未実行、または必要な条件がテストに含まれない。

これらは排他的な進捗率ではない。「部分実装・検証不足」の併記を許す。
台帳の`done`はそのセルの範囲に限定する。正常系の1fixtureやAPI名の存在を、その機能全体の完成と扱わない。

## 4. 構成と接続の監査

| 経路 | 実装の根拠 | 今回確認できた範囲と残る境界 |
| --- | --- | --- |
| 起動・配布用フロントエンド | `package.json`、`src-tauri/tauri.conf.json`、`scripts/frontend-assets.mjs`、`prepare-desktop.mjs` | Tauri 2。共通manifestでルートJS・`cad/`・vendorを配布。`desktop:prepare`成功。Tauri GUIの起動・配布物ビルドは未実行 |
| 共有Three.jsビュー | `app.js` → `initModelWorkspace`、`cad/view-adapter.js`、`workspace-ui.js` | CAD左端＋既存3工程、メッシュ/曲線/頂点の描画・選択処理が存在。今回のブラウザ描画・操作検証は環境ブロック |
| CAD UI→文書・履歴 | `cad/commands/{registry,session,input}.js` → `cad/store.js`、`document.js`、`history.js` | コマンド定義、mm/角度/座標、DAG、Undo/Redo、lastValid。JSテスト成功。終盤の非同期適用にAUD-001 |
| フロント→Tauri/Rust | `cad/native-client.js` → `src-tauri/src/lib.rs`のinvoke登録 → `cad_runtime.rs` | `cad_runtime_start/status/restart`、`cad_evaluate/cancel`、asset import/export/releaseを照合。結果は`cad-job-result`。実Tauri通信は未実行 |
| Rust→常駐Python/OCP | `src-tauri/src/cad_runtime.rs` → `native/cad_runtime.py` → `native/cad_operations/__init__.py` | Pythonスクリプトをapp cacheへ展開。JSONL、直列化、epoch、60秒監視、256 MiB応答上限、stderr排出。Python常駐プロセスの実通信、macOS CIでRust Session/プロセス監督の単体テスト成功。GUIからの実Tauri通信は未確認 |
| 既存STEP読込・面編集・Z断面 | `step-import.js`、`lib.rs::run_editable_cad`、`cad_process.rs` → `native/occt_brep_bridge.py` | 常駐CADとは別の既存プロセス経路。25秒制限。実OCCTの読込・平面の面移動・スライスをPythonで確認。旧USDは任意互換経路 |
| CAD→生成ノード | `cad/generation-adapter.js`、`workspace-ui.js::updateBindings` → `cad-ui.js`、`app.js::syncCadBinding` | 明示的body-result binding。Curveは0.02 mmでサンプル化、B-repは正本を保持して渡す。自動配線しない。非アクティブな生成グラフの自動再計算は未完 |
| 生成→出力 | `cad-pipeline.js`、`toolpath-data.js`、`app.js::generateGcode` | 現行binding/hash、生成失敗、印刷座標・設定を出力時に検証。既存JS回帰テスト成功。CAD寸法変更からG-codeまでの全経路は未確認 |
| プロジェクト・回復・ライブラリ | `cad-ui.js::saveProject/openProject`、`pathloom-project.js`、`cad/{persistence,store,shape-library}.js` → `src-tauri/src/project_files.rs` | 通常保存v2、v1読込、正本hash/byte検証、prepare/commit restore、別のCAD回復ファイル。Rustは同ディレクトリの一時ファイル→sync→rename。OS保存・再起動は未確認 |

Python探索は`PATHLOOM_BREP_PYTHON`、開発用`.pathloom-runtime/python`、`python3`の順。
`npm run cad:setup`はPython 3.12と`cadquery-ocp==7.8.1.1`を用意する。
OCPの版と実OCCTの版は同一視しない。現行helloの`occtVersion`は`null`で、binding版を別途記録する。
Python/OCPは.appに同梱されていない。JSONL・cacheの上限はOCCTプロセスの総メモリ上限を保証しない。

## 5. 機能の棚卸し

コードの列挙結果は**65機能ID中42 IDを登録、別に`transform.move`を1件登録**。
ネイティブ演算一覧は45件で、登録済みコマンドが参照する43演算はすべて含まれていた。
残る`surface.split`と`surface.extract`は低水準演算のみで、専用のコマンド/UI経路はない。
この件数は完成数・テスト済み演算数ではない。

| 分野 | 登録ID数 / 仕様ID数 | 実装確認済みの部分 | 部分実装・未実装・検証不足 |
| --- | --- | --- | --- |
| 曲線作成 C | 10 / 12 | Line、Rectangle、Polyline、円/円弧/楕円/多角形、NURBS/補間等の数値fixture | 作図モード・直接制御点編集の不足。Helix/Spiral未実装 |
| 曲線編集 E | 7 / 14 | Join/Explode、単一edgeパラメータSplit、平面Offset、Reverse、Sectionの一部 | Trim/Extend/曲線Fillet・Chamfer/Blend/Rebuild/制御点編集/Project・Pull未完。Seam、選択境界抽出、Contour等も未完。OffsetにAUD-004 |
| 面作成 S | 8 / 11 | 平面、3/4隅、2境界、開いたExtrude/Loft、Revolve、Sweep1の一部 | PlanarRegionの穴・複数領域、境界順/向き、全入力モードの検証不足。Sweep2/Network/Patch未実装 |
| 面編集 F | 5 / 11 | 開いた面のJoin、Explode、有限domainのUntrim、片側Offset、Reverse | Trimと一般的な面編集は未完。`surface.split`/`surface.extract`だけでF03/D09完成としない |
| 立体作成 B | 5 / 8 | Box/Sphere/Cylinder/Cone/Torusの一部 | Ellipsoid等の全モード、B07専用の面押出経路が未完。Pipe/Cap・閉体積組立未実装 |
| 立体編集 D | 7 / 9 | 単一対象Boolean、semantic edgeのFillet、開口面を指定したShellの一部 | D02にAUD-002、D04にAUD-003。Chamfer等のper-ID fixture不足。一般MoveFace/SplitFace未実装 |
| 共通基盤 | 65 ID外も含む | DAG、参照の明示的修復、単調revisionのUndo、正本保存、世代管理、型付きLibrary ID再割当 | AUD-001。一般Modified/Generated伝播、分割の由来、未対応版の読取専用回復が未完 |
| スケッチ | 共通 | Workerソルバー、長方形寸法、線/円の限定fixture、未収束時の入力保持 | GUIからの任意スケッチ、円/円弧/NURBS等の形状化、ドラッグ、拘束glyph、スケール/成分分離/衝突候補診断の網羅は未完 |
| 保存・連携 | 共通 | v1/v2検証、hash付き正本、ライブラリ・body bindingの部品テスト | 実OSでの全体回復、失敗分岐隔離、複数生成グラフの自動更新は検証不足/未完。STEPのCAD文書への統合とSTEP書出しも未完 |

具体的には長方形中心・寸法、開曲線押出の面積300 mm²、開Loftの面積200 mm²、
押出体積60,000→80,000 mm³、Boolean体積1,500/500/500 mm³、Shell等を今回の実OCCTテストで確認した。
これらは正常系の限定された根拠である。`cad-kernel.js`は既存の生成側処理であり、正確なCAD正本の代わりにしない。
既存STEPの平面面移動があることと、CAD文書内のD08が完成していることも区別する。

## 6. 問題と優先順位

重要度P1は形状の正しさ・参照・保存・基本操作の完成を阻むもの、P2はその後の拡張/配布課題。
以下はすべて基準mainに存在する問題で、今回の資料変更による回帰ではない。

| ID / 重要度 | 判定 | 問題と根拠 | 影響・次の対応 |
| --- | --- | --- | --- |
| AUD-001 / P1・最優先 | 実OCCT＋転送待ちの注入で再現 | `CadStore.runRecompute`は結果の世代を検査した後に`exportAssets`をawaitし、その後に再検査しない。幅70計算の資産転送中に80へ編集すると、設定80/実幅70、`status=valid`、`requestedHash=null`となりsnapshotも受理される | 古い結果が新しい設定の正常結果として残る。非同期境界後の世代検証と適用の一括化、回帰テストを先に行う |
| AUD-002 / P1 | 実OCCTで再現 | D02の`arguments`は複数可だがnativeは`args[0]`から`args[1:]+tools`を順に引く。離れた元Box2個と工具1個で、各元形状を切る結果の合計1,500 mm³に対し500 mm³のみ返る | 2つ目以降の元形状が切削工具扱いになる。複数元形状の契約を確定し、結果を保持する。未対応なら入力段階で明示的に拒否する |
| AUD-003 / P1 | 実OCCT出力＋適用コードで確認 | `solid.split`/`surface.split`は出力slotへ毎回新規UUIDを付ける。同一Boxの同一分割を2回実行して2出力のslot一致0。Storeはslotをentity/body IDへ対応させる | 再計算で出力の由来が継承されず後段参照が失われる設計。勝手な近傍/順番再接続を避け、対応根拠と明示的修復を実装する |
| AUD-004 / P1 | 実OCCTで再現 | E06は`plane`設定を持つがnative Offsetは参照も検証もしない。両軸が零の不正平面でも正常結果、診断なし、XY方向に1 mm Offset | 指定条件と実際の演算条件が食い違う。対応平面の検証・演算への反映、未対応条件の型付き診断が必要 |
| AUD-007 / P1・検証基盤 | PR CI・同版ローカルで再現 | Node 20.20.2の`npm test`が`vendor/clipper/clipper.js:95`の`navigator is not defined`で失敗。41報告中23成功・18失敗。Node 24では155成功。`clipper-env.js`はselfのみ補完 | `engines >=20`とCIのNode 20でテストが動かない。P1-00でNode向け読込の契約を整え、browserチェックまで進める。製品の描画不具合とは区別 |
| AUD-005 / P1 | コード・既存台帳で確認 | 多くの入力は汎用JSON/既定値の経路で、専用モード、拘束編集、参照修復、分岐隔離、CAD→生成→G-codeの連続した受け入れが不足 | 65機能の一括追加より、Phase 1で基本操作の縦経路を完成させる。過去のブラウザ成功を今回の確認に流用しない |
| AUD-006 / P2（Phase 1で実機ゲート） | 構成確認・GUI実機未検証 | Pythonは別配備。Finder起動時の探索、実GUI経由のIPC、.app/.dmg、OSダイアログ/全体回復は未実行。Rust crateはmacOS CIでコンパイル/単体テスト成功 | 開発用起動と配布物を別々に検証する。CI単体テストからGUI/配布物の動作を推定しない |

再現方法・コマンド・実測値は[開発ログ](cad-development-log.md)に集約する。

## 7. 互換性と実装時の完了条件

1. `.toolpath`、既存生成グラフ・AI Component・QuickJS・G-codeテンプレート・Print outputを維持する。
2. CAD正本はOCCT B-rep、描画は派生メッシュ/サンプル。描画データを正確な編集の入力に置き換えない。
3. `.pathloom` v1は読める状態を保ち、開くだけで書き換えない。通常保存v2、hash付き正本、command version固定と未知metadata保持を尊重する。非互換変更は別の移行設計を伴う。
4. 開曲線・開いた面・負のZ・非平面のCADを保存可能に保つ。印刷制約は該当演算と最終出力で検査する。
5. 上流失敗時はlastValidを古い表示として区別し、影響分岐の出力を止める。独立形状は操作を続けられる状態にする。
6. CAD→生成は明示的に結び、既存ノードを自動配線しない。binding/hashが最新でないG-codeを出さない。
7. 対象コマンドごとに入力→正確な演算→履歴更新→参照→Undo/Redo→保存/再開→失敗修復まで確認して台帳を更新する。

## 8. 検証状況とmacOSの境界

ローカルNode 24の結果はJS **155成功**、指定版Python/OCP **37件中35成功・2スキップ**。
追加4プローブは不具合の再現成立であり、修正成功ではない。
ローカルブラウザはChromium取得/起動の環境エラーでassertion未実行、ローカルRustはCargo未導入で未実行。
既存の2026-10-21の「ブラウザ21成功」「Rust抽出4成功」は過去記録として残し、今回の成功数には含めない。

PR作成後の[CI run 40303764151](https://github.com/usagicraftlab/pathloom/actions/runs/40303764151)では、
native CADは35成功・2skip、macOS arm64のRust crateはコンパイルと21単体テストが成功した。
一方、Node 20のJSチェックはAUD-007で失敗し、後続browserはskip。CI全体の合格ではない。
Node 20.20.2の失敗はローカルでも再現した。テストモジュールの読込失敗を含む41報告であり、155件をすべて実行できたわけではない。

Linuxでも実行可能だが環境ブロック/前段失敗となったブラウザ検証と、macOS GUI実機が必要な検証を区別する。
macOS固有の実行項目M01〜M07は[ロードマップ](cad-roadmap.md)に置く。
監査基準main自体の過去のリモートCI成功は未確認。上記は製品コードが同じPhase 0 PRで今回得た結果である。

次の実装範囲と受け入れ条件は[ロードマップのPhase 1タスク](cad-roadmap.md)を参照する。
