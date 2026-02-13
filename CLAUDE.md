# AI CAD - 設計書 / Agent引き継ぎ情報

## プロジェクト概要

**AI CAD** は、建築・設計業務向けのAIファーストなCADアプリケーション。
- Electron + Konva.js による2D図面作成・編集
- JWW / DXF ファイルの読み込み・書き出し対応
- ローカルLLM（Ollama）＋ クラウドAI（Claude/GPT）との連携
- オープンソース（MIT License）
- Windows / Mac / Linux 対応

## ビジョン

```
「誰でも無料で使えるAI建築CAD」
  - ローカルLLMで完全無料運用可能
  - クラウドAIは有料オプション（月額¥1,000程度）
  - データはローカルに保存、外部に出さない選択ができる
  - AutoCAD・JW_CADの代替を目指す
```

## 技術スタック

```
フレームワーク : Electron 28+
描画エンジン   : Konva.js 9+
UI            : HTML / CSS / Vanilla JS（フレームワークなし、シンプルに）
ファイル解析   : Python 3.12（ezdxf, JWWパーサー）or Node.js
AIブリッジ    : Electron Main プロセスから Ollama / Claude API に接続
パッケージ管理 : npm
```

## ディレクトリ構成

```
aicad/
  main.js              Electron メインプロセス
  preload.js           セキュアなIPC通信ブリッジ
  renderer/
    index.html         メイン画面
    app.js             アプリのエントリーポイント
    cad/
      canvas.js        Konva.jsキャンバス管理
      tools.js         描画ツール（線・矩形・円・選択）
      snap.js          スナップ機能（端点・中点・グリッド）
      layers.js        レイヤー管理
      dimensions.js    寸法表示
    io/
      dxf.js           DXF読み込み・書き出し
      jww.js           JWW読み込み
    ai/
      bridge.js        AI APIブリッジ（Ollama/Claude/GPT）
      prompt.js        図面コンテキスト→AIプロンプト生成
    ui/
      toolbar.js       ツールバー
      sidebar.js       AIチャットパネル
      statusbar.js     座標・数値入力バー
  package.json
  AGENTS.md            このファイル
  CLAUDE.md            Claude Code用（同内容）
  README.md
```

## Phase 1 実装目標（最初に作るもの）

### 必須機能
- [ ] Electronアプリの基本起動
- [ ] Konva.jsキャンバス表示（黒背景・グリッド）
- [ ] 基本描画ツール
  - [ ] 線（クリック→クリックで2点指定）
  - [ ] 矩形（2点指定 or 数値入力）
  - [ ] 円（中心＋半径）
- [ ] グリッドスナップ（1mm単位）
- [ ] 端点・中点スナップ
- [ ] 座標・数値入力バー（画面下部）
  - [ ] 「5700,3600」でEnterすると正確な矩形
- [ ] ズーム・パン（マウスホイール・中ボタンドラッグ）
- [ ] 選択・移動・削除
- [ ] レイヤーパネル（基本的な表示/非表示）
- [ ] DXF読み込み・表示
- [ ] JWW読み込み・表示
- [ ] AIチャットパネル（右側）
  - [ ] Ollama接続（localhost:11434）
  - [ ] Claude API接続（APIキー設定）
  - [ ] 図面の内容をAIに渡してチャット

### Phase 1 完了の定義
「DXFかJWWを読み込んで表示でき、AIに図面について質問できる」

---

## Phase 2 実装目標

- [ ] 寸法線の描画・表示
- [ ] テキスト入力
- [ ] ハッチング
- [ ] コピー・貼り付け・回転・鏡像
- [ ] Undo/Redo（Ctrl+Z）
- [ ] DXF書き出し
- [ ] AIによる図面変更（チャットで「この壁を100mm右に移動して」）

---

## Phase 3 実装目標

- [ ] クラウド保存・URL共有
- [ ] 複数人コラボレーション
- [ ] AIリアルタイム警告（変更時に即座に影響を通知）
- [ ] 建築基準法チェック（採光・換気・避難経路）

---

## AIとの連携仕様

### 図面データをAIに渡す形式

```json
{
  "layers": [...],
  "elements": [
    {"type": "line", "x1": 0, "y1": 0, "x2": 5700, "y2": 0, "layer": "壁"},
    {"type": "rect", "x": 0, "y": 0, "w": 5700, "h": 3600, "layer": "部屋"}
  ],
  "selected": [...],
  "bbox": {"minX": 0, "minY": 0, "maxX": 10000, "maxY": 8000}
}
```

### AIへの指示フォーマット（AIが返すJSON）

```json
{
  "action": "move",
  "target_id": "elem_123",
  "dx": 100,
  "dy": 0
}
```

```json
{
  "action": "resize",
  "target_id": "elem_456",
  "w": 5800,
  "h": 3600
}
```

```json
{
  "action": "add",
  "type": "rect",
  "x": 1000, "y": 0, "w": 900, "h": 2000,
  "layer": "建具"
}
```

---

## 料金モデル

```
無料
  └── ローカルLLM（Ollama）で動かす
      完全無料、データも外に出ない

有料（月¥1,000予定）
  └── Claude / GPT-4o をAPIキー不要で使える
      高精度なAI支援が必要なときに
```

---

## 重要な実装方針

1. **シンプルに作る**
   フレームワーク多用しない。HTML/CSS/JS で素直に書く。

2. **座標系**
   内部はmm単位で管理。画面表示はズームに応じてpxに変換。
   `px = mm * scale`、`scale`の初期値は`1`（1px = 1mm）

3. **スナップの優先順位**
   端点 > 中点 > 交点 > グリッド

4. **AIは非同期**
   AI処理中もUIはブロックしない。`async/await` で実装。

5. **Electron IPC**
   Main ↔ Renderer 間の通信は `preload.js` 経由（contextIsolation: true）

---

## 開発環境セットアップ

```bash
# Node.js 18+ が必要
node --version

# 依存パッケージインストール
npm install

# 開発起動
npm start

# ビルド
npm run build
```

## Gitワークフロー

```bash
git add .
git commit -m "変更内容"
git push origin main
```

このリポジトリはClaude CodeとOpenAI Codexが交互に作業する。
作業前に必ず `git pull` で最新を取得すること。
