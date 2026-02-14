# AI CAD - Codex 実装指示書 v2
# 「日本一のAutoCAD動画（建築CAD検定3級）を参考にした全機能実装」

> まず `git pull origin main` を実行してから作業すること。
> 1機能ずつ `git commit` すること。最後に `git push origin main` すること。

---

## ■ 現状の問題点（必ず直すこと）

1. **数値入力がほぼない** → 線の長さ・座標を数字で指定できない（CADとして致命的）
2. **UIがボタンだけ** → 何のツールが選ばれているか、次に何をすべきかわからない
3. **コマンドラインがない** → AutoCADの最大の特徴。キー入力でコマンド実行できない
4. **undo/redoボタンがない** → Ctrl+Zだけでは気づかない人が多い
5. **ツールバーが文字だけ** → アイコン必要（絵文字でも可）
6. **ステータスバーが貧弱** → 現在のツール・次の操作ガイドが表示されない

---

## ■ 最優先：UIの全面刷新

### UI-1: レイアウト変更（AutoCAD準拠）

`renderer/index.html` を以下の構成に変更：

```
┌─────────────────────────────────────────────────────┐
│ メニューバー [File] [Edit] [View] [Draw] [Modify]    │  44px
├──────────────┬───────────────────────────┬──────────┤
│              │                           │          │
│  左ツール    │     CADキャンバス          │ AIチャット│
│  パネル      │                           │  パネル  │
│  (120px)     │                           │  (300px) │
│              │                           │          │
├──────────────┴───────────────────────────┴──────────┤
│ コマンド履歴（3行）                                  │  60px
│ > コマンド入力: [___________________________]        │
├──────────────────────────────────────────────────────┤
│ X: 1000  Y: 2000  ツール:線  F8:オルソOFF  F9:スナップ│  28px
└──────────────────────────────────────────────────────┘
```

CSS グリッド: `grid-template-columns: 120px 1fr 300px`

### UI-2: 左ツールパネル（縦並び）

`renderer/ui/toolbar.js` を縦並びの左パネルに変更。
各ボタンに絵文字アイコン＋コマンド名＋ショートカット表示：

```html
<!-- 作図グループ -->
<div class="tool-group-label">作図</div>
<button data-tool="select">▶ 選択  [S]</button>
<button data-tool="line">／ 線  [L]</button>
<button data-tool="rect">□ 矩形  [REC]</button>
<button data-tool="circle">○ 円  [C]</button>
<button data-tool="arc">⌒ 円弧  [A]</button>
<button data-tool="polyline">〜 ポリ  [PL]</button>
<button data-tool="offset">∥ オフセット [O]</button>
<button data-tool="text">Ａ 文字  [T]</button>

<!-- 修正グループ -->
<div class="tool-group-label">修正</div>
<button data-tool="move">↔ 移動  [M]</button>
<button data-tool="copy">⊕ コピー [CO]</button>
<button data-tool="rotate">↻ 回転  [RO]</button>
<button data-tool="mirror">⇌ 鏡像  [MI]</button>
<button data-tool="trim">✂ トリム [TR]</button>
<button data-tool="extend">→| 延長  [EX]</button>
<button data-tool="fillet">⌐ フィレット [F]</button>
<button data-tool="scale">⤡ 尺度  [SC]</button>

<!-- 注釈グループ -->
<div class="tool-group-label">注釈</div>
<button data-tool="dim">←→ 寸法  [DIM]</button>
<button data-tool="hatch">▦ ハッチ [H]</button>

<!-- 表示グループ -->
<div class="tool-group-label">表示</div>
<button onclick="fitView()">⊡ 全体表示 [F]</button>
<button onclick="undo()">↩ 元に戻す [Ctrl+Z]</button>
<button onclick="redo()">↪ やり直す [Ctrl+Y]</button>
```

### UI-3: コマンドラインバー（最重要）

`renderer/ui/commandline.js` を新規作成。

```javascript
// commandline.js
export function initCommandLine({ onCommand, onInput }) {
  // 3行の履歴表示エリア
  // テキスト入力フィールド
  // コマンド対応表
  const commandMap = {
    'l': 'line', 'line': 'line',
    'rec': 'rect', 'rectangle': 'rect',
    'c': 'circle', 'circle': 'circle',
    'a': 'arc', 'arc': 'arc',
    'pl': 'polyline', 'pline': 'polyline',
    'o': 'offset', 'offset': 'offset',
    't': 'text',
    'm': 'move', 'move': 'move',
    'co': 'copy', 'cp': 'copy',
    'ro': 'rotate', 'rotate': 'rotate',
    'mi': 'mirror', 'mirror': 'mirror',
    'tr': 'trim', 'trim': 'trim',
    'ex': 'extend', 'extend': 'extend',
    'f': 'fillet', 'fillet': 'fillet',
    'sc': 'scale',
    'e': 'erase',
    'u': 'undo',
    'redo': 'redo',
    'z': 'zoom', 'za': 'zoomAll',
    'dim': 'dim', 'dli': 'dim',
    's': 'select',
  };
}
```

入力中は常にコマンドライン入力欄にフォーカス可能（ただし作図中の数値入力はキャンバス優先）。

### UI-4: 操作ガイド

ステータスバー右側に現在の操作ガイドを表示：

```javascript
const guides = {
  'select':   '図形をクリックして選択',
  'line':     { 0: '始点をクリック', 1: '終点クリック または 長さを入力[Enter]' },
  'rect':     { 0: '第1コーナーをクリック', 1: '@幅,高さ で入力 または 対角コーナーをクリック' },
  'circle':   { 0: '中心点をクリック', 1: '半径を入力[Enter] またはクリック' },
  'move':     { 0: '基点をクリック', 1: '目標点クリック または @dx,dy を入力' },
  'offset':   { 0: 'オフセット距離を入力[Enter]', 1: '元の線をクリック', 2: 'オフセット方向をクリック' },
};
```

---

## ■ 最重要機能：数値入力システム

### NUM-1: コマンドラインからの座標入力

作図ツール使用中、コマンドラインに以下の形式で入力可能：
- `100,200` → 絶対座標 X=100, Y=200
- `@100,50` → 現在点から相対 X+100, Y+50
- `@100<45` → 現在点から距離100mm、角度45度方向
- `100` → 現在の方向に100mm（直前の線方向）

`app.js` の `handleCoordInput(str, currentPoint)` 関数で処理：
```javascript
function handleCoordInput(str, currentPoint) {
  str = str.trim();
  // @x,y 相対座標
  const relMatch = str.match(/^@([-\d.]+),([-\d.]+)$/);
  if (relMatch) return { x: currentPoint.x + parseFloat(relMatch[1]), y: currentPoint.y + parseFloat(relMatch[2]) };
  // @dist<angle 極座標
  const polarMatch = str.match(/^@([\d.]+)<([-\d.]+)$/);
  if (polarMatch) {
    const dist = parseFloat(polarMatch[1]);
    const angle = parseFloat(polarMatch[2]) * Math.PI / 180;
    return { x: currentPoint.x + dist * Math.cos(angle), y: currentPoint.y - dist * Math.sin(angle) };
  }
  // x,y 絶対座標
  const absMatch = str.match(/^([-\d.]+),([-\d.]+)$/);
  if (absMatch) return { x: parseFloat(absMatch[1]), y: parseFloat(absMatch[2]) };
  // 数値のみ（長さ）
  const num = parseFloat(str);
  if (!isNaN(num) && currentPoint.prev) {
    const angle = Math.atan2(currentPoint.y - currentPoint.prev.y, currentPoint.x - currentPoint.prev.x);
    return { x: currentPoint.x + num * Math.cos(angle), y: currentPoint.y + num * Math.sin(angle) };
  }
  return null;
}
```

### NUM-2: 動的入力（Dynamic Input）

`renderer/ui/dynInput.js` を新規作成。

作図中、カーソル近くにフロートDIVを表示：
```
  ●─── 入力中
     ↘
   [長さ: ____] mm
   [角度: 45.0°]
```

- マウス移動に追従（`position: fixed`）
- 数字キーで直接入力
- Tab で長さ↔角度を切り替え
- Enter で確定（handleCoordInputに渡す）
- 通常時は現在の長さ・角度をリアルタイム表示

### NUM-3: 図形プロパティパネル

図形選択時、AIサイドバー上部に表示：

```html
<div id="prop-panel">
  <div class="prop-title">【線分】</div>
  始点X: <input id="prop-x1" type="number"> mm<br>
  始点Y: <input id="prop-y1" type="number"> mm<br>
  終点X: <input id="prop-x2" type="number"> mm<br>
  終点Y: <input id="prop-y2" type="number"> mm<br>
  長さ: <span id="prop-len"></span> mm<br>
  角度: <span id="prop-ang"></span>°<br>
  <button id="prop-apply">適用</button>
</div>
```

---

## ■ 描画コマンド

### DRAW-1: 線（LINE） ← 改良

- 数値入力対応（上記NUM-1）
- `C` + Enter で最初の点に戻って閉じる
- オルソON時は水平/垂直のみ

### DRAW-2: 矩形（RECTANGLE） ← 改良

- 第1コーナー後に `@5700,3600` で確定

### DRAW-3: 円（CIRCLE） ← 改良

- 中心後に半径数値入力

### DRAW-4: 円弧（ARC） ← 新規

shape型: `{ id, type:'arc', cx, cy, r, startAngle, endAngle }`
3点指定方式（始点→中間点→終点）

### DRAW-5: オフセット（OFFSET） ← 新規・重要

建築図面で壁の厚みを書くのに必須。

```javascript
// オフセット処理
function offsetShape(shape, dist) {
  if (shape.type === 'line') {
    // 法線方向に dist だけ平行移動した新しい線を返す
    const dx = shape.x2 - shape.x1, dy = shape.y2 - shape.y1;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len * dist, ny = dx / len * dist;
    return { type:'line', x1:shape.x1+nx, y1:shape.y1+ny, x2:shape.x2+nx, y2:shape.y2+ny };
  }
  if (shape.type === 'circle') {
    return { ...shape, r: shape.r + dist };
  }
  if (shape.type === 'arc') {
    return { ...shape, r: shape.r + dist };
  }
}
```

操作:
1. OFFSETツール選択
2. ステータスバーに距離を入力してEnter
3. オフセットしたい線をクリック
4. オフセット方向（内側か外側か）をクリック
5. 別の線をクリック → 繰り返し。ESCで終了。

### DRAW-6: テキスト（TEXT） ← 新規

操作: T キー → キャンバスクリック → フロートinputが出現 → Enter で確定
文字高さはステータスバーの「文字高 [___] mm」で設定

---

## ■ 修正コマンド（必ず実装）

### MOD-1: コピー（COPY）

操作:
1. 図形を選択してCOキー（またはCO + Enterコマンド）
2. 基点クリック
3. 目標点クリック → コピー。別の目標点クリック → さらにコピー
4. ESCで終了

### MOD-2: 鏡像（MIRROR）

操作:
1. 図形選択 → MIコマンド
2. 鏡像軸の点1クリック
3. 鏡像軸の点2クリック
4. 「元の図形を残しますか？」→ Y/Nキー or ステータスバーのボタン

```javascript
function mirrorShape(shape, p1, p2) {
  // p1-p2 を鏡像軸として shape を反転
  function mirrorPoint(px, py) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const t = ((px - p1.x) * dx + (py - p1.y) * dy) / (dx*dx + dy*dy);
    const fx = p1.x + t * dx, fy = p1.y + t * dy;
    return { x: 2*fx - px, y: 2*fy - py };
  }
  const s = shapeClone(shape);
  if (s.type === 'line') {
    const p1m = mirrorPoint(s.x1, s.y1);
    const p2m = mirrorPoint(s.x2, s.y2);
    s.x1=p1m.x; s.y1=p1m.y; s.x2=p2m.x; s.y2=p2m.y;
  } else if (s.type === 'circle' || s.type === 'arc') {
    const cm = mirrorPoint(s.cx, s.cy);
    s.cx=cm.x; s.cy=cm.y;
  } else if (s.type === 'rect') {
    // 4隅を変換してbboxを再計算
  }
  return s;
}
```

### MOD-3: トリム（TRIM）

操作:
1. TRコマンド
2. 切断境界の線をクリック（複数可）→ Enter
3. 切断したい線の「削除したい部分」をクリック
4. ESCで終了

実装: クリック点が切断線との交点のどちら側にあるかを判定し、その部分の線分を削除。

```javascript
function lineIntersection(l1, l2) {
  // 2本の線分の交点を返す（なければnull）
  const d1x=l1.x2-l1.x1, d1y=l1.y2-l1.y1;
  const d2x=l2.x2-l2.x1, d2y=l2.y2-l2.y1;
  const cross = d1x*d2y - d1y*d2x;
  if (Math.abs(cross) < 1e-10) return null;
  const t = ((l2.x1-l1.x1)*d2y - (l2.y1-l1.y1)*d2x) / cross;
  const u = ((l2.x1-l1.x1)*d1y - (l2.y1-l1.y1)*d1x) / cross;
  if (t<0||t>1||u<0||u>1) return null;
  return { x: l1.x1+t*d1x, y: l1.y1+t*d1y };
}
```

### MOD-4: 延長（EXTEND）

TRIMの逆。境界まで線を伸ばす。

### MOD-5: フィレット（FILLET）

操作: F キー → 半径入力（0でもOK）→ 線1クリック → 線2クリック → 交点処理

半径0の場合: 2本の線を交点まで延長/トリムして直角コーナーを作る（壁の角処理で多用）

### MOD-6: 尺度変更（SCALE）

基点指定 → 倍率入力。`2` → 2倍、`0.5` → 半分。

---

## ■ 表示・設定

### VIEW-1: オルソモード（F8）← 最重要

ONにすると線・移動が水平/垂直のみ。

```javascript
let orthoMode = false;
// mousemove で snap した後に適用
function applyOrtho(start, end) {
  if (!orthoMode || !start) return end;
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  if (dx > dy) return { x: end.x, y: start.y }; // 水平
  return { x: start.x, y: end.y };               // 垂直
}
```

ステータスバーに「F8: オルソ [ON]」 を表示（クリックでも切替）。

### VIEW-2: グリッド切替（F7）

G キーまたはF7でグリッド表示ON/OFF。

### VIEW-3: スナップ切替（F9）

F9でスナップON/OFF。OFFのとき連続した座標（フリーカーソル）。

---

## ■ AI連携機能

### AI-1: AIによる自動作図

AIチャットで「5700×3600の部屋を描いて」と言うと、AIが以下のJSONを含む返答をする。
アプリはJSONを検出して自動で図形を追加する。

AIへのシステムプロンプトに以下を追加：

```
図形を描く場合は、回答の中に以下のJSON形式を含めてください：
\`\`\`json
{
  "action": "draw",
  "shapes": [
    {"type": "rect", "x": 0, "y": 0, "w": 5700, "h": 3600},
    {"type": "line", "x1": 0, "y1": 0, "x2": 5700, "y2": 0}
  ]
}
\`\`\`
```

`renderer/ai/executor.js` を新規作成：
```javascript
export function executeAiDraw(jsonStr, shapes, saveHistory, redraw) {
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed.action !== 'draw') return;
    for (const s of parsed.shapes) {
      shapes.push({ id: `shape_${crypto.randomUUID()}`, ...s });
    }
    saveHistory();
    redraw();
  } catch(e) { console.error('AI draw parse error', e); }
}
```

`sidebar.js` のAI応答処理で、返答に ` ```json ` が含まれていたら `executeAiDraw` を呼ぶ。

### AI-2: 選択図形の説明

図形選択中に「AIに質問」ボタン → 選択図形の情報を自動でプロンプトに含める。

### AI-3: 図面チェック

「チェック」ボタン → 全shapeをAIに送り「何かおかしい点はあるか」を質問。

---

## ■ ファイル保存（Ctrl+S）

`main.js` に追加：
```javascript
ipcMain.handle('cad:save', async (_e, { filePath, shapes }) => {
  const data = JSON.stringify({ version: 1, shapes }, null, 2);
  await fs.writeFile(filePath, data, 'utf8');
});
ipcMain.handle('cad:save-as', async (_e, shapes) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    filters: [{ name: 'AI CAD', extensions: ['aicad'] }, { name: 'JSON', extensions: ['json'] }],
  });
  if (canceled) return { canceled: true };
  await fs.writeFile(filePath, JSON.stringify({ version: 1, shapes }, null, 2), 'utf8');
  return { canceled: false, filePath };
});
ipcMain.handle('cad:load-aicad', async (_e, filePath) => {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
});
```

---

## ■ 実装順序（Step順に必ず従うこと）

```
Step 1: UI刷新（index.html + toolbar.js + commandline.js + statusbar.js）
Step 2: コマンドライン入力でツール切替
Step 3: 数値入力（handleCoordInput）+ オルソモード（F8）
Step 4: 動的入力（dynInput.js）
Step 5: オフセット（OFFSET）
Step 6: フィレット・トリム・鏡像・コピー
Step 7: テキスト入力ツール
Step 8: 図形プロパティパネル
Step 9: Ctrl+S 保存
Step 10: AI自動作図（executor.js）
```

---

## ■ 変えてはいけないもの

- `renderer/cad/canvas.js` の座標変換ロジック
- `renderer/io/dxf.js` のパーサー
- `renderer/io/jww.js` のパーサー
- viewport の { x, y, scale } 構造
- IPC は preload.js 経由のみ

---

## ■ 完了の定義

- [ ] 左縦ツールパネル（アイコン＋ショートカット表示）
- [ ] コマンドライン（L→線、C→円、REC→矩形、等）
- [ ] 線の長さを数値入力できる（例: 100 Enter）
- [ ] @5700,3600 で矩形の対角入力できる
- [ ] F8でオルソモード切替（水平/垂直固定）
- [ ] オフセットで平行線を引ける
- [ ] フィレット（半径0）で壁の角処理できる
- [ ] トリムで線の一部を切断できる
- [ ] 鏡像コマンドが動く
- [ ] 図形選択時にプロパティパネルで数値編集できる
- [ ] Ctrl+S でファイル保存できる
- [ ] AIに「○○を描いて」と言うと自動で図形が追加される

完了後 `git push origin main` すること。
