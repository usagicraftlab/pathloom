# 指示007 / Issue #34：native断面出力の交差エラー

2026-10-28 JST：指示006 / PR #36の完了後に再開。最新main
`aa4338d7e79ff8625c1ddcbe23e8b864fa23183d` を取り込み、全ローカル検証を完了した。
最終headのCIを確認して通常のマージ条件で進める。macOS実機は未実施のまま
[Issue #37](https://github.com/usagicraftlab/pathloom/issues/37)で後段に扱う。
以下の第1〜3停止点は2026-10-27時点の履歴で、旧007限定・区切り停止の運用は解除済み。
対象Issue: https://github.com/usagicraftlab/pathloom/issues/34

## 初期範囲と履歴（2026-10-27）

指示004 / Issue #9の調査中に、変更なしのmainでも発生することが分かった問題を分離する。
本Issueのbranchは`fix/34-native-section-intersection`。
base mainは`5defb1778f2058940c0d54e91b747d7ef8b2a71c`、
treeは`c302dc84bbca55e88bcce057a61bfc6bd906a8c1`。
Issue #9のStore・CAD binding・graph更新の差分は取り込まない。

第1停止点ではIssue・専用branch・Draft PRと再現記録の準備までで停止した。
ユーザーの再開指示ごとに段階を区切り、原因特定・対象検証を経て全件検証へ進む。
指示004の再開は今回の作業範囲に含めない。

## 固定する再現条件

1. Rectangle 70×40、中心`[0,0,0]`、XY plane、角丸R3。
2. Extrude 25 mm、direction`[0,0,1]`、cap=true、bothSides=false。
3. 下端の水平edgeを選択。長さ64 mm、bbox `[-32,-20,0]→[32,-20,0]`。
4. Fillet R2、tangentChain=false。Fillet自体はvalid。
5. exact slice（layerHeight=.6、tolerance=.02）→Build Toolpath
   （seam0、reverse=false、nearest=false）→G-code生成。
6. `Intersecting output curves at Z 0.6`で生成が停止する。

別edgeへの置換、交差判定・assertion・timeoutの緩和で回避しない。
実際の経路交差と検証の誤検出を区別し、原因側を直す。
精度処理を変更する場合も、本来の無効出力を検出する意図を保つ。

## 既存の実測証拠（指示004で2026-10-27 21:27 JSTまでに取得）

以下は今回の準備段階で再実行した結果ではない。
完全な比較記録は https://github.com/usagicraftlab/pathloom/pull/33 の本文にある。

- 変更なしmainのnativeだけで上記形状を新規作成し、browserで採取したものと同じ
  B-rep hash `3a68ff555efce4f349936b1a378c10d0129f600834cea730c659249c31a98ea5`
  （11483 bytes）を得た。
- mainとPR #33のnative断面生成は同一の42 pathsを返した。
  JSON応答SHA-256は両方とも
  `92ab9ad38a5f747f58aa864314677b10745a3bce4c23888dc7860c447543917d`。
- mainの`validateOutput`は生断面に対して`Zero-length segment at Z 0.6`、
  実pipelineと同じ小数6桁化後に`Intersecting output curves at Z 0.6`を返した。
- 第1断面に約6e-7 mmの短い折返しがある。例：
  `[34.053565375285274,-16.999999999999993,.6]` →
  `[34.053565375285274,-17.0000006,.6]` →
  `[34.053565375285274,17,.6]`。
- main/PR #33の`native/occt_brep_bridge.py` SHA-256はともに
  `88a1b03adeea981c775284b88a517128907f156f214b4d27070d35e738c9fda8`、
  `cad-pipeline.js`はともに
  `f2b9b912fa6928479f457dc4197905146346fb9fd4046c2b94c22d1f9c7eee0d`。

この節は修正前の証拠を保持したもの。根本原因と修正案は次節に記す。

## 根本原因と修正案（22:12 JSTまでの実測）

原因はnativeの断面edgeをpolylineへ変換する際の端点接続にある。
第1層の右側直線では開始parameterが`-5.999999999062311e-7`、評価したY座標が
`-17.0000006`だった。一方、前のBSplineと共有する位相頂点のY座標は正確に`-17`、
頂点の許容差は約`1.0000000071e-6` mmだった。許容差内で伸びた曲線端点を
前のedgeの端点と別々に加えていたため、約6e-7 mmの折返しがpolylineに入る。
形状自体はvalidだが、生成されたpolylineは不正であり、出力検証はこれを拒否している。
小数6桁化はこの不整合の現れ方を変えている。

`slice_brep`で、サンプル列の両端を`TopExp.FirstVertex/LastVertex(edge, True)`の
座標へ揃える。`True`でedgeの向きを考慮し、内部の曲線サンプルは保持する。
実際の共有頂点を継ぎ目に使い、余分な端点を足さない。
交差判定・丸め・許容差・dedup閾値・assertion・timeoutは変更しない。

位相APIの根拠：OCCTの[TopExp](https://www.occt3d.com/dev/doc/refman/html/class_top_exp.html)
は向きを考慮した端点取得を提供し、
[WireExplorer](https://www.occt3d.com/dev/doc/refman/html/class_b_rep_tools___wire_explorer.html)
は接続順にwireをたどる。実測はOCP7.8.1.1で行った。

| 観測 | 修正前 | 修正案 |
| --- | --- | --- |
| B-rep hash | `3a68ff555efce4f349936b1a378c10d0129f600834cea730c659249c31a98ea5` | 同一 |
| paths数 | 42 | 42 |
| 第1層の点数 | 41 | 37 |
| 全層中の最短segment | 約5.99999989e-7 mm | 約0.40256835 mm |
| 生断面の既存validateOutput | Zero-length segment | 成功 |
| 小数6桁化後の既存validateOutput | Intersecting output curves | 成功 |

## 第2停止点の対象検証

- 追加native回帰2件の修正前：1成功/1失敗。失敗は同じ約6e-7 mmのsegment。
- 同じ2件の修正後：2成功。開いたfaceの断面を閉じないことも確認。
- native bridgeの既存・追加20件：20成功、失敗/skip0。
  Box/Cylinder/Coneの断面を含む。この20件をnative全件とは扱わない。
- Node24の既存`cad.test`/`open-print-output.test`/`print-intro.test`：21成功、失敗/skip0。
  実交差・ゼロ長・Intro衝突の拒否を維持。Node24全JSとは扱わない。
- 追加browser1件：同じ長さ64の下端edgeとB-rep hash、42 paths、全42層のG-codeを確認して成功。
  最初の1回はZ表記`0.600`を`0.6`の文字列で期待したテスト側の失敗。
  全42層を数値で比較する検証へ訂正し、再実行は1成功/0失敗/0skip/0retry（約10.77秒）。
  Tauri IPCと保存先だけを代替し、CAD/native断面/worker/出力検証/G-codeは実コードを使用。
- `git diff --check`、browser spec構文確認：成功。

ログ/JSONは`work/board-verification/007/`に保存。初期失敗もPRとボードに保持する。

## 第3段階時点の未完了条件（2026-10-27の履歴）

- [x] 同じ形状・edge条件の再現を回帰検証として固定する。
- [x] 実交差／丸め精度を含む検証の誤検出を証拠で切り分ける。
- [x] 原因側の修正案と、本来の交差・無効出力の拒否を両立する。
- [x] 同じ形状から断面→toolpath→G-code生成まで対象検証で確認する。
- [x] Node24のnpm test、Node20.20.2全JS、native全件、browser全件を実行する。
- [ ] CIの全run/attemptを確認し、失敗・skip・未実行も保持する。
- [ ] 機能台帳・A/T/R台帳・開発ログを最終結果へ更新する。
- [ ] 全条件成立後のみReady化・merge commit・Issue自動クローズを確認する。

## 第3段階：全件検証とfixtureの修正

ff19d401のローカル全件検証は、Node24 npm test 192成功、Node20.20.2全JS192成功、
native53検出=51成功/任意USD2skip。browserは33件中32成功/1失敗だった。
修正headのpush40510652145/PR40510663843も各attempt1 failureで、同じ追加caseの
`window.__TAURI__.core`参照が初期化前に失敗した。各runのJS192/native51+2skip/Rust21は成功。

### 単独実行では見えなかった初期化の原因

`fixtures/cad.mjs`はimportの副作用でbeforeEach/afterEachを登録し、baseのtestを
そのままexportしていた。同じworkerでbasic-drawingが先にmoduleを読み込むと、
module cacheにより2番目のnative-section specへhookが登録されず、空のpageから始まる。
ローカル全件でも同じ失敗を再現し、traceで当該caseのgoto呼出し0・beforeEach hook0を確認した。
断面生成前のfixture不具合で、既知maintenanceの間欠失敗として除外しない。

共有ヘルパーを`test.extend({page: ...})`へ変更し、各testでsetupを実行する。
CAD daemon/queue/serialをtestごとのclosureに置き、終了時は残要求を拒否し、
readlineを閉じ、childのcloseまで待つ。製品コード・assertion・timeout/retryは変更しない。
実装根拠は[Playwrightのfixture/override仕様](https://playwright.dev/docs/test-fixtures)。
この変更後の全件browser再実行結果と新CI結果は、確認後に下へ追記する。

製品変更前の準備head40506774872/40506779845は各attempt1 success
（JS各192、native各49+2skip、Rust各21、browser各32）。
初回修正headの2 failureと、fixture修正後のrunを分け、過去の失敗を消さない。
実macOS GUI/IPC/dialog、実プリンターは未実施。Ready化・merge・Issue自動closeは未実施。

### fixture修正後のローカル全件結果

Browser全33件は33成功/0失敗/0skip/0retry（テスト103.673秒、runner104.64秒）。
同じworkerで先にbasic-drawing7件が走った後に新caseが実行され、同じB-repから
42層のG-codeまで成功した。単独実行だけでの成功と混同しない。
以前の32成功/1失敗を保持し、成功で上書きしない。

Node24/Node20/nativeの全件結果はff19d401と同一の製品・JS/nativeテストblobに
対して実測したもの。今回その後に変えた実行コードはbrowser fixtureのみであり、
そのfixtureを含めbrowser全件を再実行した。package/lock/全製品・assertionは不変。
新headのCI全runはPR本文とボードへ実測結果を記録し、未確認を成功扱いしない。
Ready化・merge commit・Issue自動closeの前でユーザー指定の停止点とする。


## 2026-10-28 — 指示006完了後のmain統合と全件再検証

PR #36のmerge aa4338d7を確認し、既存branchへmainを取り込んだ。
競合は開発ログの追記だけで、ours/theirsとも共通base5defb177の完全なprefixを
保持した追記であることをbyte単位で検証し、旧007追記8346 bytesと006追記4628 bytesを
双方そのまま保持した。実行コードの競合や仕様判断はない。
006のframe/保存競合対策・#37への実機移管を保持し、native端点修正は旧headから不変。
Issue #9のStore/binding/graph差分は含めない。

| 統合後の実行 | 実測 |
| --- | --- |
| Node24.22.1 npm test | 192成功/失敗・skip0、test2.744秒/runner2.995秒 |
| Node20.20.2 全28 JSファイルを明示展開 | 192成功/失敗・skip0、test4.160秒/runner4.233秒 |
| native全件、verboseで集計を確認 | 53検出＝51成功/任意USD2skip、test4.673秒/runner6.348秒 |
| Node20.20.2 / Chromium156 全browser | 36成功/失敗・skip・retry・flaky0、errors[]、test103.178秒/runner104.552秒 |

browser attachmentで同じB-rep hash3a68ff555efce4f349936b1a378c10d0129f600834cea730c659249c31a98ea5、
同じ水平edge長64/bbox[-32,-20,0]→[32,-20,0]、42 paths、G-code成功を再確認。
追加された006の保留frame・保存順序・保存拒否ケースも含む全件成功である。
初回のNode20/ブラウザー起動は古いnpm cacheのbinaryがなくテスト本体未到達だった。
ignored work内へNode20.20.2を準備し、versionを確認してから実行した結果が上表。
nativeの最初の非verbose実行はexit0でも保存ログに最終集計がなく全件未確認だったため、
成功扱いせずverboseで全53件の最終集計まで再実行して確認した。
環境起動/記録の障害をnativeのassertion失敗やframe数の再現と混同しない。

raw log/JSON/attachmentはwork/board-verification/007-resume-006/。
main aa4338d7のpost-merge checks run40601895904とPages run40602176848はsuccessを確認。
007の過去のCI 6 run・8 attempt（準備成功、fixture初期化失敗、frame失敗）はPR #35へ保持し、
006の成功で置き換えない。今回の新headの全CIは確認後にPR本文とボードへ記録する。
実macOS/Tauri/OSダイアログ・実プリンターは未実施のままである。
