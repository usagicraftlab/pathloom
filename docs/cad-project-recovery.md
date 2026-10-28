# Issue #10 / 指示005：v1/v2保存とCAD回復候補の保護

2026-10-28 JST。基準main `6622cf3e0291f3f88c7ec636922eddaeaf980d91`。

## 仕様25.4の解釈（Muse 09:21回答）

「今はしない」は破棄ではない。単一の回復候補Aを回復または明示破棄するまで保持し、
新文書Bの自動回復保存は保留する。専用の状態表示で理由と手動project保存を案内し、
「保留中の回復データを確認」から再び回復/破棄を選べる。
明示破棄成功後はBの保存を再開し、回復成功後は回復した文書が現行候補となる。
破棄/回復失敗は候補を解放しない。破損JSON/null候補も明示破棄まで上書きしない。
複数候補・CAD以外を含む全体回復はこのIssueへ追加しない。
実macOS/Tauri/OS app-data検証は未実施のまま後段Issue #37で扱う。

## 実装

- `cad/workspace-ui.js`：未解決候補と読取成否を別々に管理し、確認前/保留中/読取失敗時の
  autosaveを止める。破棄失敗では候補を保持。回復にもOpenと同じコマンド版衝突検証を通す。
- autosaveは文書identity・revision・draft版で保存済み範囲を判定し、古い文書のsnapshotを
  次の文書へ適用しない。保存中の変更は成功後に再キューする。復元時は古いtimerを解除する。
- `cad-ui.js`：保存開始時のsnapshotを固定し、その後編集された場合は保存成功と
  「未保存の変更あり」を区別して表示。Cancel/書込失敗は保存済み表示を更新しない。
- v1は既存validatorで読み取り、次回の明示Saveだけv2へ変換する。自動書換を追加しない。
- Rustの同一ディレクトリ一時file→sync→renameと、Storeのprepare/commit restoreを維持する。
  native/asset validatorや許容差・timeout/retryは緩めない。

## Issue本文の4完了条件と証拠

`tests/browser/cad-project-recovery.spec.mjs`の実操作/正本経路：

| 条件 | 検査 |
| --- | --- |
| v1非改変/次回v2 | 正常v2からCAD領域を除いたv1をOpen。OS保存transport上のbytes/Save回数が不変、次回明示Saveでv2、設定/配置を保持 |
| 開曲線/開面/NURBS/失敗lastValidを別プロセスへ復元 | 実Store/OCCTでLine/Plane/Control Curveを作り、Lineの失敗編集とlastValid、未完Polyline draftを保存。新しいPythonプロセスの空Runtimeへ全正本をimportしhash/kind/bbox/valid一致。browser再読込/新Storeでもfeature・command版・lastValid・draftを復元（draftはrepairingへ移行） |
| 失敗Openで現文書保持 | OS cancel、JSON破損、hash不一致、hash/bytesが正しくてもnativeで読めないB-rep、同一command版の内容衝突。文書identity・snapshot・CAD状態・project名・保存回数を保持 |
| 未保存変更と回復候補の扱い | 保留Aを新文書Bが上書きしないことを11秒観測。明示破棄後Bのautosave再開、回復時identity維持。null候補の回復失敗でもBと候補を保持。Save失敗/取消はbytes保持、保存待ち中の新編集はsnapshotへ混ぜず未保存と表示 |

OS transportと保存先をfixtureで代替し、形状・正本export/importは実OCP、別プロセス復元も実行する。
これは実Tauri接続/OSダイアログ/実app-data/実機再起動の代用合格ではない。

## 実測履歴

- 09時の変更前診断：1成功/5.813秒。Aを「今はしない」後Bの矩形確定で回復候補がBへ置換。
  診断assertion成功であり製品合格ではない。Muse回答により保持方針を確定。
- 初回target4件：2成功/2失敗。失敗はテストが非公開の`Pathloom.sources`を呼んだことと、
  存在しないdraft入力labelを待ったこと。製品失敗と区別し、両fixture不備を修正。
- 再実行target4件：4件の成功ログ/exit0を確認したが最終集計行は未出力。
  正式な集計付きtargetで再検証し、旧runの集計を捏造しない。
- 修正前save-red：1失敗/7.9秒。保存待ち中に2個目の矩形を作ってもproject名が
  `cad.pathloom`だけで未保存表示がない。保存内容は1個目のsnapshotで、保存失敗/Cancelの保持は成功。
- 修正後target5件：5成功、失敗/skip/retry/flaky0、errors[]、31.6秒。
- 最終コードのNode24 npm test/Node20.20.2全JS、native全件、browser全件、最終CIは
  実際の集計をPR本文・Codexログへ記録する。未確認を成功とはしない。

raw log/JSON/traceは`work/board-verification/005/`。
機能65IDとA/T/Rの既存状態は保持し、この範囲だけで一括昇格しない。

最終ローカル結果：Node24.22.1 npm test199成功/失敗・skip0（test3.006秒/runner3.283秒）、
Node20.20.2全29 JS199成功/失敗・skip0（test4.039秒/runner4.120秒）、
native53件＝51成功/任意NVIDIA USD2skip（test3.177秒/runner4.222秒）、
browser全45成功/失敗・skip・retry・flaky0、errors[]（test161.626秒/runner162.198秒）。
全件後、テストだけを強化してOpen各失敗のtoast完了待ちと、別プロセス復元の
開Line長20/非閉鎖、Plane非体積・面積1200、NURBS exactness/非閉鎖を追加照合。
製品コードは不変で、この2件を改めて実行し成功を確認した。
先行失敗traceは標準出力先が後続runに置換されており、初回全trace保持とはしない。
失敗ログと今回のJSON集計/別プロセス正本attachmentは保持する。最終CIはpush/PR後に照合する。
