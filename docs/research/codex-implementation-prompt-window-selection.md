# Codex実装依頼用プリンプト（Window/Crossing選択 + AutoCAD操作準拠）

以下を **既存実装を壊さず** に追加してください。対象リポジトリは AI CAD（Electron + Konva）です。

## 目的

AutoCAD移行ユーザー向けに、選択操作を次の仕様へ寄せる。

1. Window選択（左→右）: 完全内包のみ選択
2. Crossing選択（右→左）: 交差要素を選択
3. 視覚フィードバック（左→右=青、右→左=緑）
4. 既存の選択・移動・削除・Undo/Redoとの整合

## 必須要件

- `renderer/app.js` の既存ドラッグ選択ロジックを拡張し、ドラッグ方向で選択判定を切替。
- 図形タイプ別の判定を最低限サポート:
  - line, rect, circle, arc, text, point
- 判定方針:
  - Window: 図形のバウンディングボックスが選択矩形に完全含有
  - Crossing: 図形のバウンディングボックスが選択矩形と交差（MVP）
- 既存複数選択 `selectedIds` と競合しないこと。
- `saveHistory()` の呼び出し規約を維持（選択だけでは履歴追加しない）。

## 望ましい追加

- 将来Fence選択を追加しやすいよう、選択判定関数を `renderer/cad/selection.js` として分離。
- ステータスバーガイドに現在モードを表示:
  - `Window selection`
  - `Crossing selection`

## 変更候補ファイル

- `renderer/app.js`
- `renderer/cad/selection.js`（新規）
- `renderer/ui/statusbar.js`（必要なら）

## 実装詳細

- ドラッグ開始点 `start` と現在点 `current` から矩形を作成し、
  - `current.x >= start.x` なら Window
  - `current.x < start.x` なら Crossing
- 選択プレビュー矩形の色:
  - Window: `#4da6ff`（半透明）
  - Crossing: `#3ddc84`（半透明）

## テスト・確認

- マウス操作で左→右/右→左の選択結果差を確認。
- 100+要素で体感遅延がないこと。
- Delete / Move / Copy / Undo / Redo の既存挙動が壊れていないこと。

## 出力形式

1. 変更内容の要約
2. 変更ファイル一覧
3. 主要ロジックの説明
4. 実行したテストコマンドと結果
5. 既知の制限（あれば）

