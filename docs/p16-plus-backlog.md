# AI CAD — P16以降 機能バックログ
> 作成日: 2026-02-15
> 依拠資料: autocad標準教科書（第3・4・6・8・9・10章）/ autocad応用教科書（全章）

---

## 概要マップ

```
P16: 作図補助設定の完成
     極トラッキング / オブジェクトトラッキング / 線種尺度 / 透過性 / 単位設定

P17: 図面管理・照会コマンド
     照会（距離/面積/角度/体積）/ 類似選択 / PURGE / RENAME / 図面比較

P18: ダイナミックブロック
     ブロックエディタ / パラメータ / アクション / 可視性ステート

P19: 注釈オブジェクト（異尺度対応）
     異尺度対応テキスト / 異尺度対応寸法 / 複数尺度付加

P20: 印刷スタイル・ページ設定完成
     CTB/STB印刷スタイル / ページ設定管理 / バッチ印刷(PUBLISH)

P21: 外部参照（Xref）完全対応
     Xref添付・バインド / Xrefクリップ / デザインセンター / ツールパレット

P22: 電子納品・シートセット
     シートセット管理 / PDFパブリッシュ / e-トランスミット / フィールド文字

P23: パラメトリックデザイン
     幾何拘束 / 寸法拘束 / パラメータ管理 / 拘束ダイナミックブロック

P24: データリンク・フィールド連携
     フィールド / Excelデータリンク / ブロック属性書き出し

P25: 3Dモデリング基礎
     ダイナミックUCS / ソリッド基本形状 / ブール演算 / 押し出し・回転
```

---

## P16: 作図補助設定の完成

**DoD**: 標準教科書第3章の図面設定機能がすべて動く

### P16-1: 極トラッキング（POLAR）

**コマンド**: ステータスバーの `極トラッキング` ボタン or `F10`

**機能**:
- 指定した角度増分（15°/30°/45°/90°等）でカーソルをスナップ
- トラッキングラインとツールチップで距離・角度を表示

**実装ポイント** (`renderer/cad/snap.js` に追加):
```javascript
// 極角度設定
export let polarAngles = [0, 45, 90, 135, 180, 225, 270, 315]; // デフォルト45°増分
export let polarEnabled = false;

export function applyPolarTracking(cursorMm, basePt) {
  if (!polarEnabled || !basePt) return cursorMm;
  const dx = cursorMm.x - basePt.x;
  const dy = cursorMm.y - basePt.y;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  // 最近傍の極角度に吸着
  const nearest = polarAngles.reduce((best, a) => {
    return Math.abs(angleDiff(angle, a)) < Math.abs(angleDiff(angle, best)) ? a : best;
  });
  if (Math.abs(angleDiff(angle, nearest)) < 3) { // 3°以内でスナップ
    const rad = nearest * Math.PI / 180;
    return { x: basePt.x + dist * Math.cos(rad), y: basePt.y + dist * Math.sin(rad) };
  }
  return cursorMm;
}
```

**設定UI**: ステータスバーの極トラッキングボタンを右クリック→角度一覧表示

---

### P16-2: オブジェクトトラッキング（OTRACK）

**コマンド**: ステータスバーの `オブジェクトトラッキング` ボタン or `F11`

**機能**:
- OSNAPポイント上に一時停止（ホバー）すると、そこからの延長線（トラッキング線）を表示
- 複数のトラッキング線の交点を自動検出して提示

**実装ポイント** (`snap.js` に追加):
```javascript
// トラッキング候補点を蓄積
export let trackingPoints = [];  // { x, y, type } 最大4点

export function addTrackingPoint(pt) {
  if (trackingPoints.length >= 4) trackingPoints.shift();
  trackingPoints.push(pt);
}

// カーソルがトラッキング線上にあるか判定
export function getTrackingIntersection(cursorMm) {
  for (const tp of trackingPoints) {
    // 水平・垂直・極角度ライン上の候補を返す
    ...
  }
}
```

---

### P16-3: 線種の尺度設定（LTSCALE / CELTSCALE）

**コマンド**: `LTSCALE` → 全体の線種尺度 / `CELTSCALE` → 個別オブジェクト尺度

**実装**:
```javascript
// app.js のグローバル設定に追加
export let ltscale = 1.0;  // グローバル線種尺度

// tools.js buildShapeNode() の dash 計算に乗算
const effectiveScale = (shape.celtscale || 1) * ltscale * viewport.scale;
const dash = getLinetypeDash(shape.linetype, effectiveScale);
```

**UI**: コマンドラインで `LTSCALE` → 数値入力 → Enter で即時反映

---

### P16-4: 透過性（TRANSPARENCY）

**対象**: オブジェクト単位 / レイヤー単位 / グローバル

**プロパティパネルに追加**:
```html
<label>透過性 (0〜90):
  <input type="range" id="prop-transparency" min="0" max="90" value="0" step="5"/>
  <span id="prop-transparency-val">0%</span>
</label>
```

**tools.js buildShapeNode() に反映**:
```javascript
const opacity = 1 - (shape.transparency || 0) / 100;
node.opacity(opacity);
```

---

### P16-5: 単位設定（UNITS）

**コマンド**: `UN` → 単位設定ダイアログ

**設定項目**:
- 長さの種類（小数/分数/工学/建築/科学）
- 精度（0〜8桁）
- 角度の種類（度/度分秒/グラジアン/ラジアン）
- 角度の精度
- 挿入単位（ミリメートル/センチメートル/メートル）

**UI** (index.html に追加):
```html
<div id="units-dialog" style="display:none; position:fixed; z-index:1000;
     background:#2a2a2a; border:1px solid #4da6ff; padding:16px; border-radius:6px;">
  <h3 style="color:#e8e8e8;">単位設定</h3>
  <label>長さの精度: <select id="units-length-prec">...</select></label>
  <label>角度の種類: <select id="units-angle-type">...</select></label>
  <label>挿入単位: <select id="units-insert">...</select></label>
  <button id="units-ok">OK</button>
</div>
```

---

### P16-6: 配列複写パス（PATH ARRAY）

**コマンド**: `AR` → オプション `PA` → パス配列複写

**shape型**:
```javascript
{ type: 'array_path',
  sourceId: 'shape_xxx',    // 複写元
  pathId: 'shape_yyy',      // パスとして使うポリライン/スプライン/線分
  count: 6,
  method: 'divide',         // 'divide'=等分 | 'measure'=等距離
  align: true,              // パスの接線方向に回転するか
  shapeIds: [...],          // 生成済みshape IDリスト
}
```

---

### P16-7: 配列複写編集（ARRAYEDIT）

**コマンド**: `ARRAYEDIT` → 既存配列を選択して数・間隔を変更

**操作フロー**:
```
配列複写shapeを選択 → グリップが表示
→ 数グリップをドラッグ → 数が変化
→ 間隔グリップをドラッグ → 間隔が変化
→ Enter で確定
```

---

## P17: 図面管理・照会コマンド

**DoD**: 標準教科書第4章の管理・照会機能がすべて動く

### P17-1: 照会コマンド群（MEASUREGEOM）

**コマンド一覧**:
| コマンド | 別名 | 機能 |
|---------|------|------|
| `DIST` | `DI` | 2点間距離・角度 |
| `AREA` | `AA` | 面積・周長計算 |
| `MASSPROP` | - | 体積・慣性モーメント（閉じた領域） |
| `ID` | - | 点の座標値表示 |
| `LIST` | `LI` | オブジェクト詳細情報 |

**ステータスバーへの表示**:
```javascript
// 計測結果をコマンドライン＋ステータスバーに表示
function showMeasureResult(label, value, unit) {
  commandLine.addLine(`${label}: ${value.toFixed(3)} ${unit}`);
}
```

**AREA 操作フロー**:
```
AA → クリックで頂点指定（閉じた多角形）→ Enter → 面積・周長を表示
   オプション: O=オブジェクト指定, A=加算, S=減算
```

---

### P17-2: 類似オブジェクト選択（SELECTSIMILAR）

**コマンド**: `SS` → 選択中のオブジェクトと同じtype/layerのものを一括選択

**実装**:
```javascript
function selectSimilar(refShape) {
  selectedShapes = shapes.filter(s =>
    s.type === refShape.type &&
    s.layerId === refShape.layerId &&
    !s.locked
  );
  redraw();
}
```

---

### P17-3: 名前削除（PURGE）

**コマンド**: `PU` → 未使用の定義を削除するダイアログ

**削除対象**:
- 使用されていないレイヤー
- 使用されていないブロック定義
- 使用されていない線種
- 使用されていない寸法スタイル
- 使用されていない文字スタイル

**実装**:
```javascript
function purgeUnused() {
  const usedLayerIds = new Set(shapes.map(s => s.layerId));
  const usedBlockNames = new Set(shapes.filter(s => s.type === 'block').map(s => s.blockName));
  // 未使用レイヤーを削除（layer_0は削除不可）
  layers = layers.filter(l => l.id === 'layer_0' || usedLayerIds.has(l.id));
  // 未使用ブロック定義を削除
  Object.keys(blockDefs).forEach(name => {
    if (!usedBlockNames.has(name)) delete blockDefs[name];
  });
  saveHistory(); redraw();
}
```

---

### P17-4: 名前変更（RENAME）

**コマンド**: `REN` → レイヤー/ブロック/スタイルの名前変更ダイアログ

---

### P17-5: 図面比較（DWGCOMPARE）

**コマンド**: `COMPARE` → 別のDXF/DWGと差分を可視化

**機能**:
- 追加された要素: 緑色でハイライト
- 削除された要素: 赤色でハイライト
- 変更された要素: 黄色でハイライト

**実装**: 既存の `docs/research/autocad_parity_notes.md` の差分ロジックを活用

---

## P18: ダイナミックブロック

**DoD**: 標準教科書第9章のダイナミックブロック機能が使える

### P18-1: ブロックエディタ（BEDIT）

**コマンド**: `BE` → ブロック選択→ブロックエディタ画面に切り替え

**UIレイアウト**:
```
┌─────────────────────────────────────────────────────┐
│ [ブロックエディタ終了]  [テスト]  [保存]             │  ← 専用ツールバー
├─────────┬───────────────────────────────────────────┤
│パラメータ│                                           │
│パネル   │       編集キャンバス（青背景）              │
│         │                                           │
│アクション│                                           │
│パネル   │                                           │
└─────────┴───────────────────────────────────────────┘
```

**実装**:
```javascript
// app.js に追加
export let beditMode = false;
export let beditBlockName = null;

function enterBlockEditor(blockName) {
  beditMode = true;
  beditBlockName = blockName;
  // キャンバス背景を青（#001a33）に変更
  // ブロック定義の図形をshapesとして展開
  // 専用ツールバーを表示
}

function exitBlockEditor() {
  beditMode = false;
  // 編集結果をblockDefs[beditBlockName]に保存
  // 通常キャンバスに復帰
}
```

---

### P18-2: ブロックパラメータ

**パラメータ種別**:

| 種別 | 用途 | 付随するグリップ |
|------|------|---------------|
| 点 | 移動基点 | 1点 |
| 線形 | 1方向の伸縮 | 2点 |
| 極 | 距離＋角度 | 2点 |
| XY | 縦横独立伸縮 | 3点 |
| 回転 | 角度変更 | 1点（弧グリップ） |
| 反転 | 鏡像 | 反転線 |
| 可視性 | 状態切替 | ドロップダウン |
| ルックアップ | リストから値選択 | ドロップダウン |

**shape型（パラメータ定義）**:
```javascript
// blockDefs[name].params に配列で格納
{
  id: 'param_1',
  type: 'linear',       // 'point'|'linear'|'polar'|'xy'|'rotation'|'flip'|'visibility'|'lookup'
  name: '幅',
  pt1: { x: 0, y: 0 }, // パラメータ基点
  pt2: { x: 900, y: 0 }, // パラメータ終点
  minVal: 600,
  maxVal: 1800,
  increment: 300,
}
```

---

### P18-3: ブロックアクション

**アクション種別**:

| アクション | 対応パラメータ | 動作 |
|-----------|-------------|------|
| 移動 | 点/線形/極/XY | 図形を移動 |
| 尺度変更 | 線形/XY | 図形を拡大縮小 |
| ストレッチ | 線形/極/XY | 指定部分のみ伸縮 |
| 反転 | 反転 | 図形を鏡像 |
| 配列複写 | 線形/XY | グリップに連動して複数化 |
| ルックアップ | ルックアップ | リストから属性選択 |

---

### P18-4: ダイナミックブロック実用例

**操作フロー（片開きドアの可変幅）**:
```
BE → 「片開きドア」ブロックを開く
→ 線形パラメータを追加（名前:幅, 始点:0,0, 終点:900,0）
→ ストレッチアクションを追加（パラメータ:幅 に関連付け）
→ 保存・終了
→ ブロック挿入後にグリップをドラッグ → 幅が600/900/1200/1800に変化
```

---

### P18-5: 可視性ステート

**機能**: 1つのブロック定義に複数の「見た目の状態」を持たせる

**例**（ドアの開閉状態）:
```javascript
blockDefs['door'].visibilityStates = [
  { name: '開', visibleShapeIds: ['door_frame', 'door_open_arc'] },
  { name: '閉', visibleShapeIds: ['door_frame', 'door_closed'] },
];
```

---

## P19: 注釈オブジェクト（異尺度対応）

**DoD**: 標準教科書第10章の異尺度対応が動く

### P19-1: 異尺度対応の概念

**問題**: レイアウトのビューポートで尺度を変えると、寸法文字や注記文字のサイズが変わってしまう

**解決**: オブジェクトに「注釈スケール」を設定 → どの尺度でも紙の上で一定サイズで表示

**対応オブジェクト**: text, mtext, dim, mleader

---

### P19-2: 異尺度対応スタイル設定

**文字スタイルに追加**:
```javascript
// renderer/ui/textstyle.js（新規作成）
export let textStyles = {
  'Standard': {
    name: 'Standard',
    fontFamily: 'monospace',
    height: 0,        // 0 = コマンド実行時に指定
    annotative: false, // ← これを true にすると異尺度対応
    widthFactor: 1.0,
    oblique: 0,
  }
};
```

**寸法スタイルに追加**:
```javascript
// dimstyle.js の既存DIMSTYLEオブジェクトに追加
annotative: true,  // 異尺度対応フラグ
```

---

### P19-3: 異尺度対応の表示

**tools.js buildShapeNode() に反映**:
```javascript
// ペーパー空間のビューポートで描画時
// shape.annotativeScales に現在のビューポートスケールが含まれるか確認
if (shape.annotative && !shape.annotativeScales?.includes(vpScale)) return null;

// 文字サイズはビューポートスケールに依存せず一定
const fontSize = shape.height * viewport.paperScale; // 紙上の固定サイズ
```

---

## P20: 印刷スタイル・ページ設定完成

**DoD**: 標準教科書第3章の印刷設定が完全動作する

### P20-1: 印刷スタイルテーブル（CTB/STB）

**CTB（Color-dependent Plot Style）**: 色ごとに線幅・線種を指定
**STB（Named Plot Style）**: スタイル名で指定

**CTBテーブル定義**:
```javascript
// renderer/io/plotstyle.js（新規作成）
export const defaultCTB = {
  name: 'monochrome.ctb',
  entries: [
    { color: 1,  linewidth: 0.50, screening: 100 }, // 赤→0.5mm
    { color: 2,  linewidth: 0.35, screening: 100 }, // 黄→0.35mm
    { color: 3,  linewidth: 0.25, screening: 100 }, // 緑→0.25mm
    { color: 5,  linewidth: 0.13, screening: 100 }, // 青→0.13mm
    { color: 7,  linewidth: 0.70, screening: 100 }, // 白→0.70mm
    // ... 255色分
  ]
};
```

**印刷プレビューへの反映**: 印刷実行時にCTBマッピングで色→線幅変換

---

### P20-2: ページ設定管理（PAGESETUP）

**コマンド**: `PAGESETUP` → 名前付きページ設定を作成・管理

**設定内容**:
- 用紙サイズ（A4/A3/A2/A1/A0）
- 印刷領域（図面全体/ウィンドウ/現在の表示）
- 印刷尺度（1:100、1:50、フィット等）
- 印刷スタイルテーブル（CTB/STB選択）
- 線の太さの印刷（ON/OFF）

---

### P20-3: バッチ印刷（PUBLISH）

**コマンド**: `PUBLISH` → 複数レイアウトを一括でPDF出力

**操作フロー**:
```
PUBLISH → 出力対象シートを選択（チェックボックス）
→ 出力形式を選択（PDF/DWF/プリンタ）
→ 出力先フォルダ指定
→ パブリッシュ実行 → 一括出力
```

---

## P21: 外部参照（Xref）完全対応

**DoD**: 標準教科書第4・8章のXref機能が完全に動く

### P21-1: Xref添付（XATTACH）

**コマンド**: `XA` → 他のDXF/DWGファイルを参照として添付

**shape型**:
```javascript
{ type: 'xref',
  x, y, rotation: 0, scale: 1,
  path: './walls.dxf',      // 相対パス推奨
  name: 'walls',             // Xref名
  overlay: false,            // false=添付, true=オーバーレイ
  layerId,
  // キャッシュ用（内部）
  _loadedShapes: [...],
  _loadedLayers: [...],
}
```

**Xref管理パレット** (index.html に追加):
```html
<div id="xref-panel" style="display:none;">
  <h4>外部参照管理</h4>
  <table id="xref-table">
    <!-- name | status | path | type -->
  </table>
  <div style="margin-top:8px; display:flex; gap:4px;">
    <button id="xref-attach">添付</button>
    <button id="xref-detach">デタッチ</button>
    <button id="xref-reload">再ロード</button>
    <button id="xref-bind">バインド</button>
  </div>
</div>
```

---

### P21-2: Xrefバインド（XBIND）

**機能**: Xrefを現在の図面に取り込んで独立したブロック定義に変換

**方法の違い**:
- `バインド`: Xref名が `walls$0$layer1` のようにプレフィックス付きで追加
- `挿入`: Xref名がそのまま追加（同名があれば上書き）

---

### P21-3: Xrefクリップ（XCLIP）

**コマンド**: `XC` → Xref表示領域を矩形/多角形でクリップ

**shape型に追加**:
```javascript
{ type: 'xref', ...,
  clip: {
    type: 'rect',       // 'rect' | 'polygon'
    pts: [{x,y}, ...]   // クリップ境界頂点
  }
}
```

---

### P21-4: デザインセンター（ADCENTER）

**コマンド**: `ADC` → 他ファイルからブロック/レイヤー/線種をドラッグ&ドロップで取り込む

**UIパネル**:
```
┌──────────────────────────────────┐
│ デザインセンター              × │
├────────────────┬─────────────────┤
│ フォルダ表示   │ コンテンツ表示  │
│ ├ /drawings/  │ 📦 wall_block   │
│ │  ├ floor.dxf│ 📦 door_block   │
│ │  └ site.dxf │ 📦 window_block │
│ └ /symbols/   │                 │
└────────────────┴─────────────────┘
```

**機能**: コンテンツをダブルクリックまたはドラッグ&ドロップで現在の図面に追加

---

### P21-5: ツールパレット（TOOLPALETTES）

**コマンド**: `TP` → フローティングパレット表示

**機能**:
- タブ形式でカテゴリ分け（建築/機械/設備/ハッチング等）
- パレット内のツールをクリック→即座に挿入モード
- 既存のシンボルライブラリ（P14-3）をパレット形式に昇格

---

## P22: 電子納品・シートセット

**DoD**: 応用教科書第1・3・4章の電子納品関連機能が動く

### P22-1: フィールド文字（FIELD）

**コマンド**: `FD` → フィールド挿入ダイアログ

**フィールド種別**:
| フィールド名 | 内容 |
|------------|------|
| `FILENAME` | ファイル名 |
| `DATE` | 保存日時 |
| `DWGNAME` | 図面名（プロパティ） |
| `AUTHOR` | 作成者 |
| `SHEETNUM` | シート番号（シートセット使用時） |
| `SHEETTITLE` | シートタイトル |
| カスタム | 図面プロパティのカスタム項目 |

**shape型**:
```javascript
{ type: 'text',
  fieldType: 'DATE',          // フィールド種別
  fieldFormat: 'YYYY/MM/DD',  // 書式
  // 表示テキストは評価時に動的生成
  _evaluated: '2026/02/15',
}
```

**表示**: 図面保存・印刷時に値を評価してテキスト更新

---

### P22-2: 電子納品テンプレート

**図枠ブロックに属性を付加した標準図枠**:

```javascript
// 図枠ブロック定義例
blockDefs['titleblock_A3'] = {
  name: 'titleblock_A3',
  shapes: [
    { type: 'rect', x: 0, y: 0, w: 420, h: 297 },  // A3枠
    { type: 'rect', x: 350, y: 0, w: 70, h: 297 },  // 表題欄エリア
  ],
  attributes: [
    { tag: 'PROJNAME', prompt: '工事名',    x: 355, y: 260, height: 3.5 },
    { tag: 'DRAWNAME', prompt: '図面名',    x: 355, y: 250, height: 3.5 },
    { tag: 'SCALE',    prompt: '縮尺',      x: 355, y: 240, height: 3.5 },
    { tag: 'DATE',     prompt: '作成日',    x: 355, y: 230, height: 3.5 },
    { tag: 'DRAWNUM',  prompt: '図面番号',  x: 355, y: 220, height: 3.5 },
  ]
};
```

---

### P22-3: シートセット管理（SHEETSET）

**コマンド**: `SSM` → シートセットマネージャーパレット

**機能**:
- シートセットの作成（複数DXFをまとめて管理）
- シートの追加・削除・並び替え
- シートのプロパティ編集（番号・タイトル）
- 図面一覧表（シートリスト）の自動生成
- 一括PDFパブリッシュ（P20-3の発展版）

**データ構造**:
```javascript
const sheetSet = {
  name: '○○建物設計図書',
  path: './sheetset.json',
  sheets: [
    { num: 'A-01', title: '案内図',   file: './01_guide.dxf',   layout: 'Layout1' },
    { num: 'A-02', title: '配置図',   file: './02_site.dxf',    layout: 'Layout1' },
    { num: 'A-03', title: '平面図',   file: './03_floor.dxf',   layout: 'Layout1' },
    { num: 'A-04', title: '立面図',   file: './04_elev.dxf',    layout: 'Layout1' },
    { num: 'A-05', title: '断面図',   file: './05_section.dxf', layout: 'Layout1' },
  ]
};
```

---

### P22-4: e-トランスミット（ETRANSMIT）

**コマンド**: `ETR` → 図面と依存ファイルをまとめてZIPパッケージ化

**収集対象**:
- 現在の図面（DXF）
- 添付されたXref（外部参照）
- 参照している画像ファイル
- PDFアンダーレイ
- カスタムフォント

---

## P23: パラメトリックデザイン

**DoD**: 応用教科書Part2 第4・5章のパラメトリック機能が動く

### P23-1: 幾何拘束（GEOMCONSTRAINT）

**コマンド一覧**:
| 拘束 | コマンド | 内容 |
|------|---------|------|
| 一致 | `GCCOINCIDENT` | 2点を同一位置に固定 |
| 平行 | `GCPARALLEL` | 2線を平行に保つ |
| 正接 | `GCTANGENT` | 線と円弧を接線関係に |
| 直交 | `GCPERPENDICULAR` | 2線を直交に保つ |
| 同心円 | `GCCONCENTRIC` | 2円の中心を一致させる |
| 水平 | `GCHORIZONTAL` | 線を水平に固定 |
| 垂直 | `GCVERTICAL` | 線を垂直に固定 |
| 対称 | `GCSYMMETRIC` | 対称軸に対して対称に |
| 固定 | `GCFIX` | 点/線を座標に固定 |
| 同じ値 | `GCEQUAL` | 2線分の長さを等しく |

**内部表現**:
```javascript
// app.js に追加
export let constraints = [];  // { id, type, targets: [...shapeIds], params: {} }

// 拘束を満たすように図形を解く（簡易ソルバー）
function solveConstraints() {
  for (const c of constraints) {
    applyConstraint(c);
  }
  redraw();
}
```

**拘束アイコン**: 各拘束オブジェクトの近くに小さなアイコンを表示（選択で削除可能）

---

### P23-2: 寸法拘束（DIMCONSTRAINT）

**コマンド一覧**:
| 拘束 | コマンド | 内容 |
|------|---------|------|
| 水平 | `DCHORIZONTAL` | 水平方向の距離を固定 |
| 垂直 | `DCVERTICAL` | 垂直方向の距離を固定 |
| 長さ | `DCALIGNED` | 線の長さを固定 |
| 平行 | `DCPARALLEL` | 平行な距離を固定 |
| 半径 | `DCRADIUS` | 円の半径を固定 |
| 直径 | `DCDIAMETER` | 円の直径を固定 |
| 角度 | `DCANGULAR` | 2線間の角度を固定 |

**操作フロー**:
```
DCALIGNED → オブジェクトを選択（or 2点を指定）
→ 寸法値を入力（例: 5700）
→ 図形が自動的にその長さに変化
→ 以後その図形を移動しても長さは保持される
```

**注意**: 寸法拘束は通常の寸法記入とは別物（拘束は編集を制限し、通常寸法は注記のみ）

---

### P23-3: パラメータ管理（PARAMETERS）

**コマンド**: `PARAMS` → パラメータ管理ダイアログ

**機能**:
- 拘束に使う変数を定義（例: `width = 5700`, `height = 3600`）
- 数式が使える（例: `area = width * height`）
- 変数を変更すると関連する全図形が連動して更新

**UI**:
```
┌──────────────────────────────┐
│ パラメータ管理                │
├───────────┬─────────┬────────┤
│ 名前      │ 式      │ 値     │
├───────────┼─────────┼────────┤
│ width     │ 5700    │ 5700   │
│ height    │ 3600    │ 3600   │
│ area      │ width*h │ 20520  │
└───────────┴─────────┴────────┘
```

---

### P23-4: 拘束ダイナミックブロック

**P18のダイナミックブロックとP23のパラメトリック設計の統合**:

- ブロックエディタ内で幾何拘束・寸法拘束を設定
- 寸法拘束のパラメータをブロックのカスタムプロパティとして公開
- ブロック挿入時にプロパティパネルから寸法値を変更可能

**ブロックテーブル**: 許容する値の組み合わせをテーブルで定義
```
┌──────────┬────────┬────────┐
│ サイズ   │ 幅     │ 高さ   │
├──────────┼────────┼────────┤
│ S        │ 600    │ 1800   │
│ M        │ 900    │ 2000   │
│ L        │ 1200   │ 2100   │
└──────────┴────────┴────────┘
```

---

## P24: データリンク・フィールド連携

**DoD**: 応用教科書Part2 第1・2・3章のデータ連携機能が動く

### P24-1: Excelデータリンク（DATALINK）

**コマンド**: `DL` → ExcelファイルのセルをCAD内の表にリンク

**操作フロー**:
```
DL → Excelファイルを選択
→ リンクするシート・セル範囲を指定（例: Sheet1!A1:D10）
→ リンク名を付けて保存
→ DATALINKUPDATE で最新データに更新
```

**shape型**:
```javascript
{ type: 'table', ...,
  dataLink: {
    file: './estimate.xlsx',
    sheet: 'Sheet1',
    range: 'A1:D10',
    lastSync: '2026-02-15T10:00:00',
  }
}
```

---

### P24-2: ブロック属性データ書き出し（EATTEXT）

**コマンド**: `EAT` → 図面内のブロック属性を表またはExcelに書き出し

**書き出し設定**:
- 対象ブロック名（全部 or 指定）
- 書き出す属性タグを選択
- 出力先: 図面内テーブル / CSV / Excel

**用途例**: 建具表・部屋名表・設備機器一覧の自動生成

---

### P24-3: フィールドとオブジェクトのリンク

**機能**: 選択したオブジェクトのプロパティ値をフィールド文字として表示

**例**:
- 矩形を選択 → `面積: {AREA}` のフィールドを自動生成
- 円を選択 → `半径: {RADIUS}` のフィールドを生成
- オブジェクトを変更すると、フィールド文字も自動更新

---

## P25: 3Dモデリング基礎

**DoD**: 応用教科書第5章の基本3D機能が動く

### P25-1: ダイナミックUCS（DUCS）

**機能**: 斜面や曲面にカーソルを近づけると、その面のUCS（座標系）に自動切り替え

**実装**: 3Dモードのみ有効。2D図面では不要。

---

### P25-2: 基本ソリッド形状

**コマンド一覧**:
| 形状 | コマンド | 主要パラメータ |
|------|---------|-------------|
| 直方体 | `BOX` | 長さ/幅/高さ |
| 円柱 | `CYLINDER` | 半径/高さ |
| 球 | `SPHERE` | 半径 |
| 円錐 | `CONE` | 底半径/高さ |
| 角錐 | `PYRAMID` | 辺数/底半径/高さ |
| くさび | `WEDGE` | 長さ/幅/高さ |
| トーラス | `TORUS` | 主半径/管半径 |

**shape型**:
```javascript
{ type: 'solid3d',
  primitive: 'box',  // 'box'|'cylinder'|'sphere'|'cone'|'pyramid'|'wedge'|'torus'
  x, y, z: 0,
  // 形状別パラメータ
  length, width, height,   // BOX
  radius, height,          // CYLINDER
  radius,                  // SPHERE
  color, layerId,
}
```

**描画**: Konvaでは3D描画ができないため、等角投影（Isometric）またはperspectiveで疑似3D表示

---

### P25-3: ブール演算

**コマンド**:
- `UNION` — 和（2つのソリッドを合体）
- `SUBTRACT` — 差（一方からもう一方を切り抜く）
- `INTERSECT` — 交差（共通部分のみ残す）

**操作フロー**:
```
SUBTRACT → 残すソリッドを選択 → Enter
→ 切り抜くソリッドを選択 → Enter → 差分ソリッドが生成
```

---

### P25-4: 押し出し・回転（EXTRUDE / REVOLVE）

**EXTRUDE（押し出し）**:
```
EXT → 閉じた2Dポリライン/リージョンを選択
→ 押し出し高さを入力（または方向指定）→ ソリッド生成
オプション: テーパー角度（側面に勾配を付ける）
```

**REVOLVE（回転）**:
```
REV → 閉じた2D断面を選択
→ 回転軸の始点・終点を指定
→ 回転角度を入力（360°=完全な回転体）→ ソリッド生成
```

---

### P25-5: 3D修正

**コマンド**:
| コマンド | 機能 |
|---------|------|
| `3DMIRROR` | 3次元平面に対して鏡像 |
| `3DARRAY` | 3D方向の配列複写 |
| `3DALIGN` | 2ソリッドを位置合わせ・整列 |

---

## 実装優先順位まとめ

```
★★★ 最優先（日常作業を直接改善）
  P16: 極トラッキング / オブジェクトトラッキング / 線種尺度
  P17: 照会コマンド（距離・面積）/ PURGE
  P20: CTB印刷スタイル / ページ設定管理 / バッチ印刷

★★  次優先（チーム・納品業務に効く）
  P21: Xref完全対応 / デザインセンター
  P22: フィールド文字 / 電子納品テンプレート / シートセット

★   中長期（高度機能）
  P18: ダイナミックブロック
  P19: 異尺度対応
  P23: パラメトリックデザイン
  P24: データリンク
  P25: 3Dモデリング
```

---

## 参照資料

- `autocad標準教科書.pdf` — 第3章（図面設定）・第4章（図面管理）・第6章（修正/配列）・第8章（外部ファイル）・第9章（ダイナミックブロック）・第10章（レイアウト/異尺度対応）
- `autocad応用教科書.pdf` — 第1章（電子納品テンプレート）・第2章（CAD標準）・第3章（シートセット）・第4章（ファイル管理）・第5章（3D）・設計編第1〜5章（Excel/フィールド/パラメトリック）
- `docs/p11-p15-handover.md` — P11〜P15の詳細実装仕様
- `docs/autocad-gap-analysis.md` — 不足機能サマリ
