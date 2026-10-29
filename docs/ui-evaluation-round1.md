# UI 評価フェーズ（第一回）

- 評価日時: 2026-10-29 14:25 JST
- 対象: `main` (`f1ae4f2e15bb75440aadbc641208ca0beb38dcfa`)
- 実操作対象: Pathloom 公開 Web UI (`https://usagicraftlab.com/pathloom/`)
- 比較対象: Autodesk Fusion 公式公開資料、SolidCraft 公開資料・ソース
- 評価範囲: 指示 012 の A〜E。製品コード変更、Phase 3 実装、実機 macOS/Tauri 評価は範囲外。

## 結論

公開 Web UI では画面とコマンド群を操作できたが、最初の正確な CAD 操作で Desktop の CAD ランタイムが存在しないため確定に失敗した。再起動操作後に Desktop 必須であることが表示され、A〜E はいずれも製品成果物まで到達していない。これは合格ではなく、各タスクの未達理由として記録する。

UI は失敗時に元形状と下書きを保持する説明、専用の再起動導線、モデル/CAD/CAM の領域分けを備える。一方で、利用不能な CAD コマンドが事前に無効化されず、確定時まで実行環境不足が分からないこと、最初のエラーが JavaScript 例外を含むこと、コマンド数が多い一覧から工程を組み立てる負荷が第一回評価の主要課題だった。

## 評価環境と制約

| 項目 | 結果 |
|---|---|
| 公開 UI | Chrome から実操作。`usagicraftlab.github.io/pathloom/` は `usagicraftlab.com/pathloom/` へ遷移し、画面を表示できた |
| CAD runtime | 公開 Web 配信では未接続。最初の確定時に `CAD_RUNTIME_MISSING` |
| 回復操作 | 「CADランタイムを再起動」を 1 回実行。Desktop と `npm run cad:setup` が必要との案内に遷移したが、公開 Web 環境では回復不能 |
| ローカル browser | Playwright Chromium の取得を 5 回試行したが、配布ファイルが 0 byte で失敗。ローカル browser 検証には切り替えられなかった |
| 基準 CI | 評価開始時点の latest main run `40808074858` attempt 1 は成功（JS 208、native 85 + 任意 2 skip、macOS Rust 22、browser 61）。本評価の実 UI 成功とは区別する |
| Fusion | 実アプリ操作なし。Autodesk 公式公開資料のみの机上比較 |
| SolidCraft | 実アプリ操作なし。公開ドキュメントと `tangency-labs/solidcraft` のソースのみの机上比較 |

## Pathloom 実 UI タスク

クリック数はタスク固有の操作を数える。共通の「CAD・形状作成」タブへの移動は別に 1 クリック。キーボード入力は 0 回だった。

| タスク | 実際の流れ | クリック / キー | 結果 | 阻害要因・回復 |
|---|---|---:|---|---|
| A. 矩形スケッチ → 押出 → フィレット | CAD タブ → Rectangle → 確定 | 2 / 0（共通タブ +1） | **未完了**。矩形履歴の生成前に停止 | `CAD_RUNTIME_MISSING: Cannot read properties of undefined (reading 'event')`。元形状保持と失敗設定の下書き保存が表示された。再起動 1 クリック後、Desktop 必須の案内となった |
| B. 円/閉領域 → primitive/cylinder → 寸法変更 | A で共通前提が欠けることを確認後、重複する確定操作は実施せず | 0 / 0 | **未完了**。最初の CAD 確定前 | 同じ native CAD runtime が必須。A の回復操作で公開 Web からは利用不能と確定 |
| C. 曲線編集 → 閉領域 → 押出 | A で共通前提が欠けることを確認後、重複する確定操作は実施せず | 0 / 0 | **未完了**。曲線編集前 | 同上。曲線編集・領域化・押出のいずれも native runtime なしでは成果を確定できない |
| D. STEP 読込/接続 → 配置 → Move/Rotate/Scale/Mirror | ランタイム前提で停止 | 0 / 0 | **未完了**。STEP 読込前 | exact B-rep/STEP 接続と変換の native runtime が公開 Web にない。ファイル選択や配置結果を評価できず |
| E. 形状 → toolpath → G-code | 元形状を作れないため停止 | 0 / 0 | **未完了**。CAM 入力形状の準備前 | CAD 成果物がなく、toolpath と G-code の操作・出力まで進めない |

### UI 文言と完了感

- 良い点: 「元の形状を保持」「失敗した設定を下書きとして残した」という失敗時の保持方針は明確だった。
- 良い点: 「CADランタイムを再起動」という次の操作が同じ画面にあり、回復導線を探す必要がなかった。
- 良い点: モデル、CAD、CAM の主要領域がタブで分かれ、機能の所在は大枠で理解できた。
- 課題: 利用不能な公開 Web 環境でも CAD コマンドが通常表示され、確定するまで前提不足が分からない。
- 課題: 最初の診断が `Cannot read properties of undefined (reading 'event')` を含み、利用者の操作ミスか環境問題かを判断しにくい。
- 課題: コマンド一覧から「スケッチ → ソリッド → 編集 → CAM」の次工程を自分で選ぶ必要があり、初回利用者の完了感が途切れる。
- 課題: 再起動後の案内は原因を説明するが、公開 Web 利用者がその場で回復できる経路はない。

### 総合評価

- 初めて使う人: 主要領域のタブ名とコマンド名は理解しやすく、失敗後に元形状と下書きが残る安心感もある。一方、公開 Web で実行できない CAD コマンドが通常表示され、最初の確定まで環境不足を判断できないため、操作ミスと受け取りやすい。次工程の提案がなく、大きなコマンド一覧から工程を自力で組み立てる負荷も高い。
- 繰り返し使う人: パラメータと履歴を明示的に扱える構成、失敗時の非破壊性は有用。反面、runtime 接続確認、コマンド再探索、工程ごとの対象再選択が反復時のクリックを増やす。検索・shortcut・最近使ったコマンド・選択の引継ぎ・履歴上の直接寸法編集が整えば、反復操作の効率を大きく改善できる。
- 総括: 現在は「機能の所在」と「失敗後に保持されるもの」は説明できているが、「この環境で実行できるか」と「次に何をすべきか」の案内が弱い。Phase 3 ではまず runtime capability を操作前に確定し、その上で工程間の選択とパラメータを引き継ぐべきである。

## Fusion 公式資料との机上比較

Fusion は実操作していない。以下は Autodesk 公式ヘルプの公開手順から見える設計上の比較である。

- Rectangle は Create Sketch または既存 Sketch の Edit Sketch で contextual environment に入ってから使用し、点または幅・高さを直接指定する。Pathloom はコマンド自体を見つけやすいが、実行可能なコンテキストとランタイム前提の事前表示が弱い。
- Extrude は Solid > Create > Extrude から profile/face を選び、同じ dialog で開始位置、距離、方向、operation を調整する。Fusion は選択済み profile を次工程へ持ち込むため、Pathloom でも「閉領域確定後に押出」を直接提示すると工程間クリックと判断を減らせる。
- Cylinder は平面、中心、直径、高さ、operation を一つの流れで確定する。Pathloom の primitive も寸法の直接入力と履歴編集を近接させると、作成後の寸法変更を探す負荷が下がる。
- Move/Copy は対象選択後、距離と角度を同じ dialog/manipulator で扱う。Pathloom の Move/Rotate/Scale/Mirror は共通の transform panel と選択保持にまとめる余地がある。
- Manufacture は design → setup → toolpath → simulate → post process → G-code の順序を workspace と Browser に表す。Pathloom は CAD 成果から toolpath/G-code への handoff を一つの継続導線として示すべきである。

参照:

- <https://help.autodesk.com/cloudhelp/ENU/Fusion-Sketch/files/SKT-SKETCH-CREATE-RECTANGLES.htm>
- <https://help.autodesk.com/view/fusion360/ENU/?contextId=SLD-EXTRUDE>
- <https://help.autodesk.com/view/fusion360/ENU/?contextId=MODEL-CYLINDER-CMD>
- <https://help.autodesk.com/cloudhelp/ENU/Fusion-Model/files/SLD-USE-MOVE-COPY.htm>
- <https://help.autodesk.com/view/fusion360/ENU/?guid=GUID-BEC5DEA9-AC3E-4FA8-998E-4AE8CD0D0B1E>
- <https://help.autodesk.com/view/fusion360/ENU/?contextId=MFG-POST-PROCESS-OPERATIONS>

## SolidCraft 公開ソースとの机上比較

SolidCraft は実操作していない。`tangency-labs/solidcraft` の公開ドキュメントとソースから、Pathloom で具体的に参照できる点を確認した。

| SolidCraft の公開箇所 | 確認した設計 | Pathloom への示唆 |
|---|---|---|
| `docs/book/src/dev/commands.md` | UI、toolbar、marking menu、S box、script、CLI、control channel、MCP が `Session::execute(id, params)` に集約され、失敗時は文書を変更しない | Pathloom の command registry を UI/keyboard/automation で共通化し、同じ enabled reason と診断を表示する |
| `crates/engine/src/cmd/mod.rs` | `CommandSpec`、dotted command id、toolbar placement、shortcut、enabled reason、未実装 command の disabled 表示 | runtime 未接続時は command を disabled にし、理由を hover/inline 表示する |
| `docs/book/src/guide/sketching.md` | Create Sketch/Finish/Cancel の明示、L/R/C shortcut、inline dimension、Tab/Enter、variant の記憶 | Sketch mode と寸法直接入力、直前 variant の保持でコマンド探索と再設定を減らす |
| `docs/book/src/guide/ui-tour.md` | toolbar workspace、Browser tree、viewport selection、S box の command search と keyboard navigation | 大きな flat command list に検索、最近使った command、contextual suggestion を加える |
| `docs/book/src/guide/features.md` | Create と Modify を分離し、Extrude と Fillet/Chamfer/Shell/Scale/Move を工程別に提示 | 現在の選択と履歴位置から次の Create/Modify 候補だけを前面に出す |
| `docs/step-import.md` | File > Open/Insert STEP、drag/drop、Import base feature、B-rep/tree 保持、undo whole import | STEP 読込、配置、履歴登録、Undo を一つの guided flow にまとめる |

参照:

- <https://github.com/tangency-labs/solidcraft/blob/main/docs/book/src/dev/commands.md>
- <https://github.com/tangency-labs/solidcraft/blob/main/crates/engine/src/cmd/mod.rs>
- <https://github.com/tangency-labs/solidcraft/blob/main/docs/book/src/guide/sketching.md>
- <https://github.com/tangency-labs/solidcraft/blob/main/docs/book/src/guide/ui-tour.md>
- <https://github.com/tangency-labs/solidcraft/blob/main/docs/book/src/guide/features.md>
- <https://github.com/tangency-labs/solidcraft/blob/main/docs/step-import.md>

## 改善仕様案

規模は概算（S: 小、M: 中、L: 大）。Phase 3 推奨は第一回評価に基づく優先度であり、この文書では実装しない。

| 分類 | 改善内容 | 対象 | Before → After / 期待効果 | 規模 | Phase 3 推奨 |
|---|---|---|---|---:|---|
| [クリック減＝事前承認済み] | 起動時 runtime preflight と command disable | 全 CAD command | 確定後に不足判明 → タブを開いた時点で利用可否と理由を表示。無効操作 2クリック + 回復1クリックを削減 | S | 最優先 |
| [クリック減＝事前承認済み] | Desktop runtime の自動起動/再接続 | CAD タブ | エラー後に手動再起動 → 最初の command 前に自動接続し、成功後に同じ draft を継続 | M | 高 |
| [クリック減＝事前承認済み] | command 検索・最近使用・contextual suggestion | command palette | 大一覧を目視探索 → 選択と履歴位置に合う候補を検索/keyboard で実行 | M | 高 |
| [クリック減＝事前承認済み] | Sketch → Solid → Fillet の guided chain | A/C | 各段階で command を探す → 閉領域確定後に Extrude、body 確定後に Fillet を提示し選択を保持 | M | 高 |
| [クリック減＝事前承認済み] | canvas/history から寸法を直接編集 | A/B | command 再選択と parameter 探索 → 寸法を選択し値入力、Enter で確定 | M | 高 |
| [クリック減＝事前承認済み] | STEP import + placement + transform の統合 flow | D | 読込後に4種類の変換を個別探索 → 読込 dialog から配置、Move/Rotate/Scale/Mirror、履歴確定まで継続 | M | 高 |
| [クリック減＝事前承認済み] | Model → Toolpath → G-code handoff | E | workspace と対象を再選択 → 現在 body から setup、toolpath、post process を段階表示 | L | 高 |
| [要ユーザー確認] | Web/Desktop の提供範囲を明示する capability banner | 公開 Web | command は見えるが実行不能 → Web は viewer か CAD 対応かを明示し、Desktop 起動/取得導線を選択 | S | 最優先。製品方針確認が必要 |
| [要ユーザー確認] | raw exception を利用者向け診断へ変換 | error panel | `undefined.event` を表示 → runtime 状態、必要環境、再接続結果、保持された draft を一貫表示 | S | 高 |
| [要ユーザー確認] | SolidCraft 型の単一 command registry を全 surface に適用 | UI/shortcut/automation | surface ごとに到達方法が分散 → command id、parameter、enabled reason、undo を共通化 | L | 中〜高。設計範囲確認が必要 |
| [観察のみ] | 公開 Web で CAD 全 command が通常表示される | deployment | 実行能力と UI 表示が不一致。今回 A〜E 全体の評価を阻害した | — | runtime 方針決定後に再評価 |
| [観察のみ] | 失敗時の元形状・draft 保持は理解しやすい | error recovery | destructive failure を避ける設計は維持すべき | — | 回帰条件として保持 |

## Phase 3 へ渡す推奨順序

1. Web/Desktop の対象方針を決め、runtime preflight、capability banner、disabled reason を先に整える。
2. 同じ runtime 不足で A〜E が一括停止しない評価環境を用意し、今回の5タスクを再評価する。
3. command search/contextual suggestion と、A/C の guided chain を導入して実測クリックを比較する。
4. STEP transform と Model→CAM→G-code の handoff を統合し、D/E を端から端まで再評価する。
5. raw exception をすべて利用者向け診断へ変換し、失敗時の draft/元形状保持を回帰条件にする。

## 完了条件との照合

- A〜E: 成果物まで未完了。全タスクに共通する runtime blocker と、A での実操作・回復結果を記録した。
- Pathloom 実 UI: 実操作済み。クリック数、キー入力、文言、阻害要因、回復、完了感を記録した。
- Fusion: 実操作なしと明記し、公式資料のみで比較した。
- SolidCraft: 実操作なしと明記し、公開ソースの具体的な file/command 設計を比較した。
- 改善仕様案: 3分類、対象、Before/After、効果、規模、Phase 3 推奨を記録した。
- 製品コード: 変更なし。
- Phase 3: 未着手。
