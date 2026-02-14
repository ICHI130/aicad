# AI CAD - Codex 実装指示書 v3
# 「AutoCAD不足機能 優先度順 実装タスク」

> まず `git pull origin main` を実行してから作業すること。
> 1機能ずつ `git commit` すること。最後に `git push origin main` すること。
> 変えてはいけないファイル: `renderer/cad/canvas.js`, `renderer/io/dxf.js`, `renderer/io/jww.js`

---

## ■ 現在の実装済み機能（触るな）

以下はすでに動いている。壊さないこと。

| 機能 | ファイル |
|------|---------|
| LINE/RECT/CIRCLE/ARC/POLYLINE/TEXT 作図 | app.js |
| MOVE/COPY/ROTATE/SCALE/OFFSET/MIRROR | app.js |
| TRIM/EXTEND/FILLET/ARRAY/HATCH/JOIN/EXPLODE | app.js |
| DIM（線形寸法） | app.js + tools.js |
| コマンドライン（L,C,REC,TR,MI等） | commandline.js |
| レイヤー管理（表示/非表示/ロック） | layerpanel.js |
| スナップ（端点/中点/交点/象限点） | snap.js |
| ホイールズーム・パン・矩形選択 | app.js |
| 右クリックコンテキストメニュー | app.js |
| Undo/Redo | app.js |
| DXF/JWW 読み込み | dxf.js / jww.js |
| AI自動作図（JSONパース） | app.js |
| PDF印刷 | app.js |
| 多言語（日本語/英語） | i18n.js |

---

## ■ 不足機能リスト（優先度順）

---

### 🔴 PHASE 1 - 最優先（CADとして最低限必要）

---

#### P1-1: プロパティパネル（Properties Panel）

**何が問題か**: 図形を選択しても色・線種・線幅を変更できない。座標も編集できない。

**実装内容**: `renderer/ui/propertypanel.js` を新規作成。

図形選択時に右サイドバー上部（AIチャットの上）に表示するパネル。

```
┌──────────────────────────────┐
│ プロパティ              [×]  │
├──────────────────────────────┤
│ 一般                         │
│  色:    [■ #00bfff ▼]       │
│  線種:  [実線 ▼]             │
│  線幅:  [0.25mm ▼]           │
│  レイヤ:[default ▼]          │
├──────────────────────────────┤
│ ジオメトリ                   │
│  （図形タイプ別プロパティ）  │
│  LINE:  X1:[___] Y1:[___]    │
│         X2:[___] Y2:[___]    │
│         長さ: 1234.5 mm      │
│  CIRCLE: CX:[__] CY:[__]     │
│          R:[___] mm          │
│  RECT:  X:[__] Y:[__]        │
│         W:[__] H:[__] mm     │
│  TEXT:  文字:[__________]    │
│         高さ:[__] 回転:[__]  │
├──────────────────────────────┤
│         [適用]               │
└──────────────────────────────┘
```

**仕様**:
- 図形選択時に自動表示、選択解除で非表示
- 色変更: `<input type="color">` でカラーピッカー → shape.color に保存
- 線種変更: selectドロップダウン → shape.linetype に保存
- 線幅変更: selectドロップダウン → shape.linewidth に保存
- 数値変更後「適用」クリックで shapes[] を更新 → saveHistory() → redraw()
- 複数選択時は共通プロパティのみ表示

**app.js 側の変更**:
- shapes に `color`, `linetype`, `linewidth` プロパティを追加（省略時はデフォルト値）
- `buildShapeNode()` でこれらを参照して描画色・線種・線幅を反映

**tools.js の buildShapeNode() 変更**:
```javascript
// 色はshape.color があればそれを使う、なければレイヤーカラー、なければデフォルト
const color = options.isPreview ? COLOR_PREVIEW
            : options.isSelected ? COLOR_SELECT
            : (shape.color || getLayerColor(shape.layer) || COLOR_LINE);

// 線幅
const sw = shape.linewidth ? shape.linewidth * viewport.scale : 1;

// 線種 → dashパターン
const dash = getDashPattern(shape.linetype, viewport.scale);
```

---

#### P1-2: 線種（Line Type）のフルサポート

**何が問題か**: 現在は全図形が実線のみ。破線・一点鎖線が使えない。

**実装内容**: `renderer/cad/linetypes.js` を新規作成。

```javascript
// linetypes.js
// dashパターンは mm 単位。viewport.scale をかけてpxに変換して使う。
export const LINE_TYPES = {
  'CONTINUOUS': { label: '実線',         dash: null },
  'DASHED':     { label: '破線',         dash: [12, 6] },
  'DASHED2':    { label: '破線(細)',      dash: [6, 3] },
  'DASHEDX2':   { label: '破線(太)',      dash: [24, 12] },
  'CENTER':     { label: '一点鎖線',     dash: [24, 6, 4, 6] },
  'CENTER2':    { label: '一点鎖線(細)', dash: [12, 4, 2, 4] },
  'CENTERX2':   { label: '一点鎖線(太)', dash: [48, 10, 8, 10] },
  'PHANTOM':    { label: '二点鎖線',     dash: [24, 6, 4, 6, 4, 6] },
  'PHANTOM2':   { label: '二点鎖線(細)', dash: [12, 4, 2, 4, 2, 4] },
  'DOT':        { label: '点線',         dash: [2, 6] },
  'DOT2':       { label: '点線(細)',     dash: [1, 3] },
  'DOTX2':      { label: '点線(太)',     dash: [4, 12] },
  'HIDDEN':     { label: '隠れ線',       dash: [6, 4] },
  'HIDDEN2':    { label: '隠れ線(細)',   dash: [3, 2] },
  'DIVIDE':     { label: '長破線',       dash: [32, 6, 2, 6, 2, 6] },
};

// Konva用dashパターンに変換（scale倍してpxに）
export function getDashPattern(linetype, scale) {
  const lt = LINE_TYPES[linetype];
  if (!lt || !lt.dash) return undefined; // 実線
  return lt.dash.map(v => v * Math.max(scale, 0.5));
}

// 線種名一覧（ドロップダウン用）
export function getLineTypeOptions() {
  return Object.entries(LINE_TYPES).map(([id, { label }]) => ({ id, label }));
}
```

**tools.js で使用**:
```javascript
import { getDashPattern } from './linetypes.js';
// buildShapeNode内で:
dash: getDashPattern(shape.linetype, viewport.scale)
```

**レイヤーにも線種を持たせる**:
- `layers[]` の各レイヤーに `linetype: 'CONTINUOUS'` プロパティ追加
- shape.linetype が `'ByLayer'` or undefined の場合、レイヤーの線種を使う

---

#### P1-3: 色変更のフルサポート（ByLayer対応）

**何が問題か**: 全図形が `#00bfff` 固定。図形ごと・レイヤーごとに色を変えられない。

**実装内容**:

`renderer/cad/colors.js` を新規作成:
```javascript
// AutoCAD標準色（ACI: AutoCAD Color Index）
export const ACI_COLORS = [
  { id: 1,  hex: '#FF0000', name: '赤' },
  { id: 2,  hex: '#FFFF00', name: '黄' },
  { id: 3,  hex: '#00FF00', name: '緑' },
  { id: 4,  hex: '#00FFFF', name: 'シアン' },
  { id: 5,  hex: '#0000FF', name: '青' },
  { id: 6,  hex: '#FF00FF', name: 'マゼンタ' },
  { id: 7,  hex: '#FFFFFF', name: '白' },
  { id: 8,  hex: '#808080', name: 'グレー' },
  { id: 9,  hex: '#C0C0C0', name: '薄グレー' },
  // 追加カラー
  { id: 'custom', hex: null, name: 'カスタム' },
];

export const DEFAULT_COLOR = '#00bfff'; // ByLayerデフォルト
```

**レイヤーパネル改修** (`layerpanel.js`):
- 各レイヤー行に色スウォッチ（小さい色の四角）を追加
- クリックで `<input type="color">` を開いてレイヤー色を変更
- `layer.color` に保存 → redraw()

**tools.js buildShapeNode() の色解決ロジック**:
```javascript
function resolveColor(shape, layers, isPreview, isSelected) {
  if (isPreview) return '#ffff00';
  if (isSelected) return '#ff4444';
  if (shape.color && shape.color !== 'ByLayer') return shape.color;
  // ByLayer: レイヤーの色を使う
  const layer = layers.find(l => l.id === (shape.layer || 'default'));
  return layer?.color || '#00bfff';
}
```

---

#### P1-4: 矩形の寸法入力（@W,H）

**何が問題か**: REC → 第1点クリック後に `@500,600` を入力しても矩形ができない。

**app.js の修正**: RECT ツールの step=1 で座標確定時に相対座標を正しく処理する。

```javascript
// RECT の step=1 で座標入力時
if (tool === Tool.RECT && drawingStart) {
  // @500,600 → drawingStart から +500, +600 の点を end として使う
  const end = handleCoordInput(str, drawingStart, null);
  if (end) {
    const shape = { id: newId(), type: 'rect', ...normalizeRect(drawingStart, end) };
    shapes.push(assignCurrentLayer(shape));
    saveHistory();
    redraw();
    changeTool(Tool.RECT); // 連続入力のためRESET
  }
}
```

commandline の `onCoordInput` コールバックから RECT のステップを処理すること。

---

#### P1-5: グリップ編集（Grip Editing）

**何が問題か**: 図形を選択しても変形できない。端点を掴んでドラッグで形状変更したい。

**実装内容**: 選択図形に青い四角グリップを表示し、ドラッグで変形する。

**app.js の修正**:

状態変数:
```javascript
let gripState = null; // { shapeId, gripIndex, gripType }
```

redraw() でグリップを描画:
```javascript
function drawGrips(shape) {
  const grips = getGripPoints(shape);
  grips.forEach((g, i) => {
    const sp = mmToScreen(g, viewport);
    const rect = new Konva.Rect({
      x: sp.x - 4, y: sp.y - 4,
      width: 8, height: 8,
      fill: '#0060ff', stroke: '#ffffff', strokeWidth: 1,
      id: `grip_${shape.id}_${i}`,
    });
    snapLayer.add(rect);
  });
}

function getGripPoints(shape) {
  if (shape.type === 'line')   return [{ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }, { x: (shape.x1+shape.x2)/2, y: (shape.y1+shape.y2)/2 }];
  if (shape.type === 'circle') return [{ x: shape.cx, y: shape.cy }, { x: shape.cx+shape.r, y: shape.cy }];
  if (shape.type === 'arc')    return [{ x: shape.cx, y: shape.cy }];
  if (shape.type === 'rect')   return [
    { x: shape.x,        y: shape.y        },
    { x: shape.x+shape.w, y: shape.y        },
    { x: shape.x+shape.w, y: shape.y+shape.h },
    { x: shape.x,        y: shape.y+shape.h },
    { x: shape.x+shape.w/2, y: shape.y+shape.h/2 }, // 中心
  ];
  return [];
}
```

mousedown でグリップクリック検出:
```javascript
// SELECT ツール + 図形選択中 → グリップヒットテスト
function hitTestGrip(screenPt) {
  if (!selectedId) return null;
  const shape = shapes.find(s => s.id === selectedId);
  if (!shape) return null;
  const grips = getGripPoints(shape);
  for (let i = 0; i < grips.length; i++) {
    const sp = mmToScreen(grips[i], viewport);
    if (Math.hypot(screenPt.x - sp.x, screenPt.y - sp.y) < 8) return i;
  }
  return null;
}
```

mousemove でグリップドラッグ:
```javascript
if (gripState) {
  const mm = getSnap();
  applyGripMove(shapes.find(s => s.id === selectedId), gripState.index, mm);
  redraw();
}

function applyGripMove(shape, gripIndex, mm) {
  if (shape.type === 'line') {
    if (gripIndex === 0) { shape.x1 = mm.x; shape.y1 = mm.y; }
    else if (gripIndex === 1) { shape.x2 = mm.x; shape.y2 = mm.y; }
    else { // 中点: 全体移動
      const dx = mm.x - (shape.x1+shape.x2)/2;
      const dy = mm.y - (shape.y1+shape.y2)/2;
      shape.x1+=dx; shape.y1+=dy; shape.x2+=dx; shape.y2+=dy;
    }
  }
  if (shape.type === 'circle') {
    if (gripIndex === 0) { shape.cx = mm.x; shape.cy = mm.y; }
    else { shape.r = Math.hypot(mm.x - shape.cx, mm.y - shape.cy); }
  }
  if (shape.type === 'rect') {
    if (gripIndex === 0) { shape.w += shape.x - mm.x; shape.h += shape.y - mm.y; shape.x = mm.x; shape.y = mm.y; }
    else if (gripIndex === 1) { shape.w = mm.x - shape.x; shape.h += shape.y - mm.y; shape.y = mm.y; }
    else if (gripIndex === 2) { shape.w = mm.x - shape.x; shape.h = mm.y - shape.y; }
    else if (gripIndex === 3) { shape.w += shape.x - mm.x; shape.h = mm.y - shape.y; shape.x = mm.x; }
    else { // 中心
      const dx = mm.x - (shape.x + shape.w/2);
      const dy = mm.y - (shape.y + shape.h/2);
      shape.x += dx; shape.y += dy;
    }
  }
}
```

mouseup でグリップ確定 → saveHistory()

---

### 🟡 PHASE 2 - 高優先度

---

#### P2-1: 交差選択（Crossing Selection）

**何が問題か**: 現在の矩形選択は左→右ドラッグで「完全包含」のみ。AutoCADは右→左で「交差選択」（触れたもの全部）。

**実装内容** (`app.js` mousemove/mouseup):
```javascript
// mousedown時にドラッグ方向を記録
// boxSelectStart = { x, y }（スクリーン座標）

// mousemove: ドラッグ方向で色を変える
const isCrossing = currentX < boxSelectStart.x; // 右→左 = 交差選択
selectRect.style.border = isCrossing
  ? '1px dashed #00cc44'   // 緑の破線 = 交差選択
  : '1px solid #4da6ff';   // 青の実線 = 窓選択
selectRect.style.background = isCrossing
  ? 'rgba(0,204,68,0.05)'
  : 'rgba(77,166,255,0.06)';

// mouseup: 判定方法を変える
if (isCrossing) {
  // 交差選択: ボックスに「一部でも」入っているもの全て
  for (const s of shapes) {
    if (shapeTouchesBbox(s, mmBbox)) selectedIds.add(s.id);
  }
} else {
  // 窓選択: ボックスに「完全に」入っているもの
  for (const s of shapes) {
    if (shapeInsideBbox(s, mmBbox)) selectedIds.add(s.id);
  }
}
```

`shapeTouchesBbox(shape, bbox)` 関数を追加:
- line: 両端点のどちらかがbbox内、またはboxと線分が交差
- circle: 中心からbboxまでの最短距離 < r
- rect: 矩形同士のオーバーラップ判定

---

#### P2-2: 寸法の種類追加

**何が問題か**: 現在は線形寸法（水平/垂直/平行）のみ。半径・直径・角度がない。

**tools.js の buildShapeNode() に追加**:

```javascript
// 半径寸法 (DIMRADIUS)
if (shape.type === 'dim' && shape.dimType === 'radius') {
  // 円の中心から外周までの引出線 + "R1234"テキスト
  const c = mmToScreen({ x: shape.cx, y: shape.cy }, viewport);
  const p = mmToScreen({ x: shape.px, y: shape.py }, viewport); // 引き出し点
  group.add(new Konva.Arrow({ points:[c.x,c.y,p.x,p.y], ...arrowStyle }));
  group.add(new Konva.Text({ x: p.x+4, y: p.y-14, text: `R${Math.round(shape.r)}`, ...textStyle }));
}

// 直径寸法 (DIMDIAMETER)
if (shape.type === 'dim' && shape.dimType === 'diameter') {
  // 直径を通る線 + "φ1234"テキスト
  group.add(new Konva.Text({ text: `φ${Math.round(shape.r*2)}`, ...textStyle }));
}

// 角度寸法 (DIMANGULAR)
if (shape.type === 'dim' && shape.dimType === 'angle') {
  // 2線間の角度 → 円弧 + "45.0°"テキスト
}
```

**app.js の DIM ツール改修**:
- DIM ツール選択後にコマンドラインで `R` → 半径寸法モード、`D` → 直径寸法モード
- デフォルトは従来の線形寸法

---

#### P2-3: 文字ダブルクリック再編集

**何が問題か**: テキストを一度書いたら変更できない。

**app.js の修正**:
```javascript
// SELECT ツールでダブルクリック → テキストなら再編集
stage.on('dblclick', (e) => {
  const mm = pointerToMm();
  const hit = pickShape(mm);
  if (hit && hit.type === 'text') {
    startTextEdit(hit); // 既存テキストの内容でフロートinputを表示
  }
});

function startTextEdit(shape) {
  // shape.text を初期値としてフロートinputを表示
  // Enter確定時 → shape.text = newValue; saveHistory(); redraw();
  // 既存の startTextInput() を改修して既存shapeを渡せるようにする
}
```

---

#### P2-4: レイヤーの色・線種設定

**何が問題か**: レイヤーに色がなく、線種も設定できない。

**layerpanel.js の改修**:

レイヤー一覧の各行に列を追加:
```
┌────────────────────────────────────────┐
│ レイヤー名 │ 色  │ 線種     │ 👁 │ 🔒 │
├────────────────────────────────────────┤
│ default    │ ■  │ 実線 ▼  │ 👁 │ 🔓 │
│ 壁         │ ■  │ 実線 ▼  │ 👁 │ 🔓 │
│ 寸法       │ ■  │ ─ ─ ▼  │ 👁 │ 🔓 │
└────────────────────────────────────────┘
```

- 色スウォッチクリック → `<input type="color">` → `layer.color` 更新
- 線種ドロップダウン → `layer.linetype` 更新

`layers[]` のデータ構造に追加:
```javascript
// layers配列の各要素
{
  id: 'default',
  name: 'default',
  visible: true,
  locked: false,
  color: '#00bfff',    // 追加
  linetype: 'CONTINUOUS', // 追加
  linewidth: 0.25,     // 追加（mm）
}
```

---

#### P2-5: 線幅（Line Weight）サポート

**何が問題か**: 全図形が1px固定。印刷時の太さが反映されない。

**実装内容**:
- 標準線幅: `[0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1.0, 1.4, 2.0]` mm
- プロパティパネルのドロップダウンで選択
- `shape.linewidth` に mm値で保存
- `buildShapeNode()` で `strokeWidth = shape.linewidth * viewport.scale`
- ただし最小1px（ズームアウト時に細すぎないように）

```javascript
// tools.js
const sw = Math.max(1, (shape.linewidth || 0.25) * viewport.scale);
```

---

#### P2-6: CHAMFER（面取り）コマンド

**何が問題か**: フィレットはあるが面取り（直線カット）がない。

**実装内容**:
- コマンド: `CHA` → `chamfer`
- 操作: 距離1入力 → 距離2入力 → 線1クリック → 線2クリック → 交点を斜め線で面取り
- フィレットと同じ操作フローで `filletState` を流用可能

---

### 🟢 PHASE 3 - 中優先度

---

#### P3-1: 動的入力（Dynamic Input / DYN）

**何が問題か**: 作図中に現在の長さ・角度がリアルタイムで見えない。

**実装内容**: `renderer/ui/dyninput.js` を新規作成。

カーソル近くにフロートDIVを表示:
```
   [長さ: 1234.5]
   [角度:  45.0°]
```

- position: fixed でマウス位置の近く（右下）に追従
- 作図中の mousemove で現在の距離・角度をリアルタイム更新
- 数字キー入力でそのフィールドに直接入力可能
- Tab で長さ↔角度フィールドを切り替え

---

#### P3-2: ELLIPSE（楕円）ツール

**何が問題か**: 楕円がない。建築図面では柱の断面等で使う。

**shape型**: `{ type: 'ellipse', cx, cy, rx, ry, rotation }`

**操作**: 中心クリック → X軸端点クリック → Y軸長さ入力

---

#### P3-3: SPLINE（スプライン曲線）

**何が問題か**: 曲線が円弧しかない。

**shape型**: `{ type: 'spline', points: [{x,y},...], closed: false }`

**描画**: Konva.Line with tension=0.5

---

#### P3-4: BREAK（線分分割）

**何が問題か**: 線を2点で切断する機能がない。

**コマンド**: `BR` → `break`

操作: 線をクリック → 切断点1 → 切断点2 → その間を削除

---

#### P3-5: LENGTHEN（長さ変更）

**コマンド**: `LEN`

操作: 線をクリック → 新しい長さを入力（または増分を入力）

---

#### P3-6: MEASURE / DIVIDE（等分）

**MEASURE**: 線分を指定間隔で点を配置
**DIVIDE**: 線分を指定個数で等分割して点を配置

---

#### P3-7: 寸法スタイル設定

**何が問題か**: 寸法の矢印サイズ・文字高さ・単位が固定。

**実装内容**: `renderer/ui/dimstyle.js`

設定項目:
- 文字高さ (default: 2.5mm)
- 矢印サイズ (default: 2.5mm)
- 寸法オフセット (default: 10mm)
- 単位 (mm / m / cm)
- 小数点以下桁数 (0〜3)

---

#### P3-8: STRETCH（ストレッチ）

**コマンド**: `S` → `stretch`（現在Sはselectに割り当て。`ST`に変更）

操作: 交差選択で端点を選択 → 基点 → 目標点 → 選択端点だけ動く

---

### 🔵 PHASE 4 - 低優先度（将来実装）

---

#### P4-1: ブロック機能（BLOCK/INSERT）

- BLOCK定義: 複数図形をまとめて部品化
- INSERT: 名前を指定して配置（スケール・回転対応）
- DXFブロック読み込み時にブロックとして扱う

#### P4-2: 印刷設定（用紙・縮尺）

- 用紙サイズ: A1/A2/A3/A4
- 縮尺: 1/1, 1/50, 1/100, 1/200
- 余白設定
- 印刷プレビュー

#### P4-3: PEDIT（ポリライン編集）

- 頂点の追加・削除・移動
- 幅設定（テーパー付き線）

#### P4-4: REGION（リージョン）とブール演算

- 面積計算
- UNION/SUBTRACT/INTERSECT

#### P4-5: 座標系（UCS）

- カスタム座標系の定義
- 傾いた座標系での作図

---

## ■ 実装順序（必ずこの順で）

```
Step 1: linetypes.js 作成 + buildShapeNode()で線種反映
Step 2: colors.js 作成 + レイヤーに color プロパティ + buildShapeNode()で色解決
Step 3: propertypanel.js 作成（色/線種/線幅/ジオメトリ編集）
Step 4: layerpanel.js に色・線種列を追加
Step 5: @W,H 矩形入力を修正
Step 6: グリップ編集（LINE/CIRCLE/RECT）
Step 7: 交差選択（右→左ドラッグ = 緑枠）
Step 8: 寸法追加（半径/直径）
Step 9: 文字ダブルクリック再編集
Step 10: CHAMFER コマンド
```

---

## ■ ファイル構成（追加するもの）

```
renderer/
  cad/
    linetypes.js     ← 新規: 線種定義・dashパターン
    colors.js        ← 新規: AutoCAD標準色・ByLayer解決
  ui/
    propertypanel.js ← 新規: プロパティパネル
    dyninput.js      ← 新規: 動的入力（DYN）
```

---

## ■ データ構造の変更（後方互換を保つこと）

shapes[] の各要素に以下を追加（全てオプション、省略時はデフォルト値）:
```javascript
{
  // 既存
  id: 'shape_xxx',
  type: 'line',
  // 既存のジオメトリプロパティ...

  // 新規追加（省略可能）
  color: '#ff0000',          // 省略時 → ByLayer
  linetype: 'DASHED',        // 省略時 → ByLayer (= 'CONTINUOUS')
  linewidth: 0.5,            // 省略時 → ByLayer (= 0.25mm)
  layer: 'default',          // 既存だが明示
}
```

layers[] の各要素:
```javascript
{
  id: 'default',
  name: 'default',
  visible: true,
  locked: false,
  color: '#00bfff',           // 新規追加
  linetype: 'CONTINUOUS',     // 新規追加
  linewidth: 0.25,            // 新規追加
}
```

---

## ■ 変えてはいけないもの

- `renderer/cad/canvas.js` の viewport・座標変換ロジック
- `renderer/io/dxf.js` のDXFパーサー
- `renderer/io/jww.js` のJWWパーサー
- viewport の `{ x, y, scale }` 構造
- IPC は preload.js 経由のみ（main.js に直接触らない）
- Undo/Redo の history[] 構造

---

## ■ 完了チェックリスト

Phase 1:
- [ ] 図形選択時にプロパティパネルが表示される
- [ ] 色ピッカーで図形の色を変更できる
- [ ] 線種ドロップダウンで破線・一点鎖線に変更できる
- [ ] 線幅ドロップダウンで線幅を変更できる
- [ ] @500,600 入力で幅500・高さ600の矩形ができる
- [ ] 図形選択後に青いグリップが表示される
- [ ] グリップをドラッグすると形状が変わる

Phase 2:
- [ ] 右→左ドラッグで緑枠の交差選択ができる
- [ ] 円に半径寸法を記入できる（R1000）
- [ ] テキストをダブルクリックで再編集できる
- [ ] レイヤーパネルで色を変更できる
- [ ] レイヤーで線種を設定できる

完了後 `git push origin main` すること。
