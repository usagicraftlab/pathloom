# CAD command implementation ledger

2026-10-26 Phase 0 audit: see [master plan](cad-master-plan.md),
[roadmap](cad-roadmap.md) and [current execution log](cad-development-log.md).
This remains the single 65-ID command ledger. Historical `done` cells apply only
to the stated subset; they do not mean the whole command passed this audit.
Source enumeration found 42 of these IDs registered, plus one Move command.
F03/D09 have native-only subsets; no dedicated command/UI completion is inferred.

2026-10-21 JST · specification v2.0 · branch `codex/cad-workspace`.

**All 65 IDs remain in scope; this is an incomplete implementation.**
`partial` does not mean that every required mode has passed. Shared infrastructure
is recorded separately from per-command evidence. New UI registrations appear
only for an existing native implementation; unimplemented high-level commands
are not shown as fake working buttons.

| ID | Command | UI・input | Exact geometry | Modes | Constraints | History | Reference repair | Undo | Save | Diagnostics | Fixture | UI verification | Known limits |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C01 | Point | partial: registry/session | done: implemented operator; see Modes | partial: 連続点の専用入力は未完 | not-started: per-command sketch integration | partial: shared DAG; per-ID not complete | partial: entity/hash refs; mapping incomplete | partial: shared transactions | partial: shared exact assets + v2 | partial: typed diagnostics + retained lastValid | creation_and_reverse_options | not-started: per-command UI exercise | 連続点の専用入力は未完 |
| C02 | Line | done: 2点クリック・XYZ/相対座標（#8 browser） | done: implemented operator; see Modes | partial: 始終点を確認。方向＋長さは未対応とUI表示 | not-started: per-command sketch integration | partial: shared DAG; per-ID not complete | partial: entity/hash refs; mapping incomplete | partial: shared transactions | partial: shared exact assets + v2 | partial: typed diagnostics + retained lastValid | T24 / P1-05 JS・real-kernel browser | done: 始終点のmouse/numeric・Enter/Esc・focus/IME（browser） | 方向＋長さは未対応。実Mac未検証 |
| C03 | Polyline | done: 点列・連続クリック・相対/Backspace（#8 browser） | done: implemented operator; see Modes | done: 点列open/closed・相対XYZ（記載fixtureの範囲） | not-started: per-command sketch integration | partial: shared DAG; per-ID not complete | partial: entity/hash refs; mapping incomplete | partial: shared transactions | partial: shared exact assets + v2 | partial: typed diagnostics + retained lastValid | T08 / T24 / P1-05 JS・real-kernel browser | done: numeric相対/Backspace・mouse closed（browser） | 実Mac・全キー/drag組合せは未検証 |
| C04 | Rectangle | done: 中心・2コーナー・3点UI（#8 browser） | done: implemented operator; see Modes | partial: 3作図モード/保存を確認。角丸との全組合せは未検証 | partial: Worker rectangle solver | done: numeric + browser DAG | partial: entity/hash refs; mapping incomplete | done: browser dimension Undo/Redo | done: browser v2 round-trip | partial: typed diagnostics + retained lastValid | T01 / T02 subset / T03 / T10 / T11 / T12 / P1-05 browser | done: 3モードのnumeric、中心/2コーナー/3点のmouse（browser） | 拘束幅/未収束/Undo/Saveを確認。全拘束/角丸/OS組合せは未完 |
| C05 | Polygon | partial: registry/session | partial: exact fixtures | partial: 基本設定のみ; 全主要モード未検証 | not-started: per-command sketch integration | partial: shared DAG; per-ID not complete | partial: entity/hash refs; mapping incomplete | partial: shared transactions | partial: shared exact assets + v2 | partial: typed diagnostics + retained lastValid | creation_and_reverse_options | not-started: per-command UI exercise | 全主要モード・failure fixture・実Mac確認は未完 |
| C06 | Circle | done: 中心＋半径・中心→半径点（#8 browser） | partial: exact fixtures | partial: 中心半径を確認。直径/2端点/3点は未対応とUI表示 | not-started: per-command sketch integration | partial: shared DAG; per-ID not complete | partial: entity/hash refs; mapping incomplete | partial: shared transactions | partial: shared exact assets + v2 | partial: typed diagnostics + retained lastValid | creation_and_reverse_options / T14 / P1-05 browser | done: 中心半径・半径点・不成立入力（browser） | 直径・2端点・3点は未対応。実Mac未検証 |
| C07 | Arc | partial: registry/session | partial: exact fixtures | partial: 中心/角度。3点モード未完 | not-started: per-command sketch integration | partial: shared DAG; per-ID not complete | partial: entity/hash refs; mapping incomplete | partial: shared transactions | partial: shared exact assets + v2 | partial: typed diagnostics + retained lastValid | creation_and_reverse_options | not-started: per-command UI exercise | 中心/角度。3点モード未完 |
| C08 | Ellipse | partial: registry/session | partial: exact fixtures | partial: 基本設定のみ; 全主要モード未検証 | not-started: per-command sketch integration | partial: shared DAG; per-ID not complete | partial: entity/hash refs; mapping incomplete | partial: shared transactions | partial: shared exact assets + v2 | partial: typed diagnostics + retained lastValid | creation_and_reverse_options | not-started: per-command UI exercise | 全主要モード・failure fixture・実Mac確認は未完 |
| C09 | ControlPointCurve（Curve） | partial: registry/session | partial: exact fixtures | partial: 制御点/次数/knotsのJSON入力。直接pole編集未完 | not-started: per-command sketch integration | partial: shared DAG; per-ID not complete | partial: entity/hash refs; mapping incomplete | partial: shared transactions | partial: shared exact assets + v2 | partial: typed diagnostics + retained lastValid | creation_and_reverse_options | not-started: per-command UI exercise | 制御点/次数/knotsのJSON入力。直接pole編集未完 |
| C10 | InterpolateCurve（InterpCrv） | partial: registry/session | partial: exact fixtures | partial: 3次・端部接線未指定のみ | not-started: per-command sketch integration | partial: shared DAG; per-ID not complete | partial: entity/hash refs; mapping incomplete | partial: shared transactions | partial: shared exact assets + v2 | partial: typed diagnostics + retained lastValid | creation_and_reverse_options | not-started: per-command UI exercise | 3次・端部接線未指定のみ |
| C11 | Helix | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | 未実装。対応済みとしない |
| C12 | Spiral | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | 未実装。対応済みとしない |
| E01 | Join | done: #12 明示入力UI（記載fixture範囲） | done: 実OCCT（記載境界内） | done: 連結グループ全出力・open成功・分岐拒否/再選択（v2） | not-started: per-command sketch integration | partial: 共有DAG・下記browser証拠 | partial: exact hash/slot由来、一般mappingは未完 | partial: 下記browser Undo/Redo証拠 | done: 下記browser v2正本/履歴復元 | done: 正常/不成立/曖昧を型付き診断 | native/test_curve_editing_modes.py / test_cad_curve_editing.py | done: tests/browser/cad-curve-editing.spec.mjs（記載fixture） | 分岐は自動推測しない。入力を選び直す。実Mac #37未実施 |
| E02 | Explode | done: #12 明示入力UI（記載fixture範囲） | done: 実OCCT（記載境界内） | done: 全edgeを正本のまま分離 | not-started: per-command sketch integration | partial: 共有DAG・下記browser証拠 | partial: exact hash/slot由来、一般mappingは未完 | partial: 下記browser Undo/Redo証拠 | done: 下記browser v2正本/履歴復元 | done: 正常/不成立/曖昧を型付き診断 | native/test_curve_editing_modes.py / test_cad_curve_editing.py | done: tests/browser/cad-curve-editing.spec.mjs（記載fixture） | 対象境界/証拠はcad-curve-editing-plan.md。実Mac #37未実施 |
| E03 | Trim | done: #12 明示入力UI（記載fixture範囲） | done: 実OCCT（記載境界内） | done: 実交点/parameter分割・削除内部位置・残る全区間 | not-started | partial: 共有DAG・下記browser証拠 | partial: exact hash/slot由来、一般mappingは未完 | partial: 下記browser Undo/Redo証拠 | done: 下記browser v2正本/履歴復元 | done: 正常/不成立/曖昧を型付き診断 | native/test_curve_editing_modes.py / test_cad_curve_editing.py | done: tests/browser/cad-curve-editing.spec.mjs（記載fixture） | クリックは作業平面上。正本投影で一意性を検査。実Mac #37未実施 |
| E04 | Split | done: #12 明示入力UI（記載fixture範囲） | done: 実OCCT（記載境界内） | done: 明示edge/実交点/parameter・未選択edgeも保持（v2） | not-started: per-command sketch integration | partial: 共有DAG・下記browser証拠 | partial: exact hash/slot由来、一般mappingは未完 | partial: 下記browser Undo/Redo証拠 | done: 下記browser v2正本/履歴復元 | done: 正常/不成立/曖昧を型付き診断 | native/test_curve_editing_modes.py / test_cad_curve_editing.py | done: tests/browser/cad-curve-editing.spec.mjs（記載fixture） | 複合曲線はedgeを明示。表示頂点番号で分割しない。実Mac #37未実施 |
| E05 | Extend | done: #12 明示入力UI（記載fixture範囲） | done: 実OCCT（記載境界内） | done: 端点/距離/到達交点候補。NURBS continuation＝接線（16:13ユーザー判断） | not-started | partial: 共有DAG・下記browser証拠 | partial: exact hash/slot由来、一般mappingは未完 | partial: 下記browser Undo/Redo証拠 | done: 下記browser v2正本/履歴復元 | done: 正常/不成立/曖昧を型付き診断 | native/test_curve_editing_modes.py / test_cad_curve_editing.py | done: tests/browser/cad-curve-editing.spec.mjs（記載fixture） | 距離は到達交点の探索上限。候補parameterを明示。旧API不具合の原因確定ではない。実Mac #37未実施 |
| E06 | Offset | done: #12 明示入力UI（記載fixture範囲） | done: 実OCCT（記載境界内） | done: 符号付き距離/平面/round・miter/0 warning/円消滅empty | not-started: per-command sketch integration | partial: 共有DAG・下記browser証拠 | partial: exact hash/slot由来、一般mappingは未完 | partial: 下記browser Undo/Redo証拠 | done: 下記browser v2正本/履歴復元 | done: 正常/不成立/曖昧を型付き診断 | native/test_curve_editing_modes.py / test_cad_curve_editing.py | done: tests/browser/cad-curve-editing.spec.mjs（記載fixture） | 対象境界/証拠はcad-curve-editing-plan.md。実Mac #37未実施 |
| E07 | Fillet／Chamfer | done: #12 明示入力UI（記載fixture範囲） | done: 実OCCT（記載境界内） | done: 平面2曲線のFillet/Chamfer、側/候補/半径/2距離、trim/keepInputs | not-started | partial: 共有DAG・下記browser証拠 | partial: exact hash/slot由来、一般mappingは未完 | partial: 下記browser Undo/Redo証拠 | done: 下記browser v2正本/履歴復元 | done: 正常/不成立/曖昧を型付き診断 | native/test_curve_editing_modes.py / test_cad_curve_editing.py | done: tests/browser/cad-curve-editing.spec.mjs（記載fixture） | 平面単一edge同士。複合曲線はExplodeして明示選択。実Mac #37未実施 |
| E08 | BlendCurve（BlendCrv） | done: #12 明示入力UI（記載fixture範囲） | done: 実OCCT（記載境界内） | done: 端点/向き、G1/G2、handle長。非ゼロ曲率も照合 | not-started | partial: 共有DAG・下記browser証拠 | partial: exact hash/slot由来、一般mappingは未完 | partial: 下記browser Undo/Redo証拠 | done: 下記browser v2正本/履歴復元 | done: 正常/不成立/曖昧を型付き診断 | native/test_curve_editing_modes.py / test_cad_curve_editing.py | done: tests/browser/cad-curve-editing.spec.mjs（記載fixture） | 対象境界/証拠はcad-curve-editing-plan.md。実Mac #37未実施 |
| E09 | RebuildCurve（Rebuild） | done: #12 明示入力UI（記載fixture範囲） | done: 実OCCT（記載境界内） | done: 次数/点数固定fit・偏差warning・明示確定・元保持 | not-started | partial: 共有DAG・下記browser証拠 | partial: exact hash/slot由来、一般mappingは未完 | partial: 下記browser Undo/Redo証拠 | done: 下記browser v2正本/履歴復元 | done: 正常/不成立/曖昧を型付き診断 | native/test_curve_editing_modes.py / test_cad_curve_editing.py | done: tests/browser/cad-curve-editing.spec.mjs（記載fixture） | 偏差は対応parameterサンプル計測でHausdorff上限ではない。実Mac #37未実施 |
| E10 | Reverse／SetSeam（Dir／CrvSeam） | done: #12 明示入力UI（記載fixture範囲） | done: 実OCCT（記載境界内） | done: Reverse/周期閉曲線Seam/閉clamped曲線の正確な区間再順序 | not-started: per-command sketch integration | partial: 共有DAG・下記browser証拠 | partial: exact hash/slot由来、一般mappingは未完 | partial: 下記browser Undo/Redo証拠 | done: 下記browser v2正本/履歴復元 | done: 正常/不成立/曖昧を型付き診断 | native/test_curve_editing_modes.py / test_cad_curve_editing.py | done: tests/browser/cad-curve-editing.spec.mjs（記載fixture） | 単一edgeの閉曲線が対象。複合wireは対象区間を分離して指定。実Mac #37未実施 |
| E11 | EditControlPoints（PointsOn等） | done: #12 明示入力UI（記載fixture範囲） | done: 実OCCT（記載境界内） | done: 制御点XYZ移動・形状不変knot挿入・許容差付きknot/点削減 | not-started | partial: 共有DAG・下記browser証拠 | partial: exact hash/slot由来、一般mappingは未完 | partial: 下記browser Undo/Redo証拠 | done: 下記browser v2正本/履歴復元 | done: 正常/不成立/曖昧を型付き診断 | native/test_curve_editing_modes.py / test_cad_curve_editing.py | done: tests/browser/cad-curve-editing.spec.mjs（記載fixture） | 削除は内部knotと対応制御点。任意poleの無条件削除ではない。実Mac #37未実施 |
| E12 | DuplicateEdge／DuplicateBoundary（DupEdge／DupBorder） | partial: registry/session | partial: exact OCCT | partial: 全edge抽出のみ。選択境界の抽出未完 | not-started: per-command sketch integration | partial: shared DAG; per-ID not complete | partial: entity/hash refs; mapping incomplete | partial: shared transactions | partial: shared exact assets + v2 | partial: typed diagnostics + retained lastValid | not-run | not-started: per-command UI exercise | 全edge抽出のみ。選択境界の抽出未完 |
| E13 | Project／Pull | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | 未実装。対応済みとしない |
| E14 | Intersect／Section／Contour | partial: registry/session | partial: exact fixtures | partial: Sectionのみ。Intersect/Contour未実装 | not-started: per-command sketch integration | partial: shared DAG; per-ID not complete | partial: entity/hash refs; mapping incomplete | partial: shared transactions | partial: shared exact assets + v2 | partial: typed diagnostics + retained lastValid | revolve_section_untrim_and_ruled_edges | not-started: per-command UI exercise | Sectionのみ。Intersect/Contour未実装 |
| S01 | Plane | partial: registry/session | partial: exact fixtures | partial: 基本設定のみ; 全主要モード未検証 | not-started: per-command sketch integration | partial: shared DAG; per-ID not complete | partial: entity/hash refs; mapping incomplete | partial: shared transactions | partial: shared exact assets + v2 | partial: typed diagnostics + retained lastValid | T13 | not-started: per-command UI exercise | 全主要モード・failure fixture・実Mac確認は未完 |
| S02 | SurfaceFromCorners（SrfPt） | partial: registry/session | partial: exact fixtures | partial: 基本設定のみ; 全主要モード未検証 | not-started: per-command sketch integration | partial: shared DAG; per-ID not complete | partial: entity/hash refs; mapping incomplete | partial: shared transactions | partial: shared exact assets + v2 | partial: typed diagnostics + retained lastValid | exact_split_offset_and_corner_surfaces | not-started: per-command UI exercise | 全主要モード・failure fixture・実Mac確認は未完 |
| S03 | PlanarSurface（PlanarSrf） | done: #13 明示UI（下記fixture範囲） | done: 実OCCT/B-rep（記載境界内） | done: 複数閉loop・穴・入れ子の島・独立領域、開/交差/非平面拒否 | not-started: per-command sketch integration | partial: shared DAG・下記履歴証拠 | partial: entity/hash refs; mapping incomplete | partial: 下記Undo/Redo証拠 | done: 下記browser v2復元 | done: 不成立/曖昧/開閉・失敗詳細（fixture範囲） | native/test_regions_solids.py / 既存test_cad_runtime.py | done: tests/browser/cad-regions-solids.spec.mjs（記載範囲） | 輪郭は同一平面。接触/交差loopは自動推測しない。実機#37未実施 |
| S04 | SurfaceFromEdges（EdgeSrf） | partial: registry/session | partial: exact fixtures | partial: 2辺ruledは数値確認。3/4辺Coonsは未検証 | not-started: per-command sketch integration | partial: shared DAG; per-ID not complete | partial: entity/hash refs; mapping incomplete | partial: shared transactions | partial: shared exact assets + v2 | partial: typed diagnostics + retained lastValid | revolve_section_untrim_and_ruled_edges | not-started: per-command UI exercise | 2辺ruledは数値確認。3/4辺Coonsは未検証 |
| S05 | ExtrudeCurve（ExtrudeCrv） | partial: registry/session | partial: exact fixtures | partial: 基本設定のみ; 全主要モード未検証 | not-started: per-command sketch integration | done: numeric + browser DAG | partial: entity/hash refs; mapping incomplete | partial: shared transactions | partial: shared exact assets + v2 | partial: typed diagnostics + retained lastValid | T08 / T10 / browser sketch + extrusion; #9対象回帰成功: 体積60000→80000・G-code幅60→80、参照修復後の実断面/G-code復旧（全件/CIはPR33）  / Issue #34: bottom Fillet R2 exact sections→42-layer G-code; local JS24/20 192 each, native51+2skip, browser33 (CI in PR #35) | done: numeric-entry browser flow | 全主要モード・failure fixture・実Mac確認は未完 |
| S06 | Revolve | partial: registry/session | partial: exact fixtures | partial: 基本設定のみ; 全主要モード未検証 | not-started: per-command sketch integration | partial: shared DAG; per-ID not complete | partial: entity/hash refs; mapping incomplete | partial: shared transactions | partial: shared exact assets + v2 | partial: typed diagnostics + retained lastValid | revolve_section_untrim_and_ruled_edges | not-started: per-command UI exercise | 全主要モード・failure fixture・実Mac確認は未完 |
| S07 | SweepOneRail（Sweep1） | partial: registry/session | partial: exact fixtures | partial: corrected/frenet、単一レール。station・seam編集未完 | not-started: per-command sketch integration | partial: shared DAG; per-ID not complete | partial: entity/hash refs; mapping incomplete | partial: shared transactions | partial: shared exact assets + v2 | partial: typed diagnostics + retained lastValid | T14 | not-started: per-command UI exercise | corrected/frenet、単一レール。station・seam編集未完 |
| S08 | SweepTwoRails（Sweep2） | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | 未実装。対応済みとしない |
| S09 | Loft | partial: registry/session | partial: exact fixtures | partial: open smooth/ruled。閉じる・seam指定未完 | not-started: per-command sketch integration | partial: shared DAG; per-ID not complete | partial: entity/hash refs; mapping incomplete | partial: shared transactions | partial: shared exact assets + v2 | partial: typed diagnostics + retained lastValid | T09 | not-started: per-command UI exercise | open smooth/ruled。閉じる・seam指定未完 |
| S10 | NetworkSurface（NetworkSrf） | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | 未実装。対応済みとしない |
| S11 | PatchSurface（Patch） | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | 未実装。対応済みとしない |
| F01 | Join | partial: registry/session | partial: exact fixtures | partial: 基本設定のみ; 全主要モード未検証 | not-started: per-command sketch integration | partial: shared DAG; per-ID not complete | partial: entity/hash refs; mapping incomplete | partial: shared transactions | partial: shared exact assets + v2 | partial: typed diagnostics + retained lastValid | T13 | not-started: per-command UI exercise | 全主要モード・failure fixture・実Mac確認は未完 |
| F02 | Explode／ExtractFace（ExtractSrf） | partial: registry/session | partial: exact OCCT | partial: 全face Explodeのみ。Extract選択UI未完 | not-started: per-command sketch integration | partial: shared DAG; per-ID not complete | partial: entity/hash refs; mapping incomplete | partial: shared transactions | partial: shared exact assets + v2 | partial: typed diagnostics + retained lastValid | not-run | not-started: per-command UI exercise | 全face Explodeのみ。Extract選択UI未完 |
| F03 | Trim／Split | not-started | partial: surface.split native only; no command/UI | partial: Split kernel only; Trim not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | surface.split演算は存在。専用入力・履歴・保存・fixture経路は未完。AUD-003も対象 |
| F04 | Untrim | partial: registry/session | partial: exact fixtures | partial: 単一face・有限UV範囲の全Untrimのみ | not-started: per-command sketch integration | partial: shared DAG; per-ID not complete | partial: entity/hash refs; mapping incomplete | partial: shared transactions | partial: shared exact assets + v2 | partial: typed diagnostics + retained lastValid | revolve_section_untrim_and_ruled_edges | not-started: per-command UI exercise | 単一face・有限UV範囲の全Untrimのみ |
| F05 | ExtendSurface（ExtendSrf） | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | 未実装。対応済みとしない |
| F06 | OffsetSurface（OffsetSrf） | partial: registry/session | partial: exact fixtures | partial: 片側offsetのみ。両側/solidify未実装 | not-started: per-command sketch integration | partial: shared DAG; per-ID not complete | partial: entity/hash refs; mapping incomplete | partial: shared transactions | partial: shared exact assets + v2 | partial: typed diagnostics + retained lastValid | exact_split_offset_and_corner_surfaces | not-started: per-command UI exercise | 片側offsetのみ。両側/solidify未実装 |
| F07 | FilletSurfaces／ChamferSurfaces（FilletSrf／ChamferSrf） | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | 未実装。対応済みとしない |
| F08 | BlendSurface（BlendSrf） | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | 未実装。対応済みとしない |
| F09 | MatchSurface（MatchSrf） | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | 未実装。対応済みとしない |
| F10 | RebuildSurface／EditControlPoints | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | 未実装。対応済みとしない |
| F11 | ReverseNormal／ShowBoundaries | partial: registry/session | partial: exact OCCT | partial: Reverseのみ。boundary表示UI未完 | not-started: per-command sketch integration | partial: shared DAG; per-ID not complete | partial: entity/hash refs; mapping incomplete | partial: shared transactions | partial: shared exact assets + v2 | partial: typed diagnostics + retained lastValid | not-run | not-started: per-command UI exercise | Reverseのみ。boundary表示UI未完 |
| B01 | Box | done: #13 明示UI（下記fixture範囲） | done: 実OCCT/B-rep（記載境界内） | done: dimensions center/corner・底面2点/3点＋高さ・向き（v2） | not-started: per-command sketch integration | partial: shared DAG・下記履歴証拠 | partial: entity/hash refs; mapping incomplete | partial: 下記Undo/Redo証拠 | done: 下記browser v2復元 | done: 不成立/曖昧/開閉・失敗詳細（fixture範囲） | native/test_regions_solids.py / 既存test_cad_runtime.py | done: tests/browser/cad-regions-solids.spec.mjs（記載範囲） | 3点は基準→幅方向→奥行側。2点は指定平面に平行。実機#37未実施 |
| B02 | Sphere／Ellipsoid | done: #13 明示UI（下記fixture範囲） | done: 実OCCT/B-rep（記載境界内） | done: Sphereと3軸半径/平面/中心の正確なEllipsoid | not-started: per-command sketch integration | partial: shared DAG・下記履歴証拠 | partial: entity/hash refs; mapping incomplete | partial: 下記Undo/Redo証拠 | done: 下記browser v2復元 | done: 不成立/曖昧/開閉・失敗詳細（fixture範囲） | native/test_regions_solids.py / 既存test_cad_runtime.py | done: tests/browser/cad-regions-solids.spec.mjs（記載範囲） | 一般アフィン変換した正確なNURBS/B-rep。mesh拡縮ではない。実機#37未実施 |
| B03 | Cylinder | done: #13 明示UI（下記fixture範囲） | done: 実OCCT/B-rep（記載境界内） | done: 軸/半径/高さ、Cap true/false。開側面を閉体積と区別 | not-started: per-command sketch integration | partial: shared DAG・下記履歴証拠 | partial: entity/hash refs; mapping incomplete | partial: 下記Undo/Redo証拠 | done: 下記browser v2復元 | done: 不成立/曖昧/開閉・失敗詳細（fixture範囲） | native/test_regions_solids.py / 既存test_cad_runtime.py | done: tests/browser/cad-regions-solids.spec.mjs（記載範囲） | 詳細はcad-regions-solids-plan.md。実機#37未実施 |
| B04 | Cone | done: #13 明示UI（下記fixture範囲） | done: 実OCCT/B-rep（記載境界内） | done: 円錐/円錐台/反転頂点、Cap true/false、不正半径拒否 | not-started: per-command sketch integration | partial: shared DAG・下記履歴証拠 | partial: entity/hash refs; mapping incomplete | partial: 下記Undo/Redo証拠 | done: 下記browser v2復元 | done: 不成立/曖昧/開閉・失敗詳細（fixture範囲） | native/test_regions_solids.py / 既存test_cad_runtime.py | done: tests/browser/cad-regions-solids.spec.mjs（記載範囲） | 詳細はcad-regions-solids-plan.md。実機#37未実施 |
| B05 | Torus | done: #13 明示UI（下記fixture範囲） | done: 実OCCT/B-rep（記載境界内） | done: 軸/主半径/管半径のTorus・退化/自己交差範囲を診断 | not-started: per-command sketch integration | partial: shared DAG・下記履歴証拠 | partial: entity/hash refs; mapping incomplete | partial: 下記Undo/Redo証拠 | done: 下記browser v2復元 | done: 不成立/曖昧/開閉・失敗詳細（fixture範囲） | native/test_regions_solids.py / 既存test_cad_runtime.py | done: tests/browser/cad-regions-solids.spec.mjs（記載範囲） | 管半径>=主半径は不成立として診断。実機#37未実施 |
| B06 | Pipe | done: #13 明示UI（下記fixture範囲） | done: 実OCCT/B-rep（記載境界内） | done: 円断面rail掃引・frame/角部transformed/right/round・Cap true/false | not-started | partial: shared DAG・下記履歴証拠 | not-started | partial: 下記Undo/Redo証拠 | done: 下記browser v2復元 | done: 不成立/曖昧/開閉・失敗詳細（fixture範囲） | native/test_regions_solids.py / 既存test_cad_runtime.py | done: tests/browser/cad-regions-solids.spec.mjs（記載範囲） | 角部方式ごとにOCCTで成立/正本検査。任意rail全形状の保証ではない。実機#37未実施 |
| B07 | ExtrudeSurface（ExtrudeSrf） | done: #13 明示UI（下記fixture範囲） | done: 実OCCT/B-rep（記載境界内） | done: 穴を保つ面押出・Cap true/false・両側/負距離 | not-started: per-command sketch integration | partial: shared DAG・下記履歴証拠 | partial: entity/hash refs; mapping incomplete | partial: 下記Undo/Redo証拠 | done: 下記browser v2復元 | done: 不成立/曖昧/開閉・失敗詳細（fixture範囲） | native/test_regions_solids.py / 既存test_cad_runtime.py | done: tests/browser/cad-regions-solids.spec.mjs（記載範囲） | 詳細はcad-regions-solids-plan.md。実機#37未実施 |
| B08 | Cap／CloseSolid（CreateSolid） | done: #13 明示UI（下記fixture範囲） | done: 実OCCT/B-rep（記載境界内） | done: 平面開口Cap・面群assemble・複数閉体積全出力・開面/Shell保持 | not-started | partial: shared DAG・下記履歴証拠 | not-started | partial: 下記Undo/Redo証拠 | done: 下記browser v2復元 | done: 不成立/曖昧/開閉・失敗詳細（fixture範囲） | native/test_regions_solids.py / 既存test_cad_runtime.py | done: tests/browser/cad-regions-solids.spec.mjs（記載範囲） | 非平面の穴を勝手に塞がない。AssembleはBoolean Unionとは別。実機#37未実施 |
| D01 | BooleanUnion | done: #13 明示UI（下記fixture範囲） | done: 実OCCT/B-rep（記載境界内） | done: 複数対象・非接触の全solidをcompound保持 | not-started: per-command sketch integration | partial: shared DAG・下記履歴証拠 | partial: entity/hash refs; mapping incomplete | partial: 下記Undo/Redo証拠 | done: 下記browser v2復元 | done: 不成立/曖昧/開閉・失敗詳細（fixture範囲） | native/test_regions_solids.py / 既存test_cad_runtime.py | done: tests/browser/cad-regions-solids.spec.mjs（記載範囲） | 詳細はcad-regions-solids-plan.md。実機#37未実施 |
| D02 | BooleanDifference | done: ordered targets/tools + keepTools checkbox | done: independent target cuts; real OCCT subset | done: whole-solid targets, multiple tools, retention on/off, empty/compound remainders; other modes rejected | not-started: per-command sketch integration | partial: target entity slots and body continuation; repeat/reorder verified | partial: explicit tool reselection verified; general topology repair pending | done: browser Undo/Redo subset | done: multi-target v2 save/fresh-page reopen; mixed empty save/reopen | partial: schema/type rejection; broader kernel failure UI pending | T19 / T20 / AUD-002; native5 + JS5 + browser3; Issue #31 per-test IPC/recovery fixture (same assertions) | done: numeric-entry/role selection/retention subset | Issue #5 isolated branch: broader lifecycle, general topology repair and actual macOS GUI remain unverified; multi-solid compound inputs rejected, compound outputs retained |
| D03 | BooleanIntersection | done: #13 明示UI（下記fixture範囲） | done: 実OCCT/B-rep（記載境界内） | done: 複数入力の共通・非接触empty・面/edge/点接触の正本保持 | not-started: per-command sketch integration | partial: shared DAG・下記履歴証拠 | partial: entity/hash refs; mapping incomplete | partial: 下記Undo/Redo証拠 | done: 下記browser v2復元 | done: 不成立/曖昧/開閉・失敗詳細（fixture範囲） | native/test_regions_solids.py / 既存test_cad_runtime.py | done: tests/browser/cad-regions-solids.spec.mjs（記載範囲） | 詳細はcad-regions-solids-plan.md。実機#37未実施 |
| D04 | SplitBody | partial: registry/session + explicit input lists | done: real OCCT Split provenance fixtures | partial: multiple targets/cutters; solid and native surface Split | not-started: per-command sketch integration | partial: exact source/asset slots and blocked dependents; cached/suppressed paths tested | done: exact entity/body continuation; explicit reference and generation binding repair | partial: shared transactions; full Split Undo matrix untested | partial: v2 blocked/reopen + typed Library remap tested | partial: ambiguous provenance rejected; lastValid retained | Issue #6: cad-split JS14 (incl. 2 Difference/Split integration cases) + native Split6 + browser AUD-003 | done: D04 selection/commit, count change, blocked/reselect/binding repair, two Library copies | Exact asset hash equality only; ambiguous legacy multiple-target output requires explicit repair. Actual macOS GUI remains untested |
| D05 | FilletEdges（FilletEdge） | done: #13 明示UI（下記fixture範囲） | done: 実OCCT/B-rep（記載境界内） | done: v2 selected/tangentを明示。v1 kernel連鎖挙動保持・所属/不成立診断 | not-started: per-command sketch integration | partial: shared DAG・下記履歴証拠 | done: semantic edge loss + explicit repair | partial: 下記Undo/Redo証拠 | done: 下記browser v2復元 | done: 不成立/曖昧/開閉・失敗詳細（fixture範囲） | native/test_regions_solids.py / 既存test_cad_runtime.py | done: tests/browser/cad-regions-solids.spec.mjs（記載範囲） | 新規v2は連鎖を勝手に拡大しない。旧v1は保存挙動を保持。実機#37未実施 |
| D06 | ChamferEdges（ChamferEdge） | done: #13 明示UI（下記fixture範囲） | done: 実OCCT/B-rep（記載境界内） | done: 等距離/2距離＋距離1側の隣接face明示（v2） | not-started: per-command sketch integration | partial: shared DAG・下記履歴証拠 | partial: entity/hash refs; mapping incomplete | partial: 下記Undo/Redo証拠 | done: 下記browser v2復元 | done: 不成立/曖昧/開閉・失敗詳細（fixture範囲） | native/test_regions_solids.py / 既存test_cad_runtime.py | done: tests/browser/cad-regions-solids.spec.mjs（記載範囲） | 各edgeと同順で距離1側faceを指定。非隣接faceは拒否。実機#37未実施 |
| D07 | Shell | done: #13 明示UI（下記fixture範囲） | done: 実OCCT/B-rep（記載境界内） | done: 内/外・厚さ・除去面所属・失敗詳細/lastValid保持 | not-started: per-command sketch integration | partial: shared DAG・下記履歴証拠 | partial: entity/hash refs; mapping incomplete | partial: 下記Undo/Redo証拠 | done: 下記browser v2復元 | done: 不成立/曖昧/開閉・失敗詳細（fixture範囲） | native/test_regions_solids.py / 既存test_cad_runtime.py | done: tests/browser/cad-regions-solids.spec.mjs（記載範囲） | 不正/元形状のままの内側結果を失敗とし、値/方向/面数を記録。実機#37未実施 |
| D08 | MoveFace | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | 未実装。対応済みとしない |
| D09 | SplitFace／ExtractFace | not-started | partial: surface.extract native only; no command/UI | partial: Extract kernel only; SplitFace not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | not-started | surface.extract演算は存在。専用入力・履歴・保存・fixture経路は未完 |

## Shared additions beyond the 65 IDs

Move transform, project v2, CAD recovery file, shape/history Library with typed ID
remapping, command-data registration, 4-stage layout and explicit body-result
generation binding are implemented in part. See `cad-implementation-notes.md`.

## Issue #4 — AUD-001 asynchronous result application

The isolated `fix/4-aud-001` branch changes Store result adoption and its race
fixtures only. Recompute/preview capture document, feature revision, exact input
state and epochs through every asynchronous stage, including asset export.
Superseded handles are released and every recompute caller waits for the latest
queued pass. Imports are cached by the requested immutable asset hash.
No command IDs, modes, geometry operators, body policies or save schemas change.
This is shared result-integrity evidence, not completion of Difference/Split/Offset
or any command's remaining modes. See the dated Issue #4 execution log.

## Issue #5 — AUD-002 independent Difference targets

The `fix/5-aud-002` branch starts at main `4a22c588` after PR #25 merged.
Only D02 changes: each target is cut by every tool, yielding one ordered remainder
per target, including empty results and disconnected compound remainders. The
Store maps those ordered native outputs to target entity IDs and target bodies;
the native runtime and Split implementation are unchanged.

`keepTools` defaults to false (legacy consumption behavior); true preserves the
tools. Toggling the setting or explicitly reselecting a tool restores only the
appropriate tool bodies and respects other feature consumers. Unsupported modes,
unknown parameters, subshape inputs and duplicate target refs are rejected; two
historical entities of the same target body are rejected before evaluation.
The runtime accepts whole solids, including the single-solid wrapper returned
by OCCT Boolean operations. Multiple-solid compound inputs are unsupported.

The dated [Issue #5 execution log](cad-development-log.md) distinguishes native
geometry, JS contract checks, browser transport substitution and unrun OS checks.
This is not completion of D04/Split, general body/binding lifecycle or all 65 IDs.

## Issue #8 — P1-05 basic drawing input paths

`fix/8-basic-drawing` starts at main `225e1774` after #7 / PR #29 merged
and the user supplied the completion signal. C02/C03/C04/C06 evidence is scoped
in the rows above; no command version or native operator changes.
The final branch is rebased onto main `c3655574` after #6 / PR #28 merged;
Difference/Split/Offset behavior and reference/binding repair from main are retained.

Move (`transform.move` / `shape.transform`, outside the 65 IDs) now has separate
X/Y/Z fields with mm/cm/m, with browser evidence for preselection and postselection.
Its object slot remains **one entity**. Multiple preselected entities require an
explicit choice, and the UI says bulk Move is unsupported. Shift add/remove,
endpoint/Circle-center/Rectangle-center snap, snap OFF, locked/hidden exclusions,
and XY/XZ/YZ/arbitrary-plane clicks have real-kernel browser coverage.

The Store change is only the recorded Rectangle `command.mode`; schemas and pinned
command definitions remain compatible. Offset/native plane validation stays owned
by #7. #9 generation binding and #10 save/recovery infrastructure are unchanged.
For commands, results and unrun OS cases, see the dated Issue #8 execution log.


## 2026-10-28 JST — Issue #11 shared startup and persistence checks

The 65 command IDs and their implementation states are unchanged. Workspace
initialization and command registration now share the initial library-load
barrier. Browser regressions exercise a held initial reply and a rejected shared
save while preserving the project definition. Camera-frame checks wait for
the actual callback with the same numerical predicates and timeouts. See
[the scoped verification record](cad-phase1-regression-verification.md);
these checks do not complete macOS M01–M07 or unimplemented command modes.


## 2026-10-28 JST — Issue #34 revalidation after automated maintenance fixes

S05/D05's existing scope is revalidated with the same length-64 bottom edge,
B-rep hash and 42 paths through G-code after merging main aa4338d7. Full results:
Node24/20 each192 passed; native51 passed/2 optional USD skips; browser36 passed.
The 65 command IDs and their states are retained; #11's startup/save fixes are
preserved. See [section evidence](cad-native-section-intersection.md) for scope
and CI history. macOS acceptance remains unrun in the follow-up Issue #37.

## 2026-10-28 JST — Issue #10 shared persistence evidence

[保存・回復の契約と検証](cad-project-recovery.md)。C02/S01/C09の実正本、
failed + lastValid、未完draft、固定command版をv2保存/新Storeと別Pythonプロセスへ復元する。
v1はOpenだけでは書換せず、次の明示Saveがv2。回復候補保留は明示破棄/回復まで維持する。
65機能の状態をこの共有基盤の検査だけで昇格しない。全OS/実機/全command版の互換行列は未検証。

## Issue #12 Draft checkpoint — incomplete / 要判断

E01〜E11の具体化は[cad-curve-editing-plan.md](cad-curve-editing-plan.md)。
E05試作はLine tangent/continuation・NURBS tangentのみ実測成功。
NURBS continuationは正本端点を検証できず3成功/1失敗で停止した。
その他native試作・UI・履歴/全出力/Undo/保存は未検証/未接続であり、
既存65 ID行や能力の状態をdoneへ昇格しない。Draft PR39は未Ready/未マージ。

## 2026-10-28 — Issue #12 曲線編集

E01〜E11だけを今回の正常/不成立/候補・browser/v2証拠で更新。他54機能の状態は保持。
NURBS continuationはユーザー判断（ボード16:13）により接線延長へ変更した。
[契約・実測・旧失敗履歴](cad-curve-editing-plan.md)を参照。
Constraints/一般参照mapping/実Mac検証の未完は、このIssueの演算/UI完了と分ける。

## 2026-10-28 — Issue #13 閉領域と基本立体

S03/B01〜B08/D01〜D07を照合し、新規証拠の14行だけを更新。既存D02/D04の行と他49機能行は保持。
A/T/R全62行の状態は維持し、下記の追加証拠を対応文書へ追記する。
[契約・正常/不成立・旧失敗](cad-regions-solids-plan.md)を参照。単独演算の成功を一般参照修復/実Mac合格へ広げない。

## 2026-10-28 — Issue #14 既存STEP接続（共有基盤）

65機能IDの状態は変更しない。埋込exact `occt-brep`を持つ既存`importedShapes`だけを
明示的な`import.step` feature/body/entityへ取り込み、mm単位、配置行列、元shape ID/name/kernel、
source/original hashを保存する。display-only meshは既存表示経路のままで、B-repを捏造しない。
現在bodyの正本をOCCT STEPとして書出し、fresh runtimeで再読込してbbox・面積/体積・closure・
validityを照合する。契約と境界は[cad-step-connection-plan.md](cad-step-connection-plan.md)。
browserのTauri IPC/保存dialogはfixtureであり、実MacはIssue #37の未実施範囲として保持する。

## 2026-10-29 — Issue #15 共通操作・再利用（共有基盤）

65機能IDの状態は変更しない。65 ID外の `shape.transform` commandとして既存Moveに
Rotate / Scale / Mirrorを追加し、いずれも形状1件を明示選択してOCCT正本B-repへ適用する。
履歴付きShape Libraryは選択rootの上流closureを保存し、feature/entity/body/sketch、
typed candidate/split由来参照を挿入ごとに再発行する。挿入位置XYZはclosure末尾のMove履歴として
正本へ適用し、無指定配置とschemaVersion 1 entryの互換を保つ。契約は
[共通操作・再利用計画](cad-common-operations-plan.md)。実Macと全65 IDの残件へ能力を広げない。

## 2026-10-30 — 指示018 UIレビュー反映

65機能IDの実装状態は変更しない。CADワークスペースを上部コマンド、透明な左アウトライナー、
編集中だけ現れる右設定、下部履歴の4領域へ整理した。上部はアイコンのみ・展開時縦並び、
履歴はアイコン選択で編集し右クリックで抑制/削除、アウトライナーは表示/lockと
Library/生成/削除だけを提供する。XY/XZ/YZ参照平面を3D中心へ表示し、平面クリックを
作図入力へ接続した。製品CAD演算・保存schema・bindingは変更せず、未実装機能の状態を
このUI整理で昇格しない。実Mac/OS操作はIssue #37の未実施範囲のまま保持する。
第12弾の有限基準面hover/tooltipも反映。既存faceの直接選択、生成参照の明示修復、
回復保留の再確認とLibraryを、新UIでも到達できる入口へ接続する。
