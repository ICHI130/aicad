# AutoCAD UI ギャップ調査（Ribbon基準）

この資料は、提供された AutoCAD 画面（Home/Insert/Annotate/View/Manage/Output/Collaborate タブ）と現行 AI CAD 実装を比較し、**「他に何があるか」** を機能単位で整理したものです。

---

> 補足: 本差分は `autocad標準教科書.pdf` / `autocad応用教科書.pdf` の学習項目と合わせて運用する想定です。実装優先度の最新版は `docs/autocad-textbook-integration-plan.md` を参照してください。

## 1) Home（作図・修正）で不足しやすい上位機能

> 既存の基本作図（Line/Rect/Circle/Arc/Polyline）・一部修正（Move/Copy/Rotate/Mirror/Trim/Extend/Fillet/Array/Offset）は実装済み。

### Draw系（追加候補）
- **Spline（スプライン）**: 自由曲線。建築意匠や家具曲線で多用。
- **Ellipse（楕円）**: 円弧以外の曲線作図。
- **Construction Line / Ray（無限線・半直線）**: 基準線作図。
- **Donut / Revision Cloud**: 注記・修正指示用。

### Modify系（追加候補）
- **Stretch（ストレッチ）**: 窓選択端だけ伸縮。壁編集で非常に重要。
- **Explode / Join（分解・結合）**: 複合要素の編集で必須。
- **Align（整列）**: 位置合わせ+回転の同時処理。
- **Break（線分分割）**: 指定点間の欠損作成。
- **Chamfer（面取り）**: フィレットと並ぶ定番機能。

### Properties / Layer運用
- **ByLayer 色/線種/線幅**の編集UI（現在は限定的）。
- **Match Properties（プロパティコピー）**。
- **Layer State（画層状態保存/復元）**。

---

## 2) Annotate（注釈）で不足しやすい上位機能

- **MLeader（マルチ引出線）**: 寸法以外の注記必須機能。
- **Table（表）**: 仕上表・建具表などに必要。
- **Text Style / Dimension Style マネージャ**:
  - 文字高さ、矢印サイズ、小数精度、寸法単位表記などをテンプレ化。
- **Hatch Pattern管理**:
  - ピッチ/角度だけでなく、ANSI/AR-CONC等パターン選択。

---

## 3) Insert（挿入）で不足しやすい上位機能

- **Block定義・編集（BEDIT相当）**。
- **Block属性（Attribute）**: 設備記号や部屋名タグに必須。
- **External Reference（Xref）**: 分散図面運用の核。
- **Image/PDF Underlay**: 下図トレースや現場図取込。

---

## 4) View（表示）で不足しやすい上位機能

- **Named Views（保存ビュー）**。
- **複数ビューポート管理（分割表示）**: 平面+3D同時確認。
- **Visual Style切替**（Wireframe/Shaded等）。
- **Navigation Cube/Orbit強化**（特に3D時）。

---

## 5) Output（出力）で不足しやすい上位機能

- **Plot Style（CTB/STB）**: 色→線幅変換ルール。
- **レイアウト（紙空間）＋タイトル枠運用**。
- **バッチ印刷（Publish）**。
- **DWG/PDF 書き出しオプション詳細**（尺度・用紙・線幅）。

---

## 6) Manage / Collaborate（管理・協調）で不足しやすい上位機能

- **CAD標準設定テンプレート**（単位・文字/寸法スタイル初期化）。
- **依存ファイル管理**（フォント、Xref、画像パス）。
- **クラウド連携**（Autodesk Docs相当の共有フロー）。
- **差分比較/履歴**（DWG Compare に近い変更追跡）。

---

## 7) 建築CADとして実務優先で先にやるべき順（提案）

### 最優先（作業効率を即改善）
1. **Stretch / Explode / Join / Chamfer**
2. **ByLayer（色・線種・線幅）編集UI**
3. **Dimension Style / Text Style 管理**
4. **MLeader**

### 次点（チーム運用に効く）
5. **Block + Attribute**
6. **Xref / Underlay（画像・PDF）**
7. **Layout（紙空間） + Plot Style（CTB/STB）**

### 中長期
8. **Named Views / Viewport強化**
9. **図面比較（差分可視化）**
10. **クラウド連携ワークフロー**

---

## 8) 既存実装との差分サマリ（短く）

- すでに「線を描く/移動する」など基本コマンドは揃っている。
- AutoCAD上部バーで見える“実務の厚み”は、
  - **スタイル管理（文字・寸法・印刷）**
  - **参照運用（Block/Xref）**
  - **図面管理（Layout/Publish/Compare）**
  に集中しており、ここが次の差分。
