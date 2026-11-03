# 指示030 D：断面検査と押し出しの面計測

2026-11-03。対象は指示027の項目11/18だけ。対応Issueなし。
Muse 19:46判断で面の向きを法線とdirectionの平行/反平行に確定した。

## 断面検査（項目11）

- CADメニューの断面アイコンから起動する解析機能。正規65 commandへ追加しない。
  選択中の可視Surface/Shell/Solid/Compoundを使い、未選択ならキャンバス上で対象を選ぶ。
- 切断平面は対象boundsの中心、現在作業面の向きで開始する。X/Y/Zボタンで法線を切り替え、
  矢印をドラッグするとその法線方向へ動く。矢印がカメラに正対するときは画面の上下ドラッグを使う。
- 平面は半透明の青、実OCCT断面曲線はオレンジで表示する。計算中は破線枠、失敗時は赤枠。
  長い説明文や状態文を追加して区別しない。E14 Sectionは成果物を作る既存コマンドとして別導線を保つ。
- 既存`shape.section`を`intent:preview`で呼び、描画summaryだけを使う。feature/entity/assets、
  commandDefinitions、draftSessions、Undo transaction、保存schemaを変更しない。
- 同時カーネル要求は1件。ドラッグ中の待機要求は最新平面へまとめ、古いsequence・文書・revision・
  runtime・元geometry hashの結果を表示しない。終了後の遅延結果も破棄し、全出力handleを解放する。
- Escape、×、別コマンド、文書の置換/変更、workspace切替で終了する。Save/Openで検査を復元しない。

## 面までの距離（項目18）

- S05/B07の`shape.extrude`実行中、profileを指定した後のfaceクリックで一度だけ計測する。
  faceの正確なplanar/normal summaryを使い、法線とdirectionがangularRad以内で平行/反平行の平面だけを採用。
  hoverで採用可は緑、不採用は赤とし、説明テキストは追加しない。
- profileの最初の正確な頂点（頂点がない場合はbounds中心）を基準点とする。
  face上の選択点q、法線n、正規化方向d、基準点pから`L = dot(q-p,n)/dot(d,n)`を計測する。
  `distanceMm=L`、`bothSides=true`なら`distanceMm=2L`。既存の総距離契約`±distanceMm/2`を保持する。
- 面自体がdirectionと平行な側面、傾斜面、曲面、距離0/非有限、方向0は採用せず、数値・profile参照を維持する。
- 更新対象は既存の数値parameterのみ。target face参照・終端mode・追従を保存せず、面移動後も距離は変わらない。
  ユーザーが後で数値を変更でき、通常の確定・Undo/Redo・Save/Openを使える。
- native演算、E/S command定義・version、schemaは変更しない。E項目2、指示028のfixture候補、
  実Mac Issue #37、Draft PR #43は対象外。

## 証拠

- `tests/cad-inspection.test.mjs`：符号/反平行/両側総距離、除外面、任意平面の基底、最新結果だけの採用、
  同時要求数制限、文書不変、遅延結果破棄、handle解放。
- `tests/browser/cad-inspection.spec.mjs`：実OCCT Box断面の長さ60/40 mm、pointer-up前のライブ更新、
  履歴/正本/保存内容不変、Escape/Open終了、実face選択、符号/両側/除外、元面移動後の非追従、Undo/Redo/Open。
- 全件実行とCIの成否、再実行、skip、未実施は開発ログ・PR・ボードへ実結果を記載する。
