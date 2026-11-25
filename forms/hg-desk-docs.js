/* 作業台 D15（Claude 2026-11-25）：私契（成屋買賣契約書）Word、房地合一稅試算與申報資料表、案件檔案包 ZIP。
   全部在瀏覽器內產生，不上傳。產出均為草稿，須經地政士審閱。 */
(function (root) {
  'use strict';
  const S = v => (v === null || v === undefined) ? '' : String(v).trim();
  const num = v => { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };
  const has = v => S(v) !== '';
  const money = n => Math.round(Number(n) || 0).toLocaleString('zh-TW');
  const BLANK = '＿＿＿＿';
  const or = (v, d) => has(v) ? S(v) : (d === undefined ? BLANK : d);
  const enc = new TextEncoder();

  /* ---------- ZIP（不壓縮，UTF-8 檔名） ---------- */
  const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files) {
    const now = new Date(), dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff,
      dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
    const recs = files.map(f => { const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data; return { name, data, crc: crc32(data) }; });
    let size = 0; recs.forEach(r => { size += 30 + r.name.length + r.data.length + 46 + r.name.length; }); size += 22;
    const out = new Uint8Array(size), v = new DataView(out.buffer); let p = 0; const central = [];
    for (const r of recs) {
      central.push({ r, off: p });
      v.setUint32(p, 0x04034b50, true); v.setUint16(p + 4, 20, true); v.setUint16(p + 6, 0x800, true); v.setUint16(p + 8, 0, true);
      v.setUint16(p + 10, dt, true); v.setUint16(p + 12, dd, true); v.setUint32(p + 14, r.crc, true); v.setUint32(p + 18, r.data.length, true); v.setUint32(p + 22, r.data.length, true);
      v.setUint16(p + 26, r.name.length, true); v.setUint16(p + 28, 0, true); out.set(r.name, p + 30); out.set(r.data, p + 30 + r.name.length); p += 30 + r.name.length + r.data.length;
    }
    const cstart = p;
    for (const { r, off } of central) {
      v.setUint32(p, 0x02014b50, true); v.setUint16(p + 4, 20, true); v.setUint16(p + 6, 20, true); v.setUint16(p + 8, 0x800, true); v.setUint16(p + 10, 0, true);
      v.setUint16(p + 12, dt, true); v.setUint16(p + 14, dd, true); v.setUint32(p + 16, r.crc, true); v.setUint32(p + 20, r.data.length, true); v.setUint32(p + 24, r.data.length, true);
      v.setUint16(p + 28, r.name.length, true); v.setUint16(p + 30, 0, true); v.setUint16(p + 32, 0, true); v.setUint16(p + 34, 0, true); v.setUint16(p + 36, 0, true); v.setUint32(p + 38, 0, true);
      v.setUint32(p + 42, off, true); out.set(r.name, p + 46); p += 46 + r.name.length;
    }
    v.setUint32(p, 0x06054b50, true); v.setUint16(p + 8, recs.length, true); v.setUint16(p + 10, recs.length, true); v.setUint32(p + 12, p - cstart, true); v.setUint32(p + 16, cstart, true);
    return out;
  }

  /* ---------- Word（.docx）：段落與表格，標楷體 A4 ---------- */
  const x = s => S(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const run = (text, o = {}) => {
    const rpr = (o.bold ? '<w:b/>' : '') + (o.size ? `<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>` : '');
    return String(text ?? '').split('\n').map((line, i) => (i ? '<w:r><w:br/></w:r>' : '') + `<w:r>${rpr ? '<w:rPr>' + rpr + '</w:rPr>' : ''}<w:t xml:space="preserve">${x(line)}</w:t></w:r>`).join('');
  };
  const para = (text, o = {}) => `<w:p><w:pPr>${o.center ? '<w:jc w:val="center"/>' : o.right ? '<w:jc w:val="right"/>' : '<w:jc w:val="both"/>'}<w:spacing w:before="${o.before || 0}" w:after="${o.after ?? 60}" w:line="360" w:lineRule="auto"/>${o.indent ? `<w:ind w:left="${o.indent}" w:hanging="${o.hanging || 0}"/>` : ''}</w:pPr>${run(text, o)}</w:p>`;
  const table = (rows, widths) => {
    const total = 9638, ws = widths || rows[0].map(() => Math.floor(total / rows[0].length));
    const b = '<w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/>';
    return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblBorders>${b}</w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${ws.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>` +
      rows.map((r, ri) => '<w:tr>' + r.map((c, ci) => `<w:tc><w:tcPr><w:tcW w:w="${ws[ci]}" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${run(c, { bold: ri === 0 })}</w:p></w:tc>`).join('') + '</w:tr>').join('') + '</w:tbl>' + para('', { after: 60 });
  };
  function docx(blocks) {
    const body = blocks.map(b => b.t === 'table' ? table(b.rows, b.widths) : b.t === 'h' ? para(b.text, { bold: true, size: 36, center: true, after: 200 }) :
      b.t === 'h2' ? para(b.text, { bold: true, size: 26, before: 160, after: 80 }) : para(b.text, b)).join('');
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="標楷體" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US" w:eastAsia="zh-TW"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`;
    return zip([
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
      { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'word/document.xml', data: doc },
      { name: 'word/styles.xml', data: styles }
    ]);
  }
  /* 同一份內容的 HTML（預覽、列印成 PDF） */
  function html(blocks, title) {
    const h = s => S(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    const body = blocks.map(b => b.t === 'table' ? '<table>' + b.rows.map((r, i) => '<tr>' + r.map(c => (i ? '<td>' : '<th>') + h(c) + (i ? '</td>' : '</th>')).join('') + '</tr>').join('') + '</table>' :
      b.t === 'h' ? `<h1>${h(b.text)}</h1>` : b.t === 'h2' ? `<h2>${h(b.text)}</h2>` : `<p class="${b.center ? 'c' : b.right ? 'r' : ''}${b.indent ? ' i' : ''}">${b.bold ? '<b>' : ''}${h(b.text)}${b.bold ? '</b>' : ''}</p>`).join('');
    return `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><title>${h(title)}</title><style>@page{size:A4;margin:2cm}body{font-family:"標楷體","DFKai-SB","BiauKai","Noto Serif TC",serif;font-size:12pt;line-height:1.75;color:#000;max-width:17cm;margin:0 auto;padding:12px}h1{text-align:center;font-size:18pt;margin:0 0 12px}h2{font-size:13pt;margin:14px 0 4px}p{margin:0 0 4px;text-align:justify}p.c{text-align:center}p.r{text-align:right}p.i{padding-left:2em;text-indent:-2em}table{border-collapse:collapse;width:100%;margin:4px 0 8px}td,th{border:1px solid #000;padding:3px 6px;font-size:11pt;vertical-align:top}th{background:#f2f2f2}.bar{position:sticky;top:0;background:#fff;padding:6px 0;border-bottom:1px solid #ccc;margin-bottom:10px;font-family:sans-serif;font-size:13px}@media print{.bar{display:none}}</style></head><body><div class="bar"><button onclick="print()">列印／另存 PDF</button>　草稿，請地政士審閱後使用</div>${body}</body></html>`;
  }

  /* ---------- 案件資料整理 ---------- */
  const people = arr => (Array.isArray(arr) ? arr : []).filter(p => p && has(p.name) && p.role !== '代理人');
  const rocDate = iso => { const m = S(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `中華民國 ${Number(m[1]) - 1911} 年 ${Number(m[2])} 月 ${Number(m[3])} 日` : `中華民國 ${BLANK} 年 ${BLANK} 月 ${BLANK} 日`; };
  const wan = v => has(v) && num(v) ? num(v) * 10000 : 0;
  function propLines(props) {
    const out = { lands: [], builds: [], commons: [] };
    (Array.isArray(props) ? props : []).forEach(p => {
      const seat = `${S(p.city)}${S(p.district)}${has(p.section) ? S(p.section).replace(/段$/, '') + '段' : ''}${has(p.subSection) ? S(p.subSection).replace(/小段$/, '') + '小段' : ''}`;
      if (p.kind === '土地') out.lands.push(`${seat || BLANK}${or(p.number)}地號，面積 ${or(p.area)} 平方公尺，權利範圍 ${or(p.transferShare)}。`);
      else if (p.common) out.commons.push(`共有部分：${seat}${or(p.number)}建號（屬主建號 ${or(p.commonOf)}），權利範圍 ${or(p.transferShare)}。`);
      else out.builds.push(`${seat}${or(p.number)}建號，門牌 ${or(p.address)}，主建物等面積合計 ${or(p.mainArea)} 平方公尺${has(p.attachedArea) ? `、附屬建物 ${S(p.attachedArea)} 平方公尺` : ''}，權利範圍 ${or(p.transferShare)}。`);
    });
    return out;
  }
  const PAY = [['訂金', 'paymentDeposit', 'depositDate'], ['簽約款', 'paymentContract', 'contractDate'], ['用印款', 'paymentSeal', 'sealDate'], ['完稅款', 'paymentTax', 'taxDate'], ['尾款', 'paymentBalance', 'closingDate'], ['交屋款', 'paymentHandover', 'handoverDate']];

  /* ---------- 私契：成屋買賣契約書（依內政部成屋買賣定型化契約應記載事項之架構，宏國自擬草稿） ---------- */
  function saleContractCheck(w) {
    const miss = [], sellers = people(w.sellers), buyers = people(w.buyers), props = Array.isArray(w.v50Props) ? w.v50Props : [];
    if (!sellers.length) miss.push('賣方'); if (!buyers.length) miss.push('買方');
    if (!props.length) miss.push('標的明細');
    if (!num(w.totalPrice)) miss.push('成交總價');
    [...sellers, ...buyers].forEach(p => { if (!has(p.ledgerId)) miss.push(p.name + ' 證號'); if (!has(p.ledgerHome)) miss.push(p.name + ' 地址'); });
    const paySum = PAY.reduce((s, [, k]) => s + wan(w[k]), 0), total = wan(w.totalPrice);
    const warn = [];
    if (paySum && total && Math.round(paySum) !== Math.round(total)) warn.push(`各期款合計 ${money(paySum)} 元與總價 ${money(total)} 元不同`);
    return { miss, warn };
  }
  function saleContract(w, opt) {
    w = w || {}; opt = opt || {};
    const pc = (w.v50Reg && w.v50Reg.pc) || {}, sellers = people(w.sellers), buyers = people(w.buyers), pl = propLines(w.v50Props);
    const sN = sellers.map(p => p.name).join('、') || BLANK, bN = buyers.map(p => p.name).join('、') || BLANK;
    const total = wan(w.totalPrice), loan = wan(w.loanPrice), pct = has(pc.penaltyPct) ? num(pc.penaltyPct) : 15;
    const scrivener = S(w.ledgerAgent) || S(w.ledgerRegistrationAgent) || S(opt.scrivener) || BLANK;
    const B = [];
    const p = (text, o) => B.push(Object.assign({ t: 'p', text }, o || {}));
    B.push({ t: 'h', text: '成屋買賣契約書' });
    p(`契約審閱期間：本契約於 ${has(pc.reviewDate) ? rocDate(pc.reviewDate) : rocDate('')} 經買方攜回審閱（審閱期間至少五日）。買方簽章：${BLANK}`);
    p(`立契約書人　賣方：${sN}（以下簡稱甲方）　買方：${bN}（以下簡稱乙方），茲就下列不動產買賣事宜，雙方同意訂定本契約，條款如下：`);
    B.push({ t: 'h2', text: '第一條　買賣標的' });
    p('一、土地標示：', {}); (pl.lands.length ? pl.lands : [BLANK]).forEach((l, i) => p(`　（${i + 1}）${l}`, { indent: 480, hanging: 480 }));
    p('二、建物標示：'); (pl.builds.length ? pl.builds : ['無']).forEach((l, i) => p(`　（${i + 1}）${l}`, { indent: 480, hanging: 480 }));
    pl.commons.forEach(l => p('　' + l, { indent: 480, hanging: 480 }));
    p(`三、車位：${has(pc.parking) ? S(pc.parking) : '□無　□有，種類、編號、位置及權利範圍：' + BLANK}。`);
    p('前項標的以地政機關登記簿記載為準，雙方已核閱土地、建物登記謄本。');
    B.push({ t: 'h2', text: '第二條　買賣價款' });
    p(`本契約買賣總價款為新臺幣 ${total ? money(total) : BLANK} 元整${has(pc.landPrice) || has(pc.buildPrice) ? `，其中土地價款 ${has(pc.landPrice) ? money(num(pc.landPrice)) : BLANK} 元、建物價款 ${has(pc.buildPrice) ? money(num(pc.buildPrice)) : BLANK} 元` : ''}。`);
    B.push({ t: 'h2', text: '第三條　付款約定' });
    const rows = [['期別', '金額（新臺幣元）', '約定時間或條件']];
    PAY.forEach(([label, k, dk]) => { const a = wan(w[k]); if (a || label !== '訂金') rows.push([label, a ? money(a) : '', has(w[dk]) ? rocDate(w[dk]).replace('中華民國 ', '') : (label === '完稅款' ? '稅單核下時' : label === '交屋款' ? '點交同時' : label === '用印款' ? '備齊過戶文件用印時' : '')]); });
    B.push({ t: 'table', rows, widths: [1800, 3000, 4838] });
    p(has(w.escrowBank) ? `乙方應將各期價款存入 ${S(w.escrowBank)} 之履約保證專戶${has(w.escrowName) ? '（' + S(w.escrowName) + '）' : ''}，依履約保證約定撥付甲方。` : `價金交付方式：${BLANK}（如採履約保證，載明受託銀行及專戶）。`);
    B.push({ t: 'h2', text: '第四條　貸款約定' });
    p(loan ? `乙方預定向金融機構貸款新臺幣 ${money(loan)} 元支付部分價款，甲方應配合辦理抵押權設定等手續。貸款核定金額不足時，不足部分由乙方以現金補足；但因可歸責於甲方之事由致無法貸款者，依第九條處理。` : '乙方不辦理貸款；如需貸款，雙方另以書面約定。');
    B.push({ t: 'h2', text: '第五條　所有權移轉登記' });
    p(`雙方同意委由地政士 ${scrivener} 辦理所有權移轉登記、稅捐申報及實價登錄。甲乙雙方應於用印期日前備齊所需證件並配合用印。本標的應於完稅款付清後辦理移轉登記。`);
    B.push({ t: 'h2', text: '第六條　稅費負擔' });
    p('一、土地增值稅、交屋日前之地價稅與房屋稅、抵押權塗銷費用及甲方應負擔之房地合一所得稅，由甲方負擔。');
    p('二、契稅、印花稅、移轉登記規費、書狀費、抵押權設定費用及交屋日後之稅費，由乙方負擔。');
    p('三、地政士代辦費用依雙方與地政士之約定分別負擔。地價稅、房屋稅以交屋日為準，按當年度實際天數比例分算。');
    B.push({ t: 'h2', text: '第七條　產權擔保' });
    p('甲方擔保本標的產權清楚，無一物數賣、被他人占用或占用他人土地、查封或其他權利糾紛。設有抵押權者，甲方應於交屋前（或以價金清償後）辦理塗銷。');
    B.push({ t: 'h2', text: '第八條　點交' });
    p(`本標的應於 ${has(w.handoverDate) ? rocDate(w.handoverDate) : '尾款付清之同時'} 點交。點交時甲方應交付鑰匙及約定之設備，並結清水電、瓦斯、管理費等費用。${has(pc.handoverNote) ? S(pc.handoverNote) : ''}`);
    B.push({ t: 'h2', text: '第九條　違約處罰' });
    p(`任一方違約經他方以書面催告仍不履行者，他方得解除契約。甲方違約時，應返還已收價款並另給付違約金；乙方違約時，甲方得沒收已付價款作為違約金。違約金以房地總價款百分之 ${pct} 為限${pct > 15 ? '（注意：依內政部規定不得超過百分之十五）' : ''}。`);
    B.push({ t: 'h2', text: '第十條　其他約定' });
    (has(pc.other) ? S(pc.other).split(/\n+/) : [BLANK]).forEach((l, i) => p(`${i + 1}、${l}`, { indent: 480, hanging: 480 }));
    B.push({ t: 'h2', text: '第十一條　爭議處理與契約分存' });
    p('因本契約發生之爭議，雙方同意依誠信原則協商，或依鄉鎮市調解、仲裁或訴訟處理，並以本標的所在地之地方法院為第一審管轄法院。本契約一式＿份，雙方及地政士各執一份為憑。');
    B.push({ t: 'h2', text: '立契約書人' });
    const sig = [['身分', '姓名', '身分證統一編號', '地址', '電話', '簽章']];
    sellers.forEach(x => sig.push(['賣方', x.name, S(x.ledgerId), S(x.ledgerHome), S(x.phone), '']));
    buyers.forEach(x => sig.push(['買方', x.name, S(x.ledgerId), S(x.ledgerHome), S(x.phone), '']));
    sig.push(['地政士', scrivener, '', '', '', '']);
    B.push({ t: 'table', rows: sig, widths: [900, 1300, 1700, 3238, 1300, 1200] });
    p(rocDate(w.contractDate), { center: true, before: 200 });
    p('（本契約為作業台依案件資料產生之草稿，條款依內政部成屋買賣定型化契約應記載及不得記載事項架構擬定，正式使用前應經地政士審閱並依個案修改。）', { size: 20 });
    return B;
  }

  /* ---------- 房地合一稅（個人，所得稅法第14條之4、第14條之5、第4條之5） ---------- */
  const addYears = (d, n) => new Date(d.getFullYear() + n, d.getMonth(), d.getDate());
  const toDate = s => { const m = S(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  function houseLandTax(i) {
    i = i || {};
    const out = { ok: false, notes: [], steps: [] };
    const acq = toDate(i.acquireDate), sale = toDate(i.saleDate);
    if (!acq || !sale) { out.notes.push('請填取得日與交易日（完成移轉登記日）。'); return out; }
    if (sale < acq) { out.notes.push('交易日早於取得日，請檢查日期。'); return out; }
    if (!(num(i.price) > 0)) { out.notes.push('請填成交價額（可按「從本案帶入」）。'); return out; }
    if (acq < new Date(2016, 0, 1) && !(acq >= new Date(2014, 0, 2) && sale <= addYears(acq, 2)))
      out.notes.push('105年1月1日前取得者原則適用舊制（房屋交易所得併入綜合所得稅），本試算僅供參考。');
    const price = num(i.price), cost = num(i.cost), fee = num(i.fee), gain = num(i.landGain);
    const income = price - cost - fee, base = income - gain;
    const resident = i.resident !== false && i.resident !== 'no';
    let rate, label;
    if (resident) {
      if (sale <= addYears(acq, 2)) { rate = 0.45; label = '持有 2 年以內'; }
      else if (sale <= addYears(acq, 5)) { rate = 0.35; label = '超過 2 年未逾 5 年'; }
      else if (sale <= addYears(acq, 10)) { rate = 0.20; label = '超過 5 年未逾 10 年'; }
      else { rate = 0.15; label = '超過 10 年'; }
    } else { rate = sale <= addYears(acq, 2) ? 0.45 : 0.35; label = sale <= addYears(acq, 2) ? '非境內居住者，持有 2 年以內' : '非境內居住者，超過 2 年'; }
    const days = Math.round((sale - acq) / 86400000);
    out.steps.push(['成交價額', price], ['減：原始取得成本', cost], ['減：取得、改良及移轉費用', fee], ['所得額', income], ['減：土地漲價總數額', gain], ['課稅所得', Math.max(0, base)]);
    let tax = 0, exempt = 0;
    if (base > 0) {
      if (resident && (i.selfUse === true || i.selfUse === 'yes')) { exempt = Math.min(base, 4000000); tax = Math.max(0, base - 4000000) * 0.10; label += '；自住房地 400 萬元以內免稅，超過部分 10%'; rate = 0.10; }
      else tax = base * rate;
    } else out.notes.push('課稅所得為 0 或虧損，仍應於期限內申報。');
    Object.assign(out, { ok: true, days, years: (days / 365.25).toFixed(1), rate, label, income, base: Math.max(0, base), exempt, tax: Math.round(tax), resident });
    if (i.feeEstimated) out.notes.push('費用採估算（未能提出證明時由稽徵機關依財政部核定標準核定，實務常見為成交價 3%、最高 30 萬元），以國稅局核定為準。');
    if (i.acquireWay === '繼承' || i.acquireWay === '受贈') out.notes.push('繼承、受贈取得之成本與持有期間有特別規定（所得稅法第14條之4），請依國稅局規定核對。');
    out.notes.push('申報期限：完成所有權移轉登記日之次日起 30 日內（所得稅法第14條之5）。');
    return out;
  }
  function houseLandBlocks(w, i, r, who) {
    const B = [], p = (text, o) => B.push(Object.assign({ t: 'p', text }, o || {}));
    B.push({ t: 'h', text: '個人房屋土地交易所得稅　申報資料表（試算）' });
    p(`案件：${S(w.propertyName) || S(w.address) || BLANK}　　出售人：${S(who) || BLANK}`);
    B.push({ t: 'table', rows: [['項目', '內容'], ['取得原因', S(i.acquireWay) || BLANK], ['取得日', S(i.acquireDate) || BLANK], ['交易日（完成移轉登記日）', S(i.saleDate) || BLANK],
      ['持有期間', r.ok ? `${r.days} 日（約 ${r.years} 年）` : BLANK], ['身分', r.resident === false ? '非中華民國境內居住之個人' : '中華民國境內居住之個人'], ['自住房地優惠', (i.selfUse === true || i.selfUse === 'yes') ? '申請適用（請核對第4條之5條件）' : '未申請']], widths: [3400, 6238] });
    B.push({ t: 'h2', text: '試算' });
    B.push({ t: 'table', rows: [['項目', '金額（元）'], ...(r.steps || []).map(([k, v]) => [k, money(v)]), ['適用稅率', r.ok ? `${Math.round(r.rate * 100)}%（${r.label}）` : ''], ['自住免稅額', money(r.exempt || 0)], ['應納稅額（試算）', r.ok ? money(r.tax) : '']], widths: [5000, 4638] });
    B.push({ t: 'h2', text: '說明' });
    (r.notes || []).forEach(n => p('・' + n, { indent: 360, hanging: 240 }));
    p('・自住房地優惠條件：個人或其配偶、未成年子女辦竣戶籍登記、持有並居住該房屋連續滿六年；交易前六年內無出租、供營業或執行業務使用；交易前六年內未曾適用（所得稅法第4條之5第1項第1款）。', { indent: 360, hanging: 240 });
    p('・本表為作業台試算草稿，供承辦與客戶核對及網路申報填寫參考，實際稅額以稽徵機關核定為準。', { indent: 360, hanging: 240 });
    return B;
  }

  /* ---------- D16 繼承：應繼分（民法第1138、1139、1140、1144條）、繼承系統表、遺產分割協議書 ---------- */
  const gcd = (a, b) => b ? gcd(b, a % b) : Math.abs(a);
  const frac = (n, d) => { const g = gcd(n, d) || 1; return [n / g, d / g]; };
  const fmul = (a, b) => frac(a[0] * b[0], a[1] * b[1]);
  const fstr = f => f[0] === f[1] ? '全部' : `${f[1]}分之${f[0]}`;
  const ORDER = { '子女': 1, '代位（孫子女）': 1, '父母': 2, '兄弟姊妹': 3, '祖父母': 4 };
  function inheritShares(heirs) {
    const list = (Array.isArray(heirs) ? heirs : []).filter(h => h && has(h.name));
    const alive = h => !h.status || h.status === '現存';
    const spouse = list.filter(h => h.relation === '配偶' && alive(h));
    const res = new Map(), notes = [];
    // 第一順位：子女；已死亡或拋棄的子女，由其直系卑親屬代位（拋棄者不代位）
    const kids = list.filter(h => h.relation === '子女');
    const stocks = [];
    kids.forEach(k => {
      if (alive(k)) stocks.push({ heads: [k.name] });
      else if (k.status === '死亡') { const reps = list.filter(h => h.relation === '代位（孫子女）' && S(h.of) === S(k.name) && alive(h)).map(h => h.name); if (reps.length) stocks.push({ heads: reps }); else notes.push(`${k.name} 已死亡且無代位繼承人，不列入。`); }
      else notes.push(`${k.name} ${k.status}，不列入。`);
    });
    list.filter(h => h.relation === '代位（孫子女）' && !kids.some(k => S(k.name) === S(h.of))).forEach(h => notes.push(`${h.name} 的代位對象「${S(h.of) || '未填'}」不在子女名單內，請核對。`));
    let order = 0, group = [];
    if (stocks.length) { order = 1; group = stocks; }
    else for (const [rel, o] of [['父母', 2], ['兄弟姊妹', 3], ['祖父母', 4]]) { const g = list.filter(h => h.relation === rel && alive(h)).map(h => ({ heads: [h.name] })); if (g.length) { order = o; group = g; break; } }
    let spouseShare = [0, 1];
    if (spouse.length > 1) notes.push('配偶只能有一位，請核對。');
    if (spouse.length) spouseShare = !order ? [1, 1] : order === 1 ? frac(1, group.length + 1) : order === 4 ? [2, 3] : [1, 2];
    const rest = spouse.length ? frac(spouseShare[1] - spouseShare[0], spouseShare[1]) : [1, 1];
    if (spouse.length) res.set(spouse[0].name, spouseShare);
    if (order) {
      const each = order === 1 && spouse.length ? spouseShare : frac(rest[0], rest[1] * group.length);
      group.forEach(g => g.heads.forEach(n => res.set(n, fmul(each, [1, g.heads.length]))));
    }
    if (!res.size) notes.push('沒有可繼承的人，請核對繼承人資料。');
    return { order, shares: [...res.entries()].map(([name, f]) => ({ name, share: fstr(f), frac: f })), notes };
  }
  function inheritBlocks(w) {
    const inh = (w.v50Reg && w.v50Reg.inh) || {}, d = inh.decedent || {}, heirs = (inh.heirs || []).filter(h => has(h.name)), calc = inheritShares(heirs);
    const shareOf = n => (calc.shares.find(s => s.name === n) || {}).share || '';
    const B = [{ t: 'h', text: '繼　承　系　統　表' }];
    B.push({ t: 'table', rows: [['被繼承人', '出生日期', '死亡日期', '身分證統一編號', '死亡時住所'], [or(d.name), or(d.birth), or(d.death), or(d.id), or(d.address)]], widths: [1600, 1500, 1500, 1900, 3138] });
    B.push({ t: 'h2', text: '繼承人' });
    const rows = [['稱謂', '姓名', '出生日期', '身分證統一編號', '狀態', '應繼分', '備註']];
    heirs.forEach(h => rows.push([h.relation === '代位（孫子女）' ? `代位（${S(h.of)}之子女）` : S(h.relation), h.name, S(h.birth), S(h.id), S(h.status) || '現存', shareOf(h.name), S(h.note)]));
    B.push({ t: 'table', rows, widths: [1400, 1300, 1200, 1700, 1100, 1100, 1838] });
    calc.notes.forEach(n => B.push({ t: 'p', text: '・' + n, size: 20 }));
    B.push({ t: 'p', text: '本系統表由申請人依民法有關規定自行訂定，如有遺漏或錯誤致他人受損害者，申請人願負法律責任。', before: 160, bold: true });
    B.push({ t: 'p', text: `申請人：${or(inh.applicant)}（簽名）` , before: 160 });
    B.push({ t: 'p', text: rocDate(inh.date), right: true, before: 120 });
    B.push({ t: 'p', text: '（土地登記規則第119條第4項。應繼分依民法第1138、1139、1140、1144條試算，拋棄繼承、死亡者不列入；請核對戶籍資料後使用。）', size: 20 });
    return B;
  }
  function partitionBlocks(w) {
    const inh = (w.v50Reg && w.v50Reg.inh) || {}, d = inh.decedent || {}, heirs = (inh.heirs || []).filter(h => has(h.name) && (!h.status || h.status === '現存'));
    const props = Array.isArray(w.v50Props) ? w.v50Props : [], alloc = Array.isArray(inh.alloc) ? inh.alloc : [];
    const B = [{ t: 'h', text: '遺產分割協議書' }];
    const p = (text, o) => B.push(Object.assign({ t: 'p', text }, o || {}));
    p(`立協議書人 ${heirs.map(h => h.name).join('、') || BLANK} 為被繼承人 ${or(d.name)}（${has(d.death) ? '民國 ' + S(d.death) + ' 死亡' : '死亡日期 ' + BLANK}）之全體繼承人，茲就被繼承人所遺下列遺產，經全體繼承人協議分割如下：`);
    B.push({ t: 'h2', text: '一、遺產分割方式' });
    const rows = [['項次', '遺產標示', '權利範圍', '分割取得人', '取得權利範圍']];
    const pl = propLines(props), lineOf = (pp) => pp.kind === '土地' ? `${S(pp.district)}${S(pp.section)}段${has(pp.subSection) ? S(pp.subSection) + '小段' : ''}${S(pp.number)}地號` : `${S(pp.district)}${S(pp.section)}段${S(pp.number)}建號${has(pp.address) ? '（' + S(pp.address) + '）' : ''}`;
    props.forEach((pp, i) => { const a = alloc.filter(x => +x.prop === i && has(x.heir)); if (!a.length) rows.push([String(i + 1), lineOf(pp), or(pp.transferShare), BLANK, BLANK]); else a.forEach((x, j) => rows.push([j ? '' : String(i + 1), j ? '' : lineOf(pp), j ? '' : or(pp.transferShare), x.heir, or(x.share, '全部')])); });
    if (!props.length) rows.push(['1', BLANK, BLANK, BLANK, BLANK]);
    B.push({ t: 'table', rows, widths: [700, 3800, 1300, 1900, 1938] });
    void pl;
    B.push({ t: 'h2', text: '二、其他約定' });
    (has(inh.other) ? S(inh.other).split(/\n+/) : ['被繼承人之存款、債務及其他遺產，另依全體繼承人協議辦理。']).forEach((l, i) => p(`${i + 1}、${l}`, { indent: 480, hanging: 480 }));
    p('三、本協議書經全體繼承人同意，各自簽名並蓋用印鑑章，一式　份，各執一份為憑。');
    B.push({ t: 'h2', text: '立協議書人' });
    const sig = [['繼承人', '身分證統一編號', '住址', '簽名及印鑑章']];
    heirs.forEach(h => sig.push([h.name, S(h.id), S(h.address), '']));
    B.push({ t: 'table', rows: sig, widths: [1600, 2000, 3838, 2200] });
    p(rocDate(inh.date), { center: true, before: 200 });
    p('（作業台依案件資料產生之草稿。分割繼承登記須全體繼承人簽名並蓋印鑑章、檢附印鑑證明；請地政士審閱後使用。）', { size: 20 });
    return B;
  }

  /* ---------- D16 贈與稅（遺產及贈與稅法第19、22條；115年免稅額 244 萬、級距 2,811 萬／5,621 萬） ---------- */
  const GIFT = { exempt: 2440000, b1: 28110000, b2: 56210000 };
  function giftTax(i) {
    i = i || {};
    const total = num(i.amount), prior = num(i.priorAmount), priorTax = num(i.priorTax), deduct = num(i.deduct);
    const out = { ok: false, notes: [] };
    if (!(total > 0)) { out.notes.push('請填本次贈與財產價值（土地以公告現值、房屋以評定現值計算）。'); return out; }
    if (i.spouse) { Object.assign(out, { ok: true, net: 0, tax: 0, rate: 0 }); out.notes.push('配偶相互贈與之財產不計入贈與總額（遺產及贈與稅法第20條第1項第6款），仍應申報。'); return out; }
    const marriage = i.marriage ? Math.min(total, 1000000) : 0;
    const net = Math.max(0, total + prior - marriage - GIFT.exempt - deduct);
    let tax = net <= GIFT.b1 ? net * 0.10 : net <= GIFT.b2 ? net * 0.15 - 1405500 : net * 0.20 - 4216000;
    tax = Math.max(0, Math.round(tax) - priorTax);
    const rate = net <= GIFT.b1 ? 0.10 : net <= GIFT.b2 ? 0.15 : 0.20;
    Object.assign(out, { ok: true, total, prior, marriage, deduct, net, tax, rate });
    if (marriage) out.notes.push('父母於子女婚嫁時所贈與之財物，總金額 100 萬元內不計入贈與總額（同法第20條第1項第7款），以結婚登記前後 6 個月內為限，請核對。');
    out.notes.push('免稅額每位贈與人每年 244 萬元（115年財政部公告，與114年相同）；同一年度內多次贈與應合併計算，已納稅額扣抵。');
    out.notes.push('受贈人負擔之土地增值稅、契稅可列為扣除額（同法第21條）。贈與人應於贈與行為發生後 30 日內申報（同法第24條）。');
    return out;
  }
  function giftTaxBlocks(w, i, r, who) {
    const B = [{ t: 'h', text: '贈與稅　申報資料表（試算）' }];
    B.push({ t: 'p', text: `案件：${S(w.propertyName) || S(w.address) || BLANK}　　贈與人：${S(who) || BLANK}　　贈與日：${S(i.date) || BLANK}` });
    B.push({ t: 'table', rows: [['項目', '金額（元）'], ['本次贈與財產價值', money(r.total || num(i.amount))], ['本年度以前各次贈與', money(r.prior || 0)], ['減：婚嫁贈與不計入', money(r.marriage || 0)], ['減：免稅額', money(GIFT.exempt)], ['減：扣除額（受贈人負擔土增稅、契稅）', money(r.deduct || 0)], ['課稅贈與淨額', r.ok ? money(r.net) : ''], ['適用稅率', r.ok ? Math.round((r.rate || 0) * 100) + '%' : ''], ['減：本年度已納贈與稅', money(num(i.priorTax))], ['應納贈與稅（試算）', r.ok ? money(r.tax) : '']], widths: [5600, 4038] });
    B.push({ t: 'h2', text: '說明' });
    (r.notes || []).forEach(n => B.push({ t: 'p', text: '・' + n, indent: 360, hanging: 240 }));
    B.push({ t: 'p', text: '・稅率：課稅贈與淨額 2,811 萬元以下 10%；超過 2,811 萬元至 5,621 萬元 15%（累進差額 140.55 萬元）；超過 5,621 萬元 20%（累進差額 421.6 萬元）。實際以國稅局核定為準。', indent: 360, hanging: 240 });
    return B;
  }

  const api = { zip, docx, html, saleContract, saleContractCheck, houseLandTax, houseLandBlocks, PAY, inheritShares, inheritBlocks, partitionBlocks, giftTax, giftTaxBlocks, GIFT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HGDeskDocs = api;
})(typeof window !== 'undefined' ? window : globalThis);
