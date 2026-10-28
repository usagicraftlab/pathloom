Total output lines: 1606

f8aee2395477fd3484ca4534cc5087949029ae6a
# 共通操作・再利用 実装計画（Issue #15）

指示011では、既存の `shape.transform` カーネル演算を正本履歴として公開し、形状Libraryの依存closureを独立IDで配置できるところまでをPhase 2の完了範囲とする。

## 契約

- Rotate / Scale / Mirror / Move はいずれも対象形状を1件だけ明示選択し、OCCT B-repを再生成する。表示用行列だけの変換は合格にしない。
- Rotateは有限の軸原点・単位方向・角度、Scaleは有限の中心・正の倍率、Mirrorは有限の直交平面を要求する。
- 重なり候補は既存の候補選択UIで対象を確定し、複数選択を暗黙に先頭要素へ割り当てない。
- 履歴付きLibrary保存は選択rootから上流のtyped entity参照を辿り、必要なfeature/entity/body/sketch/command definition/正本assetをclosureとして保存する。未解決参照は拒否する。
- Library挿入は毎回すべてのtyped IDを新規IDへ写像する。配置XYZは選択rootごとの `shape.transform` featureとしてclosure末尾へ追加し、正本へ適用する。
- 無指定配置およびschemaVersion 1の既存entryは従来互換を保つ。履歴なしsnapshotも配置可能とする。
- 実Mac GUI/Tauri/OS dialogとPhase 1最終実機照合はIssue #37の範囲であり、本Issueの自動検証を実機合格とは記録しない。

## 証跡

Issue #15のC01〜C04、L01〜L05、V01〜V06を単位として、native / JS / browser回帰、Node 24・Node 20.20.2・native全件・browser全件、最終headのpush/PR CIを照合する。初回失敗、再実行、任意skipは最終成功と区別して開発ログとPR本文に残す。
