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

## 2026-10-26 JST — Phase 1 基本操作・整合性修正

### 許可と対象

後続のユーザー指示でmainへのマージとPhase 01までの実装を明示的に許可された。
Phase 0資料[PR #1](https://github.com/usagicraftlab/pathloom/pull/1)をmainへマージ。
merge SHAは`716a155fad5b50a2e1501bb08f078456dfb862c1`。
上の「マージしない」「未修正」はPhase 0実施時点の範囲を表す履歴として残す。

Phase 1ブランチは`feat/cad-phase1-basics-20261026`、[PR #2](https://github.com/usagicraftlab/pathloom/pull/2)。
最初の実装commitは`45608c84a9e3352be3e18989d4fcc87dc43be113`。
保存schema/operation versionと既存42 ID＋Moveの構成は維持した。
新しいRectangleモードはsession/feature command metadataに保持し、保存済み組込command版の内容を書き換えない。

### 変更と証拠

| 対象 | 実装したこと | 検証の範囲 |
| --- | --- | --- |
| P1-00 / AUD-007 | Nodeで不足するClipper navigatorを読込前に補完。既存のbrowser navigatorは維持 | Node20/24の全JS回帰 |
| P1-01 / AUD-001 | awaitの後にdoc/epoch/feature revision/入力hash/入力状態を再検査。export後の適用をまとめ、破棄handleを解放。recomputeの待ち手は最新のqueued処理まで待つ | `cad-jobs.test.mjs`：再編集/Undo/削除/別文書/上流編集のexport競合、無関係revision。実OCCT追加プローブでも設定80/実幅80へ改善 |
| P1-02 / AUD-002 | argumentsごとにtoolsだけを減算。source entityごとのbodyを保持。工具保持は明示的設定。body結果を履歴順に再構成し、cached結果でも工具保持の切替が反映される | native実体積500＋1000＝1500、単一/非接触/空。実Storeの工具保持true→false→true、Undo/Redo、保存再開 |
| P1-03 / AUD-003 | Split slotはoperation/source entity/正本hash。同一の厳密結果だけIDを継承。旧UUIDは一意の同一正本に限り移行。source/slotを型付きでLibrary再割当。binding修復操作を追加 | 同じ分割の再評価/新Runtimeで一致。分割数2→1で古い後段をblockedにし保存保持、明示的再選択で復旧。依存Libraryは独立してvalid |
| P1-04 / AUD-004 | 指定planeを支持面としてOffsetへ渡す。平面内/軸/パラメータ型/未知設定を検証し、開曲線を閉じない | XY/XZ/YZ/任意平面、±1、round/miter、反転法線、開曲線の長さ/位置。不正軸/不一致/非平面/未知設定は型付き失敗 |
| P1-05 | Rectangle中心・2コーナー・3点、Circle中心/半径点、Move単位付きXYZ。Polylineの相対入力/Backspace、role picker後の選択、Rectangle中心snap | ブラウザUIで形状数値・自由平面・Undo/Redo・保存再開。viewport選択前/後＋Shift、端点/中心への2pxずらしsnap、入力中Delete、Esc |
| P1-06 | bindingのdirty/failedを即時通知し、削除されたbindingもmissing通知。ノードの明示接続は維持 | Rectangle→capped Extrude25→Fillet R2→binding→実Python STEP断面。幅80のパス、G-code成功。幅-1でlastValid/blocked/出力阻止、80へ修正して復旧。別生成グラフを保持 |
| P1-07 | 不正な入力文字列をdraftとして再表示し、修正まで評価/確定を阻止。staged Open/Library読込中の変更を保護。CAD recovery書込を直列化し文書世代を照合 | 実Python childをkillして別PIDで再起動＋ページreload。開曲線/開面/有理NURBSのhash/bbox/closure、failed/lastValid、不正draftを復元。nativeは次数/knots/weights/metricsも比較。v1はOpenで未書込、次のSaveはv2。破損Openは現文書を保持 |
| P1-08 / runtime | `cad:setup`がapp-dataへ絶対Pythonパスを原子的に保存。daemonと既存STEP bridgeで探索処理を共用。import epoch再確認、timeout理由とrestart状態を修正。macOS CIへ.app/.dmg生成を追加 | Rustに探索4ケースを追加。NativeCadClientのcancel/遅延結果/daemon epoch復帰のtransportテスト。Finder起動や実Tauri GUI通信は未実行 |

実OCCTのAUD-001再検証は本ログのPhase 0再現コードをそのままstdin実行した。
`parameterWidth=80`、`actualWidth=80`、`status=valid`、`requestedHash`は非null、snapshotもvalid。
JSの競合fixtureはtransportを置換するが、このプローブでは形状自体を実OCCTで計算した。

### 環境と最終ローカル実行

Linux/Node24.22.1/npm11.9.0/Python3.12.14/OCP7.8.1.1/VTK9.3.1。
OCCT版はhelloのnullを維持し、OCP版から推定しない。lockfile/依存定義の変更なし。

公式Playwright Chromium取得はPhase 0と同じ環境障害で失敗したため、ignoredな
`work/cad-phase1/browser`の`@sparticuz/chromium`からChromium153.0.8010.0を用意した。
展開時のchown制約をその一時依存だけで回避し、完全に展開した実行ファイルを
`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tmp/pathloom-chromium`で指定した。
製品・依存定義へこの回避策を入れていない。CIは公式Playwright Chromiumを取得して使う。

| ID | コマンド / 確認 | 結果 | 境界 |
| --- | --- | --- | --- |
| P1-L01 | `npm test` | exit0、165成功/0失敗/0skip、約2.98秒 | JS全体。native数値証拠の代わりにはしない |
| P1-L02 | `npm exec --yes --package=node@20.20.2 -- node --test tests/*.test.mjs` | exit0、165成功/0失敗/0skip、約3.10秒 | 同じ165件を対応最低版で再実行。330独立条件とは数えない |
| P1-L03 | `npm run test:cad-native` | exit0、43検出/41成功/2skip、約2.18秒 | 実OCP7.8.1.1。skip2件は任意NVIDIA USD。成功数に加えない |
| P1-L04 | 下記browserコマンド | exit0、28成功/0失敗/0skip、約1.3分 | 実OCCTのCAD14シナリオ＋既存操作/AI/出力14。Tauri transport、OS storage、cad_cancelは置換 |
| P1-L05 | Phase 0 AUD-001実OCCTプローブを再実行 | exit0、設定80/実形状80/valid/非null hash | export待ちだけを注入。自然なmacOS操作での発生頻度は未測定 |
| P1-L06 | `npm run cad:setup`を修正後に再実行 | exit0、指定版を確認しapp-dataのruntime設定を保存 | Linuxでの配置。Finder探索の実確認ではない |
| P1-L07 | `git diff --check`、変更Markdownの相対リンクと台帳列数検査 | 成功・exit0、相対リンク/65機能と9タスクの列数を照合 | 資料整合性。製品受け入れとは別 |

```sh
PATHLOOM_FRONTEND_DIR=desktop-dist \
PATHLOOM_BREP_PYTHON=.pathloom-runtime/python/bin/python \
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tmp/pathloom-chromium \
npm run test:browser -- --max-failures=1
```

### 途中で失敗した試行

- 最初のPhase 1 CI（下記）は既存idle-renderテストで1失敗。
  カメラaxisの同期状態だけを待って描画frameを即時assertしていた。
  `expect.poll`で実frameを待つよう修正した。閾値緩和やテストskipはしていない。
- 新しいv1保存fixtureの初回はOpen直後の生成中にSaveを呼んで失敗した。
  復元/生成完了を待って検査するよう修正し、v1の未書込と次回v2保存を確認した。
- 工具保持false→trueで工具が戻らない実装上の問題を新fixtureで再現した。
  body policyの履歴順再構成へ修正し、同fixtureのUndo/Redo/reopenを含め成功した。
- Splitの復旧検査では、Open前の古いbindingオブジェクトを読むfixtureを修正した。
  保存後の新文書からbindingを取得してready/blocked/明示的修復を判定する。

これらの失敗した試行を最終成功数へ加算しない。

### GitHub Actions

最初のhead `45608c84a9e3352be3e18989d4fcc87dc43be113`：
[run 40309275440](https://github.com/usagicraftlab/pathloom/actions/runs/40309275440)。

| ジョブ | 結果 | 根拠 |
| --- | --- | --- |
| javascript-and-browser / 121526086062 | 失敗 | JS163件は成功。browser24成功/1失敗（idle-renderの非同期待ち）。CI全体合格とは扱わない |
| native-cad / 121526086436 | 成功 | 43件中41成功・2optional skip |
| rust-and-macos / 121526086710 | 成功 | macOS arm64。Rust crateコンパイルと25成功/0失敗/0ignored。`npm run mac:build`でPathloom.appとPathloom_0.1.0_aarch64.dmg生成、artifact保存成功 |

### 残る受け入れと次の開始点

P1-00〜07の上記実装・自動検証は完了。Phase 1の全体受け入れは、P1-08の実機ゲートが残るため未完。
M01のmacOS Pythonセットアップ/実利用、M02〜M07のFinder、実Tauri IPC、OS dialog取消/権限エラー、
実app-data recovery、WebView/日本語入力/VoiceOver、再起動後G-codeは未実施。
ローカルCargoは未導入のままで、Rust成功の根拠はmacOS CIである。
CIのDMG生成成功は、署名/公証、インストール済みアプリの実動作を証明しない。

次の優先順位は(1)上記macOSゲート、(2)影響を受ける非アクティブ生成グラフの再計算と基本編集の残り、
(3)STEPのCAD文書への明示的取込/書出し。65機能の未完範囲は既存台帳へ集約する。
実AI推論、実Rhino接続、実プリンター送信/物理印刷は今回も実行していない。
