# Issue #22 — 全体回復・未知版の読取専用回復・Library移行

2026-11-01 JST。起点main `ea4ce7dd4c5bfe271ba06d5e7e16b1643855a702`。

## 境界

- 回復候補は`pathloom-project-recovery` schema 1として、CAD文書だけでなくtoolpath、配置、
  print設定、import形状、CAD UI状態を含むv2プロジェクト全体を別のapp-data fileへ原子的に保存する。
  明示保存後は候補を破棄し、保存後に新しい変更がない限り同じ候補を作り直さない。
- 既存`pathloom-cad-document`回復候補とIssue #10の保留・明示破棄契約は残す。
  新しい全体候補は別command/fileのため、既存候補を暗黙削除・上書きしない。
- 未知のproject version、CAD `schemaVersion`、CAD operation versionはvalidatorを緩めず、
  raw JSONをcloneして読取専用候補として開く。編集領域を`inert`にし、自動回復保存を止め、
  件数と未知版理由だけを表示する。許可する書込みは、保持した原文の明示的な別名保存だけである。
  JSON破損や既知版の不正データは読取専用へ偽装せず、従来どおり失敗する。
- Component/Shape/Command Libraryはlegacy配列を読み、`pathloom-library` schema 1の
  `libraryType`付きcontainerへ同じentry順・未知fieldを保ったまま移行する。型違い・未知schemaは
  上書きせず失敗する。既存project文書の意味やLibrary entry自身のschemaは変更しない。

Issue #23・#24、実Mac GUI/Tauri/OS dialog/app-dataの最終照合（Issue #37）、Draft PR #43は対象外。

## 証拠

| ID | 検査 |
| --- | --- |
| P4-03 | known projectは編集可能。未知project/CAD schema/operation版はraw byte相当のJSON構造を保持した読取専用候補になり、未知fieldを失わない |
| R11 | 全体回復envelopeが非CAD source/print設定を保持。legacy CAD候補は識別可能なまま残る。browserでは全体候補を再読込して読取専用表示・原文別名保存・候補保持を確認 |
| A22 | 3種Libraryのlegacy配列を版付きtyped containerへ移行し、entriesと未知fieldが一致。型違いは拒否 |

`tests/recovery-migration.test.mjs`は純粋な互換契約、
`tests/browser/recovery-migration.spec.mjs`はpackaged browserと代替storageでUI・自動回復を検査する。
Rustはtyped Library payloadと全体回復envelopeのapp-data境界を検証する。
fixtureのstorage/IPCは実Tauri、実OS dialog、実Mac app-data再起動の代用合格ではない。

