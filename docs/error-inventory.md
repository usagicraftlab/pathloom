# Pathloom エラー・動作制約の棚卸し

調査日: 2026-10-19。対象はこのワークスペースの未コミット変更も含む現在のソースです。

## 読み方と範囲

アプリ本体のJavaScript、Rust、ネイティブCADのPython、開発・接続用スクリプト、Grasshopper送信コードを静的に調査しました。下の一覧は**エラー生成・返却・通知・伝播の箇所**です。同じ文言が複数箇所にある場合や、他の例外を転送する箇所も含むため、「異なるエラーメッセージの個数」ではありません。

vendor依存ライブラリ、生成コード、ビルド成果物、テスト内の意図的なエラーは対象外です。OS・ネットワーク・Open CASCADE・QuickJS・Codexなどから動的に返るメッセージには有限の全一覧がないため、ここではその受け取り・返却箇所を記載しています。実際にすべてのエラーを発生させた動作試験ではありません。今回、動作の変更や制約の削除はしていません。

`${...}`・`{...}`は実行時に名前・数値・元のエラーが入る部分です。各行の「コード」は実装そのものを記載しています。短縮した箇所はソースリンクで全文を確認できます。

## 操作を止める主な条件

| 領域 | 現在の条件・エラーの種類 | 性質 |
| --- | --- | --- |
| 入力の形式 | ID重複、未知の入力型、必須項目不足、不正な座標・数値・リスト、パラメータの範囲外 | データ形式の整合性。上限の一部は設計上の制限 |
| Curve入力 | 手動Curve入力は2Dの点列、2〜256点、座標±500。Control／Polyline以外不可 | 汎用3D Curve処理とは別に残っている入力UI・形式の制限 |
| Point入力 | 3座標の有限値、手動入力の座標±1,000 | 入力形式＋設計上の上限 |
| Number入力 | min＜max、step＞0、値が範囲内、範囲の絶対値≤10,000 | 入力・スライダーの制約 |
| List入力 | 空不可、256要素まで、有限値、絶対値≤10,000 | 入力形式＋設計上の上限 |
| ノード接続 | 型不一致、自己接続、循環、存在しない参照、重複接続、不正ポート | グラフの整合性 |
| 未接続ノード | pendingInputsを持つノードは入力待ち。必須入力の切断自体は可能。下流の結果も空になる | エラーではなく待機状態。古い結果を出力しない |
| ノード削除 | 下流やPrint outputが参照している場合の削除、一部の最後のノード削除 | 参照保護。削除時の自動切断はまだ全面対応していない |
| Curve演算 | Seamは閉曲線限定。Offset／Bottom／Shells／Twist／Radial waveには閉じたXY平行の輪郭が必要な経路がある | 演算実装の適用範囲 |
| Boolean | 閉曲線・同一XY平行平面が必要、演算失敗、結果が空 | 平面Booleanの制限と演算結果の扱い |
| Join | 許容差が正でない、端点の接続候補が曖昧、閉ループにならない | アルゴリズムと閉曲線化の条件 |
| 基本図形 | Center Z≠0を拒否するプリミティブ、矩形配列のZ間隔≠0を拒否 | 一般的な3D編集には不要かもしれない実装上の制限 |
| 拡縮・配列等 | 負・ゼロのScale不可、上限超過、整数個数でない、分割数やコピー数の上限 | 演算仕様＋負荷制御。下の数値表参照 |
| Shell／Wave | 壁数1〜8、中心を横切るオフセット、半径が潰れる波形などを拒否 | 幾何条件＋設計上の数値制限 |
| AI定義 | 不正なJSON・パッチ、未知の演算・型、版不一致、対象外ノード・入力・出力の変更 | 定義形式と編集範囲の保護 |
| AIの新規Component | 既存を保持、Create new Componentでは追加は1個、内部はRecipeにまとめる | UIの操作契約。自由な一括生成への制限になりうる |
| AI認証・利用枠 | 未接続、アカウント状態・利用枠不明／超過、応答失敗・タイムアウト | 外部サービスと利用制御 |
| AIデータ量 | コンテキスト・指示・パッチ・応答のサイズ超過、保持したgeometryRef/codeRefを復元できない | 通信量・参照整合性 |
| コードComponent | コードなし・64,000文字超・codeとstepsの混在・未知の出力型・不正デフォルト | スキーマ＋コード量上限 |
| コードの入出力型 | 出力はCurve／Points／number／list／boolean／tool-info。任意のSurface生成や任意構造の出力には未対応 | 型の表現能力の制限 |
| コード実行 | QuickJS未初期化、構文・実行エラー、有限値でない出力、型違い、点数・メモリ・時間・入出力サイズ超過 | 実行の健全性と資源保護 |
| コードの利用可能API | fetch・DOM・ファイル・import・shell・非同期API等なし。ネイティブCADは接続B-repのcad.sectionのみ | 実行環境の隔離と未提供機能 |
| STEP/B-rep読み込み | 空／形式不正／サイズ超過、変換失敗、CADランタイム・コンバーター未設定、空モデル・不正Mesh等 | データと実行環境 |
| 面編集 | 存在しない面、面・形状が対象条件を満たさない、変換後に形状が壊れる、接続を維持できない | ネイティブCADの演算可能範囲 |
| Slice | 形状未受信、レイヤー高さ・許容差不正、層数・点数超過、断面が得られない／空 | 断面処理と負荷制御 |
| Grasshopper Live | Source不正、B-repなし、不正形状、RhinoからのSTEP出力失敗、WebSocket切断、受信・キャッシュ上限 | 入出力データ・通信 |
| Print output | Z不足、負のZ、カーブ内Z変化、座標±10,000超、自己交差／同層交差、ゼロ長線分、点数・セグメント探索範囲超過 | 印刷用の幾何検証。途中Curveの制限とは別 |
| イントロ線 | パラメータ不正、イントロと本体の交差 | 印刷経路の生成条件 |
| G-code出力 | オブジェクトなし、参照が古い／再計算待ち、生成エラー、既知の層高とPrint heightの不一致、設定値不正、配置とベッド範囲の検証等 | 出力の整合性・印刷設定 |
| 不明な層高 | nullの層高は現在エラーにしない。Basic settingsのPrint heightを使う | 直近に解除済みのブロック |
| サムネイル | 空形状、画像寸法・画素配列の不正、描画・符号化失敗 | 画像生成 |
| ファイル保存・読み込み | ファイル名・拡張子・サイズ・JSON不正、権限不足、書込失敗、プロジェクト参照不整合 | ファイル操作・データ形式 |
| Library | 無効な保存形式、名前・グループ・タグ・版の不正、参照欠落、同版のコード衝突 | 再利用する定義の整合性 |
| Printer Connection | URL・認証情報・保存先不正、Keychain／設定保存失敗、接続失敗・認証失敗・タイムアウト | プリンター接続 |
| プリンター転送 | ファイル名・拡張子・サイズ不正、保存先なし／読取専用、同名ファイル、印刷中、二重送信、通信中断 | 転送先の状態・競合・通信。上書きしない仕様も含む |
| 開発用サーバー | ポート競合、HTTP入力・URL・ルート不正、要求サイズ超過、ローカル設定不備 | 起動と開発時の接続 |

## 見直す余地が大きい制限

- 手動Curve入力が2D・256点・±500に固定されていること。
- Point／Number／Listの汎用データに、印刷寸法とは無関係な固定上限があること。
- 基本図形でZ≠0を拒否すること、矩形配列をXYに限定すること。
- 空のBoolean・Offset結果を正常な空集合として扱わず、失敗として扱うこと。
- Seamが開曲線をエラーにすること。利用目的によってはそのまま通す方が自然。
- Shell数・分割数・Scale等の固定数値範囲が、演算に必要な条件と負荷制御を兼ねていること。
- 任意のデータ構造、Surfaceの独自生成・編集、コードComponentからの広いネイティブCAD呼び出しが未提供なこと。
- Component削除の際、参照を自動で外す代わりに止めるケースがあること。
- AIの作成・編集範囲の制約と、実際に必要なグラフの編集範囲が衝突しうること。
- Print outputにおける交差禁止・一定Z・座標上限が、ユーザーの出力方式によっては厳しすぎること。ただし途中形状の検証とは分けて扱うべき。

## 基本Componentの数値範囲

この表はBASIC_COMPONENTS.constraintsの現在値です。これ以外の演算条件・上限は後半の発生箇所一覧にあります。

| Component | パラメータ | 許容範囲 |
| --- | --- | --- |
| circle | radius | 0.05〜500 |
| circle | samples | 12〜720、整数 |
| ellipse | radiusX | 0.05〜500 |
| ellipse | radiusY | 0.05〜500 |
| ellipse | samples | 12〜720、整数 |
| rectangle | width | 0.1〜1000 |
| rectangle | height | 0.1〜1000 |
| rounded-rectangle | width | 0.1〜1000 |
| rounded-rectangle | height | 0.1〜1000 |
| rounded-rectangle | radius | 0.01〜500 |
| rounded-rectangle | samples | 12〜720、整数 |
| polygon | radius | 0.05〜500 |
| polygon | sides | 3〜64、整数 |
| polygon | angle | -36000〜36000 |
| star | radius | 0.05〜500 |
| star | innerRadius | 0.01〜500 |
| star | points | 3〜64、整数 |
| star | angle | -36000〜36000 |
| rotate | angle | -36000〜36000 |
| scale | factor | 0.01〜100 |
| resample | samples | 12〜720、整数 |
| seam | fraction | 0〜1 |
| array-grid | columns | 1〜16、整数 |
| array-grid | rows | 1〜16、整数 |
| array-polar | count | 1〜16、整数 |
| array-polar | radius | 0〜1000 |
| array-polar | angle | -36000〜36000 |
| curve-boolean | mode | 0〜3、整数 |
| curve-boolean | samples | 12〜720、整数 |
| offset | distance | -100〜100 |
| join-close | tolerance | 0.001〜5 |
| join-close | samples | 12〜720、整数 |
| divide-curve | count | 1〜720、整数 |
| evaluate-curve | t | 0〜1 |

## 発生箇所一覧

**40ファイル、785箇所**を検出しました。生成したメッセージだけでなく、動的例外の伝播・通知も含みます。

| ファイル | 箇所数 |
| --- | ---: |
| [print-intro.js](../print-intro.js) | 1 |
| [app.js](../app.js) | 39 |
| [cad-components.js](../cad-components.js) | 25 |
| [cad-ui.js](../cad-ui.js) | 25 |
| [src-tauri/src/project_files.rs](../src-tauri/src/project_files.rs) | 29 |
| [src-tauri/src/printer.rs](../src-tauri/src/printer.rs) | 73 |
| [src-tauri/src/lib.rs](../src-tauri/src/lib.rs) | 86 |
| [src-tauri/src/grasshopper_brep.rs](../src-tauri/src/grasshopper_brep.rs) | 7 |
| [src-tauri/src/codex_bridge.rs](../src-tauri/src/codex_bridge.rs) | 35 |
| [step-slice-worker.js](../step-slice-worker.js) | 1 |
| [cad-pipeline.js](../cad-pipeline.js) | 126 |
| [cad-library.js](../cad-library.js) | 15 |
| [cad-kernel.js](../cad-kernel.js) | 12 |
| [gcode-metadata.js](../gcode-metadata.js) | 2 |
| [gh-brep-live.js](../gh-brep-live.js) | 2 |
| [cad-input-ui.js](../cad-input-ui.js) | 22 |
| [bridge-client.js](../bridge-client.js) | 16 |
| [scripts/desktop-dev-server.mjs](../scripts/desktop-dev-server.mjs) | 1 |
| [scripts/setup-cad-runtime.mjs](../scripts/setup-cad-runtime.mjs) | 2 |
| [print-time.js](../print-time.js) | 4 |
| [cad-chat.js](../cad-chat.js) | 10 |
| [cad-code-runtime.js](../cad-code-runtime.js) | 16 |
| [cad-gizmo.js](../cad-gizmo.js) | 1 |
| [cad-worker.js](../cad-worker.js) | 5 |
| [step-geometry.js](../step-geometry.js) | 6 |
| [dxf-import.js](../dxf-import.js) | 5 |
| [native/step_brep_bridge.py](../native/step_brep_bridge.py) | 8 |
| [native/occt_brep_bridge.py](../native/occt_brep_bridge.py) | 45 |
| [cad-node-editor.js](../cad-node-editor.js) | 5 |
| [desktop-client.js](../desktop-client.js) | 29 |
| [pathloom-project.js](../pathloom-project.js) | 31 |
| [cad-graph.js](../cad-graph.js) | 18 |
| [prusalink-client.js](../prusalink-client.js) | 12 |
| [step-import.js](../step-import.js) | 16 |
| [cad-worker-client.js](../cad-worker-client.js) | 8 |
| [local-server.mjs](../local-server.mjs) | 16 |
| [bridge-server.mjs](../bridge-server.mjs) | 11 |
| [cad-ai-context.js](../cad-ai-context.js) | 12 |
| [examples/grasshopper/PathloomSender.cs](../examples/grasshopper/PathloomSender.cs) | 1 |
| [examples/grasshopper/PathloomBrepSender.cs](../examples/grasshopper/PathloomBrepSender.cs) | 7 |

### print-intro.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [2](../print-intro.js#L2) | 定義・生成／返却 | <code>new Error('Invalid Print output intro line settings')</code> |

### app.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [86](../app.js#L86) | 通知・伝播／検証経路 | <code>if(!Number.isFinite(layerHeight)&#124;&#124;layerHeight&lt;.05&#124;&#124;layerHeight&gt;10){showToast('Layer height must be between 0.05 and 10 mm','error');return}shape.sliceLayerHeight=layerHeight;shape.sliceJobRevision=(shape.sliceJobRevision&#124;&#124;0)+1;const revision=shape.sliceJobRevision;</code> |
| [88](../app.js#L88) | 定義・生成／返却 | <code>new Error(event.data?.error&#124;&#124;'STEP slicing failed')</code> |
| [88](../app.js#L88) | 定義・生成／返却 | <code>new Error(event.message&#124;&#124;'STEP slicing worker failed')</code> |
| [92](../app.js#L92) | 定義・生成／返却 | <code>new Error(result?.error&#124;&#124;'Native B-rep import returned no shapes')</code> |
| [94](../app.js#L94) | 定義・生成／返却 | <code>new Error('Native B-rep import returned an invalid display mesh')</code> |
| [95](../app.js#L95) | 定義・生成／返却 | <code>new Error('Native B-rep mesh exceeds Pathloom limits')</code> |
| [97](../app.js#L97) | 定義・生成／返却 | <code>new Error('Native B-rep import returned an invalid triangle-to-face map')</code> |
| [104](../app.js#L104) | 定義・生成／返却 | <code>new Error('Edited CAD shape was not returned')</code> |
| [105](../app.js#L105) | 定義・生成／返却 | <code>new Error('Edited CAD face mapping is invalid')</code> |
| [124](../app.js#L124) | 定義・生成／返却 | <code>new Error('CAD object changed during edit')</code> |
| [124](../app.js#L124) | 定義・生成／返却 | <code>new Error('CAD object changed; select it again')</code> |
| [162](../app.js#L162) | 定義・生成／返却 | <code>new Error('Missing paths[]')</code> |
| [162](../app.js#L162) | 定義・生成／返却 | <code>new Error(&#96;Invalid XYZ point in path ${index}&#96;)</code> |
| [162](../app.js#L162) | 定義・生成／返却 | <code>new Error(&#96;Path ${index} needs at least 2 points&#96;)</code> |
| [165](../app.js#L165) | 定義・生成／返却 | <code>new Error('Grasshopper payload needs paths[]')</code> |
| [165](../app.js#L165) | 定義・生成／返却 | <code>new Error('Grasshopper source is required')</code> |
| [479](../app.js#L479) | 通知・伝播／検証経路 | <code>function upsertFilament(e){e.preventDefault();const color=normalizeHex($('#filamentHex').value)&#124;&#124;normalizeHex($('#filamentColor').value);if(!color){showToast('Enter a valid hex color','error');return}const id=$('#filamentEditId').value&#124;&#124;uid();const record={id,name:$('#filamentName').value.trim(),brand:$('#filamentBrand').value.trim(),material:$('#filamentMaterial').value,diameter:Number($('#filamentDia').value)&#124;&#124;1.75,color};if(!record.name){showToast('Filament name is required','error');return}const idx=filamentLibrary.findIndex(f=&gt;f.id===id);if(idx&gt;=0)filamentLibrary[idx]=record;else filamentLibrary.unshift(record);saveFilamentLibrary();renderFilamentLibrary();renderPalette();resetFilamentForm();showToast(idx&gt;=0?'Filament updated':'Filament saved')}</code> |
| [480](../app.js#L480) | 返却・伝播 | <code>error(err)</code> |
| [481](../app.js#L481) | 定義・生成／返却 | <code>new Error(&#96;HTTP ${response.status}&#96;)</code> |
| [505](../app.js#L505) | 通知・伝播／検証経路 | <code>}catch(error){label.textContent='Print time in total: —';detail.textContent=error.message}</code> |
| [509](../app.js#L509) | 定義・生成／返却 | <code>new Error('Wait for the 3D preview before exporting')</code> |
| [521](../app.js#L521) | 定義・生成／返却 | <code>new Error('No geometry to capture')</code> |
| [557](../app.js#L557) | 定義・生成／返却 | <code>new Error('Add a .toolpath file first')</code> |
| [559](../app.js#L559) | 定義・生成／返却 | <code>new Error(&#96;${source.label}: ${source.generationError}&#96;)</code> |
| [560](../app.js#L560) | 定義・生成／返却 | <code>new Error(&#96;Set Print height to ${layerHeight} mm to match ${source.label}&#96;)</code> |
| [562](../app.js#L562) | 定義・生成／返却 | <code>new Error('Check Basic Settings')</code> |
| [567](../app.js#L567) | 定義・生成／返却 | <code>new Error('Objects extend outside the configured build volume')</code> |
| [572](../app.js#L572) | 定義・生成／返却 | <code>new Error('Prusa output requires numeric tool IDs')</code> |
| [581](../app.js#L581) | 通知・伝播／検証経路 | <code>lines.push(&#96;; Move safely from ${instanceDisplayName(previousId,previousInstance)} to ${instanceDisplayName(instanceId,instance)}&#96;,&#96;G1 Z${safeZ.toFixed(3)} F${travelFeedrate} ; raise 10 mm&#96;,&#96;G1 X${nextStart[0].toFixed(3)} Y${nextStart[1].toFixed(3)} F${travelFeedrate} ; move to next object&#96;,&#96;G1 Z${nextStart[2].toFixed(3)} F${travelFeedrate} ; lower to start Z&#96;);</code> |
| [648](../app.js#L648) | 定義・生成／返却 | <code>new Error('Printer sending requires Pathloom Desktop.')</code> |
| [652](../app.js#L652) | 通知・伝播／検証経路 | <code>}catch(err){showToast(err.message&#124;&#124;String(err),'error')}finally{button.disabled=false}</code> |
| [657](../app.js#L657) | 通知・伝播／検証経路 | <code>$('#printerProfileForm').addEventListener('submit',e=&gt;{e.preventDefault();const profiles=readPrinterProfiles(),name=$('#profilePrinter').value,profile={};for(const[field,basic]of profileFields){const value=Number($(&#96;#${field}&#96;).value);if(!Number.isFinite(value)&#124;&#124;value&lt;=0){showToast('Enter positive profile values','error');return}profile[basic]=value}profile.startGcode=$('#profileStartGcode').value.trim();profile.toolChangeGcode=$('#profileToolChangeGcode').value.trim();profile.endGcode=$('#profileEndGcode').value.trim();try{profiles[name]=profile;localStorage.setItem(PROFILE_KEY,JSON.stringify(profiles));$('#printerSelect').value=name;applyPrinterProfile(name);showToast('Printer profile saved')}catch{showToast('Unable to save printer profile','error')}});</code> |
| [659](../app.js#L659) | 定義・生成／返却 | <code>error('3D preview initialization failed',err)</code> |
| [688](../app.js#L688) | 定義・生成／返却 | <code>new Error(&#96;${source.label}: select the object to update its linked Print Settings before saving or exporting&#96;)</code> |
| [691](../app.js#L691) | 定義・生成／返却 | <code>new Error(&#96;${source.label}: fix the generation error before saving&#96;)</code> |
| [730](../app.js#L730) | 定義・生成／返却 | <code>new Error('Unsupported print setting')</code> |
| [731](../app.js#L731) | 定義・生成／返却 | <code>new Error('A parameter following Print Settings cannot drive Print Settings')</code> |
| [731](../app.js#L731) | 定義・生成／返却 | <code>new Error('Link requires a positive parameter on a generated object')</code> |
| [744](../app.js#L744) | 定義・生成／返却 | <code>new Error('Wait for the 3D view')</code> |

### cad-components.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [29](../cad-components.js#L29) | 定義・生成／返却 | <code>new Error('Cannot resample a collapsed curve')</code> |
| [34](../cad-components.js#L34) | 定義・生成／返却 | <code>new Error('Operation needs at least one non-collapsed closed curve')</code> |
| [36](../cad-components.js#L36) | 定義・生成／返却 | <code>new Error('Choose Union, Difference, Intersection or XOR')</code> |
| [37](../cad-components.js#L37) | 定義・生成／返却 | <code>new Error('Curve Boolean needs at least one curve in A')</code> |
| [37](../cad-components.js#L37) | 定義・生成／返却 | <code>new Error('Difference, Intersection and XOR need at least one curve in B')</code> |
| [38](../cad-components.js#L38) | 定義・生成／返却 | <code>new Error('Curve Boolean requires all curves on the same XY-parallel plane')</code> |
| [42](../cad-components.js#L42) | 定義・生成／返却 | <code>new Error('Curve Boolean failed; check for invalid or intersecting input curves')</code> |
| [43](../cad-components.js#L43) | 定義・生成／返却 | <code>new Error('Curve Boolean result is empty')</code> |
| [49](../cad-components.js#L49) | 定義・生成／返却 | <code>new Error('Offset could not normalize the input regions')</code> |
| [53](../cad-components.js#L53) | 定義・生成／返却 | <code>new Error('Offset removed all contours; reduce the offset distance')</code> |
| [57](../cad-components.js#L57) | 定義・生成／返却 | <code>new Error('Cannot evaluate a collapsed curve')</code> |
| [62](../cad-components.js#L62) | 定義・生成／返却 | <code>new Error('Join is ambiguous at a branching endpoint')</code> |
| [64](../cad-components.js#L64) | 定義・生成／返却 | <code>new Error('Curves did not form a closed loop within tolerance')</code> |
| [67](../cad-components.js#L67) | 定義・生成／返却 | <code>new Error('Curve sampling is unavailable')</code> |
| [68](../cad-components.js#L68) | 定義・生成／返却 | <code>new Error('Curve Boolean accepts closed planar curves only')</code> |
| [69](../cad-components.js#L69) | 定義・生成／返却 | <code>new Error('Join tolerance must be positive')</code> |
| [70](../cad-components.js#L70) | 定義・生成／返却 | <code>new Error('Division count must be a positive integer')</code> |
| [70](../cad-components.js#L70) | 定義・生成／返却 | <code>new Error('Select at least one curve')</code> |
| [70](../cad-components.js#L70) | 定義・生成／返却 | <code>new Error('Select valid curves')</code> |
| [78](../cad-components.js#L78) | 定義・生成／返却 | <code>new Error('Curve primitives are in XY; move in Z after Stack')</code> |
| [80](../cad-components.js#L80) | 定義・生成／返却 | <code>new Error('Corner radius must fit inside the rectangle')</code> |
| [81](../cad-components.js#L81) | 定義・生成／返却 | <code>new Error('Inner radius must be smaller than outer radius')</code> |
| [85](../cad-components.js#L85) | 定義・生成／返却 | <code>new Error('Component output exceeds the point/copy budget')</code> |
| [86](../cad-components.js#L86) | 定義・生成／返却 | <code>new Error('Scale factors must be greater than 0 and at most 100')</code> |
| [87](../cad-components.js#L87) | 定義・生成／返却 | <code>new Error('Rectangular arrays use XY spacing; use Linear array for Z offsets')</code> |

### cad-ui.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [31](../cad-ui.js#L31) | 通知・伝播／検証経路 | <code>function previewStep(id){stopVisual();selectedStep=id&#124;&#124;null;clearStage();if(workspaceMode==='output')return;if(!id){if(pending)try{quickPreview()}catch{}return;}for(const node of document.querySelectorAll('.operation-shell'))node.querySelector('.stage-toggle input').checked=node.dataset.stepId===id;const own=stageRevision;try{const next=stageDefinition(definition,id);stageWorker=createCadWorker();stageTimer=setTimeout(()=&gt;{if(own===stageRevision){clearStage();$('cadProcessingStatus').textContent='Stage preview exceeded 30 seconds'}},30000);stageWorker.onerror=event=&gt;{if(own===stageRevision){clearStage();$('cadProcessingStatus').textContent=event.message&#124;&#124;'Preview failed'}};stageWorker.onmessage=event=&gt;{if(own!==stageRevision)return;stageWorker.terminate();stageWorker=null;clearTimeout(stageTimer);if(!event.data.ok){$('cadProcessingStatus' …（全文はソース参照）</code> |
| [34](../cad-ui.js#L34) | 定義・生成／返却 | <code>new Error('This action requires Pathloom Desktop')</code> |
| [69](../cad-ui.js#L69) | 通知・伝播／検証経路 | <code>syncPrintInputs(false);stopVisual();cancelJob(true);const own=revision;let valid;try{valid=validateDefinition(definition)}catch(error){markPending(error.message);return}</code> |
| [75](../cad-ui.js#L75) | 通知・伝播／検証経路 | <code>try{if(definition.editor)result.definition.editor=clone(definition.editor);for(const step of result.definition.steps){const current=definition.steps.find(s=&gt;s.id===step.id);for(const key of ['group','label','origin'])if(current?.[key]!==undefined)step[key]=clone(current[key])}validateDefinition(result.definition);sourceId=api.apply(result,generatorKey,sourceId);curveDataAttributes=result.curveAttributes&#124;&#124;{};generationError=null;inputUi.syncLinks();inputUi.syncResults();if(selectedStep&amp;&amp;definition.steps.some(step=&gt;step.id===selectedStep))previewStep(selectedStep);else clearStage(true);if(record)remember();updateUndo();drawInputs();const paths=(result.objects&#124;&#124;[{paths:result.paths}]).flatMap(o=&gt;o.paths);status(&#96;${new Set(paths.map(p=&gt;p.points[0][2])).size} layers · ${paths.length} curves${result.objects?.length&gt;1?' · '+result.objects.length …（全文はソース参照）</code> |
| [81](../cad-ui.js#L81) | 通知・伝播／検証経路 | <code>inputUi=initInputUi({curveAttributes:()=&gt;pending?{}:curveDataAttributes,definition:()=&gt;definition,saveComponent:id=&gt;openComponentSave(id),isSavedComponent:step=&gt;isSavedComponent(step),layoutChanged:editor=&gt;{definition.editor=editor;api.setEditorState(sourceId,editor)},editWithAi:id=&gt;{setMode('generate');chat?.editStep(id)},previewStep,previewStepId:()=&gt;selectedStep,sourceId:()=&gt;sourceId,replace,changed:queueGenerate,redraw:drawInputs,visibilityChanged:input=&gt;api.setInputVisibility(sourceId,input.id,input.visible),error:message=&gt;api.toast(message,'error'),toast:message=&gt;api.toast(message),printSettings:api.printSettings,printLinks:api.printLinks,setPrintLink:(target,key,on)=&gt;api.setPrintLink(target,sourceId,key,on)});</code> |
| [89](../cad-ui.js#L89) | 通知・伝播／検証経路 | <code>gizmo=initCadGizmo({preview:api.preview,error:message=&gt;api.toast(message,'error'),selection(){if(workspaceMode==='output'&#124;&#124;!inputsGroup?.visible)return null;const ids=inputUi.surfaceSelectionIds(),items=ids.map(id=&gt;{const input=definition.inputs.find(i=&gt;i.id===id);return input?.brep?{id,data:input.brep.data,faces:new Set(inputUi.selectedFaces(id)&#124;&#124;[])}:null}).filter(Boolean);if(!items.length)return null;return{items,faceSets:new Map(items.map(item=&gt;[item.id,item.faces])),objects:inputsGroup.children.filter(n=&gt;items.some(item=&gt;item.id===n.userData.inputId))}},async commit(target,offset){const rotation=-api.placement(sourceId).rotation*Math.PI/180;const local=[offset[0]*Math.cos(rotation)-offset[1]*Math.sin(rotation),offset[0]*Math.sin(rotation)+offset[1]*Math.cos(rotation),offset[2]];await inputUi.transformSurface(target,local)}});</code> |
| [119](../cad-ui.js#L119) | 通知・伝播／検証経路 | <code>async function loadLibrary(){try{library=normalizeLibrary(JSON.parse(await invoke('cad_library')));renderLibrary()}catch(error){status(error.message)}}</code> |
| [124](../cad-ui.js#L124) | 定義・生成／返却 | <code>new Error('Fix the generation error before saving a library item')</code> |
| [124](../cad-ui.js#L124) | 定義・生成／返却 | <code>new Error('Wait for generation to finish')</code> |
| [127](../cad-ui.js#L127) | 通知・伝播／検証経路 | <code>}catch(error){status(error.message)}</code> |
| [133](../cad-ui.js#L133) | 定義・生成／返却 | <code>new Error('Choose a group')</code> |
| [133](../cad-ui.js#L133) | 定義・生成／返却 | <code>new Error('Component no longer exists')</code> |
| [133](../cad-ui.js#L133) | 定義・生成／返却 | <code>new Error('Finish valid generation before saving a Component')</code> |
| [137](../cad-ui.js#L137) | 通知・伝播／検証経路 | <code>}catch(error){status(error.message)}}</code> |
| [147](../cad-ui.js#L147) | 通知・伝播／検証経路 | <code>for(const[type,label]of [['point','Point'],['curve','Curve Input'],['surface','STEP Input'],['rhino','Rhino B-rep Input']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('click',async()=&gt;{try{closeAddMenu();const shape=type==='surface'?await chooseStepShape():null;if(type==='surface'&amp;&amp;!shape)return;const next=clone(definition);if(type==='rhino'&amp;&amp;next.inputs.some(input=&gt;input.liveSource==='gh-brep-1')){inputUi.restoreSelection(next.inputs.find(input=&gt;input.liveSource==='gh-brep-1').id);return}const input=newInput(type==='rhino'?'surface':type,next.inputs);if(type==='rhino'){input.name='Rhino B-rep Input';input.liveSource='gh-brep-1'}if(shape){input.filename=shape.name;input.meshes=shape.meshes;if(shape.brep){input.brep=shape.brep;input.faces=shape.faces;input.kernel=shap …（全文はソース参照）</code> |
| [149](../cad-ui.js#L149) | 通知・伝播／検証経路 | <code>for(const group of COMPONENT_GROUPS){const members=Object.entries(OPERATIONS).filter(([,spec])=&gt;spec.group===group&amp;&amp;!spec.legacy);if(!members.length)continue;const category=categoryFor(group);for(const[operation,spec]of members){const button=document.createElement('button');button.type='button';button.textContent=spec.label;button.dataset.search=[operation,spec.description&#124;&#124;''].join(' ');button.addEventListener('click',()=&gt;{try{closeAddMenu();replace(appendComponent(definition,operation,{detached:true}))}catch(error){api.toast(error.message,'error')}});category.append(button)}}</code> |
| [150](../cad-ui.js#L150) | 通知・伝播／検証経路 | <code>const printOutputButton=document.createElement('button');printOutputButton.type='button';printOutputButton.textContent='Print output';printOutputButton.addEventListener('click',()=&gt;{try{closeAddMenu();replace(addPrintOutput(definition))}catch(error){api.toast(error.message,'error')}});categoryFor('Toolpath').append(printOutputButton);</code> |
| [161](../cad-ui.js#L161) | 通知・伝播／検証経路 | <code>$('cadExportDefinition').addEventListener('click',()=&gt;{try{download('generator.json',JSON.stringify(validateDefinition(definition),null,2))}catch(error){status(error.message)}});</code> |
| [166](../cad-ui.js#L166) | 定義・生成／返却 | <code>new Error('Unsupported library item version')</code> |
| [167](../cad-ui.js#L167) | 定義・生成／返却 | <code>new Error('This library version is already imported')</code> |
| [170](../cad-ui.js#L170) | 通知・伝播／検証経路 | <code>}catch(error){status(error.message)}event.target.value=''});</code> |
| [174](../cad-ui.js#L174) | 定義・生成／返却 | <code>new Error('Fix the generation error before saving')</code> |
| [174](../cad-ui.js#L174) | 定義・生成／返却 | <code>new Error('Wait for generation to finish')</code> |
| [181](../cad-ui.js#L181) | 通知・伝播／検証経路 | <code>}catch(error){api.toast(error.message,'error')}</code> |
| [195](../cad-ui.js#L195) | 通知・伝播／検証経路 | <code>chat=initCadChat({definition:()=&gt;clone(definition),library:()=&gt;library,stamp:()=&gt;{const content=clone(definition);delete content.editor;return JSON.stringify({sourceId,definition:content})},preview:result=&gt;api.previewProposal(result),clearPreview:()=&gt;{},async apply(proposed){const before=clone(definition),next=migrateDefinition(proposed);for(const step of next.steps){const old=definition.steps.find(s=&gt;s.id===step.id);for(const key of ['group','label','origin'])if(old?.[key]!==undefined)step[key]=clone(old[key])}if(definition.editor)next.editor=clone(definition.editor);for(const input of next.inputs){const old=definition.inputs.find(i=&gt;i.id===input.id);input.exposed=old?.exposed===true;if(old?.printSetting&amp;&amp;input.type==='number')input.printSetting=old.printSetting}definition=next;render();generate();try{await saveAiRecipes(clone(next),befo …（全文はソース参照）</code> |

### src-tauri/src/project_files.rs

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [15](../src-tauri/src/project_files.rs#L15) | 通知・伝播／検証経路 | <code>let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(&#124;e&#124; e.to_string())?.as_nanos();</code> |
| [19](../src-tauri/src/project_files.rs#L19) | 通知・伝播／検証経路 | <code>result.map_err(&#124;e&#124; e.to_string())</code> |
| [28](../src-tauri/src/project_files.rs#L28) | 通知・伝播／検証経路 | <code>let Some(file) = receiver.await.map_err(&#124;e&#124; e.to_string())? else { return Ok(None); };</code> |
| [29](../src-tauri/src/project_files.rs#L29) | 通知・伝播／検証経路 | <code>let path = gcode_save_path(file.into_path().map_err(&#124;e&#124; e.to_string())?);</code> |
| [33](../src-tauri/src/project_files.rs#L33) | 通知・伝播／検証経路 | <code>}).await.map_err(&#124;e&#124; e.to_string())?</code> |
| [42](../src-tauri/src/project_files.rs#L42) | 通知・伝播／検証経路 | <code>let parsed: Value = serde_json::from_str(&amp;content).map_err(&#124;e&#124; e.to_string())?;</code> |
| [44](../src-tauri/src/project_files.rs#L44) | 定義・生成／返却 | <code>Err("Invalid project format".into())</code> |
| [49](../src-tauri/src/project_files.rs#L49) | 定義・生成／返却 | <code>Err("Invalid project path".into())</code> |
| [62](../src-tauri/src/project_files.rs#L62) | 通知・伝播／検証経路 | <code>let Some(file) = receiver.await.map_err(&#124;e&#124; e.to_string())? else {</code> |
| [65](../src-tauri/src/project_files.rs#L65) | 通知・伝播／検証経路 | <code>let mut path = file.into_path().map_err(&#124;e&#124; e.to_string())?;</code> |
| [75](../src-tauri/src/project_files.rs#L75) | 通知・伝播／検証経路 | <code>.map_err(&#124;e&#124; e.to_string())?</code> |
| [79](../src-tauri/src/project_files.rs#L79) | 通知・伝播／検証経路 | <code>std::fs::write(&amp;temporary, content).map_err(&#124;e&#124; e.to_string())?;</code> |
| [80](../src-tauri/src/project_files.rs#L80) | 通知・伝播／検証経路 | <code>std::fs::rename(&amp;temporary, &amp;path).map_err(&#124;e&#124; e.to_string())?;</code> |
| [84](../src-tauri/src/project_files.rs#L84) | 通知・伝播／検証経路 | <code>.map_err(&#124;e&#124; e.to_string())?</code> |
| [97](../src-tauri/src/project_files.rs#L97) | 通知・伝播／検証経路 | <code>let Some(file) = receiver.await.map_err(&#124;e&#124; e.to_string())? else {</code> |
| [100](../src-tauri/src/project_files.rs#L100) | 通知・伝播／検証経路 | <code>let path = file.into_path().map_err(&#124;e&#124; e.to_string())?;</code> |
| [102](../src-tauri/src/project_files.rs#L102) | 通知・伝播／検証経路 | <code>let metadata = std::fs::metadata(&amp;path).map_err(&#124;e&#124; e.to_string())?;</code> |
| [104](../src-tauri/src/project_files.rs#L104) | 定義・生成／返却 | <code>Err("Project exceeds 200 MB".into())</code> |
| [106](../src-tauri/src/project_files.rs#L106) | 通知・伝播／検証経路 | <code>let content = std::fs::read_to_string(&amp;path).map_err(&#124;e&#124; e.to_string())?;</code> |
| [112](../src-tauri/src/project_files.rs#L112) | 通知・伝播／検証経路 | <code>.map_err(&#124;e&#124; e.to_string())?</code> |
| [117](../src-tauri/src/project_files.rs#L117) | 通知・伝播／検証経路 | <code>let directory = app.path().app_data_dir().map_err(&#124;e&#124; e.to_string())?;</code> |
| [122](../src-tauri/src/project_files.rs#L122) | 定義・生成／返却 | <code>Err("Library is too large".into())</code> |
| [124](../src-tauri/src/project_files.rs#L124) | 通知・伝播／検証経路 | <code>let parsed: Value = serde_json::from_str(&amp;content).map_err(&#124;e&#124; e.to_string())?;</code> |
| [126](../src-tauri/src/project_files.rs#L126) | 定義・生成／返却 | <code>Err("Invalid library".into())</code> |
| [128](../src-tauri/src/project_files.rs#L128) | 通知・伝播／検証経路 | <code>std::fs::create_dir_all(&amp;directory).map_err(&#124;e&#124; e.to_string())?;</code> |
| [130](../src-tauri/src/project_files.rs#L130) | 通知・伝播／検証経路 | <code>std::fs::write(&amp;temp, &amp;content).map_err(&#124;e&#124; e.to_string())?;</code> |
| [131](../src-tauri/src/project_files.rs#L131) | 通知・伝播／検証経路 | <code>std::fs::rename(temp, path).map_err(&#124;e&#124; e.to_string())?;</code> |
| [134](../src-tauri/src/project_files.rs#L134) | 通知・伝播／検証経路 | <code>std::fs::read_to_string(path).map_err(&#124;e&#124; e.to_string())</code> |
| [140](../src-tauri/src/project_files.rs#L140) | 通知・伝播／検証経路 | <code>.map_err(&#124;e&#124; e.to_string())?</code> |

### src-tauri/src/printer.rs

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [31](../src-tauri/src/printer.rs#L31) | 定義・生成／返却 | <code>error( "settings", "Unable to read or save printer connection settings.", )</code> |
| [70](../src-tauri/src/printer.rs#L70) | 定義・生成／返却 | <code>error("settings", "Enter a valid printer IP address or URL.")</code> |
| [79](../src-tauri/src/printer.rs#L79) | 定義・生成／返却 | <code>Err(error( "settings", "Use an HTTP(S) printer address without a path or embedded credentials.", ))</code> |
| [79](../src-tauri/src/printer.rs#L79) | 定義・生成／返却 | <code>error( "settings", "Use an HTTP(S) printer address without a path or embedded credentials.", )</code> |
| [98](../src-tauri/src/printer.rs#L98) | 定義・生成／返却 | <code>Err(error( "settings", "Enter a valid storage and authentication username.", ))</code> |
| [98](../src-tauri/src/printer.rs#L98) | 定義・生成／返却 | <code>error( "settings", "Enter a valid storage and authentication username.", )</code> |
| [125](../src-tauri/src/printer.rs#L125) | 通知・伝播／検証経路 | <code>keyring::Entry::new(SERVICE, &amp;s.account()).map_err(&#124;_&#124; {</code> |
| [126](../src-tauri/src/printer.rs#L126) | 定義・生成／返却 | <code>error( "credentials_store", "Unable to access the system credential store.", )</code> |
| [137](../src-tauri/src/printer.rs#L137) | 返却・伝播 | <code>Err(keyring::Error::NoEntry)</code> |
| [138](../src-tauri/src/printer.rs#L138) | 定義・生成／返却 | <code>Err(error( "credentials_store", "Unable to read printer credentials from the system credential store.", ))</code> |
| [138](../src-tauri/src/printer.rs#L138) | 定義・生成／返却 | <code>error( "credentials_store", "Unable to read printer credentials from the system credential store.", )</code> |
| [138](../src-tauri/src/printer.rs#L138) | 返却・伝播 | <code>Err(_)</code> |
| [145](../src-tauri/src/printer.rs#L145) | 通知・伝播／検証経路 | <code>Self::entry(s)?.set_password(value).map_err(&#124;_&#124; {</code> |
| [146](../src-tauri/src/printer.rs#L146) | 定義・生成／返却 | <code>error( "credentials_store", "Unable to save printer credentials to the system credential store.", )</code> |
| [154](../src-tauri/src/printer.rs#L154) | 通知・伝播／検証経路 | <code>std::fs::create_dir_all(path.parent().ok_or_else(settings_error)?)</code> |
| [155](../src-tauri/src/printer.rs#L155) | 通知・伝播／検証経路 | <code>.map_err(&#124;_&#124; settings_error())?;</code> |
| [166](../src-tauri/src/printer.rs#L166) | 通知・伝播／検証経路 | <code>let mut file = options.open(&amp;temp).map_err(&#124;_&#124; settings_error())?;</code> |
| [167](../src-tauri/src/printer.rs#L167) | 通知・伝播／検証経路 | <code>file.write_all(&amp;serde_json::to_vec(s).map_err(&#124;_&#124; settings_error())?)</code> |
| [168](../src-tauri/src/printer.rs#L168) | 通知・伝播／検証経路 | <code>.map_err(&#124;_&#124; settings_error())?;</code> |
| [169](../src-tauri/src/printer.rs#L169) | 通知・伝播／検証経路 | <code>file.sync_all().map_err(&#124;_&#124; settings_error())?;</code> |
| [170](../src-tauri/src/printer.rs#L170) | 通知・伝播／検証経路 | <code>std::fs::rename(&amp;temp, path).map_err(&#124;_&#124; settings_error())</code> |
| [180](../src-tauri/src/printer.rs#L180) | 通知・伝播／検証経路 | <code>&amp;std::fs::read(path).map_err(&#124;_&#124; settings_error())?,</code> |
| [182](../src-tauri/src/printer.rs#L182) | 通知・伝播／検証経路 | <code>.map_err(&#124;_&#124; settings_error())?</code> |
| [188](../src-tauri/src/printer.rs#L188) | 通知・伝播／検証経路 | <code>serde_json::from_slice(&amp;std::fs::read(legacy).map_err(&#124;_&#124; settings_error())?)</code> |
| [189](../src-tauri/src/printer.rs#L189) | 通知・伝播／検証経路 | <code>.map_err(&#124;_&#124; settings_error())?;</code> |
| [215](../src-tauri/src/printer.rs#L215) | 通知・伝播／検証経路 | <code>.map_err(&#124;_&#124; settings_error())?</code> |
| [221](../src-tauri/src/printer.rs#L221) | 通知・伝播／検証経路 | <code>let _lock = SETTINGS_LOCK.lock().map_err(&#124;_&#124; settings_error())?;</code> |
| [239](../src-tauri/src/printer.rs#L239) | 通知・伝播／検証経路 | <code>.ok_or_else(&#124;&#124; {</code> |
| [240](../src-tauri/src/printer.rs#L240) | 定義・生成／返却 | <code>error( "credentials_missing", "Enter your PrusaLink authentication details in Settings → Printer Connection.", )</code> |
| [251](../src-tauri/src/printer.rs#L251) | 通知・伝播／検証経路 | <code>.map_err(&#124;_&#124; settings_error())?</code> |
| [260](../src-tauri/src/printer.rs#L260) | 通知・伝播／検証経路 | <code>let _lock = SETTINGS_LOCK.lock().map_err(&#124;_&#124; settings_error())?;</code> |
| [271](../src-tauri/src/printer.rs#L271) | 通知・伝播／検証経路 | <code>.map_err(&#124;_&#124; settings_error())?</code> |
| [281](../src-tauri/src/printer.rs#L281) | 定義・生成／返却 | <code>error("upload_uncertain","The transfer was interrupted. Check the printer before sending again; it may have received the file.")</code> |
| [283](../src-tauri/src/printer.rs#L283) | 定義・生成／返却 | <code>error( "timeout", "The printer did not respond. Check its IP address and network connection.", )</code> |
| [288](../src-tauri/src/printer.rs#L288) | 定義・生成／返却 | <code>error( "unreachable", "Unable to reach the printer. Check its IP address and network connection.", )</code> |
| [296](../src-tauri/src/printer.rs#L296) | 定義・生成／返却 | <code>error("auth","PrusaLink rejected the authentication details.")</code> |
| [297](../src-tauri/src/printer.rs#L297) | 定義・生成／返却 | <code>error("not_found","The requested printer storage or API endpoint was not found.")</code> |
| [298](../src-tauri/src/printer.rs#L298) | 定義・生成／返却 | <code>error("conflict","The filename already exists, the printer is busy, or another transfer is active. Choose a different name or check the printer.")</code> |
| [299](../src-tauri/src/printer.rs#L299) | 定義・生成／返却 | <code>error("filename","The printer rejected the filename or file format. Try a short .gcode filename.")</code> |
| [300](../src-tauri/src/printer.rs#L300) | 定義・生成／返却 | <code>error("storage_full","The printer storage is full.")</code> |
| [301](../src-tauri/src/printer.rs#L301) | 定義・生成／返却 | <code>error("printer_error",format!("PrusaLink returned HTTP {}.",status.as_u16()))</code> |
| [312](../src-tauri/src/printer.rs#L312) | 定義・生成／返却 | <code>error("client", "Unable to initialize printer networking.")</code> |
| [335](../src-tauri/src/printer.rs#L335) | 通知・伝播／検証経路 | <code>.map_err(&#124;_&#124; {</code> |
| [336](../src-tauri/src/printer.rs#L336) | 定義・生成／返却 | <code>error( "auth", "Unsupported PrusaLink Digest authentication challenge.", )</code> |
| [359](../src-tauri/src/printer.rs#L359) | 通知・伝播／検証経路 | <code>let response = request.send().await.map_err(&#124;e&#124; transport(e, false))?;</code> |
| [370](../src-tauri/src/printer.rs#L370) | 通知・伝播／検証経路 | <code>.ok_or_else(&#124;&#124; http_error(StatusCode::UNAUTHORIZED))?;</code> |
| [371](../src-tauri/src/printer.rs#L371) | 通知・伝播／検証経路 | <code>self.prompt = Some(digest_auth::parse(challenge).map_err(&#124;_&#124; {</code> |
| [372](../src-tauri/src/printer.rs#L372) | 定義・生成／返却 | <code>error("auth", "Unsupported PrusaLink authentication challenge.")</code> |
| [377](../src-tauri/src/printer.rs#L377) | 返却・伝播 | <code>Err(http_error(response.status()))</code> |
| [382](../src-tauri/src/printer.rs#L382) | 定義・生成／返却 | <code>error("printer_error", "PrusaLink returned an invalid response.")</code> |
| [384](../src-tauri/src/printer.rs#L384) | 返却・伝播 | <code>Err(http_error(StatusCode::UNAUTHORIZED))</code> |
| [389](../src-tauri/src/printer.rs#L389) | 通知・伝播／検証経路 | <code>let list = storages["storage_list"].as_array().ok_or_else(&#124;&#124; {</code> |
| [390](../src-tauri/src/printer.rs#L390) | 定義・生成／返却 | <code>error( "printer_error", "PrusaLink returned an invalid storage list.", )</code> |
| [395](../src-tauri/src/printer.rs#L395) | 定義・生成／返却 | <code>error("storage_unavailable","The configured storage is not present. Insert the USB drive or change Storage in Settings.")</code> |
| [397](../src-tauri/src/printer.rs#L397) | 定義・生成／返却 | <code>Err(error( "storage_unavailable", "The printer storage is unavailable. Check the USB drive.", ))</code> |
| [397](../src-tauri/src/printer.rs#L397) | 定義・生成／返却 | <code>error( "storage_unavailable", "The printer storage is unavailable. Check the USB drive.", )</code> |
| [403](../src-tauri/src/printer.rs#L403) | 定義・生成／返却 | <code>Err(error("read_only", "The printer storage is read-only."))</code> |
| [403](../src-tauri/src/printer.rs#L403) | 定義・生成／返却 | <code>error("read_only", "The printer storage is read-only.")</code> |
| [425](../src-tauri/src/printer.rs#L425) | 定義・生成／返却 | <code>Err(error( "filename", "Enter a .gcode filename without folders or reserved characters.", ))</code> |
| [425](../src-tauri/src/printer.rs#L425) | 定義・生成／返却 | <code>error( "filename", "Enter a .gcode filename without folders or reserved characters.", )</code> |
| [431](../src-tauri/src/printer.rs#L431) | 定義・生成／返却 | <code>Err(error( "content", "G-code must be nonempty and no larger than 100 MB.", ))</code> |
| [431](../src-tauri/src/printer.rs#L431) | 定義・生成／返却 | <code>error( "content", "G-code must be nonempty and no larger than 100 MB.", )</code> |
| [443](../src-tauri/src/printer.rs#L443) | 定義・生成／返却 | <code>Err(error( "busy", "The printer is not ready to start a new print.", ))</code> |
| [443](../src-tauri/src/printer.rs#L443) | 定義・生成／返却 | <code>error( "busy", "The printer is not ready to start a new print.", )</code> |
| [448](../src-tauri/src/printer.rs#L448) | 通知・伝播／検証経路 | <code>let mut url = reqwest::Url::parse(&amp;self.settings.base_url).map_err(&#124;_&#124; settings_error())?;</code> |
| [450](../src-tauri/src/printer.rs#L450) | 通知・伝播／検証経路 | <code>.map_err(&#124;_&#124; settings_error())?</code> |
| [486](../src-tauri/src/printer.rs#L486) | 通知・伝播／検証経路 | <code>.map_err(&#124;e&#124; transport(e, true))?;</code> |
| [488](../src-tauri/src/printer.rs#L488) | 返却・伝播 | <code>Err(http_error(response.status()))</code> |
| [507](../src-tauri/src/printer.rs#L507) | 通知・伝播／検証経路 | <code>.map_err(&#124;_&#124; settings_error())??;</code> |
| [536](../src-tauri/src/printer.rs#L536) | 定義・生成／返却 | <code>Err(error("busy", "Another printer transfer is in progress."))</code> |
| [536](../src-tauri/src/printer.rs#L536) | 定義・生成／返却 | <code>error("busy", "Another printer transfer is in progress.")</code> |
| [540](../src-tauri/src/printer.rs#L540) | 定義・生成／返却 | <code>Err(error("upload_id", "Invalid transfer ID."))</code> |
| [540](../src-tauri/src/printer.rs#L540) | 定義・生成／返却 | <code>error("upload_id", "Invalid transfer ID.")</code> |

### src-tauri/src/lib.rs

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [37](../src-tauri/src/lib.rs#L37) | 通知・伝播／検証経路 | <code>last_error: Option&lt;String&gt;,</code> |
| [50](../src-tauri/src/lib.rs#L50) | 通知・伝播／検証経路 | <code>last_error: Option&lt;String&gt;,</code> |
| [72](../src-tauri/src/lib.rs#L72) | 通知・伝播／検証経路 | <code>.map_err(&#124;error&#124; error.to_string())).collect::&lt;Result&lt;Vec&lt;_&gt;, String&gt;&gt;()).transpose();</code> |
| [75](../src-tauri/src/lib.rs#L75) | 通知・伝播／検証経路 | <code>receiver.await.map_err(&#124;error&#124; error.to_string())?</code> |
| [84](../src-tauri/src/lib.rs#L84) | 定義・生成／返却 | <code>Err("Enter an absolute file path".into())</code> |
| [88](../src-tauri/src/lib.rs#L88) | 定義・生成／返却 | <code>Err("Choose a .toolpath or .json file".into())</code> |
| [90](../src-tauri/src/lib.rs#L90) | 通知・伝播／検証経路 | <code>std::fs::read_to_string(path).map_err(&#124;error&#124; format!("Unable to read file: {error}"))</code> |
| [91](../src-tauri/src/lib.rs#L91) | 通知・伝播／検証経路 | <code>}).await.map_err(&#124;error&#124; error.to_string())?</code> |
| [97](../src-tauri/src/lib.rs#L97) | 通知・伝播／検証経路 | <code>let cache = app.path().app_cache_dir().map_err(&#124;error&#124; error.to_string())?.join("native");</code> |
| [98](../src-tauri/src/lib.rs#L98) | 通知・伝播／検証経路 | <code>std::fs::create_dir_all(&amp;cache).map_err(&#124;error&#124; error.to_string())?;</code> |
| [100](../src-tauri/src/lib.rs#L100) | 通知・伝播／検証経路 | <code>let staged_script = cache.join(format!("occt-{}-{}.tmp", std::process::id(), SystemTime::now().duration_since(UNIX_EPOCH).map_err(&#124;error&#124; error.to_string())?.as_nanos()));</code> |
| [101](../src-tauri/src/lib.rs#L101) | 通知・伝播／検証経路 | <code>std::fs::write(&amp;staged_script, include_bytes!("../../native/occt_brep_bridge.py")).map_err(&#124;error&#124; error.to_string())?;</code> |
| [102](../src-tauri/src/lib.rs#L102) | 通知・伝播／検証経路 | <code>std::fs::rename(&amp;staged_script, &amp;script).map_err(&#124;error&#124; error.to_string())?;</code> |
| [106](../src-tauri/src/lib.rs#L106) | 通知・伝播／検証経路 | <code>.map_err(&#124;error&#124; format!("Unable to start the CAD runtime. Run the native setup script or set PATHLOOM_BREP_PYTHON: {error}"))?;</code> |
| [107](../src-tauri/src/lib.rs#L107) | 通知・伝播／検証経路 | <code>let payload = serde_json::to_vec(request).map_err(&#124;error&#124; error.to_string())?;</code> |
| [108](../src-tauri/src/lib.rs#L108) | 通知・伝播／検証経路 | <code>child.stdin.take().ok_or("CAD runtime stdin is unavailable")?.write_all(&amp;payload).map_err(&#124;error&#124; error.to_string())?;</code> |
| [109](../src-tauri/src/lib.rs#L109) | 通知・伝播／検証経路 | <code>let output = child.wait_with_output().map_err(&#124;error&#124; error.to_string())?;</code> |
| [110](../src-tauri/src/lib.rs#L110) | 定義・生成／返却 | <code>Err("CAD response exceeds supported limits".into())</code> |
| [111](../src-tauri/src/lib.rs#L111) | 通知・伝播／検証経路 | <code>let result: Value = serde_json::from_slice(&amp;output.stdout).map_err(&#124;error&#124; format!("Invalid CAD runtime response: {error}"))?;</code> |
| [113](../src-tauri/src/lib.rs#L113) | 定義・生成／返却 | <code>Err(result.get("error").and_then(Value::as_str).unwrap_or("CAD operation failed").to_string())</code> |
| [115](../src-tauri/src/lib.rs#L115) | 通知・伝播／検証経路 | <code>result.get("shape").cloned().ok_or_else(&#124;&#124; "CAD shape was not returned".into())</code> |
| [122](../src-tauri/src/lib.rs#L122) | 通知・伝播／検証経路 | <code>.pick_file(move &#124;file&#124; { let _ = sender.send(file.map(&#124;file&#124; file.into_path().map_err(&#124;error&#124; error.to_string()))); });</code> |
| [123](../src-tauri/src/lib.rs#L123) | 通知・伝播／検証経路 | <code>let Some(path) = receiver.await.map_err(&#124;error&#124; error.to_string())? else { return Ok(None); };</code> |
| [125](../src-tauri/src/lib.rs#L125) | 定義・生成／返却 | <code>Err("Choose an absolute STEP path".into())</code> |
| [126](../src-tauri/src/lib.rs#L126) | 通知・伝播／検証経路 | <code>tauri::async_runtime::spawn_blocking(move &#124;&#124; run_editable_cad(&amp;app, &amp;serde_json::json!({"action":"import","path":path})).map(Some)).await.map_err(&#124;error&#124; error.to_string())?</code> |
| [131](../src-tauri/src/lib.rs#L131) | 通知・伝播／検証経路 | <code>tauri::async_runtime::spawn_blocking(move&#124;&#124;run_editable_cad(&amp;app,&amp;serde_json::json!({"action":"slice","brep":brep,"layerHeight":layer_height,"tolerance":tolerance}))).await.map_err(&#124;error&#124;error.to_string())?</code> |
| [136](../src-tauri/src/lib.rs#L136) | 定義・生成／返却 | <code>Err("Invalid CAD face movement".into())</code> |
| [137](../src-tauri/src/lib.rs#L137) | 通知・伝播／検証経路 | <code>tauri::async_runtime::spawn_blocking(move &#124;&#124; run_editable_cad(&amp;app, &amp;serde_json::json!({"action":if whole.unwrap_or(false) {"translate"} else {"move"},"brep":brep,"faceIndices":face_indices,"offset":offset,"name":name}))).await.map_err(&#124;error&#124; error.to_string())?</code> |
| [144](../src-tauri/src/lib.rs#L144) | 通知・伝播／検証経路 | <code>.pick_file(move &#124;file&#124; { let _ = sender.send(file.map(&#124;file&#124; file.into_path().map_err(&#124;error&#124; error.to_string()))); });</code> |
| [145](../src-tauri/src/lib.rs#L145) | 通知・伝播／検証経路 | <code>let Some(path) = receiver.await.map_err(&#124;error&#124; error.to_string())? else { return Ok(None); };</code> |
| [148](../src-tauri/src/lib.rs#L148) | 定義・生成／返却 | <code>Err("Choose a .step or .stp file".into())</code> |
| [152](../src-tauri/src/lib.rs#L152) | 通知・伝播／検証経路 | <code>let file = std::fs::File::open(&amp;path).map_err(&#124;error&#124; error.to_string())?;</code> |
| [154](../src-tauri/src/lib.rs#L154) | 通知・伝播／検証経路 | <code>file.take(100 * 1024 * 1024 + 1).read_to_end(&amp;mut bytes).map_err(&#124;error&#124; error.to_string())?;</code> |
| [155](../src-tauri/src/lib.rs#L155) | 定義・生成／返却 | <code>Err("STEP file exceeds the 100 MB import limit".to_string())</code> |
| [157](../src-tauri/src/lib.rs#L157) | 通知・伝播／検証経路 | <code>}).await.map_err(&#124;error&#124; error.to_string())?</code> |
| [167](../src-tauri/src/lib.rs#L167) | 通知・伝播／検証経路 | <code>let _ = sender.send(file.map(&#124;file&#124; file.into_path().map_err(&#124;error&#124; error.to_string())));</code> |
| [169](../src-tauri/src/lib.rs#L169) | 通知・伝播／検証経路 | <code>let Some(path) = receiver.await.map_err(&#124;error&#124; error.to_string())? else { return Ok(None); };</code> |
| [171](../src-tauri/src/lib.rs#L171) | 定義・生成／返却 | <code>Err("Choose an absolute STEP file path".into())</code> |
| [173](../src-tauri/src/lib.rs#L173) | 定義・生成／返却 | <code>Err("Choose a .step or .stp file".into())</code> |
| [175](../src-tauri/src/lib.rs#L175) | 通知・伝播／検証経路 | <code>let metadata = std::fs::metadata(&amp;path).map_err(&#124;error&#124; format!("Unable to read STEP file: {error}"))?;</code> |
| [176](../src-tauri/src/lib.rs#L176) | 定義・生成／返却 | <code>Err("STEP file exceeds the 100 MB import limit".into())</code> |
| [178](../src-tauri/src/lib.rs#L178) | 通知・伝播／検証経路 | <code>let cache = app.path().app_cache_dir().map_err(&#124;error&#124; error.to_string())?.join("native");</code> |
| [179](../src-tauri/src/lib.rs#L179) | 通知・伝播／検証経路 | <code>let assets = app.path().app_data_dir().map_err(&#124;error&#124; error.to_string())?.join("brep-assets");</code> |
| [180](../src-tauri/src/lib.rs#L180) | 通知・伝播／検証経路 | <code>std::fs::create_dir_all(&amp;cache).map_err(&#124;error&#124; error.to_string())?;</code> |
| [181](../src-tauri/src/lib.rs#L181) | 通知・伝播／検証経路 | <code>std::fs::create_dir_all(&amp;assets).map_err(&#124;error&#124; error.to_string())?;</code> |
| [184](../src-tauri/src/lib.rs#L184) | 通知・伝播／検証経路 | <code>.map_err(&#124;error&#124; format!("Unable to prepare the native B-rep bridge: {error}"))?;</code> |
| [185](../src-tauri/src/lib.rs#L185) | 通知・伝播／検証経路 | <code>let asset_id = format!("{}-{}", std::process::id(), SystemTime::now().duration_since(UNIX_EPOCH).map_err(&#124;error&#124; error.to_string())?.as_nanos());</code> |
| [195](../src-tauri/src/lib.rs#L195) | 通知・伝播／検証経路 | <code>.map_err(&#124;error&#124; format!("Unable to start the B-rep Python runtime. Set PATHLOOM_BREP_PYTHON to CPython 3.12: {error}"))?;</code> |
| [198](../src-tauri/src/lib.rs#L198) | 定義・生成／返却 | <code>Err("Native B-rep response exceeds 256 MB".into())</code> |
| [201](../src-tauri/src/lib.rs#L201) | 通知・伝播／検証経路 | <code>.map_err(&#124;error&#124; format!("Native B-rep bridge returned invalid JSON: {error}"))?;</code> |
| [204](../src-tauri/src/lib.rs#L204) | 定義・生成／返却 | <code>Err(value.get("error").and_then(Value::as_str).map(str::to_owned) .unwrap_or_else(&#124;&#124; String::from_utf8_lossy(&amp;output.stderr).trim().to_owned()))</code> |
| [210](../src-tauri/src/lib.rs#L210) | 通知・伝播／検証経路 | <code>}).await.map_err(&#124;error&#124; error.to_string())?</code> |
| [223](../src-tauri/src/lib.rs#L223) | 定義・生成／返却 | <code>Err("Invalid CAD asset reference".into())</code> |
| [226](../src-tauri/src/lib.rs#L226) | 定義・生成／返却 | <code>Err("Select one or more CAD faces".into())</code> |
| [229](../src-tauri/src/lib.rs#L229) | 定義・生成／返却 | <code>Err("Enter a finite, non-zero X or Y movement within ±1000 mm".into())</code> |
| [234](../src-tauri/src/lib.rs#L234) | 定義・生成／返却 | <code>Err("CAD face selection contains duplicates".into())</code> |
| [236](../src-tauri/src/lib.rs#L236) | 通知・伝播／検証経路 | <code>let cache = app.path().app_cache_dir().map_err(&#124;error&#124; error.to_string())?.join("native");</code> |
| [237](../src-tauri/src/lib.rs#L237) | 通知・伝播／検証経路 | <code>let assets = app.path().app_data_dir().map_err(&#124;error&#124; error.to_string())?.join("brep-assets");</code> |
| [238](../src-tauri/src/lib.rs#L238) | 通知・伝播／検証経路 | <code>std::fs::create_dir_all(&amp;cache).map_err(&#124;error&#124; error.to_string())?;</code> |
| [241](../src-tauri/src/lib.rs#L241) | 通知・伝播／検証経路 | <code>.map_err(&#124;error&#124; format!("Unable to prepare the native B-rep bridge: {error}"))?;</code> |
| [243](../src-tauri/src/lib.rs#L243) | 定義・生成／返却 | <code>Err("The editable CAD asset is missing; reimport the STEP file".into())</code> |
| [251](../src-tauri/src/lib.rs#L251) | 通知・伝播／検証経路 | <code>.output().map_err(&#124;error&#124; format!("Unable to start the B-rep Python runtime: {error}"))?;</code> |
| [252](../src-tauri/src/lib.rs#L252) | 定義・生成／返却 | <code>Err("Native B-rep response exceeds 256 MB".into())</code> |
| [254](../src-tauri/src/lib.rs#L254) | 通知・伝播／検証経路 | <code>.map_err(&#124;error&#124; format!("Native B-rep bridge returned invalid JSON: {error}"))?;</code> |
| [256](../src-tauri/src/lib.rs#L256) | 定義・生成／返却 | <code>Err(value.get("error").and_then(Value::as_str).map(str::to_owned) .unwrap_or_else(&#124;&#124; String::from_utf8_lossy(&amp;output.stderr).trim().to_owned()))</code> |
| [260](../src-tauri/src/lib.rs#L260) | 通知・伝播／検証経路 | <code>}).await.map_err(&#124;error&#124; error.to_string())?</code> |
| [265](../src-tauri/src/lib.rs#L265) | 定義・生成／返却 | <code>Err("Invalid live STEP content".into())</code> |
| [266](../src-tauri/src/lib.rs#L266) | 通知・伝播／検証経路 | <code>tauri::async_runtime::spawn_blocking(move&#124;&#124;run_editable_cad(&amp;app,&amp;serde_json::json!({"action":"import","step":step,"name":name,"center":false}))).await.map_err(&#124;error&#124;error.to_string())?</code> |
| [269](../src-tauri/src/lib.rs#L269) | 通知・伝播／検証経路 | <code>fn grasshopper_brep_snapshots(state:State&lt;'_,SharedGrasshopperState&gt;)-&gt;Result&lt;Vec&lt;Value&gt;,String&gt;{Ok(state.lock().map_err(&#124;error&#124;error.to_string())?.brep_updates.values().cloned().collect())}</code> |
| [292](../src-tauri/src/lib.rs#L292) | 通知・伝播／検証経路 | <code>last_error: state.last_error.clone(),</code> |
| [304](../src-tauri/src/lib.rs#L304) | 通知・伝播／検証経路 | <code>let value: Value = serde_json::from_str(text).map_err(&#124;error&#124; format!("Invalid JSON: {error}"))?;</code> |
| [306](../src-tauri/src/lib.rs#L306) | 通知・伝播／検証経路 | <code>.map_err(&#124;error&#124; format!("Invalid toolpath message: {error}"))?;</code> |
| [309](../src-tauri/src/lib.rs#L309) | 定義・生成／返却 | <code>Err(format!("Unsupported message type: {}", envelope.message_type))</code> |
| [312](../src-tauri/src/lib.rs#L312) | 定義・生成／返却 | <code>Err("source must not be empty".into())</code> |
| [315](../src-tauri/src/lib.rs#L315) | 定義・生成／返却 | <code>Err("paths must contain at least one path".into())</code> |
| [322](../src-tauri/src/lib.rs#L322) | 通知・伝播／検証経路 | <code>.ok_or_else(&#124;&#124; format!("paths[{index}].points is required"))?;</code> |
| [324](../src-tauri/src/lib.rs#L324) | 定義・生成／返却 | <code>Err(format!("paths[{index}].points needs at least 2 points"))</code> |
| [329](../src-tauri/src/lib.rs#L329) | 通知・伝播／検証経路 | <code>.ok_or_else(&#124;&#124; format!("paths[{index}].points[{point_index}] must be an XYZ array"))?;</code> |
| [331](../src-tauri/src/lib.rs#L331) | 定義・生成／返却 | <code>Err(format!( "paths[{index}].points[{point_index}] must contain numeric X, Y and Z" ))</code> |
| [345](../src-tauri/src/lib.rs#L345) | 返却・伝播 | <code>Err(error)</code> |
| [362](../src-tauri/src/lib.rs#L362) | 返却・伝播 | <code>Err(error)</code> |
| [373](../src-tauri/src/lib.rs#L373) | 返却・伝播 | <code>Err(error)</code> |
| [401](../src-tauri/src/lib.rs#L401) | 返却・伝播 | <code>Err(error)</code> |
| [414](../src-tauri/src/lib.rs#L414) | 返却・伝播 | <code>Err(error)</code> |
| [424](../src-tauri/src/lib.rs#L424) | 返却・伝播 | <code>Err(error)</code> |
| [425](../src-tauri/src/lib.rs#L425) | 通知・伝播／検証経路 | <code>let message = format!("Grasshopper WebSocket error: {error}");</code> |

### src-tauri/src/grasshopper_brep.rs

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [4](../src-tauri/src/grasshopper_brep.rs#L4) | 通知・伝播／検証経路 | <code>let mut value:Value=serde_json::from_str(text).map_err(&#124;error&#124;format!("Invalid JSON: {error}"))?;</code> |
| [7](../src-tauri/src/grasshopper_brep.rs#L7) | 通知・伝播／検証経路 | <code>let source=value.get("source").and_then(Value::as_str).ok_or("B-rep source is required")?;</code> |
| [8](../src-tauri/src/grasshopper_brep.rs#L8) | 定義・生成／返却 | <code>Err("B-rep source must be 1–120 characters".into())</code> |
| [9](../src-tauri/src/grasshopper_brep.rs#L9) | 定義・生成／返却 | <code>Err("Invalid B-rep label".into())</code> |
| [10](../src-tauri/src/grasshopper_brep.rs#L10) | 通知・伝播／検証経路 | <code>if kind=="brep.update"{let step=value.get("step").and_then(Value::as_str).ok_or("STEP content is required")?;</code> |
| [11](../src-tauri/src/grasshopper_brep.rs#L11) | 定義・生成／返却 | <code>Err("Send a valid STEP document smaller than 16 MB".into())</code> |
| [13](../src-tauri/src/grasshopper_brep.rs#L13) | 通知・伝播／検証経路 | <code>let object=value.as_object_mut().ok_or("Invalid B-rep update")?;object.remove("bridgeRevision");</code> |

### src-tauri/src/codex_bridge.rs

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [62](../src-tauri/src/codex_bridge.rs#L62) | 通知・伝播／検証経路 | <code>candidates.into_iter().find(&#124;p&#124; p.is_file()).ok_or_else(&#124;&#124; {</code> |
| [104](../src-tauri/src/codex_bridge.rs#L104) | 通知・伝播／検証経路 | <code>.map_err(&#124;e&#124; format!("Unable to start Codex: {e}"))?;</code> |
| [105](../src-tauri/src/codex_bridge.rs#L105) | 通知・伝播／検証経路 | <code>let input = child.stdin.take().ok_or("Codex stdin unavailable")?;</code> |
| [106](../src-tauri/src/codex_bridge.rs#L106) | 通知・伝播／検証経路 | <code>let output = child.stdout.take().ok_or("Codex stdout unavailable")?;</code> |
| [139](../src-tauri/src/codex_bridge.rs#L139) | 通知・伝播／検証経路 | <code>.map_err(&#124;_&#124; "Codex connection closed".into())</code> |
| [147](../src-tauri/src/codex_bridge.rs#L147) | 定義・生成／返却 | <code>Err("Request cancelled".into())</code> |
| [150](../src-tauri/src/codex_bridge.rs#L150) | 定義・生成／返却 | <code>Err("Codex request timed out".into())</code> |
| [156](../src-tauri/src/codex_bridge.rs#L156) | 通知・伝播／検証経路 | <code>self.send(json!({"id":value["id"],"error":{"code":-32601,"message":"Pathloom does not allow tool execution"}}))?;</code> |
| [161](../src-tauri/src/codex_bridge.rs#L161) | 返却・伝播 | <code>Err(mpsc::RecvTimeoutError::Timeout)</code> |
| [162](../src-tauri/src/codex_bridge.rs#L162) | 定義・生成／返却 | <code>Err("Codex app-server stopped. Reconnect and try again.".into())</code> |
| [162](../src-tauri/src/codex_bridge.rs#L162) | 返却・伝播 | <code>Err(_)</code> |
| [181](../src-tauri/src/codex_bridge.rs#L181) | 定義・生成／返却 | <code>Err(error["message"] .as_str() .unwrap_or("Codex request failed") .to_owned())</code> |
| [199](../src-tauri/src/codex_bridge.rs#L199) | 定義・生成／返却 | <code>Err( "Sign in with ChatGPT to use your Codex plan. API-key billing is disabled.".into(), )</code> |
| [208](../src-tauri/src/codex_bridge.rs#L208) | 定義・生成／返却 | <code>Err("Unable to verify plan usage. Refresh the connection before sending.".into())</code> |
| [212](../src-tauri/src/codex_bridge.rs#L212) | 定義・生成／返却 | <code>Err("Codex plan limit reached. Wait for the reset; Pathloom will not switch to API billing.".into())</code> |
| [216](../src-tauri/src/codex_bridge.rs#L216) | 定義・生成／返却 | <code>Err("Codex plan limit reached. Check usage details.".into())</code> |
| [228](../src-tauri/src/codex_bridge.rs#L228) | 通知・伝播／検証経路 | <code>.map_err(&#124;_&#124; "Codex connection lock failed")?;</code> |
| [236](../src-tauri/src/codex_bridge.rs#L236) | 返却・伝播 | <code>Err(message)</code> |
| [271](../src-tauri/src/codex_bridge.rs#L271) | 通知・伝播／検証経路 | <code>.map_err(&#124;e&#124; e.to_string())?</code> |
| [280](../src-tauri/src/codex_bridge.rs#L280) | 通知・伝播／検証経路 | <code>.map_err(&#124;_&#124; "Codex connection lock failed")?;</code> |
| [292](../src-tauri/src/codex_bridge.rs#L292) | 通知・伝播／検証経路 | <code>.ok_or("Sign-in URL was not provided")?;</code> |
| [297](../src-tauri/src/codex_bridge.rs#L297) | 定義・生成／返却 | <code>Err("Unexpected sign-in URL".into())</code> |
| [302](../src-tauri/src/codex_bridge.rs#L302) | 通知・伝播／検証経路 | <code>.map_err(&#124;e&#124; e.to_string())?;</code> |
| [306](../src-tauri/src/codex_bridge.rs#L306) | 通知・伝播／検証経路 | <code>.map_err(&#124;e&#124; e.to_string())?</code> |
| [320](../src-tauri/src/codex_bridge.rs#L320) | 定義・生成／返却 | <code>Err("Select a valid AI model".into())</code> |
| [322](../src-tauri/src/codex_bridge.rs#L322) | 定義・生成／返却 | <code>Err("AI context exceeds 150 KB after compaction. Edit one Component at a time or shorten the request.".into())</code> |
| [327](../src-tauri/src/codex_bridge.rs#L327) | 通知・伝播／検証経路 | <code>.map_err(&#124;e&#124; e.to_string())?</code> |
| [329](../src-tauri/src/codex_bridge.rs#L329) | 通知・伝播／検証経路 | <code>std::fs::create_dir_all(&amp;directory).map_err(&#124;e&#124; e.to_string())?;</code> |
| [333](../src-tauri/src/codex_bridge.rs#L333) | 通知・伝播／検証経路 | <code>let mut guard=state.session.lock().map_err(&#124;_&#124;"Codex connection lock failed")?;</code> |
| [340](../src-tauri/src/codex_bridge.rs#L340) | 通知・伝播／検証経路 | <code>let thread_id=thread["thread"]["id"].as_str().ok_or("Missing Codex thread ID")?.to_owned();</code> |
| [348](../src-tauri/src/codex_bridge.rs#L348) | 定義・生成／返却 | <code>Err("AI response is too large".into())</code> |
| [349](../src-tauri/src/codex_bridge.rs#L349) | 定義・生成／返却 | <code>Err(event["params"]["turn"]["error"]["message"].as_str().unwrap_or("Codex generation did not complete").to_owned())</code> |
| [353](../src-tauri/src/codex_bridge.rs#L353) | 通知・伝播／検証経路 | <code>let value:Value=serde_json::from_str(&amp;answer).map_err(&#124;_&#124;"AI returned invalid design JSON")?;</code> |
| [354](../src-tauri/src/codex_bridge.rs#L354) | 通知・伝播／検証経路 | <code>let definition:Value=serde_json::from_str(value["definitionJson"].as_str().ok_or("Missing generator definition")?).map_err(&#124;_&#124;"Invalid generator definition JSON")?;</code> |
| [359](../src-tauri/src/codex_bridge.rs#L359) | 通知・伝播／検証経路 | <code>}).await.map_err(&#124;e&#124;e.to_string())?</code> |

### step-slice-worker.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [2](../step-slice-worker.js#L2) | 通知・伝播／検証経路 | <code>self.onmessage=event=&gt;{try{const paths=sliceMeshesToPaths(event.data.meshes,event.data.layerHeight);self.postMessage({ok:true,paths})}catch(error){self.postMessage({ok:false,error:error.message&#124;&#124;String(error)})}};</code> |

### cad-pipeline.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [41](../cad-pipeline.js#L41) | 定義・生成／返却 | <code>new Error('Invalid custom recipe limits')</code> |
| [45](../cad-pipeline.js#L45) | 定義・生成／返却 | <code>new Error('Invalid custom recipe definition')</code> |
| [47](../cad-pipeline.js#L47) | 定義・生成／返却 | <code>new Error('Invalid recipe parameter schema')</code> |
| [50](../cad-pipeline.js#L50) | 定義・生成／返却 | <code>new Error(&#96;${componentLabel}: code must be a nonempty JavaScript function body&#96;)</code> |
| [51](../cad-pipeline.js#L51) | 定義・生成／返却 | <code>new Error(&#96;${componentLabel}: code exceeds the 64,000 character limit&#96;)</code> |
| [52](../cad-pipeline.js#L52) | 定義・生成／返却 | <code>new Error(&#96;${componentLabel}: unsupported output type "${recipe.returns}"; use curve, points, number, list, boolean or tool-info&#96;)</code> |
| [53](../cad-pipeline.js#L53) | 定義・生成／返却 | <code>new Error(&#96;${componentLabel}: code and internal steps cannot be combined; remove steps from the code Component&#96;)</code> |
| [54](../cad-pipeline.js#L54) | 定義・生成／返却 | <code>new Error('Invalid code Component default')</code> |
| [57](../cad-pipeline.js#L57) | 定義・生成／返却 | <code>new Error('Recipes can only contain supported native operations')</code> |
| [58](../cad-pipeline.js#L58) | 定義・生成／返却 | <code>new Error('Invalid recipe branches')</code> |
| [59](../cad-pipeline.js#L59) | 定義・生成／返却 | <code>new Error('Invalid recipe geometry connection')</code> |
| [60](../cad-pipeline.js#L60) | 定義・生成／返却 | <code>new Error('Use incoming geometry for this recipe; standalone curve components are available in Curve')</code> |
| [61](../cad-pipeline.js#L61) | 定義・生成／返却 | <code>new Error('Invalid recipe literal')</code> |
| [61](../cad-pipeline.js#L61) | 定義・生成／返却 | <code>new Error('Invalid recipe parameter reference')</code> |
| [64](../cad-pipeline.js#L64) | 定義・生成／返却 | <code>new Error('Recipe needs a geometry output and used parameters')</code> |
| [65](../cad-pipeline.js#L65) | 定義・生成／返却 | <code>new Error('Invalid recipe default')</code> |
| [72](../cad-pipeline.js#L72) | 定義・生成／返却 | <code>new Error('Unknown custom recipe or version')</code> |
| [75](../cad-pipeline.js#L75) | 定義・生成／返却 | <code>new Error('Invalid recipe arguments')</code> |
| [76](../cad-pipeline.js#L76) | 定義・生成／返却 | <code>new Error('Invalid typed recipe argument')</code> |
| [76](../cad-pipeline.js#L76) | 定義・生成／返却 | <code>new Error('Missing or invalid recipe argument')</code> |
| [81](../cad-pipeline.js#L81) | 定義・生成／返却 | <code>new Error('Expanded recipe graph is too large')</code> |
| [84](../cad-pipeline.js#L84) | 定義・生成／返却 | <code>new Error(&#96;Increment the version before changing recipe ${recipe.id}&#96;)</code> |
| [87](../cad-pipeline.js#L87) | 定義・生成／返却 | <code>new Error(&#96;Invalid ${label}&#96;)</code> |
| [109](../cad-pipeline.js#L109) | 定義・生成／返却 | <code>new Error('Unknown Print output')</code> |
| [110](../cad-pipeline.js#L110) | 定義・生成／返却 | <code>new Error('Keep at least one Print output')</code> |
| [110](../cad-pipeline.js#L110) | 定義・生成／返却 | <code>new Error('Unknown Print output')</code> |
| [119](../cad-pipeline.js#L119) | 定義・生成／返却 | <code>new Error('Invalid code Component registry')</code> |
| [121](../cad-pipeline.js#L121) | 定義・生成／返却 | <code>new Error('Unsupported pipeline version')</code> |
| [122](../cad-pipeline.js#L122) | 定義・生成／返却 | <code>new Error('Invalid Print output settings')</code> |
| [123](../cad-pipeline.js#L123) | 定義・生成／返却 | <code>new Error('Invalid generator name')</code> |
| [124](../cad-pipeline.js#L124) | 定義・生成／返却 | <code>new Error('Input / operation limit exceeded')</code> |
| [127](../cad-pipeline.js#L127) | 定義・生成／返却 | <code>new Error('Invalid input identity')</code> |
| [128](../cad-pipeline.js#L128) | 定義・生成／返却 | <code>new Error('Invalid live B-rep source')</code> |
| [129](../cad-pipeline.js#L129) | 定義・生成／返却 | <code>new Error('Grasshopper source is already bound to another input')</code> |
| [130](../cad-pipeline.js#L130) | 定義・生成／返却 | <code>new Error('Invalid live B-rep revision')</code> |
| [131](../cad-pipeline.js#L131) | 定義・生成／返却 | <code>new Error('Invalid input exposure')</code> |
| [132](../cad-pipeline.js#L132) | 定義・生成／返却 | <code>new Error('Invalid print setting reference')</code> |
| [136](../cad-pipeline.js#L136) | 定義・生成／返却 | <code>new Error(&#96;Invalid curve: ${input.name}&#96;)</code> |
| [137](../cad-pipeline.js#L137) | 定義・生成／返却 | <code>new Error('Invalid STEP filename')</code> |
| [139](../cad-pipeline.js#L139) | 定義・生成／返却 | <code>new Error(&#96;Invalid point: ${input.name}&#96;)</code> |
| [141](../cad-pipeline.js#L141) | 定義・生成／返却 | <code>new Error(&#96;Invalid number: ${input.name}&#96;)</code> |
| [144](../cad-pipeline.js#L144) | 定義・生成／返却 | <code>new Error(&#96;Invalid number list: ${input.name}&#96;)</code> |
| [145](../cad-pipeline.js#L145) | 定義・生成／返却 | <code>new Error(&#96;Unsupported input type: ${input.type}&#96;)</code> |
| [150](../cad-pipeline.js#L150) | 定義・生成／返却 | <code>new Error('Invalid operation or version')</code> |
| [151](../cad-pipeline.js#L151) | 定義・生成／返却 | <code>new Error('Invalid Component input state')</code> |
| [152](../cad-pipeline.js#L152) | 定義・生成／返却 | <code>new Error('Invalid Component group')</code> |
| [153](../cad-pipeline.js#L153) | 定義・生成／返却 | <code>new Error('Invalid Component name')</code> |
| [154](../cad-pipeline.js#L154) | 定義・生成／返却 | <code>new Error(&#96;Unknown parameter in ${step.id}&#96;)</code> |
| [156](../cad-pipeline.js#L156) | 定義・生成／返却 | <code>new Error('Merge needs prior path branches')</code> |
| [157](../cad-pipeline.js#L157) | 定義・生成／返却 | <code>new Error(&#96;Invalid upstream input for ${step.id}&#96;)</code> |
| [163](../cad-pipeline.js#L163) | 定義・生成／返却 | <code>new Error(&#96;Select ${spec.curveSelection==='closed'?'closed ':''}Curve geometry for ${step.id}.${key}&#96;)</code> |
| [165](../cad-pipeline.js#L165) | 定義・生成／返却 | <code>new Error(&#96;Wrong input type for ${step.id}.${key}&#96;)</code> |
| [166](../cad-pipeline.js#L166) | 定義・生成／返却 | <code>new Error(&#96;Invalid ${step.id}.${key}&#96;)</code> |
| [167](../cad-pipeline.js#L167) | 定義・生成／返却 | <code>new Error(&#96;Invalid choice for ${step.id}.${key}&#96;)</code> |
| [169](../cad-pipeline.js#L169) | 定義・生成／返却 | <code>new Error('Sections accepts closed curves only')</code> |
| [172](../cad-pipeline.js#L172) | 定義・生成／返却 | <code>new Error('Too many Print outputs')</code> |
| [173](../cad-pipeline.js#L173) | 定義・生成／返却 | <code>new Error('Invalid Print output object')</code> |
| [173](../cad-pipeline.js#L173) | 定義・生成／返却 | <code>new Error('Print output Tool input needs Tool information')</code> |
| [174](../cad-pipeline.js#L174) | 定義・生成／返却 | <code>new Error('Print output Tool input needs Tool information')</code> |
| [174](../cad-pipeline.js#L174) | 定義・生成／返却 | <code>new Error('Print output needs planar Curve geometry or Toolpaths')</code> |
| [196](../cad-pipeline.js#L196) | 定義・生成／返却 | <code>new Error('Choose a Component')</code> |
| [200](../cad-pipeline.js#L200) | 定義・生成／返却 | <code>new Error('Merge needs two existing Toolpath outputs')</code> |
| [201](../cad-pipeline.js#L201) | 定義・生成／返却 | <code>new Error('Connect compatible geometry first')</code> |
| [202](../cad-pipeline.js#L202) | 定義・生成／返却 | <code>new Error('Sections needs a closed curve input')</code> |
| [203](../cad-pipeline.js#L203) | 定義・生成／返却 | <code>new Error(&#96;${spec.label} needs a curve input&#96;)</code> |
| [207](../cad-pipeline.js#L207) | 定義・生成／返却 | <code>new Error('Unknown Component')</code> |
| [214](../cad-pipeline.js#L214) | 定義・生成／返却 | <code>new Error('Reconnect Print output before removing this Component')</code> |
| [215](../cad-pipeline.js#L215) | 定義・生成／返却 | <code>new Error('Unknown Component')</code> |
| [216](../cad-pipeline.js#L216) | 定義・生成／返却 | <code>new Error('Reconnect the downstream Components before removing this input')</code> |
| [230](../cad-pipeline.js#L230) | 定義・生成／返却 | <code>new Error('Too many points; reduce samples, layers or copies')</code> |
| [239](../cad-pipeline.js#L239) | 定義・生成／返却 | <code>new Error('Curve seam requires closed Curve geometry')</code> |
| [240](../cad-pipeline.js#L240) | 定義・生成／返却 | <code>new Error(&#96;${operationSpec(definition,step).label} requires closed planar Curve geometry&#96;)</code> |
| [241](../cad-pipeline.js#L241) | 定義・生成／返却 | <code>new Error(&#96;${key} must be an integer&#96;)</code> |
| [242](../cad-pipeline.js#L242) | 定義・生成／返却 | <code>new Error('Code Components require the isolated code runtime')</code> |
| [243](../cad-pipeline.js#L243) | 定義・生成／返却 | <code>new Error('Choose a STEP file in STEP Input first')</code> |
| [244](../cad-pipeline.js#L244) | 定義・生成／返却 | <code>new Error('Choose layer or curve Tool assignment')</code> |
| [244](../cad-pipeline.js#L244) | 定義・生成／返却 | <code>new Error('Tool sequence needs IDs 0–4')</code> |
| [247](../cad-pipeline.js#L247) | 定義・生成／返却 | <code>new Error('Nearest ordering supports at most 2048 curves; reduce geometry or disable it')</code> |
| [252](../cad-pipeline.js#L252) | 定義・生成／返却 | <code>new Error('Samples must be an integer')</code> |
| [255](../cad-pipeline.js#L255) | 定義・生成／返却 | <code>new Error('Loft curves need matching point counts; use Resample curve')</code> |
| [255](../cad-pipeline.js#L255) | 定義・生成／返却 | <code>new Error('Stack requires Curve geometry on the XY plane at Z=0')</code> |
| [255](../cad-pipeline.js#L255) | 定義・生成／返却 | <code>new Error('Stack requires closed Curve geometry')</code> |
| [257](../cad-pipeline.js#L257) | 定義・生成／返却 | <code>new Error('Height must be at least one layer')</code> |
| [258](../cad-pipeline.js#L258) | 定義・生成／返却 | <code>new Error('Too many points; reduce samples or layers')</code> |
| [273](../cad-pipeline.js#L273) | 定義・生成／返却 | <code>new Error('Tool sequence needs IDs 0–4')</code> |
| [276](../cad-pipeline.js#L276) | 定義・生成／返却 | <code>new Error('Copy count must be an integer')</code> |
| [279](../cad-pipeline.js#L279) | 定義・生成／返却 | <code>new Error('Bottom layer count must be an integer')</code> |
| [284](../cad-pipeline.js#L284) | 定義・生成／返却 | <code>new Error('Bottom fill exceeds point limit; increase spacing or reduce samples')</code> |
| [284](../cad-pipeline.js#L284) | 定義・生成／返却 | <code>new Error('Bottom fill is too dense; increase spacing')</code> |
| [290](../cad-pipeline.js#L290) | 定義・生成／返却 | <code>new Error('Shell count must be an integer')</code> |
| [290](../cad-pipeline.js#L290) | 定義・生成／返却 | <code>new Error(&#96;Wall shell count must be an integer from 1 to 8 (received ${p.count}). For a bottom, use Bottom fill.&#96;)</code> |
| [291](../cad-pipeline.js#L291) | 定義・生成／返却 | <code>new Error('Shell offset reaches or crosses the pivot')</code> |
| [295](../cad-pipeline.js#L295) | 定義・生成／返却 | <code>new Error('Scale profile must be positive')</code> |
| [301](../cad-pipeline.js#L301) | 定義・生成／返却 | <code>new Error('Wave count must be an integer')</code> |
| [302](../cad-pipeline.js#L302) | 定義・生成／返却 | <code>new Error('Wave reaches or crosses the pivot')</code> |
| [306](../cad-pipeline.js#L306) | 定義・生成／返却 | <code>new Error('Curve output must contain finite 2D or 3D coordinates')</code> |
| [306](../cad-pipeline.js#L306) | 定義・生成／返却 | <code>new Error('Processing graph is too large; reduce points or operations')</code> |
| [307](../cad-pipeline.js#L307) | 定義・生成／返却 | <code>new Error('Point output exceeds the supported limit or contains invalid coordinates')</code> |
| [307](../cad-pipeline.js#L307) | 定義・生成／返却 | <code>new Error('Processing graph is too large; reduce points or operations')</code> |
| [317](../cad-pipeline.js#L317) | 定義・生成／返却 | <code>new Error('Print output requires Curve geometry with Z coordinates; use Stack or move it in Z')</code> |
| [320](../cad-pipeline.js#L320) | 定義・生成／返却 | <code>new Error('Output must be finite and planar with nonnegative Z')</code> |
| [321](../cad-pipeline.js#L321) | 定義・生成／返却 | <code>new Error(&#96;Intro line overlaps the object at Z ${paths[0].points[0][2]} mm. Change Direction, Gap or Length in Print output.&#96;)</code> |
| [324](../cad-pipeline.js#L324) | 定義・生成／返却 | <code>new Error('Print outputs exceed 1,000,000 points')</code> |
| [337](../cad-pipeline.js#L337) | 定義・生成／返却 | <code>new Error(&#96;Zero-length segment at Z ${z}&#96;)</code> |
| [338](../cad-pipeline.js#L338) | 定義・生成／返却 | <code>new Error('Segment bounds are too large')</code> |
| [342](../cad-pipeline.js#L342) | 定義・生成／返却 | <code>new Error(&#96;Intersecting output curves at Z ${z}&#96;)</code> |
| [346](../cad-pipeline.js#L346) | 定義・生成／返却 | <code>new Error(&#96;Collapsed output curve at Z ${z}&#96;)</code> |
| [359](../cad-pipeline.js#L359) | 定義・生成／返却 | <code>new Error('Unknown processing stage')</code> |
| [385](../cad-pipeline.js#L385) | 定義・生成／返却 | <code>new Error('This parameter cannot be linked')</code> |
| [388](../cad-pipeline.js#L388) | 定義・生成／返却 | <code>new Error('Invalid print setting link')</code> |
| [392](../cad-pipeline.js#L392) | 定義・生成／返却 | <code>new Error('Choose a compatible parameter on another component')</code> |
| [398](../cad-pipeline.js#L398) | 定義・生成／返却 | <code>new Error('Unknown component')</code> |
| [402](../cad-pipeline.js#L402) | 定義・生成／返却 | <code>new Error('Keep Print output settings when adding a Component')</code> |
| [403](../cad-pipeline.js#L403) | 定義・生成／返却 | <code>new Error('Add exactly one new Component; use a recipe for internal components')</code> |
| [404](../cad-pipeline.js#L404) | 定義・生成／返却 | <code>new Error('New Component must preserve existing components and inputs')</code> |
| [405](../cad-pipeline.js#L405) | 定義・生成／返却 | <code>new Error('Keep the Tool input or connect the new Tool Component')</code> |
| [406](../cad-pipeline.js#L406) | 定義・生成／返却 | <code>new Error('Choose the original output or the new Component output')</code> |
| [412](../cad-pipeline.js#L412) | 定義・生成／返却 | <code>new Error('Keep Print output settings when editing another Component')</code> |
| [413](../cad-pipeline.js#L413) | 定義・生成／返却 | <code>new Error('Keep the selected component ID when editing it')</code> |
| [414](../cad-pipeline.js#L414) | 定義・生成／返却 | <code>new Error('Edit only the selected component; use a custom recipe for multiple internal steps')</code> |
| [415](../cad-pipeline.js#L415) | 定義・生成／返却 | <code>new Error(&#96;AI changed another component (${step.id}); the edit was not applied&#96;)</code> |
| [417](../cad-pipeline.js#L417) | 定義・生成／返却 | <code>new Error(&#96;AI changed an unrelated input (${input.name}); the edit was not applied&#96;)</code> |
| [423](../cad-pipeline.js#L423) | 定義・生成／返却 | <code>new Error('Invalid node layout')</code> |
| [424](../cad-pipeline.js#L424) | 定義・生成／返却 | <code>new Error('Invalid node position')</code> |
| [425](../cad-pipeline.js#L425) | 定義・生成／返却 | <code>new Error('Invalid graph view')</code> |
| [432](../cad-pipeline.js#L432) | 定義・生成／返却 | <code>new Error('Select a code Component')</code> |

### cad-library.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [4](../cad-library.js#L4) | 定義・生成／返却 | <code>new Error('Invalid library')</code> |
| [7](../cad-library.js#L7) | 定義・生成／返却 | <code>new Error('Invalid library identity')</code> |
| [13](../cad-library.js#L13) | 定義・生成／返却 | <code>new Error('Invalid saved Component')</code> |
| [14](../cad-library.js#L14) | 定義・生成／返却 | <code>new Error('Invalid operation metadata')</code> |
| [15](../cad-library.js#L15) | 定義・生成／返却 | <code>new Error('Invalid Component group')</code> |
| [28](../cad-library.js#L28) | 定義・生成／返却 | <code>new Error('Enter a library name (max 120 characters)')</code> |
| [30](../cad-library.js#L30) | 定義・生成／返却 | <code>new Error('Choose a previous version of the same kind')</code> |
| [37](../cad-library.js#L37) | 定義・生成／返却 | <code>new Error('Select a Component')</code> |
| [38](../cad-library.js#L38) | 定義・生成／返却 | <code>new Error('Enter a Component group (max 80 characters)')</code> |
| [45](../cad-library.js#L45) | 定義・生成／返却 | <code>new Error('Choose a saved Component')</code> |
| [46](../cad-library.js#L46) | 定義・生成／返却 | <code>new Error('Conflicting recipe version; save a new version')</code> |
| [49](../cad-library.js#L49) | 定義・生成／返却 | <code>new Error('Invalid saved Curve bindings')</code> |
| [49](../cad-library.js#L49) | 定義・生成／返却 | <code>new Error('Missing saved input snapshot')</code> |
| [55](../cad-library.js#L55) | 定義・生成／返却 | <code>new Error('Merge needs two outputs')</code> |
| [55](../cad-library.js#L55) | 定義・生成／返却 | <code>new Error('No compatible geometry for this Component')</code> |

### cad-kernel.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [20](../cad-kernel.js#L20) | 定義・生成／返却 | <code>new Error('Unsupported generator version')</code> |
| [22](../cad-kernel.js#L22) | 定義・生成／返却 | <code>new Error('Invalid generator name')</code> |
| [23](../cad-kernel.js#L23) | 定義・生成／返却 | <code>new Error('Unknown curve type')</code> |
| [25](../cad-kernel.js#L25) | 定義・生成／返却 | <code>new Error('Section needs 3–256 finite XY control points')</code> |
| [27](../cad-kernel.js#L27) | 定義・生成／返却 | <code>new Error('Invalid parameter definitions')</code> |
| [30](../cad-kernel.js#L30) | 定義・生成／返却 | <code>new Error(&#96;Invalid ${defaultParam.label}&#96;)</code> |
| [33](../cad-kernel.js#L33) | 定義・生成／返却 | <code>new Error('Unsupported processing steps')</code> |
| [56](../cad-kernel.js#L56) | 定義・生成／返却 | <code>new Error(&#96;Section segment ${i+1} has zero length&#96;)</code> |
| [58](../cad-kernel.js#L58) | 定義・生成／返却 | <code>new Error(&#96;Section intersects at segments ${i+1} and ${j+1}&#96;)</code> |
| [60](../cad-kernel.js#L60) | 定義・生成／返却 | <code>new Error('Section has no enclosed area')</code> |
| [66](../cad-kernel.js#L66) | 定義・生成／返却 | <code>new Error('Height must be at least one layer')</code> |
| [67](../cad-kernel.js#L67) | 定義・生成／返却 | <code>new Error('Too many points; reduce samples or layers')</code> |

### gcode-metadata.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [12](../gcode-metadata.js#L12) | 定義・生成／返却 | <code>new Error('Invalid QOI image')</code> |
| [55](../gcode-metadata.js#L55) | 定義・生成／返却 | <code>new Error('Invalid pause layers')</code> |

### gh-brep-live.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [4](../gh-brep-live.js#L4) | 定義・生成／返却 | <code>new Error('Invalid Grasshopper B-rep source')</code> |
| [17](../gh-brep-live.js#L17) | 返却・伝播 | <code>error(error,payload)</code> |

### cad-input-ui.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [8](../cad-input-ui.js#L8) | 定義・生成／返却 | <code>new Error('Enter a finite number list, separated by commas')</code> |
| [11](../cad-input-ui.js#L11) | 通知・伝播／検証経路 | <code>const nodeEditor=initNodeEditor($('cadSteps'),{definition:api.definition,replace:api.replace,error:api.error,layoutChanged:api.layoutChanged,inspectInput:(event,id)=&gt;context(event,id),inspectOutput,undo:direction=&gt;$(direction&lt;0?'cadUndo':'cadRedo').click()});</code> |
| [23](../cad-input-ui.js#L23) | 返却・伝播 | <code>error(error.message)</code> |
| [43](../cad-input-ui.js#L43) | 返却・伝播 | <code>error(error.message)</code> |
| [63](../cad-input-ui.js#L63) | 返却・伝播 | <code>error(error.message)</code> |
| [68](../cad-input-ui.js#L68) | 返却・伝播 | <code>error(error.message)</code> |
| [69](../cad-input-ui.js#L69) | 定義・生成／返却 | <code>new Error('This source is already connected')</code> |
| [69](../cad-input-ui.js#L69) | 返却・伝播 | <code>error(error.message)</code> |
| [75](../cad-input-ui.js#L75) | 定義・生成／返却 | <code>new Error('CAD input changed; select it again')</code> |
| [76](../cad-input-ui.js#L76) | 定義・生成／返却 | <code>new Error('CAD input changed during the edit; result was not applied')</code> |
| [104](../cad-input-ui.js#L104) | 定義・生成／返却 | <code>new Error('DXF parser failed to load')</code> |
| [104](../cad-input-ui.js#L104) | 定義・生成／返却 | <code>new Error('DXF parser failed to load')</code> |
| [106](../cad-input-ui.js#L106) | 定義・生成／返却 | <code>error(&#96;DXF import failed: ${error.message}&#96;)</code> |
| [106](../cad-input-ui.js#L106) | 定義・生成／返却 | <code>new Error('The generator allows up to 128 total inputs')</code> |
| [113](../cad-input-ui.js#L113) | 返却・伝播 | <code>error(error.message)</code> |
| [123](../cad-input-ui.js#L123) | 定義・生成／返却 | <code>new Error('Unlink this print setting from its driving parameter first')</code> |
| [123](../cad-input-ui.js#L123) | 返却・伝播 | <code>error(error.message)</code> |
| [149](../cad-input-ui.js#L149) | 定義・生成／返却 | <code>new Error('Invalid parameter')</code> |
| [149](../cad-input-ui.js#L149) | 返却・伝播 | <code>error(error.message)</code> |
| [158](../cad-input-ui.js#L158) | 定義・生成／返却 | <code>new Error('The graph changed during validation; try again')</code> |
| [162](../cad-input-ui.js#L162) | 返却・伝播 | <code>error(error.message)</code> |
| [169](../cad-input-ui.js#L169) | 返却・伝播 | <code>error(error.message)</code> |

### bridge-client.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [55](../bridge-client.js#L55) | 定義・生成／返却 | <code>new Error(&#96;HTTP ${response.status}&#96;)</code> |
| [68](../bridge-client.js#L68) | 通知・伝播／検証経路 | <code>notify('Pathloom Bridge is not running', 'error');</code> |
| [80](../bridge-client.js#L80) | 通知・伝播／検証経路 | <code>const result = await response.json().catch(() =&gt; null);</code> |
| [81](../bridge-client.js#L81) | 定義・生成／返却 | <code>new Error(result?.error &#124;&#124; &#96;HTTP ${response.status}&#96;)</code> |
| [87](../bridge-client.js#L87) | 通知・伝播／検証経路 | <code>} catch (error) {</code> |
| [88](../bridge-client.js#L88) | 通知・伝播／検証経路 | <code>notify(&#96;Bridge pairing failed: ${error.message}&#96;, 'error');</code> |
| [105](../bridge-client.js#L105) | 通知・伝播／検証経路 | <code>const result = await response.json().catch(() =&gt; null);</code> |
| [106](../bridge-client.js#L106) | 定義・生成／返却 | <code>new Error(result?.error &#124;&#124; &#96;HTTP ${response.status}&#96;)</code> |
| [108](../bridge-client.js#L108) | 通知・伝播／検証経路 | <code>} catch (error) {</code> |
| [109](../bridge-client.js#L109) | 通知・伝播／検証経路 | <code>notify(&#96;Prusa Connect check failed: ${error.message}&#96;, 'error');</code> |
| [115](../bridge-client.js#L115) | 通知・伝播／検証経路 | <code>notify('Pathloom generator is not ready', 'error');</code> |
| [119](../bridge-client.js#L119) | 通知・伝播／検証経路 | <code>notify('Prusa Connect upload is not enabled in Bridge yet', 'error');</code> |
| [136](../bridge-client.js#L136) | 通知・伝播／検証経路 | <code>const result = await response.json().catch(() =&gt; null);</code> |
| [137](../bridge-client.js#L137) | 定義・生成／返却 | <code>new Error(result?.error &#124;&#124; &#96;HTTP ${response.status}&#96;)</code> |
| [139](../bridge-client.js#L139) | 通知・伝播／検証経路 | <code>} catch (error) {</code> |
| [140](../bridge-client.js#L140) | 通知・伝播／検証経路 | <code>notify(&#96;Send failed: ${error.message}&#96;, 'error');</code> |

### scripts/desktop-dev-server.mjs

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [49](../scripts/desktop-dev-server.mjs#L49) | 定義・生成／返却 | <code>new Error('Not a file')</code> |

### scripts/setup-cad-runtime.mjs

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [11](../scripts/setup-cad-runtime.mjs#L11) | 定義・生成／返却 | <code>new Error('Install uv, then run npm run cad:setup again')</code> |
| [12](../scripts/setup-cad-runtime.mjs#L12) | 定義・生成／返却 | <code>new Error('Unable to download the CAD runtime installer')</code> |

### print-time.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [5](../print-time.js#L5) | 定義・生成／返却 | <code>new Error('Check travel speed')</code> |
| [12](../print-time.js#L12) | 定義・生成／返却 | <code>new Error('Check print speed')</code> |
| [41](../print-time.js#L41) | 定義・生成／返却 | <code>new Error('Check print width, height and filament diameter')</code> |
| [48](../print-time.js#L48) | 定義・生成／返却 | <code>new Error('Check E-rate')</code> |

### cad-chat.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [20](../cad-chat.js#L20) | 定義・生成／返却 | <code>new Error('Chat requires Pathloom Desktop')</code> |
| [45](../cad-chat.js#L45) | 通知・伝播／検証経路 | <code>}catch(error){connected=false;$('cadConnectionSummary').textContent='Connection · unavailable';$('cadAiStatus').textContent=error.message&#124;&#124;String(error)}</code> |
| [51](../cad-chat.js#L51) | 通知・伝播／検証経路 | <code>catch(error){$('cadAiStatus').textContent=error.message&#124;&#124;String(error)}</code> |
| [55](../cad-chat.js#L55) | 定義・生成／返却 | <code>new Error('Proposal exceeded the local generation limit')</code> |
| [56](../cad-chat.js#L56) | 定義・生成／返却 | <code>new Error(event.message&#124;&#124;'Proposal failed')</code> |
| [57](../cad-chat.js#L57) | 定義・生成／返却 | <code>new Error('Request cancelled')</code> |
| [57](../cad-chat.js#L57) | 返却・伝播 | <code>new Error(event.data.error)</code> |
| [74](../cad-chat.js#L74) | 通知・伝播／検証経路 | <code>catch(error){if(attempt&#124;&#124;ownId!==requestId&#124;&#124;api.stamp()!==baseline)throw error;$('cadProcessingStatus').textContent=&#96;Correcting validation error: ${error.message&#124;&#124;String(error)}&#96;;response=await invoke('codex_propose',{...proposalRequest,context:envelope.repair(response.definition,error.message&#124;&#124;String(error))})}</code> |
| [78](../cad-chat.js#L78) | 通知・伝播／検証経路 | <code>}catch(error){if(ownId===requestId)say('assistant',error.message&#124;&#124;String(error))}</code> |
| [81](../cad-chat.js#L81) | 通知・伝播／検証経路 | <code>function cancel(){clearEditTarget();requestId++;busy=false;discard();try{Promise.resolve(invoke('codex_cancel')).catch(()=&gt;{})}catch{}buttons()}</code> |

### cad-code-runtime.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [5](../cad-code-runtime.js#L5) | 定義・生成／返却 | <code>new Error('Code runtime is not initialized')</code> |
| [10](../cad-code-runtime.js#L10) | 定義・生成／返却 | <code>new Error('cad.section requires an editable B-rep input')</code> |
| [12](../cad-code-runtime.js#L12) | 定義・生成／返却 | <code>new Error('Component input is too large')</code> |
| [13](../cad-code-runtime.js#L13) | 定義・生成／返却 | <code>new Error('Component must return a value')</code> |
| [13](../cad-code-runtime.js#L13) | 定義・生成／返却 | <code>new Error('Component output is too large')</code> |
| [13](../cad-code-runtime.js#L13) | 定義・生成／返却 | <code>new Error('Component output must be finite')</code> |
| [14](../cad-code-runtime.js#L14) | 通知・伝播／検証経路 | <code>if(pending){result.error?.dispose();result.value?.dispose();throw pending}</code> |
| [15](../cad-code-runtime.js#L15) | 定義・生成／返却 | <code>new Error(&#96;Component code: ${error.message&#124;&#124;error}&#96;)</code> |
| [18](../cad-code-runtime.js#L18) | 定義・生成／返却 | <code>new Error('Component must return a finite number')</code> |
| [19](../cad-code-runtime.js#L19) | 定義・生成／返却 | <code>new Error('Component must return a boolean')</code> |
| [20](../cad-code-runtime.js#L20) | 定義・生成／返却 | <code>new Error('Component must return Tool information with sequence and mode')</code> |
| [21](../cad-code-runtime.js#L21) | 定義・生成／返却 | <code>new Error('Component must return an array')</code> |
| [22](../cad-code-runtime.js#L22) | 定義・生成／返却 | <code>new Error('Component returned invalid points or numbers')</code> |
| [23](../cad-code-runtime.js#L23) | 定義・生成／返却 | <code>new Error('Component Tool must be 0–4')</code> |
| [23](../cad-code-runtime.js#L23) | 定義・生成／返却 | <code>new Error('Component must return curves with at least two points')</code> |
| [23](../cad-code-runtime.js#L23) | 定義・生成／返却 | <code>new Error('Invalid or excessive Component geometry')</code> |

### cad-gizmo.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [45](../cad-gizmo.js#L45) | 返却・伝播 | <code>error(error.message)</code> |

### cad-worker.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [4](../cad-worker.js#L4) | 通知・伝播／検証経路 | <code>try{const {generateCad}=await kernel;const runCode=definition.recipes?.some(r=&gt;r.code!==undefined)&#124;&#124;definition.programs?.length?await (await import('./cad-code-runtime.js')).initCodeRuntime():undefined;const result=generateCad(definition,{runCode,geometryOnly,sliceBrep(brep,layerHeight,tolerance){const key=JSON.stringify(['center-section-top-print-v1',digests.get(brep.data)&#124;&#124;brep.data,layerHeight,tolerance]);if(cache.has(key))return structuredClone(cache.get(key));throw {nativeSlice:true,key,brep:preview?undefined:brep,layerHeight,tolerance,preview}}});self.postMessage({ok:true,result:preview?{objects:result.objects,paths:result.paths,previewPoints:result.previewPoints,previewValue:result.previewValue,warnings:result.warnings}:result})}</code> |
| [5](../cad-worker.js#L5) | 通知・伝播／検証経路 | <code>catch(error){if(error.nativeSlice){if(++nativeRequests&gt;32)self.postMessage({ok:false,error:'Too many native section requests in one generation'});else self.postMessage({nativeSlice:true,request:error})}else self.postMessage({ok:false,error:error.message})}</code> |
| [7](../cad-worker.js#L7) | 通知・伝播／検証経路 | <code>self.onmessage=async event=&gt;{try{const data=event.data;if(data.nativeSliceResult){if(data.error){self.postMessage({ok:false,error:data.error});return}cache.set(data.key,data.paths);while(cache.size&gt;4)cache.delete(cache.keys().next().value)}else{</code> |
| [9](../cad-worker.js#L9) | 定義・生成／返却 | <code>new Error('Missing worker geometry')</code> |
| [14](../cad-worker.js#L14) | 通知・伝播／検証経路 | <code>}void run()}catch(error){self.postMessage({ok:false,error:error.message})}};</code> |

### step-geometry.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [26](../step-geometry.js#L26) | 定義・生成／返却 | <code>new Error('Layer height must be between 0.05 and 10 mm')</code> |
| [29](../step-geometry.js#L29) | 定義・生成／返却 | <code>new Error('STEP model is too thin to slice at this layer height')</code> |
| [30](../step-geometry.js#L30) | 定義・生成／返却 | <code>new Error('Slicing would create more than 2,000 layers')</code> |
| [35](../step-geometry.js#L35) | 定義・生成／返却 | <code>new Error('STEP slice exceeds 500,000 contour segments; use a coarser layer height or simpler mesh')</code> |
| [41](../step-geometry.js#L41) | 定義・生成／返却 | <code>new Error('No slice lines were found at the chosen layer height')</code> |
| [42](../step-geometry.js#L42) | 定義・生成／返却 | <code>new Error('STEP slice exceeds 1,000,000 output points')</code> |

### dxf-import.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [40](../dxf-import.js#L40) | 定義・生成／返却 | <code>new Error('DXF contains more than 500 supported curves')</code> |
| [42](../dxf-import.js#L42) | 定義・生成／返却 | <code>new Error('No supported 2D curves found in this DXF')</code> |
| [43](../dxf-import.js#L43) | 定義・生成／返却 | <code>new Error('DXF contains more than 128 supported curves; split the file or import fewer layers')</code> |
| [45](../dxf-import.js#L45) | 定義・生成／返却 | <code>new Error('DXF extents exceed the current 1,000 mm input range')</code> |
| [46](../dxf-import.js#L46) | 定義・生成／返却 | <code>new Error(&#96;${curve.name} has more than 256 vertices; simplify this curve before importing&#96;)</code> |

### native/step_brep_bridge.py

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [26](../native/step_brep_bridge.py#L26) | 返却・伝播 | <code>raise RuntimeError(message)</code> |
| [34](../native/step_brep_bridge.py#L34) | 通知・伝播／検証経路 | <code>except ImportError as error:</code> |
| [53](../native/step_brep_bridge.py#L53) | 通知・伝播／検証経路 | <code>except ImportError as error:</code> |
| [167](../native/step_brep_bridge.py#L167) | 通知・伝播／検証経路 | <code>except ImportError as error:</code> |
| [221](../native/step_brep_bridge.py#L221) | 通知・伝播／検証経路 | <code>except Exception as error:</code> |
| [243](../native/step_brep_bridge.py#L243) | 通知・伝播／検証経路 | <code>except Exception as error:</code> |
| [244](../native/step_brep_bridge.py#L244) | 通知・伝播／検証経路 | <code>print(json.dumps({"success": False, "error": str(error)}, separators=(",", ":")))</code> |
| [249](../native/step_brep_bridge.py#L249) | 通知・伝播／検証経路 | <code>raise SystemExit(main(sys.argv))</code> |

### native/occt_brep_bridge.py

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [23](../native/occt_brep_bridge.py#L23) | 定義・生成／返却 | <code>raise ValueError('Invalid or excessive B-rep data')</code> |
| [28](../native/occt_brep_bridge.py#L28) | 定義・生成／返却 | <code>raise ValueError('Unable to restore the editable B-rep')</code> |
| [41](../native/occt_brep_bridge.py#L41) | 定義・生成／返却 | <code>raise ValueError('CAD model exceeds the face limit')</code> |
| [73](../native/occt_brep_bridge.py#L73) | 定義・生成／返却 | <code>raise ValueError('Could not serialize B-rep')</code> |
| [76](../native/occt_brep_bridge.py#L76) | 定義・生成／返却 | <code>raise ValueError('B-rep exceeds the 100 MB limit')</code> |
| [79](../native/occt_brep_bridge.py#L79) | 定義・生成／返却 | <code>raise ValueError('Could not tessellate CAD preview')</code> |
| [99](../native/occt_brep_bridge.py#L99) | 定義・生成／返却 | <code>raise ValueError('A CAD face has no display triangulation')</code> |
| [111](../native/occt_brep_bridge.py#L111) | 定義・生成／返却 | <code>raise ValueError('CAD preview exceeds display limits')</code> |
| [146](../native/occt_brep_bridge.py#L146) | 定義・生成／返却 | <code>raise ValueError('Connected movement of a curved selected face is not supported yet; original geometry was kept')</code> |
| [150](../native/occt_brep_bridge.py#L150) | 定義・生成／返却 | <code>raise ValueError('Select coplanar faces for connected curved-surface deformation')</code> |
| [153](../native/occt_brep_bridge.py#L153) | 定義・生成／返却 | <code>raise ValueError('Select coplanar faces for connected curved-surface deformation')</code> |
| [158](../native/occt_brep_bridge.py#L158) | 定義・生成／返却 | <code>raise ValueError('Cannot deform this connected surface without breaking its boundaries; original geometry was kept')</code> |
| [159](../native/occt_brep_bridge.py#L159) | 定義・生成／返却 | <code>raise ValueError('Connected deformation would collapse or invert the shape')</code> |
| [205](../native/occt_brep_bridge.py#L205) | 定義・生成／返却 | <code>raise ValueError('Connected deformation of faces with inner loops is not supported yet')</code> |
| [212](../native/occt_brep_bridge.py#L212) | 定義・生成／返却 | <code>raise ValueError('Connected deformation collapsed a neighboring boundary')</code> |
| [214](../native/occt_brep_bridge.py#L214) | 定義・生成／返却 | <code>raise ValueError('Connected deformation would make a neighboring face non-planar; original geometry was kept')</code> |
| [239](../native/occt_brep_bridge.py#L239) | 定義・生成／返却 | <code>raise ValueError('Invalid slice layer height')</code> |
| [240](../native/occt_brep_bridge.py#L240) | 定義・生成／返却 | <code>raise ValueError('Invalid slice tolerance')</code> |
| [243](../native/occt_brep_bridge.py#L243) | 定義・生成／返却 | <code>raise ValueError('STEP model is too thin to slice at this layer height')</code> |
| [245](../native/occt_brep_bridge.py#L245) | 定義・生成／返却 | <code>raise ValueError('Slicing would create more than 2,000 layers')</code> |
| [255](../native/occt_brep_bridge.py#L255) | 通知・伝播／検証経路 | <code>except RuntimeError:return None</code> |
| [262](../native/occt_brep_bridge.py#L262) | 定義・生成／返却 | <code>raise ValueError('Open CASCADE section failed')</code> |
| [271](../native/occt_brep_bridge.py#L271) | 定義・生成／返却 | <code>raise ValueError('Unable to discretize section curve')</code> |
| [289](../native/occt_brep_bridge.py#L289) | 定義・生成／返却 | <code>raise ValueError('Too many section points; increase layer height or tolerance')</code> |
| [291](../native/occt_brep_bridge.py#L291) | 定義・生成／返却 | <code>raise ValueError('No B-rep sections were found')</code> |
| [304](../native/occt_brep_bridge.py#L304) | 定義・生成／返却 | <code>raise ValueError('Invalid live STEP content')</code> |
| [308](../native/occt_brep_bridge.py#L308) | 定義・生成／返却 | <code>raise ValueError('Choose a STEP file smaller than 100 MB')</code> |
| [311](../native/occt_brep_bridge.py#L311) | 定義・生成／返却 | <code>raise ValueError('Open CASCADE could not read this STEP file')</code> |
| [314](../native/occt_brep_bridge.py#L314) | 定義・生成／返却 | <code>raise ValueError('STEP contains no CAD faces')</code> |
| [316](../native/occt_brep_bridge.py#L316) | 定義・生成／返却 | <code>raise ValueError('STEP contains invalid CAD geometry; repair the model before importing')</code> |
| [334](../native/occt_brep_bridge.py#L334) | 定義・生成／返却 | <code>raise ValueError('Unsupported CAD action')</code> |
| [337](../native/occt_brep_bridge.py#L337) | 定義・生成／返却 | <code>raise ValueError('Unsupported B-rep format')</code> |
| [350](../native/occt_brep_bridge.py#L350) | 定義・生成／返却 | <code>raise ValueError('Enter a non-zero XYZ movement within ±1000 mm')</code> |
| [362](../native/occt_brep_bridge.py#L362) | 定義・生成／返却 | <code>raise ValueError('Select valid CAD faces')</code> |
| [365](../native/occt_brep_bridge.py#L365) | 定義・生成／返却 | <code>raise ValueError('CAD transformation produced invalid geometry; original was kept')</code> |
| [367](../native/occt_brep_bridge.py#L367) | 定義・生成／返却 | <code>raise ValueError('CAD edit history limit reached')</code> |
| [371](../native/occt_brep_bridge.py#L371) | 定義・生成／返却 | <code>raise ValueError('Select valid CAD faces')</code> |
| [377](../native/occt_brep_bridge.py#L377) | 定義・生成／返却 | <code>raise ValueError('Face movement currently supports planar faces only')</code> |
| [384](../native/occt_brep_bridge.py#L384) | 定義・生成／返却 | <code>raise ValueError('Move a planar face along its normal; tangential movement is not supported')</code> |
| [391](../native/occt_brep_bridge.py#L391) | 定義・生成／返却 | <code>raise ValueError('CAD face operation failed; original geometry is unchanged')</code> |
| [398](../native/occt_brep_bridge.py#L398) | 定義・生成／返却 | <code>raise ValueError('Face move did not produce a valid solid; original geometry is unchanged')</code> |
| [401](../native/occt_brep_bridge.py#L401) | 定義・生成／返却 | <code>raise ValueError('CAD edit history limit reached')</code> |
| [410](../native/occt_brep_bridge.py#L410) | 定義・生成／返却 | <code>raise ValueError('CAD request exceeds supported limits')</code> |
| [420](../native/occt_brep_bridge.py#L420) | 通知・伝播／検証経路 | <code>except Exception as error:</code> |
| [427](../native/occt_brep_bridge.py#L427) | 通知・伝播／検証経路 | <code>raise SystemExit(main())</code> |

### cad-node-editor.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [35](../cad-node-editor.js#L35) | 返却・伝播 | <code>error(error.message)</code> |
| [47](../cad-node-editor.js#L47) | 返却・伝播 | <code>error(error.message)</code> |
| [51](../cad-node-editor.js#L51) | 返却・伝播 | <code>error(error.message)</code> |
| [67](../cad-node-editor.js#L67) | 返却・伝播 | <code>error(error.message)</code> |
| [121](../cad-node-editor.js#L121) | 返却・伝播 | <code>error(error.message)</code> |

### desktop-client.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [60](../desktop-client.js#L60) | 通知・伝播／検証経路 | <code>} catch (error) {</code> |
| [61](../desktop-client.js#L61) | 定義・生成／返却 | <code>error('Unable to apply Grasshopper toolpath', error)</code> |
| [62](../desktop-client.js#L62) | 通知・伝播／検証経路 | <code>notify(&#96;Grasshopper update failed: ${error.message}&#96;, 'error');</code> |
| [67](../desktop-client.js#L67) | 通知・伝播／検証経路 | <code>const brepInbox=createBrepInbox({ready:()=&gt;!!window.PathloomCad?.upsertRhinoBrep,context:()=&gt;window.PathloomCad?.liveContext?.(),convert:payload=&gt;window.__TAURI__.core.invoke('import_live_step',{step:payload.step,name:payload.label&#124;&#124;payload.source}),apply:(payload,shape)=&gt;{window.PathloomCad.upsertRhinoBrep(payload,shape);setGrasshopperStatus(&#96;Grasshopper · B-rep live · ${payload.label&#124;&#124;payload.source}&#96;)},error:(error,payload)=&gt;notify(&#96;Rhino B-rep · ${payload.source}: ${error.message&#124;&#124;error}&#96;,'error')});</code> |
| [69](../desktop-client.js#L69) | 定義・生成／返却 | <code>error('Unable to restore Rhino bindings',error)</code> |
| [93](../desktop-client.js#L93) | 定義・生成／返却 | <code>error('Unable to restore live B-rep snapshots',error)</code> |
| [96](../desktop-client.js#L96) | 定義・生成／返却 | <code>error('Invalid Grasshopper message', event.payload)</code> |
| [97](../desktop-client.js#L97) | 通知・伝播／検証経路 | <code>notify(&#96;Grasshopper data rejected: ${event.payload}&#96;, 'error');</code> |
| [101](../desktop-client.js#L101) | 定義・生成／返却 | <code>error('Grasshopper bridge error', event.payload)</code> |
| [114](../desktop-client.js#L114) | 通知・伝播／検証経路 | <code>} catch (error) {</code> |
| [115](../desktop-client.js#L115) | 定義・生成／返却 | <code>error('Unable to read Grasshopper bridge status', error)</code> |
| [133](../desktop-client.js#L133) | 通知・伝播／検証経路 | <code>} catch (error) {</code> |
| [134](../desktop-client.js#L134) | 定義・生成／返却 | <code>error('Pathloom desktop runtime unavailable', error)</code> |
| [137](../desktop-client.js#L137) | 通知・伝播／検証経路 | <code>notify('Desktop runtime connection failed', 'error');</code> |
| [174](../desktop-client.js#L174) | 定義・生成／返却 | <code>new Error('Preview is still loading')</code> |
| [180](../desktop-client.js#L180) | 通知・伝播／検証経路 | <code>} catch (error) {</code> |
| [204](../desktop-client.js#L204) | 通知・伝播／検証経路 | <code>} catch (error) {</code> |
| [205](../desktop-client.js#L205) | 通知・伝播／検証経路 | <code>notify(&#96;Unable to choose files: ${error.message &#124;&#124; error}&#96;, 'error');</code> |
| [228](../desktop-client.js#L228) | 通知・伝播／検証経路 | <code>} catch (error) {</code> |
| [229](../desktop-client.js#L229) | 定義・生成／返却 | <code>error('CAD face movement failed', error)</code> |
| [230](../desktop-client.js#L230) | 通知・伝播／検証経路 | <code>notify(&#96;Face movement failed: ${error.message &#124;&#124; error}&#96;, 'error');</code> |
| [247](../desktop-client.js#L247) | 定義・生成／返却 | <code>new Error('Printer connection requires Pathloom Desktop.')</code> |
| [249](../desktop-client.js#L249) | 通知・伝播／検証経路 | <code>function status(id,text,bad=false){el(id).textContent=text;el(id).classList.toggle('is-error',bad)}</code> |
| [254](../desktop-client.js#L254) | 通知・伝播／検証経路 | <code>async function load(){if(loading)return;busy(true);status('printerConnectionStatus','Loading…');try{setFields(await invoke('printer_connection_get'));status('printerConnectionStatus',baseline.hasCredentials?'Connection saved':'Enter authentication details to connect.')}catch(e){status('printerConnectionStatus',message(e),true)}finally{busy(false)}}</code> |
| [257](../desktop-client.js#L257) | 通知・伝播／検証経路 | <code>form.addEventListener('submit',async event=&gt;{event.preventDefault();if(loading&#124;&#124;!form.reportValidity())return;const settings=fields(),secret=el('printerSecret').value&#124;&#124;null;busy(true);status('printerConnectionStatus','Saving…');try{setFields(await invoke('printer_connection_save',{settings,secret}));status('printerConnectionStatus','Connection saved')}catch(e){status('printerConnectionStatus',message(e),true)}finally{busy(false)}});</code> |
| [258](../desktop-client.js#L258) | 通知・伝播／検証経路 | <code>el('testPrinterConnection').addEventListener('click',async()=&gt;{if(loading&#124;&#124;!form.reportValidity())return;const settings=fields(),secret=el('printerSecret').value&#124;&#124;null;busy(true);status('printerConnectionStatus','Connecting…');try{const result=await invoke('printer_connection_test',{settings,secret});el('printerStorageOptions').replaceChildren();for(const storage of result.storages&#124;&#124;[]){const option=document.createElement('option');option.value=storage.path.replace(/^\/+&#124;\/+$/g,'');option.label=storage.name&#124;&#124;storage.type;el('printerStorageOptions').append(option)}status('printerConnectionStatus',&#96;Connected · ${result.state} · ${result.storage}&#96;)}catch(e){status('printerConnectionStatus',message(e),true)}finally{busy(false)}});</code> |
| [269](../desktop-client.js#L269) | 通知・伝播／検証経路 | <code>}catch(e){status('printerSendStatus',message(e),true)}finally{uploading=false;for(const field of dialog.querySelectorAll('input,select,button'))field.disabled=false}</code> |
| [271](../desktop-client.js#L271) | 通知・伝播／検証経路 | <code>window.__TAURI__?.event?.listen('printer-upload-progress',event=&gt;{const p=event.payload;if(!uploading&#124;&#124;p.uploadId!==uploadId)return;const percent=Math.min(100,Math.floor(p.sent*100/Math.max(1,p.total)));el('printerSendProgress').value=percent;status('printerSendStatus',percent===100?'Waiting for printer response…':&#96;Transferring · ${percent}%&#96;)}).then(unlisten=&gt;window.addEventListener('pagehide',unlisten,{once:true})).catch(()=&gt;{});</code> |
| [273](../desktop-client.js#L273) | 通知・伝播／検証経路 | <code>window.PathloomPrinter={async send(options){if(opening&#124;&#124;dialog.open)return;opening=true;try{const meta=await invoke('printer_connection_get');if(!meta.hasCredentials){document.dispatchEvent(new Event('pathloom:open-printer-settings'));notify('Set up Printer Connection first.');return}generate=options.generate;el('printerSendFilename').value=options.filename;el('printerSendAction').value='upload';el('confirmPrinterSend').textContent='Transfer file';el('printerSendAddress').textContent=&#96;${meta.baseUrl} · ${meta.storage}&#96;;el('printerSendProgress').hidden=true;status('printerSendStatus','');dialog.showModal();await new Promise(resolve=&gt;finish=resolve)}catch(e){notify(message(e),'error')}finally{opening=false}}};</code> |

### pathloom-project.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [8](../pathloom-project.js#L8) | 定義・生成／返却 | <code>new Error('Unsupported .pathloom project')</code> |
| [10](../pathloom-project.js#L10) | 定義・生成／返却 | <code>new Error('Invalid imported shapes')</code> |
| [15](../pathloom-project.js#L15) | 定義・生成／返却 | <code>new Error('Invalid imported shape')</code> |
| [16](../pathloom-project.js#L16) | 定義・生成／返却 | <code>new Error('Invalid editable CAD asset reference')</code> |
| [18](../pathloom-project.js#L18) | 定義・生成／返却 | <code>new Error('Invalid imported shape mesh')</code> |
| [19](../pathloom-project.js#L19) | 定義・生成／返却 | <code>new Error('Invalid imported face ranges')</code> |
| [20](../pathloom-project.js#L20) | 定義・生成／返却 | <code>new Error('Invalid imported triangle-to-face map')</code> |
| [21](../pathloom-project.js#L21) | 定義・生成／返却 | <code>new Error('Imported shape vertex limit exceeded')</code> |
| [24](../pathloom-project.js#L24) | 定義・生成／返却 | <code>new Error('Invalid objects')</code> |
| [27](../pathloom-project.js#L27) | 定義・生成／返却 | <code>new Error('Invalid source identity')</code> |
| [28](../pathloom-project.js#L28) | 定義・生成／返却 | <code>new Error('Invalid source paths/settings')</code> |
| [30](../pathloom-project.js#L30) | 定義・生成／返却 | <code>new Error('Invalid project path')</code> |
| [32](../pathloom-project.js#L32) | 定義・生成／返却 | <code>new Error('Project point limit exceeded')</code> |
| [33](../pathloom-project.js#L33) | 定義・生成／返却 | <code>new Error('Invalid project XYZ')</code> |
| [37](../pathloom-project.js#L37) | 定義・生成／返却 | <code>new Error('Invalid tool settings')</code> |
| [39](../pathloom-project.js#L39) | 定義・生成／返却 | <code>new Error('Invalid tool values')</code> |
| [41](../pathloom-project.js#L41) | 定義・生成／返却 | <code>new Error('Missing tool settings')</code> |
| [45](../pathloom-project.js#L45) | 定義・生成／返却 | <code>new Error('Invalid shared generator reference')</code> |
| [46](../pathloom-project.js#L46) | 定義・生成／返却 | <code>new Error('Invalid generator object')</code> |
| [48](../pathloom-project.js#L48) | 定義・生成／返却 | <code>new Error('Conflicting shared generators')</code> |
| [50](../pathloom-project.js#L50) | 定義・生成／返却 | <code>new Error('Invalid print links')</code> |
| [53](../pathloom-project.js#L53) | 定義・生成／返却 | <code>new Error('Invalid linked print parameter')</code> |
| [54](../pathloom-project.js#L54) | 定義・生成／返却 | <code>new Error('Missing print settings')</code> |
| [59](../pathloom-project.js#L59) | 定義・生成／返却 | <code>new Error('Invalid instance')</code> |
| [60](../pathloom-project.js#L60) | 定義・生成／返却 | <code>new Error('Invalid placement')</code> |
| [62](../pathloom-project.js#L62) | 定義・生成／返却 | <code>new Error('Invalid printer')</code> |
| [63](../pathloom-project.js#L63) | 定義・生成／返却 | <code>new Error(&#96;Invalid ${id}&#96;)</code> |
| [65](../pathloom-project.js#L65) | 定義・生成／返却 | <code>new Error('Invalid printer profile')</code> |
| [66](../pathloom-project.js#L66) | 定義・生成／返却 | <code>new Error('Invalid view settings')</code> |
| [67](../pathloom-project.js#L67) | 定義・生成／返却 | <code>new Error('Invalid processing preview stage')</code> |
| [68](../pathloom-project.js#L68) | 定義・生成／返却 | <code>new Error('Invalid workspace mode')</code> |

### cad-graph.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [6](../cad-graph.js#L6) | 定義・生成／返却 | <code>new Error('循環する接続は作れません')</code> |
| [6](../cad-graph.js#L6) | 定義・生成／返却 | <code>new Error('接続元の工程がありません')</code> |
| [11](../cad-graph.js#L11) | 定義・生成／返却 | <code>new Error('同じノードには接続できません')</code> |
| [12](../cad-graph.js#L12) | 定義・生成／返却 | <code>new Error('Geometry入力にはCurveまたはToolpathsを接続してください')</code> |
| [12](../cad-graph.js#L12) | 定義・生成／返却 | <code>new Error('Tool入力にはTool情報を接続してください')</code> |
| [14](../cad-graph.js#L14) | 定義・生成／返却 | <code>new Error('接続先がありません')</code> |
| [16](../cad-graph.js#L16) | 定義・生成／返却 | <code>new Error('Curve inputを受け取れるComponentにつないでください')</code> |
| [16](../cad-graph.js#L16) | 定義・生成／返却 | <code>new Error(&#96;${spec.label}には閉じたCurveが必要です&#96;)</code> |
| [18](../cad-graph.js#L18) | 定義・生成／返却 | <code>new Error('工程の出力を接続してください')</code> |
| [20](../cad-graph.js#L20) | 定義・生成／返却 | <code>new Error('MergeにはToolpathsが必要です')</code> |
| [20](../cad-graph.js#L20) | 定義・生成／返却 | <code>new Error('同じ出力を重複接続できません')</code> |
| [20](../cad-graph.js#L20) | 定義・生成／返却 | <code>new Error('無効な入力ポート')</code> |
| [21](../cad-graph.js#L21) | 定義・生成／返却 | <code>new Error(&#96;入力型が一致しません (${type} → ${spec.accepts&#124;&#124;'none'})&#96;)</code> |
| [28](../cad-graph.js#L28) | 定義・生成／返却 | <code>new Error('Unknown Component')</code> |
| [32](../cad-graph.js#L32) | 定義・生成／返却 | <code>new Error('Connection not found')</code> |
| [34](../cad-graph.js#L34) | 定義・生成／返却 | <code>new Error('Connection not found')</code> |
| [40](../cad-graph.js#L40) | 定義・生成／返却 | <code>new Error('Keep at least one geometry Component connected to Print output')</code> |
| [42](../cad-graph.js#L42) | 定義・生成／返却 | <code>new Error('Disconnect the selected input before deleting it')</code> |

### prusalink-client.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [41](../prusalink-client.js#L41) | 定義・生成／返却 | <code>new Error(&#96;config ${configResponse.status}&#96;)</code> |
| [43](../prusalink-client.js#L43) | 定義・生成／返却 | <code>new Error('not configured')</code> |
| [46](../prusalink-client.js#L46) | 通知・伝播／検証経路 | <code>const status = await statusResponse.json().catch(() =&gt; null);</code> |
| [47](../prusalink-client.js#L47) | 定義・生成／返却 | <code>new Error(status?.error &#124;&#124; &#96;status ${statusResponse.status}&#96;)</code> |
| [56](../prusalink-client.js#L56) | 通知・伝播／検証経路 | <code>notify('PrusaLink is not connected', 'error');</code> |
| [61](../prusalink-client.js#L61) | 通知・伝播／検証経路 | <code>notify('Pathloom generator is not ready', 'error');</code> |
| [74](../prusalink-client.js#L74) | 定義・生成／返却 | <code>new Error('Generated G-code is empty')</code> |
| [82](../prusalink-client.js#L82) | 通知・伝播／検証経路 | <code>const result = await response.json().catch(() =&gt; null);</code> |
| [85](../prusalink-client.js#L85) | 定義・生成／返却 | <code>new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))</code> |
| [91](../prusalink-client.js#L91) | 通知・伝播／検証経路 | <code>} catch (error) {</code> |
| [92](../prusalink-client.js#L92) | 定義・生成／返却 | <code>error('Send &amp; Print failed', error)</code> |
| [93](../prusalink-client.js#L93) | 通知・伝播／検証経路 | <code>notify(&#96;Send &amp; Print failed: ${error.message}&#96;, 'error');</code> |

### step-import.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [3](../step-import.js#L3) | 定義・生成／返却 | <code>new Error(result?.error&#124;&#124;'STEP file could not be read')</code> |
| [7](../step-import.js#L7) | 定義・生成／返却 | <code>new Error('STEP model exceeds 500,000 vertices')</code> |
| [14](../step-import.js#L14) | 定義・生成／返却 | <code>new Error('STEP file contains no displayable solid geometry')</code> |
| [15](../step-import.js#L15) | 定義・生成／返却 | <code>new Error('STEP model exceeds 1,000,000 vertices')</code> |
| [20](../step-import.js#L20) | 定義・生成／返却 | <code>new Error('Choose a STEP file smaller than 100 MB')</code> |
| [23](../step-import.js#L23) | 通知・伝播／検証経路 | <code>const finish=(error,result)=&gt;{clearTimeout(timer);worker.terminate();if(error)reject(error);else resolve(result)};</code> |
| [24](../step-import.js#L24) | 定義・生成／返却 | <code>new Error('STEP import timed out; try a simpler model')</code> |
| [25](../step-import.js#L25) | 定義・生成／返却 | <code>new Error(event.message&#124;&#124;'STEP importer failed')</code> |
| [26](../step-import.js#L26) | 通知・伝播／検証経路 | <code>worker.onmessage=event=&gt;{try{finish(null,normalizeStepResult(event.data,filename))}catch(error){finish(error)}};</code> |
| [37](../step-import.js#L37) | 定義・生成／返却 | <code>new Error('Invalid STEP meshes')</code> |
| [39](../step-import.js#L39) | 定義・生成／返却 | <code>new Error('Invalid STEP mesh coordinates or indices')</code> |
| [40](../step-import.js#L40) | 定義・生成／返却 | <code>new Error('STEP display mesh exceeds supported limits')</code> |
| [45](../step-import.js#L45) | 定義・生成／返却 | <code>new Error('Invalid editable B-rep data')</code> |
| [49](../step-import.js#L49) | 定義・生成／返却 | <code>new Error('Invalid editable CAD face data')</code> |
| [50](../step-import.js#L50) | 定義・生成／返却 | <code>new Error('Invalid CAD face mapping')</code> |
| [54](../step-import.js#L54) | 定義・生成／返却 | <code>new Error('Editable B-rep operations require Pathloom Desktop')</code> |

### cad-worker-client.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [8](../cad-worker-client.js#L8) | 通知・伝播／検証経路 | <code>Promise.resolve().then(()=&gt;run(task.request)).then(result=&gt;{cache.set(task.key,result);points+=cost(result);while(cache.size&gt;8&#124;&#124;points&gt;500000&amp;&amp;cache.size&gt;1){const key=cache.keys().next().value;points-=cost(cache.get(key));cache.delete(key)}for(const waiter of task.waiters.values())waiter.resolve(result)}).catch(error=&gt;{for(const waiter of task.waiters.values())waiter.reject(error)}).finally(()=&gt;{tasks.delete(task.key);running=false;pump()});</code> |
| [12](../cad-worker-client.js#L12) | 定義・生成／返却 | <code>new Error('Preview awaiting exact section')</code> |
| [14](../cad-worker-client.js#L14) | 定義・生成／返却 | <code>new Error('Worker cancelled')</code> |
| [16](../cad-worker-client.js#L16) | 定義・生成／返却 | <code>new Error('Exact B-rep slicing requires Pathloom Desktop')</code> |
| [31](../cad-worker-client.js#L31) | 通知・伝播／検証経路 | <code>}catch(error){if(alive)job.postMessage({nativeSliceResult:true,key:request.key,error:error.message&#124;&#124;String(error)})}});</code> |
| [35](../cad-worker-client.js#L35) | 定義・生成／返却 | <code>new Error('Component validation exceeded 30 seconds')</code> |
| [37](../cad-worker-client.js#L37) | 定義・生成／返却 | <code>new Error(event.message&#124;&#124;'Component worker failed')</code> |
| [38](../cad-worker-client.js#L38) | 返却・伝播 | <code>new Error(event.data.error)</code> |

### local-server.mjs

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [31](../local-server.mjs#L31) | 定義・生成／返却 | <code>new Error('Missing prusalink.baseUrl or prusalink.apiKey')</code> |
| [33](../local-server.mjs#L33) | 通知・伝播／検証経路 | <code>} catch (error) {</code> |
| [34](../local-server.mjs#L34) | 定義・生成／返却 | <code>new Error(&#96;local-config.json is not ready: ${error.message}&#96;)</code> |
| [53](../local-server.mjs#L53) | 定義・生成／返却 | <code>new Error('Request body is too large')</code> |
| [69](../local-server.mjs#L69) | 通知・伝播／検証経路 | <code>} catch (error) {</code> |
| [70](../local-server.mjs#L70) | 通知・伝播／検証経路 | <code>return json(res, 503, { ok: false, error: error.message });</code> |
| [90](../local-server.mjs#L90) | 通知・伝播／検証経路 | <code>} catch (error) {</code> |
| [91](../local-server.mjs#L91) | 通知・伝播／検証経路 | <code>return json(res, 502, { ok: false, error: &#96;Could not reach PrusaLink: ${error.message}&#96; });</code> |
| [102](../local-server.mjs#L102) | 通知・伝播／検証経路 | <code>if (!body.length) return json(res, 400, { ok: false, error: 'G-code body is empty' });</code> |
| [123](../local-server.mjs#L123) | 通知・伝播／検証経路 | <code>} catch (error) {</code> |
| [124](../local-server.mjs#L124) | 通知・伝播／検証経路 | <code>return json(res, 502, { ok: false, error: &#96;Upload failed: ${error.message}&#96; });</code> |
| [128](../local-server.mjs#L128) | 通知・伝播／検証経路 | <code>return json(res, 404, { ok: false, error: 'Unknown local API endpoint' });</code> |
| [145](../local-server.mjs#L145) | 定義・生成／返却 | <code>new Error('Not a file')</code> |
| [164](../local-server.mjs#L164) | 通知・伝播／検証経路 | <code>} catch (error) {</code> |
| [165](../local-server.mjs#L165) | 返却・伝播 | <code>error(error)</code> |
| [166](../local-server.mjs#L166) | 通知・伝播／検証経路 | <code>if (!res.headersSent) json(res, 500, { ok: false, error: error.message });</code> |

### bridge-server.mjs

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [40](../bridge-server.mjs#L40) | 定義・生成／返却 | <code>new Error('Request body too large')</code> |
| [53](../bridge-server.mjs#L53) | 定義・生成／返却 | <code>new Error('Prusa Connect is not configured in Bridge')</code> |
| [100](../bridge-server.mjs#L100) | 通知・伝播／検証経路 | <code>return sendJson(req, res, 401, { ok: false, error: 'Incorrect pairing code' });</code> |
| [108](../bridge-server.mjs#L108) | 通知・伝播／検証経路 | <code>return sendJson(req, res, 401, { ok: false, error: 'Bridge pairing required' });</code> |
| [112](../bridge-server.mjs#L112) | 通知・伝播／検証経路 | <code>if (!CONNECT_TOKEN) return sendJson(req, res, 503, { ok: false, error: 'Prusa Connect is not configured in Bridge' });</code> |
| [119](../bridge-server.mjs#L119) | 通知・伝播／検証経路 | <code>if (!CONNECT_PRINTER_UUID) return sendJson(req, res, 503, { ok: false, error: 'PATHLOOM_PRUSA_CONNECT_PRINTER_UUID is not configured' });</code> |
| [128](../bridge-server.mjs#L128) | 通知・伝播／検証経路 | <code>error: 'Prusa Connect G-code upload is not enabled yet. Pathloom Web never receives or stores Prusa credentials.'</code> |
| [132](../bridge-server.mjs#L132) | 通知・伝播／検証経路 | <code>return sendJson(req, res, 404, { ok: false, error: 'Unknown Bridge endpoint' });</code> |
| [133](../bridge-server.mjs#L133) | 通知・伝播／検証経路 | <code>} catch (error) {</code> |
| [134](../bridge-server.mjs#L134) | 返却・伝播 | <code>error(error)</code> |
| [135](../bridge-server.mjs#L135) | 通知・伝播／検証経路 | <code>return sendJson(req, res, 500, { ok: false, error: error.message });</code> |

### cad-ai-context.js

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [12](../cad-ai-context.js#L12) | 定義・生成／返却 | <code>new Error('Invalid AI patch items')</code> |
| [13](../cad-ai-context.js#L13) | 定義・生成／返却 | <code>new Error('Duplicate or missing AI patch identity')</code> |
| [13](../cad-ai-context.js#L13) | 定義・生成／返却 | <code>new Error('Invalid AI patch item')</code> |
| [17](../cad-ai-context.js#L17) | 定義・生成／返却 | <code>new Error('Invalid AI patch')</code> |
| [18](../cad-ai-context.js#L18) | 定義・生成／返却 | <code>new Error('Invalid AI patch removal')</code> |
| [45](../cad-ai-context.js#L45) | 定義・生成／返却 | <code>new Error('AI context is still too large after omitting local geometry. Reduce the request text or edit one Component at a time.')</code> |
| [49](../cad-ai-context.js#L49) | 定義・生成／返却 | <code>new Error('AI returned an invalid design')</code> |
| [51](../cad-ai-context.js#L51) | 定義・生成／返却 | <code>new Error('AI must reference local CAD geometry, not return CAD payloads')</code> |
| [52](../cad-ai-context.js#L52) | 定義・生成／返却 | <code>new Error('Unknown local geometry reference')</code> |
| [53](../cad-ai-context.js#L53) | 定義・生成／返却 | <code>new Error('AI removed a local geometry reference')</code> |
| [57](../cad-ai-context.js#L57) | 定義・生成／返却 | <code>new Error('Unknown local code reference')</code> |
| [63](../cad-ai-context.js#L63) | 通知・伝播／検証経路 | <code>return {context:fit(context),restore:hydrate,repair(candidate,error){return fit({...context,validationFailure:{definition:clone(candidate),error:String(error).slice(0,2000),instruction:'Correct the failed candidate. Return only changed items using patchFormat, relative to context.definition.'}})}};</code> |

### examples/grasshopper/PathloomSender.cs

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [146](../examples/grasshopper/PathloomSender.cs#L146) | 通知・伝播／検証経路 | <code>catch (System.Exception ex)</code> |

### examples/grasshopper/PathloomBrepSender.cs

| 行 | 種別 | エラー生成・返却・通知コード |
| --- | --- | --- |
| [16](../examples/grasshopper/PathloomBrepSender.cs#L16) | 通知・伝播／検証経路 | <code>if (source.Length &gt; 120 &#124;&#124; label.Length &gt; 120) throw new System.Exception("Source and Label must be at most 120 characters");</code> |
| [40](../examples/grasshopper/PathloomBrepSender.cs#L40) | 通知・伝播／検証経路 | <code>if (brep == null &#124;&#124; !brep.IsValid) throw new System.Exception("Input contains a missing or invalid B-rep; previous geometry was kept");</code> |
| [44](../examples/grasshopper/PathloomBrepSender.cs#L44) | 通知・伝播／検証経路 | <code>if (doc.Objects.AddBrep(copy) == System.Guid.Empty) throw new System.Exception("Unable to stage B-rep for export");</code> |
| [48](../examples/grasshopper/PathloomBrepSender.cs#L48) | 通知・伝播／検証経路 | <code>if (!Rhino.FileIO.FileStp.Write(file, doc, new Rhino.FileIO.FileStpWriteOptions())) throw new System.Exception("Rhino STEP export failed");</code> |
| [50](../examples/grasshopper/PathloomBrepSender.cs#L50) | 通知・伝播／検証経路 | <code>if (new System.IO.FileInfo(file).Length &gt; 16 * 1024 * 1024) throw new System.Exception("Live STEP exceeds the 16 MB limit");</code> |
| [52](../examples/grasshopper/PathloomBrepSender.cs#L52) | 通知・伝播／検証経路 | <code>if (!step.TrimStart().StartsWith("ISO-10303-21;") &#124;&#124; !step.TrimEnd().EndsWith("END-ISO-10303-21;")) throw new System.Exception("Rhino returned an invalid STEP file");</code> |
| [66](../examples/grasshopper/PathloomBrepSender.cs#L66) | 通知・伝播／検証経路 | <code>catch (System.Exception error) { Status = "Pathloom: " + error.Message; }</code> |
