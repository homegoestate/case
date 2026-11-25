/* Local-only preparation of the two property-transfer taxes. */
(function (root) {
  'use strict';
  const format = root.HGOnlineTaxFormat;
  const names = { AVM001: '土地增值稅', CHT001: '契稅' };
  const fields = {
    HSN:'縣市代碼', ORG:'受理機關代碼', TOWN:'行政區代碼', CASE_TP:'案件類別代碼', TRAN_REAS:'移轉原因代碼',
    TRAN_AREA:'本次移轉土地面積', LUMP_LND_AREA:'整筆土地面積（請核對）', FLG_DATE:'申報日期（民國七碼）',
    TRD_DATE:'訂約日期（民國七碼）', CITY_TP:'都市土地類別代碼', LND_MARK:'土地標示代碼', LOC_NM:'土地坐落欄（請核對官方代碼格式）',
    TRAN_RATE_NMRT:'土地移轉持分分子', TRAN_RATE_DNT:'土地移轉持分分母',
    REF_UNIT_CD:'契稅受理單位代碼', CONTRCT_TP:'契約類別代碼', HOU_LOSN:'房屋稅籍編號', HOU_LOC:'房屋坐落',
    CONTRCT_DATE:'訂約日期（民國七碼）', LEVY_MODE:'課稅方式代碼', SEC_CHI_NM:'段名', SSC_CHI_NM:'小段名',
    PUB_FACs:'共有部分筆數', PUB_FAC_SHR_NMRT_1:'共有部分持分分子', PUB_FAC_SHR_DNT_1:'共有部分持分分母',
    PUB_FAC_CNSTRT_NO_1:'共有部分建號（依官方格式）', PUB_FAC_AREA_1:'共有部分面積',
    O_HOLDERS:'原所有權人筆數', N_HOLDERS:'新所有權人筆數', AGT_IDN:'報稅代理人身分編號',
    AGENT_IDN_BAN:'報稅代理人身分編號', AGENT_NM:'報稅代理人姓名', AGENT_ADD:'報稅代理人地址',
    AGENT_TEL:'報稅代理人電話', AGENT_TEL_NO:'報稅代理人電話'
  };
  const required = {
    AVM001: 'HSN ORG TOWN CASE_TP TRAN_REAS TRAN_AREA LUMP_LND_AREA FLG_DATE TRD_DATE CITY_TP LND_MARK LOC_NM TRAN_RATE_NMRT TRAN_RATE_DNT TRAN_PRC OIDN_BAN_1 OIDN_NM_1 O_HOLDER_TRAN_NMRT_1 O_HOLDER_TRAN_DNT_1 O_HOLDER_HADDR_1 NIDN_BAN_1 NIDN_NM_1 N_HOLDER_TRAN_NMRT_1 N_HOLDER_TRAN_DNT_1 N_HOLDER_HADDR_1',
    CHT001: 'HSN REF_UNIT_CD CONTRCT_TP HOU_LOSN HOU_LOC CONTRCT_DATE TRAN_PRC LEVY_MODE O_HOLDER_IDN_BAN_1 O_HOLDER_NM_1 O_HOLDER_TRAN_NMRT_1 O_HOLDER_TRAN_DNT_1 O_HOLDER_HADDR_1 N_HOLDER_IDN_BAN_1 N_HOLDER_NM_1 N_HOLDER_TRAN_NMRT_1 N_HOLDER_TRAN_DNT_1 N_HOLDER_HADDR_1'
  };
  const must = Object.fromEntries(Object.entries(required).map(([id, list]) => [id, new Set(list.split(' '))]));
  const text = value => String(value ?? '').trim();
  const array = value => Array.isArray(value) ? value : [];
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const agentKey = key => /^(?:AGT_IDN|AGENT_.*)$/.test(key);
  function label(id, key) {
    if (fields[key]) return fields[key];
    if (key === 'TRAN_PRC') return id === 'AVM001' ? '移轉價格欄（須依申報來源核對計價基礎）' : '房屋契約移轉價格';
    if (/^[ON](?:_|IDN_|BORN_)/.test(key)) {
      const side = key[0] === 'O' ? '原所有權人' : '新所有權人';
      const match = [['IDN_BAN','身分編號'],['_NM_','姓名'],['BORN_DATE','出生日期（民國七碼）'],
        ['TRAN_NMRT','移轉持分分子'],['TRAN_DNT','移轉持分分母'],['HADDR','戶籍地址'],['CADDR','通訊地址'],
        ['EMAIL','電子郵件'],['TEL','電話'],['HZIP','戶籍郵遞區號'],['CZIP','通訊郵遞區號']].find(([token]) => key.includes(token));
      if (match) return side + match[1];
    }
    return '依申報來源核對';
  }
  function normalizedNumber(value) {
    const s = text(value).normalize('NFKC');
    return /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) ? s.replace(/,/g, '') : s;
  }
  function share(value) {
    const s = text(value).normalize('NFKC').replace(/\s/g, '');
    if (['全部','全筆'].includes(s)) return ['1','1'];
    const slash = /^(\d+)\/(\d+)$/.exec(s), fraction = /^(\d+)分之(\d+)$/.exec(s);
    return slash ? [slash[1],slash[2]] : fraction ? [fraction[2],fraction[1]] : ['',''];
  }
  function dateFromCase(value) {
    const s = text(value);
    const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(s);
    if (!m || Number(m[1]) < 1912 || Number(m[1]) > 2910) return s;
    return String(Number(m[1]) - 1911).padStart(3, '0') + m[2] + m[3];
  }
  function people(list) {
    const identityFields = ['name','ledgerId','ledgerBirth','ledgerHome','taxMailAddress','phone','email','v50Share','representative'];
    return array(list).filter(p => object(p) && identityFields.some(k => text(p[k])));
  }
  function personFields(person, side, id) {
    if (!person) return {};
    const [n,d] = share(person.v50Share);
    return {
      [side + '_HOLDERS']:'1', [id === 'AVM001' ? side + 'IDN_BAN_1' : side + '_HOLDER_IDN_BAN_1']:person.ledgerId,
      [id === 'AVM001' ? side + 'IDN_NM_1' : side + '_HOLDER_NM_1']:person.name,
      [side + 'BORN_DATE_1']:dateFromCase(person.ledgerBirth), [side + '_HOLDER_TRAN_NMRT_1']:n, [side + '_HOLDER_TRAN_DNT_1']:d,
      [side + '_HOLDER_TEL_1']:person.phone, [side + '_HOLDER_HADDR_1']:person.ledgerHome, [side + '_HOLDER_CADDR_1']:person.taxMailAddress,
      [side + '_EMAIL_ADDR_1']:person.email
    };
  }
  function scopeOf(work, agency) {
    const prop = p => [p?.kind, p?.city, p?.district, p?.section, p?.subSection, p?.number, !!p?.common, p?.commonOf];
    const pers = p => [p.role, p.name, p.ledgerId];
    // These identifiers already belong to this case. Compare exact identities before reusing manual fields.
    return JSON.stringify([array(work.v50Props).map(prop), people(work.sellers).map(pers), people(work.buyers).map(pers),
      work.v50Reg?.type || work.ledgerService, agency.mode, agency.roles?.tax, agency.primary, agency.profiles?.primary?.id,
      ...(agency.mode === 'dual' ? [agency.secondary,agency.profiles?.secondary?.id] : [])]);
  }
  function validate(key, value) {
    if (value.length > 2000 || /[\x00-\x1f\x7f]/.test(value)) return '含有換行、控制字元或超過 2,000 字';
    if (!value) return '';
    if (/IDN_BAN|^AGT_IDN$/.test(key) && !/^(?:[A-Z][A-Z0-9]\d{8}|\d{8})$/.test(value)) return '身分編號含遮罩或不符支援格式';
    if (/_DATE$|BORN_DATE_\d+$/.test(key)) {
      if (!/^\d{7}$/.test(value)) return '請輸入七碼民國年月日';
      const yr = Number(value.slice(0,3)), m = Number(value.slice(3,5)), d = Number(value.slice(5));
      const dt = new Date(Date.UTC(yr + 1911, m-1, d));
      if (!yr || dt.getUTCFullYear() !== yr + 1911 || dt.getUTCMonth() !== m-1 || dt.getUTCDate() !== d) return '日期無效';
    }
    if (/(?:_NMRT|_DNT)(?:_\d+)?$/.test(key) && !/^[1-9]\d{0,11}$/.test(value)) return '持分必須是正整數';
    if (/^(?:TRAN_PRC|TRAN_AREA|LUMP_LND_AREA|(?:PUB_FAC|HOU|SUB)_AREA_\d+)$/.test(key) && !/^\d{1,14}(?:\.\d{1,8})?$/.test(value)) return '請輸入有效面積或金額';
    if (key === 'HOU_FLOORs' && !/^[012]$/.test(value)) return '樣本最多兩筆樓層';
    return '';
  }
  function agencyFields(agency) {
    const key = agency.mode === 'dual' ? agency.roles?.tax : 'primary';
    if (!['primary','secondary'].includes(key) || !agency.verified?.tax) return null;
    const name = text(agency[key]), profile = agency.profiles?.[key] || {};
    if (!name) return null;
    return { AGENT_NM:name, AGENT_ADD:profile.address, AGENT_TEL:profile.phone, AGENT_TEL_NO:profile.phone, AGT_IDN:profile.id, AGENT_IDN_BAN:profile.id };
  }
  function propertyName(p) {
    return [p.city,p.district,p.section,p.subSection,p.number && p.number + (p.kind === '土地' ? '地號' : '建號'),p.address].map(text).filter(Boolean).join(' ');
  }
  function plan(work, agency) {
    const reg = work.v50Reg || {}, draft = reg.online?.tax || {}, issues = [];
    const scope = scopeOf(work,agency), stale = !!draft.scope && draft.scope !== scope;
    const packageId = text(draft.packageId);
    const header = !stale && Array.isArray(draft.header) && draft.header.length === 11 ? draft.header : Array(11).fill('');
    const props = array(work.v50Props).filter(object), lands = props.filter(p => p.kind === '土地'),
      buildings = props.filter(p => p.kind === '建物' && !p.common), commons = props.filter(p => p.kind === '建物' && p.common);
    const sellers = people(work.sellers), buyers = people(work.buyers), owner = p => p.role !== '代理人';
    const orig = sellers.filter(owner), next = buyers.filter(owner);
    const type = text(reg.type || work.ledgerService), agent = agencyFields(agency);
    if (stale) issues.push('本案標的、當事人或報稅分工已有變更，請清除舊補欄後重新核對。');
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(packageId) || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(packageId)) issues.push('請填英文字母開頭的本案包識別碼，可用英數、底線與連字號。');
    if (!header.some(v => text(v))) issues.push('請依本案可信來源填寫 HEADER 11 欄。');
    if (header.some(v => typeof v !== 'string' || validate('HEADER', v))) issues.push('HEADER 含不適用的文字或控制字元。');
    if (!lands.length && !buildings.length) issues.push('請先新增土地或主建物。');
    if (!['買賣','贈與'].includes(type) && !['所有權買賣移轉登記','所有權贈與移轉登記','買賣移轉登記','贈與移轉登記'].includes(type)) issues.push('本候選限單純買賣、贈與，請先確認本案登記原因。');
    const singleGroup = props.length === array(work.v50Props).length && props.every(p => ['土地','建物'].includes(p.kind)) &&
      lands.length <= 1 && buildings.length <= 1 && commons.length <= 1;
    if (!singleGroup)
      issues.push('此樣本最多各一筆土地、主建物與已配對共有部分。請用下方填報資料逐筆辦理。');
    const commonMatched = !commons.length || (buildings.length === 1 && !!text(buildings[0].section) && commons.every(p =>
      !!text(p.commonOf) && text(p.commonOf) === text(buildings[0].number) && ['city','district','section','subSection'].every(k => text(p[k]) === text(buildings[0][k]))));
    if (!commonMatched)
      issues.push('共有部分與主建物的段、小段或主建號尚未能一對一核對。');
    if (props.some(p => !/^[台臺]南市$/.test(text(p.city)) || !text(p.number))) issues.push('請在標的明細確認每筆均為臺南市並填具地號／建號。');
    if (orig.length !== 1 || next.length !== 1) issues.push('此樣本每一方各一位所有權人；多人案件請用填報資料逐人辦理。');
    if ([...orig,...next].some(p => (p.role && p.role !== '本人') || p.representative)) issues.push('本案含其他身分或代表關係，請另核對相應申報欄位。');
    if ([...sellers,...buyers].some(p => p.role === '代理人' && (!agent || text(p.name) !== agent.AGENT_NM || (text(p.ledgerId) && text(p.ledgerId) !== text(agent.AGT_IDN)))))
      issues.push('買賣方另有代理人，其委任範圍超出本樣本的一組代理人欄。');
    if (!agent || !text(agent.AGT_IDN)) issues.push('請在地政士分工確認本項受任人、身分編號及涵蓋本案申報的授權。');
    const documents = [];
    function add(id, property, source) {
      const values = stale ? {} : draft.values?.[id] || {};
      const mapped = {...source, ...personFields(orig[0],'O',id), ...personFields(next[0],'N',id), ...agent};
      const entries = format.keys[id].map(key => {
        const locked = agentKey(key) || ['O_HOLDERS','N_HOLDERS','PUB_FACs'].includes(key);
        const edited = !locked && Object.hasOwn(values,key);
        const sourceValue = text(mapped[key]), value = edited ? String(values[key] ?? '') : sourceValue;
        const needed = must[id].has(key) || (id === 'CHT001' && commons.length > 0 && /^(?:PUB_FAC_(?:SHR_NMRT|SHR_DNT|CNSTRT_NO|AREA)_1)$/.test(key));
        const priorSource = draft.sources?.[id]?.[key];
        const sourceChanged = edited && priorSource !== undefined && sourceValue !== priorSource;
        const error = sourceChanged ? '案件原欄已變更，請恢復帶入或重填核對值' : validate(key,value) || (needed && !value.trim() ? '待補' : '');
        return { key,value,sourceValue,error,needed,locked,edited,label:label(id,key),from:edited ? '本案補欄' : value ? '本案帶入' : '' };
      });
      const byKey = Object.fromEntries(entries.map(f => [f.key,f]));
      for (const f of entries.filter(f => /_NMRT(?:_\d+)?$/.test(f.key))) {
        const d = byKey[f.key.replace('_NMRT','_DNT')];
        if (d && !f.error && !d.error && (Boolean(f.value) !== Boolean(d.value) || (f.value && BigInt(f.value) > BigInt(d.value)))) f.error = '持分分子或分母缺漏，或分子大於分母';
      }
      documents.push({id, name:names[id], property:propertyName(property), entries});
    }
    const canMap = singleGroup && commonMatched && orig.length <= 1 && next.length <= 1;
    if (canMap && lands.length) {
      const land = lands[0], [n,d] = share(land.transferShare);
      add('AVM001',land,{TRAN_AREA:normalizedNumber(land.landDraft?.transferArea), LUMP_LND_AREA:normalizedNumber(land.area), TRD_DATE:dateFromCase(reg.contractDate), TRAN_RATE_NMRT:n, TRAN_RATE_DNT:d});
    }
    if (canMap && buildings.length) {
      const b = buildings[0], c = commons[0], [n,d] = share(c?.transferShare);
      add('CHT001',b,{HOU_LOSN:b.deedDraft?.taxNo, HOU_LOC:b.deedDraft?.houseAddress, CONTRCT_DATE:dateFromCase(reg.contractDate),
        TRAN_PRC:normalizedNumber(b.deedDraft?.transferPrice), SEC_CHI_NM:b.section, SSC_CHI_NM:b.subSection,
        PUB_FACs:String(commons.length), PUB_FAC_SHR_NMRT_1:n, PUB_FAC_SHR_DNT_1:d, PUB_FAC_AREA_1:normalizedNumber(c?.mainArea || c?.area)});
    }
    const missing = documents.reduce((sum, doc) => sum + doc.entries.filter(f => f.error).length, 0);
    return {scope,stale,packageId,header,documents,issues,missing,ok:!issues.length && !missing && documents.length > 0};
  }
  function archive(work,agency,reviewed) {
    const result = plan(work,agency);
    if (!result.ok || reviewed !== true) throw Error('請補齊各稅資料並逐欄覆核後產檔。');
    const path = id => result.packageId + '/' + id + '_' + result.packageId + '.csv';
    const quoted = s => /[,"]/.test(s) ? '"' + s.replaceAll('"','""') + '"' : s;
    const parts = [{name:path('HEADER'),bytes:format.encodeBig5Strict(result.header.map(quoted).join(',') + '\r\n')}];
    for (const doc of result.documents) {
      const lines = doc.entries.map(f => {
        try { format.encodeBig5Strict(f.value); } catch (e) { throw Error(doc.name + ' ' + f.key + '：' + e.message); }
        return f.key + '=' + f.value;
      });
      parts.push({name:path(doc.id),bytes:format.encodeBig5Strict(lines.join('\r\n'))});
    }
    return {filename:result.packageId + '.zip',bytes:format.writeFilingArchive(parts)};
  }
  function worksheetSections(work,agency,result = plan(work,agency)) {
    const reg = work.v50Reg || {}, groups = [];
    function section(category,title,target,detail,pairs,refs=[]) {
      groups.push({category,title,target,detail:text(detail),refs,
        fields:pairs.map(([label,value])=>({label,value:text(value)}))});
    }
    section('本案','本案',work,'', [['案件／標的',work.propertyName || work.address],['登記原因',reg.type || work.ledgerService],['公契立約日期',reg.contractDate]]);
    const agent = agencyFields(agency);
    section('本案','本案報稅分工',agency,'', [['實際受任人',agent?.AGENT_NM],['身分編號',agent?.AGT_IDN],['地址',agent?.AGENT_ADD],['電話',agent?.AGENT_TEL]]);
    for (const [caption,list] of [['原所有權人側',people(work.sellers)],['新所有權人側',people(work.buyers)]]) {
      list.forEach((p,i) => section('當事人',caption + ' ' + (i+1),p,p.name, [['與本案關係',p.role],['姓名／名稱',p.name],['身分編號',p.ledgerId],
        ['出生日期',p.ledgerBirth],['戶籍／登記地址',p.ledgerHome],['通訊地址',p.taxMailAddress],['電話',p.phone],['電子郵件',p.email],['移轉持分',p.v50Share]]));
    }
    const properties = array(work.v50Props).filter(object);
    const singleParcel = properties.filter(p => p.kind === '土地').length === 1;
    for (const [i,p] of properties.entries()) {
      const kind = p.common ? '共有部分' : p.kind || '標的';
      const rows = [['坐落',propertyName(p)],['縣市',p.city],['鄉鎮市區',p.district],['段',p.section],['小段',p.subSection],
        [p.kind==='土地'?'地號':'建號',p.number],['移轉持分',p.transferShare],['登載面積（㎡）',p.kind === '建物' ? p.mainArea || p.area : p.area]];
      if (p.kind === '土地') {
        const d = p.landDraft || {};
        rows.push(['受理分局',d.branch ?? (singleParcel ? reg.taxDraft?.land?.branch : '')],['本次移轉原因',d.reason ?? (singleParcel ? reg.taxDraft?.land?.reason : '')],
          ['本筆契約金額（元）',d.contractAmount],['移轉面積（㎡）',d.transferArea],['前次移轉日期',d.previousDate],
          ['前次現值／原規定地價（元／㎡）',d.previousUnitValue],['申報移轉現值方式',d.declaredMode],['申報單價（元／㎡）',d.declaredUnitValue]);
      } else if (p.common) rows.push(['所屬主建號',p.commonOf]);
      else {
        const d = p.deedDraft || {};
        rows.push(['建物登記門牌',p.address],['附屬建物合計（㎡）',p.attachedArea],['稅籍編號',d.taxNo],['稅單所載門牌',d.houseAddress],['契稅契別',d.caseType],['契約移轉價格（元）',d.transferPrice],['申報日期',d.filingDate]);
      }
      const refs = root.HGDeskTax?.taxSources(work,p).refs || [];
      section(kind,kind + ' ' + (i+1),p,propertyName(p),rows,refs);
    }
    if (!result.stale) for (const doc of result.documents) {
      const edited = doc.entries.filter(f => f.edited && f.value);
      if (edited.length) section('媒體補欄',doc.name + '｜承辦人另填的媒體欄位',doc.id,'',edited.map(f => [f.key + ' ' + f.label,f.value]));
    }
    return groups;
  }
  function worksheet(work,agency) {
    const lines=['臺南不動產移轉｜地方稅人工填報資料','請依原件逐欄核對後，在官方入口填報。'];
    for(const group of worksheetSections(work,agency)){
      lines.push('',group.title,...group.fields.map(f=>f.label+'：'+(f.value||'待核對')));
      if(group.refs.length)lines.push('謄本核對資料',...group.refs);
    }
    return lines.join('\r\n') + '\r\n';
  }
  function download(content, filename, type) {
    const url = URL.createObjectURL(new Blob([content], {type}));
    const a = document.createElement('a');
    try {
      a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    } finally { a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  const component = {
    props:{work:{type:Object,required:true},agency:{type:Object,required:true}}, emits:['prepared'],
    setup(props,{emit}) {
      const result = Vue.computed(() => plan(props.work,props.agency));
      const draft = Vue.computed(() => props.work.v50Reg.online.tax);
      const reviewed = Vue.ref(false), msg = Vue.ref(''), pasted = Vue.ref(''), filter = Vue.ref('priority');
      const comparison = Vue.shallowRef(null), comparing = Vue.ref(false), compareError = Vue.ref('');
      const sheet=Vue.computed(()=>worksheetSections(props.work,props.agency,result.value));
      const categories=Vue.computed(()=>[...new Set(sheet.value.map(g=>g.category))]);
      const chosen=Vue.shallowRef(null), selected=Vue.computed(()=>sheet.value.find(g=>g.target===chosen.value)||null);
      const copyMessage=Vue.ref(''), copyFallback=Vue.ref(''), copyInput=Vue.ref(null);
      let copyVersion=0;
      function clearCopy() { copyVersion++; copyMessage.value=''; copyFallback.value=''; }
      function choose(index) { clearCopy(); chosen.value=sheet.value[index]?.target??null; }
      async function copyField(field) {
        const group=selected.value;
        if(!group?.fields.includes(field) || !field.value)return;
        clearCopy(); const version=copyVersion;
        try {
          await navigator.clipboard.writeText(field.value);
          if(version===copyVersion)copyMessage.value='已複製'+field.label+'。';
        } catch {
          if(version!==copyVersion)return;
          copyFallback.value=field.value;
          copyMessage.value='已選取'+field.label+'，請按 Ctrl+C、⌘C 或長按複製。';
          await Vue.nextTick();
          if(version===copyVersion){copyInput.value?.focus();copyInput.value?.select();}
        }
      }
      Vue.watch(selected,clearCopy,{flush:'sync'});
      let compareToken = 0;
      function clearComparison() { compareToken++; comparison.value=null; comparing.value=false; compareError.value=''; }
      Vue.watch(result,() => { reviewed.value = false; msg.value = ''; },{flush:'sync'});
      Vue.watch(() => props.work, () => { pasted.value = ''; filter.value = 'priority'; choose(-1); clearComparison(); },{flush:'sync'});
      Vue.watch(() => result.value.documents.map(d=>d.id).join('|'),clearComparison,{flush:'sync'});
      Vue.onBeforeUnmount(()=>{clearComparison();clearCopy();});
      async function compareFile(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        clearComparison();
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { compareError.value = '請選 10 MiB 以內的 ZIP。'; return; }
        const token = compareToken;
        comparing.value = true;
        try {
          const compared = await format.compareArchive(await file.arrayBuffer(),result.value.documents.map(d=>d.id));
          if (token === compareToken) comparison.value = compared;
        } catch { if (token === compareToken) compareError.value = '無法比對；請確認 ZIP 完整且採一般儲存或 Deflate 壓縮。'; }
        finally { if (token === compareToken) comparing.value = false; }
      }
      function edit(callback) {
        if (result.value.stale) return;
        draft.value.scope = result.value.scope;
        callback(draft.value);
      }
      function changePackage(value) { edit(d => { d.packageId = value; }); }
      function changeHeader(i,value) { edit(d => { d.header = result.value.header.map((v,k) => k === i ? value : v); }); }
      function applyHeader() {
        try {
          const values = format.parseHeader(pasted.value);
          if (values.some(v => validate('HEADER',v))) throw Error('標頭欄位含換行、控制字元或過長。');
          edit(d => { d.header = values; }); pasted.value = ''; msg.value = '已解析本案 11 個標頭欄位，請逐欄核對。';
        } catch (e) { msg.value = e.message; }
      }
      function changeField(id,key,value) {
        const field = result.value.documents.find(doc => doc.id === id)?.entries.find(f => f.key === key);
        if (!field || field.locked) return;
        edit(d => {
          d.sources = {...d.sources,[id]:{...d.sources?.[id],[key]:field.sourceValue}};
          d.values = {...d.values,[id]:{...d.values?.[id],[key]:value}};
        });
      }
      function restoreField(id,key) {
        edit(d => {
          if (d.values?.[id]) delete d.values[id][key];
          if (d.sources?.[id]) delete d.sources[id][key];
        });
      }
      function reset() {
        if (confirm('清除這個案件的網報補欄、標頭及包識別碼，改依目前標的與人員重新帶入？')) { props.work.v50Reg.online.tax = {}; pasted.value = ''; }
      }
      function makeZip() {
        try {
          const file = archive(props.work, props.agency,reviewed.value);
          download(file.bytes,file.filename,'application/zip');
          emit('prepared',file.filename);
          msg.value = '已產生 ' + file.filename + '。官方是否受理請依各稅官方收件回執登錄。';
        } catch (e) { msg.value = e.message; }
      }
      function makeSheet() {
        try {
          const filename = (result.value.packageId || '本案').replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,80) + '-地方稅填報資料.txt';
          download('\uFEFF' + worksheet(props.work,props.agency),filename,'text/plain;charset=utf-8');
          msg.value = '已下載逐筆填報資料，可依原件於官方入口建檔。';
        } catch (e) { msg.value = e.message; }
      }
      function visible(doc) {
        return filter.value === 'all' ? doc.entries : filter.value === 'missing' ? doc.entries.filter(f => f.error) : doc.entries.filter(f => f.needed || f.value || f.error);
      }
      return {result,reviewed,msg,pasted,filter,visible,changePackage,changeHeader,applyHeader,changeField,restoreField,reset,makeZip,makeSheet,
        sheet,categories,selected,choose,copyMessage,copyFallback,copyInput,copyField,
        comparison,comparing,compareError,compareFile,clearComparison};
    },
    template: `
      <div class="d10-tax-online">
        <p>本案土地、建物與當事人可直接帶入。承辦人可下載逐筆資料在官方畫面建檔，也可依樣本格式準備整批 ZIP。</p>
        <p><button type="button" class="btn sm" @click="makeSheet" data-testid="d10-tax-worksheet">下載逐筆填報資料（文字）</button>　
          <a href="https://net.tax.nat.gov.tw/PLRX/Lrx200d01/index.html" target="_blank" rel="noopener noreferrer">開啟地方稅網路申報</a></p>
        <details class="d9-work" data-testid="d12-copy-panel"><summary>逐欄複製到官方申報畫面</summary>
          <label>選擇要填報的當事人或標的
            <select data-testid="d12-copy-group" :value="sheet.indexOf(selected)" @change="choose(Number($event.target.value))">
              <option value="-1">請選擇資料</option>
              <optgroup v-for="category in categories" :key="category" :label="category">
                <option v-for="g in sheet.filter(g=>g.category===category)" :key="sheet.indexOf(g)" :value="sheet.indexOf(g)">{{g.title}}{{g.detail?' · '+g.detail:''}}</option>
              </optgroup>
            </select>
          </label>
          <div v-if="selected" data-testid="d12-copy-fields">
            <div v-for="f in selected.fields" :key="f.label" class="d9-actions" :data-copy-label="f.label">
              <span>{{f.label}}　{{f.value||'待核對'}}</span><button type="button" class="mini" :aria-label="'複製'+f.label" :disabled="!f.value" @click="copyField(f)">複製</button>
            </div>
            <details v-if="selected.refs.length"><summary>謄本原載及試算參考</summary><div v-for="(line,i) in selected.refs" :key="i">{{line}}</div></details>
          </div>
          <p v-if="copyMessage" role="status" data-testid="d12-copy-status">{{copyMessage}}</p>
          <input v-if="copyFallback" ref="copyInput" :value="copyFallback" readonly aria-label="手動複製文字" data-testid="d12-copy-fallback" @focus="$event.target.select()">
        </details>
        <details class="d9-work"><summary>比對既有申報 ZIP 的格式（本機唯讀）</summary>
          <p>可選一份曾受理的 ZIP，比對本版候選的欄位、順序、編碼與換行。樣包在瀏覽器記憶體讀取，結果僅列格式差異；案件資料與受理代碼請依本案核對。</p>
          <label>選取本機 ZIP（10 MiB 以內）<input type="file" accept=".zip,application/zip" @change="compareFile" data-testid="d10-tax-compare"></label>
          <p v-if="comparing || compareError" role="status">{{compareError || '比對中…'}}</p>
          <div v-if="comparison" data-testid="d10-tax-compare-result">
            <p>識別到 {{comparison.groupCount}} 組案件檔名。<span v-if="comparison.missingFiles.length">本案預期、樣包未見：{{comparison.missingFiles.join('、')}}。</span></p>
            <ul><li v-for="(row,i) in comparison.rows" :key="i">
              <b>{{row.id}}</b> · {{row.shape}} · 樣包 {{row.count ?? '待核'}} 欄／本版 {{row.expected}} 欄 · {{row.encoding}} · {{row.newline}}
              <span v-if="!row.inCurrent">（本案目前未選用此稅目）</span>
              <div v-if="row.missing.length">樣包缺少本版欄名：{{row.missing.join('、')}}</div>
              <div v-if="row.extraCount || row.duplicates">樣包額外欄名 {{row.extraCount}} 個，重複欄 {{row.duplicates}} 個。</div>
            </li></ul>
            <p v-if="comparison.extraVariants || comparison.stampFiles || comparison.otherFiles">其他土增／契稅檔名版本 {{comparison.extraVariants}} 個、印花稅 {{comparison.stampFiles}} 個、未識別項目 {{comparison.otherFiles}} 個。</p>
            <p v-if="comparison.pathDifferences || comparison.repeated">路徑或命名形式不同 {{comparison.pathDifferences}} 個，同類檔重複 {{comparison.repeated}} 個。</p>
            <button type="button" class="btn sm" @click="clearComparison">清除比對結果</button>
          </div>
        </details>
        <details class="d9-work"><summary>準備土地增值稅／契稅媒體 ZIP（待官方試匯）</summary>
          <p>官方手冊列有代書軟體的「整批案件上傳」。本工具依既有樣本整理 Big5、HEADER、AVM001 及 CHT001。現行標頭、欄位代碼及必填條件仍待官方核對。本包限土增稅與契稅，印花稅請依本案另行辦理。</p>
          <p><a href="https://net.tax.nat.gov.tw/PLRX/Lrx200d01/download.html" target="_blank" rel="noopener noreferrer">財政部操作手冊下載</a> ·
            <a href="https://www.tax.taichung.gov.tw/media/plwftul0/m035-acs-use-001.pdf?mediaDL=true" target="_blank" rel="noopener noreferrer">整批上傳說明（第 1.8 節）</a></p>
          <p v-if="result.stale" class="warn">案件識別資料已變更，舊補欄暫停套用。 <button type="button" class="btn sm" @click="reset">清除舊補欄並重新帶入</button></p>
          <fieldset :disabled="result.stale">
            <label>本案包識別碼（英文開頭）<input data-testid="d10-tax-package" :value="result.packageId" maxlength="80" @input="changePackage($event.target.value)" placeholder="例 HG20260001"></label>
            <details class="d9-work"><summary>案件標頭 HEADER（11 欄）</summary>
              <p>依本案已核對的申報來源填入，保留來源的空欄。公開手冊未列各欄定義，請勿沿用他案標頭。</p>
              <label>貼上本案一列 CSV 標頭<textarea rows="2" v-model="pasted"></textarea></label>
              <button type="button" class="btn sm" @click="applyHeader" :disabled="!pasted.trim()">帶入 11 欄</button>
              <div class="grid"><label v-for="(v,i) in result.header" :key="i">標頭 {{i+1}}<input :value="v" maxlength="2000" @input="changeHeader(i,$event.target.value)"></label></div>
            </details>
            <label>顯示明細欄位<select v-model="filter"><option value="priority">已帶入與待補重點</option><option value="missing">只看待補／格式有誤</option><option value="all">全部樣本欄位（含減免及旗標）</option></select></label>
            <details v-for="doc in result.documents" :key="doc.id" class="d9-work"><summary>{{doc.name}} · {{doc.property || '請補標的'}} · {{doc.entries.filter(f=>f.error).length}} 欄待補或有誤</summary>
              <div class="grid"><label v-for="f in visible(doc)" :key="f.key">{{f.label}} <small>{{f.key}} · {{f.error || f.from || '選填待核'}}</small>
                <input :value="f.value" :readonly="f.locked" maxlength="2000" :aria-invalid="!!f.error" @input="changeField(doc.id,f.key,$event.target.value)">
                <button v-if="f.edited" type="button" class="mini" @click="restoreField(doc.id,f.key)">恢復案件帶入</button>
              </label></div>
            </details>
          </fieldset>
          <ul v-if="result.issues.length"><li v-for="issue in result.issues" :key="issue">{{issue}}</li></ul>
          <p v-if="result.missing">各稅明細合計 {{result.missing}} 欄待補或有誤。可展開稅目逐欄補正。</p>
          <label><input type="checkbox" :disabled="!result.ok" v-model="reviewed" data-testid="d10-tax-reviewed"> 已依本案來源核對標頭、各稅所有欄位、空值及代理授權，了解官方尚待試匯。</label>
          <button type="button" class="btn sm" :disabled="!result.ok || !reviewed" @click="makeZip" data-testid="d10-tax-zip">產生樣本格式 ZIP</button>
        </details>
        <p v-if="msg" role="status">{{msg}}</p>
      </div>`
  };
  root.HGOnlineTax = Object.freeze({component, plan, archive, worksheet});
})(typeof window === 'object' ? window : globalThis);
