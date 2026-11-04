# 指示031 E：前回設定で書き出し

2026-11-04〜05。指示027の最終分割、項目2だけ。対応Issueなし。
最新main `67306dd6`を起点に、既存の5形式と既存設定だけを再利用する。

## 入口と寿命

- 通常の書き出しが成功すると、workspace切替の横へ再書き出しアイコンを表示する。
  ワンクリックで直近の成功設定を使い、workspaceや現在の入力値・選択を変更しない。
  初回はアイコンを隠し、従来の通常書き出しを使う。説明文や設定欄を追加しない。
- 記録は実行中のセッション内だけ。形式、対象identity、既存オプション、ファイル名と
  native保存先の戻り値を保持する。生成したファイルのbyte列は保持しない。
  project/recovery/schema、Undo/Redo、localStorageへ保存しない。
- 成功した通常/再書き出しだけを記録する。取消、検証失敗、書込失敗は前の成功記録を保持する。
  browser downloadは従来と同じダウンロード開始を成功境界とする。browserから実OS保存先は取得できない。
- 実行中は同時書き出しを拒否し、アイコンを無効化する。対象消失時も無効化し、新しい選択へ切り替えない。
  Open/文書置換で記録を消す。置換前の遅延prepareは書き込まず、既に開始したOS保存の応答も
  新しい文書へ記録を復活させない。失敗したOpen準備は元文書の記録を消さない。

## 形式と対象の対応

| 既存形式 | 再利用する設定 | 再生成する現在データと境界 |
| --- | --- | --- |
| G-code | 基本設定、printer/profile/template、filament、build volume、tool設定、instance identity/配置/順序/pause、ファイル名、保存先 | 元sourceの現在path/generatorを同じ生成・検証・thumbnail経路へ渡す。後から追加した対象は含めず、元instance/sourceやtool設定が欠けたら拒否する |
| STEP | document/body identity、ファイル名、保存先 | 元bodyの現在tipを既存OCCT経路で書き出す。選択を変えても別bodyへ切り替えない。非valid/warning、対象消失、非同期書出し中の元geometry変更を拒否する |
| generator.json | generator/source identity、ファイル名 | 同じ生成グラフの現在定義を既存validator/JSON整形で書き出す。新しく選択したグラフへ切り替えない |
| library-item.json | 保存済みentry identity、ファイル名 | 同じentryと既存container wrapperを書き出す。Library選択変更を採用しない |
| .toolpath | 元source identity、ファイル名 | 同じsourceの現在pathを既存JSON整形で書き出す。生成エラー時は従来どおり拒否する |

G-codeのCAD binding、print link、layer height、build volume、負Z、pause、tool IDなどの検証は維持する。
同じデータと設定なら通常/再書き出しのファイルが一致し、データを編集した場合は同じ対象の現在データを
同じ設定で再生成する。プリンタ送信やproject保存は今回の書き出し記録へ含めない。

nativeの`save_gcode_file`/`save_cad_step`は、既存保存結果の絶対パスを任意の`currentPath`で受け取る。
同じ拡張子（G-codeはgcode、STEPはstep/stp、大文字も可）だけを既存atomic writerへ渡し、内容を変換しない。
`currentPath`がない通常保存は従来のOS dialogを使う。browser downloadは既存ファイル名を再利用し、
保存場所の扱いはbrowser設定に従う。

## 証拠と範囲

- `tests/repeat-export.test.mjs`の5件：設定snapshot、現在データ再生成、成功境界、取消/失敗保持、
  同時実行、文書切替中の遅延応答、対象消失、形式切替。
- `tests/browser/repeat-export.spec.mjs`の3件：G-code全byte一致、現在入力値/モード維持、追加対象除外、
  取消/失敗/二重click/負Z拒否、STEPの元body編集後の現在tipと保存先、実OCCT再読込で体積12000 mm³・幅30 mm、
  対象削除/Open、JSON/toolpath/Libraryの選択変更後の対象と全byte一致。
- Rust保存helperの2件：絶対パスと形式検証、同じ保存先の新しいbyte列へのatomic置換。
  自動fixtureを実Mac GUI/Tauri/OS dialogの実機合格へ置き換えない。
- 正規65機能ID、既存A/T/R 62行、CAD/native演算、command定義、保存schemaは変更しない。
  新形式/STL exporter、新設定項目、指示028のfixture候補、実Mac Issue #37、Draft PR #43は対象外。
  全件検証/失敗/再実行/skip/未実施/CIの実結果は開発ログ・PR・ボードへ記録する。
