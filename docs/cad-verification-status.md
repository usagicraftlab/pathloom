# CAD acceptance and fixture ledger

Current audit: [2026-10-26 execution log](cad-development-log.md).
This file owns the A/T/R acceptance states; the log owns dated execution results.
The statuses below are the 2026-10-21 fixture checkpoint, not a claim that every
condition was rerun or completed in Phase 0. In particular, AUD-001 exposes an
additional asynchronous result-application gap beyond R01-R03, and AUD-002 shows
that T19/T20 do not cover multiple Difference arguments.

2026-10-21 JST. `passed` is scoped to the listed fixture, not a declaration of full application completion. Native geometry is real OCP; job races substitute transport only. Full macOS execution has not been performed.

| ID | Status | Evidence / remaining scope |
| --- | --- | --- |
| A01 | partial | 4 stages; shared camera + document preserved in browser; full keyboard/selection paths pending |
| A02 | not-run | 未実装または未検証。合格としない。 |
| A03 | partial | T01 native + center width edit browser; other rectangle modes not complete |
| A04 | partial | Work-order command JSON creates real rectangle, persists globally and inside v2; explicit command upgrade/rollback UI pending |
| A05 | partial | T03/T05 solver + constrained rectangle browser; all constraint types/drag pending |
| A06 | partial | T04 no-convergence preserves geometry and draft; not all conflict UI cases tested |
| A07 | partial | native T10/T11 + sketch->extrude and semantic fillet browser paths; full chained generation numerical test pending |
| A08 | partial | rounded rectangle removes old sharp edge; explicit edge reselect recovers fillet in browser; generalized mapping pending |
| A09 | partial | branch-local DAG invalidation implemented; full failed-branch UI scenario pending |
| A10 | partial | T06 open Join and Explode native; branch chooser pending |
| A11 | partial | Real native .01 rejection/.1 join + browser explicit tolerance change and persistence; no-extension numerical audit still pending |
| A12 | partial | T13 native open shell area=200; per-command UI exercise pending |
| A13 | partial | T08/T09 native + free open extrusion browser; full Loft generation linkage pending |
| A14 | partial | T24 negative nonplanar exact shape + native asset round-trip + browser creation; all edit modes pending |
| A15 | not-run | Self-intersection warning / continuation policy needs implementation |
| A16 | partial | typed Fillet failures + lastValid + parameter/target repair; failure location diagnosis incomplete |
| A17 | partial | T19/T20 real Boolean empty and unchanged numerical results; UI empty messaging pending |
| A18 | partial | Untrim/Offset/Reverse operators exist; actual Trim->Untrim scenario not implemented |
| A19 | partial | Real exact-asset Library/history insertion and recovery browser flow; broader open-face/multi-shape OS cases pending |
| A20 | partial | Typed ID remap unit test + real rectangle history insertion; multi-feature dependent closure E2E pending |
| A21 | partial | browser v2 exact assets/reopen + native T25 subset; other environment/macOS portability untested |
| A22 | partial | legacy JS/Python/browser regression suite; real GH/OS integration untested |
| A23 | partial | R01/R02/R03 injected transport race tests; real drag load untested |
| A24 | partial | explicit B-rep generation input binding browser + vault/XYZ unit tests; branch isolation/recompute preservation pending |
| A25 | not-run | immutable command registry exists; explicit version upgrade/rollback UI pending |
| A26 | partial | 1280x800 Library/recovery browser and reachable panels; all shortcuts/VoiceOver/drag combinations pending |
| A27 | partial | original UI/code, vendor notice retention, actual OCP/VTK wheel texts; full distribution/license audit unfinished |
| T01 | passed | native test_T01_rectangle_center + browser center/width/save/Undo |
| T02 | partial | three-point orthogonal adapter unit test; real native fixture/save test pending |
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
| T19 | passed | real Boolean volumes1500/500/500; result kind checked |
| T20 | passed | real disjoint intersection empty; difference1000 unchanged |
| T21 | passed | real native inward shell, removed top, volume8000-18*18*19 |
| T22 | partial | finite-domain Untrim kernel test; Trim itself pending |
| T23 | not-run | 未実装または未検証。合格としない。 |
| T24 | passed | real negative nonplanar curve persisted; CAD browser free 3D creation |
| T25 | partial | runtime destroyed/new instance: curve+solid exact hash/bounds/length/volume; open shell+NURBS exhaustive trim/parameter proof pending |
| R01 | passed | cad-jobs.test.mjs: delayed old preview ignored and released |
| R02 | passed | cad-jobs.test.mjs: unrelated revision does not discard a valid result |
| R03 | passed | cad-jobs.test.mjs: Undo cancels old job and restores original state/revision |
| R04 | partial | Rust Session real hard-kill test passes; full Tauri/macOS recovery not run |
| R05 | partial | Corrupt asset prepare cannot replace current document (job test); real native hash/byte rejection; full OS dialog flow untested |
| R06 | passed | Work-order user command project reopened in fresh page after global command definitions were removed; exact geometry restored |
| R07 | partial | alias collision unit test; import collision UI pending |
| R08 | partial | Browser recovery restores real assets and history; failed feature + lastValid saved in v2; complete failed-draft restart matrix pending |
| R09 | partial | existing representative JS fixtures + browser regressions; complete legacy asset matrix pending |
| R10 | partial | split marks source body split/pending; explicit binding candidate UI pending |

## 2026-10-21 checkpoint results (historical)

For the latest run, use [cad-development-log.md](cad-development-log.md).
Phase 0 reran JS (155 passed) and pinned OCP (35 passed, 2 skipped);
browser assertions and Rust compilation/tests were blocked by the local environment.
Do not carry the historical browser/Rust successes forward as current evidence.

- JavaScript: 155 passed (including transport-race tests, not geometry proofs).
- Python: 37 discovered, 35 passed, 2 optional NVIDIA USD tests skipped.
- Packaged browser: **21 passed** (7 CAD real-kernel scenarios + 14 existing regressions).
- Rust Session: 4 passed against the extracted production transport and real Python child processes. Full Tauri/macOS compilation remains unexecuted here.
- No real AI generation, Rhino session or printer transmission was performed.
