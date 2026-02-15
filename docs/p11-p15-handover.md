# AI CAD — P11〜P15 引き継ぎ書
> 作成日: 2026-02-15
> 対象: Codex / Claude Code 双方

---

## 1. 現状サマリー（P0〜P10 で完了したこと）

| フェーズ | 主要成果 |
|--------|---------|
| P0 | 端点/中点/交点スナップ、ポリライン編集、Trim/Extend改善、寸法スタイル、MLeader、AIチャット編集 |
| P1 | ByLayer基礎、レイヤー状態保存、OSNAPステータスバー |
| P2〜P5 | Xref構想、レイアウト/印刷スタイル計画、差分比較、テンプレート、監査ログ |
| P6 | コマンド中オプション表示、`@dx,dy`相対座標、右クリック=Enter、Shift+OSNAP、動的入力 |
| P7 | Window/Crossing/Fence選択、Selection cycling、グリップ編集、TRIM/EXTEND連続処理、MATCHPROP、クイックプロパティ |
| P8 | 標準テンプレート、CAD規約チェック、教育モード |
| P9 | セマンティック差分、変更理由記録、依存関係診断、AIレビュー |
| P10 | 意図ベース編集、AIマクロ、監査トレーサビリティ |

### 現在のファイル構成

```
renderer/
  app.js              メインロジック（描画ツール・選択・Undo/Redo）
  cad/
    canvas.js         ★触らない★ Konvaキャンバス/viewport管理
    tools.js          buildShapeNode() - shape→Konvaノード変換
    snap.js           スナップ
    colors.js         色パレット・ByLayer
    linetypes.js      線種15種
    interaction.js    マウス操作ハンドラ
  io/
    dxf.js            ★触らない★ DXFパーサー
    jww.js            ★触らない★ JWWパーサー
  ui/
    commandline.js    コマンドライン（コマンド別名登録済み）
    toolbar.js        ツールバー
    layerpanel.js     レイヤーパネル
    propertypanel.js  プロパティパネル（リアルタイム反映）
    sidebar.js        AIチャットパネル
    statusbar.js      座標・ステータスバー
    dimstyle.js       寸法スタイル管理
    dyninput.js       動的入力（距離・角度表示）
    i18n.js           多言語（日本語/英語）
```

### 実装済み shape.type 一覧

```
line, rect, circle, arc, polyline, text,
ellipse, dim (linear/radius/diameter)
hatch, image
```

### 実装済みコマンド別名（commandline.js）

```
L=line, PL=polyline, C=circle, REC=rect, EL=ellipse
TR=trim, EX=extend, MI=mirror, RO=rotate, SC=scale
OF=offset, CO=copy, M=move, E=erase, DIM=dim
F=fillet, CHA=chamfer, BR=break, LEN=lengthen
H=hatch, T=text, MT=mtext
```

---

## 2. P11〜P15 概要マップ

```
P11: 作図ツール完成
     SPLINE / POL / REVCLOUD / WIPEOUT / DONUT / XLINE / DIV / ME / GRADIENT

P12: 注記・表システム
     MTEXT（高機能化）/ TABLE / GROUP / DRAWORDER / QSELECT

P13: 寸法完全対応
     角度 / 弧長 / 座標 / 直列 / 並列 / 幾何公差 / 中心マーク / QDIM / DIMSPACE

P14: ブロック強化・シンボルライブラリ
     HATCHEDIT / ATTEDIT / 建築シンボルパネル / クイックプロパティ強化

P15: レイアウト・外部ファイル完成
     ペーパー空間レイアウト / PDFアンダーレイ / イメージクリップ / DXF書き出し強化
```

---

## 3. P11: 作図ツール完成

**DoD**: 標準教科書第5章の全描画ツールが使える

### P11-1: SPLINE（スプライン曲線）

**コマンド**: `SPL` → `Tool.SPLINE`

**shape型**:
```javascript
{ type: 'spline', points: [{x,y}, ...], closed: false,
  color, linetype, linewidth, layerId }
```

**tools.js buildShapeNode() 追加**:
```javascript
if (shape.type === 'spline') {
  // Konva.Line に tension=0.5 でスプライン近似
  const pts = shape.points.flatMap(p => {
    const s = mmToScreen(p, viewport);
    return [s.x, s.y];
  });
  return new Konva.Line({
    points: pts,
    tension: 0.5,
    closed: shape.closed || false,
    stroke: color, strokeWidth: sw, fill: 'transparent',
    dash, id: shape.id, listening: !isPreview,
  });
}
```

**操作フロー**:
```
SPL → 制御点を連続クリック → Enter で確定（右クリック=Enter）
      コマンドライン: 「スプライン: クリックで制御点追加、Enterで確定」
```

**グリップ**: 全制御点にグリップ表示、ドラッグで形状変更

---

### P11-2: POLYGON（正多角形）

**コマンド**: `POL` → `Tool.POLYGON`

**shape型**:
```javascript
{ type: 'polygon', cx, cy, r, sides: 6, rotation: 0,
  inscribed: true,  // true=内接, false=外接
  color, linetype, linewidth, layerId }
```

**tools.js buildShapeNode() 追加**:
```javascript
if (shape.type === 'polygon') {
  const c = mmToScreen({ x: shape.cx, y: shape.cy }, viewport);
  const rPx = shape.r * viewport.scale;
  const pts = [];
  for (let i = 0; i < shape.sides; i++) {
    const a = (Math.PI * 2 * i / shape.sides) + (shape.rotation || 0) * Math.PI / 180;
    pts.push(c.x + rPx * Math.cos(a), c.y + rPx * Math.sin(a));
  }
  return new Konva.Line({
    points: pts, closed: true,
    stroke: color, strokeWidth: sw, fill: 'transparent',
    dash, id: shape.id, listening: !isPreview,
  });
}
```

**操作フロー**:
```
POL → コマンドライン「辺数を入力 [3-32]:」→ 数値入力+Enter
    → 中心クリック → 半径クリック → 確定
    オプション: I=内接円, C=外接円（デフォルト: 内接）
```

---

### P11-3: REVCLOUD（雲マーク / 修正マーク）

**コマンド**: `RVC` → `Tool.REVCLOUD`

**shape型**:
```javascript
{ type: 'revcloud', points: [{x,y}, ...], arcLength: 15,
  color, linetype: 'CONTINUOUS', linewidth, layerId }
```

**tools.js buildShapeNode() 追加**:
```javascript
if (shape.type === 'revcloud') {
  // 頂点列を結ぶ弧列（外向き凸の半円弧）をKonva.Pathで描く
  const group = new Konva.Group({ id: shape.id, listening: !isPreview });
  const pts = shape.points;
  if (pts.length < 2) return group;
  let pathData = '';
  const arcLenPx = (shape.arcLength || 15) * viewport.scale;
  for (let i = 0; i < pts.length; i++) {
    const a = mmToScreen(pts[i], viewport);
    const b = mmToScreen(pts[(i + 1) % pts.length], viewport);
    const r = Math.hypot(b.x - a.x, b.y - a.y) / 2;
    if (i === 0) pathData += `M ${a.x} ${a.y}`;
    pathData += ` A ${r} ${r} 0 0 0 ${b.x} ${b.y}`;
  }
  pathData += ' Z';
  group.add(new Konva.Path({
    data: pathData,
    stroke: color, strokeWidth: sw, fill: 'transparent',
  }));
  return group;
}
```

**操作フロー**:
```
RVC → フリーハンドでポリライン描画（mousemove中に点を追加）
    → 始点近くでクリック/Enter で閉じて確定
    弧サイズはコマンドラインで変更可: 「弧の長さ [15]:」
```

---

### P11-4: WIPEOUT（ワイプアウト）

**コマンド**: `WI` → `Tool.WIPEOUT`

**shape型**:
```javascript
{ type: 'wipeout', points: [{x,y}, ...], layerId }
// 白塗り（または背景色）の不透明ポリゴン → 下のオブジェクトを隠す
```

**tools.js buildShapeNode() 追加**:
```javascript
if (shape.type === 'wipeout') {
  const pts = shape.points.flatMap(p => {
    const s = mmToScreen(p, viewport);
    return [s.x, s.y];
  });
  return new Konva.Line({
    points: pts, closed: true,
    fill: '#1a1a1a',  // キャンバス背景色に合わせる
    stroke: '#1a1a1a', strokeWidth: 1,
    id: shape.id, listening: !isPreview,
  });
}
```

**表示順序**: wipeout は必ず他のshapeより前面に描画（drawOrderを優先）

**操作フロー**: POLYLINEと同じ（クリックで頂点追加、Enterで閉じて確定）

---

### P11-5: DONUT（ドーナツ）

**コマンド**: `DO` → `Tool.DONUT`

**shape型**:
```javascript
{ type: 'donut', cx, cy, innerR, outerR,
  color, linetype, linewidth, layerId }
```

**tools.js buildShapeNode() 追加**:
```javascript
if (shape.type === 'donut') {
  const c = mmToScreen({ x: shape.cx, y: shape.cy }, viewport);
  const r1 = shape.innerR * viewport.scale;
  const r2 = shape.outerR * viewport.scale;
  const group = new Konva.Group({ id: shape.id, listening: !isPreview });
  // 外円（塗り）
  group.add(new Konva.Circle({ x: c.x, y: c.y, radius: r2,
    fill: color, stroke: 'transparent' }));
  // 内円（背景色で抜く）
  if (r1 > 0) {
    group.add(new Konva.Circle({ x: c.x, y: c.y, radius: r1,
      fill: '#1a1a1a', stroke: 'transparent' }));
  }
  return group;
}
```

**操作フロー**:
```
DO → コマンドライン「内径を入力 [0]:」→ 「外径を入力 [50]:」
   → 中心をクリック（複数配置可、Enterで終了）
```

---

### P11-6: XLINE（構築線）と RAY（放射線）

**コマンド**: `XL` → `Tool.XLINE` / `RAY` → `Tool.RAY`

**shape型**:
```javascript
// 構築線: 両方向に無限
{ type: 'xline', x: 0, y: 0, angle: 0,
  color, linetype, linewidth, layerId }
// 放射線: 一方向に無限（始点から角度方向）
{ type: 'ray', x1, y1, angle: 0,
  color, linetype, linewidth, layerId }
```

**tools.js buildShapeNode() 追加**:
```javascript
if (shape.type === 'xline' || shape.type === 'ray') {
  const p = mmToScreen({ x: shape.x || shape.x1, y: shape.y || shape.y1 }, viewport);
  const angle = (shape.angle || 0) * Math.PI / 180;
  const BIG = 100000;
  let pts;
  if (shape.type === 'xline') {
    pts = [
      p.x - BIG * Math.cos(angle), p.y - BIG * Math.sin(angle),
      p.x + BIG * Math.cos(angle), p.y + BIG * Math.sin(angle),
    ];
  } else {
    pts = [p.x, p.y, p.x + BIG * Math.cos(angle), p.y + BIG * Math.sin(angle)];
  }
  return new Konva.Line({
    points: pts, stroke: color, strokeWidth: sw,
    dash: [4, 4],  // 構築線は常に破線
    id: shape.id, listening: !isPreview,
  });
}
```

**操作フロー**:
```
XL → 通過点クリック → 角度方向クリック（複数配置可、Enterで終了）
     オプション: H=水平, V=垂直, A=角度指定, B=2点通過
```

---

### P11-7: DIVIDE / MEASURE（ディバイダ / 計測）

**コマンド**: `DIV` → `Tool.DIVIDE` / `ME` → `Tool.MEASURE`

**point shape型**:
```javascript
{ type: 'point', x, y, color, layerId }
```

**tools.js buildShapeNode() 追加**:
```javascript
if (shape.type === 'point') {
  const p = mmToScreen({ x: shape.x, y: shape.y }, viewport);
  return new Konva.Circle({
    x: p.x, y: p.y, radius: 3,
    fill: color, stroke: 'transparent',
    id: shape.id, listening: !isPreview,
  });
}
```

**DIVIDE 操作フロー**:
```
DIV → 対象クリック → コマンドライン「分割数を入力:」→ 等分点にポイント配置
```

**MEASURE 操作フロー**:
```
ME → 対象クリック → コマンドライン「距離を入力:」→ 指定距離ごとにポイント配置
```

---

### P11-8: GRADIENT（グラデーション塗り）

**既存 HATCH に追加**:
```javascript
// shape.type === 'hatch' に gradient プロパティを追加
{ type: 'hatch', ..., fillType: 'gradient',
  gradient: { type: 'linear', color1: '#ffffff', color2: '#4da6ff', angle: 0 } }
```

**tools.js buildShapeNode() のhatch処理に分岐追加**:
```javascript
if (shape.fillType === 'gradient' && shape.gradient) {
  const g = shape.gradient;
  // KonvaのLinearGradient or RadialGradient で塗る
}
```

**コマンドライン**: `GD` → hatchツールのサブモードとして実装

---

### P11 ツールバー追加

`toolbar.js` の描画グループに以下を追加:
```
SPL スプライン      POL 正多角形
RVC 雲マーク        WI  ワイプアウト
DO  ドーナツ        XL  構築線
DIV ディバイダ      ME  計測
```

---

## 4. P12: 注記・表システム

**DoD**: 標準教科書第5章の注記・表機能が使える

### P12-1: MTEXT（マルチテキスト高機能化）

**既存の type:'text' を拡張**:
```javascript
{ type: 'mtext', x, y, width: 100, content: [
    { text: '1行目テキスト', bold: false, italic: false, height: 3.5 },
    { text: '2行目テキスト', bold: true,  italic: false, height: 3.5 },
  ], color, layerId }
```

**tools.js buildShapeNode() 追加**:
```javascript
if (shape.type === 'mtext') {
  const p = mmToScreen({ x: shape.x, y: shape.y }, viewport);
  const group = new Konva.Group({ id: shape.id, listening: !isPreview });
  let offsetY = 0;
  for (const line of shape.content) {
    const fontSize = Math.max(8, line.height * viewport.scale);
    const t = new Konva.Text({
      x: p.x, y: p.y + offsetY,
      text: line.text,
      fontSize, fill: color,
      fontStyle: `${line.bold ? 'bold' : ''} ${line.italic ? 'italic' : ''}`.trim(),
      fontFamily: 'monospace',
    });
    group.add(t);
    offsetY += fontSize * 1.4;
  }
  return group;
}
```

**MTEXTエディタUI**: クリック時にフローティングダイアログを表示
```html
<!-- renderer/index.html に追加 -->
<div id="mtext-editor" style="display:none; position:fixed; z-index:1000;
     background:#2a2a2a; border:1px solid #4da6ff; padding:12px; border-radius:6px;">
  <textarea id="mtext-content" rows="6" cols="40"
    style="background:#1a1a1a; color:#e8e8e8; border:1px solid #444;
           font-family:monospace; resize:both;"></textarea>
  <div style="margin-top:8px; display:flex; gap:8px;">
    <label>高さ(mm): <input id="mtext-height" type="number" value="3.5" step="0.5" style="width:60px;"/></label>
    <button id="mtext-bold">B</button>
    <button id="mtext-italic">I</button>
    <button id="mtext-ok">OK</button>
    <button id="mtext-cancel">キャンセル</button>
  </div>
</div>
```

---

### P12-2: TABLE（表）

**コマンド**: `TB` → `Tool.TABLE`

**shape型**:
```javascript
{ type: 'table', x, y,
  cols: 4, rows: 3,
  colWidths: [30, 30, 30, 30],   // mm
  rowHeights: [10, 10, 10],      // mm
  cells: [['列1','列2','列3','列4'], ['','','',''], ['','','','']],
  color, layerId }
```

**tools.js buildShapeNode() 追加**:
```javascript
if (shape.type === 'table') {
  const group = new Konva.Group({ id: shape.id, listening: !isPreview });
  const origin = mmToScreen({ x: shape.x, y: shape.y }, viewport);
  let y = origin.y;
  for (let r = 0; r < shape.rows; r++) {
    let x = origin.x;
    const rowH = shape.rowHeights[r] * viewport.scale;
    for (let c = 0; c < shape.cols; c++) {
      const colW = shape.colWidths[c] * viewport.scale;
      // セル枠
      group.add(new Konva.Rect({ x, y, width: colW, height: rowH,
        stroke: color, strokeWidth: sw, fill: 'transparent' }));
      // セルテキスト
      const cellText = (shape.cells[r] || [])[c] || '';
      if (cellText) {
        group.add(new Konva.Text({
          x: x + 2, y: y + 2, text: cellText,
          fontSize: Math.max(8, 2.5 * viewport.scale), fill: color,
        }));
      }
      x += colW;
    }
    y += rowH;
  }
  return group;
}
```

**操作フロー**:
```
TB → コマンドライン「列数 [4]:」「行数 [3]:」「列幅(mm) [30]:」「行高(mm) [10]:」
   → 配置点クリック → 表を配置
   → ダブルクリックでセル編集ダイアログ
```

**セル編集ダイアログ** (`#table-editor`):
- クリックしたセルを検出してフォーカス
- Tab/Shift+Tab で隣のセルへ移動
- Enterで確定、Escでキャンセル

---

### P12-3: GROUP / UNGROUP（グループ）

**コマンド**: `G` → グループ化 / `UG` → グループ解除

**グループ管理**:
```javascript
// app.js に追加
let groups = {};  // { groupId: [shapeId, ...] }

function createGroup(shapeIds) {
  const gid = `group_${Date.now()}`;
  groups[gid] = [...shapeIds];
  // 各shapeにgroupIdを設定
  shapeIds.forEach(id => {
    const s = shapes.find(s => s.id === id);
    if (s) s.groupId = gid;
  });
  saveHistory(); redraw();
}

function ungroupSelected() {
  const gid = selectedShapes[0]?.groupId;
  if (!gid) return;
  groups[gid].forEach(id => {
    const s = shapes.find(s => s.id === id);
    if (s) delete s.groupId;
  });
  delete groups[gid];
  saveHistory(); redraw();
}
```

**選択挙動**: グループ内をクリックするとグループ全体を選択（2回クリックで個別編集モード）

---

### P12-4: DRAWORDER（表示順序）

**コマンド**: `DR` → コンテキストメニューから

**右クリックメニューに追加**:
```
最前面へ (Bring to Front)
前面へ (Bring Forward)
背面へ (Send Backward)
最背面へ (Send to Back)
```

**実装**:
```javascript
function bringToFront(shapeId) {
  const idx = shapes.findIndex(s => s.id === shapeId);
  const [s] = shapes.splice(idx, 1);
  shapes.push(s);  // 配列末尾 = 最前面
  saveHistory(); redraw();
}
```

---

### P12-5: QSELECT（クイック選択）

**コマンド**: `QS` → フィルタダイアログ

**UIダイアログ**:
```html
<div id="qselect-dialog">
  <select id="qs-type">
    <option value="">すべて</option>
    <option value="line">線分</option>
    <option value="circle">円</option>
    <option value="rect">矩形</option>
    ...
  </select>
  <select id="qs-layer">
    <!-- レイヤー一覧を動的生成 -->
  </select>
  <button id="qs-apply">選択</button>
</div>
```

**処理**:
```javascript
function quickSelect(type, layerId) {
  selectedShapes = shapes.filter(s =>
    (!type || s.type === type) &&
    (!layerId || s.layerId === layerId)
  );
  redraw();
}
```

---

## 5. P13: 寸法完全対応

**DoD**: 標準教科書第7章の全寸法種別が記入できる

### P13-1: 角度寸法（DIMANG）

**コマンド**: `DAN` → `Tool.DIM_ANGULAR`

**shape型**:
```javascript
{ type: 'dim', dimType: 'angular',
  cx, cy,       // 角の頂点
  pt1x, pt1y,   // 第1辺上の点
  pt2x, pt2y,   // 第2辺上の点
  arcR: 30,     // 寸法弧の半径(mm)
  color, layerId }
```

**tools.js buildShapeNode() 追加**:
```javascript
if (shape.type === 'dim' && shape.dimType === 'angular') {
  const group = new Konva.Group({ id: shape.id, listening: !isPreview });
  const c  = mmToScreen({ x: shape.cx,  y: shape.cy  }, viewport);
  const p1 = mmToScreen({ x: shape.pt1x, y: shape.pt1y }, viewport);
  const p2 = mmToScreen({ x: shape.pt2x, y: shape.pt2y }, viewport);
  const rPx = shape.arcR * viewport.scale;
  const a1 = Math.atan2(p1.y - c.y, p1.x - c.x);
  const a2 = Math.atan2(p2.y - c.y, p2.x - c.x);
  const angleDeg = Math.abs((a2 - a1) * 180 / Math.PI);
  // 弧を描く
  group.add(new Konva.Arc({
    x: c.x, y: c.y,
    innerRadius: rPx, outerRadius: rPx + sw,
    angle: angleDeg, rotation: a1 * 180 / Math.PI,
    fill: color, stroke: color, strokeWidth: sw / 2,
  }));
  // 引出線
  group.add(new Konva.Line({ points: [c.x, c.y, p1.x, p1.y], stroke: color, strokeWidth: sw / 2, dash: [4,4] }));
  group.add(new Konva.Line({ points: [c.x, c.y, p2.x, p2.y], stroke: color, strokeWidth: sw / 2, dash: [4,4] }));
  // 角度テキスト
  const midA = (a1 + a2) / 2;
  const tx = c.x + (rPx + 8) * Math.cos(midA);
  const ty = c.y + (rPx + 8) * Math.sin(midA);
  group.add(new Konva.Text({
    x: tx, y: ty - 8,
    text: `${angleDeg.toFixed(1)}°`,
    fontSize: Math.max(10, 10 * viewport.scale), fill: color,
  }));
  return group;
}
```

**操作フロー**:
```
DAN → 角の頂点クリック → 第1辺上の点クリック → 第2辺上の点クリック
    → 寸法弧の位置クリック → 確定
```

---

### P13-2: 直列寸法（DIMCONTINUE）/ 並列寸法（DIMBASELINE）

**コマンド**: `DCO` → 直列寸法 / `DBA` → 並列寸法

**直列寸法**: 前の寸法の第2延長線から次の寸法を連続記入
**並列寸法**: 最初の寸法の基線から複数の寸法を記入

**実装方針**:
```javascript
// app.js に追加
let lastDimRef = null;  // 最後に記入した寸法のshape参照

// DCO: lastDimRef の終点を始点として次の線形寸法を記入
// DBA: lastDimRef の始点を基線として、指定点までの寸法を記入（オフセットY増加）
```

**操作フロー**:
```
DCO → （直前に線形寸法を記入済みの状態で）→ 次の延長線の点をクリック → 連続記入
DBA → （直前に線形寸法を記入済みの状態で）→ 並列に記入したい点をクリック
```

---

### P13-3: 座標寸法（DIMORDINATE）

**コマンド**: `DOR` → `Tool.DIM_ORDINATE`

**shape型**:
```javascript
{ type: 'dim', dimType: 'ordinate',
  x, y,         // 計測点
  tx, ty,       // テキスト位置
  axis: 'X',    // 'X' or 'Y'
  color, layerId }
```

**実装**: 計測点から引出線を引き、X座標またはY座標値をテキスト表示

---

### P13-4: 幾何公差（TOLERANCE）

**コマンド**: `TOL` → `Tool.TOLERANCE`

**shape型**:
```javascript
{ type: 'dim', dimType: 'tolerance',
  x, y,
  symbol: '⌀',    // 公差記号（真直度/真円度/平行度等）
  value1: '0.05',
  value2: '',
  datum: 'A',
  color, layerId }
```

**tools.js buildShapeNode() 追加**:
```javascript
if (shape.type === 'dim' && shape.dimType === 'tolerance') {
  const group = new Konva.Group({ id: shape.id, listening: !isPreview });
  const p = mmToScreen({ x: shape.x, y: shape.y }, viewport);
  const h = Math.max(12, 8 * viewport.scale);
  // 公差枠: [記号][値1][データム]
  const boxes = [shape.symbol, shape.value1, shape.datum].filter(Boolean);
  let dx = 0;
  for (const text of boxes) {
    const w = text.length * h * 0.6 + 8;
    group.add(new Konva.Rect({ x: p.x + dx, y: p.y, width: w, height: h,
      stroke: color, strokeWidth: sw, fill: 'transparent' }));
    group.add(new Konva.Text({ x: p.x + dx + 4, y: p.y + 2,
      text, fontSize: h * 0.7, fill: color }));
    dx += w;
  }
  return group;
}
```

**操作フロー**:
```
TOL → 公差ダイアログで記号・値・データムを入力 → 配置点クリック
```

---

### P13-5: 中心マーク / 中心線

**コマンド**: `DCE` → 中心マーク / `CL` → 中心線

**中心マーク shape型**:
```javascript
{ type: 'dim', dimType: 'centermark',
  cx, cy, r,   // 対象円の情報
  size: 5,     // 中心マークのサイズ(mm)
  color, layerId }
```

**tools.js buildShapeNode() 追加**:
```javascript
if (shape.type === 'dim' && shape.dimType === 'centermark') {
  const group = new Konva.Group({ id: shape.id, listening: !isPreview });
  const c = mmToScreen({ x: shape.cx, y: shape.cy }, viewport);
  const s = shape.size * viewport.scale;
  const rPx = shape.r * viewport.scale;
  // 十字マーク（円の外まで延長）
  group.add(new Konva.Line({ points: [c.x - rPx - s, c.y, c.x + rPx + s, c.y],
    stroke: color, strokeWidth: sw, dash: [4, 2, 1, 2] }));
  group.add(new Konva.Line({ points: [c.x, c.y - rPx - s, c.x, c.y + rPx + s],
    stroke: color, strokeWidth: sw, dash: [4, 2, 1, 2] }));
  return group;
}
```

**操作フロー**: `DCE` → 円をクリック → 中心マークを自動配置

---

### P13-6: QDIM（クイック寸法）

**コマンド**: `QDIM`

**機能**: 複数のオブジェクトを選択すると、連続した線形寸法を一括記入

**実装**:
```javascript
// 選択されたshapesから端点/交点を自動抽出
// X方向またはY方向に整列した点のグループを検出
// 一括で直列寸法を生成
function applyQdim(shapes, direction, baseY) {
  const pts = extractKeyPoints(shapes, direction);
  pts.sort((a, b) => a[direction] - b[direction]);
  for (let i = 0; i < pts.length - 1; i++) {
    addDimShape({ /* 連続寸法 */ });
  }
}
```

---

### P13-7: DIMSPACE（寸法値間隔調整）

**コマンド**: `DIMSP`

**機能**: 選択した複数の平行寸法を等間隔に再配置

**操作フロー**:
```
DIMSP → 基準寸法を選択 → 整列する寸法を選択（複数可） → 間隔値を入力 → 等間隔に再配置
```

---

## 6. P14: ブロック強化・シンボルライブラリ

**DoD**: 建築設計で使う標準シンボルを素早く配置できる

### P14-1: HATCHEDIT（ハッチング編集）

**既存ハッチング選択時のプロパティパネルに追加**:
- パターン変更ドロップダウン
- 角度入力
- スケール入力
- 色変更

**ダブルクリックでハッチング編集ダイアログ**:
```javascript
// app.js のdblclick処理に追加
if (shape.type === 'hatch') openHatchEditDialog(shape);
```

---

### P14-2: ATTEDIT（属性付きブロック編集）

**ダブルクリック挙動**:
```javascript
// 属性付きブロック（type:'block', attributes:[...]）をダブルクリック
// → フローティングダイアログで各属性値を編集
if (shape.type === 'block' && shape.attributes?.length) {
  openAttrEditDialog(shape);
}
```

**属性編集ダイアログ** (`#attr-edit-dialog`):
```html
<div id="attr-edit-dialog" style="display:none; position:fixed; z-index:1000;
     background:#2a2a2a; border:1px solid #4da6ff; padding:16px; border-radius:6px;">
  <h3 style="color:#e8e8e8; margin:0 0 12px;">属性編集</h3>
  <div id="attr-fields"></div>
  <div style="margin-top:12px; display:flex; gap:8px; justify-content:flex-end;">
    <button id="attr-ok">OK</button>
    <button id="attr-cancel">キャンセル</button>
  </div>
</div>
```

---

### P14-3: 建築シンボルライブラリパネル

**新規ファイル**: `renderer/ui/symbollibrary.js`

**パネル位置**: 左サイドバー（ツールバーの下）にアコーディオン形式で追加

**カテゴリと内容**:

```javascript
// symbollibrary.js
export const SYMBOL_LIBRARY = {
  '建具': [
    { name: '片開きドア', type: 'block', w: 900, d: 200,
      shapes: [
        // ドア枠: rect
        { type: 'rect', x: 0, y: 0, w: 200, h: 900 },
        // ドア扇: line + arc
        { type: 'line', x1: 200, y1: 0, x2: 200, y2: 900 },
        { type: 'arc', cx: 200, cy: 0, r: 900, startAngle: 0, endAngle: 90 },
      ]
    },
    { name: '引き違い窓', type: 'block', w: 1800, d: 100, shapes: [...] },
    { name: '折れ戸',    type: 'block', w: 600,  d: 200, shapes: [...] },
    { name: '両開きドア', type: 'block', w: 1200, d: 200, shapes: [...] },
  ],
  '設備': [
    { name: '洗面台', ... },
    { name: 'トイレ', ... },
    { name: 'バスタブ', ... },
    { name: 'キッチン', ... },
  ],
  '家具': [
    { name: 'テーブル（900×1800）', ... },
    { name: 'イス', ... },
    { name: 'ベッド（シングル）', ... },
    { name: 'ソファ', ... },
  ],
  '通り芯': [
    { name: '通り芯マーカー', ... },  // 一点鎖線 + 丸囲み番号
  ],
};
```

**UIパネル**:
```html
<!-- renderer/index.html の左サイドバー領域に追加 -->
<div id="symbol-library-panel" style="border-top:1px solid #333; padding:8px;">
  <div class="panel-header" onclick="toggleSymbolLibrary()">
    📦 シンボルライブラリ ▼
  </div>
  <div id="symbol-library-content">
    <!-- カテゴリごとにアコーディオン -->
  </div>
</div>
```

**配置方法**: パネルから図形をドラッグ→キャンバスにドロップ or クリック後キャンバスでクリック配置

---

### P14-4: クイックプロパティパネル強化

**選択時に画面下部（またはカーソル近傍）にミニパネル表示**:

```html
<div id="quick-props" style="position:fixed; bottom:60px; left:50%; transform:translateX(-50%);
     background:#2a2a2a; border:1px solid #4da6ff; border-radius:6px; padding:8px;
     display:none; z-index:200;">
  <!-- shape.type に応じて動的生成 -->
  <!-- 例: LINE選択時 → 始点X,Y / 終点X,Y / 長さ / 角度 -->
  <!-- 例: CIRCLE選択時 → 中心X,Y / 半径 / 直径 / 周長 / 面積 -->
</div>
```

**表示タイミング**: オブジェクト選択時に自動表示、選択解除で非表示

---

## 7. P15: レイアウト・外部ファイル完成

**DoD**: ペーパー空間でレイアウト管理・PDF/画像のアンダーレイが使える

### P15-1: ペーパー空間レイアウト（LAYOUT）

**概念**:
- モデル空間: 実寸で作図する空間（現在の実装）
- ペーパー空間: 印刷用の配置空間（A3/A4紙の上にビューポートを配置）

**実装方針** (`renderer/ui/layout.js` 新規作成):

```javascript
// layout.js
export let currentSpace = 'model';  // 'model' | 'paper'
export let layouts = [
  {
    id: 'layout1', name: 'Layout1',
    paper: { width: 297, height: 210, unit: 'mm' },  // A4横
    viewports: [
      { id: 'vp1', x: 10, y: 10, w: 277, h: 190, scale: 0.01 }  // 1/100
    ]
  }
];

export function switchToLayout(layoutId) {
  currentSpace = layoutId === 'model' ? 'model' : 'paper';
  redrawLayout();
}
```

**タブUI** (index.html のキャンバス下部):
```html
<div id="layout-tabs" style="position:fixed; bottom:32px; left:0; right:0;
     background:#1a1a1a; border-top:1px solid #333; display:flex; align-items:center;
     height:28px; padding-left:8px; gap:2px; z-index:100;">
  <div class="layout-tab active" data-layout="model">モデル</div>
  <div class="layout-tab" data-layout="layout1">Layout1</div>
  <button id="add-layout" title="レイアウトを追加">+</button>
</div>
```

**ペーパー空間の描画** (tools.js / app.js):
- キャンバス背景をグレーに変更
- 白い紙（A4/A3）を描画
- ビューポート枠を描画
- ビューポート内にモデル空間の縮小コピーを描画

---

### P15-2: PDF アンダーレイ（PDFATTACH）

**コマンド**: `PDA` → PDFファイルを選択してアタッチ

**shape型**:
```javascript
{ type: 'pdf_underlay',
  x, y, w, h,    // 配置位置・サイズ(mm)
  path: '...',   // ファイルパス (Electronのmain経由)
  page: 1,
  opacity: 0.5,
  layerId }
```

**Electron IPC** (main.js への追加):
```javascript
ipcMain.handle('pdf:load', async (event, filePath) => {
  // pdfjsを使ってPDFを画像（PNG/JPEG）に変換して返す
  // または base64 data URL として返す
  const pdfData = await renderPdfToImage(filePath);
  return pdfData;
});
```

**tools.js buildShapeNode() 追加**:
```javascript
if (shape.type === 'pdf_underlay') {
  const p = mmToScreen({ x: shape.x, y: shape.y }, viewport);
  return new Konva.Image({
    x: p.x, y: p.y,
    image: cachedImages[shape.id],
    width: shape.w * viewport.scale,
    height: shape.h * viewport.scale,
    opacity: shape.opacity || 0.5,
    id: shape.id, listening: !isPreview,
  });
}
```

---

### P15-3: イメージクリップ（IMAGECLIP）

**既存の image shape に clip 情報を追加**:
```javascript
{ type: 'image', ...,
  clip: {
    type: 'rect',           // 'rect' | 'polygon'
    x, y, w, h,            // クリップ領域(mm) - 相対座標
  },
  brightness: 0,  // -100〜100
  contrast: 0,    // -100〜100
  fade: 0         // 0〜100（フェード）
}
```

**tools.js buildShapeNode() の image 処理を修正**:
```javascript
if (shape.type === 'image') {
  const p = mmToScreen({ x: shape.x, y: shape.y }, viewport);
  const imgNode = new Konva.Image({
    x: p.x, y: p.y,
    image: cachedImages[shape.id],
    width: shape.w * viewport.scale,
    height: shape.h * viewport.scale,
    opacity: shape.fade ? 1 - shape.fade / 100 : 1,
    id: shape.id, listening: !isPreview,
  });
  // クリップ適用
  if (shape.clip?.type === 'rect') {
    imgNode.clipX(shape.clip.x * viewport.scale);
    imgNode.clipY(shape.clip.y * viewport.scale);
    imgNode.clipWidth(shape.clip.w * viewport.scale);
    imgNode.clipHeight(shape.clip.h * viewport.scale);
  }
  return imgNode;
}
```

**操作フロー**:
```
IMAGECLIP → 画像を選択 → クリップ枠を矩形で指定 → 確定
```

---

### P15-4: DXF書き出し強化

**既存の dxf.js は触らない**。`renderer/io/dxfExport.js` を新規作成:

```javascript
// dxfExport.js
export function exportDXF(shapes, layers, options = {}) {
  const {
    version = 'R2013',  // 'R12' | 'R2004' | 'R2013'
    encoding = 'UTF-8',
    includeLayerDefs = true,
  } = options;

  let dxf = buildHeader(version);
  dxf += buildLayerTable(layers);
  dxf += buildEntities(shapes);
  return dxf;
}
```

**書き出し設定ダイアログ**:
```html
<div id="dxf-export-dialog">
  <label>バージョン:
    <select id="dxf-version">
      <option value="R12">R12（古いCADとの互換性）</option>
      <option value="R2004" selected>R2004</option>
      <option value="R2013">R2013</option>
    </select>
  </label>
  <label>単位:
    <select id="dxf-unit">
      <option value="mm" selected>ミリメートル</option>
      <option value="m">メートル</option>
    </select>
  </label>
  <button id="dxf-export-ok">書き出し</button>
</div>
```

---

## 8. 実装ルール・注意事項

### 絶対に触らないファイル
```
renderer/cad/canvas.js     → viewport・座標変換ロジック
renderer/io/dxf.js         → DXFパーサー（読み込み）
renderer/io/jww.js         → JWWパーサー
```

### 座標系ルール
```javascript
// 内部座標: mm単位 (x, y)
// 画面座標: px単位
// 変換: mmToScreen(mmPt, viewport) → {x, y} in px
//       screenToMm(pxPt, viewport) → {x, y} in mm
// viewport = { x: offsetX, y: offsetY, scale: pxPerMm }
```

### shape 共通プロパティ
```javascript
{
  id: 'shape_' + Date.now() + '_' + Math.random(),
  type: 'xxx',
  color: '#ffffff' | 'ByLayer',
  linetype: 'CONTINUOUS' | 'DASHED' | ... | 'ByLayer',
  linewidth: 0.25,   // mm | 'ByLayer'
  layerId: 'layer_0',
  groupId: null,     // グループ化時のみ
}
```

### Undo/Redo との連携
```javascript
// 形状追加・変更・削除後は必ず呼ぶ
saveHistory();
redraw();
```

### コマンドライン別名の追加（commandline.js）
```javascript
// 各コマンドの別名を必ず登録する
// 例: SPL, POL, RVC, WI, DO, XL, DIV, ME
// GD, TB, G, UG, DR, QS
// DAN, DCO, DBA, DOR, TOL, DCE, CL, QDIM, DIMSP
// HATCHEDIT, ATE, PDA, IMAGECLIP
```

---

## 9. 完了チェックリスト

### P11
- [ ] `SPL` でスプライン曲線が描ける（tension=0.5）
- [ ] `POL` で辺数を指定した正多角形が描ける
- [ ] `RVC` でフリーハンドの雲マークが描ける
- [ ] `WI` でワイプアウト（白塗り隠蔽）が使える
- [ ] `DO` で内径・外径を指定したドーナツが描ける
- [ ] `XL` で構築線（無限線）が描ける
- [ ] `DIV` で等分点にポイントが配置される
- [ ] `ME` で等距離点にポイントが配置される
- [ ] `GD` でグラデーション塗りができる

### P12
- [ ] `MT` で複数行テキストが入力できる（フローティングエディタ）
- [ ] ダブルクリックでMTEXT再編集できる
- [ ] `TB` で表が作成できる（行列数・サイズ指定）
- [ ] 表のセルをダブルクリックで編集できる
- [ ] `G` でオブジェクトをグループ化できる
- [ ] `UG` でグループを解除できる
- [ ] グループクリックで全体選択、2回クリックで個別編集
- [ ] 右クリックメニューに最前面/最背面の表示順序変更がある
- [ ] `QS` でオブジェクトタイプ/レイヤーで絞り込み選択できる

### P13
- [ ] `DAN` で2辺間の角度寸法が記入できる
- [ ] `DCO` で直列寸法が連続記入できる
- [ ] `DBA` で並列寸法が記入できる
- [ ] `DOR` でX/Y座標寸法が記入できる
- [ ] `TOL` で幾何公差枠が配置できる
- [ ] `DCE` で円の中心マーク（十字一点鎖線）が配置できる
- [ ] `QDIM` で複数オブジェクト選択後に一括寸法記入できる
- [ ] `DIMSP` で寸法の間隔を揃えられる

### P14
- [ ] ハッチング選択後にプロパティパネルでパターン・角度・スケールを変更できる
- [ ] 属性付きブロックをダブルクリックで属性値を編集できる
- [ ] シンボルライブラリパネルに建具・設備・家具カテゴリがある
- [ ] ライブラリからシンボルをクリックしてキャンバスに配置できる
- [ ] オブジェクト選択時にクイックプロパティパネルが表示される（座標・長さ・面積）

### P15
- [ ] 画面下部にモデル/レイアウトタブが表示される
- [ ] レイアウトタブでペーパー空間（A4白紙）が表示される
- [ ] ペーパー空間にビューポートを追加できる
- [ ] ビューポート内にモデル空間の内容が縮小表示される
- [ ] `PDA` でPDFファイルをアンダーレイとして配置できる
- [ ] 画像にクリップ枠を設定できる
- [ ] DXF書き出しダイアログでバージョン・単位を選べる
- [ ] 書き出したDXFにレイヤー情報が含まれる

---

## 10. 参照資料

- `autocad標準教科書.pdf` — 第5章（作成）・第6章（修正）・第7章（寸法）・第8章（外部ファイル）
- `autocad応用教科書.pdf` — 第1章（テンプレート・属性・Xref）・第3章（シートセット）・第5章（3D）
- `docs/autocad-textbook-integration-plan.md` — P0〜P10の方針
- `docs/autocad-gap-analysis.md` — 不足機能リスト
- `CODEX_TASK.md` — 各Pの実装指示（コード例付き）
