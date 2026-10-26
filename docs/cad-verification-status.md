# CAD acceptance and fixture ledger

Current audit: [2026-10-26 execution log](cad-development-log.md).
This file owns the A/T/R acceptance states; the log owns dated execution results.
The rows retain the original fixture IDs and now include Phase 1 evidence.
`passed` is scoped to the stated fixture. Native geometry is real OCP; race tests
substitute transport. Browser tests use real Python/OCCT and replace Tauri IPC,
OS storage and cancellation. Full macOS GUI/OS acceptance is not performed.

| ID | Status | Evidence / remaining scope |
| --- | --- | --- |
| A01 | partial | 4 stages/shared camera; viewport pre/post selection + Shift/endpoint/rectangle-center snap in browser; macOS WebView pending |
| A02 | partial | P1 numeric/click Line, relative Polyline + Backspace, Circle center/radius, unit-aware Move XYZ, Esc/input Delete in browser; full command modes/macOS shortcuts pending |
| A03 | partial | P1 real center/2-corner/3-point rectangle geometry, Undo/Redo/save; macOS pointing/input pending |
| A04 | partial | Work-order command JSON creates real rectangle, persists globally and inside v2; explicit command upgrade/rollback UI pending |
| A05 | partial | T03/T05 solver + constrained rectangle browser; all constraint types/drag pending |
| A06 | partial | T04 no-convergence preserves geometry and draft; not all conflict UI cases tested |
| A07 | partial | P1 real rectangle60×40→extrude25→fillet R2→binding→native slice→paths/G-code; width80 updates; native volume60000→80000; GUI on macOS pending |
| A08 | partial | rounded rectangle removes old sharp edge; explicit edge reselect recovers fillet in browser; generalized mapping pending |
| A09 | partial | P1 failed CAD branch blocks G-code, independent non-active generator remains valid; inserted independent history unchanged after original split changes; affected inactive graph auto-regeneration pending |
| A10 | partial | T06 open Join and Explode native; branch chooser pending |
| A11 | partial | Real native .01 rejection/.1 join + browser explicit tolerance change and persistence; no-extension numerical audit still pending |
| A12 | partial | T13 native open shell area=200; per-command UI exercise pending |
| A13 | partial | T08/T09 native + free open extrusion browser; full Loft generation linkage pending |
| A14 | partial | P1 free negative/nonplanar curve/open shell/rational NURBS restored in fresh Python process; all edit modes pending |
| A15 | not-run | Self-intersection warning / continuation policy needs implementation |
| A16 | partial | typed Fillet failures + lastValid + parameter/target repair; failure location diagnosis incomplete |
| A17 | partial | T19/T20 real Boolean empty and unchanged numerical results; UI empty messaging pending |
| A18 | partial | Untrim/Offset/Reverse operators exist; actual Trim->Untrim scenario not implemented |
| A19 | partial | Real exact-asset Library/history insertion and recovery browser flow; broader open-face/multi-shape OS cases pending |
| A20 | partial | P1 Split→Move dependency Library closure has independent IDs, exact source slots and real recompute; broader commands/OS Library pending |
| A21 | partial | P1 exact v2 assets/status/raw draft restored after Python process kill/restart + page reload; v1 opened without write then Save v2; OS/other architecture pending |
| A22 | partial | legacy JS/Python/browser regression suite; real GH/OS integration untested |
| A23 | partial | R01/R02/R03 plus edit/Undo/delete/Open/upstream edit during export, stale handle release; transport restart tests; real Tauri drag/load pending |
| A24 | partial | P1 explicit B-rep binding→native slice updates width80/G-code; failure blocks affected output, preserves unrelated graph and repairs; macOS full flow pending |
| A25 | not-run | immutable command registry exists; explicit version upgrade/rollback UI pending |
| A26 | partial | 1280x800 Library/recovery browser and reachable panels; all shortcuts/VoiceOver/drag combinations pending |
| A27 | partial | original UI/code, vendor notice retention, actual OCP/VTK wheel texts; full distribution/license audit unfinished |
| T01 | passed | native test_T01_rectangle_center + browser center/width/save/Undo |
| T02 | passed | P1 real native 2-corner and free-plane 3-point rectangle exact dimensions/plane, Undo/Redo/save/reopen; browser and adapter fixture |
| T03 | passed | solver test: rectangle zero DOF, width80, center retained; browser Worker result |
| T04 | partial | solver rejects conflicting dimensions with candidates and retains input; complete recovery UI not exercised |
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
| T19 | passed | real Boolean volumes1500/500/500; Phase1 two-target Difference returns500+1000, stable source bodies and keepTools toggle/Undo/reopen |
| T20 | passed | real disjoint intersection empty; Difference1000 unchanged and fully removed target empty, tools exact geometry retained |
| T21 | passed | real native inward shell, removed top, volume8000-18*18*19 |
| T22 | partial | finite-domain Untrim kernel test; Trim itself pending |
| T23 | not-run | 未実装または未検証。合格としない。 |
| T24 | passed | real negative nonplanar curve persisted; CAD browser free 3D creation |
| T25 | partial | P1 fresh Python process browser restores open curve/shell/rational NURBS exact hash/bounds/closure; native verifies degree3, knots[0,1], weights[1,2,2,1], metrics; exhaustive trim/domain matrix pending |
| R01 | passed | preview supersession and feature export supersession including new upstream edit discard/release old handles |
| R02 | passed | unrelated revision retains valid result; latest queued recompute promise drains newest edit |
| R03 | passed | Undo during evaluation and asset export cannot overwrite restored geometry/revision; delete/Open also guarded |
| R04 | partial | Rust Session real hard-kill test passes; full Tauri/macOS recovery not run |
| R05 | partial | browser corrupt asset Open retains current document; prepared Open rejected after late edit; native byte/hash checks; OS dialog/cancel/permission flow pending |
| R06 | passed | Work-order user command project reopened in fresh page after global command definitions were removed; exact geometry restored |
| R07 | partial | alias collision unit test; import collision UI pending |
| R08 | partial | P1 failed feature+lastValid and invalid raw command text survive fresh daemon/page restart; correction commits, recovery browser still passes; complete OS recovery matrix pending |
| R09 | partial | existing representative JS fixtures + browser regressions; complete legacy asset matrix pending |
| R10 | partial | P1 same exact Split slots survive recompute/import; count2→1 blocks old dependent/binding, persists and explicitly repairs; source/hash Library remap passes; macOS repair button exercise pending |

## 2026-10-21 checkpoint results (historical)

For current commands/results and earlier failed attempts, use
[cad-development-log.md](cad-development-log.md). Phase 1 locally passed JS165
on Node20/24 and native41 with2 optional USD skips. macOS CI passed full Rust25
and .app/.dmg build. The historical counts below remain the 2026-10-21 run only.

- JavaScript: 155 passed (including transport-race tests, not geometry proofs).
- Python: 37 discovered, 35 passed, 2 optional NVIDIA USD tests skipped.
- Packaged browser: **21 passed** (7 CAD real-kernel scenarios + 14 existing regressions).
- Rust Session: 4 passed against the extracted production transport and real Python child processes. Full Tauri/macOS compilation remains unexecuted here.
- No real AI generation, Rhino session or printer transmission was performed.
