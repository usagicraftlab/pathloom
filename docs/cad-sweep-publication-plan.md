# Issue #18 / 指示016：Sweep系と高度な面の検証・公開

基準 main `241eae0bfd6422fbcaf284cc4a247194639837e2`、2026-10-31 JST。
Issue #16/#17でregistryへ追加した6演算を、実OCPのstartup probe、native fixture、
browser保存回復、公開registryの全経路で再検証して公開状態へ確定する。Issue #19、
実機Issue #37、Draft PR #43、workspace UIレイアウトは対象外である。

| ID | 公開演算 | 採用OCP API・近似契約 | 記録する精度 |
| --- | --- | --- | --- |
| S08 | `surface.sweep2` | `GeomAPI_PointsToBSplineSurface`。2 railを両境界、順序付きsectionのbowを横断制約にしたtransfinite点格子をfit。unsafeなauxiliary-spine pipeは採用しない | fit許容差、全格子偏差、rail偏差、section偏差、sample数/station |
| S10 | `surface.network` | `GeomAPI_ExtremaCurveCurve`でU/V交点対応を求め、`GeomAPI_PointsToBSplineSurface`でfit | 交点許容差、最大交点gap、fit許容差、格子偏差、境界条件 |
| S11 | `surface.patch` | 2/4境界のtransfinite格子または明示点格子を`GeomAPI_PointsToBSplineSurface`でfit | 要求/effective fit許容差、格子偏差、U/V sample数、smoothness/weight |
| F08 | `surface.blend` | `BRepOffsetAPI_MakeFilling`へ選択境界とG0/G1/G2制約を明示 | 要求/達成連続性、fit許容差、G0境界偏差、G1/G2 error |
| F09 | `surface.match` | 変更側/参照側の選択境界を`BRepOffsetAPI_MakeFilling`へ渡し、参照側を変更しない | F08と同じ精度に加え`referenceUnchanged` |
| F10 | `surface.rebuild` | 有限domainを対応parameter格子でsampleし、`GeomAPI_PointsToBSplineSurface`で再fit | fit許容差、対応parameter sampleの実測最大偏差、U/V次数・pole数・sample数 |

6演算の`accuracy.exactness`は`approximate`とし、B-splineが正本B-repであることと、
元入力への一致が近似であることを混同しない。偏差は記載sample/境界に対する実測値で、
Hausdorff上限を暗黙に主張しない。要求許容差を実測値として代入しない。

## 公開条件

- Runtime startup probeが6演算を実OCPで実行し、各演算を個別の`verified`結果として返す。
  失敗結果は公開済みと記録しない。
- `S08`、`S10`、`S11`、`F08`、`F09`、`F10`がregistry-first commandとして存在し、
  native正常/typed failureとJS registry fixtureを持つ。
- exact B-rep assetのfresh runtime import、Undo/Redo、v2 Save/Open後もaccuracyと由来を保持する。
- Node 24/20、native全件、browser全件、push/PR CIを実行し、結果と途中失敗を
  開発ログ・PR本文へ区別して残す。実Mac/Tauri/OS dialogはIssue #37の未実施を維持する。

## Startup probe実測（OCP 7.8.1.1）

要求fit/intersection許容差はいずれも0.01 mm。平面の決定的fixtureで、S08の全格子偏差
`7.105427357601002e-15 mm`、rail偏差`1.7763568394002505e-15 mm`、section偏差
`4.440892098500626e-16 mm`、S10の交点gap/fit偏差`0 mm`、S11のfit偏差
`7.105427357601002e-15 mm`だった。F08 G1/F09 G0の境界偏差はそれぞれ
`1.7763568394002505e-15 mm`、F10の9×9対応parameter sample偏差は
`3.972054645195637e-15 mm`。これらはfixture実測値で、一般入力の上限保証ではない。
