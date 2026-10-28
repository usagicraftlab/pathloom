# Issue #13 / 指示009：閉領域と基本立体の具体化

2026-10-28 JST、基準main f7f69e7c6a636c15c05a0d2512c33a9a29015435。
仕様6.3/6.5/6.6/22.3/22.5/22.6、ロードマップPhase2、既存65機能台帳を照合した実装前記録。
前提：008後main checks40666332968 attempt1 success、3job生ログでJS202/native68+任意USD2skip/
macOS Rust21/browser51成功を確認。009の未着手→作業中をrevision付き更新/読戻し確認済み。

| 対象 | 現況の不足と今回の受入 |
| --- | --- |
| S03 | 単一wire faceのみ。閉loop群の平面性/交差/包含を検査し、穴・独立領域・入れ子の島を全出力。開輪郭を自動補完せず診断 |
| B01 | center/cornerのみ。底面2点/3点を明示し局所座標/向き/高さへ変換。既存v1保持 |
| B02 | Sphereのみ。3軸半径と平面/中心で正確なellipsoidを作り体積/保存を確認 |
| B03/B04/B05 | 既存Cylinder/Cone/Torusを再検証。蓋有無、円錐台/負不成立/退化を明示、開面を閉体積と偽らない |
| B06 | 未実装。rail/半径/frame/角部transition/capを指定し円断面Pipeを実OCCT掃引。開Shell/閉Solidと不成立を区別 |
| B07 | 既存shape.extrudeを面入力専用コマンドへ接続。穴を維持したCap=true/false、両側/負距離を実測 |
| B08 | 未実装。自由境界の平面穴だけをcapしてsew、閉ShellはSolid化。面群のassemble、独立閉体積は全出力。非平面穴は診断、開面は開面として保持 |
| D01〜D04 | 既存複数Difference/Splitを維持。Union/Intersectionも入力型/複数対象/非接触/empty/接触低次元を検証。全結果・正本・由来保持 |
| D05 | 接線連鎖指定が未実装。選択edgeの所属とOCCT連鎖を照合し、選択値/失敗を診断。既存semantic edge/lastValidを維持 |
| D06 | 等距離のみ。2距離とdistance1側の隣接faceを明示指定し検証。非隣接face/所属違いを拒否 |
| D07 | Shell方向/面選択は存在。厚さ/除去面所属/失敗を型付き診断と詳細（面/値/方向）で返し、lastValid維持 |

完了条件1はS03/B01〜B08/D01〜D04の実形状・明示入力、条件2はD07失敗診断、
条件3は全対象のopen/empty/solid分類と履歴/Undo/保存で照合する。
任意の一般面編集やPhase3/#37へ広げない。未知失敗は変更なしmainと比較し、分類不能なら@Museへ記録して停止。
既存command定義/保存versionを無断変更せず、新しい設定契約はcommand v2または新IDとして登録。

全検証：Node24 npm test、Node20.20.2全JS、native全件、packaged browser、最終head push/PR CI全job。
機能台帳の対象IDだけを証拠範囲で更新し、A/T/R既存状態/未実機項目は保持して証拠追加。
この計画段階で実装・検証の成功を宣言しない。Draftから同一branch/PRで仕上げる。
