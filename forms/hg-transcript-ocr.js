/* 宏國地政士作業台：謄本電腦內辨識、逐頁保留文字與辨識來源。
 * 1) 電子謄本 PDF：文字層照讀；所有權人姓名、統一編號、出生日期、住址這幾行在電子謄本是「圖片」，只把這幾行圖片拿去辨識，補成文字。
 * 2) 掃描 PDF（沒有文字層）、手機照片：整頁辨識（先自動轉正、校正歪斜），再排回一行一行。
 * 產出的文字交給 hg-transcript.js 的同一套謄本規則。辨識用 hg-ocr.js（PaddleOCR 開源模型），全部在這台電腦執行，不上傳、不付費。 */
(function () {
  'use strict';
  const ROW_SCALE = 4;            // 電子謄本：圖片行用 4 倍解析度辨識
  const PAGE_SIDE = 2400;         // 掃描頁／照片：長邊縮到 2400px 辨識
  const KEY_LINE = /所有權人|統一編號|出生日期|住址|權利範圍|共有部分|建號|地號|面積|門牌|管理者/;
  // 只在可辨識的欄名或標題內校字。姓名、地址、附註、持分與類別原字留給核對者。
  const labelGlyphs = {
    謄: '腾騰膳誊', 記: '记', 類: '类', 標: '标', 權: '权', 項: '项',
    統: '统', 編: '编', 號: '号', 範: '范', 圍: '围', 積: '积', 屬: '属', 層: '层',
    總: '总', 門: '门', 狀: '状', 當: '当', 價: '价', 報: '报', 現: '现',
    歷: '历', 關: '关', 轉: '转', 規: '规', 種: '种', 額: '额', 擔: '担',
    債: '债', 確: '确', 續: '续', 間: '间', 償: '偿', 遲: '迟', 違: '违',
    約: '约', 務: '务', 設: '设', 證: '证', 書: '书', 義: '义', 機: '机', 發: '发',
    轄: '辖', 資: '资', 時: '时', 頁: '页'
  };
  const labelPattern = value => Array.from(value, c => labelGlyphs[c] ? '[' + c + labelGlyphs[c] + ']' : c).join('[ \t　]*');
  const fieldNames = [
    '登記次序', '登記日期', '登記原因', '原因發生日期', '所有權人', '統一編號', '出生日期', '住址', '權利範圍', '權狀字號',
    '當期申報地價', '前次移轉現值或原規定地價', '前次移轉現值', '歷次取得權利範圍', '相關他項權利登記次序', '其他登記事項',
    '權利種類', '收件年期', '字號', '權利人', '債權額比例', '擔保債權總金額', '擔保債權總額', '擔保債權種類及範圍',
    '擔保債權確定期日', '存續期間', '清償日期', '利息', '遲延利息', '違約金', '債務人及債務額比例', '權利標的',
    '標的登記次序', '設定權利範圍', '證明書字號', '設定義務人', '共同擔保地號', '共同擔保建號', '流抵約定',
    '其他擔保範圍約定', '管理者', '建物門牌', '建物坐落地號', '主要用途', '主要建材', '層數', '層次', '層次面積',
    '總面積', '面積', '附屬建物用途', '共有部分', '資料管轄機關', '謄本核發機關', '列印時間', '頁次'
  ];
  const patterns = fieldNames.sort((a, b) => b.length - a.length).map(name => {
    let pattern = labelPattern(name);
    if (name === '住址') pattern = '住[ \t　，,、．.。]*址';
    if (name === '附屬建物用途') pattern += '|' + labelPattern('附屬建物途');
    let shortened = '', followedBy = '';
    if (name === '權利範圍') { shortened = '|' + labelPattern('權利範') + '█?'; followedBy = '(?=[：:＊*0-9０-９全])'; }
    if (name === '附屬建物用途') { shortened = '|' + labelPattern('附屬建物用'); followedBy = '(?=[：:])'; }
    const exact = new RegExp('^(?:' + pattern + shortened + ')$');
    pattern += shortened + followedBy;
    return { name, pattern, exact };
  });
  const fields = new RegExp('(^[ \t　]*|[ \t　]+)(' + patterns.map(p => p.pattern).join('|') + ')([ \t　]*[：:])?', 'g');
  const title = new RegExp('^([ \t　]*)(土地|建物)[ \t　]*' + labelPattern('登記第') + '[ \t　]*([^ \t　類类]?)[ \t　]*' + labelPattern('類謄本'));
  const sections = ['標示部', '所有權部', '他項權利部'].map(name => ({
    name,
    pattern: new RegExp('^[＊*※\\s]*(土地|建物)[ \\t　]*' + labelPattern(name) + '[＊*※\\s]*$'),
    loose: new RegExp('[＊*※][^：:0-9０-９]{0,4}[ \\t　]*(土地|建物)[ \\t　]*' + labelPattern(name) + '[ \\t　]*[^：:0-9０-９]{0,4}[＊*※]')
  }));
  // 星號裝飾的區段標題：辨識有時把星號認成「水」「米」。只有還原後整列是「土地／建物＋部別」或全是星號時才採用。
  function starFix(raw) {
    if (!/[水米氺冰]/.test(raw) || !/[＊*※]{3,}/.test(raw)) return raw;
    const t = raw.replace(/[水米氺冰]+/g, (m, off, s) => /[＊*※]/.test(s[off - 1] || '') || /[＊*※]/.test(s[off + m.length] || '') ? '*'.repeat(m.length) : m);
    const core = t.replace(/[＊*※\s　]/g, '');
    return core === '' || (/^(土地|建物)/.test(core) && core.length <= 9) ? t : raw;
  }
  function fixLine(value) {
    const raw = starFix(String(value == null ? '' : value));
    if (title.test(raw)) return raw.replace(title, (_, spaces, kind, category) => spaces + kind + '登記第' + category + '類謄本');
    for (const section of sections) {
      const match = section.pattern.exec(raw);
      if (match) return match[1] + section.name;
    }
    // 兩側星號很多、中間是區段標題，星號被認成其他字時仍取標題
    if ((raw.match(/[＊*※]/g) || []).length >= 6) {
      for (const section of sections) {
        const match = section.loose.exec(raw);
        if (match) return match[1] + section.name;
      }
    }
    // 僅在有星號裝飾、地建類型清楚且整列符合已知標題錯字時校字。
    if (/^\s*[＊*※]{3,}/.test(raw)) {
      const decorated = raw.replace(/[＊*※\s]/g, '').match(/^(土地|建物)([標标]=部|所有[權权]郎)$/);
      if (decorated) return decorated[1] + (decorated[2].includes('=') ? '標示部' : '所有權部');
    }
    return raw.replace(fields, (match, spaces, token, colon, offset) => {
      // 後欄只有帶冒號的明確標籤才更動，避免把值中剛好相同的字當欄位。
      if (offset > 0 && !colon) return match;
      return spaces + patterns.find(p => p.exact.test(token)).name + '：';
    });
  }
  function fixLines(lines) { return lines.map(fixLine); }
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const white = c => { const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); return g; };

  function crop(src, r, maxH) {
    const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
    const w = Math.min(src.width - x, Math.ceil(r.w)), h = Math.min(src.height - y, Math.ceil(r.h));
    if (w < 2 || h < 2) return '';
    const k = Math.min(1, (maxH || 40) / h, 900 / w), c = mk(w * k, h * k);
    white(c).drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
    const u = c.toDataURL('image/jpeg', 0.85); c.width = c.height = 0; return u;
  }
  function thumb(src, side) {
    const k = Math.min(1, (side || 1600) / Math.max(src.width, src.height)), c = mk(src.width * k, src.height * k);
    white(c).drawImage(src, 0, 0, c.width, c.height);
    const u = c.toDataURL('image/jpeg', 0.75); c.width = c.height = 0; return u;
  }
  function rotate(src, deg) {
    const a = deg * Math.PI / 180, cos = Math.abs(Math.cos(a)), sin = Math.abs(Math.sin(a));
    const c = mk(src.width * cos + src.height * sin, src.width * sin + src.height * cos), g = white(c);
    g.translate(c.width / 2, c.height / 2); g.rotate(a); g.drawImage(src, -src.width / 2, -src.height / 2);
    return c;
  }

  // 歪斜角度（度）：取深色點，找讓「每一列的深色點數」最集中的角度（投影法）
  function skewAngle(src) {
    const k = Math.min(1, 1000 / Math.max(src.width, src.height)), c = mk(src.width * k, src.height * k), g = white(c);
    g.drawImage(src, 0, 0, c.width, c.height);
    const W = c.width, H = c.height, px = g.getImageData(0, 0, W, H).data; c.width = c.height = 0;
    let sum = 0; for (let i = 0; i < px.length; i += 16) sum += px[i] + px[i + 1] + px[i + 2];
    const mean = sum / (px.length / 16) / 3, th = Math.min(150, mean - 50);
    const xs = [], ys = [];
    // 每一列都取（只隔欄取樣）：若隔列取樣，0° 時點會集中在偶數列，分數被灌高，永遠判成不歪
    for (let y = 0; y < H; y++) for (let x = (y & 1); x < W; x += 2) { const i = (y * W + x) * 4; if ((px[i] + px[i + 1] + px[i + 2]) / 3 < th) { xs.push(x - W / 2); ys.push(y); } }
    if (xs.length < 200) return 0;
    const score = deg => {
      const a = deg * Math.PI / 180, s = Math.sin(a), co = Math.cos(a), bins = new Map();
      for (let i = 0; i < xs.length; i++) { const b = Math.round(ys[i] * co - xs[i] * s); bins.set(b, (bins.get(b) || 0) + 1); }
      let v = 0; for (const n of bins.values()) v += n * n; return v;
    };
    let best = 0, bv = -1;
    for (let d = -8; d <= 8.001; d += 0.5) { const v = score(d); if (v > bv) { bv = v; best = d; } }
    const c0 = best;
    for (let d = c0 - 0.45; d <= c0 + 0.451; d += 0.15) { const v = score(d); if (v > bv) { bv = v; best = d; } }
    return Math.abs(best) < 0.2 ? 0 : best;
  }

  const isDecoration = t => { const s = String(t || '').replace(/[\s　]/g, ''); return s.length >= 3 && /[＊*※]/.test(s) && /^[＊*※水米氺冰]+$/.test(s); };
  // 辨識結果的方框排回一行一行（同一行：垂直中心相近；行內由左到右，有明顯空隙補空白）
  function groupLines(boxes) {
    const lines = [];
    boxes.slice().sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2)).forEach(b => {
      const cy = b.y + b.h / 2;
      // 從黏住的多列切出的方框，外擴後會和同列緊鄰的字左右重疊；只有這種情形改用外擴前範圍（cx、cw）判斷
      const clash = o => {
        const core = (o.split || b.split) && o.cw && b.cw;
        const ox = core ? o.cx : o.x, ow = core ? o.cw : o.w, bx = core ? b.cx : b.x, bw = core ? b.cw : b.w;
        return bx < ox + ow - 2 && ox < bx + bw - 2;
      };
      const L = lines.find(l => Math.abs(l.cy - cy) < Math.min(l.h, b.h) * 0.5 && !l.boxes.some(clash));
      if (L) { L.boxes.push(b); L.cy = (L.cy * (L.boxes.length - 1) + cy) / L.boxes.length; L.h = Math.max(L.h, b.h); }
      else lines.push({ cy, h: b.h, boxes: [b] });
    });
    return lines.sort((a, b) => a.cy - b.cy).map(l => {
      l.boxes.sort((a, b) => a.x - b.x);
      let text = '', end = null;
      l.boxes.forEach(b => { if (end !== null && b.x - end > l.h * 0.4) text += ' '; text += b.text; end = b.x + b.w; });
      const x0 = Math.min(...l.boxes.map(b => b.x)), y0 = Math.min(...l.boxes.map(b => b.y));
      const x1 = Math.max(...l.boxes.map(b => b.x + b.w)), y1 = Math.max(...l.boxes.map(b => b.y + b.h));
      // 標題兩側的星號裝飾（可能被認成「水」「米」）可信度常偏低，不因此把整列標題清空
      const needsReview = l.boxes.some(b => b.needsReview && !isDecoration(b.text));
      return { rawText: text, text: needsReview ? '' : fixLine(text), needsReview, x: x0, y: y0, w: x1 - x0, h: y1 - y0, score: l.boxes.reduce((s, b) => s + b.score, 0) / l.boxes.length, boxes: l.boxes };
    });
  }
  /* D17 層次面積表補救（整頁辨識用）：表格列很密時，右邊的面積數字多半讀得準，左邊的「一層、二層」常缺字或錯字。
   * 只有全部條件成立才依順序補上樓層名稱：①「層數：00N層」與「總面積」那兩格讀得清楚 ②第一列有「層次面積」
   * ③每列面積都讀得清楚、列數為 N～N+4 ④面積加總等於總面積 ⑤沒有「地下」 ⑥第 N 列之後的列讀得出「屋頂突出物／夾層／騎樓」。
   * 回傳 { out: Map(行序→改寫後文字), flag: Set(名稱是推得的行序，仍列為需核對) } */
  const ZH = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const zhNum = n => n < 10 ? ZH[n] : (n >= 20 ? ZH[Math.floor(n / 10)] : '') + '十' + ZH[n % 10];
  const AREA_BOX = /^(?:層次面積[：:])?[＊*]*([0-9][0-9,]*(?:\.[0-9]+)?)平方公尺$/;
  function floorFix(lines) {
    const out = new Map(), flag = new Set(), none = { out: new Map(), flag: new Set() };
    const nz = s => String(s == null ? '' : s).normalize('NFKC').replace(/\s/g, '');
    const hi = lines.findIndex(l => /層數[：:]?0*\d+層/.test(nz(fixLine(l.rawText))) && /總面積/.test(nz(fixLine(l.rawText))));
    if (hi < 0) return none;
    const head = nz(fixLine(lines[hi].rawText));
    const nm = head.match(/層數[：:]?0*(\d+)層/), tm = head.match(/總面積[：:]?[＊*]*([0-9][0-9,]*(?:\.[0-9]+)?)平方公尺/);
    if (!nm || !tm) return none;
    const N = +nm[1], T = +tm[1].replace(/,/g, '');
    if (!(N >= 1 && N <= 99) || !(T > 0)) return none;
    const hb = lines[hi].boxes || [];
    if (!hb.some(b => /總面積/.test(nz(b.text)) && b.score >= 0.9) || !hb.some(b => /\d+層/.test(nz(b.text)) && b.score >= 0.9)) return none;
    const rows = [];
    for (let i = hi + 1; i < lines.length && i <= hi + N + 16; i++) {
      const t = nz(fixLine(lines[i].rawText));
      if (/附屬建物|其他登記事項|所有權部|他項權利部|權利範圍/.test(t)) break;
      const boxes = (lines[i].boxes || []).slice().sort((a, b) => a.x - b.x);
      const ai = boxes.findIndex(b => AREA_BOX.test(nz(b.text)));
      if (ai < 0) { if (/平方公尺/.test(t)) return none; continue; }   // 面積格讀不清楚就不補
      if (boxes[ai].score < 0.9) return none;
      const value = nz(boxes[ai].text).match(AREA_BOX)[1].replace(/,/g, '');
      const cell = nz(boxes[ai].text).replace(/^層次面積[：:]?/, '');   // 保留原有星號
      const left = nz(boxes.slice(0, ai).map(b => b.text).join(''));
      const label = left.replace(/層次面積[：:]?$/, '').replace(/^層?次[：:]?/, '');
      rows.push({ i, value, cell, label, review: !!lines[i].needsReview, first: /層次面積/.test(nz(boxes[ai].text)) || /層次面積[：:]?$/.test(left) });
    }
    if (rows.length < N || rows.length > N + 4 || !rows[0].first || rows.slice(1).some(r => r.first)) return none;
    const sum = Math.round(rows.reduce((s, r) => s + Number(r.value), 0) * 100) / 100;
    if (Math.abs(sum - T) > 0.005 || rows.some(r => /地下/.test(r.label))) return none;
    const names = [];
    for (let k = 0; k < rows.length; k++) {
      if (k < N) { names.push(zhNum(k + 1) + '層'); continue; }
      const m = rows[k].label.match(/屋頂突出物|夾層|騎樓/);
      if (!m) return none;
      names.push(m[0]);
    }
    // 整張表都讀對、也沒有低分行時不介入（維持原本可直接帶入的狀態）
    if (!lines[hi].needsReview && rows.every((r, k) => !r.review && r.label === names[k])) return none;
    // 層數、總面積已由加總驗證；連同各列一起改寫，並全部列為需核對（核對者確認後才勾選帶入）
    out.set(hi, '層數：' + nm[0].match(/0*\d+層/)[0] + ' 總面積：' + head.match(/總面積[：:]?([＊*]*[0-9][0-9,.]*平方公尺)/)[1]);
    rows.forEach((r, k) => out.set(r.i, (k === 0 ? '層次：' + names[k] + ' 層次面積：' : names[k] + ' ') + r.cell));
    for (const i of out.keys()) flag.add(i);
    return { out, flag };
  }
  const useful = b => b.score >= 0.85 || (b.score >= 0.55 && /[㐀-鿿0-9０-９A-Za-z]/.test(b.text) && b.text.trim().length >= 3);

  const overlap = (a, b) => {
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return ix * iy / Math.min(a.w * a.h, b.w * b.h);
  };
  async function ocrBoxes(src, opt) {
    const O = window.HGOcr;
    // 偵測對縮放很敏感（同一行在某個尺寸會整行漏掉），整頁辨識時用兩種尺寸偵測，再把沒重疊的方框補進來
    let boxes = [];
    for (const side of opt.sides || [opt.maxSide || 2000]) {
      const got = await O.detect(src, { maxSide: side, splitRows: !!opt.splitRows });
      if (!boxes.length) boxes = got;
      else got.forEach(b => { if (!boxes.some(a => overlap(a, b) > 0.3)) boxes.push(b); });
    }
    let done = 0;
    const out = await Promise.all(boxes.map(async b => {
      const r = await O.recognize(src, b);
      done++; if (opt.onBox) opt.onBox(done, boxes.length);
      const box = { x: b.x, y: b.y, w: b.w, h: b.h, ...(b.cw ? { cx: b.cx, cw: b.cw } : {}), ...(b.split ? { split: true } : {}), text: String(r.text || ''), score: r.score };
      return { ...box, needsReview: !useful(box) };
    }));
    return out.filter(b => b.text.trim());
  }

  // 整頁辨識：校正歪斜 → 判斷是否轉 90°／180° → 排成行
  async function readCanvas(src, opt) {
    opt = opt || {};
    let cv = src, angle = skewAngle(src);
    if (angle) cv = rotate(src, -angle);
    const say = t => opt.onStatus && opt.onStatus(t);
    let boxes = await O_boxes(cv, opt);
    const area = bs => bs.reduce((s, b) => s + b.w * b.h, 0);
    const candidates = boxes.filter(b => !b.needsReview);
    const tall = candidates.filter(b => b.h > b.w * 1.3);
    if (candidates.length >= 3 && area(tall) > area(candidates) * 0.5) {
      say('頁面是橫的，轉正後重新辨識…');
      const tries = [];
      for (const d of [90, -90]) { const r = rotate(cv, d); tries.push({ cv: r, boxes: await O_boxes(r, opt) }); }
      tries.sort((a, b) => mean(b.boxes) - mean(a.boxes) || b.boxes.length - a.boxes.length);
      if (cv !== src) cv.width = cv.height = 0;
      cv = tries[0].cv; boxes = tries[0].boxes; tries[1].cv.width = tries[1].cv.height = 0;
    }
    if (boxes.length >= 3 && mean(boxes) < 0.6) {
      say('頁面可能上下顛倒，轉正後重新辨識…');
      const r = rotate(cv, 180), b2 = await O_boxes(r, opt);
      if (mean(b2) > mean(boxes) + 0.05) { if (cv !== src) cv.width = cv.height = 0; cv = r; boxes = b2; } else r.width = r.height = 0;
    }
    const lines = groupLines(boxes);
    return { canvas: cv, angle, lines, score: mean(boxes) };
  }
  const mean = bs => bs.length ? bs.reduce((s, b) => s + b.score, 0) / bs.length : 0;
  // 整頁辨識：黏在一起的表格列切回單列（層次面積表等）
  const O_boxes = (cv, opt) => ocrBoxes(cv, { sides: [PAGE_SIDE, 1800], onBox: opt.onBox, splitRows: true });

  // 電子謄本：找出頁面上「一行高、很寬」的圖片（所有權人、統一編號、住址等），回傳頁面座標（左上為原點，單位 pt）
  async function imageRows(page, pdfjs) {
    const vp = page.getViewport({ scale: 1 }), ops = await page.getOperatorList(), O = pdfjs.OPS;
    let m = [1, 0, 0, 1, 0, 0]; const stack = [], out = [];
    const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const f = ops.fnArray[i], a = ops.argsArray[i];
      if (f === O.save) stack.push(m.slice());
      else if (f === O.restore) m = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (f === O.transform) m = mul(m, a);
      else if (f === O.paintImageXObject || f === O.paintInlineImageXObject || f === O.paintImageMaskXObject) {
        const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => [m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]]);
        const xs = pts.map(q => q[0]), ys = pts.map(q => vp.height - q[1]);
        const x = Math.max(0, Math.min(...xs)), y = Math.max(0, Math.min(...ys)), x1 = Math.min(vp.width, Math.max(...xs)), y1 = Math.min(vp.height, Math.max(...ys));
        if (x1 - x > 80 && y1 - y >= 6 && y1 - y <= 26) out.push({ x, y, w: x1 - x, h: y1 - y });
      }
    }
    return { rows: out, width: vp.width, height: vp.height };
  }

  /**
   * 讀一份謄本檔（PDF 或照片）→ { text（頁與頁用 \f 分隔）, mode, pages, pageSources,
   * evidence:[{page,source,rawText,text,score,crop}], thumbs:{頁:圖}, ocrPages, score }
   * pageSources 每筆保留實體頁序 page（從 1 起算）、source、rawText 與送解析器的 text。
   * source: 'text' 文字層、'mixed' 文字層加圖片列 OCR、'ocr' 整頁 OCR。
   * opt: { pdfjs, pdfOpts:{cMapUrl, standardFontDataUrl}, ensureOcr: async()=>{}, onStatus(t), onProgress(done,total), forceOcr, cancelled:()=>bool }
   */
  async function readFile(file, opt) {
    opt = opt || {};
    const say = t => opt.onStatus && opt.onStatus(t), stop = () => opt.cancelled && opt.cancelled();
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    const res = { text: '', mode: 'text', pages: 0, pageSources: [], evidence: [], thumbs: {}, ocrPages: 0, score: 0 };
    const scores = [];
    const addPage = (page, source, lines, reviewLines = [], fixes) => {
      const rawText = lines.join('\n');
      // fixes：層次面積表依層數與總面積驗算後補上的列（仍列在 reviewLines，請核對者確認）
      const text = source === 'text' ? rawText : lines.map((line, i) => fixes && fixes.has(i) ? fixes.get(i) : reviewLines.includes(i + 1) ? '' : fixLine(line)).join('\n');
      const entry = { page, source, rawText, text, reviewLines };
      if (fixes && fixes.size) { entry.inferred = [...fixes.keys()].map(i => i + 1); entry.notes = ['層次面積表的樓層名稱依層數與總面積推得，請核對原件。']; }
      res.pageSources.push(entry);
    };
    const finish = () => {
      res.pages = res.pageSources.length;
      res.text = res.pageSources.map(p => p.text).join('\f');
      const sources = new Set(res.pageSources.map(p => p.source));
      res.mode = sources.size > 1 ? 'mixed' : (res.pageSources[0] || {}).source || 'text';
      res.ocrPages = res.pageSources.filter(p => p.source === 'ocr').length;
      res.score = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      return res;
    };
    const addLines = (no, cv, lines) => {
      const ff = floorFix(lines);
      addPage(no, 'ocr', lines.map(l => l.rawText), lines.flatMap((l, i) => l.needsReview || ff.flag.has(i) ? [i + 1] : []), ff.out);
      lines.forEach(l => { if (l.needsReview || KEY_LINE.test(l.text.replace(/\s/g, ''))) res.evidence.push({ page: no, source: 'ocr', rawText: l.rawText, text: l.text, needsReview: l.needsReview, score: l.score, crop: crop(cv, { x: l.x - 6, y: l.y - 4, w: l.w + 12, h: l.h + 8 }, 44) }); });
      lines.forEach(l => scores.push(l.score));
    };
    if (!isPdf) {
      await opt.ensureOcr();
      say('辨識照片…');
      const img = await new Promise((resolve, reject) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); resolve(im); }; im.onerror = () => { URL.revokeObjectURL(u); reject(new Error('照片無法讀取（iPhone 的 HEIC 檔請先改存成 JPG）')); }; im.src = u; });
      const k = Math.min(1, PAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight)), cv = mk(img.naturalWidth * k, img.naturalHeight * k);
      white(cv).drawImage(img, 0, 0, cv.width, cv.height);
      const r = await readCanvas(cv, { onStatus: say, onBox: (d, t) => opt.onProgress && opt.onProgress(d, t) });
      addLines(1, r.canvas, r.lines); res.thumbs[1] = thumb(r.canvas);
      res.angle = r.angle;
      if (r.canvas !== cv) r.canvas.width = r.canvas.height = 0; cv.width = cv.height = 0;
      return finish();
    }
    const pdfjs = opt.pdfjs, po = opt.pdfOpts || {};
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), cMapUrl: po.cMapUrl, cMapPacked: true, standardFontDataUrl: po.standardFontDataUrl, isEvalSupported: false, enableXfa: false }).promise;
    try {
      if (doc.numPages > 40) throw new Error('PDF 超過 40 頁，請分開上傳。');
      for (let no = 1; no <= doc.numPages; no++) {
        if (stop()) throw new Error('已取消');
        const page = await doc.getPage(no), tc = await page.getTextContent();
        const chars = tc.items.reduce((s, it) => s + String(it.str || '').replace(/\s/g, '').length, 0);
        if (chars >= 30 && !opt.forceOcr) {
          const items = tc.items.slice(), ir = await imageRows(page, pdfjs);
          if (ir.rows.length) {
            await opt.ensureOcr();
            say(`辨識第 ${no} 頁的姓名、統一編號、住址（電子謄本裡是圖片）…`);
            const vp = page.getViewport({ scale: ROW_SCALE }), cv = mk(vp.width, vp.height);
            await page.render({ canvasContext: white(cv), viewport: vp, intent: 'print' }).promise;
            for (const [i, r] of ir.rows.entries()) {
              const box = { x: r.x * ROW_SCALE, y: r.y * ROW_SCALE - 2, w: r.w * ROW_SCALE, h: r.h * ROW_SCALE + 4 };
              const rc = mk(box.w, box.h); white(rc).drawImage(cv, box.x, box.y, box.w, box.h, 0, 0, rc.width, rc.height);
              const bs = await ocrBoxes(rc, { maxSide: Math.max(rc.width, rc.height) });
              const baseline = ir.height - (r.y + r.h * 0.8);
              // 實際有一列圖卻沒有讀到文字時，也必須保留其行位置供核對。
              // 物件取代字元只用作版面定位，組成原文時會移除。
              if (!bs.length) items.push({ str: '', transform: [1, 0, 0, 12, r.x, baseline], width: r.w, emptyImage: true, needsReview: true });
              bs.forEach(b => {
                const needsReview = b.needsReview || b.h < rc.height * 0.35;
                items.push({ str: b.text, transform: [1, 0, 0, 12, r.x + b.x / ROW_SCALE, baseline], width: b.w / ROW_SCALE, needsReview });
                res.evidence.push({ page: no, source: 'mixed', rawText: b.text, text: b.text, needsReview, score: b.score, crop: crop(rc, { x: b.x - 4, y: 0, w: b.w + 8, h: rc.height }, 40), image: true });
                scores.push(b.score);
              });
              rc.width = rc.height = 0;
              if (opt.onProgress) opt.onProgress(i + 1, ir.rows.length);
            }
            res.thumbs[no] = thumb(cv); cv.width = cv.height = 0;
          }
          const group = window.HGTranscript.linesFromItems;
          const emptyImages = items.filter(it => it.emptyImage);
          let marker = '\uFFFC';
          if (emptyImages.length) {
            while (items.some(it => it.str && it.str.includes(marker))) marker += '\uFFFC';
            emptyImages.forEach(it => { it.str = marker; });
          }
          const lines = group(items), reviewLines = [];
          if (items.some(it => it.needsReview)) {
            // 保持相同座標和空白項目，只把每個框標為「需核對／其他」，可對應同一實體列。
            const marks = items.map(it => !it.str || !it.str.trim() ? it : { ...it, str: it.needsReview ? '!' : '.' });
            group(marks).forEach((line, i) => { if (line.includes('!')) reviewLines.push(i + 1); });
          }
          if (emptyImages.length) {
            for (const lineNo of reviewLines) lines[lineNo - 1] = lines[lineNo - 1].split(marker).join('');
          }
          addPage(no, ir.rows.length ? 'mixed' : 'text', lines, reviewLines);
        } else {
          await opt.ensureOcr();
          say(`辨識第 ${no}／${doc.numPages} 頁（掃描檔，每頁約 10～40 秒）…`);
          const v1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: PAGE_SIDE / Math.max(v1.width, v1.height) }), cv = mk(vp.width, vp.height);
          await page.render({ canvasContext: white(cv), viewport: vp, intent: 'print' }).promise;
          const r = await readCanvas(cv, { onStatus: say, onBox: (d, t) => opt.onProgress && opt.onProgress(d, t) });
          addLines(no, r.canvas, r.lines); res.thumbs[no] = thumb(r.canvas);
          if (r.canvas !== cv) r.canvas.width = r.canvas.height = 0; cv.width = cv.height = 0;
        }
      }
      return finish();
    } finally { try { await doc.destroy(); } catch (e) {} }
  }

  window.HGTranscriptOcr = { version: 'D18-2026-11-26', readFile, readCanvas, groupLines, floorFix, skewAngle, rotate, imageRows, fixLine, fixLines };
})();
