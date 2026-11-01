Warning: truncated output (original token count: 44624)
Total output lines: 2151

# 独立版Pathloom CAD 開発ログ

方針・構成・監査結果は[cad-master-plan.md](cad-master-plan.md)、次の実装は[cad-roadmap.md](cad-roadmap.md)。
実行していないものを成功と記録しない。以下の不具合再現は製品の合格テストではない。

## 2026-10-26 JST — Phase 0監査

### 対象と変更範囲

- リポジトリ：`usagicraftlab/pathloom`。clone後、`git ls-remote origin refs/heads/main`で
  `0a5b5670dc1d4afb2024682f8030885529835b8b`を照合した。
- commit日時：2026-10-21 23:13:52 JST。件名：`Add exact CAD workspace with editable history and portable assets`。
- 作業ブランチ：`docs/cad-phase0-audit-20261026`。初期作業ツリーに変更なし。
- trackedファイル内に`AGENTS.md`は見つからなかった。
- 新規3資料と既存台帳・READMEの参照を更新。製品コード・テスト・lockfile・CIは変更しない。
- 調査した資料：CAD仕様v2.0、コマンド台帳、A/T/R台帳、実装メモ、README、
  maintenance/AI CADの経緯、設計憲法、第三者表示。現況は該当コードと今回の実行結果を優先する。

### 環境

| 項目 | 値 |
| --- | --- |
| OS | Linux x86_64、kernel 6.18.55、glibc 2.39 |
| Node / npm | v24.22.1 / 11.9.0（既存CIはNode 20） |
| Python | 3.12.14 |
| 初回のホストOCP | `cadquery-ocp 7.8.1.1.post1`、VTK 9.3.1 |
| 指定版の再検証 | `npm run cad:setup`で`.pathloom-runtime/python`を作成。`cadquery-ocp==7.8.1.1`、OCP表示7.8.1.1、VTK 9.3.1 |
| OCCT版 | 現行helloで`occtVersion=null`。OCPの版から推定しない |
| Rust/Cargo | 未導入。`rustc`/`cargo`が見つからない |
| Playwright | lockfileによる1.64.1。対応Chromium/headless shell未導入、取得失敗 |

### 実行結果

| ID | 実行コマンド / 確認 | 結果 | 根拠の範囲 |
| --- | --- | --- | --- |
| L01 | `npm ci` | 成功・exit 0、11 package追加 | lockfileによる依存導入。製品の起動確認ではない |
| L02 | `npm test` | 成功・exit 0、155件成功、失敗0、skip0、約2.76秒 | 既存JS全体。CAD文書/参照/ソルバー/レース、既存生成/保存/出力等。すべてのCAD操作の完成を証明しない |
| L03 | `python -B -m unittest discover -s native -p 'test*.py'` | exit 0、37件中35成功・2skip、約1.90秒 | ホストの7.8.1.1.post1。後述L05の指定版で再確認 |
| L04 | `npm run cad:setup` | 成功・exit 0 | 本監査Linux環境で指定Python/OCPを用意。macOSの初期セットアップの証拠ではない |
| L05 | `npm run test:cad-native` | exit 0、37件中35成功・2skip、約1.48秒 | 指定7.8.1.1、実OCCT。2skipは任意NVIDIA USD/pxr経路。通常CAD成功数へ加えない |
| L06 | `npm run desktop:prepare`（L08の前処理） | 成功 | 配布用frontend作成。Tauri/.appのbuildではない |
| L07 | `npx playwright install chromium`、続けて`npx playwright install --only-shell chromium` | 両方失敗・exit 1 | 取得したarchiveで`End of central directory record signature not found`。原因をアプリコード不具合と断定しない |
| L08 | 下記packaged browserコマンド | 環境ブロック・exit 1 | 21件検出。最初のlaunchが実行ファイル不在で失敗、残り20件未実行。UI assertion成功0 |
| L09 | `cargo test --manifest-path src-tauri/Cargo.toml --locked` | 環境ブロック・exit 127 | `cargo: command not found`。Rustのコンパイル/テストは未実行 |
| L10 | レジストリ/native一覧照合 | 43登録＝仕様ID42＋Move1、native45、登録側の未定義演算0 | native-onlyは`surface.extract`/`surface.split`。全演算のfixture監査ではない |
| L11 | AUD-001追加プローブ | 再現成立・未修正 | 実Python/OCP形状、資産転送の待機だけ注入。初回と指定版で同じ不整合 |
| L12 | AUD-002〜004追加プローブ | 3件とも再現成立・未修正 | 実Runtimeによる演算。初回と指定版で再現 |
| L13 | mainのGitHub combined statuses / commit workflow取得 | `statuses=[]` / `workflow_runs=[]` | 成功/失敗は未確認。workflow取得ツールはPR起動分・先頭ページに限定される。push CIが存在しないとは結論しない |
| L14 | 資料内の2つの再現コードを抽出して実行、相対リンク・65行台帳の列数・`git diff --check`を検査 | 成功 | 記載コードでもAUD-001〜004を再現。変更差分はMarkdownのみ |
| L15 | `npm exec --yes --package=node@20.20.2 -- node --test tests/*.test.mjs` | 失敗・exit 1、41報告中23成功・18失敗 | PR CIのAUD-007をローカル同版でも再現。Clipperの`navigator is not defined`。一部モジュールが読込失敗のため155件すべてを実行した結果ではない |

L03とL05は同じ37テストの環境を変えた実行であり、74件の独立した受け入れ条件には数えない。
過去の台帳の「ブラウザ21成功」「Rust Session抽出4成功」は2026-10-21時点の記録である。
このローカル実行ではブラウザもRustも合格確認できていない。

上記はローカル結果。その後のPR CIでRust crateの合格が得られたため、次節に分けて記録する。

L08で使用したコマンド（`PATHLOOM_BREP_PYTHON`は当時のホストPython、以後は指定版を使用）：

```sh
PATHLOOM_FRONTEND_DIR=desktop-dist \
PATHLOOM_BREP_PYTHON=/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python \
npm run test:browser -- --max-failures=1
```

エラーは`browserType.launch: Executable doesn't exist ... chromium_headless_shell-1248/...`。
既存CAD browser fixtureは実Python daemonを呼ぶが、Tauri IPC・OS保存はmockで、
`cad_cancel`はno-op。実行できてもRust監督・macOS保存/復旧の証拠にはならない。
既存21件の内訳はCAD 7、既存操作/AI/出力回帰14（パラメータ化を含む）。

### PR作成後のCI結果と追加発見

[PR #1](https://github.com/usagicraftlab/pathloom/pull/1)のhead
`c3ff84ca77ef8d88728174a541ec259702f5a405`に対する
[run 40303764151](https://github.com/usagicraftlab/pathloom/actions/runs/40303764151)。
製品コード・依存・CI設定は監査基準mainと同一。下記ジョブの完了後ログを読み取った。

| ジョブ / ID | 結果 | 確認できたこと / 限界 |
| --- | --- | --- |
| native-cad / 121507711501 | 成功 | 指定OCP 7.8.1.1、37件中35成功・2skip。約1.43秒 |
| rust-and-macos / 121507711545 | 成功 | macOS arm64、Rust 1.99.1。`cargo test --manifest-path src-tauri/Cargo.toml --locked`でcrate全体をコンパイル、21成功・失敗0・ignored0。CAD Session4件/プロセス監督5件等を含む。GUI IPC、.app/.dmg生成、Finder起動は実行しないジョブ |
| javascript-and-browser / 121507711865 | 失敗 | Node 20.20.2、`npm test`で41報告中23成功・18失敗。`navigator is not defined`。後続のPython準備/Chromium導入/browserはskip |

**AUD-007（P1）**：`cad-components.js`→`vendor/clipper/clipper-browser.js`がブラウザ版ClipperをESMとして読み、
`clipper-env.js`は`self`のみ補完する。`clipper.js:95`の`navigator`参照がNode 20で失敗する。
Node 24のローカルでは`typeof navigator === 'object'`であり、同じエラーを検出できなかった。
対応宣言`Node >=20`と既存CIに合わせ、P1-00で読込環境を修正する。Phase 0では修正しない。

このCIは全体合格ではない。macOSのRust単体成功とmacOS GUI/OS統合の未確認を区別する。
mainの過去CIについてのL13の「未確認」も、今回のPR CI成功/失敗と混同しない。

### 追加プローブの観測値と原因

| 問題 | 入力/タイミング | 観測値 | 読んだ実装 |
| --- | --- | --- | --- |
| AUD-001 | Rectangle幅60を確定→70へ編集→そのexport応答を待機→80へ編集→待機解除 | `parameterWidth=80`、`actualWidth=70`、`status=valid`、`requestedHash=null`。snapshotも`valid/80`を保持 | `cad/store.js::runRecompute`の結果検証後の`await native.exportAssets`と結果適用 |
| AUD-002 | 10³ mm³のBox A(x=0), B(x=20), 工具C(x=5)。単一対象と複数対象を比較 | A-C≈500、B-C≈1,000、合計≈1,500。しかしarguments=[A,B]の結果は≈500のみ | `native/cad_operations/__init__.py`のBoolean分岐、`rest=args[1:]+tools`。D02入力のmaxCountはnull |
| AUD-003 | 同じ10³ mm³ Boxを同じx=5平面で2回Split | どちらも約500 mm³が2個。slotは毎回新規UUIDで共通slot 0 | nativeのsplit出力UUID、Storeの`oldSlots.get(output.slotKey)`とretired処理。後段参照喪失はこの対応処理から判断 |
| AUD-004 | XY長方形60×40、Offset1/miter、不正planeのx/y軸とも[0,0,0] | `status=ok`、診断0、bbox min[-31,-21,0]/max[31,21,0] | E06 defaultsにplaneがあるがnative curve.offsetはplaneを参照・検証しない |

AUD-001はRust/Tauriを通していない。実形状はPython daemonで計算し、
JS Storeのexport待機のタイミングだけを制御した再現である。macOSで同じタイミングが自然発生する頻度は測っていない。
AUD-002の1,500 mm³は「複数の元形状それぞれから工具を引く」契約の期待値。
契約を単一対象に限定するなら、現在の複数入力の受理を明示的なエラーへ変える必要がある。

### 再現用コード

以下は監査時の一時プローブを再実行できる形で記録したもの。製品コードや恒久テストへの追加は行っていない。
作業ディレクトリはrepo root。監査基準SHAと指定OCPで実行する。
修正後は期待する不具合が再現しなくなるため、観測値を見直す。

AUD-001：実OCCT daemonを使い、exportの戻りだけを遅延させる。

```sh
node --input-type=module <<'JS'
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {CadStore} from './cad/store.js';
import {commandById} from './cad/commands/registry.js';
import {createCommandSession} from './cad/commands/session.js';
const child=spawn('.pathloom-runtime/python/bin/python',
  ['-B','-u','native/cad_runtime.py'],{stdio:['pipe','pipe','pipe']});
child.stderr.on('data',()=>{});
let serial=0,hold=false,entered,release;
const waiting=new Map();
createInterface({input:child.stdout}).on('line',line=>{
  const r=JSON.parse(line),p=waiting.get(r.id);waiting.delete(r.id);
  r.ok?p.resolve(r.result):p.reject(new Error(r.error.message));
});
const rpc=message=>new Promise((resolve,reject)=>{
  const id=++serial;waiting.set(id,{resolve,reject});
  child.stdin.write(JSON.stringify({...message,id})+'\n');
});
const native={runtimeEpoch:1,workspaceEpoch:1,
  async start(){return {...await rpc({type:'hello'}),runtimeEpoch:1}},
  evaluate(request){return rpc({type:'evaluate',request:{...request,
    protocolVersion:1,requestId:String(++serial)}})},
  importAsset(hash,asset){return rpc({type:'import',hash,asset})},
  async exportAssets(handles){const r=await rpc({type:'export',handles});
    if(hold){hold=false;entered();await new Promise(r=>{release=r})}
    return r.assets},
  release(handles){return rpc({type:'release',handles})},
  cancelAll(){this.workspaceEpoch++}
};
const timer=setTimeout(()=>{child.kill();process.exitCode=1},15000);
try{
  const store=new CadStore(native);
  await store.add(createCommandSession(commandById('C04')));
  const f=store.document.features[0];
  const pause=new Promise(r=>{entered=r});hold=true;
  const first=store.edit(f.id,{...f.parameters,widthMm:70});
  await pause;
  const second=store.edit(f.id,{...f.parameters,widthMm:80});
  release();await Promise.all([first,second]);
  const e=store.document.entities.find(e=>e.producer.featureId===f.id);
  console.log({parameterWidth:f.parameters.widthMm,
    actualWidth:e.bbox.max[0]-e.bbox.min[0],status:f.status,
    requestedHash:f.requestedHash,snapshotStatus:(await store.snapshot()).features[0].status});
}finally{clearTimeout(timer);child.kill()}
JS
```

AUD-002/003/004：native Runtimeの直接呼出し。

```sh
.pathloom-runtime/python/bin/python -B <<'PY'
import sys
sys.path.insert(0,'native')
from cad_runtime import Runtime,TOLERANCES
r=Runtime()
xy=dict(origin=[0,0,0],xAxis=[1,0,0],yAxis=[0,1,0])
def run(op,p,inputs=None):
    return r.handle(dict(type='evaluate',request=dict(protocolVersion=1,
        operation=dict(id=op,version=1),parameters=p,
        inputs=inputs or {},tolerances=TOLERANCES)))
def out(reply):
    assert reply['status']=='ok',reply
    return reply['outputs'][0]
def ref(s):return dict(handle=s['handle'],geometryHash=s['geometryHash'])
def box(x):return out(run('solid.box',dict(plane=xy,anchorMode='corner',
    anchor=[x,0,0],widthMm=10,depthMm=10,heightMm=10)))
a,b,c=box(0),box(20),box(5)
for targets in ([a],[b],[a,b]):
    o=out(run('solid.difference',{},dict(arguments=[ref(s) for s in targets],tools=[ref(c)])))
    print('difference',len(targets),o['summary']['volumeMm3'])
rect=out(run('curve.rectangle',dict(plane=xy,anchorMode='center',anchor=[0,0,0],
    widthMm=60,heightMm=40,rounding=False,cornerRadiusMm=1)))
bad=dict(origin=[0,0,0],xAxis=[0,0,0],yAxis=[0,0,0])
o=run('curve.offset',dict(plane=bad,distanceMm=1,joinStyle='miter'),dict(curve=[ref(rect)]))
print('invalid-plane',o['status'],o['diagnostics'])
yz=dict(origin=[5,0,0],xAxis=[0,1,0],yAxis=[0,0,1])
cutter=out(run('surface.plane',dict(plane=yz,anchorMode='corner',
    anchor=[5,-5,-5],widthMm=20,heightMm=20)))
replies=[run('solid.split',{},dict(targets=[ref(a)],cutters=[ref(cutter)])) for _ in range(2)]
slots=[{s['slotKey'] for s in q['outputs']} for q in replies]
print('split-output-counts',[len(s) for s in slots],'shared-slots',len(slots[0]&slots[1]))
PY
```

### 監査後の扱い

一時ログ/プローブはignoredな`work/cad-phase0/`に置いた。再開に必要な結果とコードは本書に残している。
Phase 0のPRは資料だけを含み、上記4件とPR CIで発見したAUD-007は未修正のままPhase 1へ引き継ぐ。
未実施のmacOS項目はロードマップM01〜M07を参照。実AI推論、実Rhinoセッション、
プリンター送信・印刷は実施していない。mainへのマージは行わない。

## 2026-10-26 JST — Issue #4 / P1-01 単独ブランチの実行結果

対象：`fix/4-aud-001`。基準main `716a155fad5b50a2e1501bb08f078456dfb862c1`。
PR #2の統合ブランチの成功数は流用せず、切り出したStoreと回帰fixtureで再実行した。
Linux x86_64 / Node24.22.1、Node20.20.2 / Python3.12.14 / pinned OCP7.8.1.1。

| コマンド / 検査 | 結果 | 確認した範囲 |
| --- | --- | --- |
| `node --test tests/cad-jobs.test.mjs` | exit0、17成功/0失敗/0skip | export中の70→80、Undo/削除/Open/上流変更、無関係revision、初期化/import/native epoch競合、古い上流依存jobのevaluate/export失敗、handle解放 |
| `npm test`（Node24） | exit0、166成功/0失敗/0skip、約2.27秒 | 既存JS全体＋#4の11追加fixture。transport raceは形状数値の証拠と区別 |
| `npm exec --yes --package=node@20.20.2 -- node --test tests/cad-jobs.test.mjs` | exit0、17成功/0失敗/0skip | #4の競合fixtureをNode20で再検証 |
| Node20の全JSおよびCAD関連2ファイル | 全体は50報告中32成功/18失敗、2ファイルは16報告中15成功/1失敗、exit1 | いずれも#3の`navigator is not defined`でモジュール読込が失敗。最初の#4 fixture15件時点の実行であり、全166件を実行した結果ではない。#3は本ブランチで修正しない |
| 下記packaged frontend browser | exit0、21成功/0失敗/0skip、約55.2秒 | 実OCCTの既存CAD7＋操作/AI/出力14。Tauri transport/OS保存/cancelは置換。後から加えた古いエラー応答のguardはJS fixtureで確認 |
| 本ログPhase0のAUD-001実OCCTプローブを同じstdinコードで再実行 | exit0、`parameterWidth=80 / actualWidth=80 / status=valid / requestedHash≠null / snapshotStatus=valid` | Python daemonの実長方形。遅延はexport応答だけに注入 |
| 新しいexport競合fixtureを基準mainの`cad/`に適用して実行 | 意図した失敗、exit1、成功0/失敗1 | 旧実装では80の最新再計算がキューに現れず`0 !== 1`。修正後に同fixtureが成功することを確認 |
| `git diff --check`・資料相対リンク/台帳列数・Issue外ファイルの差分検査 | 成功。製品変更1ファイル、race fixture1ファイル、資料3ファイル。相対リンク7件/65行を照合 | 変更範囲の照合 |

browserコマンド：

```sh
PATHLOOM_FRONTEND_DIR=desktop-dist \
PATHLOOM_BREP_PYTHON=.pathloom-runtime/python/bin/python \
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tmp/pathloom-chromium \
npm run test:browser -- --max-failures=1
```

テスト環境の初回試行では、前セッションの一時Python executableとChromiumが消えており、
実OCCTプローブは`spawn ENOENT`、browserはlaunch不能だった。`cad:setup`も既存venv内の
executable欠落で失敗した。ignoredなvenvのinterpreter linkを復旧し、`cad:setup`を再実行して
OCP7.8.1.1を確認後にプローブを成功させた。Chromium153.0.8010.0は既存のignoredな
`@sparticuz/chromium` archiveから再展開した。これらは環境復旧であり製品変更ではない。
macOS GUI、実Tauri IPC、OS保存/回復、Rustはこのブランチのローカル環境では未実行。

Issue #4のhead `33a3b33629ed7126eb8ca065829793c82e04dcc1` に対する
[Draft PR #25](https://github.com/usagicraftlab/pathloom/pull/25)の
[CI run 40330298899](https://github.com/usagicraftlab/pathloom/actions/runs/40330298899)を確認した。

- javascript-and-browser / 121597620816：失敗。Node20で52報告中34成功/18失敗、
  `ReferenceError: navigator is not defined`（#3）。後続Python準備/Chromium/browserはskip。
  全166件を実行・成功した結果ではない。
- native-cad / 121597621275：成功。指定OCP7.8.1.1、37件中35成功/2 optional USD skip、約1.68秒。
- rust-and-macos / 121597621311：確認時はcargo test進行中。完了・成功としては記録しない。

## 2026-10-26 JST — Issue #4：#3先行反映後のrebaseと全JS再検証

ユーザー指定の反映順に従い、PR #26（#3）のmain取り込みを確認してから、
`fix/4-aud-001`の2コミットをmain `f87a19562c62d5f76f1e3b2ee5237ccbfe383b23`上へrebaseした。
PR #26のマージとIssue #3のクローズはGitHub上の状態として確認したもので、
この分離・検証作業からマージ操作やIssueの手動クローズは実行していない。

再検証したheadは`9ea12d6bf1867dfa85d1e188ba2e65dce95d0e10`。
旧`33a3b336`→`03dc4e51`、旧`935765ca`→`9ea12d6b`へ載せ替えた。
mainとの差分は従来の5ファイル・+434/-61のままで、
旧headと比較した製品・テスト・既存資料の内容は不変。mainから継承したClipper補完だけが異なる。
本節の追記は検証記録だけの変更である。

| コマンド / 検査 | 結果 | 範囲 |
| --- | --- | --- |
| `npm exec --yes --package=node@20.20.2 -- node --test tests/*.test.mjs` | exit0、166成功/0失敗/0skip、約3.57秒 | #3反映後の全JS。#4の17競合fixtureを含む |
| `node --test tests/*.test.mjs`（Node24.22.1） | exit0、166成功/0失敗/0skip、約2.58秒 | 同じ全JSを別の対応Node版で再実行 |
| `git diff --check`、rebase前後の内容比較 | exit0。旧headとの差分は`vendor/clipper/clipper-env.js`のみ | #3はmainから継承し、#4自身の差分へ混ぜない |

Node20全体の保留は解除した。上の旧失敗記録は#3反映前の履歴として残す。
rebase後の[CI run 40333257982](https://github.com/usagicraftlab/pathloom/actions/runs/40333257982)
は全3ジョブが成功した。

- javascript-and-browser / 121607940046：Node20の全166件成功、browser全21件成功。
- native-cad / 121607940281：37件検出、35成功/2 optional USD skip、約1.69秒。
- rust-and-macos / 121607940191：Rust21件成功、frontend準備・コンパイル・単体テスト成功。
  このPRはmacOS .app/.dmg生成ステップを追加していない。

PR #26単体のbrowserは別runで19成功/2失敗だった。このrunの成功を過去の失敗の
原因解明や修正完了の証拠に置き換えず、コマンド保存通知とidle viewport描画の失敗記録は
PR #26に残している。本作業で当該テストの変更や再試行による合格化は行っていない。
macOS GUI/実Tauri IPC/OS保存・回復は本作業では実施していない。
PR #25はユーザー承認までDraft・未マージを維持する。

## 2026-10-27 JST — Issue #5 / P1-02 / AUD-002 複数対象Difference

実装担当Aの範囲はIssue #5のみ。着手前にIssue本文、PR #25本文とIssue #4の完了報告を読み、
PR #25のマージ `4a22c588b233d857101086235389c35565eac5b9` を確認した。
この最新mainから `fix/5-aud-002` を新規作成。PR #2のDifference関連差分は参考として読み、
cherry-pick/mergeせず、独立した実装とfixtureを作成して再実行した。
本書の上のPR #25「未マージ」は当時の記録であり、この着手時点の状態ではない。

### 契約・変更範囲

- 対象ID：P1-02/AUD-002、D02、A17/A21、T19/T20。#4のrace17件もJS全体に含めて再実行。
- 入力モード：`default` / `direct.v1`、独立したwhole-solidの `arguments` と全対象に適用する `tools`。
  各対象から全工具を順に引き、対象の順序に対応する残形状を1出力ずつ返す。空結果もslotを保持し、
  1対象の残形状が分断されれば全片をcompoundの正本に保持する。
- 工具保持：`keepTools=false` が既定で、従来どおり表示上の工具bodyを消費し、正本/履歴は保持。
  trueでは工具を残す。設定の再変更・工具再選択は工具bodyだけを再評価し、別featureの消費を尊重する。
  消費した工具を複数対象の「Split元」としては扱わない。
- nativeの順序付き出力をStoreで対象entity IDに対応付け、並び替えで出力entityを交換しない。
  各出力bodyは対象bodyを継続する。D02の計算hashには対象/工具のentity参照も含め、
  同じ正本の別entityへの変更が古いcacheをそのまま採用しないようにした。
- 未対応のモード/パラメーター、subshape入力、重複refは明示拒否。同じbodyの履歴形状を
  複数対象として選ぶ操作は演算前に拒否。nativeは立体入力を検査し、Booleanが返す
  単一solidのwrapperは許可するが、複数solidのcompound入力は拒否する。
- 共通ファイルはD02のregistry/default、sessionの検証呼出し、StoreのD02結果/工具処理、
  workspaceのD02ラベル/checkbox、およびnativeのDifference分岐だけを変更。
  補助処理は `cad/difference.js`、fixtureは新規3ファイルへ分離した。
  `native/cad_runtime.py`、`cad/history.js`、Split分岐、binding UI、CI/配布設定は変更していない。
  #6担当Bのブランチ・PR、およびMuse担当/Phase2以降には変更を加えていない。

### 互換性

command/operation ID・version・文書schema/version・単一対象の `result` slotは維持。
既存のパラメーター `{}` は `keepTools=false` として扱い、既存featureにもcheckboxを表示する。
成功時の `lastValid.differenceKeepTools` は工具の表示を再評価するための任意の補助値であり、
正本形状の形式は変えていない。
複数対象では誤った旧 `result` 1個から、対象entity別slotへ変わる。旧結果への下流参照を
推測で別の対象に割り当てず、旧slotが失われた参照は既存の再選択診断に従う。
旧保存ファイルの既存計算結果は読込時には強制更新せず、再計算でこの修正を適用する。
一般的な履歴削除/抑制・全body/bindingの再構築は本Issueの完了主張に含めない。

### 実測と環境

Linux x86_64 / Node24.22.1、Node20.20.2 / Python3.12.14 / OCP7.8.1.1 /
Chromium153.0.8010.0（ローカルのpackaged frontend）。

| コマンド / 検査 | 結果 | 確認した範囲 |
| --- | --- | --- |
| 修正前mainの製品コードに新規 `test_cad_difference.py` だけを追加して実行 | 5検出・1成功/4失敗、subtestを含む失敗assertion7件、exit1 | 2対象に1出力しかない、複数工具/混合empty/未対応設定の問題を再現。後で正本往復fixtureの件数assertも強化した |
| `python -B -m unittest discover -s native -p 'test_cad_difference.py' -v`（native修正直後） | exit0、5成功 | A-C500、B-C1000、合計1500、複数工具1000、非接触/空/混合、分断残形状800、入力正本不変、正本export/new Runtime import、未対応入力拒否 |
| `npm test`（Node24.22.1、最終製品コード） | exit0、171成功/0失敗/0skip、約2.71秒 | 新規D02契約5件と既存全体。#4の17 race fixtureを含む |
| `npm exec --yes --package=node@20.20.2 -- node --test tests/*.test.mjs`（最終製品コード） | exit0、171成功/0失敗/0skip、約4.28秒 | 同じ全JSをNode20でも再実行 |
| `python -B -m unittest discover -s native -p 'test*.py'`（最終製品コード） | exit0、42検出・40成功/任意USD2skip、約2.37秒 | pinned OCPで新規Difference5件と既存native全体。単一solid wrapperからのDifference連鎖も確認 |

browserの実行コマンド：

```sh
PATHLOOM_FRONTEND_DIR=desktop-dist \
PATHLOOM_BREP_PYTHON="$CODEX_PRIMARY_RUNTIME_PYTHON" \
PLAYWRIGHT_CHROMIUM_EXECUTABLE="$PWD/work/chromium-local/chromium" \
npm run test:browser -- --max-failures=1
```

新規browser3件は、対象/工具選択、複数残形状、工具保持on/off、Undo/Redo、
fresh-page v2再読込、単一500/非接触1000/空0/混合emptyの保存・再読込、
対象並び替え時のentity ID保持、工具再選択後の旧工具復帰を扱う。
実OCCTの演算と正本を使うが、Tauriイベント/OS保存ダイアログ/保存先はテストtransportに置き換える。

初期の環境・fixture失敗も成功扱いせず記録する。

- `npx playwright install chromium` は取得zipが破損扱いとなり失敗。
  ignoredな `@sparticuz/chromium@153.0.0` を `--no-save --package-lock=false` で取得したが、
  標準展開はこの環境のchownでEINVALとなった。ローカル専用archiveをNodeのBrotliとPythonの
  所有者変更を行わないtar展開で復元した。依存定義/lock/製品設定は変更していない。
- 最初の新規browser限定実行は1成功/1失敗/1未実行。fixtureが追加前のBoxのvalid表示を拾い、
  作成中の仮slotを読み取っていた。履歴の件数増加と新featureの完了を待つよう修正した。
- 次の限定実行は2成功/1失敗。数値配列の `.sort()` を文字列順で比較するfixtureの誤りを修正し、
  `.sort((a,b)=>a-b)` とした。製品の結果は500と1000で正しかった。
- その後の全browserは24成功/0失敗（約1.1分）。最後に同一bodyの重複対象拒否を追加したため、
  最終製品コードに対して全JS/native/browserを再実行した。最終browser/CIの結果は下に追記する。

### 未実施・次の開始地点

ローカルRust/macOS GUI、実Tauri IPC、OSの保存/回復ダイアログ、配布物生成、
実AI/Rhino/プリンターの実行は未実施。既存CIはPR作成後に別途確認し、
未完了や失敗を全体成功として記録しない。
次は#5単独Draft PRの照合とユーザー承認待ち。#6以降の実装には進まない。
mainへのマージとIssueの手動クローズは行わない。

### 最終ローカル確認

上記browserコマンドを最終製品コードで再実行し、全24件成功/0失敗/0skip、約1.2分。
新規Difference3件と既存CAD7件/操作回帰14件が含まれる。
Node24/Node20の171件、native42検出・40成功/2skipも同じ最終製品コードでの結果である。
ブラウザの標準インストール失敗、展開のchown失敗、初期fixtureの2回の失敗は上記の履歴として残す。
Python側にBrotliモジュールがなかったため、archiveのBrotli復元はNode標準機能で行った。

`git diff --check` はexit0。機能台帳65行の順序/列数とD02だけの行変更、資料の相対リンク9件、
許可した12ファイルだけの変更を照合した。package/lock・native runtime・Split・history・CIは差分なし。

### 実装headのGitHub CI

実装head `616a8fb861b4dccd79227deea99d49ac2b98bd4a` に対する
[PR #27](https://github.com/usagicraftlab/pathloom/pull/27) の
[CI run 40408830985](https://github.com/usagicraftlab/pathloom/actions/runs/40408830985) は全3ジョブ成功。

- javascript-and-browser / 121873528493：Node20の全171件成功・失敗0/skip0、
  CIでインストールしたChromiumによるbrowser全24件成功（約2.0分）。
- native-cad / 121873529001：OCP7.8.1.1、42検出・40成功/任意USD2skip（約1.26秒）。
- rust-and-macos / 121873528902：frontend準備・コンパイル・Rust21件成功（テスト約0.37秒）。
  .app/.dmg生成やGUI操作を行うworkflowではないため、それらの成功とは記録しない。

この節の追記は開発ログだけで、製品コード・fixtureは上記実装headから変更していない。
追記後headのCIは別runとしてPR本文・Issue #5に結果を記録する。
Draftと未マージを維持し、Issue #5は手動クローズしない。

### Issue #7（P1-04 / AUD-004）平面指定の処理・検証（2026-10-27、担当：Muse）

PR #2（分離元）の #7 相当差分を棚卸しし、最新mainから `fix/7-aud-004` へ分離した。
PR #2 の同ファイルにある他Issue分（Difference／Split 等）は持ち込んでいない。

- `plane()` に構造検証を追加：原点・X軸・Y軸が欠けた平面は `CAD_INPUT_TYPE`。
- `curve.offset` の設定スキーマを検証：対応は plane／distanceMm／joinStyle のみ。
  未知設定は `CAD_SCHEMA_UNSUPPORTED`、必須欠落は `CAD_INPUT_MISSING`（黙って無視しない）。
- Offset 本体が指定平面を実際に使うよう変更：曲線を指定平面の局所座標へ変換し、
  平面からのずれが許容誤差を超える場合は `CAD_INPUT_TYPE`（回復操作つき）。
  平面の法線方向と開曲線の扱いも平面基準に統一した。
- fixture を `native/test_cad_offset.py` に新設（3件）：
  XY／XZ／YZ／任意平面での数値結果、距離符号（+1→208、-1→192）、round（200+2π）／miter の差、
  零軸（CAD_INPUT_DEGENERATE）、平面不一致・非平面曲線（CAD_INPUT_TYPE）、未知設定（CAD_SCHEMA_UNSUPPORTED）、
  開曲線の法線方向と開いた結果の保持。
- ローカル検証（Python 3.12 / cadquery-ocp 7.8.1.1、実OCCT）：
  新規3件成功。native 全体は45検出・43成功/任意USD2skip で回帰なし。
  修正を外した main 相当では新規 fixture が3件中2件失敗し、不具合の再現を確認した。
- 汎用CAD全体への平面制約は追加していない（制約は Offset の入力検証の範囲のみ）。
- GitHub CI の結果は PR 本文へ別途記録する。macOS GUI／実Tauri は未実施。

## 2026-10-27 JST — Issue #6 / P1-03 / AUD-003（実装担当B）

着手前にIssue #6本文、PR #25本文と上の完了報告を読み、GitHubでPR #25の
`merged=true`、merge `4a22c588b233d857101086235389c35565eac5b9` を確認した。
同じ最新mainから `fix/6-aud-003` を作成。PR #2は参考として差分を読んだが、
一括cherry-pick・ファイル全体の採用は行っていない。#5担当Aのブランチ/PRは変更していない。

### 契約と変更範囲

- 対象ID：D04、P1-03/AUD-003、A08/A20/A24/R10の該当する部分。
  入力はD04の複数targets/cutters選択・replace、nativeのsolid/surface Split、
  entity/subshape参照、body-result生成binding、v2保存と履歴付きShape Library。
- nativeは各targetの由来を保持し、slotを `operation/source entity ID/exact asset hash`
  で識別する。同じ位置の複数targetも区別する。同一source/hashだけentity/bodyを継承する。
  出力順序・ordinal・近傍・体積類似では再接続しない。由来重複/途中publish失敗時は
  今回生成したhandleのみ解放し、入力cacheとlastValidを保持する。
- Storeの新しいSplit専用helperにslot照合、sourceごとのbody候補、消失出力の候補更新、
  抑制/削除時のsource復旧を集約した。cuttersは消費しない。cached再計算でも同じpolicyを使う。
  他のSplitが同じsourceを使用している場合は、その候補を保持して元形状へ戻さない。
- 消失entityへの参照はunresolved/blockedにし、候補を保存する。生成bindingも未解決にして
  候補bodyを提示する。明示的な参照再選択と同型の生成参照修復で、既存binding IDを維持する。
  unchanged exact assetのsubshapeは、featureのhashが変わっても同じtopology IDを確認できる。
- Shape Libraryではsource ID、slot key、producer、lastValid snapshot、body候補を型付きで
  再割当する。ユーザーのparameter文字列やasset hashは書き換えない。
- 共通ファイルの変更は `cad/store.js` のSplit解決/採用/body/binding、
  `cad/workspace-ui.js` の生成参照修復ボタン、`cad/references.js` のexact asset照合、
  `cad/shape-library.js` のSplit再割当、nativeのSplit分岐とpublishの失敗片付けだけ。
  `cad-pipeline.js` は保存検証のbinding状態に `split` を追加する1行だけ。
  browserの共通specはAUD-003の新規1ケースを追加し、既存ケースは変更しない。
  `cad/history.js`、Difference、Offset、Muse担当範囲、Phase 2以降、`ci.yml`は変更しない。

### 互換性と継承の限界

command ID、operation version、CAD schemaVersion=1、project v1/v2、正本asset形式は維持。
sourceKeyはSplitのtargetsだけへ送り、要求hashへ含めるため、旧Splitのcacheは再評価される。
旧UUID slotは「targetが1つ・exact asset一致が一意」の場合だけ移行する。
複数元形状の由来不明、hash変更、消失/再出現は新しいidentityとし、参照の修復を要求する。
OCCTの再読込後の別演算でserialization hashが変わった場合も、幾何的な類似だけで継承しない。
生成入力の新しい `split` 状態は保存できるが、旧アプリはこの状態を含むprojectを拒否し得る。
blocked状態を保存できることと、未解決形状を生成/G-codeへ使用できることは別である。
既存の「使用中のbindingはreadyでなければ生成/出力しない」条件は維持した。全体経路は#9の契約。

### 分離後に実行した検証

環境：Linux x86_64、Node24.22.1 / Node20.20.2、Python3.12.14、OCP7.8.1.1。
変更前のmainは `npm test` 166成功。以下は今回のブランチを再実行した値で、PR #2の数を流用していない。

| コマンド / 検査 | 結果 | 範囲 |
| --- | --- | --- |
| `npm test` / Node24.22.1 | exit0、178成功/0失敗/0skip | 既存166＋AUD-003の12ケース。#4の17競合ケースも含む |
| `npm exec --yes --package=node@20.20.2 -- node --test tests/*.test.mjs` | exit0、178成功/0失敗/0skip | 対応Node20で同じ全JSを実行 |
| `node --test tests/cad-split.test.mjs` | exit0、12成功 | rerun/reorder/cache、entity/body/binding、changed/count/blocked/repair、legacy、Library、subshape、handle解放、単独/並行Splitの抑制 |
| `python -B -m unittest discover -s native -p test_cad_split.py -v` | exit0、6成功 | 実OCCTで500+500 mm³、同一結果、同形状の複数sourceと順序反転、2→3分割/合計1000 mm³、面分割/合計100 mm²、fresh Runtimeへのimport、曖昧/途中失敗のcache解放 |
| `python -B -m unittest discover -s native -p 'test*.py'` | exit0、43検出/41成功/任意USD2skip | 既存native回帰＋今回6件 |
| 新nativeの同一Split fixtureをmain `4a22c588` のworktreeへコピーし1件だけ実行 | 意図したexit1、同じ2分割でslot UUIDが毎回変わる | 新fixtureが修正前のAUD-003を検出することを確認。修正後は上記6件で成功 |

browserはpackaged frontend、Playwright1.64.1 / Chromium153.0.8010.0を使用。
Tauri transport、OS保存、cancelは既存fixtureの置換で、形状は実Python/OCCT。
Chromium156/151の標準downloadは不完全zipで失敗したため、scratchのChromium153 archiveを
展開し直した。初回の空executable/SwiftShader欠落は環境復旧であり、CIや製品の修正ではない。
初期fixtureの厳密な浮動小数比較、生成完了前のSave、UI確定前の次操作も修正して再実行した。
初回全体browserは既存21成功/新AUD-003 1失敗（再読込後のdialogがクリックを遮断）。
確定完了と保存時draftなしを待った次の3回も、未処理の回復dialogにより3失敗だった。
traceの本文を確認し、原因を既存autosaveの回復確認と特定した。最終fixtureは回復データを
明示的に用意し、通常UIの「回復データを破棄」を操作してから保存projectをOpenする。
回復の競合処理そのもの（#10）は変更していない。この調整後のAUD-003は3回連続成功
（`--grep AUD-003 --repeat-each=3 --max-failures=1`、exit0、約19.3秒）。
最終browser結果は本節末尾へ追記する。

### CI間欠失敗の切り分け（ログを直接確認）

| 対象/head | run / javascript-and-browser job | npm test | browser / 結論 |
| --- | --- | --- | --- |
| PR #26 / `59b600c8` / push | [40331402494](https://github.com/usagicraftlab/pathloom/actions/runs/40331402494) / 121601467625 | 155成功/0失敗 | 21成功、全3ジョブ成功 |
| 同head / pull_request | [40331531188](https://github.com/usagicraftlab/pathloom/actions/runs/40331531188) / 121601906506 | 155成功/0失敗 | 19成功/2失敗、native/rust成功 |
| PR #25 / #3反映前 `935765ca` / PRとpush | [40330634871](https://github.com/usagicraftlab/pathloom/actions/runs/40330634871) / 121598811759、[40330626820](https://github.com/usagicraftlab/pathloom/actions/runs/40330626820) / 121598783452 | 両方52報告中34成功/18失敗 | `navigator is not defined`、browser工程skip。間欠的なbrowser失敗とは別 |
| PR #25 / `33a3b336` / pull_request | [40330298899](https://github.com/usagicraftlab/pathloom/actions/runs/40330298899) / 121597620816 | 同じnavigator読込エラー、34成功/18失敗 | browser工程skip。native/rustは完了時success |
| PR #25 / #3反映後 `9ea12d6` / PRとpush | [40333257982](https://github.com/usagicraftlab/pathloom/actions/runs/40333257982) / 121607940046、[40333252958](https://github.com/usagicraftlab/pathloom/actions/runs/40333252958) / 121607919638 | JS工程は両方success | browserも両方success。後者run全体のcancelはrust側で、JSの失敗ではない |
| PR #25 / `fe48190f` / PRとpush | [40333966571](https://github.com/usagicraftlab/pathloom/actions/runs/40333966571) / 121610442693、[40333959428](https://github.com/usagicraftlab/pathloom/actions/runs/40333959428) / 121610426176 | 両方166成功/0失敗 | 両方21成功、全3ジョブ成功 |

PR #26失敗側の2件はログ上、次のassertionである。

1. 当時の `tests/browser/cad-workspace.spec.mjs:415`、A04/R06の
   `work-order command definition creates real geometry and persists without AI`。
   447行目で `#modelStatus` に「登録・保存」を5000 ms待ったが、
   「OCCT（OCP 7.8.1.1） · 正確な形状で作図できます」のまま。
   登録操作そのものの失敗か、通知が別の状態更新に上書きされたかは、このログだけでは断定しない。
   永続状態（登録ボタン/保存された定義）と短い通知のassertionを分けて調べる提案とする。
2. `tests/browser/maintenance.spec.mjs:112`、`idle viewport stops frame polling and camera changes still render`。
   115行目のaxis=top確認直後にframe数を一度だけ読み、期待>0に対して0。
   `setAxisView`はaxisを同期更新し、描画を次のrequestAnimationFrameへ予約するため、
   axisの確認だけでは描画完了待ちにならない。待機不足と整合する。
   `expect.poll`でframe数/描画完了を待つ差分は分離元で#11に帰属しているため変更しない。

比較した#26の両runはNode20.20.2、Python3.12.15、OCP7.8.1.1、Chromium156、
Ubuntu24.04で依存準備を通過している。install/network/native起動失敗の証拠はなく、
確認した失敗はbrowser assertionである。2runの同時実行が原因だという証拠もない。
現在取得できた#25の#3反映後のペアでは、片側だけのJS/browser失敗は確認できなかった。

`ci.yml`はpushとpull_request両方で起動し、concurrency groupもgithub.ref別なので、
同一headに2runが存在すること自体は現在の設定と一致する。変更するなら、
pushをmainだけに限定してPRでfeature branchを検証する案があるが、これは重複起動の削減案であり、
browser assertionの修正ではない。今回、workflow/timeout/retry/既存browserケースは変更していない。

### 未実施・次の開始地点

macOS GUI、実Tauri IPC、OSダイアログ/保存/回復、ローカルRust、実機G-code/印刷は未実施。
surface Splitはnative/JS fixtureの範囲で、専用UIの完成とは扱わない。
次は本Issue専用Draft PRと照合、ユーザーのマージ指示待ち。
#5担当Aと共通ファイルをmain上で統合するときは、Split分岐と相手のDifference分岐をそれぞれ保持し、
両Issueのfixtureを再実行する。相手ブランチやPRに本作業から変更しない。
mainへのマージ、Issue #6の手動クローズ、#9以降への着手は行わない。

### 最終ローカル確認

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tmp/pathloom-b-chrome-runtime/chromium \
PATHLOOM_FRONTEND_DIR=desktop-dist PATHLOOM_BREP_PYTHON=python \
npm run test:browser
```

exit0、22成功/0失敗、約1分。新AUD-003と既存21件を同じ最終frontendで通した。
この成功はPR #26の過去の2失敗を修正したという意味ではない。
`node --test tests/cad-jobs.test.mjs` も17成功で、#4のguard回帰を確認した。
`git diff --check`、資料の相対リンク、65機能台帳/14列を確認。
共有ファイルの差分にDifference/Offset/CI/Rustの変更がないことを照合した。
GitHub CIの今回のrunは、Draft PR作成後に別途確認する。ローカル結果でCI成功を推定しない。


## 2026-10-27 JST — PR #28：#5反映後mainへのrebaseと統合再検証

ユーザーの指示に従い、PR #27のmainへのマージ `f9f4ad9e5711182cc3bc8024ef2f9f4adbcc55b8`
を確認し、`fix/6-aud-003` の旧head `4198b7f0c7fd74f0a5ccd710ef29fc93391f0652` を
この最新mainへrebaseした。機械的なrebase直後のローカルheadは `39476de`。
本節より前の#5/#6の開始地点・成功数・未マージ/Draft表現は、それぞれ実行当時の記録として保存する。
本作業ではPRのready/Draft状態を変更せず、mainへのマージとIssue #6の手動クローズも行わない。
マージの照合・実行はMuseの担当で、ここではpushまでとする。

### 競合解消と両Issueの保持

競合は `cad/store.js`、`docs/cad-development-log.md`、`docs/cad-verification-status.md`。

- Storeの5つの競合hunkは、Differenceの検証・slot/body対応・工具方針と、Splitの
  sourceKey・exact slot・入力body/candidate対応を演算ごとに残した。
  共通のresolveはSplitのsourceKeyを渡し、Difference側の検証をその前に維持する。
  出力適用はSplitのexact slot選択の後もDifferenceの対象body継承を残す。
  body適用はSplit専用処理と、それ以外のreplacementRefsの分岐にする。
- workspace UIの自動統合は、Differenceの対象/工具ラベル・工具保持checkbox・既存設定補完と、
  Splitの明示的な生成参照修復ボタンがすべて残ることを確認した。
- 機能台帳はD02のmain行とD04の#6行をともに保持。65行/14列を検査。
  A/T/R台帳はA20の#6更新とA21の#5更新を採用し、他の両Issueの更新行も保持した。
- 開発ログはmainの全内容をprefixとして保持し、その後ろへ元の#6章を全文追加した。
  #5/#6それぞれのnative演算分岐を担当元と文字列比較し、どちらも同一であることを確認した。
  両Issueのnative/browser fixture、Differenceのregistry/session、Splitのruntime/Library/
  references補助処理も元の担当実装と一致し、CI/既存maintenanceケースは変更していない。

### 統合時に検出した工具/切断形状の相互作用

競合マーカーを両方保持するだけでは、Differenceの工具表示再評価が、後続/既存のSplitで
使ったcuttersまで消費する組合せと、別元形状の分割先bodyを候補に混在させる組合せが残った。
新規2件のJS回帰fixtureは、機械的なrebase後に0成功/2失敗（exit1）で両方を再現した。

`cad/difference.js` の再評価対象がSplitの場合は、#6の既存契約に合わせてtargetsだけを消費し、
分割先を同じsourceEntityIdのslotだけに限定する。Splitのcuttersは保持し、
DifferenceのkeepToolsの意味とSplitの元形状ごとのbinding候補を両立させた。
この修正後は同じ2件が2成功/0失敗（exit0）。#6のJS fixtureは従来12件＋統合2件＝14件。
これはbody/参照方針のtransport fixtureであり、形状の数値的証拠とは区別する。

### rebase・統合修正後の再実行結果

Linux x86_64 / Node24.22.1・Node20.20.2 / Python3.12.14 / OCP7.8.1.1 /
Chromium153.0.8010.0。最終製品コードに対して下記を実行し、結果の追記は資料だけで行った。

| コマンド | 結果 | 範囲 |
| --- | --- | --- |
| `npm test`（Node24.22.1） | exit0、185成功/0失敗/0skip、約2.59秒 | #5/#6と統合2件、#4の17 raceを含む全JS |
| `npm exec --yes --package=node@20.20.2 -- node --test tests/*.test.mjs` | exit0、185成功/0失敗/0skip、約4.12秒 | 同じ全JSをNode20.20.2で再実行 |
| `python -B -m unittest discover -s native -p 'test*.py'` | exit0、48検出・46成功/任意USD2skip、約3.06秒 | Difference5、Split6、既存native全体 |
| 下記packaged browser全体 | exit0、25成功/0失敗/0skip、約1.2分 | Difference3、Split/AUD-003 1、既存CAD7/操作回帰14 |
| 新規統合fixture2件の修正前/後 | exit1：0成功/2失敗 → exit0：2成功/0失敗 | Split cutter保持とsource別candidate保持 |
| `git diff --check`・両側保持の照合 | exit0 | 競合markerなし、65行/14列、#5/#6ログ全文と演算/UIの保持 |

```sh
PATHLOOM_FRONTEND_DIR=desktop-dist PATHLOOM_BREP_PYTHON="$CODEX_PRIMARY_RUNTIME_PYTHON" PLAYWRIGHT_CHROMIUM_EXECUTABLE="$PWD/work/chromium-local/chromium" npm run test:browser
```

browserは実OCCTの演算・正本を使うが、Tauri transport・OS保存/回復/ダイアログは既存fixtureの
置換である。実macOS GUI、実Tauri IPC、OS保存/回復、ローカルRust、実機プリンターは今回も未実施。

### 間欠失敗の履歴との区別

今回のローカルbrowser全25件のrunでは、maintenanceのフレーム数テストおよび
A04/R06通知待ちの間欠失敗は再発していない。成功のための再試行や既存assertionの変更はしなかった。
これは間欠失敗の修正・解消を意味しない。過去の成功/失敗は以下の別runとして保持する。

- #5実装head `616a8fb8`：CI [40408830985](https://github.com/usagicraftlab/pathloom/actions/runs/40408830985) は全3ジョブ成功、browser24成功。
- #5ログ追記head `4dae7ae6`：CI [40409476947](https://github.com/usagicraftlab/pathloom/actions/runs/40409476947) は
  javascript-and-browser / 121875989294 が失敗。JS成功、browser23成功/1失敗。
  既存 `maintenance.spec.mjs:115` でaxis=topの後にframe数>0を期待し、実測0。
  #5新規3件・native・Rustは成功。製品/fixtureは前runと不変だが、前の成功をこのrunの合格としない。
- #6旧head `4198b7f0`：push [40409763320](https://github.com/usagicraftlab/pathloom/actions/runs/40409763320) /
  PR [40409874851](https://github.com/usagicraftlab/pathloom/actions/runs/40409874851) は全3ジョブ成功。
  両方JS178/browser22/native41成功+任意USD2skip/Rust21成功。これもrebase後の実行結果ではない。

push後の新しいCIは、このローカル再検証と別runである。未完了のCIを成功とは記録しない。
本作業は検証結果をPR #28にも追記して、lease付きで既存ブランチを更新する。
次の開始地点はMuseの照合とマージであり、本作業からはマージ・Issue手動クローズを行わない。


## 2026-10-27 JST — PR #28：#7反映後の最終rebase・マージ条件確認

ユーザーの新指示により、従来の「pushまで・マージ待ち」は廃止された。以下の条件を満たしたら
CodexがReady化・マージコミット方式でマージし、Closes #6の自動クローズを確認する。
過去の未マージ/Draft表現は当時の履歴として保持する。Issueを手動クローズしない。

最新mainはPR #27/#29反映済み `225e1774f2e2de7fb44a3db23ea9a16e5799fc6a`。
旧head `81dae90e` をrebaseした。競合は開発ログの追記位置1箇所のみで、#7章と
#6章/前回rebase記録を全文残した。Store/UI/台帳のD02/D04、nativeのDifference/Split/Offsetを
比較し、それぞれの変更が保持されることを確認。#7のOffset fixture3件も新しい全件検証へ含めた。

### Issue #6本文の完了条件との対応

| 完了条件 | 実装と再確認した証拠 |
| --- | --- |
| 不要な再計算・同一Splitで同一出力の参照を失わない | exact source+asset slot。cad-splitのnative rerun/reorder/cache fixture（solid/surface）と実OCCT反復fixture、browser AUD-003 |
| 形状変更時にordinal/近傍だけで別結果へ結ばない | changed same-count/legacy ambiguity/exact part subshape fixture。変更した正本には新ID、既存参照はblocked、明示修復だけを受け付ける |
| 分割数変更・保存後も正しく継承またはblocked | count changes/restore/Library二重コピーfixtureとbrowserのv2 reopen・候補保持・明示binding修復。binding ID維持を確認 |

### 今回のローカル全再検証

| 実行コマンド | 結果 |
| --- | --- |
| `npm test` / Node24.22.1 | exit0、185成功/0失敗/0skip、約2.85秒 |
| `npm exec --yes --package=node@20.20.2 -- node --test tests/*.test.mjs` | exit0、185成功/0失敗/0skip、約4.43秒 |
| `python -B -m unittest discover -s native -p 'test*.py'` | exit0、51検出・49成功/任意USD2skip、約3.26秒 |
| `PATHLOOM_FRONTEND_DIR=desktop-dist PATHLOOM_BREP_PYTHON="$CODEX_PRIMARY_RUNTIME_PYTHON" PLAYWRIGHT_CHROMIUM_EXECUTABLE="$PWD/work/chromium-local/chromium" npm run test:browser` | exit0、25成功/0失敗/0skip、約1.2分 |
| `git diff --check`・両側保持確認 | exit0。D02/E06台帳行、D02/D04/Offset native分岐、3章のログを保持 |

ブラウザはDifference3件/Split1件/既存21件を実OCCTで確認。#4のrace17件も全JSに含む。
Tauri transportとOS保存/回復は置換。実macOS GUI・実Tauri IPC・OSダイアログ・
ローカルRust・実プリンターは未実施であり、今回の成功として扱わない。

### CI履歴の照合・マージゲート

旧head `81dae90e` の [push 40414618488](https://github.com/usagicraftlab/pathloom/actions/runs/40414618488) と
[PR 40414624307](https://github.com/usagicraftlab/pathloom/actions/runs/40414624307) は両方全3ジョブ成功。
APIのPR専用取得だけで済ませず、同一headのpush/PR全runを公開APIで列挙して照合した。
これは今回の#7反映後headの成功とは別の履歴である。

#7の同一head `c4eb8ed0` ではPR [40414667194](https://github.com/usagicraftlab/pathloom/actions/runs/40414667194) が成功、
[40414630011](https://github.com/usagicraftlab/pathloom/actions/runs/40414630011) が失敗。後者のjob121894327764の
ログを今回直接読み、browser23成功/1失敗、maintenance.spec.mjs:115のframe>0に対して0であることを確認した。
推測だけで既知失敗と分類したのではない。今回のローカル25件では再発していないが、修正済みとはしない。
保存通知待ちとフレーム待ちの修正は、ユーザー指定どおり#11で扱う。

この再base後headでもpush/PRの全CI runを確認し、結果をPR #28本文の最新run表へ記録してからマージする。
未知の失敗ならマージせずIssue #6へ報告して停止する。既知の間欠失敗も成功runに置き換えない。
現段階はローカル実測であり、未完了の新CIを成功とは記録しない。

台帳はD02/E06のmain行とD04の更新を保持。A/T/Rの#5/#6両方の証拠も維持した。
本節以後のCI結果とマージ後の自動クローズ確認は、PR #28本文とIssue #6の完了報告に記録する。

## 2026-10-27 JST — 指示003【改訂】 / Issue #31 — Difference browser fixtureの隔離

指示ボードの改訂指示に従い、main `c3655574468cd8a299adf3b173eba4c021ab650c`
のbrowser失敗2種類を調べた。製品コードに原因があれば修正せず停止する契約である。
今回確認したのはテストfixtureの問題であり、製品のpreview/commit・Store・native、
Difference/Split/Offsetの演算、CI設定、Issue #8のブランチには変更を加えない。

### 失敗の再現と通信の証拠

前回の対象ケース単独5回はすべて成功したが、同じmainの全体実行では最初のBoxの履歴0件と、
Save/reload後のdialog遮蔽が発生した。今回は診断用コピーで要求ID、応答ID、daemon PID、
テスト開始/終了、失敗時のUI/native jobsを観測した。要求を遅延させたり混入させたりする
故障注入は行っていない。最初の診断用3ケースは3成功、その後3ケースを5巡した結果は
**13成功/2失敗**（98.6秒、retryなし）。2失敗は別々の巡の次の症状である。

1. `cad-difference.spec.mjs:201`：回復確認dialogがクリックを遮蔽。履歴のBox3件と
   Differenceはすべてvalidで、nativeの未完了jobsは0件だった。通常の自動保存が
   reload前に間に合うかどうかで回復確認が現れるのに、テストは応答せず次へ進んでいた。
2. 同`:308`：前のT19/T20ケース終了後に旧pageのimport要求が共有queueへ入り、
   次ケースのhello応答を横取り。最初のBox確定後の履歴が期待1件に対し0件のまま失敗した。

後者は観測した通信の次の順序で特定できた。時刻は前ケース終了を0msとする。

| 時差 | 観測 |
| --- | --- |
| 0ms | T19/T20終了、共有queueは空 |
| +5ms | 旧pageのimport要求44が旧daemon PID1036へ送信され、共有queueへ追加 |
| +10ms | 旧daemonがSIGTERMで終了。応答44は来ない |
| +53ms | 次の並べ替えケース開始時にも旧要求44がqueueへ残存 |
| +591ms | 新daemon PID1055へのhello要求45を追加 |
| +689ms | 新daemonの応答45が到着したが、queueの先頭は旧要求44。`queue.shift()`は44側へ渡す |
| +5868ms | 新しいhello45のPromiseは未完了のまま、最初のBox履歴数のassertionが失敗 |

生ログはローカル `work/board-verification/003r/wire-natural-five.jsonl` の1050行目付近。
SHA-256は `f8a4ba0bc723e9695edd2c9f2f7c4d02e12bd2ee99c96ce3c895fc0b913545a5`。
同ディレクトリの`report-five.json`は15件中13成功/2失敗/0skipを記録している。
診断用コピーの初回はafterEach引数のfixture宣言形式で読込エラーとなり、製品テストは
実行されなかった。診断用コードだけを直した後の計測結果が上記であり、読込失敗を
成功runに含めない。前回の未知失敗を「再現せず」とする結論には進まなかった。

### テストだけに加えた修正

- native childとpending要求をbeforeEach内の各テストに閉じ、応答IDで対応付ける。
  旧pageのbindingが終了後に呼ばれても、新しいchildやpending要求へ接続しない。
- 終了済みfixtureへの要求を拒否し、未完了要求をrejectしてreadlineを閉じ、childの
  close完了までafterEachで待つ。旧プロセスの要求を次ケースへ持ち越さない。
- 通常Save/reopenのテストでは回復データを明示的に用意し、reload後に正規の
  「回復データを破棄」操作をしてから保存ファイルを開く。既存のSplit browser fixtureと
  同じく、回復確認を自動保存タイマーとの競争にしない。project保存内容は変更しない。

形状、体積、entity/bodyのID、工具保持、Undo/Redo、v2保存の既存assertionは維持した。
固定sleep、assertionのtimeout延長、retry、maintenanceのframe/通知待ちの変更はない。
機能台帳D02とA/T/R台帳にはこの検証の範囲を追記し、他の機能を完了へ昇格させない。

### 修正後の検証

修正した元のDifference spec全3ケースを5巡し、**15成功/0失敗/0skip**、exit0、54.5秒。
計測用コピーではなく、PRへ含める元のテストを実行した。JSON reporterでも集計を確認した。
全件検証結果はこの節の末尾に記録する。新headの全CI runとマージ・自動クローズの
確認結果は、Issue #31を閉じるPR本文と指示ボードのCodexログへ記録する。


| 修正後の全件コマンド | 今回のローカル実測 |
| --- | --- |
| `NODE_OPTIONS=--test-reporter=tap npm test` / Node24.22.1 | 185成功/0失敗/0skip、exit0、約2.00秒。TAPの総件数でも確認 |
| `npm exec --yes --package=node@20.20.2 -- node --test tests/*.test.mjs` | 185成功/0失敗/0skip、exit0、約2.83秒 |
| `"$CODEX_PRIMARY_RUNTIME_PYTHON" -B -m unittest discover -s native -p 'test*.py'` | 51検出＝49成功/任意USD2skip、exit0、約2.32秒 |
| packaged frontendの `npm run test:browser` 全体（下記） | 25成功/0失敗/0skip、exit0、59.5秒。Difference3/Split1/既存21 |
| `node --check tests/browser/cad-difference.spec.mjs` / `git diff --check` | 成功 |

browserの環境は `CI=1 PATHLOOM_FRONTEND_DIR=desktop-dist
PATHLOOM_BREP_PYTHON="$CODEX_PRIMARY_RUNTIME_PYTHON"
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/workspace/scratch/1318e0e6fc5b/pathloom/work/chromium-local/chromium`。
既存playwright.config.mjsを継承したローカル計測用config
`work/board-verification/003r/ma…14624 tokens truncated…|
| native-existing-second | 0 | 5.567 |
| native-final | 0 | 8.140 |
| node20-final | 0 | 4.347 |
| node20-full | 0 | 4.698 |
| node24-final | 0 | 3.661 |
| node24-full | 0 | 2.993 |
| solids-target-first | 1 | 30.788 |
| solids-target-second | 1 | 30.066 |
| solids-target-third | 0 | 29.937 |

raw log/JSON/失敗traceはwork/board-verification/009/に保持。
計画head a880d202（docsだけ）のpush40669634225/PR40669640655各attempt1 successを全6job生ログで確認。
各JS202/native68成功USD2skip/macOS Rust21/browser51。この成功を製品変更headへ転用しない。
最終head公開後のpush/PR全CIは別に確認してPR/Codexログへ記録する。

## 2026-10-28 JST — 指示010 / Issue #14 実装前の具体化

009のmerge 7075be3後main checks40675529462はattempt1 success。全3job生ログで
JS204、native83件81成功/任意USD2skip、macOS Rust21、browser58を確認した。
ボード20:22の有効化を読み、指示010だけをrequiredRevisionId付きで未着手→作業中へ更新し、
読戻し確認した。既存#14用branch/PRがないことを確認してfeat/14-step-connectionを作成。

[対応表](cad-step-connection-plan.md)で、既存`importedShapes`のうち埋込exact B-repを
`cadDocument`の明示的`import.step`履歴へ取り込むadapter、mm単位・placement・正本hash・
由来保持、OCCT STEP書出しと別runtime再読込数値比較をIssueの3条件へ対応づけた。
display-only meshから形状を捏造せず、既存v1入力/保存を変更しない。実Macのdialog/保存は
Issue37の未実施範囲として残し、011予約と#37へ先行着手しない。この時点で製品変更と
010の全ローカル検証は未実施。Draft PRとIssue本文へ同じ契約を記録してから実装する。

## 2026-10-28 JST — 指示010 / Issue #14 実装・ローカル検証

埋込exact B-repを持つ既存`importedShapes`へだけ「CAD履歴へ取り込む」を表示し、
`import.step` feature/body/entityへ原子的に追加した。mm単位、配置行列、source shape
ID/name/kernel、source/original hashをfeatureとasset provenanceへ保存し、同じshapeの重複取込を拒否。
display-only STEPは既存表示を維持し「CAD履歴化には正確なB-repが必要」と明示する。

現在bodyのexact handleをOCCT `STEPControl_Writer`へ渡し、100 MB上限・STEP header/footer・
`.step`/`.stp`保存名を検査してTauriのatomic writeへ接続。fresh `Runtime`のreaderでbbox、
area、volume、closure、validityを比較した。browserは既存cube→履歴取込→Move→v2保存・再Open→
STEP書出し→実OCP再読込を確認し、legacy importedShapesとcadDocumentの両方を保持した。

### 最終ローカル検証

| 実行 | 結果 |
| --- | --- |
| Node24.22.1 `npm test` | 206成功、失敗/skip/todo 0 |
| Node20.20.2 全JS | 206成功、失敗/skip/todo 0 |
| Python3.12.14/OCP7.8.1.1 native全件 | 85件中83成功、任意NVIDIA USD 2skip、失敗0 |
| packaged browser全件 | 初回最終source 60成功。表示文言追加後の再実行は59成功1失敗、A19/A20/R08のRectangle確定が5秒内に履歴化せず失敗。直後の同一test単独再実行は1成功。今回のSTEP接続2件は各run成功、retry設定0 |

browserはTauri IPC/OS保存/storageだけfixtureで、Python/OCPは実daemon。ローカルのPlaywright
browserがなくCDN取得も0 byteで失敗したため、ignored領域へ展開したChromium153を標準config
（workers1/retries0/timeout45000）で使用した。初期診断では、実行ファイル欠落、fixtureのfile fetch、
非表示Save/Open/buttonのactionability、回復dialog、期待filename、`--single-process`終了を順に検出し、
製品条件を緩めずfixture操作と環境configを修正した。native初回はPYTHONPATHなしでimport失敗、
次に古いBox parameter fixtureで失敗し、製品schemaへ合わせた後2件成功。これらを最終成功へ置換しない。

ローカルRustは`cargo`不在で未実行。計画だけのhead `4ca12c0`のpush
[40683356270](https://github.com/usagicraftlab/pathloom/actions/runs/40683356270)とPR
[40683447913](https://github.com/usagicraftlab/pathloom/actions/runs/40683447913)は各attempt1 success。
全6job生ログで各JS204、native83件81成功/任意USD2skip、macOS Rust21、browser58を確認。
計画CIを製品変更の合格へ転用せず、最終headのpush/PR CIを別に確認する。実Mac GUI/Tauri IPC/
OS dialog、実機Issue #37、指示011は未実施・未着手。

## 2026-10-29 Issue #15 共通操作・再利用（実装前）

- 指示011を取得し、Issue #15をC01〜C04 / L01〜L05 / V01〜V06へ具体化した。
- main `31910e62baa6fb5c0743db764fada41ab83555f4` のpost-merge checks run `40761465408` attempt 1 successを生ログまで照合した（JS 206、native 83成功/任意NVIDIA USD 2 skip、macOS Rust 22、browser 60）。
- 既存実装を確認し、native `shape.transform` はmove/rotate/scale/mirrorをOCCT B-repへ適用済みだが、registry/UIはMoveだけを公開していること、Libraryは上流closureとtyped ID再写像を持つ一方で挿入配置を履歴化していないことを確認した。
- 実装契約と検証範囲は `docs/cad-common-operations-plan.md` に固定した。実Macの照合はIssue #37の未実施範囲として分離し、自動検証の成功へ置換しない。

## 2026-10-29 Issue #15 実装・ローカル検証

- 既存のOCCT `shape.transform`へRotate / Scale / Mirror commandを接続した。4変換はいずれも形状1件を明示選択し、曖昧な複数preselectionを採用しない。Scale倍率は正数に制限した。
- Shape Library挿入へ有限XYZ配置を追加した。依存closureとtyped IDを挿入ごとに再発行した後、選択rootごとのMove featureを末尾へ追加し、body tipと選択IDを正本出力へ更新する。ゼロ配置と既存schemaVersion 1 entryは従来互換。
- JS対象回帰21件は成功。新規native回帰2件は成功。全ローカル検証はNode24.22.1 208成功、Node20.20.2 208成功、Python3.12.14/OCP7.8.1.1 native全87件中85成功・任意NVIDIA USD2skip。
- browser対象2件の初回ローカル実行は、製品test開始前にChromium実行ファイル欠落で2件とも失敗した。Playwright Chromium取得はCDN応答が0 byteでzip展開不能。製品失敗へ分類せず、成功にも置換しない。最終headのCI browserを含む全jobと、ローカルbrowser実行可否を別に記録する。
- 実装head `91696ddd` のPR checks run 40787882931 attempt 1はnative 85成功/任意USD2skipとmacOS Rust 22が成功、JS208も成功したがbrowserは61件中60成功1失敗。新規変換testがMirror確定直後、履歴表示は4件になった一方で非同期recompute完了前にentityを読んだtest raceで、製品診断/演算失敗ではなかった。各変換後に最後の履歴が`valid`になることを待ってから次へ進むようtestを修正し、旧runを成功へ置換せず最終headで全件再実行する。
- 修正後の実装head `27bacdc450ebf621175a809b3b8949d6004fdcf2` は、push run [40788651265](https://github.com/usagicraftlab/pathloom/actions/runs/40788651265) とPR run [40788660019](https://github.com/usagicraftlab/pathloom/actions/runs/40788660019) が各attempt 1で成功した。両runの全6 job生ログを照合し、Node20.20.2 JS 208、native 87件中85成功・任意NVIDIA USD 2 skip、macOS Rust 22、browser 61成功（失敗/skip/retry/flaky 0）を確認した。CI browser成功をローカルbrowser成功とは記載せず、ローカルは上記の実行不能のまま区別する。
- この記録追記だけの最終文書headは、実行コードを変更しない。ただし最終headとしてpush/PR双方の全CIを改めて確認し、結果はPR本文とボードのCodexログへ記録する。

## 2026-10-30 JST — 指示018 UIレビュー反映（実装・ローカル検証途中）

- main `5f609964` から `feat/18-ui-review` を作成。既存の4領域、アイコンcommand、
  outliner表示/lock/context actions、履歴編集、既存面作業平面、mouse作図、occlusion pickingを
  実装済みとして確認し、未達項目だけをボードへ記録した。
- 上部からUndo/Redo/searchを除き、分類展開を縦並びにした。透明アウトライナー、編集中だけの
  右設定、右下の確定/キャンセル、下部履歴アイコンと抑制/削除context menuへ整理した。
  Library/生成/削除はアウトライナーcontext menuに残し、プロパティ入口・STEP書出し・
  custom command JSON・左側座標/snap/plane・右側preview/retry/generation/delete/suppressを露出しない。
- `cad/view-adapter.js`へXY/XZ/YZの半透明参照平面を原点中心に追加し、平面clickを現在の
  作図sessionのplane選択と最初のpoint入力へ接続した。hidden shapeの非選択とface/edge overlayは
  既存実装を保持する。CAD演算、正本、保存schema、generation bindingは変更していない。
- 既存browser fixtureのUndo/Redoをkeyboard shortcutへ、生成接続をoutliner context menuへ移行。
  UIレビュー専用fixtureを追加した。Node24.22.1全JS208成功、Node20.20.2全JS208成功、
  Python3/OCP7.8.1.1 native全87件中85成功・任意NVIDIA USD2skip。
- ローカルbrowserは`npx playwright install chromium`を5回試行したが、各CDN応答が0 MiBの
  truncated zipで展開不能。製品testは未実行であり成功に置換しない。最終headのCI browserと
  ローカル実行不能を別々に記録する。ローカルRustと実Mac GUI/Tauri/OS dialogも未実施。
- 初回PR run `40995633123` attempt 1はJS208、native85成功/任意USD2skip、macOS Rust22が成功。
  browserは共通初期化で全19件が45秒timeoutになり、15分job制限でcancelled（残り未実行）。
  一時的に`maxFailures:1`を設定した診断run `40997226534` attempt 1でも最初の1件がfixture setup中に
  timeoutし、61件未実行。traceのpage errorは`workspace-ui.js:349`のnullなpreview buttonに対する
  `hidden`設定だった。左panel再構成でbuttonが一時的にDOM外へ出た後に`panel.querySelector`していたため、
  保持済み`actionControls`から参照するよう修正した。診断用`maxFailures`は最終headから除去する。
- 修正headの全件PR run `40997555193` attempt 1はJS208、native85成功/任意USD2skip、macOS Rust22が
  成功した一方、browserは18件が同じ45秒timeoutとなり15分制限でcancelledした。2回目の診断run
  `40999055679` attempt 1は最初の1件で停止し、traceから「確定」buttonがvisible/enabledでも
  viewport外と判定され続けていたことを確認した。右panelの内外2重overflowとcontent-boxの
  `height:100%`で下端actionsがpanel外へ押し出されていたため、外枠を`overflow:hidden`、内側を
  `box-sizing:border-box; max-height:100%; overflow:auto`へ修正した。旧cancelled/failure runを
  成功へ置換せず、診断用`maxFailures`を除いた最終headの全62件で再確認する。
- 続く全件run `41028060647` attempt 1もJS208、native85成功/任意USD2skip、macOS Rust22は成功したが、
  browserは18件が45秒timeoutとなり15分でcancelled、残り44件は未実行だった。前回traceのlayoutを
  再精査すると、開いた「カーブをつくる」分類の縦command 25件がgridのauto行をviewport高以上へ
  拡張し、中央行と右panel全体を画面外へ押し出していた。分類の縦並びは維持したまま、開いた分類の
  button列を最大210pxの内部scrollへ制限する。まず`maxFailures:1`の診断runで最初のfixtureが
  通過することを確認し、その後に設定を外して全62件を再実行する。
- 診断run `41029873262` attempt 1では最初のRectangle fixtureが4.1秒で成功し、右panelの
  viewport問題が解消したことを確認した。次のfixtureは折りたたまれた「移動・回転・ミラーなど」内の
  Moveを直接待って45秒timeout、1成功/1失敗/60未実行だった。分類は折りたたみ可能な`details`の
  まま全分類を初期展開し、各縦button列の内部scrollで高さを制限する。既存の全command操作経路を
  維持し、診断用`maxFailures`を除いた全62件を最終headで再実行する。

## 2026-10-30 JST — 指示018 残存UI回帰と第12弾の反映

- 20:12のボード回答を読み、原点中心の有限な3基準面へ境界線、hover時の面ハイライト、
  「平面を選択」tooltipを追加した。平面または既存の見えているfaceを直接選んで作図できる。
  明示した右パネルのplane設定と端点/中心snapは維持する。
- 右パネル外枠の非表示、`[hidden]`を上書きしていたgrid/flex規則、初回plane選択時の
  snap再解決を修正した。Libraryはmodal、回復候補保留の理由/再確認は独立メッセージへ置き、
  非編集中のinspectorを再表示しなくても操作できる。生成参照の明示修復は右パネルから
  アウトライナーcontext menuへ移し、既存の`store.rebindOutput`を呼ぶ。
- 旧単一lock/hideボタンを選択outliner行へ限定し、非表示STEPのtransport検証はhandlerへ接続。
  削除したcustom JSON登録UIのfixture3件は、既存shared command読込・project内定義復元、
  遅延shared読込、shared file不在でもproject定義が使える経路へ更新した。
  CAD数値assertion・tolerance・45秒timeout・retries0は緩めず、skip/xfail化はしていない。
- Playwright公式CDN取得はこの回も5回0 MiB/truncated zipで失敗した。検証専用scratchへ
  npm版`@sparticuz/chromium@153.0.0`を取得し、初回chown EINVAL後に標準tarで復旧した。
  実Chromium153.0.8010.0、Python/OCP7.8.1.1でローカル実行可能になった。
  検証用追加依存はpackage.json/lockfileへ入れず、製品依存/CI browserは従来どおり。
- ローカル対象7件の最初は3成功/1失敗/3未実行（plane欄省略）、次は6成功/1失敗
  （旧lock selector）。その後の全62件は60成功/2失敗/skip・retry・flaky0、
  errors[]、306.382秒。失敗は旧生成参照修復buttonを待つtimeoutと、新fixtureが
  normalize前のcommandをbeginへ渡したTypeError。両方を修正した対象4件は4成功、
  失敗/skip/retry/flaky0（20.0秒）。修正前の結果を成功へ置換しない。
- Node24.22.1 npm testは208成功、Node20.20.2全JSは208成功（各失敗/skip0）。
  native全87件は85成功・任意NVIDIA USD2skip（8.305秒）。local Rustはcargo不在で未実行。
  実Mac GUI/Tauri IPC/OS dialogとIssue #37は未実施。
- 旧branch全22 runの全job結果とbrowser生ログを再照合した。すべてattempt1、
  同一runの再実行はない。各runのnpm test/native/Rustは成功、browserだけが下表の結果。
  cancelledでは最終集計が出ていないため、ログ行から成功/失敗/未実行を数えている。
  `41030217718`の正値は27/18/17で、途中のチャット28/17およびボード26/19は
  誤計数としてボード追記で訂正した。旧失敗/中断を最終成功に置換しない。

| head | push結果 · browser成功/失敗/未実行 | PR結果 · browser成功/失敗/未実行 |
| --- | --- | --- |
| `32ae668` | [40995618222](https://github.com/usagicraftlab/pathloom/actions/runs/40995618222) cancelled · 0/18/44 | [40995633123](https://github.com/usagicraftlab/pathloom/actions/runs/40995633123) cancelled · 0/19/43 |
| `d13fac6` | [40997220991](https://github.com/usagicraftlab/pathloom/actions/runs/40997220991) failure · 0/1/61 | [40997226534](https://github.com/usagicraftlab/pathloom/actions/runs/40997226534) failure · 0/1/61 |
| `d0a2199` | [40997551235](https://github.com/usagicraftlab/pathloom/actions/runs/40997551235) cancelled · 0/18/44 | [40997555193](https://github.com/usagicraftlab/pathloom/actions/runs/40997555193) cancelled · 0/18/44 |
| `34c2c82` | [40999049857](https://github.com/usagicraftlab/pathloom/actions/runs/40999049857) failure · 0/1/61 | [40999055679](https://github.com/usagicraftlab/pathloom/actions/runs/40999055679) failure · 0/1/61 |
| `bf0393d` | [41028056120](https://github.com/usagicraftlab/pathloom/actions/runs/41028056120) cancelled · 0/19/43 | [41028060647](https://github.com/usagicraftlab/pathloom/actions/runs/41028060647) cancelled · 0/18/44 |
| `48b8f0c` | [41029865498](https://github.com/usagicraftlab/pathloom/actions/runs/41029865498) failure · 1/1/60 | [41029873262](https://github.com/usagicraftlab/pathloom/actions/runs/41029873262) failure · 1/1/60 |
| `d7b4d78` | [41030211009](https://github.com/usagicraftlab/pathloom/actions/runs/41030211009) cancelled · 27/18/17 | [41030217718](https://github.com/usagicraftlab/pathloom/actions/runs/41030217718) cancelled · 27/18/17 |
| `a455f1a` | [41032194286](https://github.com/usagicraftlab/pathloom/actions/runs/41032194286) failure · 1/1/60 | [41032200444](https://github.com/usagicraftlab/pathloom/actions/runs/41032200444) failure · 1/1/60 |
| `171b8d8` | [41032494823](https://github.com/usagicraftlab/pathloom/actions/runs/41032494823) failure · 2/1/59 | [41032501828](https://github.com/usagicraftlab/pathloom/actions/runs/41032501828) failure · 2/1/59 |
| `300ff8f` | [41032798220](https://github.com/usagicraftlab/pathloom/actions/runs/41032798220) failure · 2/1/59 | [41032808951](https://github.com/usagicraftlab/pathloom/actions/runs/41032808951) failure · 2/1/59 |
| `780d157` | [41033208855](https://github.com/usagicraftlab/pathloom/actions/runs/41033208855) failure · 3/1/58 | [41033216994](https://github.com/usagicraftlab/pathloom/actions/runs/41033216994) failure · 3/1/58 |

上記の0/1診断、1/1診断、2/1診断、3/1診断は`maxFailures:1`で原因を採取したrun。
設定は最終sourceから除去した。最終sourceの全63件結果、最終push/PR CI、
Ready/merge結果は別途確認し、PR本文とボードへ記録する。

### 指示018 最終ローカル結果

最終sourceのbrowser全63件は63成功、失敗/skip/retry/flaky0、errors[]、
261.651秒（約4分22秒）。45秒の個別timeout、workers1を維持し、maxFailures制限なし。
第12弾のhover/tooltipと直接平面選択、修復context menu、回復候補保留/再確認、
Library挿入、STEP再読込、shared command/project復元、全生成/maintenance回帰を通過した。
idle/edit/plane-hoverの画面を目視し、CSSのhidden上書きによる禁止UI再露出も修正・再確認した。
Node24.22.1/Node20.20.2各208成功、native85成功/任意USD2skipは上記と同じsourceで実測済み。
ローカルRustは未実行。実Mac/実Tauri/OS dialogはIssue #37の未実施範囲のまま。
最終headのpush/PR CIは公開後に全job生ログまで別に照合し、結果とmergeはPR/ボードへ記録する。

## 2026-10-31 JST — 指示018 追加レビュー7〜10と自動Extrude方針の反映

- ボード20:44〜20:58の追加レビューと20:53の自動Extrude回答を読み、状態を`作業中`へ戻した。
  native演算、command schema、generation bindingは変更していない。
- view cube、hover展開、Esc一回終了、配列preview/copy、command pin/reorder、outliner inline rename/
  reorder/thumbnail/color、Mirror face/基準面選択、生成drag、adaptive face/edge選択とcontext command、
  L→R包含/R→L接触矩形選択、Move中心snap、Tab panel toggle、選択寸法、履歴display-only scrub、
  数値drag/wheel、15度Rotate、Ctrl-drag copy、対称Extrude toggleを追加した。
- 閉じるPolylineは既存Planar Regionを後置し、自動Extrudeは交差する既存solidが1件のときだけ
  距離の符号により既存Union/Differenceを後置する。履歴featureは両方保持し、transactionだけを
  `squashLast`で1 Undo/Redo単位にする。複数交差は通常Extrudeを保持し、黙って対象を選ばない。
- `squashLast`のJS回帰と、実OCCT browserでExtrude＋Unionのfeature列・Undo/Redoを検証した。
  UI対象4件は成功。全JS/native/browserの最終集計、CI、Ready/mergeは後続記録で区別する。

### 2026-10-31 08:20 JST — 作業確認と追加第11〜13弾の範囲判断

- 上記追加操作の一覧はローカル試作の着手範囲であり、全項目の完成・合格ではない。
  Node24.22.1 `npm test`209成功、Node20.20.2全JS209成功、native87件中85成功・任意USD2skip。
  UI対象3件と自動Extrude＋Union/1単位Undo/Redo対象1件は成功した。自動合成の切取・複数候補・
  正確な交差判定、配列/dragの中断、履歴stageの過去出力表示などの境界検証は未完了。
- browser全65件の実行は開始したが、最初のRectangle fixtureで折りたたまれた分類内の
  Rectangle buttonを待つ45秒timeoutを記録した。その後の最終集計は取得できず、現在の実行
  processも参照不能のため、全件成功とはしない。準備中のbrowser起動失敗・WebGL runtime不足・
  fixture失敗の履歴も、この最終集計の代替にはしない。retry/timeout/assertionの緩和は行わない。
- ボード21:00/21:07/21:08の追加11項目を新たに確認した。Escでdrag前へ復元、folder grouping、
  suppression表示、前回作業の確認付き再開、H/Shift+H、常時原点/XYZ軸、Enter次field、isolate、
  pivot picking、角/軸Scale handles、shortcut helpは残件で、実装・検証済みとは扱わない。
- 軸Scaleの既存経路を確認した。registry `transform.scale`は`center`と単一`factor`、native
  `shape.transform`は`gp_Trsf.SetScale(center, factor)`だけを受ける。Move/Rotate/Mirrorと等方Scaleの
  合成では1軸だけの伸縮は構成できず、一般形状の正確なB-repへ適用するにはnative演算とparameterの
  拡張が必要になる。018のnative/schema機構変更禁止と衝突するため、許可範囲の回答が必要。
- PR #44の公開headは`f27a5293eba4f506203231471757f22c25e8afea`のまま。今回の10 tracked file差分は
  未commit/未push、追加差分のCIは未実施。公開headの旧63件成功は今回へ転用しない。
  Draft/open・未Ready/未マージ、対応Issueなし。014〜017予約、Issue #37/PR #43は未着手を保持。

### 2026-10-31 08:35回答後 — 追加46項目の実装と境界検証

- ユーザー方針Aに従い、軸別Scaleだけnative変換/axisFactorsを追加。新規command v2に分け、
  v1のcenter/factor定義・等方変換とdocument/asset schema/binding機構を保持する。
  正のXYZ倍率とpivot、正確な体積/bbox、fresh runtime export/import、v1、不正値失敗をnativeで照合。
- 追加の46項目をcad-ui-review-additions.mdへ対応づけた。推論snapは裏側遮蔽を確認し、
  500線分超でも交点を一括省略しない。scrubは消費前tipの表示だけで正本/binding不変。
  exact deltaは既存Differenceから増加緑/除去赤を表示。Move 5mmで各500mm³を実測した。
- 自動Extrudeは既存Intersectionで1対象を確認しUnion/Differenceを既存役割で後置、
  1 Undo/Redo単位にまとめた。切取1000→920mm³、複数対象は通常Extrude400mm³と理由を保持。
  複数対象の扱いをボード@Museへ実測報告。配列は独立Move、個数/spacingと形状drag、全コピー1 Undo。
- H/Shift+H/Iの実表示、folder、suppressed ghost、3D寸法inline入力、Enter次欄、確認付き既存回復、
  origin XYZ、pivot、Scale handles、shortcut、生成drop、色/thumbnail/pin/順序設定を接続した。
  既存SVG view cubeを右上へ移して再利用し、追加の重複cubeは除いた。
- 旧成功の63件は旧公開headの証拠。今回のローカル失敗/修正履歴は次のとおり保持する。

| 証拠（work内JSON） | 実測 | 分類・対応 |
| --- | --- | --- |
| 018-target-resume → 018-auto-fix | 3成功1失敗 → 1成功 | Intersectionのarguments/toolsを既存役割へ明示 |
| 018-direct-initial → 018-direct-second | 4成功3失敗 → 7成功 | 新fixtureのbbox1e-7余白、cube遮蔽、複数対象理由の上書き |
| 018-direct-extra | 3成功 | 矩形選択、部分選択/context、生成drop |
| 018-pivot-delta / 018-cube-pivot | 各2成功1失敗 | pivotの期待点/裏側snap、既存cube再利用で再照合 |
| 018-pivot-visible / 018-plane-recheck | 3成功1失敗 / 1失敗 | 点作図中の量handleが次点クリックを拾った。点作図から除外 |
| 018-additions-final-target | 16成功、43.675秒 | 上記修正後のdirect/review対象 |
| 018-boundaries-final / 018-boundaries-2 | 各3成功1失敗 | 投影寸法とgizmo干渉、配列dragと矩形選択の競合を修正 |
| 018-final-direct（14件予定） | 最終集計未取得 | 7件目まで開始を観測、process参照不能。完走/合格とはしない |
| 018-browser-full-final | 78成功2失敗、319.030秒 | 部分選択時の全体handle、curve edge再クリックで誤Fillet開始 |
| 018-final-boundary-target | 4成功1失敗 | 上記後者が残存。curveにはsolid Filletを開始しない |
| 018-selection-fix | 2成功、13.0秒 | 元の2選択fixtureをassertion変更なしで再照合 |
| 018-edge-drag → 018-edge-drag-fix | 1失敗 → 1成功、4.5秒 | 実dragでform未構築を修正。Fillet7/Shift-Chamfer6を実測 |

native対象4件の初回3成功1errorはfixtureのexport/import message名を修正して4成功。
全件実行での数値assertion、個別45秒timeout、retries0、workers1は緩和せず、skip/xfail化なし。
新fixtureのbboxは既存kernel境界余白1e-7を含む値を1e-6契約内で検証し、既存toleranceは不変。
最終codeのNode24.22.1/Node20.20.2は各212成功/失敗skip0、native89件中87成功/任意USD2skip。
local Rustはcargo不在で未実行。実Mac/Tauri/OS dialog/Issue37も未実施。追加最終browser/CI/mergeは
後続結果で区別し、旧結果から推測しない。途中のボード09:12時刻記載は09:04の誤記として追記訂正済み。

### 指示018 追加分の最終ローカル結果

最終製品codeを固定して、Node24.22.1 `npm test`212成功、Node20.20.2全JS212成功、
native89件中87成功/任意NVIDIA USD2skip（5.676秒）を実行した。
`npm run test:browser`全81件は81成功、失敗/skip/retry/flaky0、errors[]、318.137秒（約5分18秒）。
個別timeout45秒、workers1、retries0は維持。旧80件の2失敗を成功へ置換せず、別の全件runとして記録する。
Scale v2のsnapshot/Open復元、実edge dragのFillet/Shift-Chamfer、配列の形状drag/個数/間隔/取消、
cursor zoom、旧選択/lock/hide/生成/maintenance全件を含む。構文確認とdiff checkも成功。
idle/edit/plane-hover、直接操作寸法/gizmo、配列drag画面を目視した。検証環境の日本語font欠落による
文字表示は実Macの評価へ代替しない。local Rustと実Mac/Tauri/OS dialogは未実施のまま。
最終sourceのCI全run/jobとmergeは公開後にPR44とボードへ別記録し、ここでは成功を先取りしない。

### 2026-10-31 09:53 JST — マージ後mainの新規失敗、要判断

source2330cc17805c5d787a3276f127e10bb0f18e0bbeのpush41150300256/PR41150305530は
各attempt1・全3job成功。全6job生ログで各JS212/native87+任意USD2skip/Rust22/browser81を確認した。
browser step/jobはpush5分47秒/6分32秒、PR9分26秒/10分19秒で15分内、CI再実行なし。
PR44は09:39:39 JSTにmerge commit912702f48c71581aa3f5de3530709539aa469ed2でmainへマージした。
local2d2842b/source/CI merge93a1ad3/実mergeはtree d9bdf2e38ce2b36b8eb36c12e0228da89e21c6aa一致。
対応Issueがないため自動close対象なし。09:40の完了記録はこの時点の履歴として保持する。

その後のmain checks41151365106 attempt1はfailure。JS212成功、native89件87成功/任意2skip、
Rust22成功、browser80成功1失敗（7.7分、retryなし）。job timeoutではなくassertion failure。
cad-ui-review.spec.mjs:142の自動Extrude＋UnionのUndo/Redoで、Redo後feature数5期待に対し4だった。
artifact13023557423のSHA256は2449a56681919aaf00a32cce545ceefbe4b7d3543c382d0b68b3b0ae31952250。
取得bytesの一致を確認し、traceでUnion running339799.683ms、Undo339821.997ms、Redo339897.081ms、
最終history Box/Rectangle/Planar Region/Extrude（Unionなし）を確認した。

store.addはdirty featureを公開後にrecompute/transaction記録を待ち、UIの合成は後でsquashLastする。
Undo/Redo key handlerはcommitBusyを確認しない。合成中入力競合は原因候補だが安全な修正は未検証。
既存の間欠失敗やfixtureだけの問題と分類して除外せず、018を要判断へ更新した。
@Museへ「合成完了までUndo/Redo要求を保留、確定完了を待つfixture/遅延Union回帰」の案と、
既マージPR44の後続修正指示/PRの扱いを確認。既存PR優先・重複PR自作禁止を保持する。
新規Issue/PR、CI再実行、追加製品実装、push/再merge/rollbackは未実施。
この追記は記録だけのローカル未commit差分で、公開済みhead/treeを変更しない。
014〜017予約、実機#37とPR43未着手。source成功・local81成功をmainの失敗へ転用しない。

### 2026-10-31 10:24 JST — 指示019 自動Extrude複合commitのUndo/Redo競合修正

ボード10:13の指示019を未着手から取得し、指示014は予約へ戻した。原因は製品側だった。
`store.add()`がUnion featureをdocumentへ公開してからrecompute/transaction記録を終えるまでの間も、
workspaceのbutton/keyboard Undo/Redoが即時にtransactionsへ入れたため、Extrude/Unionの2 transactionを
`squashLast(2)`する前に履歴stackが崩れた。既決の「複合は1単位」仕様は変更していない。

workspaceにcommit中のhistory action queueを追加し、button/keyboardのUndo/Redoを確定完了後に入力順で
実行する。button Undoのsession/preview取消も実行時まで遅らせる。commitの成功/失敗にかかわらずfinallyで
queueをflushし、保留中/実行済みをstatus表示する。transactions本体、CAD演算、schema/bindingは変更しない。

browser回帰はUnion featureが追加された直後のrecomputeだけを明示gateで停止し、その間のCtrl+Z/
Ctrl+Shift+Zが実行されずqueueされること、解放後に各1回実行され最終5 featureへ戻ること、さらに通常の
Undoで3、Redoで5へ戻ることを確認する。初回は停止中DOMが再描画前の4件だったため1失敗
（`019-target.json`、expected0/unexpected1、9.083秒）。製品修正の失敗ではなく観測点の問題と確認し、
正本documentの5件を直接待つよう直した。修正後対象1件は1成功（4.905秒）、同条件repeat10は10成功
（45.197秒）。assertion/timeout/retry/許容差を緩めず、skip/xfail化なし。

最終ローカルはNode24.22.1 `npm test`212成功、Node20.20.2全JS212成功、native89件中87成功・
任意NVIDIA USD2skip（5.396秒）、browser全81件81成功（失敗/skip/retry/flaky0、errors[]、
318.776秒）。local Rustはcargo不在で未実行。実Mac/Tauri/OS dialog/Issue #37も未実施。
A/T/R 62行の状態は変更せず、今回の回帰証拠だけを検証台帳へ追記する。公開・CI・PR・merge結果は
後続で区別して記録し、上記ローカル成功から推測しない。

## 2026-10-31 14:34 JST — 指示014 / Issue #16 実装開始と対象fixture

ボード014を未着手から作業中へrequiredRevisionId付きで取得した。開始前にmain checks
41156200829 attempt2の全3job success（JS212/browser81、native87+任意USD2skip、Rust22）を確認。
Issue #16をC11/C12、E12〜E14、S04/S06〜S11の明示入力・正常/失敗・複数出力・accuracy・
Undo/Redo/v2/fresh runtimeまで具体化した。015〜017、#37、PR #43へは着手していない。

`curve.helix`/`curve.spiral`、境界抽出4mode、方向Project/法線Pull、Intersect/Contour、
2 rail fitted Sweep2、NetworkSrf、Patchをnativeへ追加し、新commandをregistry/sessionへ登録した。
既存Section/SurfaceFromEdges/Revolve/Sweep1/Loftはv1を保持する。Sweep2のOCP auxiliary-spine
probeは不適合組合せでnative process終了を再現したため、そのAPIを成功扱いせず、両railを境界制約に
したfitとaccuracy記録へ置換した。これはSweep1の見かけ置換ではない。

対象native5件は5成功、JS2件は2成功。Project/Pull、Intersect/Contour/Section、Sweep2/Network/Patch、
typed failure、fresh runtime再読込を実OCPで確認した。実装途中のhelix期待式1失敗とunsafe Sweep2の
segmentation faultを成功へ置換せず、この履歴に保持する。全Node/native/browser、CI、PR、mergeは
この時点で未実行。local Rustと実Mac/Tauri/OS dialog/Issue #37も未実施。

### 指示014 最終ローカル検証

最終製品codeでNode24.22.1 `npm test`214成功、Node20.20.2全JS214成功、native96件中
94成功・任意NVIDIA USD2skip（6.810秒）を確認した。browser全83件は83成功、
失敗/skip/retry0、workers1、個別timeout45秒、5.5分。local Rustはcargo不在で未実行。

途中結果は成功へ置換しない。helix fixtureの期待式誤りは1失敗後に式を修正した。
OCP auxiliary-spine Sweep2 probeはnative segmentation faultを起こしたため採用せず、両railを
境界制約にする明示的なfitへ変更した。Networkは`NearestPoints`のbinding引数不一致、S04は
GeomFillの`No such curve`/filling style不適合を修正した。browser対象の初回はChromium実行体
未設定で2件が実行前失敗、設定後はNetwork/Patchのhidden save click待ちで2件timeoutし、既存fixtureと
同じDOM clickへ修正後2件成功。全browser最終runに再実行機構はなく、skip/xfail化、assertion・
timeout・許容差の緩和はしていない。CI、PR、merge、Issue自動closeは公開後に別記録する。

## 2026-10-31 — Issue #17 general surface editing start

- Instruction 015 was enabled and claimed from latest main
  `77e9e50a5cd55647cdbf045ff1a596717bd6ff94` (tree
  `8cf405e2730a7745eb2370402772f23393b637fe`). Post-merge main checks
  `41175647882` attempt 1 were already confirmed successful by instruction 014.
- The Issue body, roadmap, workspace specification §22.4/§22.6, master plan, and
  command-status ledger were reconciled. The resulting F01–F11 and D08/D09
  low-level operation choices, public contracts, provenance/save requirements,
  and fixture matrix are recorded in `docs/cad-surface-editing-plan.md`.
- This is an implementation-start record only. No surface-editing completion,
  local full-suite result, CI result, Ready/merge, or Issue closure is claimed.
  Issue #18 onward, real-Mac Issue #37, Draft PR #43, and layout changes remain
  outside this branch.

### 指示015 実装・ローカル検証（CI前）

- F01〜F11、D08/D09をregistry-first v2として具体化した。既存v1は保持し、
  Splitter/Sewing/Offset/Filling/finite-domain B-spline fitting等の採用演算、
  exact/approximate accuracy、selected subshape、複数出力slotを実装した。
- `native/test_surface_editing.py` は7件成功。選択境界Untrim、connector join、
  fresh runtime asset再読込、typed failureを含む。全nativeは103件中101成功、
  任意NVIDIA USD 2skip。Node24.22.1/Node20.20.2の全JSは各215成功。
- browser fixtureを2件追加したが、このlocal環境ではChromium実行体がなく、
  対象2件はtest body実行前に失敗した。Playwright browser取得も許可networkから
  0-byte応答となり失敗したため、成功へ置換しない。全browserはGitHub CIで実行し、
  その成否を確認するまでReady/merge/Issue closeを行わない。
- 初回native対象実行はunittest module path誤りでimport前失敗し、正しいdiscover
  invocationへ直した。選択Untrimは初回84 mm²のままというfixture失敗を検出し、
  serialized topologyでも幾何端点signatureで選択edgeを同定する修正後に7件成功した。
- 最初のPR CI `41187097638` attempt 1はJS215/native101+2skip/Rust22が成功した一方、
  browserは82成功・3失敗だった。新規2件はfixtureが簡略subshape refを渡したため
  D09/F08のselectorがmissingとなり、既存B08はv2表示名へ余分なsuffixを付けた回帰で
  `Explode Faces` button待ちtimeoutとなった。subshape refを保存契約どおり完全化し、
  v1/v2共通UI labelへ修正した。失敗runを成功へ置換せず、次runで再検証する。
- 2回目PR CI `41188011686` attempt 1はnative101+2skip/Rust22が成功し、browserは
  83成功・2失敗だった。前runの既存B08と新規D09、さらに新規2件目は成功した。
  新規1件目はasyncな`PathloomModel.snapshot()`をawaitせず`entities`を参照した
  fixture不備で失敗したためawaitを追加する。もう1件は既存P1-05 basic drawingの
  history countが期待3に対して2となった単発失敗であり、新規fixture失敗と混同せず
  次の通常push CIで再確認する。この時点でCI再実行、Ready、mergeは行っていない。

### 指示015 最終PR CI（Ready前）

- fixture修正head `9ad5b53d599b73d11051c06b1f2667d364b9137b` のPR CI
  `41188879708` attempt 1は全3job成功した。生ログでNode20.20.2 JS 215成功、
  native 103件中101成功・任意NVIDIA USD 2skip、macOS Rust 22成功、
  browser 85成功（失敗/skip/retry/flaky 0）を確認した。前runで失敗した新規保存fixture、
  既存P1-05、既存B08はいずれもこの全件runで成功した。CI再実行は行っていない。
- ローカルの正しい通常コマンドによる最終Node24.22.1 `npm test`は215成功。
  その直前にNode test runner非対応の`--runInBand`を付けた確認コマンドがtest開始前に
  失敗しており、製品test失敗や成功へ置換しない。ローカルbrowserはChromium取得不能、
  local Rustはcargo不在のため未実行のままである。実Mac/Tauri/OS dialog/#37も未実施。
- command-status ledgerのF01〜F11/D08/D09はPR CI browser 85成功へ更新した。
  PR Ready、merge、Issue自動closeはまだ実施しておらず、最終文書commitのCI後に別記録する。

## 2026-10-31 — 指示016 / Issue #18 Sweep系の検証・公開開始

- ボードを未着手から作業中へ競合制御付きで取得した。開始時に指示015のmerge commit
  `241eae0bfd6422fbcaf284cc4a247194639837e2`と、post-merge main checks
  `41190392140` attempt 1のcompleted/successを確認した。
- Issue #18をS08/S10/S11/F08/F09/F10の6演算へ具体化した。採用OCP API、公開registry、
  正常/typed failure、近似分類、要求許容差と実測偏差、fresh runtime、Undo/Redo、v2
  Save/Openを受入範囲とし、`cad-sweep-publication-plan.md`へ測定契約を記録した。
- 実装ではSweep2の全fit/rail/section偏差、Networkの交点gap/fit偏差、Patchの要求/effective
  許容差/偏差、Blend/Matchの境界偏差と連続性、Rebuildの対応parameter sample実測偏差を
  個別にaccuracyへ保存する。startup probeも6演算を個別に実OCP実行する。
- 最初の`python3 -m unittest native/test_cad_runtime.py`はmodule検索pathが合わず、test開始前に
  `ModuleNotFoundError: cad_runtime`で失敗した。正しいdiscover invocationへ直した対象12件は
  12成功。製品/fixture失敗へ置換せず、この履歴を保持する。
- 現時点で全Node/native/browser、CI、PR、merge、Issue自動closeは未実施。local Rust、
  実Mac/Tauri/OS dialog/Issue #37も未実施。指示017、Draft PR #43、UIレイアウトには着手しない。

### 指示016 実装・ローカル検証（CI前）

- startup probeは従来の基本3件にS08/S10/S11/F08/F09/F10を加え、全9項目を実OCPで
  `verified`とした。6演算の実測値は`cad-sweep-publication-plan.md`へ記録した。
  F08/F09はnative fixtureでG0/G1/G2を全て実行し、要求/達成連続性、境界偏差、
  G1/G2 error、参照側不変を照合した。F10は非平面有限面を再fitし、要求許容差を
  偏差へ代入せず、対応parameter sampleの距離を実測する。
- 最終ローカルNode24.22.1 `npm test`は216成功、Node20.20.2全JSも216成功。
  native全103件は101成功・任意NVIDIA USD 2skip。対象native 7+7+12件とJS4件も成功。
  local Rustはcargo不在で未実行。実Mac/Tauri/OS dialog/Issue #37も未実施。
- local browser用Chromiumの取得を実行したが、Playwright CDN応答が各回0 MiBで、
  zip central directoryを読めず5回失敗後exit 1となった。browser test bodyは未実行で、
  成功へ置換しない。追加browser fixtureを含む全件はGitHub CIで確認するまで
  Ready/merge/Issue closeを行わない。
- `npm ci`は成功。依存symlinkは検証専用ignored領域だけに作成し、製品依存は変更していない。
  PR、CI、merge、Issue自動closeはこの時点で未実施。

### 指示016 製品実装headのpush/PR CI（最終文書commit前）

- 製品実装head `07bf8ec9d72a65144dc2dc5b7adb974d80e0cb2d` のpush CI
  `41197184623` attempt 1とPR CI `41197198172` attempt 1は、いずれも全3job成功した。
  全6jobの生ログを照合し、各runでNode20.20.2 JS 216成功、native 103件中101成功・
  任意NVIDIA USD 2skip、macOS Rust 22成功、browser 85成功（失敗/skip/retry/flaky 0）を
  確認した。CI再実行は行っていない。
- local browserはChromium取得失敗のためtest body未実行、local Rustはcargo不在で未実行の
  ままであり、CI成功へ置換しない。直接`git push`も認証情報不在で失敗したため、同一tree
  `7398beef4b30c21fc0ccd0b51d3f0a34eba0e864`をGitHub Git Data APIでbranchへ反映した。
- Draft PR #48は作成済みだが、この記録を含む最終文書commitのpush/PR CIを確認するまで
  Ready、merge、Issue自動closeは行わない。指示017、Issue #37、Draft PR #43は未着手。

## 2026-10-31 — 指示017 / Issue #19 65 ID fixture台帳の開始

- 最新main `e6926ce08767f72dd75b771f3675a2dcbd19297b`から
  `feat/19-cad-fixture-ledger`を作成した。PR #48のmerge commit、Issue #18 close、
  post-merge main checks `41198890516` attempt 1成功を開始時に再確認した。
- Issue #19へ正規65 ID、必要/採用/未対応モード、正常/失敗fixture、残制約、
  欠落の自動監査を具体化した。未対応モードの新規製品実装、Issue #37、Draft PR #43、
  Phase 4は対象外とし、未完了を隠さない。
- `cad-65-command-fixtures.json`とJS監査2件を追加し、対象実行は2成功。
  C01〜C10/S01/S02/S05を実OCPの正常/typed failureへ通すnative fixtureを追加した。
  最初の対象nativeコマンドは`.pathloom-runtime/python/bin/python`不在でtest開始前に
  exit 127となった。`npm run cad:setup`は成功し、同じ対象native 1件は再実行で成功した。
  この環境準備失敗を製品test失敗や最終成功へ置換しない。
- 最終ローカルNode24.22.1とNode20.20.2の全JSは各218成功。native全105件は
  103成功・任意NVIDIA USD 2skip。対象nativeはbaseline 1成功、Phase 3曲面7成功、
  一般面編集7成功、領域/立体14成功。local Rustはcargo不在で未実行。
- local browser全85件はChromium実行体がないため、全件がtest body実行前のlaunchで失敗した。
  `npx playwright install chromium`も5回とも0 MiB/truncated zipで失敗し、成功へ置換しない。
  GitHub CIでbrowser全件が成立するまでReady、merge、Issue自動closeを行わない。
  実Mac/Tauri/OS dialog/Issue #37も未実施。PR/CIは現時点で未実施。

### 指示017 製品実装headのPR CI（最終文書commit前）

- 同一tree `a9d49d6ead2bbc9e00ca0f5d582f2fe0d7416b9c`をGitHub Git Data APIで
  `feat/19-cad-fixture-ledger`へ反映し、Draft PR #49を作成した。直接`git push`は
  認証情報不在で失敗したため、成功へ置換しない。
- PR CI `41213068913` attempt 1はNode20.20.2 JS 218成功、native全105件中103成功・
  任意NVIDIA USD 2skip、macOS Rust 22成功だった。browserは既存
  `P3 command reorder requires edit mode and object drag creates a ready generation binding`が
  `C04`と`C02`の順序assertで1件失敗し、84成功・1失敗となった。
- 失敗jobだけを1回再実行したattempt 2はNode20.20.2 JS 218成功・browser 85成功
  （失敗/skip/retry/flaky 0）。全job生ログを照合し、attempt 1の失敗をattempt 2成功で
  置換しない。local browser未実行、local Rust未実行もCI成功へ置換しない。
- この記録を含む最終文書commitのCIを確認するまで、PRはDraftのままReady、merge、
  Issue自動closeを行わない。Issue #37、Draft PR #43、Phase 4には着手しない。

## 2026-11-01 — 指示020 / Issue #20 command DSL・AI command編集の開始

- 最新ボードの指示020を`未着手`から`作業中`へ`requiredRevisionId`付きで変更し、
  読み戻してから着手した。最新main `5ca4de9032b95c1017174a10dd9247dc7f924735`
  から`feat/20-command-dsl`を作成した。これはPR #49のmerge commitであり、Issue #19の
  自動closeも確認済み。post-merge main checks `41215926987` attempt 1は全3job成功し、
  生ログでNode20.20.2 JS 218成功、native全105件中103成功・任意NVIDIA USD 2skip、
  macOS Rust 22成功、browser 85成功を確認した。Deploy Pages `41216783212` attempt 1も成功した。
- 正規65 IDを単一registryから可逆変換する`PATHLOOM COMMAND DSL 1`、行単位のtyped診断、
  alias衝突の新名・別alias・中止、既存版を上書きしない文書版固定、明示的upgrade/rollback、
  既存ローカルAI接続を再利用した新version提案と適用前レビューを実装した。任意JavaScriptは
  評価せず、native operationの意味変更も許可しない。S系コマンド意味、Issue #37、
  指示021〜024、Draft PR #43、Phase 5以降は対象外とした。
- 追加unit 5件の初回対象実行は5成功。追加後最初のNode24.22.1全JSは223件中222成功・
  1失敗だった。既存のcommand adapter testが小文字`collision`を期待した一方、新typed errorの
  messageが大文字`COLLISION`のみだった互換性失敗であり、error codeを維持したまま旧来の
  `Alias collision`文言を併記して修正した。失敗runを後続成功へ置換しない。
- 追加browser 2件の初回はPlaywright実行体不在でtest body前に失敗した。
  `npx playwright install chromium`もCDNから0 MiB/truncated zipとなり反復失敗後に中止した。
  npm配布Chromiumの初回展開は`chown` errorで空の`/tmp/chromium`を残し、最初のlaunchも
  test body前に失敗した。再展開後はfixtureが`.pathloom-runtime/python`不在で終了し、
  2件ともassert前に失敗した。OCPを備えたsystem PythonとFONTCONFIGを明示した最初の製品実行は
  1成功・1失敗で、失敗はtextareaへ`toContainText`を使ったtest側assertだった。
  `toHaveValue`へ修正した直後の追加browser再実行は2成功、失敗/skip/retry 0だった。
- catalog内で複数の新commandが同じaliasを持つ場合も登録前に検出し、既存registry、文書版、
  native operationを全件preflightしてから変更するようにした。最終のNode24/Node20全JS、
  native全件、browser全件、local Rust可否、PR/CI/merge/Issue closeはこの時点で未実施である。
- preflight回帰を1件追加した最終ローカル全JSは、Node24.22.1 `npm test`と
  Node20.20.2 `node --test tests/*.test.mjs`が各224成功（失敗/skip 0）だった。
  Python/OCP native全105件は103成功・任意NVIDIA USD 2skip、失敗0。local Rustは
  `cargo`不在で未実行。実Mac GUI/Tauri/OS dialog/Issue #37も未実施のままである。
- local browser全87件の最初の全件runは54成功・33失敗だった。最初のnpm Chromium展開が
  `chown` error後に実行体だけを残し、SwiftShader共有libraryを展開していなかったため、
  既存の描画系が`Error creating WebGL context`またはview未初期化で失敗した環境不備である。
  新規DSL 2件はこのrunでも成功したが、全件合格には使用しない。欠けていたSwiftShaderを
  明示的に展開した後、retry無効の全87件を再実行し87成功（失敗/skip/retry 0）を確認した。
  33失敗の履歴を後続87成功へ置換しない。PR/CI/merge/Issue自動closeはこの時点で未実施。

### 指示020 製品実装headのpush/PR CI（最終文書commit前）

- 同一tree `43f1e17c06bc0997919f57a8f19ea75ae30b76cf`をGitHub Git Data APIで
  `feat/20-command-dsl`へ反映し、Draft PR #50を作成した。直接`git push`は認証情報不在で
  失敗したため、成功へ置換しない。
- remote head `9d60d7524c2bde1f4dd3af8f4c9cceba53961f54`のpush checks
  `41263257447` attempt 1とPR checks `41263272109` attempt 1は、いずれも全3job成功した。
  全6jobの生ログを照合し、各runでNode20.20.2 JS 224成功、native全105件中103成功・
  任意NVIDIA USD 2skip、macOS Rust 22成功、browser 87成功を確認した。
- このCI記録を含む最終文書commitのpush/PR CIを再確認するまで、PRはDraftのままReady、
  merge、Issue自動closeを行わない。指示021〜024、Issue #37、Draft PR #43には着手しない。

## 2026-11-01 — 指示025 デスクトップ版CADランタイム起動失敗の緊急修正

- 最新ボードで指示021が予約へ戻り、指示025が`未着手`であることを確認した。
  `requiredRevisionId`付きで025だけを`作業中`へ変更し、読み戻してから最新main
  `fc43f9095aaf063fa3879206a420dfa8595dc3ee`から`fix/25-cad-runtime-bundle`を作成した。
  指示021〜024、Issue #37、Draft PR #43には着手していない。
- 原因は`native/cad_runtime.py`が`cad_operations`から公開する
  `curve_surface_creation.py`と`surface_editing.py`を、Tauri起動時のcacheコピー一覧が
  同梱していなかったことだった。同梱一覧を`CAD_RUNTIME_SOURCES`へ集約して2moduleを追加し、
  全非test `native/cad_operations/*.py`とruntimeがimportするnative直下moduleの不足・余剰を
  source treeから検査するRust回帰を追加した。
- `native/step_brep_bridge.py`は永続CAD daemonのbundleには不要で、`src-tauri/src/lib.rs`が
  `include_bytes!`から`app_cache_dir()/native/step_brep_bridge.py`へ別配置し、STEP face操作時に
  個別起動する経路を確認した。このため追加の仕様判断や`@Muse`停止は不要だった。
- ローカルNode24.22.1 `npm test`とNode20.20.2全JSは各224成功（失敗/skip 0）。
  native全105件は103成功・任意NVIDIA USD 2skip。manifestに列挙された8ファイルだけを
  一時cacheへ置くsmokeはdaemon hello（protocol 1、77 operation）成功。browser全87件は
  retry無効で87成功（失敗/skip/retry 0）。local Rustはcargo不在で未実行。実Mac GUI、
  Tauri transport、OS dialog、Issue #37も未実施である。
- browser準備では`npx playwright install chromium`が5回とも0 MiBの破損ZIPで失敗し、
  OS package導入もcontainerのsetgroups制約でtest前に失敗した。npm配布Chromiumの標準展開も
  `/tmp/fonts`のchown制約で失敗したため、同じnpm packageのBrotli archiveを所有権変更なしで
  一時領域へ展開して全件を実行した。これら環境準備失敗を87成功へ置換しない。
- PR、CI、Ready、mergeはこの時点では未実施。CIでRust回帰を含む全jobを確認するまで
  mergeしない。対象にGitHub Issueはないため`Closes`とIssue自動closeは行わない。

## 2026-11-01 — 指示021 / Issue #21 任意スケッチ拘束・ソルバー拡張の再開

- 最新ボードの指示021は一度`要判断`だったが、Museの指示に従ってSHA無指定のmain push runと
  main tipを再確認した。run `41278224707` attempt 1は全3job成功、head SHAとmain tipはともに
  `d5fa50388565b37d8d83db2128c71d31e04a7892`だった。`requiredRevisionId`付きで021だけを
  `作業中`へ変更し、読戻し後に同mainから`feat/21-sketch-solver`を作成した。
- sketchを一履歴項目として保つmodel、local origin、datum/linked/orphaned支持面、Point/Line/Circle、
  点-線上と軸対称を含む拘束、駆動/参照寸法、hard/soft drag、連結成分分離、変数/残差scale、
  rank/DOF/完全拘束/成分別診断、last-valid/draft、完全拘束色と警告表示を実装した。
  linked faceは再計算後centroid/normalへ自動追従し、topology消失時は最終平面を保持して
  `SKETCH_SUPPORT_MISSING`を表示する。
- 既存C系65 command UIの一括再配置は既存command契約/fixtureを横断するため本Issueの対象外とし、
  既存Rectangleから拘束付きsketchへ入る経路と共通model/solverを拡張した。E系契約は変更していない。
- 初回対象unitはT03/T04/T05と追加P4-02 4件が7成功。支持face自動追従fixture追加後の対象runは
  229件中229成功（Node test runnerのpattern外既存testも実行される構成）。途中のNode24全JSは
  228成功だったが、その後に支持面自動追従と1 fixtureを追加したため最終全件結果ではない。
- 追加browser対象の初回はChromium実行体不在でtest body前に失敗した。
  `npx playwright install chromium`も5回ともCDNの0 MiB/truncated ZIPで失敗した。この失敗を
  browser成功へ置換しない。最終Node24/Node20、native、browser、CI、PR、mergeは未実施である。
- 最終コードのbrowser全87件初回は86成功・1失敗。既存A05 fixtureの押出体積が期待80000に対して
  `79999.99991248752`となり、既存の4桁比較許容5e-5を差8.75e-5で超えた。新scale実装が
  公称hard許容1e-6へ入った時点で停止した数値精度不足であり、公称判定は変えず内部解を
  toleranceの1/100まで磨くよう修正した。この失敗を後続結果へ置換しない。
- 数値精度修正後、対象A05は単独1成功。最終ローカルはNode24.22.1 `npm test`と
  Node20.20.2全JSが各229成功（失敗/skip 0）、native全105件は103成功・任意NVIDIA USD
  2skip（失敗0）、browser全87件はretry無効で87成功（失敗/skip/retry 0）だった。
  local Rustはcargo不在で未実行。実Mac GUI/Tauri/OS dialog/Issue #37も未実施であり、
  自動テストやCIを実機合格へ置換しない。
- Issue #21へ対象拘束、支持面、診断、証拠、非対象範囲をコメントとして記録した。
  直接`git push`は認証情報不在で失敗し、成功へ置換しない。同一tree
  `d2e6a32c752620af17f0caa28de4ce28a3f671d6`をGitHub Git Data APIで
  `feat/21-sketch-solver`へ反映し、remote commit
  `43a6124d6cafa76ed646e207dbfa3626c779710c`、Draft PR #52を作成した。
  このPR/CI情報を含む最終文書commitのCIを確認するまでReady、merge、Issue自動closeを行わない。
- PR本文と台帳証拠を含むremote head `1bb9ef3846d38c6552bc777affc74b93ed3ce829`
  （tree `a115940e01c464133cc31618c10d5718ad945dfa`）に対し、push run
  `41306173848`とPR run `41306178277`はいずれもattempt 1で全3job成功した。各runの
  生ログはJS 229成功、native 105件中103成功・任意2skip、macOS Rust 23成功、browser
  87成功（retryなし）を示した。このCI証拠を追記する文書専用commitにも同じ全CIを要求する。

## 2026-11-01 — 指示022 / Issue #22 全体回復・未知版・Library移行

- 最新ボードで指示022が`未着手`へ有効化され、@codex返信がmain/PR #52/post-merge CI確認を
  要求していることを確認した。main `ea4ce7dd4c5bfe271ba06d5e7e16b1643855a702`、
  PR #52のmerge commit、post-merge run `41308110600` attempt 1 successのhead SHA一致を
  確認し、`requiredRevisionId`付きで022だけを`作業中`へ変更・読戻し後、
  `feat/22-recovery-migration`を作成した。023/024、Issue #37、Draft PR #43は触っていない。
- 対象を全project回復候補、未知project/CAD schema/operation版の原文保持読取専用経路、
  Component/Shape/Command Libraryのlegacy配列からtyped schema 1 containerへの無損失移行とし、
  着手前にCodexログとIssue #22へ記録した。既存CAD単体候補と既知版validatorは維持する。
- 初回Node24全JSは233成功（失敗/skip 0）。追加browser 2件の最初の実行はPlaywright実行体が
  未配置でtest body前に2失敗、`npx playwright install chromium`も5回とも0 MiBの破損ZIPで
  失敗した。この環境準備失敗を成功へ置換しない。既存の所有権変更不要Chromium実行体と
  runtime同梱OCP Pythonを明示した再実行は追加2件成功（失敗/skip/retry 0）。
- 既存CAD単体候補と新しい全project候補が同時にある場合は、既存候補の保留・破棄・回復を
  先に提示し、解決後に全project自動保存を再開する。Library形式変更に伴い、既存browserの
  Command Library読取りと回復ダイアログ処理もtyped container契約へ更新した。
- 修正前のbrowser全件（retryなし）は89件中83成功・6失敗だった。内訳は既存CAD回復2件、
  A19回復件数1件、新しい全project回復ダイアログを処理していない既存test 2件、旧Command
  Library配列を直接読むtest 1件であり、成功へ置換しない。回復候補の優先順位修正後、既存CAD
  回復6件とA19は限定再実行で成功した。ダイアログとtyped container期待値を更新した3件も
  限定再実行で成功した。
- 最終ローカルはNode 24.22.1とNode 20.20.2の全JSが各233成功（失敗/skip 0）、nativeは
  105件中103成功・任意NVIDIA USD 2skipだった。browser全件（retryなし）は89件中88成功、
  既存`P3 Move inference, Alt precision and Shift free rotation`だけが一度`angleRad`未設定で
  失敗し、同testの即時単独再実行（retryなし）は1成功だった。全件失敗履歴は保持する。
  追加browser 2件はこの最終全件runでも両方成功した。local Rustはcargo不在で未実行である。
- 直接`git push`はGitHub認証情報不在で失敗し、成功へ置換しない。Git Data APIで同一treeを
  `feat/22-recovery-migration`へ反映してDraft PR #53を作成した。最終headのCI生ログ確認、
  Ready、merge、Issue #22自動close、post-merge main CIは未実施である。
