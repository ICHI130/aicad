# AI CAD - Codex 実装指示書 v4
# 「Phase 3: 作図品質・操作性向上」

> まず `git pull origin main` を実行してから作業すること。
> 1機能ずつ `git commit` すること。最後に `git push origin main` すること。
> 変えてはいけないファイル: `renderer/cad/canvas.js`, `renderer/io/dxf.js`, `renderer/io/jww.js`

---

## ■ 実装済み機能（触るな・壊すな）

| 機能 | ファイル |
|------|---------|
| LINE/RECT/CIRCLE/ARC/POLYLINE/TEXT 作図 | app.js |
| MOVE/COPY/ROTATE/SCALE/OFFSET/MIRROR | app.js |
| TRIM/EXTEND/FILLET/ARRAY/HATCH/JOIN/EXPLODE | app.js |
| DIM（線形寸法） | app.js + tools.js |
| コマンドライン（L,C,REC,TR,MI等） | commandline.js |
| レイヤー管理（色・線種・表示/非表示/ロック） | layerpanel.js |
| スナップ（端点/中点/交点/象限点） | snap.js |
| ホイールズーム・パン・矩形選択 | app.js |
| 右クリックコンテキストメニュー | app.js |
| Undo/Redo | app.js |
| DXF/JWW 読み込み | dxf.js / jww.js |
| AI自動作図（JSONパース） | app.js |
| PDF印刷 | app.js |
| 多言語（日本語/英語） | i18n.js |
| **プロパティパネル（色/線種/線幅/ジオメトリ）** | propertypanel.js |
| **線種15種（実線/破線/一点鎖線等）** | linetypes.js |
| **色変更（9マスパレット+カスタム、ByLayer対応）** | colors.js / propertypanel.js |
| **グリップ編集（LINE/CIRCLE/RECT端点ドラッグ）** | app.js |
| **交差選択（右→左で緑枠、触れたもの全選択）** | app.js |
| **テキストダブルクリック再編集** | app.js |
| **@W,H 矩形サイズ入力** | app.js |
| **設定タブ（APIキー入力）** | index.html / sidebar.js |
| **プロパティ変更リアルタイム反映（適用ボタンなし）** | propertypanel.js |

---

## ■ 今回実装するフェーズ（PHASE 3）

---

### 🟢 P3-1: 動的入力（Dynamic Input / DYN）

**何が問題か**: 作図中に現在の長さ・角度がリアルタイムで見えない。コマンドラインを見ないと距離が分からない。

**実装内容**: `renderer/ui/dyninput.js` を新規作成。

カーソル近くにフロートDIVを表示:
```
   ┌────────────────┐
   │ 長さ: 1234.5mm │
   │ 角度:   45.0°  │
   └────────────────┘
```

仕様:
- `position: fixed` でマウス位置の右下（+20px, +20px）に追従
- 作図中（LINE/RECT/CIRCLE等の step > 0）の mousemove でリアルタイム更新
- 距離 = 始点〜現在点のmm距離
- 角度 = atan2で計算（0°=右、反時計回り正）
- SELECT/非作図時は非表示
- F11キーでON/OFFトグル

```javascript
// dyninput.js
export function initDynInput() {
  const div = document.createElement('div');
  div.id = 'dyn-input';
  div.style.cssText = `
    position: fixed; pointer-events: none; z-index: 500;
    background: rgba(20,25,32,0.9); border: 1px solid #4da6ff;
    border-radius: 4px; padding: 4px 8px; font-size: 11px;
    font-family: monospace; color: #e8e8e8; display: none;
    white-space: nowrap;
  `;
  document.body.appendChild(div);

  return {
    update(screenX, screenY, from, to) {
      // from, to はmm座標 {x, y}
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      const angle = Math.atan2(-(to.y - from.y), to.x - from.x) * 180 / Math.PI;
      div.innerHTML = `長さ: ${dist.toFixed(1)}mm<br>角度: ${((angle % 360) + 360) % 360 | 0}°`;
      div.style.left = (screenX + 20) + 'px';
      div.style.top  = (screenY + 20) + 'px';
      div.style.display = 'block';
    },
    hide() { div.style.display = 'none'; },
    toggle() { /* F11でON/OFFフラグ切り替え */ },
  };
}
```

**app.js への組み込み**:
- `initDynInput()` を起動時に呼ぶ
- mousemove 内で、作図中（drawingStart が存在する場合）に `dynInput.update(screenX, screenY, drawingStart, currentMm)` を呼ぶ
- SELECT時・mouseup後は `dynInput.hide()` を呼ぶ

---

### 🟢 P3-2: ELLIPSE（楕円）ツール

**何が問題か**: 楕円がない。柱断面・家具記号等で多用する。

**shape型**:
```javascript
{ type: 'ellipse', cx, cy, rx, ry, rotation: 0, color, linetype, linewidth, layerId }
```

**tools.js buildShapeNode() に追加**:
```javascript
if (shape.type === 'ellipse') {
  const c = mmToScreen({ x: shape.cx, y: shape.cy }, viewport);
  return new Konva.Ellipse({
    x: c.x, y: c.y,
    radiusX: shape.rx * viewport.scale,
    radiusY: shape.ry * viewport.scale,
    rotation: shape.rotation || 0,
    stroke: color, strokeWidth: sw, fill: 'transparent',
    dash, id: shape.id, listening: !isPreview,
  });
}
```

**app.js のツール追加**:
```javascript
Tool.ELLIPSE = 'ellipse';
// コマンド: EL → ellipse
// Step 0: 中心クリック
// Step 1: X軸端点クリック → rx確定
// Step 2: Y軸端点クリック → ry確定 → 確定
```

**ツールバーへの追加**:
- 描画グループに「○楕円 [EL]」ボタンを追加

**グリップ対応**:
```javascript
// getGripPoints() に追加
if (shape.type === 'ellipse') return [
  { x: shape.cx, y: shape.cy },           // 中心
  { x: shape.cx + shape.rx, y: shape.cy }, // X軸端
  { x: shape.cx, y: shape.cy + shape.ry }, // Y軸端
];
```

---

### 🟢 P3-3: BREAK（線分分割）コマンド

**何が問題か**: 線を2点で切断する機能がない。

**コマンド**: `BR` → `Tool.BREAK`

**操作フロー**:
```
BR → 「切断する線をクリック」 → 「切断点1をクリック」 → 「切断点2をクリック」 → 完了
```

**app.js の実装**:
```javascript
// breakState = { shapeId, pt1 }
// Step 1: 図形クリック → breakState.shapeId = hit.id
// Step 2: 点1クリック → breakState.pt1 = mm
// Step 3: 点2クリック → 線分を分割

function applyBreak(shapeId, pt1, pt2) {
  const shape = shapes.find(s => s.id === shapeId);
  if (!shape || shape.type !== 'line') return;
  // pt1, pt2 を線上に投影して t1, t2 を求める
  // t1 < t2 の間を削除
  // shape を [始点〜pt1] の線分に縮める
  // [pt2〜終点] の新しい線分を追加
  const newLine = { id: newId(), type: 'line',
    x1: pt2.x, y1: pt2.y,
    x2: shape.x2, y2: shape.y2,
    color: shape.color, linetype: shape.linetype, linewidth: shape.linewidth, layerId: shape.layerId };
  shape.x2 = pt1.x; shape.y2 = pt1.y;
  shapes.push(newLine);
  saveHistory(); redraw();
}
```

---

### 🟢 P3-4: LENGTHEN（長さ変更）コマンド

**コマンド**: `LEN` → `Tool.LENGTHEN`

**操作フロー**:
```
LEN → 「変更する線をクリック（端点側）」 → コマンドラインで新しい長さを入力 → 確定
```

**実装**:
```javascript
// 線の始点に近い端 vs 終点に近い端を判定して、その端を延長/縮小
function applyLengthen(shape, endIndex, newLength) {
  const len = Math.hypot(shape.x2-shape.x1, shape.y2-shape.y1);
  const ratio = newLength / len;
  if (endIndex === 1) { // 終点側
    shape.x2 = shape.x1 + (shape.x2-shape.x1) * ratio;
    shape.y2 = shape.y1 + (shape.y2-shape.y1) * ratio;
  } else { // 始点側
    shape.x1 = shape.x2 + (shape.x1-shape.x2) * ratio;
    shape.y1 = shape.y2 + (shape.y1-shape.y2) * ratio;
  }
}
```

---

### 🟢 P3-5: CHAMFER（面取り）コマンド

**コマンド**: `CHA` → `Tool.CHAMFER`

**操作フロー**:
```
CHA → コマンドラインで距離1を入力 → 距離2を入力 → 線1クリック → 線2クリック → 面取り実行
```

**実装**:
```javascript
// chamferState = { dist1, dist2, line1Id }
// 2線の交点を求め、各線から dist1, dist2 の点を計算
// 各線を交点側で縮め、2点間に新しい斜め線を追加
// FILLETと同じ構造で実装できる（radius=0 のフィレット + 斜め線追加）
```

---

### 🟢 P3-6: 寸法の種類追加（半径・直径）

**何が問題か**: 現在は線形寸法のみ。円の半径・直径寸法がない。

**tools.js buildShapeNode() に追加**:

```javascript
if (shape.type === 'dim' && shape.dimType === 'radius') {
  // 円の中心から引き出し点へ矢印 + "R1234"テキスト
  const group = new Konva.Group({ id: shape.id, listening: !isPreview });
  const c  = mmToScreen({ x: shape.cx, y: shape.cy }, viewport);
  const pt = mmToScreen({ x: shape.px, y: shape.py }, viewport);
  group.add(new Konva.Arrow({
    points: [c.x, c.y, pt.x, pt.y],
    stroke: color, fill: color, strokeWidth: sw,
    pointerLength: 8, pointerWidth: 6,
  }));
  group.add(new Konva.Text({
    x: pt.x + 4, y: pt.y - 14,
    text: `R${Math.round(shape.r)}`,
    fontSize: Math.max(10, 10 * viewport.scale), fill: color,
  }));
  return group;
}

if (shape.type === 'dim' && shape.dimType === 'diameter') {
  // 直径線（中心を通る） + "φ1234"テキスト
  const group = new Konva.Group({ id: shape.id, listening: !isPreview });
  const p1 = mmToScreen({ x: shape.cx - shape.r, y: shape.cy }, viewport);
  const p2 = mmToScreen({ x: shape.cx + shape.r, y: shape.cy }, viewport);
  const mid = mmToScreen({ x: shape.cx, y: shape.cy - shape.r * 0.5 }, viewport);
  group.add(new Konva.Arrow({ points: [p1.x,p1.y,p2.x,p2.y], stroke:color, fill:color, strokeWidth:sw, pointerLength:8, pointerWidth:6 }));
  group.add(new Konva.Arrow({ points: [p2.x,p2.y,p1.x,p1.y], stroke:color, fill:color, strokeWidth:sw, pointerLength:8, pointerWidth:6 }));
  group.add(new Konva.Text({ x: mid.x+4, y: mid.y-14, text: `φ${Math.round(shape.r*2)}`, fontSize: Math.max(10, 10*viewport.scale), fill: color }));
  return group;
}
```

**app.js のDIMコマンド改修**:
```javascript
// DIM選択後にコマンドライン入力:
//   (Enter/何も入力) → 線形寸法（従来）
//   R               → 半径寸法モード（円をクリック→引き出し点クリック）
//   D               → 直径寸法モード（円をクリック）
```

**shape データ**:
```javascript
// 半径寸法
{ type: 'dim', dimType: 'radius', cx, cy, r, px, py }
// 直径寸法
{ type: 'dim', dimType: 'diameter', cx, cy, r }
```

---

### 🟢 P3-7: 寸法スタイル設定

**何が問題か**: 矢印サイズ・文字高さ・単位が固定。

**実装内容**: `renderer/ui/dimstyle.js` を新規作成。

```javascript
// dimstyle.js
export const DEFAULT_DIM_STYLE = {
  textHeight: 2.5,   // mm
  arrowSize: 2.5,    // mm
  offset: 10,        // mm（寸法線と図形の距離）
  unit: 'mm',        // 'mm' | 'm' | 'cm'
  precision: 0,      // 小数点以下桁数
};

let currentStyle = { ...DEFAULT_DIM_STYLE };

export function getDimStyle() { return currentStyle; }
export function setDimStyle(patch) { Object.assign(currentStyle, patch); }
```

**設定UIの追加場所**: 設定タブ（`index.html` の `#sidebar-tab-settings`）に「📐 寸法スタイル」セクションを追加。

```html
<div class="settings-title">📐 寸法スタイル</div>
<label class="settings-label">文字高さ (mm)
  <input id="dim-text-height" type="number" min="0.5" step="0.5" value="2.5" />
</label>
<label class="settings-label">矢印サイズ (mm)
  <input id="dim-arrow-size" type="number" min="0.5" step="0.5" value="2.5" />
</label>
<label class="settings-label">単位
  <select id="dim-unit">
    <option value="mm">mm</option>
    <option value="cm">cm</option>
    <option value="m">m</option>
  </select>
</label>
<label class="settings-label">小数点以下
  <select id="dim-precision">
    <option value="0">0桁（1234）</option>
    <option value="1">1桁（1234.5）</option>
    <option value="2">2桁（1234.56）</option>
  </select>
</label>
```

**tools.js の dim描画で getDimStyle() を参照する**:
```javascript
import { getDimStyle } from '../ui/dimstyle.js';
// buildShapeNode内のdim処理でstyle.textHeight, style.arrowSizeを使う
```

---

## ■ 実装順序（この順で）

```
Step 1: dyninput.js 作成 + app.js組み込み（LINE/RECT/CIRCLE作図中に距離・角度表示）
Step 2: ELLIPSE ツール（tools.js + app.js + toolbar.js）
Step 3: BREAK コマンド（app.js）
Step 4: LENGTHEN コマンド（app.js）
Step 5: CHAMFER コマンド（app.js）
Step 6: 半径・直径寸法（tools.js + app.js）
Step 7: dimstyle.js 作成 + 設定タブに寸法スタイルUI追加
```

---

## ■ 変えてはいけないもの

- `renderer/cad/canvas.js` の viewport・座標変換ロジック
- `renderer/io/dxf.js` のDXFパーサー
- `renderer/io/jww.js` のJWWパーサー
- viewport の `{ x, y, scale }` 構造
- IPC は preload.js 経由のみ（main.js に直接触らない）
- Undo/Redo の history[] 構造
- `propertypanel.js` の実装（リアルタイム反映・9マスパレット）
- `layerpanel.js` の実装（色・線種設定）

---

## ■ 完了チェックリスト

Phase 3:
- [ ] LINE作図中にカーソル近くに距離・角度が表示される（DYN）
- [ ] CIRCLE/RECT作図中にも距離が表示される
- [ ] `EL` コマンドで楕円が描ける
- [ ] `BR` コマンドで線を2点で分割できる
- [ ] `LEN` コマンドで線の長さを変更できる
- [ ] `CHA` コマンドで面取りができる
- [ ] 円を選択してDIM→Rで半径寸法（R1000）が記入できる
- [ ] 円を選択してDIM→Dで直径寸法（φ2000）が記入できる
- [ ] 設定タブで寸法スタイル（文字高さ・矢印・単位）を変更できる
- [ ] 寸法スタイルの変更が既存寸法に反映される

完了後 `git push origin main` すること。
