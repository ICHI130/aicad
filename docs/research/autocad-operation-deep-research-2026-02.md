# AutoCAD操作準拠のためのディープリサーチ & 実装優先度（2026-02）

## 目的

- 現在の AI CAD の操作仕様をコードベースで棚卸しする。
- AutoCAD ユーザーが期待する「慣れた操作」を調査し、差分を実装タスクへ落とす。
- 特に **右クリック運用（コンテキストメニュー／Enter代替）** を中心に優先順位を付ける。

---

## 1. 現在のAI CAD仕様（コード確認）

### 1.1 既に AutoCAD らしい操作

- 右クリックは `contextmenu` でハンドリングされ、ツール状態に応じて確定/キャンセル/メニュー表示を切替済み。
- `Space / Enter` で直前コマンド再実行（SELECT時）を実装済み。
- `Ctrl+C / Ctrl+V` による図形コピー&貼り付けを実装済み。
- `F7/F8/F9/F11` でグリッド・オルソ・スナップ・動的入力の切替を実装済み。
- 2文字コマンド（`PL`, `TR`, `EX` など）を実装済み。

### 1.2 右クリックの現在挙動（現状）

- `POLYLINE` 中: 右クリックで確定。
- `LINE / ARC / ELLIPSE` 中: 右クリックで終了（SELECTへ戻る）。
- `COPY` 中: プレビューを破棄してキャンセル。
- `SCALE / EXTEND / ARRAY / HATCH / BREAK / LENGTHEN / CHAMFER` 中: キャンセル。
- `SELECT` 中: 独自コンテキストメニュー表示。

> つまり「コマンド中右クリック=操作続行/オプション表示」よりは、現状は「右クリック=キャンセル寄り」の設計。

### 1.3 スナップ

- Endpoint / Intersection / Midpoint / Quadrant / Grid fallback を実装済み。
- マーカー表示も endpoint / midpoint / intersection に対応済み。
- 一方で AutoCAD で頻用される Perpendicular / Tangent / Nearest / Apparent intersection / Extension は未実装。

---

## 2. AutoCAD側の操作流儀（調査サマリ）

> 参考は Autodesk Help（AutoCAD 2025 系）中心に確認。実務チュートリアル（YouTube）で運用も照合。

### 2.1 右クリック運用（最重要）

AutoCAD では、設定により挙動差はあるものの、実務では次が一般的。

1. **コマンド実行中の右クリック = Enter 相当（直前オプション確定）**
2. **何も実行していない時の右クリック = コンテキストメニュー**
3. **Shift + 右クリック = Object Snap 一時メニュー**（Endpoint/Midpoint/Center/Intersection/Tangent/Perpendicular など）

このため、AutoCAD慣れユーザーは「右クリックで次に進む」期待が強い。

### 2.2 コマンドオプション提示

- AutoCADはコマンド中に `Specify first point or [Undo]:` のようなオプション提示を行う。
- ユーザーは右クリック、文字入力（U 等）、Enter でオプションを切替。
- 「同じ1コマンド内で分岐する」流れが早く、ツール切替回数が少ない。

### 2.3 編集で依存される操作

- 選択後のグリップ編集（hot grip）
- Selection cycling（重なりオブジェクト選択）
- Crossing / Window / Fence など選択モード
- TRIM/EXTEND の高速モード（境界→連続クリック）

---

## 3. ギャップ（AutoCAD慣れユーザー視点）

## P0（最優先）

1. **右クリックの Enter 代替不足**
   - 現状はキャンセル中心。
   - コマンド進行（次点確定／既定オプション実行）としての右クリックが弱い。

2. **Shift+右クリック OSNAP メニュー未実装**
   - 一時スナップ切替がないため、複雑作図で操作数が増える。

3. **コマンドオプション分岐UI不足**
   - コマンドラインにオプションを表示して選べる構造が不足。

## P1（高優先）

4. **OSNAP種類不足**
   - Perpendicular / Tangent / Nearest / Center など未実装。

5. **選択ワークフロー不足**
   - Window/Crossing/Fence, cycling, preselect+command の改善余地。

6. **TRIM/EXTEND のAutoCAD的テンポ不足**
   - クイックトリムに近い連続処理（境界推論や連続クリック）を強化したい。

## P2（中優先）

7. **グリップ編集（stretch-like）未実装**
8. **右クリックメニューの文脈最適化不足**（選択時と非選択時で内容最適化）
9. **ユーザー設定（右クリックをEnterにする等）未提供**

---

## 4. 実装提案（AutoCAD準拠MVP）

### Task A: 右クリック挙動を「AutoCAD互換プリセット」で切替

- 新規設定: `RightClickMode`
  - `legacy_cancel`（現状互換）
  - `autocad_like`（推奨デフォルト候補）
- `autocad_like` の仕様
  - コマンド実行中: 右クリック = Enter（現フェーズ確定）
  - アイドル時: コンテキストメニュー
  - ドラッグ中: キャンセルではなく「現在値確定」優先

### Task B: Shift+右クリック OSNAP 一時メニュー

- Konva上に小さなポップアップを表示（Endpoint/Midpoint/Intersection/Center/Perpendicular/Tangent/Nearest）。
- 選択後、**1回のみ有効の一時スナップ** として適用。
- 状態:
  - `persistentSnapModes`（常時ON）
  - `oneShotSnapMode`（Shift+右クリックで次クリックにだけ適用）

### Task C: コマンドラインのオプション分岐

- 例: `LINE` 実行中に `[Undo]`、`POLYLINE` で `[Close/Undo]` を表示。
- 右クリック（Enter相当）で既定オプション発火。
- 1～2文字入力でオプション切替（例: `C` で close）。

### Task D: OSNAP拡張

- `snap.js` を拡張して以下追加:
  - Center（circle/arc）
  - Perpendicular（lineへの垂線足）
  - Tangent（circle/arcへの接点）
  - Nearest（line/arc/circle上の最短点）
- snap marker の図形も追加（記号を AutoCAD 風に）。

---

## 5. 段階導入ロードマップ（推奨）

1. **Phase 1 (1-2週間):** Task A + C（右クリックEnter、コマンドオプション表示）
2. **Phase 2 (1週間):** Task B（Shift+右クリック一時OSNAP）
3. **Phase 3 (1-2週間):** Task D（OSNAP拡張）
4. **Phase 4:** 選択系とグリップ編集の強化

---

## 6. 受け入れ基準（抜粋）

- LINE/POLYLINE/CIRCLE 中に右クリックで「キャンセル」ではなく「次フェーズへ進む」こと。
- Shift+右クリックでOSNAPメニューが出て、次クリック1回だけ反映されること。
- ステータスバー/コマンドラインに現在有効なOSNAP（例: `OSNAP: END, MID + (TEMP:TAN)`）が表示されること。
- 既存ショートカット（Esc, Enter, Ctrl+Z/Y, F7/F8/F9/F11）との衝突がないこと。

---

## 7. 調査リンク（再確認用）

- Autodesk Help: AutoCAD Object Snap 概要
- Autodesk Help: CIRCLE / POLYLINE / TRIM / EXTEND / DIM コマンド
- Autodesk Help: Right-Click Customization / Shortcut Menus
- 実務チュートリアル（YouTube）:
  - object snap workflow
  - right-click enter workflow
  - polyline + trim drafting flow

（URLは運用時に最新版へ更新。Autodesk Help はバージョン差分があるため 2025/2026 の現行版で再確認推奨。）

---

## 8. 作図コマンド別ギャップ（線・曲線・円・その他）

> ご要望の「線を引く、曲線を引く、円を描く、他諸々」について、**機能差**と**操作差**を分けて整理。

### 8.1 LINE（直線）

- 機能面
  - AI CAD: 2点指定で作図可能（MVPとして十分）。
  - AutoCAD: 連続線分、Undo、角度/長さ直接入力、相対座標 `@`、極トラッキング連携が強い。
- 操作面
  - AI CAD: 右クリックはキャンセル寄り。
  - AutoCAD: 右クリック/Enterで次点確定しながらテンポ良く連続入力。
- 実装優先
  1. コマンド中右クリック=Enter
  2. `length<angle` / `@dx,dy` 入力
  3. Undoオプション（1セグメント戻す）

### 8.2 CIRCLE（円）

- 機能面
  - AI CAD: 中心+半径は実装済み。
  - AutoCAD: 2P/3P、TTR（接線-接線-半径）など実務で重要なバリエーションがある。
- 操作面
  - AutoCADでは半径値の数値入力、直径切替（D）を多用。
  - 接線スナップとの併用で既存線・円に正接する円を作るケースが多い。
- 実装優先
  1. `D`（直径）オプション
  2. 2P/3P
  3. TTR（Tangent, Tangent, Radius）

### 8.3 ARC / 曲線（円弧）

- 機能面
  - AI CAD: 基本ARCはあるが、開始点/中心/角度/長さの分岐は限定的。
  - AutoCAD: 3点、Start-Center-End、Start-End-Radius 等の作図法が豊富。
- 操作面
  - AutoCADユーザーは用途に応じてサブオプションを即切替する（右クリック/文字入力）。
- 実装優先
  1. ARCコマンド内オプション分岐（3点/中心指定）
  2. 角度・長さ入力

### 8.4 POLYLINE（連続線）

- 機能面
  - AI CAD: クリックで頂点追加、Enter/右クリックで確定、`C`で閉じる（MVP良好）。
  - AutoCAD: 線分/円弧切替、幅、Undo、Close/Open など1コマンド内完結が強い。
- 操作面
  - AutoCADでは PL 実行中に `A`（円弧）、`L`（直線戻し）、`W`（幅）を頻繁利用。
- 実装優先
  1. `A/L` 切替
  2. `U` Undo
  3. 幅（start/end width）

### 8.5 ELLIPSE / SPLINE（自由曲線）

- 機能面
  - AI CAD: ELLIPSEはあるが、SPLINE未実装。
  - AutoCAD: 意匠・家具・ランドスケープではSPLINE利用率が高い。
- 操作面
  - 制御点編集（フィット点・CV）と後編集が重要。
- 実装優先
  1. SPLINE（fit point方式）
  2. 既存曲線の頂点編集UI

### 8.6 RECT / OFFSET / FILLET / CHAMFER 連携

- 機能面
  - AI CAD: RECT, OFFSET, FILLET, CHAMFER は既に存在。
  - AutoCAD: これらを連続実行する文脈で右クリックEnterとOSNAPを多用。
- 操作面
  - 「作図コマンド単体」より、**連携テンポ**に体感差が出る。
- 実装優先
  1. 直前コマンド再実行の安定化（Space/Enter/右クリック）
  2. コマンド継続時の既定オプション明示

### 8.7 TEXT / DIM / HATCH（作図周辺）

- 機能面
  - AI CAD: TEXT, DIM, HATCH は実装済みだが、スタイル管理は簡易。
  - AutoCAD: TextStyle/DimStyle/Hatch pattern を図面標準として運用。
- 操作面
  - AutoCADでは「見た目を後で直す」のではなく、スタイルを先に選んで作図する。
- 実装優先
  1. スタイルプリセット
  2. プロパティコピー（MATCHPROP）

---

## 9. 結論（ユーザー慣れに寄せるべきか）

結論として、**操作はAutoCAD準拠に寄せるのが正解**。

- 理由1: 学習コストが最小化される（既存ユーザーの筋肉記憶を活かせる）。
- 理由2: 実装効果が高いのは図形アルゴリズムより「入力フロー」改善（右クリック/OSNAP/オプション分岐）。
- 理由3: 連続作図テンポが上がると、同じ機能数でも「使えるCAD」に近づく。

したがって次スプリントは、

1. 右クリック=Enter互換
2. Shift+右クリック一時OSNAP
3. LINE/CIRCLE/ARC/POLYLINE のオプション分岐拡張

を先行するのが最も費用対効果が高い。


---

## 10. プロダクト方針（AI連動 + AutoCAD準拠）

今回の合意として、今後の操作設計は次を基本方針とする。

1. **AI連動を第一級機能として維持**
   - 自然言語で作図・修正指示を出せることを継続強化する。
   - ただしAI提案は常にプレビュー/確認可能にし、誤操作を防ぐ。

2. **手動作図フローは AutoCAD 準拠を優先**
   - 右クリック=Enter相当、Shift+右クリックOSNAP、コマンドオプション分岐など、
     既存AutoCADユーザーの筋肉記憶を活かせるUIへ寄せる。

3. **ハイブリッド運用を前提にしたUI**
   - 「AIで下書き→手動で微修正」「手動作図中にAIへ部分指示」の往復を最短化する。
   - 具体的には、選択中オブジェクトをAIへコンテキスト送信する導線、
     AI実行結果を即UNDOできる履歴統合を優先する。

### 実装判断ルール（簡易）

- 同等の価値なら **AutoCAD互換の操作** を採用する。
- 互換と競合するAI専用UXは、
  - 学習コスト削減
  - 操作ステップ短縮
  - 誤操作率低下
  の3条件を満たす場合のみ採用する。

この方針により、「AI CADらしさ」と「既存CADユーザーの移行容易性」を両立する。


---

## 11. 追加論点: 窓選択（複数オブジェクト選択）のAutoCAD準拠

いただいた指摘どおり、実務効率の観点で **窓選択（複数選択）** は優先度が高い。

### 11.1 AutoCADでの基本期待

- **Window選択（左→右）**: 矩形内に完全に入った要素のみ選択。
- **Crossing選択（右→左）**: 矩形に触れた要素を選択。
- **Fence選択**: 折れ線に交差した要素を選択。
- **Selection cycling**: 重なり要素の選択候補を順送り。

### 11.2 AI CADへの導入方針（MVP）

1. **Window/Crossing を先行実装**
   - ドラッグ方向でモード自動切替（AutoCAD互換）。
   - 視覚フィードバック:
     - 左→右: 青枠（Window）
     - 右→左: 緑枠（Crossing）
2. **選択時右クリックメニューを文脈化**
   - 選択済みのとき: Move/Copy/Rotate/Delete など中心。
   - 未選択時: 汎用メニュー。
3. **次段でFence/Cycling追加**
   - FenceはTrim/Extend前処理で有効。
   - Cyclingは高密度図面で必須。

### 11.3 実装受け入れ基準（窓選択）

- 左→右ドラッグで「完全内包」のみ選択されること。
- 右→左ドラッグで「交差した要素」が選択されること。
- 1000要素規模で体感遅延なく選択できること。
- Undo/Redo・Delete・Move 既存処理と競合しないこと。

### 11.4 優先度更新

- P0に「右クリック=Enter」「Shift+右クリックOSNAP」に加え、
  **Window/Crossing選択** を同格で追加する。
- 理由: 単体作図よりも、実務では「複数編集」の頻度が高いため。
