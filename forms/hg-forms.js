/* 宏國背表｜地政士官方表單套填（Claude 2026-11-16）
 * 移植自 Codex operations2 lib/documents.mjs（內政部空白原表＋座標套填，產出可編輯 PDF 草稿）。
 * 在瀏覽器執行：需要 PDFLib（pdf-lib）、fontkit、原表 PDF 與思源黑體字型位元組，由呼叫端載入後傳入。
 * 產出只是待覆核草稿：簽名、印章、機關處理欄不代填；PDF 內手改不會回寫案件。
 */
(function (root) {
  'use strict';
  const SOURCE_PAGE = 'https://www.land.moi.gov.tw/chhtml/downlist/77';
  const TEMPLATES = {
    'registration-application': {
      id: 'registration-application', name: '土地登記申請書', file: 'paper-land-registration-application.pdf',
      sourceUrl: 'https://www.land.moi.gov.tw/chhtml/addcount?cupid=409&tmptype=d1-20180621095900.pdf', sourcePage: SOURCE_PAGE,
      versionNote: '2026-10-28 從內政部現行下載頁取得；紙本格式，非數位櫃臺交換檔。',
      sha256: '6c912319af081085b37eb1ca9ddbb5b497394121d4fd1a5165b6113797deaf70'
    },
    'sale-contract': {
      id: 'sale-contract', name: '土地建築改良物所有權買賣移轉契約書', file: 'paper-sale-contract.pdf',
      sourceUrl: 'https://www.land.moi.gov.tw/chhtml/addcount?cupid=413&tmptype=d1-20180621100203.pdf', sourcePage: SOURCE_PAGE,
      versionNote: '2026-10-28 從內政部現行下載頁取得；紙本格式，非數位櫃臺交換檔。',
      sha256: '7e5bc11fb6184e48b7f155cb2df4065a05cc16b15a6797b7c41d391659d96fd3'
    }
  };

  class FormError extends Error { constructor(message) { super(message); this.name = 'FormError'; } }

  const roc = s => { if (!s) return ''; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return y ? `${y - 1911}/${m}/${d}` : ''; };
  const dateParts = s => s ? String(s).slice(0, 10).split('-').map(Number).map((v, i) => String(i === 0 ? v - 1911 : v)) : ['', '', ''];
  const chunks = (items, size) => Array.from({ length: Math.max(1, Math.ceil(items.length / size)) }, (_, i) => items.slice(i * size, (i + 1) * size));
  const isBuyer = p => p.role === '買方';
  const isSeller = p => p.role === '賣方';
  const buyers = c => c.parties.filter(isBuyer);
  const sellers = c => c.parties.filter(isSeller);
  const safeFilename = s => String(s).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120);

  function splitAddress(value) {
    let s = String(value || '').trim().replace(/^\d{3,6}\s*/, '');
    const out = Array(10).fill('');
    const patterns = [/^(.{2,3}[縣市])/, /^(.{1,6}[鄉鎮市區])/, /^(.{1,6}[村里])/, /^(\d+鄰)/, /^(.{1,20}[路街道])/, /^(.{1,5}段)/, /^(.{1,12}巷)/, /^(.{1,12}弄)/, /^(.{1,15}號(?:之\d+)?)/, /^(.{1,15}(?:樓|層)(?:之\d+)?)$/];
    patterns.forEach((r, i) => { const m = s.match(r); if (m) { out[i] = m[1]; s = s.slice(m[1].length); } });
    return { parts: out, remainder: s };
  }
  function wrap(text, font, size, width) {
    const lines = [];
    for (const part of String(text).split('\n')) { let line = ''; for (const ch of [...part]) { if (line && font.widthOfTextAtSize(line + ch, size) > width) { lines.push(line); line = ch; } else line += ch; } lines.push(line); }
    return lines;
  }
  function maker(L, pdf, font, warnings) {
    const { rgb } = L, ops = L;
    const form = pdf.getForm(); let seq = 0;
    const f = (page, name, box, value = '', opts = {}) => {
      const scale = page.getWidth() / 1300, [x, y, w, h] = box.map(v => v * scale);
      const str = String(value ?? ''), padding = opts.padding ?? 2, lineSpacing = opts.lineSpacing ?? 1.2;
      const width = w - padding * 2, height = h - padding * 2, effectiveWidth = width - 2;
      const singleLine = !str.includes('\n') && /^[A-Za-z0-9 .:/-]*$/.test(str);
      let size = opts.size || 10;
      const tooBig = s => wrap(str, font, s, effectiveWidth).length * s * lineSpacing > height || (singleLine && font.widthOfTextAtSize(str, s) > effectiveWidth);
      while (size > 6.5 && tooBig(size)) size -= .5;
      if (tooBig(size)) throw new FormError(`「${opts.label || name}」文字超過表格空間，請改用續頁或人工補正；系統不會截斷或刪短原始資料。`);
      const field = form.createTextField(`${name}_${++seq}`); field.enableMultiline(); field.disableSpellChecking(); field.disableScrolling();
      field.setAlignment(opts.align ?? 1); field.setText(str);
      field.addToPage(page, { x: x + padding, y: page.getHeight() - y - h + padding, width, height, borderWidth: 0, font, textColor: rgb(.04, .08, .12) });
      field.setFontSize(size);
      field.updateAppearances(font, () => {
        const lines = wrap(str, font, size, effectiveWidth), lineHeight = size * lineSpacing;
        const baseline = opts.align === 0 && height > 40 ? height - size * 1.1 : (height + (lines.length - 1) * lineHeight - size) / 2 + size * .1;
        const commands = [ops.pushGraphicsState(), ops.beginText(), ops.setFillingColor(rgb(.04, .08, .12)), ops.setFontAndSize(font.name, size)];
        lines.forEach((line, i) => { const left = (opts.align ?? 1) === 0 ? 1 : Math.max(1, (width - font.widthOfTextAtSize(line, size)) / 2); commands.push(ops.setTextMatrix(1, 0, 0, 1, left, baseline - i * lineHeight), ops.showText(font.encodeText(line))); });
        commands.push(ops.endText(), ops.popGraphicsState()); return commands;
      });
      return field;
    };
    const check = (page, name, x, y, value) => {
      const s = page.getWidth() / 1300, field = form.createCheckBox(`${name}_${++seq}`);
      field.addToPage(page, { x: (x + 2) * s, y: page.getHeight() - (y + 14) * s, width: 12 * s, height: 12 * s, borderWidth: 0 }); if (value) field.check(); return field;
    };
    const address = (page, name, value, xs, y, h, opts = {}) => {
      const result = splitAddress(value);
      if (result.remainder) warnings.add('有地址無法自動拆成縣市／鄉鎮市區／街路欄；覆核單附完整地址，請於送件前補填對應空格。');
      result.parts.forEach((part, i) => f(page, `${name}_${i}`, [xs[i], y, xs[i + 1] - xs[i], h], part, { size: 8, label: '住所', ...opts }));
    };
    return { f, check, address, form };
  }
  async function pagesFrom(pdf, source, indices) { return Promise.all((await pdf.copyPages(source, indices)).map(p => pdf.addPage(p))); }
  async function normalizeSource(L, source) {
    if (source.getPages().every(p => p.getRotation().angle % 360 === 0)) return source;
    const normalized = await L.PDFDocument.create();
    for (const page of source.getPages()) {
      const angle = ((page.getRotation().angle % 360) + 360) % 360, w = page.getWidth(), h = page.getHeight();
      const embedded = await normalized.embedPage(page), out = normalized.addPage(angle % 180 ? [h, w] : [w, h]);
      const placement = angle === 90 ? { x: 0, y: w, rotate: L.degrees(-90) } : angle === 270 ? { x: h, y: 0, rotate: L.degrees(90) } : angle === 180 ? { x: w, y: h, rotate: L.degrees(180) } : { x: 0, y: 0 };
      out.drawPage(embedded, placement);
    }
    return normalized;
  }
  function footer(L, page, font, c, index, total) {
    page.drawText(`填表草稿・請覆核  |  ${c.caseNumber || '未編號'} ${c.title || ''}  |  ${index + 1}/${total}`, { x: 40, y: 13, size: 7, font, color: L.rgb(.4, .4, .4) });
  }
  function propertyWarnings(properties, warnings) {
    if (properties.some(p => !p.city || !p.district || !p.section || !p.number || !p.area)) warnings.add('部分標的缺少完整坐落、地建號或面積，請補齊。');
    if (properties.some(p => !p.transferShare)) warnings.add('移轉權利範圍尚有空白；未以謄本原權利範圍代替。');
  }
  function partyWarnings(parties, warnings) {
    if (parties.some(p => !p.identityNo || /[*＊○●]|[Xx]{2,}/.test(p.identityNo))) warnings.add('當事人統一編號空白或含遮罩，請以合法取得的資料核對補齊。');
    if (parties.some(p => !p.address)) warnings.add('部分當事人住所（戶籍地址）未填。');
    if (parties.some(p => !p.birthDate && !/^\d{8}$/.test(p.identityNo || ''))) warnings.add('部分自然人出生日期未填。');
  }

  // 產生前的檢查（不需要字型與原表，可即時顯示在畫面上）
  function preflight(templateId, c) {
    const w = new Set(), r = c.registration || {};
    if (!c.properties.length) w.add('尚未填寫任何土地或建物標的。');
    propertyWarnings(c.properties, w);
    if (templateId === 'sale-contract') {
      if (c.type && c.type !== '買賣') w.add(`本案登記原因為「${c.type}」，買賣移轉契約書只適用買賣。`);
      if (!buyers(c).length || !sellers(c).length) w.add('買賣契約書至少需要一位買方與一位賣方（身分為本人或共有人）。');
      partyWarnings([...buyers(c), ...sellers(c)], w);
      if (c.properties.some(p => p.transferShare) && [...buyers(c)].some(p => !p.share)) w.add('買方持分尚有空白。');
      if (!r.priceTotal) w.add('買賣價款總金額未填。');
      if (!r.contractDate) w.add('公契立約日期未填。');
    } else {
      if (!c.type) w.add('登記原因未選擇（買賣／贈與等）。');
      if (!r.office) w.add('受理地政事務所未填。');
      if (!r.causeDate) w.add('原因發生日期未填，未以申請日或契約日推定。');
      partyWarnings(c.type === '買賣' ? [...buyers(c), ...sellers(c)] : c.parties, w);
      if (!r.agentName) w.add('代理人（地政士）未填，請於業務紀錄簿選擇登記代理地政士。');
    }
    if (c.agentsOmitted) w.add('本案有身分為「代理人」的當事人，未列入表單，請人工核對代理授權及填寫方式。');
    return [...w];
  }

  async function sale(L, pdf, source, c, font, warnings) {
    const { f, address } = maker(L, pdf, font, warnings);
    const lands = c.properties.filter(p => p.kind === '土地'), buildings = c.properties.filter(p => p.kind === '建物');
    const parties = [...buyers(c), ...sellers(c)], r = c.registration || {};
    if (!buyers(c).length || !sellers(c).length) throw new FormError('買賣契約書至少需要一位買方與一位賣方，請先填寫當事人。');
    const lchunks = chunks(lands, 4), bchunks = chunks(buildings, 5);
    for (let batch = 0; batch < Math.max(lchunks.length, bchunks.length); batch++) {
      const [p] = await pagesFrom(pdf, source, [0]);
      (lchunks[batch] || []).forEach((land, i) => {
        const x = 273 + i * 60.5, w = 60.5;
        for (const [key, y, h, val] of [['district', 216, 85, land.district], ['section', 302, 57, land.section], ['subsection', 360, 56, land.subSection], ['number', 417, 78, land.number], ['area', 496, 98, land.area], ['share', 595, 132, land.transferShare]])
          f(p, `land${batch * 4 + i}_${key}`, [x, y, w, h], val, { size: 9, label: '土地' + (batch * 4 + i + 1) + key });
      });
      (bchunks[batch] || []).forEach((b, i) => {
        const x = 760 + i * 91.1, w = 91.1, addr = splitAddress(b.address), n = batch * 5 + i;
        f(p, `building${n}_number`, [x, 215, w, 28], b.number);
        f(p, `building${n}_district`, [x, 244, w, 28], b.district);
        f(p, `building${n}_street`, [x, 273, w, 28], addr.parts[4]);
        f(p, `building${n}_lane`, [x, 302, w, 28], [addr.parts[5], addr.parts[6], addr.parts[7]].join(''));
        f(p, `building${n}_addressno`, [x, 331, w, 28], [addr.parts[8], addr.parts[9]].join(''));
        f(p, `building${n}_section`, [x, 360, w, 28], b.section);
        f(p, `building${n}_subsection`, [x, 389, w, 27], b.subSection);
        f(p, `building${n}_base`, [x, 417, w, 28], '');
        for (let j = 0; j < 5; j++) f(p, `building${n}_floor${j}`, [x, 446 + j * 25, w, 24], '');
        f(p, `building${n}_mainArea`, [x, 571, w, 23], b.mainArea);
        f(p, `building${n}_attachedPurpose`, [x, 595, w, 46], '');
        f(p, `building${n}_attachedArea`, [x, 642, w, 56], b.attachedArea);
        f(p, `building${n}_share`, [x, 699, w, 28], b.transferShare);
      });
      f(p, `price_${batch}`, [397, 730, 812, 59], r.priceTotal ? `${r.priceTotal} 元` : '', { align: 0, size: 13 });
    }
    if (buildings.length) warnings.add('建物坐落基地地號、分層面積及附屬建物用途需核對後填寫，未以相鄰土地或主建物用途推測。');
    for (const [batch, list] of chunks(parties, 4).entries()) {
      const [p] = await pagesFrom(pdf, source, [1]);
      f(p, `other_rights_${batch}`, [315, 118, 280, 62], r.otherRights || '', { align: 0, label: '他項權利情形' });
      f(p, `agreements_${batch}`, [158, 183, 440, 233], r.remarks || '', { align: 0, size: 10, label: '買賣其他約定' });
      list.forEach((party, i) => {
        const y = 541 + i * 57.5, base = `party${batch * 4 + i}`;
        f(p, `${base}_role`, [122, y, 63, 56], isBuyer(party) ? '買受人' : '出賣人', { size: 9 });
        f(p, `${base}_name`, [187, y, 140, 56], party.name, { size: 10 });
        f(p, `${base}_buyerShare`, [329, y, 54, 56], isBuyer(party) ? party.share : '', { size: 8 });
        f(p, `${base}_sellerShare`, [384, y, 52, 56], isSeller(party) ? party.share : '', { size: 8 });
        f(p, `${base}_birth`, [438, y, 64, 56], roc(party.birthDate), { size: 8 });
        f(p, `${base}_id`, [504, y, 98, 56], party.identityNo, { size: 9 });
        address(p, `${base}_address`, party.address, [604, 679, 733, 788, 821, 897, 941, 1007, 1051, 1094, 1131], y, 56);
      });
      const d = dateParts(r.contractDate);
      f(p, `year_${batch}`, [489, 773, 125, 36], d[0]); f(p, `month_${batch}`, [667, 773, 170, 36], d[1]); f(p, `day_${batch}`, [906, 773, 172, 36], d[2]);
    }
  }

  async function application(L, pdf, source, c, font, warnings) {
    const { f, check, address } = maker(L, pdf, font, warnings), r = c.registration || {};
    const [p] = await pagesFrom(pdf, source, [0]);
    const office = (r.office || '').match(/^(.+?[縣市])(.+?)(?:地政事務所)?$/);
    f(p, 'office_city', [205, 250, 95, 69], office ? office[1].replace(/[縣市]$/, '') : '', { size: 10 });
    f(p, 'office_name', [332, 249, 54, 29], office ? office[2] : (r.office || '').replace(/地政事務所$/, ''), { size: 9 });
    const cause = dateParts(r.causeDate);
    f(p, 'cause_year', [995, 270, 29, 30], r.causeDate ? cause[0] : '', { size: 9 });
    f(p, 'cause_month', [1058, 270, 27, 30], r.causeDate ? cause[1] : '', { size: 9 });
    f(p, 'cause_day', [1117, 270, 27, 30], r.causeDate ? cause[2] : '', { size: 9 });
    const typeMap = { '買賣': 382, '贈與': 382, '繼承': 382, '抵押權設定': 407, '抵押權塗銷': 432 };
    if (typeMap[c.type]) check(p, 'registration_event', 112, typeMap[c.type] - 9, true);
    for (const [kind, x, y] of [['買賣', 465, 374], ['贈與', 549, 374], ['繼承', 632, 374], ['抵押權設定', 465, 399]]) check(p, `reason_${kind}`, x, y, c.type === kind);
    check(p, 'contract_enclosed', 391, 525, ['買賣', '抵押權設定'].includes(c.type));
    const attach = String(r.attachments || '').split('\n').map(s => s.trim()).filter(Boolean);
    if (attach.length > 9) throw new FormError('申請書附繳證件最多先填 9 項，請合併同類項目或另以清冊附表處理。');
    attach.forEach((item, i) => { const x = [190, 532, 879][Math.floor(i / 3)], y = 546 + (i % 3) * 24; f(p, `attachment${i}`, [x, y, 220, 23], item, { align: 0, size: 9, label: '附繳證件' }); });
    if (r.agentName) f(p, 'agent_delegation', [465, 620, 78, 28], r.agentName, { size: 9 });
    f(p, 'buyer_phone', [1054, 621, 146, 30], buyers(c)[0]?.phone || '', { size: 9 });
    f(p, 'seller_phone', [1054, 654, 146, 30], sellers(c)[0]?.phone || '', { size: 9 });
    f(p, 'agent_phone', [1054, 688, 146, 30], r.agentPhone || '', { size: 9 });
    f(p, 'notes', [167, 722, 692, 143], [r.applicationNotes].filter(Boolean).join('\n'), { align: 0, size: 10, label: '備註' });
    const parties = c.type === '買賣' ? [...buyers(c), ...sellers(c)] : c.parties;
    warnings.add('代理人（地政士）的出生日期、統一編號、住所未自動列入申請人欄，請於送件前補填或依實務蓋章。');
    for (const [batch, list] of chunks(parties, 6).entries()) {
      const [page] = await pagesFrom(pdf, source, [1]);
      list.forEach((person, i) => {
        const y = 200 + i * 28.5, base = `applicant${batch * 6 + i}`;
        const role = isBuyer(person) ? '權利人' : isSeller(person) ? '義務人' : (person.role || '');
        f(page, `${base}_role`, [158, y, 90, 27.5], role, { size: 8 }); f(page, `${base}_name`, [250, y, 90, 27.5], person.name, { size: 8 });
        f(page, `${base}_birth`, [342, y, 137, 27.5], roc(person.birthDate), { size: 8 }); f(page, `${base}_id`, [481, y, 115, 27.5], person.identityNo, { size: 8 });
        address(page, `${base}_address`, person.address, [598, 662, 727, 792, 829, 900, 937, 974, 1011, 1048, 1085], y, 27.5, { padding: .7, lineSpacing: 1.05 });
      });
    }
  }

  function addReview(L, pdf, font, c, t, warnings) {
    const rows = [`案件：${c.caseNumber || '未編號'}　${c.title || ''}`, `來源表格：${t.name}`, `來源：${t.sourceUrl}`, `表格說明：${t.versionNote}`,
      '本頁為宏國填表覆核單，非地政機關原表的一部分。送件前請確認應使用的表格、全部空欄與簽章，並移除此覆核單。PDF 內修改不會回寫背表。',
      ...[...warnings].map(s => '待覆核：' + s), '完整當事人與標的資料（用於核對欄位拆分）：',
      ...c.parties.map(p => `${p.role}｜${p.name}｜${p.address || '住所未填'}｜${p.identityNo || '統一編號未填'}｜持分 ${p.share || '未填'}`),
      ...c.properties.map(p => `${p.kind}｜${p.city || ''}${p.district || ''}${p.section || ''}${p.subSection || ''} ${p.number || ''}${p.kind === '建物' ? '建號｜' + (p.address || '門牌未填') : '地號'}｜面積 ${p.area || '未填'} ㎡｜移轉範圍 ${p.transferShare || '未填'}`)
    ];
    let page, y; const fresh = () => { page = pdf.addPage([595.28, 841.89]); y = 790; page.drawText('填表覆核單', { x: 42, y, font, size: 17 }); y -= 34; }; fresh();
    for (const row of rows) { for (const line of wrap(row, font, 9, 510)) { if (y < 55) fresh(); page.drawText(line, { x: 42, y, font, size: 9 }); y -= 15; } y -= 5; }
  }

  // assets: { PDFLib, fontkit, templateBytes, fontBytes }
  async function generate(templateId, record, assets) {
    const t = TEMPLATES[templateId]; if (!t) throw new FormError('找不到此表單範本。');
    const L = assets.PDFLib;
    const c = { ...record, parties: record.parties || [], properties: record.properties || [] };
    if (!c.properties.length) throw new FormError('請先新增至少一筆土地或建物標的。');
    if (templateId === 'sale-contract' && c.type && c.type !== '買賣') throw new FormError(`本案登記原因為「${c.type}」，買賣移轉契約書只適用買賣。`);
    const source = await normalizeSource(L, await L.PDFDocument.load(assets.templateBytes));
    const pdf = await L.PDFDocument.create();
    pdf.registerFontkit(assets.fontkit);
    const font = await pdf.embedFont(assets.fontBytes, { subset: false, features: { palt: false, kern: false, liga: false, locl: false }, customName: 'HomeGoNotoSansTC' });
    const warnings = new Set(['本文件為可編輯套表草稿；簽名、印章及機關處理欄未代填。', ...preflight(templateId, c)]);
    if (templateId === 'sale-contract') await sale(L, pdf, source, c, font, warnings); else await application(L, pdf, source, c, font, warnings);
    addReview(L, pdf, font, c, t, warnings);
    const pages = pdf.getPages(); pages.forEach((p, i) => footer(L, p, font, c, i, pages.length));
    pdf.setTitle(`${t.name} - ${c.caseNumber || '未編號'} - 待覆核草稿`); pdf.setAuthor('宏國地政｜易丞地政'); pdf.setSubject(`來源 ${t.sourceUrl}`);
    pdf.getForm().updateFieldAppearances(font);
    const bytes = await pdf.save();
    return { bytes, filename: safeFilename(`${c.caseNumber || '未編號'}-${c.title || '案件'}-${t.name}-草稿.pdf`), warnings: [...warnings] };
  }

  const api = { TEMPLATES, FormError, preflight, generate, splitAddress };
  root.HGForms = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
