# 指示018 追加UI受入対応

対象はボード2026-10-30 20:19〜21:08の採用項目と、10-31 08:35の軸別Scale許可。
下表は実装と検証入口の対応。成否・失敗履歴・最終CIは開発ログ/PR44に区別して残す。
第1〜12弾の情報配置/基準面/fixture追随の旧証拠を、追加項目の合格には転用しない。

## 境界

- dragは1mm固定、Altで0.1mm相当。回転は15°刻み、Shift中は自由。数値wheelはhover欄、
  右設定のEnterは次欄へ移る。Esc一回で未確定drag/sessionを破棄する。
- 自動Extrudeはbboxで候補を絞り、既存Intersectionで正確な交差を確認する。交差が1体のとき
  正方向は既存Union、負方向は既存Differenceを後置。既存arguments/tools・消費/保持・bindingを使い、
  両featureを残してUndo/Redoだけ1単位へまとめる。複数交差は通常Extrudeのまま理由を表示し、
  実測をボード@Museへ報告する。新しい履歴形式は作らない。
- history hover/scrubはfeature-prefixの表示再生。消費された上流tipも表示する。表示固定と
  double clickによる現在復帰だけで、現文書/body tip/保存/bindingを戻さない。
- Scale v1のcenter/factor定義は保持。v2はaxisFactors XYZを追加、実倍率はfactor×axisFactors。
  全値は有限かつ正、pivotは不変。全軸1は従来gp_Trsf、異方変換だけgp_GTrsfと
  BRepBuilderAPI_GTransformを使う。08:35許可の例外で、他項目のnative/schema/bindingは変更しない。
- 配列は原形状を残す既存独立Move。パネルを開いて形状dragで間隔を調整し、個数2〜100と
  間隔を確定する。全コピーを1 Undoにまとめ、cancel/Escでは正本を変更しない。
- pin/順序/色/thumbnail/folderはlocalStorageのUI設定。folderは文書IDごとのbody集合で、
  CAD依存関係や保存schemaを変更しない。生成dropは既存useEntityForGenerationを呼ぶ。
- 推論snapは表示曲線の端点/弧長中点、bbox中心、face中心、線分の空間交点。
  遮蔽された点へ近接投影だけで吸着しない。交点は軸境界で候補を絞り、線分数で一括省略しない。

## 全採用項目

`direct`はtests/browser/cad-direct-manipulation.spec.mjs、`review`はcad-ui-review.spec.mjs、
`recovery`はcad-project-recovery.spec.mjs。実OCCTを使い、OS/Tauri transportだけfixture。

| No. | 採用項目 | 実装・検証入口 |
| --- | --- | --- |
| 1 | 距離/量の矢印drag | distance handle、direct symmetric/adaptive Fillet |
| 2 | cursor距離、1mm/精密key | readout、direct Move inference/Alt |
| 3 | edge Fillet/Chamfer drag | edge drag/現行v2 context、direct adaptive |
| 4 | 数値hover wheel | 右設定、direct numeric wheel |
| 5 | 3D寸法double click入力 | 投影W/D/Hとinline edit、direct visibility |
| 6 | 履歴hover preview | prefix表示、direct history |
| 7 | Move/Rotate gizmo | 軸矢印/ring、direct Move/rotation |
| 8 | 増加/除去の半透明色分け | 実Difference delta、direct体積500/500 |
| 9 | 適応面edge選択/double click全体 | 遮蔽hit/部分overlay、direct adaptive |
| 10 | 推論snap marker/guide | ui-interactions、JS inference、direct Polyline/Move |
| 11 | cursor中心zoom | OrbitControls.zoomToCursor、direct wheel zoom |
| 12 | drag scrub/表示固定 | slider/消費前tip再生、JS replay/direct history |
| 13 | 自動追加/切取 | exact Intersection＋Union/Difference、review automatic/direct multiple |
| 14 | Ctrl-drag copy | canvas/gizmo独立Move、direct Ctrl copy |
| 15 | L→R包含/R→L接触 | 投影mesh/curve/点、direct direction-based range |
| 16 | Polyline始点snap/面化 | 既存Planar Region、direct面積50 |
| 17 | 対称押出しdrag | bothSides、direct bbox ±10 |
| 18 | outliner順序drag | body順序UI設定、direct outliner reorder |
| 19 | face/edge文脈menu | 型に適用可能な登録command、direct adaptive |
| 20 | command pin | 上部pin、review additions |
| 21 | 2点測定 | 距離/線表示、direct measurement 10mm |
| 22 | 回転15°/自由key | direct rotation/Shift free |
| 23 | 右上view cube | 既存SVG再利用、direct/review実click |
| 24 | group hover展開 | pointerenter/focus展開、review分類/縦展開 |
| 25 | Esc一回終了 | session/edit/pick終了、既存作図/direct cancel |
| 26 | 等間隔配列preview/count/spacing | nonmodal設定＋形状drag、direct array |
| 27 | 編集modeだけicon並替 | draggable制御、direct command reorder |
| 28 | outliner/3D同色tag | UI色→material、review additions |
| 29 | inline rename | double click入力、review additions |
| 30 | Mirror face/反転preview | 可視face plane、direct pivot/Mirror |
| 31 | 生成panelへのdrop | 既存binding、direct generation ready |
| 32 | Move端点/中心/面guide | 他body候補、direct Move inference |
| 33 | Tab panel非表示 | UI toggle、review additions |
| 34 | 選択W×D×H常時表示 | 下部寸法、direct visibility |
| 35 | thumbnail ON/OFF | preview曲線SVG、review additions |
| 36 | drag中Escで開始前へ | 未確定session破棄、direct hash不変 |
| 37 | folder grouping | body集合/folder名、direct folders |
| 38 | suppressed灰色/半透明 | history class/ghost、review suppression実表示 |
| 39 | 確認付き前回作業再開 | 既存checkRecovery再利用、recovery全件 |
| 40 | H/Shift+H | visibility transaction/実表示、direct visibility |
| 41 | 原点/色付きXYZ常時表示 | origin group、direct originVisible |
| 42 | 右設定Enter次欄 | focus順、direct Enter |
| 43 | I isolate/Shift+H解除 | visibility transaction、direct isolate |
| 44 | click pivot | 可視snap/faceからcenter/axis.origin、direct pivot |
| 45 | 角/軸Scale | v2 handle、native pivot/volume/fresh import/v1、direct Scale |
| 46 | shortcut help | help一覧、direct shortcut help |

不採用（recent commands、連続実行、空白double click fit、寸法tooltip、文書rollback、
selection filter、視点animation、collision highlight、grid切替等）は追加しない。
08:19のC/E/スケッチ挙動共有は014〜017以降の資料で、このPRへ先行実装しない。
65機能/A-T-R62行や実Mac Issue37の未実施を、このUI対応表で合格へ変更しない。
