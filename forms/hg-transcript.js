/* 宏國地政士作業台：謄本讀取（D3，Claude 2026-11-17）
 * 第一段：LINE 估價系統 v118 TranscriptFields.js 原文（SHA-256 334af35142a68ebee0bac3d43fd2a16cb13c1b3cdd77a5a6fbedaea55966db3a），已用真實謄本驗證，未修改。
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
  function numberText(s) { return s.replace(/[＊*]/g, '').replace(/^[：:]+/, ''); }
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
        // Keep existing colon-only row behavior. Newly expanded OCR rows must
        // retain every repeated label, so a later conflicting value blocks use.
        if (!line.layoutExpanded) break;
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
    return /^[\u3400-\u9fff0-9]+[路街道巷弄][\u3400-\u9fff0-9-]*號(?:之[0-9]+)?(?:[0-9一二三四五六七八九十地下]+樓(?:之[0-9]+)?)?$/.test(value) ? value : null;
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
        var v = numberText(m[1]), match = v.match(/^(?:全部)?([0-9]+)分之([0-9]+)$/), share = null;
        if (v === '全部') share = {numerator: 1, denominator: 1};
        if (match && Number.isSafeInteger(Number(match[1])) && Number.isSafeInteger(Number(match[2])) && Number(match[1]) > 0 && Number(match[2]) > 0 && Number(match[2]) <= Number(match[1])) share = {numerator: Number(match[2]), denominator: Number(match[1])};
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

// ---- 地政士作業台轉接層（Claude 2026-11-17，D3）----
// 上方 transcriptParse_／transcriptAssembleDocuments_ 為 LINE 估價系統 v118 已用真實謄本驗證的規則，原樣沿用。
// 這一層只做三件事：1) 同一筆謄本跨頁重複的抬頭先合併；2) 換成作業台「標的明細」欄位；
// 3) 另外讀出所有權人姓名＋權利範圍、他項權利摘要，只供畫面核對，不自動當成本案賣方。
var HG_CITY = '(?:[臺台]北|新北|桃園|[臺台]中|[臺台]南|高雄|基隆|新竹|嘉義)市|(?:新竹|苗栗|彰化|南投|雲林|嘉義|屏東|宜蘭|花蓮|[臺台]東|澎湖|金門|連江)縣';
// 電子謄本抬頭常省略縣市（例：北區北元段 0097-0015地號），所以行政區可單獨出現
var hgSecRe = new RegExp('^(' + HG_CITY + ')?([\\u3400-\\u9fff]{1,3}?[區鄉鎮市])?([\\u3400-\\u9fff]+?段)([\\u3400-\\u9fff]+?小段)?$');
var hgCityRe = new RegExp('(?:資料管轄機關|謄本核發機關)[：:](' + HG_CITY + ')');
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
function hgShareText(v) {
  v = String(v || '').replace(/[＊*]/g, '');
  if (v === '全部') return '全部';
  var m = v.match(/^(?:全部)?([0-9]+)分之([0-9]+)$/);
  return m ? (m[1] === m[2] ? '全部' : m[2] + '/' + m[1]) : '';
}
function hgSameSection(a, b) {
  a = String(a || '').replace(/臺/g, '台'); b = String(b || '').replace(/臺/g, '台');
  return !!a && !!b && (a === b || a.slice(-b.length) === b || b.slice(-a.length) === a);
}
// 一行裡的「標籤：值」逐一切開（同一行可能有兩欄）
function hgPairs(line) {
  var found = [], m;
  hgLabelRe.lastIndex = 0;
  while ((m = hgLabelRe.exec(line))) found.push({ label: m[1], start: m.index, end: hgLabelRe.lastIndex });
  return found.map(function (f, i) { return { label: f.label, value: line.slice(f.end, i + 1 < found.length ? found[i + 1].start : line.length).replace(/^[＊*]+|[＊*]+$/g, '') }; });
}

// 同一筆謄本跨頁時，每頁都會重印「○○登記第二類謄本」與地建號抬頭；第 2 頁起若與前頁同一筆，就拿掉重複抬頭，
// 讓上方規則把整份當成一筆讀（否則第 2 頁的所有權部會變成「缺標示部」的另一筆）。頁與頁之間以 \f 分隔。
function hgMergePages(text) {
  var pages = String(text || '').split('\f'), out = [], prevId = '';
  pages.forEach(function (page) {
    var lines = page.split(/\r\n?|\n/), id = '';
    lines.some(function (l) { var t = hgStrip(hgNormalize(l)).replace(/^(?:建物|土地)登記第[一二三123]類謄本(?:[（(][^）)]*[）)])?/, ''), m = t.match(hgIdRe); if (m) { id = m[3] + ':' + m[1] + ':' + hgNumber(m[2]); return true; } return false; });
    var hasDisplay = lines.some(function (l) { return /(?:土地|建物)標示部/.test(hgStrip(l)); });
    if (out.length && id && id === prevId && !hasDisplay) {
      lines = lines.filter(function (l) {
        var t = hgStrip(hgNormalize(l)), rest = t.replace(/^(?:建物|土地)登記第[一二三123]類謄本(?:[（(][^）)]*[）)])?/, ''), m = rest.match(hgIdRe);
        if (hgTitleRe.test(t) && !rest) return false;                                   // 只有標題的一行
        if (m && m[3] + ':' + m[1] + ':' + hgNumber(m[2]) === id) return false;         // 重複的地建號抬頭（可能連著標題）
        if (/^(?:列印時間|頁次)/.test(t)) return false;
        return true;
      });
    }
    if (id) prevId = id;
    out.push(lines.join('\n'));
  });
  return out.join('\n');
}

// 讀所有權部的「所有權人／權利範圍」與他項權利部摘要（只供核對顯示）。
// 註：電子謄本的所有權人姓名、統一編號、住址是以圖片印出，文字層讀不到（2026-11-17 用真實電子謄本確認），此時只有權利範圍。
function hgOwnerRights(text) {
  var lines = hgNormalize(text).replace(/\r\n?/g, '\n').split('\n').map(hgStrip), blocks = [], cur = null;
  lines.forEach(function (t) {
    if (hgTitleRe.test(t)) { cur = { kind: /^建物/.test(t) ? 'building' : 'land', id: null, city: '', lines: [] }; blocks.push(cur); }
    if (!cur) return;
    if (!cur.id) { var rest = t.replace(/^(?:建物|土地)登記第[一二三123]類謄本(?:[（(][^）)]*[）)])?/, ''), m = rest.match(hgIdRe); if (m) cur.id = { section: m[1], number: hgNumber(m[2]) }; }
    if (!cur.city) { var c = t.match(hgCityRe); if (c) cur.city = c[1].replace(/^台/, '臺'); }
    cur.lines.push(t);
  });
  return blocks.map(function (b) {
    var mode = '', owners = [], rights = [], rightsSeen = false, entry = null;
    b.lines.forEach(function (t) {
      if (/(?:土地|建物)所有權部/.test(t)) { mode = 'own'; return; }
      if (/(?:土地|建物)他項權利部/.test(t)) { mode = 'rights'; rightsSeen = true; return; }
      if (/(?:土地|建物)標示部/.test(t)) { mode = ''; return; }
      hgPairs(t).forEach(function (p) {
        if (mode === 'own') {
          if (p.label === '登記次序') owners.push({ name: '', share: '' });
          else if (p.label === '所有權人' || p.label === '管理者') { if (!owners.length || owners[owners.length - 1].name) owners.push({ name: '', share: '' }); owners[owners.length - 1].name = p.value; }
          else if (p.label === '權利範圍') { if (!owners.length) owners.push({ name: '', share: '' }); owners[owners.length - 1].share = hgShareText(p.value) || p.value; }
        } else if (mode === 'rights') {
          if (p.label === '登記次序' || (p.label === '權利種類' && entry && entry.kind)) { entry = { kind: '', holder: '', amount: '' }; rights.push(entry); }
          if (!entry) { entry = { kind: '', holder: '', amount: '' }; rights.push(entry); }
          if (p.label === '權利種類') entry.kind = p.value;
          else if (p.label === '權利人') entry.holder = p.value;
          else if (p.label === '擔保債權總金額' || p.label === '擔保債權總額') entry.amount = p.value.replace(/[＊*]+/g, '');
        }
      });
    });
    owners = owners.filter(function (o) { return o.name || o.share; });
    rights = rights.filter(function (r) { return r.kind || r.holder; });
    return { kind: b.kind, id: b.id, city: b.city, owners: owners, rights: rights, rightsState: rights.length ? 'some' : rightsSeen ? 'none' : 'unknown' };
  });
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
  var merged = hgMergePages(text);
  var parsed = transcriptParse_(merged, { at: opt.at || new Date() });
  var extras = hgOwnerRights(merged), warnings = [];
  (parsed.issues || []).forEach(function (x) { if (!x.documentKey && !HG_SKIP_CODES.test(x.code)) warnings.push(x.message); });
  var docs = (parsed.documents || []).map(function (d) {
    var isB = d.kind === 'building', geo = hgSplitSection(d.section), number = d.number ? hgNumber(d.number) : '';
    var extra = extras.filter(function (e) { return e.kind === d.kind && e.id && e.id.number === number && hgSameSection(e.id.section, d.section); })[0] || { owners: [], rights: [], rightsState: 'unknown', city: '' };
    var row = { kind: isB ? '建物' : '土地', city: geo.city || extra.city || '', district: geo.district, section: geo.section, subSection: geo.subSection, number: number, transferShare: hgShare(d.share) };
    if (isB) {
      row.address = d.address || '';
      row.mainArea = d.mainAreaM2 !== null && d.mainAreaM2 !== undefined ? String(d.mainAreaM2) : '';
      var acc = (d.accessoryAreas || []).reduce(function (n, a) { return n + a.areaM2; }, 0);
      row.attachedArea = acc ? String(Math.round(acc * 100) / 100) : '';
    } else row.area = d.areaM2 !== null && d.areaM2 !== undefined ? String(d.areaM2) : '';
    // 只顯示作業台會用到的欄位的提醒（建材、用途、完成日期、樓層分配是估價系統用的，不影響這裡帶入的欄位）
    var issues = (d.issues || []).filter(function (x) { return !HG_SKIP_CODES.test(x.code) && HG_DESK_KEYS.test(x.key); }).map(function (x) { return x.message; });
    if (!number) issues.unshift('沒有讀到唯一的地號／建號，請手動填寫或不要帶入這一筆。');
    if (row.transferShare) issues.push('「移轉權利範圍」先帶謄本上目前的權利範圍；若本次只移轉一部分，請改成本次範圍。');
    if (isB) issues.push('建物面積只帶主建物總面積與陽台／雨遮等附屬建物；共有部分（公設）請另行核對。');
    return {
      key: d.key || '', row: row, owners: extra.owners, rights: extra.rights, rightsState: extra.rightsState,
      rightsText: extra.rights.length ? hgRightsText(extra.rights) : extra.rightsState === 'none' ? '謄本他項權利部沒有記載權利' : '這份謄本沒有他項權利部（可能未申請全部）',
      landRefs: (d.landRefs || []).map(function (r) { return r.section + hgNumber(r.number); }),
      issues: issues.filter(function (x, i, a) { return a.indexOf(x) === i; })
    };
  });
  if (!docs.length && !warnings.length) warnings.push('沒有找到謄本的標示部，請確認是地政機關核發的土地或建物登記謄本。');
  return { docs: docs, warnings: warnings.filter(function (x, i, a) { return a.indexOf(x) === i; }) };
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

var HGTranscript = { version: 'D3-2026-11-17', toDesk: hgTranscriptToDesk, mergePages: hgMergePages, ownerRights: hgOwnerRights,
  nameMatch: hgNameMatch, splitSection: hgSplitSection, number: hgNumber, sameSection: hgSameSection,
  linesFromItems: hgLinesFromItems, pdfToText: hgPdfToText, parse: transcriptParse_ };
if (typeof window !== 'undefined') window.HGTranscript = HGTranscript;
if (typeof module !== 'undefined' && module.exports) module.exports = HGTranscript;

})();
