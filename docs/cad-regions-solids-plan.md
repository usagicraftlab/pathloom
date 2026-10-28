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

## 実装時の契約・境界

- S03は同一平面の閉loopをexact sectionで交差検査し、包含深さで穴/島を決定。
  開loop/接触/重複/非平面はtyped診断。独立faceを全出力しslotは正本hash由来。
- B01 v2はdimensions/twoCorners/threePoints。モードで使わない欄を隠し、底面/高さを明示。
  v1定義は不変。B02 ellipsoidはunit sphereの一般アフィン変換を正本へ適用。
- Pipeは円断面をrail始点/接線へ配置し実OCCT掃引。frameと角部の方式、Capを明示。
  成立しない掃引は正本検査で拒否。Torusは非自己交差の管半径<主半径を基本契約とする。
- B07は穴付きfaceの正本押出。Cap=falseは外/内壁を開いた結果として保持する。
- Capはsew後の位相的自由境界を平面ごとにgroup化し、穴を保つ領域を加える。
  Assembleは閉shellをSolidに、開shell/faceをwarning付きで保持。Boolean Unionは別操作。
- Intersectionは体積共通が空でも正本境界をCommon/Sectionし、被覆部分をCutで除いた
  面/edge/点接触を保持する。重複加算/表示mesh/近傍による参照付替えは用いない。
- Fillet v2はchainPolicy=selected/tangentを明示。selectedでkernelが未選択連鎖を要求すれば
  曖昧診断、tangentで許可。旧v1のtangentChain=falseでもkernelが連鎖を採用していた挙動は
  保存互換のため保持する。旧browser基準シーンは新UIでtangentを明示し同じ形状条件を維持。
- Chamfer v2のdistance2=nullは等距離。2距離には各edgeと同順のdistance1Facesが必要。
  Shellは除去面所属/正厚さ/内外を検査。kernel成功でも内側の体積が減らない結果を採用しない。

## 検出した失敗と修正

- 既存native初回70件は67成功1失敗2skip。Filletに新しい連鎖拒否を一律適用すると
  旧v1の丸角Rectangle下端edgeの基準を壊した。旧定義を変えずv2明示契約へ分けて解消。
- 追加native初回は24件21成功3失敗（うち12件はhelper classの重複収集で後に解消）。
  楕円体の既定volume積分誤差0.04396687183499637mm³は適応Surface/Volume積分へ修正。
  非平面faceの自由境界をtolerance版で拾えない問題は位相版へ、Shell厚さ100が元Box
  volume1000のまま成功になる問題は内側体積減少の検査で修正。追加12件再実行12成功。
- 新Fillet連鎖と面/edge/点接触の受入を加え、native全83件81成功/任意USD2skip。
  接触fallback初回のFuseは異なる次元の重複除去で不成立。kernel set差分Cutへ変更し、
  面接触area100/周長40、edge接触長10、点接触、非接触emptyを正確に区別した。
- 追加browser初回4成功2失敗はRectangle中心adapterのfixture座標/位相bboxの参照箇所を修正。
  次5成功1失敗はRedo再計算完了前のassertionで、同じ開閉値をpollして6成功へ回復。
- 初回全browser57件54成功3失敗は、Box v2のanchorMode selectへ旧fixtureがfillした停止。
  同じcorner値と全assertionを保ちselectOptionへ変更。最終全件は接触UIを加え58件で再実行。

実機#37/Phase3/予約010〜011へ着手せず、未実施を成功と書かない。

19:39 JST最終local：Node24/20各204成功、native全83件81成功/任意USD2skip、browser全58成功。
失敗/JS・browser skip/retry/flaky0、browser errors[]。コマンド/時間/全履歴は開発ログ。
公開後の最終head全CIを別途照合するまでDraft/未マージを維持する。
