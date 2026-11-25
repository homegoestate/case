/* 宏國地政士作業台：謄本讀取（D3 2026-11-17；D7 2026-11-18 擴充所有權人資料與共有部分，Claude）
 * 第一段沿用 LINE 估價系統 v118 的標示部解析；D11 的持分檢核亦供所有權與共有部分使用。
 * 第二段：作業台轉接層。全部在瀏覽器內執行，不上傳檔案。 */
(function () {
'use strict';
/**
 * Conservative Taiwan transcript candidate parser. Pure Apps Script V8 JavaScript.
 * Property values come only from 標示部; the sole ownership-section exception is
 * the numeric current 權利範圍. No owner identities, addresses or birth dates leave
 * this function. This is not OCR and does not repair uncertain OCR characters.
 */
function transcriptParse_(text, options) {
  options = options || {};
  var result = {documents: [], fields: {}, issues: [], evidence: {version: 1,
    scope: 'display_section_and_numeric_current_share_only', records: []}};
  var seenIssues = {};
  function issue(key, code, message, documentKey) {
    var sig = [key, code, documentKey || ''].join('|');
    if (!seenIssues[sig]) {
      result.issues.push({key: key, code: code, message: message, raw: '', documentKey: documentKey || null});
      seenIssues[sig] = true;
    }
  }
  if (typeof text !== 'string' || !text.trim()) {
    issue('input', 'invalid_input', '尚無可讀取的謄本文字，請提供清晰謄本。');
    return result;
  }
  if (text.length > 120000) {
    issue('input', 'input_too_long', '謄本文字超過處理上限，請分批提供。');
    return result;
  }
  var at = options.at instanceof Date ? options.at : new Date(options.at || Date.now());
  if (!isFinite(at.getTime())) {
    issue('input', 'invalid_reference_date', '日期檢核基準無效。');
    return result;
  }
  var taiwan = new Date(at.getTime() + 8 * 3600000);
  var today = [taiwan.getUTCFullYear(), taiwan.getUTCMonth() + 1, taiwan.getUTCDate()];
  function normalize(s) {
    return s.replace(/[０-９Ａ-Ｚａ-ｚ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 65248); })
      .replace(/．/g, '.').replace(/[－﹣]/g, '-').replace(/，/g, ',').replace(/\u3000/g, ' ');
  }
  var lines = normalize(text).replace(/\r\n?/g, '\n').split('\n').map(function (line, index) {
    return {text: line.replace(/[\s\u200B\uFEFF]/g, ''), layout: line.replace(/[\u200B\uFEFF]/g, '').trim(), line: index + 1};
  });
  function evidence(doc, field, value, line, label) {
    result.evidence.records.push({documentKey: doc.key, field: field, value: value,
      line: line, label: label});
  }
  function numberText(s) { return s.replace(/^[：:]+/, '').replace(/^[＊*]+|[＊*]+$/g, ''); }
  var decimal = '(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\\.[0-9]+)?';
  var areaRe = new RegExp('^(' + decimal + ')(?:平方公尺|平方米|㎡|m²|m2)$', 'i');
  function area(s) {
    var m = numberText(s).match(areaRe), value = m ? Number(m[1].replace(/,/g, '')) : NaN;
    return isFinite(value) && value > 0 ? value : null;
  }
  function round(s) { return Math.round(s * 1000000) / 1000000; }
  function normalizeNumber(raw, kind) {
    var m = raw.match(kind === 'land' ? /^([0-9]{1,4})-([0-9]{1,4})$/ : /^([0-9]{1,5})-([0-9]{1,3})$/);
    if (!m || (kind === 'land' && m[1].length > 4)) return null;
    return ('00000' + m[1]).slice(kind === 'building' ? -5 : -4) + '-' + ('0000' + m[2]).slice(kind === 'land' ? -4 : -3);
  }
  function sectionEqual(a, b) {
    return a === b || (a.length > b.length && a.slice(-b.length) === b) || (b.length > a.length && b.slice(-a.length) === a);
  }
  var labelNames = '建物坐落地號|建物門牌|主要用途|主要建材|主要構造|建築完成日期|建築完成日|附屬建物用途|層次面積|層次|層數|總面積|面積|登記日期|登記原因|使用分區|使用地類別|其他登記事項|住址|出生日期|所有權人|統一編號';
  var labelBreak = new RegExp('(?:' + labelNames + ')[：:]');
  function buildingLayout(line) {
    // Only exact, whitespace-separated labels in a known-label row qualify.
    // Do not repair OCR glyphs, invent decimal points, or normalize owners.
    var whitelist = '建物門牌|主要建材|建築完成日期|總面積|層次面積|附屬建物用途|面積';
    if (!(new RegExp('^(?:' + labelNames + ')(?:[：:]|\\s|$)')).test(line.layout)) return line;
    var expanded = line.layout.replace(new RegExp('(^|\\s)(' + whitelist + ')(?=\\s|$)', 'g'), function (match, gap, label, offset, whole) {
      if (/^\s*[：:]/.test(whole.slice(offset + match.length))) return match;
      return gap + label + ':';
    });
    return {text: expanded.replace(/\s/g, ''), line: line.line, layoutExpanded: expanded !== line.layout};
  }
  function values(display, label) {
    var found = [];
    display.forEach(function (line, index) {
      var re = new RegExp('(?:' + label + ')[：:]', 'g'), match;
      while ((match = re.exec(line.text))) {
        var value = line.text.slice(match.index + match[0].length), end = value.search(labelBreak);
        if (end >= 0) value = value.slice(0, end);
        if (!value && display[index + 1] && !labelBreak.test(display[index + 1].text)) value = display[index + 1].text;
        found.push({value: numberText(value), line: line.line});
        // Each repeated explicit label must participate in the conflict check.
      }
    });
    return found;
  }
  function uniqueValue(doc, key, found, parse, label) {
    if (!found.length) return null;
    var parsed = [], invalid = false;
    found.forEach(function (item) {
      var value = parse(item.value);
      if (value === null) invalid = true;
      else if (!parsed.some(function (p) { return JSON.stringify(p.value) === JSON.stringify(value); })) parsed.push({value: value, line: item.line});
    });
    if (invalid || parsed.length !== 1) {
      issue(key, invalid ? 'unreadable_or_ambiguous_field' : 'conflicting_transcript_values', '謄本欄位不明確，請核對原圖。', doc.key);
      return null;
    }
    evidence(doc, key, parsed[0].value, parsed[0].line, label);
    return parsed[0].value;
  }
  function parseDate(value) {
    var m = value.match(/^(民國|西元)?([0-9]{2,4})年([0-9]{1,2})月([0-9]{1,2})日$/);
    if (!m) return null;
    var y = Number(m[2]), mo = Number(m[3]), d = Number(m[4]);
    if (m[1] === '民國' || (!m[1] && m[2].length <= 3)) y += 1911;
    else if (m[2].length !== 4) return null;
    var check = new Date(Date.UTC(y, mo - 1, d));
    if (Number(m[2]) < 1 || check.getUTCFullYear() !== y || check.getUTCMonth() + 1 !== mo || check.getUTCDate() !== d) return null;
    if (y * 10000 + mo * 100 + d > today[0] * 10000 + today[1] * 100 + today[2]) return null;
    return {year: y, month: mo, day: d, rocYear: y - 1911};
  }
  function parseAddress(value) {
    // A header may omit city/district; do not invent them from an owner address.
    if (value.length > 100 || /[：:<>?？�]|所有權|出生|統一編號|住址/.test(value)) return null;
    var doors = value.match(/[0-9一二三四五六七八九十百零〇]+(?:之[0-9一二三四五六七八九十百零〇]+)?號/g) || [];
    if (doors.length !== 1) return null;
    return /^[\u3400-\u9fff0-9]+[路街道巷弄][\u3400-\u9fff0-9-]*號(?:之[0-9一二三四五六七八九十百零〇]+)?(?:[0-9一二三四五六七八九十百零〇地下]+樓(?:之[0-9一二三四五六七八九十百零〇]+)?)?$/.test(value) ? value : null;
  }
  function parseRefs(value) {
    if (/[?？�]/.test(value)) return null;
    var pieces = value.split(/[、,;；]/).filter(Boolean), refs = [];
    if (!pieces.length) return null;
    for (var i = 0; i < pieces.length; i++) {
      var m = pieces[i].match(/^([\u3400-\u9fff]+段(?:[\u3400-\u9fff]+小段)?)([0-9]{1,4}-[0-9]{1,4})(?:地號)?$/);
      if (!m) return null;
      var n = normalizeNumber(m[2], 'land');
      refs.push({section: m[1], number: n, explicit: true});
    }
    return refs.filter(function (r, index) { return refs.findIndex(function (x) { return x.section === r.section && x.number === r.number; }) === index; });
  }
  var titlePattern = /^(?:臺南市|台南市)([㐀-鿿]{1,6}區)[0-9]{4}([㐀-鿿]+段)([0-9]{1,5}-[0-9]{1,3})建號$/;
  function registryTitleKey(l) {
    var m = l.text.match(titlePattern);
    return m ? m[1] + ":" + m[2] + ":" + m[0].match(/[0-9]{4}/)[0] + ":" + normalizeNumber(m[3], "building") : "";
  }
  var starts = [];
  lines.forEach(function (line, index) {
    var m = line.text.match(/^(建物|土地)登記第[一二三123]類謄本/);
    if (m) starts.push({index: index, kind: m[1] === '建物' ? 'building' : 'land'});
  });
  if (!starts.length) {
    lines.forEach(function (line, index) {
      var m = line.text.match(/(?:^|[＊*])(建物|土地)標示部/);
      if (m) starts.push({index: Math.max(0, index - 12), kind: m[1] === '建物' ? 'building' : 'land'});
    });
  }
  if (!starts.length) {
    issue('input', 'unrecognized_transcript', '未找到可辨識的謄本標示部；不可由零散 OCR 文字推測標的。');
    return result;
  }
  var pages = starts;
  starts = [];
  pages.forEach(function (page, i) {
    var prior = starts[starts.length - 1];
    if (prior && prior.kind === "building" && page.kind === "building") {
      var first = lines.slice(prior.index, page.index);
      var following = lines.slice(page.index, i+1 < pages.length ? pages[i+1].index : lines.length);
      var label = "建物標示部", own = "建物所有權部";
      var display = first.findIndex(function (l) { return l.text.indexOf(label) >= 0; });
      var owner = following.findIndex(function (l) { return l.text.indexOf(own) >= 0; });
      if (display >= 0 && owner >= 0 && !following.some(function (l) { return l.text.indexOf(label) >= 0; })) {
        var main = first.slice(0, display).map(registryTitleKey).filter(Boolean);
        var cont = following.map(registryTitleKey).filter(Boolean);
        if (main.length === 1 && cont.length === 1 && main[0] === cont[0] && following.slice(0, owner).some(function (l) { return registryTitleKey(l) === main[0]; })) return;
      }
    }
    starts.push(page);
  });
  starts.forEach(function (start, blockIndex) {
    var end = blockIndex + 1 < starts.length ? starts[blockIndex + 1].index : lines.length;
    var block = lines.slice(start.index, end), isBuilding = start.kind === 'building';
    var displayIndex = block.findIndex(function (l) { return l.text.indexOf(isBuilding ? '建物標示部' : '土地標示部') >= 0; });
    var doc = {kind: start.kind, key: null, section: null, number: null, address: null,
      landRefs: [], mainAreaM2: null, accessoryAreas: [], otherAreaNotes: [], floorAreas: [], registeredSubtotalM2: null,
      completion: null, structure: null, purpose: null, share: null, areaM2: null,
      shareAreaM2: null, linkedToBuilding: false};
    if (displayIndex < 0) {
      issue('input', 'missing_display_section', '此份謄本缺少可讀取的標示部。');
      result.documents.push(doc);
      return;
    }
    var idPattern = new RegExp('^([\\u3400-\\u9fff]+段(?:[\\u3400-\\u9fff]+小段)?)(' + (isBuilding ? '[0-9]{1,5}-[0-9]{1,3}' : '[0-9]{1,4}-[0-9]{1,4}') + ')' + (isBuilding ? '建號' : '地號') + '$');
    var sectionEnd = displayIndex + 1;
    while (sectionEnd < block.length && !/(?:土地|建物)(?:所有權部|他項權利部)/.test(block[sectionEnd].text)) sectionEnd++;
    var ids = [], laterIds = [];
    var registry = null;
    if (isBuilding) {
      var titles = block.slice(0,displayIndex).map(function(l){return {m:l.text.match(titlePattern),line:l.line};}).filter(function(v){return v.m;});
      var identityLines = block.slice(displayIndex+1,sectionEnd);
      var identityStop = identityLines.findIndex(function(l) {
        return /^其他登記事項(?:[：:]|\s|$)/.test(l.layout) || /^共有部分(?:[：:]|\s|$)/.test(l.layout) || /(?:^|\s)(?:所有權人|住址|出生日期|統一編號)(?=[：:\s]|$)/.test(l.layout);
      });
      if (identityStop >= 0) identityLines = identityLines.slice(0,identityStop);
      var numbers = identityLines.map(function(l){var m=l.text.match(/^建號[：:]?([0-9]{1,5}-[0-9]{1,3})$/);return m&&normalizeNumber(m[1],start.kind);}).filter(Boolean);
      if(titles.length===1 && numbers.length===1 && normalizeNumber(titles[0].m[3],start.kind)===numbers[0]) {
        registry=titles[0]; ids.push({section:'臺南市'+registry.m[1]+registry.m[2],number:numbers[0],line:registry.line});
      }
    }
    function readIdentity(line) {
      var headerText = line.text.replace(/^(?:建物|土地)登記第[一二三123]類謄本(?:[（(][^）)]*[）)])?/, '');
      var m = headerText.match(idPattern);
      return m ? {section: m[1], number: normalizeNumber(m[2], start.kind), line: line.line} : null;
    }
    function addIdentity(id) {
      if (id && (!isBuilding || !ids.some(function (prior) { return prior.section === id.section && prior.number === id.number; }))) ids.push(id);
    }
    block.slice(0, displayIndex).forEach(function (line) { addIdentity(readIdentity(line)); });
    if (isBuilding) {
      var identityPrefix = true, identityBoundary = false;
      block.slice(displayIndex + 1, sectionEnd).forEach(function (line) {
        if (/^其他登記事項(?:[：:]|\s|$)/.test(line.layout) || /(?:^|\s)(?:所有權人|住址|出生日期|統一編號)(?=[：:\s]|$)/.test(line.layout)) identityBoundary = true;
        if (identityBoundary) return;
        if (registry && /^共有部分(?:[：:]|\s)/.test(line.layout)) return;
        var id = readIdentity(line);
        if (id && identityPrefix) addIdentity(id);
        else if (id) laterIds.push(id);
        else if (line.text && !/^[＊*\-]+$/.test(line.text)) identityPrefix = false;
      });
    }
    if (registry) {
      var originalTitle = registryTitleKey({text:registry.m[0]});
      if (block.slice(displayIndex+1).some(function (line) {
        var key = registryTitleKey(line);
        return key && key !== originalTitle;
      })) laterIds.push({section:"",number:""});
    }
    var lateConflict = laterIds.some(function (id) {
      return !ids.some(function (prior) { return prior.section === id.section && prior.number === id.number; });
    });
    if (ids.length !== 1 || !ids[0].number || lateConflict || (isBuilding && titles.length && !registry)) issue('identity', 'ambiguous_document_identity', '段名與建號／地號不明確，不能自動帶入標的。');
    else {
      doc.section = ids[0].section; doc.number = ids[0].number;
      // Exact registry jurisdiction/code is part of durable identity, not just page-merge evidence.
      doc.key = registry ? doc.kind + ':registry:' + registryTitleKey({text:registry.m[0]}) : doc.kind + ':' + doc.section + ':' + doc.number;
      evidence(doc, 'identity', {section: doc.section, number: doc.number}, ids[0].line, isBuilding ? '建號' : '地號');
    }
    var display = block.slice(displayIndex + 1, sectionEnd);
    // Free-form remarks are not another source of structured property fields.
    var remarks = display.findIndex(function (l) { return /^其他登記事項[：:]/.test(l.text) || (isBuilding && /^其他登記事項(?:\s|$)/.test(l.layout)); });
    if (remarks >= 0) display = display.slice(0, remarks);
    var personalBoundary = display.findIndex(function (l) { return /^(?:所有權人|住址|出生日期|統一編號)[：:]/.test(l.text) || (isBuilding && /(?:^|\s)(?:所有權人|住址|出生日期|統一編號)(?=[：:\s]|$)/.test(l.layout)); });
    if (personalBoundary >= 0) {
      display = display.slice(0, personalBoundary);
      issue('input', 'uncertain_section_boundary', '標示部中混入所有權資料，已在該處停止擷取，請核對 OCR 分區。', doc.key);
    }
    if (isBuilding) {
      // 共有部分是另一個建號，其後面積、權利範圍及附註均不屬於主建物。
      var commonStart = display.findIndex(function (l) { return /^共有部分(?:[：:]|\s|$)/.test(l.layout); });
      if (commonStart >= 0) display = display.slice(0, commonStart);
      display = display.map(buildingLayout);
      doc.address = uniqueValue(doc, 'address', values(display, '建物門牌'), parseAddress, '建物門牌');
      doc.landRefs = uniqueValue(doc, 'landRefs', values(display, '建物坐落地號'), parseRefs, '建物坐落地號') || [];
      doc.mainAreaM2 = uniqueValue(doc, 'mainAreaM2', values(display, '總面積'), area, '總面積');
      doc.completion = uniqueValue(doc, 'completed', values(display, '建築完成日期|建築完成日'), parseDate, '建築完成日期');
      doc.structure = uniqueValue(doc, 'structure', values(display, '主要建材|主要構造'), function (v) {
        return /^(?:鋼筋混凝土造|鋼骨鋼筋混凝土造|鋼骨造|鋼構造|加強磚造|磚造|木造|混合構造)$/.test(v) ? v : null;
      }, '主要建材');
      doc.purpose = uniqueValue(doc, 'purpose', values(display, '主要用途'), function (v) {
        return /^(?:住宅|停車空間|停車場|店舖|店鋪|辦公室|辦公用|住家用|商業用|集合住宅|樓梯間|倉庫|工廠)(?:[、,](?:住宅|停車空間|停車場|店舖|店鋪|辦公室|辦公用|住家用|商業用|集合住宅|樓梯間|倉庫|工廠))*$/.test(v) ? v.replace(/,/g, '、') : null;
      }, '主要用途');
      var accessorySeen = false, accessoryInvalid = false;
      display.forEach(function (line, index) {
        if (line.text.indexOf('附屬建物用途') >= 0) {
          accessorySeen = true;
          var m = line.text.match(/附屬建物用途[：:]([\u3400-\u9fff]+)(?:面積[：:](.*))?$/);
          var areaText = m && m[2] ? m[2] : '';
          var extraArea = areaText.match(new RegExp('^(.*?)(屋簷)([＊*]*' + decimal + '(?:平方公尺|平方米|㎡|m²|m2))$', 'i'));
          if (extraArea && area(extraArea[1]) !== null && area(extraArea[3]) !== null) {
            areaText = extraArea[1];
            var note = {label: extraArea[2], areaM2: area(extraArea[3]), scope: 'unconfirmed'};
            doc.otherAreaNotes.push(note);
            evidence(doc, 'otherAreaNotes', note, line.line, '屋簷');
            issue('buildingArea', 'additional_area_note_unconfirmed', '另有屋簷面積記載；歸屬及是否已含於其他面積尚未確認，未加入主建物與已辨識附屬小計。', doc.key);
          }
          var amount = areaText ? area(areaText) : null;
          if (m && !m[2]) {
            // OCR may put a right-column area immediately before its left-column
            // accessory label. Accept only one adjacent explicit area, not a
            // free number or a floor area from the reordered floor table.
            var adjacent = [];
            [display[index - 1], display[index + 1]].forEach(function (nearby) {
              var matched = nearby && nearby.text.match(/^面積[：:](.*)$/);
              if (matched) adjacent.push(area(matched[1]));
            });
            if (adjacent.length === 1 && adjacent[0] !== null) amount = adjacent[0];
          }
          if (m && /^(?:陽台|雨遮|花台|平台|露台)$/.test(m[1]) && amount !== null) {
            var accessory = {kind: m[1], areaM2: amount};
            doc.accessoryAreas.push(accessory);
            evidence(doc, 'accessoryAreas', accessory, line.line, '附屬建物用途／面積');
          } else {
            accessoryInvalid = true;
            issue('accessoryAreas', 'ambiguous_accessory_area', '附屬建物用途與面積未能一對一辨識，請核對。', doc.key);
          }
        }
        var floorPattern = /(?:層次[：:])?([一二三四五六七八九十百零〇0-9]+層|屋頂突出物)(?:層次面積[：:])?[：:]?([＊*0-9,.]+(?:平方公尺|平方米|㎡|m²|m2))/gi, floor;
        while ((floor = floorPattern.exec(line.text))) {
          if (area(floor[2]) !== null) {
            doc.floorAreas.push({label: floor[1], areaM2: area(floor[2]), includedInMainTotal: null});
            evidence(doc, 'floorAreas', {label: floor[1], areaM2: area(floor[2])}, line.line, '層次面積');
          }
        }
      });
      var floorSum = round(doc.floorAreas.reduce(function (n, f) { return n + f.areaM2; }, 0));
      if (doc.mainAreaM2 !== null && doc.floorAreas.length && floorSum === doc.mainAreaM2) {
        doc.floorAreas.forEach(function (f) { f.includedInMainTotal = true; });
      }
      if (display.some(function (line) { return /層次面積|屋頂突出物/.test(line.text); }) &&
          (!doc.floorAreas.length || (doc.mainAreaM2 !== null && floorSum !== doc.mainAreaM2))) {
        issue('floorAreas', 'ambiguous_floor_layout', '樓層標籤與面積可能因 OCR 重新排序，未依數字出現順序強行配對；屋頂突出物不另加到總面積。', doc.key);
      }
      if (doc.accessoryAreas.some(function (item, index) {
        return doc.accessoryAreas.slice(0, index).some(function (prior) { return prior.kind === item.kind; });
      })) {
        accessoryInvalid = true;
        issue('accessoryAreas', 'repeated_accessory_scope', '附屬建物種類重複，可能為重複辨識或不同範圍，未自動相加。', doc.key);
      }
      // Never add floors or rooftop projection to the explicit main total again.
      if (doc.mainAreaM2 !== null && accessorySeen && !accessoryInvalid) {
        doc.registeredSubtotalM2 = round(doc.mainAreaM2 + doc.accessoryAreas.reduce(function (n, a) { return n + a.areaM2; }, 0));
        doc.registeredSubtotalBasis = 'main_plus_identified_accessories_excludes_unverified_common_parts';
      }
      issue('buildingArea', 'area_scope_unconfirmed', '主建物與附屬建物分開保留；共有部分及權狀總坪數口徑仍須確認，未自動填入一般建坪。', doc.key);
      issue('parkingIncluded', 'parking_scope_unconfirmed', '謄本用途含停車空間不等於建物面積含車位，仍須確認面積範圍。', doc.key);
    } else {
      // Only an explicit parcel 面積 label in a known-label row. A prior
      // registration label may share the row, but no OCR words are stripped
      // from the area value and no announcement value is substituted.
      var parcelAreas = [];
      display.forEach(function (line) {
        // OCR can concatenate the two columns. Split only at explicit known
        // labels, preserving repeated area fields so conflicts still block use.
        var labels = [], pattern = new RegExp('(' + labelNames + ')[：:]', 'g'), match;
        while ((match = pattern.exec(line.text))) labels.push({label: match[1], start: match.index, end: pattern.lastIndex});
        if (!labels.length || labels[0].start !== 0) return;
        labels.forEach(function (label, index) {
          if (label.label !== '面積') return;
          var end = index + 1 < labels.length ? labels[index + 1].start : line.text.length;
          parcelAreas.push({value: numberText(line.text.slice(label.end, end)), line: line.line});
        });
      });
      doc.areaM2 = uniqueValue(doc, 'landArea', parcelAreas, area, '面積');
      if (doc.areaM2 === null) issue('landArea', 'unreadable_or_ambiguous_field', '土地面積未提供或欄位不明確，請核對原圖；不由公告現值、雜字後數字或其他資料推估。', doc.key);
    }
    var ownerStart = block.findIndex(function (l, i) { return i >= sectionEnd && /(?:土地|建物)所有權部/.test(l.text); });
    if (ownerStart >= 0) {
      var ownerEnd = block.findIndex(function (l, i) { return i > ownerStart && /(?:土地|建物)他項權利部/.test(l.text); });
      var ownerLines = block.slice(ownerStart + 1, ownerEnd < 0 ? block.length : ownerEnd), shareRows = [];
      ownerLines.forEach(function (line) {
        var m = line.text.match(/^權利範圍[：:](.*)$/);
        if (!m) return;
        var share = hgReadShare(m[1]);
        shareRows.push({share: share, line: line.line});
      });
      if (shareRows.length === 1 && shareRows[0].share) {
        doc.share = shareRows[0].share;
        evidence(doc, 'share', doc.share, shareRows[0].line, '權利範圍');
      } else {
        issue('share', 'missing_or_unreadable_share', '所有權部未辨識到唯一可靠的本次權利範圍；不得以歷次取得持分替代，請核對原圖。', doc.key);
        if (shareRows.length) issue('share', shareRows.length > 1 ? 'multiple_ownership_entries' : 'ambiguous_share', '持分不明或有多筆所有權，請確認本次標的權利範圍。', doc.key);
      }
    }
    if (!isBuilding && doc.areaM2 !== null && doc.share) doc.shareAreaM2 = round(doc.areaM2 * doc.share.numerator / doc.share.denominator);
    var duplicate = result.documents.filter(function (d) { return doc.key && d.key === doc.key; })[0];
    if (!duplicate) result.documents.push(doc);
    else if (JSON.stringify(duplicate) !== JSON.stringify(doc)) {
      issue('identity', 'conflicting_document_copies', '同一建號／地號出現不同資料，未自動選用其中一份。', doc.key);
      result.documents.push(doc);
    }
  });
  result.documents.forEach(function (doc) {
    doc.issues = result.issues.filter(function (item) { return item.documentKey === doc.key; });
  });
  var assembled = transcriptAssembleDocuments_(result.documents, {
    at: options.at, existingFields: options.existingFields, issues: result.issues
  });
  assembled.evidence = result.evidence;
  return assembled;
}

/**
 * Assemble independently parsed, already-whitelisted documents, e.g. a LINE
 * imageSet. Never re-create OCR text. Transient link issues are re-evaluated;
 * original field/format issues survive through each document's issues array.
 * Input documents and supplied fields are not mutated. Attachment source
 * metadata is carried through unchanged and is not used to infer property data.
 */
function transcriptAssembleDocuments_(documents, options) {
  options = options || {};
  var result = {documents: [], fields: {}, issues: [], evidence: {version: 1,
    scope: 'display_section_and_numeric_current_share_only', records: []}};
  var seenIssues = {};
  var transientCodes = /^(?:missing_linked_land_or_share|ambiguous_land_link|unlinked_land|multiple_buildings|existing_value_preserved|conflicting_document_copies)$/;
  function issue(key, code, message, documentKey) {
    var sig = [key, code, documentKey || ''].join('|');
    if (!seenIssues[sig]) {
      result.issues.push({key: key, code: code, message: message, raw: '', documentKey: documentKey || null});
      seenIssues[sig] = true;
    }
  }
  function preserveIssues(items) {
    (Array.isArray(items) ? items : []).forEach(function (item) {
      if (item && !transientCodes.test(item.code || '')) issue(item.key, item.code, item.message, item.documentKey);
    });
  }
  function round(value) { return Math.round(value * 1000000) / 1000000; }
  function sectionEqual(a, b) {
    return typeof a === 'string' && typeof b === 'string' && a.length > 0 && b.length > 0 &&
      (a === b || (a.length > b.length && a.slice(-b.length) === b) || (b.length > a.length && b.slice(-a.length) === a));
  }
  var coreKeys = ['kind', 'key', 'section', 'number', 'address', 'landRefs', 'mainAreaM2', 'accessoryAreas', 'otherAreaNotes',
    'floorAreas', 'registeredSubtotalM2', 'registeredSubtotalBasis', 'completion', 'structure', 'purpose', 'share', 'areaM2'];
  function identity(doc) {
    return JSON.stringify(coreKeys.map(function (key) { return typeof doc[key] === 'undefined' ? null : doc[key]; }));
  }
  preserveIssues(options.issues);
  if (!Array.isArray(documents)) {
    issue('input', 'invalid_documents', '尚無可組裝的謄本結構資料。');
    return result;
  }
  documents.forEach(function (source) {
    if (!source || (source.kind !== 'building' && source.kind !== 'land')) {
      issue('input', 'invalid_document_kind', '謄本類型不明，未加入送估標的。');
      return;
    }
    var doc = JSON.parse(JSON.stringify(source));
    preserveIssues(doc.issues);
    doc.linkedToBuilding = false;
    delete doc.linkedBuildingKey;
    doc.landRefs = Array.isArray(doc.landRefs) ? doc.landRefs : [];
    if (doc.kind === 'land') {
      var share = doc.share;
      doc.shareAreaM2 = typeof doc.areaM2 === 'number' && isFinite(doc.areaM2) && doc.areaM2 > 0 && share &&
        Number.isSafeInteger(share.numerator) && Number.isSafeInteger(share.denominator) && share.denominator > 0 &&
        share.numerator > 0 && share.numerator <= share.denominator ? round(doc.areaM2 * share.numerator / share.denominator) : null;
    }
    var sameKey = result.documents.filter(function (other) { return doc.key && other.key === doc.key; });
    if (sameKey.some(function (other) { return identity(other) === identity(doc); })) return;
    if (sameKey.length) issue('identity', 'conflicting_document_copies', '同一建號／地號出現不同資料，未自動選用其中一份。', doc.key);
    result.documents.push(doc);
  });
  function field(key, value, raw, extra) {
    var existing = options.existingFields || {};
    if (Object.prototype.hasOwnProperty.call(existing, key) && existing[key] !== null && typeof existing[key] !== 'undefined') {
      var old = existing[key] && Object.prototype.hasOwnProperty.call(existing[key], 'value') ? existing[key].value : existing[key];
      if (JSON.stringify(old) !== JSON.stringify(value)) issue(key, 'existing_value_preserved', '已提供的欄位與謄本候選值不同；保留原值，請人工確認。');
      return;
    }
    result.fields[key] = {value: value, raw: raw, source: 'transcript'};
    if (extra) Object.keys(extra).forEach(function (k) { result.fields[key][k] = extra[k]; });
  }
  var buildings = result.documents.filter(function (d) { return d.kind === 'building'; });
  var lands = result.documents.filter(function (d) { return d.kind === 'land'; });
  if (buildings.length > 1) issue('address', 'multiple_buildings', '含多筆建物，請先指定本次送估標的，不自動合併。');
  else if (buildings.length === 1 && buildings[0].key) {
    var building = buildings[0];
    if (building.address) field('address', building.address, '建物標示部／建物門牌：' + building.address);
    if (building.structure) field('structure', building.structure, '建物標示部／主要建材：' + building.structure);
    if (building.completion) field('completed', {year: building.completion.year, month: building.completion.month}, '建物標示部／建築完成日期：民國' + building.completion.rocYear + '年' + building.completion.month + '月' + building.completion.day + '日');
    var linked = [], linkComplete = building.landRefs.length > 0;
    building.landRefs.forEach(function (ref) {
      // A shortened base-section reference may inherit the building's district,
      // never a different district merely because the section name ends alike.
      var expectedSection = sectionEqual(building.section, ref.section) && building.section.length > ref.section.length ? building.section : ref.section;
      var matches = lands.filter(function (land) { return land.key && land.number === ref.number && sectionEqual(land.section, expectedSection); });
      if (matches.length !== 1 || matches[0].shareAreaM2 === null) {
        linkComplete = false;
        issue('landArea', matches.length > 1 ? 'ambiguous_land_link' : 'missing_linked_land_or_share', '建物坐落地號缺少唯一可核對的土地面積或持分，未自動計算地坪。', building.key);
      } else {
        matches[0].linkedToBuilding = true;
        matches[0].linkedBuildingKey = building.key;
        if (linked.indexOf(matches[0]) < 0) linked.push(matches[0]);
      }
    });
    if (linkComplete && linked.length) {
      var linkedArea = round(linked.reduce(function (n, l) { return n + l.shareAreaM2; }, 0));
      field('landArea', {ping: round(linkedArea * 0.3025), unit: '平方公尺', original: linkedArea},
        '建物明示坐落地號之土地面積乘各筆權利範圍', {basis: 'shareApplied', documentKeys: linked.map(function (d) { return d.key; })});
    }
  }
  lands.forEach(function (land) {
    if (!land.linkedToBuilding) issue('landArea', 'unlinked_land', '此土地未由唯一建物的坐落地號明確關聯，保留獨立資料，不加進本次地坪。', land.key);
  });
  result.documents.forEach(function (doc) {
    doc.issues = result.issues.filter(function (item) { return item.documentKey === doc.key; });
    coreKeys.forEach(function (key) {
      if (key !== 'kind' && key !== 'key' && typeof doc[key] !== 'undefined' && doc[key] !== null) {
        result.evidence.records.push({documentKey: doc.key, field: key, value: doc[key], source: 'structured_document'});
      }
    });
  });
  return result;
}

// ---- 地政士作業台轉接層（Claude 2026-11-17 D3；2026-11-18 D7 擴充）----
// 上方標示部規則源自 LINE 估價系統 v118；持分必須符合完整原文。
// 這一層做：1) 同一筆謄本跨頁重複的抬頭先合併；2) 換成作業台「標的明細」欄位；
// 3) 讀出所有權人（姓名、統一編號、出生日期、住址、權利範圍）與他項權利摘要，供畫面核對；同仁勾選後才帶入賣方；
// 4) D7：建物標示部的「共有部分」（建號、面積、權利範圍、其他登記事項）另列成可帶入的建物列。
var HG_CITY = '(?:[臺台]北|新北|桃園|[臺台]中|[臺台]南|高雄|基隆|新竹|嘉義)市|(?:新竹|苗栗|彰化|南投|雲林|嘉義|屏東|宜蘭|花蓮|[臺台]東|澎湖|金門|連江)縣';
// 電子謄本抬頭常省略縣市（例：北區北元段 0097-0015地號），所以行政區可單獨出現
var hgSecRe = new RegExp('^(' + HG_CITY + ')?([\\u3400-\\u9fff]{1,3}?[區鄉鎮市])?([\\u3400-\\u9fff]+?段)([\\u3400-\\u9fff]+?小段)?$');
var hgCityRe = new RegExp('資料管轄機關[：:](' + HG_CITY + ')');
var hgTitleRe = /^(建物|土地)登記第[一二三123]類謄本/;
var hgIdRe = /([㐀-鿿]+段(?:[㐀-鿿]+小段)?)([0-9]{1,5}-[0-9]{1,4})(地號|建號)$/;
var HG_MASK = /[○●◯〇Ｏ＊*□＿_?？×✕]/;
var HG_LABELS = ['登記次序', '登記日期', '登記原因', '原因發生日期', '所有權人', '統一編號', '住址', '出生日期', '權利範圍', '權狀字號',
  '當期申報地價', '前次移轉現值或原規定地價', '前次移轉現值', '歷次取得權利範圍', '相關他項權利登記次序', '其他登記事項', '權利種類',
  '收件年期', '字號', '權利人', '債權額比例', '擔保債權總金額', '擔保債權總額', '擔保債權種類及範圍', '擔保債權確定期日', '存續期間',
  '清償日期', '利息', '遲延利息', '違約金', '債務人及債務額比例', '權利標的', '標的登記次序', '設定權利範圍', '證明書字號', '設定義務人',
  '共同擔保地號', '共同擔保建號', '流抵約定', '其他擔保範圍約定', '管理者'];
var hgLabelRe = new RegExp('(' + HG_LABELS.slice().sort(function (a, b) { return b.length - a.length; }).join('|') + ')[：:]', 'g');
// 與估價系統用途不同、在作業台不需要顯示的提醒（地坪連動、送估標的選擇、車位口徑）
var HG_SKIP_CODES = /^(?:area_scope_unconfirmed|parking_scope_unconfirmed|unlinked_land|missing_linked_land_or_share|ambiguous_land_link|multiple_buildings|existing_value_preserved)$/;
var HG_DESK_KEYS = /^(?:identity|input|address|mainAreaM2|accessoryAreas|landArea|share)$/;

function hgNormalize(s) {
  return String(s || '').replace(/[０-９Ａ-Ｚａ-ｚ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 65248); })
    .replace(/．/g, '.').replace(/[－﹣]/g, '-').replace(/，/g, ',').replace(/　/g, ' ');
}
function hgStrip(s) { return s.replace(/[\s​﻿]/g, ''); }
function hgSplitSection(s) {
  var m = String(s || '').match(hgSecRe);
  if (!m) return { city: '', district: '', section: String(s || ''), subSection: '' };
  return { city: (m[1] || '').replace(/^台/, '臺'), district: m[2] || '', section: m[3], subSection: m[4] || '' };
}
// 0123-0004 → 123-4；0123-0000 → 123；建號 01234-000 → 1234
function hgNumber(n) {
  var m = String(n || '').match(/^0*(\d+)-0*(\d+)$/);
  if (!m) return String(n || '');
  return Number(m[2]) === 0 ? String(Number(m[1])) : Number(m[1]) + '-' + Number(m[2]);
}
function hgShare(share) {
  if (!share || !share.denominator) return '';
  return share.numerator === share.denominator ? '全部' : share.numerator + '/' + share.denominator;
}
function hgReadShare(value) {
  var text = String(value || '').replace(/\s/g, '').replace(/^[＊*]+|[＊*]+$/g, '').replace(/^全部[＊*]+/, '全部');
  if (text === '全部') return {numerator: 1, denominator: 1};
  var m = text.match(/^(全部)?([0-9]+)分之([0-9]+)$/);
  if (!m) return null;
  var den = Number(m[2]), num = Number(m[3]);
  if (!Number.isSafeInteger(den) || !Number.isSafeInteger(num) || num < 1 || den < num || (m[1] && den !== num)) return null;
  return {numerator: num, denominator: den};
}
function hgShareText(value) { return hgShare(hgReadShare(value)); }
function hgSameSection(a, b) {
  a = String(a || '').replace(/臺/g, '台'); b = String(b || '').replace(/臺/g, '台');
  return !!a && !!b && (a === b || a.slice(-b.length) === b || b.slice(-a.length) === a);
}
// 一行裡的「標籤：值」逐一切開（同一行可能有兩欄）
function hgPairs(line) {
  var found = [], m;
  hgLabelRe.lastIndex = 0;
  while ((m = hgLabelRe.exec(line))) found.push({ label: m[1], start: m.index, end: hgLabelRe.lastIndex });
  return found.map(function (f, i) {
    var value = line.slice(f.end, i + 1 < found.length ? found[i + 1].start : line.length);
    return {label:f.label, value:value};
  });
}

// 民國 063年03月15日 → 1974-03-15（不合理的日期回傳空字串）
function hgRocDate(s) {
  var m = hgStrip(hgNormalize(s)).match(/^(?:民國)?(\d{2,3})年(\d{1,2})月(\d{1,2})日$/);
  if (!m) return '';
  var y = Number(m[1]) + 1911, mo = Number(m[2]), d = Number(m[3]), t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() + 1 !== mo || t.getUTCDate() !== d) return '';
  return y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
}
// 統一編號檢查碼：身分證、新式居留證（第 2 碼 8／9）、舊式居留證（第 2 碼 A～D）、公司統編 8 碼。
// 回傳 true／false；有遮罩或格式不明時回傳 null（不判斷）。
var HG_ID_LETTER = { A: 10, B: 11, C: 12, D: 13, E: 14, F: 15, G: 16, H: 17, I: 34, J: 18, K: 19, L: 20, M: 21, N: 22, O: 35, P: 23, Q: 24, R: 25, S: 26, T: 27, U: 28, V: 29, W: 32, X: 30, Y: 31, Z: 33 };
function hgIdCheck(id) {
  id = String(id || '').toUpperCase();
  if (!id || HG_MASK.test(id)) return null;
  var m = id.match(/^([A-Z])([0-9A-D])(\d{8})$/);
  if (m) {
    var head = HG_ID_LETTER[m[1]], second = /\d/.test(m[2]) ? Number(m[2]) : HG_ID_LETTER[m[2]] % 10;
    if (/\d/.test(m[2]) && !/[1289]/.test(m[2])) return false;
    var digits = [Math.floor(head / 10), head % 10, second].concat(m[3].split('').map(Number)), w = [1, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1], sum = 0;
    for (var i = 0; i < 11; i++) sum += digits[i] * w[i];
    return sum % 10 === 0;
  }
  if (/^\d{8}$/.test(id)) {
    var ws = [1, 2, 1, 2, 1, 2, 4, 1], s = 0;
    for (var j = 0; j < 8; j++) { var p = Number(id[j]) * ws[j]; s += Math.floor(p / 10) + p % 10; }
    return s % 5 === 0 || (id[6] === '7' && (s + 1) % 5 === 0);
  }
  return null;
}
// 辨識結果常見的英數混淆：第 1 碼一定是英文、後面是數字（身分證、居留證）
function hgFixId(raw) {
  var s = hgStrip(hgNormalize(raw)).toUpperCase().replace(/[^0-9A-Z＊*○]/g, '');
  if (/^\d{8}$/.test(s)) return s;
  var m = s.match(/^([A-Z0-9])(.{9})$/);
  if (!m) return s;
  var first = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B', '6': 'G' }[m[1]] || m[1];
  var rest = m[2], second = rest[0];
  var tail = rest.slice(1).replace(/[OQD]/g, '0').replace(/[IL|]/g, '1').replace(/Z/g, '2').replace(/S/g, '5').replace(/B/g, '8').replace(/G/g, '6');
  if (/[OQ]/.test(second)) second = '0'; else if (/[IL|]/.test(second)) second = '1';
  return first + second + tail;
}

// 每個候選只讀自己的抬頭和區段。先保留檔案的實體頁序，續頁只有在抬頭完全一致時才接回。
var hgHeading = /^[＊*\-]*(土地|建物)(標示部|所有權部|他項權利部)[＊*\-]*$/;
var hgTitlePrefix = /^(?:建物|土地)登記第[一二三123]類謄本(?:[（(][^）)]*[）)])?/;
function hgHeaderId(line) {
  var t = line.text.replace(hgTitlePrefix, '');
  var m = t.match(/^([臺台]南市[㐀-鿿]{1,6}區)(\d{4})([㐀-鿿]+段)(\d{1,5}-\d{1,3})建號$/);
  if (m) return {section: m[1].replace(/^台/, '臺') + m[3], number: hgNumber(m[4]), kind: 'building', code: m[2]};
  m = t.match(/^([㐀-鿿]+段(?:[㐀-鿿]+小段)?)(\d{1,5}-\d{1,4})(地號|建號)$/);
  if (!m) return null;
  return {section: m[1].replace(/^台/, '臺'), number: hgNumber(m[2]), kind: m[3] === '地號' ? 'land' : 'building', code: ''};
}
function hgExcerpt(line, field) {
  var source = {page:line.page, field:field, excerpt:line.raw.trim().slice(0, 220)};
  if (line.original !== line.raw) {
    source.rawExcerpt = line.original.trim().slice(0, 220);
    if (!line.corrected) source.formatOnly = true;
  }
  return source;
}
// 混合 PDF 會把本來已正確的「層 數：」排成「層數：」，星號裝飾也會移除。
// 只比對完整標題與已附冒號的明確欄名，保持所有欄值原樣。
var hgFormatLabels = new RegExp('(?:' + HG_LABELS.concat(['建物門牌','建物坐落地號','主要用途','主要建材','層數','層次','層次面積',
  '總面積','面積','附屬建物用途','共有部分','資料管轄機關','謄本核發機關','列印時間','頁次']).sort(function (a,b) { return b.length-a.length; })
  .map(function (label) { return Array.from(label).join('[ \\t　]*'); }).join('|') + ')[ \\t　]*[：:]', 'g');
function hgComparedLayout(value) {
  var trimmed = value.trim();
  var heading = trimmed.replace(/^[＊*※\s]+|[＊*※\s]+$/g, '').replace(/\s/g,'');
  if (/^(土地|建物)(標示部|所有權部|他項權利部)$/.test(heading)) return heading;
  return trimmed.replace(hgFormatLabels, function (match) { return match.replace(/[ \t　]/g,'').replace(/:$/,'：'); });
}
function hgPrepare(text, pageSources) {
  var groups = [], fragments = [], previous, warnings = [];
  String(text || '').split('\f').forEach(function (pageText, index) {
    var chunks = [], chunk = [];
    var source = (pageSources || []).find(function (p) { return p.page === index + 1; });
    var sourceLines = source && typeof source.rawText === 'string' ? source.rawText.replace(/\r\n?/g, '\n').split('\n') : null;
    var rows = pageText.replace(/\r\n?/g, '\n').split('\n');
    var aligned = sourceLines && sourceLines.length === rows.length && source.text === pageText;
    rows.forEach(function (raw, rowIndex) {
      var original = aligned ? sourceLines[rowIndex] : raw;
      var line = {raw:raw, original:original, corrected:original !== raw && hgComparedLayout(original) !== hgComparedLayout(raw),
        text:hgStrip(hgNormalize(raw)), page:index + 1};
      if (hgTitleRe.test(line.text) && chunk.some(function (l) { return l.text; })) { chunks.push(chunk); chunk = []; }
      chunk.push(line);
    });
    chunks.push(chunk);
    chunks.forEach(function (rows) {
      var title = rows.find(function (l) { return hgTitleRe.test(l.text); });
      var boundary = rows.findIndex(function (l) { return hgHeading.test(l.text) || /^[（(]\d+[）)]|^(?:權利人|所有權人|登記次序|權利範圍|其他登記事項)[：:]/.test(l.text); });
      var prefix = boundary === -1 ? rows : rows.slice(0, boundary);
      var headers = prefix.map(hgHeaderId).filter(Boolean);
      var id = headers.length === 1 ? headers[0] : null;
      var kind = title ? (/^建物/.test(title.text) ? 'building' : 'land') : id && id.kind;
      if (id && kind !== id.kind) id = null;
      var key = id && [kind, id.section, id.code, id.number].join('|');
      var jurisdiction = prefix.map(function (l) { return l.text.match(hgCityRe); }).find(Boolean);
      var city = jurisdiction ? jurisdiction[1].replace(/^台/, '臺') : '';
      var canMatchPage = id && (id.code || hgSplitSection(id.section).district);
      var display = rows.some(function (l) { var m = l.text.match(hgHeading); return m && m[2] === '標示部'; });
      var counter = prefix.map(function (l) { return l.text.match(/頁次[：:](\d+)(?:[／/](\d+))?/); }).find(Boolean);
      var pg = counter ? Number(counter[1]) : null;
      var titleText = title ? title.text.match(hgTitlePrefix)[0] : '';
      var nonempty = rows.filter(function (l) { return l.text; });
      var end = nonempty.length > 0 && /^[〈<（(【]?本謄本列印完畢[〉>）)】]?$/.test(nonempty[nonempty.length - 1].text);
      if (!display && previous && canMatchPage && key === previous.key && previous.page === index &&
          (!previous.city || !city || previous.city === city) &&
          (!titleText || titleText === previous.title) && !previous.ended &&
          (pg === null || pg === previous.parts + 1)) {
        previous.parts++; previous.page = index + 1; previous.ended = end;
        if (!counter || pg !== previous.parts || (counter[2] && Number(counter[2]) !== previous.expectedPages && previous.expectedPages)) previous.pageSequence = false;
        if (counter && counter[2]) previous.expectedPages = Number(counter[2]);
        previous.rows.push.apply(previous.rows, rows.filter(function (l) { return !hgTitleRe.test(l.text) && !hgHeaderId(l); }));
        return;
      }
      if (!display && previous && !previous.ended) previous.unresolvedPage = true;
      previous = null;
      if (!display) {
        if (title && id) fragments.push({kind:kind, id:id, title:titleText, rows:rows, ended:false, pageSequence:false, unresolvedPage:true});
        if (rows.some(function (l) { return l.text; })) warnings.push('第 ' + (index + 1) + ' 頁缺少可配對的標示部或續頁抬頭，未帶入該頁。');
        return;
      }
      previous = {kind: kind, id: id, key: key, city: city, title: titleText, parts: 1, page: index + 1, rows: rows, ended: end,
        expectedPages: counter && counter[2] ? Number(counter[2]) : 0, pageSequence: pg === 1, unresolvedPage: false};
      groups.push(previous);
    });
  });
  return {groups: groups, fragments: fragments, warnings: warnings};
}
function hgMergePages(text) {
  return hgPrepare(text).groups.map(function (g) { return g.rows.map(function (l) { return l.raw; }).join('\n'); }).join('\n');
}
function hgOwnerBlock(b) {
  var mode = '', owners = [], rights = [], cur, entry, manager = false, seen = false, seenOwnership = false, invalid = false;
  var ownerRemarks = false, ownerUnlinked = false, rightRemarks = false, referencedRights = [];
  var rightSources = [], review = [], ownerSources = [], ownerReasons = [];
  var newOwner = function () {
    cur = {name: '', id: '', birth: '', address: '', share: ''}; owners.push(cur); ownerSources.push([]); ownerReasons.push([]); manager = false;
  };
  var newRight = function () { entry = {kind: '', holder: '', amount: '', seq: ''}; rights.push(entry); };
  var scope = b.kind === 'land' ? /[（(]地號全部[）)]$/ : /[（(]建號全部[）)]$/;
  var isFull = scope.test(b.title);
  var fullPages = b.pageSequence && b.ended && !b.unresolvedPage && (!b.expectedPages || b.expectedPages === b.parts);
  var assign = function (k, val, row) {
    if (!cur) newOwner();
    var i = owners.length - 1, sources = ownerSources[i], reasons = ownerReasons[i];
    var existing = sources.some(function (s) { return s.field === k; });
    sources.push(hgExcerpt(row, k));
    if ((existing && cur[k] !== val) || (k === 'share' && !val)) {
      var why = k === 'share' ? '權利範圍有矛盾、缺字或數值無效，請核對原件。' : '同一登記次序出現不同的所有權人資料，請核對原件。';
      if (!reasons.includes(why)) reasons.push(why);
      cur[k] = ''; return;
    }
    cur[k] = val;
  };
  var ownerPage, activeKind = b.kind === 'building' ? '建物' : '土地';
  b.rows.forEach(function (row) {
    var t = row.text, h = t.match(hgHeading);
    if (h) {
      if (h[1] !== activeKind) { mode = ''; invalid = true; return; }
      mode = h[2] === '所有權部' ? 'own' : h[2] === '他項權利部' ? 'rights' : '';
      if (mode === 'own') { if (seen) invalid = true; seenOwnership = true; ownerPage = row.page; cur = null; manager = false; ownerUnlinked = false; ownerRemarks = false; }
      if (mode === 'rights') { if (seen || row.corrected) invalid = true; entry = null; seen = true; rightSources.push(hgExcerpt(row, 'rights')); }
      return;
    }
    var pairs = hgPairs(t), lineBody = t.replace(/^[（(]\d+[）)]/, '');
    if (pairs.length && !lineBody.startsWith(pairs[0].label + '：') && !lineBody.startsWith(pairs[0].label + ':')) {
      if (mode === 'rights') { invalid = true; rightSources.push(hgExcerpt(row, 'rights')); }
      return;
    }
    if (mode === 'rights' && t && !pairs.length && !/^[〈<（(【]?本謄本列印完畢[〉>）)】]?$|^[（(]續次頁[）)]$|^(?:列印時間|頁次)[：:]|^[＊*\-]+$/.test(t)) {
      invalid = true; rightSources.push(hgExcerpt(row, 'rights')); return;
    }
    var remarksAt = pairs.findIndex(function (p) { return p.label === '其他登記事項'; });
    if (remarksAt >= 0) {
      // 備註是自由文字；裡面的標籤字樣不能作為新欄位。
      pairs = pairs.slice(0, remarksAt + 1);
      if (mode === 'rights' && /無他項權利|無任何他項|查無他項|已塗銷/.test(t.slice(t.indexOf('其他登記事項')))) invalid = true;
    }
    pairs.forEach(function (p) {
      if (mode === 'own') {
        if (p.label === '登記次序') { newOwner(); ownerPage = row.page; ownerUnlinked = false; ownerRemarks = false; return; }
        if (p.label === '其他登記事項') ownerRemarks = true;
        if (ownerRemarks) return;
        if (p.label === '相關他項權利登記次序') {
          var references = p.value.match(/\d{4}-\d{3}/g) || [];
          referencedRights.push.apply(referencedRights, references);
        }
        // 頁首未重列登記次序時，不能把新頁的個資接到前一人的紀錄。
        if (ownerPage !== undefined && row.page !== ownerPage) {
          cur = null; manager = false; ownerUnlinked = true;
          review.push('第 ' + row.page + ' 頁未重列所有權登記次序，未將零散欄位接到前一位所有權人。');
          rightSources.push(hgExcerpt(row, 'owner'));
        }
        ownerPage = row.page;
        if (ownerUnlinked) return;
        if (p.label === '所有權人') { if (!cur) newOwner(); assign('name', p.value, row); }
        else if (p.label === '管理者') manager = true;
        else if (p.label === '統一編號' && !manager) {
          var observed = hgStrip(hgNormalize(p.value)).toUpperCase(), fixed = hgFixId(p.value);
          assign('id', observed, row);
          if (observed !== fixed) ownerReasons[owners.length - 1].push('所有權人資料中的統一編號含疑似辨識錯字，請看原件核身。');
        }
        else if (p.label === '出生日期' && !manager) assign('birth', hgRocDate(p.value), row);
        else if (p.label === '住址' && !manager) assign('address', p.value, row);
        else if (p.label === '權利範圍') assign('share', hgShareText(p.value), row);
      } else if (mode === 'rights') {
        if (p.label === '登記次序') { newRight(); entry.seq = p.value; rightRemarks = false; }
        if (p.label === '其他登記事項') rightRemarks = true;
        if (rightRemarks && p.label !== '其他登記事項') { invalid = true; return; }
        if (row.corrected) invalid = true;
        if (!entry) newRight();
        var field = {'權利種類':'kind','權利人':'holder','擔保債權總金額':'amount','擔保債權總額':'amount'}[p.label];
        if (p.label === '登記次序' || field) rightSources.push(hgExcerpt(row, 'rights'));
        if (field) {
          if (entry[field]) invalid = true;
          // 金額常在幣別後補星號。數字中間的遮蔽字元不可刪除、拼成另一個金額。
          entry[field] = field === 'amount' ? p.value.replace(/(新[臺台]幣)[＊*]+/, '$1').replace(/^[＊*]+|[＊*]+$/g, '') : p.value;
        }
        if (/[：:]/.test(p.value) || /(?:無他項權利|無任何他項|查無他項|已塗銷)/.test(p.value) || /^(所有權人|管理者|出生日期|權狀字號)$/.test(p.label)) invalid = true;
      }
    });
  });
  if (!isFull) review.push('請核對謄本的列印範圍，尚未確認涵蓋全部他項權利。');
  if (!fullPages) review.push('請核對完整頁序與列印完畢記號。');
  if (!seenOwnership) review.push('未辨認完整的所有權部，請核對原件的列印內容。');
  if (!seen) review.push('未讀到此標的的他項權利部。');
  else if (!rights.length) review.push('他項權利部缺少可核對的完整記載，請看原件確認。');
  var readable = rights.length && rights.every(function (r) {
    if (!/^\d{4}-\d{3}$/.test(r.seq) || !/^(?:普通抵押權|最高限額抵押權|抵押權|典權|地上權|區分地上權|不動產役權|農育權|永佃權)$/.test(r.kind)) return false;
    if (!/^[㐀-鿿A-Za-z0-9（）()．·]{2,80}$/.test(r.holder) || /空白|權利人|權利種類|登記次序|[○〇Ｏ＊]/.test(r.holder)) return false;
    return !/抵押權/.test(r.kind) || /^(?:本金最高限額|最高限額|本金)?新[臺台]幣[0-9零壹貳參肆伍陸柒捌玖拾佰仟萬億兆一二三四五六七八九十百千,.]+元(?:正|整)?$/.test(r.amount);
  }) && new Set(rights.map(function (r) { return r.seq; })).size === rights.length;
  if (new Set(rights.map(function (r) { return r.kind; })).size > 1) {
    invalid = true;
    review.push('同一標的有不同種類的權利，請分別核對後填寫公契。');
  }
  if (referencedRights.some(function (seq) { return !rights.some(function (r) { return r.seq === seq; }); })) {
    invalid = true;
    review.push('所有權部所列的相關他項權利登記次序與他項權利部未能逐筆對上。');
  }
  if (seen && (invalid || (rights.length && !readable))) review.push('權利欄名、登記次序或內容不完整，請逐筆核對。');
  var meaningful = [], evidence = [], reasons = [];
  owners.forEach(function (o, i) {
    if (o.name || o.id || ownerSources[i].length) { meaningful.push(o); evidence.push(ownerSources[i]); reasons.push(ownerReasons[i]); }
  });
  return {kind:b.kind, id:b.id, city:(b.rows.map(function (l) { return l.text.match(hgCityRe); }).find(Boolean) || [])[1] || '',
    owners:meaningful, ownerSources:evidence, ownerReasons:reasons, rights:rights.filter(function (r) { return r.kind || r.holder || r.amount; }).map(function(r){ return {kind:r.kind,holder:r.holder,amount:r.amount}; }),
    rightsState:b.id && isFull && fullPages && seenOwnership && readable && !invalid ? 'some' : 'unknown', rightSources:rightSources, reviewReasons:review};
}
function hgOwnerRights(text) {
  var input = hgPrepare(text);
  return input.groups.concat(input.fragments).map(hgOwnerBlock);
}

// D7：建物標示部的共有部分。格式（電子謄本）：
//   共有部分：○○段 01234-000建號 ****1,234.56平方公尺
//             權利範圍：****10000分之123****
//             其他登記事項：含停車位編號○○號……（每一筆共有部分各自一行；最後才是建物本身的其他登記事項）
var hgCommonNoRe = /([㐀-鿿]+段(?:[㐀-鿿]+小段)?)?0*(\d{1,5})-0*(\d{1,3})建號/;
var hgAreaRe = /^(?:總面積[：:]|面積[：:])?[＊*]*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(?:平方公尺|平方米|㎡)(?=$|權利範圍[：:])/;
function hgCommonBlock(b) {
    var parts = [], cur = null, inDisplay = false, waitNo = false;
    b.rows.forEach(function (line) {
      var t0 = line.text, t = t0.replace(/[＊*]+/g, '');
      var heading = t.match(hgHeading);
      if (heading) { inDisplay = heading[1] === '建物' && heading[2] === '標示部'; cur = null; return; }
      if (!inDisplay) return;
      var m = t.match(/^共有部分[：:]?(.*)$/);
      if (m) { cur = { section: '', number: '', area: '', share: '', note: '', noteDone: false, shareSeen: false, sources: [], reviewReasons: [] }; parts.push(cur); t = m[1]; waitNo = true; }
      if (!cur) return;
      if (t0) cur.sources.push(hgExcerpt(line, 'common'));
      if (waitNo && !cur.number) {
        if (!m && /[：:]/.test(t)) { cur = null; return; }
        var n = t.match(hgCommonNoRe);
        if (n) { cur.section = n[1] || ''; cur.number = Number(n[3]) ? Number(n[2]) + '-' + Number(n[3]) : String(Number(n[2])); t = t.slice(t.indexOf(n[0]) + n[0].length); }
      }
      if (cur.number && !cur.noteDone && !cur.shareSeen && t) {
        // Re-read the original characters. Padding inside an area can hide a digit.
        var remainder = m || waitNo ? t0.slice(t0.indexOf('建號') + 2) : t0;
        var a = remainder.match(hgAreaRe);
        if (a || /^(?:總面積|面積)[：:]|平方公尺|平方米|㎡/.test(remainder) && !/^其他登記事項/.test(remainder)) {
          var amount = a && Number(a[1].replace(/,/g, ''));
          if (!amount || cur.area && cur.area !== String(amount)) cur.invalidArea = true;
          cur.area = cur.invalidArea ? '' : String(amount);
          if (cur.invalidArea && !cur.reviewReasons.includes('共有部分面積缺字或出現不同數值，請核對。')) cur.reviewReasons.push('共有部分面積缺字或出現不同數值，請核對。');
        }
      }
      if (cur.number) waitNo = false;
      var shareText = t0.match(/(?:^權利範圍|^共有部分[：:].*?平方公尺權利範圍)[：:](.*)$/);
      var s = !cur.noteDone && shareText;
      if (s) {
        var value = hgShareText(s[1]);
        if (!value || (cur.shareSeen && cur.share !== value)) { cur.invalidShare = true; cur.reviewReasons.push('共有部分的權利範圍有矛盾或缺字，請核對。'); }
        cur.shareSeen = true;
        cur.share = cur.invalidShare ? '' : value;
      }
      var o = t.match(/其他登記事項[：:](.*)$/);
      if (o) {
        if (cur.share && !cur.noteDone && /使用執照|建築基地/.test(o[1])) { cur.noteDone = true; cur = null; }   // 共有部分沒有自己的其他登記事項，這行是建物本身的
        else if (cur.share && !cur.noteDone) { cur.note = o[1] === '（空白）' || o[1] === '(空白)' ? '' : o[1]; cur.noteDone = true; }
        else if (cur.noteDone) cur = null;                                             // 建物本身的其他登記事項：共有部分到此結束
      } else if (cur && cur.noteDone && cur.note && !/[：:]/.test(t) && t && !/^共有部分/.test(t0)) cur.note += t;   // 續行
    });
    return { id: b.id, parts: parts.filter(function (p) { return p.number; }).map(function (p) { return { section: p.section, number: p.number, area: p.area, share: p.share, note: p.note, sources: p.sources, reviewReasons: p.reviewReasons }; }) };
}
function hgCommonParts(text) { return hgPrepare(text).groups.filter(function (g) { return g.kind === 'building'; }).map(hgCommonBlock); }

function hgSourceProperty(row) {
  var property = {};
  ['kind','city','district','section','subSection','number'].forEach(function (key) { property[key] = row[key]; });
  return property;
}

// 土地的公告現值、當期申報地價及所有權人歷次移轉是不同欄位。僅保留有原文的數值。
var hgPricePeriod = /^(?:民國)?(\d{1,3})年(\d{1,2})月(?:(\d{1,2})日)?/;
var hgUnitPrice = /^[＊*]*(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?元[／/每](?:平方公尺|平方米|㎡)$/;
function hgPriceEntry(text) {
  var dateMatch = text.match(hgPricePeriod), period = '', date = '';
  if (dateMatch) {
    var year = Number(dateMatch[1]), month = Number(dateMatch[2]);
    if (!year || month < 1 || month > 12) return null;
    period = (year + 1911) + '-' + String(month).padStart(2, '0');
    if (dateMatch[3]) {
      date = hgRocDate(String(year).padStart(3, '0') + '年' + month + '月' + dateMatch[3] + '日');
      if (!date) return null;
    }
    text = text.slice(dateMatch[0].length);
  }
  var value = text.match(hgUnitPrice);
  if (!value) return null;
  var amount = Number(value[1].replace(/,/g, '') + (value[2] || ''));
  return Number.isFinite(amount) && amount > 0 && amount < Number.MAX_SAFE_INTEGER ? {period:period, date:date, unitValue:String(amount)} : null;
}

function hgTaxFacts(group, row) {
  var data = {}, sources = [], review = [], seen = {}, sequences = [];
  var section = '', owner = '', ownerPage = 0, ownerCoverage = true, pending = null, activeBatch = null, historyPage = 0;
  var land = row.kind === '土地', kind = land ? '土地' : '建物';
  var offices = new Set();
  for (var line of group.rows) {
    if (hgHeading.test(line.text)) break;
    var office = !line.corrected && line.text.match(/^資料管轄機關[：:]([㐀-鿿]+地政事務所)(?:謄本核發機關[：:]([㐀-鿿]+地政事務所))?$/);
    if (office) { offices.add(office[1]); if (office[2]) offices.add(office[2]); }
  }
  function problem(message) { if (!review.includes(message)) review.push(message); }
  function incomplete() { data.previousTransfersIncomplete = true; problem('前次移轉現值、年月、取得持分或所有權登記次序有缺漏，請核對所有權部。'); }
  function note(item, key) { sources.push(hgExcerpt(item, key)); }
  function assign(key, value) {
    if (!value || Object.hasOwn(seen, key) && JSON.stringify(seen[key]) !== JSON.stringify(value)) {
      seen[key] = null; delete data[key]; problem('同一謄本的地價或稅籍欄位缺字或有不同數值，請依來源原文核對。'); return;
    }
    seen[key] = value; data[key] = value;
  }
  function readPrice(key, text, item) {
    note(item, key);
    var parsed = !item.corrected && hgPriceEntry(text);
    if (key !== 'previousTransfers') {
      assign(key, parsed ? {period:parsed.period, unitValue:parsed.unitValue} : null);
      return;
    }
    activeBatch = null;
    if (!owner || !parsed || !parsed.period) { incomplete(); return; }
    activeBatch = {ownerSequence:owner, period:parsed.period, date:parsed.date, unitValue:parsed.unitValue, share:''};
    (data.previousTransfers || (data.previousTransfers = [])).push(activeBatch);
  }
  function abandonPending() {
    if (!pending) return;
    if (pending.key === 'previousTransfers') incomplete();
    else assign(pending.key, null);
    pending = null;
  }
  group.rows.forEach(function (item) {
    var t = item.text, heading = t.match(hgHeading);
    if (!t) {
      // The OCR reader blanks low-confidence rows and retains their original line.
      if (land && section === '所有權部' && item.corrected && item.original.trim()) {
        ownerCoverage = false;
        var original = hgStrip(hgNormalize(item.original));
        if (pending || historyPage === item.page || /前次移轉|歷次取得|元[／/每]/.test(original)) {
          note(item, 'previousTransfers'); incomplete(); abandonPending(); activeBatch = null; historyPage = 0;
        }
        if (/登記次序|^[（(]\d{4}[）)]/.test(original)) owner = '';
      }
      return;
    }
    if (heading) {
      abandonPending(); section = !item.corrected && heading[1] === kind ? heading[2] : ''; owner = ''; activeBatch = null; historyPage = 0;
      if (item.corrected) ownerCoverage = false;
      return;
    }
    var registration = t.match(/^(?:[（(]\d+[）)])?登記次序[：:](\d{4})(?=$|登記日期[：:])/);
    if (land && section === '所有權部' && registration) {
      abandonPending();
      owner = item.corrected ? '' : registration[1]; ownerPage = item.page; activeBatch = null; historyPage = 0;
      if (!owner || sequences.includes(owner)) ownerCoverage = false;
      else sequences.push(owner);
      return;
    }
    if (land && section === '所有權部' && /^(?:[（(]\d+[）)])?登記次序/.test(t)) {
      owner = ''; ownerCoverage = false; activeBatch = null; historyPage = 0; abandonPending(); return;
    }
    if (section === '所有權部' && owner && item.page !== ownerPage) {
      owner = ''; activeBatch = null; historyPage = 0; abandonPending();
    }
    if (section === '所有權部' && !owner && /^(?:所有權人|權利範圍)[：:]/.test(t)) ownerCoverage = false;
    if (pending) {
      var waiting = pending;
      pending = null;
      if (item.page === waiting.page && (hgPricePeriod.test(t) || /^[＊*\d]/.test(t)) && !/[：:]/.test(t)) {
        readPrice(waiting.key, waiting.prefix + t, item); return;
      }
      pending = waiting; abandonPending();
    }
    if (/^(?:其他登記事項|共有部分)[：:]/.test(t)) {
      // Free-form notes cannot start a tax field. A new numbered owner may reopen the section.
      if (section === '標示部') section = '';
      activeBatch = null; owner = ''; historyPage = 0; return;
    }
    if (!land && section === '標示部') {
      var taxNo = t.match(/^(?:房屋稅籍編號|房屋稅籍號碼|稅籍編號|稅籍號碼)[：:](.*)$/);
      if (taxNo) {
        note(item, 'houseTaxNo');
        var number = taxNo[1].replace(/-/g, '');
        assign('houseTaxNo', !item.corrected && /^\d+(?:-\d+)*$/.test(taxNo[1]) && /^\d{11}$/.test(number) ? number : null);
      }
      return;
    }
    if (!land) return;
    var current = section === '標示部' && t.match(/^((?:民國)?\d{1,3}年\d{1,2}月)?([㐀-鿿]+地政事務所)?公告土地現值[：:](.*)$/);
    if (current) {
      if (!current[2] || offices.has(current[2])) readPrice('announcedLandValue', (current[1] || '') + current[3], item);
      else { note(item, 'announcedLandValue'); assign('announcedLandValue', null); }
      return;
    }
    if (section !== '所有權部') return;
    var tag = t.match(/^((?:民國)?\d{1,3}年\d{1,2}月)?(當期申報地價|前次移轉現值或原規定地價|前次移轉現值|原規定地價)[：:](.*)$/);
    if (tag) {
      activeBatch = null;
      var key = tag[2] === '當期申報地價' ? 'declaredLandPrice' : 'previousTransfers';
      historyPage = key === 'previousTransfers' && owner && !item.corrected ? item.page : 0;
      if (!owner) { note(item, key); if (key === 'previousTransfers') incomplete(); return; }
      var text = (tag[1] || '') + tag[3];
      if (!item.corrected && (!text || text.match(hgPricePeriod)?.[0] === text)) {
        note(item, key); pending = {key:key, page:item.page, prefix:text}; return;
      }
      readPrice(key, text, item); return;
    }
    if (owner && historyPage === item.page) {
      // Some tables print the heading once before several date/price and acquired-share pairs.
      if (hgPricePeriod.test(t)) { readPrice('previousTransfers', t, item); return; }
      var share = t.match(/^歷次取得權利範圍[：:](.*)$/);
      if (share) {
        note(item, 'previousTransfers');
        var observed = !item.corrected && hgShareText(share[1]) || '';
        if (!activeBatch || !observed || activeBatch.share && activeBatch.share !== observed) {
          if (activeBatch) activeBatch.share = '';
          incomplete(); activeBatch = null;
        } else activeBatch.share = observed;
        return;
      }
      if (!/[：:]/.test(t) && /年月|年.*月|元[／/每]|平方公尺|平方米|㎡/.test(t)) { note(item, 'previousTransfers'); incomplete(); }
      activeBatch = null; historyPage = 0;
    }
  });
  abandonPending();
  if (data.previousTransfers && data.previousTransfers.some(function (batch) { return !batch.share; })) incomplete();
  if (data.previousTransfers && ownerCoverage && sequences.length && /[（(]地號全部[）)]$/.test(group.title) &&
      group.pageSequence && group.ended && !group.unresolvedPage && (!group.expectedPages || group.expectedPages === group.parts)) data.ownerSequences = sequences;
  if (Object.keys(data).length) {
    data.sourceProperty = hgSourceProperty(row);
  }
  return {data:data, sources:sources, review:review};
}

// 遮罩字（王○明）當成萬用字比對；去空白、臺台視為相同
function hgNameMatch(owner, name) {
  var a = hgStrip(String(owner || '')).replace(/臺/g, '台'), b = hgStrip(String(name || '')).replace(/臺/g, '台');
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length !== b.length || !HG_MASK.test(a)) return false;
  for (var i = 0; i < a.length; i++) if (!HG_MASK.test(a[i]) && a[i] !== b[i]) return false;
  return true;
}

function hgRightsText(r) {
  return r.map(function (x) { return [x.kind, x.holder, x.amount ? '擔保債權總金額' + x.amount : ''].filter(Boolean).join('｜'); }).join('；');
}

/** 謄本文字 → 作業台候選。text 可含 \f 分頁；每筆都要人工對照原件確認後才帶入。 */
function hgTranscriptToDesk(text, opt) {
  opt = opt || {};
  if (typeof text !== 'string' || text.length > 120000) return {docs: [], warnings:['謄本文字無法讀取或超過 120000 字，請分批提供。']};
  var prepared = hgPrepare(text, Array.isArray(opt.pageSources) ? opt.pageSources : []), warnings = prepared.warnings, docs = [];
  function withOrigin(source) {
    var copy = Object.assign({}, source);
    if (opt.file) copy.file = opt.file;
    if (opt.sourceId !== undefined) copy.sourceId = opt.sourceId;
    return copy;
  }
  prepared.groups.forEach(function (group) {
    var parsed = transcriptParse_(group.rows.map(function (l) { return l.raw; }).join('\n'), {at: opt.at || new Date()});
    (parsed.issues || []).forEach(function (x) { if (!x.documentKey && !HG_SKIP_CODES.test(x.code)) warnings.push(x.message); });
    (parsed.documents || []).forEach(function (d) {
      var isB = d.kind === 'building', geo = hgSplitSection(d.section), number = d.number ? hgNumber(d.number) : '';
      var matched = d.key && group.id && group.id.kind === d.kind && group.id.section === String(d.section).replace(/^台/, '臺') && group.id.number === number;
      var fallback = '抬頭與標示部的地建號無法唯一配對，請核對原件。';
      var extra = matched ? hgOwnerBlock(group) : {owners:[], ownerSources:[], ownerReasons:[], rights:[], rightsState:'unknown', rightSources:[], city:'', reviewReasons:[fallback]};
      var one = extra.owners.length === 1 && extra.owners[0].share;
      var candidateShare = hgShare(d.share);
      var row = { kind: isB ? '建物' : '土地', city: geo.city || extra.city.replace(/^台/, '臺') || '', district: geo.district, section: geo.section, subSection: geo.subSection, number: number, transferShare: candidateShare && one === candidateShare ? one : '' };
      var evidence = (parsed.evidence.records || []).filter(function (r) { return r.documentKey === d.key && group.rows[r.line - 1]; }).map(function (r) {
        return hgExcerpt(group.rows[r.line - 1], r.field);
      });
      if (!evidence.length && group.rows.length) evidence.push(hgExcerpt(group.rows.find(function (l) {return l.text;}) || group.rows[0], 'identity'));
      var scopeLine = group.rows.find(function (l) { return hgTitleRe.test(l.text); });
      if (scopeLine) evidence.push(hgExcerpt(scopeLine, 'scope'));
      var cps = isB && matched ? hgCommonBlock(group).parts : [];
      if (isB) {
        row.address = d.address || '';
        row.mainArea = d.mainAreaM2 !== null && d.mainAreaM2 !== undefined ? String(d.mainAreaM2) : '';
        var acc = (d.accessoryAreas || []).reduce(function (n, a) { return n + a.areaM2; }, 0);
        var unresolvedAccessory = (d.issues || []).some(function (x) { return x.key === 'accessoryAreas'; });
        row.attachedArea = acc && !unresolvedAccessory ? String(Math.round(acc * 1e6) / 1e6) : '';
        if (matched) {
          var buildingFacts = {};
          function unchanged(field) { return !evidence.some(function (s) { return s.field === field && s.rawExcerpt !== undefined && !s.formatOnly; }); }
          if (d.landRefs.length && unchanged('landRefs')) {
            buildingFacts.landRefs = d.landRefs.map(function (ref) {
              var place = hgSplitSection(ref.section);
              return {section:place.section, subSection:place.subSection, number:hgNumber(ref.number)};
            });
          }
          if (d.floorAreas.length && d.floorAreas.every(function (a) { return a.includedInMainTotal === true; }) && unchanged('floorAreas') && unchanged('mainAreaM2')) {
            buildingFacts.floorAreas = d.floorAreas.map(function (a) { return {label:a.label, area:String(a.areaM2)}; });
          }
          if (row.attachedArea && unchanged('accessoryAreas')) {
            buildingFacts.accessories = d.accessoryAreas.map(function (a) { return {label:a.kind, area:String(a.areaM2)}; });
          }
          if (Object.keys(buildingFacts).length) {
            buildingFacts.sourceProperty = hgSourceProperty(row);
            row.transcriptBuilding = buildingFacts;
          }
        }
      } else row.area = d.areaM2 !== null && d.areaM2 !== undefined ? String(d.areaM2) : '';
      // 只顯示作業台會用到的欄位的提醒（建材、用途、完成日期、樓層分配是估價系統用的，不影響這裡帶入的欄位）
      var taxFacts = matched ? hgTaxFacts(group, row) : {data:{}, sources:[], review:[]};
      if (Object.keys(taxFacts.data).length) row.transcriptTax = taxFacts.data;
      evidence = evidence.concat(taxFacts.sources);
      var issues = (d.issues || []).filter(function (x) { return !HG_SKIP_CODES.test(x.code) && HG_DESK_KEYS.test(x.key); }).map(function (x) { return x.message; }).concat(taxFacts.review);
      if (!number) issues.unshift('沒有讀到唯一的地號／建號，請手動填寫或不要帶入這一筆。');
      if (candidateShare && !row.transferShare) issues.push('所有權人與標的的權利範圍無法唯一對照，請核對原件。');
      if (row.transferShare) issues.push('「移轉權利範圍」先帶謄本上目前的權利範圍；若本次只移轉一部分，請改成本次範圍。');
      if (isB) issues.push(cps.length ? '建物面積帶主建物總面積與陽台／雨遮等附屬建物；共有部分 ' + cps.length + ' 筆已另列在下方。' : '未從建物標示部讀到共有部分，請核對原件。');
      docs.push({
        key: d.key || '', row: row, owners: extra.owners, rights: extra.rights, rightsState: extra.rightsState,
        rightsText: extra.rights.length ? hgRightsText(extra.rights) : '他項權利待核對原件',
        sources: evidence.concat(extra.rightSources, ...extra.ownerSources.map(function (items) { return items.filter(function (item) { return item.field === 'share'; }); })).filter(function (item,i,all) {
          return all.findIndex(function (prev) { return prev.field === item.field && prev.page === item.page && prev.excerpt === item.excerpt; }) === i;
        }).map(withOrigin),
        ownerSources: extra.ownerSources.map(function (lines) { return lines.map(withOrigin); }),
        ownerReasons: extra.ownerReasons, reviewReasons: issues.concat(extra.reviewReasons, ...extra.ownerReasons),
        landRefs: (d.landRefs || []).map(function (r) { return r.section + hgNumber(r.number); }),
        issues: issues.filter(function (x, i, a) { return a.indexOf(x) === i; })
      });
      cps.forEach(function (cp, i) {
        var g = cp.section ? hgSplitSection(cp.section) : geo;
        var crow = { kind: '建物', common: '共有部分', commonOf: number, city: row.city, district: row.district, section: g.section || geo.section, subSection: cp.section ? g.subSection : geo.subSection,
          number: cp.number, transferShare: cp.share, address: '', mainArea: cp.area, attachedArea: '' };
        var ci = [];
        if (!cp.area) ci.push('沒有讀到共有部分面積，請看原件補上。');
        if (!cp.share) ci.push('沒有讀到共有部分的權利範圍，請看原件補上。');
        else ci.push('面積是共有部分的總面積，移轉權利範圍帶謄本的共有部分權利範圍，請核對。');
        if (/停車|車位/.test(cp.note)) ci.push('含停車位：' + cp.note);
        docs.push({ key: (d.key || number) + '#共有' + (i + 1), common: true, row: crow, owners: [], rights: [], rightsState: 'n/a', rightsText: '', note: cp.note,
          sources: cp.sources.map(withOrigin), reviewReasons: ci.concat(cp.reviewReasons), landRefs: [], issues: ci.concat(cp.reviewReasons) });
      });
    });
  });
  var duplicateKeys = new Map();
  docs.filter(function (d) { return !d.common && d.key; }).forEach(function (d) {
    if (!duplicateKeys.has(d.key)) duplicateKeys.set(d.key, []);
    duplicateKeys.get(d.key).push(d);
  });
  duplicateKeys.forEach(function (copies) {
    if (copies.length < 2) return;
    copies.forEach(function (d) {
      d.rightsState = 'unknown';
      d.reviewReasons.push('同一標的出現多份謄本，請分別核對列印範圍與權利記載。');
    });
  });
  if (!docs.length && !warnings.length) warnings.push('沒有找到謄本的標示部，請確認是地政機關核發的土地或建物登記謄本。');
  return { docs: docs, warnings: warnings.filter(function (x, i, a) { return a.indexOf(x) === i; }) };
}

// 只以通過檢查碼的完整編號彙整，姓名相同仍要分開核身。
function hgOwnersOf(docs) {
  var result = [], byId = new Map(), byName = new Map();
  function flag(p, msg) { p.identityConflict = true; if (!p.reviewReasons.includes(msg)) p.reviewReasons.push(msg); }
  (docs || []).forEach(function (d) {
    if (d.common) return;
    var label = (d.row.city || '') + (d.row.district || '') + (d.row.section || '') + (d.row.subSection || '') + (d.row.number || '') + (d.row.kind === '建物' ? '建號' : '地號');
    (d.owners || []).forEach(function (o, i) {
      if (!o.name && !o.id) return;
      var id = String(o.id || '').trim().toUpperCase(), name = hgStrip(o.name || '');
      var valid = hgIdCheck(id) === true, p = valid && byId.get(id);
      var reasons = (d.ownerReasons && d.ownerReasons[i]) || [];
      if (!p) {
        p = {name:o.name, id:o.id, birth:o.birth, address:o.address, shares:[], sources:[], reviewReasons:[], identityConflict:false};
        result.push(p);
        if (valid) byId.set(id, p);
      } else {
        ['name','birth','address'].forEach(function (k) {
          if (p[k] && o[k] && hgStrip(p[k]) !== hgStrip(o[k])) flag(p, '相同統一編號的姓名、生日或地址有差異，請分別核對原件。');
          else if (!p[k] && o[k]) p[k] = o[k];
        });
      }
      if (name) {
        var others = byName.get(name) || [];
        others.forEach(function (other) { if (other !== p) { var msg = '同名紀錄無法以相同的完整統一編號核對，請分別核身。'; flag(other, msg); flag(p, msg); } });
        if (!others.includes(p)) others.push(p);
        byName.set(name, others);
      }
      reasons.forEach(function (r) { if (r.includes('所有權人資料')) flag(p, r); else if (!p.reviewReasons.includes(r)) p.reviewReasons.push(r); });
      ((d.ownerSources && d.ownerSources[i]) || []).forEach(function (source) {
        var copy = Object.assign({}, source);
        if (d.file) copy.file = d.file;
        if (d.sourceId !== undefined) copy.sourceId = d.sourceId;
        p.sources.push(copy);
      });
      p.shares.push({label: label, share:o.share || ''});
    });
  });
  result.forEach(function (p) {
    var shares = p.shares.map(function (s) { return s.share; });
    p.share = shares.every(function (s) { return s && s === shares[0]; }) ? shares[0] : '';
    p.masked = HG_MASK.test(p.name || '');
    p.idOk = hgIdCheck(p.id);
    if (!p.share && shares.length > 1) p.reviewReasons.push('各標的持分不同或未讀到，請按標的確認本次移轉範圍。');
    if (p.masked) p.reviewReasons.push('原件上的姓名有遮罩，請另行核身。');
    if (p.idOk !== true) p.reviewReasons.push('缺少可用檢查碼核對的完整統一編號，請核對原件。');
  });
  return result;
}

// PDF 文字層 → 依座標排回一行一行（同一列的字由左到右，中間有明顯空隙就補空白）
function hgLinesFromItems(items) {
  var rows = [];
  (items || []).forEach(function (it) {
    if (!it || typeof it.str !== 'string' || !it.str.trim() || !it.transform) return;
    var x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || it.height || 10;
    var row = null;
    for (var i = 0; i < rows.length; i++) if (Math.abs(rows[i].y - y) <= Math.max(2, Math.min(rows[i].h, h) * 0.45)) { row = rows[i]; break; }
    if (!row) { row = { y: y, h: h, items: [] }; rows.push(row); }
    row.items.push({ x: x, w: it.width || 0, s: it.str, h: h });
  });
  rows.sort(function (a, b) { return b.y - a.y; });
  return rows.map(function (r) {
    r.items.sort(function (a, b) { return a.x - b.x; });
    var out = '', end = null;
    r.items.forEach(function (it) { if (end !== null && it.x - end > it.h * 0.6) out += ' '; out += it.s; end = it.x + it.w; });
    return out;
  });
}
async function hgPdfToText(data, pdfjs, opt) {
  opt = opt || {};
  var task = pdfjs.getDocument({ data: data, cMapUrl: opt.cMapUrl, cMapPacked: true, standardFontDataUrl: opt.standardFontDataUrl, isEvalSupported: false, enableXfa: false });
  var doc = await task.promise;
  try {
    if (doc.numPages > 40) throw new Error('PDF 超過 40 頁，請分開上傳。');
    var pages = [], chars = 0;
    for (var p = 1; p <= doc.numPages; p++) {
      var page = await doc.getPage(p), tc = await page.getTextContent();
      var lines = hgLinesFromItems(tc.items); pages.push(lines.join('\n'));
      chars += lines.join('').replace(/\s/g, '').length;
    }
    return { text: pages.join('\f'), pages: doc.numPages, chars: chars };
  } finally { try { await doc.destroy(); } catch (e) {} }
}

var HGTranscript = { version: '2026-11-22-trial', toDesk: hgTranscriptToDesk, mergePages: hgMergePages, ownerRights: hgOwnerRights, commonParts: hgCommonParts,
  ownersOf: hgOwnersOf, idCheck: hgIdCheck, fixId: hgFixId, rocDate: hgRocDate,
  nameMatch: hgNameMatch, splitSection: hgSplitSection, number: hgNumber, sameSection: hgSameSection,
  linesFromItems: hgLinesFromItems, pdfToText: hgPdfToText, parse: transcriptParse_ };
if (typeof window !== 'undefined') window.HGTranscript = HGTranscript;
if (typeof module !== 'undefined' && module.exports) module.exports = HGTranscript;

})();
