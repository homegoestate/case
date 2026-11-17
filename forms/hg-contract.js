/* hg-contract.js — 買賣契約書重點欄位辨識（Claude 2026-11-17）
 * 用 hg-ocr.js（電腦內辨識）讀掃描檔，依各家建經契約共同的版面規則找出：
 * 買賣總價款、第一～四期款、簽約日（立約日期）、履保銀行／戶名／專屬帳號。
 * 只產生「草稿＋可信度」，一律由同仁看截圖核對後才帶入；不會自動存檔。
 */
(function () {
  'use strict';
  const NUM = '0123456789,';
  const DAX = '零〇壹貳參叁肆伍陸柒捌玖拾佰仟萬億一二三四五六七八九十百千兩';
  const DIG = '0123456789';
  // 手寫大寫數字常被認成簡體或近形字：機率合併計算
  // （只放「不在允許字裡」的字；一二三、十百千本身就允許，不必合併）
  const ALIAS = { '貳': '贰弍式武', '參': '参', '佰': '伯', '萬': '万', '陸': '陆', '億': '亿', '仟': '什仔', '伍': '任', '零': '雲', '壹': '壱' };
  const MONEY_FIX = { '什': '仟', '仔': '仟', '任': '伍', '雲': '零', '式': '貳', '武': '貳', '伯': '佰', '贰': '貳', '参': '參', '万': '萬', '陆': '陸', '亿': '億' };
  const CN_D = { '零': 0, '〇': 0, '壹': 1, '一': 1, '貳': 2, '二': 2, '兩': 2, '參': 3, '叁': 3, '三': 3, '肆': 4, '四': 4, '伍': 5, '五': 5, '陸': 6, '六': 6, '柒': 7, '七': 7, '捌': 8, '八': 8, '玖': 9, '九': 9 };
  const CN_U = { '拾': 10, '十': 10, '佰': 100, '百': 100, '仟': 1000, '千': 1000 };
  const CN_B = { '萬': 1e4, '億': 1e8 };
  // 辨識程式偶爾輸出簡體或近形字：先換回繁體再判斷
  const FIX = { '贰': '貳', '叁': '參', '陆': '陸', '伯': '佰', '万': '萬', '亿': '億', '别': '別', '税': '稅', '号': '號', '国': '國', '银': '銀', '行': '行', '户': '戶', '帐': '帳', '专': '專', '属': '屬', '额': '額', '价': '價', '约': '約', '买': '買', '卖': '賣', '签': '簽', '款': '款', '尾': '尾', '时': '時', '间': '間', '证': '證', '经': '經', '台': '台' };
  const norm = s => String(s || '').replace(/[\s　]/g, '').split('').map(c => FIX[c] || c).join('');

  const FIELDS = [
    { key: 'totalPrice', name: '買賣總價款', kind: 'money' },
    { key: 'paymentContract', name: '第一期款（簽約款）', kind: 'money', period: 1 },
    { key: 'paymentSeal', name: '第二期款（用印款）', kind: 'money', period: 2 },
    { key: 'paymentTax', name: '第三期款（完稅款）', kind: 'money', period: 3 },
    { key: 'paymentBalance', name: '第四期款（尾款）', kind: 'money', period: 4 },
    { key: 'contractDate', name: '簽約日（立約日期）', kind: 'date' },
    { key: 'escrowBank', name: '履保銀行', kind: 'text' },
    { key: 'escrowName', name: '履保戶名', kind: 'text' },
    { key: 'escrowIdPrefix', name: '履保編號（前）', kind: 'text' },
    { key: 'escrowIdSuffix', name: '履保編號（後）', kind: 'digits' }
  ];
  const PERIOD_RE = { 1: /第[一1]期款?|簽約款/, 2: /第[二2]期款?|用印款|備證/, 3: /第[三3]期款?|完稅款/, 4: /第[四4]期款?|尾款/ };

  function parseChinese(s) {
    let total = 0, section = 0, num = 0, any = false;
    for (const ch of s) {
      if (ch in CN_D) { num = CN_D[ch]; any = true; }
      else if (ch in CN_U) { section += (num || 1) * CN_U[ch]; num = 0; any = true; }
      else if (ch in CN_B) { section += num; total += (section || 1) * CN_B[ch]; section = 0; num = 0; any = true; }
    }
    return any ? total + section + num : null;
  }
  // 金額文字 → 元；unitWan：表格寫「萬元」時，阿拉伯數字以萬計
  function parseMoney(text, unitWan) {
    const s = norm(text).split('').map(c => MONEY_FIX[c] || c).join('');
    const digits = (s.match(/[0-9][0-9,，.]*/g) || []).map(x => x.replace(/[,，.]/g, '')).sort((a, b) => b.length - a.length)[0];
    let n = null;
    if (digits && digits.length >= 1) {
      n = parseInt(digits, 10);
      if (/[0-9]萬/.test(s) || (unitWan && !/[萬億]/.test(s))) n *= 1e4;
    } else {
      const cn = s.replace(/[^零〇壹貳參叁肆伍陸柒捌玖拾佰仟萬億一二三四五六七八九十百千兩]/g, '');
      if (cn) n = parseChinese(cn);
      if (n != null && unitWan && !/[萬億]/.test(cn)) n *= 1e4;
    }
    return n && n > 0 && n < 1e11 ? n : null;
  }
  const wan = n => (n == null ? '' : String(Math.round(n / 100) / 100));   // 元 → 萬（最多兩位小數）
  const money = n => (n == null ? '' : n.toLocaleString('en-US'));

  const cy = b => b.y + b.h / 2;
  const right = b => b.x + b.w;
  const union = bs => {
    if (!bs.length) return null;
    const x0 = Math.min(...bs.map(b => b.x)), y0 = Math.min(...bs.map(b => b.y));
    const x1 = Math.max(...bs.map(right)), y1 = Math.max(...bs.map(b => b.y + b.h));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  const inRect = (b, r) => cy(b) >= r.y && cy(b) <= r.y + r.h && b.x + b.w * 0.5 >= r.x && b.x + b.w * 0.5 <= r.x + r.w;
  const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  // 看起來像金額（數字或大寫數字佔一半以上）；排除表格裡印刷的小標（例如「貸款支付」）
  const MONEY_CH = /[0-9,.，零〇壹貳參叁肆伍陸柒捌玖拾佰仟萬億一二三四五六七八九十百千兩贰伯万陆]/g;
  const looksMoney = t => { const s = String(t || ''); return s.length > 0 && (s.match(MONEY_CH) || []).length / s.length >= 0.5; };

  /* 讀一頁：先找所有文字行，長的段落只先讀開頭（找標題用），需要的再整行讀 */
  async function readPage(canvas, opt) {
    opt = opt || {};
    const O = window.HGOcr;
    const boxes = await O.detect(canvas, { maxSide: opt.detSide || 2000 });
    const H = median(boxes.map(b => b.h)) || 30;
    let done = 0;
    const NEED_FULL = /總價|新台幣|新臺幣|銀行|戶名|帳號|中華民國|期款|簽約款|用印|完稅|尾款|年|月|日/;
    const items = await Promise.all(boxes.map(async b => {
      const long = b.w / b.h > 16;
      let r = await O.recognize(canvas, b, long ? { maxChars: 14 } : {});
      let full = !long;
      if (long && NEED_FULL.test(norm(r.text))) { r = await O.recognize(canvas, b); full = true; }
      if (opt.onProgress) opt.onProgress(++done, boxes.length);
      return { x: b.x, y: b.y, w: b.w, h: b.h, text: norm(r.text), raw: r.text, score: r.score, full, chars: r.chars.filter(c => String(c.c).trim()) };
    }));
    return { items: items.filter(i => i.text), lineH: H, w: canvas.width, h: canvas.height };
  }

  /* 只留有墨水的範圍：去掉框內左右上下的空白（大片空白會讓辨識程式讀不出字）；
     整列或整欄幾乎都是墨水的（印刷底線、表格線）不算字 */
  function inkTrim(canvas, rect) {
    const x0 = Math.max(0, Math.floor(rect.x)), y0 = Math.max(0, Math.floor(rect.y));
    const w = Math.min(canvas.width - x0, Math.ceil(rect.w)), h = Math.min(canvas.height - y0, Math.ceil(rect.h));
    if (w < 4 || h < 4) return rect;
    const px = canvas.getContext('2d', { willReadFrequently: true }).getImageData(x0, y0, w, h).data;
    let sum = 0; const lum = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) { const v = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]; lum[i] = v; sum += v; }
    const thr = Math.min(170, sum / (w * h) - 45), ink = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) ink[i] = lum[i] < thr ? 1 : 0;
    const rowLine = new Uint8Array(h), colLine = new Uint8Array(w);
    for (let y = 0; y < h; y++) { let c = 0; for (let x = 0; x < w; x++) c += ink[y * w + x]; rowLine[y] = c > w * 0.6 ? 1 : 0; }
    for (let x = 0; x < w; x++) { let c = 0; for (let y = 0; y < h; y++) c += ink[y * w + x]; colLine[x] = c > h * 0.7 ? 1 : 0; }
    const colCnt = new Uint16Array(w), rowCnt = new Uint16Array(h);
    for (let y = 0; y < h; y++) { if (rowLine[y]) continue; for (let x = 0; x < w; x++) if (!colLine[x] && ink[y * w + x]) { colCnt[x]++; rowCnt[y]++; } }
    const minC = Math.max(1, Math.round(h * 0.03)), minR = Math.max(1, Math.round(w * 0.004));
    let L = 0, Rr = w - 1, T = 0, B = h - 1;
    while (L < w && colCnt[L] < minC) L++; while (Rr > L && colCnt[Rr] < minC) Rr--;
    while (T < h && rowCnt[T] < minR) T++; while (B > T && rowCnt[B] < minR) B--;
    if (L >= Rr || T >= B) return rect;
    const ih = B - T + 1, padX = Math.round(ih * 0.35), padY = Math.round(ih * 0.15);
    const nx = Math.max(x0, x0 + L - padX), ny = Math.max(y0, y0 + T - padY);
    return { x: nx, y: ny, w: Math.min(x0 + w, x0 + Rr + 1 + padX) - nx, h: Math.min(y0 + h, y0 + B + 1 + padY) - ny };
  }

  /* 依欄位種類讀一個區域（自動找到的或同仁框選的） */
  async function readValue(canvas, rect, kind, opt) {
    opt = opt || {};
    const O = window.HGOcr;
    if (!rect || rect.w < 4 || rect.h < 4) return null;
    const pad = Math.round(rect.h * 0.12), R0 = { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad), w: Math.min(canvas.width - Math.max(0, rect.x - pad), rect.w + pad * 2), h: Math.min(canvas.height - Math.max(0, rect.y - pad), rect.h + pad * 2) };
    const R = inkTrim(canvas, R0);
    if (kind === 'money') {
      const free = await O.recognize(canvas, R);
      const t = norm(free.text), nd = (t.match(/[0-9]/g) || []).length, nc = (t.match(/[零〇壹貳參叁肆伍陸柒捌玖拾佰仟萬億]/g) || []).length;
      const tries = nd >= nc ? [['num', NUM + (opt.unitWan ? '' : '萬')], ['cn', DAX]] : [['cn', DAX], ['num', NUM + '萬']];
      const res = [];
      for (const [k, allow] of tries) {
        const r = await O.recognize(canvas, R, { allow, alias: k === 'cn' ? ALIAS : null });
        const v = parseMoney(r.text, !!opt.unitWan);
        res.push({ k, text: r.text, score: r.score, value: v });
        if (v != null && r.score >= 0.85 && k === tries[0][0]) break;
      }
      const ok = res.filter(r => r.value != null).sort((a, b) => b.score - a.score)[0];
      const like = t ? (t.split('').map(c => MONEY_FIX[c] || c).join('').match(MONEY_CH) || []).length / t.length : 0;
      return ok ? { value: ok.value, text: ok.text, score: ok.score * (like >= 0.4 ? 1 : 0.6), form: ok.k, rect: R } : { value: null, text: t, score: 0, rect: R };
    }
    if (kind === 'digits') {
      // 先不限字讀一次：看起來不像數字（例如印刷字、污點）就降低可信度，避免硬讀出數字
      const fr = await O.recognize(canvas, R), ft = norm(fr.text), ratio = ft ? (ft.match(/[0-9]/g) || []).length / ft.length : 0;
      const r = await O.recognize(canvas, R, { allow: DIG + '-' });
      const v = r.text.replace(/[^0-9-]/g, '');
      return { value: v || null, text: r.text, score: r.score * (ratio >= 0.5 ? 1 : 0.5), rect: R };
    }
    if (kind === 'date') {
      const r = await O.recognize(canvas, R, { allow: DIG + '中華民國年月日./' });
      const m = r.text.match(/(\d{2,3})[年./](\d{1,2})[月./](\d{1,2})/);
      const v = m ? isoFromRoc(m[1], m[2], m[3]) : null;
      return { value: v, text: r.text, score: r.score, rect: R };
    }
    const r = await O.recognize(canvas, R);
    return { value: norm(r.text) || null, text: r.text, score: r.score, rect: R };
  }
  function isoFromRoc(y, m, d) {
    y = parseInt(y, 10); m = parseInt(m, 10); d = parseInt(d, 10);
    if (!(y >= 80 && y <= 200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    const pad = n => String(n).padStart(2, '0');
    return (y + 1911) + '-' + pad(m) + '-' + pad(d);
  }

  /* 從各頁辨識結果找欄位。pages：[{no, canvas, items, lineH}]；回傳 {key: {value, display, conf, note, page, rect}} */
  async function extract(pages, opt) {
    opt = opt || {};
    const out = {};
    const put = (key, v) => { if (!out[key] || (v.conf || 0) > (out[key].conf || 0)) out[key] = v; };
    const confOf = s => (s >= 0.9 ? 2 : s >= 0.7 ? 1 : 0);
    for (const pg of pages) {
      const it = pg.items, H = pg.lineH || 30, cv = pg.canvas;
      const isYuan = i => /^(萬)?元(整|正)?/.test(i.text) && i.w < H * 5;
      // ---- 各期款：「第N期款」標題欄＋同一格裡、「元整」左邊的手寫金額 ----
      const labels = [];
      for (const p of [1, 2, 3, 4]) {
        const cands = it.filter(i => PERIOD_RE[p].test(i.text) && i.text.length <= 8);
        if (cands.length) labels.push({ p, box: cands.sort((a, b) => a.x - b.x || a.y - b.y)[0] });
      }
      if (labels.length >= 2) {
        labels.sort((a, b) => a.box.y - b.box.y);
        const labelRight = median(labels.map(l => right(l.box)));
        const yuans = it.filter(i => isYuan(i) && i.x > labelRight - H && i.x < labelRight + H * 14);
        const yuanX = yuans.length ? median(yuans.map(i => i.x)) : labelRight + H * 8;
        for (const [n, l] of labels.entries()) {
          const top = l.box.y - H * 0.6, nextTop = n + 1 < labels.length ? labels[n + 1].box.y - H * 0.3 : l.box.y + H * 4;
          const cell = { x: labelRight + H * 0.2, y: top, w: Math.max(H, yuanX + H * 0.3 - labelRight), h: Math.max(H, nextTop - top) };
          const yuanHere = yuans.find(i => cy(i) >= cell.y && cy(i) <= cell.y + cell.h);
          const unitWan = !!(yuanHere && /^萬/.test(yuanHere.text));
          const vals = it.filter(i => inRect(i, cell) && !isYuan(i) && !PERIOD_RE[l.p].test(i.text) && !/[（(]/.test(i.text) && looksMoney(i.text));
          const rect = union(vals);
          const f = FIELDS.find(x => x.period === l.p);
          if (!rect) { put(f.key, { value: null, conf: 0, note: '找不到手寫金額，請框選', page: pg.no, rect: cell }); continue; }
          const v = await readValue(cv, rect, 'money', { unitWan });
          put(f.key, { value: v && v.value, text: v && v.text, conf: v && v.value != null ? confOf(v.score) : 0, score: v && v.score, page: pg.no, rect: v ? v.rect : rect, note: v && v.value == null ? '讀不出金額，請框選或直接輸入' : '' });
        }
      }
      // ---- 總價款：「總價款…新台幣」之後到「元整」之前 ----
      const tp = it.filter(i => /總價(款|金)?/.test(i.text) && i.full).sort((a, b) => a.y - b.y)[0];
      if (tp) {
        const rowTop = tp.y - H * 0.4, rowBot = tp.y + tp.h + H * 0.4;
        const sameRow = it.filter(i => i !== tp && cy(i) >= rowTop && cy(i) <= rowBot && i.x >= right(tp) - H * 0.5).sort((a, b) => a.x - b.x);
        const end = sameRow.find(i => /^(萬)?元/.test(i.text));
        let rect = union(sameRow.filter(i => (!end || i.x < end.x) && looksMoney(i.text)));
        let unitWan = !!(end && /^萬/.test(end.text)), merged = null;
        // 手寫字和印刷字連在同一行：從「新台幣／以下同」之後切出來
        if (!rect) {
          // 取最後一個「新台幣（以下同）：」或「總價款為／計：」之後的部分
          const ms = [...tp.text.matchAll(/新[台臺]幣(（以下同）|\(以下同\))?[：:]?|總價(款|金)?[為計：:]+/g)], m = ms[ms.length - 1];
          if (m && tp.chars && tp.chars.length === tp.text.length) {
            const idx = m.index + m[0].length, cs = tp.chars;
            const endIdx = tp.text.indexOf('元', idx);
            const tail = tp.text.slice(idx, endIdx > -1 ? endIdx : undefined);
            if (tail && looksMoney(tail)) {
              const tc = cs.slice(idx, endIdx > -1 ? endIdx : cs.length);
              const tf = tail.split('').map(c => MONEY_FIX[c] || c).join('');
              const purity = (tf.match(MONEY_CH) || []).length / tf.length;   // 夾雜非數字的字，可信度打折
              merged = { value: parseMoney(tail, unitWan), text: tail, score: tc.reduce((s, c) => s + c.p, 0) / tc.length * (purity < 1 ? 0.7 : 1) };
              if (endIdx > -1 && /^萬/.test(tp.text.slice(endIdx - 1))) unitWan = true;
            }
            // 從標題最後一個字（例如「：」）之後開始，避免手寫第一個字沒被讀到時把它切掉
            const x0 = idx > 0 ? cs[idx - 1].x + H * 0.45 : right(tp);
            const x1 = endIdx > -1 ? cs[endIdx].x - H * 0.45 : (end ? end.x - H * 0.35 : right(tp));
            if (x1 - x0 > H * 0.8) rect = { x: x0, y: tp.y, w: x1 - x0, h: tp.h };
          }
        }
        // 金額寫在下一行（例如「總價款（…含營業稅）：」換行後才是金額欄）
        if (!rect && !merged) {
          const nextRow = it.filter(i => i !== tp && i.y > tp.y + tp.h * 0.6 && cy(i) < tp.y + tp.h + H * 1.8 && i.x > tp.x - H).sort((a, b) => a.x - b.x);
          const end2 = nextRow.find(i => /^(萬)?元/.test(i.text));
          if (end2) { rect = union(nextRow.filter(i => i.x < end2.x && looksMoney(i.text))); unitWan = /^萬/.test(end2.text); }
        }
        const v = rect ? await readValue(cv, rect, 'money', { unitWan }) : null;
        let best = v && v.value != null ? { value: v.value, text: v.text, score: v.score, rect: v.rect } : null, note = '';
        if (merged && merged.value != null) {
          if (best && best.value === merged.value) best.score = Math.max(best.score, merged.score);
          else if (!best || merged.score > best.score) { if (best) note = `兩種讀法不同（${money(best.value)}／${money(merged.value)}），請核對`; best = { value: merged.value, text: merged.text, score: merged.score, rect: rect || tp }; }
          else note = `兩種讀法不同（${money(best.value)}／${money(merged.value)}），請核對`;
        }
        const alts = [v && v.value, merged && merged.value].filter((x, i, a) => x != null && a.indexOf(x) === i);
        if (best) put('totalPrice', { value: best.value, text: best.text, conf: note ? Math.min(1, confOf(best.score)) : confOf(best.score), score: best.score, page: pg.no, rect: best.rect, note, alts });
        else put('totalPrice', { value: null, conf: 0, note: rect ? '讀不出金額，請框選或直接輸入' : '找不到手寫金額，請框選', page: pg.no, rect: rect || { x: right(tp), y: tp.y, w: H * 10, h: tp.h } });
      }
      // ---- 履保：銀行別、戶名、專屬帳號（印刷字＋手寫後段） ----
      for (const i of it) {
        let m;
        // 印刷字沒有其他資料可對照，最多亮黃燈（銀行名稱另外和戶名比對）
        if ((m = i.text.match(/銀行別[：:](.+?)(（|\(|$)/)) && m[1].length >= 4) put('escrowBank', { value: m[1], conf: Math.min(1, confOf(i.score)), score: i.score, page: pg.no, rect: i });
        if ((m = i.text.match(/戶名[：:](.+?專戶)/))) put('escrowName', { value: m[1], conf: /銀行受託信託財產專戶$/.test(m[1]) ? confOf(i.score) : Math.min(1, confOf(i.score)), score: i.score, page: pg.no, rect: i });
        if ((m = i.text.match(/專屬帳號[：:]?([0-9][0-9-]*)/) || i.text.match(/帳號[：:]?([0-9]{5,6}-[0-9-]*)/))) {
          const printed = m[1], pm = printed.match(/^(\d{5,6}-)(.*)$/);
          const pre = pm ? pm[1] : printed, mid = pm ? pm[2] : '';
          put('escrowIdPrefix', { value: pre, conf: pm ? confOf(i.score) : Math.min(1, confOf(i.score)), score: i.score, page: pg.no, rect: i });
          const tail = it.filter(j => j !== i && Math.abs(cy(j) - cy(i)) < H * 0.6 && j.x > right(i) - H * 0.3 && j.x < right(i) + H * 6 && j.w < H * 14 && !/[（(]/.test(j.text)).sort((a, b) => a.x - b.x)[0];
          if (tail) {
            const v = await readValue(cv, tail, 'digits');
            put('escrowIdSuffix', { value: v && v.value ? mid + v.value : null, text: v && v.text, conf: v && v.value ? Math.min(1, confOf(v.score)) : 0, score: v && v.score, page: pg.no, rect: v ? v.rect : tail, note: v && v.value ? '帳號請逐碼核對' : '' });
          } else if (mid) put('escrowIdSuffix', { value: mid, conf: 1, note: '只讀到印刷的部分，手寫的後幾碼請框選', page: pg.no, rect: i });
        }
      }
      // ---- 簽約日：「中華民國 年 月 日」（取最後一頁、最下面的那一行）；年、月、日之間的數字分開讀 ----
      for (const i of it.filter(i => /中華民國/.test(i.text))) {
        const row = it.filter(j => Math.abs(cy(j) - cy(i)) < H * 0.7 && j.x >= i.x - H && j.x < i.x + H * 30).sort((a, b) => a.x - b.x);
        const dB = row.find(j => j.x > i.x && /日/.test(j.text));
        const span = union(row.filter(j => !dB || j.x <= dB.x));
        if (!span) continue;
        let y = null, mo = null, d = null, score = 1;
        const m0 = row.map(j => j.text).join('').match(/中華民國(\d{2,3})年(\d{1,2})月(\d{1,2})日/);
        const mk = ch => row.find(j => j !== i && j.x > i.x && new RegExp(ch + '$').test(j.text));
        const between = async (a, b) => {
          if (!a || !b || b.x <= right(a) - H * 0.3) return null;
          const inner = row.filter(j => j !== a && j !== b && j.x >= right(a) - H * 0.3 && right(j) <= b.x + H * 0.3);
          const r = union(inner) || { x: right(a), y: Math.min(a.y, b.y), w: b.x - right(a), h: Math.max(a.h, b.h) };
          const v = await readValue(cv, r, 'digits');
          if (!v || !v.value) return null;
          score = Math.min(score, v.score); return v.value.replace(/-/g, '');
        };
        const yB = mk('年'), mB = mk('月');
        if (yB && mB && dB) { y = await between(i, yB); mo = await between(yB, mB); d = await between(mB, dB); }
        if ((!y || !mo || !d) && m0) { [y, mo, d] = [m0[1], m0[2], m0[3]]; score = Math.min(...row.map(j => j.score)); }
        const iso = y && mo && d ? isoFromRoc(y, mo, d) : null;
        const cand = { value: iso, text: y ? `${y}年${mo || '?'}月${d || '?'}日` : '', conf: iso ? confOf(score) : 0, score, page: pg.no, rect: span, note: iso ? '' : '讀不出日期，請框選或直接輸入', _order: pg.no * 1e6 + i.y };
        if (!out.contractDate || cand._order > (out.contractDate._order || 0)) out.contractDate = cand;
      }
    }
    return crossCheck(out);
  }

  /* 合併多頁結果（可信度高的優先；簽約日取最後一頁、最下面那一行） */
  function merge(acc, add) {
    for (const [k, v] of Object.entries(add)) {
      const a = acc[k];
      if (k === 'contractDate') { if (!a || (v._order || 0) > (a._order || 0)) acc[k] = v; continue; }
      if (!a || (a.value == null && v.value != null) || ((v.value != null) && (v.conf || 0) > (a.conf || 0))) acc[k] = v;
    }
    return acc;
  }

  /* 交叉檢查：各期款加總＝總價（相符就全部亮綠燈；不符就標黃燈） */
  const PAY = ['paymentContract', 'paymentSeal', 'paymentTax', 'paymentBalance'];
  function crossCheck(out) {
    let t = out.totalPrice && out.totalPrice.value;
    const parts = PAY.map(k => out[k] && out[k].value).filter(v => v != null);
    if (t && parts.length >= 2) {
      const sum = parts.reduce((s, v) => s + v, 0);
      // 總價有兩種讀法、其中一種剛好等於各期款加總：選那一種
      if (sum !== t && parts.length === 4 && (out.totalPrice.alts || []).includes(sum)) { out.totalPrice.value = sum; out.totalPrice.picked = true; t = sum; }
      if (sum === t) ['totalPrice'].concat(PAY).forEach(k => { if (out[k] && out[k].value != null) { out[k].conf = 2; out[k].note = '各期款加總與總價相符'; } });
      else ['totalPrice'].concat(PAY).forEach(k => { if (out[k] && out[k].value != null) { out[k].conf = Math.min(out[k].conf, 1); out[k].note = `各期款加總 ${money(sum)} 元，與總價 ${money(t)} 元不符，請核對`; } });
      if (out.totalPrice.picked) out.totalPrice.note = '有兩種讀法，已選與各期款加總相符的那一個，請看截圖核對';
    }
    if (t) PAY.forEach(k => { if (out[k] && out[k].value != null && out[k].value > t) { out[k].conf = 0; out[k].note = '金額比總價還大，請核對'; } });
    // 履保銀行：和戶名裡的銀行名稱比對（印刷字偶爾漏字，例如「第一」的「一」）
    const nb = out.escrowName && out.escrowName.value && (String(out.escrowName.value).match(/^(.+?銀行)/) || [])[1];
    const bk = out.escrowBank && out.escrowBank.value && String(out.escrowBank.value).match(/^(.+?銀行)(.*)$/);
    if (nb && bk && !out.escrowBank._fixed) {
      if (bk[1] === nb) { out.escrowBank.conf = Math.max(out.escrowBank.conf, 1); out.escrowBank.note = ''; }
      else if (editDistance(bk[1], nb) <= 2) { out.escrowBank.value = nb + bk[2]; out.escrowBank._fixed = true; out.escrowBank.conf = 1; out.escrowBank.note = `銀行名稱依戶名校正（原讀為「${bk[1]}」），請核對`; }
    }
    return out;
  }
  function editDistance(a, b) {
    a = [...a]; b = [...b]; let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[b.length];
  }

  /* 金額 → 國字大寫（給同仁和合約上的大寫對照） */
  function toUpper(n) {
    n = Math.round(Number(n) || 0); if (n <= 0) return '';
    const D = '零壹貳參肆伍陸柒捌玖', U = ['', '拾', '佰', '仟'];
    const four = x => { let s = '', zero = false; for (let i = 3; i >= 0; i--) { const d = Math.floor(x / Math.pow(10, i)) % 10; if (d) { if (zero) s += '零'; s += D[d] + U[i]; zero = false; } else if (s) zero = true; } return s; };
    const yi = Math.floor(n / 1e8), wn = Math.floor(n / 1e4) % 1e4, rest = n % 1e4;
    let s = '';
    if (yi) s += four(yi) + '億';
    if (wn) s += (s && wn < 1000 ? '零' : '') + four(wn) + '萬'; else if (s && rest) s += '零';
    if (rest) s += ((s && !/零$/.test(s) && rest < 1000) ? '零' : '') + four(rest);
    return s + '元整';
  }

  window.HGContract = { FIELDS, readPage, readValue, inkTrim, extract, merge, crossCheck, parseMoney, parseChinese, isoFromRoc, toUpper, wan, money, norm };
})();
