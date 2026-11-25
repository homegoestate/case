/* 臺南市土地增值稅（土地現值）申報書。原表版次 108032804，2026-11-20 核對。
 * https://www.tntb.gov.tw/_document/files/download/1/6/1624844728-m0.pdf
 * The coordinate grid is shared with HomeGo Operations' tax-forms.mjs.
 */
(function (scope) {
  'use strict';
  const hash = '22a8b61aef36f0f3b4d914f81409f302d80590bd099ef8ee14bf310ac7dd9704';
  const clean = v => String(v ?? '').trim();
  const list = v => Array.isArray(v) ? v.filter(p => p && typeof p === 'object') : [];
  const owned = rows => list(rows).filter(p => p.role !== '代理人' &&
    ['name','phone','ledgerId','email','ledgerBirth','v50Share','ledgerHome','taxMailAddress'].some(k => clean(p[k])));
  const numeric = v => clean(v).normalize('NFKC');
  function validNumber(v) {
    const n = numeric(v);
    return /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(n) && Number.isFinite(Number(n.replace(/,/g, '')));
  }
  const amount = v => Number(numeric(v).replace(/,/g, ''));
  function shareInfo(value) {
    const str = numeric(value).replace(/\s/g, '');
    if (!str) return { blank: true };
    if (['全部', '全筆'].includes(str)) return { full: true };
    const slash = /^(\d+)\/(\d+)$/.exec(str), chinese = /^(\d+)分之(\d+)$/.exec(str);
    const n = slash?.[1] || chinese?.[2], d = slash?.[2] || chinese?.[1];
    if (!d || !n || !Number.isSafeInteger(Number(d)) || Number(n) <= 0 || Number(n) > Number(d)) return { invalid: true };
    return Number(n) === Number(d) ? { full: true } : { fraction: n + '/' + d };
  }
  function data(w) {
    const reg = w?.v50Reg || {}, settings = reg.taxDraft?.land || {};
    const lands = list(w?.v50Props).filter(p => p.kind === '土地');
    const land = lands[0] || {}, draft = land.landDraft || {};
    const type = clean(reg.type) || clean(w?.ledgerService);
    const reason = clean(settings.reason) || (/買賣/.test(type) && !/贈與|交換|分割|拍賣/.test(type) ? '買賣' : '');
    return {reg, settings, lands, land, draft, type, reason, sellers: owned(w?.sellers), buyers: owned(w?.buyers)};
  }
  function inspect(w) {
    const {reg, settings, lands, land, draft, type, reason, sellers, buyers} = data(w);
    const warnings = [], blocking = [];
    if (lands.length !== 1) blocking.push('每份申報書需選定一筆土地，請逐筆核對地號及本筆的當事人。');
    if (!clean(land.city)) warnings.push('請核對土地所在縣市為臺南市。');
    if (clean(land.city) && !/^[臺台]南市$/.test(clean(land.city))) blocking.push('本表限臺南市土地，請核對管轄縣市。');
    if (type && !/買賣|贈與/.test(type)) blocking.push('本草稿支援買賣及贈與，請核對此案的移轉原因。');
    if (reason && !['買賣','贈與','配偶贈與'].includes(reason)) blocking.push('本次移轉原因超出可套印類別。');
    if (reason && (/買賣/.test(type) && reason !== '買賣' || /贈與/.test(type) && reason === '買賣')) blocking.push('移轉原因與案件登記類型不符。');
    if (!reason) warnings.push('請核對移轉原因。一般贈與與配偶贈與分列。');
    if (sellers.length + buyers.length > 3) blocking.push('申報人表格最多 3 位原、新所有權人，超出請依官方格式另行申報。');
    if (!sellers.length) warnings.push('本筆原所有權人待填。');
    if (!buyers.length) warnings.push('本筆新所有權人待填。');
    const missing = [[land.district,'行政區'],[land.section,'段名'],[land.number,'地號'],[land.area,'整筆面積'],
      [land.transferShare,'土地移轉比率'],[settings.branch,'受理分局'],[draft.transferArea,'移轉面積'],
      [draft.contractAmount,'本筆土地契約所載金額'],[reg.contractDate,'公契立約日期'],[draft.previousDate,'原規定地價或前次移轉的原因發生日期'],
      [draft.previousUnitValue,'原規定地價或前次移轉現值單價'],[draft.declaredMode,'申報移轉現值方式']]
      .filter(([v]) => !clean(v)).map(([,label]) => label);
    if (missing.length) warnings.push('本筆待填：' + missing.join('、') + '。');
    if (shareInfo(land.transferShare).invalid) blocking.push('土地移轉比率應為全部或大於零且不超過 1 的持分。');
    for (const [value,label] of [[land.area,'整筆面積'],[draft.transferArea,'移轉面積'],[draft.contractAmount,'本筆土地契約所載金額'],
      [draft.previousUnitValue,'前次移轉現值單價'],[draft.declaredUnitValue,'申報單價']]) {
      if (clean(value) && !validNumber(value)) blocking.push(label + '請填有效的非負數字或清空待補。');
    }
    if (clean(land.area) && clean(draft.transferArea) && amount(draft.transferArea) > amount(land.area)) blocking.push('移轉面積大於整筆土地面積，請核對。');
    if (clean(draft.declaredMode) && !['公告土地現值','每平方公尺'].includes(draft.declaredMode)) blocking.push('請核對申報移轉現值方式。');
    if (clean(draft.declaredUnitValue) && draft.declaredMode !== '每平方公尺') blocking.push('已填申報單價，請選「每平方公尺」或清空單價。');
    if (draft.declaredMode === '每平方公尺' && !clean(draft.declaredUnitValue)) warnings.push('已選按每平方公尺申報，請補申報單價。');
    for (const [v,label] of [[draft.previousDate,'前次移轉日期'],[reg.contractDate,'公契立約日期']]) {
      if (clean(v) && !scope.HGTaxPdf.dateParts(v)) blocking.push(label + '無效，請核對日期或清空待補。');
    }
    const prior = scope.HGTaxPdf.dateParts(draft.previousDate), current = scope.HGTaxPdf.dateParts(reg.contractDate);
    const sortDate = ([y,m,d]) => y * 10000 + m * 100 + d;
    if (prior && current && sortDate(prior) > sortDate(current)) blocking.push('前次移轉日期晚於本次立約日期，請核對。');
    for (const [label, rows] of [['原所有權人', sellers], ['新所有權人', buyers]]) {
      rows.forEach((p,i) => {
        const fields = [['name','姓名'],['ledgerId','身分編號'],['ledgerBirth','出生日期（自然人）'],['phone','電話'],['v50Share','當事人權利移轉範圍'],['ledgerHome','戶籍地址']].filter(([k]) => !clean(p[k])).map(([,name]) => name);
        if (fields.length) warnings.push(label + (i + 1) + ' 待填：' + fields.join('、') + '。');
        if (clean(p.ledgerBirth) && !scope.HGTaxPdf.dateParts(p.ledgerBirth)) blocking.push(label + (i + 1) + ' 出生日期無效，請核對。');
        if (clean(p.ledgerId) && /[*＊○●]|[Xx]{2,}/.test(p.ledgerId)) warnings.push(label + (i + 1) + ' 身分編號仍有遮蔽字元，請核對原件。');
      });
    }
    if (list(w?.buyers).concat(list(w?.sellers)).some(p => p.role === '代理人' && clean(p.name))) warnings.push('案件有代理人，請依本筆報稅委託補列代理人及授權。');
    warnings.push('請逐筆核對前次取得資料。多次取得須依實際來源分列，請勿合併成一個前次現值。',
      '視同贈與、減免、自用稅率、送達方式及用印請由申報人核對；第 2 頁供稽徵機關查定。');
    return {warnings, blocking};
  }
  async function generate(w) {
    const {blocking} = inspect(w);
    if (blocking.length) throw new Error(blocking.join('\n'));
    const {reg, settings, land, draft, reason, sellers, buyers} = data(w);
    const {pdf, page, cell, tick, markDraft} = await scope.HGTaxPdf.open([['land-main.pdf', hash]]);
    const scale = page.getWidth() / 990;
    function field(label, box, value, size = 8.5, lines = 1) {
      const [x,y,w,h] = box.map(v => v * scale);
      cell(value, x + 1, y + 1, w - 2, h - 2, label, size, lines);
    }
    const check = (x,y) => tick(x * scale, y * scale);
    field('受理分局', [660,150,67,24], clean(settings.branch).replace(/分局$/, ''));
    field('行政區', [70,283,47,52], land.district, 9, 2);
    field('地段', [119,283,50,52], land.section, 9, 2);
    field('小段', [171,283,49,52], land.subSection, 9, 2);
    field('地號', [222,283,57,52], land.number, 8.5, 2);
    const share = shareInfo(land.transferShare);
    if (share.full) check(284,250);
    if (share.fraction) { check(284,303); field('移轉持分', [337,287,40,46], share.fraction, 8, 2); }
    field('整筆土地面積', [480,232,78,48], numeric(land.area));
    field('移轉面積', [480,284,78,50], numeric(draft.transferArea));
    const prev = scope.HGTaxPdf.dateParts(draft.previousDate) || [];
    [[645.5,232,20,48],[681.5,232,19,48],[717,232,19,48]].forEach((box,i) => field('前次移轉日期', box, prev[i], 8));
    field('前次現值單價', [649,285,83,48], numeric(draft.previousUnitValue));
    if (draft.declaredMode === '公告土地現值') check(758,251);
    if (draft.declaredMode === '每平方公尺') {
      check(758,283);
      field('申報單價', [759,300,117,26], numeric(draft.declaredUnitValue));
    }
    field('本筆土地契約所載金額', [281,338,117,34], numeric(draft.contractAmount));
    const dt = scope.HGTaxPdf.dateParts(reg.contractDate) || [];
    [[202,375,59,21],[282,375,35,21],[337,375,35,21]].forEach((box,i) => field('立契日期', box, dt[i], 8.5));
    const reasonX = {買賣:429, 贈與:485, 配偶贈與:541}[reason];
    if (reasonX) check(reasonX,378);
    const parties = [...sellers.map(p => [p,'義務人']), ...buyers.map(p => [p,'權利人'])];
    parties.forEach(([p, role], index) => {
      const y = [937,991,1045][index];
      field('申報人身分', [103,y,76,51], role);
      field('姓名', [183,y,72,51], p.name, 9, 2);
      field('統一編號', [258,y,83,51], p.ledgerId, 8.5, 2);
      const birth = scope.HGTaxPdf.dateParts(p.ledgerBirth) || [];
      [[344,y,46,25],[344,y+26,21,24],[367,y+26,23,24]].forEach((box,i) => field('出生日期', box, birth[i],8));
      field('當事人移轉範圍', [393,y,43,51], p.v50Share, 8, 2);
      field('戶籍地址', [501,y,297,25], p.ledgerHome, 8.5);
      field('電話', [857,y,106,51], p.phone, 8.5, 2);
    });
    markDraft(page, 215, 18);
    pdf.setTitle('臺南市土地增值稅（土地現值）申報書（草稿）');
    return pdf.save();
  }
  scope.HGLandTax = Object.freeze({inspect, generate});
})(typeof window === 'undefined' ? globalThis : window);
