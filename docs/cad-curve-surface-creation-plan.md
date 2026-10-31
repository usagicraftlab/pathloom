# Issue #16 / 指示014：曲線・面作成 C11/C12、E12〜E14、S04/S06〜S11

基準 main `56d4e100da4a6253d7e31d6a3e5e8ddb9e8745fc`、2026-10-31 JST。
Issue本文、ロードマップPhase 3、仕様6.2/22.2/22.3に基づく。F01以降、指示015〜017、
実機#37、PR #43のUIレイアウトは含めない。既存v1 commandの保存互換を維持する。

| ID | 正本演算・明示入力・受入経路 |
| --- | --- |
| C11 | `curve.helix`。軸/基準方向、半径、pitch、turns、回転方向、fit tolerance。解析sampleから補間B-splineを作り推定偏差をaccuracyへ保存 |
| C12 | `curve.spiral`。平面/中心、開始/終了半径、turns、方向、fit tolerance。途中半径を保持した平面B-splineとaccuracyを保存 |
| E12 | `curve.extractBoundary`。all/selected/outer/openを明示し、三角表示ではなく正本edgeを全出力 |
| E13 | `curve.project`/`curve.pull`。元曲線、複数target、方向または最大距離。target/candidateごとの全edgeを保持し、届かない場合は`CAD_PROJECTION_MISSED` |
| E14 | `shape.intersect`/`shape.section`/`shape.contour`。2群の形状、任意平面、原点/法線/間隔/範囲を区別し、pair/plane/objectごとの全交差edgeを保持 |
| S04 | 既存`surface.edges`。2辺ruled、3/4辺Coonsを正本曲線の順で構成し、不適合境界を失敗にする |
| S06 | 既存`shape.revolve`。開始角/部分/全周、open/faceと明示Capを維持 |
| S07 | 既存`surface.sweep1`。corrected/frenet、順序付きsectionと向きを維持 |
| S08 | `surface.sweep2`。2 railを両境界制約として、断面のchord偏差を横断方向に保持した近似面。rail/section sample数とfit toleranceをaccuracyへ保存 |
| S09 | 既存`surface.loft`。smooth/ruled、順序/向き、open/明示Capを維持 |
| S10 | `surface.network`。U/V各2本以上、各交点の最近接gapを許容差で検証し、対応格子から近似面を作成。最大gapをaccuracyへ保存 |
| S11 | `surface.patch`。2境界の横断補間または順序付き4境界Coons格子をB-spline近似。sample数/fit toleranceをaccuracyへ保存 |

共通受入はregistry-firstの明示slot、入力順、複数出力、正本asset/hash、fresh runtime再読込、
正常/不成立/曖昧fixture、typed diagnostic、履歴のlastValid、Undo/Redo、v2保存/Openである。
近似演算はdisplay meshを正本にせず、fit toleranceと実測可能なgap/sample条件をaccuracyへ残す。
OCP補助spineのSweep APIは不適合入力でnative processを終了し得ることを単独probeで確認したため、
黙ったSweep1代替にはせず、2本のrailを境界制約とする明示的な近似面として実装する。

実Mac GUI/Tauri/OS dialogとPhase 1最終実機照合はIssue #37のまま未実施であり、
Linux browser/CIの成功で合格へ置換しない。全ローカル/CI/merge結果は開発ログへ追記する。
