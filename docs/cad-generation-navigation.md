# 生成グラフとCADの双方向ナビゲーション

指示028は、Museが分割したUX改善Bのうち項目4と7だけを対象にする。生成側の
エラー、ノード、接続と、CAD側の現在形状・生成履歴を既存のbinding IDで結び、
修復位置を直接確認できるようにする。A/C/D/E、保存schema、CAD演算、65 command
契約、Issue #37、Draft PR #43は変更しない。

## 対応契約

| 操作 | bindingの追跡 | 表示・選択結果 |
| --- | --- | --- |
| CAD形状またはbody履歴を選択 | `outputBindings`の`resolvedEntityId`または`source.bodyId`からbinding IDを得る | 対応する生成inputと、その下流ノード・接続を強調する |
| 生成ノードを選択・hover | 選択ノードから`geometryEdges`を入力方向へ辿り、CAD inputのbinding IDを得る | bindingの現在entityを選択し、producer featureを履歴で選択する。hoverは3D強調だけに限定する |
| 生成接続を選択・hover | 接続元から同じ依存入力追跡を行う | ノードと同じ現在entity・履歴へ移動する |
| CAD bindingを使う生成でエラー | 使用中inputのbinding IDを修復ボタンへ付与する | Modelへ切り替え、現在entityとproducer履歴を選択して修復案内を出す |

強調は通知専用で正本や履歴を変更しない。複数bindingは重複を除いて扱う。bindingが
解決できない場合はCAD選択を変更せず、生成inputをエラー表示する。生成側の選択解除・
hover終了は一時的な3D強調を消し、CAD側の恒久的な選択とは分離する。

## 検証対応

- JS: ノード・接続から上流bindingへの追跡、bindingから下流ノード・接続への追跡、
  body identityからbindingを得ること、現在entityとproducer履歴を解決すること。
- browser: CAD選択からinput/下流ノード/全接続の強調、生成ノードから現在形状・履歴への
  移動、bindingエラーの修復ボタンからModelと同じ形状・履歴への移動。
- 既存A/T/R 62行と65 command台帳の状態は変えず、指示028の回帰証拠だけを追加する。
- 実Mac GUI/Tauri/OS dialogはIssue #37に残し、自動fixtureやCI成功で合格へ昇格しない。
