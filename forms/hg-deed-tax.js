/* 臺南市政府財政稅務局「契稅申報書」及「契稅申報書附聯」空白原表。
 * https://www.tntb.gov.tw/download_list2.php?lmenuid=7&qcategory=8&qtype=1&smenuid=22&tmenuid=58
 * Main: _document/files/download/1/8/1723166824-m0.pdf
 * Annex: _document/files/download/1/8/1760686669-m0.pdf. Verified 2026-11-20.
 */
(function (scope) {
  'use strict';
  const mainHash = '1e190bc761d7d6394202d5915d48f917725b758d282fbfbe791723c2acb1d050';
  const annexHash = '0ef1593616d1a067e4014c8c11a17fe4c41cc3e3d3bf417347e9a40aef83c32e';
  const kinds = new Map([['買賣', [91.2, 359]], ['二親等間買賣', [366.8, 359]],
    ['贈與', [218.6, 353.6]], ['配偶贈與', [218.6, 364.6]]]);
  const clean = value => String(value ?? '').trim();
  const list = value => Array.isArray(value) ? value.filter(row => row && typeof row === 'object') : [];
  const numberKey = value => clean(value).normalize('NFKC').replace(/\s|建號$/g, '');
  const personKeys = ['name', 'ledgerId', 'phone', 'ledgerBirth', 'ledgerHome', 'taxMailAddress', 'v50Share', 'email'];
  const people = rows => list(rows).filter(p => p.role !== '代理人' && personKeys.some(k => clean(p[k])));
  const taxId = value => clean(value).normalize('NFKC').replace(/[\s-]/g, '');
  const validPrice = value => /^(?:[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/.test(clean(value).normalize('NFKC'));
  const dateParts = value => scope.HGTaxPdf.dateParts(value);
  function values(w) {
    const reg = w?.v50Reg || {};
    const deed = reg.taxDraft?.deed || {};
    const buildings = list(w?.v50Props).filter(p => p.kind === '建物');
    return { reg, deed, owners: people(w?.sellers), newOwners: people(w?.buyers),
      mains: buildings.filter(p => !p.common), common: buildings.filter(p => p.common) };
  }
  function inspect(w) {
    const { reg, deed, owners, newOwners, mains, common } = values(w);
    const warnings = [], blocking = [];
    const b = mains[0] || {};
    if (!mains.length) blocking.push('請在標的明細新增本次申報的主建物。');
    if (mains.length > 1) blocking.push('本表一次申報一個主建物，請逐戶選定並核對當事人、房屋契價及公設。');
    if (clean(b.city) && !/^[臺台]南市$/.test(clean(b.city))) blocking.push('本表限臺南市房屋，請改用標的所在地的申報書。');
    if (!b.city) warnings.push('請核對房屋所在縣市為臺南市。');
    if (common.length > 4) blocking.push('本表公設只有 4 欄，超出欄位請依原表另附資料。');
    if (common.some(p => !numberKey(p.commonOf) || numberKey(p.commonOf) !== numberKey(b.number))) {
      blocking.push('共有部分與本次主建號的關聯待確認，請核對所屬主建號後再產生。');
    }
    if (common.some(p => !clean(p.number) || !clean(p.transferShare))) warnings.push('公設建號或持分比例未填齊，請依建物謄本核對。');
    if (owners.length > 2 || newOwners.length > 2) blocking.push('官方主表原、新所有權人各有 2 列；超出請依填表須知另紙浮貼並用印。');
    const caseType = clean(deed.caseType);
    const regType = clean(reg.type) || clean(w?.ledgerService);
    if (caseType && !kinds.has(caseType)) blocking.push('所選契稅案件類型超出這份草稿支援的買賣、贈與範圍。');
    if (regType && /繼承|抵押|拍賣|交換|分割|判決|調解|和解/.test(regType) && !(/買賣|贈與/.test(regType))) {
      blocking.push('此案登記業務超出本草稿的買賣、贈與範圍，請核對申報類別。');
    }
    if (caseType && (/贈與/.test(regType) && /買賣/.test(caseType) || /買賣/.test(regType) && /贈與/.test(caseType))) blocking.push('契稅類型與本案登記類型不符，請核對。');
    if (!caseType) warnings.push('尚未確認契稅案件類型，第 6 欄課稅標準與第 11 欄類型留待核對。');
    if (!clean(deed.taxNo)) warnings.push('請依房屋稅單補房屋稅籍編號（11 位數字）。');
    else if (!/^\d{11}$/.test(taxId(deed.taxNo))) blocking.push('房屋稅籍編號應為 11 位數字，請核對或清空待補。');
    if (!clean(deed.houseAddress)) warnings.push(clean(b.address) ? '房屋坐落先帶建物門牌，請與房屋稅單核對。' : '請依房屋稅單補房屋坐落。');
    if (!clean(b.section) || !clean(b.number)) warnings.push('請核對第 2 欄段、建號（未辦保存登記者免填建號）。');
    if (!clean(deed.transferPrice)) warnings.push('請補房屋契約所載移轉價格。');
    else if (!validPrice(deed.transferPrice)) blocking.push('房屋契約移轉價格請填正整數元或清空待補。');
    [[reg.contractDate, '公契立約日期'], [deed.filingDate, '申報日期']].forEach(([v, label]) => {
      if (!clean(v)) warnings.push(label + '待填。');
      else if (!dateParts(v)) blocking.push(label + '格式或日期無效，請核對。');
    });
    [[owners, '原所有權人'], [newOwners, '新所有權人']].forEach(([persons, label]) => {
      if (!persons.length) warnings.push(label + '尚未填寫。');
      persons.forEach((p, i) => {
        const missing = [['name', '姓名'], ['ledgerId', '統一編號'], ['ledgerBirth', '出生日期（自然人）'],
          ['phone', '電話'], ['v50Share', '權利移轉範圍'], ['taxMailAddress', label === '新所有權人' ? '房屋稅繳款書送單地址' : '通訊地址']]
          .filter(([key]) => !clean(p[key])).map(([, name]) => name);
        if (missing.length) warnings.push(label + (i + 1) + ' 待核對：' + missing.join('、') + '。');
        if (clean(p.ledgerBirth) && !dateParts(p.ledgerBirth)) blocking.push(label + (i + 1) + ' 的出生日期無效，請核對或清空待補。');
      });
    });
    warnings.push('請依原件核對逐層面積、構造及未保存登記部分，並確認第 4 欄申報情形。');
    if (newOwners.length > 1 || newOwners.some(p => clean(p.v50Share) && !['全部','1/1','1分之1'].includes(clean(p.v50Share)))) {
      warnings.push('房屋涉及持分，請核對第 15 欄繳款書填發方式。');
    }
    warnings.push('請核對代理授權、附件、領回方式及簽章。第 19 欄與所附使用情形申報表，請由申報人確認後勾填。');
    return { warnings, blocking };
  }

  async function generate(w) {
    const check = inspect(w);
    if (check.blocking.length) throw new Error(check.blocking.join('\n'));
    const { reg, deed, owners, newOwners, mains: [b], common } = values(w);
    const { pdf, page, formPages, cell, write, tick, markDraft } = await scope.HGTaxPdf.open([
      ['deed-main.pdf', mainHash], ['deed-use.pdf', annexHash]
    ]);
    function date(value, columns) {
      const parts = dateParts(value);
      if (parts) parts.forEach((v, i) => cell(v, columns[i][0], 113, columns[i][1], 17, '日期', 9));
    }
    function party(p, top, bottom, middle) {
      const birth = dateParts(p.ledgerBirth) || [];
      cell(p.name, 92, top + 1, 51, bottom - top - 2, '所有權人姓名', 10, 2);
      cell(p.ledgerId, 146, top, 95, middle - top, '所有權人統一編號', 9);
      cell(p.phone, 146, middle, 95, bottom - middle, '所有權人電話', 9);
      cell(birth[0], 245, top, 32, middle - top, '出生年', 9);
      cell(birth[1], 245, middle, 15, bottom - middle, '出生月', 9);
      cell(birth[2], 263, middle, 15, bottom - middle, '出生日', 9);
      cell(p.v50Share, 281, top + 1, 33, bottom - top - 2, '權利移轉範圍', 9, 2);
      cell(p.taxMailAddress, 318, top + 1, 211, bottom - top - 2, '通訊或房屋稅送單地址', 10, 2);
    }
    markDraft(page);
    markDraft(formPages[1]);
    const id = taxId(deed.taxNo);
    [...id].forEach((c, i) => cell(c, [91.4,104.3,117.2,130.5,144,158.4,171.9,185.7,199,212.7,226.2][i],
      96.3, 11.7, 11.4, '稅籍編號', 9));
    cell(clean(b.section).replace(/段$/, ''), 277, 80.4, 20, 12, '段名', 9);
    cell(clean(b.subSection).replace(/小段$/, ''), 308, 80.4, 31, 12, '小段名', 9);
    cell(numberKey(b.number), 277.3, 94, 60, 13, '建號', 10);
    cell(clean(deed.houseAddress) || b.address, 418, 80, 152, 26, '移轉房屋坐落', 10, 2);
    date(reg.contractDate, [[205,16],[232,10],[253,10]]);
    date(deed.filingDate, [[489.8,16],[518,13],[543,13]]);
    cell(clean(deed.transferPrice).normalize('NFKC'), 93, 136, 108, 22, '移轉價格', 11);
    if (kinds.has(clean(deed.caseType))) { tick(225.7, 137.4); tick(...kinds.get(clean(deed.caseType))); }
    const ownerRows = [[215.2,241.3,227.6], [242.1,268.3,255.9]];
    const newOwnerRows = [[269.1,294.6,281.7], [295.4,320.1,307.7]];
    owners.forEach((p, i) => party(p, ...ownerRows[i]));
    newOwners.forEach((p, i) => party(p, ...newOwnerRows[i]));
    common.forEach((p, i) => {
      const left = 382.4 + 33.9 * i;
      cell(numberKey(p.number), left, 381.2, 31, 11.8, '公設建號', 8.5);
      cell(p.transferShare, left, 394.5, 31, 32, '公設持分比例', 9, 2);
    });
    // The annex's applicant/signature area is part of an affirmative land
    // self-use application. Copy the tax ID only; leave choices and signatures open.
    write(formPages[1], id, 193, 84.6, 106, 18.5, '附聯稅籍編號', 11);
    pdf.setTitle('契稅申報書及附聯（草稿）');
    return pdf.save();
  }
  scope.HGDeedTax = Object.freeze({ inspect, generate });
})(typeof window === 'undefined' ? globalThis : window);
