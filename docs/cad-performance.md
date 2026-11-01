# Issue #23 — 性能測定とhandle／表示cache GC

## 境界

このIssueは、代表モデルの表示更新、実OCP再計算、B-rep正本転送、runtime起動、
プロセスメモリを同じ手順で測り、native handleとThree.js表示資源の寿命を文書の
到達可能性へ合わせる。配布物、実Tauri、OS dialog、実Macの性能合格は扱わない。

測定値はLinux x86_64の合成モデルによる相対比較・回帰基準であり、Mac性能の達成根拠ではない。
閾値は根拠なく設定せず、環境・入力規模・反復数と全sampleを
[`cad-performance-baseline.json`](cad-performance-baseline.json)へ残す。

## 再現手順

```sh
node --expose-gc scripts/cad-performance.mjs
```

Pythonは順に`PATHLOOM_PYTHON`、repo内`.pathloom-runtime/python/bin/python`、
`CODEX_PRIMARY_RUNTIME_PYTHON`、`python3`を探索する。実OCPがないPythonは成功扱いしない。

## 代表モデル

| 名称 | 表示モデル | 実OCPモデル | 反復 |
| --- | ---: | ---: | ---: |
| small | 1 entity | `solid.box` 1個 | 表示5回、OCP 3回 |
| medium | 25 entities | `solid.box` 20個 | 表示5回、OCP 3回 |
| large | 100 entities | `solid.box` 60個 | 表示5回、OCP 3回 |

表示モデルは各entityにつきmesh／curve／pointを1つずつ持ち、初期表示後に同じentity IDの
assetを20世代置換する。OCPモデルは12 mm間隔の10×10×10 mm boxで、各runをfresh Runtimeで行う。

## 2026-11-02 Linux基準値

Node 24.22.1、Python 3.12.14、OCP 7.8.1.1、Linux x86_64。

| モデル | 表示median | OCP再計算median | B-rep転送median / bytes | native handle GC | 表示geometry/material GC |
| --- | ---: | ---: | ---: | ---: | ---: |
| small | 0.686 ms | 7.268 ms | 0.131 ms / 1,617 | 1 → 0 | 3/3 → 0/0 |
| medium | 1.358 ms | 124.271 ms | 0.205 ms / 32,707 | 20 → 0 | 75/75 → 0/0 |
| large | 3.246 ms | 384.402 ms | 0.436 ms / 98,427 | 60 → 0 | 300/300 → 0/0 |

runtime起動（Python/OCP import、Runtime生成、hello）は3回
`1008.429 / 1180.424 / 865.319 ms`、median `1008.429 ms`だった。

CadStoreの21世代置換fixtureでは、GC前→後のhandle数はsmall `21→1`、medium
`525→25`、large `2100→100`で、現在entityと同数だけを保持した。

native release後のRuntime cacheは全モデルで0になった。Three.js側もentityを0件へ更新後、
geometry/materialは0になり、20世代分の置換資源がすべてdisposeされた。Linux RSSは
small `236.031 → 236.031 MiB`、medium `237.477 → 237.480 MiB`、large
`240.508 → 240.520 MiB`であり、handle解放直後にallocatorがOSへRSSを返す証拠ではない。
「cacheの到達不能資源が解放された」と「プロセスRSSが即時低下した」を区別する。

## 実装契約

- `CadStore.collectHandles()`は現在のentityが参照するasset hashだけを保持し、その他を
  `cad_release_handles`へ渡す。削除・再計算後に実行する。
- Undo／Redo、cancel、Open／restoreでは旧cacheを全解放する。同じhashのhandle置換も旧handleを解放する。
- view adapterはstale entity、置換、preview、adapter破棄でgeometry、material配列、material内textureを
  重複なくdisposeする。`displayState()`は現在資源数と累積回収数を診断用に返す。
- exact assetと保存済み`displayCache`は文書正本であり、native handleやGPU資源のGC後も必要時に再import／再構築する。

## 未実施

- 実Mac GUI/Tauriでの表示、起動、メモリ、長時間操作はIssue #37。
- `.app`／`.dmg`配布時のPython/OCP探索・依存版・第三者表示はIssue #24。
- Linux合成boxの値を巨大STEPや実利用モデル、Mac、GPU実機の性能値へ外挿しない。
