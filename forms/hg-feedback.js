/* 作業台 D8：同仁回報與自動紀錄的計算（Claude 2026-11-19）
 * 只做計算，不碰網路：比對「電腦讀到的字」與「同仁最後改成的字」、彙整各欄修改比例、從修正紀錄學出常見辨識錯字、算帶入速度。
 * 紀錄只留欄位名稱與改動的 1～3 個字（例如「台→臺」），不留完整姓名、統一編號、住址。
 */
(function (root) {
  'use strict';
  var VERSION = 'D8-2026-11-19';
  var DOC_KEYS = { city: '縣市', district: '鄉鎮市區', section: '段', subSection: '小段', number: '地建號', area: '面積', mainArea: '面積', attachedArea: '附屬建物', address: '門牌', transferShare: '權利範圍' };
  var OWNER_KEYS = { name: '姓名', id: '統一編號', birth: '出生日期', address: '住址' };
  var PERSON_KEYS = { name: '姓名', ledgerId: '統一編號', ledgerBirth: '出生日期', ledgerHome: '住址', v50Share: '持分' };
  // 可以「自動校正」的欄位：只限文字欄；數字欄（地號、面積、權利範圍、日期）錯一個數字就是另一筆資料，不自動改
  var AUTO_FIELDS = ['土地.縣市', '土地.鄉鎮市區', '土地.段', '土地.小段', '建物.縣市', '建物.鄉鎮市區', '建物.段', '建物.小段', '建物.門牌',
    '共有部分.段', '共有部分.小段', '所有權人.姓名', '所有權人.住址', '所有權人.統一編號'];
  var ID_FIELD = '所有權人.統一編號';
  var RULE_MIN = 3, RULE_CASES = 2, HOT_MIN = 8, HOT_RATE = 0.2, MAX_LEN = 80;

  function s(v) { return String(v == null ? '' : v).trim(); }
  function docGroup(d) { return d && (d.common || (d.row && d.row.common)) ? '共有部分' : (d && d.row && d.row.kind) || '標的'; }
  function docField(d, k) { return docGroup(d) + '.' + (DOC_KEYS[k] || k); }
  function ownerField(k) { return '所有權人.' + (OWNER_KEYS[k] || PERSON_KEYS[k] || k); }

  /**
   * 比對兩個字串，找出改動的地方。
   * 回傳 null（相同）、{ runs: [[原字, 改成], …] }（改動零碎、每段 ≤3 字），或 { big: 1, la, lb }（整欄重打，只留長度）。
   */
  function diff(a, b) {
    a = s(a); b = s(b);
    if (a === b) return null;
    if (!a || !b || a.length > MAX_LEN || b.length > MAX_LEN) return { big: 1, la: a.length, lb: b.length };
    var A = Array.from(a), B = Array.from(b), n = A.length, m = B.length, i, j;
    var D = []; for (i = 0; i <= n; i++) { D.push(new Array(m + 1)); D[i][0] = i; }
    for (j = 0; j <= m; j++) D[0][j] = j;
    for (i = 1; i <= n; i++) for (j = 1; j <= m; j++) D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    // 由後往前回推，同字的地方切開
    var ops = []; i = n; j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && A[i - 1] === B[j - 1] && D[i][j] === D[i - 1][j - 1]) { ops.push(null); i--; j--; }
      else if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + 1) { ops.push([A[i - 1], B[j - 1]]); i--; j--; }
      else if (i > 0 && D[i][j] === D[i - 1][j] + 1) { ops.push([A[i - 1], '']); i--; }
      else { ops.push(['', B[j - 1]]); j--; }
    }
    ops.reverse();
    var runs = [], cur = null;
    ops.forEach(function (o) {
      if (!o) { if (cur) { runs.push(cur); cur = null; } return; }
      if (!cur) cur = ['', ''];
      cur[0] += o[0]; cur[1] += o[1];
    });
    if (cur) runs.push(cur);
    var tooBig = runs.length > 4 || runs.some(function (r) { return Array.from(r[0]).length > 3 || Array.from(r[1]).length > 3; }) || (Math.max(n, m) > 3 && D[n][m] * 2 > Math.max(n, m));
    return tooBig ? { big: 1, la: n, lb: m } : { runs: runs };
  }

  // 一筆修正 → 紀錄格式（欄位、來源、改動）
  function fix(f, src, before, after) {
    var d = diff(before, after);
    if (!d) return null;
    var o = { f: f, s: src || '' };
    if (d.big) { o.big = 1; o.la = d.la; o.lb = d.lb; } else o.runs = d.runs;
    return o;
  }

  function isDigitish(t) { return /^[0-9０-９.,，．\-－之/]*$/.test(t); }
  function isIdChar(t) { return /^[A-Z0-9]$/.test(t); }

  /**
   * 彙整紀錄 records（雲端 desk_feedback 列＋這台電腦暫存的列）：
   *  rates：各欄位 帶入次數／被修改次數；rules：學到的常見辨識錯字；speed：帶入速度；n：紀錄數
   */
  function learn(records, opt) {
    opt = opt || {};
    var minN = opt.ruleMin || RULE_MIN, minCases = opt.ruleCases || RULE_CASES;
    var rates = {}, pairs = {}, speed = {}, imports = 0, fails = 0, n = 0;
    function rate(f) { return rates[f] || (rates[f] = { f: f, checked: 0, changed: 0, ocrChecked: 0, ocrChanged: 0 }); }
    (records || []).forEach(function (r) {
      if (!r || !r.detail) return;
      var det = r.detail, cid = s(r.case_id) || ('?' + s(r.case_no));
      if (r.kind === 'fix') {
        n++;
        Object.keys(det.checked || {}).forEach(function (k) {
          var p = k.split('|'), x = rate(p[0]), c = Number(det.checked[k]) || 0;
          x.checked += c; if (p[1] === 'ocr') x.ocrChecked += c;
        });
        (det.fixes || []).forEach(function (fx) {
          if (!fx || !fx.f) return;
          var x = rate(fx.f); x.changed++; if (fx.s === 'ocr') x.ocrChanged++;
          if (fx.s !== 'ocr' || !fx.runs || AUTO_FIELDS.indexOf(fx.f) < 0) return;
          fx.runs.forEach(function (run) {
            var a = s(run[0]), b = s(run[1]);
            if (!a || !b || Array.from(a).length > 2 || Array.from(b).length > 2) return;
            if (fx.f === ID_FIELD ? !(isIdChar(a) && isIdChar(b)) : (isDigitish(a) || isDigitish(b))) return;
            var key = fx.f + '|' + a + '|' + b, p = pairs[key] || (pairs[key] = { f: fx.f, a: a, b: b, n: 0, cases: {} });
            p.n++; p.cases[cid] = 1;
          });
        });
      } else if (r.kind === 'import') {
        n++; imports++;
        if (det.fail) fails++;
        (det.files || []).forEach(function (fl) {
          var label = fl.t === 'img' ? '照片' : fl.m === 'ocr' ? '掃描 PDF' : fl.m === 'mixed' ? '電子謄本＋掃描頁' : '電子謄本';
          var x = speed[label] || (speed[label] = { label: label, files: 0, pages: 0, ms: 0, score: 0, scored: 0 });
          x.files++; x.pages += Number(fl.p) || 1; x.ms += Number(fl.ms) || 0;
          if (fl.sc) { x.score += Number(fl.sc); x.scored++; }
        });
      }
    });
    var rules = Object.keys(pairs).map(function (k) {
      var p = pairs[k], rev = pairs[p.f + '|' + p.b + '|' + p.a], cases = Object.keys(p.cases).length, rn = rev ? rev.n : 0;
      return { f: p.f, a: p.a, b: p.b, n: p.n, cases: cases, rev: rn, active: p.n >= minN && cases >= minCases && rn * 4 < p.n };
    }).sort(function (x, y) { return (y.active - x.active) || (y.n - x.n); });
    Object.keys(rates).forEach(function (k) { var x = rates[k]; x.rate = x.checked ? Math.min(1, x.changed / x.checked) : 0; });
    Object.keys(speed).forEach(function (k) { var x = speed[k]; x.secPerPage = x.pages ? Math.round(x.ms / x.pages / 100) / 10 : 0; x.avgScore = x.scored ? Math.round(x.score / x.scored * 100) : 0; });
    return { version: VERSION, n: n, imports: imports, fails: fails, rates: rates, rules: rules, speed: speed };
  }

  // 這欄過去常被修改嗎？（帶入過 HOT_MIN 次以上、修改比例 ≥ HOT_RATE）
  function hot(model, f, opt) {
    opt = opt || {};
    var x = model && model.rates && model.rates[f];
    if (!x || x.checked < (opt.min || HOT_MIN)) return 0;
    return x.rate >= (opt.rate || HOT_RATE) ? x.rate : 0;
  }
  function hotList(model, prefix, opt) {
    if (!model || !model.rates) return [];
    return Object.keys(model.rates).filter(function (f) { return (!prefix || prefix.some(function (p) { return f.indexOf(p) === 0; })) && hot(model, f, opt); })
      .map(function (f) { return model.rates[f]; }).sort(function (a, b) { return b.rate - a.rate; });
  }

  /**
   * 依學到的規則校正一個欄位值。統一編號只在「原本檢查碼不符、改了以後相符」時才改（opt.idCheck）。
   * 回傳 { value, applied: [[原字, 改成], …] }
   */
  function applyRules(value, f, model, opt) {
    opt = opt || {};
    var v = String(value == null ? '' : value), applied = [];
    if (!v || !model || !model.rules) return { value: v, applied: applied };
    var list = model.rules.filter(function (r) { return r.active && r.f === f; });
    if (!list.length) return { value: v, applied: applied };
    if (f === ID_FIELD) {
      var check = opt.idCheck;
      if (!check || check(v) === true) return { value: v, applied: applied };
      for (var i = 0; i < list.length; i++) {
        var r = list[i], at = v.indexOf(r.a);
        while (at > -1) {
          var t = v.slice(0, at) + r.b + v.slice(at + r.a.length);
          if (check(t) === true) return { value: t, applied: [[r.a, r.b]] };
          at = v.indexOf(r.a, at + 1);
        }
      }
      return { value: v, applied: applied };
    }
    list.forEach(function (r) { if (v.indexOf(r.a) > -1) { v = v.split(r.a).join(r.b); applied.push([r.a, r.b]); } });
    return { value: v, applied: applied };
  }

  // 警告文字裡的檔名（可能含客戶姓名）換掉
  function scrub(t) { return String(t == null ? '' : t).replace(/「[^」]{0,200}」/g, '「檔案」').slice(0, 300); }

  // 回報附帶紀錄的白話摘要
  function contextText(c) {
    if (!c || typeof c !== 'object') return '';
    var out = [];
    if (c.import) {
      var im = c.import, files = (im.files || []).map(function (f) { return (f.t === 'img' ? '照片' : f.m === 'text' ? '電子謄本' : '掃描 PDF') + ' ' + (f.p || 1) + ' 頁'; });
      out.push('謄本帶入：' + (files.join('、') || '無檔案') + '，' + Math.round((im.ms || 0) / 1000) + ' 秒' + (im.docs != null ? '，讀到 ' + im.docs + ' 筆標的' : '') + (im.owners ? '、' + im.owners + ' 位所有權人' : '') + (im.fail ? '，讀取失敗' : ''));
    }
    if (c.fixed && c.fixed.length) out.push('修改了：' + c.fixed.slice(0, 12).map(function (f) { return String(f).replace('.', '的'); }).join('、'));
    if (c.contract) out.push('合約辨識：找到 ' + (c.contract.found || 0) + ' 欄（綠燈 ' + (c.contract.green || 0) + ' 欄）');
    if (c.tab) out.push('畫面：' + c.tab);
    if (c.device) out.push(c.device);
    return out.join('；');
  }

  var api = { version: VERSION, DOC_KEYS: DOC_KEYS, OWNER_KEYS: OWNER_KEYS, PERSON_KEYS: PERSON_KEYS, AUTO_FIELDS: AUTO_FIELDS,
    docGroup: docGroup, docField: docField, ownerField: ownerField, diff: diff, fix: fix, learn: learn, hot: hot, hotList: hotList,
    applyRules: applyRules, scrub: scrub, contextText: contextText };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HGFeedback = api;
})(typeof window !== 'undefined' ? window : this);
