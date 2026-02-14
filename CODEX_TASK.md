# Codex タスク指示書 - AutoCAD相当の作図機能を実装せよ

## 前提

リポジトリ: https://github.com/ICHI130/aicad
まず `git pull origin main` を実行してから作業すること。

このアプリは **Electron + Konva.js** で動く2D CADアプリ。
座標系は **mm単位**（1px = 1mm が scale=1 の等倍）。
Y軸はスクリーン座標（下向き正）。DXFのY上向き正とは逆だが、現在の実装ではそのまま扱っている。

重要ファイル:
- `renderer/app.js` … メインロジック・イベント・状態管理
- `renderer/cad/tools.js` … Konvaノード生成（shape→描画）
- `renderer/cad/canvas.js` … グリッド・座標変換
- `renderer/ui/toolbar.js` … ツールバーUI

shapes配列の現在の型:
```js
{ id, type:'line',   x1, y1, x2, y2 }
{ id, type:'arc',    cx, cy, r, startAngle, endAngle }
{ id, type:'rect',   x, y, w, h }
{ id, type:'text',   x, y, text, height, rotation, align }
{ id, type:'point',  x, y }
```

---

## 実装タスク一覧（AutoCAD相当）

以下をすべて実装せよ。優先度順に並んでいる。

---

### Task 1: 円描画ツール (CIRCLE)

**操作**: ツールバー「Circle」ボタン → 1クリック目:中心点 → 2クリック目:円周上の点（半径確定）
**プレビュー**: 1クリック後、マウス移動で円がプレビュー表示

追加する shape 型:
```js
{ id, type:'circle', cx, cy, r }
```

変更ファイル:
1. `tools.js` … `Tool.CIRCLE = 'circle'` を追加、`buildShapeNode` に circle 処理を追加
   ```js
   if (shape.type === 'circle') {
     const c = mmToScreen({ x: shape.cx, y: shape.cy }, viewport);
     return new Konva.Circle({
       x: c.x, y: c.y,
       radius: shape.r * viewport.scale,
       stroke: color, strokeWidth: sw, fill: 'transparent',
       id: shape.id, listening: !isPreview,
     });
   }
   ```
2. `app.js` … Tool.CIRCLE の状態遷移（drawingStart → プレビュー → 確定）
3. `toolbar.js` … Circle ボタン追加
4. `app.js` の `fitView`, `pickShape`, `applyMove`, `getDrawingContext` に circle 対応を追加

---

### Task 2: 端点スナップ・中点スナップ・交点スナップ

**新規ファイル**: `renderer/cad/snap.js` を作成

```js
// snap.js
export function findSnapPoint(mmPoint, shapes, viewport) {
  const threshold = 8 / viewport.scale; // 画面上8px以内でスナップ

  // 優先1: 端点
  for (const s of shapes) {
    for (const ep of getEndpoints(s)) {
      if (dist(mmPoint, ep) < threshold)
        return { x: ep.x, y: ep.y, type: 'endpoint' };
    }
  }

  // 優先2: 中点
  for (const s of shapes) {
    if (s.type === 'line') {
      const mid = { x: (s.x1+s.x2)/2, y: (s.y1+s.y2)/2 };
      if (dist(mmPoint, mid) < threshold)
        return { x: mid.x, y: mid.y, type: 'midpoint' };
    }
  }

  // 優先3: 円の四分点 (0,90,180,270度)
  for (const s of shapes) {
    if (s.type === 'circle' || s.type === 'arc') {
      const cx = s.cx ?? s.cx, cy = s.cy ?? s.cy, r = s.r;
      const qpts = [
        { x: cx+r, y: cy }, { x: cx-r, y: cy },
        { x: cx, y: cy+r }, { x: cx, y: cy-r },
      ];
      for (const q of qpts) {
        if (dist(mmPoint, q) < threshold)
          return { x: q.x, y: q.y, type: 'quadrant' };
      }
    }
  }

  // フォールバック: 1mmグリッドスナップ
  return { x: Math.round(mmPoint.x), y: Math.round(mmPoint.y), type: 'grid' };
}

function getEndpoints(s) {
  if (s.type === 'line') return [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }];
  if (s.type === 'rect') return [
    { x: s.x, y: s.y }, { x: s.x+s.w, y: s.y },
    { x: s.x+s.w, y: s.y+s.h }, { x: s.x, y: s.y+s.h },
  ];
  return [];
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
```

`app.js` の変更:
- `snapToGrid(pointerToMm())` を `findSnapPoint(pointerToMm(), shapes, viewport)` に置き換え
- mousemove 時にスナップマーカーを表示（`snapLayer` を追加）
  - endpoint: 緑の小さな四角 (□)
  - midpoint: 黄色の三角 (△)
  - grid: マーカーなし

---

### Task 3: ポリライン描画 (POLYLINE)

**操作**: ツールバー「Polyline」→ クリックごとに頂点追加 → Enter/右クリックで確定 → C キーで閉じて確定

確定後は個々の LINE として shapes に追加（ポリラインを線分に分解）。
作図中はプレビューで全頂点をつなぐ黄色い線を表示。

---

### Task 4: コピー・貼り付け (COPY/PASTE)

- `Ctrl+C`: 選択中の shape を `clipboard` 変数に JSON でコピー
- `Ctrl+V`: `clipboard` の shape を offset (+10mm, +10mm) してペースト、新しい id を発行
- `saveHistory()` を必ず呼ぶ

---

### Task 5: 移動コマンド (MOVE)

- 選択後 `M` キーで MOVE モードに入る
- 1クリック目: 基点を指定
- 2クリック目: 目標点を指定 → その差分だけ選択図形を移動
- （現在のドラッグ移動とは別に、精確な2点指定移動として実装）

---

### Task 6: 回転 (ROTATE)

- 選択後 `R` キーで ROTATE モードに入る
- 1クリック目: 基点を指定
- キーボードから角度入力（ステータスバーに入力欄を出す）またはマウスで角度指定
- 確定で選択図形を基点中心に回転

回転変換:
```js
function rotatePoint(px, py, cx, cy, angleDeg) {
  const rad = angleDeg * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return {
    x: cx + (px - cx) * cos - (py - cy) * sin,
    y: cy + (px - cx) * sin + (py - cy) * cos,
  };
}
```

---

### Task 7: 鏡像 (MIRROR)

- 選択後 `MI` キー（M→I の2キーシーケンス）で MIRROR モードに入る
- 1クリック目: 鏡像軸の点1
- 2クリック目: 鏡像軸の点2
- 確定で選択図形を軸対称にコピー

---

### Task 8: トリム (TRIM)

- `TR` キーで TRIM モードに入る
- クリックした線の一部（他の線との交点より外側）を削除
- 交点計算は線分同士の交点を求めて、クリック位置に近い側を削除

---

### Task 9: 延長 (EXTEND)

- `EX` キーで EXTEND モードに入る
- クリックした線を他の線まで延長

---

### Task 10: 配列複写 (ARRAY)

矩形配列のみ実装すればOK。

- `AR` キーで起動
- ステータスバーに「行数,列数,行間隔,列間隔」を入力
- 選択図形を配列複写

---

### Task 11: 寸法線 (DIMENSION)

**水平・垂直・整合寸法**の3種。

shape型:
```js
{ id, type:'dim', x1, y1, x2, y2, offset, dir }
// dir: 'h'=水平, 'v'=垂直, 'a'=整合(aligned)
// offset: 寸法線を図形から何mmずらすか
```

`tools.js` での描画:
- 引出線（Extension line）×2本
- 寸法線（Dimension line）1本（矢印付き）
- 寸法値テキスト（距離をmm単位で自動計算、小数点以下は四捨五入）

矢印は `Konva.Arrow` または `Konva.Line` で描く。

---

### Task 12: ハッチング (HATCH)

- `H` キーで起動
- 閉じた多角形の内部を斜線パターンで塗りつぶし
- パターン間隔は 5mm のクロスハッチ（建築図面標準）

shape型:
```js
{ id, type:'hatch', points: [{x,y}, ...], pattern: 'cross' | 'line', spacing: 5, angle: 45 }
```

---

### Task 13: テキスト入力ツール (TEXT)

- `T` キーでテキストモード
- クリックした位置に HTML の `<input>` を表示
- Enter で確定、ESC でキャンセル
- 文字高さはステータスバーで設定

shape型:
```js
{ id, type:'text', x, y, text, height, rotation:0, align:0 }
```

---

### Task 14: DXF書き出し (EXPORT)

`renderer/io/dxf.js` に `exportDxf(shapes)` を追加:

```js
export function exportDxf(shapes) {
  const lines = [
    '0', 'SECTION', '2', 'ENTITIES',
  ];
  for (const s of shapes) {
    if (s.type === 'line') {
      lines.push('0','LINE','8','0',
        '10',s.x1,'20',s.y1,'30','0',
        '11',s.x2,'21',s.y2,'31','0');
    } else if (s.type === 'circle') {
      lines.push('0','CIRCLE','8','0',
        '10',s.cx,'20',s.cy,'30','0','40',s.r);
    } else if (s.type === 'arc') {
      lines.push('0','ARC','8','0',
        '10',s.cx,'20',s.cy,'30','0','40',s.r,
        '50',s.startAngle,'51',s.endAngle);
    } else if (s.type === 'text') {
      lines.push('0','TEXT','8','0',
        '10',s.x,'20',s.y,'30','0','40',s.height,'1',s.text);
    }
  }
  lines.push('0','ENDSEC','0','EOF');
  return lines.join('\n');
}
```

`main.js` に保存ハンドラ追加:
```js
ipcMain.handle('cad:save-dxf', async (_e, content) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    filters: [{ name: 'DXF', extensions: ['dxf'] }],
  });
  if (canceled || !filePath) return { canceled: true };
  await fs.writeFile(filePath, content, 'utf8');
  return { canceled: false, filePath };
});
```

`preload.js` に `saveDxf` を追加。
ツールバーに「Export DXF」ボタンを追加。

---

### Task 15: レイヤー管理

- 右サイドバーにレイヤーパネルを追加
- レイヤー追加・削除・表示/非表示・色変更
- 各 shape に `layer` プロパティを持たせる
- アクティブレイヤーに新規図形が作成される
- 非表示レイヤーの図形は描画しない

---

## 実装ルール

1. **既存コードを壊さない**。tools.js の `buildShapeNode` は switch ではなく if チェーンなので、末尾に追記していけばOK。
2. **saveHistory() を必ず呼ぶ**。図形の追加・削除・変更後は app.js の `saveHistory()` を呼ぶこと。
3. **viewport を常に参照**。座標変換は `mmToScreen()` / `screenToMm()` を使う。直接計算しない。
4. **シンプルに書く**。フレームワーク・ライブラリを追加しない。Vanilla JS のみ。
5. **1タスクずつ commit する**。`git commit -m "feat: circle tool"` のように機能ごとにコミット。
6. **最後に push する**: `git push origin main`

## 完了の定義

- [ ] 円が描ける
- [ ] 端点・中点にスナップできる（緑□・黄△マーカー表示）
- [ ] ポリラインが描ける
- [ ] Ctrl+C/V でコピペできる
- [ ] M キーで精確移動できる
- [ ] R キーで回転できる
- [ ] 寸法線が描ける
- [ ] DXF書き出しができる

最低でも上記8項目を実装すること。
