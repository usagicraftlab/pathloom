# Issue #9 / 指示004：CAD形状更新と生成の復旧

2026-10-28 JST。既存PR #33 / `fix/9-cad-generation-recovery`を継続する。
依存対策のPR #36 / #35完了後のmain
`77ff814b89a0db3b873e4df3f8287e595b65a05b`を取り込んで検証する。
macOS実機項目は未実施のまま後段Issue #37へ移管済みで、本書の合格数に含めない。

## Issue本文の3完了条件と証拠

| 条件 | 実行する回帰と確認内容 |
| --- | --- |
| 寸法変更の追従 | `cad-generation.spec.mjs:121`：Rectangle60×40、Extrude25の体積60000、同じedgeを再選択せず幅80へ変更して体積80000、binding/Fillet hash一致、実断面とG-code幅60→80 |
| 参照消失・lastValid・復旧 | 同`:150`：遅い実断面応答を保留、角丸R3で旧edgeを消失、Fillet failed/lastValid/CAD_REFERENCE_MISSING、binding pending、旧応答解放後も出力阻止。別のRectangleは操作可能。元の下端水平edge条件で明示再選択し実断面/G-codeへ復旧 |
| 独立形状・非active graph | 同`:197`：共有定義を持つ2出力を非activeにし、独立graphのinputs/paths/errorを保持。古い共有出力は出力を阻止し、選択して再生成後に双方幅80へ更新。明示接続と自動同期を区別 |

OS transport/保存先をfixtureで代替し、実Python/OCP形状、native断面、worker、
strict出力検証、G-codeを使用する。geometryや断面の結果を固定値へ置換しない。
角丸Rectangleの下端水平edge・長さ30超という条件も変更していない。

## 実装の責務

- `CadStore.resolveBindings`：上流再計算の途中でも、失敗・未解決の末端featureを
  bodyの結果として保持する。上流Extrudeへ暗黙に戻ってreadyとしない。
- `syncCadBindingSources`：共有definitionを変更する前に全出力の古い状態を採取し、
  同じgraph groupの全出力を失効させる。独立graphを巻き込まない。
- workspaceの`connect`：ボタンによる明示接続だけが現在graphへ新規入力を追加する。
  自動更新は未接続graphに入力を勝手に足さない。
- `cad-ui.js`：使用中bindingの失敗時に旧jobを取り消しstale表示と出力阻止を維持する。
  非active graphを選択した場合は最新CAD入力から再生成する。
- `app.js`：G-code出力直前にもbindingを解決し、古いhash/未解決入力を拒否する。

## 再開時に確定したDifferenceの回帰原因

旧#9の末端tip補正は、ready bodyすべてにfeature slotを再代入していた。
Difference/replaceの工具bodyは、意図的に`tipEntityId=null`かつ`status=ready`となる。
補正がこのnullを古い工具entityへ戻し、工具や置換前の形状をvisibleに復活させていた。

最新main統合後も修正前のcompiled StoreでDifference3件を実行し、3件とも同じ
可視性assertionで失敗した。一方、generation3件は007のnative修正により成功した。
JSの追加回帰でも、consumed bodyがnullから古いentityへ戻る失敗を固定した。
tipのないready bodyは補正対象にしないことで消費を保ち、末端のpending/failed/lastValid
保持は引き続き検証する。数値許容差・assertion・timeout/retryは緩めない。

## main統合とfixtureの整合

開発ログは共通base5defb177の全文への追記であることを検証して、旧004の追記7228 bytesと
main側の追記15140 bytesを双方そのまま保持した。A/T/Rの追記も両方保持。
S05/D05の競合は14列のうち証拠列だけが異なることを確認し、他13列を変えず証拠を保持した。

共有fixtureは#34の`test.extend`によるtestごとのlifetimeを保持し、#9に必要な
ID付きrequest routing、実native slice、worker/保存の観測と終了待機を組み合わせた。
#9のtransport bodyをそのままper-test wrapper内に移し、global beforeEach/afterEachへ戻さない。
全件ではbasic drawing・generation・native sectionの3 specが同じmoduleをimportする経路も確認する。

## 今回の実測

Linux / Node24.22.1 / Node20.20.2 / Python3.12.14 / OCP7.8.1.1 /
Playwright1.64.1 / Chrome Headless Shell156.0.8078.4。
packaged frontend、worker1、test45秒、retry0、既存launch argsを維持する。

| 実行 | 結果 |
| --- | --- |
| 修正前のtarget6件 | 3成功/3失敗（Difference3件）、test51.655秒/runner52.350秒。compiled Storeのhashを保存してから実行 |
| JS追加回帰を含む7件・修正前 | 6成功/1失敗、test0.119秒/runner0.190秒。consumed tipの復活を検出 |
| 同7件・修正後 | 7成功/失敗・skip0、test0.105秒/runner0.169秒 |
| 修正後target6件 | 6成功/失敗・skip・retry・flaky0、errors[]、test42.804秒/runner44.176秒 |
| Node24 npm test | 199成功/失敗・skip0、test4.329秒/runner4.740秒 |
| Node20.20.2 全29 JSファイルを明示展開 | 199成功/失敗・skip0、test5.324秒/runner5.388秒 |
| native全件 verbose | 53検出＝51成功/任意USD2skip、test5.393秒/runner7.343秒 |
| Node20.20.2全browser | 39成功/失敗・skip・retry・flaky0、errors[]、test126.139秒/runner126.780秒 |
| 新headのCI | push/PR後に全run/jobを確認しPR本文とボードへ記録 |

旧head0f265ffのCI push40500847035は31成功/4失敗、PR40501038537は30成功/5失敗。
共通のDifference3件は今回のbinding補正の回帰、参照修復後の断面交差は別Issue #34、
PR側のframe数失敗は別Issue #11で対策した依存であり、今回の成功で失敗履歴を消さない。
旧localの1成功/2失敗、追加診断2失敗、部分修正2成功/1失敗もPR本文に保持する。

raw log/JSON、before/after状態のattachment、失敗traceは
`work/board-verification/004-resume-007/`。
実macOS/Tauri/OS dialog、local Rust、実プリンターは未実施で、CIと区別する。
A/T/R状態や65機能IDの状態は、この範囲の成功だけで一括昇格しない。
