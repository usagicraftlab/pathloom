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
`work/board-verification/003r/main-tests.config.mjs`でJSON reporterを追加し、
全体は`--output work/board-verification/003r/full-final-artifacts --max-failures=1`を指定した。
テスト本体、timeout45秒、assertion待ち時間は同じで、retryは0のまま。JSONの25件成功も確認した。
Python3.12.14/OCP7.8.1.1/Chromium153.0.8010.0で、Tauri transport・OSの保存/回復はfixture。
実macOS GUI・実Tauri IPC・OS保存/回復ダイアログ、ローカルRust、実機プリンターは未実施である。
known maintenanceのframe/通知待ちは今回のローカル全件では再発していないが、修正済みとはしない。

本件は[Issue #31](https://github.com/usagicraftlab/pathloom/issues/31)を追跡先とし、
`fix/31-browser-fixture-isolation`の1ブランチ・1PRで提出する。診断用コピーや計測用configは
PRへ含めず、テスト1ファイルと台帳2件・本ログだけを含める。


## 2026-10-27 JST — Issue #8 / P1-05 基本作図の操作経路

契約は Issue #8 本文。先行の計画コメント
<https://github.com/usagicraftlab/pathloom/issues/8#issuecomment-6429031348>
に続き、ユーザー経由で「#7完了」の開始合図を受けた。
#7 本文・Muse完了報告・PR #29 本文/コメントを再読し、main の merge
`225e1774f2e2de7fb44a3db23ea9a16e5799fc6a` と CI run
[40414667194](https://github.com/usagicraftlab/pathloom/actions/runs/40414667194)
の全3ジョブ成功を確認して、同 main から `fix/8-basic-drawing` を作成した。
同一headの別run 40414630011の失敗は成功扱いに置き換えず、今回の成功数にも含めない。
PR #2 (`25170e43`) は #8 相当の input/session/UI/store の参考とし、
丸ごとの取り込みや古い成功数の転記は行っていない。

### 対象・入力モード・変更理由

- C02 Line：始点→終点のクリック/座標欄、world XYZ・plane UV、相対指定。
  直前に受理した点を相対起点にする。方向＋長さは未対応とUIに表示する。
- C03 Polyline：連続クリック/座標欄、open/closed、相対XYZ、Backspace。
  点を戻すと入力点順と相対起点も戻す。自由な負Z/非平面入力を維持する。
- C04 Rectangle：中心＋幅/高さ、2コーナー、3点を専用UI/sessionで切り替える。
  逆順2コーナーは指定平面のmin/maxへ正規化する。3点は既存adapter通り
  A→Bを辺とし、CのABに垂直な成分を高さにする。零長/一直線/平面不一致を拒否。
  modeの往復では形状を保ち、登録済みcommand定義を書き換えない。
- C06 Circle：中心＋半径数値と中心→半径点。同一点/平面外/半径0を失敗表示。
  直径/2端点/3点は追加しておらず、未対応をUIと台帳に残す。
- Move（transform.move / shape.transform）：X/Y/Zを個別入力しmm/cm/mを処理する。
  objectは既存通り1形状。複数の事前選択を暗黙に先頭へ切り詰めず、対象選択を求める。
  事後選択、Shift追加/解除、重なり候補、ロック/非表示の除外を確認した。
- 作業平面：クリックが現在のsession planeを参照し、半径/中心長方形の第2点は
  中心を通る同方向の平面で取得する。UVの相対値にplane.originを重ねて足さない。
  #7と同じ有限ベクトル・正規直交軸の契約（1e-6）で座標変換を検証する。
  Offset固有の平面所属・設定診断は#7のnativeへ任せ、演算は変更しない。
- snap：endpoint、Circle/Rectangle中心、OFF、ロック/非表示除外。
  平面作図の第2点に平面外候補を渡さない。3点Rectangleや自由XYZ全体は平面に縛らない。
- キー：座標欄Enterは点を入力、canvas側Enterは1回だけ確定、Escは中断。
  formの暗黙submitを抑え、text編集中のDelete/Backspace/Ctrl+Z、IME Enterを奪わない。
  入力途中の無効な値はその場の編集状態に保持し、前の値でプレビュー/確定しない。
  有効なクリック/座標/平面選択で置き換えた欄だけ、その編集エラーを解除する。

### 共通ファイルと互換性

`cad/commands/input.js` は座標算術・有限値・作図frame検証、`session.js` は
Rectangleモードと単一Moveの事前選択、`workspace-ui.js` は上記操作に限定した。
`view-adapter.js` は画面に残るロック/非表示選択対象をpick候補から除く2箇所のみ。
`store.js` は保存する `command.mode` を実際のRectangle modeにする **1行だけ**。
#4の結果適用guardと#5の `validateDifference` を保持した。

文書v2・command ID/version・native要求/正本形式は変更しない。
既存centerのfeatureはそのまま読み込め、新規featureには実作図modeを記録する。
編集中の無効値MapはこのUIだけの一時状態であり、raw draft保存/回復の新契約ではない。
#9のbinding→ツールパス/G-code、#10のOpen/autosave/recovery基盤、Museのnative、
`.github/workflows/ci.yml`、他担当ブランチ/PRは変更していない。

### fixture・実行コマンドと結果（初回・#6反映前、Linuxローカル）

Node **24.22.1 / 20.20.2**、Python **3.12.14**、OCP **7.8.1.1**。
初期に実行環境との接続が途切れたが、復帰後に同じ作業treeを確認して実行した。
Playwright通常downloadの不完全zipはテスト成功と扱わず、既存のChromium
**153.0.8010.0** (`/tmp/pathloom-b-chrome-runtime/chromium`) を明示して実行した。

| コマンド/条件 | 実測 |
| --- | --- |
| 変更前 main `225e1774` で `npm test` | 171成功、失敗/skip 0 |
| 変更前 input.js に同じ相対UV assertionを適用（Node24） | 失敗を再現：期待[6,6,9]に対し[16,26,39]、exit 1 |
| `node --test tests/cad-basic-drawing.test.mjs` | 新規7件成功（座標/単位/frame、Rectangleモード/退化、Move複数事前選択） |
| `npm test`（Node24、初回製品コード） | 178成功、失敗/skip 0、約2.33秒 |
| `npm exec --yes --package=node@20.20.2 -- node --test tests/*.test.mjs` | 178成功、失敗/skip 0、約3.17秒 |
| `python -B -m unittest discover -s native -p 'test*.py'` | 45検出、43成功・任意USD2skip、約2.06秒。#7の3件を含む |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tmp/pathloom-b-chrome-runtime/chromium PATHLOOM_FRONTEND_DIR=desktop-dist PATHLOOM_BREP_PYTHON=python npm run test:browser` | packaged frontend準備後、全31件成功・失敗/skip 0、約1.3分（既存24＋#8新規7） |
| 同環境で `npm run test:browser -- --grep 'preserve geometry, mode'` | plane保存の明示assertionを追加後、対象1件成功、約3.7秒 |
| `git diff --check` | 成功 |

browserは実mouse/keyboard・ray-plane・実Python/OCPで正本/bbox/点列を照合し、
Tauri IPC・OS dialog・storageだけをfixtureで代替する。
カメラ準備のみ既存view-cube actionを呼ぶ（軸方向では見えないfaceがあるため）。
数値入力は正確なbbox、mouse入力は現在のworld/pixelに基づく量子化誤差で比較する。

新規7シナリオは三モードの数値/クリック・mode/plane保存、相対Polyline、Circle/Move、
Shift/事前事後選択/snap、XY/XZ/YZ/任意平面→Offset成功と不一致診断、
拘束幅60→80→矛盾幅20のno-convergenceを含む。拘束では前回正本hashとbbox、
Undo/Redo、通常Save/reopen後の未収束draftを実測した。
T02の元の回転XY数値組は今回未実施でpartialを維持し、代わりの負Z/垂直3点fixtureを明記した。

途中の失敗を成功へ書き換えない：途中の実行では重なり選択dialogを未選択、mouse座標を
厳密一致で比較したassertion、非表示のcube face locator、solverの約1.4e-8の
丸め差によるbbox厳密一致が失敗した。対象を選ぶ実操作・camera setup・pixel/数値許容差へ
fixtureを修正し、対象7件と上記全31件を通した。固定sleepによる回避は入れていない。
また有効点で無効な編集欄を置換してもエラーが残る経路を修正し、そのCircle/平面選択と
プロパティ欄→相対座標の混在操作も初回全体browserで確認した。

### 未実施・次の開始地点

実macOS GUI、実Tauri→Rust IPC、OS Open/Save dialog、Cmdキー/VoiceOver、
.app/.dmg build、全拘束/角丸/dragの組合せは未実施。ローカルRust全体は未実行。
browserの通常Saveを#10の保存/回復全条件完了とはしない。

次は同一headのpush/PR CIを確認し、jobごとの実測をPR本文とIssue #8へ追記する。
CI設定変更が必要な場合も提案に留める。Draftのレビュー後、ユーザーの指示を待つ。
mainへのマージ/Issue手動close、#9/#10の着手は行わない。

### Issue #8 初回CIの失敗切り分けと、入力エラー表示の追加修正

初回head `794942895ded425c8b228ab9a75274b340c8954c` の2runを直接照合した。
両方とも Node20 JS178成功、native45検出/43成功/任意USD2skip、macOS arm64 Rust21成功。
Chromium156の導入は両方とも完了し、browser工程まで到達した。

| run/job | browserの実測と失敗箇所 |
| --- | --- |
| [PR 40418763620 / job121907569126](https://github.com/usagicraftlab/pathloom/actions/runs/40418763620/job/121907569126) | 30成功/1失敗。#8新規7件は成功。既存 `maintenance.spec.mjs:115` のidle viewportでaxis=top確認直後のframe数が0（期待>0） |
| [push 40418688481 / job121907318530](https://github.com/usagicraftlab/pathloom/actions/runs/40418688481/job/121907318530) | 30成功/1失敗。新規Circleの平面外点エラーが、先行していたプレビューの成功メッセージに上書きされた。#8の6件と既存viewportは成功 |

同じheadでも、この2runは異なる原因だった。JS/npm test失敗やChromium取得失敗とはしない。
既存viewportは `app.js` のaxis同期更新とrAF予約に対し、fixtureがaxisだけ待って
frame数を一度読む待機競合と推定する。#7の失敗runも直接確認し、
[40414630011 / job121894327764](https://github.com/usagicraftlab/pathloom/actions/runs/40414630011/job/121894327764)
はJS171成功・browser23成功/同じframe数0の1失敗だった。
ローカルの既存idle fixtureを `--grep 'idle viewport stops frame polling' --repeat-each=10`
で追加照合すると10成功（25.3秒）。CIの失敗を解消したとは記録しない。
提案はframe数そのものをpollすること。既存maintenance/app/ci.ymlは今回変更しない。

一方、Circleのエラー上書きは#8の操作契約に含まれるため修正した。
座標欄/クリックで点を拒否した時、sessionのpreviewSequenceを進めて古い結果を破棄し、
予約timerとpreviewAgainを解除する。#4のStore guardを利用し、Store自体の変更は増やさない。
数値欄のエラーでも同じ無効化を使い、前の成功表示で入力エラーを消さない。

新規7番目のbrowser fixtureで有効Circle previewを明示的に保留し、
同一点/平面外点を拒否→元の実OCCT処理を解放→jobs完了を待つ順序を固定した。
固定sleepや通知を見落とすassertionへの置換ではない。
修正前はCIと同じ「同じ平面」対「プレビュー · まだ確定していません」で失敗を再現（exit1）。
修正後、同環境の `npm run test:browser -- --grep 'mouse Polyline/three-point' --repeat-each=3`
は3成功（16.2秒）。追加修正後の全体回帰と新headのCI結果はPR本文に追記する。

### Issue #8：#6マージ後のmain統合と最終ローカル再検証

作業中に #6 / PR #28 がmainへ入り、最新mainは
`c3655574468cd8a299adf3b173eba4c021ab650c` になった。
#8の追加修正を同じ専用ブランチへcommitし、このmainへrebaseした。
競合は開発ログの末尾追記1箇所だけで、#6の全章と#8の章を両方残した。
Store/UI/台帳の自動mergeも比較し、mainのDifference/Split/Offset・参照/binding修復を保持。
mainとの差分で `store.js` は引き続きcommand.modeの1行だけ、native・ci.yml・
Difference/Split専用module・既存browser specの変更はゼロである。

追加修正後、#6反映前にもJS（Node20/24）各178成功、native43成功/2skip、
browser31成功を再確認した。その後、rebase後に全件を改めて実行した結果は次の通り。

| 実行コマンド（上記と同じLinux/Chromium環境） | rebase後の実測 |
| --- | --- |
| `npm test` / Node24.22.1 | 192成功・失敗/skip0、約2.69秒 |
| `npm exec --yes --package=node@20.20.2 -- node --test tests/*.test.mjs` | 192成功・失敗/skip0、約5.20秒 |
| `python -B -m unittest discover -s native -p 'test*.py'` | 51検出・49成功/任意USD2skip、約2.91秒 |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tmp/pathloom-b-chrome-runtime/chromium PATHLOOM_FRONTEND_DIR=desktop-dist PATHLOOM_BREP_PYTHON=python npm run test:browser` | 32成功・失敗/skip0、約2.1分（mainの25件＋#8の7件） |
| `git diff --check origin/main...HEAD` と共通ファイル照合 | 成功。#4のrace、#5 Difference、#6 Split、#7 planeを保持 |

古い成功数を新headへ転記したものではない。初回CIの2種類の失敗も前節に残す。
新headのpush/PR CIは、この検証後に別runとして確認し、PR #30本文とIssue #8へ記録する。
実macOS GUI/実Tauri/OS保存、ローカルRustなど未実施範囲は前節の通り。
この#8作業ではDraft・未マージを維持し、#9/#10へ着手しない。

## 2026-10-27 JST — 指示002（続き） / PR #30 の最新main統合とマージ仕上げ

ボードに追加された続き指示に従い、実装・検証後に止まっていた既存PR #30を再開した。
現行ボードはReady化と条件成立後のマージコミット方式によるmain反映まで許可している。
上の旧作業時点の「Draft・未マージを維持」「ユーザーの指示を待つ」は過去の記録であり、
今回の停止条件としては用いない。新規ブランチ/PRを作らず、fix/8-basic-drawingを継続する。

照合した最新mainはPR #32マージ後の`4306305f459f3b903efd9d3cf452f15954810fc4`、
treeは`9ae0c2a90f57f274181f9e799ba7ee956b636866`。再開前PR headは
`793f1a4238c0ec93f828e413d62e90afbee1920f`、treeは
`209fcc8036bcbf11aee78be89d764ed1766faad2`である。
最新mainの4変更ファイルをblob SHAとtreeで照合したローカルsnapshotに#8を統合した。
競合は開発ログ末尾への別々の追記1か所のみ。共通の元本文に、mainのIssue #31の章と
PRのIssue #8の章をそれぞれ原文のまま連結して両方を保持した。
製品コードと#8のテスト/fixtureは旧PR headとbyte単位で一致し、Differenceのspecは
PR #32反映後mainと一致する。D02の機能台帳行もmainのまま保持した。
今回新たな製品実装、assertion/timeout/retry、native、CI設定の変更はない。

### 統合後の全検証（今回実行した結果）

環境：Linux、Node24.22.1 / Node20.20.2、Python3.12.14、OCP7.8.1.1、
Chromium153.0.8010.0。テスト対象の統合treeは
`3c1d8f4bf13fff3b7bac52c5b8d79367632307b1`。
この後の変更は本結果と検証台帳への追記だけで、実装・テストのblobは変えていない。

| コマンド / 検証 | 結果 |
| --- | --- |
| `NODE_OPTIONS=--test-reporter=tap npm test` / Node24.22.1 | 192成功/0失敗/0skip、exit0、約3.44秒 |
| Node20.20.2の`node --test tests/*.test.mjs`（全ファイルを展開） | 192成功/0失敗/0skip、exit0、npm起動含め約11.74秒、テスト自体約3.61秒 |
| runtime Pythonの`-B -m unittest discover -s native -p 'test*.py'` | 51検出＝49成功/任意USD2skip、exit0、テスト約3.06秒 |
| packaged frontendの`npm run test:browser`全件 | 32成功/0失敗/0skip/0flaky、exit0、約97.91秒。#8の7件・Difference3件・Split1件を含む |
| 台帳 / 互換性 / `git diff --check` | 65機能・14列、D02保持、製品/テスト差分とnative/CI無変更を照合、成功 |

Node20の初回呼出しは補助スクリプトがワイルドカードを展開せず、パス未検出でexit1、
テストは未実行だった。ファイル一覧を展開した上記再実行の成功とは区別する。
統合用の補助照合でも初回に共通空行の扱いと台帳ID抽出範囲でassertion停止があった。
照合方法を修正し、追記原文を両方保持したことと65機能全行を再確認したものであり、
製品コードやテストを緩めて成功させたものではない。

browserは既存configのworker1・timeout45秒・retry0を維持し、ignoredの
`work/board-verification/002cont/browser.config.mjs`でJSON reporterと専用出力先だけを追加。
CI=1、PATHLOOM_FRONTEND_DIR=desktop-dist、runtime Python、既存Chromiumの実体を指定した。
JSON集計もexpected32/unexpected0/skipped0/flaky0、errors=[]で一致する。
生ログとJSONは`work/board-verification/002cont/`にある。
実macOS GUI/Tauri IPC/OS dialog、Cmd/VoiceOver、.app/.dmg build、ローカルRust、
実機プリンター、全拘束/角丸/dragの組合せ、T02元の回転XY数値組は未実施のままである。
既知のmaintenance間欠失敗も、この全件成功で解消済みとは扱わない。

再開前headの成功run40421181969/40421186808、初回headの失敗run40418688481/40418763620は
別の履歴としてPR本文に保持する。最新mainへrebaseした新headの全CI、Ready化、
マージコミットとIssue #8自動クローズの結果はPR本文とボードへ実際の確認後に記録する。
この段階のログだけでCI成功やマージ完了とは扱わない。#9/#10へは先行着手しない。

## 2026-10-27 JST — 指示004 / Issue #9 — 更新追従と失敗復旧（要判断）

契約はIssue #9の3完了条件。指示004をrevision guard付きで未着手→作業中へ変更し、
読戻し確認後に開始した。依存Issue #4〜#7はclosed。開始時mainは
`5defb1778f2058940c0d54e91b747d7ef8b2a71c`、treeは
`c302dc84bbca55e88bcce057a61bfc6bd906a8c1`。このtreeと照合した独立checkoutで
専用branch `fix/9-cad-generation-recovery` を使用する。既存の#9用branch/PRはなかった。
#10/#11は予約であり着手しない。

### 修正前の証拠

実OCPのRectangle→Extrude→FilletをUIで作成し、通常v2プロジェクトfixtureで
そのbody binding→Slice STEP→Build Toolpathを配線する。断面計算もTauri transportだけを
置換し、実際の`native/occt_brep_bridge.py`をRustのslice_step_brepと同じaction/引数で呼ぶ。
生成worker、出力検証、G-codeはアプリの実装を実行する。

- 最初の有効fixtureによる3件：1成功/2失敗、exit1、約65.51秒。
  寸法60→80、Extrude体積60000→80000、semantic edgeを再選択しないFillet追従、
  実断面とG-code幅60→80は成功した。1失敗はFilletがCAD_REFERENCE_MISSINGでfailedなのに
  body-result bindingがreadyとなるもの。もう1失敗はテスト初期化で非表示の旧Newボタンを
  クリックしたfixtureの45秒停止で、製品不具合には数えない。
- 初期化を既存handler呼出しに直して対象2件を再診断：2失敗、exit1、約27.41秒。
  失敗FilletにはlastValidが残っている一方、同じbodyのtipとbinding.resolvedProducerが
  上流のExtrudeへ戻っていた。更新されたExtrudeをreadyとして渡し、下流の失敗を飛ばしていた。
  添付JSONにはRectangle/Extrude/Filletの同じbodyIdと各slot、failed/readyの矛盾を記録した。
  別の正常グラフには無関係なcad-* inputが自動追加され、非アクティブな更新グラフを
  表示どおり選択しても再計算が始まらず、G-codeは`updated; select this graph to recalculate`
  のまま停止した。

証拠は`work/board-verification/004/baseline-product.json`、`baseline-details.json`と
対応するartifact/trace。添付missing-reference-state/inactive-graphsはJSON reporterにも保持。
失敗のassertionを削除せず、独立したグラフ状態の比較はsoft assertionで全て検査し、
一つでも不一致があればcase自体を失敗とする。

### 現在の修正範囲

- Storeのbody tipを、再計算途中の上流ではなく有効な履歴末尾slotへ揃える。
  末尾がdirty/running/blocked/failed/cancelledならlastValidをreadyへ昇格させない。
  suppressedは除外し、missing/splitのbodyを旧slotから復活させず、Curve/B-rep両方向の
  型不一致をtype-changedにする。G-code生成直前にもbindingを解決する。
- CAD参照がpending等になった場合、生成/preview workerと予約を中断し、前回形状を
  表示中のエラーにする。古い断面結果を保留→参照消失→結果解放するfixtureで検査する。
- 自動通知と明示的な「生成で使用」を区別する。通常更新では別の正常グラフにinputを
  勝手に追加しない。明示操作は既存bindingでも接続できる。
- shared generatorの全出力について変更前の状態を採取してからinputを更新・無効化する。
  非アクティブな更新グラフは前回pathsと停止状態を保持し、既存表示どおり選択時に再計算する。
  背景自動再計算を新たに実装したものではない。
- browser共通fixtureもDifferenceの既存対策と同様に、テストごとのchild/ID対応pendingと
  終了待機にする。実section subprocessの取消と終了も管理する。テスト間のFIFO共有を避ける。

製品の正本/native演算、文書version、CI設定、assertionのtimeout/retryは変更していない。
S05/D05機能台帳とA/T/R台帳は、成功した範囲と未完了の下流生成を区別して記録する。

### 実行結果と停止理由

| 実行 | 実測 |
| --- | --- |
| `node --test tests/cad-generation.test.mjs` / Node24.22.1 | 追加6件成功/失敗・skip0 |
| 製品/fixtureの`node --check`、`git diff --check` | 成功 |
| 修正後の追加browser3件 | **2成功/1失敗**、exit1、約36.20秒、retry0。JSON expected2/unexpected1/skipped0/flaky0 |
| Node24全JS / Node20.20.2全JS / native全件 / browser全件 | 未実行。部分検証を全件成功には転記しない |
| ローカルRust、実macOS GUI/Tauri IPC/OS dialog、実機プリンター | 未実行 |

修正後、寸法追従・G-code更新と、別グラフ/非アクティブ共有出力の選択再計算・明示的接続は
成功した。参照消失ケースも、pending化・lastValid保持・旧worker取消・G-code停止、
独立Rectangleの追加、edge再選択によるFilletのvalid復帰までは通る。
ただし、その後の実断面の生成適用が **`Intersecting output curves at Z 0.6`** で失敗する。
`fixed-target.json`とtraceのgeneration-error-detailsに実メッセージを保持している。
選び直したのは丸角RectangleをExtrudeした形状の下端にある長さ30超の水平edge。
CAD featureはvalidだが、断面/経路の実際の交差なのか出力検証なのかは原因未確定である。
この1件を別のedgeや緩い判定へ置換して成功扱いにせず、指示004の未知失敗時ルールに従い
マージせず要判断とし、連絡欄の@Museへ方針を確認する。失敗復旧の完了条件は未達。
現在の差分を1つのDraft PRへ記録し、全検証/CI/Ready化/マージ/Issue自動クローズの未実施を
明記する。CIが自動で開始された場合も、未確認のものを成功と記載しない。

### 検証環境の復元とfixtureの先行エラー

以前のChromium実体が作業領域整理で消えており、専用ignored領域に
`@sparticuz/chromium@153.0.0`を取得した。offline cache missはテスト未実行。
通常展開はfontsのchownでEINVALとなったため、Brotliの標準展開とtarのdata filterで復元。
初回browser3件と診断1件は、付属のAWS向けフォント設定でSkiaがSIGTRAP終了し、
製品テスト本体に到達しなかった。`FONTCONFIG_PATH=/etc/fonts`で起動を回復した。
先行した1件はfixtureのpipeline.id指定誤りによりOpenできず失敗したが、fixtureを
`id:pipeline`へ直しvalidateProjectで確認した後の結果を上記へ分けている。

Linux、Node24.22.1、Python3.12.14/OCP7.8.1.1、Chromium153.0.8010.0。
既存Playwright設定のworker1/timeout45秒/retry0/launch argsを維持し、ignored configで
JSON reporterと専用出力先を追加した。追加のsingle-process等のflagは採用していない。
ローカル実行は`python work/board-verification/004/run-browser.py <run-name> [Playwright args]`。
package/binary/font設定は検証環境だけであり、製品依存やCI設定へ追加していない。


## 2026-10-27 JST — 指示007 / Issue #34：既存断面交差問題の準備

Issue #9 / Draft PR #33とは分け、変更なしmain
`5defb1778f2058940c0d54e91b747d7ef8b2a71c`をbaseとする
`fix/34-native-section-intersection`で既存問題を扱う。
[Issue #34](https://github.com/usagicraftlab/pathloom/issues/34)に固定する再現条件、
同一B-rep hash・同一42 paths、小数6桁化後の交差エラーの証拠と完了条件を記録した。
詳細は`docs/cad-native-section-intersection.md`。

ユーザーから「007だけを実行」「ちょこちょこ止めて報告」と指定されたため、
Issue・専用branch・Draft PRと修正前の記録を用意した時点で一度停止する。
指示004は再開せず、Issue #9の変更も取り込まない。

今回の差分は再現記録とこの開発ログだけ。製品コード・テスト・交差判定・
assertion・timeoutは変更していない。新しいローカル検証
（Node24全JS、Node20.20.2全JS、native全件、browser全件）と実機確認は未実行。
以前の指示004で取得した再現証拠を、今回実行した検証と混同しない。
Draft PRのCI結果は確認後にPR本文とボードへ記録する。修正完了・Ready化・
マージ・Issue自動クローズは未実施であり、この準備を完了条件の達成と扱わない。


## 2026-10-27 JST — 指示007 / Issue #34：原因側の修正案と第2停止点

ユーザーの「続けてください」で同じbranch/PR #35を再開。今回は原因特定・
修正案と対象検証までで再び停止する。004の再開・Ready化・マージはしない。

実測：Section右側直線の開始parameter=-5.999999999062311e-7、
評価点Y=-17.0000006に対し、共有する位相頂点はY=-17、
vertex toleranceは約1.0000000071e-6 mm。曲線のパラメータ端を別々に
polylineへ足していたため、微小折返しが生成された。出力検証が不正な
polylineを拒否しているので、検証側を緩めない。

修正案：slice_brepの曲線サンプル列の両端だけを向き付きFirstVertex/LastVertexの
座標へ揃える。内部サンプル、B-rep、断面高さ/許容差、dedup閾値、JS交差判定、
丸め、assertion/timeoutは変更しない。B-rep hashは修正前後で
3a68ff555efce4f349936b1a378c10d0129f600834cea730c659249c31a98ea5のまま。
42 pathsを維持し、第1層41点→37点、全層最短segmentは約6e-7→0.40256835 mm。
同じ既存validateOutputが生断面・小数6桁化後とも成功する。

今回のローカル対象検証（Linux/Node24.22.1/Python3.12.14/OCP7.8.1.1）：

| 実行 | 結果 |
| --- | --- |
| 追加native回帰2件、修正前 | 1成功/1失敗。約6e-7 mmの短いsegmentを再現、約0.877秒 |
| 同じ2件、修正後 | 2成功、失敗/skip0、約1.095秒 |
| native/test_occt_brep_bridge.py 全件 | 20成功、失敗/skip0、約1.573秒。native全件ではない |
| node --test tests/open-print-output.test.mjs tests/print-intro.test.mjs tests/cad.test.mjs | 21成功、失敗/skip0、約0.507秒 |
| 追加browser1件の初回 | 生成は成功したがZ0.600を文字列Z0.6で期待して失敗、約11.54秒 |
| 同browserの数値表記訂正後 | 1成功、失敗/skip/retry0、約10.77秒（runner11.79秒） |
| 生断面/小数6桁化後の出力検証 | 修正前はZero-length/Intersecting、修正案は両方成功 |
| 構文・git diff --check | 成功 |

Browserは旧fixtureのCAD daemonを使い、追加した当該テスト内だけで実native
occt_brep_bridge.pyのslice IPCと取消を代替。normal v2 projectで生成配線だけを
seedし、edge長64/bbox・同一B-rep hash・42 paths・全42層のG-codeを確認した。
fixtureのedge条件、assertionの意味、timeout/retryを緩和していない。初回の
表記失敗は数値で全層を比較する検証へ訂正し、成功結果と区別する。

S05/D05の証拠欄とA/T/R台帳に対象結果と残件を追記し、既存partialや未実施を
promoteしない。ローカルNode24全JS、Node20.20.2全JS、native全件、browser全件、
実Mac GUI/Tauri IPC/OS dialog/実機プリンター、ローカルRustは未実施。
全検証前の第2停止点として残し、Ready/merge/Issue自動closeは未実施。

準備head46f7daedb7ac234baadbf63e1d22baca9901f87dのCIは、push40506774872・
PR40506779845ともattempt1 success。各runのログでNode20.20.2 JS192成功、
native51検出=49成功/2skip、Rust21成功、browser32成功を確認した。
製品修正前の結果であり、修正headのCI結果は確認後にPR本文とボードへ別記する。

生ログ/JSON/trace：work/board-verification/007/のnative-red.log、native-green.log、
native-bridge.log、js-guards.log、endpoint-comparison.json、junctions.json、
section-target.json/log/traceとsection-target-numeric.json/log。文書patchの初回は
文脈行不一致で適用されず、実際の行を読み直して適用した。製品/検証失敗とは区別する。


## 2026-10-27 JST — 指示007 / Issue #34：全件実行でのfixture初期化失敗

ユーザーの「つづけてください」を受け、007だけの全件検証を再開。マージ前で停止する。
ff19d401/tree2966b28dのローカル全件結果：Node24.22.1 npm testは192成功/失敗skip0
（test3.143秒/runner3.409秒）、Node20.20.2は全28 JSファイル・192成功/失敗skip0
（test4.546秒/npm起動含む36.052秒）、nativeは53検出=51成功/任意USD2skip
（test4.580秒/runner6.346秒）。Node20はpackage指定と別途node --versionでも20.20.2を確認。
Browserは33件中32成功/1失敗、skip/retry0（test100.03秒/runner101.42秒）。

修正headのCI push40510652145/PR40510663843は各attempt1 failure。
全3 jobの生ログを照合し、各runのNode20.20.2 JS192成功、native51成功/2skip、
Rust21成功、browser32成功/1失敗を確認。追加native-section caseだけが開始直後の
__TAURI__.core未定義で停止し、断面処理へ到達していない。失敗artifactは
push12737426744、PR12738170023。未知の製品失敗や既知maintenanceと混同しない。

原因は共有fixtureのbeforeEach登録をmodule importの副作用にしていたこと。
単独実行では動くが、全件ではbasic-drawingが先に同じmoduleを読み込み、
2番目のspecへhookが登録されない。ローカルtraceにgoto0/beforeEach0、空pageの
ままExposeBinding/Evaluateして失敗することを確認。
テストごとに実行されるtest.extendのpage fixtureへ変え、daemon/queue/serialを
各testのclosureに置く。終了時はpending拒否/readline close/child終了待機を行う。
製品native/JS・既存の全JS/nativeテスト・追加native-section spec・package/lockは
ローカル全件実行時と同一blobで、fixtureだけを変更。assertion/timeout/retryは不変。
Node/JS/nativeの成功をfixtureだけの変更で再実行したとは書かず、変更範囲と
結果が適用されるsourceを区別する。browser全件を再実行し、結果を続けて追記する。


第3段階のbrowser再実行は全33件成功・失敗/skip/retry0、test103.673秒・
runner104.64秒。先に同じfixtureを使うbasic-drawing7件が走った後でも、
追加native-section caseが起動し同じB-rep/edgeからG-codeまで成功する。
既存Difference3件、Split/Library/寸法追従・修復、maintenanceもこのrunで成功。
既知のframe数/保存通知の間欠失敗を恒久解決したとは扱わない。

製品native/JS、JS/nativeテスト、追加native-section spec、package/lockは
Node24/20/nativeの全件検証時と同一blob。テスト実行コードの変更はfixtureのみで、
それを含めてbrowser全件を再実行した。8ファイルのPR範囲と台帳65行/14列を
確認し、全結果と初回CI2 failureをPR/ボードへ残す。新しいfixture修正headの
CI結果はPR本文とボードに確認後追記する。未確定を成功と書かない。
実macOS GUI/IPC/OS dialog、ローカルRust、実プリンターは未実施を維持。
ユーザー指定のマージ前停止点とし、Ready/merge/Issue自動close・004再開はしない。


## 2026-10-28 JST — Issue #11 / 指示006の先行実施

ユーザーの再開指示とボード06:54の範囲確認に従い、006を取得して作業中への変更・
読戻しを済ませた。旧007限定・確認のみという制限の解消も既存3時間タスクへ反映した。
main5defb177から専用branch `fix/11-regression-verification` を作成した。
007/PR35のnative修正は含めず、007は要判断・006完了待ちを維持する。

frameはaxisの同期更新とRAF callback実行の非同期境界を区別する。既存の
`frames > 0` をexpect.pollで待ち、idle `<4`、axis=top、timeout45秒・retry0を維持。
実appの描画callbackを保留し、axis=top/frames=0の中間状態を検証してから解放する
追加回帰も入れた。単に閾値やtimeoutを緩めたり、失敗をretryで隠したりしない。

保存側は初期command libraryのreplyを保留する回帰で、未完の初期読込と登録が
並行することを製品修正前に確認した（追加2ケース中1成功/1失敗、24.520秒）。
workspaceの初期化全体を進行中promiseへ集約し、登録は初期library/recovery確認まで待つ。
共有保存失敗時には失敗通知・project内定義保持・共有保存先未更新を確認する。
修正後は従来のA04/R06とframeを含む対象5ケースすべて成功（15.186秒、retry0）。

全件実測：Node24.22.1 npm testは192成功/失敗・skip0（test6.333秒/runner6.715秒）。
Node20.20.2 binaryで全28 JSファイルを明示展開した実行は192成功/失敗・skip0
（test7.113秒/runner7.220秒）。先のnpm exec entrypointはexit0でもTAPが66件までで
集計がなく全件未確認だったため、成功扱いせず直接binaryのversionと最終集計を照合した。
Python3.12.14/OCP7.8.1.1のnative全51件は49成功/任意USD2skip
（test5.016秒/runner6.756秒）。全browser35件は35成功/失敗・skip・retry・flaky0、errors[]
（test145.509秒/runner147.606秒）。新headの全CIはこの記録時点では未実行。

P1-01〜04の既存回帰への対応、全件の各結果、M01〜M07の未実施範囲は
[cad-phase1-regression-verification.md](cad-phase1-regression-verification.md)へ集約した。
A04/R06の証拠を追記し、A/T/R状態と65機能IDの状態は昇格しない。
この環境はLinuxでcargoもなく、実macOS GUI/Tauri/OS保存回復・WebView/VoiceOver・
.app/.dmg build・M07は実施できていない。既存CIのRust成功でそれらを代替しない。
Issue11の実機完了条件と、先行実施時点では#9/#10が未完という残件を保持する。
実施済みをPRへ保存して全CIを照合し、実機証拠/範囲決定なしに完了やmergeとしない。


### 2026-10-28 08:15 JST方針後 — Issue #11の範囲整理と再開

ユーザーの「次進めて」とボード08:15回答に従い、006を作業中へ戻して読戻し確認。
未実施macOS M01〜M07、実Tauri/OS保存回復、M07とPhase 1最終照合を
[Issue #37](https://github.com/usagicraftlab/pathloom/issues/37)へ移した。
元の完了条件、各Mの操作/証拠、#34/#9/#10の完成後に扱う依存を引き継いだ。
新Issue本文を読み返して一致を確認し、Issue #11を自動対策の先行範囲へ整理した。
移管先は「Phase 1 完了後の実機検証フェーズ」であり、M各項目は未実施のまま。
実機の合格や成功に置き換えず、元の停止記録も履歴として保持する。

source head f6d85208204e632d46be9717fcbc58a19adeba82のCIは
push40592375358 / PR40592463574の各attempt1がsuccess。
全6 jobのログで各JS192成功、native49成功/任意USD2skip、macOS Rust21成功、
browser35成功（元frame/追加保留frame/保存競合と拒否caseを含む）を確認。
対象5ケース×5巡のNode20.20.2実測も25成功/失敗・skip・retry・flaky0、errors[]
（test84.238秒/runner85.096秒）。CI再実行なし。

今回の追加変更は移管先・範囲・履歴を示す文書のみで、製品/JS/native/browser test・
package/lockはf6d85208から不変。前段階のNode24/20各192、native49+2skip、
browser35の全件実測は同じ実行コードに対するものとして保持し、再実行したとは書かない。
文書追加後の最終headの全CIはPR #36とボードへ追記する。全条件が成立してから
Ready化・merge commit・Issue #11自動closeを実際に確認し、006を完了へ進める。
Issue #37はopenで残し、006完了前に007/004を再開しない。


## 2026-10-28 JST — Issue #34 / 指示007、006完了による再開

006/PR36のmerge aa4338d7・Issue11自動close・ボード完了を確認し、007を作業中へ
戻したことをreadback確認。既存branch fix/34-native-section-intersection / PR35へ
最新main aa4338d7を取り込む。競合は本ログ末尾の追記だけで、両側がbase5defb177の
全文をprefixとして保持していることを検証し、旧007追記8346 bytesと006追記4628 bytesを
byte単位でそのまま連結した。コード競合や仕様の推測での採用/破棄はない。
台帳の006 A04/R06証拠、65 ID/状態、007 S05/D05証拠の双方を保持する。

同じ実行コードで全件を再実行：Node24.22.1 npm test192成功/失敗・skip0
（test2.744秒/runner2.995秒）、Node20.20.2全28 JS192成功/失敗・skip0
（test4.160秒/runner4.233秒）、native全53検出＝51成功/任意USD2skip
（test4.673秒/runner6.348秒）、Node20/Chromium156のbrowser全36件は36成功/
失敗・skip・retry・flaky0/errors[]（test103.178秒/runner104.552秒）。
同じ下端edge長64、同じB-rep hash、42 paths/G-codeのattachmentも照合。

環境履歴を区別：最初のNode20/ブラウザーentrypointは旧npm cache binaryの欠落で
本体未到達。ignored work/toolchainへNode20.20.2を準備し、versionを確認して再実行。
nativeの非verbose初回はexit0でもlogに最終集計がなく全件未確認で、成功数に含めず
verboseで全53件/OK skipped2まで確認した。これらをアプリのassertion failureと混同しない。
rawはwork/board-verification/007-resume-006/に置いた。

実機macOS/Tauri/OSダイアログ・ローカルRust・実プリンターは未実施。Mac条件は
未実施のまま後段Issue #37へ移管済みで、本Issue #34の完了に置き換えない。
main aa4338d7のpost-merge checks40601895904とPages40602176848はsuccessを確認。
旧headのCI失敗/再実行をすべて保持し、新headで全CI（frame成功を含む）を確認後に
PR35/ボードへ記録し、通常条件でReady→merge commit→Issue34自動closeへ進める。


## 2026-10-28 JST — 指示004 / Issue #9、007完了後の再開と回帰修正

PR35のmerge77ff814b・Issue34自動close・ボード007完了を確認し、004を作業中へ
戻してreadback確認。既存branch fix/9-cad-generation-recovery / PR33を継続する。
最新main77ff814bを取り込み、開発ログはbase全文への追記と検証して旧004追記7228 bytesと
main追記15140 bytesを保持。A/T/R追記の両方を保持し、S05/D05の14列中、異なる証拠列
だけを併記した。65 ID/状態を昇格しない。共有fixtureは007のtest.extend per-test lifetimeを
保持し、#9のID-keyed routing/実native slice/workerと保存の観測・終了待機のtransport bodyを
そのまま内側へ移した。import-time hookやglobal teardown変数には戻さない。

統合後の修正前compiled Storeをhash保存し、Difference3＋generation3を実行：
3成功/3失敗（test51.655秒/runner52.350秒）。生成3件は007修正で復旧し、
Difference3件は旧CIと同じ工具/replacementのvisible assertionで失敗した。
原因は#9のresolveBindingsがready bodyにfeature slotを再代入し、Difference/replaceが
意図的にtip=nullへ消費した工具を古いentityへ戻すこと。追加JS回帰は6成功/1失敗で
これを固定した（test0.119秒/runner0.190秒）。tipのないbodyは補正対象にせず、
末端pending/failed/lastValidの保持は残した。修正後は同7ケース7成功
（test0.105秒/runner0.169秒）、browser対象6件すべて成功・skip/retry/flaky0・errors[]
（test42.804秒/runner44.176秒）。assertion/数値閾値/timeout45秒/retry0は不変。

全JSはNode24.22.1 npm test199成功/失敗・skip0（test4.329秒/runner4.740秒）、
Node20.20.2全29 JSファイル199成功/失敗・skip0（test5.324秒/runner5.388秒）。
native53検出は51成功/任意USD2skip（test5.393秒/runner7.343秒）。
全browser39件も39成功/失敗・skip・retry・flaky0、errors[]
（test126.139秒/runner126.780秒）。最終head CIは未実行で、全run/jobの結果を
PR33とボードへ実際の確認後に追記する。

Issue9の3完了条件をcad-generation.spec.mjs:121/150/197へ対応付け、
[cad-generation-recovery.md](cad-generation-recovery.md)に実測と原因・旧失敗履歴をまとめた。
実形状/OCP断面/worker/strict出力検証/G-codeを使い、元の丸角Rectangle下端水平edge条件を
変更していない。単体のtransport stubと実geometryを区別する。
raw JSON/log/attachment/失敗traceはwork/board-verification/004-resume-007/。
旧0f265ffのpush40500847035/PR40501038537のfailureと全job結果、旧local部分検証の
失敗もPR本文に保持し、今回の成功で置換しない。実macOS/Tauri/OS操作、local Rust、
実プリンターは未実施。実機M項目はIssue37の後段範囲で合格にしない。

## 2026-10-28 JST — 指示005 / Issue #10 再開と保存・回復

main6622cf3から既存local branch fix/10-project-recoveryを継続。ボード09:21回答を確認し、
候補Aは回復/明示破棄まで保持、Bのautosaveは保留・理由表示、破棄後に再開という
仕様25.4の解釈を採用した。複数候補は追加せず実機#37に先行着手しない。

回復候補の読取/選択完了をautosaveの前提にし、保留理由と再確認buttonを表示。
破損候補や失敗回復/破棄で旧候補を解放せず、回復にもOpenのcommand版衝突検証を適用。
文書identityごとのautosave判定と古いtimer解除、保存待ちの新編集表示を追加。

Issue本文の4条件は[証拠文書](cad-project-recovery.md)へ対応付けた。
初回target2成功/2fixture失敗、再実行4成功ログ（最終集計未出力）、
save-red1製品失敗→修正後target5成功/失敗・skip・retry・flaky0を区別して保持する。
別プロセスは新Python Runtimeへ実正本をimportし、browserは再読込した新Storeで
failed/lastValid/command版/draft復元を検査。実OS/Tauri/実機再起動は未実施。
機能65ID・A/T/R62件の状態を保持し、共有基盤証拠だけ追記した。

最終ローカル結果：Node24.22.1 npm test199成功/失敗・skip0（test3.006秒/runner3.283秒）、
Node20.20.2全29 JS199成功/失敗・skip0（test4.039秒/runner4.120秒）、
native53件＝51成功/任意NVIDIA USD2skip（test3.177秒/runner4.222秒）、
browser全45成功/失敗・skip・retry・flaky0、errors[]（test161.626秒/runner162.198秒）。
全件後、テストだけを強化してOpen各失敗のtoast完了待ちと、別プロセス復元の
開Line長20/非閉鎖、Plane非体積・面積1200、NURBS exactness/非閉鎖を追加照合。
製品コードは不変で、この2件を改めて実行し成功を確認した。
先行失敗traceは標準出力先が後続runに置換されており、初回全trace保持とはしない。
失敗ログと今回のJSON集計/別プロセス正本attachmentは保持する。最終CIはpush/PR後に照合する。

## 2026-10-28 JST — 指示008 / Issue #12 実装前の具体化

基準main a8c51d3、既存#12用branch/PRなし。main checks40622549025 attempt1 success確認。
[実装前対応表](cad-curve-editing-plan.md)でIssue12の2完了条件をE01〜E11の
明示入力、正常/不成立/曖昧候補、全出力/正本/履歴保持へ対応付けた。
Trimの削除区間/保持区間、Extendの端点/方式/到達候補、平面2曲線Fillet/Chamferの側/trim/保持、
G1/G2 Blend、固定次数/制御点数Rebuildの近似表示、Seam、制御点編集を含む。
この時点で実装/全検証は未実施。実機#37/予約009〜011へは先行着手しない。

### 指示008：E05 NURBS継続延長の未解決失敗

Issue12/PR39の実装前対応表を記録後、native曲線編集の試作に着手した。
E05の4ケースはLine tangent/continuation・NURBS tangentが成功、NURBS continuationが
CAD_KERNEL_FAILED/出力0で失敗。回帰4件は3成功1失敗、再照合exit1/test0.009秒/runner1.000秒。
変更なしmain a8c51d3はcurve.extend自体が未実装であり、既存合格や間欠失敗として除外しない。
mainと試作側のOCP API単独probeはJSON完全一致。元/trimmed変換後のBSpline双方で
ExtendCurveToPoint_sはNoneを返し、元端点/次数/制御点数/domainが変わらず目標との距離5mm。
C++側の原因・安全な代替は未確定で、接線延長へ置換して完了とせず要判断で停止する。
[scripts/probe-curve-extension.py](../scripts/probe-curve-extension.py)とnative回帰、
[実測と残件](cad-curve-editing-plan.md)を保存する。試作の他機能/UI/全出力/Undo/保存/
全ローカル検証は未完了、台帳の既存状態は昇格しない。実機#37/予約009〜011は未取得。

## 2026-10-28 JST — 指示008 / Issue #12 ユーザー判断後の曲線編集

16:13 @codexのユーザー判断に従い、仕様22.2のNURBS continuationを正本保持＋接線延長へ
置換して再開。仕様・機能台帳・PRに日付/根拠を残す。旧APIの原因確定や自動fallbackとはしない。
同じPR39/branch feat/12-curve-editingを継続し、E05だけに範囲縮小せずE01〜E11を接続した。

[契約と実測](cad-curve-editing-plan.md)に演算別の正常/不成立/曖昧、型/平面/次数等の境界、
端点/交点/保持側/距離、全出力/未選択edge保持、近似偏差の意味を記載した。
UIには端点/方式/側/G1・G2/制御点モードを明示。正本parameterとpole一覧、診断候補を提示し、
Trim mouse/XYZ、cornerの点/候補番号、到達targetParameterを記録する。
E01/E04はcommand v2を追加し保存済みv1を不変にした。Rebuildはpreview偏差確認と
acceptApproximation=trueの明示確定が必要で、元正本を保持。knot削減も偏差warning付き。
Storeはcutters/到達targetを消費せず、cornerのkeepInputs切替を他consumer/lastValidと整合させる。

機能台帳65行のうちE01〜E11だけを記載fixture範囲で更新、他54行は保持。
A/T/R62行の既存状態も保持し追加証拠を追記した。Constraints/一般mapping/実Mac合格へ広げない。

再開後の失敗・修正：
- 12モード初回11成功/1失敗。knot挿入の既定長さ差4.403828988586156e-6mmを検出。
  正本257点一致・独立適応長さ差1e-10mm未満で形状不変を検証し、受入許容差を緩和しない。
- native全件で閉clamped曲線Seamの既定長さ差0.0062561693378135885mmを検出し67成功/1失敗/2skip。
  curve lengthMmの製品集計を正本の適応積分へ変更、同じSeam受入を保って68成功/2skipへ回復。
- browser初回全51件は48成功/3失敗（300.337秒）。Lineのend配列が新Extendのenumになる退行を修正。
  Joinの旧単一連鎖fixtureはv2複数groupを明示OFFにして従来gap/許容差受入を維持。
  v1 Open直後Saveはtraceで生成中拒否を確認。cad-ui.jsの保存拒否経路は変更なし。
  独立した変更なしmain a8c51d3（tracked diff空）の同test3反復は3成功で、main失敗再現とはしない。
  fixtureが既存busy状態の終了を待つようにし、製品の保存禁止を緩めない。対象9件は9成功。
- 別entityのedge混入を拒否する所属検査の初回はコピーshapeの位相を誤照合し67成功/1失敗/2skip。
  コピー前の元位相で照合して正当edge/別edge拒否の両受入を保ち、全件68成功/2skip。

raw log/JSON/失敗traceはwork/board-verification/008/（main比較は../pathloom-008-main-compare/work/board-verification/008/）。
失敗をskip/xfail化しておらず、任意USDの既存2skipだけを区別する。
Python3.12.14/OCP7.8.1.1、Node24.22.1/20.20.2、Playwright1.64.1/Chromium156で実行。
browserは実Python/OCP・実mouse入力、Tauri/OSダイアログ/storage transportはfixture代替。
実Mac M01〜M07/OS保存回復/実プリンター、local Rustは未実施。macOS RustはCI結果を別途確認。
#37未実施、009〜011予約/未取得、Phase3は新規指示まで進めない。

### 18:32 JST 最終ローカル検証

| 実行 | 結果 | test秒 / runner秒 |
| --- | --- | --- |
| Node24.22.1 `npm test` | 全202成功、失敗/skip/todo0 | 5.401952 / 5.610 |
| Node20.20.2 `node --test tests/*.test.mjs` | 全30 JSファイル202成功、失敗/skip/todo0 | 6.204283 / 6.352 |
| Python3.12.14/OCP7.8.1.1 `python -B -m unittest discover -v -s native -p 'test*.py'` | 全70件68成功・任意USD2skip、失敗0 | 5.008 / 6.581 |
| packaged browser全件（最終所属検査/accuracy保存照合を含む） | 全51成功、失敗/skip/retry/flaky0、errors[] | 228.755435 / 229.383 |

browser実行前に`npm run desktop:prepare`、CI=1/PATHLOOM_FRONTEND_DIR=desktop-dist、
PATHLOOM_BREP_PYTHON=上記Python、PLAYWRIGHT_CHROMIUM_EXECUTABLE=Chromium156を指定。
標準playwright.configのtimeout45000/workers1/retry0を継承するfull.config.mjsを使用。
最終全件はsource凍結後に実行し、保持する全entity.accuracyと全feature/command版/正本hashの
新ページv2復元一致、別entity edge拒否を含む。git diff --check成功。
local Rust/実OS操作は未実施。push/PR最終headの全CIは公開後に照合し、PR/Codexログへ追記する。

### ローカル実行履歴（旧失敗を保持）

| label（work/board-verification/008） | exit | runner秒 |
| --- | --- | --- |
| browser-final-identity | 0 | 229.383 |
| browser-final | 0 | 198.756 |
| browser-full | 1 | 300.337 |
| curve-browser-first | 0 | 22.550 |
| curve-browser-second | 0 | 26.379 |
| editing-js | 0 | 0.212 |
| extend-approved | 0 | 2.555 |
| extend-regression-confirmed | 1 | 1.000 |
| modes-first | 1 | 1.342 |
| modes-retained | 0 | 1.110 |
| modes-second | 0 | 1.068 |
| native-final-identity | 0 | 6.581 |
| native-final-metrics | 0 | 4.322 |
| native-final | 1 | 7.345 |
| native-final-scope | 1 | 4.986 |
| native-full | 0 | 4.924 |
| node20-final | 0 | 6.352 |
| node20-full | 0 | 4.581 |
| node24-final | 0 | 5.610 |
| node24-full | 0 | 4.151 |
| regression-target | 0 | 34.984 |

旧計画head2bad91fのpush40641285516/PR40641291766は各attempt1 success
（JS199/native51+USD2skip/Rust21/browser45）。旧試作a07003cのpush40642322179/PR40642329084は
各attempt1 failure（JS199/Rust21/browser45成功、native54成功1失敗2skip）。旧全6jobずつは照合済み。
旧失敗は当時のNURBS continuationであり、ユーザー決定後の新契約成功へ書き換えない。
CI再実行で隠さず、同branchの最終head push/PR CIと分けてPRへ保持する。

## 2026-10-28 JST — 指示009 / Issue #13 実装前の具体化

008のmerge f7f69e7後main checks40666332968はattempt1 success、全3job生ログで
JS202/native68+USD2skip/macOS Rust21/browser51を確認。ボード18:53の有効化とIssue13を読み、
009だけ未着手→作業中をrequiredRevisionId付き更新/全文保持読戻し確認。
既存#13用branch/PRなしを確認し、feat/13-regions-and-solidsをmainから作成。
[対応表](cad-regions-solids-plan.md)でS03/B01〜B08/D01〜D07とIssue3完了条件を具体化。
穴/複数領域、Box作図/ellipsoid/開閉primitive、Pipe/Cap/assemble、面押出、Boolean全結果、
Fillet連鎖/2距離Chamfer/隣接面、Shell失敗診断を含む。具体化をDraft PRへ記録してから実装する。
この時点は製品変更/009検証未実施。010/011予約と実機#37を取得しない。

## 2026-10-28 JST — 指示009 / Issue #13 閉領域と基本立体

既存PR40/feat/13-regions-and-solidsを継続し、実装前対応表とIssue13の3条件を照合した。
S03は同一平面の閉loop群の交差・包含を検査し、穴/島/独立領域を全face出力。
B01は旧v1保持のv2作図モード、B02は正確なellipsoid、B06は円断面Pipe、B07は穴付き面押出、
B08は平面開口Cap/面群assemble/独立Solid全出力/開面保持を接続した。
D01/D03は複数入力と非接触/接触の次元を区別。体積Commonが空でも正本境界のCommon/Sectionと
集合Cutで面/edge/点を重複なく保持し、近傍による参照付替えやmesh近似はしない。
D02/D04の既存複数対象/全結果/正本由来を維持。D05新v2は連鎖selected/tangentを明示し、
旧v1のkernel連鎖挙動を維持。D06新v2は2距離と距離1側の隣接face、D07は除去面所属と
内外/厚さ/失敗詳細を記録し、元形状のまま成功した内側Shellを拒否する。

S03/B01/D05/D06は保存済みv1を変えずv2追加。B02.ellipsoid/B06/B07/B08/assembleは新規登録。
機能台帳65行のうち対象16ID中14行を証拠範囲で更新し、D02/D04と他49行は保持。
A/T/R62行は既存状態を維持し証拠を追記。仕様/対応表/PR/Issue本文に契約・境界を記録する。

### 失敗と修正・再実行

- native既存初回70件67成功1失敗2skip：新しい連鎖制限が旧Fillet v1の基準を壊した。
  v2明示契約と旧保存挙動を分け、同じ丸角Rectangle下端基準を維持して回復。
- 追加native初回24件21成功3失敗（12件はhelper classの重複収集、後にimport方法を修正）。
  楕円体volumeの既定積分誤差0.04396687183499637mm³を検出、Surface/Volumeを適応積分へ修正。
  非平面faceの自由境界を拾えない問題は位相版FreeBoundsへ、過大厚さShellが元Box体積1000の
  まま成功する問題は内側体積減少を検査して修正。追加12件再実行12成功、連鎖受入を加え13件。
- 接触fallbackの初回Fuseは異次元の重複除去で不成立。集合Cutへ変更し面area100/周長40、
  edge長10、点、非接触emptyを独立実測。検証をskip/xfail化せず全nativeへ取り込んだ。
- 追加browser初回4成功2失敗は中心Rectangle adapterのfixture座標とfingerprint bbox参照を修正。
  次5成功1失敗はRedo再計算前のassertionで、同じ開閉条件のpollへ修正して6成功。
- browser初回全57件54成功3失敗はBox v2 anchorMode selectへ旧Difference fixtureがfillした停止。
  同じcorner値と全assertionを保ちselectOptionへ変更。旧基準Filletは新v2でtangentを明示し、
  元のedge/断面/G-code/参照修復条件を維持。接触UIを加えた最終全58件は成功。

### 最終ローカル検証（2026-10-28 19:39 JST）

| 実行 | 結果 | test秒 / runner秒 |
| --- | --- | --- |
| Node24.22.1 npm test | 204成功、失敗/skip/todo0 | 3.425038 / 3.661 |
| Node20.20.2 全31 JSファイル | 204成功、失敗/skip/todo0 | 4.246299 / 4.347 |
| Python3.12.14/OCP7.8.1.1 native全件 | 83件81成功/任意NVIDIA USD2skip、失敗0 | 6.873 / 8.140 |
| packaged browser全件 | 58成功、失敗/skip/retry/flaky0、errors[] | 230.684139 / 231.314 |

コマンドはnpm test、Node20.20.2 node --test tests/*.test.mjs、
python -B -m unittest discover -v -s native -p 'test*.py'。
browserはnpm run desktop:prepare後、CI=1/PATHLOOM_FRONTEND_DIR=desktop-dist、上記Python、
Chromium156を指定し標準config継承（timeout45000/workers1/retry0）で全件実行。
実OCCT/実画面入力で、全feature/command版/正本hash/accuracyの新ページv2復元を照合。
Tauri/OSダイアログ/storage transportはfixture。local Rust/実Mac GUI/OS保存回復/実プリンターは未実施。
実機#37、010/011予約、Phase3へは先行着手しない。

### 全ローカル実行履歴

| label (work/board-verification/009) | exit | runner秒 |
| --- | --- | --- |
| browser-final | 0 | 231.314 |
| browser-full-first | 1 | 228.390 |
| modes-first | 1 | 1.687 |
| modes-second | 0 | 1.881 |
| native-all-contact | 0 | 7.915 |
| native-all-third | 0 | 7.928 |
| native-existing-first | 1 | 3.552 |
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
