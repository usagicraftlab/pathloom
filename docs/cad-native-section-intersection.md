# 指示007 / Issue #34：native断面出力の交差エラー

2026-10-27 JST。原因特定・修正案と対象検証まで進めた第2停止点。
対象Issue: https://github.com/usagicraftlab/pathloom/issues/34

## 範囲と現状

指示004 / Issue #9の調査中に、変更なしのmainでも発生することが分かった問題を分離する。
本Issueのbranchは`fix/34-native-section-intersection`。
base mainは`5defb1778f2058940c0d54e91b747d7ef8b2a71c`、
treeは`c302dc84bbca55e88bcce057a61bfc6bd906a8c1`。
Issue #9のStore・CAD binding・graph更新の差分は取り込まない。

第1停止点ではIssue・専用branch・Draft PRと再現記録の準備までで停止した。
ユーザーの「続けてください」を受け、原因特定・修正案・対象検証まで実施し、再び停止する。
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

## Issue完了に必要なこと

- [x] 同じ形状・edge条件の再現を回帰検証として固定する。
- [x] 実交差／丸め精度を含む検証の誤検出を証拠で切り分ける。
- [x] 原因側の修正案と、本来の交差・無効出力の拒否を両立する。
- [x] 同じ形状から断面→toolpath→G-code生成まで対象検証で確認する。
- [ ] Node24のnpm test、Node20.20.2全JS、native全件、browser全件を実行する。
- [ ] CIの全run/attemptを確認し、失敗・skip・未実行も保持する。
- [ ] 機能台帳・A/T/R台帳・開発ログを最終結果へ更新する。
- [ ] 全条件成立後のみReady化・merge commit・Issue自動クローズを確認する。

## 全件検証前の状態

Node24全JS、Node20.20.2全JS、native全件、browser全件：ローカル未実行。
実機確認、Ready化、マージ、Issue自動クローズ：未実施。
準備headのpush/PR CIは両方attempt1 success（JS各192成功、native各49成功/2skip、
Rust各21成功、browser各32成功）。これは製品修正前の結果であり、修正headの検証とは分ける。
修正headのCIは開始後の実際の結果をPR本文とボードへ追記する。
全件検証と最終判定の前に、ユーザー指定の第2停止点で待機する。
