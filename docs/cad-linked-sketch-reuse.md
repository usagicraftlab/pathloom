# 指示029 — リンク複製とsketch再利用

## 境界

指示027の分割C（項目9/12/19/21）だけを扱う。D（項目11/18）、E（項目2）、
指示028のfixture保存/全project回復dialog候補、Issue #37、Draft PR #43は対象外とする。
正規65 command ID、native演算、保存schemaVersionは変更しない。

## 契約

- リンク複製は`shape.transform`の独立bodyであり、元entityを明示入力として参照する。
  featureの`linkedDuplicate`に元entity/feature IDを残し、アウトライナーとプロパティで識別する。
  元の再計算にはDAGで追従するが、複製後のMove/Rotateは複製body側の履歴として独立する。
  元の抑制は複製を上流未解決にし、元の削除は入力をunresolvedとして保持する。array copyとは別契約である。
- 数値寸法は駆動を実線、参照を破線で表示する。駆動→参照は拘束をsolver残差から外し、
  参照→駆動は現在の測定値を新しい駆動値にして形状を動かさない。切替は同一sketchの編集であり、
  新しいfeature履歴を作らない。通常のUndo/Redo対象にはする。
- face右クリックは`support.entityId/topologyId`が一致するsketchだけを候補にする。1件なら直接編集、
  複数なら番号付き候補を全て表示し、0件なら無効表示にして別sketchを推測選択しない。
- sketchの独立コピーはpoint/line/circle/constraint/dimensionのIDと、それらを指す全参照を再採番する。
  face右クリックでは選択face、履歴右クリックでは現在のdatum/作業平面を新しいsupportとする。
  sourceとcopyは別feature/body/sketchで更新、診断、Undo/Redo、Save/Openを独立して保持する。

## 証拠入口

- unit: `tests/cad-workspace.test.mjs`のP4-03 ID/参照remap。
- browser: `tests/browser/cad-direct-manipulation.spec.mjs`のリンク複製追従、
  `tests/browser/cad-basic-drawing.spec.mjs`の寸法切替・datum copy・face候補。
- 回帰: Node 24、厳密なNode 20.20.2、native全件、browser全件、GitHub CI。
  成功、失敗、再実行、optional skip、未実行を別々に記録する。
