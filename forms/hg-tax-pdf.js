/* Browser-side printing on official Tainan tax forms. */
(function (scope) {
  'use strict';
  const clean = value => String(value ?? '').trim();
  function dateParts(value) {
    const match = clean(value).match(/^(\d{1,4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (!match) return null;
    const roc = match[1].length === 4 ? Number(match[1]) - 1911 : Number(match[1]);
    const year = roc + 1911, month = Number(match[2]), day = Number(match[3]);
    const check = new Date(Date.UTC(year, month - 1, day));
    return roc > 0 && check.getUTCFullYear() === year && check.getUTCMonth() === month - 1
      && check.getUTCDate() === day ? [roc, month, day] : null;
  }
  const loads = new Map();
  function library(name, path) {
    if (scope[name]) return Promise.resolve(scope[name]);
    if (!loads.has(name)) {
      const promise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = path;
        script.onload = () => scope[name] ? resolve(scope[name]) : reject(new Error('無法啟用 ' + name));
        script.onerror = () => { script.remove(); reject(new Error('無法載入 ' + path)); };
        document.head.appendChild(script);
      });
      loads.set(name, promise.catch(e => { loads.delete(name); throw e; }));
    }
    return loads.get(name);
  }
  async function asset(path, hash) {
    const res = await fetch(path);
    if (!res.ok) throw new Error('載入失敗：' + path + '（' + res.status + '）');
    const data = await res.arrayBuffer();
    if (hash) {
      const digest = new Uint8Array(await scope.crypto.subtle.digest('SHA-256', data));
      if (Array.from(digest, b => b.toString(16).padStart(2, '0')).join('') !== hash) {
        throw new Error('臺南市稅務原表檔案指紋不符，已停止套印。');
      }
    }
    return data;
  }
  async function open(files) {
    const [pdfLib, fontkit, face, originals] = await Promise.all([
      library('PDFLib', 'forms/pdf-lib.min.js'), library('fontkit', 'forms/fontkit.umd.min.js'),
      asset('forms/NotoSansTC-Regular.ttf'), Promise.all(files.map(([path, hash]) => asset('forms/tax/' + path, hash)))
    ]);
    const pdf = await pdfLib.PDFDocument.load(originals[0]);
    const formPages = [pdf.getPage(0)];
    for (const bytes of originals.slice(1)) {
      const addition = await pdfLib.PDFDocument.load(bytes);
      const pages = await pdf.copyPages(addition, addition.getPageIndices());
      pages.forEach(p => pdf.addPage(p));
      formPages.push(pages[0]);
    }
    pdf.registerFontkit(fontkit);
    // Keep original glyph IDs. This fontkit build's subset can extract back to
    // the expected Unicode yet paint blank glyphs in printed Chinese forms.
    const font = await pdf.embedFont(face, { subset: false });
    const latin = await pdf.embedFont(pdfLib.StandardFonts.Helvetica);
    const charset = new Set(font.getCharacterSet());
    const ink = pdfLib.rgb(0.07, 0.14, 0.23);
    const page = pdf.getPage(0);
    // The CJK face substitutes alternate digits after Latin letters. Its PDF
    // width/map excludes those alternate glyphs; identifiers must keep their
    // original digits and stay inside the ID cell.
    function runs(text) {
      return (text.match(/[\x20-\x7e]+|[^\x20-\x7e]+/gu) || []).map(s => ({
        s, face: /^[\x20-\x7e]/.test(s) ? latin : font,
      }));
    }
    const widthOf = (s, size) => runs(s).reduce((n, run) => n + run.face.widthOfTextAtSize(run.s, size), 0);
    // Coordinates measured in PDF points from the top left. Wrap names and
    // addresses by glyph width. Never crop names, numeric identifiers or addresses.
    function write(target, value, left, top, width, height, label, size = 10, maxLines = 1) {
      const text = clean(value).replace(/\s+/gu, ' ');
      if (!text) return;
      const chars = [...text];
      const missing = chars.find(c => !charset.has(c.codePointAt(0)));
      if (missing) throw new Error(label + '含有字型未收錄的「' + missing + '」，請改用人工套表或手填。');
      // Prefer one complete line before wrapping. Fractions and addresses
      // otherwise split even when a small, readable reduction would fit.
      const sizes = [];
      for (let s = size; s >= 6; s -= 0.5) sizes.push(s);
      const single = sizes.find(s => widthOf(text, s) <= width && s * 1.18 <= height);
      for (const s of single ? [single] : sizes) {
        const lines = [];
        let line = '';
        for (const c of chars) {
          if (line && widthOf(line + c, s) > width) { lines.push(line); line = ''; }
          line += c;
        }
        lines.push(line);
        const gap = s * 1.18;
        if (lines.length > maxLines || lines.length * gap > height || lines.some(l => widthOf(l, s) > width)) continue;
        const base = top + (height - lines.length * gap) / 2 + s;
        lines.forEach((l, i) => {
          let x = left + (width - widthOf(l, s)) / 2;
          for (const run of runs(l)) {
            target.drawText(run.s, { x, y: target.getHeight() - base - i * gap, font: run.face, size: s, color: ink });
            x += run.face.widthOfTextAtSize(run.s, s);
          }
        });
        return;
      }
      throw new Error(label + '內容超過官方欄位可讀範圍，請另依原表格式補列。');
    }
    const cell = (...args) => write(page, ...args);
    function tick(x, t) {
      const point = (dx, dy) => ({x: x + dx, y: page.getHeight() - t - dy});
      page.drawLine({start: point(1.5, 4.3), end: point(4.0, 7.2), thickness: 1.35, color: ink});
      page.drawLine({start: point(4.0, 7.2), end: point(9.1, 0.6), thickness: 1.35, color: ink});
    }
    function markDraft(target, left = 29, top = 20) {
      target.drawText('草稿　待覆核', {x: left, y: target.getHeight() - top, font, size: 9, color: pdfLib.rgb(.47, .17, .13)});
    }
    return { pdf, page, formPages, cell, write, tick, markDraft };
  }
  scope.HGTaxPdf = Object.freeze({ open, dateParts });
})(typeof window === 'undefined' ? globalThis : window);
