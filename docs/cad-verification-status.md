# CAD acceptance and fixture ledger

Current audit: [2026-10-26 execution log](cad-development-log.md).
This file owns the A/T/R acceptance states; the log owns dated execution results.
The statuses below are the 2026-10-21 fixture checkpoint, not a claim that every
condition was rerun or completed in Phase 0. In particular, AUD-001 exposes an
additional asynchronous result-application gap beyond R01-R03. AUD-002 exposed
the missing multiple-Difference-target coverage; the isolated Issue #5 evidence
below extends T19/T20 without declaring other Boolean modes complete.

2026-10-21 JST. `passed` is scoped to the listed fixture, not a declaration of full application completion. Native geometry is real OCP; job races substitute transport only. Full macOS execution has not been performed.

| ID | Status | Evidence / remaining scope |
| --- | --- | --- |
| A01 | partial | 4 stages; shared camera + document preserved in browser; full keyboard/selection paths pending |
| A02 | not-run | 未実装または未検証。合格としない。 |
| A03 | passed | Issue #8: center(10,20),60×40 and constrained width80 retain center; two-corner input is distinct; three-mode browser Save/Undo. Scoped to this fixture |
| A04 | partial | Work-order command JSON creates real rectangle, persists globally and inside v2; Issue #11 adds initial-library/registration ordering and shared-save failure coverage ([evidence](cad-phase1-regression-verification.md)); explicit command upgrade/rollback UI pending |
| A05 | partial | T03/T05 plus Issue #8 real Worker width60→80, center/height retained, Undo/Redo and normal Save/reopen; all constraint types/drag pending |
| A06 | partial | Issue #8 conflicting width20 produces no-convergence; previous exact asset hash/bbox survives, draft is retained through Undo/Redo/Save/reopen; broader conflict/recovery cases pending |
| A07 | partial | native T10/T11 + sketch->extrude and semantic fillet browser paths; full chained generation numerical test pending |
| A08 | partial | Existing fillet repair plus Issue #6 Split exact source/asset identity, disappearance/candidates and explicit reselection; no ordinal/proximity remap. Generalized topology mapping pending |
| A09 | partial | branch-local DAG invalidation implemented; full failed-branch UI scenario pending |
| A10 | partial | T06 open Join and Explode native; branch chooser pending |
| A11 | partial | Real native .01 rejection/.1 join + browser explicit tolerance change and persistence; no-extension numerical audit still pending |
| A12 | partial | T13 native open shell area=200; per-command UI exercise pending |
| A13 | partial | T08/T09 native + free open extrusion browser; full Loft generation linkage pending |
| A14 | partial | T24 negative nonplanar exact shape + native asset round-trip + browser creation; all edit modes pending |
| A15 | not-run | Self-intersection warning / continuation policy needs implementation |
| A16 | partial | typed Fillet failures + lastValid + parameter/target repair; failure location diagnosis incomplete |
| A17 | partial | Issue #5: real Difference single500/multiple1500/noncontact1000/empty0/mixed-empty results; browser checks empty history state and persistence. Broader empty-result explanation UI remains pending |
| A18 | partial | Untrim/Offset/Reverse operators exist; actual Trim->Untrim scenario not implemented |
| A19 | partial | Real exact-asset Library/history insertion and recovery browser flow; broader open-face/multi-shape OS cases pending |
| A20 | partial | Issue #6: typed Split source IDs, slot keys, snapshots/body candidates remapped; two independent real-OCCT history Library copies verified. Broader closure/OS matrix pending |
| A21 | partial | Issue #5 adds two independent Difference remainders, target IDs, tool retention, fresh-page v2 reopen and mixed-empty round-trip; native new-Runtime exact-asset import. Other environment/macOS portability untested |
| A22 | partial | legacy JS/Python/browser regression suite; real GH/OS integration untested |
| A23 | partial | Issue #4: document/feature/input/epoch guards through asset export; transport races17 pass, real OCCT width70→80 probe and existing browser21 pass. Actual macOS drag/load remains untested |
| A24 | partial | Issue #6: exact Split rerun preserves binding ID; changed/count results block, v2 reopen retains candidates, explicit same-kind repair preserves binding ID. Full CAD-to-G-code chain remains #9 |
| A25 | not-run | immutable command registry exists; explicit version upgrade/rollback UI pending |
| A26 | partial | Issue #8 1440×1000 real mouse/keyboard: Enter/Esc, text Delete/Ctrl+Z/IME, Shift add/remove, overlapping picks and snap; actual macOS/VoiceOver/all drag combinations pending |
| A27 | partial | original UI/code, vendor notice retention, actual OCP/VTK wheel texts; full distribution/license audit unfinished |
| T01 | passed | native test_T01_rectangle_center + browser center/width/save/Undo |
| T02 | partial | Issue #8 real OCCT browser: A(0,0,-10),B(10,0,-10),C(4,0,10) gives width10,height20 and exact bbox; plane/mode survive Save. Original rotated-XY numeric case remains unrun |
| T03 | passed | solver test: rectangle zero DOF, width80, center retained; browser Worker result |
| T04 | partial | Issue #8 real Worker conflict plus exact lastValid hash, Undo/Redo and Save/reopen with draft; full recovery/OS UI not exercised |
| T05 | passed | solver fixed line/center x; radius7 -> center(5,7) |
| T06 | passed | real native open Join length 10+sqrt(125), Explode 2 exact edges |
| T07 | partial | real native .01 rejection/.1 join; measured no-extension proof still pending |
| T08 | passed | real native open polyline extrusion, area300, shell not solid |
| T09 | passed | real native two open lines Loft, area200, open surface |
| T10 | passed | real native volume60000->80000; sketch/extrude browser80000 |
| T11 | passed | real native same semantic Generated edge across widths + browser downstream fillet |
| T12 | passed | browser rounded source -> missing sharp edge -> retained lastValid -> explicit new edge repair |
| T13 | passed | real native adjacent planes -> open shell, area200 |
| T14 | partial | real native capped sweep volume120pi; uncapped side variant pending |
| T15 | not-run | 未実装または未検証。合格としない。 |
| T16 | not-run | 未実装または未検証。合格としない。 |
| T17 | not-run | 未実装または未検証。合格としない。 |
| T18 | not-run | 未実装または未検証。合格としない。 |
| T19 | passed | Existing union/difference/intersection1500/500/500 retained; Issue #5 real Difference arguments A/B with tool C yields500+1000=1500, multiple tools total1000, immutable inputs and disconnected remainder800; browser two outputs, Undo/Redo, retention and save/reopen |
| T20 | passed | Existing disjoint intersection empty retained; Issue #5 real Difference noncontact1000, self-subtraction empty0, mixed empty/nonempty and all-targets-empty; browser empty state and mixed-empty save/reopen |
| T21 | passed | real native inward shell, removed top, volume8000-18*18*19 |
| T22 | partial | finite-domain Untrim kernel test; Trim itself pending |
| T23 | not-run | 未実装または未検証。合格としない。 |
| T24 | passed | real negative nonplanar curve persisted; CAD browser free 3D creation |
| T25 | partial | runtime destroyed/new instance: curve+solid exact hash/bounds/length/volume; open shell+NURBS exhaustive trim/parameter proof pending |
| R01 | passed | Issue #4: latest preview/export result wins, superseded handles released; late upstream evaluation/export failures cannot overwrite the latest dependent dirty state |
| R02 | passed | Issue #4: unrelated revision retains a valid result; all queued recompute callers wait until the newest input has been evaluated |
| R03 | passed | Issue #4: Undo/delete/Open during export cannot adopt the old result; add initialization cannot insert into a replaced document |
| R04 | partial | Rust Session real hard-kill test passes; full Tauri/macOS recovery not run |
| R05 | partial | Corrupt asset prepare cannot replace current document (job test); real native hash/byte rejection; full OS dialog flow untested |
| R06 | passed | Work-order user command project reopened in fresh page after global command definitions were removed; exact geometry restored. Issue #11 additionally holds initial library loading and rejects shared saves; project definition retained ([evidence](cad-phase1-regression-verification.md)). Real OS app-data/restart remains M05 |
| R07 | partial | alias collision unit test; import collision UI pending |
| R08 | partial | Browser recovery restores real assets and history; failed feature + lastValid saved in v2; complete failed-draft restart matrix pending |
| R09 | partial | existing representative JS fixtures + browser regressions; complete legacy asset matrix pending |
| R10 | partial | Issue #6: per-source Split candidates, vanished part bindings, explicit repair UI, blocked v2 reopen and independent Library copies tested. Real Tauri/macOS interaction remains untested |

## 2026-10-27 JST — Issue #5 scope

The Issue #5 branch adds five native real-OCP tests, five JS contract/policy tests
and three packaged-browser scenarios. Native inputs are independent whole-solid
targets and shared tools; supported setting is boolean `keepTools` (default false).
JS fixtures check roles, unsupported modes, target identity and tool consumers;
they are not geometry evidence. Browser scenarios run the real Python/OCP daemon;
Tauri transport, OS dialogs and project storage are substituted. See the exact
commands, counts and initial fixture failures in [the execution log](cad-development-log.md).
Actual macOS GUI/IPC/save dialogs, distribution and printer integration were not
executed. D04/Split and the other assigned Issues retain their existing states.

## Issue #8 — basic drawing evidence

`tests/cad-basic-drawing.test.mjs` adds seven arithmetic/session contract tests.
`tests/browser/cad-basic-drawing.spec.mjs` adds seven packaged-browser scenarios,
with actual mouse/keyboard events and a real Python/OCP daemon. The dedicated
fixture substitutes only Tauri IPC, OS dialogs and storage. Assertions distinguish
exact numeric input from mouse coordinates quantized at the camera's pixel scale.
The tests cover three Rectangle modes and stored mode, free negative-Z/nonplanar
input, Circle center/radius and failures, single-object Move, selection/snap,
work planes and #7's Offset plane diagnostic, and constrained Rectangle failure
with lastValid/Undo/normal Save. Command rows retain unsupported modes explicitly.
The Circle failure fixture holds an older real-kernel preview until after an
invalid point, then checks that the released result cannot overwrite the error.

This does not complete #9 generation/G-code or #10 general save/recovery.
Actual macOS GUI/IPC/dialogs, Cmd-key behavior and distribution remain unrun here.
See [the dated execution log](cad-development-log.md) for commands and outcomes.

## 2026-10-21 checkpoint results (historical)

For the latest run, use [cad-development-log.md](cad-development-log.md).
Phase 0 reran JS (155 passed) and pinned OCP (35 passed, 2 skipped);
browser assertions and Rust compilation/tests were blocked by the local environment.
Subsequent PR CI compiled the full Rust crate on macOS arm64 and passed 21 tests;
Node 20 JS failed with `navigator is not defined` (AUD-007), so CI browser tests
were skipped. See the development log for the run, versions and exact scope.
Do not carry the historical browser/Rust successes forward as current evidence.

- JavaScript: 155 passed (including transport-race tests, not geometry proofs).
- Python: 37 discovered, 35 passed, 2 optional NVIDIA USD tests skipped.
- Packaged browser: **21 passed** (7 CAD real-kernel scenarios + 14 existing regressions).
- Rust Session: 4 passed against the extracted production transport and real Python child processes. Full Tauri/macOS compilation remains unexecuted here.
- No real AI generation, Rhino session or printer transmission was performed.

## 2026-10-27 JST — PR #28 rebase after Difference #5

Rebased Issue #6 onto main `f9f4ad9e` (PR #27 merged). D02's rows/evidence and
D04's rows/evidence are both retained; A20 uses the Split update and A21 retains
the Difference update. Revalidation: Node24/20.20.2 each185 passed; native48
discovered,46 passed/2 optional USD skipped; packaged browser25 passed, including
Difference3 and Split1. The two added JS integration cases reproduce and prevent
Difference tool-policy replay consuming Split cutters or mixing candidates from
different Split sources. They substitute geometry transport, unlike native and
browser geometry checks. No flaky frame assertion recurred in this local run;
this does not establish that the existing intermittency is fixed. Details and
previous successful/failed CI runs are separated in the execution log.

## 2026-10-27 JST — Issue #6 after Offset #7

Latest-base revalidation retains the D02/D04/E06 contracts: Node24/20 each185
passed; native51 discovered/49 passed/2 optional USD skipped; packaged browser25
passed. Issue #6's three acceptance conditions are mapped individually in the
execution log and PR #28. All CI runs for the final head are checked separately
before an authorized merge; known frame/notification intermittency is not
reported as fixed. Historical no-merge instructions are superseded by the user.

## 2026-10-27 JST — Issue #31 / instruction 003: Difference browser fixture

The D02/T19/T20 and v2 save/reopen scenarios retain their existing geometry,
identity, tool-policy and history assertions. A natural 15-case diagnostic run
showed 13 passes and two distinct fixture failures: an old page's post-teardown
import entered the next test's FIFO queue and consumed its hello reply; a valid
recovery confirmation also blocked a later click after reload. The fixture now
owns its daemon and ID-keyed requests per test, waits for teardown and explicitly
handles seeded recovery before opening the saved project. The original three
scenarios repeated five times pass all 15 without retries or longer timeouts.
This is test-lifecycle evidence, not a new product implementation or completion
of other A/T/R rows, macOS GUI/IPC/OS dialogs, or known maintenance intermittency.
Full-suite results and the exact observed request sequence are in the execution
log; final-head CI runs and merge confirmation are recorded in the Issue #31 PR.

Final local evidence for this fixture-only change: Node24 and Node20.20.2 each
185 passed/0 failed/0 skipped; native51 discovered,49 passed/2 optional USD skips;
packaged browser25 passed/0 failed/0 skipped, including Difference3 and Split1.
The repeated Difference scenarios also pass 15/15 without retries. Actual
macOS GUI/Tauri IPC/OS dialogs and local Rust remain unexecuted; CI is recorded
separately rather than substituted for those checks.

## 2026-10-27 JST — Issue #8 / instruction 002 continuation: latest-main integration

PR #30 is resumed under the board's explicit Ready/merge authorization. The
post-PR-#32 main tree and the existing #8 product/tests are retained together;
the only conflict is two independent development-log appendices, both preserved.
The D02 fixture and ledger evidence from #31 remain unchanged. Existing partial
and unexecuted A/T/R coverage is not promoted by this integration.

Fresh local full suites on the combined source pass: Node24.22.1 and Node20.20.2
each192/0 failed/0 skipped; native51 discovered,49 passed/2 optional USD skips;
packaged browser32 passed/0 failed/0 skipped/0 flaky, including #8's seven cases,
Difference3 and Split1. The first Node20 invocation found no literal glob path
and ran no tests; the expanded-file retry is the successful 192-case execution.
Full commands, source identities, helper-check corrections and limits are in
the development log. Final-head CI runs and merge/auto-close confirmation are
recorded separately in PR #30 and the board after they actually occur.

## 2026-10-27 JST — Issue #9 / instruction 004: partial, awaiting a decision

The new real-OCP browser route confirms Rectangle60×40 / capped Extrude25
volume60000, then width80 / volume80000, unchanged semantic Fillet reference,
updated exact sections and G-code XY width60→80. An inactive graph's shared
outputs remain marked stale until selected; selection now recalculates them,
and unrelated graph inputs/paths are unchanged. Explicitly connecting an
existing binding to another graph is tested separately from automatic updates.
Background generation for inactive graphs is not claimed as implemented.

The terminal body feature is retained for dirty/failed lastValid rather than
silently binding the recomputed Extrude. Pending bindings stop G-code and cancel
old generation/preview jobs. Six new JS tests pass. The three new browser cases
after the current changes have **2 passes / 1 failure**, not a full-suite pass.
The failed case reaches an explicitly reselected valid Fillet but generation
rejects its paths with `Intersecting output curves at Z 0.6`. The cause is not
yet established, so downstream recovery is incomplete and no new A/T/R row is
promoted. Existing T10/T11/T12 CAD-only evidence does not prove G-code recovery.

Node24 full JS, Node20.20.2 full JS, native full suite and full browser suite
have not been run on this partial change. CI, merge and auto-close are recorded
in the Draft PR and board when actually observed. Actual macOS GUI/Tauri IPC/OS
dialogs, local Rust and physical printing are unexecuted. Existing maintenance
frame/notification intermittency is outside this change and remains unresolved.


## 2026-10-27 JST — Issue #34 targeted section evidence (second checkpoint)

The native section adapter now takes oriented topological vertices as edge
endpoints. In the 70×40 rounded-R3 Rectangle→Extrude25→bottom-edge Fillet R2
fixture, an extended line parameter introduced a ~6e-7 mm backwards segment
within OCCT vertex tolerance. This was a generated-polyline defect, not a reason
to relax output validation. Interior samples, CAD B-rep, output rounding and all
validation tolerances remain unchanged. The same B-rep hash and 42 layers now
pass both raw and six-decimal output validation.

New native tests first reproduced the short-segment failure (1 pass/1 fail),
then passed 2/2 after the adapter change. All 20 tests in test_occt_brep_bridge.py
pass, including periodic/curved and open sections. Three existing Node24 test
files pass 21/21, retaining genuine crossing/zero-length/intro-collision rejection.
The new packaged-browser fixture verifies the same length-64 bottom edge and
B-rep hash, actual OCCT sections, 42 output paths and G-code for all 42 Z levels.
Its first run failed on 0.6 versus 0.600 text formatting; a numerical comparison
of all 42 layers passes on re-run (1 pass, no failure/skip/retry). The initial
failed run remains in the PR and development log.

These are targeted results, not local full-suite completion. Node24 all JS,
Node20.20.2 all JS, native all and browser all remain unrun locally for this
change. The two successful preparation-head CI runs have 192 JS, native49/2skip,
Rust21 and browser32 each, and do not validate the later product change.
No A/T/R status is promoted here. In particular, #9 reference-loss recovery
remains outside #34, and actual macOS IPC/dialogs/printer were not exercised.


## Issue #34 — full-suite fixture correction

On ff19d401, full local Node24 and Node20.20.2 each pass192/0fail/0skip;
native53 discovered passes51/skips2 optional USD. Full browser first gives
32pass/1fail, matching push40510652145 and PR40510663843 (both attempt1 failure).
Their JS192, native51+2skip and Rust21 pass; only the newly added browser case
lacks Tauri initialization. The shared module registered hooks as an import
side effect, so its second importing spec had no setup (trace: no goto/hook).
The helper is now an extended per-test page fixture with local daemon/requests
and awaited cleanup. Geometry, assertions and timeout/retry are unchanged.
Full browser and new-head CI results are recorded after completion below.
No unrelated A/T/R status is promoted and no macOS/printer claim is added.

Fixture-corrected full local browser passes33/0fail/0skip/0retry (103.673s),
including the seven earlier imports and the same bottom-edge G-code scenario.
The product/JS/native test blobs and package/lock remain those used by the
Node24/20/native full runs above; only the browser fixture code changed, and
the full browser suite was rerun. Old failures remain part of the evidence.
Final CI run outcomes are recorded in PR #35 and the board after inspection.
The PR remains Draft at the user's pre-merge checkpoint.


## 2026-10-28 JST — Issue #34 after #11's automated fixes

The latest-main integration retains #11's A04/R06 evidence and #34's S05/D05
scope without promoting any A/T/R states. Revalidation: Node24/20.20.2 each192
passed; native53 discovered,51 passed/2 optional USD skips; browser36 passed,
0 failures/skips/retries/flaky and no reporter errors. The identical length-64
bottom edge/B-rep yields42 paths and complete G-code. See the updated section
[evidence](cad-native-section-intersection.md) and dated execution log for initial
entrypoint/logging obstacles, retries and final-head CI. Actual macOS remains
unrun and is tracked separately by Issue #37, not marked passed by this check.


## 2026-10-28 JST — Issue #9 recovery after #11 / #34

The three issue acceptance scenarios now pass on the integrated main: exact
Extrude volume60000→80000 and paths/G-code width60→80 with the same edge;
missing references retain lastValid, reject a delayed section and block output
until explicit edge repair; independent and inactive shared graphs keep their
correct scope and recalculate when selected. Difference's three visible-tool
regressions were reproduced and traced to binding refresh restoring an
intentionally null ready-body tip. A null-tip guard and a failing-then-passing
store contract regression retain consumption without losing pending terminal
results. Source geometry checks and the per-test native fixture remain real OCP;
transport/OS storage are substituted. States are not broadly promoted. See the
[scoped proof](cad-generation-recovery.md) for normal/failure/recovery evidence,
full runs and final-head CI; real macOS acceptance remains unrun in Issue #37.

## 2026-10-28 JST — Issue #10 persistence/recovery scope

[契約と実測](cad-project-recovery.md)。A04/A19/A21/R05/R06/R08/R09に追加証拠。
実OCCTの開Line/Plane/NURBS、failed lastValid、未完Polyline draft、固定command版を保存し、
別Pythonプロセスとbrowser再読込の新Storeへ復元する。v1 Openの非書換/次回v2、
Open cancel/JSON破損/hash破損/native読込失敗/同一command版衝突の現文書保持、
Save失敗/取消/保存中の新編集表示を検査する。
Muse09:21の仕様25.4解釈：候補Aは回復/明示破棄まで保持。保留中Bのautosaveは理由を表示して保留し、
明示破棄後Bのautosaveを再開、回復時はその文書を現行候補にする。複数候補は範囲外。
A/T/R状態は保持する。実macOS/OSダイアログ/app-data実書込/実Tauriは未実施でIssue #37の後段。

## Issue #12 Draft checkpoint — incomplete / 要判断

E05 native回帰4件は3成功/1失敗（NURBS continuationの正本端点未更新）。
API単独probeを変更なしmainと比較しJSON同一を確認したが原因/代替は未確定。
旧計画headのCI成功を試作headの成功としない。A/T/Rの状態は保持。
UI/全出力/履歴/保存/全ローカル検証は未完了、実機#37も未実施。
詳細：[実測と残件](cad-curve-editing-plan.md)。

## 2026-10-28 — Issue #12 / E01〜E11の追加証拠

既存A/T/R62行の状態は保持する。曲線Trimとsurface Untrim（T22）は別演算であり、
曲線編集の成功を未実装の面Trimや実Mac合格へ広げない。
`native/test_curve_editing_modes.py`は全IDの正常/型・不成立・曖昧ケース、
分岐Join/複数group、全区間・edge保持、到達候補、平面Offset/0/円消滅、
2曲線corner全出力、G1/G2の接線と曲率、近似の明示確定、Seam/制御点を実OCCTで確認する。
`tests/curve-editing.test.mjs`は旧command版不変とretention契約を確認する（geometry証拠とは分ける）。
`tests/browser/cad-curve-editing.spec.mjs`は実OCCT daemonと画面入力で各演算を通し、
Trimのmouse区間指定/全出力、Undo/Redo、失敗lastValidとv2、候補/近似warning保持を確認する。
OSダイアログ/storage/Tauri transportはfixtureで代替、実機#37は未実施。
全検証の実行日時・集計・旧失敗と再実行は開発ログ/PR39へ記録する。

## 2026-10-28 — Issue #13 / S03・B01〜B08・D01〜D07

既存A/T/R62行の状態は保持。`native/test_regions_solids.py`の13追加テストは、
穴/島/独立領域と明示閉輪郭、向き付きBox/ellipsoid、開閉primitive/Pipe、穴付き面押出とCap、
複数閉体積/開Shell assemble、複数Boolean/面edge点接触、Fillet連鎖の新v2と旧v1、
2距離Chamfer隣接face、Shellの内外/過大厚さ失敗を実OCCTで数値照合する。
D02/D04は既存の複数対象・全結果・正本由来のnative/JS/browserを維持し全件で再実行。
`tests/regions-solids.test.mjs`は版不変/明示入力契約、browserの追加7ケースは全出力/開閉、
Undo/Redo、失敗lastValid、command版/asset hash/accuracyのv2復元を確認する。
browserは実OCP/実UI、OS/Tauri transportとstorageはfixture代替。実機#37は未実施。
全実行/失敗/再実行/最終CIは開発ログ・PR40・ボードで別々に記録する。
