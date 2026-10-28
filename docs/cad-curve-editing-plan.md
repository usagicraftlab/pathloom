# Issue #12 / 指示008：曲線編集 E01〜E11の具体化

基準 main a8c51d3ce505d75f9087f62ca9c36ff7cb832877、2026-10-28 JST。
Issue本文・ロードマップPhase2・仕様6.2/6.8/22.2に基づく。E12以降、立体/STEP接続、
実機#37は含めない。実装前にこの対応表をPRと開発ログへ記録する。

| ID | 明示入力・完了時に照合する経路 |
| --- | --- |
| E01 Join | 順序付き曲線群と許容差。連結グループ全出力、開いた結果、分岐候補の拒否と選び直し |
| E02 Explode | 元の複合曲線。全edgeを正本のまま出力し元履歴/Undo/保存を保持 |
| E03 Trim | 対象/切断要素またはparameter、削除区間のクリック位置/保持区間。交点なし/複数候補を区別 |
| E04 Split | 対象単一edge/明示edge選択、指定parameterまたは切断要素の交点。全区間/区画由来を保持 |
| E05 Extend | 対象端点、距離/到達対象、continuation/tangent。到達候補は明示選択。曲線型ごとの不成立を診断 |
| E06 Offset | 平面、符号付き距離、round/miter。距離0/消滅結果/非平面を区別 |
| E07 Fillet/Chamfer | 平面内の2曲線・接続側候補/端点、半径または2距離、trim/keepInputs。接続部と残る全出力を保持 |
| E08 BlendCurve | 2曲線の対象端点/向き、G1/G2、handle長。端部位置/接線/曲率を実測 |
| E09 RebuildCurve | 次数/制御点数を固定。fitは近似と明示し、測定最大偏差をpreviewで表示して明示確定。元正本を保持 |
| E10 Reverse/SetSeam | 反転と閉曲線起点のparameter/点。閉曲線の継ぎ目維持、開曲線Seamの適用外を区別 |
| E11 EditControlPoints | 制御点番号/XYZ変更、knot挿入による形状不変追加と直接編集/削除を区別。次数/必要点数を検証 |

共通の受入は各IDの正常/不成立ケース、曖昧な候補を勝手に選ばないこと、
実OCCT正本・履歴・全出力の保持、Undo/Redo/失敗lastValid/v2保存復元。
parameterは正本曲線のparameterであり表示頂点indexへ置換しない。
サンプルは表示/偏差測定として区別し、正本は解析曲線/NURBS/B-repで保持する。
実装はnative演算→registry/sessionの明示入力→preview/候補表示→Store/保存の順。
対象例と適用外の境界は機能台帳に明記し、未検証モードをdoneへ昇格しない。

開始ゲート：005マージ後main checks40622549025はattempt1 successを確認。
全ローカルNode24 npm test/Node20.20.2全JS/native全件/browserと最終head全CIを実行する。
失敗時は変更なしmainとの比較で分類し、未知の失敗が残ればマージせず@Museへ記録する。

## 2026-10-28 実装中チェックポイント：要判断、未完了

Draft PR #39。E03/E04/E05/E07/E08/E09/E10/E11のnative試作を追加したが、
E05 NURBS continuationが以下の受入で失敗したため中断する。
UI/registry/session、曖昧候補の操作、入力保持/全出力/履歴/Undo/v2、
その他native試作の実測と全ローカル検証は未完了。Issue全体を完成とはしない。
試作Rebuildの偏差はサンプルparameter対応点の計測であり、Hausdorff上限保証ではない。
warning/accuracyのUI・永続化と明示確定はまだ接続しておらず、実装済みとしない。
到達対象Extend、Join複数group、FilletのkeepInputsとStore連携なども未実装。

### 実際に確認したもの

| 実曲線 / 方式 | 結果 |
| --- | --- |
| Line [0,0,0]→[20,0,0] / tangent5 | ok、長さ25、bbox[0,0,0]→[25,0,0] |
| 同Line / continuation5 | ok、長さ25、同bbox |
| cubic NURBS / tangent5 | ok、長さ34.43380283706037→39.43380283706037 |
| 同NURBS / continuation5 | failed/CAD_KERNEL_FAILED、出力0、正本端点検証不成立 |

NURBSはpoles=[[0,0,0],[10,10,0],[20,10,0],[30,0,0]]、degree3、
knots[0,1]、multiplicities[4,4]、weights[1,1,1,1]、periodic=false。
`native/test_cad_curve_editing.py`の4回帰は3成功/1失敗。失敗はskip/expected-failureにせず保持。
再照合はexit1、Ran4/FAILED(failures=1)、test0.009秒/runner1.000秒。
native全件、Node24 npm test、Node20全JS、browser全件はこの実装headでは未実施。

### main比較とOCP単独実測

変更なしmain a8c51d3の独立checkoutでtracked diff空を確認。
mainのcurve.extendはCAD_SCHEMA_UNSUPPORTED（未実装）なので、この機能はmainの合格済み機能ではない。
main既存の間欠失敗として除外しない。

[scripts/probe-curve-extension.py](../scripts/probe-curve-extension.py)を変更なしmainと試作側で
同じPython3.12.14/OCP7.8.1.1に対して実行するとJSONが完全一致する。
`GeomLib.ExtendCurveToPoint_s`へ上記の元BSplineとtrimmed→BSpline変換後の2通りを渡し、
目標[33.53553390593274,-3.5355339059327373,0]、Cont=1、After=trueを指定。
双方return=None、呼出前後ともdegree3/4poles/parameter[0,1]/端点[30,0,0]で変化なし、
目標との距離5mm。これは呼出側から観測した結果で、C++内部での原因は確定していない。

OCCT一次資料：[GeomLib](https://www.occt3d.com/dev/doc/refman/html/class_geom_lib.html)は
bounded curve handleをin/outに取るAPIとして説明する。
Python binding経由で置換後handleを取得できていない可能性はあるが推測であり、
それを原因確定やOCP全体の不具合と断定しない。
直線/接線延長の成功をNURBS継続延長の合格へ置換せず、接線への無断fallbackも行わない。
正本を検証できる代替実装/境界の判断が残るため要判断、Ready/mergeなし。

計画だけの旧head2bad91fのCI push40641285516/PR40641291766は各attempt1 success。
それは本試作headの成功ではない。更新headのCIはPR本文/Codexログで別に記録する。
