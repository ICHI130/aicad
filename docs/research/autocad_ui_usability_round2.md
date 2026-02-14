# AutoCAD UI/操作性 調査メモ（Round 2）

## 実施内容
- AutoCAD公式ヘルプ（CIRCLE / OSNAP / TRIM系GUIDページ）
- YouTube検索（Object Snapチュートリアル、Spaceで直前コマンド再実行系）

## この環境での制約
この実行環境から外部サイトは `HTTP 403 Forbidden` となり、本文の取得ができませんでした。
（`curl -I -L` で Autodesk / YouTube を確認）

## 反映した改善（AutoCAD系の一般的操作に合わせた実装）
1. **ステータスバーにOSNAP種別表示を追加**
   - `SNAP: END / MID / INT / QUA / GRID / OFF`
   - スナップ有効時の現在スナップ種別を表示して、確定前の安心感を向上

2. **Space/Enterで直前コマンド再実行（選択ツール時）**
   - AutoCADでよく使う反復作図フローを再現

3. **Shift押下で一時オルソON（離したら戻す）**
   - 一時的な水平/垂直拘束を素早く使えるように改善

## 次の候補
- 動的入力（カーソル近傍に長さ/角度の入力UI）
- OSNAPオーバーライド（Shift+右クリック風の一時スナップ切替）
- ポリラインの幅/円弧セグメント対応
