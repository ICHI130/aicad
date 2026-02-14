// DXFパーサー
// LINE / ARC / CIRCLE / LWPOLYLINE / POLYLINE / TEXT / MTEXT / POINT / INSERT に対応

function readValue(lines, index) {
  return (lines[index] || '').trim();
}

export function parseDxf(content) {
  const lines = content.split(/\r?\n/);
  const entities = [];
  let index = 0;

  // ENTITIESセクションを探す
  while (index < lines.length) {
    if (readValue(lines, index) === '0' && readValue(lines, index + 1) === 'SECTION') {
      index += 2;
      if (readValue(lines, index) === '2' && readValue(lines, index + 1) === 'ENTITIES') {
        index += 2;
        break;
      }
    }
    index += 1;
  }

  // ENTITIESセクションが見つからない場合は先頭から全スキャン
  if (index >= lines.length) {
    index = 0;
  }

  while (index < lines.length - 1) {
    const code = readValue(lines, index);
    const value = readValue(lines, index + 1);

    // ENDSECで終了
    if (code === '0' && value === 'ENDSEC') break;

    if (code === '0' && value === 'LINE') {
      index += 2;
      const entity = { type: 'LINE', x1: 0, y1: 0, x2: 0, y2: 0 };
      while (index < lines.length - 1) {
        const gc = readValue(lines, index);
        const gv = readValue(lines, index + 1);
        if (gc === '0') break;
        if (gc === '10') entity.x1 = parseFloat(gv);
        if (gc === '20') entity.y1 = parseFloat(gv);
        if (gc === '11') entity.x2 = parseFloat(gv);
        if (gc === '21') entity.y2 = parseFloat(gv);
        index += 2;
      }
      entities.push(entity);
      continue;
    }

    if (code === '0' && value === 'ARC') {
      index += 2;
      const entity = { type: 'ARC', cx: 0, cy: 0, r: 0, startAngle: 0, endAngle: 360 };
      while (index < lines.length - 1) {
        const gc = readValue(lines, index);
        const gv = readValue(lines, index + 1);
        if (gc === '0') break;
        if (gc === '10') entity.cx = parseFloat(gv);
        if (gc === '20') entity.cy = parseFloat(gv);
        if (gc === '40') entity.r = parseFloat(gv);
        if (gc === '50') entity.startAngle = parseFloat(gv);
        if (gc === '51') entity.endAngle = parseFloat(gv);
        index += 2;
      }
      entities.push(entity);
      continue;
    }

    if (code === '0' && value === 'CIRCLE') {
      index += 2;
      const entity = { type: 'ARC', cx: 0, cy: 0, r: 0, startAngle: 0, endAngle: 360 };
      while (index < lines.length - 1) {
        const gc = readValue(lines, index);
        const gv = readValue(lines, index + 1);
        if (gc === '0') break;
        if (gc === '10') entity.cx = parseFloat(gv);
        if (gc === '20') entity.cy = parseFloat(gv);
        if (gc === '40') entity.r = parseFloat(gv);
        index += 2;
      }
      entities.push(entity);
      continue;
    }

    // LWPOLYLINE: 頂点リストを線分に分解
    if (code === '0' && value === 'LWPOLYLINE') {
      index += 2;
      const vertices = [];
      let closed = false;
      let currentX = null;
      while (index < lines.length - 1) {
        const gc = readValue(lines, index);
        const gv = readValue(lines, index + 1);
        if (gc === '0') break;
        // フラグ: bit0=closed
        if (gc === '70') closed = (parseInt(gv) & 1) === 1;
        if (gc === '10') currentX = parseFloat(gv);
        if (gc === '20' && currentX !== null) {
          vertices.push({ x: currentX, y: parseFloat(gv) });
          currentX = null;
        }
        index += 2;
      }
      // 頂点を線分に変換
      for (let i = 0; i < vertices.length - 1; i++) {
        entities.push({
          type: 'LINE',
          x1: vertices[i].x, y1: vertices[i].y,
          x2: vertices[i + 1].x, y2: vertices[i + 1].y,
        });
      }
      if (closed && vertices.length >= 2) {
        const last = vertices[vertices.length - 1];
        entities.push({
          type: 'LINE',
          x1: last.x, y1: last.y,
          x2: vertices[0].x, y2: vertices[0].y,
        });
      }
      continue;
    }

    // TEXT: 文字（1行テキスト）
    if (code === '0' && value === 'TEXT') {
      index += 2;
      const entity = { type: 'TEXT', x: 0, y: 0, height: 2.5, rotation: 0, text: '', align: 0 };
      while (index < lines.length - 1) {
        const gc = readValue(lines, index);
        const gv = readValue(lines, index + 1);
        if (gc === '0') break;
        if (gc === '10') entity.x = parseFloat(gv);
        if (gc === '20') entity.y = parseFloat(gv);
        if (gc === '40') entity.height = parseFloat(gv) || 2.5;
        if (gc === '50') entity.rotation = parseFloat(gv) || 0;
        if (gc === '1')  entity.text = gv;        // 文字列本文
        if (gc === '72') entity.align = parseInt(gv) || 0; // 0=左 1=中央 2=右
        // アライメント点（72>=1のとき基点になる）
        if (gc === '11') entity.ax = parseFloat(gv);
        if (gc === '21') entity.ay = parseFloat(gv);
        index += 2;
      }
      if (entity.text) entities.push(entity);
      continue;
    }

    // MTEXT: マルチラインテキスト
    if (code === '0' && value === 'MTEXT') {
      index += 2;
      const entity = { type: 'TEXT', x: 0, y: 0, height: 2.5, rotation: 0, text: '' };
      while (index < lines.length - 1) {
        const gc = readValue(lines, index);
        const gv = readValue(lines, index + 1);
        if (gc === '0') break;
        if (gc === '10') entity.x = parseFloat(gv);
        if (gc === '20') entity.y = parseFloat(gv);
        if (gc === '40') entity.height = parseFloat(gv) || 2.5;
        if (gc === '50') entity.rotation = parseFloat(gv) || 0;
        // MTEXT本文: group code 1 (最初の250字), 3 (続き)
        if (gc === '1' || gc === '3') {
          // MTEXTのフォーマットコード（{\fMS ゴシック;...}等）を除去
          const clean = gv.replace(/\{\\[^;]*;/g, '').replace(/[{}\\]/g, '').replace(/\\P/g, ' ');
          entity.text += clean;
        }
        index += 2;
      }
      if (entity.text) entities.push(entity);
      continue;
    }

    // POINT: 点
    if (code === '0' && value === 'POINT') {
      index += 2;
      const entity = { type: 'POINT', x: 0, y: 0 };
      while (index < lines.length - 1) {
        const gc = readValue(lines, index);
        const gv = readValue(lines, index + 1);
        if (gc === '0') break;
        if (gc === '10') entity.x = parseFloat(gv);
        if (gc === '20') entity.y = parseFloat(gv);
        index += 2;
      }
      entities.push(entity);
      continue;
    }

    // INSERT: ブロック挿入（座標だけ点として記録）
    if (code === '0' && value === 'INSERT') {
      index += 2;
      const entity = { type: 'POINT', x: 0, y: 0 };
      while (index < lines.length - 1) {
        const gc = readValue(lines, index);
        const gv = readValue(lines, index + 1);
        if (gc === '0') break;
        if (gc === '10') entity.x = parseFloat(gv);
        if (gc === '20') entity.y = parseFloat(gv);
        index += 2;
      }
      // INSERTは点として追加しない（ブロック展開が複雑なため省略）
      continue;
    }

    index += 2;
  }

  return entities;
}

export function dxfEntitiesToShapes(entities) {
  return entities.flatMap((entity) => {
    if (entity.type === 'LINE') {
      if (!isFinite(entity.x1) || !isFinite(entity.y1) ||
          !isFinite(entity.x2) || !isFinite(entity.y2)) return [];
      return [{ type: 'line', x1: entity.x1, y1: entity.y1, x2: entity.x2, y2: entity.y2 }];
    }
    if (entity.type === 'ARC') {
      if (!isFinite(entity.cx) || !isFinite(entity.cy) || !isFinite(entity.r)) return [];
      return [{ type: 'arc', cx: entity.cx, cy: entity.cy, r: entity.r,
                startAngle: entity.startAngle || 0, endAngle: entity.endAngle || 360 }];
    }
    if (entity.type === 'TEXT') {
      if (!entity.text) return [];
      // アライメント点がある場合はそちらを使う
      const x = (entity.align >= 1 && entity.ax != null) ? entity.ax : entity.x;
      const y = (entity.align >= 1 && entity.ay != null) ? entity.ay : entity.y;
      if (!isFinite(x) || !isFinite(y)) return [];
      return [{
        type: 'text',
        x, y,
        text: entity.text,
        height: isFinite(entity.height) ? entity.height : 2.5,
        rotation: entity.rotation || 0,
        align: entity.align || 0,
      }];
    }
    if (entity.type === 'POINT') {
      if (!isFinite(entity.x) || !isFinite(entity.y)) return [];
      return [{ type: 'point', x: entity.x, y: entity.y }];
    }
    return [];
  });
}
