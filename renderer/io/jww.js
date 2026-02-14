// JWWバイナリパーサー
// jwai_core.py の parse_jww_full() をJavaScriptに移植
//
// JWWレコード構造:
//   type (UINT16 LE) + size (UINT16 LE) + data (size bytes)
//
// 主なレコードタイプ:
//   0x10-0x17: 線データ  (x1,y1,x2,y2 各double = 32bytes)
//   0x20-0x27: 円弧データ (cx,cy,r,startAngle,endAngle 各double = 40bytes)

/**
 * Base64文字列からJWWバイナリを解析してエンティティを返す
 * @param {string} base64 - Base64エンコードされたJWWファイル内容
 * @returns {Array} エンティティ配列
 */
export function parseJwwBinary(base64) {
  // Base64 → Uint8Array
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const view = new DataView(bytes.buffer);
  const entities = [];
  let offset = 0;

  while (offset < bytes.length - 4) {
    let recType, recSize;

    try {
      recType = view.getUint16(offset, true);
      recSize = view.getUint16(offset + 2, true);
    } catch {
      break;
    }

    const dataOffset = offset + 4;

    // 線レコード (0x10 〜 0x17): x1,y1,x2,y2 各double
    if (recType >= 0x10 && recType <= 0x17 && recSize >= 32) {
      if (dataOffset + 32 <= bytes.length) {
        try {
          const x1 = view.getFloat64(dataOffset, true);
          const y1 = view.getFloat64(dataOffset + 8, true);
          const x2 = view.getFloat64(dataOffset + 16, true);
          const y2 = view.getFloat64(dataOffset + 24, true);

          if (isValidCoord(x1) && isValidCoord(y1) && isValidCoord(x2) && isValidCoord(y2)) {
            entities.push({ type: 'LINE', x1, y1, x2, y2 });
          }
        } catch { /* skip */ }
      }
    }

    // 円弧レコード (0x20 〜 0x27): cx,cy,r,startAngle,endAngle 各double
    if (recType >= 0x20 && recType <= 0x27 && recSize >= 40) {
      if (dataOffset + 40 <= bytes.length) {
        try {
          const cx = view.getFloat64(dataOffset, true);
          const cy = view.getFloat64(dataOffset + 8, true);
          const r  = view.getFloat64(dataOffset + 16, true);
          const startAngle = view.getFloat64(dataOffset + 24, true);
          const endAngle   = view.getFloat64(dataOffset + 32, true);

          if (isValidCoord(cx) && isValidCoord(cy) && r > 0 && r < 1e8) {
            entities.push({ type: 'ARC', cx, cy, r, startAngle, endAngle });
          }
        } catch { /* skip */ }
      }
    }

    // 次のレコードへ
    const advance = 4 + recSize;
    if (advance <= 0 || advance > bytes.length) {
      offset += 2;
    } else {
      offset += advance;
    }
  }

  return entities;
}

/**
 * 座標値として有効かチェック
 */
function isValidCoord(v) {
  return isFinite(v) && Math.abs(v) < 1e9;
}

/**
 * エンティティ配列をキャンバス用shapeに変換
 */
export function jwwEntitiesToShapes(entities) {
  return entities.flatMap((entity) => {
    if (entity.type === 'LINE') {
      return [{ type: 'line', x1: entity.x1, y1: entity.y1, x2: entity.x2, y2: entity.y2 }];
    }
    if (entity.type === 'ARC') {
      return [{ type: 'arc', cx: entity.cx, cy: entity.cy, r: entity.r,
                startAngle: entity.startAngle || 0, endAngle: entity.endAngle || 360 }];
    }
    return [];
  });
}

// 旧テキストベースのパーサー（後方互換）
export function parseJww(content) {
  return [];
}
