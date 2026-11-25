/* Ephemeral review state for the case desk. Never persist page text or images. */
(function (root) {
  'use strict';
  const clean = value => String(value == null ? '' : value).trim();
  const compact = value => clean(value).replace(/\s/g, '');
  const folded = value => compact(value).replace(/臺/g, '台');
  const masked = value => /[○●◯〇＊*□]/.test(value || '');
  const modeNames = { text: '電子文字', mixed: '文字與影像混合', ocr: '掃描／照片辨識' };
  const modeName = value => modeNames[value] || '來源待核對';
  const propLabel = row => [row.district, row.section, row.subSection, row.number].map(clean).join('') + (row.kind === '建物' ? '建號' : '地號');

  function sourceRows(entries, fileMap) {
    return (entries || []).map(s => {
      const input = fileMap.get(s.sourceId);
      const page = input && input.pages.find(p => p.page === s.page);
      const mode = page && page.source;
      let excerpt = clean(s.rawExcerpt || s.excerpt), original = mode === 'text' || !!s.rawExcerpt;
      if (page && !original && excerpt) {
        const lines = String(page.text || '').split(/\r?\n/);
        const raw = String(page.rawText || '').split(/\r?\n/);
        const matches = lines.map(compact);
        const hit = matches.indexOf(compact(excerpt));
        if (raw.length === lines.length && hit >= 0 && matches.lastIndexOf(compact(excerpt)) === hit && clean(raw[hit])) {
          excerpt = clean(raw[hit]);
          original = true;
        }
      }
      return { ...s, file: input ? input.file.name : s.file, mode, excerpt, original };
    });
  }

  function sellerMatch(o, list) {
    const id = compact(o.id).toUpperCase(), name = folded(o.name);
    if (o.identityConflict || o.masked || masked(name) || masked(id)) return { issue: '原件身分有遮蔽或衝突，請核對後在當事人明細手動填寫。' };
    if (!name) return { issue: '請確認所有權人姓名。' };
    const matches = list.filter(p => (id && compact(p.ledgerId).toUpperCase() === id) || folded(p.name) === name);
    if (matches.length > 1) return { issue: '本案有多位同名或相同編號的賣方，請到當事人明細分別核對。' };
    const person = matches[0];
    if (person && ((id && clean(person.ledgerId) && compact(person.ledgerId).toUpperCase() !== id) ||
      (clean(person.name) && folded(person.name) !== name) || person.role === '代理人')) {
      return { issue: '本案既有當事人的姓名、編號或身分不同，請核對後在當事人明細手動填寫。' };
    }
    const nameOnly = !!(person && (!id || !compact(person.ledgerId)));
    if (nameOnly && ((clean(o.birth) && clean(person.ledgerBirth) && o.birth !== person.ledgerBirth) ||
      (clean(o.address) && clean(person.ledgerHome) && folded(o.address) !== folded(person.ledgerHome)))) {
      return { issue: '同名賣方的出生日期或住址不同，請分別核身。' };
    }
    return { person, nameOnly };
  }

  function propMatch(row, rows, normalNumber) {
    const number = normalNumber(row.number);
    if (!clean(row.number) || !number || !clean(row.section)) return { issue: '請確認段及地號／建號後帶入。' };
    const matches = rows.filter(p => p.kind === row.kind && normalNumber(p.number) === number && !!p.common === !!row.common &&
      (!p.common || normalNumber(p.commonOf) === normalNumber(row.commonOf)) &&
      ['city', 'district', 'section', 'subSection'].every(k => !clean(p[k]) || !clean(row[k]) || folded(p[k]) === folded(row[k])));
    if (matches.length > 1 || (matches.length && ['section','subSection'].some(k => folded(matches[0][k]) !== folded(row[k])))) {
      return { issue: '本案有相近的段、小段或重複號碼，請在標的明細確認是哪一筆。' };
    }
    return { person: matches[0] };
  }

  function checkShares(docs, normalNumber) {
    const groups = new Map();
    for (const d of docs) {
      if (!clean(d.row.number)) continue;
      const r = d.row;
      const key = JSON.stringify([r.kind, folded(r.city), folded(r.district), folded(r.section), folded(r.subSection),
        normalNumber(r.number), !!r.common, normalNumber(r.commonOf)]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    }
    for (const group of groups.values()) {
      if (group.length > 1 && new Set(group.map(d => d.sourceId)).size > 1) {
        for (const d of group) {
          if (d.common) continue;
          d.duplicateRights = true;
          if (!(d.reviewReasons || []).includes('同一標的有多份來源，請比對各份權利記載後手動填公契。')) {
            d.reviewReasons = [...(d.reviewReasons || []), '同一標的有多份來源，請比對各份權利記載後手動填公契。'];
          }
        }
      }
      const unique = new Set(group.map(d => clean(d.row.transferShare)));
      if (unique.size < 2) continue;
      for (const d of group) {
        d.shareIssue = '同一標的在不同記載的持分不一致，已留白。請逐件核對本次移轉範圍。';
        d.row.transferShare = '';
      }
    }
  }

  function usableRights(d) {
    return !d.common && !d.pageUncertain && !d.duplicateRights && d.rightsState === 'some' && !!clean(d.rightsText) && Array.isArray(d.rights) &&
      d.rights.length > 0 && d.rights.every(r => clean(r.kind) && clean(r.holder));
  }

  const evidenceComponent = {
    props: { entries: Array },
    emits: ['open'],
    template: '<details v-if="entries && entries.length" class="d11-evidence" data-testid="desk-import-evidence">' +
      '<summary>查看來源與摘句（{{ entries.length }}）</summary>' +
      '<div v-for="(s,i) in entries" :key="i"><button type="button" class="mini" @click="$emit(\'open\',s)" data-testid="desk-import-source">' +
      '{{ s.file }} · {{ s.page ? "第 " + s.page + " 頁" : "開啟原件" }}</button>' +
      ' <small>{{ modeName(s.mode) }}</small><p v-if="s.excerpt">{{ s.mode === "text" ? "原頁摘句" : s.original ? "辨識原文" : "辨識摘句" }}　{{ s.excerpt }}</p></div></details>',
    methods: { modeName }
  };
  root.HGImportReview = { modeName, sourceRows, propLabel, sellerMatch, propMatch, checkShares, usableRights, evidenceComponent };
})(typeof window === 'object' ? window : globalThis);
