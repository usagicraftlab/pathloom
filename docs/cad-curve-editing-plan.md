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
