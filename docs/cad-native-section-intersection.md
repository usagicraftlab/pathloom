# 指示007 / Issue #34：native断面出力の交差エラー

2026-10-27 JST。修正前の再現記録を保存する準備段階。
対象Issue: https://github.com/usagicraftlab/pathloom/issues/34

## 範囲と現状

指示004 / Issue #9の調査中に、変更なしのmainでも発生することが分かった問題を分離する。
本Issueのbranchは`fix/34-native-section-intersection`。
base mainは`5defb1778f2058940c0d54e91b747d7ef8b2a71c`、
treeは`c302dc84bbca55e88bcce057a61bfc6bd906a8c1`。
Issue #9のStore・CAD binding・graph更新の差分は取り込まない。

ユーザーの指示に従い、Issue・専用branch・Draft PRと再現記録の準備までで一度停止する。
この段階では製品コードや検証条件を変更せず、新しい検証も実行していない。
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

これらは既存mainで再現する証拠であり、根本原因の分類が完了したという主張ではない。
nativeの離散化・接続と、出力側の丸め・交差検証のどこに原因があるかを次段階で確定する。

## 次の段階で確認すること

- 同じ形状・edge条件の再現を回帰検証として固定する。
- 実交差／丸め精度を含む検証の誤検出を証拠で切り分ける。
- 原因側の最小限の修正と、本来の交差・無効出力の拒否を両立する。
- 同じ形状から断面→toolpath→G-code生成まで確認する。
- Node24のnpm test、Node20.20.2全JS、native全件、browser全件を実行する。
- CIの全run/attemptを確認し、失敗・skip・未実行も保持する。
- 機能台帳・A/T/R台帳・開発ログを更新する。
- 全条件成立後のみReady化・merge commit・Issue自動クローズを確認する。

## この準備段階の検証状態

Node24全JS、Node20.20.2全JS、native全件、browser全件：未実行。
実機確認：未実行。修正：未実施。マージ：未実施。
Draft PR作成に伴うCIは、実際に開始・確認した結果をPR本文とボードへ追記する。
過去の指示004の部分検証やCIを本Issueの修正検証として流用しない。
