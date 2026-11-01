# Issue #20 — command DSL・AI command編集の実装境界

2026-11-01 JST。Issue #20 / 指示020の具体化と検証索引です。

## 対象

- 単一の`cad/commands/registry.js`を正本とし、正規65 IDの最新定義を
  `PATHLOOM COMMAND DSL 1`へ可逆変換する。DSLはJSON値を持つ行指向grammarで、
  `eval`、任意関数、ファイル、ネットワーク、DOMを公開しない。
- command ID・表示名・aliasをNFKC/case-insensitiveで照合する。同じIDのimmutableな
  別version以外は既存の標準／追加commandを上書きせず、新名、代替alias、採用中止を
  UIで明示してから登録する。
- 新規definitionは使用前でも文書の`commandDefinitions`へ版固定する。履歴が参照する
  commandは、同じnative operationの既知versionだけへ明示的にupgrade/rollbackし、
  transactionへ記録してUndo可能にする。旧版と新版は両方保存する。
- 既存AI Componentの`codex_status`／`codex_propose`によるローカル認証・提案経路を再利用する。
  AIは1件の新しいimmutable versionだけをDSLで返し、ID/native operationの変更と任意JSを拒否する。
  既存のversioned Code Componentと隔離QuickJSの経路は変更しない。
- parser、衝突、版切替、AI応答の失敗は利用者向けcode付き診断として表示し、失敗時は
  registry、文書、既存形状を変更しない。

## 非対象

- C/Eで確定した演算意味やparameter契約の変更、確認継続中のS系挙動の新規決定。
- 新native operation／adapter、任意JavaScript command、外部AI認証、UIレイアウト変更。
- Phase 4の#21〜#24、実機#37、評価用Draft PR #43。

## 証拠

- `tests/command-dsl.test.mjs`: 正規65件の完全往復、構文診断／非実行、衝突と3選択、
  版固定upgrade/rollback、AI contextの安全境界。
- `tests/browser/cad-command-dsl.spec.mjs`: 65件のUI表示、新版の文書固定、衝突解決、
  実履歴のrollback/upgradeと旧新版保存。
- 既存全JS／native／browserとCIで、AI Component、QuickJS、保存、演算を回帰確認する。
