# AI CAD - Codex / Agent 引き継ぎ書

> **最終更新**: 2026-02 Claude Code作業分
> **リポジトリ**: https://github.com/ICHI130/aicad
> **作業ディレクトリ**: `C:\Users\ksnk1\OneDrive\デスクトップ\aicad\`

---

## ■ プロジェクト概要

**AI CAD** は建築・設計業務向けのAIファーストなCADアプリケーション。
- Electron + Konva.js による2D図面作成・編集
- JWW / DXF ファイルの読み込み対応（書き出しは未実装）
- ローカルLLM（Ollama）＋ クラウドAI（Claude/GPT）との連携
- オープンソース（MIT License）、AutoCAD・JW_CADの代替を目指す

---

## ■ 現在の実装状況（2026-02時点）

### ✅ 完成済み
| 機能 | ファイル |
|------|----------|
| Electronアプリ起動 | `main.js` |
| 黒背景・ズーム適応グリッド | `renderer/cad/canvas.js` |
| グリッドスナップ（1〜5000mm自動） | `renderer/cad/canvas.js` |
| 線描画（LINE） | `renderer/app.js` + `tools.js` |
| 矩形描画（RECT） | `renderer/app.js` + `tools.js` |
| 選択・移動・削除 | `renderer/app.js` |
| Undo/Redo（Ctrl+Z / Ctrl+Y、50ステップ） | `renderer/app.js` |
| 中ボタンパン、ホイールズーム | `renderer/app.js` |
| 中ボタンダブルクリック・Z→A・F で全体表示 | `renderer/app.js` |
| ESCキャンセル・選択解除 | `renderer/app.js` |
| DXF読み込み（LINE/ARC/CIRCLE/LWPOLYLINE/TEXT/MTEXT/POINT） | `renderer/io/dxf.js` |
| DXF CP932/UTF-8 文字化け修正 | `renderer/app.js` `decodeDxfBase64()` |
| JWW読み込み（バイナリパーサー） | `renderer/io/jww.js` |
| AIチャットパネル（Ollama/Claude） | `renderer/ui/sidebar.js` |
| ステータスバー（mm座標表示） | `renderer/ui/statusbar.js` |

### ❌ 未実装（今回のタスク）
- 円描画ツール（CIRCLEコマンド）
- 端点・中点・交点スナップ
- ポリライン描画
- 寸法線（DIMENSION）
- コピー・回転・鏡像・配列複写
- トリム・延長
- テキスト入力ツール（手で入力）
- ハッチング
- DXF書き出し
- レイヤー管理パネル

---

## ■ 今回Codexにやってほしいこと（優先順位順）

### 🔴 Task 1: 円描画ツール（最優先）

**操作**: ツールバーに「Circle」ボタン追加 → クリックで中心点 → ドラッグまたは2回目のクリックで半径確定

**実装箇所**:
1. `renderer/cad/tools.js` の `Tool` オブジェクトに `CIRCLE: 'circle'` を追加
2. `buildShapeNode` に `shape.type === 'circle'` の処理を追加（Konva.Circleを使用）
3. `renderer/app.js` に Tool.CIRCLE の状態遷移を追加（LINE と同様の2クリック方式）
4. `renderer/ui/toolbar.js` にCircleボタンを追加

shapeの型:
```javascript
{ id: 'shape_xxx', type: 'circle', cx: 0, cy: 0, r: 100 }
```

---

### 🔴 Task 2: 端点・中点スナップ

**現状**: グリッドスナップのみ。AutoCADの最重要機能なのに未実装。

**新規ファイル**: `renderer/cad/snap.js` を作成

```javascript
// snap.js の骨格
export function findSnapPoint(mmPoint, shapes, viewport, gridScale) {
  const threshold = 10 / viewport.scale; // スクリーン10px相当のmm距離

  // 優先度1: 端点スナップ
  for (const s of shapes) {
    const endpoints = getEndpoints(s);
    for (const ep of endpoints) {
      if (dist(mmPoint, ep) < threshold)
        return { ...ep, snapType: 'endpoint' };
    }
  }

  // 優先度2: 中点スナップ
  for (const s of shapes) {
    if (s.type === 'line') {
      const mid = { x: (s.x1+s.x2)/2, y: (s.y1+s.y2)/2 };
      if (dist(mmPoint, mid) < threshold)
        return { ...mid, snapType: 'midpoint' };
    }
  }

  // 優先度3: グリッドスナップ（フォールバック）
  return { ...snapToGrid(mmPoint, gridScale), snapType: 'grid' };
}
```

`app.js` の `mousemove` でスナップを計算し、スナップ点にマーカー（Konva.Rectの緑四角）を表示する。

---

### 🔴 Task 3: ポリライン描画

**操作**: クリックで頂点を追加、Enterまたは右クリックで確定。閉じるにはCキーまたは最初の点をクリック。

**Tool**: `Tool.POLYLINE = 'polyline'`

確定前はプレビューとして各線分を黄色で表示。
確定後は連続した線分として shapes に追加（個々の LINE として）。

---

### 🟡 Task 4: コピー・貼り付け

**Ctrl+C**: 選択中のshapeをクリップボード変数にコピー
**Ctrl+V**: 少しオフセット（10mm）した位置にペースト

`app.js` の keydown イベントに追加。

---

### 🟡 Task 5: 寸法線（DIMENSION）

水平・垂直寸法のみでOK。

**操作**: 寸法線ツール → 2点クリック → オフセット位置クリックで確定

shape型:
```javascript
{
  id: 'shape_xxx',
  type: 'dimension',
  x1, y1, x2, y2,      // 測定する2点
  offsetDist: 10,        // 寸法線のオフセット距離（mm）
  direction: 'horizontal' | 'vertical' | 'aligned'
}
```

`tools.js` で Konva.Line（寸法線）+ Konva.Text（寸法値）+ Konva.Line（引出線×2）を返す。

---

### 🟡 Task 6: DXF書き出し

`renderer/io/dxf.js` に `exportDxf(shapes)` を追加。

```javascript
export function exportDxf(shapes) {
  // DXF R12形式のテキストを生成して返す
  let dxf = '0\nSECTION\n2\nENTITIES\n';
  for (const s of shapes) {
    if (s.type === 'line') {
      dxf += `0\nLINE\n10\n${s.x1}\n20\n${s.y1}\n11\n${s.x2}\n21\n${s.y2}\n`;
    }
    // ARC, CIRCLE, TEXT...
  }
  dxf += '0\nENDSEC\n0\nEOF\n';
  return dxf;
}
```

`main.js` に `cad:save-dxf` IPC ハンドラを追加して `fs.writeFile()` で保存。

---

## ■ ファイル構成

```
aicad/
  main.js                 Electronメインプロセス（IPC定義）
  preload.js              IPCブリッジ（変更不要）
  renderer/
    index.html            メインHTML
    app.js                ★メインロジック（状態管理・イベント）
    cad/
      canvas.js           グリッド描画・座標変換（mmToScreen等）
      tools.js            KonvaノードBuilderのみ（副作用なし）
      snap.js             ★新規作成: スナップ計算ロジック
    io/
      dxf.js              DXFパーサー（読み込み） + exportDxf（書き出し追加予定）
      jww.js              JWWバイナリパーサー
    ui/
      toolbar.js          ツールバーUI
      sidebar.js          AIチャットパネル
      statusbar.js        座標・数値入力バー
```

---

## ■ 座標系の注意事項

```
内部単位: mm
画面変換: px = (mm - viewport.x) * viewport.scale

Y軸: DXFはY上向き正、スクリーン（Konva）はY下向き正
  → mmToScreen はそのまま変換（反転処理なし）
  → テキストは tools.js で offsetY(fontSize) で補正済み

DXF円弧: startAngle/endAngle は度数（°）、反時計回り正
Konva Arc: 時計回り正、rotation=startAngle, angle=sweepAngle
  → sweepAngle の計算: endAngle > startAngle ? endAngle-startAngle : 360-(startAngle-endAngle)
```

---

## ■ shapes 配列の型定義（現在）

```javascript
{ id, type:'line',   x1, y1, x2, y2 }
{ id, type:'arc',    cx, cy, r, startAngle, endAngle }
{ id, type:'circle', cx, cy, r }           // ← 追加予定
{ id, type:'rect',   x, y, w, h }
{ id, type:'text',   x, y, text, height, rotation, align }
{ id, type:'point',  x, y }
{ id, type:'dimension', x1, y1, x2, y2, offsetDist, direction }  // ← 追加予定
```

---

## ■ 技術メモ

### viewport オブジェクト
```javascript
const viewport = { x: 0, y: 0, scale: 1 };
// scale: px/mm（大きいほどズームイン）
// x,y: 画面左上端のmm座標
```

### IPC通信（preload.js 公開済み）
```javascript
window.cadBridge.openFile()           // ファイルを開く
window.cadBridge.askAi(payload)       // AIに質問
window.cadBridge.setClaudeApiKey(key) // APIキー設定
```

### saveHistory() について
app.js の saveHistory() は shapes の深いコピーを保存する。
新しい図形を追加・削除・変更した後は必ず saveHistory() を呼ぶこと。

---

## ■ Gitワークフロー

```bash
# 必ず最初に
git pull origin main

# 作業後
git add .
git commit -m "feat: 実装した機能の説明"
git push origin main
```

**このリポジトリはClaude CodeとCodexが交互に作業する。**
**作業前の `git pull` を絶対に忘れないこと。**
