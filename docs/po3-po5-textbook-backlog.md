# P3〜P5 機能バックログ（標準教科書・応用教科書ベース）

## 位置づけ（重要）

- `docs/autocad-textbook-integration-plan.md` の **P0 / P1 / P2 は実装済み** という前提で、次段の **P3〜P5** を定義する。
- 項目は次を統合して整理する。
  - `docs/autocad-textbook-integration-plan.md`
  - `docs/autocad-gap-analysis.md`
- 優先順位は「建築実務での使用頻度」「AutoCAD移行の違和感低減」「実装コスト」の3軸で決める。

---

## P3（実務編集の高速化）

> 目標: 日々の修正作業（赤入れ反映・図面更新）を最短手順で回せる状態にする。

### 編集系コマンドの実務完成

- Stretch（窓選択端の伸縮）
- Explode / Join（分解・再結合）
- Break（2点間欠損）
- Align（位置 + 回転の同時整列）
- Chamfer強化（距離/角度オプション）

### 選択ワークフローの強化

- Window / Crossing / Fence を正式実装
- Selection cycling（重なり順送り選択）
- Preselect + command（先選択後コマンド）

### 注記の実務性向上

- MLeader（簡易版→実務版）
- Text Style / Dimension Style 管理UI
- MATCHPROP（プロパティコピー）

### P3 完了条件（DoD）

- AutoCAD経験者が主要編集（移動・複写・整列・分解結合）を迷わず実行できる。
- 1000要素規模でも、選択〜編集の体感遅延が許容範囲に収まる。

---

## P4（再利用・チーム運用）

> 目標: 個人作図から、複数人での図面資産運用へ移行する。

### レイヤー運用

- ByLayer（色・線種・線幅）完全対応
- Layer State（保存/復元）
- 画層フィルタ（作業セット切替）

### ブロック運用

- Block定義・挿入・再利用
- Attribute付きBlock（部屋名・機器タグ）
- Block編集（BEDIT相当の最小機能）

### 外部参照・下図

- Xref（添付/再読込/パス解決）
- Image/PDF Underlay（下図トレース）

### P4 完了条件（DoD）

- 複数図面/複数担当で、参照切れ・属性不整合を抑えた運用ができる。
- ブロック+属性により、繰り返し要素の一括更新が実務レベルで機能する。

---

## P5（出図品質・監査・AI協調完成）

> 目標: 出図〜レビュー〜差分説明までを一気通貫で完結させる。

### 出力・納品品質

- Layout（紙空間）
- Plot Style（CTB/STB）
- バッチ印刷（Publish）
- DWG/PDF/DXF 書き出しオプション拡張

### 比較・標準化・保守

- 図面差分比較（変更箇所可視化）
- CAD標準テンプレート（単位/スタイル/レイヤー初期設定）
- 依存ファイル診断（フォント・Xref・画像パス）

### AI連携の実務化

- 変更理由ログ（監査向け）
- 「AI提案→承認→適用→Undo」の履歴統合
- 教科書準拠プロンプトプリセット（標準/応用）

### P5 完了条件（DoD）

- 納品時の尺度・線幅・印刷ルールをテンプレートで再現できる。
- レビュー時に「どこを・なぜ変えたか」を差分とログで説明できる。

---

## 推奨実装順（P3〜P5横断）

1. **P3**: 編集テンポ改善（Stretch / 選択系 / 注記スタイル）
2. **P4**: 再利用基盤（Layer State / Block+Attribute / Xref）
3. **P5**: 出図・監査（Layout / CTB-STB / 差分比較）

---

## すぐIssue化する最小タスク

- P3-01: Stretch MVP（line/rect/polyline対象）
- P3-02: Selection cycling + Fence
- P3-03: TextStyle / DimStyle ダイアログ
- P4-01: ByLayer完全対応 + Layer State保存
- P4-02: Block挿入 + Attribute編集
- P4-03: Xref attach/reload/path
- P5-01: Layout 1枚 + PDF出力
- P5-02: CTB/STBマップ最小実装
- P5-03: 図面差分比較（色分け表示）
