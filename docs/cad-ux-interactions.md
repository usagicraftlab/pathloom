# 指示027 A — 選択・作図・直接操作

Museの2026-11-02 12:26 JST判断により、027本文の1/3/5/6/8/10/13/14/15/16/17/20/22/23を扱う。
B〜Eは後続指示待ち。5のXYZ方向ボールと20の再計算ghostは既存経路を回帰で照合する。
正規65 command、command定義、保存schema、生成bindingの契約は変更しない。
実Mac GUI/Tauri/OS dialogとIssue #37、Draft PR #43は未実施のまま。

| 項目 | 挙動と検証入口 |
| --- | --- |
| 1 | Shiftで複数bodyを選択し、重複entityを除いたbbox合併のW×D×Hのみ表示。面積・体積は単独solidだけ。JS bounds / browser multi-selection |
| 3 | 端点=四角、中点=三角、中心=円と十字、交点=交差線。作図とMove推論snapで同じSVG。JS inference / browser snap markers |
| 5 | 既存X/Y/Zボールのright/back/top view切替。browser axis balls |
| 6 | 上部の↶で直前の作業面とface支持参照を復帰。現在面と交換し、Openでは前面記憶をリセット。browser workplane back |
| 8 | タイプ専用text欄で四則式・括弧・指数・mm/cm/m/deg/rad。evalなし、長さ・角度の混在、0除算、非有限値を拒否。JS numeric expressions / browser typed expressions |
| 10 | Alt+edge clickで同じexact face wireを選択。faceが曖昧なら次数2の接続だけ辿り、分岐で停止。通常/二重clickは維持。JS loop / native exact topology / browser Alt edge |
| 13 | failed/blocked producerのoutliner行を小さな三角印と色で表示。詳細は既存診断パネル。browser failed edit |
| 14 | Move drag中だけ元位置の曲線輪郭を薄く表示。確定・取消・Openで破棄。JS resource cleanup / browser move origin |
| 15 | 通常は自由回転、Shift中のみ15°snapと弧の24目盛り。押下/解除をdrag途中にも反映。browser direct manipulation / rotation ticks |
| 16 | minor gridは画面間隔が狭まると連続的にfadeし、極小時は省略。JS grid fading / browser zoom |
| 17 | 生成登録済みbodyを小さな接続印で表示。bindingの追加・削除・再接続・Openを既存renderから反映。browser generation registration |
| 20 | 実際の再計算を保留中に既存last-validを半透明表示し、成功後に復帰。JS adapter / browser running shape |
| 22 | 選択bbox合併の中心、選択がなければ最後にクリックした3D点をorbit targetにする。カメラとtargetを同じ差分だけ移し視線方向・距離を保持。JS target / browser multi-selection |
| 23 | CADメニューのズーム連動snapは初期OFF=1 mm。ONはmm/pixel×8を1/2/5系列へ切り上げ、0.01〜100 mm。作図・距離dragとgridで同じstepを使用。JS zoom / browser menu |

暗黙単位は長さ欄でmm、既存angleRad欄でrad。通常のangle parserは従来どおりdeg。
例えば`2.5cm+5`は30 mm、angleRad欄の`90deg+0.5`はπ/2+0.5 radになる。
未指定を許すdistance2Mm/targetParameter/solutionIndexも四則入力を受け、`null`による既定値へ戻せる。
nullableなvector/point列は既存のJSON入力を保持する。
式は256文字・128 token・括弧深度16まで。二つの寸法の積と逆寸法は受け付けない。

exact topologyの表示summaryに`edgeLoops`と頂点/edge/faceの接続索引を付ける。
接続はOCCTのIsSame関係で作り、表示点の座標一致から隣接を推測しない。穴の内外wireは別に保つ。
B-repや保存正本は変更せず、fresh runtimeへのimportでも同じwire集合を再構成する。
遠方gridのmajor線は描画数を抑えるため10倍刻みで間引くが、snapのstepを変更しない。
orbit targetの適用はクリック処理後にまとめ、drag中は保留する。基準面選択と同じクリックを
最初の作図点として受ける途中や、Ctrlコピーの移動量計測中にカメラを動かさない。
sessionで点を集めている間も、遅れたpreviewによる自動retargetを保留する。右buttonで回転を
始めた時に最新の選択/クリック点を中心へ反映し、コマンド終了後は通常の追従へ戻す。
previewの非同期初期化後にもcontrolsのchange購読を接続し、wheel時のgrid更新を保証する。
CADメニューは項目選択後に閉じ、outlinerを覆って操作を妨げない。

実結果は[cad-development-log.md](cad-development-log.md)とPRに記録する。上の対応表だけで合格とはしない。
